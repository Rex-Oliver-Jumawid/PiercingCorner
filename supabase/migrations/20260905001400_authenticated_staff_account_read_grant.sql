-- RLS policies filter which account rows authenticated users may read, but the
-- PostgREST role also needs the underlying table privilege before RLS runs.
grant select on table public.staff_accounts to authenticated;
