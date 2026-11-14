begin;

create extension if not exists pgtap;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'invite-admin@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('52000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'suspended-user@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('53000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'new-user@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.companies (id, legal_name, country_code, base_currency, accounting_standard, created_by)
values ('54000000-0000-4000-8000-000000000004', 'Atomic Invitation Test', 'MA', 'MAD', 'CGNC', '51000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role, status)
values ('54000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000002', 'reader', 'suspended')
on conflict (company_id, user_id) do update set role = 'reader', status = 'suspended';

insert into public.company_invitations (id, company_id, email, role, token_hash, invited_by, expires_at)
values
  ('55000000-0000-4000-8000-000000000005', '54000000-0000-4000-8000-000000000004', 'suspended-user@example.invalid', 'reader', repeat('a', 64), '51000000-0000-4000-8000-000000000001', now() + interval '7 days'),
  ('56000000-0000-4000-8000-000000000006', '54000000-0000-4000-8000-000000000004', 'new-user@example.invalid', 'accountant', repeat('b', 64), '51000000-0000-4000-8000-000000000001', now() + interval '7 days')
on conflict (id) do nothing;

set local role service_role;

select throws_ok(
  $$ select public.accept_company_invitation(
    repeat('a', 64),
    '52000000-0000-4000-8000-000000000002',
    'suspended-user@example.invalid'
  ) $$,
  '42501',
  'Accès suspendu par un administrateur.',
  'A suspended member cannot regain access by accepting an old invitation'
);

select is(
  (select accepted_at is null from public.company_invitations where id = '55000000-0000-4000-8000-000000000005'),
  true,
  'A rejected invitation remains unused'
);

select lives_ok(
  $$ select public.accept_company_invitation(
    repeat('b', 64),
    '53000000-0000-4000-8000-000000000003',
    'new-user@example.invalid'
  ) $$,
  'A valid invitation is accepted atomically'
);

select is(
  (select status::text from public.company_memberships
   where company_id = '54000000-0000-4000-8000-000000000004'
     and user_id = '53000000-0000-4000-8000-000000000003'),
  'active',
  'Acceptance creates an active membership'
);

select * from finish();
rollback;
