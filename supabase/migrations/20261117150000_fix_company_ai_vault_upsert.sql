create or replace function public.mizane_set_company_ai_secret(p_company_id uuid,p_provider text,p_api_key text)
returns jsonb language plpgsql security definer set search_path=public,private,vault as $$
declare v_old_id uuid; v_existing_id uuid; v_new_id uuid; v_name text; v_description text := 'Clé IA MIZANE pour une entreprise.';
begin
 if p_provider not in ('mistral','groq','gemini') then raise exception 'Fournisseur IA non pris en charge.' using errcode='22023'; end if;
 if p_api_key is null or length(trim(p_api_key))<12 or length(p_api_key)>4096 then raise exception 'Clé API invalide.' using errcode='22023'; end if;
 v_name := 'mizane-ai-'||p_company_id::text||'-'||p_provider;
 select vault_secret_id into v_old_id from private.company_ai_credentials where company_id=p_company_id and provider=p_provider;
 if v_old_id is not null then
  perform vault.update_secret(v_old_id,trim(p_api_key),v_name,v_description,null); v_new_id:=v_old_id;
 else
  select id into v_existing_id from vault.secrets where name=v_name limit 1;
  if v_existing_id is not null then perform vault.update_secret(v_existing_id,trim(p_api_key),v_name,v_description,null); v_new_id:=v_existing_id;
  else v_new_id:=vault.create_secret(trim(p_api_key),v_name,v_description,null);
  end if;
 end if;
 insert into private.company_ai_credentials(company_id,provider,vault_secret_id,updated_at) values(p_company_id,p_provider,v_new_id,now())
 on conflict(company_id,provider) do update set vault_secret_id=excluded.vault_secret_id,updated_at=now();
 if v_old_id is not null and v_old_id <> v_new_id then perform vault.delete_secret(v_old_id); end if;
 return jsonb_build_object('saved',true,'provider',p_provider);
end; $$;