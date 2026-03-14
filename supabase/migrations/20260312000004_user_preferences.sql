-- ============================================================
-- User Preferences & Onboarding Tables
-- Created: 2026-03-12
-- Purpose: Store user sport/league favorites and onboarding state
-- ============================================================

-- 1. Onboarding status per user
CREATE TABLE IF NOT EXISTS public.user_onboarding_status (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    preferences_onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    sports_completed BOOLEAN NOT NULL DEFAULT false,
    leagues_completed BOOLEAN NOT NULL DEFAULT false,
    skipped BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Favorite sports per user
CREATE TABLE IF NOT EXISTS public.user_favorite_sports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sport_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, sport_id)
);

-- 3. Favorite leagues per user
CREATE TABLE IF NOT EXISTS public.user_favorite_leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,
    sport_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, league_id)
);

-- Indexes for fast user-scoped lookups
CREATE INDEX IF NOT EXISTS idx_user_favorite_sports_user_id ON public.user_favorite_sports(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_sports_sport_id ON public.user_favorite_sports(sport_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_user_id ON public.user_favorite_leagues(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_sport_id ON public.user_favorite_leagues(sport_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.user_onboarding_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorite_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorite_leagues ENABLE ROW LEVEL SECURITY;

-- Each user can only read/write their own onboarding status
CREATE POLICY "Users manage own onboarding status"
    ON public.user_onboarding_status
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Each user can only read/write their own favorite sports
CREATE POLICY "Users manage own favorite sports"
    ON public.user_favorite_sports
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Each user can only read/write their own favorite leagues
CREATE POLICY "Users manage own favorite leagues"
    ON public.user_favorite_leagues
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
