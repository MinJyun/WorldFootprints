import { getBrowserClient } from "./supabase";

// 登入後該去哪:有 profile 去自己的地圖,沒有就去設定帳號
export async function homePathForCurrentUser(): Promise<string | null> {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  return profile ? `/u/${profile.username}` : "/onboarding";
}
