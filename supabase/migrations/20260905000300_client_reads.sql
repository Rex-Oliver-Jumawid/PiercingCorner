-- These read interfaces run as the caller: clients and transactions retain RLS.
create view public.client_summaries with (security_invoker = true) as
select c.*,
  (select count(*) from public.transactions t where t.client_id = c.id) as transaction_count,
  (select max(t.updated_at) from public.transactions t where t.client_id = c.id) as last_activity
from public.clients c;

revoke all on public.client_summaries from anon, authenticated;
grant select on public.client_summaries to authenticated;

-- Literal substring search avoids interpolating user input into PostgREST filters.
create function public.search_clients(search_text text default '')
returns setof public.client_summaries
language sql stable security invoker set search_path = ''
as $$
  select c.* from public.client_summaries c
  where strpos(lower(c.full_name), lower(btrim(coalesce(search_text, '')))) > 0
     or strpos(lower(coalesce(c.email, '')), lower(btrim(coalesce(search_text, '')))) > 0
     or strpos(lower(coalesce(c.phone, '')), lower(btrim(coalesce(search_text, '')))) > 0;
$$;

create function public.find_client_duplicates(
  candidate_name text,
  candidate_email text default null,
  candidate_phone text default null,
  exclude_client_id uuid default null
)
returns table (id uuid, full_name text, email text, phone text)
language sql stable security invoker set search_path = ''
as $$
  select c.id, c.full_name, c.email, c.phone
  from public.clients c
  where (exclude_client_id is null or c.id <> exclude_client_id)
    and (
      lower(btrim(c.full_name)) = nullif(lower(btrim(candidate_name)), '')
      or lower(btrim(c.email)) = nullif(lower(btrim(candidate_email)), '')
      or nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '') =
         nullif(regexp_replace(candidate_phone, '[^0-9]', '', 'g'), '')
    );
$$;

revoke all on function public.search_clients(text) from public, anon;
revoke all on function public.find_client_duplicates(text, text, text, uuid) from public, anon;
grant execute on function public.search_clients(text) to authenticated;
grant execute on function public.find_client_duplicates(text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
