-- ============================================================
-- Ensure Tournament Admin Permissions (Fix for PGRST116)
-- Broadens RLS policies for tournaments to include all admin roles.
-- ============================================================

-- First, check if the policy exists and drop it to recreate with updated roles
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tournaments' 
        AND policyname = 'Super Admin Access'
    ) THEN
        DROP POLICY "Super Admin Access" ON public.tournaments;
    END IF;
END $$;

-- Create a more inclusive policy for tournaments administration
-- This covers super_admin, admin_general, and admin roles
CREATE POLICY "Admin Tournament Management" ON public.tournaments
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'admin_general', 'admin')
    )
);

-- Additionally, ensure public read stays active (should already be there, but for safety)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tournaments' 
        AND policyname = 'Public Read Tournaments'
    ) THEN
        CREATE POLICY "Public Read Tournaments" ON public.tournaments 
        FOR SELECT 
        USING (true);
    END IF;
END $$;

-- Notify schema cache refresh
NOTIFY pgrst, 'reload schema';
