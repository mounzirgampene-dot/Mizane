-- Link reservations to their originating sales invoice.
-- Only reservations explicitly tied to the invoice may be consumed by its invoice/delivery issue.
alter table public.stock_reservations
  add column if not exists source_type text,
  add column if not exists source_id text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.stock_reservations'::regclass
      and conname='stock_reservations_source_link_check'
  ) then
    alter table public.stock_reservations
      add constraint stock_reservations_source_link_check
      check (
        (source_type is null and source_id is null)
        or
        (source_type='sales_invoice' and source_id is not null
          and length(btrim(source_id)) between 1 and 180)
      ) not valid;
  end if;
end
$constraint$;
alter table public.stock_reservations validate constraint stock_reservations_source_link_check;

create index if not exists stock_reservations_source_link_idx
  on public.stock_reservations(company_id,source_type,source_id,status,created_at,id)
  where status='active' and source_type is not null;

create or replace function private.stock_reserve_linked_impl(
  p_company_id uuid,
  p_operation_uid uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_reference text,
  p_source_type text,
  p_source_id text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid;
  v_existing public.stock_reservations%rowtype;
  v_balance numeric;
  v_reserved numeric;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_operation_uid is null or p_quantity is null or p_quantity<=0
     or p_quantity::text in ('NaN','Infinity','-Infinity')
     or length(coalesce(p_reference,''))>120
     or p_source_type<>'sales_invoice'
     or p_source_id is null or length(btrim(p_source_id)) not between 1 and 180 then
    raise exception 'Réservation liée invalide.' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.stock_products p
    where p.company_id=p_company_id and p.id=p_product_id and p.active and p.product_type<>'service'
  ) or not exists(
    select 1 from public.stock_warehouses w
    where w.company_id=p_company_id and w.id=p_warehouse_id and w.active
  ) then
    raise exception 'Article ou entrepôt invalide pour la réservation.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));

  select * into v_existing
  from public.stock_reservations
  where company_id=p_company_id and operation_uid=p_operation_uid;
  if found then
    if v_existing.product_id<>p_product_id
       or v_existing.warehouse_id<>p_warehouse_id
       or v_existing.quantity<>p_quantity
       or v_existing.reference<>coalesce(p_reference,'')
       or v_existing.source_type<>p_source_type
       or v_existing.source_id<>p_source_id then
      raise exception 'operation_uid déjà utilisé avec une réservation différente.' using errcode='23505';
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'reservation_id',v_existing.id);
  end if;

  select quantity into v_balance
  from public.stock_balances
  where company_id=p_company_id and product_id=p_product_id and warehouse_id=p_warehouse_id
  for update;
  v_balance:=coalesce(v_balance,0);
  select coalesce(sum(quantity),0) into v_reserved
  from public.stock_reservations
  where company_id=p_company_id and product_id=p_product_id
    and warehouse_id=p_warehouse_id and status='active';
  if v_balance-v_reserved<p_quantity then
    raise exception 'Stock disponible insuffisant pour réserver.' using errcode='23514';
  end if;

  insert into public.stock_reservations(
    company_id,operation_uid,product_id,warehouse_id,quantity,reference,created_by,source_type,source_id
  ) values(
    p_company_id,p_operation_uid,p_product_id,p_warehouse_id,p_quantity,
    coalesce(p_reference,''),v_actor,p_source_type,p_source_id
  ) returning * into v_existing;

  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(
    p_company_id,v_actor,'stock.reserved','stock_reservation',v_existing.id::text,
    jsonb_build_object('source_type',p_source_type,'source_id',p_source_id,'quantity',p_quantity)
  );
  return jsonb_build_object('ok',true,'reservation_id',v_existing.id);
end;
$function$;

create or replace function public.stock_reserve_linked(
  p_company_id uuid,
  p_operation_uid uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_reference text,
  p_source_type text,
  p_source_id text
) returns jsonb
language sql
security invoker
set search_path to ''
as $function$
  select private.stock_reserve_linked_impl(
    p_company_id,p_operation_uid,p_product_id,p_warehouse_id,p_quantity,
    p_reference,p_source_type,p_source_id
  )
$function$;

revoke all on function public.stock_reserve_linked(uuid,uuid,uuid,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.stock_reserve_linked(uuid,uuid,uuid,uuid,numeric,text,text,text) to authenticated;

do $patch$
declare
  v_definition text;
  v_old text := $old$
          where r.company_id=p_company_id and r.product_id=v_product and r.warehouse_id=v_wh and r.status='active'
          order by r.created_at,r.id
$old$;
  v_new text := $new$
          where r.company_id=p_company_id and r.product_id=v_product and r.warehouse_id=v_wh
            and r.status='active'
            and r.source_type='sales_invoice'
            and r.source_id=case when p_source_type='sales_delivery'
              then split_part(coalesce(p_source_id,''),':',1)
              else coalesce(p_source_id,'') end
          order by r.created_at,r.id
$new$;
begin
  select pg_get_functiondef(
    'private.stock_post_document_impl(uuid,uuid,text,date,text,text,jsonb,text,text)'::regprocedure
  ) into v_definition;
  if v_definition is null or position(v_old in v_definition)=0 then
    raise exception 'Patch impossible : boucle de consommation des réservations introuvable.';
  end if;
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end
$patch$;
