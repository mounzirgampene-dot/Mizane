-- Optimise la lecture paginée des écritures par entreprise.
-- L'ordre correspond à read-accounting : entry_date ASC, puis id ASC.
create index if not exists accounting_entries_company_date_id_idx
  on public.accounting_entries (company_id, entry_date asc, id asc);
