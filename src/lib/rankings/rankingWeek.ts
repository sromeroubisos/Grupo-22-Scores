/**
 * La semana del ranking de clubes.
 *
 * La tabla publica dibuja dos cosas contra un "anterior": la flecha de puesto
 * (`source_previous_position`) y la variacion de puntaje
 * (`source_payload.previous_rating`). Para que eso lea como "que paso esta
 * semana" el anterior tiene que ser la tabla de la semana pasada, y nada mas.
 *
 * Antes el anterior era "lo que habia antes de la ultima escritura", y lo
 * pisaba cualquiera: un segundo Recalcular el jueves dejaba las 151 filas en
 * 0,00 y sin flechas hasta el martes siguiente; un ajuste manual reescribia el
 * anterior de TODOS los clubes con el puesto de un minuto atras; el rebuild
 * viejo lo borraba directamente. Despues paso a ser "la tabla guardada al abrir
 * la semana", y eso tambien fallo: si lo guardado estaba congelado (el corte de
 * 1000 partidos), la primera corrida sana mostraba semanas acumuladas como si
 * fueran una. Hoy el anterior no se copia de ningun lado: es la temporada
 * reproducida hasta el martes que abrio la semana (rankingReplay.ts).
 *
 * Aca se define la semana —su clave y su instante de arranque— sin base de
 * datos. `clubRankings.ts` solo lee y escribe.
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

/**
 * El instante en que arranca la semana `weekKey`: ese martes a las 00:00 de
 * Argentina, en ISO UTC. Es el corte de la referencia semanal: la tabla
 * "anterior" es la temporada reproducida con los partidos jugados ANTES de
 * este instante (rankingReplay.ts), no lo que hubiera quedado guardado.
 */
export function getRankingWeekStart(weekKey: string): string {
    const [year, month, day] = weekKey.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) - ARGENTINA_OFFSET_MINUTES * 60 * 1000);
    return start.toISOString();
}

/**
 * El corte de la referencia de la semana `weekKey`: el arranque de la semana
 * ANTERIOR. La tabla que se publica el martes 15 se compara contra la que se
 * publico el martes 8, y esa tenia los partidos jugados antes del martes 8. Los
 * del sabado 12 y el domingo 13 son la novedad de esta semana, no parte de la
 * referencia.
 */
export function getWeeklyReferenceCutoff(weekKey: string): string {
    const start = new Date(getRankingWeekStart(weekKey));
    return new Date(start.getTime() - 7 * DAY_IN_MS).toISOString();
}

/**
 * `YYYY-MM-DD` del martes contra el que se miden las flechas de la semana
 * `weekKey`: el anterior. Es lo que la pantalla rotula como "respecto del
 * martes X".
 */
export function getReferenceWeekKey(weekKey: string): string {
    return getRankingWeekKey(new Date(getWeeklyReferenceCutoff(weekKey)));
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
