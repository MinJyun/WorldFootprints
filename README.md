# World Footprints

把去過的地方點亮的旅行足跡地圖。每個人有自己的公開頁面 `/u/帳號名稱`。

技術:Next.js 16 + Supabase(登入、資料庫、照片)+ d3-geo,部署在 Vercel。

## 紀錄方式

以「旅程」為單位:一趟旅程有日期區間、依路線順序的多個地點、筆記與照片。旅程分旅遊、生活過兩種;每個地點可標記為「路過」(轉機、車窗經過)。

地圖顏色依去過的次數:生活過為青色;旅遊 1 次、2–3 次、4 次以上越來越亮;只有路過最暗。同一趟旅程裡在某國有停留就算去過,路過不計入去過的國家數。

日本可細分到都道府縣、美國可細分到州。

## 第一次設定

1. 到 [supabase.com](https://supabase.com) 建立專案
2. Dashboard → SQL Editor,依序貼上 `supabase/migrations/` 下的每個檔案(0001、0002…)全文執行
3. Dashboard → Authentication → URL Configuration
   - Site URL:正式網址(例如 `https://xxx.vercel.app`)
   - Redirect URLs:加入 `http://localhost:3000/auth/callback` 與 `https://xxx.vercel.app/auth/callback`
4. 設定 Google 登入(見下方)
5. 複製 `.env.example` 為 `.env.local`,填入 Project Settings → API 的 URL 與 publishable key
6. `npm install && npm run dev`

## 設定 Google 登入

1. [Google Cloud Console](https://console.cloud.google.com) 建立專案 → Google Auth Platform
2. Branding 填應用程式名稱與 Email;Audience 選 External,並按 Publish app 讓所有人都能登入
3. Clients → Create client → Web application
   - Authorized JavaScript origins:`https://xxx.vercel.app`、`http://localhost:3000`
   - Authorized redirect URIs:`https://<Supabase 專案 ID>.supabase.co/auth/v1/callback`
4. 把 Client ID 與 Client secret 填到 Supabase → Authentication → Sign In / Providers → Google 並啟用

## 部署到 Vercel

在 Vercel 匯入此 repo,Environment Variables 填入與 `.env.local` 相同的兩個變數即可。

## 結構

- `src/app/u/[username]` 個人地圖頁(公開)
- `src/components/FootprintsView.tsx` 地圖、統計與切換世界/分區地圖
- `src/components/TripPanel.tsx` 旅程清單、地點、旅程內容與編輯(日期、地點、筆記、照片)
- `src/lib/maps.ts` 地圖投影設定;要新增其他國家的下鑽地圖從這裡加
- `public/geo/` 地圖資料:world-atlas 50m 與 110m(地球儀轉動時用)、us-atlas states-10m、[dataofjapan/land](https://github.com/dataofjapan/land)(已用 mapshaper 簡化)
  - 台灣 22 縣市:[taiwan-atlas](https://github.com/dkaoster/taiwan-atlas)(內政部資料)
  - 南韓、泰國:[Natural Earth](https://www.naturalearthdata.com/) admin-1 10m(公有領域)
  - 越南 2025 年新制 34 省市:[OCHA HDX](https://data.humdata.org/dataset/cod-ab-vnm),資料來源越南統計總局(GSO),CC BY-IGO

寫入一律由瀏覽器直接呼叫 Supabase,權限由資料庫 RLS 控管:所有人可讀,只有本人可寫。
