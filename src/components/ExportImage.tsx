'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import { Plus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from './ExportButton.module.css';

export type ExportFormat = '1080x1350' | '1080x1920';
export type ExportTemplate = 'standings' | 'dailyMatches' | 'matchStats' | 'playerStats' | 'playoffBracket' | 'lineups';
type ExportDateValue = string | number | Date;
type MatchExportMode = 'schedule' | 'result';
type MatchExportLayout = 'classic' | 'editorial4x5';
type StandingsExportMode = 'table' | 'groups';
type LineupExportMode = 'both' | 'home' | 'away';

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

interface StandingsData {
    title: string;
    subtitle: string;
    tournamentLogo?: string;
    rows: StandingsRowData[];
    groups?: StandingsGroupData[];
    columnLabels?: Partial<{
        played: string;
        won: string;
        lost: string;
        diff: string;
        points: string;
    }>;
    plainDiff?: boolean;
    showPositionDelta?: boolean;
}

interface DailyMatchesData {
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

interface MatchStatsData {
    mainTitle?: string;
    status?: 'scheduled' | 'live' | 'final';
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    homeLogo?: string;
    awayLogo?: string;
    tournament: string;
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
    stats: Array<{ label: string; home: number | string; away: number | string }>;
}

interface PlayerStatsData {
    name: string;
    team: string;
    position: string;
    photo?: string;
    stats: Array<{ label: string; value: number | string; highlight?: boolean }>;
}

interface LineupExportPlayerData {
    id?: string | null;
    number?: number | string | null;
    name: string;
    position?: string | null;
    role?: string | null;
    isCaptain?: boolean | null;
}

interface LineupExportTeamData {
    name: string;
    logo?: string;
    lineupLabel?: string;
    starters: LineupExportPlayerData[];
}

interface LineupsData {
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
}

interface PlayoffBracketMatchData {
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

interface PlayoffBracketRoundData {
    round_id?: string | number;
    name: string;
    matches: PlayoffBracketMatchData[];
}

interface PlayoffBracketData {
    title: string;
    subtitle?: string;
    tournamentLogo?: string;
    rounds: PlayoffBracketRoundData[];
}

type ExportData = StandingsData | DailyMatchesData | MatchStatsData | PlayerStatsData | PlayoffBracketData | LineupsData;
type CanvasFormat = { width: number; height: number };
type SafeArea = { top: number; bottom: number; centerX: number; width: number; height: number };
type MatchBackgroundUpload = { name: string; src: string };
type MatchSponsorData = {
    id?: string;
    name?: string;
    logo?: string;
    placement?: string;
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

interface ExportImageProps {
    template: ExportTemplate;
    data: ExportData;
    filename?: string;
    className?: string;
}

type LogoBadgeOptions = {
    x: number;
    y: number;
    size: number;
    img: HTMLImageElement | null;
    label: string;
    rawLogo?: string;
    isDark: boolean;
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
type LocalExportFont = {
    family: string;
    weight: string;
    style?: string;
    sources: string[];
};

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

const FONT_DISPLAY = exportOutfitFont.style.fontFamily;
const FONT_BODY = exportOutfitFont.style.fontFamily;
const FONT_MONO = exportJetBrainsMonoFont.style.fontFamily;
const FONT_OUTFIT_BLACK = exportOutfitFont.style.fontFamily;
const FONT_EDITORIAL = '"Bebas Neue", "Outfit", "Inter", system-ui, sans-serif';
const FONT_CLASSIC_MATCH_SCORE = '"dharma-gothic-m", "dharma-gothic-c", "dharma-gothic-e", "G22 Dharma Gothic", "Bebas Neue", "Outfit", "Inter", system-ui, sans-serif';
const FONT_EDITORIAL_SCORE = '"dharma-gothic-e", "dharma-gothic-c", "G22 Dharma Gothic", "Dharma Gothic Expanded Heavy", "Dharma Gothic E Heavy", "Dharma Gothic Expanded", "Dharma Gothic E", "Bebas Neue", "Outfit", "Inter", system-ui, sans-serif';
const BRAND_ACCENT = '#00a365';
const EDITORIAL_PRESET_STORAGE_KEY = 'g22-export-editorial-presets-v1';
const EDITORIAL_GRADIENT_PRESET_STORAGE_KEY = 'g22-export-editorial-gradient-presets-v1';
const EXPORT_STORAGE_DB_NAME = 'g22-export-storage';
const EXPORT_STORAGE_DB_VERSION = 1;
const EXPORT_STORAGE_STORE_NAME = 'kv';
const EXPORT_STORAGE_EDITORIAL_PRESETS_KEY = 'editorial-presets';
const EXPORT_STORAGE_EDITORIAL_GRADIENTS_KEY = 'editorial-gradient-presets';
const MAX_SAVED_EDITORIAL_PRESETS = 24;
const MAX_SAVED_EDITORIAL_GRADIENT_PRESETS = 24;
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
];
const DEFAULT_PALETTE = EXPORT_PALETTES[0];
const DEFAULT_TIMEZONE_PRESET_ID = 'buenos-aires-ar';
const DEFAULT_TIMEZONE_OFFSET_MINUTES = -180;
const MAX_STANDINGS_ROWS_PER_SLIDE = 20;
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

export default function ExportImage({ template, data, filename = 'g22-export', className = '' }: ExportImageProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isPortalReady, setIsPortalReady] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('1080x1350');
    const [status, setStatus] = useState('');
    const defaultTournamentName = getDefaultTournamentName(template, data);
    const defaultMatchExportMode = getDefaultMatchExportMode(template, data);
    const [customTournamentName, setCustomTournamentName] = useState(defaultTournamentName);
    const [selectedTimeZoneId, setSelectedTimeZoneId] = useState(DEFAULT_TIMEZONE_PRESET_ID);
    const [isTimeZoneDropdownOpen, setIsTimeZoneDropdownOpen] = useState(false);
    const [matchExportMode, setMatchExportMode] = useState<MatchExportMode>(defaultMatchExportMode);
    const [isMatchModeDropdownOpen, setIsMatchModeDropdownOpen] = useState(false);
    const [matchExportLayout, setMatchExportLayout] = useState<MatchExportLayout>('classic');
    const [isMatchLayoutDropdownOpen, setIsMatchLayoutDropdownOpen] = useState(false);
    const [lineupExportMode, setLineupExportMode] = useState<LineupExportMode>('both');
    const groupedStandings = useMemo(
        () => (template === 'standings' ? getExportableStandingsGroups(data as StandingsData) : []),
        [data, template]
    );
    const preferredStandingsExportMode: StandingsExportMode = groupedStandings.length > 0 ? 'groups' : 'table';
    const [standingsExportMode, setStandingsExportMode] = useState<StandingsExportMode>(preferredStandingsExportMode);
    const [detectedUserOffsetMinutes, setDetectedUserOffsetMinutes] = useState(DEFAULT_TIMEZONE_OFFSET_MINUTES);
    const [selectedPaletteId, setSelectedPaletteId] = useState(DEFAULT_PALETTE.id);
    const [accentColor, setAccentColor] = useState(DEFAULT_PALETTE.accent);
    const [bgColor, setBgColor] = useState(DEFAULT_PALETTE.bg);
    const [editorialGradientLeftColor, setEditorialGradientLeftColor] = useState('#df255c');
    const [editorialGradientRightColor, setEditorialGradientRightColor] = useState(DEFAULT_PALETTE.accent);
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
            ? (data as MatchStatsData).editorialShowTopBadge !== false
            : true
    ));
    const [editorialShowHeaderArrows, setEditorialShowHeaderArrows] = useState(() => (
        template === 'matchStats'
            ? (data as MatchStatsData).editorialShowHeaderArrows !== false
            : true
    ));
    const [savedEditorialPresets, setSavedEditorialPresets] = useState<SavedMatchEditorialPreset[]>([]);
    const [savedGradientPresets, setSavedGradientPresets] = useState<SavedMatchGradientPreset[]>([]);
    const [editorialPresetName, setEditorialPresetName] = useState('');
    const [gradientPresetName, setGradientPresetName] = useState('');
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
    const [selectedMatchIndices, setSelectedMatchIndices] = useState<Set<number>>(() => {
        if (template !== 'dailyMatches') return new Set<number>();
        const matches = (data as DailyMatchesData).matches ?? [];
        return new Set(Array.from({ length: Math.min(matches.length, 10) }, (_, index) => index));
    });

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
        if (!showModal) {
            setIsTimeZoneDropdownOpen(false);
            setIsMatchModeDropdownOpen(false);
            setIsMatchLayoutDropdownOpen(false);
        }
    }, [showModal]);

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
        let isMounted = true;

        const hydrateSavedPresets = async () => {
            const [editorialPresets, gradientPresets] = await Promise.all([
                readSavedEditorialPresets(),
                readSavedGradientPresets(),
            ]);

            if (!isMounted) return;
            setSavedEditorialPresets(editorialPresets);
            setSavedGradientPresets(gradientPresets);
        };

        void hydrateSavedPresets();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (template !== 'matchStats') return;
        const matchData = data as MatchStatsData;
        setEditorialLayoutPresetId(getEditorialLayoutPreset(matchData.editorialLayoutPresetId).id);
        setEditorialContextLabel(matchData.editorialContextLabel || '');
        setEditorialShowTopBadge(matchData.editorialShowTopBadge !== false);
        setEditorialShowHeaderArrows(matchData.editorialShowHeaderArrows !== false);
        setEditorialSponsors(buildEditorialSponsorSlots(matchData.sponsors));
        setManualHomeScore(formatExportScoreInput(matchData.homeScore));
        setManualAwayScore(formatExportScoreInput(matchData.awayScore));
        const gradientImage = matchData.editorialGradientImage?.trim();
        setEditorialGradientUpload((current) => current ?? (gradientImage ? { name: 'Degradado preconfigurado', src: gradientImage } : null));
    }, [data, template]);

    useEffect(() => {
        if (template !== 'matchStats' || matchExportLayout !== 'editorial4x5') return;
        if (format !== '1080x1350') {
            setFormat('1080x1350');
        }
        if (matchExportMode !== 'result') {
            setMatchExportMode('result');
        }
    }, [format, matchExportLayout, matchExportMode, template]);

    useEffect(() => {
        const browserOffsetMinutes = getBrowserOffsetMinutes();
        setDetectedUserOffsetMinutes(browserOffsetMinutes);
        setSelectedTimeZoneId(findBestPresetByOffset(browserOffsetMinutes).id);
    }, []);

    const selectedTimeZonePreset = useMemo(
        () => EXPORT_TIMEZONE_PRESETS.find((preset) => preset.id === selectedTimeZoneId) || findBestPresetByOffset(DEFAULT_TIMEZONE_OFFSET_MINUTES),
        [selectedTimeZoneId]
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
    const standingsExportData = useMemo(
        () => template === 'standings'
            ? buildExportData(template, data, customTournamentName, selectedTimeZonePreset) as StandingsData
            : null,
        [customTournamentName, data, selectedTimeZonePreset, template]
    );
    const standingsSlides = useMemo(
        () => standingsExportData ? buildStandingsSlides(standingsExportData, standingsExportMode) : [],
        [standingsExportData, standingsExportMode]
    );
    const activeEditorialSponsors = useMemo(
        () => getActiveEditorialSponsors(editorialSponsors),
        [editorialSponsors]
    );
    const editorialAutoContextLabel = useMemo(() => {
        if (template !== 'matchStats') return '';
        const exportData = buildExportData(template, data, customTournamentName, selectedTimeZonePreset) as MatchStatsData;
        return buildAutoEditorialContextLabel(applyMatchExportMode(exportData, 'result'));
    }, [customTournamentName, data, selectedTimeZonePreset, template]);
    const isEditorialGradientMode = template === 'matchStats' && matchExportLayout === 'editorial4x5';
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
    const isResultExport = template === 'matchStats' && (matchExportLayout === 'editorial4x5' || matchExportMode === 'result');
    const exportActionLabel = template === 'standings' && standingsSlides.length > 1
        ? `Exportar ${standingsSlides.length} imagenes`
        : 'Exportar imagen';
    const selectedFormatConfig = useMemo(
        () => FORMATS.find((item) => item.value === format) || FORMATS[0],
        [format]
    );
    const selectedPaletteName = useMemo(
        () => EXPORT_PALETTES.find((palette) => palette.id === selectedPaletteId)?.name || 'Custom',
        [selectedPaletteId]
    );
    const exportModalSubtitle = useMemo(() => {
        if (template === 'matchStats') {
            return `${getMatchExportModeLabel(matchExportMode)} · ${getMatchExportLayoutLabel(matchExportLayout)}`;
        }
        if (template === 'dailyMatches') return 'Agenda del dia · Seleccion multiple';
        if (template === 'standings') return standingsExportMode === 'groups' ? 'Tabla por grupos' : 'Tabla corrida';
        if (template === 'playoffBracket') return 'Cuadro eliminatorio';
        if (template === 'lineups') return `Alineaciones · ${getLineupExportModeLabel(lineupExportMode)}`;
        return 'Configuracion de exportacion';
    }, [lineupExportMode, matchExportLayout, matchExportMode, standingsExportMode, template]);
    const exportSummaryChips = useMemo(() => {
        const chips = [selectedFormatConfig.label];
        if (template === 'matchStats') {
            chips.push(getMatchExportLayoutLabel(matchExportLayout));
        } else if (template === 'standings') {
            chips.push(standingsExportMode === 'groups' ? 'Grupos' : 'Tabla');
        } else if (template === 'dailyMatches') {
            chips.push(`Partidos ${selectedMatchIndices.size}/10`);
        } else if (template === 'lineups') {
            chips.push(getLineupExportModeLabel(lineupExportMode));
        }
        chips.push(selectedPaletteName);

        const trimmedTournament = customTournamentName.trim();
        if (trimmedTournament) {
            chips.push(trimmedTournament.length > 22 ? `${trimmedTournament.slice(0, 22)}...` : trimmedTournament);
        }

        return chips.slice(0, 4);
    }, [
        customTournamentName,
        lineupExportMode,
        matchExportLayout,
        selectedFormatConfig.label,
        selectedMatchIndices.size,
        selectedPaletteName,
        standingsExportMode,
        template,
    ]);

    const toggleMatch = (index: number) => {
        setSelectedMatchIndices((previous) => {
            const next = new Set(previous);
            if (next.has(index)) next.delete(index);
            else if (next.size < 10) next.add(index);
            return next;
        });
    };

    const applyPalette = (palette: ExportPalette) => {
        setSelectedPaletteId(palette.id);
        setBgColor(palette.bg);
        setAccentColor(palette.accent);
        if (isEditorialGradientMode) {
            setEditorialGradientRightColor(palette.accent);
        }
    };

    const handleBgColorChange = (value: string) => {
        setSelectedPaletteId('custom');
        setBgColor(value);
    };

    const handleAccentColorChange = (value: string) => {
        setSelectedPaletteId('custom');
        setAccentColor(value);
    };

    const handleEditorialGradientLeftColorChange = (value: string) => {
        setSelectedPaletteId('custom');
        setEditorialGradientLeftColor(value);
    };

    const handleEditorialGradientRightColorChange = (value: string) => {
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
            await persistSavedEditorialPresets(nextPresets);
            setEditorialPresetName('');
            setStatus(`Preset "${name}" guardado`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Editorial preset save error:', error);
            setStatus('No se pudo guardar el preset. Reintenta en unos segundos.');
        }
    };

    const applySavedEditorialPreset = (preset: SavedMatchEditorialPreset) => {
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
            await persistSavedGradientPresets(nextPresets);
            setGradientPresetName('');
            setStatus(`Gradiente "${name}" guardado`);
            window.setTimeout(() => setStatus(''), 2200);
        } catch (error) {
            console.error('Gradient preset save error:', error);
            setStatus('No se pudo guardar el gradiente. Reintenta en unos segundos.');
        }
    };

    const applySavedGradientPreset = (preset: SavedMatchGradientPreset) => {
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

    const handleExport = async () => {
        setIsExporting(true);
        setStatus('Generando...');
        setShowModal(false);

        try {
            const resolvedFormat: ExportFormat = template === 'matchStats' && matchExportLayout === 'editorial4x5'
                ? '1080x1350'
                : format;
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
                    if (!backgroundImage) {
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
                } else {
                    await drawMatchResult(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo);
                }
            } else if (template === 'standings') {
                const standingsData = exportData as StandingsData;
                const slides = buildStandingsSlides(standingsData, standingsExportMode);
                if (slides.length === 0) throw new Error('No hay filas para exportar');

                for (const [index, slide] of slides.entries()) {
                    setStatus(slides.length > 1 ? `Generando ${index + 1}/${slides.length}...` : 'Generando...');
                    await drawStandings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    await downloadCanvas(canvas, buildExportFilename(filename, template, resolvedFormat, index + 1, slides.length));
                    if (index < slides.length - 1) {
                        await wait(140);
                    }
                }

                setStatus(slides.length > 1 ? `Listo (${slides.length} imagenes)` : 'Listo');
                window.setTimeout(() => setStatus(''), 2600);
                return;
            } else if (template === 'dailyMatches') {
                const matchesData = exportData as DailyMatchesData;
                const selectedMatches = matchesData.matches.filter((_, index) => selectedMatchIndices.has(index));
                await drawDailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo);
            } else if (template === 'lineups') {
                await drawLineups(ctx, canvas, exportData as LineupsData, config, accentColor, bgColor, brandLogo, lineupExportMode);
            } else if (template === 'playoffBracket') {
                await drawPlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, accentColor, bgColor, brandLogo);
            } else {
                await drawPlayerStats(ctx, canvas, exportData as PlayerStatsData, config, accentColor, bgColor, brandLogo);
            }

            await downloadCanvas(canvas, buildExportFilename(filename, template, resolvedFormat));
            setStatus('Listo');
            window.setTimeout(() => setStatus(''), 2000);
        } catch (error) {
            console.error('Export error:', error);
            setStatus(error instanceof Error ? error.message : 'Error al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    const dailyMatches = template === 'dailyMatches' ? (data as DailyMatchesData).matches : [];

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
            <button className={styles.exportButton} onClick={() => setShowModal(true)} disabled={isExporting} type="button">
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
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Formato</label>
                                <div className={styles.formatOptions}>
                                    {FORMATS.map((item) => (
                                        <button
                                            key={item.value}
                                            className={`${styles.formatBtn} ${format === item.value ? styles.active : ''}`}
                                            onClick={() => setFormat(item.value)}
                                            disabled={template === 'matchStats' && matchExportLayout === 'editorial4x5' && item.value !== '1080x1350'}
                                            type="button"
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                                {template === 'matchStats' && matchExportLayout === 'editorial4x5' && (
                                    <p className={styles.modalHint}>El layout editorial usa siempre canvas 1080x1350 para respetar la composicion 4:5.</p>
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

                            {template === 'matchStats' && matchExportLayout === 'classic' && (
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
                                                    {matchExportMode === 'schedule'
                                                        ? 'Muestra fecha y hora del partido'
                                                        : 'Muestra el marcador cargado'}
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

                            {(template === 'dailyMatches' || (template === 'matchStats' && matchExportLayout === 'classic')) && (
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
                                            <span className={styles.uploadTitle}>Subi la imagen principal del jugador</span>
                                            <span className={styles.uploadSubtitle}>
                                                Idealmente en 1080x1350 para mantener el encuadre y el aire del layout editorial.
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
                                        Esta variante exporta resultado, overlay inferior y logos mas separados. La foto se usa full-bleed como fondo.
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
                                        <label className={styles.modalLabel}>Logo central de competencia</label>
                                        <div className={styles.uploadCard}>
                                            <div className={styles.uploadMeta}>
                                                <span className={styles.uploadTitle}>Logo entre los dos scores</span>
                                                <span className={styles.uploadSubtitle}>
                                                    Si no subis nada, se usa el logo del torneo cargado en el partido. Solo hace override cuando queres cambiarlo.
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
                                    <div style={{ marginTop: 16 }}>
                                        <label className={styles.modalLabel}>Texto central</label>
                                        <input
                                            className={styles.modalInput}
                                            value={editorialContextLabel}
                                            onChange={(event) => setEditorialContextLabel(event.target.value)}
                                            placeholder={editorialAutoContextLabel || 'Ej: Final - Fecha 3'}
                                        />
                                        <p className={styles.modalHint}>
                                            Si lo dejas vacio, se usa el texto automatico del partido. Aca puedes reemplazar la fecha/hora por cualquier copy editorial.
                                        </p>
                                    </div>
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
                                                    <span className={styles.presetLibraryMeta}>Se guardan en este navegador</span>
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
                                                                <button
                                                                    key={preset.id}
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
                                                    <button
                                                        key={preset.id}
                                                        className={styles.compactPresetBtn}
                                                        onClick={() => applySavedEditorialPreset(preset)}
                                                        type="button"
                                                        title={`Aplicar ${preset.name}`}
                                                    >
                                                        {preset.name}
                                                    </button>
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

                            {template === 'standings' && (
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
                                            <button
                                                className={`${styles.formatBtn} ${standingsExportMode === 'groups' ? styles.active : ''}`}
                                                onClick={() => setStandingsExportMode('groups')}
                                                type="button"
                                            >
                                                Dividir por grupos
                                            </button>
                                        )}
                                    </div>
                                    <p className={styles.modalHint}>
                                        Maximo 20 equipos por imagen.
                                        {standingsExportMode === 'groups' && groupedStandings.length > 0
                                            ? ' Los grupos se mantienen separados y continuan en otra imagen cuando hace falta.'
                                            : ' Si la tabla supera el limite, se reparte automaticamente en varias imagenes.'}
                                    </p>
                                    <div className={styles.timeZoneSummary}>
                                        <span className={styles.timeZoneSummaryLabel}>Descarga estimada</span>
                                        <strong>{standingsSlides.length || 1} imagen{(standingsSlides.length || 1) === 1 ? '' : 'es'}</strong>
                                    </div>
                                </div>
                            )}

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
                                                style={{ background: `linear-gradient(135deg, ${palette.bg} 0%, ${palette.bg} 62%, ${palette.accent} 62%, ${palette.accent} 100%)` }}
                                            />
                                            <div className={styles.paletteMeta}>
                                                <span className={styles.paletteName}>{palette.name}</span>
                                                <span className={styles.paletteDesc}>{palette.description}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.modalHint}>La marca de agua G22 se mantiene en todas las exportaciones.</p>
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
                                {!isEditorialGradientMode && (
                                    <div className={styles.presetLibraryCard}>
                                        <div className={styles.presetLibrarySection}>
                                            <div className={styles.presetLibraryHeader}>
                                                <span className={styles.presetLibraryTitle}>Tus gradientes</span>
                                                <span className={styles.presetLibraryMeta}>Se guardan en este navegador</span>
                                            </div>
                                            <div className={styles.gradientUploadRow}>
                                                <input
                                                    className={styles.textInput}
                                                    value={gradientPresetName}
                                                    onChange={(event) => setGradientPresetName(event.target.value)}
                                                    placeholder="Ej: Verde noche"
                                                />
                                                <button className={styles.secondaryBtn} onClick={handleSaveGradientPreset} type="button">
                                                    Guardar gradiente
                                                </button>
                                            </div>
                                            {savedColorGradientPresets.length > 0 ? (
                                                <div className={styles.gradientPresetGrid}>
                                                    {savedColorGradientPresets.map((preset) => {
                                                        const isActive = bgColor === preset.gradientLeftColor
                                                            && accentColor === preset.gradientRightColor;
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
                                            ) : (
                                                <div className={styles.emptyPresetState}>
                                                    Todavia no guardaste gradientes personalizados para esta paleta.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
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
                                        || (template === 'matchStats' && matchExportLayout === 'editorial4x5' && !matchBackgroundUpload)
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
        </div>
    );
}

function getDefaultTournamentName(template: ExportTemplate, data: ExportData): string {
    if (template === 'standings') return (data as StandingsData).title || '';
    if (template === 'playoffBracket') return (data as PlayoffBracketData).title || '';
    if (template === 'dailyMatches' || template === 'matchStats' || template === 'lineups') return (data as DailyMatchesData | MatchStatsData | LineupsData).tournament || '';
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

function buildPresetId(prefix: 'editorial' | 'gradient'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePresetName(name: string): string {
    return name.trim().toLocaleLowerCase('es-AR');
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

async function readSavedEditorialPresets(): Promise<SavedMatchEditorialPreset[]> {
    return readPersistedCollection(
        EXPORT_STORAGE_EDITORIAL_PRESETS_KEY,
        EDITORIAL_PRESET_STORAGE_KEY,
        normalizeSavedEditorialPresets,
    );
}

async function readSavedGradientPresets(): Promise<SavedMatchGradientPreset[]> {
    return readPersistedCollection(
        EXPORT_STORAGE_EDITORIAL_GRADIENTS_KEY,
        EDITORIAL_GRADIENT_PRESET_STORAGE_KEY,
        normalizeSavedGradientPresets,
    );
}

async function persistSavedEditorialPresets(presets: SavedMatchEditorialPreset[]): Promise<void> {
    await persistCollection(
        EXPORT_STORAGE_EDITORIAL_PRESETS_KEY,
        EDITORIAL_PRESET_STORAGE_KEY,
        presets,
    );
}

async function persistSavedGradientPresets(presets: SavedMatchGradientPreset[]): Promise<void> {
    await persistCollection(
        EXPORT_STORAGE_EDITORIAL_GRADIENTS_KEY,
        EDITORIAL_GRADIENT_PRESET_STORAGE_KEY,
        presets,
    );
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

function buildStandingsSlides(data: StandingsData, mode: StandingsExportMode): StandingsSlideData[] {
    if (mode === 'groups') {
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
                    if (currentRowCount >= MAX_STANDINGS_ROWS_PER_SLIDE) {
                        pushCurrentSlide();
                    }

                    let availableRows = MAX_STANDINGS_ROWS_PER_SLIDE - currentRowCount;
                    const remainingRows = group.rows.length - offset;

                    if (currentRowCount > 0 && remainingRows <= MAX_STANDINGS_ROWS_PER_SLIDE && remainingRows > availableRows) {
                        pushCurrentSlide();
                        availableRows = MAX_STANDINGS_ROWS_PER_SLIDE;
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
    for (let index = 0; index < rows.length; index += MAX_STANDINGS_ROWS_PER_SLIDE) {
        const chunk = rows.slice(index, index + MAX_STANDINGS_ROWS_PER_SLIDE);
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

    if (template === 'lineups') {
        const lineupsData = data as LineupsData;
        return {
            ...lineupsData,
            tournament: tournamentName || lineupsData.tournament,
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

async function ensureExportFonts(): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
        await loadLocalExportFonts();
        await Promise.allSettled([
            document.fonts.load('900 24px "dharma-gothic-e"'),
            document.fonts.load('800 24px "dharma-gothic-e"'),
            document.fonts.load('900 24px "dharma-gothic-c"'),
            document.fonts.load('900 24px "dharma-gothic-m"'),
            document.fonts.load('800 24px "G22 Dharma Gothic"'),
            document.fonts.load('800 24px "Dharma Gothic Expanded Heavy"'),
            document.fonts.load('800 24px "Dharma Gothic E Heavy"'),
            document.fonts.load('700 24px "Dharma Gothic Expanded"'),
            document.fonts.load('700 24px "Dharma Gothic E"'),
            document.fonts.load(`700 24px ${FONT_BODY}`),
            document.fonts.load(`900 24px ${FONT_OUTFIT_BLACK}`),
            document.fonts.load('700 24px Inter'),
            document.fonts.load('700 24px "Bebas Neue"'),
            document.fonts.load(`700 24px ${FONT_MONO}`),
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

function buildProxyUrl(url: string): string {
    return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&w=400&h=400&fit=contain&output=png`;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
    if (!isImageSource(url)) return null;
    const normalized = normalizeImageSource(url);
    const sameOrigin = typeof window !== 'undefined' && normalized.startsWith(window.location.origin);
    const sources = normalized.startsWith('http') && !sameOrigin ? [buildProxyUrl(normalized), normalized] : [normalized];
    return new Promise((resolve) => {
        const tryLoad = (index: number) => {
            if (index >= sources.length) {
                resolve(null);
                return;
            }
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.referrerPolicy = 'no-referrer';
            image.onload = () => resolve(image);
            image.onerror = () => tryLoad(index + 1);
            image.src = sources[index];
        };
        tryLoad(0);
    });
}

function getContrastColor(hex: string) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#0f172a';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#0f172a' : '#ffffff';
}

function hexToRGBA(hex: string, alpha: number) {
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

function getSafeArea(canvas: HTMLCanvasElement): SafeArea {
    const isStory = canvas.height > 1500;
    return { top: isStory ? 320 : 220, bottom: canvas.height - (isStory ? 220 : 150), centerX: canvas.width / 2, width: canvas.width, height: canvas.height };
}

function getTextColor(isDark: boolean) {
    return isDark ? '#f2f2f2' : '#0f172a';
}

function getMutedColor(isDark: boolean, alpha: number) {
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
    let currentSize = size;
    while (currentSize > minSize) {
        ctx.font = `${weight} ${currentSize}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        currentSize -= 2;
    }
    return currentSize;
}

function getCenteredTextBaseline(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerY: number,
    fallbackFontSize: number
) {
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || fallbackFontSize * 0.72;
    const descent = metrics.actualBoundingBoxDescent || fallbackFontSize * 0.18;
    return centerY + (ascent - descent) / 2;
}

function truncateTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;

    let current = text.trim();
    while (current.length > 1 && ctx.measureText(`${current}...`).width > maxWidth) {
        current = current.slice(0, -1).trimEnd();
    }

    return current.length > 1 ? `${current}...` : text;
}

function getSharedFittedFontSize(
    ctx: CanvasRenderingContext2D,
    items: Array<{ text: string; maxWidth: number }>,
    weight: string,
    size: number,
    family: string,
    minSize: number
) {
    let currentSize = size;

    while (currentSize > minSize) {
        ctx.font = `${weight} ${currentSize}px ${family}`;
        const fitsAll = items.every((item) => ctx.measureText(item.text).width <= item.maxWidth);
        if (fitsAll) break;
        currentSize -= 1;
    }

    return currentSize;
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

function drawBackdrop(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, bgColor: string, accentColor: string, isDark: boolean) {
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

function drawSurfacePanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, isDark: boolean) {
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

function drawLogoBadge(ctx: CanvasRenderingContext2D, options: LogoBadgeOptions) {
    const { x, y, size, img, label, rawLogo, isDark } = options;
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)';
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (img) {
        const inset = Math.max(4, size * 0.13);
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x - size / 2 + inset, y - size / 2 + inset, size - inset * 2, size - inset * 2);
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
    const { x, y, width, height, img, label, rawLogo, isDark } = options;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (img) {
        const sourceWidth = img.naturalWidth || img.width || width;
        const sourceHeight = img.naturalHeight || img.height || height;
        const scale = Math.min(width / sourceWidth, height / sourceHeight) * 0.88;
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;

        ctx.shadowColor = isDark ? 'rgba(0,0,0,0.32)' : 'rgba(15,23,42,0.18)';
        ctx.shadowBlur = Math.max(8, Math.round(Math.max(width, height) * 0.12));
        ctx.shadowOffsetY = Math.max(2, Math.round(height * 0.06));
        ctx.drawImage(img, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
        return;
    }

    const fallbackRadius = Math.min(width, height) * 0.34;
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, fallbackRadius);
    ctx.fill();
    ctx.stroke();

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

    const sourceWidth = img.naturalWidth || img.width || width;
    const sourceHeight = img.naturalHeight || img.height || height;
    const scale = Math.min(width / sourceWidth, height / sourceHeight) * 0.88;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
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

    const originX = x - drawWidth / 2 - strokeWidth;
    const originY = y - drawHeight / 2 - strokeWidth;
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

function drawCenteredPill(
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
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(centerX - width / 2, y, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, y + height / 2 + 1);
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
    fontSize: number
) {
    if (!label && !logoImg) return;
    const logoSize = logoImg ? fontSize + 12 : 0;
    const gap = logoImg ? 12 : 0;
    ctx.save();
    ctx.font = `700 ${fontSize}px ${FONT_BODY}`;
    const labelText = label ? label.toUpperCase() : '';
    const labelWidth = labelText ? ctx.measureText(labelText).width : 0;
    const totalWidth = logoSize + gap + labelWidth;
    let currentX = canvas.width / 2 - totalWidth / 2;
    if (logoImg) {
        drawLogoBadge(ctx, { x: currentX + logoSize / 2, y: y - 4, size: logoSize, img: logoImg, label: label || 'Torneo', rawLogo, isDark });
        currentX += logoSize + gap;
    }
    if (labelText) {
        ctx.fillStyle = accentColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(labelText, currentX, y);
    }
    ctx.restore();
}

function drawBrandFooter(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, brandLogo: HTMLImageElement | null, isDark: boolean) {
    const isStory = canvas.height > 1500;
    const labelY = canvas.height - (isStory ? 126 : 108);
    const wordmarkY = labelY + (isStory ? 48 : 42);
    const iconSize = isStory ? 40 : 34;
    const gap = 12;
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
                const sourceWidth = img.naturalWidth || img.width || slotWidth;
                const sourceHeight = img.naturalHeight || img.height || logoHeight;
                const scale = Math.min(slotWidth / Math.max(sourceWidth, 1), logoHeight / Math.max(sourceHeight, 1));
                const drawWidth = sourceWidth * scale;
                const drawHeight = sourceHeight * scale;

                ctx.save();
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.globalAlpha = 1;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
                ctx.shadowBlur = 16;
                ctx.shadowOffsetY = 6;
                ctx.drawImage(img, drawX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
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
        loadImage(data.tournamentLogo || ''),
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
    const teamLogoY = topRuleY - editorialPreset.logoOffsetY;
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

    drawEditorialCrestStroke(ctx, leftColumnX, teamLogoY, editorialPreset.logoWidth, editorialPreset.logoHeight, homeLogo, 5);
    drawOverflowCrest(ctx, {
        x: leftColumnX,
        y: teamLogoY,
        width: editorialPreset.logoWidth,
        height: editorialPreset.logoHeight,
        img: homeLogo,
        label: data.homeTeam,
        rawLogo: data.homeLogo,
        isDark: true,
    });
    drawEditorialCrestStroke(ctx, rightColumnX, teamLogoY, editorialPreset.logoWidth, editorialPreset.logoHeight, awayLogo, 5);
    drawOverflowCrest(ctx, {
        x: rightColumnX,
        y: teamLogoY,
        width: editorialPreset.logoWidth,
        height: editorialPreset.logoHeight,
        img: awayLogo,
        label: data.awayTeam,
        rawLogo: data.awayLogo,
        isDark: true,
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

async function drawMatchResult(
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
    const [homeLogo, awayLogo, tournamentLogo] = await Promise.all([
        loadImage(data.homeLogo || ''),
        loadImage(data.awayLogo || ''),
        loadImage(data.tournamentLogo || ''),
    ]);

    drawBackdrop(ctx, canvas, bgColor, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        isStory ? 72 : 54,
        (data.mainTitle || getStatusLabel(data.status)).toUpperCase(),
        accentColor,
        getContrastColor(accentColor),
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        26,
        isStory ? 48 : 42
    );
    drawTournamentRibbon(ctx, canvas, data.tournament, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 164 : 136, isStory ? 26 : 22);

    const metaLine = [data.date, data.time, data.venue].filter(Boolean).join('  /  ');
    if (metaLine) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
        ctx.fillText(metaLine, safe.centerX, isStory ? 210 : 178);
        ctx.restore();
    }

    const panelX = isStory ? 64 : 72;
    const panelY = isStory ? 250 : 222;
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 24 : 12);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    const statusColor = getStatusColor(data.status, accentColor, isDark);
    drawCenteredPill(
        ctx,
        safe.centerX,
        panelY + 28,
        getStatusLabel(data.status),
        hexToRGBA(statusColor, isDark ? 0.2 : 0.14),
        statusColor,
        `800 ${isStory ? 18 : 16}px ${FONT_BODY}`,
        22,
        isStory ? 40 : 36
    );

    const teamLogoSize = isStory ? 154 : 132;
    const scoreY = panelY + (isStory ? 206 : 188);
    const leftX = panelX + panelWidth * 0.22;
    const rightX = panelX + panelWidth * 0.78;
    const nameY = scoreY + (isStory ? 122 : 106);

    drawLogoBadge(ctx, { x: leftX, y: scoreY, size: teamLogoSize, img: homeLogo, label: data.homeTeam, rawLogo: data.homeLogo, isDark });
    drawLogoBadge(ctx, { x: rightX, y: scoreY, size: teamLogoSize, img: awayLogo, label: data.awayTeam, rawLogo: data.awayLogo, isDark });
    const matchResultNameFontSize = getSharedFittedFontSize(
        ctx,
        [
            { text: data.homeTeam.trim().toUpperCase(), maxWidth: panelWidth * 0.28 },
            { text: data.awayTeam.trim().toUpperCase(), maxWidth: panelWidth * 0.28 },
        ],
        '800',
        isStory ? 38 : 32,
        FONT_DISPLAY,
        8,
    );

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = textColor;
    ctx.font = `800 ${matchResultNameFontSize}px ${FONT_DISPLAY}`;
    ctx.fillText(data.homeTeam.toUpperCase(), leftX, nameY);
    ctx.fillText(data.awayTeam.toUpperCase(), rightX, nameY);

    ctx.fillStyle = mutedColor;
    ctx.font = `700 ${isStory ? 16 : 14}px ${FONT_BODY}`;
    ctx.fillText('LOCAL', leftX, nameY + (isStory ? 34 : 28));
    ctx.fillText('VISITANTE', rightX, nameY + (isStory ? 34 : 28));

    if (isScheduled) {
        ctx.fillStyle = accentColor;
        ctx.font = `800 ${isStory ? 42 : 36}px ${FONT_DISPLAY}`;
        ctx.fillText((data.date || 'Fecha por confirmar').toUpperCase(), safe.centerX, scoreY - (isStory ? 2 : 4));
        ctx.fillStyle = textColor;
        ctx.font = `800 ${isStory ? 62 : 52}px ${FONT_MONO}`;
        ctx.fillText(data.time || '--:--', safe.centerX, scoreY + (isStory ? 56 : 50));
        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 18 : 16}px ${FONT_BODY}`;
        ctx.fillText('HORARIO DEL PARTIDO', safe.centerX, scoreY + (isStory ? 92 : 82));
    } else {
        const classicScoreFontSize = isStory ? 168 : 148;
        const classicScoreOffsetX = isStory ? 88 : 78;
        const classicScoreCenterY = scoreY;
        ctx.fillStyle = accentColor;
        ctx.font = `900 ${classicScoreFontSize}px ${FONT_CLASSIC_MATCH_SCORE}`;
        ctx.textBaseline = 'alphabetic';
        const homeScoreText = String(data.homeScore ?? '-');
        const awayScoreText = String(data.awayScore ?? '-');
        const scoreBaselineY = getCenteredTextBaseline(ctx, '88', classicScoreCenterY, classicScoreFontSize);
        ctx.fillText(homeScoreText, safe.centerX - classicScoreOffsetX, scoreBaselineY);
        ctx.fillText(awayScoreText, safe.centerX + classicScoreOffsetX, scoreBaselineY);
        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 52 : 44}px ${FONT_DISPLAY}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(':', safe.centerX, classicScoreCenterY);
    }
    ctx.restore();

    const stats = data.stats.slice(0, isStory ? 6 : 5);
    const statsTop = panelY + (isStory ? 404 : 354);
    const statsBottom = panelY + panelHeight - 34;

    ctx.save();
    ctx.strokeStyle = softColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 28, statsTop - 24);
    ctx.lineTo(panelX + panelWidth - 28, statsTop - 24);
    ctx.stroke();
    ctx.restore();

    if (stats.length === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${isStory ? 24 : 20}px ${FONT_BODY}`;
        ctx.fillText('No hay estadísticas disponibles para este partido.', safe.centerX, statsTop + 32);
        ctx.restore();
    } else {
        const rowHeight = Math.min(isStory ? 96 : 86, (statsBottom - statsTop) / stats.length);

        stats.forEach((stat, index) => {
            const y = statsTop + index * rowHeight;
            const barY = y + rowHeight - (isStory ? 26 : 24);
            const barWidth = panelWidth - 240;
            const barX = safe.centerX - barWidth / 2;
            const homeNumeric = Number(String(stat.home).replace(/[^\d.-]/g, ''));
            const awayNumeric = Number(String(stat.away).replace(/[^\d.-]/g, ''));
            const total = Number.isFinite(homeNumeric) && Number.isFinite(awayNumeric) ? Math.abs(homeNumeric) + Math.abs(awayNumeric) : 0;
            const homeRatio = total > 0 ? Math.abs(homeNumeric) / total : 0.5;
            const awayRatio = total > 0 ? Math.abs(awayNumeric) / total : 0.5;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = mutedColor;
            ctx.font = `700 ${isStory ? 18 : 16}px ${FONT_BODY}`;
            ctx.fillText(stat.label.toUpperCase(), safe.centerX, y + 18);

            ctx.fillStyle = textColor;
            ctx.font = `800 ${isStory ? 36 : 30}px ${FONT_MONO}`;
            ctx.fillText(String(stat.home), panelX + 122, y + 30);
            ctx.fillText(String(stat.away), panelX + panelWidth - 122, y + 30);

            ctx.fillStyle = softColor;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barWidth, isStory ? 12 : 10, 999);
            ctx.fill();

            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.roundRect(barX, barY, Math.max(28, barWidth * homeRatio), isStory ? 12 : 10, 999);
            ctx.fill();

            ctx.fillStyle = hexToRGBA(isDark ? '#ffffff' : '#0f172a', isDark ? 0.35 : 0.2);
            ctx.beginPath();
            ctx.roundRect(barX + barWidth * (1 - awayRatio), barY, Math.max(28, barWidth * awayRatio), isStory ? 12 : 10, 999);
            ctx.fill();
            ctx.restore();
        });
    }

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
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
        loadImage(data.tournamentLogo || ''),
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
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        24,
        isStory ? 48 : 42
    );
    drawTournamentRibbon(ctx, canvas, data.title, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 166 : 138, isStory ? 26 : 22);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
    ctx.fillText(subtitleText, safe.centerX, isStory ? 208 : 178);
    ctx.restore();

    const panelX = isStory ? 46 : 54;
    const panelY = isStory ? 252 : (isDenseStandingsSlide ? 216 : 224);
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
    const rowHeight = Math.max(isStory ? (isDenseStandingsSlide ? 30 : 32) : (isDenseStandingsSlide ? 26 : 30), Math.min(isStory ? 70 : 62, rawRowHeight));
    const crestHeight = Math.min(isStory ? 50 : 44, Math.max(isStory ? (isDenseStandingsSlide ? 34 : 38) : (isDenseStandingsSlide ? 28 : 34), rowHeight - 4));
    const crestWidth = Math.min(isStory ? 46 : 40, crestHeight * 0.9);
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
async function drawDailyMatches(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: DailyMatchesData,
    format: CanvasFormat,
    accentColor: string,
    bgColor: string,
    brandLogo: HTMLImageElement | null
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
        loadImage(data.tournamentLogo || ''),
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
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        26,
        isStory ? 48 : 42
    );
    drawTournamentRibbon(ctx, canvas, data.tournament, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 166 : 138, isStory ? 26 : 22);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
    ctx.fillText(data.date, safe.centerX, isStory ? 208 : 178);
    ctx.restore();

    const panelX = isStory ? 46 : 54;
    const panelY = isStory ? 248 : 220;
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 18 : 10);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    const listTop = panelY + 28;
    const listBottom = panelY + panelHeight - 20;
    const rowGap = isStory ? 16 : 14;
    const rowHeight = Math.min(
        isStory ? 132 : 118,
        (listBottom - listTop - rowGap * Math.max(matches.length - 1, 0)) / Math.max(matches.length, 1)
    );
    const crestHeight = Math.min(isStory ? 88 : 74, rowHeight - 8);
    const crestWidth = Math.min(isStory ? 78 : 64, crestHeight * 0.86);
    const crestInset = isStory ? 18 : 14;
    const cardWidth = panelWidth - 36;
    const homeTextWidth = Math.max(110, safe.centerX - 118 - (panelX + 18 + crestInset + crestWidth + 18));
    const awayTextWidth = Math.max(110, (panelX + 18 + cardWidth - crestInset - crestWidth - 18) - (safe.centerX + 118));
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
        const cardX = panelX + 18;
        const cardRight = cardX + cardWidth;
        const logoOffset = 1 + index * 2;
        const homeLogo = logoLoads[logoOffset] || null;
        const awayLogo = logoLoads[logoOffset + 1] || null;
        const centerText = match.status === 'scheduled'
            ? match.time
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
        ctx.font = `800 ${isStory ? 44 : 38}px ${match.status === 'scheduled' ? FONT_DISPLAY : FONT_MONO}`;
        ctx.fillText(centerText, safe.centerX, y + rowHeight / 2 + 4);

        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 16 : 14}px ${FONT_BODY}`;
        ctx.fillText(
            match.status === 'scheduled' ? 'HORARIO' : match.status === 'live' ? 'EN JUEGO' : 'MARCADOR FINAL',
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
    const isSingleTeam = selectedTeams.length === 1;
    const totalPlayers = selectedTeams.reduce((sum, team) => sum + team.starters.length, 0);
    const [tournamentLogo, homeLogo, awayLogo] = await Promise.all([
        loadImage(data.tournamentLogo || ''),
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
    const contentHeight = panelHeight - 36;
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
        const starters = players.filter((player, playerIndex) => isLineupStarter(player, playerIndex));
        const finishers = players.filter((player, playerIndex) => !isLineupStarter(player, playerIndex));
        const startersCount = starters.length;
        const finishersCount = finishers.length;
        const listTop = contentY + headerHeight + 16;
        const finishersLabelHeight = finishersCount > 0 ? (isSingleTeam ? 28 : 24) : 0;
        const starterGap = isSingleTeam ? 7 : 6;
        const finisherGap = isSingleTeam ? 6 : 5;
        const finishersTopPadding = finishersCount > 0 ? 18 : 0;
        const availableHeight = contentHeight - headerHeight - 16 - finishersLabelHeight - finishersTopPadding;
        const starterWeight = startersCount > 0 ? startersCount : 0;
        const finisherWeight = finishersCount > 0 ? finishersCount * 0.68 : 0;
        const weightTotal = Math.max(1, starterWeight + finisherWeight);
        const starterRowHeight = startersCount > 0
            ? Math.max(
                isSingleTeam ? 26 : 24,
                Math.min(
                    isSingleTeam ? 36 : 34,
                    (availableHeight * (starterWeight / weightTotal) - starterGap * Math.max(startersCount - 1, 0)) / startersCount,
                ),
            )
            : 0;
        const finisherRowHeight = finishersCount > 0
            ? Math.max(
                isSingleTeam ? 18 : 17,
                Math.min(
                    isSingleTeam ? 25 : 23,
                    (availableHeight * (finisherWeight / weightTotal) - finisherGap * Math.max(finishersCount - 1, 0)) / finishersCount,
                ),
            )
            : 0;
        const starterRowRadius = Math.max(12, Math.round(starterRowHeight * 0.42));
        const finisherRowRadius = Math.max(10, Math.round(finisherRowHeight * 0.42));
        const rowInset = isSingleTeam ? 16 : 12;
        const numberWidth = isSingleTeam ? 60 : 48;
        const positionWidth = columnWidth > 360 ? 72 : 56;
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
            const positionLabel = String(player.position || '').trim().toUpperCase();
            const textX = columnX + rowInset + numberWidth + 16;
            const textWidth = Math.max(110, columnWidth - rowInset * 2 - numberWidth - positionWidth - 22);
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

            if (positionLabel) {
                ctx.textAlign = 'right';
                ctx.fillStyle = mutedColor;
                ctx.font = `700 ${isSingleTeam ? 10 : 9}px ${FONT_BODY}`;
                ctx.fillText(truncateTextToWidth(ctx, positionLabel, positionWidth), positionX, rowY + starterRowHeight / 2 + 1);
            }

            ctx.restore();
        });

        if (finishersCount > 0) {
            const finishersLabelY = listTop + startersCount * (starterRowHeight + starterGap) + 10;

            ctx.save();
            ctx.fillStyle = mutedColor;
            ctx.font = `800 ${isSingleTeam ? 13 : 11}px ${FONT_BODY}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('FINISHERS', columnX, finishersLabelY + finishersLabelHeight - 6);

            ctx.textAlign = 'right';
            ctx.fillStyle = accentColor;
            ctx.font = `800 ${isSingleTeam ? 13 : 11}px ${FONT_MONO}`;
            ctx.fillText(String(finishersCount).padStart(2, '0'), columnX + columnWidth, finishersLabelY + finishersLabelHeight - 6);
            ctx.restore();

            finishers.forEach((player, finisherIndex) => {
                const rowY = finishersLabelY + finishersLabelHeight + finishersTopPadding + finisherIndex * (finisherRowHeight + finisherGap);
                const rowNumber = player.number ?? startersCount + finisherIndex + 1;
                const playerName = `${player.name}${player.isCaptain ? ' (C)' : ''}`.trim().toUpperCase();
                const positionLabel = String(player.position || '').trim().toUpperCase();
                const textX = columnX + rowInset + numberWidth + 12;
                const textWidth = Math.max(96, columnWidth - rowInset * 2 - numberWidth - positionWidth - 18);
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

                if (positionLabel) {
                    ctx.textAlign = 'right';
                    ctx.fillStyle = mutedColor;
                    ctx.font = `700 ${isSingleTeam ? 9 : 8}px ${FONT_BODY}`;
                    ctx.fillText(truncateTextToWidth(ctx, positionLabel, positionWidth), positionX, rowY + finisherRowHeight / 2 + 1);
                }

                ctx.restore();
            });
        }
    });

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
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
        loadImage(data.tournamentLogo || ''),
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
    drawTournamentRibbon(ctx, canvas, data.title, tournamentLogo, data.tournamentLogo, accentColor, isDark, isStory ? 166 : 138, isStory ? 26 : 22);

    if (data.subtitle) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = mutedColor;
        ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
        ctx.fillText(data.subtitle, safe.centerX, isStory ? 208 : 178);
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
    const columnGap = isStory ? 14 : 12;
    const columnWidth = (panelWidth - 32 - columnGap * Math.max(rounds.length - 1, 0)) / rounds.length;
    const innerHeight = contentBottom - contentTop;
    let logoIndex = 1;

    rounds.forEach((round, roundIndex) => {
        const columnX = panelX + 16 + roundIndex * (columnWidth + columnGap);
        const roundMatches = round.matches;
        const titleHeight = isStory ? 34 : 30;
        const listTop = contentTop + titleHeight + 18;
        const listHeight = innerHeight - titleHeight - 18;
        const rowGap = isStory ? 16 : 12;
        const matchHeight = Math.min(
            isStory ? 124 : 112,
            (listHeight - rowGap * Math.max(roundMatches.length - 1, 0)) / Math.max(roundMatches.length, 1),
        );

        ctx.save();
        ctx.fillStyle = hexToRGBA(accentColor, isDark ? 0.14 : 0.09);
        ctx.beginPath();
        ctx.roundRect(columnX, contentTop, columnWidth, titleHeight, 999);
        ctx.fill();
        ctx.fillStyle = accentColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${isStory ? 16 : 14}px ${FONT_BODY}`;
        ctx.fillText(truncateTextToWidth(ctx, round.name.toUpperCase(), columnWidth - 26), columnX + columnWidth / 2, contentTop + titleHeight / 2 + 1);
        ctx.restore();

        roundMatches.forEach((match, matchIndex) => {
            const cardY = listTop + matchIndex * (matchHeight + rowGap);
            const cardHeight = matchHeight;
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
                    size: Math.max(22, Math.min(28, teamRowHeight - 10)),
                    img: logo,
                    label: name,
                    rawLogo,
                    isDark,
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
