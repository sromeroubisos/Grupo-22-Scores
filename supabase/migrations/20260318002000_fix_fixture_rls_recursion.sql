-- ============================================================
-- FIX RLS RECURSION ON FIXTURE TABLES
-- ============================================================
-- 
-- ROOT CAUSE: The admin policies on tournament_phases, tournament_groups,
-- tournament_participants, tournament_standings, and tournament_rounds
-- use a raw `EXISTS (SELECT 1 FROM public.users WHERE ...)` pattern
-- that causes infinite recursion when the users table's own RLS
-- policies are evaluated.
--
-- FIX: Replace them with `public.is_admin()` which uses the
-- SECURITY DEFINER function `get_app_role_safe()` that bypasses
-- RLS on public.users, breaking the recursion chain.
-- ============================================================

-- ─── 1. DROP THE DANGEROUS POLICIES ─────────────────────────────────────

DROP POLICY IF EXISTS "admin_manage_phases" ON public.tournament_phases;
DROP POLICY IF EXISTS "admin_manage_groups" ON public.tournament_groups;
DROP POLICY IF EXISTS "admin_manage_participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "admin_manage_standings" ON public.tournament_standings;
DROP POLICY IF EXISTS "admin_manage_rounds" ON public.tournament_rounds;

-- Also ensure the read policies exist (idempotent)
DROP POLICY IF EXISTS "public_read_phases" ON public.tournament_phases;
DROP POLICY IF EXISTS "public_read_groups" ON public.tournament_groups;
DROP POLICY IF EXISTS "public_read_participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "public_read_standings" ON public.tournament_standings;
DROP POLICY IF EXISTS "public_read_rounds" ON public.tournament_rounds;

-- ─── 2. RECREATE PUBLIC READ POLICIES (idempotent) ──────────────────────

CREATE POLICY "public_read_phases" ON public.tournament_phases
    FOR SELECT USING (true);

CREATE POLICY "public_read_groups" ON public.tournament_groups
    FOR SELECT USING (true);

CREATE POLICY "public_read_participants" ON public.tournament_participants
    FOR SELECT USING (true);

CREATE POLICY "public_read_standings" ON public.tournament_standings
    FOR SELECT USING (true);

CREATE POLICY "public_read_rounds" ON public.tournament_rounds
    FOR SELECT USING (true);

-- ─── 3. RECREATE ADMIN POLICIES USING is_admin() ───────────────────────
-- is_admin() uses get_app_role_safe() which is SECURITY DEFINER
-- and bypasses RLS on public.users — NO MORE RECURSION.

CREATE POLICY "admin_manage_phases" ON public.tournament_phases
    FOR ALL TO authenticated
    USING (public.is_admin());

CREATE POLICY "admin_manage_groups" ON public.tournament_groups
    FOR ALL TO authenticated
    USING (public.is_admin());

CREATE POLICY "admin_manage_participants" ON public.tournament_participants
    FOR ALL TO authenticated
    USING (public.is_admin());

CREATE POLICY "admin_manage_standings" ON public.tournament_standings
    FOR ALL TO authenticated
    USING (public.is_admin());

CREATE POLICY "admin_manage_rounds" ON public.tournament_rounds
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ─── 4. FIX MATCHES ADMIN POLICY IF MISSING ────────────────────────────
-- The matches table also needs a proper admin write policy.
-- Currently it only has "Public Read Matches" for SELECT.

DROP POLICY IF EXISTS "admin_manage_matches" ON public.matches;

CREATE POLICY "admin_manage_matches" ON public.matches
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ─── 5. RELOAD SCHEMA CACHE ────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
