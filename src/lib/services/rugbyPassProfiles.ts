/**
 * Las fichas de un EQUIPO y de un JUGADOR de RugbyPass.
 *
 * Es el camino de LECTURA que faltaba. Los datos ya estaban —299 equipos y 5045
 * jugadores parseados y probados en `rugbyPassCatalog.ts`— pero nadie los pedia:
 * `/clubs/rp-team-argentina` y `/players/rp-player-pablo-matera` abrian la
 * pagina y la API contestaba 404. Es el mismo hueco de prefijos que ya mordio en
 * la ficha del partido y en la del torneo: un proveedor nuevo se declara en
 * varios lugares y con uno solo la pantalla no falla, MIENTE.
 *
 * ── DE DONDE SALE CADA COSA ─────────────────────────────────────────────────
 * La identidad del equipo y la del jugador salen del catalogo, que queda en
 * memoria seis horas. Los PARTIDOS salen de `external_match_cache` —lo que el
 * cron ya llena cada hora— y no de una llamada nueva al proveedor, igual que la
 * ficha del torneo.
 *
 * Lo que RugbyPass NO publica no se inventa: de un jugador hay nombre, puesto,
 * numero, foto y los clubes por los que paso. No hay fecha de nacimiento, ni
 * altura, ni peso, ni valor de mercado — y en rugby eso ultimo ni siquiera
 * existe como concepto (el eje economico es el escalafon de empleo).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
    RUGBYPASS_COMPETITIONS,
    RUGBYPASS_PROVIDER,
    RUGBYPASS_TEAM_ID_PREFIX,
    rugbyPassCompetition,
    rugbyPassTeamId,
} from './rugbyPassParser.ts';
import {
    RUGBYPASS_PLAYER_ID_PREFIX,
    resolvePlayerTeamSlugs,
    type RugbyPassPlayer,
    type RugbyPassTeamEntry,
} from './rugbyPassCatalog.ts';
import { getRugbyPassPlayers, getRugbyPassTeams } from './rugbyPass.ts';

/**
 * El slug de un id de equipo. `null` si el id no es de RugbyPass.
 *
 * El slug se VALIDA contra `[a-z0-9-]` y no solo se recorta: baja derecho a un
 * filtro de PostgREST, y ahi un caracter de mas no es un dato feo, es una
 * inyeccion en el `or(...)`.
 */
export function parseRugbyPassTeamSlug(value: unknown): string | null {
    return slugDe(value, RUGBYPASS_TEAM_ID_PREFIX);
}

/** El slug de un id de jugador. `null` si el id no es de RugbyPass. */
export function parseRugbyPassPlayerSlug(value: unknown): string | null {
    return slugDe(value, RUGBYPASS_PLAYER_ID_PREFIX);
}

function slugDe(value: unknown, prefijo: string): string | null {
    const texto = String(value ?? '').trim().toLowerCase();
    if (!texto.startsWith(prefijo)) return null;
    const slug = texto.slice(prefijo.length);
    return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

/** Las competiciones habilitadas a las que pertenece un equipo. */
function competicionesDe(equipo: RugbyPassTeamEntry): number[] {
    const habilitadas = new Set(RUGBYPASS_COMPETITIONS.map((c) => c.id));
    return equipo.competitionIds.filter((id) => habilitadas.has(id));
}

interface CachedRow {
    id: string;
    sport: string | null;
    tournament_id: string | null;
    tournament_name: string | null;
    country_name: string | null;
    home_team: { id?: string; name?: string; logo?: string } | null;
    away_team: { id?: string; name?: string; logo?: string } | null;
    score: { home: number | null; away: number | null } | null;
    status: string;
    date_time: string;
    round_label: string | null;
}

function ladoVista(lado: { id?: string; name?: string; logo?: string } | null) {
    const id = lado?.id ?? '';
    const name = lado?.name ?? '';
    const logo = lado?.logo ?? '';
    return {
        id,
        team_id: id,
        name,
        short_name: name,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: '',
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

function partidoVista(fila: CachedRow) {
    const fecha = new Date(fila.date_time);
    const valida = !Number.isNaN(fecha.getTime());
    const competicion = fila.tournament_id
        ? rugbyPassCompetition(Number(fila.tournament_id.replace(/^rp-comp-/, '')))
        : null;

    return {
        match_id: fila.id,
        event_key: fila.id,
        timestamp: valida ? Math.floor(fecha.getTime() / 1000) : null,
        date: valida ? fecha.toISOString() : fila.date_time,
        match_status: fila.status,
        event_status: fila.status,
        status: fila.status,
        status_text: fila.status === 'final' ? 'Finalizado' : fila.status === 'live' ? 'En vivo' : 'Programado',
        event_name: fila.round_label ?? '',
        tournament_id: fila.tournament_id ?? '',
        tournament_name: competicion?.name ?? fila.tournament_name ?? '',
        tournament_stage_name: fila.round_label ?? '',
        country_name: fila.country_name ?? 'Internacional',
        sport_id: fila.sport ?? 'rugby',
        home_team: ladoVista(fila.home_team),
        away_team: ladoVista(fila.away_team),
        home_team_name: fila.home_team?.name ?? '',
        away_team_name: fila.away_team?.name ?? '',
        home_team_logo: fila.home_team?.logo ?? '',
        away_team_logo: fila.away_team?.logo ?? '',
        scores: {
            home: fila.score?.home ?? null,
            away: fila.score?.away ?? null,
            penalties: null,
        },
        url: '',
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

/**
 * Una fila del plantel, con la forma que ya renderiza la pestana.
 *
 * **Sin numero de camiseta, a proposito.** El `pid` del proveedor NO es la
 * camiseta: es el ORDINAL DEL PUESTO. Medido sobre los 114 del plantel de
 * Auckland, cada valor cae siempre en el mismo puesto y ninguno en dos —
 * 1 Prop, 2 Hooker, 3 Prop, 4 y 5 Lock, 6/7/8 Back Row, 9 Scrum Half,
 * 10 Fly Half, 12/13 Centre, 11/14/15 Outside Back, 0 sin puesto. Publicarlo
 * como camiseta pinta siete props distintos con un "1" al lado, que es un dato
 * falso y con cara de verdadero.
 *
 * Se usa solo para ORDENAR, que es para lo que sirve: 1 a 15 es el orden en el
 * que se lee un equipo de rugby, de pilar a fullback.
 */
function jugadorVista(jugador: RugbyPassPlayer) {
    return {
        id: jugador.id,
        player_id: jugador.id,
        name: jugador.name,
        short_name: jugador.name,
        // RugbyPass rotula el puesto en ingles ("Back Row", "Outside Back") y se
        // deja tal cual: traducirlo a mano inventaria un puesto que el proveedor
        // no dijo, y el rugby tiene nombres que no mapean uno a uno.
        position: jugador.position ?? '',
        type: jugador.position ?? '',
        image_path: jugador.photo,
        photo: jugador.photo,
        provider: RUGBYPASS_PROVIDER,
        source: RUGBYPASS_PROVIDER,
    };
}

/** El orden de lectura de un equipo: pilar (1) a fullback (15). */
function ordenDePuesto(jugador: RugbyPassPlayer): number {
    // El `0` es "sin puesto" y va al final, no adelante de los pilares.
    const pid = jugador.jerseyNumber;
    return pid === null || pid === 0 ? 99 : pid;
}

/**
 * Los partidos de un equipo, de la cache.
 *
 * El filtro va por el id del equipo dentro del JSON de cada lado, que es el
 * MISMO `rp-team-<slug>` con el que el cron los guarda: no se cruza por nombre,
 * que es lo unico que evita que "Auckland" arrastre los de otro Auckland.
 */
async function partidosDe(supabase: SupabaseClient, teamId: string) {
    const { data } = await supabase
        .from('external_match_cache')
        .select('id, sport, tournament_id, tournament_name, country_name, home_team, away_team, score, status, date_time, round_label')
        .or(`home_team->>id.eq.${teamId},away_team->>id.eq.${teamId}`)
        .order('date_time', { ascending: false })
        // Un club no llega a 400 partidos en el calendario publicado, pero el
        // tope esta puesto igual: PostgREST corta en 1000 sin avisar, y una
        // respuesta cortada en silencio es peor que una corta a proposito.
        .limit(400);

    return (data ?? []) as CachedRow[];
}

export interface RugbyPassTeamBundle {
    details: Record<string, unknown>;
    results: ReturnType<typeof partidoVista>[];
    fixtures: ReturnType<typeof partidoVista>[];
    squad: ReturnType<typeof jugadorVista>[];
}

/**
 * La ficha de un equipo. `null` cuando no hay ni fila en el catalogo ni un solo
 * partido, para que el endpoint siga de largo a sus otras ramas en vez de
 * dibujar un club vacio con un nombre inventado.
 *
 * OJO: `/teams/` NO es catalogo completo. De los 221 slugs que aparecen en el
 * feed de partidos, 29 no estan ahi —todo el rugby femenino, mas `england-a` e
 * `italy-a`—. Por eso, cuando el catalogo no lo tiene, la identidad se rearma
 * con lo que dicen los propios partidos antes que contestar 404: el equipo
 * existe, lo que falta es su fila en la grilla.
 */
export async function getRugbyPassTeamBundle(
    slug: string,
    supabase: SupabaseClient
): Promise<RugbyPassTeamBundle | null> {
    const teamId = rugbyPassTeamId(slug);

    let equipo: RugbyPassTeamEntry | null = null;
    try {
        const equipos = await getRugbyPassTeams();
        equipo = equipos.find((e) => e.slug === slug) ?? null;
    } catch {
        // El catalogo caido no puede dejar sin ficha a un equipo cuyos partidos
        // ya estan en la base: se sigue con lo que digan los partidos.
    }

    const filas = await partidosDe(supabase, teamId);
    if (!equipo && filas.length === 0) return null;

    // El nombre y el escudo que ya usan los partidos, para que la ficha no
    // muestre un equipo distinto del que aparece en el fixture.
    const desdePartido = filas
        .map((f) => (f.home_team?.id === teamId ? f.home_team : f.away_team?.id === teamId ? f.away_team : null))
        .find((lado) => lado?.name);

    const name = equipo?.name || desdePartido?.name || slug;
    const logo = equipo?.logo || desdePartido?.logo || '';

    const vistas = filas.map(partidoVista);
    const results = vistas.filter((v) => v.status === 'final');
    const fixtures = vistas
        .filter((v) => v.status !== 'final')
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    // El plantel sale de los jugadores de las competiciones del equipo, cruzados
    // por NOMBRE contra el catalogo de equipos. Dentro de un mismo proveedor
    // cruzar por nombre es sano —los escribe RugbyPass en los dos lados—; entre
    // proveedores no valdria.
    let squad: ReturnType<typeof jugadorVista>[] = [];
    const competiciones = equipo ? competicionesDe(equipo) : [];
    if (equipo && competiciones.length > 0) {
        try {
            const jugadores = await getRugbyPassPlayers(competiciones);
            const equipos = await getRugbyPassTeams();
            squad = resolvePlayerTeamSlugs(jugadores, equipos)
                .filter((entrada) => entrada.teams.some((t) => t.slug === slug))
                .sort((a, b) => ordenDePuesto(a.player) - ordenDePuesto(b.player))
                .map((entrada) => jugadorVista(entrada.player));
        } catch {
            // Sin plantel el club se dibuja igual: es una pestana de menos, no
            // una pantalla rota. `buildSupportedTabs` la saca sola.
        }
    }

    const country = equipo
        ? rugbyPassCompetition(competiciones[0] ?? -1)?.country ?? ''
        : filas[0]?.country_name ?? '';

    return {
        details: {
            id: teamId,
            team_id: teamId,
            name,
            short_name: name,
            logo,
            image_path: logo,
            country_name: country,
            sport_id: 'rugby',
            team_url: `https://www.rugbypass.com/teams/${slug}/`,
            provider: RUGBYPASS_PROVIDER,
            source: RUGBYPASS_PROVIDER,
        },
        results,
        fixtures,
        squad,
    };
}

export interface RugbyPassPlayerBundle {
    details: Record<string, unknown>;
    career: Record<string, unknown>[];
}

/**
 * La ficha de un jugador. `null` cuando el slug no esta en el catalogo.
 *
 * El slug es la UNICA identidad. `pid` NO es el id del jugador: es el numero de
 * camiseta —los 2453 de "Internationals" comparten 16 valores, del 0 al 15— y
 * plegar por ahi dejaria 16 fichas en vez de 2453.
 */
export async function getRugbyPassPlayerBundle(
    slug: string
): Promise<RugbyPassPlayerBundle | null> {
    const competiciones = RUGBYPASS_COMPETITIONS.map((c) => c.id);
    const jugadores = await getRugbyPassPlayers(competiciones);
    const jugador = jugadores.find((j) => j.slug === slug);
    if (!jugador) return null;

    let equipos: RugbyPassTeamEntry[] = [];
    try {
        equipos = await getRugbyPassTeams();
    } catch {
        // Sin catalogo de equipos la trayectoria sale igual, con los nombres que
        // trae el propio jugador y sin link al club.
    }

    const [conSlug] = resolvePlayerTeamSlugs([jugador], equipos);
    const trayectoria = conSlug?.teams ?? jugador.teams.map((t) => ({ name: t.name, slug: null }));

    // ── El club actual NO se puede deducir, y por eso no se declara ─────────
    //
    // El `t` del jugador es su CARRERA, no su club de hoy: "New Zealand,
    // Barbarians, All Blacks XV, AUNZ XV, Blues, Clermont, Auckland". Y el orden
    // no dice nada — medido en dos planteles: en el de Auckland el club propio
    // cae ULTIMO en 67 de 114 y PRIMERO en 8, y en el de Leinster no cae ni
    // ultimo ni primero en NINGUNO de los 100.
    //
    // Tomar el primero (o el ultimo) es inventar un club actual que el proveedor
    // no publica, y el error no se ve: la ficha muestra un club plausible y
    // equivocado. Se deja en `null` y la verdad viaja entera en la trayectoria.
    // Si algun dia hace falta el club de hoy, el camino es pedirlo por equipo
    // (`filter-players` con `team=<ti>`), que es la unica pregunta que RugbyPass
    // contesta sin ambiguedad.

    return {
        details: {
            id: jugador.id,
            player_id: jugador.id,
            name: jugador.name,
            image_path: jugador.photo,
            position: jugador.position ?? '',
            // RugbyPass no publica ni fecha de nacimiento, ni altura, ni peso, ni
            // el numero de camiseta (su `pid` es el ordinal del puesto, ver
            // `jugadorVista`). Van en `null` explicito y no ausentes: la pantalla
            // ya sabe no dibujar un dato nulo, y un `0` seria una mentira medible.
            birth_date: null,
            height: null,
            weight: null,
            team: null,
            provider: RUGBYPASS_PROVIDER,
            source: RUGBYPASS_PROVIDER,
        },
        // La fila de la trayectoria lee el club de un `team` ANIDADO
        // (`entry.team?.team_id`), no de un `team_id` plano: sin el objeto, el
        // nombre sale como texto suelto y el club no se puede abrir.
        //
        // El que no resuelve a slug va sin id, y entonces la fila lo escribe sin
        // link — que es lo correcto: son clubes historicos (Jaguares, Stade
        // Francais, Mie Honda Heat) que no estan entre los 299 vigentes y no
        // tienen ficha a donde ir, pero borrarlos seria borrar su carrera.
        career: trayectoria.map((t) => {
            const id = t.slug ? rugbyPassTeamId(t.slug) : '';
            return {
                team: id
                    ? { id, team_id: id, name: t.name, short_name: t.name }
                    : null,
                team_id: id,
                team_name: t.name,
                name: t.name,
                provider: RUGBYPASS_PROVIDER,
            };
        }),
    };
}
