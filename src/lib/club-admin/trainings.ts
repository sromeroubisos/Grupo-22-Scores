import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';
import type { ClubDashboardMatch, ClubDashboardOverview } from './dashboard-types';

export type TrainingStatus = 'planificado' | 'en_curso' | 'finalizado' | 'sin_evaluar';
export type TrainingType = 'campo' | 'gimnasio' | 'video' | 'recuperacion';
export type AttendanceState = 'confirmado' | 'ausente' | 'dudoso';
export type PlanBlockType = 'warmup' | 'tecnico' | 'tactico' | 'fisico' | 'cierre';

export interface PlanBlock {
    id: string;
    type: PlanBlockType;
    title: string;
    duration: number;
    notes: string;
    intensity?: string;
}

export interface TrainingPlan {
    blocks: PlanBlock[];
}

export interface TrainingEvaluation {
    rpe: number;
    durationReal: number;
    loadTotal: number;
    notes: string;
    energy: number;
    fatigue: number;
    injuries: string;
}

export interface TrainingPlayer {
    id: string;
    name: string;
    pos: string;
    divisionId: string | null;
    divisionName: string | null;
}

export interface TrainingEntry {
    id: string;
    persistedId?: string | null;
    sourceKey?: string | null;
    sourceKind?: string | null;
    divisionId?: string | null;
    title: string;
    date: string;
    duration: number;
    type: TrainingType;
    location: string;
    status: TrainingStatus;
    objective: string;
    staff: string[];
    convocados: number;
    players?: TrainingPlayer[];
    sourceLabel?: string | null;
    sourceMatchId?: string | null;
    plan?: TrainingPlan;
    evaluation?: TrainingEvaluation;
    attendance?: Record<string, AttendanceState>;
}

interface BuildClubTrainingEntriesArgs {
    dashboard: ClubDashboardOverview;
    divisions: Division[];
    players: PersonWithRole[];
    staff: PersonWithRole[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_DAYS = 21;
const RECOVERY_LOOKBACK_DAYS = 14;
const FIELD_LOCATION = 'Predio principal';
const VIDEO_LOCATION = 'Sala de video';
const RECOVERY_LOCATION = 'Area de recuperacion';

function normalizeText(value?: string | null) {
    return (value || '').trim().toLowerCase();
}

function getPersonName(person: PersonWithRole) {
    return person.full_name?.trim()
        || `${person.first_name || ''} ${person.last_name || ''}`.trim()
        || 'Sin nombre';
}

function toTrainingPlayer(person: PersonWithRole): TrainingPlayer {
    return {
        id: person.id,
        name: getPersonName(person),
        pos: person.position?.trim() || 'Sin puesto',
        divisionId: person.division_id || null,
        divisionName: person.division_name || null,
    };
}

function uniqueMatches(matches: ClubDashboardMatch[]) {
    const seen = new Map<string, ClubDashboardMatch>();

    for (const match of matches) {
        if (!match?.id || seen.has(match.id)) continue;
        seen.set(match.id, match);
    }

    return Array.from(seen.values());
}

function resolveClubDivision(match: ClubDashboardMatch) {
    return {
        id: match.isHome ? match.homeDivisionId : match.awayDivisionId,
        name: match.isHome ? match.homeDivisionName : match.awayDivisionName,
    };
}

function findDivision(divisions: Division[], divisionId: string | null, divisionName: string | null) {
    if (divisionId) {
        const byId = divisions.find((division) => division.id === divisionId || division.management_id === divisionId);
        if (byId) return byId;
    }

    const normalizedName = normalizeText(divisionName);
    if (!normalizedName) return null;

    return divisions.find((division) => {
        const candidates = [
            division.name,
            division.category,
            division.slug,
            division.legacy_division_id,
        ];

        return candidates.some((candidate) => normalizeText(candidate) === normalizedName);
    }) ?? null;
}

function matchesDivision(person: PersonWithRole, division: Division | null, divisionName: string | null) {
    if (!division && !divisionName) return false;

    if (division) {
        if (person.division_id && person.division_id === division.id) return true;
        if (person.division_id && division.management_id && person.division_id === division.management_id) return true;
    }

    const normalizedDivisionName = normalizeText(divisionName);
    if (!normalizedDivisionName) return false;

    return normalizeText(person.division_name) === normalizedDivisionName;
}

function resolveScopedPlayers(
    players: PersonWithRole[],
    division: Division | null,
    divisionName: string | null,
) {
    const scopedPlayers = players.filter((player) => matchesDivision(player, division, divisionName));
    const source = scopedPlayers.length > 0 ? scopedPlayers : players;
    return source.map(toTrainingPlayer);
}

function resolveScopedStaff(
    staff: PersonWithRole[],
    division: Division | null,
    divisionName: string | null,
) {
    const scopedStaff = staff.filter((person) => matchesDivision(person, division, divisionName));
    const source = scopedStaff.length > 0 ? scopedStaff : staff;
    return source
        .map(getPersonName)
        .filter(Boolean)
        .slice(0, 3);
}

function buildStatus(date: Date): TrainingStatus {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return date.getTime() < startOfToday.getTime() ? 'sin_evaluar' : 'planificado';
}

function buildUpcomingEntry(
    match: ClubDashboardMatch,
    divisions: Division[],
    players: PersonWithRole[],
    staff: PersonWithRole[],
): TrainingEntry | null {
    if (!match.dateTime) return null;

    const matchDate = new Date(match.dateTime);
    if (Number.isNaN(matchDate.getTime())) return null;

    const now = Date.now();
    const diffMs = matchDate.getTime() - now;
    if (diffMs < -DAY_MS || diffMs > UPCOMING_WINDOW_DAYS * DAY_MS) return null;

    const { id: divisionId, name: divisionName } = resolveClubDivision(match);
    const division = findDivision(divisions, divisionId, divisionName);
    const rosterPlayers = resolveScopedPlayers(players, division, divisionName);
    const staffNames = resolveScopedStaff(staff, division, divisionName);
    const opponentLabel = match.opponentShortName || match.opponentName || 'rival';
    const teamLabel = division?.name || divisionName || 'Plantel principal';

    const sessionDate = new Date(matchDate);
    let type: TrainingType = 'campo';
    let title = `Previa ${teamLabel} vs ${opponentLabel}`;
    let objective = `Ajustar el plan de juego para ${teamLabel} frente a ${opponentLabel}.`;
    let location = FIELD_LOCATION;
    let duration = 90;

    if (diffMs > 4 * DAY_MS) {
        sessionDate.setDate(sessionDate.getDate() - 3);
        sessionDate.setHours(19, 0, 0, 0);
        type = 'video';
        title = `Analisis ${teamLabel} vs ${opponentLabel}`;
        objective = `Analizar al rival ${opponentLabel} y preparar la semana competitiva.`;
        location = VIDEO_LOCATION;
        duration = 50;
    } else if (diffMs > DAY_MS) {
        sessionDate.setDate(sessionDate.getDate() - 2);
        sessionDate.setHours(19, 0, 0, 0);
    } else {
        sessionDate.setHours(11, 0, 0, 0);
        title = `Activacion ${teamLabel} vs ${opponentLabel}`;
        objective = `Repasar activacion y detalles finos antes del cruce con ${opponentLabel}.`;
        duration = 45;
    }

    return {
        id: `training-prep-${match.id}`,
        sourceKey: `training-prep-${match.id}`,
        sourceKind: 'match_prep',
        divisionId: division?.id || divisionId || null,
        title,
        date: sessionDate.toISOString(),
        duration,
        type,
        location,
        status: buildStatus(sessionDate),
        objective,
        staff: staffNames,
        convocados: rosterPlayers.length || division?.players_count || players.length,
        players: rosterPlayers,
        sourceLabel: match.tournament?.name || 'Calendario oficial',
        sourceMatchId: match.id,
    };
}

function buildRecoveryEntry(
    match: ClubDashboardMatch,
    divisions: Division[],
    players: PersonWithRole[],
    staff: PersonWithRole[],
): TrainingEntry | null {
    if (!match.dateTime) return null;

    const matchDate = new Date(match.dateTime);
    if (Number.isNaN(matchDate.getTime())) return null;

    const now = Date.now();
    const diffMs = now - matchDate.getTime();
    if (diffMs < 0 || diffMs > RECOVERY_LOOKBACK_DAYS * DAY_MS) return null;

    const { id: divisionId, name: divisionName } = resolveClubDivision(match);
    const division = findDivision(divisions, divisionId, divisionName);
    const rosterPlayers = resolveScopedPlayers(players, division, divisionName);
    const staffNames = resolveScopedStaff(staff, division, divisionName);
    const opponentLabel = match.opponentShortName || match.opponentName || 'rival';
    const teamLabel = division?.name || divisionName || 'Plantel principal';
    const sessionDate = new Date(matchDate);
    sessionDate.setDate(sessionDate.getDate() + 1);
    sessionDate.setHours(18, 0, 0, 0);

    return {
        id: `training-recovery-${match.id}`,
        sourceKey: `training-recovery-${match.id}`,
        sourceKind: 'match_recovery',
        divisionId: division?.id || divisionId || null,
        title: `Recuperacion ${teamLabel} post ${opponentLabel}`,
        date: sessionDate.toISOString(),
        duration: 60,
        type: 'recuperacion',
        location: RECOVERY_LOCATION,
        status: buildStatus(sessionDate),
        objective: `Bajar cargas y revisar el ultimo cruce frente a ${opponentLabel}.`,
        staff: staffNames,
        convocados: rosterPlayers.length || division?.players_count || players.length,
        players: rosterPlayers,
        sourceLabel: match.tournament?.name || 'Calendario oficial',
        sourceMatchId: match.id,
    };
}

export function buildClubTrainingEntries({
    dashboard,
    divisions,
    players,
    staff,
}: BuildClubTrainingEntriesArgs): TrainingEntry[] {
    const upcomingEntries = uniqueMatches(dashboard.upcomingMatches)
        .map((match) => buildUpcomingEntry(match, divisions, players, staff))
        .filter((entry): entry is TrainingEntry => Boolean(entry));

    const recoveryEntries = uniqueMatches([...dashboard.recentMatches, ...dashboard.pastMatches])
        .map((match) => buildRecoveryEntry(match, divisions, players, staff))
        .filter((entry): entry is TrainingEntry => Boolean(entry));

    return [...upcomingEntries, ...recoveryEntries]
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}
