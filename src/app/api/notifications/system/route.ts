import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAllowedPushEndpoint } from '@/lib/notifications/pushEndpoint';
import { getPublicVapidKey, isSystemPushConfigured } from '@/lib/notifications/systemPush';

export const dynamic = 'force-dynamic';

type PushSubscriptionPayload = {
    endpoint?: unknown;
    keys?: {
        p256dh?: unknown;
        auth?: unknown;
    };
};

type LooseSupabaseQuery<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }> & {
    select: (columns?: string) => LooseSupabaseQuery<T>;
    eq: (column: string, value: unknown) => LooseSupabaseQuery<T>;
    maybeSingle: () => LooseSupabaseQuery<T>;
    limit: (count: number) => LooseSupabaseQuery<T>;
    upsert: (values: Record<string, unknown>, options?: { onConflict?: string }) => LooseSupabaseQuery<T>;
    insert: (values: Record<string, unknown>) => LooseSupabaseQuery<T>;
    update: (values: Record<string, unknown>) => LooseSupabaseQuery<T>;
    in: (column: string, values: unknown[]) => LooseSupabaseQuery<T>;
    order: (column: string, options?: { ascending?: boolean }) => LooseSupabaseQuery<T>;
    delete: () => LooseSupabaseQuery<T>;
};

const MAX_ACTIVE_SUBSCRIPTIONS_PER_USER = 10;

type LooseSupabaseClient = {
    from: <T = unknown>(table: string) => LooseSupabaseQuery<T>;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return NextResponse.json(body, { ...init, headers });
}

function isPushSchemaMissing(error: PostgrestError | null | undefined) {
    if (!error) return false;
    const haystack = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    return (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        haystack.includes('user_push_subscriptions') ||
        haystack.includes('schema cache')
    );
}

function parseSubscription(value: unknown) {
    const payload = value as PushSubscriptionPayload | null;
    const endpoint = typeof payload?.endpoint === 'string' ? payload.endpoint.trim() : '';
    const p256dh = typeof payload?.keys?.p256dh === 'string' ? payload.keys.p256dh.trim() : '';
    const auth = typeof payload?.keys?.auth === 'string' ? payload.keys.auth.trim() : '';

    if (!endpoint || !p256dh || !auth) {
        return null;
    }

    return { endpoint, p256dh, auth };
}

async function getAuthenticatedUserOrNull(supabase: Awaited<ReturnType<typeof createClient>>) {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;
        return user;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const user = await getAuthenticatedUserOrNull(supabase);

    if (!user) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }

    const endpoint = request.nextUrl.searchParams.get('endpoint')?.trim();
    const basePayload = {
        publicKey: getPublicVapidKey(),
        configured: isSystemPushConfigured(),
        schemaReady: true,
        subscribed: false,
    };

    const db = supabase as unknown as LooseSupabaseClient;

    // El sondeo del esquema corre SIEMPRE, haya o no una suscripcion en este
    // dispositivo. Si solo se consultara con endpoint, el primer visitante veria
    // schemaReady: true con la tabla ausente, concederia el permiso del navegador
    // y recien ahi el POST le fallaria, dejandolo en "no se pudo revisar".
    if (!endpoint) {
        const probe = await db
            .from<{ id: string }[]>('user_push_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

        return jsonNoStore({
            ...basePayload,
            schemaReady: !isPushSchemaMissing(probe.error),
        });
    }

    const result = await db
        .from<{ id: string; enabled: boolean }>('user_push_subscriptions')
        .select('id, enabled')
        .eq('user_id', user.id)
        .eq('endpoint', endpoint)
        .maybeSingle();

    if (isPushSchemaMissing(result.error)) {
        return jsonNoStore({
            ...basePayload,
            schemaReady: false,
        });
    }

    if (result.error) {
        return jsonNoStore({ error: result.error.message || 'No se pudo consultar la suscripcion.' }, { status: 500 });
    }

    return jsonNoStore({
        ...basePayload,
        subscribed: result.data?.enabled === true,
    });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const user = await getAuthenticatedUserOrNull(supabase);

    if (!user) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const subscription = parseSubscription(body.subscription);

    if (!subscription) {
        return jsonNoStore({ error: 'Suscripcion Web Push invalida.' }, { status: 400 });
    }

    // El servidor le va a hacer un POST a este endpoint desde adentro de Vercel:
    // solo pasan los push services de los navegadores (ver pushEndpoint.ts).
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
        return jsonNoStore({ error: 'Suscripcion Web Push invalida.' }, { status: 400 });
    }

    const db = supabase as unknown as LooseSupabaseClient;
    const now = new Date().toISOString();
    const fields = {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 500) : null,
        platform: typeof body.platform === 'string' ? body.platform.slice(0, 120) : null,
        enabled: true,
        failed_at: null,
        failure_reason: null,
        last_seen_at: now,
        updated_at: now,
    };

    // Antes era un upsert `onConflict: 'endpoint'`: si el endpoint ya era de OTRO
    // usuario, el upsert intentaba reasignarle la fila (lo frenaba solo la RLS, si la
    // migracion esta corrida). Ahora se separa: la fila propia se actualiza filtrando
    // por user_id, y una nueva se inserta; el endpoint ajeno choca con el UNIQUE.
    const existing = await db
        .from<{ id: string }>('user_push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('endpoint', subscription.endpoint)
        .maybeSingle();

    if (isPushSchemaMissing(existing.error)) {
        return jsonNoStore({ ok: false, schemaReady: false }, { status: 409 });
    }
    if (existing.error) {
        return jsonNoStore({ error: existing.error.message || 'No se pudo guardar la suscripcion.' }, { status: 500 });
    }

    let result: { error: PostgrestError | null };
    if (existing.data?.id) {
        result = await db
            .from('user_push_subscriptions')
            .update(fields)
            .eq('id', existing.data.id)
            .eq('user_id', user.id);
    } else {
        // Tope de dispositivos activos: cada aviso sale a todas las suscripciones del
        // usuario, y sin tope una cuenta podria multiplicar los envios del cron. Al
        // llegar al tope se apagan las menos usadas en vez de rechazar el celular nuevo.
        const active = await db
            .from<{ id: string }[]>('user_push_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('enabled', true)
            .order('last_seen_at', { ascending: false })
            .limit(100);

        const staleIds = (active.data || []).slice(MAX_ACTIVE_SUBSCRIPTIONS_PER_USER - 1).map((row) => row.id);
        if (staleIds.length > 0) {
            await db
                .from('user_push_subscriptions')
                .update({ enabled: false, failure_reason: 'replaced_by_newer_device', updated_at: now })
                .eq('user_id', user.id)
                .in('id', staleIds);
        }

        result = await db
            .from('user_push_subscriptions')
            .insert({ ...fields, user_id: user.id, endpoint: subscription.endpoint });
    }

    if (isPushSchemaMissing(result.error)) {
        return jsonNoStore({ ok: false, schemaReady: false }, { status: 409 });
    }

    if (result.error?.code === '23505') {
        // El endpoint ya esta registrado con otra cuenta en este navegador.
        return jsonNoStore({ error: 'Este dispositivo ya recibe avisos de otra cuenta. Desactivalos desde esa cuenta y volve a probar.' }, { status: 409 });
    }

    if (result.error) {
        return jsonNoStore({ error: result.error.message || 'No se pudo guardar la suscripcion.' }, { status: 500 });
    }

    return jsonNoStore({
        ok: true,
        schemaReady: true,
        configured: isSystemPushConfigured(),
    });
}

export async function DELETE(request: NextRequest) {
    const supabase = await createClient();
    const user = await getAuthenticatedUserOrNull(supabase);

    if (!user) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';

    if (!endpoint) {
        return jsonNoStore({ error: 'Endpoint requerido.' }, { status: 400 });
    }

    const db = supabase as unknown as LooseSupabaseClient;
    const result = await db
        .from('user_push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);

    if (isPushSchemaMissing(result.error)) {
        return jsonNoStore({ ok: true, schemaReady: false });
    }

    if (result.error) {
        return jsonNoStore({ error: result.error.message || 'No se pudo desactivar la suscripcion.' }, { status: 500 });
    }

    return jsonNoStore({ ok: true, schemaReady: true });
}
