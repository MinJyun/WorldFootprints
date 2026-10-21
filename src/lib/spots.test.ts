import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { describe, expect, it } from "vitest";
import { DRILLDOWN_MAPS, type Collection } from "./maps";
import type { Trip, TripSpot } from "./places";
import { categoryOf, regionKeyAt, spotsAt, toDraft, type NominatimResult } from "./spots";

describe("categoryOf", () => {
  it.each([
    ["amenity", "restaurant", "food"],
    ["amenity", "cafe", "food"],
    ["shop", "bakery", "food"],
    ["tourism", "hotel", "stay"],
    ["tourism", "guest_house", "stay"],
    ["tourism", "museum", "sight"],
    ["tourism", "attraction", "sight"],
    ["historic", "castle", "sight"],
    ["amenity", "place_of_worship", "sight"],
    ["leisure", "park", "sight"],
    ["shop", "clothes", "other"],
    ["railway", "station", "other"],
  ] as const)("%s=%s → %s", (cls, type, expected) => {
    expect(categoryOf(cls, type)).toBe(expected);
  });
});

describe("toDraft", () => {
  // Nominatim 實際回應(2026-10-21 查詢 Wat Phra Singh Chiang Mai)
  const watPhraSingh: NominatimResult = {
    osm_type: "way",
    osm_id: 93414647,
    lat: "18.7882068",
    lon: "98.9813773",
    category: "amenity",
    type: "place_of_worship",
    name: "帕邢寺",
    display_name:
      "帕邢寺, 2, ถนนสามล้าน, แขวงศรีวิชัย, ตำบลพระสิงห์, 清迈, ฟ้าฮ่าม, อำเภอเมืองเชียงใหม่, 清迈府, 50200, 泰国;泰國",
    address: { country_code: "th" },
  };

  it("轉成景點草稿", () => {
    expect(toDraft(watPhraSingh)).toEqual({
      osm_id: "W93414647",
      name: "帕邢寺",
      category: "sight",
      country_code: "TH",
      lat: 18.7882068,
      lng: 98.9813773,
      address: "อำเภอเมืองเชียงใหม่, 清迈府, 泰國",
    });
  });

  it("「简/繁」並列的地名取繁體", () => {
    const ichiran = {
      ...watPhraSingh,
      name: "一蘭",
      display_name: "一蘭, 11, 東池袋一丁目, 東池袋, 丰岛区 / 豐島區, 东京都/東京都, 170-0013, 日本",
      address: { country_code: "jp" },
    };
    expect(toDraft(ichiran)?.address).toBe("豐島區, 東京都, 日本");
  });

  it("沒有名稱時用地址第一段", () => {
    expect(toDraft({ ...watPhraSingh, osm_type: "node", name: "" })).toMatchObject({ osm_id: "N93414647", name: "帕邢寺" });
  });

  it("沒有國家代碼(例如公海)時略過", () => {
    expect(toDraft({ ...watPhraSingh, address: {} })).toBeNull();
  });
});

describe("regionKeyAt:座標對到地圖上的行政區", () => {
  function collectionOf(country: string): Collection {
    const config = DRILLDOWN_MAPS[country];
    const topology = JSON.parse(readFileSync(`public${config.src}`, "utf8")) as Topology;
    return feature(topology, topology.objects[config.object] as GeometryCollection<Record<string, unknown>>) as Collection;
  }

  it.each([
    ["TH", "清邁帕邢寺", 98.9814, 18.7882, "TH-50"],
    ["TW", "台北 101", 121.5645, 25.034, "TW-TPE"],
    ["TW", "金門", 118.3171, 24.4321, "TW-KIN"],
    ["JP", "東京鐵塔", 139.7454, 35.6586, "JP-13"],
    ["JP", "首里城", 127.7195, 26.217, "JP-47"],
    ["KR", "景福宮", 126.977, 37.5796, "KR-11"],
    ["VN", "還劍湖", 105.8524, 21.0288, "VN-01"],
    ["VN", "濱城市場", 106.6981, 10.7725, "VN-79"],
    ["US", "時代廣場", -73.9855, 40.758, "US-NY"],
  ])("%s %s", (country, _name, lng, lat, expected) => {
    expect(regionKeyAt(DRILLDOWN_MAPS[country], collectionOf(country), [lng, lat])).toBe(expected);
  });

  it("海上對不到任何行政區", () => {
    expect(regionKeyAt(DRILLDOWN_MAPS.JP, collectionOf("JP"), [150, 30])).toBeUndefined();
  });
});

describe("spotsAt", () => {
  const spot = (id: string, country: string, region: string): TripSpot => ({
    spot: { id, osm_id: `N${id}`, name: id, category: "food", country_code: country, region_code: region, lat: 0, lng: 0 },
    rating: null,
    note: null,
  });
  const trip = (spots: TripSpot[]): Trip => ({
    id: "t", kind: "trip", title: null, start_date: null, end_date: null, note: null, places: [], spots,
  });

  it("國家列出全國的景點,行政區只列該區;同一景點只列一次", () => {
    const trips = [trip([spot("a", "TH", "50"), spot("b", "TH", "10")]), trip([spot("a", "TH", "50"), spot("c", "JP", "13")])];
    expect(spotsAt(trips, "TH").map((s) => s.spot.id)).toEqual(["a", "b"]);
    expect(spotsAt(trips, "TH-50").map((s) => s.spot.id)).toEqual(["a"]);
    expect(spotsAt(trips, "KR")).toEqual([]);
  });
});
