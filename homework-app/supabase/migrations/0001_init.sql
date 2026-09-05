-- ============================================================
-- 宿題レビューアプリ 初期スキーマ
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行してください。
-- （先生⇄生徒の招待トークン方式 / 生徒が自由に提出→先生がレビュー）
-- ============================================================

-- ---------- テーブル ----------

-- プロフィール（先生・生徒 共通）。auth.users と 1:1。
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'teacher' check (role in ('teacher', 'student')),
  full_name  text,
  teacher_id uuid references public.profiles (id) on delete set null, -- 生徒の担当先生（先生ならNULL）
  created_at timestamptz not null default now()
);

-- 招待リンク（1本 = 1行）。token はURLに載る推測不能な文字列。
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz,               -- NULL なら無期限
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 生徒が送ってきた宿題（1提出 = 1行）。
create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  comment    text,                      -- 生徒からのひとこと
  file_path  text not null,             -- Storage (task-submissions) 上のパス
  status     text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  created_at timestamptz not null default now()
);

-- 先生の返却（1提出につき1レビュー）。
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  teacher_id    uuid not null references public.profiles (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade, -- RLSを単純にするため冗長保持
  result        text not null check (result in ('approved', 'needs_revision')),  -- ○ / 直し
  comment       text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_submissions_teacher on public.submissions (teacher_id, status);
create index if not exists idx_submissions_student on public.submissions (student_id);
create index if not exists idx_invites_token on public.invites (token);

-- ---------- ヘルパー関数（RLSの自己参照による無限再帰を避けるため SECURITY DEFINER） ----------

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public as $$
  select teacher_id from public.profiles where id = auth.uid()
$$;

-- ---------- 新規ユーザー登録時に profiles を自動作成（既定は先生） ----------
-- 生徒は後で join_teacher() により role='student' に変わる。

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    'teacher'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 招待情報の取得（未ログインでも先生名だけ見せる） ----------

create or replace function public.get_invite_info(invite_token text)
returns table (teacher_name text)
language sql stable security definer set search_path = public as $$
  select p.full_name
  from public.invites i
  join public.profiles p on p.id = i.teacher_id
  where i.token = invite_token
    and i.is_active = true
    and (i.expires_at is null or i.expires_at > now())
$$;

-- ---------- 生徒が先生に参加（token から teacher_id をサーバ側で確定＝改ざん不可） ----------

create or replace function public.join_teacher(invite_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_teacher uuid;
begin
  select teacher_id into v_teacher
  from public.invites
  where token = invite_token
    and is_active = true
    and (expires_at is null or expires_at > now());

  if v_teacher is null then
    raise exception 'invalid_or_expired_invite';
  end if;

  if v_teacher = auth.uid() then
    raise exception 'cannot_join_self';
  end if;

  update public.profiles
  set role = 'student', teacher_id = v_teacher
  where id = auth.uid();
end;
$$;

-- レビュー作成と提出ステータス更新を同一トランザクションで行う。
-- teacher_id / student_id はクライアント値を信用せず、提出行から確定する。
create or replace function public.submit_review(
  p_submission_id uuid,
  p_result text,
  p_comment text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_student_id uuid;
begin
  if p_result not in ('approved', 'needs_revision') then
    raise exception 'invalid_review_result';
  end if;

  if public.my_role() <> 'teacher' then
    raise exception 'teacher_role_required';
  end if;

  select student_id into v_student_id
  from public.submissions
  where id = p_submission_id
    and teacher_id = auth.uid()
    and status = 'submitted'
  for update;

  if v_student_id is null then
    raise exception 'submission_not_found_or_already_reviewed';
  end if;

  insert into public.reviews (submission_id, teacher_id, student_id, result, comment)
  values (p_submission_id, auth.uid(), v_student_id, p_result, nullif(btrim(p_comment), ''));

  update public.submissions
  set status = 'reviewed'
  where id = p_submission_id;
end;
$$;

-- 未ログイン(anon)でも先生名を確認できるように get_invite_info だけ公開
grant execute on function public.get_invite_info(text) to anon, authenticated;
revoke all on function public.join_teacher(text) from public;
grant execute on function public.join_teacher(text) to authenticated;
revoke all on function public.submit_review(uuid, text, text) from public;
grant execute on function public.submit_review(uuid, text, text) to authenticated;

-- ============================================================
-- RLS（行レベルセキュリティ）
-- ============================================================

alter table public.profiles    enable row level security;
alter table public.invites     enable row level security;
alter table public.submissions enable row level security;
alter table public.reviews     enable row level security;

-- profiles: 自分 / 自分の生徒 / 自分の先生 を閲覧可能
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or teacher_id = auth.uid()          -- 先生が自分の生徒を見る
  or id = public.my_teacher_id()      -- 生徒が自分の先生を見る
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- role と teacher_id はクライアントから変更させない。join_teacher() だけが変更できる。
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- invites: 先生は自分の招待のみ全操作
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select using (teacher_id = auth.uid());

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert
  with check (teacher_id = auth.uid() and public.my_role() = 'teacher');

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- submissions: 提出は本人 or 担当先生が閲覧。生徒本人のみ提出可能。先生のみ更新可能。
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select
  using (student_id = auth.uid() or teacher_id = auth.uid());

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert with check (
  student_id = auth.uid()
  and teacher_id = public.my_teacher_id()
  and public.my_role() = 'student'
);

drop policy if exists submissions_update_teacher on public.submissions;
create policy submissions_update_teacher on public.submissions for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- ステータス更新は submit_review() のトランザクション経由だけにする。
revoke update on public.submissions from anon, authenticated;

-- reviews: 担当先生 or 該当生徒が閲覧。先生のみ作成/更新。
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select
  using (teacher_id = auth.uid() or student_id = auth.uid());

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (
    teacher_id = auth.uid()
    and public.my_role() = 'teacher'
    and exists (
      select 1 from public.submissions s
      where s.id = reviews.submission_id
        and s.teacher_id = auth.uid()
        and s.student_id = reviews.student_id
    )
  );

drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- レビュー作成・更新も submit_review() だけに限定する。
revoke insert, update on public.reviews from anon, authenticated;

-- ============================================================
-- Storage: 提出画像バケット
-- ============================================================
-- パス形式:  {teacher_id}/{student_id}/{ファイル名}
-- 生徒は自分のフォルダにアップロード、先生は自分配下を閲覧できる。

insert into storage.buckets (id, name, public)
values ('task-submissions', 'task-submissions', false)
on conflict (id) do nothing;

drop policy if exists submissions_upload on storage.objects;
create policy submissions_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'task-submissions'
  and (storage.foldername(name))[1] = public.my_teacher_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists submissions_read on storage.objects;
create policy submissions_read on storage.objects for select to authenticated using (
  bucket_id = 'task-submissions'
  and (
    (storage.foldername(name))[2] = auth.uid()::text  -- 生徒: 自分の提出
    or (storage.foldername(name))[1] = auth.uid()::text -- 先生: 自分の生徒の提出
  )
);

-- 提出行の登録失敗時に、生徒が自分の孤立アップロードを削除できるようにする。
drop policy if exists submissions_delete_own on storage.objects;
create policy submissions_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'task-submissions'
  and (storage.foldername(name))[1] = public.my_teacher_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (
    select 1 from public.submissions s
    where s.file_path = storage.objects.name
  )
);
