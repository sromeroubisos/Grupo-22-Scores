// La portada generada de un video: una placa con la estética de G22 Base
// (color pleno de esquina a esquina, titular ETAPA - TORNEO, escudos y
// marcador, y el título del video). Se dibuja en el DOM a partir del partido,
// no es una imagen guardada: siempre muestra el marcador y el título actuales,
// y lo que se persiste es la elección (`poster: 'generated'` en el link).
//
// Módulo puro: colores y textos. El dibujo vive en components/video/VideoPlate.
// Los colores calcan `getG22PlateTone` de ExportImage.tsx: el campo es el color
// del torneo o el navy de la casa, la otra punta del degradado es ese mismo
// color hundido, y la tinta la decide el contraste.

export interface VideoPlateTeam {
    name: string;
    logoUrl?: string | null;
}

export interface VideoPlateContext {
    tournamentName: string | null;
    /** "Fecha 19", "Final": la ETAPA del titular. */
    roundLabel: string | null;
    sportId: string | null;
    home: VideoPlateTeam;
    away: VideoPlateTeam;
    score: { home: number; away: number } | null;
    /** Colores del torneo, si los tiene. Sin ellos, la paleta de la casa. */
    fieldColor?: string | null;
    accentColor?: string | null;
}

export interface VideoPlateTone {
    field: string;
    fieldEnd: string;
    ink: string;
    accent: string;
    isDark: boolean;
}

/** "Salida Azul": el navy de la casa con su luz eléctrica. */
const DEFAULT_BG = '#050b1f';
const DEFAULT_ACCENT = '#1f4dff';
const BRAND_ACCENT = '#00a365';

const PLATE_MARKS = {
    salida22: '/marcas/salida-de-22.png',
    cornerCorto: '/marcas/corner-corto.png',
    g22tv: '/marcas/grupo-22-tv.png',
} as const;

export const PLATE_WORDMARK = '/header-logo.png';

export function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`. Cualquier otra cosa → null. */
export function normalizeHexColor(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
    if (/^[0-9a-f]{3}$/.test(value)) return `#${value.split('').map((c) => c + c).join('')}`;
    return null;
}

export function mixHexColors(colorA: string, colorB: string, ratio: number): string {
    if (!isHexColor(colorA) || !isHexColor(colorB)) return colorA;
    const weight = Math.max(0, Math.min(1, ratio));
    const channel = (offset: number) => {
        const a = parseInt(colorA.slice(offset, offset + 2), 16);
        const b = parseInt(colorB.slice(offset, offset + 2), 16);
        return Math.round(a + (b - a) * weight).toString(16).padStart(2, '0');
    };
    return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Tinta que se lee sobre ese color (YIQ, el mismo corte que el export). */
export function contrastInk(hex: string): '#0f172a' | '#ffffff' {
    if (!isHexColor(hex)) return '#0f172a';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#0f172a' : '#ffffff';
}

export function plateTone(context: Pick<VideoPlateContext, 'fieldColor' | 'accentColor'>): VideoPlateTone {
    const primary = normalizeHexColor(context.fieldColor);
    const secondary = normalizeHexColor(context.accentColor);

    // Con color de torneo, la placa ES ese color (pleno). Sin él, la paleta de
    // la casa mezclada como en el export: el fondo casi negro solo no es placa.
    const field = primary ?? mixHexColors(DEFAULT_BG, DEFAULT_ACCENT, 0.58);
    const accent = secondary ?? (primary ? BRAND_ACCENT : DEFAULT_ACCENT);
    const ink = contrastInk(field);
    const isDark = ink === '#ffffff';
    const fieldEnd = mixHexColors(field, isDark ? '#000000' : '#1f2937', isDark ? 0.42 : 0.16);

    return { field, fieldEnd, ink, accent, isDark };
}

/** La marca del medio que cubre ese deporte, como en la placa del export. */
export function plateMarkSource(sportId: string | null | undefined): string {
    const sport = (sportId ?? '').trim().toLowerCase();
    if (sport.startsWith('rugby')) return PLATE_MARKS.salida22;
    if (sport === 'field-hockey' || sport === 'hockey') return PLATE_MARKS.cornerCorto;
    return PLATE_MARKS.g22tv;
}

export interface PlateHeadline {
    stage: string | null;
    tournament: string | null;
    /** "FECHA 19 - TOP 14 DE LA URBA". Vacío si no hay nada que decir. */
    text: string;
}

function clean(value: string | null | undefined): string | null {
    const text = (value ?? '').replace(/\s+/g, ' ').trim();
    return text ? text.toUpperCase() : null;
}

export function plateHeadline(context: Pick<VideoPlateContext, 'roundLabel' | 'tournamentName'>): PlateHeadline {
    const stage = clean(context.roundLabel);
    const tournament = clean(context.tournamentName);
    // Si el torneo ya trae la etapa ("FINAL - TRL M19"), esa partición manda.
    const carriesStage = Boolean(tournament && /\s[-|]\s/.test(tournament));
    const text = [carriesStage ? null : stage, tournament].filter(Boolean).join(' - ');
    return { stage, tournament, text };
}

/** "33-15", o "VS" si el partido no tiene marcador. */
export function plateScoreText(score: VideoPlateContext['score']): string {
    return score ? `${score.home}-${score.away}` : 'VS';
}

/**
 * Lo que va escrito abajo: el título del video. Si no tiene, el tipo
 * ("Highlights"); el tipo va aparte como etiqueta cuando el título es propio.
 */
export function plateCaption(video: { title: string | null; kindLabel: string }): { title: string; kind: string | null } {
    const title = (video.title ?? '').trim();
    if (!title) return { title: video.kindLabel, kind: null };
    // "Highlights" con la etiqueta "Highlights" al lado dice lo mismo dos veces.
    const repeatsKind = title.localeCompare(video.kindLabel, 'es', { sensitivity: 'base' }) === 0;
    return { title, kind: repeatsKind ? null : video.kindLabel };
}
