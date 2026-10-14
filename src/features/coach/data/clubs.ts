// Los clubes de El Entrenador. Salen del CANON del rugby argentino
// (`career/data/clubs2026/arSystem2026.ts`), el mismo que usa Carrera de Rugby:
// los nombres son los oficiales, cada club está en la división donde juega en
// 2026 y en el orden de fuerza que el canon declara. Acá no se declara ningún
// club ni ninguna división: se leen.
//
// Lo único propio de este archivo son DOS CONVERSIONES DE ESCALA. El canon mide
// la fuerza de 24 a 52 y el prestigio de 20 a 52; el motor de El Entrenador fue
// calibrado contra 286 partidos reales con fuerza de 4 a 48. Se reescala
// linealmente: el orden del canon se conserva entero, y el dado
// (`engine/match.ts`) sigue midiendo lo que midió. La reputación va de 10 a 47:
// con piso 2 (el del catálogo viejo) las divisiones de base del canon —que
// comparten todas el prestigio mínimo— quedaban con 265 socios y cerraban el año
// 1 en rojo de punta a punta. Medido división por división.
//
// Ciudad, unión y colores vienen de `club-meta.generated.ts`. Si un club no los
// tiene verificados, quedan vacíos y `pending` lo dice: la pantalla no inventa
// una ciudad.

import {
    AR_DIVISIONS,
    AR_RATING_MAX,
    AR_RATING_MIN,
    AR_SYSTEM_VERSION,
    arPrestigeOf,
    arRatingAt,
    type ArRegion,
} from '../../career/data/clubs2026/arSystem2026.ts';
import { CLUB_META } from './club-meta.generated.ts';

/** Sube cuando cambia el canon o la tabla de metadatos. */
export const CLUB_CATALOG_VERSION = `canon-${AR_SYSTEM_VERSION}+meta-1`;

export interface ClubDef {
    /** El mismo id que en Carrera de Rugby. */
    id: string;
    /** Nombre oficial, tal como lo declara el canon. */
    name: string;
    /** Para tablas y placas. Hoy es el mismo nombre: el canon ya usa el corto. */
    short: string;
    /** Tres letras, para la tabla angosta de mobile y el escudo de respaldo. */
    code: string;
    /** Unión, si está verificada; cadena vacía si no. */
    unionId: string;
    /** Región del canon: la URBA es su propia rama, el resto son regiones del interior. */
    regionId: ArRegion;
    city: string;
    prov: string;
    /** Fuerza en la escala del motor (4..48). `engine/squad.ts` la convierte a jugadores. */
    rating: number;
    /** Reputación institucional (10..47). Mueve la caja y la presión, no el resultado. */
    rep: number;
    c1: string;
    c2: string;
    /** Escudo real, o null si no hay PNG: se dibuja el de respaldo. */
    crest: string | null;
    /** División donde juega en 2026, según el canon. */
    homeCompetitionId: string;
    /** Ciudad y unión sin verificar. */
    pending: boolean;
}

const COACH_RATING_MIN = 4;
const COACH_RATING_MAX = 48;
const PRESTIGE_MIN = 20;
const PRESTIGE_MAX = 52;
const REP_MIN = 10;
const REP_MAX = 47;

/** Fuerza del canon (y del catálogo de Carrera, que usa la misma escala) → escala del motor. */
export function toCoachRating(canon: number): number {
    const t = (canon - AR_RATING_MIN) / (AR_RATING_MAX - AR_RATING_MIN);
    return Math.round((COACH_RATING_MIN + t * (COACH_RATING_MAX - COACH_RATING_MIN)) * 10) / 10;
}

function toCoachRep(prestige: number): number {
    const t = (prestige - PRESTIGE_MIN) / (PRESTIGE_MAX - PRESTIGE_MIN);
    return Math.round(REP_MIN + Math.min(1, Math.max(0, t)) * (REP_MAX - REP_MIN));
}

const STOP = /^(de|del|la|el|los|las|y|club|rugby|rc|r\.c\.)$/i;

/** Las iniciales del nombre oficial: "Universitario de La Plata" → "ULP". */
export function codeOf(name: string): string {
    const words = name.split(/[\s.]+/).filter((w) => w.length > 0 && !STOP.test(w));
    if (words.length >= 2) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
    return (words[0] ?? name).replace(/[^\p{L}]/gu, '').slice(0, 3).toUpperCase();
}

function build(): ClubDef[] {
    const out: ClubDef[] = [];
    for (const division of AR_DIVISIONS) {
        division.clubs.forEach((name, index) => {
            const meta = CLUB_META[name];
            if (!meta) throw new Error(`"${name}" está en el canon y no en club-meta: corré scripts/build-coach-canon-meta.ts`);
            out.push({
                id: meta.id,
                name,
                short: name,
                code: codeOf(name),
                unionId: meta.unionId,
                regionId: division.region,
                city: meta.city,
                prov: meta.prov,
                rating: toCoachRating(arRatingAt(division, index)),
                rep: toCoachRep(arPrestigeOf(division, name, index)),
                c1: meta.c1,
                c2: meta.c2,
                crest: meta.crest,
                homeCompetitionId: division.competitionId,
                pending: meta.city === '',
            });
        });
    }
    // Orden estable por id: no puede depender del recorrido de las divisiones.
    return out.sort((a, b) => a.id.localeCompare(b.id));
}

export const CLUBS: readonly ClubDef[] = build();

const BY_ID = new Map(CLUBS.map((c) => [c.id, c]));

export function getClub(id: string): ClubDef | null {
    return BY_ID.get(id) ?? null;
}

/** Escudo por id, para lo que necesita el mapa entero. */
export const CLUB_CRESTS: Readonly<Record<string, string>> = Object.fromEntries(
    CLUBS.filter((c) => c.crest).map((c) => [c.id, c.crest as string]),
);

/**
 * Id viejo (catálogo de rugby-manager-pro) → id del canon. Lo usa el migrador
 * del guardado: una partida empezada con el catálogo viejo sigue con el mismo
 * club, que ahora se llama como corresponde.
 */
export const LEGACY_CLUB_IDS: Readonly<Record<string, string>> = Object.fromEntries(
    Object.values(CLUB_META)
        .filter((m) => m.legacyId)
        .map((m) => [m.legacyId as string, m.id]),
);
