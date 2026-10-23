import { geoBounds, geoContains } from "d3-geo";
import { splitPlaceKey, type Trip, type TripPlace } from "./places";
import type { GeoFeature } from "./maps";

// 匯入 Google 地圖時間軸:檔案只在瀏覽器裡解析,不上傳。
// 只取「停留點」(visit),依座標判斷國家與行政區,把連續待在國外的日子合成一趟旅程草稿。

export type Visit = {
  date: string; // 當地日期 YYYY-MM-DD
  endDate: string;
  lat: number;
  lng: number;
  home: boolean; // Google 標記為住家
};

// ---- 解析 ----

// iPhone 匯出:"geo:25.033964,121.564468";Android 匯出:"25.033964°, 121.564468°"
function parseLatLng(text: unknown): [lat: number, lng: number] | null {
  if (typeof text !== "string") return null;
  const m = text.replace(/^geo:/, "").match(/(-?[\d.]+)°?\s*,\s*(-?[\d.]+)°?/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

type RawVisit = {
  startTime?: string;
  endTime?: string;
  visit?: { topCandidate?: { semanticType?: string; placeLocation?: string | { latLng?: string } } };
};

export function parseTimeline(json: unknown): Visit[] {
  // iPhone 是陣列;Android 是 { semanticSegments: [...] }
  const segments = Array.isArray(json)
    ? json
    : (json as { semanticSegments?: unknown })?.semanticSegments;
  if (!Array.isArray(segments)) throw new Error("看不懂這個檔案，請確認是從 Google 地圖「匯出時間軸資料」得到的 JSON");

  const visits: Visit[] = [];
  for (const s of segments as RawVisit[]) {
    const candidate = s.visit?.topCandidate;
    if (!candidate || !s.startTime) continue;
    const location = candidate.placeLocation;
    const latLng = parseLatLng(typeof location === "string" ? location : location?.latLng);
    if (!latLng) continue;
    visits.push({
      // 時間字串帶當地時區,前 10 碼就是當地日期
      date: s.startTime.slice(0, 10),
      endDate: (s.endTime ?? s.startTime).slice(0, 10),
      lat: latLng[0],
      lng: latLng[1],
      home: /home/i.test(candidate.semanticType ?? ""),
    });
  }
  return visits.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- 座標 → 地點 ----

type Area = { key: string; feature: GeoFeature; bounds: [[number, number], [number, number]] };

export function toAreas(features: GeoFeature[], keyOf: (f: GeoFeature) => string | undefined): Area[] {
  return features.flatMap((feature) => {
    const key = keyOf(feature);
    return key ? [{ key, feature, bounds: geoBounds(feature) }] : [];
  });
}

function inBounds([[west, south], [east, north]]: Area["bounds"], lng: number, lat: number) {
  if (lat < south || lat > north) return false;
  // 跨換日線的範圍 west > east
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}

function find(areas: Area[], lng: number, lat: number): string | undefined {
  return areas.find((a) => inBounds(a.bounds, lng, lat) && geoContains(a.feature, [lng, lat]))?.key;
}

// 海岸、機場、船上的點常落在簡化過的國界外,往外找最近的
const NUDGES = [0.05, 0.15, 0.3].flatMap((d) => [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]);

export function locate(areas: Area[], lng: number, lat: number): string | undefined {
  for (const [dx, dy] of [[0, 0], ...NUDGES]) {
    const key = find(areas, lng + dx, lat + dy);
    if (key) return key;
  }
  return undefined;
}

// ---- 合成旅程 ----

export type Located = Visit & { country: string; key: string }; // key:有分區地圖的國家為行政區,否則為國家

export type Draft = { start: string; end: string; places: TripPlace[] };

export function homeCountry(visits: Located[]): string | undefined {
  const count = (list: Located[]) => {
    const tally = new Map<string, number>();
    for (const v of list) tally.set(v.country, (tally.get(v.country) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  return count(visits.filter((v) => v.home)) ?? count(visits);
}

// 連續待在國外的停留點合成一趟,回到住家所在國家才結束;國外中間沒紀錄的日子不切開
export function groupTrips(visits: Located[], home: string): Draft[] {
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  for (const v of visits) {
    if (v.country === home) {
      current = null;
      continue;
    }
    if (!current) {
      current = { start: v.date, end: v.endDate, places: [] };
      drafts.push(current);
    }
    if (v.endDate > current.end) current.end = v.endDate;
    if (!current.places.some((p) => p.key === v.key)) current.places.push({ key: v.key, transit: false });
  }
  return drafts;
}

// ---- 和已記錄的旅程比對 ----

export type ImportPlan =
  | { action: "new"; draft: Draft }
  | { action: "merge"; draft: Draft; trip: Trip; added: TripPlace[] }
  | { action: "covered"; draft: Draft; trip: Trip };

// 已記錄的地點涵蓋草稿地點:同一個 key,或草稿是國家而旅程已有該國的行政區
function covers(places: TripPlace[], key: string) {
  return places.some((p) => p.key === key || (!key.includes("-") && splitPlaceKey(p.key)[0] === key));
}

export function planImport(drafts: Draft[], trips: Trip[]): ImportPlan[] {
  return drafts.map((draft) => {
    const trip = trips.find(
      (t) => t.kind === "trip" && t.start_date && t.start_date <= draft.end && (t.end_date ?? t.start_date) >= draft.start,
    );
    if (!trip) return { action: "new", draft };
    const added = draft.places.filter((p) => !covers(trip.places, p.key));
    return added.length ? { action: "merge", draft, trip, added } : { action: "covered", draft, trip };
  });
}
