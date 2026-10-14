// La pirámide argentina de clubes, LEÍDA DEL CANON.
//
// Las divisiones, sus nombres oficiales, sus ascensos y descensos y los cupos al
// Torneo del Interior se declaran en `career/data/clubs2026/arSystem2026.ts` y se
// leen de ahí: El Entrenador y Carrera de Rugby juegan sobre la misma estructura.
// Antes este archivo traía una pirámide propia portada de rugby-manager-pro, con
// la URBA en cuatro escalones y torneos que no se llaman así; ya no.
//
// Lo que este archivo SÍ decide es qué divisiones se pueden jugar: una liga
// necesita por lo menos cuatro clubes. Las que el canon declara incompletas (la
// Copa de Bronce del Oeste tiene dos) no se juegan y no se rellenan con clubes
// inventados.
//
// CÓMO se juega cada división —ruedas, playoff, ascensos directos, reducido,
// descensos— NO está acá: está en `formats.ts`, edición por edición, porque las
// reglas cambian de un año a otro. Antes este archivo derivaba el formato de la
// cantidad de clubes (semis y final para cualquier división de ocho o más), y por
// eso el primero de la Primera C de la URBA tenía que jugar un playoff que el
// reglamento 2026 no tiene.
//
// Es CATÁLOGO, no lógica: tiene su propia versión en el guardado.

import {
    AR_DIVISIONS,
    AR_PENDING_ROSTERS,
    AR_REGION_LABEL,
    AR_SPORTING_BAND,
    AR_SYSTEM_VERSION,
    NACIONAL_DE_CLUBES_ID,
    TDI_A_ID as CANON_TDI_A_ID,
    TDI_A_SLOTS,
    TDI_CUPOS_2026,
    type ArDivision,
    type ArRegion,
} from '../../career/data/clubs2026/arSystem2026.ts';
import { FORMATS_VERSION, formatFor, regularFechas } from './formats.ts';
import { PROFESSIONALISM_VERSION } from './professionalism.ts';
import { TRANSFER_PATHWAYS_VERSION } from './transfer-pathways.ts';

/**
 * Compuesta: el canon, los formatos por edición, el estatus económico de cada
 * división (`professionalism.ts`) y las vías declaradas al exterior
 * (`transfer-pathways.ts`, desde la etapa 3: una oferta guardada nombra su vía).
 * Cambiar cualquiera invalida lo que una partida en curso sabe de su división,
 * y el saneado lo repara.
 */
export const COMPETITION_CATALOG_VERSION = `canon-${AR_SYSTEM_VERSION}+formatos-${FORMATS_VERSION}+estatus-${PROFESSIONALISM_VERSION}+vias-${TRANSFER_PATHWAYS_VERSION}`;

export type CompetitionScope = 'national' | 'regional' | 'union';

export interface CompetitionDef {
    id: string;
    /** Nombre oficial, como lo declara el canon. */
    name: string;
    /** Nombre corto, para la cabecera y la tabla angosta. */
    short: string;
    /**
     * Escalón económico y de contenido, 2 (Top 14) a 5 (la base). Sale de la banda
     * deportiva del canon: los siete niveles del canon caen en cuatro escalones.
     * NO ordena el ascenso: eso lo dice el grafo (`promotesTo` / `relegatesTo`).
     */
    level: number;
    /** Nivel del canon, 1 (élite) a 7 (base). */
    canonLevel: number;
    scope: CompetitionScope;
    /** Región del canon dueña del torneo. */
    ownerId: ArRegion;
    teams: number;
    promotesTo: string | null;
    relegatesTo: string | null;
    /**
     * División a la que el canon dice que asciende el campeón cuando la de arriba
     * NO le devuelve descensos (los desarrollos que alimentan a otra división).
     * Se muestra, pero no mueve a nadie: sin un descenso de vuelta, la división
     * de arriba crecería sola cada año.
     */
    feedsInto: string | null;
    /** Plazas al Torneo del Interior A de la REGIÓN, por posición final (`TDI_CUPOS_2026`). */
    tdiSlots: number;
    members: { regions?: readonly string[]; unions?: readonly string[] };
    /** El formato real, cuando el canon lo describe. Se muestra tal cual. */
    note: string | null;
    /** La nómina no está completa en la fuente (`AR_PENDING_ROSTERS`). */
    pendingRoster: string | null;
}

/** El Torneo del Interior A: la copa nacional del interior. */
export const TDI_A_ID = CANON_TDI_A_ID;
/** El Nacional de Clubes: el campeón del Top 14 contra el del TDI A. */
export const NACIONAL_ID = NACIONAL_DE_CLUBES_ID;
/** La primera de la URBA. Se referencia por su ROL, nunca por su nombre. */
export const URBA_TOP_ID = 'ar-urba-top14';

/** Una liga necesita esto para jugarse. Con menos, la división queda declarada y no se juega. */
export const MIN_LEAGUE_TEAMS = 4;

/** Nombres cortos. Donde el canon ya es corto, se usa el canon. */
const SHORT: Readonly<Record<string, string>> = {
    'ar-centro-top10': 'Top 10 A',
    'ar-centro-super9b': 'Súper 9 B',
    'ar-litoral-top10': 'Top 10 Litoral',
    'ar-litoral-segunda': 'Segunda Litoral',
    'ar-oeste-oro': 'Copa de Oro',
    'ar-oeste-plata': 'Copa de Plata',
    'ar-oeste-bronce': 'Copa de Bronce',
    'ar-noa-a': 'NOA A',
    'ar-noa-b': 'NOA B',
    'ar-noa-andina': 'Torneo Andino',
    'ar-nea-a': 'NEA A',
    'ar-nea-bc': 'NEA B/C',
    'ar-pampeana-a': 'Pampeano A',
    'ar-pampeana-b': 'Pampeano B',
    'ar-pampeana-uroba-sur': 'UROBA-Sur',
    'ar-patagonia-regional': 'Patagónico',
    'ar-patagonia-austral': 'Torneo Austral',
    'ar-patagonia-alto-valle': 'Alto Valle',
    'ar-patagonia-tdf': 'Tierra del Fuego',
    'ar-patagonia-santacruz': 'Santacruceño',
    'ar-patagonia-chubut-desarrollo': 'Desarrollo Chubut',
};

function shortOf(d: ArDivision): string {
    return SHORT[d.competitionId] ?? d.label.replace(/ de la URBA$/, '');
}

const PLAYABLE = new Set(AR_DIVISIONS.filter((d) => d.clubs.length >= MIN_LEAGUE_TEAMS).map((d) => d.competitionId));

function toCompetition(d: ArDivision): CompetitionDef {
    const teams = d.clubs.length;
    // Un enlace hacia una división que no se juega no mueve a nadie.
    const target = d.promotesTo && PLAYABLE.has(d.promotesTo) ? d.promotesTo : null;
    // Un ascenso es de ida y vuelta: la de arriba tiene que descender acá.
    const paired = target !== null && AR_DIVISIONS.find((x) => x.competitionId === target)?.relegatesTo === d.competitionId;
    const promotesTo = paired ? target : null;
    const relegatesTo = d.relegatesTo && PLAYABLE.has(d.relegatesTo) ? d.relegatesTo : null;
    return {
        id: d.competitionId,
        name: d.label,
        short: shortOf(d),
        level: 5 - AR_SPORTING_BAND[d.canonLevel],
        canonLevel: d.canonLevel,
        scope: d.branch === 'urba' ? 'union' : 'regional',
        ownerId: d.region,
        teams,
        promotesTo,
        relegatesTo,
        feedsInto: paired ? null : target,
        tdiSlots: TDI_CUPOS_2026.find((c) => c.sourceCompetitionId === d.competitionId)?.tdiA ?? 0,
        members: { regions: [d.region] },
        note: d.note ?? null,
        pendingRoster: AR_PENDING_ROSTERS.find((p) => p.competitionId === d.competitionId)?.note ?? null,
    };
}

/** Las ligas que se juegan. El TDI y el Nacional son de eliminación: viven en engine/knockout.ts. */
export const COMPETITIONS: readonly CompetitionDef[] = AR_DIVISIONS.filter((d) => PLAYABLE.has(d.competitionId)).map(
    toCompetition,
);

/** Las divisiones del canon que el juego todavía no puede jugar, con el motivo. */
export const UNPLAYABLE_COMPETITIONS: readonly { id: string; name: string; reason: string }[] = AR_DIVISIONS.filter(
    (d) => !PLAYABLE.has(d.competitionId),
).map((d) => ({
    id: d.competitionId,
    name: d.label,
    reason: `Tiene ${d.clubs.length} clubes identificados: la nómina completa no está publicada y no se inventa.`,
}));

const BY_ID = new Map(COMPETITIONS.map((c) => [c.id, c]));

export function getCompetition(id: string): CompetitionDef | null {
    return BY_ID.get(id) ?? null;
}

/**
 * Las fechas de fase regular que juega un club de esa división ESE año. Sale
 * del formato de la edición (`formats.ts`): la economía y la cabecera la
 * necesitan, y no puede depender de una cuenta fija de ruedas.
 */
export function fechasOf(competitionId: string, year: number): number {
    const teams = BY_ID.get(competitionId)?.teams ?? 10;
    return regularFechas(formatFor(competitionId, year), teams);
}

/** Nombre mostrable de cualquier torneo, incluidos los de eliminación. */
export function competitionName(id: string): string {
    if (id === TDI_A_ID) return 'Torneo del Interior A';
    if (id === NACIONAL_ID) return 'Nacional de Clubes';
    return BY_ID.get(id)?.name ?? AR_DIVISIONS.find((d) => d.competitionId === id)?.label ?? id;
}

/** Nombre de la región del canon, para filtros y fichas. */
export function regionName(region: ArRegion): string {
    return AR_REGION_LABEL[region];
}

/** Tamaño del Torneo del Interior A. Las `tdiSlots` suman esto: hay un test. */
export const TDI_TEAMS = TDI_A_SLOTS;

/** El torneo de arriba de la rama, o null si es el techo. */
export function tierAbove(id: string): CompetitionDef | null {
    const comp = BY_ID.get(id);
    return comp?.promotesTo ? (BY_ID.get(comp.promotesTo) ?? null) : null;
}

/** El torneo de abajo de la rama, o null si es el piso. */
export function tierBelow(id: string): CompetitionDef | null {
    const comp = BY_ID.get(id);
    return comp?.relegatesTo ? (BY_ID.get(comp.relegatesTo) ?? null) : null;
}
