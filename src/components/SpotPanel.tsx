"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { SPOT_CATEGORIES, regionCodeAt, searchSpots, type SpotDraft } from "@/lib/spots";
import {
  TRIP_COLUMNS,
  placeKey,
  placeName,
  splitPlaceKey,
  toTrip,
  type Trip,
  type TripPlace,
  type TripRow,
  type TripSpot,
} from "@/lib/places";
import { toast } from "./Toast";

function Stars({ rating, onRate }: { rating: number | null; onRate?: (rating: number | null) => void }) {
  if (!onRate && !rating) return null;
  return (
    <span className="text-accent">
      {[1, 2, 3, 4, 5].map((n) =>
        onRate ? (
          // 再點一次同一顆星就清除評分
          <button key={n} onClick={() => onRate(n === rating ? null : n)} className="px-px" aria-label={`${n} 顆星`}>
            {rating && n <= rating ? "★" : "☆"}
          </button>
        ) : (
          <span key={n}>{n <= rating! ? "★" : "☆"}</span>
        ),
      )}
    </span>
  );
}

function mapLink({ lat, lng }: { lat: number; lng: number }) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function SpotTitle({ spot }: { spot: TripSpot["spot"] }) {
  const { icon, label } = SPOT_CATEGORIES[spot.category];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span title={label}>{icon}</span>
      <a href={mapLink(spot)} target="_blank" rel="noreferrer" className="truncate font-medium hover:text-accent">
        {spot.name}
      </a>
      <span className="shrink-0 text-xs text-muted">{placeName(placeKey(spot.country_code, spot.region_code))}</span>
    </span>
  );
}

export function SpotList({ title, spots }: { title: string; spots: TripSpot[] }) {
  if (!spots.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">
        {title}
        <span className="ml-2 text-muted">{spots.length}</span>
      </h3>
      <ul className="space-y-2">
        {spots.map((s) => (
          <li key={s.spot.id} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <SpotTitle spot={s.spot} />
              <Stars rating={s.rating} />
            </div>
            {s.note && <p className="whitespace-pre-wrap pl-6 text-muted">{s.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// 旅程儲存後才能加景點;加入、評分、刪除都直接寫入資料庫
export function SpotEditor({
  trip,
  places,
  onPlacesChange,
  onTripChange,
}: {
  trip: Trip;
  places: TripPlace[];
  onPlacesChange: (places: TripPlace[]) => void;
  onTripChange: (trip: Trip) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getBrowserClient();
  const countries = [...new Set(places.map((p) => splitPlaceKey(p.key)[0]))];

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError((e as { message?: string }).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const { data, error } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", trip.id).single<TripRow>();
    if (error) throw error;
    onTripChange(toTrip(data));
  }

  const search = () =>
    run(async () => {
      if (!query.trim()) return;
      setResults(await searchSpots(query.trim(), countries));
    });

  const add = (draft: SpotDraft) =>
    run(async () => {
      const region_code = await regionCodeAt(draft.country_code, draft.lng, draft.lat);
      const { osm_id, name, category, country_code, lat, lng } = draft;
      // 景點庫共用:已經有人建過就沿用
      const created = await supabase
        .from("spots")
        .upsert({ osm_id, name, category, country_code, region_code, lat, lng }, { onConflict: "osm_id", ignoreDuplicates: true });
      if (created.error) throw created.error;
      const found = await supabase.from("spots").select("id").eq("osm_id", draft.osm_id).single<{ id: string }>();
      if (found.error) throw found.error;
      const linked = await supabase
        .from("trip_spots")
        .upsert({ trip_id: trip.id, spot_id: found.data.id }, { onConflict: "trip_id,spot_id", ignoreDuplicates: true });
      if (linked.error) throw linked.error;

      // 景點所在的地區還不在路線裡就順便加進去,例如在清邁吃飯就加上清邁府
      const key = placeKey(draft.country_code, region_code);
      let extra = "";
      if (!places.some((p) => p.key === key)) {
        const placed = await supabase.from("trip_places").upsert(
          { trip_id: trip.id, country_code: draft.country_code, region_code, transit: false, position: places.length },
          { onConflict: "trip_id,country_code,region_code", ignoreDuplicates: true },
        );
        if (placed.error) throw placed.error;
        onPlacesChange([...places, { key, transit: false }]);
        extra = `，地點加上了${placeName(key)}`;
      }
      await refresh();
      setResults(null);
      setQuery("");
      toast(`已加入「${draft.name}」${extra}`);
    });

  const update = (s: TripSpot, change: { rating?: number | null; note?: string | null }) =>
    run(async () => {
      const { error } = await supabase.from("trip_spots").update(change).match({ trip_id: trip.id, spot_id: s.spot.id });
      if (error) throw error;
      await refresh();
    });

  const remove = (s: TripSpot) =>
    run(async () => {
      const { error } = await supabase.from("trip_spots").delete().match({ trip_id: trip.id, spot_id: s.spot.id });
      if (error) throw error;
      await refresh();
    });

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">景點與美食</h3>
      {trip.spots.length > 0 && (
        <ul className="space-y-2">
          {trip.spots.map((s) => (
            <li key={s.spot.id} className="space-y-1 rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <SpotTitle spot={s.spot} />
                <button
                  onClick={() => remove(s)}
                  disabled={busy}
                  className="shrink-0 text-muted hover:text-red-400 disabled:opacity-50"
                  aria-label="移除"
                >
                  ✕
                </button>
              </div>
              <Stars rating={s.rating} onRate={(rating) => update(s, { rating })} />
              <input
                defaultValue={s.note ?? ""}
                maxLength={1000}
                placeholder="一句心得（選填）"
                onBlur={(e) => {
                  const note = e.target.value.trim() || null;
                  if (note !== s.note) update(s, { note });
                }}
                className="w-full rounded border border-border bg-transparent px-2 py-1"
              />
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={countries.length ? `在${countries.map((c) => placeName(c)).join("、")}找景點、餐廳` : "找景點、餐廳"}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2"
        />
        <button disabled={busy || !query.trim()} className="shrink-0 rounded-lg border border-border px-3 py-2 hover:border-accent disabled:opacity-50">
          {busy ? "…" : "搜尋"}
        </button>
      </form>

      {results && (
        <div className="space-y-1">
          {results.length ? (
            <ul className="space-y-1">
              {results.map((r) => (
                <li key={r.osm_id}>
                  <button
                    onClick={() => add(r)}
                    disabled={busy}
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-border disabled:opacity-50"
                  >
                    <span className="mr-1.5">{SPOT_CATEGORIES[r.category].icon}</span>
                    <span className="font-medium">{r.name}</span>
                    <span className="block truncate pl-6 text-xs text-muted">{r.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">找不到，換個關鍵字試試（當地語言或英文通常比較準）</p>
          )}
          <p className="text-xs text-muted">
            資料來自 ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
              OpenStreetMap
            </a>{" "}
            貢獻者
          </p>
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}
    </section>
  );
}
