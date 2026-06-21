-- Fix admin user's auth_id to match the actual Supabase Auth user
-- Run this in Supabase SQL Editor if login redirects back after successful sign-in

UPDATE public.users
SET auth_id = (
  SELECT id FROM auth.users
  WHERE email = 'admin@nwbus.internal'
)
WHERE username = 'admin';

-- Verify the fix:
SELECT u.username, u.full_name_ar, u.role, u.auth_id, a.id AS auth_user_id,
       (u.auth_id = a.id) AS ids_match
FROM public.users u
LEFT JOIN auth.users a ON a.email = 'admin@nwbus.internal'
WHERE u.username = 'admin';
