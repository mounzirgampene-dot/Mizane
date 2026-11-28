-- Consolidate published Boussole read policies without changing visibility rules.
-- Anonymous users can read global published content only.
-- Authenticated users can additionally read company content when actively
-- associated with the relevant company.

drop policy if exists boussole_relations_read_company_published on public.boussole_document_relations;
drop policy if exists boussole_relations_read_global_published on public.boussole_document_relations;
create policy boussole_relations_read_published
on public.boussole_document_relations
for select
to anon, authenticated
using (
  (exists (
    select 1 from public.boussole_documents d
    where d.id = boussole_document_relations.source_document_id
      and d.status = 'published' and d.visibility = 'global'
  ) and exists (
    select 1 from public.boussole_documents d
    where d.id = boussole_document_relations.target_document_id
      and d.status = 'published' and d.visibility = 'global'
  ))
  or (
    (select auth.uid()) is not null
    and exists (
      select 1 from public.boussole_documents d
      where d.id = boussole_document_relations.source_document_id
        and d.status = 'published'
        and (d.visibility = 'global' or (d.visibility = 'company' and private.is_active_company_member(d.company_id)))
    )
    and exists (
      select 1 from public.boussole_documents d
      where d.id = boussole_document_relations.target_document_id
        and d.status = 'published'
        and (d.visibility = 'global' or (d.visibility = 'company' and private.is_active_company_member(d.company_id)))
    )
  )
);

drop policy if exists boussole_versions_read_company_published on public.boussole_document_versions;
drop policy if exists boussole_versions_read_global_published on public.boussole_document_versions;
create policy boussole_versions_read_published
on public.boussole_document_versions
for select
to anon, authenticated
using (
  status = 'published'
  and (
    exists (
      select 1 from public.boussole_documents d
      where d.id = boussole_document_versions.document_id
        and d.status = 'published' and d.visibility = 'global'
    )
    or (
      (select auth.uid()) is not null
      and exists (
        select 1 from public.boussole_documents d
        where d.id = boussole_document_versions.document_id
          and d.status = 'published'
          and d.visibility = 'company'
          and private.is_active_company_member(d.company_id)
      )
    )
  )
);

drop policy if exists boussole_documents_read_company_published on public.boussole_documents;
drop policy if exists boussole_documents_read_global_published on public.boussole_documents;
create policy boussole_documents_read_published
on public.boussole_documents
for select
to anon, authenticated
using (
  status = 'published'
  and (
    visibility = 'global'
    or (
      (select auth.uid()) is not null
      and visibility = 'company'
      and private.is_active_company_member(company_id)
    )
  )
);

drop policy if exists boussole_media_read_company_published on public.boussole_media_assets;
drop policy if exists boussole_media_read_global_published on public.boussole_media_assets;
create policy boussole_media_read_published
on public.boussole_media_assets
for select
to anon, authenticated
using (
  is_active
  and (
    (
      exists (
        select 1 from public.boussole_documents d
        where d.id = boussole_media_assets.document_id
          and d.status = 'published' and d.visibility = 'global'
      )
      and (
        version_id is null
        or exists (
          select 1 from public.boussole_document_versions v
          where v.id = boussole_media_assets.version_id
            and v.document_id = boussole_media_assets.document_id
            and v.status = 'published'
        )
      )
    )
    or (
      (select auth.uid()) is not null
      and exists (
        select 1 from public.boussole_documents d
        where d.id = boussole_media_assets.document_id
          and d.status = 'published'
          and (d.visibility = 'global' or (d.visibility = 'company' and private.is_active_company_member(d.company_id)))
      )
      and (
        version_id is null
        or exists (
          select 1 from public.boussole_document_versions v
          where v.id = boussole_media_assets.version_id
            and v.document_id = boussole_media_assets.document_id
            and v.status = 'published'
        )
      )
    )
  )
);
