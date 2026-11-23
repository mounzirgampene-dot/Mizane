-- MIZANE — Index de clés étrangères du moteur de stock.
create index if not exists stock_audit_logs_actor_user_id_idx on public.stock_audit_logs(actor_user_id);
create index if not exists stock_audit_logs_company_id_idx on public.stock_audit_logs(company_id);
create index if not exists stock_balances_company_warehouse_idx on public.stock_balances(company_id,warehouse_id);
create index if not exists stock_document_lines_company_destination_warehouse_idx on public.stock_document_lines(company_id,destination_warehouse_id);
create index if not exists stock_document_lines_company_product_idx on public.stock_document_lines(company_id,product_id);
create index if not exists stock_document_lines_company_warehouse_idx on public.stock_document_lines(company_id,warehouse_id);
create index if not exists stock_documents_company_reversed_by_idx on public.stock_documents(company_id,reversed_by_document_id);
create index if not exists stock_documents_created_by_idx on public.stock_documents(created_by);
create index if not exists stock_movements_company_line_idx on public.stock_movements(company_id,line_id);
create index if not exists stock_movements_company_warehouse_idx on public.stock_movements(company_id,warehouse_id);
create index if not exists stock_reservations_company_warehouse_idx on public.stock_reservations(company_id,warehouse_id);
create index if not exists stock_reservations_created_by_idx on public.stock_reservations(created_by);
create index if not exists stock_settings_updated_by_idx on public.stock_settings(updated_by);
create index if not exists stock_valuation_allocations_company_layer_idx on public.stock_valuation_allocations(company_id,layer_id);
create index if not exists stock_valuation_allocations_company_movement_idx on public.stock_valuation_allocations(company_id,movement_id);
create index if not exists stock_valuation_layers_company_source_movement_idx on public.stock_valuation_layers(company_id,source_movement_id);
create index if not exists stock_valuation_layers_company_warehouse_idx on public.stock_valuation_layers(company_id,warehouse_id);
