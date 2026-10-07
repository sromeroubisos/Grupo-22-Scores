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
 *
 * Encima del intercambio hay UN premio que no es suma cero: el que gana un
 * partido de playoff se lleva un bonus fijo por la instancia (cuartos, semis,
 * final). Solo el ganador —al perdedor no se le resta nada mas que lo que ya
 * perdio en el intercambio— y solo si hubo ganador: un empate no paga.
 */

export type ExchangeConfig = {
    home_advantage?: number | string | null;
    margin_threshold?: number | null;
    margin_multiplier?: number | string | null;
    event_multiplier?: number | string | null;
};

export type PlayoffStage = 'quarterfinal' | 'semifinal' | 'final';

/**
 * Lo que suma el GANADOR de una instancia de playoff, aparte del intercambio.
 * Es un premio y no un intercambio: no sale del bolsillo del perdedor, asi que
 * la tabla entera sube un poco con cada playoff. Regla de la casa (16/9/2026):
 * cuartos 0,5 · semifinal 1,5 · final 2.
 */
export const PLAYOFF_WIN_BONUS: Record<PlayoffStage, number> = {
    quarterfinal: 0.5,
    semifinal: 1.5,
    final: 2,
};

/**
 * El bonus automatico rige para los partidos jugados desde el miercoles
 * 7/10/2026 00:00 de Argentina. Lo anterior se premio a mano con ajustes
 * (Tala +3, Natacion +3,5, Los Teros +2...) y los playoffs que nadie cobro
 * quedan asi: la regla no paga hacia atras. Sin este corte, la corrida
 * reproduce la temporada entera y le suma a cada playoff de 2026 un bonus que
 * se sumaba a los ajustes manuales —el campeon cobraba dos veces y la tabla
 * se reacomodaba sola—.
 */
export const PLAYOFF_BONUS_FROM = '2026-10-07T03:00:00.000Z';

/** La instancia, solo si el partido se jugo desde que rige el bonus. */
export function playoffStageWithBonus(
    stage: PlayoffStage | null | undefined,
    dateTime: string | null | undefined,
): PlayoffStage | null {
    if (!stage || !dateTime) return null;
    const played = new Date(dateTime).getTime();
    if (!Number.isFinite(played)) return null;
    return played >= Date.parse(PLAYOFF_BONUS_FROM) ? stage : null;
}

export type ReplayMatch = {
    id: string;
    date_time: string;
    home_club_id: string;
    away_club_id: string;
    score: { home: number; away: number };
    /** Instancia de playoff, si el partido es de una. Paga el bonus al ganador. */
    stage?: PlayoffStage | null;
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

function normalizeLabel(value: string | null | undefined) {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Fases que tienen "cuartos" o "final" en el nombre de sus rondas pero no son
 * la instancia que premia el ranking: el repechaje y la revalida del Torneo del
 * Interior se juegan el mismo dia que los cuartos y sus rondas se llaman igual
 * (medido el 16/9/2026: 8 "Cuartos de final" del TDI A, 4 de playoff y 4 de
 * repechaje). Las copas de consuelo (Plata, Bronce, Estimulo) tampoco: "la
 * final" es la del torneo, no la de la copa que juegan los que quedaron afuera.
 */
const PHASE_WITHOUT_BONUS = /repechaje|revalida|permanencia|descenso|promocion|reclasificacion|plata|bronce|estimulo|consuelo/;
const ROUND_WITHOUT_BONUS = /octavos|avos de final|ronda de|tercer|3er|puesto|plata|bronce|estimulo|consuelo/;

/**
 * La instancia de playoff de un partido, leida del nombre de su ronda —el
 * constructor de playoffs las llama "Cuartos de final", "Semifinal" y "Final",
 * y los torneos cargados a mano usan los mismos rotulos— dentro de una fase de
 * eliminacion. Devuelve null para todo lo que no paga bonus: la fase regular,
 * los octavos, el repechaje, el partido por el tercer puesto.
 */
export function resolvePlayoffStage(input: {
    roundName?: string | null;
    phaseName?: string | null;
    phaseType?: string | null;
}): PlayoffStage | null {
    const round = normalizeLabel(input.roundName);
    if (!round) return null;

    const phaseType = normalizeLabel(input.phaseType);
    if (phaseType && phaseType !== 'knockout' && phaseType !== 'playoff') return null;
    if (PHASE_WITHOUT_BONUS.test(normalizeLabel(input.phaseName))) return null;
    if (ROUND_WITHOUT_BONUS.test(round)) return null;

    if (/cuartos/.test(round)) return 'quarterfinal';
    if (/semi/.test(round)) return 'semifinal';
    if (/\bfinal\b/.test(round)) return 'final';
    return null;
}

/**
 * El movimiento completo de un partido: el intercambio de World Rugby mas, si
 * es una instancia de playoff con ganador, el bonus de esa instancia para el
 * ganador y solo para el ganador. Es la UNICA cuenta por partido: la usan la
 * corrida semanal, el rebuild y el camino incremental, asi que no pueden dar
 * distinto.
 */
export function computeMatchExchange(
    config: ExchangeConfig,
    homeRating: number,
    awayRating: number,
    score: { home: number; away: number },
    stage?: PlayoffStage | null,
) {
    const exchange = computeWorldRugbyExchange(config, homeRating, awayRating, score);
    const bonus = stage && exchange.result !== 'draw' ? PLAYOFF_WIN_BONUS[stage] : 0;

    return {
        ...exchange,
        homeDelta: roundRating(exchange.homeDelta + (exchange.result === 'home_win' ? bonus : 0)),
        awayDelta: roundRating(exchange.awayDelta + (exchange.result === 'away_win' ? bonus : 0)),
        metadata: {
            ...exchange.metadata,
            playoffStage: stage ?? null,
            playoffBonus: bonus,
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

        const exchange = computeMatchExchange(input.config, homeRating, awayRating, match.score, match.stage);

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
