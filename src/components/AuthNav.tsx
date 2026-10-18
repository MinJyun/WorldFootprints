"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { homePathForCurrentUser } from "@/lib/auth";

export function AuthNav() {
  // undefined = 檢查中;null = 未登入
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();

  // 換頁時重新確認,涵蓋登入、登出與剛建立帳號的情況
  useEffect(() => {
    homePathForCurrentUser().then(setHome);
  }, [pathname]);

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
