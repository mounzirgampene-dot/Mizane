-- Notifications d'anomalies comptables : boîte personnelle et alertes partagées.
create table if not exists public.accounting_notifications (
  id uuid primary key default gen_random_uuid(),
  event_uid uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('error','suspicious')),
  severity text not null default 'warning' check (severity in ('info','warning','error')),
  title text not null check (length(btrim(title)) between 1 and 180),
  message text not null check (length(btrim(message)) between 1 and 2000),
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending','confirmed','dismissed')),
  read_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(event_uid, recipient_user_id)
);

create index if not exists accounting_notifications_inbox_idx
  on public.accounting_notifications(recipient_user_id, created_at desc);
create index if not exists accounting_notifications_company_idx
  on public.accounting_notifications(company_id, created_at desc);

alter table public.accounting_notifications enable row level security;

drop policy if exists accounting_notifications_select_own on public.accounting_notifications;
create policy accounting_notifications_select_own
on public.accounting_notifications for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = accounting_notifications.company_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.role in ('admin','accountant')
  )
);

drop policy if exists accounting_notifications_update_own_read on public.accounting_notifications;
create policy accounting_notifications_update_own_read
on public.accounting_notifications for update to authenticated
using (
  recipient_user_id = (select auth.uid())
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = accounting_notifications.company_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.role in ('admin','accountant')
  )
)
with check (
  recipient_user_id = (select auth.uid())
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = accounting_notifications.company_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.role in ('admin','accountant')
  )
);

grant select on public.accounting_notifications to authenticated;
grant update (read_at) on public.accounting_notifications to authenticated;

create or replace function private.emit_accounting_notification_event(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_event_uid uuid,
  p_category text,
  p_severity text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_company_id is null or p_actor_user_id is null or p_event_uid is null then
    return;
  end if;
  if p_category not in ('error','suspicious') or p_severity not in ('info','warning','error') then
    return;
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id
      and m.status = 'active' and m.role in ('admin','accountant')
  ) then
    return;
  end if;

  insert into public.accounting_notifications(
    event_uid, company_id, recipient_user_id, actor_user_id,
    category, severity, title, message, entity_type, entity_id, details
  )
  select p_event_uid, p_company_id, m.user_id, p_actor_user_id,
    p_category, p_severity, left(p_title,180), left(p_message,2000),
    p_entity_type, p_entity_id, coalesce(p_details,'{}'::jsonb)
  from public.company_memberships m
  where m.company_id = p_company_id and m.status = 'active'
    and m.role in ('admin','accountant')
    and (m.user_id = p_actor_user_id or m.role = 'admin')
  on conflict (event_uid, recipient_user_id) do nothing;
end;
$function$;

revoke all on function private.emit_accounting_notification_event(uuid,uuid,uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.create_accounting_alert(
  p_company_id uuid,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_event uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Authentification requise.' using errcode='28000';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = v_actor
      and m.status = 'active' and m.role = 'accountant'
  ) then
    raise exception 'Seul le comptable actif peut signaler une erreur de saisie.' using errcode='42501';
  end if;
  if p_title is null or length(btrim(p_title)) = 0
    or p_message is null or length(btrim(p_message)) = 0 then
    raise exception 'Le titre et le détail de l’alerte sont obligatoires.' using errcode='22023';
  end if;

  perform private.emit_accounting_notification_event(
    p_company_id, v_actor, v_event, 'error', 'error',
    p_title, p_message, p_entity_type, p_entity_id, coalesce(p_details,'{}'::jsonb)
  );
  return v_event;
end;
$function$;

revoke all on function public.create_accounting_alert(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_accounting_alert(uuid,text,text,text,text,jsonb) to authenticated;

create or replace function public.review_accounting_notification(
  p_notification_id uuid,
  p_decision text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_company uuid;
  v_event uuid;
  v_count integer;
begin
  if v_actor is null then
    raise exception 'Authentification requise.' using errcode='28000';
  end if;
  if p_decision not in ('confirmed','dismissed') then
    raise exception 'Décision de revue invalide.' using errcode='22023';
  end if;

  select n.company_id, n.event_uid into v_company, v_event
  from public.accounting_notifications n
  where n.id = p_notification_id;
  if v_event is null then
    raise exception 'Notification introuvable.' using errcode='P0002';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = v_company and m.user_id = v_actor
      and m.status = 'active' and m.role = 'admin'
  ) then
    raise exception 'Réservé à l’administrateur de l’entreprise.' using errcode='42501';
  end if;

  update public.accounting_notifications
  set review_status = p_decision, reviewed_at = now(), reviewed_by = v_actor, read_at = coalesce(read_at,now())
  where event_uid = v_event and company_id = v_company;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.review_accounting_notification(uuid,text) from public, anon;
grant execute on function public.review_accounting_notification(uuid,text) to authenticated;

create or replace function private.flag_duplicate_accounting_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reference text := nullif(btrim(new.details->'summary'->>'reference'),'');
  v_journal text := nullif(btrim(new.details->'summary'->>'journal'),'');
  v_previous_id text;
  v_event uuid;
begin
  if new.entity_type <> 'accounting_entry'
    or new.action <> 'accounting.entry.upsert'
    or v_reference is null then
    return new;
  end if;

  select prior.entity_id into v_previous_id
  from public.audit_logs prior
  where prior.company_id = new.company_id
    and prior.entity_type = 'accounting_entry'
    and prior.action = 'accounting.entry.upsert'
    and prior.details->'summary'->>'reference' = v_reference
    and coalesce(prior.details->'summary'->>'journal','') = coalesce(v_journal,'')
    and prior.id <> new.id
  order by prior.created_at desc, prior.id desc
  limit 1;

  if v_previous_id is not null then
    v_event := gen_random_uuid();
    perform private.emit_accounting_notification_event(
      new.company_id,
      new.actor_user_id,
      v_event,
      'suspicious',
      'warning',
      'Référence comptable déjà utilisée',
      'Une autre écriture du même journal utilise déjà la référence « ' || left(v_reference,120) || ' ». Vérifiez qu’il ne s’agit pas d’un doublon.',
      'accounting_entry',
      new.entity_id,
      jsonb_build_object('reference',v_reference,'journal',v_journal,'previous_entity_id',v_previous_id)
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists accounting_entry_duplicate_reference_notification on public.audit_logs;
create trigger accounting_entry_duplicate_reference_notification
after insert on public.audit_logs
for each row execute function private.flag_duplicate_accounting_reference();

comment on table public.accounting_notifications is
  'Boîte de notifications personnelle pour les anomalies comptables, avec revue partagée par entreprise.';
