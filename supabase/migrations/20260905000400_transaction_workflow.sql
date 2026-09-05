-- Phase 4 transaction reads and atomic completion boundaries.

create sequence public.transaction_reference_sequence;
revoke all on sequence public.transaction_reference_sequence from public;

create function public.next_transaction_reference()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'TXN-'
    || to_char(current_timestamp at time zone 'Asia/Manila', 'YYMMDD')
    || '-'
    || lpad(nextval('public.transaction_reference_sequence')::text, 6, '0');
$$;

revoke all on function public.next_transaction_reference() from public;

create function public.search_dashboard_transactions(search_text text default '')
returns table (
  id uuid,
  reference_code text,
  status public.transaction_status,
  client_id uuid,
  client_name text,
  recorded_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb,
  total numeric,
  has_waiver boolean,
  payment_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := lower(btrim(coalesce(search_text, '')));
  day_start timestamptz := date_trunc(
    'day', current_timestamp at time zone 'Asia/Manila'
  ) at time zone 'Asia/Manila';
begin
  if not public.is_active_account() then
    return;
  end if;

  return query
  select
    transaction.id,
    transaction.reference_code,
    transaction.status,
    transaction.client_id,
    client.full_name,
    account.display_name,
    transaction.created_at,
    transaction.updated_at,
    coalesce(item_data.items, '[]'::jsonb),
    coalesce(item_data.total, 0::numeric),
    exists (
      select 1 from public.waivers waiver
      where waiver.transaction_id = transaction.id
    ),
    (
      select count(*) from public.payments payment
      where payment.transaction_id = transaction.id
    )
  from public.transactions transaction
  join public.clients client on client.id = transaction.client_id
  join public.staff_accounts account on account.id = transaction.created_by
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'item_type', item.item_type,
          'service_id', item.service_id,
          'product_id', item.product_id,
          'name', item.item_name_snapshot,
          'unit_price', item.unit_price_snapshot,
          'quantity', item.quantity
        ) order by item.created_at, item.id
      ) as items,
      sum(item.unit_price_snapshot * item.quantity) as total
    from public.transaction_items item
    where item.transaction_id = transaction.id
  ) item_data on true
  where transaction.created_at >= day_start
    and transaction.created_at < day_start + interval '1 day'
    and (
      normalized_search = ''
      or strpos(lower(coalesce(transaction.reference_code, '')), normalized_search) > 0
      or strpos(lower(client.full_name), normalized_search) > 0
      or strpos(lower(account.display_name), normalized_search) > 0
      or strpos(lower(transaction.status::text), normalized_search) > 0
      or exists (
        select 1 from public.transaction_items searched_item
        where searched_item.transaction_id = transaction.id
          and strpos(lower(searched_item.item_name_snapshot), normalized_search) > 0
      )
    )
  order by transaction.created_at desc, transaction.id desc;
end;
$$;

create function public.record_product_sale(
  client_details jsonb,
  selected_product_ids uuid[],
  selected_payment_method public.payment_method,
  payment_reference text
)
returns table (id uuid, reference_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_client_id uuid;
  created_transaction_id uuid;
  created_reference text;
  resolved_total numeric(12, 2);
  product_count integer;
  existing_client_id uuid;
  new_client_name text;
  new_client_email text;
  new_client_phone text;
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;

  if jsonb_typeof(client_details) <> 'object' then
    raise exception using errcode = '22023', message = 'Client details are required';
  end if;
  existing_client_id := nullif(client_details ->> 'existing_client_id', '')::uuid;
  new_client_name := client_details ->> 'full_name';
  new_client_email := client_details ->> 'email';
  new_client_phone := client_details ->> 'phone';

  if (existing_client_id is null) = (nullif(btrim(new_client_name), '') is null) then
    raise exception using errcode = '22023', message = 'Choose exactly one client source';
  end if;

  if coalesce(cardinality(selected_product_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'At least one product is required';
  end if;

  if cardinality(selected_product_ids) <> (
    select count(distinct product_id) from unnest(selected_product_ids) product_id
  ) then
    raise exception using errcode = '22023', message = 'Duplicate products are not allowed';
  end if;

  select count(*) into product_count
  from public.products product
  where product.id = any(selected_product_ids) and product.active;
  if product_count <> cardinality(selected_product_ids) then
    raise exception using errcode = '22023', message = 'Every product must exist and be active';
  end if;

  if selected_payment_method <> 'cash' and nullif(btrim(payment_reference), '') is null then
    raise exception using errcode = '22023', message = 'A non-cash payment reference is required';
  end if;

  if existing_client_id is not null then
    select client.id into resolved_client_id
    from public.clients client where client.id = existing_client_id;
    if resolved_client_id is null then
      raise exception using errcode = '22023', message = 'Client not found';
    end if;
  else
    insert into public.clients (full_name, email, phone, created_by)
    values (
      btrim(new_client_name),
      nullif(btrim(new_client_email), ''),
      nullif(btrim(new_client_phone), ''),
      auth.uid()
    )
    returning clients.id into resolved_client_id;
  end if;

  created_reference := public.next_transaction_reference();
  insert into public.transactions (reference_code, client_id, status, created_by)
  values (created_reference, resolved_client_id, 'pending', auth.uid())
  returning transactions.id into created_transaction_id;

  insert into public.transaction_items (
    transaction_id,
    item_type,
    product_id,
    item_name_snapshot,
    unit_price_snapshot,
    quantity
  )
  select created_transaction_id, 'product', product.id, product.name, product.price, 1
  from public.products product
  where product.id = any(selected_product_ids);

  select sum(item.unit_price_snapshot * item.quantity)
  into resolved_total
  from public.transaction_items item
  where item.transaction_id = created_transaction_id;
  if resolved_total is null or resolved_total <= 0 then
    raise exception using errcode = '22023', message = 'Sale total must be positive';
  end if;

  insert into public.payments (
    transaction_id,
    amount,
    payment_method,
    reference_number,
    recorded_by
  )
  values (
    created_transaction_id,
    resolved_total,
    selected_payment_method,
    case when selected_payment_method = 'cash' then null else btrim(payment_reference) end,
    auth.uid()
  );

  update public.transactions
  set status = 'completed'
  where transactions.id = created_transaction_id;

  return query select created_transaction_id, created_reference;
end;
$$;

create function public.finalize_transaction(
  target_transaction_id uuid,
  selected_service_ids uuid[],
  selected_product_ids uuid[],
  selected_payment_method public.payment_method,
  payment_reference text
)
returns table (id uuid, reference_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_transaction public.transactions%rowtype;
  resolved_total numeric(12, 2);
  invalid_count integer;
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;

  select transaction.* into locked_transaction
  from public.transactions transaction
  where transaction.id = target_transaction_id
  for update;

  if locked_transaction.id is null or locked_transaction.status not in ('pending', 'ongoing') then
    raise exception using errcode = '22023', message = 'Transaction is not open';
  end if;

  selected_service_ids := coalesce(selected_service_ids, '{}'::uuid[]);
  selected_product_ids := coalesce(selected_product_ids, '{}'::uuid[]);
  if cardinality(selected_service_ids) + cardinality(selected_product_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one item is required';
  end if;
  if cardinality(selected_service_ids) <> (
      select count(distinct service_id) from unnest(selected_service_ids) service_id
    ) or cardinality(selected_product_ids) <> (
      select count(distinct product_id) from unnest(selected_product_ids) product_id
    ) then
    raise exception using errcode = '22023', message = 'Duplicate catalog items are not allowed';
  end if;

  if cardinality(selected_service_ids) > 0 and not exists (
    select 1 from public.waivers waiver
    where waiver.transaction_id = target_transaction_id
  ) then
    raise exception using errcode = '22023', message = 'A signed waiver is required';
  end if;

  if exists (
    select 1 from public.payments payment
    where payment.transaction_id = target_transaction_id
  ) then
    raise exception using errcode = '22023', message = 'This workflow requires an unpaid transaction';
  end if;

  if selected_payment_method <> 'cash' and nullif(btrim(payment_reference), '') is null then
    raise exception using errcode = '22023', message = 'A non-cash payment reference is required';
  end if;

  select count(*) into invalid_count
  from unnest(selected_service_ids) selected_id
  where not exists (
    select 1 from public.services service
    where service.id = selected_id
      and (
        service.active
        or exists (
          select 1 from public.transaction_items existing_item
          where existing_item.transaction_id = target_transaction_id
            and existing_item.service_id = selected_id
        )
      )
  );
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Selected service is unavailable';
  end if;

  select count(*) into invalid_count
  from unnest(selected_product_ids) selected_id
  where not exists (
    select 1 from public.products product
    where product.id = selected_id
      and (
        product.active
        or exists (
          select 1 from public.transaction_items existing_item
          where existing_item.transaction_id = target_transaction_id
            and existing_item.product_id = selected_id
        )
      )
  );
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Selected product is unavailable';
  end if;

  delete from public.transaction_items item
  where item.transaction_id = target_transaction_id
    and (
      (item.item_type = 'service' and not item.service_id = any(selected_service_ids))
      or (item.item_type = 'product' and not item.product_id = any(selected_product_ids))
    );

  insert into public.transaction_items (
    transaction_id, item_type, service_id, item_name_snapshot, unit_price_snapshot, quantity
  )
  select target_transaction_id, 'service', service.id, service.name, service.price, 1
  from public.services service
  where service.id = any(selected_service_ids)
    and not exists (
      select 1 from public.transaction_items item
      where item.transaction_id = target_transaction_id and item.service_id = service.id
    );

  insert into public.transaction_items (
    transaction_id, item_type, product_id, item_name_snapshot, unit_price_snapshot, quantity
  )
  select target_transaction_id, 'product', product.id, product.name, product.price, 1
  from public.products product
  where product.id = any(selected_product_ids)
    and not exists (
      select 1 from public.transaction_items item
      where item.transaction_id = target_transaction_id and item.product_id = product.id
    );

  select sum(item.unit_price_snapshot * item.quantity)
  into resolved_total
  from public.transaction_items item
  where item.transaction_id = target_transaction_id;
  if resolved_total is null or resolved_total <= 0 then
    raise exception using errcode = '22023', message = 'Transaction total must be positive';
  end if;

  insert into public.payments (
    transaction_id, amount, payment_method, reference_number, recorded_by
  )
  values (
    target_transaction_id,
    resolved_total,
    selected_payment_method,
    case when selected_payment_method = 'cash' then null else btrim(payment_reference) end,
    auth.uid()
  );

  update public.transactions
  set status = 'completed'
  where transactions.id = target_transaction_id;

  return query select locked_transaction.id, locked_transaction.reference_code;
end;
$$;

revoke all on function public.search_dashboard_transactions(text) from public;
revoke all on function public.record_product_sale(jsonb, uuid[], public.payment_method, text) from public;
revoke all on function public.finalize_transaction(uuid, uuid[], uuid[], public.payment_method, text) from public;

grant execute on function public.search_dashboard_transactions(text) to authenticated;
grant execute on function public.record_product_sale(jsonb, uuid[], public.payment_method, text) to authenticated;
grant execute on function public.finalize_transaction(uuid, uuid[], uuid[], public.payment_method, text) to authenticated;
