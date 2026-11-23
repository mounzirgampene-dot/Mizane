-- Normalise les codes de lot et numéros de série avant journalisation.
begin;
create or replace function private.stock_prepare_document_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tracking text; v_source public.stock_document_lines%rowtype;
begin
  new.lot_code:=nullif(trim(coalesce(new.lot_code,'')),'');
  if jsonb_typeof(coalesce(new.serial_numbers,'[]'::jsonb))='array' then
    select coalesce(jsonb_agg(trim(value) order by ord),'[]'::jsonb) into new.serial_numbers
    from jsonb_array_elements_text(coalesce(new.serial_numbers,'[]'::jsonb)) with ordinality as serials(value,ord);
  end if;
  if new.line_number>500 and new.destination_warehouse_id is null then
    select * into v_source from public.stock_document_lines s
    where s.company_id=new.company_id and s.document_id=new.document_id
      and s.product_id=new.product_id and s.destination_warehouse_id=new.warehouse_id
      and s.line_number=new.line_number-500;
    if found then
      new.lot_code:=v_source.lot_code;
      new.serial_numbers:=v_source.serial_numbers;
      new.input_quantity:=v_source.input_quantity;
      new.input_unit:=v_source.input_unit;
      new.conversion_factor:=v_source.conversion_factor;
    end if;
  end if;
  select tracking into v_tracking from public.stock_products
  where company_id=new.company_id and id=new.product_id;
  if v_tracking='lot' then
    if length(trim(coalesce(new.lot_code,''))) not between 1 and 80
       or jsonb_array_length(coalesce(new.serial_numbers,'[]'::jsonb))<>0 then
      raise exception 'Un article suivi par lot exige un code de lot et aucun numéro de série.' using errcode='22023';
    end if;
  elsif v_tracking='serial' then
    if new.quantity<>trunc(new.quantity)
       or jsonb_typeof(coalesce(new.serial_numbers,'[]'::jsonb))<>'array'
       or jsonb_array_length(coalesce(new.serial_numbers,'[]'::jsonb))<>new.quantity
       or length(trim(coalesce(new.lot_code,'')))>0 then
      raise exception 'Un article suivi par série exige un numéro unique par unité entière.' using errcode='22023';
    end if;
  elsif coalesce(new.lot_code,'')<>'' or jsonb_array_length(coalesce(new.serial_numbers,'[]'::jsonb))>0 then
    raise exception 'Cet article ne prend pas en charge la traçabilité.' using errcode='22023';
  end if;
  return new;
end;
$$;
commit;
