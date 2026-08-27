/**
 * EL PLANTEL DISPONIBLE DE UN EQUIPO, PARA ARMAR UNA FORMACIÓN.
 *
 * Distinto de `fixedRosterLineups.ts`, que sirve al plantel fijo de un torneo y
 * devuelve null para todo lo que no sea un torneo local con esa opción prendida —o
 * sea, para casi todo el feed. Acá alcanza con que alguien haya cargado el plantel
 * del club.
 *
 * ── LA PARTE QUE NO ES OBVIA: el equipo del partido no es el club ──────────────
 * Los partidos que ve la gente son entre equipos del proveedor
 * (`fs-team-lrM6RMBU`), y el plantel se carga sobre un club de la plataforma
 * (`team_memberships.club_id`). Sin este puente, un partido del feed nunca
 * encuentra un plantel por más que esté cargado.
 *
 * El puente no se inventa acá: se usa el que ya existe, `clubs.external_id` y
 * `club_external_ids`. Vincular un equipo externo a un club es la misma operación
 * que ya hace la ficha del club, y así el plantel sigue viviendo en UNA tabla.
 */

import { isMissingTableError } from '@/lib/utils/supabaseSchema';

type DbClient = any;

export type SquadPlayer = {
    id: string;
    name: string;
    position: string | null;
    jerseyNumber: number | null;
};

export type TeamSquad = {
    /** El identificador con el que se pidió, tal cual vino. */
    teamKey: string;
    /** El club de la plataforma al que se resolvió, si se resolvió. */
    clubId: string | null;
    clubName: string | null;
    players: SquadPlayer[];
};

function texto(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
}

/** El id crudo del proveedor, sin el prefijo con el que viaja por la plataforma. */
function stripTeamPrefix(value: string): string {
    const lower = value.toLowerCase();
    if (lower.startsWith('fs-team-')) return value.slice(8);
    if (lower.startsWith('ra-team-')) return value.slice(8);
    if (lower.startsWith('ras-team-')) return value.slice(9);
    if (lower.startsWith('espn-team-')) return value.slice(10);
    if (lower.startsWith('fs-')) return value.slice(3);
    return value;
}

function nombreDePersona(person: Record<string, unknown> | null | undefined): string {
    if (!person) return '';
    return (
        texto(person.full_name) ||
        texto(person.name) ||
        texto(`${texto(person.first_name) || ''} ${texto(person.last_name) || ''}`.trim()) ||
        ''
    );
}

/**
 * El club de la plataforma detrás del equipo de un partido. Devuelve null cuando no
 * hay vínculo, que es una respuesta legítima: significa "a este equipo todavía no le
 * cargaron plantel", no un error.
 */
export async function resolveClubIdForTeamKey(
    client: DbClient,
    teamKey: string,
): Promise<{ clubId: string; clubName: string | null } | null> {
    const key = texto(teamKey);
    if (!key) return null;

    // 1. ¿Es directamente un club de la plataforma? (id o slug)
    try {
        const { data } = await client
            .from('clubs')
            .select('id, name')
            .or(`id.eq.${key},slug.eq.${key}`)
            .limit(1)
            .maybeSingle();
        if (data?.id) return { clubId: data.id as string, clubName: texto(data.name) };
    } catch {
        // Sigue por los otros caminos.
    }

    const crudo = stripTeamPrefix(key);
    const candidatos = Array.from(new Set([key, crudo]));

    // 2. El club que declara ese id externo como suyo.
    for (const candidato of candidatos) {
        try {
            const { data } = await client
                .from('clubs')
                .select('id, name')
                .eq('external_id', candidato)
                .limit(1)
                .maybeSingle();
            if (data?.id) return { clubId: data.id as string, clubName: texto(data.name) };
        } catch {
            // Sigue.
        }
    }

    // 3. La tabla de vínculos por proveedor.
    try {
        const { data, error } = await client
            .from('club_external_ids')
            .select('club_id')
            .in('external_id', candidatos)
            .limit(1)
            .maybeSingle();
        if (!error && data?.club_id) {
            const { data: club } = await client
                .from('clubs')
                .select('id, name')
                .eq('id', data.club_id)
                .limit(1)
                .maybeSingle();
            if (club?.id) return { clubId: club.id as string, clubName: texto(club.name) };
        }
    } catch {
        // Sin tabla de vínculos: no hay club, y no es un error.
    }

    return null;
}

/**
 * Los jugadores que alguien cargó para ese club. Estrictamente el plantel: si no hay
 * plantel cargado, la lista viene vacía y la pantalla lo dice. No se cae a las fichas
 * sueltas de `people` a propósito —una ficha existe porque el jugador apareció una
 * vez en la planilla de un partido, y eso no es un plantel.
 */
export async function getSquadForClub(client: DbClient, clubId: string): Promise<SquadPlayer[]> {
    try {
        const { data, error } = await client
            .from('team_memberships')
            .select('person_id, position, jersey_number, status, squad_role, person:people(id, full_name, name, first_name, last_name, position)')
            .eq('club_id', clubId)
            .neq('status', 'inactive')
            .limit(200);

        if (error) {
            if (isMissingTableError(error, 'team_memberships')) return [];
            console.warn('[teamSquad] no se pudo leer el plantel:', error.message);
            return [];
        }

        const jugadores: SquadPlayer[] = [];
        const vistos = new Set<string>();

        for (const fila of (data || []) as Array<Record<string, unknown>>) {
            const person = (fila.person || null) as Record<string, unknown> | null;
            const id = texto(person?.id) || texto(fila.person_id);
            const name = nombreDePersona(person);
            if (!id || !name || vistos.has(id)) continue;
            vistos.add(id);

            const numeroCrudo = fila.jersey_number;
            const numero = typeof numeroCrudo === 'number' && Number.isFinite(numeroCrudo)
                ? numeroCrudo
                : Number.parseInt(String(numeroCrudo ?? ''), 10);

            jugadores.push({
                id,
                name,
                // El puesto de la membresía manda sobre el de la ficha: es el que le
                // puso el club que lo cargó, no el que quedó de un partido suelto.
                position: texto(fila.position) || texto(person?.position),
                jerseyNumber: Number.isFinite(numero) ? numero : null,
            });
        }

        // Por número si lo tienen, y si no por nombre. Un orden estable importa: la
        // lista se lee dos veces, una por equipo, y saltar de orden confunde.
        jugadores.sort((a, b) => {
            if (a.jerseyNumber !== null && b.jerseyNumber !== null) return a.jerseyNumber - b.jerseyNumber;
            if (a.jerseyNumber !== null) return -1;
            if (b.jerseyNumber !== null) return 1;
            return a.name.localeCompare(b.name, 'es');
        });

        return jugadores;
    } catch (err) {
        console.warn('[teamSquad] lectura de plantel falló:', err);
        return [];
    }
}

export async function getSquadForTeamKey(client: DbClient, teamKey: string): Promise<TeamSquad> {
    const club = await resolveClubIdForTeamKey(client, teamKey);
    if (!club) {
        return { teamKey, clubId: null, clubName: null, players: [] };
    }

    const players = await getSquadForClub(client, club.clubId);
    return { teamKey, clubId: club.clubId, clubName: club.clubName, players };
}

export type SquadPeriod = {
    /** `null` en las dos puntas significa "sin fecha de corte", no "vacio". */
    from: string | null;
    to: string | null;
    players: SquadPlayer[];
};

/**
 * EL PLANTEL DE CADA PERIODO, del mas nuevo al mas viejo.
 *
 * Un club no tiene UN plantel: tiene el de esta temporada, el de la anterior y el de
 * la gira. Se agrupan por (desde, hasta) porque es la unidad con la que se cargan y
 * la que alguien quiere volver a mirar.
 *
 * El orden es del mas reciente primero: quien abre la ficha quiere el plantel de
 * ahora, y el historico es a lo que baja despues.
 */
export async function getSquadPeriodsForClub(client: DbClient, clubId: string): Promise<SquadPeriod[]> {
    try {
        const { data, error } = await client
            .from('team_memberships')
            .select('person_id, position, jersey_number, status, joined_at, left_at, person:people(id, full_name, name, first_name, last_name, position)')
            .eq('club_id', clubId)
            .neq('status', 'inactive')
            .limit(1000);

        if (error) {
            if (isMissingTableError(error, 'team_memberships')) return [];
            console.warn('[teamSquad] no se pudieron leer los periodos:', error.message);
            return [];
        }

        const porPeriodo = new Map<string, SquadPeriod>();

        for (const fila of (data || []) as Array<Record<string, unknown>>) {
            const person = (fila.person || null) as Record<string, unknown> | null;
            const id = texto(person?.id) || texto(fila.person_id);
            const name = nombreDePersona(person);
            if (!id || !name) continue;

            const from = texto(fila.joined_at);
            const to = texto(fila.left_at);
            const clave = `${from || ''}|${to || ''}`;

            if (!porPeriodo.has(clave)) porPeriodo.set(clave, { from, to, players: [] });

            const numeroCrudo = fila.jersey_number;
            const numero = typeof numeroCrudo === 'number' && Number.isFinite(numeroCrudo)
                ? numeroCrudo
                : Number.parseInt(String(numeroCrudo ?? ''), 10);

            porPeriodo.get(clave)!.players.push({
                id,
                name,
                position: texto(fila.position) || texto(person?.position),
                jerseyNumber: Number.isFinite(numero) ? numero : null,
            });
        }

        const periodos = Array.from(porPeriodo.values());
        for (const p of periodos) {
            p.players.sort((a, b) => {
                if (a.jerseyNumber !== null && b.jerseyNumber !== null) return a.jerseyNumber - b.jerseyNumber;
                if (a.jerseyNumber !== null) return -1;
                if (b.jerseyNumber !== null) return 1;
                return a.name.localeCompare(b.name, 'es');
            });
        }

        // El que no tiene fecha va primero: es el plantel "vigente hasta nuevo aviso".
        return periodos.sort((a, b) => {
            if (!a.from && !b.from) return 0;
            if (!a.from) return -1;
            if (!b.from) return 1;
            return b.from.localeCompare(a.from);
        });
    } catch (err) {
        console.warn('[teamSquad] lectura de periodos fallo:', err);
        return [];
    }
}
