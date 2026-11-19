-- Autorise les administrateurs et comptables actifs à consulter le journal de leur entreprise.
-- Les lecteurs restent exclus ; aucune écriture directe dans audit_logs n'est accordée.
drop policy if exists audit_select_admin on public.audit_logs;

create policy audit_select_admin_accountant
  on public.audit_logs
  for select
  to authenticated
  using (
    (select private.has_company_role(
      company_id,
      array['admin', 'accountant']::public.company_role[]
    ))
  );
