-- MIZANE: socle comptable multi-entreprises.
-- Migration additive : aucune donnée locale ou table SaaS existante n'est modifiée.
-- Les écritures sont consultables par les membres actifs ; les écritures/modifications
-- passeront par une API serveur validant les écritures en partie double.

begin;

create table if not exists public.accounting_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  next_entry_id bigint not null default 1 check (next_entry_id > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_settings_no_provider_secrets
    check (not (settings ? 'aiKey') and not (settings ? 'ai_key'))
);

create table if not exists public.accounting_custom_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 32),
  label text not null check (length(trim(label)) between 1 and 180),
  account_type text not null check (length(trim(account_type)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, id)
);

create table if not exists public.accounting_thirds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_uid uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 180),
  third_type text not null default 'autre'
    check (third_type in ('client', 'fournisseur', 'autre')),
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, client_uid),
  unique (company_id, id)
);

create table if not exists public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_uid uuid not null default gen_random_uuid(),
  source_local_id bigint,
  entry_date date not null,
  journal text not null check (journal in ('ACH', 'VTE', 'BAN', 'CAI', 'OD')),
  reference text not null default '',
  is_reversed boolean not null default false,
  reverse_of_entry_id uuid,
  source_reverse_of_local_id bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, client_uid),
  constraint accounting_entries_reverse_same_company_fk
    foreign key (company_id, reverse_of_entry_id)
    references public.accounting_entries(company_id, id)
    deferrable initially deferred
);

create unique index if not exists accounting_entries_company_source_local_uidx
  on public.accounting_entries(company_id, source_local_id)
  where source_local_id is not null;

create index if not exists accounting_entries_company_date_idx
  on public.accounting_entries(company_id, entry_date desc, journal);

create table if not exists public.accounting_entry_lines (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  entry_id uuid not null,
  line_number integer not null check (line_number > 0),
  account_code text not null check (length(trim(account_code)) between 1 and 32),
  label text not null default '',
  third_name text not null default '',
  debit numeric(15,2) not null default 0 check (debit >= 0 and debit <= 999999999999.99),
  credit numeric(15,2) not null default 0 check (credit >= 0 and credit <= 999999999999.99),
  created_at timestamptz not null default now(),
  constraint accounting_entry_lines_one_side_only
    check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  constraint accounting_entry_lines_entry_fk
    foreign key (company_id, entry_id)
    references public.accounting_entries(company_id, id)
    on delete cascade,
  unique (company_id, entry_id, line_number)
);

create index if not exists accounting_entry_lines_company_account_idx
  on public.accounting_entry_lines(company_id, account_code);

create table if not exists public.accounting_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_uid uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 180),
  account_code text not null check (length(trim(account_code)) between 1 and 32),
  amount numeric(15,2) not null check (amount > 0 and amount <= 999999999999.99),
  years integer not null check (years between 1 and 30),
  method text not null check (method in ('lineaire', 'degressif')),
  service_date date not null,
  amortized numeric(15,2) not null default 0
    check (amortized >= 0 and amortized <= amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, client_uid),
  unique (company_id, id)
);

create index if not exists accounting_assets_company_account_idx
  on public.accounting_assets(company_id, account_code);

-- RLS activée et forcée sur chaque table comptable exposée.
alter table public.accounting_settings enable row level security;
alter table public.accounting_settings force row level security;
alter table public.accounting_custom_accounts enable row level security;
alter table public.accounting_custom_accounts force row level security;
alter table public.accounting_thirds enable row level security;
alter table public.accounting_thirds force row level security;
alter table public.accounting_entries enable row level security;
alter table public.accounting_entries force row level security;
alter table public.accounting_entry_lines enable row level security;
alter table public.accounting_entry_lines force row level security;
alter table public.accounting_assets enable row level security;
alter table public.accounting_assets force row level security;

create policy accounting_settings_select_members on public.accounting_settings
  for select to authenticated
  using (public.is_active_company_member(company_id));

create policy accounting_custom_accounts_select_members on public.accounting_custom_accounts
  for select to authenticated
  using (public.is_active_company_member(company_id));

create policy accounting_thirds_select_members on public.accounting_thirds
  for select to authenticated
  using (public.is_active_company_member(company_id));

create policy accounting_entries_select_members on public.accounting_entries
  for select to authenticated
  using (public.is_active_company_member(company_id));

create policy accounting_entry_lines_select_members on public.accounting_entry_lines
  for select to authenticated
  using (public.is_active_company_member(company_id));

create policy accounting_assets_select_members on public.accounting_assets
  for select to authenticated
  using (public.is_active_company_member(company_id));

-- Lecture seulement depuis le navigateur pour cette première étape.
-- Aucun droit d'écriture direct n'est accordé aux comptes authentifiés.
revoke all on public.accounting_settings,
  public.accounting_custom_accounts,
  public.accounting_thirds,
  public.accounting_entries,
  public.accounting_entry_lines,
  public.accounting_assets
  from anon, authenticated;

grant select on public.accounting_settings,
  public.accounting_custom_accounts,
  public.accounting_thirds,
  public.accounting_entries,
  public.accounting_entry_lines,
  public.accounting_assets
  to authenticated;

comment on table public.accounting_settings is
  'Paramètres comptables par entreprise ; ne jamais y stocker de clé API fournisseur.';
comment on table public.accounting_entries is
  'En-têtes des écritures comptables cloud, cloisonnés par company_id.';
comment on table public.accounting_entry_lines is
  'Lignes débit/crédit ; toute écriture doit être équilibrée par la future API de validation serveur.';

commit;
