import type { Metadata } from "next";

export const metadata: Metadata = { title: "隱私權政策" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">隱私權政策</h1>
      <p className="text-muted">最後更新：2026-10-21</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">我們收集哪些資料</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>使用 Google 登入時，Google 提供的 Email 與名字，用來識別你的帳號。</li>
          <li>你自行填寫的帳號名稱、顯示名稱、旅程紀錄（地點、日期、筆記）與上傳的照片。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">哪些資料是公開的</h2>
        <p>
          你的帳號名稱與顯示名稱是公開的，讓朋友可以找到你並申請追蹤。旅程紀錄與照片只有你和你同意的追蹤者看得到。Email
          不會公開顯示。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">資料存放與分享</h2>
        <p>資料存放於 Supabase，網站部署於 Vercel。我們不會出售或提供你的資料給其他第三方。</p>
        <p>
          搜尋景點時，你輸入的關鍵字會由你的瀏覽器直接送到 OpenStreetMap 的 Nominatim 搜尋服務（不含你的帳號資料），適用其
          <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer" className="underline">
            隱私權政策
          </a>
          。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">刪除資料</h2>
        <p>
          你可以隨時在網站上刪除自己的旅程與照片。如需刪除整個帳號，請到{" "}
          <a href="https://github.com/MinJyun/WorldFootprints/issues" className="text-accent hover:underline">
            GitHub Issues
          </a>{" "}
          聯絡網站管理員。
        </p>
      </section>
    </article>
  );
}
