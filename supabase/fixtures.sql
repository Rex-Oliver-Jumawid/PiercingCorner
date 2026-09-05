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
DELETE FROM public.payments WHERE transaction_id::text LIKE 'a1000000-%';
DELETE FROM public.transaction_items WHERE transaction_id::text LIKE 'a1000000-%';
DELETE FROM public.transactions WHERE id::text LIKE 'a1000000-%';
DELETE FROM public.piercer_profiles WHERE id::text LIKE 'a4000000-%';
DELETE FROM public.stations WHERE id::text LIKE 'a5000000-%';
DELETE FROM public.clients WHERE id::text LIKE 'a1000000-%';
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

INSERT INTO public.clients (id, full_name, email, phone, created_by)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Camille Flores', 'camille@example.test', '09170000001', 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', 'Daniel Ramirez', 'daniel@example.test', '09170000002', 'a0000000-0000-0000-0000-000000000002'),
  ('a1000000-0000-0000-0000-000000000003', 'Nina Soriano', null, '09170000003', 'a0000000-0000-0000-0000-000000000001');

-- Initial Services
INSERT INTO public.services (id, name, price, active)
VALUES
  ('a2000000-0000-0000-0000-000000000001', 'Lobe Piercing', 500.00, true),
  ('a2000000-0000-0000-0000-000000000002', 'Helix Piercing', 800.00, true),
  ('a2000000-0000-0000-0000-000000000003', 'Nostril Piercing', 900.00, true),
  ('a2000000-0000-0000-0000-000000000004', 'Industrial Piercing', 1500.00, true),
  ('a2000000-0000-0000-0000-000000000005', 'Archived Service', 400.00, false)
ON CONFLICT DO NOTHING;

-- Studio assignment resources used by service transactions.
INSERT INTO public.piercer_profiles (id, display_name, active)
VALUES
  ('a4000000-0000-0000-0000-000000000001', 'Ana Santos', true),
  ('a4000000-0000-0000-0000-000000000002', 'Bea Reyes', true),
  ('a4000000-0000-0000-0000-000000000003', 'Carlo Mendoza', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.stations (id, name, active)
VALUES
  ('a5000000-0000-0000-0000-000000000001', 'Station 1', true),
  ('a5000000-0000-0000-0000-000000000002', 'Station 2', true),
  ('a5000000-0000-0000-0000-000000000003', 'Station 3', true)
ON CONFLICT DO NOTHING;

-- Initial Products
INSERT INTO public.products (id, name, price, active)
VALUES
  ('a3000000-0000-0000-0000-000000000001', 'Aftercare Saline Spray (75ml)', 350.00, true),
  ('a3000000-0000-0000-0000-000000000002', 'Titanium Flat-Back Stud', 600.00, true),
  ('a3000000-0000-0000-0000-000000000003', 'Bioflex Retainer', 200.00, true),
  ('a3000000-0000-0000-0000-000000000004', 'Discontinued Cleaner', 250.00, false)
ON CONFLICT DO NOTHING;

INSERT INTO public.transactions (id, reference_code, client_id, status, created_by)
VALUES
  ('a1000000-0000-0000-0000-000000000011', 'TXN-DEMO-000001', 'a1000000-0000-0000-0000-000000000001', 'completed', 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000012', 'TXN-DEMO-000002', 'a1000000-0000-0000-0000-000000000002', 'completed', 'a0000000-0000-0000-0000-000000000002'),
  ('a1000000-0000-0000-0000-000000000013', 'TXN-DEMO-000003', 'a1000000-0000-0000-0000-000000000003', 'pending', 'a0000000-0000-0000-0000-000000000002');

INSERT INTO public.transaction_items (transaction_id, item_type, service_id, product_id, item_name_snapshot, unit_price_snapshot, quantity)
VALUES
  ('a1000000-0000-0000-0000-000000000011', 'service', 'a2000000-0000-0000-0000-000000000001', null, 'Lobe Piercing', 500.00, 1),
  ('a1000000-0000-0000-0000-000000000011', 'product', null, 'a3000000-0000-0000-0000-000000000001', 'Aftercare Saline Spray (75ml)', 350.00, 1),
  ('a1000000-0000-0000-0000-000000000012', 'product', null, 'a3000000-0000-0000-0000-000000000002', 'Titanium Flat-Back Stud', 600.00, 1),
  ('a1000000-0000-0000-0000-000000000013', 'service', 'a2000000-0000-0000-0000-000000000002', null, 'Helix Piercing', 800.00, 1);

INSERT INTO public.payments (transaction_id, amount, payment_method, reference_number, recorded_by)
VALUES
  ('a1000000-0000-0000-0000-000000000011', 850.00, 'cash', null, 'a0000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000012', 600.00, 'gcash', 'GC-DEMO-0002', 'a0000000-0000-0000-0000-000000000002');
