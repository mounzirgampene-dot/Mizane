-- Correctif : éviter une tentative d'INSERT négative lors d'une sortie de lot.
begin;
create or replace function private.stock_apply_tracking_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking text; v_doc_type text; v_lot_id uuid; v_line public.stock_document_lines%rowtype;
  v_serial text; v_count integer:=0; v_expected integer; v_new_qty numeric(20,6);
begin
  select p.tracking,d.document_type into v_tracking,v_doc_type
  from public.stock_products p join public.stock_documents d
    on d.company_id=p.company_id
  where p.company_id=new.company_id and p.id=new.product_id and d.id=new.document_id;
  if v_tracking='none' then return new; end if;
  select * into v_line from public.stock_document_lines
  where company_id=new.company_id and id=new.line_id;
  if v_tracking='lot' then
    insert into public.stock_lots(company_id,product_id,lot_code)
    values(new.company_id,new.product_id,v_line.lot_code)
    on conflict(company_id,product_id,lot_code) do nothing;
    select id into v_lot_id from public.stock_lots
    where company_id=new.company_id and product_id=new.product_id and lot_code=v_line.lot_code;
    if new.quantity_delta>0 then
      insert into public.stock_lot_balances(company_id,lot_id,warehouse_id,quantity)
      values(new.company_id,v_lot_id,new.warehouse_id,new.quantity_delta)
      on conflict(company_id,lot_id,warehouse_id) do update
        set quantity=public.stock_lot_balances.quantity+excluded.quantity,updated_at=now()
      returning quantity into v_new_qty;
    else
      update public.stock_lot_balances set quantity=quantity+new.quantity_delta,updated_at=now()
      where company_id=new.company_id and lot_id=v_lot_id and warehouse_id=new.warehouse_id
        and quantity+new.quantity_delta>=0
      returning quantity into v_new_qty;
    end if;
    if not found then
      raise exception 'Quantité insuffisante pour le lot % dans cet entrepôt.',v_line.lot_code using errcode='23514';
    end if;
    return new;
  end if;

  v_expected:=abs(new.quantity_delta)::integer;
  for v_serial in select jsonb_array_elements_text(v_line.serial_numbers) loop
    if length(trim(v_serial))=0 then raise exception 'Numéro de série vide.' using errcode='22023'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements_text(v_line.serial_numbers))<>
     (select count(distinct lower(trim(value))) from jsonb_array_elements_text(v_line.serial_numbers)) then
    raise exception 'Numéros de série dupliqués dans une même ligne.' using errcode='23505';
  end if;

  if new.quantity_delta<0 then
    if v_doc_type='transfer' then
      update public.stock_serials set status='in_transit',warehouse_id=null,last_movement_id=new.id,updated_at=now()
      where company_id=new.company_id and product_id=new.product_id and warehouse_id=new.warehouse_id
        and status='in_stock' and serial_number in (select jsonb_array_elements_text(v_line.serial_numbers));
    else
      update public.stock_serials set status='issued',warehouse_id=null,last_movement_id=new.id,updated_at=now()
      where company_id=new.company_id and product_id=new.product_id and warehouse_id=new.warehouse_id
        and status='in_stock' and serial_number in (select jsonb_array_elements_text(v_line.serial_numbers));
    end if;
    get diagnostics v_count = row_count;
    if v_count<>v_expected then
      raise exception 'Un ou plusieurs numéros de série ne sont pas disponibles dans cet entrepôt.' using errcode='23514';
    end if;
  elsif v_doc_type='transfer' then
    update public.stock_serials set status='in_stock',warehouse_id=new.warehouse_id,last_movement_id=new.id,updated_at=now()
    where company_id=new.company_id and product_id=new.product_id and status='in_transit'
      and serial_number in (select jsonb_array_elements_text(v_line.serial_numbers));
    get diagnostics v_count = row_count;
    if v_count<>v_expected then raise exception 'Transfert de numéros de série incohérent.' using errcode='23514'; end if;
  else
    for v_serial in select jsonb_array_elements_text(v_line.serial_numbers) loop
      insert into public.stock_serials(company_id,product_id,serial_number,warehouse_id,status,last_movement_id)
      values(new.company_id,new.product_id,trim(v_serial),new.warehouse_id,'in_stock',new.id)
      on conflict(company_id,serial_number) do update
        set warehouse_id=excluded.warehouse_id,status='in_stock',last_movement_id=excluded.last_movement_id,updated_at=now()
        where public.stock_serials.product_id=excluded.product_id and public.stock_serials.status='issued';
      get diagnostics v_count = row_count;
      if v_count<>1 then raise exception 'Numéro de série déjà enregistré ou associé à un autre article : %.',v_serial using errcode='23505'; end if;
    end loop;
  end if;
  return new;
end;
$$;
commit;
