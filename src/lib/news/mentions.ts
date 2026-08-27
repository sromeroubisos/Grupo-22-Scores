// Las menciones de una noticia: un club, un jugador, un torneo, un partido o
// un video de la web, etiquetados a lo largo del texto.
//
// En el cuerpo se escriben como `@[Los Tilos](club:<id>)`: la etiqueta que se
// lee, y entre paréntesis el tipo y el id. El editor las escribe solo (con `@`
// se busca y se elige); el lector las dibuja como link con escudo, y un
// partido o un video SOLO en su renglón sale como tarjeta o reproductor.
//
// Módulo puro: sin React, sin base. Lo comparten el parser, el lector, el
// editor y el buscador del servidor.

import type { MatchVideoLink } from '@/lib/matches/videoLinks';

export type MentionKind = 'club' | 'player' | 'tournament' | 'match' | 'video';

export const MENTION_KINDS: readonly MentionKind[] = ['club', 'player', 'tournament', 'match', 'video'];

export const MENTION_KIND_LABELS: Record<MentionKind, string> = {
    club: 'Club',
    player: 'Jugador',
    tournament: 'Torneo',
    match: 'Partido',
    video: 'Video',
};

export const MENTION_KIND_PLURALS: Record<MentionKind, string> = {
    club: 'Clubes',
    player: 'Jugadores',
    tournament: 'Torneos',
    match: 'Partidos',
    video: 'Videos',
};

/** Una mención tal como está escrita en el cuerpo. */
export interface MentionRef {
    kind: MentionKind;
    /** El id (uuid o slug); en un video, `<idPartido>/<idVideo>` o la URL del video. */
    ref: string;
    label: string;
}

export interface MentionTeam {
    id: string | null;
    name: string;
    logoUrl: string | null;
}

/** Un partido de la web, con lo que la tarjeta necesita para dibujarse. */
export interface MentionMatch {
    id: string;
    /** ISO en UTC. null si no tiene fecha. */
    dateTime: string | null;
    roundLabel: string | null;
    status: string | null;
    tournament: { id: string; name: string } | null;
    home: MentionTeam;
    away: MentionTeam;
    score: { home: number; away: number } | null;
}

/**
 * Una mención resuelta contra la web: lo que el buscador del editor devuelve
 * y lo que el lector recibe para dibujar la tarjeta. `label` es el nombre
 * actual de la entidad (el que se escribe al elegirla).
 */
export interface ResolvedMention {
    kind: MentionKind;
    ref: string;
    label: string;
    href: string;
    /** "Club · San Isidro", "Jugador · Los Tilos", "Top 14 · Fecha 19 · 22 ago". */
    detail: string | null;
    logoUrl: string | null;
    /** El partido, en una mención de partido o de video de la web. */
    match: MentionMatch | null;
    /** El video, en una mención de video de la web. */
    video: MatchVideoLink | null;
}

const ID_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const VIDEO_PAIR_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HTTP_REF = /^https?:\/\/[^\s)]+$/i;

export function isMentionKind(value: unknown): value is MentionKind {
    return typeof value === 'string' && (MENTION_KINDS as readonly string[]).includes(value);
}

/**
 * Si el id puede ir en un href sin sorpresas. Una entidad lleva un uuid o un
 * slug; un video, la pareja `<partido>/<video>` o una URL http(s).
 */
export function isValidMentionRef(kind: MentionKind, ref: string): boolean {
    if (kind === 'video') return VIDEO_PAIR_REF.test(ref) || HTTP_REF.test(ref);
    return ID_REF.test(ref);
}

/** true si la mención de video apunta a un video cargado en la web (y no a una URL suelta). */
export function isSiteVideoRef(ref: string): boolean {
    return VIDEO_PAIR_REF.test(ref);
}

export function splitVideoRef(ref: string): { matchId: string; videoId: string } | null {
    if (!isSiteVideoRef(ref)) return null;
    const slash = ref.indexOf('/');
    return { matchId: ref.slice(0, slash), videoId: ref.slice(slash + 1) };
}

/** La clave de una mención en un mapa: `tipo:id`. */
export function mentionKey(mention: Pick<MentionRef, 'kind' | 'ref'>): string {
    return `${mention.kind}:${mention.ref}`;
}

/** `tipo:id` → mención (sin etiqueta), o null si no está bien formada. */
export function parseMentionKey(key: string): Pick<MentionRef, 'kind' | 'ref'> | null {
    const colon = key.indexOf(':');
    if (colon < 1) return null;
    const kind = key.slice(0, colon);
    const ref = key.slice(colon + 1);
    if (!isMentionKind(kind) || !isValidMentionRef(kind, ref)) return null;
    return { kind, ref };
}

/**
 * A dónde lleva una mención cuando no hay nada resuelto: la ficha de la
 * entidad. Una selección o una jugadora del Mundial de hockey no viven en la
 * base, pero tienen ficha igual: su id lleva el torneo adelante
 * (`fih-wc-1867-ARG`, `fih-wc-1867-ARG-3968`) y `/clubs/[id]` y
 * `/players/[id]` lo resuelven contra el feed (ver `server/worldCupProfiles.ts`).
 */
export function hrefForMention(kind: MentionKind, ref: string): string {
    switch (kind) {
        case 'club': return `/clubs/${ref}`;
        case 'player': return `/players/${ref}`;
        case 'tournament': return `/tournaments/${ref}`;
        case 'match': return `/matches/${ref}`;
        case 'video': {
            const pair = splitVideoRef(ref);
            return pair ? `/matches/${pair.matchId}?tab=videos` : ref;
        }
        default: return '#';
    }
}

/** Cómo se escribe en el cuerpo: `@[Los Tilos](club:<id>)`. */
export function formatMention(mention: MentionRef): string {
    const label = mention.label.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim() || MENTION_KIND_LABELS[mention.kind];
    return `@[${label}](${mention.kind}:${mention.ref})`;
}

export function scoreLabelOf(match: Pick<MentionMatch, 'score'>): string | null {
    return match.score ? `${match.score.home}–${match.score.away}` : null;
}

/** "Los Tilos 33–15 CASI" o "Los Tilos vs CASI": el nombre de un partido. */
export function matchLabelOf(match: Pick<MentionMatch, 'home' | 'away' | 'score'>): string {
    const score = scoreLabelOf(match);
    return score ? `${match.home.name} ${score} ${match.away.name}` : `${match.home.name} vs ${match.away.name}`;
}

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "22 ago 2026", en hora argentina; igual en el servidor y en el navegador. */
export function matchDateLabel(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = get('day');
    const month = Number(get('month'));
    const year = get('year');
    return day && month && year ? `${day} ${MONTHS[month - 1]} ${year}` : null;
}

/** "Top 14 · Fecha 19 · 22 ago 2026": la línea de contexto de un partido. */
export function matchContextOf(match: Pick<MentionMatch, 'tournament' | 'roundLabel' | 'dateTime'>): string | null {
    const parts = [match.tournament?.name, match.roundLabel, matchDateLabel(match.dateTime)].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
}
