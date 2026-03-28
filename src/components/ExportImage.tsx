'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './ExportButton.module.css';

export type ExportFormat = '1080x1350' | '1080x1920';
export type ExportTemplate = 'standings' | 'dailyMatches' | 'matchStats' | 'playerStats' | 'playoffBracket';
type ExportDateValue = string | number | Date;
type MatchExportMode = 'schedule' | 'result';
type StandingsExportMode = 'table' | 'groups';

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
    stats: Array<{ label: string; home: number | string; away: number | string }>;
}

interface PlayerStatsData {
    name: string;
    team: string;
    position: string;
    photo?: string;
    stats: Array<{ label: string; value: number | string; highlight?: boolean }>;
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

type ExportData = StandingsData | DailyMatchesData | MatchStatsData | PlayerStatsData | PlayoffBracketData;
type CanvasFormat = { width: number; height: number };
type SafeArea = { top: number; bottom: number; centerX: number; width: number; height: number };

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

const FORMATS: Array<{ value: ExportFormat; label: string; width: number; height: number }> = [
    { value: '1080x1350', label: 'Post (1080x1350)', width: 1080, height: 1350 },
    { value: '1080x1920', label: 'Story (1080x1920)', width: 1080, height: 1920 },
];

const FONT_DISPLAY = '"Outfit", "Inter", system-ui, sans-serif';
const FONT_BODY = '"Outfit", "Inter", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const BRAND_ACCENT = '#00a365';
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
const MAX_STANDINGS_ROWS_PER_SLIDE = 16;
const MATCH_EXPORT_MODE_OPTIONS: Array<{ value: MatchExportMode; label: string; description: string }> = [
    { value: 'schedule', label: 'Horario', description: 'Muestra la programacion del partido' },
    { value: 'result', label: 'Resultado', description: 'Muestra el marcador cargado' },
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

export default function ExportImage({ template, data, filename = 'g22-export', className = '' }: ExportImageProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('1080x1350');
    const [status, setStatus] = useState('');
    const defaultTournamentName = getDefaultTournamentName(template, data);
    const defaultMatchExportMode = getDefaultMatchExportMode(template, data);
    const [customTournamentName, setCustomTournamentName] = useState(defaultTournamentName);
    const [selectedTimeZoneId, setSelectedTimeZoneId] = useState(DEFAULT_TIMEZONE_PRESET_ID);
    const [isTimeZoneDropdownOpen, setIsTimeZoneDropdownOpen] = useState(false);
    const [matchExportMode, setMatchExportMode] = useState<MatchExportMode>(defaultMatchExportMode);
    const [isMatchModeDropdownOpen, setIsMatchModeDropdownOpen] = useState(false);
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
        }
    }, [showModal]);

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
    const exportActionLabel = template === 'standings' && standingsSlides.length > 1
        ? `Exportar ${standingsSlides.length} imagenes`
        : 'Exportar imagen';

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
    };

    const handleBgColorChange = (value: string) => {
        setSelectedPaletteId('custom');
        setBgColor(value);
    };

    const handleAccentColorChange = (value: string) => {
        setSelectedPaletteId('custom');
        setAccentColor(value);
    };

    const handleExport = async () => {
        setIsExporting(true);
        setStatus('Generando...');
        setShowModal(false);

        try {
            const config = FORMATS.find((item) => item.value === format)!;
            const [, brandLogo] = await Promise.all([ensureExportFonts(), loadImage('/icon.png')]);
            const canvas = document.createElement('canvas');
            canvas.width = config.width;
            canvas.height = config.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No se pudo inicializar el canvas');
            const exportData = buildExportData(template, data, customTournamentName, selectedTimeZonePreset);

            if (template === 'matchStats') {
                const matchData = applyMatchExportMode(exportData as MatchStatsData, matchExportMode);
                await drawMatchResult(ctx, canvas, matchData, config, accentColor, bgColor, brandLogo);
            } else if (template === 'standings') {
                const standingsData = exportData as StandingsData;
                const slides = buildStandingsSlides(standingsData, standingsExportMode);
                if (slides.length === 0) throw new Error('No hay filas para exportar');

                for (const [index, slide] of slides.entries()) {
                    setStatus(slides.length > 1 ? `Generando ${index + 1}/${slides.length}...` : 'Generando...');
                    await drawStandings(ctx, canvas, standingsData, slide, config, accentColor, bgColor, brandLogo);
                    await downloadCanvas(canvas, buildExportFilename(filename, template, format, index + 1, slides.length));
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
            } else if (template === 'playoffBracket') {
                await drawPlayoffBracket(ctx, canvas, exportData as PlayoffBracketData, config, accentColor, bgColor, brandLogo);
            } else {
                await drawPlayerStats(ctx, canvas, exportData as PlayerStatsData, config, accentColor, bgColor, brandLogo);
            }

            await downloadCanvas(canvas, buildExportFilename(filename, template, format));
            setStatus('Listo');
            window.setTimeout(() => setStatus(''), 2000);
        } catch (error) {
            console.error('Export error:', error);
            setStatus('Error al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    const dailyMatches = template === 'dailyMatches' ? (data as DailyMatchesData).matches : [];

    return (
        <div className={`${styles.container} ${className}`}>
            <button className={styles.exportButton} onClick={() => setShowModal(true)} disabled={isExporting} type="button">
                {isExporting ? 'Generando...' : 'Exportar'}
            </button>
            {status && <div className={styles.status}>{status}</div>}

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Exportar imagen</h3>
                            <p className={styles.modalHint}>El panel se adapta a tu pantalla y mantiene intacto el diseno de la imagen exportada.</p>
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
                                            type="button"
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

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

                            {template === 'matchStats' && (
                                <div className={styles.modalSection}>
                                    <label className={styles.modalLabel}>Modo del encabezado</label>
                                    <div className={styles.dropdown}>
                                        <button
                                            className={`${styles.dropdownTrigger} ${isMatchModeDropdownOpen ? styles.dropdownTriggerOpen : ''}`}
                                            onClick={() => {
                                                setIsMatchModeDropdownOpen((current) => !current);
                                                setIsTimeZoneDropdownOpen(false);
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

                            {(template === 'dailyMatches' || template === 'matchStats') && (
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
                                        Maximo 16 equipos por imagen.
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
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.cancelBtn} onClick={() => setShowModal(false)} type="button">
                                Cancelar
                            </button>
                            <button
                                className={styles.exportBtn}
                                onClick={handleExport}
                                disabled={template === 'dailyMatches' && selectedMatchIndices.size === 0}
                                type="button"
                            >
                                {exportActionLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function getDefaultTournamentName(template: ExportTemplate, data: ExportData): string {
    if (template === 'standings') return (data as StandingsData).title || '';
    if (template === 'playoffBracket') return (data as PlayoffBracketData).title || '';
    if (template === 'dailyMatches' || template === 'matchStats') return (data as DailyMatchesData | MatchStatsData).tournament || '';
    return '';
}

function getDefaultMatchExportMode(template: ExportTemplate, data: ExportData): MatchExportMode {
    if (template !== 'matchStats') return 'schedule';
    const matchData = data as MatchStatsData;
    return matchData.status === 'scheduled' ? 'schedule' : 'result';
}

function getMatchExportModeLabel(mode: MatchExportMode): string {
    return mode === 'schedule' ? 'Horario' : 'Resultado';
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

async function ensureExportFonts(): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
        await Promise.allSettled([
            document.fonts.load('700 24px Outfit'),
            document.fonts.load('700 24px Inter'),
            document.fonts.load('700 24px "JetBrains Mono"'),
            document.fonts.ready,
        ]);
    } catch {
        // Ignore font loading issues.
    }
}

function isImageSource(value?: string | null): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed.startsWith('<svg') || trimmed.startsWith('data:image/') || trimmed.startsWith('blob:') || trimmed.startsWith('/') || /^https?:\/\//.test(trimmed);
}

function normalizeImageSource(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
    if (trimmed.startsWith('/')) {
        try {
            return new URL(trimmed, window.location.origin).toString();
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

function truncateTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;

    let current = text.trim();
    while (current.length > 1 && ctx.measureText(`${current}...`).width > maxWidth) {
        current = current.slice(0, -1).trimEnd();
    }

    return current.length > 1 ? `${current}...` : text;
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

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = textColor;
    setFittedFont(ctx, data.homeTeam.toUpperCase(), panelWidth * 0.28, '800', isStory ? 38 : 32, FONT_DISPLAY, 20);
    ctx.fillText(data.homeTeam.toUpperCase(), leftX, nameY);
    setFittedFont(ctx, data.awayTeam.toUpperCase(), panelWidth * 0.28, '800', isStory ? 38 : 32, FONT_DISPLAY, 20);
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
        ctx.fillStyle = accentColor;
        ctx.font = `800 ${isStory ? 118 : 102}px ${FONT_MONO}`;
        ctx.fillText(String(data.homeScore ?? '-'), safe.centerX - (isStory ? 84 : 74), scoreY + (isStory ? 20 : 18));
        ctx.fillText(String(data.awayScore ?? '-'), safe.centerX + (isStory ? 84 : 74), scoreY + (isStory ? 20 : 18));
        ctx.fillStyle = mutedColor;
        ctx.font = `700 ${isStory ? 52 : 44}px ${FONT_DISPLAY}`;
        ctx.fillText(':', safe.centerX, scoreY + (isStory ? 10 : 8));
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
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.68);
    const softColor = getMutedColor(isDark, 0.1);
    const safe = getSafeArea(canvas);
    const isStory = format.height > format.width;
    const slideRows = slide.groups.flatMap((group) => group.rows);
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
    const panelY = isStory ? 252 : 224;
    const panelWidth = canvas.width - panelX * 2;
    const panelHeight = safe.bottom - panelY - (isStory ? 22 : 10);
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    const headerY = panelY + 34;
    ctx.save();
    ctx.fillStyle = mutedColor;
    ctx.font = `700 ${isStory ? 16 : 14}px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('POS', panelX + 58, headerY);
    ctx.textAlign = 'left';
    ctx.fillText('EQUIPO', panelX + 118, headerY);
    ctx.textAlign = 'center';
    ctx.fillText(playedLabel.toUpperCase(), panelX + panelWidth - 292, headerY);
    ctx.fillText(wonLabel.toUpperCase(), panelX + panelWidth - 226, headerY);
    ctx.fillText(lostLabel.toUpperCase(), panelX + panelWidth - 160, headerY);
    ctx.fillText(diffLabel.toUpperCase(), panelX + panelWidth - 94, headerY);
    ctx.fillText(pointsLabel.toUpperCase(), panelX + panelWidth - 38, headerY);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = softColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 24, headerY + 18);
    ctx.lineTo(panelX + panelWidth - 24, headerY + 18);
    ctx.stroke();
    ctx.restore();

    const bodyTop = headerY + 46;
    const bodyBottom = panelY + panelHeight - 24;
    const hasGroupHeaders = slide.groups.some((group) => group.name);
    const groupTitleHeight = hasGroupHeaders ? (isStory ? 34 : 30) : 0;
    const groupTitleGap = hasGroupHeaders ? (isStory ? 10 : 8) : 0;
    const interGroupGap = hasGroupHeaders ? (isStory ? 12 : 10) : 0;
    const reservedGroupSpace = slide.groups.reduce((total, group, index) => {
        if (!group.name) return total;
        return total + groupTitleHeight + groupTitleGap + (index > 0 ? interGroupGap : 0);
    }, 0);
    const rawRowHeight = (bodyBottom - bodyTop - reservedGroupSpace) / Math.max(slide.totalRows, 1);
    const rowHeight = Math.max(isStory ? 32 : 28, Math.min(isStory ? 68 : 60, rawRowHeight));
    const logoSize = Math.max(24, Math.min(isStory ? 42 : 38, rowHeight - (isStory ? 22 : 18)));
    const posFontSize = Math.max(18, Math.min(isStory ? 28 : 24, Math.round(rowHeight * 0.42)));
    const statFontSize = Math.max(14, Math.min(isStory ? 24 : 20, Math.round(rowHeight * 0.34)));
    const pointsFontSize = Math.max(18, Math.min(isStory ? 28 : 24, Math.round(rowHeight * 0.4)));
    const colPosX = panelX + 58;
    const colTeamX = panelX + 118;
    const colPlayedX = panelX + panelWidth - 292;
    const colWonX = panelX + panelWidth - 226;
    const colLostX = panelX + panelWidth - 160;
    const colDiffX = panelX + panelWidth - 94;
    const colPointsX = panelX + panelWidth - 38;
    const teamTextX = colTeamX + logoSize + 24;
    const teamMaxWidth = colPlayedX - teamTextX - 26;
    let logoIndex = 0;
    let rowIndex = 0;
    let cursorY = bodyTop;

    slide.groups.forEach((group, groupIndex) => {
        const groupLabel = formatStandingsGroupLabel(group);
        if (groupLabel) {
            if (groupIndex > 0) cursorY += interGroupGap;

            ctx.save();
            ctx.font = `800 ${isStory ? 18 : 16}px ${FONT_BODY}`;
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
            const rowBg = rowIndex % 2 === 0 ? hexToRGBA(accentColor, isDark ? 0.05 : 0.035) : 'transparent';
            const rowLabel = row.labelName?.trim() || '';
            const rowLabelColor = row.zoneColor || accentColor;

            ctx.save();
            if (rowBg !== 'transparent') {
                ctx.fillStyle = rowBg;
                ctx.beginPath();
                ctx.roundRect(panelX + 14, y + 2, panelWidth - 28, rowHeight - 4, 20);
                ctx.fill();
            }
            if (row.zoneColor) {
                ctx.fillStyle = row.zoneColor;
                ctx.beginPath();
                ctx.roundRect(panelX + 20, y + Math.max(6, rowHeight * 0.14), 6, Math.max(14, rowHeight - 16), 999);
                ctx.fill();
            }

            ctx.fillStyle = accentColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${posFontSize}px ${FONT_MONO}`;
            ctx.fillText(String(row.pos), colPosX, centerY + 1);

            drawLogoBadge(ctx, {
                x: colTeamX + logoSize / 2,
                y: centerY,
                size: logoSize,
                img: teamLogos[logoIndex] || null,
                label: row.team,
                rawLogo: row.teamLogo,
                isDark,
            });
            logoIndex += 1;

            ctx.textAlign = 'left';
            ctx.fillStyle = textColor;
            ctx.textBaseline = 'middle';
            const labelFontSize = Math.max(10, Math.min(14, Math.round(rowHeight * 0.24)));
            let labelWidth = 0;
            if (rowLabel) {
                ctx.font = `800 ${labelFontSize}px ${FONT_BODY}`;
                labelWidth = Math.min(Math.max(56, ctx.measureText(rowLabel.toUpperCase()).width + 22), Math.max(72, teamMaxWidth * 0.42));
            }
            const teamTextWidth = Math.max(64, teamMaxWidth - (rowLabel ? labelWidth + 12 : 0));
            setFittedFont(ctx, row.team.toUpperCase(), teamTextWidth, '800', Math.min(isStory ? 28 : 24, Math.round(rowHeight * 0.38)), FONT_DISPLAY, 14);
            ctx.fillText(row.team.toUpperCase(), teamTextX, centerY + 1);
            if (rowLabel) {
                const renderedTeamWidth = ctx.measureText(row.team.toUpperCase()).width;
                const labelX = Math.min(teamTextX + renderedTeamWidth + 12, colPlayedX - labelWidth - 12);
                drawStandingsLabelPill(ctx, labelX, centerY, rowLabel, rowLabelColor, isDark, rowHeight, labelWidth);
            }

            ctx.textAlign = 'center';
            ctx.font = `700 ${statFontSize}px ${FONT_BODY}`;
            ctx.fillText(String(row.played), colPlayedX, centerY + 1);
            ctx.fillText(String(row.won), colWonX, centerY + 1);
            ctx.fillText(String(row.lost), colLostX, centerY + 1);

            const diffText = data.plainDiff ? String(row.diff).trim() : formatDiff(row.diff);
            ctx.fillStyle = !data.plainDiff && diffText.startsWith('-') ? '#ef4444' : accentColor;
            ctx.font = `800 ${statFontSize}px ${FONT_MONO}`;
            ctx.fillText(diffText, colDiffX, centerY + 1);

            ctx.fillStyle = textColor;
            ctx.font = `800 ${pointsFontSize}px ${FONT_MONO}`;
            ctx.fillText(String(row.points), colPointsX, centerY + 1);
            ctx.restore();

            rowIndex += 1;
            cursorY += rowHeight;
        });
    });

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

    matches.forEach((match, index) => {
        const y = listTop + index * (rowHeight + rowGap);
        const cardX = panelX + 18;
        const cardWidth = panelWidth - 36;
        const logoOffset = 1 + index * 2;
        const homeLogo = logoLoads[logoOffset] || null;
        const awayLogo = logoLoads[logoOffset + 1] || null;
        const centerText = match.status === 'scheduled'
            ? match.time
            : `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`;
        const sideWidth = cardWidth * 0.34;

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
            ctx.fillText(match.dateLabel.toUpperCase(), cardX + cardWidth - 24, y + 36);
        }

        drawLogoBadge(ctx, { x: cardX + 52, y: y + rowHeight / 2 + 8, size: isStory ? 48 : 44, img: homeLogo, label: match.homeTeam, rawLogo: match.homeLogo, isDark });
        drawLogoBadge(ctx, { x: cardX + cardWidth - 52, y: y + rowHeight / 2 + 8, size: isStory ? 48 : 44, img: awayLogo, label: match.awayTeam, rawLogo: match.awayLogo, isDark });

        ctx.textBaseline = 'middle';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        setFittedFont(ctx, match.homeTeam.toUpperCase(), sideWidth - 92, '800', isStory ? 26 : 22, FONT_DISPLAY, 14);
        ctx.fillText(match.homeTeam.toUpperCase(), cardX + 84, y + rowHeight / 2 + 10);

        ctx.textAlign = 'right';
        setFittedFont(ctx, match.awayTeam.toUpperCase(), sideWidth - 92, '800', isStory ? 26 : 22, FONT_DISPLAY, 14);
        ctx.fillText(match.awayTeam.toUpperCase(), cardX + cardWidth - 84, y + rowHeight / 2 + 10);

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
