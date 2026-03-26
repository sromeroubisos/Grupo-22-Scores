import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentStandings } from '@/lib/services/flashscore';
import type { ExternalStandingsRow } from '@/lib/types/flashscore-integration';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const supabase = await createClient();

        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        if (error || !tournament) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const fsConfig = (tournament as any).ruleset?.flashscore;
        if (!fsConfig?.tournament_id || !fsConfig?.tournament_stage_id) {
            return NextResponse.json(
                { error: 'Este torneo no tiene IDs de FlashScore resueltos. Ve a Detalles y usá "Resolver IDs" primero.' },
                { status: 400 }
            );
        }

        const raw = await getTournamentStandings(fsConfig.tournament_id, fsConfig.tournament_stage_id);

        if (!raw) {
            return NextResponse.json(
                { error: 'No se pudo obtener standings de FlashScore. Intentá nuevamente.' },
                { status: 502 }
            );
        }

        // Normalize the standings response
        const standings = normalizeStandings(raw);

        return NextResponse.json({
            standings,
            updated_at: new Date().toISOString(),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

function normalizeStandings(raw: any): ExternalStandingsRow[] {
    const rows: ExternalStandingsRow[] = [];

    // FlashScore standings can be flat or grouped
    const data = raw?.DATA ?? raw?.data ?? raw;

    if (!Array.isArray(data)) return rows;

    for (const item of data) {
        // Could be a group header or a row
        if (!item || typeof item !== 'object') continue;

        // Direct row
        if (item.team?.name || item.team_name) {
            rows.push(normalizeRow(item, rows.length + 1));
            continue;
        }

        // Grouped: item has a `rows` or `standings` array
        const subRows = item.rows ?? item.standings ?? item.DATA;
        if (Array.isArray(subRows)) {
            subRows.forEach((r: any) => {
                rows.push(normalizeRow(r, rows.length + 1));
            });
        }
    }

    return rows;
}

function normalizeRow(item: any, fallbackPosition: number): ExternalStandingsRow {
    const teamLogo =
        item.team?.image_path ??
        item.team?.small_image_path ??
        item.team?.smaill_image_path ??
        item.team?.logo ??
        item.team_logo ??
        item.logo ??
        null;

    return {
        position: item.pos ?? item.position ?? fallbackPosition,
        team_name: item.team?.name ?? item.team_name ?? 'Unknown',
        team_id: item.team?.team_id ?? item.team?.id ?? item.team_id ?? null,
        team_logo: teamLogo,
        team_url: item.team?.team_url ?? item.team_url ?? null,
        played: item.played ?? item.gp ?? 0,
        won: item.wins ?? item.won ?? 0,
        drawn: item.draws ?? item.drawn ?? 0,
        lost: item.losses ?? item.lost ?? 0,
        points: item.points ?? item.pts ?? 0,
        scored: item.scored ?? item.for ?? undefined,
        conceded: item.conceded ?? item.against ?? undefined,
    };
}
