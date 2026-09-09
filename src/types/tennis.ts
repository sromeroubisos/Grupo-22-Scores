/**
 * Modelo de tenis.
 *
 * Deliberadamente APARTE de `Match`. Un partido de tenis no es
 * `home/away + score entero`: el resultado son sets, un "equipo" es una o dos
 * personas sin escudo, y un torneo es un cuadro con sembrados, no una tabla.
 * Meterlo en `MatchScore` dejaría el escudo vacío y la tabla sin sentido.
 *
 * La fuente es la API pública de ESPN (`src/lib/services/tennis.ts`), la misma
 * que sirve el fútbol del sitio. Los ids llevan el prefijo `espn-` y adentro
 * viajan el circuito y la fecha de inicio del torneo, porque ESPN sirve un
 * torneo por FECHA y no por id: sin eso no se lo puede volver a pedir.
 */

export type TennisMatchStatus = 'scheduled' | 'live' | 'final' | 'other';

/** Un set: los games de cada lado, y el tie-break si lo hubo. */
export interface TennisSet {
    set: number;
    home: number | null;
    away: number | null;
    homeTiebreak: number | null;
    awayTiebreak: number | null;
}

/**
 * El país del jugador. `code` es el id del catálogo de países del sitio
 * (`argentina`, `spain`), que es lo que busca `CountryFlag`; el alpha3 queda
 * para el rótulo de texto, que es como se lee una planilla de tenis (ARG, ESP).
 */
export interface TennisCountry {
    code: string | null;
    alpha3: string | null;
    name: string | null;
}

/**
 * Un lado del partido. En singles `players` tiene un nombre; en dobles, dos.
 * No hay escudo: hay foto de la persona, y en dobles no hay foto de la pareja.
 */
export interface TennisSide {
    id: string;
    name: string;
    players: string[];
    country: TennisCountry | null;
    photo: string | null;
    seed: number | null;
    setsWon: number | null;
    /** El punto que se juega: "0", "15", "30", "40", "A". Solo en vivo, y solo si la fuente lo da. */
    gamePoint: string | null;
    /** Quién está sacando en este momento. Solo en vivo. */
    isServing: boolean;
}

export interface TennisTournamentRef {
    id: string;
    name: string;
    /** El circuito: "ATP", "WTA", "ATP · WTA" cuando el torneo es combinado. */
    tour: string | null;
    slug: string | null;
}

export interface TennisMatch {
    id: string;
    status: TennisMatchStatus;
    /** El rótulo tal cual lo da la fuente: "3rd set", "FT", "NS". */
    statusLabel: string;
    isLive: boolean;
    startsAt: Date | null;
    home: TennisSide;
    away: TennisSide;
    sets: TennisSet[];
    isDoubles: boolean;
    /** La modalidad: "Singles masculino", "Dobles mixto". */
    draw: string | null;
    /** Lugar en el cuadro: "Round of 16", "Final". */
    round: string | null;
    surface: string | null;
    /** La cancha: "Arthur Ashe Stadium". */
    court: string | null;
    tournament: TennisTournamentRef;
}

/** Los partidos de un torneo, que es como se agrupa un día de tenis. */
export interface TennisTournamentDay extends TennisTournamentRef {
    matches: TennisMatch[];
}

export interface TennisDay {
    tournaments: TennisTournamentDay[];
    count: number;
    /** Cuántos partidos vinieron de otro día y se descartaron. */
    discardedOffDay: number;
    timezone: string | null;
    categories: string[];
}
