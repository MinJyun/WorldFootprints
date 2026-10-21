import { describe, expect, it } from "vitest";
import {
  LEGEND,
  computeStats,
  formatDates,
  hasVisited,
  placeName,
  sortTrips,
  statColor,
  statLabel,
  toTrip,
  tripTitle,
  type Trip,
  type TripKind,
} from "./places";

let seq = 0;
function trip(places: (string | [string, "transit"])[], opts: Partial<Trip> & { kind?: TripKind } = {}): Trip {
  return {
    id: String(++seq),
    kind: "trip",
    title: null,
    start_date: null,
    end_date: null,
    note: null,
    places: places.map((p) => (typeof p === "string" ? { key: p, transit: false } : { key: p[0], transit: true })),
    spots: [],
    ...opts,
  };
}

describe("computeStats", () => {
  it("每趟旅程對同一地點只算一次", () => {
    const stats = computeStats([trip(["JP-13", "JP-27"]), trip(["JP-13"])]);
    expect(stats.get("JP-13")).toEqual({ trips: 2, transits: 0, lived: false });
    expect(stats.get("JP-27")?.trips).toBe(1);
    // 一趟去了兩個縣,日本仍只算一次
    expect(stats.get("JP")?.trips).toBe(2);
  });

  it("只有路過:算路過,不算去過", () => {
    const stats = computeStats([trip([["CZ", "transit"], "DK"])]);
    expect(stats.get("CZ")).toEqual({ trips: 0, transits: 1, lived: false });
    expect(hasVisited(stats.get("CZ"))).toBe(false);
    expect(hasVisited(stats.get("DK"))).toBe(true);
  });

  it("同一趟在某國有停留也有路過:該國算去過", () => {
    const stats = computeStats([trip([["US-CA", "transit"], "US-NY"])]);
    expect(stats.get("US")).toEqual({ trips: 1, transits: 0, lived: false });
    expect(stats.get("US-CA")).toEqual({ trips: 0, transits: 1, lived: false });
    // 路過排在停留之後也一樣
    expect(computeStats([trip(["US-NY", ["US-CA", "transit"]])]).get("US")).toEqual({ trips: 1, transits: 0, lived: false });
  });

  it("生活過不計入旅遊次數,但算去過", () => {
    const stats = computeStats([trip(["TW-TPE"], { kind: "lived" }), trip(["TW-TPE"])]);
    expect(stats.get("TW-TPE")).toEqual({ trips: 1, transits: 0, lived: true });
    expect(hasVisited(computeStats([trip(["TW"], { kind: "lived" })]).get("TW"))).toBe(true);
  });
});

describe("statColor", () => {
  const trips = (n: number, lived = false) => statColor({ trips: n, transits: 0, lived });
  const [livedLegend, four, twoThree, one, transit] = LEGEND;

  it("旅遊依次數分級", () => {
    expect(trips(1)).toBe(one.colors[0]);
    expect(trips(2)).toBe(twoThree.colors[0]);
    expect(trips(3)).toBe(twoThree.colors[0]);
    expect(trips(4)).toBe(four.colors[0]);
    expect(trips(10)).toBe(four.colors[0]);
  });

  it("生活過用青色系,也依旅遊次數分四級", () => {
    expect([0, 1, 2, 4].map((n) => trips(n, true))).toEqual([...livedLegend.colors]);
    expect(trips(3, true)).toBe(livedLegend.colors[2]);
  });

  it("只有路過用最暗色;沒去過沒有顏色", () => {
    expect(statColor({ trips: 0, transits: 2, lived: false })).toBe(transit.colors[0]);
    expect(statColor(undefined)).toBeUndefined();
  });
});

describe("statLabel", () => {
  it("組合各種狀態", () => {
    expect(statLabel(undefined)).toBe("還沒去過");
    expect(statLabel({ trips: 3, transits: 1, lived: true })).toBe("生活過・去過 3 次・路過 1 次");
    expect(statLabel({ trips: 0, transits: 1, lived: false })).toBe("路過 1 次");
  });
});

describe("formatDates", () => {
  const f = (start: string | null, end: string | null, kind: TripKind = "trip") =>
    formatDates({ kind, start_date: start, end_date: end });

  it("各種日期組合", () => {
    expect(f(null, null)).toBe("日期未填");
    expect(f("2025-05-19", null)).toBe("2025-05-19");
    expect(f("2025-05-19", "2025-05-19")).toBe("2025-05-19");
    expect(f("2025-05-19", "2025-05-26")).toBe("2025-05-19 ~ 2025-05-26");
  });

  it("生活過沒有結束日:至今", () => {
    expect(f("2020-01-01", null, "lived")).toBe("2020-01-01 ~ 至今");
  });
});

describe("tripTitle", () => {
  it("有標題就用標題", () => {
    expect(tripTitle(trip(["JP"], { title: "2026北歐4國之旅" }))).toBe("2026北歐4國之旅");
  });

  it("沒標題:只列停留的地點", () => {
    expect(tripTitle(trip([["CZ", "transit"], "JP-04", "JP-06"]))).toBe("宮城県、山形県");
  });

  it("全部都是路過:列路過的地點", () => {
    expect(tripTitle(trip([["AE", "transit"]]))).toBe("阿拉伯聯合大公國");
  });

  it("超過三地:縮寫", () => {
    expect(tripTitle(trip(["DK", "NO", "FI", "SE"]))).toBe("丹麥、挪威、芬蘭 等 4 地");
  });
});

describe("sortTrips", () => {
  const a = trip(["JP"], { start_date: "2024-01-01" });
  const b = trip(["JP"], { start_date: "2025-05-19", end_date: "2025-05-20" });
  const c = trip(["JP"], { start_date: "2025-05-19", end_date: "2025-05-26" });
  const none = trip(["JP"]);
  const ids = (trips: Trip[]) => trips.map((t) => t.id);

  it("新到舊;同一天出發比結束日;沒日期放最後", () => {
    expect(ids(sortTrips([none, a, b, c]))).toEqual(ids([c, b, a, none]));
  });

  it("舊到新;沒日期仍放最後", () => {
    expect(ids(sortTrips([none, c, a, b], false))).toEqual(ids([a, b, c, none]));
  });

  it("不改動原陣列", () => {
    const input = [a, c];
    sortTrips(input);
    expect(input).toEqual([a, c]);
  });
});

describe("toTrip", () => {
  it("依 position 排路線,組成地點 key", () => {
    const t = toTrip({
      id: "1",
      kind: "trip",
      title: null,
      start_date: null,
      end_date: null,
      note: null,
      trip_places: [
        { country_code: "JP", region_code: "13", transit: false, position: 1 },
        { country_code: "CZ", region_code: "", transit: true, position: 0 },
      ],
      trip_spots: [],
    });
    expect(t.places).toEqual([
      { key: "CZ", transit: true },
      { key: "JP-13", transit: false },
    ]);
  });

  it("景點依加入時間排序,去掉 created_at", () => {
    const spot = (id: string) => ({
      id, osm_id: `N${id}`, name: id, category: "food" as const, country_code: "JP", region_code: "13", lat: 35, lng: 139,
    });
    const t = toTrip({
      id: "1", kind: "trip", title: null, start_date: null, end_date: null, note: null, trip_places: [],
      trip_spots: [
        { spot: spot("b"), rating: 4, note: null, created_at: "2026-10-21T10:00:00Z" },
        { spot: spot("a"), rating: null, note: "好吃", created_at: "2026-10-21T09:00:00Z" },
      ],
    });
    expect(t.spots).toEqual([
      { spot: spot("a"), rating: null, note: "好吃" },
      { spot: spot("b"), rating: 4, note: null },
    ]);
  });
});

describe("placeName", () => {
  it("國家與各國行政區", () => {
    expect(placeName("TW")).toBe("台灣");
    expect(placeName("JP-13")).toBe("東京都");
    expect(placeName("US-CA")).toBe("加利福尼亞州");
    expect(placeName("TW-LIE")).toBe("連江縣");
    expect(placeName("TH-50")).toBe("清邁府");
    expect(placeName("VN-79")).toBe("胡志明市");
    expect(placeName("KR-11")).toBe("首爾特別市");
  });

  it("不認得的行政區顯示原始 key", () => {
    expect(placeName("TH-99")).toBe("TH-99");
  });
});
