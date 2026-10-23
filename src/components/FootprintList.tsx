"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import {
  DRILLDOWNS,
  firstVisits,
  hasVisited,
  placeName,
  splitPlaceKey,
  statLabel,
  type PlaceStat,
  type Trip,
} from "@/lib/places";

// 依地點列出去過的國家與行政區:第一次去的日期、去過幾次;onDelete 有傳才能刪除足跡
export function FootprintList({
  trips,
  stats,
  onPick,
  onDelete,
}: {
  trips: Trip[];
  stats: Map<string, PlaceStat>;
  onPick: (key: string) => void;
  onDelete?: (ids: string[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const first = firstVisits(trips);
  // 有日期的依日期由舊到新,沒日期的放最後
  const byDate = (a: string, b: string) => (first.get(a) ?? "9999").localeCompare(first.get(b) ?? "9999");
  const visited = [...stats.entries()].filter(([key, s]) => key !== "US-DC" && hasVisited(s)).map(([key]) => key);
  const countries = visited.filter((key) => !key.includes("-")).sort(byDate);

  const footprintsAt = (key: string) =>
    trips.filter((t) => t.kind === "footprint" && t.places.some((p) => p.key === key)).map((t) => t.id);

  async function remove(key: string) {
    const ids = footprintsAt(key);
    if (!confirm(`從足跡移除「${placeName(key)}」？（旅程裡的紀錄不受影響）`)) return;
    const { error } = await getBrowserClient().from("trips").delete().in("id", ids);
    if (error) return setError(error.message);
    onDelete!(ids);
  }

  const row = (key: string, sub = false) => (
    <div className={`flex items-center gap-2 ${sub ? "pl-4" : ""}`}>
      <button onClick={() => onPick(key)} className={`truncate text-left hover:text-accent ${sub ? "" : "font-medium"}`}>
        {placeName(key)}
      </button>
      <span className="shrink-0 text-xs text-muted">{statLabel(stats.get(key))}</span>
      <span className="ml-auto shrink-0 text-xs text-muted">{first.get(key) ?? ""}</span>
      {onDelete && footprintsAt(key).length > 0 && (
        <button onClick={() => remove(key)} className="shrink-0 text-muted hover:text-red-400" aria-label="從足跡移除">
          ✕
        </button>
      )}
    </div>
  );

  if (!countries.length) return <p className="text-muted">還沒有足跡</p>;
  return (
    <div className="max-h-[560px] space-y-3 overflow-y-auto">
      <p className="text-muted">
        {countries.length} 個國家/地區，依第一次去的日期排列。點地名看那裡的旅程。
      </p>
      <ul className="space-y-3">
        {countries.map((country) => {
          const regions = visited.filter((key) => splitPlaceKey(key)[0] === country && key !== country).sort(byDate);
          const drilldown = DRILLDOWNS[country];
          return (
            <li key={country} className="space-y-1">
              {row(country)}
              {drilldown && regions.length > 0 && (
                <>
                  <p className="pl-4 text-xs text-muted">
                    {regions.length} / {drilldown.total} 個{drilldown.unit}
                  </p>
                  <ul className="space-y-1">
                    {regions.map((key) => (
                      <li key={key}>{row(key, true)}</li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
