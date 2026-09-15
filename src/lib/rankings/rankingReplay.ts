/**
 * La cuenta del ranking de clubes, sin base de datos.
 *
 * Una temporada se "reproduce" desde los puntajes iniciales: cada partido, en
 * orden cronologico, mueve puntos entre los dos clubes con la formula de World
 * Rugby, y al final se aplican los ajustes manuales en el orden en que se
 * cargaron. `clubRankings.ts` trae los datos y escribe el resultado; lo que
 * pasa en el medio esta aca, para poder probarlo con un `node --test` y para
 * poder correrlo DOS veces con distinto corte.
 *
 * Ese segundo corte es la clave de la variacion semanal. La tabla publica
 * compara cada club contra "la semana pasada", y la semana pasada no es lo que
 * hubiera quedado guardado —eso puede estar congelado, pisado o recalculado a
 * destiempo—, sino la temporada reproducida hasta el martes en que arranco esta
 * semana. Se aprendio a la fuerza el 15/9/2026: la tabla guardada llevaba dos
 * semanas congelada por el corte de 1000 partidos y la primera corrida sana
 * mostro tres fines de semana como si fueran uno (Belgrano −4,69 y 16 puestos
 * por un solo partido perdido por diez).
 */

export type ExchangeConfig = {
    home_advantage?: number | string | null;
    margin_threshold?: number | null;
    margin_multiplier?: number | string | null;
    event_multiplier?: number | string | null;
};

export type ReplayMatch = {
    id: string;
    date_time: string;
    home_club_id: string;
    away_club_id: string;
    score: { home: number; away: number };
};

export type ReplayAdjustment = {
    club_id: string;
    mode: 'delta' | 'set';
    value: number | string;
    created_at: string;
};

export type ReplayEntry = {
    club_id: string;
    initial_rating: number | string | null;
};

export type ReplayResult = {
    /** Puntaje final de cada club, redondeado a cuatro decimales. */
    ratings: Map<string, number>;
    /** Ultimo partido que movio a cada club (null si no jugo). */
    lastMatchByClub: Map<string, string | null>;
    /** Partidos que efectivamente entraron en la cuenta. */
    applied: number;
    /** Los ajustes aplicados, con el puntaje en que dejaron al club. */
    adjustments: Array<ReplayAdjustment & { resulting_rating: number }>;
};

export function toRatingNumber(value: unknown, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : fallback;
}

export function roundRating(value: number) {
    return Number(value.toFixed(4));
}

function clampRatingGap(value: number) {
    if (value > 10) return 10;
    if (value < -10) return -10;
    return value;
}

/**
 * El intercambio de puntos de un partido, tal como lo define World Rugby:
 * `Δlocal = (señal + 0,1 × brecha) × margen × evento`, con la brecha acotada a
 * ±10 y suma cero. El empate cae solo (señal 0), y el tope de ±10 produce el
 * piso 0 y el techo 2 sin regla aparte. Margen de mas de 15 puntos: ×1,5.
 *
 * La ventaja de local es cero desde el 1 de julio de 2026, cuando World Rugby
 * la saco del calculo — el primer cambio de formula desde que el ranking nacio
 * en octubre de 2003. Sigue siendo una columna por ranking: el que quiera
 * volver a ponerla en 3 cambia la fila, no el motor.
 */
export function computeWorldRugbyExchange(
    config: ExchangeConfig,
    homeRating: number,
    awayRating: number,
    score: { home: number; away: number },
) {
    const homeAdvantage = toRatingNumber(config.home_advantage, 0);
    const marginThreshold = config.margin_threshold ?? 15;
    const marginMultiplier = toRatingNumber(config.margin_multiplier, 1.5);
    const eventMultiplier = toRatingNumber(config.event_multiplier, 1);

    const homeGap = clampRatingGap(awayRating - (homeRating + homeAdvantage));
    const homeResultSignal = score.home > score.away ? 1 : score.home < score.away ? -1 : 0;

    let homeDelta = homeResultSignal + 0.1 * homeGap;
    const margin = Math.abs(score.home - score.away);

    if (margin > marginThreshold) {
        homeDelta *= marginMultiplier;
    }

    homeDelta *= eventMultiplier;
    homeDelta = roundRating(homeDelta);

    return {
        homeDelta,
        awayDelta: roundRating(-homeDelta),
        margin,
        result:
            homeResultSignal > 0
                ? ('home_win' as const)
                : homeResultSignal < 0
                    ? ('away_win' as const)
                    : ('draw' as const),
        metadata: {
            algorithm: 'world_rugby',
            homeAdvantage,
            ratingGap: homeGap,
            marginThreshold,
            marginMultiplier: margin > marginThreshold ? marginMultiplier : 1,
            eventMultiplier,
        },
    };
}

function compareChronologically(left: ReplayMatch, right: ReplayMatch) {
    const leftTime = new Date(left.date_time).getTime();
    const rightTime = new Date(right.date_time).getTime();

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id, 'en');
}

function isBefore(instant: string, cutoff: string | null | undefined) {
    if (!cutoff) return true;
    const at = new Date(instant).getTime();
    const limit = new Date(cutoff).getTime();
    if (!Number.isFinite(at) || !Number.isFinite(limit)) return true;
    return at < limit;
}

/**
 * Reproduce la temporada.
 *
 * Con `until`, solo entran los partidos jugados ANTES de ese instante y los
 * ajustes cargados antes de ese instante: es la tabla tal como corresponde a
 * esa fecha, con los datos de hoy. Un resultado que se corrigio despues entra
 * corregido en las dos cuentas, asi que no aparece como movimiento de la
 * semana; un ajuste manual nuevo aparece una sola vez, la semana en que se
 * cargo, y despues queda en las dos.
 *
 * Los partidos se ordenan aca adentro: el intercambio depende de los puntajes
 * del momento, asi que dos partidos al reves no dan lo mismo.
 */
export function replaySeason(input: {
    entries: ReplayEntry[];
    matches: ReplayMatch[];
    adjustments: ReplayAdjustment[];
    config: ExchangeConfig;
    until?: string | null;
}): ReplayResult {
    const ratings = new Map<string, number>();
    const lastMatchByClub = new Map<string, string | null>();

    for (const entry of input.entries) {
        ratings.set(entry.club_id, roundRating(toRatingNumber(entry.initial_rating)));
        lastMatchByClub.set(entry.club_id, null);
    }

    const ordered = [...input.matches]
        .filter((match) => isBefore(match.date_time, input.until))
        .sort(compareChronologically);

    let applied = 0;

    for (const match of ordered) {
        const homeRating = ratings.get(match.home_club_id);
        const awayRating = ratings.get(match.away_club_id);
        if (homeRating === undefined || awayRating === undefined) continue;

        const exchange = computeWorldRugbyExchange(input.config, homeRating, awayRating, match.score);

        ratings.set(match.home_club_id, roundRating(homeRating + exchange.homeDelta));
        ratings.set(match.away_club_id, roundRating(awayRating + exchange.awayDelta));
        lastMatchByClub.set(match.home_club_id, match.id);
        lastMatchByClub.set(match.away_club_id, match.id);
        applied += 1;
    }

    const adjustments = input.adjustments
        .filter((adjustment) => isBefore(adjustment.created_at, input.until))
        .flatMap((adjustment) => {
            const current = ratings.get(adjustment.club_id);
            if (current === undefined) return [];

            const requested = toRatingNumber(adjustment.value);
            const resulting = roundRating(adjustment.mode === 'set' ? requested : current + requested);
            ratings.set(adjustment.club_id, resulting);

            return [{ ...adjustment, resulting_rating: resulting }];
        });

    return { ratings, lastMatchByClub, applied, adjustments };
}

/**
 * El puesto de cada club dado su puntaje: de mayor a menor, y a igual puntaje
 * por nombre, que es el mismo desempate que usa la tabla guardada.
 */
export function rankByRating(
    ratings: Map<string, number>,
    nameOf: (clubId: string) => string,
): Map<string, number> {
    const ordered = [...ratings.entries()].sort((left, right) => {
        const delta = right[1] - left[1];
        if (delta !== 0) return delta;
        return nameOf(left[0]).localeCompare(nameOf(right[0]), 'es');
    });

    return new Map(ordered.map(([clubId], index) => [clubId, index + 1]));
}
