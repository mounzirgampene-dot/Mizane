-- MIZANE — Coffre privé des justificatifs comptables liés aux écritures.
begin;
create table if not exists public.accounting_documents (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 file_name text not null check(length(btrim(file_name)) between 1 and 240),
 mime_type text not null check(mime_type in('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 20971520 and (mime_type='application/pdf' or file_size<=15728640)),
 storage_path text not null unique check(storage_path !~ '(^|/)\.\.(/|$)'),
 uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint accounting_documents_company_id_unique unique(company_id,id),
 constraint accounting_documents_storage_path check(storage_path like company_id::text || '/' || id::text || '/%')
);
create index if not exists accounting_documents_company_created_idx on public.accounting_documents(company_id,created_at desc);
create index if not exists accounting_documents_uploaded_by_idx on public.accounting_documents(uploaded_by);
create table if not exists public.accounting_document_entry_links (
 company_id uuid not null,
 document_id uuid not null,
 entry_id uuid not null,
 uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(company_id,document_id,entry_id),
 constraint accounting_document_links_document_fk foreign key(company_id,document_id) references public.accounting_documents(company_id,id) on delete cascade,
 constraint accounting_document_links_entry_fk foreign key(company_id,entry_id) references public.accounting_entries(company_id,id) on delete cascade
);
create index if not exists accounting_document_links_entry_idx on public.accounting_document_entry_links(company_id,entry_id);
create index if not exists accounting_document_links_uploaded_by_idx on public.accounting_document_entry_links(uploaded_by);
alter table public.accounting_documents enable row level security;
alter table public.accounting_documents force row level security;
alter table public.accounting_document_entry_links enable row level security;
alter table public.accounting_document_entry_links force row level security;
create policy accounting_documents_select_members on public.accounting_documents for select to authenticated using(private.is_active_company_member(company_id));
create policy accounting_documents_insert_finance_roles on public.accounting_documents for insert to authenticated with check(uploaded_by=(select auth.uid()) and private.has_company_role(company_id,array['admin','accountant']::public.company_role[]));
create policy accounting_documents_delete_finance_roles on public.accounting_documents for delete to authenticated using(private.has_company_role(company_id,array['admin','accountant']::public.company_role[]));
create policy accounting_document_links_select_members on public.accounting_document_entry_links for select to authenticated using(private.is_active_company_member(company_id));
create policy accounting_document_links_insert_finance_roles on public.accounting_document_entry_links for insert to authenticated with check(uploaded_by=(select auth.uid()) and private.has_company_role(company_id,array['admin','accountant']::public.company_role[]));
create policy accounting_document_links_delete_finance_roles on public.accounting_document_entry_links for delete to authenticated using(private.has_company_role(company_id,array['admin','accountant']::public.company_role[]));
grant select,insert,delete on public.accounting_documents to authenticated;
grant select,insert,delete on public.accounting_document_entry_links to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('accounting-evidence','accounting-evidence',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy accounting_evidence_select_company_members on storage.objects for select to authenticated using(
 bucket_id='accounting-evidence' and private.is_active_company_member(
 case when(storage.foldername(name))[1]~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then((storage.foldername(name))[1])::uuid else null end));
create policy accounting_evidence_insert_finance_roles on storage.objects for insert to authenticated with check(
 bucket_id='accounting-evidence' and private.has_company_role(
 case when(storage.foldername(name))[1]~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then((storage.foldername(name))[1])::uuid else null end,
 array['admin','accountant']::public.company_role[]));
create policy accounting_evidence_delete_finance_roles on storage.objects for delete to authenticated using(
 bucket_id='accounting-evidence' and private.has_company_role(
 case when(storage.foldername(name))[1]~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then((storage.foldername(name))[1])::uuid else null end,
 array['admin','accountant']::public.company_role[]));
comment on table public.accounting_documents is 'Métadonnées des pièces comptables conservées dans le bucket privé accounting-evidence.';
comment on table public.accounting_document_entry_links is 'Association des pièces justificatives aux écritures comptables d’une même entreprise.';
commit;
