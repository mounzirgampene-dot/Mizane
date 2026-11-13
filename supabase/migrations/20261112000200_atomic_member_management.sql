-- MIZANE: opérations atomiques sur les appartenances.
-- Le verrou par entreprise empêche deux administrateurs de retirer simultanément
-- les deux derniers administrateurs actifs.
begin;

create or replace function public.manage_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_action text,
  p_role public.company_role default null,
  p_status public.membership_status default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.company_memberships%rowtype;
  v_admin_count integer;
begin
  if p_action not in ('set_role', 'set_status', 'remove') then
    raise exception 'Action invalide.' using errcode = '22023';
  end if;

  if p_action = 'set_role' and p_role is null then
    raise exception 'Rôle requis.' using errcode = '22023';
  end if;
  if p_action = 'set_status' and p_status is null then
    raise exception 'Statut requis.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 0)
  );

  select * into v_member
  from public.company_memberships
  where company_id = p_company_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Membre introuvable.' using errcode = 'P0002';
  end if;

  if v_member.role = 'admin' and v_member.status = 'active' and (
    p_action = 'remove'
    or (p_action = 'set_status' and p_status = 'suspended')
    or (p_action = 'set_role' and p_role <> 'admin')
  ) then
    select count(*) into v_admin_count
    from public.company_memberships
    where company_id = p_company_id and role = 'admin' and status = 'active';

    if v_admin_count <= 1 then
      raise exception 'Impossible de retirer, suspendre ou rétrograder le dernier administrateur actif.'
        using errcode = '23514';
    end if;
  end if;

  if p_action = 'set_role' then
    update public.company_memberships
    set role = p_role, updated_at = pg_catalog.now()
    where company_id = p_company_id and user_id = p_user_id;
  elsif p_action = 'set_status' then
    update public.company_memberships
    set status = p_status, updated_at = pg_catalog.now()
    where company_id = p_company_id and user_id = p_user_id;
  else
    delete from public.company_memberships
    where company_id = p_company_id and user_id = p_user_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'previous_role', v_member.role,
    'previous_status', v_member.status,
    'action', p_action
  );
end;
$$;

-- Le profil est créé uniquement par le déclencheur Auth, jamais par un appel RPC direct.
revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated, service_role;

revoke all on function public.manage_company_member(uuid, uuid, text, public.company_role, public.membership_status)
  from public, anon, authenticated;
grant execute on function public.manage_company_member(uuid, uuid, text, public.company_role, public.membership_status)
  to service_role;

commit;
