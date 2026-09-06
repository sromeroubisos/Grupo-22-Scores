/**
 * EL MISMO PARTIDO, DOS VECES, PORQUE SON DOS FUENTES.
 *
 * Argentina-Australia del 29/8 salía dos veces en la portada: una desde rugbyarchive
 * ("Puma Trophy", 12:00, id `ra-761228`) y otra desde el proveedor vivo
 * ("Friendly International", 19:00, id `trgyZr5s`). Es el mismo partido: el archivo
 * anuncia el fixture con una hora de relleno y el proveedor tiene la de verdad.
 *
 * Gana la fila del proveedor vivo, que es la que trae la hora real, el id navegable
 * y la que se va a llenar de marcador cuando el partido empiece.
 *
 * Que la condición sea "una de cada fuente" no es un detalle de implementación:
 * rugbyarchive carga ida y vuelta con la MISMA fecha cuando el original no la
 * precisa, así que dos filas de archivo el mismo día contra el mismo rival son dos
 * partidos REALES y tienen que sobrevivir las dos.
 */

// Relativo y con extension: este modulo tambien corre bajo `node --test`, que
// no resuelve el alias `@/`.
import { isSupersededByRugbyPass, rugbyPassCompetitionIdOf } from './services/rugbyPassSupersedes.ts';

export function isArchiveMatchId(value: unknown): boolean {
    return String(value ?? '').toLowerCase().startsWith('ra-');
}

export function isRugbyPassFeedMatchId(value: unknown): boolean {
    return String(value ?? '').toLowerCase().startsWith('rp-');
}

/**
 * Quien gana cuando dos fuentes traen el MISMO partido. Mas alto, mas manda.
 *
 * RugbyPass va arriba del proveedor generico porque en rugby ese proveedor
 * llega mutilado: `matches/list` no completa `match_status`, asi que un partido
 * terminado se publica como programado. RugbyPass dice `Result` explicito.
 *
 * Que sea un numero y no un `if` anidado no es cosmetico: antes habia DOS
 * fuentes y alcanzaba con preguntar "cual es el archivo". Con tres, cada `if`
 * nuevo es una combinacion mas que alguien se olvida de cubrir.
 */
export function feedSourceRank(id: unknown): number {
    if (isRugbyPassFeedMatchId(id)) return 2;
    if (isArchiveMatchId(id)) return 0;
    return 1;
}

type FeedMatchLike = {
    id?: unknown;
    dateTime?: unknown;
    homeTeam?: { name?: unknown } | null;
    awayTeam?: { name?: unknown } | null;
    tournamentId?: unknown;
    tournamentName?: unknown;
    countryName?: unknown;
    tournamentUrl?: unknown;
    // El enriquecido de /api/matches guarda el torneo anidado, no plano.
    tournament?: { id?: unknown; name?: unknown; country?: unknown; url?: unknown } | null;
};

export function buildFeedMatchIdentity(match: FeedMatchLike | null | undefined): string | null {
    const dt = new Date(String(match?.dateTime ?? ''));
    if (Number.isNaN(dt.getTime())) return null;

    const names = [match?.homeTeam?.name, match?.awayTeam?.name]
        .map((n) => String(n || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ''))
        .filter(Boolean);
    if (names.length < 2) return null;

    // Insensible a la orientación: cada fuente decide por su cuenta quién es local.
    return `${dt.toISOString().slice(0, 10)}|${names.slice().sort().join('|')}`;
}

/**
 * EL TORNEO ENTERO, NO SOLO EL PARTIDO REPETIDO.
 *
 * El pliegue por identidad compara fecha + nombres de equipo, y los nombres NO
 * coinciden entre proveedores: RugbyPass dice "Stade Rochelais" donde FlashScore
 * dice "La Rochelle". Con eso solo, el mismo partido del Top 14 saldria dos
 * veces igual. Por eso, cuando una competicion entra por RugbyPass, la de
 * FlashScore se apaga entera.
 *
 * ── PERO SOLO SI HAY CON QUE REEMPLAZARLA ───────────────────────────────────
 * El reemplazo es CONDICIONAL: se apaga la fila de FlashScore unicamente si en
 * esta misma tanda vino al menos un partido de RugbyPass de esa competicion.
 *
 * Sin esa condicion, apagar es destruir: la primera version apagaba siempre, y
 * como el cron de RugbyPass todavia no habia corrido, los seis torneos
 * desaparecieron de la pantalla de partidos. Vale igual para el dia que el
 * proveedor se caiga — antes de quedarse sin nada, se muestra el viejo.
 *
 * La decision de QUE torneo reemplaza a cual vive en `rugbyPassSupersedes.ts`,
 * que resuelve por id y por pais y nunca por nombre pelado (hay un "Top 14"
 * frances y un "Top 14" argentino, y el argentino tiene que seguir apareciendo).
 */
export function dropSupersededMatches<T extends FeedMatchLike>(matches: T[]): T[] {
    const cubiertas = new Set<number>();
    for (const m of matches) {
        const compId = rugbyPassCompetitionIdOf(m);
        if (compId !== null) cubiertas.add(compId);
    }
    if (cubiertas.size === 0) return matches;
    return matches.filter((m) => !isSupersededByRugbyPass(m, cubiertas));
}

export function dedupeCrossSourceMatches<T extends FeedMatchLike>(matches: T[]): T[] {
    /**
     * Por identidad se guarda el MEJOR rango visto y todas las filas que lo
     * empatan — no una sola posicion.
     *
     * La version anterior comparaba solo contra la primera fila guardada, y con
     * tres fuentes o mas eso deja pasar duplicados: el 2026-09-05 habia CUATRO
     * filas "Argentina vs Australia" el mismo dia — el Seven universitario de la
     * FISU (que es otro partido de verdad), el archivo, FlashScore y RugbyPass.
     * El Seven ocupaba el lugar con rango 1, FlashScore empataba ese rango y se
     * colaba, y RugbyPass despues reemplazaba al Seven en vez de a FlashScore.
     * Resultado: el partido salia dos veces y el hincha entraba al que no tiene
     * datos.
     */
    const grupos = new Map<string, { mejorRango: number; posiciones: number[] }>();
    const salida: (T | null)[] = [];

    // Primero se apaga el torneo reemplazado y despues se pliega lo que quedo:
    // al reves, una fila que igual se iba a descartar podria ganarle el lugar a
    // la buena y dejar el partido con los datos del proveedor equivocado.
    for (const match of dropSupersededMatches(matches)) {
        const identidad = buildFeedMatchIdentity(match);
        if (!identidad) {
            salida.push(match);
            continue;
        }

        const rango = feedSourceRank(match.id);
        const grupo = grupos.get(identidad);

        if (!grupo) {
            grupos.set(identidad, { mejorRango: rango, posiciones: [salida.length] });
            salida.push(match);
            continue;
        }

        // Ya hay una fuente mejor para este partido.
        if (rango < grupo.mejorRango) continue;

        // Esta es mejor que todo lo guardado: las anteriores se caen.
        if (rango > grupo.mejorRango) {
            for (const pos of grupo.posiciones) salida[pos] = null;
            grupo.mejorRango = rango;
            grupo.posiciones = [salida.length];
            salida.push(match);
            continue;
        }

        // Mismo rango: son dos partidos REALES y sobreviven los dos. rugbyarchive
        // carga ida y vuelta con la misma fecha cuando el original no la precisa,
        // y un Seven puede coincidir en dia y rivales con un partido de XV.
        grupo.posiciones.push(salida.length);
        salida.push(match);
    }

    return salida.filter((m): m is T => m !== null);
}

/** Los estados en los que un partido ya no espera nada del proveedor. */
const ESTADOS_CERRADOS = new Set(['final', 'cancelled', 'postponed']);

type CachedRowLike = {
    id?: unknown;
    status?: unknown;
    date_time?: unknown;
    home_team?: { name?: unknown } | null;
    away_team?: { name?: unknown } | null;
    tournament_id?: unknown;
    tournament_name?: unknown;
    country_name?: unknown;
};

function rowToFeedLike(row: CachedRowLike): FeedMatchLike {
    return {
        id: row.id,
        dateTime: row.date_time,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        tournamentId: row.tournament_id,
        tournamentName: row.tournament_name,
        countryName: row.country_name,
    };
}

/**
 * UNA FILA VIEJA NO PUEDE TAPAR EL DIA ENTERO.
 *
 * `/api/matches` descarta la caché de un día completo cuando encuentra una fila
 * vencida sin resultado, y repara contra el proveedor. La intención es buena
 * —un final que el sync no vio— pero el castigo es colectivo: el 2026-09-05 una
 * sola fila ("Puma Trophy, Argentina vs Australia, scheduled", con el kickoff
 * pasado) tiró abajo los 12 partidos de RugbyPass de ese día, y con ellos el
 * reemplazo, así que volvían a verse los del proveedor viejo.
 *
 * Lo absurdo del caso: RugbyPass TENIA ese mismo partido cerrado, 28-28. La
 * respuesta ya estaba en la caché.
 *
 * Así que una fila vencida deja de pedir reparación cuando:
 *   - otra fuente trae el MISMO partido ya cerrado (misma identidad), o
 *   - su torneo lo reemplaza RugbyPass, porque esa fila no se va a servir.
 */
export function hasStaleRowsNeedingRepair(
    rows: CachedRowLike[],
    nowMs: number,
    staleAfterMs = 3 * 60 * 60 * 1000
): boolean {
    const vivas = dropSupersededMatches(rows.map(rowToFeedLike));
    const vivasPorId = new Set(vivas.map((m) => String(m.id)));

    const identidadesCerradas = new Set<string>();
    for (const row of rows) {
        if (!ESTADOS_CERRADOS.has(String(row.status))) continue;
        const identidad = buildFeedMatchIdentity(rowToFeedLike(row));
        if (identidad) identidadesCerradas.add(identidad);
    }

    return rows.some((row) => {
        if (ESTADOS_CERRADOS.has(String(row.status))) return false;
        // Ya la apagó el reemplazo: no se sirve, no hay nada que reparar.
        if (!vivasPorId.has(String(row.id))) return false;

        const kickoffMs = new Date(String(row.date_time)).getTime();
        if (Number.isNaN(kickoffMs) || nowMs - kickoffMs <= staleAfterMs) return false;

        const identidad = buildFeedMatchIdentity(rowToFeedLike(row));
        // Otra fuente ya lo cerró: la caché tiene la respuesta.
        return !(identidad && identidadesCerradas.has(identidad));
    });
}
