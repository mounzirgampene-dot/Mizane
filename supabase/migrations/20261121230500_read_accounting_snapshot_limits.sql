-- Préserve les plafonds de lecture historiques pour les référentiels comptables.
create or replace function public.read_accounting_snapshot(
  p_company_id uuid, p_actor_user_id uuid, p_offset integer, p_limit integer, p_changes_since bigint
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $function$
declare
  v_role text;
  v_settings jsonb := null;
  v_custom_accounts jsonb := '[]'::jsonb;
  v_thirds jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
  v_entries_all jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_changes_all jsonb := '[]'::jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_has_more_changes boolean := false;
  v_returned integer := 0;
  v_changes_returned integer := 0;
  v_next_cursor bigint;
begin
  if p_company_id is null or p_actor_user_id is null
     or p_offset is null or p_offset < 0 or p_offset > 1000000
     or p_limit is null or p_limit < 1 or p_limit > 200
     or p_changes_since is null or p_changes_since < 0 then
    raise exception 'Paramètres de lecture comptable invalides.' using errcode = '22023';
  end if;

  select m.role::text into v_role
  from public.company_memberships as m
  where m.company_id = p_company_id and m.user_id = p_actor_user_id
    and m.status::text = 'active' and m.role::text in ('admin', 'accountant', 'reader')
  limit 1;
  if v_role is null then return pg_catalog.jsonb_build_object('authorized', false); end if;

  select pg_catalog.jsonb_build_object('settings', s.settings, 'next_entry_id', s.next_entry_id,
    'updated_at', s.updated_at, 'sync_version', s.sync_version)
  into v_settings from public.accounting_settings as s where s.company_id = p_company_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'client_uid', a.client_uid, 'code', a.code, 'label', a.label, 'account_type', a.account_type,
    'updated_at', a.updated_at, 'sync_version', a.sync_version) order by a.code), '[]'::jsonb)
  into v_custom_accounts
  from (select a.* from public.accounting_custom_accounts as a where a.company_id = p_company_id
    order by a.code limit 5000) as a;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'client_uid', t.client_uid, 'name', t.name, 'third_type', t.third_type, 'phone', t.phone,
    'email', t.email, 'updated_at', t.updated_at, 'sync_version', t.sync_version) order by t.name), '[]'::jsonb)
  into v_thirds
  from (select t.* from public.accounting_thirds as t where t.company_id = p_company_id
    order by t.name limit 5000) as t;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'client_uid', a.client_uid, 'name', a.name, 'account_code', a.account_code, 'amount', a.amount,
    'years', a.years, 'method', a.method, 'service_date', a.service_date, 'amortized', a.amortized,
    'updated_at', a.updated_at, 'sync_version', a.sync_version) order by a.name), '[]'::jsonb)
  into v_assets
  from (select a.* from public.accounting_assets as a where a.company_id = p_company_id
    order by a.name limit 5000) as a;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', e.id, 'client_uid', e.client_uid, 'entry_date', e.entry_date, 'journal', e.journal,
    'reference', e.reference, 'is_reversed', e.is_reversed, 'reverse_of_entry_id', e.reverse_of_entry_id,
    'created_at', e.created_at, 'updated_at', e.updated_at, 'sync_version', e.sync_version,
    'lines', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'entry_id', l.entry_id, 'line_number', l.line_number, 'account_code', l.account_code,
      'label', l.label, 'third_name', l.third_name, 'debit', l.debit, 'credit', l.credit)
      order by l.line_number) from public.accounting_entry_lines as l
      where l.company_id = p_company_id and l.entry_id = e.id), '[]'::jsonb)
    ) order by e.entry_date, e.id), '[]'::jsonb)
  into v_entries_all
  from (select e.* from public.accounting_entries as e where e.company_id = p_company_id
    order by e.entry_date asc, e.id asc limit (p_limit + 1) offset p_offset) as e;

  v_has_more := pg_catalog.jsonb_array_length(v_entries_all) > p_limit;
  select coalesce(pg_catalog.jsonb_agg(x.value order by x.ordinality), '[]'::jsonb) into v_entries
  from pg_catalog.jsonb_array_elements(v_entries_all) with ordinality as x(value, ordinality)
  where x.ordinality <= p_limit;
  v_returned := pg_catalog.jsonb_array_length(v_entries);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'change_seq', c.change_seq, 'entity_type', c.entity_type, 'client_uid', c.client_uid,
    'operation', c.operation, 'changed_at', c.changed_at) order by c.change_seq), '[]'::jsonb)
  into v_changes_all
  from (select c.* from public.accounting_sync_changes as c where c.company_id = p_company_id
    and c.change_seq > p_changes_since order by c.change_seq asc limit 501) as c;

  v_has_more_changes := pg_catalog.jsonb_array_length(v_changes_all) > 500;
  select coalesce(pg_catalog.jsonb_agg(x.value order by x.ordinality), '[]'::jsonb) into v_changes
  from pg_catalog.jsonb_array_elements(v_changes_all) with ordinality as x(value, ordinality)
  where x.ordinality <= 500;
  v_changes_returned := pg_catalog.jsonb_array_length(v_changes);
  v_next_cursor := case when v_changes_returned > 0
    then (v_changes -> (v_changes_returned - 1) ->> 'change_seq')::bigint else p_changes_since end;

  return pg_catalog.jsonb_build_object(
    'authorized', true, 'company_id', p_company_id, 'role', v_role, 'settings', v_settings,
    'custom_accounts', v_custom_accounts, 'thirds', v_thirds, 'assets', v_assets, 'entries', v_entries,
    'pagination', pg_catalog.jsonb_build_object('offset', p_offset, 'limit', p_limit,
      'returned', v_returned, 'has_more', v_has_more,
      'next_offset', case when v_has_more then p_offset + v_returned else null end),
    'changes', v_changes,
    'changes_pagination', pg_catalog.jsonb_build_object('since', p_changes_since,
      'returned', v_changes_returned, 'has_more', v_has_more_changes, 'next_cursor', v_next_cursor)
  );
end;
$function$;

revoke all on function public.read_accounting_snapshot(uuid, uuid, integer, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.read_accounting_snapshot(uuid, uuid, integer, integer, bigint)
  to service_role;