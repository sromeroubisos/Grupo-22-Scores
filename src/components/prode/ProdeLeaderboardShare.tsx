'use client';

import { useState } from 'react';
import type { ProdePlayLeaderboardEntry } from '@/lib/prode/types';
import styles from './ProdeLeaderboardShare.module.css';

type ShareFormat = 'post' | 'story';

type ProdeLeaderboardShareProps = {
    leaderboard: ProdePlayLeaderboardEntry[];
    title: string;
    subtitle?: string | null;
    className?: string;
};

// ── Poster palette (mirrors the radial predictor's premium dark sheet) ───────
const INK = '#0E1424';
const INK_DEEP = '#070B16';
const PANEL = 'rgba(255,255,255,0.045)';
const PANEL_CURRENT = 'rgba(19,185,129,0.16)';
const PANEL_LINE = 'rgba(255,255,255,0.08)';
const TEXT = '#F3F4F7';
const MUTED = 'rgba(243,244,247,0.55)';
const GREEN = '#13B981';
const GOLD = '#E7B24A';
const SILVER = '#C7CCD6';
const BRONZE = '#C98A52';
const FAMILY = 'system-ui, "Segoe UI", sans-serif';

function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function rankAccent(rank: number) {
    if (rank === 1) return GOLD;
    if (rank === 2) return SILVER;
    if (rank === 3) return BRONZE;
    return MUTED;
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

export default function ProdeLeaderboardShare({
    leaderboard,
    title,
    subtitle,
    className,
}: ProdeLeaderboardShareProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [note, setNote] = useState('');
    // Quien exporta elige si su propia fila va resaltada (verde + "(vos)") o no.
    const [highlightCurrent, setHighlightCurrent] = useState(true);
    const hasCurrentUser = leaderboard.some((entry) => entry.isCurrentUser);

    // Render the full standings table to a social-ready PNG (square post or vertical
    // story) with the title + CTA on top and the G22 logo band at the bottom.
    const buildShareImageBlob = async (format: ShareFormat): Promise<Blob | null> => {
        if (!leaderboard.length) return null;
        const isStory = format === 'story';
        const W = 1080;
        const H = isStory ? 1920 : 1350;
        const margin = 64;

        const headerH = isStory ? 360 : 300;
        const footerH = isStory ? 156 : 132;
        const tableTop = headerH;
        const tableBottom = H - footerH;
        const availH = tableBottom - tableTop - margin;

        // El export muestra solo el top 10; si hay más participantes se resume al pie.
        const TOP_N = 10;
        const rows = leaderboard.slice(0, TOP_N);
        const overflow = leaderboard.length - rows.length;
        const slots = rows.length + (overflow > 0 ? 1 : 0);
        const rowGap = 10;
        const rowH = Math.min(isStory ? 80 : 76, (availH - rowGap * (slots - 1)) / Math.max(slots, 1));

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const fitFont = (text: string, maxW: number, weight: number, startPx: number) => {
            let px = startPx;
            ctx.font = `${weight} ${px}px ${FAMILY}`;
            while (px > 20 && ctx.measureText(text).width > maxW) {
                px -= 2;
                ctx.font = `${weight} ${px}px ${FAMILY}`;
            }
            return px;
        };

        const ellipsize = (text: string, maxW: number) => {
            if (ctx.measureText(text).width <= maxW) return text;
            let clipped = text;
            while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxW) {
                clipped = clipped.slice(0, -1);
            }
            return `${clipped.trim()}…`;
        };

        // Background — deep navy vertical gradient.
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, INK);
        bg.addColorStop(1, INK_DEEP);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Soft green glow behind the header.
        const glow = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 620);
        glow.addColorStop(0, 'rgba(19,185,129,0.22)');
        glow.addColorStop(1, 'rgba(19,185,129,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, headerH);

        // ── Header: CTA pill + kicker + title + subtitle ────────────────────────
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // CTA pill on top.
        const ctaText = 'PRONOSTICÁ EN G22 SCORES';
        ctx.font = `800 24px ${FAMILY}`;
        const ctaW = ctx.measureText(ctaText).width + 56;
        const ctaH = 50;
        const ctaX = (W - ctaW) / 2;
        const ctaY = isStory ? 76 : 58;
        roundRect(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2);
        ctx.fillStyle = GREEN;
        ctx.fill();
        ctx.fillStyle = INK_DEEP;
        ctx.fillText(ctaText, W / 2, ctaY + ctaH / 2 + 1);

        // Kicker.
        ctx.fillStyle = GREEN;
        ctx.font = `700 26px ${FAMILY}`;
        ctx.fillText('TABLA DE POSICIONES', W / 2, ctaY + ctaH + 48);

        // Title (auto-fit).
        const titlePx = fitFont(title || 'Prode', W - margin * 2, 800, isStory ? 68 : 60);
        ctx.fillStyle = TEXT;
        ctx.font = `800 ${titlePx}px ${FAMILY}`;
        const titleY = ctaY + ctaH + 48 + 30 + titlePx / 2;
        ctx.fillText(ellipsize(title || 'Prode', W - margin * 2), W / 2, titleY);

        // Subtitle.
        if (subtitle) {
            ctx.fillStyle = MUTED;
            ctx.font = `600 26px ${FAMILY}`;
            ctx.fillText(ellipsize(subtitle, W - margin * 2), W / 2, titleY + titlePx / 2 + 30);
        }

        // ── Column headers ──────────────────────────────────────────────────────
        const tableX = margin;
        const tableW = W - margin * 2;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = MUTED;
        ctx.font = `700 20px ${FAMILY}`;
        const headLabelsY = tableTop - 18;
        ctx.textAlign = 'left';
        ctx.fillText('POS · PARTICIPANTE', tableX + 8, headLabelsY);
        ctx.textAlign = 'right';
        ctx.fillText('PTS', tableX + tableW - 24, headLabelsY);

        // ── Rows ────────────────────────────────────────────────────────────────
        rows.forEach((entry, index) => {
            const rank = entry.position ?? index + 1;
            const y = tableTop + index * (rowH + rowGap);
            const accent = rankAccent(rank);
            const isCurrent = entry.isCurrentUser && highlightCurrent;

            // Row card.
            roundRect(ctx, tableX, y, tableW, rowH, 18);
            ctx.fillStyle = isCurrent ? PANEL_CURRENT : PANEL;
            ctx.fill();
            ctx.lineWidth = isCurrent ? 2 : 1;
            ctx.strokeStyle = isCurrent ? GREEN : PANEL_LINE;
            ctx.stroke();

            const cy = y + rowH / 2;

            // Rank badge.
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = accent;
            ctx.font = `800 ${Math.round(rowH * 0.42)}px ${FAMILY}`;
            ctx.fillText(String(rank), tableX + 44, cy);

            // Avatar — initials circle (CORS-safe, no external image tainting).
            const avR = rowH * 0.32;
            const avCx = tableX + 110;
            ctx.beginPath();
            ctx.arc(avCx, cy, avR, 0, Math.PI * 2);
            ctx.fillStyle = isCurrent ? 'rgba(19,185,129,0.28)' : 'rgba(255,255,255,0.08)';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = isCurrent ? GREEN : 'rgba(255,255,255,0.16)';
            ctx.stroke();
            ctx.fillStyle = TEXT;
            ctx.font = `800 ${Math.round(avR * 0.85)}px ${FAMILY}`;
            ctx.fillText(initialsOf(entry.userName), avCx, cy + 1);

            // Name.
            const nameX = avCx + avR + 22;
            const ptsLabel = `${entry.totalPoints} pts`;
            ctx.font = `800 ${Math.round(rowH * 0.34)}px ${FAMILY}`;
            const ptsW = ctx.measureText(ptsLabel).width;
            const nameMaxW = tableX + tableW - 24 - ptsW - 28 - nameX;
            ctx.textAlign = 'left';
            ctx.fillStyle = TEXT;
            ctx.font = `700 ${Math.round(rowH * 0.32)}px ${FAMILY}`;
            const displayName = isCurrent ? `${entry.userName} (vos)` : entry.userName;
            ctx.fillText(ellipsize(displayName, Math.max(nameMaxW, 60)), nameX, cy);

            // Points.
            ctx.textAlign = 'right';
            ctx.fillStyle = isCurrent ? GREEN : TEXT;
            ctx.font = `800 ${Math.round(rowH * 0.34)}px ${FAMILY}`;
            ctx.fillText(ptsLabel, tableX + tableW - 24, cy);
        });

        // Overflow summary row.
        if (overflow > 0) {
            const y = tableTop + rows.length * (rowH + rowGap);
            roundRect(ctx, tableX, y, tableW, rowH, 18);
            ctx.fillStyle = 'rgba(255,255,255,0.02)';
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = MUTED;
            ctx.font = `700 ${Math.round(rowH * 0.3)}px ${FAMILY}`;
            ctx.fillText(`+${overflow} participantes más`, W / 2, y + rowH / 2);
        }

        // ── Footer: G22 logo band ───────────────────────────────────────────────
        const bandTop = H - footerH;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, bandTop, W, footerH);
        ctx.beginPath();
        ctx.moveTo(0, bandTop);
        ctx.lineTo(W, bandTop);
        ctx.lineWidth = 1;
        ctx.strokeStyle = PANEL_LINE;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = GREEN;
        ctx.font = `800 34px ${FAMILY}`;
        ctx.fillText('G22 SCORES', W / 2, bandTop + footerH / 2 - 14);
        ctx.fillStyle = MUTED;
        ctx.font = `600 22px ${FAMILY}`;
        ctx.fillText('Armá tu prode y competí con amigos', W / 2, bandTop + footerH / 2 + 24);

        return await new Promise<Blob | null>((resolve) => {
            try {
                canvas.toBlob((b) => resolve(b), 'image/png');
            } catch {
                resolve(null);
            }
        });
    };

    const handleShare = async (format: ShareFormat) => {
        setMenuOpen(false);
        setNote('Generando…');

        let blob: Blob | null = null;
        try {
            blob = await buildShareImageBlob(format);
        } catch {
            blob = null;
        }

        if (!blob) {
            setNote('No se pudo');
            window.setTimeout(() => setNote(''), 1800);
            return;
        }

        const fileName = `tabla-prode-g22-${format}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };

        if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
            try {
                await nav.share({ files: [file], title: title || 'Tabla del prode' });
                setNote('');
            } catch {
                setNote('');
            }
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setNote('Descargada');
        window.setTimeout(() => setNote(''), 1800);
    };

    if (!leaderboard.length) return null;

    return (
        <div className={`${styles.shareWrap} ${className ?? ''}`}>
            <button
                type="button"
                className={styles.shareBtn}
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
            >
                {note || 'Compartir tabla'}
            </button>
            {menuOpen && (
                <div className={styles.shareMenu} role="menu">
                    {hasCurrentUser && (
                        <label className={styles.shareToggle}>
                            <input
                                type="checkbox"
                                checked={highlightCurrent}
                                onChange={(event) => setHighlightCurrent(event.target.checked)}
                            />
                            Resaltar mi nombre
                        </label>
                    )}
                    <button type="button" role="menuitem" onClick={() => handleShare('post')}>
                        Post (cuadrado)
                    </button>
                    <button type="button" role="menuitem" onClick={() => handleShare('story')}>
                        Historia (vertical)
                    </button>
                </div>
            )}
        </div>
    );
}
