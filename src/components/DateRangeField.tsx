"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { zhTW } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { pickDay } from "@/lib/dateRange";

// 日期以 "YYYY-MM-DD" 字串往來,空字串代表未填
function toDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const THIS_YEAR = new Date().getFullYear();

export function DateRangeField({
  start,
  end,
  openEnded,
  onChange,
}: {
  start: string;
  end: string;
  openEnded: boolean; // 生活過:結束日可以空白代表至今
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);

  const from = toDate(start);
  const to = toDate(end);

  function pick(day: Date) {
    const next = pickDay(start, pickingEnd, toValue(day));
    onChange(next.start, next.end);
    setPickingEnd(!next.done);
    if (next.done) setOpen(false);
  }

  const label = !start ? "選擇日期" : !end ? (openEnded ? `${start} ~ 至今` : start) : start === end ? start : `${start} ~ ${end}`;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setPickingEnd(false);
        }}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-left ${open ? "border-accent" : "border-border"} ${start ? "" : "text-muted"}`}
      >
        {label}
      </button>
      {open && (
        <div className="rounded-lg border border-border p-2">
          <DayPicker
            mode="range"
            locale={zhTW}
            selected={from ? { from, to } : undefined}
            onSelect={(_, day) => pick(day)}
            defaultMonth={from ?? new Date()}
            captionLayout="dropdown"
            startMonth={new Date(1950, 0)}
            endMonth={new Date(THIS_YEAR + 2, 11)}
            className="date-range"
          />
          <div className="flex items-center justify-between px-1 pt-1 text-xs text-muted">
            <span>{pickingEnd ? "再點結束日（同一天就點同一格）" : "點開始日"}</span>
            <span className="flex gap-3">
              {openEnded && start && (
                <button type="button" onClick={() => { onChange(start, ""); setPickingEnd(false); setOpen(false); }} className="hover:text-foreground">
                  至今
                </button>
              )}
              {start && (
                <button type="button" onClick={() => { onChange("", ""); setPickingEnd(false); }} className="hover:text-foreground">
                  清除
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
