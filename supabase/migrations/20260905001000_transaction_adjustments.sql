-- Owner-only, append-only refund and void adjustments for completed sales.

create type public.transaction_adjustment_type as enum ('refund', 'void');

create table public.transaction_adjustments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null
    references public.transactions (id) on delete restrict,
  adjustment_type public.transaction_adjustment_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  recorded_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index transaction_adjustments_transaction_id_idx
  on public.transaction_adjustments (transaction_id);
create index transaction_adjustments_created_at_idx
  on public.transaction_adjustments (created_at);

alter table public.transaction_adjustments enable row level security;

create policy "owners read transaction adjustments"
on public.transaction_adjustments for select to authenticated
using (public.is_owner());

-- Inserts are deliberately available only through the checked RPC. There are
-- no UPDATE or DELETE policies, so original adjustment facts stay immutable.
create function public.cancel_completed_transaction(
  target_transaction_id uuid,
  selected_adjustment_type public.transaction_adjustment_type,
  cancellation_reason text
)
returns table (
  id uuid,
  transaction_id uuid,
  adjustment_type public.transaction_adjustment_type,
  amount numeric,
  reason text,
  recorded_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status public.transaction_status;
  transaction_total numeric;
  paid_total numeric;
  adjusted_total numeric;
  remaining_amount numeric;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  if nullif(btrim(cancellation_reason), '') is null then
    raise exception using errcode = '22023', message = 'Cancellation reason is required';
  end if;

  select transaction.status into target_status
  from public.transactions transaction
  where transaction.id = target_transaction_id
  for update;

  if target_status is null then
    raise exception using errcode = 'P0002', message = 'Completed transaction not found';
  end if;
  if target_status <> 'completed' then
    raise exception using errcode = '22023', message = 'Only completed transactions can be refunded or voided';
  end if;

  select coalesce(sum(item.unit_price_snapshot * item.quantity), 0)
  into transaction_total
  from public.transaction_items item
  where item.transaction_id = target_transaction_id;

  select coalesce(sum(payment.amount), 0)
  into paid_total
  from public.payments payment
  where payment.transaction_id = target_transaction_id;

  select coalesce(sum(adjustment.amount), 0)
  into adjusted_total
  from public.transaction_adjustments adjustment
  where adjustment.transaction_id = target_transaction_id;

  remaining_amount := least(transaction_total, paid_total) - adjusted_total;
  if remaining_amount <= 0 then
    raise exception using errcode = '22023', message = 'This transaction has no remaining refundable value';
  end if;

  return query
  insert into public.transaction_adjustments (
    transaction_id,
    adjustment_type,
    amount,
    reason,
    recorded_by
  ) values (
    target_transaction_id,
    selected_adjustment_type,
    remaining_amount,
    btrim(cancellation_reason),
    auth.uid()
  )
  returning
    transaction_adjustments.id,
    transaction_adjustments.transaction_id,
    transaction_adjustments.adjustment_type,
    transaction_adjustments.amount,
    transaction_adjustments.reason,
    transaction_adjustments.recorded_by,
    transaction_adjustments.created_at;
end;
$$;

drop function public.get_sales_metrics();
create function public.get_sales_metrics()
returns table (net_revenue numeric, completed_transactions bigint, adjustments numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  return query
  select
    coalesce((select sum(payment.amount) from public.payments payment join public.transactions transaction on transaction.id = payment.transaction_id where transaction.status = 'completed'), 0)
      - coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment join public.transactions transaction on transaction.id = adjustment.transaction_id where transaction.status = 'completed'), 0),
    (select count(*) from public.transactions transaction where transaction.status = 'completed'),
    coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment join public.transactions transaction on transaction.id = adjustment.transaction_id where transaction.status = 'completed'), 0);
end;
$$;

drop function public.search_completed_sales(text, text, public.payment_method, date, date);
create function public.search_completed_sales(
  search_text text default '',
  sale_type text default 'all',
  payment_method_filter public.payment_method default null,
  from_date date default null,
  to_date date default null
)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  recorded_by_name text,
  completed_at timestamptz,
  items jsonb,
  total numeric,
  paid numeric,
  adjustments numeric,
  net_total numeric,
  financial_status text,
  payment_methods text[],
  has_service boolean,
  has_product boolean,
  has_waiver boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := lower(btrim(coalesce(search_text, '')));
  range_start timestamptz := case when from_date is null then null else from_date::timestamp at time zone 'Asia/Manila' end;
  range_end timestamptz := case when to_date is null then null else (to_date + 1)::timestamp at time zone 'Asia/Manila' end;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  if sale_type not in ('all', 'service', 'product') then
    raise exception using errcode = '22023', message = 'Invalid sale type';
  end if;
  if from_date is not null and to_date is not null and from_date > to_date then
    raise exception using errcode = '22023', message = 'Invalid report date range';
  end if;

  return query
  select transaction.id, transaction.reference_code, transaction.client_name_snapshot,
    account.display_name, transaction.completed_at,
    coalesce(item_data.items, '[]'::jsonb), coalesce(item_data.total, 0),
    coalesce(payment_data.paid, 0), coalesce(adjustment_data.amount, 0),
    greatest(coalesce(payment_data.paid, 0) - coalesce(adjustment_data.amount, 0), 0),
    coalesce(adjustment_data.latest_type, 'completed'),
    coalesce(payment_data.methods, '{}'::text[]),
    coalesce(item_data.has_service, false), coalesce(item_data.has_product, false),
    exists (select 1 from public.waivers waiver where waiver.transaction_id = transaction.id)
  from public.transactions transaction
  join public.staff_accounts account on account.id = transaction.created_by
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', item.id, 'item_type', item.item_type, 'name', item.item_name_snapshot,
      'unit_price', item.unit_price_snapshot, 'quantity', item.quantity
    ) order by item.created_at, item.id) as items,
    sum(item.unit_price_snapshot * item.quantity) as total,
    bool_or(item.item_type = 'service') as has_service,
    bool_or(item.item_type = 'product') as has_product
    from public.transaction_items item where item.transaction_id = transaction.id
  ) item_data on true
  left join lateral (
    select sum(payment.amount) as paid,
      array_agg(distinct payment.payment_method::text order by payment.payment_method::text) as methods
    from public.payments payment where payment.transaction_id = transaction.id
  ) payment_data on true
  left join lateral (
    select sum(adjustment.amount) as amount,
      (array_agg(adjustment.adjustment_type::text order by adjustment.created_at desc, adjustment.id desc))[1] as latest_type
    from public.transaction_adjustments adjustment where adjustment.transaction_id = transaction.id
  ) adjustment_data on true
  where transaction.status = 'completed'
    and (range_start is null or transaction.completed_at >= range_start)
    and (range_end is null or transaction.completed_at < range_end)
    and (sale_type = 'all' or (sale_type = 'service' and item_data.has_service) or (sale_type = 'product' and item_data.has_product))
    and (payment_method_filter is null or exists (select 1 from public.payments payment where payment.transaction_id = transaction.id and payment.payment_method = payment_method_filter))
    and (
      normalized_search = ''
      or strpos(lower(coalesce(transaction.reference_code, '')), normalized_search) > 0
      or strpos(lower(transaction.client_name_snapshot), normalized_search) > 0
      or exists (select 1 from public.transaction_items item where item.transaction_id = transaction.id and strpos(lower(item.item_name_snapshot), normalized_search) > 0)
    )
  order by transaction.completed_at desc, transaction.id desc;
end;
$$;

drop function public.get_completed_sale(uuid);
create function public.get_completed_sale(target_transaction_id uuid)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  recorded_by_name text,
  completed_at timestamptz,
  items jsonb,
  payments jsonb,
  adjustment_history jsonb,
  total numeric,
  paid numeric,
  adjustments numeric,
  net_total numeric,
  financial_status text,
  has_waiver boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  return query
  select transaction.id, transaction.reference_code, transaction.client_name_snapshot,
    account.display_name, transaction.completed_at,
    coalesce((select jsonb_agg(jsonb_build_object('id', item.id, 'item_type', item.item_type, 'name', item.item_name_snapshot, 'unit_price', item.unit_price_snapshot, 'quantity', item.quantity) order by item.created_at, item.id) from public.transaction_items item where item.transaction_id = transaction.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', payment.id, 'amount', payment.amount, 'method', payment.payment_method, 'reference', payment.reference_number, 'paid_at', payment.paid_at) order by payment.paid_at, payment.id) from public.payments payment where payment.transaction_id = transaction.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', adjustment.id, 'type', adjustment.adjustment_type, 'amount', adjustment.amount, 'reason', adjustment.reason, 'recorded_by_name', recorder.display_name, 'created_at', adjustment.created_at) order by adjustment.created_at, adjustment.id) from public.transaction_adjustments adjustment join public.staff_accounts recorder on recorder.id = adjustment.recorded_by where adjustment.transaction_id = transaction.id), '[]'::jsonb),
    coalesce((select sum(item.unit_price_snapshot * item.quantity) from public.transaction_items item where item.transaction_id = transaction.id), 0),
    coalesce((select sum(payment.amount) from public.payments payment where payment.transaction_id = transaction.id), 0),
    coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment where adjustment.transaction_id = transaction.id), 0),
    greatest(coalesce((select sum(payment.amount) from public.payments payment where payment.transaction_id = transaction.id), 0) - coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment where adjustment.transaction_id = transaction.id), 0), 0),
    coalesce((select adjustment.adjustment_type::text from public.transaction_adjustments adjustment where adjustment.transaction_id = transaction.id order by adjustment.created_at desc, adjustment.id desc limit 1), 'completed'),
    exists (select 1 from public.waivers waiver where waiver.transaction_id = transaction.id)
  from public.transactions transaction
  join public.staff_accounts account on account.id = transaction.created_by
  where transaction.id = target_transaction_id and transaction.status = 'completed';
end;
$$;

-- Existing Owner overview/report signatures stay stable, but revenue becomes net
-- of immutable refund and void adjustments.
create or replace function public.get_owner_overview()
returns table (
  today_transactions bigint,
  open_transactions bigint,
  clients bigint,
  collected numeric,
  active_services bigint,
  active_products bigint,
  waiver_template_version integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  day_start timestamptz := date_trunc('day', clock_timestamp() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  return query select
    (select count(*) from public.transactions transaction where transaction.created_at >= day_start and transaction.created_at < day_start + interval '1 day'),
    (select count(*) from public.transactions transaction where transaction.created_at >= day_start and transaction.created_at < day_start + interval '1 day' and transaction.status in ('pending', 'ongoing')),
    (select count(*) from public.clients),
    coalesce((select sum(payment.amount) from public.payments payment join public.transactions transaction on transaction.id = payment.transaction_id where transaction.status = 'completed' and payment.paid_at >= day_start and payment.paid_at < day_start + interval '1 day'), 0)
      - coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment join public.transactions transaction on transaction.id = adjustment.transaction_id where transaction.status = 'completed' and adjustment.created_at >= day_start and adjustment.created_at < day_start + interval '1 day'), 0),
    (select count(*) from public.services service where service.active),
    (select count(*) from public.products product where product.active),
    (select max(template.version) from public.waiver_templates template);
end;
$$;

create or replace function public.get_report_summary(from_date date, to_date date)
returns table (
  revenue numeric,
  completed_transactions bigint,
  service_transactions bigint,
  average_customer_visits_per_day numeric,
  peak_hour integer,
  peak_hour_average numeric,
  average_transaction_value numeric,
  unique_clients bigint,
  repeat_clients bigint,
  repeat_client_rate numeric,
  product_attach_rate numeric
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  range_start timestamptz;
  range_end timestamptz;
  range_days integer;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if from_date is null or to_date is null or from_date > to_date then raise exception using errcode = '22023', message = 'Invalid report date range'; end if;
  range_start := from_date::timestamp at time zone 'Asia/Manila';
  range_end := (to_date + 1)::timestamp at time zone 'Asia/Manila';
  range_days := to_date - from_date + 1;
  return query
  with period_transactions as (
    select transaction.*,
      exists (select 1 from public.transaction_items item where item.transaction_id = transaction.id and item.item_type = 'service') as has_service,
      exists (select 1 from public.transaction_items item where item.transaction_id = transaction.id and item.item_type = 'product') as has_product,
      greatest(
        coalesce((select sum(payment.amount) from public.payments payment where payment.transaction_id = transaction.id), 0)
          - coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment where adjustment.transaction_id = transaction.id), 0),
        0
      ) as paid
    from public.transactions transaction
    where transaction.status = 'completed' and transaction.completed_at >= range_start and transaction.completed_at < range_end
  ), visits as (
    select distinct transaction.client_id, (transaction.completed_at at time zone 'Asia/Manila')::date as visit_date from period_transactions transaction
  ), period_clients as (
    select transaction.client_id, min(transaction.completed_at) as first_period_completion from period_transactions transaction group by transaction.client_id
  ), repeats as (
    select client.client_id from period_clients client where exists (select 1 from public.transactions prior where prior.client_id = client.client_id and prior.status = 'completed' and prior.completed_at < client.first_period_completion)
  ), hourly_visits as (
    select distinct transaction.client_id, (transaction.completed_at at time zone 'Asia/Manila')::date as visit_date, extract(hour from transaction.completed_at at time zone 'Asia/Manila')::integer as hour from period_transactions transaction
  ), hours as (
    select visit.hour, count(*)::numeric as visits from hourly_visits visit group by visit.hour order by visits desc, visit.hour limit 1
  )
  select coalesce(sum(transaction.paid), 0), count(*), count(*) filter (where transaction.has_service),
    coalesce((select count(*)::numeric / range_days from visits), 0),
    (select hour from hours), coalesce((select visits / range_days from hours), 0),
    case when count(*) = 0 then 0 else coalesce(sum(transaction.paid), 0) / count(*) end,
    (select count(*) from period_clients), (select count(*) from repeats),
    case when (select count(*) from period_clients) = 0 then 0 else (select count(*) from repeats)::numeric * 100 / (select count(*) from period_clients) end,
    case when count(*) filter (where transaction.has_service) = 0 then 0 else count(*) filter (where transaction.has_service and transaction.has_product)::numeric * 100 / count(*) filter (where transaction.has_service) end
  from period_transactions transaction;
end;
$$;

revoke all on function public.cancel_completed_transaction(uuid, public.transaction_adjustment_type, text) from public;
revoke all on function public.get_sales_metrics() from public;
revoke all on function public.search_completed_sales(text, text, public.payment_method, date, date) from public;
revoke all on function public.get_completed_sale(uuid) from public;

grant execute on function public.cancel_completed_transaction(uuid, public.transaction_adjustment_type, text) to authenticated;
grant execute on function public.get_sales_metrics() to authenticated;
grant execute on function public.search_completed_sales(text, text, public.payment_method, date, date) to authenticated;
grant execute on function public.get_completed_sale(uuid) to authenticated;
