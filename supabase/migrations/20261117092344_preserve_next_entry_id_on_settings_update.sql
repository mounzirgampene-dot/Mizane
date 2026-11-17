CREATE OR REPLACE FUNCTION public.push_accounting_changes_internal(p_company_id uuid, p_actor_user_id uuid, p_operation_uid uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_op jsonb;
  v_payload jsonb;
  v_entity text;
  v_action text;
  v_uid uuid;
  v_expected bigint;
  v_actual bigint;
  v_current_id uuid;
  v_entry_id uuid;
  v_line jsonb;
  v_line_no integer;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_total_debit numeric(20,2);
  v_total_credit numeric(20,2);
  v_lines jsonb;
  v_results jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_settings jsonb;
  v_next_id bigint;
  v_name text;
  v_code text;
  v_method text;
  v_result jsonb;
  v_processed integer := 0;
begin
  if p_company_id is null or p_actor_user_id is null or p_operation_uid is null then
    raise exception 'Paramètres d’authentification ou d’opération manquants.' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id=p_company_id and m.user_id=p_actor_user_id
      and m.status='active' and m.role=any(array['admin','accountant']::public.company_role[])
  ) then
    raise exception 'Accès comptable refusé.' using errcode='42501';
  end if;
  if p_operations is null or pg_catalog.jsonb_typeof(p_operations)<>'array'
     or pg_catalog.jsonb_array_length(p_operations)<1
     or pg_catalog.jsonb_array_length(p_operations)>100 then
    raise exception 'Le lot doit contenir entre 1 et 100 opérations.' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text,0));

  select response into v_result
  from public.accounting_sync_operations
  where company_id=p_company_id and operation_uid=p_operation_uid;
  if found then return v_result; end if;

  -- Prévalidation complète : un conflit annule le lot avant toute écriture.
  for v_op in select value from pg_catalog.jsonb_array_elements(p_operations)
  loop
    v_entity := v_op->>'entity_type';
    v_action := v_op->>'operation';
    v_uid := nullif(v_op->>'client_uid','')::uuid;
    v_expected := coalesce(nullif(v_op->>'expected_sync_version','')::bigint,0);
    if v_entity not in ('settings','custom_account','third','asset','entry')
       or v_action not in ('upsert','delete')
       or v_expected < 0
       or (v_entity<>'settings' and v_uid is null)
       or (v_entity='settings' and v_uid is not null) then
      raise exception 'Opération de synchronisation invalide.' using errcode='22023';
    end if;

    v_actual := null;
    if v_entity='settings' then
      select sync_version into v_actual from public.accounting_settings
      where company_id=p_company_id for update;
    elsif v_entity='custom_account' then
      select sync_version into v_actual from public.accounting_custom_accounts
      where company_id=p_company_id and client_uid=v_uid for update;
    elsif v_entity='third' then
      select sync_version into v_actual from public.accounting_thirds
      where company_id=p_company_id and client_uid=v_uid for update;
    elsif v_entity='asset' then
      select sync_version into v_actual from public.accounting_assets
      where company_id=p_company_id and client_uid=v_uid for update;
    elsif v_entity='entry' then
      select sync_version into v_actual from public.accounting_entries
      where company_id=p_company_id and client_uid=v_uid for update;
    end if;

    if (v_actual is null and v_expected<>0) or
       (v_actual is not null and v_actual<>v_expected) then
      v_conflicts := v_conflicts || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('entity_type',v_entity,'client_uid',v_uid,
          'expected_sync_version',v_expected,'server_sync_version',v_actual)
      );
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(v_conflicts)>0 then
    return pg_catalog.jsonb_build_object('ok',false,'conflict',true,'conflicts',v_conflicts);
  end if;

  for v_op in select value from pg_catalog.jsonb_array_elements(p_operations)
  loop
    v_entity := v_op->>'entity_type';
    v_action := v_op->>'operation';
    v_uid := nullif(v_op->>'client_uid','')::uuid;
    v_expected := coalesce(nullif(v_op->>'expected_sync_version','')::bigint,0);
    v_payload := coalesce(v_op->'data','{}'::jsonb);
    v_current_id := null;
    v_actual := null;

    if v_entity='settings' then
      if v_action='delete' then
        delete from public.accounting_settings where company_id=p_company_id;
      else
        v_settings := private.strip_accounting_secrets(coalesce(v_payload->'settings','{}'::jsonb));
        v_next_id := greatest(1,coalesce(nullif(v_payload->>'next_entry_id','')::bigint,1));
        insert into public.accounting_settings(company_id,settings,next_entry_id)
        values(p_company_id,v_settings,v_next_id)
        on conflict(company_id) do update set settings=excluded.settings,next_entry_id=case when v_payload ? 'next_entry_id' then excluded.next_entry_id else accounting_settings.next_entry_id end,updated_at=pg_catalog.now()
        returning sync_version into v_actual;
      end if;

    elsif v_entity='custom_account' then
      if v_action='delete' then
        delete from public.accounting_custom_accounts where company_id=p_company_id and client_uid=v_uid;
      else
        insert into public.accounting_custom_accounts(company_id,client_uid,code,label,account_type)
        values(p_company_id,v_uid,pg_catalog.btrim(v_payload->>'code'),
          pg_catalog.btrim(v_payload->>'label'),pg_catalog.btrim(v_payload->>'account_type'))
        on conflict(company_id,client_uid) do update set
          code=excluded.code,label=excluded.label,account_type=excluded.account_type,updated_at=pg_catalog.now()
        returning id,sync_version into v_current_id,v_actual;
      end if;

    elsif v_entity='third' then
      if v_action='delete' then
        delete from public.accounting_thirds where company_id=p_company_id and client_uid=v_uid;
      else
        insert into public.accounting_thirds(company_id,client_uid,name,third_type,phone,email)
        values(p_company_id,v_uid,pg_catalog.btrim(v_payload->>'name'),
          coalesce(v_payload->>'third_type','autre'),coalesce(v_payload->>'phone',''),coalesce(v_payload->>'email',''))
        on conflict(company_id,client_uid) do update set
          name=excluded.name,third_type=excluded.third_type,phone=excluded.phone,email=excluded.email,updated_at=pg_catalog.now()
        returning id,sync_version into v_current_id,v_actual;
      end if;

    elsif v_entity='asset' then
      if v_action='delete' then
        delete from public.accounting_assets where company_id=p_company_id and client_uid=v_uid;
      else
        insert into public.accounting_assets(company_id,client_uid,name,account_code,amount,years,method,service_date,amortized)
        values(p_company_id,v_uid,pg_catalog.btrim(v_payload->>'name'),
          pg_catalog.btrim(v_payload->>'account_code'),(v_payload->>'amount')::numeric,
          (v_payload->>'years')::integer,coalesce(v_payload->>'method','lineaire'),
          (v_payload->>'service_date')::date,coalesce(nullif(v_payload->>'amortized','')::numeric,0))
        on conflict(company_id,client_uid) do update set
          name=excluded.name,account_code=excluded.account_code,amount=excluded.amount,
          years=excluded.years,method=excluded.method,service_date=excluded.service_date,
          amortized=excluded.amortized,updated_at=pg_catalog.now()
        returning id,sync_version into v_current_id,v_actual;
      end if;

    elsif v_entity='entry' then
      if v_action='delete' then
        select id into v_current_id from public.accounting_entries
        where company_id=p_company_id and client_uid=v_uid;
        if v_current_id is not null then
          update public.accounting_entries set reverse_of_entry_id=null
          where company_id=p_company_id and reverse_of_entry_id=v_current_id;
          delete from public.accounting_entries where company_id=p_company_id and id=v_current_id;
        end if;
      else
        v_lines := v_payload->'lines';
        if pg_catalog.jsonb_typeof(v_lines)<>'array' or pg_catalog.jsonb_array_length(v_lines)<2 then
          raise exception 'Une écriture doit comporter au moins deux lignes.' using errcode='22023';
        end if;
        if v_payload->>'journal' not in ('ACH','VTE','BAN','CAI','OD') then
          raise exception 'Journal comptable invalide.' using errcode='22023';
        end if;
        v_total_debit:=0; v_total_credit:=0; v_line_no:=0;
        for v_line in select value from pg_catalog.jsonb_array_elements(v_lines)
        loop
          v_line_no:=v_line_no+1;
          v_debit:=coalesce(nullif(v_line->>'debit','')::numeric,0);
          v_credit:=coalesce(nullif(v_line->>'credit','')::numeric,0);
          if pg_catalog.btrim(coalesce(v_line->>'account_code',''))=''
             or v_debit<0 or v_credit<0
             or not ((v_debit>0 and v_credit=0) or (v_credit>0 and v_debit=0)) then
            raise exception 'Ligne comptable invalide (ligne %).',v_line_no using errcode='22023';
          end if;
          v_total_debit:=v_total_debit+v_debit;
          v_total_credit:=v_total_credit+v_credit;
        end loop;
        if v_total_debit<=0 or abs(v_total_debit-v_total_credit)>0.001 then
          raise exception 'Écriture déséquilibrée : débit %, crédit %.',v_total_debit,v_total_credit using errcode='23514';
        end if;

        insert into public.accounting_entries(company_id,client_uid,entry_date,journal,reference,is_reversed,created_by)
        values(p_company_id,v_uid,(v_payload->>'entry_date')::date,v_payload->>'journal',
          coalesce(v_payload->>'reference',''),coalesce((v_payload->>'is_reversed')::boolean,false),p_actor_user_id)
        on conflict(company_id,client_uid) do update set
          entry_date=excluded.entry_date,journal=excluded.journal,reference=excluded.reference,
          is_reversed=excluded.is_reversed,updated_at=pg_catalog.now()
        returning id,sync_version into v_entry_id,v_actual;

        delete from public.accounting_entry_lines where company_id=p_company_id and entry_id=v_entry_id;
        v_line_no:=0;
        for v_line in select value from pg_catalog.jsonb_array_elements(v_lines)
        loop
          v_line_no:=v_line_no+1;
          insert into public.accounting_entry_lines(company_id,entry_id,line_number,account_code,label,third_name,debit,credit)
          values(p_company_id,v_entry_id,v_line_no,pg_catalog.btrim(v_line->>'account_code'),
            coalesce(v_line->>'label',''),coalesce(v_line->>'third_name',''),
            coalesce(nullif(v_line->>'debit','')::numeric,0),coalesce(nullif(v_line->>'credit','')::numeric,0));
        end loop;

        if nullif(v_payload->>'reverse_of_client_uid','') is not null then
          update public.accounting_entries e set reverse_of_entry_id=source.id
          from public.accounting_entries source
          where e.id=v_entry_id and source.company_id=p_company_id
            and source.client_uid=(v_payload->>'reverse_of_client_uid')::uuid;
          if not exists(select 1 from public.accounting_entries where id=v_entry_id and reverse_of_entry_id is not null) then
            raise exception 'Écriture d’origine de contrepassation introuvable.' using errcode='23503';
          end if;
        else
          update public.accounting_entries set reverse_of_entry_id=null where id=v_entry_id and reverse_of_entry_id is not null;
        end if;
      end if;
    end if;

    v_processed:=v_processed+1;
    v_results:=v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'entity_type',v_entity,'operation',v_action,'client_uid',v_uid,
      'sync_version',v_actual
    ));
  end loop;

  insert into public.audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,p_actor_user_id,'accounting.incremental_sync','accounting_sync',p_operation_uid::text,
    pg_catalog.jsonb_build_object('operations',v_processed));

  v_result:=pg_catalog.jsonb_build_object('ok',true,'conflict',false,'operation_uid',p_operation_uid,
    'processed',v_processed,'results',v_results);
  insert into public.accounting_sync_operations(company_id,operation_uid,response)
  values(p_company_id,p_operation_uid,v_result);
  return v_result;
end;
$function$
