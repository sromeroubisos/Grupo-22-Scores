/**
 * EL CATALOGO DE RUGBYPASS, INDEXADO PARA EL BUSCADOR.
 *
 * Los 299 equipos y los 5045 jugadores ya se parseaban y sus fichas ya abrian
 * —`/clubs/rp-team-<slug>` y `/players/rp-player-<slug>` resuelven contra
 * `rugbyPassProfiles.ts`— pero no habia forma de LLEGAR a ellos: el buscador
 * lee tablas y nadie escribia estas filas. Una ficha a la que solo se entra
 * tipeando la URL a mano no existe.
 *
 * ── POR QUE SE PERSISTE Y NO SE BUSCA EN VIVO ───────────────────────────────
 * La tentacion era colgar el buscador del catalogo, que ya vive seis horas en
 * memoria. No sirve: en frio la lista de jugadores cuesta las trece
 * competiciones EN SERIE —del orden de diez segundos— y eso es lo que tardaria
 * la primera tecla de cada instancia nueva. Un buscador que a veces tarda diez
 * segundos esta roto aunque el promedio sea bueno.
 *
 * Asi que el catalogo se vuelca a la base una vez por dia (`rugbypass-catalog`)
 * y el buscador consulta la base, como con todo lo demas.
 *
 * ── DONDE VA CADA COSA ──────────────────────────────────────────────────────
 * Los equipos van a `external_teams`, que ya existia y que el buscador YA lee:
 * no hace falta tocar la consulta para que aparezcan. Los jugadores no tenian
 * tabla y va una nueva, `external_players`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isMissingTableError } from '../utils/supabaseSchema.ts';

import {
    RUGBYPASS_COMPETITIONS,
    RUGBYPASS_PROVIDER,
    RUGBYPASS_URL,
    rugbyPassCompetition,
} from './rugbyPassParser.ts';
import {
    resolvePlayerTeamSlugs,
    type RugbyPassPlayer,
    type RugbyPassTeamEntry,
} from './rugbyPassCatalog.ts';
import { getRugbyPassPlayers, getRugbyPassTeams } from './rugbyPass.ts';

const SPORT = 'rugby';

/** Tanda de upsert. 5045 jugadores entran en once viajes. */
const UPSERT_BATCH = 500;

/** Una fila de `external_teams`, tal como la escribe este modulo. */
export interface ExternalTeamRow {
    id: string;
    source: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    sport: string;
    country: string | null;
    team_url: string;
    updated_at: string;
    last_fetched_at: string;
}

/** Una fila de `external_players`. */
export interface ExternalPlayerRow {
    id: string;
    source: string;
    slug: string;
    name: string;
    position: string | null;
    team_name: string | null;
    team_slug: string | null;
    photo_url: string | null;
    sport: string;
    current_squad: boolean;
    competition_ids: number[];
    updated_at: string;
    last_fetched_at: string;
}

/**
 * EL PAIS DE UN EQUIPO, QUE RUGBYPASS NO PUBLICA.
 *
 * Se hereda de la competicion: es el unico dato de pertenencia que trae la fila
 * del equipo. Gana la competicion con un pais REAL sobre la que se declara
 * internacional, porque un equipo del Top 14 que ademas juega la Champions Cup
 * es frances y no europeo. Si ninguna tiene pais propio —Leinster juega la URC
 * y la Champions, las dos internacionales— queda el pais declarado de la
 * primera, que es lo que el proveedor sabe y nada mas.
 *
 * No se adivina por el nombre. "Benetton" no dice Italia en ningun lado del
 * dato, y un buscador que inventa el pais es peor que uno que no lo muestra.
 */
export function countryOfTeam(competitionIds: readonly number[]): string | null {
    const paises = competitionIds
        .map((id) => rugbyPassCompetition(id)?.country ?? null)
        .filter((pais): pais is string => Boolean(pais));

    if (paises.length === 0) return null;
    const propio = paises.find((pais) => pais !== 'Internacional' && pais !== 'Europa');
    return propio ?? paises[0];
}

/** Las tres primeras letras alcanzan para la abreviatura de la tarjeta. */
function shortName(name: string): string | null {
    return name.trim().slice(0, 3).toUpperCase() || null;
}

/**
 * Los equipos del catalogo, como filas de `external_teams`.
 *
 * `team_url` se escribe aunque la ficha no lo use —resuelve por el id, que ya
 * lleva el slug— porque el buscador lo lee como SENAL: entre dos filas del
 * mismo club se queda con la que tiene con que abrir, y una fila sin url parece
 * la cascara que un proveedor nunca completo.
 */
export function rugbyPassTeamRows(
    equipos: readonly RugbyPassTeamEntry[],
    ahora: string = new Date().toISOString()
): ExternalTeamRow[] {
    return equipos.map((equipo) => ({
        id: equipo.id,
        source: RUGBYPASS_PROVIDER,
        name: equipo.name,
        short_name: shortName(equipo.name),
        logo_url: equipo.logo || null,
        sport: SPORT,
        country: countryOfTeam(equipo.competitionIds),
        team_url: `${RUGBYPASS_URL}/teams/${equipo.slug}/`,
        updated_at: ahora,
        last_fetched_at: ahora,
    }));
}

/**
 * Los jugadores del catalogo, como filas de `external_players`.
 *
 * El club que se guarda es el PRIMERO de la lista, que es el vigente: el
 * proveedor publica la trayectoria empezando por el actual. Los anteriores no
 * entran en el indice —el subtitulo de un resultado muestra uno solo— y siguen
 * estando enteros en la ficha, que los lee del catalogo.
 *
 * La foto se guarda solo cuando existe: el comodin del proveedor ya llega vacio
 * del parser, y mandar un hueco al buscador es peor que no mandar nada, porque
 * la lista dibuja las iniciales cuando no hay imagen.
 */
export function rugbyPassPlayerRows(
    jugadores: readonly RugbyPassPlayer[],
    equipos: readonly RugbyPassTeamEntry[],
    ahora: string = new Date().toISOString()
): ExternalPlayerRow[] {
    return resolvePlayerTeamSlugs(jugadores, equipos).map(({ player, teams }) => {
        const club = teams[0] ?? null;
        return {
            id: player.id,
            source: RUGBYPASS_PROVIDER,
            slug: player.slug,
            name: player.name,
            position: player.position || null,
            team_name: club?.name || null,
            team_slug: club?.slug || null,
            photo_url: player.photo || null,
            sport: SPORT,
            current_squad: player.currentSquad,
            competition_ids: player.competitionIds,
            updated_at: ahora,
            last_fetched_at: ahora,
        };
    });
}

/** Lo que hizo una corrida, por tabla. */
export interface DirectorySyncResult {
    teams: number;
    players: number;
    /** Tablas que la base todavia no tiene. No es un error: falta la migracion. */
    missingTables: string[];
}

/**
 * Trae el catalogo entero y lo vuelca a las dos tablas.
 *
 * Con `dry` no escribe y devuelve cuanto hubiera escrito, que es como se
 * prueban todas las sondas de este proyecto sin tocar produccion.
 */
export async function syncRugbyPassDirectory(
    supabase: SupabaseClient,
    options: { dry?: boolean } = {}
): Promise<DirectorySyncResult> {
    const equipos = await getRugbyPassTeams();
    const jugadores = await getRugbyPassPlayers(RUGBYPASS_COMPETITIONS.map((c) => c.id));

    const ahora = new Date().toISOString();
    const filasEquipos = rugbyPassTeamRows(equipos, ahora);
    const filasJugadores = rugbyPassPlayerRows(jugadores, equipos, ahora);

    if (options.dry) {
        return { teams: filasEquipos.length, players: filasJugadores.length, missingTables: [] };
    }

    const missingTables: string[] = [];
    const teams = await upsert(supabase, 'external_teams', filasEquipos, missingTables);
    const players = await upsert(supabase, 'external_players', filasJugadores, missingTables);

    return { teams, players, missingTables };
}

/**
 * Escribe una tabla de a tandas y devuelve cuantas filas entraron.
 *
 * La tabla que falta se REPORTA y no tira: `external_players` nace con este
 * cambio y una base sin la migracion corrida tiene que poder seguir
 * actualizando los equipos, que es la mitad que si existe.
 */
async function upsert(
    supabase: SupabaseClient,
    tabla: string,
    filas: readonly object[],
    missingTables: string[]
): Promise<number> {
    let escritas = 0;

    for (let i = 0; i < filas.length; i += UPSERT_BATCH) {
        const tanda = filas.slice(i, i + UPSERT_BATCH);
        const { error } = await supabase
            .from(tabla)
            .upsert(tanda as never, { onConflict: 'id' });

        if (error) {
            if (isMissingTableError(error, tabla)) {
                missingTables.push(tabla);
                return escritas;
            }
            throw new Error(`[rugbypass-catalog] ${tabla}: ${error.message}`);
        }
        escritas += tanda.length;
    }

    return escritas;
}
