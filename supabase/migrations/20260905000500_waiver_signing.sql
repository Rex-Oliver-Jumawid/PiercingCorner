-- Phase 5 durable signing events, private waiver documents, and checked waiver persistence.

alter table public.waiver_templates alter column created_by drop not null;

insert into public.waiver_templates (version, body, created_by)
values (
  1,
  E'I confirm that I am voluntarily requesting a piercing service from Piercing Corner.\n\nI understand that piercing involves risks such as pain, bleeding, swelling, irritation, infection, allergic reaction, scarring, migration, rejection, or other complications.\n\nI understand that healing results and healing time may vary from person to person.\n\nI acknowledge that I have been given the opportunity to ask questions about the procedure and aftercare.\n\nI agree to follow the aftercare instructions provided by Piercing Corner.\n\nBy signing below, I confirm that I have read and understood this waiver and voluntarily consent to proceed with the piercing service.',
  null
)
on conflict (version) do nothing;

create schema if not exists private;
revoke all on schema private from public;

create table private.waiver_signing_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions (id) on delete restrict,
  waiver_template_id uuid not null references public.waiver_templates (id) on delete restrict,
  client_name_snapshot text,
  recorded_by uuid not null references public.staff_accounts (id) on delete restrict,
  state text not null default 'prepared'
    check (state in ('prepared', 'accepted', 'finalized', 'superseded', 'abandoned')),
  prepared_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '30 minutes',
  signed_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((state = 'prepared' and signed_at is null) or state <> 'prepared'),
  check (signed_at is null or transaction_id is not null)
);

create index waiver_signing_events_transaction_idx
  on private.waiver_signing_events (transaction_id, created_at desc);
create index waiver_signing_events_recorder_idx
  on private.waiver_signing_events (recorded_by, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'waiver-documents',
  'waiver-documents',
  false,
  5242880,
  array['image/png', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "active accounts upload waiver documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'waiver-documents'
  and public.is_active_account()
  and owner_id = auth.uid()::text
  and name ~ '^transactions/[0-9a-f-]{36}/waivers/[0-9a-f-]{36}/(signature[.]png|waiver[.]pdf)$'
);

create policy "active accounts read waiver documents"
on storage.objects for select to authenticated
using (bucket_id = 'waiver-documents' and public.is_active_account());

create policy "uploaders delete unreferenced waiver documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'waiver-documents'
  and public.is_active_account()
  and owner_id = auth.uid()::text
  and not exists (
    select 1
    from public.waivers waiver
    where waiver.signature_storage_path = storage.objects.name
       or waiver.pdf_storage_path = storage.objects.name
  )
);

drop policy "active accounts record signed waivers on open transactions" on public.waivers;

create function public.prepare_waiver_signing(target_transaction_id uuid default null)
returns table (
  event_id uuid,
  transaction_id uuid,
  template_id uuid,
  template_version integer,
  template_body text,
  client_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_template public.waiver_templates%rowtype;
  selected_client_name text;
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;

  select template.* into selected_template
  from public.waiver_templates template
  order by template.version desc
  limit 1;
  if selected_template.id is null then
    raise exception using errcode = '22023', message = 'No waiver template is available';
  end if;

  if target_transaction_id is not null then
    select client.full_name into selected_client_name
    from public.transactions transaction
    join public.clients client on client.id = transaction.client_id
    where transaction.id = target_transaction_id
      and transaction.status in ('pending', 'ongoing')
      and exists (
        select 1 from public.transaction_items item
        where item.transaction_id = transaction.id and item.item_type = 'service'
      )
      and not exists (
        select 1 from public.waivers waiver where waiver.transaction_id = transaction.id
      )
      and not exists (
        select 1 from public.payments payment where payment.transaction_id = transaction.id
      );
    if selected_client_name is null then
      raise exception using errcode = '22023', message = 'Transaction is not eligible for waiver signing';
    end if;

    update private.waiver_signing_events event
    set state = 'superseded'
    where event.transaction_id = target_transaction_id
      and event.recorded_by = auth.uid()
      and event.state in ('prepared', 'accepted');
  else
    update private.waiver_signing_events event
    set state = 'abandoned'
    where event.transaction_id is null
      and event.recorded_by = auth.uid()
      and event.state = 'prepared';
  end if;

  return query
  with created as (
    insert into private.waiver_signing_events (
      transaction_id, waiver_template_id, client_name_snapshot, recorded_by
    )
    values (target_transaction_id, selected_template.id, selected_client_name, auth.uid())
    returning *
  )
  select created.id, created.transaction_id, selected_template.id,
    selected_template.version, selected_template.body, created.client_name_snapshot,
    created.expires_at
  from created;
end;
$$;

create function public.accept_new_service_waiver(
  signing_event_id uuid,
  client_details jsonb,
  selected_service_ids uuid[],
  selected_product_ids uuid[]
)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  created_at timestamptz,
  total numeric,
  event_id uuid,
  template_id uuid,
  template_version integer,
  template_body text,
  signed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  signing private.waiver_signing_events%rowtype;
  resolved_client_id uuid;
  resolved_client_name text;
  existing_client_id uuid;
  new_client_name text;
  new_client_email text;
  new_client_phone text;
  created_transaction_id uuid;
  created_reference text;
  created_at_value timestamptz;
  resolved_total numeric;
  accepted_at timestamptz := clock_timestamp();
  invalid_count integer;
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;

  select event.* into signing
  from private.waiver_signing_events event
  where event.id = signing_event_id
  for update;
  if signing.id is null or signing.recorded_by <> auth.uid()
     or signing.state <> 'prepared' or signing.transaction_id is not null then
    raise exception using errcode = '22023', message = 'Signing session is unavailable';
  end if;
  if clock_timestamp() > signing.expires_at then
    update private.waiver_signing_events event set state = 'abandoned' where event.id = signing.id;
    raise exception using errcode = '22023', message = 'Signing session expired';
  end if;

  selected_service_ids := coalesce(selected_service_ids, '{}'::uuid[]);
  selected_product_ids := coalesce(selected_product_ids, '{}'::uuid[]);
  if cardinality(selected_service_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one service is required';
  end if;
  if cardinality(selected_service_ids) <> (select count(distinct value) from unnest(selected_service_ids) value)
     or cardinality(selected_product_ids) <> (select count(distinct value) from unnest(selected_product_ids) value) then
    raise exception using errcode = '22023', message = 'Duplicate catalog items are not allowed';
  end if;
  select count(*) into invalid_count from unnest(selected_service_ids) selected_id
  where not exists (select 1 from public.services service where service.id = selected_id and service.active);
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Every service must exist and be active';
  end if;
  select count(*) into invalid_count from unnest(selected_product_ids) selected_id
  where not exists (select 1 from public.products product where product.id = selected_id and product.active);
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Every product must exist and be active';
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
  if existing_client_id is not null then
    select client.id, client.full_name into resolved_client_id, resolved_client_name
    from public.clients client where client.id = existing_client_id;
    if resolved_client_id is null then
      raise exception using errcode = '22023', message = 'Client not found';
    end if;
  else
    resolved_client_name := btrim(new_client_name);
    insert into public.clients (full_name, email, phone, created_by)
    values (
      resolved_client_name,
      nullif(btrim(new_client_email), ''),
      nullif(btrim(new_client_phone), ''),
      auth.uid()
    ) returning clients.id into resolved_client_id;
  end if;

  created_reference := public.next_transaction_reference();
  insert into public.transactions (reference_code, client_id, status, created_by)
  values (created_reference, resolved_client_id, 'pending', auth.uid())
  returning transactions.id, transactions.created_at into created_transaction_id, created_at_value;

  insert into public.transaction_items (
    transaction_id, item_type, service_id, product_id,
    item_name_snapshot, unit_price_snapshot, quantity
  )
  select created_transaction_id, 'service'::public.transaction_item_type, service.id, null::uuid,
    service.name, service.price, 1
  from public.services service where service.id = any(selected_service_ids)
  union all
  select created_transaction_id, 'product'::public.transaction_item_type, null::uuid, product.id,
    product.name, product.price, 1
  from public.products product where product.id = any(selected_product_ids);

  select sum(item.unit_price_snapshot * item.quantity) into resolved_total
  from public.transaction_items item where item.transaction_id = created_transaction_id;
  if resolved_total is null or resolved_total <= 0 then
    raise exception using errcode = '22023', message = 'Transaction total must be positive';
  end if;

  update private.waiver_signing_events event
  set transaction_id = created_transaction_id,
      client_name_snapshot = resolved_client_name,
      signed_at = accepted_at,
      state = 'accepted'
  where event.id = signing.id;

  return query
  select created_transaction_id, created_reference, resolved_client_name,
    created_at_value, resolved_total, signing.id, template.id, template.version,
    template.body, accepted_at
  from public.waiver_templates template where template.id = signing.waiver_template_id;
end;
$$;

create function public.accept_existing_transaction_waiver(signing_event_id uuid)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  created_at timestamptz,
  total numeric,
  event_id uuid,
  template_id uuid,
  template_version integer,
  template_body text,
  signed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  signing private.waiver_signing_events%rowtype;
  accepted_at timestamptz := clock_timestamp();
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;
  select event.* into signing from private.waiver_signing_events event
  where event.id = signing_event_id for update;
  if signing.id is null or signing.recorded_by <> auth.uid() or signing.state <> 'prepared'
     or signing.transaction_id is null then
    raise exception using errcode = '22023', message = 'Signing session is unavailable';
  end if;
  if clock_timestamp() > signing.expires_at then
    update private.waiver_signing_events event set state = 'abandoned' where event.id = signing.id;
    raise exception using errcode = '22023', message = 'Signing session expired';
  end if;
  if not exists (
    select 1 from public.transactions transaction
    where transaction.id = signing.transaction_id and transaction.status in ('pending', 'ongoing')
  ) or not exists (
    select 1 from public.transaction_items item
    where item.transaction_id = signing.transaction_id and item.item_type = 'service'
  ) or exists (
    select 1 from public.waivers waiver where waiver.transaction_id = signing.transaction_id
  ) then
    raise exception using errcode = '22023', message = 'Transaction is not eligible for signing';
  end if;

  update private.waiver_signing_events
  set signed_at = accepted_at, state = 'accepted'
  where waiver_signing_events.id = signing.id;

  return query
  select transaction.id, transaction.reference_code, signing.client_name_snapshot,
    transaction.created_at,
    coalesce(sum(item.unit_price_snapshot * item.quantity), 0),
    signing.id, template.id, template.version, template.body, accepted_at
  from public.transactions transaction
  join public.transaction_items item on item.transaction_id = transaction.id
  join public.waiver_templates template on template.id = signing.waiver_template_id
  where transaction.id = signing.transaction_id
  group by transaction.id, transaction.reference_code, transaction.created_at,
    template.id, template.version, template.body;
end;
$$;

create function public.finalize_signed_waiver(
  signing_event_id uuid,
  signature_storage_path text,
  pdf_storage_path text
)
returns table (id uuid, transaction_id uuid, signed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  signing private.waiver_signing_events%rowtype;
  expected_prefix text;
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;
  select event.* into signing from private.waiver_signing_events event
  where event.id = signing_event_id for update;
  if signing.id is null or signing.recorded_by <> auth.uid()
     or signing.state not in ('accepted', 'finalized') or signing.signed_at is null then
    raise exception using errcode = '22023', message = 'Accepted signing event required';
  end if;
  expected_prefix := 'transactions/' || signing.transaction_id || '/waivers/' || signing.id || '/';
  if $2 <> expected_prefix || 'signature.png'
     or $3 <> expected_prefix || 'waiver.pdf' then
    raise exception using errcode = '22023', message = 'Invalid waiver document paths';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'waiver-documents'
      and object.name = $2
      and object.owner_id = auth.uid()::text
      and lower(coalesce(object.metadata ->> 'mimetype', '')) = 'image/png'
  ) or not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'waiver-documents'
      and object.name = $3
      and object.owner_id = auth.uid()::text
      and lower(coalesce(object.metadata ->> 'mimetype', '')) = 'application/pdf'
  ) then
    raise exception using errcode = '22023', message = 'Both waiver documents must be uploaded';
  end if;

  insert into public.waivers (
    id, transaction_id, waiver_template_id, client_name_snapshot,
    signature_storage_path, pdf_storage_path, signed_at, recorded_by
  ) values (
    signing.id, signing.transaction_id, signing.waiver_template_id,
    signing.client_name_snapshot, $2, $3,
    signing.signed_at, signing.recorded_by
  ) on conflict on constraint waivers_pkey do nothing;

  if not exists (
    select 1 from public.waivers waiver
    where waiver.id = signing.id
      and waiver.transaction_id = signing.transaction_id
      and waiver.signature_storage_path = $2
      and waiver.pdf_storage_path = $3
  ) then
    raise exception using errcode = '23505', message = 'Transaction already has a different waiver';
  end if;

  update private.waiver_signing_events
  set state = 'finalized', finalized_at = coalesce(finalized_at, clock_timestamp())
  where waiver_signing_events.id = signing.id;
  return query select signing.id, signing.transaction_id, signing.signed_at;
end;
$$;

create function public.abandon_waiver_signing(signing_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_account() then return; end if;
  update private.waiver_signing_events event set state = 'abandoned'
  where event.id = signing_event_id and event.recorded_by = auth.uid()
    and event.state = 'prepared';
end;
$$;

create function public.get_transaction_waiver(target_transaction_id uuid)
returns table (
  id uuid,
  signature_storage_path text,
  pdf_storage_path text,
  signed_at timestamptz,
  template_version integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select waiver.id, waiver.signature_storage_path, waiver.pdf_storage_path,
    waiver.signed_at, template.version
  from public.waivers waiver
  join public.waiver_templates template on template.id = waiver.waiver_template_id
  where public.is_active_account() and waiver.transaction_id = target_transaction_id;
$$;

create function public.get_recoverable_waiver_signing(target_transaction_id uuid)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  created_at timestamptz,
  total numeric,
  event_id uuid,
  template_id uuid,
  template_version integer,
  template_body text,
  signed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select transaction.id, transaction.reference_code, event.client_name_snapshot,
    transaction.created_at,
    coalesce(sum(item.unit_price_snapshot * item.quantity), 0),
    event.id, template.id, template.version, template.body, event.signed_at
  from private.waiver_signing_events event
  join public.transactions transaction on transaction.id = event.transaction_id
  join public.transaction_items item on item.transaction_id = transaction.id
  join public.waiver_templates template on template.id = event.waiver_template_id
  where public.is_active_account()
    and event.recorded_by = auth.uid()
    and event.transaction_id = target_transaction_id
    and event.state = 'accepted'
    and transaction.status in ('pending', 'ongoing')
    and not exists (
      select 1 from public.waivers waiver where waiver.transaction_id = transaction.id
    )
  group by transaction.id, transaction.reference_code, transaction.created_at,
    event.id, event.client_name_snapshot, event.signed_at,
    template.id, template.version, template.body
  order by event.signed_at desc
  limit 1;
$$;

revoke all on function public.prepare_waiver_signing(uuid) from public;
revoke all on function public.accept_new_service_waiver(uuid, jsonb, uuid[], uuid[]) from public;
revoke all on function public.accept_existing_transaction_waiver(uuid) from public;
revoke all on function public.finalize_signed_waiver(uuid, text, text) from public;
revoke all on function public.abandon_waiver_signing(uuid) from public;
revoke all on function public.get_transaction_waiver(uuid) from public;
revoke all on function public.get_recoverable_waiver_signing(uuid) from public;

grant execute on function public.prepare_waiver_signing(uuid) to authenticated;
grant execute on function public.accept_new_service_waiver(uuid, jsonb, uuid[], uuid[]) to authenticated;
grant execute on function public.accept_existing_transaction_waiver(uuid) to authenticated;
grant execute on function public.finalize_signed_waiver(uuid, text, text) to authenticated;
grant execute on function public.abandon_waiver_signing(uuid) to authenticated;
grant execute on function public.get_transaction_waiver(uuid) to authenticated;
grant execute on function public.get_recoverable_waiver_signing(uuid) to authenticated;
