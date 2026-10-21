import {
  DRILLDOWNS,
  addTripStats,
  computeStats,
  countryName,
  hasVisited,
  sortTrips,
  splitPlaceKey,
  type PlaceStat,
  type Trip,
} from "./places";

// 成就不另外存,每次從旅程算出來:補登舊旅程、刪掉旅程都會跟著變。
// 達成日期 = 依日期逐趟累加時,剛好達標的那一趟的出發日。

export type Achievement = {
  id: string;
  series: string; // 同系列(例:日本初級/中級/高級)只顯示已達成的與下一個
  name: string;
  description: string;
  tier: 1 | 2 | 3; // 銅、銀、金
  target: number;
  progress: number;
  unlocked: boolean;
  date: string | null; // 達成那一趟沒填日期時為 null
};

type Snapshot = {
  stats: Map<string, PlaceStat>;
  tripsByYear: Map<number, number>;
  maxCountriesInTrip: number;
};

type Def = Omit<Achievement, "progress" | "unlocked" | "date"> & { measure: (s: Snapshot) => number };

// ---- 洲 ----

export const CONTINENTS = { AS: "亞洲", EU: "歐洲", AF: "非洲", NA: "北美洲", SA: "南美洲", OC: "大洋洲", AN: "南極洲" } as const;
export type Continent = keyof typeof CONTINENTS;

// 由 countries-list 3.4.1 產生;俄羅斯、土耳其橫跨歐亞,兩洲都算
const CONTINENT_COUNTRIES: Record<Continent, string> = {
  AF: "AC AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TA TD TG TN TZ UG YT ZA ZM ZW",
  EU: "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SJ SK SM UA VA XK RU TR",
  AS: "AE AF AM AZ BD BH BN BT CC CN CX GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA RU SA SG SY TH TJ TM TR TW UZ VN YE",
  NA: "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI",
  SA: "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
  OC: "AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TL TO TV UM VU WF WS",
  AN: "AQ BV GS HM TF",
};

export const CONTINENT_OF: ReadonlyMap<string, Continent[]> = (() => {
  const map = new Map<string, Continent[]>();
  for (const [continent, codes] of Object.entries(CONTINENT_COUNTRIES) as [Continent, string][]) {
    for (const code of codes.split(" ")) map.set(code, [...(map.get(code) ?? []), continent]);
  }
  return map;
})();

// ---- 計數 ----

function visitedCountries(s: Snapshot): string[] {
  return [...s.stats.entries()].filter(([key, stat]) => !key.includes("-") && hasVisited(stat)).map(([key]) => key);
}

function visitedContinents(s: Snapshot): Set<Continent> {
  return new Set(visitedCountries(s).flatMap((c) => CONTINENT_OF.get(c) ?? []));
}

function visitedRegions(s: Snapshot, country: string): number {
  return [...s.stats.entries()].filter(
    ([key, stat]) => key.startsWith(`${country}-`) && key !== "US-DC" && hasVisited(stat),
  ).length;
}

function longestYearStreak(years: Iterable<number>): number {
  const set = new Set(years);
  let best = 0;
  for (const y of set) {
    if (set.has(y - 1)) continue;
    let n = 1;
    while (set.has(y + n)) n++;
    best = Math.max(best, n);
  }
  return best;
}

// ---- 成就定義 ----

const COUNTRY_TIERS = [
  { target: 5, label: "初級", tier: 1 },
  { target: 10, label: "中級", tier: 2 },
  { target: 20, label: "高級", tier: 3 },
] as const;

function definitions(stats: Map<string, PlaceStat>): Def[] {
  const defs: Def[] = [];
  const countries = [...stats.keys()].filter((k) => !k.includes("-"));

  for (const [target, name, tier] of [
    [5, "五國旅人", 1],
    [10, "十國旅人", 1],
    [25, "二十五國旅人", 2],
    [50, "五十國旅人", 3],
  ] as const) {
    defs.push({
      id: `countries-${target}`,
      series: "countries",
      name,
      description: `去過 ${target} 個國家或地區`,
      tier,
      target,
      measure: (s) => visitedCountries(s).length,
    });
  }

  for (const [code, name] of Object.entries(CONTINENTS) as [Continent, string][]) {
    defs.push({
      id: `continent-${code}`,
      series: `continent-${code}`,
      name: code === "AN" ? "南極探險家" : `初訪${name}`,
      description: `第一次去${name}`,
      tier: code === "AN" ? 3 : 1,
      target: 1,
      measure: (s) => (visitedContinents(s).has(code) ? 1 : 0),
    });
  }
  defs.push({
    id: "continents-6",
    series: "continents",
    name: "六大洲制霸",
    description: "南極洲以外的六大洲都去過",
    tier: 3,
    target: 6,
    measure: (s) => [...visitedContinents(s)].filter((c) => c !== "AN").length,
  });

  // 每個去旅遊過的國家各自一個系列
  for (const code of countries.filter((c) => stats.get(c)!.trips > 0)) {
    for (const { target, label, tier } of COUNTRY_TIERS) {
      defs.push({
        id: `country-${code}-${target}`,
        series: `country-${code}`,
        name: `${countryName(code)}${label}旅人`,
        description: `去${countryName(code)}旅遊 ${target} 次`,
        tier,
        target,
        measure: (s) => s.stats.get(code)?.trips ?? 0,
      });
    }
  }

  // 可細分的國家,去過才列出
  for (const [code, { unit, total }] of Object.entries(DRILLDOWNS)) {
    if (!hasVisited(stats.get(code))) continue;
    const place = `${countryName(code)}${unit}`;
    defs.push(
      {
        id: `regions-${code}-half`,
        series: `regions-${code}`,
        name: `${place}過半`,
        description: `去過 ${Math.ceil(total / 2)} 個${unit}`,
        tier: 2,
        target: Math.ceil(total / 2),
        measure: (s) => visitedRegions(s, code),
      },
      {
        id: `regions-${code}-all`,
        series: `regions-${code}`,
        name: `${place}制霸`,
        description: `${total} 個${unit}全部去過`,
        tier: 3,
        target: total,
        measure: (s) => visitedRegions(s, code),
      },
    );
  }

  const livedIn = (m: Map<string, PlaceStat>) => [...m.entries()].filter(([k, v]) => !k.includes("-") && v.lived).length;
  const livedCount = (s: Snapshot) => livedIn(s.stats);
  if (livedIn(stats) > 0) {
    defs.push(
      { id: "lived-2", series: "lived", name: "雙國生活", description: "在 2 個國家生活過", tier: 2, target: 2, measure: livedCount },
      { id: "lived-3", series: "lived", name: "四海為家", description: "在 3 個國家生活過", tier: 3, target: 3, measure: livedCount },
    );
  }

  const busiestYear = (s: Snapshot) => Math.max(0, ...s.tripsByYear.values());
  const streak = (s: Snapshot) => longestYearStreak(s.tripsByYear.keys());
  const multi = (s: Snapshot) => s.maxCountriesInTrip;
  defs.push(
    { id: "year-5", series: "year", name: "說走就走", description: "同一年旅遊 5 趟", tier: 1, target: 5, measure: busiestYear },
    { id: "year-10", series: "year", name: "空中飛人", description: "同一年旅遊 10 趟", tier: 2, target: 10, measure: busiestYear },
    { id: "streak-3", series: "streak", name: "年年出走", description: "連續 3 年都有旅遊", tier: 1, target: 3, measure: streak },
    { id: "streak-5", series: "streak", name: "旅行成癮", description: "連續 5 年都有旅遊", tier: 2, target: 5, measure: streak },
    { id: "streak-10", series: "streak", name: "十年如一日", description: "連續 10 年都有旅遊", tier: 3, target: 10, measure: streak },
    { id: "multi-3", series: "multi", name: "一趟三國", description: "同一趟旅程停留 3 個國家", tier: 1, target: 3, measure: multi },
    { id: "multi-5", series: "multi", name: "一趟五國", description: "同一趟旅程停留 5 個國家", tier: 2, target: 5, measure: multi },
  );

  return defs;
}

// ---- 計算 ----

export function computeAchievements(trips: Trip[]): Achievement[] {
  const defs = definitions(computeStats(trips));
  const snap: Snapshot = { stats: new Map(), tripsByYear: new Map(), maxCountriesInTrip: 0 };
  const dates = new Map<string, string | null>();

  // 舊到新逐趟累加,沒填日期的排最後
  for (const trip of sortTrips(trips, false)) {
    addTripStats(snap.stats, trip);
    if (trip.kind === "trip") {
      if (trip.start_date) {
        const year = Number(trip.start_date.slice(0, 4));
        snap.tripsByYear.set(year, (snap.tripsByYear.get(year) ?? 0) + 1);
      }
      const stayed = new Set(trip.places.filter((p) => !p.transit).map((p) => splitPlaceKey(p.key)[0]));
      snap.maxCountriesInTrip = Math.max(snap.maxCountriesInTrip, stayed.size);
    }
    for (const def of defs) {
      if (!dates.has(def.id) && def.measure(snap) >= def.target) dates.set(def.id, trip.start_date);
    }
  }

  return defs.map(({ measure, ...def }) => ({
    ...def,
    progress: Math.min(measure(snap), def.target),
    unlocked: dates.has(def.id),
    date: dates.get(def.id) ?? null,
  }));
}

// 同系列只留已達成的與下一個目標
export function visibleAchievements(list: Achievement[]): Achievement[] {
  const nextShown = new Set<string>();
  return list.filter((a) => {
    if (a.unlocked) return true;
    if (nextShown.has(a.series)) return false;
    nextShown.add(a.series);
    return true;
  });
}
