-- Add indexes for foreign-key columns used in joins and audit lookups.
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx
  ON public.audit_logs USING btree (actor_user_id);

CREATE INDEX IF NOT EXISTS companies_created_by_idx
  ON public.companies USING btree (created_by);

CREATE INDEX IF NOT EXISTS company_invitations_invited_by_idx
  ON public.company_invitations USING btree (invited_by);
