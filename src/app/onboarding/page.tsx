"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 顯示名稱預設帶入 Google 帳號的名字
  useEffect(() => {
    getBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        const name = data.session?.user.user_metadata.full_name;
        if (typeof name === "string") setDisplayName((current) => current || name.slice(0, 40));
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getBrowserClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/login");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .insert({ id: data.session.user.id, username, display_name: displayName.trim() });
    if (error) {
      setError(error.code === "23505" ? "這個帳號名稱已經有人用了" : error.message);
      setBusy(false);
      return;
    }
    router.push(`/u/${username}`);
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="text-2xl font-bold">設定你的帳號</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted">帳號名稱（網址會是 /u/帳號名稱）</span>
          <input
            required
            pattern="[a-z0-9_]{3,20}"
            title="3–20 個小寫英文、數字或底線"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">顯示名稱</span>
          <input
            required
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2"
          />
        </label>
        <button
          disabled={busy}
          className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-black disabled:opacity-50"
        >
          {busy ? "建立中…" : "建立"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
