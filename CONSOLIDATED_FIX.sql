-- =============================================================================
-- CONSOLIDATED FIX SCRIPT: Restore admin_audit_log & Missing Tables
-- =============================================================================
-- Run this in Supabase SQL Editor (Studio) to fix current relations errors.
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. AUTHORIZE ADMIN FUNCTION (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.authorize_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin_general')
  );
$$;

-- 3. TABLE: admin_audit_log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    actor_user_id  uuid        NOT NULL,
    entity_type    text        NOT NULL,
    entity_id      text        NOT NULL,
    action         text        NOT NULL DEFAULT 'update',
    changes        jsonb       NOT NULL,
    request_id     text            NULL,
    source         text            NULL,
    CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx ON public.admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON public.admin_audit_log (actor_user_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS "Allow select for super_admins" ON public.admin_audit_log;
CREATE POLICY "Allow select for super_admins" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.authorize_admin());

DROP POLICY IF EXISTS "Allow insert for actor" ON public.admin_audit_log;
CREATE POLICY "Allow insert for actor" ON public.admin_audit_log FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = actor_user_id AND public.authorize_admin());

-- 4. TABLE: tournament_participants
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT REFERENCES public.clubs(id) ON DELETE CASCADE,
    name TEXT,
    type TEXT CHECK (type IN ('club', 'national_team', 'franchise', 'invited', 'individual')) DEFAULT 'club',
    status TEXT CHECK (status IN ('active', 'inactive', 'pending', 'disqualified', 'withdrawn')) DEFAULT 'active',
    seed INT,
    group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
    short_code TEXT,
    notes TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club ON public.tournament_participants(club_id);

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_participants" ON public.tournament_participants;
CREATE POLICY "public_read_participants" ON public.tournament_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "authenticated_all_participants" ON public.tournament_participants;
CREATE POLICY "authenticated_all_participants" ON public.tournament_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.tournament_participants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournament_participants TO authenticated;

-- 5. ALIGN MATCHES SCHEMA
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS phase_id UUID NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS group_id UUID NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS referee TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pitch TEXT;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_phase_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.tournament_phases(id) ON DELETE SET NULL;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_group_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_phase_id ON public.matches(phase_id);
CREATE INDEX IF NOT EXISTS idx_matches_group_id ON public.matches(group_id);

-- 6. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

SELECT 'SUCCESS! All relations restored and schemas aligned. Wait 5 seconds.' AS message;
