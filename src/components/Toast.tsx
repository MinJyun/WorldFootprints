"use client";

import { useEffect, useState } from "react";

// 全站共用的短暫提示:任何地方呼叫 toast("已儲存"),由 layout 裡的 <Toaster /> 顯示
let show: ((message: string) => void) | undefined;

export function toast(message: string) {
  show?.(message);
}

export function Toaster() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    show = (text) => setMessage({ text, id: Date.now() });
    return () => {
      show = undefined;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div
      key={message.id}
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-[toast-in_.2s_ease-out] rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-black shadow-lg"
    >
      ✓ {message.text}
    </div>
  );
}
