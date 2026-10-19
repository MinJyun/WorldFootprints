# 功能規劃:追蹤、成就、景點美食

最後更新:2026-10-19。狀態:規劃中,資料表為草案,尚未套用到 Supabase。

## 建議實作順序

1. **追蹤制**:改動最大(權限、登入方式、照片都要動),也是後兩項的前提
2. **點國家看追蹤的人的旅程**:追蹤做完後幾乎是順手的事
3. **成就**:先做「國家/地區次數」類,只靠現有旅程資料就能算
4. **景點美食**:等成就跑起來、知道想要哪些成就後再定資料結構

---

## 1. 追蹤制

### 規則(建議)

- 單向追蹤、需要對方同意(類似 IG 私人帳號):A 申請追蹤 B → B 同意 → A 看得到 B 的地圖。B 要看 A,得另外申請。
- 自己永遠看得到自己的。
- 帳號名稱、顯示名稱維持公開(才能被搜尋、申請追蹤);旅程、地點、照片只給自己和已同意的追蹤者看。
- 對方可以隨時移除追蹤者;自己可以隨時取消追蹤。

### 資料表

```sql
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- 判斷目前登入者能不能看 owner 的資料;security definer 避免 RLS 互相遞迴
create function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = auth.uid() or exists (
    select 1 from public.follows
    where follower_id = auth.uid() and followee_id = owner and status = 'accepted'
  );
$$;
```

- `follows` 的權限:申請者只能新增自己的 `pending`;被追蹤者可以把狀態改成 `accepted`;雙方都可以刪除(拒絕、移除、取消追蹤)。
- `trips`、`trip_places`、`photos` 的讀取權限從「所有人」改成 `can_view(user_id)`。

### 連帶要改的地方

| 項目 | 現在 | 改成 |
|---|---|---|
| 伺服器端讀資料 | 用匿名身分讀(資料公開所以沒差) | 改用 `@supabase/ssr` 把登入狀態存 cookie,伺服器以登入者身分讀,RLS 才能判斷 |
| 照片 | 公開 bucket,知道網址就能看 | 改私有 bucket + 短期簽名網址,storage 的讀取權限也用 `can_view` |
| 首頁「旅人們」 | 列出所有人與國家數 | 改成「我追蹤的人」+ 用帳號名稱搜尋 |
| 別人的頁面 `/u/xxx` | 直接看到地圖 | 沒權限時顯示「申請追蹤」按鈕 |
| 新增頁面 | 無 | 追蹤申請通知(待同意清單) |
| 隱私權政策 | 寫「旅程公開」 | 改成「只有你同意的追蹤者看得到」 |

## 2. 點國家看追蹤的人的旅程

在現有「點國家」的面板下面加一區「追蹤中的人」,列出去過這裡的人和他們的旅程。

- 不用新資料表:用 `country_code` 查 `trip_places`,RLS 會自動只回傳看得到的人。
- 之後可以加地圖開關「疊上朋友的足跡」,這次先不做。

## 3. 成就

### 做法

- 成就的**定義**放資料表,規則用少數幾種類型組合,新增同類型成就只要加一列資料、不用改程式。
- **解鎖不另外存**,每次從旅程算出來;解鎖日期就是「達標那一趟旅程」的日期。這樣補登舊旅程也會正確解鎖,刪掉旅程也會正確收回。
- 之後如果要「新解鎖通知」,再加 `user_achievements` 記錄已通知過的。

### 資料表

```sql
create table public.achievements (
  id text primary key,                -- 例:country-visits-3
  name text not null,                 -- 可用 {place} 代入地名,例:{place}初級旅人
  description text not null,
  tier smallint not null default 1,   -- 1 銅、2 銀、3 金
  rule jsonb not null,
  sort smallint not null default 0
);
alter table public.achievements enable row level security;
create policy "achievements are public" on public.achievements for select using (true);
-- 只從 Supabase 後台新增,不開放寫入權限
```

### 規則類型(第一批,只需要現有資料)

| rule | 意思 | 範例 |
|---|---|---|
| `{"type":"place_visits","place":"*","count":3}` | 同一個國家去 N 次;`*` 代表每個國家各自一個成就 | 日本初級旅人(3 次)、中級(5 次)、高級(10 次) |
| `{"type":"countries","count":10}` | 去過 N 個國家 | 十國旅人 |
| `{"type":"regions","country":"JP","count":47}` | 某國去過 N 個地區 | 日本 47 都道府縣制霸 |
| `{"type":"continent","continent":"EU","count":10}` | 某洲去過 N 國 | 歐洲十國 |
| `{"type":"lived","count":2}` | 住過 N 個國家 | 雙城生活 |

次數的算法沿用地圖亮度:一趟旅程算一次、路過不算。

## 4. 景點與美食

### 要先決定:景點是共用的還是各記各的?

- **各記各的**(每趟旅程自己打字記「吃了什麼、去了哪」):最簡單,但成就只能算「記了幾筆」,沒辦法做「京都三大寺制霸」這種。
- **共用景點庫**(大家從同一份清單選,找不到再新增):成就能指定特定景點,朋友間也能比較「你也去過這家」;缺點是會有重複或錯字,之後可以接 Google Places 的 ID 來去重。

建議用共用景點庫:

```sql
create table public.spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('sight', 'food', 'stay', 'other')),
  country_code text not null,
  region_code text not null default '',
  lat double precision,
  lng double precision,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.trip_spots (
  trip_id uuid not null references public.trips (id) on delete cascade,
  spot_id uuid not null references public.spots (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 1000),
  rating smallint check (rating between 1 and 5),
  primary key (trip_id, spot_id)
);
```

這樣成就可以再加兩種規則:

- `{"type":"spots","category":"food","country":"JP","count":20}`:在日本吃過 20 家
- `{"type":"spot_set","spots":["<id>", "<id>", "<id>"]}`:指定景點全部去過,例如京都三大寺

## 待決定

1. 追蹤要單向(建議),還是雙方互相同意變成好友?
2. 首頁還要不要公開列出所有使用者的名字?(資料本身不公開)
3. 景點要共用景點庫(建議),還是各記各的?
4. 成就的第一批清單(次數門檻、要哪些洲或地區制霸)
