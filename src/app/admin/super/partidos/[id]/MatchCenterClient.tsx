'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    countTeamOffensiveMetric,
    resolveOffensiveBonusRule,
    type NormalizedOffensiveBonusRule,
} from '@/lib/bonusRuleMetrics';
import { StandingsEngine } from '@/lib/services/standingsEngine';
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
}
interface LineupPlayer {
    id?: string;
    number: number;
    name: string;
    position?: string;
    role?: string;
    isCaptain?: boolean;
    squadMemberId?: string | null;
    divisionId?: string | null;
}

interface MatchScore {
    home: number;
    away: number;
    homeTries?: number;
    awayTries?: number;
    notes?: string;
}

interface MatchClock {
    minute?: number;
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
    clock: MatchClock;
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
    preserveUnsavedEvents?: boolean;
    preserveUnsavedLineups?: boolean;
};

type PersistMatchPatchOptions = {
    includePoints?: boolean;
    preserveLineupsIfIncomingEmpty?: boolean;
    preserveUnsavedEvents?: boolean;
    preserveUnsavedLineups?: boolean;
    syncDirtyEvents?: boolean;
};

type PersistMatchWarnings = {
    lineupsNotPersisted?: boolean;
};

function normalizeMatchEvents(events: MatchRow['events']): MatchEvent[] {
    return Array.isArray(events) ? events : [];
}

function normalizeMatchLineups(lineups: MatchRow['lineups']): MatchLineups {
    return lineups || { home: [], away: [] };
}

function normalizeMatchScore(score: MatchScore | null | undefined): MatchScore {
    const normalizedHomeTries = Number(score?.homeTries);
    const normalizedAwayTries = Number(score?.awayTries);

    return {
        home: Math.max(0, Number(score?.home) || 0),
        away: Math.max(0, Number(score?.away) || 0),
        homeTries: Number.isFinite(normalizedHomeTries) ? normalizedHomeTries : undefined,
        awayTries: Number.isFinite(normalizedAwayTries) ? normalizedAwayTries : undefined,
        notes: typeof score?.notes === 'string' ? score.notes : undefined,
    };
}

function areMatchScoresEqual(left: MatchScore | null | undefined, right: MatchScore | null | undefined) {
    const normalizedLeft = normalizeMatchScore(left);
    const normalizedRight = normalizeMatchScore(right);

    return (
        normalizedLeft.home === normalizedRight.home
        && normalizedLeft.away === normalizedRight.away
        && (normalizedLeft.homeTries ?? null) === (normalizedRight.homeTries ?? null)
        && (normalizedLeft.awayTries ?? null) === (normalizedRight.awayTries ?? null)
        && (normalizedLeft.notes ?? '') === (normalizedRight.notes ?? '')
    );
}

function buildScoreFromEvents(
    events: MatchEvent[],
    definitionMap: Record<string, MatchEventDefinition>,
    fallbackScore: MatchScore | null | undefined,
): MatchScore {
    const baseScore = normalizeMatchScore(fallbackScore);
    let home = 0;
    let away = 0;
    let homeTries = 0;
    let awayTries = 0;
    let hasScoringEvents = false;
    let hasTryEvents = false;

    events.forEach((event) => {
        const points = getConfiguredEventPoints(event.type, definitionMap);
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

function hasAnyLineupPlayers(lineups: MatchLineups | null | undefined) {
    return (lineups?.home.length ?? 0) > 0 || (lineups?.away.length ?? 0) > 0;
}

function areDraftValuesEqual(left: unknown, right: unknown) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export interface MatchPoints {
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
}

interface MatchCenterClientProps {
    initialMatch: MatchRow;
    matchId: string;
    onClose?: () => void;
}

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

function eventTypeLabel(t: string, definitions: MatchEventDefinition[]): string {
    const configured = definitions.find((definition) => definition.type === t);
    if (configured?.label) return configured.label;

    const map: Record<string, string> = {
        try: 'TRY', conversion: 'CONV', penalty_goal: 'PENAL', drop_goal: 'DROP',
        yellow_card: 'AMARILLA', red_card: 'ROJA', substitution: 'CAMBIO',
        start_period: 'INICIO', end_period: 'FIN', penalty: 'PENAL',
    };
    return map[t] || t.toUpperCase();
}

function eventTypeColor(t: string, definitions: MatchEventDefinition[]): string {
    const configured = definitions.find((definition) => definition.type === t);
    if (configured?.category === 'score') return 'var(--accent)';
    if (configured?.category === 'card' && t === 'yellow_card') return '#eab308';
    if (configured?.category === 'card' && t === 'red_card') return '#ef4444';

    if (t === 'try') return 'var(--accent)';
    if (t === 'yellow_card') return '#eab308';
    if (t === 'red_card') return '#ef4444';
    return '#fff';
}

function getConfiguredEventPoints(
    eventType: string,
    definitionMap: Record<string, MatchEventDefinition>,
): number {
    const definition = definitionMap[eventType];
    if (!definition || definition.category !== 'score') {
        return 0;
    }
    return Number(definition.points) || 0;
}

/* â”€â”€â”€ POINTS HELPERS â”€â”€â”€ */
interface PointsRules {
    win: number;
    draw: number;
    loss: number;
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
    offensive: null,
    defensive: null,
};

function getPositiveInteger(value: string, fallback: number) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
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
            isCaptain: current?.isCaptain ?? false,
            squadMemberId: current?.squadMemberId ?? null,
            divisionId: current?.divisionId ?? null,
        };
    });
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

    if (score.home > score.away) {
        homeBase = rules.win;
        awayBase = rules.loss;
    } else if (score.home < score.away) {
        homeBase = rules.loss;
        awayBase = rules.win;
    }

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
export default function MatchCenterClient({ initialMatch, matchId, onClose }: MatchCenterClientProps) {
    const router = useRouter();
    const supabase = createClient();
    const initialEvents = normalizeMatchEvents(initialMatch.events);
    const initialLineups = normalizeMatchLineups(initialMatch.lineups);
    const initialScore = normalizeMatchScore(initialMatch.score);

    const [match, setMatch] = useState<MatchRow>(initialMatch);
    const [activeTab, setActiveTab] = useState('resumen');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

    // Editable state for events & lineups (local mirrors of DB JSONB)
    const [localEvents, setLocalEvents] = useState<MatchEvent[]>(initialEvents);
    const [localLineups, setLocalLineups] = useState<MatchLineups>(initialLineups);
    const persistedEventsRef = useRef<MatchEvent[]>(initialEvents);
    const persistedLineupsRef = useRef<MatchLineups>(initialLineups);
    const persistedScoreRef = useRef<MatchScore>(initialScore);
    const localEventsRef = useRef<MatchEvent[]>(initialEvents);
    const localLineupsRef = useRef<MatchLineups>(initialLineups);

    // Editable state for per-match points
    const [localPoints, setLocalPoints] = useState<MatchPoints>(() => toLocalPoints(initialMatch));
    const [savingPoints, setSavingPoints] = useState(false);
    const [pointsRules, setPointsRules] = useState<PointsRules>(DEFAULT_POINTS_RULES);
    const [eventDefinitions, setEventDefinitions] = useState<MatchEventDefinition[]>(
        () => getDefaultMatchEventDefinitions(initialMatch.tournament?.sport_id ?? initialMatch.tournament?.sportId ?? null),
    );
    const [lineupSizeInput, setLineupSizeInput] = useState(() => String(getLineupSize(initialMatch.lineups)));
    const [dateTimeDraft, setDateTimeDraft] = useState(() => toDateTimeLocalInput(initialMatch.date_time));
    const eventDefinitionMap = buildMatchEventDefinitionMap(eventDefinitions);

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

    const applyMatchResponse = useCallback((nextMatch: MatchRow, options?: ApplyMatchResponseOptions) => {
        const nextEvents = normalizeMatchEvents(nextMatch.events);
        const nextLineups = normalizeMatchLineups(nextMatch.lineups);
        const currentLocalEvents = localEventsRef.current;
        const currentLocalLineups = localLineupsRef.current;
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

        persistedEventsRef.current = nextEvents;
        persistedLineupsRef.current = nextLineups;
        persistedScoreRef.current = normalizeMatchScore(nextMatch.score);
        localEventsRef.current = resolvedEvents;
        localLineupsRef.current = resolvedLineups;
        setMatch(nextMatch);
        setLocalEvents(resolvedEvents);
        setLocalLineups(resolvedLineups);
        setLocalPoints(toLocalPoints(nextMatch));
        setLineupSizeInput(String(getLineupSize(resolvedLineups)));
        setDateTimeDraft(toDateTimeLocalInput(nextMatch.date_time));
    }, []);

    const resolveMatchScore = useCallback((
        nextScore?: MatchScore | null,
        nextEvents?: MatchEvent[],
    ) => {
        const manualScore = normalizeMatchScore(nextScore ?? match.score);
        const effectiveEvents = nextEvents ?? localEvents;
        const hasUnsavedManualScore = !areMatchScoresEqual(manualScore, persistedScoreRef.current);
        const hasUnsavedEventDraft = !areDraftValuesEqual(effectiveEvents, persistedEventsRef.current);

        return hasUnsavedManualScore || !hasUnsavedEventDraft
            ? manualScore
            : buildScoreFromEvents(effectiveEvents, eventDefinitionMap, manualScore);
    }, [eventDefinitionMap, localEvents, match.score]);

    const getAutoPointsSnapshot = useCallback((
        nextScore?: MatchScore,
        nextEvents: MatchEvent[] = localEvents,
        nextStatus: string = match.status,
    ) => calculateAutocalculatedPoints(
        nextStatus,
        resolveMatchScore(nextScore, nextEvents),
        nextEvents,
        pointsRules,
    ), [localEvents, match.status, pointsRules, resolveMatchScore]);

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
        const payload: Record<string, unknown> = {
            status: match.status,
            score: resolveMatchScore(),
            venue: match.venue || '',
            notes: match.notes?.trim() || null,
        };

        if (dateTimeDraft) {
            const [date, time] = dateTimeDraft.split('T');
            const nextDateTime = combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
            if (nextDateTime) {
                payload.dateTime = nextDateTime;
            }
        } else if (match.date_time) {
            payload.dateTime = match.date_time;
        }

        return payload;
    }, [dateTimeDraft, match.date_time, match.notes, match.status, match.venue, resolveMatchScore]);

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
        const effectiveScore = resolveMatchScore(
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

        let pointsPayload: Record<string, unknown> = {};
        if (options?.includePoints !== false) {
            if (localPoints.points_autocalculated === false) {
                pointsPayload = buildPointsPatchPayload({
                    score: effectiveScore,
                    events: effectiveEvents,
                    status: typeof payloadWithScore.status === 'string' ? payloadWithScore.status : undefined,
                });
            } else {
                const configuration = await fetchMatchConfiguration(match);
                pointsPayload = toPointPatchPayload(calculateAutocalculatedPoints(
                    typeof payloadWithScore.status === 'string' ? payloadWithScore.status : match.status,
                    effectiveScore,
                    effectiveEvents,
                    configuration.pointsRules,
                ));
            }
        }

        const finalPayload = options?.includePoints === false
            ? payloadWithScore
            : {
                ...payloadWithScore,
                ...pointsPayload,
            };

        const res = await fetch(`/api/matches/${matchId}`, {
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
    }, [applyMatchResponse, buildPointsPatchPayload, localPoints.points_autocalculated, match, matchId, resolveMatchScore]);

    /* â”€â”€â”€ REFRESH (for after saves / config changes) â”€â”€â”€ */
    const refreshMatchConfiguration = useCallback(async () => {
        const configuration = await fetchMatchConfiguration({
            phase_id: match.phase_id,
            round_id: match.round_id,
            tournament_id: match.tournament_id,
        });

        setPointsRules(configuration.pointsRules);
        setEventDefinitions(configuration.eventDefinitions);
    }, [match.phase_id, match.round_id, match.tournament_id]);

    const fetchMatch = useCallback(async () => {
        try {
            const res = await fetch(`/api/matches/${matchId}`, { cache: 'no-store' });
            const payload = await res.json();

            if (!res.ok) {
                throw new Error(payload?.error || `HTTP ${res.status}`);
            }

            applyMatchResponse(payload as MatchRow, {
                preserveLineupsIfIncomingEmpty: true,
                preserveUnsavedEvents: true,
                preserveUnsavedLineups: true,
            });
        } catch (err: unknown) {
            console.error('Error refreshing match:', err);
        }
    }, [applyMatchResponse, matchId]);

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
        setLocalPoints(getAutoPointsSnapshot());
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
                    ...buildPersistableMatchPayload(),
                    events: localEvents,
                });
            }
        } finally {
            setSavingPoints(false);
        }
    }, [buildPersistableMatchPayload, localEvents, localPoints, persistMatchPatch]);

    // Reactive: recalculate whenever score/status/events change, only while in auto mode
    useEffect(() => {
        if (localPoints.points_autocalculated === false) return;
        setLocalPoints(getAutoPointsSnapshot());
    }, [getAutoPointsSnapshot, localPoints.points_autocalculated]);

    /* â”€â”€â”€ REALTIME (live matches) â”€â”€â”€ */
    useEffect(() => {
        if (match?.status !== 'live') return;
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
                const hasUnsavedEvents = !areDraftValuesEqual(localEventsRef.current, persistedEventsRef.current);
                const hasUnsavedLineups = !areDraftValuesEqual(localLineupsRef.current, persistedLineupsRef.current);
                const incomingScore = updated.score as MatchScore | undefined;

                setMatch(prev => ({ ...prev, ...updated } as unknown as MatchRow));
                if (incomingScore) {
                    persistedScoreRef.current = normalizeMatchScore(incomingScore);
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
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [match?.status, matchId, supabase]);

    /* â”€â”€â”€ SAVE â”€â”€â”€ */
    const handleSave = async () => {
        if (!match) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            console.log('[MatchCenter] Saving via API - events:', localEvents.length, 'lineups home:', localLineups.home.length, 'away:', localLineups.away.length);

            const saveResult = await persistMatchPatch({
                ...buildPersistableMatchPayload(),
                events: localEvents,
                lineups: localLineups,
            });
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
    const commitConfigPatch = useCallback(async (
        payload: Record<string, unknown>,
        options?: PersistMatchPatchOptions,
    ) => {
        try {
            await persistMatchPatch(payload, options);
        } catch (err: unknown) {
            console.error('[MatchCenter] Config save error:', err);
            setSaveMsg({ type: 'err', text: `Error de red: ${err instanceof Error ? err.message : String(err)}` });
            await fetchMatch();
        }
    }, [fetchMatch, persistMatchPatch]);

    const handleScoreInputChange = useCallback((team: 'home' | 'away', value: string) => {
        const parsedValue = Math.max(0, Number.parseInt(value || '0', 10) || 0);
        setMatch((prev) => ({
            ...prev,
            score: {
                ...(prev.score || { home: 0, away: 0 }),
                [team]: parsedValue,
            },
        }));
    }, []);

    const updateLocalEvent = useCallback((eventId: string, patch: Partial<MatchEvent>) => {
        setLocalEvents((prev) =>
            prev.map((event) => (event.id === eventId ? { ...event, ...patch } : event)),
        );
    }, []);

    const removeLocalEvent = useCallback((eventId: string) => {
        setLocalEvents((prev) => prev.filter((event) => event.id !== eventId));
    }, []);

    const applyLineupSize = useCallback((requestedSize?: number) => {
        const nextSize = requestedSize ?? getPositiveInteger(lineupSizeInput, getLineupSize(localLineups));
        setLineupSizeInput(String(nextSize));
        setLocalLineups((prev) => ({
            home: buildLineupTemplate(nextSize, prev.home),
            away: buildLineupTemplate(nextSize, prev.away),
        }));
    }, [lineupSizeInput, localLineups]);

    const score = resolveMatchScore();
    const events = localEvents;
    const lineups = localLineups;

    useEffect(() => {
        const definitionMap = buildMatchEventDefinitionMap(eventDefinitions);

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
    }, [eventDefinitions]);

    const homeName = match.homeClub?.short_name || match.homeClub?.name || 'Local';
    const awayName = match.awayClub?.short_name || match.awayClub?.name || 'Visitante';
    const homeLogo = match.homeClub?.logo_url || null;
    const awayLogo = match.awayClub?.logo_url || null;
    const watchUrl = match.broadcast_url || match.stream_url || null;

    const formattedDate = match.date_time
        ? formatDateInTimeZone(match.date_time, 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' }, APP_TIMEZONE)
        : 'Sin fecha';

    // Parcials: derive from events by minute
    const scoringEventTypes = eventDefinitions
        .filter((definition) => definition.category === 'score' && definition.points > 0)
        .map((definition) => definition.type);
    const ptEvents = events.filter((event) => scoringEventTypes.includes(event.type) && event.minute <= 40);
    const stEvents = events.filter((event) => scoringEventTypes.includes(event.type) && event.minute > 40);

    function calcPeriodScore(periodEvents: MatchEvent[]): { home: number; away: number } {
        let h = 0, a = 0;
        periodEvents.forEach(e => {
            const pts = getConfiguredEventPoints(e.type, eventDefinitionMap);
            if (e.team === 'home') h += pts;
            else if (e.team === 'away') a += pts;
        });
        return { home: h, away: a };
    }
    const ptScore = calcPeriodScore(ptEvents);
    const stScore = calcPeriodScore(stEvents);
    const teamComparableStats = eventDefinitions
        .filter((definition) => definition.team !== 'none')
        .map((definition) => ({
            type: definition.type,
            label: definition.label,
            h: events.filter((event) => event.type === definition.type && event.team === 'home').length,
            a: events.filter((event) => event.type === definition.type && event.team === 'away').length,
        }))
        .filter((stat) => stat.h > 0 || stat.a > 0);
    const scoringBreakdown = eventDefinitions
        .filter((definition) => definition.category === 'score' && definition.points > 0)
        .map((definition) => ({
            ...definition,
            homeCount: events.filter((event) => event.type === definition.type && event.team === 'home').length,
            awayCount: events.filter((event) => event.type === definition.type && event.team === 'away').length,
        }))
        .filter((definition) => definition.homeCount > 0 || definition.awayCount > 0);

    // Winner
    const winner = score.home > score.away ? 'LOCAL' : score.away > score.home ? 'VISITANTE' : score.home === score.away && score.home === 0 ? '--' : 'EMPATE';

    // Bonus ofensivo segun la regla configurada
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

    // Bonus defensivo (lose by <=7)
    const diff = Math.abs(score.home - score.away);
    const loser = score.home < score.away ? 'home' : score.home > score.away ? 'away' : null;
    const bonusDefText = !pointsRules.defensive
        ? 'No aplica'
        : loser && diff <= pointsRules.defensive.margin && match.status === 'final'
            ? `${loser === 'home' ? homeName : awayName} (pierde por ${diff})`
            : 'No';

    // Metrics from events
    const totalEvents = events.length;

    // Recent events (last 8, descending by minute)
    const recentEvents = [...events].sort((a, b) => b.minute - a.minute).slice(0, 8);


    /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    return (
        <main className="match-center-container">
            {/* â•â•â•â•â•â•â•â•â•â•â• 1. HEADER â•â•â•â•â•â•â•â•â•â•â• */}
            <header className="match-center-header">
                <div className="header-left">
                    <button onClick={() => onClose ? onClose() : router.back()} className="mc-btn mc-btn-outline" style={{ border: 'none' }}>
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
                            {match.status === 'live' && match.clock?.minute ? `${match.clock.minute}'` : ''} {statusLabel(match.status)}
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
                                <div className="mc-card-header"><h4>Resultado Extendido</h4></div>
                                <div className="mc-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                                    <div style={{ padding: 16, background: '#111', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Parciales</div>
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
                                            {recentEvents.map((ev, i) => (
                                                <div key={ev.id || i} className="event-entry" style={{ padding: '8px 12px', marginBottom: 8, background: 'transparent', border: 'none' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 900, color: eventTypeColor(ev.type, eventDefinitions), width: 40 }}>{ev.minute}&apos;</div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                                                {eventTypeLabel(ev.type, eventDefinitions)}{' '}
                                                        <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: 8 }}>
                                                            {teamTag(ev.team)} {ev.playerName || ev.detail}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
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
                                            <div style={{ background: '#111', borderRadius: 8, border: '1px solid #222', overflow: 'hidden' }}>
                                                <div style={{ background: '#222', padding: '10px 16px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.05em', color: '#888' }}>
                                                    TITULARES ({starters.length})
                                                </div>
                                                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {starters.map((p, idx) => (
                                                        <div key={idx} className="player-row">
                                                            <span className="player-number">{p.number}</span>
                                                            <input
                                                                type="text"
                                                                value={p.name}
                                                                placeholder="Nombre jugador"
                                                                className="inline-input"
                                                                onChange={(e) => {
                                                                    const updated = [...lineups[team]];
                                                                    const realIdx = updated.findIndex(x => x.number === p.number);
                                                                    if (realIdx >= 0) {
                                                                        updated[realIdx] = {
                                                                            ...updated[realIdx],
                                                                            id: undefined,
                                                                            squadMemberId: null,
                                                                            name: e.target.value,
                                                                        };
                                                                    }
                                                                    setLocalLineups({ ...lineups, [team]: updated });
                                                                }}
                                                            />
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
                                                            <input
                                                                type="text"
                                                                value={p.name}
                                                                placeholder="Nombre suplente"
                                                                className="inline-input"
                                                                style={{ color: '#ccc' }}
                                                                onChange={(e) => {
                                                                    const updated = [...lineups[team]];
                                                                    const realIdx = updated.findIndex(x => x.number === p.number);
                                                                    if (realIdx >= 0) {
                                                                        updated[realIdx] = {
                                                                            ...updated[realIdx],
                                                                            id: undefined,
                                                                            squadMemberId: null,
                                                                            name: e.target.value,
                                                                        };
                                                                    }
                                                                    setLocalLineups({ ...lineups, [team]: updated });
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* â”€â”€ TAB: EVENTOS â”€â”€ */}
                {activeTab === 'eventos' && (
                    <article className="mc-partition" style={{ maxWidth: 900, margin: '0 auto' }}>
                        <div className="mc-card-header">
                            <h4>Timeline de Eventos ({events.length})</h4>
                            <button className="mc-btn mc-btn-primary" onClick={() => {
                                const defaultEvent = eventDefinitions[0] || {
                                    type: 'score',
                                    label: 'Punto',
                                    category: 'score',
                                    points: 1,
                                    team: 'required',
                                    player: 'optional',
                                };
                                const newEvent: MatchEvent = {
                                    id: crypto.randomUUID(),
                                    minute: 0,
                                    type: defaultEvent.type,
                                    team: defaultEvent.team === 'none' ? null : 'home',
                                    playerId: null,
                                    playerName: '',
                                    detail: '',
                                };
                                setLocalEvents((prev) => [...prev, newEvent]);
                            }}>
                                <Plus size={14} /> Evento
                            </button>
                        </div>
                        <div className="mc-card-body" style={{ padding: 0 }}>
                            {events.length === 0 ? (
                                <p className="empty-msg">Sin eventos. Haz clic en &quot;+ Evento&quot; para agregar.</p>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '70px 130px 100px 1fr 80px', padding: '12px 24px', fontSize: '0.7rem', fontWeight: 800, color: '#666', borderBottom: '1px solid #222' }}>
                                        <div>MIN</div><div>TIPO</div><div>EQUIPO</div><div>JUGADOR / DETALLE</div><div style={{ textAlign: 'right' }}>ACCION</div>
                                    </div>
                                    {[...events].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id)).map((ev) => {
                                        const selectedDefinition = eventDefinitionMap[ev.type] || {
                                            type: ev.type,
                                            label: eventTypeLabel(ev.type, eventDefinitions),
                                            category: 'other' as const,
                                            points: 0,
                                            team: 'optional' as const,
                                            player: 'optional' as const,
                                        };

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
                                                        });
                                                    }}
                                                >
                                                    {!eventDefinitionMap[ev.type] && (
                                                        <option value={ev.type}>{eventTypeLabel(ev.type, eventDefinitions)}</option>
                                                    )}
                                                    {eventDefinitions.map((definition) => (
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
                                                    })}
                                                >
                                                    <option value="">-</option>
                                                    <option value="home">{homeName}</option>
                                                    <option value="away">{awayName}</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                                <input
                                                    type="text" value={selectedDefinition.player === 'none' ? ev.detail : ev.playerName} placeholder={selectedDefinition.player === 'none' ? 'Detalle del evento' : selectedDefinition.player === 'required' ? 'Nombre del jugador' : 'Jugador (opcional)'}
                                                    className="inline-input" style={{ fontSize: '0.85rem' }}
                                                    onChange={(e) => updateLocalEvent(ev.id, selectedDefinition.player === 'none'
                                                        ? { detail: e.target.value }
                                                        : { playerId: null, playerName: e.target.value })}
                                                />
                                                {selectedDefinition.player !== 'none' && (
                                                    <input
                                                        type="text"
                                                        value={ev.detail}
                                                        placeholder="Detalle adicional (opcional)"
                                                        className="inline-input"
                                                        style={{ fontSize: '0.8rem', opacity: 0.85 }}
                                                        onChange={(e) => updateLocalEvent(ev.id, { detail: e.target.value })}
                                                    />
                                                )}
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
                )}

                {/* Stats */}
                {activeTab === 'estadisticas' && (
                    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                        {events.length === 0 ? (
                            <article className="mc-partition">
                                <div className="mc-card-body">
                                    <p className="empty-msg">Las estadisticas se generan automaticamente a partir de los eventos. Carga eventos primero.</p>
                                </div>
                            </article>
                        ) : (
                            <article className="mc-partition" style={{ background: '#111' }}>
                                <div className="mc-card-header"><h4>Comparativo por Equipo</h4></div>
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
                            </article>
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
                                    onChange={async (e) => {
                                        const nextStatus = e.target.value;
                                        setMatch((prev) => ({ ...prev, status: nextStatus }));
                                        await commitConfigPatch(
                                            { status: nextStatus },
                                            { syncDirtyEvents: true },
                                        );
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
                            <div className="form-group">
                                <label>Marcador Local</label>
                                <input
                                    type="number"
                                    value={score.home}
                                    min={0}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => handleScoreInputChange('home', e.target.value)}
                                    onBlur={async (e) => {
                                        const newScore = { ...score, home: parseInt(e.target.value) || 0 };
                                        await commitConfigPatch(
                                            { score: newScore },
                                            { syncDirtyEvents: true },
                                        );
                                    }}
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
                                    onBlur={async (e) => {
                                        const newScore = { ...score, away: parseInt(e.target.value) || 0 };
                                        await commitConfigPatch(
                                            { score: newScore },
                                            { syncDirtyEvents: true },
                                        );
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Estadio / Venue</label>
                                <input
                                    type="text"
                                    value={match.venue || ''}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => setMatch((prev) => ({ ...prev, venue: e.target.value }))}
                                    onBlur={async (e) => {
                                        await commitConfigPatch(
                                            { venue: e.target.value },
                                            { includePoints: false },
                                        );
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    value={dateTimeDraft}
                                    style={{ borderRadius: 4 }}
                                    onChange={(e) => setDateTimeDraft(e.target.value)}
                                    onBlur={async (e) => {
                                        if (e.target.value) {
                                            const [date, time] = e.target.value.split('T');
                                            const nextDateTime = combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
                                            if (!nextDateTime) return;
                                            await commitConfigPatch(
                                                { dateTime: nextDateTime },
                                                { includePoints: false },
                                            );
                                        }
                                    }}
                                />
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
                                        value={localPoints.home_base_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseInt(e.target.value) || 0);
                                            setLocalPoints(prev => ({ ...prev, home_base_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Puntos base visitante</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={localPoints.away_base_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseInt(e.target.value) || 0);
                                            setLocalPoints(prev => ({ ...prev, away_base_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Bonus / modificador local</label>
                                    <input
                                        type="number"
                                        value={localPoints.home_bonus_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value) || 0;
                                            setLocalPoints(prev => ({ ...prev, home_bonus_points: v, points_autocalculated: false }));
                                        }}
                                    />
                                    <small style={{ color: '#666', fontSize: 11 }}>Permite sumar o restar puntos manualmente.</small>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label>Bonus / modificador visitante</label>
                                    <input
                                        type="number"
                                        value={localPoints.away_bonus_points ?? 0}
                                        style={{ borderRadius: 4 }}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value) || 0;
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


