begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not condition then raise exception 'assertion failed: %', message; end if;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiver-owner@test.local', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiver-staff@test.local', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiver-inactive@test.local', '', now(), '{}', '{}', now(), now());

insert into public.staff_accounts (id, display_name, role, status) values
  ('30000000-0000-0000-0000-000000000001', 'Waiver Owner', 'owner', 'active'),
  ('30000000-0000-0000-0000-000000000002', 'Waiver Staff', 'staff', 'active'),
  ('30000000-0000-0000-0000-000000000003', 'Inactive Staff', 'staff', 'inactive');
insert into public.clients (id, full_name, created_by)
values ('30000000-0000-0000-0000-000000000010', 'Waiver Client', '30000000-0000-0000-0000-000000000002');
insert into public.services (id, name, price, active)
values ('30000000-0000-0000-0000-000000000020', 'Waiver Service', 750, true);
insert into public.products (id, name, price, active)
values ('30000000-0000-0000-0000-000000000030', 'Waiver Product', 250, true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);

create temp table prepared as select * from public.prepare_waiver_signing(null);
select pg_temp.assert_true((select template_version = 1 from prepared), 'fresh signing session must pin template version 1');
select pg_temp.assert_true((select expires_at - now() between interval '29 minutes' and interval '31 minutes' from prepared), 'prepared session must have a fixed 30-minute expiry');

reset role;
insert into public.waiver_templates (version, body, created_by)
values (2, 'A newer template for future transactions.', '30000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);

create temp table accepted as
select * from public.accept_new_service_waiver(
  (select event_id from prepared),
  '{"existing_client_id":"30000000-0000-0000-0000-000000000010"}'::jsonb,
  array['30000000-0000-0000-0000-000000000020']::uuid[],
  array['30000000-0000-0000-0000-000000000030']::uuid[]
);
select pg_temp.assert_true((select template_version = 1 from accepted), 'accepted signing must retain the presented template after a new version is published');
select pg_temp.assert_true((select total = 1000 from accepted), 'service transaction total must be server-derived');
select pg_temp.assert_true((select count(*) = 1 from public.get_recoverable_waiver_signing((select id from accepted))), 'accepted event must be recoverable before final waiver persistence');

do $$
begin
  begin
    perform public.finalize_signed_waiver(
      (select event_id from accepted),
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png',
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf'
    );
    raise exception 'waiver finalization without uploaded objects unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('waiver-documents', 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png', '30000000-0000-0000-0000-000000000002', '{"mimetype":"image/png"}'),
  ('waiver-documents', 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf', '30000000-0000-0000-0000-000000000002', '{"mimetype":"application/pdf"}');

do $$
begin
  begin
    perform public.finalize_signed_waiver(
      (select event_id from accepted),
      'transactions/30000000-0000-0000-0000-000000000099/waivers/' || (select event_id from accepted) || '/signature.png',
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf'
    );
    raise exception 'waiver finalization with a mismatched path unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
update storage.objects set owner_id = '30000000-0000-0000-0000-000000000001'
where name = 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.finalize_signed_waiver(
      (select event_id from accepted),
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png',
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf'
    );
    raise exception 'waiver finalization with another uploader unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
update storage.objects set owner_id = '30000000-0000-0000-0000-000000000002'
where name = 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png';
update storage.objects set metadata = '{"mimetype":"application/octet-stream"}'
where name = 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.finalize_signed_waiver(
      (select event_id from accepted),
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png',
      'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf'
    );
    raise exception 'waiver finalization with the wrong MIME type unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
update storage.objects set metadata = '{"mimetype":"application/pdf"}'
where name = 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);

select * from public.finalize_signed_waiver(
  (select event_id from accepted),
  'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png',
  'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/waiver.pdf'
);

reset role;
select pg_temp.assert_true((
  select waiver.signed_at = event.signed_at
    and waiver.waiver_template_id = event.waiver_template_id
    and event.state = 'finalized'
  from public.waivers waiver
  join private.waiver_signing_events event on event.id = waiver.id
  where waiver.transaction_id = (select id from accepted)
), 'final waiver must use the authoritative event timestamp and pinned template');
select pg_temp.assert_true((select count(*) = 0 from public.get_recoverable_waiver_signing((select id from accepted))), 'finalized event must no longer be a recovery candidate');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select set_config('storage.allow_delete_query', 'true', true);
do $$
declare deleted_count integer;
begin
  with deleted as (
    delete from storage.objects
    where name = 'transactions/' || (select id from accepted) || '/waivers/' || (select event_id from accepted) || '/signature.png'
    returning id
  ) select count(*) into deleted_count from deleted;
  perform pg_temp.assert_true(deleted_count = 0, 'referenced signature objects must be immutable');
end;
$$;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('waiver-documents', 'transactions/30000000-0000-0000-0000-000000000099/waivers/30000000-0000-0000-0000-000000000098/signature.png', '30000000-0000-0000-0000-000000000002', '{"mimetype":"image/png"}');
delete from storage.objects where name = 'transactions/30000000-0000-0000-0000-000000000099/waivers/30000000-0000-0000-0000-000000000098/signature.png';
select pg_temp.assert_true(not exists (select 1 from storage.objects where name like '%000000000098/signature.png'), 'uploader must be able to clean an orphan object');

do $$
begin
  begin
    insert into public.waivers (transaction_id, waiver_template_id, client_name_snapshot, signature_storage_path, pdf_storage_path, signed_at)
    values ((select id from accepted), (select template_id from accepted), 'Bypass', 'bad.png', 'bad.pdf', now());
    raise exception 'direct waiver insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
insert into public.transactions (id, reference_code, client_id, status, created_by)
values ('30000000-0000-0000-0000-000000000050', 'TXN-WAIVER-EXISTING', '30000000-0000-0000-0000-000000000010', 'ongoing', '30000000-0000-0000-0000-000000000002');
insert into public.transaction_items (transaction_id, item_type, service_id, item_name_snapshot, unit_price_snapshot, quantity)
values ('30000000-0000-0000-0000-000000000050', 'service', '30000000-0000-0000-0000-000000000020', 'Existing Waiver Service', 750, 1);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
create temp table existing_prepared as
select * from public.prepare_waiver_signing('30000000-0000-0000-0000-000000000050');
create temp table existing_accepted as
select * from public.accept_existing_transaction_waiver((select event_id from existing_prepared));
select pg_temp.assert_true((
  select id = '30000000-0000-0000-0000-000000000050'::uuid
    and client_name = 'Waiver Client'
    and template_version = 2
    and signed_at is not null
  from existing_accepted
), 'an existing unsigned open service transaction must accept a server-stamped current-template signing');

create temp table expired_prepared as select * from public.prepare_waiver_signing(null);
reset role;
update private.waiver_signing_events set expires_at = clock_timestamp() - interval '1 second'
where id = (select event_id from expired_prepared);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.accept_new_service_waiver(
      (select event_id from expired_prepared),
      '{"existing_client_id":"30000000-0000-0000-0000-000000000010"}'::jsonb,
      array['30000000-0000-0000-0000-000000000020']::uuid[],
      '{}'::uuid[]
    );
    raise exception 'expired signing unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.prepare_waiver_signing(null);
    raise exception 'inactive signing preparation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
