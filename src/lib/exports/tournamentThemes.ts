/**
 * El fondo y los colores PREDETERMINADOS de los exports de cada torneo.
 *
 * La regla es del dueño: cada nivel de competencia tiene su fondo (los JPEG de
 * `public/export-backgrounds`, sin el rotulo de "Salida de 22") y su acento.
 * Solo se aplica al super administrador (ver `ExportImage`): el resto de la gente
 * exporta con el diseno y los colores de siempre.
 *
 * El torneo se reconoce por su NOMBRE, porque es lo unico que traen todas las
 * placas. Las reglas van en orden y gana la primera: lo internacional y lo de
 * otros paises antes que lo argentino, y dentro de lo argentino los regionales
 * (rojo) antes que el ascenso (dorado) y los juveniles (negro).
 */

export type TournamentExportTheme = {
    id: string;
    /** Ruta publica del fondo propio. */
    image: string;
    /** Color de fondo de la placa: el de la foto, para que el de base del diseno no se mezcle. */
    bg: string;
    /** Foto clara: la placa pasa a su version clara para que el texto se lea. */
    light?: boolean;
    /** Color de acento de la placa. */
    accent: string;
    /** Color con el que se resalta la estadistica elegida en las estadisticas. */
    highlight: string;
};

const IMG = '/export-backgrounds/';

export const TOURNAMENT_THEMES = {
    regional: { id: 'regional', image: `${IMG}rojo.jpg`, bg: '#6d0b11', accent: '#ffffff', highlight: '#ffffff' },
    ascenso: { id: 'ascenso', image: `${IMG}dorado.jpg`, bg: '#503308', accent: '#eab308', highlight: '#fde68a' },
    juvenil: { id: 'juvenil', image: `${IMG}negro.jpg`, bg: '#181818', accent: '#22c55e', highlight: '#ffffff' },
    uruguay: { id: 'uruguay', image: `${IMG}azul.jpg`, bg: '#0b416b', accent: '#ffffff', highlight: '#7dd3fc' },
    brasil: { id: 'brasil', image: `${IMG}verde.jpg`, bg: '#1c2b2a', accent: '#ffffff', highlight: '#86efac' },
    espana: { id: 'espana', image: `${IMG}rojo.jpg`, bg: '#6d0b11', accent: '#ffffff', highlight: '#facc15' },
    top14Francia: { id: 'top14-francia', image: `${IMG}negro.jpg`, bg: '#181818', accent: '#eab308', highlight: '#fde68a' },
    premiership: { id: 'premiership', image: `${IMG}naranja.jpg`, bg: '#c05910', accent: '#ffffff', highlight: '#ffffff' },
    urc: { id: 'urc', image: `${IMG}azul.jpg`, bg: '#0b416b', accent: '#22d3ee', highlight: '#a5f3fc' },
    superRugbyAmericas: { id: 'super-rugby-americas', image: `${IMG}negro.jpg`, bg: '#181818', accent: '#22c55e', highlight: '#ffffff' },
    europa: { id: 'europa', image: `${IMG}negro.jpg`, bg: '#181818', accent: '#ffffff', highlight: '#eab308' },
    seisNaciones: { id: 'seis-naciones', image: `${IMG}rojo-naranja.jpg`, bg: '#9c2506', accent: '#ffffff', highlight: '#fde68a' },
    chileTop: { id: 'chile-top', light: true, image: `${IMG}blanco.jpg`, bg: '#f1f5f9', accent: '#dc2626', highlight: '#dc2626' },
    chileAscenso: { id: 'chile-ascenso', light: true, image: `${IMG}blanco.jpg`, bg: '#f1f5f9', accent: '#1d4ed8', highlight: '#1d4ed8' },
    nationsChampionship: { id: 'nations-championship', image: `${IMG}verde.jpg`, bg: '#1c2b2a', accent: '#facc15', highlight: '#ffffff' },
    celeste: { id: 'celeste', image: `${IMG}cian.jpg`, bg: '#167c95', accent: '#ffffff', highlight: '#ffffff' },
} as const satisfies Record<string, TournamentExportTheme>;

function normalize(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[“”"']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

/** Clubes y ligas de Europa distintas del Seis Naciones (negro, acento blanco). */
const EUROPE = /\b(pro d2|nationale|champions cup|challenge cup|all ireland|serie a elite|coppa italia|bundesliga|ekstraliga|extraliga|ereklasse|liga nationala|didi 10|sm-sarja|cn honra|super xv|super rygbi|super series|premier league|elite 1|supersevens|championship rugby|championship cup|unions cup|tbilisi|clasificatorio europeo|rugby europe)\b/;

/** Lo que va por debajo de los regionales en Argentina (fondo dorado). */
const ASCENSO = /\b(ascenso|primera [abc]\b|desarrollo|segunda|tercera|super 9|regional centro|preintermedia|intermedia|iniciacion|bi uniones|copa plata|torneo anual|interior|werentizky|apertura|austral|tierra del fuego|empresarial|formativo|superior|cordobes|tucuman|pampeano b|litoral b|noa [bc]|top 13|top 12|top 8|ten|seven)\b/;

/** Juveniles (fondo negro, acento verde). */
const JUVENIL = /\b(juvenil|juveniles|m ?1[3-9]|sub ?\d{2}|u ?(18|20)|m23|m-23|ucr juveniles|argentino juvenil)\b/;

/**
 * El tema del torneo, o `null` si no esta en las reglas (la placa queda con su
 * diseno y sus colores de siempre).
 */
export function resolveTournamentExportTheme(tournamentName: string | null | undefined): TournamentExportTheme | null {
    const name = normalize(tournamentName || '');
    if (!name) return null;
    const T = TOURNAMENT_THEMES;

    // ── Internacionales ────────────────────────────────────────────────
    if (has(name, /nations championship/)) return T.nationsChampionship;
    if (has(name, /(autumn )?nations cup/) || has(name, /^rugby championship$/)) return T.celeste;
    if (has(name, /six nations|seis naciones/)) return T.seisNaciones;

    // ── Superligas ─────────────────────────────────────────────────────
    if (has(name, /super rugby americas/)) return T.superRugbyAmericas;
    if (has(name, /united rugby championship|\burc\b|super rugby/)) return T.urc;
    if (has(name, /premiership/)) return T.premiership;
    if (has(name, /\btop 14\b/) && !has(name, /urba/)) return T.top14Francia;

    // ── Otros paises ───────────────────────────────────────────────────
    if (has(name, /uruguay/)) return T.uruguay;
    if (has(name, /brasil|brasileir|super 12|cbru/)) return T.brasil;
    if (has(name, /division de honor|liga iberdrola|competicion nacional m23|federacion espanola/)) return T.espana;
    if (has(name, /arusa/)) {
        // Primera / Top 10: blanco con rojo. Todo el ascenso: blanco con azul.
        return has(name, /^(top 10|(m ?\d+ )?primera)\b/) ? T.chileTop : T.chileAscenso;
    }
    if (has(name, EUROPE)) return T.europa;

    // ── Argentina ──────────────────────────────────────────────────────
    if (has(name, JUVENIL)) return T.juvenil;
    if (has(name, /ascenso/)) return T.ascenso;
    if (has(name, /top 14 de la urba|urba top 14|urba: top 14/)) return T.regional;
    if (has(name, /top 10 del centro|copa oro del oeste|torneo regional del nea\b|norpatagonico|patagonico|regional pampeano\b|regional del litoral a|regional del noa a\b/)) {
        // "Pampeano B", "NOA A - Intermedia"... son escalones de abajo.
        return has(name, /pampeano b|intermedia/) ? T.ascenso : T.regional;
    }
    if (has(name, ASCENSO)) return T.ascenso;
    return null;
}
