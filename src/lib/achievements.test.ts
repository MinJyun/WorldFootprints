import { describe, expect, it } from "vitest";
import { CONTINENT_OF, computeAchievements, visibleAchievements } from "./achievements";
import { ALL_COUNTRY_CODES, DRILLDOWNS, type Trip, type TripKind } from "./places";

let seq = 0;
function trip(places: (string | [string, "transit"])[], start: string | null = null, kind: TripKind = "trip"): Trip {
  return {
    id: String(++seq),
    kind,
    title: null,
    start_date: start,
    end_date: start,
    note: null,
    places: places.map((p) => (typeof p === "string" ? { key: p, transit: false } : { key: p[0], transit: true })),
  };
}

const get = (trips: Trip[], id: string) => computeAchievements(trips).find((a) => a.id === id);

describe("國家次數", () => {
  it("第 5 趟達成,日期是第 5 趟(依旅遊日期,不是建立順序)", () => {
    const trips = ["2020-01-01", "2024-05-01", "2019-03-01", "2022-07-01", "2021-02-01"].map((d) => trip(["JP-13"], d));
    expect(get(trips, "country-JP-5")).toMatchObject({ unlocked: true, date: "2024-05-01", progress: 5, name: "日本初級旅人" });
    expect(get(trips, "country-JP-10")).toMatchObject({ unlocked: false, progress: 5, date: null });
  });

  it("4 趟未達成,顯示進度", () => {
    const trips = [1, 2, 3, 4].map(() => trip(["JP"]));
    expect(get(trips, "country-JP-5")).toMatchObject({ unlocked: false, progress: 4 });
  });

  it("路過、生活過不算旅遊次數", () => {
    const trips = [
      ...[1, 2, 3, 4].map(() => trip(["JP"])),
      trip([["JP", "transit"], "KR"]),
      trip(["JP"], null, "lived"),
    ];
    expect(get(trips, "country-JP-5")?.progress).toBe(4);
  });

  it("沒旅遊過的國家不列出", () => {
    expect(get([trip([["JP", "transit"], "KR"])], "country-JP-5")).toBeUndefined();
  });

  it("達標那趟沒填日期:已達成但日期為 null", () => {
    const trips = [1, 2, 3, 4].map((i) => trip(["JP"], `2020-0${i}-01`));
    trips.push(trip(["JP"]));
    expect(get(trips, "country-JP-5")).toMatchObject({ unlocked: true, date: null });
  });
});

describe("國家數與洲", () => {
  it("去過 5 國,路過不算", () => {
    const trips = [trip(["JP", "KR", "TH", "VN"], "2020-01-01"), trip([["SG", "transit"]], "2021-01-01")];
    expect(get(trips, "countries-5")).toMatchObject({ unlocked: false, progress: 4 });
    trips.push(trip(["FR"], "2022-01-01"));
    expect(get(trips, "countries-5")).toMatchObject({ unlocked: true, date: "2022-01-01" });
  });

  it("每洲首訪;俄羅斯、土耳其兩洲都算", () => {
    const trips = [trip(["RU"], "2020-01-01")];
    expect(get(trips, "continent-EU")?.unlocked).toBe(true);
    expect(get(trips, "continent-AS")?.unlocked).toBe(true);
    expect(get(trips, "continent-AF")?.unlocked).toBe(false);
  });

  it("六大洲制霸不需要南極洲", () => {
    const trips = [trip(["JP", "FR", "EG", "US", "BR"]), trip(["AU"], "2023-01-01")];
    expect(get(trips, "continents-6")).toMatchObject({ unlocked: true, progress: 6 });
  });

  it("每個國家代碼都對得到洲", () => {
    const missing = ALL_COUNTRY_CODES.filter((c) => !CONTINENT_OF.has(c));
    expect(missing).toEqual([]);
  });
});

describe("地區制霸", () => {
  it("過半與制霸,目標跟著行政區總數", () => {
    const total = DRILLDOWNS.KR.total; // 17
    const codes = ["11", "26", "27", "28", "29", "30", "31", "41", "42"]; // 9 個
    const trips = codes.map((c, i) => trip([`KR-${c}`], `2020-01-${String(i + 1).padStart(2, "0")}`));
    expect(get(trips, "regions-KR-half")).toMatchObject({ target: Math.ceil(total / 2), unlocked: true, date: "2020-01-09" });
    expect(get(trips, "regions-KR-all")).toMatchObject({ target: total, progress: 9, unlocked: false });
  });

  it("美國華盛頓特區不計入 50 州", () => {
    expect(get([trip(["US-DC", "US-CA"])], "regions-US-half")?.progress).toBe(1);
  });

  it("沒去過的國家不列出", () => {
    expect(get([trip(["JP"])], "regions-KR-half")).toBeUndefined();
  });
});

describe("生活與旅遊習慣", () => {
  it("生活過 2 國", () => {
    const trips = [trip(["TW"], "2000-01-01", "lived"), trip(["JP"], "2015-04-01", "lived")];
    expect(get(trips, "lived-2")).toMatchObject({ unlocked: true, date: "2015-04-01" });
  });

  it("同一年 5 趟", () => {
    const trips = ["01", "03", "05", "07"].map((m) => trip(["JP"], `2023-${m}-01`));
    trips.push(trip(["KR"], "2024-01-01"));
    expect(get(trips, "year-5")?.progress).toBe(4);
    trips.push(trip(["KR"], "2023-12-01"));
    expect(get(trips, "year-5")).toMatchObject({ unlocked: true, date: "2023-12-01" });
  });

  it("連續年份:中斷就重算", () => {
    const trips = ["2018", "2019", "2021", "2022", "2023"].map((y) => trip(["JP"], `${y}-06-01`));
    expect(get(trips, "streak-3")).toMatchObject({ unlocked: true, date: "2023-06-01" });
    expect(get(trips, "streak-5")?.progress).toBe(3);
  });

  it("一趟三國:路過與同國多個地區不重複算", () => {
    expect(get([trip(["JP-13", "JP-27", "KR", ["TW", "transit"]])], "multi-3")?.progress).toBe(2);
    expect(get([trip(["JP-13", "KR", "TW"])], "multi-3")?.unlocked).toBe(true);
  });

  it("生活過的紀錄不算旅遊習慣", () => {
    expect(get([trip(["JP", "KR", "TW"], "2020-01-01", "lived")], "multi-3")?.progress).toBe(0);
  });
});

describe("visibleAchievements", () => {
  it("同系列只顯示已達成的與下一個", () => {
    const trips = [1, 2, 3, 4, 5, 6].map(() => trip(["JP"]));
    const ids = visibleAchievements(computeAchievements(trips)).map((a) => a.id);
    expect(ids).toContain("country-JP-5");
    expect(ids).toContain("country-JP-10");
    expect(ids).not.toContain("country-JP-20");
  });
});
