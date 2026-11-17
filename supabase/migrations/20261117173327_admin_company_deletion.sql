-- Suppression contrôlée d'une entreprise MIZANE.
-- Fonction appelable uniquement par le serveur de confiance (service_role).
begin;
create or replace function public.mizane_delete_company(
  p_company_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text;
begin
  if p_company_id is null or p_actor_user_id is null then
    raise exception 'Paramètres de suppression invalides.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id
      and m.role = 'admin' and m.status = 'active'
  ) then
    raise exception 'Seul un administrateur actif peut supprimer cette entreprise.' using errcode = '42501';
  end if;
  select c.legal_name into v_company_name from public.companies c
  where c.id = p_company_id for update;
  if v_company_name is null then
    raise exception 'Entreprise introuvable.' using errcode = 'P0002';
  end if;
  delete from public.companies where id = p_company_id;
  return jsonb_build_object('deleted', true, 'company_name', v_company_name);
end;
$$;
revoke all on function public.mizane_delete_company(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mizane_delete_company(uuid, uuid) to service_role;
commit;