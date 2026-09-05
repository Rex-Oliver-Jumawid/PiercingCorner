-- Focused local RLS checks. Run only against the local Supabase database:
-- docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
--
-- All setup and assertions run inside a transaction that is rolled back, so this
-- file never creates durable sample business data.

begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not p_condition then
    raise exception '%', p_message;
  end if;
end;
$$;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls-staff@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rls-inactive@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff_accounts (id, display_name, role, status)
values
  ('00000000-0000-0000-0000-000000000001', 'RLS Owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'RLS Staff', 'staff', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'RLS Inactive', 'staff', 'inactive');

insert into public.services (id, name, price, active)
values
  ('00000000-0000-0000-0000-000000000101', 'RLS Active Service', 100.00, true),
  ('00000000-0000-0000-0000-000000000102', 'RLS Inactive Service', 200.00, false);

insert into public.products (id, name, price, active)
values
  ('00000000-0000-0000-0000-000000000201', 'RLS Active Product', 50.00, true),
  ('00000000-0000-0000-0000-000000000202', 'RLS Inactive Product', 75.00, false);

insert into public.piercer_profiles (id, display_name, active)
values
  ('00000000-0000-0000-0000-000000000211', 'RLS Active Piercer', true),
  ('00000000-0000-0000-0000-000000000212', 'RLS Inactive Piercer', false);

insert into public.stations (id, name, active)
values
  ('00000000-0000-0000-0000-000000000221', 'RLS Active Station', true),
  ('00000000-0000-0000-0000-000000000222', 'RLS Inactive Station', false);

insert into public.waiver_templates (id, version, body, created_by)
values
  ('00000000-0000-0000-0000-000000000301', 2, 'Template version two', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000302', 3, 'Template version three', '00000000-0000-0000-0000-000000000001');

select pg_temp.assert_true(
  bool_and(
    has_table_privilege(
      'authenticated',
      format('public.%I', required.table_name),
      required.privilege
    )
  ),
  'authenticated must have the table privileges required by its RLS policies'
)
from (
  values
    ('staff_accounts', 'select'),
    ('clients', 'select'), ('clients', 'insert'), ('clients', 'update'),
    ('services', 'select'), ('services', 'insert'), ('services', 'update'),
    ('products', 'select'), ('products', 'insert'), ('products', 'update'),
    ('transactions', 'select'), ('transactions', 'insert'), ('transactions', 'update'),
    ('transaction_items', 'select'), ('transaction_items', 'insert'), ('transaction_items', 'update'), ('transaction_items', 'delete'),
    ('payments', 'select'), ('payments', 'insert'),
    ('waiver_templates', 'select'), ('waiver_templates', 'insert'),
    ('waivers', 'select'),
    ('transaction_adjustments', 'select'),
    ('piercer_profiles', 'select'), ('piercer_profiles', 'insert'), ('piercer_profiles', 'update'),
    ('stations', 'select'), ('stations', 'insert'), ('stations', 'update'),
    ('studio_hours', 'select'), ('studio_hours', 'update'),
    ('piercer_service_qualifications', 'select'), ('piercer_service_qualifications', 'insert'), ('piercer_service_qualifications', 'update'), ('piercer_service_qualifications', 'delete'),
    ('piercer_availability', 'select'), ('piercer_availability', 'insert'), ('piercer_availability', 'update'), ('piercer_availability', 'delete'),
    ('studio_exceptions', 'select'), ('studio_exceptions', 'insert'), ('studio_exceptions', 'update'), ('studio_exceptions', 'delete'),
    ('business_profile', 'select'), ('business_profile', 'update')
) as required(table_name, privilege);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Test 1: an active Owner can perform legitimate catalog/template operations.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.services (name, price, active) values ('RLS Owner Service', 10.00, false);
insert into public.products (name, price, active) values ('RLS Owner Product', 10.00, false);
insert into public.waiver_templates (id, version, body)
values ('00000000-0000-0000-0000-000000000303', 4, 'Template version four');

update public.business_profile
set email = 'owner-updated@example.test'
where singleton;

do $$
declare
  account_count integer;
begin
  select count(*) into account_count from public.staff_accounts
  where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
  perform pg_temp.assert_true(account_count = 3, 'active Owner must read staff-account metadata');
  perform pg_temp.assert_true(
    (select email = 'owner-updated@example.test' from public.business_profile where singleton),
    'active Owner must read and update the business profile'
  );
end;
$$;

-- Staff context.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

-- Test 2: Staff reads only their account and cannot promote themselves.
do $$
declare
  account_count integer;
  changed_count integer;
begin
  select count(*) into account_count from public.staff_accounts;
  perform pg_temp.assert_true(account_count = 1, 'Staff must read only their own account');

  begin
    with changed as (
      update public.staff_accounts
      set role = 'owner'
      where id = '00000000-0000-0000-0000-000000000002'
      returning id
    )
    select count(*) into changed_count from changed;

    perform pg_temp.assert_true(changed_count = 0, 'Staff role escalation must be denied');
  exception
    when insufficient_privilege then null;
  end;

  perform pg_temp.assert_true(
    (select count(*) = 0 from public.business_profile),
    'Staff must not read the Owner-only business profile'
  );

  with changed as (
    update public.business_profile set location = 'Denied' where singleton returning singleton
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff must not update the business profile');
end;
$$;

-- Test 3: Staff reads only active reference catalog data and cannot mutate it.
do $$
declare
  service_count integer;
  product_count integer;
  piercer_count integer;
  station_count integer;
  changed_count integer;
begin
  select count(*) into service_count from public.services
  where id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102');
  select count(*) into product_count from public.products
  where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
  perform pg_temp.assert_true(service_count = 1, 'Staff must read only active services');
  perform pg_temp.assert_true(product_count = 1, 'Staff must read only active products');
  select count(*) into piercer_count from public.piercer_profiles
  where id in ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000212');
  select count(*) into station_count from public.stations
  where id in ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000222');
  perform pg_temp.assert_true(piercer_count = 1, 'Staff must read only active piercers');
  perform pg_temp.assert_true(station_count = 1, 'Staff must read only active stations');

  begin
    insert into public.services (name, price) values ('Denied Service', 1.00);
    raise exception 'Staff service insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.products (name, price) values ('Denied Product', 1.00);
    raise exception 'Staff product insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  with changed as (
    update public.services
    set name = 'Denied Service Update'
    where id = '00000000-0000-0000-0000-000000000101'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff service update must be denied');

  with changed as (
    update public.products
    set name = 'Denied Product Update'
    where id = '00000000-0000-0000-0000-000000000201'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff product update must be denied');
end;
$$;

-- Test 4 and Test 5: Staff can use Clients and Dashboard-operational tables.
insert into public.clients (id, full_name, email)
values (
  '00000000-0000-0000-0000-000000000401',
  'RLS Client',
  'rls-client@example.test'
);

update public.clients
set full_name = 'RLS Client Updated'
where id = '00000000-0000-0000-0000-000000000401';

insert into public.transactions (id, client_id, status)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000401',
  'pending'
);

insert into public.transaction_items (
  id,
  transaction_id,
  item_type,
  product_id,
  item_name_snapshot,
  unit_price_snapshot,
  quantity
)
values (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000501',
  'product',
  '00000000-0000-0000-0000-000000000201',
  'RLS Active Product',
  50.00,
  1
);

insert into public.payments (
  id,
  transaction_id,
  amount,
  payment_method
)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000501',
  50.00,
  'cash'
);

-- Signed waivers are now created only through the checked Phase 5 RPC. Seed one
-- as the database owner so the legacy immutability assertions remain focused.
reset role;
insert into public.waivers (
  id,
  transaction_id,
  waiver_template_id,
  client_name_snapshot,
  signature_storage_path,
  pdf_storage_path,
  signed_at
)
values (
  '00000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000303',
  'RLS Client Updated',
  'signatures/rls-test.png',
  'waivers/rls-test.pdf',
  now()
);
set local role authenticated;

-- Test 6: Staff can read current template but cannot create a version.
do $$
declare
  template_count integer;
  current_version integer;
  changed_count integer;
begin
  select count(*), max(version)
  into template_count, current_version
  from public.waiver_templates;

  perform pg_temp.assert_true(template_count = 1, 'Staff must read exactly the current waiver template');
  perform pg_temp.assert_true(current_version = 4, 'Staff must read the highest template version');

  begin
    insert into public.waiver_templates (version, body)
    values (5, 'Denied template');
    raise exception 'Staff waiver template insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  with changed as (
    update public.waiver_templates
    set body = 'Tampered template'
    where id = '00000000-0000-0000-0000-000000000303'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff waiver template update must be denied');

  with changed as (
    delete from public.waiver_templates
    where id = '00000000-0000-0000-0000-000000000303'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff waiver template delete must be denied');
end;
$$;

-- Test 7 and Test 9: Staff cannot rewrite or delete signed waivers/payments.
do $$
declare
  changed_count integer;
begin
  with changed as (
    update public.waivers
    set client_name_snapshot = 'Tampered'
    where id = '00000000-0000-0000-0000-000000000801'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff waiver update must be denied');

  with changed as (
    delete from public.waivers
    where id = '00000000-0000-0000-0000-000000000801'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff waiver delete must be denied');

  with changed as (
    update public.payments
    set amount = 1.00
    where id = '00000000-0000-0000-0000-000000000701'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff payment update must be denied');

  with changed as (
    delete from public.payments
    where id = '00000000-0000-0000-0000-000000000701'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Staff payment delete must be denied');
end;
$$;

-- Test 8: Staff cannot see historic templates or edit any version (covered above).

-- Owner cannot rewrite the same signed waiver or payment history either.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare
  changed_count integer;
begin
  with changed as (
    update public.waivers
    set client_name_snapshot = 'Owner Tampered'
    where id = '00000000-0000-0000-0000-000000000801'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Owner waiver update must be denied');

  with changed as (
    delete from public.waivers
    where id = '00000000-0000-0000-0000-000000000801'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Owner waiver delete must be denied');

  with changed as (
    update public.payments
    set amount = 1.00
    where id = '00000000-0000-0000-0000-000000000701'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Owner payment update must be denied');

  with changed as (
    delete from public.payments
    where id = '00000000-0000-0000-0000-000000000701'
    returning id
  )
  select count(*) into changed_count from changed;
  perform pg_temp.assert_true(changed_count = 0, 'Owner payment delete must be denied');
end;
$$;

-- Test 10: inactive accounts lose normal data access.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$
declare
  client_count integer;
begin
  select count(*) into client_count from public.clients;
  perform pg_temp.assert_true(client_count = 0, 'Inactive account must not read clients');

  begin
    insert into public.clients (full_name) values ('Denied Inactive Client');
    raise exception 'Inactive account client insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;
