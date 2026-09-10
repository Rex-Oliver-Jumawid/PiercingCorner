-- Phase 10: Owner Overview keeps recurring configuration readiness separate
-- from the Studio's effective operational window for the Manila business date.
drop function public.get_owner_overview();

create function public.get_owner_overview()
returns table (
  today_transactions bigint,
  open_transactions bigint,
  clients bigint,
  collected numeric,
  active_services bigint,
  active_products bigint,
  waiver_template_version integer,
  studio_days_configured bigint,
  studio_open_days bigint,
  studio_is_open_today boolean,
  studio_opens_at_today time,
  studio_closes_at_today time,
  studio_schedule_source_today text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  manila_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  day_start timestamptz := manila_today::timestamp at time zone 'Asia/Manila';
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;

  return query
  select
    (select count(*) from public.transactions transaction where transaction.created_at >= day_start and transaction.created_at < day_start + interval '1 day'),
    (select count(*) from public.transactions transaction where transaction.created_at >= day_start and transaction.created_at < day_start + interval '1 day' and transaction.status in ('pending', 'ongoing')),
    (select count(*) from public.clients),
    coalesce((select sum(payment.amount) from public.payments payment join public.transactions transaction on transaction.id = payment.transaction_id where transaction.status = 'completed' and payment.paid_at >= day_start and payment.paid_at < day_start + interval '1 day'), 0)
      - coalesce((select sum(adjustment.amount) from public.transaction_adjustments adjustment join public.transactions transaction on transaction.id = adjustment.transaction_id where transaction.status = 'completed' and adjustment.created_at >= day_start and adjustment.created_at < day_start + interval '1 day'), 0),
    (select count(*) from public.services service where service.active),
    (select count(*) from public.products product where product.active),
    (select max(template.version) from public.waiver_templates template),
    (select count(*) from public.studio_hours),
    (select count(*) from public.studio_hours hours where hours.is_open),
    hours.is_open,
    hours.opens_at,
    hours.closes_at,
    hours.source
  from public.get_effective_studio_hours(manila_today) hours;
end;
$$;

revoke all on function public.get_owner_overview() from public;
grant execute on function public.get_owner_overview() to authenticated;

comment on function public.get_owner_overview() is
  'Owner Overview metrics plus recurring Studio configuration counts and today''s Effective Studio Hours. Readiness uses studio_days_configured/studio_open_days only; today''s source is get_effective_studio_hours((clock_timestamp() at time zone ''Asia/Manila'')::date).';
