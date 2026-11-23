begin;
create index if not exists stock_count_lines_company_product_idx on public.stock_count_lines(company_id,product_id);
create index if not exists stock_count_lines_counted_by_idx on public.stock_count_lines(counted_by);
create index if not exists stock_count_sessions_approved_by_idx on public.stock_count_sessions(approved_by);
create index if not exists stock_count_sessions_company_document_idx on public.stock_count_sessions(company_id,posted_document_id);
create index if not exists stock_count_sessions_created_by_idx on public.stock_count_sessions(created_by);
create index if not exists stock_count_sessions_submitted_by_idx on public.stock_count_sessions(submitted_by);
commit;