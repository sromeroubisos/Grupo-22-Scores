-- ============================================
-- G22 SCORES - SUPABASE SCHEMA
-- Users, Favorites, and Super Admin System
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'super_admin')),
    country TEXT,
    favorite_sport TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile"
    ON public.users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.users
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Super admins can view all users"
    ON public.users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- ============================================
-- 2. FAVORITES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('league', 'club', 'tournament', 'team', 'player')),
    entity_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure no duplicates
    UNIQUE(user_id, entity_type, entity_id)
);

-- Indexes for favorites
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_entity_type ON public.favorites(entity_type);

-- Enable Row Level Security
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for favorites
CREATE POLICY "Users can view own favorites"
    ON public.favorites
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
    ON public.favorites
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
    ON public.favorites
    FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all favorites"
    ON public.favorites
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- ============================================
-- 3. FUNCTIONS
-- ============================================

-- Function: Handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Determine role based on email
    IF NEW.email = 'superadmin@g22scores.com' THEN
        user_role := 'super_admin';
    ELSE
        user_role := 'user';
    END IF;

    -- Insert into public.users
    INSERT INTO public.users (id, email, name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        user_role
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login_at = NOW(),
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Function: Toggle favorite (RPC)
CREATE OR REPLACE FUNCTION public.toggle_favorite(
    p_entity_type TEXT,
    p_entity_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_exists BOOLEAN;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if favorite exists
    SELECT EXISTS (
        SELECT 1 FROM public.favorites
        WHERE user_id = v_user_id
        AND entity_type = p_entity_type
        AND entity_id = p_entity_id
    ) INTO v_exists;

    IF v_exists THEN
        -- Remove favorite
        DELETE FROM public.favorites
        WHERE user_id = v_user_id
        AND entity_type = p_entity_type
        AND entity_id = p_entity_id;
        RETURN FALSE;
    ELSE
        -- Add favorite
        INSERT INTO public.favorites (user_id, entity_type, entity_id)
        VALUES (v_user_id, p_entity_type, p_entity_id);
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if entity is favorited
CREATE OR REPLACE FUNCTION public.is_favorited(
    p_entity_type TEXT,
    p_entity_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.favorites
        WHERE user_id = v_user_id
        AND entity_type = p_entity_type
        AND entity_id = p_entity_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user favorites by type
CREATE OR REPLACE FUNCTION public.get_user_favorites(
    p_entity_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    entity_type TEXT,
    entity_id TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT f.id, f.entity_type, f.entity_id, f.created_at
    FROM public.favorites f
    WHERE f.user_id = auth.uid()
    AND (p_entity_type IS NULL OR f.entity_type = p_entity_type)
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role FROM public.users
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant permissions on tables
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.toggle_favorite(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_favorited(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_favorites(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================
-- END OF SCHEMA
-- ============================================
