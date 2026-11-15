-- Add covering indexes for foreign-key columns identified by Supabase Performance Advisor.
-- These indexes improve joins and parent-row update/delete checks without changing data.

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);

create index if not exists companies_created_by_idx
  on public.companies (created_by);

create index if not exists company_invitations_invited_by_idx
  on public.company_invitations (invited_by);
