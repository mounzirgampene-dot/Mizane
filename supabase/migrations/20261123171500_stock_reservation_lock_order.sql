-- Acquire the tenant stock lock before validating catalog state in reservation paths.
-- This ensures active flags cannot change between validation and reservation insertion.
do $patch$
declare
  v_signature regprocedure;
  v_definition text;
  v_old text := $old$
  if not exists(select 1 from public.stock_products p where p.company_id=p_company_id and p.id=p_product_id and p.active and p.product_type<>'service')
     or not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=p_warehouse_id and w.active) then
    raise exception 'Article ou entrepôt invalide pour la réservation.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
$old$;
  v_new text := $new$
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  if not exists(select 1 from public.stock_products p where p.company_id=p_company_id and p.id=p_product_id and p.active and p.product_type<>'service')
     or not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=p_warehouse_id and w.active) then
    raise exception 'Article ou entrepôt invalide pour la réservation.' using errcode='22023';
  end if;
$new$;
  v_targets regprocedure[] := array[
    'private.stock_reserve_impl(uuid,uuid,uuid,uuid,numeric,text)'::regprocedure,
    'private.stock_reserve_linked_impl(uuid,uuid,uuid,uuid,numeric,text,text,text)'::regprocedure
  ];
begin
  foreach v_signature in array v_targets loop
    select pg_get_functiondef(v_signature) into v_definition;
    if v_definition is null or position(v_old in v_definition)=0 then
      raise exception 'Point de verrouillage introuvable dans %.',v_signature;
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
    execute v_definition;
  end loop;
end
$patch$;
