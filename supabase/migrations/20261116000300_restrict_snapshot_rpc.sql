-- L'import initial doit passer par l'Edge Function qui vérifie le JWT et le rôle.
-- Le RPC SECURITY DEFINER n'est donc plus exécutable depuis le navigateur.
begin;
revoke all on function public.import_accounting_snapshot(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_accounting_snapshot(uuid, jsonb)
  to service_role;

create index if not exists accounting_entries_created_by_idx
  on public.accounting_entries(created_by)
  where created_by is not null;

create index if not exists accounting_entries_reverse_of_idx
  on public.accounting_entries(company_id, reverse_of_entry_id)
  where reverse_of_entry_id is not null;
commit;
