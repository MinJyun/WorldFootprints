import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// 伺服器端只讀公開資料,不帶登入狀態;寫入一律走瀏覽器端,由 RLS 把關
export function createPublicClient(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false } });
}

let browserClient: SupabaseClient | undefined;

export function getBrowserClient(): SupabaseClient {
  browserClient ??= createClient(url, key, { auth: { flowType: "pkce" } });
  return browserClient;
}

export function photoUrl(path: string): string {
  return `${url}/storage/v1/object/public/photos/${path}`;
}
