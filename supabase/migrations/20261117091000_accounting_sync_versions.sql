begin;

alter table public.accounting_settings add column if not exists sync_version bigint not null default 1;
alter table public.accounting_custom_accounts add column if not exists sync_version bigint not null default 1;
alter table public.accounting_thirds add column if not exists sync_version bigint not null default 1;
alter table public.accounting_assets add column if not exists sync_version bigint not null default 1;
alter table public.accounting_entries add column if not exists sync_version bigint not null default 1;

create or replace function private.bump_accounting_sync_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.sync_version := old.sync_version + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.bump_accounting_sync_version() from public, anon, authenticated;

drop trigger if exists accounting_sync_version_settings on public.accounting_settings;
create trigger accounting_sync_version_settings before update on public.accounting_settings
for each row execute function private.bump_accounting_sync_version();

drop trigger if exists accounting_sync_version_custom_accounts on public.accounting_custom_accounts;
create trigger accounting_sync_version_custom_accounts before update on public.accounting_custom_accounts
for each row execute function private.bump_accounting_sync_version();

drop trigger if exists accounting_sync_version_thirds on public.accounting_thirds;
create trigger accounting_sync_version_thirds before update on public.accounting_thirds
for each row execute function private.bump_accounting_sync_version();

drop trigger if exists accounting_sync_version_assets on public.accounting_assets;
create trigger accounting_sync_version_assets before update on public.accounting_assets
for each row execute function private.bump_accounting_sync_version();

drop trigger if exists accounting_sync_version_entries on public.accounting_entries;
create trigger accounting_sync_version_entries before update on public.accounting_entries
for each row execute function private.bump_accounting_sync_version();

commit;