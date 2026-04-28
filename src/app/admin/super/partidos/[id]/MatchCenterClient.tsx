'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Save, Share2, ChevronLeft, Layout, Users, Clock,
    BarChart2, Shield, Settings, ImageIcon, Plus, RefreshCw, X, Video, Search, AlertTriangle, CheckCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
    buildMatchEventDefinitionMap,
    getDefaultMatchEventDefinitions,
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
    getConfiguredEventPoints,
    buildCompleteMatchStats,
    buildCompleteStatTabs,
} from '@/lib/matchStatsFromEvents';
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
    // Points per match
    home_base_points:       number | null;
    away_base_points:       number | null;
    home_bonus_points:      number | null;
    away_bonus_points:      number | null;
    points_autocalculated:  boolean | null;
    points_override_reason: string | null;
}

type ApplyMatchResponseOptions = {
    preserveLineupsIfIncomingEmpty?: boolean;
    preserveUnsavedScore?: boolean;
    preserveUnsavedClock?: boolean;
    preserveUnsavedEvents?: boolean;
    preserveUnsavedLineups?: boolean;
};

type PersistMatchPatchOptions = {
    includePoints?: boolean;
    preserveLineupsIfIncomingEmpty?: boolean;
    preserveUnsavedScore?: boolean;
    preserveUnsavedClock?: boolean;
    preserveUnsavedEvents?: boolean;
    preserveUnsavedLineups?: boolean;
    syncDirtyEvents?: boolean;
};

type PersistMatchWarnings = {
    lineupsNotPersisted?: boolean;
    clockNotPersisted?: boolean;
};

function normalizeMatchEvents(events: MatchRow['events']): MatchEvent[] {
    return Array.isArray(events)
        ? events.map((event) => {
            const detail = String(event.detail || '');
            const secondaryPlayerName = event.secondaryPlayerName
                || (event.type === 'substitution' ? parseSubstitutionIncomingPlayer(detail) : '');
            return {
                ...event,
                secondaryPlayerId: event.secondaryPlayerId || null,
                secondaryPlayerName,
                detail: event.detail || (event.type === 'substitution' && secondaryPlayerName ? `Entra: ${secondaryPlayerName}` : ''),
            };
        })
        : [];
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

function normalizeClockMinute(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeClockSeconds(
    value: unknown,
) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;

    if (parsed >= 60) {
        return Math.max(0, Math.trunc(parsed % 60));
    }

    if (parsed < 0) return 0;
    return Math.min(59, Math.trunc(parsed));
}

function normalizeMatchClock(clock: MatchClock | null | undefined): MatchClock {
    const normalizedMinute = normalizeClockMinute(clock?.minute);
    const normalizedSeconds = normalizeClockSeconds(clock?.seconds);
    const rawSeconds = Number(clock?.seconds);
    const hasOnlyLegacyTotalSeconds =
        !Number.isFinite(Number(clock?.minute))
        && Number.isFinite(rawSeconds)
        && rawSeconds >= 60;

    if (hasOnlyLegacyTotalSeconds) {
        return {
            minute: Math.max(0, Math.trunc(rawSeconds / 60)),
            seconds: Math.max(0, Math.trunc(rawSeconds % 60)),
            period: typeof clock?.period === 'string' ? clock.period : '',
            running: Boolean(clock?.running),
        };
    }

    return {
        minute: normalizedMinute,
        seconds: normalizedSeconds,
        period: typeof clock?.period === 'string' ? clock.period : '',
        running: Boolean(clock?.running),
    };
}

function areMatchClocksEqual(left: MatchClock | null | undefined, right: MatchClock | null | undefined) {
    const normalizedLeft = normalizeMatchClock(left);
    const normalizedRight = normalizeMatchClock(right);

    return (
        normalizedLeft.minute === normalizedRight.minute
        && normalizedLeft.seconds === normalizedRight.seconds
        && (normalizedLeft.period || '') === (normalizedRight.period || '')
        && Boolean(normalizedLeft.running) === Boolean(normalizedRight.running)
    );
}

function incrementMatchClock(clock: MatchClock) {
    const normalizedClock = normalizeMatchClock(clock);
    const totalSeconds = (normalizedClock.minute || 0) * 60 + (normalizedClock.seconds || 0) + 1;

    return {
        ...normalizedClock,
        minute: Math.floor(totalSeconds / 60),
        seconds: totalSeconds % 60,
    };
}

function formatMatchClock(clock: MatchClock | null | undefined) {
    const normalizedClock = normalizeMatchClock(clock);
    const minute = String(normalizedClock.minute || 0).padStart(2, '0');
    const seconds = String(normalizedClock.seconds || 0).padStart(2, '0');
    const period = (normalizedClock.period || '').trim();

    return period ? `${minute}:${seconds} - ${period}` : `${minute}:${seconds}`;
}

function deriveClockFromKickoff(
    dateTime: string | null | undefined,
    fallbackPeriod?: string | null,
): MatchClock | null {
    if (!dateTime) return null;

    const kickoff = new Date(dateTime);
    if (Number.isNaN(kickoff.getTime())) return null;

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - kickoff.getTime()) / 1000));

    return {
        minute: Math.floor(elapsedSeconds / 60),
        seconds: elapsedSeconds % 60,
        period: (fallbackPeriod || '').trim() || '1T',
        running: true,
    };
}

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
        if (points > 0 && event.team === 'home') {
            home += points;
            hasScoringEvents = true;
        }
        if (points > 0 && event.team === 'away') {
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
    detail: string;
    goalKickResult: GuidedGoalKickResult;
    contestOutcome: GuidedContestOutcome;
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
        return `Entra: ${draft.secondaryPlayerName.trim()}`;
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

function buildLinkedEventPlayers(players: LineupPlayer[]) {
    const linked = players
        .filter((player) => Boolean(player.name.trim()))
        .map((player) => ({
            playerId: player.id || null,
            name: player.name.trim(),
        }));

    const unique = new Map<string, { playerId: string | null; name: string }>();
    linked.forEach((entry) => {
        const key = normalizeLookupKey(entry.name);
        if (!key || unique.has(key)) return;
        unique.set(key, entry);
    });

    return Array.from(unique.values()).sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));
}

function isEventPlayerAvailable(
    options: Array<{ playerId: string | null; name: string }>,
    value: string | null | undefined,
) {
    const key = normalizeLookupKey(value);
    if (!key) return false;
    return options.some((entry) => normalizeLookupKey(entry.name) === key);
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
    const kickoffClock = initialMatch.status === 'live'
        ? deriveClockFromKickoff(initialMatch.date_time, initialMatch.clock?.period)
        : null;
    const initialClock = normalizeMatchClock(
        initialMatch.clock?.minute || initialMatch.clock?.seconds || initialMatch.clock?.period
            ? initialMatch.clock
            : kickoffClock,
    );

    const [match, setMatch] = useState<MatchRow>(initialMatch);
    const [activeTab, setActiveTab] = useState<string>(resolvedInitialTab);
    const [statsPanelTab, setStatsPanelTab] = useState<string>('marcador');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);
    const [scoreDraft, setScoreDraft] = useState<MatchScore>(initialScore);
    const [clockDraft, setClockDraft] = useState<MatchClock>(initialClock);

    // Editable state for events & lineups (local mirrors of DB JSONB)
    const [localEvents, setLocalEvents] = useState<MatchEvent[]>(initialEvents);
    const [localLineups, setLocalLineups] = useState<MatchLineups>(initialLineups);
    const persistedMatchRef = useRef<MatchRow>(initialMatch);
    const matchDraftRef = useRef<MatchRow>(initialMatch);
    const persistedEventsRef = useRef<MatchEvent[]>(initialEvents);
    const persistedLineupsRef = useRef<MatchLineups>(initialLineups);
    const persistedScoreRef = useRef<MatchScore>(initialScore);
    const persistedClockRef = useRef<MatchClock>(initialClock);
    const scoreDraftRef = useRef<MatchScore>(initialScore);
    const clockDraftRef = useRef<MatchClock>(initialClock);
    const localEventsRef = useRef<MatchEvent[]>(initialEvents);
    const localLineupsRef = useRef<MatchLineups>(initialLineups);

    // Editable state for per-match points
    const [localPoints, setLocalPoints] = useState<MatchPoints>(() => toLocalPoints(initialMatch));
    const [savingPoints, setSavingPoints] = useState(false);
    const [pointsRules, setPointsRules] = useState<PointsRules>(DEFAULT_POINTS_RULES);
    const [matchSportId, setMatchSportId] = useState<string | null>(
        initialMatch.tournament?.sport_id ?? initialMatch.tournament?.sportId ?? null,
    );
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
    const draftKickoffIso = useMemo(() => {
        if (!dateTimeDraft) return match.date_time;
        const [date, time] = dateTimeDraft.split('T');
        return combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE) || match.date_time;
    }, [dateTimeDraft, match.date_time]);

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
        clockDraftRef.current = clockDraft;
    }, [clockDraft]);

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

    const eventPlayerOptions = useMemo(() => ({
        home: buildLinkedEventPlayers(localLineups.home),
        away: buildLinkedEventPlayers(localLineups.away),
    }), [localLineups.away, localLineups.home]);

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
        const nextClock = normalizeMatchClock(nextMatch.clock);
        const currentLocalEvents = localEventsRef.current;
        const currentLocalLineups = localLineupsRef.current;
        const currentScoreDraft = scoreDraftRef.current;
        const currentClockDraft = clockDraftRef.current;
        const hasUnsavedScore =
            options?.preserveUnsavedScore === true &&
            !areMatchScoresEqual(currentScoreDraft, persistedScoreRef.current);
        const hasUnsavedClock =
            options?.preserveUnsavedClock === true &&
            !areMatchClocksEqual(currentClockDraft, persistedClockRef.current);
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
        const resolvedClock = hasUnsavedClock ? currentClockDraft : nextClock;

        persistedMatchRef.current = nextMatch;
        persistedEventsRef.current = nextEvents;
        persistedLineupsRef.current = nextLineups;
        persistedScoreRef.current = nextScore;
        persistedClockRef.current = nextClock;
        localEventsRef.current = resolvedEvents;
        localLineupsRef.current = resolvedLineups;
        setMatch(nextMatch);
        setScoreDraft(resolvedScore);
        setClockDraft(resolvedClock);
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

        if (!areMatchClocksEqual(clockDraftRef.current, persistedClockRef.current)) {
            payload.clock = normalizeMatchClock(clockDraftRef.current);
        }

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
        const effectiveEvents = Array.isArray(effectivePayload.events)
            ? effectivePayload.events as MatchEvent[]
            : localEventsRef.current;
        const payloadIncludesEvents = Object.prototype.hasOwnProperty.call(effectivePayload, 'events');
        const payloadIncludesLineups = Object.prototype.hasOwnProperty.call(effectivePayload, 'lineups');
        const payloadIncludesScore = Object.prototype.hasOwnProperty.call(effectivePayload, 'score');
        const payloadIncludesClock = Object.prototype.hasOwnProperty.call(effectivePayload, 'clock');
        const effectiveScore = resolveOfficialScore(
            payloadIncludesScore ? effectivePayload.score as MatchScore : undefined,
            effectiveEvents,
        );
        const payloadWithScore =
            payloadIncludesScore || payloadIncludesEvents
                ? {
                    ...effectivePayload,
                    score: effectiveScore,
                }
                : effectivePayload;

        const shouldRecalculatePoints =
            options?.includePoints !== false
            && (
                payloadIncludesEvents
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

        const res = await fetch(resolvedMatchEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload),
        });

        const result = await res.json();
        if (!res.ok) {
            throw new Error(result?.error || `HTTP ${res.status}`);
        }

        const warnings = (result as { matchCenterWarnings?: PersistMatchWarnings } | null)?.matchCenterWarnings || {};
        const updatedMatch = result as MatchRow;
        applyMatchResponse(updatedMatch, {
            preserveLineupsIfIncomingEmpty:
                options?.preserveLineupsIfIncomingEmpty
                ?? warnings.lineupsNotPersisted
                ?? false,
            preserveUnsavedScore: options?.preserveUnsavedScore ?? !payloadIncludesScore,
            preserveUnsavedClock:
                options?.preserveUnsavedClock
                ?? warnings.clockNotPersisted
                ?? !payloadIncludesClock,
            preserveUnsavedEvents: options?.preserveUnsavedEvents ?? !payloadIncludesEvents,
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
                await persistMatchPatch({
                    status: match.status,
                    score: resolveOfficialScore(),
                    events: localEvents,
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
                const hasUnsavedClock = !areMatchClocksEqual(clockDraftRef.current, persistedClockRef.current);
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
                    const normalizedIncomingClock = normalizeMatchClock(incomingClock);
                    persistedClockRef.current = normalizedIncomingClock;
                    if (!hasUnsavedClock) {
                        setClockDraft(normalizedIncomingClock);
                    }
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

            payload.events = localEvents;
        }
        if (lineupsDirty) {
            payload.lineups = localLineups;
        }
        if (Object.keys(payload).length === 0) {
            setSaveMsg({ type: 'ok', text: 'No hay cambios para guardar' });
            setTimeout(() => setSaveMsg(null), 2500);
            return;
        }

        setSaving(true);
        setSaveMsg(null);
        try {
            console.log('[MatchCenter] Saving via API - events:', localEvents.length, 'lineups home:', localLineups.home.length, 'away:', localLineups.away.length);

            const saveResult = await persistMatchPatch(payload);
            setSaveMsg(
                saveResult.warnings.lineupsNotPersisted
                    ? { type: 'warn', text: 'Se guardó el partido, pero este entorno no tiene almacenamiento para alineaciones.' }
                    : { type: 'ok', text: 'Guardado correctamente' },
            );
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (err: unknown) {
            console.error('[MatchCenter] Save error:', err);
            setSaveMsg({ type: 'err', text: `Error de red: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setSaving(false);
        }
    };

    /* â”€â”€â”€ DERIVED DATA (all computed, zero hardcode) â”€â”€â”€ */
    useEffect(() => {
        if (match.status === 'live' || !clockDraft.running) return;
        setClockDraft((prev) => ({ ...normalizeMatchClock(prev), running: false }));
    }, [clockDraft.running, match.status]);

    useEffect(() => {
        const persistedClock = normalizeMatchClock(persistedClockRef.current);
        const currentClock = normalizeMatchClock(clockDraftRef.current);
        const hasManualClock =
            Boolean(persistedClock.minute || persistedClock.seconds || persistedClock.period)
            || Boolean(currentClock.minute || currentClock.seconds || currentClock.period);

        if (match.status !== 'live' || hasManualClock) return;

        const derivedClock = deriveClockFromKickoff(draftKickoffIso, currentClock.period || persistedClock.period);
        if (!derivedClock) return;

        setClockDraft((prev) => {
            const normalizedPrev = normalizeMatchClock(prev);
            return areMatchClocksEqual(normalizedPrev, derivedClock) ? normalizedPrev : derivedClock;
        });
    }, [draftKickoffIso, match.status]);

    useEffect(() => {
        if (!clockDraft.running) return;

        const intervalId = window.setInterval(() => {
            setClockDraft((prev) => incrementMatchClock(prev));
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [clockDraft.running]);

    const handleScoreInputChange = useCallback((team: 'home' | 'away', value: string) => {
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
    }, [resolveOfficialScore]);

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

    const openGuidedEvent = useCallback((definition: MatchEventDefinition) => {
        const currentClock = normalizeMatchClock(clockDraftRef.current);
        const minute = currentClock.minute || getLatestEventMinute(localEventsRef.current) || 0;

        setGuidedEvent({
            definition,
            step: definition.team === 'none' ? 'details' : 'team',
            team: definition.team === 'none' ? null : 'home',
            playerId: null,
            playerName: '',
            secondaryPlayerId: null,
            secondaryPlayerName: '',
            minute: String(minute),
            detail: '',
            goalKickResult: 'made',
            contestOutcome: requiresContestOutcome(definition.type) ? 'won' : '',
        });
    }, []);

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

    const saveGuidedEvent = useCallback(async () => {
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

        const minute = Math.max(0, Number.parseInt(guidedEvent.minute || '0', 10) || 0);
        const nextEvent: MatchEvent = {
            id: crypto.randomUUID(),
            minute,
            type: guidedEvent.definition.type,
            team: guidedEvent.definition.team === 'none' ? null : guidedEvent.team,
            playerId: guidedEvent.definition.player === 'none' ? null : guidedEvent.playerId,
            playerName: guidedEvent.definition.player === 'none' ? '' : guidedEvent.playerName.trim(),
            secondaryPlayerId: guidedEvent.secondaryPlayerName.trim() ? guidedEvent.secondaryPlayerId : null,
            secondaryPlayerName: guidedEvent.secondaryPlayerName.trim(),
            detail: formatGuidedEventDetail(guidedEvent),
        };
        const previousEvents = localEventsRef.current;
        const nextEvents = [...previousEvents, nextEvent];

        localEventsRef.current = nextEvents;
        setLocalEvents(nextEvents);
        setSaving(true);
        setSaveMsg(null);

        try {
            const saveResult = await persistMatchPatch({ events: nextEvents });
            setGuidedEvent(null);
            setSaveMsg(
                saveResult.warnings.lineupsNotPersisted
                    ? { type: 'warn', text: 'Evento guardado. Las alineaciones no se persistieron en este entorno.' }
                    : { type: 'ok', text: 'Evento guardado y estadisticas recalculadas.' },
            );
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (err: unknown) {
            localEventsRef.current = previousEvents;
            setLocalEvents(previousEvents);
            setSaveMsg({ type: 'err', text: `No se pudo guardar el evento: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setSaving(false);
        }
    }, [guidedEvent, persistMatchPatch]);

    const applyLineupSize = useCallback((requestedSize?: number) => {
        const nextSize = requestedSize ?? getPositiveInteger(lineupSizeInput, getLineupSize(localLineups));
        setLineupSizeInput(String(nextSize));
        setLocalLineups((prev) => ({
            home: buildLineupTemplate(nextSize, prev.home),
            away: buildLineupTemplate(nextSize, prev.away),
        }));
    }, [lineupSizeInput, localLineups]);

    const score = useMemo(() => resolveOfficialScore(scoreDraft, localEvents), [localEvents, resolveOfficialScore, scoreDraft]);
    const eventDerivedScore = useMemo(() => resolveEventDerivedScore(localEvents, score), [localEvents, resolveEventDerivedScore, score]);
    const events = localEvents;
    const lineups = localLineups;
    const eventsChronologicalAsc = useMemo(
        () => [...events].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id)),
        [events],
    );
    const eventScoreById = useMemo(() => {
        const map = new Map<string, { home: number; away: number; points: number }>();

        eventsChronologicalAsc.forEach((event, index) => {
            const scoreAtEvent = resolveOfficialScore(scoreDraft, eventsChronologicalAsc.slice(0, index + 1));
            map.set(event.id, {
                home: scoreAtEvent.home,
                away: scoreAtEvent.away,
                points: getConfiguredEventPoints(event, eventDefinitionMap),
            });
        });

        return map;
    }, [eventDefinitionMap, eventsChronologicalAsc, resolveOfficialScore, scoreDraft]);

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

                const availablePlayers = eventPlayerOptions[event.team];
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
    }, [eventPlayerOptions]);

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

        events.forEach((event) => {
            const points = getConfiguredEventPoints(event, eventDefinitionMap);

            if (points > 0 && event.team === 'home') {
                if (event.minute <= 40) {
                    ptHome += points;
                } else {
                    stHome += points;
                }
            } else if (points > 0 && event.team === 'away') {
                if (event.minute <= 40) {
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
                ? [...events].sort((a, b) => b.minute - a.minute).slice(0, 8)
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
            const points = getConfiguredEventPoints(event, eventDefinitionMap);
            const definition = eventDefinitionMap[event.type];
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
        () => buildCompleteStatTabs(completeMatchStats, homeName, awayName),
        [awayName, completeMatchStats, homeName],
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
    const clockDirty = !areMatchClocksEqual(clockDraft, persistedClockRef.current);
    const eventsDirty = !areDraftValuesEqual(events, persistedEventsRef.current);
    const lineupsDirty = !areDraftValuesEqual(lineups, persistedLineupsRef.current);
    const statusDirty = match.status !== persistedMatchRef.current.status;
    const venueDirty = (match.venue || '') !== (persistedMatchRef.current.venue || '');
    const notesDirty = !areTextValuesEqual(match.notes, persistedMatchRef.current.notes);
    const dateTimeDirty = dateTimeDraft !== toDateTimeLocalInput(persistedMatchRef.current.date_time);
    const hasUnsavedMatchParameters = scoreDirty || clockDirty || statusDirty || venueDirty || notesDirty || dateTimeDirty;
    const liveClockLabel = formatMatchClock(clockDraft);
    const sortedEvents = useMemo(
        () => (activeTab === 'eventos' ? [...events].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id)) : []),
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
    const guidedPlayers = guidedEvent?.team ? eventPlayerOptions[guidedEvent.team] : [];
    const guidedTeamName = guidedEvent?.team === 'home' ? homeName : guidedEvent?.team === 'away' ? awayName : '';


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
                        <div style={{
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
                <section style={{
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
                                <div className="mc-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>
                                            Parciales {scoreMismatch ? '(segun eventos)' : ''}
                                        </div>
                                        <div style={{ fontWeight: 800 }}>PT: {ptScore.home} - {ptScore.away}</div>
                                        <div style={{ fontWeight: 800, color: '#888' }}>ST: {stScore.home} - {stScore.away}</div>
                                    </div>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Ganador</div>
                                        <div style={{ fontWeight: 800, color: winner === 'EMPATE' || winner === '--' ? '#666' : 'var(--accent)' }}>{winner}</div>
                                    </div>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Bonus Ofensivo</div>
                                        <div style={{ fontWeight: 800, color: homeBonusOff || awayBonusOff ? 'var(--accent)' : '#666' }}>{bonusOffText}</div>
                                    </div>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
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
                                                const chronIdx = eventsChronologicalAsc.findIndex((e) => e.id === ev.id);
                                                const eventScore = eventScoreById.get(ev.id);
                                                const detailLine =
                                                    ev.type === 'substitution' && chronIdx >= 0
                                                        ? formatMatchTimelineEventDescription(ev, eventsChronologicalAsc, chronIdx, ev.playerName || ev.detail || '')
                                                        : (ev.playerName || ev.detail);
                                                return (
                                                <div key={ev.id || i} className="event-entry" style={{ padding: '8px 12px', marginBottom: 8, background: 'transparent', border: 'none' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 900, color: eventTypeColor(ev.type, availableEventDefinitions), width: 40 }}>{ev.minute}&apos;</div>
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
                                <div className="mc-card-body" style={{ display: 'flex', gap: 16 }}>
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
                    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
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
                                    <p className="empty-msg">No hay alineaciones cargadas. Agrega jugadores para cada equipo.</p>
                                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16 }}>
                                        <button className="mc-btn mc-btn-primary" onClick={() => applyLineupSize()}>
                                            <Plus size={14} /> Generar plantilla
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                                {(['home', 'away'] as const).map(team => {
                                    const club = team === 'home' ? match.homeClub : match.awayClub;
                                    const players = lineups[team];
                                    const starters = players.filter(isStarterLineupPlayer);
                                    const subs = players.filter(isSubstituteLineupPlayer);

                                    return (
                                        <article key={team} className="mc-partition" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
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
                                            <div style={{ background: '#111', borderRadius: 8, border: '1px solid #222', overflow: 'hidden' }}>
                                                <div style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    TITULARES ({starters.length})
                                                </div>
                                                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                                                <div style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    SUPLENTES ({subs.length})
                                                </div>
                                                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                        )}
                    </div>
                )}

                {/* â”€â”€ TAB: EVENTOS â”€â”€ */}
                {activeTab === 'eventos' && (
                    <>
                    <div className="event-live-workspace">
                        <article className="mc-partition live-event-console">
                            <div className="mc-card-header">
                                <div>
                                    <h4>Carga rapida de eventos</h4>
                                    <span className="live-event-header-note">Carga guiada en tres pasos, con estadisticas actualizadas al guardar.</span>
                                </div>
                                <span className="live-event-clock"><Clock size={14} /> {liveClockLabel}</span>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '70px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.7rem', fontWeight: 800, color: '#666', borderBottom: '1px solid #222' }}>
                                        <div>MIN</div><div>TIPO</div><div>EQUIPO</div><div>JUGADOR / DETALLE</div><div style={{ textAlign: 'right' }}>ACCION</div>
                                    </div>
                                    {sortedEvents.map((ev, sortedIdx) => {
                                        const selectedDefinition = eventDefinitionMap[ev.type] || {
                                            type: ev.type,
                                            label: eventTypeLabel(ev.type, availableEventDefinitions),
                                            category: 'other' as const,
                                            points: 0,
                                            team: 'optional' as const,
                                            player: 'optional' as const,
                                        };
                                        const availableEventPlayers = ev.team ? eventPlayerOptions[ev.team] : [];
                                        const selectedPlayerValue = isEventPlayerAvailable(availableEventPlayers, ev.playerName)
                                            ? ev.playerName
                                            : '';
                                        const selectedSecondaryPlayerValue = isEventPlayerAvailable(availableEventPlayers, ev.secondaryPlayerName)
                                            ? ev.secondaryPlayerName || ''
                                            : '';
                                        const eventScore = eventScoreById.get(ev.id);

                                        return (
                                        <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '70px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.85rem', borderBottom: '1px solid #222', alignItems: 'center' }}>
                                            <div>
                                                <input
                                                    type="number" value={ev.minute} min={0} max={100}
                                                    style={{ width: 50, background: '#222', border: 'none', color: 'var(--accent)', fontWeight: 900, padding: 4, borderRadius: 4 }}
                                                    onChange={(e) => updateLocalEvent(ev.id, { minute: parseInt(e.target.value, 10) || 0 })}
                                                />
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
                                            <div style={{ display: 'grid', gap: 6 }}>
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
                                                        disabled={!ev.team || availableEventPlayers.length === 0}
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
                                                        {availableEventPlayers.map((entry) => (
                                                            <option key={`${ev.id}-${entry.playerId || entry.name}`} value={entry.name}>
                                                                {entry.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                                {selectedDefinition.player !== 'none' && ev.type === 'substitution' && (
                                                    <select
                                                        value={selectedSecondaryPlayerValue}
                                                        disabled={!ev.team || availableEventPlayers.length === 0}
                                                        className="inline-input inline-select"
                                                        style={{ fontSize: '0.8rem', opacity: 0.85 }}
                                                        onChange={(e) => {
                                                            const selected = resolveEventPlayerSelection(ev.team, e.target.value);
                                                            updateLocalEvent(ev.id, {
                                                                secondaryPlayerId: selected.playerId,
                                                                secondaryPlayerName: selected.playerName,
                                                                detail: selected.playerName ? `Entra: ${selected.playerName}` : '',
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
                                                        {availableEventPlayers.map((entry) => (
                                                            <option key={`${ev.id}-secondary-${entry.playerId || entry.name}`} value={entry.name}>
                                                                {entry.name}
                                                            </option>
                                                        ))}
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
                                                    const mins = minutesPlayedWhenSubstitutedOut(sortedEvents, sortedIdx);
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
                                            <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
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
                                                    {player.name}
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
                                                value={guidedEvent.minute}
                                                onChange={(event) => setGuidedEvent((current) => current ? { ...current, minute: event.target.value } : current)}
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
                                                {guidedPlayers.map((player) => (
                                                    <option key={`secondary-${player.playerId || player.name}`} value={player.name}>
                                                        {player.name}
                                                    </option>
                                                ))}
                                            </select>
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
                                            <div key={stat.label} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 200px 1fr 60px', alignItems: 'center', gap: 16 }}>
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
                                                    <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 200px 1fr 60px', alignItems: 'center', gap: 16 }}>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

                                <div className="mc-card-body" style={{ borderTop: '1px solid #222', paddingTop: 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                        <h4 style={{ fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', color: '#888', margin: 0 }}>Estadisticas por Jugador</h4>
                                        <span style={{ fontSize: '0.78rem', color: '#666' }}>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                                        {([
                                            { team: 'home' as const, label: homeName, rows: playerStatsByTeam.home },
                                            { team: 'away' as const, label: awayName, rows: playerStatsByTeam.away },
                                        ]).map((group) => (
                                            <div key={group.team} style={{ padding: 16, background: '#1a1a1a', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                                    <div style={{ fontWeight: 900, fontSize: '0.9rem' }}>{group.label}</div>
                                                    <span style={{ fontSize: '0.72rem', color: '#777', textTransform: 'uppercase', fontWeight: 800 }}>
                                                        {group.rows.length} jugador{group.rows.length === 1 ? '' : 'es'}
                                                    </span>
                                                </div>
                                                {group.rows.length === 0 ? (
                                                    <div style={{ color: '#666', fontSize: '0.82rem', lineHeight: 1.5 }}>
                                                        No hay eventos con jugador identificado para este equipo.
                                                    </div>
                                                ) : group.rows.map((player) => (
                                                    <div key={player.key} style={{ border: '1px solid #262626', borderRadius: 8, padding: 12, background: '#141414', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                            <div>
                                                                <div style={{ fontWeight: 800 }}>{player.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#777', marginTop: 4 }}>
                                                                    {player.totalEvents} evento{player.totalEvents === 1 ? '' : 's'} · ultimo {player.lastMinute}&apos;
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: player.points > 0 ? 'var(--accent)' : '#fff' }}>{player.points}</div>
                                                                <div style={{ fontSize: '0.7rem', color: '#777', textTransform: 'uppercase', fontWeight: 800 }}>puntos</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                            {player.breakdown.map((entry) => (
                                                                <span
                                                                    key={`${player.key}-${entry.type}`}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: 6,
                                                                        padding: '6px 10px',
                                                                        borderRadius: 999,
                                                                        background: `${entry.color}18`,
                                                                        border: `1px solid ${entry.color}33`,
                                                                        color: entry.color,
                                                                        fontSize: '0.74rem',
                                                                        fontWeight: 800,
                                                                    }}
                                                                >
                                                                    {entry.label} x{entry.count}
                                                                    {entry.totalPoints > 0 ? <strong style={{ color: '#fff' }}>+{entry.totalPoints}</strong> : null}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
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
                    <article className="mc-partition" style={{ maxWidth: 800, margin: '0 auto', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <div className="mc-grid-2">
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
                    <article className="mc-partition" style={{ maxWidth: 600, margin: '0 auto' }}>
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
                    <article className="mc-partition" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <div className="mc-card-header"><h4>Parametros del Partido</h4></div>
                        <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div className="form-group">
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
                            <div style={{ padding: 20, borderRadius: 12, border: '1px solid rgba(0, 163, 101, 0.28)', background: 'linear-gradient(180deg, rgba(8, 18, 14, 0.98) 0%, rgba(17, 17, 17, 0.98) 100%)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 18 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 }}>Cronometro Oficial</div>
                                        <div style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${clockDraft.running ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.12)'}`, background: clockDraft.running ? 'rgba(6, 78, 59, 0.26)' : 'rgba(0, 0, 0, 0.34)', display: 'inline-flex', alignItems: 'center', fontSize: '2rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '0.04em', textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>{liveClockLabel}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="mc-btn mc-btn-outline"
                                            style={{ border: '1px solid rgba(16,185,129,0.35)', background: clockDraft.running ? 'rgba(16,185,129,0.18)' : '#0f172a', color: '#f8fafc' }}
                                            onClick={() => {
                                                setClockDraft((prev) => {
                                                    const normalized = normalizeMatchClock(prev);
                                                    const nextRunning = !normalized.running;
                                                    return {
                                                        ...normalized,
                                                        running: nextRunning,
                                                        period: normalized.period || '1T',
                                                    };
                                                });
                                                if (match.status !== 'live') {
                                                    setMatch((prev) => ({ ...prev, status: 'live' }));
                                                }
                                            }}
                                        >
                                            {clockDraft.running ? 'Pausar' : 'Iniciar'}
                                        </button>
                                        <button
                                            type="button"
                                            className="mc-btn mc-btn-outline"
                                            style={{ border: '1px solid rgba(255,255,255,0.16)', background: '#111827', color: '#e5e7eb' }}
                                            onClick={() => {
                                                const derivedClock = deriveClockFromKickoff(draftKickoffIso, clockDraft.period);
                                                if (!derivedClock) return;
                                                setClockDraft(derivedClock);
                                                if (match.status !== 'live') {
                                                    setMatch((prev) => ({ ...prev, status: 'live' }));
                                                }
                                            }}
                                        >
                                            Sincronizar inicio
                                        </button>
                                        <button
                                            type="button"
                                            className="mc-btn mc-btn-outline"
                                            style={{ border: '1px solid rgba(255,255,255,0.16)', background: '#111827', color: '#e5e7eb' }}
                                            onClick={() => setClockDraft((prev) => ({
                                                ...normalizeMatchClock(prev),
                                                minute: getLatestEventMinute(localEventsRef.current) ?? prev.minute ?? 0,
                                                seconds: 0,
                                                running: false,
                                            }))}
                                        >
                                            Tomar ultimo evento
                                        </button>
                                        <button
                                            type="button"
                                            className="mc-btn mc-btn-outline"
                                            style={{ border: '1px solid rgba(248,113,113,0.26)', background: 'rgba(127,29,29,0.28)', color: '#fecaca' }}
                                            onClick={() => setClockDraft({ minute: 0, seconds: 0, period: 'Previa', running: false })}
                                        >
                                            Reiniciar
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                                    <label style={{ display: 'grid', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Periodo</span>
                                        <select
                                            value={clockDraft.period || ''}
                                            style={{ borderRadius: 8, background: '#020617', border: '1px solid rgba(255,255,255,0.14)', color: '#f8fafc', padding: '10px 12px' }}
                                            onChange={(e) => setClockDraft((prev) => ({
                                                ...normalizeMatchClock(prev),
                                                period: e.target.value,
                                            }))}
                                        >
                                            {Array.from(new Set([clockDraft.period || '', ...COMMON_MATCH_PERIODS].filter(Boolean))).map((period) => (
                                                <option key={period} value={period}>{period}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label style={{ display: 'grid', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Minuto</span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={clockDraft.minute ?? 0}
                                            style={{ borderRadius: 8, background: '#020617', border: '1px solid rgba(255,255,255,0.14)', color: '#f8fafc', padding: '10px 12px' }}
                                            onChange={(e) => setClockDraft((prev) => ({
                                                ...normalizeMatchClock(prev),
                                                minute: normalizeClockMinute(e.target.value),
                                            }))}
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Segundos</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={59}
                                            value={clockDraft.seconds ?? 0}
                                            style={{ borderRadius: 8, background: '#020617', border: '1px solid rgba(255,255,255,0.14)', color: '#f8fafc', padding: '10px 12px' }}
                                            onChange={(e) => setClockDraft((prev) => ({
                                                ...normalizeMatchClock(prev),
                                                seconds: normalizeClockSeconds(e.target.value),
                                            }))}
                                        />
                                    </label>
                                    <label style={{ display: 'grid', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Ajuste rapido</span>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                            {[
                                                { label: '-1m', delta: -1 },
                                                { label: '+1m', delta: 1 },
                                                { label: '+5m', delta: 5 },
                                            ].map((action) => (
                                                <button
                                                    key={action.label}
                                                    type="button"
                                                    className="mc-btn mc-btn-outline"
                                                    style={{ border: '1px solid rgba(255,255,255,0.14)', background: '#111827', color: '#f8fafc', justifyContent: 'center', paddingInline: 0 }}
                                                    onClick={() => setClockDraft((prev) => ({
                                                        ...normalizeMatchClock(prev),
                                                        minute: Math.max(0, (prev.minute ?? 0) + action.delta),
                                                    }))}
                                                >
                                                    {action.label}
                                                </button>
                                            ))}
                                        </div>
                                    </label>
                                </div>

                                <div style={{ fontSize: '0.78rem', color: clockDirty ? '#fde68a' : '#94a3b8', lineHeight: 1.5 }}>
                                    {clockDirty
                                        ? 'Hay cambios del cronometro sin guardar. Se persisten con el boton Guardar del encabezado.'
                                        : 'El cronometro se guarda en el campo clock del partido y puede convivir con la carga manual de eventos.'}
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Marcador Local</label>
                                <input
                                    type="number"
                                    value={score.home}
                                    min={0}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => handleScoreInputChange('home', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Marcador Visitante</label>
                                <input
                                    type="number"
                                    value={score.away}
                                    min={0}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => handleScoreInputChange('away', e.target.value)}
                                />
                            </div>
                            {match.status === 'final' && score.home === score.away ? (
                                <>
                                    <div className="form-group">
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
                                    <div className="form-group">
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
                            <div className="form-group">
                                <label>Estadio / Venue</label>
                                <input
                                    type="text"
                                    value={match.venue || ''}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => setMatch((prev) => ({ ...prev, venue: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    value={dateTimeDraft}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => setDateTimeDraft(e.target.value)}
                                />
                            </div>
                            <div style={{ marginTop: -8, fontSize: '0.78rem', color: scoreDirty ? '#fcd34d' : '#666', lineHeight: 1.5 }}>
                                {(scoreDirty || clockDirty)
                                    ? 'Hay cambios locales sin guardar. Usa el boton Guardar del encabezado para persistir cronometro, marcador, estado, sede, fecha y notas juntos.'
                                    : hasUnsavedMatchParameters
                                        ? 'Hay cambios administrativos sin guardar. El guardado ahora evita recalcular datos del partido si solo cambias sede, fecha, reloj o notas.'
                                        : 'El marcador oficial manda sobre la timeline. Si no coincide con los eventos, la consola lo mostrara como resultado manual.'}
                            </div>
                        </div>

                        {/* â”€â”€ PUNTOS DEL PARTIDO â”€â”€ */}
                        <div style={{ marginTop: 32, borderTop: '1px solid #222', paddingTop: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
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
                            <p style={{ fontSize: 13, color: '#888', marginBottom: 20, marginTop: 0 }}>
                                Los puntos base se completan automaticamente segun las reglas del partido. Podes agregar bonus o penalizaciones manuales.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                <div className="form-group" style={{ margin: 0 }}>
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
                                <div className="form-group" style={{ margin: 0 }}>
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
                                <div className="form-group" style={{ margin: 0 }}>
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
                                <div className="form-group" style={{ margin: 0 }}>
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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
