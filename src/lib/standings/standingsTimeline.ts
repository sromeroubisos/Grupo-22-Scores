/**
 * La tabla "por fechas": cómo estaba la clasificación cada vez que el plantel
 * completó una ronda más de partidos.
 *
 * Una fecha NO sale del `round_label` ni del `round_uuid`. Los dos mienten
 * bastante: hay torneos cargados sin rondas, rondas que se postergan, y
 * partidos de la fecha 3 que se juegan después de la 5. Lo que define una fecha
 * es que se jugó la gran mayoría de una ronda de partidos.
 *
 * - Una ronda son N/2 partidos (N equipos, redondeado para abajo: en un torneo
 *   impar uno queda libre). NO se cuenta "cuántos partidos tiene cada equipo":
 *   en un torneo impar cada club descansa una vez por rueda, y a la quinta
 *   fecha ya nadie tiene cinco jugados, así que esa regla deja de cortar.
 * - "La gran mayoría" es el 75 % de la ronda. Uno o dos partidos postergados
 *   no tapan la fecha; media fecha no cuenta como fecha entera. El postergado,
 *   cuando se juega, entra en la foto siguiente.
 * - El corte es por BLOQUE de días seguidos (en la zona del torneo): una fecha
 *   que se juega viernes, sábado y domingo se fotografía el domingo a la noche,
 *   nunca a mitad de la tarde con la mitad de los resultados.
 * - Si un bloque trae más de una ronda (datos cargados todos con la misma
 *   fecha, un seven), sale una sola foto con el número de fecha que le
 *   corresponde: dos tablas idénticas con distinto rótulo serían una mentira.
 *
 * Sin dependencias del proyecto: corre en un test de Node.
 */

export type TimelineMatch = {
    homeId: string | null | undefined;
    awayId: string | null | undefined;
    dateTime: string | null | undefined;
    isFinal: boolean;
};

export type RoundCutoff = {
    /** Número de fecha. */
    round: number;
    /** Último día (YYYY-MM-DD en la zona del torneo) que entra en la foto. */
    dayKey: string;
    /** Primer día con partidos de esa fecha, para el rótulo. */
    fromDayKey: string;
    /** Cuántos partidos terminados entran en la foto. */
    matchesPlayed: number;
};

export const MAJORITY_SHARE = 0.75;
/** Debajo de esto no hay tabla que contar: dos equipos no hacen fechas. */
export const MIN_TEAMS_FOR_TIMELINE = 3;

export function dayKeyInZone(iso: string, timeZone: string): string | null {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/** Partidos que tiene que sumar una fecha para contar como jugada. */
export function majorityThreshold(matchesPerRound: number): number {
    return Math.max(1, Math.ceil(matchesPerRound * MAJORITY_SHARE));
}

/** Días seguidos (viernes-sábado-domingo) son una misma fecha. */
function isNextDay(previousKey: string, key: string): boolean {
    const previous = Date.parse(`${previousKey}T00:00:00Z`);
    const current = Date.parse(`${key}T00:00:00Z`);
    return current - previous <= 86_400_000;
}

/**
 * Los cortes de cada fecha, en orden.
 *
 * `matches` es la fase entera, terminados y por jugar: los por jugar sirven
 * para saber cuántos equipos tiene la fase aunque alguno todavía no haya
 * debutado.
 */
export function computeRoundCutoffs(matches: TimelineMatch[], timeZone: string): RoundCutoff[] {
    const teams = new Set<string>();
    for (const match of matches) {
        if (match.homeId) teams.add(String(match.homeId));
        if (match.awayId) teams.add(String(match.awayId));
    }
    if (teams.size < MIN_TEAMS_FOR_TIMELINE) return [];

    const matchesPerRound = Math.floor(teams.size / 2);
    const threshold = majorityThreshold(matchesPerRound);

    const byDay = new Map<string, TimelineMatch[]>();
    for (const match of matches) {
        if (!match.isFinal || !match.dateTime || !match.homeId || !match.awayId) continue;
        const key = dayKeyInZone(match.dateTime, timeZone);
        if (!key) continue;
        const bucket = byDay.get(key);
        if (bucket) bucket.push(match);
        else byDay.set(key, [match]);
    }
    // Orden explícito: el de inserción del Map depende del orden en que llegaron
    // los partidos, y ese no está garantizado.
    const days = [...byDay.keys()].sort();

    // Bloques de días seguidos: cada bloque es candidato a cerrar una fecha.
    const blocks: Array<{ from: string; to: string; count: number }> = [];
    for (const day of days) {
        const count = byDay.get(day)?.length ?? 0;
        const last = blocks[blocks.length - 1];
        if (last && isNextDay(last.to, day)) {
            last.to = day;
            last.count += count;
        } else {
            blocks.push({ from: day, to: day, count });
        }
    }

    const cutoffs: RoundCutoff[] = [];
    let round = 0;
    let matchesPlayed = 0;
    let pending = 0;
    let pendingFrom: string | null = null;

    for (const block of blocks) {
        matchesPlayed += block.count;
        pending += block.count;
        if (pendingFrom === null) pendingFrom = block.from;
        if (pending < threshold) continue;

        // Un bloque con dos rondas adentro avanza dos fechas, en una sola foto.
        // La tolerancia es la misma del umbral, así que un par de postergados
        // que se juegan con la fecha siguiente no la convierten en dos.
        const tolerance = matchesPerRound - threshold;
        round += Math.max(1, Math.floor((pending + tolerance) / matchesPerRound));
        cutoffs.push({
            round,
            dayKey: block.to,
            fromDayKey: pendingFrom,
            matchesPlayed,
        });
        pending = 0;
        pendingFrom = null;
    }

    return cutoffs;
}

/** Posición de un equipo en cada foto, para el gráfico de evolución. */
export type PositionSeries = {
    teamId: string;
    positions: Array<number | null>;
};

/**
 * Recibe las filas ya ordenadas de cada tabla (la posición es el índice + 1 si
 * la fila no la trae).
 */
export function buildPositionSeries(
    tables: Array<Array<{ teamId: string; position?: number | null }>>,
): PositionSeries[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    // El orden de las series es el de la última tabla: así la lista del
    // gráfico se lee como la tabla actual.
    for (let t = tables.length - 1; t >= 0; t -= 1) {
        for (const row of tables[t]) {
            if (!row.teamId || seen.has(row.teamId)) continue;
            seen.add(row.teamId);
            ids.push(row.teamId);
        }
    }

    return ids.map((teamId) => ({
        teamId,
        positions: tables.map((rows) => {
            const index = rows.findIndex((row) => row.teamId === teamId);
            if (index < 0) return null;
            return rows[index].position || index + 1;
        }),
    }));
}

/** Diferencia de puestos entre dos fotos: positivo = subió. */
export function positionDelta(previous: number | null | undefined, current: number | null | undefined): number | null {
    if (!previous || !current) return null;
    return previous - current;
}
