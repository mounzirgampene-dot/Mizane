create or replace function private.stock_post_document_impl(
  p_company_id uuid,p_operation_uid uuid,p_document_type text,p_document_date date,
  p_reference text,p_note text,p_lines jsonb,p_source_type text default null,p_source_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid; v_doc uuid; v_existing jsonb; v_existing_hash text; v_request_hash text; v_settings public.stock_settings%rowtype;
  v_line jsonb; v_no integer:=0; v_product uuid; v_wh uuid; v_dest uuid;
  v_qty numeric(20,6); v_cost numeric(20,6); v_total numeric(20,6);
  v_balance public.stock_balances%rowtype; v_layer record; v_left numeric(20,6);
  v_take numeric(20,6); v_issue_cost numeric(20,6); v_unit_cost numeric(20,6); v_reserved numeric(20,6);
  v_source_movement bigint; v_dest_movement bigint; v_signed numeric(20,6); v_allocations jsonb;
  v_reservation record; v_reservation_left numeric(20,6); v_reservation_take numeric(20,6);
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  if p_operation_uid is null or p_document_date is null or p_document_type not in ('receipt','issue','transfer','adjustment')
     or length(coalesce(p_reference,''))>120 or length(coalesce(p_note,''))>1000
     or length(coalesce(p_source_type,''))>60 or length(coalesce(p_source_id,''))>180
     or p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>500 then
    raise exception 'Document de stock invalide.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));
  v_request_hash:=md5(concat_ws('|',p_document_type,p_document_date::text,coalesce(p_reference,''),coalesce(p_note,''),p_lines::text,coalesce(p_source_type,''),coalesce(p_source_id,'')));
  select to_jsonb(d),d.request_hash into v_existing,v_existing_hash from public.stock_documents d where d.company_id=p_company_id and d.operation_uid=p_operation_uid;
  if v_existing is not null then
    if v_existing_hash<>v_request_hash then raise exception 'operation_uid déjà utilisé avec un contenu différent.' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'document_id',(v_existing->>'id')::uuid,'document',v_existing-'request_hash');
  end if;
  insert into public.stock_settings(company_id) values(p_company_id) on conflict do nothing;
  select * into v_settings from public.stock_settings where company_id=p_company_id for update;
  if exists(select 1 from public.accounting_periods p where p.company_id=p_company_id and p.status='closed' and p_document_date between p.start_date and p.end_date) then
    raise exception 'Période comptable clôturée : mouvement de stock interdit à cette date.' using errcode='55000';
  end if;
  insert into public.stock_documents(company_id,operation_uid,request_hash,document_type,document_date,reference,note,source_type,source_id,created_by)
  values(p_company_id,p_operation_uid,v_request_hash,p_document_type,p_document_date,coalesce(p_reference,''),coalesce(p_note,''),p_source_type,p_source_id,v_actor)
  returning id into v_doc;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_no:=v_no+1;
    v_allocations:='[]'::jsonb;
    v_product:=(v_line->>'product_id')::uuid;
    v_wh:=(v_line->>'warehouse_id')::uuid;
    v_dest:=nullif(v_line->>'destination_warehouse_id','')::uuid;
    v_qty:=(v_line->>'quantity')::numeric;
    v_cost:=coalesce(nullif(v_line->>'unit_cost','')::numeric,0);
    if p_document_type='adjustment' and coalesce(v_line->>'direction','') not in ('increase','decrease') then
      raise exception 'Un ajustement doit préciser increase ou decrease.' using errcode='22023';
    end if;
    if v_qty<=0 or v_qty>999999999999 or v_qty::text in ('NaN','Infinity','-Infinity') or v_cost<0 or v_cost>999999999999 or v_cost::text in ('NaN','Infinity','-Infinity')
       or (p_document_type='transfer' and (v_dest is null or v_dest=v_wh))
       or (p_document_type<>'transfer' and v_dest is not null) then
      raise exception 'Ligne de stock invalide.' using errcode='22023';
    end if;
    if not exists(select 1 from public.stock_products p where p.company_id=p_company_id and p.id=v_product and p.active and p.product_type<>'service') then
      raise exception 'Article physique introuvable ou inactif.' using errcode='22023';
    end if;
    if not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=v_wh and w.active) then
      raise exception 'Entrepôt source introuvable ou inactif.' using errcode='22023';
    end if;
    if v_dest is not null and not exists(select 1 from public.stock_warehouses w where w.company_id=p_company_id and w.id=v_dest and w.active) then
      raise exception 'Entrepôt destination introuvable ou inactif.' using errcode='22023';
    end if;
    insert into public.stock_balances(company_id,product_id,warehouse_id) values(p_company_id,v_product,v_wh) on conflict do nothing;
    select * into v_balance from public.stock_balances where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh for update;
    if p_document_type in ('issue','transfer') or (p_document_type='adjustment' and coalesce((v_line->>'direction'),'')='decrease') then
      -- Une sortie commerciale consomme automatiquement les réservations les plus anciennes
      -- du même article et entrepôt. Les réservations non consommées restent protégées.
      if p_document_type='issue' and p_source_type in ('sales_invoice','sales_delivery') then
        v_reservation_left:=v_qty;
        for v_reservation in
          select r.* from public.stock_reservations r
          where r.company_id=p_company_id and r.product_id=v_product and r.warehouse_id=v_wh and r.status='active'
          order by r.created_at,r.id
          for update
        loop
          exit when v_reservation_left<=0;
          v_reservation_take:=least(v_reservation_left,v_reservation.quantity);
          if v_reservation_take>=v_reservation.quantity then
            update public.stock_reservations set status='fulfilled',released_at=now()
            where company_id=p_company_id and id=v_reservation.id;
          else
            update public.stock_reservations set quantity=quantity-v_reservation_take
            where company_id=p_company_id and id=v_reservation.id;
          end if;
          insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
          values(
            p_company_id,v_actor,
            case when v_reservation_take>=v_reservation.quantity then 'stock.reservation_fulfilled' else 'stock.reservation_partially_fulfilled' end,
            'stock_reservation',v_reservation.id::text,
            jsonb_build_object('source_type',p_source_type,'source_id',p_source_id,
              'consumed_quantity',v_reservation_take,
              'remaining_quantity',greatest(0,v_reservation.quantity-v_reservation_take))
          );
          v_reservation_left:=v_reservation_left-v_reservation_take;
        end loop;
      end if;
      select coalesce(sum(r.quantity),0) into v_reserved from public.stock_reservations r
        where r.company_id=p_company_id and r.product_id=v_product and r.warehouse_id=v_wh and r.status='active';
      if v_balance.quantity < v_reserved then
        raise exception 'Le stock physique est inférieur aux quantités déjà réservées.' using errcode='23514';
      end if;
      if v_reserved>0 and v_qty>greatest(v_balance.quantity-v_reserved,0) then
        raise exception 'Cette sortie empiéterait sur des quantités réservées.' using errcode='23514';
      end if;
      if (p_document_type='transfer' or not v_settings.allow_negative) and v_balance.quantity-v_reserved<v_qty then
        raise exception 'Stock disponible insuffisant pour l’article % : disponible hors réservations %, demandé %.',v_product,v_balance.quantity-v_reserved,v_qty using errcode='23514';
      end if;
      v_issue_cost:=0;
      if v_settings.valuation_method='fifo' then
        v_left:=v_qty;
        for v_layer in select * from public.stock_valuation_layers
          where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh and remaining_quantity>0
          order by created_at,id for update
        loop
          exit when v_left<=0;
          v_take:=least(v_left,v_layer.remaining_quantity);
          v_issue_cost:=v_issue_cost+v_take*v_layer.unit_cost;
          update public.stock_valuation_layers set remaining_quantity=remaining_quantity-v_take where id=v_layer.id;
          v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('layer_id',v_layer.id,'quantity',v_take,'unit_cost',v_layer.unit_cost));
          v_left:=v_left-v_take;
        end loop;
        if v_left>0 then
          raise exception 'Couches FIFO insuffisantes : la méthode FIFO interdit le stock négatif.' using errcode='23514';
        end if;
      else
        v_unit_cost:=case when v_balance.quantity>0 then v_balance.inventory_value/v_balance.quantity else 0 end;
        v_issue_cost:=least(v_qty,greatest(v_balance.quantity,0))*v_unit_cost;
      end if;
      v_issue_cost:=round(v_issue_cost,6);
      insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers)
      values(p_company_id,v_doc,v_no,v_product,v_wh,v_dest,v_qty,case when v_qty=0 then 0 else v_issue_cost/v_qty end,v_issue_cost,v_line->>'lot_code',coalesce(v_line->'serial_numbers','[]'::jsonb));
      insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
      values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_wh,-v_qty,-v_issue_cost,case when v_qty=0 then 0 else v_issue_cost/v_qty end,p_document_date)
      returning id into v_source_movement;
      if v_settings.valuation_method='fifo' then
        insert into public.stock_valuation_allocations(company_id,movement_id,layer_id,quantity,unit_cost)
        select p_company_id,v_source_movement,(a->>'layer_id')::bigint,(a->>'quantity')::numeric,(a->>'unit_cost')::numeric
        from jsonb_array_elements(v_allocations) a;
      end if;
      update public.stock_balances set quantity=quantity-v_qty,inventory_value=greatest(0,inventory_value-v_issue_cost),updated_at=now()
      where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh;
      if p_document_type='transfer' then
        insert into public.stock_balances(company_id,product_id,warehouse_id) values(p_company_id,v_product,v_dest) on conflict do nothing;
        update public.stock_balances set quantity=quantity+v_qty,inventory_value=inventory_value+v_issue_cost,updated_at=now()
        where company_id=p_company_id and product_id=v_product and warehouse_id=v_dest;
        insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost)
        values(p_company_id,v_doc,v_no+500,v_product,v_dest,null,v_qty,v_issue_cost/v_qty,v_issue_cost);
        insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
        values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_dest,v_qty,v_issue_cost,v_issue_cost/v_qty,p_document_date)
        returning id into v_dest_movement;
        insert into public.stock_valuation_layers(company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost)
        values(p_company_id,v_product,v_dest,v_dest_movement,v_qty,v_qty,v_issue_cost/v_qty);
      end if;
    else
      v_total:=round(v_qty*v_cost,6);
      insert into public.stock_document_lines(company_id,document_id,line_number,product_id,warehouse_id,destination_warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers)
      values(p_company_id,v_doc,v_no,v_product,v_wh,null,v_qty,v_cost,v_total,v_line->>'lot_code',coalesce(v_line->'serial_numbers','[]'::jsonb));
      insert into public.stock_movements(company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date)
      values(p_company_id,v_doc,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,v_product,v_wh,v_qty,v_total,v_cost,p_document_date)
      returning id into v_source_movement;
      update public.stock_balances set quantity=quantity+v_qty,inventory_value=inventory_value+v_total,updated_at=now()
      where company_id=p_company_id and product_id=v_product and warehouse_id=v_wh;
      insert into public.stock_valuation_layers(company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost)
      values(p_company_id,v_product,v_wh,v_source_movement,v_qty,v_qty,v_cost);
    end if;
  end loop;
  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.document_posted','stock_document',v_doc::text,jsonb_build_object('type',p_document_type,'lines',v_no,'operation_uid',p_operation_uid));
  return jsonb_build_object('ok',true,'duplicate',false,'document_id',v_doc);
end;
$$;
