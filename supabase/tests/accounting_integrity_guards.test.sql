-- Tests transactionnels des gardes d'intégrité comptable différés.
-- À exécuter dans une base de test contenant au moins une entreprise.
do $test$
declare
  v_company uuid;
  v_entry uuid;
  v_third uuid;
  v_failed boolean;
begin
  select id into v_company from public.companies order by created_at limit 1;
  if v_company is null then
    raise exception 'Aucune entreprise de test disponible.';
  end if;

  -- Une écriture équilibrée est acceptée.
  set constraints accounting_entries_integrity_guard,
                  accounting_entry_lines_integrity_guard,
                  accounting_thirds_reference_guard deferred;
  insert into public.accounting_entries(company_id, client_uid, entry_date, journal)
  values (v_company, gen_random_uuid(), current_date, 'OD') returning id into v_entry;
  insert into public.accounting_entry_lines(company_id, entry_id, line_number, account_code, debit, credit)
  values (v_company, v_entry, 1, 'TEST1', 100, 0),
         (v_company, v_entry, 2, 'TEST2', 0, 100);
  set constraints accounting_entries_integrity_guard,
                  accounting_entry_lines_integrity_guard,
                  accounting_thirds_reference_guard immediate;
  delete from public.accounting_entries where company_id=v_company and id=v_entry;

  -- Une écriture déséquilibrée doit être refusée.
  v_failed := false;
  begin
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard deferred;
    insert into public.accounting_entries(company_id, client_uid, entry_date, journal)
    values (v_company, gen_random_uuid(), current_date, 'OD') returning id into v_entry;
    insert into public.accounting_entry_lines(company_id, entry_id, line_number, account_code, debit, credit)
    values (v_company, v_entry, 1, 'TEST1', 100, 0),
           (v_company, v_entry, 2, 'TEST2', 0, 99);
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard immediate;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Une écriture déséquilibrée a été acceptée.'; end if;

  -- Un tiers absent ou ambigu doit être refusé.
  v_failed := false;
  begin
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard deferred;
    insert into public.accounting_entries(company_id, client_uid, entry_date, journal)
    values (v_company, gen_random_uuid(), current_date, 'OD') returning id into v_entry;
    insert into public.accounting_entry_lines(company_id, entry_id, line_number, account_code, third_name, debit, credit)
    values (v_company, v_entry, 1, 'TEST1', 'Tiers QA inexistant', 100, 0),
           (v_company, v_entry, 2, 'TEST2', '', 0, 100);
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard immediate;
  exception when foreign_key_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Une référence à un tiers absent a été acceptée.'; end if;

  -- Un tiers utilisé ne peut pas être supprimé tant que ses lignes existent.
  v_failed := false;
  begin
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard deferred;
    insert into public.accounting_thirds(company_id, name, third_type)
    values (v_company, 'Tiers QA protégé', 'autre') returning id into v_third;
    insert into public.accounting_entries(company_id, client_uid, entry_date, journal)
    values (v_company, gen_random_uuid(), current_date, 'OD') returning id into v_entry;
    insert into public.accounting_entry_lines(company_id, entry_id, line_number, account_code, third_name, debit, credit)
    values (v_company, v_entry, 1, 'TEST1', 'Tiers QA protégé', 100, 0),
           (v_company, v_entry, 2, 'TEST2', '', 0, 100);
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard immediate;
    delete from public.accounting_thirds where company_id=v_company and id=v_third;
    set constraints accounting_entries_integrity_guard,
                    accounting_entry_lines_integrity_guard,
                    accounting_thirds_reference_guard immediate;
  exception when foreign_key_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Un tiers encore référencé a pu être supprimé.'; end if;
end;
$test$;
