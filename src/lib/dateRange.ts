// 日期區間的點選規則,日期為 "YYYY-MM-DD"(字串比較即日期先後)。
// 第一下選開始日(先當成單日);第二下選結束日,點在開始日之前會自動對調;選完再點就重新開始
export function pickDay(
  start: string,
  pickingEnd: boolean,
  day: string,
): { start: string; end: string; done: boolean } {
  if (!pickingEnd || !start) return { start: day, end: day, done: false };
  const [a, b] = day < start ? [day, start] : [start, day];
  return { start: a, end: b, done: true };
}
