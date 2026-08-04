'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Save, Share2, ChevronLeft, Layout, Users, Clock,
    BarChart2, Shield, Settings, ImageIcon, Plus, RefreshCw, X, Video, Search, AlertTriangle, CheckCircle,
    Play, Pause, RotateCcw, FileText
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
    buildMatchEventDefinitionMap,
    getDefaultMatchEventDefinitions,
    isEventDrivenScoreSport,
    resolveMatchEventDefinitions,
    type MatchEventDefinition,
} from '@/lib/matchEventCatalog';
import {
    isGoalKickEventType,
    formatGoalKickDetailPrefix,
    formatMatchTimelineEventDescription,
    goalKickEffectivenessPercent,
    minutesPlayedWhenSubstitutedOut,
    parseSubstitutionIncomingPlayer,
    teamKickAccuracyBreakdown,
} from '@/lib/matchEventStats';
import {
    countTeamOffensiveMetric,
    resolveOffensiveBonusRule,
    type NormalizedOffensiveBonusRule,
} from '@/lib/bonusRuleMetrics';
import {
    compareMatchPeriodValues,
    getEventPeriodForType,
    getMatchPeriodLabel,
    getNextActivePeriodAfterEvent,
    normalizeMatchPeriod,
} from '@/lib/matchPeriods';
import { formatClockSeconds, getPeriodOffsetSeconds, type MatchClockTransition } from '@/lib/matchClock';
import { useMatchClock } from '@/hooks/useMatchClock';
import {
    getConfiguredEventPoints,
    resolveScoringTeam,
    buildCompleteMatchStats,
    buildCompleteStatTabs,
} from '@/lib/matchStatsFromEvents';
import { exportMatchSheetPdf } from '@/lib/matchSheetPdf';
import {
    buildMatchPlayerSelectionGroups,
    findMatchPlayerSelectionOption,
    formatMatchPlayerOptionLabel,
    preserveMatchPlayerOption,
    type MatchPlayerSelectionGroups,
    type MatchPlayerSelectionOption,
} from '@/lib/matchPlayerSelection';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { calculateBasePointsFromScore } from '@/lib/standings/matchPoints';
import {
    APP_TIMEZONE,
    combineLocalDateTimeToUtcIso,
    formatDateInTimeZone,
    toInputDateInTimeZone,
    toInputTimeInTimeZone,
} from '@/lib/timezone';
import './match-center.css';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ TYPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface ClubInfo {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
}
interface TournamentInfo {
    id: string;
    name: string;
    logo_url?: string | null;
    logo?: string | null;
    sport_id?: string | null;
    sportId?: string | null;
}

interface MatchEvent {
    id: string;
    minute: number;
    type: string;
    team: 'home' | 'away' | null;
    playerId?: string | null;
    playerName: string;
    secondaryPlayerId?: string | null;
    secondaryPlayerName?: string | null;
    detail: string;
    period?: string | null;
    order?: number | null;
    sequence?: number | null;
}

function toDateTimeLocalInput(value: string | Date | null | undefined) {
    const date = toInputDateInTimeZone(value, APP_TIMEZONE);
    const time = toInputTimeInTimeZone(value, APP_TIMEZONE);
    return date && time ? `${date}T${time}` : '';
}

interface MatchLineups {
    home: LineupPlayer[];
    away: LineupPlayer[];
    [key: string]: unknown;
}

interface MatchRosterPlayer {
    personId: string;
    name: string;
    position: string | null;
    divisionId: string | null;
    squadMemberId: string | null;
    jerseyNumber: number | null;
}

interface LineupPlayer {
    id?: string;
    number: number;
    name: string;
    position?: string;
    role?: string;
    rating?: number | null;
    isCaptain?: boolean;
    squadMemberId?: string | null;
    divisionId?: string | null;
}

type QuickLineupEntry = {
    number: number | null;
    name: string;
    isCaptain: boolean;
};

interface MatchScore {
    home: number;
    away: number;
    penalties?: {
        home: number | null;
        away: number | null;
    } | null;
    homeTries?: number;
    awayTries?: number;
    notes?: string;
    manualOverride?: {
        home: number;
        away: number;
        cutoffMinute: number | null;
    } | null;
}

interface MatchClock {
    minute?: number;
    seconds?: number;
    period?: string;
    running?: boolean;
}

export interface MatchRow {
    id: string;
    tournament_id: string | null;
    phase_id: string | null;
    round_id: string | null;
    date_time: string | null;
    venue: string | null;
    notes?: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    status: string;
    score: MatchScore;
    clock: MatchClock | null;
    events: MatchEvent[] | null;
    lineups: MatchLineups | null;
    broadcast_url?: string | null;
    stream_url?: string | null;
    replay_url?: string | null;
    created_at: string;
    updated_at: string;
    homeClub?: ClubInfo | null;
    awayClub?: ClubInfo | null;
    tournament?: TournamentInfo | null;
    homeRoster?: MatchRosterPlayer[] | null;
    awayRoster?: MatchRosterPlayer[] | null;
    category?: string | null;
    roundLabel?: string | null;
    referee?: string | null;
    // Points per match
    home_base_points:       number | null;
    away_base_points:       number | null;
    home_bonus_points:      number | null;
    away_bonus_points:      number | null;
    points_autocalculated:  boolean | null;
    points_override_reason: string | null;
}

// preserveUnsavedClock era la curita del modelo snapshot: reinyectaba el draft
// vivo para que la respuesta del PATCH no rebobinara el reloj. Con el reloj
// derivado sobra: applyMatchResponse ya no toca el reloj.
type ApplyMatchResponseOptions = {
    preserveLineupsIfIncomingEmpty?: boolean;
    preserveUnsavedScore?: boolean;
    preserveUnsavedEvents?: boolean;
    preserveUnsavedLineups?: boolean;
};

type PersistMatchPatchOptions = {
    includePoints?: boolean;
    compactResponse?: boolean;
    eventsOverride?: MatchEvent[];
    preserveLineupsIfIncomingEmpty?: boolean;
    preserveUnsavedScore?: boolean;
    preserveUnsavedEvents?: boolean;
    preserveUnsavedLineups?: boolean;
    syncDirtyEvents?: boolean;
};

type PersistMatchWarnings = {
    lineupsNotPersisted?: boolean;
    clockNotPersisted?: boolean;
};

function normalizeMatchEvents(events: MatchRow['events']): MatchEvent[] {
    if (!Array.isArray(events)) return [];

    let activePeriod = normalizeMatchPeriod(null);

    return events.map((event, index) => {
        const detail = String(event.detail || '');
        const type = String(event.type || 'note');
        const secondaryPlayerName = event.secondaryPlayerName
            || (type === 'substitution' ? parseSubstitutionIncomingPlayer(detail) : '');
        const eventOrder = (event as unknown as Record<string, unknown>).order;
        const rawOrder = eventOrder === null || eventOrder === undefined || eventOrder === ''
            ? Number.NaN
            : Number(eventOrder);
        const period = event.period
            ? normalizeMatchPeriod(event.period)
            : getEventPeriodForType(type, activePeriod);
        const normalizedEvent = {
            ...event,
            type,
            period,
            order: Number.isFinite(rawOrder) ? rawOrder : index,
            secondaryPlayerId: event.secondaryPlayerId || null,
            secondaryPlayerName,
            detail: event.detail || (type === 'substitution' && secondaryPlayerName ? `Entra: ${secondaryPlayerName}` : ''),
        };
        activePeriod = getNextActivePeriodAfterEvent(type, period);
        return normalizedEvent;
    });
}

function normalizeMatchLineups(lineups: MatchRow['lineups']): MatchLineups {
    return lineups || { home: [], away: [] };
}

function normalizeMatchScore(score: MatchScore | null | undefined): MatchScore {
    const normalizedHomeTries = Number(score?.homeTries);
    const normalizedAwayTries = Number(score?.awayTries);
    const normalizedPenaltyHome =
        score?.penalties?.home === null || score?.penalties?.home === undefined
            ? Number.NaN
            : Number(score.penalties.home);
    const normalizedPenaltyAway =
        score?.penalties?.away === null || score?.penalties?.away === undefined
            ? Number.NaN
            : Number(score.penalties.away);
    const manualOverride = score?.manualOverride;
    const normalizedManualHome = Number(manualOverride?.home);
    const normalizedManualAway = Number(manualOverride?.away);
    const normalizedCutoffMinute =
        manualOverride?.cutoffMinute === null || manualOverride?.cutoffMinute === undefined
            ? null
            : Number(manualOverride.cutoffMinute);

    const home = Math.max(0, Number(score?.home) || 0);
    const away = Math.max(0, Number(score?.away) || 0);
    const penalties =
        home === away && Number.isFinite(normalizedPenaltyHome) && Number.isFinite(normalizedPenaltyAway)
            ? {
                home: Math.max(0, normalizedPenaltyHome),
                away: Math.max(0, normalizedPenaltyAway),
            }
            : null;

    return {
        home,
        away,
        penalties,
        homeTries: Number.isFinite(normalizedHomeTries) ? normalizedHomeTries : undefined,
        awayTries: Number.isFinite(normalizedAwayTries) ? normalizedAwayTries : undefined,
        notes: typeof score?.notes === 'string' ? score.notes : undefined,
        manualOverride:
            Number.isFinite(normalizedManualHome) && Number.isFinite(normalizedManualAway)
                ? {
                    home: Math.max(0, normalizedManualHome),
                    away: Math.max(0, normalizedManualAway),
                    cutoffMinute: Number.isFinite(normalizedCutoffMinute) ? normalizedCutoffMinute : null,
                }
                : null,
    };
}

// El reloj dejo de vivir aca. Todo lo que era snapshot (normalizeMatchClock,
// incrementMatchClock, areMatchClocksEqual, deriveClockFromKickoff...) se fue a
// @/lib/matchClock y useMatchClock, donde el valor se DERIVA contra el ancla del
// server en vez de incrementarse a mano cada segundo.

function normalizeTextValue(value: string | null | undefined) {
    return value?.trim() || '';
}

function areTextValuesEqual(left: string | null | undefined, right: string | null | undefined) {
    return normalizeTextValue(left) === normalizeTextValue(right);
}

function areMatchScoresEqual(left: MatchScore | null | undefined, right: MatchScore | null | undefined) {
    const normalizedLeft = normalizeMatchScore(left);
    const normalizedRight = normalizeMatchScore(right);

    return (
        normalizedLeft.home === normalizedRight.home
        && normalizedLeft.away === normalizedRight.away
        && (normalizedLeft.penalties?.home ?? null) === (normalizedRight.penalties?.home ?? null)
        && (normalizedLeft.penalties?.away ?? null) === (normalizedRight.penalties?.away ?? null)
        && (normalizedLeft.homeTries ?? null) === (normalizedRight.homeTries ?? null)
        && (normalizedLeft.awayTries ?? null) === (normalizedRight.awayTries ?? null)
        && (normalizedLeft.notes ?? '') === (normalizedRight.notes ?? '')
        && (normalizedLeft.manualOverride?.home ?? null) === (normalizedRight.manualOverride?.home ?? null)
        && (normalizedLeft.manualOverride?.away ?? null) === (normalizedRight.manualOverride?.away ?? null)
        && (normalizedLeft.manualOverride?.cutoffMinute ?? null) === (normalizedRight.manualOverride?.cutoffMinute ?? null)
    );
}

function getLatestEventMinute(events: MatchEvent[]) {
    if (events.length === 0) return null;
    return events.reduce((maxMinute, event) => Math.max(maxMinute, Number(event.minute) || 0), 0);
}

function buildScoreFromEvents(
    events: MatchEvent[],
    definitionMap: Record<string, MatchEventDefinition>,
    fallbackScore: MatchScore | null | undefined,
    options?: { fallbackToManualWhenEmpty?: boolean },
): MatchScore {
    const baseScore = normalizeMatchScore(fallbackScore);
    let home = 0;
    let away = 0;
    let homeTries = 0;
    let awayTries = 0;
    let hasScoringEvents = false;
    let hasTryEvents = false;

    events.forEach((event) => {
        const points = getConfiguredEventPoints(event, definitionMap);
        // El punto va al equipo que ANOTA, que en el gol en contra es el rival
        // del equipo al que se cargo el evento.
        const scoringTeam = event.team === 'home' || event.team === 'away'
            ? resolveScoringTeam(event.type, event.team, definitionMap)
            : null;

        if (points > 0 && scoringTeam === 'home') {
            home += points;
            hasScoringEvents = true;
        }
        if (points > 0 && scoringTeam === 'away') {
            away += points;
            hasScoringEvents = true;
        }

        if (event.type === 'try' && event.team === 'home') {
            homeTries += 1;
            hasTryEvents = true;
        }
        if (event.type === 'try' && event.team === 'away') {
            awayTries += 1;
            hasTryEvents = true;
        }
    });

    if (!hasScoringEvents) {
        if (options?.fallbackToManualWhenEmpty === false) {
            return {
                ...baseScore,
                home: 0,
                away: 0,
                homeTries: hasTryEvents ? homeTries : 0,
                awayTries: hasTryEvents ? awayTries : 0,
            };
        }
        return baseScore;
    }

    return {
        ...baseScore,
        home,
        away,
        homeTries: hasTryEvents ? homeTries : baseScore.homeTries,
        awayTries: hasTryEvents ? awayTries : baseScore.awayTries,
    };
}

function resolveScoreAgainstEvents(
    score: MatchScore | null | undefined,
    events: MatchEvent[],
    definitionMap: Record<string, MatchEventDefinition>,
) {
    const normalizedScore = normalizeMatchScore(score);
    const manualOverride = normalizedScore.manualOverride;

    if (!manualOverride) {
        return buildScoreFromEvents(events, definitionMap, normalizedScore);
    }

    const trailingEvents = events.filter((event) => (
        manualOverride.cutoffMinute === null || event.minute > manualOverride.cutoffMinute
    ));
    const trailingScore = buildScoreFromEvents(
        trailingEvents,
        definitionMap,
        { home: 0, away: 0, homeTries: 0, awayTries: 0 },
        { fallbackToManualWhenEmpty: false },
    );

    const baseHomeTries = Number.isFinite(normalizedScore.homeTries) ? Number(normalizedScore.homeTries) : null;
    const baseAwayTries = Number.isFinite(normalizedScore.awayTries) ? Number(normalizedScore.awayTries) : null;
    const trailingHomeTries = Number.isFinite(trailingScore.homeTries) ? Number(trailingScore.homeTries) : 0;
    const trailingAwayTries = Number.isFinite(trailingScore.awayTries) ? Number(trailingScore.awayTries) : 0;

    return {
        ...normalizedScore,
        home: manualOverride.home + trailingScore.home,
        away: manualOverride.away + trailingScore.away,
        homeTries: baseHomeTries === null && trailingHomeTries === 0 ? undefined : (baseHomeTries ?? 0) + trailingHomeTries,
        awayTries: baseAwayTries === null && trailingAwayTries === 0 ? undefined : (baseAwayTries ?? 0) + trailingAwayTries,
    };
}

function hasAnyLineupPlayers(lineups: MatchLineups | null | undefined) {
    return (lineups?.home.length ?? 0) > 0 || (lineups?.away.length ?? 0) > 0;
}

function areDraftValuesEqual(left: unknown, right: unknown) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Diff incremental de eventos contra el último set persistido, para mandar
 * `eventPatch` (upsert de lo cambiado + deleteIds) en vez del array completo
 * —que fuerza el reemplazo destructivo (select-all + upsert-all + delete-diff) y
 * la resolución de plantel sobre TODOS los eventos en el server—. Devuelve null
 * si algún evento no tiene id estable → el llamador cae al array completo.
 */
function buildEventsPatch(
    current: MatchEvent[],
    baseline: MatchEvent[],
): { upsert: MatchEvent[]; deleteIds: string[] } | null {
    const prev = new Map<string, string>();
    for (const event of baseline) {
        if (!event.id) return null;
        prev.set(event.id, JSON.stringify(event));
    }
    const currentIds = new Set<string>();
    for (const event of current) {
        if (!event.id) return null;
        currentIds.add(event.id);
    }
    const upsert = current.filter((event) => prev.get(event.id) !== JSON.stringify(event));
    const deleteIds = [...prev.keys()].filter((id) => !currentIds.has(id));
    return { upsert, deleteIds };
}

function areMatchPointsEqual(left: MatchPoints | null | undefined, right: MatchPoints | null | undefined) {
    return (
        Number(left?.home_base_points ?? 0) === Number(right?.home_base_points ?? 0)
        && Number(left?.away_base_points ?? 0) === Number(right?.away_base_points ?? 0)
        && Number(left?.home_bonus_points ?? 0) === Number(right?.home_bonus_points ?? 0)
        && Number(left?.away_bonus_points ?? 0) === Number(right?.away_bonus_points ?? 0)
        && Boolean(left?.points_autocalculated ?? true) === Boolean(right?.points_autocalculated ?? true)
        && String(left?.points_override_reason ?? '') === String(right?.points_override_reason ?? '')
    );
}

export interface MatchPoints {
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
}

type PlayerStatBreakdown = {
    type: string;
    label: string;
    count: number;
    pointsPerEvent: number;
    totalPoints: number;
    color: string;
};

type PlayerStatRow = {
    key: string;
    playerId: string | null;
    name: string;
    team: 'home' | 'away';
    totalEvents: number;
    scoringEvents: number;
    points: number;
    lastMinute: number;
    breakdown: PlayerStatBreakdown[];
};

type GuidedEventStep = 'team' | 'player' | 'details';
type GuidedGoalKickResult = 'made' | 'missed';
type GuidedContestOutcome = '' | 'won' | 'lost';

type GuidedEventDraft = {
    definition: MatchEventDefinition;
    step: GuidedEventStep;
    team: 'home' | 'away' | null;
    playerId: string | null;
    playerName: string;
    secondaryPlayerId: string | null;
    secondaryPlayerName: string;
    minute: string;
    period: string;
    detail: string;
    goalKickResult: GuidedGoalKickResult;
    contestOutcome: GuidedContestOutcome;
    isTemporary: boolean;
};

interface MatchCenterClientProps {
    initialMatch: MatchRow;
    matchId: string;
    onClose?: () => void;
    apiEndpoint?: string;
    backHref?: string;
    initialTab?: string;
}

type MatchCenterTabId =
    | 'resumen'
    | 'alineaciones'
    | 'eventos'
    | 'estadisticas'
    | 'contenido'
    | 'oficiales'
    | 'configuracion';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ TABS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const TABS = [
    { id: 'resumen', label: 'Resumen', icon: Layout },
    { id: 'alineaciones', label: 'Alineaciones', icon: Users },
    { id: 'eventos', label: 'Eventos', icon: Clock },
    { id: 'estadisticas', label: 'Estadisticas', icon: BarChart2 },
    { id: 'contenido', label: 'Contenido', icon: ImageIcon },
    { id: 'oficiales', label: 'Oficiales', icon: Users },
    { id: 'configuracion', label: 'Configuracion', icon: Settings },
];

function isMatchCenterTab(value: string | null | undefined): value is MatchCenterTabId {
    return TABS.some((tab) => tab.id === value);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function statusLabel(s: string): string {
    switch (s) {
        case 'final': return 'FINAL';
        case 'live': return 'EN VIVO';
        case 'scheduled': return 'PROGRAMADO';
        case 'postponed': return 'APLAZADO';
        case 'suspended': return 'SUSPENDIDO';
        case 'cancelled': return 'CANCELADO';
        default: return s.toUpperCase();
    }
}

function statusColor(s: string): string {
    switch (s) {
        case 'final': return '#888';
        case 'live': return '#ef4444';
        case 'scheduled': return 'var(--accent)';
        case 'suspended': return '#f97316';
        default: return '#f59e0b';
    }
}

function teamTag(evTeam: string | null): string {
    if (!evTeam) return '';
    return evTeam === 'home' ? '[L]' : '[V]';
}

const PENALTY_COMMITTED_EVENT_TYPE = 'penalty_committed';
const PENALTY_COMMITTED_REASONS = [
    'Tackle alto o peligroso',
    'Offside (fuera de juego)',
    'Derribar o bloquear a un jugador sin balon',
    'Juego sucio o conducta antideportiva',
    'Agresiones fisicas o verbales',
    'Colapsar intencionalmente un scrum',
    'Colapsar intencionalmente un maul',
    'Entrar lateralmente a un ruck',
    'No mantenerse de pie en ruck/maul',
    'Retener ilegalmente al portador del balon',
    'Usar las manos ilegalmente en el ruck',
    'Obstruccion',
    'No retirarse 10 metros tras un penal',
    'Cargar tarde al pateador',
    'Golpear intencionalmente la pelota hacia adelante (knock-on deliberado)',
    'Arrojar o sacar intencionalmente la pelota fuera del campo',
    'Acciones peligrosas o juego temerario',
];

function isPenaltyCommittedEvent(eventType: string) {
    return eventType === PENALTY_COMMITTED_EVENT_TYPE;
}

function getGuidedTeamQuestion(draft: GuidedEventDraft) {
    if (isPenaltyCommittedEvent(draft.definition.type)) {
        return 'Que club cometio el penal?';
    }

    return 'Que equipo registra este evento?';
}

function eventTypeLabel(t: string, definitions: MatchEventDefinition[]): string {
    const configured = definitions.find((definition) => definition.type === t);
    if (configured?.label) return configured.label;

    const map: Record<string, string> = {
        try: 'TRY', conversion: 'CONV', penalty_goal: 'PENAL', drop_goal: 'DROP',
        yellow_card: 'AMARILLA', red_card: 'ROJA', card_yellow: 'AMARILLA', card_red: 'ROJA',
        substitution: 'CAMBIO', start_period: 'INICIO', end_period: 'FIN', penalty: 'PENAL',
        penalty_try: 'PENAL TRY', scrum: 'SCRUM', line: 'LINE', knock_on: 'KNOCK-ON',
        forward_pass: 'PASE FWD', free_kick: 'FREE KICK', tackle: 'TACKLE', ruck: 'RUCK',
        maul: 'MAUL', handling_error: 'ERROR MANEJO', kick: 'PATADA', recovery: 'RECUP',
        turnover_won: 'RECUP', turnover_lost: 'PERDIDA', penalty_committed: 'PENAL COMETIDO',
        injury: 'LESION', pass: 'PASE',
        entradas_22: '22M',
        match_start: 'INICIO', match_half: 'HT', match_end: 'FINAL',
    };
    return map[t] || t.toUpperCase();
}

function eventTypeColor(t: string, definitions: MatchEventDefinition[]): string {
    const configured = definitions.find((definition) => definition.type === t);
    if (configured?.category === 'score') return 'var(--accent)';
    if (configured?.category === 'card' && (t === 'yellow_card' || t === 'card_yellow')) return '#eab308';
    if (configured?.category === 'card' && (t === 'red_card' || t === 'card_red')) return '#ef4444';

    if (t === 'try') return 'var(--accent)';
    if (t === 'yellow_card' || t === 'card_yellow') return '#eab308';
    if (t === 'red_card' || t === 'card_red') return '#ef4444';
    return '#fff';
}

function mergeMatchEventDefinitions(
    baseDefinitions: MatchEventDefinition[],
    overrideDefinitions: MatchEventDefinition[],
) {
    const merged = new Map<string, MatchEventDefinition>();

    baseDefinitions.forEach((definition) => merged.set(definition.type, definition));
    overrideDefinitions.forEach((definition) => merged.set(definition.type, definition));

    return Array.from(merged.values());
}

function getEventButtonGroup(definition: MatchEventDefinition) {
    if (definition.category === 'score') return 'Marcador';
    if (definition.category === 'card' || definition.category === 'discipline') return 'Disciplina';
    if (definition.category === 'substitution') return 'Plantel';
    if (definition.category === 'clock') return 'Reloj';
    return 'Juego';
}

function getEventButtonGlyph(type: string) {
    const glyphs: Record<string, string> = {
        try: 'TR',
        penalty_try: 'PT',
        conversion: 'CV',
        penalty: 'PN',
        penalty_goal: 'PN',
        drop_goal: 'DG',
        card_yellow: 'TA',
        card_red: 'TR',
        yellow_card: 'TA',
        red_card: 'TR',
        substitution: 'CA',
        injury: 'LE',
        scrum: 'SC',
        line: 'LI',
        knock_on: 'KO',
        forward_pass: 'PF',
        penalty_committed: 'PC',
        free_kick: 'FK',
        tackle: 'TK',
        ruck: 'RK',
        maul: 'ML',
        handling_error: 'EM',
        kick: 'PK',
        recovery: 'RC',
        turnover_won: 'TG',
        turnover_lost: 'TP',
        pass: 'PS',
        entradas_22: '22',
        match_start: 'IN',
        match_half: 'HT',
        match_end: 'FN',
    };

    return glyphs[type] || type.slice(0, 2).toUpperCase();
}

function getEventButtonLabel(definition: MatchEventDefinition) {
    const labels: Record<string, string> = {
        penalty_try: 'Try penal',
        conversion: 'Conversion',
        penalty: 'Penal a los palos',
        penalty_goal: 'Penal a los palos',
        drop_goal: 'Drop',
        card_yellow: 'Amarilla',
        card_red: 'Roja',
        yellow_card: 'Amarilla',
        red_card: 'Roja',
        knock_on: 'Knock-on',
        forward_pass: 'Pase forward',
        penalty_committed: 'Penal cometido',
        handling_error: 'Error manejo',
        turnover_won: 'Turnover ganado',
        turnover_lost: 'Turnover perdido',
        entradas_22: 'Entradas en 22',
        match_start: 'Inicio partido',
        match_half: 'Entretiempo',
        match_end: 'Final partido',
    };

    return labels[definition.type] || definition.label;
}

function getEventButtonMeta(definition: MatchEventDefinition) {
    if (isGoalKickEventType(definition.type)) return 'Convertida / fallada';
    if (isPenaltyCommittedEvent(definition.type)) return 'Club + motivo';
    if (definition.points > 0) return `${definition.points} puntos`;
    if (requiresContestOutcome(definition.type)) return 'Ganado / perdido';
    if (definition.type === 'substitution') return 'Sale / entra';
    if (definition.category === 'clock') return 'Sin jugador';
    return 'Equipo + jugador';
}

function getEventButtonTone(definition: MatchEventDefinition) {
    if (definition.category === 'score') return 'score';
    if (definition.category === 'card') return 'card';
    if (definition.category === 'discipline') return 'discipline';
    if (definition.category === 'clock') return 'clock';
    if (definition.category === 'substitution') return 'substitution';
    return 'game';
}

function requiresContestOutcome(eventType: string) {
    return eventType === 'scrum'
        || eventType === 'line'
        || eventType === 'ruck'
        || eventType === 'maul';
}

function formatGuidedEventDetail(draft: GuidedEventDraft) {
    const eventType = draft.definition.type;
    const baseLabel = draft.definition.label;
    const customDetail = draft.detail.trim();

    if (eventType === 'conversion') {
        const human = draft.goalKickResult === 'made' ? 'Conversion convertida' : 'Conversion fallada';
        const extra = customDetail ? ` | ${customDetail}` : '';
        return `${formatGoalKickDetailPrefix(draft.goalKickResult === 'made')} ${human}${extra}`;
    }

    if (eventType === 'penalty' || eventType === 'penalty_goal') {
        const human = draft.goalKickResult === 'made' ? 'Penal convertido' : 'Penal fallado';
        const extra = customDetail ? ` | ${customDetail}` : '';
        return `${formatGoalKickDetailPrefix(draft.goalKickResult === 'made')} ${human}${extra}`;
    }

    if (eventType === 'drop_goal') {
        const human = draft.goalKickResult === 'made' ? 'Drop convertido' : 'Drop fallado';
        const extra = customDetail ? ` | ${customDetail}` : '';
        return `${formatGoalKickDetailPrefix(draft.goalKickResult === 'made')} ${human}${extra}`;
    }

    if (requiresContestOutcome(eventType)) {
        if (draft.contestOutcome === 'won') return `${baseLabel} ganado`;
        if (draft.contestOutcome === 'lost') return `${baseLabel} perdido`;
    }

    if (eventType === 'substitution' && draft.secondaryPlayerName.trim()) {
        const temporalPrefix = draft.isTemporary ? '[temporal] ' : '';
        return `${temporalPrefix}Entra: ${draft.secondaryPlayerName.trim()}`;
    }

    if (eventType === 'try') {
        const parts = ['Try apoyado'];
        if (draft.secondaryPlayerName.trim()) parts.push(`Asiste: ${draft.secondaryPlayerName.trim()}`);
        if (customDetail) parts.push(customDetail);
        return parts.join(' | ');
    }

    if (eventType === 'recovery' || eventType === 'turnover_won') return customDetail || 'Recuperacion';
    if (eventType === 'turnover_lost') return customDetail || 'Perdida';
    if (isPenaltyCommittedEvent(eventType)) return customDetail ? `Penal cometido: ${customDetail}` : 'Penal cometido';
    if (eventType === 'knock_on') return customDetail || 'Knock-on';
    if (eventType === 'forward_pass') return customDetail || 'Pase forward';
    if (eventType === 'handling_error') return customDetail || 'Error de manejo';
    if (eventType === 'injury') return customDetail || 'Lesion';

    return customDetail || baseLabel;
}

/* â”€â”€â”€ POINTS HELPERS â”€â”€â”€ */
interface PointsRules {
    win: number;
    draw: number;
    loss: number;
    shootoutWin: number | null;
    shootoutLoss: number | null;
    offensive: NormalizedOffensiveBonusRule | null;
    defensive: {
        margin: number;
        points: number;
    } | null;
}

const DEFAULT_LINEUP_SIZE = 23;
const DEFAULT_POINTS_RULES: PointsRules = {
    win: 4,
    draw: 2,
    loss: 0,
    shootoutWin: null,
    shootoutLoss: null,
    offensive: null,
    defensive: null,
};
const COMMON_MATCH_PERIODS = ['Previa', '1T', 'HT', '2T', 'ET', 'Final'];
const EVENT_PERIOD_OPTIONS = ['1T', '2T', 'ET', 'FT'];

function normalizeEventOrder(value: unknown, fallback: number) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function getEventOrder(event: MatchEvent, fallback: number) {
    return normalizeEventOrder(event.order, fallback);
}

function getNextEventOrder(events: MatchEvent[]) {
    return events.reduce((maxOrder, event, index) => Math.max(maxOrder, getEventOrder(event, index)), -1) + 1;
}

function compareMatchEventsChronologically(
    left: MatchEvent,
    right: MatchEvent,
    leftIndex: number,
    rightIndex: number,
) {
    const periodDiff = compareMatchPeriodValues(left.period, right.period);
    if (periodDiff !== 0) return periodDiff;

    const orderDiff = getEventOrder(left, leftIndex) - getEventOrder(right, rightIndex);
    if (orderDiff !== 0) return orderDiff;

    const minuteDiff = (Number(left.minute) || 0) - (Number(right.minute) || 0);
    if (minuteDiff !== 0) return minuteDiff;

    const sequenceDiff = Number(left.sequence ?? 0) - Number(right.sequence ?? 0);
    if (sequenceDiff !== 0) return sequenceDiff;

    return String(left.id).localeCompare(String(right.id));
}

function sortMatchEventsChronologically(events: MatchEvent[]) {
    return events
        .map((event, index) => ({ event, index }))
        .sort((left, right) => compareMatchEventsChronologically(left.event, right.event, left.index, right.index))
        .map(({ event }) => event);
}

// getClockAfterEvent se fue a resolveClockTransitionForEvent (@/lib/matchClock).
// Ahora ramifica por TIPO DE EVENTO, no por cambio de periodo: el rebase se
// engancha al evento de arranque (INICIO 2T -> 40:00) y los de cierre pausan
// conservando el tiempo real corrido (FIN 1T a los 41:30 queda 41:30).

function getStatusAfterEvent(currentStatus: string, eventType: string) {
    if (eventType === 'match_start' || eventType === 'match_half' || eventType === 'start_period') return 'live';
    if (eventType === 'match_end') return 'final';
    return currentStatus;
}

function getPositiveInteger(value: string, fallback: number) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
}

function parsePointInput(value: string, fallback = 0) {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePointsRules(rawRules: ReturnType<typeof StandingsEngine.resolveRules> | null | undefined): PointsRules {
    const offensiveRule = rawRules?.offensive_bonus_rule;
    const defensiveRule = rawRules?.defensive_bonus_rule;
    const offensive = resolveOffensiveBonusRule(offensiveRule);

    const defensive =
        defensiveRule === true
            ? { margin: 7, points: 1 }
            : defensiveRule && typeof defensiveRule === 'object'
                ? {
                    margin: Number(defensiveRule.margin ?? 7),
                    points: Number(defensiveRule.points ?? defensiveRule.value ?? 1),
                }
                : null;

    return {
        win: Number(rawRules?.points_for_win ?? DEFAULT_POINTS_RULES.win),
        draw: Number(rawRules?.points_for_draw ?? DEFAULT_POINTS_RULES.draw),
        loss: Number(rawRules?.points_for_loss ?? DEFAULT_POINTS_RULES.loss),
        shootoutWin: Number.isFinite(Number(rawRules?.points_for_shootout_win))
            ? Number(rawRules?.points_for_shootout_win)
            : DEFAULT_POINTS_RULES.shootoutWin,
        shootoutLoss: Number.isFinite(Number(rawRules?.points_for_shootout_loss))
            ? Number(rawRules?.points_for_shootout_loss)
            : DEFAULT_POINTS_RULES.shootoutLoss,
        offensive: offensive && Number.isFinite(offensive.threshold) && Number.isFinite(offensive.points)
            ? offensive
            : null,
        defensive: defensive && Number.isFinite(defensive.margin) && Number.isFinite(defensive.points)
            ? defensive
            : null,
    };
}

function getLineupSize(lineups: MatchLineups | null | undefined) {
    const maxCount = Math.max(lineups?.home?.length ?? 0, lineups?.away?.length ?? 0);
    return maxCount > 0 ? maxCount : DEFAULT_LINEUP_SIZE;
}

function normalizeLineupRatingValue(value: unknown) {
    const parsed =
        typeof value === 'number' && Number.isFinite(value)
            ? value
            : typeof value === 'string'
                ? Number(value.replace(',', '.'))
                : Number.NaN;

    if (!Number.isFinite(parsed)) return null;
    const clamped = Math.min(10, Math.max(0, parsed));
    return Math.round(clamped * 10) / 10;
}

function formatLineupRatingInput(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '';
}

function buildLineupTemplate(count: number, existing: LineupPlayer[] = []): LineupPlayer[] {
    return Array.from({ length: count }, (_, index) => {
        const number = index + 1;
        const current = existing.find((player) => player.number === number);
        return {
            id: current?.id,
            number,
            name: current?.name ?? '',
            position: current?.position ?? '',
            role: current?.role ?? (number <= 15 ? 'starter' : 'substitute'),
            rating: normalizeLineupRatingValue(current?.rating ?? null),
            isCaptain: current?.isCaptain ?? false,
            squadMemberId: current?.squadMemberId ?? null,
            divisionId: current?.divisionId ?? null,
        };
    });
}

function findLineupPlayerIndex(players: LineupPlayer[], player: LineupPlayer) {
    return players.findIndex((entry) =>
        entry === player
        || (
            entry.number === player.number
            && normalizeLookupKey(entry.name) === normalizeLookupKey(player.name)
            && normalizeLookupKey(entry.role) === normalizeLookupKey(player.role)
        ));
}

function normalizeLookupKey(value: string | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripLeadingTeamAlias(value: string, aliases: string[]) {
    const normalizedValue = value.trim();
    const matchingAlias = aliases.find((alias) => {
        const normalizedAlias = normalizeLookupKey(alias);
        return normalizedAlias && normalizeLookupKey(normalizedValue).startsWith(`${normalizedAlias} `);
    });

    if (!matchingAlias) return normalizedValue;
    return normalizedValue
        .slice(matchingAlias.trim().length)
        .replace(/^[\s\-–—.)]+/, '')
        .trim();
}

function formatQuickLineupDraft(players: LineupPlayer[]) {
    return players
        .filter((player) => Boolean(player.name.trim()))
        .sort((left, right) => left.number - right.number)
        .map((player) => `${player.number} - ${player.name.trim()}${player.isCaptain ? ' (C)' : ''}`)
        .join('\n');
}

function parseQuickLineupDraft(value: string, teamAliases: string[] = []) {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const withoutBullet = line.replace(/^[\-*•]+\s*/, '');
            const captainPattern = /\((c|cap|captain)\)$/i;
            const isCaptain = captainPattern.test(withoutBullet);
            const normalizedLine = withoutBullet.replace(captainPattern, '').trim();
            const match = normalizedLine.match(/^(\d{1,2})\s*(?:[-.)]|–|—)?\s*(.+)$/);

            if (match) {
                return {
                    number: Number.parseInt(match[1], 10),
                    name: stripLeadingTeamAlias(match[2].trim(), teamAliases),
                    isCaptain,
                } satisfies QuickLineupEntry;
            }

            return {
                number: index + 1,
                name: stripLeadingTeamAlias(normalizedLine, teamAliases),
                isCaptain,
            } satisfies QuickLineupEntry;
        })
        .filter((entry) => Boolean(entry.name));
}

function normalizeRosterPlayers(roster: MatchRosterPlayer[] | null | undefined): MatchRosterPlayer[] {
    if (!Array.isArray(roster)) return [];

    const seen = new Set<string>();
    const normalized: MatchRosterPlayer[] = [];

    roster.forEach((entry) => {
        const personId = String(entry?.personId || '').trim();
        const name = String(entry?.name || '').trim();
        if (!personId || !name) return;

        const dedupeKey = `${personId}:${normalizeLookupKey(name)}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        normalized.push({
            personId,
            name,
            position: entry.position ?? null,
            divisionId: entry.divisionId ?? null,
            squadMemberId: entry.squadMemberId ?? null,
            jerseyNumber: typeof entry.jerseyNumber === 'number' && Number.isFinite(entry.jerseyNumber)
                ? entry.jerseyNumber
                : null,
        });
    });

    return normalized.sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));
}

function resolveRosterPlayerByName(roster: MatchRosterPlayer[], value: string) {
    const key = normalizeLookupKey(value);
    if (!key) return null;
    return roster.find((entry) => normalizeLookupKey(entry.name) === key) || null;
}

function buildLineupSelectionFromRoster(current: LineupPlayer, rosterEntry: MatchRosterPlayer): LineupPlayer {
    return {
        ...current,
        id: rosterEntry.personId,
        name: rosterEntry.name,
        position: rosterEntry.position || current.position || '',
        squadMemberId: rosterEntry.squadMemberId,
        divisionId: rosterEntry.divisionId,
        number: rosterEntry.jerseyNumber ?? current.number,
    };
}

function isEventPlayerAvailable(
    options: Array<{ playerId: string | null; name: string }>,
    value: string | null | undefined,
) {
    const key = normalizeLookupKey(value);
    if (!key) return false;
    return options.some((entry) => normalizeLookupKey(entry.name) === key);
}

type EventPlayerSelectMode = 'active' | 'substitute' | 'activeWithDisabledSubstitutes' | 'all';

function eventPlayerOptionMatchesName(option: MatchPlayerSelectionOption, value: string | null | undefined) {
    return normalizeLookupKey(option.name) === normalizeLookupKey(value);
}

function getEnabledEventPlayerOptions(groups: MatchPlayerSelectionGroups, mode: EventPlayerSelectMode) {
    if (mode === 'substitute') return groups.substitutes;
    if (mode === 'all') return [...groups.active, ...groups.substitutes];
    return groups.active;
}

function renderGroupedEventPlayerOptions({
    groups,
    players,
    mode,
    selectedValue,
    placeholder,
}: {
    groups: MatchPlayerSelectionGroups;
    players: LineupPlayer[];
    mode: EventPlayerSelectMode;
    selectedValue?: string | null;
    placeholder: string;
}) {
    const enabledOptions = getEnabledEventPlayerOptions(groups, mode);
    const selectedStillEnabled = enabledOptions.some((option) => eventPlayerOptionMatchesName(option, selectedValue));
    const selectedOption = !selectedStillEnabled && selectedValue
        ? findMatchPlayerSelectionOption(groups, selectedValue) || preserveMatchPlayerOption(players, groups, selectedValue)
        : null;

    return (
        <>
            {placeholder ? <option value="">{placeholder}</option> : null}
            {selectedOption ? (
                <optgroup label="Seleccionado en este evento">
                    <option value={selectedOption.name}>{formatMatchPlayerOptionLabel(selectedOption)}</option>
                </optgroup>
            ) : null}
            {mode !== 'substitute' && groups.active.length > 0 ? (
                <optgroup label="Titulares / activos">
                    {groups.active.map((player) => (
                        <option key={`active-${player.key}`} value={player.name}>
                            {formatMatchPlayerOptionLabel(player)}
                        </option>
                    ))}
                </optgroup>
            ) : null}
            {(mode === 'substitute' || mode === 'all') && groups.substitutes.length > 0 ? (
                <optgroup label="Suplentes disponibles">
                    {groups.substitutes.map((player) => (
                        <option key={`sub-${player.key}`} value={player.name}>
                            {formatMatchPlayerOptionLabel(player)}
                        </option>
                    ))}
                </optgroup>
            ) : null}
            {mode === 'activeWithDisabledSubstitutes' && groups.substitutes.length > 0 ? (
                <optgroup label="Suplentes disponibles">
                    {groups.substitutes.map((player) => (
                        <option key={`disabled-sub-${player.key}`} value={player.name} disabled>
                            {formatMatchPlayerOptionLabel(player)}
                        </option>
                    ))}
                </optgroup>
            ) : null}
        </>
    );
}

function isStarterLineupPlayer(player: LineupPlayer) {
    const role = String(player.role || '').trim().toLowerCase();
    return role === 'starter' || role === 'titular' || (!role && player.number <= 15);
}

function isSubstituteLineupPlayer(player: LineupPlayer) {
    const role = String(player.role || '').trim().toLowerCase();
    return role === 'substitute' || role === 'suplente' || (!role && player.number > 15);
}

function calculateAutocalculatedPoints(
    matchStatus: string,
    score: MatchScore,
    events: MatchEvent[],
    rules: PointsRules,
): MatchPoints {
    if (matchStatus !== 'final') {
        return {
            home_base_points: 0,
            away_base_points: 0,
            home_bonus_points: 0,
            away_bonus_points: 0,
            points_autocalculated: true,
            points_override_reason: '',
        };
    }

    let homeBase = rules.draw;
    let awayBase = rules.draw;
    let homeBonus = 0;
    let awayBonus = 0;

    const resolvedBasePoints = calculateBasePointsFromScore(score, rules);
    homeBase = resolvedBasePoints.home;
    awayBase = resolvedBasePoints.away;

    const homeOffensiveMetric = countTeamOffensiveMetric(score, events, 'home', rules.offensive);
    const awayOffensiveMetric = countTeamOffensiveMetric(score, events, 'away', rules.offensive);

    if (rules.offensive) {
        if (homeOffensiveMetric >= rules.offensive.threshold) homeBonus += rules.offensive.points;
        if (awayOffensiveMetric >= rules.offensive.threshold) awayBonus += rules.offensive.points;
    }

    if (rules.defensive) {
        if (score.home < score.away && (score.away - score.home) <= rules.defensive.margin) {
            homeBonus += rules.defensive.points;
        }
        if (score.away < score.home && (score.home - score.away) <= rules.defensive.margin) {
            awayBonus += rules.defensive.points;
        }
    }

    return {
        home_base_points: homeBase,
        away_base_points: awayBase,
        home_bonus_points: homeBonus,
        away_bonus_points: awayBonus,
        points_autocalculated: true,
        points_override_reason: '',
    };
}

async function fetchMatchConfiguration(
    match: Pick<MatchRow, 'phase_id' | 'round_id' | 'tournament_id'>,
): Promise<{ pointsRules: PointsRules; eventDefinitions: MatchEventDefinition[]; sportId: string | null }> {
    try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        let phaseId = match.phase_id;
        if (!phaseId && match.round_id) {
            const { data: round } = await supabase
                .from('tournament_rounds')
                .select('phase_id')
                .eq('id', match.round_id)
                .single();
            phaseId = round?.phase_id ?? null;
        }

        let phaseSettings: Record<string, unknown> | null = null;
        let tournamentId = match.tournament_id;

        if (phaseId) {
            const { data: phase } = await supabase
                .from('tournament_phases')
                .select('settings, tournament_id')
                .eq('id', phaseId)
                .single();

            phaseSettings = (phase?.settings as Record<string, unknown> | null) ?? null;
            tournamentId = phase?.tournament_id ?? tournamentId;
        }

        let tournamentRuleset: Record<string, unknown> | null = null;
        let tournamentSportId: string | null = null;
        if (tournamentId) {
            const { data: tournament } = await supabase
                .from('tournaments')
                .select('ruleset, sport_id')
                .eq('id', tournamentId)
                .single();
            tournamentRuleset = (tournament?.ruleset as Record<string, unknown> | null) ?? null;
            tournamentSportId = tournament?.sport_id ?? null;
        }

        return {
            pointsRules: normalizePointsRules(StandingsEngine.resolveRules(phaseSettings, tournamentRuleset)),
            eventDefinitions: resolveMatchEventDefinitions({
                sportId: tournamentSportId,
                phaseSettings,
                tournamentRuleset,
            }),
            sportId: tournamentSportId,
        };
    } catch {
        return {
            pointsRules: DEFAULT_POINTS_RULES,
            eventDefinitions: getDefaultMatchEventDefinitions(null),
            sportId: null,
        };
    }
}

function toPointPatchPayload(points: MatchPoints) {
    return {
        homeBasePoints: points.home_base_points ?? 0,
        awayBasePoints: points.away_base_points ?? 0,
        homeBonusPoints: points.home_bonus_points ?? 0,
        awayBonusPoints: points.away_bonus_points ?? 0,
        pointsAutocalculated: points.points_autocalculated ?? true,
        pointsOverrideReason: points.points_override_reason || null,
    };
}

function toLocalPoints(match: MatchRow): MatchPoints {
    return {
        home_base_points: match.home_base_points ?? 0,
        away_base_points: match.away_base_points ?? 0,
        home_bonus_points: match.home_bonus_points ?? 0,
        away_bonus_points: match.away_bonus_points ?? 0,
        points_autocalculated: match.points_autocalculated ?? true,
        points_override_reason: match.points_override_reason ?? '',
    };
}

function formatPointValue(value: number) {
    if (!Number.isFinite(value)) return '0';
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatPointBreakdown(base: number, bonus: number) {
    const baseText = formatPointValue(base);
    const bonusText = formatPointValue(bonus);
    return bonus > 0 ? `Base ${baseText} + bonus ${bonusText}` : `Base ${baseText}`;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ CLIENT COMPONENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function MatchCenterClient({
    initialMatch,
    matchId,
    onClose,
    apiEndpoint,
    backHref,
    initialTab,
}: MatchCenterClientProps) {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const resolvedMatchEndpoint = apiEndpoint || `/api/admin/matches/${matchId}`;
    const resolvedInitialTab = isMatchCenterTab(initialTab) ? initialTab : 'resumen';
    const initialEvents = normalizeMatchEvents(initialMatch.events);
    const initialLineups = normalizeMatchLineups(initialMatch.lineups);
    const initialScore = normalizeMatchScore(initialMatch.score);
    const [match, setMatch] = useState<MatchRow>(initialMatch);
    const [activeTab, setActiveTab] = useState<string>(resolvedInitialTab);
    const [statsPanelTab, setStatsPanelTab] = useState<string>('marcador');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);
    // Track the toast-clear timeout so we can cancel it on unmount and avoid
    // setState-after-unmount warnings (and a small memory leak per re-render).
    const saveMsgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleSaveMsgClear = useCallback((delayMs: number) => {
        if (saveMsgTimeoutRef.current) {
            clearTimeout(saveMsgTimeoutRef.current);
        }
        saveMsgTimeoutRef.current = setTimeout(() => {
            saveMsgTimeoutRef.current = null;
            setSaveMsg(null);
        }, delayMs);
    }, []);
    useEffect(() => {
        return () => {
            if (saveMsgTimeoutRef.current) {
                clearTimeout(saveMsgTimeoutRef.current);
                saveMsgTimeoutRef.current = null;
            }
        };
    }, []);
    const [scoreDraft, setScoreDraft] = useState<MatchScore>(initialScore);

    // Editable state for events & lineups (local mirrors of DB JSONB)
    const [localEvents, setLocalEvents] = useState<MatchEvent[]>(initialEvents);
    const [localLineups, setLocalLineups] = useState<MatchLineups>(initialLineups);
    const persistedMatchRef = useRef<MatchRow>(initialMatch);
    const matchDraftRef = useRef<MatchRow>(initialMatch);
    const persistedEventsRef = useRef<MatchEvent[]>(initialEvents);
    const persistedLineupsRef = useRef<MatchLineups>(initialLineups);
    const persistedScoreRef = useRef<MatchScore>(initialScore);
    const scoreDraftRef = useRef<MatchScore>(initialScore);
    const localEventsRef = useRef<MatchEvent[]>(initialEvents);
    const localLineupsRef = useRef<MatchLineups>(initialLineups);
    // Cola unica para todos los PATCH optimistas (evento + status en vivo). Si
    // corren en paralelo, la respuesta mas lenta pisa el estado de la mas rapida.
    const matchPatchQueueRef = useRef<Promise<unknown>>(Promise.resolve());

    // Editable state for per-match points
    const [localPoints, setLocalPoints] = useState<MatchPoints>(() => toLocalPoints(initialMatch));
    const [savingPoints, setSavingPoints] = useState(false);
    const [pointsRules, setPointsRules] = useState<PointsRules>(DEFAULT_POINTS_RULES);
    const [matchSportId, setMatchSportId] = useState<string | null>(
        initialMatch.tournament?.sport_id ?? initialMatch.tournament?.sportId ?? null,
    );

    /* ─── RELOJ (aislado: no comparte estado con match ni con los eventos) ─── */

    // Va por la misma cola que el resto de los PATCH optimistas, pero NO pasa
    // por persistMatchPatch: una transicion de reloj no recalcula puntos, ni
    // resuelve score, ni sincroniza eventos. Es el path caliente del partido en
    // vivo y tiene que ser lo mas corto posible.
    const persistClockTransition = useCallback(async (transition: MatchClockTransition) => {
        const endpoint = `${resolvedMatchEndpoint}${resolvedMatchEndpoint.includes('?') ? '&' : '?'}response=compact`;
        const run = matchPatchQueueRef.current
            .catch(() => {})
            .then(async () => {
                const res = await fetch(endpoint, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clockTransition: transition }),
                });
                const result = await res.json();
                if (!res.ok) {
                    throw new Error(result?.error || `HTTP ${res.status}`);
                }
                if (result?.matchCenterWarnings?.clockNotPersisted) {
                    setSaveMsg({ type: 'warn', text: 'El reloj no se pudo guardar en este entorno.' });
                    scheduleSaveMsgClear(4000);
                }
                return result?.clock ?? null;
            });

        matchPatchQueueRef.current = run.catch(() => {});
        return run;
    }, [resolvedMatchEndpoint, scheduleSaveMsgClear]);

    const clock = useMatchClock({
        initialClock: initialMatch.clock,
        sportId: matchSportId,
        kickoffIso: initialMatch.date_time,
        initialStatus: initialMatch.status,
        persistTransition: persistClockTransition,
    });
    // Para leer el controlador desde efectos de larga vida (realtime) sin
    // meterlo en sus deps ni recrear la suscripcion.
    const clockRef = useRef(clock);
    clockRef.current = clock;
    const [eventDefinitions, setEventDefinitions] = useState<MatchEventDefinition[]>(
        () => getDefaultMatchEventDefinitions(initialMatch.tournament?.sport_id ?? initialMatch.tournament?.sportId ?? null),
    );
    const [guidedEvent, setGuidedEvent] = useState<GuidedEventDraft | null>(null);
    const [lineupSizeInput, setLineupSizeInput] = useState(() => String(getLineupSize(initialMatch.lineups)));
    const [quickLineupDrafts, setQuickLineupDrafts] = useState<{ home: string; away: string }>(() => ({
        home: formatQuickLineupDraft(initialLineups.home),
        away: formatQuickLineupDraft(initialLineups.away),
    }));
    const [quickLineupDraftDirty, setQuickLineupDraftDirty] = useState<{ home: boolean; away: boolean }>({
        home: false,
        away: false,
    });
    const [dateTimeDraft, setDateTimeDraft] = useState(() => toDateTimeLocalInput(initialMatch.date_time));
    const availableEventDefinitions = useMemo(
        () => mergeMatchEventDefinitions(getDefaultMatchEventDefinitions(matchSportId ?? 'rugby'), eventDefinitions),
        [eventDefinitions, matchSportId],
    );
    const eventDefinitionMap = useMemo(() => buildMatchEventDefinitionMap(availableEventDefinitions), [availableEventDefinitions]);
    useEffect(() => {
        persistedEventsRef.current = normalizeMatchEvents(match.events);
    }, [match.events]);

    useEffect(() => {
        persistedLineupsRef.current = normalizeMatchLineups(match.lineups);
    }, [match.lineups]);

    useEffect(() => {
        localEventsRef.current = localEvents;
    }, [localEvents]);

    useEffect(() => {
        localLineupsRef.current = localLineups;
    }, [localLineups]);

    useEffect(() => {
        matchDraftRef.current = match;
    }, [match]);

    useEffect(() => {
        scoreDraftRef.current = scoreDraft;
    }, [scoreDraft]);

    useEffect(() => {
        setQuickLineupDrafts((prev) => ({
            home: quickLineupDraftDirty.home ? prev.home : formatQuickLineupDraft(localLineups.home),
            away: quickLineupDraftDirty.away ? prev.away : formatQuickLineupDraft(localLineups.away),
        }));
    }, [localLineups.away, localLineups.home, quickLineupDraftDirty.away, quickLineupDraftDirty.home]);

    const teamRosters = useMemo(() => ({
        home: normalizeRosterPlayers(match.homeRoster),
        away: normalizeRosterPlayers(match.awayRoster),
    }), [match.awayRoster, match.homeRoster]);

    const eventPlayerSelectionEvents = useMemo(() => sortMatchEventsChronologically(localEvents), [localEvents]);
    const eventPlayerSelections = useMemo(() => ({
        home: buildMatchPlayerSelectionGroups(localLineups.home, eventPlayerSelectionEvents, 'home'),
        away: buildMatchPlayerSelectionGroups(localLineups.away, eventPlayerSelectionEvents, 'away'),
    }), [eventPlayerSelectionEvents, localLineups.away, localLineups.home]);

    const eventPlayerOptions = useMemo(() => ({
        home: [...eventPlayerSelections.home.active, ...eventPlayerSelections.home.substitutes].map((entry) => ({
            playerId: entry.playerId,
            name: entry.name,
        })),
        away: [...eventPlayerSelections.away.active, ...eventPlayerSelections.away.substitutes].map((entry) => ({
            playerId: entry.playerId,
            name: entry.name,
        })),
    }), [eventPlayerSelections]);

    const lineupPlayerOptions = useMemo(() => {
        const homeGroups = buildMatchPlayerSelectionGroups(localLineups.home, [], 'home');
        const awayGroups = buildMatchPlayerSelectionGroups(localLineups.away, [], 'away');
        return {
            home: [...homeGroups.active, ...homeGroups.substitutes].map((entry) => ({
                playerId: entry.playerId,
                name: entry.name,
            })),
            away: [...awayGroups.active, ...awayGroups.substitutes].map((entry) => ({
                playerId: entry.playerId,
                name: entry.name,
            })),
        };
    }, [localLineups.away, localLineups.home]);

    const renderEventPlayerOptions = useCallback((
        team: 'home' | 'away',
        mode: EventPlayerSelectMode,
        selectedValue: string | null | undefined,
        placeholder: string,
    ) => renderGroupedEventPlayerOptions({
        groups: eventPlayerSelections[team],
        players: localLineups[team],
        mode,
        selectedValue,
        placeholder,
    }), [eventPlayerSelections, localLineups]);

    const updateLineupPlayerValue = useCallback((team: 'home' | 'away', player: LineupPlayer, nextName: string) => {
        setLocalLineups((prev) => {
            const updatedTeam = [...prev[team]];
            const realIdx = findLineupPlayerIndex(updatedTeam, player);
            if (realIdx < 0) return prev;

            const rosterEntry = resolveRosterPlayerByName(teamRosters[team], nextName);
            updatedTeam[realIdx] = rosterEntry
                ? buildLineupSelectionFromRoster(updatedTeam[realIdx], rosterEntry)
                : {
                    ...updatedTeam[realIdx],
                    id: undefined,
                    squadMemberId: null,
                    divisionId: updatedTeam[realIdx].divisionId ?? null,
                    name: nextName,
                };

            return { ...prev, [team]: updatedTeam };
        });
    }, [teamRosters]);

    const updateLineupPlayerRating = useCallback((team: 'home' | 'away', player: LineupPlayer, nextRating: string) => {
        setLocalLineups((prev) => {
            const updatedTeam = [...prev[team]];
            const realIdx = findLineupPlayerIndex(updatedTeam, player);
            if (realIdx < 0) return prev;

            updatedTeam[realIdx] = {
                ...updatedTeam[realIdx],
                rating: nextRating.trim() ? normalizeLineupRatingValue(nextRating) : null,
            };

            return { ...prev, [team]: updatedTeam };
        });
    }, []);

    const handleQuickLineupDraftChange = useCallback((team: 'home' | 'away', value: string) => {
        setQuickLineupDrafts((prev) => ({ ...prev, [team]: value }));
        setQuickLineupDraftDirty((prev) => ({ ...prev, [team]: true }));
    }, []);

    const resetQuickLineupDraft = useCallback((team: 'home' | 'away') => {
        setQuickLineupDrafts((prev) => ({
            ...prev,
            [team]: formatQuickLineupDraft(localLineupsRef.current[team]),
        }));
        setQuickLineupDraftDirty((prev) => ({ ...prev, [team]: false }));
    }, []);

    const applyQuickLineupDraft = useCallback((team: 'home' | 'away') => {
        const club = team === 'home' ? match.homeClub : match.awayClub;
        const parsedEntries = parseQuickLineupDraft(quickLineupDrafts[team], [
            club?.name || '',
            club?.short_name || '',
            team === 'home' ? 'local' : 'visitante',
            team === 'home' ? 'home' : 'away',
        ]);
        if (parsedEntries.length === 0) {
            setSaveMsg({ type: 'warn', text: 'Pegá al menos un jugador para aplicar la carga rápida.' });
            return;
        }

        const nextSize = Math.max(getLineupSize(localLineupsRef.current), parsedEntries.length);
        setLineupSizeInput(String(nextSize));
        setLocalLineups((prev) => {
            const nextHome = buildLineupTemplate(nextSize, team === 'home' ? [] : prev.home);
            const nextAway = buildLineupTemplate(nextSize, team === 'away' ? [] : prev.away);
            const updatedTeam = buildLineupTemplate(nextSize, []);

            parsedEntries.forEach((entry, index) => {
                const rosterEntry = resolveRosterPlayerByName(teamRosters[team], entry.name);
                const base = rosterEntry
                    ? buildLineupSelectionFromRoster(updatedTeam[index], rosterEntry)
                    : {
                        ...updatedTeam[index],
                        id: undefined,
                        squadMemberId: null,
                        divisionId: updatedTeam[index].divisionId ?? null,
                        name: entry.name,
                        position: updatedTeam[index].position ?? '',
                    };

                updatedTeam[index] = {
                    ...base,
                    name: rosterEntry?.name || entry.name,
                    number: entry.number ?? index + 1,
                    role: index < 15 ? 'starter' : 'substitute',
                    isCaptain: entry.isCaptain,
                };
            });

            const nextLineups = {
                home: team === 'home' ? updatedTeam : nextHome,
                away: team === 'away' ? updatedTeam : nextAway,
            };

            setQuickLineupDrafts((currentDrafts) => ({
                ...currentDrafts,
                [team]: formatQuickLineupDraft(nextLineups[team]),
            }));
            setQuickLineupDraftDirty((currentDirty) => ({
                ...currentDirty,
                [team]: false,
            }));
            return nextLineups;
        });

        setSaveMsg({ type: 'ok', text: `Lista rápida aplicada para ${team === 'home' ? 'local' : 'visitante'}. Guardá para persistir.` });
    }, [match.awayClub, match.homeClub, quickLineupDrafts, teamRosters]);

    const resolveEventPlayerSelection = useCallback((team: 'home' | 'away' | null, value: string) => {
        if (!team) {
            return {
                playerId: null,
                playerName: '',
            };
        }

        const selected = eventPlayerOptions[team].find((entry) => normalizeLookupKey(entry.name) === normalizeLookupKey(value));

        return selected
            ? {
                playerId: selected.playerId,
                playerName: selected.name,
            }
            : {
                playerId: null,
                playerName: '',
            };
    }, [eventPlayerOptions]);

    const applyMatchResponse = useCallback((nextMatch: MatchRow, options?: ApplyMatchResponseOptions) => {
        const nextEvents = normalizeMatchEvents(nextMatch.events);
        const nextLineups = normalizeMatchLineups(nextMatch.lineups);
        const nextScore = normalizeMatchScore(nextMatch.score);
        const currentLocalEvents = localEventsRef.current;
        const currentLocalLineups = localLineupsRef.current;
        const currentScoreDraft = scoreDraftRef.current;
        const hasUnsavedScore =
            options?.preserveUnsavedScore === true &&
            !areMatchScoresEqual(currentScoreDraft, persistedScoreRef.current);
        const hasUnsavedEvents =
            options?.preserveUnsavedEvents === true &&
            !areDraftValuesEqual(currentLocalEvents, persistedEventsRef.current);
        const hasUnsavedLineups =
            options?.preserveUnsavedLineups === true &&
            !areDraftValuesEqual(currentLocalLineups, persistedLineupsRef.current);
        const shouldKeepExistingLineups =
            options?.preserveLineupsIfIncomingEmpty === true &&
            !hasAnyLineupPlayers(nextLineups) &&
            hasAnyLineupPlayers(currentLocalLineups);
        const resolvedEvents = hasUnsavedEvents ? currentLocalEvents : nextEvents;
        const resolvedLineups =
            hasUnsavedLineups || shouldKeepExistingLineups
                ? currentLocalLineups
                : nextLineups;
        const resolvedScore = hasUnsavedScore ? currentScoreDraft : nextScore;

        // El reloj NO se toca aca. Vive en useMatchClock y solo cambia por un
        // handler explicito o por una respuesta de server mas nueva. Guardar un
        // evento ya no puede rebobinarlo ni frenarlo.
        persistedMatchRef.current = nextMatch;
        persistedEventsRef.current = nextEvents;
        persistedLineupsRef.current = nextLineups;
        persistedScoreRef.current = nextScore;
        localEventsRef.current = resolvedEvents;
        localLineupsRef.current = resolvedLineups;
        setMatch(nextMatch);
        setScoreDraft(resolvedScore);
        setLocalEvents(resolvedEvents);
        setLocalLineups(resolvedLineups);
        setLocalPoints(toLocalPoints(nextMatch));
        setLineupSizeInput(String(getLineupSize(resolvedLineups)));
        setDateTimeDraft(toDateTimeLocalInput(nextMatch.date_time));
    }, []);

    const resolveOfficialScore = useCallback((
        nextScore?: MatchScore | null,
        nextEvents?: MatchEvent[],
    ) => {
        return resolveScoreAgainstEvents(
            nextScore ?? scoreDraftRef.current,
            nextEvents ?? localEventsRef.current,
            eventDefinitionMap,
        );
    }, [eventDefinitionMap]);

    const resolveEventDerivedScore = useCallback((
        nextEvents?: MatchEvent[],
        fallbackScore?: MatchScore | null,
    ) => buildScoreFromEvents(
        nextEvents ?? localEventsRef.current,
        eventDefinitionMap,
        normalizeMatchScore(fallbackScore ?? scoreDraftRef.current),
        { fallbackToManualWhenEmpty: false },
    ), [eventDefinitionMap]);

    const getAutoPointsSnapshot = useCallback((
        nextScore?: MatchScore,
        nextEvents: MatchEvent[] = localEvents,
        nextStatus: string = match.status,
    ) => calculateAutocalculatedPoints(
        nextStatus,
        resolveOfficialScore(nextScore),
        nextEvents,
        pointsRules,
    ), [localEvents, match.status, pointsRules, resolveOfficialScore]);

    const buildPointsPatchPayload = useCallback((overrides?: {
        score?: MatchScore;
        events?: MatchEvent[];
        status?: string;
    }) => {
        if (localPoints.points_autocalculated === false) {
            return toPointPatchPayload({
                ...localPoints,
                points_autocalculated: false,
            });
        }

        return toPointPatchPayload(getAutoPointsSnapshot(
            overrides?.score,
            overrides?.events,
            overrides?.status,
        ));
    }, [getAutoPointsSnapshot, localPoints]);

    const buildPersistableMatchPayload = useCallback(() => {
        const payload: Record<string, unknown> = {};
        const persistedMatch = persistedMatchRef.current;
        const officialScore = resolveOfficialScore();

        if (match.status !== persistedMatch.status) {
            payload.status = match.status;
        }

        if (!areMatchScoresEqual(officialScore, persistedScoreRef.current)) {
            payload.score = officialScore;
        }

        // El reloj ya no viaja en este payload: se persiste solo, por intencion
        // (clockTransition), en el momento en que el operador lo toca.
        if ((match.venue || '') !== (persistedMatch.venue || '')) {
            payload.venue = match.venue || '';
        }

        const normalizedNotes = match.notes?.trim() || null;
        const persistedNotes = persistedMatch.notes?.trim() || null;
        if (normalizedNotes !== persistedNotes) {
            payload.notes = normalizedNotes;
        }

        if (dateTimeDraft) {
            const [date, time] = dateTimeDraft.split('T');
            const nextDateTime = combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
            if (nextDateTime && nextDateTime !== persistedMatch.date_time) {
                payload.dateTime = nextDateTime;
            }
        }

        return payload;
    }, [dateTimeDraft, match.notes, match.status, match.venue, resolveOfficialScore]);

    const persistMatchPatch = useCallback(async (
        payload: Record<string, unknown>,
        options?: PersistMatchPatchOptions,
    ) => {
        const hasUnsavedEvents = !areDraftValuesEqual(localEventsRef.current, persistedEventsRef.current);
        const shouldSyncDirtyEvents =
            options?.syncDirtyEvents === true &&
            !Object.prototype.hasOwnProperty.call(payload, 'events') &&
            hasUnsavedEvents;
        const effectivePayload = shouldSyncDirtyEvents
            ? {
                ...payload,
                events: localEventsRef.current,
            }
            : payload;
        const payloadIncludesEventPatch = Object.prototype.hasOwnProperty.call(effectivePayload, 'eventPatch');
        const effectiveEvents = options?.eventsOverride
            ? options.eventsOverride
            : Array.isArray(effectivePayload.events)
            ? effectivePayload.events as MatchEvent[]
            : localEventsRef.current;
        const payloadIncludesEvents = Object.prototype.hasOwnProperty.call(effectivePayload, 'events');
        const payloadUpdatesEvents = payloadIncludesEvents || payloadIncludesEventPatch;
        const payloadIncludesLineups = Object.prototype.hasOwnProperty.call(effectivePayload, 'lineups');
        const payloadIncludesScore = Object.prototype.hasOwnProperty.call(effectivePayload, 'score');
        const effectiveScore = resolveOfficialScore(
            payloadIncludesScore ? effectivePayload.score as MatchScore : undefined,
            effectiveEvents,
        );
        const payloadWithScore =
            payloadIncludesScore || payloadUpdatesEvents
                ? {
                    ...effectivePayload,
                    score: effectiveScore,
                }
                : effectivePayload;

        const shouldRecalculatePoints =
            options?.includePoints !== false
            && (
                payloadIncludesEvents
                || payloadIncludesEventPatch
                || payloadIncludesScore
                || typeof payloadWithScore.status === 'string'
            );

        let pointsPayload: Record<string, unknown> = {};
        if (shouldRecalculatePoints) {
            if (localPoints.points_autocalculated === false) {
                pointsPayload = buildPointsPatchPayload({
                    score: effectiveScore,
                    events: effectiveEvents,
                    status: typeof payloadWithScore.status === 'string' ? payloadWithScore.status : undefined,
                });
            } else {
                pointsPayload = toPointPatchPayload(calculateAutocalculatedPoints(
                    typeof payloadWithScore.status === 'string' ? payloadWithScore.status : match.status,
                    effectiveScore,
                    effectiveEvents,
                    pointsRules,
                ));
            }
        }

        const finalPayload = options?.includePoints === false
            ? payloadWithScore
            : {
                ...payloadWithScore,
                ...pointsPayload,
            };

        const requestEndpoint = options?.compactResponse
            ? `${resolvedMatchEndpoint}${resolvedMatchEndpoint.includes('?') ? '&' : '?'}response=compact`
            : resolvedMatchEndpoint;

        const res = await fetch(requestEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload),
        });

        const result = await res.json();
        if (!res.ok) {
            throw new Error(result?.error || `HTTP ${res.status}`);
        }

        const warnings = (result as { matchCenterWarnings?: PersistMatchWarnings } | null)?.matchCenterWarnings || {};
        const updatedMatch = options?.compactResponse
            ? {
                ...persistedMatchRef.current,
                ...(typeof payloadWithScore.status === 'string' ? { status: payloadWithScore.status } : {}),
                ...(typeof payloadWithScore.venue === 'string' ? { venue: payloadWithScore.venue } : {}),
                ...(Object.prototype.hasOwnProperty.call(payloadWithScore, 'notes') ? { notes: payloadWithScore.notes as string | null } : {}),
                ...(typeof payloadWithScore.dateTime === 'string' ? { date_time: payloadWithScore.dateTime } : {}),
                ...(payloadIncludesScore || payloadUpdatesEvents ? { score: effectiveScore } : {}),
                ...(payloadUpdatesEvents ? { events: effectiveEvents } : {}),
                ...(payloadIncludesLineups ? { lineups: effectivePayload.lineups as MatchLineups } : {}),
                ...(typeof finalPayload.homeBasePoints === 'number' ? { home_base_points: finalPayload.homeBasePoints } : {}),
                ...(typeof finalPayload.awayBasePoints === 'number' ? { away_base_points: finalPayload.awayBasePoints } : {}),
                ...(typeof finalPayload.homeBonusPoints === 'number' ? { home_bonus_points: finalPayload.homeBonusPoints } : {}),
                ...(typeof finalPayload.awayBonusPoints === 'number' ? { away_bonus_points: finalPayload.awayBonusPoints } : {}),
                ...(typeof finalPayload.pointsAutocalculated === 'boolean' ? { points_autocalculated: finalPayload.pointsAutocalculated } : {}),
                ...(Object.prototype.hasOwnProperty.call(finalPayload, 'pointsOverrideReason') ? { points_override_reason: finalPayload.pointsOverrideReason as string | null } : {}),
                updated_at: new Date().toISOString(),
            } as MatchRow
            : result as MatchRow;
        applyMatchResponse(updatedMatch, {
            preserveLineupsIfIncomingEmpty:
                options?.preserveLineupsIfIncomingEmpty
                ?? warnings.lineupsNotPersisted
                ?? false,
            preserveUnsavedScore: options?.preserveUnsavedScore ?? !payloadIncludesScore,
            preserveUnsavedEvents: options?.preserveUnsavedEvents ?? !payloadUpdatesEvents,
            preserveUnsavedLineups:
                options?.preserveUnsavedLineups
                ?? warnings.lineupsNotPersisted
                ?? !payloadIncludesLineups,
        });
        return {
            match: updatedMatch,
            warnings,
        };
    }, [applyMatchResponse, buildPointsPatchPayload, localPoints.points_autocalculated, match.status, pointsRules, resolvedMatchEndpoint, resolveOfficialScore]);

    useEffect(() => {
        if (isMatchCenterTab(initialTab)) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    /* â”€â”€â”€ REFRESH (for after saves / config changes) â”€â”€â”€ */
    const refreshMatchConfiguration = useCallback(async () => {
        const configuration = await fetchMatchConfiguration({
            phase_id: match.phase_id,
            round_id: match.round_id,
            tournament_id: match.tournament_id,
        });

        setPointsRules(configuration.pointsRules);
        setMatchSportId(configuration.sportId);
        setEventDefinitions(configuration.eventDefinitions);
    }, [match.phase_id, match.round_id, match.tournament_id]);

    /* â”€â”€â”€ POINTS: RECALCULATE & SAVE â”€â”€â”€ */
    useEffect(() => {
        void refreshMatchConfiguration();
    }, [refreshMatchConfiguration]);

    useEffect(() => {
        const handleConfigurationUpdate = (rawEvent: Event) => {
            const event = rawEvent as CustomEvent<{ tournamentId?: string }>;
            const nextTournamentId = event.detail?.tournamentId;
            if (nextTournamentId && nextTournamentId !== match.tournament_id) {
                return;
            }

            void refreshMatchConfiguration();
        };

        window.addEventListener('tournament:match-events-updated', handleConfigurationUpdate);
        return () => window.removeEventListener('tournament:match-events-updated', handleConfigurationUpdate);
    }, [match.tournament_id, refreshMatchConfiguration]);

    const handleRecalculate = useCallback(() => {
        setLocalPoints((prev) => {
            const next = getAutoPointsSnapshot();
            return areMatchPointsEqual(prev, next) ? prev : next;
        });
    }, [getAutoPointsSnapshot]);

    const handleSavePoints = useCallback(async () => {
        setSavingPoints(true);
        try {
            if (localPoints.points_autocalculated === false) {
                await persistMatchPatch(
                    toPointPatchPayload(localPoints),
                    { includePoints: false },
                );
            } else {
                const eventsPatch = buildEventsPatch(localEvents, persistedEventsRef.current);
                await persistMatchPatch({
                    status: match.status,
                    score: resolveOfficialScore(),
                    ...(eventsPatch ? { eventPatch: eventsPatch } : { events: localEvents }),
                });
            }
        } finally {
            setSavingPoints(false);
        }
    }, [localEvents, localPoints, match.status, persistMatchPatch, resolveOfficialScore]);

    // Reactive: recalculate whenever score/status/events change, only while in auto mode
    useEffect(() => {
        if (localPoints.points_autocalculated === false) return;
        setLocalPoints((prev) => {
            const next = getAutoPointsSnapshot();
            return areMatchPointsEqual(prev, next) ? prev : next;
        });
    }, [getAutoPointsSnapshot, localPoints.points_autocalculated]);

    /* â”€â”€â”€ REALTIME (live matches) â”€â”€â”€ */
    useEffect(() => {
        const channel = supabase
            .channel(`match-${matchId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'matches',
                filter: `id=eq.${matchId}`,
            }, (payload) => {
                const updated = payload.new as Record<string, unknown>;
                const incomingEvents = Array.isArray(updated.events) ? updated.events as MatchEvent[] : null;
                const incomingLineups = updated.lineups ? updated.lineups as MatchLineups : null;
                const currentPersistedMatch = persistedMatchRef.current;
                const currentDraftMatch = matchDraftRef.current;
                const hasUnsavedEvents = !areDraftValuesEqual(localEventsRef.current, persistedEventsRef.current);
                const hasUnsavedLineups = !areDraftValuesEqual(localLineupsRef.current, persistedLineupsRef.current);
                const hasUnsavedScore = !areMatchScoresEqual(scoreDraftRef.current, persistedScoreRef.current);
                const hasUnsavedStatus = currentDraftMatch.status !== currentPersistedMatch.status;
                const hasUnsavedVenue = (currentDraftMatch.venue || '') !== (currentPersistedMatch.venue || '');
                const hasUnsavedNotes = !areTextValuesEqual(currentDraftMatch.notes, currentPersistedMatch.notes);
                const hasUnsavedDateTime =
                    toDateTimeLocalInput(currentDraftMatch.date_time) !== toDateTimeLocalInput(currentPersistedMatch.date_time);
                const incomingScore = updated.score as MatchScore | undefined;
                const incomingClock = updated.clock as MatchClock | undefined;
                const nextPersistedMatch = { ...currentPersistedMatch, ...updated } as MatchRow;

                persistedMatchRef.current = nextPersistedMatch;
                setMatch((prev) => ({
                    ...prev,
                    ...updated,
                    status: hasUnsavedStatus ? prev.status : nextPersistedMatch.status,
                    venue: hasUnsavedVenue ? prev.venue : nextPersistedMatch.venue,
                    notes: hasUnsavedNotes ? prev.notes : nextPersistedMatch.notes,
                    date_time: hasUnsavedDateTime ? prev.date_time : nextPersistedMatch.date_time,
                } as MatchRow));
                if (incomingScore) {
                    const normalizedIncomingScore = normalizeMatchScore(incomingScore);
                    persistedScoreRef.current = normalizedIncomingScore;
                    if (!hasUnsavedScore) {
                        setScoreDraft(normalizedIncomingScore);
                    }
                }
                if (incomingClock !== undefined) {
                    // El hook decide: si hay transiciones en vuelo lo ignora, y
                    // si no, compara updated_at de server contra updated_at de
                    // server. Nunca contra una marca del dispositivo.
                    clockRef.current.applyServerClock(incomingClock);
                }
                if (incomingEvents) {
                    persistedEventsRef.current = incomingEvents;
                    if (!hasUnsavedEvents) {
                        localEventsRef.current = incomingEvents;
                        setLocalEvents(incomingEvents);
                    }
                }
                if (incomingLineups) {
                    persistedLineupsRef.current = incomingLineups;
                    if (!hasUnsavedLineups) {
                        localLineupsRef.current = incomingLineups;
                        setLocalLineups(incomingLineups);
                    }
                }
                if (
                    updated.home_base_points !== undefined ||
                    updated.away_base_points !== undefined ||
                    updated.home_bonus_points !== undefined ||
                    updated.away_bonus_points !== undefined ||
                    updated.points_autocalculated !== undefined ||
                    updated.points_override_reason !== undefined
                ) {
                    setLocalPoints((prev) => ({
                        home_base_points: Number(updated.home_base_points ?? prev.home_base_points ?? 0),
                        away_base_points: Number(updated.away_base_points ?? prev.away_base_points ?? 0),
                        home_bonus_points: Number(updated.home_bonus_points ?? prev.home_bonus_points ?? 0),
                        away_bonus_points: Number(updated.away_bonus_points ?? prev.away_bonus_points ?? 0),
                        points_autocalculated: Boolean(updated.points_autocalculated ?? prev.points_autocalculated ?? true),
                        points_override_reason: String(updated.points_override_reason ?? prev.points_override_reason ?? ''),
                    }));
                }
                if (!hasUnsavedDateTime) {
                    setDateTimeDraft(toDateTimeLocalInput(nextPersistedMatch.date_time));
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [matchId, supabase]);

    /* â”€â”€â”€ SAVE â”€â”€â”€ */
    const handleSave = async () => {
        if (!match) return;
        const payload = buildPersistableMatchPayload();
        if (eventsDirty) {
            const incompleteSubstitution = localEvents.find((event) => (
                event.type === 'substitution'
                && (!event.playerName.trim() || !event.secondaryPlayerName?.trim())
            ));

            if (incompleteSubstitution) {
                setSaveMsg({ type: 'warn', text: 'Completá jugador que sale y jugador que entra en todos los cambios antes de guardar.' });
                return;
            }

            // Diff incremental: mandamos solo lo cambiado/borrado (eventPatch) en
            // vez del array completo, que en el server fuerza el reemplazo
            // destructivo (select-all + upsert-all + delete-diff) y la resolución
            // de plantel sobre todos los eventos. Fallback al array completo solo
            // si algún evento no tiene id estable.
            const eventsPatch = buildEventsPatch(localEvents, persistedEventsRef.current);
            if (eventsPatch) {
                payload.eventPatch = eventsPatch;
            } else {
                payload.events = localEvents;
            }
        }
        if (lineupsDirty) {
            payload.lineups = localLineups;
        }
        if (Object.keys(payload).length === 0) {
            setSaveMsg({ type: 'ok', text: 'No hay cambios para guardar' });
            scheduleSaveMsgClear(2500);
            return;
        }

        setSaving(true);
        setSaveMsg(null);
        try {
            console.log('[MatchCenter] Saving via API - events:', localEvents.length, 'lineups home:', localLineups.home.length, 'away:', localLineups.away.length);

            const saveResult = await persistMatchPatch(
                payload,
                eventsDirty && !lineupsDirty
                    ? { compactResponse: true, eventsOverride: localEvents }
                    : undefined,
            );
            setSaveMsg(
                saveResult.warnings.lineupsNotPersisted
                    ? { type: 'warn', text: 'Se guardó el partido, pero este entorno no tiene almacenamiento para alineaciones.' }
                    : { type: 'ok', text: 'Guardado correctamente' },
            );
            scheduleSaveMsgClear(3000);
        } catch (err: unknown) {
            console.error('[MatchCenter] Save error:', err);
            setSaveMsg({ type: 'err', text: `Error de red: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setSaving(false);
        }
    };

    /* â”€â”€â”€ DERIVED DATA (all computed, zero hardcode) â”€â”€â”€ */
    // Aca vivian tres efectos del reloj, los tres borrados:
    //
    //  1. EL MATACABLE: forzaba running=false cada vez que match.status !== 'live'.
    //     Como cada guardado re-sincroniza `match` desde el server, un partido
    //     cuya fila no quedo 'live' apagaba el reloj al primer evento cargado.
    //     Si el reloj tiene que parar, ahora lo decide un handler explicito y no
    //     un efecto reactivo sobre el estado del partido.
    //  2. deriveClockFromKickoff reactivo -> ahora es semilla de MONTAJE dentro
    //     del hook, sin efecto que pueda volver a dispararse.
    //  3. el setInterval que incrementaba el snapshot -> el tick de render vive
    //     en useMatchClock y no muta nada: solo fuerza el recalculo contra el
    //     ancla del server.

    // Futbol: el resultado se construye solo con eventos. El input queda de
    // solo lectura y el handler no puede escribir un manualOverride ni por
    // accidente (teclado, autofill, un submit programatico).
    const isManualScoreLocked = isEventDrivenScoreSport(matchSportId);

    const handleScoreInputChange = useCallback((team: 'home' | 'away', value: string) => {
        if (isManualScoreLocked) return;

        const parsedValue = Math.max(0, Number.parseInt(value || '0', 10) || 0);
        const currentOfficialScore = resolveOfficialScore();
        const nextHome = team === 'home' ? parsedValue : currentOfficialScore.home;
        const nextAway = team === 'away' ? parsedValue : currentOfficialScore.away;
        const cutoffMinute = getLatestEventMinute(localEventsRef.current);

        setScoreDraft({
            ...currentOfficialScore,
            home: nextHome,
            away: nextAway,
            penalties: nextHome === nextAway ? currentOfficialScore.penalties ?? null : null,
            manualOverride: {
                home: nextHome,
                away: nextAway,
                cutoffMinute,
            },
        });
    }, [isManualScoreLocked, resolveOfficialScore]);

    const handlePenaltyInputChange = useCallback((team: 'home' | 'away', value: string) => {
        const currentOfficialScore = resolveOfficialScore();

        if (currentOfficialScore.home !== currentOfficialScore.away) {
            return;
        }

        const trimmedValue = value.trim();
        if (!trimmedValue) {
            setScoreDraft({
                ...currentOfficialScore,
                penalties: null,
            });
            return;
        }

        const parsedValue = Math.max(0, Number.parseInt(trimmedValue, 10) || 0);

        setScoreDraft({
            ...currentOfficialScore,
            penalties: {
                home: team === 'home' ? parsedValue : (currentOfficialScore.penalties?.home ?? 0),
                away: team === 'away' ? parsedValue : (currentOfficialScore.penalties?.away ?? 0),
            },
        });
    }, [resolveOfficialScore]);

    const updateLocalEvent = useCallback((eventId: string, patch: Partial<MatchEvent>) => {
        setLocalEvents((prev) =>
            prev.map((event) => (event.id === eventId ? { ...event, ...patch } : event)),
        );
    }, []);

    const removeLocalEvent = useCallback((eventId: string) => {
        setLocalEvents((prev) => prev.filter((event) => event.id !== eventId));
    }, []);

    // INICIAR/REANUDAR ponen el partido en vivo. Antes esto vivia SOLO en estado
    // local: la fila quedaba 'scheduled' en DB, con lo cual el partido no entraba
    // al feed liveOnly de /api/matches ni activaba el guard de status del prode.
    const ensureLiveStatus = useCallback(() => {
        setMatch((prev) => (prev.status === 'live' ? prev : { ...prev, status: 'live' }));

        if (persistedMatchRef.current.status === 'live') return;
        matchDraftRef.current = { ...matchDraftRef.current, status: 'live' };

        matchPatchQueueRef.current = matchPatchQueueRef.current
            .catch(() => {})
            .then(async () => {
                if (persistedMatchRef.current.status === 'live') return;
                try {
                    await persistMatchPatch({ status: 'live' }, { compactResponse: true });
                } catch (err: unknown) {
                    setSaveMsg({
                        type: 'err',
                        text: `No se pudo marcar el partido en vivo: ${err instanceof Error ? err.message : String(err)}`,
                    });
                    scheduleSaveMsgClear(5000);
                }
            });
    }, [persistMatchPatch, scheduleSaveMsgClear]);

    const reportClockError = useCallback((err: unknown) => {
        setSaveMsg({
            type: 'err',
            text: `No se pudo actualizar el reloj: ${err instanceof Error ? err.message : String(err)}`,
        });
        scheduleSaveMsgClear(5000);
    }, [scheduleSaveMsgClear]);

    const handleStartClock = useCallback(() => {
        ensureLiveStatus();
        clock.start().catch(reportClockError);
    }, [clock, ensureLiveStatus, reportClockError]);

    const handlePauseClock = useCallback(() => {
        clock.pause().catch(reportClockError);
    }, [clock, reportClockError]);

    const handleResumeClock = useCallback(() => {
        ensureLiveStatus();
        clock.start().catch(reportClockError);
    }, [clock, ensureLiveStatus, reportClockError]);

    const handleResetClock = useCallback(() => {
        clock.reset().catch(reportClockError);
    }, [clock, reportClockError]);

    const openGuidedEvent = useCallback((definition: MatchEventDefinition) => {
        // Minuto CALCULADO contra el ancla, no leido de un snapshot.
        const minute = clock.readEventMinute();
        const period = getEventPeriodForType(definition.type, clock.period);

        setGuidedEvent({
            definition,
            step: definition.team === 'none' ? 'details' : 'team',
            team: definition.team === 'none' ? null : 'home',
            playerId: null,
            playerName: '',
            secondaryPlayerId: null,
            secondaryPlayerName: '',
            minute: String(minute),
            period,
            detail: '',
            goalKickResult: 'made',
            contestOutcome: requiresContestOutcome(definition.type) ? 'won' : '',
            isTemporary: false,
        });
    }, [clock]);

    const selectGuidedTeam = useCallback((team: 'home' | 'away') => {
        setGuidedEvent((current) => {
            if (!current) return current;
            return {
                ...current,
                team,
                playerId: null,
                playerName: '',
                secondaryPlayerId: null,
                secondaryPlayerName: '',
                step: current.definition.player === 'none' ? 'details' : 'player',
            };
        });
    }, []);

    const selectGuidedPlayer = useCallback((player: { playerId: string | null; name: string } | null) => {
        setGuidedEvent((current) => {
            if (!current) return current;
            return {
                ...current,
                playerId: player?.playerId ?? null,
                playerName: player?.name ?? '',
                step: 'details',
            };
        });
    }, []);

    const selectGuidedSecondaryPlayer = useCallback((value: string) => {
        setGuidedEvent((current) => {
            if (!current || !current.team) return current;

            const selected = eventPlayerOptions[current.team].find((entry) => entry.name === value);
            return {
                ...current,
                secondaryPlayerId: selected?.playerId ?? null,
                secondaryPlayerName: selected?.name ?? '',
            };
        });
    }, [eventPlayerOptions]);

    const saveGuidedEvent = useCallback(() => {
        if (!guidedEvent) return;

        if (guidedEvent.definition.team === 'required' && !guidedEvent.team) {
            setSaveMsg({ type: 'warn', text: 'Selecciona un equipo antes de guardar el evento.' });
            return;
        }

        if (isPenaltyCommittedEvent(guidedEvent.definition.type) && !guidedEvent.detail.trim()) {
            setSaveMsg({ type: 'warn', text: 'Selecciona por que se comete el penal antes de guardar.' });
            return;
        }

        if (guidedEvent.definition.player === 'required' && !guidedEvent.playerName.trim()) {
            setSaveMsg({ type: 'warn', text: 'Selecciona un jugador antes de guardar el evento.' });
            return;
        }

        if (guidedEvent.definition.type === 'substitution') {
            if (!guidedEvent.playerName.trim()) {
                setSaveMsg({ type: 'warn', text: 'Selecciona el jugador que sale antes de guardar el cambio.' });
                return;
            }
            if (!guidedEvent.secondaryPlayerName.trim()) {
                setSaveMsg({ type: 'warn', text: 'Selecciona el jugador que entra antes de guardar el cambio.' });
                return;
            }
            if (guidedEvent.playerName.trim().toLowerCase() === guidedEvent.secondaryPlayerName.trim().toLowerCase()) {
                setSaveMsg({ type: 'warn', text: 'El jugador que entra debe ser distinto al que sale.' });
                return;
            }
        }

        // El minuto que se persiste es el CALCULADO al momento del click contra
        // el ancla del server, no el estado del reloj ni lo que quedo en el form.
        const minute = clock.readEventMinute();
        const eventPeriod = getEventPeriodForType(guidedEvent.definition.type, clock.period || guidedEvent.period);
        const previousEvents = localEventsRef.current;
        const nextEvent: MatchEvent = {
            id: crypto.randomUUID(),
            minute,
            period: eventPeriod,
            order: getNextEventOrder(previousEvents),
            type: guidedEvent.definition.type,
            team: guidedEvent.definition.team === 'none' ? null : guidedEvent.team,
            playerId: guidedEvent.definition.player === 'none' ? null : guidedEvent.playerId,
            playerName: guidedEvent.definition.player === 'none' ? '' : guidedEvent.playerName.trim(),
            secondaryPlayerId: guidedEvent.secondaryPlayerName.trim() ? guidedEvent.secondaryPlayerId : null,
            secondaryPlayerName: guidedEvent.secondaryPlayerName.trim(),
            detail: formatGuidedEventDetail(guidedEvent),
        };
        const nextEvents = [...previousEvents, nextEvent];
        const previousStatus = matchDraftRef.current.status;
        const nextStatus = getStatusAfterEvent(previousStatus, guidedEvent.definition.type);
        const statusChanged = nextStatus !== matchDraftRef.current.status;
        // Los eventos de reloj (FIN 1T, INICIO 2T, FINAL) disparan su propia
        // transicion, por su propio canal. El guardado del evento no toca el
        // reloj ni de casualidad.
        const clockTransition = clock.resolveEventTransition(guidedEvent.definition.type);

        localEventsRef.current = nextEvents;
        setLocalEvents(nextEvents);
        if (statusChanged) {
            setMatch((current) => ({ ...current, status: nextStatus }));
        }
        // Optimista: el composer se cierra y se muestra éxito AL INSTANTE; el
        // guardado va en background (no bloquea), serializado para no pisar
        // saves concurrentes. Rollback por-id si falla.
        setGuidedEvent(null);
        setSaveMsg({ type: 'ok', text: 'Evento guardado.' });
        scheduleSaveMsgClear(3000);

        if (clockTransition) {
            clock.runTransition(clockTransition).catch(reportClockError);
        }

        const payload = {
            eventPatch: { upsert: [nextEvent] },
            ...(statusChanged ? { status: nextStatus } : {}),
        };
        matchPatchQueueRef.current = matchPatchQueueRef.current
            .catch(() => {})
            .then(async () => {
                try {
                    const saveResult = await persistMatchPatch(
                        payload,
                        { compactResponse: true, eventsOverride: nextEvents, preserveUnsavedEvents: true },
                    );
                    if (saveResult.warnings.lineupsNotPersisted) {
                        setSaveMsg({ type: 'warn', text: 'Evento guardado. Las alineaciones no se persistieron en este entorno.' });
                        scheduleSaveMsgClear(3000);
                    }
                } catch (err: unknown) {
                    localEventsRef.current = localEventsRef.current.filter((event) => event.id !== nextEvent.id);
                    setLocalEvents(localEventsRef.current);
                    setSaveMsg({ type: 'err', text: `No se pudo guardar el evento: ${err instanceof Error ? err.message : String(err)}` });
                }
            });
    }, [clock, guidedEvent, persistMatchPatch, reportClockError, scheduleSaveMsgClear]);

    const applyLineupSize = useCallback((requestedSize?: number) => {
        const nextSize = requestedSize ?? getPositiveInteger(lineupSizeInput, getLineupSize(localLineups));
        setLineupSizeInput(String(nextSize));
        setLocalLineups((prev) => ({
            home: buildLineupTemplate(nextSize, prev.home),
            away: buildLineupTemplate(nextSize, prev.away),
        }));
    }, [lineupSizeInput, localLineups]);

    // Fill a team's planilla straight from its tournament roster (the fixed
    // 23 when the tournament uses plantel fijo, or the full squad otherwise).
    const importTeamRoster = useCallback((team: 'home' | 'away') => {
        const roster = teamRosters[team];
        const teamLabel = team === 'home' ? 'local' : 'visitante';
        if (roster.length === 0) {
            setSaveMsg({
                type: 'warn',
                text: `No hay plantel cargado para el ${teamLabel}. Cargá el plantel del torneo primero.`,
            });
            return;
        }

        const nextSize = Math.max(
            getLineupSize(localLineupsRef.current),
            roster.length,
            DEFAULT_LINEUP_SIZE,
        );
        setLineupSizeInput(String(nextSize));
        setLocalLineups((prev) => {
            const updatedTeam = buildLineupTemplate(nextSize, []);
            roster.forEach((rosterEntry, index) => {
                updatedTeam[index] = {
                    ...buildLineupSelectionFromRoster(updatedTeam[index], rosterEntry),
                    number: rosterEntry.jerseyNumber ?? index + 1,
                    role: index < 15 ? 'starter' : 'substitute',
                };
            });
            const nextLineups = {
                home: team === 'home' ? updatedTeam : buildLineupTemplate(nextSize, prev.home),
                away: team === 'away' ? updatedTeam : buildLineupTemplate(nextSize, prev.away),
            };
            setQuickLineupDrafts((currentDrafts) => ({
                ...currentDrafts,
                [team]: formatQuickLineupDraft(nextLineups[team]),
            }));
            setQuickLineupDraftDirty((currentDirty) => ({ ...currentDirty, [team]: false }));
            return nextLineups;
        });

        setSaveMsg({
            type: 'ok',
            text: `Plantel del ${teamLabel} importado (${roster.length} jugadores). Guardá para persistir.`,
        });
    }, [teamRosters]);

    // Import both teams' rosters in a single update.
    const importAllRosters = useCallback(() => {
        const homeRoster = teamRosters.home;
        const awayRoster = teamRosters.away;
        if (homeRoster.length === 0 && awayRoster.length === 0) {
            setSaveMsg({
                type: 'warn',
                text: 'No hay plantel cargado para ninguno de los equipos. Cargá los planteles del torneo primero.',
            });
            return;
        }

        const nextSize = Math.max(
            getLineupSize(localLineupsRef.current),
            homeRoster.length,
            awayRoster.length,
            DEFAULT_LINEUP_SIZE,
        );
        setLineupSizeInput(String(nextSize));

        const fillFromRoster = (roster: MatchRosterPlayer[]) => {
            const template = buildLineupTemplate(nextSize, []);
            roster.forEach((rosterEntry, index) => {
                template[index] = {
                    ...buildLineupSelectionFromRoster(template[index], rosterEntry),
                    number: rosterEntry.jerseyNumber ?? index + 1,
                    role: index < 15 ? 'starter' : 'substitute',
                };
            });
            return template;
        };

        setLocalLineups((prev) => {
            const nextLineups = {
                home: homeRoster.length > 0 ? fillFromRoster(homeRoster) : buildLineupTemplate(nextSize, prev.home),
                away: awayRoster.length > 0 ? fillFromRoster(awayRoster) : buildLineupTemplate(nextSize, prev.away),
            };
            setQuickLineupDrafts({
                home: formatQuickLineupDraft(nextLineups.home),
                away: formatQuickLineupDraft(nextLineups.away),
            });
            setQuickLineupDraftDirty({ home: false, away: false });
            return nextLineups;
        });

        const parts: string[] = [];
        if (homeRoster.length > 0) parts.push(`local (${homeRoster.length})`);
        if (awayRoster.length > 0) parts.push(`visitante (${awayRoster.length})`);
        setSaveMsg({
            type: 'ok',
            text: `Plantel importado: ${parts.join(' y ')}. Guardá para persistir.`,
        });
    }, [teamRosters]);

    const score = useMemo(() => resolveOfficialScore(scoreDraft, localEvents), [localEvents, resolveOfficialScore, scoreDraft]);
    const eventDerivedScore = useMemo(() => resolveEventDerivedScore(localEvents, score), [localEvents, resolveEventDerivedScore, score]);
    const events = localEvents;
    const lineups = localLineups;
    const eventsChronologicalAsc = useMemo(
        () => sortMatchEventsChronologically(events),
        [events],
    );
    // Indice por id para no hacer findIndex dentro del map de eventos al
    // renderizar (era una busqueda lineal por cada cambio y por cada fila
    // del timeline).
    const chronologicalIndexById = useMemo(() => {
        const map = new Map<string, number>();
        eventsChronologicalAsc.forEach((event, index) => {
            map.set(event.id, index);
        });
        return map;
    }, [eventsChronologicalAsc]);
    const eventScoreById = useMemo(() => {
        const map = new Map<string, { home: number; away: number; points: number }>();
        const normalizedScore = normalizeMatchScore(scoreDraft);
        const manualOverride = normalizedScore.manualOverride;
        let home = manualOverride ? manualOverride.home : 0;
        let away = manualOverride ? manualOverride.away : 0;
        let hasScoringEvents = false;

        eventsChronologicalAsc.forEach((event) => {
            const points = getConfiguredEventPoints(event, eventDefinitionMap);
            const countsForScore =
                points > 0
                && (manualOverride?.cutoffMinute === null || manualOverride?.cutoffMinute === undefined || event.minute > manualOverride.cutoffMinute);

            const scoringTeam = event.team === 'home' || event.team === 'away'
                ? resolveScoringTeam(event.type, event.team, eventDefinitionMap)
                : null;

            if (countsForScore && scoringTeam === 'home') {
                home += points;
                hasScoringEvents = true;
            }

            if (countsForScore && scoringTeam === 'away') {
                away += points;
                hasScoringEvents = true;
            }

            const scoreAtEvent = manualOverride || hasScoringEvents
                ? { home, away }
                : normalizedScore;

            map.set(event.id, {
                home: scoreAtEvent.home,
                away: scoreAtEvent.away,
                points,
            });
        });

        return map;
    }, [eventDefinitionMap, eventsChronologicalAsc, scoreDraft]);

    useEffect(() => {
        const definitionMap = buildMatchEventDefinitionMap(availableEventDefinitions);

        setLocalEvents((prev) => {
            let changed = false;
            const nextEvents = prev.map((event) => {
                const definition = definitionMap[event.type];
                if (!definition) return event;

                const nextTeam =
                    definition.team === 'none'
                        ? null
                        : event.team ?? (definition.team === 'required' ? 'home' : null);
                const nextPlayerName = definition.player === 'none' ? '' : event.playerName;

                if (nextTeam === event.team && nextPlayerName === event.playerName) {
                    return event;
                }

                changed = true;
                return {
                    ...event,
                    team: nextTeam,
                    playerName: nextPlayerName,
                };
            });

            return changed ? nextEvents : prev;
        });
    }, [availableEventDefinitions]);

    useEffect(() => {
        setLocalEvents((prev) => {
            let changed = false;
            const nextEvents = prev.map((event) => {
                if (!event.team) {
                    return event;
                }

                const availablePlayers = lineupPlayerOptions[event.team];
                let nextEvent = event;

                if (event.playerName.trim() && !isEventPlayerAvailable(availablePlayers, event.playerName)) {
                    changed = true;
                    nextEvent = {
                        ...nextEvent,
                        playerId: null,
                        playerName: '',
                    };
                }

                if (event.secondaryPlayerName?.trim() && !isEventPlayerAvailable(availablePlayers, event.secondaryPlayerName)) {
                    changed = true;
                    nextEvent = {
                        ...nextEvent,
                        secondaryPlayerId: null,
                        secondaryPlayerName: '',
                        detail: event.type === 'substitution' ? '' : nextEvent.detail,
                    };
                }

                return nextEvent;
            });

            return changed ? nextEvents : prev;
        });
    }, [lineupPlayerOptions]);

    const scoreMismatch = useMemo(() => (
        !areMatchScoresEqual(score, eventDerivedScore)
        && (events.length > 0 || score.home > 0 || score.away > 0)
    ), [eventDerivedScore, events.length, score]);
    const scoreSource = useMemo<'manual' | 'events'>(() => (
        scoreMismatch ? 'manual' : events.length > 0 ? 'events' : 'manual'
    ), [events.length, scoreMismatch]);

    const homeName = match.homeClub?.short_name || match.homeClub?.name || 'Local';
    const awayName = match.awayClub?.short_name || match.awayClub?.name || 'Visitante';
    const homeLogo = match.homeClub?.logo_url || null;
    const awayLogo = match.awayClub?.logo_url || null;
    const watchUrl = match.broadcast_url || match.stream_url || null;

    const formattedDate = match.date_time
        ? formatDateInTimeZone(match.date_time, 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' }, APP_TIMEZONE)
        : 'Sin fecha';

    const summaryStats = useMemo(() => {
        const needsEventAnalytics = activeTab === 'resumen' || activeTab === 'estadisticas';
        const winner =
            score.home > score.away
                ? 'LOCAL'
                : score.away > score.home
                    ? 'VISITANTE'
                    : score.home === score.away && score.home === 0
                        ? '--'
                        : 'EMPATE';

        if (!needsEventAnalytics) {
            return {
                ptScore: { home: 0, away: 0 },
                stScore: { home: 0, away: 0 },
                teamComparableStats: [] as Array<{ type: string; label: string; h: number; a: number }>,
                teamComparableKickRates: [] as Array<{ key: string; label: string; h: number; a: number; title: string }>,
                scoringBreakdown: [] as Array<MatchEventDefinition & { homeCount: number; awayCount: number }>,
                recentEvents: [] as MatchEvent[],
                totalEvents: events.length,
                winner,
                homeBonusOff: false,
                awayBonusOff: false,
                bonusOffText: 'No aplica',
                bonusDefText: 'No aplica',
            };
        }

        const offensiveMetricLabel = pointsRules.offensive?.label || 'eventos';
        const homeOffensiveMetricCount = countTeamOffensiveMetric(score, events, 'home', pointsRules.offensive);
        const awayOffensiveMetricCount = countTeamOffensiveMetric(score, events, 'away', pointsRules.offensive);
        const homeBonusOff = pointsRules.offensive ? homeOffensiveMetricCount >= pointsRules.offensive.threshold : false;
        const awayBonusOff = pointsRules.offensive ? awayOffensiveMetricCount >= pointsRules.offensive.threshold : false;
        const offensiveThresholdLabel = pointsRules.offensive?.threshold ?? 0;
        const bonusOffText = !pointsRules.offensive
            ? 'No aplica'
            : homeBonusOff && awayBonusOff
                ? `${homeName} y ${awayName} (${offensiveThresholdLabel}+ ${offensiveMetricLabel})`
                : homeBonusOff
                    ? `${homeName} (${homeOffensiveMetricCount} ${offensiveMetricLabel})`
                    : awayBonusOff
                        ? `${awayName} (${awayOffensiveMetricCount} ${offensiveMetricLabel})`
                        : 'No';

        const diff = Math.abs(score.home - score.away);
        const loser = score.home < score.away ? 'home' : score.home > score.away ? 'away' : null;
        const bonusDefText = !pointsRules.defensive
            ? 'No aplica'
            : loser && diff <= pointsRules.defensive.margin && match.status === 'final'
                ? `${loser === 'home' ? homeName : awayName} (pierde por ${diff})`
                : 'No';

        const scoringDefinitions = availableEventDefinitions.filter((definition) => definition.category === 'score' && definition.points > 0);
        const comparableDefinitions = availableEventDefinitions.filter((definition) => definition.team !== 'none');
        const scoringCounts = new Map<string, { homeCount: number; awayCount: number }>();
        const comparableCounts = new Map<string, { h: number; a: number }>();

        scoringDefinitions.forEach((definition) => {
            scoringCounts.set(definition.type, { homeCount: 0, awayCount: 0 });
        });
        comparableDefinitions.forEach((definition) => {
            comparableCounts.set(definition.type, { h: 0, a: 0 });
        });

        let ptHome = 0;
        let ptAway = 0;
        let stHome = 0;
        let stAway = 0;

        // El corte de mitad sale del reloj del deporte, no de un 40 fijo:
        // rugby 40', futbol 45', hockey 30'. Con el numero clavado, todos los
        // goles del futbol entre el 41 y el 45 caian en el segundo tiempo.
        const halfTimeMinute = getPeriodOffsetSeconds(matchSportId, '2T') / 60;

        events.forEach((event) => {
            const points = getConfiguredEventPoints(event, eventDefinitionMap);
            const scoringTeam = event.team === 'home' || event.team === 'away'
                ? resolveScoringTeam(event.type, event.team, eventDefinitionMap)
                : null;

            if (points > 0 && scoringTeam === 'home') {
                if (event.minute <= halfTimeMinute) {
                    ptHome += points;
                } else {
                    stHome += points;
                }
            } else if (points > 0 && scoringTeam === 'away') {
                if (event.minute <= halfTimeMinute) {
                    ptAway += points;
                } else {
                    stAway += points;
                }
            }

            if (event.team === 'home' || event.team === 'away') {
                const comparableCount = comparableCounts.get(event.type);
                if (comparableCount) {
                    comparableCount[event.team === 'home' ? 'h' : 'a'] += 1;
                }

                const scoringCount = scoringCounts.get(event.type);
                if (scoringCount && points > 0) {
                    scoringCount[event.team === 'home' ? 'homeCount' : 'awayCount'] += 1;
                }
            }
        });

        const kickH = teamKickAccuracyBreakdown(events, 'home');
        const kickA = teamKickAccuracyBreakdown(events, 'away');
        const convPctH = goalKickEffectivenessPercent(kickH.convMade, kickH.convAttempts);
        const convPctA = goalKickEffectivenessPercent(kickA.convMade, kickA.convAttempts);
        const penPctH = goalKickEffectivenessPercent(kickH.penPalosMade, kickH.penPalosAttempts);
        const penPctA = goalKickEffectivenessPercent(kickA.penPalosMade, kickA.penPalosAttempts);
        const totPctH = goalKickEffectivenessPercent(kickH.totalMade, kickH.totalAttempts);
        const totPctA = goalKickEffectivenessPercent(kickA.totalMade, kickA.totalAttempts);

        const teamComparableKickRates = [
            {
                key: 'pen_palos_pct',
                label: 'Penales a palos (%)',
                h: penPctH,
                a: penPctA,
                title: `${homeName}: ${kickH.penPalosMade}/${kickH.penPalosAttempts} · ${awayName}: ${kickA.penPalosMade}/${kickA.penPalosAttempts}`,
            },
            {
                key: 'conv_palos_pct',
                label: 'Conversiones a palos (%)',
                h: convPctH,
                a: convPctA,
                title: `${homeName}: ${kickH.convMade}/${kickH.convAttempts} · ${awayName}: ${kickA.convMade}/${kickA.convAttempts}`,
            },
            {
                key: 'total_palos_pct',
                label: 'Efectividad total al palo (%)',
                h: totPctH,
                a: totPctA,
                title: `${homeName}: ${kickH.totalMade}/${kickH.totalAttempts} · ${awayName}: ${kickA.totalMade}/${kickA.totalAttempts} (conv., penales a palos y drops)`,
            },
        ];

        return {
            ptScore: { home: ptHome, away: ptAway },
            stScore: { home: stHome, away: stAway },
            teamComparableStats: comparableDefinitions
                .map((definition) => ({
                    type: definition.type,
                    label: definition.label,
                    h: comparableCounts.get(definition.type)?.h ?? 0,
                    a: comparableCounts.get(definition.type)?.a ?? 0,
                }))
                .filter((stat) => stat.h > 0 || stat.a > 0),
            teamComparableKickRates,
            scoringBreakdown: scoringDefinitions
                .map((definition) => ({
                    ...definition,
                    homeCount: scoringCounts.get(definition.type)?.homeCount ?? 0,
                    awayCount: scoringCounts.get(definition.type)?.awayCount ?? 0,
                }))
                .filter((definition) => definition.homeCount > 0 || definition.awayCount > 0),
            recentEvents: activeTab === 'resumen'
                // Take the last 8 chronologically and flip so the most recent is at the top.
                ? sortMatchEventsChronologically(events).slice(-8).reverse()
                : [],
            totalEvents: events.length,
            winner,
            homeBonusOff,
            awayBonusOff,
            bonusOffText,
            bonusDefText,
        };
    }, [activeTab, awayName, availableEventDefinitions, eventDefinitionMap, events, homeName, match.status, pointsRules, score]);
    const {
        ptScore,
        stScore,
        teamComparableStats,
        teamComparableKickRates,
        scoringBreakdown,
        recentEvents,
        totalEvents,
        winner,
        homeBonusOff,
        awayBonusOff,
        bonusOffText,
        bonusDefText,
    } = summaryStats;
    const playerStatsByTeam = useMemo(() => {
        const grouped: Record<'home' | 'away', PlayerStatRow[]> = { home: [], away: [] };
        const playerStatsMap = new Map<string, {
            key: string;
            playerId: string | null;
            name: string;
            team: 'home' | 'away';
            totalEvents: number;
            scoringEvents: number;
            points: number;
            lastMinute: number;
            breakdown: Map<string, PlayerStatBreakdown>;
        }>();

        events.forEach((event) => {
            if ((event.team !== 'home' && event.team !== 'away') || !event.playerName.trim()) return;

            const statKey = `${event.team}:${event.playerId || normalizeLookupKey(event.playerName)}`;
            const definition = eventDefinitionMap[event.type];
            // El gol en contra queda en el desglose del jugador (lo hizo el),
            // pero no le suma puntos: el tanto fue para el rival.
            const points = definition?.creditsOpponent
                ? 0
                : getConfiguredEventPoints(event, eventDefinitionMap);
            const existing = playerStatsMap.get(statKey) || {
                key: statKey,
                playerId: event.playerId || null,
                name: event.playerName.trim(),
                team: event.team,
                totalEvents: 0,
                scoringEvents: 0,
                points: 0,
                lastMinute: 0,
                breakdown: new Map<string, PlayerStatBreakdown>(),
            };

            existing.totalEvents += 1;
            existing.points += points;
            existing.lastMinute = Math.max(existing.lastMinute, Number(event.minute) || 0);
            if (points > 0) {
                existing.scoringEvents += 1;
            }

            const currentBreakdown = existing.breakdown.get(event.type) || {
                type: event.type,
                label: definition?.label || eventTypeLabel(event.type, availableEventDefinitions),
                count: 0,
                pointsPerEvent: points,
                totalPoints: 0,
                color: eventTypeColor(event.type, availableEventDefinitions),
            };
            currentBreakdown.count += 1;
            currentBreakdown.totalPoints += points;
            existing.breakdown.set(event.type, currentBreakdown);
            playerStatsMap.set(statKey, existing);
        });

        playerStatsMap.forEach((playerStat) => {
            grouped[playerStat.team].push({
                key: playerStat.key,
                playerId: playerStat.playerId,
                name: playerStat.name,
                team: playerStat.team,
                totalEvents: playerStat.totalEvents,
                scoringEvents: playerStat.scoringEvents,
                points: playerStat.points,
                lastMinute: playerStat.lastMinute,
                breakdown: Array.from(playerStat.breakdown.values()).sort((left, right) => (
                    right.totalPoints - left.totalPoints
                    || right.count - left.count
                    || left.label.localeCompare(right.label)
                )),
            });
        });

        grouped.home.sort((left, right) => (
            right.points - left.points
            || right.totalEvents - left.totalEvents
            || left.name.localeCompare(right.name)
        ));
        grouped.away.sort((left, right) => (
            right.points - left.points
            || right.totalEvents - left.totalEvents
            || left.name.localeCompare(right.name)
        ));

        return grouped;
    }, [availableEventDefinitions, eventDefinitionMap, events]);

    const completeMatchStats = useMemo(
        () => buildCompleteMatchStats(events, eventDefinitionMap),
        [eventDefinitionMap, events],
    );
    const completeStatTabs = useMemo(
        () => buildCompleteStatTabs(completeMatchStats, homeName, awayName, { sportId: matchSportId }),
        [awayName, completeMatchStats, homeName, matchSportId],
    );
    const firstStatsTabId = completeStatTabs[0]?.id ?? 'marcador';
    const effectiveStatsPanelTab = completeStatTabs.some((tab) => tab.id === statsPanelTab) ? statsPanelTab : firstStatsTabId;
    const activeStatTabContent = completeStatTabs.find((tab) => tab.id === effectiveStatsPanelTab);
    const topPlayerStats = useMemo(() => (
        [...playerStatsByTeam.home, ...playerStatsByTeam.away]
            .sort((left, right) => (
                right.points - left.points
                || right.scoringEvents - left.scoringEvents
                || right.totalEvents - left.totalEvents
                || left.name.localeCompare(right.name)
            ))
            .slice(0, 6)
    ), [playerStatsByTeam]);
    const scoreDirty = !areMatchScoresEqual(score, persistedScoreRef.current);
    const eventsDirty = !areDraftValuesEqual(events, persistedEventsRef.current);
    const lineupsDirty = !areDraftValuesEqual(lineups, persistedLineupsRef.current);
    const statusDirty = match.status !== persistedMatchRef.current.status;
    const venueDirty = (match.venue || '') !== (persistedMatchRef.current.venue || '');
    const notesDirty = !areTextValuesEqual(match.notes, persistedMatchRef.current.notes);
    const dateTimeDirty = dateTimeDraft !== toDateTimeLocalInput(persistedMatchRef.current.date_time);
    const hasUnsavedMatchParameters = scoreDirty || statusDirty || venueDirty || notesDirty || dateTimeDirty;
    const liveClockLabel = clock.label;
    const canStartClock = !clock.isRunning && !clock.hasProgress;
    const canPauseClock = clock.isRunning;
    const canResumeClock = !clock.isRunning && clock.hasProgress;
    // El reloj ya no tiene estado "sin guardar": cada transicion se persiste sola
    // en el momento. Lo que se muestra es si hay alguna todavia en vuelo.
    const guidedEventUsesClockMinute = clock.isRunning || clock.hasProgress;
    const guidedEventClockMinute = guidedEvent ? clock.elapsedMinute : 0;
    const sortedEvents = useMemo(
        () => {
            if (activeTab !== 'eventos') return [];
            return sortMatchEventsChronologically(events);
        },
        [activeTab, events],
    );
    const eventPanelGroups = useMemo(() => {
        const hasPenalty = availableEventDefinitions.some((definition) => definition.type === 'penalty');
        const hasMatchClockEvents = availableEventDefinitions.some((definition) => definition.type === 'match_start' || definition.type === 'match_end');
        const hasClubCards = availableEventDefinitions.some((definition) => definition.type === 'card_yellow' || definition.type === 'card_red');
        const visibleDefinitions = availableEventDefinitions.filter((definition) => {
            if (definition.type === 'penalty_goal' && hasPenalty) return false;
            if ((definition.type === 'start_period' || definition.type === 'end_period') && hasMatchClockEvents) return false;
            if ((definition.type === 'yellow_card' || definition.type === 'red_card') && hasClubCards) return false;
            return true;
        });
        const groups = ['Marcador', 'Disciplina', 'Juego', 'Plantel', 'Reloj'];

        return groups
            .map((group) => ({
                group,
                definitions: visibleDefinitions.filter((definition) => getEventButtonGroup(definition) === group),
            }))
            .filter((group) => group.definitions.length > 0);
    }, [availableEventDefinitions]);
    const guidedPlayers = guidedEvent?.team ? eventPlayerSelections[guidedEvent.team].active : [];
    const guidedSecondaryPlayers = guidedEvent?.team
        ? guidedEvent.definition.type === 'substitution'
            ? eventPlayerSelections[guidedEvent.team].substitutes
            : eventPlayerSelections[guidedEvent.team].active
        : [];
    const guidedTeamName = guidedEvent?.team === 'home' ? homeName : guidedEvent?.team === 'away' ? awayName : '';

    const handleExportMatchSheetPdf = useCallback(async () => {
        const homeFullName = match.homeClub?.name || homeName;
        const awayFullName = match.awayClub?.name || awayName;
        const homeBasePoints = Number(localPoints.home_base_points ?? 0);
        const awayBasePoints = Number(localPoints.away_base_points ?? 0);
        const homeBonusPoints = Number(localPoints.home_bonus_points ?? 0);
        const awayBonusPoints = Number(localPoints.away_bonus_points ?? 0);
        const formattedTime = match.date_time
            ? formatDateInTimeZone(match.date_time, 'es-AR', { hour: '2-digit', minute: '2-digit' }, APP_TIMEZONE)
            : '';
        const mapLineup = (players: LineupPlayer[]) => players.map((player) => ({
            number: String(player.number ?? '').trim(),
            name: player.name,
            position: player.position || '',
            role: player.role || '',
            isCaptain: Boolean(player.isCaptain),
        }));
        const eventStatsByType = new Map<string, { label: string; home: number; away: number }>();
        eventsChronologicalAsc.forEach((event) => {
            if (event.team !== 'home' && event.team !== 'away') return;
            const label = eventTypeLabel(event.type, availableEventDefinitions);
            const current = eventStatsByType.get(event.type) || { label, home: 0, away: 0 };
            current[event.team] += 1;
            eventStatsByType.set(event.type, current);
        });
        const eventStatRows = Array.from(eventStatsByType.values())
            .sort((left, right) => left.label.localeCompare(right.label, 'es'));
        const completeStatSections = completeStatTabs.flatMap((tab) => (
            tab.sections.map((section) => ({
                title: `${tab.label} - ${section.title}`,
                rows: section.rows.map((row) => ({
                    label: row.label,
                    home: row.valueKind === 'percent'
                        ? row.home < 0 ? '-' : `${row.home.toFixed(1)}%`
                        : row.home,
                    away: row.valueKind === 'percent'
                        ? row.away < 0 ? '-' : `${row.away.toFixed(1)}%`
                        : row.away,
                })),
            }))
        ));
        const timeline = eventsChronologicalAsc.map((event, index) => {
            const scoreAtEvent = eventScoreById.get(event.id);
            return {
                period: getMatchPeriodLabel(event.period),
                minute: String(event.minute || '--'),
                summary: eventTypeLabel(event.type, availableEventDefinitions),
                team: event.team === 'home' ? homeName : event.team === 'away' ? awayName : 'Neutral',
                detail: formatMatchTimelineEventDescription(event, eventsChronologicalAsc, index, event.playerName || event.detail || 'Sin detalle adicional'),
                score: scoreAtEvent && scoreAtEvent.points > 0 ? `${scoreAtEvent.home} - ${scoreAtEvent.away}` : undefined,
            };
        });

        const opened = await exportMatchSheetPdf({
            title: `Planilla: ${homeFullName} vs ${awayFullName}`,
            status: match.status,
            statusLabel: statusLabel(match.status),
            date: formattedDate,
            time: formattedTime || 'Hora a confirmar',
            venue: match.venue || 'Sede a confirmar',
            referee: match.referee || 'A confirmar',
            roundLabel: match.roundLabel || match.round_id || 'Sin jornada',
            category: match.category || 'Sin categoria',
            accentColor: match.homeClub?.primary_color || '#22c55e',
            tournament: {
                name: match.tournament?.name || 'Competicion',
                logoUrl: match.tournament?.logo_url || match.tournament?.logo || null,
            },
            home: {
                name: homeFullName,
                shortName: homeName,
                logoUrl: homeLogo,
                score: String(score.home ?? 0),
                points: formatPointValue(homeBasePoints + homeBonusPoints),
                pointsDetail: formatPointBreakdown(homeBasePoints, homeBonusPoints),
                lineup: mapLineup(lineups.home),
            },
            away: {
                name: awayFullName,
                shortName: awayName,
                logoUrl: awayLogo,
                score: String(score.away ?? 0),
                points: formatPointValue(awayBasePoints + awayBonusPoints),
                pointsDetail: formatPointBreakdown(awayBasePoints, awayBonusPoints),
                lineup: mapLineup(lineups.away),
            },
            timeline,
            statSections: [
                { title: 'Resumen de eventos', rows: eventStatRows },
                ...completeStatSections,
            ],
            notes: match.notes || undefined,
        });

        if (!opened) {
            setSaveMsg({ type: 'err', text: 'No se pudo abrir la ventana de impresion. Revisa el bloqueo de pop-ups del navegador.' });
            scheduleSaveMsgClear(3000);
        }
    }, [
        availableEventDefinitions,
        awayLogo,
        awayName,
        completeStatTabs,
        eventScoreById,
        eventsChronologicalAsc,
        formattedDate,
        homeLogo,
        homeName,
        lineups.away,
        lineups.home,
        localPoints.away_base_points,
        localPoints.away_bonus_points,
        localPoints.home_base_points,
        localPoints.home_bonus_points,
        match.awayClub?.name,
        match.category,
        match.date_time,
        match.homeClub?.name,
        match.homeClub?.primary_color,
        match.notes,
        match.referee,
        match.roundLabel,
        match.round_id,
        match.status,
        match.tournament?.logo,
        match.tournament?.logo_url,
        match.tournament?.name,
        match.venue,
        score.away,
        score.home,
    ]);


    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    return (
        <main className="match-center-container">
            {/* â•â•â•â•â•â•â•â•â•â•â• 1. HEADER â•â•â•â•â•â•â•â•â•â•â• */}
            <header className="match-center-header">
                <div className="header-left">
                    <button
                        onClick={() => {
                            if (onClose) {
                                onClose();
                                return;
                            }

                            if (backHref) {
                                router.push(backHref);
                                return;
                            }

                            router.back();
                        }}
                        className="mc-btn mc-btn-outline"
                        style={{ border: 'none' }}
                    >
                        <ChevronLeft size={16} /> Volver
                    </button>
                </div>

                <div className="header-identity-wrapper">
                    <div className="match-main-line">
                        <div className="team-entry local">
                            <span className="team-name-primary">{homeName}</span>
                            <div className="team-logo-mini">
                                {homeLogo ? <img src={homeLogo} alt={homeName} /> : <Shield size={32} color="#555" />}
                            </div>
                        </div>
                        <div className="score-center">
                            <span className="score-val">{score.home}</span>
                            <span className="score-sep">-</span>
                            <span className="score-val">{score.away}</span>
                        </div>
                        <div className="team-entry away">
                            <div className="team-logo-mini">
                                {awayLogo ? <img src={awayLogo} alt={awayName} /> : <Shield size={32} color="#555" />}
                            </div>
                            <span className="team-name-primary">{awayName}</span>
                        </div>
                    </div>
                    <div className="match-meta-line" style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
                        <div className="status-indicator" style={{ borderColor: statusColor(match.status), color: statusColor(match.status), background: `${statusColor(match.status)}15` }}>
                            {match.status === 'live' ? `${liveClockLabel} ` : ''}{statusLabel(match.status)}
                        </div>
                        <div className="context-info">
                            {match.tournament?.name || 'Amistoso'} · {formattedDate} · {match.venue || 'Sin estadio'}
                        </div>
                    </div>
                </div>

                <div className="header-actions">
                    <button className="mc-btn" onClick={handleSave} disabled={saving}>
                        {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                        <span className="btn-label">Guardar</span>
                    </button>
                    <button className="mc-btn mc-btn-primary">
                        <Share2 size={16} /> <span className="btn-label">Publicar</span>
                    </button>
                    {saveMsg && (
                        <div className="save-feedback-toast" style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: 8,
                            padding: '10px 16px',
                            borderRadius: 8,
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            background: saveMsg.type === 'ok' ? '#052e16' : saveMsg.type === 'warn' ? '#3a2205' : '#450a0a',
                            color: saveMsg.type === 'ok' ? '#4ade80' : saveMsg.type === 'warn' ? '#fbbf24' : '#fca5a5',
                            border: `1px solid ${saveMsg.type === 'ok' ? '#166534' : saveMsg.type === 'warn' ? '#92400e' : '#991b1b'}`,
                            boxShadow: '0 4px 12px rgba(0,0,0,.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            {saveMsg.type === 'ok' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                            {saveMsg.text}
                        </div>
                    )}
                </div>
            </header>

            {scoreMismatch && (
                <section className="score-mismatch-banner" style={{
                    margin: '20px 24px 0',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    background: 'rgba(120, 53, 15, 0.18)',
                    color: '#fcd34d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>
                        <AlertTriangle size={16} />
                        <span>Resultado manual guardado. La timeline no coincide con el marcador oficial.</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#fde68a' }}>
                        Eventos: {eventDerivedScore.home} - {eventDerivedScore.away}
                    </span>
                </section>
            )}

            {/* â•â•â•â•â•â•â•â•â•â•â• 2. TABS â•â•â•â•â•â•â•â•â•â•â• */}
            <nav className="match-tabs-nav">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={16} className="tab-icon" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>

            {/* â•â•â•â•â•â•â•â•â•â•â• 3. CONTENT â•â•â•â•â•â•â•â•â•â•â• */}
            <section className="match-content-grid">

                {/* â”€â”€ TAB: RESUMEN â”€â”€ */}
                {activeTab === 'resumen' && (
                    <div className="mc-grid-2" style={{ gap: 32 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {/* Resultado Extendido */}
                            <article className="mc-partition">
                                <div className="mc-card-header">
                                    <h4>Resultado Extendido</h4>
                                    <span style={{ fontSize: '0.7rem', color: scoreSource === 'manual' ? '#fcd34d' : '#888', textTransform: 'uppercase', fontWeight: 800 }}>
                                        {scoreSource === 'manual' ? 'Marcador oficial' : 'Alineado con eventos'}
                                    </span>
                                </div>
                                <div className="mc-card-body result-summary-grid">
                                    <div className="result-summary-card">
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>
                                            Parciales {scoreMismatch ? '(segun eventos)' : ''}
                                        </div>
                                        <div style={{ fontWeight: 800 }}>PT: {ptScore.home} - {ptScore.away}</div>
                                        <div style={{ fontWeight: 800, color: '#888' }}>ST: {stScore.home} - {stScore.away}</div>
                                    </div>
                                    <div className="result-summary-card">
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Ganador</div>
                                        <div style={{ fontWeight: 800, color: winner === 'EMPATE' || winner === '--' ? '#666' : 'var(--accent)' }}>{winner}</div>
                                    </div>
                                    <div className="result-summary-card">
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Bonus Ofensivo</div>
                                        <div style={{ fontWeight: 800, color: homeBonusOff || awayBonusOff ? 'var(--accent)' : '#666' }}>{bonusOffText}</div>
                                    </div>
                                    <div className="result-summary-card">
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Bonus Defensivo</div>
                                        <div style={{ fontWeight: 800, color: bonusDefText !== 'No' ? '#f59e0b' : '#666' }}>{bonusDefText}</div>
                                    </div>
                                </div>
                            </article>

                            {/* Metricas derivadas de eventos */}
                            <article className="mc-partition">
                                <div className="mc-card-header"><h4>Metricas Clave</h4></div>
                                <div className="mc-card-body">
                                    {scoreMismatch && (
                                        <p style={{ marginTop: 0, marginBottom: 16, fontSize: '0.8rem', color: '#888' }}>
                                            Estas metricas se calculan segun la timeline de eventos y pueden no coincidir con el marcador oficial.
                                        </p>
                                    )}
                                    {totalEvents === 0 ? (
                                        <p className="empty-msg">No hay eventos registrados aun. Carga eventos en la pestana &quot;Eventos&quot;.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                                            {(() => {
                                                return teamComparableStats.map(stat => {
                                                    const total = stat.h + stat.a || 1;
                                                    const hPct = (stat.h / total) * 100;
                                                    return (
                                                        <div key={stat.label}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 900, marginBottom: 8, textTransform: 'uppercase' }}>
                                                                <span>{stat.h}</span>
                                                                <span style={{ color: '#666' }}>{stat.label}</span>
                                                                <span>{stat.a}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4, height: 6, background: '#111', borderRadius: 3 }}>
                                                                <div style={{ width: hPct + '%', background: 'var(--accent)', borderRadius: 3, transition: 'width .3s' }}></div>
                                                                <div style={{ width: (100 - hPct) + '%', background: '#333', borderRadius: 3, transition: 'width .3s' }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </article>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {/* Ultimos Eventos */}
                            <article className="mc-partition" style={{ flex: 1 }}>
                                <div className="mc-card-header">
                                    <h4>Ultimos Eventos</h4>
                                    {events.length > 0 && (
                                        <button onClick={() => setActiveTab('eventos')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}>VER TODOS</button>
                                    )}
                                </div>
                                <div className="mc-card-body">
                                    {recentEvents.length === 0 ? (
                                        <p className="empty-msg">Sin eventos registrados.</p>
                                    ) : (
                                        <div className="event-timeline" style={{ paddingLeft: 16 }}>
                                            {recentEvents.map((ev, i) => {
                                                const chronIdx = chronologicalIndexById.get(ev.id) ?? -1;
                                                const eventScore = eventScoreById.get(ev.id);
                                                const detailLine =
                                                    ev.type === 'substitution' && chronIdx >= 0
                                                        ? formatMatchTimelineEventDescription(ev, eventsChronologicalAsc, chronIdx, ev.playerName || ev.detail || '')
                                                        : (ev.playerName || ev.detail);
                                                return (
                                                <div key={ev.id || i} className="event-entry" style={{ padding: '8px 12px', marginBottom: 8, background: 'transparent', border: 'none' }}>
                                                    <div style={{ display: 'grid', gap: 3, fontSize: '0.8rem', fontWeight: 900, color: eventTypeColor(ev.type, availableEventDefinitions), width: 64 }}>
                                                        <span>{ev.minute}&apos;</span>
                                                        <span style={{ color: '#777', fontSize: '0.62rem', textTransform: 'uppercase' }}>{getMatchPeriodLabel(ev.period)}</span>
                                                    </div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                                                {eventTypeLabel(ev.type, availableEventDefinitions)}{' '}
                                                        <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: 8 }}>
                                                            {teamTag(ev.team)} {detailLine}
                                                        </span>
                                                        {eventScore && eventScore.points > 0 ? (
                                                            <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 999, background: 'rgba(34,197,94,0.12)', color: '#86efac', fontSize: '0.72rem', fontWeight: 900 }}>
                                                                Marcador {eventScore.home} - {eventScore.away}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </article>

                            {/* Accesos */}
                            <article className="mc-partition">
                                <div className="mc-card-header"><h4>Accesos</h4></div>
                                <div className="mc-card-body quick-access-actions" style={{ display: 'flex', gap: 16 }}>
                                    <button
                                        className="mc-btn mc-btn-outline"
                                        style={{ flex: 1, padding: 16, justifyContent: 'center', opacity: watchUrl ? 1 : 0.4 }}
                                        disabled={!watchUrl}
                                        onClick={() => watchUrl && window.open(watchUrl, '_blank')}
                                    >
                                        <Video size={16} /> Transmision
                                    </button>
                                    <button
                                        className="mc-btn mc-btn-outline"
                                        style={{ flex: 1, padding: 16, justifyContent: 'center', opacity: match.replay_url ? 1 : 0.4 }}
                                        disabled={!match.replay_url}
                                        onClick={() => match.replay_url && window.open(match.replay_url, '_blank')}
                                    >
                                        <Search size={16} /> Replay
                                    </button>
                                </div>
                            </article>
                        </div>
                    </div>
                )}

                {/* â”€â”€ TAB: ALINEACIONES â”€â”€ */}
                {activeTab === 'alineaciones' && (
                    <div className="lineup-workspace" style={{ maxWidth: 1000, margin: '0 auto' }}>
                        <article className="mc-partition" style={{ marginBottom: 24 }}>
                            <div className="mc-card-body" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ margin: 0, flex: '1 1 240px' }}>
                                    <label>Cantidad de jugadores por equipo</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={60}
                                        value={lineupSizeInput}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => setLineupSizeInput(e.target.value)}
                                    />
                                </div>
                                <button
                                    className="mc-btn mc-btn-primary"
                                    type="button"
                                    onClick={() => applyLineupSize()}
                                >
                                    <Plus size={14} /> Aplicar plantilla
                                </button>
                            </div>
                        </article>
                        {lineups.home.length === 0 && lineups.away.length === 0 ? (
                            <article className="mc-partition">
                                <div className="mc-card-body">
                                    <p className="empty-msg">No hay alineaciones cargadas. Elegí cómo armar las planillas.</p>
                                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                                        <button
                                            className="mc-btn mc-btn-outline"
                                            type="button"
                                            onClick={() => applyLineupSize(DEFAULT_LINEUP_SIZE)}
                                        >
                                            <Plus size={14} /> Generar plantilla (23)
                                        </button>
                                        <button
                                            className="mc-btn mc-btn-primary"
                                            type="button"
                                            onClick={() => importAllRosters()}
                                            disabled={teamRosters.home.length === 0 && teamRosters.away.length === 0}
                                            title={
                                                teamRosters.home.length === 0 && teamRosters.away.length === 0
                                                    ? 'No hay plantel cargado en el torneo'
                                                    : undefined
                                            }
                                        >
                                            <Users size={14} /> Importar todo el plantel
                                        </button>
                                    </div>
                                    <p className="quick-lineup-hint" style={{ textAlign: 'center', marginTop: 12 }}>
                                        “Generar plantilla (23)” crea las planillas vacías para completar a mano.
                                        “Importar todo el plantel” precarga los jugadores del plantel del torneo.
                                    </p>
                                </div>
                            </article>
                        ) : (
                            <>
                            <div className="quick-lineup-mobile-grid">
                                {(['home', 'away'] as const).map(team => {
                                    const club = team === 'home' ? match.homeClub : match.awayClub;

                                    return (
                                        <article key={`quick-${team}`} className="quick-lineup-card quick-lineup-mobile-card">
                                            <div className="quick-lineup-team-title">
                                                {club?.logo_url && <img src={club.logo_url} alt={club.name} width={22} style={{ objectFit: 'contain' }} />}
                                                <h3>{club?.name || (team === 'home' ? 'Local' : 'Visitante')}</h3>
                                            </div>
                                            <div className="quick-lineup-header">
                                                <div>
                                                    <strong>Carga r&aacute;pida</strong>
                                                    <span>Formato: `1 - Nombre Apellido`.</span>
                                                </div>
                                                <div className="quick-lineup-actions">
                                                    <button
                                                        className="mc-btn mc-btn-outline"
                                                        type="button"
                                                        onClick={() => importTeamRoster(team)}
                                                        disabled={teamRosters[team].length === 0}
                                                        title={teamRosters[team].length === 0 ? 'Sin plantel cargado en el torneo' : undefined}
                                                    >
                                                        <Users size={14} /> Importar plantel
                                                    </button>
                                                    <button
                                                        className="mc-btn mc-btn-outline"
                                                        type="button"
                                                        onClick={() => resetQuickLineupDraft(team)}
                                                    >
                                                        <RefreshCw size={14} /> Usar actual
                                                    </button>
                                                    <button
                                                        className="mc-btn mc-btn-primary"
                                                        type="button"
                                                        onClick={() => applyQuickLineupDraft(team)}
                                                    >
                                                        <Plus size={14} /> Aplicar lista
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                className="quick-lineup-textarea"
                                                value={quickLineupDrafts[team]}
                                                onChange={(event) => handleQuickLineupDraftChange(team, event.target.value)}
                                                placeholder={`1 - Nombre Apellido\n2 - Nombre Apellido\n3 - Nombre Apellido`}
                                                rows={8}
                                            />
                                            <p className="quick-lineup-hint">
                                                Se cargan de arriba hacia abajo en las posiciones de la planilla.
                                            </p>
                                        </article>
                                    );
                                })}
                            </div>
                            <div className="lineup-team-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                                {(['home', 'away'] as const).map(team => {
                                    const club = team === 'home' ? match.homeClub : match.awayClub;
                                    const players = lineups[team];
                                    const starters = players.filter(isStarterLineupPlayer);
                                    const subs = players.filter(isSubstituteLineupPlayer);

                                    return (
                                        <article key={team} className="mc-partition lineup-team-panel" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                                            <div className="lineup-team-heading" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                                {club?.logo_url && <img src={club.logo_url} alt={club.name} width={24} style={{ objectFit: 'contain' }} />}
                                                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0 }}>{club?.name || (team === 'home' ? 'Local' : 'Visitante')}</h3>
                                            </div>
                                            <div className="quick-lineup-card">
                                                <div className="quick-lineup-header">
                                                    <div>
                                                        <strong>Carga rápida</strong>
                                                        <span>Pegá una lista ordenada. Formato sugerido: `1 - Nombre Apellido`.</span>
                                                    </div>
                                                    <div className="quick-lineup-actions">
                                                        <button
                                                            className="mc-btn mc-btn-outline"
                                                            type="button"
                                                            onClick={() => importTeamRoster(team)}
                                                            disabled={teamRosters[team].length === 0}
                                                            title={teamRosters[team].length === 0 ? 'Sin plantel cargado en el torneo' : undefined}
                                                        >
                                                            <Users size={14} /> Importar plantel
                                                        </button>
                                                        <button
                                                            className="mc-btn mc-btn-outline"
                                                            type="button"
                                                            onClick={() => resetQuickLineupDraft(team)}
                                                        >
                                                            <RefreshCw size={14} /> Usar actual
                                                        </button>
                                                        <button
                                                            className="mc-btn mc-btn-primary"
                                                            type="button"
                                                            onClick={() => applyQuickLineupDraft(team)}
                                                        >
                                                            <Plus size={14} /> Aplicar lista
                                                        </button>
                                                    </div>
                                                </div>
                                                <textarea
                                                    className="quick-lineup-textarea"
                                                    value={quickLineupDrafts[team]}
                                                    onChange={(event) => handleQuickLineupDraftChange(team, event.target.value)}
                                                    placeholder={`1 - Nombre Apellido\n2 - Nombre Apellido\n3 - Nombre Apellido`}
                                                    rows={8}
                                                />
                                                <p className="quick-lineup-hint">
                                                    Se cargan de arriba hacia abajo en las posiciones de la planilla. Si el jugador ya existe en el roster, se vincula automáticamente; si no, queda listo para crearse al guardar.
                                                </p>
                                            </div>
                                            <div className="lineup-roster-card" style={{ background: '#111', borderRadius: 8, border: '1px solid #222', overflow: 'hidden' }}>
                                                <div className="lineup-section-title" style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    TITULARES ({starters.length})
                                                </div>
                                                <div className="lineup-section-list" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {starters.map((p, idx) => (
                                                        <div key={idx} className="player-row">
                                                            <span className="player-number">{p.number}</span>
                                                            <div style={{ display: 'grid', gap: 4, flex: 1 }}>
                                                                <input
                                                                    type="text"
                                                                    value={p.name}
                                                                    placeholder="Buscar en el roster o crear nuevo"
                                                                    className="inline-input"
                                                                    list={`match-center-roster-${team}`}
                                                                    onChange={(e) => updateLineupPlayerValue(team, p, e.target.value)}
                                                                />
                                                                <span style={{ fontSize: 11, color: p.id ? 'var(--accent)' : '#666' }}>
                                                                    {p.id
                                                                        ? 'Vinculado al jugador del club'
                                                                        : p.name.trim()
                                                                            ? 'Jugador manual: se vinculara o creara al guardar'
                                                                            : 'Sugerencias del plantel disponibles'}
                                                                </span>
                                                            </div>
                                                            <label style={{ display: 'grid', gap: 4, minWidth: 88, flexShrink: 0 }}>
                                                                <span style={{ fontSize: 10, color: '#777', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Puntaje</span>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={10}
                                                                    step={0.1}
                                                                    inputMode="decimal"
                                                                    value={formatLineupRatingInput(p.rating)}
                                                                    placeholder="0.0"
                                                                    className="inline-input"
                                                                    style={{ textAlign: 'center', opacity: p.name.trim() ? 1 : 0.45 }}
                                                                    disabled={!p.name.trim()}
                                                                    onChange={(e) => updateLineupPlayerRating(team, p, e.target.value)}
                                                                />
                                                            </label>
                                                            {p.isCaptain && <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '2px 6px' }}>C</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="lineup-section-title" style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    SUPLENTES ({subs.length})
                                                </div>
                                                <div className="lineup-section-list" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {subs.map((p, idx) => (
                                                        <div key={idx} className="player-row">
                                                            <span className="player-number" style={{ borderColor: '#555', color: '#555' }}>{p.number}</span>
                                                            <div style={{ display: 'grid', gap: 4, flex: 1 }}>
                                                                <input
                                                                    type="text"
                                                                    value={p.name}
                                                                    placeholder="Buscar suplente o crear nuevo"
                                                                    className="inline-input"
                                                                    style={{ color: '#ccc' }}
                                                                    list={`match-center-roster-${team}`}
                                                                    onChange={(e) => updateLineupPlayerValue(team, p, e.target.value)}
                                                                />
                                                                <span style={{ fontSize: 11, color: p.id ? 'var(--accent)' : '#666' }}>
                                                                    {p.id
                                                                        ? 'Vinculado al jugador del club'
                                                                        : p.name.trim()
                                                                            ? 'Jugador manual: se vinculara o creara al guardar'
                                                                            : 'Selecciona un jugador existente o escribe uno nuevo'}
                                                                </span>
                                                            </div>
                                                            <label style={{ display: 'grid', gap: 4, minWidth: 88, flexShrink: 0 }}>
                                                                <span style={{ fontSize: 10, color: '#777', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Puntaje</span>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={10}
                                                                    step={0.1}
                                                                    inputMode="decimal"
                                                                    value={formatLineupRatingInput(p.rating)}
                                                                    placeholder="0.0"
                                                                    className="inline-input"
                                                                    style={{ textAlign: 'center', opacity: p.name.trim() ? 1 : 0.45, color: '#ccc' }}
                                                                    disabled={!p.name.trim()}
                                                                    onChange={(e) => updateLineupPlayerRating(team, p, e.target.value)}
                                                                />
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <datalist id={`match-center-roster-${team}`}>
                                                {teamRosters[team].map((entry) => (
                                                    <option
                                                        key={`${team}-${entry.personId}`}
                                                        value={entry.name}
                                                        label={`${entry.position || 'Jugador'}${entry.jerseyNumber ? ` • #${entry.jerseyNumber}` : ''}`}
                                                    />
                                                ))}
                                            </datalist>
                                        </article>
                                    );
                                })}
                            </div>
                            </>
                        )}
                    </div>
                )}

                {/* â”€â”€ TAB: EVENTOS â”€â”€ */}
                {activeTab === 'eventos' && (
                    <>
                    <div className="event-live-workspace">
                        <article className="mc-partition live-event-console">
                            <div className="mc-card-header live-event-console-header">
                                <div className="live-event-heading">
                                    <h4>Carga rapida de eventos</h4>
                                    <span className="live-event-header-note">El tiempo actual se aplica al guardar cada evento.</span>
                                </div>
                                <div className="live-match-clock" data-running={clock.isRunning ? 'true' : 'false'}>
                                    <div className="live-match-clock-readout">
                                        <Clock size={15} />
                                        <span>{liveClockLabel}</span>
                                    </div>
                                    <div className="live-match-clock-actions" role="group" aria-label="Controles del reloj del partido">
                                        <button
                                            type="button"
                                            className="mc-btn live-match-clock-btn"
                                            onClick={handleStartClock}
                                            disabled={!canStartClock}
                                            title="Iniciar reloj"
                                        >
                                            <Play size={13} /> Iniciar
                                        </button>
                                        <button
                                            type="button"
                                            className="mc-btn live-match-clock-btn"
                                            onClick={handlePauseClock}
                                            disabled={!canPauseClock}
                                            title="Pausar reloj"
                                        >
                                            <Pause size={13} /> Pausar
                                        </button>
                                        <button
                                            type="button"
                                            className="mc-btn live-match-clock-btn"
                                            onClick={handleResumeClock}
                                            disabled={!canResumeClock}
                                            title="Reanudar reloj"
                                        >
                                            <Play size={13} /> Reanudar
                                        </button>
                                        <button
                                            type="button"
                                            className="mc-btn live-match-clock-btn live-match-clock-reset"
                                            onClick={handleResetClock}
                                            title="Reiniciar reloj"
                                        >
                                            <RotateCcw size={13} /> Reiniciar
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/*
                              * MIN/SEG son OVERRIDE MANUAL: escribir ajusta el
                              * acumulado, nunca al reves. Mientras el input tiene
                              * foco el tick no lo pisa (el hook mantiene un draft
                              * aparte); al salir del campo se persiste como una
                              * transicion 'set' anclada igual que el resto.
                              */}
                            <div className="live-match-clock-editor">
                                <label>
                                    <span>Periodo</span>
                                    <select
                                        value={clock.period || ''}
                                        onChange={(e) => clock.changePeriod(e.target.value).catch(reportClockError)}
                                    >
                                        {/* Codigos canonicos con rotulo legible: el hook guarda
                                          * 'PRE'/'FT', no 'Previa'/'Final', y sin normalizar el
                                          * select mostraba las dos formas del mismo periodo. */}
                                        {Array.from(new Set(
                                            [clock.period, ...COMMON_MATCH_PERIODS]
                                                .filter(Boolean)
                                                .map((period) => normalizeMatchPeriod(period)),
                                        )).map((period) => (
                                            <option key={period} value={period}>{getMatchPeriodLabel(period)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span>Min</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={clock.manual.minute}
                                        onFocus={clock.beginManualEdit}
                                        onChange={(e) => clock.changeManualField('minute', e.target.value)}
                                        onBlur={() => clock.commitManualEdit().catch(reportClockError)}
                                    />
                                </label>
                                <label>
                                    <span>Seg</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={59}
                                        value={clock.manual.seconds}
                                        onFocus={clock.beginManualEdit}
                                        onChange={(e) => clock.changeManualField('seconds', e.target.value)}
                                        onBlur={() => clock.commitManualEdit().catch(reportClockError)}
                                    />
                                </label>
                                <button
                                    type="button"
                                    className="mc-btn live-match-clock-btn"
                                    onClick={() => clock.rebaseToPeriodStart(clock.period).catch(reportClockError)}
                                    title={`Llevar el reloj al inicio del periodo (${formatClockSeconds(getPeriodOffsetSeconds(matchSportId, clock.period))})`}
                                >
                                    Ir al inicio del periodo
                                </button>
                                {clock.manual.isEditing ? (
                                    <span className="live-match-clock-dirty">Editando (se aplica al salir del campo)</span>
                                ) : null}
                            </div>
                            <div className="live-event-panel">
                                {eventPanelGroups.map((group) => (
                                    <section key={group.group} className="live-event-group" data-group={group.group.toLowerCase()}>
                                        <div className="live-event-group-title">
                                            <span>{group.group}</span>
                                            <small>{group.definitions.length} eventos</small>
                                        </div>
                                        <div className="live-event-button-grid">
                                            {group.definitions.map((definition) => (
                                                <button
                                                    key={definition.type}
                                                    type="button"
                                                    className="live-event-button"
                                                    data-tone={getEventButtonTone(definition)}
                                                    data-event-type={definition.type}
                                                    aria-label={`Cargar ${definition.label}`}
                                                    onClick={() => openGuidedEvent(definition)}
                                                >
                                                    <span className="live-event-glyph">{getEventButtonGlyph(definition.type)}</span>
                                                    <span className="live-event-label">{getEventButtonLabel(definition)}</span>
                                                    <span className="live-event-meta">{getEventButtonMeta(definition)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </article>
                    </div>
                    <article className="mc-partition event-timeline-panel">
                        <div className="mc-card-header">
                            <h4>Eventos cargados ({events.length})</h4>
                            {eventsDirty && (
                                <button className="mc-btn mc-btn-primary" type="button" onClick={handleSave} disabled={saving}>
                                    {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                    Guardar cambios
                                </button>
                            )}
                        </div>
                        <div className="mc-card-body" style={{ padding: 0 }}>
                            {events.length === 0 ? (
                                <p className="empty-msg">Sin eventos. Elegi un boton del panel para iniciar la carga guiada.</p>
                            ) : (
                                <>
                                    <div className="event-list-header" style={{ display: 'grid', gridTemplateColumns: '70px 120px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.7rem', fontWeight: 800, color: '#666', borderBottom: '1px solid #222' }}>
                                        <div>MIN</div><div>PERIODO</div><div>TIPO</div><div>EQUIPO</div><div>JUGADOR / DETALLE</div><div style={{ textAlign: 'right' }}>ACCION</div>
                                    </div>
                                    {sortedEvents.map((ev) => {
                                        const selectedDefinition = eventDefinitionMap[ev.type] || {
                                            type: ev.type,
                                            label: eventTypeLabel(ev.type, availableEventDefinitions),
                                            category: 'other' as const,
                                            points: 0,
                                            team: 'optional' as const,
                                            player: 'optional' as const,
                                        };
                                        const availableEventPlayers = ev.team ? eventPlayerOptions[ev.team] : [];
                                        const availableEventSelection = ev.team ? eventPlayerSelections[ev.team] : null;
                                        const selectedPlayerValue = ev.playerName || '';
                                        const selectedSecondaryPlayerValue = ev.secondaryPlayerName || '';
                                        const eventScore = eventScoreById.get(ev.id);
                                        const eventPeriod = normalizeMatchPeriod(ev.period);

                                        return (
                                        <div key={ev.id} className="event-list-row" style={{ display: 'grid', gridTemplateColumns: '70px 120px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.85rem', borderBottom: '1px solid #222', alignItems: 'center' }}>
                                            <div>
                                                <input
                                                    type="number" value={ev.minute} min={0} max={100}
                                                    style={{ width: 50, background: '#222', border: 'none', color: 'var(--accent)', fontWeight: 900, padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => updateLocalEvent(ev.id, { minute: parseInt(e.target.value, 10) || 0 })}
                                                />
                                            </div>
                                            <div>
                                                <select
                                                    value={eventPeriod}
                                                    style={{ background: '#222', border: 'none', color: '#fff', fontSize: '0.8rem', padding: 4, borderRadius: 4, maxWidth: 110 }}
                                                    title={getMatchPeriodLabel(eventPeriod)}
                                                    onChange={(e) => updateLocalEvent(ev.id, { period: normalizeMatchPeriod(e.target.value) })}
                                                >
                                                    {!EVENT_PERIOD_OPTIONS.includes(eventPeriod) && (
                                                        <option value={eventPeriod}>{getMatchPeriodLabel(eventPeriod)}</option>
                                                    )}
                                                    {EVENT_PERIOD_OPTIONS.map((period) => (
                                                        <option key={period} value={period}>{getMatchPeriodLabel(period)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <select
                                                    value={ev.type}
                                                    style={{ background: '#222', border: 'none', color: '#fff', fontSize: '0.8rem', padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => {
                                                        const nextType = e.target.value;
                                                        const nextDefinition = eventDefinitionMap[nextType];
                                                        updateLocalEvent(ev.id, {
                                                            type: nextType,
                                                            team: nextDefinition?.team === 'none' ? null : ev.team ?? (nextDefinition?.team === 'required' ? 'home' : null),
                                                            playerId: nextDefinition?.player === 'none' ? null : ev.playerId ?? null,
                                                            playerName: nextDefinition?.player === 'none' ? '' : ev.playerName,
                                                            secondaryPlayerId: nextType === 'substitution' ? ev.secondaryPlayerId ?? null : null,
                                                            secondaryPlayerName: nextType === 'substitution' ? ev.secondaryPlayerName ?? '' : '',
                                                        });
                                                    }}
                                                >
                                                    {!eventDefinitionMap[ev.type] && (
                                                        <option value={ev.type}>{eventTypeLabel(ev.type, availableEventDefinitions)}</option>
                                                    )}
                                                    {availableEventDefinitions.map((definition) => (
                                                        <option key={definition.type} value={definition.type}>
                                                            {definition.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <select
                                                    value={ev.team || (selectedDefinition.team === 'required' ? 'home' : '')}
                                                    disabled={selectedDefinition.team === 'none'}
                                                    style={{ background: '#222', border: 'none', color: '#fff', fontSize: '0.8rem', padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => updateLocalEvent(ev.id, {
                                                        team: (e.target.value || null) as 'home' | 'away' | null,
                                                        playerId: null,
                                                        secondaryPlayerId: null,
                                                        secondaryPlayerName: '',
                                                    })}
                                                >
                                                    <option value="">-</option>
                                                    <option value="home">{homeName}</option>
                                                    <option value="away">{awayName}</option>
                                                </select>
                                            </div>
                                            <div className="event-list-detail" style={{ display: 'grid', gap: 6 }}>
                                                {selectedDefinition.player === 'none' ? (
                                                    <input
                                                        type="text"
                                                        value={ev.detail}
                                                        placeholder="Detalle del evento"
                                                        className="inline-input"
                                                        style={{ fontSize: '0.85rem' }}
                                                        onChange={(e) => updateLocalEvent(ev.id, { detail: e.target.value })}
                                                    />
                                                ) : (
                                                    <select
                                                        value={selectedPlayerValue}
                                                        disabled={!ev.team || (!availableEventSelection?.active.length && !selectedPlayerValue)}
                                                        className="inline-input inline-select"
                                                        style={{ fontSize: '0.85rem' }}
                                                        onChange={(e) => updateLocalEvent(ev.id, resolveEventPlayerSelection(ev.team, e.target.value))}
                                                    >
                                                        <option value="">
                                                            {!ev.team
                                                                ? 'Seleccioná un equipo'
                                                                : availableEventPlayers.length === 0
                                                                    ? 'Sin participantes cargados'
                                                                    : selectedDefinition.player === 'required'
                                                                        ? 'Seleccioná un jugador'
                                                                        : 'Sin jugador'}
                                                        </option>
                                                        {ev.team && availableEventSelection
                                                            ? renderEventPlayerOptions(
                                                                ev.team,
                                                                ev.type === 'substitution' ? 'active' : 'all',
                                                                selectedPlayerValue,
                                                                '',
                                                            )
                                                            : null}
                                                    </select>
                                                )}
                                                {selectedDefinition.player !== 'none' && ev.type === 'substitution' && (
                                                    <select
                                                        value={selectedSecondaryPlayerValue}
                                                        disabled={!ev.team || (!availableEventSelection?.substitutes.length && !selectedSecondaryPlayerValue)}
                                                        className="inline-input inline-select"
                                                        style={{ fontSize: '0.8rem', opacity: 0.85 }}
                                                        onChange={(e) => {
                                                            const selected = resolveEventPlayerSelection(ev.team, e.target.value);
                                                            const temporalPrefix = /\[temporal\]/i.test(ev.detail) ? '[temporal] ' : '';
                                                            updateLocalEvent(ev.id, {
                                                                secondaryPlayerId: selected.playerId,
                                                                secondaryPlayerName: selected.playerName,
                                                                detail: selected.playerName ? `${temporalPrefix}Entra: ${selected.playerName}` : '',
                                                            });
                                                        }}
                                                    >
                                                        <option value="">
                                                            {!ev.team
                                                                ? 'SeleccionÃ¡ un equipo'
                                                                : availableEventPlayers.length === 0
                                                                    ? 'Sin participantes cargados'
                                                                    : 'Jugador que entra'}
                                                        </option>
                                                        {ev.team && availableEventSelection
                                                            ? renderEventPlayerOptions(ev.team, 'substitute', selectedSecondaryPlayerValue, '')
                                                            : null}
                                                    </select>
                                                )}
                                                {selectedDefinition.player !== 'none' && ev.type !== 'substitution' && (
                                                    <input
                                                        type="text"
                                                        value={ev.detail}
                                                        placeholder="Detalle adicional (opcional)"
                                                        className="inline-input"
                                                        style={{ fontSize: '0.8rem', opacity: 0.85 }}
                                                        onChange={(e) => updateLocalEvent(ev.id, { detail: e.target.value })}
                                                    />
                                                )}
                                                {ev.type === 'substitution' ? (() => {
                                                    const chronologicalIndex = chronologicalIndexById.get(ev.id) ?? -1;
                                                    const mins = chronologicalIndex >= 0
                                                        ? minutesPlayedWhenSubstitutedOut(eventsChronologicalAsc, chronologicalIndex)
                                                        : null;
                                                    if (mins == null) return null;
                                                    return (
                                                        <span style={{ fontSize: '0.72rem', color: '#888', fontWeight: 600 }}>
                                                            {mins} min jugados (jugador que sale)
                                                        </span>
                                                    );
                                                })() : null}
                                                {eventScore && eventScore.points > 0 ? (
                                                    <span style={{ fontSize: '0.72rem', color: '#86efac', fontWeight: 900 }}>
                                                        Marcador {eventScore.home} - {eventScore.away}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="event-list-actions" style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                <button className="mc-btn mc-btn-outline" style={{ padding: 6, color: '#ef4444', border: '1px solid #333' }} onClick={() => removeLocalEvent(ev.id)}>
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </article>
                    </>
                )}

                {guidedEvent && (
                    <div className="guided-event-backdrop" role="dialog" aria-modal="true" aria-label="Carga guiada de evento">
                        <div className="guided-event-modal">
                            <div className="guided-event-header">
                                <div>
                                    <span className="guided-event-kicker">Nuevo evento</span>
                                    <h3>{guidedEvent.definition.label}</h3>
                                </div>
                                <button className="guided-event-close" type="button" onClick={() => setGuidedEvent(null)} aria-label="Cerrar">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="guided-event-steps">
                                <span className={guidedEvent.step === 'team' ? 'active' : ''}>1 Equipo</span>
                                <span className={guidedEvent.step === 'player' ? 'active' : ''}>2 Jugador</span>
                                <span className={guidedEvent.step === 'details' ? 'active' : ''}>3 Guardar</span>
                            </div>

                            {guidedEvent.step === 'team' && (
                                <div className="guided-event-body">
                                    <h4>{getGuidedTeamQuestion(guidedEvent)}</h4>
                                    <div className="guided-team-grid">
                                        <button className="guided-team-option" type="button" onClick={() => selectGuidedTeam('home')}>
                                            {homeLogo ? <img src={homeLogo} alt={homeName} /> : <Shield size={28} />}
                                            <span>{homeName}</span>
                                        </button>
                                        <button className="guided-team-option" type="button" onClick={() => selectGuidedTeam('away')}>
                                            {awayLogo ? <img src={awayLogo} alt={awayName} /> : <Shield size={28} />}
                                            <span>{awayName}</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {guidedEvent.step === 'player' && (
                                <div className="guided-event-body">
                                    <h4>Elegi jugador de {guidedTeamName}</h4>
                                    {guidedPlayers.length === 0 ? (
                                        <div className="guided-empty">
                                            No hay jugadores cargados para este equipo. Podes guardar el evento sin jugador o completar alineaciones primero.
                                        </div>
                                    ) : (
                                        <div className="guided-player-grid">
                                            {guidedPlayers.map((player) => (
                                                <button
                                                    key={`${player.playerId || player.name}`}
                                                    type="button"
                                                    className="guided-player-option"
                                                    onClick={() => selectGuidedPlayer(player)}
                                                >
                                                    {formatMatchPlayerOptionLabel(player)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <button className="guided-skip-player" type="button" onClick={() => selectGuidedPlayer(null)}>
                                        Continuar sin jugador
                                    </button>
                                </div>
                            )}

                            {guidedEvent.step === 'details' && (
                                <div className="guided-event-body">
                                    <div className="guided-details-grid">
                                        <label>
                                            <span>Minuto</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={160}
                                                value={guidedEventUsesClockMinute ? guidedEventClockMinute : guidedEvent.minute}
                                                readOnly={guidedEventUsesClockMinute}
                                                title={guidedEventUsesClockMinute ? 'Este evento usa el minuto actual del reloj del panel Eventos.' : undefined}
                                                onChange={(event) => {
                                                    if (guidedEventUsesClockMinute) return;
                                                    setGuidedEvent((current) => current ? { ...current, minute: event.target.value } : current);
                                                }}
                                            />
                                        </label>
                                        <label>
                                            <span>Periodo</span>
                                            <input
                                                value={getMatchPeriodLabel(getEventPeriodForType(guidedEvent.definition.type, clock.period || guidedEvent.period))}
                                                readOnly
                                                title="El evento se guarda en el periodo activo del partido."
                                            />
                                        </label>
                                        {guidedEvent.team && (
                                            <label>
                                                <span>Equipo</span>
                                                <select
                                                    value={guidedEvent.team}
                                                    onChange={(event) => selectGuidedTeam(event.target.value as 'home' | 'away')}
                                                >
                                                    <option value="home">{homeName}</option>
                                                    <option value="away">{awayName}</option>
                                                </select>
                                            </label>
                                        )}
                                    </div>

                                    {isGoalKickEventType(guidedEvent.definition.type) && (
                                        <div className="guided-option-block">
                                            <span>¿Entró entre los palos? (puntos y estadísticas)</span>
                                            <div className="guided-toggle-row">
                                                <button
                                                    type="button"
                                                    className={guidedEvent.goalKickResult === 'made' ? 'active' : ''}
                                                    onClick={() => setGuidedEvent((current) => current ? { ...current, goalKickResult: 'made' } : current)}
                                                >
                                                    Sí, convertida
                                                </button>
                                                <button
                                                    type="button"
                                                    className={guidedEvent.goalKickResult === 'missed' ? 'active' : ''}
                                                    onClick={() => setGuidedEvent((current) => current ? { ...current, goalKickResult: 'missed' } : current)}
                                                >
                                                    No, fallada
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {requiresContestOutcome(guidedEvent.definition.type) && (
                                        <div className="guided-option-block">
                                            <span>Resultado</span>
                                            <div className="guided-toggle-row">
                                                <button
                                                    type="button"
                                                    className={guidedEvent.contestOutcome === 'won' ? 'active' : ''}
                                                    onClick={() => setGuidedEvent((current) => current ? { ...current, contestOutcome: 'won' } : current)}
                                                >
                                                    Ganado
                                                </button>
                                                <button
                                                    type="button"
                                                    className={guidedEvent.contestOutcome === 'lost' ? 'active' : ''}
                                                    onClick={() => setGuidedEvent((current) => current ? { ...current, contestOutcome: 'lost' } : current)}
                                                >
                                                    Perdido
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {isPenaltyCommittedEvent(guidedEvent.definition.type) && (
                                        <label className="guided-detail-text">
                                            <span>Por que se comete el penal?</span>
                                            <select
                                                value={guidedEvent.detail}
                                                onChange={(event) => setGuidedEvent((current) => current ? { ...current, detail: event.target.value } : current)}
                                            >
                                                <option value="">Selecciona un motivo</option>
                                                {PENALTY_COMMITTED_REASONS.map((reason) => (
                                                    <option key={reason} value={reason}>{reason}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}

                                    {(guidedEvent.definition.type === 'substitution' || guidedEvent.definition.type === 'try') && guidedEvent.team && (
                                        <label className="guided-secondary-select">
                                            <span>{guidedEvent.definition.type === 'try' ? 'Asistencia opcional' : 'Jugador que entra'}</span>
                                            <select
                                                value={guidedEvent.secondaryPlayerName}
                                                onChange={(event) => selectGuidedSecondaryPlayer(event.target.value)}
                                            >
                                                <option value="">Sin seleccionar</option>
                                                {guidedSecondaryPlayers.map((player) => (
                                                    <option key={`secondary-${player.playerId || player.name}`} value={player.name}>
                                                        {formatMatchPlayerOptionLabel(player)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    {guidedEvent.definition.type === 'substitution' && (
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={guidedEvent.isTemporary}
                                                onChange={(event) => setGuidedEvent((current) => current ? { ...current, isTemporary: event.target.checked } : current)}
                                            />
                                            <span>Cambio temporal</span>
                                        </label>
                                    )}

                                    {!isPenaltyCommittedEvent(guidedEvent.definition.type) && (
                                        <label className="guided-detail-text">
                                            <span>Detalle opcional</span>
                                            <textarea
                                                value={guidedEvent.detail}
                                                onChange={(event) => setGuidedEvent((current) => current ? { ...current, detail: event.target.value } : current)}
                                                rows={3}
                                                placeholder="Zona, causa, contexto o aclaracion"
                                            />
                                        </label>
                                    )}
                                </div>
                            )}

                            <div className="guided-event-footer">
                                <button className="mc-btn mc-btn-outline" type="button" onClick={() => setGuidedEvent(null)}>Cancelar</button>
                                {(guidedEvent.step === 'player' || (guidedEvent.step === 'details' && guidedEvent.definition.team !== 'none')) && (
                                    <button
                                        className="mc-btn mc-btn-outline"
                                        type="button"
                                        onClick={() => setGuidedEvent((current) => {
                                            if (!current) return current;
                                            if (current.step === 'details' && current.definition.team !== 'none') {
                                                return { ...current, step: current.definition.player === 'none' ? 'team' : 'player' };
                                            }
                                            if (current.step === 'player') return { ...current, step: 'team' };
                                            return current;
                                        })}
                                    >
                                        Volver
                                    </button>
                                )}
                                {guidedEvent.step === 'details' && (
                                    <button className="mc-btn mc-btn-primary" type="button" onClick={saveGuidedEvent} disabled={saving}>
                                        {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                        Guardar evento
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats */}
                {activeTab === 'estadisticas' && (
                    <div className="stats-workspace">
                        {events.length === 0 ? (
                            <article className="mc-partition">
                                <div className="mc-card-body">
                                    <p className="empty-msg">Las estadisticas se generan automaticamente a partir de los eventos. Carga eventos primero.</p>
                                </div>
                            </article>
                        ) : (
                            <>
                            <article className="mc-partition stats-dashboard">
                                <div className="mc-card-header">
                                    <h4>Estadisticas del Partido</h4>
                                    <span className="stats-header-note">
                                        {scoreMismatch ? 'Calculado desde eventos' : 'Actualizacion automatica'}
                                    </span>
                                </div>
                                <div className="mc-card-body stats-dashboard-body">
                                    <div className="stats-scoreline">
                                        <div className="stats-scoreline-team">
                                            <span>{homeName}</span>
                                            <strong>{completeMatchStats.points.home}</strong>
                                        </div>
                                        <div className="stats-scoreline-divider">PTS</div>
                                        <div className="stats-scoreline-team away">
                                            <span>{awayName}</span>
                                            <strong>{completeMatchStats.points.away}</strong>
                                        </div>
                                    </div>

                                    <div className="stats-kpi-grid">
                                        <div className="stats-kpi">
                                            <span>Eventos cargados</span>
                                            <strong>{completeMatchStats.totalEvents}</strong>
                                        </div>
                                        <div className="stats-kpi">
                                            <span>A los palos</span>
                                            <strong>
                                                {completeMatchStats.goalKicksMade.home + completeMatchStats.goalKicksMade.away}
                                                /{completeMatchStats.goalKickAttempts.home + completeMatchStats.goalKickAttempts.away}
                                            </strong>
                                        </div>
                                        <div className="stats-kpi">
                                            <span>Errores</span>
                                            <strong>
                                                {completeMatchStats.knockOns.home + completeMatchStats.knockOns.away
                                                    + completeMatchStats.forwardPasses.home + completeMatchStats.forwardPasses.away
                                                    + completeMatchStats.handlingErrors.home + completeMatchStats.handlingErrors.away}
                                            </strong>
                                        </div>
                                        <div className="stats-kpi">
                                            <span>Disciplina</span>
                                            <strong>
                                                {completeMatchStats.yellowCards.home + completeMatchStats.yellowCards.away
                                                    + completeMatchStats.redCards.home + completeMatchStats.redCards.away
                                                    + completeMatchStats.penaltiesCommitted.home + completeMatchStats.penaltiesCommitted.away}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="stats-panel-tabs" role="tablist" aria-label="Tipos de estadisticas">
                                        {completeStatTabs.map((tab) => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                role="tab"
                                                aria-selected={effectiveStatsPanelTab === tab.id}
                                                className={`stats-panel-tab${effectiveStatsPanelTab === tab.id ? ' is-active' : ''}`}
                                                onClick={() => setStatsPanelTab(tab.id)}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    {completeStatTabs.length === 0 ? (
                                        <p className="empty-msg" style={{ margin: 0 }}>No hay metricas para mostrar con los eventos actuales.</p>
                                    ) : null}

                                    <div className="stats-section-grid">
                                        {(activeStatTabContent?.sections ?? []).map((section) => (
                                            <section className="stats-section" key={`${effectiveStatsPanelTab}-${section.title}`}>
                                                <div className="stats-section-header">
                                                    <h5>{section.title}</h5>
                                                    <span>{section.rows.length}</span>
                                                </div>
                                                <div className="stats-rows">
                                                    {section.rows.map((row) => {
                                                        if (row.valueKind === 'percent') {
                                                            const h = row.home;
                                                            const a = row.away;
                                                            const hLabel = h < 0 ? '—' : `${h.toFixed(1)}%`;
                                                            const aLabel = a < 0 ? '—' : `${a.toFixed(1)}%`;
                                                            return (
                                                                <div className={row.accent ? 'stats-row accent' : 'stats-row'} key={row.key}>
                                                                    <strong className="stats-row-value home">{hLabel}</strong>
                                                                    <div className="stats-row-bar home" aria-hidden="true">
                                                                        <span style={{ width: `${h < 0 ? 0 : Math.min(100, h)}%` }} />
                                                                    </div>
                                                                    <span className="stats-row-label" title={row.tooltip}>{row.label}</span>
                                                                    <div className="stats-row-bar away" aria-hidden="true">
                                                                        <span style={{ width: `${a < 0 ? 0 : Math.min(100, a)}%` }} />
                                                                    </div>
                                                                    <strong className="stats-row-value away">{aLabel}</strong>
                                                                </div>
                                                            );
                                                        }
                                                        const total = row.home + row.away;
                                                        const homePct = total > 0 ? (row.home / total) * 100 : 0;
                                                        const awayPct = total > 0 ? (row.away / total) * 100 : 0;

                                                        return (
                                                            <div className={row.accent ? 'stats-row accent' : 'stats-row'} key={row.key}>
                                                                <strong className="stats-row-value home">{row.home}</strong>
                                                                <div className="stats-row-bar home" aria-hidden="true">
                                                                    <span style={{ width: `${homePct}%` }} />
                                                                </div>
                                                                <span className="stats-row-label" title={row.tooltip}>{row.label}</span>
                                                                <div className="stats-row-bar away" aria-hidden="true">
                                                                    <span style={{ width: `${awayPct}%` }} />
                                                                </div>
                                                                <strong className="stats-row-value away">{row.away}</strong>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            </article>

                            <article className="mc-partition" style={{ background: '#111' }}>
                                <div className="mc-card-header">
                                    <h4>Comparativo por Equipo</h4>
                                    <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 800 }}>
                                        {scoreMismatch ? 'Segun eventos' : 'Eventos'}
                                    </span>
                                </div>
                                <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {teamComparableStats.map(stat => {
                                        const total = stat.h + stat.a || 1;
                                        const hPct = (stat.h / total) * 100;
                                        return (
                                            <div key={stat.label} className="team-compare-row" style={{ display: 'grid', gridTemplateColumns: '60px 1fr 200px 1fr 60px', alignItems: 'center', gap: 16 }}>
                                                <div style={{ textAlign: 'right', fontWeight: 900, fontSize: '1.2rem' }}>{stat.h}</div>
                                                <div style={{ height: 8, background: '#222', borderRadius: 4, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' }}>
                                                    <div style={{ width: hPct + '%', background: 'var(--accent)', transition: 'width .3s' }}></div>
                                                </div>
                                                <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>{stat.label}</div>
                                                <div style={{ height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
                                                    <div style={{ width: (100 - hPct) + '%', background: '#555', transition: 'width .3s' }}></div>
                                                </div>
                                                <div style={{ textAlign: 'left', fontWeight: 900, fontSize: '1.2rem' }}>{stat.a}</div>
                                            </div>
                                        );
                                    })}
                                    {teamComparableKickRates.length > 0 && (
                                        <div style={{ borderTop: '1px solid #262626', paddingTop: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Tiros a palos (efectividad)
                                            </div>
                                            {teamComparableKickRates.map((row) => {
                                                const hW = row.h < 0 ? 0 : Math.min(100, row.h);
                                                const aW = row.a < 0 ? 0 : Math.min(100, row.a);
                                                return (
                                                    <div key={row.key} className="team-compare-row" style={{ display: 'grid', gridTemplateColumns: '60px 1fr 200px 1fr 60px', alignItems: 'center', gap: 16 }}>
                                                        <div style={{ textAlign: 'right', fontWeight: 900, fontSize: '1.05rem' }}>{row.h < 0 ? '—' : `${row.h.toFixed(1)}%`}</div>
                                                        <div style={{ height: 8, background: '#222', borderRadius: 4, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' }}>
                                                            <div style={{ width: `${hW}%`, background: 'var(--accent)', transition: 'width .3s' }} />
                                                        </div>
                                                        <div style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#888', textTransform: 'uppercase' }} title={row.title}>
                                                            {row.label}
                                                        </div>
                                                        <div style={{ height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
                                                            <div style={{ width: `${aW}%`, background: '#555', transition: 'width .3s' }} />
                                                        </div>
                                                        <div style={{ textAlign: 'left', fontWeight: 900, fontSize: '1.05rem' }}>{row.a < 0 ? '—' : `${row.a.toFixed(1)}%`}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Score breakdown */}
                                <div className="mc-card-body" style={{ borderTop: '1px solid #222', paddingTop: 24 }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', color: '#888', marginBottom: 16 }}>Desglose de Puntos</h4>
                                    <div className="score-breakdown-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        {(['home', 'away'] as const).map(team => {
                                            const rows = scoringBreakdown
                                                .map((definition) => {
                                                    const count = team === 'home' ? definition.homeCount : definition.awayCount;
                                                    return {
                                                        key: definition.type,
                                                        label: definition.label,
                                                        count,
                                                        points: definition.points,
                                                        subtotal: count * definition.points,
                                                    };
                                                })
                                                .filter((row) => row.count > 0);
                                            const total = rows.reduce((sum, row) => sum + row.subtotal, 0);
                                            const clubName = team === 'home' ? homeName : awayName;
                                            return (
                                                <div key={team} style={{ padding: 16, background: '#1a1a1a', borderRadius: 8 }}>
                                                    <div style={{ fontWeight: 900, marginBottom: 12, fontSize: '0.85rem' }}>{clubName}</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                                                        {rows.length === 0 ? (
                                                            <div style={{ color: '#666' }}>Sin eventos de puntuacion.</div>
                                                        ) : rows.map((row) => (
                                                            <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#888' }}>{row.label} ({row.count} x {row.points})</span>
                                                                <span style={{ fontWeight: 800 }}>{row.subtotal}</span>
                                                            </div>
                                                        ))}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: 6, marginTop: 4 }}><span style={{ fontWeight: 900 }}>TOTAL</span><span style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '1.1rem' }}>{total}</span></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="mc-card-body" style={{ borderTop: '1px solid #222', paddingTop: 18 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                                        <h4 style={{ fontSize: '0.56rem', fontWeight: 900, textTransform: 'uppercase', color: '#888', margin: 0 }}>Estadisticas por Jugador</h4>
                                        <span style={{ fontSize: '0.55rem', color: '#666' }}>
                                            Solo se computan eventos con jugador asignado.
                                        </span>
                                    </div>
                                    {topPlayerStats.length > 0 && (
                                        <div className="stats-player-leaders">
                                            <div className="stats-section-header">
                                                <h5>Jugadores destacados</h5>
                                                <span>Top {topPlayerStats.length}</span>
                                            </div>
                                            <div className="stats-leader-list">
                                                {topPlayerStats.map((player, index) => (
                                                    <div key={player.key} className="stats-leader-row">
                                                        <span className="stats-leader-rank">{index + 1}</span>
                                                        <div>
                                                            <strong>{player.name}</strong>
                                                            <span>{player.team === 'home' ? homeName : awayName}</span>
                                                        </div>
                                                        <strong>{player.points} pts</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="player-stats-grid">
                                        {([
                                            { team: 'home' as const, label: homeName, rows: playerStatsByTeam.home },
                                            { team: 'away' as const, label: awayName, rows: playerStatsByTeam.away },
                                        ]).map((group) => (
                                            <section key={group.team} className="player-stats-team">
                                                <div className="player-stats-team-header">
                                                    <div>{group.label}</div>
                                                    <span>
                                                        {group.rows.length} jugador{group.rows.length === 1 ? '' : 'es'}
                                                    </span>
                                                </div>
                                                {group.rows.length === 0 ? (
                                                    <div className="player-stats-empty">
                                                        No hay eventos con jugador identificado para este equipo.
                                                    </div>
                                                ) : (
                                                    <div className="player-stats-card-grid">
                                                        {group.rows.map((player) => (
                                                            <article key={player.key} className="player-stat-card">
                                                                <div className="player-stat-head">
                                                                    <div className="player-stat-main">
                                                                        <strong title={player.name}>{player.name}</strong>
                                                                        <span>
                                                                    {player.totalEvents} evento{player.totalEvents === 1 ? '' : 's'} · ultimo {player.lastMinute}&apos;
                                                                        </span>
                                                                    </div>
                                                                    <div className="player-stat-points">
                                                                        <strong className={player.points > 0 ? 'is-positive' : ''}>{player.points}</strong>
                                                                        <span>puntos</span>
                                                                    </div>
                                                                </div>
                                                                <div className="player-stat-breakdown">
                                                                    {player.breakdown.map((entry) => (
                                                                        <span
                                                                            className="player-stat-chip"
                                                                            key={`${player.key}-${entry.type}`}
                                                                            style={{
                                                                                background: `${entry.color}18`,
                                                                                borderColor: `${entry.color}33`,
                                                                                color: entry.color,
                                                                            }}
                                                                        >
                                                                            {entry.label} x{entry.count}
                                                                            {entry.totalPoints > 0 ? <strong>+{entry.totalPoints}</strong> : null}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </article>
                                                        ))}
                                                    </div>
                                                )}
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            </article>
                            </>
                        )}
                    </div>
                )}

                {/* Contenido */}
                {activeTab === 'contenido' && (
                    <article className="mc-partition content-workspace" style={{ maxWidth: 800, margin: '0 auto', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <div className="mc-grid-2">
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 8, textTransform: 'uppercase' }}>Planilla del partido</label>
                                    <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem', lineHeight: 1.45 }}>
                                        Genera un resumen imprimible con logos, resultado, puntos, plantillas, eventos y estadisticas.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="mc-btn mc-btn-primary"
                                    onClick={handleExportMatchSheetPdf}
                                >
                                    <FileText size={14} /> Exportar planilla PDF
                                </button>
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Transmision disponible</label>
                                {watchUrl ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 12, color: '#fff', borderRadius: 4, boxSizing: 'border-box', wordBreak: 'break-all' }}>
                                            {watchUrl}
                                        </div>
                                        <button
                                            type="button"
                                            className="mc-btn mc-btn-outline"
                                            style={{ alignSelf: 'flex-start' }}
                                            onClick={() => window.open(watchUrl, '_blank')}
                                        >
                                            <Video size={14} /> Abrir enlace
                                        </button>
                                    </div>
                                ) : (
                                    <p className="empty-msg" style={{ margin: 0 }}>No hay URL de transmision cargada para este partido.</p>
                                )}
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Replay disponible</label>
                                {match.replay_url ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 12, color: '#fff', borderRadius: 4, boxSizing: 'border-box', wordBreak: 'break-all' }}>
                                            {match.replay_url}
                                        </div>
                                        <button
                                            type="button"
                                            className="mc-btn mc-btn-outline"
                                            style={{ alignSelf: 'flex-start' }}
                                            onClick={() => window.open(match.replay_url!, '_blank')}
                                        >
                                            <Search size={14} /> Abrir replay
                                        </button>
                                    </div>
                                ) : (
                                    <p className="empty-msg" style={{ margin: 0 }}>No hay replay cargado para este partido.</p>
                                )}
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222', gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Cronica del Partido</label>
                                <textarea
                                    value={match.notes || ''}
                                    placeholder="Redactar la cronica oficial..."
                                    rows={6}
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 16, color: '#fff', borderRadius: 4, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                    onChange={(e) => setMatch((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                                <p style={{ marginTop: 10, marginBottom: 0, fontSize: '0.75rem', color: '#666' }}>
                                    Esta cronica se guarda con el boton Guardar del encabezado.
                                </p>
                            </div>
                        </div>
                    </article>
                )}

                {/* Oficiales */}
                {activeTab === 'oficiales' && (
                    <article className="mc-partition officials-workspace" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <div className="mc-card-header"><h4>Autoridades del Partido</h4></div>
                        <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 16 }}>
                                <p style={{ marginTop: 0, marginBottom: 12, color: '#ddd', lineHeight: 1.6 }}>
                                    Esta vista ya no muestra campos editables sin respaldo real. El esquema actual no soporta persistencia detallada de oficiales desde esta consola.
                                </p>
                                <p style={{ margin: 0, color: '#666', fontSize: '0.8rem' }}>
                                    Si el modulo vuelve a tener soporte de datos, conviene modelar arbitro principal, asistentes y staff medico como estructura dedicada.
                                </p>
                            </div>
                        </div>
                    </article>
                )}

                {/* Configuracion */}
                {activeTab === 'configuracion' && (
                    <article className="mc-partition config-workspace">
                        <div className="mc-card-header config-parameters-header">
                            <h4>Parametros del Partido</h4>
                            <span className={`config-save-note ${hasUnsavedMatchParameters ? 'is-dirty' : ''}`}>
                                {scoreDirty
                                    ? 'Cambios sin guardar en marcador.'
                                    : hasUnsavedMatchParameters
                                        ? 'Cambios administrativos sin guardar.'
                                        : 'El marcador oficial manda sobre la timeline.'}
                            </span>
                        </div>
                        <div className={`mc-card-body config-parameters-grid ${match.status === 'final' && score.home === score.away ? 'has-shootout' : ''}`}>
                            <div className="form-group config-field-status">
                                <label>Estado Actual</label>
                                <select
                                    value={match.status}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => {
                                        const nextStatus = e.target.value;
                                        setMatch((prev) => ({ ...prev, status: nextStatus }));
                                    }}
                                >
                                    <option value="scheduled">Programado</option>
                                    <option value="live">En Vivo</option>
                                    <option value="final">Finalizado</option>
                                    <option value="postponed">Aplazado</option>
                                    <option value="suspended">Suspendido</option>
                                    <option value="cancelled">Cancelado</option>
                                </select>
                            </div>
                            <div className="form-group config-field-date">
                                <label>Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    value={dateTimeDraft}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => setDateTimeDraft(e.target.value)}
                                />
                            </div>
                            <div className="form-group config-field-home-score">
                                <label>Marcador Local</label>
                                <input
                                    type="number"
                                    value={score.home}
                                    min={0}
                                    readOnly={isManualScoreLocked}
                                    aria-readonly={isManualScoreLocked}
                                    title={isManualScoreLocked ? 'El marcador se calcula con los goles cargados en la cronologia.' : undefined}
                                    style={{ borderRadius: 4, ...(isManualScoreLocked ? { opacity: 0.7, cursor: 'not-allowed' } : null) }}
                                    onChange={(e) => handleScoreInputChange('home', e.target.value)}
                                />
                            </div>
                            <div className="form-group config-field-away-score">
                                <label>Marcador Visitante</label>
                                <input
                                    type="number"
                                    value={score.away}
                                    min={0}
                                    readOnly={isManualScoreLocked}
                                    aria-readonly={isManualScoreLocked}
                                    title={isManualScoreLocked ? 'El marcador se calcula con los goles cargados en la cronologia.' : undefined}
                                    style={{ borderRadius: 4, ...(isManualScoreLocked ? { opacity: 0.7, cursor: 'not-allowed' } : null) }}
                                    onChange={(e) => handleScoreInputChange('away', e.target.value)}
                                />
                            </div>
                            {isManualScoreLocked ? (
                                <p
                                    style={{
                                        gridColumn: '1 / -1',
                                        margin: '4px 0 0',
                                        fontSize: 12,
                                        opacity: 0.75,
                                    }}
                                >
                                    El marcador se construye con los goles de la cronología. Para
                                    corregirlo, agregá o borrá el evento que corresponda.
                                </p>
                            ) : null}
                            {match.status === 'final' && score.home === score.away ? (
                                <>
                                    <div className="form-group config-field-home-penalty">
                                        <label>Penales / Shootout Local</label>
                                        <input
                                            type="number"
                                            value={score.penalties?.home ?? ''}
                                            min={0}
                                            placeholder="Opcional"
                                            style={{ borderRadius: 4 }}
                                            onChange={(e) => handlePenaltyInputChange('home', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group config-field-away-penalty">
                                        <label>Penales / Shootout Visitante</label>
                                        <input
                                            type="number"
                                            value={score.penalties?.away ?? ''}
                                            min={0}
                                            placeholder="Opcional"
                                            style={{ borderRadius: 4 }}
                                            onChange={(e) => handlePenaltyInputChange('away', e.target.value)}
                                        />
                                    </div>
                                </>
                            ) : null}
                            <div className="form-group config-field-venue">
                                <label>Estadio / Venue</label>
                                <input
                                    type="text"
                                    value={match.venue || ''}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => setMatch((prev) => ({ ...prev, venue: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* â”€â”€ PUNTOS DEL PARTIDO â”€â”€ */}
                        <div className="config-points-section">
                            <div className="config-points-header">
                                <h4 style={{ margin: 0 }}>Puntos del Partido</h4>
                                <span style={{
                                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                                    background: localPoints.points_autocalculated ? 'rgba(0,163,101,0.2)' : 'rgba(245,158,11,0.2)',
                                    color: localPoints.points_autocalculated ? 'var(--accent)' : '#f59e0b',
                                    border: `1px solid ${localPoints.points_autocalculated ? 'var(--accent)' : '#f59e0b'}`,
                                }}>
                                    {localPoints.points_autocalculated ? 'Autocalculado' : 'Editado manualmente'}
                                </span>
                            </div>
                            <p className="config-points-note">
                                Los puntos base se completan automaticamente segun las reglas del partido. Podes agregar bonus o penalizaciones manuales.
                            </p>

                            <div className="points-grid config-points-grid">
                                <div className="form-group">
                                    <label>Puntos base local</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={localPoints.home_base_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = Math.max(0, parsePointInput(e.target.value));
                                            setLocalPoints(prev => ({ ...prev, home_base_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Puntos base visitante</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={localPoints.away_base_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = Math.max(0, parsePointInput(e.target.value));
                                            setLocalPoints(prev => ({ ...prev, away_base_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Bonus / modificador local</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={localPoints.home_bonus_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = parsePointInput(e.target.value);
                                            setLocalPoints(prev => ({ ...prev, home_bonus_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                    <small style={{ color: '#666', fontSize: 11 }}>Permite sumar o restar puntos manualmente.</small>
                                </div>
                                <div className="form-group">
                                    <label>Bonus / modificador visitante</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={localPoints.away_bonus_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = parsePointInput(e.target.value);
                                            setLocalPoints(prev => ({ ...prev, away_bonus_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                    <small style={{ color: '#666', fontSize: 11 }}>Permite sumar o restar puntos manualmente.</small>
                                </div>
                            </div>

                            {/* Totals (read-only) */}
                            <div className="points-grid config-points-totals">
                                {[
                                    { label: 'Total local', value: (localPoints.home_base_points ?? 0) + (localPoints.home_bonus_points ?? 0) },
                                    { label: 'Total visitante', value: (localPoints.away_base_points ?? 0) + (localPoints.away_bonus_points ?? 0) },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ background: '#111', borderRadius: 4, padding: '10px 14px' }}>
                                        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
                                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Override reason */}
                            {!localPoints.points_autocalculated && (
                                <div className="form-group">
                                    <label>Motivo de ajuste (opcional)</label>
                                    <textarea
                                        rows={2}
                                        value={localPoints.points_override_reason ?? ''}
                                        placeholder="Ej: Sancion disciplinaria, correccion de resultado..."
                                        style={{ borderRadius: 4, resize: 'vertical' }}
                                        onChange={(e) => setLocalPoints(prev => ({ ...prev, points_override_reason: e.target.value }))}
                                    />
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={handleRecalculate}
                                    style={{
                                        background: 'transparent', border: '1px solid #333', color: '#aaa',
                                        borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                                    }}
                                >
                                    Recalcular automaticamente
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSavePoints}
                                    disabled={savingPoints}
                                    style={{
                                        background: 'var(--accent)', border: 'none', color: '#000',
                                        borderRadius: 4, padding: '8px 20px', cursor: savingPoints ? 'not-allowed' : 'pointer',
                                        fontWeight: 700, fontSize: 13, opacity: savingPoints ? 0.6 : 1,
                                    }}
                                >
                                    {savingPoints ? 'Guardando...' : 'Guardar puntos'}
                                </button>
                            </div>
                        </div>
                    </article>
                )}

            </section>
        </main>
    );
}
