import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { DRILLDOWN_MAPS, type Collection, type MapConfig } from "./maps";
import { placeKey, splitPlaceKey, type Spot, type SpotCategory, type Trip, type TripSpot } from "./places";

export const SPOT_CATEGORIES: Record<SpotCategory, { label: string; icon: string }> = {
  sight: { label: "景點", icon: "🏛️" },
  food: { label: "美食", icon: "🍜" },
  stay: { label: "住宿", icon: "🛏️" },
  other: { label: "其他", icon: "📍" },
};

// ---- OpenStreetMap 分類 → 我們的分類 ----

const FOOD_AMENITIES = new Set(["restaurant", "cafe", "fast_food", "bar", "pub", "food_court", "ice_cream", "biergarten"]);
const FOOD_SHOPS = new Set(["bakery", "confectionery", "pastry", "deli", "tea", "coffee", "chocolate", "seafood"]);
const STAYS = new Set(["hotel", "hostel", "guest_house", "motel", "apartment", "camp_site", "chalet", "alpine_hut"]);
const SIGHT_AMENITIES = new Set(["place_of_worship", "theatre", "arts_centre", "marketplace"]);
const SIGHT_LEISURE = new Set(["park", "garden", "nature_reserve", "water_park", "beach_resort"]);

export function categoryOf(osmClass: string, osmType: string): SpotCategory {
  if (osmClass === "amenity" && FOOD_AMENITIES.has(osmType)) return "food";
  if (osmClass === "shop" && FOOD_SHOPS.has(osmType)) return "food";
  if (osmClass === "tourism" && STAYS.has(osmType)) return "stay";
  if (osmClass === "tourism" || osmClass === "historic" || osmClass === "natural") return "sight";
  if (osmClass === "amenity" && SIGHT_AMENITIES.has(osmType)) return "sight";
  if (osmClass === "leisure" && SIGHT_LEISURE.has(osmType)) return "sight";
  return "other";
}

// ---- 搜尋(Nominatim) ----

// 使用規範:每秒最多一次、不能邊打邊搜,所以只在按下搜尋時送出
// https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export type NominatimResult = {
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name: string;
  display_name: string;
  address?: { country_code?: string };
};

// 搜尋結果還沒存進景點庫,所以沒有 id;address 只用來顯示
export type SpotDraft = Omit<Spot, "id" | "region_code"> & { address: string };

export function toDraft(r: NominatimResult): SpotDraft | null {
  const country = r.address?.country_code?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  const [first, ...rest] = r.display_name.split(", ");
  return {
    osm_id: `${r.osm_type[0].toUpperCase()}${r.osm_id}`,
    name: (r.name || first).slice(0, 200),
    category: categoryOf(r.category, r.type),
    country_code: country,
    lat: Number(r.lat),
    lng: Number(r.lon),
    // 只留最後三層(城市、省、國家);郵遞區號拿掉,「简;繁」「简/繁」並列的取繁體
    address: rest
      .filter((part) => !/^[\d\s-]+$/.test(part))
      .map((part) => part.split(/\s*[;/]\s*/).pop()!)
      .slice(-3)
      .join(", "),
  };
}

// countries:限定在這趟旅程的國家裡找,結果比較準
export async function searchSpots(query: string, countries: string[]): Promise<SpotDraft[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "zh-TW",
    limit: "8",
  });
  if (countries.length) params.set("countrycodes", countries.join(",").toLowerCase());
  const res = await fetch(`${NOMINATIM}?${params}`);
  if (!res.ok) throw new Error(`搜尋失敗(${res.status}),請稍後再試`);
  const results = (await res.json()) as NominatimResult[];
  return results.map(toDraft).filter((d): d is SpotDraft => d !== null);
}

// ---- 座標落在哪個行政區 ----

export function regionKeyAt(config: MapConfig, collection: Collection, point: [lng: number, lat: number]): string | undefined {
  const hit = collection.features.find((f) => geoContains(f, point));
  return hit && config.regionKey?.(hit);
}

// 回傳 region_code;不是可細分的國家或對不到時為空字串
export async function regionCodeAt(country: string, lng: number, lat: number): Promise<string> {
  const config = DRILLDOWN_MAPS[country];
  if (!config) return "";
  const topology = (await fetch(config.src).then((r) => r.json())) as Topology;
  const collection = feature(
    topology,
    topology.objects[config.object] as GeometryCollection<Record<string, unknown>>,
  ) as Collection;
  const key = regionKeyAt(config, collection, [lng, lat]);
  return key ? splitPlaceKey(key)[1] : "";
}

// ---- 地點頁的景點清單 ----

// key 可以是國家("TH")或行政區("TH-50");同一個景點去過多次只列一次(依旅程順序取第一次)
export function spotsAt(trips: Trip[], key: string): TripSpot[] {
  const seen = new Set<string>();
  return trips
    .flatMap((t) => t.spots)
    .filter(({ spot }) => {
      const at = key === spot.country_code || key === placeKey(spot.country_code, spot.region_code);
      if (!at || seen.has(spot.id)) return false;
      seen.add(spot.id);
      return true;
    });
}
