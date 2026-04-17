import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
    getExternalTeamLogoOverride,
    mergeExternalTeamLogoOverrideRecords,
    normalizeExternalTeamLogoOverrideRecord,
    upsertExternalTeamLogoOverride,
} from '@/lib/server/externalTeamLogoOverrides';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

type ExternalTeamRow = {
    id: string;
    source?: string | null;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    country?: string | null;
    team_url?: string | null;
    updated_at?: string | null;
};

type ExternalTeamsQueryResult = {
    data: ExternalTeamRow | null;
    error: {
        message?: string | null;
        details?: string | null;
        hint?: string | null;
        code?: string | null;
    } | null;
};

const SELECT_COLUMNS = 'id, source, name, short_name, logo_url, sport, country, team_url, updated_at';
const SELECT_COLUMNS_WITHOUT_TEAM_URL = 'id, source, name, short_name, logo_url, sport, country, updated_at';

async function selectExternalTeam(
    supabase: Awaited<ReturnType<typeof createClient>>,
    id: string,
): Promise<ExternalTeamsQueryResult> {
    let result = await (supabase as any)
        .from('external_teams')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .maybeSingle();

    if (result.error && isMissingColumnError(result.error, 'team_url')) {
        result = await (supabase as any)
            .from('external_teams')
            .select(SELECT_COLUMNS_WITHOUT_TEAM_URL)
            .eq('id', id)
            .maybeSingle();
    }

    return result;
}

async function upsertExternalTeam(
    supabase: Awaited<ReturnType<typeof createClient>>,
    payload: ExternalTeamRow,
): Promise<ExternalTeamsQueryResult> {
    let result = await (supabase as any)
        .from('external_teams')
        .upsert(payload, { onConflict: 'id' })
        .select(SELECT_COLUMNS)
        .single();

    if (result.error && isMissingColumnError(result.error, 'team_url')) {
        const { team_url: _ignoredTeamUrl, ...legacyPayload } = payload;
        result = await (supabase as any)
            .from('external_teams')
            .upsert(legacyPayload, { onConflict: 'id' })
            .select(SELECT_COLUMNS_WITHOUT_TEAM_URL)
            .single();
    }

    return result;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireSuperAdmin();
        const { id } = await params;
        const supabase = await createClient();
        const { data, error } = await selectExternalTeam(supabase, id);

        if (error && !isMissingTableError(error, 'external_teams')) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const storedOverride = await getExternalTeamLogoOverride(id);
        const merged = mergeExternalTeamLogoOverrideRecords(
            normalizeExternalTeamLogoOverrideRecord(data),
            storedOverride,
        );
        return NextResponse.json({ ok: true, data: merged });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 401 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireSuperAdmin();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const supabase = await createClient();

        const payload = {
            id,
            source: normalizeString(body?.source) || 'flashscore',
            name: normalizeString(body?.name) || `External team ${id}`,
            short_name: normalizeString(body?.short_name),
            logo_url: normalizeString(body?.logo_url),
            sport: normalizeString(body?.sport) || 'rugby',
            country: normalizeString(body?.country),
            team_url: normalizeString(body?.team_url),
        };

        const { data, error } = await upsertExternalTeam(supabase, payload);

        if (error) {
            if (isMissingTableError(error, 'external_teams')) {
                try {
                    const storedOverride = await upsertExternalTeamLogoOverride(payload);
                    return NextResponse.json({ ok: true, data: storedOverride, storage: 'file' });
                } catch (fallbackError) {
                    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown storage error';
                    return NextResponse.json(
                        {
                            ok: false,
                            error: `No se pudo guardar el logo externo. Falta aplicar la migracion de Supabase para external_teams y el fallback a archivo fallo: ${fallbackMessage}`,
                        },
                        { status: 500 },
                    );
                }
            }
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        let persistedFileRecord = null;
        try {
            persistedFileRecord = await upsertExternalTeamLogoOverride(payload);
        } catch (fileError) {
            console.warn('[external-teams][PATCH] file cache persistence skipped', {
                id,
                error: fileError instanceof Error ? fileError.message : 'Unknown storage error',
            });
        }
        const merged = mergeExternalTeamLogoOverrideRecords(
            normalizeExternalTeamLogoOverrideRecord(data),
            persistedFileRecord,
        );

        return NextResponse.json({ ok: true, data: merged, storage: 'database' });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 401 });
    }
}
