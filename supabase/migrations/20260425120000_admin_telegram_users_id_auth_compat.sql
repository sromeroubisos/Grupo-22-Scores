BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.normalize_telegram_phone_number(phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = public
AS $$
    SELECT NULLIF(regexp_replace(phone, '[^0-9]+', '', 'g'), '');
$$;

CREATE TABLE IF NOT EXISTS public.admin_telegram_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id TEXT NOT NULL UNIQUE,
    telegram_phone_number TEXT UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
    id_type TEXT;
BEGIN
    SELECT data_type INTO id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_telegram_users'
      AND column_name = 'id';

    IF id_type IS NOT NULL AND id_type <> 'uuid' THEN
        ALTER TABLE public.admin_telegram_users DROP CONSTRAINT IF EXISTS admin_telegram_users_pkey;
        ALTER TABLE public.admin_telegram_users ALTER COLUMN id DROP IDENTITY IF EXISTS;
        ALTER TABLE public.admin_telegram_users ADD COLUMN IF NOT EXISTS id_uuid UUID DEFAULT gen_random_uuid();
        UPDATE public.admin_telegram_users SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'admin_telegram_users'
              AND column_name = 'legacy_id'
        ) THEN
            ALTER TABLE public.admin_telegram_users RENAME COLUMN id TO legacy_id;
        ELSE
            ALTER TABLE public.admin_telegram_users DROP COLUMN id;
        END IF;

        ALTER TABLE public.admin_telegram_users RENAME COLUMN id_uuid TO id;
        ALTER TABLE public.admin_telegram_users ADD CONSTRAINT admin_telegram_users_pkey PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE public.admin_telegram_users
    ADD COLUMN IF NOT EXISTS telegram_user_id TEXT,
    ADD COLUMN IF NOT EXISTS telegram_phone_number TEXT,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.admin_telegram_users
    ALTER COLUMN telegram_user_id TYPE TEXT USING telegram_user_id::TEXT,
    ALTER COLUMN telegram_phone_number DROP NOT NULL,
    ALTER COLUMN is_active SET NOT NULL,
    ALTER COLUMN is_active SET DEFAULT TRUE,
    ALTER COLUMN permissions SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE public.admin_telegram_users
SET permissions = '{}'::jsonb
WHERE permissions IS NULL;

ALTER TABLE public.admin_telegram_users
    ALTER COLUMN permissions SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.admin_telegram_users
        WHERE telegram_user_id IS NULL OR trim(telegram_user_id) = ''
    ) THEN
        ALTER TABLE public.admin_telegram_users ALTER COLUMN telegram_user_id SET NOT NULL;
    END IF;
END $$;

ALTER TABLE public.admin_telegram_users
    DROP CONSTRAINT IF EXISTS admin_telegram_users_phone_not_blank;

DO $$
BEGIN
    ALTER TABLE public.admin_telegram_users
        ADD CONSTRAINT admin_telegram_users_phone_not_blank
        CHECK (
            telegram_phone_number IS NULL
            OR public.normalize_telegram_phone_number(telegram_phone_number) IS NOT NULL
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_telegram_users_telegram_user_id
    ON public.admin_telegram_users (telegram_user_id)
    WHERE telegram_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_telegram_users_phone_digits_key
    ON public.admin_telegram_users (public.normalize_telegram_phone_number(telegram_phone_number))
    WHERE telegram_phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_telegram_users_active_telegram_user_id
    ON public.admin_telegram_users (telegram_user_id)
    WHERE is_active = TRUE;

DROP FUNCTION IF EXISTS public.is_admin_telegram_user_authorized(BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.is_admin_telegram_user_authorized(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.is_admin_telegram_user_authorized(
    p_telegram_user_id TEXT DEFAULT NULL,
    p_telegram_phone_number TEXT DEFAULT NULL
)
RETURNS TABLE (
    authorized BOOLEAN,
    id UUID,
    telegram_user_id TEXT,
    telegram_phone_number TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT,
    permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    normalized_phone TEXT := public.normalize_telegram_phone_number(p_telegram_phone_number);
    normalized_telegram_user_id TEXT := NULLIF(trim(p_telegram_user_id), '');
BEGIN
    RETURN QUERY
    SELECT
        TRUE AS authorized,
        u.id,
        u.telegram_user_id,
        u.telegram_phone_number,
        u.username,
        u.first_name,
        u.last_name,
        u.role,
        u.permissions
    FROM public.admin_telegram_users AS u
    WHERE u.is_active = TRUE
      AND (
          (normalized_telegram_user_id IS NOT NULL AND u.telegram_user_id = normalized_telegram_user_id)
          OR (
              normalized_phone IS NOT NULL
              AND public.normalize_telegram_phone_number(u.telegram_phone_number) = normalized_phone
          )
      )
    ORDER BY
        CASE
            WHEN normalized_telegram_user_id IS NOT NULL AND u.telegram_user_id = normalized_telegram_user_id THEN 0
            ELSE 1
        END,
        u.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            FALSE,
            NULL::UUID,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            '{}'::JSONB;
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.link_admin_telegram_user_identity(BIGINT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.link_admin_telegram_user_identity(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.link_admin_telegram_user_identity(
    p_telegram_user_id TEXT,
    p_telegram_phone_number TEXT,
    p_username TEXT DEFAULT NULL,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    linked BOOLEAN,
    id UUID,
    telegram_user_id TEXT,
    telegram_phone_number TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
    normalized_phone TEXT := public.normalize_telegram_phone_number(p_telegram_phone_number);
    normalized_telegram_user_id TEXT := NULLIF(trim(p_telegram_user_id), '');
BEGIN
    IF normalized_telegram_user_id IS NULL OR normalized_phone IS NULL THEN
        RETURN QUERY
        SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.admin_telegram_users AS u
    SET
        telegram_user_id = normalized_telegram_user_id,
        username = COALESCE(NULLIF(trim(p_username), ''), u.username),
        first_name = COALESCE(NULLIF(trim(p_first_name), ''), u.first_name),
        last_name = COALESCE(NULLIF(trim(p_last_name), ''), u.last_name)
    WHERE u.is_active = TRUE
      AND public.normalize_telegram_phone_number(u.telegram_phone_number) = normalized_phone
      AND (u.telegram_user_id IS NULL OR u.telegram_user_id = normalized_telegram_user_id)
    RETURNING
        TRUE AS linked,
        u.id,
        u.telegram_user_id,
        u.telegram_phone_number,
        u.username,
        u.first_name,
        u.last_name;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;

ALTER TABLE public.admin_telegram_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS admin_telegram_users_admin_manage ON public.admin_telegram_users';
        EXECUTE 'CREATE POLICY admin_telegram_users_admin_manage ON public.admin_telegram_users
            FOR ALL TO authenticated
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_telegram_users TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_telegram_phone_number(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_telegram_user_authorized(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_admin_telegram_user_identity(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.admin_telegram_users IS 'Telegram bot allowlist for admin users, keyed by Telegram user id and optionally annotated with phone number.';

COMMIT;
