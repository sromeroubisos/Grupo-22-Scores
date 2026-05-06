-- Suscripciones y planes de pago.
-- Cada usuario puede tener una sola suscripción activa a la vez.
-- El webhook del provider (MercadoPago) actualiza status/current_period_end.

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    provider_subscription_id TEXT,
    provider_preference_id TEXT,
    provider_payer_id TEXT,
    price_usd NUMERIC(10, 2),
    price_ars NUMERIC(12, 2),
    is_founder_price BOOLEAN NOT NULL DEFAULT false,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB,
    CONSTRAINT subscriptions_plan_check
        CHECK (plan IN ('free', 'inicial', 'pro', 'organizacion')),
    CONSTRAINT subscriptions_status_check
        CHECK (status IN ('inactive', 'pending', 'active', 'past_due', 'cancelled', 'expired')),
    CONSTRAINT subscriptions_provider_check
        CHECK (provider IN ('mercadopago', 'stripe', 'manual'))
);

-- Solo una suscripción activa o pendiente por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_active_unique
    ON public.subscriptions (user_id)
    WHERE status IN ('active', 'pending');

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
    ON public.subscriptions (user_id);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
    ON public.subscriptions (status);

CREATE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_idx
    ON public.subscriptions (provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_provider_preference_id_idx
    ON public.subscriptions (provider_preference_id)
    WHERE provider_preference_id IS NOT NULL;

-- Trigger para mantener updated_at al día.
CREATE OR REPLACE FUNCTION public.subscriptions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at_trg ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at_trg
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.subscriptions_set_updated_at();

-- RLS: cada usuario ve solo sus propias suscripciones.
-- Las escrituras pasan por el service role (webhooks, checkout API).
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_self" ON public.subscriptions;
CREATE POLICY "subscriptions_select_self"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Los admins globales pueden ver todas las suscripciones.
DROP POLICY IF EXISTS "subscriptions_select_admin" ON public.subscriptions;
CREATE POLICY "subscriptions_select_admin"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role IN ('super_admin', 'admin_general')
        )
    );

-- Vista helper: plan vigente por usuario.
CREATE OR REPLACE VIEW public.user_active_plan AS
SELECT DISTINCT ON (s.user_id)
    s.user_id,
    s.plan,
    s.status,
    s.current_period_end,
    s.is_founder_price,
    s.provider,
    s.id AS subscription_id
FROM public.subscriptions s
WHERE s.status = 'active'
ORDER BY s.user_id, s.current_period_end DESC NULLS LAST;

GRANT SELECT ON public.user_active_plan TO authenticated;

COMMENT ON TABLE public.subscriptions IS 'Suscripciones a planes de pago. Una activa o pendiente por usuario.';
COMMENT ON COLUMN public.subscriptions.is_founder_price IS 'true si la suscripción se creó bajo la promo Fundador (precio reducido por 6 meses).';
COMMENT ON VIEW public.user_active_plan IS 'Plan vigente (status=active) por usuario. Usar para resolver permisos.';
