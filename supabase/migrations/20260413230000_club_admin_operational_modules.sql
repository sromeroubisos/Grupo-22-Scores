BEGIN;

CREATE TABLE IF NOT EXISTS public.club_enabled_sports (
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    sport_id TEXT NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, sport_id)
);

CREATE TABLE IF NOT EXISTS public.club_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NULL,
    folder TEXT NOT NULL DEFAULT 'General',
    visibility TEXT NOT NULL DEFAULT 'club',
    file_url TEXT NOT NULL,
    file_path TEXT NULL,
    mime_type TEXT NULL,
    size_bytes BIGINT NULL,
    uploaded_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_documents_visibility_check CHECK (visibility IN ('club', 'staff', 'plantel', 'publico', 'directivos'))
);

CREATE TABLE IF NOT EXISTS public.club_sponsors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'colaborador',
    status TEXT NOT NULL DEFAULT 'active',
    placement TEXT NULL,
    logo_url TEXT NULL,
    website TEXT NULL,
    notes TEXT NULL,
    contract_start DATE NULL,
    contract_end DATE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_sponsors_tier_check CHECK (tier IN ('principal', 'oro', 'plata', 'colaborador')),
    CONSTRAINT club_sponsors_status_check CHECK (status IN ('active', 'expired', 'pending'))
);

CREATE TABLE IF NOT EXISTS public.club_integration_settings (
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    integration_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, integration_key)
);

CREATE INDEX IF NOT EXISTS idx_club_documents_club_id ON public.club_documents(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_sponsors_club_id ON public.club_sponsors(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_integrations_club_id ON public.club_integration_settings(club_id);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS club_documents_set_updated_at ON public.club_documents';
        EXECUTE 'CREATE TRIGGER club_documents_set_updated_at
            BEFORE UPDATE ON public.club_documents
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';

        EXECUTE 'DROP TRIGGER IF EXISTS club_sponsors_set_updated_at ON public.club_sponsors';
        EXECUTE 'CREATE TRIGGER club_sponsors_set_updated_at
            BEFORE UPDATE ON public.club_sponsors
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';

        EXECUTE 'DROP TRIGGER IF EXISTS club_integrations_set_updated_at ON public.club_integration_settings';
        EXECUTE 'CREATE TRIGGER club_integrations_set_updated_at
            BEFORE UPDATE ON public.club_integration_settings
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.club_enabled_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_integration_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS club_enabled_sports_admin_manage ON public.club_enabled_sports';
        EXECUTE 'CREATE POLICY club_enabled_sports_admin_manage ON public.club_enabled_sports
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';

        EXECUTE 'DROP POLICY IF EXISTS club_documents_admin_manage ON public.club_documents';
        EXECUTE 'CREATE POLICY club_documents_admin_manage ON public.club_documents
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';

        EXECUTE 'DROP POLICY IF EXISTS club_sponsors_admin_manage ON public.club_sponsors';
        EXECUTE 'CREATE POLICY club_sponsors_admin_manage ON public.club_sponsors
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';

        EXECUTE 'DROP POLICY IF EXISTS club_integrations_admin_manage ON public.club_integration_settings';
        EXECUTE 'CREATE POLICY club_integrations_admin_manage ON public.club_integration_settings
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';
    END IF;
END $$;

INSERT INTO public.club_integration_settings (club_id, integration_key, enabled, config)
SELECT c.id, integration_key, FALSE, '{}'::jsonb
FROM public.clubs c
CROSS JOIN (
    VALUES
        ('public_profile'),
        ('fixture_sync'),
        ('standings'),
        ('editorial'),
        ('bulk_roster'),
        ('documents'),
        ('sponsors')
) AS keys(integration_key)
ON CONFLICT (club_id, integration_key) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'clubs'
          AND column_name = 'sport_id'
    ) THEN
        INSERT INTO public.club_enabled_sports (club_id, sport_id)
        SELECT id, sport_id
        FROM public.clubs
        WHERE sport_id IS NOT NULL
        ON CONFLICT (club_id, sport_id) DO NOTHING;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'clubs'
          AND column_name = 'sport'
    ) THEN
        INSERT INTO public.club_enabled_sports (club_id, sport_id)
        SELECT id, sport
        FROM public.clubs
        WHERE sport IS NOT NULL
        ON CONFLICT (club_id, sport_id) DO NOTHING;
    END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('club-assets', 'club-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
