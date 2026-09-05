-- Owner-managed studio identity used by the Settings business profile. The row
-- is a singleton because PiercingCorner currently represents one studio.

create table public.business_profile (
  singleton boolean primary key default true check (singleton),
  studio_name text not null check (btrim(studio_name) <> ''),
  location text not null check (btrim(location) <> ''),
  address text,
  email text,
  phone text,
  instagram_url text,
  timezone text not null default 'Asia/Manila' check (timezone = 'Asia/Manila'),
  currency text not null default 'PHP' check (currency = 'PHP'),
  updated_at timestamptz not null default now(),
  check (address is null or btrim(address) <> ''),
  check (email is null or btrim(email) <> ''),
  check (phone is null or btrim(phone) <> ''),
  check (instagram_url is null or btrim(instagram_url) <> '')
);

insert into public.business_profile (studio_name, location)
values ('Piercing Corner', 'Parañaque');

create trigger business_profile_set_updated_at
before update on public.business_profile
for each row execute function public.set_updated_at();

alter table public.business_profile enable row level security;

create policy "owners read business profile"
on public.business_profile for select to authenticated
using (public.is_owner());

create policy "owners update business profile"
on public.business_profile for update to authenticated
using (public.is_owner())
with check (public.is_owner() and singleton);
