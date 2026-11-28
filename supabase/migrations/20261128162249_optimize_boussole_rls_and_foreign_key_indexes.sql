begin;

-- Cache auth.uid() once per statement instead of re-evaluating it per row.
drop policy if exists boussole_preferences_select_own on public.boussole_user_preferences;
create policy boussole_preferences_select_own
  on public.boussole_user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists boussole_preferences_insert_own on public.boussole_user_preferences;
create policy boussole_preferences_insert_own
  on public.boussole_user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists boussole_preferences_update_own on public.boussole_user_preferences;
create policy boussole_preferences_update_own
  on public.boussole_user_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists boussole_consent_select_own on public.boussole_consent_events;
create policy boussole_consent_select_own
  on public.boussole_consent_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists boussole_consent_insert_own on public.boussole_consent_events;
create policy boussole_consent_insert_own
  on public.boussole_consent_events for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Cover all foreign keys reported by the performance advisor.
create index if not exists accounting_notifications_actor_user_id_idx
  on public.accounting_notifications (actor_user_id);
create index if not exists accounting_notifications_reviewed_by_idx
  on public.accounting_notifications (reviewed_by);
create index if not exists boussole_document_relations_target_document_id_idx
  on public.boussole_document_relations (target_document_id);
create index if not exists boussole_document_versions_approved_by_idx
  on public.boussole_document_versions (approved_by);
create index if not exists boussole_document_versions_created_by_idx
  on public.boussole_document_versions (created_by);
create index if not exists boussole_document_versions_reviewed_by_idx
  on public.boussole_document_versions (reviewed_by);
create index if not exists boussole_documents_created_by_idx
  on public.boussole_documents (created_by);
create index if not exists boussole_documents_updated_by_idx
  on public.boussole_documents (updated_by);
create index if not exists boussole_media_assets_created_by_idx
  on public.boussole_media_assets (created_by);
create index if not exists boussole_media_assets_version_document_idx
  on public.boussole_media_assets (version_id, document_id);

commit;
