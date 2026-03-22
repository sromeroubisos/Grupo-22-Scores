'use client';

import { useState } from 'react';
import styles from './ExportButton.module.css';

export type ExportFormat = '1080x1350' | '1080x1920';
export type ExportTemplate = 'standings' | 'dailyMatches' | 'matchStats' | 'playerStats';

interface StandingsData {
    title: string;
    subtitle: string;
    tournamentLogo?: string;
    rows: Array<{
        pos: number;
        team: string;
        teamLogo?: string;
        zoneColor?: string;
        played: number;
        won: number;
        lost: number;
        diff: string;
        points: number;
    }>;
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
    stats: Array<{ label: string; home: number | string; away: number | string }>;
}

interface PlayerStatsData {
    name: string;
    team: string;
    position: string;
    photo?: string;
    stats: Array<{ label: string; value: number | string; highlight?: boolean }>;
}

type ExportData = StandingsData | DailyMatchesData | MatchStatsData | PlayerStatsData;
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

export default function ExportImage({ template, data, filename = 'g22-export', className = '' }: ExportImageProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('1080x1350');
    const [status, setStatus] = useState('');
    const [customTitle, setCustomTitle] = useState('');
    const [selectedPaletteId, setSelectedPaletteId] = useState(DEFAULT_PALETTE.id);
    const [accentColor, setAccentColor] = useState(DEFAULT_PALETTE.accent);
    const [bgColor, setBgColor] = useState(DEFAULT_PALETTE.bg);
    const [selectedMatchIndices, setSelectedMatchIndices] = useState<Set<number>>(() => {
        if (template !== 'dailyMatches') return new Set<number>();
        const matches = (data as DailyMatchesData).matches ?? [];
        return new Set(Array.from({ length: Math.min(matches.length, 10) }, (_, index) => index));
    });

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

            if (template === 'matchStats') {
                const matchData = data as MatchStatsData;
                const statusTitle = matchData.status === 'live' ? 'En Vivo' : matchData.status === 'final' ? 'Finalizado' : 'Programado';
                await drawMatchResult(ctx, canvas, { ...matchData, mainTitle: customTitle || matchData.mainTitle || statusTitle }, config, accentColor, bgColor, brandLogo);
            } else if (template === 'standings') {
                await drawStandings(ctx, canvas, data as StandingsData, config, accentColor, bgColor, brandLogo);
            } else if (template === 'dailyMatches') {
                const matchesData = data as DailyMatchesData;
                const selectedMatches = matchesData.matches.filter((_, index) => selectedMatchIndices.has(index));
                await drawDailyMatches(ctx, canvas, { ...matchesData, matches: selectedMatches }, config, accentColor, bgColor, brandLogo);
            } else {
                await drawPlayerStats(ctx, canvas, data as PlayerStatsData, config, accentColor, bgColor, brandLogo);
            }

            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${filename}-${template}-${format}.png`;
            link.href = dataUrl;
            link.click();
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
                        <h3 className={styles.modalTitle}>Exportar imagen</h3>

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

                        {template === 'matchStats' && (
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Titulo del encabezado</label>
                                <input
                                    className={styles.modalInput}
                                    value={customTitle}
                                    onChange={(event) => setCustomTitle(event.target.value)}
                                    placeholder="Ej: Finalizado, En Vivo..."
                                />
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
                                Exportar imagen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
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
    const visibleRows = data.rows.slice(0, isStory ? 14 : 11);
    const [tournamentLogo, ...teamLogos] = await Promise.all([
        loadImage(data.tournamentLogo || ''),
        ...visibleRows.map((row) => loadImage(row.teamLogo || '')),
    ]);

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
    ctx.fillText(data.subtitle, safe.centerX, isStory ? 208 : 178);
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
    ctx.fillText('PJ', panelX + panelWidth - 292, headerY);
    ctx.fillText('G', panelX + panelWidth - 226, headerY);
    ctx.fillText('P', panelX + panelWidth - 160, headerY);
    ctx.fillText('DIF', panelX + panelWidth - 94, headerY);
    ctx.fillText('PTS', panelX + panelWidth - 38, headerY);
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
    const rowHeight = Math.min(isStory ? 82 : 74, (bodyBottom - bodyTop) / Math.max(visibleRows.length, 1));

    visibleRows.forEach((row, index) => {
        const y = bodyTop + index * rowHeight;
        const centerY = y + rowHeight / 2;
        const rowBg = index % 2 === 0 ? hexToRGBA(accentColor, isDark ? 0.05 : 0.035) : 'transparent';

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
            ctx.roundRect(panelX + 20, y + 8, 6, rowHeight - 16, 999);
            ctx.fill();
        }

        ctx.fillStyle = accentColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${isStory ? 28 : 24}px ${FONT_MONO}`;
        ctx.fillText(String(row.pos), panelX + 58, centerY + 1);

        drawLogoBadge(ctx, {
            x: panelX + 118 + (isStory ? 26 : 24),
            y: centerY,
            size: isStory ? 42 : 38,
            img: teamLogos[index] || null,
            label: row.team,
            rawLogo: row.teamLogo,
            isDark,
        });

        ctx.textAlign = 'left';
        ctx.fillStyle = textColor;
        setFittedFont(ctx, row.team.toUpperCase(), panelWidth - 520, '800', isStory ? 28 : 24, FONT_DISPLAY, 16);
        ctx.fillText(row.team.toUpperCase(), panelX + 168, centerY + 1);

        ctx.textAlign = 'center';
        ctx.font = `700 ${isStory ? 24 : 20}px ${FONT_BODY}`;
        ctx.fillText(String(row.played), panelX + panelWidth - 292, centerY + 1);
        ctx.fillText(String(row.won), panelX + panelWidth - 226, centerY + 1);
        ctx.fillText(String(row.lost), panelX + panelWidth - 160, centerY + 1);

        const diffText = formatDiff(row.diff);
        ctx.fillStyle = diffText.startsWith('-') ? '#ef4444' : accentColor;
        ctx.font = `800 ${isStory ? 24 : 20}px ${FONT_MONO}`;
        ctx.fillText(diffText, panelX + panelWidth - 94, centerY + 1);

        ctx.fillStyle = textColor;
        ctx.font = `800 ${isStory ? 28 : 24}px ${FONT_MONO}`;
        ctx.fillText(String(row.points), panelX + panelWidth - 38, centerY + 1);
        ctx.restore();
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

        drawCenteredPill(
            ctx,
            cardX + 96,
            y + 18,
            getStatusLabel(match.status),
            hexToRGBA(getStatusColor(match.status, accentColor, isDark), isDark ? 0.18 : 0.12),
            getStatusColor(match.status, accentColor, isDark),
            `800 ${isStory ? 14 : 13}px ${FONT_BODY}`,
            14,
            30
        );

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
