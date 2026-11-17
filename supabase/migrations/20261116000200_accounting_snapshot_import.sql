-- MIZANE: import initial sécurisé d'un instantané comptable local.
-- La fonction est atomique, limitée aux administrateurs/comptables actifs et
-- refuse toute seconde importation afin d'éviter doublons ou écrasements.

begin;

create or replace function public.import_accounting_snapshot(
  p_company_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
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
     or not public.has_company_role(
       p_company_id,
       array['admin', 'accountant']::public.company_role[]
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
  v_settings := coalesce(p_snapshot->'settings', '{}'::jsonb)
    - 'aiKey' - 'ai_key' - 'apiKey' - 'api_key' - 'providerApiKey';

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
    insert into public.accounting_custom_accounts(company_id, code, label, account_type)
    values (p_company_id, v_code, v_name, pg_catalog.btrim(v_account->>'type'));
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
    insert into public.accounting_thirds(company_id, name, third_type, phone, email)
    values (
      p_company_id,
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
      company_id, source_local_id, entry_date, journal, reference,
      is_reversed, source_reverse_of_local_id, created_by, created_at, updated_at
    ) values (
      p_company_id,
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
      company_id, name, account_code, amount, years, method, service_date, amortized
    ) values (
      p_company_id, v_name, v_code, v_amount, v_years, v_method,
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
$$;

revoke all on function public.import_accounting_snapshot(uuid, jsonb)
  from public, anon;
grant execute on function public.import_accounting_snapshot(uuid, jsonb)
  to authenticated;

commit;
