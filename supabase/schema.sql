-- Starter schema. Review and test in a non-production Supabase project first.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'editor' check (role in ('owner','editor','reviewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('page','blog','product','service')),
  title text not null,
  slug text,
  published_data jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  published_at timestamptz not null default now()
);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists change_requests_status_created_idx on public.change_requests(status, created_at desc);

alter table public.profiles enable row level security;
alter table public.content_items enable row level security;
alter table public.change_requests enable row level security;

-- Profile access: users can read their own profile; owner can read/manage all profiles.
drop policy if exists "profile self or owner read" on public.profiles;
create policy "profile self or owner read" on public.profiles for select to authenticated
using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
drop policy if exists "owner manage profiles" on public.profiles;
create policy "owner manage profiles" on public.profiles for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

-- Public site can only read published rows. No browser role can directly update published content.
drop policy if exists "public reads published content" on public.content_items;
create policy "public reads published content" on public.content_items for select to anon, authenticated using (published = true);

-- Staff can read their own requests; owner can read all requests.
drop policy if exists "submitter or owner reads requests" on public.change_requests;
create policy "submitter or owner reads requests" on public.change_requests for select to authenticated
using (submitted_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
drop policy if exists "editors submit own requests" on public.change_requests;
create policy "editors submit own requests" on public.change_requests for insert to authenticated
with check (submitted_by = auth.uid() and status = 'pending' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','editor')));
-- Intentionally no direct UPDATE policy: review must use the protected RPC.

create or replace function public.review_change_request(request_id uuid, decision text, note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.change_requests%rowtype;
  actor_role text;
  payload_type text;
  payload_title text;
  payload_slug text;
begin
  select p.role into actor_role from public.profiles p where p.id = auth.uid();
  if actor_role is distinct from 'owner' then raise exception 'Only an owner can review and publish content'; end if;
  if decision not in ('approve','reject') then raise exception 'Decision must be approve or reject'; end if;
  select * into req from public.change_requests cr where cr.id = request_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if req.status <> 'pending' then raise exception 'This request has already been reviewed'; end if;
  if decision = 'approve' then
    payload_type := req.payload ->> 'type';
    payload_title := req.payload ->> 'title';
    payload_slug := nullif(req.payload ->> 'slug','');
    if payload_type not in ('page','blog','product','service') or coalesce(payload_title,'') = '' then raise exception 'Request is missing a valid content type or title'; end if;
    insert into public.content_items(type,title,slug,published_data,published,updated_at,published_at)
    values(payload_type,payload_title,payload_slug,req.payload,true,now(),now());
  end if;
  update public.change_requests set status = case when decision = 'approve' then 'approved' else 'rejected' end,
    review_note = note, reviewed_by = auth.uid(), reviewed_at = now() where id = request_id;
end; $$;
revoke all on function public.review_change_request(uuid,text,text) from public;
grant execute on function public.review_change_request(uuid,text,text) to authenticated;

-- After the owner has signed in once, run this in SQL Editor, replacing the email:
-- insert into public.profiles(id,display_name,role)
-- select id,'Site Owner','owner' from auth.users where email='YOUR_OWNER_EMAIL'
-- on conflict(id) do update set role='owner';
-- Add staff after they have signed in by inserting their auth.users UUID with role 'editor'.
