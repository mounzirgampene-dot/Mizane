begin;

create or replace function private.stock_count_block_movement()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_source_type text;
  v_source_id text;
  v_override_session text;
begin
  select d.source_type,d.source_id into v_source_type,v_source_id
  from public.stock_documents d
  where d.company_id=new.company_id and d.id=new.document_id;
  v_override_session:=nullif(current_setting('mizane.stock_count_finalize_session',true),'');
  if exists (
    select 1 from public.stock_count_sessions s
    where s.company_id=new.company_id and s.warehouse_id=new.warehouse_id
      and s.status in ('counting','submitted')
      and not (
        v_source_type='inventory_count'
        and v_source_id=s.id::text
        and v_override_session=s.id::text
      )
  ) then
    raise exception 'Mouvement interdit : un inventaire physique est en cours dans cet entrepôt.'
      using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function private.stock_count_finalize_impl(p_company_id uuid,p_session_id uuid,p_operation_uid uuid,p_document_date date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid;
  v_role text;
  v_session public.stock_count_sessions%rowtype;
  v_lines jsonb;
  v_result jsonb;
  v_doc uuid;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  select m.role into v_role from public.company_memberships m
  where m.company_id=p_company_id and m.user_id=v_actor and m.status='active';
  if v_role<>'admin' then
    raise exception 'Seul un administrateur peut approuver et clôturer l’inventaire.' using errcode='42501';
  end if;
  if p_operation_uid is null or p_document_date is null then
    raise exception 'Paramètres de validation invalides.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  select * into v_session from public.stock_count_sessions
  where company_id=p_company_id and id=p_session_id for update;
  if not found then raise exception 'Inventaire introuvable.' using errcode='22023'; end if;
  if v_session.status='posted' then
    return jsonb_build_object('ok',true,'duplicate',true,'document_id',v_session.posted_document_id,'status','posted');
  end if;
  if v_session.status<>'submitted' then
    raise exception 'L’inventaire doit être soumis avant approbation.' using errcode='55000';
  end if;
  if exists(select 1 from public.stock_count_lines where company_id=p_company_id and session_id=p_session_id and counted_quantity is null) then
    raise exception 'Comptage incomplet.' using errcode='23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',l.product_id,'warehouse_id',v_session.warehouse_id,
    'quantity',abs(l.counted_quantity-l.snapshot_quantity),
    'unit_cost',l.snapshot_unit_cost,
    'direction',case when l.counted_quantity>l.snapshot_quantity then 'increase' else 'decrease' end
  ) order by l.product_id),'[]'::jsonb)
  into v_lines from public.stock_count_lines l
  where l.company_id=p_company_id and l.session_id=p_session_id and l.counted_quantity<>l.snapshot_quantity;
  if jsonb_array_length(v_lines)>0 then
    perform set_config('mizane.stock_count_finalize_session',v_session.id::text,true);
    v_result:=private.stock_post_document_impl(
      p_company_id,p_operation_uid,'adjustment',p_document_date,
      'INV-'||v_session.reference,'Régularisation inventaire physique '||v_session.id,
      v_lines,'inventory_count',v_session.id::text
    );
    perform set_config('mizane.stock_count_finalize_session','',true);
    v_doc:=(v_result->>'document_id')::uuid;
  end if;
  update public.stock_count_sessions set status='posted',approved_by=v_actor,posted_at=now(),posted_document_id=v_doc
  where company_id=p_company_id and id=p_session_id;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.count_approved_and_posted','stock_count_session',p_session_id::text,
    jsonb_build_object('document_id',v_doc,'adjustment_lines',jsonb_array_length(v_lines),
      'total_variance',(select coalesce(sum(variance),0) from public.stock_count_lines where company_id=p_company_id and session_id=p_session_id)));
  return jsonb_build_object('ok',true,'duplicate',false,'status','posted','document_id',v_doc,'adjustment_lines',jsonb_array_length(v_lines));
end;
$$;

revoke all on function private.stock_count_block_movement() from public,anon,authenticated;
revoke all on function private.stock_count_finalize_impl(uuid,uuid,uuid,date) from public,anon;
grant execute on function private.stock_count_finalize_impl(uuid,uuid,uuid,date) to authenticated;

commit;