'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import { Plus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { resolveAdminPanel } from '@/lib/auth/roles';
import { mapDesignSlugToVisualFamily, readActiveExportDesign, type ExportDesignSlug, type ExportVisualFamily } from '@/lib/exports/activeDesign';
import {
    EXPORT_DESIGN_CUSTOMIZATION_EVENT,
    hydrateSavedExportDesignCustomization,
    readSavedExportDesignCustomization,
    type ExportDesignCustomizationState,
    type ExportDesignElementDimensionContext,
    type ExportDesignElementDimensionContextId,
    type ExportDesignElementDimensionItemId,
    type ExportDesignTypographyContextId,
    type ExportDesignTypographySlot,
} from '@/lib/exports/designCustomizations';
import { findCountryRecord } from '@/lib/data/countries';
import GuestExportInvite, { useGuestExportInvite } from '@/components/GuestExportInvite';
import { createClient } from '@/lib/supabase/client';
import styles from './ExportButton.module.css';

export type ExportFormat = '1080x1350' | '1080x1920';
export type ExportTemplate = 'standings' | 'dailyMatches' | 'matchStats' | 'playerStats' | 'playoffBracket' | 'lineups' | 'squad' | 'teamOfWeek';
type ExportDateValue = string | number | Date;
export type MatchExportMode = 'schedule' | 'result';
export type MatchExportLayout = 'classic' | 'editorial4x5';
export type StandingsExportMode = 'table' | 'groups' | 'singleGroup';
export type LineupExportMode = 'both' | 'home' | 'away';
// Formacion de G22 Base: la escalera clasica o la editorial con foto.
export type LineupExportLayout = 'classic' | 'editorial';
// Que se lee en el centro de un partido que todavia no se jugo: la hora o un VS.
export type DailyMatchesTimeMode = 'time' | 'vs';
type DensityMode = 'comfortable' | 'compact' | 'ultra-compact';

interface StandingsRowData {
    pos: number;
    team: string;
    teamLogo?: string;
    labelName?: string;
    zoneColor?: string;
    played: number | string;
    won: number | string;
    lost: number | string;
    diff: string;
    points: number | string;
    pointsDeltaLabel?: string;
    pointsDeltaTone?: 'positive' | 'negative' | 'neutral';
    // Subrayado por movimiento del afiche de ranking: oro para el lider, verde
    // para el que subio, rojo para el que bajo. Lo llena SOLO el ranking de
    // World Rugby (`buildRankingExportRows` con `movementHighlight`); en el de
    // clubes el color de la fila lo pone `zoneColor`, que es la zona.
    movementColor?: string;
    /** 0 a 1: cuanto tinte lleva la banda. */
    movementStrength?: number;
    // Solo la placa ladder: renglon chico bajo el nombre (el club del jugador,
    // los partidos jugados del equipo).
    caption?: string;
}

interface StandingsGroupData {
    name: string;
    rows: StandingsRowData[];
}

interface StandingsSlideGroupData extends StandingsGroupData {
    continuedFromPrevious?: boolean;
    continuesOnNext?: boolean;
}

interface StandingsSlideData {
    groups: StandingsSlideGroupData[];
    pageNumber: number;
    totalPages: number;
    totalRows: number;
}

type StandingsLegendEntry = {
    key: string;
    label: string;
    color: string;
};

export interface StandingsData {
    title: string;
    subtitle: string;
    tournamentLogo?: string;
    rows: StandingsRowData[];
    groups?: StandingsGroupData[];
    highlightTeam?: string;
    highlightPosition?: number;
    highlightColor?: string;
    highlightTextColor?: string;
    columnLabels?: Partial<{
        played: string;
        won: string;
        lost: string;
        diff: string;
        points: string;
    }>;
    plainDiff?: boolean;
    showPositionDelta?: boolean;
    // 'rankingPoster' cambia el dibujo a afiche full-bleed (banda vertical con el
    // titulo, columnas P/Equipo/PTS/VAR) en vez de la tabla de posiciones clasica.
    // 'palmares' dibuja la vitrina de un torneo: podio 2-1-3 con el escudo grande
    // y el resto de los campeones como listado. En sus filas `points` son titulos.
    // 'ladder' es la placa de tabla al estilo NRL: fondo negro, titulo enorme y
    // una fila por entidad con escudo en tile, valor principal (`points` + la
    // unidad de `columnLabels.points`), dato secundario (`diff` + opcionalmente
    // `columnLabels.diff`) y flecha de tendencia (`pointsDeltaTone`).
    variant?: 'rankingPoster' | 'palmares' | 'ladder';
}

export interface DailyMatchesData {
    date: string;
    tournament: string;
    tournamentLogo?: string;
    matches: Array<{
        homeTeam: string;
        awayTeam: string;
        homeLogo?: string;
        awayLogo?: string;
        homeScore?: number;
        awayScore?: number;
        time: string;
        status: 'scheduled' | 'live' | 'finished';
        dateLabel?: string;
        kickoffAt?: ExportDateValue | null;
    }>;
}

export interface MatchStatsData {
    mainTitle?: string;
    status?: 'scheduled' | 'live' | 'final';
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    // Penales (definición por tanda). Si ambos vienen, se muestran entre paréntesis a los costados del marcador.
    homePenalties?: number | null;
    awayPenalties?: number | null;
    homeLogo?: string;
    awayLogo?: string;
    tournament: string;
    tournamentId?: string | number | null;
    tournamentUrl?: string | null;
    tournamentLogo?: string;
    date: string;
    time?: string;
    venue?: string;
    kickoffAt?: ExportDateValue | null;
    backgroundImage?: string;
    editorialLayoutPresetId?: MatchEditorialPresetId;
    editorialContextLabel?: string;
    editorialShowTopBadge?: boolean;
    editorialShowHeaderArrows?: boolean;
    editorialGradientImage?: string;
    sponsors?: MatchSponsorData[];
    // Id del deporte del partido ('rugby', 'field-hockey', 'football'...). La
    // placa lo usa para elegir su marca; si no llega, cae en Grupo 22 TV.
    // Llega de paginas tipadas flojo: puede venir como numero o como objeto, asi
    // que el tipo es amplio y el consumidor lo normaliza.
    sport?: string | number | null;
    stats: Array<{ label: string; home: number | string; away: number | string }>;
}

export interface PlayerStatsData {
    name: string;
    team: string;
    position: string;
    photo?: string;
    stats: Array<{ label: string; value: number | string; highlight?: boolean }>;
}

export interface LineupExportPlayerData {
    id?: string | null;
    number?: number | string | null;
    name: string;
    position?: string | null;
    role?: string | null;
    rating?: number | string | null;
    isCaptain?: boolean | null;
}

export interface LineupExportTeamData {
    name: string;
    logo?: string;
    lineupLabel?: string;
    starters: LineupExportPlayerData[];
}

export interface LineupsData {
    title?: string;
    subtitle?: string;
    tournament: string;
    tournamentLogo?: string;
    date?: string;
    time?: string;
    venue?: string;
    kickoffAt?: ExportDateValue | null;
    homeTeam: LineupExportTeamData;
    awayTeam: LineupExportTeamData;
    // Solo la formacion editorial de G22 Base: la foto que ocupa la mitad izquierda.
    backgroundImage?: string;
    // Deporte del partido: decide la marca del pie (Salida de 22 en rugby).
    sport?: string | null;
}

export interface TeamOfWeekPlayerData {
    id?: string | null;
    number?: number | string | null;
    name: string;
    position?: string | null;
    team?: string | null;
    teamLogo?: string | null;
    rating?: number | string | null;
    isCaptain?: boolean | null;
}

export interface TeamOfWeekData {
    title?: string;
    subtitle?: string;
    tournament: string;
    tournamentLogo?: string;
    date?: string;
    venue?: string;
    meta?: string;
    players: TeamOfWeekPlayerData[];
    replacements?: TeamOfWeekPlayerData[];
}

export interface SquadExportPlayerData {
    id?: string | null;
    number?: number | string | null;
    name: string;
    country?: string | null;
    position?: string | null;
    teamLabel?: string | null;
    age?: number | string | null;
    birthDate?: string | null;
    status?: string | null;
}

export interface SquadExportGroupData {
    label: string;
    players: SquadExportPlayerData[];
}

export interface SquadData {
    title?: string;
    subtitle?: string;
    tournament: string;
    tournamentLogo?: string;
    teamName: string;
    teamLogo?: string;
    groups: SquadExportGroupData[];
    // Deporte del club: decide la marca del pie de la convocatoria.
    sport?: string | null;
}

export interface PlayoffBracketMatchData {
    match_id?: string | number;
    home_team?: {
        id?: string | number;
        name?: string;
        logo?: string;
    } | null;
    away_team?: {
        id?: string | number;
        name?: string;
        logo?: string;
    } | null;
    home_participant?: {
        participant_id?: string | number;
        participant_name?: string;
        image_path?: string;
    } | null;
    away_participant?: {
        participant_id?: string | number;
        participant_name?: string;
        image_path?: string;
    } | null;
    score_home?: number | string | null;
    score_away?: number | string | null;
    winner_id?: string | number | null;
    match_start_iso?: string | null;
    status?: string;
    result?: string;
}

export interface PlayoffBracketRoundData {
    round_id?: string | number;
    /** Local brackets emit `name`; the external feed emits `round_name`. */
    name?: string;
    round_name?: string;
    ROUND_NAME?: string;
    matches: PlayoffBracketMatchData[];
}

export interface PlayoffBracketData {
    title: string;
    subtitle?: string;
    tournamentLogo?: string;
    rounds: PlayoffBracketRoundData[];
}

export type ExportData = StandingsData | DailyMatchesData | MatchStatsData | PlayerStatsData | PlayoffBracketData | LineupsData | SquadData | TeamOfWeekData;
type CanvasFormat = { width: number; height: number };
type SafeArea = { top: number; bottom: number; centerX: number; width: number; height: number };
type MatchBackgroundUpload = { name: string; src: string };
type MatchSponsorData = {
    id?: string;
    name?: string;
    logo?: string;
    placement?: string;
};
type ExportColorDefaults = {
    selectedPaletteId: string;
    bgColor: string;
    accentColor: string;
    editorialGradientLeftColor: string;
    editorialGradientRightColor: string;
};
type MatchEditorialPresetId = 'balanced' | 'broadcast' | 'hero';
type MatchEditorialLayoutPreset = {
    id: MatchEditorialPresetId;
    label: string;
    description: string;
    scoreInset: number;
    lineWidth: number;
    centerGap: number;
    logoWidth: number;
    logoHeight: number;
    logoOffsetY: number;
    scoreFontSize: number;
    scoreTopGap: number;
    scoreBottomGap: number;
    bottomRuleInset: number;
    titleFontSize: number;
    tournamentLogoSize: number;
    tournamentLogoOffsetY: number;
    gradientBottomOpacity: number;
    gradientSideCoreOpacity: number;
    gradientSideMidOpacity: number;
    sponsorLogoHeight: number;
    sponsorGap: number;
};
type SavedMatchEditorialPreset = {
    id: string;
    name: string;
    layoutPresetId: MatchEditorialPresetId;
    gradientLeftColor: string;
    gradientRightColor: string;
    gradientImage: MatchBackgroundUpload | null;
    sponsors: MatchSponsorData[];
};
type SavedMatchGradientPreset = {
    id: string;
    name: string;
    gradientLeftColor: string;
    gradientRightColor: string;
    gradientImage: MatchBackgroundUpload | null;
};
type ExportPresetStorageMode = 'local' | 'cloud';
// La placa clasica de partido se pinta con tres colores propios —las dos
// puntas del degradado y la tinta— mas la marca del pie. No son Fondo +
// Acento: en "Auto" se derivan de ellos, pero apenas tocas uno la placa deja
// de mirar la paleta. Por eso las placas se guardan en su propia biblioteca y
// no ensucian la de gradientes.
type SavedMatchPlatePreset = {
    id: string;
    name: string;
    field: string;
    fieldEnd: string;
    ink: string;
    brand: PlateBrandId;
};
type ExportPresetKind = 'editorial' | 'gradient' | 'plate';
type SupabaseBrowserClient = ReturnType<typeof createClient>;
type PersistedExportPresetRow = {
    id: string;
    name: string;
    payload: unknown;
    updated_at?: string;
};
type RemoteExportPresetRow = {
    id: string;
    user_id: string;
    preset_type: ExportPresetKind;
    name: string;
    name_normalized: string;
    payload: Record<string, unknown>;
};

interface ExportImageProps {
    template: ExportTemplate;
    data: ExportData;
    filename?: string;
    className?: string;
}

type ExportPreviewColorOverrides = {
    accentColor: string;
    bgColor: string;
    editorialGradientLeftColor?: string;
    editorialGradientRightColor?: string;
    // Solo para variant 'rankingPoster': los tres colores extra del afiche.
    rankingGlowColor?: string;
    rankingPanelColor?: string;
    rankingGoldColor?: string;
    // Solo para la familia Impacto V4. Vacio = derivado de Fondo + Acento.
    impactoFieldColor?: string;
    impactoInkColor?: string;
    impactoBarColor?: string;
    impactoRowColor?: string;
    // Solo para la formacion y la convocatoria de G22 Base. Vacio = derivado de Fondo + Acento.
    lineupFieldColor?: string;
    lineupGlowColor?: string;
    lineupNamesColor?: string;
    lineupInkColor?: string;
    lineupLinesColor?: string;
};

type ExportImagePreviewProps = {
    template: ExportTemplate;
    data: ExportData;
    format?: ExportFormat;
    visualFamily: ExportVisualFamily;
    customizationState?: ExportDesignCustomizationState | null;
    previewColors?: ExportPreviewColorOverrides;
    // Solo para la placa clasica de G22 Base: colores, marca del pie y fila de datos.
    plateOptions?: ExportPlateOptions;
    matchExportMode?: MatchExportMode;
    matchExportLayout?: MatchExportLayout;
    lineupExportMode?: LineupExportMode;
    lineupExportLayout?: LineupExportLayout;
    standingsExportMode?: StandingsExportMode;
    dailyMatchesTimeMode?: DailyMatchesTimeMode;
    className?: string;
};

type LogoBadgeOptions = {
    x: number;
    y: number;
    size: number;
    img: HTMLImageElement | null;
    label: string;
    rawLogo?: string;
    isDark: boolean;
    showFrame?: boolean;
};

type TournamentRibbonOptions = {
    maxWidth?: number;
    titleDefaultSize?: number;
    logoDefaultSize?: number;
    maxFontSize?: number;
    minFontSize?: number;
    maxLogoSize?: number;
    showLogoFrame?: boolean;
};

type OverflowCrestOptions = {
    x: number;
    y: number;
    width: number;
    height: number;
    img: HTMLImageElement | null;
    label: string;
    rawLogo?: string;
    isDark: boolean;
    showFrame?: boolean;
};

type ExportPalette = {
    id: string;
    name: string;
    description: string;
    bg: string;
    accent: string;
};

type ExportTimeZonePreset = {
    id: string;
    city: string;
    country: string;
    utcOffsetMinutes: number;
};
type ExportTypographyRole = 'display' | 'body' | 'mono' | 'editorial' | 'score';
type ExportFontFamilyOptionId = 'outfit' | 'inter' | 'bebas' | 'dharma' | 'jetbrains' | 'tangerine' | 'inconsolata' | 'cantarell' | 'roboto-mono' | 'rancho';
type ExportTypographyPresetId = 'g22-core' | 'momentum-v2' | 'poster-v3' | 'impacto-v4' | 'fan-v5' | 'inter-tight' | 'mono-sport';
type LocalExportFont = {
    family: string;
    weight: string;
    style?: string;
    sources: string[];
};
type ExportFontFamilyOption = {
    id: ExportFontFamilyOptionId;
    label: string;
    family: string;
    note: string;
    sample: string;
};
type ExportTypographyPreset = {
    id: ExportTypographyPresetId;
    label: string;
    description: string;
    recommendedFor?: ExportVisualFamily[];
    roles: Record<ExportTypographyRole, ExportFontFamilyOptionId>;
};
type ExportTypographyRoleOverride = {
    family?: string;
    weight?: string;
};
type ResolvedTypographyConfig = {
    preset: ExportTypographyPreset;
    roles: Record<ExportTypographyRole, ExportFontFamilyOptionId>;
    families: Record<ExportTypographyRole, string>;
    weights: Record<ExportTypographyRole, string>;
};
type ActiveExportElementDimensions = Partial<Record<ExportDesignElementDimensionItemId, { width: number; offsetY: number }>>;

const DHARMA_GOTHIC_C_FAMILY = '"dharma-gothic-c", sans-serif';
const DHARMA_GOTHIC_E_FAMILY = '"dharma-gothic-e", sans-serif';
const DHARMA_GOTHIC_M_FAMILY = '"dharma-gothic-m", sans-serif';

const FORMATS: Array<{ value: ExportFormat; label: string; width: number; height: number }> = [
    { value: '1080x1350', label: 'Post (1080x1350)', width: 1080, height: 1350 },
    { value: '1080x1920', label: 'Story (1080x1920)', width: 1080, height: 1920 },
];

const exportOutfitFont = Outfit({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700', '800', '900'],
    display: 'swap',
});
const exportJetBrainsMonoFont = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800'],
    display: 'swap',
});

const BASE_FONT_OUTFIT = exportOutfitFont.style.fontFamily;
const BASE_FONT_INTER = '"Inter", "Outfit", system-ui, sans-serif';
const BASE_FONT_MONO = exportJetBrainsMonoFont.style.fontFamily;
const BASE_FONT_BEBAS = '"Bebas Neue", "Outfit", "Inter", system-ui, sans-serif';
const BASE_FONT_DHARMA = `${DHARMA_GOTHIC_E_FAMILY}, ${DHARMA_GOTHIC_C_FAMILY}, ${DHARMA_GOTHIC_M_FAMILY}, "G22 Dharma Gothic", "Dharma Gothic Expanded Heavy", "Dharma Gothic E Heavy", "Dharma Gothic Expanded", "Dharma Gothic E", "Bebas Neue", "Outfit", "Inter", system-ui, sans-serif`;
const BASE_FONT_TANGERINE = '"Tangerine", "Times New Roman", serif';
const BASE_FONT_INCONSOLATA = '"Inconsolata", "JetBrains Mono", monospace';
const BASE_FONT_CANTARELL = '"Cantarell", "Inter", "Outfit", sans-serif';
const BASE_FONT_ROBOTO_MONO = '"Roboto Mono", "JetBrains Mono", monospace';
const BASE_FONT_RANCHO = '"Rancho", "Bebas Neue", cursive';
let FONT_DISPLAY = BASE_FONT_OUTFIT;
export let FONT_BODY = BASE_FONT_OUTFIT;
let FONT_MONO = BASE_FONT_MONO;
export let FONT_OUTFIT_BLACK = BASE_FONT_OUTFIT;
let FONT_EDITORIAL = BASE_FONT_BEBAS;
let FONT_CLASSIC_MATCH_SCORE = BASE_FONT_DHARMA;
let FONT_EDITORIAL_SCORE = BASE_FONT_DHARMA;
let FONT_WEIGHT_DISPLAY = '900';
let FONT_WEIGHT_BODY = '700';
let FONT_WEIGHT_MONO = '700';
let FONT_WEIGHT_EDITORIAL = '800';
let FONT_WEIGHT_SCORE = '900';
let ACTIVE_EXPORT_ELEMENT_DIMENSIONS: ActiveExportElementDimensions = {};
const BRAND_ACCENT = '#00a365';
const EDITORIAL_PRESET_STORAGE_KEY = 'g22-export-editorial-presets-v1';
const EDITORIAL_GRADIENT_PRESET_STORAGE_KEY = 'g22-export-editorial-gradient-presets-v1';
const PLATE_PRESET_STORAGE_KEY = 'g22-export-plate-presets-v1';
const EXPORT_STORAGE_DB_NAME = 'g22-export-storage';
const EXPORT_STORAGE_DB_VERSION = 1;
const EXPORT_STORAGE_STORE_NAME = 'kv';
const EXPORT_STORAGE_EDITORIAL_PRESETS_KEY = 'editorial-presets';
const EXPORT_STORAGE_EDITORIAL_GRADIENTS_KEY = 'editorial-gradient-presets';
const EXPORT_STORAGE_PLATE_PRESETS_KEY = 'plate-presets';
const EXPORT_PRESETS_TABLE = 'user_export_presets';
const MAX_SAVED_EDITORIAL_PRESETS = 24;
const MAX_SAVED_EDITORIAL_GRADIENT_PRESETS = 24;
const MAX_SAVED_PLATE_PRESETS = 24;
// Lo que muestra cada selector cuando el color esta en "Auto". Es el valor de
// reposo del input, no el color derivado: por eso un preset guarda vacio y no
// este hex, asi "Auto" sigue siendo "Auto" cuando la placa vuelve.
const PLATE_FIELD_FALLBACK = '#1d6d92';
const PLATE_FIELD_END_FALLBACK = '#0f3d52';
const PLATE_INK_FALLBACK = '#ffffff';
const EDITORIAL_SPONSOR_SLOTS = 6;
const EDITORIAL_TEXTURE_SOURCE = '/textures/vecteezy_grey-distressed-grunge-background_154365.svg';
const LOCAL_EXPORT_FONTS: LocalExportFont[] = [
    {
        family: 'G22 Dharma Gothic',
        weight: '800',
        sources: [
            '/fonts/dharma-gothic-heavy.woff2',
            '/fonts/dharma-gothic-expanded-heavy.woff2',
            '/fonts/dharma-gothic-e-heavy.woff2',
            '/fonts/dharma-gothic-heavy.woff',
        ],
    },
];
const EXPORT_PALETTES: ExportPalette[] = [
    { id: 'g22-dark', name: 'G22 Dark', description: 'Carbono y verde marca', bg: '#0a0a0b', accent: '#00a365' },
    { id: 'g22-light', name: 'G22 Light', description: 'Claro con acento marca', bg: '#f8fafc', accent: '#00a365' },
    { id: 'rugby-navy', name: 'Rugby Navy', description: 'Azul profundo y cian', bg: '#0f172a', accent: '#38bdf8' },
    { id: 'crimson-night', name: 'Crimson Night', description: 'Grafito con rojo intenso', bg: '#111827', accent: '#ef4444' },
    { id: 'gold-ink', name: 'Gold Ink', description: 'Negro con dorado editorial', bg: '#161616', accent: '#eab308' },
    { id: 'silver-sky', name: 'Silver Sky', description: 'Blanco con azul limpio', bg: '#ffffff', accent: '#2563eb' },
    { id: 'ranking-navy', name: 'Ranking Navy', description: 'Azul profundo con puntos dorados', bg: '#050b1f', accent: '#12297d' },
];
const DEFAULT_PALETTE = EXPORT_PALETTES[0];

// El poster de ranking se pinta con CINCO colores, no con los dos usuales:
// fondo (esquina negra), banda (columna del titulo), brillo (luz electrica de
// abajo y barra del lider), panel (lamina donde vive la tabla) y dorado
// (posiciones y puntos). Las combinaciones fijan los cinco de una vez.
type RankingPosterCombo = {
    id: string;
    name: string;
    description: string;
    bg: string;
    accent: string;
    glow: string;
    panel: string;
    gold: string;
};

const RANKING_POSTER_COMBOS: RankingPosterCombo[] = [
    { id: 'salida-azul', name: 'Salida Azul', description: 'El navy original con luz electrica', bg: '#050b1f', accent: '#12297d', glow: '#1f4dff', panel: '#3d5db8', gold: '#f6c445' },
    { id: 'carbon-g22', name: 'Carbon G22', description: 'Carbono con verde marca', bg: '#08090a', accent: '#0b4634', glow: '#00e07c', panel: '#1d6b52', gold: '#f6c445' },
    { id: 'bordo-noche', name: 'Bordo Noche', description: 'Granate profundo con rosa', bg: '#160610', accent: '#701a35', glow: '#f43f6b', panel: '#a13a5c', gold: '#fbbf24' },
    { id: 'violeta-real', name: 'Violeta Real', description: 'Purpura con lavanda', bg: '#0b0720', accent: '#3f1d84', glow: '#8b5cf6', panel: '#6a50c0', gold: '#f6c445' },
    { id: 'grafito-oro', name: 'Grafito Oro', description: 'Grises con dorado editorial', bg: '#0d0d0f', accent: '#26262b', glow: '#8b8b94', panel: '#4c4c55', gold: '#eab308' },
];

type RankingPosterExtraColors = {
    glow?: string;
    panel?: string;
    gold?: string;
};
const DEFAULT_TIMEZONE_PRESET_ID = 'buenos-aires-ar';
const DEFAULT_TIMEZONE_OFFSET_MINUTES = -180;
const MAX_STANDINGS_ROWS_PER_SLIDE = 20;
// La placa ladder pagina de a diez: cada placa es un top diez, no media tabla.
const LADDER_MAX_ROWS = 10;
const EXPORT_VISUAL_FAMILY_OPTIONS: Array<{ value: ExportVisualFamily; label: string; description: string }> = [
    { value: 'g22Base', label: 'G22 Base', description: 'Sistema actual con superficies limpias y estructura modular' },
    { value: 'momentumV2', label: 'Momentum V2', description: 'Nueva familia inspirada en los templates editoriales del rar' },
    { value: 'posterV3', label: 'Poster V3', description: 'Tercera familia con lenguaje de afiche, outlines gigantes y acentos neon' },
    { value: 'impactoV4', label: 'Impacto V4', description: 'Placa de color pleno con titular condensado gigante, reglas blancas y filas de color' },
    { value: 'fanV5', label: 'Fan V5', description: 'La basica del hincha: hoja clara, tinta negra, filetes finos y cero efectos' },
];
const EXPORT_FONT_FAMILY_OPTIONS: ExportFontFamilyOption[] = [
    { id: 'outfit', label: 'Outfit', family: BASE_FONT_OUTFIT, note: 'Sans limpia y modular', sample: 'MATCHDAY' },
    { id: 'inter', label: 'Inter', family: BASE_FONT_INTER, note: 'Texto mas neutro y editorial', sample: 'FULL TIME' },
    { id: 'bebas', label: 'Bebas Neue', family: BASE_FONT_BEBAS, note: 'Condensada para titulares', sample: 'FIXTURES' },
    { id: 'dharma', label: 'Dharma Gothic', family: BASE_FONT_DHARMA, note: 'Impacto para scores y poster con las variantes reales cargadas por Typekit.', sample: '3 2' },
    { id: 'jetbrains', label: 'JetBrains Mono', family: BASE_FONT_MONO, note: 'Tecnica para metadata', sample: '20:30' },
    { id: 'tangerine', label: 'Tangerine', family: BASE_FONT_TANGERINE, note: 'Script ornamental para piezas especiales', sample: 'Final night' },
    { id: 'inconsolata', label: 'Inconsolata', family: BASE_FONT_INCONSOLATA, note: 'Mono editorial con mas personalidad', sample: 'MD 05' },
    { id: 'cantarell', label: 'Cantarell', family: BASE_FONT_CANTARELL, note: 'Sans humanista para labels y cuerpo', sample: 'Match center' },
    { id: 'roboto-mono', label: 'Roboto Mono', family: BASE_FONT_ROBOTO_MONO, note: 'Mono precisa para horarios y stats', sample: '21:45' },
    { id: 'rancho', label: 'Rancho', family: BASE_FONT_RANCHO, note: 'Display expresiva para posters o titulares especiales', sample: 'Grande finale' },
];
const EXPORT_TYPOGRAPHY_ROLE_OPTIONS: Record<ExportTypographyRole, ExportFontFamilyOptionId[]> = {
    display: ['outfit', 'inter', 'bebas', 'dharma', 'cantarell', 'rancho', 'tangerine'],
    body: ['outfit', 'inter', 'cantarell', 'jetbrains', 'bebas', 'inconsolata'],
    mono: ['jetbrains', 'roboto-mono', 'inconsolata', 'inter', 'outfit'],
    editorial: ['bebas', 'dharma', 'rancho', 'cantarell', 'outfit', 'inter', 'tangerine'],
    score: ['dharma', 'bebas', 'roboto-mono', 'inconsolata', 'outfit', 'jetbrains'],
};
const EXPORT_TYPOGRAPHY_PRESETS: ExportTypographyPreset[] = [
    {
        id: 'g22-core',
        label: 'G22 Core',
        description: 'Preset actual del sistema base, equilibrado para datos, labels y scores.',
        recommendedFor: ['g22Base'],
        roles: { display: 'outfit', body: 'outfit', mono: 'jetbrains', editorial: 'bebas', score: 'dharma' },
    },
    {
        id: 'momentum-v2',
        label: 'Momentum Editorial',
        description: 'Titulares condensados con cuerpo mas sobrio para la familia Momentum V2.',
        recommendedFor: ['momentumV2'],
        roles: { display: 'outfit', body: 'inter', mono: 'jetbrains', editorial: 'bebas', score: 'dharma' },
    },
    {
        id: 'poster-v3',
        label: 'Poster V3',
        description: 'Preset recomendado para la nueva familia poster: titulares agresivos y cuerpo editorial.',
        recommendedFor: ['posterV3'],
        roles: { display: 'bebas', body: 'inter', mono: 'jetbrains', editorial: 'bebas', score: 'dharma' },
    },
    {
        id: 'impacto-v4',
        label: 'Impacto Placa',
        description: 'Titular y numeros en condensada pesada, nombres en sans bold: el reparto de la familia Impacto V4.',
        recommendedFor: ['impactoV4'],
        roles: { display: 'outfit', body: 'outfit', mono: 'jetbrains', editorial: 'dharma', score: 'dharma' },
    },
    {
        id: 'fan-v5',
        label: 'Fan Simple',
        description: 'Sans en los cinco roles: la familia Fan no usa condensadas ni display, ni siquiera en el marcador.',
        recommendedFor: ['fanV5'],
        roles: { display: 'inter', body: 'inter', mono: 'jetbrains', editorial: 'outfit', score: 'outfit' },
    },
    {
        id: 'inter-tight',
        label: 'Inter Tight',
        description: 'Version mas limpia y moderna cuando quieres bajar dramatismo sin perder legibilidad.',
        roles: { display: 'inter', body: 'inter', mono: 'jetbrains', editorial: 'bebas', score: 'dharma' },
    },
    {
        id: 'mono-sport',
        label: 'Mono Sport',
        description: 'Look mas tecnico para overlays y layouts orientados a data.',
        roles: { display: 'outfit', body: 'outfit', mono: 'jetbrains', editorial: 'jetbrains', score: 'dharma' },
    },
];
type ImpactoColorControlId = 'field' | 'ink' | 'bar' | 'row';
// Los cinco colores de la formacion y la convocatoria de G22 Base. Vacio = derivado
// de Fondo + Acento, que es lo que se ve con todo en Auto.
type LineupColorControlId = 'field' | 'glow' | 'names' | 'ink' | 'lines';
type LineupColorOverrides = Partial<Record<LineupColorControlId, string>>;
const LINEUP_COLOR_CONTROLS: Array<{ id: LineupColorControlId; label: string; hint: string; placeholder: string }> = [
    { id: 'field', label: 'Fondo', hint: 'El campo oscuro de toda la pieza', placeholder: '#0b1220' },
    { id: 'glow', label: 'Luz', hint: 'La marca de agua XV de un equipo, el brillo de la cabecera de dos y el fundido sin foto de la editorial', placeholder: '#f59e0b' },
    { id: 'names', label: 'Nombres', hint: 'Los nombres de un equipo, los dorsales y rotulos de dos, y el titulo condensado de la editorial y la convocatoria', placeholder: '#f59e0b' },
    { id: 'ink', label: 'Tinta', hint: 'Nombres, titular XV INICIAL y el pie', placeholder: '#ffffff' },
    { id: 'lines', label: 'Filetes', hint: 'El subrayado de Suplentes con dos equipos y la tarjeta de la editorial', placeholder: '#f59e0b' },
];
const IMPACTO_COLOR_CONTROLS: Array<{ id: ImpactoColorControlId; label: string; hint: string; placeholder: string }> = [
    { id: 'field', label: 'Principal', hint: 'El campo de color de toda la pieza', placeholder: '#1d6d92' },
    { id: 'ink', label: 'Tinta', hint: 'Titular, reglas, numeros y nombres', placeholder: '#ffffff' },
    { id: 'bar', label: 'Barras', hint: 'Encabezado de la tabla y divisores', placeholder: '#2a3342' },
    { id: 'row', label: 'Filas', hint: 'Barra de cada partido y filas sin etiqueta', placeholder: '#111827' },
];
const MATCH_EXPORT_MODE_OPTIONS: Array<{ value: MatchExportMode; label: string; description: string }> = [
    { value: 'schedule', label: 'Horario', description: 'Muestra la programacion del partido' },
    { value: 'result', label: 'Resultado', description: 'Muestra el marcador cargado' },
];
const MATCH_EXPORT_LAYOUT_OPTIONS: Array<{ value: MatchExportLayout; label: string; description: string }> = [
    { value: 'classic', label: 'Clasico', description: 'Panel actual con marcador y estadisticas' },
    { value: 'editorial4x5', label: 'Editorial 4:5', description: 'Foto full-bleed con overlay para Instagram post' },
];
const LINEUP_EXPORT_MODE_OPTIONS: Array<{ value: LineupExportMode; label: string; description: string }> = [
    { value: 'both', label: 'Dos equipos', description: 'Lista las dos formaciones del partido en una sola pieza' },
    { value: 'home', label: 'Solo local', description: 'Centra la pieza en la formacion del equipo local' },
    { value: 'away', label: 'Solo visitante', description: 'Centra la pieza en la formacion del equipo visitante' },
];
const LINEUP_EXPORT_LAYOUT_OPTIONS: Array<{ value: LineupExportLayout; label: string; description: string }> = [
    { value: 'classic', label: 'Clasica', description: 'Un equipo: la lista centrada en serif con los suplentes al pie. Dos equipos: la banda con los escudos y dos columnas numeradas' },
    { value: 'editorial', label: 'Editorial', description: 'La foto del jugador a la izquierda y la lista numerada a la derecha' },
];
const DAILY_MATCHES_TIME_MODE_OPTIONS: Array<{ value: DailyMatchesTimeMode; label: string; description: string }> = [
    { value: 'time', label: 'Horario', description: 'Los partidos sin jugar muestran la hora de inicio' },
    { value: 'vs', label: 'VS', description: 'Los partidos sin jugar muestran VS y la hora queda afuera' },
];
const EDITORIAL_LAYOUT_PRESETS: MatchEditorialLayoutPreset[] = [
    {
        id: 'balanced',
        label: 'Balanced',
        description: 'Bloque editorial equilibrado para resultado final',
        scoreInset: 210,
        lineWidth: 286,
        centerGap: 188,
        logoWidth: 286,
        logoHeight: 186,
        logoOffsetY: 96,
        scoreFontSize: 266,
        scoreTopGap: 34,
        scoreBottomGap: 48,
        bottomRuleInset: 88,
        titleFontSize: 34,
        tournamentLogoSize: 196,
        tournamentLogoOffsetY: 0,
        gradientBottomOpacity: 0.97,
        gradientSideCoreOpacity: 0.94,
        gradientSideMidOpacity: 0.48,
        sponsorLogoHeight: 58,
        sponsorGap: 24,
    },
    {
        id: 'broadcast',
        label: 'Broadcast',
        description: 'Mas aire superior y bloque central compacto',
        scoreInset: 204,
        lineWidth: 300,
        centerGap: 176,
        logoWidth: 300,
        logoHeight: 194,
        logoOffsetY: 102,
        scoreFontSize: 272,
        scoreTopGap: 30,
        scoreBottomGap: 46,
        bottomRuleInset: 88,
        titleFontSize: 36,
        tournamentLogoSize: 204,
        tournamentLogoOffsetY: -4,
        gradientBottomOpacity: 0.98,
        gradientSideCoreOpacity: 0.96,
        gradientSideMidOpacity: 0.5,
        sponsorLogoHeight: 60,
        sponsorGap: 26,
    },
    {
        id: 'hero',
        label: 'Hero',
        description: 'Mas protagonismo para logos y branding central',
        scoreInset: 216,
        lineWidth: 294,
        centerGap: 192,
        logoWidth: 294,
        logoHeight: 198,
        logoOffsetY: 104,
        scoreFontSize: 270,
        scoreTopGap: 38,
        scoreBottomGap: 52,
        bottomRuleInset: 86,
        titleFontSize: 34,
        tournamentLogoSize: 212,
        tournamentLogoOffsetY: 4,
        gradientBottomOpacity: 0.99,
        gradientSideCoreOpacity: 0.98,
        gradientSideMidOpacity: 0.52,
        sponsorLogoHeight: 62,
        sponsorGap: 28,
    },
];
const DEFAULT_EDITORIAL_LAYOUT_PRESET_ID: MatchEditorialPresetId = 'balanced';
const DEFAULT_EDITORIAL_GRADIENT_PRESETS: SavedMatchGradientPreset[] = [
    { id: 'app-signature', name: 'Signature', gradientLeftColor: '#df255c', gradientRightColor: '#00a365', gradientImage: null },
    { id: 'app-broadcast', name: 'Broadcast', gradientLeftColor: '#1d4ed8', gradientRightColor: '#38bdf8', gradientImage: null },
    { id: 'app-inferno', name: 'Inferno', gradientLeftColor: '#7f1d1d', gradientRightColor: '#ef4444', gradientImage: null },
    { id: 'app-gold', name: 'Gold', gradientLeftColor: '#5b3b09', gradientRightColor: '#eab308', gradientImage: null },
    { id: 'app-frost', name: 'Frost', gradientLeftColor: '#4338ca', gradientRightColor: '#7dd3fc', gradientImage: null },
    { id: 'app-carbon', name: 'Carbon', gradientLeftColor: '#111827', gradientRightColor: '#22c55e', gradientImage: null },
];
const EXPORT_TIMEZONE_PRESETS: ExportTimeZonePreset[] = [
    { id: 'baker-island-us', city: 'Baker Island', country: 'Estados Unidos', utcOffsetMinutes: -720 },
    { id: 'pago-pago-as', city: 'Pago Pago', country: 'Samoa Americana', utcOffsetMinutes: -660 },
    { id: 'honolulu-us', city: 'Honolulu', country: 'Estados Unidos', utcOffsetMinutes: -600 },
    { id: 'taiohae-pf', city: 'Taiohae', country: 'Polinesia Francesa', utcOffsetMinutes: -570 },
    { id: 'gambier-pf', city: 'Gambier', country: 'Polinesia Francesa', utcOffsetMinutes: -540 },
    { id: 'adamstown-pn', city: 'Adamstown', country: 'Islas Pitcairn', utcOffsetMinutes: -480 },
    { id: 'hermosillo-mx', city: 'Hermosillo', country: 'Mexico', utcOffsetMinutes: -420 },
    { id: 'san-jose-cr', city: 'San Jose', country: 'Costa Rica', utcOffsetMinutes: -360 },
    { id: 'bogota-co', city: 'Bogota', country: 'Colombia', utcOffsetMinutes: -300 },
    { id: 'san-juan-pr', city: 'San Juan', country: 'Puerto Rico', utcOffsetMinutes: -240 },
    { id: 'st-johns-ca', city: "St. John's", country: 'Canada', utcOffsetMinutes: -210 },
    { id: 'buenos-aires-ar', city: 'Buenos Aires', country: 'Argentina', utcOffsetMinutes: -180 },
    { id: 'noronha-br', city: 'Fernando de Noronha', country: 'Brasil', utcOffsetMinutes: -120 },
    { id: 'ponta-delgada-pt', city: 'Ponta Delgada', country: 'Portugal', utcOffsetMinutes: -60 },
    { id: 'london-uk', city: 'Londres', country: 'Reino Unido', utcOffsetMinutes: 0 },
    { id: 'madrid-es', city: 'Madrid', country: 'Espana', utcOffsetMinutes: 60 },
    { id: 'johannesburg-za', city: 'Johannesburgo', country: 'Sudafrica', utcOffsetMinutes: 120 },
    { id: 'nairobi-ke', city: 'Nairobi', country: 'Kenia', utcOffsetMinutes: 180 },
    { id: 'tehran-ir', city: 'Teheran', country: 'Iran', utcOffsetMinutes: 210 },
    { id: 'dubai-ae', city: 'Dubai', country: 'Emiratos Arabes Unidos', utcOffsetMinutes: 240 },
    { id: 'kabul-af', city: 'Kabul', country: 'Afganistan', utcOffsetMinutes: 270 },
    { id: 'karachi-pk', city: 'Karachi', country: 'Pakistan', utcOffsetMinutes: 300 },
    { id: 'nueva-delhi-in', city: 'Nueva Delhi', country: 'India', utcOffsetMinutes: 330 },
    { id: 'katmandu-np', city: 'Katmandu', country: 'Nepal', utcOffsetMinutes: 345 },
    { id: 'daca-bd', city: 'Daca', country: 'Bangladesh', utcOffsetMinutes: 360 },
    { id: 'yangon-mm', city: 'Yangon', country: 'Myanmar', utcOffsetMinutes: 390 },
    { id: 'bangkok-th', city: 'Bangkok', country: 'Tailandia', utcOffsetMinutes: 420 },
    { id: 'singapur-sg', city: 'Singapur', country: 'Singapur', utcOffsetMinutes: 480 },
    { id: 'eucla-au', city: 'Eucla', country: 'Australia', utcOffsetMinutes: 525 },
    { id: 'tokio-jp', city: 'Tokio', country: 'Japon', utcOffsetMinutes: 540 },
    { id: 'darwin-au', city: 'Darwin', country: 'Australia', utcOffsetMinutes: 570 },
    { id: 'port-moresby-pg', city: 'Port Moresby', country: 'Papua Nueva Guinea', utcOffsetMinutes: 600 },
    { id: 'lord-howe-au', city: 'Lord Howe', country: 'Australia', utcOffsetMinutes: 630 },
    { id: 'noumea-nc', city: 'Noumea', country: 'Nueva Caledonia', utcOffsetMinutes: 660 },
    { id: 'tarawa-ki', city: 'Tarawa', country: 'Kiribati', utcOffsetMinutes: 720 },
    { id: 'chatham-nz', city: 'Chatham', country: 'Nueva Zelanda', utcOffsetMinutes: 765 },
    { id: 'apia-ws', city: 'Apia', country: 'Samoa', utcOffsetMinutes: 780 },
    { id: 'kiritimati-ki', city: 'Kiritimati', country: 'Kiribati', utcOffsetMinutes: 840 },
];
let localExportFontsPromise: Promise<void> | null = null;
const DEFAULT_EXPORT_COLOR_DEFAULTS: ExportColorDefaults = {
    selectedPaletteId: DEFAULT_PALETTE.id,
    bgColor: DEFAULT_PALETTE.bg,
    accentColor: DEFAULT_PALETTE.accent,
    editorialGradientLeftColor: '#df255c',
    editorialGradientRightColor: DEFAULT_PALETTE.accent,
};

// El poster de ranking abre siempre en su navy caracteristico; los selectores de
// color del modal siguen mandando una vez que el usuario los toca.
const RANKING_POSTER_COLOR_DEFAULTS: ExportColorDefaults = {
    selectedPaletteId: 'ranking-navy',
    bgColor: RANKING_POSTER_COMBOS[0].bg,
    accentColor: RANKING_POSTER_COMBOS[0].accent,
    editorialGradientLeftColor: '#df255c',
    editorialGradientRightColor: RANKING_POSTER_COMBOS[0].glow,
};

const FAN_DESIGN_SLUG: ExportDesignSlug = 'fan-v5';

function isRankingPosterData(template: ExportTemplate, data: ExportData): boolean {
    return template === 'standings' && (data as StandingsData).variant === 'rankingPoster';
}

function isLadderData(template: ExportTemplate, data: ExportData): boolean {
    return template === 'standings' && (data as StandingsData).variant === 'ladder';
}

// La placa ladder nace negra con el verde de la referencia; el usuario puede
// cambiar Fondo y Acento en el modal como en cualquier otra pieza.
const LADDER_COLOR_DEFAULTS: ExportColorDefaults = {
    selectedPaletteId: DEFAULT_PALETTE.id,
    bgColor: '#0b0b0b',
    accentColor: '#3ddc5a',
    editorialGradientLeftColor: '#df255c',
    editorialGradientRightColor: '#3ddc5a',
};

function isPalmaresData(template: ExportTemplate, data: ExportData): boolean {
    return template === 'standings' && (data as StandingsData).variant === 'palmares';
}

export default function ExportImage(props: ExportImageProps) {
    const { isLoading } = useAuth();

    // Exportar dejo de ser una herramienta de gestion: lo usa cualquiera, el
    // invitado incluido. Lo unico que se espera es a que resuelva la sesion, para
    // no dibujar el boton y cambiarle la familia abajo de los pies un tick despues.
    if (isLoading) {
        return null;
    }

    // La clave por plantilla remonta el componente cuando cambia la plantilla en
    // el MISMO lugar del arbol (la hero de mobile de un torneo pasa de "standings"
    // a "dailyMatches" al cambiar de pestana). Sin eso React reusa la instancia,
    // y todo el estado que se inicializa leyendo `data` —la foto del modal, la
    // seleccion de partidos, el marcador manual— queda con la forma de la
    // plantilla anterior: `data.matches` era undefined y reventaba la pagina.
    return <ExportImageInner key={props.template} {...props} />;
}

function ExportImageInner({ template, data: liveData, filename = 'g22-export', className = '' }: ExportImageProps) {
    const supabase = useMemo(() => createClient(), []);
    const { user } = useAuth();
    const guestInvite = useGuestExportInvite();
    // El diseno activo del panel es para quien gestiona algo. El resto de la gente
    // —el hincha logueado y el invitado— exporta siempre con Fan V5, la familia
    // basica: es la que se penso para el hincha, y la unica que no depende de que
    // alguien haya elegido un diseno en /admin/super/exports (el invitado nunca
    // tuvo esa eleccion, asi que sin esto exportaria con la placa de G22 Base).
    const usesManagedDesign = Boolean(resolveAdminPanel(user?.role, user?.memberships));
    const [isExporting, setIsExporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    /* Los presets guardados solo se ven adentro del modal, pero se hidrataban al
       montar: en la pagina de partido son tres instancias, y cada una bajaba la
       coleccion entera —23 MB medidos, con las fotos de gradiente embebidas en
       base64—, la parseaba y la clonaba a IndexedDB. En un iPhone eso es la
       pestaña congelada antes de tocar nada. Ahora se piden la primera vez que
       se abre el modal, y una sola vez por pagina (ver
       hydrateSavedPresetCollectionsShared). */
    const [presetsRequested, setPresetsRequested] = useState(false);
    useEffect(() => {
        if (showModal) setPresetsRequested(true);
    }, [showModal]);
    // El modal trabaja con una FOTO de los datos, tomada al abrirlo. Las paginas arman
    // `data` inline en cada render (y la ficha de un partido en vivo se vuelve a
    // renderizar cada segundo por el reloj), asi que con la prop viva el preview
    // redibujaba la pieza entera sin que nadie tocara nada, y los efectos que leen
    // `data` pisaban el marcador cargado a mano. Se exporta lo que se vio al abrir.
    const [frozenData, setFrozenData] = useState<ExportData>(liveData);
    // La foto solo vale con el modal abierto. Cerrado, el boton y sus deducciones
    // (que haya partidos programados, el nombre por defecto) siguen a la prop viva:
    // si se congelara siempre, una instancia reusada leeria datos de otra plantilla.
    const data = showModal ? frozenData : liveData;
    const [isPortalReady, setIsPortalReady] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('1080x1350');
    const [status, setStatus] = useState('');
    const [presetStorageMode, setPresetStorageMode] = useState<ExportPresetStorageMode>('local');
    const defaultTournamentName = getDefaultTournamentName(template, data);
    const defaultMatchExportMode = getDefaultMatchExportMode(template, data);
    const [customTournamentName, setCustomTournamentName] = useState(defaultTournamentName);
    const [selectedTimeZoneId, setSelectedTimeZoneId] = useState(DEFAULT_TIMEZONE_PRESET_ID);
    const [isTimeZoneDropdownOpen, setIsTimeZoneDropdownOpen] = useState(false);
    const [matchExportMode, setMatchExportMode] = useState<MatchExportMode>(defaultMatchExportMode);
    const [isMatchModeDropdownOpen, setIsMatchModeDropdownOpen] = useState(false);
    const [matchExportLayout, setMatchExportLayout] = useState<MatchExportLayout>('classic');
    const [isMatchLayoutDropdownOpen, setIsMatchLayoutDropdownOpen] = useState(false);
    const [activeDesignSlug, setActiveDesignSlug] = useState<ExportDesignSlug>(
        () => (usesManagedDesign ? readActiveExportDesign() : FAN_DESIGN_SLUG)
    );
    const [visualFamily, setVisualFamily] = useState<ExportVisualFamily>(
        () => (usesManagedDesign ? 'g22Base' : 'fanV5')
    );
    const [selectedTypographyPresetId, setSelectedTypographyPresetId] = useState<ExportTypographyPresetId>('g22-core');
    const [typographyOverrides, setTypographyOverrides] = useState<Partial<Record<ExportTypographyRole, ExportFontFamilyOptionId>>>({});
    const [designCustomizationState, setDesignCustomizationState] = useState<ExportDesignCustomizationState | null>(null);
    const [lineupExportMode, setLineupExportMode] = useState<LineupExportMode>('both');
    const [lineupExportLayout, setLineupExportLayout] = useState<LineupExportLayout>('classic');
    const [dailyMatchesTimeMode, setDailyMatchesTimeMode] = useState<DailyMatchesTimeMode>('time');
    const isRankingPoster = isRankingPosterData(template, data);
    const isPalmares = isPalmaresData(template, data);
    const isLadder = isLadderData(template, data);
    const groupedStandings = useMemo(
        () => (template === 'standings' ? getExportableStandingsGroups(data as StandingsData) : []),
        [data, template]
    );
    const preferredStandingsExportMode: StandingsExportMode = groupedStandings.length > 0 ? 'groups' : 'table';
    const [standingsExportMode, setStandingsExportMode] = useState<StandingsExportMode>(preferredStandingsExportMode);
    const [selectedStandingsGroupIndex, setSelectedStandingsGroupIndex] = useState(0);
    const [detectedUserOffsetMinutes, setDetectedUserOffsetMinutes] = useState(DEFAULT_TIMEZONE_OFFSET_MINUTES);
    const [selectedPaletteId, setSelectedPaletteId] = useState(DEFAULT_PALETTE.id);
    const [accentColor, setAccentColor] = useState(DEFAULT_PALETTE.accent);
    const [bgColor, setBgColor] = useState(DEFAULT_PALETTE.bg);
    const [defaultExportColors, setDefaultExportColors] = useState<ExportColorDefaults>(DEFAULT_EXPORT_COLOR_DEFAULTS);
    const [hasSessionColorOverrides, setHasSessionColorOverrides] = useState(false);
    const [selectedRankingComboId, setSelectedRankingComboId] = useState(RANKING_POSTER_COMBOS[0].id);
    const [impactoFieldColor, setImpactoFieldColor] = useState('');
    const [impactoInkColor, setImpactoInkColor] = useState('');
    const [impactoBarColor, setImpactoBarColor] = useState('');
    const [impactoRowColor, setImpactoRowColor] = useState('');
    const [lineupFieldColor, setLineupFieldColor] = useState('');
    const [lineupGlowColor, setLineupGlowColor] = useState('');
    const [lineupNamesColor, setLineupNamesColor] = useState('');
    const [lineupInkColor, setLineupInkColor] = useState('');
    const [lineupLinesColor, setLineupLinesColor] = useState('');
    const [rankingGlowColor, setRankingGlowColor] = useState(RANKING_POSTER_COMBOS[0].glow);
    const [rankingPanelColor, setRankingPanelColor] = useState(RANKING_POSTER_COMBOS[0].panel);
    const [rankingGoldColor, setRankingGoldColor] = useState(RANKING_POSTER_COMBOS[0].gold);
    const showModalRef = useRef(showModal);
    const defaultExportColorsRef = useRef(defaultExportColors);
    const [editorialGradientLeftColor, setEditorialGradientLeftColor] = useState('#df255c');
    const [editorialGradientRightColor, setEditorialGradientRightColor] = useState(DEFAULT_PALETTE.accent);
    // Controles propios de la placa clasica de G22 Base. Color '' = derivado de
    // Fondo + Acento; marca 'auto' = la del deporte del partido.
    const [plateFieldColor, setPlateFieldColor] = useState('');
    const [plateFieldEndColor, setPlateFieldEndColor] = useState('');
    const [plateInkColor, setPlateInkColor] = useState('');
    const [plateBrand, setPlateBrand] = useState<PlateBrandId>('auto');
    const [plateFooterMeta, setPlateFooterMeta] = useState(true);
    const [editorialLayoutPresetId, setEditorialLayoutPresetId] = useState<MatchEditorialPresetId>(() => (
        template === 'matchStats'
            ? getEditorialLayoutPreset((data as MatchStatsData).editorialLayoutPresetId).id
            : DEFAULT_EDITORIAL_LAYOUT_PRESET_ID
    ));
    const [editorialContextLabel, setEditorialContextLabel] = useState(() => (
        template === 'matchStats'
            ? (data as MatchStatsData).editorialContextLabel || ''
            : ''
    ));
    const [editorialShowTopBadge, setEditorialShowTopBadge] = useState(() => (
        template === 'matchStats'
            ? (data as MatchStatsData).editorialShowTopBadge === true
            : false
    ));
    const [editorialShowHeaderArrows, setEditorialShowHeaderArrows] = useState(() => (
        template === 'matchStats'
            ? (data as MatchStatsData).editorialShowHeaderArrows === true
            : false
    ));
    const [savedEditorialPresets, setSavedEditorialPresets] = useState<SavedMatchEditorialPreset[]>([]);
    const [savedGradientPresets, setSavedGradientPresets] = useState<SavedMatchGradientPreset[]>([]);
    const [savedPlatePresets, setSavedPlatePresets] = useState<SavedMatchPlatePreset[]>([]);
    const [editorialPresetName, setEditorialPresetName] = useState('');
    const [gradientPresetName, setGradientPresetName] = useState('');
    const [platePresetName, setPlatePresetName] = useState('');
    // Las placas llevan su propio modo de guardado: pueden quedar en el
    // dispositivo aunque los otros presets esten sincronizando con la cuenta.
    const [platePresetStorageMode, setPlatePresetStorageMode] = useState<ExportPresetStorageMode>('local');
    const [editorialSponsors, setEditorialSponsors] = useState<MatchSponsorData[]>(() => (
        template === 'matchStats'
            ? buildEditorialSponsorSlots((data as MatchStatsData).sponsors)
            : buildEditorialSponsorSlots()
    ));
    const [editorialGradientUpload, setEditorialGradientUpload] = useState<MatchBackgroundUpload | null>(() => {
        if (template !== 'matchStats') return null;
        const gradientImage = (data as MatchStatsData).editorialGradientImage?.trim();
        return gradientImage ? { name: 'Degradado preconfigurado', src: gradientImage } : null;
    });
    const [editorialCompetitionLogoUpload, setEditorialCompetitionLogoUpload] = useState<MatchBackgroundUpload | null>(null);
    const [matchBackgroundUpload, setMatchBackgroundUpload] = useState<MatchBackgroundUpload | null>(() => {
        if (template !== 'matchStats') return null;
        const backgroundImage = (data as MatchStatsData).backgroundImage?.trim();
        return backgroundImage ? { name: 'Fondo preconfigurado', src: backgroundImage } : null;
    });
    const [manualHomeScore, setManualHomeScore] = useState(() => (
        template === 'matchStats'
            ? formatExportScoreInput((data as MatchStatsData).homeScore)
            : ''
    ));
    const [manualAwayScore, setManualAwayScore] = useState(() => (
        template === 'matchStats'
            ? formatExportScoreInput((data as MatchStatsData).awayScore)
            : ''
    ));
    const [selectedMatchIndices, setSelectedMatchIndices] = useState<Set<number>>(
        () => buildDefaultMatchSelection(template, data)
    );
    const openModal = () => {
        setFrozenData(liveData);
        // La foto nueva puede traer otra lista de partidos: los indices viejos
        // apuntarian a cualquier cosa.
        setSelectedMatchIndices(buildDefaultMatchSelection(template, liveData));
        setShowModal(true);
    };
    useEffect(() => {
        setCustomTournamentName(defaultTournamentName);
    }, [defaultTournamentName]);

    useEffect(() => {
        setMatchExportMode(defaultMatchExportMode);
    }, [defaultMatchExportMode]);

    useEffect(() => {
        setStandingsExportMode(preferredStandingsExportMode);
    }, [preferredStandingsExportMode]);

    useEffect(() => {
        if (template !== 'standings') return;
        if (groupedStandings.length === 0) {
            setSelectedStandingsGroupIndex(0);
            if (standingsExportMode !== 'table') {
                setStandingsExportMode('table');
            }
            return;
        }

        if (selectedStandingsGroupIndex >= groupedStandings.length) {
            setSelectedStandingsGroupIndex(0);
        }
    }, [groupedStandings.length, selectedStandingsGroupIndex, standingsExportMode, template]);

    useEffect(() => {
        if (!usesManagedDesign) {
            // Sin panel no hay diseno que escuchar: la familia esta fijada.
            setActiveDesignSlug(FAN_DESIGN_SLUG);
            setVisualFamily('fanV5');
            return;
        }

        const syncActiveVisualFamily = () => {
            const nextSlug = readActiveExportDesign();
            setActiveDesignSlug(nextSlug);
            setVisualFamily(mapDesignSlugToVisualFamily(nextSlug));
        };

        syncActiveVisualFamily();
        window.addEventListener('storage', syncActiveVisualFamily);
        window.addEventListener('g22:active-export-design-change', syncActiveVisualFamily as EventListener);

        return () => {
            window.removeEventListener('storage', syncActiveVisualFamily);
            window.removeEventListener('g22:active-export-design-change', syncActiveVisualFamily as EventListener);
        };
    }, [usesManagedDesign]);

    useEffect(() => {
        setSelectedTypographyPresetId(getDefaultTypographyPresetId(visualFamily));
        setTypographyOverrides({});
    }, [visualFamily]);

    useEffect(() => {
        showModalRef.current = showModal;
    }, [showModal]);

    useEffect(() => {
        defaultExportColorsRef.current = defaultExportColors;
    }, [defaultExportColors]);

    useEffect(() => {
        let isMounted = true;

        const applyCustomization = (customization: ExportDesignCustomizationState | null) => {
            if (!isMounted) return;
            setDesignCustomizationState(customization);

            if (!customization) {
                setDefaultExportColors(DEFAULT_EXPORT_COLOR_DEFAULTS);
                if (!showModalRef.current) {
                    setSelectedPaletteId(DEFAULT_EXPORT_COLOR_DEFAULTS.selectedPaletteId);
                    setBgColor(DEFAULT_EXPORT_COLOR_DEFAULTS.bgColor);
                    setAccentColor(DEFAULT_EXPORT_COLOR_DEFAULTS.accentColor);
                    setEditorialGradientLeftColor(DEFAULT_EXPORT_COLOR_DEFAULTS.editorialGradientLeftColor);
                    setEditorialGradientRightColor(DEFAULT_EXPORT_COLOR_DEFAULTS.editorialGradientRightColor);
                }
                return;
            }

            const paletteId = findPaletteIdByColors(customization.previewSurface, customization.previewAccent);
            const nextDefaults: ExportColorDefaults = {
                selectedPaletteId: paletteId,
                bgColor: customization.previewSurface || DEFAULT_PALETTE.bg,
                accentColor: customization.previewAccent || DEFAULT_PALETTE.accent,
                editorialGradientLeftColor: customization.previewGradientFrom || '#df255c',
                editorialGradientRightColor: customization.previewGradientTo || customization.previewAccent || DEFAULT_PALETTE.accent,
            };
            setDefaultExportColors(nextDefaults);
            if (!showModalRef.current) {
                setSelectedPaletteId(nextDefaults.selectedPaletteId);
                setBgColor(nextDefaults.bgColor);
                setAccentColor(nextDefaults.accentColor);
                setEditorialGradientLeftColor(nextDefaults.editorialGradientLeftColor);
                setEditorialGradientRightColor(nextDefaults.editorialGradientRightColor);
            }
        };

        const hydrateCustomization = async () => {
            const fallbackLocalState = readSavedExportDesignCustomization(activeDesignSlug);
            applyCustomization(fallbackLocalState);

            const { state } = await hydrateSavedExportDesignCustomization(activeDesignSlug, supabase);
            applyCustomization(state);
        };

        void hydrateCustomization();

        const handleCustomizationChange = () => {
            void hydrateCustomization();
        };

        window.addEventListener(EXPORT_DESIGN_CUSTOMIZATION_EVENT, handleCustomizationChange as EventListener);
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            // Token refresh keeps the same identity; re-hydrating presets on
            // every TOKEN_REFRESHED tick was a multiplier on /token storms.
            if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
            void hydrateCustomization();
        });

        return () => {
            isMounted = false;
            window.removeEventListener(EXPORT_DESIGN_CUSTOMIZATION_EVENT, handleCustomizationChange as EventListener);
            subscription.unsubscribe();
        };
    }, [activeDesignSlug, supabase]);

    useEffect(() => {
        if (!showModal) {
            setIsTimeZoneDropdownOpen(false);
            setIsMatchModeDropdownOpen(false);
            setIsMatchLayoutDropdownOpen(false);
            setHasSessionColorOverrides(false);
            return;
        }

        const defaults = isRankingPoster
            ? RANKING_POSTER_COLOR_DEFAULTS
            : isLadder
                ? LADDER_COLOR_DEFAULTS
                : defaultExportColorsRef.current;
        setHasSessionColorOverrides(false);
        setImpactoFieldColor('');
        setImpactoInkColor('');
        setImpactoBarColor('');
        setImpactoRowColor('');
        setSelectedPaletteId(defaults.selectedPaletteId);
        setBgColor(defaults.bgColor);
        setAccentColor(defaults.accentColor);
        setEditorialGradientLeftColor(defaults.editorialGradientLeftColor);
        setEditorialGradientRightColor(defaults.editorialGradientRightColor);
        if (isRankingPoster) {
            const combo = RANKING_POSTER_COMBOS[0];
            setSelectedRankingComboId(combo.id);
            setRankingGlowColor(combo.glow);
            setRankingPanelColor(combo.panel);
            setRankingGoldColor(combo.gold);
        }
    }, [isLadder, isRankingPoster, showModal]);

    useEffect(() => {
        if (!showModal || hasSessionColorOverrides || isRankingPoster || isLadder) return;

        setSelectedPaletteId(defaultExportColors.selectedPaletteId);
        setBgColor(defaultExportColors.bgColor);
        setAccentColor(defaultExportColors.accentColor);
        setEditorialGradientLeftColor(defaultExportColors.editorialGradientLeftColor);
        setEditorialGradientRightColor(defaultExportColors.editorialGradientRightColor);
    }, [defaultExportColors, hasSessionColorOverrides, isLadder, isRankingPoster, showModal]);

    useEffect(() => {
        setIsPortalReady(true);
    }, []);

    useEffect(() => {
        if (!showModal || typeof document === 'undefined') return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showModal]);

    useEffect(() => {
        if (template !== 'matchStats') return;
        const backgroundImage = (data as MatchStatsData).backgroundImage?.trim();
        if (!backgroundImage) return;
        setMatchBackgroundUpload((current) => current ?? { name: 'Fondo preconfigurado', src: backgroundImage });
    }, [data, template]);

    useEffect(() => {
        if (!presetsRequested) return undefined;
        let isMounted = true;
        let hydrateInFlight = false;
        let hydrateQueued = false;

        const hydrateSavedPresets = async (force = false) => {
            // Coalesce overlapping invocations (mount + rapid auth events).
            // Concurrent hydrate/upsert batches for the same user were the
            // root cause of the connection-pool exhaustion: at most one runs
            // at a time, and a burst collapses to a single trailing re-run.
            if (hydrateInFlight) {
                hydrateQueued = true;
                return;
            }
            hydrateInFlight = true;
            try {
                do {
                    hydrateQueued = false;
                    const { editorialPresets, gradientPresets, platePresets, storageMode, plateStorageMode } =
                        await hydrateSavedPresetCollectionsShared(supabase, force);

                    if (!isMounted) return;
                    setSavedEditorialPresets(editorialPresets);
                    setSavedGradientPresets(gradientPresets);
                    setSavedPlatePresets(platePresets);
                    setPresetStorageMode(storageMode);
                    setPlatePresetStorageMode(plateStorageMode);
                } while (hydrateQueued && isMounted);
            } finally {
                hydrateInFlight = false;
            }
        };

        void hydrateSavedPresets();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            // These events keep the same identity (same user.id), so presets
            // keyed by user_id don't need re-hydration; re-running on every
            // tick was a multiplier on the preset-sync / token storms.
            if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') return;
            // Cambio de usuario: la coleccion compartida es de otro, se vuelve a pedir.
            void hydrateSavedPresets(true);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [presetsRequested, supabase]);

    useEffect(() => {
        if (template !== 'matchStats') return;
        const matchData = data as MatchStatsData;
        setEditorialLayoutPresetId(getEditorialLayoutPreset(matchData.editorialLayoutPresetId).id);
        setEditorialContextLabel(matchData.editorialContextLabel || '');
        setEditorialShowTopBadge(matchData.editorialShowTopBadge === true);
        setEditorialShowHeaderArrows(matchData.editorialShowHeaderArrows === true);
        setEditorialSponsors(buildEditorialSponsorSlots(matchData.sponsors));
        setManualHomeScore(formatExportScoreInput(matchData.homeScore));
        setManualAwayScore(formatExportScoreInput(matchData.awayScore));
        const gradientImage = matchData.editorialGradientImage?.trim();
        setEditorialGradientUpload((current) => current ?? (gradientImage ? { name: 'Degradado preconfigurado', src: gradientImage } : null));
    }, [data, template]);

    useEffect(() => {
        if (!shouldLockMatchExportFormatToPost(template, visualFamily, matchExportLayout, matchExportMode)) return;
        if (format !== '1080x1350') {
            setFormat('1080x1350');
        }
    }, [format, matchExportLayout, matchExportMode, template, visualFamily]);

    useEffect(() => {
        if (template !== 'matchStats') return;
        const mustForceResult = matchExportLayout === 'editorial4x5' && visualFamily === 'momentumV2';
        if (mustForceResult && matchExportMode !== 'result') {
            setMatchExportMode('result');
        }
    }, [matchExportLayout, matchExportMode, template, visualFamily]);

    useEffect(() => {
        const browserOffsetMinutes = getBrowserOffsetMinutes();
        setDetectedUserOffsetMinutes(browserOffsetMinutes);
        setSelectedTimeZoneId(findBestPresetByOffset(browserOffsetMinutes).id);
    }, []);

    const selectedTimeZonePreset = useMemo(
        () => EXPORT_TIMEZONE_PRESETS.find((preset) => preset.id === selectedTimeZoneId) || findBestPresetByOffset(DEFAULT_TIMEZONE_OFFSET_MINUTES),
        [selectedTimeZoneId]
    );
    const selectedTypographyPreset = useMemo(
        () => getExportTypographyPreset(selectedTypographyPresetId),
        [selectedTypographyPresetId]
    );
    const activeTypographyContextId = useMemo(
        () => resolveActiveTypographyContextId(template, matchExportLayout, matchExportMode),
        [matchExportLayout, matchExportMode, template]
    );
    const designTypographyFamilies = useMemo(
        () => resolveDesignTypographyFamilies(designCustomizationState, activeTypographyContextId),
        [activeTypographyContextId, designCustomizationState]
    );
    const resolvedTypographyConfig = useMemo(
        () => resolveTypographyConfig(selectedTypographyPresetId, typographyOverrides, designTypographyFamilies),
        [designTypographyFamilies, selectedTypographyPresetId, typographyOverrides]
    );
    const timeZoneOptions = useMemo(
        () => EXPORT_TIMEZONE_PRESETS.map((preset) => ({
            ...preset,
            relativeLabel: formatRelativeOffset(preset.utcOffsetMinutes - detectedUserOffsetMinutes),
        })),
        [detectedUserOffsetMinutes]
    );
    const detectedTimeZoneLabel = useMemo(
        () => buildDetectedTimeZoneLabel(detectedUserOffsetMinutes),
        [detectedUserOffsetMinutes]
    );
    const selectedStandingsGroup = groupedStandings[getSafeStandingsGroupIndex(groupedStandings, selectedStandingsGroupIndex)] ?? null;
    const selectedStandingsGroupLabel = selectedStandingsGroup
        ? selectedStandingsGroup.name || `Grupo ${getSafeStandingsGroupIndex(groupedStandings, selectedStandingsGroupIndex) + 1}`
        : '';
    const standingsExportData = useMemo(
        () => template === 'standings'
            ? scopeStandingsDataForExport(
                buildExportData(template, data, customTournamentName, selectedTimeZonePreset) as StandingsData,
                standingsExportMode,
                selectedStandingsGroupIndex
            )
            : null,
        [customTournamentName, data, selectedStandingsGroupIndex, selectedTimeZonePreset, standingsExportMode, template]
    );
    const standingsSlides = useMemo(
        () => standingsExportData ? buildStandingsSlides(standingsExportData, getStandingsSlideMode(standingsExportMode)) : [],
        [standingsExportData, standingsExportMode]
    );
    const activeEditorialSponsors = useMemo(
        () => getActiveEditorialSponsors(editorialSponsors),
        [editorialSponsors]
    );
    const editorialAutoContextLabel = useMemo(() => {
        if (template !== 'matchStats') return '';
        const exportData = buildExportData(template, data, customTournamentName, selectedTimeZonePreset) as MatchStatsData;
        return buildAutoEditorialContextLabel(applyMatchExportMode(exportData, matchExportMode));
    }, [customTournamentName, data, matchExportMode, selectedTimeZonePreset, template]);
    const supportsEditorialSchedule = template === 'matchStats' && matchExportLayout === 'editorial4x5' && (visualFamily === 'g22Base' || visualFamily === 'posterV3' || visualFamily === 'impactoV4' || visualFamily === 'fanV5');
    const supportsClassicSchedule = template === 'matchStats' && matchExportLayout === 'classic';
    const showMatchModeSelector = template === 'matchStats' && (supportsClassicSchedule || supportsEditorialSchedule);
    const showMatchTimeZoneSelector = template === 'dailyMatches'
        || (
            template === 'matchStats'
            && (supportsClassicSchedule || (supportsEditorialSchedule && matchExportMode === 'schedule'))
        );
    const supportsPhotoFreeEditorialSchedule = template === 'matchStats'
        && matchExportLayout === 'editorial4x5'
        && matchExportMode === 'schedule'
        && (visualFamily === 'g22Base' || visualFamily === 'posterV3' || visualFamily === 'impactoV4' || visualFamily === 'fanV5');
    const hasMatchEditorialBackground = template === 'matchStats'
        ? supportsPhotoFreeEditorialSchedule || Boolean(matchBackgroundUpload?.src || (data as MatchStatsData).backgroundImage?.trim())
        : false;
    const isEditorialGradientMode = template === 'matchStats' && matchExportLayout === 'editorial4x5';
    // La placa clasica del partido: la unica pieza con degradado propio.
    const isClassicPlate = template === 'matchStats' && matchExportLayout === 'classic' && visualFamily === 'g22Base';
    const savedColorGradientPresets = useMemo(
        () => savedGradientPresets.filter((preset) => !preset.gradientImage),
        [savedGradientPresets]
    );
    const baseMatchScore = useMemo(() => {
        if (template !== 'matchStats') return null;
        const matchData = data as MatchStatsData;
        return {
            home: formatExportScoreInput(matchData.homeScore),
            away: formatExportScoreInput(matchData.awayScore),
        };
    }, [data, template]);
    const isResultExport = template === 'matchStats' && matchExportMode === 'result';
    const locksMatchFormatToPost = shouldLockMatchExportFormatToPost(template, visualFamily, matchExportLayout, matchExportMode);
    const exportActionLabel = template === 'standings' && standingsSlides.length > 1
        ? `Exportar ${standingsSlides.length} imagenes`
        : 'Exportar imagen';
    const selectedFormatConfig = useMemo(
        () => FORMATS.find((item) => item.value === getResolvedMatchExportFormat(template, format, visualFamily, matchExportLayout, matchExportMode)) || FORMATS[0],
        [format, matchExportLayout, matchExportMode, template, visualFamily]
    );
    const selectedPaletteName = useMemo(
        () => EXPORT_PALETTES.find((palette) => palette.id === selectedPaletteId)?.name || 'Custom',
        [selectedPaletteId]
    );
    const exportModalSubtitle = useMemo(() => {
        if (template === 'matchStats') {
            return `${getMatchExportModeLabel(matchExportMode)} · ${getMatchExportLayoutLabel(matchExportLayout)}`;
        }
        if (template === 'dailyMatches') {
            return dailyMatchesTimeMode === 'vs'
                ? 'Agenda del dia · Sin horarios (VS)'
                : 'Agenda del dia · Seleccion multiple';
        }
        if (template === 'standings') {
            if (isPalmares) return 'Palmares del torneo';
            if (standingsExportMode === 'singleGroup') return selectedStandingsGroupLabel || 'Grupo especifico';
            return standingsExportMode === 'groups' ? 'Tabla por grupos' : 'Tabla corrida';
        }
        if (template === 'playoffBracket') return 'Cuadro eliminatorio';
        if (template === 'lineups') return `Alineaciones · ${getLineupExportModeLabel(lineupExportMode)}`;
        if (template === 'squad') return 'Plantel completo';
        if (template === 'teamOfWeek') return 'Equipo de la semana';
        return 'Configuracion de exportacion';
    }, [dailyMatchesTimeMode, isPalmares, lineupExportMode, matchExportLayout, matchExportMode, selectedStandingsGroupLabel, standingsExportMode, template]);
    const exportSummaryChips = useMemo(() => {
        const chips = [selectedFormatConfig.label];
        chips.push(isRankingPoster ? 'Poster Ranking' : isLadder ? 'Placa Ladder' : (isPalmares && visualFamily !== 'fanV5') ? 'Poster Palmares' : getExportVisualFamilyLabel(visualFamily));
        if (template === 'matchStats') {
            chips.push(getMatchExportLayoutLabel(matchExportLayout));
        } else if (template === 'standings') {
            if (isPalmares) {
                chips.push(`${(data as StandingsData).rows.length} campeones`);
            } else if (standingsExportMode === 'singleGroup') {
                chips.push(selectedStandingsGroupLabel || 'Grupo');
            } else {
                chips.push(standingsExportMode === 'groups' ? 'Grupos' : 'Tabla');
            }
        } else if (template === 'dailyMatches') {
            chips.push(`Partidos ${selectedMatchIndices.size}/10`);
        } else if (template === 'lineups') {
            chips.push(getLineupExportModeLabel(lineupExportMode));
        } else if (template === 'squad') {
            chips.push(`${getSquadPlayerCount(data as SquadData)} jugadores`);
        } else if (template === 'teamOfWeek') {
            chips.push(`${getTeamOfWeekPlayerCount(data as TeamOfWeekData)} jugadores`);
        }
        chips.push(selectedPaletteName);

        const trimmedTournament = customTournamentName.trim();
        if (trimmedTournament) {
            chips.push(trimmedTournament.length > 22 ? `${trimmedTournament.slice(0, 22)}...` : trimmedTournament);
        }

        return chips.slice(0, 4);
    }, [
        customTournamentName,
        data,
        isLadder,
        isPalmares,
        isRankingPoster,
        lineupExportMode,
        matchExportLayout,
        selectedFormatConfig.label,
        selectedMatchIndices.size,
        selectedPaletteName,
        selectedStandingsGroupLabel,
        standingsExportMode,
        template,
        visualFamily,
    ]);
    const paletteUsageHint = useMemo(() => {
        if (isRankingPoster) {
            return 'El poster se pinta con cinco colores: Fondo (la esquina oscura), Banda (la columna del titulo), Brillo (la luz de abajo y la fila del lider), Panel (la lamina de la tabla) y Dorado (posiciones y puntos). Las combinaciones fijan los cinco de una vez.';
        }

        if (isLadder) {
            return 'En la placa ladder, Fondo es la placa entera (nace negra) y Acento pinta el remate del subtitulo, los numeros de zona y la flecha del que sube. La flecha del que baja es roja siempre.';
        }

        if (isPalmares) {
            return 'En el afiche del palmares, Fondo define la base y Acento el halo que envuelve el podio. El oro, la plata y el bronce del 1-2-3 no se tocan: son la lectura del podio.';
        }

        if ((template === 'lineups' || template === 'squad' || template === 'teamOfWeek') && visualFamily === 'posterV3') {
            return 'En Poster V3, Fondo construye el clima oscuro del afiche; Acento domina barras, chips numerados y remates neon. En modo de dos equipos, el segundo bloque deriva a una variante fria para separar ambas columnas.';
        }

        if (template === 'standings' && visualFamily === 'posterV3') {
            return 'En Poster V3 para standings, Fondo define la base navy/carbon y Acento pinta el header, los bullets de posicion, las capsulas de puntos y el contorno de la tabla para acercarse al look poster del material de referencia.';
        }

        if (visualFamily === 'posterV3') {
            return 'En Poster V3, Fondo mueve la atmosfera del afiche y Acento recolorea titulos, marcadores, barras y capsulas neon sin tocar los datos.';
        }

        if ((template === 'lineups' || template === 'squad' || template === 'teamOfWeek') && visualFamily === 'momentumV2') {
            return 'En Momentum V2, Fondo redefine el matte y la atmosfera del lienzo; Acento recolorea bordes, capsulas numeradas y brillos. En vista de dos equipos, la segunda columna usa una variacion fria del mismo acento para separar ambos lados sin romper la paleta.';
        }

        if (template === 'standings' && visualFamily === 'momentumV2') {
            return 'En Momentum V2 para standings, Fondo cambia la base oscura y la atmosfera general del afiche; Acento recolorea el contenedor del titulo, los bordes de cada fila, la capsula de puntos, las lineas de referencia y los brillos de apoyo para redisenar la tabla sin tocar los datos.';
        }

        if (visualFamily === 'momentumV2') {
            return 'En Momentum V2, Fondo controla la base matte del afiche y Acento mueve titulares, lineas y brillos para rehacer la pieza sin tocar los datos.';
        }

        return 'La marca de agua G22 se mantiene en todas las exportaciones.';
    }, [isLadder, isPalmares, isRankingPoster, template, visualFamily]);

    const toggleMatch = (index: number) => {
        setSelectedMatchIndices((previous) => {
            const next = new Set(previous);
            if (next.has(index)) next.delete(index);
            else if (next.size < 10) next.add(index);
            return next;
        });
    };

    const applyPalette = (palette: ExportPalette) => {
        setHasSessionColorOverrides(true);
        setSelectedPaletteId(palette.id);
        setBgColor(palette.bg);
        setAccentColor(palette.accent);
        if (isEditorialGradientMode) {
            setEditorialGradientRightColor(palette.accent);
        }
    };

    const handleBgColorChange = (value: string) => {
        setHasSessionColorOverrides(true);
        setSelectedPaletteId('custom');
        setBgColor(value);
    };

    const handleAccentColorChange = (value: string) => {
        setHasSessionColorOverrides(true);
        setSelectedPaletteId('custom');
        setAccentColor(value);
    };

    const applyRankingCombo = (combo: RankingPosterCombo) => {
        setHasSessionColorOverrides(true);
        setSelectedRankingComboId(combo.id);
        setBgColor(combo.bg);
        setAccentColor(combo.accent);
        setRankingGlowColor(combo.glow);
        setRankingPanelColor(combo.panel);
        setRankingGoldColor(combo.gold);
    };

    // Cualquier retoque manual saca el check de la combinacion: el poster queda
    // en modo personalizado sin perder lo que ya estaba elegido.
    const handleRankingColorChange = (setter: (value: string) => void) => (value: string) => {
        setHasSessionColorOverrides(true);
        setSelectedRankingComboId('');
        setter(value);
    };

    const handleTypographyPresetChange = (presetId: ExportTypographyPresetId) => {
        setSelectedTypographyPresetId(presetId);
        setTypographyOverrides({});
    };

    const handleTypographyRoleChange = (role: ExportTypographyRole, fontId: ExportFontFamilyOptionId) => {
        setTypographyOverrides((current) => ({
            ...current,
            [role]: fontId,
        }));
    };

    const resetTypographyOverrides = () => {
        setTypographyOverrides({});
    };

    const handleEditorialGradientLeftColorChange = (value: string) => {
        setHasSessionColorOverrides(true);
        setSelectedPaletteId('custom');
        setEditorialGradientLeftColor(value);
    };

    const handleEditorialGradientRightColorChange = (value: string) => {
        setHasSessionColorOverrides(true);
        setSelectedPaletteId('custom');
        setEditorialGradientRightColor(value);
    };

    const updateEditorialSponsor = (index: number, changes: Partial<MatchSponsorData>) => {
        setEditorialSponsors((current) => current.map((sponsor, sponsorIndex) => (
            sponsorIndex === index
                ? { ...sponsor, ...changes }
                : sponsor
        )));
    };

    const handleEditorialSponsorUpload = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setStatus('Subi un archivo de imagen valido para el sponsor');
            return;
        }

        try {
            const src = await readFileAsDataUrl(file);
            updateEditorialSponsor(index, { logo: src });
            setStatus('');
        } catch (error) {
            console.error('Sponsor upload error:', error);
            setStatus('No se pudo leer el logo del sponsor');
        }
    };

    const clearEditorialSponsor = (index: number) => {
        updateEditorialSponsor(index, { logo: '' });
        setStatus('');
    };

    const handleSaveEditorialPreset = async () => {
        const name = editorialPresetName.trim();
        if (!name) {
            setStatus('Dale un nombre al preset antes de guardarlo');
            return;
        }

        const nextPreset: SavedMatchEditorialPreset = {
            id: buildPresetId('editorial'),
            name,
            layoutPresetId: editorialLayoutPresetId,
            gradientLeftColor: editorialGradientLeftColor,
            gradientRightColor: editorialGradientRightColor,
            gradientImage: editorialGradientUpload ? { ...editorialGradientUpload } : null,
            sponsors: activeEditorialSponsors,
        };

        const nextPresets = upsertSavedEditorialPreset(savedEditorialPresets, nextPreset);
        setSavedEditorialPresets(nextPresets);
        try {
            const storageMode = await persistSavedEditorialPreset(nextPresets, nextPreset, supabase);
            setPresetStorageMode(storageMode);
            setEditorialPresetName('');
            setStatus(storageMode === 'cloud'
                ? `Preset "${name}" guardado y sincronizado`
                : `Preset "${name}" guardado en este dispositivo`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Editorial preset save error:', error);
            setStatus('No se pudo guardar el preset. Reintenta en unos segundos.');
        }
    };

    const applySavedEditorialPreset = (preset: SavedMatchEditorialPreset) => {
        setHasSessionColorOverrides(true);
        setEditorialLayoutPresetId(getEditorialLayoutPreset(preset.layoutPresetId).id);
        setEditorialGradientLeftColor(preset.gradientLeftColor);
        setEditorialGradientRightColor(preset.gradientRightColor);
        setEditorialGradientUpload(preset.gradientImage ? { ...preset.gradientImage } : null);
        setEditorialSponsors(buildEditorialSponsorSlots(preset.sponsors));
        setSelectedPaletteId('custom');
        setStatus(`Preset "${preset.name}" aplicado`);
        window.setTimeout(() => setStatus(''), 2200);
    };

    const handleSaveGradientPreset = async () => {
        const name = gradientPresetName.trim();
        if (!name) {
            setStatus('Ponle un nombre al gradiente antes de guardarlo');
            return;
        }

        const nextPreset: SavedMatchGradientPreset = {
            id: buildPresetId('gradient'),
            name,
            gradientLeftColor: isEditorialGradientMode ? editorialGradientLeftColor : bgColor,
            gradientRightColor: isEditorialGradientMode ? editorialGradientRightColor : accentColor,
            gradientImage: isEditorialGradientMode && editorialGradientUpload ? { ...editorialGradientUpload } : null,
        };

        const nextPresets = upsertSavedGradientPreset(savedGradientPresets, nextPreset);
        setSavedGradientPresets(nextPresets);
        try {
            const storageMode = await persistSavedGradientPreset(nextPresets, nextPreset, supabase);
            setPresetStorageMode(storageMode);
            setGradientPresetName('');
            setStatus(storageMode === 'cloud'
                ? `Gradiente "${name}" guardado y sincronizado`
                : `Gradiente "${name}" guardado en este dispositivo`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Gradient preset save error:', error);
            setStatus('No se pudo guardar el gradiente. Reintenta en unos segundos.');
        }
    };

    const handleDeleteEditorialPreset = async (presetId: string, presetName: string) => {
        const nextPresets = savedEditorialPresets.filter((preset) => preset.id !== presetId);
        setSavedEditorialPresets(nextPresets);

        try {
            const storageMode = await deleteSavedEditorialPreset(nextPresets, presetName, supabase);
            setPresetStorageMode(storageMode);
            setStatus(storageMode === 'cloud'
                ? `Preset "${presetName}" eliminado y sincronizado`
                : `Preset "${presetName}" eliminado`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Editorial preset delete error:', error);
            setSavedEditorialPresets(savedEditorialPresets);
            setStatus('No se pudo borrar el preset. Reintenta en unos segundos.');
        }
    };

    const handleDeleteGradientPreset = async (presetId: string, presetName: string) => {
        const nextPresets = savedGradientPresets.filter((preset) => preset.id !== presetId);
        setSavedGradientPresets(nextPresets);

        try {
            const storageMode = await deleteSavedGradientPreset(nextPresets, presetName, supabase);
            setPresetStorageMode(storageMode);
            setStatus(storageMode === 'cloud'
                ? `Gradiente "${presetName}" eliminado y sincronizado`
                : `Gradiente "${presetName}" eliminado`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Gradient preset delete error:', error);
            setSavedGradientPresets(savedGradientPresets);
            setStatus('No se pudo borrar el gradiente. Reintenta en unos segundos.');
        }
    };

    const applySavedGradientPreset = (preset: SavedMatchGradientPreset) => {
        setHasSessionColorOverrides(true);
        setSelectedPaletteId('custom');
        setBgColor(preset.gradientLeftColor);
        setAccentColor(preset.gradientRightColor);
        if (isEditorialGradientMode) {
            setEditorialGradientLeftColor(preset.gradientLeftColor);
            setEditorialGradientRightColor(preset.gradientRightColor);
            setEditorialGradientUpload(preset.gradientImage ? { ...preset.gradientImage } : null);
        }
        setStatus(`Gradiente "${preset.name}" aplicado`);
        window.setTimeout(() => setStatus(''), 2200);
    };

    const handleSavePlatePreset = async () => {
        const name = platePresetName.trim();
        if (!name) {
            setStatus('Ponle un nombre a la placa antes de guardarla');
            return;
        }

        const nextPreset: SavedMatchPlatePreset = {
            id: buildPresetId('plate'),
            name,
            // Se guarda lo que hay, vacios incluidos: un color en "Auto" vuelve
            // en "Auto" y no congela el hex de reposo del selector.
            field: plateFieldColor,
            fieldEnd: plateFieldEndColor,
            ink: plateInkColor,
            brand: plateBrand,
        };

        const nextPresets = upsertSavedPlatePreset(savedPlatePresets, nextPreset);
        setSavedPlatePresets(nextPresets);
        try {
            const storageMode = await persistSavedPlatePreset(nextPresets, nextPreset, supabase);
            setPlatePresetStorageMode(storageMode);
            setPlatePresetName('');
            setStatus(storageMode === 'cloud'
                ? `Placa "${name}" guardada y sincronizada`
                : `Placa "${name}" guardada en este dispositivo`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Plate preset save error:', error);
            setSavedPlatePresets(savedPlatePresets);
            setStatus('No se pudo guardar la placa. Reintenta en unos segundos.');
        }
    };

    const handleDeletePlatePreset = async (presetId: string, presetName: string) => {
        const nextPresets = savedPlatePresets.filter((preset) => preset.id !== presetId);
        setSavedPlatePresets(nextPresets);

        try {
            const storageMode = await deleteSavedPlatePreset(nextPresets, presetName, supabase);
            setPlatePresetStorageMode(storageMode);
            setStatus(storageMode === 'cloud'
                ? `Placa "${presetName}" eliminada y sincronizada`
                : `Placa "${presetName}" eliminada`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Plate preset delete error:', error);
            setSavedPlatePresets(savedPlatePresets);
            setStatus('No se pudo borrar la placa. Reintenta en unos segundos.');
        }
    };

    const applySavedPlatePreset = (preset: SavedMatchPlatePreset) => {
        setPlateFieldColor(preset.field);
        setPlateFieldEndColor(preset.fieldEnd);
        setPlateInkColor(preset.ink);
        setPlateBrand(preset.brand);
        setStatus(`Placa "${preset.name}" aplicada`);
        window.setTimeout(() => setStatus(''), 2200);
    };

    const handleMatchBackgroundUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setStatus('Subi un archivo de imagen valido');
            return;
        }

        try {
            const src = await readFileAsDataUrl(file);
            setMatchBackgroundUpload({ name: file.name, src });
            setStatus('');
        } catch (error) {
            console.error('Background upload error:', error);
            setStatus('No se pudo leer la foto seleccionada');
        }
    };

    const clearMatchBackgroundUpload = () => {
        setMatchBackgroundUpload(null);
        setStatus('');
    };

    const handleEditorialGradientUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setStatus('Subi un PNG o imagen valida para el degradado');
            return;
        }

        try {
            const src = await readFileAsDataUrl(file);
            setSelectedPaletteId('custom');
            setEditorialGradientUpload({ name: file.name, src });
            setStatus('');
        } catch (error) {
            console.error('Editorial gradient upload error:', error);
            setStatus('No se pudo leer el degradado');
        }
    };

    const clearEditorialGradientUpload = () => {
        setSelectedPaletteId('custom');
        setEditorialGradientUpload(null);
        setStatus('');
    };

    const handleEditorialCompetitionLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setStatus('Subi una imagen valida para el logo de la competencia');
            return;
        }

        try {
            const src = await readFileAsDataUrl(file);
            setEditorialCompetitionLogoUpload({ name: file.name, src });
            setStatus('');
        } catch (error) {
            console.error('Editorial competition logo upload error:', error);
            setStatus('No se pudo leer el logo de la competencia');
        }
    };

    const clearEditorialCompetitionLogoUpload = () => {
        setEditorialCompetitionLogoUpload(null);
        setStatus('');
    };

    const resetManualMatchScore = () => {
        setManualHomeScore(baseMatchScore?.home || '');
        setManualAwayScore(baseMatchScore?.away || '');
        setStatus('');
    };

    // Las tres salidas exitosas del export pasan por aca: la tabla que baja varias
    // laminas, el plantel que baja varias paginas y el resto, que baja una sola.
    // Si el que exporto no tiene cuenta, es el momento de invitarlo.
    const markExportFinished = guestInvite.notifyExportFinished;

    const handleExport = async () => {
        setIsExporting(true);
        setStatus('Generando...');
        setShowModal(false);

        try {
            applyTypographyConfig(resolvedTypographyConfig);
            setActiveElementDimensions(
                resolveActiveElementDimensions(
                    designCustomizationState,
                    resolveActiveElementDimensionContextId(template, matchExportLayout, matchExportMode)
                )
            );
            const resolvedFormat = getResolvedMatchExportFormat(template, format, visualFamily, matchExportLayout, matchExportMode);
            const config = FORMATS.find((item) => item.value === resolvedFormat)!;
            const [, brandLogo] = await Promise.all([ensureExportFonts(), loadImage('/icon.png')]);
            const canvas = document.createElement('canvas');
            canvas.width = config.width;
            canvas.height = config.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No se pudo inicializar el canvas');
            const exportData = buildExportData(template, data, customTournamentName, selectedTimeZonePreset);

            if (template === 'matchStats') {
                const matchData = applyManualMatchScore(
                    applyMatchExportMode(exportData as MatchStatsData, matchExportMode),
                    manualHomeScore,
                    manualAwayScore
                );
                if (matchExportLayout === 'editorial4x5') {
                    const backgroundImage = matchBackgroundUpload?.src || matchData.backgroundImage || '';
                    const scheduledEditorialWithoutPhoto = (visualFamily === 'posterV3' || visualFamily === 'g22Base' || visualFamily === 'impactoV4' || visualFamily === 'fanV5')
                        && (matchData.status === 'scheduled' || (matchData.mainTitle || '').trim().toLowerCase() === 'horario');
                    if (!backgroundImage && !scheduledEditorialWithoutPhoto) {
                        throw new Error('Subi una foto de fondo para usar el layout editorial 4:5');
                    }
                    const editorialMatchData: MatchStatsData = {
                        ...matchData,
                        backgroundImage,
                        tournamentLogo: editorialCompetitionLogoUpload?.src || matchData.tournamentLogo,
                        editorialLayoutPresetId,
                        editorialContextLabel,
                        editorialShowTopBadge,
                        editorialShowHeaderArrows,
                        editorialGradientImage: editorialGradientUpload?.src || matchData.editorialGradientImage,
                        sponsors: activeEditorialSponsors,
                    };
                    if (visualFamily === 'posterV3') {
                        await drawPosterV3MatchEditorial(
                            ctx,
                            canvas,
                            editorialMatchData,
                            config,
                            accentColor,
                            bgColor,
                            brandLogo,
                            backgroundImage
                        );
                    } else if (visualFamily === 'momentumV2') {
                        await drawMomentumMatchEditorial(
                            ctx,
                            canvas,
                            editorialMatchData,
                            config,
                            accentColor,
                            bgColor,
                            brandLogo,
                            backgroundImage,
                            editorialGradientLeftColor,
                            editorialGradientRightColor
                        );
                    } else if (matchData.status === 'scheduled') {
                        await drawMatchEditorialScheduleSplitHero(
                            ctx,
                            canvas,
                            editorialMatchData,
                            config,
                            accentColor,
                            bgColor,
                            brandLogo,
                            backgroundImage,
                            editorialGradientLeftColor,
                            editorialGradientRightColor
                        );
                    } else {
                        await drawMatchEditorialResult(
                            ctx,
                            canvas,
                            editorialMatchData,
                            config,
                            accentColor,
                            bgColor,
                            brandLogo,
                            backgroundImage,
                            editorialGradientLeftColor,
                            editorialGradientRightColor
                        );
                    }
                } else {
                    if (visualFamily === 'posterV3') {
                        await drawPosterV3MatchResult(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo);
                    } else if (visualFamily === 'impactoV4') {
                        await drawImpactoMatchResult(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo, impactoColors);
                    } else if (visualFamily === 'fanV5') {
                        await drawFanMatch(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo);
                    } else if (visualFamily === 'momentumV2') {
                        if (matchData.status === 'scheduled') {
                            await drawMomentumMatchDayClassicSchedule(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo);
                        } else {
                            await drawMomentumMatchResult(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo);
                        }
                    } else {
                        await drawMatchResult(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo, modalPlateOptions);
                    }
                }
            } else if (template === 'standings') {
                const standingsData = scopeStandingsDataForExport(exportData as StandingsData, standingsExportMode, selectedStandingsGroupIndex);
                const slides = buildStandingsSlides(standingsData, getStandingsSlideMode(standingsExportMode));
                if (slides.length === 0) throw new Error('No hay filas para exportar');

                for (const [index, slide] of slides.entries()) {
                    setStatus(slides.length > 1 ? `Generando ${index + 1}/${slides.length}...` : 'Generando...');
                    if (standingsData.variant === 'rankingPoster') {
                        await drawRankingPoster(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo, {
                            glow: rankingGlowColor,
                            panel: rankingPanelColor,
                            gold: rankingGoldColor,
                        });
                    } else if (standingsData.variant === 'ladder') {
                        await drawLadderPoster(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    } else if (standingsData.variant === 'palmares') {
                        if (visualFamily === 'fanV5') {
                            await drawFanPalmares(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                        } else {
                            await drawPalmaresPoster(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                        }
                    } else if (visualFamily === 'posterV3') {
                        await drawPosterV3Standings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    } else if (visualFamily === 'impactoV4') {
                        await drawImpactoStandings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo, impactoColors);
                    } else if (visualFamily === 'fanV5') {
                        await drawFanStandings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    } else if (visualFamily === 'momentumV2') {
                        await drawMomentumStandings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    } else {
                        await drawStandings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    }
                    await downloadCanvas(canvas, buildExportFilename(filename, template, resolvedFormat, index + 1, slides.length));
                    if (index < slides.length - 1) {
                        await wait(140);
                    }
                }

                setStatus(slides.length > 1 ? `Listo (${slides.length} imagenes)` : 'Listo');
                window.setTimeout(() => setStatus(''), 2600);
                markExportFinished();
                return;
            } else if (template === 'dailyMatches') {
                const matchesData = exportData as DailyMatchesData;
                const selectedMatches = matchesData.matches.filter((_, index) => selectedMatchIndices.has(index));
                if (visualFamily === 'posterV3') {
                    await drawPosterV3DailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo, dailyMatchesTimeMode);
                } else if (visualFamily === 'impactoV4') {
                    await drawImpactoDailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo, dailyMatchesTimeMode, impactoColors);
                } else if (visualFamily === 'fanV5') {
                    await drawFanDailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo, dailyMatchesTimeMode);
                } else if (visualFamily === 'momentumV2') {
                    await drawMomentumDailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo, dailyMatchesTimeMode);
                } else {
                    await drawDailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo, dailyMatchesTimeMode);
                }
            } else if (template === 'squad') {
                const squadData = exportData as SquadData;
                const pages = buildSquadPages(squadData, config);
                if (!pages.length) {
                    throw new Error('No hay jugadores para exportar');
                }

                for (const [index, page] of pages.entries()) {
                    if (visualFamily === 'posterV3') {
                        await drawPosterV3Squad(ctx, canvas, squadData, page, config, accentColor, bgColor, brandLogo);
                    } else if (visualFamily === 'fanV5') {
                        await drawFanSquad(ctx, canvas, squadData, page, config, accentColor, bgColor, brandLogo);
                    } else if (visualFamily === 'momentumV2') {
                        await drawMomentumSquad(ctx, canvas, squadData, page, config, accentColor, bgColor, brandLogo);
                    } else {
                        await drawG22BaseSquad(ctx, canvas, squadData, page, config, accentColor, bgColor, brandLogo, lineupColors);
                    }
                    await downloadCanvas(canvas, buildExportFilename(filename, template, resolvedFormat, index + 1, pages.length));
                    if (index < pages.length - 1) {
                        await wait(140);
                    }
                }

                setStatus(pages.length > 1 ? `Listo (${pages.length} imagenes)` : 'Listo');
                window.setTimeout(() => setStatus(''), 2600);
                markExportFinished();
                return;
            } else if (template === 'lineups') {
                if (visualFamily === 'posterV3') {
                    await drawPosterV3Lineups(ctx, canvas, exportData as LineupsData, config, accentColor, bgColor, brandLogo, lineupExportMode);
                } else if (visualFamily === 'fanV5') {
                    await drawFanLineups(ctx, canvas, exportData as LineupsData, config, accentColor, bgColor, brandLogo, lineupExportMode);
                } else if (visualFamily === 'momentumV2') {
                    await drawMomentumLineups(ctx, canvas, exportData as LineupsData, config, accentColor, bgColor, brandLogo, lineupExportMode);
                } else {
                    const lineupsData: LineupsData = {
                        ...(exportData as LineupsData),
                        backgroundImage: matchBackgroundUpload?.src || (exportData as LineupsData).backgroundImage,
                    };
                    await drawG22BaseLineups(ctx, canvas, lineupsData, config, accentColor, bgColor, brandLogo, lineupExportMode, lineupExportLayout, lineupColors);
                }
            } else if (template === 'teamOfWeek') {
                await drawG22BaseTeamOfWeek(ctx, canvas, exportData as TeamOfWeekData, config, accentColor, bgColor, brandLogo);
            } else if (template === 'playoffBracket') {
                if (visualFamily === 'posterV3') {
                    await drawPosterV3PlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, accentColor, bgColor, brandLogo);
                } else if (visualFamily === 'momentumV2') {
                    await drawMomentumPlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, accentColor, bgColor, brandLogo);
                } else {
                    await drawPlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, accentColor, bgColor, brandLogo);
                }
            } else {
                if (visualFamily === 'posterV3') {
                    await drawPosterV3PlayerStats(ctx, canvas, exportData as PlayerStatsData, config, accentColor, bgColor, brandLogo);
                } else if (visualFamily === 'momentumV2') {
                    await drawMomentumPlayerStats(ctx, canvas, exportData as PlayerStatsData, config, accentColor, bgColor, brandLogo);
                } else {
                    await drawPlayerStats(ctx, canvas, exportData as PlayerStatsData, config, accentColor, bgColor, brandLogo);
                }
            }

            await downloadCanvas(canvas, buildExportFilename(filename, template, resolvedFormat));
            setStatus('Listo');
            window.setTimeout(() => setStatus(''), 2000);
            markExportFinished();
        } catch (error) {
            console.error('Export error:', error);
            setStatus(error instanceof Error ? error.message : 'Error al exportar');
        } finally {
            resetActiveElementDimensions();
            setIsExporting(false);
        }
    };

    const dailyMatchesSource = template === 'dailyMatches' ? (data as DailyMatchesData).matches : [];
    const dailyMatches = Array.isArray(dailyMatchesSource) ? dailyMatchesSource : [];
    const hasScheduledDailyMatches = dailyMatches.some((match) => match.status === 'scheduled');
    const modalPreviewData = useMemo<ExportData>(() => {
        const exportData = buildExportData(template, data, customTournamentName, selectedTimeZonePreset);

        if (template === 'dailyMatches') {
            const matchesData = exportData as DailyMatchesData;
            const selectedMatches = matchesData.matches.filter((_, index) => selectedMatchIndices.has(index));
            return {
                ...matchesData,
                matches: selectedMatches.length > 0 ? selectedMatches : matchesData.matches,
            };
        }

        if (template === 'matchStats') {
            const matchData = applyManualMatchScore(
                applyMatchExportMode(exportData as MatchStatsData, matchExportMode),
                manualHomeScore,
                manualAwayScore
            );

            if (matchExportLayout !== 'editorial4x5') {
                return matchData;
            }

            return {
                ...matchData,
                backgroundImage: matchBackgroundUpload?.src || matchData.backgroundImage,
                tournamentLogo: editorialCompetitionLogoUpload?.src || matchData.tournamentLogo,
                editorialLayoutPresetId,
                editorialContextLabel,
                editorialShowTopBadge,
                editorialShowHeaderArrows,
                editorialGradientImage: editorialGradientUpload?.src || matchData.editorialGradientImage,
                sponsors: activeEditorialSponsors,
            };
        }

        if (template === 'standings') {
            return scopeStandingsDataForExport(exportData as StandingsData, standingsExportMode, selectedStandingsGroupIndex);
        }

        if (template === 'lineups' && lineupExportLayout === 'editorial') {
            return {
                ...(exportData as LineupsData),
                backgroundImage: matchBackgroundUpload?.src || (exportData as LineupsData).backgroundImage,
            };
        }

        return exportData;
    }, [
        activeEditorialSponsors,
        customTournamentName,
        data,
        editorialCompetitionLogoUpload?.src,
        editorialContextLabel,
        editorialGradientUpload?.src,
        editorialLayoutPresetId,
        editorialShowHeaderArrows,
        editorialShowTopBadge,
        manualAwayScore,
        lineupExportLayout,
        manualHomeScore,
        matchBackgroundUpload?.src,
        matchExportLayout,
        matchExportMode,
        selectedStandingsGroupIndex,
        selectedMatchIndices,
        selectedTimeZonePreset,
        standingsExportMode,
        template,
    ]);
    const impactoColorValues: Record<ImpactoColorControlId, string> = {
        field: impactoFieldColor,
        ink: impactoInkColor,
        bar: impactoBarColor,
        row: impactoRowColor,
    };
    const impactoColorSetters: Record<ImpactoColorControlId, (value: string) => void> = {
        field: setImpactoFieldColor,
        ink: setImpactoInkColor,
        bar: setImpactoBarColor,
        row: setImpactoRowColor,
    };
    const impactoColors = useMemo(() => ({
        field: impactoFieldColor,
        ink: impactoInkColor,
        bar: impactoBarColor,
        row: impactoRowColor,
    }), [impactoBarColor, impactoFieldColor, impactoInkColor, impactoRowColor]);
    const lineupColorValues: Record<LineupColorControlId, string> = {
        field: lineupFieldColor,
        glow: lineupGlowColor,
        names: lineupNamesColor,
        ink: lineupInkColor,
        lines: lineupLinesColor,
    };
    const lineupColorSetters: Record<LineupColorControlId, (value: string) => void> = {
        field: setLineupFieldColor,
        glow: setLineupGlowColor,
        names: setLineupNamesColor,
        ink: setLineupInkColor,
        lines: setLineupLinesColor,
    };
    const lineupColors = useMemo<LineupColorOverrides>(() => ({
        field: lineupFieldColor,
        glow: lineupGlowColor,
        names: lineupNamesColor,
        ink: lineupInkColor,
        lines: lineupLinesColor,
    }), [lineupFieldColor, lineupGlowColor, lineupInkColor, lineupLinesColor, lineupNamesColor]);
    const modalPlateOptions = useMemo<ExportPlateOptions>(() => ({
        field: plateFieldColor,
        fieldEnd: plateFieldEndColor,
        ink: plateInkColor,
        brand: plateBrand,
        footerMeta: plateFooterMeta,
    }), [plateBrand, plateFieldColor, plateFieldEndColor, plateFooterMeta, plateInkColor]);
    const modalPreviewColors = useMemo<ExportPreviewColorOverrides>(() => ({
        accentColor,
        bgColor,
        impactoFieldColor,
        impactoInkColor,
        impactoBarColor,
        impactoRowColor,
        lineupFieldColor,
        lineupGlowColor,
        lineupNamesColor,
        lineupInkColor,
        lineupLinesColor,
        editorialGradientLeftColor,
        editorialGradientRightColor,
        rankingGlowColor,
        rankingPanelColor,
        rankingGoldColor,
    }), [accentColor, bgColor, editorialGradientLeftColor, editorialGradientRightColor, rankingGlowColor, rankingPanelColor, rankingGoldColor, impactoFieldColor, impactoInkColor, impactoBarColor, impactoRowColor, lineupFieldColor, lineupGlowColor, lineupNamesColor, lineupInkColor, lineupLinesColor]);

    return (
        <div className={`${styles.container} ${className}`}>
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    width: 0,
                    height: 0,
                    overflow: 'hidden',
                    opacity: 0,
                    pointerEvents: 'none',
                }}
            >
                <span className={exportOutfitFont.className}>OUTFIT BLACK</span>
                <span className={exportJetBrainsMonoFont.className}>0123456789 +-</span>
            </div>
            <button className={styles.exportButton} onClick={openModal} disabled={isExporting} type="button">
                {isExporting ? 'Generando...' : 'Exportar'}
            </button>
            {status && <div className={styles.status}>{status}</div>}

            {showModal && isPortalReady ? createPortal(
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalHeaderTop}>
                                <div className={styles.modalTitleGroup}>
                                    <h3 className={styles.modalTitle}>Exportar imagen</h3>
                                    <p className={styles.modalSubtitle}>{exportModalSubtitle}</p>
                                </div>
                                <button className={styles.iconButton} onClick={() => setShowModal(false)} type="button" aria-label="Cerrar exportacion">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className={styles.modalSummaryStrip}>
                            {exportSummaryChips.map((chip) => (
                                <span key={chip} className={styles.modalChip}>{chip}</span>
                            ))}
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.modalControls}>
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Diseno activo</label>
                                <div className={styles.activeDesignCard}>
                                    <div className={styles.activeDesignCopy}>
                                        <strong>{isRankingPoster ? 'Poster Ranking' : isLadder ? 'Placa Ladder' : (isPalmares && visualFamily !== 'fanV5') ? 'Poster Palmares' : getExportVisualFamilyLabel(visualFamily)}</strong>
                                        <span>
                                            {isRankingPoster
                                                ? 'Afiche dedicado del ranking: banda vertical con el titulo, tabla P/Equipo/PTS/VAR y fila del lider destacada.'
                                                : isLadder
                                                    ? 'Placa dedicada de la tabla: titulo grande, una fila por club con escudo, valor principal, dato secundario y flecha de tendencia.'
                                                : isPalmares
                                                    ? 'Afiche dedicado del palmares: podio 2-1-3 con el escudo grande y el resto de los campeones como listado.'
                                                    : (
                                                        <>
                                                            {EXPORT_VISUAL_FAMILY_OPTIONS.find((option) => option.value === visualFamily)?.description}
                                                            {/* El panel solo existe para quien gestiona: al hincha no se le nombra
                                                                una pantalla a la que no puede entrar. */}
                                                            {usesManagedDesign ? ' Tipografia y estilo desde el panel de gestion.' : '.'}
                                                        </>
                                                    )}
                                        </span>
                                    </div>
                                    <span className={styles.activeDesignBadge}>Activo</span>
                                </div>
                            </div>

                            {false && (
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Tipografia</label>
                                <div className={styles.formatOptions}>
                                    {EXPORT_TYPOGRAPHY_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            className={`${styles.formatBtn} ${selectedTypographyPresetId === preset.id ? styles.active : ''}`}
                                            onClick={() => handleTypographyPresetChange(preset.id)}
                                            type="button"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.modalHint}>
                                    {selectedTypographyPreset.description}
                                    {selectedTypographyPreset.recommendedFor?.includes(visualFamily)
                                        ? ` Recomendado para ${getExportVisualFamilyLabel(visualFamily)}.`
                                        : ''}
                                </p>
                                <div
                                    style={{
                                        display: 'grid',
                                        gap: 6,
                                        padding: '14px 16px',
                                        borderRadius: 16,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.03)',
                                        marginTop: 12,
                                    }}
                                >
                                    <div style={{ fontFamily: resolvedTypographyConfig.families.display, fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                                        MATCHDAY EXPORT
                                    </div>
                                    <div style={{ fontFamily: resolvedTypographyConfig.families.body, fontSize: '0.95rem', fontWeight: 700 }}>
                                        Club A vs Club B · Resultado · Tabla · Fixture
                                    </div>
                                    <div style={{ fontFamily: resolvedTypographyConfig.families.mono, fontSize: '0.85rem', opacity: 0.8 }}>
                                        20:30 · FINAL · 1080x1350
                                    </div>
                                </div>
                                <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                                    {([
                                        ['display', 'Titulos / display'],
                                        ['body', 'Cuerpo / labels'],
                                        ['mono', 'Metadata / chips'],
                                        ['editorial', 'Editorial / hero'],
                                        ['score', 'Score / impacto'],
                                    ] as Array<[ExportTypographyRole, string]>).map(([role, label]) => (
                                        <div key={role}>
                                            <label className={styles.modalLabel}>{label}</label>
                                            <div className={styles.formatOptions}>
                                                {EXPORT_TYPOGRAPHY_ROLE_OPTIONS[role].map((fontId) => {
                                                    const option = getExportFontFamilyOption(fontId);
                                                    const isActive = resolvedTypographyConfig.roles[role] === fontId;
                                                    return (
                                                        <button
                                                            key={`${role}-${fontId}`}
                                                            className={`${styles.formatBtn} ${isActive ? styles.active : ''}`}
                                                            onClick={() => handleTypographyRoleChange(role, fontId)}
                                                            type="button"
                                                            title={option.note}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className={styles.modalHint}>
                                                {getExportFontFamilyOption(resolvedTypographyConfig.roles[role]).note}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                {Object.keys(typographyOverrides).length > 0 && (
                                    <div className={styles.formatOptions} style={{ marginTop: 12 }}>
                                        <button className={styles.formatBtn} onClick={resetTypographyOverrides} type="button">
                                            Restablecer preset
                                        </button>
                                    </div>
                                )}
                            </div>
                            )}

                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Formato</label>
                                <div className={styles.formatOptions}>
                                    {FORMATS.map((item) => (
                                        <button
                                            key={item.value}
                                            className={`${styles.formatBtn} ${format === item.value ? styles.active : ''}`}
                                            onClick={() => setFormat(item.value)}
                                            disabled={locksMatchFormatToPost && item.value !== '1080x1350'}
                                            type="button"
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                                {locksMatchFormatToPost && (
                                    <p className={styles.modalHint}>
                                        El layout editorial usa siempre canvas 1080x1350 para respetar la composicion 4:5.
                                    </p>
                                )}
                            </div>

                            {template === 'lineups' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Vista</label>
                                    <div className={styles.formatOptions}>
                                        {LINEUP_EXPORT_MODE_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                className={`${styles.formatBtn} ${lineupExportMode === option.value ? styles.active : ''}`}
                                                onClick={() => setLineupExportMode(option.value)}
                                                type="button"
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className={styles.modalHint}>
                                        {LINEUP_EXPORT_MODE_OPTIONS.find((option) => option.value === lineupExportMode)?.description}
                                    </p>
                                </div>
                            )}

                            {template === 'lineups' && visualFamily === 'g22Base' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Diseno</label>
                                    <div className={styles.formatOptions}>
                                        {LINEUP_EXPORT_LAYOUT_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                className={`${styles.formatBtn} ${lineupExportLayout === option.value ? styles.active : ''}`}
                                                onClick={() => setLineupExportLayout(option.value)}
                                                type="button"
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className={styles.modalHint}>
                                        {LINEUP_EXPORT_LAYOUT_OPTIONS.find((option) => option.value === lineupExportLayout)?.description}
                                    </p>
                                </div>
                            )}

                            {template === 'lineups' && visualFamily === 'g22Base' && lineupExportLayout === 'editorial' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Foto del jugador</label>
                                    <div className={styles.uploadCard}>
                                        <div className={styles.uploadMeta}>
                                            <span className={styles.uploadTitle}>Subi la foto que va a la izquierda</span>
                                            <span className={styles.uploadSubtitle}>
                                                Vertical, con el jugador arriba: la pieza la recorta a la mitad izquierda y la funde con el fondo. Sin foto, ese lugar lo ocupa el escudo.
                                            </span>
                                        </div>
                                        <div className={styles.uploadActions}>
                                            <label className={styles.uploadBtn}>
                                                Subir foto
                                                <input
                                                    className={styles.fileInput}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleMatchBackgroundUpload}
                                                />
                                            </label>
                                            <button
                                                className={styles.ghostBtn}
                                                onClick={clearMatchBackgroundUpload}
                                                disabled={!matchBackgroundUpload}
                                                type="button"
                                            >
                                                Quitar
                                            </button>
                                        </div>
                                    </div>
                                    {matchBackgroundUpload && (
                                        <div className={styles.uploadPreview}>
                                            <div
                                                className={styles.uploadThumb}
                                                style={{ backgroundImage: `url(${matchBackgroundUpload.src})` }}
                                            />
                                            <div className={styles.uploadMeta}>
                                                <span className={styles.uploadTitle}>{matchBackgroundUpload.name}</span>
                                                <span className={styles.uploadSubtitle}>Ocupa la mitad izquierda de la pieza.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {template === 'matchStats' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Diseno</label>
                                    <div className={styles.dropdown}>
                                        <button
                                            className={`${styles.dropdownTrigger} ${isMatchLayoutDropdownOpen ? styles.dropdownTriggerOpen : ''}`}
                                            onClick={() => {
                                                setIsMatchLayoutDropdownOpen((current) => !current);
                                                setIsMatchModeDropdownOpen(false);
                                                setIsTimeZoneDropdownOpen(false);
                                            }}
                                            type="button"
                                        >
                                            <span className={styles.dropdownTriggerText}>
                                                <strong>{getMatchExportLayoutLabel(matchExportLayout)}</strong>
                                                <span className={styles.dropdownTriggerMeta}>
                                                    {MATCH_EXPORT_LAYOUT_OPTIONS.find((option) => option.value === matchExportLayout)?.description}
                                                </span>
                                            </span>
                                            <span className={`${styles.dropdownChevron} ${isMatchLayoutDropdownOpen ? styles.dropdownChevronOpen : ''}`} aria-hidden="true">
                                                v
                                            </span>
                                        </button>

                                        {isMatchLayoutDropdownOpen && (
                                            <div className={styles.dropdownMenu}>
                                                {MATCH_EXPORT_LAYOUT_OPTIONS.map((option) => {
                                                    const isActive = option.value === matchExportLayout;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            className={`${styles.dropdownOption} ${isActive ? styles.dropdownOptionActive : ''}`}
                                                            onClick={() => {
                                                                setMatchExportLayout(option.value);
                                                                setIsMatchLayoutDropdownOpen(false);
                                                            }}
                                                            type="button"
                                                        >
                                                            <span className={styles.dropdownOptionTitle}>{option.label}</span>
                                                            <span className={styles.dropdownOptionMeta}>{option.description}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {template !== 'playerStats' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Nombre del torneo</label>
                                    <input
                                        className={styles.modalInput}
                                        value={customTournamentName}
                                        onChange={(event) => setCustomTournamentName(event.target.value)}
                                        placeholder="Ej: Torneo Apertura 2026"
                                    />
                                </div>
                            )}

                            {showMatchModeSelector && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Modo del encabezado</label>
                                    <div className={styles.dropdown}>
                                        <button
                                            className={`${styles.dropdownTrigger} ${isMatchModeDropdownOpen ? styles.dropdownTriggerOpen : ''}`}
                                            onClick={() => {
                                                setIsMatchModeDropdownOpen((current) => !current);
                                                setIsTimeZoneDropdownOpen(false);
                                                setIsMatchLayoutDropdownOpen(false);
                                            }}
                                            type="button"
                                        >
                                            <span className={styles.dropdownTriggerText}>
                                                <strong>{getMatchExportModeLabel(matchExportMode)}</strong>
                                                <span className={styles.dropdownTriggerMeta}>
                                                    {MATCH_EXPORT_MODE_OPTIONS.find((option) => option.value === matchExportMode)?.description}
                                                </span>
                                            </span>
                                            <span className={`${styles.dropdownChevron} ${isMatchModeDropdownOpen ? styles.dropdownChevronOpen : ''}`} aria-hidden="true">
                                                v
                                            </span>
                                        </button>

                                        {isMatchModeDropdownOpen && (
                                            <div className={styles.dropdownMenu}>
                                                {MATCH_EXPORT_MODE_OPTIONS.map((option) => {
                                                    const isActive = option.value === matchExportMode;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            className={`${styles.dropdownOption} ${isActive ? styles.dropdownOptionActive : ''}`}
                                                            onClick={() => {
                                                                setMatchExportMode(option.value);
                                                                setIsMatchModeDropdownOpen(false);
                                                            }}
                                                            type="button"
                                                        >
                                                            <span className={styles.dropdownOptionTitle}>{option.label}</span>
                                                            <span className={styles.dropdownOptionMeta}>{option.description}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {showMatchTimeZoneSelector && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Uso horario</label>
                                    <div className={styles.timeZoneSummary}>
                                        <span className={styles.timeZoneSummaryLabel}>Tu hora actual</span>
                                        <strong>{detectedTimeZoneLabel}</strong>
                                    </div>
                                    <div className={styles.dropdown}>
                                        <button
                                            className={`${styles.dropdownTrigger} ${isTimeZoneDropdownOpen ? styles.dropdownTriggerOpen : ''}`}
                                            onClick={() => {
                                                setIsTimeZoneDropdownOpen((current) => !current);
                                                setIsMatchModeDropdownOpen(false);
                                                setIsMatchLayoutDropdownOpen(false);
                                            }}
                                            type="button"
                                        >
                                            <span className={styles.dropdownTriggerText}>
                                                <strong>{selectedTimeZonePreset.city}, {selectedTimeZonePreset.country}</strong>
                                                <span className={styles.dropdownTriggerMeta}>
                                                    {formatUtcOffset(selectedTimeZonePreset.utcOffsetMinutes)} | {formatRelativeOffset(selectedTimeZonePreset.utcOffsetMinutes - detectedUserOffsetMinutes)}
                                                </span>
                                            </span>
                                            <span className={`${styles.dropdownChevron} ${isTimeZoneDropdownOpen ? styles.dropdownChevronOpen : ''}`} aria-hidden="true">
                                                ▾
                                            </span>
                                        </button>

                                        {isTimeZoneDropdownOpen && (
                                            <div className={styles.dropdownMenu}>
                                                {timeZoneOptions.map((timeZone) => {
                                                    const isActive = timeZone.id === selectedTimeZoneId;
                                                    return (
                                                        <button
                                                            key={timeZone.id}
                                                            className={`${styles.dropdownOption} ${isActive ? styles.dropdownOptionActive : ''}`}
                                                            onClick={() => {
                                                                setSelectedTimeZoneId(timeZone.id);
                                                                setIsTimeZoneDropdownOpen(false);
                                                            }}
                                                            type="button"
                                                        >
                                                            <span className={styles.dropdownOptionTitle}>{timeZone.city}, {timeZone.country}</span>
                                                            <span className={styles.dropdownOptionMeta}>
                                                                {formatUtcOffset(timeZone.utcOffsetMinutes)} | {timeZone.relativeLabel}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <p className={styles.modalHint}>
                                        Exportar en {selectedTimeZonePreset.city}, {selectedTimeZonePreset.country} ({formatUtcOffset(selectedTimeZonePreset.utcOffsetMinutes)}).
                                        {' '}La diferencia se calcula contra la hora detectada en tu navegador.
                                    </p>
                                </div>
                            )}

                            {isResultExport && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Resultado para exportar</label>
                                    <div className={styles.scoreOverrideCard}>
                                        <div className={styles.scoreOverrideHeader}>
                                            <div>
                                                <strong>Marcador editable</strong>
                                                <span>
                                                    Base extraida: {(baseMatchScore?.home || '-')}{' '} - {' '}{(baseMatchScore?.away || '-')}
                                                </span>
                                            </div>
                                            <button
                                                className={styles.ghostBtn}
                                                onClick={resetManualMatchScore}
                                                type="button"
                                            >
                                                Restaurar base
                                            </button>
                                        </div>
                                        <div className={styles.scoreOverrideGrid}>
                                            <label className={styles.scoreOverrideField}>
                                                <span>{template === 'matchStats' ? (data as MatchStatsData).homeTeam : 'Local'}</span>
                                                <input
                                                    className={styles.modalInput}
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    value={manualHomeScore}
                                                    onChange={(event) => setManualHomeScore(event.target.value.replace(/[^\d]/g, ''))}
                                                    placeholder="0"
                                                />
                                            </label>
                                            <label className={styles.scoreOverrideField}>
                                                <span>{template === 'matchStats' ? (data as MatchStatsData).awayTeam : 'Visitante'}</span>
                                                <input
                                                    className={styles.modalInput}
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    value={manualAwayScore}
                                                    onChange={(event) => setManualAwayScore(event.target.value.replace(/[^\d]/g, ''))}
                                                    placeholder="0"
                                                />
                                            </label>
                                        </div>
                                        <p className={styles.modalHint}>
                                            Si la API todavia no actualizo el score, podes corregirlo aca y la exportacion sale con ese marcador.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {template === 'matchStats' && matchExportLayout === 'editorial4x5' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Foto de fondo</label>
                                    <div className={styles.uploadCard}>
                                        <div className={styles.uploadMeta}>
                                            <span className={styles.uploadTitle}>
                                                {matchExportMode === 'schedule'
                                                    ? 'Foto o textura opcional'
                                                    : 'Subi la imagen principal del partido'}
                                            </span>
                                            <span className={styles.uploadSubtitle}>
                                                {matchExportMode === 'schedule'
                                                    ? 'El nuevo horario editorial funciona sin foto. Si subis una imagen, solo suma textura visual sin romper la composicion limpia 1080x1350.'
                                                    : 'Idealmente en 1080x1350 para mantener el encuadre y el aire del layout editorial.'}
                                            </span>
                                        </div>
                                        <div className={styles.uploadActions}>
                                            <label className={styles.uploadBtn}>
                                                Subir foto
                                                <input
                                                    className={styles.fileInput}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleMatchBackgroundUpload}
                                                />
                                            </label>
                                            <button
                                                className={styles.ghostBtn}
                                                onClick={clearMatchBackgroundUpload}
                                                disabled={!matchBackgroundUpload}
                                                type="button"
                                            >
                                                Quitar
                                            </button>
                                        </div>
                                    </div>
                                    <p className={styles.modalHint}>
                                        {matchExportMode === 'schedule'
                                            ? 'Esta variante arma un poster 4:5 limpio y sin foto obligatoria: bloque superior editorial, escudos en recuadros blancos, fecha/hora protagonistas y colores derivados del fondo y el acento.'
                                            : 'Esta variante exporta resultado, overlay inferior y logos mas separados. La foto se usa full-bleed como fondo.'}
                                    </p>
                                    {matchBackgroundUpload && (
                                        <div className={styles.uploadPreview}>
                                            <div
                                                className={styles.uploadThumb}
                                                style={{ backgroundImage: `url(${matchBackgroundUpload.src})` }}
                                            />
                                            <div className={styles.uploadMeta}>
                                                <span className={styles.uploadTitle}>{matchBackgroundUpload.name}</span>
                                                <span className={styles.uploadSubtitle}>Se aplicara como fondo principal del canvas 1080x1350.</span>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>
                                            {matchExportMode === 'schedule' ? 'Logo de competencia' : 'Logo central de competencia'}
                                        </label>
                                        <div className={styles.uploadCard}>
                                            <div className={styles.uploadMeta}>
                                                <span className={styles.uploadTitle}>
                                                    {matchExportMode === 'schedule' ? 'Logo superior del torneo' : 'Logo entre los dos scores'}
                                                </span>
                                                <span className={styles.uploadSubtitle}>
                                                    {matchExportMode === 'schedule'
                                                        ? 'Si no subis nada, se usa el logo del torneo cargado en el partido. Solo hace override cuando quieras otra marca de competencia.'
                                                        : 'Si no subis nada, se usa el logo del torneo cargado en el partido. Solo hace override cuando queres cambiarlo.'}
                                                </span>
                                            </div>
                                            <div className={styles.uploadActions}>
                                                <label className={styles.uploadBtn}>
                                                    Subir logo
                                                    <input
                                                        className={styles.fileInput}
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleEditorialCompetitionLogoUpload}
                                                    />
                                                </label>
                                                <button
                                                    className={styles.ghostBtn}
                                                    onClick={clearEditorialCompetitionLogoUpload}
                                                    disabled={!editorialCompetitionLogoUpload}
                                                    type="button"
                                                >
                                                    Quitar override
                                                </button>
                                            </div>
                                        </div>
                                        {editorialCompetitionLogoUpload && (
                                            <div className={styles.uploadPreview}>
                                                <div
                                                    className={`${styles.uploadThumb} ${styles.uploadThumbContain}`}
                                                    style={{ backgroundImage: `url(${editorialCompetitionLogoUpload.src})` }}
                                                />
                                                <div className={styles.uploadMeta}>
                                                    <span className={styles.uploadTitle}>{editorialCompetitionLogoUpload.name}</span>
                                                    <span className={styles.uploadSubtitle}>Este logo reemplazara al del torneo solo en esta exportacion.</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {matchExportMode === 'result' && (
                                        <div style={{ marginTop: 16 }}>
                                            <label className={styles.modalLabel}>Preset de layout</label>
                                            <div className={styles.compactPresetPanel}>
                                                {EDITORIAL_LAYOUT_PRESETS.map((preset) => (
                                                    <button
                                                        key={preset.id}
                                                        className={`${styles.compactPresetBtn} ${editorialLayoutPresetId === preset.id ? styles.compactPresetBtnActive : ''}`}
                                                        onClick={() => setEditorialLayoutPresetId(preset.id)}
                                                        title={preset.description}
                                                        type="button"
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className={styles.modalHint}>
                                                Cada preset agrupa posiciones, tamanos y respiracion del bloque editorial para reutilizarlo por torneo o liga.
                                            </p>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>
                                            {matchExportMode === 'schedule' ? 'Tagline / campaña' : 'Texto central'}
                                        </label>
                                        <input
                                            className={styles.modalInput}
                                            value={editorialContextLabel}
                                            onChange={(event) => setEditorialContextLabel(event.target.value)}
                                            placeholder={editorialAutoContextLabel || (matchExportMode === 'schedule' ? 'Ej: Proximo partido' : 'Ej: Final - Fecha 3')}
                                        />
                                        <p className={styles.modalHint}>
                                            {matchExportMode === 'schedule'
                                                ? 'Si lo dejas vacio, se usa PROXIMO PARTIDO. Puedes usarlo para una bajada de campana o copy editorial.'
                                                : 'Si lo dejas vacio, se usa el texto automatico del partido. Aca puedes reemplazar la fecha/hora por cualquier copy editorial.'}
                                        </p>
                                    </div>
                                    {matchExportMode === 'result' && (
                                        <div style={{ marginTop: 16 }}>
                                            <label className={styles.modalLabel}>Elementos superiores</label>
                                            <div className={styles.toggleGrid}>
                                                <label className={styles.toggleCard}>
                                                    <input
                                                        type="checkbox"
                                                        checked={editorialShowTopBadge}
                                                        onChange={(event) => setEditorialShowTopBadge(event.target.checked)}
                                                    />
                                                    <span className={styles.toggleCopy}>
                                                        <span className={styles.toggleLabel}>Panel &quot;Resultado&quot;</span>
                                                        <span className={styles.toggleHint}>Activa o esconde el badge superior izquierdo.</span>
                                                    </span>
                                                </label>
                                                <label className={styles.toggleCard}>
                                                    <input
                                                        type="checkbox"
                                                        checked={editorialShowHeaderArrows}
                                                        onChange={(event) => setEditorialShowHeaderArrows(event.target.checked)}
                                                    />
                                                    <span className={styles.toggleCopy}>
                                                        <span className={styles.toggleLabel}>Tres flechas</span>
                                                        <span className={styles.toggleHint}>Muestra u oculta las flechas de la esquina superior derecha.</span>
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>Gradiente editorial</label>
                                        <div className={styles.presetLibraryCard}>
                                            <div className={styles.customColors}>
                                                <div className={styles.colorInp}>
                                                    <span>Gradiente izq.</span>
                                                    <input
                                                        type="color"
                                                        value={editorialGradientLeftColor}
                                                        onChange={(event) => handleEditorialGradientLeftColorChange(event.target.value)}
                                                    />
                                                </div>
                                                <div className={styles.colorInp}>
                                                    <span>Gradiente der.</span>
                                                    <input
                                                        type="color"
                                                        value={editorialGradientRightColor}
                                                        onChange={(event) => handleEditorialGradientRightColorChange(event.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className={styles.presetLibrarySection}>
                                                <div className={styles.presetLibraryHeader}>
                                                    <span className={styles.presetLibraryTitle}>App</span>
                                                    <span className={styles.presetLibraryMeta}>Compactos para aplicar rapido</span>
                                                </div>
                                                <div className={styles.gradientPresetGrid}>
                                                    {DEFAULT_EDITORIAL_GRADIENT_PRESETS.map((preset) => {
                                                        const isActive = editorialGradientLeftColor === preset.gradientLeftColor
                                                            && editorialGradientRightColor === preset.gradientRightColor
                                                            && (editorialGradientUpload?.src || '') === (preset.gradientImage?.src || '');
                                                        return (
                                                            <button
                                                                key={preset.id}
                                                                className={`${styles.gradientPresetBtn} ${isActive ? styles.gradientPresetBtnActive : ''}`}
                                                                onClick={() => applySavedGradientPreset(preset)}
                                                                title={`Aplicar ${preset.name}`}
                                                                type="button"
                                                            >
                                                                <span
                                                                    className={styles.gradientPresetSwatch}
                                                                    style={{ background: `linear-gradient(135deg, ${preset.gradientLeftColor}, ${preset.gradientRightColor})` }}
                                                                />
                                                                <span className={styles.gradientPresetName}>{preset.name}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className={styles.presetLibrarySection}>
                                                <div className={styles.presetLibraryHeader}>
                                                    <span className={styles.presetLibraryTitle}>Tus gradientes</span>
                                                    <span className={styles.presetLibraryMeta}>
                                                        {presetStorageMode === 'cloud' ? 'Sincronizados con tu cuenta' : 'Se guardan en este dispositivo'}
                                                    </span>
                                                </div>
                                                <div className={styles.inlineActionRow}>
                                                    <input
                                                        className={`${styles.modalInput} ${styles.inlineActionInput}`}
                                                        value={gradientPresetName}
                                                        onChange={(event) => setGradientPresetName(event.target.value)}
                                                        placeholder="Ej: Fucsia vs verde"
                                                    />
                                                    <button className={styles.uploadBtn} onClick={handleSaveGradientPreset} type="button">
                                                        Guardar gradiente
                                                    </button>
                                                </div>
                                                {savedGradientPresets.length > 0 ? (
                                                    <div className={styles.gradientPresetGrid}>
                                                        {savedGradientPresets.map((preset) => {
                                                            const isActive = editorialGradientLeftColor === preset.gradientLeftColor
                                                                && editorialGradientRightColor === preset.gradientRightColor
                                                                && (editorialGradientUpload?.src || '') === (preset.gradientImage?.src || '');
                                                            return (
                                                                <div key={preset.id} className={styles.savedPresetCard}>
                                                                    <button
                                                                        className={`${styles.gradientPresetBtn} ${isActive ? styles.gradientPresetBtnActive : ''}`}
                                                                        onClick={() => applySavedGradientPreset(preset)}
                                                                        title={`Aplicar ${preset.name}`}
                                                                        type="button"
                                                                    >
                                                                        <span
                                                                            className={styles.gradientPresetSwatch}
                                                                            style={{ background: preset.gradientImage?.src
                                                                                ? `center / cover no-repeat url(${preset.gradientImage.src})`
                                                                                : `linear-gradient(135deg, ${preset.gradientLeftColor}, ${preset.gradientRightColor})` }}
                                                                        />
                                                                        <span className={styles.gradientPresetName}>{preset.name}</span>
                                                                    </button>
                                                                    <button
                                                                        className={styles.savedPresetDeleteBtn}
                                                                        onClick={() => handleDeleteGradientPreset(preset.id, preset.name)}
                                                                        title={`Borrar ${preset.name}`}
                                                                        aria-label={`Borrar ${preset.name}`}
                                                                        type="button"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className={styles.emptyPresetState}>
                                                        Todavia no guardaste gradientes. El preset conserva colores y tambien el PNG, si hay uno cargado.
                                                    </div>
                                                )}
                                            </div>
                                            <div className={styles.presetLibrarySection}>
                                                <div className={styles.presetLibraryHeader}>
                                                    <span className={styles.presetLibraryTitle}>PNG opcional</span>
                                                    <span className={styles.presetLibraryMeta}>Solo si quieres reemplazar el degradado por una textura</span>
                                                </div>
                                                <div className={styles.gradientUploadRow}>
                                                    <label className={styles.uploadBtn}>
                                                        Subir PNG
                                                        <input
                                                            className={styles.fileInput}
                                                            type="file"
                                                            accept="image/png,image/*"
                                                            onChange={handleEditorialGradientUpload}
                                                        />
                                                    </label>
                                                    <button
                                                        className={styles.ghostBtn}
                                                        onClick={clearEditorialGradientUpload}
                                                        disabled={!editorialGradientUpload}
                                                        type="button"
                                                    >
                                                        Usar colores
                                                    </button>
                                                </div>
                                                {editorialGradientUpload && (
                                                    <div className={styles.gradientUploadPreview}>
                                                        <div
                                                            className={styles.gradientUploadSwatch}
                                                            style={{ backgroundImage: `url(${editorialGradientUpload.src})` }}
                                                        />
                                                        <div className={styles.uploadMeta}>
                                                            <span className={styles.uploadTitle}>{editorialGradientUpload.name}</span>
                                                            <span className={styles.uploadSubtitle}>Se aplica sobre la zona del degradado editorial.</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <p className={styles.modalHint}>
                                            Los presets de la app ahora quedan en un solo bloque compacto y puedes sumar tus propios degradados sin rehacerlos cada vez.
                                        </p>
                                    </div>
                                    <div className={styles.uploadCard} style={{ marginTop: 16 }}>
                                        <div className={styles.uploadMeta}>
                                            <span className={styles.uploadTitle}>Guardar preset reusable</span>
                                            <span className={styles.uploadSubtitle}>
                                                Guarda layout + gradientes + sponsors para reutilizar la configuracion en otros torneos sin redisenar la pieza. Si repites el nombre, se sobrescribe.
                                            </span>
                                        </div>
                                        <div className={styles.inlineActionRow}>
                                            <input
                                                className={`${styles.modalInput} ${styles.inlineActionInput}`}
                                                value={editorialPresetName}
                                                onChange={(event) => setEditorialPresetName(event.target.value)}
                                                placeholder="Ej: SRA resultado final"
                                            />
                                            <button className={styles.uploadBtn} onClick={handleSaveEditorialPreset} type="button">
                                                Guardar preset
                                            </button>
                                        </div>
                                    </div>
                                    {savedEditorialPresets.length > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <label className={styles.modalLabel}>Presets guardados</label>
                                            <div className={styles.compactPresetPanel}>
                                                {savedEditorialPresets.map((preset) => (
                                                    <div key={preset.id} className={styles.compactPresetItem}>
                                                        <button
                                                            className={styles.compactPresetBtn}
                                                            onClick={() => applySavedEditorialPreset(preset)}
                                                            type="button"
                                                            title={`Aplicar ${preset.name}`}
                                                        >
                                                            {preset.name}
                                                        </button>
                                                        <button
                                                            className={styles.savedPresetDeleteBtn}
                                                            onClick={() => handleDeleteEditorialPreset(preset.id, preset.name)}
                                                            title={`Borrar ${preset.name}`}
                                                            aria-label={`Borrar ${preset.name}`}
                                                            type="button"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>Sponsors del template</label>
                                        <p className={styles.modalHint}>
                                            Los escudos de equipos ya se toman dinamicamente desde el partido. Aca podes cargar sponsors para el footer editorial.
                                        </p>
                                        <div className={styles.sponsorCompactGrid}>
                                            {editorialSponsors.map((sponsor, index) => (
                                                <div key={sponsor.id || index} className={`${styles.sponsorCompactCard} ${sponsor.logo ? styles.sponsorCompactCardActive : ''}`}>
                                                    <div className={styles.sponsorCompactHeader}>
                                                        <span className={styles.sponsorCompactTitle}>Sponsor {index + 1}</span>
                                                        {sponsor.logo ? (
                                                            <button
                                                                className={styles.sponsorCompactRemove}
                                                                onClick={() => clearEditorialSponsor(index)}
                                                                type="button"
                                                                aria-label={`Quitar sponsor ${index + 1}`}
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <label className={styles.sponsorCompactDropzone}>
                                                        {sponsor.logo ? (
                                                            <div
                                                                className={styles.sponsorCompactThumb}
                                                                style={{ backgroundImage: `url(${sponsor.logo})` }}
                                                            />
                                                        ) : (
                                                            <div className={styles.sponsorCompactEmpty}>
                                                                <Plus size={14} />
                                                                <span>Subir logo</span>
                                                            </div>
                                                        )}
                                                        <input
                                                            className={styles.fileInput}
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(event) => handleEditorialSponsorUpload(index, event)}
                                                        />
                                                    </label>
                                                    <input
                                                        className={`${styles.modalInput} ${styles.sponsorCompactInput}`}
                                                        value={sponsor.name || ''}
                                                        onChange={(event) => updateEditorialSponsor(index, { name: event.target.value })}
                                                        placeholder="Nombre"
                                                    />
                                                    <span className={styles.sponsorCompactHint}>
                                                        {sponsor.logo ? 'Toca el recuadro para cambiar el logo.' : 'Slot opcional para branding editorial.'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {template === 'dailyMatches' && hasScheduledDailyMatches && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Partidos sin jugar</label>
                                    <div className={styles.formatOptions}>
                                        {DAILY_MATCHES_TIME_MODE_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                className={`${styles.formatBtn} ${dailyMatchesTimeMode === option.value ? styles.active : ''}`}
                                                onClick={() => setDailyMatchesTimeMode(option.value)}
                                                type="button"
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className={styles.modalHint}>
                                        {DAILY_MATCHES_TIME_MODE_OPTIONS.find((option) => option.value === dailyMatchesTimeMode)?.description}
                                    </p>
                                </div>
                            )}

                            {template === 'dailyMatches' && dailyMatches.length > 0 && (
                                <div className={styles.modalSection}>
                                    <div className={styles.matchSelectHeader}>
                                        <span className={styles.modalLabel}>Seleccionar partidos</span>
                                        <span className={styles.matchCounter}>{selectedMatchIndices.size}/10</span>
                                    </div>
                                    <div className={styles.matchSelectList}>
                                        {dailyMatches.map((match, index) => {
                                            const isChecked = selectedMatchIndices.has(index);
                                            const isDisabled = !isChecked && selectedMatchIndices.size >= 10;
                                            return (
                                                <label key={index} className={`${styles.matchSelectRow} ${isDisabled ? styles.matchSelectDisabled : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        disabled={isDisabled}
                                                        onChange={() => toggleMatch(index)}
                                                    />
                                                    <span className={styles.matchSelectTeams}>{match.homeTeam} vs {match.awayTeam}</span>
                                                    {match.dateLabel && <span className={styles.matchSelectDate}>{match.dateLabel}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* El palmares no tiene grupos ni modo de tabla: el unico boton
                                que quedaria es "Tabla corrida", que no hace nada. */}
                            {template === 'standings' && !isPalmares && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Modo de tabla</label>
                                    <div className={styles.formatOptions}>
                                        <button
                                            className={`${styles.formatBtn} ${standingsExportMode === 'table' ? styles.active : ''}`}
                                            onClick={() => setStandingsExportMode('table')}
                                            type="button"
                                        >
                                            Tabla corrida
                                        </button>
                                        {groupedStandings.length > 0 && (
                                            <>
                                                <button
                                                    className={`${styles.formatBtn} ${standingsExportMode === 'groups' ? styles.active : ''}`}
                                                    onClick={() => setStandingsExportMode('groups')}
                                                    type="button"
                                                >
                                                    Dividir por grupos
                                                </button>
                                                <button
                                                    className={`${styles.formatBtn} ${standingsExportMode === 'singleGroup' ? styles.active : ''}`}
                                                    onClick={() => setStandingsExportMode('singleGroup')}
                                                    type="button"
                                                >
                                                    Grupo especifico
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {standingsExportMode === 'singleGroup' && groupedStandings.length > 0 && (
                                        <select
                                            aria-label="Grupo a exportar"
                                            className={`${styles.modalSelect} ${styles.standingsGroupSelect}`}
                                            value={getSafeStandingsGroupIndex(groupedStandings, selectedStandingsGroupIndex)}
                                            onChange={(event) => setSelectedStandingsGroupIndex(Number(event.target.value))}
                                        >
                                            {groupedStandings.map((group, index) => (
                                                <option key={`${group.name || 'grupo'}-${index}`} value={index}>
                                                    {group.name || `Grupo ${index + 1}`}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <p className={styles.modalHint}>
                                        Maximo 20 equipos por imagen.
                                        {standingsExportMode === 'singleGroup' && groupedStandings.length > 0
                                            ? ' Se exporta solamente el grupo seleccionado.'
                                            : standingsExportMode === 'groups' && groupedStandings.length > 0
                                            ? ' Los grupos se mantienen separados y continuan en otra imagen cuando hace falta.'
                                            : ' Si la tabla supera el limite, se reparte automaticamente en varias imagenes.'}
                                    </p>
                                    <div className={styles.timeZoneSummary}>
                                        <span className={styles.timeZoneSummaryLabel}>Descarga estimada</span>
                                        <strong>{standingsSlides.length || 1} imagen{(standingsSlides.length || 1) === 1 ? '' : 'es'}</strong>
                                    </div>
                                </div>
                            )}

                            {isRankingPoster ? (
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Combinaciones del poster</label>
                                <div className={styles.paletteGrid}>
                                    {RANKING_POSTER_COMBOS.map((combo) => (
                                        <button
                                            key={combo.id}
                                            className={`${styles.paletteBtn} ${selectedRankingComboId === combo.id ? styles.paletteBtnActive : ''}`}
                                            onClick={() => applyRankingCombo(combo)}
                                            title={combo.name}
                                            type="button"
                                        >
                                            <div
                                                className={styles.paletteSwatch}
                                                style={{
                                                    '--palette-bg': combo.bg,
                                                    '--palette-accent': combo.glow,
                                                } as CSSProperties}
                                            />
                                            <div className={styles.paletteMeta}>
                                                <span className={styles.paletteName}>{combo.name}</span>
                                                <span className={styles.paletteDesc}>{combo.description}</span>
                                                <span style={{ display: 'inline-flex', gap: 4, marginTop: 6 }}>
                                                    {[combo.bg, combo.accent, combo.glow, combo.panel, combo.gold].map((swatch, swatchIndex) => (
                                                        <span
                                                            key={`${combo.id}-swatch-${swatchIndex}`}
                                                            style={{ width: 12, height: 12, borderRadius: 999, background: swatch, border: '1px solid rgba(255,255,255,0.25)' }}
                                                        />
                                                    ))}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.modalHint}>{paletteUsageHint}</p>
                                {/* Colores a mano: solo para quien gestiona. El hincha elige entre
                                    las combinaciones predeterminadas y nada mas — una paleta abierta
                                    es la forma mas rapida de publicar una pieza ilegible. */}
                                {usesManagedDesign && (
                                <div className={styles.customColors}>
                                    <div className={styles.colorInp}>
                                        <span>Fondo</span>
                                        <input type="color" value={bgColor} onChange={(event) => handleRankingColorChange(setBgColor)(event.target.value)} />
                                    </div>
                                    <div className={styles.colorInp}>
                                        <span>Banda</span>
                                        <input type="color" value={accentColor} onChange={(event) => handleRankingColorChange(setAccentColor)(event.target.value)} />
                                    </div>
                                    <div className={styles.colorInp}>
                                        <span>Brillo</span>
                                        <input type="color" value={rankingGlowColor} onChange={(event) => handleRankingColorChange(setRankingGlowColor)(event.target.value)} />
                                    </div>
                                    <div className={styles.colorInp}>
                                        <span>Panel</span>
                                        <input type="color" value={rankingPanelColor} onChange={(event) => handleRankingColorChange(setRankingPanelColor)(event.target.value)} />
                                    </div>
                                    <div className={styles.colorInp}>
                                        <span>Dorado</span>
                                        <input type="color" value={rankingGoldColor} onChange={(event) => handleRankingColorChange(setRankingGoldColor)(event.target.value)} />
                                    </div>
                                </div>
                                )}
                                <p className={styles.modalHint}>
                                    Al reabrir el modal vuelve la combinacion original. El oro, la plata y el bronce del 1-2-3 vienen del ranking y no cambian con estos colores.
                                </p>
                            </div>
                            ) : (
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Paleta de colores</label>
                                <div className={styles.paletteGrid}>
                                    {EXPORT_PALETTES.map((palette) => (
                                        <button
                                            key={palette.id}
                                            className={`${styles.paletteBtn} ${selectedPaletteId === palette.id ? styles.paletteBtnActive : ''}`}
                                            onClick={() => applyPalette(palette)}
                                            title={palette.name}
                                            type="button"
                                        >
                                            <div
                                                className={styles.paletteSwatch}
                                                style={{
                                                    '--palette-bg': palette.bg,
                                                    '--palette-accent': palette.accent,
                                                } as CSSProperties}
                                            />
                                            <div className={styles.paletteMeta}>
                                                <span className={styles.paletteName}>{palette.name}</span>
                                                <span className={styles.paletteDesc}>{palette.description}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.modalHint}>{paletteUsageHint}</p>
                                <p className={styles.modalHint}>
                                    {usesManagedDesign
                                        ? 'Los cambios hechos aca aplican solo a esta exportacion abierta. Al volver a abrir el modal se recuperan los colores predeterminados del diseno.'
                                        : 'Elegi una de las combinaciones y listo. Al volver a abrir el modal se recuperan los colores predeterminados del diseno.'}
                                </p>
                                {usesManagedDesign && (
                                <div className={styles.customColors}>
                                    <div className={styles.colorInp}>
                                        <span>Fondo</span>
                                        <input type="color" value={bgColor} onChange={(event) => handleBgColorChange(event.target.value)} />
                                    </div>
                                    <div className={styles.colorInp}>
                                        <span>Acento</span>
                                        <input type="color" value={accentColor} onChange={(event) => handleAccentColorChange(event.target.value)} />
                                    </div>
                                </div>
                                )}
                                {visualFamily === 'impactoV4' && (
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>Colores de Impacto V4</label>
                                        <div className={styles.customColors}>
                                            {IMPACTO_COLOR_CONTROLS.map((control) => {
                                                const value = impactoColorValues[control.id];
                                                return (
                                                    <div className={styles.colorInp} key={control.id}>
                                                        <span>{control.label}</span>
                                                        <input
                                                            type="color"
                                                            value={value || control.placeholder}
                                                            onChange={(event) => impactoColorSetters[control.id](event.target.value)}
                                                            title={control.hint}
                                                        />
                                                        <button
                                                            className={styles.ghostBtn}
                                                            type="button"
                                                            onClick={() => impactoColorSetters[control.id]('')}
                                                            disabled={!value}
                                                            title="Volver al color derivado de Fondo y Acento"
                                                        >
                                                            Auto
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className={styles.modalHint}>
                                            Principal es el campo de color de toda la pieza; Tinta pinta el titular, las reglas y los numeros;
                                            Barras son el encabezado de la tabla y los divisores; Filas son la barra de cada partido del fixture
                                            y las filas sin etiqueta. El color de una fila con etiqueta lo sigue poniendo su zona en el torneo.
                                        </p>
                                    </div>
                                )}
                                {visualFamily === 'g22Base' && (template === 'lineups' || template === 'squad') && (
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>{template === 'lineups' ? 'Colores de la formacion' : 'Colores de la convocatoria'}</label>
                                        <div className={styles.customColors}>
                                            {LINEUP_COLOR_CONTROLS.map((control) => {
                                                const value = lineupColorValues[control.id];
                                                return (
                                                    <div className={styles.colorInp} key={control.id}>
                                                        <span>{control.label}</span>
                                                        <input
                                                            type="color"
                                                            value={value || control.placeholder}
                                                            onChange={(event) => lineupColorSetters[control.id](event.target.value)}
                                                            title={control.hint}
                                                        />
                                                        <button
                                                            className={styles.ghostBtn}
                                                            type="button"
                                                            onClick={() => lineupColorSetters[control.id]('')}
                                                            disabled={!value}
                                                            title="Volver al color derivado de Fondo y Acento"
                                                        >
                                                            Auto
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className={styles.modalHint}>
                                            Fondo es el campo oscuro; Luz, la marca de agua o el brillo de la cabecera; Nombres pinta la
                                            lista de un equipo y los dorsales y rotulos de dos; Tinta, el resto del texto; Filetes, el
                                            subrayado de Suplentes y la tarjeta de la editorial. En Auto salen de Fondo, Acento y, con dos
                                            equipos, del color de cada escudo.
                                        </p>
                                    </div>
                                )}
                                {isClassicPlate && (
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>Degradado de la placa</label>
                                        <div className={styles.customColors}>
                                            <div className={styles.colorInp}>
                                                <span>Desde</span>
                                                <input
                                                    type="color"
                                                    value={plateFieldColor || PLATE_FIELD_FALLBACK}
                                                    onChange={(event) => setPlateFieldColor(event.target.value)}
                                                />
                                                <button
                                                    className={styles.ghostBtn}
                                                    type="button"
                                                    onClick={() => setPlateFieldColor('')}
                                                    disabled={!plateFieldColor}
                                                    title="Volver al color derivado de Fondo y Acento"
                                                >
                                                    Auto
                                                </button>
                                            </div>
                                            <div className={styles.colorInp}>
                                                <span>Hasta</span>
                                                <input
                                                    type="color"
                                                    value={plateFieldEndColor || PLATE_FIELD_END_FALLBACK}
                                                    onChange={(event) => setPlateFieldEndColor(event.target.value)}
                                                />
                                                <button
                                                    className={styles.ghostBtn}
                                                    type="button"
                                                    onClick={() => setPlateFieldEndColor('')}
                                                    disabled={!plateFieldEndColor}
                                                    title="Volver al mismo color hundido"
                                                >
                                                    Auto
                                                </button>
                                            </div>
                                            <div className={styles.colorInp}>
                                                <span>Tinta</span>
                                                <input
                                                    type="color"
                                                    value={plateInkColor || PLATE_INK_FALLBACK}
                                                    onChange={(event) => setPlateInkColor(event.target.value)}
                                                />
                                                <button
                                                    className={styles.ghostBtn}
                                                    type="button"
                                                    onClick={() => setPlateInkColor('')}
                                                    disabled={!plateInkColor}
                                                    title="Volver al color con mas contraste sobre la placa"
                                                >
                                                    Auto
                                                </button>
                                            </div>
                                        </div>
                                        <p className={styles.modalHint}>
                                            El fondo va de <strong>Desde</strong> (esquina superior izquierda) a <strong>Hasta</strong> (inferior derecha);
                                            Tinta pinta el titular, las reglas y el marcador. En &quot;Auto&quot; la placa se deriva de Fondo + Acento,
                                            la segunda punta es ese mismo color hundido y la tinta toma el que mejor contrasta.
                                        </p>
                                        <div style={{ marginTop: 16 }}>
                                            <label className={styles.modalLabel} htmlFor="g22-plate-brand">Marca del medio</label>
                                            <select
                                                id="g22-plate-brand"
                                                className={styles.modalSelect}
                                                value={plateBrand}
                                                onChange={(event) => setPlateBrand(event.target.value as PlateBrandId)}
                                            >
                                                {PLATE_BRAND_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                            <p className={styles.modalHint}>
                                                Va debajo del titular. En automatica sale por el deporte del partido: Salida de 22 en rugby,
                                                Corner Corto en hockey y Grupo 22 TV en el resto. Abajo de todo cierra siempre G22 Scores.
                                            </p>
                                        </div>
                                        <div className={styles.toggleGrid} style={{ marginTop: 16 }}>
                                            <label className={styles.toggleCard}>
                                                <input
                                                    type="checkbox"
                                                    checked={plateFooterMeta}
                                                    onChange={(event) => setPlateFooterMeta(event.target.checked)}
                                                />
                                                <span className={styles.toggleCopy}>
                                                    <span className={styles.toggleLabel}>Fila de datos al pie</span>
                                                    <span className={styles.toggleHint}>
                                                        {matchExportMode === 'schedule'
                                                            ? 'La sede abajo de todo. El dia ya va arriba del horario.'
                                                            : 'Fecha y sede abajo de todo, en chico.'}
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                        <div className={styles.presetLibraryCard} style={{ marginTop: 16 }}>
                                            <div className={styles.presetLibrarySection}>
                                                <div className={styles.presetLibraryHeader}>
                                                    <span className={styles.presetLibraryTitle}>Tus placas</span>
                                                    <span className={styles.presetLibraryMeta}>
                                                        {platePresetStorageMode === 'cloud' ? 'Sincronizadas con tu cuenta' : 'Se guardan en este dispositivo'}
                                                    </span>
                                                </div>
                                                <div className={styles.gradientUploadRow}>
                                                    <input
                                                        className={styles.modalInput}
                                                        value={platePresetName}
                                                        onChange={(event) => setPlatePresetName(event.target.value)}
                                                        placeholder="Ej: Bordo del club"
                                                    />
                                                    <button className={styles.uploadBtn} onClick={handleSavePlatePreset} type="button">
                                                        Guardar placa
                                                    </button>
                                                </div>
                                                {savedPlatePresets.length > 0 ? (
                                                    <div className={styles.gradientPresetGrid}>
                                                        {savedPlatePresets.map((preset) => {
                                                            const isActive = plateFieldColor === preset.field
                                                                && plateFieldEndColor === preset.fieldEnd
                                                                && plateInkColor === preset.ink
                                                                && plateBrand === preset.brand;
                                                            return (
                                                                <div key={preset.id} className={styles.savedPresetCard}>
                                                                    <button
                                                                        className={`${styles.gradientPresetBtn} ${isActive ? styles.gradientPresetBtnActive : ''}`}
                                                                        onClick={() => applySavedPlatePreset(preset)}
                                                                        title={`Aplicar ${preset.name}`}
                                                                        type="button"
                                                                    >
                                                                        <span
                                                                            className={styles.gradientPresetSwatch}
                                                                            style={{
                                                                                background: `linear-gradient(135deg, ${preset.field || PLATE_FIELD_FALLBACK}, ${preset.fieldEnd || PLATE_FIELD_END_FALLBACK})`,
                                                                                boxShadow: `inset 0 -4px 0 ${preset.ink || PLATE_INK_FALLBACK}`,
                                                                            }}
                                                                        />
                                                                        <span className={styles.gradientPresetName}>{preset.name}</span>
                                                                    </button>
                                                                    <button
                                                                        className={styles.savedPresetDeleteBtn}
                                                                        onClick={() => handleDeletePlatePreset(preset.id, preset.name)}
                                                                        title={`Borrar ${preset.name}`}
                                                                        aria-label={`Borrar ${preset.name}`}
                                                                        type="button"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className={styles.emptyPresetState}>
                                                        Todavia no guardaste placas. Con un nombre, estos tres colores y la marca del pie vuelven en cualquier partido.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* La biblioteca de gradientes pinta Fondo + Acento, y en la placa
                                    clasica esos dos no pintan nada apenas tocas un color propio:
                                    ahi manda "Tus placas" y esta no tiene por que aparecer. */}
                                {!isEditorialGradientMode && !isClassicPlate && usesManagedDesign && (
                                    <div className={styles.presetLibraryCard}>
                                        <div className={styles.presetLibrarySection}>
                                            <div className={styles.presetLibraryHeader}>
                                                <span className={styles.presetLibraryTitle}>Tus gradientes</span>
                                                <span className={styles.presetLibraryMeta}>
                                                    {presetStorageMode === 'cloud' ? 'Sincronizados con tu cuenta' : 'Se guardan en este dispositivo'}
                                                </span>
                                            </div>
                                            <div className={styles.gradientUploadRow}>
                                                <input
                                                    className={styles.modalInput}
                                                    value={gradientPresetName}
                                                    onChange={(event) => setGradientPresetName(event.target.value)}
                                                    placeholder="Ej: Verde noche"
                                                />
                                                <button className={styles.uploadBtn} onClick={handleSaveGradientPreset} type="button">
                                                    Guardar gradiente
                                                </button>
                                            </div>
                                            {savedColorGradientPresets.length > 0 ? (
                                                <div className={styles.gradientPresetGrid}>
                                                    {savedColorGradientPresets.map((preset) => {
                                                        const isActive = bgColor === preset.gradientLeftColor
                                                            && accentColor === preset.gradientRightColor;
                                                        return (
                                                            <div key={preset.id} className={styles.savedPresetCard}>
                                                                <button
                                                                    className={`${styles.gradientPresetBtn} ${isActive ? styles.gradientPresetBtnActive : ''}`}
                                                                    onClick={() => applySavedGradientPreset(preset)}
                                                                    title={`Aplicar ${preset.name}`}
                                                                    type="button"
                                                                >
                                                                    <span
                                                                        className={styles.gradientPresetSwatch}
                                                                        style={{ background: `linear-gradient(135deg, ${preset.gradientLeftColor}, ${preset.gradientRightColor})` }}
                                                                    />
                                                                    <span className={styles.gradientPresetName}>{preset.name}</span>
                                                                </button>
                                                                <button
                                                                    className={styles.savedPresetDeleteBtn}
                                                                    onClick={() => handleDeleteGradientPreset(preset.id, preset.name)}
                                                                    title={`Borrar ${preset.name}`}
                                                                    aria-label={`Borrar ${preset.name}`}
                                                                    type="button"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className={styles.emptyPresetState}>
                                                    Todavia no guardaste gradientes personalizados para esta paleta.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}
                            </div>
                            <aside className={styles.modalPreviewPanel} aria-label="Vista previa del export">
                                <div className={styles.modalPreviewHeader}>
                                    <div>
                                        <span>Vista previa</span>
                                        <strong>{exportModalSubtitle}</strong>
                                    </div>
                                    <small>{selectedFormatConfig.width} x {selectedFormatConfig.height}</small>
                                </div>
                                <div className={styles.modalPreviewCanvas}>
                                    <ExportImagePreview
                                        template={template}
                                        data={modalPreviewData}
                                        format={format}
                                        visualFamily={visualFamily}
                                        customizationState={designCustomizationState}
                                        previewColors={modalPreviewColors}
                                        plateOptions={modalPlateOptions}
                                        matchExportMode={matchExportMode}
                                        matchExportLayout={matchExportLayout}
                                        lineupExportMode={lineupExportMode}
                                        lineupExportLayout={lineupExportLayout}
                                        standingsExportMode={standingsExportMode}
                                        dailyMatchesTimeMode={dailyMatchesTimeMode}
                                        className={styles.modalPreviewImage}
                                    />
                                </div>
                            </aside>
                        </div>

                        <div className={styles.modalFooter}>
                            <div className={styles.modalFooterMeta}>
                                <div className={styles.modalMetaGroup}>
                                    <span>{selectedFormatConfig.width} x {selectedFormatConfig.height} px</span>
                                    <small>Dimensiones finales</small>
                                </div>
                                <div className={styles.modalMetaGroup}>
                                    <span>PNG High-Res</span>
                                    <small>Formato de salida</small>
                                </div>
                            </div>
                            <div className={styles.modalActions}>
                                <button className={styles.cancelBtn} onClick={() => setShowModal(false)} type="button">
                                    Cancelar
                                </button>
                                <button
                                    className={styles.exportBtn}
                                    onClick={handleExport}
                                    disabled={
                                        (template === 'dailyMatches' && selectedMatchIndices.size === 0)
                                        || (template === 'matchStats' && matchExportLayout === 'editorial4x5' && !hasMatchEditorialBackground)
                                    }
                                    type="button"
                                >
                                    {exportActionLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            , document.body) : null}

            <GuestExportInvite isOpen={guestInvite.isOpen} onClose={guestInvite.close} />
        </div>
    );
}

export function ExportImagePreview({
    template,
    data,
    format = '1080x1350',
    visualFamily,
    customizationState = null,
    previewColors,
    plateOptions,
    matchExportMode = 'result',
    matchExportLayout = 'classic',
    lineupExportMode = 'both',
    lineupExportLayout = 'classic',
    standingsExportMode = 'table',
    dailyMatchesTimeMode = 'time',
    className = '',
}: ExportImagePreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [previewError, setPreviewError] = useState('');
    const [hasPreview, setHasPreview] = useState(false);
    const [isRenderingPreview, setIsRenderingPreview] = useState(false);

    // Las opciones vigentes viven en un ref y el bucle de dibujo las lee recien cuando
    // le toca dibujar: un arrastre del selector de color o el tipeo del nombre no
    // encolan un dibujo por cada cambio, se pliegan en la pasada siguiente.
    const renderOptions: ExportPreviewRenderOptions = {
        template,
        data,
        format,
        visualFamily,
        customizationState,
        previewColors,
        plateOptions,
        matchExportMode,
        matchExportLayout,
        lineupExportMode,
        lineupExportLayout,
        standingsExportMode,
        dailyMatchesTimeMode,
    };
    const latestOptionsRef = useRef<ExportPreviewRenderOptions>(renderOptions);
    latestOptionsRef.current = renderOptions;
    const renderLoopRef = useRef({ inFlight: false, dirty: false, dirtyAt: 0 });
    const isMountedRef = useRef(true);
    // El lienzo donde se dibuja a tamano real, uno por preview y para toda su vida.
    const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            // Al cerrar el modal se suelta: son varios MB que no tienen por que
            // quedar colgando hasta que el recolector se acuerde.
            const scratch = scratchCanvasRef.current;
            if (scratch) {
                scratch.width = 0;
                scratch.height = 0;
                scratchCanvasRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const loop = renderLoopRef.current;
        if (!loop.dirty) loop.dirtyAt = Date.now();
        loop.dirty = true;
        // Si hay un dibujo en curso alcanza con dejar marcado que quedo algo pendiente:
        // el bucle vuelve a pasar con las opciones mas nuevas cuando termine.
        if (loop.inFlight) return undefined;

        // Se espera a que la rafaga afloje, pero no para siempre: un arrastre largo del
        // selector de color igual ve la pieza cambiar cada tanto.
        const waited = Date.now() - loop.dirtyAt;
        const delay = Math.max(0, Math.min(PREVIEW_RENDER_DEBOUNCE_MS, PREVIEW_RENDER_MAX_WAIT_MS - waited));
        const timer = window.setTimeout(async () => {
            loop.inFlight = true;
            if (isMountedRef.current) setIsRenderingPreview(true);
            try {
                while (loop.dirty && isMountedRef.current) {
                    loop.dirty = false;
                    try {
                        if (!scratchCanvasRef.current) {
                            scratchCanvasRef.current = document.createElement('canvas');
                        }
                        const rendered = await renderMatchExportPreviewCanvas(
                            latestOptionsRef.current,
                            scratchCanvasRef.current,
                        );
                        if (!isMountedRef.current) return;
                        paintPreviewCanvas(canvasRef.current, rendered);
                        setHasPreview(true);
                        setPreviewError('');
                    } catch (error) {
                        if (!isMountedRef.current) return;
                        setPreviewError(error instanceof Error ? error.message : 'No se pudo generar el preview');
                    }
                }
            } finally {
                loop.inFlight = false;
                if (isMountedRef.current) setIsRenderingPreview(false);
            }
        }, delay);

        return () => {
            window.clearTimeout(timer);
        };
    }, [customizationState, dailyMatchesTimeMode, data, format, lineupExportLayout, lineupExportMode, matchExportLayout, matchExportMode, plateOptions, previewColors, standingsExportMode, template, visualFamily]);

    // La primera pasada pinta con el lienzo todavia oculto: si el panel toma su alto
    // del propio lienzo (el laboratorio, una tarjeta suelta) mide unos pixeles y el
    // preview queda diminuto. Al mostrarse se vuelve a copiar desde el dibujo a
    // tamano real, que sigue en el lienzo de trabajo: cuesta un drawImage.
    useEffect(() => {
        if (!hasPreview) return;
        const scratch = scratchCanvasRef.current;
        if (scratch && scratch.width > 0) paintPreviewCanvas(canvasRef.current, scratch);
    }, [hasPreview]);

    // El lienzo queda montado siempre, aunque este oculto: si se desmontara mientras
    // se muestra el error o el "Generando", el dibujo siguiente no tendria donde caer.
    return (
        <>
            {!hasPreview && <div className={className}>{previewError || 'Generando preview...'}</div>}
            <canvas
                ref={canvasRef}
                className={className}
                role="img"
                aria-label={isRenderingPreview ? 'Preview del export actualizandose' : 'Preview del export'}
                aria-busy={isRenderingPreview}
                style={{
                    display: hasPreview ? undefined : 'none',
                    opacity: isRenderingPreview ? 0.65 : 1,
                    transition: 'opacity 160ms ease',
                }}
            />
        </>
    );
}

// Cuanto se espera antes de dibujar, para que una rafaga de cambios (una tecla atras
// de otra, el arrastre del color) sea una pasada y no una por cambio.
const PREVIEW_RENDER_DEBOUNCE_MS = 120;
// Tope de espera cuando los cambios no paran de llegar.
const PREVIEW_RENDER_MAX_WAIT_MS = 350;

function buildDefaultMatchSelection(template: ExportTemplate, data: ExportData): Set<number> {
    if (template !== 'dailyMatches') return new Set<number>();
    const matches = (data as DailyMatchesData).matches ?? [];
    return new Set(Array.from({ length: Math.min(matches.length, 10) }, (_, index) => index));
}

// Cuanto se permite densificar el preview por encima de su caja. Un telefono
// declara 3, pero la diferencia entre 2 y 3 no se ve en una vista previa y el costo
// se paga en pixeles: 3 son mas del doble de memoria que 2.
const PREVIEW_MAX_DEVICE_PIXEL_RATIO = 2;
// Cuando todavia no se puede medir la caja (el modal recien abre), un tope sano.
const PREVIEW_FALLBACK_MAX_EDGE = 720;

function scalePreviewSize(width: number, height: number, scale: number) {
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

// A que resolucion conviene dejar el lienzo visible. El export se dibuja siempre a
// 1080 de ancho, pero el preview se MUESTRA en un panel de pocos cientos de pixeles
// —en el telefono son ~380 de alto—, asi que copiar los 1080x1920 enteros era
// cargar 8,3 MB de textura para que el compositor la reescalara en cada cuadro.
function getPreviewPaintSize(target: HTMLCanvasElement, rendered: HTMLCanvasElement) {
    const fallback = () => scalePreviewSize(
        rendered.width,
        rendered.height,
        Math.min(1, PREVIEW_FALLBACK_MAX_EDGE / Math.max(rendered.width, rendered.height)),
    );
    if (typeof window === 'undefined') return fallback();

    // El lienzo esta oculto hasta que hay algo dibujado, asi que no se puede medir a
    // el: se mide el panel que lo contiene, que siempre tiene caja.
    const box = target.parentElement;
    const boxWidth = box?.clientWidth ?? 0;
    const boxHeight = box?.clientHeight ?? 0;
    if (boxWidth <= 0 || boxHeight <= 0) return fallback();

    const density = Math.min(Math.max(window.devicePixelRatio || 1, 1), PREVIEW_MAX_DEVICE_PIXEL_RATIO);
    const fit = Math.min(boxWidth / rendered.width, boxHeight / rendered.height);
    // Nunca por encima del dibujo original: agrandarlo no agrega detalle.
    return scalePreviewSize(rendered.width, rendered.height, Math.min(1, fit * density));
}

function paintPreviewCanvas(target: HTMLCanvasElement | null, rendered: HTMLCanvasElement) {
    if (!target) return;
    const { width, height } = getPreviewPaintSize(target, rendered);
    if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
    }
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rendered, 0, 0, rendered.width, rendered.height, 0, 0, target.width, target.height);
}

function getDefaultTournamentName(template: ExportTemplate, data: ExportData): string {
    if (template === 'standings') return (data as StandingsData).title || '';
    if (template === 'playoffBracket') return (data as PlayoffBracketData).title || '';
    if (template === 'dailyMatches' || template === 'matchStats' || template === 'lineups' || template === 'squad' || template === 'teamOfWeek') {
        return (data as DailyMatchesData | MatchStatsData | LineupsData | SquadData | TeamOfWeekData).tournament || '';
    }
    return '';
}

function formatExportScoreInput(value: number | null | undefined): string {
    return value === null || value === undefined || Number.isNaN(value) ? '' : String(value);
}

function getDefaultMatchExportMode(template: ExportTemplate, data: ExportData): MatchExportMode {
    if (template !== 'matchStats') return 'schedule';
    const matchData = data as MatchStatsData;
    return matchData.status === 'scheduled' ? 'schedule' : 'result';
}

function getMatchExportModeLabel(mode: MatchExportMode): string {
    return mode === 'schedule' ? 'Horario' : 'Resultado';
}

function shouldLockMatchExportFormatToPost(
    template: ExportTemplate,
    _visualFamily: ExportVisualFamily,
    layout: MatchExportLayout,
    _mode: MatchExportMode,
) {
    void _visualFamily;
    void _mode;
    if (template !== 'matchStats') return false;
    return layout === 'editorial4x5';
}

function getResolvedMatchExportFormat(
    template: ExportTemplate,
    format: ExportFormat,
    visualFamily: ExportVisualFamily,
    layout: MatchExportLayout,
    mode: MatchExportMode,
): ExportFormat {
    return shouldLockMatchExportFormatToPost(template, visualFamily, layout, mode) ? '1080x1350' : format;
}

function getExportFontFamilyOption(id: ExportFontFamilyOptionId): ExportFontFamilyOption {
    return EXPORT_FONT_FAMILY_OPTIONS.find((option) => option.id === id) || EXPORT_FONT_FAMILY_OPTIONS[0];
}

function normalizeHexColor(value: string | null | undefined): string {
    return (value || '').trim().toLowerCase();
}

function normalizeExportFontFamilyValue(value: string | null | undefined): string {
    const normalized = (value || '').trim();
    if (!normalized) return normalized;

    const compact = normalized.toLowerCase();
    if (
        compact === 'g22 dharma gothic'
        || compact === 'dharma gothic'
        || compact === 'dharma gothic expanded'
        || compact === 'dharma gothic e'
        || compact === 'dharma gothic expanded heavy'
        || compact === 'dharma gothic e heavy'
    ) {
        return BASE_FONT_DHARMA;
    }
    if (compact === 'dharma gothic c') {
        return DHARMA_GOTHIC_C_FAMILY;
    }
    if (compact === 'dharma gothic e') {
        return DHARMA_GOTHIC_E_FAMILY;
    }
    if (compact === 'dharma gothic m') {
        return DHARMA_GOTHIC_M_FAMILY;
    }

    return normalized;
}

function findPaletteIdByColors(bg: string | null | undefined, accent: string | null | undefined): string {
    const normalizedBg = normalizeHexColor(bg);
    const normalizedAccent = normalizeHexColor(accent);
    const matchedPalette = EXPORT_PALETTES.find((palette) => (
        normalizeHexColor(palette.bg) === normalizedBg
        && normalizeHexColor(palette.accent) === normalizedAccent
    ));
    return matchedPalette?.id || 'custom';
}

function resolveActiveTypographyContextId(
    template: ExportTemplate,
    layout: MatchExportLayout,
    mode: MatchExportMode
): ExportDesignTypographyContextId {
    if (template === 'matchStats') {
        if (layout === 'editorial4x5') {
            return mode === 'schedule' ? 'matchEditorialSchedule' : 'matchEditorialResult';
        }
        return mode === 'schedule' ? 'matchClassicSchedule' : 'matchClassicResult';
    }
    if (template === 'dailyMatches') return 'dailyMatches';
    if (template === 'standings') return 'standings';
    if (template === 'playerStats') return 'playerStats';
    if (template === 'playoffBracket') return 'playoffBracket';
    if (template === 'lineups') return 'lineups';
    if (template === 'squad') return 'lineups';
    if (template === 'teamOfWeek') return 'teamOfWeek';
    return 'global';
}

function resolveActiveElementDimensionContextId(
    template: ExportTemplate,
    layout: MatchExportLayout,
    mode: MatchExportMode
): ExportDesignElementDimensionContextId {
    const contextId = resolveActiveTypographyContextId(template, layout, mode);
    return contextId === 'global' ? 'matchClassicSchedule' : contextId;
}

function resolveActiveElementDimensions(
    customization: ExportDesignCustomizationState | null,
    activeContextId: ExportDesignElementDimensionContextId
): ActiveExportElementDimensions {
    const context = (customization?.elementDimensionContexts ?? []).find((item) => item.id === activeContextId) as ExportDesignElementDimensionContext | undefined;
    if (!context) return {};

    return context.items.reduce<ActiveExportElementDimensions>((acc, item) => {
        acc[item.id] = { width: item.width, offsetY: item.offsetY };
        return acc;
    }, {});
}

function setActiveElementDimensions(dimensions: ActiveExportElementDimensions) {
    ACTIVE_EXPORT_ELEMENT_DIMENSIONS = dimensions;
}

function resetActiveElementDimensions() {
    ACTIVE_EXPORT_ELEMENT_DIMENSIONS = {};
}

function getActiveElementDimensionWidth(id: ExportDesignElementDimensionItemId, fallback: number) {
    const value = ACTIVE_EXPORT_ELEMENT_DIMENSIONS[id]?.width;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function getActiveElementDimensionOffsetY(id: ExportDesignElementDimensionItemId, fallback = 0) {
    const value = ACTIVE_EXPORT_ELEMENT_DIMENSIONS[id]?.offsetY;
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function scaleElementSize(id: ExportDesignElementDimensionItemId, baseValue: number, defaultValue: number) {
    if (!defaultValue) return baseValue;
    return baseValue * (getActiveElementDimensionWidth(id, defaultValue) / defaultValue);
}

function offsetElementY(id: ExportDesignElementDimensionItemId, baseValue: number) {
    return baseValue + getActiveElementDimensionOffsetY(id, 0);
}

function resolveDesignTypographyFamilies(
    customization: ExportDesignCustomizationState | null,
    activeContextId: ExportDesignTypographyContextId
): Partial<Record<ExportTypographyRole, ExportTypographyRoleOverride>> {
    if (!customization) return {};

    const resolvedOverrides: Partial<Record<ExportTypographyRole, ExportTypographyRoleOverride>> = {};
    const contextLookup = new Map(
        (customization.typographyContexts ?? []).map((context) => [context.id, context] as const)
    );
    const activeItems = contextLookup.get(activeContextId)?.items ?? [];
    const globalItems = contextLookup.get('global')?.items ?? [];
    const combinedItems = [...activeItems, ...globalItems, ...customization.typography];

    const assignOverrideForSlot = (role: ExportTypographyRole, ...slots: ExportDesignTypographySlot[]) => {
        for (const slot of slots) {
            const matchedItem = combinedItems.find((item) => item.slot === slot && (item.family.trim() || item.weight.trim()));
            if (matchedItem) {
                resolvedOverrides[role] = {
                    family: normalizeExportFontFamilyValue(matchedItem.family),
                    weight: normalizeTypographyWeightValue(matchedItem.weight, getDefaultTypographyWeight(role)),
                };
                return;
            }
        }
    };

    assignOverrideForSlot('display', 'display', 'body', 'editorial');
    assignOverrideForSlot('body', 'body', 'display');
    assignOverrideForSlot('mono', 'mono', 'body');
    assignOverrideForSlot('editorial', 'editorial', 'score', 'display');
    assignOverrideForSlot('score', 'score', 'editorial', 'mono');

    for (const item of combinedItems) {
        const family = normalizeExportFontFamilyValue(item.family);
        const weight = normalizeTypographyWeightValue(item.weight, '700');
        if (!family) continue;

        const normalizedRole = item.role.trim().toLowerCase();
        if (!resolvedOverrides.score?.family && normalizedRole.includes('score')) {
            resolvedOverrides.score = { family, weight };
        }
        if (!resolvedOverrides.display?.family && (normalizedRole.includes('titulo') || normalizedRole.includes('display'))) {
            resolvedOverrides.display = { family, weight };
        }
        if (!resolvedOverrides.editorial?.family && (normalizedRole.includes('titular') || normalizedRole.includes('editorial') || normalizedRole.includes('firma'))) {
            resolvedOverrides.editorial = { family, weight };
        }
        if (!resolvedOverrides.body?.family && (normalizedRole.includes('interfaz') || normalizedRole.includes('texto') || normalizedRole.includes('sans'))) {
            resolvedOverrides.body = { family, weight };
        }
        if (!resolvedOverrides.mono?.family && (normalizedRole.includes('mono') || normalizedRole.includes('metadata') || normalizedRole.includes('chip'))) {
            resolvedOverrides.mono = { family, weight };
        }
    }

    return resolvedOverrides;
}

function getExportTypographyPreset(id?: string): ExportTypographyPreset {
    return EXPORT_TYPOGRAPHY_PRESETS.find((preset) => preset.id === id) || EXPORT_TYPOGRAPHY_PRESETS[0];
}

function getDefaultTypographyPresetId(visualFamily: ExportVisualFamily): ExportTypographyPresetId {
    if (visualFamily === 'posterV3') return 'poster-v3';
    if (visualFamily === 'momentumV2') return 'momentum-v2';
    if (visualFamily === 'impactoV4') return 'impacto-v4';
    if (visualFamily === 'fanV5') return 'fan-v5';
    return 'g22-core';
}

function getDefaultTypographyWeight(role: ExportTypographyRole): string {
    if (role === 'display') return '900';
    if (role === 'body') return '700';
    if (role === 'mono') return '700';
    if (role === 'editorial') return '800';
    return '900';
}

function normalizeTypographyWeightValue(value: string | null | undefined, fallback: string): string {
    const trimmed = (value || '').trim();
    if (!trimmed) return fallback;

    const exactMatch = trimmed.match(/^\d{3}$/);
    if (exactMatch) return exactMatch[0];

    const rangeMatches = trimmed.match(/\d{3}/g);
    if (rangeMatches && rangeMatches.length > 0) {
        return rangeMatches[rangeMatches.length - 1];
    }

    const normalized = trimmed.toLowerCase();
    if (normalized.includes('thin')) return '100';
    if (normalized.includes('light')) return '300';
    if (normalized.includes('regular') || normalized.includes('normal')) return '400';
    if (normalized.includes('medium')) return '500';
    if (normalized.includes('semibold')) return '600';
    if (normalized.includes('bold')) return '700';
    if (normalized.includes('heavy') || normalized.includes('black')) return '900';

    return fallback;
}

function getActiveTypographyWeight(role: ExportTypographyRole, fallback: string): string {
    if (role === 'display') return normalizeTypographyWeightValue(FONT_WEIGHT_DISPLAY, fallback);
    if (role === 'body') return normalizeTypographyWeightValue(FONT_WEIGHT_BODY, fallback);
    if (role === 'mono') return normalizeTypographyWeightValue(FONT_WEIGHT_MONO, fallback);
    if (role === 'editorial') return normalizeTypographyWeightValue(FONT_WEIGHT_EDITORIAL, fallback);
    return normalizeTypographyWeightValue(FONT_WEIGHT_SCORE, fallback);
}

function resolveCanvasFontWeight(family: string, fallback: string): string {
    if (family === FONT_CLASSIC_MATCH_SCORE || family === FONT_EDITORIAL_SCORE) {
        return getActiveTypographyWeight('score', fallback);
    }
    if (family === FONT_EDITORIAL) {
        return getActiveTypographyWeight('editorial', fallback);
    }
    if (family === FONT_MONO) {
        return getActiveTypographyWeight('mono', fallback);
    }
    if (family === FONT_DISPLAY || family === FONT_OUTFIT_BLACK) {
        return getActiveTypographyWeight('display', fallback);
    }
    if (family === FONT_BODY) {
        return getActiveTypographyWeight('body', fallback);
    }

    return normalizeTypographyWeightValue(fallback, fallback);
}

function resolveTypographyConfig(
    presetId: ExportTypographyPresetId,
    overrides: Partial<Record<ExportTypographyRole, ExportFontFamilyOptionId>>,
    roleOverrides: Partial<Record<ExportTypographyRole, ExportTypographyRoleOverride>> = {}
): ResolvedTypographyConfig {
    const preset = getExportTypographyPreset(presetId);
    const roles: Record<ExportTypographyRole, ExportFontFamilyOptionId> = {
        ...preset.roles,
        ...overrides,
    };

    return {
        preset,
        roles,
        families: {
            display: roleOverrides.display?.family?.trim() || getExportFontFamilyOption(roles.display).family,
            body: roleOverrides.body?.family?.trim() || getExportFontFamilyOption(roles.body).family,
            mono: roleOverrides.mono?.family?.trim() || getExportFontFamilyOption(roles.mono).family,
            editorial: roleOverrides.editorial?.family?.trim() || getExportFontFamilyOption(roles.editorial).family,
            score: roleOverrides.score?.family?.trim() || getExportFontFamilyOption(roles.score).family,
        },
        weights: {
            display: normalizeTypographyWeightValue(roleOverrides.display?.weight, getDefaultTypographyWeight('display')),
            body: normalizeTypographyWeightValue(roleOverrides.body?.weight, getDefaultTypographyWeight('body')),
            mono: normalizeTypographyWeightValue(roleOverrides.mono?.weight, getDefaultTypographyWeight('mono')),
            editorial: normalizeTypographyWeightValue(roleOverrides.editorial?.weight, getDefaultTypographyWeight('editorial')),
            score: normalizeTypographyWeightValue(roleOverrides.score?.weight, getDefaultTypographyWeight('score')),
        },
    };
}

function applyTypographyConfig(config: ResolvedTypographyConfig) {
    FONT_DISPLAY = config.families.display;
    FONT_BODY = config.families.body;
    FONT_MONO = config.families.mono;
    FONT_OUTFIT_BLACK = config.families.display;
    FONT_EDITORIAL = config.families.editorial;
    FONT_CLASSIC_MATCH_SCORE = config.families.score;
    FONT_EDITORIAL_SCORE = config.families.score;
    FONT_WEIGHT_DISPLAY = config.weights.display;
    FONT_WEIGHT_BODY = config.weights.body;
    FONT_WEIGHT_MONO = config.weights.mono;
    FONT_WEIGHT_EDITORIAL = config.weights.editorial;
    FONT_WEIGHT_SCORE = config.weights.score;
}

function getExportVisualFamilyLabel(family: ExportVisualFamily): string {
    return EXPORT_VISUAL_FAMILY_OPTIONS.find((option) => option.value === family)?.label || 'G22 Base';
}

function getMatchExportLayoutLabel(layout: MatchExportLayout): string {
    return MATCH_EXPORT_LAYOUT_OPTIONS.find((option) => option.value === layout)?.label || 'Clasico';
}

function getLineupExportModeLabel(mode: LineupExportMode): string {
    return LINEUP_EXPORT_MODE_OPTIONS.find((option) => option.value === mode)?.label || 'Dos equipos';
}

function getEditorialLayoutPreset(id?: string): MatchEditorialLayoutPreset {
    return EDITORIAL_LAYOUT_PRESETS.find((preset) => preset.id === id) || EDITORIAL_LAYOUT_PRESETS[0];
}

function buildEmptySponsorSlot(index: number): MatchSponsorData {
    return {
        id: `slot-${index + 1}`,
        name: '',
        logo: '',
        placement: '',
    };
}

function buildEditorialSponsorSlots(sponsors?: MatchSponsorData[]): MatchSponsorData[] {
    const normalized: MatchSponsorData[] = Array.isArray(sponsors)
        ? sponsors.slice(0, EDITORIAL_SPONSOR_SLOTS).map((sponsor, index) => ({
            id: sponsor?.id || `slot-${index + 1}`,
            name: sponsor?.name?.trim() || '',
            logo: sponsor?.logo?.trim() || '',
            placement: sponsor?.placement?.trim() || '',
        }))
        : [];

    while (normalized.length < EDITORIAL_SPONSOR_SLOTS) {
        normalized.push(buildEmptySponsorSlot(normalized.length));
    }

    return normalized;
}

function getActiveEditorialSponsors(sponsors: MatchSponsorData[]): MatchSponsorData[] {
    return sponsors
        .map((sponsor, index) => ({
            id: sponsor?.id || `slot-${index + 1}`,
            name: sponsor?.name?.trim() || '',
            logo: sponsor?.logo?.trim() || '',
            placement: sponsor?.placement?.trim() || '',
        }))
        .filter((sponsor) => Boolean(sponsor.logo || sponsor.name));
}

function buildPresetId(prefix: 'editorial' | 'gradient' | 'plate'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePresetName(name: string): string {
    return name.trim().toLocaleLowerCase('es-AR');
}

function encodeRemotePresetIdSegment(value: string): string {
    return encodeURIComponent(value).replace(/%/g, '_');
}

function buildRemotePresetRowId(userId: string, presetType: ExportPresetKind, presetName: string): string {
    return [
        'export_preset',
        encodeRemotePresetIdSegment(userId),
        presetType,
        encodeRemotePresetIdSegment(normalizePresetName(presetName)),
    ].join(':');
}

function upsertSavedEditorialPreset(
    presets: SavedMatchEditorialPreset[],
    preset: SavedMatchEditorialPreset,
): SavedMatchEditorialPreset[] {
    const normalizedName = normalizePresetName(preset.name);
    return [
        preset,
        ...presets.filter((current) => normalizePresetName(current.name) !== normalizedName),
    ].slice(0, MAX_SAVED_EDITORIAL_PRESETS);
}

function upsertSavedGradientPreset(
    presets: SavedMatchGradientPreset[],
    preset: SavedMatchGradientPreset,
): SavedMatchGradientPreset[] {
    const normalizedName = normalizePresetName(preset.name);
    return [
        preset,
        ...presets.filter((current) => normalizePresetName(current.name) !== normalizedName),
    ].slice(0, MAX_SAVED_EDITORIAL_GRADIENT_PRESETS);
}

function upsertSavedPlatePreset(
    presets: SavedMatchPlatePreset[],
    preset: SavedMatchPlatePreset,
): SavedMatchPlatePreset[] {
    const normalizedName = normalizePresetName(preset.name);
    return [
        preset,
        ...presets.filter((current) => normalizePresetName(current.name) !== normalizedName),
    ].slice(0, MAX_SAVED_PLATE_PRESETS);
}

function normalizeSavedEditorialPresets(raw: unknown): SavedMatchEditorialPreset[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item, index) => ({
            id: typeof item?.id === 'string' && item.id ? item.id : `preset-${index + 1}`,
            name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Preset ${index + 1}`,
            layoutPresetId: getEditorialLayoutPreset(item?.layoutPresetId).id,
            gradientLeftColor: typeof item?.gradientLeftColor === 'string' && item.gradientLeftColor ? item.gradientLeftColor : '#df255c',
            gradientRightColor: typeof item?.gradientRightColor === 'string' && item.gradientRightColor ? item.gradientRightColor : DEFAULT_PALETTE.accent,
            gradientImage: typeof item?.gradientImage?.src === 'string' && item.gradientImage.src
                ? {
                    name: typeof item?.gradientImage?.name === 'string' && item.gradientImage.name.trim()
                        ? item.gradientImage.name.trim()
                        : 'Degradado guardado',
                    src: item.gradientImage.src,
                }
                : null,
            sponsors: getActiveEditorialSponsors(buildEditorialSponsorSlots(item?.sponsors)),
        }))
        .slice(0, MAX_SAVED_EDITORIAL_PRESETS);
}

function normalizeSavedGradientPresets(raw: unknown): SavedMatchGradientPreset[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item, index) => ({
            id: typeof item?.id === 'string' && item.id ? item.id : `gradient-${index + 1}`,
            name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Gradiente ${index + 1}`,
            gradientLeftColor: typeof item?.gradientLeftColor === 'string' && item.gradientLeftColor ? item.gradientLeftColor : '#df255c',
            gradientRightColor: typeof item?.gradientRightColor === 'string' && item.gradientRightColor ? item.gradientRightColor : DEFAULT_PALETTE.accent,
            gradientImage: typeof item?.gradientImage?.src === 'string' && item.gradientImage.src
                ? {
                    name: typeof item?.gradientImage?.name === 'string' && item.gradientImage.name.trim()
                        ? item.gradientImage.name.trim()
                        : 'Degradado guardado',
                    src: item.gradientImage.src,
                }
                : null,
        }))
        .slice(0, MAX_SAVED_EDITORIAL_GRADIENT_PRESETS);
}

function readStorageJson(legacyKey: string): unknown {
    if (typeof window === 'undefined') return undefined;

    try {
        const raw = globalThis.localStorage.getItem(legacyKey);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

function openExportStorageDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !('indexedDB' in window)) {
            reject(new Error('IndexedDB no disponible'));
            return;
        }

        const request = window.indexedDB.open(EXPORT_STORAGE_DB_NAME, EXPORT_STORAGE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(EXPORT_STORAGE_STORE_NAME)) {
                db.createObjectStore(EXPORT_STORAGE_STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('No se pudo abrir el storage de exportacion'));
    });
}

function normalizePlatePresetColor(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    // El vacio es un valor legitimo: significa "Auto".
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : '';
}

function normalizePlatePresetBrand(value: unknown): PlateBrandId {
    return PLATE_BRAND_OPTIONS.some((option) => option.value === value)
        ? value as PlateBrandId
        : 'auto';
}

function normalizeSavedPlatePresets(raw: unknown): SavedMatchPlatePreset[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item, index) => ({
            id: typeof item?.id === 'string' && item.id ? item.id : `plate-${index + 1}`,
            name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Placa ${index + 1}`,
            field: normalizePlatePresetColor(item?.field),
            fieldEnd: normalizePlatePresetColor(item?.fieldEnd),
            ink: normalizePlatePresetColor(item?.ink),
            brand: normalizePlatePresetBrand(item?.brand),
        }))
        .slice(0, MAX_SAVED_PLATE_PRESETS);
}

async function readPersistedCollection<T>(
    storageKey: string,
    legacyKey: string,
    normalize: (raw: unknown) => T,
): Promise<T> {
    if (typeof window === 'undefined') return normalize(undefined);

    if (!('indexedDB' in window)) {
        return normalize(readStorageJson(legacyKey));
    }

    try {
        const db = await openExportStorageDatabase();
        const value = await new Promise<unknown>((resolve, reject) => {
            const transaction = db.transaction(EXPORT_STORAGE_STORE_NAME, 'readonly');
            const store = transaction.objectStore(EXPORT_STORAGE_STORE_NAME);
            const request = store.get(storageKey);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error || new Error('No se pudo leer el storage'));
        });
        db.close();

        if (value !== undefined) {
            return normalize(value);
        }

        const legacyValue = readStorageJson(legacyKey);
        const normalizedLegacy = normalize(legacyValue);
        if (legacyValue !== undefined) {
            await persistCollection(storageKey, legacyKey, normalizedLegacy);
        }
        return normalizedLegacy;
    } catch {
        return normalize(readStorageJson(legacyKey));
    }
}

async function persistCollection<T>(storageKey: string, legacyKey: string, value: T): Promise<void> {
    if (typeof window === 'undefined') return;

    if (!('indexedDB' in window)) {
        globalThis.localStorage.setItem(legacyKey, JSON.stringify(value));
        return;
    }

    const db = await openExportStorageDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(EXPORT_STORAGE_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(EXPORT_STORAGE_STORE_NAME);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('No se pudo persistir el storage'));
            store.put({ key: storageKey, value });
        });
        try {
            globalThis.localStorage.removeItem(legacyKey);
        } catch {
            // Best effort cleanup to avoid volver al limite de localStorage.
        }
    } finally {
        db.close();
    }
}

async function readLocalSavedEditorialPresets(): Promise<SavedMatchEditorialPreset[]> {
    return readPersistedCollection(
        EXPORT_STORAGE_EDITORIAL_PRESETS_KEY,
        EDITORIAL_PRESET_STORAGE_KEY,
        normalizeSavedEditorialPresets,
    );
}

async function readLocalSavedGradientPresets(): Promise<SavedMatchGradientPreset[]> {
    return readPersistedCollection(
        EXPORT_STORAGE_EDITORIAL_GRADIENTS_KEY,
        EDITORIAL_GRADIENT_PRESET_STORAGE_KEY,
        normalizeSavedGradientPresets,
    );
}

async function persistLocalSavedEditorialPresets(presets: SavedMatchEditorialPreset[]): Promise<void> {
    await persistCollection(
        EXPORT_STORAGE_EDITORIAL_PRESETS_KEY,
        EDITORIAL_PRESET_STORAGE_KEY,
        presets,
    );
}

async function persistLocalSavedGradientPresets(presets: SavedMatchGradientPreset[]): Promise<void> {
    await persistCollection(
        EXPORT_STORAGE_EDITORIAL_GRADIENTS_KEY,
        EDITORIAL_GRADIENT_PRESET_STORAGE_KEY,
        presets,
    );
}

async function readLocalSavedPlatePresets(): Promise<SavedMatchPlatePreset[]> {
    return readPersistedCollection(
        EXPORT_STORAGE_PLATE_PRESETS_KEY,
        PLATE_PRESET_STORAGE_KEY,
        normalizeSavedPlatePresets,
    );
}

async function persistLocalSavedPlatePresets(presets: SavedMatchPlatePreset[]): Promise<void> {
    await persistCollection(
        EXPORT_STORAGE_PLATE_PRESETS_KEY,
        PLATE_PRESET_STORAGE_KEY,
        presets,
    );
}

function mergeSavedPlatePresetCollections(
    remotePresets: SavedMatchPlatePreset[],
    localPresets: SavedMatchPlatePreset[],
): SavedMatchPlatePreset[] {
    return localPresets.reduce(
        (merged, preset) => upsertSavedPlatePreset(merged, preset),
        [...remotePresets],
    );
}

function mergeSavedEditorialPresetCollections(
    remotePresets: SavedMatchEditorialPreset[],
    localPresets: SavedMatchEditorialPreset[],
): SavedMatchEditorialPreset[] {
    return localPresets.reduce(
        (merged, preset) => upsertSavedEditorialPreset(merged, preset),
        [...remotePresets],
    );
}

function mergeSavedGradientPresetCollections(
    remotePresets: SavedMatchGradientPreset[],
    localPresets: SavedMatchGradientPreset[],
): SavedMatchGradientPreset[] {
    return localPresets.reduce(
        (merged, preset) => upsertSavedGradientPreset(merged, preset),
        [...remotePresets],
    );
}

// Un gradiente guardado es un PNG en base64 de alrededor de 1 MB. Meterlo entero
// en la firma obligaba a serializar decenas de MB por comparacion, varias veces
// por hidratacion. Con el largo y una muestra de 512 posiciones alcanza para
// detectar que cambio la foto; el nombre del preset es la clave de conflicto.
function fingerprintLargeString(value: string): string {
    if (value.length <= 4096) return value;
    const step = Math.max(1, Math.floor(value.length / 512));
    let hash = 0;
    for (let index = 0; index < value.length; index += step) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return `len:${value.length}:h:${hash}`;
}

function fingerprintPresetImage(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value ?? null;
    const image = value as { name?: unknown; src?: unknown };
    return {
        name: typeof image.name === 'string' ? image.name : null,
        src: typeof image.src === 'string' ? fingerprintLargeString(image.src) : null,
    };
}

function buildStablePresetSignatureEntry(value: unknown): string {
    const preset = asPresetPayload(value);
    const name = typeof preset.name === 'string' ? preset.name : '';
    // Key by persisted-relevant fields only. `id` is intentionally excluded:
    // local-origin presets carry ids like "preset-1" while their remote twins
    // use "export_preset:..." ids, so comparing ids reported spurious drift on
    // every hydrate and re-upserted all rows. Names are the conflict key anyway.
    return JSON.stringify([
        normalizePresetName(name),
        preset.layoutPresetId ?? null,
        preset.gradientLeftColor ?? null,
        preset.gradientRightColor ?? null,
        fingerprintPresetImage(preset.gradientImage),
        preset.sponsors ?? null,
        preset.field ?? null,
        preset.fieldEnd ?? null,
        preset.ink ?? null,
        preset.brand ?? null,
    ]);
}

function getPresetComparableSignature(value: unknown): string {
    if (!Array.isArray(value)) return JSON.stringify(value);
    // Order-independent: merge prepends local presets (reordering the array),
    // so a raw JSON.stringify always differed from the remote array even when
    // the content was identical. Sort the per-entry signatures instead.
    return JSON.stringify(value.map(buildStablePresetSignatureEntry).sort());
}

function getPresetSyncErrorMetadata(error: unknown): {
    message: string;
    code: string;
    status: number | null;
} {
    if (error instanceof Error) {
        return {
            message: error.message,
            code: '',
            status: null,
        };
    }

    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return {
            message: typeof record.message === 'string' ? record.message : '',
            code: typeof record.code === 'string' ? record.code : '',
            status: typeof record.status === 'number' ? record.status : null,
        };
    }

    return {
        message: '',
        code: '',
        status: null,
    };
}

function isExpectedPresetSyncFailure(error: unknown): boolean {
    const { message, code, status } = getPresetSyncErrorMetadata(error);
    const normalizedMessage = message.toLowerCase();

    if (!message && !code && status === null) {
        return true;
    }

    if (status === 401 || status === 403 || status === 404 || status === 503) {
        return true;
    }

    // 57014 = statement_timeout cancellation under pool pressure. Treat it as
    // a transient: fall back to local quietly instead of feeding the loop.
    if (code === '42P01' || code === 'PGRST301' || code === '57014') {
        return true;
    }

    return normalizedMessage.includes('statement timeout')
        || normalizedMessage.includes('canceling statement')
        || normalizedMessage.includes('failed to fetch')
        || normalizedMessage.includes('fetch failed')
        || normalizedMessage.includes('load failed')
        || normalizedMessage.includes('networkerror')
        || normalizedMessage.includes('network error')
        || normalizedMessage.includes('supabase_auth_unreachable')
        || normalizedMessage.includes('jwt')
        || normalizedMessage.includes('session')
        || normalizedMessage.includes('auth session missing')
        || normalizedMessage.includes('relation')
        || normalizedMessage.includes('user_export_presets');
}

function logUnexpectedPresetSyncFailure(label: string, error: unknown) {
    if (isExpectedPresetSyncFailure(error)) return;
    console.warn(label, error);
}

function asPresetPayload(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function mapRemoteEditorialPresetRows(rows: PersistedExportPresetRow[]): SavedMatchEditorialPreset[] {
    return normalizeSavedEditorialPresets(
        rows.map((row) => ({
            id: row.id,
            name: row.name,
            ...asPresetPayload(row.payload),
        })),
    );
}

function mapRemoteGradientPresetRows(rows: PersistedExportPresetRow[]): SavedMatchGradientPreset[] {
    return normalizeSavedGradientPresets(
        rows.map((row) => ({
            id: row.id,
            name: row.name,
            ...asPresetPayload(row.payload),
        })),
    );
}

function mapRemotePlatePresetRows(rows: PersistedExportPresetRow[]): SavedMatchPlatePreset[] {
    return normalizeSavedPlatePresets(
        rows.map((row) => ({
            id: row.id,
            name: row.name,
            ...asPresetPayload(row.payload),
        })),
    );
}

async function getAuthenticatedPresetUserId(supabase: SupabaseBrowserClient): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        logUnexpectedPresetSyncFailure('Preset auth read warning:', error);
        return null;
    }
    return data.session?.user?.id ?? null;
}

async function readRemotePresetRows(
    supabase: SupabaseBrowserClient,
    userId: string,
    presetType: ExportPresetKind,
): Promise<PersistedExportPresetRow[]> {
    const maxRows = presetType === 'gradient'
        ? MAX_SAVED_EDITORIAL_GRADIENT_PRESETS
        : presetType === 'plate'
            ? MAX_SAVED_PLATE_PRESETS
            : MAX_SAVED_EDITORIAL_PRESETS;

    const { data, error } = await supabase
        .from(EXPORT_PRESETS_TABLE)
        .select('id, name, payload, updated_at')
        .eq('user_id', userId)
        .eq('preset_type', presetType)
        .order('updated_at', { ascending: false })
        .limit(maxRows);

    if (error) {
        throw error;
    }

    return (data ?? []) as PersistedExportPresetRow[];
}

function buildRemoteEditorialPresetRow(userId: string, preset: SavedMatchEditorialPreset): RemoteExportPresetRow {
    return {
        id: buildRemotePresetRowId(userId, 'editorial', preset.name),
        user_id: userId,
        preset_type: 'editorial',
        name: preset.name,
        name_normalized: normalizePresetName(preset.name),
        payload: {
            layoutPresetId: preset.layoutPresetId,
            gradientLeftColor: preset.gradientLeftColor,
            gradientRightColor: preset.gradientRightColor,
            gradientImage: preset.gradientImage,
            sponsors: preset.sponsors,
        },
    };
}

function buildRemoteGradientPresetRow(userId: string, preset: SavedMatchGradientPreset): RemoteExportPresetRow {
    return {
        id: buildRemotePresetRowId(userId, 'gradient', preset.name),
        user_id: userId,
        preset_type: 'gradient',
        name: preset.name,
        name_normalized: normalizePresetName(preset.name),
        payload: {
            gradientLeftColor: preset.gradientLeftColor,
            gradientRightColor: preset.gradientRightColor,
            gradientImage: preset.gradientImage,
        },
    };
}

function buildRemotePlatePresetRow(userId: string, preset: SavedMatchPlatePreset): RemoteExportPresetRow {
    return {
        id: buildRemotePresetRowId(userId, 'plate', preset.name),
        user_id: userId,
        preset_type: 'plate',
        name: preset.name,
        name_normalized: normalizePresetName(preset.name),
        payload: {
            field: preset.field,
            fieldEnd: preset.fieldEnd,
            ink: preset.ink,
            brand: preset.brand,
        },
    };
}

function compareRemotePresetRows(a: RemoteExportPresetRow, b: RemoteExportPresetRow): number {
    return a.preset_type.localeCompare(b.preset_type)
        || a.name_normalized.localeCompare(b.name_normalized)
        || a.id.localeCompare(b.id);
}

async function upsertRemotePresetRows(
    supabase: SupabaseBrowserClient,
    rows: RemoteExportPresetRow[],
): Promise<void> {
    if (rows.length === 0) return;

    // Collapse the per-row loop into a single batched upsert. One PostgREST
    // request + one transaction with a deterministic row order removes the
    // connection-pool exhaustion and 40P01 deadlock vector that was timing
    // out even trivial reads. Dedupe by the conflict key first (last wins,
    // matching the old loop) so a batched upsert can't hit ON CONFLICT twice.
    const dedupedByConflictKey = new Map<string, RemoteExportPresetRow>();
    for (const row of rows) {
        dedupedByConflictKey.set(
            `${row.user_id} ${row.preset_type} ${row.name_normalized}`,
            row,
        );
    }
    const orderedRows = [...dedupedByConflictKey.values()].sort(compareRemotePresetRows);

    const { error } = await supabase
        .from(EXPORT_PRESETS_TABLE)
        .upsert(orderedRows, { onConflict: 'user_id,preset_type,name_normalized' });

    if (error) {
        throw error;
    }
}

async function upsertRemoteEditorialPresets(
    supabase: SupabaseBrowserClient,
    userId: string,
    presets: SavedMatchEditorialPreset[],
): Promise<void> {
    await upsertRemotePresetRows(supabase, presets.map((preset) => buildRemoteEditorialPresetRow(userId, preset)));
}

async function upsertRemoteGradientPresets(
    supabase: SupabaseBrowserClient,
    userId: string,
    presets: SavedMatchGradientPreset[],
): Promise<void> {
    await upsertRemotePresetRows(supabase, presets.map((preset) => buildRemoteGradientPresetRow(userId, preset)));
}

async function upsertRemotePlatePresets(
    supabase: SupabaseBrowserClient,
    userId: string,
    presets: SavedMatchPlatePreset[],
): Promise<void> {
    await upsertRemotePresetRows(supabase, presets.map((preset) => buildRemotePlatePresetRow(userId, preset)));
}

async function deleteRemotePresetByName(
    supabase: SupabaseBrowserClient,
    userId: string,
    presetType: ExportPresetKind,
    presetName: string,
): Promise<void> {
    const { error } = await supabase
        .from(EXPORT_PRESETS_TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('preset_type', presetType)
        .eq('name_normalized', normalizePresetName(presetName));

    if (error) {
        throw error;
    }
}

type HydratedPresetCollections = {
    editorialPresets: SavedMatchEditorialPreset[];
    gradientPresets: SavedMatchGradientPreset[];
    platePresets: SavedMatchPlatePreset[];
    storageMode: ExportPresetStorageMode;
    plateStorageMode: ExportPresetStorageMode;
};

// Una hidratacion por pagina, no por instancia. La pagina de partido monta tres
// ExportImage (marcador, formacion, reporte) y cada uno pedia la coleccion
// entera a Supabase y la volvia a clonar al storage local: con 23 MB de fotos
// embebidas eran 69 MB por visita. Se comparte la promesa mientras esta en
// vuelo y el resultado por un rato corto; toda escritura la invalida.
const SHARED_PRESET_HYDRATION_TTL_MS = 30_000;
let sharedPresetHydration: { promise: Promise<HydratedPresetCollections>; startedAt: number } | null = null;

function invalidateSharedPresetHydration() {
    sharedPresetHydration = null;
}

function hydrateSavedPresetCollectionsShared(
    supabase: SupabaseBrowserClient,
    force = false,
): Promise<HydratedPresetCollections> {
    const now = Date.now();
    if (!force && sharedPresetHydration && now - sharedPresetHydration.startedAt < SHARED_PRESET_HYDRATION_TTL_MS) {
        return sharedPresetHydration.promise;
    }
    const promise = hydrateSavedPresetCollections(supabase);
    const entry = { promise, startedAt: now };
    sharedPresetHydration = entry;
    promise.catch(() => {
        // Un fallo no se cachea: la proxima instancia vuelve a intentar.
        if (sharedPresetHydration === entry) sharedPresetHydration = null;
    });
    return promise;
}

async function hydrateSavedPresetCollections(supabase: SupabaseBrowserClient): Promise<{
    editorialPresets: SavedMatchEditorialPreset[];
    gradientPresets: SavedMatchGradientPreset[];
    platePresets: SavedMatchPlatePreset[];
    storageMode: ExportPresetStorageMode;
    plateStorageMode: ExportPresetStorageMode;
}> {
    const [localEditorialPresets, localGradientPresets, localPlatePresets, userId] = await Promise.all([
        readLocalSavedEditorialPresets(),
        readLocalSavedGradientPresets(),
        readLocalSavedPlatePresets(),
        getAuthenticatedPresetUserId(supabase),
    ]);

    if (!userId) {
        return {
            editorialPresets: localEditorialPresets,
            gradientPresets: localGradientPresets,
            platePresets: localPlatePresets,
            storageMode: 'local',
            plateStorageMode: 'local',
        };
    }

    try {
        const [remoteEditorialRows, remoteGradientRows, remotePlateRows] = await Promise.all([
            readRemotePresetRows(supabase, userId, 'editorial'),
            readRemotePresetRows(supabase, userId, 'gradient'),
            readRemotePresetRows(supabase, userId, 'plate'),
        ]);
        const remoteEditorialPresets = mapRemoteEditorialPresetRows(remoteEditorialRows);
        const remoteGradientPresets = mapRemoteGradientPresetRows(remoteGradientRows);
        const remotePlatePresets = mapRemotePlatePresetRows(remotePlateRows);
        const mergedEditorialPresets = mergeSavedEditorialPresetCollections(remoteEditorialPresets, localEditorialPresets);
        const mergedGradientPresets = mergeSavedGradientPresetCollections(remoteGradientPresets, localGradientPresets);
        const mergedPlatePresets = mergeSavedPlatePresetCollections(remotePlatePresets, localPlatePresets);

        const mergedEditorialSignature = getPresetComparableSignature(mergedEditorialPresets);
        const mergedGradientSignature = getPresetComparableSignature(mergedGradientPresets);
        const mergedPlateSignature = getPresetComparableSignature(mergedPlatePresets);

        // Escribir el storage local es clonar la coleccion entera (fotos incluidas)
        // en el hilo principal: solo cuando lo remoto trajo algo distinto.
        await Promise.all([
            mergedEditorialSignature !== getPresetComparableSignature(localEditorialPresets)
                ? persistLocalSavedEditorialPresets(mergedEditorialPresets)
                : Promise.resolve(),
            mergedGradientSignature !== getPresetComparableSignature(localGradientPresets)
                ? persistLocalSavedGradientPresets(mergedGradientPresets)
                : Promise.resolve(),
            mergedPlateSignature !== getPresetComparableSignature(localPlatePresets)
                ? persistLocalSavedPlatePresets(mergedPlatePresets)
                : Promise.resolve(),
        ]);

        if (mergedEditorialSignature !== getPresetComparableSignature(remoteEditorialPresets)) {
            await upsertRemoteEditorialPresets(supabase, userId, mergedEditorialPresets);
        }

        if (mergedGradientSignature !== getPresetComparableSignature(remoteGradientPresets)) {
            await upsertRemoteGradientPresets(supabase, userId, mergedGradientPresets);
        }

        // El upsert de placas va en su propio try a proposito: la base acepta
        // el tipo 'plate' recien cuando corre la migracion, y hasta entonces
        // ese rechazo no puede arrastrar a los presets editoriales y de
        // gradiente, que ya sincronizan bien. Las placas siguen vivas en el
        // dispositivo y la biblioteca lo dice.
        let plateStorageMode: ExportPresetStorageMode = 'cloud';
        if (mergedPlateSignature !== getPresetComparableSignature(remotePlatePresets)) {
            try {
                await upsertRemotePlatePresets(supabase, userId, mergedPlatePresets);
            } catch (error) {
                logUnexpectedPresetSyncFailure('Plate preset cloud sync warning:', error);
                plateStorageMode = 'local';
            }
        }

        return {
            editorialPresets: mergedEditorialPresets,
            gradientPresets: mergedGradientPresets,
            platePresets: mergedPlatePresets,
            storageMode: 'cloud',
            plateStorageMode,
        };
    } catch (error) {
        logUnexpectedPresetSyncFailure('Preset cloud hydrate warning:', error);
        return {
            editorialPresets: localEditorialPresets,
            gradientPresets: localGradientPresets,
            platePresets: localPlatePresets,
            storageMode: 'local',
            plateStorageMode: 'local',
        };
    }
}

async function persistSavedEditorialPreset(
    presets: SavedMatchEditorialPreset[],
    preset: SavedMatchEditorialPreset,
    supabase: SupabaseBrowserClient,
): Promise<ExportPresetStorageMode> {
    invalidateSharedPresetHydration();
    await persistLocalSavedEditorialPresets(presets);

    const userId = await getAuthenticatedPresetUserId(supabase);
    if (!userId) return 'local';

    await upsertRemotePresetRows(supabase, [buildRemoteEditorialPresetRow(userId, preset)]);
    return 'cloud';
}

async function persistSavedGradientPreset(
    presets: SavedMatchGradientPreset[],
    preset: SavedMatchGradientPreset,
    supabase: SupabaseBrowserClient,
): Promise<ExportPresetStorageMode> {
    invalidateSharedPresetHydration();
    await persistLocalSavedGradientPresets(presets);

    const userId = await getAuthenticatedPresetUserId(supabase);
    if (!userId) return 'local';

    await upsertRemotePresetRows(supabase, [buildRemoteGradientPresetRow(userId, preset)]);
    return 'cloud';
}

async function deleteSavedEditorialPreset(
    presets: SavedMatchEditorialPreset[],
    presetName: string,
    supabase: SupabaseBrowserClient,
): Promise<ExportPresetStorageMode> {
    invalidateSharedPresetHydration();
    await persistLocalSavedEditorialPresets(presets);

    const userId = await getAuthenticatedPresetUserId(supabase);
    if (!userId) return 'local';

    await deleteRemotePresetByName(supabase, userId, 'editorial', presetName);
    return 'cloud';
}

async function deleteSavedGradientPreset(
    presets: SavedMatchGradientPreset[],
    presetName: string,
    supabase: SupabaseBrowserClient,
): Promise<ExportPresetStorageMode> {
    invalidateSharedPresetHydration();
    await persistLocalSavedGradientPresets(presets);

    const userId = await getAuthenticatedPresetUserId(supabase);
    if (!userId) return 'local';

    await deleteRemotePresetByName(supabase, userId, 'gradient', presetName);
    return 'cloud';
}

async function persistSavedPlatePreset(
    presets: SavedMatchPlatePreset[],
    preset: SavedMatchPlatePreset,
    supabase: SupabaseBrowserClient,
): Promise<ExportPresetStorageMode> {
    invalidateSharedPresetHydration();
    await persistLocalSavedPlatePresets(presets);

    const userId = await getAuthenticatedPresetUserId(supabase);
    if (!userId) return 'local';

    // La placa ya quedo en el dispositivo. Si la nube la rechaza —tipo 'plate'
    // todavia no habilitado en la base— no se pierde nada: se informa como
    // guardado local en vez de mentir un error.
    try {
        await upsertRemotePresetRows(supabase, [buildRemotePlatePresetRow(userId, preset)]);
    } catch (error) {
        logUnexpectedPresetSyncFailure('Plate preset cloud save warning:', error);
        return 'local';
    }

    return 'cloud';
}

async function deleteSavedPlatePreset(
    presets: SavedMatchPlatePreset[],
    presetName: string,
    supabase: SupabaseBrowserClient,
): Promise<ExportPresetStorageMode> {
    invalidateSharedPresetHydration();
    await persistLocalSavedPlatePresets(presets);

    const userId = await getAuthenticatedPresetUserId(supabase);
    if (!userId) return 'local';

    try {
        await deleteRemotePresetByName(supabase, userId, 'plate', presetName);
    } catch (error) {
        logUnexpectedPresetSyncFailure('Plate preset cloud delete warning:', error);
        return 'local';
    }

    return 'cloud';
}

function applyMatchExportMode(data: MatchStatsData, mode: MatchExportMode): MatchStatsData {
    if (mode === 'schedule') {
        return {
            ...data,
            status: 'scheduled',
            mainTitle: 'Horario',
        };
    }

    return {
        ...data,
        status: 'final',
        mainTitle: 'Resultado',
    };
}

function applyManualMatchScore(data: MatchStatsData, homeScoreInput: string, awayScoreInput: string): MatchStatsData {
    if (data.status === 'scheduled') return data;

    return {
        ...data,
        homeScore: parseManualMatchScore(homeScoreInput),
        awayScore: parseManualMatchScore(awayScoreInput),
    };
}

export type ExportPreviewRenderOptions = {
    template: ExportTemplate;
    data: ExportData;
    format: ExportFormat;
    visualFamily: ExportVisualFamily;
    customizationState: ExportDesignCustomizationState | null;
    previewColors?: ExportPreviewColorOverrides;
    plateOptions?: ExportPlateOptions;
    matchExportMode: MatchExportMode;
    matchExportLayout: MatchExportLayout;
    lineupExportMode: LineupExportMode;
    lineupExportLayout?: LineupExportLayout;
    standingsExportMode: StandingsExportMode;
    dailyMatchesTimeMode?: DailyMatchesTimeMode;
};

// Devuelve el lienzo dibujado, no un PNG: codificar 1080x1350 con toDataURL bloquea el
// hilo principal y deja un string de varios MB que el <img> tenia que volver a
// decodificar. El preview lo copia con un drawImage y listo.
// Cada pasada del preview creaba su propio lienzo de 1080x1920 —8,3 MB— y lo tiraba.
// Arrastrar el selector de color es una pasada cada 350 ms: en un telefono eso es
// pedir y soltar 8 MB sin parar. Ahora el que dibuja trae SU lienzo y lo reusa.
function acquireExportRenderCanvas(
    scratch: HTMLCanvasElement | null | undefined,
    width: number,
    height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = scratch ?? document.createElement('canvas');
    // Asignar el tamano —aunque no haya cambiado— es lo que devuelve el lienzo y su
    // contexto al estado inicial: sin transformacion, sin sombra, sin alpha y sin la
    // pila de save() que haya dejado la pasada anterior. Con un lienzo nuevo por vez
    // eso venia de arriba; reusandolo hay que pedirlo.
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('No se pudo inicializar el canvas del preview');
    }
    return { canvas, ctx };
}

export async function renderMatchExportPreviewCanvas(
    options: ExportPreviewRenderOptions,
    scratchCanvas?: HTMLCanvasElement | null,
): Promise<HTMLCanvasElement> {
    const {
        template,
        data,
        format,
        visualFamily,
        customizationState,
        previewColors,
        plateOptions,
        matchExportMode,
        matchExportLayout,
        lineupExportMode,
        lineupExportLayout = 'classic',
        standingsExportMode,
        dailyMatchesTimeMode = 'time',
    } = options;

    applyTypographyConfig(
        resolveTypographyConfig(
            getDefaultTypographyPresetId(visualFamily),
            {},
            resolveDesignTypographyFamilies(
                customizationState,
                resolveActiveTypographyContextId(template, matchExportLayout, matchExportMode)
            )
        )
    );
    setActiveElementDimensions(
        resolveActiveElementDimensions(
            customizationState,
            resolveActiveElementDimensionContextId(template, matchExportLayout, matchExportMode)
        )
    );

    try {
        const resolvedFormat = getResolvedMatchExportFormat(template, format, visualFamily, matchExportLayout, matchExportMode);
        const config = FORMATS.find((item) => item.value === resolvedFormat);
        if (!config) {
            throw new Error('Formato de preview no soportado');
        }

        const [, brandLogo] = await Promise.all([
            ensureExportFonts(),
            loadImage('/icon.png'),
        ]);

    const previewDefaults = previewColors
        ? {
            accentColor: previewColors.accentColor || DEFAULT_PALETTE.accent,
            bgColor: previewColors.bgColor || DEFAULT_PALETTE.bg,
            editorialGradientLeftColor: previewColors.editorialGradientLeftColor || '#df255c',
            editorialGradientRightColor: previewColors.editorialGradientRightColor || previewColors.accentColor || DEFAULT_PALETTE.accent,
        }
        : customizationState
        ? {
            accentColor: customizationState.previewAccent || DEFAULT_PALETTE.accent,
            bgColor: customizationState.previewSurface || DEFAULT_PALETTE.bg,
            editorialGradientLeftColor: customizationState.previewGradientFrom || '#df255c',
            editorialGradientRightColor: customizationState.previewGradientTo || customizationState.previewAccent || DEFAULT_PALETTE.accent,
        }
        : { ...DEFAULT_EXPORT_COLOR_DEFAULTS };

    const { canvas, ctx } = acquireExportRenderCanvas(scratchCanvas, config.width, config.height);

    const impactoColors: ImpactoColorOverrides = {
        field: previewColors?.impactoFieldColor,
        ink: previewColors?.impactoInkColor,
        bar: previewColors?.impactoBarColor,
        row: previewColors?.impactoRowColor,
    };
    const lineupColors: LineupColorOverrides = {
        field: previewColors?.lineupFieldColor,
        glow: previewColors?.lineupGlowColor,
        names: previewColors?.lineupNamesColor,
        ink: previewColors?.lineupInkColor,
        lines: previewColors?.lineupLinesColor,
    };

    const exportData = buildExportData(template, data, getDefaultTournamentName(template, data), findBestPresetByOffset(DEFAULT_TIMEZONE_OFFSET_MINUTES));

    if (template === 'matchStats') {
        const matchData = applyMatchExportMode(exportData as MatchStatsData, matchExportMode);

        if (matchExportLayout === 'editorial4x5') {
        const editorialMatchData: MatchStatsData = {
            ...matchData,
            editorialContextLabel: matchData.editorialContextLabel || '',
        };

            if (visualFamily === 'posterV3') {
                await drawPosterV3MatchEditorial(
                    ctx,
                    canvas,
                    editorialMatchData,
                    config,
                    previewDefaults.accentColor,
                    previewDefaults.bgColor,
                    brandLogo,
                    editorialMatchData.backgroundImage || ''
                );
            } else if (visualFamily === 'momentumV2') {
                await drawMomentumMatchEditorial(
                    ctx,
                    canvas,
                    editorialMatchData,
                    config,
                    previewDefaults.accentColor,
                    previewDefaults.bgColor,
                    brandLogo,
                    editorialMatchData.backgroundImage || '',
                    previewDefaults.editorialGradientLeftColor,
                    previewDefaults.editorialGradientRightColor
                );
            } else if (matchData.status === 'scheduled') {
                await drawMatchEditorialScheduleSplitHero(
                    ctx,
                    canvas,
                    editorialMatchData,
                    config,
                    previewDefaults.accentColor,
                    previewDefaults.bgColor,
                    brandLogo,
                    editorialMatchData.backgroundImage || '',
                    previewDefaults.editorialGradientLeftColor,
                    previewDefaults.editorialGradientRightColor
                );
            } else {
                await drawMatchEditorialResult(
                    ctx,
                    canvas,
                    editorialMatchData,
                    config,
                    previewDefaults.accentColor,
                    previewDefaults.bgColor,
                    brandLogo,
                    editorialMatchData.backgroundImage || '',
                    previewDefaults.editorialGradientLeftColor,
                    previewDefaults.editorialGradientRightColor
                );
            }
        } else if (visualFamily === 'posterV3') {
            await drawPosterV3MatchResult(ctx, canvas, matchData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'impactoV4') {
            await drawImpactoMatchResult(ctx, canvas, matchData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, impactoColors);
        } else if (visualFamily === 'fanV5') {
            await drawFanMatch(ctx, canvas, matchData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'momentumV2') {
            if (matchData.status === 'scheduled') {
                await drawMomentumMatchDayClassicSchedule(ctx, canvas, matchData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
            } else {
                await drawMomentumMatchResult(ctx, canvas, matchData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
            }
        } else {
            await drawMatchResult(ctx, canvas, matchData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, plateOptions);
        }
    } else if (template === 'dailyMatches') {
        if (visualFamily === 'posterV3') {
            await drawPosterV3DailyMatches(ctx, canvas, exportData as DailyMatchesData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, dailyMatchesTimeMode);
        } else if (visualFamily === 'impactoV4') {
            await drawImpactoDailyMatches(ctx, canvas, exportData as DailyMatchesData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, dailyMatchesTimeMode, impactoColors);
        } else if (visualFamily === 'fanV5') {
            await drawFanDailyMatches(ctx, canvas, exportData as DailyMatchesData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, dailyMatchesTimeMode);
        } else if (visualFamily === 'momentumV2') {
            await drawMomentumDailyMatches(ctx, canvas, exportData as DailyMatchesData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, dailyMatchesTimeMode);
        } else {
            await drawDailyMatches(ctx, canvas, exportData as DailyMatchesData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, dailyMatchesTimeMode);
        }
    } else if (template === 'standings') {
        const standingsData = exportData as StandingsData;
        const slide = buildStandingsSlides(standingsData, standingsExportMode)[0];
        if (!slide) throw new Error('No hay datos para preview de tabla');
        if (standingsData.variant === 'rankingPoster') {
            await drawRankingPoster(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, {
                glow: previewColors?.rankingGlowColor,
                panel: previewColors?.rankingPanelColor,
                gold: previewColors?.rankingGoldColor,
            });
        } else if (standingsData.variant === 'ladder') {
            await drawLadderPoster(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (standingsData.variant === 'palmares') {
            if (visualFamily === 'fanV5') {
                await drawFanPalmares(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
            } else {
                await drawPalmaresPoster(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
            }
        } else if (visualFamily === 'posterV3') {
            await drawPosterV3Standings(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'impactoV4') {
            await drawImpactoStandings(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, impactoColors);
        } else if (visualFamily === 'fanV5') {
            await drawFanStandings(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'momentumV2') {
            await drawMomentumStandings(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else {
            await drawStandings(ctx, canvas, standingsData, slide, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        }
    } else if (template === 'lineups') {
        if (visualFamily === 'posterV3') {
            await drawPosterV3Lineups(ctx, canvas, exportData as LineupsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, lineupExportMode);
        } else if (visualFamily === 'fanV5') {
            await drawFanLineups(ctx, canvas, exportData as LineupsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, lineupExportMode);
        } else if (visualFamily === 'momentumV2') {
            await drawMomentumLineups(ctx, canvas, exportData as LineupsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, lineupExportMode);
        } else {
            await drawG22BaseLineups(ctx, canvas, exportData as LineupsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, lineupExportMode, lineupExportLayout, lineupColors);
        }
    } else if (template === 'teamOfWeek') {
        await drawG22BaseTeamOfWeek(ctx, canvas, exportData as TeamOfWeekData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
    } else if (template === 'squad') {
        const squadData = exportData as SquadData;
        const firstPage = buildSquadPages(squadData, config)[0];
        if (!firstPage) throw new Error('No hay jugadores para preview de plantilla');

        if (visualFamily === 'posterV3') {
            await drawPosterV3Squad(ctx, canvas, squadData, firstPage, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'fanV5') {
            await drawFanSquad(ctx, canvas, squadData, firstPage, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'momentumV2') {
            await drawMomentumSquad(ctx, canvas, squadData, firstPage, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else {
            await drawG22BaseSquad(ctx, canvas, squadData, firstPage, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo, lineupColors);
        }
    } else if (template === 'playoffBracket') {
        if (visualFamily === 'posterV3') {
            await drawPosterV3PlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'momentumV2') {
            await drawMomentumPlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else {
            await drawPlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        }
    } else {
        if (visualFamily === 'posterV3') {
            await drawPosterV3PlayerStats(ctx, canvas, exportData as PlayerStatsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else if (visualFamily === 'momentumV2') {
            await drawMomentumPlayerStats(ctx, canvas, exportData as PlayerStatsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        } else {
            await drawPlayerStats(ctx, canvas, exportData as PlayerStatsData, config, previewDefaults.accentColor, previewDefaults.bgColor, brandLogo);
        }
    }

        return canvas;
    } finally {
        resetActiveElementDimensions();
    }
}

function parseManualMatchScore(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function getExportableStandingsRows(data: StandingsData): StandingsRowData[] {
    if (Array.isArray(data.rows) && data.rows.length > 0) {
        return data.rows.filter(Boolean);
    }

    return getExportableStandingsGroups(data).flatMap((group) => group.rows);
}

function getExportableStandingsGroups(data: StandingsData): StandingsGroupData[] {
    if (!Array.isArray(data.groups)) return [];

    return data.groups
        .map((group) => ({
            name: typeof group?.name === 'string' ? group.name.trim() : '',
            rows: Array.isArray(group?.rows) ? group.rows.filter(Boolean) : [],
        }))
        .filter((group) => group.rows.length > 0);
}

function getStandingsSlideMode(mode: StandingsExportMode): 'table' | 'groups' {
    return mode === 'table' ? 'table' : 'groups';
}

function getSafeStandingsGroupIndex(groups: StandingsGroupData[], selectedIndex: number): number {
    if (groups.length === 0) return 0;
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= groups.length) return 0;
    return selectedIndex;
}

function scopeStandingsDataForExport(data: StandingsData, mode: StandingsExportMode, selectedGroupIndex: number): StandingsData {
    if (mode !== 'singleGroup') return data;

    const groups = getExportableStandingsGroups(data);
    const group = groups[getSafeStandingsGroupIndex(groups, selectedGroupIndex)];
    if (!group) return data;

    const groupName = group.name.trim();
    const subtitleParts = [data.subtitle?.trim(), groupName].filter(Boolean);

    return {
        ...data,
        subtitle: subtitleParts.join(' - '),
        rows: group.rows,
        groups: [group],
    };
}

function buildStandingsSlides(data: StandingsData, mode: StandingsExportMode): StandingsSlideData[] {
    const rowsPerSlide = data.variant === 'ladder' ? LADDER_MAX_ROWS : MAX_STANDINGS_ROWS_PER_SLIDE;
    if (getStandingsSlideMode(mode) === 'groups') {
        const groups = getExportableStandingsGroups(data);
        if (groups.length > 0) {
            const draftSlides: Array<{ groups: StandingsSlideGroupData[]; totalRows: number }> = [];
            let currentGroups: StandingsSlideGroupData[] = [];
            let currentRowCount = 0;

            const pushCurrentSlide = () => {
                if (currentGroups.length === 0) return;
                draftSlides.push({ groups: currentGroups, totalRows: currentRowCount });
                currentGroups = [];
                currentRowCount = 0;
            };

            groups.forEach((group) => {
                let offset = 0;

                while (offset < group.rows.length) {
                    if (currentRowCount >= rowsPerSlide) {
                        pushCurrentSlide();
                    }

                    let availableRows = rowsPerSlide - currentRowCount;
                    const remainingRows = group.rows.length - offset;

                    if (currentRowCount > 0 && remainingRows <= rowsPerSlide && remainingRows > availableRows) {
                        pushCurrentSlide();
                        availableRows = rowsPerSlide;
                    }

                    const take = Math.min(remainingRows, availableRows);
                    currentGroups.push({
                        name: group.name,
                        rows: group.rows.slice(offset, offset + take),
                        continuedFromPrevious: offset > 0,
                        continuesOnNext: offset + take < group.rows.length,
                    });
                    currentRowCount += take;
                    offset += take;
                }
            });

            pushCurrentSlide();

            return draftSlides.map((slide, index, allSlides) => ({
                ...slide,
                pageNumber: index + 1,
                totalPages: allSlides.length,
            }));
        }
    }

    const rows = getExportableStandingsRows(data);
    if (rows.length === 0) return [];

    const slides: StandingsSlideData[] = [];
    for (let index = 0; index < rows.length; index += rowsPerSlide) {
        const chunk = rows.slice(index, index + rowsPerSlide);
        slides.push({
            groups: [{ name: '', rows: chunk }],
            pageNumber: slides.length + 1,
            totalPages: 0,
            totalRows: chunk.length,
        });
    }

    return slides.map((slide, index, allSlides) => ({
        ...slide,
        pageNumber: index + 1,
        totalPages: allSlides.length,
    }));
}

function buildStandingsSlideSubtitle(subtitle: string, slide: StandingsSlideData): string {
    const baseSubtitle = subtitle?.trim() || '';
    if (slide.totalPages <= 1) return baseSubtitle;
    if (!baseSubtitle) return `Pagina ${slide.pageNumber}/${slide.totalPages}`;
    return `${baseSubtitle} | ${slide.pageNumber}/${slide.totalPages}`;
}

function formatStandingsGroupLabel(group: StandingsSlideGroupData): string {
    const name = group.name.trim();
    if (!name) return '';
    return group.continuedFromPrevious ? `${name.toUpperCase()} (CONT.)` : name.toUpperCase();
}

async function downloadCanvas(canvas: HTMLCanvasElement, downloadName: string) {
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
            if (value) {
                resolve(value);
                return;
            }

            reject(new Error('No se pudo generar la imagen'));
        }, 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = downloadName;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function buildExportFilename(
    filename: string,
    template: ExportTemplate,
    format: ExportFormat,
    pageNumber?: number,
    totalPages?: number
) {
    const base = `${filename}-${template}-${format}`;
    if (!pageNumber || !totalPages || totalPages <= 1) {
        return `${base}.png`;
    }

    return `${base}-${String(pageNumber).padStart(2, '0')}.png`;
}

function wait(ms: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('No se pudo leer la imagen'));
        };
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
    });
}

function getBrowserOffsetMinutes(): number {
    if (typeof window === 'undefined') return DEFAULT_TIMEZONE_OFFSET_MINUTES;
    return -new Date().getTimezoneOffset();
}

function findBestPresetByOffset(offsetMinutes: number): ExportTimeZonePreset {
    return EXPORT_TIMEZONE_PRESETS.reduce((closest, current) => {
        const currentDistance = Math.abs(current.utcOffsetMinutes - offsetMinutes);
        const closestDistance = Math.abs(closest.utcOffsetMinutes - offsetMinutes);
        return currentDistance < closestDistance ? current : closest;
    }, EXPORT_TIMEZONE_PRESETS.find((preset) => preset.id === DEFAULT_TIMEZONE_PRESET_ID) || EXPORT_TIMEZONE_PRESETS[0]);
}

function buildDetectedTimeZoneLabel(offsetMinutes: number): string {
    const closestPreset = findBestPresetByOffset(offsetMinutes);
    const exactMatch = closestPreset.utcOffsetMinutes === offsetMinutes;
    if (exactMatch) return `${closestPreset.city}, ${closestPreset.country} (${formatUtcOffset(offsetMinutes)})`;
    return `UTC detectado ${formatUtcOffset(offsetMinutes)}`;
}

function formatUtcOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absolute = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
    const minutes = String(absolute % 60).padStart(2, '0');
    return `UTC${sign}${hours}:${minutes}`;
}

function formatRelativeOffset(deltaMinutes: number): string {
    if (deltaMinutes === 0) return 'igual que tu hora';

    const sign = deltaMinutes > 0 ? '+' : '-';
    const absolute = Math.abs(deltaMinutes);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;

    if (hours > 0 && minutes > 0) return `${sign}${hours} h ${minutes} min vs tu hora`;
    if (hours > 0) return `${sign}${hours} h vs tu hora`;
    return `${sign}${minutes} min vs tu hora`;
}

function formatDateInFixedOffset(
    value: Date,
    offsetMinutes: number,
    options: Intl.DateTimeFormatOptions
): string {
    const shiftedValue = new Date(value.getTime() + offsetMinutes * 60_000);
    return new Intl.DateTimeFormat('es-AR', {
        ...options,
        timeZone: 'UTC',
    }).format(shiftedValue);
}

function buildExportData(
    template: ExportTemplate,
    data: ExportData,
    customTournamentName: string,
    timeZonePreset: ExportTimeZonePreset
): ExportData {
    const tournamentName = customTournamentName.trim();

    if (template === 'standings') {
        const standingsData = data as StandingsData;
        return {
            ...standingsData,
            title: tournamentName || standingsData.title,
        };
    }

    if (template === 'playoffBracket') {
        const bracketData = data as PlayoffBracketData;
        return {
            ...bracketData,
            title: tournamentName || bracketData.title,
        };
    }

    if (template === 'squad') {
        const squadData = data as SquadData;
        return {
            ...squadData,
            tournament: tournamentName || squadData.tournament,
        };
    }

    if (template === 'teamOfWeek') {
        const teamOfWeekData = data as TeamOfWeekData;
        return {
            ...teamOfWeekData,
            tournament: tournamentName || teamOfWeekData.tournament,
        };
    }

    if (template === 'matchStats') {
        const matchData = data as MatchStatsData;
        const nextData: MatchStatsData = {
            ...matchData,
            tournament: tournamentName || matchData.tournament,
        };

        const kickoffAt = toExportDate(matchData.kickoffAt);
        if (!kickoffAt) return nextData;

        return {
            ...nextData,
            date: formatDateInFixedOffset(kickoffAt, timeZonePreset.utcOffsetMinutes, {}),
            time: formatDateInFixedOffset(kickoffAt, timeZonePreset.utcOffsetMinutes, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }),
        };
    }

    if (template === 'lineups') {
        const lineupsData = data as LineupsData;
        const nextData: LineupsData = {
            ...lineupsData,
            tournament: tournamentName || lineupsData.tournament,
        };
        const kickoffAt = toExportDate(lineupsData.kickoffAt);
        if (!kickoffAt) return nextData;

        // La formacion escribe "VIE 28 AGO | 20:30 HS": el dia de semana sale de la
        // hora de salida en la zona horaria elegida, no del UTC.
        return {
            ...nextData,
            date: formatDateInFixedOffset(kickoffAt, timeZonePreset.utcOffsetMinutes, { weekday: 'short', day: '2-digit', month: 'short' }),
            time: formatDateInFixedOffset(kickoffAt, timeZonePreset.utcOffsetMinutes, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }),
        };
    }

    if (template === 'dailyMatches') {
        const matchesData = data as DailyMatchesData;
        return {
            ...matchesData,
            tournament: tournamentName || matchesData.tournament,
            matches: matchesData.matches.map((match) => applyTimeZoneToDailyMatch(match, timeZonePreset.utcOffsetMinutes)),
        };
    }

    return data;
}

function toExportDate(value: ExportDateValue | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        const date = new Date(value > 1_000_000_000_000 ? value : value * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
        const numericValue = Number(trimmed);
        const date = new Date(numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
}

function applyTimeZoneToDailyMatch(
    match: DailyMatchesData['matches'][number],
    utcOffsetMinutes: number
): DailyMatchesData['matches'][number] {
    const kickoffAt = toExportDate(match.kickoffAt);
    if (!kickoffAt) return match;

    const timeOnly = formatDateInFixedOffset(kickoffAt, utcOffsetMinutes, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const dayMonth = formatDateInFixedOffset(kickoffAt, utcOffsetMinutes, {
        day: '2-digit',
        month: '2-digit',
    });

    return {
        ...match,
        time: match.status === 'scheduled' ? (shouldAppendDateToMatchTime(match.time) ? `${timeOnly} ${dayMonth}` : timeOnly) : match.time,
        dateLabel: match.dateLabel
            ? formatDateInFixedOffset(kickoffAt, utcOffsetMinutes, {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
            })
            : match.dateLabel,
    };
}

function shouldAppendDateToMatchTime(value: string): boolean {
    return /\d{1,2}:\d{2}.*\d{1,2}[\/.-]\d{1,2}/.test(value);
}

async function loadLocalExportFonts(): Promise<void> {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !('fonts' in document)) return;
    if (document.fonts.check('900 24px "dharma-gothic-e"') || document.fonts.check('800 24px "dharma-gothic-e"')) return;
    if (localExportFontsPromise) {
        await localExportFontsPromise;
        return;
    }

    localExportFontsPromise = Promise.all(LOCAL_EXPORT_FONTS.map((font) => tryLoadLocalExportFont(font))).then(() => undefined);
    await localExportFontsPromise;
}

async function tryLoadLocalExportFont(font: LocalExportFont): Promise<void> {
    const fontDescriptor = `${font.weight} 24px "${font.family}"`;
    if (document.fonts.check(fontDescriptor)) return;

    for (const source of font.sources) {
        try {
            const nextFont = new FontFace(font.family, `url("${source}")`, {
                weight: font.weight,
                style: font.style || 'normal',
            });
            const loadedFont = await nextFont.load();
            document.fonts.add(loadedFont);
            return;
        } catch {
            // Try the next available source path.
        }
    }
}

// Registro robusto de Articulat CF (no hay versión Typekit; SOLO el .otf local).
// No se puede usar document.fonts.check() como guarda: para una familia aún NO registrada
// devuelve true (asume fallback del sistema) y el cargador genérico haría early-return.
// Por eso se verifica iterando los FontFace ya agregados.
let articulatFontPromise: Promise<void> | null = null;
async function ensureArticulatFont(): Promise<void> {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !('fonts' in document)) return;
    let already = false;
    document.fonts.forEach((face) => { if (face.family === 'Articulat CF') already = true; });
    if (already) return;
    if (articulatFontPromise) {
        await articulatFontPromise;
        return;
    }
    articulatFontPromise = (async () => {
        try {
            const face = new FontFace('Articulat CF', 'url("/fonts/ArticulatCF-HeavyOblique.otf")', { weight: '900', style: 'normal' });
            await face.load();
            document.fonts.add(face);
        } catch {
            // Si falla la carga, el render cae al fallback de FONT_ARTICULAT sin romper.
        }
    })();
    await articulatFontPromise;
}

export async function ensureExportFonts(): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
        await loadLocalExportFonts();
        await ensureArticulatFont();
        await Promise.allSettled([
            document.fonts.load('900 24px "dharma-gothic-e"'),
            document.fonts.load('800 24px "dharma-gothic-e"'),
            document.fonts.load('900 24px "dharma-gothic-c"'),
            document.fonts.load('900 24px "dharma-gothic-m"'),
            document.fonts.load('800 24px "dharma-gothic-m"'),
            document.fonts.load('800 24px "G22 Dharma Gothic"'),
            document.fonts.load('900 24px "Articulat CF"'),
            document.fonts.load('400 24px "Playfair Display"'),
            document.fonts.load('500 24px "Playfair Display"'),
            document.fonts.load('900 24px "Playfair Display"'),
            document.fonts.load('800 24px "Dharma Gothic Expanded Heavy"'),
            document.fonts.load('800 24px "Dharma Gothic E Heavy"'),
            document.fonts.load('700 24px "Dharma Gothic Expanded"'),
            document.fonts.load('700 24px "Dharma Gothic E"'),
            document.fonts.load(`700 24px ${FONT_BODY}`),
            document.fonts.load(`900 24px ${FONT_OUTFIT_BLACK}`),
            document.fonts.load('700 24px Inter'),
            document.fonts.load('700 24px "Bebas Neue"'),
            document.fonts.load('700 24px Tangerine'),
            document.fonts.load('700 24px Inconsolata'),
            document.fonts.load('700 24px Cantarell'),
            document.fonts.load('700 24px "Roboto Mono"'),
            document.fonts.load('700 24px Rancho'),
            document.fonts.load(`${getActiveTypographyWeight('body', '700')} 24px ${FONT_BODY}`),
            document.fonts.load(`${getActiveTypographyWeight('display', '900')} 24px ${FONT_OUTFIT_BLACK}`),
            document.fonts.load(`${getActiveTypographyWeight('mono', '700')} 24px ${FONT_MONO}`),
            document.fonts.load(`${getActiveTypographyWeight('editorial', '800')} 24px ${FONT_EDITORIAL}`),
            document.fonts.load(`${getActiveTypographyWeight('score', '900')} 24px ${FONT_EDITORIAL_SCORE}`),
            document.fonts.ready,
        ]);
    } catch {
        // Ignore font loading issues.
    }
}

function isImageSource(value?: string | null): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed.startsWith('<svg')
        || trimmed.startsWith('data:image/')
        || trimmed.startsWith('blob:')
        || trimmed.startsWith('//')
        || trimmed.startsWith('/')
        || trimmed.startsWith('./')
        || trimmed.startsWith('../')
        || /^https?:\/\//.test(trimmed)
        || /\.(svg|png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(trimmed);
}

function normalizeImageSource(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
    if (trimmed.startsWith('//')) {
        try {
            return new URL(`${window.location.protocol}${trimmed}`).toString();
        } catch {
            return trimmed;
        }
    }
    if (trimmed.startsWith('/')) {
        try {
            return new URL(trimmed, window.location.origin).toString();
        } catch {
            return trimmed;
        }
    }
    if (!trimmed.startsWith('data:') && !trimmed.startsWith('blob:') && !/^https?:\/\//.test(trimmed)) {
        try {
            return new URL(trimmed, `${window.location.origin}/`).toString();
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

const EXPORT_IMAGE_LOAD_TIMEOUT_MS = 8000;

function buildProxyUrl(url: string): string {
    if (typeof window === 'undefined') return url;

    const proxyUrl = new URL('/api/assets/team-logo', window.location.origin);
    proxyUrl.searchParams.set('key', 'export-image');
    proxyUrl.searchParams.set('fallback', url);
    return proxyUrl.toString();
}

type TournamentLogoSourceData = {
    tournamentLogo?: string | null;
    tournamentId?: string | number | null;
    tournamentUrl?: string | null;
    tournament?: string | null;
    title?: string | null;
};

function getTournamentLogoImageSource(data: TournamentLogoSourceData): string {
    const directLogo = typeof data.tournamentLogo === 'string' ? data.tournamentLogo.trim() : '';
    if (directLogo) return directLogo;
    if (typeof window === 'undefined') return '';

    const tournamentKey = [data.tournamentId, data.tournamentUrl]
        .map((value) => (value == null ? '' : String(value).trim()))
        .find(Boolean);
    if (!tournamentKey) return '';

    const proxyUrl = new URL('/api/assets/team-logo', window.location.origin);
    proxyUrl.searchParams.set('key', tournamentKey);
    proxyUrl.searchParams.set('entity', 'tournament');
    // Logo real o nada. Sin este flag el proxy responde 200 con un escudo generico y
    // las INICIALES del torneo, y el poster lo dibuja como si fuera el logo de la
    // competencia: el export termina publicado con letras en lugar del logo. El resto
    // de la app sigue usando ese fallback (una lista con un hueco es peor que un
    // placeholder); acá no, porque acá la imagen se publica.
    proxyUrl.searchParams.set('noFallback', '1');

    const label = (data.tournament || data.title || '').trim();
    if (label) {
        proxyUrl.searchParams.set('name', label);
    }

    return proxyUrl.toString();
}

// Un escudo se pide UNA vez por sesion. Sin esto cada pasada del preview volvia a crear
// un <img> por escudo y a esperar su decodificacion; con el modal abierto y veinte
// filas en la tabla, eso era lo que se sentia como "trabado".
const exportImageCache = new Map<string, Promise<HTMLImageElement | null>>();

// Ancho que se le pide al proxy para escudos y logos: el mas grande que dibuja una
// pieza anda por los 280 px sobre 1080, asi que 512 sobra y evita decodificar
// originales de 2000 px. Solo aplica a URLs del proxy resueltas por la app (escudos y
// logos por construccion); el `fallback` externo del export no se toca, porque por
// ahi tambien puede llegar una foto de fondo que no hay que achicar.
const EXPORT_CREST_PROXY_WIDTH = 512;

function withExportCrestWidth(url: string): string {
    if (typeof window === 'undefined') return url;
    try {
        const parsed = new URL(url);
        if (parsed.origin !== window.location.origin || parsed.pathname !== '/api/assets/team-logo') return url;
        if (parsed.searchParams.has('w') || parsed.searchParams.has('fallback')) return url;
        parsed.searchParams.set('w', String(EXPORT_CREST_PROXY_WIDTH));
        return parsed.toString();
    } catch {
        return url;
    }
}

export async function loadImage(url: string): Promise<HTMLImageElement | null> {
    if (!isImageSource(url)) return null;
    const normalized = normalizeImageSource(url);
    const sameOrigin = typeof window !== 'undefined' && normalized.startsWith(window.location.origin);
    const sources = (normalized.startsWith('http') && !sameOrigin ? [buildProxyUrl(normalized), normalized] : [normalized])
        .map(withExportCrestWidth);
    const cacheKey = sources[0];
    const cached = exportImageCache.get(cacheKey);
    if (cached) return cached;

    const pending = loadImageFromSources(sources).then((image) => {
        // Un fallo (timeout, 404 transitorio) no queda pegado: la proxima pasada reintenta.
        if (!image) exportImageCache.delete(cacheKey);
        return image;
    });
    exportImageCache.set(cacheKey, pending);
    return pending;
}

function loadImageFromSources(sources: string[]): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const tryLoad = (index: number) => {
            if (index >= sources.length) {
                resolve(null);
                return;
            }
            const image = new Image();
            const timeoutId = window.setTimeout(() => {
                image.onload = null;
                image.onerror = null;
                tryLoad(index + 1);
            }, EXPORT_IMAGE_LOAD_TIMEOUT_MS);
            const clearImageTimeout = () => window.clearTimeout(timeoutId);
            image.crossOrigin = 'anonymous';
            image.referrerPolicy = 'no-referrer';
            image.onload = () => {
                clearImageTimeout();
                resolve(image);
            };
            image.onerror = () => {
                clearImageTimeout();
                tryLoad(index + 1);
            };
            image.src = sources[index];
        };
        tryLoad(0);
    });
}

export function getContrastColor(hex: string) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#0f172a';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#0f172a' : '#ffffff';
}

export function hexToRGBA(hex: string, alpha: number) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHexColors(colorA: string, colorB: string, ratio: number) {
    if (!/^#[0-9a-f]{6}$/i.test(colorA) || !/^#[0-9a-f]{6}$/i.test(colorB)) {
        return colorA;
    }

    const weight = Math.max(0, Math.min(1, ratio));
    const rA = parseInt(colorA.slice(1, 3), 16);
    const gA = parseInt(colorA.slice(3, 5), 16);
    const bA = parseInt(colorA.slice(5, 7), 16);
    const rB = parseInt(colorB.slice(1, 3), 16);
    const gB = parseInt(colorB.slice(3, 5), 16);
    const bB = parseInt(colorB.slice(5, 7), 16);

    const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
    const r = rA + (rB - rA) * weight;
    const g = gA + (gB - gA) * weight;
    const b = bA + (bB - bA) * weight;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getSafeArea(canvas: HTMLCanvasElement): SafeArea {
    const isStory = canvas.height > 1500;
    return { top: isStory ? 320 : 220, bottom: canvas.height - (isStory ? 220 : 150), centerX: canvas.width / 2, width: canvas.width, height: canvas.height };
}

export function getTextColor(isDark: boolean) {
    return isDark ? '#f2f2f2' : '#0f172a';
}

export function getMutedColor(isDark: boolean, alpha: number) {
    return isDark ? `rgba(242,242,242,${alpha})` : `rgba(15,23,42,${alpha})`;
}

function getInitials(label: string) {
    const words = label.split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map((word) => word[0]).join('') || '?').toUpperCase();
}

function getFallbackLogoText(rawLogo: string | undefined, label: string) {
    const trimmed = rawLogo?.trim();
    if (trimmed && !isImageSource(trimmed) && trimmed.length <= 4) return trimmed;
    return getInitials(label);
}

function setFittedFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, weight: string, size: number, family: string, minSize: number) {
    const resolvedWeight = resolveCanvasFontWeight(family, weight);
    let currentSize = size;
    while (currentSize > minSize) {
        ctx.font = `${resolvedWeight} ${currentSize}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        currentSize -= 2;
    }
    return currentSize;
}

function truncateTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;

    let current = text.trim();
    while (current.length > 1 && ctx.measureText(`${current}...`).width > maxWidth) {
        current = current.slice(0, -1).trimEnd();
    }

    return current.length > 1 ? `${current}...` : text;
}

function fitTextLinesToWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    weight: string,
    size: number,
    family: string,
    minSize: number,
    maxLines = 2,
) {
    const resolvedWeight = resolveCanvasFontWeight(family, weight);
    let currentSize = size;
    let lines = [text];

    while (currentSize >= minSize) {
        ctx.font = `${resolvedWeight} ${currentSize}px ${family}`;
        const words = text.split(/\s+/).filter(Boolean);
        lines = [];
        let currentLine = '';

        words.forEach((word) => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (!currentLine || ctx.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        });

        if (currentLine) lines.push(currentLine);
        if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
            return { lines, size: currentSize };
        }

        currentSize -= 2;
    }

    ctx.font = `${resolvedWeight} ${minSize}px ${family}`;
    return { lines: [truncateTextToWidth(ctx, text, maxWidth)], size: minSize };
}

function getSharedFittedFontSize(
    ctx: CanvasRenderingContext2D,
    items: Array<{ text: string; maxWidth: number }>,
    weight: string,
    size: number,
    family: string,
    minSize: number
) {
    const resolvedWeight = resolveCanvasFontWeight(family, weight);
    let currentSize = size;

    while (currentSize > minSize) {
        ctx.font = `${resolvedWeight} ${currentSize}px ${family}`;
        const fitsAll = items.every((item) => ctx.measureText(item.text).width <= item.maxWidth);
        if (fitsAll) break;
        currentSize -= 1;
    }

    return currentSize;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function drawStandingsTeamName(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    centerY: number,
    fontSize: number
) {
    const teamName = text.trim().toUpperCase();
    ctx.font = `900 ${fontSize}px ${FONT_OUTFIT_BLACK}`;
    ctx.fillText(teamName, x, centerY + 1);
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, bgColor: string, accentColor: string, isDark: boolean) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const topGlow = ctx.createRadialGradient(canvas.width * 0.5, 0, 0, canvas.width * 0.5, 0, canvas.height * 0.85);
    topGlow.addColorStop(0, hexToRGBA(accentColor, isDark ? 0.28 : 0.18));
    topGlow.addColorStop(0.42, hexToRGBA(accentColor, isDark ? 0.08 : 0.05));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 72) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 72) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

export function drawSurfacePanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, isDark: boolean) {
    ctx.save();
    ctx.shadowColor = isDark ? 'rgba(0,0,0,0.34)' : 'rgba(15,23,42,0.12)';
    ctx.shadowBlur = isDark ? 46 : 36;
    ctx.shadowOffsetY = isDark ? 22 : 18;
    ctx.fillStyle = isDark ? 'rgba(18,18,20,0.84)' : 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.stroke();
    ctx.restore();
}

function getContainedImagePlacement(
    image: HTMLImageElement,
    centerX: number,
    centerY: number,
    boxWidth: number,
    boxHeight: number,
    paddingX: number,
    paddingY = paddingX
) {
    const sourceWidth = image.naturalWidth || image.width || boxWidth;
    const sourceHeight = image.naturalHeight || image.height || boxHeight;
    const safeSourceWidth = Math.max(sourceWidth, 1);
    const safeSourceHeight = Math.max(sourceHeight, 1);
    const innerWidth = Math.max(1, boxWidth - paddingX * 2);
    const innerHeight = Math.max(1, boxHeight - paddingY * 2);
    const scale = Math.min(innerWidth / safeSourceWidth, innerHeight / safeSourceHeight);
    const drawWidth = safeSourceWidth * scale;
    const drawHeight = safeSourceHeight * scale;

    return {
        x: centerX - drawWidth / 2,
        y: centerY - drawHeight / 2,
        width: drawWidth,
        height: drawHeight,
    };
}

type OpaqueImageBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

const OPAQUE_IMAGE_BOUNDS_CACHE = typeof WeakMap !== 'undefined'
    ? new WeakMap<HTMLImageElement, OpaqueImageBounds | null>()
    : null;

function getOpaqueImageBounds(image: HTMLImageElement): OpaqueImageBounds | null {
    if (typeof document === 'undefined') return null;

    const cached = OPAQUE_IMAGE_BOUNDS_CACHE?.get(image);
    if (cached !== undefined) {
        return cached;
    }

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
        OPAQUE_IMAGE_BOUNDS_CACHE?.set(image, null);
        return null;
    }

    try {
        const maxSampleSide = 512;
        const sampleScale = Math.min(1, maxSampleSide / Math.max(sourceWidth, sourceHeight));
        const sampleWidth = Math.max(1, Math.round(sourceWidth * sampleScale));
        const sampleHeight = Math.max(1, Math.round(sourceHeight * sampleScale));
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = sampleWidth;
        sampleCanvas.height = sampleHeight;

        const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        if (!sampleCtx) {
            OPAQUE_IMAGE_BOUNDS_CACHE?.set(image, null);
            return null;
        }

        sampleCtx.imageSmoothingEnabled = true;
        sampleCtx.imageSmoothingQuality = 'high';
        sampleCtx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

        const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        const alphaThreshold = 10;
        let minX = sampleWidth;
        let minY = sampleHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < sampleHeight; y += 1) {
            for (let x = 0; x < sampleWidth; x += 1) {
                const alpha = imageData[(y * sampleWidth + x) * 4 + 3];
                if (alpha <= alphaThreshold) continue;

                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }

        if (maxX < 0 || maxY < 0) {
            OPAQUE_IMAGE_BOUNDS_CACHE?.set(image, null);
            return null;
        }

        const bounds = {
            left: minX / sampleWidth,
            top: minY / sampleHeight,
            right: (maxX + 1) / sampleWidth,
            bottom: (maxY + 1) / sampleHeight,
        };
        OPAQUE_IMAGE_BOUNDS_CACHE?.set(image, bounds);
        return bounds;
    } catch {
        OPAQUE_IMAGE_BOUNDS_CACHE?.set(image, null);
        return null;
    }
}

function getContainedOpaquePlacement(
    image: HTMLImageElement,
    centerX: number,
    centerY: number,
    boxWidth: number,
    boxHeight: number,
    paddingX: number,
    paddingY = paddingX
) {
    const placement = getContainedImagePlacement(image, centerX, centerY, boxWidth, boxHeight, paddingX, paddingY);
    const bounds = getOpaqueImageBounds(image);

    if (!bounds) {
        return {
            placement,
            visibleLeft: placement.x,
            visibleTop: placement.y,
            visibleRight: placement.x + placement.width,
            visibleBottom: placement.y + placement.height,
        };
    }

    return {
        placement,
        visibleLeft: placement.x + placement.width * bounds.left,
        visibleTop: placement.y + placement.height * bounds.top,
        visibleRight: placement.x + placement.width * bounds.right,
        visibleBottom: placement.y + placement.height * bounds.bottom,
    };
}

export function drawLogoBadge(ctx: CanvasRenderingContext2D, options: LogoBadgeOptions) {
    const { x, y, size, img, label, rawLogo, isDark, showFrame = true } = options;
    const shouldDrawFrame = showFrame || !img;
    ctx.save();

    if (shouldDrawFrame) {
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)';
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    if (img) {
        const inset = showFrame ? Math.max(6, size * 0.18) : Math.max(2, size * 0.06);
        const placement = getContainedImagePlacement(img, x, y, size, size, inset);
        if (showFrame) {
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.clip();
        }
        ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
    } else {
        const isGlyph = rawLogo?.trim() && !isImageSource(rawLogo) && rawLogo.trim().length <= 4;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = getTextColor(isDark);
        ctx.font = `700 ${isGlyph ? Math.round(size * 0.44) : Math.round(size * 0.24)}px ${FONT_BODY}`;
        ctx.fillText(getFallbackLogoText(rawLogo, label), x, y + 1);
    }

    ctx.restore();
}

function drawOverflowCrest(ctx: CanvasRenderingContext2D, options: OverflowCrestOptions) {
    const { x, y, width, height, img, label, rawLogo, isDark, showFrame = true } = options;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (img) {
        const inset = Math.max(6, Math.min(width, height) * (showFrame ? 0.11 : 0.08));
        const placement = getContainedImagePlacement(img, x, y, width, height, inset);

        ctx.shadowColor = isDark ? 'rgba(0,0,0,0.32)' : 'rgba(15,23,42,0.18)';
        ctx.shadowBlur = Math.max(8, Math.round(Math.max(width, height) * 0.12));
        ctx.shadowOffsetY = Math.max(2, Math.round(height * 0.06));
        ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
        ctx.restore();
        return;
    }

    const fallbackRadius = Math.min(width, height) * 0.34;
    if (showFrame) {
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, fallbackRadius);
        ctx.fill();
        ctx.stroke();
    }

    const isGlyph = rawLogo?.trim() && !isImageSource(rawLogo) && rawLogo.trim().length <= 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getTextColor(isDark);
    ctx.font = `800 ${Math.round((isGlyph ? height : Math.min(width, height)) * (isGlyph ? 0.4 : 0.24))}px ${FONT_BODY}`;
    ctx.fillText(getFallbackLogoText(rawLogo, label), x, y + 1);
    ctx.restore();
}

function drawEditorialCrestStroke(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    img: HTMLImageElement | null,
    strokeWidth = 5,
    color = '#ffffff'
) {
    if (!img || typeof document === 'undefined') return;

    const inset = Math.max(strokeWidth + 4, Math.min(width, height) * 0.08);
    const placement = getContainedImagePlacement(img, x, y, width, height, inset);
    const drawWidth = placement.width;
    const drawHeight = placement.height;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = Math.max(1, Math.ceil(drawWidth + strokeWidth * 2));
    maskCanvas.height = Math.max(1, Math.ceil(drawHeight + strokeWidth * 2));

    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    // Build an alpha mask so the outline follows the transparent edges of the crest.
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = 'high';
    maskCtx.drawImage(img, strokeWidth, strokeWidth, drawWidth, drawHeight);
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.fillStyle = color;
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    const originX = placement.x - strokeWidth;
    const originY = placement.y - strokeWidth;
    const steps = 24;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.98;

    for (let index = 0; index < steps; index += 1) {
        const angle = (Math.PI * 2 * index) / steps;
        const offsetX = Math.cos(angle) * strokeWidth;
        const offsetY = Math.sin(angle) * strokeWidth;
        ctx.drawImage(maskCanvas, originX + offsetX, originY + offsetY, maskCanvas.width, maskCanvas.height);
    }

    ctx.restore();
}

export function drawCenteredPill(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    y: number,
    text: string,
    fill: string,
    textColor: string,
    font: string,
    horizontalPadding: number,
    height: number
) {
    ctx.save();
    ctx.font = font;
    const width = ctx.measureText(text).width + horizontalPadding * 2;
    const resolvedWidth = Math.max(width, scaleElementSize('title', width, width));
    const resolvedHeight = Math.max(height, Math.min(scaleElementSize('title', height, height), height * 1.5));
    const resolvedY = offsetElementY('title', y);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(centerX - resolvedWidth / 2, resolvedY, resolvedWidth, resolvedHeight, resolvedHeight / 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, resolvedY + resolvedHeight / 2 + 1);
    ctx.restore();
}

function drawStandingsLabelPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    centerY: number,
    text: string,
    color: string,
    isDark: boolean,
    rowHeight: number,
    maxWidth: number,
) {
    const label = text.trim().toUpperCase();
    if (!label || maxWidth <= 42) return;

    const fontSize = Math.max(10, Math.min(14, Math.round(rowHeight * 0.24)));
    const pillHeight = Math.max(18, Math.min(24, Math.round(rowHeight * 0.44)));
    const horizontalPadding = Math.max(10, Math.round(rowHeight * 0.24));

    ctx.save();
    ctx.font = `800 ${fontSize}px ${FONT_BODY}`;
    const safeText = truncateTextToWidth(ctx, label, Math.max(24, maxWidth - horizontalPadding * 2));
    const pillWidth = Math.min(maxWidth, ctx.measureText(safeText).width + horizontalPadding * 2);
    const pillY = centerY - pillHeight / 2;

    ctx.fillStyle = hexToRGBA(color, isDark ? 0.2 : 0.12);
    ctx.strokeStyle = hexToRGBA(color, isDark ? 0.36 : 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, pillY, pillWidth, pillHeight, pillHeight / 2);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(safeText, x + pillWidth / 2, centerY + 1);
    ctx.restore();
}

function collectStandingsLegendEntries(rows: StandingsRowData[], fallbackColor: string) {
    const entries = new Map<string, StandingsLegendEntry>();

    rows.forEach((row) => {
        const label = row.labelName?.trim();
        if (!label) return;

        const color = row.zoneColor || fallbackColor;
        const key = `${label.toLowerCase()}|${color.toLowerCase()}`;

        if (!entries.has(key)) {
            entries.set(key, {
                key,
                label,
                color,
            });
        }
    });

    return Array.from(entries.values());
}

function buildStandingsLegendLayout(
    ctx: CanvasRenderingContext2D,
    items: StandingsLegendEntry[],
    maxWidth: number,
    isStory: boolean,
) {
    if (items.length === 0) {
        return {
            rows: [] as Array<Array<StandingsLegendEntry & { width: number }>>,
            chipHeight: 0,
            titleHeight: 0,
            totalHeight: 0,
        };
    }

    const chipHeight = isStory ? 30 : 26;
    const horizontalPadding = isStory ? 14 : 12;
    const gapX = isStory ? 12 : 10;
    const gapY = isStory ? 12 : 10;
    const titleHeight = isStory ? 18 : 16;

    ctx.save();
    ctx.font = `800 ${isStory ? 13 : 12}px ${FONT_BODY}`;

    const rows: Array<Array<StandingsLegendEntry & { width: number }>> = [];
    let currentRow: Array<StandingsLegendEntry & { width: number }> = [];
    let currentWidth = 0;

    items.forEach((item) => {
        const label = item.label.trim().toUpperCase();
        const textWidth = ctx.measureText(label).width;
        const chipWidth = Math.max(82, Math.min(maxWidth, textWidth + horizontalPadding * 2));
        const nextWidth = currentRow.length === 0 ? chipWidth : currentWidth + gapX + chipWidth;

        if (currentRow.length > 0 && nextWidth > maxWidth) {
            rows.push(currentRow);
            currentRow = [{ ...item, width: chipWidth }];
            currentWidth = chipWidth;
            return;
        }

        currentRow.push({ ...item, width: chipWidth });
        currentWidth = nextWidth;
    });

    if (currentRow.length > 0) rows.push(currentRow);
    ctx.restore();

    const totalHeight = titleHeight + 10 + rows.length * chipHeight + Math.max(0, rows.length - 1) * gapY;

    return {
        rows,
        chipHeight,
        titleHeight,
        totalHeight,
    };
}

function drawStandingsLegend(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    maxWidth: number,
    items: StandingsLegendEntry[],
    isDark: boolean,
    isStory: boolean,
) {
    const layout = buildStandingsLegendLayout(ctx, items, maxWidth, isStory);
    if (layout.rows.length === 0) return 0;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = getMutedColor(isDark, 0.72);
    ctx.font = `800 ${isStory ? 14 : 12}px ${FONT_BODY}`;
    ctx.fillText('LEYENDA', x, y + layout.titleHeight);
    ctx.restore();

    let cursorY = y + layout.titleHeight + 10 + layout.chipHeight / 2;
    const gapX = isStory ? 12 : 10;
    const gapY = isStory ? 12 : 10;

    layout.rows.forEach((row) => {
        let cursorX = x;

        row.forEach((item) => {
            drawStandingsLabelPill(
                ctx,
                cursorX,
                cursorY,
                item.label,
                item.color,
                isDark,
                layout.chipHeight,
                item.width,
            );
            cursorX += item.width + gapX;
        });

        cursorY += layout.chipHeight + gapY;
    });

    return layout.totalHeight;
}

function drawTournamentRibbon(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    label: string,
    logoImg: HTMLImageElement | null,
    rawLogo: string | undefined,
    accentColor: string,
    isDark: boolean,
    y: number,
    fontSize: number,
    options: TournamentRibbonOptions = {}
) {
    if (!label && !logoImg) return;
    const baseLogoSize = logoImg ? fontSize + 12 : 0;
    const scaledLogoSize = logoImg ? scaleElementSize('tournamentLogo', baseLogoSize, options.logoDefaultSize ?? baseLogoSize) : 0;
    const maxWidth = Math.max(80, Math.min(options.maxWidth ?? canvas.width - 96, canvas.width - 48));
    const logoSize = logoImg
        ? Math.max(18, Math.min(scaledLogoSize, options.maxLogoSize ?? scaledLogoSize, maxWidth * 0.24))
        : 0;
    const resolvedLogoY = offsetElementY('tournamentLogo', y);
    const resolvedLabelY = y;
    const gap = logoImg ? 12 : 0;
    ctx.save();
    const scaledFontSize = scaleElementSize('title', fontSize, options.titleDefaultSize ?? fontSize);
    const resolvedFontSize = Math.max(
        options.minFontSize ?? 10,
        Math.min(scaledFontSize, options.maxFontSize ?? scaledFontSize)
    );
    const labelText = label ? label.toUpperCase() : '';
    const maxLabelWidth = Math.max(32, maxWidth - logoSize - gap);
    if (labelText) {
        setFittedFont(ctx, labelText, maxLabelWidth, '700', resolvedFontSize, FONT_BODY, options.minFontSize ?? 10);
    } else {
        ctx.font = `700 ${resolvedFontSize}px ${FONT_BODY}`;
    }
    const safeLabelText = labelText ? truncateTextToWidth(ctx, labelText, maxLabelWidth) : '';
    const labelWidth = safeLabelText ? ctx.measureText(safeLabelText).width : 0;
    const totalWidth = logoSize + gap + labelWidth;
    let currentX = canvas.width / 2 - totalWidth / 2;
    if (logoImg) {
        drawLogoBadge(ctx, {
            x: currentX + logoSize / 2,
            y: resolvedLogoY - 4,
            size: logoSize,
            img: logoImg,
            label: label || 'Torneo',
            rawLogo,
            isDark,
            showFrame: options.showLogoFrame,
        });
        currentX += logoSize + gap;
    }
    if (safeLabelText) {
        ctx.fillStyle = accentColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(safeLabelText, currentX, resolvedLabelY);
    }
    ctx.restore();
}

function getBrandFooterMetrics(canvas: HTMLCanvasElement) {
    const isStory = canvas.height > 1500;
    const labelY = canvas.height - (isStory ? 126 : 108);
    const wordmarkY = labelY + (isStory ? 48 : 42);
    const iconSize = isStory ? 40 : 34;
    const gap = 12;
    const topLine = labelY - (isStory ? 18 : 16);
    return { isStory, labelY, wordmarkY, iconSize, gap, topLine };
}

export function drawBrandFooter(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, brandLogo: HTMLImageElement | null, isDark: boolean) {
    const { isStory, labelY, wordmarkY, iconSize, gap } = getBrandFooterMetrics(canvas);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = getMutedColor(isDark, 0.66);
    ctx.font = `600 ${isStory ? 18 : 16}px ${FONT_BODY}`;
    ctx.fillText('Info aportada por:', canvas.width / 2, labelY);
    ctx.font = `800 ${isStory ? 28 : 24}px ${FONT_DISPLAY}`;
    const g22Width = ctx.measureText('G22').width;
    ctx.font = `800 ${isStory ? 28 : 24}px ${FONT_BODY}`;
    const scoresWidth = ctx.measureText('Scores').width;
    const totalWidth = iconSize + gap + g22Width + 8 + scoresWidth;
    const startX = canvas.width / 2 - totalWidth / 2;
    if (brandLogo) drawLogoBadge(ctx, { x: startX + iconSize / 2, y: wordmarkY - 6, size: iconSize, img: brandLogo, label: 'G22 Scores', rawLogo: '/icon.png', isDark });
    const textX = startX + iconSize + gap;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${isStory ? 28 : 24}px ${FONT_DISPLAY}`;
    ctx.fillStyle = BRAND_ACCENT;
    ctx.fillText('G22', textX, wordmarkY);
    ctx.font = `800 ${isStory ? 28 : 24}px ${FONT_BODY}`;
    ctx.fillStyle = getTextColor(isDark);
    ctx.fillText('Scores', textX + g22Width + 8, wordmarkY);
    ctx.restore();
}

function drawPoweredByFooter(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    brandLogo: HTMLImageElement | null,
    isDark: boolean,
    accentColor = BRAND_ACCENT
) {
    const isStory = canvas.height > 1500;
    const footerY = canvas.height - (isStory ? 54 : 42);
    const iconSize = isStory ? 28 : 24;
    const gap = 10;
    const prefix = 'powered by';

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${isStory ? 18 : 16}px ${FONT_BODY}`;
    const prefixWidth = ctx.measureText(prefix).width;
    ctx.font = `900 ${isStory ? 22 : 20}px ${FONT_DISPLAY}`;
    const g22Width = ctx.measureText('G22').width;
    ctx.font = `800 ${isStory ? 22 : 20}px ${FONT_BODY}`;
    const scoresWidth = ctx.measureText('Scores').width;

    const totalWidth = iconSize + gap + prefixWidth + 12 + g22Width + 6 + scoresWidth;
    const startX = canvas.width / 2 - totalWidth / 2;

    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: startX + iconSize / 2,
            y: footerY - (isStory ? 8 : 7),
            size: iconSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark,
        });
    }

    const textX = startX + iconSize + gap;
    ctx.font = `700 ${isStory ? 18 : 16}px ${FONT_BODY}`;
    ctx.fillStyle = getMutedColor(isDark, 0.72);
    ctx.fillText(prefix, textX, footerY);

    const brandTextX = textX + prefixWidth + 12;
    ctx.font = `900 ${isStory ? 22 : 20}px ${FONT_DISPLAY}`;
    ctx.fillStyle = accentColor;
    ctx.fillText('G22', brandTextX, footerY + 1);

    ctx.font = `800 ${isStory ? 22 : 20}px ${FONT_BODY}`;
    ctx.fillStyle = getTextColor(isDark);
    ctx.fillText('Scores', brandTextX + g22Width + 6, footerY + 1);
    ctx.restore();
}

function buildAutoEditorialContextLabel(data: MatchStatsData) {
    const rawTournament = data.tournament?.trim().toUpperCase() || '';
    const compactTournament = rawTournament
        .replace(/^SUPER RUGBY AMERICAS\s*/i, 'SRA ')
        .replace(/\s+/g, ' ')
        .trim();

    if (compactTournament && compactTournament.length <= 20) {
        return compactTournament;
    }

    if (data.date && data.time) {
        return `${data.date} - ${data.time}`.toUpperCase();
    }

    if (data.date) {
        return data.date.toUpperCase();
    }

    return compactTournament || 'RESULTADO FINAL';
}

function buildEditorialContextLabel(data: MatchStatsData) {
    const customLabel = data.editorialContextLabel?.trim();
    if (customLabel) return customLabel;
    return buildAutoEditorialContextLabel(data);
}

function buildEditorialScheduleCampaignLabel(data: MatchStatsData) {
    const customLabel = data.editorialContextLabel?.trim();
    if (customLabel) return customLabel.toUpperCase();
    return 'PROXIMO PARTIDO';
}

function drawCoverImage(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | null,
    options: { focusX?: number; focusY?: number } = {}
) {
    if (!image) return false;
    const sourceWidth = image.naturalWidth || image.width || canvas.width;
    const sourceHeight = image.naturalHeight || image.height || canvas.height;
    const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const focusX = Math.min(1, Math.max(0, options.focusX ?? 0.5));
    const focusY = Math.min(1, Math.max(0, options.focusY ?? 0.5));
    const desiredOffsetX = canvas.width / 2 - drawWidth * focusX;
    const desiredOffsetY = canvas.height / 2 - drawHeight * focusY;
    const offsetX = Math.min(0, Math.max(canvas.width - drawWidth, desiredOffsetX));
    const offsetY = Math.min(0, Math.max(canvas.height - drawHeight, desiredOffsetY));
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    return true;
}

function drawEditorialHeaderArrows(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    ctx.save();
    ctx.translate(canvas.width - 146, 88);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';

    for (let index = 0; index < 3; index += 1) {
        const x = index * 32;
        ctx.beginPath();
        ctx.moveTo(x, -18);
        ctx.lineTo(x + 18, 0);
        ctx.lineTo(x, 18);
        ctx.stroke();
    }
    ctx.restore();
}

function drawEditorialTopBadge(ctx: CanvasRenderingContext2D, label: string) {
    const text = label.toUpperCase();
    const x = 66;
    const y = 62;
    const height = 50;
    const paddingX = 20;

    ctx.save();
    ctx.font = `900 30px ${FONT_EDITORIAL}`;
    const width = ctx.measureText(text).width + paddingX * 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.76)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + paddingX, y + height / 2 + 2);
    ctx.restore();
}

function drawEditorialGradientImage(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    gradientImage: HTMLImageElement | null
) {
    if (!gradientImage) return;
    const sourceWidth = gradientImage.naturalWidth || gradientImage.width || canvas.width;
    const sourceHeight = gradientImage.naturalHeight || gradientImage.height || canvas.height;
    const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (canvas.width - drawWidth) / 2;
    const drawY = (canvas.height - drawHeight) / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(gradientImage, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
}

function drawEditorialFooter(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    brandLogo: HTMLImageElement | null,
    centerY: number
) {
    const iconSize = 22;
    const gap = 10;

    ctx.save();
    ctx.font = `800 18px ${FONT_EDITORIAL}`;
    const g22Width = ctx.measureText('G22').width;
    ctx.font = `800 18px ${FONT_BODY}`;
    const scoresWidth = ctx.measureText('Scores').width;
    const totalWidth = iconSize + gap + g22Width + 6 + scoresWidth;
    const pillWidth = totalWidth + 22;
    const pillHeight = 36;
    const startX = canvas.width / 2 - totalWidth / 2;
    const pillY = centerY - pillHeight / 2;

    ctx.fillStyle = 'rgba(6, 10, 14, 0.48)';
    ctx.beginPath();
    ctx.roundRect(canvas.width / 2 - pillWidth / 2, pillY, pillWidth, pillHeight, 999);
    ctx.fill();
    ctx.restore();

    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: startX + iconSize / 2,
            y: centerY,
            size: iconSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark: true,
        });
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 18px ${FONT_EDITORIAL}`;
    ctx.fillStyle = BRAND_ACCENT;
    ctx.fillText('G22', startX + iconSize + gap, centerY + 1);
    ctx.font = `800 18px ${FONT_BODY}`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('Scores', startX + iconSize + gap + g22Width + 6, centerY + 1);
    ctx.restore();

    return { pillWidth, pillHeight };
}

function drawEditorialSponsorsRow(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    sponsors: MatchSponsorData[],
    sponsorImages: Array<HTMLImageElement | null>,
    brandLogo: HTMLImageElement | null,
    centerY: number,
    logoHeight: number,
    gap: number
) {
    const sponsorItems = sponsors
        .map((sponsor, index) => ({
            sponsor,
            img: sponsorImages[index] || null,
        }))
        .filter((item) => item.img || item.sponsor.name?.trim())
        .slice(0, EDITORIAL_SPONSOR_SLOTS);

    const leftCount = Math.min(3, Math.ceil(sponsorItems.length / 2));
    const leftSponsors = sponsorItems.slice(0, leftCount);
    const rightSponsors = sponsorItems.slice(leftCount, leftCount + 3);
    const brandMetrics = drawEditorialFooter(ctx, canvas, brandLogo, centerY);
    const sidePadding = 64;
    const centerGap = 34;
    const sideZoneWidth = canvas.width / 2 - sidePadding - brandMetrics.pillWidth / 2 - centerGap;
    const maxSideCount = Math.max(leftSponsors.length, rightSponsors.length, 1);
    const slotWidth = Math.max(94, Math.min(120, Math.floor((sideZoneWidth - gap * (maxSideCount - 1)) / maxSideCount)));
    const bandWidth = canvas.width - sidePadding * 2;
    const bandHeight = Math.round(logoHeight * 1.18);
    const bandY = centerY - bandHeight / 2;

    ctx.save();
    const bandGlow = ctx.createLinearGradient(0, bandY, 0, bandY + bandHeight);
    bandGlow.addColorStop(0, 'rgba(8, 12, 18, 0)');
    bandGlow.addColorStop(0.34, 'rgba(8, 12, 18, 0.08)');
    bandGlow.addColorStop(1, 'rgba(8, 12, 18, 0.2)');
    ctx.fillStyle = bandGlow;
    ctx.beginPath();
    ctx.roundRect(sidePadding, bandY, bandWidth, bandHeight, bandHeight / 2);
    ctx.fill();
    ctx.restore();

    const drawSponsorGroup = (
        items: Array<{ sponsor: MatchSponsorData; img: HTMLImageElement | null }>,
        startX: number,
        endX: number
    ) => {
        if (items.length === 0) return;

        const groupWidth = items.length * slotWidth + Math.max(0, items.length - 1) * gap;
        let cursorX = startX + (endX - startX - groupWidth) / 2;

        items.forEach(({ sponsor, img }) => {
            const drawX = cursorX + slotWidth / 2;

            ctx.save();
            const logoShadow = ctx.createRadialGradient(drawX, centerY + logoHeight * 0.18, 8, drawX, centerY + logoHeight * 0.18, slotWidth * 0.46);
            logoShadow.addColorStop(0, 'rgba(0,0,0,0.26)');
            logoShadow.addColorStop(0.65, 'rgba(0,0,0,0.1)');
            logoShadow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = logoShadow;
            ctx.fillRect(drawX - slotWidth / 2, centerY - logoHeight * 0.46, slotWidth, logoHeight * 1.1);
            ctx.restore();

            if (img) {
                const placement = getContainedImagePlacement(
                    img,
                    drawX,
                    centerY,
                    slotWidth,
                    logoHeight,
                    Math.max(10, slotWidth * 0.12),
                    Math.max(8, logoHeight * 0.16)
                );

                ctx.save();
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.globalAlpha = 1;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
                ctx.shadowBlur = 16;
                ctx.shadowOffsetY = 6;
                ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
                ctx.restore();
            } else {
                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.97)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `800 18px ${FONT_BODY}`;
                ctx.fillText((sponsor.name || 'SPONSOR').toUpperCase(), drawX, centerY + 1);
                ctx.restore();
            }

            cursorX += slotWidth + gap;
        });
    };

    drawSponsorGroup(leftSponsors, sidePadding, canvas.width / 2 - brandMetrics.pillWidth / 2 - centerGap);
    drawSponsorGroup(rightSponsors, canvas.width / 2 + brandMetrics.pillWidth / 2 + centerGap, canvas.width - sidePadding);
}

function drawEditorialGradientTexture(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    textureImage: HTMLImageElement | null,
    startY: number
) {
    if (!textureImage) return;
    const height = canvas.height - startY;

    ctx.save();
    ctx.translate(0, startY);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.1;
    ctx.drawImage(textureImage, 0, 0, canvas.width, height);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.14;
    ctx.drawImage(textureImage, 0, 0, canvas.width, height);

    const paperFade = ctx.createLinearGradient(0, 0, 0, height);
    paperFade.addColorStop(0, 'rgba(255,255,255,0.014)');
    paperFade.addColorStop(0.42, 'rgba(255,255,255,0.006)');
    paperFade.addColorStop(1, 'rgba(0,0,0,0.032)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 1;
    ctx.fillStyle = paperFade;
    ctx.fillRect(0, 0, canvas.width, height);
    ctx.restore();
}

function formatDiff(value: string | number) {
    if (typeof value === 'number') return value > 0 ? `+${value}` : String(value);
    const trimmed = value.trim();
    if (!trimmed) return '0';
    if (/^[0-9]+$/.test(trimmed)) return `+${trimmed}`;
    return trimmed;
}

function getStatusLabel(status?: string) {
    if (status === 'live') return 'EN VIVO';
    if (status === 'finished' || status === 'final') return 'FINAL';
    return 'PROGRAMADO';
}

function getStatusColor(status: string | undefined, accentColor: string, isDark: boolean) {
    if (status === 'live') return '#ef4444';
    if (status === 'finished' || status === 'final') return accentColor;
    return isDark ? '#cbd5e1' : '#475569';
}

// ============================================================================
// G22 Base — póster de historia (estilo split por equipos) para resultado y horario.
// Regla dura: SIEMPRE escudos reales y logo de torneo (imágenes); nunca iniciales.
// Colores de fondo: override (selectores editoriales) o auto-detectados del escudo.
// ============================================================================

// Articulat CF para el título de resultado (dejar el archivo en public/fonts para que cargue;
// si no está, cae a Outfit/Inter sin romper el render).
const FONT_ARTICULAT = '"Articulat CF", "Outfit", "Inter", system-ui, sans-serif';

function g22pNoise(seed: number) {
    const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
}

// ============================================================================
// G22 Base — LA PLACA del partido (resultado y horario).
//
// Una placa de color pleno, sin fotos ni paneles: arriba el titular
// "ETAPA - TORNEO" en condensada pesada, debajo la firma, y entre dos reglas de
// lado a lado los dos escudos con el marcador (o la hora) en el medio. Del
// filete de abajo cuelga el logo del torneo y el pie queda libre — ahí va el
// sticker de Instagram.
//
// La ETAPA sale de `mainTitle` (RESULTADO / HORARIO). Si el nombre del torneo ya
// viene partido — "Final - TRL M19 A" —, esa partición manda y no se le antepone
// nada: así se escribe la pieza de una final sin tocar el motor.
//
// Regla dura: escudos REALES. Si uno no carga, la pieza no se exporta: media
// placa vacía publicada es peor que un error en el preview.
// ============================================================================

// La marca del pie es la del MEDIO que cubre ese deporte, no una sola: Salida de
// 22 para rugby, Corner Corto para hockey, Grupo 22 TV para el resto. 'auto' la
// resuelve por el deporte del partido; el modal permite forzarla.
type PlateBrandId = 'auto' | 'salida22' | 'cornerCorto' | 'g22tv' | 'g22scores' | 'none';

const PLATE_BRAND_SOURCES: Record<Exclude<PlateBrandId, 'auto' | 'none'>, string> = {
    salida22: '/marcas/salida-de-22.png',
    cornerCorto: '/marcas/corner-corto.png',
    g22tv: '/marcas/grupo-22-tv.png',
    g22scores: '/header-logo.png',
};

const PLATE_BRAND_OPTIONS: Array<{ value: PlateBrandId; label: string }> = [
    { value: 'auto', label: 'Automatica por deporte' },
    { value: 'salida22', label: 'Salida de 22 (rugby)' },
    { value: 'cornerCorto', label: 'Corner Corto (hockey)' },
    { value: 'g22tv', label: 'Grupo 22 TV' },
    { value: 'g22scores', label: 'G22 Scores' },
    { value: 'none', label: 'Sin marca' },
];

function isPlateBrandId(value: string | undefined): value is PlateBrandId {
    return PLATE_BRAND_OPTIONS.some((option) => option.value === value);
}

// Los ids numericos son los de FlashScore (SPORT_MAPPING en services/flashscore):
// asi llega el deporte en los partidos externos, y sin traducirlos un partido de
// rugby (8) caia en Grupo 22 TV. Solo hacen falta los que tienen marca propia.
const PLATE_FLASHSCORE_SPORT_SLUGS: Record<number, string> = {
    4: 'hockey',
    8: 'rugby',
    19: 'rugby-league',
    24: 'field-hockey',
};

// El deporte llega de paginas tipadas flojo: slug, numero de FlashScore o un
// objeto con el deporte adentro. Todo eso se normaliza a un slug.
function normalizePlateSportId(sport: unknown): string {
    if (typeof sport === 'number' && Number.isFinite(sport)) {
        return PLATE_FLASHSCORE_SPORT_SLUGS[sport] || '';
    }

    if (typeof sport === 'string') {
        const value = sport.trim().toLowerCase();
        if (/^\d+$/.test(value)) return PLATE_FLASHSCORE_SPORT_SLUGS[Number(value)] || '';
        return value;
    }

    if (sport && typeof sport === 'object') {
        const record = sport as Record<string, unknown>;
        for (const key of ['id', 'slug', 'sportId', 'sport_id', 'sport', 'name']) {
            const nested = normalizePlateSportId(record[key]);
            if (nested) return nested;
        }
    }

    return '';
}

// El hockey de la plataforma es el de cancha ('field-hockey'); al de hielo se le
// da la misma marca porque es el mismo programa, no un medio distinto.
function resolvePlateBrandSource(brand: PlateBrandId | undefined, sport: unknown): string {
    const requested = isPlateBrandId(brand) ? brand : 'auto';
    if (requested === 'none') return '';
    if (requested !== 'auto') return PLATE_BRAND_SOURCES[requested];

    const sportId = normalizePlateSportId(sport);
    if (sportId.startsWith('rugby')) return PLATE_BRAND_SOURCES.salida22;
    if (sportId === 'field-hockey' || sportId === 'hockey') return PLATE_BRAND_SOURCES.cornerCorto;
    return PLATE_BRAND_SOURCES.g22tv;
}

// El reparto tipografico de la placa es FIJO y no lo toca el preset del panel:
// el titular y el bloque de fecha+hora van en Dharma Gothic C Heavy (la mas
// condensada) y el marcador en Dharma Gothic E Heavy — el guion del "27-29" es
// la diferencia que se ve, la barra ancha de la E.
const PLATE_FONT_TITLE = `${DHARMA_GOTHIC_C_FAMILY.replace(', sans-serif', '')}, "G22 Dharma Gothic", "Bebas Neue", "Outfit", sans-serif`;
const PLATE_FONT_SCORE = `${DHARMA_GOTHIC_E_FAMILY.replace(', sans-serif', '')}, "Dharma Gothic E Heavy", "G22 Dharma Gothic", "Bebas Neue", "Outfit", sans-serif`;

type ExportPlateOptions = {
    field?: string;
    fieldEnd?: string;
    ink?: string;
    brand?: PlateBrandId;
    footerMeta?: boolean;
};

type G22PlateTone = {
    field: string;
    fieldEnd: string;
    ink: string;
    rule: string;
    accent: string;
    isDarkField: boolean;
};

function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/.test(value);
}

// El color de la placa sale de Fondo + Acento. Las paletas del modal son casi
// negras: usar el Fondo tal cual dejaría un rectángulo negro donde la referencia
// tiene un campo de color. Los tres colores se pueden forzar desde el modal.
function getG22PlateTone(accentColor: string, bgColor: string, overrides?: ExportPlateOptions): G22PlateTone {
    const fieldOverride = normalizeHexColor(overrides?.field);
    const fieldEndOverride = normalizeHexColor(overrides?.fieldEnd);
    const inkOverride = normalizeHexColor(overrides?.ink);
    const normalizedAccent = normalizeHexColor(accentColor);
    const accent = isHexColor(normalizedAccent) ? normalizedAccent : BRAND_ACCENT;
    const field = isHexColor(fieldOverride) ? fieldOverride : mixHexColors(bgColor, accent, 0.58);
    // El campo decide si la pieza es clara u oscura aunque la tinta se fuerce a
    // mano: de eso dependen la trama, las sombras y la viñeta.
    const isDarkField = getContrastColor(field) === '#ffffff';
    const ink = isHexColor(inkOverride) ? inkOverride : getContrastColor(field);
    // La otra punta del degradado: por defecto el mismo color hundido, que es lo
    // que hace pesar la esquina de abajo sin ensuciar el color de la placa.
    const fieldEnd = isHexColor(fieldEndOverride)
        ? fieldEndOverride
        : mixHexColors(field, isDarkField ? '#000000' : '#1f2937', isDarkField ? 0.42 : 0.16);

    return { field, fieldEnd, ink, rule: hexToRGBA(ink, 0.95), accent, isDarkField };
}

// El fondo ES el diseño: un degradado de ESQUINA A ESQUINA (arriba izquierda
// hacia abajo derecha) con trama de tela y grano encima. Sin la textura el
// degradado se ve como fondo de aplicación, no como una placa impresa.
function drawG22PlateField(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, tone: G22PlateTone) {
    const W = canvas.width;
    const H = canvas.height;

    const corner = ctx.createLinearGradient(0, 0, W, H);
    corner.addColorStop(0, tone.field);
    corner.addColorStop(1, tone.fieldEnd);
    ctx.fillStyle = corner;
    ctx.fillRect(0, 0, W, H);

    // El Acento no pinta ningún texto — la placa se lee en blanco sobre color —,
    // así que entra como luz en la esquina de arriba: se nota que cambia sin
    // pelearse con el titular ni con el degradado.
    const halo = ctx.createRadialGradient(W * 0.12, -H * 0.1, 0, W * 0.12, -H * 0.1, W * 1.15);
    halo.addColorStop(0, hexToRGBA(tone.accent, 0.24));
    halo.addColorStop(1, hexToRGBA(tone.accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = hexToRGBA(tone.isDarkField ? '#ffffff' : '#000000', 0.03);
    ctx.lineWidth = 1;
    for (let y = 0; y <= H; y += 5) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();

    const noise = getRankingNoiseTile();
    if (noise) {
        const pattern = ctx.createPattern(noise, 'repeat');
        if (pattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = 0.14;
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    ctx.save();
    const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.36, W / 2, H / 2, H * 0.82);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, hexToRGBA('#000000', tone.isDarkField ? 0.16 : 0.07));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// Ancho de la TINTA, no del avance: measureText().width incluye el espacio
// lateral de la primera y la ultima letra, y con eso un titular "al ancho" queda
// siempre unos pixeles mas corto que la regla.
function measureInkWidth(ctx: CanvasRenderingContext2D, text: string): number {
    const metrics = ctx.measureText(text);
    const left = metrics.actualBoundingBoxLeft;
    const right = metrics.actualBoundingBoxRight;
    if (typeof left === 'number' && typeof right === 'number') {
        const ink = Math.abs(left) + Math.abs(right);
        if (ink > 0) return ink;
    }
    return metrics.width;
}

function setFilledFont(
    ctx: CanvasRenderingContext2D,
    text: string,
    targetWidth: number,
    weight: string,
    family: string,
    minSize: number,
    maxSize: number
): number {
    const clamp = (value: number) => Math.max(minSize, Math.min(maxSize, Math.round(value)));
    let size = clamp(maxSize);
    // El ancho escala casi lineal con el cuerpo: tres pasadas de regla de tres
    // clavan el ancho aunque la fuente tenga kerning raro.
    for (let pass = 0; pass < 3; pass += 1) {
        ctx.font = `${weight} ${size}px ${family}`;
        const width = measureInkWidth(ctx, text);
        if (width <= 0) break;
        const next = clamp(size * (targetWidth / width));
        if (next === size) break;
        size = next;
    }
    ctx.font = `${weight} ${size}px ${family}`;
    return size;
}

function drawG22PlateRule(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    thickness: number,
    color: string
) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, thickness, thickness / 2);
    ctx.fill();
    ctx.restore();
}

// El titular: "ETAPA - TORNEO" en UNA sola línea, pase lo que pase. No se parte
// en dos: el cuerpo se ajusta para llenar el ancho de las reglas, y un nombre
// largo sale mas chico. Devuelve su borde inferior porque el resto de la pieza
// se cuelga de ahí.
function drawG22PlateHeadline(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    stagePart: string,
    tournamentPart: string,
    tone: G22PlateTone,
    options: { top: number; maxWidth: number; maxSize: number; minSize: number }
): number {
    const stage = (stagePart || '').trim().toUpperCase();
    const tournament = (tournamentPart || '').trim().toUpperCase();
    const headline = [stage, tournament].filter(Boolean).join(' - ');
    if (!headline) return options.top;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tone.ink;
    const size = setFilledFont(ctx, headline, options.maxWidth, '900', PLATE_FONT_TITLE, options.minSize, options.maxSize);
    ctx.shadowColor = hexToRGBA('#000000', tone.isDarkField ? 0.34 : 0.14);
    ctx.shadowBlur = Math.round(size * 0.16);
    ctx.shadowOffsetY = Math.round(size * 0.04);
    ctx.fillText(headline, canvas.width / 2, options.top);
    ctx.restore();

    return options.top + Math.round(size * 0.76);
}

// La placa lleva DOS marcas: la del medio que cubre el deporte va bajo el
// titular, y G22 SCORES cierra abajo de todo, debajo del logo del torneo.
//
// Las marcas se miden por ancho Y por alto: tienen proporciones distintas
// (Corner Corto es mucho mas larga que Salida de 22) y a alto fijo una se ve el
// doble que la otra. Devuelve el alto que ocupo para que el bloque siguiente se
// cuelgue de ahi.
function drawG22PlateMark(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    mark: HTMLImageElement | null,
    tone: G22PlateTone,
    options: { y: number; anchor: 'top' | 'bottom'; maxHeight: number; maxWidth: number; fallbackText?: string }
): number {
    if (mark && mark.naturalWidth && mark.naturalHeight) {
        const ratio = mark.naturalWidth / mark.naturalHeight;
        const height = Math.min(options.maxHeight, options.maxWidth / ratio);
        const width = height * ratio;
        const top = options.anchor === 'top' ? options.y : options.y - height;
        ctx.save();
        ctx.globalAlpha = 0.98;
        // Sobre placa clara la sombra es la que sostiene las letras blancas del
        // logo: por eso ahi pesa mas, no menos.
        ctx.shadowColor = hexToRGBA('#000000', tone.isDarkField ? 0.34 : 0.42);
        ctx.shadowBlur = Math.round(height * (tone.isDarkField ? 0.22 : 0.3));
        ctx.shadowOffsetY = Math.round(height * 0.07);
        ctx.drawImage(mark, canvas.width / 2 - width / 2, top, width, height);
        ctx.restore();
        return height;
    }

    if (!options.fallbackText) return 0;

    const size = Math.round(options.maxHeight * 0.7);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = options.anchor === 'top' ? 'top' : 'bottom';
    ctx.fillStyle = hexToRGBA(tone.ink, 0.94);
    ctx.font = `900 ${size}px ${PLATE_FONT_TITLE}`;
    setCanvasTracking(ctx, Math.round(size * 0.08));
    ctx.fillText(options.fallbackText, canvas.width / 2, options.y);
    setCanvasTracking(ctx, 0);
    ctx.restore();

    return size;
}

async function drawG22BasePlate(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    accentColor: string,
    bgColor: string,
    plateOptions?: ExportPlateOptions
) {
    const [homeLogo, awayLogo, tournamentLogo, sportMark, wordmark] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(resolvePlateBrandSource(plateOptions?.brand, data.sport)),
        loadImage('/header-logo.png'),
    ]);

    // Escudo real o no hay placa. Sin este corte el escudo que falta se rellena
    // con iniciales y la imagen se descarga igual: media pieza vacía, sin aviso,
    // lista para publicar. Cortamos acá nombrando al club que falta — el preview
    // del modal muestra este mismo mensaje, así que se ve ANTES de exportar.
    const missingCrests = [
        homeLogo ? '' : (data.homeTeam || '').trim() || 'el local',
        awayLogo ? '' : (data.awayTeam || '').trim() || 'el visitante',
    ].filter(Boolean);
    if (missingCrests.length > 0) {
        throw new Error(`No se pudo cargar el escudo de ${missingCrests.join(' y ')}`);
    }

    const W = canvas.width;
    const H = canvas.height;
    // Los dos formatos miden 1080 de ancho y sólo cambian de alto: TODO lo que
    // tiene que medir igual en post y en story se escala por ancho. El alto de
    // más del story se reparte como AIRE entre los bloques, no como tipografía
    // 42% más grande.
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const tone = getG22PlateTone(accentColor, bgColor, plateOptions);
    const showFooterMeta = plateOptions?.footerMeta !== false;

    drawG22PlateField(ctx, canvas, tone);

    const padding = u(62);
    const contentWidth = W - padding * 2;
    const isScheduled = data.status === 'scheduled';

    const tournamentLabel = stripTournamentCountryPrefix(data.tournament || '');
    const tournamentCarriesStage = /\s[-|]\s/.test(tournamentLabel);
    const stageLabel = tournamentCarriesStage ? '' : (data.mainTitle || getStatusLabel(data.status) || '').trim();

    const headlineBottom = drawG22PlateHeadline(ctx, canvas, stageLabel, tournamentLabel, tone, {
        top: u(96) + extra * 0.24,
        maxWidth: contentWidth,
        maxSize: u(260),
        minSize: u(34),
    });

    // La marca del medio cuelga del titular: es la que dice de quien es la placa.
    const sportMarkTop = headlineBottom + u(20);
    const sportMarkHeight = drawG22PlateMark(ctx, canvas, sportMark, tone, {
        y: sportMarkTop,
        anchor: 'top',
        maxHeight: u(62),
        maxWidth: contentWidth * 0.42,
    });

    const ruleThickness = Math.max(4, u(10));
    const topRuleY = sportMarkTop + sportMarkHeight + u(28) + extra * 0.06;
    drawG22PlateRule(ctx, padding, topRuleY, contentWidth, ruleThickness, tone.rule);

    const bandTop = topRuleY + ruleThickness + u(16);
    const bandHeight = u(310) + extra * 0.16;
    const bandCenter = bandTop + bandHeight / 2;
    const crestSize = Math.min(bandHeight * 1.02, u(256));
    const crestCenterX = padding + crestSize / 2 - u(12);

    drawOverflowCrest(ctx, {
        x: crestCenterX,
        y: bandCenter,
        width: crestSize,
        height: crestSize,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: tone.isDarkField,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: W - crestCenterX,
        y: bandCenter,
        width: crestSize,
        height: crestSize,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: tone.isDarkField,
        showFrame: false,
    });

    // El centro: marcador, o fecha arriba y hora abajo. Los dos renglones del
    // horario llenan el mismo ancho, asi que la fecha —que es mas larga— sale
    // mas chica y la hora manda sin tener que declarar dos cuerpos a mano.
    const hasPenalties = !isScheduled
        && typeof data.homePenalties === 'number'
        && typeof data.awayPenalties === 'number';
    const scoreMaxWidth = W - (crestCenterX + crestSize / 2) * 2 - u(52);
    const scoreCenterY = bandCenter - (hasPenalties ? u(14) : 0);
    const dateText = isScheduled ? (data.date || '').trim().toUpperCase() : '';
    const scoreText = isScheduled
        ? (data.time || '--:--').trim()
        : `${data.homeScore ?? '-'}-${data.awayScore ?? '-'}`;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = tone.ink;
    ctx.shadowColor = hexToRGBA('#000000', tone.isDarkField ? 0.32 : 0.14);
    ctx.shadowBlur = u(24);
    ctx.shadowOffsetY = u(8);

    const scoreCap = Math.round(Math.min(u(268), bandHeight * (dateText ? 0.62 : 0.94)));
    ctx.textBaseline = 'middle';
    const scoreSize = setFilledFont(ctx, scoreText, scoreMaxWidth, '900', PLATE_FONT_SCORE, u(60), scoreCap);
    const scoreMiddleY = dateText ? scoreCenterY + Math.round(bandHeight * 0.16) : scoreCenterY;
    ctx.fillText(scoreText, W / 2, scoreMiddleY);

    if (dateText) {
        ctx.textBaseline = 'bottom';
        const dateSize = setFilledFont(
            ctx,
            dateText,
            scoreMaxWidth,
            '900',
            PLATE_FONT_SCORE,
            u(30),
            Math.round(bandHeight * 0.3)
        );
        ctx.fillText(dateText, W / 2, scoreMiddleY - scoreSize * 0.46 - u(6));
        void dateSize;
    }
    ctx.restore();

    if (hasPenalties) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = hexToRGBA(tone.ink, 0.8);
        ctx.font = `800 ${u(24)}px ${FONT_ARTICULAT}`;
        setCanvasTracking(ctx, u(2));
        ctx.fillText(`PENALES ${data.homePenalties} - ${data.awayPenalties}`, W / 2, scoreCenterY + scoreSize * 0.42);
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }

    const bottomRuleY = bandTop + bandHeight + u(14);
    drawG22PlateRule(ctx, padding, bottomRuleY, contentWidth, ruleThickness, tone.rule);

    // El pie: en horario el día ya vive arriba, así que abajo queda la sede sola.
    const metaLabel = showFooterMeta
        ? (isScheduled
            ? (data.venue || '').trim()
            : [data.date, data.venue].filter(Boolean).join('   ·   '))
        : '';
    const metaBaseline = H - u(52);

    // De abajo hacia arriba: primero la fila de datos, encima la firma G22 SCORES,
    // y recién ahí se calcula cuánto le queda al logo del torneo. Al revés, un
    // torneo de logo alto se comía la firma.
    const brandMaxHeight = u(84) + extra * 0.04;
    const brandBottom = metaBaseline - (metaLabel ? u(42) : u(6));
    const brandTop = brandBottom - brandMaxHeight;

    // El logo del torneo CUELGA del filete de abajo; lo que sobra entre él y la
    // marca es aire a propósito — ahí va el sticker de Instagram.
    const logoTop = bottomRuleY + ruleThickness + u(36) + extra * 0.16;
    const logoRoom = brandTop - u(30) - logoTop;
    const logoHeight = Math.min(u(280) + extra * 0.1, logoRoom);
    const logoWidth = Math.min(contentWidth * 0.86, logoHeight * 3);

    // Sin logo no se dibuja nada: el nombre del torneo ya está en el titular y
    // repetirlo acá abajo sería decir dos veces lo mismo.
    if (tournamentLogo && logoHeight >= u(90)) {
        const logoCenterY = logoTop + logoHeight / 2;
        drawEditorialCrestStroke(
            ctx,
            W / 2,
            logoCenterY,
            logoWidth,
            logoHeight,
            tournamentLogo,
            5,
            hexToRGBA(tone.ink, 0.16)
        );
        drawOverflowCrest(ctx, {
            x: W / 2,
            y: logoCenterY,
            width: logoWidth,
            height: logoHeight,
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: tone.isDarkField,
            showFrame: false,
        });
    }

    // La firma es SIEMPRE el logo (el del header). Sobre placa clara sus letras
    // blancas se apoyan en la sombra que le pone drawG22PlateMark.
    drawG22PlateMark(ctx, canvas, wordmark, tone, {
        y: brandBottom,
        anchor: 'bottom',
        maxHeight: brandMaxHeight,
        maxWidth: contentWidth * 0.5,
        fallbackText: 'G22 SCORES',
    });

    if (metaLabel) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = hexToRGBA(tone.ink, 0.72);
        ctx.font = `700 ${u(20)}px ${FONT_ARTICULAT}`;
        setCanvasTracking(ctx, u(2));
        ctx.fillText(truncateTextToWidth(ctx, metaLabel.toUpperCase(), contentWidth), W / 2, metaBaseline);
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }
}

async function drawMatchEditorialScheduleSplitHero(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    backgroundImageSrc: string,
    editorialGradientLeftColor?: string,
    editorialGradientRightColor?: string
) {
    const [backgroundImage, homeLogo, awayLogo, tournamentLogo] = await Promise.all([
        loadImage(backgroundImageSrc || ''),
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
    ]);
    const kickoffDate = toExportDate(data.kickoffAt);
    const scaleX = canvas.width / 1080;
    const scaleY = canvas.height / 1350;
    const sx = (value: number) => Math.round(value * scaleX);
    const sy = (value: number) => Math.round(value * scaleY);
    const bgIsDark = getContrastColor(bgColor) === '#ffffff';
    const requestedGradientLeft = editorialGradientLeftColor || mixHexColors(accentColor, bgColor, bgIsDark ? 0.24 : 0.16);
    const requestedGradientRight = editorialGradientRightColor || accentColor;
    // Keep the G22 Base schedule anchored to the brand accent so saved presets do not
    // push the split hero into the colder "hardened" blues.
    const gradientLeft = requestedGradientLeft;
    const gradientRight = mixHexColors(accentColor, requestedGradientRight, bgIsDark ? 0.12 : 0.1);
    const posterBase = bgIsDark
        ? mixHexColors(bgColor, '#030712', 0.3)
        : mixHexColors(bgColor, '#101828', 0.78);
    const posterTint = mixHexColors(posterBase, gradientLeft, 0.16);
    const posterShade = mixHexColors(posterBase, '#000000', 0.28);
    const accentPrimary = getContrastColor(gradientRight) === '#ffffff'
        ? mixHexColors(gradientRight, '#ffffff', 0.08)
        : mixHexColors(gradientRight, '#0f172a', 0.08);
    const accentSecondary = getContrastColor(gradientLeft) === '#ffffff'
        ? mixHexColors(gradientLeft, '#ffffff', 0.08)
        : mixHexColors(gradientLeft, '#0f172a', 0.14);
    const accentSoft = mixHexColors(accentPrimary, '#ffffff', bgIsDark ? 0.18 : 0.28);
    const accentDeep = mixHexColors(accentSecondary, '#020617', 0.36);
    const frameColor = mixHexColors(posterBase, '#ffffff', bgIsDark ? 0.06 : 0.12);
    const headlineColor = getContrastColor(posterBase);
    const mutedHeadline = hexToRGBA(headlineColor, 0.72);
    const accentStroke = hexToRGBA(mixHexColors(headlineColor === '#ffffff' ? '#ffffff' : '#0f172a', accentPrimary, 0.18), 0.24);
    const leftInfoFill = accentPrimary;
    const leftInfoText = getContrastColor(leftInfoFill);
    const neutralLogoPlate = mixHexColors(posterBase, '#000000', 0.18);
    const neutralLogoText = getContrastColor(neutralLogoPlate);
    const accentLogoPlate = mixHexColors(accentPrimary, accentDeep, 0.22);
    const accentLogoText = getContrastColor(accentLogoPlate);
    const fallbackLogo = tournamentLogo || brandLogo;
    const kickerText = (
        data.editorialContextLabel?.trim()
        || ((data.mainTitle || '').trim().toLowerCase() !== 'horario' ? (data.mainTitle || '').trim() : '')
        || buildEditorialScheduleCampaignLabel(data)
    ).toUpperCase();
    const competitionText = (data.tournament || 'TOURNAMENT').trim().toUpperCase();
    const dateText = kickoffDate
        ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(kickoffDate).replace(',', '').toUpperCase()
        : (data.date || 'DATE TBC').trim().toUpperCase();
    const timeText = kickoffDate
        ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(kickoffDate).toUpperCase()
        : (data.time || '--:--').trim().toUpperCase();
    const venueText = (data.venue || '').trim().toUpperCase();
    const matchupText = `${(data.homeTeam || 'HOME').trim().toUpperCase()} V ${(data.awayTeam || 'AWAY').trim().toUpperCase()}`;
    const photoX = sx(566);
    const photoY = sy(110);
    const photoWidth = sx(392);
    const photoHeight = scaleElementSize('rowHeight', sy(980), 304);
    const heroLeftX = sx(90);
    const heroMaxWidth = sx(466);
    const heroTopY = offsetElementY('title', sy(382));
    const heroBottomY = offsetElementY('title', sy(590));
    const infoBlockX = sx(92);
    const infoBlockY = sy(912);
    const infoBlockWidth = sx(452);
    const infoBlockHeight = sy(128);
    const metaLeftX = sx(92);
    const metaDateY = sy(1106);
    const metaVenueY = sy(1184);
    const logoPlateY = sy(1098);
    const logoPlateWidth = sx(148);
    const logoPlateHeight = sy(124);
    const homeLogoPlateX = sx(646);
    const awayLogoPlateX = homeLogoPlateX + logoPlateWidth;

    const drawCoverInRect = (image: HTMLImageElement | null, x: number, y: number, width: number, height: number, focusX = 0.56, focusY = 0.34) => {
        if (!image) return false;
        const sourceWidth = image.naturalWidth || image.width || width;
        const sourceHeight = image.naturalHeight || image.height || height;
        const scale = Math.max(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const offsetX = x + Math.min(0, Math.max(width - drawWidth, width / 2 - drawWidth * focusX));
        const offsetY = y + Math.min(0, Math.max(height - drawHeight, height / 2 - drawHeight * focusY));
        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
        return true;
    };

    const drawCondensedHeroWord = (word: string, x: number, baselineY: number, maxWidth: number, size: number) => {
        const scaleWordX = 0.66;
        const scaleWordY = 1.08;
        const adjustedWidth = maxWidth / scaleWordX;

        ctx.save();
        ctx.translate(x, baselineY);
        ctx.scale(scaleWordX, scaleWordY);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = headlineColor;
        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = sy(14);
        ctx.shadowOffsetY = sy(6);
        setFittedFont(ctx, word, adjustedWidth, '900', size, FONT_EDITORIAL_SCORE, 86);
        ctx.fillText(truncateTextToWidth(ctx, word, adjustedWidth), 0, 0);
        ctx.restore();
    };

    const drawLogoPlate = (
        x: number,
        fill: string,
        textColor: string,
        logo: HTMLImageElement | null,
        label: string,
        rawLogo: string | undefined,
        innerLabel: string
    ) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = sy(20);
        ctx.shadowOffsetY = sy(12);
        ctx.fillStyle = fill;
        ctx.fillRect(x, logoPlateY, logoPlateWidth, logoPlateHeight);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = hexToRGBA(textColor === '#ffffff' ? '#ffffff' : '#0f172a', 0.12);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, logoPlateY + 0.75, logoPlateWidth - 1.5, logoPlateHeight - 1.5);
        ctx.restore();

        drawOverflowCrest(ctx, {
            x: x + logoPlateWidth / 2,
            y: logoPlateY + sy(50),
            width: scaleElementSize('teamLogo', sx(72), 188),
            height: scaleElementSize('teamLogo', sy(72), 188),
            img: logo,
            label,
            rawLogo,
            isDark: textColor === '#ffffff',
            showFrame: false,
        });

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = hexToRGBA(textColor, 0.8);
        ctx.font = `800 ${sy(14)}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, innerLabel, logoPlateWidth - sx(20)), x + logoPlateWidth / 2, logoPlateY + logoPlateHeight - sy(18));
        ctx.restore();
    };

    const textureSeed = (seed: number) => {
        const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return value - Math.floor(value);
    };

    const drawAdaptedBackgroundTexture = () => {
        const diagonalAngle = -Math.PI * (56 / 180);
        const dx = Math.cos(diagonalAngle);
        const dy = Math.sin(diagonalAngle);
        const px = -dy;
        const py = dx;
        const wideStroke = hexToRGBA(mixHexColors(accentSecondary, '#60a5fa', 0.26), bgIsDark ? 0.17 : 0.12);
        const thinStroke = hexToRGBA(mixHexColors(accentPrimary, '#93c5fd', 0.22), bgIsDark ? 0.12 : 0.08);
        const dustColor = hexToRGBA(mixHexColors(accentSoft, '#dbeafe', 0.2), bgIsDark ? 0.11 : 0.07);

        ctx.save();
        ctx.lineCap = 'butt';

        for (let lane = -4; lane < 22; lane += 1) {
            const laneSeed = lane + 1;
            const originX = -canvas.height * 0.64 + lane * sx(82);
            const originY = canvas.height + sy(180) - lane * sy(10);
            let travel = sx(10 + textureSeed(laneSeed * 4.1) * 40);
            const segments = 5 + Math.floor(textureSeed(laneSeed * 2.7) * 4);

            for (let segment = 0; segment < segments; segment += 1) {
                const segmentSeed = laneSeed * 19 + segment * 7;
                const length = sx(84 + textureSeed(segmentSeed) * 228);
                const gap = sx(28 + textureSeed(segmentSeed + 1.3) * 74);
                const thickness = sx(6 + textureSeed(segmentSeed + 2.1) * 22);
                const crossOffset = (textureSeed(segmentSeed + 3.7) - 0.5) * sx(20);
                const x1 = originX + dx * travel + px * crossOffset;
                const y1 = originY + dy * travel + py * crossOffset;
                const x2 = originX + dx * (travel + length) + px * crossOffset;
                const y2 = originY + dy * (travel + length) + py * crossOffset;

                ctx.strokeStyle = segment % 3 === 0 ? wideStroke : thinStroke;
                ctx.lineWidth = thickness;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                if (textureSeed(segmentSeed + 5.2) > 0.46) {
                    const scratchTravel = travel + sx(18 + textureSeed(segmentSeed + 6.4) * 36);
                    const scratchLength = length * (0.18 + textureSeed(segmentSeed + 7.1) * 0.22);
                    const scratchOffset = crossOffset + (textureSeed(segmentSeed + 8.6) - 0.5) * sx(34);
                    ctx.strokeStyle = dustColor;
                    ctx.lineWidth = Math.max(1, thickness * 0.22);
                    ctx.beginPath();
                    ctx.moveTo(
                        originX + dx * scratchTravel + px * scratchOffset,
                        originY + dy * scratchTravel + py * scratchOffset,
                    );
                    ctx.lineTo(
                        originX + dx * (scratchTravel + scratchLength) + px * scratchOffset,
                        originY + dy * (scratchTravel + scratchLength) + py * scratchOffset,
                    );
                    ctx.stroke();
                }

                travel += length + gap;
            }
        }

        ctx.fillStyle = dustColor;
        for (let index = 0; index < 340; index += 1) {
            const x = textureSeed(index * 3.17) * canvas.width;
            const y = textureSeed(index * 7.91 + 4.2) * canvas.height;
            const width = sx(1 + textureSeed(index * 11.4 + 2.8) * 3.2);
            const height = sy(1 + textureSeed(index * 5.6 + 1.4) * 2.2);
            ctx.fillRect(x, y, width, height);
        }
        ctx.restore();
    };

    ctx.fillStyle = posterBase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const backgroundGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    backgroundGradient.addColorStop(0, posterTint);
    backgroundGradient.addColorStop(0.46, posterBase);
    backgroundGradient.addColorStop(1, posterShade);
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawAdaptedBackgroundTexture();

    ctx.save();
    ctx.fillStyle = hexToRGBA(posterBase, 0.72);
    ctx.fillRect(sx(18), sy(14), sx(332), sy(56));
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hexToRGBA(headlineColor, 0.54);
    ctx.font = `800 ${sy(14)}px ${FONT_MONO}`;
    ctx.fillText('POWERED BY G22 SCORES', sx(28), sy(50));
    ctx.restore();

    ctx.save();
    const topGlow = ctx.createRadialGradient(sx(226), sy(182), sx(18), sx(226), sy(182), sx(540));
    topGlow.addColorStop(0, hexToRGBA(accentSoft, 0.3));
    topGlow.addColorStop(0.44, hexToRGBA(accentPrimary, 0.12));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hexToRGBA(accentPrimary, 0.18);
    ctx.beginPath();
    ctx.moveTo(photoX - sx(56), sy(40));
    ctx.lineTo(photoX + sx(196), sy(40));
    ctx.lineTo(photoX + sx(262), sy(100));
    ctx.lineTo(photoX + sx(178), sy(150));
    ctx.lineTo(photoX - sx(56), sy(150));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hexToRGBA(accentSecondary, 0.16);
    ctx.beginPath();
    ctx.moveTo(photoX + photoWidth - sx(12), canvas.height - sy(210));
    ctx.lineTo(canvas.width - sx(52), canvas.height - sy(146));
    ctx.lineTo(canvas.width - sx(52), canvas.height);
    ctx.lineTo(photoX + sx(108), canvas.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (backgroundImage) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.26)';
        ctx.shadowBlur = sy(28);
        ctx.shadowOffsetY = sy(18);
        ctx.fillStyle = frameColor;
        ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(photoX, photoY, photoWidth, photoHeight);
        ctx.clip();
        drawCoverInRect(backgroundImage, photoX, photoY, photoWidth, photoHeight, 0.58, 0.24);
        const photoOverlay = ctx.createLinearGradient(photoX, photoY, photoX, photoY + photoHeight);
        photoOverlay.addColorStop(0, hexToRGBA(posterBase, 0.14));
        photoOverlay.addColorStop(0.68, 'rgba(0,0,0,0)');
        photoOverlay.addColorStop(1, hexToRGBA(accentDeep, 0.22));
        ctx.fillStyle = photoOverlay;
        ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
        ctx.restore();
    } else {
        const fallbackPhotoGradient = ctx.createLinearGradient(photoX, photoY, photoX + photoWidth, photoY + photoHeight);
        fallbackPhotoGradient.addColorStop(0, accentSecondary);
        fallbackPhotoGradient.addColorStop(0.48, mixHexColors(accentPrimary, posterBase, 0.34));
        fallbackPhotoGradient.addColorStop(1, accentDeep);
        ctx.fillStyle = fallbackPhotoGradient;
        ctx.fillRect(photoX, photoY, photoWidth, photoHeight);

        ctx.save();
        ctx.strokeStyle = hexToRGBA(headlineColor, 0.12);
        ctx.lineWidth = 2;
        for (let x = photoX - photoHeight; x < photoX + photoWidth + photoHeight; x += sx(62)) {
            ctx.beginPath();
            ctx.moveTo(x, photoY);
            ctx.lineTo(x + photoHeight * 0.56, photoY + photoHeight);
            ctx.stroke();
        }
        ctx.restore();

        if (fallbackLogo) {
            drawNeutralizedBackdropMark(
                ctx,
                fallbackLogo,
                photoX + photoWidth / 2,
                offsetElementY('tournamentLogo', photoY + photoHeight / 2),
                sx(244),
                sy(244),
                headlineColor === '#ffffff' ? '#ffffff' : '#0f172a',
                0.12
            );
        }
    }

    ctx.save();
    ctx.strokeStyle = hexToRGBA(headlineColor === '#ffffff' ? '#ffffff' : '#0f172a', 0.14);
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX + 1, photoY + 1, photoWidth - 2, photoHeight - 2);
    ctx.restore();

    if (tournamentLogo) {
        drawOverflowCrest(ctx, {
            x: photoX + sx(44),
            y: offsetElementY('tournamentLogo', photoY + sy(58)),
            width: sx(54),
            height: sy(54),
            img: tournamentLogo,
            label: data.tournament || 'Tournament',
            rawLogo: data.tournamentLogo,
            isDark: getContrastColor(frameColor) === '#ffffff',
            showFrame: false,
        });
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mutedHeadline;
    ctx.font = `800 ${sy(18)}px ${FONT_MONO}`;
    ctx.fillText(truncateTextToWidth(ctx, kickerText || competitionText, heroMaxWidth), heroLeftX, offsetElementY('title', sy(112)));
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hexToRGBA(headlineColor, 0.12);
    ctx.fillRect(heroLeftX, sy(128), sx(84), sy(4));
    ctx.restore();

    drawCondensedHeroWord('PROXIMO', heroLeftX, heroTopY, heroMaxWidth, scaleElementSize('title', sy(246), 118));
    drawCondensedHeroWord('PARTIDO', heroLeftX, heroBottomY, heroMaxWidth, scaleElementSize('title', sy(246), 118));

    if (competitionText) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = hexToRGBA(headlineColor, 0.64);
        ctx.font = `800 ${sy(18)}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, competitionText, heroMaxWidth), heroLeftX, sy(846));
        ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = sy(20);
    ctx.shadowOffsetY = sy(12);
    ctx.fillStyle = leftInfoFill;
    ctx.fillRect(infoBlockX, infoBlockY, infoBlockWidth, infoBlockHeight);
    ctx.restore();

    const matchupLayout = fitTextLinesToWidth(
        ctx,
        matchupText,
        infoBlockWidth - sx(34),
        '900',
        scaleElementSize('teamName', sy(44), 34),
        FONT_EDITORIAL_SCORE,
        sy(26),
        2
    );

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = leftInfoText;
    ctx.font = `900 ${matchupLayout.size}px ${FONT_EDITORIAL_SCORE}`;
    matchupLayout.lines.forEach((line, index) => {
        ctx.fillText(line, infoBlockX + sx(18), offsetElementY('teamName', infoBlockY + sy(56) + index * (matchupLayout.size + sy(6))));
    });
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mutedHeadline;
    ctx.font = `800 ${sy(16)}px ${FONT_MONO}`;
    ctx.fillText(truncateTextToWidth(ctx, dateText, sx(250)), metaLeftX, metaDateY);
    ctx.restore();

    const koPillX = metaLeftX;
    const koPillY = sy(1128);
    const koPillWidth = sx(68);
    const koPillHeight = sy(38);

    ctx.save();
    ctx.fillStyle = accentPrimary;
    ctx.fillRect(koPillX, koPillY, koPillWidth, koPillHeight);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getContrastColor(accentPrimary);
    ctx.font = `900 ${sy(18)}px ${FONT_MONO}`;
    ctx.fillText('KO', koPillX + koPillWidth / 2, koPillY + koPillHeight / 2 + 1);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = headlineColor;
    ctx.font = `900 ${scaleElementSize('score', sy(42), 212)}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(truncateTextToWidth(ctx, timeText, sx(250)), koPillX + koPillWidth + sx(20), sy(1158));
    ctx.restore();

    if (venueText) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = mutedHeadline;
        ctx.font = `800 ${sy(18)}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, venueText, sx(430)), metaLeftX, metaVenueY);
        ctx.restore();
    }

    drawLogoPlate(homeLogoPlateX, neutralLogoPlate, neutralLogoText, homeLogo, data.homeTeam, data.homeLogo, 'HOME');
    drawLogoPlate(awayLogoPlateX, accentLogoPlate, accentLogoText, awayLogo, data.awayTeam, data.awayLogo, 'AWAY');

    const footerLineY = sy(1264);
    const footerLogoSize = scaleElementSize('tournamentLogo', sx(86), 323);
    const footerLineGap = Math.max(sx(122), Math.round(footerLogoSize * 0.9));

    ctx.save();
    ctx.strokeStyle = accentStroke;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx(26), footerLineY);
    ctx.lineTo(canvas.width / 2 - footerLineGap, footerLineY);
    ctx.moveTo(canvas.width / 2 + footerLineGap, footerLineY);
    ctx.lineTo(canvas.width - sx(26), footerLineY);
    ctx.stroke();
    ctx.restore();

    if (fallbackLogo) {
        drawOverflowCrest(ctx, {
            x: canvas.width / 2,
            y: offsetElementY('tournamentLogo', footerLineY),
            width: footerLogoSize,
            height: footerLogoSize,
            img: fallbackLogo,
            label: data.tournament || 'G22 Scores',
            rawLogo: tournamentLogo ? data.tournamentLogo : '/icon.png',
            isDark: headlineColor === '#ffffff',
            showFrame: false,
        });
    }
}

async function drawMatchEditorialResult(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    backgroundImageSrc: string,
    gradientLeftColor: string,
    gradientRightColor: string
) {
    const editorialPreset = getEditorialLayoutPreset(data.editorialLayoutPresetId);
    const sponsors = getActiveEditorialSponsors(buildEditorialSponsorSlots(data.sponsors));
    const [backgroundImage, homeLogo, awayLogo, tournamentLogo, textureImage, gradientImage, ...sponsorImages] = await Promise.all([
        loadImage(backgroundImageSrc),
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(EDITORIAL_TEXTURE_SOURCE),
        loadImage(data.editorialGradientImage || ''),
        ...sponsors.map((sponsor) => loadImage(sponsor.logo || '')),
    ]);

    if (!backgroundImage) {
        throw new Error('No se pudo cargar la foto de fondo');
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCoverImage(ctx, canvas, backgroundImage, { focusX: 0.56, focusY: 0.4 });
    const overlayTop = canvas.height * (format.height > format.width ? 0.61 : 0.58);

    ctx.save();
    ctx.font = `900 ${editorialPreset.scoreFontSize}px ${FONT_EDITORIAL_SCORE}`;
    const scoreMetrics = ctx.measureText('88');
    ctx.restore();

    const scoreAscent = scoreMetrics.actualBoundingBoxAscent || 196;
    const scoreDescent = scoreMetrics.actualBoundingBoxDescent || 22;
    const scoreHeight = scoreAscent + scoreDescent;
    const lineColor = 'rgba(255, 255, 255, 0.88)';
    const sidePadding = 72;
    const leftColumnX = editorialPreset.scoreInset;
    const rightColumnX = canvas.width - editorialPreset.scoreInset;
    const lineHalfWidth = editorialPreset.lineWidth / 2;
    const leftLineStartX = leftColumnX - lineHalfWidth;
    const leftLineEndX = leftColumnX + lineHalfWidth;
    const rightLineStartX = rightColumnX - lineHalfWidth;
    const rightLineEndX = rightColumnX + lineHalfWidth;
    const bottomRuleY = canvas.height - editorialPreset.bottomRuleInset;
    const topRuleY = bottomRuleY - editorialPreset.scoreBottomGap - scoreHeight - editorialPreset.scoreTopGap;
    const scoreTopY = topRuleY + editorialPreset.scoreTopGap;
    const scoreBaselineY = scoreTopY + scoreAscent;
    const scoreCenterY = scoreTopY + scoreHeight / 2;
    const titleY = topRuleY;
    const tournamentLogoY = scoreCenterY + editorialPreset.tournamentLogoOffsetY;
    const teamLogoWidth = Math.round(editorialPreset.logoWidth * 1.25);
    const teamLogoHeight = Math.round(editorialPreset.logoHeight * 1.25);
    const teamLogoBottomGap = 15;
    const crestStrokeWidth = 5;
    const crestInset = Math.max(crestStrokeWidth + 4, Math.min(teamLogoWidth, teamLogoHeight) * 0.08);
    const defaultTeamLogoY = topRuleY - editorialPreset.logoOffsetY;
    const resolveTeamLogoY = (logo: HTMLImageElement | null) => {
        if (!logo) return defaultTeamLogoY;

        const placement = getContainedOpaquePlacement(
            logo,
            0,
            0,
            teamLogoWidth,
            teamLogoHeight,
            crestInset
        );
        const visibleBottomWithStroke = placement.visibleBottom + crestStrokeWidth;
        return topRuleY - teamLogoBottomGap - visibleBottomWithStroke;
    };
    const homeLogoY = resolveTeamLogoY(homeLogo);
    const awayLogoY = resolveTeamLogoY(awayLogo);
    const gradientStartY = Math.max(Math.round(titleY - editorialPreset.titleFontSize * 0.95), Math.round(overlayTop - 16));
    const usesUploadedGradientImage = Boolean(gradientImage);

    if (!usesUploadedGradientImage) {
        const topShade = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.24);
        topShade.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
        topShade.addColorStop(0.54, 'rgba(0, 0, 0, 0.18)');
        ctx.fillStyle = topShade;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!usesUploadedGradientImage) {
        const bottomShade = ctx.createLinearGradient(0, gradientStartY - 24, 0, canvas.height);
        bottomShade.addColorStop(0, 'rgba(2, 6, 10, 0)');
        bottomShade.addColorStop(0.16, 'rgba(2, 6, 10, 0.46)');
        bottomShade.addColorStop(0.56, 'rgba(2, 6, 10, 0.6)');
        bottomShade.addColorStop(1, `rgba(2, 6, 10, ${editorialPreset.gradientBottomOpacity})`);
        ctx.fillStyle = bottomShade;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (usesUploadedGradientImage) {
        drawEditorialGradientImage(ctx, canvas, gradientImage);
    } else {
        const gradientHeight = canvas.height - gradientStartY;
        const gradientLayer = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        if (gradientLayer) {
            gradientLayer.width = canvas.width;
            gradientLayer.height = gradientHeight;
            const gradientLayerCtx = gradientLayer.getContext('2d');

            if (gradientLayerCtx) {
                const centerBlendColor = mixHexColors(gradientLeftColor, gradientRightColor, 0.5);
                const horizontalBlend = gradientLayerCtx.createLinearGradient(0, 0, gradientLayer.width, 0);
                horizontalBlend.addColorStop(0, hexToRGBA(gradientLeftColor, 1));
                horizontalBlend.addColorStop(0.2, hexToRGBA(gradientLeftColor, 1));
                horizontalBlend.addColorStop(0.5, hexToRGBA(centerBlendColor, 1));
                horizontalBlend.addColorStop(0.8, hexToRGBA(gradientRightColor, 1));
                horizontalBlend.addColorStop(1, hexToRGBA(gradientRightColor, 1));
                gradientLayerCtx.fillStyle = horizontalBlend;
                gradientLayerCtx.fillRect(0, 0, gradientLayer.width, gradientLayer.height);

                const leftBloom = gradientLayerCtx.createRadialGradient(
                    gradientLayer.width * 0.14,
                    gradientLayer.height * 0.9,
                    12,
                    gradientLayer.width * 0.14,
                    gradientLayer.height * 0.9,
                    gradientLayer.width * 0.34
                );
                leftBloom.addColorStop(0, hexToRGBA(gradientLeftColor, 0.68));
                leftBloom.addColorStop(0.64, hexToRGBA(gradientLeftColor, 0.3));
                leftBloom.addColorStop(1, 'rgba(255, 41, 84, 0)');
                gradientLayerCtx.fillStyle = leftBloom;
                gradientLayerCtx.fillRect(0, 0, gradientLayer.width, gradientLayer.height);

                const rightBloom = gradientLayerCtx.createRadialGradient(
                    gradientLayer.width * 0.86,
                    gradientLayer.height * 0.9,
                    12,
                    gradientLayer.width * 0.86,
                    gradientLayer.height * 0.9,
                    gradientLayer.width * 0.34
                );
                rightBloom.addColorStop(0, hexToRGBA(gradientRightColor, 0.68));
                rightBloom.addColorStop(0.64, hexToRGBA(gradientRightColor, 0.3));
                rightBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
                gradientLayerCtx.fillStyle = rightBloom;
                gradientLayerCtx.fillRect(0, 0, gradientLayer.width, gradientLayer.height);

                gradientLayerCtx.globalCompositeOperation = 'destination-in';
                const verticalFade = gradientLayerCtx.createLinearGradient(0, 0, 0, gradientLayer.height);
                verticalFade.addColorStop(0, 'rgba(0,0,0,0)');
                verticalFade.addColorStop(0.16, 'rgba(0,0,0,0.16)');
                verticalFade.addColorStop(0.42, 'rgba(0,0,0,0.58)');
                verticalFade.addColorStop(0.72, 'rgba(0,0,0,0.94)');
                verticalFade.addColorStop(1, 'rgba(0,0,0,1)');
                gradientLayerCtx.fillStyle = verticalFade;
                gradientLayerCtx.fillRect(0, 0, gradientLayer.width, gradientLayer.height);

                ctx.save();
                ctx.globalCompositeOperation = 'soft-light';
                ctx.globalAlpha = 0.6;
                ctx.drawImage(gradientLayer, 0, gradientStartY);
                ctx.restore();

                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.55;
                ctx.drawImage(gradientLayer, 0, gradientStartY);
                ctx.restore();
            }
        }

        drawEditorialGradientTexture(ctx, canvas, textureImage, gradientStartY);
    }

    if (!usesUploadedGradientImage) {
        const centerVignette = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, 110, canvas.width / 2, canvas.height * 0.66, canvas.width * 0.88);
        centerVignette.addColorStop(0, 'rgba(255,255,255,0)');
        centerVignette.addColorStop(1, 'rgba(2, 6, 10, 0.22)');
        ctx.fillStyle = centerVignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (data.editorialShowTopBadge !== false) {
        drawEditorialTopBadge(ctx, (data.mainTitle || getStatusLabel(data.status)).replace('PROGRAMADO', 'FIXTURE'));
    }
    if (data.editorialShowHeaderArrows !== false) {
        drawEditorialHeaderArrows(ctx, canvas);
    }

    drawEditorialCrestStroke(ctx, leftColumnX, homeLogoY, teamLogoWidth, teamLogoHeight, homeLogo, crestStrokeWidth);
    drawOverflowCrest(ctx, {
        x: leftColumnX,
        y: homeLogoY,
        width: teamLogoWidth,
        height: teamLogoHeight,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: true,
        showFrame: false,
    });
    drawEditorialCrestStroke(ctx, rightColumnX, awayLogoY, teamLogoWidth, teamLogoHeight, awayLogo, crestStrokeWidth);
    drawOverflowCrest(ctx, {
        x: rightColumnX,
        y: awayLogoY,
        width: teamLogoWidth,
        height: teamLogoHeight,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: true,
        showFrame: false,
    });

    const contextLabel = buildEditorialContextLabel(data);
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftLineStartX, topRuleY);
    ctx.lineTo(leftLineEndX, topRuleY);
    ctx.moveTo(rightLineStartX, topRuleY);
    ctx.lineTo(rightLineEndX, topRuleY);
    ctx.moveTo(sidePadding, bottomRuleY);
    ctx.lineTo(canvas.width - sidePadding, bottomRuleY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${editorialPreset.titleFontSize}px ${FONT_BODY}`;
    ctx.fillText(contextLabel, canvas.width / 2, titleY + 1);
    ctx.restore();

    if (tournamentLogo) {
        drawEditorialCrestStroke(
            ctx,
            canvas.width / 2,
            tournamentLogoY,
            editorialPreset.tournamentLogoSize,
            editorialPreset.tournamentLogoSize,
            tournamentLogo,
            5,
        );
        drawOverflowCrest(ctx, {
            x: canvas.width / 2,
            y: tournamentLogoY,
            width: editorialPreset.tournamentLogoSize,
            height: editorialPreset.tournamentLogoSize,
            img: tournamentLogo,
            label: data.tournament || 'Torneo',
            rawLogo: data.tournamentLogo,
            isDark: true,
        });
    } else {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        ctx.font = `900 40px ${FONT_EDITORIAL}`;
        ctx.fillText(getFallbackLogoText(data.tournamentLogo, data.tournament || 'Torneo'), canvas.width / 2, tournamentLogoY);
        ctx.restore();
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.font = `900 ${editorialPreset.scoreFontSize}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(String(data.homeScore ?? '-'), leftColumnX, scoreBaselineY);
    ctx.fillText(String(data.awayScore ?? '-'), rightColumnX, scoreBaselineY);
    ctx.restore();

    const sponsorBandCenterY = bottomRuleY + Math.round(editorialPreset.sponsorLogoHeight * 0.5) + 12;
    drawEditorialSponsorsRow(
        ctx,
        canvas,
        sponsors,
        sponsorImages,
        brandLogo,
        sponsorBandCenterY,
        editorialPreset.sponsorLogoHeight,
        editorialPreset.sponsorGap
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function drawLegacyClassicMatchPanel(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const isScheduled = data.status === 'scheduled';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.72);
    const softColor = getMutedColor(isDark, 0.12);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const scaleX = canvas.width / 1080;
    const scaleY = canvas.height / 1350;
    const uiScale = isStory ? 1.08 : 1;
    const sx = (value: number) => Math.round(value * scaleX);
    const sy = (value: number) => Math.round(value * scaleY);
    const ss = (value: number) => Math.round(value * uiScale);
    const [homeLogo, awayLogo, tournamentLogo, mediaImage] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(data.backgroundImage || ''),
    ]);

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    const headerX = sx(54);
    const headerY = sy(40);
    const headerHeight = sy(70);
    const headerLogoSize = ss(42);
    const headerTextX = headerX + headerLogoSize + sx(14);
    const headerStatus = (data.mainTitle || getStatusLabel(data.status)).toUpperCase();

    drawLogoBadge(ctx, {
        x: headerX + headerLogoSize / 2,
        y: headerY + headerHeight / 2,
        size: headerLogoSize,
        img: tournamentLogo,
        label: data.tournament || 'Torneo',
        rawLogo: data.tournamentLogo,
        isDark,
    });

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = textColor;
    ctx.font = `800 ${ss(18)}px ${FONT_BODY}`;
    ctx.fillText(
        truncateTextToWidth(ctx, (data.tournament || 'TORNEO').toUpperCase(), sx(430)),
        headerTextX,
        headerY + headerHeight / 2 + 1
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = mutedColor;
    ctx.font = `700 ${ss(15)}px ${FONT_BODY}`;
    ctx.fillText(headerStatus, canvas.width - sx(54), headerY + headerHeight / 2 + 1);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(accentColor, isDark ? 0.42 : 0.26);
    ctx.lineWidth = Math.max(2, sx(2));
    ctx.beginPath();
    ctx.moveTo(sx(54), sy(108));
    ctx.lineTo(canvas.width - sx(54), sy(108));
    ctx.stroke();
    ctx.restore();

    const mediaPanelX = sx(64);
    const mediaPanelY = sy(135);
    const mediaPanelWidth = sx(952);
    const mediaPanelHeight = sy(430);
    const mediaPanelRadius = ss(36);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mediaPanelX, mediaPanelY, mediaPanelWidth, mediaPanelHeight, mediaPanelRadius);
    ctx.clip();

    if (mediaImage) {
        const sourceWidth = mediaImage.naturalWidth || mediaImage.width || mediaPanelWidth;
        const sourceHeight = mediaImage.naturalHeight || mediaImage.height || mediaPanelHeight;
        const scale = Math.max(mediaPanelWidth / sourceWidth, mediaPanelHeight / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const drawX = mediaPanelX + (mediaPanelWidth - drawWidth) / 2;
        const drawY = mediaPanelY + (mediaPanelHeight - drawHeight) / 2;
        ctx.drawImage(mediaImage, drawX, drawY, drawWidth, drawHeight);

        const mediaOverlay = ctx.createLinearGradient(mediaPanelX, mediaPanelY, mediaPanelX, mediaPanelY + mediaPanelHeight);
        mediaOverlay.addColorStop(0, hexToRGBA(bgColor, isDark ? 0.22 : 0.08));
        mediaOverlay.addColorStop(1, hexToRGBA(bgColor, isDark ? 0.42 : 0.14));
        ctx.fillStyle = mediaOverlay;
        ctx.fillRect(mediaPanelX, mediaPanelY, mediaPanelWidth, mediaPanelHeight);
    } else {
        const mediaFill = ctx.createLinearGradient(mediaPanelX, mediaPanelY, mediaPanelX + mediaPanelWidth, mediaPanelY + mediaPanelHeight);
        mediaFill.addColorStop(0, hexToRGBA(accentColor, isDark ? 0.18 : 0.12));
        mediaFill.addColorStop(1, hexToRGBA(isDark ? '#ffffff' : '#0f172a', isDark ? 0.06 : 0.03));
        ctx.fillStyle = mediaFill;
        ctx.fillRect(mediaPanelX, mediaPanelY, mediaPanelWidth, mediaPanelHeight);

        const sheen = ctx.createLinearGradient(mediaPanelX, mediaPanelY, mediaPanelX + mediaPanelWidth, mediaPanelY + mediaPanelHeight);
        sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
        sheen.addColorStop(0.35, 'rgba(255,255,255,0.02)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(mediaPanelX, mediaPanelY, mediaPanelWidth, mediaPanelHeight);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.56)';
    ctx.beginPath();
    ctx.roundRect(mediaPanelX, mediaPanelY, mediaPanelWidth, mediaPanelHeight, mediaPanelRadius);
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const scoreLabelText = isScheduled ? 'HORARIO' : 'RESULTADO';
    const scoreValueText = isScheduled
        ? (data.time || '--:--')
        : `${data.homeScore ?? '-'} - ${data.awayScore ?? '-'}`;
    const scoreLabelY = sy(610);
    const scoreValueY = sy(690);
    const teamLogoSize = ss(74);
    const leftTeamX = sx(180);
    const rightTeamX = canvas.width - sx(180);
    const teamLogoCenterY = sy(796);
    const teamNameY = offsetElementY('teamName', sy(848));
    const teamNameMaxWidth = sx(250);

    const matchResultNameFontSize = getSharedFittedFontSize(
        ctx,
        [
            { text: data.homeTeam.trim().toUpperCase(), maxWidth: teamNameMaxWidth },
            { text: data.awayTeam.trim().toUpperCase(), maxWidth: teamNameMaxWidth },
        ],
        '800',
        scaleElementSize('teamName', ss(28), ss(28)),
        FONT_DISPLAY,
        ss(22),
    );

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = accentColor;
    ctx.font = `900 ${ss(72)}px ${FONT_DISPLAY}`;
    ctx.fillText(scoreLabelText, safe.centerX, scoreLabelY);

    ctx.shadowColor = isDark ? 'rgba(0,0,0,0.34)' : 'rgba(15,23,42,0.16)';
    ctx.shadowBlur = ss(22);
    ctx.shadowOffsetY = ss(8);
    ctx.fillStyle = textColor;
    ctx.font = `900 ${ss(isScheduled ? 110 : 138)}px ${isScheduled ? FONT_MONO : FONT_CLASSIC_MATCH_SCORE}`;
    ctx.fillText(scoreValueText, safe.centerX, scoreValueY);
    ctx.restore();

    drawOverflowCrest(ctx, {
        x: leftTeamX,
        y: teamLogoCenterY,
        width: teamLogoSize,
        height: teamLogoSize,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: rightTeamX,
        y: teamLogoCenterY,
        width: teamLogoSize,
        height: teamLogoSize,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark,
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = textColor;
    ctx.font = `800 ${matchResultNameFontSize}px ${FONT_DISPLAY}`;
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.toUpperCase(), teamNameMaxWidth), leftTeamX, teamNameY);
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.toUpperCase(), teamNameMaxWidth), rightTeamX, teamNameY);
    ctx.restore();

    const stats = data.stats.slice(0, 6);

    if (stats.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${ss(20)}px ${FONT_BODY}`;
        ctx.fillText('No hay estadisticas disponibles para este partido.', safe.centerX, sy(932));
        ctx.restore();
    } else {
        let columns = 3;
        let rows = 1;
        let cardWidth = sx(286);
        let cardHeight = sy(92);
        let gapX = sx(18);
        let gapY = sy(14);
        let startX = sx(93);
        let startY = sy(930);

        if (stats.length === 4) {
            columns = 2;
            rows = 2;
            cardWidth = sx(396);
            cardHeight = sy(86);
            gapX = sx(18);
            gapY = sy(16);
            startX = sx(135);
            startY = sy(910);
        } else if (stats.length >= 5) {
            columns = 3;
            rows = 2;
            cardWidth = sx(286);
            cardHeight = sy(78);
            gapX = sx(18);
            gapY = sy(14);
            startX = sx(93);
            startY = sy(900);
        } else if (stats.length < 3) {
            columns = stats.length;
            rows = 1;
            cardWidth = stats.length === 1 ? sx(520) : sx(438);
            cardHeight = sy(92);
            gapX = sx(18);
            gapY = sy(14);
            const totalWidth = cardWidth * columns + gapX * Math.max(columns - 1, 0);
            startX = Math.round((canvas.width - totalWidth) / 2);
            startY = sy(930);
        }

        stats.forEach((stat, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            if (row >= rows) return;

            const x = startX + column * (cardWidth + gapX);
            const y = startY + row * (cardHeight + gapY);

            ctx.save();
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.74)';
            ctx.beginPath();
            ctx.roundRect(x, y, cardWidth, cardHeight, ss(22));
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = mutedColor;
            setFittedFont(ctx, stat.label.toUpperCase(), cardWidth - sx(36), '800', ss(16), FONT_BODY, ss(12));
            ctx.fillText(truncateTextToWidth(ctx, stat.label.toUpperCase(), cardWidth - sx(36)), x + cardWidth / 2, y + sy(12));

            ctx.fillStyle = textColor;
            ctx.font = `900 ${ss(22)}px ${FONT_MONO}`;
            ctx.fillText(`${stat.home} - ${stat.away}`, x + cardWidth / 2, y + Math.round(cardHeight / 2));
            ctx.restore();
        });
    }

    const metaLine = [data.date, data.time, data.venue].filter(Boolean).join('  /  ');
    if (metaLine) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = mutedColor;
        setFittedFont(ctx, metaLine.toUpperCase(), canvas.width - sx(140), '700', ss(15), FONT_BODY, ss(11));
        ctx.fillText(metaLine.toUpperCase(), safe.centerX, sy(1166));
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = softColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(54), sy(1260));
    ctx.lineTo(canvas.width - sx(54), sy(1260));
    ctx.stroke();
    ctx.restore();

    const footerLabelY = sy(1210);
    const footerWordmarkY = sy(1238);
    const footerIconSize = ss(30);
    const footerGap = sx(10);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = getMutedColor(isDark, 0.62);
    ctx.font = `600 ${ss(15)}px ${FONT_BODY}`;
    ctx.fillText('Info aportada por', safe.centerX, footerLabelY);
    ctx.restore();

    ctx.save();
    ctx.font = `800 ${ss(24)}px ${FONT_DISPLAY}`;
    const g22Width = ctx.measureText('G22').width;
    ctx.font = `800 ${ss(24)}px ${FONT_BODY}`;
    const scoresWidth = ctx.measureText('Scores').width;
    const totalWidth = footerIconSize + footerGap + g22Width + sx(8) + scoresWidth;
    const startX = safe.centerX - totalWidth / 2;
    ctx.restore();

    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: startX + footerIconSize / 2,
            y: footerWordmarkY + footerIconSize / 2 - sy(2),
            size: footerIconSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark,
        });
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 ${ss(24)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = BRAND_ACCENT;
    ctx.fillText('G22', startX + footerIconSize + footerGap, footerWordmarkY);
    ctx.font = `800 ${ss(24)}px ${FONT_BODY}`;
    ctx.fillStyle = textColor;
    ctx.fillText('Scores', startX + footerIconSize + footerGap + g22Width + sx(8), footerWordmarkY);
    ctx.restore();
}

function drawClassicResultAccentShape(
    ctx: CanvasRenderingContext2D,
    points: Array<[number, number]>,
    fillStyle: string,
) {
    if (points.length < 3) return;
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// El partido clasico de G22 Base: la placa. El modo (resultado u horario) ya
// viaja en `status` — lo pone applyMatchExportMode antes de dibujar.
async function drawMatchResult(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    _brandLogo: HTMLImageElement | null,
    plateOptions?: ExportPlateOptions,
) {
    await drawG22BasePlate(ctx, canvas, data, accentColor, bgColor, plateOptions);
}

async function drawStandings(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const isDenseStandingsSlide = slide.totalRows > 16;
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.68);
    const softColor = getMutedColor(isDark, 0.1);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const slideRows = slide.groups.flatMap((group) => group.rows);
    const legendItems = collectStandingsLegendEntries(slideRows, accentColor);
    const [tournamentLogo, ...teamLogos] = await Promise.all([
        loadImage(getTournamentLogoImageSource(data)),
        ...slideRows.map((row) => loadImage(row.teamLogo || '')),
    ]);
    const subtitleText = buildStandingsSlideSubtitle(data.subtitle, slide);
    const playedLabel = data.columnLabels?.played?.trim() || 'PJ';
    const wonLabel = data.columnLabels?.won?.trim() || 'G';
    const lostLabel = data.columnLabels?.lost?.trim() || 'P';
    const diffLabel = data.columnLabels?.diff?.trim() || 'DIF';
    const pointsLabel = data.columnLabels?.points?.trim() || 'PTS';
    const showPositionDelta = data.showPositionDelta === true;

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        isStory ? 74 : 56,
        'TABLA DE POSICIONES',
        accentColor,
        getContrastColor(accentColor),
        `800 ${scaleElementSize('title', isStory ? 24 : 20, isStory ? 24 : 20)}px ${FONT_BODY}`,
        24,
        scaleElementSize('title', isStory ? 48 : 42, isStory ? 48 : 42)
    );
    drawTournamentRibbon(ctx, canvas, data.title, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 166 : 138, scaleElementSize('title', isStory ? 26 : 22, isStory ? 26 : 22));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
    ctx.fillText(subtitleText, safe.centerX, isStory ? 208 : 178);
    ctx.restore();

    const panelX = isStory ? 46 : 54;
    const panelY = offsetElementY('rowHeight', isStory ? 252 : (isDenseStandingsSlide ? 216 : 224));
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 22 : (isDenseStandingsSlide ? 6 : 10));
    const tableRight = panelX + panelWidth - 24;
    const pointsWidth = isStory ? 116 : (isDenseStandingsSlide ? 112 : 118);
    const diffWidth = isStory ? 132 : (isDenseStandingsSlide ? 124 : 132);
    const lostWidth = isStory ? 72 : 70;
    const wonWidth = isStory ? 80 : 78;
    const playedWidth = isStory ? 74 : 72;
    const colPointsLeft = tableRight - pointsWidth;
    const colDiffLeft = colPointsLeft - diffWidth;
    const colLostLeft = colDiffLeft - lostWidth;
    const colWonLeft = colLostLeft - wonWidth;
    const colPlayedLeft = colWonLeft - playedWidth;
    const colPlayedX = colPlayedLeft + playedWidth / 2;
    const colWonX = colWonLeft + wonWidth / 2;
    const colLostX = colLostLeft + lostWidth / 2;
    const colDiffX = colDiffLeft + diffWidth / 2;
    const colPointsX = colPointsLeft + pointsWidth / 2;
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    const headerFontSize = isStory ? 18 : (isDenseStandingsSlide ? 15 : 16);
    const headerY = panelY + (isDenseStandingsSlide ? 30 : 34);
    ctx.save();
    ctx.fillStyle = mutedColor;
    ctx.font = `700 ${headerFontSize}px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('POS', panelX + 58, headerY);
    ctx.textAlign = 'left';
    ctx.fillText('EQUIPO', panelX + 118, headerY);
    ctx.textAlign = 'center';
    ctx.fillText(playedLabel.toUpperCase(), colPlayedX, headerY);
    ctx.fillText(wonLabel.toUpperCase(), colWonX, headerY);
    ctx.fillText(lostLabel.toUpperCase(), colLostX, headerY);
    ctx.fillText(diffLabel.toUpperCase(), colDiffX, headerY);
    ctx.fillText(pointsLabel.toUpperCase(), colPointsX, headerY);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = softColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 24, headerY + 18);
    ctx.lineTo(panelX + panelWidth - 24, headerY + 18);
    ctx.stroke();
    ctx.restore();

    const legendLayout = buildStandingsLegendLayout(ctx, legendItems, panelWidth - 48, isStory);
    const bodyTop = headerY + (isDenseStandingsSlide ? 42 : 46);
    const bodyBottom = panelY + panelHeight - 24 - (legendLayout.totalHeight > 0 ? legendLayout.totalHeight + (isStory ? 26 : 22) : 0);
    const hasGroupHeaders = slide.groups.some((group) => group.name);
    const groupTitleHeight = hasGroupHeaders ? (isStory ? (isDenseStandingsSlide ? 32 : 34) : (isDenseStandingsSlide ? 28 : 30)) : 0;
    const groupTitleGap = hasGroupHeaders ? (isStory ? (isDenseStandingsSlide ? 8 : 10) : (isDenseStandingsSlide ? 6 : 8)) : 0;
    const interGroupGap = hasGroupHeaders ? (isStory ? (isDenseStandingsSlide ? 10 : 12) : (isDenseStandingsSlide ? 8 : 10)) : 0;
    const reservedGroupSpace = slide.groups.reduce((total, group, index) => {
        if (!group.name) return total;
        return total + groupTitleHeight + groupTitleGap + (index > 0 ? interGroupGap : 0);
    }, 0);
    const rawRowHeight = (bodyBottom - bodyTop - reservedGroupSpace) / Math.max(slide.totalRows, 1);
    const rowHeight = scaleElementSize('rowHeight', Math.max(isStory ? (isDenseStandingsSlide ? 30 : 32) : (isDenseStandingsSlide ? 26 : 30), Math.min(isStory ? 70 : 62, rawRowHeight)), isStory ? 32 : 30);
    const crestHeight = scaleElementSize(
        'teamLogo',
        Math.min(
            isStory ? 58 : 52,
            Math.max(isStory ? (isDenseStandingsSlide ? 40 : 44) : (isDenseStandingsSlide ? 34 : 38), rowHeight - 2)
        ),
        48
    );
    const crestWidth = scaleElementSize('teamLogo', Math.min(isStory ? 54 : 48, crestHeight * 0.92), 48);
    const posFontSize = Math.max(isStory ? 20 : (isDenseStandingsSlide ? 18 : 20), Math.min(isStory ? 30 : 26, Math.round(rowHeight * 0.44)));
    const statFontSize = Math.max(isStory ? 16 : (isDenseStandingsSlide ? 14 : 16), Math.min(isStory ? 26 : 22, Math.round(rowHeight * 0.36)));
    const pointsFontSize = Math.max(isStory ? 20 : (isDenseStandingsSlide ? 18 : 20), Math.min(isStory ? 30 : 26, Math.round(rowHeight * 0.42)));
    const colPosX = panelX + 58;
    const colTeamX = panelX + 118;
    const crestLeft = colTeamX - Math.round(crestWidth * 0.18);
    const crestCenterX = crestLeft + crestWidth / 2;
    const teamTextX = crestLeft + crestWidth + 14;
    const teamMaxWidth = colPlayedLeft - teamTextX - 22;
    const baseTeamFontSize = Math.min(isStory ? 30 : 26, Math.round(rowHeight * 0.4));
    const sharedTeamFontSize = getSharedFittedFontSize(
        ctx,
        slideRows.map((row) => ({
            text: row.team.trim().toUpperCase(),
            maxWidth: Math.max(72, teamMaxWidth),
        })),
        '900',
        baseTeamFontSize,
        FONT_OUTFIT_BLACK,
        8,
    );
    let logoIndex = 0;
    let rowIndex = 0;
    let cursorY = bodyTop;

    slide.groups.forEach((group, groupIndex) => {
        const groupLabel = formatStandingsGroupLabel(group);
        if (groupLabel) {
            if (groupIndex > 0) cursorY += interGroupGap;

            ctx.save();
            ctx.font = `800 ${isStory ? 18 : (isDenseStandingsSlide ? 15 : 16)}px ${FONT_BODY}`;
            const pillWidth = Math.min(panelWidth - 48, ctx.measureText(groupLabel).width + 28);
            ctx.fillStyle = hexToRGBA(accentColor, isDark ? 0.16 : 0.12);
            ctx.beginPath();
            ctx.roundRect(panelX + 24, cursorY, pillWidth, groupTitleHeight, 999);
            ctx.fill();
            ctx.fillStyle = accentColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(groupLabel, panelX + 38, cursorY + groupTitleHeight / 2 + 1);
            ctx.restore();

            cursorY += groupTitleHeight + groupTitleGap;
        }

        group.rows.forEach((row) => {
            const y = cursorY;
            const centerY = y + rowHeight / 2;
            const rowLabel = row.labelName?.trim() || '';
            const rowAccentColor = row.zoneColor || accentColor;
            const rowBg = rowLabel
                ? hexToRGBA(rowAccentColor, isDark ? 0.18 : 0.12)
                : rowIndex % 2 === 0
                    ? hexToRGBA(accentColor, isDark ? 0.05 : 0.035)
                    : 'transparent';

            ctx.save();
            if (rowBg !== 'transparent') {
                ctx.fillStyle = rowBg;
                ctx.beginPath();
                ctx.roundRect(panelX + 14, y + 2, panelWidth - 28, rowHeight - 4, 7);
                ctx.fill();
            }
            if (rowLabel) {
                ctx.strokeStyle = hexToRGBA(rowAccentColor, isDark ? 0.34 : 0.22);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(panelX + 14, y + 2, panelWidth - 28, rowHeight - 4, 7);
                ctx.stroke();
            }

            ctx.fillStyle = rowAccentColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${posFontSize}px ${FONT_MONO}`;
            ctx.fillText(String(row.pos), colPosX, centerY + 1);

            drawOverflowCrest(ctx, {
                x: crestCenterX,
                y: centerY,
                width: crestWidth,
                height: crestHeight,
                img: teamLogos[logoIndex] || null,
                label: row.team,
                rawLogo: row.teamLogo,
                isDark,
            });
            logoIndex += 1;

            ctx.textAlign = 'left';
            ctx.fillStyle = textColor;
            ctx.textBaseline = 'middle';
            drawStandingsTeamName(ctx, row.team, teamTextX, centerY, sharedTeamFontSize);

            ctx.textAlign = 'center';
            ctx.font = `700 ${statFontSize}px ${FONT_BODY}`;
            ctx.fillText(String(row.played), colPlayedX, centerY + 1);
            ctx.fillText(String(row.won), colWonX, centerY + 1);
            ctx.fillText(String(row.lost), colLostX, centerY + 1);

            const diffText = data.plainDiff ? String(row.diff).trim() : formatDiff(row.diff);
            ctx.fillStyle = !data.plainDiff && diffText.startsWith('-') ? '#ef4444' : rowAccentColor;
            if (data.plainDiff) {
                const diffMinFontSize = Math.max(11, statFontSize - 3);
                setFittedFont(
                    ctx,
                    diffText || '-',
                    diffWidth - 12,
                    '800',
                    statFontSize,
                    FONT_BODY,
                    diffMinFontSize,
                );
                const safeDiff = truncateTextToWidth(ctx, diffText || '-', diffWidth - 12);
                ctx.fillText(safeDiff, colDiffX, centerY + 1);
            } else {
                ctx.font = `800 ${statFontSize}px ${FONT_MONO}`;
                ctx.fillText(diffText, colDiffX, centerY + 1);
            }

            const pointsText = String(row.points ?? '-').trim() || '-';
            if (showPositionDelta) {
                const positionDeltaLabel = (row.pointsDeltaLabel || '').trim();
                const positionDeltaColor =
                    row.pointsDeltaTone === 'positive'
                        ? '#10b981'
                        : row.pointsDeltaTone === 'negative'
                            ? '#ef4444'
                            : mutedColor;

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                ctx.fillStyle = mutedColor;
                ctx.font = `700 ${Math.max(11, statFontSize - 2)}px ${FONT_MONO}`;
                ctx.fillText(pointsText, colPointsLeft + 10, centerY + 1);

                ctx.textAlign = 'right';
                ctx.fillStyle = positionDeltaColor;
                ctx.font = `800 ${pointsFontSize}px ${FONT_MONO}`;
                ctx.fillText(positionDeltaLabel || '-', tableRight - 6, centerY + 1);
            } else {
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = textColor;
                ctx.font = `800 ${pointsFontSize}px ${FONT_MONO}`;
                ctx.fillText(pointsText, colPointsX, centerY + 1);
            }
            ctx.restore();

            rowIndex += 1;
            cursorY += rowHeight;
        });
    });

    if (legendItems.length > 0) {
        const legendTop = bodyBottom + (isStory ? 18 : 16);

        ctx.save();
        ctx.strokeStyle = softColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + 24, legendTop - (isStory ? 10 : 8));
        ctx.lineTo(panelX + panelWidth - 24, legendTop - (isStory ? 10 : 8));
        ctx.stroke();
        ctx.restore();

        drawStandingsLegend(
            ctx,
            panelX + 24,
            legendTop,
            panelWidth - 48,
            legendItems,
            isDark,
            isStory,
        );
    }

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
}
// ============================================================================
// Poster de ranking — replica del afiche "Salida de 22": banda izquierda con
// el titulo vertical en Dharma Gothic M ExBold, costura iluminada entre banda
// y panel, panel de tabla con luz diagonal, grano fino y columnas
// P / Equipo / PTS / VAR. Se pinta con CINCO colores editables (fondo, banda,
// brillo, panel y dorado); el 1-2-3 conserva el color de positionLabels
// (oro/plata/bronce) en el numero de posicion.
// ============================================================================
const FONT_DHARMA_M = '"dharma-gothic-m", "G22 Dharma Gothic", "Dharma Gothic E Heavy", "Bebas Neue", "Outfit", sans-serif';

let rankingNoiseTile: HTMLCanvasElement | null = null;

// Grano fino con vetas horizontales, como la textura del afiche original.
// Determinista (g22pNoise) para poder cachear el tile sin que titile el preview.
function getRankingNoiseTile(): HTMLCanvasElement | null {
    if (rankingNoiseTile) return rankingNoiseTile;
    if (typeof document === 'undefined') return null;

    const size = 264;
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) return null;

    const image = tileCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
        const rowNoise = g22pNoise(y * 17.23);
        for (let x = 0; x < size; x += 1) {
            const pixelNoise = g22pNoise(y * size + x * 1.37);
            const value = Math.round(128 + ((pixelNoise * 0.72 + rowNoise * 0.28) - 0.5) * 72);
            const index = (y * size + x) * 4;
            image.data[index] = value;
            image.data[index + 1] = value;
            image.data[index + 2] = value;
            image.data[index + 3] = 255;
        }
    }
    tileCtx.putImageData(image, 0, 0);
    rankingNoiseTile = tile;
    return tile;
}

// ---------------------------------------------------------------------------
// Placa "ladder" (2026-09-02). Referencia: la tabla de la NRL — fondo negro,
// titulo enorme junto al logo, subtitulo con remate en acento y una fila por
// entidad: numero, escudo en tile, nombre en mayusculas, valor principal con
// su unidad, dato secundario y flecha de tendencia. Ignora la familia visual a
// proposito, como el afiche del ranking: es una pieza dedicada.
//
// Todo se escala por ANCHO (`u`): el story reparte el alto de mas en filas mas
// altas, no en tipografia mas grande.
// ---------------------------------------------------------------------------
async function drawLadderPoster(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
) {
    const width = canvas.width;
    const height = canvas.height;
    const isStory = format.height > format.width;
    const u = (value: number) => Math.round((value * width) / 1080);
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = isDark ? '#ffffff' : '#0b0f19';
    const softColor = isDark ? 'rgba(255,255,255,0.78)' : 'rgba(11,15,25,0.72)';
    const mutedColor = getMutedColor(isDark, 0.55);
    const lineColor = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(11,15,25,0.14)';
    const tileColor = isDark ? mixHexColors(bgColor, '#ffffff', 0.11) : mixHexColors(bgColor, '#000000', 0.07);
    const downColor = '#e5484d';

    const rows = slide.groups.flatMap((group) => group.rows).slice(0, LADDER_MAX_ROWS);
    const [teamLogos, tournamentLogo] = await Promise.all([
        Promise.all(rows.map((row) => loadImage(row.teamLogo || ''))),
        loadImage(data.tournamentLogo || ''),
    ]);

    // ---- Fondo: placa plena, luz suave arriba y grano fino ----
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.5, height * 0.18, 0, width * 0.5, height * 0.18, height * 0.75);
    glow.addColorStop(0, isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.35)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    const noiseTile = getRankingNoiseTile();
    if (noiseTile) {
        const noisePattern = ctx.createPattern(noiseTile, 'repeat');
        if (noisePattern) {
            ctx.save();
            ctx.globalAlpha = 0.07;
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = noisePattern;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    // ---- Cabecera: logo a la izquierda, titulo al lado, subtitulo debajo ----
    const margin = u(136);
    const headerTop = u(isStory ? 140 : 84);
    const logoSize = u(118);
    // Donde la referencia pone el escudo de la competencia va el logo del
    // torneo; sin logo, el icono de G22 (el cuadrado, no el wordmark: en 118px
    // el wordmark ancho queda como una etiqueta diminuta).
    const logoImage = tournamentLogo || brandLogo;
    if (logoImage) {
        drawLogoBadge(ctx, {
            x: margin + logoSize / 2,
            y: headerTop + logoSize / 2,
            size: logoSize,
            img: logoImage,
            label: data.title || 'G22 Scores',
            rawLogo: tournamentLogo ? data.tournamentLogo : '/icon.png',
            isDark,
            showFrame: false,
        });
    }

    const title = (data.title || 'Tabla').trim();
    const titleX = margin + logoSize + u(22);
    const titleMaxWidth = width - margin - titleX;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = textColor;
    setFittedFont(ctx, title, titleMaxWidth, '900', u(150), FONT_BODY, u(64));
    ctx.fillText(title, titleX - u(4), headerTop + Math.round(logoSize * 0.9));
    ctx.restore();

    // Subtitulo: "TORNEO · FECHA" — lo que va despues del separador se pinta en acento.
    const subtitle = (data.subtitle || '').trim();
    const subtitleY = headerTop + logoSize + u(40);
    if (subtitle) {
        const separatorIndex = subtitle.lastIndexOf(' · ');
        const leftText = (separatorIndex >= 0 ? subtitle.slice(0, separatorIndex) : subtitle).trim().toUpperCase();
        const rightText = separatorIndex >= 0 ? subtitle.slice(separatorIndex + 3).trim().toUpperCase() : '';
        const gap = rightText ? u(18) : 0;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const spacedCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
        spacedCtx.letterSpacing = `${u(3)}px`;
        let subtitleSize = u(26);
        while (subtitleSize > u(14)) {
            ctx.font = `800 ${subtitleSize}px ${FONT_BODY}`;
            if (ctx.measureText(leftText).width + gap + ctx.measureText(rightText).width <= titleMaxWidth) break;
            subtitleSize -= 1;
        }
        ctx.fillStyle = textColor;
        ctx.fillText(leftText, titleX, subtitleY);
        if (rightText) {
            ctx.fillStyle = accentColor;
            ctx.fillText(rightText, titleX + ctx.measureText(leftText).width + gap, subtitleY);
        }
        spacedCtx.letterSpacing = '0px';
        ctx.restore();
    }

    // ---- Geometria de las filas ----
    const left = margin;
    const right = width - margin;
    const bodyTop = subtitleY + u(66);
    const footerCenterY = height - u(isStory ? 84 : 56);
    const bodyBottom = footerCenterY - u(30);
    // Con pocas filas la fila crece (hasta un tope) para no dejar media placa
    // vacia; la tipografia y el tile tienen su propio tope, asi una tabla de
    // cinco no se convierte en un cartel.
    const rowHeight = Math.min(u(isStory ? 112 : 96), Math.floor((bodyBottom - bodyTop) / Math.max(rows.length, 1)));
    const tileSize = Math.min(u(72), Math.round(rowHeight * 0.88));
    const tileX = left + u(58);
    const nameX = tileX + tileSize + u(22);
    const arrowCenterX = right - u(10);
    const secondaryRight = right - u(42);
    // La unidad se omite cuando ya es el titulo de la placa: "TRIES" arriba y
    // "1 TRIES" en cada fila es decirlo dos veces.
    const rawUnitLabel = (data.columnLabels?.points || 'PTS').trim().toUpperCase();
    const unitLabel = rawUnitLabel === title.toUpperCase() ? '' : rawUnitLabel;
    const secondaryLabel = (data.columnLabels?.diff || '').trim().toUpperCase();
    const posSize = Math.min(u(34), Math.round(rowHeight * 0.44));
    const mainSize = Math.min(u(36), Math.round(rowHeight * 0.46));
    const unitSize = Math.round(mainSize * 0.8);
    const secondarySize = Math.min(u(30), Math.round(rowHeight * 0.42));
    // El renglon chico bajo el nombre entra solo si la fila es alta.
    const hasCaptions = rows.some((row) => (row.caption || '').trim()) && rowHeight >= u(70);
    const captionSize = Math.min(u(20), Math.round(rowHeight * 0.24));
    const nameOffset = hasCaptions ? -Math.round(rowHeight * 0.16) : 0;

    const secondaryTextOf = (row: StandingsRowData) => {
        const value = String(row.diff ?? '').trim();
        if (!value) return '';
        return secondaryLabel ? `${value} ${secondaryLabel}` : value;
    };
    ctx.font = `500 ${secondarySize}px ${FONT_BODY}`;
    const secondaryWidth = rows.reduce((max, row) => Math.max(max, ctx.measureText(secondaryTextOf(row)).width), 0);
    const mainRight = secondaryRight - (secondaryWidth > 0 ? secondaryWidth + u(26) : 0);
    ctx.font = `800 ${unitSize}px ${FONT_BODY}`;
    const unitWidth = unitLabel ? ctx.measureText(unitLabel).width + u(10) : 0;
    ctx.font = `800 ${mainSize}px ${FONT_BODY}`;
    const mainWidth = rows.reduce((max, row) => Math.max(max, ctx.measureText(String(row.points ?? '-')).width), 0);
    const nameMaxWidth = Math.max(u(120), mainRight - unitWidth - mainWidth - u(28) - nameX);
    const nameSize = getSharedFittedFontSize(
        ctx,
        rows.map((row) => ({ text: row.team.trim().toUpperCase(), maxWidth: nameMaxWidth })),
        '800',
        Math.round(Math.min(u(34), rowHeight * 0.5)),
        FONT_BODY,
        u(15),
    );

    rows.forEach((row, index) => {
        const y = bodyTop + index * rowHeight;
        const centerY = y + rowHeight / 2;
        const img = teamLogos[index] || null;

        // El podio va en acento (numero y filete), como la zona de finales de
        // la referencia. Una zona explicita (zoneColor) manda sobre eso, y solo
        // en la primera placa: la fila 11 no es podio.
        const rowAccent = row.zoneColor || (slide.pageNumber === 1 && index < 3 ? accentColor : null);
        const isLeader = slide.pageNumber === 1 && index === 0;

        ctx.save();
        ctx.textBaseline = 'middle';

        // El lider lleva un lavado de acento que sale del margen izquierdo y se
        // apaga antes de los numeros: destaca sin tapar nada.
        if (isLeader) {
            const wash = ctx.createLinearGradient(left - u(40), 0, right, 0);
            wash.addColorStop(0, hexToRGBA(accentColor, 0.22));
            wash.addColorStop(0.55, hexToRGBA(accentColor, 0.06));
            wash.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = wash;
            ctx.beginPath();
            ctx.roundRect(left - u(40), y + u(2), right - left + u(80), rowHeight - u(4), u(12));
            ctx.fill();
        }

        // Filete bajo la fila.
        ctx.strokeStyle = rowAccent ? hexToRGBA(rowAccent, 0.85) : lineColor;
        ctx.lineWidth = rowAccent ? u(2) : 1;
        ctx.beginPath();
        ctx.moveTo(left, y + rowHeight - 0.5);
        ctx.lineTo(right, y + rowHeight - 0.5);
        ctx.stroke();

        // Numero.
        ctx.fillStyle = rowAccent || textColor;
        ctx.textAlign = 'left';
        ctx.font = `800 ${posSize}px ${FONT_BODY}`;
        ctx.fillText(String(row.pos), left, centerY + 1);

        // Tile con el escudo.
        ctx.fillStyle = tileColor;
        ctx.beginPath();
        ctx.roundRect(tileX, centerY - tileSize / 2, tileSize, tileSize, u(9));
        ctx.fill();
        drawOverflowCrest(ctx, {
            x: tileX + tileSize / 2,
            y: centerY,
            width: Math.round(tileSize * 0.84),
            height: Math.round(tileSize * 0.84),
            img,
            label: row.team,
            rawLogo: row.teamLogo,
            isDark,
            showFrame: false,
        });

        // Nombre, y debajo el renglon de contexto si hay lugar.
        ctx.fillStyle = textColor;
        ctx.font = `800 ${nameSize}px ${FONT_BODY}`;
        ctx.fillText(row.team.trim().toUpperCase(), nameX, centerY + 1 + nameOffset);
        const caption = (row.caption || '').trim();
        if (hasCaptions && caption) {
            ctx.fillStyle = mutedColor;
            ctx.font = `600 ${captionSize}px ${FONT_BODY}`;
            ctx.fillText(caption.toUpperCase(), nameX, centerY + 1 + Math.round(rowHeight * 0.2));
        }

        // Valor principal + unidad ("38 PTS").
        ctx.textAlign = 'right';
        if (unitLabel) {
            ctx.font = `800 ${unitSize}px ${FONT_BODY}`;
            ctx.fillText(unitLabel, mainRight, centerY + 1);
        }
        ctx.font = `800 ${mainSize}px ${FONT_BODY}`;
        ctx.fillText(String(row.points ?? '-').trim(), mainRight - unitWidth, centerY + 1);

        // Dato secundario ("+163").
        const secondaryText = secondaryTextOf(row);
        if (secondaryText) {
            ctx.fillStyle = softColor;
            ctx.font = `500 ${secondarySize}px ${FONT_BODY}`;
            ctx.fillText(secondaryText, secondaryRight, centerY + 1);
        }

        // Flecha de tendencia.
        const arrow = u(17);
        if (row.pointsDeltaTone === 'positive') {
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(arrowCenterX, centerY - arrow * 0.55);
            ctx.lineTo(arrowCenterX + arrow * 0.62, centerY + arrow * 0.45);
            ctx.lineTo(arrowCenterX - arrow * 0.62, centerY + arrow * 0.45);
            ctx.closePath();
            ctx.fill();
        } else if (row.pointsDeltaTone === 'negative') {
            ctx.fillStyle = downColor;
            ctx.beginPath();
            ctx.moveTo(arrowCenterX, centerY + arrow * 0.55);
            ctx.lineTo(arrowCenterX + arrow * 0.62, centerY - arrow * 0.45);
            ctx.lineTo(arrowCenterX - arrow * 0.62, centerY - arrow * 0.45);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.strokeStyle = mutedColor;
            ctx.lineWidth = u(3);
            ctx.beginPath();
            ctx.moveTo(arrowCenterX - arrow * 0.6, centerY + 1);
            ctx.lineTo(arrowCenterX + arrow * 0.6, centerY + 1);
            ctx.stroke();
        }

        ctx.restore();
    });

    // ---- Pie: marca chica a la izquierda, pagina y flechas de carrusel a la derecha ----
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = mutedColor;
    ctx.font = `700 ${u(18)}px ${FONT_BODY}`;
    let brandX = left;
    if (brandLogo) {
        const brandSize = u(28);
        drawLogoBadge(ctx, {
            x: left + brandSize / 2,
            y: footerCenterY,
            size: brandSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark,
            showFrame: false,
        });
        brandX = left + brandSize + u(10);
    }
    ctx.fillText('G22 SCORES', brandX, footerCenterY);

    let cursorRight = right;
    if (slide.pageNumber < slide.totalPages) {
        ctx.font = `900 ${u(24)}px ${FONT_BODY}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';
        ctx.fillText('>>>', cursorRight, footerCenterY);
        cursorRight -= ctx.measureText('>>>').width + u(22);
    }
    if (slide.totalPages > 1) {
        ctx.font = `700 ${u(18)}px ${FONT_BODY}`;
        ctx.fillStyle = mutedColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${slide.pageNumber}/${slide.totalPages}`, cursorRight, footerCenterY);
    }
    ctx.restore();
}

async function drawRankingPoster(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    extraColors: RankingPosterExtraColors = {}
) {
    const width = canvas.width;
    const height = canvas.height;
    const isStory = format.height > format.width;
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = isDark ? '#ffffff' : '#0f172a';
    const mutedColor = getMutedColor(isDark, 0.62);
    const glowColor = extraColors.glow || mixHexColors(accentColor, '#ffffff', 0.4);
    const panelColor = extraColors.panel || mixHexColors(accentColor, '#ffffff', 0.28);
    // En fondo claro el dorado cae a un ambar oscuro: el amarillo puro no llega
    // a contraste util sobre blanco.
    const goldColor = extraColors.gold || (isDark ? '#f6c445' : '#a16207');
    const accentDeep = mixHexColors(accentColor, '#000000', 0.45);
    const barFrom = mixHexColors(glowColor, '#000000', 0.3);
    const barContrast = getContrastColor(glowColor);
    const rows = slide.groups.flatMap((group) => group.rows);
    const teamLogos = await Promise.all(rows.map((row) => loadImage(row.teamLogo || '')));

    const bandWidth = Math.round(width * 0.265);

    // ---- Fondo: la estructura del afiche de referencia ----
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Banda del titulo: oscura arriba, color pleno abajo y luz electrica en la base.
    const band = ctx.createLinearGradient(0, 0, 0, height);
    band.addColorStop(0, mixHexColors(accentColor, bgColor, 0.55));
    band.addColorStop(0.5, mixHexColors(accentColor, bgColor, 0.25));
    band.addColorStop(1, accentColor);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, bandWidth, height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, bandWidth, height);
    ctx.clip();
    const bandGlow = ctx.createRadialGradient(bandWidth * 0.2, height * 1.02, 0, bandWidth * 0.2, height * 1.02, height * 0.66);
    bandGlow.addColorStop(0, hexToRGBA(glowColor, 0.95));
    bandGlow.addColorStop(0.45, hexToRGBA(glowColor, 0.4));
    bandGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bandGlow;
    ctx.fillRect(0, 0, bandWidth, height);
    ctx.restore();

    // Panel de la tabla: mas claro contra la costura, se apaga hacia arriba a la derecha.
    const panel = ctx.createLinearGradient(bandWidth, height, width, height * 0.02);
    panel.addColorStop(0, hexToRGBA(panelColor, 0.8));
    panel.addColorStop(0.5, hexToRGBA(panelColor, 0.3));
    panel.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = panel;
    ctx.fillRect(bandWidth, 0, width - bandWidth, height);

    const panelBloom = ctx.createRadialGradient(bandWidth, height, 0, bandWidth, height, width * 0.55);
    panelBloom.addColorStop(0, hexToRGBA(glowColor, 0.28));
    panelBloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = panelBloom;
    ctx.fillRect(bandWidth, 0, width - bandWidth, height);

    // Esquina superior derecha hundida en negro, como la referencia.
    const cornerShade = ctx.createLinearGradient(width, 0, width * 0.4, height * 0.7);
    cornerShade.addColorStop(0, 'rgba(0,0,0,0.62)');
    cornerShade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cornerShade;
    ctx.fillRect(0, 0, width, height);

    // Costura: sombra del lado de la banda y filo iluminado del panel.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bandWidth - 7, 0, 7, height);
    const seam = ctx.createLinearGradient(0, 0, 0, height);
    seam.addColorStop(0, 'rgba(255,255,255,0.05)');
    seam.addColorStop(1, 'rgba(255,255,255,0.22)');
    ctx.fillStyle = seam;
    ctx.fillRect(bandWidth, 0, 3, height);

    // Grano fino sobre toda la pieza.
    const noiseTile = getRankingNoiseTile();
    if (noiseTile) {
        const noisePattern = ctx.createPattern(noiseTile, 'repeat');
        if (noisePattern) {
            ctx.save();
            ctx.globalAlpha = 0.09;
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = noisePattern;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    // ---- Titulo vertical en Dharma Gothic M ExBold ----
    const titleText = (data.title || 'Ranking').trim().toUpperCase();
    const maxTitleLength = height - (isStory ? 250 : 170);
    let titleSize = Math.round(bandWidth * (isStory ? 0.92 : 0.86));
    ctx.save();
    while (titleSize > 60) {
        ctx.font = `800 ${titleSize}px ${FONT_DHARMA_M}`;
        if (ctx.measureText(titleText).width <= maxTitleLength) break;
        titleSize -= 6;
    }
    ctx.translate(bandWidth * 0.52, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${titleSize}px ${FONT_DHARMA_M}`;
    ctx.fillStyle = getContrastColor(accentColor);
    ctx.shadowColor = hexToRGBA(accentDeep, 0.55);
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 0;
    ctx.fillText(titleText, 0, 0);
    ctx.restore();

    // ---- Geometria de la tabla (sobre el panel) ----
    const tableLeft = bandWidth + 46;
    const tableRight = width - 54;
    const varWidth = 106;
    const ptsWidth = 168;
    const posCenterX = tableLeft + 26;
    const crestCenterX = tableLeft + 92;
    const nameX = tableLeft + 132;
    const varCenterX = tableRight - varWidth / 2;
    const ptsCenterX = tableRight - varWidth - ptsWidth / 2;
    const nameMaxWidth = Math.max(120, (tableRight - varWidth - ptsWidth) - nameX - 18);

    const headerY = isStory ? 150 : 104;
    const footerCenterY = height - (isStory ? 52 : 44);
    const bodyTop = headerY + (isStory ? 46 : 38);
    const bodyBottom = footerCenterY - (isStory ? 46 : 38);
    const rowHeight = Math.min(isStory ? 82 : 62, (bodyBottom - bodyTop) / Math.max(rows.length, 1));
    const crestSize = Math.min(isStory ? 66 : 50, rowHeight - 6);
    const posFontSize = Math.round(Math.min(isStory ? 40 : 30, rowHeight * 0.5));
    const ptsFontSize = Math.round(Math.min(isStory ? 40 : 30, rowHeight * 0.5));
    const varFontSize = Math.round(Math.min(isStory ? 36 : 27, rowHeight * 0.46));
    const baseNameSize = Math.round(Math.min(isStory ? 40 : 29, rowHeight * 0.52));
    const sharedNameSize = getSharedFittedFontSize(
        ctx,
        rows.map((row) => ({ text: row.team.trim(), maxWidth: nameMaxWidth })),
        '800',
        baseNameSize,
        FONT_BODY,
        13,
    );

    // Cabecera de columnas.
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.font = `800 ${isStory ? 28 : 25}px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('P', posCenterX, headerY);
    ctx.fillText('PTS', ptsCenterX, headerY);
    ctx.fillText('VAR', varCenterX, headerY);
    ctx.textAlign = 'left';
    ctx.fillText('Equipo', crestCenterX - crestSize / 2, headerY);
    ctx.restore();

    rows.forEach((row, index) => {
        const y = bodyTop + index * rowHeight;
        const centerY = y + rowHeight / 2;
        const isLeader = row.pos === 1;
        // Con subrayado por movimiento el lider va en oro, no en el color del
        // afiche. El contraste del texto se recalcula sobre el color REAL de la
        // barra: heredar el del acento deja el nombre ilegible sobre el dorado.
        const leaderBarTo = isLeader && row.movementColor ? row.movementColor : glowColor;
        const leaderBarFrom = isLeader && row.movementColor
            ? mixHexColors(row.movementColor, '#000000', 0.3)
            : barFrom;
        const leaderContrast = isLeader && row.movementColor ? getContrastColor(leaderBarTo) : barContrast;
        const rowTextColor = isLeader ? leaderContrast : textColor;
        const img = teamLogos[index] || null;

        ctx.save();
        ctx.textBaseline = 'middle';

        if (isLeader) {
            // La barra del lider usa el color de brillo: es la misma luz que
            // sube desde la base del afiche.
            const barGradient = ctx.createLinearGradient(tableLeft - 18, 0, tableRight + 18, 0);
            barGradient.addColorStop(0, leaderBarFrom);
            barGradient.addColorStop(1, leaderBarTo);
            ctx.save();
            ctx.fillStyle = barGradient;
            ctx.shadowColor = hexToRGBA(leaderBarTo, 0.5);
            ctx.shadowBlur = 26;
            ctx.shadowOffsetY = 6;
            ctx.beginPath();
            ctx.roundRect(tableLeft - 18, y + 3, tableRight - tableLeft + 36, rowHeight - 6, 12);
            ctx.fill();
            ctx.restore();
        } else if (row.movementColor) {
            // Banda del que se movio. Mas suave que la del lider a proposito: en
            // una tabla de 20 filas, media docena teñidas al mismo peso que el
            // primero convierten el afiche en un semaforo y no se lee nada.
            ctx.save();
            ctx.fillStyle = hexToRGBA(row.movementColor, 0.1 + (row.movementStrength ?? 1) * 0.14);
            ctx.beginPath();
            ctx.roundRect(tableLeft - 18, y + 3, tableRight - tableLeft + 36, rowHeight - 6, 12);
            ctx.fill();
            ctx.restore();
        } else if (index > 0 && rows[index - 1].pos !== 1) {
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.07)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tableLeft - 6, y);
            ctx.lineTo(tableRight + 6, y);
            ctx.stroke();
        }

        // Posicion: oro/plata/bronce si la fila trae etiqueta; dorado base si no.
        ctx.fillStyle = row.zoneColor || goldColor;
        ctx.textAlign = 'center';
        ctx.font = `800 ${posFontSize}px ${FONT_BODY}`;
        ctx.fillText(String(row.pos), posCenterX, centerY + 1);

        // Escudo directo, sin plato: la regla es escudo real siempre.
        drawOverflowCrest(ctx, {
            x: crestCenterX,
            y: centerY,
            width: crestSize,
            height: crestSize,
            img,
            label: row.team,
            rawLogo: row.teamLogo,
            isDark,
            showFrame: false,
        });

        ctx.textAlign = 'left';
        ctx.fillStyle = rowTextColor;
        ctx.font = `800 ${sharedNameSize}px ${FONT_BODY}`;
        ctx.fillText(row.team.trim(), nameX, centerY + 1);

        // En la fila del lider los puntos van con el color de contraste de la
        // barra (como el nombre): el dorado se perdia sobre la luz de la barra.
        const ptsText = String(row.played ?? '-').trim().replace('.', ',') || '-';
        ctx.textAlign = 'center';
        ctx.fillStyle = isLeader ? barContrast : goldColor;
        setFittedFont(ctx, ptsText, ptsWidth - 16, '800', ptsFontSize, FONT_BODY, 14);
        ctx.fillText(ptsText, ptsCenterX, centerY + 1);

        const varText = (row.pointsDeltaLabel || '').trim().replace(/^\+/, '') || '0';
        // El numero de la variacion toma el color de su movimiento: es la cifra
        // que el subrayado esta senialando, y en gris habia que deducirla del
        // signo. En la fila del lider manda el contraste de la barra.
        ctx.fillStyle = !isLeader && row.movementColor ? row.movementColor : rowTextColor;
        ctx.font = `800 ${varFontSize}px ${FONT_BODY}`;
        ctx.fillText(varText, varCenterX, centerY + 1);

        ctx.restore();
    });

    // Pie: subtitulo a la izquierda, marca G22, pagina y flechas de carrusel a la derecha.
    ctx.save();
    ctx.textBaseline = 'middle';
    let cursorRight = tableRight;

    if (slide.pageNumber < slide.totalPages) {
        ctx.font = `900 ${isStory ? 30 : 26}px ${FONT_BODY}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';
        ctx.fillText('>>>', cursorRight, footerCenterY);
        cursorRight -= ctx.measureText('>>>').width + 26;
    }

    // La pagina va aparte del subtitulo: si compartieran renglon, el recorte del
    // subtitulo largo se comeria el "1/8" que ubica la lamina en el carrusel.
    if (slide.totalPages > 1) {
        ctx.font = `700 ${isStory ? 20 : 17}px ${FONT_BODY}`;
        ctx.fillStyle = mutedColor;
        ctx.textAlign = 'right';
        const pageText = `${slide.pageNumber}/${slide.totalPages}`;
        ctx.fillText(pageText, cursorRight, footerCenterY);
        cursorRight -= ctx.measureText(pageText).width + 22;
    }

    const brandFontSize = isStory ? 22 : 19;
    const brandIconSize = isStory ? 30 : 26;
    ctx.font = `800 ${brandFontSize}px ${FONT_BODY}`;
    const brandTextWidth = ctx.measureText('G22 Scores').width;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.fillText('G22 Scores', cursorRight, footerCenterY);
    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: cursorRight - brandTextWidth - 10 - brandIconSize / 2,
            y: footerCenterY,
            size: brandIconSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark,
            showFrame: false,
        });
    }
    const brandLeft = cursorRight - brandTextWidth - 10 - brandIconSize;

    const subtitleText = (data.subtitle || '').trim().toUpperCase();
    if (subtitleText) {
        ctx.font = `700 ${isStory ? 20 : 17}px ${FONT_BODY}`;
        ctx.fillStyle = mutedColor;
        ctx.textAlign = 'left';
        const subtitleMax = brandLeft - 24 - tableLeft;
        if (subtitleMax > 60) {
            ctx.fillText(truncateTextToWidth(ctx, subtitleText, subtitleMax), tableLeft, footerCenterY);
        }
    }
    ctx.restore();
}
// El tracking no viaja en el shorthand de ctx.font: se pone aparte y se apaga a
// mano, porque no todos los navegadores lo devuelven con restore().
function setCanvasTracking(ctx: CanvasRenderingContext2D, px: number) {
    if ('letterSpacing' in ctx) {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
    }
}

const PALMARES_PEDESTAL_RATIO = [1, 0.72, 0.56];

// Palmares: el afiche de la vitrina. No es una tabla — manda el podio (escudo
// grande, oro/plata/bronce y los titulos sobre su escalon) y el resto baja como
// listado con una barra proporcional al lider. El podio se dibuja solo en la
// primera lamina: en la segunda ya no hay 1-2-3 que mostrar.
async function drawPalmaresPoster(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const width = canvas.width;
    const height = canvas.height;
    // Los DOS formatos son verticales: `height > width` daria story tambien para
    // el 1080x1350 y el post saldria con las medidas del 9:16. El corte es el
    // mismo que usa getSafeArea.
    const isStory = height > 1500;
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.6);
    // En fondo claro el oro puro no llega a contraste util: baja a ambar oscuro.
    const goldColor = isDark ? '#f6c445' : '#a16207';
    const silverColor = isDark ? '#cbd5e1' : '#5b6675';
    const bronzeColor = isDark ? '#d08c5a' : '#95562a';
    const medalFor = (pos: number) => (pos === 1 ? goldColor : pos === 2 ? silverColor : pos === 3 ? bronzeColor : accentColor);
    const titlesOf = (row: StandingsRowData) => {
        const parsed = Number(row.points);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const rows = slide.groups.flatMap((group) => group.rows);
    const [tournamentLogo, ...teamLogos] = await Promise.all([
        loadImage(data.tournamentLogo || ''),
        ...rows.map((row) => loadImage(row.teamLogo || '')),
    ]);

    // ---- Fondo: halo del acento detras del podio y piso apagado ----
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const halo = ctx.createRadialGradient(width / 2, height * 0.3, 0, width / 2, height * 0.3, height * 0.66);
    halo.addColorStop(0, hexToRGBA(accentColor, isDark ? 0.5 : 0.2));
    halo.addColorStop(0.55, hexToRGBA(accentColor, isDark ? 0.14 : 0.07));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    const floor = ctx.createLinearGradient(0, height * 0.42, 0, height);
    floor.addColorStop(0, 'rgba(0,0,0,0)');
    floor.addColorStop(1, isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, width, height);

    const noiseTile = getRankingNoiseTile();
    if (noiseTile) {
        const noisePattern = ctx.createPattern(noiseTile, 'repeat');
        if (noisePattern) {
            ctx.save();
            ctx.globalAlpha = 0.07;
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = noisePattern;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    const padX = Math.round(width * 0.085);
    const contentLeft = padX;
    const contentRight = width - padX;
    const contentWidth = contentRight - contentLeft;
    const footerCenterY = height - (isStory ? 170 : 68);
    const bodyBottom = footerCenterY - (isStory ? 48 : 36);
    // En story el contenido arranca mas abajo: arriba va la barra del usuario.
    let cursorY = isStory ? 280 : 128;

    // ---- Cabecera centrada: escudo del torneo, volanta, titulo y bajada ----
    if (tournamentLogo) {
        const logoSize = isStory ? 98 : 84;
        drawLogoBadge(ctx, {
            x: width / 2,
            y: cursorY + logoSize / 2,
            size: logoSize,
            img: tournamentLogo,
            label: data.title || 'Torneo',
            rawLogo: data.tournamentLogo,
            isDark,
            showFrame: false,
        });
        cursorY += logoSize + (isStory ? 22 : 16);
    }

    const eyebrowSize = isStory ? 26 : 23;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = goldColor;
    ctx.font = `800 ${eyebrowSize}px ${FONT_BODY}`;
    setCanvasTracking(ctx, eyebrowSize * 0.3);
    ctx.fillText('PALMARÉS', width / 2, cursorY);
    setCanvasTracking(ctx, 0);
    ctx.restore();
    cursorY += eyebrowSize + (isStory ? 20 : 15);

    const titleText = (data.title || 'Palmarés').trim().toUpperCase();
    const titleFit = fitTextLinesToWidth(ctx, titleText, contentWidth, '800', isStory ? 116 : 98, FONT_DHARMA_M, 46, 2);
    const titleLineHeight = titleFit.size * 0.86;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = textColor;
    ctx.font = `800 ${titleFit.size}px ${FONT_DHARMA_M}`;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = titleFit.size * 0.14;
    titleFit.lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, cursorY + index * titleLineHeight);
    });
    ctx.restore();
    cursorY += titleFit.lines.length * titleLineHeight + (isStory ? 14 : 10);

    const subtitleText = (data.subtitle || '').trim().toUpperCase();
    if (subtitleText) {
        const subtitleSize = isStory ? 24 : 21;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${subtitleSize}px ${FONT_BODY}`;
        setCanvasTracking(ctx, subtitleSize * 0.08);
        ctx.fillText(truncateTextToWidth(ctx, subtitleText, contentWidth), width / 2, cursorY);
        setCanvasTracking(ctx, 0);
        ctx.restore();
        cursorY += subtitleSize + (isStory ? 22 : 17);
    }

    ctx.fillStyle = hexToRGBA(goldColor, 0.85);
    ctx.fillRect(width / 2 - 34, cursorY, 68, 3);
    cursorY += 3 + (isStory ? 42 : 32);

    // ---- Podio (solo lamina 1) ----
    const podiumRows = slide.pageNumber === 1 ? rows.slice(0, Math.min(3, rows.length)) : [];
    const listRows = rows.slice(podiumRows.length);
    const maxTitles = Math.max(1, ...rows.map(titlesOf));

    // Reparto del alto entre podio y listado. La cuenta la manda el listado: si
    // le sobra lugar el podio se lo queda, y si le falta el podio cede hasta su
    // piso. Un listado largo en 4:5 baja a dos columnas antes que a filas de
    // 30px, que es donde el escudo deja de leerse.
    const available = Math.max(220, bodyBottom - cursorY);
    const listGap = isStory ? 40 : 36;
    const listColumns = listRows.length > (isStory ? 10 : 6) ? 2 : 1;
    const rowsPerColumn = Math.ceil(listRows.length / listColumns) || 1;
    const preferredRowHeight = isStory ? 78 : 62;
    const minRowHeight = isStory ? 46 : 38;
    const podiumMin = isStory ? 380 : 300;
    const podiumMax = isStory ? 620 : 440;

    let podiumHeight = listRows.length > 0
        ? Math.min(podiumMax, available * 0.52)
        : Math.min(isStory ? 760 : 600, available);
    let listRowHeight = 0;
    if (podiumRows.length > 0 && listRows.length > 0) {
        listRowHeight = (available - listGap - podiumHeight) / rowsPerColumn;
        if (listRowHeight > preferredRowHeight) {
            podiumHeight = Math.min(podiumMax, available - listGap - rowsPerColumn * preferredRowHeight);
            listRowHeight = preferredRowHeight;
        } else if (listRowHeight < minRowHeight) {
            podiumHeight = Math.max(podiumMin, available - listGap - rowsPerColumn * minRowHeight);
            listRowHeight = Math.max(14, (available - listGap - podiumHeight) / rowsPerColumn);
        }
    } else if (listRows.length > 0) {
        listRowHeight = Math.min(preferredRowHeight, available / rowsPerColumn);
    }

    // Un palmares de tres campeones no estira el podio hasta el pie: se centra
    // en lo que sobra y el aire queda repartido, no todo abajo.
    if (podiumRows.length > 0 && listRows.length === 0) {
        cursorY += Math.max(0, (available - podiumHeight) / 2);
    }

    if (podiumRows.length > 0) {
        const baseY = cursorY + podiumHeight;
        const slotWidth = contentWidth / podiumRows.length;
        // El orden del podio es 2-1-3: el campeon va al medio, como en la foto.
        const slotOrder = podiumRows.length === 3 ? [1, 0, 2] : podiumRows.map((_, index) => index);

        const pedestalMaxH = podiumHeight * 0.26;
        const captionSize = Math.round(Math.min(isStory ? 20 : 17, podiumHeight * 0.045));
        const countSize = Math.round(Math.min(isStory ? 92 : 76, podiumHeight * 0.21));
        const nameSize = Math.round(Math.min(isStory ? 28 : 25, podiumHeight * 0.062));
        const crestMax = Math.min(slotWidth * 0.6, podiumHeight * 0.32);
        const captionBaseline = baseY - pedestalMaxH - (isStory ? 18 : 14);
        const countBaseline = captionBaseline - captionSize - (isStory ? 12 : 9);
        const nameBottom = countBaseline - countSize * 0.98;

        // Piso del podio: una linea tenue que apoya los tres escalones.
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)';
        ctx.fillRect(contentLeft, baseY, contentWidth, 2);

        slotOrder.forEach((rankIndex, slot) => {
            const row = podiumRows[rankIndex];
            if (!row) return;
            const img = teamLogos[rankIndex] || null;
            const centerX = contentLeft + slotWidth * (slot + 0.5);
            const medal = row.zoneColor || medalFor(Number(row.pos));
            const medalContrast = getContrastColor(medal);

            // Escalon.
            const pedestalH = pedestalMaxH * (PALMARES_PEDESTAL_RATIO[rankIndex] ?? 0.56);
            const pedestalW = Math.min(slotWidth - (isStory ? 28 : 22), isStory ? 310 : 272);
            const pedestalX = centerX - pedestalW / 2;
            const pedestalY = baseY - pedestalH;
            const pedestalFill = ctx.createLinearGradient(0, pedestalY, 0, baseY);
            pedestalFill.addColorStop(0, hexToRGBA(medal, 0.95));
            pedestalFill.addColorStop(1, hexToRGBA(medal, 0.34));
            ctx.save();
            ctx.fillStyle = pedestalFill;
            ctx.shadowColor = hexToRGBA(medal, 0.35);
            ctx.shadowBlur = 26;
            ctx.shadowOffsetY = -4;
            ctx.beginPath();
            ctx.roundRect(pedestalX, pedestalY, pedestalW, pedestalH, [14, 14, 0, 0]);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = medalContrast;
            ctx.font = `800 ${Math.round(pedestalH * 0.78)}px ${FONT_DHARMA_M}`;
            ctx.globalAlpha = 0.9;
            ctx.fillText(String(row.pos), centerX, pedestalY + pedestalH / 2 + 2);
            ctx.restore();

            // Titulos y su etiqueta, alineados entre las tres columnas.
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = medal;
            ctx.font = `800 ${countSize}px ${FONT_DHARMA_M}`;
            ctx.shadowColor = hexToRGBA(medal, 0.4);
            ctx.shadowBlur = 22;
            ctx.fillText(String(titlesOf(row)), centerX, countBaseline);
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = mutedColor;
            ctx.font = `700 ${captionSize}px ${FONT_BODY}`;
            setCanvasTracking(ctx, captionSize * 0.14);
            ctx.fillText(titlesOf(row) === 1 ? 'TÍTULO' : 'TÍTULOS', centerX, captionBaseline);
            setCanvasTracking(ctx, 0);
            ctx.restore();

            // Escudo: el campeon va mas grande que los otros dos.
            const crestSize = crestMax * (rankIndex === 0 ? 1 : 0.84);
            drawOverflowCrest(ctx, {
                x: centerX,
                y: cursorY + crestMax / 2,
                width: crestSize,
                height: crestSize,
                img,
                label: row.team,
                rawLogo: row.teamLogo,
                isDark,
                showFrame: false,
            });

            // Nombre del club entre el escudo y el numero. El alto disponible
            // decide cuantas lineas entran: sin este techo un nombre de dos
            // lineas se montaba sobre la cifra de titulos.
            const nameZoneTop = cursorY + crestMax + (isStory ? 14 : 10);
            const nameZoneHeight = Math.max(nameSize, nameBottom - nameZoneTop);
            const nameLines = nameZoneHeight >= nameSize * 2.4 ? 2 : 1;
            const nameFit = fitTextLinesToWidth(
                ctx,
                row.team.trim(),
                slotWidth - (isStory ? 26 : 20),
                '800',
                Math.min(nameSize, Math.floor(nameZoneHeight / (nameLines * 1.2))),
                FONT_BODY,
                13,
                nameLines,
            );
            const nameBlockH = nameFit.lines.length * nameFit.size * 1.16;
            const nameTop = nameZoneTop + Math.max(0, (nameZoneHeight - nameBlockH) / 2);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = textColor;
            ctx.font = `800 ${nameFit.size}px ${FONT_BODY}`;
            nameFit.lines.forEach((line, index) => {
                ctx.fillText(line, centerX, nameTop + index * nameFit.size * 1.16);
            });
            ctx.restore();
        });

        cursorY = baseY + (isStory ? 40 : 30);
    }

    // ---- Resto del palmares: fila por club con barra proporcional al lider ----
    if (listRows.length > 0) {
        const listTop = cursorY;
        const rowHeight = Math.max(14, Math.min(listRowHeight || preferredRowHeight, (bodyBottom - listTop) / rowsPerColumn));
        const columnGap = isStory ? 22 : 16;
        const columnWidth = (contentWidth - columnGap * (listColumns - 1)) / listColumns;
        const tight = listColumns > 1;
        const crestSize = Math.min((isStory ? 48 : 38) * (tight ? 0.88 : 1), rowHeight - 12);
        const rankWidth = (isStory ? 56 : 46) * (tight ? 0.78 : 1);
        const countWidth = (isStory ? 96 : 80) * (tight ? 0.7 : 1);
        const nameOffset = rankWidth + crestSize + (isStory ? 30 : 24) * (tight ? 0.8 : 1);
        const nameMaxWidth = Math.max(70, columnWidth - nameOffset - countWidth - 12);
        const rankSize = Math.round(Math.min(isStory ? 28 : 23, rowHeight * 0.4));
        const countFontSize = Math.round(Math.min(isStory ? 36 : 30, rowHeight * 0.52));
        const nameFontSize = getSharedFittedFontSize(
            ctx,
            listRows.map((row) => ({ text: row.team.trim(), maxWidth: nameMaxWidth })),
            '700',
            Math.round(Math.min(isStory ? 30 : 25, rowHeight * 0.44)),
            FONT_BODY,
            13,
        );

        listRows.forEach((row, index) => {
            const column = Math.floor(index / rowsPerColumn);
            const left = contentLeft + column * (columnWidth + columnGap);
            const right = left + columnWidth;
            const y = listTop + (index % rowsPerColumn) * rowHeight;
            const centerY = y + rowHeight / 2;
            const img = teamLogos[podiumRows.length + index] || null;
            // Piso del 6%: con un solo titulo la barra seria invisible y la fila
            // parecia rota, no vacia.
            const share = Math.max(0.06, titlesOf(row) / maxTitles);
            const bandHeight = Math.max(8, rowHeight - 5);

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(left, y + 2, columnWidth, bandHeight, 12);
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)';
            ctx.fill();
            ctx.clip();
            const bar = ctx.createLinearGradient(left, 0, left + columnWidth * share, 0);
            bar.addColorStop(0, hexToRGBA(goldColor, isDark ? 0.28 : 0.22));
            bar.addColorStop(1, hexToRGBA(goldColor, 0.02));
            ctx.fillStyle = bar;
            ctx.fillRect(left, y + 2, columnWidth * share, bandHeight);
            ctx.restore();

            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = mutedColor;
            ctx.font = `800 ${rankSize}px ${FONT_BODY}`;
            ctx.fillText(String(row.pos), left + rankWidth / 2 + 4, centerY + 1);
            ctx.restore();

            drawOverflowCrest(ctx, {
                x: left + rankWidth + crestSize / 2 + (isStory ? 12 : 9),
                y: centerY,
                width: crestSize,
                height: crestSize,
                img,
                label: row.team,
                rawLogo: row.teamLogo,
                isDark,
                showFrame: false,
            });

            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = textColor;
            ctx.font = `700 ${nameFontSize}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, row.team.trim(), nameMaxWidth), left + nameOffset, centerY + 1);

            ctx.textAlign = 'right';
            ctx.fillStyle = goldColor;
            ctx.font = `800 ${countFontSize}px ${FONT_BODY}`;
            ctx.fillText(String(titlesOf(row)), right - (tight ? 12 : 16), centerY + 1);
            ctx.restore();
        });
    }

    // ---- Pie: marca centrada y, si el palmares no entro en una lamina, la pagina ----
    ctx.save();
    ctx.textBaseline = 'middle';

    if (slide.totalPages > 1) {
        let cursorRight = contentRight;
        if (slide.pageNumber < slide.totalPages) {
            ctx.font = `900 ${isStory ? 28 : 24}px ${FONT_BODY}`;
            ctx.fillStyle = textColor;
            ctx.textAlign = 'right';
            ctx.fillText('>>>', cursorRight, footerCenterY);
            cursorRight -= ctx.measureText('>>>').width + 22;
        }
        ctx.font = `700 ${isStory ? 20 : 17}px ${FONT_BODY}`;
        ctx.fillStyle = mutedColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${slide.pageNumber}/${slide.totalPages}`, cursorRight, footerCenterY);
    }

    const brandFontSize = isStory ? 23 : 20;
    const brandIconSize = isStory ? 32 : 28;
    ctx.font = `800 ${brandFontSize}px ${FONT_BODY}`;
    const brandTextWidth = ctx.measureText('G22 Scores').width;
    const brandStartX = width / 2 - (brandTextWidth + (brandLogo ? brandIconSize + 10 : 0)) / 2;
    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: brandStartX + brandIconSize / 2,
            y: footerCenterY,
            size: brandIconSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark,
            showFrame: false,
        });
    }
    ctx.font = `800 ${brandFontSize}px ${FONT_BODY}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.fillText('G22 Scores', brandStartX + (brandLogo ? brandIconSize + 10 : 0), footerCenterY);
    ctx.restore();
}

// Un partido sin jugar no siempre quiere publicar la hora: el modo 'vs' la reemplaza por VS.
// La decision se toma una sola vez aca y la comparten los tres disenos de fixture.
function getScheduledMatchLabel(
    match: DailyMatchesData['matches'][number],
    timeMode: DailyMatchesTimeMode,
    fallback = '--:--'
): string {
    if (timeMode === 'vs') return 'VS';
    const time = (match.time || '').trim();
    return time || fallback;
}

async function drawDailyMatches(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    timeMode: DailyMatchesTimeMode = 'time'
) {
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.7);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const matches = data.matches.slice(0, 10);
    const statusLabel = matches.every((match) => match.status === 'finished')
        ? 'RESULTADOS'
        : matches.every((match) => match.status === 'scheduled')
            ? 'FIXTURE'
            : 'PARTIDOS';
    const logoLoads = await Promise.all([
        loadImage(getTournamentLogoImageSource(data)),
        ...matches.flatMap((match) => [loadImage(match.homeLogo || ''), loadImage(match.awayLogo || '')]),
    ]);
    const tournamentLogo = logoLoads[0];

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        isStory ? 74 : 56,
        statusLabel,
        accentColor,
        getContrastColor(accentColor),
        `800 ${scaleElementSize('title', isStory ? 24 : 20, isStory ? 24 : 20)}px ${FONT_BODY}`,
        26,
        scaleElementSize('title', isStory ? 48 : 42, isStory ? 48 : 42)
    );
    drawTournamentRibbon(ctx, canvas, data.tournament, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 166 : 138, scaleElementSize('title', isStory ? 26 : 22, isStory ? 26 : 22));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
    ctx.fillText(data.date, safe.centerX, isStory ? 208 : 178);
    ctx.restore();

    const panelX = isStory ? 46 : 54;
    const panelY = offsetElementY('rowHeight', isStory ? 248 : 220);
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 18 : 10);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    const densityMode = resolveDensityMode(matches.length, 7, 9);
    const listTop = panelY + 28;
    const listBottom = panelY + panelHeight - 20;
    const rowGap = getDensitySpacing(densityMode, {
        comfortable: isStory ? 12 : 10,
        compact: isStory ? 10 : 8,
        ultraCompact: isStory ? 8 : 6,
    });
    const rowHeight = scaleElementSize('rowHeight', Math.min(
        getDensitySpacing(densityMode, {
            comfortable: isStory ? 124 : 112,
            compact: isStory ? 118 : 106,
            ultraCompact: isStory ? 112 : 100,
        }),
        (listBottom - listTop - rowGap * Math.max(matches.length - 1, 0)) / Math.max(matches.length, 1)
    ), isStory ? 124 : 112);
    const crestHeight = scaleElementSize('teamLogo', Math.min(isStory ? 90 : 76, rowHeight - 6), 68);
    const crestWidth = scaleElementSize('teamLogo', Math.min(isStory ? 78 : 66, crestHeight * 0.88), 68);
    const crestInset = isStory ? 16 : 12;
    const cardWidth = panelWidth - 48;
    const homeTextWidth = Math.max(110, safe.centerX - 108 - (panelX + 24 + crestInset + crestWidth + 18));
    const awayTextWidth = Math.max(110, (panelX + 24 + cardWidth - crestInset - crestWidth - 18) - (safe.centerX + 108));
    const sharedMatchNameFontSize = getSharedFittedFontSize(
        ctx,
        matches.flatMap((match) => ([
            { text: match.homeTeam.trim().toUpperCase(), maxWidth: homeTextWidth },
            { text: match.awayTeam.trim().toUpperCase(), maxWidth: awayTextWidth },
        ])),
        '800',
        isStory ? 26 : 22,
        FONT_DISPLAY,
        8,
    );

    matches.forEach((match, index) => {
        const y = listTop + index * (rowHeight + rowGap);
        const cardX = panelX + 24;
        const cardRight = cardX + cardWidth;
        const logoOffset = 1 + index * 2;
        const homeLogo = logoLoads[logoOffset] || null;
        const awayLogo = logoLoads[logoOffset + 1] || null;
        const centerText = match.status === 'scheduled'
            ? getScheduledMatchLabel(match, timeMode, '')
            : `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`;
        const crestCenterY = y + rowHeight / 2;
        const homeCrestCenterX = cardX + crestInset + crestWidth / 2;
        const awayCrestCenterX = cardRight - crestInset - crestWidth / 2;
        const homeTextX = homeCrestCenterX + crestWidth / 2 + 18;
        const awayTextX = awayCrestCenterX - crestWidth / 2 - 18;
        const awayDateX = Math.min(cardRight - 18, awayTextX + 18);
        const awayDateY = y + (isStory ? 30 : 24);

        ctx.save();
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)';
        ctx.beginPath();
        ctx.roundRect(cardX, y, cardWidth, rowHeight, 28);
        ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();


        if (match.dateLabel) {
            ctx.textAlign = 'right';
            ctx.fillStyle = mutedColor;
            ctx.font = `700 ${isStory ? 16 : 14}px ${FONT_BODY}`;
            ctx.fillText(match.dateLabel.toUpperCase(), awayDateX, awayDateY);
        }

        drawOverflowCrest(ctx, {
            x: homeCrestCenterX,
            y: crestCenterY,
            width: crestWidth,
            height: crestHeight,
            img: homeLogo,
            label: match.homeTeam,
            rawLogo: match.homeLogo,
            isDark,
        });
        drawOverflowCrest(ctx, {
            x: awayCrestCenterX,
            y: crestCenterY,
            width: crestWidth,
            height: crestHeight,
            img: awayLogo,
            label: match.awayTeam,
            rawLogo: match.awayLogo,
            isDark,
        });

        ctx.textBaseline = 'middle';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.font = `800 ${sharedMatchNameFontSize}px ${FONT_DISPLAY}`;
        ctx.fillText(match.homeTeam.toUpperCase(), homeTextX, y + rowHeight / 2 + 10);

        ctx.textAlign = 'right';
        ctx.font = `800 ${sharedMatchNameFontSize}px ${FONT_DISPLAY}`;
        ctx.fillText(match.awayTeam.toUpperCase(), awayTextX, y + rowHeight / 2 + 10);

        ctx.textAlign = 'center';
        ctx.fillStyle = accentColor;
        ctx.font = `800 ${scaleElementSize('score', isStory ? 44 : 38, isStory ? 44 : 38)}px ${match.status === 'scheduled' ? FONT_DISPLAY : FONT_MONO}`;
        ctx.fillText(centerText, safe.centerX, y + rowHeight / 2 + 4);

        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 16 : 14}px ${FONT_BODY}`;
        ctx.fillText(
            match.status === 'scheduled'
                ? (timeMode === 'vs' ? 'PROGRAMADO' : 'HORARIO')
                : match.status === 'live' ? 'EN JUEGO' : 'MARCADOR FINAL',
            safe.centerX,
            y + rowHeight / 2 + (isStory ? 38 : 32)
        );
        ctx.restore();
    });

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
}

function getLineupMetaLabel(data: LineupsData) {
    const parts = [
        data.subtitle?.trim(),
        [data.date?.trim(), data.time?.trim()].filter(Boolean).join(' · '),
        data.venue?.trim(),
    ].filter(Boolean);

    return parts.join('  //  ');
}

function getSelectedLineupTeams(data: LineupsData, mode: LineupExportMode): Array<LineupExportTeamData & { side: 'home' | 'away' }> {
    const teams = [
        { ...data.homeTeam, side: 'home' as const },
        { ...data.awayTeam, side: 'away' as const },
    ];

    if (mode === 'home') return [teams[0]];
    if (mode === 'away') return [teams[1]];
    return teams;
}

function isLineupStarter(player: LineupExportPlayerData, index: number) {
    const role = String(player.role || '').trim().toLowerCase();
    if (role === 'starter' || role === 'titular') return true;
    if (role === 'substitute' || role === 'suplente' || role === 'finisher') return false;

    const shirtNumber = Number(player.number);
    if (Number.isFinite(shirtNumber)) {
        return shirtNumber <= 15;
    }

    return index < 15;
}

function formatLineupExportRating(value: unknown) {
    const parsed =
        typeof value === 'number' && Number.isFinite(value)
            ? value
            : typeof value === 'string'
                ? Number(value.replace(',', '.'))
                : Number.NaN;

    if (!Number.isFinite(parsed)) return '';
    const clamped = Math.min(10, Math.max(0, parsed));
    return clamped.toFixed(1);
}

function getLineupExportRatingValue(value: unknown) {
    const formatted = formatLineupExportRating(value);
    if (!formatted) return null;

    const parsed = Number(formatted);
    return Number.isFinite(parsed) ? parsed : null;
}

function computeHighestLineupRating(teams: Array<{ starters?: LineupExportPlayerData[] | null } | null | undefined>): number | null {
    let best: number | null = null;
    for (const team of teams) {
        const players = team?.starters;
        if (!Array.isArray(players)) continue;
        for (const player of players) {
            const rating = getLineupExportRatingValue(player?.rating);
            if (rating == null) continue;
            if (best == null || rating > best) best = rating;
        }
    }
    return best;
}

type SquadPageGroupData = SquadExportGroupData & {
    continuedFromPrevious?: boolean;
    continuesOnNext?: boolean;
};

type SquadPageData = {
    groups: SquadPageGroupData[];
    pageNumber: number;
    totalPages: number;
    totalPlayers: number;
};

type SquadColumnData = {
    groups: SquadPageGroupData[];
    units: number;
};

type SquadBoardOptions = {
    x: number;
    y: number;
    width: number;
    height: number;
    panelFill: string;
    panelStroke: string;
    groupFill: string;
    groupTextColor: string;
    rowFillEven: string;
    rowFillOdd: string;
    rowStroke: string;
    primaryText: string;
    secondaryText: string;
    numberFill: string;
    numberText: string;
    accentColor: string;
};

function getSquadPlayerCount(data: SquadData) {
    return Array.isArray(data.groups)
        ? data.groups.reduce((sum, group) => (
            sum + (Array.isArray(group.players)
                ? group.players.filter((player) => player && String(player.name || '').trim()).length
                : 0)
        ), 0)
        : 0;
}

function getTeamOfWeekPlayerCount(data: TeamOfWeekData) {
    return Array.isArray(data.players)
        ? data.players.filter((player) => player && String(player.name || '').trim()).length
        : 0;
}

function formatSquadGroupLabel(group: SquadPageGroupData) {
    const label = String(group.label || '').trim();
    return group.continuedFromPrevious ? `${label.toUpperCase()} (CONT.)` : label.toUpperCase();
}

function getSquadPageMetaLabel(data: SquadData, page: SquadPageData) {
    const parts = [data.subtitle?.trim()].filter(Boolean);
    if (page.totalPages > 1) {
        parts.push(`Pagina ${page.pageNumber}/${page.totalPages}`);
    }
    return parts.join('  //  ');
}

function getSquadPlayerMetaLabel(player: SquadExportPlayerData) {
    const ageValue = player.age === null || player.age === undefined ? '' : String(player.age).trim();
    const parts = [
        String(player.country || '').trim(),
        ageValue ? `${ageValue}a` : '',
        String(player.teamLabel || '').trim(),
    ].filter(Boolean);

    if (parts.length === 0) {
        return String(player.birthDate || '').trim();
    }

    return parts.slice(0, 3).join('  •  ');
}

function buildSquadPages(data: SquadData, format: CanvasFormat): SquadPageData[] {
    const isStory = format.height > format.width;
    const groupChunkSize = isStory ? 20 : 15;
    const pageCapacity = isStory ? 52 : 40;
    const groupHeaderUnits = 1.6;
    const sourceGroups = Array.isArray(data.groups) ? data.groups : [];
    const chunkedGroups: SquadPageGroupData[] = [];

    sourceGroups.forEach((group) => {
        const label = String(group.label || '').trim();
        if (!label) return;
        const players = Array.isArray(group.players)
            ? group.players.filter((player) => player && String(player.name || '').trim())
            : [];

        for (let index = 0; index < players.length; index += groupChunkSize) {
            chunkedGroups.push({
                label,
                players: players.slice(index, index + groupChunkSize),
                continuedFromPrevious: index > 0,
                continuesOnNext: index + groupChunkSize < players.length,
            });
        }
    });

    if (chunkedGroups.length === 0) return [];

    const pages: Array<{ groups: SquadPageGroupData[]; usedUnits: number }> = [];
    let currentPage = { groups: [] as SquadPageGroupData[], usedUnits: 0 };

    const commitPage = () => {
        if (currentPage.groups.length === 0) return;
        pages.push(currentPage);
        currentPage = { groups: [], usedUnits: 0 };
    };

    chunkedGroups.forEach((group) => {
        const requiredUnits = groupHeaderUnits + group.players.length;
        if (currentPage.groups.length > 0 && currentPage.usedUnits + requiredUnits > pageCapacity) {
            commitPage();
        }

        currentPage.groups.push(group);
        currentPage.usedUnits += requiredUnits;
    });

    commitPage();

    return pages.map((page, index, allPages) => ({
        groups: page.groups,
        pageNumber: index + 1,
        totalPages: allPages.length,
        totalPlayers: page.groups.reduce((sum, group) => sum + group.players.length, 0),
    }));
}

function distributeSquadGroupsAcrossColumns(groups: SquadPageGroupData[], columnCount: number): SquadColumnData[] {
    const columns: SquadColumnData[] = Array.from({ length: Math.max(1, columnCount) }, () => ({ groups: [], units: 0 }));

    groups.forEach((group) => {
        const groupUnits = group.players.length + 1.6;
        const targetIndex = columns.reduce((bestIndex, column, index) => (
            column.units < columns[bestIndex].units ? index : bestIndex
        ), 0);

        columns[targetIndex].groups.push(group);
        columns[targetIndex].units += groupUnits;
    });

    return columns;
}

function drawSquadBoard(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    page: SquadPageData,
    options: SquadBoardOptions,
) {
    const totalPlayers = page.groups.reduce((sum, group) => sum + group.players.length, 0);
    const isStory = canvas.height > 1500;
    const columnCount = page.groups.length > 1 && (totalPlayers > (isStory ? 18 : 14) || page.groups.length > 2) ? 2 : 1;
    const columns = distributeSquadGroupsAcrossColumns(page.groups, columnCount);
    const columnGap = columnCount === 2 ? Math.round(options.width * 0.03) : 0;
    const horizontalPadding = columnCount === 1 ? (isStory ? 36 : 30) : (isStory ? 28 : 22);
    const topPadding = isStory ? 34 : 28;
    const bottomPadding = isStory ? 30 : 24;
    const availableHeight = options.height - topPadding - bottomPadding;
    const columnWidth = (options.width - horizontalPadding * 2 - columnGap * Math.max(0, columnCount - 1)) / columnCount;

    let rowHeight = isStory ? 34 : 30;
    let headerHeight = isStory ? 26 : 24;
    let headerGap = isStory ? 9 : 7;
    let rowGap = isStory ? 7 : 5;
    let sectionGap = isStory ? 16 : 12;
    let nameFontSize = isStory ? 15 : 13;
    let metaFontSize = isStory ? 10.5 : 9.5;

    const getColumnHeight = (groups: SquadPageGroupData[]) => groups.reduce((sum, group, index) => (
        sum
        + headerHeight
        + headerGap
        + group.players.length * rowHeight
        + Math.max(0, group.players.length - 1) * rowGap
        + (index < groups.length - 1 ? sectionGap : 0)
    ), 0);

    while (Math.max(...columns.map((column) => getColumnHeight(column.groups))) > availableHeight && rowHeight > (isStory ? 22 : 20)) {
        rowHeight -= 1;
        if (headerHeight > 20) headerHeight -= 1;
        if (headerGap > 5) headerGap -= 1;
        if (rowGap > 3) rowGap -= 1;
        if (sectionGap > 8) sectionGap -= 1;
        if (nameFontSize > 11) nameFontSize -= 0.5;
        if (metaFontSize > 8.5) metaFontSize -= 0.5;
    }

    ctx.save();
    ctx.fillStyle = options.panelFill;
    ctx.strokeStyle = options.panelStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(options.x, options.y, options.width, options.height, isStory ? 34 : 28);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    columns.forEach((column, columnIndex) => {
        const startX = options.x + horizontalPadding + columnIndex * (columnWidth + columnGap);
        let cursorY = options.y + topPadding;

        column.groups.forEach((group, groupIndex) => {
            ctx.save();
            ctx.fillStyle = options.groupFill;
            ctx.beginPath();
            ctx.roundRect(startX, cursorY, columnWidth, headerHeight, 999);
            ctx.fill();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = options.groupTextColor;
            ctx.font = `800 ${Math.round(nameFontSize)}px ${FONT_BODY}`;
            ctx.fillText(
                truncateTextToWidth(ctx, formatSquadGroupLabel(group), columnWidth - 28),
                startX + 14,
                cursorY + headerHeight / 2 + 1,
            );
            ctx.restore();

            cursorY += headerHeight + headerGap;

            group.players.forEach((player, playerIndex) => {
                const rowY = cursorY + playerIndex * (rowHeight + rowGap);
                const rowFill = playerIndex % 2 === 0 ? options.rowFillEven : options.rowFillOdd;
                const rowRadius = Math.max(12, Math.round(rowHeight * 0.45));
                const numberWidth = columnCount === 1 ? (isStory ? 54 : 48) : (isStory ? 48 : 44);
                const rowInnerPadding = isStory ? 14 : 12;
                const detailLabel = getSquadPlayerMetaLabel(player).toUpperCase();
                const detailWidth = detailLabel ? Math.min(columnWidth * 0.34, isStory ? 190 : 160) : 0;
                const nameX = startX + rowInnerPadding + numberWidth + 12;
                const detailX = startX + columnWidth - rowInnerPadding;
                const nameWidth = Math.max(110, columnWidth - (nameX - startX) - rowInnerPadding - (detailWidth > 0 ? detailWidth + 12 : 0));
                const playerLabel = String(player.name || 'Jugador').trim().toUpperCase();
                const numberLabel = String(player.number ?? '').trim() || '-';

                ctx.save();
                ctx.fillStyle = rowFill;
                ctx.strokeStyle = options.rowStroke;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(startX, rowY, columnWidth, rowHeight, rowRadius);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = options.numberFill;
                ctx.beginPath();
                ctx.roundRect(
                    startX + rowInnerPadding,
                    rowY + Math.max(4, Math.round((rowHeight - Math.max(18, rowHeight - 10)) / 2)),
                    numberWidth,
                    Math.max(18, rowHeight - 10),
                    Math.max(10, Math.round(rowRadius * 0.72))
                );
                ctx.fill();

                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = options.numberText;
                ctx.font = `800 ${Math.max(11, Math.round(nameFontSize - 1))}px ${FONT_MONO}`;
                ctx.fillText(numberLabel, startX + rowInnerPadding + numberWidth / 2, rowY + rowHeight / 2 + 1);

                ctx.textAlign = 'left';
                ctx.fillStyle = options.primaryText;
                setFittedFont(ctx, playerLabel, nameWidth, '800', Math.round(nameFontSize), FONT_BODY, 10);
                ctx.fillText(truncateTextToWidth(ctx, playerLabel, nameWidth), nameX, rowY + rowHeight / 2 + 1);

                if (detailLabel) {
                    ctx.textAlign = 'right';
                    ctx.fillStyle = options.secondaryText;
                    setFittedFont(ctx, detailLabel, detailWidth, '700', Math.round(metaFontSize), FONT_BODY, 8);
                    ctx.fillText(truncateTextToWidth(ctx, detailLabel, detailWidth), detailX, rowY + rowHeight / 2 + 1);
                }

                ctx.restore();
            });

            cursorY += group.players.length * rowHeight + Math.max(0, group.players.length - 1) * rowGap;
            if (groupIndex < column.groups.length - 1) {
                cursorY += sectionGap;
            }
        });
    });

    ctx.save();
    ctx.strokeStyle = hexToRGBA(options.accentColor, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(options.x + 10, options.y + 10, options.width - 20, options.height - 20, isStory ? 28 : 24);
    ctx.stroke();
    ctx.restore();
}


async function drawMomentumSquad(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: SquadData,
    page: SquadPageData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
) {
    void _format;
    const accent = normalizeHexColor(accentColor) || BRAND_ACCENT;
    const headerLogo = await loadImage(data.teamLogo || data.tournamentLogo || '');
    const footerMetrics = getBrandFooterMetrics(canvas);
    const panelY = canvas.height > 1500 ? 352 : 300;
    const panelX = canvas.height > 1500 ? 48 : 54;
    const panelHeight = footerMetrics.topLine - panelY - (canvas.height > 1500 ? 22 : 18);
    const panelWidth = canvas.width - panelX * 2;
    const pageMeta = getSquadPageMetaLabel(data, page);

    drawMomentumBackdrop(ctx, canvas, accent, bgColor);

    if (headerLogo) {
        drawOverflowCrest(ctx, {
            x: canvas.width / 2,
            y: canvas.height > 1500 ? 86 : 80,
            width: canvas.height > 1500 ? 70 : 62,
            height: canvas.height > 1500 ? 70 : 62,
            img: headerLogo,
            label: data.teamName,
            rawLogo: data.teamLogo || data.tournamentLogo,
            isDark: true,
            showFrame: false,
        });
    }

    drawMomentumKicker(ctx, canvas.width / 2, canvas.height > 1500 ? 154 : 140, data.tournament || data.teamName, getMutedColor(true, 0.76), 'center');
    drawMomentumHeroTitle(ctx, 'Plantel', canvas.width / 2, canvas.height > 1500 ? 242 : 220, canvas.width - 180, canvas.height > 1500 ? 96 : 84, '#ffffff', 'center');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, data.teamName.toUpperCase(), canvas.width - 220, '800', canvas.height > 1500 ? 28 : 24, FONT_BODY, 16);
    ctx.fillText(truncateTextToWidth(ctx, data.teamName.toUpperCase(), canvas.width - 220), canvas.width / 2, canvas.height > 1500 ? 286 : 258);
    if (pageMeta) {
        ctx.fillStyle = getMutedColor(true, 0.74);
        ctx.font = `700 ${canvas.height > 1500 ? 15 : 13}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, pageMeta.toUpperCase(), canvas.width - 220), canvas.width / 2, canvas.height > 1500 ? 318 : 288);
    }
    ctx.restore();

    drawSquadBoard(ctx, canvas, page, {
        x: panelX,
        y: panelY,
        width: panelWidth,
        height: panelHeight,
        panelFill: 'rgba(8,8,10,0.78)',
        panelStroke: hexToRGBA(accent, 0.72),
        groupFill: hexToRGBA(accent, 0.18),
        groupTextColor: '#ffffff',
        rowFillEven: 'rgba(255,255,255,0.05)',
        rowFillOdd: 'rgba(255,255,255,0.028)',
        rowStroke: 'rgba(255,255,255,0.06)',
        primaryText: '#ffffff',
        secondaryText: getMutedColor(true, 0.72),
        numberFill: hexToRGBA(accent, 0.24),
        numberText: '#ffffff',
        accentColor: accent,
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawPosterV3Squad(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: SquadData,
    page: SquadPageData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
) {
    void _format;
    const palette = resolvePosterV3GradientPalette(bgColor, accentColor);
    const headerLogo = await loadImage(data.teamLogo || data.tournamentLogo || '');
    const footerMetrics = getBrandFooterMetrics(canvas);
    const panelY = canvas.height > 1500 ? 366 : 314;
    const panelX = canvas.height > 1500 ? 48 : 54;
    const panelHeight = footerMetrics.topLine - panelY - (canvas.height > 1500 ? 20 : 16);
    const panelWidth = canvas.width - panelX * 2;
    const pageMeta = getSquadPageMetaLabel(data, page);
    const teamLabel = data.teamName.toUpperCase();

    drawPosterV3Backdrop(ctx, canvas, accentColor, bgColor);

    drawPosterV3Kicker(ctx, canvas.width / 2, canvas.height > 1500 ? 104 : 96, (data.tournament || data.teamName).toUpperCase(), hexToRGBA(palette.accentPrimary, 0.96), 'center');
    drawPosterV3OutlineTitle(ctx, 'Plantel', canvas.width / 2, canvas.height > 1500 ? 206 : 188, canvas.width - 180, canvas.height > 1500 ? 112 : 96, hexToRGBA('#ffffff', 0.26), 'center');

    if (headerLogo) {
        drawOverflowCrest(ctx, {
            x: canvas.width - (canvas.height > 1500 ? 88 : 78),
            y: canvas.height > 1500 ? 94 : 88,
            width: canvas.height > 1500 ? 58 : 50,
            height: canvas.height > 1500 ? 58 : 50,
            img: headerLogo,
            label: data.teamName,
            rawLogo: data.teamLogo || data.tournamentLogo,
            isDark: true,
            showFrame: false,
        });
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, teamLabel, canvas.width - 220, '800', canvas.height > 1500 ? 30 : 24, FONT_BODY, 16);
    ctx.fillText(truncateTextToWidth(ctx, teamLabel, canvas.width - 220), canvas.width / 2, canvas.height > 1500 ? 274 : 248);
    if (pageMeta) {
        ctx.fillStyle = hexToRGBA('#ffffff', 0.72);
        ctx.font = `700 ${canvas.height > 1500 ? 15 : 13}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, pageMeta.toUpperCase(), canvas.width - 220), canvas.width / 2, canvas.height > 1500 ? 308 : 280);
    }
    ctx.restore();

    drawSquadBoard(ctx, canvas, page, {
        x: panelX,
        y: panelY,
        width: panelWidth,
        height: panelHeight,
        panelFill: hexToRGBA(mixHexColors(bgColor, '#04080f', 0.78), 0.92),
        panelStroke: hexToRGBA(palette.accentPrimary, 0.52),
        groupFill: hexToRGBA(palette.accentPrimary, 0.18),
        groupTextColor: '#ffffff',
        rowFillEven: hexToRGBA('#ffffff', 0.04),
        rowFillOdd: hexToRGBA('#ffffff', 0.02),
        rowStroke: hexToRGBA('#ffffff', 0.08),
        primaryText: '#ffffff',
        secondaryText: hexToRGBA('#ffffff', 0.72),
        numberFill: hexToRGBA(palette.accentPrimary, 0.24),
        numberText: '#ffffff',
        accentColor: palette.accentPrimary,
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

function resolveDensityMode(itemCount: number, compactThreshold: number, ultraCompactThreshold: number): DensityMode {
    if (itemCount >= ultraCompactThreshold) return 'ultra-compact';
    if (itemCount >= compactThreshold) return 'compact';
    return 'comfortable';
}

function getDensitySpacing(
    densityMode: DensityMode,
    values: { comfortable: number; compact: number; ultraCompact: number }
) {
    if (densityMode === 'ultra-compact') return values.ultraCompact;
    if (densityMode === 'compact') return values.compact;
    return values.comfortable;
}

// Legacy g22Base lineup renderer kept temporarily while the new template settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function drawLineups(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    lineupExportMode: LineupExportMode,
) {
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.72);
    const softColor = getMutedColor(isDark, 0.1);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const metaLabel = getLineupMetaLabel(data);
    const selectedTeams = getSelectedLineupTeams(data, lineupExportMode).map((team) => ({
        ...team,
        starters: Array.isArray(team.starters)
            ? team.starters.filter((player) => player && String(player.name || '').trim()).slice(0, 23)
            : [],
    }));
    const highestRating = selectedTeams.reduce<number | null>((best, team) => {
        team.starters.forEach((player) => {
            const rating = getLineupExportRatingValue(player.rating);
            if (rating == null) return;
            if (best == null || rating > best) {
                best = rating;
            }
        });

        return best;
    }, null);
    const isSingleTeam = selectedTeams.length === 1;
    const totalPlayers = selectedTeams.reduce((sum, team) => sum + team.starters.length, 0);
    const [tournamentLogo, homeLogo, awayLogo] = await Promise.all([
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(data.homeTeam.logo || ''),
        loadImage(data.awayTeam.logo || ''),
    ]);
    const teamLogoMap = {
        home: homeLogo,
        away: awayLogo,
    } as const;

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        isStory ? 74 : 56,
        isSingleTeam ? 'FORMACION CONFIRMADA' : 'ALINEACIONES CONFIRMADAS',
        accentColor,
        getContrastColor(accentColor),
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        26,
        isStory ? 48 : 42,
    );
    drawTournamentRibbon(
        ctx,
        canvas,
        data.tournament,
        tournamentLogo,
        data.tournamentLogo,
        accentColor,
        isDark,
        isStory ? 166 : 138,
        isStory ? 26 : 22,
    );

    if (metaLabel) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${isStory ? 18 : 15}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, metaLabel.toUpperCase(), canvas.width - 140), safe.centerX, isStory ? 208 : 178);
        ctx.restore();
    }

    const panelX = isStory ? 38 : 46;
    const panelY = isStory ? 248 : 220;
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 22 : 18);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    if (totalPlayers === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 24 : 20}px ${FONT_BODY}`;
        ctx.fillText('No hay alineaciones confirmadas para exportar.', safe.centerX, panelY + panelHeight / 2);
        ctx.restore();
        drawBrandFooter(ctx, canvas, brandLogo, isDark);
        return;
    }

    const contentX = panelX + 18;
    const contentY = panelY + 18;
    const contentWidth = panelWidth - 36;
    const columnGap = isSingleTeam ? 0 : (isStory ? 22 : 18);
    const columnWidth = isSingleTeam ? contentWidth : (contentWidth - columnGap) / 2;
    const headerHeight = isSingleTeam ? (isStory ? 126 : 118) : (isStory ? 112 : 102);

    if (!isSingleTeam) {
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + panelWidth / 2, contentY + 10);
        ctx.lineTo(panelX + panelWidth / 2, panelY + panelHeight - 26);
        ctx.stroke();
        ctx.restore();
    }

    selectedTeams.forEach((team, index) => {
        const columnX = isSingleTeam
            ? contentX
            : contentX + index * (columnWidth + columnGap);
        const logoImage = teamLogoMap[team.side];
        const players = [...team.starters].sort((left, right) => Number(left.number ?? 0) - Number(right.number ?? 0));
        const densityMode = resolveDensityMode(players.length, isSingleTeam ? 20 : 18, isSingleTeam ? 23 : 21);
        const starterLimit = getDensitySpacing(densityMode, {
            comfortable: 15,
            compact: 15,
            ultraCompact: isSingleTeam ? 15 : 14,
        });
        const benchLimit = getDensitySpacing(densityMode, {
            comfortable: isSingleTeam ? 8 : 8,
            compact: isSingleTeam ? 7 : 7,
            ultraCompact: isSingleTeam ? 6 : 6,
        });
        const starters = players
            .filter((player, playerIndex) => isLineupStarter(player, playerIndex))
            .slice(0, starterLimit);
        const finishers = players
            .filter((player, playerIndex) => !isLineupStarter(player, playerIndex))
            .slice(0, benchLimit);
        const startersCount = starters.length;
        const finishersCount = finishers.length;
        const listTop = contentY + headerHeight + 16;
        const finishersLabelHeight = finishersCount > 0 ? (isSingleTeam ? 28 : 24) : 0;
        const starterGap = getDensitySpacing(densityMode, {
            comfortable: isSingleTeam ? 8 : 7,
            compact: isSingleTeam ? 7 : 6,
            ultraCompact: isSingleTeam ? 6 : 5,
        });
        const finisherGap = getDensitySpacing(densityMode, {
            comfortable: isSingleTeam ? 6 : 5,
            compact: isSingleTeam ? 5 : 4,
            ultraCompact: isSingleTeam ? 4 : 3,
        });
        const finishersTopPadding = finishersCount > 0 ? 18 : 0;
        const starterRowHeight = startersCount > 0
            ? getDensitySpacing(densityMode, {
                comfortable: isSingleTeam ? 36 : 34,
                compact: isSingleTeam ? 34 : 32,
                ultraCompact: isSingleTeam ? 32 : 30,
            })
            : 0;
        const finisherRowHeight = finishersCount > 0
            ? getDensitySpacing(densityMode, {
                comfortable: isSingleTeam ? 28 : 26,
                compact: isSingleTeam ? 26 : 24,
                ultraCompact: isSingleTeam ? 24 : 22,
            })
            : 0;
        const starterRowRadius = Math.max(12, Math.round(starterRowHeight * 0.42));
        const finisherRowRadius = Math.max(10, Math.round(finisherRowHeight * 0.42));
        const rowInset = isSingleTeam ? 16 : 12;
        const numberWidth = isSingleTeam ? 60 : 48;
        const ratingWidth = columnWidth > 360 ? 84 : 68;
        const titleMaxWidth = columnWidth - (isSingleTeam ? 176 : 140);
        const subtitleY = contentY + (isSingleTeam ? 86 : 76);

        ctx.save();
        ctx.fillStyle = hexToRGBA(accentColor, isDark ? 0.12 : 0.08);
        ctx.beginPath();
        ctx.roundRect(columnX, contentY, columnWidth, headerHeight, 30);
        ctx.fill();
        ctx.strokeStyle = hexToRGBA(accentColor, isDark ? 0.22 : 0.14);
        ctx.lineWidth = 1;
        ctx.stroke();

        drawLogoBadge(ctx, {
            x: columnX + (isSingleTeam ? 54 : 44),
            y: contentY + headerHeight / 2,
            size: isSingleTeam ? 72 : 58,
            img: logoImage,
            label: team.name,
            rawLogo: team.logo,
            isDark,
        });

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = textColor;
        setFittedFont(ctx, team.name.toUpperCase(), titleMaxWidth, '800', isSingleTeam ? 42 : 30, FONT_DISPLAY, 18);
        ctx.fillText(team.name.toUpperCase(), columnX + (isSingleTeam ? 106 : 88), contentY + (isSingleTeam ? 58 : 50));

        ctx.fillStyle = mutedColor;
        ctx.font = `800 ${isSingleTeam ? 15 : 13}px ${FONT_BODY}`;
        ctx.fillText((team.lineupLabel || 'Titulares').toUpperCase(), columnX + (isSingleTeam ? 106 : 88), subtitleY);

        ctx.textAlign = 'right';
        ctx.fillStyle = accentColor;
        ctx.font = `800 ${isSingleTeam ? 16 : 14}px ${FONT_MONO}`;
        ctx.fillText(`${players.length} JUG.`, columnX + columnWidth - 22, subtitleY);
        ctx.restore();

        if (players.length === 0) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = mutedColor;
            ctx.font = `700 ${isStory ? 18 : 16}px ${FONT_BODY}`;
            ctx.fillText('Sin titulares confirmados', columnX + columnWidth / 2, contentY + headerHeight + 56);
            ctx.restore();
            return;
        }

        starters.forEach((player, playerIndex) => {
            const rowY = listTop + playerIndex * (starterRowHeight + starterGap);
            const rowNumber = player.number ?? playerIndex + 1;
            const playerName = `${player.name}${player.isCaptain ? ' (C)' : ''}`.trim().toUpperCase();
            const ratingLabel = formatLineupExportRating(player.rating);
            const ratingValue = getLineupExportRatingValue(player.rating);
            const isTopRated = ratingValue != null && highestRating != null && ratingValue === highestRating;
            const displayRatingLabel = isTopRated && ratingLabel ? `${ratingLabel} ★` : ratingLabel;
            const textX = columnX + rowInset + numberWidth + 16;
            const textWidth = Math.max(110, columnWidth - rowInset * 2 - numberWidth - (displayRatingLabel ? ratingWidth : 0) - 22);
            const positionX = columnX + columnWidth - rowInset - 4;

            ctx.save();
            ctx.fillStyle = playerIndex % 2 === 0
                ? hexToRGBA(accentColor, isDark ? 0.08 : 0.06)
                : softColor;
            ctx.beginPath();
            ctx.roundRect(columnX, rowY, columnWidth, starterRowHeight, starterRowRadius);
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = accentColor;
            ctx.font = `800 ${isSingleTeam ? 18 : 16}px ${FONT_MONO}`;
            ctx.fillText(String(rowNumber).padStart(2, '0'), columnX + rowInset + numberWidth / 2, rowY + starterRowHeight / 2 + 1);

            ctx.textAlign = 'left';
            ctx.fillStyle = textColor;
            setFittedFont(ctx, playerName, textWidth, '800', isSingleTeam ? 17 : 15, FONT_BODY, 11);
            ctx.fillText(playerName, textX, rowY + starterRowHeight / 2 + 1);

            if (displayRatingLabel) {
                ctx.textAlign = 'right';
                ctx.fillStyle = isTopRated ? '#facc15' : accentColor;
                setFittedFont(ctx, displayRatingLabel, ratingWidth, '800', isSingleTeam ? 17 : 15, FONT_BODY, 11);
                ctx.fillText(truncateTextToWidth(ctx, displayRatingLabel, ratingWidth), positionX, rowY + starterRowHeight / 2 + 1);
            }

            ctx.restore();
        });

        if (finishersCount > 0) {
            const finishersLabelY = listTop + startersCount * (starterRowHeight + starterGap) + 10;

            ctx.save();
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(columnX, finishersLabelY + finishersLabelHeight / 2);
            ctx.lineTo(columnX + columnWidth * 0.32, finishersLabelY + finishersLabelHeight / 2);
            ctx.moveTo(columnX + columnWidth * 0.68, finishersLabelY + finishersLabelHeight / 2);
            ctx.lineTo(columnX + columnWidth, finishersLabelY + finishersLabelHeight / 2);
            ctx.stroke();

            ctx.fillStyle = mutedColor;
            ctx.font = `800 ${isSingleTeam ? 13 : 11}px ${FONT_BODY}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SUPLENTES', columnX + columnWidth / 2, finishersLabelY + finishersLabelHeight / 2 + 1);

            ctx.textAlign = 'right';
            ctx.fillStyle = accentColor;
            ctx.font = `800 ${isSingleTeam ? 13 : 11}px ${FONT_MONO}`;
            ctx.fillText(String(finishersCount).padStart(2, '0'), columnX + columnWidth, finishersLabelY - 2);
            ctx.restore();

            finishers.forEach((player, finisherIndex) => {
                const rowY = finishersLabelY + finishersLabelHeight + finishersTopPadding + finisherIndex * (finisherRowHeight + finisherGap);
                const rowNumber = player.number ?? startersCount + finisherIndex + 1;
                const playerName = `${player.name}${player.isCaptain ? ' (C)' : ''}`.trim().toUpperCase();
                const ratingLabel = formatLineupExportRating(player.rating);
                const ratingValue = getLineupExportRatingValue(player.rating);
                const isTopRated = ratingValue != null && highestRating != null && ratingValue === highestRating;
                const displayRatingLabel = isTopRated && ratingLabel ? `${ratingLabel} ★` : ratingLabel;
                const textX = columnX + rowInset + numberWidth + 12;
                const textWidth = Math.max(96, columnWidth - rowInset * 2 - numberWidth - (displayRatingLabel ? ratingWidth : 0) - 18);
                const positionX = columnX + columnWidth - rowInset - 2;

                ctx.save();
                ctx.fillStyle = finisherIndex % 2 === 0
                    ? hexToRGBA(accentColor, isDark ? 0.05 : 0.04)
                    : hexToRGBA(isDark ? '#ffffff' : '#0f172a', isDark ? 0.035 : 0.03);
                ctx.beginPath();
                ctx.roundRect(columnX, rowY, columnWidth, finisherRowHeight, finisherRowRadius);
                ctx.fill();
                ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = accentColor;
                ctx.font = `800 ${isSingleTeam ? 15 : 14}px ${FONT_MONO}`;
                ctx.fillText(String(rowNumber).padStart(2, '0'), columnX + rowInset + numberWidth / 2, rowY + finisherRowHeight / 2 + 1);

                ctx.textAlign = 'left';
                ctx.fillStyle = textColor;
                setFittedFont(ctx, playerName, textWidth, '800', isSingleTeam ? 13 : 12, FONT_BODY, 9);
                ctx.fillText(playerName, textX, rowY + finisherRowHeight / 2 + 1);

                if (displayRatingLabel) {
                    ctx.textAlign = 'right';
                    ctx.fillStyle = isTopRated ? '#facc15' : accentColor;
                    setFittedFont(ctx, displayRatingLabel, ratingWidth, '800', isSingleTeam ? 13 : 12, FONT_BODY, 9);
                    ctx.fillText(truncateTextToWidth(ctx, displayRatingLabel, ratingWidth), positionX, rowY + finisherRowHeight / 2 + 1);
                }

                ctx.restore();
            });
        }
    });

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
}

// ============================================================================
// Formaciones y convocatoria de G22 Base. Las tres placas estan calcadas de las
// piezas que publican las uniones en Instagram, y la referencia manda:
//
//   * FORMACION CLASICA — la de Uruguay XV: fondo oscuro con la luz del acento
//     arriba, "XV INICIAL" (XV en serif, INICIAL en negra), los quince en
//     ESCALERA que baja hacia la derecha (1-3, 4-5, 6-8, 9-10, 12-13, 11-14-15),
//     el nombre chico en blanco sobre el apellido grande en serif del acento, y
//     los suplentes colgados de un filete vertical a la derecha. El pie es una
//     linea con fecha y hora, sede y el nombre del equipo.
//   * FORMACION EDITORIAL — la de Los Pumas: la foto del jugador ocupa la mitad
//     izquierda y se funde con el fondo, "XV INICIAL" condensado en el acento,
//     la lista numerada en oblicua pesada, los FINISHERS en parrafo corrido y
//     una tarjeta del acento con los escudos, la sede y la hora de salida.
//   * CONVOCATORIA — la de Argentina XV: "CONVOCATORIA" enorme en el acento, el
//     torneo debajo, el escudo arriba a la derecha y la lista "Apellido, Nombre"
//     en oblicua a dos columnas, numerada de corrido.
//
// Las tres se escalan por ANCHO (u = v * W / 1080) y reparten el alto de mas
// del story como aire, igual que la placa de partido. La marca del pie es la
// del medio que cubre el deporte (Salida de 22 en rugby), como en la placa.
// ============================================================================

const FONT_LINEUP_SERIF = '"Playfair Display", "Georgia", "Times New Roman", serif';

// Los nombres llegan enteros ("Felipe Arcos Perez") y las piezas piden nombre y
// apellido por separado. Sin un dato de origen la particion es heuristica:
// - con coma, ya viene "Apellido, Nombre";
// - dos palabras: nombre y apellido;
// - tres o mas: el apellido compuesto es mas comun que el nombre doble en un
//   plantel de rugby (Sanchez Valarolo, Benitez Cruz, Arcos Perez), asi que el
//   nombre es la primera palabra... salvo que arranque con un nombre que casi
//   siempre viene de a dos (Juan Manuel, Juan Cruz, Jose Luis, Maria Jose).
const LINEUP_GIVEN_NAME_LEADERS = new Set(['juan', 'jose', 'josé', 'maria', 'maría', 'luis', 'carlos', 'ana', 'miguel', 'jean', 'marco', 'pablo']);
const LINEUP_SURNAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'di', 'da', 'van', 'von', 'der', 'mc', 'mac', 'san', 'santa']);

function splitLineupPlayerName(name: string): { given: string; surname: string } {
    const trimmed = String(name || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return { given: '', surname: '' };
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex > 0) {
        return { surname: trimmed.slice(0, commaIndex).trim(), given: trimmed.slice(commaIndex + 1).trim() };
    }
    const tokens = trimmed.split(' ');
    if (tokens.length === 1) return { given: '', surname: tokens[0] };
    if (tokens.length === 2) return { given: tokens[0], surname: tokens[1] };
    let givenCount = LINEUP_GIVEN_NAME_LEADERS.has(tokens[0].toLowerCase()) ? 2 : 1;
    if (LINEUP_SURNAME_PARTICLES.has(tokens[1].toLowerCase())) givenCount = 1;
    return { given: tokens.slice(0, givenCount).join(' '), surname: tokens.slice(givenCount).join(' ') };
}

// "Juan Ignacio Greising Revol" -> "J. I. Greising Revol": lo que hace la prensa cuando
// la columna no da para el nombre entero.
function abbreviateLineupGivenNames(name: string) {
    const { given, surname } = splitLineupPlayerName(name);
    if (!given) return surname;
    const initials = given.split(' ').filter(Boolean).map((part) => `${part[0]}.`).join(' ');
    return `${initials} ${surname}`;
}

function formatLineupSurnameFirst(name: string) {
    const { given, surname } = splitLineupPlayerName(name);
    return given ? `${surname}, ${given}` : surname;
}

function sortLineupPlayersByNumber(players: LineupExportPlayerData[]) {
    return players
        .filter((player) => player && String(player.name || '').trim())
        .slice()
        .sort((left, right) => {
            const leftNumber = Number(left.number);
            const rightNumber = Number(right.number);
            if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
            if (Number.isFinite(leftNumber)) return -1;
            if (Number.isFinite(rightNumber)) return 1;
            return String(left.name || '').localeCompare(String(right.name || ''));
        });
}

function splitLineupTeamPlayers(team: LineupExportTeamData) {
    const players = sortLineupPlayersByNumber(Array.isArray(team.starters) ? team.starters : []);
    const starters = players.filter((player, index) => isLineupStarter(player, index));
    if (starters.length > 0) {
        return { starters, bench: players.filter((player, index) => !isLineupStarter(player, index)) };
    }
    return { starters: players.slice(0, 15), bench: players.slice(15) };
}

// ---------------------------------------------------------------------------
// Helpers de la formacion clasica.
// ---------------------------------------------------------------------------

function hexLuminance(hex: string) {
    const value = normalizeHexColor(hex);
    if (!value) return 0;
    const red = parseInt(value.slice(1, 3), 16) / 255;
    const green = parseInt(value.slice(3, 5), 16) / 255;
    const blue = parseInt(value.slice(5, 7), 16) / 255;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// Un color de equipo que se lea sobre negro: si es muy oscuro se le mezcla blanco.
function liftColorForDark(hex: string) {
    const luminance = hexLuminance(hex);
    if (luminance >= 0.28) return hex;
    return mixHexColors(hex, '#ffffff', Math.min(0.55, (0.28 - luminance) * 2.2 + 0.2));
}

// Color dominante de un escudo, para pintar la banda de cada equipo en la
// formacion doble. Promedio pesado por saturacion: el blanco del fondo y el
// negro de los trazos no cuentan.
function sampleCrestColor(image: HTMLImageElement | null, fallback: string): string {
    if (!image || typeof document === 'undefined') return fallback;
    try {
        const size = 28;
        const sample = document.createElement('canvas');
        sample.width = size;
        sample.height = size;
        const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
        if (!sampleCtx) return fallback;
        sampleCtx.drawImage(image, 0, 0, size, size);
        const pixels = sampleCtx.getImageData(0, 0, size, size).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let weightTotal = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            const alpha = pixels[index + 3] / 255;
            if (alpha <= 0.05) continue;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const max = Math.max(r, g, b) / 255;
            const min = Math.min(r, g, b) / 255;
            const saturation = max <= 0 ? 0 : (max - min) / max;
            const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            if (luminance > 0.92 || luminance < 0.06) continue;
            const weight = alpha * (0.08 + saturation * saturation * 2);
            red += r * weight;
            green += g * weight;
            blue += b * weight;
            weightTotal += weight;
        }
        if (weightTotal <= 0) return fallback;
        const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
        return `#${toHex(red / weightTotal)}${toHex(green / weightTotal)}${toHex(blue / weightTotal)}`;
    } catch {
        return fallback;
    }
}

// Parte una lista de nombres en renglones que entren en el ancho, con el
// separador que se le pida (" • " o ", ").
function wrapLineupNames(ctx: CanvasRenderingContext2D, items: string[], separator: string, maxWidth: number) {
    const lines: string[] = [];
    let line = '';
    for (const item of items) {
        const candidate = line ? `${line}${separator}${item}` : item;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = item;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// "vie, 28 ago" (lo que da Intl en es-AR) -> "VIE 28 AGO". Una fecha numerica
// se deja como vino.
function formatLineupDayLabel(value: string | undefined) {
    return String(value || '').replace(/[,.]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function formatLineupShirtNumber(player: LineupExportPlayerData, fallback: number) {
    const raw = player.number;
    if (raw === null || raw === undefined || String(raw).trim() === '') return String(fallback);
    return String(raw).trim();
}

function drawLineupBrandMark(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    edge: number,
    bottom: number,
    width: number,
    align: 'left' | 'right' = 'right',
) {
    if (!image) return 0;
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    const height = Math.round((width * sourceHeight) / sourceWidth);
    const x = align === 'right' ? edge - width : edge;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, bottom - height, width, height);
    ctx.restore();
    return height;
}

// Foto recortada a un rectangulo, cubriendo (como object-fit: cover) y con el
// foco arriba: en una foto de jugador la cara esta en el tercio superior.
function drawLineupCoverPhoto(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    focusY = 0.28,
) {
    const sourceWidth = image.naturalWidth || image.width || width;
    const sourceHeight = image.naturalHeight || image.height || height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const offsetX = x + (width - drawWidth) / 2;
    const offsetY = Math.min(y, Math.max(y + height - drawHeight, y + height / 2 - drawHeight * focusY));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();
}

function getLineupFooterDateLabel(data: LineupsData) {
    const date = String(data.date || '').trim();
    const time = String(data.time || '').trim();
    // "02.09 - 13:00 hs": dia y mes con punto, como en la referencia.
    const shortDate = (() => {
        const match = date.match(/^(\d{1,2})[\/.-](\d{1,2})/);
        if (!match) return date;
        return `${match[1].padStart(2, '0')}.${match[2].padStart(2, '0')}`;
    })();
    const timeLabel = /^\d{1,2}:\d{2}$/.test(time) ? `${time} hs` : time;
    return [shortDate, timeLabel].filter(Boolean).join(' - ');
}

async function drawG22BaseLineups(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    _brandLogo: HTMLImageElement | null,
    lineupExportMode: LineupExportMode,
    lineupExportLayout: LineupExportLayout = 'classic',
    colors: LineupColorOverrides = {},
) {
    void _format;
    void _brandLogo;
    if (lineupExportLayout === 'editorial') {
        await drawG22BaseLineupsEditorial(ctx, canvas, data, accentColor, bgColor, lineupExportMode, colors);
        return;
    }
    await drawG22BaseLineupsClassic(ctx, canvas, data, accentColor, bgColor, lineupExportMode, colors);
}

// Los cinco colores de la pieza, con el Auto resuelto: el que no vino se deriva
// de Fondo + Acento igual que antes de que existieran los controles.
function resolveLineupColors(colors: LineupColorOverrides, derived: Record<LineupColorControlId, string>): Record<LineupColorControlId, string> {
    return {
        field: normalizeHexColor(colors.field) || derived.field,
        glow: normalizeHexColor(colors.glow) || derived.glow,
        names: normalizeHexColor(colors.names) || derived.names,
        ink: normalizeHexColor(colors.ink) || derived.ink,
        lines: normalizeHexColor(colors.lines) || derived.lines,
    };
}

// ---------------------------------------------------------------------------
// Formacion clasica: la escalera de Uruguay XV.
// ---------------------------------------------------------------------------
async function drawG22BaseLineupsClassic(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    accentColor: string,
    bgColor: string,
    lineupExportMode: LineupExportMode,
    colorOverrides: LineupColorOverrides,
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const paletteAccent = normalizeHexColor(accentColor) || '#e5322d';
    const baseHex = normalizeHexColor(bgColor) || '#0a0a0b';
    // Las dos referencias son negras: un Fondo claro del modal se hunde igual,
    // porque la pieza es oscura por definicion.
    const isLightBg = getContrastColor(baseHex) !== '#ffffff';
    const teams = getSelectedLineupTeams(data, lineupExportMode).map((team) => ({ ...team, ...splitLineupTeamPlayers(team) }));
    const isSingleTeam = teams.length === 1;
    const [tournamentLogo, wordmark, sportMark, homeCrest, awayCrest] = await Promise.all([
        loadImage(getTournamentLogoImageSource(data)),
        loadImage('/header-logo.png'),
        loadImage(resolvePlateBrandSource('auto', data.sport)),
        loadImage(data.homeTeam.logo || ''),
        loadImage(data.awayTeam.logo || ''),
    ]);
    const crestBySide = { home: homeCrest, away: awayCrest } as const;
    const dayLabel = formatLineupDayLabel(data.date);
    const timeLabel = String(data.time || '').trim();
    const venueLabel = String(data.venue || '').trim();

    if (isSingleTeam) {
        // -------------------------------------------------------------------
        // Un equipo: la lista centrada en serif de Saracens. Negro con un XV
        // gigante de marca de agua, los dos escudos arriba, el renglon de
        // fecha, hora y sede, los quince en versalitas del acento con el dorsal
        // chico a la izquierda, y los suplentes en un parrafo separado por
        // puntos al pie.
        // -------------------------------------------------------------------
        const colors = resolveLineupColors(colorOverrides, {
            field: isLightBg ? '#14100e' : mixHexColors(baseHex, '#14100e', 0.7),
            glow: paletteAccent,
            names: paletteAccent,
            ink: '#ffffff',
            lines: paletteAccent,
        });
        const base = colors.field;
        const ink = colors.ink;
        const team = teams[0];

        const field = ctx.createLinearGradient(0, 0, 0, H);
        field.addColorStop(0, mixHexColors(base, '#000000', 0.1));
        field.addColorStop(0.5, base);
        field.addColorStop(1, mixHexColors(base, '#000000', 0.25));
        ctx.fillStyle = field;
        ctx.fillRect(0, 0, W, H);

        // Marca de agua: una X arriba a la izquierda y una V abajo a la derecha,
        // en el color de la Luz y casi transparentes.
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = colors.glow;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.font = `900 ${u(900)}px ${FONT_LINEUP_SERIF}`;
        ctx.fillText('X', -u(120), u(640) + Math.round(extra * 0.1));
        ctx.fillText('V', u(700), H - u(20));
        ctx.restore();

        // Grano fino, como la textura de la referencia.
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = ink;
        const grainStep = u(6);
        for (let y = 0; y < H; y += grainStep) {
            const rowNoise = g22pNoise(y * 17.23);
            for (let x = 0; x < W; x += grainStep) {
                if (g22pNoise(y * 1080 + x * 1.37 + rowNoise) > 0.7) ctx.fillRect(x, y, 1, 1);
            }
        }
        ctx.restore();

        // Los dos escudos, el local primero.
        const crestY = u(112) + Math.round(extra * 0.05);
        const crestSize = u(112);
        const crestGap = u(28);
        const crests = [homeCrest, awayCrest].filter(Boolean) as HTMLImageElement[];
        const crestsWidth = crests.length * crestSize + Math.max(0, crests.length - 1) * crestGap;
        let crestCursor = W / 2 - crestsWidth / 2 + crestSize / 2;
        [{ img: homeCrest, name: data.homeTeam.name, logo: data.homeTeam.logo }, { img: awayCrest, name: data.awayTeam.name, logo: data.awayTeam.logo }].forEach((entry) => {
            if (!entry.img) return;
            drawOverflowCrest(ctx, {
                x: crestCursor,
                y: crestY,
                width: crestSize,
                height: crestSize,
                img: entry.img,
                label: entry.name,
                rawLogo: entry.logo,
                isDark: true,
                showFrame: false,
            });
            crestCursor += crestSize + crestGap;
        });

        // "VIE 28 AGO  |  19:30 HS  |  LA SEDE"
        const metaParts = [dayLabel, timeLabel ? `${timeLabel} HS` : '', venueLabel.toUpperCase()].filter(Boolean);
        const metaY = u(222) + Math.round(extra * 0.08);
        if (metaParts.length > 0) {
            ctx.save();
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';
            ctx.fillStyle = ink;
            setCanvasTracking(ctx, u(1));
            const metaText = metaParts.join('   |   ');
            setFittedFont(ctx, metaText, W - u(160), '500', u(26), FONT_OUTFIT_BLACK, u(16));
            ctx.fillText(metaText, W / 2, metaY);
            setCanvasTracking(ctx, 0);
            ctx.restore();
        }

        // Pie: la marca del medio, la firma de G22 y el logo del torneo.
        const footerBottom = H - u(48);
        drawLineupBrandMark(ctx, sportMark, u(60), footerBottom, u(150), 'left');
        drawLineupBrandMark(ctx, wordmark, W / 2 + u(95), footerBottom - u(2), u(190));
        if (tournamentLogo) {
            drawOverflowCrest(ctx, {
                x: W - u(100),
                y: footerBottom - u(36),
                width: u(76),
                height: u(76),
                img: tournamentLogo,
                label: data.tournament,
                rawLogo: getTournamentLogoImageSource(data),
                isDark: true,
                showFrame: false,
            });
        }
        const footerTop = footerBottom - u(80);

        // El parrafo de suplentes se mide primero: la lista se queda con el
        // alto que sobra.
        const bench = team.bench;
        const benchFontSize = u(26);
        ctx.save();
        ctx.font = `400 ${benchFontSize}px ${FONT_OUTFIT_BLACK}`;
        const benchLines = bench.length > 0
            ? wrapLineupNames(ctx, bench.map((player) => player.name), '  •  ', W - u(120))
            : [];
        ctx.restore();
        const benchLinePitch = Math.round(benchFontSize * 1.05);
        const benchBlock = benchLines.length > 0 ? benchLines.length * benchLinePitch + u(46) : 0;

        const listTop = metaY + u(36);
        const listBottom = footerTop - benchBlock - u(10);
        const starters = team.starters;
        const rows = Math.max(starters.length, 1);
        // En story sobra alto: la lista se abre hasta un paso mas generoso.
        const pitch = Math.max(u(30), Math.min(u(53) + Math.round(extra * 0.05), Math.floor((listBottom - listTop) / rows)));
        const baseNameSize = Math.round(pitch * 0.96);
        const numberSize = Math.round(pitch * 0.48);
        const maxNameWidth = W - u(220);
        // Un solo cuerpo para los quince: el mas largo decide. Los NOMBRES van en
        // Articulat CF Heavy (pedido del usuario); el dorsal sigue en la serif.
        const nameSize = getSharedFittedFontSize(
            ctx,
            starters.map((player) => ({ text: `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase(), maxWidth: maxNameWidth })),
            '900',
            baseNameSize,
            FONT_ARTICULAT,
            Math.round(baseNameSize * 0.55),
        );

        ctx.save();
        ctx.textBaseline = 'alphabetic';
        starters.forEach((player, index) => {
            const baseline = listTop + baseNameSize + pitch * index;
            const label = truncateTextToWidth(ctx, `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase(), maxNameWidth);
            ctx.font = `900 ${nameSize}px ${FONT_ARTICULAT}`;
            const nameWidth = ctx.measureText(label).width;
            const nameFont = ctx.font;
            const numberText = formatLineupShirtNumber(player, index + 1);
            ctx.font = `400 ${numberSize}px ${FONT_LINEUP_SERIF}`;
            const numberWidth = ctx.measureText(numberText).width;
            const gap = u(14);
            const startX = W / 2 - (numberWidth + gap + nameWidth) / 2;
            ctx.textAlign = 'left';
            ctx.fillStyle = ink;
            ctx.fillText(numberText, startX, baseline - u(2));
            ctx.font = nameFont;
            ctx.fillStyle = colors.names;
            ctx.fillText(label, startX + numberWidth + gap, baseline);
        });
        ctx.restore();

        if (benchLines.length > 0) {
            const benchTop = listTop + baseNameSize + pitch * (starters.length - 1) + u(46);
            ctx.save();
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';
            ctx.fillStyle = hexToRGBA(ink, 0.92);
            ctx.font = `400 ${benchFontSize}px ${FONT_OUTFIT_BLACK}`;
            benchLines.forEach((line, index) => {
                ctx.fillText(line, W / 2, benchTop + benchFontSize + benchLinePitch * index);
            });
            ctx.restore();
        }
        return;
    }

    // -----------------------------------------------------------------------
    // Dos equipos: la lista de la NRL. Cabecera negra con el torneo a la
    // izquierda y la fecha a la derecha, una banda partida con el color de cada
    // escudo, y dos columnas numeradas con SUPLENTES subrayado en el color del
    // equipo. Los que sobran del banco van en un renglon chico al pie.
    // -----------------------------------------------------------------------
    const colors = resolveLineupColors(colorOverrides, {
        field: isLightBg ? '#070707' : mixHexColors(baseHex, '#000000', 0.7),
        glow: paletteAccent,
        names: paletteAccent,
        ink: '#ffffff',
        lines: '',
    });
    const base = colors.field;
    const ink = colors.ink;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const headerHeight = u(360) + Math.round(extra * 0.08);
    const headerGlow = ctx.createRadialGradient(W * 0.98, -u(40), 0, W * 0.98, -u(40), u(760));
    headerGlow.addColorStop(0, hexToRGBA(colors.glow, 0.5));
    headerGlow.addColorStop(0.45, hexToRGBA(colors.glow, 0.12));
    headerGlow.addColorStop(1, hexToRGBA(colors.glow, 0));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, headerHeight);
    ctx.clip();
    ctx.fillStyle = headerGlow;
    ctx.fillRect(0, 0, W, headerHeight);
    ctx.restore();

    // Izquierda: logo del torneo, filete vertical y el nombre del torneo en
    // hasta tres renglones.
    const headerMid = headerHeight / 2 + u(10);
    let titleLeft = u(70);
    if (tournamentLogo) {
        drawOverflowCrest(ctx, {
            x: u(70) + u(40),
            y: headerMid - u(6),
            width: u(84),
            height: u(84),
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: getTournamentLogoImageSource(data),
            isDark: true,
            showFrame: false,
        });
        titleLeft = u(70) + u(84) + u(24);
        ctx.save();
        ctx.strokeStyle = hexToRGBA(ink, 0.45);
        ctx.lineWidth = Math.max(1, u(2));
        ctx.beginPath();
        ctx.moveTo(u(70) + u(84) + u(6), headerMid - u(56));
        ctx.lineTo(u(70) + u(84) + u(6), headerMid + u(44));
        ctx.stroke();
        ctx.restore();
        titleLeft += u(18);
    }
    const titleText = stripTournamentCountryPrefix(data.tournament || data.title || 'Formaciones').toUpperCase();
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    const titleSize = u(50);
    ctx.font = `900 ${titleSize}px ${FONT_OUTFIT_BLACK}`;
    setCanvasTracking(ctx, -u(1));
    const titleMax = W - u(400) - titleLeft;
    let titleLines = wrapLineupNames(ctx, titleText.split(' '), ' ', titleMax).slice(0, 3);
    if (titleLines.length === 0) titleLines = [titleText];
    const titlePitch = Math.round(titleSize * 0.92);
    const titleTop = headerMid - (titleLines.length * titlePitch) / 2 + titleSize * 0.82 - u(6);
    titleLines.forEach((line, index) => {
        ctx.fillText(truncateTextToWidth(ctx, line, titleMax), titleLeft, titleTop + titlePitch * index);
    });
    setCanvasTracking(ctx, 0);
    ctx.restore();

    // Derecha: la firma de G22, la fecha en el acento, la hora y la sede.
    drawLineupBrandMark(ctx, wordmark, W - u(64), headerMid - u(68), u(150));
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    const rightMax = u(420);
    const subtitleLabel = String(data.subtitle || '').trim().toUpperCase();
    let rightCursor = headerMid - u(6);
    if (subtitleLabel || dayLabel) {
        ctx.fillStyle = colors.names;
        const line = subtitleLabel || dayLabel;
        setFittedFont(ctx, line, rightMax, '800', u(30), FONT_OUTFIT_BLACK, u(18));
        ctx.fillText(line, W - u(64), rightCursor);
        rightCursor += u(34);
    }
    const whenLabel = [subtitleLabel ? dayLabel : '', timeLabel ? `${timeLabel} HS` : ''].filter(Boolean).join(' · ');
    if (whenLabel) {
        ctx.fillStyle = ink;
        setFittedFont(ctx, whenLabel, rightMax, '800', u(28), FONT_OUTFIT_BLACK, u(18));
        ctx.fillText(whenLabel, W - u(64), rightCursor);
        rightCursor += u(32);
    }
    if (venueLabel) {
        ctx.fillStyle = hexToRGBA(ink, 0.9);
        setCanvasTracking(ctx, u(2));
        setFittedFont(ctx, venueLabel.toUpperCase(), rightMax, '400', u(22), FONT_OUTFIT_BLACK, u(14));
        ctx.fillText(venueLabel.toUpperCase(), W - u(64), rightCursor);
        setCanvasTracking(ctx, 0);
    }
    ctx.restore();

    // La banda: cada mitad del color dominante de su escudo, partida en flecha.
    const bandTop = headerHeight;
    const bandHeight = u(150);
    const bandBottom = bandTop + bandHeight;
    const fallbackAway = mixHexColors(paletteAccent, '#1f2937', 0.55);
    const homeColor = sampleCrestColor(homeCrest, paletteAccent);
    let awayColor = sampleCrestColor(awayCrest, fallbackAway);
    if (Math.abs(hexLuminance(homeColor) - hexLuminance(awayColor)) < 0.08) {
        awayColor = mixHexColors(awayColor, hexLuminance(awayColor) > 0.5 ? '#000000' : '#ffffff', 0.28);
    }
    const teamColors = { home: homeColor, away: awayColor } as const;
    ctx.save();
    ctx.fillStyle = teamColors[teams[1].side];
    ctx.fillRect(0, bandTop, W, bandHeight);
    ctx.fillStyle = teamColors[teams[0].side];
    ctx.beginPath();
    ctx.moveTo(0, bandTop);
    ctx.lineTo(W / 2, bandTop);
    ctx.lineTo(W / 2 + u(40), bandTop + bandHeight / 2);
    ctx.lineTo(W / 2, bandBottom);
    ctx.lineTo(0, bandBottom);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.rect(0, bandTop, W, bandHeight);
    ctx.clip();
    teams.forEach((team, index) => {
        const crest = crestBySide[team.side];
        if (!crest) return;
        drawOverflowCrest(ctx, {
            x: index === 0 ? W * 0.27 : W * 0.75,
            y: bandTop + bandHeight / 2 + u(10),
            width: u(210),
            height: u(210),
            img: crest,
            label: team.name,
            rawLogo: team.logo,
            isDark: true,
            showFrame: false,
        });
    });
    ctx.restore();

    // Las dos columnas.
    const listTop = bandBottom + u(56) + Math.round(extra * 0.04);
    const listBottom = H - u(70);
    const columnStarts = [u(100), u(620)];
    const columnRight = [u(520), W - u(60)];
    const maxRows = Math.max(...teams.map((team) => team.starters.length + Math.min(team.bench.length, 8)), 1);
    const anyBench = teams.some((team) => team.bench.length > 0);
    const anyExtras = teams.some((team) => team.bench.length > 8);
    const extrasBlock = anyExtras ? u(30) + u(24) * 2 : 0;
    const labelBlock = anyBench ? u(78) : 0;
    // En story sobra alto: las columnas se abren hasta un paso mas generoso.
    const pitch = Math.max(u(20), Math.min(u(30) + Math.round(extra * 0.035), Math.floor((listBottom - listTop - labelBlock - extrasBlock) / maxRows)));
    const baseNameSize = Math.round(pitch * 0.96);
    // Un solo cuerpo para las dos columnas: si cada nombre se achicara por su
    // cuenta, un apellido compuesto quedaria diminuto al lado de uno corto.
    // Si con el nombre entero el cuerpo cae por debajo del 78% del que le toca
    // a la fila, toda la lista pasa a iniciales de pila: mejor "J. I. Greising
    // Revol" legible que un nombre entero en cuerpo de nota al pie.
    const measureNames = (useInitials: boolean) => getSharedFittedFontSize(
        ctx,
        teams.flatMap((team, teamIndex) => [...team.starters, ...team.bench.slice(0, 8)].map((player) => ({
            text: `${useInitials ? abbreviateLineupGivenNames(player.name) : player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase(),
            maxWidth: columnRight[teamIndex] - (columnStarts[teamIndex] + u(25)),
        }))),
        '800',
        baseNameSize,
        FONT_OUTFIT_BLACK,
        Math.round(baseNameSize * 0.55),
    );
    let nameSize = measureNames(false);
    const useInitials = nameSize < baseNameSize * 0.78;
    if (useInitials) nameSize = measureNames(true);

    teams.forEach((team, teamIndex) => {
        const numberRight = columnStarts[teamIndex];
        const nameX = numberRight + u(25);
        const nameMax = columnRight[teamIndex] - nameX;
        const teamColor = normalizeHexColor(colorOverrides.names) || liftColorForDark(teamColors[team.side]);
        const lineColor = colors.lines || teamColor;
        const bench = team.bench.slice(0, 8);
        const extras = team.bench.slice(8);
        let cursor = listTop;
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        const drawRow = (player: LineupExportPlayerData, fallbackNumber: number, baseline: number) => {
            ctx.fillStyle = teamColor;
            ctx.textAlign = 'right';
            ctx.font = `800 ${nameSize}px ${FONT_OUTFIT_BLACK}`;
            ctx.fillText(formatLineupShirtNumber(player, fallbackNumber), numberRight, baseline);
            ctx.fillStyle = ink;
            ctx.textAlign = 'left';
            const label = `${useInitials ? abbreviateLineupGivenNames(player.name) : player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();
            ctx.font = `800 ${nameSize}px ${FONT_OUTFIT_BLACK}`;
            ctx.fillText(truncateTextToWidth(ctx, label, nameMax), nameX, baseline);
        };
        team.starters.forEach((player, index) => {
            drawRow(player, index + 1, cursor + nameSize + pitch * index);
        });
        cursor += pitch * team.starters.length;

        if (bench.length > 0) {
            cursor += u(46);
            ctx.fillStyle = teamColor;
            ctx.textAlign = 'left';
            ctx.font = `700 ${u(20)}px ${FONT_OUTFIT_BLACK}`;
            setCanvasTracking(ctx, u(3));
            ctx.fillText('SUPLENTES', nameX, cursor);
            setCanvasTracking(ctx, 0);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = Math.max(1, u(2));
            ctx.beginPath();
            ctx.moveTo(nameX, cursor + u(12) + 0.5);
            ctx.lineTo(Math.min(nameX + u(356), columnRight[teamIndex]), cursor + u(12) + 0.5);
            ctx.stroke();
            cursor += u(16);
            bench.forEach((player, index) => {
                drawRow(player, team.starters.length + index + 1, cursor + nameSize + pitch * index);
            });
            cursor += pitch * bench.length;
        }

        if (extras.length > 0) {
            cursor += u(30);
            ctx.fillStyle = hexToRGBA(ink, 0.88);
            ctx.textAlign = 'left';
            ctx.font = `500 ${u(20)}px ${FONT_OUTFIT_BLACK}`;
            setCanvasTracking(ctx, u(1));
            const lines = wrapLineupNames(ctx, extras.map((player) => player.name.toUpperCase()), ', ', nameMax);
            lines.slice(0, 3).forEach((line, index) => {
                ctx.fillText(truncateTextToWidth(ctx, line, nameMax), nameX, cursor + u(20) + u(24) * index);
            });
            setCanvasTracking(ctx, 0);
        }
        ctx.restore();
    });
}

// ---------------------------------------------------------------------------
// Formacion editorial: la foto de Los Pumas.
// ---------------------------------------------------------------------------
async function drawG22BaseLineupsEditorial(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    accentColor: string,
    bgColor: string,
    lineupExportMode: LineupExportMode,
    colorOverrides: LineupColorOverrides,
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const paletteAccent = normalizeHexColor(accentColor) || '#7dd3fc';
    const baseHex = normalizeHexColor(bgColor) || '#0f172a';
    const isLightBg = getContrastColor(baseHex) !== '#ffffff';
    // El campo es un azul profundo tenido por el acento; un Fondo claro se hunde.
    const colors = resolveLineupColors(colorOverrides, {
        field: isLightBg ? mixHexColors(paletteAccent, '#0b1220', 0.72) : mixHexColors(baseHex, paletteAccent, 0.16),
        glow: paletteAccent,
        names: paletteAccent,
        ink: '#ffffff',
        lines: paletteAccent,
    });
    const base = colors.field;
    const ink = colors.ink;
    const accent = colors.names;
    const glow = colors.glow;
    const lines = colors.lines;

    const teams = getSelectedLineupTeams(data, lineupExportMode).map((team) => ({ ...team, ...splitLineupTeamPlayers(team) }));
    const isSingleTeam = teams.length === 1;
    const [photo, homeCrest, awayCrest, sportMark] = await Promise.all([
        loadImage(data.backgroundImage || ''),
        loadImage(data.homeTeam.logo || ''),
        loadImage(data.awayTeam.logo || ''),
        loadImage(resolvePlateBrandSource('auto', data.sport)),
    ]);
    const crestBySide = { home: homeCrest, away: awayCrest } as const;

    const field = ctx.createLinearGradient(0, 0, 0, H);
    field.addColorStop(0, mixHexColors(base, glow, 0.06));
    field.addColorStop(1, mixHexColors(base, '#000000', 0.22));
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, W, H);

    // La foto ocupa la mitad izquierda y se funde con el campo por la derecha y
    // por abajo. Sin foto, el escudo del equipo ocupa ese lugar.
    const photoWidth = isSingleTeam ? u(560) : u(430);
    const heroCrest = crestBySide[teams[0].side];
    if (photo) {
        drawLineupCoverPhoto(ctx, photo, 0, 0, photoWidth, H);
        const fadeRight = ctx.createLinearGradient(photoWidth - u(190), 0, photoWidth, 0);
        fadeRight.addColorStop(0, hexToRGBA(base, 0));
        fadeRight.addColorStop(1, hexToRGBA(base, 1));
        ctx.fillStyle = fadeRight;
        ctx.fillRect(0, 0, photoWidth, H);
        const fadeBottom = ctx.createLinearGradient(0, H * 0.78, 0, H);
        fadeBottom.addColorStop(0, hexToRGBA(base, 0));
        fadeBottom.addColorStop(1, hexToRGBA(base, 0.92));
        ctx.fillStyle = fadeBottom;
        ctx.fillRect(0, 0, photoWidth, H);
        if (heroCrest) {
            drawOverflowCrest(ctx, {
                x: u(120),
                y: u(120),
                width: u(150),
                height: u(150),
                img: heroCrest,
                label: teams[0].name,
                rawLogo: teams[0].logo,
                isDark: true,
                showFrame: false,
            });
        }
    } else {
        const heroGlow = ctx.createRadialGradient(photoWidth / 2, H * 0.42, 0, photoWidth / 2, H * 0.42, photoWidth * 0.8);
        heroGlow.addColorStop(0, hexToRGBA(glow, 0.3));
        heroGlow.addColorStop(1, hexToRGBA(glow, 0));
        ctx.fillStyle = heroGlow;
        ctx.fillRect(0, 0, photoWidth, H);
        if (heroCrest) {
            drawOverflowCrest(ctx, {
                x: photoWidth / 2,
                y: H * 0.42,
                width: photoWidth - u(120),
                height: photoWidth - u(120),
                img: heroCrest,
                label: teams[0].name,
                rawLogo: teams[0].logo,
                isDark: true,
                showFrame: false,
            });
        }
    }

    const columnLeft = photoWidth - u(40);
    const contentRight = W - u(60);
    const contentWidth = contentRight - columnLeft;

    // Titular condensado en el acento, al ancho de la columna.
    const titleBaseline = u(240) + Math.round(extra * 0.08);
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    setFilledFont(ctx, 'XV INICIAL', contentWidth, '800', BASE_FONT_DHARMA, u(110), u(215));
    ctx.fillText('XV INICIAL', columnLeft, titleBaseline);
    ctx.restore();

    // Tarjeta del acento al pie: escudos, sede y hora de salida.
    const cardHeight = u(96);
    const cardBottom = H - u(125);
    const cardTop = cardBottom - cardHeight;
    const cardWidth = contentWidth;
    ctx.save();
    ctx.fillStyle = lines;
    ctx.beginPath();
    ctx.roundRect(columnLeft, cardTop, cardWidth, cardHeight, u(12));
    ctx.fill();
    const cardInk = getContrastColor(lines) === '#ffffff' ? '#ffffff' : mixHexColors(base, '#000000', 0.2);
    let cardCursor = columnLeft + u(18);
    for (const crest of [homeCrest, awayCrest]) {
        if (!crest) continue;
        drawOverflowCrest(ctx, {
            x: cardCursor + u(30),
            y: cardTop + cardHeight / 2,
            width: u(64),
            height: u(64),
            img: crest,
            label: '',
            isDark: false,
            showFrame: false,
        });
        cardCursor += u(66);
    }
    const cardTextX = cardCursor + u(16);
    const cardTextMax = columnLeft + cardWidth - u(16) - cardTextX;
    ctx.fillStyle = cardInk;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const venue = String(data.venue || data.tournament || '').trim();
    const time = String(data.time || '').trim();
    const kickoff = time ? `Kick Off ${/^\d{1,2}:\d{2}$/.test(time) ? `${time} hs` : time}` : getLineupFooterDateLabel(data);
    if (venue && kickoff) {
        setFittedFont(ctx, venue, cardTextMax, '800', u(24), FONT_OUTFIT_BLACK, u(16));
        ctx.fillText(truncateTextToWidth(ctx, venue, cardTextMax), cardTextX, cardTop + u(42));
        setFittedFont(ctx, kickoff, cardTextMax, '800', u(24), FONT_OUTFIT_BLACK, u(16));
        ctx.fillText(truncateTextToWidth(ctx, kickoff, cardTextMax), cardTextX, cardTop + u(72));
    } else {
        const single = venue || kickoff;
        setFittedFont(ctx, single, cardTextMax, '800', u(24), FONT_OUTFIT_BLACK, u(16));
        ctx.fillText(truncateTextToWidth(ctx, single, cardTextMax), cardTextX, cardTop + cardHeight / 2 + u(9));
    }
    ctx.restore();

    // Marca del medio abajo a la derecha, como el sello de la referencia.
    drawLineupBrandMark(ctx, sportMark, contentRight, H - u(48), u(190));

    const listTop = titleBaseline + u(20);
    const listBottom = cardTop - u(40);

    const drawColumn = (
        team: (typeof teams)[number],
        x: number,
        width: number,
        top: number,
        bottom: number,
        showHeader: boolean,
    ) => {
        let cursor = top;
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        if (showHeader) {
            ctx.fillStyle = accent;
            ctx.textAlign = 'left';
            setFittedFont(ctx, team.name.toUpperCase(), width, '800', u(34), BASE_FONT_DHARMA, u(20));
            ctx.fillText(team.name.toUpperCase(), x, cursor + u(30));
            cursor += u(48);
        }
        const starters = team.starters;
        const bench = team.bench;
        const benchLines = bench.length > 0 ? Math.ceil(bench.length / 2) : 0;
        const benchBlock = bench.length > 0 ? u(62) + u(32) * benchLines + u(10) : 0;
        const available = bottom - cursor - benchBlock;
        // En story sobra alto: la lista se abre hasta un paso mas generoso.
        const pitch = Math.max(u(24), Math.min(u(41) + Math.round(extra * 0.03), Math.floor(available / Math.max(starters.length, 1))));
        const baseNameSize = Math.round(pitch * 0.8);
        const numberRight = x + u(30);
        const nameX = numberRight + u(16);
        // Un solo cuerpo para toda la lista: el mas largo decide.
        const measureNames = (useInitials: boolean) => getSharedFittedFontSize(
            ctx,
            starters.map((player) => ({ text: `${useInitials ? abbreviateLineupGivenNames(player.name) : player.name}${player.isCaptain ? ' (C)' : ''}`, maxWidth: x + width - nameX })),
            '900',
            baseNameSize,
            FONT_ARTICULAT,
            Math.round(baseNameSize * 0.55),
        );
        let nameSize = measureNames(false);
        const useInitials = nameSize < baseNameSize * 0.78;
        if (useInitials) nameSize = measureNames(true);
        starters.forEach((player, index) => {
            const baseline = cursor + baseNameSize + pitch * index;
            ctx.fillStyle = accent;
            ctx.textAlign = 'right';
            ctx.font = `900 ${nameSize}px ${FONT_ARTICULAT}`;
            ctx.fillText(formatLineupShirtNumber(player, index + 1), numberRight, baseline);
            ctx.fillStyle = ink;
            ctx.textAlign = 'left';
            const label = `${useInitials ? abbreviateLineupGivenNames(player.name) : player.name}${player.isCaptain ? ' (C)' : ''}`;
            ctx.font = `900 ${nameSize}px ${FONT_ARTICULAT}`;
            ctx.fillText(truncateTextToWidth(ctx, label, x + width - nameX), nameX, baseline);
        });
        cursor += pitch * starters.length;

        if (bench.length > 0) {
            cursor += u(50);
            ctx.fillStyle = accent;
            ctx.textAlign = 'left';
            ctx.font = `800 ${u(40)}px ${BASE_FONT_DHARMA}`;
            ctx.fillText('FINISHERS', x, cursor);
            cursor += u(44);
            // Parrafo corrido: "16. Nombre, 17. Nombre," con dos por linea, y
            // punto final en el ultimo.
            const paragraphSize = Math.min(u(26), Math.max(u(16), Math.round(nameSize * 0.72)));
            ctx.font = `900 ${paragraphSize}px ${FONT_ARTICULAT}`;
            ctx.fillStyle = ink;
            const items = bench.map((player, index) => `${formatLineupShirtNumber(player, 16 + index)}. ${player.name}`);
            const lines: string[] = [];
            let line = '';
            items.forEach((item, index) => {
                const isLast = index === items.length - 1;
                const piece = `${item}${isLast ? '.' : ','}`;
                const candidate = line ? `${line} ${piece}` : piece;
                if (line && ctx.measureText(candidate).width > width) {
                    lines.push(line);
                    line = piece;
                } else {
                    line = candidate;
                }
            });
            if (line) lines.push(line);
            const linePitch = Math.round(paragraphSize * 1.32);
            lines.forEach((text, index) => {
                ctx.fillText(truncateTextToWidth(ctx, text, width), x, cursor + paragraphSize + linePitch * index);
            });
        }
        ctx.restore();
    };

    if (isSingleTeam) {
        drawColumn(teams[0], columnLeft, contentWidth, listTop, listBottom, false);
        return;
    }
    const gap = u(24);
    const columnWidth = Math.floor((contentWidth - gap) / 2);
    teams.forEach((team, index) => {
        drawColumn(team, columnLeft + (columnWidth + gap) * index, columnWidth, listTop, listBottom, true);
    });
}

// ---------------------------------------------------------------------------
// Convocatoria: la lista a dos columnas de Argentina XV.
// ---------------------------------------------------------------------------
type SquadCallupEntry =
    | { kind: 'caption'; label: string }
    | { kind: 'player'; index: number; label: string };

function buildSquadCallupEntries(page: SquadPageData): SquadCallupEntry[] {
    const entries: SquadCallupEntry[] = [];
    const showCaptions = page.groups.length > 1;
    let counter = 0;
    for (const group of page.groups) {
        const players = (Array.isArray(group.players) ? group.players : [])
            .filter((player) => player && String(player.name || '').trim())
            .map((player) => ({ player, label: formatLineupSurnameFirst(player.name) }))
            .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
        if (players.length === 0) continue;
        if (showCaptions) entries.push({ kind: 'caption', label: formatSquadGroupLabel(group) });
        for (const { label } of players) {
            counter += 1;
            entries.push({ kind: 'player', index: counter, label });
        }
    }
    return entries;
}

async function drawG22BaseSquad(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: SquadData,
    page: SquadPageData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    _brandLogo: HTMLImageElement | null,
    colorOverrides: LineupColorOverrides = {},
) {
    void _format;
    void _brandLogo;
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const paletteAccent = normalizeHexColor(accentColor) || '#38bdf8';
    const baseHex = normalizeHexColor(bgColor) || '#0f172a';
    const isLightBg = getContrastColor(baseHex) !== '#ffffff';
    const colors = resolveLineupColors(colorOverrides, {
        field: isLightBg ? mixHexColors(paletteAccent, '#0b1220', 0.72) : mixHexColors(baseHex, paletteAccent, 0.16),
        glow: paletteAccent,
        names: paletteAccent,
        ink: '#ffffff',
        lines: paletteAccent,
    });
    const base = colors.field;
    const ink = colors.ink;
    const accent = colors.names;
    const glow = colors.glow;

    const [teamLogo, sportMark, wordmark] = await Promise.all([
        loadImage(data.teamLogo || data.tournamentLogo || ''),
        loadImage(resolvePlateBrandSource('auto', data.sport)),
        loadImage('/header-logo.png'),
    ]);

    const field = ctx.createLinearGradient(0, 0, 0, H);
    field.addColorStop(0, mixHexColors(base, glow, 0.08));
    field.addColorStop(1, mixHexColors(base, '#000000', 0.26));
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, W, H);

    // Escudo (o wordmark) arriba a la derecha, contenido en una caja apaisada.
    if (teamLogo) {
        drawOverflowCrest(ctx, {
            x: W - u(60) - u(140),
            y: u(130),
            width: u(280),
            height: u(140),
            img: teamLogo,
            label: data.teamName,
            rawLogo: data.teamLogo || data.tournamentLogo,
            isDark: true,
            showFrame: false,
        });
    }

    const left = u(58);
    const titleBaseline = u(232) + Math.round(extra * 0.06);
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    setFilledFont(ctx, 'CONVOCATORIA', u(690), '800', BASE_FONT_DHARMA, u(120), u(236));
    ctx.fillText('CONVOCATORIA', left, titleBaseline);
    const subtitleSource = data.tournament && data.tournament.trim() !== data.teamName.trim()
        ? data.tournament
        : (data.subtitle || data.title || 'Plantel');
    const subtitle = String(subtitleSource).trim().toUpperCase();
    setFittedFont(ctx, subtitle, u(700), '800', u(96), BASE_FONT_DHARMA, u(48));
    ctx.fillText(subtitle, left, titleBaseline + u(104));
    ctx.restore();

    // Lista a dos columnas: la izquierda se llena hasta su capacidad y el resto
    // pasa a la derecha, como en la referencia (18 y 10).
    const entries = buildSquadCallupEntries(page);
    const listTop = titleBaseline + u(168) + Math.round(extra * 0.06);
    const listBottom = H - u(150);
    const basePitch = u(43.5);
    let pitch = basePitch;
    let capacity = Math.max(1, Math.floor((listBottom - listTop) / pitch));
    if (entries.length > capacity * 2) {
        capacity = Math.ceil(entries.length / 2);
        pitch = Math.floor((listBottom - listTop) / capacity);
    } else if (extra > 0) {
        // En story sobra alto: la lista se estira hasta un 40% mas de paso.
        const rowsPerColumn = Math.min(capacity, Math.max(Math.ceil(entries.length / 2), 14));
        pitch = Math.min(Math.round(basePitch * 1.4), Math.floor((listBottom - listTop) / rowsPerColumn));
        capacity = Math.max(1, Math.floor((listBottom - listTop) / pitch));
    }
    const baseNameSize = Math.round(pitch * 0.76);
    const columns = [entries.slice(0, capacity), entries.slice(capacity)];
    const columnXs = [left + u(26), u(650)];
    const columnRight = [u(620), W - u(60)];
    // Un solo cuerpo para las dos columnas: el nombre mas largo decide.
    const nameSize = getSharedFittedFontSize(
        ctx,
        columns.flatMap((column, columnIndex) => column
            .filter((entry): entry is Extract<SquadCallupEntry, { kind: 'player' }> => entry.kind === 'player')
            .map((entry) => ({ text: entry.label, maxWidth: columnRight[columnIndex] - (columnXs[columnIndex] + u(22)) }))),
        '900',
        baseNameSize,
        FONT_ARTICULAT,
        Math.round(baseNameSize * 0.55),
    );

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    columns.forEach((column, columnIndex) => {
        const numberRight = columnXs[columnIndex];
        const nameX = numberRight + u(22);
        const maxWidth = columnRight[columnIndex] - nameX;
        column.forEach((entry, rowIndex) => {
            const baseline = listTop + baseNameSize + pitch * rowIndex;
            if (entry.kind === 'caption') {
                ctx.fillStyle = accent;
                ctx.textAlign = 'left';
                ctx.font = `800 ${Math.round(nameSize * 0.58)}px ${FONT_OUTFIT_BLACK}`;
                setCanvasTracking(ctx, u(2));
                ctx.fillText(truncateTextToWidth(ctx, entry.label, maxWidth + u(22)), numberRight - u(20), baseline - u(2));
                setCanvasTracking(ctx, 0);
                return;
            }
            ctx.fillStyle = accent;
            ctx.textAlign = 'right';
            ctx.font = `900 ${nameSize}px ${FONT_ARTICULAT}`;
            ctx.fillText(String(entry.index), numberRight, baseline);
            ctx.fillStyle = ink;
            ctx.textAlign = 'left';
            ctx.font = `900 ${nameSize}px ${FONT_ARTICULAT}`;
            ctx.fillText(truncateTextToWidth(ctx, entry.label, maxWidth), nameX, baseline);
        });
    });
    ctx.restore();

    // Pie: la marca del medio a la izquierda, la firma de G22 a la derecha y,
    // si la lista sigue en otra imagen, el numero de pagina al medio.
    drawLineupBrandMark(ctx, sportMark, left, H - u(48), u(190), 'left');
    drawLineupBrandMark(ctx, wordmark, W - u(60), H - u(52), u(150));
    if (page.totalPages > 1) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = hexToRGBA(ink, 0.7);
        ctx.font = `700 ${u(18)}px ${FONT_OUTFIT_BLACK}`;
        ctx.fillText(`${page.pageNumber} / ${page.totalPages}`, W / 2, H - u(56));
        ctx.restore();
    }
}


async function drawG22BaseTeamOfWeek(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: TeamOfWeekData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
) {
    void format;

    const isStory = canvas.height > 1500;
    const scaleX = canvas.width / 1080;
    const scaleY = canvas.height / (isStory ? 1920 : 1350);
    const scaleFont = Math.min(scaleX, scaleY);
    const sx = (value: number) => Math.round(value * scaleX);
    const sy = (value: number) => Math.round(value * scaleY);
    const sf = (value: number) => Math.max(1, Math.round(value * scaleFont));
    const normalizePlayers = (players: TeamOfWeekPlayerData[] | undefined) => (
        Array.isArray(players)
            ? players.filter((player) => player && String(player.name || '').trim())
            : []
    );
    const allPlayers = normalizePlayers(data.players);
    const starters = allPlayers.slice(0, 15);
    const replacements = normalizePlayers(data.replacements).length > 0
        ? normalizePlayers(data.replacements).slice(0, 8)
        : allPlayers.slice(15, 23);
    const [textureImage, tournamentLogo, ...starterLogos] = await Promise.all([
        loadImage(EDITORIAL_TEXTURE_SOURCE),
        loadImage(getTournamentLogoImageSource(data)),
        ...starters.map((player) => loadImage(player.teamLogo || '')),
    ]);
    const requestedAccent = normalizeHexColor(accentColor);
    const accent = /^#[0-9a-f]{6}$/i.test(requestedAccent) ? requestedAccent : BRAND_ACCENT;
    const requestedBg = normalizeHexColor(bgColor);
    const canvasBg = /^#[0-9a-f]{6}$/i.test(requestedBg) ? requestedBg : '#f2f1ed';
    const isDark = getContrastColor(canvasBg) === '#ffffff';
    const ink = getTextColor(isDark);
    const mutedInk = getMutedColor(isDark, 0.72);
    const subtleInk = getMutedColor(isDark, 0.42);
    const teamPanelColor = isDark
        ? mixHexColors(canvasBg, accent, 0.58)
        : mixHexColors(accent, canvasBg, 0.16);
    const teamPanelHot = mixHexColors(teamPanelColor, isDark ? '#ffffff' : '#f8fafc', isDark ? 0.16 : 0.22);
    const teamPanelDeep = mixHexColors(teamPanelColor, isDark ? '#000000' : '#0f172a', isDark ? 0.5 : 0.24);
    const ratingBox = isDark ? 'rgba(0,0,0,0.76)' : 'rgba(15,23,42,0.86)';
    const ratingInk = '#fff7dc';

    const paperGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    paperGradient.addColorStop(0, isDark ? mixHexColors(canvasBg, '#ffffff', 0.05) : mixHexColors(canvasBg, '#ffffff', 0.72));
    paperGradient.addColorStop(0.5, isDark ? canvasBg : mixHexColors(canvasBg, '#ffffff', 0.38));
    paperGradient.addColorStop(1, isDark ? mixHexColors(canvasBg, '#000000', 0.28) : mixHexColors(canvasBg, '#000000', 0.08));
    ctx.fillStyle = paperGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const accentGlow = ctx.createRadialGradient(canvas.width * 0.78, canvas.height * 0.1, 0, canvas.width * 0.78, canvas.height * 0.1, canvas.width * 0.65);
    accentGlow.addColorStop(0, hexToRGBA(accent, isDark ? 0.24 : 0.18));
    accentGlow.addColorStop(0.45, hexToRGBA(accent, isDark ? 0.08 : 0.06));
    accentGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = accentGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (textureImage) {
        ctx.save();
        ctx.globalAlpha = isDark ? 0.16 : 0.24;
        ctx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
        ctx.drawImage(textureImage, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    ctx.save();
    const grain = (seed: number) => {
        const value = Math.sin(seed * 12.9898) * 43758.5453;
        return value - Math.floor(value);
    };
    for (let index = 0; index < 520; index += 1) {
        const dotX = grain(index + 3.1) * canvas.width;
        const dotY = grain(index + 9.7) * canvas.height;
        const dotSize = sx(1 + grain(index + 15.3) * 2.4);
        const dotAlpha = 0.025 + grain(index + 21.4) * 0.05;
        ctx.fillStyle = isDark
            ? `rgba(255,255,255,${dotAlpha * 0.75})`
            : `rgba(10,10,10,${dotAlpha})`;
        ctx.fillRect(dotX, dotY, dotSize, dotSize);
    }
    ctx.restore();

    if (brandLogo) {
        ctx.save();
        ctx.globalAlpha = isDark ? 0.07 : 0.04;
        ctx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
        const watermarkSize = sx(isStory ? 460 : 340);
        const placement = getContainedImagePlacement(
            brandLogo,
            canvas.width / 2,
            canvas.height * (isStory ? 0.54 : 0.52),
            watermarkSize,
            watermarkSize,
            0
        );
        ctx.drawImage(brandLogo, placement.x, placement.y, placement.width, placement.height);
        ctx.restore();
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height * (isStory ? 0.52 : 0.51));
    ctx.rotate(-0.09);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = isDark ? 0.11 : 0.052;
    ctx.fillStyle = ink;
    ctx.font = `950 ${sf(isStory ? 168 : 124)}px ${FONT_DISPLAY}`;
    ctx.fillText('G22 SCORES', 0, 0);
    ctx.restore();

    const headerLeft = sx(58);
    const headerTop = offsetElementY('title', sy(isStory ? 66 : 46));
    const titleMaxWidth = canvas.width - sx(230);
    const rawTitleText = (data.title || 'Equipo de la semana').trim();
    const titleText = rawTitleText.toLowerCase() === 'starting xv' ? 'Equipo de la semana' : rawTitleText;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    const titleSize = setFittedFont(ctx, titleText, titleMaxWidth, '900', scaleElementSize('title', sf(isStory ? 94 : 78), 86), FONT_DISPLAY, sf(48));
    ctx.fillText(truncateTextToWidth(ctx, titleText, titleMaxWidth), headerLeft, headerTop + titleSize);
    ctx.restore();

    const headerLogoSize = scaleElementSize('tournamentLogo', sx(isStory ? 86 : 74), 74);
    const headerLogoY = offsetElementY('tournamentLogo', headerTop + sy(isStory ? 54 : 42));
    drawOverflowCrest(ctx, {
        x: canvas.width - sx(72),
        y: headerLogoY,
        width: headerLogoSize,
        height: headerLogoSize,
        img: tournamentLogo,
        label: data.tournament,
        rawLogo: data.tournamentLogo || data.tournament,
        isDark,
        showFrame: !tournamentLogo,
    });

    const metaParts = [
        data.subtitle?.trim() || data.tournament?.trim(),
        data.meta?.trim() || data.date?.trim(),
        'Powered by G22 Scores',
    ].filter(Boolean).map((part) => String(part).toUpperCase());
    if (metaParts.length > 0) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = mutedInk;
        ctx.font = `800 ${sf(isStory ? 20 : 16)}px ${FONT_BODY}`;
        const separator = '    //    ';
        ctx.fillText(
            truncateTextToWidth(ctx, metaParts.join(separator), canvas.width - headerLeft * 2),
            headerLeft,
            headerTop + titleSize + sy(isStory ? 62 : 52),
        );
        ctx.restore();
    }

    const gridTop = offsetElementY('rowHeight', sy(isStory ? 310 : 218));
    const gridBottom = canvas.height - sy(isStory ? 265 : 122);
    const sideMargin = sx(52);
    const columnGap = sx(20);
    const cardWidth = (canvas.width - sideMargin * 2 - columnGap * 4) / 5;
    const labelHeight = sy(isStory ? 64 : 58);
    const rowGap = sy(isStory ? 62 : 34);
    const defaultVisualHeight = Math.max(sy(isStory ? 326 : 252), (gridBottom - gridTop - rowGap * 2 - labelHeight * 3) / 3);
    const visualHeight = scaleElementSize('rowHeight', defaultVisualHeight, 274);
    const rowStep = visualHeight + labelHeight + rowGap;
    const wrapLabel = (label: string, maxWidth: number, maxLines: number) => {
        const words = label.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let currentLine = '';

        words.forEach((word) => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (!currentLine || ctx.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
                return;
            }

            lines.push(currentLine);
            currentLine = word;
        });

        if (currentLine) lines.push(currentLine);
        if (lines.length <= maxLines) return lines;

        const trimmed = lines.slice(0, maxLines);
        trimmed[maxLines - 1] = truncateTextToWidth(ctx, `${trimmed[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxWidth);
        return trimmed;
    };

    const drawPlayerTile = (player: TeamOfWeekPlayerData, playerIndex: number) => {
        const row = Math.floor(playerIndex / 5);
        const column = playerIndex % 5;
        const x = sideMargin + column * (cardWidth + columnGap);
        const y = gridTop + row * rowStep;
        const centerX = x + cardWidth / 2;
        const logoImage = starterLogos[playerIndex] || null;
        const playerNumber = String(player.number ?? playerIndex + 1).trim();
        const playerName = `${player.name}${player.isCaptain ? ' (C)' : ''}`.trim().toUpperCase();
        const teamName = String(player.team || player.position || '').trim().toUpperCase();
        const ratingLabel = formatLineupExportRating(player.rating);
        const panelGradient = ctx.createLinearGradient(x, y, x + cardWidth, y + visualHeight);
        panelGradient.addColorStop(0, teamPanelHot);
        panelGradient.addColorStop(0.52, teamPanelColor);
        panelGradient.addColorStop(1, teamPanelDeep);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cardWidth, visualHeight);
        ctx.clip();

        ctx.fillStyle = panelGradient;
        ctx.fillRect(x, y, cardWidth, visualHeight);

        if (textureImage) {
            ctx.save();
            ctx.globalAlpha = 0.18;
            ctx.globalCompositeOperation = 'multiply';
            ctx.beginPath();
            ctx.rect(x, y, cardWidth, visualHeight);
            ctx.clip();
            ctx.drawImage(textureImage, x, y, cardWidth, visualHeight);
            ctx.restore();
        }

        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + cardWidth * 0.1, y, cardWidth * 0.18, visualHeight);
        ctx.fillStyle = isDark ? 'rgba(0,0,0,0.18)' : 'rgba(15,23,42,0.1)';
        ctx.beginPath();
        ctx.moveTo(x, y + visualHeight * 0.72);
        ctx.lineTo(x + cardWidth, y + visualHeight * 0.58);
        ctx.lineTo(x + cardWidth, y + visualHeight);
        ctx.lineTo(x, y + visualHeight);
        ctx.closePath();
        ctx.fill();

        const crestWidth = scaleElementSize('teamLogo', cardWidth * 1.12, 154);
        const crestHeight = scaleElementSize('teamLogo', visualHeight * 0.82, 154);
        drawOverflowCrest(ctx, {
            x: centerX,
            y: y + visualHeight * 0.48,
            width: crestWidth,
            height: crestHeight,
            img: logoImage,
            label: teamName || player.name,
            rawLogo: player.teamLogo,
            isDark: getContrastColor(teamPanelColor) === '#ffffff',
            showFrame: false,
        });

        if (ratingLabel) {
            const ratingFont = scaleElementSize('score', sf(isStory ? 20 : 17), 16);
            ctx.font = `900 ${ratingFont}px ${FONT_MONO}`;
            const ratingWidth = Math.max(sx(48), ctx.measureText(ratingLabel).width + sx(22));
            const ratingHeight = sy(isStory ? 36 : 32);
            const ratingX = x + cardWidth - ratingWidth - sx(10);
            const ratingY = y + sy(10);
            ctx.fillStyle = ratingBox;
            ctx.beginPath();
            ctx.roundRect(ratingX, ratingY, ratingWidth, ratingHeight, sx(9));
            ctx.fill();
            ctx.fillStyle = ratingInk;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ratingLabel, ratingX + ratingWidth / 2, ratingY + ratingHeight / 2 + 1);
        }

        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ink;
        const label = `${playerNumber}. ${playerName}`;
        const labelFontSize = scaleElementSize('teamName', sf(isStory ? 22 : 18), 18);
        const labelLineHeight = sy(isStory ? 25 : 21);
        ctx.font = `950 ${labelFontSize}px ${FONT_BODY}`;
        const labelLines = wrapLabel(label, cardWidth + sx(38), 2);
        const firstLineY = y + visualHeight + sy(isStory ? 19 : 18);
        labelLines.forEach((line, lineIndex) => {
            ctx.fillText(truncateTextToWidth(ctx, line, cardWidth + sx(38)), centerX, firstLineY + lineIndex * labelLineHeight);
        });
        ctx.restore();
    };

    if (starters.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = mutedInk;
        ctx.font = `800 ${sf(24)}px ${FONT_BODY}`;
        ctx.fillText('No hay jugadores para exportar.', canvas.width / 2, gridTop + (gridBottom - gridTop) / 2);
        ctx.restore();
        return;
    }

    starters.forEach(drawPlayerTile);

    if (replacements.length > 0) {
        const titleY = canvas.height - sy(isStory ? 212 : 80);
        const lineStartY = titleY + sy(isStory ? 42 : 28);
        const maxLineWidth = canvas.width - sx(150);
        const replacementLabels = replacements.map((player, index) => {
            const number = String(player.number ?? 16 + index).trim();
            const ratingLabel = formatLineupExportRating(player.rating);
            return `${number}. ${String(player.name || '').trim()}${ratingLabel ? ` (${ratingLabel})` : ''}`;
        });

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = ink;
        ctx.font = `900 ${sf(isStory ? 24 : 20)}px ${FONT_BODY}`;
        ctx.fillText('SUPLENTES', canvas.width / 2, titleY);

        ctx.font = `800 ${sf(isStory ? 17 : 14)}px ${FONT_BODY}`;
        const lines: string[] = [];
        let currentLine = '';
        replacementLabels.forEach((label) => {
            const candidate = currentLine ? `${currentLine} ${label}` : label;
            if (!currentLine || ctx.measureText(candidate).width <= maxLineWidth) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = label;
            }
        });
        if (currentLine) lines.push(currentLine);

        ctx.fillStyle = mutedInk;
        lines.slice(0, 3).forEach((line, index) => {
            ctx.fillText(truncateTextToWidth(ctx, line, maxLineWidth), canvas.width / 2, lineStartY + index * sy(isStory ? 28 : 24));
        });
        ctx.restore();
    } else {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = subtleInk;
        ctx.font = `800 ${sf(isStory ? 16 : 12)}px ${FONT_MONO}`;
        ctx.fillText('POWERED BY G22 SCORES', canvas.width / 2, canvas.height - sy(isStory ? 86 : 42));
        ctx.restore();
    }
}

/**
 * Round titles come in under different keys depending on the source: a local bracket
 * builds `name`, while the external feed sends `round_name`. PlayoffBracket resolves the
 * same way — keep both in step, and never hand `undefined` to the canvas.
 */
function getBracketRoundName(round: PlayoffBracketRoundData, index: number): string {
    const name = round?.name || round?.round_name || round?.ROUND_NAME;
    return String(name || `Ronda ${index + 1}`);
}

function getBracketParticipantName(side: PlayoffBracketMatchData['home_team'], participant: PlayoffBracketMatchData['home_participant']) {
    return participant?.participant_name || side?.name || 'TBD';
}

function getBracketParticipantLogo(side: PlayoffBracketMatchData['home_team'], participant: PlayoffBracketMatchData['home_participant']) {
    return participant?.image_path || side?.logo || '';
}

function getBracketMatchWinner(match: PlayoffBracketMatchData, side: 'home' | 'away') {
    const winnerId = match.winner_id;
    if (winnerId != null) {
        const homeId = match.home_participant?.participant_id ?? match.home_team?.id ?? null;
        const awayId = match.away_participant?.participant_id ?? match.away_team?.id ?? null;
        return side === 'home' ? String(winnerId) === String(homeId) : String(winnerId) === String(awayId);
    }

    const homeScore = Number(match.score_home);
    const awayScore = Number(match.score_away);
    const isFinished = match.status === 'finished' || match.status === 'final' || match.result === 'finished' || match.result === 'Final';

    if (!isFinished || !Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) {
        return false;
    }

    return side === 'home' ? homeScore > awayScore : awayScore > homeScore;
}

async function drawPlayoffBracket(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: PlayoffBracketData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const rounds = Array.isArray(data.rounds) ? data.rounds.filter((round) => Array.isArray(round?.matches) && round.matches.length > 0) : [];
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.7);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const logoLoads = await Promise.all([
        loadImage(getTournamentLogoImageSource(data)),
        ...rounds.flatMap((round) =>
            round.matches.flatMap((match) => [
                loadImage(getBracketParticipantLogo(match.home_team || null, match.home_participant || null)),
                loadImage(getBracketParticipantLogo(match.away_team || null, match.away_participant || null)),
            ]),
        ),
    ]);
    const tournamentLogo = logoLoads[0];

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        isStory ? 74 : 56,
        'CUADRO PLAYOFF',
        accentColor,
        getContrastColor(accentColor),
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        26,
        isStory ? 48 : 42,
    );
    drawTournamentRibbon(ctx, canvas, data.title, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 166 : 138, isStory ? 34 : 30, {
        maxWidth: canvas.width - (isStory ? 120 : 112),
        titleDefaultSize: 102,
        logoDefaultSize: 58,
        maxFontSize: isStory ? 38 : 34,
        minFontSize: isStory ? 18 : 16,
        maxLogoSize: isStory ? 58 : 50,
    });

    if (data.subtitle) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, data.subtitle, canvas.width - 120), safe.centerX, isStory ? 208 : 178);
        ctx.restore();
    }

    const panelX = isStory ? 38 : 42;
    const panelY = isStory ? 248 : 220;
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 18 : 10);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    if (rounds.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${isStory ? 24 : 20}px ${FONT_BODY}`;
        ctx.fillText('No hay cruces cargados para exportar.', safe.centerX, panelY + panelHeight / 2);
        ctx.restore();
        drawBrandFooter(ctx, canvas, brandLogo, isDark);
        return;
    }

    const contentTop = panelY + 30;
    const contentBottom = panelY + panelHeight - 24;
    const innerHeight = contentBottom - contentTop;
    const titleHeight = isStory ? 34 : 30;
    const listTop = contentTop + titleHeight + 18;
    const listHeight = innerHeight - titleHeight - 18;
    const rowGap = isStory ? 16 : 12;
    // Wider gaps between rounds leave room for the bracket connector elbows.
    const columnGap = isStory ? 26 : 38;
    const columnWidth = (panelWidth - 32 - columnGap * Math.max(rounds.length - 1, 0)) / rounds.length;
    const columnXFor = (roundIndex: number) => panelX + 16 + roundIndex * (columnWidth + columnGap);

    // One uniform card height, sized to the densest round so every card matches.
    // Taller cap on story (1080x1920) so cards fill the much taller canvas
    // instead of floating as a tiny block.
    const maxMatchCount = Math.max(...rounds.map((round) => round.matches.length));
    const cardHeight = Math.max(
        64,
        Math.min(
            isStory ? 168 : 116,
            (listHeight - rowGap * Math.max(maxMatchCount - 1, 0)) / Math.max(maxMatchCount, 1),
        ),
    );

    // Vertical center of every match. Round 0 (and any irregular round) is spread
    // evenly across the FULL panel height — like a real bracket whose first round
    // fills the column top-to-bottom — so there are no big empty bands. Each later
    // round is centered between the pair of matches that feed it, which makes the
    // columns line up as a tree. When a round is not exactly half of the previous
    // one (byes, reválida, third place...) it falls back to this even spread.
    const evenCenters = (count: number): number[] => {
        if (count <= 0) return [];
        if (count === 1) return [listTop + listHeight / 2];
        const first = listTop + cardHeight / 2;
        const last = listTop + listHeight - cardHeight / 2;
        const step = (last - first) / (count - 1);
        return Array.from({ length: count }, (_, i) => first + i * step);
    };
    const isTreeStep = (roundIndex: number, prevCount: number) =>
        roundIndex > 0 && rounds[roundIndex].matches.length === Math.ceil(prevCount / 2);

    const centersByRound: number[][] = [];
    rounds.forEach((round, roundIndex) => {
        const count = round.matches.length;
        if (roundIndex === 0 || !isTreeStep(roundIndex, centersByRound[roundIndex - 1].length)) {
            centersByRound.push(evenCenters(count));
            return;
        }
        const prev = centersByRound[roundIndex - 1];
        const fallback = evenCenters(count);
        centersByRound.push(
            round.matches.map((_match, j) => {
                const f1 = prev[2 * j];
                const f2 = prev[2 * j + 1];
                if (f1 != null && f2 != null) return (f1 + f2) / 2;
                return f1 ?? f2 ?? fallback[j];
            }),
        );
    });

    // Pass 1 — connector elbows, drawn behind the cards.
    ctx.save();
    ctx.strokeStyle = hexToRGBA(accentColor, isDark ? 0.34 : 0.26);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let roundIndex = 1; roundIndex < rounds.length; roundIndex += 1) {
        const prev = centersByRound[roundIndex - 1];
        const curr = centersByRound[roundIndex];
        if (!isTreeStep(roundIndex, prev.length)) continue;
        const xPrevRight = columnXFor(roundIndex - 1) + columnWidth;
        const xCurrLeft = columnXFor(roundIndex);
        const midX = (xPrevRight + xCurrLeft) / 2;
        curr.forEach((cardCenter, j) => {
            const f1 = prev[2 * j];
            const f2 = prev[2 * j + 1];
            ctx.beginPath();
            if (f1 != null && f2 != null) {
                ctx.moveTo(xPrevRight, f1);
                ctx.lineTo(midX, f1);
                ctx.moveTo(xPrevRight, f2);
                ctx.lineTo(midX, f2);
                ctx.moveTo(midX, f1);
                ctx.lineTo(midX, f2);
                ctx.moveTo(midX, cardCenter);
                ctx.lineTo(xCurrLeft, cardCenter);
            } else if (f1 != null) {
                ctx.moveTo(xPrevRight, f1);
                ctx.lineTo(xCurrLeft, cardCenter);
            }
            ctx.stroke();
        });
    }
    ctx.restore();

    // Pass 2 — round titles + match cards.
    let logoIndex = 1;
    rounds.forEach((round, roundIndex) => {
        const columnX = columnXFor(roundIndex);
        const roundMatches = round.matches;
        const centers = centersByRound[roundIndex];

        ctx.save();
        ctx.fillStyle = hexToRGBA(accentColor, isDark ? 0.14 : 0.09);
        ctx.beginPath();
        ctx.roundRect(columnX, contentTop, columnWidth, titleHeight, 999);
        ctx.fill();
        ctx.fillStyle = accentColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${isStory ? 16 : 14}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, getBracketRoundName(round, roundIndex).toUpperCase(), columnWidth - 26), columnX + columnWidth / 2, contentTop + titleHeight / 2 + 1);
        ctx.restore();

        roundMatches.forEach((match, matchIndex) => {
            const cardY = centers[matchIndex] - cardHeight / 2;
            const cardRadius = 24;
            const homeName = getBracketParticipantName(match.home_team || null, match.home_participant || null);
            const awayName = getBracketParticipantName(match.away_team || null, match.away_participant || null);
            const homeWon = getBracketMatchWinner(match, 'home');
            const awayWon = getBracketMatchWinner(match, 'away');
            const homeLogo = logoLoads[logoIndex] || null;
            const awayLogo = logoLoads[logoIndex + 1] || null;
            logoIndex += 2;
            const matchDate = toExportDate(match.match_start_iso);
            const headerLabel = matchDate
                ? formatDateInFixedOffset(matchDate, DEFAULT_TIMEZONE_OFFSET_MINUTES, { day: '2-digit', month: '2-digit' })
                : 'TBD';
            const statusLabel = getStatusLabel(match.status || match.result || 'scheduled');
            const teamRowHeight = (cardHeight - 30) / 2;
            const scoreWidth = Math.max(32, Math.min(44, columnWidth * 0.18));
            const nameWidth = columnWidth - 36 - scoreWidth - 40;

            ctx.save();
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)';
            ctx.beginPath();
            ctx.roundRect(columnX, cardY, columnWidth, cardHeight, cardRadius);
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = mutedColor;
            ctx.font = `700 ${isStory ? 12 : 11}px ${FONT_BODY}`;
            ctx.fillText(headerLabel, columnX + 14, cardY + 15);

            ctx.textAlign = 'right';
            ctx.fillStyle = getStatusColor(match.status || match.result, accentColor, isDark);
            ctx.fillText(statusLabel, columnX + columnWidth - 14, cardY + 15);

            const drawTeamRow = (
                y: number,
                name: string,
                logo: HTMLImageElement | null,
                rawLogo: string,
                score: string | number | null | undefined,
                winner: boolean,
            ) => {
                const logoSize = Math.max(20, Math.min(32, scaleElementSize('teamLogo', Math.max(22, Math.min(28, teamRowHeight - 10)), 28)));
                ctx.save();
                if (winner) {
                    ctx.fillStyle = hexToRGBA(accentColor, isDark ? 0.14 : 0.1);
                    ctx.beginPath();
                    ctx.roundRect(columnX + 8, y, columnWidth - 16, teamRowHeight - 4, 18);
                    ctx.fill();
                }
                drawLogoBadge(ctx, {
                    x: columnX + 24,
                    y: y + (teamRowHeight - 4) / 2,
                    size: logoSize,
                    img: logo,
                    label: name,
                    rawLogo,
                    isDark,
                    showFrame: false,
                });
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = winner ? accentColor : textColor;
                ctx.font = `800 ${isStory ? 14 : 12}px ${FONT_BODY}`;
                const clippedName = truncateTextToWidth(ctx, name.toUpperCase(), nameWidth);
                ctx.fillText(clippedName, columnX + 42, y + (teamRowHeight - 4) / 2 + 1);

                ctx.textAlign = 'right';
                ctx.font = `800 ${isStory ? 20 : 18}px ${FONT_MONO}`;
                ctx.fillText(score == null || score === '' ? '-' : String(score), columnX + columnWidth - 14, y + (teamRowHeight - 4) / 2 + 1);
                ctx.restore();
            };

            drawTeamRow(
                cardY + 26,
                homeName,
                homeLogo,
                getBracketParticipantLogo(match.home_team || null, match.home_participant || null),
                match.score_home,
                homeWon,
            );
            drawTeamRow(
                cardY + 26 + teamRowHeight,
                awayName,
                awayLogo,
                getBracketParticipantLogo(match.away_team || null, match.away_participant || null),
                match.score_away,
                awayWon,
            );
            ctx.restore();
        });
    });

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
}

async function drawPlayerStats(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: PlayerStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isDark = getContrastColor(bgColor) === '#ffffff';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.72);
    const softColor = getMutedColor(isDark, 0.1);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const playerPhoto = await loadImage(data.photo || '');

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        isStory ? 74 : 56,
        'REPORTE INDIVIDUAL',
        accentColor,
        getContrastColor(accentColor),
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        26,
        isStory ? 48 : 42
    );

    const panelX = isStory ? 72 : 86;
    const panelY = isStory ? 190 : 170;
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 18 : 8);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 36, isDark);

    const avatarY = panelY + (isStory ? 126 : 116);
    const avatarSize = isStory ? 156 : 136;
    drawLogoBadge(ctx, {
        x: safe.centerX,
        y: avatarY,
        size: avatarSize,
        img: playerPhoto,
        label: data.name,
        rawLogo: undefined,
        isDark,
    });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = textColor;
    setFittedFont(ctx, data.name.toUpperCase(), panelWidth - 120, '800', isStory ? 42 : 36, FONT_DISPLAY, 22);
    ctx.fillText(data.name.toUpperCase(), safe.centerX, avatarY + (isStory ? 126 : 112));
    ctx.fillStyle = mutedColor;
    ctx.font = `700 ${isStory ? 20 : 17}px ${FONT_BODY}`;
    ctx.fillText(`${data.team} - ${data.position}`.toUpperCase(), safe.centerX, avatarY + (isStory ? 166 : 148));
    ctx.restore();

    const stats = data.stats.slice(0, isStory ? 7 : 6);
    const statsTop = avatarY + (isStory ? 212 : 188);
    const statsBottom = panelY + panelHeight - 30;
    const rowHeight = Math.min(isStory ? 82 : 72, (statsBottom - statsTop) / Math.max(stats.length, 1));

    stats.forEach((stat, index) => {
        const y = statsTop + index * rowHeight;
        ctx.save();
        ctx.fillStyle = stat.highlight ? hexToRGBA(accentColor, isDark ? 0.16 : 0.1) : softColor;
        ctx.beginPath();
        ctx.roundRect(panelX + 24, y, panelWidth - 48, rowHeight - 10, 24);
        ctx.fill();

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 20 : 18}px ${FONT_BODY}`;
        ctx.fillText(stat.label.toUpperCase(), panelX + 48, y + (rowHeight - 10) / 2 + 1);

        ctx.textAlign = 'right';
        ctx.fillStyle = stat.highlight ? accentColor : textColor;
        ctx.font = `800 ${isStory ? 34 : 30}px ${FONT_MONO}`;
        ctx.fillText(String(stat.value), panelX + panelWidth - 48, y + (rowHeight - 10) / 2 + 1);
        ctx.restore();
    });

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
}

function drawMomentumBackdrop(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    accentColor: string,
    bgColor: string
) {
    const supportColor = mixHexColors(accentColor, '#ff8a00', 0.28);
    const coolColor = mixHexColors(accentColor, '#38bdf8', 0.18);
    const baseColor = mixHexColors('#030303', bgColor, 0.18);

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const topGlow = ctx.createRadialGradient(canvas.width * 0.14, canvas.height * 0.08, 0, canvas.width * 0.14, canvas.height * 0.08, canvas.width * 0.78);
    topGlow.addColorStop(0, hexToRGBA(accentColor, 0.16));
    topGlow.addColorStop(0.4, hexToRGBA(accentColor, 0.04));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bottomGlow = ctx.createRadialGradient(canvas.width * 0.88, canvas.height * 0.9, 0, canvas.width * 0.88, canvas.height * 0.9, canvas.width * 0.7);
    bottomGlow.addColorStop(0, hexToRGBA(coolColor, 0.14));
    bottomGlow.addColorStop(0.32, hexToRGBA(supportColor, 0.06));
    bottomGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let offset = -canvas.height; offset <= canvas.width; offset += 74) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset + canvas.height, canvas.height);
        ctx.stroke();
    }

    ctx.fillStyle = hexToRGBA(accentColor, 0.96);
    ctx.fillRect(0, 54, canvas.width * 0.22, 8);
    ctx.fillStyle = hexToRGBA(supportColor, 0.96);
    ctx.fillRect(canvas.width * 0.74, canvas.height - 64, canvas.width * 0.2, 8);
}

function drawMomentumKicker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
    align: CanvasTextAlign = 'left'
) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 14px ${FONT_MONO}`;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.restore();
}

function drawMomentumHeroTitle(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left'
) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    setFittedFont(ctx, text.toUpperCase(), maxWidth, '900', size, FONT_EDITORIAL_SCORE, 32);
    ctx.fillText(truncateTextToWidth(ctx, text.toUpperCase(), maxWidth), x, y);
    ctx.restore();
}

function drawMomentumImageCover(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    overlay?: string
) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.clip();

    if (image) {
        const sourceWidth = image.naturalWidth || image.width || width;
        const sourceHeight = image.naturalHeight || image.height || height;
        const scale = Math.max(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    } else {
        const fallback = ctx.createLinearGradient(x, y, x + width, y + height);
        fallback.addColorStop(0, 'rgba(255,255,255,0.08)');
        fallback.addColorStop(1, 'rgba(255,255,255,0.02)');
        ctx.fillStyle = fallback;
        ctx.fillRect(x, y, width, height);
    }

    if (overlay) {
        ctx.fillStyle = overlay;
        ctx.fillRect(x, y, width, height);
    }

    ctx.restore();
}

function drawNeutralizedBackdropMark(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    x: number,
    y: number,
    width: number,
    height: number,
    tint: string,
    opacity: number
) {
    if (!image) return;

    const sourceWidth = image.naturalWidth || image.width || width;
    const sourceHeight = image.naturalHeight || image.height || height;
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = x - drawWidth / 2;
    const drawY = y - drawHeight / 2;

    if (typeof document === 'undefined') {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
        return;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.ceil(drawWidth));
    offscreen.height = Math.max(1, Math.ceil(drawHeight));
    const offscreenCtx = offscreen.getContext('2d');
    if (!offscreenCtx) return;

    offscreenCtx.imageSmoothingEnabled = true;
    offscreenCtx.imageSmoothingQuality = 'high';
    offscreenCtx.drawImage(image, 0, 0, offscreen.width, offscreen.height);
    offscreenCtx.globalCompositeOperation = 'source-atop';
    offscreenCtx.fillStyle = tint;
    offscreenCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(offscreen, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
}

function drawMomentumRepeatLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    top: number,
    bottom: number,
    color: string
) {
    ctx.save();
    ctx.translate(x, top);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.font = `800 20px ${FONT_BODY}`;
    const step = 196;
    const length = Math.max(1, Math.floor((bottom - top) / step));
    for (let index = 0; index < length; index += 1) {
        ctx.fillText(text.toUpperCase(), index * step, 0);
    }
    ctx.restore();
}

function getMomentumDailyMatchesHeroTitle(matches: DailyMatchesData['matches']) {
    if (matches.length > 0 && matches.every((match) => match.status === 'finished')) return 'Resultados';
    if (matches.length > 0 && matches.every((match) => match.status === 'scheduled')) return 'Calendario';
    return 'Partidos';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function drawMomentumClassicTallWord(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    topY: number,
    maxWidth: number,
    fontSize: number,
    color: string,
    scaleX: number,
    scaleY: number
) {
    const safeText = text.trim().toUpperCase();
    if (!safeText) return;

    ctx.save();
    ctx.translate(centerX, topY);
    ctx.scale(scaleX, scaleY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    setFittedFont(ctx, safeText, maxWidth / Math.max(scaleX, 0.01), '900', Math.round(fontSize / Math.max(scaleY, 0.01)), FONT_CLASSIC_MATCH_SCORE, 24);
    ctx.fillText(truncateTextToWidth(ctx, safeText, maxWidth / Math.max(scaleX, 0.01)), 0, 0);
    ctx.restore();
}

async function drawMomentumMatchDayClassicSchedule(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    return drawMomentumMatchDayClassicScheduleRevised(ctx, canvas, data, format, accentColor, bgColor, brandLogo);
    /*
    const blockTint = '#ffffff';
    const paperShade = mixHexColors(bgColor, '#d7d0c4', 0.18);
    const ambientAccent = mixHexColors(accentColor, '#ffffff', 0.08);
    const infoAccent = mixHexColors(accentColor, '#7a0000', 0.18);
    const topWord = getMomentumClassicDecorativeWord(data.homeTeam, 'MATCH');
    const bottomWord = getMomentumClassicDecorativeWord(data.awayTeam, 'DAY');
    const curvedLabel = (data.editorialContextLabel?.trim() || "IT'S SHOW TIME").toUpperCase();
    const heroLabel = data.mainTitle?.trim() && data.mainTitle.trim().toUpperCase() !== 'HORARIO'
        ? data.mainTitle.trim().toUpperCase()
        : 'MATCH DAY';
    const heroWords = heroLabel.split(/\s+/).filter(Boolean);
    const heroTopWord = heroWords[0] || 'MATCH';
    const heroBottomWord = heroWords.slice(1).join(' ') || 'DAY';
    const metaLabel = [data.date, data.time].filter(Boolean).join(' • ').toUpperCase();
    const sponsors = getActiveEditorialSponsors(buildEditorialSponsorSlots(data.sponsors)).slice(0, 4);
    const paperShade = mixHexColors(bgColor, '#e5dfd5', 0.14);
    const accentSoft = mixHexColors(accentColor, '#ffffff', 0.2);
    const metaAccent = mixHexColors(accentColor, '#0f172a', 0.08);
    const tournamentLabel = (data.tournament || 'TORNEO').toUpperCase();
    const venueLabel = (data.venue || 'SEDE A CONFIRMAR').toUpperCase();
    const infoLabel = [data.tournament, data.date, data.time].filter(Boolean).join(' • ').toUpperCase() || tournamentLabel;
    const metaLabel = [data.date, data.time].filter(Boolean).join(' • ').toUpperCase();
    const [homeLogo, awayLogo, tournamentLogo, textureImage] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(EDITORIAL_TEXTURE_SOURCE),
    ]);

    const drawTintedCrest = (
        centerX: number,
        centerY: number,
        width: number,
        height: number,
        image: HTMLImageElement | null,
        label: string,
        rawLogo: string | undefined
    ) => {
        if (image) {
            drawNeutralizedBackdropMark(ctx, image, centerX, centerY, width, height, blockTint, 1);
            return;
        }

        drawOverflowCrest(ctx, {
            x: centerX,
            y: centerY,
            width,
            height,
            img: null,
            label,
            rawLogo,
            isDark: true,
            showFrame: false,
        });
    };

    const fillPaper = ctx.createLinearGradient(0, 0, 0, canvas.height);
    fillPaper.addColorStop(0, '#ffffff');
    fillPaper.addColorStop(0.36, bgColor);
    fillPaper.addColorStop(1, paperShade);
    ctx.fillStyle = fillPaper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topGlow = ctx.createRadialGradient(canvas.width * 0.24, canvas.height * 0.18, sx(28), canvas.width * 0.24, canvas.height * 0.18, sx(420));
    topGlow.addColorStop(0, hexToRGBA(ambientAccent, 0.16));
    topGlow.addColorStop(0.55, hexToRGBA(ambientAccent, 0.04));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (textureImage) {
        ctx.save();
        ctx.globalAlpha = isStory ? 0.18 : 0.16;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(textureImage, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    drawMomentumClassicTallWord(
        ctx,
        topWord,
        canvas.width / 2,
        -sy(isStory ? 34 : 54),
        canvas.width + sx(180),
        sy(isStory ? 218 : 232),
        accentColor,
        1.02,
        1.14
    );

    drawMomentumClassicArcText(
        ctx,
        curvedLabel,
        canvas.width / 2,
        sy(isStory ? 434 : 330),
        sx(isStory ? 198 : 164),
        -Math.PI * 0.82,
        -Math.PI * 0.18,
        accentColor,
        sy(isStory ? 28 : 24)
    );

    drawMomentumClassicTallWord(
        ctx,
        heroTopWord,
        canvas.width / 2,
        sy(isStory ? 292 : 206),
        sx(420),
        sy(isStory ? 178 : 154),
        accentColor,
        0.72,
        1.18
    );
    drawMomentumClassicTallWord(
        ctx,
        heroBottomWord,
        canvas.width / 2,
        sy(isStory ? 514 : 390),
        sx(468),
        sy(isStory ? 244 : 214),
        accentColor,
        0.82,
        1.24
    );

    const plateX = 0;
    const plateY = sy(isStory ? 880 : 764);
    const plateWidth = sx(678);
    const plateHeight = sy(isStory ? 268 : 236);
    const plateCenterY = plateY + plateHeight / 2;

    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.fillRect(plateX, plateY, plateWidth, plateHeight);
    ctx.restore();

    if (textureImage) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.globalCompositeOperation = 'soft-light';
        ctx.drawImage(textureImage, plateX, plateY, plateWidth, plateHeight);
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = hexToRGBA(blockTint, 0.9);
    ctx.lineWidth = sx(3);
    ctx.beginPath();
    ctx.moveTo(plateX + plateWidth / 2, plateY + sy(58));
    ctx.lineTo(plateX + plateWidth / 2, plateY + plateHeight - sy(58));
    ctx.stroke();
    ctx.restore();

    drawTintedCrest(
        plateX + plateWidth * 0.24,
        plateCenterY,
        sx(isStory ? 180 : 166),
        sy(isStory ? 180 : 166),
        homeLogo,
        data.homeTeam,
        data.homeLogo
    );
    drawTintedCrest(
        plateX + plateWidth * 0.74,
        plateCenterY,
        sx(isStory ? 180 : 166),
        sy(isStory ? 180 : 166),
        awayLogo,
        data.awayTeam,
        data.awayLogo
    );

    const infoX = plateX + plateWidth + sx(44);
    const infoWidth = canvas.width - infoX - sx(44);
    const homeLayout = fitTextLinesToWidth(ctx, data.homeTeam.toUpperCase(), infoWidth, '900', sy(isStory ? 54 : 48), FONT_CLASSIC_MATCH_SCORE, sy(28), 2);
    const awayLayout = fitTextLinesToWidth(ctx, data.awayTeam.toUpperCase(), infoWidth, '900', sy(isStory ? 54 : 48), FONT_CLASSIC_MATCH_SCORE, sy(28), 2);
    const versusLayout = fitTextLinesToWidth(ctx, 'VERSUS.', infoWidth, '900', sy(isStory ? 58 : 52), FONT_CLASSIC_MATCH_SCORE, sy(32), 1);
    const homeLineGap = Math.max(sy(38), Math.round(homeLayout.size * 0.82));
    const awayLineGap = Math.max(sy(38), Math.round(awayLayout.size * 0.82));
    const versusGap = Math.max(sy(46), Math.round(versusLayout.size * 0.9));
    let cursorY = plateY + sy(isStory ? 84 : 76);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = infoAccent;
    ctx.font = `900 ${homeLayout.size}px ${FONT_CLASSIC_MATCH_SCORE}`;
    homeLayout.lines.forEach((line, index) => {
        ctx.fillText(line, infoX, cursorY + index * homeLineGap);
    });
    cursorY += homeLayout.lines.length * homeLineGap + sy(6);
    ctx.font = `900 ${versusLayout.size}px ${FONT_CLASSIC_MATCH_SCORE}`;
    ctx.fillText(versusLayout.lines[0], infoX, cursorY);
    cursorY += versusGap;
    ctx.font = `900 ${awayLayout.size}px ${FONT_CLASSIC_MATCH_SCORE}`;
    awayLayout.lines.forEach((line, index) => {
        ctx.fillText(line, infoX, cursorY + index * awayLineGap);
    });
    cursorY += awayLayout.lines.length * awayLineGap + sy(6);
    ctx.font = `800 ${sy(isStory ? 26 : 24)}px ${FONT_CLASSIC_MATCH_SCORE}`;
    ctx.fillText(truncateTextToWidth(ctx, venueLabel, infoWidth), infoX, cursorY);

    if (metaLabel) {
        ctx.fillStyle = hexToRGBA(infoAccent, 0.74);
        ctx.font = `700 ${sy(isStory ? 18 : 16)}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, metaLabel, infoWidth), infoX, cursorY + sy(isStory ? 34 : 30));
    }
    ctx.restore();

    const sponsorsDrawn = drawMomentumClassicSponsorRow(
        ctx,
        canvas,
        sponsors,
        sponsorImages,
        canvas.height - sy(isStory ? 218 : 150),
        accentColor,
        isStory
    );

    if (!sponsorsDrawn && brandLogo) {
        drawNeutralizedBackdropMark(
            ctx,
            brandLogo,
            canvas.width / 2,
            canvas.height - sy(isStory ? 220 : 152),
            sx(116),
            sy(52),
            accentColor,
            0.92
        );
    }

    drawMomentumClassicTallWord(
        ctx,
        bottomWord,
        canvas.width / 2,
        canvas.height - sy(isStory ? 88 : 72),
        canvas.width + sx(120),
        sy(isStory ? 206 : 214),
        accentColor,
        1.04,
        1.08
    );
    */
}

async function drawMomentumMatchDayClassicScheduleRevised(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    void format;
    void brandLogo;
    const scaleX = canvas.width / 1080;
    const scaleY = canvas.height / 1350;
    const sx = (value: number) => Math.round(value * scaleX);
    const sy = (value: number) => Math.round(value * scaleY);
    const surfaceIsDark = getContrastColor(bgColor) === '#ffffff';
    const posterBase = surfaceIsDark
        ? mixHexColors(bgColor, '#071018', 0.3)
        : mixHexColors(bgColor, '#dce6ee', 0.1);
    const matteColor = surfaceIsDark
        ? mixHexColors(bgColor, '#04070b', 0.46)
        : mixHexColors(bgColor, '#081119', 0.8);
    const matteSecondary = mixHexColors(matteColor, '#000000', 0.24);
    const accentSoft = mixHexColors(accentColor, '#ffffff', surfaceIsDark ? 0.2 : 0.34);
    const accentLight = mixHexColors(accentColor, '#ffffff', surfaceIsDark ? 0.36 : 0.52);
    const accentDeep = mixHexColors(accentColor, '#0b1220', 0.3);
    const accentMuted = mixHexColors(accentColor, bgColor, surfaceIsDark ? 0.24 : 0.4);
    const neutralCard = mixHexColors('#ffffff', bgColor, surfaceIsDark ? 0.14 : 0.08);
    const textPrimary = '#ffffff';
    const textSecondary = hexToRGBA('#ffffff', 0.84);
    const textMuted = hexToRGBA('#ffffff', 0.66);
    const title = `${data.homeTeam} X ${data.awayTeam}`.trim().toUpperCase();
    const subtitleParts = [
        data.editorialContextLabel?.trim(),
        data.tournament?.trim(),
        data.mainTitle?.trim() && data.mainTitle.trim().toLowerCase() !== 'horario' ? data.mainTitle.trim() : '',
    ].filter(Boolean);
    const subtitle = subtitleParts.join(' / ').toUpperCase();
    const tournamentLabel = (data.tournament || 'TORNEO').trim().toUpperCase();
    const dateLabel = (data.date || '').trim().toUpperCase();
    const timeLabel = (data.time || '--:--').trim().toUpperCase();
    const venueLabel = (data.venue || 'SEDE A CONFIRMAR').trim().toUpperCase();
    const [homeLogo, awayLogo, tournamentLogo, textureImage] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(EDITORIAL_TEXTURE_SOURCE),
    ]);

    const drawTexturedRect = (
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor: string | CanvasGradient | CanvasPattern,
        strokeColor: string,
        radius: number,
        textureOpacity: number,
    ) => {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        ctx.fill();
        ctx.stroke();

        if (textureImage) {
            ctx.save();
            ctx.globalAlpha = textureOpacity;
            ctx.globalCompositeOperation = 'soft-light';
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, radius);
            ctx.clip();
            ctx.drawImage(textureImage, x, y, width, height);
            ctx.restore();
        }
        ctx.restore();
    };

    ctx.fillStyle = posterBase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const backgroundWash = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    backgroundWash.addColorStop(0, mixHexColors(bgColor, accentSoft, 0.18));
    backgroundWash.addColorStop(0.46, posterBase);
    backgroundWash.addColorStop(1, mixHexColors(bgColor, accentMuted, 0.22));
    ctx.fillStyle = backgroundWash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topGlow = ctx.createRadialGradient(sx(210), sy(140), sx(24), sx(210), sy(140), sx(520));
    topGlow.addColorStop(0, hexToRGBA(accentLight, 0.3));
    topGlow.addColorStop(0.38, hexToRGBA(accentSoft, 0.14));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bottomGlow = ctx.createRadialGradient(canvas.width - sx(160), canvas.height - sy(210), sx(32), canvas.width - sx(160), canvas.height - sy(210), sx(440));
    bottomGlow.addColorStop(0, hexToRGBA(accentColor, 0.22));
    bottomGlow.addColorStop(0.42, hexToRGBA(accentMuted, 0.1));
    bottomGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = hexToRGBA(accentSoft, 0.26);
    ctx.beginPath();
    ctx.moveTo(sx(-36), sy(-12));
    ctx.lineTo(sx(420), sy(-12));
    ctx.lineTo(sx(354), sy(104));
    ctx.lineTo(sx(188), sy(168));
    ctx.lineTo(sx(88), sy(86));
    ctx.lineTo(sx(-36), sy(202));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hexToRGBA(accentDeep, 0.32);
    ctx.beginPath();
    ctx.moveTo(canvas.width, sy(104));
    ctx.lineTo(canvas.width, sy(468));
    ctx.bezierCurveTo(canvas.width - sx(34), sy(448), canvas.width - sx(82), sy(382), canvas.width - sx(98), sy(302));
    ctx.bezierCurveTo(canvas.width - sx(112), sy(228), canvas.width - sx(64), sy(152), canvas.width, sy(104));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hexToRGBA(accentMuted, 0.28);
    ctx.beginPath();
    ctx.moveTo(sx(-28), canvas.height - sy(520));
    ctx.bezierCurveTo(sx(118), canvas.height - sy(470), sx(164), canvas.height - sy(352), sx(122), canvas.height - sy(236));
    ctx.bezierCurveTo(sx(104), canvas.height - sy(184), sx(52), canvas.height - sy(124), sx(-24), canvas.height - sy(102));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hexToRGBA(accentLight, 0.24);
    ctx.beginPath();
    ctx.moveTo(canvas.width - sx(184), canvas.height - sy(176));
    ctx.lineTo(canvas.width, canvas.height - sy(104));
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(canvas.width - sx(266), canvas.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (textureImage) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(textureImage, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = hexToRGBA('#000000', 0.34);
    ctx.shadowBlur = sy(38);
    ctx.shadowOffsetY = sy(20);
    ctx.fillStyle = matteColor;
    ctx.beginPath();
    ctx.moveTo(sx(106), sy(84));
    ctx.lineTo(canvas.width - sx(94), sy(84));
    ctx.lineTo(canvas.width - sx(164), sy(198));
    ctx.lineTo(canvas.width - sx(128), sy(324));
    ctx.lineTo(canvas.width - sx(94), canvas.height - sy(178));
    ctx.lineTo(canvas.width - sx(154), canvas.height - sy(96));
    ctx.lineTo(sx(172), canvas.height - sy(96));
    ctx.lineTo(sx(112), canvas.height - sy(226));
    ctx.lineTo(sx(138), canvas.height - sy(378));
    ctx.lineTo(sx(86), sy(822));
    ctx.lineTo(sx(150), sy(728));
    ctx.lineTo(sx(72), sy(480));
    ctx.lineTo(sx(184), sy(204));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    const matteGradient = ctx.createLinearGradient(0, sy(84), 0, canvas.height - sy(96));
    matteGradient.addColorStop(0, mixHexColors(matteColor, accentDeep, 0.1));
    matteGradient.addColorStop(0.48, matteColor);
    matteGradient.addColorStop(1, matteSecondary);
    ctx.fillStyle = matteGradient;
    ctx.beginPath();
    ctx.moveTo(sx(106), sy(84));
    ctx.lineTo(canvas.width - sx(94), sy(84));
    ctx.lineTo(canvas.width - sx(164), sy(198));
    ctx.lineTo(canvas.width - sx(128), sy(324));
    ctx.lineTo(canvas.width - sx(94), canvas.height - sy(178));
    ctx.lineTo(canvas.width - sx(154), canvas.height - sy(96));
    ctx.lineTo(sx(172), canvas.height - sy(96));
    ctx.lineTo(sx(112), canvas.height - sy(226));
    ctx.lineTo(sx(138), canvas.height - sy(378));
    ctx.lineTo(sx(86), sy(822));
    ctx.lineTo(sx(150), sy(728));
    ctx.lineTo(sx(72), sy(480));
    ctx.lineTo(sx(184), sy(204));
    ctx.closePath();
    ctx.fill();

    if (textureImage) {
        ctx.globalAlpha = 0.14;
        ctx.globalCompositeOperation = 'soft-light';
        ctx.clip();
        ctx.drawImage(textureImage, sx(64), sy(84), canvas.width - sx(128), canvas.height - sy(180));
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(accentLight, 0.16);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx(106), sy(84));
    ctx.lineTo(canvas.width - sx(94), sy(84));
    ctx.lineTo(canvas.width - sx(164), sy(198));
    ctx.lineTo(canvas.width - sx(128), sy(324));
    ctx.lineTo(canvas.width - sx(94), canvas.height - sy(178));
    ctx.lineTo(canvas.width - sx(154), canvas.height - sy(96));
    ctx.lineTo(sx(172), canvas.height - sy(96));
    ctx.lineTo(sx(112), canvas.height - sy(226));
    ctx.lineTo(sx(138), canvas.height - sy(378));
    ctx.lineTo(sx(86), sy(822));
    ctx.lineTo(sx(150), sy(728));
    ctx.lineTo(sx(72), sy(480));
    ctx.lineTo(sx(184), sy(204));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const titleLayout = fitTextLinesToWidth(ctx, title, canvas.width - sx(220), '900', sy(92), FONT_EDITORIAL_SCORE, sy(52), 2);
    const titleLineGap = Math.max(sy(72), Math.round(titleLayout.size * 0.86));
    const titleTop = sy(170);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textPrimary;
    ctx.shadowColor = 'rgba(0,0,0,0.34)';
    ctx.shadowBlur = sy(18);
    ctx.shadowOffsetY = sy(8);
    ctx.font = `italic 900 ${titleLayout.size}px ${FONT_EDITORIAL_SCORE}`;
    titleLayout.lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, titleTop + index * titleLineGap);
    });
    ctx.restore();

    if (subtitle) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = textSecondary;
        ctx.font = `italic 700 ${sy(30)}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, subtitle, canvas.width - sx(260)), canvas.width / 2, titleTop + titleLayout.lines.length * titleLineGap + sy(24));
        ctx.restore();
    }

    const teamTileY = sy(498);
    const teamTileSize = sx(330);
    const centerTileSize = sx(168);
    const gap = sx(28);
    const totalWidth = teamTileSize * 2 + centerTileSize + gap * 2;
    const startX = (canvas.width - totalWidth) / 2;
    const leftTileX = startX;
    const centerTileX = leftTileX + teamTileSize + gap;
    const rightTileX = centerTileX + centerTileSize + gap;
    const leftTileFill = ctx.createLinearGradient(leftTileX, teamTileY, leftTileX + teamTileSize, teamTileY + teamTileSize);
    leftTileFill.addColorStop(0, accentLight);
    leftTileFill.addColorStop(1, accentSoft);
    const rightTileFill = ctx.createLinearGradient(rightTileX, teamTileY, rightTileX + teamTileSize, teamTileY + teamTileSize);
    rightTileFill.addColorStop(0, accentDeep);
    rightTileFill.addColorStop(1, mixHexColors(accentColor, '#0a1020', 0.48));
    const centerTileFill = ctx.createLinearGradient(centerTileX, teamTileY + sy(82), centerTileX + centerTileSize, teamTileY + sy(250));
    centerTileFill.addColorStop(0, neutralCard);
    centerTileFill.addColorStop(1, mixHexColors(neutralCard, '#d8e1ea', 0.18));

    drawTexturedRect(leftTileX, teamTileY, teamTileSize, teamTileSize, leftTileFill, hexToRGBA(accentLight, 0.42), sx(4), 0.12);
    drawTexturedRect(rightTileX, teamTileY, teamTileSize, teamTileSize, rightTileFill, hexToRGBA(accentLight, 0.2), sx(4), 0.12);
    drawTexturedRect(centerTileX, teamTileY + sy(80), centerTileSize, centerTileSize, centerTileFill, hexToRGBA('#ffffff', 0.22), sx(4), 0.08);

    drawOverflowCrest(ctx, {
        x: leftTileX + teamTileSize / 2,
        y: teamTileY + teamTileSize / 2,
        width: sx(218),
        height: sy(218),
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: false,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: rightTileX + teamTileSize / 2,
        y: teamTileY + teamTileSize / 2,
        width: sx(218),
        height: sy(218),
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: true,
        showFrame: false,
    });

    if (tournamentLogo) {
        drawOverflowCrest(ctx, {
            x: centerTileX + centerTileSize / 2,
            y: teamTileY + sy(80) + centerTileSize / 2,
            width: sx(114),
            height: sy(114),
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: false,
            showFrame: false,
        });
    } else {
        const competitionLayout = fitTextLinesToWidth(ctx, tournamentLabel, centerTileSize - sx(28), '900', sy(28), FONT_BODY, sy(15), 2);
        const lineGap = Math.max(sy(24), Math.round(competitionLayout.size * 1.12));
        const totalHeight = competitionLayout.lines.length * lineGap;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = mixHexColors(matteColor, '#0b1320', 0.1);
        ctx.font = `900 ${competitionLayout.size}px ${FONT_BODY}`;
        competitionLayout.lines.forEach((line, index) => {
            const y = teamTileY + sy(80) + centerTileSize / 2 - totalHeight / 2 + lineGap * index + lineGap / 2;
            ctx.fillText(line, centerTileX + centerTileSize / 2, y);
        });
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = hexToRGBA(accentLight, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(238), sy(968));
    ctx.lineTo(canvas.width - sx(238), sy(968));
    ctx.stroke();
    ctx.restore();

    const venueLayout = fitTextLinesToWidth(ctx, venueLabel, canvas.width - sx(280), '800', sy(28), FONT_BODY, sy(18), 2);
    const venueGap = Math.max(sy(24), Math.round(venueLayout.size * 1.16));
    const venueBlockHeight = venueLayout.lines.length * venueGap;
    const infoCenterX = canvas.width / 2;
    const dateBaseline = sy(1078);
    const timeBaseline = sy(1138);
    const venueStartBaseline = sy(1198);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textPrimary;
    ctx.shadowColor = 'rgba(0,0,0,0.24)';
    ctx.shadowBlur = sy(10);
    ctx.shadowOffsetY = sy(4);
    ctx.font = `italic 900 ${sy(48)}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(truncateTextToWidth(ctx, dateLabel, canvas.width - sx(320)), infoCenterX, dateBaseline);
    ctx.font = `italic 900 ${sy(54)}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(truncateTextToWidth(ctx, timeLabel, canvas.width - sx(320)), infoCenterX, timeBaseline);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textSecondary;
    ctx.font = `800 ${venueLayout.size}px ${FONT_BODY}`;
    venueLayout.lines.forEach((line, index) => {
        const y = venueStartBaseline + index * venueGap;
        ctx.fillText(line, infoCenterX, y);
    });
    ctx.restore();

    if (tournamentLabel) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = textMuted;
        ctx.font = `800 ${sy(16)}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, tournamentLabel, canvas.width - sx(360)), infoCenterX, venueStartBaseline + venueBlockHeight + sy(34));
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = hexToRGBA(accentLight, 0.26);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(162), sy(1188));
    ctx.lineTo(sx(262), sy(1188));
    ctx.moveTo(canvas.width - sx(162), sy(1188));
    ctx.lineTo(canvas.width - sx(262), sy(1188));
    ctx.stroke();
    ctx.restore();
}

async function drawMomentumMatchEditorial(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    backgroundImage: string,
    gradientLeftColor: string,
    gradientRightColor: string
) {
    const isStory = format.height > format.width;
    const matteColor = mixHexColors(bgColor, '#020202', 0.76);
    const homeLogo = await loadImage(data.homeLogo || '');
    const awayLogo = await loadImage(data.awayLogo || '');
    const photo = await loadImage(backgroundImage);
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const headlineColor = mixHexColors(accentColor, '#e8c07a', 0.6);
    const sidePanelWidth = isStory ? 446 : 424;
    const photoX = sidePanelWidth + 96;
    const photoY = 144;
    const photoWidth = canvas.width - photoX - 46;
    const photoHeight = canvas.height - 296;

    drawMomentumBackdrop(ctx, canvas, gradientRightColor || accentColor, bgColor);

    ctx.fillStyle = matteColor;
    ctx.fillRect(0, 0, sidePanelWidth, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(sidePanelWidth - 18, 0, 18, canvas.height);

    drawMomentumImageCover(ctx, photo, photoX, photoY, photoWidth, photoHeight, 52, 'rgba(0,0,0,0.16)');

    ctx.save();
    const overlay = ctx.createLinearGradient(photoX, photoY, photoX + photoWidth, photoY + photoHeight);
    overlay.addColorStop(0, hexToRGBA(gradientLeftColor || accentColor, 0.08));
    overlay.addColorStop(0.6, 'rgba(0,0,0,0)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = overlay;
    ctx.beginPath();
    ctx.roundRect(photoX, photoY, photoWidth, photoHeight, 52);
    ctx.fill();
    ctx.restore();

    drawMomentumKicker(ctx, 34, 38, data.mainTitle || getStatusLabel(data.status), getMutedColor(true, 0.72));
    if (tournamentLogo) {
        drawLogoBadge(ctx, { x: 70, y: 92, size: 56, img: tournamentLogo, label: data.tournament || 'Torneo', rawLogo: data.tournamentLogo, isDark: true });
    }

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 18px ${FONT_BODY}`;
    ctx.textAlign = 'left';
    ctx.fillText((data.tournament || 'TORNEO').toUpperCase(), tournamentLogo ? 106 : 34, 100);
    ctx.restore();

    const centerX = sidePanelWidth / 2;
    drawOverflowCrest(ctx, {
        x: centerX,
        y: 246,
        width: 104,
        height: 104,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: true,
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = headlineColor;
    ctx.font = `800 30px ${FONT_BODY}`;
    ctx.fillText(data.homeTeam.toUpperCase(), centerX, 316);
    ctx.font = `900 182px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(String(data.homeScore ?? '-'), centerX, 468);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(headlineColor, 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(112, 506);
    ctx.lineTo(sidePanelWidth - 112, 506);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = headlineColor;
    ctx.font = `900 182px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(String(data.awayScore ?? '-'), centerX, 690);
    ctx.font = `800 30px ${FONT_BODY}`;
    ctx.fillText(data.awayTeam.toUpperCase(), centerX, 762);
    ctx.restore();

    drawOverflowCrest(ctx, {
        x: centerX,
        y: 842,
        width: 104,
        height: 104,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: true,
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 34px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText((data.mainTitle || getStatusLabel(data.status)).toUpperCase(), 38, canvas.height - 212);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.font = `700 16px ${FONT_BODY}`;
    const meta = [data.date, data.time, data.venue].filter(Boolean).join('  •  ');
    ctx.fillText(meta.toUpperCase(), 38, canvas.height - 176);
    ctx.restore();

    drawMomentumRepeatLabel(ctx, data.mainTitle || getStatusLabel(data.status), canvas.width - 18, photoY + 56, photoY + photoHeight - 56, headlineColor);
    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawMomentumMatchResult(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const homeLogo = await loadImage(data.homeLogo || '');
    const awayLogo = await loadImage(data.awayLogo || '');
    const background = await loadImage(data.backgroundImage || '');
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const supportColor = mixHexColors(accentColor, '#ef4444', 0.48);
    const isTallStory = format.height >= 1600;
    const photoY = isTallStory ? 164 : 144;
    const photoHeight = isTallStory ? 590 : 380;

    drawMomentumBackdrop(ctx, canvas, accentColor, bgColor);
    drawMomentumImageCover(ctx, background, 62, photoY, canvas.width - 124, photoHeight, 44, 'rgba(0,0,0,0.28)');

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.roundRect(62, photoY, canvas.width - 124, photoHeight, 44);
    ctx.fill();
    ctx.restore();

    if (tournamentLogo) {
        drawLogoBadge(ctx, { x: 88, y: 88, size: 54, img: tournamentLogo, label: data.tournament || 'Torneo', rawLogo: data.tournamentLogo, isDark: true });
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 18px ${FONT_BODY}`;
    ctx.fillText((data.tournament || 'TORNEO').toUpperCase(), tournamentLogo ? 124 : 48, 96);
    ctx.restore();

    const heroTitle = (data.mainTitle || getStatusLabel(data.status)).toUpperCase();
    const heroTitleFontSize = getSharedFittedFontSize(
        ctx,
        [{ text: heroTitle, maxWidth: canvas.width - 180 }],
        '900',
        isTallStory ? 120 : 92,
        FONT_EDITORIAL_SCORE,
        isTallStory ? 74 : 58
    );
    const heroTitleTop = photoY + photoHeight + (isTallStory ? 8 : 6);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${heroTitleFontSize}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(truncateTextToWidth(ctx, heroTitle, canvas.width - 180), canvas.width / 2, heroTitleTop);
    ctx.restore();

    const isScheduled = data.status === 'scheduled';
    const scoreValue = isScheduled
        ? (data.time || '--:--')
        : `${data.homeScore ?? '-'} - ${data.awayScore ?? '-'}`;
    const scoreFontSize = isScheduled
        ? (isTallStory ? 156 : 124)
        : (isTallStory ? 188 : 154);
    const scoreFontFamily = isScheduled ? FONT_MONO : FONT_EDITORIAL_SCORE;
    const scoreTop = heroTitleTop + heroTitleFontSize - (isTallStory ? 4 : 6);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${scoreFontSize}px ${scoreFontFamily}`;
    ctx.fillText(scoreValue, canvas.width / 2, scoreTop);
    ctx.restore();

    const teamXInset = isTallStory ? 208 : 188;
    const crestSize = isTallStory ? 118 : 98;
    const crestCenterY = scoreTop + scoreFontSize * 0.49;
    const teamNameTop = offsetElementY('teamName', scoreTop + (isTallStory ? 10 : 8));
    const teamNameMaxWidth = isTallStory ? 248 : 224;
    const teamNameFontSize = getSharedFittedFontSize(
        ctx,
        [
            { text: data.homeTeam.trim().toUpperCase(), maxWidth: teamNameMaxWidth },
            { text: data.awayTeam.trim().toUpperCase(), maxWidth: teamNameMaxWidth },
        ],
        '800',
        scaleElementSize('teamName', isTallStory ? 30 : 24, isTallStory ? 30 : 24),
        FONT_BODY,
        18
    );

    drawOverflowCrest(ctx, {
        x: teamXInset,
        y: crestCenterY,
        width: crestSize,
        height: crestSize,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: true,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: canvas.width - teamXInset,
        y: crestCenterY,
        width: crestSize,
        height: crestSize,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: true,
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = getMutedColor(true, 0.82);
    ctx.font = `800 ${teamNameFontSize}px ${FONT_BODY}`;
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.toUpperCase(), teamNameMaxWidth), teamXInset, teamNameTop);
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.toUpperCase(), teamNameMaxWidth), canvas.width - teamXInset, teamNameTop);
    ctx.restore();

    const stats = data.stats.slice(0, 6);
    let columns = 3;
    if (stats.length <= 1) {
        columns = 1;
    } else if (stats.length === 2 || stats.length === 4) {
        columns = 2;
    }
    const rows = Math.ceil(Math.max(stats.length, 1) / columns);
    const gapX = isTallStory ? 18 : 14;
    const gapY = isTallStory ? 18 : 14;
    const gridSidePadding = isTallStory ? 84 : 108;
    const gridWidth = canvas.width - gridSidePadding * 2;
    const cardWidth = (gridWidth - gapX * Math.max(columns - 1, 0)) / columns;
    const metaY = canvas.height - (isTallStory ? 290 : 252);
    const legacyMetaY = metaY;
    const gridBottom = metaY - (isTallStory ? 58 : 48);
    const minGridTop = scoreTop + scoreFontSize + (isTallStory ? 18 : 12);
    const availableGridHeight = Math.max(
        (isTallStory ? 98 : 78) * rows + gapY * Math.max(rows - 1, 0),
        gridBottom - minGridTop
    );
    const cardHeight = Math.max(
        isTallStory ? 98 : 78,
        Math.min(isTallStory ? 120 : 94, Math.floor((availableGridHeight - gapY * Math.max(rows - 1, 0)) / rows))
    );
    const gridHeight = rows * cardHeight + gapY * Math.max(rows - 1, 0);
    const gridX = (canvas.width - gridWidth) / 2;
    const gridTop = gridBottom - gridHeight;
    if (stats.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = getMutedColor(true, 0.74);
        ctx.font = `700 ${isTallStory ? 24 : 20}px ${FONT_BODY}`;
        ctx.fillText('NO HAY ESTADISTICAS DISPONIBLES.', canvas.width / 2, (gridTop + gridBottom) / 2);
        ctx.restore();
    } else {
        stats.forEach((stat, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const x = gridX + column * (cardWidth + gapX);
            const y = gridTop + row * (cardHeight + gapY);
            const labelTop = y + (isTallStory ? 20 : 16);
            const valueTop = y + Math.max(42, cardHeight * 0.42);

            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.roundRect(x, y, cardWidth, cardHeight, 22);
            ctx.fill();
            ctx.strokeStyle = index === 0 ? hexToRGBA(accentColor, 0.6) : hexToRGBA(supportColor, 0.4);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${isTallStory ? 18 : 16}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, stat.label.toUpperCase(), cardWidth - 36), x + cardWidth / 2, labelTop);
            ctx.font = `900 ${isTallStory ? 38 : 32}px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(`${stat.home} - ${stat.away}`, x + cardWidth / 2, valueTop);
            ctx.restore();
        });
    }

    ctx.save();
    ctx.globalAlpha = 0;
    ctx.fillStyle = getMutedColor(true, 0.74);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 16px ${FONT_BODY}`;
    ctx.fillText([data.date, data.time, data.venue].filter(Boolean).join('  •  ').toUpperCase(), canvas.width / 2, canvas.height - 126);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.beginPath();
    ctx.roundRect(72, legacyMetaY - 10, canvas.width - 144, 38, 16);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = getMutedColor(true, 0.74);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 16px ${FONT_BODY}`;
    ctx.fillText([data.date, data.time, data.venue].filter(Boolean).join(' - ').toUpperCase(), canvas.width / 2, metaY);
    ctx.restore();

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawMomentumStandings(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isStory = format.height > format.width;
    const rows = slide.groups.flatMap((group) => group.rows);
    const [tournamentLogo, ...logos] = await Promise.all([loadImage(getTournamentLogoImageSource(data)), ...rows.map((row) => loadImage(row.teamLogo || ''))]);
    const legendItems = collectStandingsLegendEntries(rows, accentColor);
    const title = data.title?.trim() || 'Tabla de posiciones';
    const subtitle = buildStandingsSlideSubtitle(data.subtitle, slide);
    const sx = (value: number) => (value * canvas.width) / 1080;
    const sy = (value: number) => (value * canvas.height) / 1350;
    const sf = (value: number) => Math.round(Math.min(sx(value), sy(value)));
    const dense = slide.totalRows >= (isStory ? 16 : 14);
    const hasGroupLabels = slide.groups.some((group) => Boolean(formatStandingsGroupLabel(group)));
    const sidebarWidth = sx(isStory ? 224 : 194);
    const cardX = sx(isStory ? 168 : 190);
    const cardY = sy(isStory ? 54 : 40);
    const cardWidth = canvas.width - cardX - sx(38);
    const cardHeight = canvas.height - cardY - sy(128);
    const cardRight = cardX + cardWidth;
    const cardBottom = cardY + cardHeight;
    const innerLeft = cardX + sx(38);
    const innerRight = cardRight - sx(38);
    const playedX = innerRight - sx(202);
    const diffX = innerRight - sx(108);
    const pointsW = sx(dense ? 88 : 98);
    const pointsX = innerRight - pointsW;
    const legendLayout = buildStandingsLegendLayout(ctx, legendItems, cardWidth - sx(96), isStory);
    const groupLabelHeight = hasGroupLabels ? sy(dense ? 24 : 28) : 0;
    const groupLabelGap = hasGroupLabels ? sy(dense ? 10 : 12) : 0;
    const interGroupGap = hasGroupLabels ? sy(dense ? 8 : 10) : 0;
    const reservedGroupSpace = slide.groups.reduce((total, group, index) => !formatStandingsGroupLabel(group) ? total : total + groupLabelHeight + groupLabelGap + (index > 0 ? interGroupGap : 0), 0);
    const legendReserve = legendLayout.totalHeight > 0 ? legendLayout.totalHeight + sy(26) : 0;
    const rowsTop = cardY + sy(isStory ? 166 : 156);
    const availableRowsHeight = Math.max(sy(420), cardBottom - sy(34) - legendReserve - rowsTop - reservedGroupSpace);
    const baseRowHeight = availableRowsHeight / Math.max(rows.length, 1);
    const rowHeight = clampNumber(baseRowHeight, sy(24), sy(dense ? 50 : 56));
    const compactScale = clampNumber(rowHeight / sy(dense ? 42 : 46), 0.72, 1);
    const crestSize = sx((dense ? 34 : 38) * compactScale);
    const crestCenterX = innerLeft + sx(76);
    const teamTextX = crestCenterX + crestSize / 2 + sx(18);
    const teamTextMaxWidth = Math.max(sx(150), playedX - sx(42) - teamTextX);
    const teamFontSize = getSharedFittedFontSize(
        ctx,
        rows.map((row) => ({ text: row.team.trim().toUpperCase(), maxWidth: teamTextMaxWidth })),
        '900',
        sf((dense ? 26 : 30) * compactScale),
        FONT_BODY,
        sf(12),
    );
    const headerLabelFontSize = sf((dense ? 16 : 17) * compactScale);
    const rowPosFontSize = sf((dense ? 28 : 32) * compactScale);
    const rowStatFontSize = sf((dense ? 22 : 24) * compactScale);
    const pointsH = Math.max(sy(24), Math.min(rowHeight - sy(8), sy((dense ? 34 : 38) * compactScale)));
    const bgIsDark = getContrastColor(bgColor) === '#ffffff';
    const pageBase = mixHexColors(bgColor, '#ffffff', bgIsDark ? 0.08 : 0.16);
    const pageTopColor = mixHexColors(bgColor, accentColor, 0.12);
    const pageBottomColor = mixHexColors(bgColor, bgIsDark ? '#000000' : '#0f172a', bgIsDark ? 0.08 : 0.1);
    const tableSurfaceTop = mixHexColors(bgColor, '#ffffff', bgIsDark ? 0.9 : 0.72);
    const tableSurfaceBottom = mixHexColors(bgColor, '#ffffff', bgIsDark ? 0.96 : 0.82);
    const tableSurfaceLine = mixHexColors(bgColor, accentColor, 0.12);
    const ink = mixHexColors(bgColor, bgIsDark ? '#ffffff' : '#0f172a', bgIsDark ? 0.16 : 0.86);
    const mutedInk = hexToRGBA(ink, 0.62);
    const titleBlockFill = accentColor;
    const titleBlockText = mixHexColors(bgColor, getContrastColor(accentColor), 0.12);
    const titleBlockStroke = hexToRGBA(mixHexColors(accentColor, bgColor, 0.24), 0.82);
    const metaBlockText = accentColor;
    const cardStrokeColor = hexToRGBA(mixHexColors(bgColor, accentColor, 0.24), 0.74);
    const dividerColor = hexToRGBA(mixHexColors(bgColor, accentColor, 0.18), 0.42);
    const sidebarTop = mixHexColors(accentColor, '#ffffff', 0.1);
    const sidebarBottom = mixHexColors(accentColor, bgColor, 0.2);
    const sidebarText = getContrastColor(sidebarBottom);
    const sidebarMatch = title.match(/^(.+?)\s+(matchweek|jornada|fecha|round)\b/i);
    const sidebarLabel = (sidebarMatch?.[1] || title).trim();
    const sidebarMeta = sidebarMatch ? title.slice(sidebarLabel.length).trim() : subtitle;
    const metaRight = [slide.totalPages > 1 ? `${slide.pageNumber}/${slide.totalPages}` : '', subtitle.toUpperCase()].filter(Boolean).join('  •  ');
    const highlightColor = data.highlightColor?.trim() || mixHexColors('#ffffff', accentColor, 0.22);
    const normalizedHighlightTeam = data.highlightTeam?.trim().toLowerCase() || '';

    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, pageTopColor);
    bgGradient.addColorStop(0.52, pageBase);
    bgGradient.addColorStop(1, pageBottomColor);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = hexToRGBA(accentColor, 0.06);
    ctx.beginPath(); ctx.moveTo(sx(110), 0); ctx.lineTo(canvas.width, 0); ctx.lineTo(canvas.width, sy(362)); ctx.lineTo(sx(454), sy(212)); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx(-40), canvas.height); ctx.lineTo(sx(322), canvas.height); ctx.lineTo(0, canvas.height - sy(276)); ctx.closePath(); ctx.fill();

    const sidebarGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sidebarGradient.addColorStop(0, sidebarTop);
    sidebarGradient.addColorStop(0.62, accentColor);
    sidebarGradient.addColorStop(1, sidebarBottom);
    ctx.fillStyle = sidebarGradient;
    ctx.fillRect(0, 0, sidebarWidth, canvas.height);
    ctx.fillStyle = hexToRGBA('#ffffff', 0.12);
    ctx.beginPath(); ctx.moveTo(0, canvas.height - sy(368)); ctx.lineTo(sidebarWidth, canvas.height - sy(244)); ctx.lineTo(sidebarWidth, canvas.height); ctx.lineTo(0, canvas.height); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, sy(512)); ctx.lineTo(sidebarWidth, sy(660)); ctx.lineTo(sidebarWidth, sy(812)); ctx.lineTo(0, sy(684)); ctx.closePath(); ctx.fill();
    if (tournamentLogo) drawLogoBadge(ctx, { x: sidebarWidth / 2, y: sy(128), size: sx(84), img: tournamentLogo, label: title, rawLogo: data.tournamentLogo, isDark: sidebarText === '#ffffff' });
    ctx.save();
    ctx.translate(sidebarWidth / 2, canvas.height / 2 + sy(90));
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = sidebarText;
    setFittedFont(ctx, sidebarLabel.toUpperCase(), canvas.height - sy(360), '900', sf(80), FONT_BODY, sf(34));
    ctx.fillText(truncateTextToWidth(ctx, sidebarLabel.toUpperCase(), canvas.height - sy(360)), 0, 0);
    ctx.restore();
    if (sidebarMeta) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${sf(13)}px ${FONT_MONO}`;
        const safeMeta = truncateTextToWidth(ctx, sidebarMeta.toUpperCase(), sidebarWidth - sx(52));
        const width = Math.min(sidebarWidth - sx(36), ctx.measureText(safeMeta).width + sx(28));
        ctx.fillStyle = hexToRGBA(sidebarText === '#ffffff' ? '#ffffff' : ink, 0.16);
        ctx.strokeStyle = hexToRGBA(sidebarText === '#ffffff' ? '#ffffff' : ink, 0.28);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sidebarWidth / 2 - width / 2, canvas.height - sy(170), width, sy(34), 999);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = sidebarText;
        ctx.fillText(safeMeta, sidebarWidth / 2, canvas.height - sy(153));
        ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = bgIsDark ? 'rgba(0,0,0,0.22)' : 'rgba(15,23,42,0.12)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = tableSurfaceBottom;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, sf(36));
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardWidth, cardHeight, sf(36)); ctx.clip();
    const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardBottom);
    cardGradient.addColorStop(0, tableSurfaceTop);
    cardGradient.addColorStop(0.5, tableSurfaceBottom);
    cardGradient.addColorStop(1, tableSurfaceTop);
    ctx.fillStyle = cardGradient;
    ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
    ctx.fillStyle = hexToRGBA(tableSurfaceLine, 0.18);
    ctx.beginPath(); ctx.moveTo(cardX + sx(380), cardY); ctx.lineTo(cardRight, cardY); ctx.lineTo(cardRight, cardY + sy(314)); ctx.lineTo(cardX + sx(520), cardY + sy(162)); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = cardStrokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardWidth, cardHeight, sf(36)); ctx.stroke();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${headerLabelFontSize}px ${FONT_BODY}`;
    const metaMeasureWidth = metaRight
        ? (() => {
            ctx.font = `700 ${sf(14)}px ${FONT_MONO}`;
            return Math.min(cardWidth * 0.42, ctx.measureText(metaRight).width + sx(16));
        })()
        : 0;
    ctx.font = `800 ${headerLabelFontSize}px ${FONT_BODY}`;
    const titleMaxWidth = Math.max(sx(180), cardWidth - sx(84) - metaMeasureWidth);
    const safeTitle = truncateTextToWidth(ctx, title.toUpperCase(), titleMaxWidth - sx(32));
    const titleWidth = Math.min(titleMaxWidth, ctx.measureText(safeTitle).width + sx(32));
    ctx.fillStyle = titleBlockFill;
    ctx.strokeStyle = titleBlockStroke;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(innerLeft, cardY + sy(33), titleWidth, sy(34), 999); ctx.fill(); ctx.stroke();
    ctx.fillStyle = titleBlockText;
    ctx.fillText(safeTitle, innerLeft + sx(16), cardY + sy(50));
    ctx.restore();
    if (metaRight) {
        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = metaBlockText;
        ctx.font = `700 ${sf(14 * compactScale)}px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, metaRight, Math.max(sx(120), cardWidth - titleWidth - sx(110))), innerRight, cardY + sy(50));
        ctx.restore();
    }
    ctx.strokeStyle = dividerColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(innerLeft, cardY + sy(144)); ctx.lineTo(innerRight, cardY + sy(144)); ctx.stroke();
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = mutedInk;
    ctx.font = `800 ${headerLabelFontSize}px ${FONT_BODY}`;
    ctx.fillText('POS', innerLeft + sx(12), cardY + sy(126));
    ctx.fillText('CLUB', teamTextX, cardY + sy(126));
    ctx.textAlign = 'right';
    ctx.fillText((data.columnLabels?.played?.trim() || 'P').toUpperCase(), playedX, cardY + sy(126));
    ctx.fillText((data.columnLabels?.diff?.trim() || 'GD').toUpperCase(), diffX, cardY + sy(126));
    ctx.fillText((data.columnLabels?.points?.trim() || 'POINTS').toUpperCase(), innerRight, cardY + sy(126));
    ctx.restore();

    let cursorY = rowsTop;
    let flatIndex = 0;
    let logoIndex = 0;
    slide.groups.forEach((group, groupIndex) => {
        const label = formatStandingsGroupLabel(group);
        if (label) {
            if (groupIndex > 0) cursorY += interGroupGap;
            ctx.save();
            ctx.fillStyle = hexToRGBA(accentColor, 0.12);
            ctx.strokeStyle = hexToRGBA(accentColor, 0.28);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(innerLeft, cursorY, Math.min(sx(260), cardWidth * 0.36), groupLabelHeight, 999); ctx.fill(); ctx.stroke();
            ctx.fillStyle = mixHexColors(ink, accentColor, 0.42);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${sf((dense ? 12 : 13) * compactScale)}px ${FONT_MONO}`;
            ctx.fillText(label.toUpperCase(), innerLeft + sx(14), cursorY + groupLabelHeight / 2 + 1);
            ctx.restore();
            cursorY += groupLabelHeight + groupLabelGap;
        }
        group.rows.forEach((row, rowIndex) => {
            const y = cursorY;
            const centerY = y + rowHeight / 2;
            const logo = logos[logoIndex] || null;
            logoIndex += 1;
            const rowLabel = row.labelName?.trim();
            const rowAccent = row.zoneColor || accentColor;
            const isHighlighted = (normalizedHighlightTeam && row.team.trim().toLowerCase() === normalizedHighlightTeam) || (typeof data.highlightPosition === 'number' && row.pos === data.highlightPosition);
            const rowFill = isHighlighted ? hexToRGBA(highlightColor, 0.18) : flatIndex % 2 === 0 ? 'rgba(255,255,255,0)' : hexToRGBA(mixHexColors(bgColor, '#ffffff', bgIsDark ? 0.84 : 0.62), 0.56);
            const diffText = data.plainDiff ? String(row.diff).trim() || '-' : formatDiff(row.diff);
            if (rowFill !== 'rgba(255,255,255,0)') {
                ctx.fillStyle = rowFill;
                ctx.strokeStyle = isHighlighted ? hexToRGBA(highlightColor, 0.5) : 'rgba(0,0,0,0)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(innerLeft - sx(8), y + sy(3), innerRight - innerLeft + sx(16), rowHeight - sy(6), sf(18 * compactScale)); ctx.fill();
                if (isHighlighted) ctx.stroke();
            }
            if (rowLabel) {
                ctx.fillStyle = hexToRGBA(rowAccent, 0.92);
                ctx.beginPath(); ctx.roundRect(innerLeft - sx(16), y + Math.max(sy(5), rowHeight * 0.16), sx(6), Math.max(sy(10), rowHeight - Math.max(sy(10), rowHeight * 0.32)), 999); ctx.fill();
            }
            if (!(groupIndex === slide.groups.length - 1 && rowIndex === group.rows.length - 1)) {
                ctx.strokeStyle = dividerColor;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(innerLeft, y + rowHeight + 0.5); ctx.lineTo(innerRight, y + rowHeight + 0.5); ctx.stroke();
            }
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ink;
            ctx.font = `900 ${rowPosFontSize}px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(String(row.pos), innerLeft + sx(12), centerY + sf(2));
            ctx.restore();
            drawOverflowCrest(ctx, { x: crestCenterX, y: centerY, width: crestSize, height: crestSize, img: logo, label: row.team, rawLogo: row.teamLogo, isDark: false, showFrame: false });
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ink;
            ctx.font = `900 ${teamFontSize}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, row.team.toUpperCase(), teamTextMaxWidth), teamTextX, rowLabel ? y + rowHeight * 0.38 : centerY + 1);
            if (rowLabel) drawStandingsLabelPill(ctx, teamTextX, y + rowHeight * 0.72, rowLabel, rowAccent, false, rowHeight, Math.min(teamTextMaxWidth, sx(188)));
            ctx.restore();
            ctx.save();
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${rowStatFontSize}px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillStyle = ink;
            ctx.fillText(String(row.played ?? '-'), playedX, centerY + 1);
            ctx.fillStyle = diffText.startsWith('+') ? mixHexColors(ink, accentColor, 0.54) : ink;
            ctx.fillText(diffText, diffX, centerY + 1);
            ctx.restore();
            ctx.fillStyle = isHighlighted ? highlightColor : accentColor;
            ctx.beginPath(); ctx.roundRect(pointsX, centerY - pointsH / 2, pointsW, pointsH, 999); ctx.fill();
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = getContrastColor(isHighlighted ? highlightColor : accentColor);
            ctx.font = `900 ${rowStatFontSize}px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(String(row.points ?? '-'), pointsX + pointsW / 2, centerY + 1);
            ctx.restore();
            cursorY += rowHeight;
            flatIndex += 1;
        });
    });

    if (legendLayout.totalHeight > 0) drawStandingsLegend(ctx, innerLeft, cardBottom - legendLayout.totalHeight - sy(28), innerRight - innerLeft, legendItems, false, isStory);
    drawPoweredByFooter(ctx, canvas, brandLogo, false, accentColor);
}

async function drawMomentumDailyMatches(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    timeMode: DailyMatchesTimeMode = 'time'
) {
    void format;
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const matches = data.matches.slice(0, 10);
    const logos = await Promise.all(
        matches.flatMap((match) => [loadImage(match.homeLogo || ''), loadImage(match.awayLogo || '')]),
    );
    const panelX = 72;
    const panelY = 160;
    const panelWidth = canvas.width - 536;
    const listWidth = panelWidth - 24;
    const heroTitle = getMomentumDailyMatchesHeroTitle(matches).toUpperCase();
    const heroTitleColor = mixHexColors('#f3dfbb', accentColor, 0.22);
    const heroTitleFontSize = getSharedFittedFontSize(
        ctx,
        [{ text: heroTitle, maxWidth: 402 }],
        '900',
        122,
        FONT_EDITORIAL_SCORE,
        84
    );
    const heroTitleTop = canvas.height - 262;
    const scoreLabels = matches.map((match) => (
        match.status === 'scheduled'
            ? getScheduledMatchLabel(match, timeMode)
            : `${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}`
    ));
    const scoreFontSize = 46;

    ctx.save();
    ctx.font = `900 ${scoreFontSize}px ${FONT_EDITORIAL_SCORE}`;
    const scoreBlockWidth = Math.max(118, ...scoreLabels.map((label) => ctx.measureText(label).width));
    ctx.restore();

    const scoreRightX = panelX + listWidth - 22;
    const scoreLeftX = scoreRightX - scoreBlockWidth;
    const teamTextX = panelX + 198;
    const teamTextMaxWidth = Math.max(136, scoreLeftX - teamTextX - 26);
    const teamNameFontSize = getSharedFittedFontSize(
        ctx,
        matches.flatMap((match) => ([
            { text: match.homeTeam.toUpperCase(), maxWidth: teamTextMaxWidth },
            { text: match.awayTeam.toUpperCase(), maxWidth: teamTextMaxWidth },
        ])),
        '800',
        26,
        FONT_BODY,
        14
    );

    drawMomentumBackdrop(ctx, canvas, accentColor, bgColor);

    if (tournamentLogo) {
        drawNeutralizedBackdropMark(ctx, tournamentLogo, canvas.width - 96, canvas.height - 78, 112, 112, '#7c8590', 0.06);
    }

    const brandStage = ctx.createRadialGradient(canvas.width - 188, canvas.height - 276, 0, canvas.width - 188, canvas.height - 276, 278);
    brandStage.addColorStop(0, 'rgba(0,0,0,0.34)');
    brandStage.addColorStop(0.52, 'rgba(0,0,0,0.14)');
    brandStage.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.fillStyle = brandStage;
    ctx.fillRect(canvas.width - 496, canvas.height - 570, 496, 570);
    ctx.restore();

    if (tournamentLogo) {
        drawEditorialCrestStroke(
            ctx,
            canvas.width - 176,
            canvas.height / 2 + 36,
            244,
            244,
            tournamentLogo,
            6,
            'rgba(255,255,255,0.16)'
        );

        ctx.save();
        ctx.globalAlpha = 0.88;
        drawOverflowCrest(ctx, {
            x: canvas.width - 176,
            y: canvas.height / 2 + 36,
            width: 232,
            height: 232,
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: true,
            showFrame: false,
        });
        ctx.restore();
    }

    ctx.save();
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = getMutedColor(true, 0.78);
    ctx.textAlign = 'right';
    ctx.font = `700 18px ${FONT_BODY}`;
    ctx.fillText((data.tournament || 'TORNEO').toUpperCase(), canvas.width - 72, heroTitleTop - 16);
    ctx.restore();

    drawMomentumKicker(ctx, 56, 74, data.date || 'Fecha', getMutedColor(true, 0.76));

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.46)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = heroTitleColor;
    ctx.font = `900 ${heroTitleFontSize}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(truncateTextToWidth(ctx, heroTitle, 402), canvas.width - 72, heroTitleTop);
    ctx.restore();

    const densityMode = resolveDensityMode(matches.length, 7, 9);
    const rowGap = getDensitySpacing(densityMode, {
        comfortable: 10,
        compact: 8,
        ultraCompact: 6,
    });
    const rowHeight = Math.min(
        getDensitySpacing(densityMode, {
            comfortable: 96,
            compact: 90,
            ultraCompact: 84,
        }),
        (canvas.height - panelY - 244 - rowGap * Math.max(matches.length - 1, 0)) / Math.max(matches.length, 1),
    );
    let logoIndex = 0;

    matches.forEach((match, index) => {
        const y = panelY + index * (rowHeight + rowGap);
        const homeLogo = logos[logoIndex] || null;
        const awayLogo = logos[logoIndex + 1] || null;
        logoIndex += 2;
        const statusColor = match.status === 'live'
            ? mixHexColors(accentColor, '#fb7185', 0.46)
            : match.status === 'finished'
                ? mixHexColors(accentColor, '#f59e0b', 0.24)
                : accentColor;
        const homeLineY = y + rowHeight * 0.32;
        const awayLineY = y + rowHeight * 0.74;
        const scoreLabel = match.status === 'scheduled'
            ? getScheduledMatchLabel(match, timeMode)
            : `${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}`;
        const crestSize = 30;

        ctx.save();
        ctx.fillStyle = 'rgba(8,8,10,0.72)';
        ctx.strokeStyle = hexToRGBA(statusColor, 0.72);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(panelX, y, listWidth, rowHeight, 26);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = hexToRGBA(statusColor, 0.16);
        ctx.beginPath();
        ctx.roundRect(panelX + 12, y + 14, 112, rowHeight - 28, 18);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 15px ${FONT_MONO}`;
        // La capsula de la izquierda es la fecha; solo cae al horario cuando no hay fecha,
        // y en modo VS ese fallback tambien tiene que dejar la hora afuera.
        const chipLabel = match.dateLabel
            || (match.status === 'scheduled' ? getScheduledMatchLabel(match, timeMode) : (match.time || '--:--'));
        ctx.fillText(chipLabel.toUpperCase(), panelX + 68, y + rowHeight / 2 + 6);
        ctx.restore();

        drawOverflowCrest(ctx, {
            x: panelX + 168,
            y: homeLineY - 2,
            width: crestSize,
            height: crestSize,
            img: homeLogo,
            label: match.homeTeam,
            rawLogo: match.homeLogo,
            isDark: true,
            showFrame: false,
        });
        drawOverflowCrest(ctx, {
            x: panelX + 168,
            y: awayLineY - 2,
            width: crestSize,
            height: crestSize,
            img: awayLogo,
            label: match.awayTeam,
            rawLogo: match.awayLogo,
            isDark: true,
            showFrame: false,
        });

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${teamNameFontSize}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, match.homeTeam.toUpperCase(), teamTextMaxWidth), teamTextX, homeLineY);
        ctx.fillText(truncateTextToWidth(ctx, match.awayTeam.toUpperCase(), teamTextMaxWidth), teamTextX, awayLineY);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${scoreFontSize}px ${FONT_EDITORIAL_SCORE}`;
        ctx.fillText(scoreLabel, scoreRightX, y + rowHeight / 2 + 6);
        ctx.restore();
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawMomentumLineups(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    mode: LineupExportMode
) {
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const homeLogo = await loadImage(data.homeTeam.logo || '');
    const awayLogo = await loadImage(data.awayTeam.logo || '');
    const isStory = format.height > format.width;
    const teams = mode === 'both'
        ? [
            { team: data.homeTeam, logo: homeLogo },
            { team: data.awayTeam, logo: awayLogo },
        ]
        : mode === 'home'
            ? [{ team: data.homeTeam, logo: homeLogo }]
            : [{ team: data.awayTeam, logo: awayLogo }];
    const highestRating = computeHighestLineupRating(teams.map((entry) => entry.team));

    drawMomentumBackdrop(ctx, canvas, accentColor, bgColor);

    if (tournamentLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width / 2,
            y: 92,
            size: 72,
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: true,
        });
    }

    drawMomentumKicker(ctx, canvas.width / 2, 156, data.tournament || 'Torneo', getMutedColor(true, 0.76), 'center');
    drawMomentumHeroTitle(ctx, data.title || 'Alineaciones', canvas.width / 2, 234, canvas.width - 180, 88, '#ffffff', 'center');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = getMutedColor(true, 0.74);
    ctx.font = `700 18px ${FONT_BODY}`;
    ctx.fillText([data.subtitle, data.date, data.time, data.venue].filter(Boolean).join('  •  ').toUpperCase(), canvas.width / 2, 270);
    ctx.restore();

    const columnGap = teams.length === 2 ? 26 : 0;
    const columnWidth = teams.length === 2 ? (canvas.width - 132 - columnGap) / 2 : canvas.width - 132;
    const columnXStart = teams.length === 2 ? 54 : 66;
    const columnY = 324;
    const columnHeight = canvas.height - columnY - (isStory ? 236 : 178);

    // La planilla entera, sin recortes. Un amistoso de pretemporada trae 30 o 35
    // fichas y antes la placa se quedaba con 15 titulares y 8 suplentes: el
    // resto no existia. Ahora la columna se comprime hasta que entran todos.
    const teamSplits = teams.map(({ team }) => {
        const teamPlayers = [...(team.starters ?? [])].sort((left, right) => Number(left.number ?? 0) - Number(right.number ?? 0));
        return {
            starters: teamPlayers.filter((player, playerIndex) => isLineupStarter(player, playerIndex)),
            bench: teamPlayers.filter((player, playerIndex) => !isLineupStarter(player, playerIndex)),
        };
    });
    const maxStarterRows = Math.max(...teamSplits.map((split) => split.starters.length), 0);
    const maxBenchRows = Math.max(...teamSplits.map((split) => split.bench.length), 0);
    // Las dos columnas se miden juntas y contra la mas larga: si cada una se
    // ajustara sola, un plantel de 35 quedaria al lado de uno de 23 con dos
    // cuerpos de letra distintos.
    const densityMode = resolveDensityMode(maxStarterRows + maxBenchRows, teams.length === 2 ? 19 : 21, teams.length === 2 ? 22 : 23);
    const starterGap = getDensitySpacing(densityMode, {
        comfortable: teams.length === 2 ? 8 : 7,
        compact: teams.length === 2 ? 7 : 6,
        ultraCompact: teams.length === 2 ? 6 : 5,
    });
    const benchGap = getDensitySpacing(densityMode, {
        comfortable: 5,
        compact: 4,
        ultraCompact: 3,
    });
    const starterRowHeight = getDensitySpacing(densityMode, {
        comfortable: teams.length === 2 ? 36 : 34,
        compact: teams.length === 2 ? 34 : 32,
        ultraCompact: teams.length === 2 ? 32 : 30,
    });
    const benchRowHeight = getDensitySpacing(densityMode, {
        comfortable: teams.length === 2 ? 28 : 26,
        compact: teams.length === 2 ? 26 : 24,
        ultraCompact: teams.length === 2 ? 24 : 22,
    });
    const baseHeaderHeight = isStory ? 124 : 116;
    const baseBottomPadding = isStory ? 34 : 20;
    // El alto se mide con los pisos ya aplicados, no con la cuenta ideal: si se
    // estimara sin ellos, la escala diria que entra y la lista se pasaria igual.
    const measureColumn = (scale: number) => {
        const scaledHeaderHeight = Math.max(96, Math.round(baseHeaderHeight * scale));
        const scaledContentTopPadding = Math.max(98, scaledHeaderHeight);
        const scaledStarterGapValue = Math.max(2, Math.round(starterGap * scale));
        const scaledBenchGapValue = Math.max(2, Math.round(benchGap * scale));
        const scaledStarterRowHeightValue = Math.max(16, Math.round(starterRowHeight * scale));
        const scaledBenchRowHeightValue = Math.max(13, Math.round(benchRowHeight * scale));
        const scaledBenchSectionHeight = maxBenchRows > 0 ? Math.max(24, Math.round(40 * scale)) : 0;
        const scaledBenchHeaderGap = Math.max(6, Math.round(8 * scale));
        const startersHeight = maxStarterRows > 0
            ? maxStarterRows * scaledStarterRowHeightValue + Math.max(0, maxStarterRows - 1) * scaledStarterGapValue
            : 0;
        const benchHeight = maxBenchRows > 0
            ? maxBenchRows * scaledBenchRowHeightValue + Math.max(0, maxBenchRows - 1) * scaledBenchGapValue
            : 0;
        const total = scaledContentTopPadding
            + startersHeight
            + (maxBenchRows > 0 ? scaledBenchHeaderGap + scaledBenchSectionHeight + benchHeight : 0)
            + Math.round(baseBottomPadding * scale);

        return {
            headerHeight: scaledHeaderHeight,
            contentTopPadding: scaledContentTopPadding,
            scaledStarterGap: scaledStarterGapValue,
            scaledBenchGap: scaledBenchGapValue,
            scaledStarterRowHeight: scaledStarterRowHeightValue,
            scaledBenchRowHeight: scaledBenchRowHeightValue,
            benchSectionHeight: scaledBenchSectionHeight,
            benchHeaderGap: scaledBenchHeaderGap,
            total,
        };
    };

    let layoutScale = 1;
    let columnLayout = measureColumn(layoutScale);
    while (columnLayout.total > columnHeight && layoutScale > 0.4) {
        layoutScale = Math.max(0.4, Math.round((layoutScale - 0.02) * 100) / 100);
        columnLayout = measureColumn(layoutScale);
    }

    const {
        headerHeight,
        contentTopPadding,
        scaledStarterGap,
        scaledBenchGap,
        scaledStarterRowHeight,
        scaledBenchRowHeight,
        benchSectionHeight,
        benchHeaderGap,
    } = columnLayout;
    // El cuerpo de texto acompana la compresion; 0,68 es el piso por debajo del
    // cual el nombre deja de leerse en la placa.
    const rowFontScale = Math.max(layoutScale, 0.68);
    const listStartY = columnY + contentTopPadding;
    const logoY = columnY + Math.round(contentTopPadding * 0.5);
    const titleY = columnY + Math.round(contentTopPadding * 0.57);
    const subtitleY = columnY + Math.round(contentTopPadding * 0.79);
    const teamTitleMaxWidth = columnWidth - 136;
    const logoSize = Math.max(46, Math.round(54 * Math.max(layoutScale, 0.84)));
    const titleFontSize = Math.max(20, Math.round(30 * Math.max(layoutScale, 0.82)));
    const subtitleFontSize = Math.max(11, Math.round(14 * Math.max(layoutScale, 0.82)));
    const starterNumberFontSize = Math.max(10, Math.round((teams.length === 2 ? 14 : 13) * rowFontScale));
    const starterNameFontSize = Math.max(10, Math.round((teams.length === 2 ? 16 : 15) * rowFontScale));
    const benchNumberFontSize = Math.max(9, Math.round(12 * rowFontScale));
    const benchNameFontSize = Math.max(9, Math.round(14 * rowFontScale));

    teams.forEach(({ team, logo }, index) => {
        const x = columnXStart + index * (columnWidth + columnGap);
        const { starters, bench } = teamSplits[index];
        const starterRowsBlockHeight = starters.length > 0
            ? starters.length * scaledStarterRowHeight + Math.max(0, starters.length - 1) * scaledStarterGap
            : 0;
        const benchHeaderY = listStartY + starterRowsBlockHeight + benchHeaderGap;
        const accent = index === 0 ? accentColor : mixHexColors(accentColor, '#38bdf8', 0.5);

        ctx.save();
        ctx.fillStyle = 'rgba(8,8,10,0.74)';
        ctx.strokeStyle = hexToRGBA(accent, 0.82);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, columnY, columnWidth, columnHeight, 34);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        drawLogoBadge(ctx, { x: x + 58, y: logoY, size: logoSize, img: logo, label: team.name, rawLogo: team.logo, isDark: true });

        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        setFittedFont(ctx, team.name.toUpperCase(), teamTitleMaxWidth, '900', titleFontSize, FONT_BODY, 18);
        ctx.fillText(truncateTextToWidth(ctx, team.name.toUpperCase(), teamTitleMaxWidth), x + 96, titleY);
        ctx.fillStyle = getMutedColor(true, 0.72);
        ctx.font = `700 ${subtitleFontSize}px ${FONT_MONO}`;
        ctx.fillText(
            truncateTextToWidth(ctx, (team.lineupLabel || 'Titulares y suplentes').toUpperCase(), teamTitleMaxWidth),
            x + 96,
            subtitleY
        );
        ctx.restore();

        const hasAnyRating = highestRating != null;
        const ratingColumnWidth = hasAnyRating ? 84 : 0;
        const ratingRightInset = 22;
        const starterNameMaxWidth = (columnWidth - 156) - ratingColumnWidth;
        const benchNameMaxWidth = (columnWidth - 152) - ratingColumnWidth;
        starters.forEach((player, playerIndex) => {
            const y = listStartY + playerIndex * (scaledStarterRowHeight + scaledStarterGap);
            const numberLabel = String(player.number ?? playerIndex + 1).padStart(2, '0');
            const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();
            const numberChipHeight = Math.max(16, scaledStarterRowHeight - Math.max(10, Math.round(16 * layoutScale)));
            const numberChipY = y + Math.round((scaledStarterRowHeight - numberChipHeight) / 2);
            ctx.save();
            ctx.fillStyle = playerIndex % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)';
            ctx.beginPath();
            ctx.roundRect(x + 14, y, columnWidth - 28, scaledStarterRowHeight, Math.max(14, Math.round(18 * layoutScale)));
            ctx.fill();
            ctx.fillStyle = hexToRGBA(accent, 0.14);
            ctx.beginPath();
            ctx.roundRect(x + 24, numberChipY, 54, numberChipHeight, Math.max(10, Math.round(14 * layoutScale)));
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${starterNumberFontSize}px ${FONT_MONO}`;
            ctx.fillText(numberLabel, x + 51, y + scaledStarterRowHeight / 2 + 4);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffffff';
            setFittedFont(ctx, playerLabel, starterNameMaxWidth, '800', starterNameFontSize, FONT_BODY, 10);
            ctx.fillText(truncateTextToWidth(ctx, playerLabel, starterNameMaxWidth), x + 94, y + scaledStarterRowHeight / 2 + 5);

            if (hasAnyRating) {
                const ratingLabel = formatLineupExportRating(player.rating);
                if (ratingLabel) {
                    const ratingValue = getLineupExportRatingValue(player.rating);
                    const isTopRated = ratingValue != null && highestRating != null && ratingValue === highestRating;
                    ctx.textAlign = 'right';
                    ctx.fillStyle = isTopRated ? '#facc15' : accent;
                    ctx.font = `800 ${starterNameFontSize}px ${FONT_MONO}`;
                    const display = isTopRated ? `${ratingLabel} ★` : ratingLabel;
                    ctx.fillText(display, x + columnWidth - ratingRightInset, y + scaledStarterRowHeight / 2 + 5);
                }
            }
            ctx.restore();
        });

        if (bench.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const dividerY = benchHeaderY + Math.round(benchSectionHeight * 0.38);
            ctx.moveTo(x + 18, dividerY);
            ctx.lineTo(x + columnWidth * 0.34, dividerY);
            ctx.moveTo(x + columnWidth * 0.66, dividerY);
            ctx.lineTo(x + columnWidth - 18, dividerY);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = getMutedColor(true, 0.76);
            ctx.font = `800 ${Math.max(10, Math.round(12 * Math.max(layoutScale, 0.82)))}px ${FONT_BODY}`;
            ctx.fillText('SUPLENTES', x + columnWidth / 2, benchHeaderY + Math.round(benchSectionHeight * 0.58));
            ctx.restore();

            bench.forEach((player, benchIndex) => {
                const y = benchHeaderY + benchSectionHeight + benchIndex * (scaledBenchRowHeight + scaledBenchGap);
                const numberLabel = String(player.number ?? starters.length + benchIndex + 1).padStart(2, '0');
                const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();
                const numberChipHeight = Math.max(14, scaledBenchRowHeight - Math.max(8, Math.round(12 * layoutScale)));
                const numberChipY = y + Math.round((scaledBenchRowHeight - numberChipHeight) / 2);
                ctx.save();
                ctx.globalAlpha = 0.86;
                ctx.fillStyle = benchIndex % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
                ctx.beginPath();
                ctx.roundRect(x + 14, y, columnWidth - 28, scaledBenchRowHeight, Math.max(12, Math.round(16 * layoutScale)));
                ctx.fill();
                ctx.fillStyle = hexToRGBA(accent, 0.12);
                ctx.beginPath();
                ctx.roundRect(x + 24, numberChipY, 50, numberChipHeight, Math.max(9, Math.round(12 * layoutScale)));
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffffff';
                ctx.font = `800 ${benchNumberFontSize}px ${FONT_MONO}`;
                ctx.fillText(numberLabel, x + 49, y + scaledBenchRowHeight / 2 + 4);
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                setFittedFont(ctx, playerLabel, benchNameMaxWidth, '800', benchNameFontSize, FONT_BODY, 10);
                ctx.fillText(truncateTextToWidth(ctx, playerLabel, benchNameMaxWidth), x + 88, y + scaledBenchRowHeight / 2 + 4);

                if (hasAnyRating) {
                    const ratingLabel = formatLineupExportRating(player.rating);
                    if (ratingLabel) {
                        const ratingValue = getLineupExportRatingValue(player.rating);
                        const isTopRated = ratingValue != null && highestRating != null && ratingValue === highestRating;
                        ctx.textAlign = 'right';
                        ctx.fillStyle = isTopRated ? '#facc15' : accent;
                        ctx.font = `800 ${benchNameFontSize}px ${FONT_MONO}`;
                        const display = isTopRated ? `${ratingLabel} ★` : ratingLabel;
                        ctx.fillText(display, x + columnWidth - ratingRightInset, y + scaledBenchRowHeight / 2 + 4);
                    }
                }
                ctx.restore();
            });
        }
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawMomentumPlayoffBracket(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: PlayoffBracketData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const rounds = Array.isArray(data.rounds) ? data.rounds.filter((round) => round.matches?.length) : [];
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const logos = await Promise.all(
        rounds.flatMap((round) =>
            round.matches.flatMap((match) => [
                loadImage(getBracketParticipantLogo(match.home_team || null, match.home_participant || null)),
                loadImage(getBracketParticipantLogo(match.away_team || null, match.away_participant || null)),
            ]),
        ),
    );

    drawMomentumBackdrop(ctx, canvas, accentColor, bgColor);
    drawMomentumHeroTitle(ctx, data.title || 'Playoff', canvas.width / 2, 128, canvas.width - 160, 84, '#ffffff', 'center');
    if (data.subtitle) {
        drawMomentumKicker(ctx, canvas.width / 2, 164, data.subtitle, getMutedColor(true, 0.72), 'center');
    }
    if (tournamentLogo) {
        drawLogoBadge(ctx, { x: 90, y: 92, size: 56, img: tournamentLogo, label: data.title, rawLogo: data.tournamentLogo, isDark: true });
    }

    if (!rounds.length) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `700 24px ${FONT_BODY}`;
        ctx.fillText('No hay cruces cargados para exportar.', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        drawBrandFooter(ctx, canvas, brandLogo, true);
        return;
    }

    const columnGap = 18;
    const columnWidth = (canvas.width - 112 - columnGap * Math.max(rounds.length - 1, 0)) / rounds.length;
    const top = 220;
    const usableHeight = canvas.height - top - 176;
    let logoIndex = 0;

    rounds.forEach((round, roundIndex) => {
        const x = 56 + roundIndex * (columnWidth + columnGap);
        const titleHeight = 42;
        const gap = 16;
        const matchHeight = Math.min(126, (usableHeight - titleHeight - 18 - gap * Math.max(round.matches.length - 1, 0)) / Math.max(round.matches.length, 1));

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(x, top, columnWidth, titleHeight, 999);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `800 16px ${FONT_BODY}`;
        ctx.fillText(getBracketRoundName(round, roundIndex).toUpperCase(), x + columnWidth / 2, top + 27);
        ctx.restore();

        round.matches.forEach((match, matchIndex) => {
            const y = top + titleHeight + 18 + matchIndex * (matchHeight + gap);
            const homeName = getBracketParticipantName(match.home_team || null, match.home_participant || null);
            const awayName = getBracketParticipantName(match.away_team || null, match.away_participant || null);
            const homeLogo = logos[logoIndex] || null;
            const awayLogo = logos[logoIndex + 1] || null;
            logoIndex += 2;

            ctx.save();
            ctx.fillStyle = 'rgba(9,9,12,0.74)';
            ctx.strokeStyle = hexToRGBA(accentColor, 0.56);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, y, columnWidth, matchHeight, 24);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            drawLogoBadge(ctx, { x: x + 28, y: y + 40, size: 28, img: homeLogo, label: homeName, rawLogo: getBracketParticipantLogo(match.home_team || null, match.home_participant || null), isDark: true, showFrame: false });
            drawLogoBadge(ctx, { x: x + 28, y: y + matchHeight - 40, size: 28, img: awayLogo, label: awayName, rawLogo: getBracketParticipantLogo(match.away_team || null, match.away_participant || null), isDark: true, showFrame: false });

            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            setFittedFont(ctx, homeName.toUpperCase(), columnWidth - 110, '800', 14, FONT_BODY, 10);
            ctx.fillText(homeName.toUpperCase(), x + 52, y + 46);
            setFittedFont(ctx, awayName.toUpperCase(), columnWidth - 110, '800', 14, FONT_BODY, 10);
            ctx.fillText(awayName.toUpperCase(), x + 52, y + matchHeight - 34);
            ctx.textAlign = 'right';
            ctx.font = `900 26px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(String(match.score_home ?? '-'), x + columnWidth - 20, y + 47);
            ctx.fillText(String(match.score_away ?? '-'), x + columnWidth - 20, y + matchHeight - 33);
            ctx.restore();
        });
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawMomentumPlayerStats(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: PlayerStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isStory = format.height > format.width;
    const photo = await loadImage(data.photo || '');
    const supportColor = mixHexColors(accentColor, '#eab308', 0.54);

    drawMomentumBackdrop(ctx, canvas, accentColor, bgColor);
    drawMomentumKicker(ctx, 60, 74, `${data.team} • ${data.position}`, getMutedColor(true, 0.72));
    drawMomentumHeroTitle(ctx, 'Jugador destacado', 60, 168, canvas.width - 120, isStory ? 102 : 94, '#f3dfbb');

    drawMomentumImageCover(ctx, photo, 58, 214, canvas.width - 116, canvas.height - 454, 44, 'rgba(0,0,0,0.18)');

    ctx.save();
    const photoShade = ctx.createLinearGradient(58, 214, 58, canvas.height - 240);
    photoShade.addColorStop(0, 'rgba(0,0,0,0.02)');
    photoShade.addColorStop(0.62, 'rgba(0,0,0,0.12)');
    photoShade.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = photoShade;
    ctx.beginPath();
    ctx.roundRect(58, 214, canvas.width - 116, canvas.height - 454, 44);
    ctx.fill();
    ctx.restore();

    drawMomentumHeroTitle(ctx, data.name, 76, canvas.height - 302, canvas.width - 152, isStory ? 112 : 96, '#ffffff');

    const stats = data.stats.slice(0, isStory ? 4 : 3);
    const cardWidth = (canvas.width - 144 - stats.length * 16) / Math.max(stats.length, 1);
    stats.forEach((stat, index) => {
        const x = 72 + index * (cardWidth + 16);
        const y = canvas.height - 258;
        const tone = stat.highlight ? supportColor : accentColor;

        ctx.save();
        ctx.fillStyle = 'rgba(8,8,10,0.82)';
        ctx.strokeStyle = hexToRGBA(tone, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, cardWidth, 112, 22);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = getMutedColor(true, 0.76);
        ctx.font = `700 14px ${FONT_BODY}`;
        ctx.fillText(stat.label.toUpperCase(), x + 18, y + 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 52px ${FONT_EDITORIAL_SCORE}`;
        ctx.fillText(String(stat.value), x + 18, y + 86);
        ctx.restore();
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

function drawPosterV3Backdrop(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    accentColor: string,
    bgColor: string
) {
    const palette = resolvePosterV3GradientPalette(bgColor, accentColor);
    const frameColor = getContrastColor(palette.base) === '#ffffff'
        ? hexToRGBA('#ffffff', 0.12)
        : hexToRGBA('#111827', 0.12);

    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const baseGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    baseGradient.addColorStop(0, palette.start);
    baseGradient.addColorStop(0.5, palette.mid);
    baseGradient.addColorStop(1, palette.end);
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < 6; index += 1) {
        const beamX = canvas.width * (0.08 + index * 0.16);
        const beamWidth = Math.max(48, canvas.width * 0.038);
        const beam = ctx.createLinearGradient(beamX, 0, beamX + beamWidth, 0);
        beam.addColorStop(0, 'rgba(255,255,255,0)');
        beam.addColorStop(0.4, hexToRGBA(index % 2 === 0 ? palette.accentPrimary : palette.accentSecondary, 0.14));
        beam.addColorStop(0.6, hexToRGBA(index % 2 === 0 ? palette.accentPrimary : palette.accentSecondary, 0.08));
        beam.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = beam;
        ctx.fillRect(beamX, 0, beamWidth, canvas.height);
    }

    const topGlow = ctx.createRadialGradient(canvas.width * 0.28, canvas.height * 0.08, 0, canvas.width * 0.28, canvas.height * 0.08, canvas.width * 0.6);
    topGlow.addColorStop(0, hexToRGBA(palette.accentPrimary, 0.22));
    topGlow.addColorStop(0.42, hexToRGBA(palette.accentPrimary, 0.05));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 1;
    for (let y = 0; y <= canvas.height; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = palette.accentPrimary;
    ctx.fillRect(0, 0, canvas.width, 4);
    ctx.fillRect(0, canvas.height - 4, canvas.width, 4);

    ctx.save();
    ctx.strokeStyle = hexToRGBA(palette.accentPrimary, 0.28);
    ctx.lineWidth = 2;
    [
        [[92, 52], [166, 34], [188, 112]],
        [[canvas.width - 250, 62], [canvas.width - 170, 28], [canvas.width - 126, 104]],
        [[canvas.width * 0.32, 70], [canvas.width * 0.4, 48], [canvas.width * 0.44, 122]],
    ].forEach((triangle) => {
        ctx.beginPath();
        ctx.moveTo(triangle[0][0], triangle[0][1]);
        ctx.lineTo(triangle[1][0], triangle[1][1]);
        ctx.lineTo(triangle[2][0], triangle[2][1]);
        ctx.closePath();
        ctx.stroke();
    });
    ctx.restore();
}

function resolvePosterV3GradientPalette(bgColor: string, accentColor: string) {
    const isDarkSurface = getContrastColor(bgColor) === '#ffffff';
    const base = bgColor;
    const start = isDarkSurface
        ? mixHexColors(bgColor, accentColor, 0.18)
        : mixHexColors(bgColor, accentColor, 0.08);
    const mid = isDarkSurface
        ? mixHexColors(bgColor, '#080808', 0.16)
        : mixHexColors(bgColor, '#ffffff', 0.04);
    const end = isDarkSurface
        ? mixHexColors(bgColor, '#000000', 0.3)
        : mixHexColors(bgColor, '#dfe3e8', 0.12);
    const accentPrimary = mixHexColors(accentColor, '#ffffff', isDarkSurface ? 0.12 : 0.22);
    const accentSecondary = mixHexColors(accentColor, bgColor, isDarkSurface ? 0.2 : 0.14);

    return {
        isDarkSurface,
        base,
        start,
        mid,
        end,
        accentPrimary,
        accentSecondary,
    };
}

function drawPosterV3Kicker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
    align: CanvasTextAlign = 'left'
) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.font = `800 16px ${FONT_MONO}`;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.restore();
}

function drawPosterV3OutlineTitle(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left'
) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    setFittedFont(ctx, text.toUpperCase(), maxWidth, '900', size, FONT_EDITORIAL_SCORE, 26);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, Math.round(size * 0.042));
    ctx.strokeStyle = color;
    ctx.strokeText(truncateTextToWidth(ctx, text.toUpperCase(), maxWidth), x, y);
    ctx.restore();
}

function drawPosterV3SolidTitle(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left'
) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    setFittedFont(ctx, text.toUpperCase(), maxWidth, '900', size, FONT_EDITORIAL_SCORE, 24);
    ctx.fillText(truncateTextToWidth(ctx, text.toUpperCase(), maxWidth), x, y);
    ctx.restore();
}

function drawPosterV3Panel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    radius = 22,
    lineWidth = 2
) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawPosterV3VerticalSideLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    maxWidth: number,
    size: number,
    color: string
) {
    const normalized = text.trim().toUpperCase();
    if (!normalized) return;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.strokeStyle = hexToRGBA(getContrastColor(color) === '#ffffff' ? '#000000' : '#ffffff', 0.16);
    ctx.lineWidth = Math.max(2, Math.round(size * 0.03));
    setFittedFont(ctx, normalized, maxWidth, '900', size, FONT_EDITORIAL_SCORE, 58);
    const finalText = truncateTextToWidth(ctx, normalized, maxWidth);
    ctx.strokeText(finalText, 0, 0);
    ctx.fillText(finalText, 0, 0);
    ctx.restore();
}

function drawPosterV3TrophyMark(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number,
    color: string
) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-size * 0.2, -size * 0.22);
    ctx.bezierCurveTo(-size * 0.32, -size * 0.22, -size * 0.32, size * 0.02, -size * 0.18, size * 0.1);
    ctx.bezierCurveTo(-size * 0.08, size * 0.16, size * 0.08, size * 0.16, size * 0.18, size * 0.1);
    ctx.bezierCurveTo(size * 0.32, size * 0.02, size * 0.32, -size * 0.22, size * 0.2, -size * 0.22);
    ctx.quadraticCurveTo(size * 0.12, -size * 0.02, 0, size * 0.08);
    ctx.quadraticCurveTo(-size * 0.12, -size * 0.02, -size * 0.2, -size * 0.22);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = Math.max(3, size * 0.055);
    ctx.beginPath();
    ctx.moveTo(-size * 0.22, -size * 0.14);
    ctx.quadraticCurveTo(-size * 0.42, -size * 0.02, -size * 0.28, size * 0.14);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(size * 0.22, -size * 0.14);
    ctx.quadraticCurveTo(size * 0.42, -size * 0.02, size * 0.28, size * 0.14);
    ctx.stroke();

    ctx.fillRect(-size * 0.045, size * 0.08, size * 0.09, size * 0.22);
    ctx.beginPath();
    ctx.roundRect(-size * 0.16, size * 0.26, size * 0.32, size * 0.08, size * 0.03);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-size * 0.24, size * 0.37, size * 0.48, size * 0.09, size * 0.03);
    ctx.fill();
    ctx.restore();
}

function drawPosterV3BroadcastChip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    fillColor: string,
    textColor: string,
    logo: HTMLImageElement | null,
    rawLogo?: string
) {
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 10);
    ctx.fill();
    ctx.restore();

    const iconSize = height - 16;
    const iconX = x + 10 + iconSize / 2;
    const iconY = y + height / 2;
    drawOverflowCrest(ctx, {
        x: iconX,
        y: iconY,
        width: iconSize,
        height: iconSize,
        img: logo,
        label,
        rawLogo,
        isDark: getContrastColor(fillColor) === '#ffffff',
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    setFittedFont(ctx, label.toUpperCase(), width - iconSize - 56, '800', 27, FONT_BODY, 14);
    ctx.fillText(truncateTextToWidth(ctx, label.toUpperCase(), width - iconSize - 56), x + iconSize + 38, y + height / 2 + 1);
    ctx.restore();
}

async function drawPosterV3SchedulePoster(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const sponsors = getActiveEditorialSponsors(buildEditorialSponsorSlots(data.sponsors)).slice(0, 2);
    const [homeLogo, awayLogo, tournamentLogo, textureImage, ...broadcastLogos] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(EDITORIAL_TEXTURE_SOURCE),
        ...sponsors.map((sponsor) => loadImage(sponsor.logo || '')),
    ]);
    const palette = resolvePosterV3GradientPalette(bgColor, accentColor);
    const paperColor = palette.isDarkSurface
        ? mixHexColors('#f5f0e7', bgColor, 0.1)
        : mixHexColors('#fffdf8', bgColor, 0.14);
    const pageBase = palette.isDarkSurface
        ? mixHexColors(bgColor, '#020617', 0.34)
        : mixHexColors(bgColor, '#f1f5f9', 0.16);
    const pageShade = palette.isDarkSurface
        ? mixHexColors(bgColor, '#000000', 0.56)
        : mixHexColors(bgColor, '#cbd5e1', 0.2);
    const leftRailColor = getContrastColor(accentColor) === '#ffffff'
        ? mixHexColors(accentColor, '#ffffff', 0.06)
        : mixHexColors(accentColor, '#0f172a', 0.08);
    const rightRailColor = getContrastColor(bgColor) === '#ffffff'
        ? mixHexColors(bgColor, '#020617', 0.26)
        : mixHexColors(bgColor, '#111827', 0.74);
    const paperTextColor = getContrastColor(paperColor);
    const leftRailText = getContrastColor(leftRailColor);
    const rightRailText = getContrastColor(rightRailColor);
    const outlineColor = hexToRGBA(paperTextColor === '#ffffff' ? '#ffffff' : '#0f172a', 0.12);
    const frameX = 86;
    const frameY = 68;
    const frameWidth = canvas.width - frameX * 2;
    const frameHeight = canvas.height - frameY * 2;
    const sideWidth = 286;
    const centerWidth = frameWidth - sideWidth * 2;
    const leftX = frameX;
    const centerX = leftX + sideWidth;
    const rightX = centerX + centerWidth;
    const contentCenterX = centerX + centerWidth / 2;
    const headlineTop = frameY + 130;
    const dateTop = frameY + 420;
    const versusCenterY = frameY + 670;
    const broadcastTop = frameY + 920;
    const competitionText = (data.tournament || 'CAMPEONATO').toUpperCase();
    const competitionLayout = fitTextLinesToWidth(ctx, competitionText, centerWidth - 92, '900', 38, FONT_BODY, 20, 2);
    const dateLabel = (data.date || buildEditorialContextLabel(data) || 'PROXIMO PARTIDO').toUpperCase();
    const timeLabel = (data.time || '--:--').toUpperCase();
    const venueLabel = (data.venue || '').trim().toUpperCase();
    const broadcastItems = sponsors.map((sponsor, index) => ({
        label: sponsor.name?.trim() || `CANAL ${index + 1}`,
        logo: broadcastLogos[index] || null,
        rawLogo: sponsor.logo,
        fill: index === 0
            ? mixHexColors(accentColor, paperColor, 0.08)
            : rightRailColor,
    }));

    if (broadcastItems.length === 0) {
        broadcastItems.push({
            label: 'G22 SCORES',
            logo: brandLogo,
            rawLogo: '/icon.png',
            fill: mixHexColors(accentColor, paperColor, 0.08),
        });
    }
    if (broadcastItems.length === 1) {
        broadcastItems.push({
            label: tournamentLogo ? (data.tournament || 'TORNEO') : 'AO VIVO',
            logo: tournamentLogo || null,
            rawLogo: data.tournamentLogo,
            fill: rightRailColor,
        });
    }

    ctx.fillStyle = pageBase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pageGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    pageGradient.addColorStop(0, mixHexColors(pageBase, accentColor, 0.14));
    pageGradient.addColorStop(0.45, pageBase);
    pageGradient.addColorStop(1, pageShade);
    ctx.fillStyle = pageGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = hexToRGBA(accentColor, 0.18);
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.72, -64);
    ctx.bezierCurveTo(canvas.width * 0.92, 10, canvas.width * 1.04, 120, canvas.width * 0.94, 306);
    ctx.lineTo(canvas.width, 306);
    ctx.lineTo(canvas.width, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hexToRGBA(rightRailColor, 0.16);
    ctx.beginPath();
    ctx.moveTo(-48, canvas.height - 180);
    ctx.bezierCurveTo(96, canvas.height - 310, 242, canvas.height - 250, 314, canvas.height - 108);
    ctx.lineTo(148, canvas.height + 32);
    ctx.lineTo(-48, canvas.height + 32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (textureImage) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.12;
        ctx.drawImage(textureImage, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = paperColor;
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameWidth, frameHeight, 0);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = leftRailColor;
    ctx.fillRect(leftX, frameY, sideWidth, frameHeight);
    ctx.fillStyle = paperColor;
    ctx.fillRect(centerX, frameY, centerWidth, frameHeight);
    ctx.fillStyle = rightRailColor;
    ctx.fillRect(rightX, frameY, sideWidth, frameHeight);

    ctx.save();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1;
    for (let y = frameY + 58; y < frameY + frameHeight - 58; y += 48) {
        ctx.beginPath();
        ctx.moveTo(centerX, y + 0.5);
        ctx.lineTo(centerX + centerWidth, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(rightRailText === '#ffffff' ? '#ffffff' : '#0f172a', 0.08);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rightX + 52, frameY + 286, sideWidth - 104, sideWidth - 104, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rightX + sideWidth / 2, frameY + 432, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightX + sideWidth / 2, frameY + 286);
    ctx.lineTo(rightX + sideWidth / 2, frameY + 578);
    ctx.moveTo(rightX + 52, frameY + 432);
    ctx.lineTo(rightX + sideWidth - 52, frameY + 432);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(leftRailText === '#ffffff' ? '#ffffff' : '#0f172a', 0.08);
    ctx.lineWidth = 2;
    for (let offset = -frameHeight; offset < frameWidth; offset += 92) {
        ctx.beginPath();
        ctx.moveTo(leftX + offset, frameY);
        ctx.lineTo(leftX + offset + 220, frameY + frameHeight);
        ctx.stroke();
    }
    ctx.restore();

    drawPosterV3VerticalSideLabel(
        ctx,
        data.homeTeam,
        leftX + sideWidth / 2,
        frameY + frameHeight / 2,
        frameHeight - 140,
        164,
        leftRailText
    );
    drawPosterV3VerticalSideLabel(
        ctx,
        data.awayTeam,
        rightX + sideWidth / 2,
        frameY + frameHeight / 2,
        frameHeight - 140,
        164,
        rightRailText
    );

    const leftBadgeSize = 116;
    const leftBadgeX = leftX + sideWidth / 2 - leftBadgeSize / 2;
    const leftBadgeY = frameY + frameHeight - 184;
    const rightBadgeSize = 116;
    const rightBadgeX = rightX + sideWidth / 2 - rightBadgeSize / 2;
    const rightBadgeY = frameY + 82;

    drawPosterV3Panel(
        ctx,
        leftBadgeX,
        leftBadgeY,
        leftBadgeSize,
        leftBadgeSize,
        mixHexColors(rightRailColor, '#000000', 0.16),
        hexToRGBA(leftRailText === '#ffffff' ? '#ffffff' : '#0f172a', 0.16),
        0,
        1.5
    );
    drawPosterV3Panel(
        ctx,
        rightBadgeX,
        rightBadgeY,
        rightBadgeSize,
        rightBadgeSize,
        mixHexColors(accentColor, rightRailColor, 0.24),
        hexToRGBA(rightRailText === '#ffffff' ? '#ffffff' : '#0f172a', 0.14),
        0,
        1.5
    );

    drawOverflowCrest(ctx, {
        x: leftX + sideWidth / 2,
        y: leftBadgeY + leftBadgeSize / 2,
        width: 86,
        height: 86,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: getContrastColor(mixHexColors(rightRailColor, '#000000', 0.16)) === '#ffffff',
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: rightX + sideWidth / 2,
        y: rightBadgeY + rightBadgeSize / 2,
        width: 86,
        height: 86,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: getContrastColor(mixHexColors(accentColor, rightRailColor, 0.24)) === '#ffffff',
        showFrame: false,
    });

    if (tournamentLogo) {
        drawNeutralizedBackdropMark(ctx, tournamentLogo, contentCenterX, frameY + 546, 222, 222, accentColor, 0.05);
    }

    drawPosterV3TrophyMark(ctx, contentCenterX, headlineTop, 70, accentColor);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = paperTextColor;
    competitionLayout.lines.forEach((line, index) => {
        ctx.font = `${index === 0 ? '800' : '900'} ${competitionLayout.size}px ${FONT_BODY}`;
        ctx.fillText(line, contentCenterX, headlineTop + 96 + index * (competitionLayout.size + 6));
    });
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hexToRGBA(paperTextColor, 0.94);
    setFittedFont(ctx, dateLabel, centerWidth - 84, '900', 74, FONT_EDITORIAL_SCORE, 38);
    ctx.fillText(truncateTextToWidth(ctx, dateLabel, centerWidth - 84), contentCenterX, dateTop);
    ctx.font = `900 48px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(`- ${timeLabel}`, contentCenterX, dateTop + 72);
    if (venueLabel) {
        ctx.fillStyle = hexToRGBA(paperTextColor, 0.68);
        ctx.font = `800 18px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, venueLabel, centerWidth - 96), contentCenterX, dateTop + 118);
    }
    ctx.restore();

    ctx.save();
    ctx.translate(contentCenterX, versusCenterY);
    ctx.scale(0.72, 1.08);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hexToRGBA(paperTextColor, 0.96);
    ctx.font = `900 244px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText('VS', 0, 0);
    ctx.restore();

    const chipWidth = centerWidth - 100;
    const firstChipY = broadcastTop;
    const secondChipY = firstChipY + 72;
    drawPosterV3BroadcastChip(
        ctx,
        contentCenterX - chipWidth / 2,
        firstChipY,
        chipWidth,
        52,
        broadcastItems[0].label,
        broadcastItems[0].fill,
        getContrastColor(broadcastItems[0].fill),
        broadcastItems[0].logo,
        broadcastItems[0].rawLogo
    );
    drawPosterV3BroadcastChip(
        ctx,
        contentCenterX - chipWidth / 2,
        secondChipY,
        chipWidth,
        52,
        broadcastItems[1].label,
        broadcastItems[1].fill,
        getContrastColor(broadcastItems[1].fill),
        broadcastItems[1].logo,
        broadcastItems[1].rawLogo
    );

    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: frameX + frameWidth - 40,
            y: frameY + frameHeight - 40,
            size: 28,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark: getContrastColor(rightRailColor) === '#ffffff',
        });
    }
}

function drawPosterV3FullBleedImage(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | null,
    overlayTop: string,
    overlayBottom: string
) {
    if (image) {
        const sourceWidth = image.naturalWidth || image.width || canvas.width;
        const sourceHeight = image.naturalHeight || image.height || canvas.height;
        const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        ctx.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
    overlay.addColorStop(0, overlayTop);
    overlay.addColorStop(0.55, 'rgba(0,0,0,0.24)');
    overlay.addColorStop(1, overlayBottom);
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPosterV3MetadataBand(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    label: string,
    accentColor: string
) {
    if (!label.trim()) return;

    ctx.save();
    ctx.font = `800 18px ${FONT_MONO}`;
    const textWidth = ctx.measureText(label.toUpperCase()).width;
    const pillWidth = Math.min(canvas.width - 120, textWidth + 42);
    drawPosterV3Panel(ctx, (canvas.width - pillWidth) / 2, canvas.height - 158, pillWidth, 44, hexToRGBA(accentColor, 0.16), hexToRGBA(accentColor, 0.76), 999, 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label.toUpperCase(), canvas.width / 2, canvas.height - 136);
    ctx.restore();
}

function getPosterV3ClassicHeroTitle(data: MatchStatsData): string {
    const label = (data.mainTitle || '').trim().toLowerCase();
    if (data.status === 'scheduled' || label === 'horario') return 'MATCH TIME';
    if (data.status === 'live') return 'LIVE SCORE';
    return 'FULL TIME';
}

function splitPosterV3HeroTitle(text: string): [string, string] {
    const parts = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return [parts[0], parts.slice(1).join(' ')];
    }
    return [parts[0] || '', ''];
}

function drawPosterV3SlashedHeadline(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    topY: number,
    text: string,
    maxWidth: number,
    size: number,
    color: string,
    slashColor: string
) {
    const [firstLine, secondLine] = splitPosterV3HeroTitle(text);
    const firstBaselineY = topY + size * 0.84;
    const secondSize = Math.round(size * 0.86);
    const secondBaselineY = firstBaselineY + (secondLine ? size * 0.64 : 0);

    if (firstLine) {
        drawPosterV3SolidTitle(ctx, firstLine, centerX, firstBaselineY, maxWidth, size, color, 'center');
    }
    if (secondLine) {
        drawPosterV3SolidTitle(ctx, secondLine, centerX, secondBaselineY, maxWidth * 0.96, secondSize, color, 'center');
    }

    ctx.save();
    ctx.strokeStyle = slashColor;
    ctx.lineWidth = Math.max(6, Math.round(size * 0.085));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - maxWidth * 0.18, secondLine ? secondBaselineY - secondSize * 0.18 : firstBaselineY + size * 0.06);
    ctx.lineTo(centerX + maxWidth * 0.06, firstBaselineY - size * 0.74);
    ctx.stroke();
    ctx.restore();
}

function buildPosterV3MatchSideNotes(data: MatchStatsData, isScheduled: boolean): {
    leftLines: string[];
    rightLines: string[];
} {
    const stats = data.stats
        .filter((stat) => stat && stat.label)
        .slice(0, 3);

    if (!isScheduled && stats.length > 0) {
        return {
            leftLines: stats.map((stat) => `${String(stat.home)} ${stat.label}`.trim().toUpperCase()),
            rightLines: stats.map((stat) => `${String(stat.away)} ${stat.label}`.trim().toUpperCase()),
        };
    }

    const fallbackLines = [data.date, data.time, data.venue, data.tournament]
        .filter(Boolean)
        .map((value) => String(value).trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 4);

    if (fallbackLines.length === 0) {
        return {
            leftLines: [],
            rightLines: [],
        };
    }

    const splitIndex = Math.max(1, Math.ceil(fallbackLines.length / 2));
    const leftLines = fallbackLines.slice(0, splitIndex);
    const rightLines = fallbackLines.slice(splitIndex);

    if (rightLines.length === 0 && leftLines.length > 1) {
        rightLines.push(leftLines[leftLines.length - 1]);
        leftLines.pop();
    }

    return {
        leftLines: leftLines.slice(0, 3),
        rightLines: rightLines.slice(0, 3),
    };
}

function drawPosterV3PaperMetadataBand(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    label: string,
    fillColor: string
) {
    if (!label.trim()) return;

    const textColor = getContrastColor(fillColor);
    ctx.save();
    ctx.font = `800 18px ${FONT_MONO}`;
    const textWidth = ctx.measureText(label.toUpperCase()).width;
    const pillWidth = Math.min(canvas.width - 132, textWidth + 54);
    const x = (canvas.width - pillWidth) / 2;
    const y = canvas.height - 174;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(x, y, pillWidth, 48, 999);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(textColor === '#ffffff' ? '#ffffff' : '#0f172a', 0.14);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, pillWidth, 48, 999);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.font = `800 18px ${FONT_MONO}`;
    ctx.fillText(label.toUpperCase(), canvas.width / 2, y + 24);
    ctx.restore();
}

// Legacy editorial layout kept temporarily while the new poster split-panel version settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function drawPosterV3MatchEditorialLegacy(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    backgroundImageSrc: string
) {
    const sponsors = getActiveEditorialSponsors(buildEditorialSponsorSlots(data.sponsors));
    const [backgroundImage, homeLogo, awayLogo, tournamentLogo, ...sponsorImages] = await Promise.all([
        loadImage(backgroundImageSrc || data.backgroundImage || ''),
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        ...sponsors.map((sponsor) => loadImage(sponsor.logo || '')),
    ]);
    const neonAccent = mixHexColors(accentColor, '#d7ff00', 0.68);
    const hotAccent = mixHexColors(accentColor, '#ff5fa2', 0.42);
    const title = data.mainTitle || getStatusLabel(data.status);
    const metaLine = [data.date, data.time, data.venue].filter(Boolean).join('  •  ');

    drawPosterV3Backdrop(ctx, canvas, accentColor, bgColor);
    drawPosterV3FullBleedImage(ctx, canvas, backgroundImage, 'rgba(2,5,10,0.24)', 'rgba(0,0,0,0.82)');

    if (data.editorialShowTopBadge !== false && tournamentLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width / 2,
            y: 84,
            size: 72,
            img: tournamentLogo,
            label: data.tournament || 'Torneo',
            rawLogo: data.tournamentLogo,
            isDark: true,
        });
    }

    drawPosterV3Kicker(ctx, canvas.width / 2, 146, (data.editorialContextLabel || data.tournament || 'Torneo').toUpperCase(), hexToRGBA('#ffffff', 0.84), 'center');
    drawPosterV3OutlineTitle(ctx, title, canvas.width / 2, 254, canvas.width - 128, 118, hexToRGBA('#ffffff', 0.34), 'center');

    drawLogoBadge(ctx, { x: 176, y: 390, size: 102, img: homeLogo, label: data.homeTeam, rawLogo: data.homeLogo, isDark: true });
    drawLogoBadge(ctx, { x: canvas.width - 176, y: 390, size: 102, img: awayLogo, label: data.awayTeam, rawLogo: data.awayLogo, isDark: true });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hotAccent;
    setFittedFont(ctx, String(data.homeScore ?? '-'), 250, '900', 248, FONT_EDITORIAL_SCORE, 120);
    ctx.fillText(String(data.homeScore ?? '-'), canvas.width / 2 - 186, 474);
    setFittedFont(ctx, String(data.awayScore ?? '-'), 250, '900', 248, FONT_EDITORIAL_SCORE, 120);
    ctx.fillText(String(data.awayScore ?? '-'), canvas.width / 2 + 186, 474);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 128px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(':', canvas.width / 2, 456);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, data.homeTeam.toUpperCase(), 286, '900', 46, FONT_BODY, 18);
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.toUpperCase(), 286), 176, 546);
    setFittedFont(ctx, data.awayTeam.toUpperCase(), 286, '900', 46, FONT_BODY, 18);
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.toUpperCase(), 286), canvas.width - 176, 546);
    ctx.restore();

    drawPosterV3MetadataBand(ctx, canvas, metaLine, neonAccent);

    if (sponsors.length > 0) {
        drawEditorialSponsorsRow(ctx, canvas, sponsors, sponsorImages, brandLogo, canvas.height - 64, 40, 16);
    } else {
        drawBrandFooter(ctx, canvas, brandLogo, true);
    }
}

async function drawPosterV3MatchEditorial(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    backgroundImageSrc: string
) {
    const isScheduled = data.status === 'scheduled' || (data.mainTitle || '').trim().toLowerCase() === 'horario';

    if (isScheduled) {
        await drawPosterV3SchedulePoster(ctx, canvas, data, accentColor, bgColor, brandLogo);
        return;
    }

    const sponsors = getActiveEditorialSponsors(buildEditorialSponsorSlots(data.sponsors));
    const leadSponsor = sponsors[0] || null;
    const [backgroundImage, homeLogo, awayLogo, tournamentLogo, sponsorLogo] = await Promise.all([
        loadImage(backgroundImageSrc || data.backgroundImage || ''),
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(leadSponsor?.logo || ''),
    ]);
    const photoHeight = 792;
    const panelTop = photoHeight;
    const panelHeight = canvas.height - panelTop;
    const panelBg = mixHexColors(bgColor, '#000000', 0.82);
    const titleColor = '#ffffff';
    const secondaryText = 'rgba(255,255,255,0.74)';
    const scoreStroke = hexToRGBA('#ffffff', 0.88);
    const accentGlow = mixHexColors(accentColor, '#ffffff', 0.18);
    const leftBlockX = 40;
    const leftBlockWidth = 336;
    const scoreBoxX = 430;
    const scoreBoxY = panelTop + 56;
    const scoreBoxWidth = canvas.width - scoreBoxX - 40;
    const scoreBoxHeight = 206;
    const scoreBandHeight = 46;
    const scoreTopHeight = scoreBoxHeight - scoreBandHeight;
    const heroLabel = (data.editorialContextLabel?.trim() || data.mainTitle || getStatusLabel(data.status)).toUpperCase();
    const [heroLineOne, heroLineTwo] = splitPosterV3HeroTitle(heroLabel);
    const sponsorText = leadSponsor?.name?.trim()
        ? `Presented by ${leadSponsor.name.trim()}`
        : 'Presented by G22 Scores';
    const metaLine = [data.date, data.time, data.venue].filter(Boolean).join('  •  ');
    const infoLine = metaLine || (data.tournament || '').toUpperCase();

    if (backgroundImage) {
        drawCoverImage(ctx, canvas, backgroundImage);
    } else {
        const fallbackGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        fallbackGradient.addColorStop(0, mixHexColors(accentColor, '#0b1220', 0.64));
        fallbackGradient.addColorStop(1, mixHexColors(bgColor, '#030712', 0.86));
        ctx.fillStyle = fallbackGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    const photoOverlay = ctx.createLinearGradient(0, 0, 0, photoHeight);
    photoOverlay.addColorStop(0, 'rgba(0,0,0,0.14)');
    photoOverlay.addColorStop(0.68, 'rgba(0,0,0,0.12)');
    photoOverlay.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = photoOverlay;
    ctx.fillRect(0, 0, canvas.width, photoHeight);
    ctx.restore();

    ctx.save();
    const leftGlow = ctx.createRadialGradient(180, 180, 0, 180, 180, 320);
    leftGlow.addColorStop(0, hexToRGBA(accentGlow, 0.2));
    leftGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, canvas.width, photoHeight);
    ctx.restore();

    if (data.editorialShowTopBadge !== false) {
        if (tournamentLogo) {
            drawLogoBadge(ctx, {
                x: 76,
                y: 76,
                size: 64,
                img: tournamentLogo,
                label: data.tournament || 'Torneo',
                rawLogo: data.tournamentLogo,
                isDark: true,
            });
        }

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 18px ${FONT_BODY}`;
        ctx.fillText((data.tournament || 'TORNEO').toUpperCase(), tournamentLogo ? 118 : 44, 76);
        ctx.restore();
    }

    if (data.editorialShowHeaderArrows !== false) {
        ctx.save();
        ctx.strokeStyle = hexToRGBA('#ffffff', 0.82);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        const arrowBaseX = canvas.width - 126;
        const arrowY = 64;
        for (let index = 0; index < 3; index += 1) {
            const x = arrowBaseX + index * 24;
            ctx.beginPath();
            ctx.moveTo(x, arrowY);
            ctx.lineTo(x + 14, arrowY + 12);
            ctx.lineTo(x, arrowY + 24);
            ctx.stroke();
        }
        ctx.restore();
    }

    ctx.fillStyle = panelBg;
    ctx.fillRect(0, panelTop, canvas.width, panelHeight);

    ctx.save();
    const panelAccent = ctx.createLinearGradient(0, panelTop, canvas.width, panelTop);
    panelAccent.addColorStop(0, hexToRGBA(accentColor, 0.92));
    panelAccent.addColorStop(0.3, hexToRGBA(accentGlow, 0.82));
    panelAccent.addColorStop(1, hexToRGBA(accentColor, 0.12));
    ctx.fillStyle = panelAccent;
    ctx.fillRect(0, panelTop, canvas.width, 4);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let y = panelTop + 18; y < canvas.height; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = titleColor;
    setFittedFont(ctx, heroLineOne || heroLabel, leftBlockWidth, '900', 86, FONT_EDITORIAL_SCORE, 52);
    ctx.fillText(truncateTextToWidth(ctx, heroLineOne || heroLabel, leftBlockWidth), leftBlockX, panelTop + 42);
    if (heroLineTwo) {
        setFittedFont(ctx, heroLineTwo, leftBlockWidth, '900', 86, FONT_EDITORIAL_SCORE, 52);
        ctx.fillText(truncateTextToWidth(ctx, heroLineTwo, leftBlockWidth), leftBlockX, panelTop + 130);
    }
    ctx.restore();

    const sponsorY = panelTop + 250;
    if (leadSponsor || brandLogo) {
        drawOverflowCrest(ctx, {
            x: leftBlockX + 22,
            y: sponsorY + 16,
            width: 40,
            height: 40,
            img: sponsorLogo || brandLogo,
            label: leadSponsor?.name || 'G22 Scores',
            rawLogo: leadSponsor?.logo || '/icon.png',
            isDark: true,
            showFrame: false,
        });
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = secondaryText;
    ctx.font = `700 18px ${FONT_BODY}`;
    ctx.fillText(sponsorText.toUpperCase(), leftBlockX + (leadSponsor || brandLogo ? 48 : 0), sponsorY + 16);
    if (infoLine) {
        ctx.font = `700 15px ${FONT_MONO}`;
        ctx.fillStyle = 'rgba(255,255,255,0.58)';
        ctx.fillText(infoLine.toUpperCase(), leftBlockX, sponsorY + 58);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = scoreStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(scoreBoxX, scoreBoxY, scoreBoxWidth, scoreBoxHeight);
    ctx.beginPath();
    ctx.moveTo(scoreBoxX + scoreBoxWidth / 2, scoreBoxY);
    ctx.lineTo(scoreBoxX + scoreBoxWidth / 2, scoreBoxY + scoreTopHeight);
    ctx.moveTo(scoreBoxX, scoreBoxY + scoreTopHeight);
    ctx.lineTo(scoreBoxX + scoreBoxWidth, scoreBoxY + scoreTopHeight);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.54)';
    ctx.font = `800 12px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.toUpperCase(), scoreBoxWidth / 2 - 86), scoreBoxX + 20, scoreBoxY + 22);
    ctx.textAlign = 'right';
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.toUpperCase(), scoreBoxWidth / 2 - 86), scoreBoxX + scoreBoxWidth - 20, scoreBoxY + 22);
    ctx.restore();

    drawOverflowCrest(ctx, {
        x: scoreBoxX + 86,
        y: scoreBoxY + scoreTopHeight / 2 + 2,
        width: 80,
        height: 80,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: true,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: scoreBoxX + scoreBoxWidth - 86,
        y: scoreBoxY + scoreTopHeight / 2 + 2,
        width: 80,
        height: 80,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: true,
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, String(data.homeScore ?? '-'), 120, '900', 108, FONT_EDITORIAL_SCORE, 68);
    ctx.fillText(String(data.homeScore ?? '-'), scoreBoxX + scoreBoxWidth * 0.34, scoreBoxY + scoreTopHeight / 2 + 6);
    setFittedFont(ctx, String(data.awayScore ?? '-'), 120, '900', 108, FONT_EDITORIAL_SCORE, 68);
    ctx.fillText(String(data.awayScore ?? '-'), scoreBoxX + scoreBoxWidth * 0.66, scoreBoxY + scoreTopHeight / 2 + 6);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 24px ${FONT_MONO}`;
    ctx.fillText(
        truncateTextToWidth(ctx, (metaLine || buildEditorialContextLabel(data) || getStatusLabel(data.status)).toUpperCase(), scoreBoxWidth - 30),
        scoreBoxX + scoreBoxWidth - 18,
        scoreBoxY + scoreTopHeight + scoreBandHeight / 2
    );
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexToRGBA(accentGlow, 0.92);
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    const brushY = canvas.height - 44;
    [
        [42, brushY, 116, brushY - 24],
        [118, brushY + 2, 214, brushY - 32],
        [194, brushY + 2, 316, brushY - 28],
    ].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });
    ctx.restore();

    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width - 44,
            y: canvas.height - 42,
            size: 26,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark: true,
        });
    }
}

// Legacy poster-v3 match result kept temporarily while the new classic layout settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function drawPosterV3MatchResultLegacy(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const [backgroundImage, homeLogo, awayLogo, tournamentLogo] = await Promise.all([
        loadImage(data.backgroundImage || ''),
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
    ]);
    const neonAccent = mixHexColors(accentColor, '#d7ff00', 0.68);
    const hotAccent = mixHexColors(accentColor, '#ff5fa2', 0.42);
    const title = data.mainTitle || getStatusLabel(data.status);
    const metaLine = [data.tournament, data.date, data.time, data.venue].filter(Boolean).join('  •  ');

    drawPosterV3Backdrop(ctx, canvas, accentColor, bgColor);
    if (backgroundImage) {
        drawPosterV3FullBleedImage(ctx, canvas, backgroundImage, 'rgba(3,8,16,0.46)', 'rgba(0,0,0,0.88)');
    } else if (tournamentLogo) {
        drawNeutralizedBackdropMark(ctx, tournamentLogo, canvas.width / 2, canvas.height / 2 + 18, canvas.width * 0.56, canvas.width * 0.56, '#ffffff', 0.08);
    }

    drawPosterV3Kicker(ctx, canvas.width / 2, 120, (data.tournament || 'Torneo').toUpperCase(), hexToRGBA(neonAccent, 0.92), 'center');
    drawPosterV3OutlineTitle(ctx, title, canvas.width / 2, 234, canvas.width - 120, 126, hexToRGBA('#ffffff', 0.34), 'center');

    drawLogoBadge(ctx, { x: 190, y: 462, size: 108, img: homeLogo, label: data.homeTeam, rawLogo: data.homeLogo, isDark: true });
    drawLogoBadge(ctx, { x: canvas.width - 190, y: 462, size: 108, img: awayLogo, label: data.awayTeam, rawLogo: data.awayLogo, isDark: true });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hotAccent;
    setFittedFont(ctx, String(data.homeScore ?? '-'), 268, '900', 272, FONT_EDITORIAL_SCORE, 138);
    ctx.fillText(String(data.homeScore ?? '-'), canvas.width / 2 - 194, 560);
    setFittedFont(ctx, String(data.awayScore ?? '-'), 268, '900', 272, FONT_EDITORIAL_SCORE, 138);
    ctx.fillText(String(data.awayScore ?? '-'), canvas.width / 2 + 194, 560);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 138px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(':', canvas.width / 2, 540);
    ctx.restore();

    drawPosterV3Panel(ctx, 82, canvas.height - 236, canvas.width - 164, 106, 'rgba(3, 9, 18, 0.84)', hexToRGBA(neonAccent, 0.7), 24, 2);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, data.homeTeam.toUpperCase(), 328, '900', 48, FONT_BODY, 18);
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.toUpperCase(), 328), 256, canvas.height - 174);
    setFittedFont(ctx, data.awayTeam.toUpperCase(), 328, '900', 48, FONT_BODY, 18);
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.toUpperCase(), 328), canvas.width - 256, canvas.height - 174);
    ctx.fillStyle = hexToRGBA('#ffffff', 0.72);
    ctx.font = `800 18px ${FONT_MONO}`;
    ctx.fillText(metaLine.toUpperCase(), canvas.width / 2, canvas.height - 140);
    ctx.restore();

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawPosterV3MatchResult(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const [backgroundImage, homeLogo, awayLogo, tournamentLogo] = await Promise.all([
        loadImage(data.backgroundImage || ''),
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
    ]);
    const isStory = canvas.height > canvas.width * 1.45;
    const isScheduled = data.status === 'scheduled';

    if (isScheduled && !isStory) {
        await drawPosterV3SchedulePoster(ctx, canvas, data, accentColor, bgColor, brandLogo);
        return;
    }

    const panelColor = getContrastColor(accentColor) === '#ffffff'
        ? mixHexColors(accentColor, '#0f172a', 0.18)
        : mixHexColors(accentColor, '#ffffff', 0.06);
    const panelTextColor = getContrastColor(panelColor);
    const frameColor = mixHexColors(bgColor, '#08111c', 0.82);
    const cornerColor = mixHexColors(panelColor, bgColor, 0.38);
    const bgIsDark = getContrastColor(bgColor) === '#ffffff';
    const paperColor = bgIsDark
        ? mixHexColors(bgColor, '#0b1220', 0.28)
        : mixHexColors(bgColor, '#f3f4f6', 0.14);
    const paperHighlight = bgIsDark
        ? mixHexColors(bgColor, '#111827', 0.18)
        : mixHexColors(paperColor, '#ffffff', 0.72);
    const paperShade = bgIsDark
        ? mixHexColors(bgColor, '#020617', 0.42)
        : mixHexColors(paperColor, '#d9d0c3', 0.22);
    const heroTitle = getPosterV3ClassicHeroTitle(data);
    const metaLine = [data.tournament, data.date, data.time, data.venue].filter(Boolean).join('  •  ');

    const topLeftSlice: Array<[number, number]> = [
        [0, 0],
        [canvas.width * 0.33, 0],
        [canvas.width * 0.14, canvas.height * 0.34],
        [0, canvas.height * 0.28],
    ];
    const bottomRightSlice: Array<[number, number]> = [
        [canvas.width, canvas.height],
        [canvas.width * 0.67, canvas.height],
        [canvas.width * 0.86, canvas.height * 0.66],
        [canvas.width, canvas.height * 0.72],
    ];
    const tracePolygon = (points: Array<[number, number]>) => {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
    };
    const drawCoverImage = () => {
        if (!backgroundImage) return;
        const sourceWidth = backgroundImage.naturalWidth || backgroundImage.width || canvas.width;
        const sourceHeight = backgroundImage.naturalHeight || backgroundImage.height || canvas.height;
        const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        ctx.drawImage(backgroundImage, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    };
    const drawCornerSlice = (
        points: Array<[number, number]>,
        gradientStart: [number, number],
        gradientEnd: [number, number],
        overlayAlpha: number
    ) => {
        ctx.save();
        tracePolygon(points);
        ctx.clip();
        if (backgroundImage) {
            drawCoverImage();
        } else {
            const fillGradient = ctx.createLinearGradient(gradientStart[0], gradientStart[1], gradientEnd[0], gradientEnd[1]);
            fillGradient.addColorStop(0, panelColor);
            fillGradient.addColorStop(1, cornerColor);
            ctx.fillStyle = fillGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        const overlayGradient = ctx.createLinearGradient(gradientStart[0], gradientStart[1], gradientEnd[0], gradientEnd[1]);
        overlayGradient.addColorStop(0, hexToRGBA(panelColor, overlayAlpha));
        overlayGradient.addColorStop(0.55, hexToRGBA(cornerColor, overlayAlpha * 0.9));
        overlayGradient.addColorStop(1, hexToRGBA(frameColor, overlayAlpha * 0.92));
        ctx.fillStyle = overlayGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        ctx.save();
        tracePolygon(points);
        ctx.strokeStyle = hexToRGBA(panelTextColor === '#ffffff' ? '#ffffff' : frameColor, 0.12);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };
    const scoreBlockSize = isScheduled ? (isStory ? 390 : 344) : (isStory ? 486 : 420);
    const scoreBlockX = Math.round((canvas.width - scoreBlockSize) / 2);
    const scoreBlockY = isStory ? 668 : 498;
    const sideTabWidth = isStory ? 170 : 148;
    const sideTabHeight = isStory ? 160 : 136;
    const sideTabY = Math.round(scoreBlockY + scoreBlockSize / 2 - sideTabHeight / 2);
    const leftTabX = scoreBlockX - sideTabWidth + 20;
    const rightTabX = scoreBlockX + scoreBlockSize - 20;
    const teamLabelY = scoreBlockY + scoreBlockSize + (isStory ? 76 : 62);
    const notesTop = teamLabelY + (isStory ? 56 : 48);
    const noteWidth = isStory ? 264 : 228;
    const leftColumnX = isStory ? 224 : 198;
    const rightColumnX = canvas.width - leftColumnX;
    const noteLineGap = isStory ? 42 : 34;
    const noteFontSize = isStory ? 22 : 19;
    const noteHeadingSize = isStory ? 34 : 28;
    const scoreValue = isScheduled
        ? (data.time || '--:--')
        : `${data.homeScore ?? '-'}-${data.awayScore ?? '-'}`;
    const scoreFont = isScheduled ? FONT_MONO : FONT_EDITORIAL_SCORE;
    const scoreFontSize = isScheduled ? (isStory ? 168 : 138) : (isStory ? 360 : 304);
    const sideNotes = buildPosterV3MatchSideNotes(data, isScheduled);
    const logoToneIsDark = panelTextColor === '#ffffff';
    const sideAccentColor = accentColor;
    const sideShadowColor = bgIsDark ? hexToRGBA('#000000', 0.52) : hexToRGBA(frameColor, 0.24);

    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const paperGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    paperGradient.addColorStop(0, paperHighlight);
    paperGradient.addColorStop(0.42, paperColor);
    paperGradient.addColorStop(1, paperShade);
    ctx.fillStyle = paperGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = hexToRGBA(frameColor, 0.18);
    ctx.lineWidth = 1;
    for (let index = 0; index < 18; index += 1) {
        const y = canvas.height * (0.05 + index * 0.052);
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.1, y);
        ctx.lineTo(canvas.width * 0.9, y + (index % 2 === 0 ? 12 : -10));
        ctx.stroke();
    }
    ctx.restore();

    drawCornerSlice(topLeftSlice, [0, 0], [canvas.width * 0.42, canvas.height * 0.34], backgroundImage ? 0.58 : 0.92);
    drawCornerSlice(bottomRightSlice, [canvas.width * 0.58, canvas.height * 0.6], [canvas.width, canvas.height], backgroundImage ? 0.62 : 0.94);

    if (tournamentLogo) {
        drawNeutralizedBackdropMark(ctx, tournamentLogo, canvas.width * 0.11, canvas.height * 0.09, 240, 240, panelColor, 0.12);
        drawNeutralizedBackdropMark(ctx, tournamentLogo, canvas.width * 0.9, canvas.height * 0.9, 240, 240, panelColor, 0.12);
    }

    ctx.fillStyle = panelColor;
    ctx.fillRect(0, 0, canvas.width, 4);
    ctx.fillRect(0, canvas.height - 4, canvas.width, 4);

    drawPosterV3Kicker(ctx, canvas.width / 2, isStory ? 122 : 102, (data.tournament || 'TORNEO').toUpperCase(), hexToRGBA(frameColor, 0.88), 'center');
    drawPosterV3SlashedHeadline(
        ctx,
        canvas.width / 2,
        isStory ? 148 : 126,
        heroTitle,
        canvas.width - 320,
        isStory ? 168 : 138,
        panelColor,
        hexToRGBA(panelColor, 0.9)
    );

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hexToRGBA(frameColor, 0.74);
    ctx.font = `800 ${isStory ? 20 : 18}px ${FONT_MONO}`;
    ctx.fillText((data.mainTitle || getStatusLabel(data.status)).toUpperCase(), canvas.width / 2, isStory ? 418 : 360);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(9, 15, 24, 0.18)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = cornerColor;
    ctx.beginPath();
    ctx.roundRect(leftTabX, sideTabY, sideTabWidth, sideTabHeight, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rightTabX, sideTabY, sideTabWidth, sideTabHeight, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(9, 15, 24, 0.22)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = panelColor;
    ctx.beginPath();
    ctx.roundRect(scoreBlockX, scoreBlockY, scoreBlockSize, scoreBlockSize, 10);
    ctx.fill();
    ctx.restore();

    drawOverflowCrest(ctx, {
        x: leftTabX + sideTabWidth / 2,
        y: sideTabY + sideTabHeight / 2,
        width: isStory ? 96 : 82,
        height: isStory ? 96 : 82,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: logoToneIsDark,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: rightTabX + sideTabWidth / 2,
        y: sideTabY + sideTabHeight / 2,
        width: isStory ? 96 : 82,
        height: isStory ? 96 : 82,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: logoToneIsDark,
        showFrame: false,
    });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = panelTextColor;
    setFittedFont(ctx, scoreValue, scoreBlockSize - (isScheduled ? 68 : 96), '900', scoreFontSize, scoreFont, isScheduled ? 82 : 180);
    ctx.fillText(scoreValue, canvas.width / 2, scoreBlockY + scoreBlockSize / 2 + (isScheduled ? 12 : 18));
    ctx.restore();

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = sideAccentColor;
    ctx.shadowColor = sideShadowColor;
    ctx.shadowBlur = isStory ? 26 : 20;
    ctx.shadowOffsetY = isStory ? 10 : 8;
    ctx.textAlign = 'left';
    setFittedFont(ctx, data.homeTeam.toUpperCase(), noteWidth, '900', noteHeadingSize, FONT_BODY, 18);
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.toUpperCase(), noteWidth), leftColumnX, teamLabelY);
    ctx.textAlign = 'right';
    setFittedFont(ctx, data.awayTeam.toUpperCase(), noteWidth, '900', noteHeadingSize, FONT_BODY, 18);
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.toUpperCase(), noteWidth), rightColumnX, teamLabelY);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = sideAccentColor;
    ctx.shadowColor = sideShadowColor;
    ctx.shadowBlur = isStory ? 22 : 16;
    ctx.shadowOffsetY = isStory ? 8 : 6;
    ctx.textBaseline = 'top';
    ctx.font = `800 ${noteFontSize}px ${FONT_BODY}`;
    ctx.textAlign = 'left';
    sideNotes.leftLines.forEach((line, index) => {
        const y = notesTop + index * noteLineGap;
        ctx.fillText(truncateTextToWidth(ctx, line, noteWidth), leftColumnX, y);
    });
    ctx.textAlign = 'right';
    sideNotes.rightLines.forEach((line, index) => {
        const y = notesTop + index * noteLineGap;
        ctx.fillText(truncateTextToWidth(ctx, line, noteWidth), rightColumnX, y);
    });
    ctx.restore();

    drawPosterV3PaperMetadataBand(ctx, canvas, metaLine, panelColor);

    const footerCenterY = canvas.height - (isStory ? 70 : 64);
    const footerPillHeight = isStory ? 54 : 48;
    const footerIconSize = isStory ? 28 : 24;
    const footerPaddingX = isStory ? 18 : 16;
    const footerGap = isStory ? 12 : 10;
    const footerTextGap = 6;

    ctx.save();
    ctx.font = `900 ${isStory ? 24 : 21}px ${FONT_EDITORIAL}`;
    const footerG22Width = ctx.measureText('G22').width;
    ctx.font = `800 ${isStory ? 24 : 21}px ${FONT_BODY}`;
    const footerScoresWidth = ctx.measureText('Scores').width;
    ctx.restore();

    const footerPillWidth = Math.ceil(footerPaddingX * 2 + footerIconSize + footerGap + footerG22Width + footerTextGap + footerScoresWidth);
    const footerPillX = canvas.width / 2 - footerPillWidth / 2;
    const footerPillY = footerCenterY - footerPillHeight / 2;

    ctx.save();
    ctx.shadowColor = hexToRGBA('#000000', bgIsDark ? 0.34 : 0.18);
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(footerPillX, footerPillY, footerPillWidth, footerPillHeight, footerPillHeight / 2);
    ctx.fill();
    ctx.restore();

    if (brandLogo) {
        drawOverflowCrest(ctx, {
            x: footerPillX + footerPaddingX + footerIconSize / 2,
            y: footerCenterY,
            width: footerIconSize,
            height: footerIconSize,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark: false,
            showFrame: false,
        });
    }

    const footerTextX = footerPillX + footerPaddingX + footerIconSize + footerGap;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${isStory ? 24 : 21}px ${FONT_EDITORIAL}`;
    ctx.fillStyle = getContrastColor(accentColor);
    ctx.fillText('G22', footerTextX, footerCenterY + 1);
    ctx.font = `800 ${isStory ? 24 : 21}px ${FONT_BODY}`;
    ctx.fillText('Scores', footerTextX + footerG22Width + footerTextGap, footerCenterY + 1);
    ctx.restore();

    if (tournamentLogo) {
        const competitionLogoSize = isStory ? 86 : 78;
        const competitionLogoX = canvas.width - (isStory ? 84 : 74);
        const competitionLogoY = canvas.height - (isStory ? 74 : 68);

        ctx.save();
        ctx.shadowColor = hexToRGBA('#000000', bgIsDark ? 0.36 : 0.18);
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = hexToRGBA(accentColor, bgIsDark ? 0.2 : 0.14);
        ctx.beginPath();
        ctx.arc(competitionLogoX, competitionLogoY, competitionLogoSize / 2 + 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        drawOverflowCrest(ctx, {
            x: competitionLogoX,
            y: competitionLogoY,
            width: competitionLogoSize,
            height: competitionLogoSize,
            img: tournamentLogo,
            label: data.tournament || 'Torneo',
            rawLogo: data.tournamentLogo,
            isDark: true,
            showFrame: false,
        });
    }
}

async function drawPosterV3Standings(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    return drawPosterV3StandingsRedesign(ctx, canvas, data, slide, format, accentColor, bgColor, brandLogo);
}

async function drawPosterV3StandingsRedesign(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isStory = format.height > format.width;
    const rows = slide.groups.flatMap((group) => group.rows);
    const [tournamentLogo, ...logos] = await Promise.all([
        loadImage(getTournamentLogoImageSource(data)),
        ...rows.map((row) => loadImage(row.teamLogo || '')),
    ]);
    const title = (data.title?.trim() || 'Standings').toUpperCase();
    const headerLabel = 'CLASIFICACION';
    const sideTape = 'CLASIFICACION';
    const darkFrame = mixHexColors(bgColor, '#05070b', getContrastColor(bgColor) === '#ffffff' ? 0.54 : 0.14);
    const frameGlow = mixHexColors(bgColor, accentColor, 0.34);
    const accentStrong = mixHexColors(accentColor, '#ffffff', 0.18);
    const accentSoft = mixHexColors(accentColor, bgColor, 0.12);
    const panelColor = mixHexColors(bgColor, accentColor, getContrastColor(bgColor) === '#ffffff' ? 0.08 : 0.12);
    const panelShade = mixHexColors(panelColor, accentColor, 0.2);
    const panelText = getContrastColor(panelColor);
    const tableHeaderFill = mixHexColors(bgColor, accentColor, 0.18);
    const tableBodyFill = mixHexColors(bgColor, accentColor, 0.1);
    const tableHeaderText = getContrastColor(tableHeaderFill);
    const tableBodyText = getContrastColor(tableBodyFill);
    const statText = getContrastColor(tableBodyFill);
    const dividerLight = hexToRGBA(mixHexColors(panelText === '#ffffff' ? '#ffffff' : '#0f172a', accentColor, 0.2), 0.68);
    const tableRule = hexToRGBA(panelText === '#ffffff' ? '#ffffff' : '#0f172a', 0.14);
    const subtleRule = hexToRGBA(panelText === '#ffffff' ? '#ffffff' : '#0f172a', 0.08);
    const highlightColor = data.highlightColor?.trim() || mixHexColors(accentColor, '#ffffff', 0.24);
    const highlightTextColor = data.highlightTextColor?.trim() || getContrastColor(highlightColor);
    const negativeDiffColor = mixHexColors('#ef4444', '#ffffff', 0.1);
    const positiveDiffColor = mixHexColors('#22c55e', '#ffffff', 0.08);
    const outerInset = isStory ? 34 : 24;
    const panelInset = isStory ? 74 : 52;
    const panelTop = isStory ? 76 : 36;
    const panelBottom = canvas.height - (isStory ? 84 : 42);
    const panelWidth = canvas.width - panelInset * 2;
    const panelHeight = panelBottom - panelTop;
    const logoBandY = panelTop + (isStory ? 48 : 40);
    const titleFontBaseSize = isStory ? 196 : 156;
    const titleTopY = panelTop + (isStory ? 156 : 140);
    ctx.font = `900 ${titleFontBaseSize}px ${FONT_EDITORIAL_SCORE}`;
    const titleFontSize = setFittedFont(ctx, 'CLASIFICACION', panelWidth - 120, '900', titleFontBaseSize, FONT_EDITORIAL_SCORE, 80);
    const bigTitleY = titleTopY + Math.round(titleFontSize * 0.86) - 40;
    const titleBottomY = bigTitleY + Math.round(titleFontSize * 0.06);
    const tableTop = titleBottomY + 20;
    const tableBottom = panelBottom - (isStory ? 110 : 70);
    const tableLeft = panelInset + (isStory ? 42 : 38);
    const tableRight = canvas.width - panelInset - (isStory ? 42 : 38);
    const tableWidth = tableRight - tableLeft;
    const tableHeaderHeight = isStory ? 56 : 46;
    const availableRowsHeight = tableBottom - tableTop - tableHeaderHeight;
    const hasGroupLabels = slide.groups.some((group) => Boolean(formatStandingsGroupLabel(group)));
    const groupLabelHeight = hasGroupLabels ? (isStory ? 24 : 18) : 0;
    const groupGap = hasGroupLabels ? (isStory ? 10 : 8) : 0;
    const rowCount = Math.max(rows.length, 1);
    const reservedGroupSpace = slide.groups.reduce((total, group, index) => {
        if (!formatStandingsGroupLabel(group)) return total;
        return total + groupLabelHeight + (index > 0 ? groupGap : 0);
    }, 0);
    const rowHeight = clampNumber((availableRowsHeight - reservedGroupSpace) / rowCount, isStory ? 40 : 40, isStory ? 62 : 42);
    const crestSize = clampNumber(rowHeight * 0.62, 24, 34);
    const normalizedHighlightTeam = data.highlightTeam?.trim().toLowerCase() || '';
    const columns = [
        { key: 'pos', label: '#', width: 0.08 },
        { key: 'club', label: 'CLUB', width: 0.46 },
        { key: 'played', label: (data.columnLabels?.played?.trim() || 'P').toUpperCase(), width: 0.07 },
        { key: 'won', label: (data.columnLabels?.won?.trim() || 'W').toUpperCase(), width: 0.07 },
        { key: 'drawn', label: 'D', width: 0.07 },
        { key: 'lost', label: 'L', width: 0.07 },
        { key: 'diff', label: (data.columnLabels?.diff?.trim() || 'GD').toUpperCase(), width: 0.08 },
        { key: 'points', label: (data.columnLabels?.points?.trim() || 'PTS').toUpperCase(), width: 0.1 },
    ] as const;
    const columnXs: Record<string, { left: number; width: number; center: number }> = {};
    let columnCursor = tableLeft;
    columns.forEach((column, index) => {
        const width = index === columns.length - 1
            ? tableRight - columnCursor
            : Math.round(tableWidth * column.width);
        columnXs[column.key] = {
            left: columnCursor,
            width,
            center: columnCursor + width / 2,
        };
        columnCursor += width;
    });
    const clubTextMaxWidth = Math.max(150, columnXs.club.width - crestSize - 42);
    const teamFontSize = getSharedFittedFontSize(
        ctx,
        rows.map((row) => ({ text: row.team.trim().toUpperCase(), maxWidth: clubTextMaxWidth })),
        '900',
        isStory ? 26 : 17,
        FONT_BODY,
        10,
    );
    const statFontSize = clampNumber(rowHeight * 0.36, 12, isStory ? 24 : 18);
    const posFontSize = clampNumber(rowHeight * 0.44, 16, isStory ? 28 : 22);
    const borderWord = sideTape.replace(/\s+/g, '   ');
    const pageLabel = slide.totalPages > 1 ? `${slide.pageNumber}/${slide.totalPages}` : '';

    const drawStar = (centerX: number, centerY: number, radius: number, fill: string, glow = false) => {
        ctx.save();
        ctx.translate(centerX, centerY);
        if (glow) {
            ctx.shadowColor = hexToRGBA(fill, 0.5);
            ctx.shadowBlur = radius * 1.8;
        }
        ctx.beginPath();
        for (let index = 0; index < 10; index += 1) {
            const angle = -Math.PI / 2 + (Math.PI / 5) * index;
            const currentRadius = index % 2 === 0 ? radius : radius * 0.42;
            const x = Math.cos(angle) * currentRadius;
            const y = Math.sin(angle) * currentRadius;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
    };

    const getDrawValue = (row: StandingsRowData) => {
        const played = Number(row.played);
        const won = Number(row.won);
        const lost = Number(row.lost);
        if (Number.isFinite(played) && Number.isFinite(won) && Number.isFinite(lost)) {
            return String(Math.max(0, played - won - lost));
        }
        return '-';
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const borderGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    borderGradient.addColorStop(0, darkFrame);
    borderGradient.addColorStop(0.38, frameGlow);
    borderGradient.addColorStop(0.68, mixHexColors(darkFrame, '#02040a', 0.42));
    borderGradient.addColorStop(1, mixHexColors(accentColor, darkFrame, 0.58));
    ctx.fillStyle = borderGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    const aura = ctx.createRadialGradient(canvas.width * 0.2, canvas.height * 0.08, 0, canvas.width * 0.2, canvas.height * 0.08, canvas.width * 0.5);
    aura.addColorStop(0, hexToRGBA(accentColor, 0.38));
    aura.addColorStop(0.45, hexToRGBA(accentColor, 0.12));
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = hexToRGBA('#ffffff', 0.14);
    for (let y = 0; y < canvas.height; y += 6) {
        ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = panelColor;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 22;
    ctx.fillRect(panelInset, panelTop, panelWidth, panelHeight);
    ctx.restore();

    const panelGradient = ctx.createLinearGradient(panelInset, panelTop, panelInset, panelBottom);
    panelGradient.addColorStop(0, hexToRGBA(mixHexColors(panelColor, accentColor, 0.08), 0.96));
    panelGradient.addColorStop(1, hexToRGBA(panelShade, 0.92));
    ctx.fillStyle = panelGradient;
    ctx.fillRect(panelInset, panelTop, panelWidth, panelHeight);

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = subtleRule;
    for (let x = panelInset; x < panelInset + panelWidth; x += 18) {
        for (let y = panelTop; y < panelBottom; y += 18) {
            if (((x + y) / 18) % 2 === 0) ctx.fillRect(x, y, 2, 2);
        }
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = dividerLight;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panelInset, panelTop, panelWidth, panelHeight);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = getContrastColor(darkFrame) === '#ffffff' ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${isStory ? 12 : 10}px ${FONT_MONO}`;
    const topTapeY = isStory ? 12 : 10;
    const bottomTapeY = canvas.height - (isStory ? 12 : 10);
    for (let x = 92; x < canvas.width - 92; x += 156) {
        ctx.fillText(borderWord, x, topTapeY);
        ctx.fillText(borderWord, x, bottomTapeY);
    }
    ctx.restore();

    drawPosterV3VerticalSideLabel(ctx, borderWord, outerInset - 2, canvas.height / 2, canvas.height - 180, isStory ? 24 : 18, hexToRGBA('#ffffff', 0.9));
    drawPosterV3VerticalSideLabel(ctx, borderWord, canvas.width - outerInset + 2, canvas.height / 2, canvas.height - 180, isStory ? 24 : 18, hexToRGBA('#ffffff', 0.9));

    drawStar(outerInset + 18, panelTop + 170, isStory ? 26 : 20, accentStrong, true);
    drawStar(outerInset + 16, panelTop + 228, isStory ? 20 : 16, accentStrong);
    drawStar(outerInset + 18, panelTop + 284, isStory ? 26 : 20, accentStrong, true);
    drawStar(canvas.width - outerInset - 18, panelBottom - 174, isStory ? 26 : 20, accentStrong, true);
    drawStar(canvas.width - outerInset - 16, panelBottom - 118, isStory ? 20 : 16, accentStrong);
    drawStar(canvas.width - outerInset - 18, panelBottom - 62, isStory ? 26 : 20, accentStrong, true);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = panelText;
    ctx.font = `900 ${isStory ? 34 : 22}px ${FONT_BODY}`;
    let logoAnchorX = panelInset + (isStory ? 56 : 44);
    if (tournamentLogo) {
        drawLogoBadge(ctx, {
            x: logoAnchorX + (isStory ? 30 : 26),
            y: logoBandY,
            size: isStory ? 60 : 52,
            img: tournamentLogo,
            label: title,
            rawLogo: data.tournamentLogo,
            isDark: false,
        });
        logoAnchorX += isStory ? 82 : 72;
    }
    const leagueBlockWidth = panelWidth * 0.44;
    setFittedFont(ctx, title, leagueBlockWidth, '900', isStory ? 34 : 22, FONT_BODY, 12);
    ctx.fillText(truncateTextToWidth(ctx, title, leagueBlockWidth), logoAnchorX, logoBandY);
    ctx.restore();

    const dividerX = canvas.width / 2 + (isStory ? 24 : 18);
    ctx.save();
    ctx.strokeStyle = accentStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dividerX, logoBandY - 26);
    ctx.lineTo(dividerX, logoBandY + 26);
    ctx.stroke();
    ctx.restore();

    const rightChipX = dividerX + (isStory ? 28 : 20);
    const rightChipWidth = panelInset + panelWidth - rightChipX - (isStory ? 56 : 44);
    drawPosterV3BroadcastChip(
        ctx,
        rightChipX,
        logoBandY - (isStory ? 26 : 22),
        rightChipWidth,
        isStory ? 56 : 46,
        headerLabel,
        hexToRGBA(accentSoft, 0.18),
        accentStrong,
        brandLogo,
        '/icon.png',
    );

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accentColor;
    ctx.font = `900 ${titleFontSize}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText('CLASIFICACION', canvas.width / 2, bigTitleY);
    ctx.restore();

    if (pageLabel) {
        ctx.save();
        ctx.fillStyle = hexToRGBA(panelText, 0.6);
        ctx.textAlign = 'right';
        ctx.font = `700 ${isStory ? 16 : 12}px ${FONT_MONO}`;
        ctx.fillText(pageLabel, panelInset + panelWidth - 24, panelTop + 26);
        ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = tableHeaderFill;
    ctx.fillRect(tableLeft, tableTop, tableWidth, tableHeaderHeight);
    ctx.restore();

    const tableBodyHeight = slide.groups.reduce((total, group, index) => {
        const label = formatStandingsGroupLabel(group);
        return total + group.rows.length * rowHeight + (label ? groupLabelHeight + (index > 0 ? groupGap : 0) : 0);
    }, tableHeaderHeight);
    const bodyBottomY = tableTop + tableBodyHeight;

    ctx.save();
    ctx.fillStyle = tableBodyFill;
    ctx.fillRect(tableLeft, tableTop + tableHeaderHeight, tableWidth, bodyBottomY - tableTop - tableHeaderHeight);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = dividerLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(tableLeft, tableTop, tableWidth, bodyBottomY - tableTop);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tableHeaderText;
    ctx.font = `900 ${isStory ? 16 : 13}px ${FONT_BODY}`;
    columns.forEach((column) => {
        if (column.key === 'club') {
            ctx.textAlign = 'left';
            ctx.fillText(column.label, columnXs.club.left + 18, tableTop + tableHeaderHeight / 2 + 1);
            ctx.textAlign = 'center';
        } else {
            ctx.fillText(column.label, columnXs[column.key].center, tableTop + tableHeaderHeight / 2 + 1);
        }
    });
    ctx.restore();

    const zoneBands: Array<{ label: string; color: string; startY: number; endY: number }> = [];
    let activeZoneBand: { label: string; color: string; startY: number; endY: number } | null = null;
    let cursorY = tableTop + tableHeaderHeight;
    let logoIndex = 0;

    slide.groups.forEach((group, groupIndex) => {
        const label = formatStandingsGroupLabel(group);
        if (label) {
            if (groupIndex > 0) cursorY += groupGap;
            activeZoneBand = null;

            ctx.save();
            ctx.fillStyle = hexToRGBA(accentColor, 0.14);
            ctx.fillRect(tableLeft, cursorY, tableWidth, groupLabelHeight);
            ctx.fillStyle = accentStrong;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${isStory ? 14 : 11}px ${FONT_MONO}`;
            ctx.fillText(label, tableLeft + 16, cursorY + groupLabelHeight / 2 + 1);
            ctx.restore();
            cursorY += groupLabelHeight;
        }

        group.rows.forEach((row, index) => {
            const y = cursorY;
            const centerY = y + rowHeight / 2;
            const logo = logos[logoIndex] || null;
            const zoneLabel = row.labelName?.trim() || '';
            const zoneColor = row.zoneColor || accentColor;
            const isHighlightedRow =
                (normalizedHighlightTeam && row.team.trim().toLowerCase() === normalizedHighlightTeam) ||
                (typeof data.highlightPosition === 'number' && row.pos === data.highlightPosition);
            const diffText = data.plainDiff ? String(row.diff).trim() || '-' : formatDiff(row.diff);
            const drawValue = getDrawValue(row);
            const shouldDrawDivider = !(groupIndex === slide.groups.length - 1 && index === group.rows.length - 1);
            logoIndex += 1;

            if (zoneLabel) {
                if (
                    activeZoneBand &&
                    activeZoneBand.label === zoneLabel &&
                    activeZoneBand.color === zoneColor &&
                    Math.abs(activeZoneBand.endY - y) < 1
                ) {
                    activeZoneBand.endY = y + rowHeight;
                } else {
                    activeZoneBand = { label: zoneLabel, color: zoneColor, startY: y, endY: y + rowHeight };
                    zoneBands.push(activeZoneBand);
                }
            } else {
                activeZoneBand = null;
            }

            ctx.save();
            ctx.fillStyle = isHighlightedRow
                ? highlightColor
                : index % 2 === 0
                    ? hexToRGBA('#ffffff', 0.04)
                    : hexToRGBA('#ffffff', 0.12);
            ctx.fillRect(tableLeft, y, tableWidth, rowHeight);
            ctx.restore();

            if (shouldDrawDivider) {
                ctx.save();
                ctx.strokeStyle = tableRule;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(tableLeft, y + rowHeight + 0.5);
                ctx.lineTo(tableRight, y + rowHeight + 0.5);
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isHighlightedRow ? highlightTextColor : accentStrong;
            ctx.font = `900 ${posFontSize}px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(String(row.pos), columnXs.pos.center, centerY + 1);
            ctx.restore();

            drawOverflowCrest(ctx, {
                x: columnXs.club.left + 18 + crestSize / 2,
                y: centerY,
                width: crestSize,
                height: crestSize,
                img: logo,
                label: row.team,
                rawLogo: row.teamLogo,
                isDark: true,
                showFrame: false,
            });

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isHighlightedRow ? highlightTextColor : tableBodyText;
            ctx.font = `900 ${teamFontSize}px ${FONT_BODY}`;
            const clubTextX = columnXs.club.left + crestSize + 34;
            ctx.fillText(truncateTextToWidth(ctx, row.team.toUpperCase(), clubTextMaxWidth), clubTextX, centerY + 1);
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isHighlightedRow ? highlightTextColor : statText;
            ctx.font = `800 ${statFontSize}px ${FONT_BODY}`;
            ctx.fillText(String(row.played ?? '-'), columnXs.played.center, centerY + 1);
            ctx.fillText(String(row.won ?? '-'), columnXs.won.center, centerY + 1);
            ctx.fillText(drawValue, columnXs.drawn.center, centerY + 1);
            ctx.fillText(String(row.lost ?? '-'), columnXs.lost.center, centerY + 1);
            ctx.fillStyle = isHighlightedRow
                ? highlightTextColor
                : diffText.startsWith('-')
                    ? negativeDiffColor
                    : diffText.startsWith('+')
                        ? positiveDiffColor
                        : statText;
            ctx.fillText(diffText, columnXs.diff.center, centerY + 1);

            const pointsBoxWidth = Math.min(56, columnXs.points.width - 10);
            const pointsBoxHeight = Math.max(24, rowHeight - 12);
            const pointsBoxX = columnXs.points.center - pointsBoxWidth / 2;
            const pointsBoxY = centerY - pointsBoxHeight / 2;
            ctx.fillStyle = isHighlightedRow ? hexToRGBA(highlightTextColor, 0.16) : hexToRGBA(accentColor, 0.22);
            ctx.beginPath();
            ctx.roundRect(pointsBoxX, pointsBoxY, pointsBoxWidth, pointsBoxHeight, 999);
            ctx.fill();
            ctx.fillStyle = isHighlightedRow ? highlightTextColor : tableBodyText;
            ctx.font = `900 ${Math.max(12, statFontSize)}px ${FONT_BODY}`;
            ctx.fillText(String(row.points ?? '-'), columnXs.points.center, centerY + 1);
            ctx.restore();

            cursorY += rowHeight;
        });
    });

    zoneBands.forEach((band) => {
        const bandX = tableLeft - (isStory ? 24 : 20);
        const bandWidth = isStory ? 10 : 8;
        const bandHeight = Math.max(10, band.endY - band.startY);
        ctx.save();
        ctx.fillStyle = band.color;
        ctx.beginPath();
        ctx.roundRect(bandX, band.startY, bandWidth, bandHeight, 999);
        ctx.fill();
        ctx.restore();
    });

    if (brandLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width / 2 + 40,
            y: panelBottom - 26,
            size: isStory ? 32 : 26,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark: false,
        });
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hexToRGBA(panelText, 0.62);
    ctx.font = `700 ${isStory ? 13 : 10}px ${FONT_MONO}`;
    ctx.fillText(borderWord, canvas.width / 2 - 30, panelBottom - 26);
    ctx.restore();
}

// Legacy poster-v3 daily matches layout kept temporarily while the new one settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function drawPosterV3DailyMatchesLegacyUnused(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isStory = format.height > format.width;
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const matches = data.matches.slice(0, 10);
    const logos = await Promise.all(matches.flatMap((match) => [loadImage(match.homeLogo || ''), loadImage(match.awayLogo || '')]));
    const allFinished = matches.length > 0 && matches.every((match) => match.status === 'finished');
    const primaryBg = mixHexColors('#081227', bgColor, 0.82);
    const secondaryBg = mixHexColors('#1d4ed8', bgColor, 0.5);
    const panelColor = hexToRGBA(mixHexColors('#0b1435', bgColor, 0.72), 0.9);
    const panelStroke = hexToRGBA(mixHexColors('#ffffff', accentColor, 0.44), 0.12);
    const accent = accentColor;
    const accentSoft = mixHexColors('#00D1B2', accentColor, 0.46);
    const cardColor = mixHexColors('#ffffff', accentColor, 0.08);
    const cardTextColor = getContrastColor(cardColor);
    const teamTextColor = getContrastColor(primaryBg) === '#ffffff' ? '#ffffff' : '#f8fafc';
    const rowDivider = hexToRGBA(mixHexColors('#ffffff', accentColor, 0.28), 0.12);
    const matchdayNumber = (() => {
        const source = `${data.date || ''} ${data.tournament || ''}`;
        const found = source.match(/\b(\d{1,2})\b/);
        if (found) return found[1];
        return String(matches.length || 0).padStart(2, '0');
    })();
    const headerWord = allFinished ? 'RESULTS' : 'MATCHDAY';
    const panelX = 118;
    const panelWidth = canvas.width - panelX * 2;
    const panelY = 84;
    const panelHeight = canvas.height - 146;
    const headerX = panelX + 46;
    const headerY = panelY + 88;
    const listTop = panelY + 164;
    const listBottom = panelY + panelHeight - 42;
    const rowGap = 10;
    const rowHeight = Math.min(96, (listBottom - listTop - rowGap * Math.max(matches.length - 1, 0)) / Math.max(matches.length, 1));
    const centerCardWidth = 168;
    const centerCardHeight = Math.max(72, rowHeight - 12);
    const logoSize = Math.max(28, Math.min(40, rowHeight * 0.42));
    const teamBlockInset = 24;
    const sideBlockWidth = (panelWidth - centerCardWidth - 64) / 2;
    const teamNameWidth = sideBlockWidth - logoSize - 24;
    const leftNameRightX = panelX + teamBlockInset + teamNameWidth;
    const leftLogoCenterX = panelX + teamBlockInset + teamNameWidth + 16 + logoSize / 2;
    const centerCardX = canvas.width / 2 - centerCardWidth / 2;
    const rightLogoCenterX = panelX + panelWidth - teamBlockInset - sideBlockWidth + logoSize / 2;
    const rightNameLeftX = rightLogoCenterX + logoSize / 2 + 16;

    const getCenterCardMeta = (match: DailyMatchesData['matches'][number]) => {
        const daySource = (match.dateLabel || '').trim();
        const weekdayMatch = daySource.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/);
        const dateMatch = daySource.match(/(\d{1,2})[\/.-](\d{1,2})|(\d{1,2})/);
        const timeMatch = String(match.time || '').match(/\d{1,2}:\d{2}/);
        const weekday = weekdayMatch ? weekdayMatch[0].slice(0, 3).toUpperCase() : allFinished ? 'FT' : 'DAY';
        const day = dateMatch ? (dateMatch[1] || dateMatch[3] || '--').padStart(2, '0') : '--';

        if (match.status === 'scheduled') {
            return {
                top: `${weekday} ${day}`.trim(),
                bottom: timeMatch ? timeMatch[0] : String(match.time || '--:--'),
                tone: cardTextColor,
                topColor: cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.72)' : '#6B7280',
            };
        }

        if (match.status === 'live') {
            return {
                top: 'LIVE',
                bottom: `${match.homeScore ?? '-'}:${match.awayScore ?? '-'}`,
                tone: mixHexColors('#ef4444', accentColor, 0.18),
                topColor: cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.72)' : '#6B7280',
            };
        }

        return {
            top: `${weekday} ${day}`.trim() || 'FINAL',
            bottom: `${match.homeScore ?? '-'}:${match.awayScore ?? '-'}`,
            tone: cardTextColor,
            topColor: cardTextColor === '#ffffff' ? 'rgba(255,255,255,0.72)' : '#6B7280',
        };
    };

    let logoIndex = 0;

    ctx.fillStyle = primaryBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const backgroundGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    backgroundGradient.addColorStop(0, secondaryBg);
    backgroundGradient.addColorStop(0.55, primaryBg);
    backgroundGradient.addColorStop(1, mixHexColors('#020617', bgColor, 0.74));
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = hexToRGBA(accentSoft, 0.3);
    ctx.lineWidth = 1;
    for (let y = 0; y <= canvas.height; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();

    const topGlow = ctx.createRadialGradient(canvas.width * 0.26, canvas.height * 0.08, 0, canvas.width * 0.26, canvas.height * 0.08, canvas.width * 0.7);
    topGlow.addColorStop(0, hexToRGBA(accent, 0.24));
    topGlow.addColorStop(0.36, hexToRGBA(accent, 0.08));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawTriangle = (x: number, y: number, size: number, color: string, rotate = 0) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotate);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size / 2, size / 2);
        ctx.lineTo(-size / 2, size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    const drawShard = (x: number, y: number, width: number, height: number, color: string) => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width * 0.82, y);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x + width * 0.12, y + height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    drawShard(58, 74, 142, 38, hexToRGBA(mixHexColors('#000000', bgColor, 0.4), 0.38));
    drawShard(328, 88, 370, 44, hexToRGBA(mixHexColors('#000000', accentColor, 0.28), 0.36));
    drawShard(32, canvas.height - 264, 28, 232, hexToRGBA(mixHexColors('#111827', accentColor, 0.26), 0.6));

    drawTriangle(82, 126, 26, accentSoft, 0.12);
    drawTriangle(158, 106, 22, hexToRGBA('#ffffff', 0.72), 0);
    drawTriangle(406, 104, 30, hexToRGBA(accentSoft, 0.8), -0.06);
    drawTriangle(452, 98, 22, hexToRGBA('#ffffff', 0.24), -0.12);
    drawTriangle(canvas.width - 112, 38, 24, hexToRGBA('#ffffff', 0.9), 0);
    drawTriangle(canvas.width - 82, 124, 20, hexToRGBA('#ffffff', 0.82), 0.22);
    drawTriangle(canvas.width - 74, canvas.height - 168, 34, hexToRGBA('#ffffff', 0.88), -0.16);
    drawTriangle(canvas.width - 116, canvas.height - 110, 18, accentSoft, 0.18);
    drawTriangle(38, canvas.height - 82, 24, accentSoft, -0.18);

    if (tournamentLogo || brandLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width - 84,
            y: 64,
            size: 78,
            img: tournamentLogo || brandLogo,
            label: data.tournament || 'G22 Scores',
            rawLogo: tournamentLogo ? data.tournamentLogo : '/icon.png',
            isDark: true,
        });
    }

    ctx.save();
    ctx.fillStyle = panelColor;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 0);
    ctx.fill();
    ctx.strokeStyle = panelStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    setFittedFont(ctx, headerWord, panelWidth - 210, '900', 74, FONT_EDITORIAL_SCORE, 36);
    ctx.fillStyle = accentSoft;
    ctx.fillText(headerWord, headerX, headerY);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${isStory ? 74 : 68}px ${FONT_EDITORIAL_SCORE}`;
    ctx.fillText(matchdayNumber, panelX + panelWidth - 48, headerY);
    ctx.restore();

    matches.forEach((match, index) => {
        const y = listTop + index * (rowHeight + rowGap);
        const homeLogo = logos[logoIndex] || null;
        const awayLogo = logos[logoIndex + 1] || null;
        logoIndex += 2;
        const centerMeta = getCenterCardMeta(match);

        if (index > 0) {
            ctx.save();
            ctx.strokeStyle = rowDivider;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(panelX + 28, y - rowGap / 2);
            ctx.lineTo(panelX + panelWidth - 28, y - rowGap / 2);
            ctx.stroke();
            ctx.restore();
        }

        drawOverflowCrest(ctx, {
            x: leftLogoCenterX,
            y: y + rowHeight / 2,
            width: logoSize,
            height: logoSize,
            img: homeLogo,
            label: match.homeTeam,
            rawLogo: match.homeLogo,
            isDark: true,
            showFrame: false,
        });
        drawOverflowCrest(ctx, {
            x: rightLogoCenterX,
            y: y + rowHeight / 2,
            width: logoSize,
            height: logoSize,
            img: awayLogo,
            label: match.awayTeam,
            rawLogo: match.awayLogo,
            isDark: true,
            showFrame: false,
        });

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = teamTextColor;
        ctx.textAlign = 'right';
        setFittedFont(ctx, match.homeTeam.toUpperCase(), teamNameWidth, '800', 24, FONT_BODY, 12);
        ctx.fillText(truncateTextToWidth(ctx, match.homeTeam.toUpperCase(), teamNameWidth), leftNameRightX, y + rowHeight / 2 + 1);
        ctx.textAlign = 'left';
        setFittedFont(ctx, match.awayTeam.toUpperCase(), teamNameWidth, '800', 24, FONT_BODY, 12);
        ctx.fillText(truncateTextToWidth(ctx, match.awayTeam.toUpperCase(), teamNameWidth), rightNameLeftX, y + rowHeight / 2 + 1);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = cardColor;
        ctx.beginPath();
        ctx.roundRect(centerCardX, y + (rowHeight - centerCardHeight) / 2, centerCardWidth, centerCardHeight, 4);
        ctx.fill();
        ctx.strokeStyle = hexToRGBA(mixHexColors('#111827', accentColor, 0.12), 0.08);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = centerMeta.topColor;
        ctx.font = `800 13px ${FONT_BODY}`;
        ctx.fillText(centerMeta.top, canvas.width / 2, y + rowHeight / 2 - 10);
        ctx.fillStyle = centerMeta.tone;
        ctx.font = `900 34px ${FONT_EDITORIAL_SCORE}`;
        ctx.fillText(centerMeta.bottom, canvas.width / 2, y + rowHeight / 2 + 22);
        ctx.restore();
    });
}

async function drawPosterV3DailyMatches(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    timeMode: DailyMatchesTimeMode = 'time'
) {
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const isPost = format.height >= format.width;
    const assets = await Promise.all(data.matches.slice(0, 10).map(async (match, rowIndex) => {
        const [homeLogo, awayLogo] = await Promise.all([
            loadImage(match.homeLogo || ''),
            loadImage(match.awayLogo || ''),
        ]);

        return { match, rowIndex, homeLogo, awayLogo };
    }));
    const allScheduled = assets.length > 0 && assets.every(({ match }) => match.status === 'scheduled');
    const anyLive = assets.some(({ match }) => match.status === 'live');
    const heroLabel = allScheduled ? 'PARTIDOS' : anyLive ? 'PARTIDOS' : 'RESULTADOS';
    const sx = (value: number) => (canvas.width / 1080) * value;
    const sy = (value: number) => (canvas.height / 1350) * value;
    const base = mixHexColors(bgColor, '#05080d', 0.78);
    const topTone = mixHexColors(base, accentColor, 0.08);
    const bottomTone = mixHexColors(base, '#010203', 0.18);
    const accentStrong = mixHexColors(accentColor, '#ffffff', 0.1);
    const accentSoft = mixHexColors(accentColor, '#ffffff', 0.24);
    const headerText = getContrastColor(base) === '#ffffff' ? '#ffffff' : '#0f172a';
    const headerMuted = hexToRGBA(headerText, 0.68);
    const frameFill = hexToRGBA(mixHexColors(base, accentColor, 0.06), 0.86);
    const frameStroke = hexToRGBA(mixHexColors('#ffffff', accentColor, 0.22), 0.16);
    const lightRowFill = mixHexColors('#ffffff', accentColor, 0.04);
    const darkRowFill = mixHexColors(base, '#071018', 0.58);
    const lightRowText = getContrastColor(lightRowFill) === '#ffffff' ? '#ffffff' : '#0f172a';
    const darkRowText = getContrastColor(darkRowFill) === '#ffffff' ? '#ffffff' : '#0f172a';
    const centerFill = mixHexColors(accentColor, '#ffffff', 0.16);
    const centerText = getContrastColor(centerFill) === '#ffffff' ? '#ffffff' : '#0f172a';
    const rowDivider = hexToRGBA(mixHexColors('#ffffff', accentColor, 0.28), 0.12);
    const railLabel = (data.tournament || 'TOURNAMENT').trim().toUpperCase();
    const watermarkText = (() => {
        const words = railLabel
            .split(/[^A-Z0-9]+/)
            .map((word) => word.trim())
            .filter(Boolean)
            .filter((word) => word.length > 1);
        const initials = words.slice(0, 4).map((word) => word[0]).join('');
        if (initials.length >= 2) return initials;
        const compact = railLabel.replace(/[^A-Z0-9]/g, '');
        return compact.slice(0, 4) || 'FIX';
    })();
    const weekdayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const getOrdinalSuffix = (day: number) => {
        if (day % 100 >= 11 && day % 100 <= 13) return 'TH';
        if (day % 10 === 1) return 'ST';
        if (day % 10 === 2) return 'ND';
        if (day % 10 === 3) return 'RD';
        return 'TH';
    };
    const formatGroupLabel = (match: DailyMatchesData['matches'][number]) => {
        const kickoff = toExportDate(match.kickoffAt);
        if (kickoff) {
            const weekday = weekdayNames[kickoff.getUTCDay()] || weekdayNames[kickoff.getDay()];
            const month = monthNames[kickoff.getUTCMonth()] || monthNames[kickoff.getMonth()];
            const day = kickoff.getUTCDate() || kickoff.getDate();
            const year = kickoff.getUTCFullYear() || kickoff.getFullYear();
            return `${weekday} ${day}${getOrdinalSuffix(day)} ${month}, ${year}`;
        }

        const source = (match.dateLabel || data.date || '').replace(/\s+/g, ' ').trim();
        return source ? source.toUpperCase() : 'UPCOMING MATCHES';
    };
    const formatKickoffTime = (match: DailyMatchesData['matches'][number]) => {
        const kickoff = toExportDate(match.kickoffAt);
        if (kickoff) {
            const hours = kickoff.getUTCHours() || kickoff.getHours();
            const minutes = kickoff.getUTCMinutes() || kickoff.getMinutes();
            const period = hours >= 12 ? 'PM' : 'AM';
            const twelveHour = hours % 12 || 12;
            return `${twelveHour}:${String(minutes).padStart(2, '0')}${period}`;
        }

        const raw = String(match.time || '').trim();
        const detectedTime = raw.match(/\d{1,2}:\d{2}\s?(?:AM|PM)?/i)?.[0];
        return (detectedTime || raw || '--:--').replace(/\s+/g, '').toUpperCase();
    };
    const groups = assets.reduce<Array<{ label: string; items: typeof assets }>>((acc, asset) => {
        const label = formatGroupLabel(asset.match);
        const lastGroup = acc[acc.length - 1];
        if (lastGroup && lastGroup.label === label) {
            lastGroup.items.push(asset);
            return acc;
        }

        acc.push({ label, items: [asset] });
        return acc;
    }, []);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, topTone);
    bgGradient.addColorStop(0.5, base);
    bgGradient.addColorStop(1, bottomTone);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topGlow = ctx.createRadialGradient(canvas.width * 0.28, sy(140), 0, canvas.width * 0.28, sy(140), sx(340));
    topGlow.addColorStop(0, hexToRGBA(accentStrong, 0.22));
    topGlow.addColorStop(0.4, hexToRGBA(accentStrong, 0.08));
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bottomGlow = ctx.createRadialGradient(canvas.width * 0.86, canvas.height, 0, canvas.width * 0.86, canvas.height, sx(420));
    bottomGlow.addColorStop(0, hexToRGBA(accentSoft, 0.14));
    bottomGlow.addColorStop(0.46, hexToRGBA(accentSoft, 0.05));
    bottomGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = hexToRGBA('#ffffff', 0.09);
    ctx.lineWidth = 1;
    for (let y = 0; y <= canvas.height; y += sy(18)) {
        ctx.beginPath();
        ctx.moveTo(sx(76), y + 0.5);
        ctx.lineTo(canvas.width - sx(76), y + 0.5);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(sx(134), canvas.height * 0.54);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = hexToRGBA('#ffffff', 0.08);
    ctx.lineWidth = sx(2.4);
    setFittedFont(ctx, watermarkText, canvas.height * 0.38, '900', sy(120), FONT_EDITORIAL_SCORE, sy(68));
    const safeWatermark = truncateTextToWidth(ctx, watermarkText, canvas.height * 0.38);
    ctx.strokeText(safeWatermark, 0, 0);
    ctx.restore();

    const leftHeaderLogo = brandLogo || tournamentLogo;
    const rightHeaderLogo = tournamentLogo && tournamentLogo !== leftHeaderLogo ? tournamentLogo : (brandLogo && brandLogo !== leftHeaderLogo ? brandLogo : null);
    const titleY = sy(134);
    const titleMaxWidth = canvas.width - sx(180);

    if (leftHeaderLogo) {
        drawOverflowCrest(ctx, {
            x: sx(58),
            y: sy(50),
            width: sx(63),
            height: sx(63),
            img: leftHeaderLogo,
            label: 'Brand',
            rawLogo: '/icon.png',
            isDark: true,
            showFrame: false,
        });
    }

    if (rightHeaderLogo) {
        drawOverflowCrest(ctx, {
            x: canvas.width - sx(58),
            y: sy(50),
            width: sx(63),
            height: sx(63),
            img: rightHeaderLogo,
            label: data.tournament || 'Tournament',
            rawLogo: data.tournamentLogo || '/icon.png',
            isDark: true,
            showFrame: false,
        });
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = headerText;
    setFittedFont(ctx, heroLabel, titleMaxWidth, '900', sy(isPost ? 76 : 70), FONT_EDITORIAL_SCORE, sy(44));
    ctx.fillText(truncateTextToWidth(ctx, heroLabel, titleMaxWidth), canvas.width / 2, titleY);
    ctx.fillStyle = headerMuted;
    setFittedFont(ctx, railLabel, canvas.width - sx(220), '800', sy(20), FONT_BODY, sy(12));
    ctx.fillText(truncateTextToWidth(ctx, railLabel, canvas.width - sx(220)), canvas.width / 2, titleY + sy(28));
    ctx.font = `700 ${sy(14)}px ${FONT_MONO}`;
    ctx.fillText(truncateTextToWidth(ctx, (data.date || '').toUpperCase(), canvas.width - sx(260)), canvas.width / 2, titleY + sy(54));
    ctx.restore();

    const listPanelX = sx(92);
    const listPanelY = sy(206);
    const listPanelWidth = canvas.width - sx(184);
    const listInnerX = listPanelX + sx(18);
    const listInnerWidth = listPanelWidth - sx(36);
    const rowGap = sy(8);
    const groupGap = sy(14);
    const sectionHeaderHeight = sy(30);
    const rowRadius = sy(12);
    const listTopInset = sy(22);
    const listBottomInset = sy(20);
    const rowWidth = listInnerWidth;
    const rowX = listInnerX;
    const centerBlockWidth = clampNumber(rowWidth * 0.14, sx(112), sx(138));
    const sideWidth = (rowWidth - centerBlockWidth) / 2;
    const crestGap = sx(14);
    const rowPaddingX = sx(18);
    const fixedVerticalSpace = groups.length * sectionHeaderHeight
        + groups.length * sy(10)
        + Math.max(0, groups.length - 1) * groupGap
        + assets.length * rowGap;
    const targetBottomInset = sy(64);
    const maxUsableHeight = canvas.height - listPanelY - targetBottomInset;
    const rowHeight = clampNumber(
        (maxUsableHeight - listTopInset - listBottomInset - fixedVerticalSpace) / Math.max(assets.length, 1),
        sy(58),
        sy(84)
    );
    const crestSize = clampNumber(rowHeight * 0.56, sx(36), sx(48));
    const listPanelHeight = listTopInset + listBottomInset + fixedVerticalSpace + rowHeight * Math.max(assets.length, 1);
    const listTop = listPanelY + listTopInset;
    const nameFontSize = getSharedFittedFontSize(
        ctx,
        assets.flatMap(({ match }) => ([
            { text: match.homeTeam.toUpperCase(), maxWidth: Math.max(sx(92), sideWidth - rowPaddingX * 2 - crestSize - crestGap) },
            { text: match.awayTeam.toUpperCase(), maxWidth: Math.max(sx(92), sideWidth - rowPaddingX * 2 - crestSize - crestGap) },
        ])),
        '900',
        sy(24),
        FONT_BODY,
        sy(12)
    );

    ctx.save();
    ctx.fillStyle = frameFill;
    ctx.strokeStyle = frameStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(listPanelX, listPanelY, listPanelWidth, listPanelHeight, sy(28));
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    let cursorY = listTop;
    groups.forEach((group, groupIndex) => {
        ctx.save();
        ctx.fillStyle = hexToRGBA('#ffffff', 0.04);
        ctx.beginPath();
        ctx.roundRect(rowX, cursorY, rowWidth, sectionHeaderHeight, sectionHeaderHeight / 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = hexToRGBA(accentSoft, 0.96);
        ctx.beginPath();
        ctx.roundRect(rowX + sx(8), cursorY + sy(6), sx(8), sectionHeaderHeight - sy(12), sy(4));
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = headerText;
        setFittedFont(ctx, group.label, rowWidth - sx(46), '800', sy(16), FONT_BODY, sy(10));
        ctx.fillText(truncateTextToWidth(ctx, group.label, rowWidth - sx(46)), rowX + sx(28), cursorY + sectionHeaderHeight / 2 + 1);
        ctx.restore();

        cursorY += sectionHeaderHeight + sy(10);

        group.items.forEach((asset, itemIndex) => {
            const { match, homeLogo, awayLogo, rowIndex } = asset;
            const isLightRow = rowIndex % 2 === 0;
            const rowFill = isLightRow ? lightRowFill : darkRowFill;
            const rowText = isLightRow ? lightRowText : darkRowText;
            const centerY = cursorY + rowHeight / 2;
            const homeBlockLeft = rowX + rowPaddingX;
            const homeBlockRight = rowX + sideWidth - rowPaddingX;
            const awayBlockLeft = rowX + sideWidth + centerBlockWidth + rowPaddingX;
            const awayBlockRight = rowX + rowWidth - rowPaddingX;
            const homeLogoX = homeBlockLeft + crestSize / 2;
            const awayLogoX = awayBlockRight - crestSize / 2;
            const homeTextLeft = homeLogoX + crestSize / 2 + crestGap;
            const awayTextRight = awayLogoX - crestSize / 2 - crestGap;
            const centerBlockX = rowX + sideWidth;
            const scoreLabel = `${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}`;
            const centerPrimary = match.status === 'scheduled'
                ? (timeMode === 'vs' ? 'VS' : formatKickoffTime(match))
                : match.status === 'live' ? 'LIVE' : scoreLabel;
            const centerSecondary = match.status === 'scheduled' ? '' : match.status === 'live' ? scoreLabel : 'FINAL';
            const homeTextWidth = Math.max(sx(92), homeBlockRight - homeTextLeft);
            const awayTextWidth = Math.max(sx(92), awayTextRight - awayBlockLeft);

            ctx.save();
            ctx.fillStyle = rowFill;
            ctx.beginPath();
            ctx.roundRect(rowX, cursorY, rowWidth, rowHeight, rowRadius);
            ctx.fill();
            ctx.strokeStyle = hexToRGBA(isLightRow ? '#0f172a' : '#ffffff', isLightRow ? 0.08 : 0.1);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = hexToRGBA(centerFill, isLightRow ? 0.96 : 0.9);
            ctx.beginPath();
            ctx.roundRect(centerBlockX, cursorY, centerBlockWidth, rowHeight, sy(8));
            ctx.fill();
            ctx.restore();

            drawOverflowCrest(ctx, { x: homeLogoX, y: centerY, width: crestSize, height: crestSize, img: homeLogo, label: match.homeTeam, rawLogo: match.homeLogo || match.homeTeam, isDark: getContrastColor(rowFill) === '#ffffff', showFrame: false });
            drawOverflowCrest(ctx, { x: awayLogoX, y: centerY, width: crestSize, height: crestSize, img: awayLogo, label: match.awayTeam, rawLogo: match.awayLogo || match.awayTeam, isDark: getContrastColor(rowFill) === '#ffffff', showFrame: false });

            ctx.save();
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.fillStyle = rowText;
            ctx.font = `900 ${nameFontSize}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, match.homeTeam.toUpperCase(), homeTextWidth), homeTextLeft, centerY + sy(3));
            ctx.restore();

            ctx.save();
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'right';
            ctx.fillStyle = rowText;
            ctx.font = `900 ${nameFontSize}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, match.awayTeam.toUpperCase(), awayTextWidth), awayTextRight, centerY + sy(3));
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = centerText;
            setFittedFont(ctx, centerPrimary, centerBlockWidth - sx(20), '900', sy(match.status === 'scheduled' ? 30 : 25), FONT_EDITORIAL_SCORE, sy(18));
            ctx.fillText(
                truncateTextToWidth(ctx, centerPrimary, centerBlockWidth - sx(24)),
                centerBlockX + centerBlockWidth / 2,
                match.status === 'scheduled' ? centerY + sy(8) : centerY - sy(1)
            );
            if (centerSecondary) {
                ctx.fillStyle = hexToRGBA(centerText, 0.72);
                ctx.font = `800 ${sy(10)}px ${FONT_MONO}`;
                ctx.fillText(truncateTextToWidth(ctx, centerSecondary.toUpperCase(), centerBlockWidth - sx(20)), centerBlockX + centerBlockWidth / 2, cursorY + rowHeight - sy(10));
            }
            ctx.restore();

            if (!(groupIndex === groups.length - 1 && itemIndex === group.items.length - 1)) {
                ctx.save();
                ctx.strokeStyle = rowDivider;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(rowX + sx(10), cursorY + rowHeight + rowGap / 2);
                ctx.lineTo(rowX + rowWidth - sx(10), cursorY + rowHeight + rowGap / 2);
                ctx.stroke();
                ctx.restore();
            }

            cursorY += rowHeight + rowGap;
        });

        if (groupIndex < groups.length - 1) cursorY += groupGap;
    });

    if (assets.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = headerMuted;
        ctx.font = `800 ${sy(24)}px ${FONT_BODY}`;
        ctx.fillText('NO MATCHES SELECTED', canvas.width / 2, listPanelY + listPanelHeight / 2);
        ctx.restore();
    }

}
// Legacy poster-v3 lineup layout kept temporarily while the new one settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function drawPosterV3LineupsLegacy(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    mode: LineupExportMode
) {
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const homeLogo = await loadImage(data.homeTeam.logo || '');
    const awayLogo = await loadImage(data.awayTeam.logo || '');
    const isStory = format.height > format.width;
    const neonAccent = mixHexColors(accentColor, '#d7ff00', 0.68);
    const teams = mode === 'both'
        ? [
            { team: data.homeTeam, logo: homeLogo },
            { team: data.awayTeam, logo: awayLogo },
        ]
        : mode === 'home'
            ? [{ team: data.homeTeam, logo: homeLogo }]
            : [{ team: data.awayTeam, logo: awayLogo }];

    drawPosterV3Backdrop(ctx, canvas, accentColor, bgColor);

    if (tournamentLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width / 2,
            y: 86,
            size: 70,
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: true,
        });
    }

    drawPosterV3Kicker(ctx, canvas.width / 2, 148, (data.tournament || 'Torneo').toUpperCase(), hexToRGBA(neonAccent, 0.96), 'center');
    drawPosterV3OutlineTitle(ctx, data.title || 'Alineaciones', canvas.width / 2, 228, canvas.width - 160, 116, hexToRGBA('#ffffff', 0.26), 'center');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = hexToRGBA('#ffffff', 0.76);
    ctx.font = `800 15px ${FONT_MONO}`;
    ctx.fillText([data.subtitle, data.date, data.time, data.venue].filter(Boolean).join('  •  ').toUpperCase(), canvas.width / 2, 266);
    ctx.restore();

    const columnGap = teams.length === 2 ? 24 : 0;
    const columnWidth = teams.length === 2 ? (canvas.width - 136 - columnGap) / 2 : canvas.width - 136;
    const columnXStart = teams.length === 2 ? 56 : 68;
    const columnY = 316;
    const columnHeight = canvas.height - columnY - (isStory ? 222 : 172);

    teams.forEach(({ team, logo }, index) => {
        const x = columnXStart + index * (columnWidth + columnGap);
        const accent = index === 0 ? neonAccent : mixHexColors(neonAccent, '#8be9ff', 0.54);
        const teamPlayers = [...(team.starters ?? [])].sort((left, right) => Number(left.number ?? 0) - Number(right.number ?? 0));
        const densityMode = resolveDensityMode(teamPlayers.length, teams.length === 2 ? 19 : 21, teams.length === 2 ? 22 : 23);
        const starters = teamPlayers.filter((player, playerIndex) => isLineupStarter(player, playerIndex)).slice(0, 15);
        const bench = teamPlayers
            .filter((player, playerIndex) => !isLineupStarter(player, playerIndex))
            .slice(0, getDensitySpacing(densityMode, { comfortable: 8, compact: 7, ultraCompact: 6 }));
        const starterGap = getDensitySpacing(densityMode, { comfortable: teams.length === 2 ? 8 : 7, compact: 6, ultraCompact: 5 });
        const benchGap = getDensitySpacing(densityMode, { comfortable: 4, compact: 3, ultraCompact: 2 });
        const starterRowHeight = getDensitySpacing(densityMode, { comfortable: teams.length === 2 ? 36 : 34, compact: 32, ultraCompact: 28 });
        const benchRowHeight = getDensitySpacing(densityMode, { comfortable: 26, compact: 24, ultraCompact: 22 });
        const baseHeaderHeight = isStory ? 128 : 116;
        const starterRowsHeight = starters.length > 0
            ? starters.length * starterRowHeight + Math.max(0, starters.length - 1) * starterGap
            : 0;
        const benchRowsHeight = bench.length > 0
            ? bench.length * benchRowHeight + Math.max(0, bench.length - 1) * benchGap
            : 0;
        const baseBenchSectionHeight = bench.length > 0 ? 38 : 0;
        const totalContentHeight = baseHeaderHeight + starterRowsHeight + baseBenchSectionHeight + benchRowsHeight + 26;
        const layoutScale = clampNumber(columnHeight / Math.max(totalContentHeight, 1), 0.72, 1);
        const headerHeight = Math.max(98, Math.round(baseHeaderHeight * layoutScale));
        const scaledStarterGap = Math.max(3, Math.round(starterGap * layoutScale));
        const scaledBenchGap = Math.max(2, Math.round(benchGap * layoutScale));
        const scaledStarterRowHeight = Math.max(23, Math.round(starterRowHeight * layoutScale));
        const scaledBenchRowHeight = Math.max(18, Math.round(benchRowHeight * layoutScale));
        const starterRowsBlockHeight = starters.length > 0
            ? starters.length * scaledStarterRowHeight + Math.max(0, starters.length - 1) * scaledStarterGap
            : 0;
        const benchSectionHeight = bench.length > 0 ? Math.max(28, Math.round(38 * layoutScale)) : 0;
        const listStartY = columnY + Math.max(112, headerHeight);
        const benchHeaderY = listStartY + starterRowsBlockHeight + Math.max(8, Math.round(10 * layoutScale));

        drawPosterV3Panel(ctx, x, columnY, columnWidth, columnHeight, 'rgba(4, 10, 20, 0.92)', hexToRGBA(accent, 0.7), 22, 2);
        ctx.save();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(x + 12, columnY + 12, columnWidth - 24, 18, 12);
        ctx.fill();
        ctx.restore();

        drawLogoBadge(ctx, { x: x + 56, y: columnY + 72, size: 52, img: logo, label: team.name, rawLogo: team.logo, isDark: true });

        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        setFittedFont(ctx, team.name.toUpperCase(), columnWidth - 140, '900', Math.max(20, Math.round(30 * layoutScale)), FONT_BODY, 18);
        ctx.fillText(truncateTextToWidth(ctx, team.name.toUpperCase(), columnWidth - 140), x + 92, columnY + 78);
        ctx.fillStyle = hexToRGBA('#ffffff', 0.74);
        ctx.font = `800 ${Math.max(11, Math.round(14 * layoutScale))}px ${FONT_MONO}`;
        ctx.fillText((team.lineupLabel || 'Titulares y suplentes').toUpperCase(), x + 92, columnY + 106);
        ctx.restore();

        starters.forEach((player, playerIndex) => {
            const y = listStartY + playerIndex * (scaledStarterRowHeight + scaledStarterGap);
            const numberLabel = String(player.number ?? playerIndex + 1).padStart(2, '0');
            const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();

            ctx.save();
            ctx.fillStyle = playerIndex % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)';
            ctx.beginPath();
            ctx.roundRect(x + 14, y, columnWidth - 28, scaledStarterRowHeight, 12);
            ctx.fill();
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.roundRect(x + 24, y + 5, 56, scaledStarterRowHeight - 10, 10);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#05101d';
            ctx.font = `900 ${Math.max(11, Math.round(14 * layoutScale))}px ${FONT_MONO}`;
            ctx.fillText(numberLabel, x + 52, y + scaledStarterRowHeight / 2 + 4);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffffff';
            setFittedFont(ctx, playerLabel, columnWidth - 156, '800', Math.max(11, Math.round(16 * layoutScale)), FONT_BODY, 10);
            ctx.fillText(truncateTextToWidth(ctx, playerLabel, columnWidth - 156), x + 96, y + scaledStarterRowHeight / 2 + 5);
            ctx.restore();
        });

        if (bench.length > 0) {
            ctx.save();
            ctx.fillStyle = hexToRGBA(accent, 0.16);
            ctx.beginPath();
            ctx.roundRect(x + 18, benchHeaderY, columnWidth - 36, benchSectionHeight, 999);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${Math.max(10, Math.round(12 * layoutScale))}px ${FONT_MONO}`;
            ctx.fillText('SUPLENTES', x + columnWidth / 2, benchHeaderY + benchSectionHeight / 2 + 4);
            ctx.restore();

            bench.forEach((player, benchIndex) => {
                const y = benchHeaderY + benchSectionHeight + benchIndex * (scaledBenchRowHeight + scaledBenchGap);
                const numberLabel = String(player.number ?? starters.length + benchIndex + 1).padStart(2, '0');
                const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();

                ctx.save();
                ctx.globalAlpha = 0.88;
                ctx.fillStyle = benchIndex % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
                ctx.beginPath();
                ctx.roundRect(x + 14, y, columnWidth - 28, scaledBenchRowHeight, 10);
                ctx.fill();
                ctx.fillStyle = hexToRGBA(accent, 0.84);
                ctx.beginPath();
                ctx.roundRect(x + 24, y + 4, 52, scaledBenchRowHeight - 8, 8);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.fillStyle = '#05101d';
                ctx.font = `900 ${Math.max(10, Math.round(12 * layoutScale))}px ${FONT_MONO}`;
                ctx.fillText(numberLabel, x + 50, y + scaledBenchRowHeight / 2 + 4);
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                setFittedFont(ctx, playerLabel, columnWidth - 150, '800', Math.max(10, Math.round(14 * layoutScale)), FONT_BODY, 10);
                ctx.fillText(truncateTextToWidth(ctx, playerLabel, columnWidth - 150), x + 88, y + scaledBenchRowHeight / 2 + 4);
                ctx.restore();
            });
        }
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawPosterV3Lineups(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    mode: LineupExportMode
) {
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const homeLogo = await loadImage(data.homeTeam.logo || '');
    const awayLogo = await loadImage(data.awayTeam.logo || '');
    const teams = getSelectedLineupTeams(data, mode).map((team) => ({
        ...team,
        starters: Array.isArray(team.starters)
            ? team.starters.filter((player) => player && String(player.name || '').trim())
            : [],
    }));
    const isSingleTeam = teams.length === 1;
    const highestRating = computeHighestLineupRating(teams);
    const metaLabel = getLineupMetaLabel(data);
    const accent = accentColor;
    const accentSoft = mixHexColors(accentColor, '#ffffff', 0.24);
    const primaryText = getContrastColor(mixHexColors(bgColor, '#050505', 0.7)) === '#ffffff' ? '#ffffff' : '#f8fafc';
    const secondaryText = hexToRGBA(primaryText, 0.72);
    const mutedDivider = hexToRGBA(accentSoft, 0.24);
    const palette = resolvePosterV3GradientPalette(bgColor, accentColor);

    if (isSingleTeam) {
        const selectedTeam = teams[0];
        const teamLogo = selectedTeam.side === 'home' ? homeLogo : awayLogo;
        const startersRaw = selectedTeam.starters.filter((player, index) => isLineupStarter(player, index));
        const starters = startersRaw.length > 0 ? startersRaw : selectedTeam.starters.slice(0, 11);
        const bench = selectedTeam.starters.filter((player, index) => !isLineupStarter(player, index));
        const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        bgGradient.addColorStop(0, palette.start);
        bgGradient.addColorStop(0.5, palette.mid);
        bgGradient.addColorStop(1, palette.end);
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.globalAlpha = 0.1;
        for (let side = 0; side < 2; side += 1) {
            const startX = side === 0 ? 24 : canvas.width - 184;
            for (let index = 0; index < 8; index += 1) {
                const x = startX + index * 18;
                const streak = ctx.createLinearGradient(x, 0, x + 10, 0);
                streak.addColorStop(0, 'rgba(255,255,255,0)');
                streak.addColorStop(0.5, side === 0 ? mutedDivider : hexToRGBA(accent, 0.34));
                streak.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = streak;
                ctx.fillRect(x, 0, 12, canvas.height);
            }
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = mutedDivider;
        ctx.lineWidth = 1;
        for (let y = 0; y < canvas.height; y += 12) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        ctx.restore();

        drawLogoBadge(ctx, { x: canvas.width / 2 - 32, y: 82, size: 54, img: homeLogo, label: data.homeTeam.name, rawLogo: data.homeTeam.logo, isDark: true });
        drawLogoBadge(ctx, { x: canvas.width / 2 + 32, y: 82, size: 54, img: awayLogo, label: data.awayTeam.name, rawLogo: data.awayTeam.logo, isDark: true });

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = primaryText;
        setFittedFont(ctx, 'FORMACION', canvas.width - 180, '900', 92, FONT_EDITORIAL_SCORE, 56);
        ctx.fillText('FORMACION', canvas.width / 2, 236);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = hexToRGBA(primaryText, 0.88);
        setFittedFont(ctx, selectedTeam.name.toUpperCase(), canvas.width - 220, '700', 26, FONT_BODY, 16);
        ctx.fillText(selectedTeam.name.toUpperCase(), canvas.width / 2, 282);
        ctx.restore();

        ctx.save();
        const divider = ctx.createLinearGradient(canvas.width / 2 - 180, 330, canvas.width / 2 + 180, 330);
        divider.addColorStop(0, 'rgba(255,255,255,0)');
        divider.addColorStop(0.22, hexToRGBA(accent, 0.72));
        divider.addColorStop(0.78, hexToRGBA(accentSoft, 0.94));
        divider.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = divider;
        ctx.fillRect(canvas.width / 2 - 200, 328, 400, 3);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = secondaryText;
        ctx.font = `800 15px ${FONT_MONO}`;
        const infoText = [data.tournament?.trim(), metaLabel?.trim()].filter(Boolean).join('  //  ').toUpperCase();
        ctx.fillText(truncateTextToWidth(ctx, infoText, canvas.width - 140), canvas.width / 2, 364);
        ctx.restore();

        const contentTop = 408;
        const contentBottom = canvas.height - 112;
        const contentWidth = 560;
        const numberAreaWidth = 84;
        const ratingAreaWidth = highestRating != null ? 92 : 0;
        const nameAreaWidth = contentWidth - numberAreaWidth - 12 - ratingAreaWidth;
        const numberCenterX = canvas.width / 2 - contentWidth / 2 + numberAreaWidth / 2;
        const nameX = canvas.width / 2 - contentWidth / 2 + numberAreaWidth + 12;
        const ratingRightX = canvas.width / 2 + contentWidth / 2 - 12;
        const buildBenchLayout = (labelFontSize: number, itemFontSize: number) => {
            const entries = bench.map((player, index) => {
                const ratingLabel = formatLineupExportRating(player.rating);
                const ratingValue = getLineupExportRatingValue(player.rating);
                const isTopRated = ratingValue != null && highestRating != null && ratingValue === highestRating;
                return {
                    number: String(player.number ?? starters.length + index + 1),
                    label: `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase(),
                    rating: ratingLabel ? (isTopRated ? `${ratingLabel} ★` : ratingLabel) : '',
                    isTopRated,
                };
            });
            if (entries.length === 0) return { lines: [] as typeof entries[], lineHeight: 0, height: 0 };

            ctx.save();
            ctx.font = `900 ${labelFontSize}px ${FONT_BODY}`;
            const labelWidth = ctx.measureText('SUPLENTES:').width;
            ctx.font = `800 ${itemFontSize}px ${FONT_BODY}`;
            const maxWidth = canvas.width - 120;
            const lines: typeof entries[] = [];
            let currentLine: typeof entries = [];
            let currentWidth = labelWidth + 12;

            entries.forEach((entry) => {
                const ratingSegment = entry.rating ? ` ${entry.rating}` : '';
                const segmentWidth = ctx.measureText(`${entry.number} ${entry.label}${ratingSegment}`).width + 22;
                if (currentLine.length > 0 && currentWidth + segmentWidth > maxWidth) {
                    lines.push(currentLine);
                    currentLine = [];
                    currentWidth = 0;
                }
                currentLine.push(entry);
                currentWidth += segmentWidth;
            });
            if (currentLine.length > 0) lines.push(currentLine);
            ctx.restore();

            const lineHeight = itemFontSize + 10;
            return { lines, lineHeight, height: labelFontSize + 12 + lines.length * lineHeight };
        };

        let starterNameFont = getSharedFittedFontSize(
            ctx,
            starters.map((player) => ({ text: `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase(), maxWidth: nameAreaWidth })),
            '800',
            46,
            FONT_BODY,
            22
        );
        let starterNumberFont = Math.max(22, Math.round(starterNameFont * 0.9));
        let starterRowHeight = Math.max(36, Math.round(starterNameFont * 1.14));
        let benchLabelFont = Math.max(14, Math.round(starterNameFont * 0.46));
        let benchItemFont = Math.max(14, Math.round(starterNameFont * 0.5));
        let benchLayout = buildBenchLayout(benchLabelFont, benchItemFont);
        let starterHeight = starters.length * starterRowHeight;
        let totalHeight = starterHeight + (bench.length > 0 ? 48 + benchLayout.height : 0);
        const availableHeight = contentBottom - contentTop;

        while (starterNameFont > 18 && totalHeight > availableHeight) {
            starterNameFont -= 1;
            starterNumberFont = Math.max(20, Math.round(starterNameFont * 0.88));
            starterRowHeight = Math.max(32, Math.round(starterNameFont * 1.12));
            benchLabelFont = Math.max(13, Math.round(starterNameFont * 0.44));
            benchItemFont = Math.max(13, Math.round(starterNameFont * 0.48));
            benchLayout = buildBenchLayout(benchLabelFont, benchItemFont);
            starterHeight = starters.length * starterRowHeight;
            totalHeight = starterHeight + (bench.length > 0 ? 44 + benchLayout.height : 0);
        }

        const startY = contentTop + Math.max(0, Math.round((availableHeight - totalHeight) / 2));
        starters.forEach((player, index) => {
            const centerY = startY + index * starterRowHeight + starterRowHeight / 2;
            const numberLabel = String(player.number ?? index + 1);
            const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();

            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = accent;
            ctx.font = `900 ${starterNumberFont}px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(numberLabel, numberCenterX, centerY);
            ctx.textAlign = 'left';
            ctx.fillStyle = primaryText;
            ctx.font = `800 ${starterNameFont}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, playerLabel, nameAreaWidth), nameX, centerY + 1);

            if (highestRating != null) {
                const ratingLabel = formatLineupExportRating(player.rating);
                if (ratingLabel) {
                    const ratingValue = getLineupExportRatingValue(player.rating);
                    const isTopRated = ratingValue != null && ratingValue === highestRating;
                    ctx.textAlign = 'right';
                    ctx.fillStyle = isTopRated ? '#facc15' : accent;
                    ctx.font = `800 ${starterNameFont}px ${FONT_MONO}`;
                    ctx.fillText(isTopRated ? `${ratingLabel} ★` : ratingLabel, ratingRightX, centerY + 1);
                }
            }
            ctx.restore();
        });

        if (bench.length > 0) {
            const benchY = startY + starterHeight + 44;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = primaryText;
            ctx.font = `900 ${benchLabelFont}px ${FONT_BODY}`;
            ctx.fillText('SUPLENTES:', canvas.width / 2, benchY);
            ctx.restore();

            benchLayout.lines.forEach((line, lineIndex) => {
                ctx.save();
                ctx.textBaseline = 'alphabetic';
                ctx.font = `800 ${benchItemFont}px ${FONT_BODY}`;
                let totalWidth = 0;
                line.forEach((entry, entryIndex) => {
                    totalWidth += ctx.measureText(`${entry.number} ${entry.label}`).width;
                    if (entry.rating) {
                        totalWidth += ctx.measureText(` ${entry.rating}`).width;
                    }
                    if (entryIndex < line.length - 1) totalWidth += 22;
                });
                let cursorX = canvas.width / 2 - totalWidth / 2;
                const y = benchY + 18 + (lineIndex + 1) * benchLayout.lineHeight;
                line.forEach((entry, entryIndex) => {
                    ctx.fillStyle = accent;
                    ctx.fillText(entry.number, cursorX, y);
                    cursorX += ctx.measureText(entry.number).width + 8;
                    ctx.fillStyle = primaryText;
                    ctx.fillText(entry.label, cursorX, y);
                    cursorX += ctx.measureText(entry.label).width;
                    if (entry.rating) {
                        const ratingText = ` ${entry.rating}`;
                        ctx.fillStyle = entry.isTopRated ? '#facc15' : accent;
                        ctx.fillText(ratingText, cursorX, y);
                        cursorX += ctx.measureText(ratingText).width;
                    }
                    if (entryIndex < line.length - 1) cursorX += 22;
                });
                ctx.restore();
            });
        }

        if (teamLogo) {
            drawOverflowCrest(ctx, {
                x: 66,
                y: canvas.height - 52,
                width: 34,
                height: 34,
                img: teamLogo,
                label: selectedTeam.name,
                rawLogo: selectedTeam.logo,
                isDark: true,
                showFrame: false,
            });
        }

        if (brandLogo) {
            drawLogoBadge(ctx, {
                x: canvas.width - 42,
                y: canvas.height - 42,
                size: 24,
                img: brandLogo,
                label: 'G22 Scores',
                rawLogo: '/icon.png',
                isDark: true,
            });
        }
        return;
    }

    const navyBase = mixHexColors(bgColor, '#050505', 0.78);
    const navyMid = mixHexColors(bgColor, '#121212', 0.54);
    const shardAccent = accent;
    const gridColor = mixHexColors(accent, primaryText, 0.18);
    const surfaceColor = mixHexColors(bgColor, '#020202', 0.68);
    const leftTeam = teams[0];
    const rightTeam = teams[1];
    const splitTeamPlayers = (players: LineupExportPlayerData[]) => {
        const detectedStarters = players.filter((player, index) => isLineupStarter(player, index));
        if (detectedStarters.length > 0) {
            return {
                starters: detectedStarters,
                bench: players.filter((player, index) => !isLineupStarter(player, index)),
            };
        }

        return {
            starters: players.slice(0, Math.min(players.length, 15)),
            bench: players.slice(Math.min(players.length, 15)),
        };
    };
    const leftSplit = splitTeamPlayers(leftTeam.starters);
    const rightSplit = splitTeamPlayers(rightTeam.starters);
    const titleText = 'FORMACIONES';
    const headerText = (data.tournament?.trim() || data.subtitle?.trim() || 'TORNEO').toUpperCase();
    const metaText = [data.date?.trim(), data.time?.trim(), metaLabel?.trim()].filter(Boolean).join('  //  ').toUpperCase();
    const topBandHeight = 156;
    const titleY = 248;
    const metaY = 324;
    const crestY = 382;
    const teamNameY = 440;
    const listTop = 484;
    const listBottom = canvas.height - 132;
    const columnWidth = 386;
    const columnGap = 58;
    const leftCenterX = canvas.width / 2 - columnGap / 2 - columnWidth / 2;
    const rightCenterX = canvas.width / 2 + columnGap / 2 + columnWidth / 2;

    const fitTextLines = (text: string, maxWidth: number, baseSize: number, minSize: number, maxLines = 2) => {
        let size = baseSize;
        let lines = [text];
        while (size >= minSize) {
            ctx.font = `900 ${size}px ${FONT_EDITORIAL_SCORE}`;
            const words = text.split(/\s+/).filter(Boolean);
            lines = [];
            let currentLine = '';
            words.forEach((word) => {
                const candidate = currentLine ? `${currentLine} ${word}` : word;
                if (!currentLine || ctx.measureText(candidate).width <= maxWidth) {
                    currentLine = candidate;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            });
            if (currentLine) lines.push(currentLine);
            if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
                return { lines, size };
            }
            size -= 2;
        }
        ctx.font = `900 ${minSize}px ${FONT_EDITORIAL_SCORE}`;
        return { lines: [truncateTextToWidth(ctx, text, maxWidth)], size: minSize };
    };

    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, navyMid);
    bgGradient.addColorStop(1, navyBase);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = 0.24;
    for (let x = 0; x <= canvas.width; x += 60) {
        ctx.beginPath();
        ctx.strokeStyle = hexToRGBA(gridColor, x % 120 === 0 ? 0.44 : 0.24);
        ctx.lineWidth = 1;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 60) {
        ctx.beginPath();
        ctx.strokeStyle = hexToRGBA(gridColor, y % 120 === 0 ? 0.44 : 0.24);
        ctx.lineWidth = 1;
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = hexToRGBA(accentSoft, 0.18);
    for (let x = 0; x < canvas.width; x += 18) {
        for (let y = 0; y < canvas.height; y += 18) {
            if ((x / 18 + y / 18) % 2 === 0) {
                ctx.fillRect(x, y, 2, 2);
            }
        }
    }
    ctx.restore();

    ctx.fillStyle = hexToRGBA(surfaceColor, 0.82);
    ctx.fillRect(0, 0, canvas.width, topBandHeight);

    const drawShard = (points: Array<[number, number]>) => {
        ctx.save();
        ctx.fillStyle = shardAccent;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    drawShard([[0, 0], [128, 0], [88, 48], [0, 36]]);
    drawShard([[148, 0], [212, 0], [248, 34], [184, 34]]);
    drawShard([[canvas.width - 120, canvas.height], [canvas.width, canvas.height - 38], [canvas.width, canvas.height], [canvas.width - 46, canvas.height]]);
    drawShard([[0, canvas.height], [76, canvas.height - 52], [124, canvas.height - 24], [52, canvas.height]]);

    const headerLayout = fitTextLines(headerText, canvas.width - 360, 44, 18, 2);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = primaryText;
    ctx.font = `900 ${headerLayout.size}px ${FONT_EDITORIAL_SCORE}`;
    const headerLineHeight = headerLayout.size * 0.95;
    const headerStartY = 74 - ((headerLayout.lines.length - 1) * headerLineHeight) / 2;
    headerLayout.lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, headerStartY + index * headerLineHeight);
    });
    ctx.restore();

    ctx.save();
    ctx.translate(canvas.width / 2, titleY);
    ctx.rotate(-0.08);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = hexToRGBA(primaryText, 0.22);
    ctx.shadowBlur = 18;
    ctx.fillStyle = primaryText;
    setFittedFont(ctx, titleText, canvas.width - 220, '900', 112, FONT_EDITORIAL_SCORE, 58);
    ctx.fillText(titleText, 0, 0);
    ctx.restore();

    if (metaText) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = secondaryText;
        ctx.font = `800 15px ${FONT_MONO}`;
        ctx.fillText(truncateTextToWidth(ctx, metaText, canvas.width - 220), canvas.width / 2, metaY);
        ctx.restore();
    }

    ctx.save();
    const divider = ctx.createLinearGradient(canvas.width / 2 - 220, metaY + 26, canvas.width / 2 + 220, metaY + 26);
    divider.addColorStop(0, 'rgba(255,255,255,0)');
    divider.addColorStop(0.18, hexToRGBA(accent, 0.54));
    divider.addColorStop(0.5, hexToRGBA(accentSoft, 0.92));
    divider.addColorStop(0.82, hexToRGBA(accent, 0.54));
    divider.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = divider;
    ctx.fillRect(canvas.width / 2 - 220, metaY + 24, 440, 3);
    ctx.restore();

    const leftStarterLabels = leftSplit.starters.map((player) => `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase());
    const rightStarterLabels = rightSplit.starters.map((player) => `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase());
    const leftBenchLabels = leftSplit.bench.map((player) => `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase());
    const rightBenchLabels = rightSplit.bench.map((player) => `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase());
    const twoTeamRatingColumnWidth = highestRating != null ? 70 : 0;
    let starterFont = getSharedFittedFontSize(
        ctx,
        [...leftStarterLabels, ...rightStarterLabels].map((text) => ({ text, maxWidth: columnWidth - 24 - twoTeamRatingColumnWidth })),
        '900',
        38,
        FONT_BODY,
        12
    );
    let starterRowGap = Math.max(24, Math.round(starterFont * 1.16));
    let benchFont = Math.max(12, Math.round(starterFont * 0.68));
    let benchRowGap = Math.max(18, Math.round(benchFont * 1.16));
    let benchLabelFont = Math.max(12, Math.round(benchFont * 0.96));
    const availableListHeight = listBottom - listTop;
    const maxStarterRows = Math.max(leftStarterLabels.length, rightStarterLabels.length, 1);
    const maxBenchRows = Math.max(leftBenchLabels.length, rightBenchLabels.length, 0);
    let totalColumnHeight =
        maxStarterRows * starterRowGap +
        (maxBenchRows > 0 ? 34 + benchLabelFont + 14 + maxBenchRows * benchRowGap : 0);

    while (starterFont > 11 && totalColumnHeight > availableListHeight) {
        starterFont -= 1;
        starterRowGap = Math.max(20, Math.round(starterFont * 1.12));
        benchFont = Math.max(11, Math.round(starterFont * 0.66));
        benchRowGap = Math.max(16, Math.round(benchFont * 1.12));
        benchLabelFont = Math.max(11, Math.round(benchFont * 0.94));
        totalColumnHeight =
            maxStarterRows * starterRowGap +
            (maxBenchRows > 0 ? 30 + benchLabelFont + 12 + maxBenchRows * benchRowGap : 0);
    }

    const getColumnMetrics = (starters: string[], bench: string[]) => {
        const startersHeight = starters.length * starterRowGap;
        const benchBlockHeight = bench.length > 0 ? 34 + benchLabelFont + 14 + bench.length * benchRowGap : 0;
        const totalHeight = startersHeight + benchBlockHeight;
        const startY = listTop + Math.max(0, Math.round((availableListHeight - totalHeight) / 2));
        return {
            startersStartY: startY,
            benchLabelY: startY + startersHeight + 34,
            benchStartY: startY + startersHeight + 34 + benchLabelFont + 14,
        };
    };

    const leftMetrics = getColumnMetrics(leftStarterLabels, leftBenchLabels);
    const rightMetrics = getColumnMetrics(rightStarterLabels, rightBenchLabels);

    const drawSquadColumn = (
        centerX: number,
        teamName: string,
        starters: LineupExportPlayerData[],
        bench: LineupExportPlayerData[],
        metrics: { startersStartY: number; benchLabelY: number; benchStartY: number },
        label: string,
        logo: HTMLImageElement | null,
        rawLogo: string | undefined
    ) => {
        if (logo) {
            drawOverflowCrest(ctx, {
                x: centerX,
                y: crestY,
                width: 52,
                height: 52,
                img: logo,
                label,
                rawLogo,
                isDark: true,
                showFrame: false,
            });
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = secondaryText;
        setFittedFont(ctx, teamName.toUpperCase(), columnWidth - 20, '800', 18, FONT_BODY, 12);
        ctx.fillText(teamName.toUpperCase(), centerX, teamNameY);
        ctx.restore();

        const ratingColumnWidth = highestRating != null ? 70 : 0;
        const innerLeftX = centerX - columnWidth / 2 + 10;
        const innerRightX = centerX + columnWidth / 2 - 10;
        const nameMaxWidth = columnWidth - 24 - ratingColumnWidth;

        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.font = `900 ${starterFont}px ${FONT_BODY}`;
        starters.forEach((player, index) => {
            const y = metrics.startersStartY + index * starterRowGap;
            const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();
            ctx.textAlign = 'left';
            ctx.fillStyle = primaryText;
            ctx.fillText(truncateTextToWidth(ctx, playerLabel, nameMaxWidth), innerLeftX, y);

            if (highestRating != null) {
                const ratingLabel = formatLineupExportRating(player.rating);
                if (ratingLabel) {
                    const ratingValue = getLineupExportRatingValue(player.rating);
                    const isTopRated = ratingValue != null && ratingValue === highestRating;
                    ctx.textAlign = 'right';
                    ctx.fillStyle = isTopRated ? '#facc15' : hexToRGBA(accentSoft, 0.96);
                    ctx.font = `800 ${starterFont}px ${FONT_MONO}`;
                    ctx.fillText(isTopRated ? `${ratingLabel} ★` : ratingLabel, innerRightX, y);
                    ctx.font = `900 ${starterFont}px ${FONT_BODY}`;
                }
            }
        });
        ctx.restore();

        if (bench.length > 0) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = hexToRGBA(accentSoft, 0.96);
            ctx.font = `800 ${benchLabelFont}px ${FONT_MONO}`;
            ctx.fillText('SUPLENTES', centerX, metrics.benchLabelY);
            ctx.restore();

            ctx.save();
            ctx.textBaseline = 'alphabetic';
            ctx.font = `700 ${benchFont}px ${FONT_BODY}`;
            bench.forEach((player, index) => {
                const y = metrics.benchStartY + index * benchRowGap;
                const playerLabel = `${player.name}${player.isCaptain ? ' (C)' : ''}`.toUpperCase();
                ctx.textAlign = 'left';
                ctx.fillStyle = secondaryText;
                ctx.fillText(truncateTextToWidth(ctx, playerLabel, nameMaxWidth), innerLeftX, y);

                if (highestRating != null) {
                    const ratingLabel = formatLineupExportRating(player.rating);
                    if (ratingLabel) {
                        const ratingValue = getLineupExportRatingValue(player.rating);
                        const isTopRated = ratingValue != null && ratingValue === highestRating;
                        ctx.textAlign = 'right';
                        ctx.fillStyle = isTopRated ? '#facc15' : hexToRGBA(accentSoft, 0.92);
                        ctx.font = `800 ${benchFont}px ${FONT_MONO}`;
                        ctx.fillText(isTopRated ? `${ratingLabel} ★` : ratingLabel, innerRightX, y);
                        ctx.font = `700 ${benchFont}px ${FONT_BODY}`;
                    }
                }
            });
            ctx.restore();
        }
    };

    drawSquadColumn(leftCenterX, leftTeam.name, leftSplit.starters, leftSplit.bench, leftMetrics, leftTeam.name, homeLogo, data.homeTeam.logo);
    drawSquadColumn(rightCenterX, rightTeam.name, rightSplit.starters, rightSplit.bench, rightMetrics, rightTeam.name, awayLogo, data.awayTeam.logo);

    if (tournamentLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width / 2,
            y: canvas.height - 44,
            size: 28,
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: true,
        });
    } else if (brandLogo) {
        drawLogoBadge(ctx, {
            x: canvas.width / 2,
            y: canvas.height - 44,
            size: 28,
            img: brandLogo,
            label: 'G22 Scores',
            rawLogo: '/icon.png',
            isDark: true,
        });
    }
}

async function drawPosterV3PlayoffBracket(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: PlayoffBracketData,
    _format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const rounds = Array.isArray(data.rounds) ? data.rounds.filter((round) => round.matches?.length) : [];
    const tournamentLogo = await loadImage(getTournamentLogoImageSource(data));
    const logos = await Promise.all(
        rounds.flatMap((round) =>
            round.matches.flatMap((match) => [
                loadImage(getBracketParticipantLogo(match.home_team || null, match.home_participant || null)),
                loadImage(getBracketParticipantLogo(match.away_team || null, match.away_participant || null)),
            ]),
        ),
    );
    const accentPrimary = mixHexColors(accentColor, '#ffffff', 0.12);
    const accentSoft = mixHexColors(accentColor, bgColor, 0.18);
    const primaryText = getContrastColor(mixHexColors(bgColor, '#050505', 0.74)) === '#ffffff' ? '#ffffff' : '#f8fafc';

    drawPosterV3Backdrop(ctx, canvas, accentColor, bgColor);
    drawPosterV3Kicker(ctx, 58, 94, (data.subtitle || 'Eliminacion directa').toUpperCase(), hexToRGBA(accentPrimary, 0.96));
    drawPosterV3OutlineTitle(ctx, data.title || 'Playoff', 56, 168, canvas.width - 120, 102, hexToRGBA(primaryText, 0.26));

    if (tournamentLogo) {
        drawLogoBadge(ctx, { x: canvas.width - 88, y: 90, size: 58, img: tournamentLogo, label: data.title, rawLogo: data.tournamentLogo, isDark: true });
    }

    if (!rounds.length) {
        ctx.save();
        ctx.fillStyle = primaryText;
        ctx.textAlign = 'center';
        ctx.font = `700 24px ${FONT_BODY}`;
        ctx.fillText('No hay cruces cargados para exportar.', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        drawBrandFooter(ctx, canvas, brandLogo, true);
        return;
    }

    const columnGap = 18;
    const columnWidth = (canvas.width - 112 - columnGap * Math.max(rounds.length - 1, 0)) / rounds.length;
    const top = 224;
    const usableHeight = canvas.height - top - 166;
    let logoIndex = 0;

    rounds.forEach((round, roundIndex) => {
        const x = 56 + roundIndex * (columnWidth + columnGap);
        const titleHeight = 42;
        const gap = 14;
        const matchHeight = Math.min(124, (usableHeight - titleHeight - 18 - gap * Math.max(round.matches.length - 1, 0)) / Math.max(round.matches.length, 1));

        ctx.save();
        ctx.fillStyle = accentPrimary;
        ctx.beginPath();
        ctx.roundRect(x, top, columnWidth, titleHeight, 12);
        ctx.fill();
        ctx.fillStyle = getContrastColor(accentPrimary) === '#ffffff' ? '#05101d' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `900 14px ${FONT_MONO}`;
        ctx.fillText(getBracketRoundName(round, roundIndex).toUpperCase(), x + columnWidth / 2, top + 27);
        ctx.restore();

        round.matches.forEach((match, matchIndex) => {
            const y = top + titleHeight + 18 + matchIndex * (matchHeight + gap);
            const homeName = getBracketParticipantName(match.home_team || null, match.home_participant || null);
            const awayName = getBracketParticipantName(match.away_team || null, match.away_participant || null);
            const homeLogo = logos[logoIndex] || null;
            const awayLogo = logos[logoIndex + 1] || null;
            logoIndex += 2;

            drawPosterV3Panel(ctx, x, y, columnWidth, matchHeight, hexToRGBA(mixHexColors(bgColor, '#04080f', 0.78), 0.9), hexToRGBA(accentSoft, 0.28), 16, 1.5);

            drawLogoBadge(ctx, { x: x + 28, y: y + 34, size: 28, img: homeLogo, label: homeName, rawLogo: getBracketParticipantLogo(match.home_team || null, match.home_participant || null), isDark: true, showFrame: false });
            drawLogoBadge(ctx, { x: x + 28, y: y + matchHeight - 34, size: 28, img: awayLogo, label: awayName, rawLogo: getBracketParticipantLogo(match.away_team || null, match.away_participant || null), isDark: true, showFrame: false });

            ctx.save();
            ctx.fillStyle = primaryText;
            ctx.textAlign = 'left';
            setFittedFont(ctx, homeName.toUpperCase(), columnWidth - 112, '800', 14, FONT_BODY, 10);
            ctx.fillText(homeName.toUpperCase(), x + 52, y + 40);
            setFittedFont(ctx, awayName.toUpperCase(), columnWidth - 112, '800', 14, FONT_BODY, 10);
            ctx.fillText(awayName.toUpperCase(), x + 52, y + matchHeight - 28);
            ctx.textAlign = 'right';
            ctx.fillStyle = accentPrimary;
            ctx.font = `900 26px ${FONT_EDITORIAL_SCORE}`;
            ctx.fillText(String(match.score_home ?? '-'), x + columnWidth - 18, y + 42);
            ctx.fillText(String(match.score_away ?? '-'), x + columnWidth - 18, y + matchHeight - 26);
            ctx.restore();
        });
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

async function drawPosterV3PlayerStats(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: PlayerStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const isStory = format.height > format.width;
    const photo = await loadImage(data.photo || '');
    const accentPrimary = mixHexColors(accentColor, '#ffffff', 0.12);
    const accentHighlight = mixHexColors(accentColor, '#ffffff', 0.24);
    const panelFill = hexToRGBA(mixHexColors(bgColor, '#030912', 0.74), 0.86);
    const stats = data.stats.slice(0, isStory ? 4 : 3);

    drawPosterV3Backdrop(ctx, canvas, accentColor, bgColor);
    drawPosterV3FullBleedImage(ctx, canvas, photo, 'rgba(2, 6, 12, 0.14)', 'rgba(0, 0, 0, 0.82)');
    drawPosterV3Kicker(ctx, 56, 94, `${data.team} • ${data.position}`.toUpperCase(), hexToRGBA(accentPrimary, 0.94));
    drawPosterV3OutlineTitle(ctx, 'Jugador destacado', 54, 172, canvas.width - 120, 104, hexToRGBA('#ffffff', 0.26));

    ctx.save();
    const shade = ctx.createLinearGradient(0, canvas.height * 0.48, 0, canvas.height);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.84)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    drawPosterV3SolidTitle(ctx, data.name, 70, canvas.height - 274, canvas.width - 140, isStory ? 92 : 86, '#ffffff');

    const cardGap = 14;
    const cardWidth = (canvas.width - 140 - cardGap * Math.max(stats.length - 1, 0)) / Math.max(stats.length, 1);
    stats.forEach((stat, index) => {
        const x = 70 + index * (cardWidth + cardGap);
        const y = canvas.height - 226;
        const tone = stat.highlight ? accentHighlight : accentPrimary;

        drawPosterV3Panel(ctx, x, y, cardWidth, 96, panelFill, hexToRGBA(tone, 0.64), 16, 2);

        ctx.save();
        ctx.fillStyle = hexToRGBA('#ffffff', 0.72);
        ctx.font = `800 13px ${FONT_MONO}`;
        ctx.fillText(stat.label.toUpperCase(), x + 16, y + 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 48px ${FONT_EDITORIAL_SCORE}`;
        ctx.fillText(String(stat.value), x + 16, y + 76);
        ctx.restore();
    });

    drawBrandFooter(ctx, canvas, brandLogo, true);
}

// ============================================================================
// Familia Impacto V4
// ----------------------------------------------------------------------------
// Placa de color pleno con textura, titular condensado gigante partido en dos
// mitades (etapa - torneo), reglas blancas de lado a lado y bloques de color
// por fila. Cero paneles flotantes y cero neon: el color ocupa la pieza entera
// y la jerarquia la pone el tamano de la tipografia.
//
// La firma de G22 va una sola vez, centrada al pie. Arriba, donde la referencia
// pone la fila de sponsors, no va nada: repetir la marca en las dos puntas la
// gasta y le roba aire al titular.
// ============================================================================

// Los cuatro colores que el modal expone para esta familia. Vacio = automatico
// (se deriva de Fondo + Acento como hasta ahora).
type ImpactoColorOverrides = {
    field?: string;
    ink?: string;
    bar?: string;
    row?: string;
};

type ImpactoTone = {
    field: string;
    fieldLift: string;
    fieldDeep: string;
    ink: string;
    isDarkField: boolean;
    rule: string;
    headerBar: string;
    neutralRow: string;
    neutralRowInk: string;
    // Barra de partido del fixture: null = el sombreado negro automatico.
    panelColor: string | null;
};

function getImpactoHexOverride(value: string | undefined): string {
    const normalized = normalizeHexColor(value);
    return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : '';
}

function getImpactoTone(accentColor: string, bgColor: string, overrides?: ImpactoColorOverrides): ImpactoTone {
    const fieldOverride = getImpactoHexOverride(overrides?.field);
    const inkOverride = getImpactoHexOverride(overrides?.ink);
    const barOverride = getImpactoHexOverride(overrides?.bar);
    const rowOverride = getImpactoHexOverride(overrides?.row);

    const field = fieldOverride || mixHexColors(bgColor, accentColor, 0.62);
    // El campo decide si la pieza es clara u oscura aunque la tinta se fuerce a
    // mano: de eso dependen las texturas, las sombras y el sombreado de barras.
    const isDarkField = getContrastColor(field) === '#ffffff';
    const ink = inkOverride || getContrastColor(field);
    const neutralRow = rowOverride
        || barOverride
        || hexToRGBA(isDarkField ? '#ffffff' : '#0f172a', isDarkField ? 0.22 : 0.14);

    return {
        field,
        fieldLift: mixHexColors(field, isDarkField ? '#ffffff' : '#000000', 0.14),
        fieldDeep: mixHexColors(field, '#000000', isDarkField ? 0.5 : 0.24),
        ink,
        isDarkField,
        rule: hexToRGBA(ink, 0.94),
        headerBar: barOverride || hexToRGBA(isDarkField ? '#ffffff' : '#0f172a', isDarkField ? 0.26 : 0.16),
        neutralRow,
        neutralRowInk: rowOverride || barOverride ? getContrastColor(neutralRow) : ink,
        panelColor: rowOverride || null,
    };
}

// Los torneos externos llegan rotulados "Pais: Torneo" (asi los arma el feed).
// En una placa —la de G22 Base o la de Impacto— el pais es ruido: ocupa media linea del titular y no dice nada
// que los escudos no digan ya.
//
// El corte NO es por el ":" a secas: lo de adelante tiene que ser un pais o una
// region del catalogo. "Nueva Zelanda: Bunnings NPC" pierde el pais; "URBA: Top
// 12" se queda entero, porque ahi la sigla es el torneo.
function stripTournamentCountryPrefix(label: string): string {
    const value = (label || '').trim();
    const separator = value.indexOf(':');
    if (separator <= 0 || separator >= value.length - 1) return value;

    const head = value.slice(0, separator).trim();
    const tail = value.slice(separator + 1).trim();
    if (!tail || !head) return value;

    return findCountryRecord(null, head) ? tail : value;
}

// El fondo es el diseno: un campo de color con la luz corrida hacia arriba,
// trama diagonal muy tenue y grano. Sin esto la placa se ve plana de imprenta.
function drawImpactoField(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, tone: ImpactoTone) {
    const glow = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height * 0.32,
        0,
        canvas.width / 2,
        canvas.height * 0.42,
        canvas.width * 1.02
    );
    glow.addColorStop(0, tone.fieldLift);
    glow.addColorStop(0.46, tone.field);
    glow.addColorStop(1, tone.fieldDeep);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.strokeStyle = hexToRGBA(tone.isDarkField ? '#ffffff' : '#000000', 0.035);
    ctx.lineWidth = 1;
    for (let offset = -canvas.height; offset <= canvas.width; offset += 9) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset + canvas.height, canvas.height);
        ctx.stroke();
    }
    ctx.restore();

    const noise = getRankingNoiseTile();
    if (noise) {
        const pattern = ctx.createPattern(noise, 'repeat');
        if (pattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
    }

    ctx.save();
    const vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.32,
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.78
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, hexToRGBA('#000000', tone.isDarkField ? 0.34 : 0.12));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

// El titular: "ETAPA - TORNEO" en una sola linea si entra, dos como maximo.
// Devuelve el borde inferior para que el resto de la pieza se cuelgue de ahi.
function drawImpactoHeadline(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    leftPart: string,
    rightPart: string,
    tone: ImpactoTone,
    options: { top: number; maxWidth: number; maxSize: number; minSize: number }
): number {
    const left = (leftPart || '').trim().toUpperCase();
    const right = (rightPart || '').trim().toUpperCase();
    const headline = [left, right].filter(Boolean).join(' - ');
    if (!headline) return options.top;

    const { lines, size } = fitTextLinesToWidth(
        ctx,
        headline,
        options.maxWidth,
        '900',
        options.maxSize,
        FONT_EDITORIAL_SCORE,
        options.minSize,
        2
    );
    const lineHeight = Math.round(size * 0.82);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tone.ink;
    ctx.font = `900 ${size}px ${FONT_EDITORIAL_SCORE}`;
    ctx.shadowColor = hexToRGBA('#000000', tone.isDarkField ? 0.38 : 0.16);
    ctx.shadowBlur = Math.round(size * 0.2);
    ctx.shadowOffsetY = Math.round(size * 0.05);
    lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, options.top + index * lineHeight);
    });
    ctx.restore();

    return options.top + lineHeight * (lines.length - 1) + Math.round(size * 0.78);
}

function drawImpactoRule(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    thickness: number,
    color: string
) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, thickness, thickness / 2);
    ctx.fill();
    ctx.restore();
}

function drawImpactoPageBadge(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    label: string,
    tone: ImpactoTone,
    radius: number
) {
    if (!label) return;

    ctx.save();
    ctx.fillStyle = hexToRGBA('#000000', tone.isDarkField ? 0.42 : 0.22);
    ctx.beginPath();
    ctx.arc(canvas.width - radius - 26, radius + 26, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.ink;
    ctx.font = `800 ${Math.round(radius * 0.72)}px ${FONT_BODY}`;
    ctx.fillText(label, canvas.width - radius - 26, radius + 27);
    ctx.restore();
}

// Pie: la firma centrada y, si la pieza sigue en otra lamina, las flechas a la
// derecha. Es la UNICA marca de la pieza.
function drawImpactoFooter(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    brandLogo: HTMLImageElement | null,
    tone: ImpactoTone,
    options: { padding: number; hasNext?: boolean }
) {
    const padding = options.padding;
    const baseY = canvas.height - Math.round(padding * 0.86);
    const iconSize = 42;
    const gap = 12;

    ctx.save();
    ctx.font = `900 40px ${FONT_EDITORIAL_SCORE}`;
    setCanvasTracking(ctx, 1);
    const wordmark = 'G22 SCORES';
    const textWidth = ctx.measureText(wordmark).width;
    const totalWidth = (brandLogo ? iconSize + gap : 0) + textWidth;
    const startX = canvas.width / 2 - totalWidth / 2;

    if (brandLogo) {
        const placement = getContainedImagePlacement(brandLogo, startX + iconSize / 2, baseY, iconSize, iconSize, 0);
        ctx.drawImage(brandLogo, placement.x, placement.y, placement.width, placement.height);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.ink;
    ctx.fillText(wordmark, startX + (brandLogo ? iconSize + gap : 0), baseY + 2);
    setCanvasTracking(ctx, 0);

    if (options.hasNext) {
        ctx.textAlign = 'right';
        ctx.fillStyle = hexToRGBA(tone.ink, 0.82);
        ctx.font = `900 34px ${FONT_EDITORIAL_SCORE}`;
        ctx.fillText('>>>', canvas.width - padding, baseY + 2);
    }
    ctx.restore();
}

// El escudo se recorta contra el borde de su fila y se derrama fuera: es la
// firma de la referencia y lo que separa esta familia de una tabla comun.
function drawImpactoBleedCrest(
    ctx: CanvasRenderingContext2D,
    options: {
        centerX: number;
        centerY: number;
        size: number;
        img: HTMLImageElement | null;
        label: string;
        rawLogo?: string;
        clip: { x: number; y: number; width: number; height: number; radius: number };
        isDark: boolean;
    }
) {
    const { centerX, centerY, size, img, label, rawLogo, clip, isDark } = options;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(clip.x, clip.y, clip.width, clip.height, clip.radius);
    ctx.clip();

    if (img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const placement = getContainedImagePlacement(img, centerX, centerY, size, size, 0);
        ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
    } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = getTextColor(isDark);
        ctx.font = `800 ${Math.round(size * 0.3)}px ${FONT_BODY}`;
        ctx.fillText(getFallbackLogoText(rawLogo, label), centerX, centerY + 1);
    }

    ctx.restore();
}

async function drawImpactoMatchResult(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    colorOverrides?: ImpactoColorOverrides
) {
    const isStory = format.height >= 1600;
    const sy = (value: number) => (value * canvas.height) / 1350;
    // sy escala con la altura y sx con el ancho. El story es igual de ancho que
    // el post pero mucho mas alto: medir un escudo o una columna con sy los
    // agranda un 42% y se comen el marcador.
    const sx = (value: number) => (value * canvas.width) / 1080;
    const tone = getImpactoTone(accentColor, bgColor, colorOverrides);
    const [homeLogo, awayLogo, tournamentLogo] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
    ]);

    drawImpactoField(ctx, canvas, tone);

    const padding = 62;
    const contentWidth = canvas.width - padding * 2;
    const isScheduled = data.status === 'scheduled';
    // El titular se lee "ETAPA - TORNEO". El motor solo sabe si la pieza es
    // resultado u horario, asi que esa es la etapa por defecto; si el nombre del
    // torneo ya viene partido ("Final - TRL M19 A"), esa particion manda y no se
    // le antepone nada.
    const tournamentLabel = stripTournamentCountryPrefix(data.tournament || '');
    const tournamentCarriesStage = /\s[-|]\s/.test(tournamentLabel);
    const stageLabel = tournamentCarriesStage ? '' : (data.mainTitle || getStatusLabel(data.status) || '').trim();
    const headlineBottom = drawImpactoHeadline(ctx, canvas, stageLabel, tournamentLabel, tone, {
        top: sy(isStory ? 120 : 92),
        maxWidth: contentWidth,
        maxSize: sy(isStory ? 150 : 132),
        minSize: sy(56),
    });

    const ruleTop = headlineBottom + sy(34);
    drawImpactoRule(ctx, padding, ruleTop, contentWidth, sy(9), tone.rule);

    const bandHeight = sy(isStory ? 400 : 312);
    const bandTop = ruleTop + sy(16);
    const bandCenter = bandTop + bandHeight / 2;
    const crestSize = Math.min(bandHeight * 0.86, sx(250));
    const crestInset = padding + crestSize / 2 + sx(4);

    drawOverflowCrest(ctx, {
        x: crestInset,
        y: bandCenter,
        width: crestSize,
        height: crestSize,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: tone.isDarkField,
        showFrame: false,
    });
    drawOverflowCrest(ctx, {
        x: canvas.width - crestInset,
        y: bandCenter,
        width: crestSize,
        height: crestSize,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: tone.isDarkField,
        showFrame: false,
    });

    // En una pieza de horario el numero grande es la hora, y el dia va arriba en
    // chico: un partido sin fecha no es informacion, es un adorno.
    const dayLabel = isScheduled ? (data.date || '').trim() : '';
    const scoreText = isScheduled
        ? (data.time || '--:--')
        : `${data.homeScore ?? '-'}-${data.awayScore ?? '-'}`;
    const scoreMaxWidth = canvas.width - (crestInset + crestSize / 2) * 2 - sx(48);
    const scoreCenterY = bandCenter + (dayLabel ? sy(24) : sy(6));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.ink;
    ctx.shadowColor = hexToRGBA('#000000', tone.isDarkField ? 0.34 : 0.14);
    ctx.shadowBlur = sy(26);
    ctx.shadowOffsetY = sy(8);
    const scoreSize = setFittedFont(ctx, scoreText, scoreMaxWidth, '900', sy(isStory ? 250 : 210), FONT_EDITORIAL_SCORE, sy(90));
    ctx.fillText(scoreText, canvas.width / 2, scoreCenterY);
    ctx.restore();

    if (dayLabel) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = hexToRGBA(tone.ink, 0.88);
        ctx.font = `800 ${sy(34)}px ${FONT_BODY}`;
        setCanvasTracking(ctx, 3);
        ctx.fillText(
            truncateTextToWidth(ctx, dayLabel.toUpperCase(), scoreMaxWidth),
            canvas.width / 2,
            scoreCenterY - scoreSize * 0.42 - sy(6)
        );
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }

    const hasPenalties = typeof data.homePenalties === 'number' && typeof data.awayPenalties === 'number';
    if (hasPenalties && !isScheduled) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = hexToRGBA(tone.ink, 0.78);
        ctx.font = `800 ${sy(24)}px ${FONT_BODY}`;
        ctx.fillText(`PENALES ${data.homePenalties} - ${data.awayPenalties}`, canvas.width / 2, bandTop + bandHeight - sy(18));
        ctx.restore();
    }

    const ruleBottom = bandTop + bandHeight + sy(10);
    drawImpactoRule(ctx, padding, ruleBottom, contentWidth, sy(9), tone.rule);

    const teamNameTop = ruleBottom + sy(26);
    const teamNameMaxWidth = canvas.width / 2 - padding - sx(40);
    const teamNameSize = getSharedFittedFontSize(
        ctx,
        [
            { text: data.homeTeam.trim(), maxWidth: teamNameMaxWidth },
            { text: data.awayTeam.trim(), maxWidth: teamNameMaxWidth },
        ],
        '800',
        sy(isStory ? 40 : 34),
        FONT_BODY,
        sy(18)
    );

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.fillStyle = tone.ink;
    ctx.font = `800 ${teamNameSize}px ${FONT_BODY}`;
    ctx.textAlign = 'left';
    ctx.fillText(truncateTextToWidth(ctx, data.homeTeam.trim(), teamNameMaxWidth), padding, teamNameTop);
    ctx.textAlign = 'right';
    ctx.fillText(truncateTextToWidth(ctx, data.awayTeam.trim(), teamNameMaxWidth), canvas.width - padding, teamNameTop);
    ctx.restore();

    // El dia ya vive arriba cuando la pieza es horario: abajo solo queda la sede.
    const metaLabel = isScheduled
        ? (data.venue || '').trim()
        : [data.date, data.time, data.venue].filter(Boolean).join('  ·  ');
    const footerTop = canvas.height - sy(isStory ? 150 : 122);
    const logoSlotTop = teamNameTop + teamNameSize + sy(30);
    const logoSlotHeight = Math.max(sy(120), footerTop - logoSlotTop - sy(46));
    const logoHeight = Math.min(logoSlotHeight, sy(isStory ? 360 : 300));
    const logoCenterY = logoSlotTop + logoHeight / 2;

    if (tournamentLogo) {
        drawEditorialCrestStroke(
            ctx,
            canvas.width / 2,
            logoCenterY,
            Math.min(contentWidth * 0.82, logoHeight * 2.4),
            logoHeight,
            tournamentLogo,
            5,
            hexToRGBA(tone.ink, 0.18)
        );
        drawOverflowCrest(ctx, {
            x: canvas.width / 2,
            y: logoCenterY,
            width: Math.min(contentWidth * 0.82, logoHeight * 2.4),
            height: logoHeight,
            img: tournamentLogo,
            label: data.tournament,
            rawLogo: data.tournamentLogo,
            isDark: tone.isDarkField,
            showFrame: false,
        });
    }

    if (metaLabel) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = hexToRGBA(tone.ink, 0.72);
        ctx.font = `700 ${sy(20)}px ${FONT_BODY}`;
        setCanvasTracking(ctx, 2);
        ctx.fillText(truncateTextToWidth(ctx, metaLabel.toUpperCase(), contentWidth), canvas.width / 2, footerTop + sy(24));
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }

    drawImpactoFooter(ctx, canvas, brandLogo, tone, { padding });
}

async function drawImpactoStandings(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    colorOverrides?: ImpactoColorOverrides
) {
    const isStory = format.height >= 1600;
    const sy = (value: number) => (value * canvas.height) / 1350;
    const sx = (value: number) => (value * canvas.width) / 1080;
    const tone = getImpactoTone(accentColor, bgColor, colorOverrides);
    const rows = slide.groups.flatMap((group) => group.rows);
    const logos = await Promise.all(rows.map((row) => loadImage(row.teamLogo || '')));

    drawImpactoField(ctx, canvas, tone);

    const padding = 56;
    const contentWidth = canvas.width - padding * 2;
    const title = stripTournamentCountryPrefix(data.title || '') || 'Tabla de posiciones';
    const stage = data.subtitle?.trim() || '';
    const headlineBottom = drawImpactoHeadline(ctx, canvas, stage, title, tone, {
        top: sy(isStory ? 110 : 78),
        maxWidth: contentWidth,
        maxSize: sy(isStory ? 132 : 118),
        minSize: sy(50),
    });

    const dividerY = headlineBottom + sy(30);
    drawImpactoRule(ctx, padding, dividerY, contentWidth, sy(14), tone.headerBar);

    if (slide.totalPages > 1) {
        drawImpactoPageBadge(ctx, canvas, `${slide.pageNumber}/${slide.totalPages}`, tone, sy(38));
    }

    // Columnas: el numero, el escudo y el nombre a la izquierda; PTS, PJ y la
    // condicion (la etiqueta de zona) como columnas fijas a la derecha.
    const tableLeft = padding;
    const tableRight = canvas.width - padding;
    const condCenter = tableRight - sx(72);
    const playedCenter = condCenter - sx(96);
    const pointsCenter = playedCenter - sx(96);
    const posCenter = tableLeft + sx(36);
    const headerTop = dividerY + sy(28);
    const headerHeight = sy(52);

    ctx.save();
    ctx.fillStyle = tone.headerBar;
    ctx.beginPath();
    ctx.roundRect(tableLeft, headerTop, contentWidth, headerHeight, sy(10));
    ctx.fill();
    ctx.restore();

    const groupLabels = slide.groups.map((group) => formatStandingsGroupLabel(group));
    const hasGroupLabels = groupLabels.some(Boolean);
    const groupLabelHeight = hasGroupLabels ? sy(34) : 0;
    const reservedGroupSpace = groupLabels.reduce((total, label) => (label ? total + groupLabelHeight + sy(8) : total), 0);
    const rowsTop = headerTop + headerHeight + sy(12);
    const rowsBottom = canvas.height - sy(isStory ? 170 : 132);
    const rowGap = sy(7);
    const availableHeight = Math.max(sy(200), rowsBottom - rowsTop - reservedGroupSpace);
    const rowHeight = clampNumber(
        (availableHeight - rowGap * Math.max(rows.length - 1, 0)) / Math.max(rows.length, 1),
        sy(40),
        sy(isStory ? 112 : 100)
    );
    // Con pocas filas la tabla no llega abajo: el sobrante se reparte en vez de
    // dejar todo colgado del header con un hueco muerto al pie.
    const rowsBlockHeight = rows.length * rowHeight + rowGap * Math.max(rows.length - 1, 0) + reservedGroupSpace;
    const rowsLeftover = Math.max(0, rowsBottom - rowsTop - rowsBlockHeight);
    const crestSize = Math.min(rowHeight * 0.78, sx(88));
    const crestCenterX = tableLeft + sx(96);
    const nameX = crestCenterX + crestSize / 2 + sx(18);
    const nameMaxWidth = Math.max(sx(160), pointsCenter - sx(56) - nameX);
    const nameFontSize = getSharedFittedFontSize(
        ctx,
        rows.map((row) => ({ text: row.team.trim(), maxWidth: nameMaxWidth })),
        '800',
        Math.min(sy(34), rowHeight * 0.44),
        FONT_BODY,
        sy(15)
    );
    const statFontSize = Math.min(sy(32), rowHeight * 0.42);

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.ink;
    ctx.font = `800 ${Math.min(sy(26), headerHeight * 0.52)}px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('P', posCenter, headerTop + headerHeight / 2 + 1);
    ctx.textAlign = 'left';
    ctx.fillText('Equipo', nameX, headerTop + headerHeight / 2 + 1);
    ctx.textAlign = 'center';
    ctx.fillText((data.columnLabels?.points?.trim() || 'PTS').toUpperCase(), pointsCenter, headerTop + headerHeight / 2 + 1);
    ctx.fillText((data.columnLabels?.played?.trim() || 'PJ').toUpperCase(), playedCenter, headerTop + headerHeight / 2 + 1);
    ctx.fillText('COND', condCenter, headerTop + headerHeight / 2 + 1);
    ctx.restore();

    let cursorY = rowsTop + rowsLeftover / 2;
    let logoIndex = 0;

    slide.groups.forEach((group, groupIndex) => {
        const label = groupLabels[groupIndex];
        if (label) {
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = hexToRGBA(tone.ink, 0.82);
            ctx.font = `800 ${sy(20)}px ${FONT_BODY}`;
            setCanvasTracking(ctx, 2);
            ctx.fillText(label, tableLeft + sx(4), cursorY + groupLabelHeight / 2);
            setCanvasTracking(ctx, 0);
            ctx.restore();
            cursorY += groupLabelHeight + sy(8);
        }

        group.rows.forEach((row) => {
            const logo = logos[logoIndex] || null;
            logoIndex += 1;
            const rowLabel = row.labelName?.trim() || '';
            const rowFill = rowLabel && row.zoneColor ? row.zoneColor : '';
            const rowInk = rowFill ? getContrastColor(rowFill) : tone.neutralRowInk;
            const centerY = cursorY + rowHeight / 2;
            const radius = sy(9);

            ctx.save();
            ctx.fillStyle = rowFill || tone.neutralRow;
            ctx.beginPath();
            ctx.roundRect(tableLeft, cursorY, contentWidth, rowHeight, radius);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = rowInk;
            ctx.font = `800 ${statFontSize}px ${FONT_BODY}`;
            ctx.fillText(String(row.pos), posCenter, centerY + 1);
            ctx.fillText(String(row.points ?? '-'), pointsCenter, centerY + 1);
            ctx.fillText(String(row.played ?? '-'), playedCenter, centerY + 1);
            if (rowLabel) {
                ctx.font = `800 ${Math.min(statFontSize, sy(28))}px ${FONT_BODY}`;
                ctx.fillText(truncateTextToWidth(ctx, rowLabel.toUpperCase(), sx(130)), condCenter, centerY + 1);
            }
            ctx.restore();

            drawImpactoBleedCrest(ctx, {
                centerX: crestCenterX,
                centerY,
                size: crestSize,
                img: logo,
                label: row.team,
                rawLogo: row.teamLogo,
                clip: { x: tableLeft, y: cursorY, width: contentWidth, height: rowHeight, radius },
                isDark: rowInk === '#ffffff',
            });

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = rowInk;
            ctx.font = `800 ${nameFontSize}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, row.team.trim(), nameMaxWidth), nameX, centerY + 1);
            ctx.restore();

            cursorY += rowHeight + rowGap;
        });
    });

    drawImpactoFooter(ctx, canvas, brandLogo, tone, {
        padding,
        hasNext: slide.totalPages > slide.pageNumber,
    });
}

async function drawImpactoDailyMatches(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    timeMode: DailyMatchesTimeMode = 'time',
    colorOverrides?: ImpactoColorOverrides
) {
    const isStory = format.height >= 1600;
    const sy = (value: number) => (value * canvas.height) / 1350;
    const sx = (value: number) => (value * canvas.width) / 1080;
    const tone = getImpactoTone(accentColor, bgColor, colorOverrides);
    const matches = data.matches.slice(0, 10);
    const logos = await Promise.all(
        matches.flatMap((match) => [loadImage(match.homeLogo || ''), loadImage(match.awayLogo || '')])
    );

    drawImpactoField(ctx, canvas, tone);

    const padding = 56;
    const contentWidth = canvas.width - padding * 2;
    const headlineBottom = drawImpactoHeadline(ctx, canvas, stripTournamentCountryPrefix(data.tournament || ''), data.date, tone, {
        top: sy(isStory ? 110 : 78),
        maxWidth: contentWidth,
        maxSize: sy(isStory ? 132 : 118),
        minSize: sy(50),
    });

    const dividerY = headlineBottom + sy(30);
    drawImpactoRule(ctx, padding, dividerY, contentWidth, sy(14), tone.headerBar);

    const headerTop = dividerY + sy(34);
    const timeCenter = canvas.width / 2;
    const localCenter = canvas.width * 0.26;
    const visitaCenter = canvas.width * 0.74;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tone.ink;
    ctx.font = `800 ${sy(34)}px ${FONT_BODY}`;
    ctx.fillText('Local', localCenter, headerTop);
    ctx.fillText(timeMode === 'vs' ? 'Cruce' : 'Horario', timeCenter, headerTop);
    ctx.fillText('Visita', visitaCenter, headerTop);
    ctx.restore();

    const rowsTop = headerTop + sy(62);
    const rowsBottom = canvas.height - sy(isStory ? 170 : 132);
    const rowGap = sy(10);
    const rowHeight = clampNumber(
        (rowsBottom - rowsTop - rowGap * Math.max(matches.length - 1, 0)) / Math.max(matches.length, 1),
        sy(58),
        sy(isStory ? 150 : 132)
    );
    const rowsBlockHeight = matches.length * rowHeight + rowGap * Math.max(matches.length - 1, 0);
    const rowsLeftover = Math.max(0, rowsBottom - rowsTop - rowsBlockHeight);
    const rowsOrigin = rowsTop + rowsLeftover / 2;
    const radius = rowHeight / 2;
    const crestSize = Math.min(rowHeight * 1.2, sx(128));
    const crestInset = sx(30);
    // El nombre arranca despues del borde visible del escudo: si comparten pixel
    // se leen encima y la fila parece un error de composicion.
    const nameInset = crestInset + crestSize * 0.5 + sx(12);
    const timeFontSize = Math.min(sy(56), rowHeight * 0.56);
    const rowInk = tone.panelColor ? getContrastColor(tone.panelColor) : '#ffffff';

    const labels = matches.map((match) => (
        match.status === 'scheduled'
            ? getScheduledMatchLabel(match, timeMode)
            : `${match.homeScore ?? '-'}-${match.awayScore ?? '-'}`
    ));

    ctx.save();
    ctx.font = `900 ${timeFontSize}px ${FONT_EDITORIAL_SCORE}`;
    const timeBlockWidth = Math.max(sx(120), ...labels.map((label) => ctx.measureText(label).width)) + sx(30);
    ctx.restore();

    const nameMaxWidth = Math.max(sx(120), (canvas.width - timeBlockWidth) / 2 - padding - nameInset - sx(16));
    const nameFontSize = getSharedFittedFontSize(
        ctx,
        matches.flatMap((match) => ([
            { text: match.homeTeam.trim(), maxWidth: nameMaxWidth },
            { text: match.awayTeam.trim(), maxWidth: nameMaxWidth },
        ])),
        '800',
        Math.min(sy(34), rowHeight * 0.34),
        FONT_BODY,
        sy(15)
    );

    let logoIndex = 0;

    matches.forEach((match, index) => {
        const rowY = rowsOrigin + index * (rowHeight + rowGap);
        const centerY = rowY + rowHeight / 2;
        const homeLogo = logos[logoIndex] || null;
        const awayLogo = logos[logoIndex + 1] || null;
        logoIndex += 2;
        const clip = { x: padding, y: rowY, width: contentWidth, height: rowHeight, radius };

        ctx.save();
        if (tone.panelColor) {
            ctx.fillStyle = tone.panelColor;
        } else {
            const rowGradient = ctx.createLinearGradient(padding, 0, canvas.width - padding, 0);
            rowGradient.addColorStop(0, hexToRGBA('#000000', tone.isDarkField ? 0.5 : 0.3));
            rowGradient.addColorStop(0.5, hexToRGBA('#000000', tone.isDarkField ? 0.3 : 0.16));
            rowGradient.addColorStop(1, hexToRGBA('#000000', tone.isDarkField ? 0.5 : 0.3));
            ctx.fillStyle = rowGradient;
        }
        ctx.beginPath();
        ctx.roundRect(padding, rowY, contentWidth, rowHeight, radius);
        ctx.fill();
        ctx.strokeStyle = hexToRGBA(rowInk, 0.1);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        drawImpactoBleedCrest(ctx, {
            centerX: padding + crestInset,
            centerY,
            size: crestSize,
            img: homeLogo,
            label: match.homeTeam,
            rawLogo: match.homeLogo,
            clip,
            isDark: rowInk === '#ffffff',
        });
        drawImpactoBleedCrest(ctx, {
            centerX: canvas.width - padding - crestInset,
            centerY,
            size: crestSize,
            img: awayLogo,
            label: match.awayTeam,
            rawLogo: match.awayLogo,
            clip,
            isDark: rowInk === '#ffffff',
        });

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rowInk;
        ctx.font = `800 ${nameFontSize}px ${FONT_BODY}`;
        ctx.textAlign = 'left';
        ctx.fillText(truncateTextToWidth(ctx, match.homeTeam.trim(), nameMaxWidth), padding + nameInset, centerY + 1);
        ctx.textAlign = 'right';
        ctx.fillText(truncateTextToWidth(ctx, match.awayTeam.trim(), nameMaxWidth), canvas.width - padding - nameInset, centerY + 1);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rowInk;
        ctx.font = `900 ${timeFontSize}px ${FONT_EDITORIAL_SCORE}`;
        ctx.fillText(labels[index], timeCenter, centerY + sy(4));
        ctx.restore();
    });

    drawImpactoFooter(ctx, canvas, brandLogo, tone, { padding, hasNext: data.matches.length > matches.length });
}

// ============================================================================
// Fan V5 — la familia BASICA, la del hincha.
//
// Es la unica linea CLARA del motor: una hoja de papel, filetes de un pixel y
// sans en los cinco roles tipograficos. Nada de degradados, texturas, vinetas,
// halos ni sombras — si un recurso decora sin explicar, no entra en la pieza.
// Es el reves exacto de la placa de G22 Base (campo de color, condensadas
// pesadas, dos reglas gordas), y por eso aca los escudos van CON el nombre del
// club al lado: el hincha comparte para que se entienda de un vistazo, no para
// lucir la pieza.
//
// Cobertura propia: partido (resultado y horario), tabla de posiciones y
// fixture del dia. El resto de los templates cae a G22 Base a proposito.
// ============================================================================

// La firma de la familia: el logo del header de la web. El icono de la app no
// alcanza —es una marca de aplicacion, no de medio— y ademas se lee como un
// sello ajeno al pie de una placa.
const FAN_WORDMARK_SOURCE = '/header-logo.png';

type FanTone = {
    sheet: string;
    ink: string;
    softInk: string;
    muted: string;
    line: string;
    accent: string;
};

function getFanTone(accentColor: string, bgColor: string): FanTone {
    const normalizedAccent = normalizeHexColor(accentColor);
    const accent = isHexColor(normalizedAccent) ? normalizedAccent : BRAND_ACCENT;
    const normalizedBg = normalizeHexColor(bgColor);
    // La hoja es SIEMPRE clara: eso es lo que separa a esta familia de las otras
    // cuatro. Un Fondo claro se respeta tal cual —el control tiene que hacer
    // algo—; los oscuros, que son casi todas las paletas del modal, caen en
    // papel blanco apenas tenido por el Acento.
    const sheet = isHexColor(normalizedBg) && getContrastColor(normalizedBg) === '#0f172a'
        ? normalizedBg
        : mixHexColors('#ffffff', accent, 0.04);
    const ink = '#111827';

    return {
        sheet,
        ink,
        softInk: hexToRGBA(ink, 0.72),
        muted: hexToRGBA(ink, 0.5),
        line: hexToRGBA(ink, 0.14),
        accent,
    };
}

// El fondo es una hoja lisa. No hay nada mas: ni grano, ni trama, ni vineta.
function drawFanSheet(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, tone: FanTone) {
    ctx.save();
    ctx.fillStyle = tone.sheet;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

// Un filete, no una regla: un pixel de alto salvo que se pida otra cosa.
function drawFanRule(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    tone: FanTone,
    options?: { thickness?: number; color?: string }
) {
    ctx.save();
    ctx.fillStyle = options?.color || tone.line;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.max(1, Math.round(options?.thickness ?? 1)));
    ctx.restore();
}

// Sin sombra ni marco: la imagen entra contenida y se acabo.
function drawFanImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | null,
    centerX: number,
    centerY: number,
    width: number,
    height: number
) {
    if (!img) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const placement = getContainedImagePlacement(img, centerX, centerY, width, height, 0);
    ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
    ctx.restore();
}

// El escudo de una fila. En la tabla y en el fixture un escudo que no carga cae
// en iniciales —igual que en las otras familias—; en la pieza del partido, en
// cambio, se corta la exportacion.
function drawFanCrest(
    ctx: CanvasRenderingContext2D,
    options: {
        centerX: number;
        centerY: number;
        size: number;
        img: HTMLImageElement | null;
        label: string;
        rawLogo?: string;
        tone: FanTone;
    }
) {
    const { centerX, centerY, size, img, label, rawLogo, tone } = options;
    if (img) {
        drawFanImage(ctx, img, centerX, centerY, size, size);
        return;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.muted;
    ctx.font = `800 ${Math.round(size * 0.34)}px ${FONT_BODY}`;
    ctx.fillText(getFallbackLogoText(rawLogo, label), centerX, centerY + 1);
    ctx.restore();
}

// La firma es EL LOGO DEL HEADER —el mismo de la web, no el icono de la app— y
// entra como bloque para poder centrarlo, pegarlo a un margen o colgarlo del
// titular sin recalcular anchos a mano en cada pieza. Devuelve el ancho que
// ocupo, que es lo que necesita el vecino para no escribirle encima.
//
// Si el archivo no carga cae al icono con "G22 SCORES" al lado: una pieza sin
// firma no se publica, pero tampoco se rompe.
function drawFanBrand(
    ctx: CanvasRenderingContext2D,
    wordmarkLogo: HTMLImageElement | null,
    fallbackIcon: HTMLImageElement | null,
    tone: FanTone,
    options: { centerX?: number; right?: number; centerY: number; unit: (value: number) => number; height?: number; scale?: number }
): number {
    const u = options.unit;
    const scale = options.scale ?? 1;

    if (wordmarkLogo && wordmarkLogo.naturalWidth && wordmarkLogo.naturalHeight) {
        const height = Math.round((options.height ?? u(58)) * scale);
        const width = height * (wordmarkLogo.naturalWidth / wordmarkLogo.naturalHeight);
        const left = typeof options.right === 'number'
            ? options.right - width
            : (options.centerX ?? 0) - width / 2;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(wordmarkLogo, left, options.centerY - height / 2, width, height);
        ctx.restore();
        return width;
    }

    const fontSize = Math.max(12, Math.round(u(24) * scale));
    const iconSize = Math.max(14, Math.round(u(34) * scale));
    const gap = Math.max(6, Math.round(u(12) * scale));
    const label = 'G22 SCORES';

    ctx.save();
    ctx.font = `800 ${fontSize}px ${FONT_BODY}`;
    setCanvasTracking(ctx, u(2));
    const labelWidth = ctx.measureText(label).width;
    const totalWidth = (fallbackIcon ? iconSize + gap : 0) + labelWidth;
    const left = typeof options.right === 'number'
        ? options.right - totalWidth
        : (options.centerX ?? 0) - totalWidth / 2;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.softInk;
    ctx.fillText(label, left + (fallbackIcon ? iconSize + gap : 0), options.centerY + 1);
    setCanvasTracking(ctx, 0);
    ctx.restore();

    if (fallbackIcon) {
        drawFanImage(ctx, fallbackIcon, left + iconSize / 2, options.centerY, iconSize, iconSize);
    }

    return totalWidth;
}

// El encabezado de las tres piezas: el torneo arriba en gris y la etapa (o la
// fecha) abajo en el Acento. Centrado en el post; alineado a la izquierda en el
// story, donde la firma se va al margen de arriba a la derecha y necesita el
// renglon del torneo corrido. Devuelve el borde inferior porque lo que sigue se
// cuelga de ahi.
function drawFanKicker(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    kicker: string,
    highlight: string,
    tone: FanTone,
    options: {
        top: number;
        maxWidth: number;
        unit: (value: number) => number;
        align?: 'center' | 'left';
        left?: number;
        // El renglon del torneo puede tener menos ancho que el titular cuando la
        // firma le ocupa la punta derecha; el titular, que va mas abajo, no.
        primaryMaxWidth?: number;
    }
): number {
    const u = options.unit;
    const align = options.align ?? 'center';
    const anchorX = align === 'left' ? (options.left ?? 0) : canvas.width / 2;
    let cursor = options.top;

    const primary = (kicker || '').trim().toUpperCase();
    if (primary) {
        ctx.save();
        ctx.textAlign = align === 'left' ? 'left' : 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = tone.muted;
        // El tracking se aplica ANTES de medir: measureText lo cuenta, y al
        // reves el titulo se pasaba del ancho util por el espaciado.
        setCanvasTracking(ctx, u(3));
        const size = setFittedFont(ctx, primary, options.primaryMaxWidth ?? options.maxWidth, '700', u(26), FONT_BODY, u(15));
        ctx.fillText(primary, anchorX, cursor);
        setCanvasTracking(ctx, 0);
        ctx.restore();
        cursor += size + u(16);
    }

    const secondary = (highlight || '').trim().toUpperCase();
    if (secondary) {
        ctx.save();
        ctx.textAlign = align === 'left' ? 'left' : 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = tone.accent;
        setCanvasTracking(ctx, u(2));
        const size = setFittedFont(ctx, secondary, options.maxWidth, '800', u(44), FONT_BODY, u(20));
        ctx.fillText(secondary, anchorX, cursor);
        setCanvasTracking(ctx, 0);
        ctx.restore();
        cursor += size + u(12);
    }

    return cursor;
}

// El pie: un filete y una sola fila. La firma va CENTRADA en esa fila y el dato
// que sobrevive (fecha, sede, pagina) queda a la izquierda. En el story la firma
// se muda arriba y el pie se queda solo con el dato: `showBrand` es esa decision.
function drawFanFooter(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    brandLogo: HTMLImageElement | null,
    tone: FanTone,
    options: {
        padding: number;
        unit: (value: number) => number;
        meta?: string;
        showBrand?: boolean;
        wordmark?: HTMLImageElement | null;
    }
): number {
    const u = options.unit;
    const padding = options.padding;
    const contentWidth = canvas.width - padding * 2;
    const ruleY = canvas.height - u(132);
    drawFanRule(ctx, padding, ruleY, contentWidth, tone);

    const rowCenterY = ruleY + u(58);
    const showBrand = options.showBrand !== false;
    if (showBrand) {
        drawFanBrand(ctx, options.wordmark ?? null, brandLogo, tone, {
            centerX: canvas.width / 2,
            centerY: rowCenterY,
            unit: u,
            height: u(60),
        });
    }

    const meta = (options.meta || '').trim().toUpperCase();
    if (meta) {
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tone.muted;
        ctx.font = `700 ${u(20)}px ${FONT_BODY}`;
        setCanvasTracking(ctx, u(1));
        if (showBrand) {
            // Con la firma en el medio de la fila, al dato le quedaba media hoja
            // y "APOLLO PROJECTS STADIUM" moria en tres letras. Va centrado
            // ARRIBA del filete, donde tiene el ancho entero.
            ctx.textAlign = 'center';
            ctx.fillText(truncateTextToWidth(ctx, meta, contentWidth), canvas.width / 2, ruleY - u(26));
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(truncateTextToWidth(ctx, meta, contentWidth), padding, rowCenterY + 1);
        }
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }

    return showBrand && meta ? ruleY - u(44) : ruleY;
}

// El partido: dos escudos con su nombre y el marcador (o la hora) en el medio,
// entre dos filetes. La composicion se CENTRA en el hueco que queda entre el
// filete de arriba y el del pie: asi el story no se convierte en una pieza
// colgada de la cabecera con medio metro de hoja vacia abajo.
async function drawFanMatch(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const [homeLogo, awayLogo, tournamentLogo, wordmark] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(getTournamentLogoImageSource(data)),
        loadImage(FAN_WORDMARK_SOURCE),
    ]);

    // Escudo real o no hay pieza: la misma regla dura que la placa de G22 Base.
    // El preview del modal muestra este mismo mensaje, asi que se ve ANTES de
    // exportar y se sabe a que club le falta el escudo.
    const missingCrests = [
        homeLogo ? '' : (data.homeTeam || '').trim() || 'el local',
        awayLogo ? '' : (data.awayTeam || '').trim() || 'el visitante',
    ].filter(Boolean);
    if (missingCrests.length > 0) {
        throw new Error(`No se pudo cargar el escudo de ${missingCrests.join(' y ')}`);
    }

    const W = canvas.width;
    const H = canvas.height;
    // Los dos formatos miden 1080 de ancho y solo cambian de alto: TODO se
    // escala por ANCHO y el alto de mas del story se reparte como aire.
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const isStory = format.height > format.width && format.height >= 1600;
    const tone = getFanTone(accentColor, bgColor);

    drawFanSheet(ctx, canvas, tone);

    const padding = u(84);
    const contentWidth = W - padding * 2;
    const isScheduled = data.status === 'scheduled';
    const homeName = (data.homeTeam || '').trim().toUpperCase();
    const awayName = (data.awayTeam || '').trim().toUpperCase();
    // El rotulo del torneo manda si ya trae la etapa adentro ("Final - TRL M19"),
    // igual que en la placa de G22 Base: applyMatchExportMode pisa mainTitle con
    // RESULTADO/HORARIO, asi que sin esta particion no hay forma de decir FINAL.
    const rawTournament = stripTournamentCountryPrefix(data.tournament || '');
    const stageSplit = rawTournament.split(/\s[-|]\s/);
    const tournamentCarriesStage = stageSplit.length > 1;
    const tournamentLabel = tournamentCarriesStage ? stageSplit.slice(1).join(' - ').trim() : rawTournament;
    const stageLabel = tournamentCarriesStage
        ? stageSplit[0].trim()
        : (data.mainTitle || getStatusLabel(data.status) || '').trim();

    let cursor = u(104) + extra * 0.12;

    if (tournamentLogo) {
        const logoHeight = u(88);
        const logoWidth = Math.min(contentWidth * 0.46, logoHeight * 3);
        drawFanImage(ctx, tournamentLogo, W / 2, cursor + logoHeight / 2, logoWidth, logoHeight);
        cursor += logoHeight + u(28);
    }

    cursor = drawFanKicker(ctx, canvas, stageLabel, tournamentLabel, tone, {
        top: cursor,
        maxWidth: contentWidth,
        unit: u,
    });

    // En el story la firma cuelga del nombre del torneo, no del pie: el pie
    // queda tan lejos del contenido que la marca se lee como de otra pieza.
    if (isStory) {
        drawFanBrand(ctx, wordmark, brandLogo, tone, {
            centerX: W / 2,
            centerY: cursor + u(44),
            unit: u,
            height: u(88),
        });
        cursor += u(104);
    }

    const topRuleY = cursor + u(16) + extra * 0.06;
    drawFanRule(ctx, padding, topRuleY, contentWidth, tone);

    const metaLabel = isScheduled
        ? (data.venue || '').trim()
        : [data.date, data.venue].filter(Boolean).join('   ·   ');
    const footerRuleY = drawFanFooter(ctx, canvas, brandLogo, tone, {
        padding,
        unit: u,
        meta: metaLabel,
        showBrand: !isStory,
        wordmark,
    });

    const bandTop = topRuleY + u(48);
    const bandBottom = footerRuleY - u(48);
    const bandHeight = Math.max(u(280), bandBottom - bandTop);
    // El escudo se mide contra el ANCHO: cada pixel que crece se lo saca al hueco
    // del centro, que es donde vive el marcador. Con 0.32 de la caja el "27 - 29"
    // quedaba en 60px, mas chico que el nombre del club.
    const crestSize = Math.min(u(276), contentWidth * 0.3, bandHeight * 0.52);
    const nameGap = u(26);
    const nameSizeCap = Math.min(u(36), crestSize * 0.16);
    const blockHeight = crestSize + nameGap + nameSizeCap;
    const blockTop = bandTop + Math.max(0, (bandHeight - blockHeight) / 2);
    const crestCenterY = blockTop + crestSize / 2;
    const columnCenterLeft = padding + crestSize / 2 + u(6);
    const columnCenterRight = W - columnCenterLeft;

    drawFanImage(ctx, homeLogo, columnCenterLeft, crestCenterY, crestSize, crestSize);
    drawFanImage(ctx, awayLogo, columnCenterRight, crestCenterY, crestSize, crestSize);

    // Los nombres SI se escriben: es la diferencia con la placa de G22 Base,
    // donde hablan los escudos solos.
    const nameMaxWidth = crestSize + u(80);
    const nameSize = getSharedFittedFontSize(
        ctx,
        [
            { text: homeName, maxWidth: nameMaxWidth },
            { text: awayName, maxWidth: nameMaxWidth },
        ],
        '800',
        nameSizeCap,
        FONT_BODY,
        u(18)
    );

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tone.ink;
    ctx.font = `800 ${nameSize}px ${FONT_BODY}`;
    const nameTop = blockTop + crestSize + nameGap;
    ctx.fillText(truncateTextToWidth(ctx, homeName, nameMaxWidth), columnCenterLeft, nameTop);
    ctx.fillText(truncateTextToWidth(ctx, awayName, nameMaxWidth), columnCenterRight, nameTop);
    ctx.restore();

    // El centro: el marcador, o la hora con la fecha encima en chico. Cuerpo
    // FIJO que se achica si no entra — no se estira para llenar el ancho, que
    // es lo que hace la placa de G22 Base.
    const centerMaxWidth = Math.max(u(200), W - (columnCenterLeft + crestSize / 2) * 2 - u(40));
    const centerText = isScheduled
        ? (data.time || '--:--').trim()
        : `${data.homeScore ?? '-'} - ${data.awayScore ?? '-'}`;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.ink;
    const centerSize = setFittedFont(ctx, centerText, centerMaxWidth, '900', u(140), FONT_CLASSIC_MATCH_SCORE, u(46));
    ctx.fillText(centerText, W / 2, crestCenterY);
    ctx.restore();

    const dateText = isScheduled ? (data.date || '').trim().toUpperCase() : '';
    if (dateText) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = tone.muted;
        ctx.font = `700 ${u(24)}px ${FONT_BODY}`;
        setCanvasTracking(ctx, u(2));
        ctx.fillText(
            truncateTextToWidth(ctx, dateText, centerMaxWidth + u(60)),
            W / 2,
            crestCenterY - centerSize * 0.5 - u(14)
        );
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }

    const hasPenalties = !isScheduled
        && typeof data.homePenalties === 'number'
        && typeof data.awayPenalties === 'number';
    if (hasPenalties) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = tone.muted;
        ctx.font = `700 ${u(22)}px ${FONT_BODY}`;
        setCanvasTracking(ctx, u(2));
        ctx.fillText(`PENALES ${data.homePenalties} - ${data.awayPenalties}`, W / 2, crestCenterY + centerSize * 0.5 + u(12));
        setCanvasTracking(ctx, 0);
        ctx.restore();
    }
}

// La tabla: filas sin relleno, separadas por un filete. El color aparece en
// tres lugares y en ninguno mas — la linea del encabezado, la tirita de zona a
// la izquierda de la fila y el fondo tenue del club marcado.
async function drawFanStandings(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const isStory = format.height > format.width && format.height >= 1600;
    const tone = getFanTone(accentColor, bgColor);
    const rows = slide.groups.flatMap((group) => group.rows);
    const [logos, wordmark] = await Promise.all([
        Promise.all(rows.map((row) => loadImage(row.teamLogo || ''))),
        loadImage(FAN_WORDMARK_SOURCE),
    ]);
    const legendItems = collectStandingsLegendEntries(rows, tone.accent);

    drawFanSheet(ctx, canvas, tone);

    const padding = u(72);
    const contentWidth = W - padding * 2;
    const title = stripTournamentCountryPrefix(data.title || '') || 'Tabla de posiciones';
    const subtitle = (data.subtitle || '').trim();

    let cursor = u(96) + extra * 0.1;
    // En el story la firma se va al margen de arriba a la derecha y el titulo
    // baja a la izquierda; en el post sigue todo centrado, con la firma al pie.
    const headerBrandWidth = isStory
        ? drawFanBrand(ctx, wordmark, brandLogo, tone, { right: W - padding, centerY: cursor + u(20), unit: u, height: u(58) })
        : 0;
    cursor = drawFanKicker(ctx, canvas, title, subtitle || 'TABLA DE POSICIONES', tone, {
        top: cursor,
        maxWidth: contentWidth,
        primaryMaxWidth: isStory ? contentWidth - headerBrandWidth - u(28) : contentWidth,
        align: isStory ? 'left' : 'center',
        left: padding,
        unit: u,
    });

    const footerMeta = slide.totalPages > 1 ? `Pagina ${slide.pageNumber} de ${slide.totalPages}` : '';
    const footerRuleY = drawFanFooter(ctx, canvas, brandLogo, tone, {
        padding,
        unit: u,
        meta: footerMeta,
        showBrand: !isStory,
        wordmark,
    });

    // Columnas: la izquierda es puesto + escudo + nombre; los numeros se anclan
    // a la derecha, con PTS pegado al margen porque es lo que se mira primero.
    const tableRight = W - padding;
    const pointsCenter = tableRight - u(38);
    const diffCenter = pointsCenter - u(96);
    const lostCenter = diffCenter - u(74);
    const wonCenter = lostCenter - u(66);
    const playedCenter = wonCenter - u(66);
    const posCenter = padding + u(42);
    const crestCenterX = padding + u(112);

    const headerTop = cursor + u(22);
    const headerHeight = u(46);
    const headerCenterY = headerTop + headerHeight / 2;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.muted;
    ctx.font = `700 ${u(22)}px ${FONT_BODY}`;
    setCanvasTracking(ctx, u(2));
    ctx.textAlign = 'center';
    ctx.fillText('P', posCenter, headerCenterY);
    ctx.textAlign = 'left';
    ctx.fillText('EQUIPO', crestCenterX + u(56), headerCenterY);
    ctx.textAlign = 'center';
    ctx.fillText((data.columnLabels?.played?.trim() || 'PJ').toUpperCase(), playedCenter, headerCenterY);
    ctx.fillText((data.columnLabels?.won?.trim() || 'G').toUpperCase(), wonCenter, headerCenterY);
    ctx.fillText((data.columnLabels?.lost?.trim() || 'P').toUpperCase(), lostCenter, headerCenterY);
    ctx.fillText((data.columnLabels?.diff?.trim() || 'DIF').toUpperCase(), diffCenter, headerCenterY);
    ctx.fillText((data.columnLabels?.points?.trim() || 'PTS').toUpperCase(), pointsCenter, headerCenterY);
    setCanvasTracking(ctx, 0);
    ctx.restore();

    // El unico trazo grueso de la pieza, y va en el Acento: cierra el
    // encabezado y le da a la tabla un piso del que colgarse.
    const headerRuleY = headerTop + headerHeight + u(6);
    drawFanRule(ctx, padding, headerRuleY, contentWidth, tone, { thickness: u(3), color: tone.accent });

    const legendHeight = legendItems.length > 0 ? u(46) : 0;
    const rowsTop = headerRuleY + u(18);
    const rowsBottom = footerRuleY - u(26) - legendHeight;
    const groupLabels = slide.groups.map((group) => formatStandingsGroupLabel(group));
    const groupLabelHeight = u(40);
    const reservedGroupSpace = groupLabels.reduce((total, label) => (label ? total + groupLabelHeight : total), 0);
    const availableHeight = Math.max(u(200), rowsBottom - rowsTop - reservedGroupSpace);
    const rowHeight = clampNumber(
        availableHeight / Math.max(rows.length, 1),
        u(44),
        u(isStory ? 140 : 96)
    );
    // La tabla se cuelga del encabezado y el sobrante queda ABAJO. Centrarla
    // abria un hueco entre la linea de acento y la primera fila, y una tabla que
    // no arranca pegada a su encabezado se lee como un error de armado.
    const rowsOrigin = rowsTop;

    const crestSize = Math.min(rowHeight * 0.7, u(66));
    const nameX = crestCenterX + crestSize / 2 + u(20);
    const nameMaxWidth = Math.max(u(150), playedCenter - u(44) - nameX);
    const nameSize = getSharedFittedFontSize(
        ctx,
        rows.map((row) => ({ text: row.team.trim().toUpperCase(), maxWidth: nameMaxWidth })),
        '800',
        Math.min(u(30), rowHeight * 0.4),
        FONT_BODY,
        u(15)
    );
    const statSize = Math.min(u(26), rowHeight * 0.34);
    const highlightName = (data.highlightTeam || '').trim().toLowerCase();

    let cursorY = rowsOrigin;
    let logoIndex = 0;

    slide.groups.forEach((group, groupIndex) => {
        const label = groupLabels[groupIndex];
        if (label) {
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = tone.muted;
            ctx.font = `800 ${u(20)}px ${FONT_BODY}`;
            setCanvasTracking(ctx, u(2));
            ctx.fillText(truncateTextToWidth(ctx, label, contentWidth), padding, cursorY + groupLabelHeight / 2);
            setCanvasTracking(ctx, 0);
            ctx.restore();
            cursorY += groupLabelHeight;
        }

        group.rows.forEach((row, rowIndex) => {
            const logo = logos[logoIndex] || null;
            logoIndex += 1;
            const centerY = cursorY + rowHeight / 2;
            const isHighlighted = Boolean(highlightName) && row.team.trim().toLowerCase() === highlightName;

            // El club marcado es lo unico que se pinta, y apenas: el hincha
            // tiene que encontrar su fila sin que la tabla se vuelva un semaforo.
            if (isHighlighted) {
                ctx.save();
                ctx.fillStyle = hexToRGBA(tone.accent, 0.12);
                ctx.fillRect(padding, cursorY, contentWidth, rowHeight);
                ctx.restore();
            }

            const zoneColor = row.labelName?.trim() && row.zoneColor ? row.zoneColor : '';
            if (zoneColor) {
                ctx.save();
                ctx.fillStyle = zoneColor;
                ctx.beginPath();
                ctx.roundRect(padding, centerY - rowHeight * 0.28, u(5), rowHeight * 0.56, u(3));
                ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = tone.softInk;
            ctx.font = `800 ${statSize}px ${FONT_BODY}`;
            ctx.fillText(String(row.pos), posCenter, centerY + 1);
            ctx.font = `700 ${statSize}px ${FONT_BODY}`;
            ctx.fillStyle = tone.muted;
            ctx.fillText(String(row.played ?? '-'), playedCenter, centerY + 1);
            ctx.fillText(String(row.won ?? '-'), wonCenter, centerY + 1);
            ctx.fillText(String(row.lost ?? '-'), lostCenter, centerY + 1);
            ctx.fillText(String(row.diff ?? '-'), diffCenter, centerY + 1);
            ctx.font = `800 ${statSize}px ${FONT_BODY}`;
            ctx.fillStyle = tone.ink;
            ctx.fillText(String(row.points ?? '-'), pointsCenter, centerY + 1);
            ctx.restore();

            drawFanCrest(ctx, {
                centerX: crestCenterX,
                centerY,
                size: crestSize,
                img: logo,
                label: row.team,
                rawLogo: row.teamLogo,
                tone,
            });

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = tone.ink;
            ctx.font = `800 ${nameSize}px ${FONT_BODY}`;
            ctx.fillText(truncateTextToWidth(ctx, row.team.trim().toUpperCase(), nameMaxWidth), nameX, centerY + 1);
            ctx.restore();

            const isLastRow = groupIndex === slide.groups.length - 1 && rowIndex === group.rows.length - 1;
            if (!isLastRow) {
                drawFanRule(ctx, padding, cursorY + rowHeight, contentWidth, tone);
            }

            cursorY += rowHeight;
        });
    });

    // La tirita de color no dice nada sola: si hay zonas, hay referencia.
    if (legendItems.length > 0) {
        const legendY = footerRuleY - u(24);
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = `700 ${u(19)}px ${FONT_BODY}`;
        let legendX = padding;
        legendItems.forEach((item) => {
            const label = item.label.toUpperCase();
            const labelWidth = ctx.measureText(label).width;
            const blockWidth = u(14) + u(9) + labelWidth + u(26);
            if (legendX + blockWidth > W - padding) return;
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.roundRect(legendX, legendY - u(6), u(14), u(12), u(6));
            ctx.fill();
            ctx.fillStyle = tone.muted;
            ctx.fillText(label, legendX + u(14) + u(9), legendY + 1);
            legendX += blockWidth;
        });
        ctx.restore();
    }
}

// El fixture: una linea por partido, el horario (o el marcador) en el medio y
// cada club de su lado. Filete entre filas, nada de barras ni capsulas.
async function drawFanDailyMatches(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    timeMode: DailyMatchesTimeMode = 'time'
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const isStory = format.height > format.width && format.height >= 1600;
    const tone = getFanTone(accentColor, bgColor);
    const matches = data.matches.slice(0, 10);
    const [logos, wordmark] = await Promise.all([
        Promise.all(matches.flatMap((match) => [loadImage(match.homeLogo || ''), loadImage(match.awayLogo || '')])),
        loadImage(FAN_WORDMARK_SOURCE),
    ]);

    drawFanSheet(ctx, canvas, tone);

    const padding = u(72);
    const contentWidth = W - padding * 2;

    let cursor = u(96) + extra * 0.1;
    const headerBrandWidth = isStory
        ? drawFanBrand(ctx, wordmark, brandLogo, tone, { right: W - padding, centerY: cursor + u(20), unit: u, height: u(58) })
        : 0;
    cursor = drawFanKicker(ctx, canvas, stripTournamentCountryPrefix(data.tournament || ''), data.date, tone, {
        top: cursor,
        maxWidth: contentWidth,
        primaryMaxWidth: isStory ? contentWidth - headerBrandWidth - u(28) : contentWidth,
        align: isStory ? 'left' : 'center',
        left: padding,
        unit: u,
    });

    const hiddenMatches = data.matches.length - matches.length;
    const footerRuleY = drawFanFooter(ctx, canvas, brandLogo, tone, {
        padding,
        unit: u,
        meta: hiddenMatches > 0 ? `+${hiddenMatches} partidos mas` : '',
        showBrand: !isStory,
        wordmark,
    });

    const headerTop = cursor + u(20);
    const headerHeight = u(42);
    const headerCenterY = headerTop + headerHeight / 2;
    const centerX = W / 2;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.muted;
    ctx.font = `700 ${u(21)}px ${FONT_BODY}`;
    setCanvasTracking(ctx, u(2));
    ctx.textAlign = 'left';
    ctx.fillText('LOCAL', padding, headerCenterY);
    ctx.textAlign = 'center';
    ctx.fillText(timeMode === 'vs' ? 'CRUCE' : 'HORARIO', centerX, headerCenterY);
    ctx.textAlign = 'right';
    ctx.fillText('VISITA', W - padding, headerCenterY);
    setCanvasTracking(ctx, 0);
    ctx.restore();

    const headerRuleY = headerTop + headerHeight + u(6);
    drawFanRule(ctx, padding, headerRuleY, contentWidth, tone, { thickness: u(3), color: tone.accent });

    const rowsTop = headerRuleY + u(16);
    const rowsBottom = footerRuleY - u(24);
    const rowHeight = clampNumber(
        (rowsBottom - rowsTop) / Math.max(matches.length, 1),
        u(64),
        u(isStory ? 172 : 128)
    );
    const rowsOrigin = rowsTop;
    const crestSize = Math.min(rowHeight * 0.62, u(78));

    const labels = matches.map((match) => (
        match.status === 'scheduled'
            ? getScheduledMatchLabel(match, timeMode)
            : `${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}`
    ));

    const timeSize = Math.min(u(44), rowHeight * 0.42);
    ctx.save();
    ctx.font = `800 ${timeSize}px ${FONT_CLASSIC_MATCH_SCORE}`;
    const timeBlockWidth = Math.max(u(150), ...labels.map((label) => ctx.measureText(label).width)) + u(48);
    ctx.restore();

    const nameInset = padding + crestSize + u(20);
    const nameMaxWidth = Math.max(u(140), (W - timeBlockWidth) / 2 - nameInset - u(10));
    const nameSize = getSharedFittedFontSize(
        ctx,
        matches.flatMap((match) => ([
            { text: match.homeTeam.trim().toUpperCase(), maxWidth: nameMaxWidth },
            { text: match.awayTeam.trim().toUpperCase(), maxWidth: nameMaxWidth },
        ])),
        '800',
        Math.min(u(30), rowHeight * 0.32),
        FONT_BODY,
        u(15)
    );

    let logoIndex = 0;

    matches.forEach((match, index) => {
        const rowY = rowsOrigin + index * rowHeight;
        const centerY = rowY + rowHeight / 2;
        const homeLogo = logos[logoIndex] || null;
        const awayLogo = logos[logoIndex + 1] || null;
        logoIndex += 2;

        drawFanCrest(ctx, {
            centerX: padding + crestSize / 2,
            centerY,
            size: crestSize,
            img: homeLogo,
            label: match.homeTeam,
            rawLogo: match.homeLogo,
            tone,
        });
        drawFanCrest(ctx, {
            centerX: W - padding - crestSize / 2,
            centerY,
            size: crestSize,
            img: awayLogo,
            label: match.awayTeam,
            rawLogo: match.awayLogo,
            tone,
        });

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tone.ink;
        ctx.font = `800 ${nameSize}px ${FONT_BODY}`;
        ctx.textAlign = 'left';
        ctx.fillText(truncateTextToWidth(ctx, match.homeTeam.trim().toUpperCase(), nameMaxWidth), nameInset, centerY + 1);
        ctx.textAlign = 'right';
        ctx.fillText(truncateTextToWidth(ctx, match.awayTeam.trim().toUpperCase(), nameMaxWidth), W - nameInset, centerY + 1);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Un partido jugado se lee en tinta plena; uno que todavia no empezo va
        // en gris: la hora no es un resultado.
        ctx.fillStyle = match.status === 'scheduled' ? tone.softInk : tone.ink;
        ctx.font = `800 ${timeSize}px ${FONT_CLASSIC_MATCH_SCORE}`;
        ctx.fillText(labels[index], centerX, centerY + 1);
        ctx.restore();

        if (index < matches.length - 1) {
            drawFanRule(ctx, padding, rowY + rowHeight, contentWidth, tone);
        }
    });
}

// El palmares del hincha: NO es el afiche del podio. La vitrina se lee como una
// lista —quien gano y cuantas veces— con el campeon arriba, mas grande, y el
// resto abajo en filas planas. El podio 2-1-3 sigue siendo la pieza del gestor.
async function drawFanPalmares(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    slide: StandingsSlideData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const isStory = format.height > format.width && format.height >= 1600;
    const tone = getFanTone(accentColor, bgColor);
    const rows = slide.groups.flatMap((group) => group.rows);
    const [logos, wordmark] = await Promise.all([
        Promise.all(rows.map((row) => loadImage(row.teamLogo || ''))),
        loadImage(FAN_WORDMARK_SOURCE),
    ]);

    drawFanSheet(ctx, canvas, tone);

    const padding = u(72);
    const contentWidth = W - padding * 2;
    const title = stripTournamentCountryPrefix(data.title || '') || 'Palmares';
    const subtitle = (data.subtitle || '').trim();

    let cursor = u(96) + extra * 0.1;
    const headerBrandWidth = isStory
        ? drawFanBrand(ctx, wordmark, brandLogo, tone, { right: W - padding, centerY: cursor + u(20), unit: u, height: u(58) })
        : 0;
    cursor = drawFanKicker(ctx, canvas, title, subtitle || 'PALMARES', tone, {
        top: cursor,
        maxWidth: contentWidth,
        primaryMaxWidth: isStory ? contentWidth - headerBrandWidth - u(28) : contentWidth,
        align: isStory ? 'left' : 'center',
        left: padding,
        unit: u,
    });

    const footerMeta = slide.totalPages > 1 ? `Pagina ${slide.pageNumber} de ${slide.totalPages}` : '';
    const footerRuleY = drawFanFooter(ctx, canvas, brandLogo, tone, {
        padding,
        unit: u,
        meta: footerMeta,
        showBrand: !isStory,
        wordmark,
    });

    const titlesLabel = (data.columnLabels?.points?.trim() || 'Titulos').toUpperCase();
    const headerTop = cursor + u(22);
    const headerHeight = u(46);
    const headerCenterY = headerTop + headerHeight / 2;
    const titlesCenter = W - padding - u(52);
    const posCenter = padding + u(30);
    const crestCenterX = padding + u(104);
    const nameX = crestCenterX + u(56);

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.muted;
    ctx.font = `700 ${u(22)}px ${FONT_BODY}`;
    setCanvasTracking(ctx, u(2));
    ctx.textAlign = 'left';
    ctx.fillText('CAMPEON', nameX, headerCenterY);
    ctx.textAlign = 'center';
    ctx.fillText(titlesLabel, titlesCenter, headerCenterY);
    setCanvasTracking(ctx, 0);
    ctx.restore();

    const headerRuleY = headerTop + headerHeight + u(6);
    drawFanRule(ctx, padding, headerRuleY, contentWidth, tone, { thickness: u(3), color: tone.accent });

    // El campeon ocupa una fila y media: es el unico gesto de jerarquia que se
    // permite la familia, y alcanza para que la vitrina no se lea como una tabla.
    const rowsTop = headerRuleY + u(20);
    const rowsBottom = footerRuleY - u(26);
    const leaderWeight = rows.length > 1 ? 1.9 : 1;
    const rowUnits = leaderWeight + Math.max(0, rows.length - 1);
    const baseRowHeight = clampNumber(
        (rowsBottom - rowsTop) / Math.max(rowUnits, 1),
        u(46),
        u(isStory ? 128 : 108)
    );

    const nameMaxWidth = Math.max(u(180), titlesCenter - u(70) - nameX);
    const nameSize = getSharedFittedFontSize(
        ctx,
        rows.slice(1).map((row) => ({ text: row.team.trim().toUpperCase(), maxWidth: nameMaxWidth })),
        '800',
        Math.min(u(32), baseRowHeight * 0.42),
        FONT_BODY,
        u(16)
    );

    let cursorY = rowsTop;

    rows.forEach((row, index) => {
        const isLeader = index === 0 && rows.length > 1;
        const rowHeight = baseRowHeight * (isLeader ? leaderWeight : 1);
        const centerY = cursorY + rowHeight / 2;
        const crestSize = Math.min(rowHeight * (isLeader ? 0.72 : 0.68), u(isLeader ? 128 : 66));
        const logo = logos[index] || null;

        if (isLeader) {
            ctx.save();
            ctx.fillStyle = hexToRGBA(tone.accent, 0.1);
            ctx.fillRect(padding, cursorY, contentWidth, rowHeight);
            ctx.restore();
        }

        drawFanCrest(ctx, {
            centerX: crestCenterX,
            centerY,
            size: crestSize,
            img: logo,
            label: row.team,
            rawLogo: row.teamLogo,
            tone,
        });

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = tone.muted;
        ctx.font = `800 ${Math.min(u(26), rowHeight * 0.3)}px ${FONT_BODY}`;
        ctx.fillText(String(row.pos), posCenter, centerY + 1);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tone.ink;
        const leaderNameSize = Math.min(u(44), rowHeight * 0.3);
        ctx.font = `800 ${isLeader ? leaderNameSize : nameSize}px ${FONT_BODY}`;
        ctx.fillText(
            truncateTextToWidth(ctx, row.team.trim().toUpperCase(), nameMaxWidth),
            nameX,
            centerY + 1
        );
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isLeader ? tone.accent : tone.ink;
        ctx.font = `800 ${Math.min(isLeader ? u(56) : u(32), rowHeight * 0.42)}px ${FONT_BODY}`;
        ctx.fillText(String(row.points ?? '-'), titlesCenter, centerY + 1);
        ctx.restore();

        if (index < rows.length - 1) {
            drawFanRule(ctx, padding, cursorY + rowHeight, contentWidth, tone);
        }

        cursorY += rowHeight;
    });
}

// El plantel: dos columnas de nombres con el rotulo de su grupo. NO usa el
// tablero compartido de las otras familias: ese tablero tiene cuerpos fijos
// pensados para un panel, y sobre la hoja quedaba una lista diminuta arriba con
// media pieza vacia abajo. Aca la fila se estira hasta llenar el alto util.
async function drawFanSquad(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: SquadData,
    page: SquadPageData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const isStory = format.height > format.width && format.height >= 1600;
    const tone = getFanTone(accentColor, bgColor);
    const [teamLogo, wordmark] = await Promise.all([
        loadImage(data.teamLogo || data.tournamentLogo || ''),
        loadImage(FAN_WORDMARK_SOURCE),
    ]);

    drawFanSheet(ctx, canvas, tone);

    const padding = u(72);
    const contentWidth = W - padding * 2;
    const clubName = (data.teamName || '').trim();
    const tournamentLabel = stripTournamentCountryPrefix(data.tournament || '');
    const kickerLabel = tournamentLabel && tournamentLabel !== clubName ? tournamentLabel : (data.title || 'Plantel');

    let cursor = u(92) + extra * 0.1;
    const headerBrandWidth = isStory
        ? drawFanBrand(ctx, wordmark, brandLogo, tone, { right: W - padding, centerY: cursor + u(20), unit: u, height: u(58) })
        : 0;

    // El escudo del club va arriba del nombre: en una pieza sin foto es lo unico
    // que dice de quien es la lista de un vistazo.
    if (teamLogo) {
        const crestSize = u(76);
        drawFanImage(ctx, teamLogo, isStory ? padding + crestSize / 2 : W / 2, cursor + crestSize / 2, crestSize, crestSize);
        cursor += crestSize + u(18);
    }

    cursor = drawFanKicker(ctx, canvas, kickerLabel, clubName || 'PLANTEL', tone, {
        top: cursor,
        maxWidth: contentWidth,
        primaryMaxWidth: isStory ? contentWidth - headerBrandWidth - u(28) : contentWidth,
        align: isStory ? 'left' : 'center',
        left: padding,
        unit: u,
    });

    const footerRuleY = drawFanFooter(ctx, canvas, brandLogo, tone, {
        padding,
        unit: u,
        meta: getSquadPageMetaLabel(data, page),
        showBrand: !isStory,
        wordmark,
    });

    const listTop = cursor + u(26);
    drawFanRule(ctx, padding, listTop - u(16), contentWidth, tone, { thickness: u(3), color: tone.accent });

    const totalPlayers = page.groups.reduce((sum, group) => sum + group.players.length, 0);
    const columnCount = page.groups.length > 1 && (totalPlayers > (isStory ? 18 : 14) || page.groups.length > 2) ? 2 : 1;
    const columns = distributeSquadGroupsAcrossColumns(page.groups, columnCount);
    const columnGap = columnCount > 1 ? u(40) : 0;
    const columnWidth = (contentWidth - columnGap * (columnCount - 1)) / columnCount;

    // Todas las columnas comparten alto de fila: si cada una se acomodara a su
    // propia lista, dos grupos de largo distinto se leerian en dos cuerpos.
    const columnUnits = columns.map((column) => column.groups.reduce(
        (sum, group) => sum + group.players.length + 1.7,
        0
    ));
    const rowHeight = clampNumber(
        (footerRuleY - u(28) - listTop) / Math.max(1, Math.max(...columnUnits)),
        u(26),
        u(isStory ? 76 : 64)
    );
    const numberSize = Math.min(u(24), rowHeight * 0.5);
    const nameSize = Math.min(u(27), rowHeight * 0.54);
    const metaSize = Math.min(u(19), rowHeight * 0.38);

    columns.forEach((column, columnIndex) => {
        const columnLeft = padding + columnIndex * (columnWidth + columnGap);
        const numberX = columnLeft + u(24);
        const nameX = columnLeft + u(58);
        let rowY = listTop;

        column.groups.forEach((group) => {
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = tone.muted;
            ctx.font = `800 ${Math.min(u(20), rowHeight * 0.42)}px ${FONT_BODY}`;
            setCanvasTracking(ctx, u(2));
            ctx.fillText(
                truncateTextToWidth(ctx, formatSquadGroupLabel(group), columnWidth - u(12)),
                columnLeft + u(4),
                rowY + rowHeight * 0.6
            );
            setCanvasTracking(ctx, 0);
            ctx.restore();
            drawFanRule(ctx, columnLeft, rowY + rowHeight - u(4), columnWidth, tone);
            rowY += rowHeight * 1.7;

            group.players.forEach((player) => {
                const centerY = rowY + rowHeight / 2;
                const number = player.number === null || player.number === undefined
                    ? ''
                    : String(player.number).trim();
                const meta = getSquadPlayerMetaLabel(player) || String(player.position || '').trim();

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = tone.accent;
                ctx.font = `800 ${numberSize}px ${FONT_BODY}`;
                if (number) ctx.fillText(number, numberX, centerY + 1);
                ctx.restore();

                ctx.save();
                ctx.font = `700 ${metaSize}px ${FONT_BODY}`;
                const metaText = meta ? meta.toUpperCase() : '';
                const metaWidth = metaText ? Math.min(ctx.measureText(metaText).width, columnWidth * 0.34) : 0;
                ctx.restore();

                ctx.save();
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = tone.ink;
                ctx.font = `800 ${nameSize}px ${FONT_BODY}`;
                const nameMaxWidth = columnWidth - (nameX - columnLeft) - metaWidth - u(18);
                ctx.fillText(truncateTextToWidth(ctx, (player.name || '').trim(), nameMaxWidth), nameX, centerY + 1);
                ctx.restore();

                if (metaText) {
                    ctx.save();
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = tone.muted;
                    ctx.font = `700 ${metaSize}px ${FONT_BODY}`;
                    ctx.fillText(truncateTextToWidth(ctx, metaText, metaWidth), columnLeft + columnWidth - u(4), centerY + 1);
                    ctx.restore();
                }

                rowY += rowHeight;
            });
        });
    });
}

// La formacion: una columna por equipo, el escudo con el nombre arriba y los
// quince abajo. Los suplentes van en gris debajo de su propio rotulo, sin caja.
async function drawFanLineups(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: LineupsData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null,
    mode: LineupExportMode = 'both'
) {
    const W = canvas.width;
    const H = canvas.height;
    const u = (value: number) => Math.round((value * W) / 1080);
    const extra = Math.max(0, H - Math.round((W * 1350) / 1080));
    const isStory = format.height > format.width && format.height >= 1600;
    const tone = getFanTone(accentColor, bgColor);
    const teams = getSelectedLineupTeams(data, mode);
    const [logos, wordmark] = await Promise.all([
        Promise.all(teams.map((team) => loadImage(team.logo || ''))),
        loadImage(FAN_WORDMARK_SOURCE),
    ]);

    drawFanSheet(ctx, canvas, tone);

    const padding = u(72);
    const contentWidth = W - padding * 2;
    const tournamentLabel = stripTournamentCountryPrefix(data.tournament || '');
    const titleLabel = (data.title || '').trim() || 'FORMACIONES';

    let cursor = u(92) + extra * 0.1;
    const headerBrandWidth = isStory
        ? drawFanBrand(ctx, wordmark, brandLogo, tone, { right: W - padding, centerY: cursor + u(20), unit: u, height: u(58) })
        : 0;
    cursor = drawFanKicker(ctx, canvas, tournamentLabel, titleLabel, tone, {
        top: cursor,
        maxWidth: contentWidth,
        primaryMaxWidth: isStory ? contentWidth - headerBrandWidth - u(28) : contentWidth,
        align: isStory ? 'left' : 'center',
        left: padding,
        unit: u,
    });

    const metaLabel = [data.date?.trim(), data.time?.trim(), data.venue?.trim()].filter(Boolean).join('   ·   ');
    const footerRuleY = drawFanFooter(ctx, canvas, brandLogo, tone, {
        padding,
        unit: u,
        meta: metaLabel,
        showBrand: !isStory,
        wordmark,
    });

    const columnGap = teams.length > 1 ? u(36) : 0;
    const columnWidth = (contentWidth - columnGap * (teams.length - 1)) / teams.length;
    const boardTop = cursor + u(22);
    const boardBottom = footerRuleY - u(26);

    // Todas las columnas usan la MISMA altura de fila: si cada una se acomodara
    // a su propia lista, dos formaciones de largo distinto quedarian escritas en
    // dos cuerpos distintos y la pieza se leeria torcida.
    const maxRows = Math.max(
        1,
        ...teams.map((team) => {
            const players = Array.isArray(team.starters) ? team.starters : [];
            const starters = players.filter((player, index) => isLineupStarter(player, index));
            const substitutes = players.filter((player, index) => !isLineupStarter(player, index));
            return starters.length + (substitutes.length > 0 ? substitutes.length + 1 : 0);
        })
    );
    const headBlock = u(112);
    const rowHeight = clampNumber(
        (boardBottom - boardTop - headBlock) / maxRows,
        u(26),
        u(isStory ? 62 : 52)
    );
    const numberSize = Math.min(u(24), rowHeight * 0.5);
    const nameSize = Math.min(u(26), rowHeight * 0.54);

    teams.forEach((team, teamIndex) => {
        const columnLeft = padding + teamIndex * (columnWidth + columnGap);
        const columnCenter = columnLeft + columnWidth / 2;
        const players = Array.isArray(team.starters) ? team.starters : [];
        const starters = players.filter((player, index) => isLineupStarter(player, index));
        const substitutes = players.filter((player, index) => !isLineupStarter(player, index));
        const crestSize = u(72);

        drawFanCrest(ctx, {
            centerX: columnCenter,
            centerY: boardTop + crestSize / 2,
            size: crestSize,
            img: logos[teamIndex] || null,
            label: team.name,
            rawLogo: team.logo,
            tone,
        });

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = tone.ink;
        const clubName = (team.name || '').trim().toUpperCase();
        setFittedFont(ctx, clubName, columnWidth - u(16), '800', u(30), FONT_BODY, u(16));
        ctx.fillText(clubName, columnCenter, boardTop + crestSize + u(14));
        ctx.restore();

        const listTop = boardTop + headBlock;
        drawFanRule(ctx, columnLeft, listTop - u(14), columnWidth, tone, { thickness: u(3), color: tone.accent });

        const numberX = columnLeft + u(26);
        const nameX = columnLeft + u(62);
        const nameMaxWidth = columnWidth - u(74);
        let rowY = listTop;

        const drawPlayerRow = (player: LineupExportPlayerData, isStarter: boolean) => {
            const centerY = rowY + rowHeight / 2;
            const number = player.number === null || player.number === undefined ? '' : String(player.number).trim();
            const name = (player.name || '').trim();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isStarter ? tone.accent : tone.muted;
            ctx.font = `800 ${numberSize}px ${FONT_BODY}`;
            if (number) ctx.fillText(number, numberX, centerY + 1);
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isStarter ? tone.ink : tone.softInk;
            ctx.font = `${isStarter ? '800' : '700'} ${nameSize}px ${FONT_BODY}`;
            const suffix = player.isCaptain ? '  (C)' : '';
            ctx.fillText(truncateTextToWidth(ctx, `${name}${suffix}`, nameMaxWidth), nameX, centerY + 1);
            ctx.restore();

            rowY += rowHeight;
        };

        starters.forEach((player) => drawPlayerRow(player, true));

        if (substitutes.length > 0) {
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = tone.muted;
            ctx.font = `700 ${Math.min(u(20), rowHeight * 0.46)}px ${FONT_BODY}`;
            setCanvasTracking(ctx, u(2));
            ctx.fillText('SUPLENTES', columnLeft + u(4), rowY + rowHeight / 2 + 1);
            setCanvasTracking(ctx, 0);
            ctx.restore();
            drawFanRule(ctx, columnLeft, rowY + rowHeight - u(6), columnWidth, tone);
            rowY += rowHeight;

            substitutes.forEach((player) => drawPlayerRow(player, false));
        }
    });
}
