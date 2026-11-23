-- MIZANE — Moteur de stock transactionnel multi-entreprises.
-- Migration additive. À appliquer d'abord sur DEV après revue et sauvegarde.
-- Les écritures physiques passent exclusivement par les RPC stock_*.
begin;

create table public.stock_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  valuation_method text not null default 'cump' check (valuation_method in ('cump','fifo')),
  allow_negative boolean not null default false,
  sales_trigger text not null default 'delivery' check (sales_trigger in ('delivery','invoice_validation')),
  purchase_trigger text not null default 'receipt' check (purchase_trigger in ('receipt','supplier_invoice')),
  accounting_mode text not null default 'perpetual' check (accounting_mode in ('perpetual','periodic')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.stock_warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 140),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,code)
);
create unique index stock_warehouses_name_uidx on public.stock_warehouses(company_id, lower(name));

create table public.stock_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sku text not null check (length(trim(sku)) between 1 and 64),
  name text not null check (length(trim(name)) between 1 and 180),
  product_type text not null check (product_type in ('goods','raw','semi','finished','consumable','service')),
  category text not null default '',
  base_unit text not null default 'unité' check (length(trim(base_unit)) between 1 and 24),
  tracking text not null default 'none' check (tracking in ('none','lot','serial')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,sku),
  check (product_type <> 'service' or tracking = 'none')
);

create table public.stock_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  operation_uid uuid not null,
  request_hash text not null,
  document_type text not null check (document_type in ('receipt','issue','transfer','adjustment')),
  document_date date not null,
  reference text not null default '',
  note text not null default '',
  status text not null default 'posted' check (status in ('posted','reversed')),
  reversed_by_document_id uuid,
  source_type text,
  source_id text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,operation_uid),
  foreign key(company_id,reversed_by_document_id)
    references public.stock_documents(company_id,id)
    deferrable initially deferred
);
create index stock_documents_company_date_idx on public.stock_documents(company_id,document_date desc,created_at desc);

create table public.stock_document_lines (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  document_id uuid not null,
  line_number integer not null check (line_number > 0),
  product_id uuid not null,
  warehouse_id uuid not null,
  destination_warehouse_id uuid,
  quantity numeric(20,6) not null check (quantity > 0),
  unit_cost numeric(20,6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(20,6) not null default 0 check (total_cost >= 0),
  lot_code text,
  serial_numbers jsonb not null default '[]'::jsonb check (jsonb_typeof(serial_numbers)='array'),
  created_at timestamptz not null default now(),
  foreign key(company_id,document_id) references public.stock_documents(company_id,id),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id),
  foreign key(company_id,destination_warehouse_id) references public.stock_warehouses(company_id,id),
  unique(company_id,id),
  unique(company_id,document_id,line_number),
  check (destination_warehouse_id is null or destination_warehouse_id <> warehouse_id)
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  document_id uuid not null,
  line_id bigint not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity_delta numeric(20,6) not null check (quantity_delta <> 0),
  value_delta numeric(20,6) not null,
  unit_cost numeric(20,6) not null default 0,
  movement_date date not null,
  created_at timestamptz not null default now(),
  foreign key(company_id,document_id) references public.stock_documents(company_id,id),
  foreign key(company_id,line_id) references public.stock_document_lines(company_id,id),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id),
  unique(company_id,id)
);
create index stock_movements_balance_idx on public.stock_movements(company_id,product_id,warehouse_id,movement_date,id);
create index stock_movements_document_idx on public.stock_movements(company_id,document_id);

create table public.stock_balances (
  company_id uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(20,6) not null default 0,
  inventory_value numeric(20,6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key(company_id,product_id,warehouse_id),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id)
);

create table public.stock_valuation_layers (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  source_movement_id bigint not null,
  original_quantity numeric(20,6) not null check (original_quantity > 0),
  remaining_quantity numeric(20,6) not null check (remaining_quantity >= 0),
  unit_cost numeric(20,6) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id),
  foreign key(company_id,source_movement_id) references public.stock_movements(company_id,id),
  unique(company_id,id)
);
create index stock_valuation_layers_fifo_idx on public.stock_valuation_layers(company_id,product_id,warehouse_id,created_at,id) where remaining_quantity > 0;

create table public.stock_valuation_allocations (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  movement_id bigint not null,
  layer_id bigint not null,
  quantity numeric(20,6) not null check (quantity > 0),
  unit_cost numeric(20,6) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key(company_id,movement_id) references public.stock_movements(company_id,id),
  foreign key(company_id,layer_id) references public.stock_valuation_layers(company_id,id)
);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  operation_uid uuid not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(20,6) not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','released','fulfilled')),
  reference text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique(company_id,id),
  unique(company_id,operation_uid),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id)
);
create index stock_reservations_active_idx on public.stock_reservations(company_id,product_id,warehouse_id) where status='active';

create table public.stock_audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Tables exposées : lecture réservée aux membres actifs ; aucune écriture directe.
do $$
declare t text;
begin
  foreach t in array array[
    'stock_settings','stock_warehouses','stock_products','stock_documents',
    'stock_document_lines','stock_movements','stock_balances',
    'stock_valuation_layers','stock_valuation_allocations','stock_reservations','stock_audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_active_company_member(company_id))',
      t||'_select_members',t
    );
  end loop;
end $$;


create or replace function private.stock_reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Journal de stock immuable : utilisez une contrepassation.' using errcode='55000';
end;
$$;
revoke all on function private.stock_reject_immutable_change() from public,anon,authenticated;
create trigger stock_movements_immutable before update or delete on public.stock_movements
for each row execute function private.stock_reject_immutable_change();
create trigger stock_allocations_immutable before update or delete on public.stock_valuation_allocations
for each row execute function private.stock_reject_immutable_change();
create trigger stock_audit_immutable before update or delete on public.stock_audit_logs
for each row execute function private.stock_reject_immutable_change();

create or replace function private.stock_assert_writer(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentification requise.' using errcode='42501'; end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id=p_company_id and m.user_id=v_actor
      and m.status='active' and m.role in ('admin','accountant')
  ) then raise exception 'Accès au stock refusé.' using errcode='42501'; end if;
  return v_actor;
end;
$$;
revoke all on function private.stock_assert_writer(uuid) from public,anon,authenticated;

create or replace function private.stock_read_state_impl(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.is_active_company_member(p_company_id) then
    raise exception 'Accès au stock refusé.' using errcode='42501';
  end if;
  v_result := jsonb_build_object(
    'settings',coalesce((select to_jsonb(s) - 'company_id' from public.stock_settings s where s.company_id=p_company_id),
      jsonb_build_object('valuation_method','cump','allow_negative',false,'sales_trigger','delivery','purchase_trigger','receipt','accounting_mode','perpetual')),
    'warehouses',coalesce((select jsonb_agg(to_jsonb(w)-'company_id' order by w.created_at) from public.stock_warehouses w where w.company_id=p_company_id),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p)-'company_id' order by p.created_at) from public.stock_products p where p.company_id=p_company_id),'[]'::jsonb),
    'balances',coalesce((select jsonb_agg(jsonb_build_object('product_id',b.product_id,'warehouse_id',b.warehouse_id,'quantity',b.quantity,'inventory_value',b.inventory_value) order by b.product_id,b.warehouse_id) from public.stock_balances b where b.company_id=p_company_id),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d)-'company_id'-'request_hash' order by d.document_date desc,d.created_at desc) from public.stock_documents d where d.company_id=p_company_id),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(to_jsonb(m)-'company_id' order by m.id desc) from (select * from public.stock_movements where company_id=p_company_id order by id desc limit 500) m),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(to_jsonb(r)-'company_id' order by r.created_at desc) from public.stock_reservations r where r.company_id=p_company_id and r.status='active'),'[]'::jsonb)
  );
  return v_result;
end;
$$;

create or replace function private.stock_save_product_impl(p_company_id uuid,p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_id uuid; v_sku text; v_type text; v_tracking text;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_product is null or jsonb_typeof(p_product) is distinct from 'object' then raise exception 'Article invalide.' using errcode='22023'; end if;
  v_id:=nullif(p_product->>'id','')::uuid;
  v_sku:=btrim(coalesce(p_product->>'sku',''));
  v_type:=coalesce(p_product->>'product_type','goods');
  v_tracking:=coalesce(p_product->>'tracking','none');
  if length(v_sku) not between 1 and 64 or length(btrim(coalesce(p_product->>'name',''))) not between 1 and 180
     or length(coalesce(p_product->>'category',''))>100
     or length(coalesce(p_product->>'base_unit','unité'))>24
     or v_type not in ('goods','raw','semi','finished','consumable','service')
     or v_tracking not in ('none','lot','serial') or v_tracking<>'none'
     or (v_type='service' and v_tracking<>'none') then
    raise exception 'Données article invalides.' using errcode='22023';
  end if;
  if v_id is not null and v_type='service' and exists(select 1 from public.stock_movements m where m.company_id=p_company_id and m.product_id=v_id) then
    raise exception 'Un article ayant un historique de stock ne peut pas être converti en service.' using errcode='55000';
  end if;
  if v_id is not null and exists(select 1 from public.stock_movements m join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id where m.company_id=p_company_id and m.product_id=v_id and p.base_unit<>coalesce(nullif(p_product->>'base_unit',''),'unité')) then
    raise exception 'L’unité de base ne peut pas être changée après le premier mouvement.' using errcode='55000';
  end if;
  if v_id is null then
    insert into public.stock_products(company_id,sku,name,product_type,category,base_unit,tracking,active)
    values(p_company_id,v_sku,btrim(p_product->>'name'),v_type,coalesce(p_product->>'category',''),coalesce(nullif(p_product->>'base_unit',''),'unité'),v_tracking,coalesce((p_product->>'active')::boolean,true))
    returning id into v_id;
  else
    update public.stock_products set sku=v_sku,name=btrim(p_product->>'name'),product_type=v_type,
      category=coalesce(p_product->>'category',''),base_unit=coalesce(nullif(p_product->>'base_unit',''),'unité'),
      tracking=v_tracking,active=coalesce((p_product->>'active')::boolean,true),updated_at=now()
    where company_id=p_company_id and id=v_id;
    if not found then raise exception 'Article introuvable.' using errcode='P0002'; end if;
  end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.product_saved','product',v_id::text,jsonb_build_object('sku',v_sku));
  return (select to_jsonb(p)-'company_id' from public.stock_products p where p.company_id=p_company_id and p.id=v_id);
end;
$$;

create or replace function private.stock_save_warehouse_impl(p_company_id uuid,p_warehouse jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_id uuid; v_code text; v_name text;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  v_id:=nullif(p_warehouse->>'id','')::uuid;
  v_code:=btrim(coalesce(p_warehouse->>'code',''));
  v_name:=btrim(coalesce(p_warehouse->>'name',''));
  if length(v_code) not between 1 and 40 or length(v_name) not between 1 and 140 then
    raise exception 'Entrepôt invalide.' using errcode='22023';
  end if;
  if v_id is null then
    insert into public.stock_warehouses(company_id,code,name,active) values(p_company_id,v_code,v_name,coalesce((p_warehouse->>'active')::boolean,true)) returning id into v_id;
  else
    update public.stock_warehouses set code=v_code,name=v_name,active=coalesce((p_warehouse->>'active')::boolean,true),updated_at=now()
    where company_id=p_company_id and id=v_id;
    if not found then raise exception 'Entrepôt introuvable.' using errcode='P0002'; end if;
  end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id)
  values(p_company_id,v_actor,'stock.warehouse_saved','warehouse',v_id::text);
  return (select to_jsonb(w)-'company_id' from public.stock_warehouses w where w.company_id=p_company_id and w.id=v_id);
end;
$$;

create or replace function private.stock_update_settings_impl(p_company_id uuid,p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_old public.stock_settings%rowtype;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_settings is null or jsonb_typeof(p_settings) is distinct from 'object' or octet_length(p_settings::text)>10000 then raise exception 'Paramètres de stock invalides ou trop volumineux.' using errcode='22023'; end if;
  insert into public.stock_settings(company_id) values(p_company_id) on conflict do nothing;
  select * into v_old from public.stock_settings where company_id=p_company_id for update;
  if coalesce(p_settings->>'valuation_method',v_old.valuation_method) not in ('cump','fifo')
     or coalesce(p_settings->>'sales_trigger',v_old.sales_trigger) not in ('delivery','invoice_validation')
     or coalesce(p_settings->>'purchase_trigger',v_old.purchase_trigger) not in ('receipt','supplier_invoice')
     or coalesce(p_settings->>'accounting_mode',v_old.accounting_mode) not in ('perpetual','periodic') then
    raise exception 'Paramètres de stock invalides.' using errcode='22023';
  end if;
  if p_settings ? 'allow_negative' and (p_settings->>'allow_negative')::boolean is distinct from v_old.allow_negative
     and not exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=v_actor and m.status='active' and m.role='admin') then
    raise exception 'Seul un administrateur peut modifier l’autorisation de stock négatif.' using errcode='42501';
  end if;
  if coalesce(p_settings->>'valuation_method',v_old.valuation_method)<>v_old.valuation_method
     and exists(select 1 from public.stock_movements where company_id=p_company_id) then
    raise exception 'La méthode de valorisation ne peut plus être changée après le premier mouvement sans procédure de recalcul.' using errcode='55000';
  end if;
  update public.stock_settings set
    valuation_method=coalesce(p_settings->>'valuation_method',valuation_method),
    allow_negative=case when p_settings ? 'allow_negative' then (p_settings->>'allow_negative')::boolean else allow_negative end,
    sales_trigger=coalesce(p_settings->>'sales_trigger',sales_trigger),
    purchase_trigger=coalesce(p_settings->>'purchase_trigger',purchase_trigger),
    accounting_mode=coalesce(p_settings->>'accounting_mode',accounting_mode),
    updated_at=now(),updated_by=v_actor
  where company_id=p_company_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,details)
  values(p_company_id,v_actor,'stock.settings_updated','settings',p_settings);
  return (select to_jsonb(s)-'company_id' from public.stock_settings s where s.company_id=p_company_id);
end;
$$;

create or replace function private.stock_post_document_impl(
  p_company_id uuid,p_operation_uid uuid,p_document_type text,p_document_date date,
  p_reference text,p_note text,p_lines jsonb,p_source_type text default null,p_source_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid; v_doc uuid; v_existing jsonb; v_existing_hash text; v_request_hash text; v_settings public.stock_settings%rowtype;
  v_line jsonb; v_no integer:=0; v_product uuid; v_wh uuid; v_dest uuid;
  v_qty numeric(20,6); v_cost numeric(20,6); v_total numeric(20,6);
  v_balance public.stock_balances%rowtype; v_layer record; v_left numeric(20,6);
  v_take numeric(20,6); v_issue_cost numeric(20,6); v_unit_cost numeric(20,6); v_reserved numeric(20,6);
  v_source_movement bigint; v_dest_movement bigint; v_signed numeric(20,6); v_allocations jsonb;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_operation_uid is null or p_document_date is null or p_document_type not in ('receipt','issue','transfer','adjustment')
     or length(coalesce(p_reference,''))>120 or length(coalesce(p_note,''))>1000
     or length(coalesce(p_source_type,''))>60 or length(coalesce(p_source_id,''))>180
     or p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>500 then
    raise exception 'Document de stock invalide.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  v_request_hash:=md5(concat_ws('|',p_document_type,p_document_date::text,coalesce(p_reference,''),coalesce(p_note,''),p_lines::text,coalesce(p_source_type,''),coalesce(p_source_id,'')));
  select to_jsonb(d),d.request_hash into v_existing,v_existing_hash from public.stock_documents d where d.company_id=p_company_id and d.operation_uid=p_operation_uid;
  if v_existing is not null then
    if v_existing_hash<>v_request_hash then raise exception 'operation_uid déjà utilisé avec un contenu différent.' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'document_id',(v_existing->>'id')::uuid,'document',v_existing-'request_hash');
  end if;
  insert into public.stock_settings(company_id) values(p_company_id) on conflict do nothing;
  select * into v_settings from public.stock_settings where company_id=p_company_id for update;
  if exists(select 1 from public.accounting_periods p where p.company_id=p_company_id and p.status='closed' and p_document_date between p.start_date and p.end_date) then
    raise exception 'Période comptable clôturée : mouvement de stock interdit à cette date.' using errcode='55000';
  end if;
  insert into public.stock_documents(company_id,operation_uid,request_hash,document_type,document_date,reference,note,source_type,source_id,created_by)
  values(p_company_id,p_operation_uid,v_request_hash,p_document_type,p_document_date,coalesce(p_reference,''),coalesce(p_note,''),p_source_type,p_source_id,v_actor)
  returning id into v_doc;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_no:=v_no+1;
    v_allocations:='[]'::jsonb;
    v_product:=(v_line->>'product_id')::uuid;
    v_wh:=(v_line->>'warehouse_id')::uuid;
    v_dest:=nullif(v_line->>'destination_warehouse_id','')::uuid;
    v_qty:=(v_line->>'quantity')::numeric;
    v_cost:=coalesce(nullif(v_line->>'unit_cost','')::numeric,0);
    if p_document_type='adjustment' and coalesce(v_line->>'direction','') not in ('increase','decrease') then
      raise exception 'Un ajustement doit préciser increase ou decrease.' using errcode='22023';
    end if;
    if v_qty<=0 or v_qty>999999999999 or v_qty::text in ('NaN','Infinity','-Infinity') or v_cost<0 or v_cost>999999999999 or v_cost::text in ('NaN','Infinity','-Infinity')
       or (p_document_type='transfer' and (v_dest is null or v_dest=v_wh))
       or (p_document_type<>'transfer' and v_dest is not null) then
      raise exception 'Ligne de stock invalide.' using errcode='22023';
    end if;
    if not exists(select 1 from public.stock_products p where p.company_id=p_company_id and p.id=v_product and p.active and p.product_type<>'service') then
      raise exception 'Article physique introuvable ou inactif.' using errcode='22023';
    end if;
    if not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=v_wh and w.active) then
      raise exception 'Entrepôt source introuvable ou inactif.' using errcode='22023';
    end if;
    if v_dest is not null and not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=v_dest and w.active) then
      raise exception 'Entrepôt destination introuvable ou inactif.' using errcode='22023';
    end if;
    insert into public.stock_balances(company_id,product_id,warehouse_id) values(p_company_id,v_product,v_wh) on conflict do nothing;
    select * into v_balance from public.stock_balances where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh for update;
    if p_document_type in ('issue','transfer') or (p_document_type='adjustment' and coalesce((v_line->>'direction'),'')='decrease') then
      select coalesce(sum(r.quantity),0) into v_reserved from public.stock_reservations r
        where r.company_id=p_company_id and r.product_id=v_product and r.warehouse_id=v_wh and r.status='active';
      if v_balance.quantity < v_reserved then
        raise exception 'Le stock physique est inférieur aux quantités déjà réservées.' using errcode='23514';
      end if;
      if v_reserved>0 and v_qty>greatest(v_balance.quantity-v_reserved,0) then
        raise exception 'Cette sortie empiéterait sur des quantités réservées.' using errcode='23514';
      end if;
      if (p_document_type='transfer' or not v_settings.allow_negative) and v_balance.quantity-v_reserved<v_qty then
        raise exception 'Stock disponible insuffisant pour l’article % : disponible hors réservations %, demandé %.',v_product,v_balance.quantity-v_reserved,v_qty using errcode='23514';
      end if;
      v_issue_cost:=0;
      if v_settings.valuation_method='fifo' then
        v_left:=v_qty;
        for v_layer in select * from public.stock_valuation_layers
          where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh and remaining_quantity>0
          order by created_at,id for update
        loop
          exit when v_left<=0;
          v_take:=least(v_left,v_layer.remaining_quantity);
          v_issue_cost:=v_issue_cost+v_take*v_layer.unit_cost;
          update public.stock_valuation_layers set remaining_quantity=remaining_quantity-v_take where id=v_layer.id;
          v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('layer_id',v_layer.id,'quantity',v_take,'unit_cost',v_layer.unit_cost));
          v_left:=v_left-v_take;
        end loop;
        if v_left>0 then
          raise exception 'Couches FIFO insuffisantes : la méthode FIFO interdit le stock négatif.' using errcode='23514';
        end if;
      else
        v_unit_cost:=case when v_balance.quantity>0 then v_balance.inventory_value/v_balance.quantity else 0 end;
        v_issue_cost:=least(v_qty,greatest(v_balance.quantity,0))*v_unit_cost;
      end if;
      v_issue_cost:=round(v_issue_cost,6);
      insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers)
      values(p_company_id,v_doc,v_no,v_product,v_wh,v_dest,v_qty,case when v_qty=0 then 0 else v_issue_cost/v_qty end,v_issue_cost,v_line->>'lot_code',coalesce(v_line->'serial_numbers','[]'::jsonb));
      insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
      values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_wh,-v_qty,-v_issue_cost,case when v_qty=0 then 0 else v_issue_cost/v_qty end,p_document_date)
      returning id into v_source_movement;
      if v_settings.valuation_method='fifo' then
        insert into public.stock_valuation_allocations(company_id,movement_id,layer_id,quantity,unit_cost)
        select p_company_id,v_source_movement,(a->>'layer_id')::bigint,(a->>'quantity')::numeric,(a->>'unit_cost')::numeric
        from jsonb_array_elements(v_allocations) a;
      end if;
      update public.stock_balances set quantity=quantity-v_qty,inventory_value=greatest(0,inventory_value-v_issue_cost),updated_at=now()
      where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh;
      if p_document_type='transfer' then
        insert into public.stock_balances(company_id,product_id,warehouse_id) values(p_company_id,v_product,v_dest) on conflict do nothing;
        update public.stock_balances set quantity=quantity+v_qty,inventory_value=inventory_value+v_issue_cost,updated_at=now()
        where company_id=p_company_id and product_id=v_product and warehouse_id=v_dest;
        insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost)
        values(p_company_id,v_doc,v_no+500,v_product,v_dest,null,v_qty,v_issue_cost/v_qty,v_issue_cost);
        insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
        values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_dest,v_qty,v_issue_cost,v_issue_cost/v_qty,p_document_date)
        returning id into v_dest_movement;
        insert into public.stock_valuation_layers(company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost)
        values(p_company_id,v_product,v_dest,v_dest_movement,v_qty,v_qty,v_issue_cost/v_qty);
      end if;
    else
      v_total:=round(v_qty*v_cost,6);
      insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers)
      values(p_company_id,v_doc,v_no,v_product,v_wh,null,v_qty,v_cost,v_total,v_line->>'lot_code',coalesce(v_line->'serial_numbers','[]'::jsonb));
      insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
      values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_wh,v_qty,v_total,v_cost,p_document_date)
      returning id into v_source_movement;
      update public.stock_balances set quantity=quantity+v_qty,inventory_value=inventory_value+v_total,updated_at=now()
      where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh;
      insert into public.stock_valuation_layers(company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost)
      values(p_company_id,v_product,v_wh,v_source_movement,v_qty,v_qty,v_cost);
    end if;
  end loop;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.document_posted','stock_document',v_doc::text,jsonb_build_object('type',p_document_type,'lines',v_no,'operation_uid',p_operation_uid));
  return jsonb_build_object('ok',true,'duplicate',false,'document_id',v_doc);
end;
$$;

create or replace function private.stock_reserve_impl(
  p_company_id uuid,p_operation_uid uuid,p_product_id uuid,p_warehouse_id uuid,p_quantity numeric,p_reference text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_existing public.stock_reservations%rowtype; v_balance numeric; v_reserved numeric;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_operation_uid is null or p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity') or length(coalesce(p_reference,''))>120 then raise exception 'Réservation invalide.' using errcode='22023'; end if;
  if not exists(select 1 from public.stock_products p where p.company_id=p_company_id and p.id=p_product_id and p.active and p.product_type<>'service')
     or not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=p_warehouse_id and w.active) then
    raise exception 'Article ou entrepôt invalide pour la réservation.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  select * into v_existing from public.stock_reservations where company_id=p_company_id and operation_uid=p_operation_uid;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.warehouse_id<>p_warehouse_id or v_existing.quantity<>p_quantity or v_existing.reference<>coalesce(p_reference,'') then
      raise exception 'operation_uid déjà utilisé avec une réservation différente.' using errcode='23505';
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'reservation_id',v_existing.id);
  end if;
  select quantity into v_balance from public.stock_balances where company_id=p_company_id and product_id=p_product_id and warehouse_id=p_warehouse_id for update;
  v_balance:=coalesce(v_balance,0);
  select coalesce(sum(quantity),0) into v_reserved from public.stock_reservations where company_id=p_company_id and product_id=p_product_id and warehouse_id=p_warehouse_id and status='active';
  if v_balance-v_reserved<p_quantity then raise exception 'Stock disponible insuffisant pour réserver.' using errcode='23514'; end if;
  insert into public.stock_reservations(company_id,operation_uid,product_id,warehouse_id,quantity,reference,created_by)
  values(p_company_id,p_operation_uid,p_product_id,p_warehouse_id,p_quantity,coalesce(p_reference,''),v_actor)
  returning * into v_existing;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id)
  values(p_company_id,v_actor,'stock.reserved','stock_reservation',v_existing.id::text);
  return jsonb_build_object('ok',true,'reservation_id',v_existing.id);
end;
$$;

create or replace function private.stock_release_reservation_impl(p_company_id uuid,p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  update public.stock_reservations set status='released',released_at=now()
  where company_id=p_company_id and id=p_reservation_id and status='active';
  if not found then
    if exists(select 1 from public.stock_reservations where company_id=p_company_id and id=p_reservation_id and status='released') then
      return jsonb_build_object('ok',true,'duplicate',true,'reservation_id',p_reservation_id);
    end if;
    raise exception 'Réservation active introuvable.' using errcode='P0002';
  end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id)
  values(p_company_id,v_actor,'stock.reservation_released','stock_reservation',p_reservation_id::text);
  return jsonb_build_object('ok',true,'reservation_id',p_reservation_id);
end;
$$;

create or replace function private.stock_reverse_document_impl(p_company_id uuid,p_document_id uuid,p_operation_uid uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_doc public.stock_documents%rowtype; v_lines jsonb; v_type text; v_result jsonb; v_new_id uuid;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  raise exception 'Contrepassation suspendue : le recalcul exact des couches de valorisation doit être validé avant activation.' using errcode='0A000';
  select id into v_new_id from public.stock_documents where company_id=p_company_id and operation_uid=p_operation_uid;
  if found then return jsonb_build_object('ok',true,'duplicate',true,'reversal_document_id',v_new_id); end if;
  if length(btrim(coalesce(p_reason,'')))<5 or length(btrim(p_reason))>500 then raise exception 'Motif de contrepassation obligatoire (5 à 500 caractères).' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  select * into v_doc from public.stock_documents where company_id=p_company_id and id=p_document_id for update;
  if not found or v_doc.status<>'posted' then raise exception 'Document non disponible pour contrepassation.' using errcode='55000'; end if;
    if v_doc.document_type='receipt' then v_type:='issue';
  elsif v_doc.document_type='issue' then v_type:='receipt';
  else v_type:=v_doc.document_type; end if;
  select jsonb_agg(jsonb_build_object(
    'product_id',l.product_id,'warehouse_id',case when v_doc.document_type='transfer' then l.destination_warehouse_id else l.warehouse_id end,
    'destination_warehouse_id',case when v_doc.document_type='transfer' then l.warehouse_id else null end,
    'quantity',l.quantity,'unit_cost',l.unit_cost,
    'direction',case when v_doc.document_type='adjustment' then case when m.quantity_delta<0 then 'increase' else 'decrease' end else null end
  ) order by l.line_number) into v_lines
  from public.stock_document_lines l
  left join public.stock_movements m on m.company_id=l.company_id and m.line_id=l.id
  where l.company_id=p_company_id and l.document_id=p_document_id and l.line_number<=500;
  v_result:=private.stock_post_document_impl(p_company_id,p_operation_uid,v_type,current_date,
    'REV-'||coalesce(v_doc.reference,v_doc.id::text),btrim(p_reason),v_lines,'reversal',v_doc.id::text);
  v_new_id:=(v_result->>'document_id')::uuid;
  update public.stock_documents set status='reversed',reversed_by_document_id=v_new_id where company_id=p_company_id and id=p_document_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.document_reversed','stock_document',p_document_id::text,jsonb_build_object('reversal_document_id',v_new_id,'reason',btrim(p_reason)));
  return jsonb_build_object('ok',true,'reversal_document_id',v_new_id);
end;
$$;


-- Fonctions internes privilégiées dans le schéma non exposé.
-- Les seules fonctions publiques sont des wrappers SECURITY INVOKER.
-- Le schéma reste non exposé par PostgREST ; USAGE permet aux wrappers INVOKER
-- d'appeler uniquement les fonctions privées dont EXECUTE est accordé explicitement.
grant usage on schema private to authenticated;
revoke all on function private.stock_read_state_impl(uuid) from public,anon;
revoke all on function private.stock_save_product_impl(uuid,jsonb) from public,anon;
revoke all on function private.stock_save_warehouse_impl(uuid,jsonb) from public,anon;
revoke all on function private.stock_update_settings_impl(uuid,jsonb) from public,anon;
revoke all on function private.stock_post_document_impl(uuid,uuid,text,date,text,text,jsonb,text,text) from public,anon;
revoke all on function private.stock_reserve_impl(uuid,uuid,uuid,uuid,numeric,text) from public,anon;
revoke all on function private.stock_release_reservation_impl(uuid,uuid) from public,anon;
revoke all on function private.stock_reverse_document_impl(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.stock_read_state_impl(uuid) to authenticated;
grant execute on function private.stock_save_product_impl(uuid,jsonb) to authenticated;
grant execute on function private.stock_save_warehouse_impl(uuid,jsonb) to authenticated;
grant execute on function private.stock_update_settings_impl(uuid,jsonb) to authenticated;
grant execute on function private.stock_post_document_impl(uuid,uuid,text,date,text,text,jsonb,text,text) to authenticated;
grant execute on function private.stock_reserve_impl(uuid,uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function private.stock_release_reservation_impl(uuid,uuid) to authenticated;
grant execute on function private.stock_reverse_document_impl(uuid,uuid,uuid,text) to authenticated;

create or replace function public.stock_read_state(p_company_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_read_state_impl(p_company_id) $;
create or replace function public.stock_save_product(p_company_id uuid,p_product jsonb)
returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_save_product_impl(p_company_id,p_product) $;
create or replace function public.stock_save_warehouse(p_company_id uuid,p_warehouse jsonb)
returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_save_warehouse_impl(p_company_id,p_warehouse) $;
create or replace function public.stock_update_settings(p_company_id uuid,p_settings jsonb)
returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_update_settings_impl(p_company_id,p_settings) $;
create or replace function public.stock_post_document(
  p_company_id uuid,p_operation_uid uuid,p_document_type text,p_document_date date,
  p_reference text,p_note text,p_lines jsonb,p_source_type text default null,p_source_id text default null
) returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_post_document_impl(p_company_id,p_operation_uid,p_document_type,p_document_date,p_reference,p_note,p_lines,p_source_type,p_source_id) $;
create or replace function public.stock_reserve(
  p_company_id uuid,p_operation_uid uuid,p_product_id uuid,p_warehouse_id uuid,p_quantity numeric,p_reference text default ''
) returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_reserve_impl(p_company_id,p_operation_uid,p_product_id,p_warehouse_id,p_quantity,p_reference) $;
create or replace function public.stock_release_reservation(p_company_id uuid,p_reservation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_release_reservation_impl(p_company_id,p_reservation_id) $;
create or replace function public.stock_reverse_document(p_company_id uuid,p_document_id uuid,p_operation_uid uuid,p_reason text)
returns jsonb language sql security invoker set search_path = ''
as $ select private.stock_reverse_document_impl(p_company_id,p_document_id,p_operation_uid,p_reason) $;

revoke all on function public.stock_read_state(uuid) from public,anon,authenticated;
revoke all on function public.stock_save_product(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.stock_save_warehouse(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.stock_update_settings(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.stock_post_document(uuid,uuid,text,date,text,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.stock_reserve(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.stock_release_reservation(uuid,uuid) from public,anon,authenticated;
revoke all on function public.stock_reverse_document(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.stock_read_state(uuid) to authenticated;
grant execute on function public.stock_save_product(uuid,jsonb) to authenticated;
grant execute on function public.stock_save_warehouse(uuid,jsonb) to authenticated;
grant execute on function public.stock_update_settings(uuid,jsonb) to authenticated;
grant execute on function public.stock_post_document(uuid,uuid,text,date,text,text,jsonb,text,text) to authenticated;
grant execute on function public.stock_reserve(uuid,uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_release_reservation(uuid,uuid) to authenticated;
grant execute on function public.stock_reverse_document(uuid,uuid,uuid,text) to authenticated;

-- L'API RPC est le seul canal d'écriture depuis le navigateur.

commit;
