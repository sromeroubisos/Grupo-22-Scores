-- EMERGENCY FIX SCRIPT
-- Runs in Supabase SQL Editor

BEGIN;

-- 1. Ensure extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Fix CLUBS Table Permissions
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- Remove conflicting policies
DROP POLICY IF EXISTS "Public read clubs" ON public.clubs;
DROP POLICY IF EXISTS "Anyone can select clubs" ON public.clubs;
DROP POLICY IF EXISTS "Admins write clubs" ON public.clubs;
DROP POLICY IF EXISTS "club_select_policy" ON public.clubs;
DROP POLICY IF EXISTS "club_insert_policy" ON public.clubs;
DROP POLICY IF EXISTS "club_update_policy" ON public.clubs;
DROP POLICY IF EXISTS "club_delete_policy" ON public.clubs;

-- Create OPEN policies for debugging (Read-Only Public, Write All for now to test)
CREATE POLICY "Public read clubs" ON public.clubs FOR SELECT USING (true);
CREATE POLICY "Public write clubs" ON public.clubs FOR ALL USING (true);

-- 3. Fix MATCHES Table Permissions
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read matches" ON public.matches;
DROP POLICY IF EXISTS "Admins write matches" ON public.matches;

CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public write matches" ON public.matches FOR ALL USING (true);

-- 4. Insert Test Data if Empty
INSERT INTO public.clubs (name, logo_url, city, country_id, union_id)
VALUES 
  ('Club San Andres', '', 'Buenos Aires', 'ARG', 'uar'),
  ('Club Newman', '', 'Benavidez', 'ARG', 'uar'),
  ('Club CUBA', '', 'Villa de Mayo', 'ARG', 'uar')
ON CONFLICT DO NOTHING;

COMMIT;

-- Check data
SELECT count(*) as total_clubs FROM public.clubs;
