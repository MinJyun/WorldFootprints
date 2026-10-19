"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/places";

type Follow = { follower: Profile; followee: Profile; status: "pending" | "accepted" };

const COLUMNS =
  "status, follower:profiles!follows_follower_id_fkey(id, username, display_name), followee:profiles!follows_followee_id_fkey(id, username, display_name)";

export default function FriendsPage() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [follows, setFollows] = useState<Follow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (uid: string) => {
    const { data, error } = await getBrowserClient()
      .from("follows")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .returns<Follow[]>();
    if (error) setError(error.message);
    else {
      setMe(uid);
      setFollows(data);
    }
  }, []);

  useEffect(() => {
    getBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) reload(data.session.user.id);
        else router.replace("/login");
      });
  }, [reload, router]);

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await action;
    if (error) setError(error.message);
    else if (me) reload(me);
  }

  const table = () => getBrowserClient().from("follows");
  const pair = (f: Follow) => ({ follower_id: f.follower.id, followee_id: f.followee.id });
  const accept = (f: Follow) => run(table().update({ status: "accepted" }).match(pair(f)));
  const remove = (f: Follow) => run(table().delete().match(pair(f)));

  if (!follows || !me) return <p className="py-10 text-center text-muted">{error ?? "載入中…"}</p>;

  const incoming = follows.filter((f) => f.followee.id === me);
  const outgoing = follows.filter((f) => f.follower.id === me);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-6 text-sm">
      <h1 className="text-2xl font-bold">朋友</h1>
      <SearchUser />
      {error && <p className="text-red-400">{error}</p>}

      <Section title="追蹤申請" empty="沒有新的申請" rows={incoming.filter((f) => f.status === "pending")}>
        {(f) => (
          <Row profile={f.follower}>
            <button onClick={() => accept(f)} className="rounded-lg bg-accent px-3 py-1 font-medium text-black">
              同意
            </button>
            <button onClick={() => remove(f)} className="text-muted hover:text-red-400">
              拒絕
            </button>
          </Row>
        )}
      </Section>

      <Section title="我追蹤的人" empty="還沒有追蹤任何人" rows={outgoing}>
        {(f) => (
          <Row profile={f.followee}>
            {f.status === "pending" && <span className="text-muted">等待同意</span>}
            <button onClick={() => remove(f)} className="text-muted hover:text-red-400">
              {f.status === "pending" ? "取消申請" : "取消追蹤"}
            </button>
          </Row>
        )}
      </Section>

      <Section title="追蹤我的人" empty="還沒有人追蹤你" rows={incoming.filter((f) => f.status === "accepted")}>
        {(f) => (
          <Row profile={f.follower}>
            <button onClick={() => remove(f)} className="text-muted hover:text-red-400">
              移除
            </button>
          </Row>
        )}
      </Section>
    </div>
  );
}

function SearchUser() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (username) router.push(`/u/${username}`);
      }}
      className="flex gap-2"
    >
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
        placeholder="輸入對方的帳號名稱"
        className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2"
      />
      <button className="rounded-lg border border-border px-3 py-2 hover:border-accent">找人</button>
    </form>
  );
}

function Section({
  title,
  empty,
  rows,
  children,
}: {
  title: string;
  empty: string;
  rows: Follow[];
  children: (f: Follow) => React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">
        {title}
        {rows.length > 0 && <span className="ml-2 text-muted">{rows.length}</span>}
      </h2>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((f) => (
            <li key={`${f.follower.id}-${f.followee.id}`}>{children(f)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{empty}</p>
      )}
    </section>
  );
}

function Row({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-4 py-3">
      <Link href={`/u/${profile.username}`} className="min-w-0 truncate hover:text-accent">
        <span className="font-medium">{profile.display_name}</span>
        <span className="ml-2 text-muted">@{profile.username}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}
