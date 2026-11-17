-- MIZANE: secrets IA isolés par entreprise dans Supabase Vault.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.company_ai_credentials (
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('mistral','groq','gemini')),
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, provider)
);
revoke all on private.company_ai_credentials from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on private.company_ai_credentials to service_role;
create or replace function public.mizane_set_company_ai_secret(p_company_id uuid,p_provider text,p_api_key text)
returns jsonb language plpgsql security definer set search_path=public,private,vault as $$
declare v_old_id uuid; v_new_id uuid;
begin
 if p_provider not in ('mistral','groq','gemini') then raise exception 'Fournisseur IA non pris en charge.' using errcode='22023'; end if;
 if p_api_key is null or length(trim(p_api_key))<12 or length(p_api_key)>4096 then raise exception 'Clé API invalide.' using errcode='22023'; end if;
 select vault_secret_id into v_old_id from private.company_ai_credentials where company_id=p_company_id and provider=p_provider;
 v_new_id:=vault.create_secret(trim(p_api_key),'mizane-ai-'||p_company_id::text||'-'||p_provider,'Clé IA MIZANE pour une entreprise.');
 insert into private.company_ai_credentials(company_id,provider,vault_secret_id,updated_at) values(p_company_id,p_provider,v_new_id,now())
 on conflict(company_id,provider) do update set vault_secret_id=excluded.vault_secret_id,updated_at=now();
 if v_old_id is not null then perform vault.delete_secret(v_old_id); end if;
 return jsonb_build_object('saved',true,'provider',p_provider);
end $$;
create or replace function public.mizane_get_company_ai_secret(p_company_id uuid,p_provider text)
returns text language plpgsql security definer set search_path=public,private,vault as $$
declare v_secret_id uuid; v_secret text;
begin
 select vault_secret_id into v_secret_id from private.company_ai_credentials where company_id=p_company_id and provider=p_provider;
 if v_secret_id is null then return null; end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_secret_id;
 return v_secret;
end $$;
create or replace function public.mizane_delete_company_ai_secret(p_company_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,private,vault as $$
declare v_secret_id uuid;
begin
 delete from private.company_ai_credentials where company_id=p_company_id and provider=p_provider returning vault_secret_id into v_secret_id;
 if v_secret_id is not null then perform vault.delete_secret(v_secret_id); end if;
 return jsonb_build_object('deleted',v_secret_id is not null,'provider',p_provider);
end $$;
revoke all on function public.mizane_set_company_ai_secret(uuid,text,text) from public,anon,authenticated;
revoke all on function public.mizane_get_company_ai_secret(uuid,text) from public,anon,authenticated;
revoke all on function public.mizane_delete_company_ai_secret(uuid,text) from public,anon,authenticated;
grant execute on function public.mizane_set_company_ai_secret(uuid,text,text) to service_role;
grant execute on function public.mizane_get_company_ai_secret(uuid,text) to service_role;
grant execute on function public.mizane_delete_company_ai_secret(uuid,text) to service_role;
commit;