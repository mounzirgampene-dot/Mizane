-- MIZANE — Traçabilité par lots/séries et conversions d’unités.
-- Migration additive, à appliquer sur DEV puis vérifier avant toute autre cible.
begin;

alter table public.stock_document_lines
  add column if not exists input_quantity numeric(20,6),
  add column if not exists input_unit text,
  add column if not exists conversion_factor numeric(20,6) not null default 1;

create table public.stock_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  unit_code text not null check (length(trim(unit_code)) between 1 and 24),
  factor_to_base numeric(20,6) not null check (factor_to_base>0),
  created_at timestamptz not null default now(),
  foreign key(company_id,product_id) references public.stock_products(company_id,id) on delete cascade,
  unique(company_id,product_id,unit_code)
);

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  lot_code text not null check (length(trim(lot_code)) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  unique(company_id,product_id,lot_code),
  unique(company_id,id)
);
create table public.stock_lot_balances (
  company_id uuid not null,
  lot_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(20,6) not null default 0 check (quantity>=0),
  updated_at timestamptz not null default now(),
  primary key(company_id,lot_id,warehouse_id),
  foreign key(company_id,lot_id) references public.stock_lots(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id)
);

create table public.stock_serials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  serial_number text not null check (length(trim(serial_number)) between 1 and 120),
  warehouse_id uuid,
  status text not null check (status in ('in_stock','in_transit','issued')),
  last_movement_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id),
  foreign key(company_id,last_movement_id) references public.stock_movements(company_id,id),
  unique(company_id,serial_number)
);

alter table public.stock_unit_conversions enable row level security;
alter table public.stock_unit_conversions force row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_lots force row level security;
alter table public.stock_lot_balances enable row level security;
alter table public.stock_lot_balances force row level security;
alter table public.stock_serials enable row level security;
alter table public.stock_serials force row level security;

do $$
declare t text;
begin
  foreach t in array array['stock_unit_conversions','stock_lots','stock_lot_balances','stock_serials'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_active_company_member(company_id))',t||'_select_members',t);
  end loop;
end $$;

create index stock_unit_conversions_product_idx on public.stock_unit_conversions(company_id,product_id);
create index stock_lot_balances_warehouse_idx on public.stock_lot_balances(company_id,warehouse_id);
create index stock_serials_product_location_idx on public.stock_serials(company_id,product_id,warehouse_id,status);
create unique index stock_unit_conversions_ci_uidx on public.stock_unit_conversions(company_id,product_id,lower(unit_code));
create unique index stock_serials_ci_uidx on public.stock_serials(company_id,lower(serial_number));

create or replace function private.stock_prepare_document_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tracking text; v_source public.stock_document_lines%rowtype;
begin
  if new.line_number>500 and new.destination_warehouse_id is null then
    select * into v_source from public.stock_document_lines s
    where s.company_id=new.company_id and s.document_id=new.document_id
      and s.product_id=new.product_id and s.destination_warehouse_id=new.warehouse_id
      and s.line_number=new.line_number-500;
    if found then
      new.lot_code:=v_source.lot_code;
      new.serial_numbers:=v_source.serial_numbers;
      new.input_quantity:=v_source.input_quantity;
      new.input_unit:=v_source.input_unit;
      new.conversion_factor:=v_source.conversion_factor;
    end if;
  end if;
  select tracking into v_tracking from public.stock_products
  where company_id=new.company_id and id=new.product_id;
  if v_tracking='lot' then
    if length(trim(coalesce(new.lot_code,''))) not between 1 and 80
       or jsonb_array_length(coalesce(new.serial_numbers,'[]'::jsonb))<>0 then
      raise exception 'Un article suivi par lot exige un code de lot et aucun numéro de série.' using errcode='22023';
    end if;
  elsif v_tracking='serial' then
    if new.quantity<>trunc(new.quantity)
       or jsonb_typeof(coalesce(new.serial_numbers,'[]'::jsonb))<>'array'
       or jsonb_array_length(coalesce(new.serial_numbers,'[]'::jsonb))<>new.quantity
       or length(trim(coalesce(new.lot_code,'')))>0 then
      raise exception 'Un article suivi par série exige un numéro unique par unité entière.' using errcode='22023';
    end if;
  elsif coalesce(new.lot_code,'')<>'' or jsonb_array_length(coalesce(new.serial_numbers,'[]'::jsonb))>0 then
    raise exception 'Cet article ne prend pas en charge la traçabilité.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.stock_prepare_document_line() from public,anon,authenticated;
create trigger stock_document_line_tracking
before insert on public.stock_document_lines
for each row execute function private.stock_prepare_document_line();

create or replace function private.stock_apply_tracking_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking text; v_doc_type text; v_lot_id uuid; v_line public.stock_document_lines%rowtype;
  v_serial text; v_count integer:=0; v_expected integer; v_new_qty numeric(20,6);
begin
  select p.tracking,d.document_type into v_tracking,v_doc_type
  from public.stock_products p join public.stock_documents d
    on d.company_id=p.company_id
  where p.company_id=new.company_id and p.id=new.product_id and d.id=new.document_id;
  if v_tracking='none' then return new; end if;
  select * into v_line from public.stock_document_lines
  where company_id=new.company_id and id=new.line_id;
  if v_tracking='lot' then
    insert into public.stock_lots(company_id,product_id,lot_code)
    values(new.company_id,new.product_id,v_line.lot_code)
    on conflict(company_id,product_id,lot_code) do nothing;
    select id into v_lot_id from public.stock_lots
    where company_id=new.company_id and product_id=new.product_id and lot_code=v_line.lot_code;
    insert into public.stock_lot_balances(company_id,lot_id,warehouse_id,quantity)
    values(new.company_id,v_lot_id,new.warehouse_id,new.quantity_delta)
    on conflict(company_id,lot_id,warehouse_id) do update
      set quantity=public.stock_lot_balances.quantity+excluded.quantity,updated_at=now()
      where public.stock_lot_balances.quantity+excluded.quantity>=0
    returning quantity into v_new_qty;
    if not found then
      raise exception 'Quantité insuffisante pour le lot % dans cet entrepôt.',v_line.lot_code using errcode='23514';
    end if;
    return new;
  end if;

  v_expected:=abs(new.quantity_delta)::integer;
  for v_serial in select jsonb_array_elements_text(v_line.serial_numbers) loop
    if length(trim(v_serial))=0 then raise exception 'Numéro de série vide.' using errcode='22023'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements_text(v_line.serial_numbers))<>
     (select count(distinct lower(trim(value))) from jsonb_array_elements_text(v_line.serial_numbers)) then
    raise exception 'Numéros de série dupliqués dans une même ligne.' using errcode='23505';
  end if;

  if new.quantity_delta<0 then
    if v_doc_type='transfer' then
      update public.stock_serials set status='in_transit',warehouse_id=null,last_movement_id=new.id,updated_at=now()
      where company_id=new.company_id and product_id=new.product_id and warehouse_id=new.warehouse_id
        and status='in_stock' and serial_number in (select jsonb_array_elements_text(v_line.serial_numbers));
    else
      update public.stock_serials set status='issued',warehouse_id=null,last_movement_id=new.id,updated_at=now()
      where company_id=new.company_id and product_id=new.product_id and warehouse_id=new.warehouse_id
        and status='in_stock' and serial_number in (select jsonb_array_elements_text(v_line.serial_numbers));
    end if;
    get diagnostics v_count = row_count;
    if v_count<>v_expected then
      raise exception 'Un ou plusieurs numéros de série ne sont pas disponibles dans cet entrepôt.' using errcode='23514';
    end if;
  elsif v_doc_type='transfer' then
    update public.stock_serials set status='in_stock',warehouse_id=new.warehouse_id,last_movement_id=new.id,updated_at=now()
    where company_id=new.company_id and product_id=new.product_id and status='in_transit'
      and serial_number in (select jsonb_array_elements_text(v_line.serial_numbers));
    get diagnostics v_count = row_count;
    if v_count<>v_expected then raise exception 'Transfert de numéros de série incohérent.' using errcode='23514'; end if;
  else
    for v_serial in select jsonb_array_elements_text(v_line.serial_numbers) loop
      insert into public.stock_serials(company_id,product_id,serial_number,warehouse_id,status,last_movement_id)
      values(new.company_id,new.product_id,trim(v_serial),new.warehouse_id,'in_stock',new.id)
      on conflict(company_id,serial_number) do update
        set warehouse_id=excluded.warehouse_id,status='in_stock',last_movement_id=excluded.last_movement_id,updated_at=now()
        where public.stock_serials.product_id=excluded.product_id and public.stock_serials.status='issued';
      get diagnostics v_count = row_count;
      if v_count<>1 then raise exception 'Numéro de série déjà enregistré ou associé à un autre article : %.',v_serial using errcode='23505'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.stock_apply_tracking_movement() from public,anon,authenticated;
create trigger stock_movement_tracking
after insert on public.stock_movements
for each row execute function private.stock_apply_tracking_movement();

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
    'unit_conversions',coalesce((select jsonb_agg(to_jsonb(c)-'company_id' order by c.product_id,c.unit_code) from public.stock_unit_conversions c where c.company_id=p_company_id),'[]'::jsonb),
    'lots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'product_id',l.product_id,'lot_code',l.lot_code,'warehouse_id',b.warehouse_id,'quantity',b.quantity) order by l.lot_code) from public.stock_lots l join public.stock_lot_balances b on b.company_id=l.company_id and b.lot_id=l.id where l.company_id=p_company_id and b.quantity>0),'[]'::jsonb),
    'serials',coalesce((select jsonb_agg(to_jsonb(s)-'company_id' order by s.serial_number) from public.stock_serials s where s.company_id=p_company_id),'[]'::jsonb),
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
declare v_actor uuid; v_id uuid; v_sku text; v_type text; v_tracking text; v_conv jsonb; v_unit text; v_factor numeric;
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
     or v_tracking not in ('none','lot','serial')
     or (v_type='service' and v_tracking<>'none') then
    raise exception 'Données article invalides.' using errcode='22023';
  end if;
  if v_id is not null and exists(select 1 from public.stock_movements m join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id where m.company_id=p_company_id and m.product_id=v_id and p.tracking<>v_tracking) then
    raise exception 'Le mode de traçabilité ne peut pas être changé après le premier mouvement.' using errcode='55000';
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
  if p_product ? 'unit_conversions' then
    if jsonb_typeof(p_product->'unit_conversions') is distinct from 'array' or jsonb_array_length(p_product->'unit_conversions')>50 then
      raise exception 'Liste de conversions invalide (50 maximum).' using errcode='22023';
    end if;
    if exists(select 1 from public.stock_movements m where m.company_id=p_company_id and m.product_id=v_id) then
      raise exception 'Les conversions ne peuvent plus être modifiées après le premier mouvement.' using errcode='55000';
    end if;
    delete from public.stock_unit_conversions where company_id=p_company_id and product_id=v_id;
    for v_conv in select value from jsonb_array_elements(p_product->'unit_conversions') loop
      v_unit:=btrim(coalesce(v_conv->>'unit_code',''));
      v_factor:=nullif(v_conv->>'factor_to_base','')::numeric;
      if length(v_unit) not between 1 and 24 or lower(v_unit)=lower(coalesce(nullif(p_product->>'base_unit',''),'unité'))
         or v_factor is null or v_factor<=0 or v_factor>1000000000
         or v_factor::text in ('NaN','Infinity','-Infinity') then
        raise exception 'Conversion d’unité invalide.' using errcode='22023';
      end if;
      insert into public.stock_unit_conversions(company_id,product_id,unit_code,factor_to_base)
      values(p_company_id,v_id,v_unit,v_factor);
    end loop;
  end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.product_saved','product',v_id::text,jsonb_build_object('sku',v_sku));
  return (select to_jsonb(p)-'company_id' from public.stock_products p where p.company_id=p_company_id and p.id=v_id);
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
  v_base_unit text; v_tracking text; v_input_unit text; v_input_qty numeric(20,6); v_factor numeric(20,6);
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
    v_input_qty:=(v_line->>'quantity')::numeric;
    v_qty:=v_input_qty;
    v_cost:=coalesce(nullif(v_line->>'unit_cost','')::numeric,0);
    v_input_unit:=btrim(coalesce(v_line->>'unit',''));
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
    select p.base_unit,p.tracking into v_base_unit,v_tracking from public.stock_products p where p.company_id=p_company_id and p.id=v_product;
    if v_input_unit='' then v_input_unit:=v_base_unit; end if;
    v_factor:=1;
    if v_input_unit<>v_base_unit then
      select c.factor_to_base into v_factor from public.stock_unit_conversions c where c.company_id=p_company_id and c.product_id=v_product and lower(c.unit_code)=lower(v_input_unit);
      if not found then raise exception 'Unité non autorisée pour cet article : %.',v_input_unit using errcode='22023'; end if;
    end if;
    if v_tracking='serial' and (v_factor<>1 or v_input_unit<>v_base_unit) then raise exception 'Les articles suivis par numéro de série doivent être saisis dans leur unité de base.' using errcode='22023'; end if;
    v_qty:=round(v_input_qty*v_factor,6);
    v_cost:=round(v_cost/v_factor,6);
    if v_qty<=0 or v_qty>999999999999 or v_qty::text in ('NaN','Infinity','-Infinity') or v_cost<0 or v_cost>999999999999 or v_cost::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Quantité ou coût converti invalide.' using errcode='22023';
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
      insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers,input_quantity,input_unit,conversion_factor)
      values(p_company_id,v_doc,v_no,v_product,v_wh,v_dest,v_qty,case when v_qty=0 then 0 else v_issue_cost/v_qty end,v_issue_cost,v_line->>'lot_code',coalesce(v_line->'serial_numbers','[]'::jsonb),v_input_qty,v_input_unit,v_factor);
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
        insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,input_quantity,input_unit,conversion_factor)
        values(p_company_id,v_doc,v_no+500,v_product,v_dest,null,v_qty,v_issue_cost/v_qty,v_issue_cost,v_input_qty,v_input_unit,v_factor);
        insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
        values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_dest,v_qty,v_issue_cost,v_issue_cost/v_qty,p_document_date)
        returning id into v_dest_movement;
        insert into public.stock_valuation_layers(company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost)
        values(p_company_id,v_product,v_dest,v_dest_movement,v_qty,v_qty,v_issue_cost/v_qty);
      end if;
    else
      v_total:=round(v_qty*v_cost,6);
      insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers,input_quantity,input_unit,conversion_factor)
      values(p_company_id,v_doc,v_no,v_product,v_wh,null,v_qty,v_cost,v_total,v_line->>'lot_code',coalesce(v_line->'serial_numbers','[]'::jsonb),v_input_qty,v_input_unit,v_factor);
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

commit;
