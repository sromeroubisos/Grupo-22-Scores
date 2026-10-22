/**
 * Export del jugador: tres placas con el lenguaje de las de tablas, resultados y
 * fixture (paleta oscura, pildora de titulo, paneles de superficie con filas y
 * el pie "Info aportada por: G22 Scores"), tomando prestados los helpers de
 * `ExportImage` igual que el "mano a mano" (`rivalHeadToHeadExport.ts`).
 *
 *   1. IDENTIDAD     — cabeza o foto con el escudo del club al costado, nombre,
 *                      tres numeros de la competicion y la forma reciente.
 *   2. ESTADISTICAS  — rendimiento, anotacion, disciplina y otras acciones.
 *   3. ULTIMOS PARTIDOS — filas con escudos y marcador, como el export de
 *                      resultados, con lo que hizo el jugador en cada uno.
 *
 * EL COLOR SIGUE AL TORNEO. Se exporta una competicion (la mas reciente, por
 * defecto) y el acento sale, en este orden: `tournaments.primary_color`; el
 * color dominante del logo del torneo; el color del club
 * (`clubs.primary_color`); el dominante de su escudo. Hoy ningun torneo tiene
 * color cargado, asi que casi siempre manda el logo.
 *
 * Reglas heredadas: escudo real del club o no hay pieza (regla dura del
 * proyecto); un cero se escribe con guion porque la base no distingue un 0
 * real de un evento que nadie cargo.
 */

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
import { PLAYER_HEAD_PATH } from '@/components/PlayerHeadIcon';
import { canvasToBlob, deliverPngs, slugify } from '@/lib/exports/deliverPng';
import { EXPORT_BACKGROUND_OPTIONS, resolveTournamentExportTheme } from '@/lib/exports/tournamentThemes';
import type { LocalPlayerProfile, PlayerProfileMatch } from '@/lib/services/localPlayerProfile';
import { otherActionsOf, seasonKeyOf, totalsOf } from '@/lib/services/playerProfileAggregate';
import { APP_TIMEZONE } from '@/lib/timezone';

export type PlayerPlate = 'identidad' | 'estadisticas' | 'partidos';
export type PlayerExportFormat = '4:5' | '9:16';
export type PlayerColorSource = 'torneo' | 'club';

export const PLAYER_PLATES: Array<{ id: PlayerPlate; label: string }> = [
    { id: 'identidad', label: 'Identidad' },
    { id: 'estadisticas', label: 'Estadísticas' },
    { id: 'partidos', label: 'Últimos partidos' },
];

export type PlayerExportOptions = {
    /** Clave de competicion (`seasonKeyOf`); `null` = todas. */
    seasonKey: string | null;
    colorSource: PlayerColorSource;
    /** Acento a mano: gana sobre cualquier resolucion automatica. */
    accentOverride?: string | null;
    /**
     * Fondo de la placa: `'auto'` = el del torneo (ver `tournamentThemes`),
     * `'none'` = el degradado liso de siempre, o el id de uno de los fondos de
     * G22 (`EXPORT_BACKGROUND_OPTIONS`).
     */
    background?: string;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// Paleta G22 Dark, la misma de los demas exports.
const DEFAULT_ACCENT = '#00a365';
const BASE_BG = '#0a0a0b';
const CAUTION = '#f6b73c';
const DANGER = '#ef4444';

// ── color ────────────────────────────────────────────────────────────────

function channels(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): string {
    const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    return `#${part(r)}${part(g)}${part(b)}`;
}

function mixHex(a: string, b: string, amount: number): string {
    const [ar, ag, ab] = channels(a);
    const [br, bg, bb] = channels(b);
    return toHex(ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount);
}

function luminance(hex: string): number {
    const channel = (offset: number) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}

/** El fondo es casi negro; un acento muy oscuro (azul marino, granate) se apaga. */
function liftForDark(hex: string): string {
    let color = hex;
    for (let step = 0; step < 8 && luminance(color) < 0.2; step += 1) color = mixHex(color, '#ffffff', 0.14);
    return color;
}

/**
 * Color dominante de una imagen: se agrupa por tono lo que tiene saturacion y
 * no es casi blanco ni casi negro (el fondo y el borde de un escudo no son "el
 * color"), y gana el tono con mas peso.
 */
function dominantColor(img: HTMLImageElement): string | null {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try {
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3] / 255;
            if (alpha < 0.6) continue;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const lightness = (max + min) / 510;
            const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
            if (saturation < 0.28 || lightness < 0.14 || lightness > 0.88) continue;
            let hue: number;
            const delta = max - min;
            if (max === r) hue = ((g - b) / delta + 6) % 6;
            else if (max === g) hue = (b - r) / delta + 2;
            else hue = (r - g) / delta + 4;
            const bucket = buckets[Math.min(11, Math.floor((hue / 6) * 12))];
            const weight = saturation * alpha;
            bucket.weight += weight;
            bucket.r += r * weight;
            bucket.g += g * weight;
            bucket.b += b * weight;
        }
        const best = buckets.reduce((top, bucket) => (bucket.weight > top.weight ? bucket : top), buckets[0]);
        if (best.weight < 1) return null;
        return toHex(best.r / best.weight, best.g / best.weight, best.b / best.weight);
    } catch {
        // Imagen de otro origen sin CORS: el canvas queda marcado y no se puede leer.
        return null;
    }
}

function proxyUrl(entity: 'team' | 'tournament', key: string, name: string, width = 160): string {
    return `/api/assets/team-logo?entity=${entity}&sport=rugby&key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}&w=${width}`;
}

// ── alcance: la competicion que se exporta ───────────────────────────────

type Scope = {
    key: string | null;
    matches: PlayerProfileMatch[];
    label: string;
    tournamentId: string | null;
    tournamentName: string | null;
    tournamentColor: string | null;
};

function scopeOf(profile: LocalPlayerProfile, seasonKey: string | null): Scope {
    if (seasonKey) {
        const season = profile.seasons.find((item) => item.key === seasonKey);
        if (season) {
            return {
                key: seasonKey,
                matches: profile.matches.filter((match) => seasonKeyOf(match) === seasonKey),
                label: [season.tournamentName, season.year].filter(Boolean).join(' · '),
                tournamentId: season.tournamentId,
                tournamentName: season.tournamentName,
                tournamentColor: season.tournamentColor,
            };
        }
    }
    return {
        key: null,
        matches: profile.matches,
        label: 'Todas las competiciones',
        tournamentId: null,
        tournamentName: null,
        tournamentColor: null,
    };
}

/**
 * El fondo con el que sale la placa. Los otros exports llevan, segun el torneo,
 * una de las fotos de `public/export-backgrounds` con su color de fondo y su
 * acento (`tournamentThemes.ts`): aca pasa igual. Sin tema para el torneo, o con
 * "sin fondo", queda el degradado liso de siempre.
 */
type BackgroundChoice = {
    image: string | null;
    bg: string | null;
    light: boolean;
    /** Solo cuando el fondo viene de un tema de torneo: ese acento va con esa foto. */
    themeAccent: string | null;
};

function resolveBackground(options: PlayerExportOptions, tournamentName: string | null): BackgroundChoice {
    const none: BackgroundChoice = { image: null, bg: null, light: false, themeAccent: null };
    const choice = options.background ?? 'auto';
    if (choice === 'none') return none;
    if (choice !== 'auto') {
        const picked = EXPORT_BACKGROUND_OPTIONS.find((option) => option.id === choice);
        return picked ? { image: picked.image, bg: picked.bg, light: picked.id === 'blanco', themeAccent: null } : none;
    }
    if (options.colorSource !== 'torneo') return none;
    const theme = resolveTournamentExportTheme(tournamentName);
    if (!theme) return none;
    return { image: theme.image, bg: theme.bg, light: 'light' in theme && theme.light === true, themeAccent: theme.accent };
}

export async function resolvePlayerAccent(
    profile: LocalPlayerProfile,
    options: PlayerExportOptions,
): Promise<{ accent: string; origin: 'manual' | 'tema' | 'torneo' | 'logo-torneo' | 'club' | 'escudo' | 'default' }> {
    if (options.accentOverride && HEX_COLOR.test(options.accentOverride)) {
        return { accent: options.accentOverride, origin: 'manual' };
    }
    const scope = scopeOf(profile, options.seasonKey);

    // El acento del tema va con la foto del tema: no se mezcla con otro.
    const themeAccent = resolveBackground(options, scope.tournamentName).themeAccent;
    if (themeAccent) return { accent: themeAccent, origin: 'tema' };

    if (options.colorSource === 'torneo' && scope.tournamentId) {
        if (scope.tournamentColor) return { accent: scope.tournamentColor, origin: 'torneo' };
        const logo = await loadImage(proxyUrl('tournament', scope.tournamentId, scope.tournamentName || ''));
        const fromLogo = logo ? dominantColor(logo) : null;
        if (fromLogo) return { accent: fromLogo, origin: 'logo-torneo' };
    }

    if (profile.club?.primaryColor) return { accent: profile.club.primaryColor, origin: 'club' };
    if (profile.club) {
        const crest = await loadImage(proxyUrl('team', profile.club.id, profile.club.name));
        const fromCrest = crest ? dominantColor(crest) : null;
        if (fromCrest) return { accent: fromCrest, origin: 'escudo' };
    }
    return { accent: DEFAULT_ACCENT, origin: 'default' };
}

// ── utilidades de dibujo ─────────────────────────────────────────────────

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, baseSize: number, family: string, maxWidth: number, minSize = 12): number {
    let size = baseSize;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
        size -= 1;
        ctx.font = `${weight} ${size}px ${family}`;
    }
    return size;
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
        result = result.slice(0, -1).trimEnd();
    }
    return `${result}…`;
}

function formatShortDate(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: APP_TIMEZONE }).format(date);
}

/** Un cero es "sin registros": se escribe con guion, igual que en la pantalla. */
function tile(value: number): string {
    return value > 0 ? String(value) : '—';
}

function ageFromBirth(birthDate: string | null): number | null {
    if (!birthDate) return null;
    const born = new Date(birthDate);
    if (Number.isNaN(born.getTime())) return null;
    const years = Math.floor((Date.now() - born.getTime()) / 31557600000);
    return years > 0 && years < 120 ? years : null;
}

function drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(PLAYER_HEAD_PATH));
    ctx.restore();
}

type Kit = {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    W: number;
    H: number;
    isStory: boolean;
    isDark: boolean;
    bg: string;
    accent: string;
    accentInk: string;
    text: string;
    muted: string;
    soft: string;
    panelX: number;
    panelWidth: number;
    footerLimit: number;
};

type Assets = {
    clubCrest: HTMLImageElement | null;
    photo: HTMLImageElement | null;
    brand: HTMLImageElement | null;
    crests: Map<string, HTMLImageElement | null>;
};

function crestKey(id: string) {
    return `team:${id}`;
}

function drawHeaderPill(kit: Kit, text: string) {
    const { ctx, W, isStory, accent } = kit;
    const label = text.length > 34 ? `${text.slice(0, 33)}…` : text;
    drawCenteredPill(ctx, W / 2, isStory ? 74 : 56, label, accent, getContrastColor(accent), `800 ${isStory ? 24 : 20}px ${FONT_BODY}`, 24, isStory ? 48 : 42);
}

/** Cabecera chica de las placas 2 y 3: escudo + nombre + competicion. Devuelve el y siguiente. */
function drawMiniHeader(kit: Kit, profile: LocalPlayerProfile, assets: Assets, scopeLabel: string): number {
    const { ctx, isStory, panelX, panelWidth, text, muted } = kit;
    const top = (isStory ? 74 : 56) + (isStory ? 64 : 54);
    const crest = isStory ? 94 : 86;
    if (profile.club && assets.clubCrest) {
        drawLogoBadge(ctx, { x: panelX + crest / 2, y: top + crest / 2, size: crest, img: assets.clubCrest, label: profile.club.name, rawLogo: '', isDark: kit.isDark });
    }
    const textX = panelX + (profile.club ? crest + 24 : 0);
    const textWidth = panelWidth - (profile.club ? crest + 30 : 0);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = text;
    const name = profile.name.trim().toUpperCase();
    fitFont(ctx, name, '900', isStory ? 52 : 48, FONT_OUTFIT_BLACK, textWidth, 24);
    ctx.fillText(name, textX, top + crest / 2 - 2);
    ctx.fillStyle = muted;
    ctx.font = `600 ${isStory ? 24 : 22}px ${FONT_BODY}`;
    ctx.fillText(truncateToWidth(ctx, scopeLabel.toUpperCase(), textWidth), textX, top + crest / 2 + (isStory ? 36 : 32));
    ctx.restore();
    return top + crest + (isStory ? 34 : 26);
}

function drawPanelTitle(kit: Kit, title: string, y: number, rightText?: string) {
    const { ctx, panelX, panelWidth, accentInk, soft, isStory, muted } = kit;
    const height = isStory ? 64 : 56;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentInk;
    ctx.font = `800 ${isStory ? 19 : 17}px ${FONT_BODY}`;
    ctx.fillText(truncateToWidth(ctx, title, panelWidth * 0.7), panelX + 26, y + height / 2 + 2);
    if (rightText) {
        ctx.textAlign = 'right';
        ctx.fillStyle = muted;
        ctx.font = `600 ${isStory ? 17 : 15}px ${FONT_BODY}`;
        ctx.fillText(rightText, panelX + panelWidth - 26, y + height / 2 + 2);
    }
    ctx.strokeStyle = soft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 24, y + height - 8);
    ctx.lineTo(panelX + panelWidth - 24, y + height - 8);
    ctx.stroke();
    ctx.restore();
    return height;
}

// ── placa 1: identidad ───────────────────────────────────────────────────

function drawIdentity(kit: Kit, profile: LocalPlayerProfile, assets: Assets, scope: Scope) {
    const { ctx, W, isStory, panelX, panelWidth, accent, text, muted, soft, accentInk } = kit;
    drawHeaderPill(kit, scope.tournamentName ? scope.tournamentName.toUpperCase() : 'FICHA DE JUGADOR');

    const avatar = isStory ? 300 : 250;
    const cx = W / 2;
    const cy = (isStory ? 74 : 56) + (isStory ? 66 : 52) + avatar / 2 + 24;

    // Avatar: aro del acento, foto o cabeza, y el escudo del club al costado.
    ctx.save();
    ctx.shadowColor = hexToRGBA(accent, 0.45);
    ctx.shadowBlur = 60;
    ctx.fillStyle = kit.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    ctx.beginPath();
    ctx.arc(cx, cy, avatar / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, avatar / 2, 0, Math.PI * 2);
    ctx.clip();
    if (assets.photo) {
        const ratio = Math.max(avatar / assets.photo.width, avatar / assets.photo.height);
        const w = assets.photo.width * ratio;
        const h = assets.photo.height * ratio;
        ctx.drawImage(assets.photo, cx - w / 2, cy - h / 2, w, h);
    } else {
        drawHead(ctx, cx, cy + avatar * 0.02, avatar * 0.62, getMutedColor(kit.isDark, 0.5));
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, avatar / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (assets.clubCrest && profile.club) {
        const crest = Math.round(avatar * 0.42);
        const bx = cx + avatar * 0.36;
        const by = cy + avatar * 0.36;
        ctx.save();
        ctx.fillStyle = kit.bg;
        ctx.beginPath();
        ctx.arc(bx, by, crest / 2 + 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawLogoBadge(ctx, { x: bx, y: by, size: crest, img: assets.clubCrest, label: profile.club.name, rawLogo: '', isDark: kit.isDark });
    }

    // Nombre, club y datos.
    let y = cy + avatar / 2 + (isStory ? 92 : 78);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = text;
    const name = profile.name.trim().toUpperCase();
    fitFont(ctx, name, '900', isStory ? 76 : 66, FONT_OUTFIT_BLACK, W - 120, 30);
    ctx.fillText(name, cx, y);
    y += isStory ? 54 : 46;
    if (profile.club) {
        ctx.fillStyle = muted;
        const clubName = profile.club.name.toUpperCase();
        fitFont(ctx, clubName, '800', isStory ? 32 : 28, FONT_BODY, W - 160, 16);
        ctx.fillText(clubName, cx, y);
        y += isStory ? 44 : 38;
    }
    const age = ageFromBirth(profile.birthDate);
    const facts = [profile.position, profile.number !== null ? `#${profile.number}` : null, age !== null ? `${age} AÑOS` : null].filter(Boolean) as string[];
    if (facts.length > 0) {
        ctx.fillStyle = getMutedColor(kit.isDark, 0.55);
        ctx.font = `700 ${isStory ? 25 : 22}px ${FONT_BODY}`;
        ctx.fillText(facts.join('  ·  ').toUpperCase(), cx, y);
        y += isStory ? 30 : 26;
    }
    ctx.restore();

    // Tres numeros de la competicion.
    const totals = totalsOf(scope.matches);
    const statTop = y + (isStory ? 34 : 24);
    const statH = isStory ? 270 : 236;
    drawSurfacePanel(ctx, panelX, statTop, panelWidth, statH, 34, kit.isDark);
    drawPanelTitle(kit, scope.label.toUpperCase(), statTop);
    const columns: Array<[string, string, boolean]> = [
        [String(totals.matches), totals.matches === 1 ? 'PARTIDO' : 'PARTIDOS', false],
        [tile(totals.tries), totals.tries === 1 ? 'TRY' : 'TRIES', false],
        [tile(totals.points), 'PUNTOS', true],
    ];
    ctx.save();
    ctx.textAlign = 'center';
    columns.forEach(([value, label, highlight], index) => {
        const colX = panelX + panelWidth * ((index * 2 + 1) / 6);
        ctx.fillStyle = value === '—' ? getMutedColor(kit.isDark, 0.45) : highlight ? accentInk : text;
        ctx.font = `900 ${isStory ? 96 : 84}px ${FONT_OUTFIT_BLACK}`;
        ctx.fillText(value, colX, statTop + (isStory ? 188 : 164));
        ctx.fillStyle = muted;
        ctx.font = `700 ${isStory ? 20 : 17}px ${FONT_BODY}`;
        ctx.fillText(label, colX, statTop + (isStory ? 232 : 202));
    });
    ctx.strokeStyle = soft;
    ctx.lineWidth = 1;
    for (const fraction of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(panelX + panelWidth * fraction, statTop + 84);
        ctx.lineTo(panelX + panelWidth * fraction, statTop + statH - 28);
        ctx.stroke();
    }
    ctx.restore();

    // Forma reciente.
    const form = scope.matches.slice(0, 5);
    if (form.length > 0) {
        const formTop = statTop + statH + (isStory ? 26 : 20);
        const formH = Math.min(isStory ? 250 : 200, Math.max(150, kit.footerLimit - formTop));
        drawSurfacePanel(ctx, panelX, formTop, panelWidth, formH, 34, kit.isDark);
        drawPanelTitle(kit, 'FORMA', formTop, `Últimos ${form.length}`);
        const cellW = (panelWidth - 40) / 5;
        form.forEach((match, index) => {
            const own = match.side === 'away' ? match.away : match.home;
            const rival = match.side === 'away' ? match.home : match.away;
            const score = own.score !== null && rival.score !== null ? `${own.score}-${rival.score}` : '–';
            const cellX = panelX + 20 + cellW * index + cellW / 2;
            const pillY = formTop + (isStory ? 70 : 64) + 24;
            const bgColor = match.result === 'win' ? accent : match.result === 'loss' ? DANGER : getMutedColor(kit.isDark, 0.16);
            const fgColor = match.result === 'win' ? getContrastColor(accent) : match.result === 'loss' ? '#ffffff' : text;
            ctx.save();
            ctx.font = `900 ${isStory ? 28 : 24}px ${FONT_OUTFIT_BLACK}`;
            const pillW = Math.max(ctx.measureText(score).width + 28, isStory ? 92 : 80);
            const pillH = isStory ? 46 : 40;
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(cellX - pillW / 2, pillY - pillH / 2, pillW, pillH, 10);
            ctx.fill();
            ctx.fillStyle = fgColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(score, cellX, pillY + 1);
            ctx.restore();
            drawLogoBadge(ctx, {
                x: cellX,
                y: pillY + (isStory ? 76 : 64),
                size: isStory ? 64 : 54,
                img: assets.crests.get(crestKey(rival.id)) ?? null,
                label: rival.name,
                rawLogo: '',
                isDark: kit.isDark,
                showFrame: false,
            });
        });
    }
}

// ── placa 2: estadisticas ────────────────────────────────────────────────

type StatTile = { label: string; value: string; tone?: 'accent' | 'caution' | 'danger' };

function drawStatGroup(kit: Kit, title: string, tiles: StatTile[], columns: number, y: number): number {
    const { ctx, panelX, panelWidth, isStory, text, accentInk } = kit;
    const rows = Math.ceil(tiles.length / columns);
    const rowH = isStory ? 140 : 100;
    const titleH = isStory ? 64 : 56;
    const height = titleH + rows * rowH + 22;
    drawSurfacePanel(ctx, panelX, y, panelWidth, height, 34, kit.isDark);
    drawPanelTitle(kit, title, y);
    const cellW = (panelWidth - 40) / columns;
    ctx.save();
    ctx.textAlign = 'center';
    tiles.forEach((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const cx = panelX + 20 + cellW * col + cellW / 2;
        const cy = y + titleH + row * rowH;
        const empty = item.value === '—';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = empty
            ? getMutedColor(kit.isDark, 0.4)
            : item.tone === 'accent'
              ? accentInk
              : item.tone === 'caution'
                ? CAUTION
                : item.tone === 'danger'
                  ? DANGER
                  : text;
        ctx.font = `900 ${(isStory ? 60 : 50) * (empty ? 0.9 : 1)}px ${FONT_OUTFIT_BLACK}`;
        ctx.fillText(item.value, cx, cy + (isStory ? 68 : 54));
        ctx.fillStyle = kit.muted;
        fitFont(ctx, item.label, '700', isStory ? 17 : 15, FONT_BODY, cellW - 14, 10);
        ctx.fillText(item.label, cx, cy + (isStory ? 106 : 82));
    });
    ctx.restore();
    return height;
}

function drawStats(kit: Kit, profile: LocalPlayerProfile, assets: Assets, scope: Scope) {
    const { ctx, isStory, panelX, panelWidth, muted } = kit;
    drawHeaderPill(kit, 'ESTADÍSTICAS');
    let y = drawMiniHeader(kit, profile, assets, scope.label);
    const gap = isStory ? 24 : 18;
    const t = totalsOf(scope.matches);

    const groups: Array<{ title: string; tiles: StatTile[]; columns: number }> = [
        {
            title: 'RENDIMIENTO',
            columns: 4,
            tiles: [
                { label: 'PARTIDOS', value: String(t.matches) },
                { label: 'DE TITULAR', value: tile(t.starts) },
                { label: 'DESDE EL BANCO', value: tile(t.bench) },
                { label: 'MINUTOS', value: tile(t.minutes), tone: 'accent' },
            ],
        },
        {
            title: 'ANOTACIÓN',
            columns: 3,
            tiles: [
                { label: 'PUNTOS', value: tile(t.points), tone: 'accent' },
                { label: 'TRIES', value: tile(t.tries) },
                { label: 'CONVERSIONES', value: tile(t.conversions) },
                { label: 'PENALES', value: tile(t.penalties) },
                { label: 'DROPS', value: tile(t.dropGoals) },
                ...(t.kicksMissed > 0 ? [{ label: 'PATADAS FALLADAS', value: String(t.kicksMissed), tone: 'caution' as const }] : []),
            ],
        },
        {
            title: 'DISCIPLINA',
            columns: 2,
            tiles: [
                { label: 'AMARILLAS', value: tile(t.yellowCards), tone: t.yellowCards > 0 ? 'caution' : undefined },
                { label: 'ROJAS', value: tile(t.redCards), tone: t.redCards > 0 ? 'danger' : undefined },
            ],
        },
    ];

    for (const group of groups) {
        y += drawStatGroup(kit, group.title, group.tiles, group.columns, y) + gap;
    }

    // Otras acciones registradas (lines, scrums, patadas…), si entran.
    const actions = otherActionsOf(scope.matches).slice(0, 6);
    const titleH = isStory ? 64 : 56;
    const actionRowH = isStory ? 62 : 48;
    const actionsH = titleH + Math.ceil(actions.length / 2) * actionRowH + 18;
    if (actions.length > 0 && y + actionsH < kit.footerLimit - 40) {
        drawSurfacePanel(ctx, panelX, y, panelWidth, actionsH, 34, kit.isDark);
        drawPanelTitle(kit, 'OTRAS ACCIONES', y);
        ctx.save();
        ctx.textBaseline = 'middle';
        actions.forEach((action, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x0 = panelX + 26 + col * (panelWidth / 2);
            const cy = y + titleH + row * actionRowH + actionRowH / 2;
            ctx.textAlign = 'left';
            ctx.fillStyle = muted;
            const label = action.label.toUpperCase();
            fitFont(ctx, label, '700', isStory ? 19 : 16, FONT_BODY, panelWidth / 2 - 120, 11);
            ctx.fillText(label, x0, cy);
            ctx.textAlign = 'right';
            ctx.fillStyle = kit.text;
            ctx.font = `900 ${isStory ? 30 : 26}px ${FONT_OUTFIT_BLACK}`;
            ctx.fillText(String(action.count), x0 + panelWidth / 2 - 64, cy);
        });
        ctx.restore();
        y += actionsH + gap;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = getMutedColor(kit.isDark, 0.5);
    ctx.font = `600 ${isStory ? 18 : 15}px ${FONT_BODY}`;
    ctx.fillText('Un guion es sin registros: el dato sale de los eventos de cada planilla.', kit.W / 2, Math.min(y + 14, kit.footerLimit - 8));
    ctx.restore();
}

// ── placa 3: ultimos partidos ────────────────────────────────────────────

function contributionOf(match: PlayerProfileMatch): string {
    const parts: string[] = [];
    if (match.stats.tries > 0) parts.push(`${match.stats.tries} ${match.stats.tries === 1 ? 'TRY' : 'TRIES'}`);
    if (match.points > 0) parts.push(`${match.points} PTS`);
    return parts.join(' · ');
}

function drawMatches(kit: Kit, profile: LocalPlayerProfile, assets: Assets, scope: Scope) {
    const { ctx, isStory, panelX, panelWidth, text, muted, accent, accentInk } = kit;
    drawHeaderPill(kit, 'ÚLTIMOS PARTIDOS');
    const top = drawMiniHeader(kit, profile, assets, scope.label);
    const rows = scope.matches.slice(0, isStory ? 8 : 6);
    const titleH = isStory ? 64 : 56;

    if (rows.length === 0) {
        drawSurfacePanel(ctx, panelX, top, panelWidth, 220, 34, kit.isDark);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = muted;
        ctx.font = `700 ${isStory ? 26 : 22}px ${FONT_BODY}`;
        ctx.fillText('Todavía no hay partidos cargados.', kit.W / 2, top + 110);
        ctx.restore();
        return;
    }

    const rowH = Math.max(isStory ? 96 : 84, Math.min(isStory ? 150 : 118, Math.floor((kit.footerLimit - top - titleH - 24) / rows.length)));
    const listH = titleH + rows.length * rowH + 20;
    drawSurfacePanel(ctx, panelX, top, panelWidth, listH, 34, kit.isDark);
    drawPanelTitle(kit, `${rows.length} ${rows.length === 1 ? 'PARTIDO' : 'PARTIDOS'}`, top, scope.matches.length > rows.length ? `de ${scope.matches.length}` : undefined);

    rows.forEach((match, index) => {
        const rowY = top + titleH + index * rowH;
        const centerY = rowY + rowH / 2;
        ctx.save();
        if (index % 2 === 0) {
            ctx.fillStyle = hexToRGBA(accent, kit.isDark ? 0.06 : 0.04);
            ctx.beginPath();
            ctx.roundRect(panelX + 14, rowY + 3, panelWidth - 28, rowH - 6, 10);
            ctx.fill();
        }

        // Fecha y torneo a la izquierda.
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = text;
        ctx.font = `800 ${isStory ? 22 : 19}px ${FONT_BODY}`;
        ctx.fillText(formatShortDate(match.date), panelX + 28, centerY - (match.tournamentName ? 14 : 0));
        if (match.tournamentName) {
            ctx.fillStyle = getMutedColor(kit.isDark, 0.55);
            ctx.font = `700 ${isStory ? 15 : 13}px ${FONT_BODY}`;
            ctx.fillText(truncateToWidth(ctx, match.tournamentName.toUpperCase(), panelWidth * 0.24), panelX + 28, centerY + 14);
        }

        // Escudo - marcador - escudo, como fue (local primero).
        const scoreX = panelX + panelWidth * 0.52;
        const crestSize = Math.min(rowH - 18, isStory ? 60 : 52);
        const crestOffset = isStory ? 124 : 108;
        for (const side of ['home', 'away'] as const) {
            const team = match[side];
            drawLogoBadge(ctx, {
                x: scoreX + (side === 'home' ? -crestOffset : crestOffset),
                y: centerY,
                size: crestSize,
                img: assets.crests.get(crestKey(team.id)) ?? null,
                label: team.name,
                rawLogo: '',
                isDark: kit.isDark,
                showFrame: false,
            });
        }
        ctx.font = `900 ${isStory ? 34 : 30}px ${FONT_OUTFIT_BLACK}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = muted;
        ctx.fillText('-', scoreX, centerY);
        const half = ctx.measureText('-').width / 2;
        const winOwn = match.result === 'win';
        ctx.textAlign = 'right';
        ctx.fillStyle = match.side === 'home' && winOwn ? accentInk : text;
        ctx.fillText(match.home.score === null ? '–' : String(match.home.score), scoreX - half - 14, centerY);
        ctx.textAlign = 'left';
        ctx.fillStyle = match.side === 'away' && winOwn ? accentInk : text;
        ctx.fillText(match.away.score === null ? '–' : String(match.away.score), scoreX + half + 14, centerY);

        // Lo que hizo el jugador, a la derecha.
        const contribution = contributionOf(match);
        const meta = [match.role === 'starter' ? 'TITULAR' : match.role === 'bench' ? 'SUPLENTE' : null, match.minutes !== null ? `${match.minutes}'` : null]
            .filter(Boolean)
            .join(' · ');
        ctx.textAlign = 'right';
        const rightX = panelX + panelWidth - 28;
        if (contribution) {
            ctx.fillStyle = accentInk;
            ctx.font = `800 ${isStory ? 19 : 16}px ${FONT_BODY}`;
            ctx.fillText(contribution, rightX, centerY - (meta ? 13 : 0));
        }
        if (meta) {
            ctx.fillStyle = getMutedColor(kit.isDark, 0.55);
            ctx.font = `700 ${isStory ? 15 : 13}px ${FONT_BODY}`;
            ctx.fillText(meta, rightX, centerY + (contribution ? 15 : 0));
        }
        ctx.restore();
    });
}

// ── armado ───────────────────────────────────────────────────────────────

/**
 * La foto de fondo del torneo, a pantalla completa y recortada para cubrir.
 * Son los mismos JPEG que usan las placas de tablas y fixture
 * (`public/export-backgrounds`); llevan su color de fondo debajo y un velo
 * leve —el mismo 0,10 de los otros exports— para que los paneles asienten.
 */
function drawBackgroundPhoto(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    bg: string,
    isDark: boolean,
) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    ctx.fillStyle = isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export async function renderPlayerPlate(
    canvas: HTMLCanvasElement,
    profile: LocalPlayerProfile,
    plate: PlayerPlate,
    format: PlayerExportFormat,
    options: PlayerExportOptions,
    resolvedAccent?: string,
): Promise<void> {
    canvas.width = 1080;
    canvas.height = format === '9:16' ? 1920 : 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permitió dibujar la imagen.');

    await ensureExportFonts();
    const scope = scopeOf(profile, options.seasonKey);
    const accentRaw = resolvedAccent ?? (await resolvePlayerAccent(profile, options)).accent;

    // Assets: el escudo del club es obligatorio; el de los rivales y la foto, no.
    const wanted = plate === 'identidad' ? scope.matches.slice(0, 5) : scope.matches.slice(0, format === '9:16' ? 8 : 6);
    const rivalNames = new Map<string, string>();
    for (const match of wanted) {
        for (const team of [match.home, match.away]) if (team.id) rivalNames.set(team.id, team.name);
    }
    const rivalIds = [...rivalNames.keys()];
    const [clubCrest, photo, brand, ...rivalImages] = await Promise.all([
        profile.club ? loadImage(proxyUrl('team', profile.club.id, profile.club.name, 256)) : Promise.resolve(null),
        profile.photo && plate === 'identidad' ? loadImage(profile.photo) : Promise.resolve(null),
        loadImage('/icon.png'),
        ...rivalIds.map((id) => loadImage(proxyUrl('team', id, rivalNames.get(id) || '', 128))),
    ]);
    if (profile.club && !clubCrest) {
        throw new Error(`No se pudo cargar el escudo de ${profile.club.name}`);
    }
    const crests = new Map<string, HTMLImageElement | null>();
    rivalIds.forEach((id, index) => crests.set(crestKey(id), rivalImages[index] ?? null));

    const W = canvas.width;
    const H = canvas.height;
    const isStory = H > 1500;

    // Fondo: la foto del torneo (como en los otros exports) o el degradado liso.
    const background = resolveBackground(options, scope.tournamentName);
    const backgroundImage = background.image ? await loadImage(background.image) : null;
    const useImage = Boolean(backgroundImage && background.bg);
    const isDark = useImage ? !background.light : true;
    // Un acento muy oscuro se apaga sobre fondo oscuro; sobre foto clara se deja tal cual.
    const accent = isDark ? liftForDark(accentRaw) : accentRaw;
    const bg = useImage && background.bg ? background.bg : mixHex(BASE_BG, accent, 0.1);
    const panelX = isStory ? 46 : 54;
    const kit: Kit = {
        ctx,
        canvas,
        W,
        H,
        isStory,
        isDark,
        bg,
        accent,
        accentInk: contrast(accent, bg) >= 3 ? accent : getTextColor(isDark),
        text: getTextColor(isDark),
        muted: getMutedColor(isDark, 0.68),
        soft: getMutedColor(isDark, 0.1),
        panelX,
        panelWidth: W - panelX * 2,
        footerLimit: H - (isStory ? 126 : 108) - (isStory ? 40 : 34),
    };
    const assets: Assets = { clubCrest, photo, brand, crests };

    if (useImage && backgroundImage) {
        drawBackgroundPhoto(ctx, canvas, backgroundImage, bg, isDark);
    } else {
        drawBackdrop(ctx, canvas, bg, accent, isDark);
    }
    if (plate === 'identidad') drawIdentity(kit, profile, assets, scope);
    else if (plate === 'estadisticas') drawStats(kit, profile, assets, scope);
    else drawMatches(kit, profile, assets, scope);
    drawBrandFooter(ctx, canvas, brand, isDark);
}

export async function sharePlayerPlates(
    profile: LocalPlayerProfile,
    plates: PlayerPlate[],
    format: PlayerExportFormat,
    options: PlayerExportOptions,
): Promise<'shared' | 'downloaded'> {
    const { accent } = await resolvePlayerAccent(profile, options);
    const files: Array<{ blob: Blob; fileName: string }> = [];
    for (const plate of plates) {
        const canvas = document.createElement('canvas');
        await renderPlayerPlate(canvas, profile, plate, format, options, accent);
        files.push({
            blob: await canvasToBlob(canvas),
            fileName: `${slugify(profile.name, 'jugador')}-${plate}-${format === '4:5' ? '4x5' : '9x16'}.png`,
        });
    }
    return deliverPngs(files);
}
