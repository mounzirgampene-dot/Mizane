-- MIZANE — Valorisation historique exhaustive pour la clôture en inventaire intermittent.
-- Lecture serveur des mouvements complets : ne jamais extrapoler à partir des 500 mouvements affichés.
begin;

create index if not exists stock_movements_periodic_valuation_idx
  on public.stock_movements(company_id,movement_date,document_id)
  include(product_id,warehouse_id,value_delta,quantity_delta);

create or replace function private.stock_period_valuation_impl(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_mode text;
  v_method text;
  v_opening numeric(20,6);
  v_closing numeric(20,6);
  v_opening_negative integer;
  v_closing_negative integer;
  v_negative_movement_count integer;
  v_active_counts integer;
  v_movement_count bigint;
begin
  v_actor := private.stock_assert_writer(p_company_id);
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Période de valorisation invalide.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));

  select coalesce(s.accounting_mode,'perpetual'),coalesce(s.valuation_method,'cump')
    into v_mode,v_method
  from public.stock_settings s
  where s.company_id=p_company_id;
  if not found then
    v_mode:='perpetual';
    v_method:='cump';
  end if;

  select count(*)::integer into v_negative_movement_count
  from (
    select m.movement_date,
      sum(m.quantity_delta) over (
        partition by m.product_id,m.warehouse_id
        order by m.movement_date,m.id
        rows between unbounded preceding and current row
      ) as running_quantity
    from public.stock_movements m
    join public.stock_documents d
      on d.company_id=m.company_id and d.id=m.document_id and d.status='posted'
    where m.company_id=p_company_id and m.movement_date <= p_end_date
  ) movement_balances
  where movement_date between p_start_date and p_end_date
    and running_quantity < -0.000001;

  select count(*)::integer into v_active_counts
  from public.stock_count_sessions s
  where s.company_id=p_company_id and s.status in ('counting','submitted');

  select coalesce(sum(m.value_delta),0)
    into v_opening
  from public.stock_movements m
  join public.stock_documents d
    on d.company_id=m.company_id and d.id=m.document_id and d.status='posted'
  where m.company_id=p_company_id and m.movement_date < p_start_date;

  select coalesce(sum(m.value_delta),0)
    into v_closing
  from public.stock_movements m
  join public.stock_documents d
    on d.company_id=m.company_id and d.id=m.document_id and d.status='posted'
  where m.company_id=p_company_id and m.movement_date <= p_end_date;

  select count(*)::integer into v_opening_negative
  from (
    select m.product_id,m.warehouse_id,sum(m.quantity_delta) as quantity
    from public.stock_movements m
    join public.stock_documents d
      on d.company_id=m.company_id and d.id=m.document_id and d.status='posted'
    where m.company_id=p_company_id and m.movement_date < p_start_date
    group by m.product_id,m.warehouse_id
    having sum(m.quantity_delta) < -0.000001
  ) negative_positions;

  select count(*)::integer into v_closing_negative
  from (
    select m.product_id,m.warehouse_id,sum(m.quantity_delta) as quantity
    from public.stock_movements m
    join public.stock_documents d
      on d.company_id=m.company_id and d.id=m.document_id and d.status='posted'
    where m.company_id=p_company_id and m.movement_date <= p_end_date
    group by m.product_id,m.warehouse_id
    having sum(m.quantity_delta) < -0.000001
  ) negative_positions;

  select count(*) into v_movement_count
  from public.stock_movements m
  join public.stock_documents d
    on d.company_id=m.company_id and d.id=m.document_id and d.status='posted'
  where m.company_id=p_company_id and m.movement_date between p_start_date and p_end_date;

  return jsonb_build_object(
    'ok',true,
    'accounting_mode',v_mode,
    'valuation_method',v_method,
    'period_start',p_start_date,
    'period_end',p_end_date,
    'opening_value',round(v_opening,2),
    'closing_value',round(v_closing,2),
    'opening_negative_positions',v_opening_negative,
    'closing_negative_positions',v_closing_negative,
    'negative_movements',v_negative_movement_count,
    'active_count_sessions',v_active_counts,
    'movement_count',v_movement_count,
    'source','server'
  );
end;
$$;

comment on function private.stock_period_valuation_impl(uuid,date,date) is 'SECURITY DEFINER reads protected stock ledger tables; every call is restricted to an authenticated active company administrator or accountant by private.stock_assert_writer.';

revoke all on function private.stock_period_valuation_impl(uuid,date,date) from public,anon;
grant execute on function private.stock_period_valuation_impl(uuid,date,date) to authenticated;
grant usage on schema private to authenticated;

create or replace function public.stock_period_valuation(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language sql
security invoker
set search_path = ''
as $
  select private.stock_period_valuation_impl(p_company_id,p_start_date,p_end_date);
$;

revoke all on function public.stock_period_valuation(uuid,date,date) from public,anon;
grant execute on function public.stock_period_valuation(uuid,date,date) to authenticated;

commit;
