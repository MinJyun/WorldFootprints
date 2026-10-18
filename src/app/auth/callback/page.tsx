"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { homePathForCurrentUser } from "@/lib/auth";

// supabase-js 初始化時會自動用網址上的 code 換取登入狀態
export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    homePathForCurrentUser().then((path) => {
      if (path) router.replace(path);
      else setFailed(true);
    });
  }, [router]);

  return (
    <p className="py-10 text-center text-muted">
      {failed ? "登入失敗，請重新登入。" : "登入中…"}
    </p>
  );
}
