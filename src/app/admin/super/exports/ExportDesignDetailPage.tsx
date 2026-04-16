'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Cloud, Eye, Layers3, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { ExportDesign } from './export-designs';
import { getExportStatusMeta } from './export-designs';
import { getDefaultActiveExportDesign, mapDesignSlugToVisualFamily, persistActiveExportDesign, readActiveExportDesign, type ExportDesignSlug } from '@/lib/exports/activeDesign';
import {
    ExportImagePreview,
    type DailyMatchesData,
    type ExportTemplate,
    type LineupsData,
    type MatchExportLayout,
    type MatchExportMode,
    type MatchStatsData,
    type PlayerStatsData,
    type PlayoffBracketData,
    type StandingsData,
} from '@/components/ExportImage';
import {
    EXPORT_DESIGN_CUSTOMIZATION_EVENT,
    EXPORT_DESIGN_ELEMENT_DIMENSION_CONTEXTS,
    EXPORT_DESIGN_TYPOGRAPHY_CONTEXTS,
    hydrateSavedExportDesignCustomization,
    readSavedExportDesignCustomization,
    saveExportDesignCustomization,
    type ExportDesignCustomizationState,
    type ExportDesignElementDimensionContextId,
    type ExportDesignElementDimensionItem,
    type ExportDesignPaletteItem,
    type ExportDesignTypographyContextId,
    type ExportDesignPreviewMode,
    type ExportDesignStyleRuleItem,
    type ExportDesignTypographyItem,
} from '@/lib/exports/designCustomizations';
import { createClient } from '@/lib/supabase/client';
import styles from './exports.module.css';

type DetailTab = 'summary' | 'formats' | 'dimensions' | 'elements' | 'typography' | 'style' | 'config';
type EditableTypographyItem = ExportDesignTypographyItem;
type EditableElementDimensionItem = ExportDesignElementDimensionItem;
type EditablePaletteItem = ExportDesignPaletteItem;
type EditableStyleRuleItem = ExportDesignStyleRuleItem;
type PreviewMode = ExportDesignPreviewMode;
type EditableDesignState = ExportDesignCustomizationState;
type FixedPreviewMatch = {
    tournament: string;
    tournamentLogo?: string;
    homeTeam: string;
    awayTeam: string;
    homeLogo?: string;
    awayLogo?: string;
    homeScore: string;
    awayScore: string;
    statusLabel: string;
    dateLabel: string;
    timeLabel: string;
    venueLabel: string;
    kickoffAt?: string;
};
type PreviewVariantId =
    | 'matchClassicSchedule'
    | 'matchClassicResult'
    | 'matchEditorialSchedule'
    | 'matchEditorialResult'
    | 'dailyMatches'
    | 'standings'
    | 'lineups'
    | 'playoffBracket'
    | 'playerStats';
type PreviewVariant = {
    id: PreviewVariantId;
    label: string;
    description: string;
    template: ExportTemplate;
    layout?: MatchExportLayout;
    mode?: MatchExportMode;
};

const FIXED_PREVIEW_MATCH_ID = '3e314b46-62ad-46bb-9391-fb0321ca5d7c';
const PREVIEW_VARIANTS: PreviewVariant[] = [
    { id: 'matchClassicSchedule', label: 'Horario clasico', description: 'Layout clasico con partido programado.', template: 'matchStats', layout: 'classic', mode: 'schedule' },
    { id: 'matchClassicResult', label: 'Resultado clasico', description: 'Layout clasico con marcador final.', template: 'matchStats', layout: 'classic', mode: 'result' },
    { id: 'matchEditorialSchedule', label: 'Horario editorial', description: 'Poster editorial 4:5 para agenda.', template: 'matchStats', layout: 'editorial4x5', mode: 'schedule' },
    { id: 'matchEditorialResult', label: 'Resultado editorial', description: 'Poster editorial 4:5 para resultado final.', template: 'matchStats', layout: 'editorial4x5', mode: 'result' },
    { id: 'dailyMatches', label: 'Fixture', description: 'Agenda de partidos del torneo.', template: 'dailyMatches' },
    { id: 'standings', label: 'Tabla', description: 'Tabla de posiciones del torneo.', template: 'standings' },
    { id: 'lineups', label: 'Alineaciones', description: 'Formacion base del partido.', template: 'lineups' },
    { id: 'playoffBracket', label: 'Playoff', description: 'Cuadro eliminatorio de muestra.', template: 'playoffBracket' },
    { id: 'playerStats', label: 'Jugador', description: 'Ficha individual de performance.', template: 'playerStats' },
];

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
    { id: 'summary', label: 'Resumen' },
    { id: 'formats', label: 'Formatos' },
    { id: 'dimensions', label: 'Dimensiones' },
    { id: 'elements', label: 'Elementos' },
    { id: 'typography', label: 'Tipografias' },
    { id: 'style', label: 'Colores y estilo' },
    { id: 'config', label: 'Configuracion del usuario' },
];

const TYPOGRAPHY_FAMILY_OPTIONS = [
    { value: '"dharma-gothic-e", sans-serif', label: 'Dharma Gothic E' },
    { value: '"dharma-gothic-c", sans-serif', label: 'Dharma Gothic C' },
    { value: '"dharma-gothic-m", sans-serif', label: 'Dharma Gothic M' },
    { value: '"Bebas Neue", "Outfit", "Inter", system-ui, sans-serif', label: 'Bebas Neue' },
    { value: 'Outfit', label: 'Outfit' },
    { value: '"Inter", "Outfit", system-ui, sans-serif', label: 'Inter' },
    { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
    { value: '"Tangerine", "Times New Roman", serif', label: 'Tangerine' },
    { value: '"Inconsolata", "JetBrains Mono", monospace', label: 'Inconsolata' },
    { value: '"Cantarell", "Inter", "Outfit", sans-serif', label: 'Cantarell' },
    { value: '"Roboto Mono", "JetBrains Mono", monospace', label: 'Roboto Mono' },
    { value: '"Rancho", "Bebas Neue", cursive', label: 'Rancho' },
];

type TypographyWeightOption = {
    value: string;
    label: string;
};

const GENERIC_TYPOGRAPHY_WEIGHT_OPTIONS: TypographyWeightOption[] = [
    { value: '100', label: 'Thin 100' },
    { value: '200', label: 'Extra Light 200' },
    { value: '300', label: 'Light 300' },
    { value: '400', label: 'Regular 400' },
    { value: '500', label: 'Medium 500' },
    { value: '600', label: 'SemiBold 600' },
    { value: '700', label: 'Bold 700' },
    { value: '800', label: 'ExtraBold 800' },
    { value: '900', label: 'Heavy 900' },
];

const TYPOGRAPHY_WEIGHT_OPTIONS_BY_FAMILY: Record<string, TypographyWeightOption[]> = {
    '"dharma-gothic-c", sans-serif': [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'ExLight 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExBold 800' },
        { value: '900', label: 'Heavy 900' },
    ],
    '"dharma-gothic-e", sans-serif': [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'ExLight 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExBold 800' },
        { value: '900', label: 'Heavy 900' },
    ],
    '"dharma-gothic-m", sans-serif': [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'ExLight 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExBold 800' },
        { value: '900', label: 'Heavy 900' },
    ],
    '"Bebas Neue", "Outfit", "Inter", system-ui, sans-serif': [
        { value: '400', label: 'Regular 400' },
    ],
    Outfit: [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'Extra Light 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '500', label: 'Medium 500' },
        { value: '600', label: 'SemiBold 600' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExtraBold 800' },
        { value: '900', label: 'Black 900' },
    ],
    '"Inter", "Outfit", system-ui, sans-serif': [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'Extra Light 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '500', label: 'Medium 500' },
        { value: '600', label: 'SemiBold 600' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExtraBold 800' },
        { value: '900', label: 'Black 900' },
    ],
    '"JetBrains Mono", monospace': [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'Extra Light 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '500', label: 'Medium 500' },
        { value: '600', label: 'SemiBold 600' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExtraBold 800' },
    ],
    '"Tangerine", "Times New Roman", serif': [
        { value: '400', label: 'Regular 400' },
        { value: '700', label: 'Bold 700' },
    ],
    '"Inconsolata", "JetBrains Mono", monospace': [
        { value: '200', label: 'Extra Light 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '500', label: 'Medium 500' },
        { value: '600', label: 'SemiBold 600' },
        { value: '700', label: 'Bold 700' },
        { value: '800', label: 'ExtraBold 800' },
        { value: '900', label: 'Black 900' },
    ],
    '"Cantarell", "Inter", "Outfit", sans-serif': [
        { value: '400', label: 'Regular 400' },
        { value: '700', label: 'Bold 700' },
    ],
    '"Roboto Mono", "JetBrains Mono", monospace': [
        { value: '100', label: 'Thin 100' },
        { value: '200', label: 'Extra Light 200' },
        { value: '300', label: 'Light 300' },
        { value: '400', label: 'Regular 400' },
        { value: '500', label: 'Medium 500' },
        { value: '600', label: 'SemiBold 600' },
        { value: '700', label: 'Bold 700' },
    ],
    '"Rancho", "Bebas Neue", cursive': [
        { value: '400', label: 'Regular 400' },
    ],
};

const PREVIEW_MODE_OPTIONS: Array<{ value: PreviewMode; label: string }> = [
    { value: 'soft', label: 'Soft' },
    { value: 'contrast', label: 'Contrast' },
    { value: 'poster', label: 'Poster' },
];

function normalizeTypographyFamilyValue(value: string | null | undefined) {
    const normalized = (value || '').trim();
    if (!normalized) return 'Outfit';

    const compact = normalized.toLowerCase();
    if (compact === 'g22 dharma gothic' || compact === 'dharma gothic') return '"dharma-gothic-e", sans-serif';
    if (compact === 'dharma gothic c') return '"dharma-gothic-c", sans-serif';
    if (compact === 'dharma gothic e') return '"dharma-gothic-e", sans-serif';
    if (compact === 'dharma gothic m') return '"dharma-gothic-m", sans-serif';
    if (compact === 'bebas neue') return '"Bebas Neue", "Outfit", "Inter", system-ui, sans-serif';
    if (compact === 'inter') return '"Inter", "Outfit", system-ui, sans-serif';
    if (compact === 'jetbrains mono') return '"JetBrains Mono", monospace';
    if (compact === 'tangerine') return '"Tangerine", "Times New Roman", serif';
    if (compact === 'inconsolata') return '"Inconsolata", "JetBrains Mono", monospace';
    if (compact === 'cantarell') return '"Cantarell", "Inter", "Outfit", sans-serif';
    if (compact === 'roboto mono') return '"Roboto Mono", "JetBrains Mono", monospace';
    if (compact === 'rancho') return '"Rancho", "Bebas Neue", cursive';

    return normalized;
}

function getTypographyWeightOptions(family: string | null | undefined) {
    const normalizedFamily = normalizeTypographyFamilyValue(family);
    return TYPOGRAPHY_WEIGHT_OPTIONS_BY_FAMILY[normalizedFamily] ?? GENERIC_TYPOGRAPHY_WEIGHT_OPTIONS;
}

function isPreviewVariantId(value: string): value is PreviewVariantId {
    return PREVIEW_VARIANTS.some((variant) => variant.id === value);
}

function getValidTypographyWeight(
    family: string | null | undefined,
    weight: string | null | undefined
) {
    const options = getTypographyWeightOptions(family);
    const normalizedWeight = (weight || '').trim();

    if (options.some((option) => option.value === normalizedWeight)) {
        return normalizedWeight;
    }

    return options[0]?.value || '400';
}

function buildEditableDesignState(design: ExportDesign): EditableDesignState {
    const gradientMatch = design.previewBackground.match(/linear-gradient\(135deg,\s*([^,]+?)\s+0%,\s*([^,]+?)\s+(?:48|46|100)%.*\)/i);
    const previewGradientFrom = gradientMatch?.[1]?.trim() || '#0b1020';
    const previewGradientTo = gradientMatch?.[2]?.trim() || design.previewAccent;
    const typography = design.typography.map((font) => ({
        id: font.id,
        role: font.role,
        family: normalizeTypographyFamilyValue(font.family),
        weight: getValidTypographyWeight(font.family, font.weight),
        usage: font.usage,
        previewText: 'Matchday export preview',
    }));
    const typographyById = new Map(typography.map((item) => [item.id, item] as const));
    const fallbackTypographyBySlot = {
        display: typographyById.get('outfit') ?? typography[0],
        body: typographyById.get('inter') ?? typographyById.get('outfit') ?? typography[0],
        mono: typographyById.get('jetbrains-mono') ?? typographyById.get('roboto-mono') ?? typography[0],
        editorial: typographyById.get('bebas-neue') ?? typographyById.get('rancho') ?? typography[0],
        score: typographyById.get('dharma-gothic') ?? typographyById.get('bebas-neue') ?? typography[0],
    };

    return {
        typography,
        typographyContexts: EXPORT_DESIGN_TYPOGRAPHY_CONTEXTS.map((context) => ({
            id: context.id,
            label: context.label,
            description: context.description,
            items: context.items.map((item) => {
                const fallback = fallbackTypographyBySlot[item.slot];
                return {
                    id: item.id,
                    role: item.role,
                    family: normalizeTypographyFamilyValue(fallback?.family || 'Outfit'),
                    weight: getValidTypographyWeight(fallback?.family || 'Outfit', fallback?.weight || '700'),
                    usage: item.usage,
                    previewText: item.previewText,
                    slot: item.slot,
                };
            }),
        })),
        elementDimensionContexts: EXPORT_DESIGN_ELEMENT_DIMENSION_CONTEXTS.map((context) => ({
            id: context.id,
            label: context.label,
            description: context.description,
            items: context.items.map((item) => ({
                id: item.id,
                label: item.label,
                width: item.width,
                offsetY: item.offsetY,
                note: item.note,
            })),
        })),
        palette: design.palette.map((token) => ({
            id: token.id,
            label: token.label,
            value: token.value,
            note: token.note,
        })),
        styleRules: design.styleRules.map((rule) => ({
            id: rule.id,
            label: rule.label,
            value: rule.value,
        })),
        previewAccent: design.previewAccent,
        previewSurface: design.previewSurface,
        previewGradientFrom,
        previewGradientTo,
        previewMode: design.slug === 'poster-v3' ? 'poster' : design.slug === 'momentum-v2' ? 'contrast' : 'soft',
    };
}

function flattenTypographyItems(state: EditableDesignState) {
    return state.typographyContexts.flatMap((context) => context.items);
}

function buildPersistableDesignState(state: EditableDesignState): EditableDesignState {
    return {
        ...state,
        typography: flattenTypographyItems(state),
    };
}

function getPreviewWeightValue(weight: string): number {
    if (weight.includes('-')) {
        const [, max = '700'] = weight.split('-');
        const parsed = Number(max);
        return Number.isFinite(parsed) ? parsed : 700;
    }

    const parsed = Number(weight);
    return Number.isFinite(parsed) ? parsed : 700;
}

function buildPreviewBackground(state: EditableDesignState) {
    return `linear-gradient(135deg, ${state.previewGradientFrom} 0%, ${state.previewGradientTo} 100%)`;
}

function toReadableDateLabel(value: string | null | undefined) {
    if (!value) return 'Fecha fija';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Fecha fija';
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(parsed);
}

function toReadableTimeLabel(value: string | null | undefined) {
    if (!value) return '--:--';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '--:--';
    return new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(parsed);
}

function parseFixedPreviewMatch(payload: unknown): FixedPreviewMatch | null {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const source = record?.data && typeof record.data === 'object'
        ? record.data as Record<string, unknown>
        : record;

    if (!source) return null;

    const homeClub = source.homeClub && typeof source.homeClub === 'object' ? source.homeClub as Record<string, unknown> : null;
    const awayClub = source.awayClub && typeof source.awayClub === 'object' ? source.awayClub as Record<string, unknown> : null;
    const tournament = source.tournament && typeof source.tournament === 'object' ? source.tournament as Record<string, unknown> : null;
    const score = source.score && typeof source.score === 'object' ? source.score as Record<string, unknown> : null;

    const homeTeam = String(homeClub?.name || source.homeTeam || source.home_team_name || 'Local').trim();
    const awayTeam = String(awayClub?.name || source.awayTeam || source.away_team_name || 'Visitante').trim();
    const homeScore = score?.home != null ? String(score.home) : String(source.homeScore ?? source.home_score ?? '-');
    const awayScore = score?.away != null ? String(score.away) : String(source.awayScore ?? source.away_score ?? '-');
    const tournamentName = String(tournament?.name || source.tournamentName || 'Torneo fijo').trim();
    const dateTime = typeof source.dateTime === 'string'
        ? source.dateTime
        : typeof source.date_time === 'string'
            ? source.date_time
            : null;
    const status = String(source.status || '').trim().toLowerCase();
    const statusLabel = status === 'live'
        ? 'En vivo'
        : status === 'final' || status === 'finished'
            ? 'Final'
            : 'Programado';

    return {
        tournament: tournamentName,
        tournamentLogo: typeof tournament?.logo === 'string'
            ? tournament.logo
            : typeof tournament?.logo_url === 'string'
                ? tournament.logo_url
                : undefined,
        homeTeam,
        awayTeam,
        homeLogo: typeof homeClub?.logo === 'string'
            ? homeClub.logo
            : typeof homeClub?.logo_url === 'string'
                ? homeClub.logo_url
                : undefined,
        awayLogo: typeof awayClub?.logo === 'string'
            ? awayClub.logo
            : typeof awayClub?.logo_url === 'string'
                ? awayClub.logo_url
                : undefined,
        homeScore,
        awayScore,
        statusLabel,
        dateLabel: toReadableDateLabel(dateTime),
        timeLabel: toReadableTimeLabel(dateTime),
        venueLabel: String(source.venue || 'Sede fija').trim() || 'Sede fija',
        kickoffAt: dateTime ?? undefined,
    };
}

function buildPreviewPayloads(match: FixedPreviewMatch) {
    const matchStatsData: MatchStatsData = {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: Number(match.homeScore),
        awayScore: Number(match.awayScore),
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
        tournament: match.tournament,
        tournamentLogo: match.tournamentLogo,
        date: match.dateLabel,
        time: match.timeLabel,
        venue: match.venueLabel,
        kickoffAt: match.kickoffAt,
        status: 'final',
        mainTitle: 'Resultado',
        stats: [
            { label: 'Posesion', home: '54%', away: '46%' },
            { label: 'Remates', home: 8, away: 3 },
            { label: 'Precision', home: '91%', away: '82%' },
        ],
    };

    const dailyMatchesData: DailyMatchesData = {
        date: match.dateLabel,
        tournament: match.tournament,
        tournamentLogo: match.tournamentLogo,
        matches: [
            {
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeLogo: match.homeLogo,
                awayLogo: match.awayLogo,
                homeScore: Number(match.homeScore),
                awayScore: Number(match.awayScore),
                time: match.timeLabel,
                status: 'finished',
                dateLabel: match.dateLabel,
                kickoffAt: match.kickoffAt,
            },
            {
                homeTeam: 'Dogos XV',
                awayTeam: 'Pampas',
                homeLogo: match.homeLogo,
                awayLogo: match.awayLogo,
                time: '18:00',
                status: 'scheduled',
                dateLabel: match.dateLabel,
                kickoffAt: match.kickoffAt,
            },
            {
                homeTeam: 'Cobras Brasil',
                awayTeam: 'Penarol Rugby',
                homeLogo: match.homeLogo,
                awayLogo: match.awayLogo,
                time: '22:15',
                status: 'scheduled',
                dateLabel: match.dateLabel,
                kickoffAt: match.kickoffAt,
            },
        ],
    };

    const standingsData: StandingsData = {
        title: 'Tabla de posiciones',
        subtitle: match.tournament,
        tournamentLogo: match.tournamentLogo,
        rows: [
            { pos: 1, team: match.homeTeam, teamLogo: match.homeLogo, played: 6, won: 5, lost: 1, diff: '+42', points: 24 },
            { pos: 2, team: match.awayTeam, teamLogo: match.awayLogo, played: 6, won: 4, lost: 2, diff: '+18', points: 19 },
            { pos: 3, team: 'Dogos XV', teamLogo: match.homeLogo, played: 6, won: 3, lost: 3, diff: '+5', points: 16 },
            { pos: 4, team: 'Pampas', teamLogo: match.awayLogo, played: 6, won: 3, lost: 3, diff: '-2', points: 14 },
            { pos: 5, team: 'Penarol Rugby', teamLogo: match.homeLogo, played: 6, won: 2, lost: 4, diff: '-12', points: 11 },
        ],
    };

    const lineupsData: LineupsData = {
        title: 'Alineaciones',
        subtitle: match.tournament,
        tournament: match.tournament,
        tournamentLogo: match.tournamentLogo,
        date: match.dateLabel,
        time: match.timeLabel,
        venue: match.venueLabel,
        kickoffAt: match.kickoffAt,
        homeTeam: {
            name: match.homeTeam,
            logo: match.homeLogo,
            starters: [
                { number: 1, name: 'Jugador Uno' },
                { number: 2, name: 'Jugador Dos' },
                { number: 3, name: 'Jugador Tres' },
                { number: 4, name: 'Jugador Cuatro' },
                { number: 5, name: 'Jugador Cinco' },
                { number: 6, name: 'Jugador Seis' },
            ],
        },
        awayTeam: {
            name: match.awayTeam,
            logo: match.awayLogo,
            starters: [
                { number: 1, name: 'Jugador Siete' },
                { number: 2, name: 'Jugador Ocho' },
                { number: 3, name: 'Jugador Nueve' },
                { number: 4, name: 'Jugador Diez' },
                { number: 5, name: 'Jugador Once' },
                { number: 6, name: 'Jugador Doce' },
            ],
        },
    };

    const playoffBracketData: PlayoffBracketData = {
        title: 'Playoff',
        subtitle: match.tournament,
        tournamentLogo: match.tournamentLogo,
        rounds: [
            {
                name: 'Semifinal',
                matches: [
                    {
                        home_team: { name: match.homeTeam, logo: match.homeLogo },
                        away_team: { name: 'Dogos XV', logo: match.homeLogo },
                        score_home: 39,
                        score_away: 31,
                    },
                    {
                        home_team: { name: match.awayTeam, logo: match.awayLogo },
                        away_team: { name: 'Pampas', logo: match.awayLogo },
                        score_home: 28,
                        score_away: 24,
                    },
                ],
            },
            {
                name: 'Final',
                matches: [
                    {
                        home_team: { name: match.homeTeam, logo: match.homeLogo },
                        away_team: { name: match.awayTeam, logo: match.awayLogo },
                        score_home: 39,
                        score_away: 28,
                    },
                ],
            },
        ],
    };

    const playerStatsData: PlayerStatsData = {
        name: 'Tomas Demo',
        team: match.homeTeam,
        position: 'Wing',
        photo: '',
        stats: [
            { label: 'Puntos', value: 18, highlight: true },
            { label: 'Tries', value: 2 },
            { label: 'Metros', value: 96 },
            { label: 'Tackles', value: 7 },
        ],
    };

    return {
        matchStats: matchStatsData,
        dailyMatches: dailyMatchesData,
        standings: standingsData,
        lineups: lineupsData,
        playoffBracket: playoffBracketData,
        playerStats: playerStatsData,
    };
}

export default function ExportDesignDetailPage({ design }: { design: ExportDesign }) {
    return <ExportDesignDetailPageContent key={design.slug} design={design} />;
}

function ExportDesignDetailPageContent({ design }: { design: ExportDesign }) {
    const supabase = useMemo(() => createClient(), []);
    const createInitialDesignState = () => readSavedExportDesignCustomization(design.slug) || buildEditableDesignState(design);
    const [activeTab, setActiveTab] = useState<DetailTab>('summary');
    const [selectedDimensionId, setSelectedDimensionId] = useState(design.dimensions[0]?.id ?? '');
    const [activeDesignSlug, setActiveDesignSlug] = useState<ExportDesignSlug>(getDefaultActiveExportDesign());
    const [persistedState, setPersistedState] = useState<EditableDesignState>(createInitialDesignState);
    const [editingState, setEditingState] = useState<EditableDesignState>(createInitialDesignState);
    const [isEditing, setIsEditing] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [fixedPreviewMatch, setFixedPreviewMatch] = useState<FixedPreviewMatch | null>(null);
    const [selectedPreviewVariantId, setSelectedPreviewVariantId] = useState<PreviewVariantId>('matchClassicResult');
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [elementDimensionDrafts, setElementDimensionDrafts] = useState<Record<string, string>>({});
    const editorState = editingState;
    const liveState = isEditing ? buildPersistableDesignState(editingState) : persistedState;
    const hasUnsavedChanges = isEditing;

    const selectedDimension = useMemo(
        () => design.dimensions.find((item) => item.id === selectedDimensionId) ?? design.dimensions[0],
        [design.dimensions, selectedDimensionId],
    );
    const statusMeta = getExportStatusMeta(design.status);
    const recentPresets = design.userConfig.recentPresets;
    const isActiveDesign = design.slug === activeDesignSlug;
    const isEditingRef = useRef(isEditing);

    useEffect(() => {
        isEditingRef.current = isEditing;
    }, [isEditing]);

    const getElementDimensionDraftKey = (
        contextId: ExportDesignElementDimensionContextId,
        itemId: string,
        field: 'width' | 'offsetY'
    ) => `${contextId}:${itemId}:${field}`;

    useEffect(() => {
        const syncActiveDesign = () => setActiveDesignSlug(readActiveExportDesign());
        syncActiveDesign();
        window.addEventListener('storage', syncActiveDesign);
        window.addEventListener('g22:active-export-design-change', syncActiveDesign as EventListener);

        return () => {
            window.removeEventListener('storage', syncActiveDesign);
            window.removeEventListener('g22:active-export-design-change', syncActiveDesign as EventListener);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const hydrateCustomization = async () => {
            const { state } = await hydrateSavedExportDesignCustomization(design.slug, supabase);
            if (!isMounted || !state) return;
            if (isEditingRef.current) return;
            setElementDimensionDrafts({});
            setPersistedState(state);
            setEditingState(state);
            setIsEditing(false);
        };

        void hydrateCustomization();

        const syncCustomization = () => {
            if (isEditingRef.current) return;
            void hydrateCustomization();
        };

        window.addEventListener(EXPORT_DESIGN_CUSTOMIZATION_EVENT, syncCustomization as EventListener);
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            if (isEditingRef.current) return;
            void hydrateCustomization();
        });

        return () => {
            isMounted = false;
            window.removeEventListener(EXPORT_DESIGN_CUSTOMIZATION_EVENT, syncCustomization as EventListener);
            subscription.unsubscribe();
        };
    }, [design.slug, supabase]);

    const markEditing = () => {
        setIsEditing(true);
        setSaveStatus('');
    };

    useEffect(() => {
        let isMounted = true;

        const loadFixedPreviewMatch = async () => {
            try {
                const response = await fetch(`/api/matches/${FIXED_PREVIEW_MATCH_ID}`, { cache: 'no-store' });
                if (!response.ok) return;
                const payload = await response.json();
                if (!isMounted) return;
                setFixedPreviewMatch(parseFixedPreviewMatch(payload));
            } catch {
                if (!isMounted) return;
                setFixedPreviewMatch(null);
            }
        };

        void loadFixedPreviewMatch();

        return () => {
            isMounted = false;
        };
    }, []);

    const updateTypographyEditor = (
        contextId: ExportDesignTypographyContextId,
        fontId: string,
        field: keyof EditableTypographyItem,
        value: string
    ) => {
        if (isPreviewVariantId(contextId)) {
            setSelectedPreviewVariantId(contextId);
        }
        setEditingState((current) => ({
            ...current,
            typographyContexts: current.typographyContexts.map((context) => (
                context.id === contextId
                    ? {
                        ...context,
                        items: context.items.map((font) => (
                            font.id === fontId
                                ? field === 'family'
                                    ? {
                                        ...font,
                                        family: normalizeTypographyFamilyValue(value),
                                        weight: getValidTypographyWeight(value, font.weight),
                                    }
                                    : field === 'weight'
                                        ? {
                                            ...font,
                                            weight: getValidTypographyWeight(font.family, value),
                                        }
                                        : { ...font, [field]: value }
                                : font
                        )),
                    }
                    : context
            )),
        }));
        markEditing();
    };

    const addCustomTypography = (contextId: ExportDesignTypographyContextId) => {
        if (isPreviewVariantId(contextId)) {
            setSelectedPreviewVariantId(contextId);
        }
        setEditingState((current) => ({
            ...current,
            typographyContexts: current.typographyContexts.map((context) => {
                if (context.id !== contextId) return context;
                const nextIndex = context.items.filter((font) => font.isCustom).length + 1;

                return {
                    ...context,
                    items: [
                        ...context.items,
                        {
                            id: `${context.id}-custom-font-${Date.now()}`,
                            role: `Tipografia custom ${nextIndex}`,
                            family: 'Outfit',
                            weight: getValidTypographyWeight('Outfit', '700'),
                            usage: 'Nueva tipografia personalizada para este tipo de export.',
                            previewText: 'Custom type preview',
                            isCustom: true,
                        },
                    ],
                };
            }),
        }));
        markEditing();
    };

    const removeCustomTypography = (contextId: ExportDesignTypographyContextId, fontId: string) => {
        if (isPreviewVariantId(contextId)) {
            setSelectedPreviewVariantId(contextId);
        }
        setEditingState((current) => ({
            ...current,
            typographyContexts: current.typographyContexts.map((context) => (
                context.id === contextId
                    ? { ...context, items: context.items.filter((font) => font.id !== fontId) }
                    : context
            )),
        }));
        markEditing();
    };

    const updatePaletteItem = (paletteId: string, field: keyof EditablePaletteItem, value: string) => {
        setEditingState((current) => ({
            ...current,
            palette: current.palette.map((item) => item.id === paletteId ? { ...item, [field]: value } : item),
        }));
        markEditing();
    };

    const updateElementDimensionEditor = (
        contextId: ExportDesignElementDimensionContextId,
        itemId: string,
        field: keyof EditableElementDimensionItem,
        value: string | number
    ) => {
        setSelectedPreviewVariantId(contextId);
        setSelectedElementId(itemId);
        setEditingState((current) => ({
            ...current,
            elementDimensionContexts: current.elementDimensionContexts.map((context) => (
                context.id === contextId
                    ? {
                        ...context,
                        items: context.items.map((item) => (
                            item.id === itemId
                                ? {
                                    ...item,
                                    [field]: field === 'width'
                                        ? Math.max(0, Number(value) || 0)
                                        : field === 'offsetY'
                                            ? Math.round(Number(value) || 0)
                                        : value,
                                }
                                : item
                        )),
                    }
                    : context
            )),
        }));
        markEditing();
    };

    const handleElementDimensionDraftChange = (
        contextId: ExportDesignElementDimensionContextId,
        itemId: string,
        field: 'width' | 'offsetY',
        rawValue: string
    ) => {
        const draftKey = getElementDimensionDraftKey(contextId, itemId, field);
        setElementDimensionDrafts((current) => ({ ...current, [draftKey]: rawValue }));

        if (rawValue.trim() === '') {
            return;
        }

        const parsedValue = Number(rawValue);
        if (!Number.isFinite(parsedValue)) {
            return;
        }

        updateElementDimensionEditor(contextId, itemId, field, field === 'width' ? Math.max(0, parsedValue) : Math.round(parsedValue));
    };

    const commitElementDimensionDraft = (
        contextId: ExportDesignElementDimensionContextId,
        itemId: string,
        field: 'width' | 'offsetY',
        fallbackValue: number
    ) => {
        const draftKey = getElementDimensionDraftKey(contextId, itemId, field);
        const draftValue = elementDimensionDrafts[draftKey];
        const parsedValue = Number(draftValue);
        const nextValue = draftValue != null && draftValue.trim() !== '' && Number.isFinite(parsedValue)
            ? field === 'width' ? Math.max(0, parsedValue) : Math.round(parsedValue)
            : fallbackValue;

        setElementDimensionDrafts((current) => ({ ...current, [draftKey]: String(nextValue) }));
        updateElementDimensionEditor(contextId, itemId, field, nextValue);
    };

    const handleElementDimensionRangeChange = (
        contextId: ExportDesignElementDimensionContextId,
        itemId: string,
        field: 'width' | 'offsetY',
        nextValue: number
    ) => {
        const normalizedValue = field === 'width'
            ? Math.max(0, Math.round(nextValue))
            : Math.round(nextValue);
        const draftKey = getElementDimensionDraftKey(contextId, itemId, field);
        setElementDimensionDrafts((current) => ({ ...current, [draftKey]: String(normalizedValue) }));
        updateElementDimensionEditor(contextId, itemId, field, normalizedValue);
    };

    const getElementDimensionInputValue = (
        contextId: ExportDesignElementDimensionContextId,
        itemId: string,
        field: 'width' | 'offsetY',
        fallbackValue: number
    ) => {
        const draftKey = getElementDimensionDraftKey(contextId, itemId, field);
        return elementDimensionDrafts[draftKey] ?? String(fallbackValue);
    };

    const getElementDimensionSliderMax = (value: number) => {
        if (value <= 120) return 240;
        if (value <= 240) return 420;
        if (value <= 420) return 720;
        return 1200;
    };

    const getElementDimensionOffsetLimit = (value: number) => {
        const magnitude = Math.max(120, Math.abs(Math.round(value)) + 120);
        return Math.min(1200, magnitude);
    };

    const updateStyleRule = (ruleId: string, field: keyof EditableStyleRuleItem, value: string) => {
        setEditingState((current) => ({
            ...current,
            styleRules: current.styleRules.map((rule) => rule.id === ruleId ? { ...rule, [field]: value } : rule),
        }));
        markEditing();
    };

    const updatePreviewField = (
        field: 'previewAccent' | 'previewSurface' | 'previewGradientFrom' | 'previewGradientTo' | 'previewMode',
        value: string
    ) => {
        setEditingState((current) => ({
            ...current,
            [field]: value,
        }));
        markEditing();
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        setSaveStatus('');
        const nextPersistedState = buildPersistableDesignState(editingState);
        const storageMode = await saveExportDesignCustomization(
            design.slug,
            nextPersistedState,
            supabase
        );
        setPersistedState(nextPersistedState);
        setEditingState(nextPersistedState);
        setElementDimensionDrafts({});
        setIsEditing(false);
        setIsSaving(false);
        setSaveStatus(
            storageMode === 'cloud'
                ? 'Cambios guardados y sincronizados en cloud.'
                : 'Cambios guardados localmente en este navegador.'
        );
    };

    const handleResetChanges = () => {
        setElementDimensionDrafts({});
        setEditingState(persistedState);
        setSelectedElementId(null);
        setIsEditing(false);
        setSaveStatus('Cambios locales descartados. Volviste al ultimo estado guardado.');
    };

    const previewBadgeLabel = selectedDimension
        ? `${selectedDimension.name} - ${selectedDimension.width} x ${selectedDimension.height}`
        : design.previewLabel;
    const allTypographyItems = useMemo(() => flattenTypographyItems(editorState), [editorState]);
    const previewMatch = fixedPreviewMatch ?? {
        tournament: 'Base fija de partido',
        homeTeam: 'Club A',
        awayTeam: 'Club B',
        homeScore: '3',
        awayScore: '1',
        statusLabel: 'Final',
        dateLabel: '16 abr 2026',
        timeLabel: '21:45',
        venueLabel: 'Estadio central',
        kickoffAt: '2026-04-16T21:45:00-03:00',
    };
    const selectedPreviewVariant = PREVIEW_VARIANTS.find((variant) => variant.id === selectedPreviewVariantId) ?? PREVIEW_VARIANTS[1];
    const activeTypographyContext = useMemo(
        () => editorState.typographyContexts.find((context) => context.id === selectedPreviewVariant.id) ?? editorState.typographyContexts[0],
        [editorState.typographyContexts, selectedPreviewVariant.id]
    );
    const activeElementDimensionContext = useMemo(
        () => editorState.elementDimensionContexts.find((context) => context.id === selectedPreviewVariant.id) ?? editorState.elementDimensionContexts[0],
        [editorState.elementDimensionContexts, selectedPreviewVariant.id]
    );
    const previewVisualFamily = mapDesignSlugToVisualFamily(design.slug as ExportDesignSlug);
    const previewPayloads = useMemo(() => buildPreviewPayloads(previewMatch), [previewMatch]);
    const selectedPreviewData = useMemo(() => {
        switch (selectedPreviewVariant.template) {
            case 'dailyMatches':
                return previewPayloads.dailyMatches;
            case 'standings':
                return previewPayloads.standings;
            case 'lineups':
                return previewPayloads.lineups;
            case 'playoffBracket':
                return previewPayloads.playoffBracket;
            case 'playerStats':
                return previewPayloads.playerStats;
            default:
                return {
                    ...previewPayloads.matchStats,
                    status: selectedPreviewVariant.mode === 'schedule' ? 'scheduled' : 'final',
                    mainTitle: selectedPreviewVariant.mode === 'schedule' ? 'Horario' : 'Resultado',
                } satisfies MatchStatsData;
        }
    }, [previewPayloads, selectedPreviewVariant.mode, selectedPreviewVariant.template]);
    const typographyFamilyOptions = useMemo(() => {
        const customFamilies = allTypographyItems
            .map((font) => normalizeTypographyFamilyValue(font.family))
            .filter(Boolean)
            .filter((family, index, all) => all.indexOf(family) === index)
            .filter((family) => !TYPOGRAPHY_FAMILY_OPTIONS.some((option) => option.value === family));

        return [
            ...TYPOGRAPHY_FAMILY_OPTIONS,
            ...customFamilies.map((family) => ({ value: family, label: family })),
        ];
    }, [allTypographyItems]);
    const selectedElementLabel = useMemo(() => {
        const activeItem = activeElementDimensionContext?.items.find((item) => item.id === selectedElementId);
        return activeItem?.label || null;
    }, [activeElementDimensionContext, selectedElementId]);

    useEffect(() => {
        if (!activeElementDimensionContext) {
            setSelectedElementId(null);
            return;
        }

        if (selectedElementId && activeElementDimensionContext.items.some((item) => item.id === selectedElementId)) {
            return;
        }

        setSelectedElementId(activeElementDimensionContext.items[0]?.id ?? null);
    }, [activeElementDimensionContext, selectedElementId]);

    return (
        <div className={styles.detailPage}>
            <Link href="/admin/super/exports" className={styles.backLink}>
                <ArrowLeft size={16} />
                Volver a Exports
            </Link>

            <section className={styles.detailHero}>
                <div className={styles.detailHeader}>
                    <div>
                        <div className={styles.heroEyebrow}>Export design detail</div>
                        <h1 className={styles.detailTitle}>{design.name}</h1>
                        <p className={styles.detailDescription}>{design.longDescription}</p>
                    </div>

                    <div className={styles.detailActions}>
                        <div className={styles.secondaryButton}>
                            <Cloud size={16} />
                            {design.userConfig.syncSourceLabel}
                        </div>
                        <div className={styles.secondaryButton}>
                            <Layers3 size={16} />
                            {design.userConfig.totalPresets} presets reales
                        </div>
                        <button
                            type="button"
                            className={isActiveDesign ? styles.secondaryButton : styles.actionButton}
                            onClick={() => {
                                persistActiveExportDesign(design.slug as ExportDesignSlug);
                                setActiveDesignSlug(design.slug as ExportDesignSlug);
                            }}
                            disabled={isActiveDesign}
                        >
                            <Eye size={16} />
                            {isActiveDesign ? 'Diseno activo' : 'Activar diseno'}
                        </button>
                            <button
                                type="button"
                                className={styles.actionButton}
                                onClick={handleSaveChanges}
                                disabled={isSaving}
                            >
                                <Save size={16} />
                                {isSaving ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={handleResetChanges}
                        >
                            <RotateCcw size={16} />
                            Restablecer
                        </button>
                    </div>
                </div>

                {saveStatus ? (
                    <div className={styles.saveNotice}>{saveStatus}</div>
                ) : hasUnsavedChanges ? (
                    <div className={styles.mutedNotice}>Hay cambios sin guardar en tipografias, colores o estilos.</div>
                ) : null}

                <div className={styles.metaGrid}>
                    <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Estado</span>
                        <span
                            className={`${styles.statusPill} ${
                                isActiveDesign
                                    ? styles.statusSuccess
                                    : statusMeta.tone === 'success'
                                    ? styles.statusSuccess
                                    : statusMeta.tone === 'warning'
                                        ? styles.statusWarning
                                        : styles.statusNeutral
                            }`}
                        >
                            {isActiveDesign ? 'Activo en exportacion' : statusMeta.label}
                        </span>
                        <span className={styles.metaText}>
                            Solo uno de los disenos puede quedar activo a la vez. Este estado define el export usado por ExportImage.
                        </span>
                    </div>

                    <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Primera config cloud</span>
                        <span className={styles.metaValue}>{design.createdAtLabel || '-'}</span>
                        <span className={styles.metaText}>Fecha real del primer preset sincronizado en la cuenta.</span>
                    </div>

                    <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Ultima actualizacion</span>
                        <span className={styles.metaValue}>{design.updatedAtLabel || '-'}</span>
                        <span className={styles.metaText}>Se toma de user_export_presets para este usuario.</span>
                    </div>

                    <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Configuracion del usuario</span>
                        <span className={styles.metaValue}>{design.userConfig.personalized ? 'Sincronizada' : 'Solo base'}</span>
                        <span className={styles.metaText}>{design.userConfig.ownerLabel}</span>
                    </div>
                </div>
            </section>

            <section className={styles.previewLayout}>
                <div className={styles.previewShell}>
                    <div className={styles.previewVariantTabs} role="tablist" aria-label="Variantes del preview">
                        {PREVIEW_VARIANTS.map((variant) => (
                            <button
                                key={variant.id}
                                type="button"
                                role="tab"
                                aria-selected={selectedPreviewVariantId === variant.id}
                                className={`${styles.previewVariantTab} ${selectedPreviewVariantId === variant.id ? styles.previewVariantTabActive : ''}`}
                                onClick={() => setSelectedPreviewVariantId(variant.id)}
                            >
                                {variant.label}
                            </button>
                        ))}
                    </div>
                    <div className={styles.previewCanvas}>
                        <div className={styles.previewCanvasFrame}>
                            <ExportImagePreview
                                className={styles.previewCanvasImage}
                                template={selectedPreviewVariant.template}
                                data={selectedPreviewData}
                                format={selectedDimension?.id === '1080x1920' ? '1080x1920' : '1080x1350'}
                                visualFamily={previewVisualFamily}
                                customizationState={liveState}
                                matchExportMode={selectedPreviewVariant.mode}
                                matchExportLayout={selectedPreviewVariant.layout}
                            />
                        </div>
                    </div>
                </div>

                <aside className={styles.sidebarStack}>
                    <div className={styles.panelCard}>
                        <span className={styles.sectionEyebrow}>Preview controls</span>
                        <h2 className={styles.panelTitle}>Dimensiones activas</h2>
                        <select
                            className={styles.selectCompact}
                            value={selectedDimensionId}
                            onChange={(event) => setSelectedDimensionId(event.target.value)}
                        >
                            {design.dimensions.map((dimension) => (
                                <option key={dimension.id} value={dimension.id}>
                                    {dimension.name} - {dimension.width} x {dimension.height}
                                </option>
                            ))}
                        </select>
                        <div className={styles.stackList}>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Diseno renderizado</div>
                                <div className={styles.stackMeta}>{selectedPreviewVariant.label}. {selectedPreviewVariant.description}</div>
                            </div>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Formatos reales</div>
                                <div className={styles.stackMeta}>{design.formats.length} templates soportados por ExportImage hoy.</div>
                            </div>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Tipografias activas</div>
                                <div className={styles.stackMeta}>{allTypographyItems.length} reglas activas entre todos los tipos de export.</div>
                            </div>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Estado del canvas</div>
                                <div className={styles.stackMeta}>
                                    {isEditing ? 'Preview en vivo desde el estado de edicion.' : 'Preview renderizando el ultimo estado guardado.'}
                                </div>
                            </div>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Elemento seleccionado</div>
                                <div className={styles.stackMeta}>{selectedElementLabel || 'Todavia no seleccionaste un elemento editable.'}</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.panelCard}>
                        <span className={styles.sectionEyebrow}>Cloud status</span>
                        <div className={styles.stackList}>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Presets del usuario</div>
                                <div className={styles.stackMeta}>{design.userConfig.totalPresets} sincronizados en cloud.</div>
                            </div>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Editoriales</div>
                                <div className={styles.stackMeta}>{design.userConfig.editorialPresetCount} presets con layout editorial.</div>
                            </div>
                            <div className={styles.stackItem}>
                                <div className={styles.stackTitle}>Gradientes</div>
                                <div className={styles.stackMeta}>{design.userConfig.gradientPresetCount} presets de color o textura.</div>
                            </div>
                        </div>
                    </div>
                </aside>
            </section>

            <nav className={styles.tabs} aria-label="Secciones del diseno">
                {DETAIL_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {activeTab === 'summary' ? (
                <section className={styles.tabPane}>
                    <div className={styles.contentGrid}>
                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Informacion general</span>
                            <h2 className={styles.sectionTitle}>Sistema real de exports</h2>
                            <p className={styles.sectionText}>
                                Esta vista ya no usa datos mock. Resume el motor real de exportacion, las salidas activas y los presets sincronizados del usuario autenticado.
                            </p>
                            <div className={styles.chipRow}>
                                <span className={styles.infoPill}>Cloud presets: {design.userConfig.totalPresets}</span>
                                <span className={styles.infoPill}>Layouts: {design.styleRules.length}</span>
                                <span className={styles.infoPill}>Owner: {design.userConfig.ownerLabel}</span>
                            </div>
                        </div>

                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Reglas actuales del producto</span>
                            <ol className={styles.bulletList}>
                                {design.baseGuidelines.map((guideline) => (
                                    <li key={guideline}>{guideline}</li>
                                ))}
                            </ol>
                        </div>
                    </div>

                    <div className={styles.dualColumn}>
                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Cobertura del motor</span>
                            <div className={styles.stackList}>
                                <div className={styles.stackItem}>
                                    <div className={styles.stackTitle}>Templates soportados</div>
                                    <div className={styles.stackMeta}>{design.formats.map((format) => format.name).join(', ')}</div>
                                </div>
                                <div className={styles.stackItem}>
                                    <div className={styles.stackTitle}>Ultima actividad cloud</div>
                                    <div className={styles.stackMeta}>{design.userConfig.lastUpdatedAtLabel || 'Todavia no hay actividad cloud.'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Presets recientes</span>
                            <div className={styles.stackList}>
                                {recentPresets.length > 0 ? recentPresets.slice(0, 3).map((preset) => (
                                    <div key={preset.id} className={styles.stackItem}>
                                        <div className={styles.stackTitle}>{preset.name}</div>
                                        <div className={styles.stackMeta}>
                                            {preset.presetType === 'editorial' ? 'Editorial' : 'Gradiente'} / {preset.updatedAtLabel || 'Sin fecha'}
                                        </div>
                                    </div>
                                )) : (
                                    <div className={styles.stackItem}>
                                        <div className={styles.stackMeta}>Todavia no hay presets cloud guardados para esta cuenta.</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {activeTab === 'formats' ? (
                <section className={styles.tabPane}>
                    <div className={styles.contentCard}>
                        <span className={styles.sectionEyebrow}>Formatos incluidos</span>
                        <h2 className={styles.sectionTitle}>Templates reales soportados</h2>
                        <p className={styles.sectionText}>
                            Estos bloques salen del catalogo real del motor de exportacion, no de contenido hardcodeado de demo.
                        </p>
                    </div>

                    <div className={styles.formatGrid}>
                        {design.formats.map((format) => (
                            <article key={format.id} className={styles.formatCard}>
                                <div className={styles.miniPreview}>
                                    <div className={styles.miniLine} />
                                    <div className={`${styles.miniLine} ${styles.miniLineShort}`} />
                                    <div className={styles.miniGrid}>
                                        <div className={styles.miniBox} />
                                        <div className={styles.miniBox} />
                                        <div className={styles.miniBox} />
                                    </div>
                                </div>

                                <div>
                                    <h3 className={styles.panelTitle}>{format.name}</h3>
                                    <p className={styles.sectionText}>{format.description}</p>
                                </div>

                                <div className={styles.cardFooter}>
                                    <span className={styles.infoPill}>{format.outputLabel}</span>
                                    <span className={styles.supportingText}>Template ID: {format.id}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}

            {activeTab === 'dimensions' ? (
                <section className={styles.tabPane}>
                    <div className={styles.contentCard}>
                        <span className={styles.sectionEyebrow}>Dimensiones sugeridas</span>
                        <h2 className={styles.sectionTitle}>Salidas reales del motor actual</h2>
                        <p className={styles.sectionText}>
                            La vista muestra los formatos que hoy existen realmente en ExportImage.
                        </p>
                    </div>

                    <div className={styles.dimensionTable}>
                        {design.dimensions.map((dimension) => (
                            <div key={dimension.id} className={styles.dimensionRow}>
                                <div>
                                    <div className={styles.stackTitle}>{dimension.name}</div>
                                    <div className={styles.stackMeta}>{dimension.usage}</div>
                                </div>
                                <div className={styles.dimensionValue}>{dimension.width} x {dimension.height}</div>
                                <span className={styles.infoPill}>Activo</span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {activeTab === 'elements' ? (
                <section className={styles.tabPane}>
                    <div className={styles.contentCard}>
                        <div className={styles.editorToolbar}>
                            <div>
                                <span className={styles.sectionEyebrow}>Element size editor</span>
                                <h2 className={styles.sectionTitle}>Dimensiones por diseno previsualizado</h2>
                                <p className={styles.sectionText}>
                                    Este editor sigue el tab activo del preview. Ahora estas editando <strong>{selectedPreviewVariant.label}</strong>.
                                </p>
                            </div>
                            <div className={styles.buttonRow}>
                                <button type="button" className={styles.secondaryButton} onClick={handleSaveChanges} disabled={isSaving}>
                                    <Save size={16} />
                                    {isSaving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {activeElementDimensionContext ? (
                        <section className={styles.contextBlock}>
                            <div className={styles.contextBlockHeader}>
                                <div>
                                    <span className={styles.sectionEyebrow}>Diseno activo</span>
                                    <h3 className={styles.contextBlockTitle}>{activeElementDimensionContext.label}</h3>
                                    <p className={styles.contextBlockDescription}>{activeElementDimensionContext.description}</p>
                                </div>
                                <div className={styles.infoPill}>Preview: {selectedPreviewVariant.label}</div>
                            </div>

                            <div className={styles.contextFieldGrid}>
                                {activeElementDimensionContext.items.map((item) => (
                                    <article
                                        key={item.id}
                                        className={styles.fieldCard}
                                        onClick={() => setSelectedElementId(item.id)}
                                    >
                                        <div className={styles.fieldCardHeader}>
                                            <span className={styles.fieldLabel}>{item.label}</span>
                                        </div>
                                        <div className={styles.typographyEditorGrid}>
                                            <div className={styles.typographyEditorField}>
                                                <label className={styles.typographyEditorLabel}>Tamano</label>
                                                <input
                                                    className={styles.rangeField}
                                                    type="range"
                                                    min="0"
                                                    max={getElementDimensionSliderMax(item.width)}
                                                    step="1"
                                                    value={item.width}
                                                    onChange={(event) => handleElementDimensionRangeChange(activeElementDimensionContext.id, item.id, 'width', Number(event.target.value))}
                                                />
                                                <input
                                                    className={styles.inputField}
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={getElementDimensionInputValue(activeElementDimensionContext.id, item.id, 'width', item.width)}
                                                    onChange={(event) => handleElementDimensionDraftChange(activeElementDimensionContext.id, item.id, 'width', event.target.value)}
                                                    onBlur={() => commitElementDimensionDraft(activeElementDimensionContext.id, item.id, 'width', item.width)}
                                                />
                                            </div>
                                            <div className={styles.typographyEditorField}>
                                                <label className={styles.typographyEditorLabel}>Mover en eje Y</label>
                                                <input
                                                    className={styles.rangeField}
                                                    type="range"
                                                    min={-getElementDimensionOffsetLimit(item.offsetY)}
                                                    max={getElementDimensionOffsetLimit(item.offsetY)}
                                                    step="1"
                                                    value={item.offsetY}
                                                    onChange={(event) => handleElementDimensionRangeChange(activeElementDimensionContext.id, item.id, 'offsetY', Number(event.target.value))}
                                                />
                                                <input
                                                    className={styles.inputField}
                                                    type="number"
                                                    step="1"
                                                    value={getElementDimensionInputValue(activeElementDimensionContext.id, item.id, 'offsetY', item.offsetY)}
                                                    onChange={(event) => handleElementDimensionDraftChange(activeElementDimensionContext.id, item.id, 'offsetY', event.target.value)}
                                                    onBlur={() => commitElementDimensionDraft(activeElementDimensionContext.id, item.id, 'offsetY', item.offsetY)}
                                                />
                                            </div>
                                        </div>
                                        <textarea
                                            className={styles.textareaField}
                                            value={item.note}
                                            onChange={(event) => updateElementDimensionEditor(activeElementDimensionContext.id, item.id, 'note', event.target.value)}
                                            rows={3}
                                        />
                                    </article>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </section>
            ) : null}

            {activeTab === 'typography' ? (
                <section className={styles.tabPane}>
                    <div className={styles.contentCard}>
                        <div className={styles.editorToolbar}>
                            <div>
                                <span className={styles.sectionEyebrow}>Typography editor</span>
                                <h2 className={styles.sectionTitle}>Tipografias por diseno previsualizado</h2>
                                <p className={styles.sectionText}>
                                    Este editor sigue el tab activo del preview. Ahora estas editando <strong>{selectedPreviewVariant.label}</strong>.
                                </p>
                            </div>
                            <div className={styles.buttonRow}>
                                <button type="button" className={styles.secondaryButton} onClick={handleSaveChanges} disabled={isSaving}>
                                    <Save size={16} />
                                    {isSaving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                    {activeTypographyContext ? (
                        <section className={styles.contextBlock}>
                            <div className={styles.contextBlockHeader}>
                                <div>
                                    <span className={styles.sectionEyebrow}>Bloque tipografico</span>
                                    <h3 className={styles.contextBlockTitle}>{activeTypographyContext.label}</h3>
                                    <p className={styles.contextBlockDescription}>{activeTypographyContext.description}</p>
                                </div>
                                <div className={styles.buttonRow}>
                                    <div className={styles.infoPill}>Preview: {selectedPreviewVariant.label}</div>
                                    <button type="button" className={styles.actionButton} onClick={() => addCustomTypography(activeTypographyContext.id)}>
                                        <Plus size={16} />
                                        Agregar tipografia
                                    </button>
                                </div>
                            </div>

                            <div className={styles.contextFieldGrid}>
                                {activeTypographyContext.items.map((font) => (
                                    <article key={font.id} className={styles.fieldCard}>
                                        <div className={styles.fieldCardHeader}>
                                            <span className={styles.fieldLabel}>{font.role}</span>
                                            {font.isCustom ? (
                                                <button
                                                    type="button"
                                                    className={styles.tinyButton}
                                                    onClick={() => removeCustomTypography(activeTypographyContext.id, font.id)}
                                                >
                                                    <Trash2 size={14} />
                                                    Quitar
                                                </button>
                                            ) : null}
                                        </div>
                                        <input
                                            className={styles.inputField}
                                            value={font.role}
                                            onChange={(event) => updateTypographyEditor(activeTypographyContext.id, font.id, 'role', event.target.value)}
                                            placeholder="Rol de la tipografia"
                                        />
                                        <div className={styles.typographyEditorGrid}>
                                            <div className={styles.typographyEditorField}>
                                                <label className={styles.typographyEditorLabel}>Tipografia</label>
                                                <select
                                                    className={styles.selectCompact}
                                                    value={font.family}
                                                    onChange={(event) => updateTypographyEditor(activeTypographyContext.id, font.id, 'family', event.target.value)}
                                                >
                                                    {typographyFamilyOptions.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className={styles.typographyEditorField}>
                                                <label className={styles.typographyEditorLabel}>Peso</label>
                                                <select
                                                    className={styles.selectCompact}
                                                    value={getValidTypographyWeight(font.family, font.weight)}
                                                    onChange={(event) => updateTypographyEditor(activeTypographyContext.id, font.id, 'weight', event.target.value)}
                                                >
                                                    {getTypographyWeightOptions(font.family).map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {font.isCustom ? (
                                            <input
                                                className={styles.inputField}
                                                value={font.family}
                                                onChange={(event) => updateTypographyEditor(activeTypographyContext.id, font.id, 'family', event.target.value)}
                                                placeholder="Escribe el nombre exacto de tu fuente"
                                            />
                                        ) : null}
                                        <input
                                            className={styles.inputField}
                                            value={font.previewText}
                                            onChange={(event) => updateTypographyEditor(activeTypographyContext.id, font.id, 'previewText', event.target.value)}
                                            placeholder="Texto de preview"
                                        />
                                        <div
                                            className={styles.fontPreview}
                                            style={{
                                                fontFamily: font.family,
                                                fontWeight: getPreviewWeightValue(font.weight),
                                            }}
                                        >
                                            {font.previewText || 'Matchday export preview'}
                                        </div>
                                        <textarea
                                            className={styles.textareaField}
                                            value={font.usage}
                                            onChange={(event) => updateTypographyEditor(activeTypographyContext.id, font.id, 'usage', event.target.value)}
                                            placeholder="Describe el uso de esta tipografia"
                                            rows={3}
                                        />
                                    </article>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </section>
            ) : null}

            {activeTab === 'style' ? (
                <section className={styles.tabPane}>
                    <div className={styles.contentCard}>
                        <div className={styles.editorToolbar}>
                            <div>
                                <span className={styles.sectionEyebrow}>Style editor</span>
                                <h2 className={styles.sectionTitle}>Colores y estilo editables</h2>
                            </div>
                            <div className={styles.buttonRow}>
                                <button type="button" className={styles.secondaryButton} onClick={handleSaveChanges} disabled={isSaving}>
                                    <Save size={16} />
                                    {isSaving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>
                        <div className={styles.styleEditorGrid}>
                            <div className={styles.styleEditorField}>
                                <label className={styles.typographyEditorLabel}>Acento</label>
                                <input type="color" value={editorState.previewAccent} onChange={(event) => updatePreviewField('previewAccent', event.target.value)} />
                            </div>
                            <div className={styles.styleEditorField}>
                                <label className={styles.typographyEditorLabel}>Surface</label>
                                <input type="color" value={editorState.previewSurface} onChange={(event) => updatePreviewField('previewSurface', event.target.value)} />
                            </div>
                            <div className={styles.styleEditorField}>
                                <label className={styles.typographyEditorLabel}>Gradiente inicio</label>
                                <input type="color" value={editorState.previewGradientFrom} onChange={(event) => updatePreviewField('previewGradientFrom', event.target.value)} />
                            </div>
                            <div className={styles.styleEditorField}>
                                <label className={styles.typographyEditorLabel}>Gradiente final</label>
                                <input type="color" value={editorState.previewGradientTo} onChange={(event) => updatePreviewField('previewGradientTo', event.target.value)} />
                            </div>
                            <div className={styles.styleEditorField}>
                                <label className={styles.typographyEditorLabel}>Modo visual</label>
                                <select
                                    className={styles.selectCompact}
                                    value={editorState.previewMode}
                                    onChange={(event) => updatePreviewField('previewMode', event.target.value as PreviewMode)}
                                >
                                    {PREVIEW_MODE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className={styles.dualColumn}>
                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Paletas reales</span>
                            <div className={styles.stackList}>
                                {editorState.palette.map((token) => (
                                    <div key={token.id} className={styles.colorEditorRow}>
                                        <input
                                            className={styles.colorInput}
                                            type="color"
                                            value={token.value}
                                            onChange={(event) => updatePaletteItem(token.id, 'value', event.target.value)}
                                        />
                                        <div>
                                            <input
                                                className={styles.inputField}
                                                value={token.label}
                                                onChange={(event) => updatePaletteItem(token.id, 'label', event.target.value)}
                                            />
                                            <textarea
                                                className={styles.textareaField}
                                                value={token.note}
                                                onChange={(event) => updatePaletteItem(token.id, 'note', event.target.value)}
                                                rows={2}
                                            />
                                        </div>
                                        <span className={styles.infoPill}>{token.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Reglas y capacidades</span>
                            <div className={styles.styleList}>
                                {editorState.styleRules.map((rule) => (
                                    <div key={rule.id} className={styles.styleRuleRow}>
                                        <input
                                            className={styles.inputField}
                                            value={rule.label}
                                            onChange={(event) => updateStyleRule(rule.id, 'label', event.target.value)}
                                        />
                                        <textarea
                                            className={styles.textareaField}
                                            value={rule.value}
                                            onChange={(event) => updateStyleRule(rule.id, 'value', event.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {activeTab === 'config' ? (
                <section className={styles.tabPane}>
                    <div className={styles.configBanner}>
                        <div>
                            <h2 className={styles.configBannerTitle}>
                                {design.userConfig.personalized ? 'Configuracion cloud detectada' : 'Todavia no hay presets cloud'}
                            </h2>
                            <p className={styles.configBannerText}>
                                {design.userConfig.personalized
                                    ? `${design.userConfig.totalPresets} presets reales sincronizados para ${design.userConfig.ownerLabel}.`
                                    : 'La cuenta actual aun no guardo presets en user_export_presets. Se esta viendo solo el sistema base.'}
                            </p>
                        </div>

                        <div className={styles.buttonRow}>
                            <div className={styles.secondaryButton}>Editorial: {design.userConfig.editorialPresetCount}</div>
                            <div className={styles.secondaryButton}>Gradientes: {design.userConfig.gradientPresetCount}</div>
                        </div>
                    </div>

                    <div className={styles.contentGrid}>
                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Resumen de sincronizacion</span>
                            <div className={styles.stackList}>
                                <div className={styles.stackItem}>
                                    <div className={styles.stackTitle}>Fuente</div>
                                    <div className={styles.stackMeta}>{design.userConfig.syncSourceLabel}</div>
                                </div>
                                <div className={styles.stackItem}>
                                    <div className={styles.stackTitle}>Primera creacion</div>
                                    <div className={styles.stackMeta}>{design.userConfig.firstCreatedAtLabel || '-'}</div>
                                </div>
                                <div className={styles.stackItem}>
                                    <div className={styles.stackTitle}>Ultima actualizacion</div>
                                    <div className={styles.stackMeta}>{design.userConfig.lastUpdatedAtLabel || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.contentCard}>
                            <span className={styles.sectionEyebrow}>Presets recientes</span>
                            <div className={styles.stackList}>
                                {recentPresets.length > 0 ? recentPresets.map((preset) => (
                                    <div key={preset.id} className={styles.stackItem}>
                                        <div className={styles.stackTitle}>{preset.name}</div>
                                        <div className={styles.stackMeta}>
                                            {preset.presetType === 'editorial' ? 'Editorial' : 'Gradiente'}
                                            {preset.layoutPresetId ? ` / layout ${preset.layoutPresetId}` : ''}
                                            {preset.hasTexture ? ' / con textura' : ''}
                                        </div>
                                        <div className={styles.stackMeta}>
                                            {preset.gradientLeftColor && preset.gradientRightColor
                                                ? `${preset.gradientLeftColor} -> ${preset.gradientRightColor}`
                                                : 'Sin gradiente registrado'}
                                        </div>
                                        <div className={styles.stackMeta}>
                                            {preset.updatedAtLabel || preset.createdAtLabel || 'Sin fecha'} / sponsors {preset.sponsorCount}
                                        </div>
                                    </div>
                                )) : (
                                    <div className={styles.stackItem}>
                                        <div className={styles.stackMeta}>No hay presets cloud para listar en esta cuenta.</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}
        </div>
    );
}
