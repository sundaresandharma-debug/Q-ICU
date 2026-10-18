-- Row level security tests. Each block raises an exception if a rule is broken.
-- Run after supabase_stub.sql and the migration on an empty Postgres 16 database.

create function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', label;
exception when others then
  if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated, service_role;

-- Sign-up needs age confirmation and policy acceptance.
select pg_temp.expect_error($$insert into auth.users (raw_user_meta_data) values ('{}')$$, 'signup without age');
select pg_temp.expect_error($$insert into auth.users (raw_user_meta_data) values ('{"age_confirmed":"true"}')$$, 'signup without terms');

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"age_confirmed":"true","terms_version":"v1","privacy_version":"v1"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"age_confirmed":"true","terms_version":"v1","privacy_version":"v1"}');
do $$ begin assert (select count(*) from public.profiles) = 2, 'profiles created by trigger'; end $$;

-- User A
set role authenticated;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.scenarios (name, patients, resources) values ('A1', '[]', '{}');
update public.profiles set display_name = 'A' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin assert (select count(*) from public.profiles) = 1, 'user sees only own profile'; end $$;
select pg_temp.expect_error($$update public.profiles set terms_version = 'forged'$$, 'consent columns are read-only');
select pg_temp.expect_error($$insert into public.scenarios (user_id, name, patients, resources) values ('00000000-0000-0000-0000-00000000000b', 'x', '[]', '{}')$$, 'insert for another user');
select pg_temp.expect_error($$insert into public.scenarios (name, patients, resources) values ('', '[]', '{}')$$, 'empty scenario name');
select pg_temp.expect_error($$select * from public.page_views$$, 'telemetry hidden from users');
select pg_temp.expect_error($$select * from public.data_requests$$, 'data requests hidden from users');
select pg_temp.expect_error($$select public.rate_limit_hit('x', 1, 60)$$, 'rate limiter is service-only');

-- User B cannot read, change or delete A's rows.
set request.jwt.sub = '00000000-0000-0000-0000-00000000000b';
update public.scenarios set name = 'hacked';
delete from public.scenarios;
update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin assert (select count(*) from public.scenarios) = 0, 'B cannot see A scenarios'; end $$;

-- Anonymous visitors
set role anon;
select pg_temp.expect_error($$select * from public.profiles$$, 'anon cannot read profiles');
select pg_temp.expect_error($$select * from public.scenarios$$, 'anon cannot read scenarios');
select pg_temp.expect_error($$insert into public.data_requests (email, request_type) values ('a@b.co', 'deletion')$$, 'anon cannot write data requests');

reset role;
do $$ begin
  assert (select name from public.scenarios) = 'A1', 'A scenario untouched by B';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'A', 'A profile untouched by B';
end $$;

-- Rate limiter and retention (service role)
set role service_role;
do $$ begin
  assert public.rate_limit_hit('k', 2, 60), 'first hit allowed';
  assert public.rate_limit_hit('k', 2, 60), 'second hit allowed';
  assert not public.rate_limit_hit('k', 2, 60), 'third hit blocked';
end $$;
select public.purge_expired_data();
reset role;

-- Scenario cap
set role authenticated;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.scenarios (name, patients, resources) select 's' || g, '[]', '{}' from generate_series(1, 50) g;
select pg_temp.expect_error($$insert into public.scenarios (name, patients, resources) values ('51', '[]', '{}')$$, 'scenario cap of 50');
reset role;

-- Account deletion cascades
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.scenarios where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'scenarios deleted with account';
  assert (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 0, 'profile deleted with account';
end $$;

select 'RLS tests passed' as result;
