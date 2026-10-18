import countries from "i18n-iso-countries";

export type TripKind = "trip" | "lived";

export const TRIP_KINDS: { value: TripKind; label: string; hint: string }[] = [
  { value: "trip", label: "旅遊", hint: "出遊、出差、探親都算" },
  { value: "lived", label: "住過", hint: "在當地生活過" },
];

export type Trip = {
  id: string;
  kind: TripKind;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  places: TripPlace[]; // 依路線順序
};

// transit:只是路過(轉機、車窗經過)
export type TripPlace = { key: string; transit: boolean };

type TripPlaceRow = { country_code: string; region_code: string; transit: boolean; position: number };

export type TripRow = Omit<Trip, "places"> & { trip_places: TripPlaceRow[] };

export const TRIP_COLUMNS =
  "id, kind, title, start_date, end_date, note, trip_places(country_code, region_code, transit, position)";

export function toTrip({ trip_places, ...trip }: TripRow): Trip {
  const places = [...trip_places]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ key: placeKey(p.country_code, p.region_code), transit: p.transit }));
  return { ...trip, places };
}

export function formatDates(trip: Pick<Trip, "kind" | "start_date" | "end_date">): string {
  const { start_date: start, end_date: end } = trip;
  if (!start) return "日期未填";
  if (!end) return trip.kind === "lived" ? `${start} ~ 至今` : start;
  return start === end ? start : `${start} ~ ${end}`;
}

export function tripTitle(trip: Pick<Trip, "title" | "places">): string {
  if (trip.title) return trip.title;
  // 標題只列停留的地點;全部都是路過才列路過的
  const stays = trip.places.filter((p) => !p.transit);
  const names = (stays.length ? stays : trip.places).map((p) => placeName(p.key));
  return names.length > 3 ? `${names.slice(0, 3).join("、")} 等 ${names.length} 地` : names.join("、");
}

// 新的在前,沒填日期的放最後
export function sortTrips(trips: Trip[]): Trip[] {
  return [...trips].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
}

export type Photo = { id: string; trip_id: string; path: string };

export type Profile = { id: string; username: string; display_name: string };

// 地點識別:國家為 "TW",行政區為 "JP-13"、"US-CA"
export function placeKey(country: string, region = ""): string {
  return region ? `${country}-${region}` : country;
}

export function splitPlaceKey(key: string): [country: string, region: string] {
  const [country, region = ""] = key.split("-");
  return [country, region];
}

// ---- 地圖顏色:旅遊次數越多越亮,住過用青色,只有路過最暗 ----

export type PlaceStat = { trips: number; transits: number; lived: boolean };

export const LEGEND: { label: string; color: string }[] = [
  { label: "住過", color: "#5ee6d8" },
  { label: "4 次以上", color: "#ffe08a" },
  { label: "2–3 次", color: "#f5b335" },
  { label: "1 次", color: "#cf7d1c" },
  { label: "路過", color: "#6e4618" },
];

export function statColor(stat: PlaceStat | undefined): string | undefined {
  if (!stat) return undefined;
  if (stat.lived) return LEGEND[0].color;
  if (stat.trips >= 4) return LEGEND[1].color;
  if (stat.trips >= 2) return LEGEND[2].color;
  if (stat.trips === 1) return LEGEND[3].color;
  return stat.transits ? LEGEND[4].color : undefined;
}

export function statLabel(stat: PlaceStat | undefined): string {
  if (!stat) return "還沒去過";
  const parts: string[] = [];
  if (stat.lived) parts.push("住過");
  if (stat.trips) parts.push(`去過 ${stat.trips} 次`);
  if (stat.transits) parts.push(`路過 ${stat.transits} 次`);
  return parts.join("・");
}

// 每趟旅程對每個地點只算一次;去過行政區也算去過該國。
// 同一趟裡只要有一處停留,該國就算去過,不算路過
export function computeStats(trips: Trip[]): Map<string, PlaceStat> {
  const stats = new Map<string, PlaceStat>();
  for (const trip of trips) {
    const transitOnly = new Map<string, boolean>();
    for (const { key, transit } of trip.places) {
      for (const k of [key, splitPlaceKey(key)[0]]) {
        transitOnly.set(k, (transitOnly.get(k) ?? true) && transit);
      }
    }
    for (const [key, transit] of transitOnly) {
      const stat = stats.get(key) ?? { trips: 0, transits: 0, lived: false };
      if (transit) stat.transits++;
      else if (trip.kind === "lived") stat.lived = true;
      else stat.trips++;
      stats.set(key, stat);
    }
  }
  return stats;
}

// 路過不算「去過」
export function hasVisited(stat: PlaceStat | undefined): boolean {
  return !!stat && (stat.trips > 0 || stat.lived);
}

// ---- 名稱 ----

const regionNames = new Intl.DisplayNames(["zh-TW"], { type: "region" });

export function countryName(alpha2: string): string {
  return regionNames.of(alpha2) ?? alpha2;
}

// world-atlas 使用 ISO 3166-1 數字代碼
export function numericToAlpha2(numeric: string | number | undefined): string | undefined {
  if (numeric === undefined) return undefined;
  return countries.numericToAlpha2(String(numeric).padStart(3, "0"));
}

export const ALL_COUNTRY_CODES = Object.keys(countries.getAlpha2Codes());

// 依都道府県コード 01–47 排列
const JAPAN_PREFECTURES = "北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県,三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,鳥取県,島根県,岡山県,広島県,山口県,徳島県,香川県,愛媛県,高知県,福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県".split(",");

export function prefectureCode(id: number): string {
  return String(id).padStart(2, "0");
}

// us-atlas 以 FIPS 代碼識別州,紀錄時改用郵遞縮寫(與 ISO 3166-2:US 相同)
export const US_STATES: Record<string, [code: string, name: string]> = {
  "01": ["AL", "阿拉巴馬州"], "02": ["AK", "阿拉斯加州"], "04": ["AZ", "亞利桑那州"], "05": ["AR", "阿肯色州"],
  "06": ["CA", "加利福尼亞州"], "08": ["CO", "科羅拉多州"], "09": ["CT", "康乃狄克州"], "10": ["DE", "德拉瓦州"],
  "11": ["DC", "華盛頓特區"], "12": ["FL", "佛羅里達州"], "13": ["GA", "喬治亞州"], "15": ["HI", "夏威夷州"],
  "16": ["ID", "愛達荷州"], "17": ["IL", "伊利諾州"], "18": ["IN", "印第安納州"], "19": ["IA", "愛荷華州"],
  "20": ["KS", "堪薩斯州"], "21": ["KY", "肯塔基州"], "22": ["LA", "路易斯安那州"], "23": ["ME", "緬因州"],
  "24": ["MD", "馬里蘭州"], "25": ["MA", "麻薩諸塞州"], "26": ["MI", "密西根州"], "27": ["MN", "明尼蘇達州"],
  "28": ["MS", "密西西比州"], "29": ["MO", "密蘇里州"], "30": ["MT", "蒙大拿州"], "31": ["NE", "內布拉斯加州"],
  "32": ["NV", "內華達州"], "33": ["NH", "新罕布夏州"], "34": ["NJ", "紐澤西州"], "35": ["NM", "新墨西哥州"],
  "36": ["NY", "紐約州"], "37": ["NC", "北卡羅來納州"], "38": ["ND", "北達科他州"], "39": ["OH", "俄亥俄州"],
  "40": ["OK", "奧克拉荷馬州"], "41": ["OR", "奧勒岡州"], "42": ["PA", "賓夕法尼亞州"], "44": ["RI", "羅德島州"],
  "45": ["SC", "南卡羅來納州"], "46": ["SD", "南達科他州"], "47": ["TN", "田納西州"], "48": ["TX", "德克薩斯州"],
  "49": ["UT", "猶他州"], "50": ["VT", "佛蒙特州"], "51": ["VA", "維吉尼亞州"], "53": ["WA", "華盛頓州"],
  "54": ["WV", "西維吉尼亞州"], "55": ["WI", "威斯康辛州"], "56": ["WY", "懷俄明州"],
};

const US_STATE_NAMES = new Map(Object.values(US_STATES));

export function placeName(key: string): string {
  const [country, region] = splitPlaceKey(key);
  if (!region) return countryName(country);
  if (country === "JP") return JAPAN_PREFECTURES[Number(region) - 1] ?? key;
  if (country === "US") return US_STATE_NAMES.get(region) ?? key;
  return key;
}

// 可以往下點到行政區的國家;total 為統計用的分母
export const DRILLDOWNS: Record<string, { unit: string; total: number }> = {
  JP: { unit: "都道府縣", total: JAPAN_PREFECTURES.length },
  US: { unit: "州", total: 50 }, // 華盛頓特區可紀錄,但不計入 50 州
};
