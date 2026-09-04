-- Phase 0B: deliberately closed application and operational value sets.
create type public.app_role as enum ('owner', 'staff');
create type public.account_status as enum ('active', 'inactive');
create type public.transaction_status as enum (
  'pending',
  'ongoing',
  'completed',
  'cancelled'
);
create type public.transaction_item_type as enum ('service', 'product');
create type public.payment_method as enum (
  'cash',
  'gcash',
  'maya',
  'bank_transfer',
  'card',
  'other'
);

-- Reused only by mutable tables. Historical records intentionally have no
-- updated_at column and will not receive this trigger.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
