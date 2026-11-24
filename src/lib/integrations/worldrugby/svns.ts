/**
 * Circuito HSBC SVNS en la BASE: SVNS 2 y SVNS 3 de seis equipos todos contra todos.
 *
 * El modelo es el del SVNS 2 que ya estaba cargado a mano: un torneo `circuit` por
 * categoría y género, con UNA fase de liga por etapa (fin de semana) y puntos por puesto
 * (20, 18, 16…) que suman la tabla general. Lo nuevo es que los partidos, los marcadores
 * en vivo y la cronología salen de la API de World Rugby (la misma que usa svns.com) y los
 * mantiene `/api/cron/worldrugby-sync`.
 *
 * SVNS 1 y el World Championship (12 equipos, grupos y cuadro) NO están acá: siguen
 * saliendo en vivo desde `services/worldRugbyEvent.ts`, sin pasar por la base.
 *
 * Este módulo es PURO: entra JSON, sale dato. Sin red ni base. Lo prueba `svns.test.ts`.
 */

import {
    SVNS_DB_STAGES,
    wrCountryEs,
    type WrEventDef,
    type WrFixture,
    type WrSide,
} from '../../services/worldRugbyEventParser.ts';

export const SVNS_DB_PROVIDER = 'worldrugby';
export const SVNS_EXTERNAL_PREFIX = 'worldrugby:';

// --------------------------------------------------------------------------
// Catálogo de circuitos
// --------------------------------------------------------------------------

export type NivelSvns = 'svns2' | 'svns3';
export type GeneroSvns = 'm' | 'w';

export interface EtapaSvns {
    /** `wr-svns2-2026-nairobi-m`: el id del evento en el registro. */
    clave: string;
    def: WrEventDef;
    nombre: string;
    desde: string;
    hasta: string;
}

export interface CircuitoSvns {
    /** `svns2-2026-m`. Va en `tournaments.external_id` como `worldrugby:svns2-2026-m`. */
    clave: string;
    externalId: string;
    nivel: NivelSvns;
    /** Año con el que World Rugby nombra la temporada (2026 = 2025-26, 2027 = 2026-27). */
    temporada: string;
    genero: GeneroSvns;
    nombre: string;
    slug: string;
    /** El torneo que ya existía cargado a mano y se revincula en vez de crearse. */
    slugExistente: string | null;
    etapas: EtapaSvns[];
}

const ID_ETAPA = /^wr-(svns2|svns3)-(\d{4})-(.+)-([mw])$/;

const TIER_NOMBRE: Record<NivelSvns, string> = { svns2: 'SVNS 2', svns3: 'SVNS 3' };

/** "2027" → "2026-27". */
export function temporadaLabel(temporada: string): string {
    return `${Number(temporada) - 1}-${temporada.slice(2)}`;
}

export function armarCircuitos(stages: readonly WrEventDef[] = SVNS_DB_STAGES): CircuitoSvns[] {
    const grupos = new Map<string, CircuitoSvns>();
    for (const def of stages) {
        const m = ID_ETAPA.exec(def.tournamentId);
        if (!m || !def.window) continue;
        const nivel = m[1] as NivelSvns;
        const temporada = m[2];
        const genero = m[4] as GeneroSvns;
        const clave = `${nivel}-${temporada}-${genero}`;
        let c = grupos.get(clave);
        if (!c) {
            const generoNombre = genero === 'm' ? 'Masculino' : 'Femenino';
            // La temporada 2025-26 de SVNS 2 ya existe con este nombre y slug.
            const esExistente = nivel === 'svns2' && temporada === '2026';
            const sufijo = esExistente ? '' : ` ${temporadaLabel(temporada)}`;
            c = {
                clave,
                externalId: `${SVNS_EXTERNAL_PREFIX}${clave}`,
                nivel,
                temporada,
                genero,
                nombre: `${TIER_NOMBRE[nivel]} - ${generoNombre}${sufijo}`,
                slug: `${TIER_NOMBRE[nivel].toLowerCase().replace(' ', '-')}-${generoNombre.toLowerCase()}${esExistente ? '' : `-${temporadaLabel(temporada)}`}`,
                slugExistente: esExistente ? `svns-2-${generoNombre.toLowerCase()}` : null,
                etapas: [],
            };
            grupos.set(clave, c);
        }
        const ciudad = def.name.replace(/^SVNS(?: 2| 3)?\s+/, '').replace(/\s+(Masculino|Femenino)\s+\d{4}-\d{2}$/, '');
        c.etapas.push({ clave: def.tournamentId, def, nombre: `Etapa ${ciudad}`, desde: def.window.start, hasta: def.window.end });
    }
    const out = [...grupos.values()];
    for (const c of out) c.etapas.sort((a, b) => a.desde.localeCompare(b.desde));
    return out.sort((a, b) => a.clave.localeCompare(b.clave));
}

export const CIRCUITOS_SVNS: readonly CircuitoSvns[] = armarCircuitos();

export function circuitoPorClave(clave: string): CircuitoSvns | null {
    return CIRCUITOS_SVNS.find((c) => c.clave === clave) ?? null;
}

const DIA_MS = 86_400_000;

/** Las etapas en curso o cerca (un día antes, dos después): las únicas que el cron toca. */
export function etapasActivas(circuito: CircuitoSvns, ahora: Date): EtapaSvns[] {
    return circuito.etapas.filter((e) => {
        const desde = Date.parse(`${e.desde}T00:00:00Z`) - DIA_MS;
        const hasta = Date.parse(`${e.hasta}T00:00:00Z`) + 2 * DIA_MS;
        return ahora.getTime() >= desde && ahora.getTime() <= hasta;
    });
}

// --------------------------------------------------------------------------
// Clubes (selecciones de seven)
// --------------------------------------------------------------------------

export function slugPais(valor: string): string {
    return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Ids de club posibles para una selección, en orden de preferencia. Los clubes que ya
 * estaban en la base mezclan idiomas (`alemania-7s`, `kenya-7s`, `espana-7s-w`,
 * `brazil-7s-w`), así que se prueba el nombre en inglés y en castellano. El primero que
 * exista se usa; si ninguno existe, se crea con el primero (el inglés de World Rugby).
 */
export function candidatosClub(pais: string, genero: GeneroSvns): string[] {
    const sufijo = genero === 'w' ? '-7s-w' : '-7s';
    const ingles = slugPais(pais);
    const castellano = slugPais(wrCountryEs(pais));
    return [...new Set([`${ingles}${sufijo}`, `${castellano}${sufijo}`])];
}

export function nombreClub(pais: string, genero: GeneroSvns): string {
    return `${wrCountryEs(pais)} 7s${genero === 'w' ? ' W' : ''}`;
}

// --------------------------------------------------------------------------
// Plan de partidos
// --------------------------------------------------------------------------

export function externalIdDe(matchId: string): string {
    return `${SVNS_EXTERNAL_PREFIX}${matchId.toLowerCase()}`;
}

export interface ExistenteSvns {
    id: string;
    external_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    date_time: string | null;
    status: string | null;
    score: { home?: number | null; away?: number | null } | null;
    venue: string | null;
}

export interface FilaNuevaSvns {
    external_id: string;
    home_club_id: string;
    away_club_id: string;
    date_time: string;
    status: string;
    score: { home: number; away: number } | null;
    venue: string | null;
    round_label: string | null;
    points_autocalculated: boolean;
    home_base_points: number;
    away_base_points: number;
    home_bonus_points: number;
    away_bonus_points: number;
}

export interface PlanSvns {
    crear: FilaNuevaSvns[];
    actualizar: { id: string; patch: Record<string, unknown>; cambios: string[]; externalId: string; matchId: string }[];
    /** Cada partido de World Rugby con su fila (null si se va a crear): sirve para la cronología. */
    vinculados: { matchId: string; externalId: string; filaId: string | null; fixture: WrFixture }[];
    sinCambios: number;
    equiposSinClub: string[];
    /** Filas cargadas a mano que ningún partido de World Rugby reclamó. */
    huerfanos: string[];
}

function marcador(f: WrFixture): { home: number; away: number } | null {
    if ((f.state === 'live' || f.state === 'final') && f.home.score !== null && f.away.score !== null) {
        return { home: f.home.score, away: f.away.score };
    }
    return null;
}

/**
 * Cruza lo que dice World Rugby con lo guardado y devuelve SOLO lo que cambió.
 *
 * - Una fila con `external_id` se actualiza por ese id.
 * - Una fila cargada a mano (sin `external_id`) se REVINCULA si juegan los mismos dos
 *   clubes, en cualquier orden, con menos de dos días de diferencia. Del dato manual no se
 *   toca nada salvo el id y, si World Rugby ya tiene el partido jugado, marcador y estado.
 * - Un partido que World Rugby todavía tiene "sin empezar" nunca pisa un resultado ya
 *   cargado: la fuente oficial manda solo cuando publica algo.
 */
export function planSvns(input: {
    fixtures: readonly WrFixture[];
    existentes: readonly ExistenteSvns[];
    resolverClub: (side: WrSide) => string | null;
}): PlanSvns {
    const { fixtures, existentes, resolverClub } = input;
    const plan: PlanSvns = { crear: [], actualizar: [], vinculados: [], sinCambios: 0, equiposSinClub: [], huerfanos: [] };
    const sinClub = new Set<string>();
    const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
    const libres = existentes.filter((e) => !e.external_id);
    const usados = new Set<string>();

    const ordenados = [...fixtures].sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0) || (a.number ?? 0) - (b.number ?? 0));
    for (const f of ordenados) {
        if (f.kickoffMs === null || f.kickoffIso === null) continue;
        if (f.home.placeholder || f.away.placeholder) continue;
        const home = resolverClub(f.home);
        const away = resolverClub(f.away);
        if (!home) sinClub.add(f.home.name);
        if (!away) sinClub.add(f.away.name);
        if (!home || !away || home === away) continue;

        const externalId = externalIdDe(f.matchId);
        const score = marcador(f);
        const estado = f.state;

        let fila = porExternal.get(externalId) ?? null;
        let revinculada = false;
        if (!fila) {
            const kickoff = f.kickoffMs;
            fila = libres.find((e) => {
                if (usados.has(e.id) || !e.date_time) return false;
                const mismos = (e.home_club_id === home && e.away_club_id === away) || (e.home_club_id === away && e.away_club_id === home);
                return mismos && Math.abs(Date.parse(e.date_time) - kickoff) < 2 * DIA_MS;
            }) ?? null;
            revinculada = fila !== null;
        }

        if (!fila) {
            plan.crear.push({
                external_id: externalId,
                home_club_id: home,
                away_club_id: away,
                date_time: f.kickoffIso,
                status: estado,
                score,
                venue: f.venue || null,
                round_label: null,
                points_autocalculated: true,
                home_base_points: 0,
                away_base_points: 0,
                home_bonus_points: 0,
                away_bonus_points: 0,
            });
            plan.vinculados.push({ matchId: f.matchId, externalId, filaId: null, fixture: f });
            continue;
        }

        usados.add(fila.id);
        plan.vinculados.push({ matchId: f.matchId, externalId, filaId: fila.id, fixture: f });

        const cambios: string[] = [];
        const patch: Record<string, unknown> = {};
        if (revinculada) {
            patch.external_id = externalId;
            cambios.push('external_id');
        }
        const invertida = fila.home_club_id === away && fila.away_club_id === home;
        const jugado = estado === 'live' || estado === 'final';
        // World Rugby gana solo cuando publicó algo; "sin empezar" no pisa un dato cargado.
        const ceder = !jugado && (fila.status === 'final' || fila.status === 'live');
        if (!ceder) {
            if (invertida) {
                patch.home_club_id = home;
                patch.away_club_id = away;
                cambios.push('local/visitante');
            }
            if (fila.status !== estado) {
                patch.status = estado;
                cambios.push(`estado ${fila.status ?? '—'}→${estado}`);
            }
            const viejo = fila.score ? { home: fila.score.home ?? null, away: fila.score.away ?? null } : null;
            const igual = (!viejo && !score) || (!!viejo && !!score && viejo.home === score.home && viejo.away === score.away);
            if (!igual) {
                // Con la fila invertida el marcador manual está del otro lado: se reescribe entero.
                patch.score = score;
                cambios.push('marcador');
            }
            if (!revinculada && fila.date_time && Math.abs(Date.parse(fila.date_time) - f.kickoffMs) >= 60_000) {
                patch.date_time = f.kickoffIso;
                cambios.push('horario');
            }
        }
        if (cambios.length) plan.actualizar.push({ id: fila.id, patch, cambios, externalId, matchId: f.matchId });
        else plan.sinCambios += 1;
    }

    for (const e of libres) if (!usados.has(e.id)) plan.huerfanos.push(e.id);
    plan.equiposSinClub = [...sinClub];
    return plan;
}
