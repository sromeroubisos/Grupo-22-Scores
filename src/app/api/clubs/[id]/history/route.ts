import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { buildTeamLogoProxyUrl, isOversizedInlineLogoUrl, resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { applyStandingsTableType, supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';
import { APP_TIMEZONE } from '@/lib/timezone';

const FINISHED_STATUSES = new Set([
    'final', 'finished', 'completed', 'scored', 'ft', 'aet', 'pen', 'awarded',
    'finalizado', 'jugado', 'played', 'result',
]);

// Estados de `tournaments.status` que marcan la edición como terminada. Un torneo
// publicado o activo sigue en juego: su puntero es "1.º de N", nunca "Campeón".
const FINISHED_TOURNAMENT_STATUSES = new Set([
    'completed', 'finished', 'archived', 'ended', 'closed', 'finalizado', 'terminado',
]);

type Score = { home?: number | string | null; away?: number | string | null; home_score?: number | string | null; away_score?: number | string | null } | null;
type ClubEmbed = { id: string; name: string | null } | null;
type ClubRow = { id: string; name: string | null; logo_url: string | null } | null;
type TournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    logo_url?: string | null;
    category: string | null;
    format: string | null;
    country: string | null;
    region: string | null;
    season_id: string | null;
    sport_id: string | null;
    status?: string | null;
} | null;

type MatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: Score;
    category: string | null;
    venue: string | null;
    sport_id: string | null;
    tournament_id: string | null;
    phase_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home: ClubEmbed | ClubEmbed[];
    away: ClubEmbed | ClubEmbed[];
    tournament: TournamentRow | TournamentRow[];
};

type StandingRow = {
    club_id: string;
    tournament_id: string;
    phase_id: string | null;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    scored: number;
    conceded: number;
    points: number;
};

type NormalizedMatch = {
    id: string;
    date: string;
    category: string | null;
    sportId: string | null;
    tournamentId: string | null;
    tournamentName: string | null;
    tournamentLogo: string | null;
    season: string;
    phaseId: string | null;
    home: { id: string | null; name: string; logo: string };
    away: { id: string | null; name: string; logo: string };
    homeScore: number;
    awayScore: number;
    isHome: boolean;
    outcome: 'win' | 'draw' | 'loss';
    pointsFor: number;
    pointsAgainst: number;
};

function one<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function numeric(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function getScore(score: Score) {
    const home = numeric(score?.home ?? score?.home_score);
    const away = numeric(score?.away ?? score?.away_score);
    return home === null || away === null ? null : { home, away };
}

const seasonYearFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric' });

// La temporada de un partido es el año en que se jugó (en hora argentina), no la
// edición vigente del torneo: un partido de 2024 de un torneo cuyo season_id hoy
// dice 2026 pertenece a la temporada 2024.
function matchSeasonLabel(dateTime: string) {
    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) return 'Sin temporada';
    return seasonYearFormatter.format(date);
}

function statsFor(matches: NormalizedMatch[]) {
    const stats = { matches: 0, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, difference: 0, winRate: 0 };
    for (const match of matches) {
        stats.matches += 1;
        stats.pointsFor += match.pointsFor;
        stats.pointsAgainst += match.pointsAgainst;
        if (match.outcome === 'win') stats.wins += 1;
        if (match.outcome === 'draw') stats.draws += 1;
        if (match.outcome === 'loss') stats.losses += 1;
    }
    stats.difference = stats.pointsFor - stats.pointsAgainst;
    stats.winRate = stats.matches ? Math.round((stats.wins / stats.matches) * 1000) / 10 : 0;
    return stats;
}

function resultLabel(position: number | null, teamsCount: number | null, finished: boolean) {
    if (!position) return null;
    if (finished && position === 1) return 'Campeón';
    if (finished && position === 2) return 'Subcampeón';
    return teamsCount ? `${position}.º de ${teamsCount} equipos` : `${position}.º puesto`;
}

async function resolveClubFamilyIds(db: Awaited<ReturnType<typeof getReadClient>>, clubId: string) {
    const ids = new Set<string>([clubId]);
    try {
        // Las dos puntas del grafo en paralelo: lo común es que el club ya sea el
        // base y con estas dos alcance; si resulta ser filial, un viaje más.
        const [{ data: incoming }, { data: outgoingFromSelf }] = await Promise.all([
            db.from('club_derivatives').select('base_club_id').eq('derived_club_id', clubId).maybeSingle(),
            db.from('club_derivatives').select('derived_club_id').eq('base_club_id', clubId),
        ]);
        const baseId = incoming?.base_club_id || clubId;
        ids.add(baseId);
        for (const row of outgoingFromSelf ?? []) if (row?.derived_club_id) ids.add(row.derived_club_id);
        if (baseId !== clubId) {
            const { data: outgoing } = await db.from('club_derivatives').select('derived_club_id').eq('base_club_id', baseId);
            for (const row of outgoing ?? []) if (row?.derived_club_id) ids.add(row.derived_club_id);
        }
    } catch {
        // Historical identity linking is optional on installations without this table.
    }
    return Array.from(ids);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: 'Falta el equipo.' }, { status: 400 });

    try {
        const db = await getReadClient();
        const [supportsTableType, familyIds] = await Promise.all([
            supportsStandingsTableTypeColumn(),
            resolveClubFamilyIds(db, id),
        ]);
        // Los escudos NO viajan embebidos acá: un logo_url puede ser un base64 de
        // cientos de KB, y multiplicado por fila era el payload de 24 MB y los 40 s
        // de transferencia desde Supabase. Se resuelven una vez por entidad abajo.
        const matchSelect = `
            id, date_time, status, score, category, venue, sport_id, tournament_id, phase_id,
            home_club_id, away_club_id,
            home:clubs!matches_home_club_id_fkey(id, name),
            away:clubs!matches_away_club_id_fkey(id, name),
            tournament:tournaments!matches_tournament_id_fkey(id, name, display_name, category, format, country, region, season_id, sport_id, status)
        `;

        const [homeResult, awayResult, standingsResult] = await Promise.all([
            db.from('matches').select(matchSelect).in('home_club_id', familyIds).order('date_time', { ascending: false }).limit(2500),
            db.from('matches').select(matchSelect).in('away_club_id', familyIds).order('date_time', { ascending: false }).limit(2500),
            // El historial del club es la tabla general. Sin filtrar, el
            // `limit(1000)` además se llenaría tres veces más rápido y podría
            // recortar temporadas viejas.
            applyStandingsTableType(
                db.from('tournament_standings').select('club_id, tournament_id, phase_id, position, played, won, drawn, lost, scored, conceded, points').in('club_id', familyIds).limit(1000),
                supportsTableType,
            ),
        ]);

        const queryError = homeResult.error || awayResult.error;
        if (queryError) {
            console.error('[club history] matches query failed', queryError);
            return NextResponse.json({ ok: false, error: 'No se pudo consultar el historial.' }, { status: 500 });
        }
        if (standingsResult.error) {
            // Sin standings el historial sigue sirviendo (partidos y rivales); las
            // posiciones se pierden, pero que quede rastro en el log.
            console.error('[club history] standings query failed', standingsResult.error);
        }

        const rowsById = new Map<string, MatchRow>();
        for (const row of [...(homeResult.data ?? []), ...(awayResult.data ?? [])] as MatchRow[]) {
            if (row?.id && !rowsById.has(row.id)) rowsById.set(row.id, row);
        }

        const finishedRows = Array.from(rowsById.values()).filter((row) => {
            const status = String(row.status ?? '').trim().toLowerCase();
            return FINISHED_STATUSES.has(status) && Boolean(row.date_time) && Boolean(getScore(row.score));
        });
        const tournamentIds = Array.from(new Set([
            ...finishedRows.map((row) => row.tournament_id),
            ...((standingsResult.data ?? []) as StandingRow[]).map((row) => row.tournament_id),
        ].filter((value): value is string => Boolean(value))));
        const clubIds = Array.from(new Set(
            finishedRows.flatMap((row) => [row.home_club_id, row.away_club_id]).filter((value): value is string => Boolean(value)),
        ));
        const familySet = new Set(familyIds);
        const opponentIds = Array.from(new Set(finishedRows.map((row) => {
            const isHome = Boolean(row.home_club_id && familySet.has(row.home_club_id));
            return isHome ? row.away_club_id : row.home_club_id;
        }).filter((value): value is string => Boolean(value))));

        // La tabla con más partidos jugados es la principal: un interzonal de una
        // fecha no puede pisar a la fase regular ni regalar posiciones "de campeón".
        const standingsByTournament = new Map<string, StandingRow>();
        for (const standing of (standingsResult.data ?? []) as StandingRow[]) {
            const current = standingsByTournament.get(standing.tournament_id);
            if (!current || standing.played > current.played || (standing.played === current.played && standing.position < current.position)) {
                standingsByTournament.set(standing.tournament_id, standing);
            }
        }
        const standingTournamentIds = Array.from(standingsByTournament.keys());

        // Todo lo que no depende entre sí viaja junto: contra una base cross-region
        // cada ida y vuelta secuencial son segundos de espera.
        const emptyRows = { data: [], error: null } as { data: unknown[]; error: null };
        const [seasonsResult, participantsResult, phasesResult, tournamentsResult, clubsResult, aliasesResult, tableRowsResult] = await Promise.all([
            tournamentIds.length ? db.from('seasons').select('tournament_id, start_date, end_date, season_id').in('tournament_id', tournamentIds).limit(1000) : Promise.resolve(emptyRows),
            tournamentIds.length ? db.from('tournament_participants').select('tournament_id, club_id').in('tournament_id', tournamentIds).limit(10000) : Promise.resolve(emptyRows),
            tournamentIds.length ? db.from('tournament_phases').select('id, name, tournament_id').in('tournament_id', tournamentIds).limit(2000) : Promise.resolve(emptyRows),
            tournamentIds.length ? db.from('tournaments').select('id, name, display_name, logo_url, category, format, country, region, season_id, sport_id, status').in('id', tournamentIds) : Promise.resolve(emptyRows),
            clubIds.length ? db.from('clubs').select('id, name, logo_url').in('id', clubIds) : Promise.resolve(emptyRows),
            opponentIds.length ? db.from('club_derivatives').select('base_club_id, derived_club_id').in('derived_club_id', opponentIds) : Promise.resolve(emptyRows),
            // "N.º de M equipos": M es el tamaño de la tabla donde está esa posición,
            // no la cantidad de inscriptos del torneo entero (un Top 10 con zonas
            // puede tener 31 participantes y tablas de 10).
            standingTournamentIds.length
                ? applyStandingsTableType(
                    db.from('tournament_standings').select('tournament_id, phase_id, club_id').in('tournament_id', standingTournamentIds).limit(5000),
                    supportsTableType,
                )
                : Promise.resolve(emptyRows),
        ]);

        // Por torneo: la etiqueta de su edición vigente y hasta cuándo se juega.
        const seasonInfoMap = new Map<string, { label: string | null; maxEnd: number | null; latestStart: number }>();
        for (const season of (seasonsResult.data ?? []) as Array<{ tournament_id: string | null; start_date: string | null; end_date: string | null; season_id: string | null }>) {
            if (!season.tournament_id) continue;
            const startTs = season.start_date ? new Date(season.start_date).getTime() : NaN;
            const endTs = season.end_date ? new Date(season.end_date).getTime() : NaN;
            const refDate = season.start_date || season.end_date;
            const year = refDate ? seasonYearFormatter.format(new Date(refDate)) : null;
            const label = /^\d{4}$/.test(String(season.season_id ?? '')) ? String(season.season_id) : year;
            const info = seasonInfoMap.get(season.tournament_id) ?? { label: null, maxEnd: null, latestStart: -Infinity };
            if (Number.isFinite(endTs)) info.maxEnd = Math.max(info.maxEnd ?? -Infinity, endTs);
            const orderTs = Number.isFinite(startTs) ? startTs : Number.isFinite(endTs) ? endTs : -Infinity;
            if (orderTs >= info.latestStart) {
                info.latestStart = orderTs;
                if (label) info.label = label;
            }
            seasonInfoMap.set(season.tournament_id, info);
        }

        const tournamentMap = new Map<string, TournamentRow>();
        for (const tournament of (tournamentsResult.data ?? []) as TournamentRow[]) {
            if (tournament?.id) tournamentMap.set(tournament.id, tournament);
        }
        for (const row of finishedRows) {
            const tournament = one(row.tournament);
            if (tournament?.id && !tournamentMap.has(tournament.id)) tournamentMap.set(tournament.id, tournament);
        }

        // Un escudo por entidad, una sola vez: los base64 grandes salen por el proxy.
        const clubLogoMap = new Map<string, string>();
        for (const club of (clubsResult.data ?? []) as ClubRow[]) {
            if (!club?.id) continue;
            clubLogoMap.set(club.id, resolveSerializableLogoUrl(club.logo_url, { key: club.id, name: club.name }) ?? '');
        }
        const tournamentLogoMap = new Map<string, string | null>();
        for (const [tournamentId, tournament] of tournamentMap) {
            const raw = tournament?.logo_url ?? null;
            if (!raw) {
                tournamentLogoMap.set(tournamentId, null);
                continue;
            }
            tournamentLogoMap.set(tournamentId, isOversizedInlineLogoUrl(raw)
                ? buildTeamLogoProxyUrl({ key: tournamentId, name: tournament?.display_name || tournament?.name, entity: 'tournament' })
                : raw);
        }

        const tableClubs = new Map<string, Set<string>>();
        for (const row of (tableRowsResult.data ?? []) as Array<{ tournament_id: string; phase_id: string | null; club_id: string }>) {
            const key = `${row.tournament_id}::${row.phase_id ?? ''}`;
            const set = tableClubs.get(key) ?? new Set<string>();
            if (row.club_id) set.add(row.club_id);
            tableClubs.set(key, set);
        }
        const tableSizeByTournament = new Map<string, number>();
        for (const standing of standingsByTournament.values()) {
            const size = tableClubs.get(`${standing.tournament_id}::${standing.phase_id ?? ''}`)?.size ?? 0;
            if (size >= 2) tableSizeByTournament.set(standing.tournament_id, size);
        }

        let normalizedMatches: NormalizedMatch[] = finishedRows.map((row) => {
            const home = one(row.home);
            const away = one(row.away);
            const tournament = one(row.tournament) || (row.tournament_id ? tournamentMap.get(row.tournament_id) ?? null : null);
            const score = getScore(row.score)!;
            const isHome = Boolean(row.home_club_id && familySet.has(row.home_club_id));
            const pointsFor = isHome ? score.home : score.away;
            const pointsAgainst = isHome ? score.away : score.home;
            return {
                id: row.id,
                date: row.date_time!,
                category: row.category || tournament?.category || null,
                sportId: row.sport_id || tournament?.sport_id || null,
                tournamentId: row.tournament_id,
                tournamentName: tournament?.display_name || tournament?.name || null,
                tournamentLogo: row.tournament_id ? tournamentLogoMap.get(row.tournament_id) ?? null : null,
                season: matchSeasonLabel(row.date_time!),
                phaseId: row.phase_id,
                home: { id: row.home_club_id, name: home?.name || 'Equipo local', logo: clubLogoMap.get(row.home_club_id ?? '') ?? '' },
                away: { id: row.away_club_id, name: away?.name || 'Equipo visitante', logo: clubLogoMap.get(row.away_club_id ?? '') ?? '' },
                homeScore: score.home,
                awayScore: score.away,
                isHome,
                outcome: (pointsFor > pointsAgainst ? 'win' : pointsFor < pointsAgainst ? 'loss' : 'draw') as NormalizedMatch['outcome'],
                pointsFor,
                pointsAgainst,
            };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Identidad canónica del rival: si el rival es una filial registrada, el
        // historial se cuenta contra el club base.
        const opponentCanonicalMap = new Map<string, string>();
        for (const alias of (aliasesResult.data ?? []) as Array<{ base_club_id: string | null; derived_club_id: string | null }>) {
            if (alias?.derived_club_id && alias?.base_club_id) opponentCanonicalMap.set(alias.derived_club_id, alias.base_club_id);
        }
        const baseIds = Array.from(new Set(opponentCanonicalMap.values()));
        if (baseIds.length) {
            try {
                const { data: baseClubs } = await db.from('clubs').select('id, name, logo_url').in('id', baseIds);
                const baseMap = new Map<string, ClubRow>((baseClubs ?? []).map((club: ClubRow) => [club!.id, club]));
                normalizedMatches = normalizedMatches.map((match) => {
                    const side = match.isHome ? 'away' : 'home';
                    const opponent = match[side];
                    const canonicalId = opponent.id ? opponentCanonicalMap.get(opponent.id) : null;
                    const canonical = canonicalId ? baseMap.get(canonicalId) : null;
                    if (!canonicalId) return match;
                    const canonicalLogo = canonical
                        ? resolveSerializableLogoUrl(canonical.logo_url, { key: canonical.id, name: canonical.name }) ?? ''
                        : opponent.logo;
                    return { ...match, [side]: { id: canonicalId, name: canonical?.name || opponent.name, logo: canonicalLogo } };
                });
            } catch {
                // Keep direct opponent identities when alias data is unavailable.
            }
        }

        // normalizedMatches está de más nuevo a más viejo: la primera aparición de
        // cada torneo es su temporada con actividad más reciente.
        const latestSeasonByTournament = new Map<string, string>();
        for (const match of normalizedMatches) {
            if (match.tournamentId && !latestSeasonByTournament.has(match.tournamentId)) {
                latestSeasonByTournament.set(match.tournamentId, match.season);
            }
        }
        const currentSeasonLabel = (tournamentId: string) => {
            const tournament = tournamentMap.get(tournamentId) ?? null;
            if (tournament?.season_id && /^\d{4}$/.test(tournament.season_id)) return tournament.season_id;
            return seasonInfoMap.get(tournamentId)?.label || latestSeasonByTournament.get(tournamentId) || 'Sin temporada';
        };
        const isTournamentFinished = (tournamentId: string) => {
            const status = String(tournamentMap.get(tournamentId)?.status ?? '').trim().toLowerCase();
            if (FINISHED_TOURNAMENT_STATUSES.has(status)) return true;
            const maxEnd = seasonInfoMap.get(tournamentId)?.maxEnd;
            return typeof maxEnd === 'number' && Number.isFinite(maxEnd) && maxEnd < Date.now();
        };

        const phaseMap = new Map<string, string>();
        for (const phase of (phasesResult.data ?? []) as Array<{ id: string; name: string | null }>) {
            if (phase?.id && phase.name) phaseMap.set(phase.id, phase.name);
        }
        const participantsCount = new Map<string, number>();
        for (const participant of (participantsResult.data ?? []) as Array<{ tournament_id: string | null }>) {
            if (participant?.tournament_id) participantsCount.set(participant.tournament_id, (participantsCount.get(participant.tournament_id) ?? 0) + 1);
        }

        // Una participación es torneo + temporada: el mismo torneo jugado en 2024,
        // 2025 y 2026 son tres filas, y la tabla de posiciones solo aplica a la
        // edición vigente.
        const participationGroups = new Map<string, { tournamentId: string; season: string; matches: NormalizedMatch[] }>();
        for (const match of normalizedMatches) {
            if (!match.tournamentId) continue;
            const key = `${match.tournamentId}::${match.season}`;
            const group = participationGroups.get(key) ?? { tournamentId: match.tournamentId, season: match.season, matches: [] };
            group.matches.push(match);
            participationGroups.set(key, group);
        }
        for (const tournamentId of standingsByTournament.keys()) {
            const season = currentSeasonLabel(tournamentId);
            const key = `${tournamentId}::${season}`;
            if (!participationGroups.has(key)) participationGroups.set(key, { tournamentId, season, matches: [] });
        }

        const participations = Array.from(participationGroups.values()).map(({ tournamentId, season, matches }) => {
            const tournament = tournamentMap.get(tournamentId) ?? null;
            const latestMatch = matches[0] ?? null;
            const isCurrentSeason = season === currentSeasonLabel(tournamentId);
            const standing = isCurrentSeason ? standingsByTournament.get(tournamentId) ?? null : null;
            // Una edición pasada quedó terminada por definición; la vigente depende
            // del estado del torneo.
            const finished = isCurrentSeason ? isTournamentFinished(tournamentId) : true;
            const computed = statsFor(matches);
            const position = standing?.position ?? null;
            const count = standing
                ? tableSizeByTournament.get(tournamentId) ?? participantsCount.get(tournamentId) ?? null
                : participantsCount.get(tournamentId) ?? null;
            return {
                tournamentId,
                tournamentName: tournament?.display_name || tournament?.name || latestMatch?.tournamentName || 'Torneo',
                tournamentLogo: tournamentLogoMap.get(tournamentId) ?? null,
                season,
                sportId: tournament?.sport_id || latestMatch?.sportId || null,
                finished,
                category: tournament?.category || latestMatch?.category || null,
                format: tournament?.format || null,
                country: tournament?.country || null,
                region: tournament?.region || null,
                phase: standing?.phase_id ? phaseMap.get(standing.phase_id) || null : latestMatch?.phaseId ? phaseMap.get(latestMatch.phaseId) || null : null,
                position,
                teamsCount: count,
                matchesPlayed: standing?.played ?? computed.matches,
                wins: standing?.won ?? computed.wins,
                draws: standing?.drawn ?? computed.draws,
                losses: standing?.lost ?? computed.losses,
                pointsFor: standing?.scored ?? computed.pointsFor,
                pointsAgainst: standing?.conceded ?? computed.pointsAgainst,
                difference: standing ? standing.scored - standing.conceded : computed.difference,
                tablePoints: standing?.points ?? null,
                result: resultLabel(position, count, finished),
            };
        }).sort((a, b) => b.season.localeCompare(a.season) || a.tournamentName.localeCompare(b.tournamentName));

        const filterSeasons = new Set(normalizedMatches.map((match) => match.season));
        const filterTournaments = new Set(normalizedMatches.map((match) => match.tournamentName).filter((value): value is string => Boolean(value)));
        const filterCategories = new Set(normalizedMatches.map((match) => match.category).filter((value): value is string => Boolean(value)));
        const filterSports = new Set(normalizedMatches.map((match) => match.sportId).filter((value): value is string => Boolean(value)));
        for (const participation of participations) {
            filterSeasons.add(participation.season);
            filterTournaments.add(participation.tournamentName);
            if (participation.category) filterCategories.add(participation.category);
            if (participation.sportId) filterSports.add(participation.sportId);
        }

        // Cada partido viaja UNA vez: temporadas, rivales e hitos se agrupan en el
        // cliente desde esta lista plana (y así responden a los filtros).
        return NextResponse.json({
            ok: true,
            generatedAt: new Date().toISOString(),
            matches: normalizedMatches,
            participations,
            filters: {
                seasons: Array.from(filterSeasons).sort().reverse(),
                tournaments: Array.from(filterTournaments).sort(),
                categories: Array.from(filterCategories).sort(),
                sports: Array.from(filterSports).sort(),
            },
        });
    } catch (error) {
        console.error('[club history] unexpected error', error);
        return NextResponse.json({ ok: false, error: 'No se pudo construir el historial del equipo.' }, { status: 500 });
    }
}
