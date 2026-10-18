import "server-only";
import { connection } from "next/server";
import { createPublicClient } from "./supabase";
import { TRIP_COLUMNS, toTrip, type Photo, type Profile, type TripRow } from "./places";

export async function getFootprints(username: string) {
  await connection();
  const supabase = createPublicClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle<Profile>();
  if (!profile) return null;

  const [trips, photos] = await Promise.all([
    supabase.from("trips").select(TRIP_COLUMNS).eq("user_id", profile.id).returns<TripRow[]>(),
    supabase.from("photos").select("id, trip_id, path").eq("user_id", profile.id).order("created_at").returns<Photo[]>(),
  ]);
  if (trips.error) throw trips.error;
  if (photos.error) throw photos.error;

  return { profile, trips: trips.data.map(toTrip), photos: photos.data };
}

export type Traveler = Profile & { countryCount: number };

export async function listTravelers(): Promise<Traveler[]> {
  await connection();
  const supabase = createPublicClient();

  const [profiles, places] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Profile[]>(),
    supabase
      .from("trip_places")
      .select("user_id, country_code")
      .eq("transit", false) // 路過不算去過
      .returns<{ user_id: string; country_code: string }[]>(),
  ]);
  if (profiles.error) throw profiles.error;
  if (places.error) throw places.error;

  const countries = new Map<string, Set<string>>();
  for (const p of places.data) {
    if (!countries.has(p.user_id)) countries.set(p.user_id, new Set());
    countries.get(p.user_id)!.add(p.country_code);
  }
  return profiles.data.map((p) => ({ ...p, countryCount: countries.get(p.id)?.size ?? 0 }));
}
