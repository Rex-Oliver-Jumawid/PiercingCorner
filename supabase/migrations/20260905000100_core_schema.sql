create table public.staff_accounts (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (btrim(display_name) <> ''),
  role public.app_role not null,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  email text check (email is null or btrim(email) <> ''),
  phone text check (phone is null or btrim(phone) <> ''),
  created_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  price numeric(12, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  price numeric(12, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  reference_code text unique check (
    reference_code is null or btrim(reference_code) <> ''
  ),
  client_id uuid not null references public.clients (id) on delete restrict,
  status public.transaction_status not null default 'pending',
  created_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null
    references public.transactions (id) on delete restrict,
  item_type public.transaction_item_type not null,
  service_id uuid references public.services (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  item_name_snapshot text not null check (btrim(item_name_snapshot) <> ''),
  unit_price_snapshot numeric(12, 2) not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint transaction_item_catalog_reference_matches_type check (
    (item_type = 'service' and service_id is not null and product_id is null)
    or
    (item_type = 'product' and product_id is not null and service_id is null)
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null
    references public.transactions (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method public.payment_method not null,
  reference_number text check (
    reference_number is null or btrim(reference_number) <> ''
  ),
  recorded_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.waiver_templates (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  body text not null check (btrim(body) <> ''),
  created_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.waivers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique
    references public.transactions (id) on delete restrict,
  waiver_template_id uuid not null
    references public.waiver_templates (id) on delete restrict,
  client_name_snapshot text not null check (btrim(client_name_snapshot) <> ''),
  signature_storage_path text not null check (btrim(signature_storage_path) <> ''),
  pdf_storage_path text not null check (btrim(pdf_storage_path) <> ''),
  signed_at timestamptz not null,
  recorded_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now()
);

create trigger staff_accounts_set_updated_at
before update on public.staff_accounts
for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create index transactions_client_id_idx on public.transactions (client_id);
create index transactions_created_at_idx on public.transactions (created_at);
create index transactions_status_idx on public.transactions (status);
create index transactions_reference_code_idx on public.transactions (reference_code);
create index transaction_items_transaction_id_idx
  on public.transaction_items (transaction_id);
create index payments_transaction_id_idx on public.payments (transaction_id);
create index waivers_transaction_id_idx on public.waivers (transaction_id);

-- SECURITY DEFINER helpers answer only the current requester's active account,
-- owner status, open transaction, or current waiver-template question for RLS.
-- search_path is pinned and every object read is schema-qualified.
create function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_accounts as account
    where account.id = auth.uid()
      and account.status = 'active'
  );
$$;

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_accounts as account
    where account.id = auth.uid()
      and account.status = 'active'
      and account.role = 'owner'
  );
$$;

create function public.is_open_transaction(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.transactions as transaction
    where transaction.id = target_transaction_id
      and transaction.status in ('pending', 'ongoing')
  );
$$;

create function public.current_waiver_template_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select template.id
  from public.waiver_templates as template
  order by template.version desc
  limit 1;
$$;

revoke all on function public.is_active_account() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.is_open_transaction(uuid) from public;
revoke all on function public.current_waiver_template_id() from public;

grant execute on function public.is_active_account() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_open_transaction(uuid) to authenticated;
grant execute on function public.current_waiver_template_id() to authenticated;
