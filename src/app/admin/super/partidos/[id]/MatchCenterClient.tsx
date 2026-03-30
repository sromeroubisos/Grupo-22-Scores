'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { StandingsEngine } from '@/lib/services/standingsEngine';
import {
    APP_TIMEZONE,
    combineLocalDateTimeToUtcIso,
    formatDateInTimeZone,
    toInputDateInTimeZone,
    toInputTimeInTimeZone,
} from '@/lib/timezone';
import './match-center.css';

/* ─────────────────── TYPES ─────────────────── */
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

/* ─────────────────── TABS ─────────────────── */
const TABS = [
    { id: 'resumen', label: 'Resumen', icon: Layout },
    { id: 'alineaciones', label: 'Alineaciones', icon: Users },
    { id: 'eventos', label: 'Eventos', icon: Clock },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart2 },
    { id: 'contenido', label: 'Contenido', icon: ImageIcon },
    { id: 'oficiales', label: 'Oficiales', icon: Users },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
];

/* ─────────────────── HELPERS ─────────────────── */
function statusLabel(s: string): string {
    switch (s) {
        case 'final': return 'FINAL';
        case 'live': return 'EN VIVO';
        case 'scheduled': return 'PROGRAMADO';
        case 'postponed': return 'APLAZADO';
        case 'cancelled': return 'CANCELADO';
        default: return s.toUpperCase();
    }
}

function statusColor(s: string): string {
    switch (s) {
        case 'final': return '#888';
        case 'live': return '#ef4444';
        case 'scheduled': return 'var(--accent)';
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

function countTries(events: MatchEvent[], team: 'home' | 'away'): number {
    return events.filter(e => e.type === 'try' && e.team === team).length;
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

/* ─── POINTS HELPERS ─── */
interface PointsRules {
    win: number;
    draw: number;
    loss: number;
    offensive: {
        threshold: number;
        points: number;
    } | null;
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

    const offensive =
        offensiveRule === true
            ? { threshold: 4, points: 1 }
            : offensiveRule && typeof offensiveRule === 'object'
                ? {
                    threshold: Number(offensiveRule.tries ?? offensiveRule.threshold ?? 4),
                    points: Number(offensiveRule.points ?? offensiveRule.value ?? 1),
                }
                : null;

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

function countTeamTries(score: MatchScore, events: MatchEvent[], team: 'home' | 'away') {
    const scoreValue = team === 'home' ? score.homeTries : score.awayTries;
    if (typeof scoreValue === 'number' && Number.isFinite(scoreValue)) {
        return scoreValue;
    }
    return countTries(events, team);
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

    const homeTries = countTeamTries(score, events, 'home');
    const awayTries = countTeamTries(score, events, 'away');

    if (rules.offensive) {
        if (homeTries >= rules.offensive.threshold) homeBonus += rules.offensive.points;
        if (awayTries >= rules.offensive.threshold) awayBonus += rules.offensive.points;
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

/* ─────────────────── CLIENT COMPONENT ─────────────────── */
export default function MatchCenterClient({ initialMatch, matchId, onClose }: MatchCenterClientProps) {
    const router = useRouter();
    const supabase = createClient();

    const [match, setMatch] = useState<MatchRow>(initialMatch);
    const [activeTab, setActiveTab] = useState('resumen');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    // Editable state for events & lineups (local mirrors of DB JSONB)
    const [localEvents, setLocalEvents] = useState<MatchEvent[]>(Array.isArray(initialMatch.events) ? initialMatch.events : []);
    const [localLineups, setLocalLineups] = useState<MatchLineups>(initialMatch.lineups || { home: [], away: [] });

    // Editable state for per-match points
    const [localPoints, setLocalPoints] = useState<MatchPoints>(() => toLocalPoints(initialMatch));
    const [savingPoints, setSavingPoints] = useState(false);
    const [pointsRules, setPointsRules] = useState<PointsRules>(DEFAULT_POINTS_RULES);
    const [eventDefinitions, setEventDefinitions] = useState<MatchEventDefinition[]>(
        () => getDefaultMatchEventDefinitions(initialMatch.tournament?.sport_id ?? initialMatch.tournament?.sportId ?? null),
    );
    const [lineupSizeInput, setLineupSizeInput] = useState(() => String(getLineupSize(initialMatch.lineups)));
    const [dateTimeDraft, setDateTimeDraft] = useState(() => toDateTimeLocalInput(initialMatch.date_time));

    const applyMatchResponse = useCallback((nextMatch: MatchRow, preserveLineupsIfIncomingEmpty = false) => {
        setMatch(nextMatch);
        setLocalEvents(Array.isArray(nextMatch.events) ? nextMatch.events : []);
        setLocalLineups((prev) => {
            const next = nextMatch.lineups || { home: [], away: [] };
            const hasNext = next.home.length > 0 || next.away.length > 0;
            const hasPrev = prev.home.length > 0 || prev.away.length > 0;
            return preserveLineupsIfIncomingEmpty && !hasNext && hasPrev ? prev : next;
        });
        setLocalPoints(toLocalPoints(nextMatch));
        setLineupSizeInput(String(getLineupSize(nextMatch.lineups)));
        setDateTimeDraft(toDateTimeLocalInput(nextMatch.date_time));
    }, []);

    const getAutoPointsSnapshot = useCallback((
        nextScore: MatchScore = match.score || { home: 0, away: 0 },
        nextEvents: MatchEvent[] = localEvents,
        nextStatus: string = match.status,
    ) => calculateAutocalculatedPoints(nextStatus, nextScore, nextEvents, pointsRules), [localEvents, match.score, match.status, pointsRules]);

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

    const persistMatchPatch = useCallback(async (
        payload: Record<string, unknown>,
        options?: { includePoints?: boolean; preserveLineupsIfIncomingEmpty?: boolean },
    ) => {
        let pointsPayload: Record<string, unknown> = {};
        if (options?.includePoints !== false) {
            if (localPoints.points_autocalculated === false) {
                pointsPayload = buildPointsPatchPayload({
                    score: payload.score as MatchScore | undefined,
                    events: payload.events as MatchEvent[] | undefined,
                    status: typeof payload.status === 'string' ? payload.status : undefined,
                });
            } else {
                const configuration = await fetchMatchConfiguration(match);
                pointsPayload = toPointPatchPayload(calculateAutocalculatedPoints(
                    typeof payload.status === 'string' ? payload.status : match.status,
                    (payload.score as MatchScore | undefined) ?? (match.score || { home: 0, away: 0 }),
                    (payload.events as MatchEvent[] | undefined) ?? localEvents,
                    configuration.pointsRules,
                ));
            }
        }

        const finalPayload = options?.includePoints === false
            ? payload
            : {
                ...payload,
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

        const updatedMatch = result as MatchRow;
        applyMatchResponse(updatedMatch, options?.preserveLineupsIfIncomingEmpty ?? false);
        return updatedMatch;
    }, [applyMatchResponse, buildPointsPatchPayload, localEvents, localPoints.points_autocalculated, match, matchId]);

    /* ─── REFRESH (for after saves / config changes) ─── */
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

            applyMatchResponse(payload as MatchRow, true);
        } catch (err: unknown) {
            console.error('Error refreshing match:', err);
        }
    }, [applyMatchResponse, matchId]);

    /* ─── POINTS: RECALCULATE & SAVE ─── */
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
                await persistMatchPatch({});
            }
        } finally {
            setSavingPoints(false);
        }
    }, [localPoints, persistMatchPatch]);

    // Reactive: recalculate whenever score/status/events change, only while in auto mode
    useEffect(() => {
        if (localPoints.points_autocalculated === false) return;
        setLocalPoints(getAutoPointsSnapshot());
    }, [getAutoPointsSnapshot, localPoints.points_autocalculated]);

    /* ─── REALTIME (live matches) ─── */
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
                setMatch(prev => ({ ...prev, ...updated } as unknown as MatchRow));
                if (Array.isArray(updated.events)) setLocalEvents(updated.events as MatchEvent[]);
                if (updated.lineups) setLocalLineups(updated.lineups as MatchLineups);
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

    /* ─── SAVE ─── */
    const handleSave = async () => {
        if (!match) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            console.log('[MatchCenter] Saving via API — events:', localEvents.length, 'lineups home:', localLineups.home.length, 'away:', localLineups.away.length);

            await persistMatchPatch({
                events: localEvents,
                lineups: localLineups,
            });
            setSaveMsg({ type: 'ok', text: '✓ Guardado correctamente' });
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (err: unknown) {
            console.error('[MatchCenter] Save error:', err);
            setSaveMsg({ type: 'err', text: `Error de red: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setSaving(false);
        }
    };

    /* ─── DERIVED DATA (all computed, zero hardcode) ─── */
    const commitConfigPatch = useCallback(async (payload: Record<string, unknown>) => {
        try {
            await persistMatchPatch(payload);
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

    const score = match.score || { home: 0, away: 0 };
    const events = localEvents;
    const lineups = localLineups;
    const eventDefinitionMap = buildMatchEventDefinitionMap(eventDefinitions);

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
    const winner = score.home > score.away ? 'LOCAL' : score.away > score.home ? 'VISITANTE' : score.home === score.away && score.home === 0 ? '—' : 'EMPATE';

    // Bonus ofensivo (4+ tries)
    const homeTriesCount = countTeamTries(score, events, 'home');
    const awayTriesCount = countTeamTries(score, events, 'away');
    const homeBonusOff = pointsRules.offensive ? homeTriesCount >= pointsRules.offensive.threshold : false;
    const awayBonusOff = pointsRules.offensive ? awayTriesCount >= pointsRules.offensive.threshold : false;
    const offensiveThresholdLabel = pointsRules.offensive?.threshold ?? 0;
    const bonusOffText = !pointsRules.offensive
        ? 'No aplica'
        : homeBonusOff && awayBonusOff
            ? `${homeName} y ${awayName} (${offensiveThresholdLabel}+ tries)`
            : homeBonusOff
                ? `${homeName} (${homeTriesCount} tries)`
                : awayBonusOff
                    ? `${awayName} (${awayTriesCount} tries)`
                    : 'No';

    // Bonus defensivo (lose by ≤7)
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


    /* ─────────────────── RENDER ─────────────────── */
    return (
        <main className="match-center-container">
            {/* ═══════════ 1. HEADER ═══════════ */}
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
                            <span className="score-sep">—</span>
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
                            background: saveMsg.type === 'ok' ? '#052e16' : '#450a0a',
                            color: saveMsg.type === 'ok' ? '#4ade80' : '#fca5a5',
                            border: `1px solid ${saveMsg.type === 'ok' ? '#166534' : '#991b1b'}`,
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

            {/* ═══════════ 2. TABS ═══════════ */}
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

            {/* ═══════════ 3. CONTENT ═══════════ */}
            <section className="match-content-grid">

                {/* ── TAB: RESUMEN ── */}
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
                                        <div style={{ fontWeight: 800, color: winner === 'EMPATE' || winner === '—' ? '#666' : 'var(--accent)' }}>{winner}</div>
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

                            {/* Métricas derivadas de eventos */}
                            <article className="mc-partition">
                                <div className="mc-card-header"><h4>Métricas Clave</h4></div>
                                <div className="mc-card-body">
                                    {totalEvents === 0 ? (
                                        <p className="empty-msg">No hay eventos registrados aún. Carga eventos en la pestaña &quot;Eventos&quot;.</p>
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
                            {/* Últimos Eventos */}
                            <article className="mc-partition" style={{ flex: 1 }}>
                                <div className="mc-card-header">
                                    <h4>Últimos Eventos</h4>
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
                                        <Video size={16} /> Transmisión
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

                {/* ── TAB: ALINEACIONES ── */}
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
                                    const starters = players.filter(p => p.role === 'starter' || (!p.role && p.number <= 15));
                                    const subs = players.filter(p => p.role === 'substitute' || (!p.role && p.number > 15));

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

                {/* ── TAB: EVENTOS ── */}
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
                                        <div>MIN</div><div>TIPO</div><div>EQUIPO</div><div>JUGADOR / DETALLE</div><div style={{ textAlign: 'right' }}>ACCIÓN</div>
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
                                                    <option value="">—</option>
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

                {/* ── TAB: ESTADÍSTICAS ── */}
                {activeTab === 'estadisticas' && (
                    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                        {events.length === 0 ? (
                            <article className="mc-partition">
                                <div className="mc-card-body">
                                    <p className="empty-msg">Las estadísticas se generan automáticamente a partir de los eventos. Carga eventos primero.</p>
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
                                            const tries = rows[0]?.subtotal ?? 0;
                                            const convs = rows[1]?.subtotal ?? 0;
                                            const pens = rows[2]?.subtotal ?? 0;
                                            const drops = rows[3]?.subtotal ?? 0;
                                            const clubName = team === 'home' ? homeName : awayName;
                                            return (
                                                <div key={team} style={{ padding: 16, background: '#1a1a1a', borderRadius: 8 }}>
                                                    <div style={{ fontWeight: 900, marginBottom: 12, fontSize: '0.85rem' }}>{clubName}</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Tries ({countTries(events, team)}×5)</span><span style={{ fontWeight: 800 }}>{tries}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Conversiones (×2)</span><span style={{ fontWeight: 800 }}>{convs}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Penales (×3)</span><span style={{ fontWeight: 800 }}>{pens}</span></div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Drop Goals (×3)</span><span style={{ fontWeight: 800 }}>{drops}</span></div>
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

                {/* ── TAB: CONTENIDO ── */}
                {activeTab === 'contenido' && (
                    <article className="mc-partition" style={{ maxWidth: 800, margin: '0 auto', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <div className="mc-grid-2">
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Transmisión en Vivo (URL)</label>
                                <input
                                    type="text"
                                    defaultValue={watchUrl || ''}
                                    placeholder="https://youtube.com/..."
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 12, color: '#fff', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Replay Completo (URL)</label>
                                <input
                                    type="text"
                                    defaultValue={match.replay_url || ''}
                                    placeholder="https://youtube.com/..."
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 12, color: '#fff', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222', gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Crónica del Partido</label>
                                <textarea
                                    placeholder="Redactar la crónica oficial..."
                                    rows={6}
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', padding: 16, color: '#fff', borderRadius: 4, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ background: '#111', padding: 24, borderRadius: 12, border: '1px solid #222', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', minHeight: 120 }}>
                                <div style={{ textAlign: 'center', color: '#666' }}>
                                    <ImageIcon size={32} style={{ margin: '0 auto 12px' }} />
                                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Subir Galería de Fotos / Highlights</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Arrastra y suelta aquí</div>
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* ── TAB: OFICIALES ── */}
                {activeTab === 'oficiales' && (
                    <article className="mc-partition" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <div className="mc-card-header"><h4>Autoridades del Partido</h4></div>
                        <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {['Árbitro Principal', 'Asistente 1 (AR1)', 'Asistente 2 (AR2)', 'TMO', 'Médico Jefe', 'Comisionado Deportivo'].map(role => (
                                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <label style={{ width: 200, fontSize: '0.8rem', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>{role}</label>
                                    <input
                                        type="text"
                                        placeholder="Nombre del oficial"
                                        style={{ flex: 1, background: '#111', border: '1px solid #333', padding: '10px 14px', color: '#fff', borderRadius: 4, outline: 'none' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </article>
                )}

                {/* ── TAB: CONFIGURACIÓN ── */}
                {activeTab === 'configuracion' && (
                    <article className="mc-partition" style={{ maxWidth: 600, margin: '0 auto' }}>
                        <div className="mc-card-header"><h4>Parámetros del Partido</h4></div>
                        <div className="mc-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div className="form-group">
                                <label>Estado Actual</label>
                                <select
                                    value={match.status}
                                    style={{ borderRadius: 4 }}
                                    onChange={async (e) => {
                                        const nextStatus = e.target.value;
                                        setMatch((prev) => ({ ...prev, status: nextStatus }));
                                        await commitConfigPatch({ status: nextStatus });
                                    }}
                                >
                                    <option value="scheduled">Programado</option>
                                    <option value="live">En Vivo</option>
                                    <option value="final">Finalizado</option>
                                    <option value="postponed">Aplazado</option>
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
                                        await commitConfigPatch({ score: newScore });
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
                                        await commitConfigPatch({ score: newScore });
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
                                        await commitConfigPatch({ venue: e.target.value });
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
                                            await commitConfigPatch({ dateTime: nextDateTime });
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* ── PUNTOS DEL PARTIDO ── */}
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
                                Los puntos base se completan automáticamente según las reglas del partido. Podés agregar bonus o penalizaciones manuales.
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
                                        placeholder="Ej: Sanción disciplinaria, corrección de resultado..."
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
                                    Recalcular automáticamente
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

