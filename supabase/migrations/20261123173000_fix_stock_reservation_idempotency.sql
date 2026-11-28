-- Null-safe idempotency checks for linked reservation retries.
do $patch$
declare
  v_definition text;
  v_old text := 'or v_existing.source_type<>p_source_type or v_existing.source_id<>p_source_id then';
  v_new text := 'or v_existing.source_type is distinct from p_source_type or v_existing.source_id is distinct from p_source_id then';
begin
  select pg_get_functiondef(
    'private.stock_reserve_linked_impl(uuid,uuid,uuid,uuid,numeric,text,text,text)'::regprocedure
  ) into v_definition;
  if v_definition is null or position(v_old in v_definition)=0 then
    raise exception 'Correction idempotence impossible : comparaison de source introuvable.';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$patch$;
