-- Extend exact stock reversals to lot- and serial-tracked products.
-- The original journal remains immutable. Tracked serial state must still point
-- to the original document's final movement before any inverse movement is posted.
do $migration$
declare
  v_definition text;
  v_old_guard text := $old$
  if exists(
    select 1 from public.stock_movements m
    join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id
    where m.company_id=p_company_id and m.document_id=p_document_id and p.tracking<>'none'
  ) then
    raise exception 'Contrepassation automatique indisponible pour les articles suivis par lot ou numéro de série.' using errcode='0A000';
  end if;
$old$;
  v_new_guard text := $new$
  -- Pour les articles sérialisés, vérifier l'état exact laissé par le document.
  -- En transfert, seule la ligne destination porte le dernier mouvement du numéro.
  if exists(
    select 1
    from public.stock_movements m
    join public.stock_document_lines l
      on l.company_id=m.company_id and l.id=m.line_id
    join public.stock_products p
      on p.company_id=m.company_id and p.id=m.product_id
    where m.company_id=p_company_id and m.document_id=p_document_id
      and p.tracking='serial'
      and (
        (v_doc.document_type='transfer' and m.quantity_delta>0 and exists(
          select 1
          from jsonb_array_elements_text(l.serial_numbers) as serial(value)
          where not exists(
            select 1 from public.stock_serials s
            where s.company_id=m.company_id and s.product_id=m.product_id
              and lower(s.serial_number)=lower(serial.value)
              and s.status='in_stock' and s.warehouse_id=m.warehouse_id
              and s.last_movement_id=m.id
          )
        ))
        or
        (v_doc.document_type<>'transfer' and exists(
          select 1
          from jsonb_array_elements_text(l.serial_numbers) as serial(value)
          where not exists(
            select 1 from public.stock_serials s
            where s.company_id=m.company_id and s.product_id=m.product_id
              and lower(s.serial_number)=lower(serial.value)
              and s.last_movement_id=m.id
              and (
                (m.quantity_delta>0 and s.status='in_stock' and s.warehouse_id=m.warehouse_id)
                or
                (m.quantity_delta<0 and s.status='issued' and s.warehouse_id is null)
              )
          )
        ))
      )
  ) then
    raise exception 'Contrepassation refusée : l''état actuel d''un numéro de série ne correspond plus au document d''origine.' using errcode='55000';
  end if;
$ new$;
begin
  select pg_get_functiondef('private.stock_reverse_document_impl(uuid,uuid,uuid,text)'::regprocedure)
    into v_definition;
  if v_definition is null or position(v_old_guard in v_definition)=0 then
    raise exception 'Patch de contrepassation impossible : garde historique introuvable.';
  end if;
  v_definition := replace(v_definition,v_old_guard,v_new_guard);
  if position('order by m.id' in v_definition)=0 then
    raise exception 'Patch de contrepassation impossible : ordre des mouvements introuvable.';
  end if;
  v_definition := replace(v_definition,'order by m.id','order by m.id desc');
  execute v_definition;
end
$migration$;
