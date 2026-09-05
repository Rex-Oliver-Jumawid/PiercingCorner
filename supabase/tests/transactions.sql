-- Focused Phase 4 workflow checks. All fixtures roll back.
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not condition then raise exception '%', message; end if;
end;
$$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@tx.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'staff@tx.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'inactive@tx.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff_accounts (id, display_name, role, status)
values
  ('10000000-0000-0000-0000-000000000001', 'Transaction Owner', 'owner', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'Transaction Staff', 'staff', 'active'),
  ('10000000-0000-0000-0000-000000000003', 'Inactive Staff', 'staff', 'inactive');

insert into public.clients (id, full_name, created_by)
values ('10000000-0000-0000-0000-000000000010', 'Existing Client', '10000000-0000-0000-0000-000000000001');
insert into public.services (id, name, price, active)
values
  ('10000000-0000-0000-0000-000000000020', 'Snapshot Service', 700.00, true),
  ('10000000-0000-0000-0000-000000000021', 'Inactive Service', 900.00, false);
insert into public.products (id, name, price, active)
values
  ('10000000-0000-0000-0000-000000000030', 'Snapshot Product', 150.00, true),
  ('10000000-0000-0000-0000-000000000031', 'Inactive Product', 200.00, false);
insert into public.waiver_templates (id, version, body, created_by)
values ('10000000-0000-0000-0000-000000000040', 100, 'Transaction test waiver', '10000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select * from public.record_product_sale(
  '{"existing_client_id":"10000000-0000-0000-0000-000000000010"}'::jsonb,
  array['10000000-0000-0000-0000-000000000030']::uuid[],
  'gcash', 'GCASH-100'
);

do $$
declare target_id uuid; target_reference text;
begin
  select transaction.id, transaction.reference_code into target_id, target_reference
  from public.transactions transaction
  where transaction.client_id = '10000000-0000-0000-0000-000000000010'
    and transaction.status = 'completed';
  perform pg_temp.assert_true(target_reference ~ '^TXN-[0-9]{6}-[0-9]{6}$', 'reference format must be collision-safe');
  perform pg_temp.assert_true((select amount = 150.00 and reference_number = 'GCASH-100' from public.payments where transaction_id = target_id), 'payment must use the server-derived total');
  perform pg_temp.assert_true((select item_name_snapshot = 'Snapshot Product' and unit_price_snapshot = 150.00 from public.transaction_items where transaction_id = target_id), 'product facts must be snapshotted');
  perform pg_temp.assert_true((select count(*) = 1 from public.search_dashboard_transactions('snapshot product') where id = target_id), 'dashboard search must include item names');
  perform pg_temp.assert_true((select count(*) = 0 from public.search_dashboard_transactions('%_')), 'dashboard search must treat wildcard characters literally');
end;
$$;

do $$
declare before_clients integer; before_transactions integer;
begin
  select count(*) into before_clients from public.clients;
  select count(*) into before_transactions from public.transactions;
  begin
    perform public.record_product_sale(
      '{"full_name":"Rolled Back Client","email":null,"phone":null}'::jsonb,
      array['10000000-0000-0000-0000-000000000031']::uuid[], 'cash', ''
    );
    raise exception 'inactive product checkout unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  perform pg_temp.assert_true((select count(*) from public.clients) = before_clients, 'failed checkout must not create a client');
  perform pg_temp.assert_true((select count(*) from public.transactions) = before_transactions, 'failed checkout must not create a transaction');
end;
$$;

reset role;
insert into public.transactions (id, reference_code, client_id, status, created_by)
values ('10000000-0000-0000-0000-000000000050', 'TXN-SIGNED', '10000000-0000-0000-0000-000000000010', 'ongoing', '10000000-0000-0000-0000-000000000002');
insert into public.transaction_items (transaction_id, item_type, service_id, item_name_snapshot, unit_price_snapshot, quantity)
values ('10000000-0000-0000-0000-000000000050', 'service', '10000000-0000-0000-0000-000000000020', 'Original Service Name', 650.00, 1);
insert into public.waivers (transaction_id, waiver_template_id, client_name_snapshot, signature_storage_path, pdf_storage_path, signed_at, recorded_by)
values ('10000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000040', 'Existing Client', 'private/signature.png', 'private/waiver.pdf', now(), '10000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select * from public.finalize_transaction(
  '10000000-0000-0000-0000-000000000050',
  array['10000000-0000-0000-0000-000000000020']::uuid[],
  array['10000000-0000-0000-0000-000000000030']::uuid[], 'cash', ''
);

do $$
begin
  perform pg_temp.assert_true((select status = 'completed' from public.transactions where id = '10000000-0000-0000-0000-000000000050'), 'signed open transaction must complete');
  perform pg_temp.assert_true((select amount = 800.00 from public.payments where transaction_id = '10000000-0000-0000-0000-000000000050'), 'finalization must derive the exact total');
  perform pg_temp.assert_true((select item_name_snapshot = 'Original Service Name' and unit_price_snapshot = 650.00 from public.transaction_items where transaction_id = '10000000-0000-0000-0000-000000000050' and service_id is not null), 'retained snapshots must remain unchanged');
end;
$$;

reset role;
insert into public.transactions (id, reference_code, client_id, status, created_by)
values ('10000000-0000-0000-0000-000000000051', 'TXN-UNSIGNED', '10000000-0000-0000-0000-000000000010', 'pending', '10000000-0000-0000-0000-000000000002');
insert into public.transaction_items (transaction_id, item_type, service_id, item_name_snapshot, unit_price_snapshot, quantity)
values ('10000000-0000-0000-0000-000000000051', 'service', '10000000-0000-0000-0000-000000000020', 'Unsigned Service', 700.00, 1);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

do $$
begin
  begin
    perform public.finalize_transaction(
      '10000000-0000-0000-0000-000000000051',
      array['10000000-0000-0000-0000-000000000020']::uuid[],
      '{}'::uuid[], 'cash', ''
    );
    raise exception 'unsigned service finalization unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  perform pg_temp.assert_true((select status = 'pending' from public.transactions where id = '10000000-0000-0000-0000-000000000051'), 'failed finalization must leave status open');
  perform pg_temp.assert_true((select count(*) = 0 from public.payments where transaction_id = '10000000-0000-0000-0000-000000000051'), 'failed finalization must not record payment');
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.record_product_sale(
      '{"existing_client_id":"10000000-0000-0000-0000-000000000010"}'::jsonb,
      array['10000000-0000-0000-0000-000000000030']::uuid[], 'cash', ''
    );
    raise exception 'inactive checkout unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
