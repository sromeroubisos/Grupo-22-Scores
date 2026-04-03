import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
    getExternalTournamentStandingsOverride,
    normalizeExternalTournamentStandingsOverrideRecord,
    upsertExternalTournamentStandingsOverride,
} from '@/lib/server/externalTournamentStandingsOverrides';

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
        const data = await getExternalTournamentStandingsOverride(id);
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

        const payload = normalizeExternalTournamentStandingsOverrideRecord({
            id,
            source: normalizeString(body?.source) || 'external-api',
            groups: Array.isArray(body?.groups) ? body.groups : [],
            assignments: Array.isArray(body?.assignments) ? body.assignments : [],
            labels: Array.isArray(body?.labels) ? body.labels : [],
        });

        const { error } = await client
            .from('external_tournament_standings_overrides')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            if (error.message?.includes('Could not find the table')) {
                try {
                    const fileData = await upsertExternalTournamentStandingsOverride(payload);
                    return NextResponse.json({ ok: true, data: fileData, storage: 'file' });
                } catch (fallbackError) {
                    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown storage error';
                    return NextResponse.json(
                        {
                            ok: false,
                            error: `No se pudo guardar la configuracion editorial de standings. Falta aplicar la migracion de Supabase para external_tournament_standings_overrides y el fallback a archivo fallo: ${fallbackMessage}`,
                        },
                        { status: 500 },
                    );
                }
            }

            const dbMessage = formatDbError(error) || 'No se pudo guardar la configuracion editorial de standings.';
            console.error('[external-tournaments-standings][PATCH] database upsert failed', {
                id,
                error,
                groups: payload.groups?.length ?? 0,
                assignments: payload.assignments?.length ?? 0,
                labels: payload.labels?.length ?? 0,
            });
            return NextResponse.json({ ok: false, error: dbMessage }, { status: 500 });
        }

        return NextResponse.json({ ok: true, data: payload, storage: 'database' });
    } catch (err) {
        console.error('[external-tournaments-standings][PATCH] unexpected error', err);
        return buildErrorResponse(err, 'No se pudo guardar la configuracion editorial de standings.');
    }
}
