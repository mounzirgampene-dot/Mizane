begin;

create extension if not exists pgtap;

select plan(8);

-- Fixtures are created as the database owner, then all assertions run as
-- authenticated users with realistic Supabase JWT claims.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'alice-mizane-test@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Alice"}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bilal-mizane-test@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Bilal"}'::jsonb)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.profiles where id = auth.uid()),
  1,
  'Alice can read her own profile'
);

select is(
  public.create_company('MIZANE Test A', 'MA', 'MAD', 'CGNC', 'Africa/Casablanca') is not null,
  true,
  'Alice can create a company through the secured RPC'
);

select is(
  (select count(*)::integer from public.companies),
  1,
  'Alice sees her own company'
);

select is(
  (select count(*)::integer from public.company_memberships where user_id = auth.uid() and role = 'admin' and status = 'active'),
  1,
  'Company creator receives the admin role'
);

reset role;
insert into public.companies (id, legal_name, country_code, base_currency, accounting_standard, created_by)
values ('30000000-0000-4000-8000-000000000003', 'MIZANE Test B', 'MA', 'MAD', 'CGNC', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.company_settings (company_id)
values ('30000000-0000-4000-8000-000000000003')
on conflict (company_id) do nothing;
insert into public.company_memberships (company_id, user_id, role, status)
values ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'admin', 'active')
on conflict (company_id, user_id) do nothing;
insert into public.company_memberships (company_id, user_id, role, status)
values (
  (select id from public.companies where legal_name = 'MIZANE Test A' and created_by = '10000000-0000-4000-8000-000000000001' limit 1),
  '20000000-0000-4000-8000-000000000002',
  'reader',
  'active'
)
on conflict (company_id, user_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.companies),
  2,
  'Bilal sees only the two companies where he is a member'
);

select is(
  (select count(*)::integer from public.company_memberships where user_id = auth.uid() and role = 'reader'),
  1,
  'Membership roles are independent for each user and company'
);

select is(
  (select count(*)::integer from public.companies where id = '10000000-0000-4000-8000-000000000099'),
  0,
  'A non-member cannot read a company by guessing its UUID'
);

select is(
  (select count(*)::integer from public.company_settings s
   where s.company_id in (select id from public.companies)
     and public.has_company_role(s.company_id, array['admin']::public.company_role[])),
  1,
  'Admin permissions are scoped to the company, not global'
);

select * from finish();
rollback;
