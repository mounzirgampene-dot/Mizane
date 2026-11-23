-- MIZANE — Inventaire physique guidé, gel transactionnel et ajustements audités.
begin;

create table public.stock_count_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  warehouse_id uuid not null,
  reference text not null,
  status text not null default 'counting' check (status in ('counting','submitted','posted','cancelled')),
  created_by uuid not null references auth.users(id),
  submitted_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  posted_document_id uuid,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  posted_at timestamptz,
  cancelled_at timestamptz,
  unique(company_id,id),
  foreign key(company_id,warehouse_id) references public.stock_warehouses(company_id,id),
  foreign key(company_id,posted_document_id) references public.stock_documents(company_id,id),
  check (length(trim(reference)) between 1 and 120)
);
create index stock_count_sessions_active_idx
  on public.stock_count_sessions(company_id,warehouse_id,status)
  where status in ('counting','submitted');

create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  session_id uuid not null,
  product_id uuid not null,
  snapshot_quantity numeric(20,6) not null,
  snapshot_unit_cost numeric(20,6) not null default 0,
  counted_quantity numeric(20,6),
  variance numeric(20,6) generated always as (counted_quantity - snapshot_quantity) stored,
  counted_by uuid references auth.users(id),
  counted_at timestamptz,
  unique(company_id,id),
  unique(company_id,session_id,product_id),
  foreign key(company_id,session_id) references public.stock_count_sessions(company_id,id) on delete cascade,
  foreign key(company_id,product_id) references public.stock_products(company_id,id),
  check (snapshot_quantity >= 0 and snapshot_unit_cost >= 0),
  check (counted_quantity is null or (counted_quantity >= 0 and counted_quantity < 1000000000000))
);
create index stock_count_lines_session_idx on public.stock_count_lines(company_id,session_id,product_id);

alter table public.stock_count_sessions enable row level security;
alter table public.stock_count_sessions force row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_lines force row level security;
create policy stock_count_sessions_select_members on public.stock_count_sessions
  for select to authenticated using (private.is_active_company_member(company_id));
create policy stock_count_lines_select_members on public.stock_count_lines
  for select to authenticated using (private.is_active_company_member(company_id));
revoke all on public.stock_count_sessions, public.stock_count_lines from anon, authenticated;
grant select on public.stock_count_sessions, public.stock_count_lines to authenticated;

create or replace function private.stock_count_block_movement()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_source_type text; v_source_id text;
begin
  select d.source_type,d.source_id into v_source_type,v_source_id
  from public.stock_documents d
  where d.company_id=new.company_id and d.id=new.document_id;
  if exists (
    select 1 from public.stock_count_sessions s
    where s.company_id=new.company_id and s.warehouse_id=new.warehouse_id
      and s.status in ('counting','submitted')
      and not (v_source_type='inventory_count' and v_source_id=s.id::text)
  ) then
    raise exception 'Mouvement interdit : un inventaire physique est en cours dans cet entrepôt.'
      using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.stock_count_block_movement() from public,anon,authenticated;
create trigger stock_count_freeze_movements
before insert on public.stock_movements
for each row execute function private.stock_count_block_movement();

create or replace function private.stock_count_create_impl(p_company_id uuid,p_warehouse_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid; v_session uuid; v_count integer;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if length(trim(coalesce(p_reference,'')))<1 or length(p_reference)>120 then
    raise exception 'Référence d’inventaire invalide.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  if not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=p_warehouse_id and w.active) then
    raise exception 'Entrepôt introuvable ou inactif.' using errcode='22023';
  end if;
  if exists(select 1 from public.stock_count_sessions s where s.company_id=p_company_id and s.warehouse_id=p_warehouse_id and s.status in ('counting','submitted')) then
    raise exception 'Un inventaire est déjà en cours dans cet entrepôt.' using errcode='23505';
  end if;
  insert into public.stock_count_sessions(company_id,warehouse_id,reference,created_by)
  values(p_company_id,p_warehouse_id,trim(p_reference),v_actor) returning id into v_session;
  insert into public.stock_count_lines(company_id,session_id,product_id,snapshot_quantity,snapshot_unit_cost)
  select p_company_id,v_session,p.id,coalesce(b.quantity,0),
    case when coalesce(b.quantity,0)>0 then coalesce(b.inventory_value,0)/b.quantity else 0 end
  from public.stock_products p
  left join public.stock_balances b on b.company_id=p.company_id and b.product_id=p.id and b.warehouse_id=p_warehouse_id
  where p.company_id=p_company_id and p.active and p.product_type<>'service'
  order by p.sku,p.id;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'Aucun article physique actif à inventorier.' using errcode='22023'; end if;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.count_started','stock_count_session',v_session::text,
    jsonb_build_object('warehouse_id',p_warehouse_id,'reference',p_reference,'lines',v_count));
  return jsonb_build_object('ok',true,'session_id',v_session,'line_count',v_count,'status','counting');
end;
$$;

create or replace function private.stock_count_set_line_impl(p_company_id uuid,p_session_id uuid,p_line_id uuid,p_counted_quantity numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid; v_session public.stock_count_sessions%rowtype;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_counted_quantity is null or p_counted_quantity<0 or p_counted_quantity>=1000000000000
     or p_counted_quantity::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Quantité comptée invalide.' using errcode='22023';
  end if;
  select * into v_session from public.stock_count_sessions
  where company_id=p_company_id and id=p_session_id for update;
  if not found or v_session.status<>'counting' then
    raise exception 'Cet inventaire n’accepte plus de comptage.' using errcode='55000';
  end if;
  update public.stock_count_lines set counted_quantity=p_counted_quantity,counted_by=v_actor,counted_at=now()
  where company_id=p_company_id and session_id=p_session_id and id=p_line_id;
  if not found then raise exception 'Ligne d’inventaire introuvable.' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'line_id',p_line_id,'counted_quantity',p_counted_quantity);
end;
$$;

create or replace function private.stock_count_submit_impl(p_company_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid; v_session public.stock_count_sessions%rowtype; v_missing integer;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  select * into v_session from public.stock_count_sessions
  where company_id=p_company_id and id=p_session_id for update;
  if not found or v_session.status<>'counting' then raise exception 'Inventaire non modifiable.' using errcode='55000'; end if;
  select count(*) into v_missing from public.stock_count_lines
  where company_id=p_company_id and session_id=p_session_id and counted_quantity is null;
  if v_missing>0 then raise exception 'Comptage incomplet : % article(s) restent à compter.',v_missing using errcode='23514'; end if;
  update public.stock_count_sessions set status='submitted',submitted_by=v_actor,submitted_at=now()
  where company_id=p_company_id and id=p_session_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.count_submitted','stock_count_session',p_session_id::text,
    jsonb_build_object('lines',(select count(*) from public.stock_count_lines where company_id=p_company_id and session_id=p_session_id)));
  return jsonb_build_object('ok',true,'status','submitted');
end;
$$;

create or replace function private.stock_count_finalize_impl(p_company_id uuid,p_session_id uuid,p_operation_uid uuid,p_document_date date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid; v_role text; v_session public.stock_count_sessions%rowtype; v_lines jsonb; v_result jsonb; v_doc uuid;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  select m.role into v_role from public.company_memberships m
  where m.company_id=p_company_id and m.user_id=v_actor and m.status='active';
  if v_role<>'admin' then raise exception 'Seul un administrateur peut approuver et clôturer l’inventaire.' using errcode='42501'; end if;
  if p_operation_uid is null or p_document_date is null then raise exception 'Paramètres de validation invalides.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  select * into v_session from public.stock_count_sessions
  where company_id=p_company_id and id=p_session_id for update;
  if not found then raise exception 'Inventaire introuvable.' using errcode='22023'; end if;
  if v_session.status='posted' then
    return jsonb_build_object('ok',true,'duplicate',true,'document_id',v_session.posted_document_id,'status','posted');
  end if;
  if v_session.status<>'submitted' then raise exception 'L’inventaire doit être soumis avant approbation.' using errcode='55000'; end if;
  if exists(select 1 from public.stock_count_lines where company_id=p_company_id and session_id=p_session_id and counted_quantity is null) then
    raise exception 'Comptage incomplet.' using errcode='23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',l.product_id,'warehouse_id',v_session.warehouse_id,
    'quantity',abs(l.counted_quantity-l.snapshot_quantity),
    'unit_cost',l.snapshot_unit_cost,
    'direction',case when l.counted_quantity>l.snapshot_quantity then 'increase' else 'decrease' end
  ) order by l.product_id),'[]'::jsonb)
  into v_lines from public.stock_count_lines l
  where l.company_id=p_company_id and l.session_id=p_session_id and l.counted_quantity<>l.snapshot_quantity;
  if jsonb_array_length(v_lines)>0 then
    v_result:=private.stock_post_document_impl(
      p_company_id,p_operation_uid,'adjustment',p_document_date,
      'INV-'||v_session.reference,'Régularisation inventaire physique '||v_session.id,
      v_lines,'inventory_count',v_session.id::text
    );
    v_doc:=(v_result->>'document_id')::uuid;
  end if;
  update public.stock_count_sessions set status='posted',approved_by=v_actor,posted_at=now(),posted_document_id=v_doc
  where company_id=p_company_id and id=p_session_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.count_approved_and_posted','stock_count_session',p_session_id::text,
    jsonb_build_object('document_id',v_doc,'adjustment_lines',jsonb_array_length(v_lines),
      'total_variance', (select coalesce(sum(variance),0) from public.stock_count_lines where company_id=p_company_id and session_id=p_session_id)));
  return jsonb_build_object('ok',true,'duplicate',false,'status','posted','document_id',v_doc,'adjustment_lines',jsonb_array_length(v_lines));
end;
$$;

create or replace function private.stock_count_cancel_impl(p_company_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid; v_session public.stock_count_sessions%rowtype;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  select * into v_session from public.stock_count_sessions where company_id=p_company_id and id=p_session_id for update;
  if not found or v_session.status not in ('counting','submitted') then
    raise exception 'Seul un inventaire en cours peut être annulé.' using errcode='55000';
  end if;
  update public.stock_count_sessions set status='cancelled',cancelled_at=now()
  where company_id=p_company_id and id=p_session_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.count_cancelled','stock_count_session',p_session_id::text,
    jsonb_build_object('previous_status',v_session.status));
  return jsonb_build_object('ok',true,'status','cancelled');
end;
$$;

create or replace function public.stock_count_create(p_company_id uuid,p_warehouse_id uuid,p_reference text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.stock_count_create_impl(p_company_id,p_warehouse_id,p_reference) $$;
create or replace function public.stock_count_set_line(p_company_id uuid,p_session_id uuid,p_line_id uuid,p_counted_quantity numeric)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.stock_count_set_line_impl(p_company_id,p_session_id,p_line_id,p_counted_quantity) $$;
create or replace function public.stock_count_submit(p_company_id uuid,p_session_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.stock_count_submit_impl(p_company_id,p_session_id) $$;
create or replace function public.stock_count_finalize(p_company_id uuid,p_session_id uuid,p_operation_uid uuid,p_document_date date)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.stock_count_finalize_impl(p_company_id,p_session_id,p_operation_uid,p_document_date) $$;
create or replace function public.stock_count_cancel(p_company_id uuid,p_session_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.stock_count_cancel_impl(p_company_id,p_session_id) $$;

grant usage on schema private to authenticated;
revoke all on function private.stock_count_create_impl(uuid,uuid,text) from public,anon;
revoke all on function private.stock_count_set_line_impl(uuid,uuid,uuid,numeric) from public,anon;
revoke all on function private.stock_count_submit_impl(uuid,uuid) from public,anon;
revoke all on function private.stock_count_finalize_impl(uuid,uuid,uuid,date) from public,anon;
revoke all on function private.stock_count_cancel_impl(uuid,uuid) from public,anon;
grant execute on function private.stock_count_create_impl(uuid,uuid,text) to authenticated;
grant execute on function private.stock_count_set_line_impl(uuid,uuid,uuid,numeric) to authenticated;
grant execute on function private.stock_count_submit_impl(uuid,uuid) to authenticated;
grant execute on function private.stock_count_finalize_impl(uuid,uuid,uuid,date) to authenticated;
grant execute on function private.stock_count_cancel_impl(uuid,uuid) to authenticated;

revoke all on function public.stock_count_create(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.stock_count_set_line(uuid,uuid,uuid,numeric) from public,anon,authenticated;
revoke all on function public.stock_count_submit(uuid,uuid) from public,anon,authenticated;
revoke all on function public.stock_count_finalize(uuid,uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.stock_count_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.stock_count_create(uuid,uuid,text) to authenticated;
grant execute on function public.stock_count_set_line(uuid,uuid,uuid,numeric) to authenticated;
grant execute on function public.stock_count_submit(uuid,uuid) to authenticated;
grant execute on function public.stock_count_finalize(uuid,uuid,uuid,date) to authenticated;
grant execute on function public.stock_count_cancel(uuid,uuid) to authenticated;

commit;