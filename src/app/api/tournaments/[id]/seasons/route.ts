import { NextRequest, NextResponse } from 'next/server';
import {
    getApiErrorMessage,
    getApiErrorStatus,
} from '@/lib/auth/apiAdmin';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import {
    copyTournamentSeason,
    createTournamentSeason,
    listTournamentSeasons,
} from '@/lib/services/tournamentSeasonService';

export const dynamic = 'force-dynamic';

function jsonError(error: unknown, fallback = 500) {
    return NextResponse.json(
        { ok: false, error: getApiErrorMessage(error) },
        { status: getApiErrorStatus(error, fallback) },
    );
}

function cleanText(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    return text || null;
}

function readSeasonCode(body: Record<string, unknown>) {
    return (
        cleanText(body.seasonCode) ||
        cleanText(body.season_code) ||
        cleanText(body.period) ||
        cleanText(body.year) ||
        ''
    );
}

function hasExplicitSeasonCode(body: Record<string, unknown>) {
    return Boolean(cleanText(body.seasonCode) || cleanText(body.season_code));
}

function normalizeForCompare(value: unknown) {
    return cleanText(value)?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '';
}

function slugifyCode(value: string) {
    return normalizeForCompare(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

async function resolveSeasonCode(
    db: ReturnType<typeof createAdminClient>,
    tournamentId: string,
    body: Record<string, unknown>,
) {
    const requestedCode = readSeasonCode(body);
    if (!requestedCode || hasExplicitSeasonCode(body)) return requestedCode;

    const requestedName = cleanText(body.name) || cleanText(body.displayName);
    const normalizedName = normalizeForCompare(requestedName);
    const { data, error } = await db
        .from('tournament_seasons')
        .select('season_code, name, display_name')
        .eq('tournament_id', tournamentId);
    if (error) throw new Error(error.message || 'No se pudieron validar las temporadas existentes.');

    const existing = (data ?? []).filter((season: any) =>
        season.season_code === requestedCode || String(season.season_code || '').startsWith(`${requestedCode}-`)
    );
    if (existing.length === 0) return requestedCode;

    const sameName = existing.some((season: any) => {
        const name = normalizeForCompare(season.name) || normalizeForCompare(season.display_name);
        return normalizedName && name === normalizedName;
    });
    if (sameName) {
        throw new Error('Ya existe una temporada con ese anio o periodo y ese nombre para este torneo.');
    }

    const suffix = requestedName ? slugifyCode(requestedName) : '';
    if (!suffix) return requestedCode;

    const usedCodes = new Set(existing.map((season: any) => String(season.season_code || '')));
    let nextCode = `${requestedCode}-${suffix}`;
    let index = 2;
    while (usedCodes.has(nextCode)) {
        nextCode = `${requestedCode}-${suffix}-${index}`;
        index += 1;
    }
    return nextCode;
}

function readStatus(body: Record<string, unknown>, fallback: string) {
    const explicit = cleanText(body.status);
    if (explicit) return explicit;
    return body.markAsActive === true || body.isActive === true ? 'active' : fallback;
}

function readCopyBoolean(
    body: Record<string, unknown>,
    preferredKey: string,
    legacyKey: string,
    fallback: boolean,
) {
    if (typeof body[preferredKey] === 'boolean') return body[preferredKey] as boolean;
    if (typeof body[legacyKey] === 'boolean') return body[legacyKey] as boolean;
    return fallback;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: tournamentId } = await params;
        const db = await getReadClient();
        const seasons = await listTournamentSeasons(db, tournamentId);
        return NextResponse.json({ ok: true, seasons });
    } catch (error) {
        return jsonError(error);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: tournamentId } = await params;
        const { actorUserId } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json().catch(() => ({}));
        const db = createAdminClient();
        const action = String(body?.action || (body?.sourceSeasonId ? 'copy' : 'create'));
        const seasonCode = await resolveSeasonCode(db, tournamentId, body);

        if (action === 'copy') {
            const result = await copyTournamentSeason(db, tournamentId, {
                sourceSeasonId: String(body?.sourceSeasonId || ''),
                seasonCode,
                name: body?.name ?? null,
                displayName: body?.displayName ?? null,
                status: readStatus(body, 'draft'),
                startDate: body?.startDate ?? null,
                endDate: body?.endDate ?? null,
                ruleset: body?.ruleset ?? null,
                settings: body?.settings ?? null,
                copyConfiguration: readCopyBoolean(body, 'copyConfig', 'copyConfiguration', true),
                copyEntries: readCopyBoolean(body, 'copyParticipants', 'copyEntries', true),
                copyRosters: body?.copyRosters === true,
                copyRosterMemberships: body?.copyRosterMemberships === true,
            }, actorUserId);

            return NextResponse.json({ ok: true, ...result });
        }

        if (action === 'create') {
            const season = await createTournamentSeason(db, tournamentId, {
                seasonCode,
                name: body?.name ?? null,
                displayName: body?.displayName ?? null,
                status: readStatus(body, 'draft'),
                startDate: body?.startDate ?? null,
                endDate: body?.endDate ?? null,
                format: body?.format ?? null,
                ruleset: body?.ruleset ?? null,
                settings: body?.settings ?? null,
            }, actorUserId);

            return NextResponse.json({ ok: true, season });
        }

        return NextResponse.json({ ok: false, error: 'Accion invalida.' }, { status: 400 });
    } catch (error) {
        return tournamentApiErrorResponse(error);
    }
}
