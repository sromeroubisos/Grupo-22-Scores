import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelPreapproval } from '@/lib/billing/mercadopago';

function err(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
    let body: { subscriptionId?: string };
    try {
        body = await request.json();
    } catch {
        return err('Body inválido.', 400);
    }

    const subscriptionId = body.subscriptionId;
    if (!subscriptionId || typeof subscriptionId !== 'string') {
        return err('subscriptionId requerido.', 400);
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return err('No autenticado.', 401);
    }

    const admin = createAdminClient();
    const { data: sub, error: fetchError } = await admin
        .from('subscriptions')
        .select('id, user_id, status, provider, provider_subscription_id')
        .eq('id', subscriptionId)
        .maybeSingle();

    if (fetchError || !sub) {
        return err('Suscripción no encontrada.', 404);
    }

    if (sub.user_id !== user.id) {
        return err('No autorizado.', 403);
    }

    if (sub.status === 'cancelled') {
        return NextResponse.json({ ok: true, alreadyCancelled: true });
    }

    if (sub.provider === 'mercadopago' && sub.provider_subscription_id) {
        try {
            await cancelPreapproval(sub.provider_subscription_id);
        } catch (e) {
            // No detenemos la cancelación local: marcamos cancelled igual y logueamos.
            console.error('[billing/cancel] cancelPreapproval falló', e);
        }
    }

    const { error: updateError } = await admin
        .from('subscriptions')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);

    if (updateError) {
        return err(`No pudimos cancelar localmente: ${updateError.message}`, 500);
    }

    return NextResponse.json({ ok: true });
}
