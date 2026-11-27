-- MIZANE — Boussole: fondations documentaires et préférences privées.
-- Migration additive. À appliquer et valider sur MIZANE-DEV uniquement.
begin;

create table public.boussole_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  module_key text,
  feature_key text,
  visibility text not null default 'global'
    check (visibility in ('global','company')),
  company_id uuid references public.companies(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','review','published','archived')),
  current_published_version integer,
  min_app_version text,
  max_app_version text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint boussole_document_scope_check check (
    (visibility='global' and company_id is null) or
    (visibility='company' and company_id is not null)
  ),
  constraint boussole_document_slug_check check (length(trim(slug)) between 1 and 180)
);
create unique index boussole_documents_global_slug_uidx
  on public.boussole_documents(slug) where visibility='global';
create unique index boussole_documents_company_slug_uidx
  on public.boussole_documents(company_id,slug) where visibility='company';
create index boussole_documents_publication_idx
  on public.boussole_documents(status,visibility,module_key,feature_key);

create table public.boussole_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.boussole_documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  locale text not null check (locale in ('fr','ar')),
  title text not null check (length(trim(title)) between 1 and 240),
  summary text,
  content_markdown text not null default '',
  structured_content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(structured_content)='object'),
  source_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_references)='array'),
  learning_level text check (learning_level in ('beginner','intermediate','advanced')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 1440),
  status text not null default 'draft'
    check (status in ('draft','review','approved','published','withdrawn')),
  min_app_version text,
  max_app_version text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  unique(document_id,version_number,locale)
);
create index boussole_document_versions_lookup_idx
  on public.boussole_document_versions(document_id,locale,status,version_number desc);

create table public.boussole_document_relations (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.boussole_documents(id) on delete cascade,
  target_document_id uuid not null references public.boussole_documents(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('prerequisite','next','troubleshooting','related','replaces')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (source_document_id <> target_document_id),
  unique(source_document_id,target_document_id,relation_type)
);
create index boussole_document_relations_source_idx
  on public.boussole_document_relations(source_document_id,sort_order);

create table public.boussole_search_synonyms (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('fr','ar')),
  term text not null check (length(trim(term)) between 1 and 180),
  normalized_term text not null check (length(trim(normalized_term)) between 1 and 180),
  synonyms text[] not null default '{}',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(locale,normalized_term)
);

create table public.boussole_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interface_locale text not null default 'fr' check (interface_locale in ('fr','ar')),
  response_locale text not null default 'fr' check (response_locale in ('fr','ar')),
  contextual_suggestions boolean not null default true,
  save_history boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.boussole_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null
    check (consent_type in ('ai_processing','business_data_access','usage_analytics')),
  purpose text not null check (length(trim(purpose)) between 1 and 500),
  policy_version text not null check (length(trim(policy_version)) between 1 and 80),
  decision text not null check (decision in ('granted','revoked')),
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope)='object'),
  created_at timestamptz not null default now()
);
create index boussole_consent_events_user_idx
  on public.boussole_consent_events(user_id,consent_type,created_at desc);

alter table public.boussole_documents enable row level security;
alter table public.boussole_documents force row level security;
alter table public.boussole_document_versions enable row level security;
alter table public.boussole_document_versions force row level security;
alter table public.boussole_document_relations enable row level security;
alter table public.boussole_document_relations force row level security;
alter table public.boussole_search_synonyms enable row level security;
alter table public.boussole_search_synonyms force row level security;
alter table public.boussole_user_preferences enable row level security;
alter table public.boussole_user_preferences force row level security;
alter table public.boussole_consent_events enable row level security;
alter table public.boussole_consent_events force row level security;

-- Le contenu global est lisible publiquement sans appeler le helper privé.
create policy boussole_documents_read_global_published
  on public.boussole_documents for select to anon,authenticated
  using (status='published' and visibility='global');
create policy boussole_documents_read_company_published
  on public.boussole_documents for select to authenticated
  using (
    status='published' and visibility='company'
    and private.is_active_company_member(company_id)
  );

create policy boussole_versions_read_global_published
  on public.boussole_document_versions for select to anon,authenticated
  using (
    status='published' and exists (
      select 1 from public.boussole_documents d
      where d.id=document_id and d.status='published' and d.visibility='global'
    )
  );
create policy boussole_versions_read_company_published
  on public.boussole_document_versions for select to authenticated
  using (
    status='published' and exists (
      select 1 from public.boussole_documents d
      where d.id=document_id and d.status='published'
        and d.visibility='company'
        and private.is_active_company_member(d.company_id)
    )
  );

-- Anon ne voit que les relations entre deux documents globaux publiés.
create policy boussole_relations_read_global_published
  on public.boussole_document_relations for select to anon,authenticated
  using (
    exists (
      select 1 from public.boussole_documents d
      where d.id=source_document_id and d.status='published' and d.visibility='global'
    ) and exists (
      select 1 from public.boussole_documents d
      where d.id=target_document_id and d.status='published' and d.visibility='global'
    )
  );
create policy boussole_relations_read_company_published
  on public.boussole_document_relations for select to authenticated
  using (
    exists (
      select 1 from public.boussole_documents d
      where d.id=source_document_id and d.status='published'
        and (d.visibility='global' or
          (d.visibility='company' and private.is_active_company_member(d.company_id)))
    ) and exists (
      select 1 from public.boussole_documents d
      where d.id=target_document_id and d.status='published'
        and (d.visibility='global' or
          (d.visibility='company' and private.is_active_company_member(d.company_id)))
    )
  );

create policy boussole_synonyms_read_active on public.boussole_search_synonyms
  for select to anon,authenticated using (is_active);
create policy boussole_preferences_select_own on public.boussole_user_preferences
  for select to authenticated using (user_id=auth.uid());
create policy boussole_preferences_insert_own on public.boussole_user_preferences
  for insert to authenticated with check (user_id=auth.uid());
create policy boussole_preferences_update_own on public.boussole_user_preferences
  for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy boussole_consent_select_own on public.boussole_consent_events
  for select to authenticated using (user_id=auth.uid());
create policy boussole_consent_insert_own on public.boussole_consent_events
  for insert to authenticated with check (user_id=auth.uid());

revoke all on public.boussole_documents,public.boussole_document_versions,
  public.boussole_document_relations,public.boussole_search_synonyms,
  public.boussole_user_preferences,public.boussole_consent_events from public,anon,authenticated;
grant select on public.boussole_documents,public.boussole_document_versions,
  public.boussole_document_relations,public.boussole_search_synonyms to anon,authenticated;
grant select,insert,update on public.boussole_user_preferences to authenticated;
grant select on public.boussole_consent_events to authenticated;
grant insert (user_id,consent_type,purpose,policy_version,decision,scope)
  on public.boussole_consent_events to authenticated;

commit;
