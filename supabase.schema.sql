-- Supabase SQL Editor에서 한 번 실행하세요.
-- 앱 상태는 Supabase Postgres JSONB에 저장하고, 사진은 Supabase Storage bucket에 저장합니다.
-- service role key는 서버에서만 사용하고 브라우저/앱에 절대 넣지 마세요.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- 사진 저장 버킷 생성. 이미 있으면 건너뜁니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moment-photos',
  'moment-photos',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage 업로드/삭제는 서버의 service role key로 처리합니다.
-- public=true라서 피드 이미지는 public URL로 표시됩니다.


-- app_state JSONB 내부에 아래 배열이 함께 저장됩니다.
-- blocks: 사용자 차단 관계
-- deletionRequests: 웹 계정 삭제 요청 접수 내역
-- momentReports/commentReports: 신고 내역


-- 운영자 처리 이력
create table if not exists moderation_actions (
  id text primary key,
  type text not null,
  user_id bigint,
  moment_id text,
  reason text,
  created_at timestamptz default now()
);

-- 사용자 이용 제한 필드 예시
alter table users add column if not exists suspended boolean default false;
alter table users add column if not exists suspended_reason text;
alter table users add column if not exists suspended_at timestamptz;
