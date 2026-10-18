-- Minimal stand-in for the parts of Supabase the migration relies on (roles, auth.users, auth.uid()).
-- Used only by CI to test the migration and its RLS policies on plain Postgres.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase's default privileges: API roles get table access, RLS decides rows.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
