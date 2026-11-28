-- MIZANE — Indexes et politiques de lecture du catalogue de stock.
begin;

create index if not exists stock_products_company_family_idx
  on public.stock_products(company_id,family_id);
create index if not exists stock_products_company_type_idx
  on public.stock_products(company_id,product_type_id);

drop policy if exists stock_product_families_member_read on public.stock_product_families;
create policy stock_product_families_member_read
  on public.stock_product_families
  for select to authenticated
  using (private.is_active_company_member(company_id));

drop policy if exists stock_product_types_member_read on public.stock_product_types;
create policy stock_product_types_member_read
  on public.stock_product_types
  for select to authenticated
  using (private.is_active_company_member(company_id));

commit;