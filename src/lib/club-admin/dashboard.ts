import { createClient } from '@/lib/supabase/server';
import {
    type ClubDashboardCompetition,
    type ClubDashboardMode,
    EMPTY_CLUB_DASHBOARD_OVERVIEW,
    type ClubDashboardClubRef,
    type ClubDashboardHealth,
    type ClubDashboardMatch,
    type ClubDashboardOverview,
    type ClubDashboardStanding,
} from '@/lib/club-admin/dashboard-types';
import type { ClubCore, ClubProfile } from '@/lib/types/clubs';
import { calculateClubHealth } from '@/lib/validation/clubValidation';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const FINAL_MATCH_STATUSES = ['final', 'finished', 'ft'] as const;
const MISSING_TABLE_CODES = new Set(['PGRST204', 'PGRST205', '42P01']);

type ClubRow = {
    id: string | null;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
    slug: string | null;
};

type TournamentRow = {
    id: string;
    name: string | null;
    slug: string | null;
};

type DivisionRow = {
    id: string;
    name: string | null;
};

type MatchScoreRow =
    | {
        home?: number | null;
        away?: number | null;
        home_score?: number | null;
        away_score?: number | null;
    }
    | null
    | undefined;

type MatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    venue: string | null;
    score: MatchScoreRow;
    notes: string | null;
    lineups: unknown;
    events: unknown;
    tournament_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home_division_id: string | null;
    away_division_id: string | null;
    home: ClubRow | ClubRow[] | null;
    away: ClubRow | ClubRow[] | null;
    tournament: TournamentRow | TournamentRow[] | null;
};

type ClubDashboardOptions = {
    mode?: ClubDashboardMode;
};

type StandingStatsRow =
    | {
        difference?: number;
    }
    | null
    | undefined;

type StandingRow = {
    tournament_id: string;
    club_id: string;
    position: number | null;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    points: number | null;
    scored: number | null;
    conceded: number | null;
    bonus_points: number | null;
    form: string | null;
    stats: StandingStatsRow;
    phase_id: string | null;
    group_id: string | null;
    last_updated: string | null;
    tournament: TournamentRow | TournamentRow[] | null;
};

type TournamentParticipantRow = {
    tournament_id: string | null;
    club_id: string | null;
    group_id: string | null;
    status: string | null;
};

type CompetitionMatchRow = {
    tournament_id: string | null;
    date_time: string | null;
    status: string | null;
    phase_id: string | null;
    group_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home_division_id: string | null;
    away_division_id: string | null;
};

type TournamentPhaseRow = {
    id: string;
    tournament_id: string;
    name: string | null;
    phase_type: string | null;
    order_index: number | null;
    is_active: boolean | null;
};

type TournamentGroupRow = {
    id: string;
    name: string | null;
    phase_id: string;
    order_index: number | null;
};

type CompetitionAccumulator = {
    tournamentId: string;
    tournamentName: string;
    tournamentSlug: string | null;
    clubNames: Set<string>;
    position: number | null;
    played: number;
    points: number;
    goalDifference: number;
    updatedAt: string | null;
    nextMatchAt: string | null;
    recentMatchAt: string | null;
    phaseIds: Set<string>;
    participantGroupIds: Set<string>;
    divisionNames: Set<string>;
    groupIds: Set<string>;
    sourceKinds: Set<'participant' | 'standing' | 'match'>;
    scopedStandings: StandingRow[];
    preferredPhaseId: string | null;
    preferredPhaseName: string | null;
    preferredPhaseType: string | null;
    visibleGroupNames: string[];
    preferredGroupCount: number;
    preferredGroupId: string | null;
    preferredGroupName: string | null;
};

function isMissingTableError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return false;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && MISSING_TABLE_CODES.has(code);
}

function unwrapRelationRow<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

function normalizeClub(row: ClubRow | null | undefined): ClubDashboardClubRef {
    return {
        id: row?.id ?? null,
        name: row?.name ?? 'Club',
        shortName: row?.short_name ?? null,
        logoUrl: row?.logo_url ?? null,
        slug: row?.slug ?? null,
    };
}

function normalizeMatchScore(score: MatchScoreRow) {
    if (!score || typeof score !== 'object') {
        return null;
    }

    return {
        home: typeof score.home === 'number'
            ? score.home
            : typeof score.home_score === 'number'
                ? score.home_score
                : null,
        away: typeof score.away === 'number'
            ? score.away
            : typeof score.away_score === 'number'
                ? score.away_score
                : null,
    };
}

function countArrayValue(value: unknown) {
    return Array.isArray(value) ? value.length : 0;
}

function countLineupEntries(lineups: unknown) {
    if (!lineups || typeof lineups !== 'object') return 0;

    const source = lineups as { home?: unknown; away?: unknown };
    return Math.max(countArrayValue(source.home), countArrayValue(source.away));
}

function countEventEntries(events: unknown) {
    if (Array.isArray(events)) return events.length;
    if (!events || typeof events !== 'object') return 0;

    return Object.values(events as Record<string, unknown>).reduce(
        (total, value) => total + countArrayValue(value),
        0
    );
}

function buildMatchFilter(clubIds: string[]) {
    if (clubIds.length === 1) {
        const clubId = clubIds[0];
        return `home_club_id.eq.${clubId},away_club_id.eq.${clubId}`;
    }

    const serializedIds = clubIds.join(',');
    return `home_club_id.in.(${serializedIds}),away_club_id.in.(${serializedIds})`;
}

function dedupeMatches(rows: ClubDashboardMatch[]) {
    const uniqueMatches = new Map<string, ClubDashboardMatch>();

    for (const match of rows) {
        if (!uniqueMatches.has(match.id)) {
            uniqueMatches.set(match.id, match);
        }
    }

    return Array.from(uniqueMatches.values()).sort((left, right) => {
        const leftTime = left.dateTime ? new Date(left.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.dateTime ? new Date(right.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
    });
}

function normalizeMatch(
    row: MatchRow,
    scopedClubIds: Set<string>,
    divisionNameById: Map<string, string>,
    includeOperationalPayload = false
): ClubDashboardMatch {
    const isHome = row.home_club_id ? scopedClubIds.has(row.home_club_id) : false;
    const home = normalizeClub(unwrapRelationRow(row.home));
    const away = normalizeClub(unwrapRelationRow(row.away));
    const tournament = unwrapRelationRow(row.tournament);
    const opponent = isHome ? away : home;

    return {
        id: row.id,
        dateTime: row.date_time,
        status: row.status ?? 'scheduled',
        venue: row.venue ?? null,
        score: normalizeMatchScore(row.score),
        notes: row.notes ?? null,
        lineups: includeOperationalPayload ? row.lineups ?? null : null,
        events: includeOperationalPayload ? row.events ?? null : null,
        lineupCount: countLineupEntries(row.lineups),
        statsCount: countEventEntries(row.events),
        isHome,
        homeDivisionId: row.home_division_id ?? null,
        awayDivisionId: row.away_division_id ?? null,
        homeDivisionName: row.home_division_id ? divisionNameById.get(row.home_division_id) ?? null : null,
        awayDivisionName: row.away_division_id ? divisionNameById.get(row.away_division_id) ?? null : null,
        opponentName: opponent.name,
        opponentShortName: opponent.shortName,
        opponentLogoUrl: opponent.logoUrl,
        home,
        away,
        tournament: tournament
            ? {
                id: tournament.id,
                name: tournament.name ?? 'Torneo',
                slug: tournament.slug ?? null,
            }
            : null,
    };
}

function normalizeStanding(
    row: StandingRow,
    groupNameById: Map<string, string>
): ClubDashboardStanding {
    const tournament = unwrapRelationRow(row.tournament);
    const scored = row.scored ?? 0;
    const conceded = row.conceded ?? 0;
    const derivedDifference = scored - conceded;

    return {
        tournamentId: row.tournament_id,
        tournamentName: tournament?.name ?? 'Torneo',
        tournamentSlug: tournament?.slug ?? null,
        position: row.position ?? null,
        played: row.played ?? 0,
        points: row.points ?? 0,
        won: row.won ?? 0,
        drawn: row.drawn ?? 0,
        lost: row.lost ?? 0,
        scored,
        conceded,
        bonusPoints: row.bonus_points ?? 0,
        goalDifference: typeof row.stats?.difference === 'number' ? row.stats.difference : derivedDifference,
        form: row.form ?? null,
        phaseId: row.phase_id ?? null,
        groupId: row.group_id ?? null,
        groupName: row.group_id ? groupNameById.get(row.group_id) ?? null : null,
        updatedAt: row.last_updated ?? null,
    };
}

function dedupeStandings(
    rows: StandingRow[],
    groupNameById: Map<string, string>
) {
    const uniqueByScope = new Map<string, StandingRow>();

    for (const row of rows) {
        const key = [
            row.tournament_id,
            row.phase_id ?? 'base',
            row.group_id ?? 'all',
            row.club_id,
        ].join('::');

        if (!uniqueByScope.has(key)) {
            uniqueByScope.set(key, row);
        }
    }

    return Array.from(uniqueByScope.values())
        .map((row) => normalizeStanding(row, groupNameById))
        .sort((left, right) => {
            const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
            const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

            if (leftPosition !== rightPosition) {
                return leftPosition - rightPosition;
            }

            return left.tournamentName.localeCompare(right.tournamentName);
        });
}

function buildHealthSnapshot(params: {
    clubCore: ClubCore | null;
    clubProfile: ClubProfile | null;
    competitionsCount: number;
    sponsorCount: number;
    totalMatches: number;
}): ClubDashboardHealth {
    const { clubCore, clubProfile, competitionsCount, sponsorCount, totalMatches } = params;

    if (!clubCore) {
        return {
            status: 'warning',
            completeness: 0,
            issues: [
                {
                    key: 'club-core-missing',
                    label: 'No pudimos leer la ficha principal del club.',
                    severity: 'warning',
                },
            ],
        };
    }

    const computedHealth = calculateClubHealth(clubCore, clubProfile);
    const issues = [
        ...computedHealth.errors.map((label, index) => ({
            key: `error-${index}`,
            label,
            severity: 'error' as const,
        })),
        ...computedHealth.warnings.map((label, index) => ({
            key: `warning-${index}`,
            label,
            severity: 'warning' as const,
        })),
    ];

    if (competitionsCount === 0) {
        issues.push({
            key: 'competitions-missing',
            label: 'Sin competencias vinculadas en la base del club.',
            severity: 'warning',
        });
    }

    if (totalMatches === 0) {
        issues.push({
            key: 'matches-missing',
            label: 'Sin partidos relacionados para este club.',
            severity: 'warning',
        });
    }

    if (sponsorCount === 0) {
        issues.push({
            key: 'sponsors-missing',
            label: 'Sin sponsors cargados en la base comercial.',
            severity: 'warning',
        });
    }

    const status = issues.some((issue) => issue.severity === 'error')
        ? 'error'
        : issues.length > 0
            ? 'warning'
            : 'ok';

    return {
        status,
        completeness: computedHealth.completeness,
        issues,
    };
}

function sortTournamentPhases(phases: TournamentPhaseRow[]) {
    return [...phases].sort((left, right) => {
        const leftOrder = typeof left.order_index === 'number' ? left.order_index : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.order_index === 'number' ? right.order_index : Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        return String(left.name ?? '').localeCompare(String(right.name ?? ''));
    });
}

function sortTournamentGroups(groups: TournamentGroupRow[]) {
    return [...groups].sort((left, right) => {
        const leftOrder = typeof left.order_index === 'number' ? left.order_index : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.order_index === 'number' ? right.order_index : Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        return String(left.name ?? '').localeCompare(String(right.name ?? ''));
    });
}

function resolveCompetitionPhase(
    phases: TournamentPhaseRow[],
    phaseIdsWithSignals: Set<string>
) {
    const orderedPhases = sortTournamentPhases(phases);
    if (orderedPhases.length === 0) return null;

    const explicitActivePhase = orderedPhases.find((phase) => phase.is_active);
    if (explicitActivePhase) {
        return explicitActivePhase;
    }

    const latestPhaseWithSignals = [...orderedPhases]
        .reverse()
        .find((phase) => phaseIdsWithSignals.has(phase.id));

    return latestPhaseWithSignals ?? orderedPhases[0] ?? null;
}

function getStandingTimestamp(row: StandingRow) {
    if (!row.last_updated) return 0;

    const timestamp = new Date(row.last_updated).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickPreferredStanding(params: {
    standingsRows: StandingRow[];
    preferredPhaseId: string | null;
    preferredPhaseType: string | null;
    preferredGroupIds: Set<string>;
}) {
    const { standingsRows, preferredPhaseId, preferredPhaseType, preferredGroupIds } = params;

    const compareRows = (left: StandingRow, right: StandingRow) => {
        const timestampDiff = getStandingTimestamp(right) - getStandingTimestamp(left);
        if (timestampDiff !== 0) return timestampDiff;

        const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
        const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
        if (leftPosition !== rightPosition) return leftPosition - rightPosition;

        return (right.played ?? 0) - (left.played ?? 0);
    };

    const rowsForPhase = preferredPhaseId
        ? standingsRows.filter((row) => row.phase_id === preferredPhaseId)
        : standingsRows;
    if (
        preferredPhaseId &&
        rowsForPhase.length === 0 &&
        (preferredPhaseType === 'knockout' || preferredPhaseType === 'playoff')
    ) {
        return null;
    }

    const phaseScopedRows = rowsForPhase.length > 0 ? rowsForPhase : standingsRows;

    if (preferredPhaseType === 'group_stage') {
        if (preferredGroupIds.size > 0) {
            const groupedRows = phaseScopedRows.filter((row) => row.group_id && preferredGroupIds.has(row.group_id));
            if (groupedRows.length > 0) {
                return [...groupedRows].sort(compareRows)[0] ?? null;
            }
        }

        const anyGroupedRows = phaseScopedRows.filter((row) => row.group_id);
        if (anyGroupedRows.length > 0) {
            return [...anyGroupedRows].sort(compareRows)[0] ?? null;
        }
    }

    const generalRows = phaseScopedRows.filter((row) => !row.group_id);
    if (generalRows.length > 0) {
        return [...generalRows].sort(compareRows)[0] ?? null;
    }

    return [...phaseScopedRows].sort(compareRows)[0] ?? null;
}

function buildCompetitions(params: {
    scopedClubIds: Set<string>;
    standingsRows: StandingRow[];
    participantRows: TournamentParticipantRow[];
    tournamentMatchRows: CompetitionMatchRow[];
    tournamentLookup: Map<string, TournamentRow>;
    tournamentPhasesByTournament: Map<string, TournamentPhaseRow[]>;
    tournamentGroupsByTournament: Map<string, TournamentGroupRow[]>;
    clubLookup: Map<string, ClubRow>;
    divisionNameById: Map<string, string>;
}): ClubDashboardCompetition[] {
    const {
        scopedClubIds,
        standingsRows,
        participantRows,
        tournamentMatchRows,
        tournamentLookup,
        tournamentPhasesByTournament,
        tournamentGroupsByTournament,
        clubLookup,
        divisionNameById,
    } = params;
    const competitions = new Map<string, CompetitionAccumulator>();

    const ensureCompetition = (tournamentId: string) => {
        const existing = competitions.get(tournamentId);
        if (existing) {
            return existing;
        }

        const tournament = tournamentLookup.get(tournamentId);
        const created: CompetitionAccumulator = {
            tournamentId,
            tournamentName: tournament?.name ?? 'Torneo',
            tournamentSlug: tournament?.slug ?? null,
            clubNames: new Set<string>(),
            position: null,
            played: 0,
            points: 0,
            goalDifference: 0,
            updatedAt: null,
            nextMatchAt: null,
            recentMatchAt: null,
            phaseIds: new Set<string>(),
            participantGroupIds: new Set<string>(),
            divisionNames: new Set<string>(),
            groupIds: new Set<string>(),
            sourceKinds: new Set<'participant' | 'standing' | 'match'>(),
            scopedStandings: [],
            preferredPhaseId: null,
            preferredPhaseName: null,
            preferredPhaseType: null,
            visibleGroupNames: [],
            preferredGroupCount: 0,
            preferredGroupId: null,
            preferredGroupName: null,
        };
        competitions.set(tournamentId, created);
        return created;
    };

    for (const row of participantRows) {
        if (!row.tournament_id) continue;
        const competition = ensureCompetition(row.tournament_id);
        competition.sourceKinds.add('participant');
        if (row.club_id) {
            const clubName = clubLookup.get(row.club_id)?.name;
            if (clubName?.trim()) {
                competition.clubNames.add(clubName.trim());
            }
        }
        if (row.group_id) {
            competition.participantGroupIds.add(row.group_id);
            competition.groupIds.add(row.group_id);
        }
    }

    for (const row of standingsRows) {
        if (!row.tournament_id) continue;
        const competition = ensureCompetition(row.tournament_id);
        competition.sourceKinds.add('standing');
        competition.scopedStandings.push(row);
        if (row.club_id) {
            const clubName = clubLookup.get(row.club_id)?.name;
            if (clubName?.trim()) {
                competition.clubNames.add(clubName.trim());
            }
        }
        if (row.phase_id) {
            competition.phaseIds.add(row.phase_id);
        }
        if (row.group_id) {
            competition.groupIds.add(row.group_id);
        }
    }

    const now = Date.now();

    for (const row of tournamentMatchRows) {
        if (!row.tournament_id) continue;
        const competition = ensureCompetition(row.tournament_id);
        competition.sourceKinds.add('match');

        const homeInScope = row.home_club_id ? scopedClubIds.has(row.home_club_id) : false;
        const awayInScope = row.away_club_id ? scopedClubIds.has(row.away_club_id) : false;

        const relevantDivision = homeInScope
            ? (row.home_division_id ? divisionNameById.get(row.home_division_id) ?? null : null)
            : awayInScope
                ? (row.away_division_id ? divisionNameById.get(row.away_division_id) ?? null : null)
                : null;

        if (homeInScope && row.home_club_id) {
            const clubName = clubLookup.get(row.home_club_id)?.name;
            if (clubName?.trim()) {
                competition.clubNames.add(clubName.trim());
            }
        }
        if (awayInScope && row.away_club_id) {
            const clubName = clubLookup.get(row.away_club_id)?.name;
            if (clubName?.trim()) {
                competition.clubNames.add(clubName.trim());
            }
        }

        if (relevantDivision?.trim()) {
            competition.divisionNames.add(relevantDivision.trim());
        }
        if (row.phase_id) {
            competition.phaseIds.add(row.phase_id);
        }
        if (row.group_id) {
            competition.groupIds.add(row.group_id);
        }

        if (!row.date_time) continue;
        const matchTime = new Date(row.date_time).getTime();
        if (!Number.isFinite(matchTime)) continue;

        if (matchTime >= now) {
            if (!competition.nextMatchAt || matchTime < new Date(competition.nextMatchAt).getTime()) {
                competition.nextMatchAt = row.date_time;
            }
        } else if (!competition.recentMatchAt || matchTime > new Date(competition.recentMatchAt).getTime()) {
            competition.recentMatchAt = row.date_time;
        }
    }

    for (const competition of competitions.values()) {
        const phases = tournamentPhasesByTournament.get(competition.tournamentId) ?? [];
        const configuredGroups = tournamentGroupsByTournament.get(competition.tournamentId) ?? [];
        const groupPhaseById = new Map(
            configuredGroups.map((group) => [group.id, group.phase_id])
        );

        for (const participantGroupId of competition.participantGroupIds) {
            const phaseId = groupPhaseById.get(participantGroupId);
            if (phaseId) {
                competition.phaseIds.add(phaseId);
            }
        }

        const preferredPhase = resolveCompetitionPhase(phases, competition.phaseIds);
        const preferredPhaseId = preferredPhase?.id ?? null;
        const preferredPhaseType = preferredPhase?.phase_type ?? null;
        const groupsForPreferredPhase = preferredPhaseId
            ? sortTournamentGroups(configuredGroups.filter((group) => group.phase_id === preferredPhaseId))
            : [];
        const preferredGroupIds = new Set(
            Array.from(competition.participantGroupIds).filter((groupId) => {
                const phaseId = groupPhaseById.get(groupId);
                return preferredPhaseId ? phaseId === preferredPhaseId : true;
            })
        );
        const preferredGroupNames = groupsForPreferredPhase
            .filter((group) => preferredGroupIds.has(group.id))
            .map((group) => group.name?.trim())
            .filter((value): value is string => Boolean(value));
        const fallbackPreferredGroup = groupsForPreferredPhase.find((group) =>
            competition.scopedStandings.some((row) => row.group_id === group.id)
        ) ?? null;
        const primaryStanding = pickPreferredStanding({
            standingsRows: competition.scopedStandings,
            preferredPhaseId,
            preferredPhaseType,
            preferredGroupIds,
        });
        const primaryGroupId = Array.from(preferredGroupIds)[0]
            ?? primaryStanding?.group_id
            ?? fallbackPreferredGroup?.id
            ?? null;
        const primaryGroupName = primaryGroupId
            ? groupsForPreferredPhase.find((group) => group.id === primaryGroupId)?.name?.trim()
                ?? null
            : null;
        const visibleGroupNames = preferredGroupNames.length > 0
            ? preferredGroupNames
            : primaryGroupName
                ? [primaryGroupName]
                : [];

        if (primaryStanding) {
            competition.position = primaryStanding.position ?? null;
            competition.updatedAt = primaryStanding.last_updated ?? null;
            competition.played = primaryStanding.played ?? 0;
            competition.points = primaryStanding.points ?? 0;
            competition.goalDifference = typeof primaryStanding.stats?.difference === 'number'
                ? primaryStanding.stats.difference
                : (primaryStanding.scored ?? 0) - (primaryStanding.conceded ?? 0);
        }

        competition.phaseIds = preferredPhaseId ? new Set([preferredPhaseId]) : competition.phaseIds;
        competition.groupIds = new Set(primaryGroupId ? [primaryGroupId] : []);

        competition.preferredPhaseId = preferredPhaseId;
        competition.preferredPhaseName = preferredPhase?.name?.trim() ?? null;
        competition.preferredPhaseType = preferredPhaseType;
        competition.visibleGroupNames = visibleGroupNames;
        competition.preferredGroupCount = preferredPhaseType === 'group_stage' ? groupsForPreferredPhase.length : 0;
        competition.preferredGroupId = primaryGroupId;
        competition.preferredGroupName = primaryGroupName;
    }

    return Array.from(competitions.values())
        .map((competition) => ({
            tournamentId: competition.tournamentId,
            tournamentName: competition.tournamentName,
            tournamentSlug: competition.tournamentSlug,
            clubNames: Array.from(competition.clubNames).sort((left, right) => left.localeCompare(right)),
            position: competition.position,
            played: competition.played,
            points: competition.points,
            goalDifference: competition.goalDifference,
            updatedAt: competition.updatedAt,
            nextMatchAt: competition.nextMatchAt,
            recentMatchAt: competition.recentMatchAt,
            divisionNames: Array.from(competition.divisionNames).sort((left, right) => left.localeCompare(right)),
            phaseId: competition.preferredPhaseId,
            phaseName: competition.preferredPhaseName,
            phaseType: competition.preferredPhaseType,
            groupId: competition.preferredGroupId,
            groupName: competition.preferredGroupName,
            groupNames: competition.visibleGroupNames,
            groupCount: competition.preferredGroupCount,
            sourceKinds: Array.from(competition.sourceKinds),
        }))
        .sort((left, right) => {
            const leftNext = left.nextMatchAt ? new Date(left.nextMatchAt).getTime() : Number.MAX_SAFE_INTEGER;
            const rightNext = right.nextMatchAt ? new Date(right.nextMatchAt).getTime() : Number.MAX_SAFE_INTEGER;

            if (leftNext !== rightNext) {
                return leftNext - rightNext;
            }

            const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
            const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
            if (leftUpdated !== rightUpdated) {
                return rightUpdated - leftUpdated;
            }

            return left.tournamentName.localeCompare(right.tournamentName);
        });
}

export async function getClubDashboardOverview(
    supabase: SupabaseServerClient,
    clubId: string,
    options: ClubDashboardOptions = {}
): Promise<ClubDashboardOverview> {
    if (!clubId) {
        return EMPTY_CLUB_DASHBOARD_OVERVIEW;
    }

    const includeOperationalPayload = options.mode === 'operational';
    const scopedClubIds = [clubId].filter((value): value is string => typeof value === 'string' && value.length > 0);
    const scopedClubIdSet = new Set(scopedClubIds);
    const nowIso = new Date().toISOString();
    const matchSelect = `
        id, date_time, status, venue, score, notes${includeOperationalPayload ? ', lineups, events' : ''}, tournament_id, home_club_id, away_club_id, home_division_id, away_division_id,
        home:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, slug),
        away:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, slug),
        tournament:tournaments(id, name, slug)
    `;
    const matchFilter = buildMatchFilter(scopedClubIds);

    const [
        upcomingMatchesResult,
        pastMatchesResult,
        upcomingMatchesCountResult,
        playedMatchesCountResult,
        tournamentMatchesResult,
        participantTournamentsResult,
        standingsResult,
        selectedClubCoreResult,
        selectedClubProfileResult,
        sponsorsCountResult,
    ] = await Promise.all([
        supabase
            .from('matches')
            .select(matchSelect)
            .or(matchFilter)
            .gte('date_time', nowIso)
            .order('date_time', { ascending: true })
            .limit(20),
        supabase
            .from('matches')
            .select(matchSelect)
            .or(matchFilter)
            .in('status', [...FINAL_MATCH_STATUSES])
            .order('date_time', { ascending: false })
            .limit(150),
        supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .or(matchFilter)
            .gte('date_time', nowIso),
        supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .or(matchFilter)
            .in('status', [...FINAL_MATCH_STATUSES]),
        supabase
            .from('matches')
            .select(`
                tournament_id, date_time, status, phase_id, group_id, home_club_id, away_club_id, home_division_id, away_division_id
            `)
            .or(matchFilter)
            .not('tournament_id', 'is', null)
            .order('date_time', { ascending: false })
            .limit(200),
        supabase
            .from('tournament_participants')
            .select('tournament_id, group_id, status, club_id')
            .in('club_id', scopedClubIds)
            .not('tournament_id', 'is', null),
        supabase
            .from('tournament_standings')
            .select(`
                tournament_id, club_id, position, played, won, drawn, lost, points, scored, conceded,
                bonus_points, form, stats, phase_id, group_id, last_updated,
                tournament:tournaments(id, name, slug)
            `)
            .in('club_id', scopedClubIds)
            .order('last_updated', { ascending: false })
            .order('position', { ascending: true }),
        supabase
            .from('clubs')
            .select('*')
            .eq('id', clubId)
            .maybeSingle(),
        supabase
            .from('club_profile')
            .select('*')
            .eq('club_id', clubId)
            .maybeSingle(),
        supabase
            .from('club_sponsors')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', clubId),
    ]);

    if (upcomingMatchesResult.error) throw upcomingMatchesResult.error;
    if (pastMatchesResult.error) throw pastMatchesResult.error;
    if (upcomingMatchesCountResult.error) throw upcomingMatchesCountResult.error;
    if (playedMatchesCountResult.error) throw playedMatchesCountResult.error;
    if (tournamentMatchesResult.error) throw tournamentMatchesResult.error;
    if (participantTournamentsResult.error) throw participantTournamentsResult.error;
    if (standingsResult.error) throw standingsResult.error;
    if (selectedClubCoreResult.error) throw selectedClubCoreResult.error;
    if (selectedClubProfileResult.error && !isMissingTableError(selectedClubProfileResult.error)) {
        throw selectedClubProfileResult.error;
    }
    if (sponsorsCountResult.error && !isMissingTableError(sponsorsCountResult.error)) {
        throw sponsorsCountResult.error;
    }

    const tournamentMatchRows = (tournamentMatchesResult.data ?? []) as unknown as CompetitionMatchRow[];
    const participantRows = (participantTournamentsResult.data ?? []) as TournamentParticipantRow[];
    const standingsRows = (standingsResult.data ?? []) as unknown as StandingRow[];
    const clubCore = (selectedClubCoreResult.data ?? null) as ClubCore | null;
    const clubProfile = (selectedClubProfileResult.data ?? null) as ClubProfile | null;
    const sponsorsCount = sponsorsCountResult.count ?? 0;
    const divisionIds = Array.from(new Set(
        [...((upcomingMatchesResult.data ?? []) as MatchRow[]), ...((pastMatchesResult.data ?? []) as MatchRow[]), ...tournamentMatchRows]
            .flatMap((row) => [row.home_division_id, row.away_division_id])
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ));
    const divisionNameById = new Map<string, string>();

    if (divisionIds.length > 0) {
        const divisionsResult = await supabase
            .from('club_divisions')
            .select('id, name')
            .in('id', divisionIds);

        if (divisionsResult.error && !isMissingTableError(divisionsResult.error)) {
            throw divisionsResult.error;
        }

        for (const division of (divisionsResult.data ?? []) as DivisionRow[]) {
            divisionNameById.set(division.id, division.name ?? 'Division');
        }
    }

    const upcomingMatches = ((upcomingMatchesResult.data ?? []) as unknown as MatchRow[]).map((row) =>
        normalizeMatch(row, scopedClubIdSet, divisionNameById, includeOperationalPayload)
    );
    const pastMatches = ((pastMatchesResult.data ?? []) as unknown as MatchRow[]).map((row) =>
        normalizeMatch(row, scopedClubIdSet, divisionNameById, includeOperationalPayload)
    );
    const recentMatches = pastMatches.slice(0, 5);
    const allMatches = dedupeMatches([...upcomingMatches, ...pastMatches]);
    const clubLookup = new Map<string, ClubRow>(
        clubCore?.id ? [[clubCore.id, clubCore as unknown as ClubRow]] : []
    );
    const linkedTournamentIds = new Set(
        tournamentMatchRows
            .map((row) => row.tournament_id)
            .concat(participantRows.map((row) => row.tournament_id))
            .concat(standingsRows.map((row) => row.tournament_id))
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
    );
    const tournamentLookup = new Map<string, TournamentRow>();
    const tournamentPhasesByTournament = new Map<string, TournamentPhaseRow[]>();
    const tournamentGroupsByTournament = new Map<string, TournamentGroupRow[]>();
    const groupNameById = new Map<string, string>();

    if (linkedTournamentIds.size > 0) {
        const tournamentIds = Array.from(linkedTournamentIds);
        const [tournamentsResult, phasesResult] = await Promise.all([
            supabase
                .from('tournaments')
                .select('id, name, slug')
                .in('id', tournamentIds),
            supabase
                .from('tournament_phases')
                .select('id, tournament_id, name, phase_type, order_index, is_active')
                .in('tournament_id', tournamentIds),
        ]);

        if (tournamentsResult.error) {
            throw tournamentsResult.error;
        }
        if (phasesResult.error) {
            throw phasesResult.error;
        }

        for (const tournament of (tournamentsResult.data ?? []) as TournamentRow[]) {
            tournamentLookup.set(tournament.id, tournament);
        }

        const phases = (phasesResult.data ?? []) as TournamentPhaseRow[];
        const phaseToTournamentId = new Map(phases.map((phase) => [phase.id, phase.tournament_id]));

        for (const phase of phases) {
            const bucket = tournamentPhasesByTournament.get(phase.tournament_id) ?? [];
            bucket.push(phase);
            tournamentPhasesByTournament.set(phase.tournament_id, bucket);
        }

        if (phases.length > 0) {
            const groupsResult = await supabase
                .from('tournament_groups')
                .select('id, name, phase_id, order_index')
                .in('phase_id', phases.map((phase) => phase.id));

            if (groupsResult.error) {
                throw groupsResult.error;
            }

            for (const group of (groupsResult.data ?? []) as TournamentGroupRow[]) {
                const tournamentId = phaseToTournamentId.get(group.phase_id);
                if (!tournamentId) continue;

                if (group.name?.trim()) {
                    groupNameById.set(group.id, group.name.trim());
                }

                const bucket = tournamentGroupsByTournament.get(tournamentId) ?? [];
                bucket.push(group);
                tournamentGroupsByTournament.set(tournamentId, bucket);
            }
        }
    }

    const standings = dedupeStandings(
        linkedTournamentIds.size > 0
            ? standingsRows.filter((row) => linkedTournamentIds.has(row.tournament_id))
            : standingsRows,
        groupNameById
    );

    for (const standingRow of standingsRows) {
        const tournament = unwrapRelationRow(standingRow.tournament);
        if (tournament?.id) {
            tournamentLookup.set(tournament.id, tournament);
        }
    }

    const competitions = buildCompetitions({
        scopedClubIds: scopedClubIdSet,
        standingsRows,
        participantRows,
        tournamentMatchRows,
        tournamentLookup,
        tournamentPhasesByTournament,
        tournamentGroupsByTournament,
        clubLookup,
        divisionNameById,
    });

    const bestPosition = standings.reduce<number | null>((best, standing) => {
        if (standing.position == null) return best;
        if (best == null) return standing.position;
        return Math.min(best, standing.position);
    }, null);
    const health = buildHealthSnapshot({
        clubCore,
        clubProfile,
        competitionsCount: competitions.length,
        sponsorCount: sponsorsCount,
        totalMatches: allMatches.length,
    });

    return {
        stats: {
            upcomingMatches: upcomingMatchesCountResult.count ?? upcomingMatches.length,
            playedMatches: playedMatchesCountResult.count ?? pastMatches.length,
            tournaments: competitions.length,
            bestPosition,
        },
        health,
        upcomingMatches,
        recentMatches,
        pastMatches,
        standings,
        competitions,
        matches: allMatches,
    };
}
