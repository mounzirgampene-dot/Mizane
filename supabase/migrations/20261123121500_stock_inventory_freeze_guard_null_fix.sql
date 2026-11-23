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
        and v_override_session is not distinct from s.id::text
      )
  ) then
    raise exception 'Mouvement interdit : un inventaire physique est en cours dans cet entrepôt.'
      using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function private.stock_count_block_movement() from public,anon,authenticated;