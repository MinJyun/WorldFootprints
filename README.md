# World Footprints

把去過的地方點亮的旅行足跡地圖。每個人有自己的頁面 `/u/帳號名稱`,只有自己和同意追蹤的人看得到。

技術:Next.js 16 + Supabase(登入、資料庫、照片)+ d3-geo,部署在 Vercel。

## 紀錄方式

以「旅程」為單位:一趟旅程有日期區間、依路線順序的多個地點、筆記與照片。旅程分旅遊、生活過兩種;每個地點可標記為「路過」(轉機、車窗經過)。

地圖顏色依去過的次數:生活過為青色(旅遊次數越多越亮);旅遊 1 次、2–3 次、4 次以上越來越亮;只有路過最暗。同一趟旅程裡在某國有停留就算去過,路過不計入去過的國家數。

可細分到行政區的國家:日本(都道府縣)、美國(州)、台灣(縣市)、南韓(市道)、泰國(府)、越南(省市)。

**景點與美食**:旅程存檔後可以搜尋並加入去過的景點、餐廳、住宿,各自評分與寫一句心得。景點從 OpenStreetMap(Nominatim)搜尋,存進共用景點庫,同一個地點大家共用一筆;景點所在的縣市或府會自動加進旅程的地點。

**成就**:依旅程自動計算(同一國去幾次、去過幾國、各洲、地區制霸等),定義在 `src/lib/achievements.ts`,不另外存資料表。

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

## 測試

```bash
npm test
```

用 Vitest 測統計規則、排序、日期、名稱,以及 `public/geo` 地圖檔與名稱表、統計分母是否一致。推上 GitHub 時會由 GitHub Actions 自動跑 lint、型別檢查與測試(`.github/workflows/ci.yml`)。

新增可細分的國家時,地圖檔、`places.ts` 名稱表、`DRILLDOWNS`、`DRILLDOWN_MAPS` 四處都要加,漏了測試會失敗。

## 部署到 Vercel

在 Vercel 匯入此 repo,Environment Variables 填入與 `.env.local` 相同的兩個變數即可。

## 結構

- `src/app/u/[username]` 個人地圖頁(本人與追蹤者可看)
- `src/components/FootprintsView.tsx` 地圖、統計與切換世界/分區地圖
- `src/components/TripPanel.tsx` 旅程清單、地點、旅程內容與編輯(日期、地點、筆記、照片)
- `src/components/SpotPanel.tsx`、`src/lib/spots.ts` 景點搜尋、加入與顯示
- `src/lib/maps.ts` 地圖投影設定;要新增其他國家的下鑽地圖從這裡加
- `public/geo/` 地圖資料:world-atlas 50m 與 110m(地球儀轉動時用)、us-atlas states-10m、[dataofjapan/land](https://github.com/dataofjapan/land)(已用 mapshaper 簡化)
  - 台灣 22 縣市:[taiwan-atlas](https://github.com/dkaoster/taiwan-atlas)(內政部資料)
  - 南韓、泰國:[Natural Earth](https://www.naturalearthdata.com/) admin-1 10m(公有領域)
  - 越南 2025 年新制 34 省市:[OCHA HDX](https://data.humdata.org/dataset/cod-ab-vnm),資料來源越南統計總局(GSO),CC BY-IGO
- 景點搜尋:[Nominatim](https://nominatim.org/),資料 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 貢獻者(ODbL)。依[使用規範](https://operations.osmfoundation.org/policies/nominatim/)只在按下搜尋時送出,不做邊打邊搜

寫入一律由瀏覽器直接呼叫 Supabase,權限由資料庫 RLS 控管:旅程、地點、照片、去過的景點只有本人與已同意的追蹤者可讀,只有本人可寫;景點庫登入者都可讀可新增。
