"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { getBrowserClient } from "@/lib/supabase";
import { DRILLDOWN_MAPS, WORLD_MAP, type GeoFeature } from "@/lib/maps";
import {
  countryName,
  formatDates,
  numericToAlpha2,
  placeName,
  splitPlaceKey,
  tripTitle,
  type Trip,
  type TripPlace,
} from "@/lib/places";
import {
  groupTrips,
  homeCountry,
  homeKey,
  locate,
  parseTimeline,
  planImport,
  toAreas,
  unrecordedPlaces,
  type ImportPlan,
  type Located,
} from "@/lib/timeline";
import { toast } from "./Toast";

async function loadFeatures(src: string, object: string): Promise<GeoFeature[]> {
  const topology = (await fetch(src).then((r) => r.json())) as Topology;
  return (feature(topology, topology.objects[object] as GeometryCollection<Record<string, unknown>>) as unknown as {
    features: GeoFeature[];
  }).features;
}

// 停留點 → 國家;有分區地圖的國家再細到行政區
async function locateAll(visits: ReturnType<typeof parseTimeline>): Promise<Located[]> {
  const world = toAreas(await loadFeatures(WORLD_MAP.src, WORLD_MAP.object), (f) => numericToAlpha2(f.id));
  const regions = new Map<string, ReturnType<typeof toAreas>>();
  const located: Located[] = [];
  for (const v of visits) {
    const country = locate(world, v.lng, v.lat);
    if (!country) continue;
    const config = DRILLDOWN_MAPS[country];
    if (config && !regions.has(country)) {
      regions.set(country, toAreas(await loadFeatures(config.src, config.object), config.regionKey!));
    }
    const key = (config && locate(regions.get(country)!, v.lng, v.lat)) || country;
    located.push({ ...v, country, key });
  }
  return located;
}

type Item = { plan: ImportPlan; checked: boolean; title: string; places: TripPlace[] };
type NewPlace = { key: string; date: string; checked: boolean };

const toItems = (plans: ImportPlan[], checked: boolean): Item[] =>
  plans.map((plan) => ({
    plan,
    checked: checked && plan.action !== "covered",
    title: "",
    places: plan.action === "merge" ? plan.added : plan.draft.places,
  }));

// 讀時間軸檔、產生草稿、勾選後寫入;trips 為使用者已記錄的旅程
export function TimelineImport({ userId, trips, home }: { userId: string; trips: Trip[]; home: string | null }) {
  const router = useRouter();
  const [homeCountryCode, setHomeCountryCode] = useState<string>();
  const [homeArea, setHomeArea] = useState<string>();
  const [items, setItems] = useState<Item[] | null>(null);
  const [domestic, setDomestic] = useState<Item[]>([]);
  const [newPlaces, setNewPlaces] = useState<NewPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setBusy(true);
    setError(null);
    setItems(null);
    try {
      const visits = parseTimeline(JSON.parse(await file.text()));
      const located = await locateAll(visits);
      const homeCode = homeCountry(located);
      if (!homeCode) throw new Error("檔案裡沒有停留點紀錄");
      setHomeCountryCode(homeCode);
      setItems(toItems(planImport(groupTrips(located, (v) => v.country !== homeCode), trips), true));

      // 國內:有分區地圖的國家才分得出離家;旅行只和全在國內的旅程比對,避免把去機場併進出國的那趟
      const local = located.filter((v) => v.country === homeCode);
      const area = homeKey(located, homeCode);
      setHomeArea(area);
      const localTrips = trips.filter((t) => t.places.every((p) => splitPlaceKey(p.key)[0] === homeCode));
      setDomestic(
        DRILLDOWN_MAPS[homeCode] ? toItems(planImport(groupTrips(local, (v) => v.key !== area), localTrips), false) : [],
      );
      setNewPlaces(unrecordedPlaces(local, trips).map((p) => ({ ...p, checked: true })));
    } catch (e) {
      setError(e instanceof SyntaxError ? "這不是 JSON 檔" : ((e as { message?: string }).message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number, change: Partial<Item>) =>
    setItems((prev) => prev!.map((item, j) => (j === i ? { ...item, ...change } : item)));
  const updateDomestic = (i: number, change: Partial<Item>) =>
    setDomestic((prev) => prev.map((item, j) => (j === i ? { ...item, ...change } : item)));

  const selected = [...(items ?? []), ...domestic].filter((it) => it.checked && it.plan.action !== "covered");
  // 已經在勾選的國內旅行裡的地點,不用再另存足跡
  const inSelected = new Set(selected.flatMap((it) => it.places.map((p) => p.key)));
  const footprints = newPlaces.filter((p) => p.checked && !inSelected.has(p.key));

  async function save() {
    if (!items) return;
    setBusy(true);
    setError(null);
    const supabase = getBrowserClient();
    try {
      let created = 0;
      let merged = 0;
      for (const item of selected) {
        const { plan } = item;
        let tripId: string;
        let offset = 0;
        if (plan.action === "merge") {
          tripId = plan.trip.id;
          offset = plan.trip.places.length;
          merged++;
        } else {
          const { data, error } = await supabase
            .from("trips")
            .insert({
              user_id: userId,
              kind: "trip",
              title: item.title.trim() || null,
              start_date: plan.draft.start,
              end_date: plan.draft.end,
            })
            .select("id")
            .single<{ id: string }>();
          if (error) throw error;
          tripId = data.id;
          created++;
        }
        const { error } = await supabase.from("trip_places").upsert(
          item.places.map(({ key, transit }, i) => {
            const [country_code, region_code] = splitPlaceKey(key);
            return { trip_id: tripId, user_id: userId, country_code, region_code, transit, position: offset + i };
          }),
          { onConflict: "trip_id,country_code,region_code", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      // 只是去過、不算旅行的地點存成足跡:一筆一個地點,日期是第一次去的那天
      for (const { key, date } of footprints) {
        const { data, error } = await supabase
          .from("trips")
          .insert({ user_id: userId, kind: "footprint", start_date: date })
          .select("id")
          .single<{ id: string }>();
        if (error) throw error;
        const [country_code, region_code] = splitPlaceKey(key);
        const placed = await supabase
          .from("trip_places")
          .insert({ trip_id: data.id, user_id: userId, country_code, region_code, transit: false, position: 0 });
        if (placed.error) throw placed.error;
      }
      toast(
        [created && `新增 ${created} 趟`, merged && `補充 ${merged} 趟`, footprints.length && `加入 ${footprints.length} 個足跡`]
          .filter(Boolean)
          .join("、") || "沒有要匯入的內容",
      );
      if (home) router.push(home);
    } catch (e) {
      setError((e as { message?: string }).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const count = selected.length + footprints.length;

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6 text-sm">
      <div>
        <h1 className="text-2xl font-bold">從 Google 地圖時間軸匯入</h1>
        <p className="mt-1 text-muted">找出你出國和在國內去過的地方，整理成旅程草稿；勾選確認後才會存。檔案只在你的瀏覽器裡讀取，不會上傳。</p>
      </div>

      <details className="rounded-lg border border-border px-3 py-2 text-muted">
        <summary className="cursor-pointer">怎麼匯出時間軸？</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>iPhone：Google 地圖 → 右上角頭像 →「你的時間軸」→ 右上角「⋯」→「位置資訊和隱私權設定」→「匯出時間軸資料」</li>
          <li>Android：手機「設定」→「位置」→「定位服務」→「時間軸」→「匯出時間軸資料」</li>
          <li>Google 只保留存在手機上的時間軸，較早的紀錄可能已經沒有了</li>
        </ul>
      </details>

      <label className="block cursor-pointer rounded-lg border border-dashed border-border px-3 py-6 text-center text-muted hover:text-foreground">
        {busy && !items ? "分析中…" : "選擇 Timeline.json"}
        <input
          type="file"
          accept=".json,application/json"
          hidden
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) read(file);
            e.target.value = "";
          }}
        />
      </label>

      {items && (
        <section className="space-y-3">
          <p className="text-muted">
            住家所在：{homeArea ? placeName(homeArea) : countryName(homeCountryCode!)}（依時間軸判斷）；找到 {items.length} 趟出國
          </p>
          {items.length === 0 && <p className="text-muted">這段期間沒有出國紀錄</p>}
          <ul className="space-y-2">
            {items.map((item, i) => (
              <DraftRow key={item.plan.draft.start} item={item} onChange={(change) => update(i, change)} />
            ))}
          </ul>
        </section>
      )}

      {items && newPlaces.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">國內去過、地圖上還沒有的地方</h2>
          <p className="text-muted">勾選的地方會存成「足跡」：不算哪一趟旅行，記下第一次去的日期，出現在地圖和「足跡」分頁。</p>
          <ul className="flex flex-wrap gap-1.5">
            {newPlaces.map((p, i) => (
              <li key={p.key}>
                <label className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-0.5 ${p.checked ? "bg-border" : "border border-border text-muted"}`}>
                  <input
                    type="checkbox"
                    checked={p.checked}
                    onChange={(e) => setNewPlaces((prev) => prev.map((q, j) => (j === i ? { ...q, checked: e.target.checked } : q)))}
                  />
                  {placeName(p.key)}
                  <span className="text-xs text-muted">{p.date}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items && domestic.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer font-semibold">
            國內旅行 {domestic.length} 趟
            <span className="ml-2 font-normal text-muted">預設不勾，算是旅行的再勾</span>
          </summary>
          <ul className="mt-2 space-y-2">
            {domestic.map((item, i) => (
              <DraftRow key={item.plan.draft.start} item={item} onChange={(change) => updateDomestic(i, change)} />
            ))}
          </ul>
        </details>
      )}

      {items && (
        <section>
          {count > 0 && (
            <button
              onClick={save}
              disabled={busy || count === 0}
              className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-black disabled:opacity-50"
            >
              {busy ? "匯入中…" : `匯入勾選的 ${count} 筆`}
            </button>
          )}
        </section>
      )}

      {error && <p className="text-red-400">{error}</p>}
      {home && (
        <Link href={home} className="block text-center text-muted hover:text-foreground">
          回到我的地圖
        </Link>
      )}
    </div>
  );
}

function DraftRow({ item, onChange }: { item: Item; onChange: (change: Partial<Item>) => void }) {
  const { plan } = item;
  const covered = plan.action === "covered";
  const dates = formatDates({ kind: "trip", start_date: plan.draft.start, end_date: plan.draft.end });
  return (
    <li className={`space-y-2 rounded-xl border border-border bg-panel px-4 py-3 ${covered ? "opacity-60" : ""}`}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={item.checked && !covered} disabled={covered} onChange={(e) => onChange({ checked: e.target.checked })} />
        <span className="font-medium">{dates}</span>
        <span className="ml-auto text-xs text-muted">
          {plan.action === "new" ? "新旅程" : plan.action === "merge" ? "補進已記錄的旅程" : "已記錄"}
        </span>
      </label>

      {plan.action !== "new" && <p className="text-muted">已記錄：{tripTitle(plan.trip)}（{formatDates(plan.trip)}）</p>}

      {!covered && (
        <>
          <ul className="flex flex-wrap items-center gap-1.5">
            {plan.action === "merge" && <span className="text-muted">加上</span>}
            {item.places.map(({ key, transit }) => (
              <li key={key}>
                <button
                  onClick={() => onChange({ places: item.places.map((p) => (p.key === key ? { key, transit: !transit } : p)) })}
                  title="切換停留/路過"
                  className={`rounded-full px-2.5 py-0.5 ${transit ? "border border-dashed border-muted" : "bg-border"}`}
                >
                  {splitPlaceKey(key)[1] && <span className="mr-1 text-muted">{placeName(splitPlaceKey(key)[0])}</span>}
                  {placeName(key)}
                  {transit && <span className="ml-1 text-xs text-muted">路過</span>}
                </button>
              </li>
            ))}
          </ul>
          {plan.action === "new" && (
            <input
              value={item.title}
              onChange={(e) => onChange({ title: e.target.value })}
              maxLength={100}
              placeholder="標題（選填）"
              className="w-full rounded-lg border border-border bg-transparent px-3 py-1.5"
            />
          )}
        </>
      )}
    </li>
  );
}
