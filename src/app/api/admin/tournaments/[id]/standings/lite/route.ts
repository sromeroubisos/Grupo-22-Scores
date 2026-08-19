import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentReadContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { loadPhaseScopedParticipants } from '@/lib/server/phaseParticipants';
import { normalizeTableType } from '@/lib/standings/tableType';
import { applyStandingsTableType, supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { isUuid } from '@/lib/utils/postgrest';

type ParticipantScopeRow = {
    id?: unknown;
    club_id?: unknown;
};

function normalizeScopeId(value: unknown): string {
    return String(value ?? '').trim();
}

function buildParticipantTeamIdSet(participants: ParticipantScopeRow[]): Set<string> {
    return new Set(
        participants
            .map((participant) => normalizeScopeId(participant.club_id ?? participant.id))
            .filter(Boolean),
    );
}

function filterStandingRowsForParticipantScope<TRow extends { club_id?: unknown }>(
    rows: TRow[],
    participants: ParticipantScopeRow[],
): TRow[] {
    const allowedTeamIds = buildParticipantTeamIdSet(participants);
    if (allowedTeamIds.size === 0) return [];

    return rows.filter((row) => allowedTeamIds.has(normalizeScopeId(row.club_id)));
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        // Mismas guardas que la ruta completa de standings: acá abajo estos
        // cuatro valores entran en columnas uuid, y un slug de torneo o un
        // nombre de pestaña se traducía en un 22P02 y un 500.
        if (!isUuid(tournamentId)) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }
        const searchParams = request.nextUrl.searchParams;
        const phaseId = searchParams.get('phaseId');
        const groupId = searchParams.get('groupId');
        const rawSeasonId =
            searchParams.get('seasonId') ||
            searchParams.get('season_id') ||
            searchParams.get('season');
        // La etiqueta de temporada ('2026') no es su id: se descarta y abajo
        // manda la de la fase o la vigente del torneo.
        const requestedSeasonId = isUuid(rawSeasonId) ? rawSeasonId : null;

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        if (!isUuid(phaseId)) {
            return NextResponse.json({ error: 'phaseId inválido' }, { status: 400 });
        }

        if (groupId && !isUuid(groupId)) {
            return NextResponse.json({ error: 'groupId inválido' }, { status: 400 });
        }

        const tableType = normalizeTableType(searchParams.get('tableType'));
        if (!tableType) {
            return NextResponse.json(
                { error: 'tableType inválido: se esperaba general, home o away.' },
                { status: 400 },
            );
        }

        // Lectura acotada a quien pertenece al torneo. Antes alcanzaba con tener
        // una sesión y el id del torneo para leer su tabla entera.
        const { writer: supabase } = await requireTournamentReadContext(tournamentId);

        // 1. Fetch phase/tournament context for season and rules
        const [{ data: phase }, { data: tournament }] = await Promise.all([
            supabase
                .from('tournament_phases')
                .select('settings, season_id')
                .eq('id', phaseId)
                .eq('tournament_id', tournamentId)
                .single(),
            supabase
                .from('tournaments')
                .select('ruleset, current_season_id')
                .eq('id', tournamentId)
                .single(),
        ]);

        const scopedSeasonId = requestedSeasonId ?? phase?.season_id ?? tournament?.current_season_id ?? null;

        // 2. Fetch persisted standings and the authoritative phase roster
        let query = supabase
            .from('tournament_standings')
            .select(`
                club_id,
                position,
                played,
                won,
                drawn,
                lost,
                points,
                scored,
                conceded,
                bonus_points,
                form,
                stats,
                last_updated
            `)
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .order('position', { ascending: true });

        if (scopedSeasonId) {
            query = query.eq('season_id', scopedSeasonId);
        }

        if (groupId) {
            query = query.eq('group_id', groupId);
        } else {
            query = (query as any).is('group_id', null);
        }

        // La tabla lite es la guardada tal cual: sin filtrar, las tres
        // perspectivas se mezclarían en una sola lista de posiciones.
        query = applyStandingsTableType(
            query,
            await supportsStandingsTableTypeColumn(),
            tableType,
        );

        const [
            { data: standings, error: standingsError },
            participantScope,
        ] = await Promise.all([
            query,
            loadPhaseScopedParticipants(supabase, {
                tournamentId,
                phaseId,
                groupId,
                seasonId: scopedSeasonId,
            }),
        ]);

        if (standingsError) throw standingsError;

        const resolvedRules = StandingsEngine.resolveRules(phase?.settings, tournament?.ruleset);
        const scopedStandings = filterStandingRowsForParticipantScope(
            (standings || []) as any[],
            participantScope.participants || [],
        );

        /**
         * El plantel de la fase, para poder resolver nombre y escudo por club
         * cuando el JSONB guardado no los tenga. Este endpoint era el único que
         * servía `stats.team_logo` SIN respaldo: recortar los escudos base64 de
         * la tabla lo dejaba en blanco, y por eso el paso 8 del SQL no se corre
         * hasta que esto esté verificado en producción.
         */
        const clubById = new Map<string, { name?: string | null; logo_url?: string | null }>();
        for (const participant of participantScope.participants ?? []) {
            const raw = participant as { club_id?: unknown; id?: unknown; name?: unknown; clubs?: unknown };
            const clubId = normalizeScopeId(raw.club_id ?? raw.id);
            if (!clubId) continue;
            const club = Array.isArray(raw.clubs) ? raw.clubs[0] : raw.clubs;
            clubById.set(clubId, {
                name: (club as { name?: string | null })?.name ?? (raw.name as string | null) ?? null,
                logo_url: (club as { logo_url?: string | null })?.logo_url ?? null,
            });
        }

        // 3. Map to expected frontend structure
        const table = scopedStandings.map(row => {
            const club = clubById.get(normalizeScopeId(row.club_id));
            const teamName = row.stats?.team_name || club?.name || 'Desconocido';

            return {
            teamId: row.club_id,
            team: {
                name: teamName,
                logo: buildTeamLogoProxyUrl({
                    key: row.club_id,
                    name: teamName,
                    fallback: club?.logo_url || row.stats?.team_logo || null,
                }),
            },
            position: row.position,
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            points_for: row.scored,
            points_against: row.conceded,
            difference: row.stats?.difference || 0,
            bonus_offensive: row.stats?.bonus_offensive || 0,
            bonus_defensive: row.stats?.bonus_defensive || 0,
            total_points: row.points,
            form: row.form ? row.form.split('') : [],
            adjustments: row.stats?.adjustments || [],
            status: row.stats?.status || null
            };
        });

        const lastCalculatedAt = scopedStandings?.[0]?.last_updated ?? null;

        return NextResponse.json({
            ok: true,
            table,
            rules: resolvedRules,
            last_calculated_at: lastCalculatedAt,
            is_lite: true
        });

    } catch (e: any) {
        console.error('Exception fetching standings-lite:', e);
        return tournamentApiErrorResponse(e);
    }
}
