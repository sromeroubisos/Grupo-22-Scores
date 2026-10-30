import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    getPreapproval,
    getPayment,
    type PreapprovalDetails,
} from '@/lib/billing/mercadopago';

// Webhook MercadoPago. Recibe notificaciones de preapproval y payment.
// Documentación: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks

function ok(data: Record<string, unknown> = {}) {
    return NextResponse.json({ ok: true, ...data });
}

function bad(reason: string, status = 400) {
    return NextResponse.json({ ok: false, error: reason }, { status });
}

// Una notificación firmada hace más de 5 minutos es un reenvío capturado,
// no un aviso de MP: la firma sola no alcanza si el ts no se mira.
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
// Cuántos payment_id aplicados se recuerdan en `subscriptions.metadata`.
const APPLIED_PAYMENTS_KEPT = 50;

function isProductionRuntime() {
    return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/** El ts de x-signature viene en segundos (a veces en ms): se normaliza. */
function isFreshSignatureTs(ts: string, nowMs = Date.now()): boolean {
    const value = Number(ts);
    if (!Number.isFinite(value) || value <= 0) return false;
    const ms = value < 1e12 ? value * 1000 : value;
    return Math.abs(nowMs - ms) <= MAX_SIGNATURE_AGE_MS;
}

function verifySignature(
    request: NextRequest,
    rawBody: string,
    secret: string
): boolean {
    const header = request.headers.get('x-signature');
    const requestId = request.headers.get('x-request-id') ?? '';
    if (!header) return false;

    // x-signature format: "ts=1234,v1=abc..."
    const parts = Object.fromEntries(
        header.split(',').map((p) => {
            const [k, v] = p.trim().split('=');
            return [k, v ?? ''];
        })
    );

    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;
    if (!isFreshSignatureTs(ts)) {
        console.warn('[mp-webhook] firma vencida o con ts inválido', { ts });
        return false;
    }

    // MP firma sobre: "id:<id>;request-id:<requestId>;ts:<ts>;"
    // El id es el data.id del payload o un query param.
    let id: string | null = null;
    try {
        const body = JSON.parse(rawBody);
        id = String(body?.data?.id ?? '');
    } catch { /* noop */ }

    const url = new URL(request.url);
    if (!id) {
        id = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
    }

    const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(v1, 'hex')
        );
    } catch {
        return false;
    }
}

interface WebhookPayload {
    type?: string;
    action?: string;
    data?: { id?: string | number };
}

function isoPlus30Days(from: Date): string {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString();
}

function mpStatusToOurs(mpStatus: string): 'active' | 'pending' | 'cancelled' | 'past_due' {
    switch (mpStatus) {
        case 'authorized':
            return 'active';
        case 'paused':
            return 'past_due';
        case 'cancelled':
            return 'cancelled';
        case 'pending':
        default:
            return 'pending';
    }
}

async function handlePreapproval(preapprovalId: string) {
    const admin = createAdminClient();

    let details: PreapprovalDetails;
    try {
        details = await getPreapproval(preapprovalId);
    } catch (e) {
        console.error('[mp-webhook] getPreapproval', preapprovalId, e);
        return bad('No pudimos obtener la suscripción de Mercado Pago', 502);
    }

    const subscriptionId = details.externalReference;
    if (!subscriptionId) {
        return bad('preapproval sin external_reference', 422);
    }

    const ourStatus = mpStatusToOurs(details.status);
    const now = new Date();

    // `metadata` también guarda los pagos ya aplicados (ver handlePayment): se
    // mezcla en vez de pisarse, o un aviso de preapproval borraría ese registro
    // y el próximo reenvío de un pago viejo volvería a extender el período.
    const { data: currentSub } = await admin
        .from('subscriptions')
        .select('metadata')
        .eq('id', subscriptionId)
        .maybeSingle();
    const previousMetadata = (currentSub?.metadata && typeof currentSub.metadata === 'object')
        ? currentSub.metadata as Record<string, unknown>
        : {};

    const update: Record<string, unknown> = {
        status: ourStatus,
        provider_payer_id: details.payerId ? String(details.payerId) : null,
        metadata: {
            ...previousMetadata,
            preapproval_status: details.status,
            next_payment_date: details.nextPaymentDate,
        },
    };

    if (ourStatus === 'active') {
        update.current_period_start = now.toISOString();
        update.current_period_end = details.nextPaymentDate || isoPlus30Days(now);
    } else if (ourStatus === 'cancelled') {
        update.cancelled_at = now.toISOString();
    }

    const { error } = await admin
        .from('subscriptions')
        .update(update)
        .eq('id', subscriptionId);

    if (error) {
        console.error('[mp-webhook] update preapproval', subscriptionId, error);
        return bad('No se pudo actualizar la suscripción', 500);
    }

    return ok({ subscriptionId, status: ourStatus });
}

function appliedPaymentIds(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== 'object') return [];
    const list = (metadata as Record<string, unknown>).applied_payment_ids;
    return Array.isArray(list) ? list.map((value) => String(value)) : [];
}

async function handlePayment(paymentId: string) {
    const admin = createAdminClient();

    // El pago se consulta SIEMPRE a la API de MP con nuestro token: el body
    // del webhook solo aporta el id, nunca el estado ni el monto.
    let payment;
    try {
        payment = await getPayment(paymentId);
    } catch (e) {
        console.error('[mp-webhook] getPayment', paymentId, e);
        return bad('No pudimos obtener el pago de Mercado Pago', 502);
    }

    if (payment.status !== 'approved') {
        return ok({ paymentId, ignored: true, status: payment.status });
    }

    const subscriptionId = payment.externalReference;
    if (!subscriptionId) {
        return ok({ paymentId, ignored: true, reason: 'no external_reference' });
    }

    // Idempotencia: MP reintenta el mismo aviso varias veces (y un reenvío
    // capturado también llega acá). Cada payment_id extiende el período UNA
    // vez: se anota en `subscriptions.metadata.applied_payment_ids`, y el
    // update es condicional sobre el `current_period_end` leído, así dos
    // entregas simultáneas del mismo pago no extienden dos veces.
    const appliedId = String(payment.id ?? paymentId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: sub, error: subError } = await admin
            .from('subscriptions')
            .select('id, current_period_end, plan, metadata')
            .eq('id', subscriptionId)
            .maybeSingle();

        if (subError) {
            console.error('[mp-webhook] read subscription', subscriptionId, subError);
            return bad('No se pudo leer la suscripción', 500);
        }
        if (!sub) {
            return ok({ paymentId, ignored: true, reason: 'subscription not found' });
        }

        const applied = appliedPaymentIds(sub.metadata);
        if (applied.includes(appliedId)) {
            return ok({ paymentId, subscriptionId, ignored: true, reason: 'already applied' });
        }

        // Extender período en 30 días desde el final actual (o desde ahora si ya venció).
        const now = new Date();
        const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
        const baseDate = currentEnd && currentEnd > now ? currentEnd : now;
        const newEnd = isoPlus30Days(baseDate);
        const previousMetadata = (sub.metadata && typeof sub.metadata === 'object')
            ? sub.metadata as Record<string, unknown>
            : {};

        let update = admin
            .from('subscriptions')
            .update({
                status: 'active',
                current_period_end: newEnd,
                metadata: {
                    ...previousMetadata,
                    applied_payment_ids: [...applied, appliedId].slice(-APPLIED_PAYMENTS_KEPT),
                    last_payment_id: appliedId,
                },
            })
            .eq('id', subscriptionId);
        update = sub.current_period_end
            ? update.eq('current_period_end', sub.current_period_end)
            : update.is('current_period_end', null);

        const { data: updated, error: updateError } = await update.select('id');
        if (updateError) {
            console.error('[mp-webhook] extend subscription', subscriptionId, updateError);
            return bad('No se pudo actualizar la suscripción', 500);
        }
        if (Array.isArray(updated) && updated.length > 0) {
            return ok({ paymentId, subscriptionId, newEnd });
        }
        // Otro aviso cambió la fila en el medio: se relee y se decide de nuevo.
    }

    return bad('La suscripción cambió mientras se aplicaba el pago; MP va a reintentar.', 409);
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret && isProductionRuntime()) {
        // Fail-closed: sin secreto en producción no hay forma de saber que el
        // aviso viene de MP. Antes se procesaba igual y cualquiera activaba una
        // suscripción con un POST.
        console.error('[mp-webhook] MP_WEBHOOK_SECRET no configurado en producción: se rechaza el aviso.');
        return bad('Webhook no configurado', 500);
    }
    if (secret) {
        const valid = verifySignature(request, rawBody, secret);
        if (!valid) {
            console.warn('[mp-webhook] firma inválida', {
                hasSig: Boolean(request.headers.get('x-signature')),
            });
            return bad('Firma inválida', 401);
        }
    }

    let payload: WebhookPayload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return bad('JSON inválido', 400);
    }

    const url = new URL(request.url);
    const topicParam = url.searchParams.get('topic') || url.searchParams.get('type');
    const type = (payload.type || topicParam || '').toString();
    const dataId = payload.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id');

    if (!dataId) {
        return ok({ ignored: true, reason: 'no data.id' });
    }

    const id = String(dataId);

    if (type === 'preapproval' || type === 'subscription_preapproval') {
        return handlePreapproval(id);
    }
    if (type === 'payment' || type === 'subscription_authorized_payment') {
        return handlePayment(id);
    }

    return ok({ ignored: true, type });
}

export async function GET() {
    return NextResponse.json({ ok: true, service: 'mp-webhook' });
}
