// Diseño propio del Seven Nocturno de la Pava (Córdoba Athletic Club): la misma
// estética que el cronograma oficial del torneo —fondo negro con grano, serif
// roja pesada para los títulos y los números, rótulos condensados con mucho aire,
// línea de tiempo con puntos rojos, humo rojo y el escudo de fondo abajo a la
// derecha, destello rojo en la esquina—, dibujada en el lienzo del botón Exportar.
//
// Cubre las cinco plantillas que tienen diseño propio en Olivos 7: partido,
// horarios del día, tabla, cuadro de playoff y campeón. El desvío vive en
// ExportImage, igual que el de Córdoba 7 (por id de torneo, antes de las familias).

import {
    ensureOlivos7Fonts,
    readBracketMatch,
    type BracketMatch,
    type O7BracketData,
    type O7ChampionData,
    type O7DailyData,
    type O7MatchData,
    type O7StandingsData,
} from './olivos7';

export const PAVA7_TEMPLATES = ['matchStats', 'dailyMatches', 'standings', 'playoffBracket', 'champion'] as const;
export type Pava7Template = (typeof PAVA7_TEMPLATES)[number];

export function isPava7Template(template: string): template is Pava7Template {
    return (PAVA7_TEMPLATES as readonly string[]).includes(template);
}

// "standings" también lo usan el palmarés, la ladder y el póster de ranking (`data.variant`):
// esas placas no son una tabla de posiciones y siguen con su diseño dedicado.
export function pava7Covers(template: string, data: unknown): template is Pava7Template {
    if (!isPava7Template(template)) return false;
    if (template !== 'standings') return true;
    return !(data as { variant?: string | null } | null)?.variant;
}

// Ids de la base (tournaments.id) y slugs de las dos ramas.
const PAVA7_TOURNAMENTS = new Set([
    'ed822419-a8e3-4581-94c1-e309598f0619',
    '85fbdaf2-e9c1-4f14-9abc-d57218c6aea0',
    'seven-de-la-pava-2026',
    'seven-de-la-pava-2026-femenino',
]);

export function isPava7Tournament(tournamentId: string | number | null | undefined): boolean {
    if (tournamentId == null) return false;
    return PAVA7_TOURNAMENTS.has(String(tournamentId).trim().toLowerCase());
}

export type Pava7DrawOptions = {
    loadImage: (url: string) => Promise<HTMLImageElement | null>;
};

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------------------
// Paleta y tipografías (sacadas del cronograma del torneo)

const BG = '#0f0d0d';
const RED = '#e0402e';
const RED_DEEP = '#7a1a12';
const CREAM = '#efe7da';
const MUTED = '#8d8580';
const RULE = '#4a4442';
const PAVA_LOGO = '/competiciones/ar-seven-de-la-pava.png';
const CAC_CREST = '/clubs/sb-cordoba-athletic-club.png';
const SERIF = "'Abril Fatface', 'Didot', 'Bodoni MT', serif";
const COND = "'Oswald', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const KICKER = 'SEVEN NOCTURNO DE LA PAVA';

let fontsReady: Promise<void> | null = null;

function ensurePavaFonts(): Promise<void> {
    if (fontsReady) return fontsReady;
    fontsReady = (async () => {
        await ensureOlivos7Fonts();
        if (typeof document === 'undefined') return;
        const id = 'pava7-export-fonts';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Oswald:wght@400;500;600;700&display=block';
            const loaded = new Promise<void>((resolve) => {
                link.onload = () => resolve();
                link.onerror = () => resolve();
                window.setTimeout(resolve, 4000);
            });
            document.head.appendChild(link);
            await loaded;
        }
        await Promise.all([
            `40px ${SERIF}`, `400 40px ${COND}`, `500 40px ${COND}`, `600 40px ${COND}`, `700 40px ${COND}`,
        ].map((face) => document.fonts.load(face).catch(() => undefined)));
    })();
    return fontsReady;
}

// ---------------------------------------------------------------------------
// Utilidades de dibujo

function isStory(canvas: HTMLCanvasElement) {
    return canvas.height > 1500;
}

function upper(value: string | undefined | null) {
    return String(value || '').trim().toUpperCase();
}

/** Nombre de club sin el sufijo de la versión 7s ni las comillas del equipo: `Córdoba Athletic Club 7s "1"` → "CÓRDOBA ATHLETIC CLUB 1". */
function club(value: string | undefined | null) {
    return upper(String(value || '').replace(/\s+7s\b/i, '').replace(/["“”]/g, '').replace(/\s+/g, ' '));
}

function spacedWidth(ctx: Ctx, value: string, spacing: number) {
    if (!spacing) return ctx.measureText(value).width;
    let w = 0;
    for (const ch of value) w += ctx.measureText(ch).width + spacing;
    return w - spacing;
}

/** Ancho que ocupa un texto con esa fuente y ese espaciado. */
function measure(ctx: Ctx, value: string, font: string, spacing = 0) {
    ctx.font = font;
    return spacedWidth(ctx, value, spacing);
}

/**
 * Texto centrado en `cy` por el dibujo real de las mayúsculas. Si pasa de
 * `maxWidth` se angosta (no se achica): así la altura de la línea se mantiene.
 * Devuelve el ancho dibujado.
 */
function text(
    ctx: Ctx, value: string, x: number, cy: number, font: string, color: string,
    align: 'left' | 'center' | 'right' = 'left', spacing = 0, maxWidth = 0,
): number {
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
    return w * scale;
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

/** Escudo suelto sobre el negro; sin escudo, las iniciales en un círculo fino. */
function crest(ctx: Ctx, img: HTMLImageElement | null, name: string, x: number, y: number, s: number) {
    if (img) {
        containImage(ctx, img, x, y, s, s);
        return;
    }
    ctx.save();
    ctx.strokeStyle = RULE;
    ctx.lineWidth = Math.max(2, s * 0.03);
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text(ctx, initials(name), x + s / 2, y + s / 2, `${Math.round(s * 0.34)}px ${SERIF}`, RED, 'center');
}

async function loadAll(o: Pava7DrawOptions, urls: Array<string | null | undefined>) {
    const map = new Map<string, HTMLImageElement | null>();
    await Promise.all(urls.map(async (url) => {
        if (url && !map.has(url)) map.set(url, await o.loadImage(url));
    }));
    return (url: string | null | undefined) => (url ? map.get(url) ?? null : null);
}

/** Azar sembrado: el grano y el humo caen siempre igual. */
function seeded(seed: number) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------------------------------------------------------------------------
// Fondo: negro con grano, humo rojo y escudo abajo a la derecha, destello arriba

function grain(ctx: Ctx, W: number, H: number) {
    const tile = document.createElement('canvas');
    tile.width = 256;
    tile.height = 256;
    const g = tile.getContext('2d');
    if (!g) return;
    const img = g.createImageData(256, 256);
    const rnd = seeded(7);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(rnd() * 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = Math.floor(rnd() * 26);
    }
    g.putImageData(img, 0, 0);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

function smoke(ctx: Ctx, cx: number, cy: number, r: number, alpha: number) {
    const rnd = seeded(31);
    for (let i = 0; i < 7; i++) {
        const x = cx + (rnd() - 0.5) * r * 0.9;
        const y = cy + (rnd() - 0.5) * r * 0.7;
        const rr = r * (0.45 + rnd() * 0.5);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rr);
        grad.addColorStop(0, `rgba(200, 44, 30, ${alpha})`);
        grad.addColorStop(0.55, `rgba(150, 28, 18, ${alpha * 0.45})`);
        grad.addColorStop(1, 'rgba(120, 20, 12, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
}

/** Destello de la esquina: rayos finos que salen de un punto. */
function starburst(ctx: Ctx, x: number, y: number, len: number) {
    const rays = [
        [200, 1], [214, 0.55], [228, 0.8], [246, 0.45], [262, 0.9], [118, 0.5], [138, 0.7], [160, 0.35], [180, 0.6],
    ];
    ctx.save();
    ctx.fillStyle = RED;
    for (const [deg, f] of rays) {
        const a = (deg * Math.PI) / 180;
        const l = len * f;
        const w = Math.max(2, len * 0.012);
        const nx = Math.cos(a + Math.PI / 2) * w;
        const ny = Math.sin(a + Math.PI / 2) * w;
        ctx.beginPath();
        ctx.moveTo(x + nx, y + ny);
        ctx.lineTo(x - nx, y - ny);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

/** Chispa de cuatro puntas. */
function sparkle(ctx: Ctx, x: number, y: number, r: number) {
    ctx.save();
    ctx.fillStyle = RED;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.16;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

type Frame = { W: number; H: number; L: number; R: number; story: boolean; top: number; bottom: number };

/**
 * Fondo, encabezado (rótulo + título rojo + bajada) y pie con los escudos del torneo
 * y del club. Devuelve el área libre entre los dos.
 */
async function frame(
    ctx: Ctx, canvas: HTMLCanvasElement, o: Pava7DrawOptions,
    head: { title: string; sub?: string; titleScale?: number },
): Promise<Frame> {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const L = 64, R = W - 64;
    const [pava, cac] = await Promise.all([o.loadImage(PAVA_LOGO), o.loadImage(CAC_CREST)]);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Escudo del torneo, grande y apagado, abajo a la derecha, entre el humo.
    smoke(ctx, W * 0.8, H * 0.72, W * 0.6, 0.24);
    if (pava) {
        const s = W * 0.62;
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.translate(W * 0.76, H * 0.66);
        ctx.rotate(-0.08);
        containImage(ctx, pava, -s / 2, -s / 2, s, s);
        ctx.restore();
    }
    smoke(ctx, W * 0.92, H * 0.9, W * 0.36, 0.14);
    grain(ctx, W, H);

    starburst(ctx, W + 6, 96, story ? 210 : 180);
    // La chispa va a la altura del rótulo: más abajo choca con los títulos largos.
    sparkle(ctx, W - 250, story ? 112 : 68, story ? 24 : 20);

    // Encabezado.
    const top0 = story ? 120 : 74;
    text(ctx, KICKER, L, top0, `600 ${story ? 27 : 24}px ${COND}`, CREAM, 'left', story ? 6 : 5, R - L - 150);
    const titleSize = Math.round((story ? 168 : 138) * (head.titleScale ?? 1));
    const titleCy = top0 + 26 + titleSize * 0.44;
    text(ctx, upper(head.title), L - 4, titleCy, `${titleSize}px ${SERIF}`, RED, 'left', 1, R - L);
    let top = titleCy + titleSize * 0.42;
    if (head.sub) {
        const subCy = top + (story ? 40 : 32);
        text(ctx, upper(head.sub), L, subCy, `500 ${story ? 30 : 26}px ${COND}`, CREAM, 'left', story ? 4 : 3.5, R - L);
        top = subCy + 20;
    }

    // Pie: los dos escudos, el nombre del club y la firma de G22.
    const footH = story ? 104 : 86;
    const footY = H - (story ? 70 : 46) - footH;
    let fx = L;
    if (pava) { containImage(ctx, pava, fx, footY, footH * 0.78, footH); fx += footH * 0.78 + 16; }
    if (cac) { containImage(ctx, cac, fx, footY, footH, footH); fx += footH + 26; }
    text(ctx, 'CORDOBA ATHLETIC CLUB', fx, footY + footH / 2, `500 ${story ? 25 : 22}px ${COND}`, CREAM, 'left', story ? 5 : 4.5, R - fx - 180);
    text(ctx, 'POTENCIADO POR', R, footY + footH / 2 - 15, `500 ${story ? 15 : 13}px ${COND}`, MUTED, 'right', 2.5);
    text(ctx, 'G22 SCORES', R, footY + footH / 2 + 12, `700 ${story ? 24 : 21}px ${COND}`, CREAM, 'right', 2.5);

    return { W, H, L, R, story, top: top + (story ? 40 : 26), bottom: footY - (story ? 44 : 28) };
}

/**
 * Cabecera de bloque, como "VIERNES 27/11 ———": primera parte crema, la última
 * palabra en rojo y una raya fina hasta el borde.
 */
function sectionHead(ctx: Ctx, label: string, x: number, cy: number, right: number, size: number) {
    const words = upper(label).split(/\s+/).filter(Boolean);
    const last = words.length > 1 ? words.pop()! : '';
    const first = words.join(' ');
    const font = `${size}px ${SERIF}`;
    let cx = x;
    cx += text(ctx, first, cx, cy, font, CREAM, 'left', 1, (right - x) * 0.7);
    if (last) cx += text(ctx, ` ${last}`, cx, cy, font, RED, 'left', 1);
    const gap = size * 0.5;
    if (cx + gap < right - 20) {
        ctx.fillStyle = RULE;
        ctx.fillRect(cx + gap, cy - 1, right - cx - gap, 2);
    }
}

/** Banda roja con texto negro: el "FIESTA DEL SEVEN" del cronograma. */
function highlight(ctx: Ctx, label: string, x: number, cy: number, w: number, h: number, align: 'left' | 'center' = 'left') {
    ctx.fillStyle = RED;
    ctx.fillRect(x, cy - h / 2, w, h);
    const size = Math.round(h * 0.52);
    const tx = align === 'center' ? x + w / 2 : x + h * 0.4;
    text(ctx, upper(label), tx, cy, `600 ${size}px ${COND}`, BG, align, size * 0.1, w - h * 0.8);
}

/** La hora sola: el horario del día a veces trae la fecha pegada ("20:00 27/11"). */
function hourOf(raw: string | undefined | null): string {
    const m = String(raw || '').match(/\d{1,2}:\d{2}/);
    return m ? m[0] : String(raw || '').trim();
}

/** Pasa "Viernes 27 de noviembre" a "VIERNES 27/11", como en el cronograma. */
function dayLabel(raw: string): string {
    const v = upper(raw).replace(/,/g, '');
    const m = v.match(/^([A-ZÁÉÍÓÚ]+)\s+(\d{1,2})(?:\s+DE)?\s+([A-ZÁÉÍÓÚ]+)/);
    const months: Record<string, string> = {
        ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04', MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
        SEPTIEMBRE: '09', SETIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
    };
    if (m && months[m[3]]) return `${m[1]} ${m[2]}/${months[m[3]]}`;
    return v;
}

// ---------------------------------------------------------------------------
// Partido: marcador en filas, como dos renglones del cronograma

async function drawMatch(ctx: Ctx, canvas: HTMLCanvasElement, data: O7MatchData, o: Pava7DrawOptions) {
    const scheduled = data.status === 'scheduled' || data.homeScore == null || data.awayScore == null;
    const live = data.status === 'live';
    const f = await frame(ctx, canvas, o, {
        title: scheduled ? 'Partido' : live ? 'En vivo' : 'Resultado',
        sub: [data.date, data.venue].filter((v) => v && !/por definir|a confirmar/i.test(v)).join(' · '),
    });
    const { L, R, story } = f;
    const logo = await loadAll(o, [data.homeLogo, data.awayLogo]);

    const stage = upper(data.roundLabel) || upper(data.tournament);
    const headSize = story ? 62 : 50;
    let y = f.top + headSize / 2;
    sectionHead(ctx, stage || 'SEVEN', L, y, R, headSize);
    y += headSize / 2 + (story ? 60 : 34);

    const rows = [
        { name: data.homeTeam, logo: data.homeLogo, score: data.homeScore },
        { name: data.awayTeam, logo: data.awayLogo, score: data.awayScore },
    ];
    const home = data.homeScore ?? 0, away = data.awayScore ?? 0;
    const winner = scheduled || home === away ? -1 : home > away ? 0 : 1;

    const bandH = story ? 92 : 74;
    const timeH = scheduled ? (story ? 260 : 170) : 0;
    const afterRows = story ? 40 : 22;
    const afterTime = scheduled ? (story ? 30 : 18) : 0;
    const avail = f.bottom - y - bandH - timeH - afterRows - afterTime;
    const rowH = Math.min(story ? 400 : 320, avail / 2);
    // Lo que sobra se reparte arriba y abajo: el bloque queda centrado en vez de pegado al título.
    y += Math.max(0, (avail - rowH * 2) / 2);
    const s = Math.min(rowH * 0.78, story ? 230 : 240);
    const tlX = L + s + 36;

    // Línea de tiempo entre los dos clubes.
    ctx.fillStyle = RED;
    ctx.fillRect(tlX - 2, y + rowH / 2, 4, rowH);

    rows.forEach((r, i) => {
        const ry = y + i * rowH;
        const cy = ry + rowH / 2;
        ctx.globalAlpha = winner >= 0 && winner !== i ? 0.5 : 1;
        crest(ctx, logo(r.logo), r.name, L, cy - s / 2, s);
        ctx.globalAlpha = 1;
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.arc(tlX, cy, story ? 12 : 10, 0, Math.PI * 2);
        ctx.fill();
        const lost = winner >= 0 && winner !== i;
        const scoreSize = story ? 210 : 170;
        const scoreW = scheduled ? 0 : measure(ctx, String(r.score ?? 0), `${scoreSize}px ${SERIF}`) + 30;
        // El nombre primero se achica (hasta 62 %) y recién después se angosta: un nombre
        // largo comprimido al 50 % se vuelve ilegible.
        const nameMax = R - tlX - 34 - scoreW;
        const nominal = story ? 64 : 52;
        const nameW = measure(ctx, club(r.name), `600 ${nominal}px ${COND}`, 2);
        const nameSize = Math.round(Math.max(nominal * 0.62, Math.min(nominal, (nominal * nameMax) / nameW)));
        ctx.globalAlpha = lost ? 0.55 : 1;
        text(ctx, club(r.name), tlX + 34, cy, `600 ${nameSize}px ${COND}`, CREAM, 'left', 2, nameMax);
        ctx.globalAlpha = 1;
        if (!scheduled) {
            if (lost) {
                // El que pierde va en contorno: el rojo lleno se perdía contra el humo y el escudo de fondo.
                ctx.font = `${scoreSize}px ${SERIF}`;
                const m = ctx.measureText('H');
                ctx.textAlign = 'right';
                ctx.textBaseline = 'alphabetic';
                ctx.lineWidth = story ? 4 : 3.5;
                ctx.strokeStyle = RED;
                ctx.strokeText(String(r.score ?? 0), R, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
                ctx.textAlign = 'left';
            } else {
                text(ctx, String(r.score ?? 0), R, cy, `${scoreSize}px ${SERIF}`, RED, 'right');
            }
        }
    });
    y += rowH * 2 + afterRows;

    if (scheduled) {
        const t = hourOf(data.time) || 'A CONFIRMAR';
        const size = story ? 200 : 150;
        const cy = y + timeH / 2;
        const w = text(ctx, t, L - 4, cy, `${size}px ${SERIF}`, RED, 'left');
        if (/\d/.test(t)) text(ctx, 'HS', L + w + 16, cy + size * 0.22, `600 ${Math.round(size * 0.2)}px ${COND}`, RED, 'left', 2);
        y += timeH + afterTime;
    }
    highlight(ctx, scheduled ? 'Seven Nocturno de la Pava' : live ? 'En juego' : 'Final del partido', L, y + bandH / 2, R - L, bandH);
}

// ---------------------------------------------------------------------------
// Horarios del día: el cronograma tal cual, un partido por renglón

async function drawDaily(ctx: Ctx, canvas: HTMLCanvasElement, data: O7DailyData, o: Pava7DrawOptions) {
    const matches = data.matches || [];
    // Con marcador (jugado o en juego) la pieza es de RESULTADOS y el tanteador va entre los equipos.
    const hasScore = (m: (typeof matches)[number]) => m.status !== 'scheduled' && m.homeScore != null && m.awayScore != null;
    const results = matches.some(hasScore);
    const f = await frame(ctx, canvas, o, { title: results ? 'Resultados' : 'Cronograma', sub: data.tournament || KICKER });
    const { L, R, story } = f;
    const logo = await loadAll(o, matches.flatMap((m) => [m.homeLogo, m.awayLogo]));

    // Bloques por día: si los partidos traen su fecha se agrupan, si no va uno solo.
    const blocks: Array<{ label: string; items: typeof matches }> = [];
    for (const m of matches) {
        const label = dayLabel(m.dateLabel || data.date);
        const last = blocks[blocks.length - 1];
        if (last && last.label === label) last.items.push(m);
        else blocks.push({ label, items: [m] });
    }
    if (!blocks.length) blocks.push({ label: dayLabel(data.date), items: [] });

    const headSize = story ? 60 : 48;
    const headGap = story ? 34 : 22;
    const blockGap = story ? 44 : 26;
    const n = Math.max(1, matches.length);
    const fixed = blocks.length * (headSize + headGap) + (blocks.length - 1) * blockGap;
    const rowH = Math.max(40, Math.min(story ? 128 : 92, (f.bottom - f.top - fixed) / n));
    const timeSize = Math.round(Math.min(story ? 76 : 60, rowH * 0.66));
    const timeColW = measure(ctx, '00:00', `${timeSize}px ${SERIF}`) + timeSize * 0.62;
    const tlX = L + timeColW + 22;
    const textX = tlX + 34;
    const s = Math.round(rowH * 0.62);

    let y = f.top;
    for (const block of blocks) {
        sectionHead(ctx, block.label, L, y + headSize / 2, R, headSize);
        y += headSize + headGap;
        const first = y + rowH / 2;
        if (block.items.length > 1) {
            ctx.fillStyle = RED;
            ctx.fillRect(tlX - 1.5, first, 3, rowH * (block.items.length - 1));
        }
        block.items.forEach((m, i) => {
            const cy = y + i * rowH + rowH / 2;
            const scored = hasScore(m);
            const played = scored && m.status === 'finished';
            // Los resultados traen solo la fecha (que ya está en el encabezado del día): sin hora,
            // la columna dice el estado.
            const hour = /\d{1,2}:\d{2}/.test(String(m.time || '')) ? hourOf(m.time) : '';
            const stateLabel = played ? 'FIN' : m.status === 'live' ? 'VIVO' : 'HS';
            const big = hour || (stateLabel === 'HS' ? '--:--' : stateLabel);
            const bw = text(ctx, big, L, cy, `${timeSize}px ${SERIF}`, RED, 'left', 0, timeColW - timeSize * 0.5);
            if (hour || stateLabel === 'HS') {
                text(ctx, stateLabel, L + bw + 8, cy + timeSize * 0.2, `600 ${Math.round(timeSize * 0.22)}px ${COND}`, RED, 'left', 1.5);
            }
            ctx.fillStyle = RED;
            ctx.beginPath();
            ctx.arc(tlX, cy, Math.max(6, rowH * 0.085), 0, Math.PI * 2);
            ctx.fill();

            // Escudo · NOMBRE  vs  NOMBRE · escudo
            const nameFont = `500 ${Math.round(Math.min(story ? 40 : 32, rowH * 0.36))}px ${COND}`;
            const mid = scored ? `${m.homeScore} - ${m.awayScore}` : 'VS';
            const vsFont = scored
                ? `${Math.round(Math.min(story ? 50 : 40, rowH * 0.46))}px ${SERIF}`
                : `600 ${Math.round(Math.min(story ? 24 : 20, rowH * 0.22))}px ${COND}`;
            const avail = R - textX;
            const vsW = measure(ctx, mid, vsFont, scored ? 0 : 2) + 28;
            const nameMax = (avail - vsW - (s + 14) * 2) / 2;
            const homeWin = played && (m.homeScore as number) > (m.awayScore as number);
            const awayWin = played && (m.awayScore as number) > (m.homeScore as number);
            let x = textX;
            crest(ctx, logo(m.homeLogo), m.homeTeam, x, cy - s / 2, s);
            x += s + 14;
            ctx.globalAlpha = awayWin ? 0.5 : 1;
            x += text(ctx, club(m.homeTeam), x, cy, nameFont, CREAM, 'left', 2, nameMax);
            ctx.globalAlpha = 1;
            text(ctx, mid, x + 14, cy, vsFont, RED, 'left', scored ? 0 : 2);
            x += vsW;
            ctx.globalAlpha = homeWin ? 0.5 : 1;
            x += text(ctx, club(m.awayTeam), x, cy, nameFont, CREAM, 'left', 2, nameMax);
            ctx.globalAlpha = 1;
            crest(ctx, logo(m.awayLogo), m.awayTeam, x + 14, cy - s / 2, s);
        });
        y += rowH * block.items.length + blockGap;
    }
}

// ---------------------------------------------------------------------------
// Tabla de posiciones: una o todas las zonas

type StandRow = O7StandingsData['rows'][number] & { won?: number | string; lost?: number | string };

async function drawStandings(ctx: Ctx, canvas: HTMLCanvasElement, data: O7StandingsData, o: Pava7DrawOptions) {
    const zones: Array<{ name: string; rows: StandRow[] }> = data.groups && data.groups.length > 0
        ? data.groups.map((g) => ({ name: g.name, rows: g.rows as StandRow[] }))
        : [{ name: data.subtitle || 'Zona', rows: data.rows as StandRow[] }];
    const f = await frame(ctx, canvas, o, { title: 'Posiciones', sub: data.title || KICKER });
    const { L, R, story } = f;
    const logo = await loadAll(o, zones.flatMap((z) => z.rows.map((r) => r.teamLogo)));
    const single = zones.length === 1;

    const headSize = single ? (story ? 62 : 52) : story ? 50 : 40;
    const colHead = story ? 40 : 30;
    const zoneGap = story ? 40 : 22;
    const totalRows = zones.reduce((a, z) => a + z.rows.length, 0);
    const fixed = zones.length * (headSize + 14 + colHead) + (zones.length - 1) * zoneGap;
    const rowH = Math.min(single ? (story ? 130 : 104) : story ? 96 : 66, (f.bottom - f.top - fixed) / Math.max(1, totalRows));
    const s = Math.round(rowH * 0.66);
    const numSize = Math.round(Math.min(story ? 40 : 34, rowH * 0.42));

    const cols = ['PJ', 'G', 'P', 'DIF', 'PTS'];
    const colW = [74, 64, 64, 96, 118].map((w) => w * (story ? 1.05 : 0.95));
    const colsW = colW.reduce((a, b) => a + b, 0);

    let y = f.top;
    for (const zone of zones) {
        sectionHead(ctx, zone.name, L, y + headSize / 2, R, headSize);
        y += headSize + 14;
        let cx = R - colsW;
        cols.forEach((c, i) => {
            text(ctx, c, cx + colW[i] / 2, y + colHead / 2, `600 ${story ? 22 : 18}px ${COND}`, MUTED, 'center', 3);
            cx += colW[i];
        });
        y += colHead;

        zone.rows.forEach((r, i) => {
            const ry = y + i * rowH;
            const cy = ry + rowH / 2;
            if (i > 0) {
                ctx.fillStyle = 'rgba(239,231,218,0.09)';
                ctx.fillRect(L, ry, R - L, 1);
            }
            text(ctx, String(r.pos), L + 26, cy, `${Math.round(numSize * 1.25)}px ${SERIF}`, RED, 'center');
            crest(ctx, logo(r.teamLogo), r.team, L + 64, cy - s / 2, s);
            const nameX = L + 64 + s + 18;
            text(ctx, club(r.team), nameX, cy, `500 ${numSize}px ${COND}`, CREAM, 'left', 1.5, R - colsW - nameX - 10);
            const values = [String(r.played), String(r.won ?? ''), String(r.lost ?? ''), String(r.diff), String(r.points)];
            let vx = R - colsW;
            values.forEach((v, j) => {
                const pts = j === values.length - 1;
                text(ctx, v, vx + colW[j] / 2, cy, pts ? `${Math.round(numSize * 1.3)}px ${SERIF}` : `500 ${numSize}px ${COND}`, pts ? RED : CREAM, 'center');
                vx += colW[j];
            });
        });
        y += rowH * zone.rows.length + zoneGap;
    }
}

// ---------------------------------------------------------------------------
// Cuadro: las últimas rondas como bloques del cronograma; la final con banda roja

async function drawBracket(ctx: Ctx, canvas: HTMLCanvasElement, data: O7BracketData, o: Pava7DrawOptions) {
    const rounds = data.rounds
        .filter((r) => r.matches && r.matches.length)
        .slice(-3)
        .map((r) => ({ name: r.name || r.round_name || r.ROUND_NAME || 'Ronda', matches: r.matches.map(readBracketMatch) }));
    const f = await frame(ctx, canvas, o, { title: 'Finales', sub: data.title || KICKER });
    const { L, R, story } = f;
    const logo = await loadAll(o, rounds.flatMap((r) => r.matches.flatMap((m) => [m.a?.logo, m.b?.logo])));

    const headSize = story ? 54 : 44;
    const headGap = story ? 22 : 14;
    const roundGap = story ? 40 : 22;
    const matchGap = story ? 22 : 12;
    const nMatches = rounds.reduce((a, r) => a + r.matches.length, 0);
    const fixed = rounds.length * (headSize + headGap) + (rounds.length - 1) * roundGap + Math.max(0, nMatches - rounds.length) * matchGap;
    const lineH = Math.min(story ? 104 : 80, (f.bottom - f.top - fixed) / Math.max(1, nMatches * 2));
    const s = Math.round(lineH * 0.72);
    const nameSize = Math.round(Math.min(story ? 44 : 36, lineH * 0.44));

    const side = (sl: BracketMatch['a'], cy: number, played: boolean) => {
        const name = sl?.name || 'A definir';
        ctx.globalAlpha = sl?.lost ? 0.5 : sl ? 1 : 0.6;
        if (sl) crest(ctx, logo(sl.logo), name, L + 46, cy - s / 2, s);
        text(ctx, club(name), L + 46 + s + 20, cy, `${sl?.win ? 600 : 500} ${nameSize}px ${COND}`, sl ? CREAM : MUTED, 'left', 1.5, R - L - s - 220);
        if (played && sl?.score != null) text(ctx, String(sl.score), R, cy, `${Math.round(lineH * 0.78)}px ${SERIF}`, RED, 'right');
        ctx.globalAlpha = 1;
    };

    let y = f.top;
    rounds.forEach((round, ri) => {
        const isFinal = ri === rounds.length - 1;
        if (isFinal && /final/i.test(round.name) && !/semi|cuart|octav/i.test(round.name)) {
            highlight(ctx, round.name, L, y + headSize / 2, R - L, headSize * 1.1);
        } else {
            sectionHead(ctx, round.name, L, y + headSize / 2, R, headSize);
        }
        y += headSize + headGap;
        round.matches.forEach((m, mi) => {
            const top = y;
            ctx.fillStyle = RED;
            ctx.fillRect(L + 12, top + lineH / 2, 3, lineH);
            [top + lineH / 2, top + lineH * 1.5].forEach((cy) => {
                ctx.beginPath();
                ctx.arc(L + 13.5, cy, Math.max(6, lineH * 0.09), 0, Math.PI * 2);
                ctx.fill();
            });
            side(m.a, top + lineH / 2, m.played);
            side(m.b, top + lineH * 1.5, m.played);
            if (!m.played && m.when) {
                text(ctx, m.when, R, top + lineH, `${Math.round(lineH * 0.6)}px ${SERIF}`, RED, 'right');
            }
            y += lineH * 2 + (mi < round.matches.length - 1 ? matchGap : 0);
        });
        y += roundGap;
    });
}

// ---------------------------------------------------------------------------
// Campeón: el título enorme, el escudo entre el humo y la banda roja con la copa

async function drawChampion(ctx: Ctx, canvas: HTMLCanvasElement, data: O7ChampionData, o: Pava7DrawOptions) {
    const headline = upper(data.headline) || 'CAMPEÓN';
    const f = await frame(ctx, canvas, o, { title: headline, sub: data.season ? `Edición ${data.season}` : KICKER, titleScale: headline.length > 9 ? 0.8 : 1.05 });
    const { W, L, R, story } = f;
    const img = data.club.logo ? await o.loadImage(data.club.logo) : null;

    const bandH = story ? 92 : 74;
    const nameSize = story ? 84 : 66;
    const s = Math.min(story ? 720 : 560, f.bottom - f.top - bandH - nameSize - (story ? 120 : 70));
    const cx = W / 2;
    const cy = f.top + (story ? 130 : 14) + s / 2;

    // Halo rojo y dos chispas alrededor del escudo.
    const halo = ctx.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.8);
    halo.addColorStop(0, 'rgba(224, 64, 46, 0.45)');
    halo.addColorStop(1, 'rgba(224, 64, 46, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
    sparkle(ctx, cx - s * 0.56, cy - s * 0.4, story ? 34 : 28);
    sparkle(ctx, cx + s * 0.58, cy + s * 0.32, story ? 22 : 18);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    crest(ctx, img, data.club.name, cx - s / 2, cy - s / 2, s);
    ctx.restore();

    let y = cy + s / 2 + (story ? 70 : 46);
    text(ctx, club(data.club.name), cx, y, `600 ${nameSize}px ${COND}`, CREAM, 'center', story ? 4 : 3, R - L);
    y += nameSize / 2 + (story ? 54 : 34) + bandH / 2;
    const comp = upper(data.tag) || upper(data.tournament) || KICKER;
    highlight(ctx, comp, L, y, R - L, bandH, 'center');
    ctx.fillStyle = RED_DEEP;
    ctx.fillRect(L, y + bandH / 2, R - L, 4);
}

// ---------------------------------------------------------------------------
// Punto de entrada

export async function drawPava7(ctx: Ctx, canvas: HTMLCanvasElement, template: Pava7Template, data: unknown, o: Pava7DrawOptions) {
    await ensurePavaFonts();
    ctx.save();
    try {
        ctx.filter = 'none';
        if (template === 'matchStats') await drawMatch(ctx, canvas, data as O7MatchData, o);
        else if (template === 'dailyMatches') await drawDaily(ctx, canvas, data as O7DailyData, o);
        else if (template === 'standings') await drawStandings(ctx, canvas, data as O7StandingsData, o);
        else if (template === 'playoffBracket') await drawBracket(ctx, canvas, data as O7BracketData, o);
        else await drawChampion(ctx, canvas, data as O7ChampionData, o);
    } finally {
        ctx.restore();
    }
}
