-- Device-level Web Push subscriptions for mobile/PWA system notifications.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    platform TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_push_subscriptions
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- El cron toma como pendiente toda notificacion sin leer y sin system_notified_at.
-- Cuando la columna nace, TODO el historial sin leer queda elegible de golpe: el
-- dia que se aplico esto eran 19.733 filas, la mas vieja de abril. Sin la marca,
-- el primero que se suscriba recibe meses de avisos viejos a 50 por minuto.
-- Por eso el backfill corre UNA sola vez, en el mismo momento en que se crea la
-- columna; si la migracion se vuelve a correr, no toca lo que quedo pendiente.
DO $$
DECLARE
    column_existed BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_notifications'
          AND column_name = 'system_notified_at'
    ) INTO column_existed;

    ALTER TABLE public.user_notifications
        ADD COLUMN IF NOT EXISTS system_notified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS system_push_error TEXT;

    -- Va por EXECUTE: la columna nace dos lineas mas arriba, en esta misma
    -- transaccion, y asi el UPDATE se parsea recien cuando ya existe.
    IF NOT column_existed THEN
        EXECUTE $backfill$
            UPDATE public.user_notifications
            SET system_notified_at = now(),
                system_push_error = 'backfill_pre_web_push'
            WHERE system_notified_at IS NULL
        $backfill$;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_enabled
    ON public.user_push_subscriptions(user_id)
    WHERE enabled IS TRUE;

CREATE INDEX IF NOT EXISTS idx_user_notifications_pending_system_push
    ON public.user_notifications(created_at ASC)
    WHERE read_at IS NULL
      AND system_notified_at IS NULL;

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own push subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users insert own push subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users update own push subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.user_push_subscriptions;

CREATE POLICY "Users read own push subscriptions"
    ON public.user_push_subscriptions
    FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own push subscriptions"
    ON public.user_push_subscriptions
    FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own push subscriptions"
    ON public.user_push_subscriptions
    FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own push subscriptions"
    ON public.user_push_subscriptions
    FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
