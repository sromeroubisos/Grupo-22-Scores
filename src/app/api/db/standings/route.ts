import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { queryMatchesWithOptionalEvents } from '@/lib/utils/queryMatchesWithOptionalEvents';

const FINAL_STATUSES = ['final', 'finished', 'ft'] as const;

type PhaseRow = {
    id: string;
    order_index: number | null;
    is_active: boolean | null;
    settings: unknown;
};

type PersistedStandingRow = {
    position: number;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    points: number | null;
    scored: number | null;
    conceded: number | null;
    bonus_points: number | null;
    form: string | null;
    stats: { difference?: number; team_name?: string; team_logo?: string } | null;
    club_id: string;
    phase_id: string | null;
    group_id: string | null;
    club: {
        id: string;
        name: string | null;
        logo_url: string | null;
        short_name?: string | null;
    } | null;
};

type ParticipantRow = {
    id: string;
    club_id: string | null;
    name: string | null;
    group_id: string | null;
    status: string | null;
    clubs: {
        name: string | null;
        logo_url: string | null;
    } | null;
};

type FinalMatchRow = {
    id: string;
    home_club_id: string | null;
    away_club_id: string | null;
    score: Record<string, unknown> | null;
    events?: Array<Record<string, unknown>> | null;
    status: string | null;
    date_time: string | null;
    phase_id: string | null;
    group_id: string | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

type GeneratedStandingRow = {
    position: number;
    team?: {
        name?: string | null;
        logo?: string | null;
    } | null;
    teamId?: string | null;
    participantId?: string | null;
    played?: number;
    won?: number;
    drawn?: number;
    lost?: number;
    points_for?: number;
    points_against?: number;
    difference?: number;
    total_points?: number;
    bonus_offensive?: number;
    bonus_defensive?: number;
    form?: string[] | string | null;
};

function mapPersistedStanding(row: PersistedStandingRow) {
    return {
        position: row.position,
        team: {
            name: row.club?.name ?? row.stats?.team_name ?? '',
            logo: row.club?.logo_url ?? row.stats?.team_logo ?? '',
            id: row.club_id,
        },
        team_id: row.club_id,
        team_name: row.club?.name ?? row.stats?.team_name ?? '',
        team_logo: row.club?.logo_url ?? row.stats?.team_logo ?? '',
        matches_total: row.played ?? 0,
        wins_total: row.won ?? 0,
        draws_total: row.drawn ?? 0,
        losses_total: row.lost ?? 0,
        goals_for: row.scored ?? 0,
        goals_against: row.conceded ?? 0,
        goal_difference: row.stats?.difference ?? ((row.scored ?? 0) - (row.conceded ?? 0)),
        points_total: row.points ?? 0,
        bonus_points: row.bonus_points ?? 0,
        form: row.form,
        phase_id: row.phase_id ?? null,
        group_id: row.group_id ?? null,
    };
}

function mapCalculatedStanding(row: GeneratedStandingRow, participants: ParticipantRow[], phaseId: string | null, groupId: string | null) {
    const participant = participants.find((candidate) =>
        candidate?.club_id === row.teamId || candidate?.id === row.participantId,
    );

    return {
        position: row.position,
        team: {
            name: row.team?.name ?? participant?.clubs?.name ?? participant?.name ?? 'Equipo',
            logo: row.team?.logo ?? participant?.clubs?.logo_url ?? '',
            id: row.teamId ?? participant?.club_id ?? participant?.id ?? null,
        },
        team_id: row.teamId ?? participant?.club_id ?? participant?.id ?? null,
        team_name: row.team?.name ?? participant?.clubs?.name ?? participant?.name ?? 'Equipo',
        team_logo: row.team?.logo ?? participant?.clubs?.logo_url ?? '',
        matches_total: row.played ?? 0,
        wins_total: row.won ?? 0,
        draws_total: row.drawn ?? 0,
        losses_total: row.lost ?? 0,
        goals_for: row.points_for ?? 0,
        goals_against: row.points_against ?? 0,
        goal_difference: row.difference ?? 0,
        points_total: row.total_points ?? 0,
        bonus_points: (row.bonus_offensive ?? 0) + (row.bonus_defensive ?? 0),
        form: Array.isArray(row.form) ? row.form.join('') : (row.form ?? ''),
        phase_id: phaseId,
        group_id: groupId ?? participant?.group_id ?? null,
    };
}

// GET /api/db/standings?tournament=<uuid>&phase=<uuid>&group=<uuid>
// Returns the most relevant standings for a local DB match. When standings are
// not manually managed, compute them from the latest final results so the page
// always reflects the current table even for upcoming matches.
export async function GET(req: NextRequest) {
    const tournamentId = req.nextUrl.searchParams.get('tournament');
    const requestedPhaseId = req.nextUrl.searchParams.get('phase');
    const requestedGroupId = req.nextUrl.searchParams.get('group');

    if (!tournamentId) {
        return NextResponse.json({ error: 'tournament param required' }, { status: 400 });
    }

    const supabase = await createClient();

    const [
        tournamentRes,
        phasesRes,
        persistedRes,
    ] = await Promise.all([
        supabase
            .from('tournaments')
            .select('id, ruleset')
            .eq('id', tournamentId)
            .maybeSingle(),
        supabase
            .from('tournament_phases')
            .select('id, order_index, is_active, settings')
            .eq('tournament_id', tournamentId)
            .order('order_index', { ascending: true }),
        (() => {
            let query = supabase
                .from('tournament_standings')
                .select(`
                    position, played, won, drawn, lost, points, scored, conceded,
                    bonus_points, form, stats, club_id, phase_id, group_id,
                    club:clubs!tournament_standings_club_id_fkey(id, name, logo_url, short_name)
                `)
                .eq('tournament_id', tournamentId)
                .order('position', { ascending: true });

            if (requestedPhaseId) query = query.eq('phase_id', requestedPhaseId);
            if (requestedGroupId) {
                query = query.eq('group_id', requestedGroupId);
            } else if (requestedPhaseId) {
                query = (query as typeof query & { is: (column: string, value: null) => typeof query }).is('group_id', null);
            }

            return query;
        })(),
    ]);

    if (tournamentRes.error) {
        console.error('[GET /api/db/standings] tournament query failed:', tournamentRes.error);
        return NextResponse.json({ error: 'Failed to fetch standings context' }, { status: 500 });
    }

    if (phasesRes.error) {
        console.error('[GET /api/db/standings] phases query failed:', phasesRes.error);
        return NextResponse.json({ error: 'Failed to fetch standings phases' }, { status: 500 });
    }

    if (persistedRes.error) {
        console.error('[GET /api/db/standings] persisted standings query failed:', persistedRes.error);
        return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 500 });
    }

    const phases = Array.isArray(phasesRes.data) ? phasesRes.data : [];
    const fallbackPhaseId = requestedPhaseId
        ?? phases.find((phase: PhaseRow) => phase?.is_active)?.id
        ?? phases[0]?.id
        ?? null;

    const activePhase = phases.find((phase: PhaseRow) => String(phase?.id ?? '') === String(fallbackPhaseId ?? '')) ?? null;

    const [participantsRes, matchesRes] = await Promise.all([
        (() => {
            let query = supabase
                .from('tournament_participants')
                .select('id, club_id, name, group_id, status, clubs:club_id(name, logo_url)')
                .eq('tournament_id', tournamentId)
                .not('status', 'in', '("withdrawn","disqualified")');

            if (requestedGroupId) query = query.eq('group_id', requestedGroupId);
            return query;
        })(),
        queryMatchesWithOptionalEvents<FinalMatchRow>(
            () => {
                let query = supabase
                    .from('matches')
                    .select(`
                        id, home_club_id, away_club_id, score, events, status, date_time,
                        phase_id, group_id, home_base_points, away_base_points,
                        home_bonus_points, away_bonus_points, points_autocalculated,
                        points_override_reason
                    `)
                    .eq('tournament_id', tournamentId)
                    .in('status', [...FINAL_STATUSES]);

                if (fallbackPhaseId) query = query.eq('phase_id', fallbackPhaseId);
                if (requestedGroupId) query = query.eq('group_id', requestedGroupId);
                return query;
            },
            () => {
                let query = supabase
                    .from('matches')
                    .select(`
                        id, home_club_id, away_club_id, score, status, date_time,
                        phase_id, group_id, home_base_points, away_base_points,
                        home_bonus_points, away_bonus_points, points_autocalculated,
                        points_override_reason
                    `)
                    .eq('tournament_id', tournamentId)
                    .in('status', [...FINAL_STATUSES]);

                if (fallbackPhaseId) query = query.eq('phase_id', fallbackPhaseId);
                if (requestedGroupId) query = query.eq('group_id', requestedGroupId);
                return query;
            },
        ),
    ]);

    if (participantsRes.error) {
        console.error('[GET /api/db/standings] participants query failed:', participantsRes.error);
        return NextResponse.json({ error: 'Failed to fetch standings participants' }, { status: 500 });
    }

    if (matchesRes.error) {
        console.error('[GET /api/db/standings] matches query failed:', matchesRes.error);
        return NextResponse.json({ error: 'Failed to fetch standings matches' }, { status: 500 });
    }

    const persistedRows = Array.isArray(persistedRes.data)
        ? (persistedRes.data as PersistedStandingRow[]).map(mapPersistedStanding)
        : [];
    const participants = Array.isArray(participantsRes.data) ? (participantsRes.data as ParticipantRow[]) : [];
    const finalMatches = Array.isArray(matchesRes.data)
        ? (matchesRes.data as FinalMatchRow[]).map((match) => ({ ...match, status: 'final' }))
        : [];

    const resolvedRules = StandingsEngine.resolveRules(
        activePhase?.settings ?? {},
        tournamentRes.data?.ruleset ?? {},
    );
    const shouldUsePersistedStandings = resolvedRules?.calculation_mode === 'fully_manual';

    if (!shouldUsePersistedStandings && participants.length > 0) {
        const calculatedRows = StandingsEngine.generateTable(
            participants,
            finalMatches,
            resolvedRules,
        ).map((row: GeneratedStandingRow) => mapCalculatedStanding(row, participants, fallbackPhaseId, requestedGroupId));

        if (calculatedRows.length > 0) {
            return NextResponse.json({
                ok: true,
                source: 'calculated',
                phase_id: fallbackPhaseId,
                group_id: requestedGroupId,
                standings: calculatedRows,
            });
        }
    }

    return NextResponse.json({
        ok: true,
        source: 'persisted',
        phase_id: fallbackPhaseId,
        group_id: requestedGroupId,
        standings: persistedRows,
    });
}
