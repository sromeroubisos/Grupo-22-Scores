-- Fix RLS lint warnings:
-- 1. Avoid per-row auth.uid() evaluation on public.users policies
-- 2. Collapse overlapping permissive SELECT policies into a single policy per action

BEGIN;

-- public.users
DROP POLICY IF EXISTS "users_read_safe" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;
DROP POLICY IF EXISTS "users_update_safe" ON public.users;
DROP POLICY IF EXISTS "users_admin_all" ON public.users;
DROP POLICY IF EXISTS "users_select_access" ON public.users;
DROP POLICY IF EXISTS "users_update_access" ON public.users;
DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
DROP POLICY IF EXISTS "users_admin_delete" ON public.users;

CREATE POLICY "users_select_access"
    ON public.users
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = id OR public.is_admin());

CREATE POLICY "users_update_access"
    ON public.users
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = id OR public.is_admin())
    WITH CHECK ((select auth.uid()) = id OR public.is_admin());

CREATE POLICY "users_admin_insert"
    ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "users_admin_delete"
    ON public.users
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- public.club_derivatives
DROP POLICY IF EXISTS "club_derivatives_public_read" ON public.club_derivatives;
DROP POLICY IF EXISTS "club_derivatives_admin_manage" ON public.club_derivatives;
DROP POLICY IF EXISTS "club_derivatives_select" ON public.club_derivatives;
DROP POLICY IF EXISTS "club_derivatives_insert" ON public.club_derivatives;
DROP POLICY IF EXISTS "club_derivatives_update" ON public.club_derivatives;
DROP POLICY IF EXISTS "club_derivatives_delete" ON public.club_derivatives;

CREATE POLICY "club_derivatives_select"
    ON public.club_derivatives
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "club_derivatives_insert"
    ON public.club_derivatives
    FOR INSERT
    TO authenticated
    WITH CHECK (public.authorize_admin());

CREATE POLICY "club_derivatives_update"
    ON public.club_derivatives
    FOR UPDATE
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

CREATE POLICY "club_derivatives_delete"
    ON public.club_derivatives
    FOR DELETE
    TO authenticated
    USING (public.authorize_admin());

-- public.club_venues
DROP POLICY IF EXISTS "venues_public_read" ON public.club_venues;
DROP POLICY IF EXISTS "venues_admin_manage" ON public.club_venues;
DROP POLICY IF EXISTS "venues_select" ON public.club_venues;
DROP POLICY IF EXISTS "venues_insert" ON public.club_venues;
DROP POLICY IF EXISTS "venues_update" ON public.club_venues;
DROP POLICY IF EXISTS "venues_delete" ON public.club_venues;

CREATE POLICY "venues_select"
    ON public.club_venues
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "venues_insert"
    ON public.club_venues
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "venues_update"
    ON public.club_venues
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "venues_delete"
    ON public.club_venues
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- public.match_events
DROP POLICY IF EXISTS "Public can read match events" ON public.match_events;
DROP POLICY IF EXISTS "Admins can manage match events" ON public.match_events;
DROP POLICY IF EXISTS "match_events_select" ON public.match_events;
DROP POLICY IF EXISTS "match_events_insert" ON public.match_events;
DROP POLICY IF EXISTS "match_events_update" ON public.match_events;
DROP POLICY IF EXISTS "match_events_delete" ON public.match_events;

CREATE POLICY "match_events_select"
    ON public.match_events
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "match_events_insert"
    ON public.match_events
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "match_events_update"
    ON public.match_events
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "match_events_delete"
    ON public.match_events
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- public.news
DROP POLICY IF EXISTS "Public Read News" ON public.news;
DROP POLICY IF EXISTS "Super Admin News" ON public.news;
DROP POLICY IF EXISTS "news_select" ON public.news;
DROP POLICY IF EXISTS "news_insert" ON public.news;
DROP POLICY IF EXISTS "news_update" ON public.news;
DROP POLICY IF EXISTS "news_delete" ON public.news;

CREATE POLICY "news_select"
    ON public.news
    FOR SELECT
    TO anon, authenticated
    USING (status = 'published' OR public.authorize_admin());

CREATE POLICY "news_insert"
    ON public.news
    FOR INSERT
    TO authenticated
    WITH CHECK (public.authorize_admin());

CREATE POLICY "news_update"
    ON public.news
    FOR UPDATE
    TO authenticated
    USING (public.authorize_admin())
    WITH CHECK (public.authorize_admin());

CREATE POLICY "news_delete"
    ON public.news
    FOR DELETE
    TO authenticated
    USING (public.authorize_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
