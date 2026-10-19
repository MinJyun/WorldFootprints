import Link from "next/link";

export default function Home() {
  return (
    <section className="space-y-4 py-10 text-center">
      <h1 className="text-4xl font-bold">
        把去過的地方<span className="text-accent">點亮</span>
      </h1>
      <p className="text-muted">
        在世界地圖上標記你的旅行足跡，日本可以細到都道府縣、美國細到州。
        <br />
        記下日期、筆記和照片，追蹤朋友、互相看看彼此去過哪裡。
      </p>
      <Link href="/login" className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-black">
        開始紀錄
      </Link>
    </section>
  );
}
