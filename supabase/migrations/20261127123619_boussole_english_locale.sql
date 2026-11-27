-- MIZANE — Ajout de l'anglais aux contenus de la Boussole.
-- Migration additive : conserve les données et élargit uniquement les contraintes de langue.
begin;

alter table public.boussole_document_versions
  drop constraint if exists boussole_document_versions_locale_check;
alter table public.boussole_document_versions
  add constraint boussole_document_versions_locale_check
  check (locale in ('fr','ar','en'));

alter table public.boussole_search_synonyms
  drop constraint if exists boussole_search_synonyms_locale_check;
alter table public.boussole_search_synonyms
  add constraint boussole_search_synonyms_locale_check
  check (locale in ('fr','ar','en'));

alter table public.boussole_user_preferences
  drop constraint if exists boussole_user_preferences_interface_locale_check;
alter table public.boussole_user_preferences
  add constraint boussole_user_preferences_interface_locale_check
  check (interface_locale in ('fr','ar','en'));

alter table public.boussole_user_preferences
  drop constraint if exists boussole_user_preferences_response_locale_check;
alter table public.boussole_user_preferences
  add constraint boussole_user_preferences_response_locale_check
  check (response_locale in ('fr','ar','en'));

comment on constraint boussole_document_versions_locale_check
  on public.boussole_document_versions is 'Langues documentaires supportées : français, arabe et anglais.';
comment on constraint boussole_search_synonyms_locale_check
  on public.boussole_search_synonyms is 'Langues de synonymes supportées : français, arabe et anglais.';

commit;
