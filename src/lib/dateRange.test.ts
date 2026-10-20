import { describe, expect, it } from "vitest";
import { pickDay } from "./dateRange";

describe("pickDay", () => {
  it("第一下先當成單日,等待結束日", () => {
    expect(pickDay("", false, "2025-05-19")).toEqual({ start: "2025-05-19", end: "2025-05-19", done: false });
  });

  it("第二下在開始日之後:成為結束日", () => {
    expect(pickDay("2025-05-19", true, "2025-05-26")).toEqual({ start: "2025-05-19", end: "2025-05-26", done: true });
  });

  it("第二下在開始日之前:自動對調", () => {
    expect(pickDay("2025-05-30", true, "2025-05-10")).toEqual({ start: "2025-05-10", end: "2025-05-30", done: true });
  });

  it("同一天點兩下:單日旅程", () => {
    expect(pickDay("2025-05-12", true, "2025-05-12")).toEqual({ start: "2025-05-12", end: "2025-05-12", done: true });
  });

  it("跨月、跨年也照日期先後", () => {
    expect(pickDay("2025-12-28", true, "2026-01-03")).toEqual({ start: "2025-12-28", end: "2026-01-03", done: true });
    expect(pickDay("2026-01-03", true, "2025-12-28")).toEqual({ start: "2025-12-28", end: "2026-01-03", done: true });
  });

  it("選完後再點:重新開始", () => {
    expect(pickDay("2025-05-19", false, "2025-06-01")).toEqual({ start: "2025-06-01", end: "2025-06-01", done: false });
  });
});
