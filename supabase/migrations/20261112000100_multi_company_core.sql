-- MIZANE: première fondation multi-entreprises.
-- À exécuter uniquement dans un projet Supabase de développement après sauvegarde.
-- Cette migration ne modifie aucune donnée locale et n'active pas encore la comptabilité distante.

begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.company_role as enum ('admin', 'accountant', 'reader');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'suspended');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) between 2 and 180),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  accounting_standard text not null check (length(trim(accounting_standard)) between 2 and 40),
  timezone text not null default 'Africa/Casablanca',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.company_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists company_memberships_user_status_idx
  on public.company_memberships (user_id, status);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (length(trim(email)) between 3 and 320),
  role public.company_role not null check (role in ('accountant', 'reader', 'admin')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists company_invitations_company_idx
  on public.company_invitations (company_id, created_at desc);

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(trim(action)) between 2 and 100),
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_company_created_idx
  on public.audit_logs (company_id, created_at desc);

-- Crée/actualise le profil applicatif lors de la création d'un compte Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_mizane on auth.users;
create trigger on_auth_user_created_mizane
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Ces fonctions lisent les appartenances sans déclencher de récursion RLS.
create or replace function public.is_active_company_member(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.has_company_role(
  target_company uuid,
  allowed_roles public.company_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_active_company_member(uuid) from public, anon;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public, anon;
grant execute on function public.is_active_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;

-- Création atomique : l'utilisateur devient administrateur du nouvel espace.
create or replace function public.create_company(
  p_legal_name text,
  p_country_code text,
  p_base_currency text,
  p_accounting_standard text,
  p_timezone text default 'Africa/Casablanca'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentification requise.' using errcode = '28000';
  end if;

  if p_legal_name is null or length(trim(p_legal_name)) not between 2 and 180 then
    raise exception 'Raison sociale invalide.' using errcode = '22023';
  end if;
  if p_country_code is null or upper(p_country_code) !~ '^[A-Z]{2}$' then
    raise exception 'Code pays invalide.' using errcode = '22023';
  end if;
  if p_base_currency is null or upper(p_base_currency) !~ '^[A-Z]{3}$' then
    raise exception 'Code devise invalide.' using errcode = '22023';
  end if;
  if p_accounting_standard is null or length(trim(p_accounting_standard)) not between 2 and 40 then
    raise exception 'Référentiel comptable invalide.' using errcode = '22023';
  end if;

  insert into public.companies (
    legal_name, country_code, base_currency, accounting_standard, timezone, created_by
  ) values (
    trim(p_legal_name), upper(p_country_code), upper(p_base_currency),
    trim(p_accounting_standard), coalesce(nullif(trim(p_timezone), ''), 'Africa/Casablanca'),
    v_user_id
  ) returning id into v_company_id;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v_company_id, v_user_id, 'admin', 'active');

  insert into public.company_settings (company_id)
  values (v_company_id);

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id)
  values (v_company_id, v_user_id, 'company.created', 'company', v_company_id::text);

  return v_company_id;
end;
$$;

revoke all on function public.create_company(text, text, text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text, text, text) to authenticated;

-- Profil : l'utilisateur ne peut modifier que son propre profil.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Entreprises : visibilité des seuls espaces auxquels l'utilisateur appartient.
alter table public.companies enable row level security;
alter table public.companies force row level security;
create policy companies_select_members on public.companies
  for select to authenticated using (
    public.is_active_company_member(id) and archived_at is null
  );
create policy companies_update_admin on public.companies
  for update to authenticated
  using (public.has_company_role(id, array['admin']::public.company_role[]))
  with check (public.has_company_role(id, array['admin']::public.company_role[]));

-- Les membres ne peuvent consulter que les appartenances de leurs espaces.
-- Aucune politique d'écriture directe : invitations et changements de rôle
-- seront effectués par des Edge Functions de confiance.
alter table public.company_memberships enable row level security;
alter table public.company_memberships force row level security;
create policy memberships_select_self_or_admin on public.company_memberships
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.has_company_role(company_id, array['admin']::public.company_role[])
  );

alter table public.company_invitations enable row level security;
alter table public.company_invitations force row level security;
create policy invitations_select_admin on public.company_invitations
  for select to authenticated using (
    public.has_company_role(company_id, array['admin']::public.company_role[])
  );

alter table public.company_settings enable row level security;
alter table public.company_settings force row level security;
create policy settings_select_members on public.company_settings
  for select to authenticated using (public.is_active_company_member(company_id));
create policy settings_update_admin on public.company_settings
  for update to authenticated
  using (public.has_company_role(company_id, array['admin']::public.company_role[]))
  with check (public.has_company_role(company_id, array['admin']::public.company_role[]));

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
create policy audit_select_admin on public.audit_logs
  for select to authenticated using (
    public.has_company_role(company_id, array['admin']::public.company_role[])
  );

-- Les écritures dans audit_logs et la gestion des appartenances sont réservées
-- aux fonctions serveur (service_role), jamais au client public.

commit;
