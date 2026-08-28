-- Sistema de API keys administrable desde Super Admin.
--
-- Reemplaza a la key unica de system_api_keys (que se sigue leyendo como
-- fallback para no cortar las integraciones ya configuradas): aca cada
-- consumidor tiene su propia key, con nombre, permisos y revocacion.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NULL,
    secret_hash TEXT NOT NULL,
    secret_preview TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT api_keys_name_check CHECK (char_length(trim(name)) > 0),
    CONSTRAINT api_keys_secret_hash_length_check CHECK (char_length(secret_hash) = 64),
    -- cardinality y no array_length: para '{}' array_length devuelve NULL, y un
    -- CHECK que evalua a NULL PASA. Con array_length la constraint no ataja
    -- nada (verificado contra la base: entro una key con scopes vacio).
    CONSTRAINT api_keys_scopes_check CHECK (cardinality(scopes) >= 1)
);

-- La verificacion busca por hash, no recorre la tabla: el indice unico es el
-- que hace que autenticar sea O(1) y ademas impide dos keys con el mismo hash.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_secret_hash
    ON public.api_keys (secret_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_active
    ON public.api_keys (revoked_at, created_at DESC);

DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS api_keys_set_updated_at ON public.api_keys';
        EXECUTE 'CREATE TRIGGER api_keys_set_updated_at
            BEFORE UPDATE ON public.api_keys
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at()';
    END IF;
END $$;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Sin politica para anon/authenticated: la tabla se toca unicamente con
-- service_role desde el servidor. La policy de admin existe para que un
-- super admin pueda auditarla desde el SQL editor sin apagar RLS.
DO $$
BEGIN
    IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS api_keys_admin_manage ON public.api_keys';
        EXECUTE 'CREATE POLICY api_keys_admin_manage ON public.api_keys
            FOR ALL
            USING (public.authorize_admin())
            WITH CHECK (public.authorize_admin())';
    END IF;
END $$;

COMMENT ON TABLE public.api_keys IS 'API keys por consumidor, con scopes y revocacion, administradas desde Super Admin. Solo se guarda el hash sha256 del secreto.';
COMMENT ON COLUMN public.api_keys.scopes IS 'Permisos concedidos. Catalogo en src/lib/server/apiKeys.ts (API_KEY_SCOPES).';
COMMENT ON COLUMN public.api_keys.last_used_at IS 'Ultima vez que la key autentico un request. Se escribe como maximo una vez por minuto por key.';

-- La tabla puede existir de una corrida anterior con el CHECK viejo, que no
-- ataja el array vacio: se reemplaza sin tocar los datos.
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_scopes_check;
ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_scopes_check CHECK (cardinality(scopes) >= 1);

COMMIT;

-- PostgREST cachea el esquema: sin esto, la tabla existe pero la API sigue
-- contestando PGRST205 hasta que el cache se refresque solo.
NOTIFY pgrst, 'reload schema';
