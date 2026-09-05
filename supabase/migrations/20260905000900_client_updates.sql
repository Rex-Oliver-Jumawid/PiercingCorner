create function public.update_client(
  target_client_id uuid,
  candidate_name text,
  candidate_email text default null,
  candidate_phone text default null
)
returns setof public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := btrim(candidate_name);
  normalized_email text := nullif(btrim(candidate_email), '');
  normalized_phone text := nullif(btrim(candidate_phone), '');
begin
  if not public.is_active_account() then
    raise insufficient_privilege using message = 'Active application account required';
  end if;

  if normalized_name is null or normalized_name = '' then
    raise check_violation using message = 'Client full name is required';
  end if;

  lock table public.clients in share row exclusive mode;

  if not exists (
    select 1 from public.clients client where client.id = target_client_id
  ) then
    raise no_data_found using message = 'Client not found';
  end if;

  if exists (
    select 1
    from public.clients client
    where client.id <> target_client_id
      and (
        lower(btrim(client.full_name)) = lower(normalized_name)
        or lower(btrim(client.email)) = lower(normalized_email)
        or nullif(regexp_replace(client.phone, '[^0-9]', '', 'g'), '') =
           nullif(regexp_replace(normalized_phone, '[^0-9]', '', 'g'), '')
      )
  ) then
    raise unique_violation using message = 'duplicate_client';
  end if;

  return query
  update public.clients
  set full_name = normalized_name,
      email = normalized_email,
      phone = normalized_phone
  where id = target_client_id
  returning *;
end;
$$;

revoke all on function public.update_client(uuid, text, text, text) from public, anon;
grant execute on function public.update_client(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
