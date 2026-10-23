import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { describe, expect, it } from "vitest";
import { numericToAlpha2, type Trip } from "./places";
import { groupTrips, homeCountry, locate, parseTimeline, planImport, toAreas, type Located } from "./timeline";

describe("parseTimeline", () => {
  it("iPhone 格式(陣列、geo: 座標)", () => {
    const json = [
      {
        startTime: "2025-10-10T23:10:00.000+04:00",
        endTime: "2025-10-11T01:00:00.000+04:00",
        visit: { topCandidate: { semanticType: "Unknown", placeLocation: "geo:25.253175,55.365673" } },
      },
      { startTime: "2025-10-12T08:00:00.000+03:00", activity: { start: "geo:41,29" } },
      {
        startTime: "2025-06-14T20:00:00.000+08:00",
        endTime: "2025-06-15T08:00:00.000+08:00",
        visit: { topCandidate: { semanticType: "Home", placeLocation: "geo:25.03,121.56" } },
      },
    ];
    expect(parseTimeline(json)).toEqual([
      { date: "2025-06-14", endDate: "2025-06-15", lat: 25.03, lng: 121.56, home: true },
      { date: "2025-10-10", endDate: "2025-10-11", lat: 25.253175, lng: 55.365673, home: false },
    ]);
  });

  it("Android 格式(semanticSegments、度數座標)", () => {
    const json = {
      semanticSegments: [
        {
          startTime: "2026-06-04T10:00:00.000+07:00",
          endTime: "2026-06-04T12:00:00.000+07:00",
          visit: { topCandidate: { semanticType: "INFERRED_HOME", placeLocation: { latLng: "18.7882068°, 98.9813773°" } } },
        },
      ],
    };
    expect(parseTimeline(json)).toEqual([
      { date: "2026-06-04", endDate: "2026-06-04", lat: 18.7882068, lng: 98.9813773, home: true },
    ]);
  });

  it("不是時間軸檔案就報錯", () => {
    expect(() => parseTimeline({ foo: 1 })).toThrow("看不懂");
  });
});

describe("locate", () => {
  const topology = JSON.parse(readFileSync("public/geo/world-50m.json", "utf8")) as Topology;
  const world = toAreas(
    (feature(topology, topology.objects.countries as GeometryCollection) as FeatureCollection<Geometry, Record<string, unknown>>)
      .features,
    (f) => numericToAlpha2(f.id),
  );

  it("陸地上的點", () => {
    expect(locate(world, 121.5645, 25.034)).toBe("TW");
    expect(locate(world, 28.9784, 41.0082)).toBe("TR");
  });

  it("海岸邊、落在簡化國界外的點往外找最近的國家", () => {
    // 杜拜棕櫚島外緣
    expect(locate(world, 55.117, 25.112)).toBe("AE");
  });

  it("跨換日線的國家(斐濟)", () => {
    expect(locate(world, 178.44, -18.14)).toBe("FJ");
  });

  it("大海中間找不到", () => {
    expect(locate(world, -150, 0)).toBeUndefined();
  });
});

function visit(date: string, country: string, key = country, home = false): Located {
  return { date, endDate: date, lat: 0, lng: 0, home, country, key };
}

describe("homeCountry", () => {
  it("優先用標記為住家的地點", () => {
    expect(homeCountry([visit("2025-01-01", "TW", "TW", true), visit("2025-01-02", "JP"), visit("2025-01-03", "JP")])).toBe("TW");
  });

  it("沒有住家標記就取停留點最多的國家", () => {
    expect(homeCountry([visit("2025-01-01", "TW"), visit("2025-01-02", "TW"), visit("2025-01-03", "JP")])).toBe("TW");
  });
});

describe("groupTrips", () => {
  it("連續待在國外合成一趟,依出現順序列地點", () => {
    const drafts = groupTrips(
      [
        visit("2025-10-09", "TW"),
        visit("2025-10-10", "AE"),
        visit("2025-10-12", "TR"),
        visit("2025-10-15", "TR"),
        visit("2025-10-20", "AE"),
        visit("2025-10-21", "TW"),
        visit("2026-06-04", "TH", "TH-50"),
        visit("2026-06-05", "TW"),
      ],
      "TW",
    );
    expect(drafts).toEqual([
      { start: "2025-10-10", end: "2025-10-20", places: [{ key: "AE", transit: false }, { key: "TR", transit: false }] },
      { start: "2026-06-04", end: "2026-06-04", places: [{ key: "TH-50", transit: false }] },
    ]);
  });

  it("回到國內才分成兩趟;國外中間沒紀錄的日子不切開", () => {
    expect(groupTrips([visit("2025-01-01", "JP"), visit("2025-01-09", "KR")], "TW")).toHaveLength(1);
    expect(groupTrips([visit("2025-01-01", "JP"), visit("2025-01-02", "TW"), visit("2025-01-03", "JP")], "TW")).toHaveLength(2);
  });
});

describe("planImport", () => {
  const draft = { start: "2026-06-03", end: "2026-06-06", places: [{ key: "TH-50", transit: false }, { key: "TH-10", transit: false }] };
  const trip = (places: string[], start: string | null, end: string | null = start): Trip => ({
    id: places.join(),
    kind: "trip",
    title: null,
    start_date: start,
    end_date: end,
    note: null,
    places: places.map((key) => ({ key, transit: false })),
    spots: [],
  });

  it("日期沒重疊:新增", () => {
    expect(planImport([draft], [trip(["TH-50"], "2025-01-01")])[0].action).toBe("new");
  });

  it("日期重疊:把缺的地點補進已記錄的旅程", () => {
    const existing = trip(["TH-50"], "2026-06-01", "2026-06-04");
    expect(planImport([draft], [existing])[0]).toEqual({
      action: "merge",
      draft,
      trip: existing,
      added: [{ key: "TH-10", transit: false }],
    });
  });

  it("地點都已記錄:不動", () => {
    const existing = trip(["TH-10", "TH-50"], "2026-06-05", null);
    expect(planImport([draft], [existing])[0].action).toBe("covered");
  });

  it("草稿是整個國家,旅程已有該國的行政區也算記錄過", () => {
    const countryDraft = { ...draft, places: [{ key: "TH", transit: false }] };
    expect(planImport([countryDraft], [trip(["TH-50"], "2026-06-04")])[0].action).toBe("covered");
  });

  it("沒填日期、生活過的紀錄不拿來比對", () => {
    const lived = { ...trip(["TH-50"], "2026-01-01", null), kind: "lived" as const };
    expect(planImport([draft], [trip(["TH-50"], null), lived])[0].action).toBe("new");
  });
});
