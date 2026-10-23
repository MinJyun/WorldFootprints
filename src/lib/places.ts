import countries from "i18n-iso-countries";

// footprint:只是去過、不算哪一趟旅行的地點,一筆一個地點,不出現在旅程清單
export type TripKind = "trip" | "lived" | "footprint";

export const TRIP_KINDS: { value: Exclude<TripKind, "footprint">; label: string; hint: string }[] = [
  { value: "trip", label: "旅遊", hint: "出遊、出差、探親都算" },
  { value: "lived", label: "生活過", hint: "在當地生活過" },
];

export type Trip = {
  id: string;
  kind: TripKind;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  places: TripPlace[]; // 依路線順序
  spots: TripSpot[]; // 依加入順序
};

// transit:只是路過(轉機、車窗經過)
export type TripPlace = { key: string; transit: boolean };

export type SpotCategory = "sight" | "food" | "stay" | "other";

// 共用景點庫的一筆;osm_id 例:N123456
export type Spot = {
  id: string;
  osm_id: string;
  name: string;
  category: SpotCategory;
  country_code: string;
  region_code: string;
  lat: number;
  lng: number;
};

// 某趟旅程去過的景點,評分與心得是個人的
export type TripSpot = { spot: Spot; rating: number | null; note: string | null };

type TripPlaceRow = { country_code: string; region_code: string; transit: boolean; position: number };
type TripSpotRow = TripSpot & { created_at: string };

export type TripRow = Omit<Trip, "places" | "spots"> & { trip_places: TripPlaceRow[]; trip_spots: TripSpotRow[] };

export const TRIP_COLUMNS =
  "id, kind, title, start_date, end_date, note, trip_places(country_code, region_code, transit, position), " +
  "trip_spots(rating, note, created_at, spot:spots(id, osm_id, name, category, country_code, region_code, lat, lng))";

export function toTrip({ trip_places, trip_spots, ...trip }: TripRow): Trip {
  const places = [...trip_places]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ key: placeKey(p.country_code, p.region_code), transit: p.transit }));
  const spots = [...trip_spots]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ spot, rating, note }) => ({ spot, rating, note }));
  return { ...trip, places, spots };
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

// 依旅遊日期排序(預設新的在前),同一天出發再比結束日;沒填日期的一律放最後
export function sortTrips(trips: Trip[], newestFirst = true): Trip[] {
  const dir = newestFirst ? -1 : 1;
  return [...trips].sort((a, b) => {
    if (!a.start_date || !b.start_date) return (a.start_date ? 0 : 1) - (b.start_date ? 0 : 1);
    const cmp = a.start_date.localeCompare(b.start_date) || (a.end_date ?? "").localeCompare(b.end_date ?? "");
    return cmp * dir;
  });
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

// ---- 地圖顏色:旅遊次數越多越亮;生活過用青色系,同樣依旅遊次數變亮;只有路過最暗 ----

export type PlaceStat = { trips: number; transits: number; lived: boolean; footprint: boolean };

// 依旅遊次數分級:0 次、1 次、2–3 次、4 次以上
const TRIP_SHADES = [undefined, "#cf7d1c", "#f5b335", "#ffe08a"] as const;
const LIVED_SHADES = ["#2a8f87", "#3fb8ad", "#5ee6d8", "#b2f7f0"] as const;
const TRANSIT_COLOR = "#6e4618";

function tier(trips: number): 0 | 1 | 2 | 3 {
  return trips >= 4 ? 3 : trips >= 2 ? 2 : trips === 1 ? 1 : 0;
}

// colors 有多個時,圖例顯示為由暗到亮的漸層
export const LEGEND: { label: string; colors: readonly string[] }[] = [
  { label: "生活過", colors: LIVED_SHADES },
  { label: "4 次以上", colors: [TRIP_SHADES[3]] },
  { label: "2–3 次", colors: [TRIP_SHADES[2]] },
  { label: "1 次", colors: [TRIP_SHADES[1]] },
  { label: "路過", colors: [TRANSIT_COLOR] },
];

export function statColor(stat: PlaceStat | undefined): string | undefined {
  if (!stat) return undefined;
  if (stat.lived) return LIVED_SHADES[tier(stat.trips)];
  return TRIP_SHADES[tier(stat.trips)] ?? (stat.footprint ? TRIP_SHADES[1] : stat.transits ? TRANSIT_COLOR : undefined);
}

export function statLabel(stat: PlaceStat | undefined): string {
  if (!stat) return "還沒去過";
  const parts: string[] = [];
  if (stat.lived) parts.push("生活過");
  if (stat.trips) parts.push(`去過 ${stat.trips} 次`);
  else if (stat.footprint) parts.push("去過");
  if (stat.transits) parts.push(`路過 ${stat.transits} 次`);
  return parts.join("・");
}

// 每趟旅程對每個地點只算一次;去過行政區也算去過該國。
// 同一趟裡只要有一處停留,該國就算去過,不算路過
export function computeStats(trips: Trip[]): Map<string, PlaceStat> {
  const stats = new Map<string, PlaceStat>();
  for (const trip of trips) addTripStats(stats, trip);
  return stats;
}

// 把一趟旅程累加進 stats;成就用來逐趟計算達成的那一趟
export function addTripStats(stats: Map<string, PlaceStat>, trip: Trip): void {
  const transitOnly = new Map<string, boolean>();
  for (const { key, transit } of trip.places) {
    for (const k of [key, splitPlaceKey(key)[0]]) {
      transitOnly.set(k, (transitOnly.get(k) ?? true) && transit);
    }
  }
  for (const [key, transit] of transitOnly) {
    const stat = stats.get(key) ?? { trips: 0, transits: 0, lived: false, footprint: false };
    if (transit) stat.transits++;
    else if (trip.kind === "lived") stat.lived = true;
    else if (trip.kind === "footprint") stat.footprint = true;
    else stat.trips++;
    stats.set(key, stat);
  }
}

// 路過不算「去過」
export function hasVisited(stat: PlaceStat | undefined): boolean {
  return !!stat && (stat.trips > 0 || stat.lived || stat.footprint);
}

// 每個去過的地點(國家與行政區)最早的日期;路過不算,沒填日期的不列
export function firstVisits(trips: Trip[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const trip of trips) {
    if (!trip.start_date) continue;
    for (const { key, transit } of trip.places) {
      if (transit) continue;
      for (const k of new Set([key, splitPlaceKey(key)[0]])) {
        const date = first.get(k);
        if (!date || trip.start_date < date) first.set(k, trip.start_date);
      }
    }
  }
  return first;
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

// ISO 3166-2:TH 府碼(名稱取自 Natural Earth)
const THAILAND_PROVINCES: Record<string, string> = {
  "10": "曼谷", "11": "沙沒巴干府", "12": "暖武里府", "13": "巴吞他尼府", "14": "大城府", "15": "紅統府", "16": "華富里府", "17": "信武里府",
  "18": "猜納府", "19": "北標府", "20": "春武里府", "21": "羅勇府", "22": "莊他武里府", "23": "達叻府", "24": "差春騷府", "25": "巴真府",
  "26": "那空那育府", "27": "沙繳府", "30": "那空叻差是瑪府", "31": "武里南府", "32": "素林府", "33": "四色菊府", "34": "烏汶府", "35": "益梭通府",
  "36": "猜也蓬府", "37": "安納乍倫府", "38": "汶干府", "39": "農磨蘭普府", "40": "孔敬府", "41": "烏隆府", "42": "黎府", "43": "廊開府",
  "44": "馬哈沙拉堪府", "45": "黎逸府", "46": "加拉信府", "47": "沙功那空府", "48": "那空拍儂府", "49": "穆達漢府", "50": "清邁府", "51": "南奔府",
  "52": "南邦府", "53": "程逸府", "54": "帕府", "55": "難府", "56": "帕堯府", "57": "清萊府", "58": "夜豐頌府", "60": "那空沙旺府",
  "61": "烏泰他尼府", "62": "甘烹碧府", "63": "達府", "64": "素可泰府", "65": "彭世洛府", "66": "披集府", "67": "碧差汶府", "70": "叻武里府",
  "71": "北碧府", "72": "素攀府", "73": "佛統府", "74": "沙沒沙空府", "75": "沙沒頌堪府", "76": "佛丕府", "77": "巴蜀府", "80": "那空是貪瑪叻府",
  "81": "甲米府", "82": "攀牙府", "83": "普吉府", "84": "素叻府", "85": "拉廊府", "86": "春蓬府", "90": "宋卡府", "91": "沙敦府",
  "92": "董里府", "93": "博他侖府", "94": "北大年府", "95": "也拉府", "96": "那拉提瓦府",
};

// ISO 3166-2:KR 市道碼;江原、全北為 2023、2024 年改制後的名稱
const KOREA_REGIONS: Record<string, string> = {
  "11": "首爾特別市", "26": "釜山廣域市", "27": "大邱廣域市", "28": "仁川廣域市", "29": "光州廣域市", "30": "大田廣域市", "31": "蔚山廣域市", "41": "京畿道",
  "42": "江原特別自治道", "43": "忠清北道", "44": "忠清南道", "45": "全北特別自治道", "46": "全羅南道", "47": "慶尚北道", "48": "慶尚南道",
  "49": "濟州特別自治道", "50": "世宗特別自治市",
};

// 越南 2025 年合併後的 34 個省市,代碼為越南統計總局(GSO)省碼
const VIETNAM_PROVINCES: Record<string, string> = {
  "01": "河內市", "04": "高平省", "08": "宣光省", "11": "奠邊省", "12": "萊州省", "14": "山羅省", "15": "老街省", "19": "太原省",
  "20": "諒山省", "22": "廣寧省", "24": "北寧省", "25": "富壽省", "31": "海防市", "33": "興安省", "37": "寧平省", "38": "清化省",
  "40": "乂安省", "42": "河靜省", "44": "廣治省", "46": "順化市", "48": "峴港市", "51": "廣義省", "52": "嘉萊省", "56": "慶和省",
  "66": "多樂省", "68": "林同省", "75": "同奈省", "79": "胡志明市", "80": "西寧省", "82": "同塔省", "86": "永隆省", "91": "安江省",
  "92": "芹苴市", "96": "金甌省",
};

// ISO 3166-2:TW 縣市碼
const TAIWAN_COUNTIES: Record<string, string> = {
  TPE: "臺北市", NWT: "新北市", TAO: "桃園市", TXG: "臺中市", TNN: "臺南市", KHH: "高雄市", KEE: "基隆市", HSZ: "新竹市",
  CYI: "嘉義市", HSQ: "新竹縣", MIA: "苗栗縣", CHA: "彰化縣", NAN: "南投縣", YUN: "雲林縣", CYQ: "嘉義縣", PIF: "屏東縣",
  ILA: "宜蘭縣", HUA: "花蓮縣", TTT: "臺東縣", PEN: "澎湖縣", KIN: "金門縣", LIE: "連江縣",
};

// 其他可細分國家的行政區名稱,地圖檔裡的 code 即為 region_code
const REGION_NAMES: Record<string, Record<string, string>> = {
  TW: TAIWAN_COUNTIES,
  TH: THAILAND_PROVINCES,
  VN: VIETNAM_PROVINCES,
  KR: KOREA_REGIONS,
};

export function placeName(key: string): string {
  const [country, region] = splitPlaceKey(key);
  if (!region) return countryName(country);
  if (country === "JP") return JAPAN_PREFECTURES[Number(region) - 1] ?? key;
  if (country === "US") return US_STATE_NAMES.get(region) ?? key;
  return REGION_NAMES[country]?.[region] ?? key;
}

// 可以往下點到行政區的國家;total 為統計用的分母
export const DRILLDOWNS: Record<string, { unit: string; total: number }> = {
  JP: { unit: "都道府縣", total: JAPAN_PREFECTURES.length },
  US: { unit: "州", total: 50 }, // 華盛頓特區可紀錄,但不計入 50 州
  TW: { unit: "縣市", total: Object.keys(TAIWAN_COUNTIES).length },
  KR: { unit: "市道", total: Object.keys(KOREA_REGIONS).length },
  TH: { unit: "府", total: Object.keys(THAILAND_PROVINCES).length },
  VN: { unit: "省市", total: Object.keys(VIETNAM_PROVINCES).length },
};
