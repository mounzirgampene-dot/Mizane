-- MIZANE — Préserver les garde-fous de traçabilité et conversions du catalogue.
begin;

create or replace function private.stock_save_product_catalog_impl(p_company_id uuid,p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid; v_id uuid; v_sku text; v_type text; v_tracking text;
  v_type_id uuid; v_family_id uuid; v_purchase numeric; v_sale numeric;
  v_conv jsonb; v_unit text; v_factor numeric;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  if p_product is null or jsonb_typeof(p_product) is distinct from 'object' then raise exception 'Article invalide.' using errcode='22023'; end if;
  v_id:=nullif(p_product->>'id','')::uuid;
  v_sku:=btrim(coalesce(p_product->>'sku',''));
  v_tracking:=coalesce(p_product->>'tracking','none');
  v_type_id:=nullif(p_product->>'product_type_id','')::uuid;
  v_family_id:=nullif(p_product->>'family_id','');
  v_purchase:=coalesce(nullif(p_product->>'purchase_price_ht','')::numeric,0);
  v_sale:=coalesce(nullif(p_product->>'sale_price_ht','')::numeric,0);
  if v_type_id is not null then
    select t.legacy_kind,t.family_id into v_type,v_family_id
      from public.stock_product_types t
      where t.company_id=p_company_id and t.id=v_type_id and t.active;
    if not found then raise exception 'Type d’article introuvable ou inactif.' using errcode='22023'; end if;
  else
    v_type:=coalesce(p_product->>'product_type','goods');
  end if;
  if v_family_id is not null and not exists(select 1 from public.stock_product_families f where f.company_id=p_company_id and f.id=v_family_id and f.active) then
    raise exception 'Famille d’article invalide.' using errcode='22023';
  end if;
  if length(v_sku) not between 1 and 64 or length(btrim(coalesce(p_product->>'name',''))) not between 1 and 180
     or length(coalesce(p_product->>'category',''))>100
     or length(coalesce(p_product->>'base_unit','unité'))>24
     or v_type not in ('goods','raw','semi','finished','consumable','service')
     or v_tracking not in ('none','lot','serial')
     or (v_type='service' and v_tracking<>'none')
     or v_purchase<0 or v_sale<0
     or v_purchase::text in ('NaN','Infinity','-Infinity')
     or v_sale::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Données article ou prix HT invalides.' using errcode='22023';
  end if;
  if v_id is not null and exists(
    select 1 from public.stock_movements m
    join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id
    where m.company_id=p_company_id and m.product_id=v_id and p.tracking<>v_tracking
  ) then
    raise exception 'Le mode de traçabilité ne peut pas être changé après le premier mouvement.' using errcode='55000';
  end if;
  if v_id is not null and v_type='service' and exists(select 1 from public.stock_movements m where m.company_id=p_company_id and m.product_id=v_id) then
    raise exception 'Un article ayant un historique de stock ne peut pas être converti en service.' using errcode='55000';
  end if;
  if v_id is not null and exists(
    select 1 from public.stock_movements m
    join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id
    where m.company_id=p_company_id and m.product_id=v_id
      and p.base_unit<>coalesce(nullif(p_product->>'base_unit',''),'unité')
  ) then
    raise exception 'L’unité de base ne peut pas être changée après le premier mouvement.' using errcode='55000';
  end if;
  if v_id is null then
    insert into public.stock_products(company_id,sku,name,product_type,category,base_unit,tracking,active,family_id,product_type_id,purchase_price_ht,sale_price_ht)
    values(p_company_id,v_sku,btrim(p_product->>'name'),v_type,coalesce(p_product->>'category',''),
      coalesce(nullif(p_product->>'base_unit',''),'unité'),v_tracking,
      coalesce((p_product->>'active')::boolean,true),v_family_id,v_type_id,v_purchase,v_sale)
    returning id into v_id;
  else
    update public.stock_products set sku=v_sku,name=btrim(p_product->>'name'),product_type=v_type,
      category=coalesce(p_product->>'category',''),base_unit=coalesce(nullif(p_product->>'base_unit',''),'unité'),
      tracking=v_tracking,active=coalesce((p_product->>'active')::boolean,true),
      family_id=v_family_id,product_type_id=v_type_id,purchase_price_ht=v_purchase,sale_price_ht=v_sale,updated_at=now()
    where company_id=p_company_id and id=v_id;
    if not found then raise exception 'Article introuvable.' using errcode='P0002'; end if;
  end if;
  if p_product ? 'unit_conversions' then
    if jsonb_typeof(p_product->'unit_conversions') is distinct from 'array'
       or jsonb_array_length(p_product->'unit_conversions')>50 then
      raise exception 'Liste de conversions invalide (50 maximum).' using errcode='22023';
    end if;
    if exists(select 1 from public.stock_movements m where m.company_id=p_company_id and m.product_id=v_id) then
      raise exception 'Les conversions ne peuvent plus être modifiées après le premier mouvement.' using errcode='55000';
    end if;
    delete from public.stock_unit_conversions where company_id=p_company_id and product_id=v_id;
    for v_conv in select value from jsonb_array_elements(p_product->'unit_conversions') loop
      v_unit:=btrim(coalesce(v_conv->>'unit_code',''));
      v_factor:=nullif(v_conv->>'factor_to_base','')::numeric;
      if length(v_unit) not between 1 and 24
         or lower(v_unit)=lower(coalesce(nullif(p_product->>'base_unit',''),'unité'))
         or v_factor is null or v_factor<=0 or v_factor>1000000000
         or v_factor::text in ('NaN','Infinity','-Infinity') then
        raise exception 'Conversion d’unité invalide.' using errcode='22023';
      end if;
      insert into public.stock_unit_conversions(company_id,product_id,unit_code,factor_to_base)
      values(p_company_id,v_id,v_unit,v_factor);
    end loop;
  end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.product_saved','product',v_id::text,
    jsonb_build_object('sku',v_sku,'purchase_price_ht',v_purchase,'sale_price_ht',v_sale));
  return (select to_jsonb(p)-'company_id' from public.stock_products p where p.company_id=p_company_id and p.id=v_id);
end;
$$;

revoke all on function private.stock_save_product_catalog_impl(uuid,jsonb) from public,anon;
grant execute on function private.stock_save_product_catalog_impl(uuid,jsonb) to authenticated;

commit;