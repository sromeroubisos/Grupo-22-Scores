// Diseño propio del Seven de Olivos (cuenta Olivos 7). Lo usan SOLO sus tres
// torneos —Nocturno, Primeras Líneas y M19—, cada uno con su color y su logo.
// Las piezas son las que aprobó la cuenta en maqueta: resultado y horario de un
// partido (afiche de papel), fixture/resultados de la fecha, posiciones y cuadro
// (negro con columna de color) y campeón (la palabra repetida con papelitos).
// Todas salen en posteo (1080x1350) y en historia (1080x1920): la historia es la
// misma pieza corrida hacia el centro, con la firma del Seven arriba.
//
// No importa nada de ExportImage: las imágenes llegan por `loadImage`, así este
// archivo no arma un ciclo con un componente de 23 mil líneas.

export type Olivos7EditionId = 'nocturno' | 'primeras' | 'm19';

export type Olivos7Edition = {
    id: Olivos7EditionId;
    name: string;          // SEVEN NOCTURNO
    edition: string;       // 48ª EDICIÓN
    category: string;      // MAYORES
    accent: string;
    accentInk: string;     // texto sobre el acento
    logo: string;
    mark: string;
};

const EDITIONS: Record<Olivos7EditionId, Olivos7Edition> = {
    nocturno: { id: 'nocturno', name: 'SEVEN NOCTURNO', edition: '48ª EDICIÓN', category: 'MAYORES', accent: '#f47b20', accentInk: '#0d0d0d', logo: '/exports/olivos7/nocturno-logo.png', mark: '/exports/olivos7/nocturno-mark.png' },
    primeras: { id: 'primeras', name: 'SEVEN PRIMERAS LÍNEAS', edition: '18ª EDICIÓN', category: 'PRIMERAS LÍNEAS', accent: '#19a354', accentInk: '#0d0d0d', logo: '/exports/olivos7/primeras-logo.png', mark: '/exports/olivos7/primeras-mark.png' },
    m19: { id: 'm19', name: 'SEVEN M19', edition: '2ª EDICIÓN', category: 'M19', accent: '#c026f0', accentInk: '#ffffff', logo: '/exports/olivos7/m19-logo.png', mark: '/exports/olivos7/m19-mark.png' },
};

// Ids de la base (tournaments.id). El torneo "Gordos" es el Seven de Primeras Líneas.
const TOURNAMENT_EDITIONS: Record<string, Olivos7EditionId> = {
    '76f8e78e-b1c2-4944-a22e-7f232bd8ed8e': 'nocturno',
    '1b6a1d0a-d6e7-4476-bf58-8ed88f22d002': 'primeras',
    '1ff655d8-074a-42c5-8fa9-73727493f9d3': 'm19',
    // La página del torneo también se abre por slug.
    'seven-de-olivos-2026': 'nocturno',
    'seven-de-olivos-gordos-2026': 'primeras',
    'seven-de-olivos-m19-2026': 'm19',
};

// Solo la cuenta del Seven exporta con este diseño: es la pieza de su marca, no
// una plantilla del torneo para cualquiera que entre a exportar.
const OLIVOS7_ACCOUNTS = new Set(['olivosseven@gmail.com']);

export function canUseOlivos7(email: string | null | undefined): boolean {
    return Boolean(email) && OLIVOS7_ACCOUNTS.has(String(email).trim().toLowerCase());
}

export function resolveOlivos7Edition(tournamentId: string | number | null | undefined): Olivos7Edition | null {
    if (tournamentId == null) return null;
    const key = String(tournamentId).trim().toLowerCase();
    const id = TOURNAMENT_EDITIONS[key];
    return id ? EDITIONS[id] : null;
}

export const OLIVOS7_TEMPLATES = ['matchStats', 'dailyMatches', 'standings', 'playoffBracket', 'champion'] as const;
export type Olivos7Template = (typeof OLIVOS7_TEMPLATES)[number];

export function isOlivos7Template(template: string): template is Olivos7Template {
    return (OLIVOS7_TEMPLATES as readonly string[]).includes(template);
}

// Formas mínimas de los datos. Son subconjuntos de los tipos de ExportImage: el
// componente le pasa sus objetos tal cual.
type DateValue = string | number | Date;

export type O7MatchData = {
    status?: 'scheduled' | 'live' | 'final';
    homeTeam: string; awayTeam: string;
    homeScore: number | null; awayScore: number | null;
    homeLogo?: string; awayLogo?: string;
    tournament: string;
    roundLabel?: string;
    date: string; time?: string; venue?: string;
    kickoffAt?: DateValue | null;
};

export type O7DailyData = {
    date: string;
    tournament: string;
    matches: Array<{
        homeTeam: string; awayTeam: string;
        homeLogo?: string; awayLogo?: string;
        homeScore?: number; awayScore?: number;
        time: string;
        status: 'scheduled' | 'live' | 'finished';
        dateLabel?: string;
    }>;
};

type O7StandingsRow = {
    pos: number; team: string; teamLogo?: string;
    labelName?: string; zoneColor?: string;
    played: number | string; diff: string; points: number | string;
};
export type O7StandingsData = {
    title: string; subtitle: string;
    rows: O7StandingsRow[];
    groups?: Array<{ name: string; rows: O7StandingsRow[] }>;
};

type O7BracketSide = { name?: string; logo?: string; id?: string | number } | null | undefined;
type O7BracketParticipant = { participant_id?: string | number; participant_name?: string; image_path?: string } | null | undefined;
type O7BracketMatchRaw = {
    home_team?: O7BracketSide; away_team?: O7BracketSide;
    home_participant?: O7BracketParticipant; away_participant?: O7BracketParticipant;
    score_home?: number | string | null; score_away?: number | string | null;
    winner_id?: string | number | null;
    match_start_iso?: string | null;
};
type O7BracketRound = { name?: string; round_name?: string; ROUND_NAME?: string; matches: O7BracketMatchRaw[] };
export type O7BracketData = { title: string; subtitle?: string; rounds: O7BracketRound[] };

export type O7ChampionData = {
    club: { name: string; logo?: string | null };
    tournament: string; season?: string; tag?: string; headline?: string;
};

export type Olivos7DrawOptions = {
    edition: Olivos7Edition;
    loadImage: (url: string) => Promise<HTMLImageElement | null>;
};

// ---------------------------------------------------------------------------
// Paleta y tipografías

const INK = '#0d0d0d';
const INK2 = '#171717';
const INK3 = '#232323';
const LINE = '#2e2e2e';
const PAPER = '#f4efe6';
const MUTED = '#9a9a9a';
const OLIVOS_CREST = '/clubs/sb-olivos-r-c.png';
const G22_WORDMARK = '/exports/olivos7/g22-wordmark.png';

const ANTON = "'Anton', 'Bebas Neue', Impact, sans-serif";
const BARLOW = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const ARCHIVO = "'Archivo', 'Arial Black', sans-serif";
// Archivo al 125% de ancho: el lienzo no siempre respeta font-stretch, así que
// se dibuja con la Archivo normal estirada en horizontal.
const ARCHIVO_STRETCH = 1.25;

let fontsReady: Promise<void> | null = null;

export function ensureOlivos7Fonts(): Promise<void> {
    if (fontsReady) return fontsReady;
    fontsReady = (async () => {
        if (typeof document === 'undefined') return;
        const id = 'olivos7-export-fonts';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@800;900&family=Barlow+Condensed:wght@600;700;800&display=block';
            const loaded = new Promise<void>((resolve) => {
                link.onload = () => resolve();
                link.onerror = () => resolve();
                window.setTimeout(resolve, 4000);
            });
            document.head.appendChild(link);
            await loaded;
        }
        await Promise.all([
            `40px ${ANTON}`, `800 40px ${BARLOW}`, `700 40px ${BARLOW}`, `600 40px ${BARLOW}`, `900 40px ${ARCHIVO}`, `800 40px ${ARCHIVO}`,
        ].map((face) => document.fonts.load(face).catch(() => undefined)));
    })();
    return fontsReady;
}

// ---------------------------------------------------------------------------
// Utilidades de dibujo

type Ctx = CanvasRenderingContext2D;
type Align = 'left' | 'center' | 'right';

function isStory(canvas: HTMLCanvasElement) {
    return canvas.height > 1500;
}

// Texto con espaciado entre letras. `ctx.letterSpacing` no está en todos los
// navegadores; esto mide letra por letra y anda en todos.
function spacedWidth(ctx: Ctx, text: string, spacing: number) {
    if (!spacing) return ctx.measureText(text).width;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return w - spacing;
}

function drawSpaced(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: Align = 'left') {
    const w = spacedWidth(ctx, text, spacing);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    if (!spacing) {
        ctx.fillText(text, cx, y);
    } else {
        for (const ch of text) {
            ctx.fillText(ch, cx, y);
            cx += ctx.measureText(ch).width + spacing;
        }
    }
    ctx.textAlign = prev;
    return w;
}

// Achica la fuente hasta que el texto entra en `maxWidth`.
function fitFont(ctx: Ctx, text: string, build: (size: number) => string, size: number, maxWidth: number, spacing = 0, stretch = 1, min = 12) {
    let s = size;
    ctx.font = build(s);
    while (s > min && spacedWidth(ctx, text, spacing * (s / size)) * stretch > maxWidth) {
        s -= 2;
        ctx.font = build(s);
    }
    return s;
}

// Archivo estirada: escala en X alrededor del punto de anclaje.
function drawStretched(ctx: Ctx, text: string, x: number, y: number, align: Align, spacing = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ARCHIVO_STRETCH, 1);
    drawSpaced(ctx, text, 0, 0, spacing / ARCHIVO_STRETCH, align);
    ctx.restore();
}

// Centra el texto por el dibujo real de las letras, no por la caja de la fuente:
// la Anton tiene mucho aire arriba y con 'middle' los números quedan altos.
function fillCentered(ctx: Ctx, text: string, cx: number, cy: number) {
    const prevAlign = ctx.textAlign, prevBase = ctx.textBaseline;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const ascent = m.actualBoundingBoxAscent || 0, descent = m.actualBoundingBoxDescent || 0;
    ctx.fillText(text, cx, cy + (ascent - descent) / 2);
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBase;
}

function upper(text: string | undefined | null) {
    return (text ?? '').toLocaleUpperCase('es-AR').trim();
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function strokeRectInside(ctx: Ctx, x: number, y: number, w: number, h: number, width: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
}

// Escudo contenido en una caja, sin deformar.
function drawContain(ctx: Ctx, img: HTMLImageElement | null, cx: number, cy: number, size: number, alpha = 1) {
    if (!img || !img.naturalWidth) return;
    const r = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * r;
    const h = img.naturalHeight * r;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
}

function drawByHeight(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, h: number) {
    if (!img || !img.naturalWidth) return 0;
    const w = img.naturalWidth * (h / img.naturalHeight);
    ctx.drawImage(img, x, y, w, h);
    return w;
}

// Grano fino sembrado: la misma pieza sale igual siempre.
function drawGrain(ctx: Ctx, x0: number, y0: number, w: number, h: number, color: string, alpha: number, seed = 7) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    const n = Math.round((w * h) / 260);
    for (let i = 0; i < n; i++) ctx.fillRect(x0 + rnd() * w, y0 + rnd() * h, 1.4, 1.4);
    ctx.restore();
}

// Color de fondo de un club, sacado de su escudo: el tono saturado que más se repite.
function crestColor(img: HTMLImageElement | null, fallback: string): string {
    if (!img || !img.naturalWidth || typeof document === 'undefined') return fallback;
    try {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48;
        const x = c.getContext('2d', { willReadFrequently: true });
        if (!x) return fallback;
        x.drawImage(img, 0, 0, 48, 48);
        const { data } = x.getImageData(0, 0, 48, 48);
        const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 200) continue;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const l = (max + min) / 510;
            const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
            if (sat < 0.35 || l < 0.1 || l > 0.85) continue;
            const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
            const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
            bk.n++; bk.r += r; bk.g += g; bk.b += b;
            buckets.set(key, bk);
        }
        let best: { n: number; r: number; g: number; b: number } | null = null;
        for (const [, bk] of [...buckets.entries()].sort((p, q) => p[0].localeCompare(q[0]))) {
            if (!best || bk.n > best.n) best = bk;
        }
        if (!best) return fallback;
        // Un poco más oscuro, para que el escudo resalte encima.
        const k = 0.82 / best.n;
        return `rgb(${Math.round(best.r * k)}, ${Math.round(best.g * k)}, ${Math.round(best.b * k)})`;
    } catch {
        return fallback;
    }
}

function luminance(color: string) {
    const m = color.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// "Potenciado por G22 Scores". `pill`: sobre fondos con mucho movimiento va en
// una pastilla oscura. Devuelve el ancho que ocupó.
async function drawWatermark(ctx: Ctx, o: Olivos7DrawOptions, rightX: number, centerY: number, size: 'post' | 'story', color: string, pill = false) {
    const wm = await o.loadImage(G22_WORDMARK);
    const fs = size === 'story' ? 21 : 15;
    const ls = size === 'story' ? 4 : 3;
    const imgH = size === 'story' ? 44 : 30;
    const gap = size === 'story' ? 14 : 10;
    ctx.font = `800 ${fs}px ${BARLOW}`;
    const label = 'POTENCIADO POR';
    const tw = spacedWidth(ctx, label, ls);
    const iw = wm ? wm.naturalWidth * (imgH / wm.naturalHeight) : 120;
    const total = tw + gap + iw;
    if (pill) {
        const px = size === 'story' ? 16 : 14, py = size === 'story' ? 12 : 8;
        rect(ctx, rightX - total - px * 2, centerY - imgH / 2 - py, total + px * 2, imgH + py * 2, 'rgba(13,13,13,0.78)');
        rightX -= px;
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs}px ${BARLOW}`;
    drawSpaced(ctx, label, rightX - total, centerY + 1, ls);
    if (wm) ctx.drawImage(wm, rightX - iw, centerY - imgH / 2, iw, imgH);
    ctx.textBaseline = 'alphabetic';
    return total;
}

// Firma del Seven arriba de las historias de las placas negras.
async function drawStorySignature(ctx: Ctx, o: Olivos7DrawOptions, y: number) {
    const mark = await o.loadImage(o.edition.mark);
    ctx.font = `46px ${ANTON}`;
    const nameW = ctx.measureText(o.edition.name).width;
    ctx.font = `800 19px ${BARLOW}`;
    const subText = `${o.edition.edition} · OLIVOS RC`;
    const subW = spacedWidth(ctx, subText, 5);
    const markW = mark ? mark.naturalWidth * (92 / mark.naturalHeight) : 0;
    const total = markW + 18 + Math.max(nameW, subW);
    let x = 540 - total / 2;
    drawByHeight(ctx, mark, x, y, 92);
    x += markW + 18;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PAPER;
    ctx.font = `46px ${ANTON}`;
    ctx.fillText(o.edition.name, x, y + 52);
    ctx.globalAlpha = 0.75;
    ctx.font = `800 19px ${BARLOW}`;
    drawSpaced(ctx, subText, x, y + 78, 5);
    ctx.globalAlpha = 1;
}

function formatKickoff(value: DateValue | null | undefined) {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const tz = 'America/Argentina/Buenos_Aires';
    const day = upper(d.toLocaleDateString('es-AR', { weekday: 'long', timeZone: tz }));
    const num = d.toLocaleDateString('es-AR', { day: 'numeric', timeZone: tz });
    const monthNum = d.toLocaleDateString('es-AR', { month: '2-digit', timeZone: tz });
    const month = upper(d.toLocaleDateString('es-AR', { month: 'long', timeZone: tz }));
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    return { day, num, month, monthNum, time, long: `${day} ${num} DE ${month}` };
}

function shortName(name: string) {
    return upper(name).replace(/\s+(RUGBY CLUB|R\.?\s?C\.?|CLUB)$/, '').trim() || upper(name);
}

// ---------------------------------------------------------------------------
// 1. Partido: resultado y horario (afiche de papel)

function drawPaper(ctx: Ctx, w: number, h: number) {
    const g = ctx.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, Math.max(w, h) * 0.95);
    g.addColorStop(0, '#f3f2ee');
    g.addColorStop(1, '#dedcd6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Pliegues del papel
    const folds: Array<[number, number, number, number, string]> = [
        [w * 0.22, 0, w * 0.62, h, 'rgba(0,0,0,0.05)'],
        [w * 0.9, 0, w * 0.35, h, 'rgba(255,255,255,0.7)'],
        [0, h * 0.68, w, h * 0.8, 'rgba(0,0,0,0.05)'],
        [0, h * 0.22, w, h * 0.12, 'rgba(0,0,0,0.04)'],
    ];
    ctx.lineWidth = 2;
    for (const [x1, y1, x2, y2, c] of folds) {
        ctx.strokeStyle = c;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    drawGrain(ctx, 0, 0, w, h, '#000', 0.08, 11);
}

export async function drawOlivos7Match(ctx: Ctx, canvas: HTMLCanvasElement, data: O7MatchData, o: Olivos7DrawOptions) {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const oy = story ? 285 : 0;
    const scheduled = data.status === 'scheduled' || data.homeScore == null || data.awayScore == null;
    const accent = o.edition.accent;
    const cream = '#e9e5dc';

    const [homeImg, awayImg, mark] = await Promise.all([
        data.homeLogo ? o.loadImage(data.homeLogo) : Promise.resolve(null),
        data.awayLogo ? o.loadImage(data.awayLogo) : Promise.resolve(null),
        o.loadImage(o.edition.mark),
    ]);

    drawPaper(ctx, W, H);
    ctx.save();
    ctx.translate(0, oy);

    const L = 96, R = 984;
    const round = upper(data.roundLabel);

    // Cabecera
    rect(ctx, L, 92, R - L, 200, '#111');
    const kicker = scheduled ? 'PRÓXIMO PARTIDO' : (round || o.edition.name);
    const big = scheduled ? (round || 'HORARIO') : (round ? 'RESULTADO' : 'RESULTADO FINAL');
    ctx.textBaseline = 'top';
    ctx.fillStyle = accent;
    fitFont(ctx, kicker, (s) => `800 ${s}px ${ARCHIVO}`, 30, 820, 6, ARCHIVO_STRETCH);
    drawStretched(ctx, kicker, 540, 120, 'center', 6);
    ctx.fillStyle = cream;
    fitFont(ctx, big, (s) => `900 ${s}px ${ARCHIVO}`, 92, 830, 1, ARCHIVO_STRETCH, 40);
    drawStretched(ctx, big, 540, 158, 'center', 1);
    ctx.textBaseline = 'alphabetic';

    // Paneles con escudos
    const top = 268;
    const PW = 434, PH = 372;
    rect(ctx, 538, top + 40, 4, 720, '#111');
    const panels: Array<[number, HTMLImageElement | null, string]> = [
        [L, homeImg, crestColor(homeImg, '#1f86b3')],
        [R - PW, awayImg, crestColor(awayImg, '#0e2350')],
    ];
    for (const [x, img, color] of panels) {
        const py = top + 40;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, py, PW, PH); ctx.clip();
        rect(ctx, x, py, PW, PH, color);
        const tint = ctx.createLinearGradient(x, py, x + PW * 0.6, py + PH);
        tint.addColorStop(0, 'rgba(255,255,255,0.14)');
        tint.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = tint; ctx.fillRect(x, py, PW, PH);
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 18;
        drawContain(ctx, img, x + PW / 2, py + PH / 2 + 32, 540);
        ctx.restore();
        strokeRectInside(ctx, x, py, PW, PH, 4, '#111');
        strokeRectInside(ctx, x + 4, py + 4, PW - 8, PH - 8, 4, PAPER);
    }
    // Etiquetas con los nombres
    const tab = (text: string, side: 'l' | 'r') => {
        const t = upper(text);
        ctx.font = `800 25px ${BARLOW}`;
        const tw = Math.min(400, spacedWidth(ctx, t, 1.5) + 40);
        if (spacedWidth(ctx, t, 1.5) + 40 > 400) fitFont(ctx, t, (s) => `800 ${s}px ${BARLOW}`, 25, 360, 1.5);
        const x = side === 'l' ? L + 18 : R - 18 - tw;
        rect(ctx, x, top, tw, 40, '#111');
        rect(ctx, x + 4, top + 4, tw - 8, 32, PAPER);
        ctx.fillStyle = '#111';
        ctx.textBaseline = 'middle';
        drawSpaced(ctx, t, x + tw / 2, top + 21, 1.5, 'center');
        ctx.textBaseline = 'alphabetic';
    };
    tab(data.homeTeam, 'l');
    tab(data.awayTeam, 'r');

    // Marcador u horario
    const sy = top + 440, SH = 320;
    for (const x of [L, R - PW]) {
        rect(ctx, x, sy, PW, SH, '#111');
        drawGrain(ctx, x, sy, PW, SH, '#fff', 0.06, x);
        strokeRectInside(ctx, x + 4, sy + 4, PW - 8, SH - 8, 4, PAPER);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!scheduled) {
        ctx.fillStyle = cream;
        ctx.font = `250px ${ANTON}`;
        fillCentered(ctx, String(data.homeScore), L + PW / 2, sy + SH / 2);
        fillCentered(ctx, String(data.awayScore), R - PW / 2, sy + SH / 2);
    } else {
        const k = formatKickoff(data.kickoffAt);
        const fromTime = data.time?.match(/\d{1,2}:\d{2}/)?.[0];
        const time = fromTime || k?.time || '--:--';
        const venue = upper(data.venue).replace(/^CANCHA\s*/, '');
        const left: [string, string] = [k ? `${k.day} ${k.num}` : 'HORA', time];
        const right: [string, string] = venue ? ['CANCHA', venue] : ['FECHA', k ? `${k.num}/${k.monthNum}` : upper(data.date)];
        for (const [x, [label, value]] of [[L + PW / 2, left], [R - PW / 2, right]] as Array<[number, [string, string]]>) {
            ctx.fillStyle = accent;
            ctx.font = `800 26px ${BARLOW}`;
            drawSpaced(ctx, label, x, sy + 92, 6, 'center');
            ctx.fillStyle = cream;
            fitFont(ctx, value, (s) => `${s}px ${ANTON}`, 128, PW - 60);
            fillCentered(ctx, value, x, sy + 196);
        }
    }

    // Círculo central: FINAL entre los marcadores, VS entre los escudos
    const cy = scheduled ? top + 226 : top + 600;
    ctx.beginPath(); ctx.arc(540, cy, 75, 0, Math.PI * 2);
    ctx.fillStyle = PAPER; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = `${scheduled ? 58 : 42}px ${ANTON}`;
    fillCentered(ctx, scheduled ? 'VS' : 'FINAL', 540, cy);

    // Frase
    rect(ctx, L, 1050, R - L, 128, '#111');
    const winner = !scheduled && data.homeScore !== data.awayScore
        ? shortName((data.homeScore ?? 0) > (data.awayScore ?? 0) ? data.homeTeam : data.awayTeam)
        : null;
    const lead = scheduled ? (round || 'SEVEN') : winner ? `GANA ${winner}` : 'EMPATE';
    const tail = scheduled ? o.edition.name : (round || o.edition.name);
    const phrase = `${lead} - ${tail}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fitFont(ctx, phrase, (s) => `${s}px ${ANTON}`, scheduled ? 60 : 72, 830);
    let px = 540 - ctx.measureText(phrase).width / 2;
    ctx.fillStyle = cream; ctx.fillText(`${lead} `, px, 1116);
    px += ctx.measureText(`${lead} `).width;
    ctx.fillStyle = accent; ctx.fillText('-', px, 1116);
    px += ctx.measureText('- ').width;
    ctx.fillStyle = cream; ctx.fillText(tail, px, 1116);

    // Bloque del Seven (en el posteo lleva la marca de G22 a la derecha)
    rect(ctx, L, 1196, R - L, 120, '#111');
    rect(ctx, L, 1306, R - L, 10, accent);
    ctx.font = `46px ${ANTON}`;
    const nameW = ctx.measureText(o.edition.name).width;
    const markW = mark ? mark.naturalWidth * (100 / mark.naturalHeight) : 0;
    const brandW = markW + 22 + nameW;
    let wmLeft = R;
    if (!story) {
        const wmW = await drawWatermark(ctx, o, R - 34, 1251, 'post', PAPER);
        wmLeft = R - 34 - wmW - 22;
    }
    const bx = story ? 540 - brandW / 2 : L + 34 + Math.max(0, (wmLeft - (L + 34) - brandW) / 2);
    drawByHeight(ctx, mark, bx, 1200, 100);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cream;
    ctx.font = `46px ${ANTON}`;
    ctx.fillText(o.edition.name, bx + markW + 22, 1252);
    ctx.fillStyle = accent;
    ctx.font = `800 20px ${BARLOW}`;
    drawSpaced(ctx, `${o.edition.edition} · OLIVOS RC`, bx + markW + 22, 1280, 5);
    ctx.restore();

    if (story) await drawWatermark(ctx, o, W - 40, H - 74, 'story', '#fff', true);
}

// ---------------------------------------------------------------------------
// 2. Placas negras con columna de color (fixture, posiciones, cuadro)

async function drawSideColumn(ctx: Ctx, o: Olivos7DrawOptions, H: number, word: string, subBig: string, subSmall: string) {
    rect(ctx, 0, 0, 200, H, o.edition.accent);
    // Rayas diagonales del borde
    ctx.save();
    ctx.beginPath(); ctx.rect(170, 0, 30, H); ctx.clip();
    ctx.fillStyle = INK;
    for (let y = -60; y < H + 60; y += 30) {
        ctx.beginPath();
        ctx.moveTo(170, y); ctx.lineTo(200, y - 13); ctx.lineTo(200, y - 1); ctx.lineTo(170, y + 12);
        ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const crest = await o.loadImage(OLIVOS_CREST);
    drawContain(ctx, crest, 94, 88, 96);
    // Título vertical, de abajo hacia arriba
    const text = upper(word);
    ctx.save();
    ctx.translate(172, H - 190);
    ctx.rotate(-Math.PI / 2);
    fitFont(ctx, text, (s) => `${s}px ${ANTON}`, 158, H - 190 - 190);
    ctx.fillStyle = PAPER;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(text, 0, 4);
    ctx.restore();
    // Dato de abajo
    ctx.fillStyle = o.edition.accentInk;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitFont(ctx, subBig, (s) => `${s}px ${ANTON}`, 42, 140);
    ctx.fillText(subBig, 28, H - 70);
    ctx.font = `800 20px ${BARLOW}`;
    fitFont(ctx, subSmall, (s) => `800 ${s}px ${BARLOW}`, 20, 140, 3);
    drawSpaced(ctx, subSmall, 28, H - 44, 3);
}

// Cabecera del panel derecho: edición chica, título grande, categoría en recuadro.
function drawListHead(ctx: Ctx, o: Olivos7DrawOptions, title: string, top: number) {
    const L = 248, R = 1028;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = MUTED;
    ctx.font = `700 22px ${BARLOW}`;
    drawSpaced(ctx, o.edition.name, L, top + 22, 5);
    ctx.font = `800 22px ${BARLOW}`;
    const chip = o.edition.category;
    const cw = spacedWidth(ctx, chip, 4) + 34;
    ctx.fillStyle = PAPER;
    fitFont(ctx, upper(title), (s) => `${s}px ${ANTON}`, 54, R - L - cw - 30);
    ctx.fillText(upper(title), L, top + 84);
    strokeRectInside(ctx, R - cw, top + 40, cw, 46, 3, o.edition.accent);
    ctx.fillStyle = o.edition.accent;
    ctx.font = `800 22px ${BARLOW}`;
    ctx.textBaseline = 'middle';
    drawSpaced(ctx, chip, R - cw / 2, top + 64, 4, 'center');
    ctx.textBaseline = 'alphabetic';
    rect(ctx, L, top + 102, R - L, 3, o.edition.accent);
    return top + 105;
}

async function drawListFoot(ctx: Ctx, o: Olivos7DrawOptions, y: number, story: boolean) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `46px ${ANTON}`;
    ctx.fillStyle = PAPER;
    ctx.fillText('OLIVOS ', 248, y + 16);
    const w = ctx.measureText('OLIVOS ').width;
    ctx.fillStyle = o.edition.accent;
    ctx.fillText('7s', 248 + w, y + 16);
    await drawWatermark(ctx, o, 1028, y, story ? 'story' : 'post', '#cfcfcf');
}

function teamCell(ctx: Ctx, name: string, img: HTMLImageElement | null, x: number, w: number, cy: number, home: boolean, lost: boolean, fs: number, crest: number) {
    const t = upper(name);
    let size = fs;
    ctx.font = `800 ${size}px ${BARLOW}`;
    while (size > 16 && ctx.measureText(t).width > w - crest - 14) { size -= 1; ctx.font = `800 ${size}px ${BARLOW}`; }
    ctx.fillStyle = lost ? '#8a8a8a' : PAPER;
    ctx.textBaseline = 'middle';
    if (home) {
        ctx.textAlign = 'right';
        ctx.fillText(t, x + w - crest - 12, cy + 1);
        drawContain(ctx, img, x + w - crest / 2, cy, crest, lost ? 0.55 : 1);
    } else {
        ctx.textAlign = 'left';
        drawContain(ctx, img, x + crest / 2, cy, crest, lost ? 0.55 : 1);
        ctx.fillText(t, x + crest + 12, cy + 1);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

export async function drawOlivos7Daily(ctx: Ctx, canvas: HTMLCanvasElement, data: O7DailyData, o: Olivos7DrawOptions) {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const oy = story ? 285 : 0;
    const accent = o.edition.accent;
    const matches = data.matches;
    const isPlayed = (m: O7DailyData['matches'][number]) => m.status !== 'scheduled' && m.homeScore != null && m.awayScore != null;
    const anyScore = matches.some(isPlayed);

    rect(ctx, 0, 0, W, H, INK);
    drawGrain(ctx, 0, 0, W, H, '#fff', 0.05, 3);
    const dayNum = upper(data.date).match(/\b(\d{1,2})\b/)?.[1];
    await drawSideColumn(ctx, o, H, anyScore ? 'RESULTADOS' : 'FIXTURE', dayNum ?? '7s', matches.length === 1 ? 'PARTIDO' : `${matches.length} PARTIDOS`);
    if (story) await drawStorySignature(ctx, o, 120);

    const imgs = await Promise.all(matches.map((m) => Promise.all([
        m.homeLogo ? o.loadImage(m.homeLogo) : Promise.resolve(null),
        m.awayLogo ? o.loadImage(m.awayLogo) : Promise.resolve(null),
    ])));

    ctx.save();
    ctx.translate(0, oy);
    const L = 248, R = 1028;
    let y = drawListHead(ctx, o, data.date || data.tournament, 56) + 16;

    // Separadores por día cuando la placa junta más de uno
    const days = [...new Set(matches.map((m) => m.dateLabel).filter(Boolean))];
    const rows: Array<{ sep?: string; i?: number }> = [];
    let lastDay: string | undefined;
    matches.forEach((m, i) => {
        if (days.length > 1 && m.dateLabel !== lastDay) { rows.push({ sep: upper(m.dateLabel) }); lastDay = m.dateLabel; }
        rows.push({ i });
    });

    ctx.fillStyle = MUTED;
    ctx.font = `800 18px ${BARLOW}`;
    drawSpaced(ctx, 'HORA', L, y + 18, 4);
    y += 30;

    const bottom = 1350 - 110;
    const sepH = 46;
    const nSep = rows.filter((r) => r.sep).length;
    const rowH = Math.max(46, Math.min(76, Math.floor((bottom - y - nSep * sepH) / Math.max(1, matches.length))));
    const scale = Math.max(rowH / 76, 0.7);
    const timeW = 92, midW = anyScore ? 136 : 64;
    const teamW = (R - L - timeW - midW) / 2;

    for (const r of rows) {
        if (r.sep) {
            ctx.fillStyle = accent;
            ctx.font = `800 20px ${BARLOW}`;
            drawSpaced(ctx, r.sep, L, y + sepH - 12, 6);
            y += sepH;
            continue;
        }
        const i = r.i!;
        const m = matches[i];
        const cy = y + rowH / 2;
        const played = isPlayed(m);
        ctx.fillStyle = PAPER;
        ctx.font = `${Math.round(34 * scale)}px ${ANTON}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(m.time || '', L, cy + (m.status === 'live' ? -9 : 0));
        if (m.status === 'live') {
            ctx.fillStyle = accent;
            ctx.font = `800 15px ${BARLOW}`;
            drawSpaced(ctx, 'EN VIVO', L, cy + 18, 2);
        }
        const homeLost = played && (m.homeScore as number) < (m.awayScore as number);
        const awayLost = played && (m.awayScore as number) < (m.homeScore as number);
        const fs = Math.round(29 * scale);
        const crest = Math.round(44 * scale);
        teamCell(ctx, m.homeTeam, imgs[i][0], L + timeW, teamW - 10, cy, true, homeLost, fs, crest);
        teamCell(ctx, m.awayTeam, imgs[i][1], L + timeW + teamW + midW + 10, teamW - 10, cy, false, awayLost, fs, crest);
        const mx = L + timeW + teamW + midW / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (played) {
            const bw = 48, bh = Math.round(46 * Math.max(scale, 0.8));
            const cells: Array<[number, number, boolean, boolean]> = [
                [mx - 8 - bw, m.homeScore as number, awayLost, homeLost],
                [mx + 8, m.awayScore as number, homeLost, awayLost],
            ];
            for (const [bx, val, win, lost] of cells) {
                rect(ctx, bx, cy - bh / 2, bw, bh, win ? accent : '#262626');
                ctx.fillStyle = win ? o.edition.accentInk : lost ? '#8a8a8a' : '#fff';
                ctx.font = `${Math.round(30 * Math.max(scale, 0.8))}px ${ANTON}`;
                ctx.fillText(String(val), bx + bw / 2, cy + 1);
            }
            rect(ctx, mx - 4, cy - 1.5, 8, 3, '#666');
        } else {
            ctx.fillStyle = accent;
            ctx.font = `26px ${ANTON}`;
            ctx.fillText('VS', mx, cy + 1);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        rect(ctx, L, y + rowH - 1, R - L, 1, LINE);
        y += rowH;
    }
    await drawListFoot(ctx, o, 1350 - 62, story);
    ctx.restore();
}

export async function drawOlivos7Standings(ctx: Ctx, canvas: HTMLCanvasElement, data: O7StandingsData, o: Olivos7DrawOptions) {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const oy = story ? 285 : 0;
    const accent = o.edition.accent;
    const groups = data.groups && data.groups.length ? data.groups : [{ name: '', rows: data.rows }];

    rect(ctx, 0, 0, W, H, INK);
    drawGrain(ctx, 0, 0, W, H, '#fff', 0.05, 5);
    await drawSideColumn(ctx, o, H, 'POSICIONES', String(new Date().getFullYear()), 'TABLA');
    if (story) await drawStorySignature(ctx, o, 120);

    const imgs = await Promise.all(groups.map((g) => Promise.all(g.rows.map((r) => (r.teamLogo ? o.loadImage(r.teamLogo) : Promise.resolve(null))))));

    ctx.save();
    ctx.translate(0, oy);
    const L = 248, R = 1028;
    const top = drawListHead(ctx, o, data.subtitle || data.title || 'POSICIONES', 56) + 24;

    // Leyenda: las zonas de clasificación que ya trae la tabla
    const legend: Array<{ label: string; color: string }> = [];
    for (const g of groups) for (const r of g.rows) {
        if (r.zoneColor && r.labelName && !legend.some((l) => l.label === upper(r.labelName))) legend.push({ label: upper(r.labelName), color: r.zoneColor });
    }
    const bottom = 1350 - 110 - (legend.length ? 54 : 0);

    const cols = groups.length > 1 ? 2 : 1;
    const gap = 26;
    const colW = (R - L - gap * (cols - 1)) / cols;
    const lines: number[][] = [];
    for (let i = 0; i < groups.length; i += cols) lines.push(groups.slice(i, i + cols).map((_, k) => i + k));
    const maxRowsPerLine = lines.map((ln) => Math.max(...ln.map((gi) => groups[gi].rows.length)));
    const titleH = groups.length > 1 || groups[0].name ? 56 : 34;
    const lineGap = 30;
    const available = bottom - top - lines.length * titleH - (lines.length - 1) * lineGap;
    const rowH = Math.max(30, Math.min(82, Math.floor(available / Math.max(1, maxRowsPerLine.reduce((a, b) => a + b, 0)))));
    const s = Math.max(rowH / 82, 0.62);

    let y = top;
    for (const [li, ln] of lines.entries()) {
        for (const [ci, gi] of ln.entries()) {
            const g = groups[gi];
            const x = L + ci * (colW + gap);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            if (g.name) {
                const name = upper(g.name).replace(/^GRUPO/, 'ZONA');
                const m = name.match(/^(.*\s)(\S+)$/);
                ctx.font = `40px ${ANTON}`;
                ctx.fillStyle = PAPER;
                const head = m ? m[1] : name;
                ctx.fillText(head, x, y + 42);
                if (m) { ctx.fillStyle = accent; ctx.fillText(m[2], x + ctx.measureText(head).width, y + 42); }
            }
            const cPts = x + colW - 23, cDif = x + colW - 46 - 26, cPj = cDif - 48;
            ctx.fillStyle = MUTED;
            ctx.font = `800 16px ${BARLOW}`;
            for (const [lbl, cx] of [['PJ', cPj], ['DIF', cDif], ['PTS', cPts]] as Array<[string, number]>) drawSpaced(ctx, lbl, cx, y + titleH - 10, 3, 'center');

            g.rows.forEach((r, ri) => {
                const ry = y + titleH + ri * rowH;
                rect(ctx, x, ry, colW, rowH, INK2);
                rect(ctx, x, ry + rowH - 1, colW, 1, LINE);
                const zone = r.zoneColor;
                if (zone) rect(ctx, x, ry, 6, rowH, zone);
                const cy = ry + rowH / 2;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = MUTED;
                ctx.font = `${Math.round(24 * s)}px ${ANTON}`;
                ctx.fillText(String(r.pos), x + 24, cy + 1);
                drawContain(ctx, imgs[gi][ri], x + 60, cy, Math.round(38 * s));
                rect(ctx, x + colW - 46, ry, 46, rowH, zone || INK3);
                ctx.fillStyle = zone ? (luminance(zone) > 0.55 ? INK : '#fff') : PAPER;
                ctx.font = `${Math.round(28 * s)}px ${ANTON}`;
                ctx.fillText(String(r.points), cPts, cy + 1);
                ctx.fillStyle = '#cfcfcf';
                ctx.font = `700 ${Math.round(24 * s)}px ${BARLOW}`;
                ctx.fillText(String(r.played), cPj, cy + 1);
                ctx.fillText(String(r.diff), cDif, cy + 1);
                ctx.textAlign = 'left';
                ctx.fillStyle = PAPER;
                const nx = x + 88, nw = cPj - 28 - nx;
                fitFont(ctx, upper(r.team), (sz) => `800 ${sz}px ${BARLOW}`, Math.round(27 * s), nw);
                ctx.fillText(upper(r.team), nx, cy + 1);
                ctx.textBaseline = 'alphabetic';
            });
        }
        y += titleH + maxRowsPerLine[li] * rowH + lineGap;
    }

    if (legend.length) {
        let lx = L;
        const ly = bottom + 28;
        for (const l of legend) {
            rect(ctx, lx, ly - 11, 22, 22, l.color);
            ctx.fillStyle = PAPER;
            ctx.font = `800 20px ${BARLOW}`;
            ctx.textBaseline = 'middle';
            lx += 32 + drawSpaced(ctx, l.label, lx + 32, ly + 1, 3) + 30;
            ctx.textBaseline = 'alphabetic';
        }
    }
    await drawListFoot(ctx, o, 1350 - 62, story);
    ctx.restore();
}

// --- Cuadro ---

type BracketSlot = { name: string; logo?: string; score: number | null; win: boolean; lost: boolean; id?: string | number };
type BracketMatch = { a: BracketSlot | null; b: BracketSlot | null; when: string | null; played: boolean };

function readBracketMatch(m: O7BracketMatchRaw | undefined): BracketMatch {
    if (!m) return { a: null, b: null, when: null, played: false };
    const side = (team: O7BracketSide, part: O7BracketParticipant, score: unknown): BracketSlot | null => {
        const name = team?.name || part?.participant_name || '';
        if (!name) return null;
        const n = score == null || score === '' ? null : Number(score);
        return { name, logo: team?.logo || part?.image_path, score: n != null && Number.isFinite(n) ? n : null, id: team?.id ?? part?.participant_id, win: false, lost: false };
    };
    const a = side(m.home_team, m.home_participant, m.score_home);
    const b = side(m.away_team, m.away_participant, m.score_away);
    const played = Boolean(a && b && a.score != null && b.score != null);
    if (played && a && b) {
        const aWins = m.winner_id != null ? String(m.winner_id) === String(a.id) : (a.score as number) > (b.score as number);
        const bWins = m.winner_id != null ? String(m.winner_id) === String(b.id) : (b.score as number) > (a.score as number);
        a.win = aWins; b.win = bWins; a.lost = bWins; b.lost = aWins;
    }
    const k = formatKickoff(m.match_start_iso);
    return { a, b, when: played ? null : k?.time ?? null, played };
}

export async function drawOlivos7Bracket(ctx: Ctx, canvas: HTMLCanvasElement, data: O7BracketData, o: Olivos7DrawOptions) {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const oy = story ? 285 : 0;
    const accent = o.edition.accent;
    const rounds = data.rounds.filter((r) => r.matches && r.matches.length);
    const finalRound = rounds[rounds.length - 1];
    const semis = rounds.length >= 2 ? rounds[rounds.length - 2] : null;
    const quarters = rounds.length >= 3 ? rounds[rounds.length - 3] : null;

    const fin = readBracketMatch(finalRound?.matches[0]);
    const sf = semis ? semis.matches.slice(0, 2).map(readBracketMatch) : [];
    const qf = quarters ? quarters.matches.slice(0, 4).map(readBracketMatch) : [];
    const logos = new Map<string, HTMLImageElement | null>();
    const slots = [fin, ...sf, ...qf].flatMap((m) => [m.a, m.b]).filter((sl): sl is BracketSlot => Boolean(sl?.logo));
    await Promise.all(slots.map(async (sl) => {
        if (!logos.has(sl.logo!)) logos.set(sl.logo!, await o.loadImage(sl.logo!));
    }));
    const crest = await o.loadImage(OLIVOS_CREST);

    rect(ctx, 0, 0, W, H, INK);
    drawGrain(ctx, 0, 0, W, H, '#fff', 0.05, 9);
    if (story) await drawStorySignature(ctx, o, 120);
    ctx.save();
    ctx.translate(0, oy);

    // Firma y categoría
    drawContain(ctx, crest, 93, 100, 74);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `46px ${ANTON}`;
    ctx.fillStyle = PAPER;
    ctx.fillText('OLIVOS ', 146, 104);
    const ow = ctx.measureText('OLIVOS ').width;
    ctx.fillStyle = accent; ctx.fillText('7s', 146 + ow, 104);
    ctx.fillStyle = MUTED; ctx.font = `700 19px ${BARLOW}`;
    drawSpaced(ctx, o.edition.name, 146, 128, 5);
    ctx.font = `800 24px ${BARLOW}`;
    const chip = o.edition.category;
    const cw = spacedWidth(ctx, chip, 4) + 42;
    strokeRectInside(ctx, 1024 - cw, 76, cw, 48, 3, accent);
    ctx.fillStyle = accent; ctx.textBaseline = 'middle';
    drawSpaced(ctx, chip, 1024 - cw / 2, 101, 4, 'center');
    ctx.textBaseline = 'alphabetic';

    // Título: "Copa de Oro" con la última palabra en color
    const rawTitle = upper(data.title).split(/\s+[-–·]\s+/)[0] || 'CUADRO';
    const words = rawTitle.split(' ');
    const lastWord = words.length > 1 ? words.pop()! : '';
    const firstPart = words.join(' ') + (lastWord ? ' ' : '');
    fitFont(ctx, rawTitle, (sz) => `${sz}px ${ANTON}`, 96, 900);
    const tw = ctx.measureText(rawTitle).width;
    ctx.fillStyle = PAPER; ctx.fillText(firstPart, 540 - tw / 2, 256);
    ctx.fillStyle = accent; ctx.fillText(lastWord, 540 - tw / 2 + ctx.measureText(firstPart).width, 256);
    const finalDate = formatKickoff(finalRound?.matches[0]?.match_start_iso);
    const meta = finalDate?.long || upper(data.subtitle) || o.edition.name;
    ctx.fillStyle = MUTED;
    fitFont(ctx, meta, (sz) => `700 ${sz}px ${BARLOW}`, 24, 900, 7);
    drawSpaced(ctx, meta, 540, 292, 7, 'center');

    const line = (x: number, y: number, w: number, h: number) => rect(ctx, x, y, w, h, '#5a5a5a');
    const box = (x: number, y: number, m: BracketMatch, w = 300) => {
        rect(ctx, x, y, w, 130, INK2);
        [m.a, m.b].forEach((sl, i) => {
            const ry = y + 3 + i * 62;
            const cy = ry + 31;
            const sx = x + w - 3 - 66;
            rect(ctx, sx, ry, 66, 62, sl?.win ? accent : INK3);
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            if (!sl) {
                ctx.fillStyle = MUTED; ctx.font = `700 25px ${BARLOW}`;
                ctx.fillText('A DEFINIR', x + 22, cy);
                return;
            }
            drawContain(ctx, logos.get(sl.logo || '') ?? null, x + 30, cy, 36, sl.lost ? 0.45 : 1);
            ctx.fillStyle = sl.lost ? 'rgba(244,239,230,0.45)' : PAPER;
            fitFont(ctx, shortName(sl.name), (sz) => `800 ${sz}px ${BARLOW}`, 25, sx - x - 64);
            ctx.fillText(shortName(sl.name), x + 54, cy + 1);
            if (sl.score != null) {
                ctx.textAlign = 'center';
                ctx.fillStyle = sl.win ? o.edition.accentInk : '#8a8a8a';
                ctx.font = `32px ${ANTON}`;
                ctx.fillText(String(sl.score), sx + 33, cy + 1);
                ctx.textAlign = 'left';
            }
        });
        rect(ctx, x + 3, y + 64, w - 6, 2, LINE);
        strokeRectInside(ctx, x, y, w, 130, 3, PAPER);
        if (m.when) {
            ctx.fillStyle = MUTED; ctx.font = `800 18px ${BARLOW}`; ctx.textBaseline = 'alphabetic';
            drawSpaced(ctx, m.when, x + w, y - 12, 3, 'right');
        }
        ctx.textBaseline = 'alphabetic';
    };
    const label = (text: string, x: number, y: number, align: Align) => {
        ctx.fillStyle = accent; ctx.font = `800 20px ${BARLOW}`; ctx.textBaseline = 'alphabetic';
        drawSpaced(ctx, text, x, y, 5, align);
    };
    const roundName = (r: O7BracketRound | null, fallback: string) => upper(r?.name || r?.round_name || r?.ROUND_NAME || fallback);

    if (qf.length) {
        label(roundName(quarters, 'CUARTOS'), 56, 322, 'left');
        label(roundName(quarters, 'CUARTOS'), 1024, 322, 'right');
        label(roundName(semis, 'SEMIFINALES'), 540, 520, 'center');
        line(356, 400, 64, 3); line(418, 400, 3, 160);
        line(356, 864, 64, 3); line(418, 690, 3, 177);
        line(660, 400, 64, 3); line(660, 400, 3, 160);
        line(660, 864, 64, 3); line(660, 690, 3, 177);
        line(548, 690, 4, 310);
        if (qf[0]) box(56, 336, qf[0]);
        if (qf[1]) box(56, 800, qf[1]);
        if (qf[2]) box(724, 336, qf[2]);
        if (qf[3]) box(724, 800, qf[3]);
        if (sf[0]) box(240, 560, sf[0]);
        if (sf[1]) box(560, 560, sf[1]);
    } else if (sf.length) {
        label(roundName(semis, 'SEMIFINALES'), 540, 470, 'center');
        line(356, 560, 384, 3);
        line(548, 560, 4, 440);
        if (sf[0]) box(56, 496, sf[0]);
        if (sf[1]) box(724, 496, sf[1]);
    }

    // Final
    const fx = 270, fy = 1000, fw = 540, fh = 140;
    rect(ctx, fx, fy, fw, fh, INK2);
    rect(ctx, fx, fy, 150, fh, accent);
    // Copa
    ctx.fillStyle = o.edition.accentInk;
    const tx = fx + 75, ty = fy + 48;
    ctx.beginPath();
    ctx.moveTo(tx - 22, ty - 26); ctx.lineTo(tx + 22, ty - 26); ctx.lineTo(tx + 20, ty - 2);
    ctx.quadraticCurveTo(tx + 16, ty + 14, tx + 5, ty + 16); ctx.lineTo(tx + 5, ty + 24); ctx.lineTo(tx + 14, ty + 24);
    ctx.lineTo(tx + 14, ty + 31); ctx.lineTo(tx - 14, ty + 31); ctx.lineTo(tx - 14, ty + 24); ctx.lineTo(tx - 5, ty + 24);
    ctx.lineTo(tx - 5, ty + 16); ctx.quadraticCurveTo(tx - 16, ty + 14, tx - 20, ty - 2); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = o.edition.accentInk;
    ctx.beginPath(); ctx.arc(tx - 22, ty - 12, 9, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(tx + 22, ty - 12, 9, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.font = `34px ${ANTON}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('FINAL', tx, fy + fh - 20);
    ctx.textAlign = 'left';
    [fin.a, fin.b].forEach((sl, i) => {
        const ry = fy + 4 + i * 66;
        const cy = ry + 33;
        const vx = fx + fw - 4 - 80;
        rect(ctx, vx, ry, 80, 66, sl?.win ? accent : INK3);
        ctx.textBaseline = 'middle';
        if (sl) {
            drawContain(ctx, logos.get(sl.logo || '') ?? null, fx + 180, cy, 40, sl.lost ? 0.45 : 1);
            ctx.fillStyle = sl.lost ? 'rgba(244,239,230,0.45)' : PAPER;
            fitFont(ctx, upper(sl.name), (sz) => `800 ${sz}px ${BARLOW}`, 28, vx - fx - 220);
            ctx.fillText(upper(sl.name), fx + 210, cy + 1);
        } else {
            ctx.fillStyle = MUTED; ctx.font = `700 24px ${BARLOW}`;
            ctx.fillText('A DEFINIR', fx + 172, cy + 1);
        }
        const val = fin.played ? String(sl?.score ?? '') : i === 0 ? (fin.when ?? '') : '';
        ctx.textAlign = 'center';
        ctx.fillStyle = sl?.win ? o.edition.accentInk : PAPER;
        ctx.font = `${fin.played ? 32 : 26}px ${ANTON}`;
        ctx.fillText(val, vx + 40, cy + 1);
        ctx.textAlign = 'left';
    });
    rect(ctx, fx + 150, fy + 69, fw - 154, 2, LINE);
    strokeRectInside(ctx, fx, fy, fw, fh, 4, accent);
    ctx.textBaseline = 'alphabetic';

    // Banda de pie
    rect(ctx, 0, 1240, W, 110, accent);
    ctx.fillStyle = o.edition.accentInk;
    ctx.font = `800 24px ${BARLOW}`;
    ctx.textBaseline = 'middle';
    drawSpaced(ctx, 'OLIVOS RUGBY CLUB', 64, 1296, 4);
    ctx.textBaseline = 'alphabetic';
    await drawWatermark(ctx, o, W - 64, 1296, story ? 'story' : 'post', o.edition.accentInk);
    ctx.restore();
}

// ---------------------------------------------------------------------------
// 3. Campeón: la palabra repetida, el escudo adelante y papelitos

export async function drawOlivos7Champion(ctx: Ctx, canvas: HTMLCanvasElement, data: O7ChampionData, o: Olivos7DrawOptions) {
    const W = canvas.width, H = canvas.height;
    const story = isStory(canvas);
    const accent = o.edition.accent;
    const [crestImg, mark] = await Promise.all([
        data.club.logo ? o.loadImage(data.club.logo) : Promise.resolve(null),
        o.loadImage(o.edition.mark),
    ]);

    rect(ctx, 0, 0, W, H, '#23211e');

    // Pared de palabras: borde negro debajo, blanco al 80% encima
    const word = upper(data.headline) || 'CAMPEONES';
    const rows = story ? 7 : 5;
    ctx.font = `236px ${ANTON}`;
    const lineH = 236 * 0.98;
    const startY = H / 2 - (rows * lineH) / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    for (let i = 0; i < rows; i++) {
        const y = startY + lineH * (i + 0.5);
        const x = 540 - spacedWidth(ctx, word, 4) / 2;
        let cx = x;
        ctx.lineWidth = 10; ctx.strokeStyle = '#0d0d0d';
        for (const ch of word) {
            ctx.strokeText(ch, cx, y);
            cx += ctx.measureText(ch).width + 4;
        }
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        drawSpaced(ctx, word, x, y, 4);
    }

    // Escudo
    const size = story ? 760 : 620;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 30;
    drawContain(ctx, crestImg, 540, H / 2 + size * 0.04, size);
    ctx.restore();

    // Papelitos (azar sembrado: siempre caen igual)
    let seed = 22;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const colors = [accent, accent, '#ffffff', '#111111'];
    for (let i = 0; i < (story ? 46 : 34); i++) {
        const big = rnd() < 0.18;
        const w = big ? 90 + rnd() * 110 : 18 + rnd() * 34;
        const h = w * (0.3 + rnd() * 0.25);
        const x = rnd() * 1080 - 40, y = rnd() * H - 30;
        const color = colors[Math.floor(rnd() * 4)];
        const rot = rnd() * Math.PI;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(rot);
        if (big) { ctx.filter = 'blur(9px)'; ctx.globalAlpha = 0.85; }
        ctx.fillStyle = color;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
    }

    // Marca del Seven arriba, sobre su recuadro
    const mh = story ? 140 : 104;
    const mw = mark ? mark.naturalWidth * (mh / mark.naturalHeight) : 0;
    const mtop = story ? 90 : 40;
    if (mark) {
        rect(ctx, 540 - mw / 2 - 26, mtop, mw + 52, mh + 28, '#23211e');
        drawByHeight(ctx, mark, 540 - mw / 2, mtop + 14, mh);
    }

    // Pie: club y torneo
    const club = upper(data.club.name);
    const compName = upper(data.tag) || upper(data.tournament).replace(/^SEVEN DE OLIVOS\s*/, '') || o.edition.name;
    const comp = [compName, upper(data.season)].filter(Boolean).join(' ');
    const left = `${club} · `;
    let fsz = story ? 30 : 26;
    ctx.font = `800 ${fsz}px ${BARLOW}`;
    let lw = spacedWidth(ctx, left, 8), rw = spacedWidth(ctx, comp, 8);
    while (lw + rw > 960 && fsz > 16) {
        fsz -= 1; ctx.font = `800 ${fsz}px ${BARLOW}`;
        lw = spacedWidth(ctx, left, 8); rw = spacedWidth(ctx, comp, 8);
    }
    const fy = H - (story ? 160 : 110);
    rect(ctx, 540 - (lw + rw) / 2 - 30, fy - fsz / 2 - 16, lw + rw + 60, fsz + 32, '#23211e');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    drawSpaced(ctx, left, 540 - (lw + rw) / 2, fy, 8);
    ctx.fillStyle = accent;
    drawSpaced(ctx, comp, 540 - (lw + rw) / 2 + lw, fy, 8);
    ctx.textBaseline = 'alphabetic';

    await drawWatermark(ctx, o, W - (story ? 40 : 26), H - (story ? 74 : 44), story ? 'story' : 'post', '#fff', true);
}

// Punto de entrada: dibuja la plantilla pedida sobre el lienzo.
export async function drawOlivos7(ctx: Ctx, canvas: HTMLCanvasElement, template: Olivos7Template, data: unknown, o: Olivos7DrawOptions) {
    await ensureOlivos7Fonts();
    ctx.save();
    try {
        ctx.filter = 'none';
        if (template === 'matchStats') await drawOlivos7Match(ctx, canvas, data as O7MatchData, o);
        else if (template === 'dailyMatches') await drawOlivos7Daily(ctx, canvas, data as O7DailyData, o);
        else if (template === 'standings') await drawOlivos7Standings(ctx, canvas, data as O7StandingsData, o);
        else if (template === 'playoffBracket') await drawOlivos7Bracket(ctx, canvas, data as O7BracketData, o);
        else await drawOlivos7Champion(ctx, canvas, data as O7ChampionData, o);
    } finally {
        ctx.restore();
    }
}
