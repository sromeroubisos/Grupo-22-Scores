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
        return bad(`No pudimos obtener preapproval ${preapprovalId}: ${(e as Error).message}`, 502);
    }

    const subscriptionId = details.externalReference;
    if (!subscriptionId) {
        return bad('preapproval sin external_reference', 422);
    }

    const ourStatus = mpStatusToOurs(details.status);
    const now = new Date();

    const update: Record<string, unknown> = {
        status: ourStatus,
        provider_payer_id: details.payerId ? String(details.payerId) : null,
        metadata: {
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
        return bad(`Update falló: ${error.message}`, 500);
    }

    return ok({ subscriptionId, status: ourStatus });
}

async function handlePayment(paymentId: string) {
    const admin = createAdminClient();

    let payment;
    try {
        payment = await getPayment(paymentId);
    } catch (e) {
        return bad(`No pudimos obtener payment ${paymentId}: ${(e as Error).message}`, 502);
    }

    if (payment.status !== 'approved') {
        return ok({ paymentId, ignored: true, status: payment.status });
    }

    const subscriptionId = payment.externalReference;
    if (!subscriptionId) {
        return ok({ paymentId, ignored: true, reason: 'no external_reference' });
    }

    const { data: sub } = await admin
        .from('subscriptions')
        .select('id, current_period_end, plan')
        .eq('id', subscriptionId)
        .maybeSingle();

    if (!sub) {
        return ok({ paymentId, ignored: true, reason: 'subscription not found' });
    }

    // Extender período en 30 días desde el final actual (o desde ahora si ya venció).
    const now = new Date();
    const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const baseDate = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = isoPlus30Days(baseDate);

    await admin
        .from('subscriptions')
        .update({
            status: 'active',
            current_period_end: newEnd,
        })
        .eq('id', subscriptionId);

    return ok({ paymentId, subscriptionId, newEnd });
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    const secret = process.env.MP_WEBHOOK_SECRET;
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
