begin;
create or replace function private.strip_accounting_secrets(p_value jsonb)
returns jsonb language plpgsql immutable set search_path = ''
as $function$
declare v_key text; v_value jsonb; v_norm text; v_out jsonb;
begin
 if p_value is null then return null; end if;
 if pg_catalog.jsonb_typeof(p_value)='object' then
  v_out:='{}'::jsonb;
  for v_key,v_value in select key,value from pg_catalog.jsonb_each(p_value) loop
   v_norm:=pg_catalog.lower(pg_catalog.regexp_replace(v_key,'[^a-zA-Z0-9]','','g'));
   if v_norm not in ('aikey','aikeyenc','apikey','apikeyenc','providerapikey','providerapikeyenc','openaiapikey','openaiapikeyenc','mistralapikey','mistralapikeyenc','groqapikey','groqapikeyenc','googleapikey','googleapikeyenc','secret','accesstoken','refreshtoken') then
    v_out:=v_out || pg_catalog.jsonb_build_object(v_key,private.strip_accounting_secrets(v_value));
   end if;
  end loop;
  return v_out;
 elsif pg_catalog.jsonb_typeof(p_value)='array' then
  select coalesce(pg_catalog.jsonb_agg(private.strip_accounting_secrets(value)),'[]'::jsonb) into v_out
  from pg_catalog.jsonb_array_elements(p_value);
  return v_out;
 end if;
 return p_value;
end;
$function$;
revoke all on function private.strip_accounting_secrets(jsonb) from public,anon,authenticated;
update public.accounting_settings set settings=private.strip_accounting_secrets(settings)
where settings is distinct from private.strip_accounting_secrets(settings);
alter table public.accounting_settings drop constraint if exists accounting_settings_no_provider_secrets;
alter table public.accounting_settings add constraint accounting_settings_no_provider_secrets
check (not (settings ?| array['aiKey','ai_key','apiKey','api_key','providerApiKey','aiKeyEnc','ai_key_enc','apiKeyEnc','api_key_enc','providerApiKeyEnc','secret']));
CREATE OR REPLACE FUNCTION public.import_accounting_snapshot(p_company_id uuid, p_actor_user_id uuid, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := p_actor_user_id;
  v_entry jsonb;
  v_line jsonb;
  v_third jsonb;
  v_asset jsonb;
  v_account jsonb;
  v_entry_id uuid;
  v_source_id bigint;
  v_reverse_id bigint;
  v_next_id bigint;
  v_line_no integer;
  v_line_count integer;
  v_custom_count integer := 0;
  v_third_count integer := 0;
  v_entry_count integer := 0;
  v_line_total integer := 0;
  v_asset_count integer := 0;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_total_debit numeric(20,2);
  v_total_credit numeric(20,2);
  v_settings jsonb;
  v_name text;
  v_code text;
  v_method text;
  v_amount numeric(15,2);
  v_amortized numeric(15,2);
  v_years integer;
  v_max_local_id bigint := 0;
begin
  if v_user_id is null then
    raise exception 'Authentification requise.' using errcode = '28000';
  end if;

  if p_company_id is null
     or v_user_id is null
     or not exists (
       select 1
       from public.company_memberships m
       where m.company_id = p_company_id
         and m.user_id = v_user_id
         and m.status = 'active'
         and m.role = any (array['admin', 'accountant']::public.company_role[])
     ) then
    raise exception 'Accès comptable refusé pour cette entreprise.' using errcode = '42501';
  end if;

  if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Instantané comptable invalide.' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_snapshot->'entries', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_snapshot->'thirds', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_snapshot->'assets', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_snapshot->'settings', '{}'::jsonb)) <> 'object' then
    raise exception 'Structure de sauvegarde incompatible.' using errcode = '22023';
  end if;

  if exists (select 1 from public.accounting_settings s where s.company_id = p_company_id)
     or exists (select 1 from public.accounting_custom_accounts a where a.company_id = p_company_id)
     or exists (select 1 from public.accounting_thirds t where t.company_id = p_company_id)
     or exists (select 1 from public.accounting_entries e where e.company_id = p_company_id)
     or exists (select 1 from public.accounting_assets a where a.company_id = p_company_id) then
    raise exception 'Une comptabilité cloud existe déjà pour cette entreprise ; import initial refusé pour protéger les données.' using errcode = '23505';
  end if;

  -- Les clés fournisseur ne sont jamais importées depuis le navigateur.
  v_settings := private.strip_accounting_secrets(coalesce(p_snapshot->'settings', '{}'::jsonb));

  -- Paramètres et prochain identifiant local.
  insert into public.accounting_settings(company_id, settings, next_entry_id)
  values (p_company_id, v_settings, 1);

  -- Comptes personnalisés du plan de l'entreprise.
  if pg_catalog.jsonb_typeof(coalesce(v_settings->'customAccounts', '[]'::jsonb)) <> 'array' then
    raise exception 'Liste des comptes personnalisés invalide.' using errcode = '22023';
  end if;

  for v_account in
    select value from pg_catalog.jsonb_array_elements(coalesce(v_settings->'customAccounts', '[]'::jsonb))
  loop
    v_code := pg_catalog.btrim(coalesce(v_account->>'code', ''));
    v_name := pg_catalog.btrim(coalesce(v_account->>'label', ''));
    if v_code = '' or v_name = '' or pg_catalog.btrim(coalesce(v_account->>'type', '')) = '' then
      raise exception 'Un compte personnalisé comporte un code, un libellé ou un type manquant.' using errcode = '22023';
    end if;
    insert into public.accounting_custom_accounts(company_id, client_uid, code, label, account_type)
    values (
      p_company_id,
      coalesce(nullif(v_account->>'client_uid', '')::uuid, gen_random_uuid()),
      v_code, v_name, pg_catalog.btrim(v_account->>'type')
    );
    v_custom_count := v_custom_count + 1;
  end loop;

  -- Tiers : la ligne comptable conserve aussi le nom du tiers comme dans le modèle local.
  for v_third in
    select value from pg_catalog.jsonb_array_elements(coalesce(p_snapshot->'thirds', '[]'::jsonb))
  loop
    v_name := pg_catalog.btrim(coalesce(v_third->>'name', ''));
    if v_name = '' then
      raise exception 'Un tiers ne possède pas de nom.' using errcode = '22023';
    end if;
    insert into public.accounting_thirds(company_id, client_uid, name, third_type, phone, email)
    values (
      p_company_id,
      coalesce(nullif(v_third->>'client_uid', '')::uuid, gen_random_uuid()),
      v_name,
      case when v_third->>'type' in ('client','fournisseur','autre') then v_third->>'type' else 'autre' end,
      coalesce(v_third->>'phone', ''),
      coalesce(v_third->>'email', '')
    );
    v_third_count := v_third_count + 1;
  end loop;

  -- En-têtes et lignes : validation de chaque écriture en partie double.
  for v_entry in
    select value from pg_catalog.jsonb_array_elements(coalesce(p_snapshot->'entries', '[]'::jsonb))
  loop
    v_source_id := nullif(v_entry->>'id', '')::bigint;
    if v_source_id is null or v_source_id < 1 then
      raise exception 'Identifiant local d’écriture invalide.' using errcode = '22023';
    end if;

    if coalesce(v_entry->>'journal', '') not in ('ACH','VTE','BAN','CAI','OD') then
      raise exception 'Journal comptable inconnu pour l’écriture locale %.', v_source_id using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(coalesce(v_entry->'lines', 'null'::jsonb)) <> 'array'
       or pg_catalog.jsonb_array_length(coalesce(v_entry->'lines', '[]'::jsonb)) < 2 then
      raise exception 'L’écriture locale % doit comporter au moins deux lignes.', v_source_id using errcode = '22023';
    end if;

    insert into public.accounting_entries(
      company_id, client_uid, source_local_id, entry_date, journal, reference,
      is_reversed, source_reverse_of_local_id, created_by, created_at, updated_at
    ) values (
      p_company_id,
      coalesce(nullif(v_entry->>'client_uid', '')::uuid, gen_random_uuid()),
      v_source_id,
      (v_entry->>'date')::date,
      v_entry->>'journal',
      coalesce(v_entry->>'reference', ''),
      coalesce((v_entry->>'reversed')::boolean, false),
      nullif(v_entry->>'reverseOf', '')::bigint,
      v_user_id,
      coalesce(nullif(v_entry->>'createdAt', '')::timestamptz, pg_catalog.now()),
      pg_catalog.now()
    ) returning id into v_entry_id;

    v_total_debit := 0;
    v_total_credit := 0;
    v_line_no := 0;

    for v_line in
      select value from pg_catalog.jsonb_array_elements(v_entry->'lines')
    loop
      v_line_no := v_line_no + 1;
      v_code := pg_catalog.btrim(coalesce(v_line->>'account', ''));
      if v_code = '' then
        raise exception 'Compte absent dans l’écriture locale %, ligne %.', v_source_id, v_line_no using errcode = '22023';
      end if;

      v_debit := coalesce(nullif(v_line->>'debit', '')::numeric, 0);
      v_credit := coalesce(nullif(v_line->>'credit', '')::numeric, 0);

      if v_debit < 0 or v_credit < 0
         or v_debit > 999999999999.99 or v_credit > 999999999999.99
         or not ((v_debit > 0 and v_credit = 0) or (v_credit > 0 and v_debit = 0)) then
        raise exception 'Montant débit/crédit invalide dans l’écriture locale %, ligne %.', v_source_id, v_line_no using errcode = '22023';
      end if;

      insert into public.accounting_entry_lines(
        company_id, entry_id, line_number, account_code, label, third_name, debit, credit
      ) values (
        p_company_id, v_entry_id, v_line_no, v_code,
        coalesce(v_line->>'label', ''),
        coalesce(v_line->>'third', ''),
        v_debit, v_credit
      );

      v_total_debit := v_total_debit + v_debit;
      v_total_credit := v_total_credit + v_credit;
      v_line_total := v_line_total + 1;
    end loop;

    if v_line_no < 2 or v_total_debit <= 0 or abs(v_total_debit - v_total_credit) > 0.001 then
      raise exception 'L’écriture locale % est déséquilibrée : débit %, crédit %.',
        v_source_id, v_total_debit, v_total_credit using errcode = '23514';
    end if;

    v_entry_count := v_entry_count + 1;
    v_max_local_id := greatest(v_max_local_id, v_source_id);
  end loop;

  -- Résolution des liens de contrepassation après insertion de tous les en-têtes.
  update public.accounting_entries e
  set reverse_of_entry_id = source.id
  from public.accounting_entries source
  where e.company_id = p_company_id
    and source.company_id = p_company_id
    and e.source_reverse_of_local_id = source.source_local_id;

  if exists (
    select 1 from public.accounting_entries e
    where e.company_id = p_company_id
      and e.source_reverse_of_local_id is not null
      and e.reverse_of_entry_id is null
  ) then
    raise exception 'Une écriture de contrepassation référence une écriture d’origine absente.' using errcode = '23503';
  end if;

  -- Immobilisations et amortissements.
  for v_asset in
    select value from pg_catalog.jsonb_array_elements(coalesce(p_snapshot->'assets', '[]'::jsonb))
  loop
    v_name := pg_catalog.btrim(coalesce(v_asset->>'name', ''));
    v_code := pg_catalog.btrim(coalesce(v_asset->>'account', ''));
    v_amount := (v_asset->>'amount')::numeric;
    v_amortized := coalesce(nullif(v_asset->>'amortized', '')::numeric, 0);
    v_years := (v_asset->>'years')::integer;
    v_method := coalesce(v_asset->>'method', 'lineaire');

    if v_name = '' or v_code = '' or v_amount <= 0 or v_amortized < 0
       or v_amortized > v_amount or v_years not between 1 and 30
       or v_method not in ('lineaire','degressif') then
      raise exception 'Immobilisation invalide : %.', v_name using errcode = '22023';
    end if;

    insert into public.accounting_assets(
      company_id, client_uid, name, account_code, amount, years, method, service_date, amortized
    ) values (
      p_company_id, coalesce(nullif(v_asset->>'client_uid', '')::uuid, gen_random_uuid()),
      v_name, v_code, v_amount, v_years, v_method,
      (v_asset->>'date')::date, v_amortized
    );
    v_asset_count := v_asset_count + 1;
  end loop;

  v_next_id := coalesce(nullif(p_snapshot->>'nextId', '')::bigint, v_max_local_id + 1);
  if v_next_id <= v_max_local_id or v_next_id < 1 then
    raise exception 'Prochain identifiant local invalide.' using errcode = '22023';
  end if;

  update public.accounting_settings
  set next_entry_id = v_next_id, updated_at = pg_catalog.now()
  where company_id = p_company_id;

  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    p_company_id, v_user_id, 'accounting.snapshot_imported',
    'accounting_snapshot', p_company_id::text,
    pg_catalog.jsonb_build_object(
      'entries', v_entry_count, 'lines', v_line_total,
      'thirds', v_third_count, 'assets', v_asset_count,
      'custom_accounts', v_custom_count
    )
  );

  return pg_catalog.jsonb_build_object(
    'imported', true,
    'entries', v_entry_count,
    'lines', v_line_total,
    'thirds', v_third_count,
    'assets', v_asset_count,
    'custom_accounts', v_custom_count,
    'next_entry_id', v_next_id
  );
end;
$function$
;
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
        v_settings := private.strip_accounting_secrets(coalesce(v_data->'settings','{}'::jsonb));
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
;
commit;