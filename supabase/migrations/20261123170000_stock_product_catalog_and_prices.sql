-- MIZANE — Catalogue extensible des articles et prix HT.
-- Migration additive : à appliquer sur DEV uniquement après revue.
begin;

create table if not exists public.stock_product_families (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,code)
);
create unique index if not exists stock_product_families_name_uidx
  on public.stock_product_families(company_id,lower(name));

create table if not exists public.stock_product_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  family_id uuid not null,
  code text not null check (length(trim(code)) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 120),
  nature text not null default 'physical' check (nature in ('physical','service')),
  legacy_kind text not null default 'goods' check (legacy_kind in ('goods','raw','semi','finished','consumable','service')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,code),
  foreign key(company_id,family_id)
    references public.stock_product_families(company_id,id) on delete restrict,
  check ((nature='service' and legacy_kind='service') or (nature='physical' and legacy_kind<>'service'))
);
create unique index if not exists stock_product_types_name_uidx
  on public.stock_product_types(company_id,family_id,lower(name));

alter table public.stock_products
  add column if not exists family_id uuid,
  add column if not exists product_type_id uuid,
  add column if not exists purchase_price_ht numeric(20,6) not null default 0,
  add column if not exists sale_price_ht numeric(20,6) not null default 0;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='stock_products_family_fk') then
    alter table public.stock_products add constraint stock_products_family_fk
      foreign key(company_id,family_id) references public.stock_product_families(company_id,id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='stock_products_type_fk') then
    alter table public.stock_products add constraint stock_products_type_fk
      foreign key(company_id,product_type_id) references public.stock_product_types(company_id,id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='stock_products_prices_nonnegative') then
    alter table public.stock_products add constraint stock_products_prices_nonnegative
      check (purchase_price_ht>=0 and sale_price_ht>=0);
  end if;
end $$;

alter table public.stock_product_families enable row level security;
alter table public.stock_product_types enable row level security;
revoke all on public.stock_product_families, public.stock_product_types from public, anon, authenticated;

create or replace function private.stock_catalog_ensure_impl(p_company_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_family uuid;
begin
  if auth.uid() is null or not private.is_active_company_member(p_company_id) then
    raise exception 'Accès au catalogue refusé.' using errcode='42501';
  end if;

  insert into public.stock_product_families(company_id,code,name) values
    (p_company_id,'commerce','Commerce et distribution'),
    (p_company_id,'industry','Industrie et production'),
    (p_company_id,'supplies','Consommables et fournitures'),
    (p_company_id,'equipment','Matériel et équipements'),
    (p_company_id,'agriculture','Agriculture et élevage'),
    (p_company_id,'food','Alimentaire et boissons'),
    (p_company_id,'services','Prestations et services')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='commerce';
  insert into public.stock_product_types(company_id,family_id,code,name,legacy_kind) values
    (p_company_id,v_family,'goods','Marchandise','goods')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='industry';
  insert into public.stock_product_types(company_id,family_id,code,name,legacy_kind) values
    (p_company_id,v_family,'raw','Matière première','raw'),
    (p_company_id,v_family,'secondary_raw','Matière première secondaire','raw'),
    (p_company_id,v_family,'semi','Produit semi-fini','semi'),
    (p_company_id,v_family,'finished','Produit fini','finished'),
    (p_company_id,v_family,'intermediate','Produit intermédiaire','semi'),
    (p_company_id,v_family,'industrial_component','Composant industriel','goods'),
    (p_company_id,v_family,'spare_part','Pièce de rechange','goods'),
    (p_company_id,v_family,'assembly','Sous-ensemble assemblé','finished')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='supplies';
  insert into public.stock_product_types(company_id,family_id,code,name,legacy_kind) values
    (p_company_id,v_family,'consumable','Consommable','consumable'),
    (p_company_id,v_family,'office_supply','Fourniture de bureau','consumable'),
    (p_company_id,v_family,'industrial_supply','Fourniture industrielle','consumable'),
    (p_company_id,v_family,'cleaning_product','Produit d’entretien','consumable'),
    (p_company_id,v_family,'packaging','Emballage','consumable'),
    (p_company_id,v_family,'safety_equipment','Matériel de protection et sécurité','goods')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='equipment';
  insert into public.stock_product_types(company_id,family_id,code,name,legacy_kind) values
    (p_company_id,v_family,'it_equipment','Matériel informatique','goods'),
    (p_company_id,v_family,'electronic_equipment','Matériel électronique','goods'),
    (p_company_id,v_family,'furniture','Mobilier et équipement','goods'),
    (p_company_id,v_family,'tools','Outillage','goods'),
    (p_company_id,v_family,'industrial_machinery','Machines et équipements industriels','goods')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='agriculture';
  insert into public.stock_product_types(company_id,family_id,code,name,legacy_kind) values
    (p_company_id,v_family,'agricultural_product','Produit agricole','goods'),
    (p_company_id,v_family,'seeds_plants','Semences et plants','goods'),
    (p_company_id,v_family,'fertilizer_input','Engrais et intrants agricoles','consumable')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='food';
  insert into public.stock_product_types(company_id,family_id,code,name,legacy_kind) values
    (p_company_id,v_family,'food_product','Produit alimentaire','goods'),
    (p_company_id,v_family,'beverage','Boisson','goods')
  on conflict(company_id,code) do nothing;

  select id into v_family from public.stock_product_families where company_id=p_company_id and code='services';
  insert into public.stock_product_types(company_id,family_id,code,name,nature,legacy_kind) values
    (p_company_id,v_family,'service','Service','service','service')
  on conflict(company_id,code) do nothing;
end;
$$;

create or replace function private.stock_read_catalog_impl(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  perform private.stock_catalog_ensure_impl(p_company_id);
  return jsonb_build_object(
    'families',coalesce((select jsonb_agg(to_jsonb(f)-'company_id' order by f.name) from public.stock_product_families f where f.company_id=p_company_id and f.active),'[]'::jsonb),
    'types',coalesce((select jsonb_agg(to_jsonb(t)-'company_id' order by t.name) from public.stock_product_types t where t.company_id=p_company_id and t.active),'[]'::jsonb)
  );
end;
$$;

create or replace function private.stock_save_family_impl(p_company_id uuid,p_family jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_name text; v_code text; v_id uuid;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  v_name:=btrim(coalesce(p_family->>'name',''));
  if length(v_name) not between 2 and 100 then raise exception 'Le nom de la famille doit contenir de 2 à 100 caractères.' using errcode='22023'; end if;
  v_code:=coalesce(nullif(p_family->>'code',''),left(regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'),80));
  if length(v_code) not between 1 and 80 then raise exception 'Code de famille invalide.' using errcode='22023'; end if;
  insert into public.stock_product_families(company_id,code,name)
  values(p_company_id,v_code,v_name) returning id into v_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.product_family_created','product_family',v_id::text,jsonb_build_object('name',v_name));
  return (select to_jsonb(f)-'company_id' from public.stock_product_families f where f.company_id=p_company_id and f.id=v_id);
end;
$$;

create or replace function private.stock_save_type_impl(p_company_id uuid,p_type jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_family uuid; v_name text; v_code text; v_nature text; v_kind text; v_id uuid;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  v_family:=nullif(p_type->>'family_id','')::uuid;
  v_name:=btrim(coalesce(p_type->>'name',''));
  v_nature:=coalesce(p_type->>'nature','physical');
  v_kind:=case when v_nature='service' then 'service' else 'goods' end;
  if v_family is null or not exists(select 1 from public.stock_product_families f where f.company_id=p_company_id and f.id=v_family and f.active)
     or length(v_name) not between 2 and 120 or v_nature not in ('physical','service') then
    raise exception 'Famille, nom ou nature du type invalide.' using errcode='22023';
  end if;
  v_code:=coalesce(nullif(p_type->>'code',''),left(regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'),80));
  insert into public.stock_product_types(company_id,family_id,code,name,nature,legacy_kind)
  values(p_company_id,v_family,v_code,v_name,v_nature,v_kind) returning id into v_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.product_type_created','product_type',v_id::text,jsonb_build_object('name',v_name,'family_id',v_family));
  return (select to_jsonb(t)-'company_id' from public.stock_product_types t where t.company_id=p_company_id and t.id=v_id);
end;
$$;

create or replace function private.stock_save_product_catalog_impl(p_company_id uuid,p_product jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid; v_id uuid; v_sku text; v_type text; v_tracking text;
  v_type_id uuid; v_family_id uuid; v_purchase numeric; v_sale numeric;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_product is null or jsonb_typeof(p_product) is distinct from 'object' then raise exception 'Article invalide.' using errcode='22023'; end if;
  v_id:=nullif(p_product->>'id','')::uuid;
  v_sku:=btrim(coalesce(p_product->>'sku',''));
  v_tracking:=coalesce(p_product->>'tracking','none');
  v_type_id:=nullif(p_product->>'product_type_id','')::uuid;
  v_family_id:=nullif(p_product->>'family_id','')::uuid;
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
     or v_purchase<0 or v_sale<0 or v_purchase::text in ('NaN','Infinity','-Infinity') or v_sale::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Données article ou prix HT invalides.' using errcode='22023';
  end if;
  if v_id is not null and v_type='service' and exists(select 1 from public.stock_movements m where m.company_id=p_company_id and m.product_id=v_id) then
    raise exception 'Un article ayant un historique de stock ne peut pas être converti en service.' using errcode='55000';
  end if;
  if v_id is not null and exists(select 1 from public.stock_movements m join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id where m.company_id=p_company_id and m.product_id=v_id and p.base_unit<>coalesce(nullif(p_product->>'base_unit',''),'unité')) then
    raise exception 'L’unité de base ne peut pas être changée après le premier mouvement.' using errcode='55000';
  end if;
  if v_id is null then
    insert into public.stock_products(company_id,sku,name,product_type,category,base_unit,tracking,active,family_id,product_type_id,purchase_price_ht,sale_price_ht)
    values(p_company_id,v_sku,btrim(p_product->>'name'),v_type,coalesce(p_product->>'category',''),coalesce(nullif(p_product->>'base_unit',''),'unité'),v_tracking,coalesce((p_product->>'active')::boolean,true),v_family_id,v_type_id,v_purchase,v_sale)
    returning id into v_id;
  else
    update public.stock_products set sku=v_sku,name=btrim(p_product->>'name'),product_type=v_type,
      category=coalesce(p_product->>'category',''),base_unit=coalesce(nullif(p_product->>'base_unit',''),'unité'),
      tracking=v_tracking,active=coalesce((p_product->>'active')::boolean,true),
      family_id=v_family_id,product_type_id=v_type_id,purchase_price_ht=v_purchase,sale_price_ht=v_sale,updated_at=now()
    where company_id=p_company_id and id=v_id;
    if not found then raise exception 'Article introuvable.' using errcode='P0002'; end if;
  end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.product_saved','product',v_id::text,jsonb_build_object('sku',v_sku,'purchase_price_ht',v_purchase,'sale_price_ht',v_sale));
  return (select to_jsonb(p)-'company_id' from public.stock_products p where p.company_id=p_company_id and p.id=v_id);
end;
$$;

create or replace function public.stock_read_catalog(p_company_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.stock_read_catalog_impl(p_company_id) $$;
create or replace function public.stock_save_family(p_company_id uuid,p_family jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.stock_save_family_impl(p_company_id,p_family) $$;
create or replace function public.stock_save_type(p_company_id uuid,p_type jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.stock_save_type_impl(p_company_id,p_type) $$;
create or replace function public.stock_save_product(p_company_id uuid,p_product jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select private.stock_save_product_catalog_impl(p_company_id,p_product) $$;

revoke all on function private.stock_catalog_ensure_impl(uuid) from public,anon;
revoke all on function private.stock_read_catalog_impl(uuid) from public,anon;
revoke all on function private.stock_save_family_impl(uuid,jsonb) from public,anon;
revoke all on function private.stock_save_type_impl(uuid,jsonb) from public,anon;
revoke all on function private.stock_save_product_catalog_impl(uuid,jsonb) from public,anon;
grant execute on function private.stock_catalog_ensure_impl(uuid) to authenticated;
grant execute on function private.stock_read_catalog_impl(uuid) to authenticated;
grant execute on function private.stock_save_family_impl(uuid,jsonb) to authenticated;
grant execute on function private.stock_save_type_impl(uuid,jsonb) to authenticated;
grant execute on function private.stock_save_product_catalog_impl(uuid,jsonb) to authenticated;
revoke all on function public.stock_read_catalog(uuid) from public,anon,authenticated;
revoke all on function public.stock_save_family(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.stock_save_type(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.stock_save_product(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.stock_read_catalog(uuid) to authenticated;
grant execute on function public.stock_save_family(uuid,jsonb) to authenticated;
grant execute on function public.stock_save_type(uuid,jsonb) to authenticated;
grant execute on function public.stock_save_product(uuid,jsonb) to authenticated;

commit;
