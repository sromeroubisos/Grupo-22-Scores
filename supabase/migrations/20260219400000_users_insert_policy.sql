-- ============================================================
-- FIX: Add INSERT policy for public.users
--
-- WHY:
--   The previous migration (20260219200000_fix_users_rls.sql) dropped
--   the "Auth Users Can Create" policy to prevent arbitrary inserts.
--   However, the OAuth callback route (api/auth/callback/google) needs
--   to create the user row in public.users after exchangeCodeForSession.
--
--   When SUPABASE_SERVICE_ROLE_KEY is configured the callback uses the
--   admin client (bypasses RLS, no policy needed).
--   When it is NOT configured the callback falls back to the anon key
--   + user JWT, so an INSERT policy is required.
--
-- POLICY:
--   Authenticated users may only INSERT their own row (auth.uid() = id).
--   This is safe: users cannot impersonate another user's id.
-- ============================================================

-- Drop if it already exists (idempotent)
DROP POLICY IF EXISTS "users_insert_own" ON public.users;

CREATE POLICY "users_insert_own" ON public.users
    FOR INSERT
    WITH CHECK ((select auth.uid()) = id);

NOTIFY pgrst, 'reload config';
