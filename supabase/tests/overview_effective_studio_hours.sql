-- Phase 10 integration tests: Overview uses recurring configuration for
-- readiness and the canonical resolver for today's Manila operating state.
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is distinct from true then
    raise exception 'assertion failed: %', message;
  end if;
end $$;

insert into auth.users (id, email) values
('73000000-0000-0000-0000-000000000001', 'overview-owner@test.local'),
('73000000-0000-0000-0000-000000000002', 'overview-staff@test.local');
insert into public.staff_accounts (id, display_name, role, status) values
('73000000-0000-0000-0000-000000000001', 'Overview Owner', 'owner', 'active'),
('73000000-0000-0000-0000-000000000002', 'Overview Staff', 'staff', 'active');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000001', true);

-- A structurally complete recurring schedule stays ready, including when the
-- current recurring weekday is deliberately closed.
update public.studio_hours set is_open = true, opens_at = '10:00', closes_at = '20:00';
select pg_temp.assert_true((
  select studio_days_configured = 7
    and studio_open_days = 7
    and studio_is_open_today
    and studio_opens_at_today = '10:00'
    and studio_closes_at_today = '20:00'
    and studio_schedule_source_today = 'recurring'
  from public.get_owner_overview()
), 'complete recurring configuration must be ready with recurring effective hours');

update public.studio_hours
set is_open = false, opens_at = null, closes_at = null
where weekday = extract(isodow from clock_timestamp() at time zone 'Asia/Manila')::smallint;
select pg_temp.assert_true((
  select studio_days_configured = 7
    and studio_open_days = 6
    and not studio_is_open_today
    and studio_schedule_source_today = 'recurring'
  from public.get_owner_overview()
), 'a recurring closed weekday must not make the complete recurring configuration unready');
update public.studio_hours set is_open = true, opens_at = '10:00', closes_at = '20:00';

create temporary table overview_metrics_before as
select today_transactions, open_transactions, clients, collected, active_services,
  active_products, waiver_template_version
from public.get_owner_overview();

select public.configure_temporary_studio_schedule(
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  (select jsonb_agg(jsonb_build_object(
    'weekday', weekday,
    'is_open', weekday <> extract(isodow from clock_timestamp() at time zone 'Asia/Manila')::smallint,
    'opens_at', case when weekday <> extract(isodow from clock_timestamp() at time zone 'Asia/Manila')::smallint then '12:00' end,
    'closes_at', case when weekday <> extract(isodow from clock_timestamp() at time zone 'Asia/Manila')::smallint then '18:00' end
  ) order by weekday) from generate_series(1, 7) weekday)
);
select pg_temp.assert_true((
  select studio_days_configured = 7
    and studio_open_days = 7
    and not studio_is_open_today
    and studio_schedule_source_today = 'temporary'
  from public.get_owner_overview()
), 'a temporary closure must change only today''s operational state');

select public.configure_temporary_studio_schedule(
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  (select jsonb_agg(jsonb_build_object(
    'weekday', weekday, 'is_open', true, 'opens_at', '12:00', 'closes_at', '18:00'
  ) order by weekday) from generate_series(1, 7) weekday),
  (select id from public.studio_temporary_schedules limit 1)
);
select pg_temp.assert_true((
  select studio_is_open_today
    and studio_opens_at_today = '12:00'
    and studio_closes_at_today = '18:00'
    and studio_schedule_source_today = 'temporary'
  from public.get_owner_overview()
), 'a temporary schedule must expose its effective interval and source');

insert into public.studio_exceptions (exception_date, exception_type, reason)
values ((clock_timestamp() at time zone 'Asia/Manila')::date, 'closed', 'Overview integration closure');
select pg_temp.assert_true((
  select studio_days_configured = 7
    and studio_open_days = 7
    and not studio_is_open_today
    and studio_opens_at_today is null
    and studio_closes_at_today is null
    and studio_schedule_source_today = 'exception'
  from public.get_owner_overview()
), 'an exception closure must not erase recurring readiness');

update public.studio_exceptions
set exception_type = 'reduced_hours', opens_at = '13:00', closes_at = '17:00'
where exception_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
set local timezone = 'America/Los_Angeles';
select pg_temp.assert_true((
  select studio_is_open_today
    and studio_opens_at_today = '13:00'
    and studio_closes_at_today = '17:00'
    and studio_schedule_source_today = 'exception'
  from public.get_owner_overview()
), 'Overview must derive today in Asia/Manila and expose reduced exception hours');
select pg_temp.assert_true(not exists (
  select 1 from overview_metrics_before before_metrics
  cross join public.get_owner_overview() current_metrics
  where row(before_metrics.today_transactions, before_metrics.open_transactions,
    before_metrics.clients, before_metrics.collected, before_metrics.active_services,
    before_metrics.active_products, before_metrics.waiver_template_version)
    is distinct from row(current_metrics.today_transactions, current_metrics.open_transactions,
      current_metrics.clients, current_metrics.collected, current_metrics.active_services,
      current_metrics.active_products, current_metrics.waiver_template_version)
), 'scheduling integration must not alter unrelated Overview business metrics');

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000002', true);
do $$ begin
  begin
    perform public.get_owner_overview();
    raise exception 'staff Overview access unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
