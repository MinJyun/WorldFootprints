import { visibleAchievements, type Achievement } from "@/lib/achievements";

const MEDAL = { 1: "🥉", 2: "🥈", 3: "🥇" } as const;

export function AchievementList({ achievements }: { achievements: Achievement[] }) {
  const shown = visibleAchievements(achievements);
  // 已達成:新的在前,沒日期的放最後;進行中:越接近達成越前面
  const unlocked = shown
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const inProgress = shown
    .filter((a) => !a.unlocked)
    .sort((a, b) => b.progress / b.target - a.progress / a.target);

  return (
    <div className="max-h-[560px] space-y-4 overflow-y-auto">
      <Group title="已達成" empty="還沒有達成的成就" items={unlocked} />
      <Group title="進行中" empty="" items={inProgress} />
    </div>
  );
}

function Group({ title, empty, items }: { title: string; empty: string; items: Achievement[] }) {
  if (!items.length && !empty) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">
        {title}
        {items.length > 0 && <span className="ml-2 text-muted">{items.length}</span>}
      </h3>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((a) => (
            <Item key={a.id} a={a} />
          ))}
        </ul>
      ) : (
        <p className="text-muted">{empty}</p>
      )}
    </section>
  );
}

function Item({ a }: { a: Achievement }) {
  return (
    <li className={`flex gap-3 rounded-lg border border-border px-3 py-2 ${a.unlocked ? "" : "opacity-60"}`}>
      <span className={`text-2xl ${a.unlocked ? "" : "grayscale"}`}>{MEDAL[a.tier]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{a.name}</p>
        <p className="text-xs text-muted">{a.description}</p>
        {a.unlocked ? (
          <p className="text-xs text-accent">{a.date ? `${a.date} 達成` : "已達成（那趟沒填日期）"}</p>
        ) : (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <div className="h-full bg-accent" style={{ width: `${(a.progress / a.target) * 100}%` }} />
            </div>
            {a.progress} / {a.target}
          </div>
        )}
      </div>
    </li>
  );
}
