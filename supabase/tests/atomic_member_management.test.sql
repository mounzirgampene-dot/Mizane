begin;

create extension if not exists pgtap;
select plan(3);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-one@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('42000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin-two@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.companies (id, legal_name, country_code, base_currency, accounting_standard, created_by)
values ('43000000-0000-4000-8000-000000000003', 'Atomic Admin Test', 'MA', 'MAD', 'CGNC', '41000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role, status)
values
  ('43000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('43000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', 'admin', 'active')
on conflict (company_id, user_id) do update set role = 'admin', status = 'active';

set local role service_role;

select lives_ok(
  $$ select public.manage_company_member(
    '43000000-0000-4000-8000-000000000003',
    '42000000-0000-4000-8000-000000000002',
    'set_role',
    'reader',
    null
  ) $$,
  'A company with two admins can safely demote one admin'
);

select lives_ok(
  $$ select public.manage_company_member(
    '43000000-0000-4000-8000-000000000003',
    '42000000-0000-4000-8000-000000000002',
    'set_role',
    'admin',
    null
  ) $$,
  'The second admin can be restored'
);

-- Revenir volontairement à un seul administrateur actif avant le test final.
select public.manage_company_member(
  '43000000-0000-4000-8000-000000000003',
  '42000000-0000-4000-8000-000000000002',
  'set_role',
  'reader',
  null
);

select throws_ok(
  $$ select public.manage_company_member(
    '43000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000001',
    'remove',
    null,
    null
  ) $$,
  '23514',
  'Impossible de retirer, suspendre ou rétrograder le dernier administrateur actif.',
  'The last active administrator cannot be removed'
);

select * from finish();
rollback;
