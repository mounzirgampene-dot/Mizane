-- Indexes supporting the user foreign keys on accounting period audit actors.
-- Safe additive indexes; no existing accounting rows are modified.
CREATE INDEX IF NOT EXISTS accounting_periods_closed_by_idx
  ON public.accounting_periods (closed_by);

CREATE INDEX IF NOT EXISTS accounting_periods_reopened_by_idx
  ON public.accounting_periods (reopened_by);
