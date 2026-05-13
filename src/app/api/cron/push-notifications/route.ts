/**
 * /api/cron/push-notifications
 *
 * Sends system-level Web Push notifications for unread in-app notifications.
 * Called by Vercel Cron, usually every minute.
 *
 * Authentication: Bearer {CRON_SECRET} header.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    isSystemPushConfigured,
    sendSystemPush,
    type StoredPushSubscription,
} from '@/lib/notifications/systemPush';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_NOTIFICATIONS_PER_RUN = 50;

type PendingNotification = {
    id: string;
    user_id: string;
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

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[push-notifications] CRON_SECRET not set; allowing request in development mode');
            return true;
        }
        return false;
    }

    return request.headers.get('authorization') === `Bearer ${secret}`;
}

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
    subscription: StoredPushSubscription,
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

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
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
    const pendingResult = await db
        .from<PendingNotification[]>('user_notifications')
        .select('id, user_id')
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
        });
    }

    if (pendingResult.error) {
        return NextResponse.json({ error: pendingResult.error.message }, { status: 500 });
    }

    const pending = pendingResult.data ?? [];
    if (pending.length === 0) {
        return NextResponse.json({
            ok: true,
            configured: true,
            schemaReady: true,
            sent: 0,
            processed: 0,
        });
    }

    const userIds = Array.from(new Set(pending.map((notification) => notification.user_id)));
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
            processed: 0,
        });
    }

    if (subscriptionsResult.error) {
        return NextResponse.json({ error: subscriptionsResult.error.message }, { status: 500 });
    }

    const subscriptionsByUser = new Map<string, StoredPushSubscription[]>();
    (subscriptionsResult.data ?? []).forEach((subscription) => {
        const entries = subscriptionsByUser.get(subscription.user_id) ?? [];
        entries.push(subscription);
        subscriptionsByUser.set(subscription.user_id, entries);
    });

    let sent = 0;
    let failed = 0;
    let processed = 0;

    for (const notification of pending) {
        const subscriptions = subscriptionsByUser.get(notification.user_id) ?? [];
        if (subscriptions.length === 0) {
            await markNotificationHandled(db, notification.id, 'no_active_push_subscription');
            processed += 1;
            continue;
        }

        const results = await Promise.all(subscriptions.map(async (subscription) => {
            const result = await sendSystemPush(subscription);
            if (result.expired) {
                await disableExpiredSubscription(db, subscription, result.error || `expired:${result.status}`);
            }
            return result;
        }));

        const successes = results.filter((result) => result.ok).length;
        const errors = results.filter((result) => !result.ok);
        sent += successes;
        failed += errors.length;

        await markNotificationHandled(
            db,
            notification.id,
            successes > 0 ? null : (errors[0]?.error || 'push_send_failed'),
        );
        processed += 1;
    }

    return NextResponse.json({
        ok: true,
        configured: true,
        schemaReady: true,
        processed,
        sent,
        failed,
    });
}
