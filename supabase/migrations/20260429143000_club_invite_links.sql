-- Links de invitación personalizados para clubes y familias de clubes
CREATE TABLE IF NOT EXISTS public.club_invite_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    role TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT club_invite_links_scope_type_check CHECK (scope_type IN ('club', 'club_family')),
    CONSTRAINT club_invite_links_role_check CHECK (role IN ('admin', 'editor', 'operator', 'viewer'))
);

CREATE INDEX IF NOT EXISTS club_invite_links_token_idx ON public.club_invite_links (token);
CREATE INDEX IF NOT EXISTS club_invite_links_club_id_idx ON public.club_invite_links (club_id);

-- Política RLS: cualquiera puede leer/validar un token si lo tiene
ALTER TABLE public.club_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_invite_links_select_any"
    ON public.club_invite_links
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "club_invite_links_insert_admin"
    ON public.club_invite_links
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "club_invite_links_delete_admin"
    ON public.club_invite_links
    FOR DELETE
    TO authenticated
    USING (true);

CREATE POLICY "club_invite_links_update_admin"
    ON public.club_invite_links
    FOR UPDATE
    TO authenticated
    USING (true);
