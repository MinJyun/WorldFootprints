-- World Footprints 初始資料表
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可

-- 使用者公開資料
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- 旅程:一趟旅行一筆。kind: trip 旅遊 / lived 住過
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null default 'trip' check (kind in ('trip', 'lived')),
  title text check (char_length(title) <= 100),
  start_date date,
  end_date date check (end_date >= start_date),
  note text check (char_length(note) <= 5000),
  created_at timestamptz not null default now()
);

create index trips_user_id_idx on public.trips (user_id);

-- 旅程去過的地點。region_code 為空字串代表整個國家(或沒細分到行政區)
-- transit:只是路過(轉機等);position:路線順序
create table public.trip_places (
  trip_id uuid not null references public.trips on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region_code text not null default '',
  transit boolean not null default false,
  position smallint not null default 0,
  primary key (trip_id, country_code, region_code)
);

create index trip_places_user_id_idx on public.trip_places (user_id);

-- 照片:檔案放 Storage 的 photos bucket,路徑為 {user_id}/{trip_id}/{檔名}
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  trip_id uuid not null references public.trips on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

create index photos_trip_id_idx on public.photos (trip_id);

-- RLS:所有人可讀,只有本人可寫
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_places enable row level security;
alter table public.photos enable row level security;

create policy "profiles 公開可讀" on public.profiles for select using (true);
create policy "本人建立 profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "本人更新 profile" on public.profiles for update to authenticated using ((select auth.uid()) = id);

create policy "trips 公開可讀" on public.trips for select using (true);
create policy "本人新增 trips" on public.trips for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "本人更新 trips" on public.trips for update to authenticated using ((select auth.uid()) = user_id);
create policy "本人刪除 trips" on public.trips for delete to authenticated using ((select auth.uid()) = user_id);

create policy "trip_places 公開可讀" on public.trip_places for select using (true);
-- 只能把地點加到自己的旅程
create policy "本人新增 trip_places" on public.trip_places for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
);
create policy "本人刪除 trip_places" on public.trip_places for delete to authenticated using ((select auth.uid()) = user_id);

create policy "photos 公開可讀" on public.photos for select using (true);
create policy "本人新增 photos" on public.photos for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
);
create policy "本人刪除 photos" on public.photos for delete to authenticated using ((select auth.uid()) = user_id);

-- 照片 bucket:公開讀取,單檔 5MB,只收圖片
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "本人上傳照片" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "本人刪除照片" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
