-- Indexes for user references in the shared tax evidence registry.
begin;
create index if not exists company_tax_documents_uploaded_by_idx on public.company_tax_documents(uploaded_by);
create index if not exists company_tax_documents_verified_by_idx on public.company_tax_documents(verified_by);
commit;
