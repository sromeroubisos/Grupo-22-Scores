'use client';

import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { getTournamentById } from '@/lib/data/tournaments';
import { ArrowLeft, Calendar, Trophy, Users, ChevronRight, Share2, MapPin } from 'lucide-react';
import ExportImage from '@/components/ExportImage';
import { useFavorites } from '@/hooks/useFavorites';
import { FAVORITES_ENABLED } from '@/lib/favorites/config';
import { setCachedLogo } from '@/lib/utils/logoCache';
import PlayoffBracket from '@/components/PlayoffBracket';
import TournamentPublicStats from './TournamentPublicStats';
import TournamentScoresPanel from './TournamentScoresPanel';
import TournamentSofascoreStats from './TournamentSofascoreStats';
import { resolveSofascoreLeague } from '@/lib/sofascoreLeagueMap';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { getAllCountries, getCountryById } from '@/lib/data/countries';
import { normalizeTeamLabelAssignments, resolveStandingsRowLabel } from '@/lib/teamLabels';
import { addDaysToIsoDate, APP_TIMEZONE, formatDateInTimeZone, formatDateKey } from '@/lib/timezone';
import type { TournamentInitialData } from '@/lib/server/fetchTournamentData';
import { normalizeTournamentFormat } from '@/lib/utils/tournamentFormat';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import { resolveLogoPreviewSrc } from '@/lib/utils/logoUrl';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { resolveTournamentLogo as resolveTournamentLogoSource } from '@/lib/utils/tournamentLogo';
import { resolveExternalTournamentId } from '@/lib/utils/externalTournamentId';
import { canUseRestrictedContentActions } from '@/lib/auth/roles';
import { useAuth } from '@/context/AuthContext';
import { getTournamentFlashScoreConfig, getTournamentRugbyApiSportsConfig } from '@/lib/externalProviderPolicy';
import {
    getPlayoffTeamsCount,
    resolvePlayoffStagesForTeams,
} from '@/lib/utils/playoffStages';

// Tabs
const BASE_TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'standings', label: 'Clasificación' },
    { id: 'playoff', label: 'Playoff' },
    { id: 'teams', label: 'Equipos' },
    { id: 'scores', label: 'Puntajes' },
    { id: 'stats', label: 'Estadísticas' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

type SeasonOption = {
    id: string;
    label: string;
    name: string;
    slug: string | null;
    seasonId: string | null;
    isCurrent: boolean;
    href: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_CIRCUIT_PLACEMENT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4];
const CIRCUIT_GLOBAL_SCOPE = '__circuit_global__';
const COUNTRY_FLAG_BY_NAME = (() => {
    const map = new Map<string, string>();
    getAllCountries().forEach((country) => {
        [country.id, country.name, country.nameEs]
            .filter(Boolean)
            .forEach((key) => {
                map.set(
                    String(key)
                        .trim()
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, ''),
                    country.flagEmoji || '',
                );
            });
    });
    return map;
})();
const COUNTRY_FLAG_ALIASES: Record<string, string> = {
    british: 'united kingdom',
    'great britain': 'united kingdom',
    uk: 'united kingdom',
    english: 'united kingdom',
    scottish: 'united kingdom',
    welsh: 'united kingdom',
    monegasque: 'monaco',
    dutch: 'netherlands',
    spanish: 'spain',
    mexican: 'mexico',
    german: 'germany',
    french: 'france',
    italian: 'italy',
    australian: 'australia',
    argentine: 'argentina',
    argentinian: 'argentina',
    brazilian: 'brazil',
    canadian: 'canada',
    japanese: 'japan',
    chinese: 'china',
    thai: 'thailand',
    finnish: 'finland',
    danish: 'denmark',
    'new zealander': 'new zealand',
    kiwi: 'new zealand',
};

function isRugbyApiSportsTournamentId(value: string) {
    return /^ras-league-\d+$/i.test(value);
}

function isEspnAmericanFootballTournamentId(value: string) {
    return /^espn-league-[a-z0-9-]+$/i.test(value);
}

function isEspnSoccerTournamentId(value: string) {
    return /^espn-soccer-league-[a-z0-9._-]+$/i.test(value);
}

function isEspnMotorsportTournamentId(value: string) {
    return /^espn-racing-league-[a-z0-9-]+$/i.test(value);
}

function hasConfiguredFlashScoreSource(tournament: any): boolean {
    const config = getTournamentFlashScoreConfig(tournament as any);
    return Boolean(
        config?.tournament_id ||
        config?.tournament_stage_id ||
        config?.tournament_template_id ||
        config?.season_id
    );
}

type StandingsScopeView = {
    id: string;
    kind: 'global' | 'phase';
    label: string;
    subtitle: string;
    standings: any[];
    phase?: any | null;
};

type StandingsColumnMode = 'standard' | 'circuit-global';

function getTeamLogo(team: any): string {
    return resolveTeamLogo(team);
}

function getTournamentLogo(detailsData: any, localData: any): string {
    return resolveLogoPreviewSrc(resolveTournamentLogoSource(
        detailsData,
        localData?.logoUrl || localData?.logo_url || localData?.bannerUrl || localData?.banner_url || null
    )) || '';
}

function buildClubHref(
    team: { id?: string | number | null; name?: string | null; teamUrl?: string | null; league?: string | null },
    preferredSport?: string | null,
) {
    const rawId = String(team.id ?? '').trim();
    if (!rawId) return null;

    const normalizedId = rawId.startsWith('fs-team-') || rawId.startsWith('ras-team-') || rawId.startsWith('espn-team-')
        ? rawId
        : rawId.startsWith('fs-')
            ? `fs-team-${rawId.slice(3)}`
            : rawId;

    const params = new URLSearchParams();
    if (team.name) params.set('name', team.name);
    if (team.teamUrl) params.set('team_url', team.teamUrl);
    if (team.league) params.set('league', team.league);
    if (preferredSport) params.set('sport', preferredSport);

    const query = params.toString();
    return `/clubs/${normalizedId}${query ? `?${query}` : ''}`;
}

function cleanSeasonValue(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    return text || null;
}

function readArchiveValue(source: any, keys: string[]): string | null {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
        const direct = cleanSeasonValue(source[key]);
        if (direct) return direct;
    }
    for (const nestedKey of ['season', 'tournament', 'stage', 'tournament_stage']) {
        const nested = source[nestedKey];
        if (nested && typeof nested === 'object') {
            const nestedValue = readArchiveValue(nested, keys);
            if (nestedValue) return nestedValue;
        }
    }
    return null;
}

function pickArchiveSeasonIds(source: any) {
    const explicitSeasonId = readArchiveValue(source, ['season_id', 'seasonId']);
    const explicitStageId = readArchiveValue(source, ['tournament_stage_id', 'tournamentStageId', 'stage_id', 'stageId']);
    const rawId = cleanSeasonValue(source?.id);

    return {
        seasonId: explicitSeasonId || (rawId && /^\d+$/.test(rawId) ? rawId : null),
        stageId: explicitStageId || (rawId && !/^\d+$/.test(rawId) ? rawId : null),
        templateId: readArchiveValue(source, ['tournament_template_id', 'tournamentTemplateId', 'template_id', 'templateId']),
        tournamentId: readArchiveValue(source, ['tournament_id', 'tournamentId', 'league_id', 'leagueId']),
    };
}

function pickArchiveSeasonName(source: any): string {
    return (
        readArchiveValue(source, ['display_name', 'displayName', 'name', 'season_name', 'seasonName', 'title', 'label', 'season']) ||
        readArchiveValue(source, ['year', 'season_year', 'seasonYear']) ||
        readArchiveValue(source, ['season_id', 'seasonId']) ||
        'Temporada'
    );
}

function pickArchiveSeasonLabel(source: any): string {
    const name = pickArchiveSeasonName(source);
    const year = name.match(/\b(19|20)\d{2}(?:[/-]\d{2,4})?\b/);
    if (year) return year[0];
    const explicit = readArchiveValue(source, ['year', 'season_year', 'seasonYear', 'season_id', 'seasonId']);
    return explicit || name;
}

function buildExternalSeasonHref(
    routeId: string,
    source: any,
    currentIds: any,
    routeSearch: string,
) {
    const ids = pickArchiveSeasonIds(source);
    const params = new URLSearchParams();
    const currentQuery = new URLSearchParams(routeSearch);

    for (const key of ['sport', 'url', 'name']) {
        const value = currentQuery.get(key);
        if (value) params.set(key, value);
    }

    const tournamentId = ids.tournamentId || currentIds?.tournamentId;
    const templateId = ids.templateId || currentIds?.tournamentTemplateId;
    const seasonId = ids.seasonId;
    const stageId = ids.stageId;
    const archiveUrl = readArchiveValue(source, ['url', 'tournament_url', 'tournamentUrl', 'link']);

    if (archiveUrl) params.set('url', archiveUrl);
    if (tournamentId) params.set('tournament_id', String(tournamentId));
    if (templateId) params.set('tournament_template_id', String(templateId));
    if (stageId) params.set('tournament_stage_id', String(stageId));
    if (seasonId) params.set('season_id', String(seasonId));

    const query = params.toString();
    return `/tournaments/${routeId}${query ? `?${query}` : ''}`;
}

function buildExternalSeasonOptions(
    archives: any[],
    routeId: string,
    currentIds: any,
    routeSearch: string,
): SeasonOption[] {
    if (!Array.isArray(archives) || archives.length === 0) return [];

    const currentQuery = new URLSearchParams(routeSearch);
    const selectedSeasonId =
        cleanSeasonValue(currentQuery.get('season_id')) ||
        cleanSeasonValue(currentQuery.get('seasonId')) ||
        cleanSeasonValue(currentQuery.get('season'));
    const selectedStageId =
        cleanSeasonValue(currentQuery.get('tournament_stage_id')) ||
        cleanSeasonValue(currentQuery.get('tournamentStageId')) ||
        cleanSeasonValue(currentQuery.get('stageId'));
    const fallbackSeasonId = cleanSeasonValue(currentIds?.seasonId);
    const fallbackStageId = cleanSeasonValue(currentIds?.tournamentStageId);
    const seen = new Set<string>();

    const options = archives
        .map((archive, index): SeasonOption | null => {
            const ids = pickArchiveSeasonIds(archive);
            const key = ids.seasonId || ids.stageId || cleanSeasonValue(archive?.id) || `${index}`;
            if (!key || seen.has(key)) return null;
            seen.add(key);

            const label = pickArchiveSeasonLabel(archive);
            const name = pickArchiveSeasonName(archive);
            const isCurrent =
                Boolean(ids.seasonId && (selectedSeasonId || fallbackSeasonId) && ids.seasonId === (selectedSeasonId || fallbackSeasonId)) ||
                Boolean(ids.stageId && (selectedStageId || fallbackStageId) && ids.stageId === (selectedStageId || fallbackStageId));

            return {
                id: key,
                label,
                name,
                slug: null,
                seasonId: ids.seasonId,
                isCurrent,
                href: buildExternalSeasonHref(routeId, archive, currentIds, routeSearch),
            };
        })
        .filter((option): option is SeasonOption => option !== null);

    if (options.length > 0 && !options.some((option) => option.isCurrent) && !selectedSeasonId && !selectedStageId) {
        return options.map((option, index) => index === 0 ? { ...option, isCurrent: true } : option);
    }

    return options;
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

function getCountryFlagByName(value: unknown) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (!normalized) return '';
    const direct = COUNTRY_FLAG_BY_NAME.get(normalized);
    if (direct) return direct;

    const alias = COUNTRY_FLAG_ALIASES[normalized];
    return alias ? (COUNTRY_FLAG_BY_NAME.get(alias) || '') : '';
}

function classifyMotorsportStandingsGroup(value: unknown): 'drivers' | 'teams' | 'other' {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (!normalized) return 'other';
    if (
        normalized.includes('driver') ||
        normalized.includes('drivers') ||
        normalized.includes('piloto') ||
        normalized.includes('pilotos')
    ) {
        return 'drivers';
    }

    if (
        normalized.includes('constructor') ||
        normalized.includes('constructors') ||
        normalized.includes('team') ||
        normalized.includes('teams') ||
        normalized.includes('equipo') ||
        normalized.includes('equipos') ||
        normalized.includes('owner') ||
        normalized.includes('owners') ||
        normalized.includes('manufacturer') ||
        normalized.includes('manufacturers')
    ) {
        return 'teams';
    }

    return 'other';
}

function splitMotorsportStandingsRows(rows: any[]) {
    const drivers: any[] = [];
    const teams: any[] = [];
    const ungrouped: any[] = [];

    rows.forEach((row: any) => {
        const group = classifyMotorsportStandingsGroup(row?.group_name);
        if (group === 'drivers') {
            drivers.push(row);
            return;
        }
        if (group === 'teams') {
            teams.push(row);
            return;
        }
        ungrouped.push(row);
    });

    return { drivers, teams, ungrouped };
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

function getMotorsportRoundNumber(match: any, fallbackIndex: number) {
    const explicit = Number(match?.round_number);
    return Number.isFinite(explicit) && explicit > 0 ? explicit : (fallbackIndex + 1);
}

function getMotorsportEventStatusLabel(match: any) {
    if (match?.status === 'live' || match?.status === 'in_play') return 'Live';
    if (match?.status === 'final' || match?.status === 'finished' || match?.status === 'ft') return 'Finalizado';
    return 'Proximo';
}

function getMotorsportSeasonYear(details: any, yearDisplay: string | null | undefined) {
    if (typeof details?.season_id === 'number' && Number.isFinite(details.season_id)) {
        return details.season_id;
    }

    const match = String(yearDisplay || '').match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
}

function collectMotorsportRaceColumns(rows: any[]) {
    const seen = new Set<string>();
    const columns: Array<{ key: string; label: string }> = [];

    rows.forEach((row: any) => {
        const racePoints = Array.isArray(row?.race_points) ? row.race_points : [];
        racePoints.forEach((item: any) => {
            const key = String(item?.key || '').trim();
            const label = String(item?.label || '').trim();
            if (!key || !label || seen.has(key)) return;
            seen.add(key);
            columns.push({ key, label });
        });
    });

    return columns;
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

function isKnockoutPhaseType(phaseType: unknown) {
    const normalized = String(phaseType ?? '').trim().toLowerCase();
    return normalized === 'playoff' || normalized === 'knockout';
}

function getKnockoutPhaseDisplayTitle(phase: any, fallback = 'Cuadro Final') {
    const phaseName = String(phase?.name || '').trim();
    return phaseName || fallback;
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
    if (
        raw[0]?.team_id ||
        raw[0]?.participant ||
        raw[0]?.name ||
        raw[0]?.team ||
        raw[0]?.team_name
    ) return raw;
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

function getExplicitExportShortName(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function getPreferredExportTeamName(
    fallbackName: string,
    ...candidates: unknown[]
) {
    const explicitShortName = candidates.find((candidate) => getExplicitExportShortName(candidate)) as string | undefined;

    return getExplicitExportShortName(explicitShortName) || fallbackName || 'Equipo';
}

function getMatchExportTeamName(match: any, side: 'home' | 'away') {
    const teamLike = side === 'home' ? match?.home_team : match?.away_team;
    const clubLike = side === 'home' ? match?.home : match?.away;
    const fallbackName = side === 'home'
        ? (teamLike?.name || clubLike?.name || match?.event_home_team || match?.home_team_name || 'Home')
        : (teamLike?.name || clubLike?.name || match?.event_away_team || match?.away_team_name || 'Away');

    return getPreferredExportTeamName(
        fallbackName,
        teamLike?.short_name,
        teamLike?.shortName,
        clubLike?.short_name,
        clubLike?.shortName,
        match?.[`${side}_short_name`],
        match?.[`${side}TeamShortName`],
        match?.[`${side}_team_short_name`],
        match?.[`${side}_club_short_name`],
    );
}

function getStandingsTeamId(row: any) {
    return row.team?.id || row.team?.team_id || row.participant?.id || row.team_id || null;
}

function getStandingsCountryFlagAsset(row: any) {
    return row.country_flag || row.team?.country_flag || row.participant?.country_flag || '';
}

function getStandingsTeamLogo(row: any) {
    const motorsportTeamName = row?.team?.affiliation_name || row?.participant?.affiliation_name || row?.affiliation_name || '';
    if (motorsportTeamName) {
        const motorsportSource = {
            team_name: motorsportTeamName,
            name: motorsportTeamName,
            provider: row?.provider || row?.team?.provider || row?.participant?.provider || 'espn',
            source: row?.source || row?.team?.source || row?.participant?.source || 'espn',
            team_url: row?.team?.team_url || row?.participant?.team_url || row?.team_url || '',
        };
        const resolvedMotorsportLogo = resolveTeamLogo(motorsportSource, row?.team, row?.participant, row);
        if (resolvedMotorsportLogo) return resolvedMotorsportLogo;
    }

    return resolveTeamLogo(row?.team, row?.participant, row);
}

function getStandingsTeamUrl(row: any) {
    return row.team?.team_url || row.participant?.team_url || row.team_url || null;
}

function normalizeExternalImageUrl(value: string | null | undefined) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/res/')) return `https://static.flashscore.com${raw}`;
    return raw;
}

function handleTeamLogoError(
    event: React.SyntheticEvent<HTMLImageElement, Event>,
) {
    const image = event.currentTarget;
    const rawSrc = image.getAttribute('src') || image.src || '';

    if (!image.dataset.fallbackTried && rawSrc.includes('/api/assets/team-logo')) {
        try {
            const parsedUrl = new URL(rawSrc, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
            const fallback = normalizeExternalImageUrl(parsedUrl.searchParams.get('fallback'));
            if (fallback) {
                image.dataset.fallbackTried = '1';
                image.src = fallback;
                return;
            }
        } catch {
            // Ignore and fall through to placeholder.
        }
    }

    image.style.display = 'none';
    const placeholder = image.nextElementSibling as HTMLElement | null;
    if (placeholder) {
        placeholder.style.display = 'block';
    }
}

function handleTeamLogoLoad(
    event: React.SyntheticEvent<HTMLImageElement, Event>,
) {
    const image = event.currentTarget;
    image.style.display = 'block';
    delete image.dataset.fallbackTried;

    const placeholder = image.nextElementSibling as HTMLElement | null;
    if (placeholder) {
        placeholder.style.display = 'none';
    }
}

// Bracket placeholders coming from FlashScore knockout fixtures (e.g.
// "Group A Winner", "Group B 2nd Place", "Quarterfinal 1 Winner",
// "Round of 16 1 Winner", "Semifinal Winner"). These are slot labels, not
// actual teams, so they must not appear in the "Equipos" list.
function isBracketPlaceholderTeamName(name: string | null | undefined): boolean {
    const n = String(name ?? '').trim();
    if (!n) return false;
    return /\b(winner|2nd place|3rd place|runner[- ]?up|loser|best (?:third|\w+ placed)|tbd)\b/i.test(n);
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

function getStandingsEligiblePhases(phases: any[]) {
    if (!Array.isArray(phases)) return [];
    return sortTournamentPhases(phases).filter((phase: any) => !isKnockoutPhaseType(phase?.phase_type));
}

function getPreferredStandingsPhase(phases: any[], matches: any[] = [], standings: any[] = []) {
    const eligiblePhases = getStandingsEligiblePhases(phases);
    if (eligiblePhases.length === 0) return null;

    const explicitActivePhase = eligiblePhases.find((phase: any) => phase?.is_active);
    if (explicitActivePhase) return explicitActivePhase;

    const phaseIdsWithData = new Set<string>();
    matches.forEach((match: any) => {
        if (match?.phase_id) phaseIdsWithData.add(String(match.phase_id));
    });
    standings.forEach((row: any) => {
        if (row?.phase_id) phaseIdsWithData.add(String(row.phase_id));
    });

    const latestPhaseWithData = [...eligiblePhases]
        .reverse()
        .find((phase: any) => phaseIdsWithData.has(String(phase.id)));

    return latestPhaseWithData ?? eligiblePhases[0] ?? null;
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

function getPreferredKnockoutPhase(phases: any[], rounds: any[] = [], matches: any[] = []) {
    if (!Array.isArray(phases) || phases.length === 0) return null;

    const knockoutPhases = sortTournamentPhases(phases).filter((phase: any) =>
        isKnockoutPhaseType(phase?.phase_type),
    );
    if (knockoutPhases.length === 0) return null;

    const explicitActiveKnockout = knockoutPhases.find((phase: any) => phase?.is_active);
    if (explicitActiveKnockout) return explicitActiveKnockout;

    const phaseIdsWithStructure = new Set<string>();
    rounds.forEach((round: any) => {
        if (round?.phase_id) phaseIdsWithStructure.add(String(round.phase_id));
    });
    matches.forEach((match: any) => {
        if (match?.phase_id) phaseIdsWithStructure.add(String(match.phase_id));
    });

    const latestKnockoutWithData = [...knockoutPhases]
        .reverse()
        .find((phase: any) => phaseIdsWithStructure.has(String(phase.id)));

    return latestKnockoutWithData ?? knockoutPhases[knockoutPhases.length - 1] ?? null;
}

// Mirrors readPhaseCarryOverConfig() in @/lib/server/standingsCarryOver.
// When a phase carries points from a previous phase, the carried totals only
// exist in the server-persisted tournament_standings (computed via
// resolveStandingsCarryOverRows). The client-side StandingsEngine recompute
// here has no access to the source phase, so for carry-over phases we must
// trust the persisted rows instead of the local recompute.
function isPhaseCarryOverEnabled(settings: any): boolean {
    const carryOver = settings?.carryOver ?? settings?.carry_over ?? settings?.statisticsCarryOver ?? null;
    return Boolean(
        carryOver?.enabled ??
        carryOver?.fromPreviousPhase ??
        settings?.carryOverPreviousPhase ??
        settings?.carry_over_previous_phase ??
        false,
    );
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
    const activeGroups = activePhase?.phase_type === 'group_stage'
        ? groups.filter(
            (group: any) => !activePhaseId || String(group?.phase_id ?? '') === String(activePhaseId),
        )
        : [];
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
        lineups: match.lineups ?? null,
        events: match.events ?? [],
        date_time: match.date_time ?? null,
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
    const { participants, activeGroups, activePhase, activePhaseId, resolvedRules } = getDbStandingsContext(dbData, preferredPhaseId);
    const persistedStandings = filterStandingsToActivePhase(
        (Array.isArray(dbData.standings) ? dbData.standings : []).map(mapPersistedDbStanding),
        activePhaseId,
        { strict: Boolean(preferredPhaseId) },
    );
    const canSafelyCalculate =
        !dbData.queryErrors?.matches &&
        !dbData.queryErrors?.participants;
    // Carry-over phases: the local recompute can't see the source phase, so
    // it would drop the carried points. Use the server-persisted rows, which
    // already fold in carry-over. Only do this when persisted rows exist for
    // the phase (otherwise fall back to the recompute so the table isn't blank).
    const carryOverPhaseWithPersistedRows =
        isPhaseCarryOverEnabled(activePhase?.settings) && persistedStandings.length > 0;
    const shouldUsePersistedStandings =
        resolvedRules?.calculation_mode === 'fully_manual' || carryOverPhaseWithPersistedRows;

    if (!shouldUsePersistedStandings && canSafelyCalculate) {
        const calculatedStandings = buildCalculatedStandings(dbData, preferredPhaseId);
        const hasActualMatchData = flattenStandingsRows(calculatedStandings)
            .some((row: any) => (row.matches_total || 0) > 0);
        if (calculatedStandings.length > 0 && (hasActualMatchData || Boolean(preferredPhaseId))) {
            return calculatedStandings;
        }
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

function buildDbPlayoffDraw(dbData: TournamentInitialData, preferredPhaseId?: string | null) {
    const { matches, phases, activePhase } = getDbStandingsContext(dbData, preferredPhaseId);
    const rounds = Array.isArray(dbData.rounds) ? (dbData.rounds as any[]) : [];
    const phase = preferredPhaseId
        ? phases.find((candidate: any) => String(candidate?.id ?? '') === String(preferredPhaseId))
        : activePhase;

    if (!phase?.id || !isKnockoutPhaseType(phase?.phase_type)) {
        return [];
    }

    const phaseId = String(phase.id);
    const phaseMatches = matches
        .filter((match: any) => String(match?.phase_id ?? '') === phaseId)
        .sort((left: any, right: any) => {
            const leftDate = left?.date_time ? new Date(left.date_time).getTime() : Number.MAX_SAFE_INTEGER;
            const rightDate = right?.date_time ? new Date(right.date_time).getTime() : Number.MAX_SAFE_INTEGER;
            if (leftDate !== rightDate) return leftDate - rightDate;
            return String(left?.id || '').localeCompare(String(right?.id || ''));
        });

    const mapMatch = (match: any) => {
        const scoreHome = match?.score?.home ?? null;
        const scoreAway = match?.score?.away ?? null;
        const finished = isDbFinalStatus(match?.status);
        const hasNumericScore = typeof scoreHome === 'number' && typeof scoreAway === 'number';
        let winnerId = null;

        if (finished && hasNumericScore && scoreHome !== scoreAway) {
            winnerId = scoreHome > scoreAway ? match?.home?.id ?? match?.home_club_id ?? null : match?.away?.id ?? match?.away_club_id ?? null;
        }

        return {
            match_id: match.id,
            home_participant: null,
            away_participant: null,
            home_team: match.home ? {
                id: match.home.id,
                name: match.home.name || 'Local',
                logo: match.home.logo_url || '',
            } : null,
            away_team: match.away ? {
                id: match.away.id,
                name: match.away.name || 'Visitante',
                logo: match.away.logo_url || '',
            } : null,
            score_home: finished && hasNumericScore ? scoreHome : null,
            score_away: finished && hasNumericScore ? scoreAway : null,
            winner_id: winnerId,
            match_start_iso: match.date_time || null,
            status: finished ? 'finished' : (match.status || 'scheduled'),
        };
    };

    const phaseRounds = rounds
        .filter((round: any) => String(round?.phase_id ?? '') === phaseId)
        .sort((left: any, right: any) => {
            const leftOrder = typeof left?.order_index === 'number' ? left.order_index : Number.MAX_SAFE_INTEGER;
            const rightOrder = typeof right?.order_index === 'number' ? right.order_index : Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return String(left?.name || '').localeCompare(String(right?.name || ''));
        });
    const configuredStages = resolvePlayoffStagesForTeams(phase?.settings, getPlayoffTeamsCount(phase?.settings));
    const buildPlaceholderMatch = (roundId: string, roundIndex: number, matchIndex: number) => ({
        match_id: `${roundId}-placeholder-${matchIndex + 1}`,
        home_participant: null,
        away_participant: null,
        home_team: null,
        away_team: null,
        score_home: null,
        score_away: null,
        winner_id: null,
        match_start_iso: null,
        status: 'scheduled',
        result: 'scheduled',
        bracket_slot: matchIndex + 1,
        round_index: roundIndex + 1,
    });
    const buildRoundEntry = (
        roundId: string,
        roundName: string,
        roundIndex: number,
        roundMatches: any[],
    ) => {
        const configuredMatchCount = configuredStages[roundIndex]?.matchCount ?? 0;
        const visibleRoundMatches = configuredMatchCount > 0 && roundMatches.length > configuredMatchCount
            ? [
                ...roundMatches.filter((match: any) => match?.home_club_id || match?.away_club_id || match?.home || match?.away),
                ...roundMatches.filter((match: any) => !(match?.home_club_id || match?.away_club_id || match?.home || match?.away)),
            ].slice(0, Math.max(
                configuredMatchCount,
                roundMatches.filter((match: any) => match?.home_club_id || match?.away_club_id || match?.home || match?.away).length,
            ))
            : roundMatches;
        const mappedMatches = visibleRoundMatches.map(mapMatch);
        const desiredCount = Math.max(configuredMatchCount, mappedMatches.length);

        while (mappedMatches.length < desiredCount) {
            mappedMatches.push(buildPlaceholderMatch(roundId, roundIndex, mappedMatches.length));
        }

        return {
            round_id: roundId,
            name: roundName,
            matches: mappedMatches,
        };
    };

    const configuredRoundCount = Math.max(phaseRounds.length, configuredStages.length);
    if (configuredRoundCount > 0) {
        const roundEntries = Array.from({ length: configuredRoundCount }, (_, index) => {
            const round = phaseRounds[index];
            const configuredStage = configuredStages[index];
            const roundId = String(round?.id ?? `${phaseId}-stage-${index + 1}`);
            const roundName = String(round?.name || configuredStage?.name || `Ronda ${index + 1}`);
            const roundMatches = round
                ? phaseMatches.filter((match: any) => String(match?.round_uuid ?? '') === roundId)
                : phaseMatches.filter((match: any) => String(match?.round_label ?? '').trim().toLowerCase() === roundName.toLowerCase());

            return buildRoundEntry(roundId, roundName, index, roundMatches);
        });

        if (roundEntries.length > 0) return roundEntries;
    }

    if (phaseMatches.length === 0) {
        return [];
    }

    const groupedByLabel = new Map<string, any[]>();
    phaseMatches.forEach((match: any, index: number) => {
        const label = String(match?.round_label || `Ronda ${index + 1}`).trim();
        const current = groupedByLabel.get(label) || [];
        current.push(match);
        groupedByLabel.set(label, current);
    });

    return Array.from(groupedByLabel.entries()).map(([label, roundMatches], index) => ({
        round_id: `${phaseId}-${index + 1}`,
        name: label,
        matches: roundMatches.map(mapMatch),
    }));
}

function buildCircuitGlobalStandings(dbData: TournamentInitialData) {
    const {
        participants,
        phases,
        tournamentRuleset,
    } = getDbStandingsContext(dbData);
    const stagePhases = getStandingsEligiblePhases(phases);

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

    stagePhases.forEach((phase: any, index: number) => {
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

function buildCircuitStandingsViews(dbData: TournamentInitialData): StandingsScopeView[] {
    const { phases } = getDbStandingsContext(dbData);
    const views: StandingsScopeView[] = [];
    const globalStandings = buildCircuitGlobalStandings(dbData);
    const stagePhases = getStandingsEligiblePhases(phases);

    if (globalStandings.length > 0) {
        views.push({
            id: CIRCUIT_GLOBAL_SCOPE,
            kind: 'global',
            label: 'Tabla global',
            subtitle: 'Ranking acumulado del circuito',
            standings: globalStandings,
            phase: null,
        });
    }

    stagePhases.forEach((phase: any, index: number) => {
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
            phase,
        });
    });

    return views;
}

function buildPhaseStandingsViews(dbData: TournamentInitialData): StandingsScopeView[] {
    const { phases } = getDbStandingsContext(dbData);
    const views: StandingsScopeView[] = [];
    const eligiblePhases = getStandingsEligiblePhases(phases);

    eligiblePhases.forEach((phase: any, index: number) => {
        const phaseId = String(phase?.id || '').trim();
        if (!phaseId) return;

        const snapshot = buildStandingsSnapshot(dbData, phaseId);
        if (flattenStandingsRows(snapshot).length === 0) return;

        const phaseName = getPhaseDisplayName(phase, index);
        views.push({
            id: phaseId,
            kind: 'phase',
            label: phaseName,
            subtitle: `Tabla de ${phaseName}`,
            standings: snapshot,
            phase,
        });
    });

    return views;
}

function buildDbTournamentSnapshot(dbData: TournamentInitialData, id: string) {
    const allMatches = (Array.isArray(dbData.matches) ? dbData.matches : []).map(mapDbMatchToFrontend);
    const tournament = dbData.tournament as any;
    const tournamentSeason = dbData.season as any;
    const tournamentRuleset = tournament?.ruleset ?? null;
    const hasRugbyExternalConfig = Boolean(getTournamentRugbyApiSportsConfig(tournament)?.league_id);
    const isCircuitCompetition = isCircuitTournamentRuleset(tournamentRuleset, tournament?.format ?? null);
    const { activePhase, phases } = getDbStandingsContext(dbData);
    const standingsScopeViews = isCircuitCompetition ? buildCircuitStandingsViews(dbData) : buildPhaseStandingsViews(dbData);
    const preferredStandingsPhase = getPreferredStandingsPhase(
        phases,
        Array.isArray(dbData.matches) ? (dbData.matches as any[]) : [],
        Array.isArray(dbData.standings) ? (dbData.standings as any[]) : [],
    );
    const defaultStandingsScope = isCircuitCompetition
        ? standingsScopeViews[0]?.id ?? null
        : (preferredStandingsPhase?.id && standingsScopeViews.some((view) => view.id === String(preferredStandingsPhase.id)))
            ? String(preferredStandingsPhase.id)
            : standingsScopeViews[0]?.id ?? null;
    const defaultStandings =
        standingsScopeViews.find((view) => view.id === defaultStandingsScope)?.standings ??
        (defaultStandingsScope && defaultStandingsScope !== CIRCUIT_GLOBAL_SCOPE
            ? buildStandingsSnapshot(dbData, defaultStandingsScope)
            : []);
    const preferredKnockoutPhase = getPreferredKnockoutPhase(
        phases,
        Array.isArray(dbData.rounds) ? dbData.rounds : [],
        Array.isArray(dbData.matches) ? dbData.matches : [],
    );
    const draw = buildDbPlayoffDraw(dbData, preferredKnockoutPhase?.id ?? activePhase?.id ?? null);

    return {
        tournamentMeta: tournament ? {
            id: tournament.id || id,
            name: tournament.display_name || tournament.name || 'Torneo',
            sportId: tournament.sport_id || 'rugby',
            countryId: tournament.country_id || 'international',
            logoUrl: tournament.logo_url || tournament.banner_url || '',
            externalId: tournament.external_id || null,
            ruleset: tournamentRuleset,
            url: tournament.url || '',
            season_id: tournamentSeason?.season_code || (tournament.season_id != null && String(tournament.season_id).trim()
                ? String(tournament.season_id).trim()
                : null),
            type: isCircuitCompetition ? 'circuit' : 'league',
            categories: [],
            priority: 0,
            __isDbOnly: !tournament.url && !hasRugbyExternalConfig && !hasConfiguredFlashScoreSource(tournament),
        } : null,
        results: sortMatchesByDate(allMatches.filter((match: any) => match.status === 'finished'), 'desc'),
        fixtures: sortMatchesByDate(allMatches.filter((match: any) => match.status !== 'finished'), 'asc'),
        draw,
        standings: defaultStandings,
        dbParticipants: Array.isArray(dbData.participants) ? (dbData.participants as any[]) : [],
        dbPhases: Array.isArray(dbData.phases) ? (dbData.phases as any[]) : [],
        activePhase: activePhase ?? null,
        dbGroups: Array.isArray(dbData.groups) ? (dbData.groups as any[]) : [],
        dbTeamLabels: normalizeTeamLabelAssignments(Array.isArray(dbData.teamLabels) ? dbData.teamLabels : []),
        standingsScopeViews,
        defaultStandingsScope,
        isCircuitCompetition,
        preferredKnockoutPhase: preferredKnockoutPhase ?? null,
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
    const searchParams = useSearchParams();
    const routeSearch = searchParams.toString();
    const { isLeagueFavorite, toggleLeagueFavorite } = useFavorites();
    const { user, isLoading: authLoading } = useAuth();

    // FIFA World Cup 26 visual identity — applied only for the ESPN soccer FIFA World Cup tournament.
    const isFifaWorldCup = (id || '').toLowerCase() === 'espn-soccer-league-fifa.world';

    // Detect phone viewport so the FWC26 layout can drop the stats row + reorder tabs.
    const [isPhoneViewport, setIsPhoneViewport] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 600px)');
        const update = () => setIsPhoneViewport(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

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
    const [standingsFormTeamLabels, setStandingsFormTeamLabels] = useState<any[]>([]);
    const [standingsHtFt, setStandingsHtFt] = useState<any[]>([]);
    const [standingsHtFtTeamLabels, setStandingsHtFtTeamLabels] = useState<any[]>([]);
    const [standingsOverUnder, setStandingsOverUnder] = useState<any[]>([]);
    const [standingsOverUnderTeamLabels, setStandingsOverUnderTeamLabels] = useState<any[]>([]);
    const [customStandingsTables, setCustomStandingsTables] = useState<any[]>([]);
    const [archives, setArchives] = useState<any[]>([]);
    const [seasonOptions, setSeasonOptions] = useState<SeasonOption[]>([]);
    const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
    const [results, setResults] = useState<any[]>(preloaded?.results ?? []);
    const [fixtures, setFixtures] = useState<any[]>(preloaded?.fixtures ?? []);
    const [details, setDetails] = useState<any>(null);
    const [topScorers, setTopScorers] = useState<any[]>([]);
    const [draw, setDraw] = useState<any[]>(preloaded?.draw ?? []);
    const [standingsView, setStandingsView] = useState<string>('overall');
    const [dbParticipants, setDbParticipants] = useState<any[]>(preloaded?.dbParticipants ?? []);
    const [dbPhases, setDbPhases] = useState<any[]>(preloaded?.dbPhases ?? []);
    const [activeDbPhase, setActiveDbPhase] = useState<any>(preloaded?.activePhase ?? null);
    const [dbTeamLabels, setDbTeamLabels] = useState<any[]>(preloaded?.dbTeamLabels ?? []);
    const [preferredKnockoutPhase, setPreferredKnockoutPhase] = useState<any>(preloaded?.preferredKnockoutPhase ?? null);
    const [standingsScopeViews, setStandingsScopeViews] = useState<StandingsScopeView[]>(preloaded?.standingsScopeViews ?? []);
    const [activeStandingsScope, setActiveStandingsScope] = useState<string>(
        preloaded?.defaultStandingsScope ?? preloaded?.standingsScopeViews?.[0]?.id ?? CIRCUIT_GLOBAL_SCOPE,
    );
    const [tournamentLogoFailed, setTournamentLogoFailed] = useState(false);

    // ── Data fetch ────────────────────────────────────────────────────────

    useEffect(() => {
        const controller = new AbortController();
        const shouldRetryDbSnapshot =
            !!initialData?.queryErrors?.tournament ||
            !!initialData?.queryErrors?.participants ||
            !!initialData?.queryErrors?.matches ||
            !!initialData?.queryErrors?.standings ||
            !!initialData?.queryErrors?.phases ||
            !!initialData?.queryErrors?.rounds ||
            !!initialData?.queryErrors?.groups ||
            !!initialData?.queryErrors?.teamLabels;
        const shouldPreferDbSource = !!initialData?.ok;
        const hasCompletePreloadedMeta = Boolean(
            preloaded?.tournamentMeta &&
            preloaded.tournamentMeta.name &&
            preloaded.tournamentMeta.name !== 'Cargando...' &&
            preloaded.tournamentMeta.sportId &&
            String(preloaded.tournamentMeta.logoUrl || '').trim(),
        );
        const shouldKeepDbCircuitStandings = Boolean(
            preloaded?.isCircuitCompetition ||
            isCircuitTournamentRuleset(preloaded?.tournamentMeta?.ruleset) ||
            isCircuitTournamentRuleset((initialData?.tournament as any)?.ruleset),
        );
        const routeQuery = new URLSearchParams(routeSearch);
        const hasRouteSeasonOverride = Boolean(
            routeQuery.get('season') ||
            routeQuery.get('season_id') ||
            routeQuery.get('seasonId') ||
            routeQuery.get('tournament_stage_id') ||
            routeQuery.get('tournamentStageId') ||
            routeQuery.get('stageId')
        );

        async function fetchData() {
            // Skip refetch when SSR already has a real name; still run when logo is missing so `/api/db/tournaments/[id]` can fill `banner_url`.
            if (preloaded && !shouldRetryDbSnapshot) {
                const meta = preloaded.tournamentMeta;
                const catalogTournament = getTournamentById(id);
                const hasName = Boolean(meta?.name) && meta?.name !== 'Cargando...';
                const hasLogo = Boolean(String(meta?.logoUrl || '').trim());
                const hasRugbyExternalConfig = Boolean(getTournamentRugbyApiSportsConfig(meta as any)?.league_id);
                const hasKnownExternalUrl = Boolean(String(meta?.url || catalogTournament?.url || '').trim());
                const hasFlashScoreConfig = hasConfiguredFlashScoreSource(meta) || hasConfiguredFlashScoreSource(catalogTournament);
                const isDbOnlySnapshot = Boolean(meta?.__isDbOnly) && !hasKnownExternalUrl && !hasFlashScoreConfig;
                if (hasName && hasLogo && isDbOnlySnapshot && !hasRugbyExternalConfig && !hasRouteSeasonOverride) {
                    setLoading(false);
                    return;
                }
            }
            setLoading(!preloaded);
            let localTournament: any = null;
            try {
                const sp = new URLSearchParams(routeSearch);
                const overrideSport = sp.get('sport') || undefined;
                const overrideTournamentId = sp.get('tournament_id') || sp.get('tournamentId');
                const overrideStageId = sp.get('tournament_stage_id') || sp.get('tournamentStageId') || sp.get('stageId');
                const overrideSeason = sp.get('season') || sp.get('season_id') || sp.get('seasonId') || undefined;
                const urlParam = sp.get('url');
                const nameParam = sp.get('name');

                localTournament = getTournamentById(id);

                if (shouldPreferDbSource) {
                    const dbStoredUrl = (initialData?.tournament as any)?.url || '';
                    const fallbackCatalogUrl = localTournament?.url || preloaded?.tournamentMeta?.url || '';
                    const resolvedTournamentUrl = dbStoredUrl || fallbackCatalogUrl;
                    const hasFlashScoreExternalConfig = Boolean(
                        hasConfiguredFlashScoreSource(initialData?.tournament) ||
                        hasConfiguredFlashScoreSource(preloaded?.tournamentMeta) ||
                        hasConfiguredFlashScoreSource(localTournament)
                    );
                    const hasRugbyExternalConfig = Boolean(
                        getTournamentRugbyApiSportsConfig(initialData?.tournament as any)?.league_id ||
                        getTournamentRugbyApiSportsConfig(preloaded?.tournamentMeta as any)?.league_id,
                    );
                    localTournament = {
                        ...(localTournament ?? {}),
                        ...(preloaded?.tournamentMeta ?? {}),
                        id: preloaded?.tournamentMeta?.id || id,
                        sportId: preloaded?.tournamentMeta?.sportId || localTournament?.sportId || (overrideSport || (isEspnAmericanFootballTournamentId(id) ? 'american-football' : 'rugby')),
                        countryId: preloaded?.tournamentMeta?.countryId || localTournament?.countryId || 'international',
                        name: preloaded?.tournamentMeta?.name || localTournament?.name || 'Cargando...',
                        url: resolvedTournamentUrl,
                        type: preloaded?.tournamentMeta?.type || localTournament?.type || 'league',
                        categories: localTournament?.categories || [],
                        priority: localTournament?.priority || 0,
                        // Rugby API-Sports tournaments can be externally linked without a FlashScore URL.
                        __isDbOnly: !resolvedTournamentUrl && !hasRugbyExternalConfig && !hasFlashScoreExternalConfig,
                    } as any;
                }

                if (!localTournament) {
                    if (id.toLowerCase().startsWith('fs-') || isRugbyApiSportsTournamentId(id) || isEspnAmericanFootballTournamentId(id) || isEspnSoccerTournamentId(id)) {
                        localTournament = {
                            id,
                            name: nameParam || 'Cargando...',
                            url: '',
                            type: 'league' as any,
                            sportId: (overrideSport || (isEspnAmericanFootballTournamentId(id) ? 'american-football' : isEspnSoccerTournamentId(id) ? 'football' : 'rugby')) as any,
                            countryId: 'international',
                            categories: [],
                            priority: 0,
                        } as any;
                    } else {
                        // UUID → DB-only tournament. Skip metadata round-trip;
                        // metadata will be included in the /data response below.
                        const dbStoredUrl = (initialData?.tournament as any)?.url || '';
                        const hasFlashScoreExternalConfig = hasConfiguredFlashScoreSource(initialData?.tournament);
                        const hasRugbyExternalConfig = Boolean(
                            getTournamentRugbyApiSportsConfig(initialData?.tournament as any)?.league_id,
                        );
                        localTournament = {
                            id,
                            name: 'Cargando...',
                            url: dbStoredUrl,
                            type: 'league' as any,
                            sportId: (overrideSport || (isEspnAmericanFootballTournamentId(id) ? 'american-football' : isEspnSoccerTournamentId(id) ? 'football' : 'rugby')) as any,
                            countryId: 'international',
                            categories: [],
                            priority: 0,
                            __isDbOnly: !isEspnSoccerTournamentId(id) && !dbStoredUrl && !hasRugbyExternalConfig && !hasFlashScoreExternalConfig,
                            __dbLookupCandidate: !UUID_RE.test(id) && !isEspnSoccerTournamentId(id),
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
                        const dbDataQuery = new URLSearchParams();
                        if (overrideSeason) dbDataQuery.set('seasonId', overrideSeason);
                        const dbDataRes = await fetch(`/api/db/tournaments/${id}/data${dbDataQuery.size ? `?${dbDataQuery.toString()}` : ''}`, {
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
                                            externalId: (t as any).external_id || tournamentMeta?.externalId || null,
                                            ruleset: (t as any).ruleset ?? tournamentMeta?.ruleset ?? null,
                                            url: dbStoredUrl,
                                            season_id: (dbData.season as any)?.season_code || ((t as any).season_id != null && String((t as any).season_id).trim()
                                                ? String((t as any).season_id).trim()
                                                : tournamentMeta?.season_id ?? null),
                                            type: isCircuitTournamentRuleset((t as any).ruleset ?? tournamentMeta?.ruleset ?? null)
                                                ? 'circuit'
                                                : (tournamentMeta?.type || 'league'),
                                            categories: [],
                                            priority: 0,
                                            __isDbOnly:
                                                !dbStoredUrl &&
                                                !getTournamentRugbyApiSportsConfig(t as any)?.league_id &&
                                                !hasConfiguredFlashScoreSource(t),
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
                            setDbPhases(snapshot.dbPhases ?? []);
                            setActiveDbPhase(snapshot.activePhase ?? null);
                            setDbTeamLabels(snapshot.dbTeamLabels);
                            setPreferredKnockoutPhase(snapshot.preferredKnockoutPhase ?? null);
                            setStandingsScopeViews(snapshot.standingsScopeViews ?? []);
                            setActiveStandingsScope(
                                snapshot.defaultStandingsScope ?? snapshot.standingsScopeViews?.[0]?.id ?? CIRCUIT_GLOBAL_SCOPE,
                            );
                            setResults(sortMatchesByDate(snapshot.results || [], 'desc'));
                            setFixtures(sortMatchesByDate(snapshot.fixtures || [], 'asc'));
                            setDraw(snapshot.draw ?? []);
                            setStandings(snapshot.standings);
                        }

                            // Map DB matches → frontend match format

                            // Map DB standings → frontend standings format

                    }
                    return; // Skip FlashScore for DB-only tournaments
                }

                // Local DB metadata for UUID/slug routes that also use a FlashScore URL (fixture from API, nombre/logo desde Supabase).
                const shouldFetchDbMeta =
                    !shouldPreferDbSource ||
                    shouldRetryDbSnapshot ||
                    !hasCompletePreloadedMeta;

                if (
                    shouldFetchDbMeta &&
                    !id.toLowerCase().startsWith('fs-') &&
                    !isRugbyApiSportsTournamentId(id) &&
                    !isEspnAmericanFootballTournamentId(id) &&
                    !isEspnSoccerTournamentId(id)
                ) {
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
                                    externalId: (t as any).external_id || prev?.externalId || null,
                                    ruleset: (t as any).ruleset ?? prev?.ruleset ?? null,
                                }));
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                }

                const finalUrl = localTournament?.url || urlParam;
                const flashScoreConfig =
                    getTournamentFlashScoreConfig(localTournament) ||
                    getTournamentFlashScoreConfig(preloaded?.tournamentMeta) ||
                    getTournamentFlashScoreConfig(initialData?.tournament);
                const query = new URLSearchParams();
                query.set('id', id);
                if (finalUrl) query.set('url', finalUrl);
                if (nameParam) query.set('name', nameParam);
                if (localTournament?.sportId) query.set('sport', localTournament.sportId);
                if (overrideTournamentId) query.set('tournament_id', overrideTournamentId);
                else if (flashScoreConfig?.tournament_id) query.set('tournament_id', String(flashScoreConfig.tournament_id));
                if (overrideStageId) query.set('tournament_stage_id', overrideStageId);
                else if (flashScoreConfig?.tournament_stage_id) query.set('tournament_stage_id', String(flashScoreConfig.tournament_stage_id));
                if (flashScoreConfig?.tournament_template_id) query.set('tournament_template_id', String(flashScoreConfig.tournament_template_id));
                if (overrideSeason) query.set('season_id', overrideSeason);
                else if (flashScoreConfig?.season_id != null) query.set('season_id', String(flashScoreConfig.season_id));

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
                if (payload?.ids) {
                    setTournamentData((prev: any) => ({
                        ...(prev || {}),
                        flashScoreIds: {
                            ...(prev?.flashScoreIds || {}),
                            tournamentId: payload.ids?.tournamentId || prev?.flashScoreIds?.tournamentId,
                            tournamentStageId: payload.ids?.stageId || prev?.flashScoreIds?.tournamentStageId,
                            tournamentTemplateId: payload.ids?.templateId || prev?.flashScoreIds?.tournamentTemplateId,
                            seasonId: payload.ids?.seasonId || prev?.flashScoreIds?.seasonId,
                        },
                    }));
                }
                if (!shouldKeepDbCircuitStandings) {
                    setStandings(payload.standings || []);
                    setStandingsForm(payload.standingsForm || []);
                    setStandingsHtFt(payload.standingsHtFt || []);
                    setStandingsOverUnder(payload.standingsOverUnder || []);
                }
                if (Array.isArray(payload.teamLabels)) {
                    setDbTeamLabels(normalizeTeamLabelAssignments(payload.teamLabels));
                }
                setStandingsFormTeamLabels(normalizeTeamLabelAssignments(Array.isArray(payload.standingsFormTeamLabels) ? payload.standingsFormTeamLabels : []));
                setStandingsHtFtTeamLabels(normalizeTeamLabelAssignments(Array.isArray(payload.standingsHtFtTeamLabels) ? payload.standingsHtFtTeamLabels : []));
                setStandingsOverUnderTeamLabels(normalizeTeamLabelAssignments(Array.isArray(payload.standingsOverUnderTeamLabels) ? payload.standingsOverUnderTeamLabels : []));
                setCustomStandingsTables(
                    Array.isArray(payload.customStandingsTables)
                        ? payload.customStandingsTables.map((table: any) => ({
                            ...table,
                            teamLabels: normalizeTeamLabelAssignments(Array.isArray(table?.teamLabels) ? table.teamLabels : []),
                        }))
                        : [],
                );
                setDraw((current) => Array.isArray(payload.draw) ? payload.draw : current);
                setTopScorers(payload.topScorers || []);
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
    }, [id, initialData, preloaded, routeSearch]);

    useEffect(() => {
        setTournamentLogoFailed(false);
    }, [details, tournamentData]);

    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            try {
                const query = new URLSearchParams();
                const pageQuery = new URLSearchParams(routeSearch);
                const selectedSeasonParam =
                    pageQuery.get('seasonId') ||
                    pageQuery.get('season_id') ||
                    pageQuery.get('season') ||
                    ((initialData?.season as any)?.id ? String((initialData?.season as any).id) : null);
                if (selectedSeasonParam) query.set('seasonId', selectedSeasonParam);
                const res = await fetch(`/api/db/tournaments/${encodeURIComponent(id)}/seasons${query.size ? `?${query.toString()}` : ''}`, {
                    signal: controller.signal,
                    cache: 'no-store',
                });
                if (!res.ok) {
                    setSeasonOptions([]);
                    return;
                }
                const json = await res.json();
                if (json?.ok && Array.isArray(json.seasons)) {
                    setSeasonOptions(json.seasons);
                } else {
                    setSeasonOptions([]);
                }
            } catch (err: any) {
                if (err?.name !== 'AbortError') setSeasonOptions([]);
            }
        })();
        return () => controller.abort();
    }, [id, initialData?.season, routeSearch]);

    useEffect(() => {
        if (!seasonMenuOpen) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest(`.${styles.seasonSwitcher}`)) return;
            setSeasonMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSeasonMenuOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [seasonMenuOpen]);

    const hasDbKnockoutPhase = useMemo(
        () => dbPhases.some((phase: any) => isKnockoutPhaseType(phase?.phase_type)),
        [dbPhases],
    );
    const visibleStandingsScopeViews = useMemo(
        () => standingsScopeViews.filter((view) => view.kind === 'global' || !isKnockoutPhaseType(view.phase?.phase_type)),
        [standingsScopeViews],
    );
    const hasVisibleStandingsData = visibleStandingsScopeViews.length > 0 || (!hasDbKnockoutPhase && (
        standings.length > 0 ||
        standingsForm.length > 0 ||
        standingsHtFt.length > 0 ||
        standingsOverUnder.length > 0 ||
        customStandingsTables.length > 0
    ));
    const isEspnSoccerSourceForTabs = isEspnSoccerTournamentId(id);
    const shouldUseIntegratedBracketView = !hasDbKnockoutPhase && !hasVisibleStandingsData && (
        Boolean(details?.current_stage_has_cup_trees) || isKnockoutPhaseType(activeDbPhase?.phase_type)
    );
    // Any source that returns a non-empty draw exposes a dedicated Playoff tab so
    // "Ver cuadro" always lands on real bracket content. The integrated standings
    // view may also render the bracket, but the dedicated tab guarantees access.
    const hasDedicatedPlayoffTab = hasDbKnockoutPhase || draw.length > 0;

    useEffect(() => {
        // Only bounce playoff -> standings when there's no dedicated playoff tab.
        // ESPN soccer (and any source with a real draw) keeps its own Playoff tab.
        if (shouldUseIntegratedBracketView && !hasDedicatedPlayoffTab && activeTab === 'playoff') {
            setActiveTab('standings');
        }
    }, [activeTab, shouldUseIntegratedBracketView, hasDedicatedPlayoffTab]);

    // ── Loading / Error ────────────────────────────────────────────────────

    const isEspnSoccerSource = isEspnSoccerSourceForTabs;
    const isLimitedExternalProvider =
        details?.provider === 'rugby-api-sports' ||
        details?.externalProvider === 'rugby-api-sports' ||
        details?.provider === 'espn' ||
        details?.externalProvider === 'espn' ||
        isRugbyApiSportsTournamentId(id) ||
        isEspnAmericanFootballTournamentId(id) ||
        isEspnSoccerTournamentId(id) ||
        isEspnMotorsportTournamentId(id);
    const isMotorsportTournament = Boolean(
        tournamentData?.sportId === 'motorsport' ||
        details?.sport?.sport_id === 'motorsport' ||
        isEspnMotorsportTournamentId(id) ||
        isEspnMotorsportTournamentId(String(tournamentData?.externalId || '')) ||
        isEspnMotorsportTournamentId(String(details?.tournament_id || ''))
    );
    const shouldForceStandingsTabVisible = tournamentData?.sportId === 'basketball';
    const hasEspnSoccerTopScorers = isEspnSoccerSource && topScorers.length > 0;
    const navigationTabs = useMemo(() => {
        let tabs = BASE_TABS
            .filter((tab: { id: string; label: string }) => !(isLimitedExternalProvider && !hasEspnSoccerTopScorers && tab.id === 'stats'))
            .filter((tab: { id: string; label: string }) => !(isLimitedExternalProvider && !isEspnSoccerSource && tab.id === 'playoff'))
            .filter((tab: { id: string; label: string }) => !(tab.id === 'standings' && !shouldUseIntegratedBracketView && !hasVisibleStandingsData && !shouldForceStandingsTabVisible))
            .filter((tab: { id: string; label: string }) => !(tab.id === 'playoff' && !hasDedicatedPlayoffTab))
            .map((tab: { id: string; label: string }) => {
                if (tab.id === 'standings' && shouldUseIntegratedBracketView) {
                    return { ...tab, label: 'Cuadro' };
                }
                if (tab.id === 'stats' && hasEspnSoccerTopScorers) {
                    return { ...tab, label: 'Goleadores' };
                }
                if (!isMotorsportTournament) return tab;
                if (tab.id === 'results') return { ...tab, label: 'Calendario' };
                if (tab.id === 'fixtures') return { ...tab, label: 'Proximas' };
                if (tab.id === 'standings') return { ...tab, label: 'Clasificacion' };
                if (tab.id === 'teams') return { ...tab, label: 'Equipos' };
                return tab;
            });

        // FWC26 mobile: drop the Summary tab and surface Standings first so users
        // land on the classification table directly.
        if (isFifaWorldCup && isPhoneViewport) {
            tabs = tabs.filter((t) => t.id !== 'summary');
            const idx = tabs.findIndex((t) => t.id === 'standings');
            if (idx > 0) {
                const [standings] = tabs.splice(idx, 1);
                tabs.unshift(standings);
            }
        }

        return tabs;
    }, [hasDedicatedPlayoffTab, hasEspnSoccerTopScorers, hasVisibleStandingsData, isLimitedExternalProvider, isEspnSoccerSource, isMotorsportTournament, shouldForceStandingsTabVisible, shouldUseIntegratedBracketView, isFifaWorldCup, isPhoneViewport]);

    useEffect(() => {
        if (navigationTabs.some((tab: { id: string; label: string }) => tab.id === activeTab)) return;
        setActiveTab(navigationTabs[0]?.id || 'summary');
    }, [activeTab, navigationTabs]);

    useEffect(() => {
        const availableViews = new Set<string>(['overall']);
        if (standingsForm.length > 0) availableViews.add('form');
        if (standingsOverUnder.length > 0) availableViews.add('overunder');
        if (standingsHtFt.length > 0) availableViews.add('htft');
        customStandingsTables.forEach((table: any) => {
            if (typeof table?.key === 'string' && table.key.trim()) {
                availableViews.add(table.key);
            }
        });

        if (!availableViews.has(standingsView)) {
            setStandingsView('overall');
        }
    }, [customStandingsTables, standingsForm.length, standingsHtFt.length, standingsOverUnder.length, standingsView]);

    const currentFlashScoreIds = (tournamentData as any)?.flashScoreIds;
    const externalSeasonOptions = useMemo(
        () => buildExternalSeasonOptions(
            archives,
            id,
            currentFlashScoreIds,
            routeSearch,
        ),
        [archives, id, routeSearch, currentFlashScoreIds],
    );
    const availableSeasonOptions =
        seasonOptions.length > 1 || externalSeasonOptions.length === 0
            ? seasonOptions
            : externalSeasonOptions;
    const currentSeasonOption = availableSeasonOptions.find((s) => s.isCurrent);

    if (loading) {
        return (
            <div className={styles.page}>
                <div className="g22-container">
                    <div className={styles.skeletonWrap} aria-busy="true" aria-label="Cargando torneo">
                        {/* Hero */}
                        <div className={styles.skeletonHero}>
                            <div className={`${styles.skeleton} ${styles.skLogo}`} />
                            <div className={styles.skHeroText}>
                                <div className={`${styles.skeleton} ${styles.skTitle}`} />
                                <div className={`${styles.skeleton} ${styles.skMeta}`} />
                            </div>
                        </div>
                        {/* Quick stats */}
                        <div className={styles.skeletonStats}>
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div key={i} className={`${styles.skeleton} ${styles.skStat}`} />
                            ))}
                        </div>
                        {/* Tabs */}
                        <div className={styles.skeletonTabs}>
                            {[64, 80, 72, 96, 64, 72].map((w, i) => (
                                <div key={i} className={`${styles.skeleton} ${styles.skTab}`} style={{ width: w }} />
                            ))}
                        </div>
                        {/* Content */}
                        <div className={styles.skeletonContent}>
                            <div className={styles.skeletonMain}>
                                <div className={`${styles.skeleton} ${styles.skFeatured}`} />
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className={`${styles.skeleton} ${styles.skRow}`} />
                                ))}
                            </div>
                            <div className={styles.skeletonSide}>
                                <div className={`${styles.skeleton} ${styles.skSideHead}`} />
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className={`${styles.skeleton} ${styles.skSideRow}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
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
        visibleStandingsScopeViews.some((view) => view.kind === 'global') ||
        tournamentData?.type === 'circuit' ||
        isCircuitTournamentRuleset(tournamentData?.ruleset),
    );
    const shouldUseStandingsScopeViews = isCircuitTournament || visibleStandingsScopeViews.length > 1 || hasDbKnockoutPhase;
    const selectedStandingsScopeView = shouldUseStandingsScopeViews && visibleStandingsScopeViews.length > 0
        ? (visibleStandingsScopeViews.find((view) => view.id === activeStandingsScope) || visibleStandingsScopeViews[0] || null)
        : null;
    const selectedCustomStandingsTable = !selectedStandingsScopeView && !isCircuitTournament
        ? (customStandingsTables.find((table: any) => table?.key === standingsView) || null)
        : null;
    const activeStandingsRenderer = selectedStandingsScopeView || isCircuitTournament
        ? 'standard'
        : selectedCustomStandingsTable?.source_key === 'standingsHtFt'
            ? 'htft'
            : selectedCustomStandingsTable?.source_key === 'standingsOverUnder'
                ? 'overunder'
                : standingsView === 'htft'
                    ? 'htft'
                    : standingsView === 'overunder'
                        ? 'overunder'
                        : 'standard';
    const isCircuitGlobalTable = selectedStandingsScopeView?.kind === 'global';
    const baseStandingsSource = selectedStandingsScopeView?.standings ?? standings;
    const overallRows = flattenStandingsRows(standings);
    const standingsSource = selectedStandingsScopeView
        ? baseStandingsSource
        : selectedCustomStandingsTable
            ? (Array.isArray(selectedCustomStandingsTable.standings) ? selectedCustomStandingsTable.standings : [])
            : standingsView === 'form'
            ? standingsForm
            : standingsView === 'htft'
                ? standingsHtFt
                : standingsView === 'overunder'
                    ? standingsOverUnder
                    : standings;
    const activeStandingsTeamLabels = selectedStandingsScopeView || isCircuitTournament
        ? dbTeamLabels
        : selectedCustomStandingsTable
            ? (Array.isArray(selectedCustomStandingsTable.teamLabels) ? selectedCustomStandingsTable.teamLabels : [])
            : standingsView === 'form'
                ? standingsFormTeamLabels
                : standingsView === 'htft'
                    ? standingsHtFtTeamLabels
                    : standingsView === 'overunder'
                        ? standingsOverUnderTeamLabels
                        : dbTeamLabels;
    const activeRows = normalizeStandingsRows(standingsSource);
    const activeFlatRows = flattenStandingsRows(standingsSource);
    const motorsportOverallGroups = isMotorsportTournament ? splitMotorsportStandingsRows(overallRows) : null;
    const motorsportActiveGroups = isMotorsportTournament ? splitMotorsportStandingsRows(activeFlatRows) : null;
    const motorsportDriverRows = isMotorsportTournament
        ? (motorsportActiveGroups?.drivers.length ? motorsportActiveGroups.drivers : motorsportActiveGroups?.ungrouped || [])
        : [];
    const motorsportTeamRows = isMotorsportTournament
        ? (motorsportActiveGroups?.teams || [])
        : [];
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
    const teamMap = new Map<string, { id: string | null; name: string; shortName: string | null; logo: string; href: string | null }>();
    const registerTeam = (team: { id?: string | number | null; name?: string | null; shortName?: string | null; logo?: string | null; teamUrl?: string | null; league?: string | null }) => {
        const name = String(team.name ?? '').trim();
        if (!name) return;

        const shortName = getExplicitExportShortName(team.shortName) || null;
        const normalizedId = team.id != null ? String(team.id) : null;
        const key = normalizedId ? `id:${normalizedId}` : `name:${name.toLowerCase()}`;
        const href = buildClubHref({ id: normalizedId, name, teamUrl: team.teamUrl, league: team.league }, tournamentData?.sportId);
        const previous = teamMap.get(key);

        teamMap.set(key, {
            id: previous?.id ?? normalizedId,
            name: previous?.name ?? name,
            shortName: previous?.shortName ?? shortName,
            logo: previous?.logo || team.logo || '',
            href: previous?.href ?? href,
        });
    };
    const addFromMatches = (list: any[]) => {
        list.forEach((match) => {
            registerTeam({
                id: match.home_team?.id || match.home_team?.team_id || match.home_club_id || null,
                name: match.home_team?.name || match.event_home_team || match.home_team_name,
                shortName: match.home_team?.short_name || match.home?.short_name || match.home_short_name || match.home_team_short_name || match.home_club_short_name || null,
                logo: getTeamLogo(match.home_team) || match.home_team_logo || '',
                teamUrl: match.home_team?.team_url || null,
                league: match.home_team?.league || null,
            });
            registerTeam({
                id: match.away_team?.id || match.away_team?.team_id || match.away_club_id || null,
                name: match.away_team?.name || match.event_away_team || match.away_team_name,
                shortName: match.away_team?.short_name || match.away?.short_name || match.away_short_name || match.away_team_short_name || match.away_club_short_name || null,
                logo: getTeamLogo(match.away_team) || match.away_team_logo || '',
                teamUrl: match.away_team?.team_url || null,
                league: match.away_team?.league || null,
            });
        });
    };
    overallRows.forEach((row: any) => {
        registerTeam({
            id: getStandingsTeamId(row),
            name: getStandingsTeamName(row),
            shortName: row.team?.short_name || row.club?.short_name || row.participant?.short_name || row.participant?.clubs?.short_name || row.short_name || null,
            logo: getStandingsTeamLogo(row),
            teamUrl: getStandingsTeamUrl(row),
            league: row.team?.league || row.participant?.league || null,
        });
    });
    dbParticipants.forEach((participant: any) => {
        const club = getParticipantClub(participant);
        registerTeam({
            id: participant.club_id || club?.id || null,
            name: club?.name || participant.name || '',
            shortName: club?.short_name || participant.short_name || null,
            logo: club?.logo_url || '',
            teamUrl: club?.team_url || null,
            league: club?.league || null,
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

    const rawSeasonId =
        (tournamentData as any)?.season_id ?? (initialData?.tournament as any)?.season_id ?? null;
    const dbSeasonYearHint =
        rawSeasonId != null && String(rawSeasonId).trim() ? String(rawSeasonId).trim() : null;
    const yearDisplayFromApi = details?.is_current
        ? (details?.season || 'Temporada Actual')
        : (details?.start_year && details?.end_year)
            ? `${details.start_year}/${details.end_year}`
            : (details?.season || renderYear);
    /* Prefer Supabase season for this page so the pill matches the title/breadcrumb; FlashScore `details.season` can be another edition. */
    const yearDisplay =
        (currentSeasonOption?.label && String(currentSeasonOption.label).trim()) ||
        dbSeasonYearHint ||
        yearDisplayFromApi;

    const countryName = resolveCountryName(details, tournamentData);
    const tournamentLogo = getTournamentLogo(details, tournamentData);
    const tournamentName = details?.name || details?.tournament?.name || tournamentData?.name || 'Torneo';
    const shouldShowTournamentLogo = Boolean(tournamentLogo) && !tournamentLogoFailed;
    const sportLabel = tournamentData?.sportId ? tournamentData.sportId.charAt(0).toUpperCase() + tournamentData.sportId.slice(1) : '';
    const standingsEntityLabel = isMotorsportTournament ? 'Piloto' : 'Equipo';
    const summaryResultsTitle = isMotorsportTournament ? 'Ultimas carreras' : 'Últimos Resultados';
    const summaryFixturesTitle = isMotorsportTournament ? 'Proximos eventos' : 'Próximos Partidos';
    const resultsPageTitle = isMotorsportTournament ? 'Calendario de la temporada' : 'Resultados';
    const fixturesPageTitle = isMotorsportTournament ? 'Proximas carreras' : 'Fixture';
    const standingsCardTitle = isMotorsportTournament ? 'Pilotos' : 'Posiciones';
    const infoParticipantsLabel = isMotorsportTournament ? 'Competidores' : 'Equipos';
    const isSuperAdminUser = !authLoading && canUseRestrictedContentActions(user?.role);
    const isExactSuperAdmin = isSuperAdminUser;
    const externalTournamentOverrideId = resolveExternalTournamentId({
        routeId: id,
        externalId: tournamentData?.externalId ?? tournamentData?.external_id,
        sportId: tournamentData?.sportId ?? tournamentData?.sport_id,
        ruleset: tournamentData?.ruleset,
        flashScoreIds: tournamentData?.flashScoreIds,
    });
    const adminTournamentId = (() => {
        const candidate = String((initialData?.tournament as any)?.id || tournamentData?.id || '').trim();
        return UUID_RE.test(candidate) ? candidate : null;
    })();

    const favoriteTournamentId = id;
    const externalTournamentEditorHref = (() => {
        if (!externalTournamentOverrideId) return null;

        const query = new URLSearchParams();
        const returnParams = new URLSearchParams();
        const resolvedSport = tournamentData?.sportId || 'rugby';
        const resolvedUrl = details?.url || tournamentData?.url || '';

        if (resolvedSport) {
            query.set('sport', resolvedSport);
            returnParams.set('sport', resolvedSport);
        }
        if (resolvedUrl) query.set('url', resolvedUrl);
        if (countryName) query.set('country', countryName);
        if (tournamentData?.countryId) query.set('country_id', tournamentData.countryId);
        if (tournamentName) query.set('name', tournamentName);

        query.set('returnTo', `/tournaments/${id}${returnParams.toString() ? `?${returnParams.toString()}` : ''}`);
        return `/admin/super/torneos/externos/${encodeURIComponent(externalTournamentOverrideId)}?${query.toString()}`;
    })();
    const bracketPhase = preferredKnockoutPhase ?? activeDbPhase;
    const bracketTitle = `${getKnockoutPhaseDisplayTitle(bracketPhase)} - ${tournamentName}`;
    const bracketExportData = {
        title: bracketTitle,
        subtitle: bracketPhase?.name || details?.season || 'Cuadro eliminatorio',
        tournamentLogo,
        rounds: draw,
    };

    // Quick stats
    const stats = getQuickStats(results, fixtures, overallRows, teamsList.length);

    // Status
    const tournamentStatus = getTournamentStatus(details);

    // Featured match
    const featured = getFeaturedMatch(results, fixtures);
    const motorsportSeasonYear = isMotorsportTournament ? getMotorsportSeasonYear(details, yearDisplay) : null;
    const motorsportSeasonEvents = isMotorsportTournament
        ? [...results, ...fixtures]
            .filter((match: any) => {
                if (!motorsportSeasonYear) return true;
                const timestamp = Number(match?.timestamp || match?.start_time || match?.time || 0);
                if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
                return new Date(timestamp * 1000).getUTCFullYear() === motorsportSeasonYear;
            })
            .sort((left: any, right: any) => (left.timestamp || 0) - (right.timestamp || 0))
        : [];
    const motorsportCompletedEvents = isMotorsportTournament
        ? motorsportSeasonEvents.filter((match: any) => getMotorsportEventStatusLabel(match) === 'Finalizado')
        : [];
    const motorsportUpcomingEvents = isMotorsportTournament
        ? motorsportSeasonEvents.filter((match: any) => getMotorsportEventStatusLabel(match) !== 'Finalizado')
        : [];
    const motorsportLiveEvent = isMotorsportTournament
        ? motorsportSeasonEvents.find((match: any) => getMotorsportEventStatusLabel(match) === 'Live') || null
        : null;
    const motorsportLastEvent = motorsportCompletedEvents.length > 0 ? motorsportCompletedEvents[motorsportCompletedEvents.length - 1] : null;
    const motorsportNextEvent = motorsportUpcomingEvents.length > 0 ? motorsportUpcomingEvents[0] : null;
    const motorsportSeasonLeader = isMotorsportTournament
        ? (motorsportOverallGroups?.drivers[0] || motorsportOverallGroups?.ungrouped[0] || null)
        : null;
    const motorsportConstructorsLeader = isMotorsportTournament
        ? (motorsportOverallGroups?.teams[0] || null)
        : null;
    const motorsportCurrentRound = motorsportLiveEvent
        ? getMotorsportRoundNumber(motorsportLiveEvent, motorsportSeasonEvents.indexOf(motorsportLiveEvent))
        : motorsportNextEvent
            ? getMotorsportRoundNumber(motorsportNextEvent, motorsportSeasonEvents.indexOf(motorsportNextEvent))
            : motorsportLastEvent
                ? getMotorsportRoundNumber(motorsportLastEvent, motorsportSeasonEvents.indexOf(motorsportLastEvent))
                : null;
    const motorsportTotalRounds = motorsportSeasonEvents.length;

    // Standings preview (top 8 flat rows only)
    const standingsPreviewRows: any[] = shouldUseIntegratedBracketView
        ? []
        : isMotorsportTournament
            ? (motorsportOverallGroups?.drivers.length
                ? motorsportOverallGroups.drivers.slice(0, 8)
                : (motorsportOverallGroups?.ungrouped || []).slice(0, 8))
            : overallRows.slice(0, 8);
    // For grouped standings (e.g. World Cup), keep group separation in the sidebar preview.
    const standingsPreviewGroups: Array<{ name: string | null; rows: any[] }> = (() => {
        if (shouldUseIntegratedBracketView || isMotorsportTournament) return [];
        if (!isGroupedStandingsData(standings)) return [];
        const out: Array<{ name: string | null; rows: any[] }> = [];
        let remaining = 8;
        for (const group of standings) {
            if (remaining <= 0) break;
            const rows = Array.isArray(group?.rows) ? group.rows : [];
            if (rows.length === 0) continue;
            const slice = rows.slice(0, remaining);
            out.push({ name: group?.group_name || group?.name || null, rows: slice });
            remaining -= slice.length;
        }
        return out;
    })();
    const motorsportStandingsRows = isMotorsportTournament
        ? (motorsportDriverRows.length > 0 ? motorsportDriverRows : activeFlatRows)
        : [];
    const motorsportDriverRaceColumns = isMotorsportTournament ? collectMotorsportRaceColumns(motorsportStandingsRows) : [];
    const motorsportTeamRaceColumns = isMotorsportTournament ? collectMotorsportRaceColumns(motorsportTeamRows) : [];
    const motorsportLeaders = standingsPreviewRows.slice(0, 3);
    const standingsLegendItems = collectStandingsLegendItems(activeFlatRows, activeStandingsTeamLabels);
    const standingsPreviewLegendItems = collectStandingsLegendItems(standingsPreviewRows, activeStandingsTeamLabels);
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
        const rowLabel = resolveStandingsRowLabel(row, activeStandingsTeamLabels);
        const goalDifference =
            typeof row.goal_difference === 'number'
                ? row.goal_difference
                : (typeof row.goals_for === 'number' && typeof row.goals_against === 'number')
                    ? row.goals_for - row.goals_against
                    : 0;

        if (standingsColumnMode === 'circuit-global') {
            return {
                pos: row.position || (idx + 1),
                team: getPreferredExportTeamName(
                    getStandingsTeamName(row) || 'Equipo',
                    row.team?.short_name,
                    row.team?.shortName,
                    row.club?.short_name,
                    row.club?.shortName,
                    row.participant?.short_name,
                    row.participant?.shortName,
                    row.participant?.clubs?.short_name,
                    row.participant?.clubs?.shortName,
                    row.short_name,
                    row.shortName,
                    fallbackTeam?.shortName,
                ),
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
            team: getPreferredExportTeamName(
                getStandingsTeamName(row) || 'Equipo',
                row.team?.short_name,
                row.team?.shortName,
                row.club?.short_name,
                row.club?.shortName,
                row.participant?.short_name,
                row.participant?.shortName,
                row.participant?.clubs?.short_name,
                row.participant?.clubs?.shortName,
                row.short_name,
                row.shortName,
                fallbackTeam?.shortName,
            ),
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
    const motorsportStandingsExportRows = motorsportStandingsRows.map((row: any, idx: number) => mapStandingsRowForExport(row, idx));
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

    const buildDailyMatchesExportData = (mode: 'results' | 'fixtures') => {
        const sourceMatches = mode === 'results' ? results : fixtures;
        const dateLabel = mode === 'results' ? details?.season || 'Resultados' : 'Proximos Partidos';

        return {
            date: dateLabel,
            tournament: tournamentData?.name || 'Torneo',
            tournamentLogo,
            matches: sourceMatches.map((match: any) => {
                const timestamp = match.timestamp || match.start_time || match.time;
                const matchDate = timestamp ? new Date(timestamp * 1000) : null;
                const dateOnlyLabel = matchDate
                    ? formatArgentinaDate(matchDate, { day: '2-digit', month: '2-digit' })
                    : '';
                const kickoffTimeLabel = matchDate
                    ? formatArgentinaDate(matchDate, { hour: '2-digit', minute: '2-digit', hour12: false })
                    : '';

                return {
                    homeTeam: getMatchExportTeamName(match, 'home'),
                    awayTeam: getMatchExportTeamName(match, 'away'),
                    homeLogo: getTeamLogo(match.home_team) || match.home_team_logo || '',
                    awayLogo: getTeamLogo(match.away_team) || match.away_team_logo || '',
                    homeScore: mode === 'results'
                        ? match.scores?.home ?? match.scores?.home_score ?? match.home_score
                        : undefined,
                    awayScore: mode === 'results'
                        ? match.scores?.away ?? match.scores?.away_score ?? match.away_score
                        : undefined,
                    time: mode === 'results' ? dateOnlyLabel : `${kickoffTimeLabel} ${dateOnlyLabel}`.trim(),
                    status: mode === 'results' ? 'finished' as const : 'scheduled' as const,
                    dateLabel: matchDate
                        ? formatArgentinaDate(matchDate, { weekday: 'short', day: '2-digit', month: '2-digit' })
                        : '',
                    kickoffAt: matchDate ? matchDate.toISOString() : undefined,
                };
            }),
        };
    };

    const renderMobileHeroExport = () => {
        if (activeTab === 'results') {
            return (
                <ExportImage
                    className={styles.mobileHeroExportAction}
                    template="dailyMatches"
                    filename={`resultados-${tournamentData?.name}`}
                    data={buildDailyMatchesExportData('results')}
                />
            );
        }

        if (activeTab === 'fixtures') {
            return (
                <ExportImage
                    className={styles.mobileHeroExportAction}
                    template="dailyMatches"
                    filename={`fixture-${tournamentData?.name}`}
                    data={buildDailyMatchesExportData('fixtures')}
                />
            );
        }

        if ((activeTab === 'playoff' && hasDedicatedPlayoffTab) || (activeTab === 'standings' && shouldUseIntegratedBracketView)) {
            return (
                <ExportImage
                    className={styles.mobileHeroExportAction}
                    template="playoffBracket"
                    filename={`cuadro-${tournamentData?.name}`}
                    data={bracketExportData}
                />
            );
        }

        if (activeTab === 'standings') {
            return (
                <ExportImage
                    className={styles.mobileHeroExportAction}
                    template="standings"
                    filename={`tabla-${tournamentData?.name}`}
                    data={{
                        title: tournamentData?.name || 'Tabla de Posiciones',
                        subtitle: selectedStandingsScopeView?.subtitle || details?.season || 'Clasificacion',
                        tournamentLogo,
                        rows: isMotorsportTournament ? motorsportStandingsExportRows : standingsExportRows,
                        groups: isMotorsportTournament ? [] : standingsExportGroups,
                        columnLabels: standingsExportColumnLabels,
                        plainDiff: standingsColumnMode === 'circuit-global',
                        showPositionDelta: false,
                    }}
                />
            );
        }

        return null;
    };

    // ── Render helpers ────────────────────────────────────────────────────

    const renderMatchItem = (match: any, isResult: boolean, index: number) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const timeStr = date ? formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const dateStr = date ? formatArgentinaDate(date, { day: '2-digit', month: '2-digit' }) : '';

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;

        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Local';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante';
        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';

        const isLive = match.status === 'live' || match.status === 'in_play';
        const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;
        // Only treat as scored when the match was actually played — otherwise a default 0
        // from the API renders "0 - 0" on upcoming fixtures.
        const hasScore = (isFinished || isLive) && scoreHome !== undefined && scoreHome !== null;

        const homeWon = hasScore && typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreHome > scoreAway;
        const awayWon = hasScore && typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreAway > scoreHome;

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

                {/* Score / time box */}
                <div className={styles.matchScoreBox}>
                    {hasScore ? (
                        <span className={styles.matchScore}>{scoreHome} - {scoreAway}</span>
                    ) : isLive ? (
                        <span className={styles.matchVS}>VS</span>
                    ) : timeStr ? (
                        <span className={styles.matchKickoffTime}>{timeStr}</span>
                    ) : (
                        <span className={styles.matchVS}>VS</span>
                    )}
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

    const renderMotorsportMatchItem = (match: any, isResult: boolean, index: number) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const isLive = match.status === 'live' || match.status === 'in_play';
        const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;
        const eventTitle = match.event_name || match.tournament_name_short || match.tournament_name || tournamentName || 'Evento';
        const venue = match.venue || match.country_name || countryName || '';
        const dateLabel = date ? formatArgentinaDate(date, { weekday: 'short', day: '2-digit', month: 'short' }) : '';
        const timeLabel = date ? formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const primaryName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Competidor 1';
        const secondaryName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Competidor 2';
        const primaryLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const secondaryLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
        const statusLabel = isLive ? 'En vivo' : isFinished ? 'Finalizada' : 'Programada';
        const footerLabel = isLive ? 'Telemetry' : isFinished ? 'Resultados' : 'Event details';

        return (
            <Link
                href={`/matches/${match.event_key || match.match_id || 'unknown'}`}
                key={getMatchRenderKey(match, index)}
                className={styles.motorsportEventRow}
            >
                <div className={styles.motorsportEventTop}>
                    <div className={styles.motorsportEventHeader}>
                        <span className={styles.motorsportEventSeriesBadge}>{match.tournament_name_short || tournamentName}</span>
                        <h3 className={styles.motorsportEventTitle}>{eventTitle}</h3>
                        <div className={styles.motorsportEventMeta}>
                            {dateLabel && <span>{dateLabel}</span>}
                            {timeLabel && <span>{timeLabel} hs</span>}
                            {venue && <span>{venue}</span>}
                        </div>
                    </div>
                    <span className={`${styles.motorsportEventStatus} ${isLive ? styles.motorsportEventStatusLive : ''}`}>
                        {statusLabel}
                    </span>
                </div>
                <div className={styles.motorsportEventCompetitors}>
                    <div className={styles.motorsportEventCompetitor}>
                        {primaryLogo
                            ? <img src={primaryLogo} alt={primaryName} className={styles.motorsportEventCompetitorLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            : <div className={styles.motorsportEventCompetitorPlaceholder}>{primaryName[0]}</div>}
                        <span className={styles.motorsportEventCompetitorName}>{primaryName}</span>
                    </div>
                    <div className={styles.motorsportEventCompetitorDivider}>•</div>
                    <div className={styles.motorsportEventCompetitor}>
                        {secondaryLogo
                            ? <img src={secondaryLogo} alt={secondaryName} className={styles.motorsportEventCompetitorLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            : <div className={styles.motorsportEventCompetitorPlaceholder}>{secondaryName[0]}</div>}
                        <span className={styles.motorsportEventCompetitorName}>{secondaryName}</span>
                    </div>
                </div>
                <div className={styles.motorsportEventFooter}>
                    <span className={styles.motorsportEventFooterLabel}>{footerLabel}</span>
                    <span className={styles.motorsportEventFooterAction}>Open</span>
                </div>
            </Link>
        );
    };

    const renderMotorsportMatchItemV2 = (match: any, isResult: boolean, index: number) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const isLive = match.status === 'live' || match.status === 'in_play';
        const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;
        const eventTitle = match.event_name || match.tournament_name_short || match.tournament_name || tournamentName || 'Evento';
        const venue = match.venue || match.country_name || countryName || '';
        const dateLabel = date ? formatArgentinaDate(date, { weekday: 'short', day: '2-digit', month: 'short' }) : '';
        const timeLabel = date ? formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const primaryName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Competidor 1';
        const secondaryName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Competidor 2';
        const primaryLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const secondaryLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
        const statusLabel = isLive ? 'En vivo' : isFinished ? 'Finalizada' : 'Programada';
        const footerLabel = match.session_label || 'Carrera';
        const podiumSource = Array.isArray(match.podium) && match.podium.length > 0
            ? match.podium.slice(0, 3)
            : [
                { position: 1, name: primaryName, logo: primaryLogo, countryName: null },
                { position: 2, name: secondaryName, logo: secondaryLogo, countryName: null },
            ];
        const shadeClass = Math.floor(index / 2) % 2 === 1 ? styles.motorsportEventRowAlt : '';

        return (
            <Link
                href={`/matches/${match.event_key || match.match_id || 'unknown'}`}
                key={`${getMatchRenderKey(match, index)}-podium`}
                className={`${styles.motorsportEventRow} ${shadeClass}`}
            >
                <div className={styles.motorsportEventTop}>
                    <div className={styles.motorsportEventHeader}>
                        <span className={styles.motorsportEventSeriesBadge}>{match.tournament_name_short || tournamentName}</span>
                        <h3 className={styles.motorsportEventTitle}>{eventTitle}</h3>
                        <div className={styles.motorsportEventMeta}>
                            {dateLabel && <span>{dateLabel}</span>}
                            {timeLabel && <span>{timeLabel} hs</span>}
                            {venue && <span>{venue}</span>}
                        </div>
                    </div>
                    <span className={`${styles.motorsportEventStatus} ${isLive ? styles.motorsportEventStatusLive : ''}`}>
                        {statusLabel}
                    </span>
                </div>
                <div className={styles.motorsportPodiumList}>
                    {podiumSource.map((driver: any, podiumIndex: number) => {
                        const driverName = driver?.name || `Competidor ${podiumIndex + 1}`;
                        const driverLogo = driver?.logo || '';
                        const driverFlag = getCountryFlagByName(driver?.countryName);
                        const position = Number(driver?.position || podiumIndex + 1);

                        return (
                            <div key={`${driverName}-${position}-${podiumIndex}`} className={styles.motorsportPodiumRow}>
                                <span className={`${styles.motorsportPodiumPos} ${position === 1 ? styles.motorsportPodiumPosP1 : position === 2 ? styles.motorsportPodiumPosP2 : styles.motorsportPodiumPosP3}`}>
                                    {position}
                                </span>
                                <div className={styles.motorsportPodiumIdentity}>
                                    {driverLogo
                                        ? <img src={driverLogo} alt={driverName} className={styles.motorsportEventCompetitorLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                        : <div className={styles.motorsportEventCompetitorPlaceholder}>{driverName[0]}</div>}
                                    <div className={styles.motorsportPodiumMeta}>
                                        <span className={styles.motorsportEventCompetitorName}>{driverName}</span>
                                        {driverFlag && <span className={styles.motorsportPodiumFlag}>{driverFlag}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className={styles.motorsportEventFooter}>
                    <span className={styles.motorsportEventFooterLabel}>{footerLabel}</span>
                    <span className={styles.motorsportEventFooterAction}>Open</span>
                </div>
            </Link>
        );
    };

    const renderStandingsHeader = (columns = standingsColumns, entityLabel = standingsEntityLabel) => (
        <div className={styles.tableHeader}>
            <div className={styles.colPos}>#</div>
            <div className={styles.colTeam}>{entityLabel}</div>
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
            league: row.team?.league || row.participant?.league || null,
        }, tournamentData?.sportId);
        const rowLabel = resolveStandingsRowLabel(row, activeStandingsTeamLabels);
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
                        ? <>
                            <img
                                src={logo}
                                alt={teamName}
                                className={styles.teamLogo}
                                onLoad={handleTeamLogoLoad}
                                onError={handleTeamLogoError}
                            />
                            <div className={styles.teamLogoPlaceholder} style={{ display: 'none' }} />
                        </>
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
        const shortDateStr = date ? formatArgentinaDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;
        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Local';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante';
        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
        const isLive = match.status === 'live' || match.status === 'in_play';
        // Only treat as scored when the match is actually played/live — otherwise a default 0 from the
        // API renders "0 - 0" on an upcoming fixture.
        const hasScore = (isResult || isLive)
            && scoreHome !== undefined && scoreHome !== null && scoreHome !== '-';

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
                                <div className={styles.featuredKickoff}>
                                    {shortDateStr && (
                                        <span className={styles.featuredKickoffDate}>{shortDateStr}</span>
                                    )}
                                    {timeStr && (
                                        <span className={styles.featuredKickoffTime}>{timeStr} hs</span>
                                    )}
                                    {!shortDateStr && !timeStr && (
                                        <span className={styles.featuredVS}>VS</span>
                                    )}
                                </div>
                            )}
                        </div>
                        {hasScore && !isLive && (
                            <span className={styles.featuredScoreTime}>FT</span>
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

    const renderMotorsportFeaturedEvent = () => {
        if (!featured) return null;
        const { match, isResult } = featured;
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const isLive = match.status === 'live' || match.status === 'in_play';
        const badgeLabel = isLive ? 'Carrera en vivo' : isResult ? 'Resultado oficial' : 'Proxima carrera';
        const eventTitle = match.event_name || match.tournament_name_short || match.tournament_name || tournamentName || 'Evento';
        const venue = match.venue || match.country_name || countryName || '';
        const dateLabel = date ? formatArgentinaDate(date, { weekday: 'long', day: '2-digit', month: 'long' }) : '';
        const timeLabel = date ? formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const primaryName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Competidor 1';
        const secondaryName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Competidor 2';
        const primaryLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const secondaryLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
        const telemetrySource = motorsportLeaders.length > 0
            ? motorsportLeaders.slice(0, 3).map((row: any, idx: number) => ({
                position: row.position || idx + 1,
                name: getStandingsTeamName(row),
                logo: getStandingsTeamLogo(row) || '',
                points: Number(row.points_total ?? row.points ?? 0),
            }))
            : [
                { position: 1, name: primaryName, logo: primaryLogo, points: null },
                { position: 2, name: secondaryName, logo: secondaryLogo, points: null },
            ];
        const leaderPoints = typeof telemetrySource[0]?.points === 'number' ? telemetrySource[0].points : null;
        const statusMetric = match.session_label || 'Carrera';
        const flagMetric = isLive ? 'En vivo' : isResult ? 'Finalizada' : 'Programada';
        const footerPrimary = 'Evento';
        const footerPrimaryState = isResult || isLive ? 'completed' : 'pending';
        const footerRaceState = isLive ? 'active' : isResult ? 'completed' : 'pending';

        return (
            <div className={styles.motorsportFeaturedCard}>
                <div className={styles.motorsportFeaturedFrame} aria-hidden="true" />
                <div className={styles.motorsportFeaturedHeader}>
                    <div className={styles.motorsportFeaturedHeaderLeft}>
                        <span className={styles.motorsportSeriesBadge}>{match.tournament_name_short || tournamentName}</span>
                    </div>
                    <div className={styles.motorsportLiveStatus}>
                        <span className={`${styles.motorsportLiveDot} ${isLive ? styles.motorsportLiveDotActive : ''}`} />
                        <span>{badgeLabel}</span>
                    </div>
                </div>
                <div className={styles.motorsportFeaturedBody}>
                    <div className={styles.motorsportFeaturedMain}>
                        <div className={styles.motorsportFeaturedVenue}>{venue || match.tournament_name || tournamentName}</div>
                        <h2 className={styles.motorsportFeaturedTitle}>{eventTitle}</h2>
                        <div className={styles.motorsportFeaturedMeta}>
                            {dateLabel && <span style={{ textTransform: 'capitalize' }}>{dateLabel}</span>}
                            {timeLabel && <span>{timeLabel} hs</span>}
                        </div>
                        <div className={styles.motorsportMetricsRow}>
                            <div className={styles.motorsportMetricItem}>
                                <span className={styles.motorsportMetricLabel}>Status</span>
                                <span className={styles.motorsportMetricValue}>{statusMetric}</span>
                            </div>
                            <div className={styles.motorsportMetricItem}>
                                <span className={styles.motorsportMetricLabel}>Flag</span>
                                <span className={`${styles.motorsportMetricValue} ${isLive ? styles.motorsportMetricValueAccent : ''}`}>{flagMetric}</span>
                            </div>
                            <div className={styles.motorsportMetricItem}>
                                <span className={styles.motorsportMetricLabel}>Leader</span>
                                <span className={styles.motorsportMetricValue}>{telemetrySource[0]?.name || primaryName}</span>
                            </div>
                        </div>
                        <div className={styles.motorsportTelemetryGrid}>
                            <div className={styles.motorsportTelemetryHeader}>
                                <span>Pos</span>
                                <span>Driver</span>
                                <span>Gap</span>
                            </div>
                            {telemetrySource.map((row) => {
                                const gapLabel = row.position === 1
                                    ? 'Leader'
                                    : leaderPoints != null && typeof row.points === 'number'
                                        ? `-${Math.max(leaderPoints - row.points, 0)} pts`
                                        : 'Tracking';
                                const posClassName = [
                                    styles.motorsportTelemetryPos,
                                    row.position === 1 ? styles.motorsportTelemetryPosP1 : '',
                                    row.position === 2 ? styles.motorsportTelemetryPosP2 : '',
                                    row.position === 3 ? styles.motorsportTelemetryPosP3 : '',
                                ].filter(Boolean).join(' ');

                                return (
                                    <div key={`${row.position}-${row.name}`} className={styles.motorsportTelemetryRow}>
                                        <span className={posClassName}>{String(row.position).padStart(2, '0')}</span>
                                        <div className={styles.motorsportTelemetryDriver}>
                                            {row.logo
                                                ? <img src={row.logo} alt={row.name} className={styles.motorsportTelemetryLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                : <div className={styles.motorsportTelemetryLogoFallback}>{row.name[0]}</div>}
                                            <span className={styles.motorsportTelemetryName}>{row.name}</span>
                                        </div>
                                        <span className={styles.motorsportTelemetryGap}>{gapLabel}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className={styles.motorsportFeaturedFooter}>
                        <div className={styles.motorsportSessionsTimeline}>
                            <div className={`${styles.motorsportSession} ${footerPrimaryState === 'completed' ? styles.motorsportSessionCompleted : ''}`}>
                                <span className={styles.motorsportSessionIcon}>{footerPrimaryState === 'completed' ? 'OK' : '...'}</span>
                                <span>{footerPrimary}</span>
                            </div>
                            <div className={`${styles.motorsportSession} ${footerRaceState === 'active' ? styles.motorsportSessionActive : ''} ${footerRaceState === 'completed' ? styles.motorsportSessionCompleted : ''}`}>
                                <span className={styles.motorsportSessionIcon}>{footerRaceState === 'active' ? 'ON' : footerRaceState === 'completed' ? 'OK' : '...'}</span>
                                <span>Race</span>
                            </div>
                        </div>
                        <button type="button" className={styles.motorsportActionBtn} onClick={() => setActiveTab('standings')}>
                            Event details
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderMotorsportStandingsTable = (
        rows: any[],
        options: { entityLabel: string; detailLabel: string; compact?: boolean; emptyLabel: string; raceColumns?: Array<{ key: string; label: string }> },
    ) => {
        const limitedRows = options.compact ? rows.slice(0, 5) : rows;
        const leaderPoints = Number(limitedRows[0]?.points_total ?? limitedRows[0]?.points ?? 0);
        const raceColumns = options.compact ? [] : (options.raceColumns || []);
        const gridTemplateColumns = `48px minmax(0, 1.35fr) minmax(110px, 0.95fr) 70px 70px${raceColumns.map(() => ' 60px').join('')}`;

        if (limitedRows.length === 0) {
            return <p className={styles.emptyState}>{options.emptyLabel}</p>;
        }

        return (
            <div className={styles.tableScroll}>
                <div className={styles.motorsportStandingsTable}>
                <div className={styles.motorsportStandingsHeader} style={{ gridTemplateColumns }}>
                    <span>Pos</span>
                    <span>{options.entityLabel}</span>
                    <span>{options.detailLabel}</span>
                    <span>Pts</span>
                    <span>Dif</span>
                    {raceColumns.map((column) => (
                        <span key={`head-${column.key}`}>{column.label}</span>
                    ))}
                </div>
                {limitedRows.map((row: any, idx: number) => {
                    const points = Number(row.points_total ?? row.points ?? 0);
                    const diff = idx === 0 || !Number.isFinite(leaderPoints) ? '—' : `-${Math.max(leaderPoints - points, 0)}`;
                    const detail = row.team?.affiliation_name || row.participant?.affiliation_name || row.affiliation_name || '—';
                    const flagAsset = getStandingsCountryFlagAsset(row);
                    const flag = getCountryFlagByName(row.country_name || row.team?.country_name || row.participant?.country_name);
                    const logo = getStandingsTeamLogo(row);
                    const position = row.position || (idx + 1);
                    const racePoints = new Map(
                        (Array.isArray(row.race_points) ? row.race_points : []).map((item: any) => [String(item?.key || ''), item?.value ?? '—']),
                    );

                    return (
                        <div
                            key={`${options.entityLabel}-${position}-${getStandingsTeamName(row)}`}
                            className={styles.motorsportStandingsDataRow}
                            style={{ gridTemplateColumns }}
                        >
                            <span className={styles.motorsportStandingsPos}>{position}</span>
                            <div className={styles.motorsportStandingsIdentity}>
                                {logo
                                    ? <img src={logo} alt={getStandingsTeamName(row)} className={styles.motorsportStandingsLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    : <div className={styles.motorsportStandingsLogoFallback}>{getStandingsTeamName(row)[0]}</div>}
                                <div className={styles.motorsportStandingsIdentityMeta}>
                                    <div className={styles.motorsportStandingsIdentityTop}>
                                        <span className={styles.motorsportStandingsName}>{getStandingsTeamName(row)}</span>
                                        {flagAsset
                                            ? <img src={flagAsset} alt={row.country_name || 'Bandera'} className={styles.motorsportStandingsFlagIcon} />
                                            : flag
                                                ? <span className={styles.motorsportStandingsFlag}>{flag}</span>
                                                : null}
                                    </div>
                                    <span className={styles.motorsportStandingsIdentitySubline}>
                                        {detail} · {points} pts
                                    </span>
                                </div>
                            </div>
                            <span className={styles.motorsportStandingsDetail}>{detail}</span>
                            <span className={styles.motorsportStandingsPoints}>{points}</span>
                            <span className={styles.motorsportStandingsDiff}>{diff}</span>
                            {raceColumns.map((column) => (
                                <span key={`${position}-${column.key}`} className={styles.motorsportStandingsRaceValue}>
                                    {String(racePoints.get(column.key) ?? '—')}
                                </span>
                            ))}
                        </div>
                    );
                })}
                </div>
            </div>
        );
    };

    const renderMotorsportSeasonCalendarItem = (match: any, index: number) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const roundNumber = getMotorsportRoundNumber(match, index);
        const statusLabel = getMotorsportEventStatusLabel(match);
        const winnerName = Array.isArray(match.podium) && match.podium[0]?.name ? match.podium[0].name : null;
        const eventTitle = match.event_name || match.tournament_name_short || tournamentName || 'Gran Premio';
        const href = `/matches/${match.event_key || match.match_id || 'unknown'}`;

        return (
            <Link key={`${href}-${roundNumber}`} href={href} className={styles.motorsportSeasonCalendarItem}>
                <div className={styles.motorsportSeasonRound}>R{roundNumber}</div>
                <div className={styles.motorsportSeasonCalendarMain}>
                    <div className={styles.motorsportSeasonCalendarTitleRow}>
                        <h3 className={styles.motorsportSeasonCalendarTitle}>{eventTitle}</h3>
                        <span className={`${styles.motorsportSeasonCalendarStatus} ${statusLabel === 'Live' ? styles.motorsportSeasonCalendarStatusLive : statusLabel === 'Finalizado' ? styles.motorsportSeasonCalendarStatusDone : ''}`}>
                            {statusLabel}
                        </span>
                    </div>
                    <div className={styles.motorsportSeasonCalendarMeta}>
                        {match.venue && <span>{match.venue}</span>}
                        {date && <span>{formatArgentinaDate(date, { day: '2-digit', month: 'short' })}</span>}
                        {date && <span>{formatArgentinaDate(date, { hour: '2-digit', minute: '2-digit', hour12: false })} hs</span>}
                    </div>
                    {winnerName && statusLabel === 'Finalizado' && (
                        <div className={styles.motorsportSeasonCalendarWinner}>Ganador: {winnerName}</div>
                    )}
                </div>
            </Link>
        );
    };

    const renderMotorsportSeasonHero = () => {
        const leaderName = motorsportSeasonLeader ? getStandingsTeamName(motorsportSeasonLeader) : '—';
        const leaderPoints = motorsportSeasonLeader ? Number(motorsportSeasonLeader.points_total ?? motorsportSeasonLeader.points ?? 0) : null;
        const lastWinner = motorsportLastEvent?.podium?.[0]?.name || null;
        const nextDate = motorsportNextEvent?.timestamp
            ? new Date(motorsportNextEvent.timestamp * 1000)
            : null;

        return (
            <div className={styles.motorsportSeasonHero}>
                <div className={styles.motorsportSeasonHeroHeader}>
                    <div>
                        <span className={styles.motorsportSeasonHeroEyebrow}>Campeonato</span>
                        <h2 className={styles.motorsportSeasonHeroTitle}>{tournamentName} - {yearDisplay || 'Temporada'}</h2>
                    </div>
                    <span className={styles.motorsportSeasonHeroStatus}>
                        {tournamentStatus === 'active' ? 'En curso' : tournamentStatus === 'finished' ? 'Finalizado' : 'Proximo'}
                    </span>
                </div>
                <div className={styles.motorsportSeasonHeroGrid}>
                    <div className={styles.motorsportSeasonHeroLeader}>
                        <span className={styles.motorsportSeasonHeroLabel}>Lider del campeonato</span>
                        <strong className={styles.motorsportSeasonHeroLeaderName}>{leaderName}</strong>
                        <span className={styles.motorsportSeasonHeroLeaderPts}>{leaderPoints != null ? `${leaderPoints} pts` : 'Sin puntos'}</span>
                    </div>
                    <div className={styles.motorsportSeasonHeroStats}>
                        <div className={styles.motorsportSeasonHeroStat}>
                            <span className={styles.motorsportSeasonHeroLabel}>Ronda actual</span>
                            <strong>{motorsportCurrentRound != null ? `Ronda ${motorsportCurrentRound} de ${motorsportTotalRounds}` : 'Sin definir'}</strong>
                        </div>
                        <div className={styles.motorsportSeasonHeroStat}>
                            <span className={styles.motorsportSeasonHeroLabel}>Ultimo GP</span>
                            <strong>{motorsportLastEvent?.event_name || 'Sin carrera previa'}</strong>
                            {lastWinner && <span className={styles.motorsportSeasonHeroSub}>Ganador: {lastWinner}</span>}
                        </div>
                        <div className={styles.motorsportSeasonHeroStat}>
                            <span className={styles.motorsportSeasonHeroLabel}>Proximo GP</span>
                            <strong>{motorsportNextEvent?.event_name || 'Calendario completo'}</strong>
                            {nextDate && <span className={styles.motorsportSeasonHeroSub}>{formatArgentinaDate(nextDate, { day: '2-digit', month: 'long' })} - {formatArgentinaDate(nextDate, { hour: '2-digit', minute: '2-digit', hour12: false })} hs</span>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderCompetitionCard = () => (
        isMotorsportTournament ? renderMotorsportFeaturedEvent() : renderFeaturedMatch()
    );

    const renderCompetitionItem = (match: any, isResult: boolean, index: number) => (
        isMotorsportTournament ? renderMotorsportMatchItemV2(match, isResult, index) : renderMatchItem(match, isResult, index)
    );

    const formatDayDividerLabel = (date: Date | null, dayKey: string): string => {
        if (!date) return 'Sin fecha';
        const yesterdayKey = addDaysToIsoDate(renderTodayKey, -1);
        const tomorrowKey = addDaysToIsoDate(renderTodayKey, 1);
        let prefix = '';
        if (dayKey === renderTodayKey) prefix = 'Hoy · ';
        else if (dayKey === yesterdayKey) prefix = 'Ayer · ';
        else if (dayKey === tomorrowKey) prefix = 'Mañana · ';
        const label = formatArgentinaDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) || '';
        const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
        return `${prefix}${capitalized}`;
    };

    const renderMatchListWithDayDividers = (matches: any[], isResult: boolean): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        let lastDayKey: string | null = null;
        matches.forEach((m, idx) => {
            const ts = m.timestamp || m.start_time || m.time;
            const date = ts ? new Date(ts * 1000) : null;
            const dayKey = date ? formatDateKey(date, APP_TIMEZONE) : 'no-date';
            if (dayKey !== lastDayKey) {
                nodes.push(
                    <div key={`day-${dayKey}-${idx}`} className={styles.matchDayDivider}>
                        {formatDayDividerLabel(date, dayKey)}
                    </div>
                );
                lastDayKey = dayKey;
            }
            nodes.push(renderCompetitionItem(m, isResult, idx));
        });
        return nodes;
    };

    return (
        <div className={`${styles.page}${isFifaWorldCup ? ` ${styles.fwc26}` : ''}`}>

            {isFifaWorldCup && (
                <div className={styles.fwc26TopBar} aria-hidden="true" />
            )}

            {/* ── Hero Section ───────────────────────────────────────── */}
            <div
                className={
                    seasonMenuOpen
                        ? `${styles.heroSection} ${styles.heroSectionSeasonMenuOpen}`
                        : styles.heroSection
                }
            >
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
                                {isFifaWorldCup
                                    ? <img src="/FIFA%20WC.PNG" alt="FIFA World Cup 2026" className={styles.heroLogoImg} />
                                    : shouldShowTournamentLogo
                                        ? <img src={tournamentLogo} alt={tournamentName} className={styles.heroLogoImg} onError={() => setTournamentLogoFailed(true)} />
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
                                            {availableSeasonOptions.length > 0 ? (
                                                <span className={styles.seasonSwitcher}>
                                                    <button
                                                        type="button"
                                                        className={styles.seasonSwitcherTrigger}
                                                        onClick={() => setSeasonMenuOpen((open) => !open)}
                                                        aria-haspopup="listbox"
                                                        aria-expanded={seasonMenuOpen}
                                                        title="Cambiar temporada"
                                                    >
                                                        <span>{yearDisplay}</span>
                                                        <svg
                                                            className={`${styles.seasonSwitcherCaret} ${seasonMenuOpen ? styles.seasonSwitcherCaretOpen : ''}`}
                                                            width="12"
                                                            height="12"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            aria-hidden="true"
                                                        >
                                                            <polyline points="6 9 12 15 18 9" />
                                                        </svg>
                                                    </button>
                                                    {seasonMenuOpen && (
                                                        <div className={styles.seasonSwitcherMenu} role="listbox">
                                                            {availableSeasonOptions.map((season) => (
                                                                <Link
                                                                    key={season.id}
                                                                    href={season.href}
                                                                    className={`${styles.seasonSwitcherItem} ${season.isCurrent ? styles.seasonSwitcherItemActive : ''}`}
                                                                    onClick={() => setSeasonMenuOpen(false)}
                                                                    role="option"
                                                                    aria-selected={season.isCurrent}
                                                                >
                                                                    <span className={styles.seasonSwitcherItemLabel}>{season.label}</span>
                                                                    {season.name && season.name !== season.label && (
                                                                        <span className={styles.seasonSwitcherItemSubtitle}>{season.name}</span>
                                                                    )}
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className={styles.heroMetaItem}>{yearDisplay}</span>
                                            )}
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
                                    onClick={() => setActiveTab(isMotorsportTournament ? 'results' : 'fixtures')}
                                    type="button"
                                >
                                    {isMotorsportTournament ? 'Ver Calendario' : 'Ver Fixture'}
                                </button>
                                <button
                                    className={styles.ctaBtnSecondary}
                                    onClick={() => setActiveTab(hasDedicatedPlayoffTab ? 'playoff' : 'standings')}
                                    type="button"
                                >
                                    {hasDedicatedPlayoffTab || shouldUseIntegratedBracketView ? 'Ver Cuadro' : 'Ver Tabla'}
                                </button>
                                {renderMobileHeroExport()}
                                {isExactSuperAdmin && externalTournamentEditorHref && (
                                    <Link href={externalTournamentEditorHref} prefetch={false} className={styles.ctaBtnSecondary}>
                                        Editar API
                                    </Link>
                                )}
                                {isSuperAdminUser && adminTournamentId && (
                                    <Link href={`/admin/entities/${adminTournamentId}/manage?type=tournament`} prefetch={false} className={styles.ctaBtnSecondary}>
                                        Editar torneo
                                    </Link>
                                )}
                                {FAVORITES_ENABLED && (
                                    <button
                                        className={`${styles.followBtn} ${isLeagueFavorite(favoriteTournamentId) ? styles.followBtnActive : ''}`}
                                    onClick={() => toggleLeagueFavorite(favoriteTournamentId, {
                                        name: tournamentName,
                                        logo_url: tournamentLogo || null,
                                        followerTournamentId: adminTournamentId,
                                        sportId: tournamentData?.sportId ?? tournamentData?.sport_id ?? null,
                                    })}
                                    type="button"
                                >
                                    {isLeagueFavorite(favoriteTournamentId) ? '★ Siguiendo' : '☆ Seguir'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Quick Stats Row ─────────────────────────────── */}
                    <div className={styles.quickStatsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.teams || '—'}</span>
                            <span className={styles.statCardLabel}>{infoParticipantsLabel}</span>
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
                        {navigationTabs.map((tab: { id: string; label: string }) => (
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
              {/* Keyed wrapper: re-mounts on tab switch so the entrance animation re-fires */}
              <div key={activeTab} className={styles.tabPanel}>

                {/* ── SUMMARY TAB ──────────────────────────────────────── */}
                {activeTab === 'summary' && (
                    <div className={styles.contentGrid}>

                        {/* Left: Content Area */}
                        <div className={styles.contentArea}>

                            {/* Featured Match */}
                            {isMotorsportTournament ? renderMotorsportSeasonHero() : featured && renderCompetitionCard()}

                            {/* Latest Results */}
                            {(isMotorsportTournament || results.length > 0) && (
                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>{isMotorsportTournament ? 'Clasificacion de pilotos' : summaryResultsTitle}</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab(isMotorsportTournament ? 'standings' : 'results')}>{isMotorsportTournament ? 'Ver clasificacion' : 'Ver todos'}</button>
                                    </div>
                                    {isMotorsportTournament ? renderMotorsportStandingsTable(motorsportStandingsRows, {
                                        entityLabel: 'Piloto',
                                        detailLabel: 'Equipo',
                                        emptyLabel: 'Clasificacion de pilotos no disponible.',
                                        raceColumns: motorsportDriverRaceColumns,
                                    }) : (
                                        <div className={styles.matchList}>
                                            {results.slice(0, 5).map((m, idx) => renderCompetitionItem(m, true, idx))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Upcoming Matches */}
                            {(isMotorsportTournament || fixtures.length > 0 || motorsportSeasonEvents.length > 0) && (
                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>{isMotorsportTournament ? 'Calendario de la temporada' : summaryFixturesTitle}</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab(isMotorsportTournament ? 'results' : 'fixtures')}>{isMotorsportTournament ? 'Ver calendario' : 'Ver todos'}</button>
                                    </div>
                                    {isMotorsportTournament ? (
                                        <div className={styles.motorsportSeasonCalendarList}>
                                            {motorsportSeasonEvents.length > 0
                                                ? motorsportSeasonEvents.slice(0, 8).map((match: any, idx: number) => renderMotorsportSeasonCalendarItem(match, idx))
                                                : <p className={styles.emptyState}>No hay carreras cargadas aun.</p>}
                                        </div>
                                    ) : (
                                        <div className={styles.matchList}>
                                            {fixtures.slice(0, 5).map((m, idx) => renderCompetitionItem(m, false, idx))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Empty state */}
                            {!isMotorsportTournament && !featured && results.length === 0 && fixtures.length === 0 && (
                                <div className={styles.sectionCard}>
                                    <p className={styles.emptyState}>
                                        {isMotorsportTournament ? 'No hay eventos cargados aun.' : 'No hay partidos cargados aún.'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Right: Sidebar */}
                        <aside className={styles.sidebar}>

                            {(hasDedicatedPlayoffTab || shouldUseIntegratedBracketView) && (
                                <div className={styles.infoCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Cuadro</h2>
                                        <button
                                            className={styles.linkButton}
                                            onClick={() => setActiveTab(hasDedicatedPlayoffTab ? 'playoff' : 'standings')}
                                        >
                                            {shouldUseIntegratedBracketView ? 'Ver cuadro' : isMotorsportTournament ? 'Ver clasificacion' : 'Ver cuadro'}
                                        </button>
                                    </div>
                                    <div className={styles.infoCardBody}>
                                        <p className={styles.emptyState} style={{ margin: 0, textAlign: 'left' }}>
                                            {draw.length > 0
                                                ? `${draw.length} ronda${draw.length === 1 ? '' : 's'} cargada${draw.length === 1 ? '' : 's'} para la fase eliminatoria activa.`
                                                : 'La fase activa es eliminatoria. El cuadro aparecerá cuando haya cruces o rondas cargadas.'}
                                        </p>
                                        {draw.length > 0 && (
                                            <div style={{ marginTop: 12 }}>
                                                <ExportImage
                                                    template="playoffBracket"
                                                    filename={`cuadro-${tournamentData?.name}`}
                                                    data={bracketExportData}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {isMotorsportTournament && (
                                <>
                                    <div className={styles.infoCard}>
                                        <div className={styles.infoCardHeader}>
                                            <h3 className={styles.infoCardTitle}>Ultimo GP</h3>
                                        </div>
                                        <div className={styles.infoCardBody}>
                                            {motorsportLastEvent ? (
                                                <div className={styles.motorsportContextBlock}>
                                                    <strong className={styles.motorsportContextTitle}>{motorsportLastEvent.event_name}</strong>
                                                    <div className={styles.motorsportContextPodium}>
                                                        {(motorsportLastEvent.podium || []).slice(0, 3).map((driver: any, idx: number) => (
                                                            <div key={`${motorsportLastEvent.event_name}-${driver.name}-${idx}`} className={styles.motorsportContextPodiumRow}>
                                                                <span className={styles.motorsportContextPodiumPos}>P{idx + 1}</span>
                                                                <span>{driver.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className={styles.emptyState}>Sin carrera previa.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.infoCard}>
                                        <div className={styles.infoCardHeader}>
                                            <h3 className={styles.infoCardTitle}>Proximo GP</h3>
                                        </div>
                                        <div className={styles.infoCardBody}>
                                            {motorsportNextEvent ? (
                                                <div className={styles.motorsportContextBlock}>
                                                    <strong className={styles.motorsportContextTitle}>{motorsportNextEvent.event_name}</strong>
                                                    {motorsportNextEvent.venue && <div className={styles.motorsportContextMeta}>{motorsportNextEvent.venue}</div>}
                                                    {motorsportNextEvent.timestamp && (
                                                        <div className={styles.motorsportContextMeta}>
                                                            {formatArgentinaDate(new Date(motorsportNextEvent.timestamp * 1000), { day: '2-digit', month: 'long' })} - {formatArgentinaDate(new Date(motorsportNextEvent.timestamp * 1000), { hour: '2-digit', minute: '2-digit', hour12: false })} hs
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className={styles.emptyState}>No hay proxima carrera definida.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.infoCard}>
                                        <div className={styles.infoCardHeader}>
                                            <h3 className={styles.infoCardTitle}>Constructores</h3>
                                        </div>
                                        <div className={styles.infoCardBody}>
                                            {renderMotorsportStandingsTable(motorsportTeamRows, {
                                                entityLabel: 'Equipo',
                                                detailLabel: 'Detalle',
                                                compact: true,
                                                emptyLabel: 'Clasificacion de equipos no disponible.',
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Standings Preview */}
                            {!isMotorsportTournament && standingsPreviewRows.length > 0 && (
                                <div className={styles.standingsPreviewCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>{standingsCardTitle}</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('standings')}>
                                            {isMotorsportTournament ? 'Ver clasificacion' : 'Ver tabla'}
                                        </button>
                                    </div>
                                    <div className={styles.tableCard}>
                                        {renderStandingsHeader(previewStandingsColumns)}
                                        {(() => {
                                            const groups: Array<{ name: string | null; rows: any[] }> = [];
                                            for (const row of standingsPreviewRows) {
                                                const groupName = (row?.group_name as string | null | undefined) ?? null;
                                                const last = groups[groups.length - 1];
                                                if (last && last.name === groupName) {
                                                    last.rows.push(row);
                                                } else {
                                                    groups.push({ name: groupName, rows: [row] });
                                                }
                                            }
                                            const showHeaders = groups.length > 1 || groups.some((g) => g.name);
                                            let renderedIdx = 0;
                                            return groups.map((group, gIdx) => (
                                                <div key={`preview-group-${gIdx}-${group.name ?? 'none'}`}>
                                                    {showHeaders && group.name && (
                                                        <div className={styles.groupHeader}>{group.name}</div>
                                                    )}
                                                    {group.rows.map((row: any) => {
                                                        const idx = renderedIdx++;
                                                        return renderStandingsRow(row, idx, previewStandingsColumns);
                                                    })}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                    {renderStandingsLegend(standingsPreviewLegendItems)}
                                </div>
                            )}

                            {/* Tournament Info Card */}
                            {!isMotorsportTournament && <div className={styles.infoCard}>
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
                                            <span className={styles.infoLabel}>{infoParticipantsLabel}</span>
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
                            </div>}
                        </aside>
                    </div>
                )}

                {/* ── RESULTS TAB ──────────────────────────────────────── */}
                {activeTab === 'results' && (
                    <div className={styles.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 className={styles.pageTitle}>{resultsPageTitle}</h2>
                            <ExportImage
                                template="dailyMatches"
                                filename={`resultados-${tournamentData?.name}`}
                                data={{
                                    date: details?.season || 'Resultados',
                                    tournament: tournamentData?.name || 'Torneo',
                                    tournamentLogo,
                                    matches: results.map(m => ({
                                        homeTeam: getMatchExportTeamName(m, 'home'),
                                        awayTeam: getMatchExportTeamName(m, 'away'),
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
                            {isMotorsportTournament ? (
                                <div className={styles.motorsportSeasonCalendarList}>
                                    {motorsportSeasonEvents.length > 0
                                        ? motorsportSeasonEvents.map((match: any, idx: number) => renderMotorsportSeasonCalendarItem(match, idx))
                                        : <p className={styles.emptyState}>No hay carreras registradas.</p>}
                                </div>
                            ) : (
                                <div className={styles.matchList}>
                                    {results.length > 0
                                        ? renderMatchListWithDayDividers(results, true)
                                        : <p className={styles.emptyState}>No hay resultados registrados.</p>}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── FIXTURES TAB ─────────────────────────────────────── */}
                {activeTab === 'fixtures' && (
                    <div className={styles.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 className={styles.pageTitle}>{fixturesPageTitle}</h2>
                            <ExportImage
                                template="dailyMatches"
                                filename={`fixture-${tournamentData?.name}`}
                                data={{
                                    date: 'Próximos Partidos',
                                    tournament: tournamentData?.name || 'Torneo',
                                    tournamentLogo,
                                    matches: fixtures.map(m => ({
                                        homeTeam: getMatchExportTeamName(m, 'home'),
                                        awayTeam: getMatchExportTeamName(m, 'away'),
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
                            {isMotorsportTournament ? (
                                <div className={styles.motorsportSeasonCalendarList}>
                                    {motorsportUpcomingEvents.length > 0
                                        ? motorsportUpcomingEvents.map((match: any, idx: number) => renderMotorsportSeasonCalendarItem(match, idx))
                                        : <p className={styles.emptyState}>No hay proximas carreras programadas.</p>}
                                </div>
                            ) : (
                                <div className={styles.matchList}>
                                    {fixtures.length > 0
                                        ? renderMatchListWithDayDividers(fixtures, false)
                                        : <p className={styles.emptyState}>No hay partidos programados.</p>}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── STANDINGS TAB ─────────────────────────────────────── */}
                {activeTab === 'standings' && (
                    <div className={styles.section}>
                        {shouldUseIntegratedBracketView ? (
                            <>
                                <div className={styles.standingsToolbar}>
                                    <div />
                                    <ExportImage
                                        template="playoffBracket"
                                        filename={`cuadro-${tournamentData?.name}`}
                                        data={bracketExportData}
                                    />
                                </div>
                                <PlayoffBracket data={draw} title={bracketTitle} />
                            </>
                        ) : (
                            <>
                        {visibleStandingsScopeViews.length > 1 && (
                            <div className={styles.standingsScopeBar}>
                                <span className={styles.standingsScopeLabel}>Tabla</span>
                                <div className={styles.pillsGroup}>
                                    {visibleStandingsScopeViews.map((view) => (
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
                            {!isMotorsportTournament && !selectedStandingsScopeView && !isCircuitTournament && (
                                <div className={styles.pillsGroup}>
                                    <button className={`${styles.pillBtn} ${standingsView === 'overall' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('overall')}>General</button>
                                    {standingsForm.length > 0 && <button className={`${styles.pillBtn} ${standingsView === 'form' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('form')}>Forma</button>}
                                    {standingsOverUnder.length > 0 && <button className={`${styles.pillBtn} ${standingsView === 'overunder' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('overunder')}>Over/Under</button>}
                                    {standingsHtFt.length > 0 && <button className={`${styles.pillBtn} ${standingsView === 'htft' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('htft')}>HT/FT</button>}
                                    {customStandingsTables.map((table: any) => (
                                        <button
                                            key={table.key}
                                            className={`${styles.pillBtn} ${standingsView === table.key ? styles.pillBtnActive : ''}`}
                                            onClick={() => setStandingsView(table.key)}
                                        >
                                            {table.name || table.key}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <ExportImage
                                template="standings"
                                filename={`tabla-${tournamentData?.name}`}
                                data={{
                                    title: tournamentData?.name || 'Tabla de Posiciones',
                                    subtitle: selectedStandingsScopeView?.subtitle || details?.season || 'Clasificación',
                                    tournamentLogo,
                                    rows: isMotorsportTournament ? motorsportStandingsExportRows : standingsExportRows,
                                    groups: isMotorsportTournament ? [] : standingsExportGroups,
                                    columnLabels: standingsExportColumnLabels,
                                    plainDiff: standingsColumnMode === 'circuit-global',
                                    showPositionDelta: false,
                                }}
                            />
                        </div>

                        {isMotorsportTournament ? (
                            <>
                                {motorsportStandingsRows.length === 0 && <p className={styles.emptyState}>Clasificacion de pilotos no disponible.</p>}
                                {motorsportStandingsRows.length > 0 && (
                                    <div className={styles.standingsContainer}>
                                        <div className={styles.sectionCard}>
                                            {renderMotorsportStandingsTable(motorsportStandingsRows, {
                                                entityLabel: 'Piloto',
                                                detailLabel: 'Equipo',
                                                emptyLabel: 'Clasificacion de pilotos no disponible.',
                                                raceColumns: motorsportDriverRaceColumns,
                                            })}
                                        </div>
                                        {renderStandingsLegend(standingsLegendItems)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {activeRows.length === 0 && <p className={styles.emptyState}>Tabla no disponible.</p>}

                                {activeRows.length > 0 && activeStandingsRenderer === 'standard' && (
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
                            </>
                        )}

                        {!selectedStandingsScopeView && !isCircuitTournament && activeRows.length > 0 && activeStandingsRenderer === 'overunder' && (
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

                        {!selectedStandingsScopeView && !isCircuitTournament && activeRows.length > 0 && activeStandingsRenderer === 'htft' && (
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
                            </>
                        )}
                    </div>
                )}

                {/* ── TEAMS TAB ─────────────────────────────────────────── */}
                {activeTab === 'teams' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>{isMotorsportTournament ? 'Equipos' : 'Equipos'}</h2>
                        {isMotorsportTournament ? (
                            motorsportTeamRows.length > 0 ? (
                                <div className={styles.standingsContainer}>
                                    <div className={styles.sectionCard}>
                                        {renderMotorsportStandingsTable(motorsportTeamRows, {
                                            entityLabel: 'Equipo',
                                            detailLabel: 'Detalle',
                                            emptyLabel: 'Clasificacion de equipos no disponible.',
                                            raceColumns: motorsportTeamRaceColumns,
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <p className={styles.emptyState}>Clasificacion de equipos no disponible.</p>
                            )
                        ) : (() => {
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
                            const displayTeams = (isDbOnly && participantTeams.length > 0
                                ? participantTeams
                                : teamsList.length > 0
                                    ? teamsList
                                    : participantTeams
                            ).filter((t: any) => !isBracketPlaceholderTeamName(t.name));
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
                        <div className={styles.standingsToolbar}>
                            <div />
                            <ExportImage
                                template="playoffBracket"
                                filename={`cuadro-${tournamentData?.name}`}
                                data={bracketExportData}
                            />
                        </div>
                        <PlayoffBracket data={draw} title={`Cuadro - ${getKnockoutPhaseDisplayTitle(bracketPhase, tournamentName)}`} />
                    </div>
                )}

                {/* ── STATS TAB ─────────────────────────────────────────── */}
                {activeTab === 'stats' && (() => {
                    const sofascoreLeague = resolveSofascoreLeague(
                        tournamentData?.name,
                        tournamentData?.sportId,
                    );
                    if (sofascoreLeague) {
                        return <TournamentSofascoreStats sofascoreLeague={sofascoreLeague} />;
                    }
                    return <TournamentPublicStats matches={initialData?.matches || []} topScorers={topScorers} />;
                })()}

                {activeTab === 'scores' && (
                    <TournamentScoresPanel
                        tournamentId={id}
                        tournamentName={tournamentData?.name}
                        tournamentLogo={tournamentLogo}
                        sportId={tournamentData?.sportId}
                        matches={results}
                    />
                )}

                {/* ── ARCHIVE TAB ───────────────────────────────────────── */}
                {activeTab === 'archive' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Archivo de Temporadas</h2>
                        {archives.length > 0 ? (
                            <div className={styles.archiveGrid}>
                                {archives.map((season: any) => (
                                    <Link
                                        key={pickArchiveSeasonIds(season).seasonId || pickArchiveSeasonIds(season).stageId || season.id}
                                        href={buildExternalSeasonHref(id, season, currentFlashScoreIds, routeSearch)}
                                        className={styles.archiveItem}
                                    >
                                        {pickArchiveSeasonName(season)}
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.emptyState}>No hay temporadas archivadas disponibles.</p>
                        )}
                    </div>
                )}

              </div>
            </main>
        </div>
    );
}
