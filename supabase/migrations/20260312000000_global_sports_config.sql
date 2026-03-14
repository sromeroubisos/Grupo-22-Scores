-- ============================================
-- GLOBAL SPORTS CONFIGURATION
-- ============================================

-- 1. Create or Update Sports Table
CREATE TABLE IF NOT EXISTS public.sports (
    id TEXT PRIMARY KEY, -- 'rugby', 'football', etc.
    name TEXT NOT NULL,
    slug TEXT,
    is_visible BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    icon TEXT,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add columns if they don't exist (in case table already existed)
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 100;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS name_es TEXT; -- Added for translations

-- 3. Enable RLS
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "public_read_sports" ON public.sports;
CREATE POLICY "public_read_sports" ON public.sports
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "super_admin_manage_sports" ON public.sports;
CREATE POLICY "super_admin_manage_sports" ON public.sports
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- 5. Seeding initial sports data (to match hardcoded list)
-- Note: Setting specific order for priority sports
INSERT INTO public.sports (id, name, name_es, display_order, is_visible)
VALUES
('rugby', 'Rugby', 'Rugby', 1, true),
('football', 'Football', 'Fútbol', 2, true),
('basketball', 'Basketball', 'Básquet', 3, true),
('hockey', 'Hockey', 'Hockey', 4, true),
('tennis', 'Tennis', 'Tenis', 5, true),
('volleyball', 'Volleyball', 'Vóley', 6, true),
('handball', 'Handball', 'Handball', 7, true),
('baseball', 'Baseball', 'Béisbol', 8, true),
('american-football', 'American Football', 'F. Am.', 9, true)
ON CONFLICT (id) DO UPDATE SET
    display_order = EXCLUDED.display_order,
    name_es = COALESCE(public.sports.name_es, EXCLUDED.name_es);

-- 6. Audit Logging Setup
-- (Assumes an existing audit_logs table exists based on previous migrations)
CREATE OR REPLACE FUNCTION public.audit_sports_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.admin_audit_log (
            admin_id,
            action,
            entity_type,
            entity_id,
            old_data,
            new_data
        ) VALUES (
            auth.uid(),
            'update_sports_config',
            'sports',
            NEW.id,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for audit
DROP TRIGGER IF EXISTS tr_audit_sports ON public.sports;
CREATE TRIGGER tr_audit_sports
    AFTER UPDATE ON public.sports
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_sports_changes();
