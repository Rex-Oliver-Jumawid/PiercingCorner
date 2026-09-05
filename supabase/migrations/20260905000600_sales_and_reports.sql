-- Phase 6 completed-sale history, Owner overview metrics, and business reports.

alter table public.transactions
  add column client_name_snapshot text,
  add column completed_at timestamptz;

update public.transactions transaction
set client_name_snapshot = client.full_name
from public.clients client
where client.id = transaction.client_id;

update public.transactions transaction
set completed_at = coalesce(
  (select max(payment.paid_at) from public.payments payment where payment.transaction_id = transaction.id),
  transaction.updated_at,
  transaction.created_at
)
where transaction.status = 'completed';

alter table public.transactions
  alter column client_name_snapshot set not null,
  add constraint transactions_client_name_snapshot_nonempty
    check (btrim(client_name_snapshot) <> ''),
  add constraint transactions_completion_matches_status
    check ((status = 'completed') = (completed_at is not null));

create function public.set_transaction_history_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select client.full_name into new.client_name_snapshot
    from public.clients client where client.id = new.client_id;
    if new.client_name_snapshot is null then
      raise exception using errcode = '23503', message = 'Transaction client not found';
    end if;
    new.completed_at := case when new.status = 'completed' then clock_timestamp() else null end;
    return new;
  end if;

  new.client_name_snapshot := old.client_name_snapshot;
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif old.status <> 'completed' and new.status = 'completed' then
    new.completed_at := clock_timestamp();
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger transactions_set_history_facts
before insert or update on public.transactions
for each row execute function public.set_transaction_history_facts();

create index transactions_completed_at_idx
  on public.transactions (completed_at desc, id desc)
  where status = 'completed';
create index payments_paid_at_idx on public.payments (paid_at);

create function public.get_owner_overview()
returns table (
  today_transactions bigint,
  open_transactions bigint,
  clients bigint,
  collected numeric,
  active_services bigint,
  active_products bigint,
  waiver_template_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  day_start timestamptz := date_trunc('day', clock_timestamp() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  return query
  select
    (select count(*) from public.transactions transaction where transaction.created_at >= day_start and transaction.created_at < day_start + interval '1 day'),
    (select count(*) from public.transactions transaction where transaction.created_at >= day_start and transaction.created_at < day_start + interval '1 day' and transaction.status in ('pending', 'ongoing')),
    (select count(*) from public.clients),
    coalesce((select sum(payment.amount) from public.payments payment join public.transactions transaction on transaction.id = payment.transaction_id where transaction.status = 'completed' and payment.paid_at >= day_start and payment.paid_at < day_start + interval '1 day'), 0),
    (select count(*) from public.services service where service.active),
    (select count(*) from public.products product where product.active),
    (select max(template.version) from public.waiver_templates template);
end;
$$;

create function public.get_sales_metrics()
returns table (collected numeric, completed_transactions bigint, service_sales bigint)
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
    coalesce((select sum(payment.amount) from public.payments payment join public.transactions transaction on transaction.id = payment.transaction_id where transaction.status = 'completed'), 0),
    (select count(*) from public.transactions transaction where transaction.status = 'completed'),
    (select count(*) from public.transactions transaction where transaction.status = 'completed' and exists (select 1 from public.transaction_items item where item.transaction_id = transaction.id and item.item_type = 'service'));
end;
$$;

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
    coalesce(payment_data.paid, 0), coalesce(payment_data.methods, '{}'::text[]),
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

create function public.get_completed_sale(target_transaction_id uuid)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  recorded_by_name text,
  completed_at timestamptz,
  items jsonb,
  payments jsonb,
  total numeric,
  paid numeric,
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
    coalesce((select sum(item.unit_price_snapshot * item.quantity) from public.transaction_items item where item.transaction_id = transaction.id), 0),
    coalesce((select sum(payment.amount) from public.payments payment where payment.transaction_id = transaction.id), 0),
    exists (select 1 from public.waivers waiver where waiver.transaction_id = transaction.id)
  from public.transactions transaction
  join public.staff_accounts account on account.id = transaction.created_by
  where transaction.id = target_transaction_id and transaction.status = 'completed';
end;
$$;

create function public.get_report_summary(from_date date, to_date date)
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
language plpgsql
stable
security definer
set search_path = ''
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
      coalesce((select sum(payment.amount) from public.payments payment where payment.transaction_id = transaction.id), 0) as paid
    from public.transactions transaction
    where transaction.status = 'completed' and transaction.completed_at >= range_start and transaction.completed_at < range_end
  ), visits as (
    select distinct transaction.client_id, (transaction.completed_at at time zone 'Asia/Manila')::date as visit_date
    from period_transactions transaction
  ), period_clients as (
    select transaction.client_id, min(transaction.completed_at) as first_period_completion
    from period_transactions transaction group by transaction.client_id
  ), repeats as (
    select client.client_id from period_clients client
    where exists (select 1 from public.transactions prior where prior.client_id = client.client_id and prior.status = 'completed' and prior.completed_at < client.first_period_completion)
  ), hourly_visits as (
    select distinct transaction.client_id,
      (transaction.completed_at at time zone 'Asia/Manila')::date as visit_date,
      extract(hour from transaction.completed_at at time zone 'Asia/Manila')::integer as hour
    from period_transactions transaction
  ), hours as (
    select visit.hour, count(*)::numeric as visits
    from hourly_visits visit group by visit.hour order by visits desc, visit.hour limit 1
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

create function public.get_report_top_services(from_date date, to_date date)
returns table (service_id uuid, service_name text, completed_quantity bigint, revenue numeric, service_share numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  range_start timestamptz;
  range_end timestamptz;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if from_date is null or to_date is null or from_date > to_date then raise exception using errcode = '22023', message = 'Invalid report date range'; end if;
  range_start := from_date::timestamp at time zone 'Asia/Manila';
  range_end := (to_date + 1)::timestamp at time zone 'Asia/Manila';
  return query
  with lines as (
    select item.service_id, item.item_name_snapshot, item.quantity, item.unit_price_snapshot, transaction.completed_at, item.id
    from public.transaction_items item join public.transactions transaction on transaction.id = item.transaction_id
    where item.item_type = 'service' and transaction.status = 'completed' and transaction.completed_at >= range_start and transaction.completed_at < range_end
  ), grouped as (
    select line.service_id, sum(line.quantity)::bigint as quantity, sum(line.unit_price_snapshot * line.quantity) as line_revenue
    from lines line group by line.service_id
  ), names as (
    select distinct on (line.service_id) line.service_id, line.item_name_snapshot
    from lines line order by line.service_id, line.completed_at desc, line.id desc
  )
  select grouped.service_id, names.item_name_snapshot, grouped.quantity, grouped.line_revenue,
    case when sum(grouped.quantity) over () = 0 then 0 else grouped.quantity::numeric * 100 / sum(grouped.quantity) over () end
  from grouped join names using (service_id)
  order by grouped.quantity desc, grouped.line_revenue desc, grouped.service_id
  limit 3;
end;
$$;

create function public.get_report_weekday_traffic(from_date date, to_date date)
returns table (weekday integer, total_visits bigint, represented_days bigint, average_visits numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if from_date is null or to_date is null or from_date > to_date then raise exception using errcode = '22023', message = 'Invalid report date range'; end if;
  return query
  with days as (
    select day::date as local_date, extract(isodow from day)::integer as weekday
    from generate_series(from_date::timestamp, to_date::timestamp, interval '1 day') day
  ), visits as (
    select distinct transaction.client_id, (transaction.completed_at at time zone 'Asia/Manila')::date as local_date
    from public.transactions transaction
    where transaction.status = 'completed'
      and transaction.completed_at >= from_date::timestamp at time zone 'Asia/Manila'
      and transaction.completed_at < (to_date + 1)::timestamp at time zone 'Asia/Manila'
  )
  select day.weekday, count(visit.client_id), count(distinct day.local_date),
    count(visit.client_id)::numeric / count(distinct day.local_date)
  from days day left join visits visit on visit.local_date = day.local_date
  group by day.weekday order by day.weekday;
end;
$$;

revoke all on function public.get_owner_overview() from public;
revoke all on function public.get_sales_metrics() from public;
revoke all on function public.search_completed_sales(text, text, public.payment_method, date, date) from public;
revoke all on function public.get_completed_sale(uuid) from public;
revoke all on function public.get_report_summary(date, date) from public;
revoke all on function public.get_report_top_services(date, date) from public;
revoke all on function public.get_report_weekday_traffic(date, date) from public;

grant execute on function public.get_owner_overview() to authenticated;
grant execute on function public.get_sales_metrics() to authenticated;
grant execute on function public.search_completed_sales(text, text, public.payment_method, date, date) to authenticated;
grant execute on function public.get_completed_sale(uuid) to authenticated;
grant execute on function public.get_report_summary(date, date) to authenticated;
grant execute on function public.get_report_top_services(date, date) to authenticated;
grant execute on function public.get_report_weekday_traffic(date, date) to authenticated;
