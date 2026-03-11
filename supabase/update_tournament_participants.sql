-- Migration: Update tournament_participants table for Flash UI requirements
-- Author: Antigravity
-- Date: 2026-03-05

-- 1. Create the table if it doesn't exist (safety)
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'club',
    status TEXT NOT NULL DEFAULT 'active',
    seed INTEGER,
    group_id UUID,
    region_id UUID,
    category_id UUID,
    short_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add columns if they are missing (for existing table)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tournament_participants' AND COLUMN_NAME = 'type') THEN
        ALTER TABLE public.tournament_participants ADD COLUMN type TEXT NOT NULL DEFAULT 'club';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tournament_participants' AND COLUMN_NAME = 'seed') THEN
        ALTER TABLE public.tournament_participants ADD COLUMN seed INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tournament_participants' AND COLUMN_NAME = 'group_id') THEN
        ALTER TABLE public.tournament_participants ADD COLUMN group_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tournament_participants' AND COLUMN_NAME = 'region_id') THEN
        ALTER TABLE public.tournament_participants ADD COLUMN region_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tournament_participants' AND COLUMN_NAME = 'category_id') THEN
        ALTER TABLE public.tournament_participants ADD COLUMN category_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tournament_participants' AND COLUMN_NAME = 'short_code') THEN
        ALTER TABLE public.tournament_participants ADD COLUMN short_code TEXT;
    END IF;
END $$;

-- 3. Enable RLS
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- 4. Polices (Drop existing to avoid conflict if any)
DROP POLICY IF EXISTS "public_read_participants" ON public.tournament_participants;
CREATE POLICY "public_read_participants" ON public.tournament_participants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_all_participants" ON public.tournament_participants;
CREATE POLICY "admin_all_participants" ON public.tournament_participants
    FOR ALL USING (true);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_club ON public.tournament_participants(club_id);
