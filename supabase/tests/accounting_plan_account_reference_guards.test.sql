-- Tests d'intégrité des références de comptes côté PostgreSQL.
-- Le bloc entier est annulé : aucune donnée de test n'est conservée.
begin;
do $test$
declare
  v_company uuid;
  v_entry uuid;
  v_failed boolean;
begin
  select id into v_company from public.companies order by created_at limit 1;
  if v_company is null then raise exception 'Aucune entreprise DEV disponible pour le test.'; end if;

  set constraints all deferred;
  insert into public.accounting_settings(company_id,settings)
  values(v_company,'{"plan":"syscohada"}'::jsonb)
  on conflict(company_id) do update set settings=excluded.settings;

  -- Comptes SYSCOHADA valides : l'écriture équilibrée doit être acceptée.
  insert into public.accounting_entries(company_id,client_uid,entry_date,journal)
  values(v_company,gen_random_uuid(),current_date,'OD') returning id into v_entry;
  insert into public.accounting_entry_lines(company_id,entry_id,line_number,account_code,debit,credit)
  values(v_company,v_entry,1,'101',100,0),(v_company,v_entry,2,'401',0,100);
  set constraints all immediate;
  delete from public.accounting_entries where company_id=v_company and id=v_entry;
  set constraints all deferred;

  -- Un compte absent du plan doit être rejeté.
  v_failed:=false;
  begin
    insert into public.accounting_entries(company_id,client_uid,entry_date,journal)
    values(v_company,gen_random_uuid(),current_date,'OD') returning id into v_entry;
    insert into public.accounting_entry_lines(company_id,entry_id,line_number,account_code,debit,credit)
    values(v_company,v_entry,1,'ZZZ_QA_INVALID',100,0),(v_company,v_entry,2,'401',0,100);
    set constraints all immediate;
  exception when foreign_key_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Compte inexistant accepté.'; end if;
  set constraints all deferred;

  -- Une immobilisation ne peut pas référencer un compte inconnu.
  v_failed:=false;
  begin
    insert into public.accounting_assets(company_id,name,account_code,amount,years,method,service_date)
    values(v_company,'Actif QA','ZZZ_QA_INVALID',1000,5,'lineaire',current_date);
    set constraints all immediate;
  exception when foreign_key_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Compte d’immobilisation inexistant accepté.'; end if;
  set constraints all deferred;

  -- Un compte personnalisé ne peut pas dupliquer un compte officiel.
  v_failed:=false;
  begin
    insert into public.accounting_custom_accounts(company_id,code,label,account_type)
    values(v_company,'101','Conflit QA','equity');
    set constraints all immediate;
  exception when unique_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Code personnalisé en conflit accepté.'; end if;
  set constraints all deferred;

  -- Un changement de plan ne peut pas invalider un compte déjà utilisé.
  v_failed:=false;
  begin
    insert into public.accounting_entries(company_id,client_uid,entry_date,journal)
    values(v_company,gen_random_uuid(),current_date,'OD') returning id into v_entry;
    insert into public.accounting_entry_lines(company_id,entry_id,line_number,account_code,debit,credit)
    values(v_company,v_entry,1,'17',100,0),(v_company,v_entry,2,'401',0,100);
    set constraints all immediate;
    update public.accounting_settings
      set settings=jsonb_set(settings,'{plan}','"pcg"'::jsonb)
      where company_id=v_company;
    set constraints all immediate;
  exception when check_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Changement de plan invalidant une écriture accepté.'; end if;
end;
$test$;
rollback;
