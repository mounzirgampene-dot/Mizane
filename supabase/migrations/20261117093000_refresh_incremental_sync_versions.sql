-- Rafraîchit les versions renvoyées après les mises à jour de liens de contrepassation.
create or replace function public.push_accounting_changes(
  p_company_id uuid,p_actor_user_id uuid,p_operation_uid uuid,p_operations jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_op jsonb; v_entity text; v_action text; v_uid text; v_expected bigint;
  v_result jsonb; v_item jsonb; v_items jsonb:='[]'::jsonb; v_version bigint;
begin
  if p_operations is null or pg_catalog.jsonb_typeof(p_operations)<>'array'
    or pg_catalog.jsonb_array_length(p_operations)<1 or pg_catalog.jsonb_array_length(p_operations)>100 then
    raise exception 'Le lot doit contenir entre 1 et 100 opérations.' using errcode='22023';
  end if;
  for v_op in select value from pg_catalog.jsonb_array_elements(p_operations) loop
    v_entity:=v_op->>'entity_type'; v_action:=v_op->>'operation'; v_uid:=coalesce(v_op->>'client_uid','');
    v_expected:=coalesce(nullif(v_op->>'expected_sync_version','')::bigint,0);
    if v_entity is null or v_entity not in ('settings','custom_account','third','asset','entry')
      or v_action is null or v_action not in ('upsert','delete') or v_expected<0
      or (v_entity='settings' and v_uid<>'') or (v_entity<>'settings' and v_uid='') then
      raise exception 'Opération de synchronisation invalide.' using errcode='22023';
    end if;
  end loop;
  if exists(select 1 from (
    select value->>'entity_type' entity_type,coalesce(value->>'client_uid','') client_uid,count(*) n
    from pg_catalog.jsonb_array_elements(p_operations) group by 1,2
  ) d where d.n>1) then
    raise exception 'Un même élément ne peut apparaître qu’une fois dans un lot.' using errcode='22023';
  end if;
  v_result:=public.push_accounting_changes_internal(p_company_id,p_actor_user_id,p_operation_uid,p_operations);
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_result->'results') loop
    v_entity:=v_item->>'entity_type'; v_uid:=v_item->>'client_uid'; v_version:=null;
    if v_item->>'operation'<>'delete' then
      if v_entity='settings' then
        select sync_version into v_version from public.accounting_settings where company_id=p_company_id;
      elsif v_entity='custom_account' then
        select sync_version into v_version from public.accounting_custom_accounts where company_id=p_company_id and client_uid=v_uid::uuid;
      elsif v_entity='third' then
        select sync_version into v_version from public.accounting_thirds where company_id=p_company_id and client_uid=v_uid::uuid;
      elsif v_entity='asset' then
        select sync_version into v_version from public.accounting_assets where company_id=p_company_id and client_uid=v_uid::uuid;
      elsif v_entity='entry' then
        select sync_version into v_version from public.accounting_entries where company_id=p_company_id and client_uid=v_uid::uuid;
      end if;
    end if;
    v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_item,'{sync_version}',coalesce(pg_catalog.to_jsonb(v_version),'null'::jsonb),true));
  end loop;
  return pg_catalog.jsonb_set(v_result,'{results}',v_items,true);
end;
$function$;
revoke all on function public.push_accounting_changes(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.push_accounting_changes(uuid,uuid,uuid,jsonb) to service_role;
