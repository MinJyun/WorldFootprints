"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { TRIP_COLUMNS, toTrip, type Photo, type Profile, type Trip, type TripRow } from "@/lib/places";
import { FootprintsView } from "./FootprintsView";

export type FriendTrip = { owner: Profile; trip: Trip };

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "guest" }
  | { status: "locked"; viewerId: string; pending: boolean }
  | { status: "ready"; trips: Trip[]; photos: Photo[]; friendTrips: FriendTrip[] };

// 旅程只有本人與已同意的追蹤者看得到(由 RLS 把關),所以在瀏覽器端用登入者身分讀
export function UserFootprints({ profile }: { profile: Profile }) {
  // undefined = 檢查中;null = 未登入
  const [viewerId, setViewerId] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const { data } = getBrowserClient().auth.onAuthStateChange((_event, session) => {
      setViewerId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (viewerId === undefined) return;
    let cancelled = false;
    load(profile.id, viewerId)
      .then((next) => !cancelled && setState(next))
      .catch((e: { message?: string }) => !cancelled && setState({ status: "error", message: e.message ?? String(e) }));
    return () => {
      cancelled = true;
    };
  }, [profile.id, viewerId]);

  switch (state.status) {
    case "loading":
      return <p className="text-muted">載入中…</p>;
    case "error":
      return <p className="text-red-400">讀取失敗：{state.message}</p>;
    case "ready":
      return (
        <FootprintsView profile={profile} trips={state.trips} photos={state.photos} friendTrips={state.friendTrips} />
      );
    default:
      return (
        <FollowGate
          profile={profile}
          state={state}
          onChange={(pending) => state.status === "locked" && setState({ ...state, pending })}
        />
      );
  }
}

async function load(ownerId: string, viewerId: string | null): Promise<State> {
  const supabase = getBrowserClient();
  const isOwner = viewerId === ownerId;

  if (!isOwner) {
    if (!viewerId) return { status: "guest" };
    const { data, error } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", viewerId)
      .eq("followee_id", ownerId)
      .maybeSingle<{ status: string }>();
    if (error) throw error;
    if (data?.status !== "accepted") return { status: "locked", viewerId, pending: !!data };
  }

  const [trips, photos, friends] = await Promise.all([
    supabase.from("trips").select(TRIP_COLUMNS).eq("user_id", ownerId).returns<TripRow[]>(),
    supabase.from("photos").select("id, trip_id, path").eq("user_id", ownerId).order("created_at").returns<Photo[]>(),
    // 看自己的地圖時,一併讀追蹤中的人的旅程(RLS 只會回傳看得到的)
    isOwner
      ? supabase
          .from("trips")
          .select(`${TRIP_COLUMNS}, owner:profiles(id, username, display_name)`)
          .neq("user_id", ownerId)
          .returns<(TripRow & { owner: Profile })[]>()
      : null,
  ]);
  if (trips.error) throw trips.error;
  if (photos.error) throw photos.error;
  if (friends?.error) throw friends.error;

  return {
    status: "ready",
    trips: trips.data.map(toTrip),
    photos: photos.data,
    friendTrips: (friends?.data ?? []).map(({ owner, ...row }) => ({ owner, trip: toTrip(row) })),
  };
}

function FollowGate({
  profile,
  state,
  onChange,
}: {
  profile: Profile;
  state: Extract<State, { status: "guest" | "locked" }>;
  onChange: (pending: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (state.status !== "locked") return;
    setBusy(true);
    setError(null);
    const follows = getBrowserClient().from("follows");
    const { error } = state.pending
      ? await follows.delete().eq("follower_id", state.viewerId).eq("followee_id", profile.id)
      : await follows.insert({ follower_id: state.viewerId, followee_id: profile.id });
    if (error) setError(error.message);
    else onChange(!state.pending);
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 py-10 text-center">
      <h1 className="text-2xl font-bold">{profile.display_name}</h1>
      <p className="text-muted">@{profile.username} 的足跡只有追蹤者看得到</p>
      {state.status === "guest" ? (
        <Link href="/login" className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-black">
          登入後申請追蹤
        </Link>
      ) : state.pending ? (
        <div className="space-y-2">
          <p>已送出申請，等對方同意</p>
          <button onClick={toggle} disabled={busy} className="text-sm text-muted hover:text-foreground disabled:opacity-50">
            取消申請
          </button>
        </div>
      ) : (
        <button
          onClick={toggle}
          disabled={busy}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-black disabled:opacity-50"
        >
          申請追蹤
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
