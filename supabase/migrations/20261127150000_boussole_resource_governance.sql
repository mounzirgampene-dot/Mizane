-- MIZANE — Boussole : administration des synonymes, relations, compatibilité et médias.
-- Migration additive. À livrer après les PR #170 à #174 ; DEV uniquement après revue.
begin;

alter table public.boussole_editor_audit
  drop constraint if exists boussole_editor_audit_action_check;
alter table public.boussole_editor_audit
  add constraint boussole_editor_audit_action_check check (action in (
    'draft_created','draft_updated','version_created','review_submitted',
    'changes_requested','version_approved','version_published','document_archived',
    'document_restored','synonym_created','synonym_updated','synonym_deactivated',
    'relation_created','relation_deleted','media_registered','media_archived',
    'compatibility_updated'
  ));

create unique index if not exists boussole_document_versions_id_document_uidx
  on public.boussole_document_versions(id,document_id);

create table public.boussole_media_assets (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.boussole_documents(id) on delete cascade,
  version_id uuid references public.boussole_document_versions(id) on delete set null,
  storage_bucket text not null default 'boussole-media' check (storage_bucket='boussole-media'),
  storage_path text not null unique check (length(btrim(storage_path)) between 3 and 500),
  file_name text not null check (length(btrim(file_name)) between 1 and 240),
  content_type text not null check (content_type in (
    'image/jpeg','image/png','image/webp','image/avif',
    'video/mp4','video/webm','application/pdf'
  )),
  byte_size bigint not null check (byte_size between 1 and 20971520),
  alt_text jsonb not null default '{}'::jsonb check (jsonb_typeof(alt_text)='object'),
  caption jsonb not null default '{}'::jsonb check (jsonb_typeof(caption)='object'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boussole_media_version_document_fk
    foreign key (version_id,document_id)
    references public.boussole_document_versions(id,document_id)
    deferrable initially immediate
);
create index boussole_media_assets_document_idx
  on public.boussole_media_assets(document_id,is_active,sort_order);
create index boussole_media_assets_version_idx
  on public.boussole_media_assets(version_id) where version_id is not null;

alter table public.boussole_media_assets enable row level security;
alter table public.boussole_media_assets force row level security;
revoke all on public.boussole_media_assets from public,anon,authenticated;
grant select on public.boussole_media_assets to anon,authenticated;

create policy boussole_media_read_global_published
  on public.boussole_media_assets for select to anon,authenticated
  using (
    is_active and exists (
      select 1 from public.boussole_documents d
      where d.id=document_id and d.status='published' and d.visibility='global'
    )
  );
create policy boussole_media_read_company_published
  on public.boussole_media_assets for select to authenticated
  using (
    is_active and exists (
      select 1 from public.boussole_documents d
      where d.id=document_id and d.status='published' and (
        d.visibility='global' or
        (d.visibility='company' and private.is_active_company_member(d.company_id))
      )
    )
  );

-- Bucket privé : les téléchargements et URL signées passent par le service serveur.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'boussole-media','boussole-media',false,20971520,
  array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','application/pdf']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.boussole_editor_manage_resource(
  p_actor_id uuid,
  p_action text,
  p_document_id uuid default null,
  p_target_document_id uuid default null,
  p_resource_id uuid default null,
  p_version_id uuid default null,
  p_locale text default null,
  p_term text default null,
  p_normalized_term text default null,
  p_synonyms text[] default '{}',
  p_relation_type text default null,
  p_sort_order integer default 0,
  p_storage_path text default null,
  p_file_name text default null,
  p_content_type text default null,
  p_byte_size bigint default null,
  p_alt_text jsonb default '{}'::jsonb,
  p_caption jsonb default '{}'::jsonb,
  p_min_app_version text default null,
  p_max_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.boussole_documents%rowtype;
  v_target public.boussole_documents%rowtype;
  v_scope_type text;
  v_allowed boolean := false;
  v_id uuid;
  v_action text;
begin
  if p_actor_id is null or not exists (select 1 from auth.users u where u.id=p_actor_id) then
    raise exception 'Utilisateur invalide.' using errcode='42501';
  end if;
  if p_action is null or p_action not in (
    'synonym_upsert','synonym_deactivate','relation_upsert','relation_delete',
    'media_register','media_archive','compatibility_update'
  ) then
    raise exception 'Action de ressource inconnue.' using errcode='22023';
  end if;

  if p_action in ('synonym_upsert','synonym_deactivate') then
    select exists (
      select 1 from public.boussole_editor_roles r
      where r.user_id=p_actor_id and r.scope_type='global' and r.company_id is null
        and r.revoked_at is null and r.role in ('publisher','admin')
    ) into v_allowed;
    if not v_allowed then raise exception 'Droit global de publication requis.' using errcode='42501'; end if;

    if p_action='synonym_upsert' then
      if p_locale is null or p_locale not in ('fr','ar','en')
        or p_term is null or length(btrim(p_term)) not between 1 and 180
        or p_normalized_term is null or length(btrim(p_normalized_term)) not between 1 and 180
        or coalesce(array_length(p_synonyms,1),0)>30
        or exists (select 1 from unnest(coalesce(p_synonyms,'{}'::text[])) s where length(btrim(s)) not between 1 and 180) then
        raise exception 'Synonyme invalide.' using errcode='22023';
      end if;
      insert into public.boussole_search_synonyms(locale,term,normalized_term,synonyms,is_active,updated_at)
      values(p_locale,btrim(p_term),btrim(p_normalized_term),coalesce(p_synonyms,'{}'::text[]),true,now())
      on conflict(locale,normalized_term) do update set
        term=excluded.term,synonyms=excluded.synonyms,is_active=true,updated_at=now()
      returning id into v_id;
      v_action := case when p_resource_id is null then 'synonym_created' else 'synonym_updated' end;
      insert into public.boussole_editor_audit(actor_user_id,action,metadata)
      values(p_actor_id,v_action,jsonb_build_object('resource_id',v_id,'locale',p_locale,'normalized_term',p_normalized_term));
      return jsonb_build_object('resource_id',v_id,'status','active');
    end if;

    if p_resource_id is null then raise exception 'Synonyme requis.' using errcode='22023'; end if;
    update public.boussole_search_synonyms set is_active=false,updated_at=now()
      where id=p_resource_id returning id,locale,normalized_term into v_id,p_locale,p_normalized_term;
    if not found then raise exception 'Synonyme introuvable.' using errcode='P0002'; end if;
    insert into public.boussole_editor_audit(actor_user_id,action,metadata)
    values(p_actor_id,'synonym_deactivated',jsonb_build_object('resource_id',v_id,'locale',p_locale,'normalized_term',p_normalized_term));
    return jsonb_build_object('resource_id',v_id,'status','inactive');
  end if;

  if p_document_id is null then raise exception 'Document requis.' using errcode='22023'; end if;
  select * into v_doc from public.boussole_documents d where d.id=p_document_id for update;
  if not found then raise exception 'Document introuvable.' using errcode='P0002'; end if;
  v_scope_type := case when v_doc.visibility='global' then 'global' else 'company' end;
  if v_doc.company_id is not null and not exists (
    select 1 from public.company_memberships m
    where m.company_id=v_doc.company_id and m.user_id=p_actor_id and m.status='active'
  ) then raise exception 'Adhésion active à l’entreprise requise.' using errcode='42501'; end if;
  select exists (
    select 1 from public.boussole_editor_roles r
    where r.user_id=p_actor_id and r.scope_type=v_scope_type
      and r.company_id is not distinct from v_doc.company_id
      and r.revoked_at is null and r.role in ('publisher','admin')
  ) into v_allowed;
  if not v_allowed then raise exception 'Droit de publication requis.' using errcode='42501'; end if;

  if p_action in ('relation_upsert','relation_delete') then
    if p_action='relation_upsert' then
      if p_target_document_id is null or p_relation_type not in ('prerequisite','next','troubleshooting','related','replaces')
        or p_relation_type is null or p_relation_type not in ('prerequisite','next','troubleshooting','related','replaces')
        or p_document_id=p_target_document_id then
        raise exception 'Relation documentaire invalide.' using errcode='22023';
      end if;
      select * into v_target from public.boussole_documents d where d.id=p_target_document_id for share;
      if not found or v_target.visibility<>v_doc.visibility or v_target.company_id is distinct from v_doc.company_id then
        raise exception 'Les documents liés doivent appartenir au même espace.' using errcode='42501';
      end if;
      if v_doc.status<>'published' or v_target.status<>'published' then
        raise exception 'Les relations ne peuvent viser que des documents publiés.' using errcode='22023';
      end if;
      if p_relation_type in ('prerequisite','next') then
        if exists (
          with recursive paths(id) as (
            select p_target_document_id
            union
            select r.target_document_id from public.boussole_document_relations r
            join paths p on p.id=r.source_document_id
            where r.relation_type=p_relation_type
          )
          select 1 from paths where id=p_document_id
        ) then raise exception 'Cette relation créerait un cycle.' using errcode='22023'; end if;
      end if;
      insert into public.boussole_document_relations(source_document_id,target_document_id,relation_type,sort_order)
      values(p_document_id,p_target_document_id,p_relation_type,coalesce(p_sort_order,0))
      on conflict(source_document_id,target_document_id,relation_type)
      do update set sort_order=excluded.sort_order
      returning id into v_id;
      v_action := 'relation_created';
    else
      if p_resource_id is null then raise exception 'Relation requise.' using errcode='22023'; end if;
      delete from public.boussole_document_relations
      where id=p_resource_id and source_document_id=p_document_id returning id into v_id;
      if not found then raise exception 'Relation introuvable.' using errcode='P0002'; end if;
      v_action := 'relation_deleted';
    end if;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,action,metadata)
    values(p_actor_id,v_doc.company_id,p_document_id,v_action,jsonb_build_object('resource_id',v_id,'target_document_id',p_target_document_id,'relation_type',p_relation_type));
    return jsonb_build_object('resource_id',v_id,'status','saved');
  end if;

  if p_action in ('media_register','media_archive') then
    if p_action='media_register' then
      if p_storage_path is null or p_storage_path not like p_document_id::text || '/%'
        or p_file_name is null or length(btrim(p_file_name)) not between 1 and 240
        or p_content_type is null or p_content_type not in ('image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','application/pdf')
        or p_byte_size is null or p_byte_size not between 1 and 20971520
        or jsonb_typeof(p_alt_text) is distinct from 'object' or jsonb_typeof(p_caption) is distinct from 'object'
        or (p_version_id is not null and not exists (
          select 1 from public.boussole_document_versions v
          where v.id=p_version_id and v.document_id=p_document_id
        )) then raise exception 'Métadonnées média invalides.' using errcode='22023'; end if;
      insert into public.boussole_media_assets(
        document_id,version_id,storage_path,file_name,content_type,byte_size,alt_text,caption,sort_order,created_by
      ) values(
        p_document_id,p_version_id,p_storage_path,btrim(p_file_name),p_content_type,p_byte_size,
        p_alt_text,p_caption,coalesce(p_sort_order,0),p_actor_id
      ) returning id into v_id;
      v_action := 'media_registered';
    else
      if p_resource_id is null then raise exception 'Ressource média requise.' using errcode='22023'; end if;
      update public.boussole_media_assets set is_active=false,updated_at=now()
      where id=p_resource_id and document_id=p_document_id returning id into v_id;
      if not found then raise exception 'Ressource média introuvable.' using errcode='P0002'; end if;
      v_action := 'media_archived';
    end if;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,action,metadata)
    values(p_actor_id,v_doc.company_id,p_document_id,v_action,jsonb_build_object('resource_id',v_id));
    return jsonb_build_object('resource_id',v_id,'status','saved');
  end if;

  if p_action='compatibility_update' then
    if (p_min_app_version is not null and p_min_app_version !~ '^v?[0-9]+(\.[0-9]+){0,2}([+-][0-9A-Za-z.-]+)?$')
      or (p_max_app_version is not null and p_max_app_version !~ '^v?[0-9]+(\.[0-9]+){0,2}([+-][0-9A-Za-z.-]+)?$')
      or (p_version_id is not null and not exists (
        select 1 from public.boussole_document_versions v
        where v.id=p_version_id and v.document_id=p_document_id
      )) then raise exception 'Plage de compatibilité invalide.' using errcode='22023'; end if;
    update public.boussole_documents set min_app_version=p_min_app_version,max_app_version=p_max_app_version,
      updated_by=p_actor_id,updated_at=now() where id=p_document_id;
    if p_version_id is not null then
      update public.boussole_document_versions set min_app_version=p_min_app_version,max_app_version=p_max_app_version
      where id=p_version_id and document_id=p_document_id;
    end if;
    insert into public.boussole_editor_audit(actor_user_id,company_id,document_id,version_id,action,metadata)
    values(p_actor_id,v_doc.company_id,p_document_id,p_version_id,'compatibility_updated',
      jsonb_build_object('min_app_version',p_min_app_version,'max_app_version',p_max_app_version));
    return jsonb_build_object('document_id',p_document_id,'status','saved');
  end if;

  raise exception 'Action de ressource non prise en charge.' using errcode='22023';
end;
$$;

revoke all on function public.boussole_editor_manage_resource(
  uuid,text,uuid,uuid,uuid,uuid,text,text,text,text[],text,integer,text,text,text,bigint,jsonb,jsonb,text,text
) from public,anon,authenticated;
grant execute on function public.boussole_editor_manage_resource(
  uuid,text,uuid,uuid,uuid,uuid,text,text,text,text[],text,integer,text,text,text,bigint,jsonb,jsonb,text,text
) to service_role;

commit;
