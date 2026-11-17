begin;

alter table public.accounting_custom_accounts
  add column if not exists client_uid uuid not null default gen_random_uuid();

create unique index if not exists accounting_custom_accounts_company_client_uidx
  on public.accounting_custom_accounts(company_id, client_uid);

comment on column public.accounting_custom_accounts.client_uid is
  'Identifiant stable généré localement pour la synchronisation multi-appareils.';

comment on column public.accounting_entries.client_uid is
  'Identifiant stable généré localement ; source_local_id reste réservé à la compatibilité historique.';

comment on column public.accounting_thirds.client_uid is
  'Identifiant stable généré localement pour la synchronisation multi-appareils.';

comment on column public.accounting_assets.client_uid is
  'Identifiant stable généré localement pour la synchronisation multi-appareils.';

commit;