-- Journal détaillé des opérations comptables.
create index if not exists audit_logs_actor_created_at_idx on public.audit_logs(company_id, actor_user_id, created_at desc);

create or replace function public.push_accounting_changes(
  p_company_id uuid,p_actor_user_id uuid,p_operation_uid uuid,p_operations jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_op jsonb; v_entity text; v_uid text; v_expected bigint; v_result jsonb;
  v_item jsonb; v_items jsonb := '[]'::jsonb; v_version bigint;
  v_saved_hash text; v_hash text; v_payload jsonb; v_summary jsonb;
begin
  if p_company_id is null or p_actor_user_id is null or p_operation_uid is null then
    raise exception 'Paramètres d’authentification ou d’opération manquants.' using errcode='22023';
  end if;
  if p_operations is null or pg_catalog.jsonb_typeof(p_operations)<>'array'
    or pg_catalog.jsonb_array_length(p_operations)<1 or pg_catalog.jsonb_array_length(p_operations)>100 then
    raise exception 'Le lot doit contenir entre 1 et 100 opérations.' using errcode='22023';
  end if;
  for v_op in select value from pg_catalog.jsonb_array_elements(p_operations) loop
    v_entity:=v_op->>'entity_type'; v_uid:=coalesce(v_op->>'client_uid','');
    if v_entity is null or v_entity not in ('settings','custom_account','third','asset','entry')
      or v_op->>'operation' not in ('upsert','delete')
      or coalesce(nullif(v_op->>'expected_sync_version','')::bigint,0)<0
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text,0));
  v_hash:=pg_catalog.md5(p_operations::text);
  select request_hash,response into v_saved_hash,v_result from public.accounting_sync_operations
  where company_id=p_company_id and operation_uid=p_operation_uid;
  if found then
    if v_saved_hash is null or v_saved_hash<>v_hash then
      raise exception 'Identifiant de lot déjà utilisé avec un contenu différent.' using errcode='23505';
    end if;
    return v_result;
  end if;
  v_result:=public.push_accounting_changes_internal(p_company_id,p_actor_user_id,p_operation_uid,p_operations);
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_result->'results') loop
    v_entity:=v_item->>'entity_type'; v_uid:=coalesce(v_item->>'client_uid',''); v_version:=null;
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
    select value into v_op from pg_catalog.jsonb_array_elements(p_operations) as submitted(value)
      where submitted.value->>'entity_type'=v_entity
      and coalesce(submitted.value->>'client_uid','')=v_uid limit 1;
    v_payload:=coalesce(v_op->'data','{}'::jsonb);
    v_summary:=case v_entity
      when 'entry' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('date',v_payload->>'entry_date','journal',v_payload->>'journal','reference',nullif(v_payload->>'reference','')))
      when 'third' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('name',v_payload->>'name','type',v_payload->>'third_type'))
      when 'asset' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('name',v_payload->>'name','account',v_payload->>'account_code','amount',v_payload->>'amount'))
      when 'custom_account' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('code',v_payload->>'code','label',v_payload->>'label'))
      when 'settings' then pg_catalog.jsonb_build_object('label','Paramètres comptables')
      else '{}'::jsonb end;
    insert into public.audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
    values(p_company_id,p_actor_user_id,'accounting.'||v_entity||'.'||coalesce(v_item->>'operation','upsert'),
      'accounting_'||v_entity,coalesce(nullif(v_uid,''),p_company_id::text),
      pg_catalog.jsonb_build_object('batch_uid',p_operation_uid,'operation',v_item->>'operation','summary',v_summary));
  end loop;
  v_result:=pg_catalog.jsonb_set(v_result,'{results}',v_items,true);
  update public.accounting_sync_operations set response=v_result,request_hash=v_hash
    where company_id=p_company_id and operation_uid=p_operation_uid;
  return v_result;
end;
$function$;
comment on table public.audit_logs is 'Journal chronologique des actions de gestion et des opérations comptables, par entreprise et utilisateur.';
