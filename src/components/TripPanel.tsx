"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
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
import type { FriendTrip } from "./UserFootprints";
import { toast } from "./Toast";
import { DateRangeField } from "./DateRangeField";

const KIND_LABEL = Object.fromEntries(TRIP_KINDS.map((k) => [k.value, k.label])) as Record<TripKind, string>;

export function Card({ children }: { children: React.ReactNode }) {
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

export type TripOrder = { newestFirst: boolean; onToggle: () => void };

function OrderToggle({ order }: { order: TripOrder }) {
  return (
    <button onClick={order.onToggle} className="text-xs text-muted hover:text-foreground">
      {order.newestFirst ? "新 → 舊" : "舊 → 新"} ⇅
    </button>
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
  order,
  onOpen,
  onNew,
}: {
  trips: Trip[];
  order: TripOrder;
  onOpen: (id: string) => void;
  onNew?: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">所有旅程</h2>
        {trips.length > 1 && <OrderToggle order={order} />}
      </div>
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
  friendTrips,
  order,
  onOpen,
  onBack,
  onNew,
}: {
  placeKey: string;
  stat?: PlaceStat;
  trips: Trip[];
  friendTrips: FriendTrip[];
  order: TripOrder;
  onOpen: (id: string) => void;
  onBack: () => void;
  onNew?: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        {trips.length > 1 && <OrderToggle order={order} />}
      </div>
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
      {friendTrips.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-semibold">追蹤的人也去過</h3>
          <ul className="space-y-2">
            {friendTrips.map(({ owner, trip }) => (
              <li key={trip.id}>
                <Link
                  href={`/u/${owner.username}`}
                  className="block rounded-lg border border-border px-3 py-2 hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{tripTitle(trip)}</span>
                    <span className="shrink-0 text-xs text-accent">{owner.display_name}</span>
                  </div>
                  <div className="text-xs text-muted">{formatDates(trip)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
      // 沒有登入狀態的請求會被 RLS 擋下,先給看得懂的訊息
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== ownerId) throw new Error("登入已失效，請重新整理頁面並重新登入");
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
      toast(trip ? "已儲存" : "已新增旅程，可以加入照片了");
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
      toast("已刪除");
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
      toast(files.length > 1 ? `已上傳 ${files.length} 張照片` : "照片已上傳");
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

      <div>
        <span className="text-muted">日期{kind === "lived" ? "（還住在那裡就選「至今」）" : ""}</span>
        <DateRangeField
          start={startDate}
          end={endDate}
          openEnded={kind === "lived"}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
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

// 照片 bucket 是私有的,要換成有時效的簽名網址才能顯示
const SIGNED_URL_TTL = 60 * 60 * 24;
const signedUrls = new Map<string, string>();

function useSignedUrls(paths: string[]): (path: string) => string | undefined {
  const [, setVersion] = useState(0);
  const key = paths.join("\n");
  useEffect(() => {
    const missing = key ? key.split("\n").filter((p) => !signedUrls.has(p)) : [];
    if (!missing.length) return;
    let cancelled = false;
    getBrowserClient()
      .storage.from("photos")
      .createSignedUrls(missing, SIGNED_URL_TTL)
      .then(({ data }) => {
        for (const item of data ?? []) if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
        if (!cancelled) setVersion((v) => v + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return (path) => signedUrls.get(path);
}

function PhotoGrid({ photos, onRemove }: { photos: Photo[]; onRemove?: (photo: Photo) => void }) {
  const urlFor = useSignedUrls(photos.map((p) => p.path));
  if (!photos.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md">
          {urlFor(photo.path) ? (
            <a href={urlFor(photo.path)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFor(photo.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
            </a>
          ) : (
            <div className="h-full w-full animate-pulse bg-border" />
          )}
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
