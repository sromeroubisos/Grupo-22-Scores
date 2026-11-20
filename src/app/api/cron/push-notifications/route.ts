/**
 * /api/cron/push-notifications
 *
 * Avisos del sistema (Web Push) al celular. Cada minuto hace dos cosas:
 *
 *  1. Pasada EN VIVO: un solo aviso por partido que se reemplaza con el marcador
 *     (ver lib/notifications/liveMatchPush.ts). Es lo que se parece a una app.
 *  2. Avisos sueltos: lo que quedo sin leer y sin enviar en `user_notifications`
 *     (fútbol externo, etc.). Los de partidos propios los cubre el aviso en vivo.
 *
 * Authentication: Bearer {CRON_SECRET} header.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    isSystemPushConfigured,
    sendSystemPush,
    type StoredPushSubscription,
} from '@/lib/notifications/systemPush';
import { runLivePushPass, type LivePassStats, type LiveSub } from '@/lib/notifications/liveMatchPush';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_NOTIFICATIONS_PER_RUN = 200;
const SEND_CONCURRENCY = 8;

/** Un aviso con mas de esto ya no es una novedad: se archiva sin mandarlo. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
/** Un fallo transitorio se reintenta cada minuto hasta este limite; despues se descarta. */
const RETRY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Los avisos de partidos propios (gol, try, final) los cubre el aviso EN VIVO,
 * que es uno solo por partido y se reemplaza. Mandarlos ademas como push suelto
 * era la rafaga de 16 avisos iguales. Siguen en la campanita de la app.
 */
const COVERED_BY_LIVE_TYPES = new Set(['team_event', 'match_finished']);

type PendingNotification = {
    id: string;
    user_id: string;
    type: string | null;
    created_at: string;
    title: string;
    body: string;
    entity_type: string | null;
    entity_id: string | null;
    match_id: string | null;
};

type SupabaseResult<T> = {
    data: T | null;
    error: PostgrestError | null;
};

type SupabaseQuery<T> = PromiseLike<SupabaseResult<T>> & {
    select: (columns?: string) => SupabaseQuery<T>;
    eq: (column: string, value: unknown) => SupabaseQuery<T>;
    in: (column: string, values: unknown[]) => SupabaseQuery<T>;
    is: (column: string, value: null) => SupabaseQuery<T>;
    order: (column: string, options?: { ascending?: boolean }) => SupabaseQuery<T>;
    limit: (count: number) => SupabaseQuery<T>;
    update: (values: Record<string, unknown>) => SupabaseQuery<T>;
};

type LooseSupabaseClient = {
    from: <T = unknown>(table: string) => SupabaseQuery<T>;
};


function isPushSchemaMissing(error: PostgrestError | null | undefined) {
    if (!error) return false;
    const haystack = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    return (
        error.code === '42P01' ||
        error.code === '42703' ||
        error.code === 'PGRST205' ||
        haystack.includes('user_push_subscriptions') ||
        haystack.includes('system_notified_at') ||
        haystack.includes('schema cache')
    );
}

async function markNotificationHandled(
    db: LooseSupabaseClient,
    notificationId: string,
    error: string | null,
) {
    await db
        .from('user_notifications')
        .update({
            system_notified_at: new Date().toISOString(),
            system_push_error: error,
        })
        .eq('id', notificationId);
}

async function disableExpiredSubscription(
    db: LooseSupabaseClient,
    subscription: { id: string },
    reason: string,
) {
    await db
        .from('user_push_subscriptions')
        .update({
            enabled: false,
            failed_at: new Date().toISOString(),
            failure_reason: reason.slice(0, 500),
            updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
    let index = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
        while (index < items.length) {
            const current = items[index];
            index += 1;
            await worker(current);
        }
    });
    await Promise.all(runners);
}

export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'push-notifications'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isSystemPushConfigured()) {
        return NextResponse.json({
            ok: false,
            configured: false,
            message: 'WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY are required.',
        }, { status: 200 });
    }

    const db = createAdminClient() as unknown as LooseSupabaseClient;

    // 1) Avisos en vivo. Si falla (esquema sin migrar, red), los sueltos siguen.
    let live: LivePassStats | { error: string } | null = null;
    try {
        live = await runLivePushPass({
            db,
            send: async (sub: LiveSub, payload) => {
                const result = await sendSystemPush(sub, payload);
                return { ok: result.ok, expired: result.expired, error: result.error };
            },
            onExpired: (sub, reason) => disableExpiredSubscription(db, sub, reason),
        });
    } catch (error) {
        live = { error: error instanceof Error ? error.message : 'live_pass_failed' };
        console.error('[push-notifications] pasada en vivo fallo:', error);
    }

    // 2) Avisos sueltos.
    const pendingResult = await db
        .from<PendingNotification[]>('user_notifications')
        // El push viaja con titulo, cuerpo y destino adentro (cifrado): el
        // service worker lo muestra sin volver a pedirle nada al servidor, que
        // con la app cerrada horas es lo que fallaba (sesion vencida).
        .select('id, user_id, type, created_at, title, body, entity_type, entity_id, match_id')
        .is('read_at', null)
        .is('system_notified_at', null)
        .order('created_at', { ascending: true })
        .limit(MAX_NOTIFICATIONS_PER_RUN);

    if (isPushSchemaMissing(pendingResult.error)) {
        return NextResponse.json({
            ok: true,
            schemaReady: false,
            sent: 0,
            processed: 0,
            live,
        });
    }

    if (pendingResult.error) {
        return NextResponse.json({ error: pendingResult.error.message, live }, { status: 500 });
    }

    const pending = pendingResult.data ?? [];
    if (pending.length === 0) {
        return NextResponse.json({
            ok: true,
            configured: true,
            schemaReady: true,
            sent: 0,
            processed: 0,
            live,
        });
    }

    const now = Date.now();
    let processed = 0;
    let stale = 0;
    let covered = 0;

    // Lo viejo y lo que ya cubre el aviso en vivo se archiva sin mandar nada.
    const toSend: PendingNotification[] = [];
    for (const notification of pending) {
        const age = now - Date.parse(notification.created_at);
        if (Number.isFinite(age) && age > STALE_AFTER_MS) {
            await markNotificationHandled(db, notification.id, 'stale_not_sent');
            stale += 1;
            processed += 1;
            continue;
        }

        if (COVERED_BY_LIVE_TYPES.has(notification.type ?? '') && notification.match_id) {
            await markNotificationHandled(db, notification.id, 'covered_by_live_push');
            covered += 1;
            processed += 1;
            continue;
        }

        toSend.push(notification);
    }

    if (toSend.length === 0) {
        return NextResponse.json({
            ok: true, configured: true, schemaReady: true, processed, sent: 0, stale, covered, live,
        });
    }

    const userIds = Array.from(new Set(toSend.map((notification) => notification.user_id)));
    const subscriptionsResult = await db
        .from<StoredPushSubscription[]>('user_push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', userIds)
        .eq('enabled', true);

    if (isPushSchemaMissing(subscriptionsResult.error)) {
        return NextResponse.json({
            ok: true,
            schemaReady: false,
            sent: 0,
            processed,
            live,
        });
    }

    if (subscriptionsResult.error) {
        return NextResponse.json({ error: subscriptionsResult.error.message, live }, { status: 500 });
    }

    const subscriptionsByUser = new Map<string, StoredPushSubscription[]>();
    (subscriptionsResult.data ?? []).forEach((subscription) => {
        const entries = subscriptionsByUser.get(subscription.user_id) ?? [];
        entries.push(subscription);
        subscriptionsByUser.set(subscription.user_id, entries);
    });

    let sent = 0;
    let failed = 0;
    let retrying = 0;

    await pool(toSend, SEND_CONCURRENCY, async (notification) => {
        const subscriptions = subscriptionsByUser.get(notification.user_id) ?? [];
        if (subscriptions.length === 0) {
            await markNotificationHandled(db, notification.id, 'no_active_push_subscription');
            processed += 1;
            return;
        }

        // Partido externo (sin fila propia): el mismo tag para todos los avisos de
        // ese partido, asi el marcador nuevo REEMPLAZA al anterior en la bandeja.
        const isMatch = notification.entity_type === 'match' && notification.entity_id;
        const payload = {
            id: notification.id,
            title: notification.title,
            body: notification.body,
            entity_type: notification.entity_type,
            entity_id: notification.entity_id,
            match_id: notification.match_id,
            ...(isMatch
                ? {
                    tag: `g22-match-${notification.entity_id}`,
                    renotify: true,
                    url: `/matches/${notification.entity_id}`,
                }
                : {}),
        };

        const results = await Promise.all(subscriptions.map(async (subscription) => {
            const result = await sendSystemPush(subscription, payload);
            if (result.expired) {
                await disableExpiredSubscription(db, subscription, result.error || `expired:${result.status}`);
            }
            return result;
        }));

        const successes = results.filter((result) => result.ok).length;
        const errors = results.filter((result) => !result.ok);
        sent += successes;
        failed += errors.length;

        if (successes > 0) {
            await markNotificationHandled(db, notification.id, null);
            processed += 1;
            return;
        }

        // Todos fallaron. Si fue una suscripcion vencida no hay nada que reintentar;
        // si fue un 5xx, un 429 o un timeout del push service, el aviso queda
        // pendiente y se reintenta en el proximo minuto (antes se perdia).
        const transient = errors.some((result) => !result.expired);
        const age = now - Date.parse(notification.created_at);
        if (transient && age < RETRY_WINDOW_MS) {
            retrying += 1;
            return;
        }

        await markNotificationHandled(db, notification.id, errors[0]?.error || 'push_send_failed');
        processed += 1;
    });

    return NextResponse.json({
        ok: true,
        configured: true,
        schemaReady: true,
        processed,
        sent,
        failed,
        retrying,
        stale,
        covered,
        live,
    });
}
