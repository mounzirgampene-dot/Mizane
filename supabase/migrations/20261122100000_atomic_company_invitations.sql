-- MIZANE: création atomique des invitations collaborateurs.
-- Le verrou par entreprise est partagé avec l'acceptation et la gestion des membres.
begin;

create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_invited_by uuid,
  p_email text,
  p_role public.company_role,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation public.company_invitations%rowtype;
  v_email text;
begin
  v_email := pg_catalog.lower(pg_catalog.btrim(p_email));

  if p_company_id is null
     or p_invited_by is null
     or v_email is null
     or length(v_email) < 3
     or length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_role is null
     or p_role not in ('accountant', 'reader')
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= pg_catalog.clock_timestamp()
     or p_expires_at > pg_catalog.clock_timestamp() + interval '8 days' then
    raise exception 'Paramètres d’invitation invalides.' using errcode = '22023';
  end if;

  -- Sérialise les créations avec les acceptations et les changements de membres.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 0)
  );

  if not exists (
    select 1
    from public.company_memberships
    where company_id = p_company_id
      and user_id = p_invited_by
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception 'Seul un administrateur actif peut inviter un collaborateur.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.company_invitations
    where company_id = p_company_id
      and pg_catalog.lower(pg_catalog.btrim(email)) = v_email
      and accepted_at is null
      and revoked_at is null
      and expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception 'Une invitation active existe déjà pour cette adresse.'
      using errcode = 'P0001';
  end if;

  insert into public.company_invitations (
    company_id, email, role, token_hash, invited_by, expires_at
  ) values (
    p_company_id, v_email, p_role, p_token_hash, p_invited_by, p_expires_at
  )
  returning * into v_invitation;

  return pg_catalog.jsonb_build_object(
    'id', v_invitation.id,
    'email', v_invitation.email,
    'role', v_invitation.role,
    'expires_at', v_invitation.expires_at
  );
end;
$function$;

revoke all on function public.create_company_invitation(uuid, uuid, text, public.company_role, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_company_invitation(uuid, uuid, text, public.company_role, text, timestamptz)
  to service_role;

commit;
