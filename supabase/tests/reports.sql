begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin if not condition then raise exception 'assertion failed: %', message; end if; end; $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','report-owner@test.local','',now(),'{}','{}',now(),now()),
('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','report-staff@test.local','',now(),'{}','{}',now(),now()),
('60000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','report-inactive@test.local','',now(),'{}','{}',now(),now());
insert into public.staff_accounts (id,display_name,role,status) values
('60000000-0000-0000-0000-000000000001','Report Owner','owner','active'),
('60000000-0000-0000-0000-000000000002','Report Staff','staff','active'),
('60000000-0000-0000-0000-000000000003','Inactive Reporter','staff','inactive');
insert into public.clients (id,full_name,created_by) values
('60000000-0000-0000-0000-000000000010','=Formula Client','60000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000011','Second Client','60000000-0000-0000-0000-000000000001');
insert into public.services (id,name,price,active) values ('60000000-0000-0000-0000-000000000020','Report Service',300,true);
insert into public.products (id,name,price,active) values ('60000000-0000-0000-0000-000000000030','Report Product',200,true);

insert into public.transactions (id,reference_code,client_id,status,created_by) values
('60000000-0000-0000-0000-000000000040','TXN-PRIOR','60000000-0000-0000-0000-000000000010','completed','60000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000041','TXN-PRODUCT','60000000-0000-0000-0000-000000000010','completed','60000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000042','TXN-MIXED','60000000-0000-0000-0000-000000000011','completed','60000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000043','TXN-OPEN','60000000-0000-0000-0000-000000000011','pending','60000000-0000-0000-0000-000000000001');
insert into public.transaction_items (transaction_id,item_type,service_id,product_id,item_name_snapshot,unit_price_snapshot,quantity) values
('60000000-0000-0000-0000-000000000040','service','60000000-0000-0000-0000-000000000020',null,'Prior Service',100,1),
('60000000-0000-0000-0000-000000000041','product',null,'60000000-0000-0000-0000-000000000030','Report Product',200,1),
('60000000-0000-0000-0000-000000000042','service','60000000-0000-0000-0000-000000000020',null,'Report Service',300,1),
('60000000-0000-0000-0000-000000000042','product',null,'60000000-0000-0000-0000-000000000030','Attach Product',50,1);
insert into public.payments (transaction_id,amount,payment_method,reference_number,recorded_by) values
('60000000-0000-0000-0000-000000000040',100,'cash',null,'60000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000041',200,'gcash','=PAY-REF','60000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000042',350,'cash',null,'60000000-0000-0000-0000-000000000001');

alter table public.transactions disable trigger transactions_set_history_facts;
update public.transactions set completed_at = case id
  when '60000000-0000-0000-0000-000000000040' then '2026-08-31 10:00:00+08'::timestamptz
  when '60000000-0000-0000-0000-000000000041' then '2026-09-01 11:00:00+08'::timestamptz
  when '60000000-0000-0000-0000-000000000042' then '2026-09-02 16:00:00+08'::timestamptz end
where id in (
  '60000000-0000-0000-0000-000000000040',
  '60000000-0000-0000-0000-000000000041',
  '60000000-0000-0000-0000-000000000042'
);
alter table public.transactions enable trigger transactions_set_history_facts;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);

select pg_temp.assert_true((select net_revenue = 650 and completed_transactions = 3 and adjustments = 0 from public.get_sales_metrics()), 'sales metrics must start from completed payment facts without adjustments');
select pg_temp.assert_true((select count(*) = 2 from public.search_completed_sales('formula','all',null,null,null)), 'sale search must be literal over the client snapshot');
select pg_temp.assert_true((select count(*) = 2 from public.search_completed_sales('','product',null,null,null)), 'product filter must include product and mixed transactions');
select pg_temp.assert_true((select count(*) = 1 from public.search_completed_sales('','all','gcash','2026-09-01','2026-09-02')), 'payment and optional report dates must filter on completed sales');
select pg_temp.assert_true((select revenue = 550 and completed_transactions = 2 and service_transactions = 1 and unique_clients = 2 and repeat_clients = 1 and round(repeat_client_rate,1) = 50.0 and round(product_attach_rate,1) = 100.0 from public.get_report_summary('2026-09-01','2026-09-02')), 'report summary formulas must match the approved definitions');
select pg_temp.assert_true((select completed_quantity = 1 and revenue = 300 from public.get_report_top_services('2026-09-01','2026-09-02') limit 1), 'top services must use completed line snapshots');
select pg_temp.assert_true((select sum(total_visits) = 2 and sum(represented_days) = 2 from public.get_report_weekday_traffic('2026-09-01','2026-09-02')), 'weekday traffic must count distinct client-day visits');

select public.cancel_completed_transaction('60000000-0000-0000-0000-000000000041', 'refund', 'Customer requested a refund');
select pg_temp.assert_true((select count(*) = 1 from public.transaction_adjustments where transaction_id = '60000000-0000-0000-0000-000000000041'), 'Owner must read the appended adjustment');
do $$ begin begin insert into public.transaction_adjustments (transaction_id, adjustment_type, amount, reason) values ('60000000-0000-0000-0000-000000000042', 'void', 1, 'Denied direct insert'); raise exception 'direct adjustment insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
select pg_temp.assert_true((select net_revenue = 450 and completed_transactions = 3 and adjustments = 200 from public.get_sales_metrics()), 'sales metrics must subtract immutable adjustments');
select pg_temp.assert_true((select financial_status = 'refund' and adjustments = 200 and net_total = 0 from public.search_completed_sales('TXN-PRODUCT','all',null,null,null)), 'sales search must derive refunded status and net total');
select pg_temp.assert_true((select financial_status = 'refund' and adjustments = 200 and net_total = 0 and jsonb_array_length(adjustment_history) = 1 from public.get_completed_sale('60000000-0000-0000-0000-000000000041')), 'sale details must include immutable adjustment history');
select pg_temp.assert_true((select revenue = 350 from public.get_report_summary('2026-09-01','2026-09-02')), 'report revenue must be net of adjustments');
do $$ begin begin perform public.cancel_completed_transaction('60000000-0000-0000-0000-000000000041', 'void', 'Second cancellation'); raise exception 'a fully adjusted transaction was cancelled twice'; exception when invalid_parameter_value then null; end; end $$;

reset role;
insert into public.transactions (id,reference_code,client_id,status,created_by) values ('60000000-0000-0000-0000-000000000044','TXN-STAMP','60000000-0000-0000-0000-000000000011','pending','60000000-0000-0000-0000-000000000001');
update public.clients set full_name = 'Renamed Client' where id = '60000000-0000-0000-0000-000000000011';
update public.transactions set status = 'completed' where id = '60000000-0000-0000-0000-000000000044';
create temp table stamped as select client_name_snapshot, completed_at from public.transactions where id = '60000000-0000-0000-0000-000000000044';
update public.transactions set client_name_snapshot = 'Rewritten', completed_at = '2030-01-01' where id = '60000000-0000-0000-0000-000000000044';
select pg_temp.assert_true((select transaction.client_name_snapshot = stamped.client_name_snapshot and transaction.completed_at = stamped.completed_at from public.transactions transaction cross join stamped where transaction.id = '60000000-0000-0000-0000-000000000044'), 'client snapshot and first completion timestamp must be immutable');
do $$ begin begin update public.transactions set status = 'cancelled' where id = '60000000-0000-0000-0000-000000000044'; raise exception 'completed status reversal unexpectedly succeeded'; exception when check_violation then null; end; end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000002',true);
do $$ begin begin perform public.get_sales_metrics(); raise exception 'staff reports unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.cancel_completed_transaction('60000000-0000-0000-0000-000000000042', 'void', 'Denied staff void'); raise exception 'staff cancellation unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;
select pg_temp.assert_true((select count(*) = 0 from public.transaction_adjustments), 'Staff must not read Owner financial adjustments');
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000003',true);
do $$ begin begin perform public.get_owner_overview(); raise exception 'inactive reports unexpectedly succeeded'; exception when insufficient_privilege then null; end; end $$;

rollback;
