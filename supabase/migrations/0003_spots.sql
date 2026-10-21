-- 景點與美食:共用景點庫 + 每趟旅程去過的景點
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可(要先執行過 0001、0002)

-- 共用景點庫:一律從 OpenStreetMap 搜尋結果建立,osm_id 唯一以避免重複
-- 不記錄建立者:誰先建了某個景點,等於透露他去過
create table public.spots (
  id uuid primary key default gen_random_uuid(),
  osm_id text not null unique check (osm_id ~ '^[NWR][0-9]+$'), -- 例:N123456(node)、W…(way)、R…(relation)
  name text not null check (char_length(name) between 1 and 200),
  category text not null check (category in ('sight', 'food', 'stay', 'other')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region_code text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

-- 某趟旅程去過的景點;評分與心得是個人的
create table public.trip_spots (
  trip_id uuid not null references public.trips on delete cascade,
  spot_id uuid not null references public.spots on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  rating smallint check (rating between 1 and 5),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  primary key (trip_id, spot_id)
);

create index trip_spots_user_id_idx on public.trip_spots (user_id);
create index trip_spots_spot_id_idx on public.trip_spots (spot_id);

alter table public.spots enable row level security;
alter table public.trip_spots enable row level security;

-- 景點本身是公開地點,登入者都能讀、都能新增;不開放修改刪除
create policy "登入者可讀 spots" on public.spots for select to authenticated using (true);
create policy "登入者新增 spots" on public.spots for insert to authenticated with check (true);

-- 誰去過哪裡跟旅程一樣,只給本人與已同意的追蹤者看
create policy "本人與追蹤者可讀 trip_spots" on public.trip_spots for select using (public.can_view(user_id));
create policy "本人新增 trip_spots" on public.trip_spots for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
);
create policy "本人更新 trip_spots" on public.trip_spots for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "本人刪除 trip_spots" on public.trip_spots for delete to authenticated using ((select auth.uid()) = user_id);

-- 只能改評分與心得
revoke update on public.trip_spots from anon, authenticated;
grant update (rating, note) on public.trip_spots to authenticated;
