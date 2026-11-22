// Diseño propio de Córdoba Seven: fondo rojo liso, tarjetas blancas con los
// escudos, tipografía condensada y el logo del torneo arriba. Es el mismo diseño
// que genera `scripts/cordoba7-placas/render.mjs`, pero dibujado en el lienzo del
// botón Exportar para que lo use cualquiera que exporte este torneo.
//
// Cubre tres plantillas: resultado/horario de un partido, horarios del día y tabla
// de posiciones (una zona o todas). El cuadro y el campeón no tienen diseño propio
// y salen con la familia de siempre (`CORDOBA7_TEMPLATES`).

import { ensureOlivos7Fonts, type O7DailyData, type O7MatchData, type O7StandingsData } from './olivos7';

export const CORDOBA7_TEMPLATES = ['matchStats', 'dailyMatches', 'standings'] as const;
export type Cordoba7Template = (typeof CORDOBA7_TEMPLATES)[number];

export function isCordoba7Template(template: string): template is Cordoba7Template {
    return (CORDOBA7_TEMPLATES as readonly string[]).includes(template);
}

// Ids de la base (tournaments.id) y slug de la página del torneo.
const CORDOBA7_TOURNAMENTS = new Set([
    '65d4ace6-5df3-49cd-a59f-32a40777395e',
    'cordoba-7-2026',
]);

export function isCordoba7Tournament(tournamentId: string | number | null | undefined): boolean {
    if (tournamentId == null) return false;
    return CORDOBA7_TOURNAMENTS.has(String(tournamentId).trim().toLowerCase());
}

export type Cordoba7DrawOptions = {
    loadImage: (url: string) => Promise<HTMLImageElement | null>;
};

type Ctx = CanvasRenderingContext2D;

const RED = '#D1111F';
const DARK = '#8C0A14';
const WHITE = '#ffffff';
const INK = '#1b1b1b';
const TOURNAMENT_LOGO = '/competiciones/ar-cordoba-7.png';
const G22_LOGO = '/header-logo.png';
const ANTON = "'Anton', 'Impact', sans-serif";
const BARLOW = "'Barlow Condensed', 'Arial Narrow', sans-serif";

// ---------------------------------------------------------------------------
// Utilidades de dibujo

function isStory(canvas: HTMLCanvasElement) {
    return canvas.height > 1500;
}

function spacedWidth(ctx: Ctx, value: string, spacing: number) {
    if (!spacing) return ctx.measureText(value).width;
    let w = 0;
    for (const ch of value) w += ctx.measureText(ch).width + spacing;
    return w - spacing;
}

/** Texto centrado por el dibujo real de las letras (la Anton tiene mucho aire arriba). */
function text(
    ctx: Ctx, value: string, x: number, cy: number, font: string, color: string,
    align: 'left' | 'center' | 'right' = 'center', spacing = 0, maxWidth = 0,
) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText('H');
    const y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    const w = spacedWidth(ctx, value, spacing);
    const scale = maxWidth > 0 && w > maxWidth ? maxWidth / w : 1;
    const left = align === 'center' ? x - (w * scale) / 2 : align === 'right' ? x - w * scale : x;
    ctx.save();
    ctx.translate(left, y);
    ctx.scale(scale, 1);
    ctx.textAlign = 'left';
    if (!spacing) {
        ctx.fillText(value, 0, 0);
    } else {
        let cx = 0;
        for (const ch of value) {
            ctx.fillText(ch, cx, 0);
            cx += ctx.measureText(ch).width + spacing;
        }
    }
    ctx.restore();
}

function containImage(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const r = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * r;
    const dh = img.naturalHeight * r;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 3).toUpperCase();
}

// Escudos que son blancos sobre transparente (Locos por el Seven): sobre la tarjeta
// blanca no se ven, así que se pintan de negro, conservando la forma.
const BLACK_ON_WHITE = /locos\s+por\s+el\s+seven/i;

function tintBlack(img: HTMLImageElement): CanvasImageSource {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    if (!g) return img;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000000';
    g.fillRect(0, 0, c.width, c.height);
    return c;
}

/** Tarjeta blanca con el escudo adentro (o las iniciales si el club no tiene). */
function tile(ctx: Ctx, img: HTMLImageElement | null, name: string, x: number, y: number, w: number, h: number, pad = 0.08) {
    ctx.fillStyle = WHITE;
    ctx.fillRect(x, y, w, h);
    const p = Math.round(Math.min(w, h) * pad);
    if (img) {
        if (BLACK_ON_WHITE.test(name)) {
            const black = tintBlack(img);
            const r = Math.min((w - p * 2) / img.naturalWidth, (h - p * 2) / img.naturalHeight);
            const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
            ctx.drawImage(black, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        } else {
            containImage(ctx, img, x + p, y + p, w - p * 2, h - p * 2);
        }
    } else {
        text(ctx, initials(name), x + w / 2, y + h / 2, `${Math.round(Math.min(w, h) * 0.42)}px ${ANTON}`, RED, 'center', Math.min(w, h) * 0.02);
    }
}

type Frame = { W: number; H: number; k: number; story: boolean; top: number; bottom: number };

/** Fondo, logo del torneo arriba y logo de G22 Scores abajo. Devuelve el área libre. */
async function frame(ctx: Ctx, canvas: HTMLCanvasElement, o: Cordoba7DrawOptions): Promise<Frame> {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const k = story ? 1 : 0.74;
    ctx.fillStyle = RED;
    ctx.fillRect(0, 0, W, H);

    const [logo, g22] = await Promise.all([o.loadImage(TOURNAMENT_LOGO), o.loadImage(G22_LOGO)]);
    const logoTop = 70 * k;
    const logoH = 230 * k;
    if (logo) containImage(ctx, logo, 70, logoTop, W - 140, logoH);

    const g22H = 64 * k;
    const g22Y = H - 60 * k - g22H;
    if (g22) {
        const r = g22H / g22.naturalHeight;
        ctx.drawImage(g22, (W - g22.naturalWidth * r) / 2, g22Y, g22.naturalWidth * r, g22H);
    }
    return { W, H, k, story, top: logoTop + logoH, bottom: g22Y - 18 * k };
}

function upper(value: string | undefined | null) {
    return String(value || '').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Resultado / horario de un partido

async function drawMatch(ctx: Ctx, canvas: HTMLCanvasElement, data: O7MatchData, o: Cordoba7DrawOptions) {
    const f = await frame(ctx, canvas, o);
    const { W, k, story } = f;
    const [homeImg, awayImg] = await Promise.all([
        data.homeLogo ? o.loadImage(data.homeLogo) : Promise.resolve(null),
        data.awayLogo ? o.loadImage(data.awayLogo) : Promise.resolve(null),
    ]);
    const scheduled = data.status === 'scheduled' || data.homeScore == null || data.awayScore == null;

    const tagY = f.top + 26 * k + 21 * k;
    const stage = upper(data.roundLabel) || upper(data.tournament);
    if (stage) text(ctx, stage, W / 2, tagY, `700 ${Math.round(42 * k)}px ${BARLOW}`, WHITE, 'center', 0.14 * 42 * k, W - 140);

    const areaTop = tagY + 21 * k + (story ? 14 : 16);
    const areaH = f.bottom - areaTop - (story ? 14 : 16);
    const t = story ? 330 : 215;
    const numSize = story ? 300 : 215;
    const divH = 60 * k;
    const numH = numSize * 0.78;
    const items = scheduled ? [t, numH, t] : [t, numH, divH, numH, t];
    const free = Math.max(0, areaH - items.reduce((a, b) => a + b, 0));
    const gap = free / (items.length + 1);
    let y = areaTop + gap;

    const home = data.homeScore ?? 0, away = data.awayScore ?? 0;
    const winner = scheduled || home === away ? '' : home > away ? 'home' : 'away';
    const num = (value: string, who: 'home' | 'away', cy: number) => {
        ctx.globalAlpha = winner && winner !== who ? 0.55 : 1;
        text(ctx, value, W / 2, cy, `${numSize}px ${ANTON}`, WHITE);
        ctx.globalAlpha = 1;
    };

    tile(ctx, homeImg, data.homeTeam, (W - t) / 2, y, t, t);
    y += t + gap;
    if (scheduled) {
        text(ctx, String(data.time || 'A CONFIRMAR'), W / 2, y + numH / 2, `${Math.round(numSize * 0.7)}px ${ANTON}`, WHITE);
        y += numH + gap;
    } else {
        num(String(home), 'home', y + numH / 2);
        y += numH + gap;
        ctx.fillStyle = WHITE;
        ctx.fillRect(70, y + divH / 2 - 2, W - 140, 4);
        const label = 'FINAL';
        const font = `700 ${Math.round(56 * k)}px ${BARLOW}`;
        ctx.font = font;
        const lw = spacedWidth(ctx, label, 0.14 * 56 * k);
        ctx.fillStyle = RED;
        ctx.fillRect(W / 2 - lw / 2 - 28, y, lw + 56, divH);
        text(ctx, label, W / 2, y + divH / 2, font, WHITE, 'center', 0.14 * 56 * k);
        y += divH + gap;
        num(String(away), 'away', y + numH / 2);
        y += numH + gap;
    }
    tile(ctx, awayImg, data.awayTeam, (W - t) / 2, y, t, t);
}

// ---------------------------------------------------------------------------
// Horarios del día

async function drawDaily(ctx: Ctx, canvas: HTMLCanvasElement, data: O7DailyData, o: Cordoba7DrawOptions) {
    const f = await frame(ctx, canvas, o);
    const { W, k, story } = f;
    const matches = data.matches || [];
    const logos = await Promise.all(matches.map(async (m) => [
        m.homeLogo ? await o.loadImage(m.homeLogo) : null,
        m.awayLogo ? await o.loadImage(m.awayLogo) : null,
    ] as const));

    const titleSize = (story ? 190 : 170) * k;
    const titleCy = f.top + 10 * k + titleSize / 2;
    text(ctx, 'HORARIOS', W / 2, titleCy, `${Math.round(titleSize)}px ${ANTON}`, WHITE, 'center', 1);
    const dateCy = titleCy + titleSize / 2 + 8 * k + 21 * k;
    text(ctx, upper(data.date), W / 2, dateCy, `700 ${Math.round(42 * k)}px ${BARLOW}`, WHITE, 'center', 0.14 * 42 * k, W - 140);

    const listTop = dateCy + 21 * k + 16 * k;
    const gap = story ? 16 : 9;
    const n = Math.max(1, matches.length);
    const baseH = story ? 118 : 80;
    // Con pocos partidos las filas crecen (hasta 1,7 veces) y la lista se centra en el espacio libre.
    const rowH = Math.min(baseH * 1.7, (f.bottom - listTop - gap * (n - 1)) / n);
    const usedH = rowH * n + gap * (n - 1);
    const listY = listTop + Math.max(0, (f.bottom - listTop - usedH) / 2) * 0.6;
    const L = 70, rowW = W - 140;

    matches.forEach((m, i) => {
        const y = listY + i * (rowH + gap);
        const [homeImg, awayImg] = logos[i];
        tile(ctx, homeImg, m.homeTeam, L, y, rowH, rowH);
        tile(ctx, awayImg, m.awayTeam, L + rowW - rowH, y, rowH, rowH);
        const cx = L + rowH + 14, cw = rowW - (rowH + 14) * 2;
        ctx.fillStyle = DARK;
        ctx.fillRect(cx, y, cw, rowH);
        const played = m.status === 'finished' && m.homeScore != null && m.awayScore != null;
        const big = played ? `${m.homeScore} - ${m.awayScore}` : String(m.time || '');
        text(ctx, big, cx + cw / 2, y + rowH * 0.36, `${Math.round(rowH * 0.5)}px ${ANTON}`, WHITE, 'center', 0, cw - 20);
        text(ctx, `${upper(m.homeTeam)} · ${upper(m.awayTeam)}`, cx + cw / 2, y + rowH * 0.77, `700 ${Math.round(rowH * 0.2)}px ${BARLOW}`, WHITE, 'center', rowH * 0.2 * 0.06, cw * 0.96);
    });
}

// ---------------------------------------------------------------------------
// Tabla de posiciones

type StandRow = O7StandingsData['rows'][number] & { won?: number | string; lost?: number | string };

async function drawStandings(ctx: Ctx, canvas: HTMLCanvasElement, data: O7StandingsData, o: Cordoba7DrawOptions) {
    const f = await frame(ctx, canvas, o);
    const { W, k, story } = f;
    const zones: Array<{ name: string; rows: StandRow[] }> = data.groups && data.groups.length > 0
        ? data.groups.map((g) => ({ name: g.name, rows: g.rows as StandRow[] }))
        : [{ name: data.subtitle || 'ZONA', rows: data.rows as StandRow[] }];
    const single = zones.length === 1;

    const logos = new Map<string, HTMLImageElement | null>();
    await Promise.all(zones.flatMap((z) => z.rows).map(async (r) => {
        if (r.teamLogo && !logos.has(r.teamLogo)) logos.set(r.teamLogo, await o.loadImage(r.teamLogo));
    }));

    const titleSize = (single ? 150 : story ? 120 : 100) * k;
    const titleCy = f.top + 10 * k + titleSize / 2;
    text(ctx, 'TABLA DE POSICIONES', W / 2, titleCy, `${Math.round(titleSize)}px ${ANTON}`, WHITE, 'center', 1, W - 140);
    const subCy = titleCy + titleSize / 2 + 10 * k + 21 * k;
    const sub = upper(data.title);
    if (sub) text(ctx, sub, W / 2, subCy, `700 ${Math.round(42 * k)}px ${BARLOW}`, WHITE, 'center', 0.14 * 42 * k, W - 140);

    const listTop = subCy + 21 * k + 22 * k;
    const L = 70, cardW = W - 140;
    const zoneGap = single ? 0 : 22;
    const headBar = single ? 76 : story ? 58 : 46;
    const colHead = single ? 44 : 38;
    const totalRows = zones.reduce((a, z) => a + z.rows.length, 0);
    const avail = f.bottom - listTop - zoneGap * (zones.length - 1) - zones.length * (headBar + colHead);
    const baseRow = single ? (story ? 118 : 96) : story ? 82 : 54;
    const rowH = Math.min(baseRow, avail / Math.max(1, totalRows));
    const crest = Math.min(single ? 96 : story ? 70 : 50, rowH - 4);

    const cols = ['J', 'G', 'E', 'P', 'DIF', 'PTS'];
    const colW = [64, 64, 64, 64, 96, 100].map((w) => w * (single ? 1.1 : 1));
    const colsW = colW.reduce((a, b) => a + b, 0);
    const numSize = single ? 40 : 32;

    let y = listTop;
    for (const zone of zones) {
        const cardH = headBar + colHead + rowH * zone.rows.length;
        ctx.fillStyle = WHITE;
        ctx.fillRect(L, y, cardW, cardH);
        ctx.fillStyle = DARK;
        ctx.fillRect(L, y, cardW, headBar);
        text(ctx, upper(zone.name), L + 24, y + headBar / 2, `${single ? 54 : story ? 40 : 34}px ${ANTON}`, WHITE, 'left', 0, cardW - 48);

        const hy = y + headBar + colHead / 2;
        let cx = L + cardW - colsW;
        cols.forEach((c, i) => {
            text(ctx, c, cx + colW[i] / 2, hy, `700 ${single ? 26 : 22}px ${BARLOW}`, '#777', 'center', 1.5);
            cx += colW[i];
        });

        zone.rows.forEach((r, i) => {
            const ry = y + headBar + colHead + i * rowH;
            ctx.fillStyle = '#e4e4e4';
            ctx.fillRect(L, ry, cardW, 1);
            const cy = ry + rowH / 2;
            text(ctx, String(r.pos), L + 30, cy, `700 ${numSize}px ${BARLOW}`, '#999', 'center');
            const img = r.teamLogo ? logos.get(r.teamLogo) ?? null : null;
            tile(ctx, img, r.team, L + 64, cy - crest / 2, crest, crest, 0.02);
            const nameX = L + 64 + crest + 14;
            const nameMax = cardW - colsW - (nameX - L) - 8;
            text(ctx, upper(r.team), nameX, cy, `800 ${numSize}px ${BARLOW}`, INK, 'left', 0, nameMax);

            const played = Number(r.played) || 0, won = Number(r.won) || 0, lost = Number(r.lost) || 0;
            const draws = Math.max(0, played - won - lost);
            const values = [String(r.played), String(r.won ?? ''), String(draws), String(r.lost ?? ''), String(r.diff), String(r.points)];
            let vx = L + cardW - colsW;
            values.forEach((v, j) => {
                const isPts = j === cols.length - 1;
                text(ctx, v, vx + colW[j] / 2, cy, isPts ? `800 ${single ? 48 : 38}px ${BARLOW}` : `700 ${numSize}px ${BARLOW}`, isPts ? RED : INK, 'center');
                vx += colW[j];
            });
        });
        y += cardH + zoneGap;
    }
}

// ---------------------------------------------------------------------------
// Punto de entrada

export async function drawCordoba7(ctx: Ctx, canvas: HTMLCanvasElement, template: Cordoba7Template, data: unknown, o: Cordoba7DrawOptions) {
    await ensureOlivos7Fonts();
    ctx.save();
    try {
        ctx.filter = 'none';
        if (template === 'matchStats') await drawMatch(ctx, canvas, data as O7MatchData, o);
        else if (template === 'dailyMatches') await drawDaily(ctx, canvas, data as O7DailyData, o);
        else await drawStandings(ctx, canvas, data as O7StandingsData, o);
    } finally {
        ctx.restore();
    }
}
