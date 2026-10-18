"use client";

import { useState } from "react";
import { getBrowserClient, photoUrl } from "@/lib/supabase";
import { resizeImage } from "@/lib/photos";
import {
  TRIP_COLUMNS,
  TRIP_KINDS,
  formatDates,
  placeName,
  splitPlaceKey,
  statLabel,
  toTrip,
  tripTitle,
  type Photo,
  type PlaceStat,
  type Trip,
  type TripKind,
  type TripPlace,
  type TripRow,
} from "@/lib/places";

const KIND_LABEL = Object.fromEntries(TRIP_KINDS.map((k) => [k.value, k.label])) as Record<TripKind, string>;

function Card({ children }: { children: React.ReactNode }) {
  return <aside className="space-y-4 rounded-xl border border-border bg-panel p-4 text-sm">{children}</aside>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-muted hover:text-foreground">
      ← 所有旅程
    </button>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-black disabled:opacity-50"
    />
  );
}

function TripItem({ trip, onOpen }: { trip: Trip; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        onClick={() => onOpen(trip.id)}
        className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-accent"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{tripTitle(trip)}</span>
          {trip.kind !== "trip" && (
            <span className="shrink-0 rounded bg-border px-1.5 text-xs">{KIND_LABEL[trip.kind]}</span>
          )}
        </div>
        <div className="text-xs text-muted">{formatDates(trip)}</div>
      </button>
    </li>
  );
}

export function TripList({
  trips,
  onOpen,
  onNew,
}: {
  trips: Trip[];
  onOpen: (id: string) => void;
  onNew?: () => void;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">所有旅程</h2>
      {onNew && <PrimaryButton onClick={onNew}>＋ 新增旅程</PrimaryButton>}
      {trips.length ? (
        <ul className="max-h-[480px] space-y-2 overflow-y-auto">
          {trips.map((t) => (
            <TripItem key={t.id} trip={t} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="text-muted">還沒有旅程紀錄</p>
      )}
    </Card>
  );
}

export function PlaceDetail({
  placeKey,
  stat,
  trips,
  onOpen,
  onBack,
  onNew,
}: {
  placeKey: string;
  stat?: PlaceStat;
  trips: Trip[];
  onOpen: (id: string) => void;
  onBack: () => void;
  onNew?: () => void;
}) {
  return (
    <Card>
      <BackButton onClick={onBack} />
      <div>
        <h2 className="text-lg font-semibold">{placeName(placeKey)}</h2>
        <p className="text-muted">{statLabel(stat)}</p>
      </div>
      {onNew && <PrimaryButton onClick={onNew}>＋ 在這裡新增旅程</PrimaryButton>}
      {trips.length > 0 && (
        <ul className="space-y-2">
          {trips.map((t) => (
            <TripItem key={t.id} trip={t} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TripDetail({
  trip,
  photos,
  onBack,
  onEdit,
}: {
  trip: Trip;
  photos: Photo[];
  onBack: () => void;
  onEdit?: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        {onEdit && (
          <button onClick={onEdit} className="text-accent hover:underline">
            編輯
          </button>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold">{tripTitle(trip)}</h2>
        <p className="text-muted">
          {KIND_LABEL[trip.kind]}・{formatDates(trip)}
        </p>
      </div>
      <PlaceChips places={trip.places} />
      {trip.note && <p className="whitespace-pre-wrap">{trip.note}</p>}
      <PhotoGrid photos={photos} />
    </Card>
  );
}

// 依路線順序排列;路過的地點用虛線框。給了 onChange 就可以切換路過或移除
function PlaceChips({ places, onChange }: { places: TripPlace[]; onChange?: (places: TripPlace[]) => void }) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {places.map(({ key, transit }, i) => {
        const [country, region] = splitPlaceKey(key);
        const label = (
          <>
            {region && <span className="text-muted">{placeName(country)}</span>}
            {placeName(key)}
            {transit && <span className="text-xs text-muted">路過</span>}
          </>
        );
        return (
          <li key={key} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">→</span>}
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 ${
                transit ? "border border-dashed border-muted" : "bg-border"
              }`}
            >
              {onChange ? (
                <button
                  onClick={() => onChange(places.map((p) => (p.key === key ? { key, transit: !transit } : p)))}
                  title="切換停留/路過"
                  className="flex items-center gap-1"
                >
                  {label}
                </button>
              ) : (
                label
              )}
              {onChange && (
                <button
                  onClick={() => onChange(places.filter((p) => p.key !== key))}
                  className="text-muted hover:text-foreground"
                  aria-label="移除"
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TripEditor({
  trip,
  places,
  photos,
  ownerId,
  onPlacesChange,
  onSaved,
  onDeleted,
  onCancel,
  onPhotosChange,
}: {
  trip?: Trip;
  places: TripPlace[];
  photos: Photo[];
  ownerId: string;
  onPlacesChange: (places: TripPlace[]) => void;
  onSaved: (trip: Trip) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
  onPhotosChange: (update: (photos: Photo[]) => Photo[]) => void;
}) {
  const [kind, setKind] = useState<TripKind>(trip?.kind ?? "trip");
  const [title, setTitle] = useState(trip?.title ?? "");
  const [startDate, setStartDate] = useState(trip?.start_date ?? "");
  const [endDate, setEndDate] = useState(trip?.end_date ?? "");
  const [note, setNote] = useState(trip?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getBrowserClient();

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      // Supabase 回傳的錯誤是帶 message 的一般物件,不是 Error
      setError((e as { message?: string }).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (!places.length) throw new Error("請在地圖上點選至少一個地點");
      if (startDate && endDate && endDate < startDate) throw new Error("結束日期不能早於開始日期");
      if (endDate && !startDate) throw new Error("請填開始日期");

      const row = {
        user_id: ownerId,
        kind,
        title: title.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        note: note.trim() || null,
      };
      const saved = trip
        ? await supabase.from("trips").update(row).eq("id", trip.id).select("id").single()
        : await supabase.from("trips").insert(row).select("id").single();
      if (saved.error) throw saved.error;
      const tripId: string = saved.data.id;

      // 地點整批替換
      const removed = await supabase.from("trip_places").delete().eq("trip_id", tripId);
      if (removed.error) throw removed.error;
      const inserted = await supabase.from("trip_places").insert(
        places.map(({ key, transit }, position) => {
          const [country_code, region_code] = splitPlaceKey(key);
          return { trip_id: tripId, user_id: ownerId, country_code, region_code, transit, position };
        }),
      );
      if (inserted.error) throw inserted.error;

      const { data, error } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).single<TripRow>();
      if (error) throw error;
      onSaved(toTrip(data));
    });

  const remove = () =>
    run(async () => {
      if (!trip || !confirm(`確定要刪除「${tripTitle(trip)}」與它的照片嗎?`)) return;
      if (photos.length) {
        const { error } = await supabase.storage.from("photos").remove(photos.map((p) => p.path));
        if (error) throw error;
      }
      const { error } = await supabase.from("trips").delete().eq("id", trip.id);
      if (error) throw error;
      onPhotosChange((all) => all.filter((p) => p.trip_id !== trip.id));
      onDeleted(trip.id);
    });

  const upload = (files: FileList) =>
    run(async () => {
      if (!trip) return;
      for (const file of Array.from(files)) {
        const blob = await resizeImage(file);
        const path = `${ownerId}/${trip.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data, error } = await supabase
          .from("photos")
          .insert({ user_id: ownerId, trip_id: trip.id, path })
          .select("id, trip_id, path")
          .single<Photo>();
        if (error) throw error;
        onPhotosChange((all) => [...all, data]);
      }
    });

  const removePhoto = (photo: Photo) =>
    run(async () => {
      const { error: storageError } = await supabase.storage.from("photos").remove([photo.path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("photos").delete().eq("id", photo.id);
      if (error) throw error;
      onPhotosChange((all) => all.filter((p) => p.id !== photo.id));
    });

  const inputClass = "mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{trip ? "編輯旅程" : "新增旅程"}</h2>
        <button onClick={onCancel} className="text-muted hover:text-foreground">
          {trip ? "完成" : "取消"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TRIP_KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            title={k.hint}
            className={`rounded-lg border px-2 py-1.5 ${
              kind === k.value ? "border-accent bg-accent font-medium text-black" : "border-border hover:border-muted"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div>
        <span className="text-muted">地點（依序點地圖加入，點標籤切換「路過」）</span>
        <div className="mt-1">
          {places.length ? <PlaceChips places={places} onChange={onPlacesChange} /> : <p className="text-muted">尚未選擇</p>}
        </div>
      </div>

      <label className="block">
        <span className="text-muted">標題（選填）</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="例如：2024 關西賞楓" className={inputClass} />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-muted">開始</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-muted">結束{kind === "lived" ? "（空白＝至今）" : ""}</span>
          <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </label>
      </div>

      <label className="block">
        <span className="text-muted">筆記</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000} className={inputClass} />
      </label>

      <div className="flex gap-2">
        <PrimaryButton onClick={save} disabled={busy}>
          {busy ? "處理中…" : "儲存"}
        </PrimaryButton>
        {trip && (
          <button
            onClick={remove}
            disabled={busy}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-muted hover:text-red-400 disabled:opacity-50"
          >
            刪除
          </button>
        )}
      </div>

      {trip ? (
        <div className="space-y-2">
          <PhotoGrid photos={photos} onRemove={busy ? undefined : removePhoto} />
          <label className="block cursor-pointer rounded-lg border border-dashed border-border px-3 py-2 text-center text-muted hover:text-foreground">
            ＋ 加入照片
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <p className="text-muted">儲存後就可以加入照片</p>
      )}
      {error && <p className="text-red-400">{error}</p>}
    </Card>
  );
}

function PhotoGrid({ photos, onRemove }: { photos: Photo[]; onRemove?: (photo: Photo) => void }) {
  if (!photos.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md">
          <a href={photoUrl(photo.path)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(photo.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
          </a>
          {onRemove && (
            <button
              onClick={() => onRemove(photo)}
              className="absolute right-1 top-1 rounded bg-black/70 px-1.5 text-xs"
              aria-label="刪除照片"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
