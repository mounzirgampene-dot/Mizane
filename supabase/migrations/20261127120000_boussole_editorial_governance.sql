-- MIZANE — Gouvernance éditoriale de la Boussole.
-- Les rôles sont attribués uniquement par une opération d'administration contrôlée.
-- Aucun rôle n'est préattribué ; aucun accès direct n'est accordé aux clients.
begin;

create table public.boussole_editor_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null check (scope_type in ('global','company')),
  company_id uuid references public.companies(id) on delete cascade,
  role text not null check (role in ('author','reviewer','publisher','admin')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint boussole_editor_role_scope_check check (
    (scope_type='global' and company_id is null) or
    (scope_type='company' and company_id is not null)
  )
);
create unique index boussole_editor_roles_active_uidx
  on public.boussole_editor_roles(user_id,scope_type,company_id,role)
  nulls not distinct where revoked_at is null;
create index boussole_editor_roles_scope_idx
  on public.boussole_editor_roles(scope_type,company_id,role)
  where revoked_at is null;

create table public.boussole_editor_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  document_id uuid references public.boussole_documents(id) on delete set null,
  version_id uuid references public.boussole_document_versions(id) on delete set null,
  action text not null check (action in (
    'draft_created','draft_updated','version_created','review_submitted',
    'changes_requested','version_approved','version_published','document_archived',
    'document_restored'
  )),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);
create index boussole_editor_audit_document_idx
  on public.boussole_editor_audit(document_id,created_at desc);
create index boussole_editor_audit_company_idx
  on public.boussole_editor_audit(company_id,created_at desc);

alter table public.boussole_editor_roles enable row level security;
alter table public.boussole_editor_roles force row level security;
alter table public.boussole_editor_audit enable row level security;
alter table public.boussole_editor_audit force row level security;

revoke all on public.boussole_editor_roles,public.boussole_editor_audit
  from public,anon,authenticated;
grant select on public.boussole_editor_roles to service_role;
grant select on public.boussole_editor_audit to service_role;

create or replace function public.boussole_editor_transition(
  p_actor_id uuid,
  p_action text,
  p_document_id uuid default null,
  p_version_id uuid default null,
  p_visibility text default 'global',
  p_company_id uuid default null,
  p_slug text default null,
  p_module_key text default null,
  p_feature_key text default null,
  p_locale text default null,
  p_title text default null,
  p_summary text default null,
  p_content_markdown text default null,
  p_structured_content jsonb default '{}'::jsonb,
  p_source_references jsonb default '[]'::jsonb,
  p_learning_level text default null,
  p_estimated_minutes integer default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.boussole_documents%rowtype;
  v_version public.boussole_document_versions%rowtype;
  v_scope_type text;
  v_scope_company uuid;
  v_required_role text;
  v_allowed boolean := false;
  v_next_version integer;
  v_other_locale_count integer;
  v_company_id uuid;
begin
  if p_actor_id is null or not exists (select 1 from auth.users u where u.id=p_actor_id) then
    raise exception 'Utilisateur invalide.' using errcode='42501';
  end if;
  if p_action not in (
    'create_draft','update_draft','create_locale_version','submit_review',
    'request_changes','approve','publish','archive','restore'
  ) then
    raise exception 'Action éditoriale inconnue.' using errcode='22023';
  end if;

  if p_action='create_draft' then
    if p_visibility not in ('global','company')
      or (p_visibility='global' and p_company_id is not null)
      or (p_visibility='company' and p_company_id is null)
      or p_locale not in ('fr','ar')
      or p_slug is null or length(btrim(p_slug)) not between 1 and 180
      or p_title is null or length(btrim(p_title)) not between 1 and 240
      or jsonb_typeof(p_structured_content)<>'object'
      or jsonb_typeof(p_source_references)<>'array' then
      raise exception 'Données de brouillon invalides.' using errcode='22023';
    end if;
    v_scope_type := case when p_visibility='global' then 'global' else 'company' end;
    v_scope_company := p_company_id;
    v_company_id := p_company_id;
    v_required_role := 'author';
    if p_company_id is not null and not exists (
      select 1 from public.company_memberships m
      where m.company_id=p_company_id and m.user_id=p_actor_id and m.status='active'
    ) then
      raise exception 'Adhésion active à l’entreprise requise.' using errcode='42501';
    end if;
    select exists (
      select 1 from public.boussole_editor_roles r
      where r.user_id=p_actor_id and r.scope_type=v_scope_type
        and r.company_id is not distinct from v_scope_company
        and r.revoked_at is null and r.role in ('author','admin')
    ) into v_allowed;
    if not v_allowed then raise exception 'Droit de rédaction absent.' using errcode='42501'; end if;

    insert into public.boussole_documents(
      slug,module_key,feature_key,visibility,company_id,status,created_by,updated_by
    ) values (
      btrim(p_slug),nullif(btrim(coalesce(p_module_key,'')),''),nullif(btrim(coalesce(p_feature_key,'')),''),
      p_visibility,p_company_id,'draft',p_actor_id,p_actor_id
    ) returning * into v_document;

    insert into public.boussole_document_versions(
      document_id,version_number,locale,title,summary,content_markdown,
      structured_content,source_references,learning_level,estimated_minutes,status,created_by
    ) values (
      v_document.id,1,p_locale,btrim(p_title),coalesce(p_summary,''),
      coalesce(p_content_markdown,''),coalesce(p_structured_content,'{}'::jsonb),
      coalesce(p_source_references,'[]'::jsonb),p_learning_level,p_estimated_minutes,'draft',p_actor_id
    ) returning * into v_version;

    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action)
    values(p_actor_id,v_company_id,v_document.id,v_version.id,'draft_created');
    return jsonb_build_object('document_id',v_document.id,'version_id',v_version.id,'version_number',1,'status','draft');
  end if;

  if p_document_id is null then raise exception 'Document requis.' using errcode='22023'; end if;
  select * into v_document from public.boussole_documents d
    where d.id=p_document_id for update;
  if not found then raise exception 'Document introuvable.' using errcode='P0002'; end if;
  v_scope_type := case when v_document.visibility='global' then 'global' else 'company' end;
  v_scope_company := v_document.company_id;
  v_company_id := v_document.company_id;

  if v_document.company_id is not null and not exists (
    select 1 from public.company_memberships m
    where m.company_id=v_document.company_id and m.user_id=p_actor_id and m.status='active'
  ) then
    raise exception 'Adhésion active à l’entreprise requise.' using errcode='42501';
  end if;

  if p_action in ('update_draft','create_locale_version','submit_review') then
    v_required_role := 'author';
  elsif p_action in ('request_changes','approve') then
    v_required_role := 'reviewer';
  else
    v_required_role := 'publisher';
  end if;
  select exists (
    select 1 from public.boussole_editor_roles r
    where r.user_id=p_actor_id and r.scope_type=v_scope_type
      and r.company_id is not distinct from v_scope_company
      and r.revoked_at is null and r.role in (v_required_role,'admin')
  ) into v_allowed;
  if not v_allowed then raise exception 'Droit éditorial insuffisant.' using errcode='42501'; end if;

  if p_action='update_draft' then
    if p_version_id is null or p_title is null
      or length(btrim(p_title)) not between 1 and 240
      or jsonb_typeof(p_structured_content)<>'object'
      or jsonb_typeof(p_source_references)<>'array' then
      raise exception 'Version ou contenu invalide.' using errcode='22023';
    end if;
    select * into v_version from public.boussole_document_versions v
      where v.id=p_version_id and v.document_id=v_document.id for update;
    if not found or v_version.status<>'draft' or v_version.created_by is distinct from p_actor_id then
      raise exception 'Seul l’auteur peut modifier son brouillon.' using errcode='42501';
    end if;
    update public.boussole_document_versions set
      title=btrim(p_title),summary=coalesce(p_summary,''),content_markdown=coalesce(p_content_markdown,''),
      structured_content=coalesce(p_structured_content,'{}'::jsonb),
      source_references=coalesce(p_source_references,'[]'::jsonb),
      learning_level=p_learning_level,estimated_minutes=p_estimated_minutes
    where id=v_version.id;
    update public.boussole_documents set updated_by=p_actor_id,updated_at=now() where id=v_document.id;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action)
    values(p_actor_id,v_company_id,v_document.id,v_version.id,'draft_updated');
    return jsonb_build_object('document_id',v_document.id,'version_id',v_version.id,'status','draft');
  elsif p_action='create_locale_version' then
    if p_locale not in ('fr','ar') or p_title is null
      or length(btrim(p_title)) not between 1 and 240
      or jsonb_typeof(p_structured_content)<>'object'
      or jsonb_typeof(p_source_references)<>'array' then
      raise exception 'Traduction invalide.' using errcode='22023';
    end if;
    select coalesce(max(v.version_number),0) into v_next_version
      from public.boussole_document_versions v where v.document_id=v_document.id;
    if v_next_version=0 then v_next_version:=1;
    elsif exists (
      select 1 from public.boussole_document_versions v
      where v.document_id=v_document.id and v.version_number=v_next_version and v.locale=p_locale
    ) then v_next_version:=v_next_version+1;
    end if;
    insert into public.boussole_document_versions(
      document_id,version_number,locale,title,summary,content_markdown,
      structured_content,source_references,learning_level,estimated_minutes,status,created_by
    ) values (
      v_document.id,v_next_version,p_locale,btrim(p_title),coalesce(p_summary,''),
      coalesce(p_content_markdown,''),coalesce(p_structured_content,'{}'::jsonb),
      coalesce(p_source_references,'[]'::jsonb),p_learning_level,p_estimated_minutes,'draft',p_actor_id
    ) returning * into v_version;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action,metadata)
    values(p_actor_id,v_company_id,v_document.id,v_version.id,'version_created',jsonb_build_object('locale',p_locale,'version_number',v_next_version));
    return jsonb_build_object('document_id',v_document.id,'version_id',v_version.id,'version_number',v_next_version,'status','draft');
  elsif p_action='submit_review' then
    if p_version_id is null then raise exception 'Version requise.' using errcode='22023'; end if;
    update public.boussole_document_versions set status='review'
      where id=p_version_id and document_id=v_document.id and status='draft' and created_by=p_actor_id
      returning * into v_version;
    if not found then raise exception 'Brouillon non modifiable ou non attribué à cet auteur.' using errcode='42501'; end if;
    update public.boussole_documents set status=case when current_published_version is null then 'review' else status end,updated_by=p_actor_id,updated_at=now() where id=v_document.id;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action)
    values(p_actor_id,v_company_id,v_document.id,v_version.id,'review_submitted');
    return jsonb_build_object('document_id',v_document.id,'version_id',v_version.id,'status','review');
  elsif p_action in ('request_changes','approve') then
    if p_version_id is null then raise exception 'Version requise.' using errcode='22023'; end if;
    if p_action='request_changes' then
      update public.boussole_document_versions set status='draft',reviewed_by=p_actor_id,reviewed_at=now()
        where id=p_version_id and document_id=v_document.id and status='review'
        returning * into v_version;
      if not found then raise exception 'Version non disponible pour relecture.' using errcode='42501'; end if;
      insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action,metadata)
      values(p_actor_id,v_company_id,v_document.id,v_version.id,'changes_requested',jsonb_build_object('note',left(coalesce(p_review_note,''),1000)));
      return jsonb_build_object('document_id',v_document.id,'version_id',v_version.id,'status','draft');
    else
      update public.boussole_document_versions set status='approved',reviewed_by=p_actor_id,reviewed_at=now(),approved_by=p_actor_id,approved_at=now()
        where id=p_version_id and document_id=v_document.id and status='review'
        returning * into v_version;
      if not found then raise exception 'Version non disponible pour approbation.' using errcode='42501'; end if;
      insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action)
      values(p_actor_id,v_company_id,v_document.id,v_version.id,'version_approved');
      return jsonb_build_object('document_id',v_document.id,'version_id',v_version.id,'status','approved');
    end if;
  elsif p_action='publish' then
    if p_version_id is null then raise exception 'Version requise.' using errcode='22023'; end if;
    select * into v_version from public.boussole_document_versions v
      where v.id=p_version_id and v.document_id=v_document.id for update;
    if not found or v_version.status<>'approved' then
      raise exception 'Seule une version approuvée peut être publiée.' using errcode='42501';
    end if;
    select count(distinct v.locale) into v_other_locale_count
      from public.boussole_document_versions v
      where v.document_id=v_document.id and v.version_number=v_version.version_number
        and v.locale in ('fr','ar') and v.status='approved'\n        and v.created_by is distinct from p_actor_id\n        and v.approved_by is distinct from p_actor_id;
    if v_other_locale_count<>2 then
      raise exception 'Les versions française et arabe doivent être approuvées avant publication.' using errcode='42501';
    end if;
    update public.boussole_document_versions set status='published',published_at=now()
      where document_id=v_document.id and version_number=v_version.version_number
        and locale in ('fr','ar') and status='approved';
    update public.boussole_documents set
      status='published',current_published_version=v_version.version_number,
      published_at=now(),updated_by=p_actor_id,updated_at=now()
    where id=v_document.id;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action,metadata)
    values(p_actor_id,v_company_id,v_document.id,v_version.id,'version_published',jsonb_build_object('version_number',v_version.version_number));
    return jsonb_build_object('document_id',v_document.id,'version_number',v_version.version_number,'status','published');
  elsif p_action='archive' then
    if v_document.status<>'published' then raise exception 'Seul un document publié peut être archivé.' using errcode='22023'; end if;
    update public.boussole_documents set status='archived',updated_by=p_actor_id,updated_at=now() where id=v_document.id;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,action)
    values(p_actor_id,v_company_id,v_document.id,'document_archived');
    return jsonb_build_object('document_id',v_document.id,'status','archived');
  elsif p_action='restore' then
    if v_document.status<>'archived' or v_document.current_published_version is null then
      raise exception 'Document non restaurable.' using errcode='22023';
    end if;
    update public.boussole_documents set status='published',published_at=now(),updated_by=p_actor_id,updated_at=now()
      where id=v_document.id;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,action)
    values(p_actor_id,v_company_id,v_document.id,'document_restored');
    return jsonb_build_object('document_id',v_document.id,'status','published');
  end if;

  raise exception 'Transition non prise en charge.' using errcode='22023';
end;
$$;

revoke all on function public.boussole_editor_transition(
  uuid,text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,jsonb,jsonb,text,integer,text
) from public,anon,authenticated;
grant execute on function public.boussole_editor_transition(
  uuid,text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,jsonb,jsonb,text,integer,text
) to service_role;

commit;
