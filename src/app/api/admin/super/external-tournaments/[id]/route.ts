import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
    getExternalTournamentOverride,
    normalizeExternalTournamentOverrideRecord,
    upsertExternalTournamentOverride,
} from '@/lib/server/externalTournamentOverrides';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

type MinimalUpsertClient = {
    from: (table: string) => {
        upsert: (
            values: Record<string, unknown>,
            options: { onConflict: string },
        ) => Promise<{ error: { message?: string | null; details?: string | null; hint?: string | null; code?: string | null } | null }>;
    };
};

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
    return null;
}

async function requireExactSuperAdmin() {
    const user = await getCurrentUser();

    if (!user) {
        throw new Error('Unauthorized');
    }

    if (user.role !== 'super_admin') {
        throw new Error('Forbidden: Super admin access required');
    }

    return user;
}

function buildErrorResponse(err: unknown, fallback = 'Internal Server Error') {
    const message = err instanceof Error ? err.message : fallback;
    const status =
        message === 'Unauthorized'
            ? 401
            : message.includes('Forbidden')
                ? 403
                : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
}

function formatDbError(error: { message?: string | null; details?: string | null; hint?: string | null; code?: string | null } | null | undefined) {
    if (!error) return null;

    const parts = [
        normalizeString(error.message),
        normalizeString(error.details),
        normalizeString(error.hint),
        normalizeString(error.code),
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' | ') : 'Database write failed';
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireExactSuperAdmin();
        const { id } = await params;
        const data = await getExternalTournamentOverride(id);
        return NextResponse.json({ ok: true, data });
    } catch (err) {
        return buildErrorResponse(err, 'Unauthorized');
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireExactSuperAdmin();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient()
            : await createClient();
        const client = supabase as unknown as MinimalUpsertClient;

        const payload = normalizeExternalTournamentOverrideRecord({
            id,
            source: normalizeString(body?.source) || 'flashscore',
            name: normalizeString(body?.display_name) || normalizeString(body?.name) || `External tournament ${id}`,
            display_name: normalizeString(body?.display_name) || normalizeString(body?.name),
            logo_url: normalizeString(body?.logo_url),
            sport: normalizeString(body?.sport) || 'rugby',
            country: normalizeString(body?.country),
            country_id: normalizeString(body?.country_id),
            url: normalizeString(body?.url),
            priority: normalizeInteger(body?.priority),
        });

        const { error } = await client
            .from('external_tournaments')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            if (error.message?.includes('Could not find the table')) {
                try {
                    const fileData = await upsertExternalTournamentOverride(payload);
                    return NextResponse.json({ ok: true, data: fileData, storage: 'file' });
                } catch (fallbackError) {
                    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown storage error';
                    return NextResponse.json(
                        {
                            ok: false,
                            error: `No se pudo guardar el override del torneo. Falta aplicar la migracion de Supabase para external_tournaments y el fallback a archivo fallo: ${fallbackMessage}`,
                        },
                        { status: 500 },
                    );
                }
            }

            if (isMissingColumnError(error, 'priority')) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "No se pudo guardar la prioridad. Aplica la migracion de Supabase para agregar `external_tournaments.priority` y recarga el schema cache.",
                    },
                    { status: 500 },
                );
            }

            const dbMessage = formatDbError(error) || 'No se pudo guardar el override del torneo.';
            console.error('[external-tournaments][PATCH] database upsert failed', {
                id,
                error,
            });
            return NextResponse.json({ ok: false, error: dbMessage }, { status: 500 });
        }

        return NextResponse.json({ ok: true, data: payload, storage: 'database' });
    } catch (err) {
        console.error('[external-tournaments][PATCH] unexpected error', err);
        return buildErrorResponse(err, 'No se pudo guardar el override del torneo.');
    }
}
