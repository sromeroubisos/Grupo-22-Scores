import { NextRequest, NextResponse } from 'next/server';
import {
    getApiErrorMessage,
    getApiErrorStatus,
    requireAdminApiUser,
} from '@/lib/auth/apiAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import {
    createSeasonEntry,
    ensureRostersForSeasonEntries,
} from '@/lib/services/tournamentSeasonService';

export const dynamic = 'force-dynamic';

function jsonError(error: unknown, fallback = 500) {
    return NextResponse.json(
        { ok: false, error: getApiErrorMessage(error) },
        { status: getApiErrorStatus(error, fallback) },
    );
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ seasonId: string }> },
) {
    try {
        const { seasonId } = await params;
        const db = await getReadClient();
        const { data, error } = await db
            .from('team_season_entries')
            .select(`
                *,
                club:clubs(id, name, short_name, logo_url),
                team:club_teams(id, name, category, gender, sport),
                rosters:season_rosters(id, name, status, roster_type)
            `)
            .eq('season_id', seasonId)
            .order('seed', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });

        if (error) throw new Error(error.message || 'No se pudieron cargar los participantes.');
        return NextResponse.json({ ok: true, entries: data ?? [] });
    } catch (error) {
        return jsonError(error);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ seasonId: string }> },
) {
    try {
        await requireAdminApiUser();
        const { seasonId } = await params;
        const body = await request.json().catch(() => ({}));
        const db = createAdminClient();
        const action = String(body?.action || 'createEntry');

        if (action === 'ensureRosters') {
            const rosters = await ensureRostersForSeasonEntries(db, seasonId);
            return NextResponse.json({ ok: true, rosters });
        }

        if (action === 'createEntry') {
            const entry = await createSeasonEntry(db, seasonId, {
                clubId: String(body?.clubId || ''),
                teamId: body?.teamId ?? null,
                groupId: body?.groupId ?? null,
                zone: body?.zone ?? null,
                category: body?.category ?? null,
                status: body?.status ?? 'active',
                seed: typeof body?.seed === 'number' ? body.seed : null,
                notes: body?.notes ?? null,
                settings: body?.settings ?? null,
                createRoster: body?.createRoster !== false,
            });

            return NextResponse.json({ ok: true, entry });
        }

        return NextResponse.json({ ok: false, error: 'Accion invalida.' }, { status: 400 });
    } catch (error) {
        return jsonError(error);
    }
}
