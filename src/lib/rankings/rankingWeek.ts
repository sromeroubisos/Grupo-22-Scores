/**
 * La semana del ranking de clubes.
 *
 * La tabla publica dibuja dos cosas contra un "anterior": la flecha de puesto
 * (`source_previous_position`) y la variacion de puntaje
 * (`source_payload.previous_rating`). Para que eso lea como "que paso esta
 * semana" el anterior tiene que ser la tabla tal como quedo publicada la semana
 * pasada, y nada mas.
 *
 * Antes el anterior era "lo que habia antes de la ultima escritura", y lo
 * pisaba cualquiera: un segundo Recalcular el jueves dejaba las 151 filas en
 * 0,00 y sin flechas hasta el martes siguiente; un ajuste manual reescribia el
 * anterior de TODOS los clubes con el puesto de un minuto atras; el rebuild
 * viejo lo borraba directamente. El movimiento semanal quedaba a merced de
 * quien tocara el panel.
 *
 * Aca se define la semana y se decide, sin base de datos, cuando la referencia
 * se renueva y cuando se conserva. `clubRankings.ts` solo lee y escribe.
 *
 * La semana arranca el MARTES a las 00:00 de Argentina, que es cuando corre el
 * cron `weekly-club-ranking` (`0 3 * * 2` en UTC). Argentina no tiene horario
 * de verano, asi que el desfase es fijo.
 */

const ARGENTINA_OFFSET_MINUTES = -180;
const WEEK_START_DAY = 2; // martes
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

/**
 * `YYYY-MM-DD` del martes que abre la semana del ranking en la que cae `now`.
 * Un lunes a la noche sigue siendo la semana del martes pasado; el martes a las
 * 00:00 de Argentina ya es la nueva.
 */
export function getRankingWeekKey(now: Date = new Date()): string {
    // Corrido al horario argentino y leido como si fuera UTC: asi el dia de la
    // semana y la fecha salen de los getters UTC sin depender del huso del
    // servidor.
    const local = new Date(now.getTime() + ARGENTINA_OFFSET_MINUTES * 60 * 1000);
    const daysSinceWeekStart = (local.getUTCDay() - WEEK_START_DAY + 7) % 7;
    const weekStart = new Date(local.getTime() - daysSinceWeekStart * DAY_IN_MS);
    return toIsoDate(weekStart);
}

/**
 * Lo que el ranking guarda en `club_rankings.metadata.weeklyBaseline`: de que
 * semana es la referencia vigente y cuando se tomo.
 */
export type WeeklyBaselineMark = {
    weekKey: string;
    capturedAt: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readWeeklyBaselineMark(
    metadata: Record<string, unknown> | null | undefined,
): WeeklyBaselineMark | null {
    const raw = metadata && typeof metadata === 'object' ? metadata.weeklyBaseline : null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const weekKey = String((raw as Record<string, unknown>).weekKey ?? '').trim();
    if (!ISO_DATE.test(weekKey)) return null;

    const capturedAt = String((raw as Record<string, unknown>).capturedAt ?? '').trim();
    return { weekKey, capturedAt };
}

/**
 * Marca sintetica para un ranking que todavia no tiene `weeklyBaseline` pero ya
 * corrio esta semana con la logica anterior (`backfill_completed_at`). Lo que
 * dejo guardado como "anterior" ES la tabla de la semana pasada, asi que se
 * adopta como referencia en vez de retomarla: si no, la primera corrida con la
 * marca nueva —un Recalcular el miercoles— apagaba las flechas de toda la
 * semana en la transicion.
 */
export function legacyWeeklyBaselineMark(lastRunAt: string | null | undefined): WeeklyBaselineMark | null {
    if (!lastRunAt) return null;
    const at = new Date(lastRunAt);
    if (Number.isNaN(at.getTime())) return null;
    return { weekKey: getRankingWeekKey(at), capturedAt: at.toISOString() };
}

/** La referencia se renueva solo cuando la corrida cae en otra semana. */
export function isNewRankingWeek(mark: WeeklyBaselineMark | null, weekKey: string) {
    return !mark || mark.weekKey !== weekKey;
}

export type WeeklyBaselineEntry = {
    club_id: string;
    current_position: number | null | undefined;
    current_rating: number | string | null | undefined;
    source_previous_position: number | null | undefined;
    previous_rating: number | string | null | undefined;
};

export type WeeklyBaseline = {
    position: number | null;
    rating: number | null;
};

function toFiniteOrNull(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

/**
 * El "anterior" de cada club para esta corrida.
 *
 * - Primera corrida de la semana: la referencia es la tabla tal como esta
 *   AHORA, antes de rehacerla. Es lo que el visitante vio toda la semana.
 * - Cualquier otra corrida de la misma semana (un Recalcular del panel, un
 *   resultado corregido): la referencia se conserva. Volver a tomarla dejaria
 *   la variacion en cero y las flechas apagadas hasta el martes.
 */
export function resolveWeeklyBaseline(
    entries: WeeklyBaselineEntry[],
    mark: WeeklyBaselineMark | null,
    weekKey: string,
): Map<string, WeeklyBaseline> {
    const renew = isNewRankingWeek(mark, weekKey);

    return new Map(
        entries.map((entry) => [
            entry.club_id,
            renew
                ? { position: toFiniteOrNull(entry.current_position), rating: toFiniteOrNull(entry.current_rating) }
                : { position: toFiniteOrNull(entry.source_previous_position), rating: toFiniteOrNull(entry.previous_rating) },
        ]),
    );
}

/**
 * "martes 8 de septiembre": para decir en la pantalla contra que semana se
 * miden las flechas. Se arma a mano desde el ISO para no depender del huso
 * del que mira: la fecha ya es la argentina.
 */
export function formatRankingWeekLabel(weekKey: string | null | undefined) {
    if (!weekKey || !ISO_DATE.test(weekKey)) return null;

    const [year, month, day] = weekKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    }).format(date);
}
