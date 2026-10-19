-- 追蹤制:旅程、地點、照片只有本人與「已同意的追蹤者」看得到
-- 帳號名稱與顯示名稱維持公開(才能被找到、申請追蹤)
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可

-- 單向追蹤:follower 申請追蹤 followee,followee 同意後 status 變 accepted
create table public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  followee_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_id_idx on public.follows (followee_id);

alter table public.follows enable row level security;

create policy "雙方可讀 follows" on public.follows for select to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));
create policy "本人申請追蹤" on public.follows for insert to authenticated
  with check ((select auth.uid()) = follower_id and status = 'pending');
create policy "被追蹤者同意" on public.follows for update to authenticated
  using ((select auth.uid()) = followee_id)
  with check ((select auth.uid()) = followee_id and status = 'accepted');
-- 拒絕、移除追蹤者、取消追蹤都是刪除
create policy "雙方可刪 follows" on public.follows for delete to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

-- 同意時只能改 status,不能改成別人
revoke update on public.follows from anon, authenticated;
grant update (status) on public.follows to authenticated;

-- 目前登入者能不能看 owner 的資料。security definer 讓它不受 follows 的 RLS 影響
create function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = (select auth.uid()) or exists (
    select 1 from public.follows f
    where f.follower_id = (select auth.uid()) and f.followee_id = owner and f.status = 'accepted'
  );
$$;

-- 讀取權限:公開 → 本人或追蹤者
drop policy "trips 公開可讀" on public.trips;
drop policy "trip_places 公開可讀" on public.trip_places;
drop policy "photos 公開可讀" on public.photos;

create policy "本人或追蹤者可讀 trips" on public.trips for select using (public.can_view(user_id));
create policy "本人或追蹤者可讀 trip_places" on public.trip_places for select using (public.can_view(user_id));
create policy "本人或追蹤者可讀 photos" on public.photos for select using (public.can_view(user_id));

-- 照片 bucket 改私有,改用有時效的簽名網址顯示
update storage.buckets set public = false where id = 'photos';

create policy "本人或追蹤者可讀照片" on storage.objects for select
  using (bucket_id = 'photos' and public.can_view(((storage.foldername(name))[1])::uuid));
