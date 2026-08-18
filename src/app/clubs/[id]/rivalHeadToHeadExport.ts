import {
    FONT_BODY,
    FONT_OUTFIT_BLACK,
    drawBackdrop,
    drawBrandFooter,
    drawCenteredPill,
    drawLogoBadge,
    drawSurfacePanel,
    ensureExportFonts,
    getContrastColor,
    getMutedColor,
    getTextColor,
    hexToRGBA,
    loadImage,
} from '@/components/ExportImage';
import { APP_TIMEZONE } from '@/lib/timezone';

export type RivalExportFormat = '4:5' | '9:16';

export type RivalHeadToHeadMatch = {
    date: string;
    isHome: boolean;
    outcome: 'win' | 'draw' | 'loss';
    pointsFor: number;
    pointsAgainst: number;
    tournamentName: string | null;
};

export type RivalHeadToHeadData = {
    teamName: string;
    teamLogo: string;
    rivalName: string;
    rivalLogo: string;
    scoreTerm: string;
    /** TODOS los cruces, más reciente primero: el render deriva de acá el balance,
     * los máximos y las rachas — no hay números precalculados que puedan divergir. */
    matches: RivalHeadToHeadMatch[];
};

// El mano a mano habla el mismo idioma visual que los exports de posiciones,
// fixtures y resultados: paleta G22 Dark, píldora de título en el acento,
// paneles de superficie con filas, y el pie "Info aportada por: G22 Scores".
// Los datos son NEUTRALES: cada métrica existe para los dos clubes por igual
// (nada de "a favor / en contra" ni rachas desde la óptica de uno solo).
const PALETTE = { bg: '#0a0a0b', accent: '#00a365' };

function formatLongDate(value: string | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const day = new Intl.DateTimeFormat('es-AR', { day: '2-digit', timeZone: APP_TIMEZONE }).format(date);
    const month = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: APP_TIMEZONE }).format(date).replace('.', '').toUpperCase();
    const year = new Intl.DateTimeFormat('es-AR', { year: 'numeric', timeZone: APP_TIMEZONE }).format(date);
    return `${day} ${month} ${year}`;
}

function formatShortDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: APP_TIMEZONE }).format(date);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, baseSize: number, family: string, maxWidth: number, minSize = 12): number {
    let size = baseSize;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
        size -= 1;
        ctx.font = `${weight} ${size}px ${family}`;
    }
    return size;
}

// Para textos que ni achicados entran (nombres de torneo kilométricos): corta con "…".
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
        result = result.slice(0, -1).trimEnd();
    }
    return `${result}…`;
}

type HeadToHeadFacts = {
    played: number;
    teamWins: number;
    draws: number;
    rivalWins: number;
    teamPoints: number;
    rivalPoints: number;
    teamBiggestMargin: number;
    rivalBiggestMargin: number;
    teamHighestScore: number;
    rivalHighestScore: number;
    teamBestStreak: number;
    rivalBestStreak: number;
    firstMeeting?: string;
    lastMeeting?: string;
};

function deriveFacts(matchesNewestFirst: RivalHeadToHeadMatch[]): HeadToHeadFacts {
    const facts: HeadToHeadFacts = {
        played: matchesNewestFirst.length,
        teamWins: 0,
        draws: 0,
        rivalWins: 0,
        teamPoints: 0,
        rivalPoints: 0,
        teamBiggestMargin: 0,
        rivalBiggestMargin: 0,
        teamHighestScore: 0,
        rivalHighestScore: 0,
        teamBestStreak: 0,
        rivalBestStreak: 0,
        firstMeeting: matchesNewestFirst[matchesNewestFirst.length - 1]?.date,
        lastMeeting: matchesNewestFirst[0]?.date,
    };
    let teamRun = 0;
    let rivalRun = 0;
    for (let index = matchesNewestFirst.length - 1; index >= 0; index -= 1) {
        const match = matchesNewestFirst[index];
        facts.teamPoints += match.pointsFor;
        facts.rivalPoints += match.pointsAgainst;
        facts.teamHighestScore = Math.max(facts.teamHighestScore, match.pointsFor);
        facts.rivalHighestScore = Math.max(facts.rivalHighestScore, match.pointsAgainst);
        if (match.outcome === 'win') {
            facts.teamWins += 1;
            facts.teamBiggestMargin = Math.max(facts.teamBiggestMargin, match.pointsFor - match.pointsAgainst);
            teamRun += 1;
            rivalRun = 0;
        } else if (match.outcome === 'loss') {
            facts.rivalWins += 1;
            facts.rivalBiggestMargin = Math.max(facts.rivalBiggestMargin, match.pointsAgainst - match.pointsFor);
            rivalRun += 1;
            teamRun = 0;
        } else {
            facts.draws += 1;
            teamRun = 0;
            rivalRun = 0;
        }
        facts.teamBestStreak = Math.max(facts.teamBestStreak, teamRun);
        facts.rivalBestStreak = Math.max(facts.rivalBestStreak, rivalRun);
    }
    return facts;
}

async function drawRivalHeadToHead(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: RivalHeadToHeadData,
): Promise<void> {
    await ensureExportFonts();
    const [teamLogo, rivalLogo, brandLogo] = await Promise.all([
        loadImage(data.teamLogo || ''),
        loadImage(data.rivalLogo || ''),
        loadImage('/icon.png'),
    ]);

    // Escudo real o no hay export (regla dura del proyecto): sin uno de los dos,
    // la imagen saldría con un hueco y lista para publicarse rota.
    const missingCrests = [
        teamLogo ? '' : data.teamName.trim() || 'el club',
        rivalLogo ? '' : data.rivalName.trim() || 'el rival',
    ].filter(Boolean);
    if (missingCrests.length > 0) {
        throw new Error(`No se pudo cargar el escudo de ${missingCrests.join(' y ')}`);
    }

    const facts = deriveFacts(data.matches);
    const W = canvas.width;
    const H = canvas.height;
    const isStory = H > 1500;
    const isDark = getContrastColor(PALETTE.bg) === '#ffffff';
    const textColor = getTextColor(isDark);
    const mutedColor = getMutedColor(isDark, 0.68);
    const softColor = getMutedColor(isDark, 0.1);
    const accent = PALETTE.accent;

    drawBackdrop(ctx, canvas, PALETTE.bg, accent, isDark);
    drawCenteredPill(
        ctx,
        W / 2,
        isStory ? 74 : 56,
        'MANO A MANO',
        accent,
        getContrastColor(accent),
        `800 ${isStory ? 24 : 20}px ${FONT_BODY}`,
        24,
        isStory ? 48 : 42,
    );

    // Cabecera: los dos escudos reales con el nombre debajo y VS en el medio,
    // como una fila de fixture agrandada.
    const crestSize = isStory ? 150 : 128;
    const columnOffset = Math.round(W * 0.22);
    const crestCenterY = isStory ? 268 : 218;
    const nameY = crestCenterY + crestSize / 2 + (isStory ? 52 : 44);
    drawLogoBadge(ctx, { x: W / 2 - columnOffset, y: crestCenterY, size: crestSize, img: teamLogo, label: data.teamName, rawLogo: data.teamLogo, isDark });
    drawLogoBadge(ctx, { x: W / 2 + columnOffset, y: crestCenterY, size: crestSize, img: rivalLogo, label: data.rivalName, rawLogo: data.rivalLogo, isDark });

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = mutedColor;
    ctx.font = `900 ${isStory ? 40 : 34}px ${FONT_OUTFIT_BLACK}`;
    ctx.fillText('VS', W / 2, crestCenterY);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = textColor;
    const nameMaxWidth = columnOffset * 2 - 70;
    for (const [name, cx] of [[data.teamName, W / 2 - columnOffset], [data.rivalName, W / 2 + columnOffset]] as Array<[string, number]>) {
        const label = name.trim().toUpperCase();
        fitFont(ctx, label, '900', isStory ? 30 : 26, FONT_OUTFIT_BLACK, nameMaxWidth, 15);
        ctx.fillText(label, cx, nameY);
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${isStory ? 22 : 18}px ${FONT_BODY}`;
    const kicker = facts.played === 1 ? 'Historial entre sí · 1 partido' : `Historial entre sí · ${facts.played} partidos`;
    ctx.fillText(kicker, W / 2, nameY + (isStory ? 42 : 36));
    ctx.restore();

    // Panel del balance: las tres columnas grandes y la tabla comparativa
    // (una columna de valores por club: los números no son "de nadie").
    const panelX = isStory ? 46 : 54;
    const panelWidth = W - panelX * 2;
    const panelY = nameY + (isStory ? 74 : 62);
    const panelHeight = isStory ? 540 : 480;
    drawSurfacePanel(ctx, panelX, panelY, panelWidth, panelHeight, 34, isDark);

    const columns: Array<{ value: number; label: string }> = [
        { value: facts.teamWins, label: `GANÓ ${data.teamName.toUpperCase()}` },
        { value: facts.draws, label: 'EMPATES' },
        { value: facts.rivalWins, label: `GANÓ ${data.rivalName.toUpperCase()}` },
    ];
    const bigNumberY = panelY + (isStory ? 118 : 108);
    const bigLabelY = bigNumberY + (isStory ? 42 : 38);
    ctx.save();
    ctx.textAlign = 'center';
    columns.forEach((column, index) => {
        const cx = panelX + panelWidth * ((index * 2 + 1) / 6);
        ctx.fillStyle = index === 1 ? mutedColor : textColor;
        ctx.font = `900 ${isStory ? 88 : 80}px ${FONT_OUTFIT_BLACK}`;
        ctx.fillText(String(column.value), cx, bigNumberY);
        ctx.fillStyle = mutedColor;
        fitFont(ctx, column.label, '700', isStory ? 18 : 16, FONT_BODY, panelWidth / 3 - 30, 11);
        ctx.fillText(column.label, cx, bigLabelY);
    });
    ctx.strokeStyle = softColor;
    ctx.lineWidth = 1;
    for (const fraction of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(panelX + panelWidth * fraction, panelY + 40);
        ctx.lineTo(panelX + panelWidth * fraction, bigLabelY + 6);
        ctx.stroke();
    }
    const dividerY = bigLabelY + (isStory ? 28 : 24);
    ctx.beginPath();
    ctx.moveTo(panelX + 24, dividerY);
    ctx.lineTo(panelX + panelWidth - 24, dividerY);
    ctx.stroke();
    ctx.restore();

    // Tabla comparativa: rótulo a la izquierda, un valor por club. Las columnas
    // llevan el nombre del club como encabezado, así cada número dice de quién es.
    const goles = data.scoreTerm.trim().toLowerCase() === 'goles';
    const statRows: Array<[string, string, string]> = [
        [goles ? 'GOLES' : 'PUNTOS', String(facts.teamPoints), String(facts.rivalPoints)],
        ['MAYOR DIFERENCIA', facts.teamBiggestMargin > 0 ? String(facts.teamBiggestMargin) : '—', facts.rivalBiggestMargin > 0 ? String(facts.rivalBiggestMargin) : '—'],
        [goles ? 'MÁS GOLES EN UN PARTIDO' : 'PUNTAJE MÁS ALTO', String(facts.teamHighestScore), String(facts.rivalHighestScore)],
        ['MEJOR RACHA DE VICTORIAS', facts.teamBestStreak > 0 ? String(facts.teamBestStreak) : '—', facts.rivalBestStreak > 0 ? String(facts.rivalBestStreak) : '—'],
    ];
    const labelX = panelX + 26;
    const colAX = panelX + panelWidth * 0.58;
    const colBX = panelX + panelWidth * 0.855;
    const valueColWidth = panelWidth * 0.24;
    const headerRowY = dividerY + (isStory ? 34 : 30);
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    for (const [name, cx] of [[data.teamName, colAX], [data.rivalName, colBX]] as Array<[string, number]>) {
        const label = name.trim().toUpperCase();
        fitFont(ctx, label, '700', isStory ? 17 : 15, FONT_BODY, valueColWidth, 10);
        ctx.fillText(label, cx, headerRowY);
    }
    ctx.strokeStyle = softColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 24, headerRowY + 14);
    ctx.lineTo(panelX + panelWidth - 24, headerRowY + 14);
    ctx.stroke();

    const statRowHeight = isStory ? 56 : 50;
    const statTop = headerRowY + (isStory ? 26 : 22);
    statRows.forEach(([label, teamValue, rivalValue], index) => {
        const centerY = statTop + index * statRowHeight + statRowHeight / 2;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = mutedColor;
        fitFont(ctx, label, '700', isStory ? 17 : 15, FONT_BODY, panelWidth * 0.42, 11);
        ctx.fillText(label, labelX, centerY);
        ctx.textAlign = 'center';
        ctx.fillStyle = textColor;
        ctx.font = `900 ${isStory ? 27 : 24}px ${FONT_OUTFIT_BLACK}`;
        ctx.fillText(teamValue, colAX, centerY);
        ctx.fillText(rivalValue, colBX, centerY);
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${isStory ? 20 : 17}px ${FONT_BODY}`;
    const metaLine = `PRIMER CRUCE ${formatLongDate(facts.firstMeeting)}  ·  ÚLTIMO ${formatLongDate(facts.lastMeeting)}`;
    ctx.fillText(metaLine, panelX + panelWidth / 2, panelY + panelHeight - (isStory ? 26 : 22));
    ctx.restore();

    // Panel de últimos cruces: filas como las del export de resultados.
    const recentRows = data.matches.slice(0, isStory ? 5 : 4);
    if (recentRows.length > 0) {
        const listY = panelY + panelHeight + (isStory ? 26 : 22);
        const listHeaderH = isStory ? 64 : 56;
        // Las filas se estiran para llegar hasta el pie de marca: sin esto, el
        // 9:16 queda con un vacío de ~300px entre el panel y el sello.
        const footerLimit = H - (isStory ? 126 : 108) - (isStory ? 40 : 34);
        const rowHeight = Math.max(
            isStory ? 64 : 56,
            Math.min(isStory ? 122 : 84, Math.floor((footerLimit - listY - listHeaderH - 20) / recentRows.length)),
        );
        const listHeight = listHeaderH + recentRows.length * rowHeight + 20;
        drawSurfacePanel(ctx, panelX, listY, panelWidth, listHeight, 34, isDark);

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = accent;
        ctx.font = `800 ${isStory ? 19 : 17}px ${FONT_BODY}`;
        ctx.fillText('ÚLTIMOS CRUCES', panelX + 26, listY + listHeaderH / 2 + 2);
        ctx.strokeStyle = softColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + 24, listY + listHeaderH - 8);
        ctx.lineTo(panelX + panelWidth - 24, listY + listHeaderH - 8);
        ctx.stroke();
        ctx.restore();

        recentRows.forEach((row, index) => {
            const rowY = listY + listHeaderH + index * rowHeight;
            const centerY = rowY + rowHeight / 2;
            ctx.save();
            if (index % 2 === 0) {
                ctx.fillStyle = hexToRGBA(accent, isDark ? 0.05 : 0.035);
                ctx.beginPath();
                ctx.roundRect(panelX + 14, rowY + 3, panelWidth - 28, rowHeight - 6, 8);
                ctx.fill();
            }

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = mutedColor;
            ctx.font = `700 ${isStory ? 20 : 18}px ${FONT_BODY}`;
            ctx.fillText(formatShortDate(row.date), panelX + 26, centerY);

            // Cada cruce se muestra COMO FUE: el local primero, con su escudo a
            // cada lado del marcador real. Sin "LOCAL/VISITANTE" ni pastilla G/E/P,
            // que leían el partido desde la óptica del club; el único énfasis es
            // objetivo: el número del ganador a pleno y el del perdedor atenuado.
            const homeScore = row.isHome ? row.pointsFor : row.pointsAgainst;
            const awayScore = row.isHome ? row.pointsAgainst : row.pointsFor;
            const scoreCenterX = panelX + panelWidth * 0.62;
            const rowCrestSize = Math.min(rowHeight - 12, isStory ? 46 : 40);
            const crestOffset = isStory ? 118 : 104;

            // El torneo del cruce, entre la fecha y los escudos.
            if (row.tournamentName) {
                const tournamentX = panelX + (isStory ? 168 : 152);
                const tournamentMax = scoreCenterX - crestOffset - rowCrestSize / 2 - 18 - tournamentX;
                if (tournamentMax > 40) {
                    ctx.fillStyle = getMutedColor(isDark, 0.55);
                    fitFont(ctx, row.tournamentName.toUpperCase(), '700', isStory ? 16 : 14, FONT_BODY, tournamentMax * 1.35, 11);
                    ctx.fillText(truncateToWidth(ctx, row.tournamentName.toUpperCase(), tournamentMax), tournamentX, centerY);
                }
            }
            drawLogoBadge(ctx, {
                x: scoreCenterX - crestOffset,
                y: centerY,
                size: rowCrestSize,
                img: row.isHome ? teamLogo : rivalLogo,
                label: row.isHome ? data.teamName : data.rivalName,
                rawLogo: row.isHome ? data.teamLogo : data.rivalLogo,
                isDark,
                showFrame: false,
            });
            drawLogoBadge(ctx, {
                x: scoreCenterX + crestOffset,
                y: centerY,
                size: rowCrestSize,
                img: row.isHome ? rivalLogo : teamLogo,
                label: row.isHome ? data.rivalName : data.teamName,
                rawLogo: row.isHome ? data.rivalLogo : data.teamLogo,
                isDark,
                showFrame: false,
            });
            const dimColor = getMutedColor(isDark, 0.45);
            ctx.font = `900 ${isStory ? 30 : 26}px ${FONT_OUTFIT_BLACK}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = mutedColor;
            const separator = '-';
            ctx.fillText(separator, scoreCenterX, centerY);
            const separatorHalf = ctx.measureText(separator).width / 2;
            const scoreGap = isStory ? 14 : 12;
            ctx.textAlign = 'right';
            ctx.fillStyle = homeScore >= awayScore ? textColor : dimColor;
            ctx.fillText(String(homeScore), scoreCenterX - separatorHalf - scoreGap, centerY);
            ctx.textAlign = 'left';
            ctx.fillStyle = awayScore >= homeScore ? textColor : dimColor;
            ctx.fillText(String(awayScore), scoreCenterX + separatorHalf + scoreGap, centerY);
            ctx.restore();
        });
    }

    drawBrandFooter(ctx, canvas, brandLogo, isDark);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('No se pudo generar la imagen.'));
        }, 'image/png');
    });
}

function slugify(value: string): string {
    // Sin rango de combinantes en regex: se filtran por code point (0x300-0x36f).
    const stripped = Array.from(value.normalize('NFD')).filter((ch) => {
        const code = ch.codePointAt(0) ?? 0;
        return code < 0x300 || code > 0x36f;
    }).join('');
    return stripped
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'club';
}

/**
 * Genera el PNG y lo entrega: hoja de compartir del sistema si el navegador
 * puede compartir archivos, descarga directa si no.
 */
export async function shareRivalHeadToHead(data: RivalHeadToHeadData, format: RivalExportFormat): Promise<'shared' | 'downloaded'> {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = format === '9:16' ? 1920 : 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permitió dibujar la imagen.');

    await drawRivalHeadToHead(ctx, canvas, data);
    const blob = await canvasToBlob(canvas);
    const fileName = `mano-a-mano-${slugify(data.teamName)}-vs-${slugify(data.rivalName)}-${format === '4:5' ? '4x5' : '9x16'}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    const nav = navigator as Navigator & { canShare?: (payload: ShareData) => boolean };
    if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
        try {
            await nav.share({ files: [file] });
            return 'shared';
        } catch (error) {
            // Cancelar la hoja de compartir no es un error; cualquier otra falla
            // cae a la descarga directa.
            if ((error as DOMException)?.name === 'AbortError') return 'shared';
        }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
}
