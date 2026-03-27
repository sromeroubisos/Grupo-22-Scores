'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEntity, updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { getAllSports } from '@/lib/data/sports';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { useAdminConsole } from '@/app/admin/AdminContext';
import type { GroupLabel } from '@/types/phase-settings';
import {
    buildTournamentCompetitionConfig,
    getTournamentFormatDescription,
    normalizeTournamentFormat,
    type CircuitChampionMode,
} from '@/lib/utils/tournamentFormat';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type CountryRow = Pick<Database['public']['Tables']['countries']['Row'], 'id' | 'name' | 'code' | 'flag_emoji'>;

/* ─── design tokens (Flash UI) ─────────────────────────────────────── */
const T = {
    bgDeep: '#050505',
    bgMatte: '#0f0f0f',
    bgSurface: '#161616',
    neon: '#00FF66',
    neonGlow: 'rgba(0,255,102,0.4)',
    neonDim: 'rgba(0,255,102,0.1)',
    textMain: '#f0f0f0',
    textDim: '#888888',
    border: '#222222',
    radius: '4px',
    mono: "'JetBrains Mono', monospace",
    sans: "'Inter', sans-serif",
    danger: '#ff4444',
    warn: '#ffaa00',
    warnBg: 'rgba(255,170,0,0.05)',
    warnBorder: 'rgba(255,170,0,0.2)',
} as const;

/* ─── shared style objects ──────────────────────────────────────────── */
const S = {
    input: {
        width: '100%',
        backgroundColor: T.bgDeep,
        border: `1px solid ${T.border}`,
        padding: '0.8rem 1rem',
        color: T.textMain,
        fontFamily: T.sans,
        borderRadius: T.radius,
        outline: 'none',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        fontSize: '0.9rem',
    } as React.CSSProperties,

    inputMono: {
        fontFamily: T.mono,
        fontSize: '0.85rem',
        color: T.neon,
    } as React.CSSProperties,

    label: {
        display: 'block',
        fontSize: '0.72rem',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        color: T.textDim,
        marginBottom: '0.5rem',
        letterSpacing: '0.05em',
    } as React.CSSProperties,

    sectionCard: {
        backgroundColor: T.bgMatte,
        border: `1px solid ${T.border}`,
        padding: '2rem',
        borderRadius: T.radius,
        marginBottom: '2rem',
    } as React.CSSProperties,

    sectionHeader: {
        marginBottom: '2rem',
        borderBottom: `1px solid ${T.border}`,
        paddingBottom: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    } as React.CSSProperties,

    formGroup: {
        marginBottom: '1.5rem',
    } as React.CSSProperties,

    btnPrimary: {
        padding: '0.8rem 1.5rem',
        borderRadius: T.radius,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        fontSize: '0.72rem',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        letterSpacing: '0.05em',
        backgroundColor: T.neon,
        color: T.bgDeep,
        boxShadow: `0 4px 15px ${T.neonGlow}`,
        fontFamily: T.sans,
    } as React.CSSProperties,

    btnSecondary: {
        padding: '0.8rem 1.5rem',
        borderRadius: T.radius,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        fontSize: '0.72rem',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        background: 'transparent',
        border: `1px solid ${T.border}`,
        color: T.textMain,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        letterSpacing: '0.05em',
        fontFamily: T.sans,
    } as React.CSSProperties,

    btnGhost: {
        padding: '0.8rem 1.5rem',
        borderRadius: T.radius,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        fontSize: '0.72rem',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        background: 'transparent',
        border: 'none',
        color: T.textDim,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        letterSpacing: '0.05em',
        fontFamily: T.sans,
    } as React.CSSProperties,
} as const;

/* ─── constants ─────────────────────────────────────────────────────── */
const SPORTS = getAllSports();

const FORMAT_OPTIONS = [
    { id: 'league', label: 'League / Round Robin' },
    { id: 'groups', label: 'Group Stage + Playoffs' },
    { id: 'knockout', label: 'Direct Elimination' },
    { id: 'series', label: 'Series / Multiple Legs' },
    { id: 'event', label: 'Single Event / Final Result' },
] as const;

const COMPETITION_MODEL_OPTIONS = [
    { id: 'standard', label: 'Standard Tournament' },
    { id: 'circuit', label: 'Circuit / Season Tour' },
] as const;

const CIRCUIT_CHAMPION_OPTIONS: Array<{ id: CircuitChampionMode; label: string; hint: string }> = [
    { id: 'accumulation', label: 'Accumulation', hint: 'Champion is the leader after all circuit events.' },
    { id: 'final', label: 'Final Stage', hint: 'Top teams qualify to a final playoff to decide the title.' },
];

const TIEBREAKER_LABELS: Record<string, string> = {
    points: 'Competition Points',
    diff: 'Point Difference',
    head_to_head: 'Head-to-Head (H2H)',
    tries: 'Tries Scored',
    fair_play: 'Fair Play Score',
    for: 'Points For',
    against: 'Points Against',
    won: 'Wins',
    drawn: 'Draws',
    lost: 'Losses',
    bonus_offensive: 'Offensive Bonus',
    bonus_defensive: 'Defensive Bonus',
    red_cards: 'Fewer Red Cards',
    coin_toss: 'Coin Toss',
};

type StandingsPreset = {
    points_base: Record<string, number>;
    bonus_rules: Array<{ id: string; label: string; points_awarded: number }>;
};

type CircuitPlacementRule = {
    position: number;
    points: number;
};

type TournamentCompetitionConfig = ReturnType<typeof buildTournamentCompetitionConfig>;

type TournamentPhaseEditorState = {
    id: string;
    name: string;
    format: string;
    standings: StandingsPreset;
    tiebreakers: { order: string[] };
    teamsCount: number;
    advanceCount: number;
    legs: 1 | 2;
    group_names: string[];
    playoffThirdPlace: boolean;
    groupLabels: GroupLabel[];
    circuitPoints: CircuitPlacementRule[];
};

type TournamentRulesetEditorState = Record<string, unknown> & {
    standings: StandingsPreset;
    tiebreakers: { order: string[] };
    phases: TournamentPhaseEditorState[];
    competition: TournamentCompetitionConfig;
};

type OrganizerUnionEntry = {
    union_id: string;
    name: string | null;
    is_primary: boolean;
};

const DEFAULT_STANDINGS_PRESET: StandingsPreset = {
    points_base: { win: 1, draw: 0, loss: 0 },
    bonus_rules: [],
};

const DEFAULT_GROUP_COUNT = 2;
const DEFAULT_TIEBREAKER_ORDER = ['points', 'diff', 'head_to_head', 'tries', 'fair_play'];
const DEFAULT_CIRCUIT_PLACEMENT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4];
const PRESET_LABEL_COLORS = ['#00FF66', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6'];
const TIEBREAKER_PHASE_METRICS: Record<string, string> = {
    points: 'points',
    diff: 'points_difference',
    head_to_head: 'headToHead',
    tries: 'tries',
    fair_play: 'fair_play',
    for: 'points_for',
    against: 'points_against',
    won: 'won',
    drawn: 'drawn',
    lost: 'lost',
    bonus_offensive: 'bonusOffensive',
    bonus_defensive: 'bonusDefensive',
    coin_toss: 'coin_toss',
    red_cards: 'red_cards',
};

const TIEBREAKER_OPTIONS: Array<{ key: string; label: string; description: string }> = [
    { key: 'points', label: 'Competition Points', description: 'Primary ranking by total points earned.' },
    { key: 'diff', label: 'Point Difference', description: 'Difference between points scored and conceded.' },
    { key: 'head_to_head', label: 'Head-to-Head (H2H)', description: 'Direct results between tied teams.' },
    { key: 'tries', label: 'Tries Scored', description: 'Higher number of tries scored.' },
    { key: 'for', label: 'Points For', description: 'Total points scored.' },
    { key: 'against', label: 'Points Against', description: 'Lower points conceded.' },
    { key: 'won', label: 'Wins', description: 'More matches won.' },
    { key: 'drawn', label: 'Draws', description: 'More matches drawn.' },
    { key: 'lost', label: 'Losses', description: 'Fewer matches lost.' },
    { key: 'bonus_offensive', label: 'Offensive Bonus', description: 'More offensive bonus points.' },
    { key: 'bonus_defensive', label: 'Defensive Bonus', description: 'More defensive bonus points.' },
    { key: 'fair_play', label: 'Fair Play Score', description: 'Lower disciplinary penalty score.' },
    { key: 'red_cards', label: 'Fewer Red Cards', description: 'Lower number of red cards.' },
    { key: 'coin_toss', label: 'Coin Toss', description: 'Final fallback by draw.' },
];

const SPORT_PRESETS: Record<string, StandingsPreset> = {
    rugby: {
        points_base: { win: 4, draw: 2, loss: 0 }, bonus_rules: [
            { id: 'try_bonus', label: '4+ Tries', points_awarded: 1 },
            { id: 'close_loss', label: 'Loss < 7 pts', points_awarded: 1 },
        ]
    },
    'rugby-union': {
        points_base: { win: 4, draw: 2, loss: 0 }, bonus_rules: [
            { id: 'try_bonus', label: '4+ Tries', points_awarded: 1 },
            { id: 'close_loss', label: 'Loss < 7 pts', points_awarded: 1 },
        ]
    },
    'rugby-league': { points_base: { win: 2, draw: 1, loss: 0 }, bonus_rules: [] },
    football: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    futsal: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    'beach-soccer': { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    hockey: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    'field-hockey': { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    floorball: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    bandy: { points_base: { win: 3, draw: 1, loss: 0 }, bonus_rules: [] },
    basketball: { points_base: { win: 2, draw: 0, loss: 1 }, bonus_rules: [] },
    netball: { points_base: { win: 2, draw: 0, loss: 1 }, bonus_rules: [] },
    volleyball: { points_base: { win: 3, draw: 0, loss: 0 }, bonus_rules: [] },
    'beach-volleyball': { points_base: { win: 3, draw: 0, loss: 0 }, bonus_rules: [] },
    handball: { points_base: { win: 2, draw: 1, loss: 0 }, bonus_rules: [] },
    'american-football': { points_base: { win: 1, draw: 0, loss: 0 }, bonus_rules: [] },
    baseball: { points_base: { win: 1, draw: 0, loss: 0 }, bonus_rules: [] },
    cricket: { points_base: { win: 1, draw: 0, loss: 0 }, bonus_rules: [] },
    tennis: { points_base: { win: 2, draw: 0, loss: 0 }, bonus_rules: [] },
    'table-tennis': { points_base: { win: 2, draw: 0, loss: 0 }, bonus_rules: [] },
    badminton: { points_base: { win: 2, draw: 0, loss: 0 }, bonus_rules: [] },
    'water-polo': { points_base: { win: 2, draw: 1, loss: 0 }, bonus_rules: [] },
    kabaddi: { points_base: { win: 2, draw: 0, loss: 0 }, bonus_rules: [] },
};

function getSportPreset(sportId: string | null | undefined): StandingsPreset {
    const preset = SPORT_PRESETS[sportId || ''] ?? DEFAULT_STANDINGS_PRESET;
    return JSON.parse(JSON.stringify(preset));
}

function toPositiveInteger(value: unknown, fallback: number): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(0, Math.floor(numericValue));
}

function toLegCount(value: unknown, fallback: 1 | 2): 1 | 2 {
    return Number(value) === 2 ? 2 : fallback;
}

function dedupeStringArray(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function buildDefaultGroupNames(count: number) {
    const safeCount = Math.max(DEFAULT_GROUP_COUNT, count);
    return Array.from({ length: safeCount }, (_, index) => `Group ${String.fromCharCode(65 + index)}`);
}

function getAutoLabelColor(index: number) {
    return PRESET_LABEL_COLORS[index % PRESET_LABEL_COLORS.length];
}

function normalizeGroupNames(value: unknown, fallbackCount = DEFAULT_GROUP_COUNT): string[] {
    if (!Array.isArray(value)) {
        return buildDefaultGroupNames(fallbackCount);
    }

    const normalized = value
        .map((item, index) => {
            const label = typeof item === 'string' ? item.trim() : '';
            return label || `Group ${String.fromCharCode(65 + index)}`;
        })
        .filter(Boolean);

    return normalized.length > 0 ? normalized : buildDefaultGroupNames(fallbackCount);
}

function normalizePhaseLabels(input: unknown): GroupLabel[] {
    if (!Array.isArray(input)) return [];

    return input
        .map((item, index) => {
            if (!item || typeof item !== 'object') return null;

            const candidate = item as Partial<GroupLabel>;
            const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
            if (!name) return null;

            const autoColorIndex = typeof candidate.autoColorIndex === 'number' ? candidate.autoColorIndex : index;
            const colorMode = candidate.colorMode === 'manual' ? 'manual' : 'auto';

            return {
                id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `label_${index}_${name}`,
                name,
                colorMode,
                color: typeof candidate.color === 'string' && candidate.color.trim()
                    ? candidate.color.trim()
                    : getAutoLabelColor(autoColorIndex),
                autoColorIndex,
            } satisfies GroupLabel;
        })
        .filter(Boolean) as GroupLabel[];
}

function buildDefaultCircuitPlacementPoints(): CircuitPlacementRule[] {
    return DEFAULT_CIRCUIT_PLACEMENT_POINTS.map((points, index) => ({
        position: index + 1,
        points,
    }));
}

function normalizeCircuitPlacementPoints(input: unknown): CircuitPlacementRule[] {
    if (!Array.isArray(input)) return buildDefaultCircuitPlacementPoints();

    const normalized = input
        .map((item, index) => {
            if (!item || typeof item !== 'object') return null;

            const candidate = item as Partial<CircuitPlacementRule>;
            const fallbackPosition = index + 1;
            const position = toPositiveInteger(candidate.position, fallbackPosition);
            const points = Number.isFinite(candidate.points) ? Number(candidate.points) : 0;

            return {
                position,
                points,
            } satisfies CircuitPlacementRule;
        })
        .filter((item): item is CircuitPlacementRule => Boolean(item))
        .sort((left, right) => left.position - right.position);

    if (normalized.length === 0) return buildDefaultCircuitPlacementPoints();

    const deduped = normalized.filter((item, index) =>
        normalized.findIndex((candidate) => candidate.position === item.position) === index,
    );

    return deduped.length > 0 ? deduped : buildDefaultCircuitPlacementPoints();
}

function getInitialOrganizerUnionIds(data: Partial<TournamentRow>): string[] {
    const ruleset = data.ruleset && typeof data.ruleset === 'object'
        ? data.ruleset as Record<string, any>
        : {};
    const organizerIdsFromRuleset = Array.isArray(ruleset.organizer_union_ids)
        ? ruleset.organizer_union_ids
        : Array.isArray(ruleset.organizers)
            ? ruleset.organizers.map((item: any) => item?.union_id)
            : [];

    return dedupeStringArray([
        ...organizerIdsFromRuleset,
        data.union_id ?? null,
    ]);
}

function buildDefaultPhaseName(index: number, format: string, isCircuitCompetition = false): string {
    const normalizedFormat = normalizeTournamentFormat(format);

    if (isCircuitCompetition) return `Stage ${index + 1}`;

    if (index === 0 && (normalizedFormat === 'league' || normalizedFormat === 'groups' || normalizedFormat === 'circuit')) {
        return 'Regular Season';
    }

    if (normalizedFormat === 'groups') return 'Group Stage';
    if (normalizedFormat === 'knockout') return 'Playoffs';
    if (normalizedFormat === 'series') return 'Series';
    if (normalizedFormat === 'event') return 'Event';
    if (normalizedFormat === 'circuit') return index === 0 ? 'Circuit Ranking' : `Circuit Stage ${index + 1}`;

    return `Phase ${index + 1}`;
}

function getPhaseTypeFromFormat(format: string): 'league' | 'group_stage' | 'playoff' {
    const normalizedFormat = normalizeTournamentFormat(format);

    if (normalizedFormat === 'groups') return 'group_stage';
    if (normalizedFormat === 'knockout' || normalizedFormat === 'series') return 'playoff';
    return 'league';
}

function normalisePhaseState(
    phase: any,
    index: number,
    baseStandings: StandingsPreset,
    baseTiebreakers: { order: string[] },
    competitionFormat = 'league',
): TournamentPhaseEditorState {
    const isCircuitCompetition = normalizeTournamentFormat(competitionFormat) === 'circuit';
    const fallbackFormat = isCircuitCompetition ? 'league' : (index === 0 ? 'league' : 'knockout');
    const rawFormat = normalizeTournamentFormat(phase?.format ?? phase?.settings?.phaseFormat ?? fallbackFormat);
    const format = isCircuitCompetition && rawFormat === 'circuit' ? 'league' : rawFormat;
    const standings = JSON.parse(JSON.stringify(
        phase?.standings && typeof phase.standings === 'object'
            ? phase.standings
            : baseStandings,
    )) as StandingsPreset;
    const tiebreakerOrder = Array.isArray(phase?.tiebreakers?.order) && phase.tiebreakers.order.length > 0
        ? phase.tiebreakers.order.filter((item: unknown) => typeof item === 'string' && item.trim())
        : baseTiebreakers.order;
    const defaultLegs: 1 | 2 = format === 'series' ? 2 : 1;

    return {
        id: phase?.id || `phase_${index + 1}`,
        name: typeof phase?.name === 'string' && phase.name.trim()
            ? phase.name.trim()
            : buildDefaultPhaseName(index, format, isCircuitCompetition),
        format,
        standings,
        tiebreakers: {
            order: tiebreakerOrder.length > 0 ? [...tiebreakerOrder] : [...DEFAULT_TIEBREAKER_ORDER],
        },
        teamsCount: toPositiveInteger(phase?.teamsCount ?? phase?.settings?.teamsCount, 0),
        advanceCount: toPositiveInteger(
            phase?.advanceCount ?? phase?.settings?.advanceCount,
            format === 'groups' ? 2 : 0,
        ),
        legs: toLegCount(phase?.legs ?? phase?.settings?.legs, defaultLegs),
        group_names: format === 'groups'
            ? normalizeGroupNames(phase?.group_names ?? phase?.settings?.group_names, DEFAULT_GROUP_COUNT)
            : [],
        playoffThirdPlace: Boolean(phase?.playoffThirdPlace ?? phase?.settings?.playoffThirdPlace),
        groupLabels: normalizePhaseLabels(phase?.groupLabels ?? phase?.settings?.groupLabels),
        circuitPoints: normalizeCircuitPlacementPoints(
            phase?.circuitPoints
            ?? phase?.settings?.circuit?.pointsByPlacement
            ?? phase?.settings?.placementPoints,
        ),
    };
}

function inferBonusConfig(bonusRules: StandingsPreset['bonus_rules']) {
    const normalizedRules = Array.isArray(bonusRules) ? bonusRules : [];

    const offensiveRule = normalizedRules.find((rule) => {
        const signature = `${rule.id} ${rule.label}`.toLowerCase();
        return signature.includes('try') || signature.includes('tries');
    }) || null;

    const defensiveRule = normalizedRules.find((rule) => {
        const signature = `${rule.id} ${rule.label}`.toLowerCase();
        return signature.includes('loss') || signature.includes('perd') || signature.includes('close');
    }) || null;

    return {
        bonusTry: offensiveRule?.points_awarded ?? null,
        bonusLoss: defensiveRule?.points_awarded ?? null,
        bonus: {
            offensive: offensiveRule
                ? {
                    label: offensiveRule.label,
                    tries: 4,
                    points: offensiveRule.points_awarded,
                }
                : null,
            defensive: defensiveRule
                ? {
                    label: defensiveRule.label,
                    margin: 7,
                    points: defensiveRule.points_awarded,
                }
                : null,
        },
        conditionalRules: normalizedRules.map((rule) => ({
            id: rule.id,
            label: rule.label,
            points_awarded: rule.points_awarded,
        })),
    };
}

function buildTournamentPhasePayload(
    phase: TournamentPhaseEditorState,
    orderIndex: number,
    options?: { isCircuitCompetition?: boolean },
) {
    const isCircuitCompetition = options?.isCircuitCompetition === true;
    const phaseType = getPhaseTypeFromFormat(phase.format);
    const legs = phase.legs === 2 ? 2 : 1;
    const bonusConfig = inferBonusConfig(phase.standings.bonus_rules);
    const normalizedPhaseFormat = normalizeTournamentFormat(phase.format);
    const isSingleEventStage = normalizedPhaseFormat === 'event';

    return {
        name: phase.name.trim() || buildDefaultPhaseName(Math.max(orderIndex - 1, 0), phase.format, isCircuitCompetition),
        phase_type: phaseType,
        order_index: orderIndex,
        is_active: orderIndex === 1,
        settings: {
            editor_source: 'tournament_editor',
            phaseFormat: normalizedPhaseFormat,
            stageKind: isCircuitCompetition ? 'subtournament' : 'phase',
            rankingSource: isSingleEventStage ? 'final_event_result' : 'phase_standings',
            teamsCount: phase.teamsCount,
            advanceCount: phase.advanceCount,
            legs,
            playoffThirdPlace: phase.playoffThirdPlace,
            group_names: phaseType === 'group_stage' ? phase.group_names : [],
            groupLabels: phase.groupLabels,
            groupTags: phase.groupLabels.map((label) => label.name),
            pointsSystem: isSingleEventStage ? null : {
                win: phase.standings.points_base.win,
                draw: phase.standings.points_base.draw,
                loss: phase.standings.points_base.loss,
                allowBonusPoints: phase.standings.bonus_rules.length > 0,
                bonusTry: bonusConfig.bonusTry,
                bonusLoss: bonusConfig.bonusLoss,
                conditionalRules: bonusConfig.conditionalRules,
                behavior: {
                    whenToCalculate: 'on_match_finalized',
                    input: {
                        requires: ['score'],
                        statusRequired: 'finalized',
                    },
                    output: {
                        writesTo: ['standings'],
                    },
                    basePointsLogic: [
                        { if: { win: true }, then: { add: phase.standings.points_base.win } },
                        { if: { draw: true }, then: { add: phase.standings.points_base.draw } },
                        { if: { loss: true }, then: { add: phase.standings.points_base.loss } },
                    ],
                    bonusTry: bonusConfig.bonusTry,
                    bonusLoss: bonusConfig.bonusLoss,
                    idempotency: {
                        key: 'match_id',
                        rule: 'ignore_if_already_processed',
                    },
                },
            },
            bonus: isSingleEventStage ? null : bonusConfig.bonus,
            tiebreakers: isSingleEventStage ? [] : phase.tiebreakers.order.map((key, index) => ({
                metric: TIEBREAKER_PHASE_METRICS[key] || key,
                key,
                label: TIEBREAKER_LABELS[key] || key,
                enabled: true,
                order: 'desc',
                priority: index + 1,
            })),
            qualification: !isSingleEventStage && phase.advanceCount > 0 ? { promoted: phase.advanceCount } : null,
            matchFormat: {
                type: isSingleEventStage ? 'event_results' : (legs === 2 ? 'series' : 'single_match'),
                label: isSingleEventStage ? 'Single Event Result' : (legs === 2 ? 'Home and Away' : 'Single Match'),
                behavior: {
                    event_results: {
                        rankingInput: 'final_positions',
                        allowManualRanking: true,
                    },
                    single_match: {
                        seriesLength: 1,
                        winnerDetermination: 'most_points_in_match',
                    },
                    series: {
                        seriesLength: legs,
                        aggregateMethod: 'points_sum',
                        tieResolution: 'extra_time_then_penalty_shootout',
                    },
                },
            },
            circuit: isCircuitCompetition ? {
                contributesToGeneralTable: true,
                rankingSource: isSingleEventStage ? 'final_event_result' : 'phase_standings',
                accumulationMethod: 'sum',
                pointsByPlacement: phase.circuitPoints,
            } : null,
        },
    };
}

function slugify(s: string) {
    return s.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function normalizeCountryId(value: string | null | undefined, options: TournamentCountryOption[]): string {
    if (!value) return '';
    const normalized = slugify(value);
    const matched = options.find((option) => slugify(option.id) === normalized || slugify(option.label) === normalized);
    return matched?.id || normalized;
}

/* ─── component ─────────────────────────────────────────────────────── */
export function TournamentEditor({
    data,
    id,
    unions = [],
    countries = [],
}: {
    data: Partial<TournamentRow>;
    id: string;
    unions?: { id: string; name: string }[];
    countries?: CountryRow[];
}) {
    const isCreate = id === 'new';
    const initialSportId = data.sport_id ?? 'rugby';
    const rawInitialRuleset = (data.ruleset && typeof data.ruleset === 'object') ? data.ruleset as Record<string, any> : {};
    const initialCompetitionFormat = normalizeTournamentFormat(
        rawInitialRuleset.competition?.format_type ?? data.format ?? 'league',
        'league',
    );
    const initialOrganizerUnionIds = getInitialOrganizerUnionIds(data);
    const router = useRouter();
    const { refresh } = useAdminConsole();

    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [slugEdited, setSlugEdited] = useState(false);
    const [bonusDrafts, setBonusDrafts] = useState<Record<string, string>>({});
    const [isCreatingUnion, setIsCreatingUnion] = useState(false);
    const [newUnionName, setNewUnionName] = useState('');
    const [isCreatingOrganizerInline, setIsCreatingOrganizerInline] = useState(false);
    const [availableUnions, setAvailableUnions] = useState(unions);
    const [pendingOrganizerId, setPendingOrganizerId] = useState('');
    const [organizerUnionIds, setOrganizerUnionIds] = useState<string[]>(initialOrganizerUnionIds);
    const baseCountryOptions = useMemo(
        () =>
            getTournamentCountryOptions(
                countries.map((country) => ({
                    id: country.id,
                    name: country.name,
                    code: country.code,
                    flag_emoji: country.flag_emoji,
                })),
            ),
        [countries],
    );

    const [form, setForm] = useState(() => ({
        name: data.name ?? '',
        slug: data.slug ?? '',
        season_id: data.season_id ?? new Date().getFullYear().toString(),
        union_id: data.union_id ?? '',
        sport_id: initialSportId,
        category: data.category ?? '',
        age_grade: data.age_grade ?? 'Mayores',
        status: data.status === 'published' || data.status === 'active' ? 'live' : (data.status ?? 'draft'),
        is_visible: data.is_visible ?? true,
        priority: data.priority ?? 0,
        country_id: normalizeCountryId(data.country_id ?? data.country ?? '', baseCountryOptions),
        region: data.region ?? '',
        format: initialCompetitionFormat,
    }));
    const countryOptions = useMemo(() => {
        if (!form.country_id) return baseCountryOptions;

        const normalizedCountryId = normalizeCountryId(form.country_id, baseCountryOptions);
        const existingOption = baseCountryOptions.find((option) => option.id === normalizedCountryId);
        if (existingOption) return baseCountryOptions;

        return [
            {
                id: normalizedCountryId,
                label: data.country || form.country_id,
            },
            ...baseCountryOptions,
        ];
    }, [baseCountryOptions, data.country, form.country_id]);
    const selectedCountryLabel = useMemo(
        () => countryOptions.find((option) => option.id === form.country_id)?.label || null,
        [countryOptions, form.country_id],
    );

    const [ruleset, setRuleset] = useState<TournamentRulesetEditorState>(() => {
        const r = { ...rawInitialRuleset };
        const baseStandings = r.standings ?? getSportPreset(initialSportId);
        const baseTiebreakers = r.tiebreakers ?? { order: [...DEFAULT_TIEBREAKER_ORDER] };
        const competitionParameters = r.competition?.parameters ?? null;
        const competitionFormat = normalizeTournamentFormat(r.competition?.format_type ?? initialCompetitionFormat);
        const defaultPhaseFormat = competitionFormat === 'circuit' ? 'league' : competitionFormat;

        if (!r.phases || !Array.isArray(r.phases)) {
            r.phases = [normalisePhaseState({
                id: 'phase_1',
                name: buildDefaultPhaseName(0, defaultPhaseFormat, competitionFormat === 'circuit'),
                format: defaultPhaseFormat,
                standings: JSON.parse(JSON.stringify(baseStandings)),
                tiebreakers: JSON.parse(JSON.stringify(baseTiebreakers)),
                circuitPoints: buildDefaultCircuitPlacementPoints(),
            }, 0, baseStandings, baseTiebreakers, competitionFormat)];
        }
        else {
            r.phases = r.phases.map((phase: any, index: number) =>
                normalisePhaseState(phase, index, baseStandings, baseTiebreakers, competitionFormat)
            );
        }

        r.competition = buildTournamentCompetitionConfig(competitionFormat, competitionParameters);

        return {
            standings: baseStandings,
            tiebreakers: baseTiebreakers,
            ...r
        } as TournamentRulesetEditorState;
    });
    const isCircuitCompetition = normalizeTournamentFormat(form.format) === 'circuit';

    useLeaveConfirm(isDirty);

    function handleChange(key: string, value: any) {
        setForm(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'name' && isCreate && !slugEdited) next.slug = slugify(value);
            if (key === 'sport_id' && isCreate) {
                const preset = getSportPreset(value);
                setRuleset((r: TournamentRulesetEditorState) => ({
                    ...r,
                    standings: preset,
                    phases: r.phases.map((p) => ({ ...p, standings: getSportPreset(value) })),
                }));
            }
            return next;
        });
        setIsDirty(true);
        setMessage('');
    }

    function handleRulesetChange(path: string, value: any) {
        setRuleset((prev: TournamentRulesetEditorState) => {
            const next = JSON.parse(JSON.stringify(prev));
            const parts = path.split('.');
            let cur: any = next;
            for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
            cur[parts[parts.length - 1]] = value;
            return next as TournamentRulesetEditorState;
        });
        setIsDirty(true);
    }

    function setCompetitionModel(mode: 'standard' | 'circuit') {
        const nextCompetitionFormat =
            mode === 'circuit'
                ? 'circuit'
                : normalizeTournamentFormat(ruleset.phases?.[0]?.format || form.format, 'league');

        setForm((prev) => ({
            ...prev,
            format: nextCompetitionFormat,
        }));

        setRuleset((prev: TournamentRulesetEditorState) => {
            const next = JSON.parse(JSON.stringify(prev));
            const baseStandings = next.standings ?? getSportPreset(form.sport_id);
            const baseTiebreakers = next.tiebreakers ?? { order: [...DEFAULT_TIEBREAKER_ORDER] };
            const existingPhases = Array.isArray(next.phases) && next.phases.length > 0
                ? next.phases
                : [{
                    id: 'phase_1',
                    name: '',
                    format: mode === 'circuit' ? 'league' : nextCompetitionFormat,
                    standings: JSON.parse(JSON.stringify(baseStandings)),
                    tiebreakers: JSON.parse(JSON.stringify(baseTiebreakers)),
                    circuitPoints: buildDefaultCircuitPlacementPoints(),
                }];

            next.phases = existingPhases.map((phase: TournamentPhaseEditorState, index: number) => {
                const previousFormat = normalizeTournamentFormat(phase?.format ?? 'league');
                const safePhaseFormat = mode === 'circuit' && previousFormat === 'circuit'
                    ? 'league'
                    : previousFormat;
                const normalizedPhase = normalisePhaseState(
                    { ...phase, format: safePhaseFormat },
                    index,
                    baseStandings,
                    baseTiebreakers,
                    nextCompetitionFormat,
                );
                const currentName = typeof phase?.name === 'string' ? phase.name.trim() : '';
                const legacyDefaultNames = new Set([
                    buildDefaultPhaseName(index, previousFormat, false),
                    buildDefaultPhaseName(index, previousFormat, true),
                    'Circuit Ranking',
                    `Circuit Stage ${index + 1}`,
                ]);

                if (!currentName || legacyDefaultNames.has(currentName)) {
                    normalizedPhase.name = buildDefaultPhaseName(index, normalizedPhase.format, mode === 'circuit');
                }

                return normalizedPhase;
            });

            next.competition = buildTournamentCompetitionConfig(nextCompetitionFormat, next.competition?.parameters);
            return next as TournamentRulesetEditorState;
        });

        setIsDirty(true);
        setMessage('');
    }

    function applyOrganizerUnionIds(nextIds: string[]) {
        const normalized = dedupeStringArray(nextIds);
        setOrganizerUnionIds(normalized);
        setForm((prev) => ({
            ...prev,
            union_id: normalized[0] || '',
        }));
        setIsDirty(true);
        setMessage('');
    }

    function setBonusDraft(phaseId: string, value: string) {
        setBonusDrafts((prev) => ({
            ...prev,
            [phaseId]: value,
        }));
    }

    function updatePhaseField(phaseIdx: number, field: keyof TournamentPhaseEditorState, value: unknown) {
        handleRulesetChange(`phases.${phaseIdx}.${field}`, value);
    }

    function addCircuitPlacementRule(phaseIdx: number) {
        const currentRules = normalizeCircuitPlacementPoints(ruleset.phases[phaseIdx].circuitPoints);
        handleRulesetChange(`phases.${phaseIdx}.circuitPoints`, [
            ...currentRules,
            {
                position: currentRules.length + 1,
                points: 0,
            },
        ]);
    }

    function updateCircuitPlacementRule(phaseIdx: number, ruleIdx: number, points: number) {
        const currentRules = normalizeCircuitPlacementPoints(ruleset.phases[phaseIdx].circuitPoints);
        const nextRules = currentRules.map((rule, index) =>
            index === ruleIdx
                ? { ...rule, points }
                : rule,
        );
        handleRulesetChange(`phases.${phaseIdx}.circuitPoints`, nextRules);
    }

    function removeCircuitPlacementRule(phaseIdx: number, ruleIdx: number) {
        const currentRules = normalizeCircuitPlacementPoints(ruleset.phases[phaseIdx].circuitPoints);
        if (currentRules.length <= 1) return;
        const nextRules = currentRules
            .filter((_, index) => index !== ruleIdx)
            .map((rule, index) => ({
                ...rule,
                position: index + 1,
            }));
        handleRulesetChange(`phases.${phaseIdx}.circuitPoints`, nextRules);
    }

    function updatePhaseGroupCount(phaseIdx: number, nextCountValue: number) {
        const safeCount = Math.max(DEFAULT_GROUP_COUNT, Number(nextCountValue) || DEFAULT_GROUP_COUNT);
        const currentNames = normalizeGroupNames(ruleset.phases[phaseIdx].group_names, safeCount);
        const nextNames = Array.from({ length: safeCount }, (_, index) => currentNames[index] || `Group ${String.fromCharCode(65 + index)}`);
        handleRulesetChange(`phases.${phaseIdx}.group_names`, nextNames);
    }

    function updatePhaseGroupName(phaseIdx: number, groupIdx: number, value: string) {
        const nextNames = normalizeGroupNames(ruleset.phases[phaseIdx].group_names).map((groupName, index) =>
            index === groupIdx ? value : groupName,
        );
        handleRulesetChange(`phases.${phaseIdx}.group_names`, nextNames);
    }

    function updatePhaseLabels(phaseIdx: number, nextLabels: GroupLabel[]) {
        handleRulesetChange(`phases.${phaseIdx}.groupLabels`, nextLabels);
    }

    function addPhaseLabel(phaseIdx: number) {
        const currentLabels = normalizePhaseLabels(ruleset.phases[phaseIdx].groupLabels);
        const autoColorIndex = currentLabels.length;
        updatePhaseLabels(phaseIdx, [
            ...currentLabels,
            {
                id: `label_${Date.now()}`,
                name: `Label ${currentLabels.length + 1}`,
                colorMode: 'auto',
                color: getAutoLabelColor(autoColorIndex),
                autoColorIndex,
            },
        ]);
    }

    function updatePhaseLabelField(
        phaseIdx: number,
        labelIdx: number,
        field: 'name' | 'colorMode' | 'color',
        value: string,
    ) {
        const nextLabels: GroupLabel[] = normalizePhaseLabels(ruleset.phases[phaseIdx].groupLabels).map((label, index): GroupLabel => {
            if (index !== labelIdx) return label;

            if (field === 'colorMode') {
                const colorMode: GroupLabel['colorMode'] = value === 'manual' ? 'manual' : 'auto';
                return {
                    ...label,
                    colorMode,
                    color: colorMode === 'manual'
                        ? label.color
                        : getAutoLabelColor(label.autoColorIndex ?? index),
                };
            }

            if (field === 'name') {
                return {
                    ...label,
                    name: value,
                };
            }

            return {
                ...label,
                color: value,
            };
        });

        updatePhaseLabels(phaseIdx, nextLabels);
    }

    function removePhaseLabel(phaseIdx: number, labelIdx: number) {
        const nextLabels = normalizePhaseLabels(ruleset.phases[phaseIdx].groupLabels).filter((_, index) => index !== labelIdx);
        updatePhaseLabels(phaseIdx, nextLabels);
    }

    function addTiebreaker(phaseIdx: number, key: string) {
        const currentOrder = ruleset.phases[phaseIdx].tiebreakers.order;
        if (currentOrder.includes(key)) return;
        handleRulesetChange(`phases.${phaseIdx}.tiebreakers.order`, [...currentOrder, key]);
    }

    function removeTiebreaker(phaseIdx: number, key: string) {
        const currentOrder = ruleset.phases[phaseIdx].tiebreakers.order;
        if (currentOrder.length <= 1) return;
        handleRulesetChange(
            `phases.${phaseIdx}.tiebreakers.order`,
            currentOrder.filter((item: string) => item !== key),
        );
    }

    async function createOrganizerUnion(name: string) {
        const trimmedName = name.trim();
        if (!trimmedName) return null;

        setIsCreatingOrganizerInline(true);
        setMessage('');
        try {
            const unionResult = await createEntity('union', { name: trimmedName });
            const createdUnion = { id: unionResult.id, name: trimmedName };

            setAvailableUnions((prev) =>
                [...prev, createdUnion].sort((left, right) => left.name.localeCompare(right.name, 'es'))
            );
            applyOrganizerUnionIds([...organizerUnionIds, createdUnion.id]);
            setNewUnionName('');
            setIsCreatingUnion(false);
            return createdUnion.id;
        } catch (err: any) {
            setMessage(`Error: ${err.message ?? 'No se pudo crear la unión.'}`);
            return null;
        } finally {
            setIsCreatingOrganizerInline(false);
        }
    }

    async function syncTournamentPhases(tournamentId: string, phasesToSync: TournamentPhaseEditorState[]) {
        const existingPhasesResponse = await fetch(`/api/tournaments/${tournamentId}/phases`);
        if (!existingPhasesResponse.ok) {
            throw new Error('No se pudieron cargar las fases actuales del torneo.');
        }

        const existingPhasesPayload = await existingPhasesResponse.json();
        const existingPhases = Array.isArray(existingPhasesPayload?.data) ? existingPhasesPayload.data : [];

        for (let index = 0; index < phasesToSync.length; index += 1) {
            const phase = phasesToSync[index];
            const existingPhase = existingPhases[index];
            const payload = buildTournamentPhasePayload(phase, index + 1, {
                isCircuitCompetition,
            });
            const response = await fetch(
                existingPhase
                    ? `/api/tournaments/${tournamentId}/phases/${existingPhase.id}`
                    : `/api/tournaments/${tournamentId}/phases`,
                {
                    method: existingPhase ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
            );

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.error || `No se pudo guardar la fase "${phase.name}".`);
            }
        }

        const extraExistingPhases = existingPhases.slice(phasesToSync.length);
        for (const extraPhase of extraExistingPhases) {
            const deleteResponse = await fetch(`/api/tournaments/${tournamentId}/phases/${extraPhase.id}`, {
                method: 'DELETE',
            });

            if (!deleteResponse.ok) {
                const errorPayload = await deleteResponse.json().catch(() => null);
                throw new Error(errorPayload?.error || `No se pudo eliminar la fase sobrante "${extraPhase.name || extraPhase.id}".`);
            }
        }
    }

    function addBonusRule(phaseIdx: number) {
        const phaseId = ruleset.phases[phaseIdx].id;
        const label = (bonusDrafts[phaseId] || '').trim();
        if (!label) return;
        const currentBonus = ruleset.phases[phaseIdx].standings.bonus_rules;
        handleRulesetChange(`phases.${phaseIdx}.standings.bonus_rules`, [
            ...currentBonus,
            { id: `bonus_${Date.now()}`, label, points_awarded: 1 },
        ]);
        setBonusDraft(phaseId, '');
    }

    function removeBonusRule(phaseIdx: number, ruleId: string) {
        const currentBonus = ruleset.phases[phaseIdx].standings.bonus_rules;
        handleRulesetChange(
            `phases.${phaseIdx}.standings.bonus_rules`,
            currentBonus.filter((r: any) => r.id !== ruleId),
        );
    }

    function moveTiebreaker(phaseIdx: number, tbIdx: number, dir: -1 | 1) {
        const order = [...ruleset.phases[phaseIdx].tiebreakers.order];
        [order[tbIdx], order[tbIdx + dir]] = [order[tbIdx + dir], order[tbIdx]];
        handleRulesetChange(`phases.${phaseIdx}.tiebreakers.order`, order);
    }

    function addNewPhase() {
        const nextIdx = ruleset.phases.length + 1;
        const defaultFormat = isCircuitCompetition ? 'league' : 'knockout';
        const newPhase = normalisePhaseState({
            id: `phase_${nextIdx}_${Date.now()}`,
            name: buildDefaultPhaseName(nextIdx - 1, defaultFormat, isCircuitCompetition),
            format: defaultFormat,
            standings: JSON.parse(JSON.stringify(ruleset.standings)),
            tiebreakers: JSON.parse(JSON.stringify(ruleset.tiebreakers)),
            circuitPoints: isCircuitCompetition
                ? JSON.parse(JSON.stringify(ruleset.phases[0]?.circuitPoints || buildDefaultCircuitPlacementPoints()))
                : buildDefaultCircuitPlacementPoints(),
        }, nextIdx - 1, ruleset.standings, ruleset.tiebreakers, form.format);
        handleRulesetChange('phases', [...ruleset.phases, newPhase]);
        setIsDirty(true);
    }

    function removePhase(idx: number) {
        if (ruleset.phases.length <= 1) return;
        const nextPhases = ruleset.phases.filter((_: any, i: number) => i !== idx);
        handleRulesetChange('phases', nextPhases);
        setIsDirty(true);
    }

    async function handleSubmit() {
        if (!form.name.trim()) { setMessage('Error: Name is required'); return; }
        setIsSaving(true);
        setMessage('');
        try {
            const organizerIds = dedupeStringArray(organizerUnionIds);

            if (isCreatingUnion && newUnionName.trim()) {
                const createdOrganizerId = await createOrganizerUnion(newUnionName.trim());
                if (createdOrganizerId) {
                    organizerIds.push(createdOrganizerId);
                }
            }

            const normalizedOrganizerIds = dedupeStringArray(organizerIds);
            const primaryOrganizerId = normalizedOrganizerIds[0] || null;
            const effectiveFormat = normalizeTournamentFormat(
                form.format === 'circuit' ? 'circuit' : (ruleset.phases[0]?.format || form.format),
            );
            const competition = buildTournamentCompetitionConfig(
                effectiveFormat,
                ruleset.competition?.parameters,
            );
            const stageSummaries = ruleset.phases.map((phase: TournamentPhaseEditorState, index: number) => ({
                id: phase.id,
                order: index + 1,
                name: phase.name.trim() || buildDefaultPhaseName(index, phase.format, effectiveFormat === 'circuit'),
                format: normalizeTournamentFormat(phase.format),
                ranking_source: normalizeTournamentFormat(phase.format) === 'event' ? 'final_event_result' : 'phase_standings',
                circuit_points: phase.circuitPoints,
            }));
            const organizerEntries: OrganizerUnionEntry[] = normalizedOrganizerIds.map((organizerId, index) => ({
                union_id: organizerId,
                name: availableUnions.find((union) => union.id === organizerId)?.name || null,
                is_primary: index === 0,
            }));
            const nextRuleset = {
                ...ruleset,
                organizer_union_ids: normalizedOrganizerIds,
                organizers: organizerEntries,
                standings: ruleset.phases[0]?.standings || ruleset.standings,
                tiebreakers: ruleset.phases[0]?.tiebreakers || ruleset.tiebreakers,
                competition,
                stages: effectiveFormat === 'circuit' ? stageSummaries : null,
                circuit: effectiveFormat === 'circuit'
                    ? {
                        enabled: true,
                        accumulation: {
                            method: 'sum',
                            rankingScope: 'event_points',
                        },
                        stageCount: ruleset.phases.length,
                        stages: stageSummaries,
                    }
                    : null,
            };
            const payload = {
                ...form,
                country: form.country_id ? (selectedCountryLabel || form.country_id) : null,
                country_id: form.country_id || null,
                union_id: primaryOrganizerId,
                format: effectiveFormat,
                status: form.status === 'live' ? 'published' : form.status,
                priority: form.priority ?? 0,
                ruleset: nextRuleset,
            };
            if (isCreate) {
                const result = await createEntity('tournament', payload);
                await syncTournamentPhases(result.id, ruleset.phases);
                setIsDirty(false);
                refresh();
                router.push(`/admin/entities/${result.id}/manage?type=tournament&tab=resumen`);
            } else {
                await updateEntity('tournament', id, payload);
                await syncTournamentPhases(id, ruleset.phases);
                setIsDirty(false);
                refresh();
                setMessage('Saved successfully.');
                router.refresh();
            }
        } catch (err: any) {
            setMessage('Error: ' + (err.message ?? 'Unknown error'));
        } finally {
            setIsSaving(false);
        }
    }


    /* ── render ── */
    return (
        <div style={{ backgroundColor: T.bgDeep, color: T.textMain, fontFamily: T.sans, position: 'relative', minHeight: '100vh' }}>

            {/* Electromagnetic grid overlay (body::before equivalent) */}
            <div style={{
                position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
                background: `radial-gradient(circle at 50% 50%, rgba(0,255,102,0.02) 0%, transparent 70%),
                             repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.01) 1px, transparent 2px)`,
            }} />

            {/* App container */}
            <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '1rem 2rem 5rem' }}>

                {/* ── Tournament Hero Header (sticky) ──────────────────────── */}
                <header style={{
                    backgroundColor: T.bgMatte,
                    border: `1px solid ${T.border}`,
                    padding: '1.5rem 2rem',
                    borderRadius: T.radius,
                    marginBottom: '2rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    position: 'sticky',
                    top: '1rem',
                    zIndex: 100,
                    backdropFilter: 'blur(10px)',
                }}>
                    {/* hero-info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        {/* logo placeholder badge */}
                        <div style={{
                            width: 50, height: 50,
                            backgroundColor: T.bgSurface,
                            border: `1px dashed ${T.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: T.radius,
                            color: T.textDim,
                            fontSize: '0.65rem',
                            textTransform: 'uppercase',
                        }}>Logo</div>

                        {/* hero-meta */}
                        <div>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                                {form.name || 'New Tournament'}
                            </h1>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                {/* active pill */}
                                <span style={{
                                    fontFamily: T.mono, fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    backgroundColor: T.neonDim,
                                    border: `1px solid ${T.neonDim}`,
                                    color: T.neon, textTransform: 'uppercase',
                                    borderRadius: T.radius,
                                }}>Status: {form.status}</span>
                                <span style={{
                                    fontFamily: T.mono, fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    backgroundColor: T.bgSurface,
                                    border: `1px solid ${T.border}`,
                                    color: T.textDim, textTransform: 'uppercase',
                                    borderRadius: T.radius,
                                }}>Season: {form.season_id}</span>
                                <span style={{
                                    fontFamily: T.mono, fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    backgroundColor: T.bgSurface,
                                    border: `1px solid ${T.border}`,
                                    color: T.textDim, textTransform: 'uppercase',
                                    borderRadius: T.radius,
                                }}>{isCreate ? 'ID: NEW' : `ID: ${id.slice(0, 8).toUpperCase()}`}</span>
                            </div>
                        </div>
                    </div>

                    {/* hero-actions */}
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={() => router.back()} style={S.btnGhost}>Preview</button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSaving}
                            style={{ ...S.btnPrimary, opacity: isSaving ? 0.6 : 1 }}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </header>

                {/* ── Toast message ─────────────────────────────────────────── */}
                {message && (
                    <div style={{
                        backgroundColor: message.startsWith('Error') ? 'rgba(255,68,68,0.08)' : T.neonDim,
                        border: `1px solid ${message.startsWith('Error') ? 'rgba(255,68,68,0.3)' : T.neonDim}`,
                        color: message.startsWith('Error') ? '#ff6666' : T.neon,
                        padding: '0.8rem 1rem',
                        borderRadius: T.radius,
                        fontSize: '0.85rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'center',
                    }}>
                        <span>{message.startsWith('Error') ? '[x]' : '[ok]'}</span>
                        {message}
                    </div>
                )}

                {/* ── Main form content ─────────────────────────────────── */}
                <main style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* ════════════════════════════════════════════════════
                            SECTION 1 — Basic Identity
                        ════════════════════════════════════════════════════ */}
                    <section id="identity" style={S.sectionCard}>
                        <div style={S.sectionHeader}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Basic Identity</h2>
                                <p style={{ color: T.textDim, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    Global identification for the tournament system.
                                </p>
                            </div>
                        </div>

                        {/* Row 1: Name (2fr) + Slug (1fr) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                            <div style={S.formGroup}>
                                <label style={S.label}>Tournament Name *</label>
                                <input
                                    type="text"
                                    style={S.input}
                                    placeholder="e.g. Super Rugby Pacific"
                                    value={form.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Slug (Automatic)</label>
                                <input
                                    type="text"
                                    style={{ ...S.input, ...S.inputMono }}
                                    value={form.slug}
                                    onChange={e => {
                                        setSlugEdited(true);
                                        handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                    }}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        {/* Row 2: Organizer (1fr) + Country (1fr) + Region (1fr) + Season (1fr) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1fr 1fr 1fr', gap: '1.5rem' }}>
                            <div style={S.formGroup}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <label style={{ ...S.label, marginBottom: 0 }}>Organizer (Union/Federation)</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreatingUnion(!isCreatingUnion)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: T.neon,
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            padding: '2px 4px',
                                        }}
                                    >
                                        {isCreatingUnion ? 'x CANCEL NEW' : '+ CREATE NEW'}
                                    </button>
                                </div>
                                {isCreatingUnion ? (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            placeholder="New Union Name..."
                                            style={{ ...S.input, borderColor: T.neon, flex: 1 }}
                                            value={newUnionName}
                                            onChange={e => {
                                                setNewUnionName(e.target.value);
                                                setIsDirty(true);
                                            }}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void createOrganizerUnion(newUnionName)}
                                            disabled={!newUnionName.trim() || isCreatingOrganizerInline}
                                            style={{
                                                ...S.btnPrimary,
                                                padding: '0.75rem 1rem',
                                                opacity: !newUnionName.trim() || isCreatingOrganizerInline ? 0.6 : 1,
                                                cursor: !newUnionName.trim() || isCreatingOrganizerInline ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {isCreatingOrganizerInline ? 'Creating...' : 'Add'}
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <select
                                            style={{ ...S.input, flex: 1 }}
                                            value={pendingOrganizerId}
                                            onChange={e => setPendingOrganizerId(e.target.value)}
                                            onFocus={e => { e.target.style.borderColor = T.neon; }}
                                            onBlur={e => { e.target.style.borderColor = T.border; }}
                                        >
                                            <option value="">Select existing...</option>
                                            {availableUnions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!pendingOrganizerId) return;
                                                applyOrganizerUnionIds([...organizerUnionIds, pendingOrganizerId]);
                                                setPendingOrganizerId('');
                                            }}
                                            disabled={!pendingOrganizerId}
                                            style={{
                                                ...S.btnGhost,
                                                padding: '0.75rem 1rem',
                                                border: `1px dashed ${T.border}`,
                                                borderRadius: T.radius,
                                                opacity: pendingOrganizerId ? 1 : 0.5,
                                                cursor: pendingOrganizerId ? 'pointer' : 'not-allowed',
                                            }}
                                        >
                                            + ADD
                                        </button>
                                    </div>
                                )}
                                <div style={{ color: T.textDim, fontSize: '0.72rem', marginTop: '0.45rem', lineHeight: 1.5 }}>
                                    Puedes dejar el torneo sin organizadora o sumar varias. La primera de la lista queda como principal.
                                </div>
                                {organizerUnionIds.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
                                        {organizerUnionIds.map((organizerId, index) => {
                                            const organizerName = availableUnions.find((union) => union.id === organizerId)?.name || organizerId;
                                            return (
                                                <div
                                                    key={organizerId}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        padding: '0.35rem 0.55rem',
                                                        borderRadius: T.radius,
                                                        border: `1px solid ${index === 0 ? T.neon : T.border}`,
                                                        backgroundColor: index === 0 ? T.neonDim : T.bgSurface,
                                                        color: index === 0 ? T.neon : T.textMain,
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <span>{organizerName}</span>
                                                    {index === 0 && (
                                                        <span style={{ color: T.textDim, fontSize: '0.62rem', fontFamily: T.mono }}>
                                                            PRIMARY
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => applyOrganizerUnionIds(organizerUnionIds.filter((value) => value !== organizerId))}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: 'inherit',
                                                            cursor: 'pointer',
                                                            fontSize: '0.72rem',
                                                            padding: 0,
                                                        }}
                                                        aria-label={`Remove organizer ${organizerName}`}
                                                    >
                                                        x
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Country</label>
                                <select
                                    style={S.input}
                                    value={form.country_id}
                                    onChange={e => handleChange('country_id', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; }}
                                >
                                    <option value="">No especificado</option>
                                    {countryOptions.map((country) => (
                                        <option key={country.id} value={country.id}>{country.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Region</label>
                                <input
                                    type="text"
                                    style={S.input}
                                    placeholder="State / Region"
                                    value={form.region}
                                    onChange={e => handleChange('region', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Season</label>
                                <input
                                    type="text"
                                    style={{ ...S.input, ...S.inputMono }}
                                    value={form.season_id}
                                    onChange={e => handleChange('season_id', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 280px)', gap: '1.5rem', marginTop: '1rem' }}>
                            <div style={S.formGroup}>
                                <label style={S.label}>Public Priority</label>
                                <input
                                    type="number"
                                    style={{ ...S.input, ...S.inputMono }}
                                    value={form.priority}
                                    onChange={e => handleChange('priority', Number.parseInt(e.target.value, 10) || 0)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                                <div style={{ color: T.textDim, fontSize: '0.72rem', marginTop: '0.45rem' }}>
                                    Higher numbers appear first in the public view. Equal priority falls back to alphabetical order.
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Visibility toggle + Status */}
                        <div style={{
                            display: 'flex',
                            gap: '3rem',
                            marginTop: '1rem',
                            borderTop: `1px solid ${T.border}`,
                            paddingTop: '1.5rem',
                            alignItems: 'center',
                        }}>
                            {/* Visibility */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ ...S.label, marginBottom: 0 }}>Visible in Catalogue</label>
                                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 20 }}>
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={form.is_visible}
                                        onChange={e => handleChange('is_visible', e.target.checked)}
                                    />
                                    <div className="peer-checked:bg-[rgba(0,255,102,0.1)] peer-checked:border-[#00FF66] after:peer-checked:translate-x-5 after:peer-checked:bg-[#00FF66]"
                                        style={{
                                            position: 'absolute', inset: 0,
                                            backgroundColor: T.bgSurface,
                                            border: `1px solid ${T.border}`,
                                            borderRadius: 20,
                                            transition: '0.4s',
                                            cursor: 'pointer',
                                        }}>
                                        <div
                                            className="peer-checked:translate-x-5 peer-checked:bg-[#00FF66]"
                                            style={{
                                                position: 'absolute',
                                                height: 14, width: 14,
                                                left: 2, bottom: 2,
                                                backgroundColor: form.is_visible ? T.neon : T.textDim,
                                                borderRadius: '50%',
                                                transition: '0.4s',
                                                transform: form.is_visible ? 'translateX(20px)' : 'translateX(0)',
                                            }}
                                        />
                                    </div>
                                </label>
                            </div>

                            {/* Status */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ ...S.label, marginBottom: 0 }}>Status</label>
                                <div style={{ display: 'flex', gap: '0' }}>
                                    {(['draft', 'live'] as const).map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => handleChange('status', s)}
                                            style={{
                                                padding: '0.3rem 0.9rem',
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                fontFamily: T.mono,
                                                cursor: 'pointer',
                                                border: `1px solid ${T.border}`,
                                                borderRadius: s === 'draft' ? `${T.radius} 0 0 ${T.radius}` : `0 ${T.radius} ${T.radius} 0`,
                                                marginLeft: s === 'live' ? '-1px' : 0,
                                                backgroundColor: form.status === s ? T.neonDim : T.bgSurface,
                                                color: form.status === s ? T.neon : T.textDim,
                                                borderColor: form.status === s ? T.neonDim : T.border,
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ════════════════════════════════════════════════════
                            SECTION 2 — Sport & Classification
                        ════════════════════════════════════════════════════ */}
                    <section id="classification" style={S.sectionCard}>
                        <div style={S.sectionHeader}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Sport &amp; Classification</h2>
                                <p style={{ color: T.textDim, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    Determine where this tournament appears in the multisport engine.
                                </p>
                            </div>
                        </div>

                        {/* Sport tiles */}
                        <label style={S.label}>Select Sport</label>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: '1rem',
                            marginTop: '0.5rem',
                        }}>
                            {SPORTS.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => handleChange('sport_id', s.id)}
                                    style={{
                                        border: `1px solid ${form.sport_id === s.id ? T.neon : T.border}`,
                                        padding: '1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                                        borderRadius: T.radius,
                                        backgroundColor: form.sport_id === s.id ? T.neonDim : 'transparent',
                                        color: form.sport_id === s.id ? T.neon : T.textDim,
                                        fontFamily: T.sans,
                                    }}
                                >
                                    <span style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block' }}>{s.icon}</span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {s.name}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Category + Age Grade */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
                            <div style={S.formGroup}>
                                <label style={S.label}>Competition Category</label>
                                <input
                                    type="text"
                                    style={S.input}
                                    placeholder="e.g. First Division, Women's A"
                                    value={form.category}
                                    onChange={e => handleChange('category', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; e.target.style.boxShadow = `0 0 10px ${T.neonDim}`; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div style={S.formGroup}>
                                <label style={S.label}>Age Grade</label>
                                <select
                                    style={S.input}
                                    value={form.age_grade}
                                    onChange={e => handleChange('age_grade', e.target.value)}
                                    onFocus={e => { e.target.style.borderColor = T.neon; }}
                                    onBlur={e => { e.target.style.borderColor = T.border; }}
                                >
                                    <option>Mayores</option>
                                    <option>Juveniles</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ════════════════════════════════════════════════════
                            SECTION 3 — Format & Rules Builder
                        ════════════════════════════════════════════════════ */}
                    <section id="format" style={S.sectionCard}>
                        <div style={S.sectionHeader}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                    {isCircuitCompetition ? 'Circuit Builder' : 'Format &amp; Rules Builder'}
                                </h2>
                                <p style={{ color: T.textDim, fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    {isCircuitCompetition
                                        ? 'El circuito es la competencia principal y cada etapa funciona como un subtorneo con formato propio.'
                                        : 'Configure phases, scoring systems, and tie-breakers.'}
                                </p>
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isCircuitCompetition ? 'minmax(0, 1.3fr) minmax(280px, 0.9fr)' : 'minmax(0, 1fr)',
                            gap: '1rem',
                            marginBottom: '1.5rem',
                        }}>
                            <div style={{
                                padding: '1rem',
                                borderRadius: T.radius,
                                border: `1px solid ${T.border}`,
                                backgroundColor: T.bgDeep,
                            }}>
                                <label style={S.label}>Competition Model</label>
                                <select
                                    value={isCircuitCompetition ? 'circuit' : 'standard'}
                                    onChange={e => setCompetitionModel(e.target.value === 'circuit' ? 'circuit' : 'standard')}
                                    style={S.input}
                                >
                                    {COMPETITION_MODEL_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p style={{ color: T.textDim, fontSize: '0.75rem', marginTop: '0.65rem', lineHeight: 1.6 }}>
                                    {isCircuitCompetition
                                        ? 'Cada etapa genera su ranking final y asigna puntos a la tabla general del circuito.'
                                        : 'El torneo usa un recorrido interno de fases hasta definir la clasificacion y el campeon.'}
                                </p>
                            </div>

                            {isCircuitCompetition && (
                                <div style={{
                                    padding: '1rem',
                                    borderRadius: T.radius,
                                    border: `1px solid ${T.warnBorder}`,
                                    backgroundColor: T.warnBg,
                                }}>
                                    <label style={S.label}>Circuit Champion Resolution</label>
                                    <select
                                        value={(ruleset.competition?.parameters?.champion_mode as CircuitChampionMode) || 'accumulation'}
                                        onChange={e => handleRulesetChange('competition.parameters.champion_mode', e.target.value)}
                                        style={S.input}
                                    >
                                        {CIRCUIT_CHAMPION_OPTIONS.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p style={{ color: T.textDim, fontSize: '0.72rem', marginTop: '0.65rem', lineHeight: 1.6 }}>
                                        {CIRCUIT_CHAMPION_OPTIONS.find(
                                            (option) => option.id === ((ruleset.competition?.parameters?.champion_mode as CircuitChampionMode) || 'accumulation'),
                                        )?.hint}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Warning box (only when editing) */}
                        {!isCreate && (
                            <div style={{
                                backgroundColor: T.warnBg,
                                border: `1px solid ${T.warnBorder}`,
                                color: T.warn,
                                padding: '1rem',
                                borderRadius: T.radius,
                                fontSize: '0.85rem',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                gap: '1rem',
                                alignItems: 'center',
                            }}>
                                <span>[!]</span>
                                <div>
                                    <strong>Active Tournament:</strong> Changing rules will trigger a full recalculation of current standings.
                                </div>
                            </div>
                        )}

                        {/* Phase container */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            {ruleset.phases.map((phase: any, idx: number) => (
                                <div key={phase.id} style={{
                                    backgroundColor: T.bgDeep,
                                    border: `1px solid ${T.border}`,
                                    borderRadius: T.radius,
                                    padding: '1.5rem',
                                    position: 'relative',
                                }}>
                                    {/* Phase header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{
                                                backgroundColor: T.neon,
                                                color: T.bgDeep,
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '2px',
                                                fontSize: '0.6rem',
                                                fontWeight: 900,
                                                fontFamily: T.mono
                                            }}>{isCircuitCompetition ? 'STAGE' : 'PHASE'}_{String(idx + 1).padStart(2, '0')}</span>
                                            <input
                                                type="text"
                                                value={phase.name}
                                                onChange={e => handleRulesetChange(`phases.${idx}.name`, e.target.value)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: T.textMain,
                                                    fontFamily: T.sans,
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    padding: '2px 4px',
                                                    outline: 'none',
                                                    borderBottom: `1px solid transparent`
                                                }}
                                                onFocus={e => e.target.style.borderBottomColor = T.neon}
                                                onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                                            />
                                        </div>
                                        {ruleset.phases.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removePhase(idx)}
                                                style={{ ...S.btnGhost, padding: '0.25rem', color: T.danger, minHeight: 0 }}
                                            >
                                                x Remove {isCircuitCompetition ? 'Stage' : 'Phase'}
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '2rem' }}>
                                        {/* Left: format & points */}
                                        <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: '2rem' }}>
                                            <div style={S.formGroup}>
                                                <label style={S.label}>{isCircuitCompetition ? 'Stage Name' : 'Phase Name'}</label>
                                                <input
                                                    type="text"
                                                    value={phase.name}
                                                    onChange={e => updatePhaseField(idx, 'name', e.target.value)}
                                                    style={S.input}
                                                    placeholder={isCircuitCompetition ? `Stage ${idx + 1}` : `Phase ${idx + 1}`}
                                                />
                                            </div>

                                            <div style={S.formGroup}>
                                                <label style={S.label}>{isCircuitCompetition ? 'Stage Format' : 'Competition Format'}</label>
                                                <select
                                                    value={phase.format}
                                                    onChange={e => {
                                                        const nextFormat = normalizeTournamentFormat(e.target.value);
                                                        handleRulesetChange(`phases.${idx}.format`, nextFormat);
                                                        if (nextFormat === 'groups' && (!Array.isArray(phase.group_names) || phase.group_names.length < DEFAULT_GROUP_COUNT)) {
                                                            handleRulesetChange(`phases.${idx}.group_names`, buildDefaultGroupNames(DEFAULT_GROUP_COUNT));
                                                        }
                                                        if (nextFormat === 'series') {
                                                            handleRulesetChange(`phases.${idx}.legs`, 2);
                                                        }
                                                        if (nextFormat === 'knockout' && !phase.teamsCount) {
                                                            handleRulesetChange(`phases.${idx}.teamsCount`, 2);
                                                        }
                                                        if (!isCircuitCompetition && idx === 0) handleChange('format', nextFormat);
                                                    }}
                                                    style={S.input}
                                                >
                                                    {FORMAT_OPTIONS.map(opt => (
                                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                    ))}
                                                </select>
                                                {getTournamentFormatDescription(phase.format) && (
                                                    <p style={{ color: T.textDim, fontSize: '0.75rem', marginTop: '0.65rem', lineHeight: 1.5 }}>
                                                        {getTournamentFormatDescription(phase.format)}
                                                    </p>
                                                )}
                                            </div>

                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                                gap: '1rem',
                                                marginTop: '1.5rem',
                                                padding: '1rem',
                                                border: `1px solid ${T.border}`,
                                                borderRadius: T.radius,
                                                backgroundColor: T.bgSurface,
                                            }}>
                                                <div>
                                                    <label style={{ ...S.label, fontSize: '0.6rem' }}>
                                                        {isCircuitCompetition ? 'Teams in Stage' : 'Teams Count'}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={phase.teamsCount}
                                                        onChange={e => updatePhaseField(idx, 'teamsCount', Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
                                                        style={{ ...S.input, ...S.inputMono }}
                                                    />
                                                </div>

                                                {(phase.format === 'league' || phase.format === 'series') && (
                                                    <>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Rounds / Legs</label>
                                                            <select
                                                                value={phase.legs}
                                                                onChange={e => updatePhaseField(idx, 'legs', Number(e.target.value) === 2 ? 2 : 1)}
                                                                style={S.input}
                                                            >
                                                                <option value={1}>Single Round</option>
                                                                <option value={2}>Home and Away</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Advance to Next Stage</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={phase.advanceCount}
                                                                onChange={e => updatePhaseField(idx, 'advanceCount', Number.parseInt(e.target.value, 10) || 0)}
                                                                style={{ ...S.input, ...S.inputMono }}
                                                            />
                                                        </div>
                                                    </>
                                                )}

                                                {phase.format === 'groups' && (
                                                    <>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Groups</label>
                                                            <input
                                                                type="number"
                                                                min={DEFAULT_GROUP_COUNT}
                                                                value={Math.max(DEFAULT_GROUP_COUNT, phase.group_names.length)}
                                                                onChange={e => updatePhaseGroupCount(idx, Number.parseInt(e.target.value, 10) || DEFAULT_GROUP_COUNT)}
                                                                style={{ ...S.input, ...S.inputMono }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Qualify per Group</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={phase.advanceCount}
                                                                onChange={e => updatePhaseField(idx, 'advanceCount', Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                                                                style={{ ...S.input, ...S.inputMono }}
                                                            />
                                                        </div>
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Group Names</label>
                                                            <div style={{ display: 'grid', gap: '0.6rem' }}>
                                                                {phase.group_names.map((groupName: string, groupIdx: number) => (
                                                                    <input
                                                                        key={`${phase.id}-group-${groupIdx}`}
                                                                        type="text"
                                                                        value={groupName}
                                                                        onChange={e => updatePhaseGroupName(idx, groupIdx, e.target.value)}
                                                                        style={S.input}
                                                                        placeholder={`Group ${String.fromCharCode(65 + groupIdx)}`}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {phase.format === 'knockout' && (
                                                    <>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Advance from Previous Stage</label>
                                                            <input
                                                                type="number"
                                                                min={2}
                                                                value={phase.teamsCount}
                                                                onChange={e => updatePhaseField(idx, 'teamsCount', Math.max(2, Number.parseInt(e.target.value, 10) || 2))}
                                                                style={{ ...S.input, ...S.inputMono }}
                                                            />
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'end' }}>
                                                            <label style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.65rem',
                                                                padding: '0.85rem 1rem',
                                                                borderRadius: T.radius,
                                                                border: `1px solid ${T.border}`,
                                                                backgroundColor: T.bgDeep,
                                                                width: '100%',
                                                                cursor: 'pointer',
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={phase.playoffThirdPlace}
                                                                    onChange={e => updatePhaseField(idx, 'playoffThirdPlace', e.target.checked)}
                                                                />
                                                                <span style={{ fontSize: '0.78rem', color: T.textMain }}>Include third-place match</span>
                                                            </label>
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {isCircuitCompetition && (
                                                <div style={{ marginTop: '1.5rem', borderTop: `1px solid ${T.border}`, paddingTop: '1.5rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                                        <label style={{ ...S.label, marginBottom: 0 }}>Circuit Points Awarded</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => addCircuitPlacementRule(idx)}
                                                            style={{ ...S.btnGhost, padding: '0.35rem 0.7rem', fontSize: '0.65rem', border: `1px dashed ${T.border}`, borderRadius: T.radius }}
                                                        >
                                                            + ADD POSITION
                                                        </button>
                                                    </div>

                                                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                                                        {phase.circuitPoints.map((rule: CircuitPlacementRule, ruleIdx: number) => (
                                                            <div
                                                                key={`${phase.id}-circuit-points-${rule.position}-${ruleIdx}`}
                                                                style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: '90px minmax(0, 1fr) 40px',
                                                                    gap: '0.65rem',
                                                                    alignItems: 'center',
                                                                }}
                                                            >
                                                                <div style={{
                                                                    ...S.input,
                                                                    ...S.inputMono,
                                                                    textAlign: 'center',
                                                                    padding: '0.7rem 0.75rem',
                                                                    backgroundColor: T.bgSurface,
                                                                }}>
                                                                    P{rule.position}
                                                                </div>
                                                                <input
                                                                    type="number"
                                                                    value={rule.points}
                                                                    onChange={e => updateCircuitPlacementRule(idx, ruleIdx, Number.parseInt(e.target.value, 10) || 0)}
                                                                    style={{ ...S.input, ...S.inputMono }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeCircuitPlacementRule(idx, ruleIdx)}
                                                                    disabled={phase.circuitPoints.length <= 1}
                                                                    style={{
                                                                        ...S.btnGhost,
                                                                        padding: '0.45rem',
                                                                        color: T.danger,
                                                                        minHeight: 0,
                                                                        justifyContent: 'center',
                                                                        opacity: phase.circuitPoints.length <= 1 ? 0.4 : 1,
                                                                        cursor: phase.circuitPoints.length <= 1 ? 'not-allowed' : 'pointer',
                                                                    }}
                                                                    aria-label={`Remove placement ${rule.position}`}
                                                                >
                                                                    x
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <p style={{ color: T.textDim, fontSize: '0.74rem', marginTop: '0.7rem', lineHeight: 1.5 }}>
                                                        Cada etapa entrega puntos al ranking general del circuito segun su clasificacion final.
                                                    </p>
                                                </div>
                                            )}

                                            {phase.format === 'event' ? (
                                                <div style={{
                                                    marginTop: '1.5rem',
                                                    padding: '1rem',
                                                    borderRadius: T.radius,
                                                    border: `1px dashed ${T.border}`,
                                                    backgroundColor: T.bgSurface,
                                                    color: T.textDim,
                                                    fontSize: '0.78rem',
                                                    lineHeight: 1.6,
                                                }}>
                                                    Este formato representa un evento unico con resultado final. El ranking de la etapa se toma del resultado/clasificacion final del evento, no de una tabla por partidos.
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Win</label>
                                                            <input
                                                                type="number"
                                                                value={phase.standings.points_base.win}
                                                                onChange={e => handleRulesetChange(`phases.${idx}.standings.points_base.win`, parseInt(e.target.value) || 0)}
                                                                style={{ ...S.input, padding: '0.5rem', textAlign: 'center', fontFamily: T.mono, color: T.neon }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Draw</label>
                                                            <input
                                                                type="number"
                                                                value={phase.standings.points_base.draw}
                                                                onChange={e => handleRulesetChange(`phases.${idx}.standings.points_base.draw`, parseInt(e.target.value) || 0)}
                                                                style={{ ...S.input, padding: '0.5rem', textAlign: 'center', fontFamily: T.mono, color: T.neon }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ ...S.label, fontSize: '0.6rem' }}>Loss</label>
                                                            <input
                                                                type="number"
                                                                value={phase.standings.points_base.loss}
                                                                onChange={e => handleRulesetChange(`phases.${idx}.standings.points_base.loss`, parseInt(e.target.value) || 0)}
                                                                style={{ ...S.input, padding: '0.5rem', textAlign: 'center', fontFamily: T.mono, color: T.neon }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div style={{ marginTop: '1.5rem', borderTop: `1px solid ${T.border}`, paddingTop: '1.5rem' }}>
                                                        <label style={S.label}>Bonus Points System</label>

                                                        {phase.standings.bonus_rules.map((rule: any) => (
                                                            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                                                <span style={{ flex: 1, fontSize: '0.8rem', color: T.textMain }}>{rule.label}</span>
                                                                <input
                                                                    type="number"
                                                                    value={rule.points_awarded}
                                                                    onChange={e => {
                                                                        const updated = phase.standings.bonus_rules.map((r: any) =>
                                                                            r.id === rule.id ? { ...r, points_awarded: parseInt(e.target.value) || 0 } : r
                                                                        );
                                                                        handleRulesetChange(`phases.${idx}.standings.bonus_rules`, updated);
                                                                    }}
                                                                    style={{
                                                                        ...S.input,
                                                                        width: 60,
                                                                        textAlign: 'center',
                                                                        padding: '0.4rem',
                                                                        fontFamily: T.mono,
                                                                        color: T.neon,
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeBonusRule(idx, rule.id)}
                                                                    style={{ ...S.btnGhost, padding: '0.2rem 0.4rem', color: T.danger }}
                                                                >x</button>
                                                            </div>
                                                        ))}

                                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                                            <input
                                                                type="text"
                                                                style={{ ...S.input, fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                                                placeholder={isCircuitCompetition ? 'Add rule for this stage...' : 'Add rule for this phase...'}
                                                                value={bonusDrafts[phase.id] || ''}
                                                                onChange={e => setBonusDraft(phase.id, e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && addBonusRule(idx)}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => addBonusRule(idx)}
                                                                style={{ ...S.btnGhost, padding: '0.4rem 0.75rem', fontSize: '0.65rem', border: `1px dashed ${T.border}`, borderRadius: T.radius, whiteSpace: 'nowrap' }}
                                                            >
                                                                + ADD
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            <div style={{ marginTop: '1.5rem', borderTop: `1px solid ${T.border}`, paddingTop: '1.5rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                                    <label style={{ ...S.label, marginBottom: 0 }}>
                                                        {isCircuitCompetition ? 'Stage Labels' : 'Phase Labels'}
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => addPhaseLabel(idx)}
                                                        style={{ ...S.btnGhost, padding: '0.35rem 0.7rem', fontSize: '0.65rem', border: `1px dashed ${T.border}`, borderRadius: T.radius }}
                                                    >
                                                        + ADD LABEL
                                                    </button>
                                                </div>

                                                {phase.groupLabels.length === 0 ? (
                                                    <div style={{
                                                        padding: '0.9rem 1rem',
                                                        borderRadius: T.radius,
                                                        border: `1px dashed ${T.border}`,
                                                        color: T.textDim,
                                                        fontSize: '0.76rem',
                                                        backgroundColor: T.bgSurface,
                                                    }}>
                                                        {isCircuitCompetition
                                                            ? 'No labels configured yet for this stage.'
                                                            : 'No labels configured yet for this phase.'}
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                                        {phase.groupLabels.map((label: GroupLabel, labelIdx: number) => (
                                                            <div
                                                                key={label.id || `${phase.id}-label-${labelIdx}`}
                                                                style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: 'minmax(0, 1fr) 110px 70px 34px',
                                                                    gap: '0.65rem',
                                                                    alignItems: 'center',
                                                                }}
                                                            >
                                                                <input
                                                                    type="text"
                                                                    value={label.name}
                                                                    onChange={e => updatePhaseLabelField(idx, labelIdx, 'name', e.target.value)}
                                                                    style={{ ...S.input, fontSize: '0.82rem' }}
                                                                    placeholder="Label name"
                                                                />
                                                                <select
                                                                    value={label.colorMode}
                                                                    onChange={e => updatePhaseLabelField(idx, labelIdx, 'colorMode', e.target.value)}
                                                                    style={{ ...S.input, fontSize: '0.78rem', padding: '0.7rem 0.75rem' }}
                                                                >
                                                                    <option value="auto">Auto</option>
                                                                    <option value="manual">Manual</option>
                                                                </select>
                                                                <input
                                                                    type="color"
                                                                    value={label.color}
                                                                    onChange={e => updatePhaseLabelField(idx, labelIdx, 'color', e.target.value)}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '42px',
                                                                        borderRadius: T.radius,
                                                                        backgroundColor: T.bgDeep,
                                                                        border: `1px solid ${T.border}`,
                                                                        padding: '0.2rem',
                                                                        cursor: label.colorMode === 'manual' ? 'pointer' : 'not-allowed',
                                                                        opacity: label.colorMode === 'manual' ? 1 : 0.55,
                                                                    }}
                                                                    disabled={label.colorMode !== 'manual'}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removePhaseLabel(idx, labelIdx)}
                                                                    style={{ ...S.btnGhost, padding: '0.45rem', color: T.danger, minHeight: 0, justifyContent: 'center' }}
                                                                    aria-label={`Remove label ${label.name}`}
                                                                >
                                                                    x
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Tie-breaker list */}
                                        <div>
                                            {phase.format === 'event' ? (
                                                <div style={{
                                                    padding: '1rem',
                                                    borderRadius: T.radius,
                                                    border: `1px dashed ${T.border}`,
                                                    backgroundColor: T.bgSurface,
                                                    color: T.textDim,
                                                    fontSize: '0.78rem',
                                                    lineHeight: 1.6,
                                                }}>
                                                    Esta etapa no usa criterios de desempate por tabla. El resultado final del evento define directamente la clasificacion.
                                                </div>
                                            ) : (
                                                <>
                                                    <label style={S.label}>Tie-Breaker Priority</label>
                                                    {phase.tiebreakers.order.map((key: string, tbIdx: number) => (
                                                        <div
                                                            key={key}
                                                            style={{
                                                                backgroundColor: T.bgSurface,
                                                                border: `1px solid ${T.border}`,
                                                                padding: '0.5rem 1rem',
                                                                marginBottom: '0.5rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '1rem',
                                                                fontSize: '0.8rem',
                                                                borderRadius: T.radius,
                                                            }}
                                                        >
                                                            <span style={{ color: T.textDim, fontFamily: T.mono, letterSpacing: '0.1em' }}>::</span>
                                                            <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: T.neon, fontWeight: 700, minWidth: '1.2rem' }}>
                                                                {tbIdx + 1}
                                                            </span>
                                                            <span style={{ flex: 1, color: T.textMain }}>
                                                                {TIEBREAKER_LABELS[key] ?? key}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeTiebreaker(idx, key)}
                                                                disabled={phase.tiebreakers.order.length <= 1}
                                                                style={{
                                                                    ...S.btnGhost,
                                                                    padding: '0.2rem 0.35rem',
                                                                    color: T.danger,
                                                                    minHeight: 0,
                                                                    opacity: phase.tiebreakers.order.length <= 1 ? 0.4 : 1,
                                                                    cursor: phase.tiebreakers.order.length <= 1 ? 'not-allowed' : 'pointer',
                                                                }}
                                                                aria-label={`Remove tiebreaker ${TIEBREAKER_LABELS[key] ?? key}`}
                                                            >
                                                                x
                                                            </button>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                                                <button
                                                                    type="button"
                                                                    disabled={tbIdx === 0}
                                                                    onClick={() => moveTiebreaker(idx, tbIdx, -1)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim, fontSize: '0.6rem', padding: '1px', lineHeight: 1 }}
                                                                >^</button>
                                                                <button
                                                                    type="button"
                                                                    disabled={tbIdx === phase.tiebreakers.order.length - 1}
                                                                    onClick={() => moveTiebreaker(idx, tbIdx, 1)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textDim, fontSize: '0.6rem', padding: '1px', lineHeight: 1 }}
                                                                >v</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div style={{
                                                        marginTop: '1rem',
                                                        paddingTop: '1rem',
                                                        borderTop: `1px solid ${T.border}`,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.75rem',
                                                    }}>
                                                        <label style={{ ...S.label, marginBottom: 0 }}>Available Criteria</label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                                            {TIEBREAKER_OPTIONS
                                                                .filter((option) => !phase.tiebreakers.order.includes(option.key))
                                                                .map((option) => (
                                                                    <button
                                                                        key={option.key}
                                                                        type="button"
                                                                        onClick={() => addTiebreaker(idx, option.key)}
                                                                        style={{
                                                                            ...S.btnGhost,
                                                                            padding: '0.35rem 0.55rem',
                                                                            fontSize: '0.65rem',
                                                                            border: `1px solid ${T.border}`,
                                                                            borderRadius: T.radius,
                                                                            backgroundColor: T.bgSurface,
                                                                            color: T.textMain,
                                                                        }}
                                                                        title={option.description}
                                                                    >
                                                                        + {option.label}
                                                                    </button>
                                                                ))}
                                                        </div>
                                                        {TIEBREAKER_OPTIONS.filter((option) => !phase.tiebreakers.order.includes(option.key)).length === 0 && (
                                                            <div style={{
                                                                padding: '0.8rem 0.9rem',
                                                                borderRadius: T.radius,
                                                                border: `1px dashed ${T.border}`,
                                                                color: T.textDim,
                                                                fontSize: '0.74rem',
                                                                backgroundColor: T.bgSurface,
                                                            }}>
                                                                All available tie-breakers are already included in this phase.
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Add new item button */}
                            <button
                                type="button"
                                onClick={addNewPhase}
                                style={{
                                    width: '100%',
                                    border: `2px dashed ${T.border}`,
                                    padding: '2rem',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: T.textDim,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    borderRadius: T.radius,
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontFamily: T.sans,
                                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = T.neon;
                                    (e.currentTarget as HTMLElement).style.color = T.neon;
                                    (e.currentTarget as HTMLElement).style.backgroundColor = T.neonDim;
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = T.border;
                                    (e.currentTarget as HTMLElement).style.color = T.textDim;
                                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                }}
                            >
                                + ADD NEW {isCircuitCompetition ? 'STAGE / SUBTOURNAMENT' : 'COMPETITION PHASE'}
                            </button>
                        </div>
                    </section>

                    {/* ── Footer actions ───────────────────────────────────── */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                        <button
                            type="button"
                            onClick={() => router.push('/admin/entities')}
                            style={S.btnSecondary}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = T.bgSurface;
                                (e.currentTarget as HTMLElement).style.borderColor = T.textDim;
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                (e.currentTarget as HTMLElement).style.borderColor = T.border;
                            }}
                        >
                            Discard Changes
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSaving}
                            style={{ ...S.btnPrimary, padding: '1rem 3rem', opacity: isSaving ? 0.6 : 1 }}
                            onMouseEnter={e => !isSaving && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
                        >
                            {isSaving ? 'Processing...' : (isCreate ? 'Complete Tournament Setup' : 'Save Changes')}
                        </button>
                    </div>

                </main>
            </div>
        </div>
    );
}
