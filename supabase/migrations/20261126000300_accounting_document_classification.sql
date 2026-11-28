-- MIZANE — Classement, indexation et recherche du coffre documentaire.
begin;
alter table public.accounting_documents
  add column if not exists document_type text not null default 'other',
  add column if not exists document_date date,
  add column if not exists counterparty text,
  add column if not exists document_reference text,
  add column if not exists journal_code text,
  add column if not exists notes text;
alter table public.accounting_documents
  drop constraint if exists accounting_documents_document_type_check;
alter table public.accounting_documents
  add constraint accounting_documents_document_type_check
  check (document_type in ('supplier_invoice','customer_invoice','receipt','bank_statement','tax_document','contract','other'));
alter table public.accounting_documents
  add constraint accounting_documents_counterparty_length
  check (counterparty is null or length(counterparty) <= 160);
alter table public.accounting_documents
  add constraint accounting_documents_reference_length
  check (document_reference is null or length(document_reference) <= 120);
alter table public.accounting_documents
  add constraint accounting_documents_journal_length
  check (journal_code is null or length(journal_code) <= 12);
alter table public.accounting_documents
  add constraint accounting_documents_notes_length
  check (notes is null or length(notes) <= 500);
create index if not exists accounting_documents_company_type_date_idx
  on public.accounting_documents(company_id, document_type, document_date desc);
create index if not exists accounting_documents_company_counterparty_idx
  on public.accounting_documents(company_id, lower(counterparty));
create index if not exists accounting_documents_company_reference_idx
  on public.accounting_documents(company_id, lower(document_reference));
comment on column public.accounting_documents.document_type is 'Classement documentaire saisi ou vérifié par un utilisateur ; other par défaut.';
comment on column public.accounting_documents.document_date is 'Date portée sur le justificatif, distincte de la date de dépôt.';
comment on column public.accounting_documents.counterparty is 'Fournisseur, client ou tiers indiqué sur le justificatif.';
comment on column public.accounting_documents.document_reference is 'Référence externe portée sur le justificatif.';
comment on column public.accounting_documents.journal_code is 'Journal comptable associé, à titre de classement.';
comment on column public.accounting_documents.notes is 'Note de classement non comptable.';
commit;
