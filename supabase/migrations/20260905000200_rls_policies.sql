alter table public.staff_accounts enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.payments enable row level security;
alter table public.waiver_templates enable row level security;
alter table public.waivers enable row level security;

-- Accounts are read-only through the normal client role. This prevents role or
-- status manipulation; future staff-account management needs a reviewed secure
-- server-side/Admin API boundary.
create policy "owners read staff account metadata"
on public.staff_accounts for select to authenticated
using (public.is_owner());

create policy "staff read only their own account metadata"
on public.staff_accounts for select to authenticated
using (public.is_active_account() and id = auth.uid());

create policy "active accounts read clients"
on public.clients for select to authenticated
using (public.is_active_account());

create policy "active accounts create clients"
on public.clients for insert to authenticated
with check (public.is_active_account() and created_by = auth.uid());

create policy "active accounts update clients"
on public.clients for update to authenticated
using (public.is_active_account())
with check (public.is_active_account());

create policy "owners read all services"
on public.services for select to authenticated
using (public.is_owner());

create policy "staff read active services for dashboard"
on public.services for select to authenticated
using (public.is_active_account() and active);

create policy "owners create services"
on public.services for insert to authenticated
with check (public.is_owner());

create policy "owners update services"
on public.services for update to authenticated
using (public.is_owner())
with check (public.is_owner());

create policy "owners read all products"
on public.products for select to authenticated
using (public.is_owner());

create policy "staff read active products for dashboard"
on public.products for select to authenticated
using (public.is_active_account() and active);

create policy "owners create products"
on public.products for insert to authenticated
with check (public.is_owner());

create policy "owners update products"
on public.products for update to authenticated
using (public.is_owner())
with check (public.is_owner());

create policy "active accounts read dashboard transactions"
on public.transactions for select to authenticated
using (public.is_active_account());

create policy "active accounts create open transactions"
on public.transactions for insert to authenticated
with check (
  public.is_active_account()
  and created_by = auth.uid()
  and status in ('pending', 'ongoing')
);

-- Normal roles may change only a row that was open before the statement, and
-- cannot directly set completed. Finalization becomes an atomic RPC later.
create policy "active accounts update open dashboard transactions"
on public.transactions for update to authenticated
using (
  public.is_active_account()
  and status in ('pending', 'ongoing')
)
with check (
  public.is_active_account()
  and status in ('pending', 'ongoing', 'cancelled')
);

create policy "active accounts read transaction items"
on public.transaction_items for select to authenticated
using (public.is_active_account());

create policy "active accounts create items on open transactions"
on public.transaction_items for insert to authenticated
with check (
  public.is_active_account()
  and public.is_open_transaction(transaction_id)
);

create policy "active accounts update items on open transactions"
on public.transaction_items for update to authenticated
using (
  public.is_active_account()
  and public.is_open_transaction(transaction_id)
)
with check (
  public.is_active_account()
  and public.is_open_transaction(transaction_id)
);

create policy "active accounts delete items on open transactions"
on public.transaction_items for delete to authenticated
using (
  public.is_active_account()
  and public.is_open_transaction(transaction_id)
);

create policy "active accounts read payment history"
on public.payments for select to authenticated
using (public.is_active_account());

create policy "active accounts record payments on open transactions"
on public.payments for insert to authenticated
with check (
  public.is_active_account()
  and recorded_by = auth.uid()
  and public.is_open_transaction(transaction_id)
);

create policy "owners read all waiver templates"
on public.waiver_templates for select to authenticated
using (public.is_owner());

create policy "staff read current waiver template for dashboard"
on public.waiver_templates for select to authenticated
using (
  public.is_active_account()
  and id = public.current_waiver_template_id()
);

create policy "owners create waiver template versions"
on public.waiver_templates for insert to authenticated
with check (public.is_owner() and created_by = auth.uid());

create policy "active accounts read signed waivers"
on public.waivers for select to authenticated
using (public.is_active_account());

create policy "active accounts record signed waivers on open transactions"
on public.waivers for insert to authenticated
with check (
  public.is_active_account()
  and recorded_by = auth.uid()
  and public.is_open_transaction(transaction_id)
);

-- There are intentionally no normal DELETE policies. Payments, waiver
-- templates, and signed waivers have no UPDATE policies, preserving financial
-- and consent history for both Owner and Staff.
