-- Rate limiting que sobrevive al serverless.
--
-- CAUSA: src/lib/rateLimit.ts guarda los contadores en un `new Map()` del
-- proceso. En Vercel cada instancia tiene el suyo, asi que un limite de 10/min
-- es en realidad 10/min POR INSTANCIA: el techo real escala con la cantidad de
-- lambdas que levante el trafico, que es justo lo que crece durante un ataque.
--
-- FIX: el contador vive en Postgres, compartido por todas las instancias.
--
-- La ventana es fija, no deslizante: alcanza para frenar un ataque y evita
-- guardar un timestamp por intento. Una ventana deslizante seria mas precisa en
-- el borde y bastante mas cara.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key               text        PRIMARY KEY,
    count             integer     NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rate_limits IS
    'Contadores de rate limiting compartidos entre instancias. Se escribe solo por consume_rate_limit().';

-- Para la poda: sin esto el DELETE oportunista hace scan completo.
CREATE INDEX IF NOT EXISTS rate_limits_window_started_at_idx
    ON public.rate_limits (window_started_at);

-- RLS prendido y SIN policies: nadie con la anon key entra. Solo service_role,
-- que bypassa RLS. Los contadores de rate limiting son justamente lo que un
-- atacante querria leer (para saber cuanto le queda) o escribir (para dejar
-- afuera a otra IP).
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_key            text,
    p_max            integer,
    p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count   integer;
    v_started timestamptz;
BEGIN
    -- Un solo statement atomico: el UPSERT toma el lock de la fila, asi que dos
    -- lambdas concurrentes no pueden leer el mismo contador y pisarse.
    INSERT INTO public.rate_limits AS rl (key, count, window_started_at)
    VALUES (p_key, 1, now())
    ON CONFLICT (key) DO UPDATE
    SET count = CASE
            WHEN rl.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN 1
            ELSE rl.count + 1
        END,
        window_started_at = CASE
            WHEN rl.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN now()
            ELSE rl.window_started_at
        END
    RETURNING rl.count, rl.window_started_at INTO v_count, v_started;

    -- Poda oportunista: 1 de cada 100 llamadas barre lo vencido. Evita depender
    -- de un cron para que la tabla no crezca sin techo, y reparte el costo en
    -- vez de concentrarlo. random() acá es inofensivo: no hay nada
    -- determinista que preservar en un contador de rate limiting.
    IF random() < 0.01 THEN
        DELETE FROM public.rate_limits WHERE window_started_at < now() - interval '1 day';
    END IF;

    allowed := v_count <= p_max;
    retry_after := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (v_started + make_interval(secs => p_window_seconds) - now())))::integer
    );

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(text, integer, integer) IS
    'Suma 1 al contador de p_key y dice si quedo dentro del limite. Solo service_role.';

-- Que no la pueda llamar cualquiera: con la anon key, un atacante podria
-- quemarle la cuota a la IP de otro.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
