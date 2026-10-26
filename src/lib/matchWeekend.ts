/**
 * Una fecha es un PERIODO, no un dia.
 *
 * Esta es la unica definicion de "que partidos caen en la misma fecha", y sale
 * de medir los torneos de la base, no de una intuicion. La corrida sobre 7.893
 * rondas y 35.058 partidos con ronda asignada dio:
 *
 * - El 98,0% de las rondas tiene todos sus partidos en UN dia.
 * - El 73,7% toca un sabado y el 22,1% un domingo. Viernes 2,5%, lunes 0,9%.
 * - **810 pares de rondas consecutivas caen en el mismo fin de semana**
 *   (sabado en una, domingo en la siguiente), y en 808 de esos 810 pares
 *   NO se repite un solo club entre las dos. O sea: no son dos fechas, es una
 *   fecha partida al medio por el importador.
 *
 * De ahi la regla:
 *
 *   El periodo canonico de una fecha es el FIN DE SEMANA: viernes, sabado y
 *   domingo del mismo bloque, anclado en el sabado. Dos partidos caen en la
 *   misma fecha si caen en el mismo fin de semana.
 *
 * De lunes a jueves NO se agrupa: un partido de miercoles es un adelanto o un
 * postergado, y meterlo con el fin de semana anterior o el siguiente seria
 * inventar. Cada dia de semana es su propio periodo.
 *
 * El periodo ya tiene donde vivir: `tournament_rounds.start_date` y `end_date`,
 * cargadas en el 99,1% de las rondas y coincidiendo con sus partidos en 7.820
 * de 7.825. Lo que faltaba no era la columna, era la regla.
 *
 * Todo lo de aca adentro trabaja con dias `YYYY-MM-DD` YA resueltos en la zona
 * del torneo. La conversion desde el ISO en UTC es de quien llama
 * (`dayKeyInTimeZone`), porque el corte de dia depende de la zona.
 */

/** Un dia calendario, `YYYY-MM-DD`. */
export type DayKey = string;

/** El periodo de una fecha: dos dias calendario, inclusive los dos. */
export interface Period {
    start: DayKey;
    end: DayKey;
}

const DAY_MS = 86_400_000;

function toUtc(day: DayKey): number {
    return Date.parse(`${day}T00:00:00Z`);
}

function fromUtc(ms: number): DayKey {
    return new Date(ms).toISOString().slice(0, 10);
}

export function isDayKey(value: unknown): value is DayKey {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function shiftDay(day: DayKey, days: number): DayKey {
    return fromUtc(toUtc(day) + days * DAY_MS);
}

export function daysBetween(from: DayKey, to: DayKey): number {
    return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 domingo … 6 sabado. Se calcula en UTC porque `day` ya es un dia local. */
export function weekdayOf(day: DayKey): number {
    return new Date(toUtc(day)).getUTCDay();
}

const FRIDAY = 5;
const SATURDAY = 6;
const SUNDAY = 0;

/** `true` si el dia cae en el bloque viernes-sabado-domingo. */
export function isWeekendDay(day: DayKey): boolean {
    const weekday = weekdayOf(day);
    return weekday === FRIDAY || weekday === SATURDAY || weekday === SUNDAY;
}

/**
 * El sabado que ancla el fin de semana de este dia, o `null` si es de lunes a
 * jueves. Es la CLAVE con la que se decide si dos partidos son la misma fecha.
 */
export function weekendAnchor(day: DayKey): DayKey | null {
    const weekday = weekdayOf(day);
    if (weekday === SATURDAY) return day;
    if (weekday === FRIDAY) return shiftDay(day, 1);
    if (weekday === SUNDAY) return shiftDay(day, -1);
    return null;
}

/**
 * La clave de agrupamiento de un dia.
 *
 * Para un dia de fin de semana es el sabado que lo ancla; para uno de semana,
 * el dia mismo. Dos partidos con la misma clave van a la misma fecha.
 */
export function periodKeyOf(day: DayKey): DayKey {
    return weekendAnchor(day) ?? day;
}

export function sameMatchday(a: DayKey, b: DayKey): boolean {
    return periodKeyOf(a) === periodKeyOf(b);
}

/**
 * El periodo NOMINAL de un fin de semana: viernes a domingo. Es el que se usa
 * para decidir si un partido nuevo entra en una fecha que ya existe.
 */
export function nominalPeriodOf(day: DayKey): Period {
    const anchor = weekendAnchor(day);
    if (!anchor) return { start: day, end: day };
    return { start: shiftDay(anchor, -1), end: shiftDay(anchor, 1) };
}

/**
 * El periodo REAL de una fecha: del primer partido al ultimo.
 *
 * Es el que se guarda. Se guarda el real y no el nominal porque una fecha que
 * se jugo entera un sabado tiene que decir "sabado", no "viernes a domingo":
 * si no, la cabecera del calendario miente sobre dos dias que no se jugaron.
 */
export function periodOfDays(days: readonly DayKey[]): Period | null {
    const valid = days.filter(isDayKey).sort();
    if (valid.length === 0) return null;
    return { start: valid[0], end: valid[valid.length - 1] };
}

/** `true` si un dia cae dentro del periodo, inclusive los extremos. */
export function periodContains(period: Period, day: DayKey): boolean {
    return period.start <= day && day <= period.end;
}

/**
 * Dado un dia, cual de las fechas existentes le corresponde.
 *
 * Primero por periodo guardado, y despues por clave de fin de semana: una fecha
 * cuyo unico partido es el sabado tiene periodo `[sab, sab]`, y el domingo de
 * ESE fin de semana tiene que caer ahi aunque quede fuera del rango guardado.
 * Ese es exactamente el caso de los 808 pares.
 */
export function findMatchdayFor<T extends { period: Period | null }>(
    rounds: readonly T[],
    day: DayKey,
): T | null {
    for (const round of rounds) {
        if (round.period && periodContains(round.period, day)) return round;
    }
    const key = periodKeyOf(day);
    for (const round of rounds) {
        if (round.period && periodKeyOf(round.period.start) === key) return round;
    }
    return null;
}

/**
 * Los pares de fechas CONSECUTIVAS que son el mismo fin de semana partido en
 * dos. Devuelve el indice del primero de cada par.
 *
 * No decide sola: quien llama tiene que chequear que no se repita un club entre
 * las dos, porque dos fechas del mismo fin de semana con equipos repetidos son
 * dos fechas de verdad (un torneo concentrado). En la base son 3 de 810.
 */
export function findSplitWeekends(periods: readonly (Period | null)[]): number[] {
    const found: number[] = [];
    for (let index = 0; index < periods.length - 1; index += 1) {
        const current = periods[index];
        const next = periods[index + 1];
        if (!current || !next) continue;
        if (periodKeyOf(current.end) === periodKeyOf(next.start)) found.push(index);
    }
    return found;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "22 mar", "22-23 mar" o "30 mar - 1 abr". Sin ano: la fase ya lo dice. */
export function formatPeriod(period: Period | null): string {
    if (!period) return 'Sin fecha';
    const [, startMonth, startDay] = period.start.split('-');
    const [, endMonth, endDay] = period.end.split('-');
    const startLabel = `${Number(startDay)} ${MONTHS[Number(startMonth) - 1]}`;
    if (period.start === period.end) return startLabel;
    if (startMonth === endMonth) {
        return `${Number(startDay)}-${Number(endDay)} ${MONTHS[Number(startMonth) - 1]}`;
    }
    return `${startLabel} - ${Number(endDay)} ${MONTHS[Number(endMonth) - 1]}`;
}

/**
 * El dia calendario de un instante, en la zona que se le pase.
 *
 * Va aca y no en `lib/timezone` porque es el puente entre el ISO en UTC que
 * guarda `matches.date_time` y los dias con los que trabaja este modulo. Sin
 * zona explicita, un partido del sabado a las 22 se lee domingo en UTC y cae en
 * la fecha equivocada.
 */
export function dayKeyInTimeZone(iso: string | null | undefined, timeZone: string): DayKey | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const lookup: Record<string, string> = {};
    for (const part of parts) if (part.type !== 'literal') lookup[part.type] = part.value;
    if (!lookup.year || !lookup.month || !lookup.day) return null;
    return `${lookup.year}-${lookup.month}-${lookup.day}`;
}
