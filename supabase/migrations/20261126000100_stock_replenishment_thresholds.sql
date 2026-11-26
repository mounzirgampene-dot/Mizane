-- MIZANE — Seuils de réapprovisionnement des articles.
-- Migration additive : seuils globaux par article, sans modifier les mouvements ni les soldes existants.
begin;

alter table public.stock_products
  add column if not exists minimum_stock numeric(20,6) not null default 0,
  add column if not exists target_stock numeric(20,6) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='stock_products_reorder_thresholds_valid'
      and conrelid='public.stock_products'::regclass
  ) then
    alter table public.stock_products
      add constraint stock_products_reorder_thresholds_valid
      check (minimum_stock >= 0 and target_stock >= minimum_stock);
  end if;
end $$;

create or replace function private.stock_update_reorder_thresholds_impl(
  p_company_id uuid,
  p_product_id uuid,
  p_minimum_stock numeric,
  p_target_stock numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_product public.stock_products%rowtype;
begin
  v_actor := private.stock_assert_writer(p_company_id);

  if p_product_id is null
     or p_minimum_stock is null
     or p_target_stock is null
     or p_minimum_stock::text in ('NaN','Infinity','-Infinity')
     or p_target_stock::text in ('NaN','Infinity','-Infinity')
     or p_minimum_stock < 0
     or p_target_stock < p_minimum_stock
     or p_target_stock >= 1000000000000 then
    raise exception 'Seuil minimum ou stock cible invalide. La cible doit être supérieure ou égale au seuil minimum.'
      using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));

  update public.stock_products
  set minimum_stock=p_minimum_stock,
      target_stock=p_target_stock,
      updated_at=now()
  where company_id=p_company_id and id=p_product_id
  returning * into v_product;

  if not found then
    raise exception 'Article introuvable dans cette entreprise.' using errcode='P0002';
  end if;

  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(
    p_company_id,
    v_actor,
    'stock.reorder_thresholds_updated',
    'product',
    p_product_id::text,
    jsonb_build_object(
      'sku',v_product.sku,
      'minimum_stock',v_product.minimum_stock,
      'target_stock',v_product.target_stock
    )
  );

  return jsonb_build_object(
    'ok',true,
    'product_id',v_product.id,
    'minimum_stock',v_product.minimum_stock,
    'target_stock',v_product.target_stock
  );
end;
$$;

create or replace function public.stock_update_reorder_thresholds(
  p_company_id uuid,
  p_product_id uuid,
  p_minimum_stock numeric,
  p_target_stock numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.stock_update_reorder_thresholds_impl(
    p_company_id,p_product_id,p_minimum_stock,p_target_stock
  )
$$;

revoke all on function private.stock_update_reorder_thresholds_impl(uuid,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function private.stock_update_reorder_thresholds_impl(uuid,uuid,numeric,numeric) to authenticated;
revoke all on function public.stock_update_reorder_thresholds(uuid,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.stock_update_reorder_thresholds(uuid,uuid,numeric,numeric) to authenticated;

commit;
