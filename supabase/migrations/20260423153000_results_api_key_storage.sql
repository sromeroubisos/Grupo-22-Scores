BEGIN;

CREATE TABLE IF NOT EXISTS public.system_api_keys (
    key_name TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    secret_preview TEXT NOT NULL,
    rotated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT system_api_keys_key_name_check CHECK (char_length(trim(key_name)) > 0),
    CONSTRAINT system_api_keys_secret_hash_length_check CHECK (char_length(secret_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_system_api_keys_updated_at
    ON public.system_api_keys (updated_at DESC);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS system_api_keys_set_updated_at ON public.system_api_keys';
        EXECUTE 'CREATE TRIGGER system_api_keys_set_updated_at
            BEFORE UPDATE ON public.system_api_keys
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.system_api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS system_api_keys_admin_manage ON public.system_api_keys';
        EXECUTE 'CREATE POLICY system_api_keys_admin_manage ON public.system_api_keys
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';
    END IF;
END $$;

COMMENT ON TABLE public.system_api_keys IS 'Stores hashed system-level API keys managed from Super Admin.';

COMMIT;
