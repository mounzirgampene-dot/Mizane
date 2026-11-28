-- MIZANE — Coffre documentaire fiscal privé et partagé par entreprise.
begin;
create table if not exists public.company_tax_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  declaration_id text not null check (length(btrim(declaration_id)) between 1 and 180),
  category text not null check (length(btrim(category)) between 1 and 180),
  file_name text not null check (length(btrim(file_name)) between 1 and 240),
  mime_type text not null check (length(btrim(mime_type)) between 1 and 160),
  file_size bigint not null check (file_size between 1 and 15728640),
  reference_date date,
  notes text not null default '' check (length(notes) <= 1000),
  storage_path text not null unique check (storage_path !~ '(^|/)\.\.(/|$)'),
  status text not null default 'pending_review' check (status in ('pending_review','verified')),
  uploaded_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_tax_documents_storage_company_path check (storage_path like company_id::text || '/%'),
  constraint company_tax_documents_verification_consistency check (
    (status = 'pending_review' and verified_by is null and verified_at is null)
    or (status = 'verified' and verified_by is not null and verified_at is not null)
  )
);
create index if not exists company_tax_documents_company_declaration_idx on public.company_tax_documents(company_id,declaration_id,created_at desc);
create index if not exists company_tax_documents_company_status_idx on public.company_tax_documents(company_id,status,created_at desc);
alter table public.company_tax_documents enable row level security;
alter table public.company_tax_documents force row level security;
drop policy if exists company_tax_documents_select_members on public.company_tax_documents;
create policy company_tax_documents_select_members on public.company_tax_documents for select to authenticated using (private.is_active_company_member(company_id));
drop policy if exists company_tax_documents_insert_finance_roles on public.company_tax_documents;
create policy company_tax_documents_insert_finance_roles on public.company_tax_documents for insert to authenticated with check (
 uploaded_by=(select auth.uid()) and status='pending_review' and verified_by is null and verified_at is null
 and private.has_company_role(company_id,array['admin','accountant']::public.company_role[])
);
drop policy if exists company_tax_documents_update_finance_roles on public.company_tax_documents;
create policy company_tax_documents_update_finance_roles on public.company_tax_documents for update to authenticated
 using (private.has_company_role(company_id,array['admin','accountant']::public.company_role[]))
 with check (private.has_company_role(company_id,array['admin','accountant']::public.company_role[])
   and (verified_by is null or verified_by=(select auth.uid()))
   and ((status='pending_review' and verified_by is null and verified_at is null)
     or (status='verified' and verified_by=(select auth.uid()) and verified_at is not null)));
drop policy if exists company_tax_documents_delete_finance_roles on public.company_tax_documents;
create policy company_tax_documents_delete_finance_roles on public.company_tax_documents for delete to authenticated
 using (private.has_company_role(company_id,array['admin','accountant']::public.company_role[]));
grant select,insert,update,delete on public.company_tax_documents to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tax-evidence','tax-evidence',false,15728640,array[
'application/pdf','image/jpeg','image/png','image/webp','application/msword',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists tax_evidence_select_company_members on storage.objects;
create policy tax_evidence_select_company_members on storage.objects for select to authenticated using (
 bucket_id='tax-evidence' and private.is_active_company_member(
  case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then ((storage.foldername(name))[1])::uuid else null end));
drop policy if exists tax_evidence_insert_finance_roles on storage.objects;
create policy tax_evidence_insert_finance_roles on storage.objects for insert to authenticated with check (
 bucket_id='tax-evidence' and private.has_company_role(
  case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then ((storage.foldername(name))[1])::uuid else null end,array['admin','accountant']::public.company_role[]));
drop policy if exists tax_evidence_delete_finance_roles on storage.objects;
create policy tax_evidence_delete_finance_roles on storage.objects for delete to authenticated using (
 bucket_id='tax-evidence' and private.has_company_role(
  case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then ((storage.foldername(name))[1])::uuid else null end,array['admin','accountant']::public.company_role[]));
commit;