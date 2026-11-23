begin;

create or replace function private.stock_reverse_document_impl(
  p_company_id uuid,p_document_id uuid,p_operation_uid uuid,p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_doc public.stock_documents%rowtype;
  v_settings public.stock_settings%rowtype;
  v_existing public.stock_documents%rowtype;
  v_reversal_doc_id uuid;
  v_reversal_movement_id bigint;
  v_line record;
  v_move record;
  v_layer record;
  v_allocation record;
  v_balance public.stock_balances%rowtype;
  v_line_no integer:=0;
  v_qty numeric(20,6);
  v_value numeric(20,6);
  v_cost numeric(20,6);
  v_allocated numeric(20,6);
  v_layer_qty numeric(20,6);
  v_reserved numeric(20,6);
  v_hash text;
  v_reason text;
begin
  v_actor:=private.stock_assert_writer(p_company_id);
  v_reason:=btrim(coalesce(p_reason,''));
  if p_document_id is null or p_operation_uid is null or length(v_reason)<5 or length(v_reason)>500 then
    raise exception 'Paramètres de contrepassation invalides : motif obligatoire (5 à 500 caractères).' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':stock',0));

  select * into v_existing
  from public.stock_documents
  where company_id=p_company_id and operation_uid=p_operation_uid;
  if found then
    if v_existing.source_type='reversal' and v_existing.source_id=p_document_id::text then
      return jsonb_build_object('ok',true,'duplicate',true,'reversal_document_id',v_existing.id);
    end if;
    raise exception 'operation_uid déjà utilisé par un autre document.' using errcode='23505';
  end if;

  select * into v_doc
  from public.stock_documents
  where company_id=p_company_id and id=p_document_id
  for update;
  if not found or v_doc.status<>'posted' or v_doc.source_type='reversal' then
    raise exception 'Document indisponible pour contrepassation.' using errcode='55000';
  end if;
  if v_doc.reversed_by_document_id is not null then
    raise exception 'Ce document a déjà été contrepassé.' using errcode='55000';
  end if;

  insert into public.stock_settings(company_id) values(p_company_id) on conflict do nothing;
  select * into v_settings from public.stock_settings where company_id=p_company_id for update;

  if exists(
    select 1 from public.accounting_periods p
    where p.company_id=p_company_id and p.status='closed'
      and current_date between p.start_date and p.end_date
  ) then
    raise exception 'Période comptable clôturée : contrepassation interdite.' using errcode='55000';
  end if;

  if not exists(select 1 from public.stock_movements m where m.company_id=p_company_id and m.document_id=p_document_id) then
    raise exception 'Le document ne contient aucun mouvement physique.' using errcode='55000';
  end if;

  -- Une contrepassation est autorisée uniquement si aucune opération postérieure
  -- n'a touché les mêmes couples article/entrepôt.
  if exists(
    select 1
    from (
      select m.product_id,m.warehouse_id,max(m.id) as last_original_movement
      from public.stock_movements m
      where m.company_id=p_company_id and m.document_id=p_document_id
      group by m.product_id,m.warehouse_id
    ) original
    join public.stock_movements later
      on later.company_id=p_company_id
     and later.product_id=original.product_id
     and later.warehouse_id=original.warehouse_id
     and later.id>original.last_original_movement
     and later.document_id<>p_document_id
  ) then
    raise exception 'Contrepassation refusée : des mouvements ultérieurs concernent le même article et entrepôt. Effectuez une régularisation documentée.' using errcode='55000';
  end if;

  if exists(
    select 1 from public.stock_movements m
    join public.stock_products p on p.company_id=m.company_id and p.id=m.product_id
    where m.company_id=p_company_id and m.document_id=p_document_id and p.tracking<>'none'
  ) then
    raise exception 'Contrepassation automatique indisponible pour les articles suivis par lot ou numéro de série.' using errcode='0A000';
  end if;

  v_hash:=md5(concat_ws('|','adjustment',current_date::text,'REV-'||coalesce(v_doc.reference,v_doc.id::text),v_reason,'reversal',p_document_id::text,p_operation_uid::text));
  insert into public.stock_documents(
    company_id,operation_uid,request_hash,document_type,document_date,reference,note,source_type,source_id,created_by
  ) values(
    p_company_id,p_operation_uid,v_hash,'adjustment',current_date,
    left('REV-'||coalesce(v_doc.reference,v_doc.id::text),120),
    v_reason,'reversal',p_document_id::text,v_actor
  ) returning id into v_reversal_doc_id;

  for v_move in
    select m.*,l.line_number,l.lot_code,l.serial_numbers
    from public.stock_movements m
    join public.stock_document_lines l
      on l.company_id=m.company_id and l.id=m.line_id
    where m.company_id=p_company_id and m.document_id=p_document_id
    order by m.id
  loop
    v_line_no:=v_line_no+1;
    v_qty:=abs(v_move.quantity_delta);
    v_value:=abs(v_move.value_delta);
    v_cost:=case when v_qty=0 then 0 else round(v_value/v_qty,6) end;

    insert into public.stock_balances(company_id,product_id,warehouse_id)
    values(p_company_id,v_move.product_id,v_move.warehouse_id)
    on conflict do nothing;
    select * into v_balance
    from public.stock_balances
    where company_id=p_company_id and product_id=v_move.product_id and warehouse_id=v_move.warehouse_id
    for update;

    if v_move.quantity_delta>0 then
      -- Le mouvement original avait ajouté du stock : on retire exactement sa
      -- quantité et sa valeur, sans recalculer un coût moyen différent.
      if v_balance.quantity<v_qty or v_balance.inventory_value+0.000001<v_value then
        raise exception 'Contrepassation impossible : quantité ou valeur disponible insuffisante.' using errcode='23514';
      end if;
      select coalesce(sum(r.quantity),0) into v_reserved
      from public.stock_reservations r
      where r.company_id=p_company_id and r.product_id=v_move.product_id
        and r.warehouse_id=v_move.warehouse_id and r.status='active';
      if v_balance.quantity-v_qty<v_reserved then
        raise exception 'Contrepassation refusée : elle réduirait le stock sous les quantités réservées.' using errcode='23514';
      end if;

      select coalesce(sum(x.remaining_quantity),0),coalesce(sum(x.original_quantity),0)
      into v_layer_qty,v_allocated
      from public.stock_valuation_layers x
      where x.company_id=p_company_id and x.source_movement_id=v_move.id;
      if v_layer_qty<>v_qty or v_allocated<>v_qty then
        raise exception 'Contrepassation refusée : la couche de valorisation d''origine a déjà été consommée ou altérée.' using errcode='55000';
      end if;

      for v_layer in
        select * from public.stock_valuation_layers
        where company_id=p_company_id and source_movement_id=v_move.id
        for update
      loop
        update public.stock_valuation_layers set remaining_quantity=0
        where company_id=p_company_id and id=v_layer.id;
      end loop;

      update public.stock_balances
      set quantity=quantity-v_qty,inventory_value=round(inventory_value-v_value,6),updated_at=now()
      where company_id=p_company_id and product_id=v_move.product_id and warehouse_id=v_move.warehouse_id;
    else
      -- Le mouvement original avait sorti du stock : on restitue la valeur
      -- exacte. En FIFO, chaque allocation recrée une couche au coût historique.
      if v_settings.valuation_method='fifo' then
        select coalesce(sum(a.quantity),0) into v_allocated
        from public.stock_valuation_allocations a
        where a.company_id=p_company_id and a.movement_id=v_move.id;
        if v_allocated<>v_qty then
          raise exception 'Contrepassation refusée : allocations FIFO historiques incomplètes.' using errcode='55000';
        end if;
      end if;

      update public.stock_balances
      set quantity=quantity+v_qty,inventory_value=round(inventory_value+v_value,6),updated_at=now()
      where company_id=p_company_id and product_id=v_move.product_id and warehouse_id=v_move.warehouse_id;
    end if;

    insert into public.stock_document_lines(
      company_id,document_id,line_number,product_id,warehouse_id,quantity,unit_cost,total_cost,lot_code,serial_numbers
    ) values(
      p_company_id,v_reversal_doc_id,v_line_no,v_move.product_id,v_move.warehouse_id,
      v_qty,v_cost,v_value,v_move.lot_code,coalesce(v_move.serial_numbers,'[]'::jsonb)
    );

    insert into public.stock_movements(
      company_id,document_id,line_id,product_id,warehouse_id,quantity_delta,value_delta,unit_cost,movement_date
    ) values(
      p_company_id,v_reversal_movement_id,currval(pg_get_serial_sequence('public.stock_document_lines','id'))::bigint,
      v_move.product_id,v_move.warehouse_id,-v_move.quantity_delta,-v_move.value_delta,v_cost,current_date
    ) returning id into v_reversal_movement_id;

    -- Le document et chaque mouvement ont des identifiants distincts.
    if v_move.quantity_delta<0 and v_settings.valuation_method='fifo' then
      for v_allocation in
        select a.* from public.stock_valuation_allocations a
        where a.company_id=p_company_id and a.movement_id=v_move.id
        order by a.id
      loop
        insert into public.stock_valuation_allocations(company_id,movement_id,layer_id,quantity,unit_cost)
        values(p_company_id,v_reversal_movement_id,v_allocation.layer_id,v_allocation.quantity,v_allocation.unit_cost);
        insert into public.stock_valuation_layers(
          company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost
        ) values(
          p_company_id,v_move.product_id,v_move.warehouse_id,v_reversal_movement_id,
          v_allocation.quantity,v_allocation.quantity,v_allocation.unit_cost
        );
      end loop;
    elsif v_move.quantity_delta<0 then
      insert into public.stock_valuation_layers(
        company_id,product_id,warehouse_id,source_movement_id,original_quantity,remaining_quantity,unit_cost
      ) values(p_company_id,v_move.product_id,v_move.warehouse_id,v_reversal_movement_id,v_qty,v_qty,v_cost);
    else
      -- La contrepassation d'une entrée doit garder une trace de la couche
      -- exacte neutralisée, notamment pour l'audit FIFO.
      for v_layer in
        select * from public.stock_valuation_layers
        where company_id=p_company_id and source_movement_id=v_move.id
      loop
        insert into public.stock_valuation_allocations(company_id,movement_id,layer_id,quantity,unit_cost)
        values(p_company_id,v_reversal_movement_id,v_layer.id,v_layer.original_quantity,v_layer.unit_cost);
      end loop;
    end if;
  end loop;

  -- L'identifiant du document n'est pas celui du dernier mouvement.
  update public.stock_documents
  set status='reversed',reversed_by_document_id=v_reversal_doc_id
  where company_id=p_company_id and id=p_document_id;

  insert into public.stock_audit_logs(company_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_company_id,v_actor,'stock.document_reversed','stock_document',p_document_id::text,
    jsonb_build_object('reversal_document_id',v_reversal_doc_id,'reason',v_reason,'valuation_method',v_settings.valuation_method));

  return jsonb_build_object('ok',true,'duplicate',false,'reversal_document_id',v_reversal_doc_id);
end;
$$;

revoke all on function private.stock_reverse_document_impl(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.stock_reverse_document_impl(uuid,uuid,uuid,text) to authenticated;

commit;