import { NextRequest, NextResponse } from 'next/server';
import {
    getApiErrorMessage,
    getApiErrorStatus,
    requireAdminApiUser,
} from '@/lib/auth/apiAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import {
    addPlayerToSeasonRoster,
    createSeasonRoster,
    ensureRostersForSeasonEntries,
    listSeasonRosters,
} from '@/lib/services/tournamentSeasonService';

export const dynamic = 'force-dynamic';

function jsonError(error: unknown, fallback = 500) {
    return NextResponse.json(
        { ok: false, error: getApiErrorMessage(error) },
        { status: getApiErrorStatus(error, fallback) },
    );
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ seasonId: string }> },
) {
    try {
        const { seasonId } = await params;
        const includeMemberships = request.nextUrl.searchParams.get('includeMemberships') === 'true';
        const db = await getReadClient();
        const rosters = await listSeasonRosters(db, seasonId, includeMemberships);
        return NextResponse.json({ ok: true, rosters });
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
        const action = String(body?.action || 'createRoster');

        if (action === 'ensureFromEntries') {
            const rosters = await ensureRostersForSeasonEntries(db, seasonId);
            return NextResponse.json({ ok: true, rosters });
        }

        if (action === 'addPlayer') {
            const rosterId = String(body?.rosterId || '');
            if (!rosterId) {
                return NextResponse.json({ ok: false, error: 'rosterId es requerido.' }, { status: 400 });
            }

            const result = await addPlayerToSeasonRoster(db, rosterId, {
                playerId: body?.playerId ?? null,
                firstName: body?.firstName ?? body?.first_name ?? null,
                lastName: body?.lastName ?? body?.last_name ?? null,
                joinedAt: body?.joinedAt ?? body?.joined_at ?? null,
                leftAt: body?.leftAt ?? body?.left_at ?? null,
                status: body?.status ?? 'active',
                jerseyNumber: typeof body?.jerseyNumber === 'number'
                    ? body.jerseyNumber
                    : typeof body?.jersey_number === 'number'
                        ? body.jersey_number
                        : null,
                position: body?.position ?? null,
                role: body?.role ?? null,
                notes: body?.notes ?? null,
                eligibility: body?.eligibility ?? null,
            });

            return NextResponse.json({ ok: true, ...result });
        }

        if (action === 'createRoster') {
            const roster = await createSeasonRoster(db, seasonId, {
                clubId: String(body?.clubId || ''),
                teamId: body?.teamId ?? null,
                teamSeasonEntryId: body?.teamSeasonEntryId ?? body?.entryId ?? null,
                name: body?.name ?? null,
                rosterType: body?.rosterType ?? body?.roster_type ?? null,
                status: body?.status ?? 'draft',
                settings: body?.settings ?? null,
            });

            return NextResponse.json({ ok: true, roster });
        }

        return NextResponse.json({ ok: false, error: 'Accion invalida.' }, { status: 400 });
    } catch (error) {
        return jsonError(error);
    }
}
