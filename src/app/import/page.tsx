"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { homePathForCurrentUser } from "@/lib/auth";
import { TRIP_COLUMNS, toTrip, type Trip, type TripRow } from "@/lib/places";
import { TimelineImport } from "@/components/TimelineImport";

export default function ImportPage() {
  const router = useRouter();
  const [state, setState] = useState<{ userId: string; trips: Trip[]; home: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return router.replace("/login");
      const { data: rows, error } = await supabase.from("trips").select(TRIP_COLUMNS).eq("user_id", userId).returns<TripRow[]>();
      if (error) return setError(error.message);
      setState({ userId, trips: rows.map(toTrip), home: await homePathForCurrentUser() });
    });
  }, [router]);

  if (!state) return <p className="py-10 text-center text-muted">{error ?? "載入中…"}</p>;
  return <TimelineImport {...state} />;
}
