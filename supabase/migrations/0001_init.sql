-- Q-ICU schema. Apply with `supabase db push` or paste into the Supabase SQL editor.
-- Every table has row level security enabled. Tables without policies are
-- reachable only by the service role (server-side route handlers).

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user. Holds only what the app needs.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text check (char_length(display_name) <= 60),
  onboarded_at      timestamptz,
  terms_version     text not null,
  privacy_version   text not null,
  terms_accepted_at timestamptz not null default now(),
  age_confirmed_at  timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Users may only change these two columns. Consent records stay as signed.
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, onboarded_at) on public.profiles to authenticated;

-- Create the profile at sign-up. Sign-up is refused without age confirmation
-- and policy acceptance, so the check is enforced server-side as well as in the form.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'age_confirmed', 'false') <> 'true' then
    raise exception 'AGE_CONFIRMATION_REQUIRED';
  end if;
  if coalesce(new.raw_user_meta_data ->> 'terms_version', '') = ''
     or coalesce(new.raw_user_meta_data ->> 'privacy_version', '') = '' then
    raise exception 'TERMS_NOT_ACCEPTED';
  end if;
  insert into public.profiles (id, terms_version, privacy_version)
  values (new.id, new.raw_user_meta_data ->> 'terms_version', new.raw_user_meta_data ->> 'privacy_version');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Scenarios: saved patient sets and resource counts. Owner-only access.
-- ---------------------------------------------------------------------------
create table public.scenarios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  patients   jsonb not null check (jsonb_typeof(patients) = 'array' and jsonb_array_length(patients) <= 100),
  resources  jsonb not null check (jsonb_typeof(resources) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_size check (pg_column_size(patients) < 200000)
);

create index scenarios_user_id_idx on public.scenarios (user_id, updated_at desc);

alter table public.scenarios enable row level security;

create policy "scenarios: read own" on public.scenarios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "scenarios: insert own" on public.scenarios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "scenarios: update own" on public.scenarios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "scenarios: delete own" on public.scenarios
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.scenarios from anon;

-- Cap saved scenarios per user so one account cannot fill the database.
create function public.limit_scenarios() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.scenarios where user_id = new.user_id) >= 50 then
    raise exception 'SCENARIO_LIMIT_REACHED';
  end if;
  return new;
end $$;

create trigger scenarios_limit before insert on public.scenarios
  for each row execute function public.limit_scenarios();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger scenarios_touch before update on public.scenarios
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Data requests from people who cannot sign in (deletion, access, correction).
-- Service role only.
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (char_length(email) <= 254),
  request_type text not null check (request_type in ('deletion', 'access', 'correction')),
  details      text check (char_length(details) <= 2000),
  status       text not null default 'open' check (status in ('open', 'done', 'rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- First-party telemetry. No IP addresses, user IDs, user agents or query strings.
-- Service role only.
-- ---------------------------------------------------------------------------
create table public.page_views (
  id            bigint generated always as identity primary key,
  path          text not null check (char_length(path) <= 200),
  referrer_host text check (char_length(referrer_host) <= 200),
  created_at    timestamptz not null default now()
);
alter table public.page_views enable row level security;
revoke all on public.page_views from anon, authenticated;

create table public.error_events (
  id         bigint generated always as identity primary key,
  source     text not null check (source in ('client', 'server')),
  message    text not null check (char_length(message) <= 500),
  digest     text check (char_length(digest) <= 100),
  path       text check (char_length(path) <= 200),
  stack      text check (char_length(stack) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting. Keys are hashed client identifiers, never raw IPs.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket       text primary key,
  window_start timestamptz not null,
  hits         integer not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create function public.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Retention. Run daily (the db-backup workflow calls it after each backup).
-- ---------------------------------------------------------------------------
create function public.purge_expired_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.page_views    where created_at < now() - interval '90 days';
  delete from public.error_events  where created_at < now() - interval '90 days';
  delete from public.rate_limits   where window_start < now() - interval '1 day';
  delete from public.data_requests where status <> 'open' and resolved_at < now() - interval '1 year';
$$;

revoke all on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;

-- Functions created above are not callable by API roles unless granted.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.limit_scenarios() from public, anon, authenticated;
