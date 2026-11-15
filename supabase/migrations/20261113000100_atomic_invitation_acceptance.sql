-- Accept an invitation atomically with membership status changes.
-- The function is callable only by the trusted Edge Function service role.
CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_invitation public.company_invitations%rowtype;
  v_membership public.company_memberships%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_user_id is null
     or p_email is null
     or length(pg_catalog.btrim(p_email)) = 0 then
    raise exception 'Paramètres d’invitation invalides.' using errcode = '22023';
  end if;

  -- Initial lookup determines which company-scoped advisory lock to acquire.
  select * into v_invitation
  from public.company_invitations
  where token_hash = p_token_hash;

  if not found then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;

  -- Share the same company lock as manage_company_member to serialize
  -- invitation acceptance against suspension and membership changes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_invitation.company_id::text, 0)
  );

  -- Re-read and lock the invitation after acquiring the company lock.
  select * into v_invitation
  from public.company_invitations
  where token_hash = p_token_hash
  for update;

  if not found
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Invitation invalide, expirée ou révoquée.' using errcode = 'P0002';
  end if;

  if pg_catalog.lower(pg_catalog.btrim(v_invitation.email))
     <> pg_catalog.lower(pg_catalog.btrim(p_email)) then
    raise exception 'Cette invitation est destinée à une autre adresse.' using errcode = '22023';
  end if;

  select * into v_membership
  from public.company_memberships
  where company_id = v_invitation.company_id
    and user_id = p_user_id
  for update;

  if found then
    if v_membership.status = 'suspended' then
      raise exception 'Accès suspendu par un administrateur.' using errcode = '42501';
    end if;
    if v_membership.status = 'active' then
      raise exception 'Utilisateur déjà membre de cette entreprise.' using errcode = '23505';
    end if;
  end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v_invitation.company_id, p_user_id, v_invitation.role, 'active');

  update public.company_invitations
  set accepted_at = pg_catalog.clock_timestamp()
  where id = v_invitation.id;

  insert into public.audit_logs (
    company_id, actor_user_id, action, entity_type, entity_id, details
  ) values (
    v_invitation.company_id, p_user_id, 'invitation.accepted',
    'company_membership', p_user_id::text,
    pg_catalog.jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role)
  );

  return pg_catalog.jsonb_build_object(
    'accepted', true,
    'company_id', v_invitation.company_id,
    'role', v_invitation.role
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.accept_company_invitation(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text)
  TO service_role;
