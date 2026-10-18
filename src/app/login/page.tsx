"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error } = await getBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="text-2xl font-bold">登入 / 註冊</h1>
      {status === "sent" ? (
        <p className="text-muted">
          登入連結已寄到 <span className="text-foreground">{email}</span>，請用<strong>這個瀏覽器</strong>打開信裡的連結。
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted">輸入 Email，我們會寄一封登入連結給你，不需要密碼。</p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2"
          />
          <button
            disabled={status === "sending"}
            className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-black disabled:opacity-50"
          >
            {status === "sending" ? "寄送中…" : "寄送登入連結"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      )}
    </div>
  );
}
