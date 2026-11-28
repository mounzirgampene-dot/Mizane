-- Boussole RLS smoke test for Supabase DEV/local.
-- Run only against a disposable/local database or MIZANE-DEV:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/boussole_rls_smoke.sql
-- All fixture rows, Auth users, profiles, and temporary objects are rolled back.
-- Uses the real anon/authenticated database roles and simulated JWT claims.

begin;
create temp table boussole_test_ids (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
insert into boussole_test_ids(key) values
('user_a'),('user_revoked'),('user_b'),('company_a'),('company_b'),('doc_global'),('doc_a'),('doc_b');
grant select on pg_temp.boussole_test_ids to anon, authenticated;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',key||'-'||id::text||'@invalid.example','',now(),'{}',
jsonb_build_object('display_name','Boussole RLS '||key),now(),now()
from pg_temp.boussole_test_ids where key in ('user_a','user_revoked','user_b');

insert into public.companies(id,legal_name,country_code,base_currency,accounting_standard,created_by)
values
((select id from pg_temp.boussole_test_ids where key='company_a'),'Boussole RLS Company A','MA','MAD','CGNC',(select id from pg_temp.boussole_test_ids where key='user_a')),
((select id from pg_temp.boussole_test_ids where key='company_b'),'Boussole RLS Company B','MA','MAD','CGNC',(select id from pg_temp.boussole_test_ids where key='user_b'));

insert into public.company_memberships(company_id,user_id,role,status)
values
((select id from pg_temp.boussole_test_ids where key='company_a'),(select id from pg_temp.boussole_test_ids where key='user_a'),'admin','active'),
((select id from pg_temp.boussole_test_ids where key='company_a'),(select id from pg_temp.boussole_test_ids where key='user_revoked'),'reader','suspended'),
((select id from pg_temp.boussole_test_ids where key='company_b'),(select id from pg_temp.boussole_test_ids where key='user_b'),'admin','active');

insert into public.boussole_documents(id,slug,visibility,company_id,status)
values
((select id from pg_temp.boussole_test_ids where key='doc_global'),'rls-global-published','global',null,'published'),
(gen_random_uuid(),'rls-global-draft','global',null,'draft'),
((select id from pg_temp.boussole_test_ids where key='doc_a'),'rls-company-a','company',(select id from pg_temp.boussole_test_ids where key='company_a'),'published'),
((select id from pg_temp.boussole_test_ids where key='doc_b'),'rls-company-b','company',(select id from pg_temp.boussole_test_ids where key='company_b'),'published');

insert into public.boussole_document_versions(document_id,version_number,locale,title,content_markdown,status)
select id,1,'fr','Global published','Contenu','published' from pg_temp.boussole_test_ids where key='doc_global'
union all
select id,1,'fr','Company A','Contenu A','published' from pg_temp.boussole_test_ids where key='doc_a'
union all
select id,1,'fr','Company B','Contenu B','published' from pg_temp.boussole_test_ids where key='doc_b';

insert into public.boussole_document_relations(source_document_id,target_document_id,relation_type)
values
((select id from pg_temp.boussole_test_ids where key='doc_global'),(select id from pg_temp.boussole_test_ids where key='doc_a'),'related'),
((select id from pg_temp.boussole_test_ids where key='doc_a'),(select id from pg_temp.boussole_test_ids where key='doc_b'),'troubleshooting');

insert into public.boussole_search_synonyms(locale,term,normalized_term,synonyms,is_active)
values ('fr','stock','stock',array['inventaire'],true),('fr','secret','secret',array['privé'],false);

set local role anon;
do $$
declare n integer;
begin
 select count(*) into n from public.boussole_documents;
 if n <> 1 then raise exception 'anon documents expected 1, got %',n; end if;
 select count(*) into n from public.boussole_document_versions;
 if n <> 1 then raise exception 'anon versions expected 1, got %',n; end if;
 select count(*) into n from public.boussole_document_relations;
 if n <> 0 then raise exception 'anon relations expected 0, got %',n; end if;
 select count(*) into n from public.boussole_search_synonyms;
 if n <> 1 then raise exception 'anon active synonyms expected 1, got %',n; end if;
 begin
  perform * from public.boussole_user_preferences;
  raise exception 'anon unexpectedly read preferences';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id::text from pg_temp.boussole_test_ids where key='user_a'),'role','authenticated')::text,true);
do $$
declare n integer; uid uuid; revoked uuid;
begin
 uid := (select id from pg_temp.boussole_test_ids where key='user_a');
 revoked := (select id from pg_temp.boussole_test_ids where key='user_revoked');
 select count(*) into n from public.boussole_documents;
 if n <> 2 then raise exception 'member A documents expected 2, got %',n; end if;
 select count(*) into n from public.boussole_document_versions;
 if n <> 2 then raise exception 'member A versions expected 2, got %',n; end if;
 select count(*) into n from public.boussole_document_relations;
 if n <> 1 then raise exception 'member A relations expected 1, got %',n; end if;
 insert into public.boussole_user_preferences(user_id,interface_locale,response_locale) values (uid,'fr','ar');
 update public.boussole_user_preferences set contextual_suggestions=false where user_id=uid;
 select count(*) into n from public.boussole_user_preferences where user_id=revoked;
 if n <> 0 then raise exception 'member A read another user preferences'; end if;
 begin
  insert into public.boussole_user_preferences(user_id) values (revoked);
  raise exception 'member A inserted another user preferences';
 exception when insufficient_privilege then null; end;
 insert into public.boussole_consent_events(user_id,consent_type,purpose,policy_version,decision)
 values (uid,'ai_processing','RLS test','v1','granted');
 begin
  insert into public.boussole_consent_events(user_id,consent_type,purpose,policy_version,decision)
  values (revoked,'ai_processing','RLS test','v1','granted');
  raise exception 'member A inserted another user consent';
 exception when insufficient_privilege then null; end;
 begin
  update public.boussole_consent_events set decision='revoked' where user_id=uid;
  raise exception 'consent UPDATE unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.boussole_consent_events where user_id=uid;
  raise exception 'consent DELETE unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.boussole_consent_events(user_id,consent_type,purpose,policy_version,decision,created_at)
  values (uid,'ai_processing','RLS test','v1','granted','2000-01-01');
  raise exception 'consent created_at override unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.boussole_consent_events(id,user_id,consent_type,purpose,policy_version,decision)
  values (gen_random_uuid(),uid,'ai_processing','RLS test','v1','granted');
  raise exception 'consent id override unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.boussole_documents(slug,status) values ('unauthorized','published');
  raise exception 'document write unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id::text from pg_temp.boussole_test_ids where key='user_revoked'),'role','authenticated')::text,true);
do $$
declare n integer;
begin
 select count(*) into n from public.boussole_documents;
 if n <> 1 then raise exception 'suspended member expected global doc only, got %',n; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id::text from pg_temp.boussole_test_ids where key='user_b'),'role','authenticated')::text,true);
do $$
declare n integer;
begin
 select count(*) into n from public.boussole_documents;
 if n <> 2 then raise exception 'company B member expected 2 documents, got %',n; end if;
 if exists(select 1 from public.boussole_documents where slug='rls-company-a') then
  raise exception 'company B member saw company A document';
 end if;
end $$;

rollback;
select 'Boussole RLS smoke test: PASS; all fixture data rolled back.' as result;
