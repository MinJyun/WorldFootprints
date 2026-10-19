import "server-only";
import { connection } from "next/server";
import { createPublicClient } from "./supabase";
import type { Profile } from "./places";

// 伺服器端只讀公開的 profile;旅程等資料要看登入者有沒有權限,由瀏覽器端讀取
export async function getProfile(username: string) {
  await connection();
  const { data, error } = await createPublicClient()
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle<Profile>();
  if (error) throw error;
  return data;
}
