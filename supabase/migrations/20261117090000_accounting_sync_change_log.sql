begin;

create table if not exists public.accounting_sync_changes (
  change_seq bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('settings','custom_account','third','asset','entry')),
  client_uid uuid,
  operation text not null check (operation in ('upsert','delete')),
  changed_at timestamptz not null default now()
);

create index if not exists accounting_sync_changes_company_seq_idx
  on public.accounting_sync_changes(company_id, change_seq);

alter table public.accounting_sync_changes enable row level security;
alter table public.accounting_sync_changes force row level security;

drop policy if exists accounting_sync_changes_member_read on public.accounting_sync_changes;
create policy accounting_sync_changes_member_read
  on public.accounting_sync_changes
  for select to authenticated
  using (private.is_active_company_member(company_id));

revoke all on public.accounting_sync_changes from anon, authenticated;
grant select on public.accounting_sync_changes to authenticated;

create or replace function private.log_accounting_sync_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_client_uid uuid;
  v_entity_type text := tg_argv[0];
  v_operation text;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    if v_entity_type <> 'settings' then
      v_client_uid := old.client_uid;
    end if;
    v_operation := 'delete';
  else
    v_company_id := new.company_id;
    if v_entity_type <> 'settings' then
      v_client_uid := new.client_uid;
    end if;
    v_operation := 'upsert';
  end if;

  insert into public.accounting_sync_changes(company_id, entity_type, client_uid, operation)
  values (v_company_id, v_entity_type, v_client_uid, v_operation);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.log_accounting_sync_change() from public, anon, authenticated;

drop trigger if exists accounting_sync_log_custom_accounts on public.accounting_custom_accounts;
create trigger accounting_sync_log_custom_accounts
after insert or update or delete on public.accounting_custom_accounts
for each row execute function private.log_accounting_sync_change('custom_account');

drop trigger if exists accounting_sync_log_thirds on public.accounting_thirds;
create trigger accounting_sync_log_thirds
after insert or update or delete on public.accounting_thirds
for each row execute function private.log_accounting_sync_change('third');

drop trigger if exists accounting_sync_log_assets on public.accounting_assets;
create trigger accounting_sync_log_assets
after insert or update or delete on public.accounting_assets
for each row execute function private.log_accounting_sync_change('asset');

drop trigger if exists accounting_sync_log_entries on public.accounting_entries;
create trigger accounting_sync_log_entries
after insert or update or delete on public.accounting_entries
for each row execute function private.log_accounting_sync_change('entry');

drop trigger if exists accounting_sync_log_settings on public.accounting_settings;
create trigger accounting_sync_log_settings
after insert or update or delete on public.accounting_settings
for each row execute function private.log_accounting_sync_change('settings');

commit;