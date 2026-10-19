"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GeoMap } from "./GeoMap";
import { PlaceDetail, TripDetail, TripEditor, TripList, type TripOrder } from "./TripPanel";
import type { FriendTrip } from "./UserFootprints";
import { getBrowserClient } from "@/lib/supabase";
import { DRILLDOWN_MAPS, GLOBE_MAP, WORLD_MAP } from "@/lib/maps";
import {
  ALL_COUNTRY_CODES,
  DRILLDOWNS,
  LEGEND,
  computeStats,
  countryName,
  hasVisited,
  sortTrips,
  splitPlaceKey,
  statColor,
  statLabel,
  type Photo,
  type Profile,
  type Trip,
  type TripPlace,
} from "@/lib/places";

type Panel =
  | { mode: "list" }
  | { mode: "place"; key: string }
  | { mode: "trip"; id: string }
  | { mode: "edit"; id?: string; places: TripPlace[] };

const COUNTRY_OPTIONS = ALL_COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
  a.name.localeCompare(b.name, "zh-TW"),
);

const NO_HIGHLIGHT: ReadonlySet<string> = new Set();

type Props = { profile: Profile; trips: Trip[]; photos: Photo[]; friendTrips: FriendTrip[] };

export function FootprintsView({ profile, trips: initialTrips, photos: initialPhotos, friendTrips }: Props) {
  const [trips, setTrips] = useState(() => sortTrips(initialTrips));
  const [photos, setPhotos] = useState(initialPhotos);
  const [view, setView] = useState("world"); // "world" 或 DRILLDOWN_MAPS 的國碼
  const [globe, setGlobe] = useState(false);
  const [panel, setPanel] = useState<Panel>({ mode: "list" });
  const [isOwner, setIsOwner] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);

  // 跟著登入狀態更新;在其他分頁登出時這裡也會收起編輯功能
  useEffect(() => {
    const { data } = getBrowserClient().auth.onAuthStateChange((_event, session) => {
      setIsOwner(session?.user.id === profile.id);
    });
    return () => data.subscription.unsubscribe();
  }, [profile.id]);

  const stats = useMemo(() => computeStats(trips), [trips]);
  const colorFor = useCallback((key: string) => statColor(stats.get(key)), [stats]);
  const describe = useCallback((key: string) => statLabel(stats.get(key)), [stats]);

  const editing = panel.mode === "edit" ? panel : null;
  const highlighted = useMemo<ReadonlySet<string>>(() => {
    if (panel.mode === "edit") return new Set(panel.places.map((p) => p.key));
    if (panel.mode === "place") return new Set([panel.key]);
    if (panel.mode === "trip") return new Set(trips.find((t) => t.id === panel.id)?.places.map((p) => p.key));
    return NO_HIGHLIGHT;
  }, [panel, trips]);

  const select = useCallback(
    (key: string, fromSearch = false) => {
      // 在世界地圖點到可細分的國家:切換到該國地圖(編輯時用搜尋則直接加入整個國家)
      if (view === "world" && key in DRILLDOWN_MAPS && !(fromSearch && editing)) {
        setView(key);
        if (!editing) setPanel({ mode: "place", key });
        return;
      }
      if (editing) {
        const places = editing.places.some((p) => p.key === key)
          ? editing.places.filter((p) => p.key !== key)
          : [...editing.places, { key, transit: false }];
        setPanel({ ...editing, places });
      } else {
        setPanel({ mode: "place", key });
      }
    },
    [view, editing],
  );

  const ordered = useMemo(() => sortTrips(trips, newestFirst), [trips, newestFirst]);
  const order = { newestFirst, onToggle: () => setNewestFirst((v) => !v) };

  const isAt = (key: string) => (t: Trip) =>
    t.places.some((p) => p.key === key || splitPlaceKey(p.key)[0] === key);
  const tripsAt = (key: string) => ordered.filter(isAt(key));
  const friendTripsAt = (key: string) => {
    const at = isAt(key);
    return sortTrips(friendTrips.map((f) => f.trip).filter(at), newestFirst).map(
      (trip) => friendTrips.find((f) => f.trip === trip)!,
    );
  };

  const visitedCountries = [...stats.entries()].filter(([key, s]) => !key.includes("-") && hasVisited(s)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{profile.display_name} 的足跡</h1>
          <p className="text-sm text-muted">@{profile.username}</p>
        </div>
        <dl className="flex flex-wrap gap-6 text-sm">
          <Stat label="國家/地區" value={visitedCountries} />
          {Object.entries(DRILLDOWNS).map(([country, { unit, total }]) => {
            const count = [...stats.entries()].filter(
              ([key, s]) => key.startsWith(`${country}-`) && key !== "US-DC" && hasVisited(s),
            ).length;
            // 沒去過的國家不佔版面
            if (!count) return null;
            return <Stat key={country} label={`${countryName(country)}${unit}`} value={`${count} / ${total}`} />;
          })}
          <Stat label="旅程" value={trips.length} />
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {view !== "world" && (
          <button onClick={() => setView("world")} className="text-accent hover:underline">
            ← 世界地圖
          </button>
        )}
        {view === "world" && (
          <div className="flex overflow-hidden rounded-lg border border-border">
            {[false, true].map((g) => (
              <button
                key={String(g)}
                onClick={() => setGlobe(g)}
                className={`px-3 py-1.5 ${globe === g ? "bg-border text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {g ? "地球儀" : "平面"}
              </button>
            ))}
          </div>
        )}
        <CountrySearch onPick={(code) => select(code, true)} />
        <div className="ml-auto flex flex-wrap gap-3">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {editing && (
            <p className="mb-2 rounded-lg bg-accent/15 px-3 py-1.5 text-sm text-accent">
              編輯中：點地圖{view === "world" ? "上的國家" : "上的地區"}加入或移除地點
              {view === "world" && "（點日本、美國會進入分區地圖）"}
            </p>
          )}
          <GeoMap
            key={view === "world" && globe ? "globe" : view}
            config={view !== "world" ? DRILLDOWN_MAPS[view] : globe ? GLOBE_MAP : WORLD_MAP}
            colorFor={colorFor}
            describe={describe}
            highlighted={highlighted}
            onSelect={select}
          />
          <p className="mt-1 text-xs text-muted">
            {view === "world" && globe ? "拖曳旋轉地球、滾輪縮放" : "滾輪或雙指縮放、拖曳移動"}；小國可以用搜尋
          </p>
        </div>

        <PanelView
          panel={panel}
          setPanel={setPanel}
          trips={ordered}
          order={order}
          photos={photos}
          tripsAt={tripsAt}
          friendTripsAt={friendTripsAt}
          stats={stats}
          ownerId={isOwner ? profile.id : undefined}
          onSaved={(trip) => {
            setTrips((prev) => sortTrips([...prev.filter((t) => t.id !== trip.id), trip]));
            setPanel({ mode: "edit", id: trip.id, places: trip.places });
          }}
          onDeleted={(id) => {
            setTrips((prev) => prev.filter((t) => t.id !== id));
            setPanel({ mode: "list" });
          }}
          onPhotosChange={setPhotos}
        />
      </div>
    </div>
  );
}

function PanelView({
  panel,
  setPanel,
  trips,
  order,
  photos,
  tripsAt,
  friendTripsAt,
  stats,
  ownerId,
  onSaved,
  onDeleted,
  onPhotosChange,
}: {
  panel: Panel;
  setPanel: (panel: Panel) => void;
  trips: Trip[];
  order: TripOrder;
  photos: Photo[];
  tripsAt: (key: string) => Trip[];
  friendTripsAt: (key: string) => FriendTrip[];
  stats: ReturnType<typeof computeStats>;
  ownerId?: string;
  onSaved: (trip: Trip) => void;
  onDeleted: (id: string) => void;
  onPhotosChange: (update: (photos: Photo[]) => Photo[]) => void;
}) {
  const open = (id: string) => setPanel({ mode: "trip", id });
  const back = () => setPanel({ mode: "list" });

  switch (panel.mode) {
    case "list":
      return (
        <TripList trips={trips} order={order} onOpen={open} onNew={ownerId ? () => setPanel({ mode: "edit", places: [] }) : undefined} />
      );
    case "place":
      return (
        <PlaceDetail
          placeKey={panel.key}
          stat={stats.get(panel.key)}
          trips={tripsAt(panel.key)}
          friendTrips={friendTripsAt(panel.key)}
          order={order}
          onOpen={open}
          onBack={back}
          onNew={ownerId ? () => setPanel({ mode: "edit", places: [{ key: panel.key, transit: false }] }) : undefined}
        />
      );
    case "trip": {
      const trip = trips.find((t) => t.id === panel.id);
      if (!trip) return null;
      return (
        <TripDetail
          trip={trip}
          photos={photos.filter((p) => p.trip_id === trip.id)}
          onBack={back}
          onEdit={ownerId ? () => setPanel({ mode: "edit", id: trip.id, places: trip.places }) : undefined}
        />
      );
    }
    case "edit": {
      if (!ownerId) return null;
      const trip = trips.find((t) => t.id === panel.id);
      return (
        <TripEditor
          key={panel.id ?? "new"}
          trip={trip}
          places={panel.places}
          photos={trip ? photos.filter((p) => p.trip_id === trip.id) : []}
          ownerId={ownerId}
          onPlacesChange={(places) => setPanel({ ...panel, places })}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onCancel={() => setPanel(trip ? { mode: "trip", id: trip.id } : { mode: "list" })}
          onPhotosChange={onPhotosChange}
        />
      );
    }
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-xl font-semibold text-accent">{value}</dd>
    </div>
  );
}

// 小國在地圖上難點,提供搜尋
function CountrySearch({ onPick }: { onPick: (code: string) => void }) {
  const [text, setText] = useState("");
  return (
    <>
      <input
        list="country-list"
        value={text}
        placeholder="搜尋國家…"
        onChange={(e) => {
          const match = COUNTRY_OPTIONS.find((c) => c.name === e.target.value);
          if (match) {
            onPick(match.code);
            setText("");
          } else {
            setText(e.target.value);
          }
        }}
        className="w-44 rounded-lg border border-border bg-transparent px-3 py-1.5"
      />
      <datalist id="country-list">
        {COUNTRY_OPTIONS.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
    </>
  );
}
