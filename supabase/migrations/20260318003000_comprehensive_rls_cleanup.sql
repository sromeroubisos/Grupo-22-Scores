-- ============================================================
-- COMPREHENSIVE RLS CLEANUP
-- ============================================================
-- Fixes matches_list fetch failure caused by:
-- 1. clubs policies with raw public.users queries (recursion)
-- 2. tournaments accumulated conflicting SELECT policies
-- 3. club_divisions/club_venues same recursion pattern
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. TOURNAMENTS — Clean up ALL legacy policies
-- ═══════════════════════════════════════════════════════════════

-- Drop every legacy policy that was never cleaned up
DROP POLICY IF EXISTS "Public Read" ON public.tournaments;
DROP POLICY IF EXISTS "Public tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Public Read Tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "public_read_tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Super Admin Access" ON public.tournaments;
DROP POLICY IF EXISTS "Super Admin Full Access Tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Editor Access" ON public.tournaments;
DROP POLICY IF EXISTS "Auth Users Can Create" ON public.tournaments;
DROP POLICY IF EXISTS "Admin Tournament Management" ON public.tournaments;
DROP POLICY IF EXISTS "admin_manage_tournaments" ON public.tournaments;

-- Canonical policies (only 2: public read + admin manage)
CREATE POLICY "public_read_tournaments" ON public.tournaments
    FOR SELECT USING (true);

CREATE POLICY "admin_manage_tournaments" ON public.tournaments
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- 2. CLUBS — Fix recursion + visibility filter
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "clubs_public_read" ON public.clubs;
DROP POLICY IF EXISTS "clubs_super_admin_all" ON public.clubs;
DROP POLICY IF EXISTS "Public clubs" ON public.clubs;
DROP POLICY IF EXISTS "Public Read Clubs" ON public.clubs;

-- Public read: all clubs visible (required for match joins)
CREATE POLICY "clubs_public_read" ON public.clubs
    FOR SELECT USING (true);

-- Admin manage: uses safe is_admin() instead of raw users query
CREATE POLICY "clubs_admin_manage" ON public.clubs
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Keep membership-based policies (they query memberships, not users)
-- clubs_union_admin_write and clubs_club_admin_write are safe

-- ═══════════════════════════════════════════════════════════════
-- 3. CLUB_DIVISIONS — Fix recursion
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "divisions_super_admin_all" ON public.club_divisions;
DROP POLICY IF EXISTS "divisions_public_read" ON public.club_divisions;

CREATE POLICY "divisions_public_read" ON public.club_divisions
    FOR SELECT USING (true);

CREATE POLICY "divisions_admin_manage" ON public.club_divisions
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- 4. CLUB_VENUES — Fix recursion
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "venues_super_admin_all" ON public.club_venues;

CREATE POLICY "venues_admin_manage" ON public.club_venues
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- 5. MATCHES — Ensure clean state
-- ═══════════════════════════════════════════════════════════════

-- Ensure canonical policies exist (idempotent)
DROP POLICY IF EXISTS "Public Read Matches" ON public.matches;
DROP POLICY IF EXISTS "public_read_matches" ON public.matches;
DROP POLICY IF EXISTS "admin_manage_matches" ON public.matches;

CREATE POLICY "public_read_matches" ON public.matches
    FOR SELECT USING (true);

CREATE POLICY "admin_manage_matches" ON public.matches
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- 6. RELOAD
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
