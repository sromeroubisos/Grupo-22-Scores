'use client';

import React, { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { getTournamentById } from '@/lib/data/tournaments';
import { ArrowLeft, Calendar, Trophy, Users, ChevronRight, Share2, MapPin } from 'lucide-react';
import ExportImage from '@/components/ExportImage';
import { useFavorites } from '@/hooks/useFavorites';
import { setCachedLogo } from '@/lib/utils/logoCache';
import PlayoffBracket from '@/components/PlayoffBracket';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { getCountryById } from '@/lib/data/countries';
import { normalizeTeamLabelAssignments, resolveStandingsRowLabel } from '@/lib/teamLabels';
import { addDaysToIsoDate, APP_TIMEZONE, formatDateInTimeZone, formatDateKey } from '@/lib/timezone';
import type { TournamentInitialData } from '@/lib/server/fetchTournamentData';
import { normalizeTournamentFormat } from '@/lib/utils/tournamentFormat';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import { useAuth } from '@/context/AuthContext';

// Tabs
const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'standings', label: 'Clasificación' },
    { id: 'playoff', label: 'Playoff' },
    { id: 'teams', label: 'Equipos' },
    { id: 'stats', label: 'Estadísticas' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_CIRCUIT_PLACEMENT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4];
const CIRCUIT_GLOBAL_SCOPE = '__circuit_global__';

type CircuitStandingsView = {
    id: string;
    kind: 'global' | 'phase';
    label: string;
    subtitle: string;
    standings: any[];
};

type StandingsColumnMode = 'standard' | 'circuit-global';

function getTeamLogo(team: any): string {
    if (!team) return '';
    return team.small_image_path || team.smaill_image_path || team.image_path || team.logo || team.logo_url || team.logo_path || '';
}

function getTournamentLogo(detailsData: any, localData: any): string {
    if (detailsData) {
        return (
            detailsData.image_path ||
            detailsData.logo ||
            detailsData.logo_path ||
            detailsData.tournament_logo ||
            detailsData.tournament_image_path ||
            ''
        );
    }
    return localData?.logoUrl || '';
}

function buildClubHref(
    team: { id?: string | number | null; name?: string | null; teamUrl?: string | null },
    preferredSport?: string | null,
) {
    const rawId = String(team.id ?? '').trim();
    if (!rawId) return null;

    const normalizedId = rawId.startsWith('fs-team-')
        ? rawId
        : rawId.startsWith('fs-')
            ? `fs-team-${rawId.slice(3)}`
            : rawId;

    const params = new URLSearchParams();
    if (team.name) params.set('name', team.name);
    if (team.teamUrl) params.set('team_url', team.teamUrl);
    if (preferredSport) params.set('sport', preferredSport);

    const query = params.toString();
    return `/clubs/${normalizedId}${query ? `?${query}` : ''}`;
}

function getParticipantClub(participant: any) {
    if (!participant) return null;
    if (Array.isArray(participant.clubs) && participant.clubs.length > 0) {
        return participant.clubs[0];
    }
    return participant.club ?? null;
}

function formatArgentinaDate(value: string | Date | null, options: Intl.DateTimeFormatOptions) {
    return formatDateInTimeZone(value, 'es-AR', options, APP_TIMEZONE) || '';
}

/**
 * Format a scheduled match date/time for the mobile score box.
 * Returns "Hoy • HH:MM", "Mañana • HH:MM", or "Sáb 28 feb • HH:MM".
 */
function formatMatchSchedule(date: Date | null, todayKey: string): string {
    if (!date) return 'VS';
    const matchDayKey = formatDateKey(date, APP_TIMEZONE);
    const tomorrowKey = addDaysToIsoDate(todayKey, 1);
    const diffDays = matchDayKey === todayKey ? 0 : matchDayKey === tomorrowKey ? 1 : 2;
    const timeStr = formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (diffDays === 0) return `Hoy • ${timeStr}`;
    if (diffDays === 1) return `Mañana • ${timeStr}`;
    const dayName  = formatArgentinaDate(date, { weekday: 'short' });
    const dayMonth = formatArgentinaDate(date, { day: 'numeric', month: 'short' });
    // Capitalise first letter of weekday abbrev ("sáb" → "Sáb")
    const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1).replace('.', '');
    return `${dayLabel} ${dayMonth} • ${timeStr}`;
}

function getMatchRenderKey(match: any, fallbackIndex: number): string {
    const primaryId = match.event_key || match.match_id || match.id;
    if (primaryId) return String(primaryId);

    const timestamp = match.timestamp || match.start_time || match.time || 'na';
    const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'home';
    const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'away';

    return `${homeName}-${awayName}-${timestamp}-${fallbackIndex}`;
}

/** Pick the most relevant match to feature: live > next scheduled > last result */
function getFeaturedMatch(results: any[], fixtures: any[]): { match: any; isResult: boolean } | null {
    const all = [...results, ...fixtures];
    const live = all.find(m => m.status === 'live' || m.status === 'in_play');
    if (live) return { match: live, isResult: true };
    if (fixtures.length > 0) return { match: fixtures[0], isResult: false };
    if (results.length > 0) return { match: results[0], isResult: true };
    return null;
}

/** Derive tournament status label from available data */
function getTournamentStatus(details: any): 'active' | 'upcoming' | 'finished' {
    if (!details) return 'active';
    if (details.is_current === true) return 'active';
    if (details.is_current === false) return 'finished';
    return 'active';
}

/** Compute quick stats from available data */
function getQuickStats(
    results: any[],
    fixtures: any[],
    overallRows: any[],
    teamsCount: number,
) {
    const played = results.length;
    const upcoming = fixtures.length;
    const teams = teamsCount || overallRows.length;

    // Leader
    let leaderName = '—';
    if (overallRows.length > 0) {
        const firstRow = overallRows[0]?.rows ? overallRows[0].rows[0] : overallRows[0];
        if (firstRow) {
            leaderName = firstRow.team?.name || firstRow.participant?.name || firstRow.name || '—';
        }
    }

    // Next match date
    let nextDate = '—';
    if (fixtures.length > 0) {
        const ts = fixtures[0].timestamp || fixtures[0].start_time || fixtures[0].time;
        if (ts) {
            nextDate = formatArgentinaDate(new Date(ts * 1000), { day: '2-digit', month: '2-digit' });
        }
    }

    return { played, upcoming, teams, leaderName, nextDate };
}

function hexToRgba(color: string, alpha: number) {
    const normalized = color.trim();
    const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;

    if (/^[0-9a-f]{3}$/i.test(hex)) {
        const [r, g, b] = hex.split('').map((char) => parseInt(char + char, 16));
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    if (/^[0-9a-f]{6}$/i.test(hex)) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const rgbMatch = normalized.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }

    return normalized;
}

function buildRowAccentStyle(color?: string | null): CSSProperties | undefined {
    if (!color) return undefined;
    return {
        '--standings-row-accent': color,
        '--standings-row-bg': hexToRgba(color, 0.14),
        '--standings-row-bg-strong': hexToRgba(color, 0.2),
    } as CSSProperties;
}

function sortTournamentPhases(phases: any[]) {
    return [...phases].sort((left: any, right: any) => {
        const leftOrder = typeof left?.order_index === 'number' ? left.order_index : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right?.order_index === 'number' ? right.order_index : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return String(left?.name || '').localeCompare(String(right?.name || ''));
    });
}

function getPhaseDisplayName(phase: any, index: number) {
    const name = String(phase?.name || '').trim();
    return name || `Etapa ${index + 1}`;
}

function getTournamentCompetitionFormat(ruleset: any, fallback?: string | null) {
    return normalizeTournamentFormat(
        ruleset?.competition?.format_type ??
        (ruleset?.circuit?.enabled ? 'circuit' : fallback) ??
        'league',
        'league',
    );
}

function isCircuitTournamentRuleset(ruleset: any, fallback?: string | null) {
    return getTournamentCompetitionFormat(ruleset, fallback) === 'circuit';
}

function parseCircuitPlacementPoints(input: unknown) {
    if (!Array.isArray(input)) return [];

    return input
        .map((item: any) => {
            const position = Number(item?.position);
            const points = Number(item?.points);
            if (!Number.isFinite(position) || position <= 0) return null;

            return {
                position,
                points: Number.isFinite(points) ? points : 0,
            };
        })
        .filter((item): item is { position: number; points: number } => Boolean(item))
        .sort((left, right) => left.position - right.position);
}

function getDefaultCircuitPlacementPoints() {
    return DEFAULT_CIRCUIT_PLACEMENT_POINTS.map((points, index) => ({
        position: index + 1,
        points,
    }));
}

function resolveCircuitPlacementPoints(phase: any, tournamentRuleset: any) {
    const fromPhase = parseCircuitPlacementPoints(
        phase?.settings?.circuit?.pointsByPlacement ?? phase?.settings?.placementPoints,
    );
    if (fromPhase.length > 0) return fromPhase;

    const rulesetStages = Array.isArray(tournamentRuleset?.circuit?.stages)
        ? tournamentRuleset.circuit.stages
        : [];
    const phaseOrder = typeof phase?.order_index === 'number' ? phase.order_index : null;
    const stageMatch = rulesetStages.find((stage: any, index: number) =>
        String(stage?.id || '') === String(phase?.id || '') ||
        String(stage?.name || '').trim() === String(phase?.name || '').trim() ||
        Number(stage?.order) === Number(phaseOrder ?? (index + 1)) ||
        Number(stage?.order) === Number((phaseOrder ?? index) + 1),
    );
    const fromRuleset = parseCircuitPlacementPoints(stageMatch?.circuit_points);
    if (fromRuleset.length > 0) return fromRuleset;

    return getDefaultCircuitPlacementPoints();
}

function buildLegendSwatchStyle(color?: string | null): CSSProperties | undefined {
    if (!color) return undefined;
    return {
        '--standings-legend-accent': color,
        '--standings-legend-bg': hexToRgba(color, 0.18),
        '--standings-legend-border': hexToRgba(color, 0.3),
    } as CSSProperties;
}

type StandingsLegendItem = {
    key: string;
    name: string;
    color: string;
};

function collectStandingsLegendItems(rows: any[], assignments: any[]): StandingsLegendItem[] {
    const seen = new Set<string>();
    const items: StandingsLegendItem[] = [];

    rows.forEach((row: any) => {
        const label = resolveStandingsRowLabel(row, assignments);
        if (!label?.name || !label?.color) return;

        const key = `${label.id}|${label.name}|${label.color}`;
        if (seen.has(key)) return;

        seen.add(key);
        items.push({
            key,
            name: label.name,
            color: label.color,
        });
    });

    return items;
}

function isGroupedStandingsData(rows: any[]): boolean {
    return Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0]?.rows);
}

function normalizeStandingsRows(raw: any[]): any[] {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (isGroupedStandingsData(raw)) return raw;
    if (raw[0]?.team_id || raw[0]?.participant || raw[0]?.name || raw[0]?.team) return raw;
    return [];
}

function flattenStandingsRows(raw: any[]): any[] {
    const normalized = normalizeStandingsRows(raw);
    if (normalized.length === 0) return [];
    if (isGroupedStandingsData(normalized)) {
        return normalized.flatMap((group: any) => Array.isArray(group.rows) ? group.rows : []);
    }
    return normalized;
}

function getStandingsTeamName(row: any) {
    return row.team?.name || row.participant?.name || row.team_name || row.name || '';
}

function getStandingsTeamId(row: any) {
    return row.team?.id || row.team?.team_id || row.participant?.id || row.team_id || null;
}

function getStandingsTeamLogo(row: any) {
    return row.team?.logo || row.team?.logo_url || row.team?.image_path || row.team?.small_image_path ||
        row.participant?.logo_url || row.participant?.image_path || row.participant?.small_image_path || row.logo || row.team_logo || '';
}

function getStandingsTeamUrl(row: any) {
    return row.team?.team_url || row.participant?.team_url || row.team_url || null;
}

function buildGroupedStandings(dbStandings: any[], dbGroups: any[], participants: any[]) {
    if (!Array.isArray(dbGroups) || dbGroups.length === 0) return [];

    const participantGroupByClubId = new Map<string, string>();
    participants.forEach((participant: any) => {
        if (participant?.club_id && participant?.group_id) {
            participantGroupByClubId.set(String(participant.club_id), String(participant.group_id));
        }
    });

    const groupPhaseById = new Map<string, string>();
    dbGroups.forEach((group: any) => {
        if (group?.id && group?.phase_id) {
            groupPhaseById.set(String(group.id), String(group.phase_id));
        }
    });

    const resolveTeamId = (row: any) =>
        row.team?.id || row.club_id || row.team_id || row.participant?.id || null;

    const resolveGroupId = (row: any) => {
        if (row.group_id) return String(row.group_id);
        const teamId = resolveTeamId(row);
        if (!teamId) return null;
        return participantGroupByClubId.get(String(teamId)) || null;
    };

    const grouped = [...dbGroups]
        .sort((left: any, right: any) => {
            const leftOrder = typeof left?.order_index === 'number' ? left.order_index : Number.MAX_SAFE_INTEGER;
            const rightOrder = typeof right?.order_index === 'number' ? right.order_index : Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return String(left?.name || '').localeCompare(String(right?.name || ''));
        })
        .map((group: any) => {
            const groupId = String(group.id);
            const rows = dbStandings
                .map((row: any) => {
                    const effectiveGroupId = resolveGroupId(row);
                    const effectivePhaseId = row.phase_id
                        ? String(row.phase_id)
                        : (groupPhaseById.get(groupId) || null);

                    return {
                        ...row,
                        group_id: effectiveGroupId ?? row.group_id ?? null,
                        phase_id: effectivePhaseId,
                    };
                })
                .filter((row: any) => {
                    if (row.group_id !== groupId) return false;

                    const rowPhaseId = row.phase_id ? String(row.phase_id) : null;
                    const activeGroupPhaseId = groupPhaseById.get(groupId) || null;
                    if (rowPhaseId && activeGroupPhaseId && rowPhaseId !== activeGroupPhaseId) return false;

                    return true;
                })
                .sort((left: any, right: any) => (left.position || 0) - (right.position || 0));

            return {
                group_name: group.name,
                rows,
            };
        })
        .filter((group: any) => group.rows.length > 0);

    if (grouped.length > 0) return grouped;

    if (dbGroups.length === 1 && dbStandings.length > 0) {
        return [{
            group_name: dbGroups[0].name,
            rows: [...dbStandings].sort((left: any, right: any) => (left.position || 0) - (right.position || 0)),
        }];
    }

    return [];
}

function getPreferredDbPhase(phases: any[], matches: any[] = [], standings: any[] = []) {
    if (!Array.isArray(phases) || phases.length === 0) return null;

    const ordered = sortTournamentPhases(phases);

    const explicitActivePhase = ordered.find((phase: any) => phase?.is_active);
    if (explicitActivePhase) return explicitActivePhase;

    const phaseIdsWithData = new Set<string>();
    matches.forEach((match: any) => {
        if (match?.phase_id) phaseIdsWithData.add(String(match.phase_id));
    });
    standings.forEach((row: any) => {
        if (row?.phase_id) phaseIdsWithData.add(String(row.phase_id));
    });

    const latestPhaseWithData = [...ordered].reverse().find((phase: any) => phaseIdsWithData.has(String(phase.id)));
    return latestPhaseWithData ?? ordered[0] ?? null;
}

function getDbStandingsContext(dbData: TournamentInitialData, preferredPhaseId?: string | null) {
    const participants = Array.isArray(dbData.participants) ? (dbData.participants as any[]) : [];
    const matches = Array.isArray(dbData.matches) ? (dbData.matches as any[]) : [];
    const phases = sortTournamentPhases(Array.isArray(dbData.phases) ? (dbData.phases as any[]) : []);
    const groups = Array.isArray(dbData.groups) ? (dbData.groups as any[]) : [];
    const rawStandings = Array.isArray(dbData.standings) ? (dbData.standings as any[]) : [];
    const requestedPhase = preferredPhaseId
        ? phases.find((phase: any) => String(phase?.id ?? '') === String(preferredPhaseId))
        : null;
    const activePhase = requestedPhase ?? getPreferredDbPhase(phases, matches, rawStandings);
    const activePhaseId = activePhase?.id ?? null;
    const activeGroups = groups.filter(
        (group: any) => !activePhaseId || String(group?.phase_id ?? '') === String(activePhaseId),
    );
    const tournamentRuleset = (dbData.tournament as any)?.ruleset ?? {};
    const resolvedRules = StandingsEngine.resolveRules(activePhase?.settings ?? {}, tournamentRuleset);

    return {
        participants,
        matches,
        rawStandings,
        phases,
        activePhase,
        activePhaseId,
        activeGroups,
        resolvedRules,
        tournamentRuleset,
    };
}

function filterStandingsToActivePhase(
    rows: any[],
    activePhaseId: string | null,
    options?: { strict?: boolean },
) {
    if (!activePhaseId) return rows;

    const phaseScopedRows = rows.filter(
        (row: any) => row?.phase_id && String(row.phase_id) === String(activePhaseId),
    );
    if (phaseScopedRows.length > 0) return phaseScopedRows;

    if (options?.strict) return [];

    return rows.filter((row: any) => !row?.phase_id);
}

function isDbFinalStatus(status: unknown) {
    const normalized = String(status ?? '').trim().toLowerCase();
    return normalized === 'final' || normalized === 'finished' || normalized === 'ft';
}

function mapDbMatchToFrontend(match: any) {
    const normalizedStatus = isDbFinalStatus(match?.status) ? 'finished' : (match?.status ?? 'scheduled');
    const scores =
        normalizedStatus === 'scheduled'
            ? { home: null, away: null }
            : (match.score ?? { home: null, away: null });

    return {
        match_id: match.id,
        timestamp: match?.date_time ? Math.floor(new Date(match.date_time as string).getTime() / 1000) : null,
        status: normalizedStatus,
        scores,
        home_team: { id: match.home?.id ?? match.home_club_id ?? null, name: match.home?.name ?? '', short_name: match.home?.short_name ?? null, logo: match.home?.logo_url ?? '' },
        away_team: { id: match.away?.id ?? match.away_club_id ?? null, name: match.away?.name ?? '', short_name: match.away?.short_name ?? null, logo: match.away?.logo_url ?? '' },
        home_club_id: match.home_club_id,
        away_club_id: match.away_club_id,
        phase_id: match.phase_id,
        group_id: match.group_id,
        round_label: match.round_label,
        venue: match.venue,
    };
}

function mapPersistedDbStanding(row: any) {
    return {
        position: row.position,
        team: {
            name: row.club?.name ?? row.stats?.team_name ?? '',
            short_name: row.club?.short_name ?? null,
            logo: row.club?.logo_url ?? row.stats?.team_logo ?? '',
            id: row.club_id,
        },
        matches_total: row.played,
        wins_total: row.won,
        draws_total: row.drawn,
        losses_total: row.lost,
        goals_for: row.scored,
        goals_against: row.conceded,
        goal_difference: row.stats?.difference ?? (row.scored - row.conceded),
        points_total: row.points,
        bonus_points: row.bonus_points,
        adjustments: row.stats?.adjustments ?? 0,
        form: row.form,
        phase_id: row.phase_id,
        group_id: row.group_id,
    };
}

function mapCalculatedDbStanding(row: any, participants: any[], phaseId: string | null, groupId: string | null) {
    const participant = participants.find((p: any) => p.club_id === row.teamId || p.id === row.participantId);

    return {
        position: row.position,
        team: {
            name: row.team.name,
            logo: row.team.logo,
            id: row.teamId,
        },
        matches_total: row.played,
        wins_total: row.won,
        draws_total: row.drawn,
        losses_total: row.lost,
        goals_for: row.points_for,
        goals_against: row.points_against,
        goal_difference: row.difference,
        points_total: row.total_points,
        bonus_points: (row.bonus_offensive || 0) + (row.bonus_defensive || 0),
        adjustments: row.adjustments ?? 0,
        form: row.form,
        group_id: groupId ?? participant?.group_id ?? null,
        phase_id: phaseId,
    };
}

function buildCalculatedStandings(dbData: TournamentInitialData, preferredPhaseId?: string | null) {
    const {
        participants,
        matches,
        activePhaseId,
        activeGroups,
        resolvedRules,
    } = getDbStandingsContext(dbData, preferredPhaseId);

    if (participants.length === 0) return [];

    const engineParticipants = participants.map((participant: any) => ({
        ...participant,
        clubs: participant.clubs || participant.club,
    }));
    const finalMatches = matches
        .filter((match: any) => isDbFinalStatus(match?.status))
        .filter((match: any) => !activePhaseId || !match?.phase_id || match.phase_id === activePhaseId)
        .map((match: any) => ({
            ...match,
            status: 'final',
        }));

    if (activeGroups.length > 0) {
        const grouped = activeGroups
            .map((group: any) => {
                const groupParticipants = engineParticipants.filter(
                    (participant: any) => String(participant?.group_id ?? '') === String(group.id),
                );
                if (groupParticipants.length === 0) {
                    return {
                        group_name: group.name,
                        rows: [],
                    };
                }

                const groupClubIds = new Set(
                    groupParticipants.map((participant: any) => String(participant.club_id || participant.id)),
                );
                const groupMatches = finalMatches.filter((match: any) => {
                    if (match?.group_id) return String(match.group_id) === String(group.id);

                    const homeId = String(match.home_club_id || match.home_participant_id || '');
                    const awayId = String(match.away_club_id || match.away_participant_id || '');
                    return groupClubIds.has(homeId) && groupClubIds.has(awayId);
                });

                const rows = StandingsEngine.generateTable(groupParticipants, groupMatches, resolvedRules).map((row: any) =>
                    mapCalculatedDbStanding(row, participants, activePhaseId, group.id),
                );

                return {
                    group_name: group.name,
                    rows,
                };
            })
            .filter((group: any) => group.rows.length > 0);

        if (grouped.length > 0) return grouped;
    }

    return StandingsEngine.generateTable(engineParticipants, finalMatches, resolvedRules).map((row: any) =>
        mapCalculatedDbStanding(row, participants, activePhaseId, null),
    );
}

function buildStandingsSnapshot(dbData: TournamentInitialData, preferredPhaseId?: string | null) {
    const { participants, activeGroups, activePhaseId, resolvedRules } = getDbStandingsContext(dbData, preferredPhaseId);
    const persistedStandings = filterStandingsToActivePhase(
        (Array.isArray(dbData.standings) ? dbData.standings : []).map(mapPersistedDbStanding),
        activePhaseId,
        { strict: Boolean(preferredPhaseId) },
    );
    const canSafelyCalculate =
        !dbData.queryErrors?.matches &&
        !dbData.queryErrors?.participants;
    const shouldUsePersistedStandings = resolvedRules?.calculation_mode === 'fully_manual';

    if (!shouldUsePersistedStandings && canSafelyCalculate) {
        const calculatedStandings = buildCalculatedStandings(dbData, preferredPhaseId);
        const hasActualMatchData = flattenStandingsRows(calculatedStandings)
            .some((row: any) => (row.matches_total || 0) > 0);
        if (calculatedStandings.length > 0 && hasActualMatchData) return calculatedStandings;
    }

    if (persistedStandings.length === 0) return [];

    if (activeGroups.length === 0) return persistedStandings;

    const grouped = buildGroupedStandings(persistedStandings, activeGroups, participants);
    return grouped.length > 0 ? grouped : persistedStandings;
}

function buildPhaseFlatStandingsRows(dbData: TournamentInitialData, phaseId: string) {
    const persistedRows = (Array.isArray(dbData.standings) ? dbData.standings : [])
        .filter((row: any) =>
            String(row?.phase_id ?? '') === String(phaseId) &&
            !row?.group_id,
        )
        .map(mapPersistedDbStanding)
        .sort((left: any, right: any) => (left.position || 0) - (right.position || 0));

    if (persistedRows.length > 0) return persistedRows;

    return flattenStandingsRows(buildStandingsSnapshot(dbData, phaseId))
        .map((row: any, index: number) => ({
            ...row,
            position: row.position || (index + 1),
        }))
        .sort((left: any, right: any) => (left.position || 0) - (right.position || 0));
}

function buildCircuitGlobalStandings(dbData: TournamentInitialData) {
    const {
        participants,
        phases,
        tournamentRuleset,
    } = getDbStandingsContext(dbData);

    const rowsByClub = new Map<string, any>();

    participants.forEach((participant: any) => {
        const club = getParticipantClub(participant);
        const teamId = String(participant?.club_id || club?.id || participant?.id || '').trim();
        const teamName = String(club?.name || participant?.name || '').trim();
        if (!teamId || !teamName) return;

        rowsByClub.set(teamId, {
            position: 0,
            team: {
                id: teamId,
                name: teamName,
                logo: club?.logo_url || '',
            },
            points_total: 0,
            circuit: {
                stages_played: 0,
                stage_titles: 0,
                podiums: 0,
                best_finish: null as number | null,
                stage_breakdown: [] as Array<{ phase_id: string; phase_name: string; position: number; points: number }>,
            },
        });
    });

    phases.forEach((phase: any, index: number) => {
        const phaseId = String(phase?.id || '').trim();
        if (!phaseId) return;

        const phaseRows = buildPhaseFlatStandingsRows(dbData, phaseId);
        if (phaseRows.length === 0) return;

        // Skip phases not yet started (no matches played or recorded)
        const hasMatchesPlayed =
            phaseRows.some((row: any) => (row.matches_total || row.matches_played || 0) > 0) ||
            (Array.isArray(dbData.matches) ? dbData.matches : []).some(
                (m: any) => String(m?.phase_id || '') === String(phaseId) && isDbFinalStatus(m?.status),
            );
        if (!hasMatchesPlayed) return;

        const placementPoints = new Map(
            resolveCircuitPlacementPoints(phase, tournamentRuleset).map((rule) => [rule.position, rule.points]),
        );
        const phaseName = getPhaseDisplayName(phase, index);

        phaseRows.forEach((row: any, rowIndex: number) => {
            const teamId = String(getStandingsTeamId(row) || '').trim();
            const teamName = getStandingsTeamName(row);
            if (!teamId || !teamName) return;

            const position = Number(row.position || (rowIndex + 1));
            const points = placementPoints.get(position) ?? 0;
            const previous = rowsByClub.get(teamId) ?? {
                position: 0,
                team: {
                    id: teamId,
                    name: teamName,
                    logo: getStandingsTeamLogo(row) || '',
                },
                points_total: 0,
                circuit: {
                    stages_played: 0,
                    stage_titles: 0,
                    podiums: 0,
                    best_finish: null as number | null,
                    stage_breakdown: [] as Array<{ phase_id: string; phase_name: string; position: number; points: number }>,
                },
            };

            previous.team = {
                ...previous.team,
                id: teamId,
                name: previous.team?.name || teamName,
                logo: previous.team?.logo || getStandingsTeamLogo(row) || '',
            };
            previous.points_total += points;
            previous.circuit.stages_played += 1;
            previous.circuit.stage_titles += position === 1 ? 1 : 0;
            previous.circuit.podiums += position <= 3 ? 1 : 0;
            previous.circuit.best_finish =
                previous.circuit.best_finish == null
                    ? position
                    : Math.min(previous.circuit.best_finish, position);
            previous.circuit.stage_breakdown.push({
                phase_id: phaseId,
                phase_name: phaseName,
                position,
                points,
            });

            rowsByClub.set(teamId, previous);
        });
    });

    return Array.from(rowsByClub.values())
        .filter((row: any) => String(row?.team?.name || '').trim())
        .sort((left: any, right: any) => {
            const pointsDiff = (right.points_total ?? 0) - (left.points_total ?? 0);
            if (pointsDiff !== 0) return pointsDiff;

            const titleDiff = (right.circuit?.stage_titles ?? 0) - (left.circuit?.stage_titles ?? 0);
            if (titleDiff !== 0) return titleDiff;

            const podiumDiff = (right.circuit?.podiums ?? 0) - (left.circuit?.podiums ?? 0);
            if (podiumDiff !== 0) return podiumDiff;

            const leftBest = typeof left.circuit?.best_finish === 'number' ? left.circuit.best_finish : Number.MAX_SAFE_INTEGER;
            const rightBest = typeof right.circuit?.best_finish === 'number' ? right.circuit.best_finish : Number.MAX_SAFE_INTEGER;
            if (leftBest !== rightBest) return leftBest - rightBest;

            return String(left.team?.name || '').localeCompare(String(right.team?.name || ''));
        })
        .map((row: any, index: number) => ({
            ...row,
            position: index + 1,
        }));
}

function buildCircuitStandingsViews(dbData: TournamentInitialData): CircuitStandingsView[] {
    const { phases } = getDbStandingsContext(dbData);
    const views: CircuitStandingsView[] = [];
    const globalStandings = buildCircuitGlobalStandings(dbData);

    if (globalStandings.length > 0) {
        views.push({
            id: CIRCUIT_GLOBAL_SCOPE,
            kind: 'global',
            label: 'Tabla global',
            subtitle: 'Ranking acumulado del circuito',
            standings: globalStandings,
        });
    }

    phases.forEach((phase: any, index: number) => {
        const phaseId = String(phase?.id || '').trim();
        if (!phaseId) return;

        const snapshot = buildStandingsSnapshot(dbData, phaseId);
        if (flattenStandingsRows(snapshot).length === 0) return;

        const phaseName = getPhaseDisplayName(phase, index);
        views.push({
            id: phaseId,
            kind: 'phase',
            label: phaseName,
            subtitle: `Tabla final de ${phaseName}`,
            standings: snapshot,
        });
    });

    return views;
}

function buildDbTournamentSnapshot(dbData: TournamentInitialData, id: string) {
    const allMatches = (Array.isArray(dbData.matches) ? dbData.matches : []).map(mapDbMatchToFrontend);
    const tournament = dbData.tournament as any;
    const tournamentRuleset = tournament?.ruleset ?? null;
    const isCircuitCompetition = isCircuitTournamentRuleset(tournamentRuleset, tournament?.format ?? null);
    const circuitStandingsViews = isCircuitCompetition ? buildCircuitStandingsViews(dbData) : [];
    const defaultStandingsScope = circuitStandingsViews[0]?.id ?? null;
    const defaultStandings =
        circuitStandingsViews[0]?.standings ??
        buildStandingsSnapshot(dbData);

    return {
        tournamentMeta: tournament ? {
            id: tournament.id || id,
            name: tournament.display_name || tournament.name || 'Torneo',
            sportId: tournament.sport_id || 'rugby',
            countryId: tournament.country_id || 'international',
            logoUrl: tournament.logo_url || tournament.banner_url || '',
            ruleset: tournamentRuleset,
            url: tournament.url || '',
            type: isCircuitCompetition ? 'circuit' : 'league',
            categories: [],
            priority: 0,
            __isDbOnly: !tournament.url,
        } : null,
        results: sortMatchesByDate(allMatches.filter((match: any) => match.status === 'finished'), 'desc'),
        fixtures: sortMatchesByDate(allMatches.filter((match: any) => match.status !== 'finished'), 'asc'),
        standings: defaultStandings,
        dbParticipants: Array.isArray(dbData.participants) ? (dbData.participants as any[]) : [],
        dbPhases: Array.isArray(dbData.phases) ? (dbData.phases as any[]) : [],
        dbGroups: Array.isArray(dbData.groups) ? (dbData.groups as any[]) : [],
        dbTeamLabels: normalizeTeamLabelAssignments(Array.isArray(dbData.teamLabels) ? dbData.teamLabels : []),
        circuitStandingsViews,
        defaultStandingsScope,
        isCircuitCompetition,
    };
}

function resolveCountryName(detailsData: any, tournamentData: any): string {
    const detailsCountry = detailsData?.country?.name || detailsData?.country || detailsData?.country_name;
    if (detailsCountry) return detailsCountry;

    const persistedCountry =
        tournamentData?.country_name ||
        tournamentData?.country?.name ||
        tournamentData?.country;
    if (persistedCountry) return persistedCountry;

    const tournamentCountryId = tournamentData?.countryId || tournamentData?.country_id || null;
    if (typeof tournamentCountryId === 'string' && tournamentCountryId.trim()) {
        const normalizedId = tournamentCountryId.trim().toLowerCase();
        const mappedCountry = getCountryById(normalizedId);
        if (mappedCountry?.nameEs) return mappedCountry.nameEs;
        if (mappedCountry?.name) return mappedCountry.name;
        return tournamentCountryId;
    }

    return 'Internacional';
}

// ── Pre-process DB initial data (runs synchronously for SSR + hydration) ────

function processDbData(dbData: TournamentInitialData, id: string) {
    return buildDbTournamentSnapshot(dbData, id);
}

// ── Main Component ──────────────────────────────────────────────────────────

interface TournamentDetailPageProps {
    id: string;
    initialData?: TournamentInitialData | null;
    renderTodayKey: string;
    renderYear: number;
}

export default function TournamentDetailPage({
    id,
    initialData,
    renderTodayKey,
    renderYear,
}: TournamentDetailPageProps) {
    const router = useRouter();
    const { isLeagueFavorite, toggleLeagueFavorite } = useFavorites();
    const { user } = useAuth();

    // Pre-process initialData once (synchronously) so SSR renders full content
    const [preloaded] = useState<ReturnType<typeof processDbData> | null>(() =>
        initialData?.ok ? processDbData(initialData, id) : null
    );

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(!preloaded);
    const [error, setError] = useState<string | null>(null);

    const [tournamentData, setTournamentData] = useState<any>(preloaded?.tournamentMeta ?? null);
    const [standings, setStandings] = useState<any[]>(preloaded?.standings ?? []);
    const [standingsForm, setStandingsForm] = useState<any[]>([]);
    const [standingsHtFt, setStandingsHtFt] = useState<any[]>([]);
    const [standingsOverUnder, setStandingsOverUnder] = useState<any[]>([]);
    const [archives, setArchives] = useState<any[]>([]);
    const [results, setResults] = useState<any[]>(preloaded?.results ?? []);
    const [fixtures, setFixtures] = useState<any[]>(preloaded?.fixtures ?? []);
    const [details, setDetails] = useState<any>(null);
    const [topScorers, setTopScorers] = useState<any[]>([]);
    const [draw, setDraw] = useState<any[]>([]);
    const [standingsView, setStandingsView] = useState<'overall' | 'form' | 'htft' | 'overunder'>('overall');
    const [dbParticipants, setDbParticipants] = useState<any[]>(preloaded?.dbParticipants ?? []);
    const [dbTeamLabels, setDbTeamLabels] = useState<any[]>(preloaded?.dbTeamLabels ?? []);
    const [circuitStandingsViews, setCircuitStandingsViews] = useState<CircuitStandingsView[]>(preloaded?.circuitStandingsViews ?? []);
    const [activeStandingsScope, setActiveStandingsScope] = useState<string>(preloaded?.defaultStandingsScope ?? CIRCUIT_GLOBAL_SCOPE);

    // ── Data fetch ────────────────────────────────────────────────────────

    useEffect(() => {
        const controller = new AbortController();
        const shouldRetryDbSnapshot =
            !!initialData?.queryErrors?.tournament ||
            !!initialData?.queryErrors?.participants ||
            !!initialData?.queryErrors?.matches ||
            !!initialData?.queryErrors?.standings ||
            !!initialData?.queryErrors?.phases ||
            !!initialData?.queryErrors?.groups ||
            !!initialData?.queryErrors?.teamLabels;
        const shouldPreferDbSource = !!initialData?.ok;
        const shouldKeepDbCircuitStandings = Boolean(
            preloaded?.isCircuitCompetition ||
            isCircuitTournamentRuleset(preloaded?.tournamentMeta?.ruleset) ||
            isCircuitTournamentRuleset((initialData?.tournament as any)?.ruleset),
        );

        async function fetchData() {
            // Skip refetch when SSR already has a real name; still run when logo is missing so `/api/db/tournaments/[id]` can fill `banner_url`.
            if (preloaded && !shouldRetryDbSnapshot) {
                const meta = preloaded.tournamentMeta;
                const hasName = Boolean(meta?.name) && meta?.name !== 'Cargando...';
                const hasLogo = Boolean(String(meta?.logoUrl || '').trim());
                if (hasName && hasLogo) {
                    setLoading(false);
                    return;
                }
            }
            setLoading(!preloaded);
            let localTournament: any = null;
            try {
                const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
                const overrideSport = sp.get('sport') || undefined;
                const overrideTournamentId = sp.get('tournament_id') || sp.get('tournamentId');
                const overrideStageId = sp.get('tournament_stage_id') || sp.get('tournamentStageId') || sp.get('stageId');
                const urlParam = sp.get('url');

                localTournament = getTournamentById(id);

                if (shouldPreferDbSource) {
                    const dbStoredUrl = (initialData?.tournament as any)?.url || '';
                    localTournament = {
                        ...(localTournament ?? {}),
                        ...(preloaded?.tournamentMeta ?? {}),
                        id: preloaded?.tournamentMeta?.id || id,
                        sportId: preloaded?.tournamentMeta?.sportId || localTournament?.sportId || (overrideSport || 'rugby'),
                        countryId: preloaded?.tournamentMeta?.countryId || localTournament?.countryId || 'international',
                        name: preloaded?.tournamentMeta?.name || localTournament?.name || 'Cargando...',
                        url: dbStoredUrl,
                        type: preloaded?.tournamentMeta?.type || localTournament?.type || 'league',
                        categories: localTournament?.categories || [],
                        priority: localTournament?.priority || 0,
                        // A DB tournament with a stored FlashScore URL can also fetch live data
                        __isDbOnly: !dbStoredUrl,
                    } as any;
                }

                if (!localTournament) {
                    if (id.toLowerCase().startsWith('fs-')) {
                        localTournament = {
                            id,
                            name: 'Cargando...',
                            url: '',
                            type: 'cup' as any,
                            sportId: (overrideSport || 'rugby') as any,
                            countryId: 'international',
                            categories: [],
                            priority: 0,
                        } as any;
                    } else {
                        // UUID → DB-only tournament. Skip metadata round-trip;
                        // metadata will be included in the /data response below.
                        const dbStoredUrl = (initialData?.tournament as any)?.url || '';
                        localTournament = {
                            id,
                            name: 'Cargando...',
                            url: dbStoredUrl,
                            type: 'league' as any,
                            sportId: (overrideSport || 'rugby') as any,
                            countryId: 'international',
                            categories: [],
                            priority: 0,
                            __isDbOnly: !dbStoredUrl,
                            __dbLookupCandidate: !UUID_RE.test(id),
                        } as any;
                    }
                }

                if (!controller.signal.aborted) {
                    setTournamentData((prev: any) => prev ?? localTournament);
                }

                // ── DB-only path (manually created tournaments) ───────────
                if ((localTournament as any)?.__isDbOnly) {
                    let dbData: any;
                    if (initialData && !shouldRetryDbSnapshot) {
                        // Server passed initial data — skip the HTTP round-trip
                        dbData = initialData;
                    } else {
                        const dbDataRes = await fetch(`/api/db/tournaments/${id}/data`, {
                            cache: 'no-store',
                            signal: controller.signal,
                        });
                        dbData = await dbDataRes.json();
                        if (!dbDataRes.ok || !dbData?.ok) {
                            console.error('[FRONTEND] Error fetching dbData:', dbDataRes.status, dbData);
                            if (!controller.signal.aborted && !preloaded) {
                                setError(dbData?.error || 'No se pudieron cargar los datos del torneo.');
                            }
                            return;
                        }
                    }

                    console.log('[FRONTEND] payload recibido desde API (DB-only):', dbData);
                    if (dbData.debug?.queryErrors && Object.values(dbData.debug.queryErrors).some(Boolean)) {
                        console.warn('[FRONTEND] DB-only query errors:', dbData.debug.queryErrors);
                    }

                    if (dbData.ok) {
                        const snapshot = buildDbTournamentSnapshot(dbData, id);
                        let tournamentMeta = snapshot.tournamentMeta;

                        // Fallback: join-heavy prefetch can miss the row; this route matches the admin list API.
                        const needsHeaderFix =
                            !tournamentMeta ||
                            tournamentMeta.name === 'Cargando...' ||
                            !String(tournamentMeta.logoUrl || '').trim();
                        if (needsHeaderFix && !controller.signal.aborted) {
                            try {
                                const metaRes = await fetch(`/api/db/tournaments/${encodeURIComponent(id)}`, {
                                    cache: 'no-store',
                                    signal: controller.signal,
                                });
                                if (metaRes.ok) {
                                    const metaJson = await metaRes.json();
                                    const t = metaJson?.tournament;
                                    if (t) {
                                        const dbStoredUrl = (t as any).url || (dbData.tournament as any)?.url || '';
                                        const resolvedName = (t as any).display_name || (t as any).name || tournamentMeta?.name || 'Torneo';
                                        const resolvedLogo =
                                            (t as any).logo_url || (t as any).banner_url || tournamentMeta?.logoUrl || '';
                                        tournamentMeta = {
                                            id: t.id || id,
                                            name: resolvedName,
                                            sportId: (t as any).sport_id || tournamentMeta?.sportId || 'rugby',
                                            countryId: (t as any).country_id || tournamentMeta?.countryId || 'international',
                                            logoUrl: resolvedLogo,
                                            ruleset: (t as any).ruleset ?? tournamentMeta?.ruleset ?? null,
                                            url: dbStoredUrl,
                                            type: isCircuitTournamentRuleset((t as any).ruleset ?? tournamentMeta?.ruleset ?? null)
                                                ? 'circuit'
                                                : (tournamentMeta?.type || 'league'),
                                            categories: [],
                                            priority: 0,
                                            __isDbOnly: !dbStoredUrl,
                                        };
                                        if (resolvedLogo) setCachedLogo(String(t.id || id), resolvedLogo);
                                    }
                                }
                            } catch {
                                /* ignore */
                            }
                        }

                        if (!controller.signal.aborted) {
                            setTournamentData(tournamentMeta ?? localTournament);
                            setDbParticipants(snapshot.dbParticipants);
                            setDbTeamLabels(snapshot.dbTeamLabels);
                            setCircuitStandingsViews(snapshot.circuitStandingsViews ?? []);
                            setActiveStandingsScope(snapshot.defaultStandingsScope ?? CIRCUIT_GLOBAL_SCOPE);
                            setResults(sortMatchesByDate(snapshot.results || [], 'desc'));
                            setFixtures(sortMatchesByDate(snapshot.fixtures || [], 'asc'));
                            setStandings(snapshot.standings);
                        }

                            // Map DB matches → frontend match format

                            // Map DB standings → frontend standings format

                    }
                    return; // Skip FlashScore for DB-only tournaments
                }

                // Local DB metadata for UUID/slug routes that also use a FlashScore URL (fixture from API, nombre/logo desde Supabase).
                if (!id.toLowerCase().startsWith('fs-')) {
                    try {
                        const metaRes = await fetch(`/api/db/tournaments/${encodeURIComponent(id)}`, {
                            cache: 'no-store',
                            signal: controller.signal,
                        });
                        if (metaRes.ok) {
                            const metaJson = await metaRes.json();
                            const t = metaJson?.tournament;
                            if (t) {
                                const nextName = (t as any).display_name || (t as any).name;
                                const nextLogo = (t as any).logo_url || (t as any).banner_url || '';
                                if (nextLogo) setCachedLogo(String((t as any).id || id), nextLogo);
                                setTournamentData((prev: any) => ({
                                    ...(prev || {}),
                                    id: (t as any).id || id,
                                    name: nextName || prev?.name,
                                    logoUrl: nextLogo || prev?.logoUrl || '',
                                    sportId: (t as any).sport_id || prev?.sportId || 'rugby',
                                    countryId: (t as any).country_id || prev?.countryId || 'international',
                                }));
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                }

                const finalUrl = localTournament?.url || urlParam;
                const query = new URLSearchParams();
                query.set('id', id);
                if (finalUrl) query.set('url', finalUrl);
                if (localTournament?.sportId) query.set('sport', localTournament.sportId);
                if (overrideTournamentId) query.set('tournament_id', overrideTournamentId);
                if (overrideStageId) query.set('tournament_stage_id', overrideStageId);

                const res = await fetch(`/api/tournaments?${query.toString()}`, {
                    cache: 'no-store',
                    signal: controller.signal,
                });

                if (!res.ok) throw new Error(res.statusText);

                const payload = await res.json();
                console.log('TOURNAMENT API PAYLOAD:', payload);
                if (controller.signal.aborted) return;

                if (!res.ok || !payload?.ok) {
                    if ((localTournament as any).__isDbOnly) {
                        // DB-only tournament has no FlashScore data — render with empty sections
                    } else {
                        if (!preloaded) {
                            setError(payload?.error || 'No se pudo conectar con la fuente de datos externa.');
                        }
                        return;
                    }
                }

                if (payload.details) {
                    setDetails(payload.details);
                    const discoveredLogo =
                        payload.details.image_path ||
                        payload.details.logo ||
                        payload.details.logo_path ||
                        payload.details.tournament_logo ||
                        payload.details.tournament_image_path;
                    if (discoveredLogo) setCachedLogo(id, discoveredLogo);

                    const detailsName =
                        payload.details?.name ||
                        payload.details?.tournament?.name ||
                        payload.details?.tournament_name ||
                        payload.details?.league_name ||
                        payload.details?.competition?.name;
                    if (detailsName) {
                        setTournamentData((prev: any) => prev ? { ...prev, name: detailsName } : prev);
                    }
                }

                setResults(sortMatchesByDate(payload.results || [], 'desc'));
                setFixtures(sortMatchesByDate(payload.fixtures || [], 'asc'));
                if (!shouldKeepDbCircuitStandings) {
                    setStandings(payload.standings || []);
                    setStandingsForm(payload.standingsForm || []);
                    setStandingsHtFt(payload.standingsHtFt || []);
                    setStandingsOverUnder(payload.standingsOverUnder || []);
                }
                setTopScorers(payload.topScorers || []);
                setDraw(payload.draw || []);
                setArchives(payload.archives || []);
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                console.error('Error fetching tournament data:', err);
                // For DB-only tournaments the external API may not have data — don't replace the tournament with an error
                if (!controller.signal.aborted && !(localTournament as any)?.__isDbOnly && !preloaded) {
                    setError('Error al cargar datos del torneo.');
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        fetchData();
        return () => controller.abort();
    }, [id, initialData, preloaded]);

    // ── Loading / Error ────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Cargando torneo...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p>{error}</p>
                <div className={styles.backButton} onClick={() => router.push('/')}>
                    <ArrowLeft size={16} /> Volver al Inicio
                </div>
            </div>
        );
    }

    // ── Derived data ──────────────────────────────────────────────────────

    const isCircuitTournament = Boolean(
        circuitStandingsViews.length > 0 ||
        tournamentData?.type === 'circuit' ||
        isCircuitTournamentRuleset(tournamentData?.ruleset),
    );
    const selectedCircuitStandingsView = isCircuitTournament
        ? (circuitStandingsViews.find((view) => view.id === activeStandingsScope) || circuitStandingsViews[0] || null)
        : null;
    const isCircuitGlobalTable = selectedCircuitStandingsView?.kind === 'global';
    const baseStandingsSource = selectedCircuitStandingsView?.standings ?? standings;
    const overallRows = flattenStandingsRows(standings);
    const standingsSource = isCircuitTournament
        ? baseStandingsSource
        : standingsView === 'form'
            ? standingsForm
            : standingsView === 'htft'
                ? standingsHtFt
                : standingsView === 'overunder'
                    ? standingsOverUnder
                    : standings;
    const activeRows = normalizeStandingsRows(standingsSource);
    const activeFlatRows = flattenStandingsRows(standingsSource);
    const hasBonus = activeFlatRows.some((r: any) => (r.bonus_points ?? 0) > 0);
    const buildStandingsColumns = (mode: StandingsColumnMode, bonusEnabled: boolean) => (
        mode === 'circuit-global'
            ? [
                {
                    key: 'stages',
                    label: 'ET',
                    className: `${styles.colVal} ${styles.colValPJ}`,
                    value: (row: any) => row.circuit?.stages_played ?? 0,
                },
                {
                    key: 'titles',
                    label: '1',
                    className: styles.colVal,
                    value: (row: any) => row.circuit?.stage_titles ?? 0,
                },
                {
                    key: 'best',
                    label: 'MEJ',
                    className: styles.colVal,
                    value: (row: any) => row.circuit?.best_finish ?? '-',
                },
                {
                    key: 'podiums',
                    label: 'POD',
                    className: `${styles.colVal} ${styles.colValDG}`,
                    value: (row: any) => row.circuit?.podiums ?? 0,
                },
                {
                    key: 'points',
                    label: 'PTS',
                    className: styles.colPts,
                    value: (row: any) => row.points_total ?? row.points ?? 0,
                },
            ]
            : [
                {
                    key: 'played',
                    label: 'J',
                    className: `${styles.colVal} ${styles.colValPJ}`,
                    value: (row: any) => row.matches_total || row.matches_played || 0,
                },
                {
                    key: 'wins',
                    label: 'G',
                    className: styles.colVal,
                    value: (row: any) => row.wins_total || row.wins || 0,
                },
                {
                    key: 'draws',
                    label: 'E',
                    className: styles.colVal,
                    value: (row: any) => row.draws_total || row.draws || 0,
                },
                {
                    key: 'losses',
                    label: 'P',
                    className: styles.colVal,
                    value: (row: any) => row.losses_total || row.losses || 0,
                },
                {
                    key: 'diff',
                    label: 'DG',
                    className: `${styles.colVal} ${styles.colValDG}`,
                    value: (row: any) =>
                        typeof row.goal_difference === 'number'
                            ? row.goal_difference
                            : (typeof row.goals_for === 'number' && typeof row.goals_against === 'number')
                                ? row.goals_for - row.goals_against
                                : 0,
                },
                ...(bonusEnabled ? [{
                    key: 'bonus',
                    label: 'B',
                    className: styles.colVal,
                    value: (row: any) => row.bonus_points ?? 0,
                }] : []),
                {
                    key: 'points',
                    label: 'PTS',
                    className: styles.colPts,
                    value: (row: any) => row.points_total ?? row.points ?? 0,
                },
            ]
    );
    const standingsColumnMode: StandingsColumnMode = isCircuitGlobalTable ? 'circuit-global' : 'standard';
    const standingsColumns = buildStandingsColumns(standingsColumnMode, hasBonus);
    const previewStandingsColumns = buildStandingsColumns(
        isCircuitTournament ? 'circuit-global' : 'standard',
        overallRows.some((row: any) => (row.bonus_points ?? 0) > 0),
    );
    const teamMap = new Map<string, { id: string | null; name: string; logo: string; href: string | null }>();
    const registerTeam = (team: { id?: string | number | null; name?: string | null; logo?: string | null; teamUrl?: string | null }) => {
        const name = String(team.name ?? '').trim();
        if (!name) return;

        const normalizedId = team.id != null ? String(team.id) : null;
        const key = normalizedId ? `id:${normalizedId}` : `name:${name.toLowerCase()}`;
        const href = buildClubHref({ id: normalizedId, name, teamUrl: team.teamUrl }, tournamentData?.sportId);
        const previous = teamMap.get(key);

        teamMap.set(key, {
            id: previous?.id ?? normalizedId,
            name: previous?.name ?? name,
            logo: previous?.logo || team.logo || '',
            href: previous?.href ?? href,
        });
    };
    const addFromMatches = (list: any[]) => {
        list.forEach((match) => {
            registerTeam({
                id: match.home_team?.id || match.home_team?.team_id || match.home_club_id || null,
                name: match.home_team?.name || match.event_home_team || match.home_team_name,
                logo: getTeamLogo(match.home_team) || match.home_team_logo || '',
                teamUrl: match.home_team?.team_url || null,
            });
            registerTeam({
                id: match.away_team?.id || match.away_team?.team_id || match.away_club_id || null,
                name: match.away_team?.name || match.event_away_team || match.away_team_name,
                logo: getTeamLogo(match.away_team) || match.away_team_logo || '',
                teamUrl: match.away_team?.team_url || null,
            });
        });
    };
    overallRows.forEach((row: any) => {
        registerTeam({
            id: getStandingsTeamId(row),
            name: getStandingsTeamName(row),
            logo: getStandingsTeamLogo(row),
            teamUrl: getStandingsTeamUrl(row),
        });
    });
    if (results.length > 0) addFromMatches(results);
    if (fixtures.length > 0) addFromMatches(fixtures);
    const teamsList = Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const resolveTeamFallback = (row: any) => {
        const teamId = getStandingsTeamId(row);
        if (teamId) {
            const byId = teamMap.get(`id:${String(teamId)}`);
            if (byId) return byId;
        }

        const teamName = getStandingsTeamName(row);
        if (teamName) {
            return teamMap.get(`name:${teamName.toLowerCase()}`) || null;
        }

        return null;
    };

    const yearDisplay = details?.is_current
        ? (details?.season || 'Temporada Actual')
        : (details?.start_year && details?.end_year)
            ? `${details.start_year}/${details.end_year}`
            : (details?.season || renderYear);

    const countryName = resolveCountryName(details, tournamentData);
    const tournamentLogo = getTournamentLogo(details, tournamentData);
    const tournamentName = details?.name || details?.tournament?.name || tournamentData?.name || 'Torneo';
    const sportLabel = tournamentData?.sportId ? tournamentData.sportId.charAt(0).toUpperCase() + tournamentData.sportId.slice(1) : '';
    const isSuperAdminUser = user?.role === 'super_admin' || user?.role === 'admin_general';
    const adminTournamentId = (() => {
        const candidate = String((initialData?.tournament as any)?.id || tournamentData?.id || '').trim();
        return UUID_RE.test(candidate) ? candidate : null;
    })();

    // Quick stats
    const stats = getQuickStats(results, fixtures, overallRows, teamsList.length);

    // Status
    const tournamentStatus = getTournamentStatus(details);

    // Featured match
    const featured = getFeaturedMatch(results, fixtures);

    // Standings preview (top 8 flat rows only)
    const standingsPreviewRows: any[] = overallRows.slice(0, 8);
    const standingsLegendItems = collectStandingsLegendItems(activeFlatRows, dbTeamLabels);
    const standingsPreviewLegendItems = collectStandingsLegendItems(standingsPreviewRows, dbTeamLabels);
    const standingsExportColumnLabels = standingsColumnMode === 'circuit-global'
        ? {
            played: 'ET',
            won: '1',
            lost: 'MEJ',
            diff: 'POD',
            points: 'PTS',
        }
        : undefined;
    const mapStandingsRowForExport = (row: any, idx: number) => {
        const fallbackTeam = resolveTeamFallback(row);
        const rowLabel = resolveStandingsRowLabel(row, dbTeamLabels);
        const goalDifference =
            typeof row.goal_difference === 'number'
                ? row.goal_difference
                : (typeof row.goals_for === 'number' && typeof row.goals_against === 'number')
                    ? row.goals_for - row.goals_against
                    : 0;

        if (standingsColumnMode === 'circuit-global') {
            return {
                pos: row.position || (idx + 1),
                team: row.team?.short_name || getStandingsTeamName(row) || 'Equipo',
                teamLogo: getStandingsTeamLogo(row) || fallbackTeam?.logo || '',
                labelName: rowLabel?.name ?? undefined,
                zoneColor: rowLabel?.color ?? undefined,
                played: row.circuit?.stages_played ?? 0,
                won: row.circuit?.stage_titles ?? 0,
                lost: row.circuit?.best_finish ?? '-',
                diff: String(row.circuit?.podiums ?? 0),
                points: row.points_total ?? row.points ?? 0,
            };
        }

        return {
            pos: row.position || (idx + 1),
            team: row.team?.short_name || getStandingsTeamName(row) || 'Equipo',
            teamLogo: getStandingsTeamLogo(row) || fallbackTeam?.logo || '',
            labelName: rowLabel?.name ?? undefined,
            zoneColor: rowLabel?.color ?? undefined,
            played: row.matches_total || row.matches_played || 0,
            won: row.wins_total || row.wins || 0,
            lost: row.losses_total || row.losses || 0,
            diff: String(goalDifference),
            points: row.points_total || row.points || 0,
        };
    };
    const standingsExportRows = activeFlatRows.map((row: any, idx: number) => mapStandingsRowForExport(row, idx));
    const standingsExportGroups = standingsColumnMode !== 'circuit-global' && Array.isArray(activeRows[0]?.rows)
        ? activeRows
            .map((group: any, groupIndex: number) => ({
                name: String(group?.group_name || `Grupo ${groupIndex + 1}`),
                rows: Array.isArray(group?.rows)
                    ? group.rows.map((row: any, idx: number) => mapStandingsRowForExport(row, idx))
                    : [],
            }))
            .filter((group: any) => group.rows.length > 0)
        : undefined;

    // ── Render helpers ────────────────────────────────────────────────────

    const renderMatchItem = (match: any, isResult: boolean, index: number) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const timeStr = date ? formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const dateStr = date ? formatArgentinaDate(date, { day: '2-digit', month: '2-digit' }) : '';

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;
        const hasScore = scoreHome !== undefined && scoreHome !== null;

        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Local';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante';
        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';

        const homeWon = hasScore && typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreHome > scoreAway;
        const awayWon = hasScore && typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreAway > scoreHome;
        const isLive = match.status === 'live' || match.status === 'in_play';
        const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;

        return (
            <Link
                href={`/matches/${match.event_key || match.match_id || 'unknown'}`}
                key={getMatchRenderKey(match, index)}
                className={styles.matchRow}
            >
                {/* Date / Time / Live */}
                <div className={styles.matchDate}>
                    {isLive ? (
                        <span className={styles.matchLive}>
                            <span className={styles.matchLiveDot} />
                            {match.minute || 'Live'}
                        </span>
                    ) : (
                        <>
                            <span className={styles.matchDateDay}>{dateStr}</span>
                            <span className={styles.matchDateTime}>{isFinished ? 'FT' : timeStr}</span>
                        </>
                    )}
                </div>

                {/* Home Team (right-aligned) */}
                <div className={`${styles.matchSideTeam} ${styles.matchHomeTeam} ${homeWon ? styles.matchWinner : ''}`}>
                    <span className={styles.matchTeamName}>{homeName}</span>
                    {homeLogo
                        ? <>
                            <img src={homeLogo} alt={homeName} className={styles.matchTeamLogo}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                }} />
                            <div className={styles.matchTeamLogoEmpty} style={{ display: 'none' }} />
                          </>
                        : <div className={styles.matchTeamLogoEmpty} />
                    }
                </div>

                {/* Score / VS box */}
                <div className={styles.matchScoreBox}>
                    {hasScore
                        ? <span className={styles.matchScore}>{scoreHome} - {scoreAway}</span>
                        : <>
                            <span className={styles.matchVS}>VS</span>
                            {!isLive && (
                                <span className={styles.matchScheduled}>
                                    {formatMatchSchedule(date, renderTodayKey)}
                                </span>
                            )}
                          </>
                    }
                </div>

                {/* Away Team (left-aligned) */}
                <div className={`${styles.matchSideTeam} ${styles.matchAwayTeam} ${awayWon ? styles.matchWinner : ''}`}>
                    {awayLogo
                        ? <>
                            <img src={awayLogo} alt={awayName} className={styles.matchTeamLogo}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                }} />
                            <div className={styles.matchTeamLogoEmpty} style={{ display: 'none' }} />
                          </>
                        : <div className={styles.matchTeamLogoEmpty} />
                    }
                    <span className={styles.matchTeamName}>{awayName}</span>
                </div>

                {/* Status badge */}
                <div className={styles.matchStatus}>
                    {isFinished && !isLive && <span className={styles.ftBadge}>FT</span>}
                </div>
            </Link>
        );
    };

    const renderStandingsHeader = (columns = standingsColumns) => (
        <div className={styles.tableHeader}>
            <div className={styles.colPos}>#</div>
            <div className={styles.colTeam}>Equipo</div>
            {columns.map((column) => (
                <div key={column.key} className={column.className}>{column.label}</div>
            ))}
        </div>
    );

    const renderStandingsRow = (row: any, idx: number, columns = standingsColumns) => {
        const pos = row.position || (idx + 1);
        const fallbackTeam = resolveTeamFallback(row);
        const logo = getStandingsTeamLogo(row) || fallbackTeam?.logo || '';
        const teamName = getStandingsTeamName(row);
        const teamId = getStandingsTeamId(row);
        const teamHref = fallbackTeam?.href || buildClubHref({
            id: teamId,
            name: teamName,
            teamUrl: getStandingsTeamUrl(row),
        }, tournamentData?.sportId);
        const rowLabel = resolveStandingsRowLabel(row, dbTeamLabels);
        const accentColor = rowLabel?.color ?? null;
        const rowAccentStyle = buildRowAccentStyle(accentColor);
        const goalDifference =
            typeof row.goal_difference === 'number'
                ? row.goal_difference
                : (typeof row.goals_for === 'number' && typeof row.goals_against === 'number')
                    ? row.goals_for - row.goals_against
                    : 0;

        return (
            <div
                key={idx}
                className={`${styles.tableRow} ${rowAccentStyle ? styles.tableRowTinted : ''}`}
                style={rowAccentStyle}
            >
                <div className={styles.colPos}>{pos}</div>
                <div className={styles.colTeam}>
                    {logo
                        ? <img src={logo} alt={teamName} className={styles.teamLogo} />
                        : <div className={styles.teamLogoPlaceholder} />}
                    <div className={styles.colTeamMeta}>
                        {teamHref
                            ? <Link href={teamHref} className={styles.colTeamName}>{teamName}</Link>
                            : <span className={styles.colTeamName}>{teamName}</span>}
                    </div>
                </div>
                {columns.map((column) => {
                    const value = column.key === 'diff'
                        ? goalDifference
                        : column.value(row);

                    return (
                        <div key={`${column.key}-${idx}`} className={column.className}>
                            {value}
                        </div>
                    );
                })}
            </div>
        );
    };

    // ── Featured match renderer ───────────────────────────────────────────

    const renderStandingsLegend = (items: StandingsLegendItem[]) => {
        if (items.length === 0) return null;

        return (
            <div className={styles.standingsLegend} aria-label="Leyenda de posiciones">
                <span className={styles.standingsLegendTitle}>Leyenda</span>
                <div className={styles.standingsLegendItems}>
                    {items.map((item) => (
                        <div key={item.key} className={styles.standingsLegendItem}>
                            <span
                                className={styles.standingsLegendSwatch}
                                style={buildLegendSwatchStyle(item.color)}
                                aria-hidden="true"
                            />
                            <span className={styles.standingsLegendText}>{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderFeaturedMatch = () => {
        if (!featured) return null;
        const { match, isResult } = featured;

        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const timeStr = date ? formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const dateStr = date ? formatArgentinaDate(date, { weekday: 'long', day: '2-digit', month: 'long' }) : '';

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;
        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Local';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante';
        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
        const isLive = match.status === 'live' || match.status === 'in_play';
        const hasScore = scoreHome !== undefined && scoreHome !== null && scoreHome !== '-';

        const badgeLabel = isLive ? '🔴 En vivo' : isResult ? 'Último resultado' : 'Próximo partido';

        return (
            <div className={styles.featuredMatchCard}>
                <div className={styles.featuredBadge}>{badgeLabel}</div>
                <div className={styles.featuredTeams}>
                    {/* Home */}
                    <div className={styles.featuredTeam}>
                        {homeLogo
                            ? <img src={homeLogo} alt={homeName} className={styles.featuredTeamLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            : <div className={styles.featuredTeamLogoPlaceholder}>{homeName[0]}</div>}
                        <span className={styles.featuredTeamName}>{homeName}</span>
                    </div>

                    {/* Score / Time */}
                    <div className={styles.featuredCenter}>
                        {isLive && (
                            <div className={styles.featuredLiveIndicator}>
                                <span className={styles.liveDot} />
                                {match.minute || 'LIVE'}
                            </div>
                        )}
                        <div className={styles.featuredScoreBox}>
                            {hasScore ? (
                                <>
                                    <span className={styles.featuredScoreNum}>{scoreHome}</span>
                                    <span className={styles.featuredScoreSep}>-</span>
                                    <span className={styles.featuredScoreNum}>{scoreAway}</span>
                                </>
                            ) : (
                                <>
                                    <span className={styles.featuredVS}>VS</span>
                                </>
                            )}
                        </div>
                        {!hasScore && !isLive && dateStr && (
                            <span className={styles.featuredMobileDate}>{dateStr}</span>
                        )}
                        {!isLive && (
                            <span className={styles.featuredScoreTime}>
                                {isResult ? 'FT' : timeStr}
                            </span>
                        )}
                    </div>

                    {/* Away */}
                    <div className={styles.featuredTeam}>
                        {awayLogo
                            ? <img src={awayLogo} alt={awayName} className={styles.featuredTeamLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            : <div className={styles.featuredTeamLogoPlaceholder}>{awayName[0]}</div>}
                        <span className={styles.featuredTeamName}>{awayName}</span>
                    </div>
                </div>

                {dateStr && (
                    <div className={styles.featuredMatchMeta}>
                        <span style={{ textTransform: 'capitalize' }}>{dateStr}</span>
                        {!isResult && timeStr && <span>· {timeStr} hs</span>}
                        {match.venue && <span>· {match.venue}</span>}
                    </div>
                )}
            </div>
        );
    };

    // ── Main render ───────────────────────────────────────────────────────

    return (
        <div className={styles.page}>

            {/* ── Hero Section ───────────────────────────────────────── */}
            <div className={styles.heroSection}>
                <div className="g22-container">
                    {/* Breadcrumb */}
                    <nav className={styles.breadcrumb}>
                        <Link href="/">Partidos</Link>
                        <span className={styles.separator}>/</span>
                        <Link href="/tournaments">Torneos</Link>
                        <span className={styles.separator}>/</span>
                        <span>{tournamentName}</span>
                    </nav>

                    {/* Hero Card */}
                    <div className={styles.heroCard}>
                        <div className={styles.heroLeft}>
                            {/* Logo */}
                            <div className={styles.heroLogoWrap}>
                                {tournamentLogo
                                    ? <img src={tournamentLogo} alt={tournamentName} className={styles.heroLogoImg} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    : <span className={styles.heroLogoPlaceholder}>{tournamentName[0]}</span>}
                            </div>

                            {/* Info */}
                            <div className={styles.heroInfo}>
                                <h1 className={styles.heroTitle}>{tournamentName}</h1>
                                <div className={styles.heroMeta}>
                                    {sportLabel && <span className={styles.heroMetaItem}>{sportLabel}</span>}
                                    {sportLabel && countryName && <span className={styles.heroMetaDot} />}
                                    {countryName && <span className={styles.heroMetaItem}>{countryName}</span>}
                                    {yearDisplay && (
                                        <>
                                            <span className={styles.heroMetaDot} />
                                            <span className={styles.heroMetaItem}>{yearDisplay}</span>
                                        </>
                                    )}
                                    {details?.current_stage_has_cup_trees && (
                                        <>
                                            <span className={styles.heroMetaDot} />
                                            <span className={styles.heroMetaItem}>Fase Eliminatoria</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: status + CTAs */}
                        <div className={styles.heroRight}>
                            <span className={`${styles.statusBadge} ${tournamentStatus === 'active' ? styles.statusActive : tournamentStatus === 'upcoming' ? styles.statusUpcoming : styles.statusFinished}`}>
                                {tournamentStatus === 'active' ? 'En Curso' : tournamentStatus === 'upcoming' ? 'Próximamente' : 'Finalizado'}
                            </span>
                            <div className={styles.heroCTAs}>
                                <button
                                    className={styles.ctaBtnSecondary}
                                    onClick={() => setActiveTab('fixtures')}
                                    type="button"
                                >
                                    Ver Fixture
                                </button>
                                <button
                                    className={styles.ctaBtnSecondary}
                                    onClick={() => setActiveTab('standings')}
                                    type="button"
                                >
                                    Ver Tabla
                                </button>
                                {isSuperAdminUser && adminTournamentId && (
                                    <Link href={`/admin/super/torneos/${adminTournamentId}`} className={styles.ctaBtnSecondary}>
                                        Editar torneo
                                    </Link>
                                )}
                                <button
                                    className={`${styles.followBtn} ${isLeagueFavorite(id) ? styles.followBtnActive : ''}`}
                                    onClick={() => toggleLeagueFavorite(id, {
                                        name: tournamentName,
                                        followerTournamentId: adminTournamentId,
                                    })}
                                    type="button"
                                >
                                    {isLeagueFavorite(id) ? '★ Siguiendo' : '☆ Seguir'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Quick Stats Row ─────────────────────────────── */}
                    <div className={styles.quickStatsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.teams || '—'}</span>
                            <span className={styles.statCardLabel}>Equipos</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.played}</span>
                            <span className={styles.statCardLabel}>Jugados</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.upcoming}</span>
                            <span className={styles.statCardLabel}>Restantes</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValueSm}>{stats.leaderName}</span>
                            <span className={styles.statCardLabel}>Líder</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.nextDate}</span>
                            <span className={styles.statCardLabel}>Próxima Fecha</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Sticky Tabs ─────────────────────────────────────────── */}
            <div className={styles.tabsBar}>
                <div className="g22-container">
                    <nav className={styles.navTabs}>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {/* ── Main Content ─────────────────────────────────────────── */}
            <main className="g22-container" style={{ paddingBottom: '24px' }}>

                {/* ── SUMMARY TAB ──────────────────────────────────────── */}
                {activeTab === 'summary' && (
                    <div className={styles.contentGrid}>

                        {/* Left: Content Area */}
                        <div className={styles.contentArea}>

                            {/* Featured Match */}
                            {featured && renderFeaturedMatch()}

                            {/* Latest Results */}
                            {results.length > 0 && (
                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Últimos Resultados</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('results')}>Ver todos</button>
                                    </div>
                                    <div className={styles.matchList}>
                                        {results.slice(0, 5).map((m, idx) => renderMatchItem(m, true, idx))}
                                    </div>
                                </div>
                            )}

                            {/* Upcoming Matches */}
                            {fixtures.length > 0 && (
                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Próximos Partidos</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('fixtures')}>Ver todos</button>
                                    </div>
                                    <div className={styles.matchList}>
                                        {fixtures.slice(0, 5).map((m, idx) => renderMatchItem(m, false, idx))}
                                    </div>
                                </div>
                            )}

                            {/* Empty state */}
                            {!featured && results.length === 0 && fixtures.length === 0 && (
                                <div className={styles.sectionCard}>
                                    <p className={styles.emptyState}>No hay partidos cargados aún.</p>
                                </div>
                            )}
                        </div>

                        {/* Right: Sidebar */}
                        <aside className={styles.sidebar}>

                            {/* Standings Preview */}
                            {standingsPreviewRows.length > 0 && (
                                <div className={styles.standingsPreviewCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Posiciones</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('standings')}>Ver tabla</button>
                                    </div>
                                    <div className={styles.tableCard}>
                                        {renderStandingsHeader(previewStandingsColumns)}
                                        {standingsPreviewRows.map((row: any, idx: number) => renderStandingsRow(row, idx, previewStandingsColumns))}
                                    </div>
                                    {renderStandingsLegend(standingsPreviewLegendItems)}
                                </div>
                            )}

                            {/* Tournament Info Card */}
                            <div className={styles.infoCard}>
                                <div className={styles.infoCardHeader}>
                                    <h3 className={styles.infoCardTitle}>Información</h3>
                                </div>
                                <div className={styles.infoCardBody}>
                                    {sportLabel && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Deporte</span>
                                            <span className={styles.infoValue}>{sportLabel}</span>
                                        </div>
                                    )}
                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>País / Región</span>
                                        <span className={styles.infoValue}>{countryName}</span>
                                    </div>
                                    {yearDisplay && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Temporada</span>
                                            <span className={styles.infoValue}>{yearDisplay}</span>
                                        </div>
                                    )}
                                    {stats.teams > 0 && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Equipos</span>
                                            <span className={styles.infoValue}>{stats.teams}</span>
                                        </div>
                                    )}
                                    {details?.winner && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Campeón Vigente</span>
                                            <span className={styles.infoValue}>
                                                {details.winner.image_path && <img src={details.winner.image_path} alt="" width={16} height={16} />}
                                                {details.winner.name}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </aside>
                    </div>
                )}

                {/* ── RESULTS TAB ──────────────────────────────────────── */}
                {activeTab === 'results' && (
                    <div className={styles.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 className={styles.pageTitle}>Resultados</h2>
                            <ExportImage
                                template="dailyMatches"
                                filename={`resultados-${tournamentData?.name}`}
                                data={{
                                    date: details?.season || 'Resultados',
                                    tournament: tournamentData?.name || 'Torneo',
                                    tournamentLogo,
                                    matches: results.map(m => ({
                                        homeTeam: m.home_team?.short_name || m.home_team?.name || m.event_home_team || m.home_team_name || 'Home',
                                        awayTeam: m.away_team?.short_name || m.away_team?.name || m.event_away_team || m.away_team_name || 'Away',
                                        homeLogo: getTeamLogo(m.home_team) || m.home_team_logo || '',
                                        awayLogo: getTeamLogo(m.away_team) || m.away_team_logo || '',
                                        homeScore: m.scores?.home ?? m.scores?.home_score ?? m.home_score,
                                        awayScore: m.scores?.away ?? m.scores?.away_score ?? m.away_score,
                                        time: formatArgentinaDate(new Date((m.timestamp || m.start_time || m.time) * 1000), { day: '2-digit', month: '2-digit' }),
                                        status: 'finished' as const,
                                        dateLabel: formatArgentinaDate(new Date((m.timestamp || m.start_time || m.time) * 1000), { weekday: 'short', day: '2-digit', month: '2-digit' }),
                                        kickoffAt: (m.timestamp || m.start_time || m.time)
                                            ? new Date((m.timestamp || m.start_time || m.time) * 1000).toISOString()
                                            : undefined,
                                    })),
                                }}
                            />
                        </div>
                        <div className={styles.sectionCard}>
                            <div className={styles.matchList}>
                                {results.length > 0
                                    ? results.map((m, idx) => renderMatchItem(m, true, idx))
                                    : <p className={styles.emptyState}>No hay resultados registrados.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── FIXTURES TAB ─────────────────────────────────────── */}
                {activeTab === 'fixtures' && (
                    <div className={styles.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 className={styles.pageTitle}>Fixture</h2>
                            <ExportImage
                                template="dailyMatches"
                                filename={`fixture-${tournamentData?.name}`}
                                data={{
                                    date: 'Próximos Partidos',
                                    tournament: tournamentData?.name || 'Torneo',
                                    tournamentLogo,
                                    matches: fixtures.map(m => ({
                                        homeTeam: m.home_team?.short_name || m.home_team?.name || m.event_home_team || m.home_team_name || 'Home',
                                        awayTeam: m.away_team?.short_name || m.away_team?.name || m.event_away_team || m.away_team_name || 'Away',
                                        homeLogo: getTeamLogo(m.home_team) || m.home_team_logo || '',
                                        awayLogo: getTeamLogo(m.away_team) || m.away_team_logo || '',
                                        time: formatArgentinaDate(new Date((m.timestamp || m.start_time || m.time) * 1000), { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' +
                                            formatArgentinaDate(new Date((m.timestamp || m.start_time || m.time) * 1000), { day: '2-digit', month: '2-digit' }),
                                        status: 'scheduled' as const,
                                        dateLabel: formatArgentinaDate(new Date((m.timestamp || m.start_time || m.time) * 1000), { weekday: 'short', day: '2-digit', month: '2-digit' }),
                                        kickoffAt: (m.timestamp || m.start_time || m.time)
                                            ? new Date((m.timestamp || m.start_time || m.time) * 1000).toISOString()
                                            : undefined,
                                    })),
                                }}
                            />
                        </div>
                        <div className={styles.sectionCard}>
                            <div className={styles.matchList}>
                                {fixtures.length > 0
                                    ? fixtures.map((m, idx) => renderMatchItem(m, false, idx))
                                    : <p className={styles.emptyState}>No hay partidos programados.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STANDINGS TAB ─────────────────────────────────────── */}
                {activeTab === 'standings' && (
                    <div className={styles.section}>
                        {isCircuitTournament && circuitStandingsViews.length > 0 && (
                            <div className={styles.standingsScopeBar}>
                                <span className={styles.standingsScopeLabel}>Tabla</span>
                                <div className={styles.pillsGroup}>
                                    {circuitStandingsViews.map((view) => (
                                        <button
                                            key={view.id}
                                            className={`${styles.pillBtn} ${activeStandingsScope === view.id ? styles.pillBtnActive : ''}`}
                                            onClick={() => setActiveStandingsScope(view.id)}
                                            type="button"
                                        >
                                            {view.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={styles.standingsToolbar}>
                            {!isCircuitTournament && (
                                <div className={styles.pillsGroup}>
                                    <button className={`${styles.pillBtn} ${standingsView === 'overall' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('overall')}>General</button>
                                    <button className={`${styles.pillBtn} ${standingsView === 'form' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('form')}>Forma</button>
                                    <button className={`${styles.pillBtn} ${standingsView === 'overunder' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('overunder')}>Over/Under</button>
                                    <button className={`${styles.pillBtn} ${standingsView === 'htft' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('htft')}>HT/FT</button>
                                </div>
                            )}
                            <ExportImage
                                template="standings"
                                filename={`tabla-${tournamentData?.name}`}
                                data={{
                                    title: tournamentData?.name || 'Tabla de Posiciones',
                                    subtitle: selectedCircuitStandingsView?.subtitle || details?.season || 'Clasificación',
                                    tournamentLogo,
                                    rows: standingsExportRows,
                                    groups: standingsExportGroups,
                                    columnLabels: standingsExportColumnLabels,
                                    plainDiff: standingsColumnMode === 'circuit-global',
                                }}
                            />
                        </div>

                        {activeRows.length === 0 && <p className={styles.emptyState}>Tabla no disponible.</p>}

                        {activeRows.length > 0 && (isCircuitTournament || standingsView === 'overall' || standingsView === 'form') && (
                            <div className={styles.standingsContainer}>
                                {activeRows[0]?.rows ? (
                                    <div className={styles.groupsStack}>
                                        {activeRows.map((group: any, gidx: number) => (
                                            <div key={gidx} className={styles.groupBlock}>
                                                <h3 className={styles.groupTitleLarge}>{group.group_name}</h3>
                                                <div className={styles.tableCard}>
                                                    {renderStandingsHeader()}
                                                    {(group.rows || []).map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                        <div className={styles.sectionCard}>
                                            <div className={styles.tableCard}>
                                                {renderStandingsHeader()}
                                                {activeRows.map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                            </div>
                                        </div>
                                )}
                                {renderStandingsLegend(standingsLegendItems)}
                            </div>
                        )}

                        {!isCircuitTournament && activeRows.length > 0 && standingsView === 'overunder' && (
                            <div className={styles.sectionCard}>
                                <div className={styles.tableScroll}>
                                    <div className={styles.tableCard} style={{ minWidth: 600 }}>
                                        <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 90px 90px' }}>
                                            <div className={styles.thPos}>#</div>
                                            <div className={styles.thTeam}>Equipo</div>
                                            <div className={styles.thVal}>Over</div>
                                            <div className={styles.thVal}>Under</div>
                                            <div className={styles.thVal}>Goles</div>
                                            <div className={styles.thVal}>Prom</div>
                                        </div>
                                        {activeRows.map((row: any, idx: number) => (
                                            <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 90px 90px' }}>
                                                <div className={styles.tdPos}>{idx + 1}</div>
                                                <div className={styles.tdTeam}><span>{getStandingsTeamName(row)}</span></div>
                                                <div className={styles.tdVal}>{row.over ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.under ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.goals ?? '-'}</div>
                                                <div className={styles.tdVal}>{typeof row.average_goals_per_match === 'number' ? row.average_goals_per_match.toFixed(1) : (row.average_goals_per_match ?? '-')}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isCircuitTournament && activeRows.length > 0 && standingsView === 'htft' && (
                            <div className={styles.sectionCard}>
                                <div className={styles.tableScroll}>
                                    <div className={styles.tableCard} style={{ minWidth: 980 }}>
                                        <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(9, 50px) 60px' }}>
                                            <div className={styles.thPos}>#</div>
                                            <div className={styles.thTeam}>Equipo</div>
                                            {['WW', 'WD', 'WL', 'DW', 'DD', 'DL', 'LW', 'LD', 'LL'].map(h => (
                                                <div key={h} className={styles.thVal}>{h}</div>
                                            ))}
                                            <div className={styles.thVal}>Pts</div>
                                        </div>
                                        {activeRows.map((row: any, idx: number) => (
                                            <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(9, 50px) 60px' }}>
                                                <div className={styles.tdPos}>{idx + 1}</div>
                                                <div className={styles.tdTeam}><span>{getStandingsTeamName(row)}</span></div>
                                                <div className={styles.tdVal}>{row.win_win ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.win_draw ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.win_loss ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.draw_win ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.draw_draw ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.draw_loss ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.loss_win ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.loss_draw ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.loss_loss ?? '-'}</div>
                                                <div className={`${styles.tdVal} ${styles.tdPoints}`}>{row.points ?? '-'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TEAMS TAB ─────────────────────────────────────────── */}
                {activeTab === 'teams' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Equipos</h2>
                        {(() => {
                            const isDbOnly = (tournamentData as any)?.__isDbOnly;
                            const participantTeams = dbParticipants
                                .map((participant: any) => {
                                    const club = getParticipantClub(participant);
                                    const name = club?.name ?? participant.name ?? '';
                                    return {
                                        id: participant.club_id || club?.id || null,
                                        name,
                                        logo: club?.logo_url ?? '',
                                        href: buildClubHref({ id: participant.club_id || club?.id || null, name }, tournamentData?.sportId),
                                    };
                                })
                                .filter((t: any) => t.name);
                            // For DB-only tournaments, participants are the authoritative source
                            const displayTeams = isDbOnly && participantTeams.length > 0
                                ? participantTeams
                                : teamsList.length > 0
                                    ? teamsList
                                    : participantTeams;
                            return displayTeams.length > 0 ? (
                                <div className={styles.teamsGrid}>
                                    {displayTeams.map((team: any) => {
                                        const key = team.id || team.name;
                                        const content = (
                                            <>
                                                {team.logo
                                                    ? <img src={team.logo} alt={team.name} className={styles.teamCardLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                    : <div className={styles.teamCardLogoPlaceholder}>{team.name[0]}</div>}
                                                <span className={styles.teamCardName}>{team.name}</span>
                                            </>
                                        );

                                        return team.href ? (
                                            <Link key={key} href={team.href} className={styles.teamCard}>
                                                {content}
                                            </Link>
                                        ) : (
                                            <div key={key} className={styles.teamCard}>
                                                {content}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className={styles.emptyState}>Equipos no disponibles.</p>
                            );
                        })()}
                    </div>
                )}

                {/* ── PLAYOFF TAB ───────────────────────────────────────── */}
                {activeTab === 'playoff' && (
                    <div className={styles.section}>
                        <PlayoffBracket data={draw} title={`Cuadro - ${tournamentName}`} />
                    </div>
                )}

                {/* ── STATS TAB ─────────────────────────────────────────── */}
                {activeTab === 'stats' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Goleadores</h2>
                        {topScorers.length > 0 ? (
                            <div className={styles.sectionCard}>
                                <div className={styles.tableCard}>
                                    <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                        <div>#</div>
                                        <div>Jugador</div>
                                        <div>Equipo</div>
                                        <div style={{ textAlign: 'center' }}>G</div>
                                        <div style={{ textAlign: 'center' }}>A</div>
                                    </div>
                                    {topScorers.slice(0, 20).map((player: any, idx: number) => (
                                        <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                            <div className={styles.tdPos}>{idx + 1}</div>
                                            <div className={styles.tdTeam}><span>{player.player_name || player.name}</span></div>
                                            <div className={styles.tdTeam} style={{ color: '#94a3b8' }}><span>{player.team_name || player.team?.name}</span></div>
                                            <div className={`${styles.tdVal} ${styles.tdPoints}`}>{player.goals}</div>
                                            <div className={styles.tdVal}>{player.assists || '-'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className={styles.emptyState}>No hay estadísticas disponibles.</p>
                        )}
                    </div>
                )}

                {/* ── ARCHIVE TAB ───────────────────────────────────────── */}
                {activeTab === 'archive' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Archivo de Temporadas</h2>
                        {archives.length > 0 ? (
                            <div className={styles.archiveGrid}>
                                {archives.map((season: any) => (
                                    <Link
                                        key={season.season_id || season.id}
                                        href={`/tournaments/${id}?season_id=${season.season_id || season.id}`}
                                        className={styles.archiveItem}
                                    >
                                        {season.name || season.season_name}
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.emptyState}>No hay temporadas archivadas disponibles.</p>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
}
