import Link from "next/link";
import { Suspense } from "react";
import { listTravelers } from "@/lib/data";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 py-10 text-center">
        <h1 className="text-4xl font-bold">
          把去過的地方<span className="text-accent">點亮</span>
        </h1>
        <p className="text-muted">
          在世界地圖上標記你的旅行足跡，日本可以細到都道府縣。
          <br />
          記下日期、筆記和照片，和朋友互相看看彼此去過哪裡。
        </p>
        <Link href="/login" className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-black">
          開始紀錄
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">旅人們</h2>
        <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
          <Travelers />
        </Suspense>
      </section>
    </div>
  );
}

async function Travelers() {
  const travelers = await listTravelers();
  if (!travelers.length) return <p className="text-sm text-muted">還沒有人，來當第一個吧</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {travelers.map((t) => (
        <li key={t.id}>
          <Link
            href={`/u/${t.username}`}
            className="flex items-center justify-between rounded-xl border border-border bg-panel px-4 py-3 hover:border-accent"
          >
            <span>
              <span className="font-medium">{t.display_name}</span>
              <span className="ml-2 text-sm text-muted">@{t.username}</span>
            </span>
            <span className="text-sm text-accent">{t.countryCount} 國</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
