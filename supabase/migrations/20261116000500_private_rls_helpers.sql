-- Les helpers SECURITY DEFINER utilisés par les politiques RLS ne doivent pas
-- être exposés comme endpoints RPC publics. Ils sont déplacés dans un schéma privé.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_active_company_member(target_company uuid)
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

create or replace function private.has_company_role(
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

revoke all on function private.is_active_company_member(uuid) from public, anon;
revoke all on function private.has_company_role(uuid, public.company_role[]) from public, anon;
grant execute on function private.is_active_company_member(uuid) to authenticated;
grant execute on function private.has_company_role(uuid, public.company_role[]) to authenticated;

-- Remplacer toutes les politiques qui dépendaient des helpers publics.
drop policy if exists companies_select_members on public.companies;
create policy companies_select_members on public.companies
  for select to authenticated using (
    private.is_active_company_member(id) and archived_at is null
  );

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin on public.companies
  for update to authenticated
  using (private.has_company_role(id, array['admin']::public.company_role[]))
  with check (private.has_company_role(id, array['admin']::public.company_role[]));

drop policy if exists memberships_select_self_or_admin on public.company_memberships;
create policy memberships_select_self_or_admin on public.company_memberships
  for select to authenticated using (
    user_id = (select auth.uid())
    or private.has_company_role(company_id, array['admin']::public.company_role[])
  );

drop policy if exists invitations_select_admin on public.company_invitations;
create policy invitations_select_admin on public.company_invitations
  for select to authenticated using (
    private.has_company_role(company_id, array['admin']::public.company_role[])
  );

drop policy if exists settings_select_members on public.company_settings;
create policy settings_select_members on public.company_settings
  for select to authenticated using (private.is_active_company_member(company_id));

drop policy if exists settings_update_admin on public.company_settings;
create policy settings_update_admin on public.company_settings
  for update to authenticated
  using (private.has_company_role(company_id, array['admin']::public.company_role[]))
  with check (private.has_company_role(company_id, array['admin']::public.company_role[]));

drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs
  for select to authenticated using (
    private.has_company_role(company_id, array['admin']::public.company_role[])
  );

drop policy if exists accounting_settings_select_members on public.accounting_settings;
create policy accounting_settings_select_members on public.accounting_settings
  for select to authenticated using (private.is_active_company_member(company_id));

drop policy if exists accounting_custom_accounts_select_members on public.accounting_custom_accounts;
create policy accounting_custom_accounts_select_members on public.accounting_custom_accounts
  for select to authenticated using (private.is_active_company_member(company_id));

drop policy if exists accounting_thirds_select_members on public.accounting_thirds;
create policy accounting_thirds_select_members on public.accounting_thirds
  for select to authenticated using (private.is_active_company_member(company_id));

drop policy if exists accounting_entries_select_members on public.accounting_entries;
create policy accounting_entries_select_members on public.accounting_entries
  for select to authenticated using (private.is_active_company_member(company_id));

drop policy if exists accounting_entry_lines_select_members on public.accounting_entry_lines;
create policy accounting_entry_lines_select_members on public.accounting_entry_lines
  for select to authenticated using (private.is_active_company_member(company_id));

drop policy if exists accounting_assets_select_members on public.accounting_assets;
create policy accounting_assets_select_members on public.accounting_assets
  for select to authenticated using (private.is_active_company_member(company_id));

-- Les endpoints RPC publics de simple vérification d'appartenance sont supprimés.
revoke all on function public.is_active_company_member(uuid) from public, anon, authenticated;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public, anon, authenticated;
drop function public.is_active_company_member(uuid);
drop function public.has_company_role(uuid, public.company_role[]);

commit;
