"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { homePathForCurrentUser } from "@/lib/auth";

export function AuthNav() {
  // undefined = 檢查中;null = 未登入
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const [requests, setRequests] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  // 換頁時重新確認,涵蓋登入、登出與剛建立帳號的情況
  useEffect(() => {
    homePathForCurrentUser().then(setHome);
    pendingRequests().then(setRequests);
  }, [pathname]);

  // 在其他分頁登入或登出時同步
  useEffect(() => {
    const { data } = getBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") homePathForCurrentUser().then(setHome);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (home === undefined) return null;
  if (home === null) {
    return (
      <Link href="/login" className="rounded-lg bg-accent px-3 py-1.5 font-medium text-black">
        登入
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <Link href={home} className="hover:text-accent">
        我的地圖
      </Link>
      <Link href="/friends" className="hover:text-accent">
        朋友
        {requests > 0 && (
          <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-medium text-black">{requests}</span>
        )}
      </Link>
      <button
        onClick={async () => {
          await getBrowserClient().auth.signOut();
          setHome(null);
          router.push("/");
        }}
        className="text-muted hover:text-foreground"
      >
        登出
      </button>
    </div>
  );
}

// 別人對我送出、還沒處理的追蹤申請數
async function pendingRequests(): Promise<number> {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 0;
  const { count } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("followee_id", data.session.user.id)
    .eq("status", "pending");
  return count ?? 0;
}
