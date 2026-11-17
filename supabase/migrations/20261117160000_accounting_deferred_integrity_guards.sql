create or replace function private.assert_accounting_entry_integrity(
  p_company_id uuid,
  p_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line_count integer;
  v_total_debit numeric(20,2);
  v_total_credit numeric(20,2);
begin
  if p_company_id is null or p_entry_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.accounting_entries e
    where e.company_id = p_company_id and e.id = p_entry_id
  ) then
    return;
  end if;

  select count(*)::integer,
         coalesce(sum(l.debit), 0),
         coalesce(sum(l.credit), 0)
    into v_line_count, v_total_debit, v_total_credit
  from public.accounting_entry_lines l
  where l.company_id = p_company_id and l.entry_id = p_entry_id;

  if v_line_count < 2 then
    raise exception 'Une écriture doit comporter au moins deux lignes.'
      using errcode = '23514';
  end if;

  if v_total_debit <= 0 or abs(v_total_debit - v_total_credit) > 0.001 then
    raise exception 'Écriture déséquilibrée : débit %, crédit %.',
      v_total_debit, v_total_credit
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.accounting_entry_lines l
    where l.company_id = p_company_id
      and l.entry_id = p_entry_id
      and pg_catalog.btrim(l.third_name) <> ''
      and (
        select count(*)
        from public.accounting_thirds t
        where t.company_id = l.company_id
          and pg_catalog.lower(pg_catalog.btrim(t.name))
              = pg_catalog.lower(pg_catalog.btrim(l.third_name))
      ) <> 1
  ) then
    raise exception 'Une ligne comptable référence un tiers absent ou ambigu.'
      using errcode = '23503';
  end if;
end;
$function$;

create or replace function private.enforce_accounting_entry_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
begin
  if tg_table_name = 'accounting_entries' then
    if tg_op <> 'DELETE' then
      perform private.assert_accounting_entry_integrity(new.company_id, new.id);
    end if;
    return null;
  end if;

  if tg_table_name = 'accounting_entry_lines' then
    if tg_op <> 'INSERT' then
      perform private.assert_accounting_entry_integrity(old.company_id, old.entry_id);
    end if;
    if tg_op <> 'DELETE' then
      perform private.assert_accounting_entry_integrity(new.company_id, new.entry_id);
    end if;
    return null;
  end if;

  if tg_table_name = 'accounting_thirds' then
    if tg_op = 'UPDATE' and
       pg_catalog.lower(pg_catalog.btrim(old.name))
       = pg_catalog.lower(pg_catalog.btrim(new.name)) then
      return null;
    end if;

    for v_row in
      select distinct l.company_id, l.entry_id
      from public.accounting_entry_lines l
      where l.company_id = old.company_id
        and pg_catalog.btrim(l.third_name) <> ''
        and pg_catalog.lower(pg_catalog.btrim(l.third_name))
            = pg_catalog.lower(pg_catalog.btrim(old.name))
    loop
      perform private.assert_accounting_entry_integrity(v_row.company_id, v_row.entry_id);
    end loop;
    return null;
  end if;

  return null;
end;
$function$;

revoke all on function private.assert_accounting_entry_integrity(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.enforce_accounting_entry_integrity()
  from public, anon, authenticated;

create constraint trigger accounting_entries_integrity_guard
after insert or update on public.accounting_entries
deferrable initially deferred
for each row execute function private.enforce_accounting_entry_integrity();

create constraint trigger accounting_entry_lines_integrity_guard
after insert or update or delete on public.accounting_entry_lines
deferrable initially deferred
for each row execute function private.enforce_accounting_entry_integrity();

create constraint trigger accounting_thirds_reference_guard
after update or delete on public.accounting_thirds
deferrable initially deferred
for each row execute function private.enforce_accounting_entry_integrity();
