'use client';

import { useState } from 'react';
import styles from './ExportButton.module.css';

// Types
export type ExportFormat = '1080x1350' | '1080x1920';
export type ExportTemplate = 'standings' | 'dailyMatches' | 'matchStats' | 'playerStats';

interface StandingsData {
    title: string;
    subtitle: string;
    rows: Array<{
        pos: number;
        team: string;
        teamLogo?: string;
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

    const presets = [
        { name: 'Light Clean', bg: '#ffffff', accent: '#00a365' },
        { name: 'G22 Dark', bg: '#060608', accent: '#00a365' },
        { name: 'Rugby Navy', bg: '#0f172a', accent: '#38bdf8' },
        { name: 'UAR Orange', bg: '#111827', accent: '#f97316' },
        { name: 'Silver Sky', bg: '#f8fafc', accent: '#6366f1' },
    ];

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
                await drawWebMatchStats(ctx, canvas, matchData, formatConfig, accentColor, bgColor);
            } else if (template === 'standings') {
                drawStandings(ctx, canvas, data as StandingsData, formatConfig, accentColor, bgColor);
            } else if (template === 'dailyMatches') {
                drawDailyMatches(ctx, canvas, data as DailyMatchesData, formatConfig, accentColor, bgColor);
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
                            <button className={styles.exportBtn} onClick={handleExport}>📥 Exportar Imagen</button>
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

async function drawWebMatchStats(
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

    // 2. Main Title (Cleaner Typography)
    ctx.fillStyle = textColor;
    ctx.font = `950 ${isStory ? '135px' : '110px'} Montserrat, sans-serif`;
    ctx.textAlign = 'center';
    const title = data.mainTitle || 'Finalizado';
    ctx.fillText(title, safe.centerX, safe.top);

    // 3. Scoreboard Card (Web UI Fragment Style)
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

    // Badges inside Card - Top status badge
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

    // Labels & Names
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

    // Bottom Badge: time | status
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

    // 4. Stats Section (Web Style)
    const statsTop = cardY + cardH + (isStory ? 160 : 120);
    const statsW = canvas.width * 0.90;
    const statsX = (canvas.width - statsW) / 2;
    const rowH = isStory ? 95 : 80;

    ctx.textAlign = 'left';
    ctx.fillStyle = textColor;
    ctx.font = '900 32px Montserrat, sans-serif';
    ctx.fillText('Visión General', statsX, statsTop - 60);

    data.stats.forEach((s, i) => {
        const y = statsTop + i * rowH;
        ctx.textAlign = 'center';
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8';
        ctx.font = '700 13px Montserrat, sans-serif';
        ctx.fillText(s.label.toUpperCase(), safe.centerX, y);

        ctx.font = '900 28px Montserrat, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left'; ctx.fillText(String(s.home), statsX, y + 2);
        ctx.textAlign = 'right'; ctx.fillText(String(s.away), statsX + statsW, y + 2);

        // Bar
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
        const barY = y + 22;
        ctx.beginPath(); ctx.roundRect(statsX, barY, statsW, 12, 6); ctx.fill();

        const total = (Number(s.home) + Number(s.away)) || 1;
        const hW = (Number(s.home) / total) * (statsW / 2 - 40);
        const aW = (Number(s.away) / total) * (statsW / 2 - 40);

        ctx.fillStyle = accentColor;
        ctx.beginPath(); ctx.roundRect(safe.centerX - 12 - hW, barY, hW, 12, 6); ctx.fill();
        ctx.beginPath(); ctx.roundRect(safe.centerX + 12, barY, aW, 12, 6); ctx.fill();
    });

    // 5. Watermark
    const lastY = statsTop + (data.stats.length * rowH);
    const wmY = Math.min(canvas.height - 60, lastY + 120);
    drawGeneralWatermark(ctx, canvas, textColor, accentColor, wmY);
}

function drawStandings(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: StandingsData, _cfg: any, accentColor: string, bgColor: string) {
    const textColor = getContrastColor(bgColor);
    const isDark = textColor === '#ffffff';
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const safe = getSafeArea(canvas);

    // Grid
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }

    ctx.fillStyle = textColor; ctx.font = '950 64px Montserrat, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(data.title.toUpperCase(), safe.centerX, safe.top);
    ctx.fillStyle = accentColor; ctx.font = '800 24px Montserrat, sans-serif';
    ctx.fillText(data.subtitle.toUpperCase(), safe.centerX, safe.top + 60);

    const tableTop = safe.top + 180;
    const rowH = 75;
    const tableW = canvas.width * 0.92;
    const startX = (canvas.width - tableW) / 2;

    data.rows.slice(0, 14).forEach((r, i) => {
        const y = tableTop + i * rowH;
        ctx.fillStyle = i % 2 === 0 ? hexToRGBA(accentColor, 0.05) : 'transparent';
        ctx.beginPath(); ctx.roundRect(startX, y, tableW, rowH - 10, 16); ctx.fill();

        ctx.fillStyle = textColor; ctx.font = '700 24px Montserrat'; ctx.textAlign = 'left';
        ctx.fillText(`${r.pos}.`, startX + 30, y + 42);
        ctx.font = '800 24px Montserrat';
        ctx.fillText(r.team, startX + 100, y + 42, tableW * 0.6);

        ctx.fillStyle = accentColor; ctx.font = '950 32px Montserrat'; ctx.textAlign = 'right';
        ctx.fillText(String(r.points), startX + tableW - 30, y + 45);
    });
    drawGeneralWatermark(ctx, canvas, textColor, accentColor, canvas.height - 100);
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

    data.matches.slice(0, 11).forEach((m, i) => {
        const y = matchTop + i * rowH;
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9';
        ctx.beginPath(); ctx.roundRect(startX, y, rowW, rowH - 15, 20); ctx.fill();

        ctx.fillStyle = textColor; ctx.font = 'bold 26px system-ui';
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
