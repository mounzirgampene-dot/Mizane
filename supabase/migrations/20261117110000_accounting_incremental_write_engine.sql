begin;
create table if not exists private.accounting_sync_operations (
  company_id uuid not null references public.companies(id) on delete cascade,
  operation_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, operation_id)
);
revoke all on private.accounting_sync_operations from public, anon, authenticated;
grant select, insert on private.accounting_sync_operations to service_role;
CREATE OR REPLACE FUNCTION public.apply_accounting_changes(p_company_id uuid, p_actor_user_id uuid, p_operation_id uuid, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_change jsonb;
  v_data jsonb;
  v_entity text;
  v_operation text;
  v_uid uuid;
  v_expected bigint;
  v_current bigint;
  v_row_id uuid;
  v_entry_id uuid;
  v_line jsonb;
  v_line_no integer;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_total_debit numeric(20,2);
  v_total_credit numeric(20,2);
  v_results jsonb := '[]'::jsonb;
  v_item jsonb;
  v_existing private.accounting_sync_operations%rowtype;
  v_hash text;
  v_count integer := 0;
  v_settings jsonb;
begin
  if p_company_id is null or p_actor_user_id is null or p_operation_id is null then
    raise exception 'Paramètres de synchronisation manquants.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) < 1
     or jsonb_array_length(p_changes) > 100 then
    raise exception 'Le lot doit contenir entre 1 et 100 changements.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id
      and m.status = 'active' and m.role = any (array['admin','accountant']::public.company_role[])
  ) then
    raise exception 'Accès comptable refusé.' using errcode = '42501';
  end if;

  v_hash := pg_catalog.md5(p_changes::text);
  select * into v_existing
  from private.accounting_sync_operations
  where company_id = p_company_id and operation_id = p_operation_id
  for update;
  if found then
    if v_existing.payload_hash <> v_hash or v_existing.actor_user_id <> p_actor_user_id then
      raise exception 'Identifiant d’opération déjà utilisé avec un contenu différent.' using errcode = '23505';
    end if;
    return v_existing.result;
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_count := v_count + 1;
    v_entity := v_change->>'entity';
    v_operation := v_change->>'operation';
    v_data := coalesce(v_change->'data','{}'::jsonb);
    v_uid := nullif(v_change->>'client_uid','')::uuid;
    v_expected := coalesce(nullif(v_change->>'expected_sync_version','')::bigint,0);

    if v_entity not in ('settings','custom_account','third','asset','entry')
       or v_operation not in ('upsert','delete')
       or (v_entity <> 'settings' and v_uid is null)
       or jsonb_typeof(v_data) <> 'object' then
      raise exception 'Changement % invalide.', v_count using errcode = '22023';
    end if;

    v_current := null;
    v_row_id := null;
    if v_entity = 'settings' then
      select sync_version into v_current from public.accounting_settings
      where company_id=p_company_id for update;
    elsif v_entity = 'custom_account' then
      select sync_version,id into v_current,v_row_id from public.accounting_custom_accounts
      where company_id=p_company_id and client_uid=v_uid for update;
    elsif v_entity = 'third' then
      select sync_version,id into v_current,v_row_id from public.accounting_thirds
      where company_id=p_company_id and client_uid=v_uid for update;
    elsif v_entity = 'asset' then
      select sync_version,id into v_current,v_row_id from public.accounting_assets
      where company_id=p_company_id and client_uid=v_uid for update;
    elsif v_entity = 'entry' then
      select sync_version,id into v_current,v_row_id from public.accounting_entries
      where company_id=p_company_id and client_uid=v_uid for update;
    end if;

    if v_operation = 'upsert' and v_current is null and v_expected = 0 then
      if v_entity = 'settings' then
        v_settings := coalesce(v_data->'settings','{}'::jsonb)
          - 'aiKey' - 'ai_key' - 'apiKey' - 'api_key' - 'providerApiKey';
        insert into public.accounting_settings(company_id,settings,next_entry_id)
        values (p_company_id,v_settings,coalesce(nullif(v_data->>'next_entry_id','')::bigint,1));
      elsif v_entity = 'custom_account' then
        insert into public.accounting_custom_accounts(company_id,client_uid,code,label,account_type)
        values (p_company_id,v_uid,trim(v_data->>'code'),trim(v_data->>'label'),trim(v_data->>'account_type'));
      elsif v_entity = 'third' then
        insert into public.accounting_thirds(company_id,client_uid,name,third_type,phone,email)
        values (p_company_id,v_uid,trim(v_data->>'name'),coalesce(v_data->>'third_type','autre'),
          coalesce(v_data->>'phone',''),coalesce(v_data->>'email',''));
      elsif v_entity = 'asset' then
        insert into public.accounting_assets(company_id,client_uid,name,account_code,amount,years,method,service_date,amortized)
        values (p_company_id,v_uid,trim(v_data->>'name'),trim(v_data->>'account_code'),
          (v_data->>'amount')::numeric,(v_data->>'years')::integer,coalesce(v_data->>'method','lineaire'),
          (v_data->>'service_date')::date,coalesce(nullif(v_data->>'amortized','')::numeric,0));
      elsif v_entity = 'entry' then
        if jsonb_typeof(v_data->'lines') <> 'array' or jsonb_array_length(v_data->'lines') < 2 then
          raise exception 'Une écriture doit contenir au moins deux lignes.' using errcode='23514';
        end if;
        insert into public.accounting_entries(company_id,client_uid,entry_date,journal,reference,is_reversed,created_by)
        values (p_company_id,v_uid,(v_data->>'entry_date')::date,v_data->>'journal',
          coalesce(v_data->>'reference',''),coalesce((v_data->>'is_reversed')::boolean,false),p_actor_user_id)
        returning id into v_entry_id;
        v_total_debit:=0; v_total_credit:=0; v_line_no:=0;
        for v_line in select value from jsonb_array_elements(v_data->'lines')
        loop
          v_line_no:=v_line_no+1;
          v_debit:=coalesce(nullif(v_line->>'debit','')::numeric,0);
          v_credit:=coalesce(nullif(v_line->>'credit','')::numeric,0);
          if not ((v_debit>0 and v_credit=0) or (v_credit>0 and v_debit=0)) then
            raise exception 'Montant invalide dans la ligne %.',v_line_no using errcode='23514';
          end if;
          insert into public.accounting_entry_lines(company_id,entry_id,line_number,account_code,label,third_name,debit,credit)
          values (p_company_id,v_entry_id,v_line_no,trim(v_line->>'account_code'),
            coalesce(v_line->>'label',''),coalesce(v_line->>'third_name',''),v_debit,v_credit);
          v_total_debit:=v_total_debit+v_debit; v_total_credit:=v_total_credit+v_credit;
        end loop;
        if v_line_no<2 or v_total_debit<=0 or abs(v_total_debit-v_total_credit)>0.001 then
          raise exception 'Écriture déséquilibrée : débit %, crédit %.',v_total_debit,v_total_credit using errcode='23514';
        end if;
      end if;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('client_uid',v_uid,'entity',v_entity,'status','applied','sync_version',1));
    elsif v_current is not null and v_operation='upsert' and v_current=v_expected then
      if v_entity='settings' then
        v_settings:=coalesce(v_data->'settings','{}'::jsonb)
          - 'aiKey' - 'ai_key' - 'apiKey' - 'api_key' - 'providerApiKey';
        update public.accounting_settings set settings=v_settings,
          next_entry_id=coalesce(nullif(v_data->>'next_entry_id','')::bigint,next_entry_id)
          where company_id=p_company_id;
      elsif v_entity='custom_account' then
        update public.accounting_custom_accounts set code=trim(v_data->>'code'),
          label=trim(v_data->>'label'),account_type=trim(v_data->>'account_type')
          where company_id=p_company_id and client_uid=v_uid;
      elsif v_entity='third' then
        update public.accounting_thirds set name=trim(v_data->>'name'),
          third_type=coalesce(v_data->>'third_type','autre'),phone=coalesce(v_data->>'phone',''),
          email=coalesce(v_data->>'email','') where company_id=p_company_id and client_uid=v_uid;
      elsif v_entity='asset' then
        update public.accounting_assets set name=trim(v_data->>'name'),
          account_code=trim(v_data->>'account_code'),amount=(v_data->>'amount')::numeric,
          years=(v_data->>'years')::integer,method=coalesce(v_data->>'method','lineaire'),
          service_date=(v_data->>'service_date')::date,
          amortized=coalesce(nullif(v_data->>'amortized','')::numeric,0)
          where company_id=p_company_id and client_uid=v_uid;
      elsif v_entity='entry' then
        if jsonb_typeof(v_data->'lines') <> 'array' or jsonb_array_length(v_data->'lines') < 2 then
          raise exception 'Une écriture doit contenir au moins deux lignes.' using errcode='23514';
        end if;
        update public.accounting_entries set entry_date=(v_data->>'entry_date')::date,
          journal=v_data->>'journal',reference=coalesce(v_data->>'reference',''),
          is_reversed=coalesce((v_data->>'is_reversed')::boolean,false)
          where company_id=p_company_id and client_uid=v_uid returning id into v_entry_id;
        delete from public.accounting_entry_lines where company_id=p_company_id and entry_id=v_entry_id;
        v_total_debit:=0; v_total_credit:=0; v_line_no:=0;
        for v_line in select value from jsonb_array_elements(v_data->'lines')
        loop
          v_line_no:=v_line_no+1;
          v_debit:=coalesce(nullif(v_line->>'debit','')::numeric,0);
          v_credit:=coalesce(nullif(v_line->>'credit','')::numeric,0);
          if not ((v_debit>0 and v_credit=0) or (v_credit>0 and v_debit=0)) then
            raise exception 'Montant invalide dans la ligne %.',v_line_no using errcode='23514';
          end if;
          insert into public.accounting_entry_lines(company_id,entry_id,line_number,account_code,label,third_name,debit,credit)
          values (p_company_id,v_entry_id,v_line_no,trim(v_line->>'account_code'),
            coalesce(v_line->>'label',''),coalesce(v_line->>'third_name',''),v_debit,v_credit);
          v_total_debit:=v_total_debit+v_debit; v_total_credit:=v_total_credit+v_credit;
        end loop;
        if v_line_no<2 or v_total_debit<=0 or abs(v_total_debit-v_total_credit)>0.001 then
          raise exception 'Écriture déséquilibrée : débit %, crédit %.',v_total_debit,v_total_credit using errcode='23514';
        end if;
      end if;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('client_uid',v_uid,'entity',v_entity,'status','applied','sync_version',v_current+1));
    elsif v_current is not null and v_operation='delete' and v_current=v_expected then
      if v_entity='settings' then
        delete from public.accounting_settings where company_id=p_company_id;
      elsif v_entity='custom_account' then
        delete from public.accounting_custom_accounts where company_id=p_company_id and client_uid=v_uid;
      elsif v_entity='third' then
        delete from public.accounting_thirds where company_id=p_company_id and client_uid=v_uid;
      elsif v_entity='asset' then
        delete from public.accounting_assets where company_id=p_company_id and client_uid=v_uid;
      elsif v_entity='entry' then
        delete from public.accounting_entries where company_id=p_company_id and client_uid=v_uid;
      end if;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('client_uid',v_uid,'entity',v_entity,'status','deleted'));
    else
      v_results:=v_results||jsonb_build_array(jsonb_build_object('client_uid',v_uid,'entity',v_entity,
        'status','conflict','server_sync_version',v_current));
    end if;
  end loop;

  insert into public.audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values (p_company_id,p_actor_user_id,'accounting.changes_applied','accounting_sync',
    p_operation_id::text,jsonb_build_object('count',v_count,'results',v_results));

  v_item:=jsonb_build_object('operation_id',p_operation_id,'results',v_results);
  insert into private.accounting_sync_operations(company_id,operation_id,actor_user_id,payload_hash,result)
  values (p_company_id,p_operation_id,p_actor_user_id,v_hash,v_item);
  return v_item;
end;
$function$

revoke all on function public.apply_accounting_changes(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.apply_accounting_changes(uuid,uuid,uuid,jsonb) to service_role;
commit;