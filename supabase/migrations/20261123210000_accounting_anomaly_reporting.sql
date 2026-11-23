-- Signaler les anomalies détectées après enregistrement, avec déduplication côté base.
create or replace function private.report_accounting_anomalies_impl(p_company_id uuid,p_anomalies jsonb)
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_item jsonb; v_type text; v_entry_id text; v_message text; v_title text; v_event uuid; v_count integer := 0;
begin
  if v_actor is null then raise exception 'Authentification requise.' using errcode='28000'; end if;
  if not exists (select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=v_actor and m.status='active' and m.role='accountant') then raise exception 'Seul le comptable actif peut signaler les anomalies détectées.' using errcode='42501'; end if;
  if jsonb_typeof(p_anomalies) <> 'array' or jsonb_array_length(p_anomalies)>50 then raise exception 'Liste d’anomalies invalide.' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_anomalies) loop
    v_type:=left(coalesce(v_item->>'type',''),40); v_entry_id:=left(coalesce(v_item->>'entryId',''),100); v_message:=left(btrim(coalesce(v_item->>'message','')),1800);
    if v_type not in ('desequilibre','compte_inconnu','doublon') or v_entry_id='' or v_message='' then continue; end if;
    v_title:=case v_type when 'desequilibre' then 'Écriture comptable déséquilibrée' when 'compte_inconnu' then 'Compte comptable inconnu' else 'Écriture potentiellement en double' end;
    v_event:=(pg_catalog.md5(p_company_id::text||'|'||v_actor::text||'|'||v_entry_id||'|'||v_type||'|'||v_message))::uuid;
    perform private.emit_accounting_notification_event(p_company_id,v_actor,v_event,'suspicious','warning',v_title,v_message,'accounting_entry',v_entry_id,jsonb_build_object('anomaly_type',v_type,'entry_id',v_entry_id,'source','post_save_accounting_audit'));
    v_count:=v_count+1;
  end loop; return v_count;
end; $function$;
revoke all on function private.report_accounting_anomalies_impl(uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.report_accounting_anomalies_impl(uuid,jsonb) to authenticated;
create or replace function public.report_accounting_anomalies(p_company_id uuid,p_anomalies jsonb) returns integer language sql security invoker set search_path = '' as $function$ select private.report_accounting_anomalies_impl(p_company_id,p_anomalies); $function$;
revoke all on function public.report_accounting_anomalies(uuid,jsonb) from public,anon;
grant execute on function public.report_accounting_anomalies(uuid,jsonb) to authenticated;
