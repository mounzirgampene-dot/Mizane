-- Serialize catalog and settings writes with stock posting, reservations and inventory.
-- This closes races where product tracking/unit or warehouse activation could change
-- while a stock movement was validating the same records.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_old text := $old$  v_actor:=private.stock_assert_writer(p_company_id);$old$;
  v_new text := $new$  v_actor:=private.stock_assert_writer(p_company_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));$new$;
  v_targets regprocedure[] := array[
    'private.stock_save_product_impl(uuid,jsonb)'::regprocedure,
    'private.stock_save_warehouse_impl(uuid,jsonb)'::regprocedure,
    'private.stock_update_settings_impl(uuid,jsonb)'::regprocedure
  ];
begin
  foreach v_signature in array v_targets loop
    select pg_get_functiondef(v_signature) into v_definition;
    if v_definition is null
       or length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) then
      raise exception 'Verrouillage de catalogue impossible pour % : point d''insertion absent ou ambigu.',v_signature;
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
    execute v_definition;
  end loop;
end
$migration$;
