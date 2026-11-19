begin;

create table if not exists public.company_billing (
  company_id uuid primary key references public.companies(id) on delete cascade,
  data jsonb not null,
  sync_version bigint not null default 1 check (sync_version > 0),
  updated_at timestamptz not null default now(),
  constraint company_billing_data_object check (jsonb_typeof(data) = 'object')
);

alter table public.company_billing enable row level security;
alter table public.company_billing force row level security;
revoke all on public.company_billing from public, anon, authenticated;
grant select, insert, update, delete on public.company_billing to service_role;

create table if not exists public.company_billing_sync_operations (
  company_id uuid not null references public.companies(id) on delete cascade,
  operation_uid uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, operation_uid)
);
alter table public.company_billing_sync_operations enable row level security;
alter table public.company_billing_sync_operations force row level security;
revoke all on public.company_billing_sync_operations from public, anon, authenticated;
grant select, insert, update, delete on public.company_billing_sync_operations to service_role;

create or replace function public.sync_company_billing(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_operation_uid uuid,
  p_expected_sync_version bigint,
  p_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_version bigint;
  v_result jsonb;
begin
  if p_company_id is null or p_actor_user_id is null or p_operation_uid is null
     or p_expected_sync_version is null or p_expected_sync_version < 0 then
    raise exception 'Paramètres de synchronisation invalides.' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data->'documents') <> 'array'
     or jsonb_typeof(p_data->'settings') <> 'object'
     or octet_length(p_data::text) > 1000000 then
    raise exception 'Données de facturation invalides ou trop volumineuses.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id
      and m.status = 'active'
      and m.role = any(array['admin','accountant']::public.company_role[])
  ) then
    raise exception 'Accès à la facturation refusé.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text || ':billing', 0));

  select response into v_result
  from public.company_billing_sync_operations
  where company_id = p_company_id and operation_uid = p_operation_uid;
  if found then return v_result; end if;

  select sync_version into v_current_version
  from public.company_billing
  where company_id = p_company_id
  for update;

  if (v_current_version is null and p_expected_sync_version <> 0)
     or (v_current_version is not null and v_current_version <> p_expected_sync_version) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'conflict', true,
      'server_sync_version', v_current_version
    );
  end if;

  insert into public.company_billing(company_id, data, sync_version, updated_at)
  values (p_company_id, p_data, 1, pg_catalog.now())
  on conflict (company_id) do update
    set data = excluded.data,
        sync_version = public.company_billing.sync_version + 1,
        updated_at = pg_catalog.now()
  returning sync_version into v_current_version;

  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, details)
  values (p_company_id, p_actor_user_id, 'billing.cloud_sync', 'billing', p_operation_uid::text,
    pg_catalog.jsonb_build_object('sync_version', v_current_version));

  v_result := pg_catalog.jsonb_build_object(
    'ok', true, 'conflict', false,
    'sync_version', v_current_version
  );
  insert into public.company_billing_sync_operations(company_id, operation_uid, response)
  values (p_company_id, p_operation_uid, v_result);
  return v_result;
end;
$function$;

revoke all on function public.sync_company_billing(uuid,uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.sync_company_billing(uuid,uuid,uuid,bigint,jsonb) to service_role;

commit;
