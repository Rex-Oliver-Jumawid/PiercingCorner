-- PiercingCorner Local Test Identities and Starter Catalog Fixtures
-- Run this against the local database when you want to perform UI testing or walkthroughs:
--   docker exec -i supabase_db_PiercingCorner psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/fixtures.sql
--
-- Test Identities:
-- 1. Owner:
--    Email: owner@piercingcorner.test
--    Password: password123
--    Role: owner
--    Status: active
--
-- 2. Staff:
--    Email: staff@piercingcorner.test
--    Password: password123
--    Role: staff
--    Status: active
--
-- 3. Inactive:
--    Email: inactive@piercingcorner.test
--    Password: password123
--    Role: staff
--    Status: inactive

-- Clean up any existing fixture records first to allow idempotent re-runs
DELETE FROM public.staff_accounts WHERE id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003'
);

DELETE FROM auth.identities WHERE user_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003'
);

DELETE FROM auth.users WHERE id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003'
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@piercingcorner.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Studio Owner"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'staff@piercingcorner.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Senior Piercer"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'inactive@piercingcorner.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Former Staff"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@piercingcorner.test"}'::jsonb,
    'email',
    'a0000000-0000-0000-0000-000000000001',
    now(),
    now(),
    now()
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    '{"sub":"a0000000-0000-0000-0000-000000000002","email":"staff@piercingcorner.test"}'::jsonb,
    'email',
    'a0000000-0000-0000-0000-000000000002',
    now(),
    now(),
    now()
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    '{"sub":"a0000000-0000-0000-0000-000000000003","email":"inactive@piercingcorner.test"}'::jsonb,
    'email',
    'a0000000-0000-0000-0000-000000000003',
    now(),
    now(),
    now()
  );

INSERT INTO public.staff_accounts (id, display_name, role, status)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Studio Owner', 'owner', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'Senior Piercer', 'staff', 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'Former Staff', 'staff', 'inactive');

-- Initial Services
INSERT INTO public.services (name, price, active)
VALUES
  ('Lobe Piercing', 500.00, true),
  ('Helix Piercing', 800.00, true),
  ('Nostril Piercing', 900.00, true),
  ('Industrial Piercing', 1500.00, true),
  ('Archived Service', 400.00, false)
ON CONFLICT DO NOTHING;

-- Initial Products
INSERT INTO public.products (name, price, active)
VALUES
  ('Aftercare Saline Spray (75ml)', 350.00, true),
  ('Titanium Flat-Back Stud', 600.00, true),
  ('Bioflex Retainer', 200.00, true),
  ('Discontinued Cleaner', 250.00, false)
ON CONFLICT DO NOTHING;
