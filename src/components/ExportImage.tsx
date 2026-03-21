'use client';

import { useState } from 'react';
import styles from './ExportButton.module.css';

// Types
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
    matches: Array<{
        homeTeam: string;
        awayTeam: string;
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
    homeScore: number;
    awayScore: number;
    homeLogo?: string;
    awayLogo?: string;
    tournament: string;
    date: string;
    time?: string;
    venue?: string;
    stats: Array<{
        label: string;
        home: number | string;
        away: number | string;
    }>;
}

interface PlayerStatsData {
    name: string;
    team: string;
    position: string;
    photo?: string;
    stats: Array<{
        label: string;
        value: number | string;
        highlight?: boolean;
    }>;
}

type ExportData = StandingsData | DailyMatchesData | MatchStatsData | PlayerStatsData;

interface ExportImageProps {
    template: ExportTemplate;
    data: ExportData;
    filename?: string;
    className?: string;
}

const FORMATS: { value: ExportFormat; label: string; width: number; height: number }[] = [
    { value: '1080x1350', label: 'Post (1080×1350)', width: 1080, height: 1350 },
    { value: '1080x1920', label: 'Story (1080×1920)', width: 1080, height: 1920 },
];

export default function ExportImage({
    template,
    data,
    filename = 'g22-export',
    className = '',
}: ExportImageProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('1080x1350');
    const [status, setStatus] = useState<string>('');
    const [customTitle, setCustomTitle] = useState<string>('');
    const [accentColor, setAccentColor] = useState<string>('#00a365');
    const [bgColor, setBgColor] = useState<string>('#ffffff');
    const [selectedMatchIndices, setSelectedMatchIndices] = useState<Set<number>>(() => {
        if (template === 'dailyMatches') {
            const matches = (data as DailyMatchesData).matches ?? [];
            return new Set(Array.from({ length: Math.min(matches.length, 10) }, (_, i) => i));
        }
        return new Set<number>();
    });

    const presets = [
        { name: 'Light Clean', bg: '#ffffff', accent: '#00a365' },
        { name: 'G22 Dark', bg: '#060608', accent: '#00a365' },
        { name: 'Rugby Navy', bg: '#0f172a', accent: '#38bdf8' },
        { name: 'UAR Orange', bg: '#111827', accent: '#f97316' },
        { name: 'Silver Sky', bg: '#f8fafc', accent: '#6366f1' },
    ];

    const toggleMatch = (i: number) => {
        setSelectedMatchIndices(prev => {
            const next = new Set(prev);
            if (next.has(i)) {
                next.delete(i);
            } else if (next.size < 10) {
                next.add(i);
            }
            return next;
        });
    };

    const handleExport = async () => {
        setIsExporting(true);
        setStatus('⏳ Generando...');
        setShowModal(false);

        try {
            const formatConfig = FORMATS.find(f => f.value === format)!;
            const canvas = document.createElement('canvas');
            canvas.width = formatConfig.width;
            canvas.height = formatConfig.height;
            const ctx = canvas.getContext('2d')!;

            if (template === 'matchStats') {
                const md = data as MatchStatsData;
                const statusTitle = md.status === 'live' ? 'En Vivo' : md.status === 'final' ? 'Finalizado' : 'Programado';
                const matchData = {
                    ...md,
                    mainTitle: customTitle || md.mainTitle || statusTitle
                };
                await drawMatchResult(ctx, canvas, matchData, formatConfig, accentColor, bgColor);
            } else if (template === 'standings') {
                await drawStandings(ctx, canvas, data as StandingsData, formatConfig, accentColor, bgColor);
            } else if (template === 'dailyMatches') {
                const dm = data as DailyMatchesData;
                const selectedMatches = dm.matches.filter((_, i) => selectedMatchIndices.has(i));
                await drawDailyMatches(ctx, canvas, { ...dm, matches: selectedMatches }, formatConfig, accentColor, bgColor);
            } else {
                drawPlayerStats(ctx, canvas, data as PlayerStatsData, formatConfig, accentColor, bgColor);
            }

            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${filename}-${template}-${format}.png`;
            link.href = dataUrl;
            link.click();

            setStatus('✅ ¡Listo!');
            setTimeout(() => setStatus(''), 2000);
        } catch (err) {
            console.error('Export error:', err);
            setStatus('❌ Error al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    const dailyMatches = template === 'dailyMatches' ? (data as DailyMatchesData).matches : [];

    return (
        <div className={`${styles.container} ${className}`}>
            <button className={styles.exportButton} onClick={() => setShowModal(true)} disabled={isExporting}>
                {isExporting ? '⏳ Generando...' : '📥 Exportar'}
            </button>
            {status && <div className={styles.status}>{status}</div>}

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>Exportar para Web</h3>

                        <div className={styles.modalSection}>
                            <label className={styles.modalLabel}>Formato</label>
                            <div className={styles.formatOptions}>
                                {FORMATS.map(f => (
                                    <button
                                        key={f.value}
                                        className={`${styles.formatBtn} ${format === f.value ? styles.active : ''}`}
                                        onClick={() => setFormat(f.value)}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {template === 'matchStats' && (
                            <div className={styles.modalSection}>
                                <label className={styles.modalLabel}>Título del Encabezado</label>
                                <input
                                    className={styles.modalInput}
                                    value={customTitle}
                                    onChange={e => setCustomTitle(e.target.value)}
                                    placeholder="Ej: Finalizado, Directo..."
                                />
                            </div>
                        )}

                        {template === 'dailyMatches' && dailyMatches.length > 0 && (
                            <div className={styles.modalSection}>
                                <div className={styles.matchSelectHeader}>
                                    <span className={styles.modalLabel}>Seleccionar Partidos</span>
                                    <span className={styles.matchCounter}>{selectedMatchIndices.size}/10</span>
                                </div>
                                <div className={styles.matchSelectList}>
                                    {dailyMatches.map((m, i) => {
                                        const isChecked = selectedMatchIndices.has(i);
                                        const isDisabled = !isChecked && selectedMatchIndices.size >= 10;
                                        return (
                                            <label
                                                key={i}
                                                className={`${styles.matchSelectRow} ${isDisabled ? styles.matchSelectDisabled : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={isDisabled}
                                                    onChange={() => toggleMatch(i)}
                                                />
                                                <span className={styles.matchSelectTeams}>
                                                    {m.homeTeam} vs {m.awayTeam}
                                                </span>
                                                {m.dateLabel && (
                                                    <span className={styles.matchSelectDate}>{m.dateLabel}</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className={styles.modalSection}>
                            <label className={styles.modalLabel}>Identidad Visual</label>
                            <div className={styles.presetGrid}>
                                {presets.map(p => (
                                    <button
                                        key={p.name}
                                        className={styles.presetBtn}
                                        style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.accent} 50%)` }}
                                        onClick={() => { setBgColor(p.bg); setAccentColor(p.accent); }}
                                        title={p.name}
                                    />
                                ))}
                            </div>
                            <div className={styles.customColors}>
                                <div className={styles.colorInp}>
                                    <span>Fondo Web</span>
                                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
                                </div>
                                <div className={styles.colorInp}>
                                    <span>Acento</span>
                                    <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
                            <button
                                className={styles.exportBtn}
                                onClick={handleExport}
                                disabled={template === 'dailyMatches' && selectedMatchIndices.size === 0}
                            >
                                📥 Exportar Imagen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ UTILS ============

async function loadImage(url: string): Promise<HTMLImageElement | null> {
    if (!url) return null;
    const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&w=400&h=400&fit=contain&output=png`;
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            const fb = new Image();
            fb.crossOrigin = 'anonymous';
            fb.onload = () => resolve(fb);
            fb.onerror = () => resolve(null);
            fb.src = url;
        };
        img.src = proxyUrl;
    });
}

function getContrastColor(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#0f172a' : '#ffffff';
}

function hexToRGBA(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSafeArea(canvas: HTMLCanvasElement) {
    const isStory = canvas.height > 1500;
    const top = isStory ? 380 : 250;
    return { top, centerX: canvas.width / 2, width: canvas.width, height: canvas.height };
}

function drawGeneralWatermark(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, textColor: string, accentColor: string, yPos: number) {
    ctx.textAlign = 'center';
    ctx.font = '900 44px Montserrat, sans-serif';
    ctx.fillStyle = textColor;
    ctx.fillText('G22', (canvas.width / 2) - 48, yPos);
    ctx.fillStyle = accentColor;
    ctx.fillText('Scores', (canvas.width / 2) + 62, yPos);
}

// ============ TEMPLATES ============

// Partido único — solo resultado (sin sección de estadísticas)
async function drawMatchResult(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: MatchStatsData,
    _config: any,
    accentColor: string,
    bgColor: string
) {
    const textColor = getContrastColor(bgColor);
    const isDark = textColor === '#ffffff';
    const safe = getSafeArea(canvas);
    const isStory = canvas.height > 1500;

    // 1. Background & Subtle Grid
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // 2. Main Title
    ctx.fillStyle = textColor;
    ctx.font = `950 ${isStory ? '135px' : '110px'} Montserrat, sans-serif`;
    ctx.textAlign = 'center';
    const title = data.mainTitle || 'Finalizado';
    ctx.fillText(title, safe.centerX, safe.top);

    // 3. Scoreboard Card
    const cardW = canvas.width * 0.92;
    const cardH = isStory ? 580 : 480;
    const cardX = (canvas.width - cardW) / 2;
    const cardY = safe.top + (isStory ? 100 : 80);

    ctx.save();
    if (!isDark) {
        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 60;
        ctx.shadowOffsetY = 20;
    }
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : '#ffffff';
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 50); ctx.fill();
    if (isDark) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke(); }
    ctx.restore();

    // Status badge inside card
    const statusLabel = data.status === 'live' ? 'EN VIVO' : data.status === 'final' ? 'FINALIZADO' : 'PROGRAMADO';
    ctx.font = '800 14px Montserrat, sans-serif';
    const statusMetrics = ctx.measureText(statusLabel);
    const badgeW = statusMetrics.width + 40;
    ctx.fillStyle = hexToRGBA(accentColor, 0.1);
    ctx.beginPath(); ctx.roundRect(safe.centerX - badgeW / 2, cardY + 30, badgeW, 36, 18); ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.fillText(statusLabel, safe.centerX, cardY + 53);

    const [hImg, aImg] = await Promise.all([loadImage(data.homeLogo || ''), loadImage(data.awayLogo || '')]);
    const teamY = cardY + (isStory ? 200 : 170);
    const homeX = cardX + cardW * 0.20;
    const awayX = cardX + cardW * 0.80;

    const drawUiLogo = (img: HTMLImageElement | null, x: number, y: number) => {
        const size = isStory ? 180 : 150;
        if (img) {
            ctx.save();
            ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.clip();
            ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.drawImage(img, x - size / 2 + 10, y - size / 2 + 10, size - 20, size - 20);
            ctx.restore();
        } else {
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';
            ctx.beginPath(); ctx.roundRect(x - size / 2, y - size / 2, size, size, 24); ctx.fill();
            ctx.fillStyle = isDark ? '#ffffff' : '#94a3b8';
            ctx.font = '50px Montserrat'; ctx.fillText('🛡️', x, y + 15);
        }
    };

    drawUiLogo(hImg, homeX, teamY);
    drawUiLogo(aImg, awayX, teamY);

    // Team labels & names
    ctx.font = '800 12px Montserrat, sans-serif';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : '#64748b';
    ctx.fillText('ANFITRIÓN', homeX, teamY + (isStory ? 125 : 105));
    ctx.fillText('VISITANTE', awayX, teamY + (isStory ? 125 : 105));

    ctx.font = `900 ${isStory ? '42px' : '36px'} Montserrat, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.fillText(data.homeTeam, homeX, teamY + (isStory ? 175 : 150), cardW * 0.35);
    ctx.fillText(data.awayTeam, awayX, teamY + (isStory ? 175 : 150), cardW * 0.35);

    // Score
    ctx.font = `950 ${isStory ? '160px' : '130px'} Montserrat, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.fillText(`${data.homeScore} : ${data.awayScore}`, safe.centerX, teamY + (isStory ? 80 : 65));

    // Footer badge: time | status
    const footerStatus = data.status === 'live' ? 'En Vivo' : data.status === 'final' ? 'Final' : 'Pendiente';
    const footerText = `${data.time || data.date}  |  ${footerStatus}`;
    ctx.font = '800 16px Montserrat, sans-serif';
    const footerMetrics = ctx.measureText(footerText);
    const footerBadgeW = footerMetrics.width + 48;
    const footerBadgeY = cardY + cardH - 60;
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
    ctx.beginPath(); ctx.roundRect(safe.centerX - footerBadgeW / 2, footerBadgeY - 20, footerBadgeW, 44, 12); ctx.fill();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : '#64748b';
    ctx.fillText(footerText, safe.centerX, footerBadgeY + 8);

    // Tournament name below card
    ctx.font = '700 22px Montserrat, sans-serif';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : '#64748b';
    ctx.fillText(data.tournament, safe.centerX, cardY + cardH + 60);

    // Watermark
    const wmY = cardY + cardH + (isStory ? 160 : 130);
    drawGeneralWatermark(ctx, canvas, textColor, accentColor, wmY);
}

// Tabla de posiciones — con logos de torneo y equipos
async function drawStandings(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: StandingsData,
    _cfg: any,
    accentColor: string,
    bgColor: string
) {
    const textColor = getContrastColor(bgColor);
    const isDark = textColor === '#ffffff';
    const safe = getSafeArea(canvas);
    const isStory = canvas.height > 1500;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }

    const visibleRows = data.rows.slice(0, 14);

    // Cargar logos en paralelo
    const [tournamentImg, ...teamImgs] = await Promise.all([
        loadImage(data.tournamentLogo || ''),
        ...visibleRows.map(r => loadImage(r.teamLogo || ''))
    ]);

    // Encabezado con logo del torneo
    const headerY = safe.top;
    if (tournamentImg) {
        const logoSize = isStory ? 90 : 72;
        const logoX = safe.centerX - logoSize / 2;
        const logoY = headerY - logoSize - (isStory ? 30 : 20);
        ctx.save();
        ctx.beginPath();
        ctx.arc(safe.centerX, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
        ctx.fill();
        ctx.drawImage(tournamentImg, logoX + 6, logoY + 6, logoSize - 12, logoSize - 12);
        ctx.restore();
    }

    ctx.fillStyle = textColor;
    ctx.font = `950 ${isStory ? '64px' : '54px'} Montserrat, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data.title.toUpperCase(), safe.centerX, headerY);

    ctx.fillStyle = accentColor;
    ctx.font = `800 ${isStory ? '28px' : '24px'} Montserrat, sans-serif`;
    ctx.fillText(data.subtitle.toUpperCase(), safe.centerX, headerY + (isStory ? 70 : 58));

    const tableTop = headerY + (isStory ? 180 : 150);
    const rowH = isStory ? 80 : 70;
    const tableW = canvas.width * 0.92;
    const startX = (canvas.width - tableW) / 2;
    const logoSize = isStory ? 46 : 40;

    visibleRows.forEach((r, i) => {
        const y = tableTop + i * rowH;

        // Fondo de fila
        ctx.fillStyle = i % 2 === 0 ? hexToRGBA(accentColor, 0.05) : 'transparent';
        ctx.beginPath(); ctx.roundRect(startX, y, tableW, rowH - 8, 14); ctx.fill();

        // Indicador de zona (borde izquierdo)
        if (r.zoneColor) {
            ctx.fillStyle = r.zoneColor;
            ctx.beginPath(); ctx.roundRect(startX, y, 5, rowH - 8, [14, 0, 0, 14]); ctx.fill();
        }

        // Posición
        ctx.fillStyle = textColor;
        ctx.font = `700 ${isStory ? '26px' : '22px'} Montserrat, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`${r.pos}.`, startX + (r.zoneColor ? 22 : 18), y + rowH / 2 + 9);

        // Logo del equipo
        const img = teamImgs[i];
        const logoX = startX + 80;
        const logoY = y + (rowH - logoSize) / 2;
        if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
            ctx.fill();
            ctx.drawImage(img, logoX + 3, logoY + 3, logoSize - 6, logoSize - 6);
            ctx.restore();
        } else {
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
            ctx.beginPath(); ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8';
            ctx.font = `600 ${isStory ? '16px' : '14px'} Montserrat, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(r.team.slice(0, 2).toUpperCase(), logoX + logoSize / 2, logoY + logoSize / 2 + 5);
        }

        // Nombre del equipo
        ctx.fillStyle = textColor;
        ctx.font = `800 ${isStory ? '26px' : '22px'} Montserrat, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(r.team, startX + 80 + logoSize + 16, y + rowH / 2 + 9, tableW * 0.5);

        // Puntos
        ctx.fillStyle = accentColor;
        ctx.font = `950 ${isStory ? '34px' : '30px'} Montserrat, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(String(r.points), startX + tableW - 20, y + rowH / 2 + 11);

        // Estadísticas secundarias: PJ / G / P / Dif
        const statsX = startX + tableW - 260;
        const secondaryItems = [
            { label: 'PJ', val: String(r.played) },
            { label: 'G', val: String(r.won) },
            { label: 'P', val: String(r.lost) },
            { label: 'Dif', val: r.diff },
        ];
        secondaryItems.forEach((s, si) => {
            const sx = statsX + si * 56;
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8';
            ctx.font = `600 ${isStory ? '12px' : '11px'} Montserrat, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(s.label, sx, y + rowH / 2 - 4);
            ctx.fillStyle = textColor;
            ctx.font = `700 ${isStory ? '16px' : '14px'} Montserrat, sans-serif`;
            ctx.fillText(s.val, sx, y + rowH / 2 + 14);
        });
    });

    drawGeneralWatermark(ctx, canvas, textColor, accentColor, canvas.height - 80);
}

function drawDailyMatches(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: DailyMatchesData, _cfg: any, accentColor: string, bgColor: string) {
    const textColor = getContrastColor(bgColor);
    const isDark = textColor === '#ffffff';
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const safe = getSafeArea(canvas);

    ctx.fillStyle = textColor; ctx.font = '950 72px Montserrat'; ctx.textAlign = 'center';
    ctx.fillText(data.date, safe.centerX, safe.top);
    ctx.fillStyle = accentColor; ctx.font = '800 28px Montserrat';
    ctx.fillText(data.tournament.toUpperCase(), safe.centerX, safe.top + 70);

    const matchTop = safe.top + 180;
    const rowH = 110;
    const rowW = canvas.width * 0.94;
    const startX = (canvas.width - rowW) / 2;

    data.matches.slice(0, 10).forEach((m, i) => {
        const y = matchTop + i * rowH;
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9';
        ctx.beginPath(); ctx.roundRect(startX, y, rowW, rowH - 15, 20); ctx.fill();

        ctx.fillStyle = textColor; ctx.font = 'bold 26px Montserrat, sans-serif';
        ctx.textAlign = 'right'; ctx.fillText(m.homeTeam, safe.centerX - 130, y + 60, 260);
        ctx.textAlign = 'left'; ctx.fillText(m.awayTeam, safe.centerX + 130, y + 60, 260);

        ctx.textAlign = 'center'; ctx.fillStyle = accentColor; ctx.font = '950 34px Montserrat';
        const txt = m.status === 'scheduled' ? m.time : `${m.homeScore} - ${m.awayScore}`;
        ctx.fillText(txt, safe.centerX, y + 60);
    });
    drawGeneralWatermark(ctx, canvas, textColor, accentColor, canvas.height - 100);
}

function drawPlayerStats(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: PlayerStatsData, _cfg: any, accentColor: string, bgColor: string) {
    const textColor = getContrastColor(bgColor);
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const safe = getSafeArea(canvas);

    ctx.fillStyle = textColor; ctx.font = '950 82px Montserrat'; ctx.textAlign = 'center';
    ctx.fillText(data.name.toUpperCase(), safe.centerX, safe.top + 100);

    ctx.fillStyle = accentColor; ctx.font = '800 36px Montserrat';
    ctx.fillText(`${data.team} | ${data.position}`, safe.centerX, safe.top + 170);

    const statsTop = safe.top + 350;
    data.stats.forEach((s, i) => {
        const y = statsTop + i * 100;
        ctx.fillStyle = hexToRGBA(accentColor, 0.1);
        ctx.beginPath(); ctx.roundRect(safe.centerX - 300, y, 600, 80, 20); ctx.fill();

        ctx.fillStyle = textColor; ctx.font = '700 24px Montserrat'; ctx.textAlign = 'left';
        ctx.fillText(s.label, safe.centerX - 260, y + 50);

        ctx.fillStyle = accentColor; ctx.font = '950 36px Montserrat'; ctx.textAlign = 'right';
        ctx.fillText(String(s.value), safe.centerX + 260, y + 55);
    });

    drawGeneralWatermark(ctx, canvas, textColor, accentColor, canvas.height - 150);
}
