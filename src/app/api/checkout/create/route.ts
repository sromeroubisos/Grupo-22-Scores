import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    PLANS,
    FOUNDER_PROMO_ENABLED,
    isPurchasablePlan,
    getEffectivePriceUsd,
    type PlanTier,
} from '@/lib/billing/plans';
import { createPreapproval, usdToArs } from '@/lib/billing/mercadopago';

function err(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function getBaseUrl(request: NextRequest): string {
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL;
    if (envUrl) return envUrl.replace(/\/$/, '');
    return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
    let body: { plan?: string };
    try {
        body = await request.json();
    } catch {
        return err('Body inválido.', 400);
    }

    const planRaw = body.plan;
    if (typeof planRaw !== 'string' || !isPurchasablePlan(planRaw as PlanTier)) {
        return err('Plan inválido.', 400);
    }

    const plan = planRaw as PlanTier;
    const planDef = PLANS[plan];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return err('Necesitás iniciar sesión.', 401);
    }
    if (!user.email) {
        return err('Tu cuenta no tiene email asociado.', 400);
    }

    const admin = createAdminClient();

    // Si ya tiene una pendiente o activa al MISMO plan, devolverle esa.
    const { data: existing, error: existingError } = await admin
        .from('subscriptions')
        .select('id, plan, status, provider_subscription_id, metadata')
        .eq('user_id', user.id)
        .in('status', ['pending', 'active'])
        .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
        return err('No pudimos consultar tus suscripciones existentes.', 500);
    }

    if (existing && existing.status === 'active') {
        return err('Ya tenés una suscripción activa. Cancelá la actual desde /billing antes de cambiar de plan.', 409);
    }

    const priceUsd = getEffectivePriceUsd(plan);
    const isFounder = FOUNDER_PROMO_ENABLED && planDef.founderPriceUsd != null;
    const priceArs = usdToArs(priceUsd);

    // Crear (o reusar) el row pending antes de llamar a MP, para tener external_reference.
    let subscriptionId: string;

    if (existing && existing.status === 'pending' && existing.plan === plan) {
        subscriptionId = existing.id;
    } else {
        // Si había una pending para otro plan, la marcamos cancelled.
        if (existing && existing.status === 'pending') {
            await admin
                .from('subscriptions')
                .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                .eq('id', existing.id);
        }

        const { data: created, error: insertError } = await admin
            .from('subscriptions')
            .insert({
                user_id: user.id,
                plan,
                status: 'pending',
                provider: 'mercadopago',
                price_usd: priceUsd,
                price_ars: priceArs,
                is_founder_price: isFounder,
            })
            .select('id')
            .single();

        if (insertError || !created?.id) {
            return err('No pudimos crear la suscripción.', 500);
        }
        subscriptionId = created.id as string;
    }

    const baseUrl = getBaseUrl(request);
    const backUrl = `${baseUrl}/checkout/${plan}?status=success`;
    const notificationUrl = `${baseUrl}/api/webhooks/mercadopago`;

    let preapproval;
    try {
        preapproval = await createPreapproval({
            reason: `${planDef.name} · G22 Scores`,
            externalReference: subscriptionId,
            payerEmail: user.email,
            transactionAmountArs: priceArs,
            backUrl,
            notificationUrl,
        });
    } catch (e) {
        await admin
            .from('subscriptions')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                metadata: { error: String((e as Error).message) },
            })
            .eq('id', subscriptionId);
        return err('No pudimos iniciar el pago en MercadoPago. Verificá la configuración del integrador.', 502);
    }

    await admin
        .from('subscriptions')
        .update({
            provider_subscription_id: preapproval.id,
            metadata: { preapproval_status: preapproval.status },
        })
        .eq('id', subscriptionId);

    return NextResponse.json({
        subscriptionId,
        preapprovalId: preapproval.id,
        checkoutUrl: preapproval.initPoint,
    });
}
