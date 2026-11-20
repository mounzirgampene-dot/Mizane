begin;

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'closed' check (status in ('closed', 'open')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  constraint accounting_periods_valid_range check (start_date <= end_date),
  unique (company_id, start_date, end_date)
);

create index if not exists accounting_periods_company_status_dates_idx
  on public.accounting_periods(company_id, status, start_date, end_date);

alter table public.accounting_periods enable row level security;
alter table public.accounting_periods force row level security;
create policy accounting_periods_select_members on public.accounting_periods
  for select to authenticated using (public.is_active_company_member(company_id));
revoke all on public.accounting_periods from public, anon, authenticated;
grant select on public.accounting_periods to authenticated;

create or replace function public.manage_accounting_period(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_action text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role public.company_role;
  v_period public.accounting_periods%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if p_company_id is null or p_start_date is null or p_end_date is null
     or p_start_date > p_end_date or p_action is null or p_action not in ('close', 'reopen') then
    raise exception 'Paramètres de période invalides.' using errcode = '22023';
  end if;

  select m.role into v_role
  from public.company_memberships m
  where m.company_id = p_company_id and m.user_id = v_actor
    and m.status = 'active';
  if not found then
    raise exception 'Accès à cette entreprise refusé.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':accounting-periods', 0)
  );

  if p_action = 'close' then
    if v_role not in ('admin', 'accountant') then
      raise exception 'Seul un administrateur ou un comptable peut clôturer une période.' using errcode = '42501';
    end if;
    select * into v_period
    from public.accounting_periods p
    where p.company_id = p_company_id and p.start_date = p_start_date and p.end_date = p_end_date
    for update;
    if found and v_period.status = 'closed' then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'action', p_action, 'start_date', p_start_date, 'end_date', p_end_date,
        'status', v_period.status, 'period_id', v_period.id
      );
    end if;
    if exists (
      select 1 from public.accounting_periods p
      where p.company_id = p_company_id and p.status = 'closed'
        and p.start_date <= p_end_date and p.end_date >= p_start_date
    ) then
      raise exception 'Cette période chevauche une période déjà clôturée.' using errcode = '23505';
    end if;
    insert into public.accounting_periods(company_id, start_date, end_date, status, closed_by, closed_at)
    values (p_company_id, p_start_date, p_end_date, 'closed', v_actor, pg_catalog.now())
    on conflict (company_id, start_date, end_date) do update
      set status = 'closed', closed_by = excluded.closed_by, closed_at = excluded.closed_at,
          reopened_by = null, reopened_at = null, reopen_reason = null
    returning * into v_period;
    insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, details)
    values (p_company_id, v_actor, 'accounting.period_closed', 'accounting_period', v_period.id::text,
      pg_catalog.jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date));
  else
    if v_role <> 'admin' then
      raise exception 'Seul un administrateur peut rouvrir une période clôturée.' using errcode = '42501';
    end if;
    if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) < 5
       or pg_catalog.length(pg_catalog.btrim(p_reason)) > 500 then
      raise exception 'Un motif de réouverture de 5 à 500 caractères est obligatoire.' using errcode = '22023';
    end if;
    update public.accounting_periods
      set status = 'open', reopened_by = v_actor, reopened_at = pg_catalog.now(),
          reopen_reason = pg_catalog.btrim(p_reason)
      where company_id = p_company_id and start_date = p_start_date and end_date = p_end_date
        and status = 'closed'
      returning * into v_period;
    if not found then
      raise exception 'Période clôturée introuvable.' using errcode = 'P0002';
    end if;
    insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, details)
    values (p_company_id, v_actor, 'accounting.period_reopened', 'accounting_period', v_period.id::text,
      pg_catalog.jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date, 'reason', pg_catalog.btrim(p_reason)));
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'action', p_action, 'start_date', p_start_date, 'end_date', p_end_date,
    'status', v_period.status, 'period_id', v_period.id
  );
end;
$function$;

revoke all on function public.manage_accounting_period(uuid, date, date, text, text) from public, anon;
grant execute on function public.manage_accounting_period(uuid, date, date, text, text) to authenticated;

create or replace function private.guard_closed_accounting_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_entry_date date;
begin
  if tg_op <> 'INSERT' then
    v_company_id := old.company_id;
    v_entry_date := old.entry_date;
    if exists (
      select 1 from public.accounting_periods p
      where p.company_id = v_company_id and p.status = 'closed'
        and v_entry_date between p.start_date and p.end_date
    ) then
      raise exception 'Période comptable clôturée : modification ou suppression interdite.' using errcode = '55000';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    v_company_id := new.company_id;
    v_entry_date := new.entry_date;
    if exists (
      select 1 from public.accounting_periods p
      where p.company_id = v_company_id and p.status = 'closed'
        and v_entry_date between p.start_date and p.end_date
    ) then
      raise exception 'Période comptable clôturée : nouvelle écriture interdite.' using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.guard_closed_accounting_period() from public, anon, authenticated;
drop trigger if exists accounting_entries_closed_period_guard on public.accounting_entries;
create trigger accounting_entries_closed_period_guard
before insert or update or delete on public.accounting_entries
for each row execute function private.guard_closed_accounting_period();

 
create or replace function private.guard_closed_accounting_period_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_entry_id uuid;
  v_company_id uuid;
  v_entry_date date;
begin
  if tg_op <> 'INSERT' then
    v_entry_id := old.entry_id;
    v_company_id := old.company_id;
    select e.entry_date into v_entry_date from public.accounting_entries e
    where e.company_id = v_company_id and e.id = v_entry_id;
    if exists (
      select 1 from public.accounting_periods p
      where p.company_id = v_company_id and p.status = 'closed'
        and v_entry_date between p.start_date and p.end_date
    ) then
      raise exception 'Période comptable clôturée : modification des lignes interdite.' using errcode = '55000';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    v_entry_id := new.entry_id;
    v_company_id := new.company_id;
    select e.entry_date into v_entry_date from public.accounting_entries e
    where e.company_id = v_company_id and e.id = v_entry_id;
    if exists (
      select 1 from public.accounting_periods p
      where p.company_id = v_company_id and p.status = 'closed'
        and v_entry_date between p.start_date and p.end_date
    ) then
      raise exception 'Période comptable clôturée : modification des lignes interdite.' using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.guard_closed_accounting_period_line() from public, anon, authenticated;
drop trigger if exists accounting_entry_lines_closed_period_guard on public.accounting_entry_lines;
create trigger accounting_entry_lines_closed_period_guard
before insert or update or delete on public.accounting_entry_lines
for each row execute function private.guard_closed_accounting_period_line();

commit;
