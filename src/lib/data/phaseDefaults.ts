/**
 * Defaults de una fase, por deporte.
 *
 * Hasta acá los defaults vivían sueltos: el puntaje en `sportDefaults` dentro
 * del wizard de alta (`src/app/admin/super/torneos/crear/page.tsx`), y las
 * columnas y los desempates hardcodeados en `TournamentStructureTab`, con
 * `tries`, `conversiones`, `penales` y `tackles` fijos — o sea, un torneo de
 * handball ofrecía columnas de rugby. Este módulo es la única fuente.
 *
 * Tres reglas que se respetan acá adentro:
 *
 * 1. **El puntaje va por id de deporte, no por bucket.** `normalizeSportBucket`
 *    manda `rugby-league` al bucket `rugby` porque comparten los eventos de
 *    partido, pero league puntúa 2/1/0 y union 4/2/0. Para eventos el bucket
 *    está bien; para puntos, miente.
 *
 * 2. **Una columna de estadística nunca se inventa.** Las columnas propias del
 *    deporte salen del catálogo de eventos del torneo
 *    (`resolveMatchEventDefinitions`), que ya respeta el override por torneo.
 *    Si la columna no se puede llenar desde un evento cargado, no se ofrece.
 *
 * 3. **Sin empate, sin columna de empates.** En básquet no hay empates: una
 *    columna E que siempre dice 0 es ruido.
 */

// Rutas relativas con extensión, no el alias `@/`: el runner del proyecto
// (`node --test`) no resuelve el alias, sólo lo hace el build de Next. Es la
// misma convención de `src/lib/integrations/urba/planMatches.ts`.
import {
    normalizeSportBucket,
    resolveMatchEventDefinitions,
    type MatchEventDefinition,
} from '../matchEventCatalog.ts';
import type { TiebreakerMetricItem } from '../../types/phase-settings.ts';

/** Puntos que reparte un partido. Es la forma que ya guarda `pointsSystem`. */
export interface PhasePointsDefaults {
    win: number;
    draw: number;
    loss: number;
    /** Si el deporte contempla puntos bonus (hoy, sólo el rugby union). */
    allowBonusPoints: boolean;
}

/** El bonus del rugby, en la forma canónica de `settings.bonus`. */
export interface PhaseBonusDefaults {
    offensive: { mode: 'count' | 'difference'; threshold: number; points: number; label: string } | null;
    defensive: { margin: number; points: number; label: string } | null;
}

/** Una columna de estadística propia del deporte, sacada de sus eventos. */
export interface PhaseStatColumn {
    key: string;
    label: string;
    /**
     * El evento del que sale el número, o `null` si no sale de un evento de
     * partido. "Carrera" es el caso: la columna existe en la tabla pero el
     * catálogo de rugby no tiene un evento `run`, así que no se puede cruzar
     * contra los eventos del torneo y se ofrece siempre.
     */
    eventType: string | null;
}

export interface PhaseDefaults {
    points: PhasePointsDefaults;
    bonus: PhaseBonusDefaults | null;
    /** Columnas base activas por defecto, en el orden en que se muestran. */
    columns: Record<string, boolean>;
    /** Columnas de estadística que este deporte puede llenar. */
    statColumns: PhaseStatColumn[];
    tiebreakers: TiebreakerMetricItem[];
}

/**
 * Puntaje por deporte. Los valores vienen tal cual de `sportDefaults` del
 * wizard de alta: mover los defaults no es lugar para cambiarlos de callado.
 */
const POINTS_BY_SPORT: Record<string, PhasePointsDefaults> = {
    'rugby':             { win: 4, draw: 2, loss: 0, allowBonusPoints: true },
    'rugby-union':       { win: 4, draw: 2, loss: 0, allowBonusPoints: true },
    'rugby-league':      { win: 2, draw: 1, loss: 0, allowBonusPoints: false },
    'football':          { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'futsal':            { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'beach-soccer':      { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'hockey':            { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'field-hockey':      { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'handball':          { win: 2, draw: 1, loss: 0, allowBonusPoints: false },
    'water-polo':        { win: 2, draw: 1, loss: 0, allowBonusPoints: false },
    'basketball':        { win: 2, draw: 0, loss: 1, allowBonusPoints: false },
    'volleyball':        { win: 3, draw: 0, loss: 0, allowBonusPoints: false },
    'beach-volleyball':  { win: 3, draw: 0, loss: 0, allowBonusPoints: false },
    'american-football': { win: 1, draw: 0, loss: 0, allowBonusPoints: false },
    'aussie-rules':      { win: 4, draw: 2, loss: 0, allowBonusPoints: false },
    'baseball':          { win: 1, draw: 0, loss: 0, allowBonusPoints: false },
    'cricket':           { win: 1, draw: 0, loss: 0, allowBonusPoints: false },
    'tennis':            { win: 2, draw: 0, loss: 0, allowBonusPoints: false },
    'table-tennis':      { win: 2, draw: 0, loss: 0, allowBonusPoints: false },
    'badminton':         { win: 2, draw: 0, loss: 0, allowBonusPoints: false },
    'netball':           { win: 2, draw: 1, loss: 0, allowBonusPoints: false },
    'floorball':         { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'bandy':             { win: 3, draw: 1, loss: 0, allowBonusPoints: false },
    'esports':           { win: 1, draw: 0, loss: 0, allowBonusPoints: false },
};

const GENERIC_POINTS: PhasePointsDefaults = { win: 1, draw: 0, loss: 0, allowBonusPoints: false };

/** Deportes donde un partido no puede terminar empatado. */
const NO_DRAW_SPORTS = new Set([
    'basketball', 'volleyball', 'beach-volleyball', 'tennis', 'table-tennis',
    'badminton', 'baseball', 'snooker', 'darts', 'boxing', 'mma', 'esports', 'golf',
]);

/**
 * El bonus del rugby union, con el reglamento clásico: 4 tries anotados y
 * derrota por 7 o menos. El modo `difference` (3+ de diferencia) existe y se
 * elige por torneo — ver `OffensiveBonusMode` en `bonusRuleMetrics.ts` —, pero
 * el default es el que usan URBA y el Seis Naciones.
 */
const RUGBY_BONUS: PhaseBonusDefaults = {
    offensive: { mode: 'count', threshold: 4, points: 1, label: 'Bonus ofensivo' },
    defensive: { margin: 7, points: 1, label: 'Bonus defensivo' },
};

/**
 * Las columnas que la tabla sabe pintar, con los ids exactos que ya usa
 * `columnCategories` en `TournamentStructureTab`. No es una lista nueva: es
 * ESA lista. Guardar un id que el selector no conoce deja una columna que se
 * marca, se guarda y no dibuja nada.
 */
const BASE_COLUMN_ORDER = [
    'posVariation', 'points', 'played', 'classification',
    'won', 'drawn', 'lost', 'percentage',
    'extraPlayed', 'extraWon', 'extraDrawn', 'extraLost',
    'pointsFor', 'pointsAgainst', 'pointsDiff',
] as const;

/**
 * Estadísticas propias del deporte que la tabla YA puede pintar.
 *
 * Hoy son sólo las de rugby, y los ids son los que espera el selector
 * (`tries`, no `try`). El catálogo de eventos sabe de handball y de hockey,
 * pero la tabla de posiciones todavía no tiene columna para ellos: derivarlas
 * del catálogo dejaría una casilla que no dibuja nada. Cuando el renderer las
 * soporte se agregan acá y el formulario las toma solo.
 */
const STAT_COLUMNS_BY_BUCKET: Record<string, PhaseStatColumn[]> = {
    rugby: [
        { key: 'tries',       label: 'Try',        eventType: 'try' },
        { key: 'conversions', label: 'Conversión', eventType: 'conversion' },
        { key: 'penalties',   label: 'Penal',      eventType: 'penalty_goal' },
        { key: 'dropGoals',   label: 'Drop Goal',  eventType: 'drop_goal' },
        { key: 'tackles',     label: 'Tackle',     eventType: 'tackle' },
        { key: 'runs',        label: 'Carrera',    eventType: null },
    ],
};

/**
 * Desempates por deporte, en orden de prioridad.
 *
 * No es un detalle cosmético: en rugby el enfrentamiento directo va antes que
 * la diferencia de puntos (URBA, Seis Naciones), y en el fútbol argentino es al
 * revés. Ponerlos todos iguales hace que una tabla ordene mal y nadie se entere
 * hasta que dos equipos empatan en puntos.
 */
const TIEBREAKERS_BY_BUCKET: Record<string, string[]> = {
    rugby:      ['points', 'headToHead', 'pointsDiff', 'pointsFor'],
    football:   ['points', 'pointsDiff', 'pointsFor', 'headToHead'],
    hockey:     ['points', 'pointsDiff', 'pointsFor', 'headToHead'],
    handball:   ['points', 'headToHead', 'pointsDiff', 'pointsFor'],
    basketball: ['points', 'headToHead', 'pointsDiff', 'pointsFor'],
    volleyball: ['points', 'won', 'pointsDiff', 'pointsFor'],
};

// `headToHead`, no `head_to_head`: el segundo figura como id LEGACY en
// TIEBREAKER_LABEL_ALIASES del gestor. Guardar el legacy haría que la fase
// nueva naciera con un id que la UI trata como partida vieja.
const GENERIC_TIEBREAKERS = ['points', 'pointsDiff', 'pointsFor', 'headToHead'];

/** El puntaje del deporte, por id exacto y con el bucket como red. */
export function getPhasePointsDefaults(sportId?: string | null): PhasePointsDefaults {
    const id = String(sportId || '').trim().toLowerCase();
    if (POINTS_BY_SPORT[id]) return { ...POINTS_BY_SPORT[id] };

    const bucket = normalizeSportBucket(id);
    if (POINTS_BY_SPORT[bucket]) return { ...POINTS_BY_SPORT[bucket] };

    return { ...GENERIC_POINTS };
}

/** El bonus del deporte, o `null` si no reparte bonus. */
export function getPhaseBonusDefaults(sportId?: string | null): PhaseBonusDefaults | null {
    if (!getPhasePointsDefaults(sportId).allowBonusPoints) return null;
    return {
        offensive: { ...RUGBY_BONUS.offensive! },
        defensive: { ...RUGBY_BONUS.defensive! },
    };
}

/**
 * Columnas prendidas por defecto según el deporte. Se apagan, no se borran:
 * el gestor puede prender cualquiera desde el selector de columnas.
 */
function defaultActiveColumns(sportId?: string | null): string[] {
    const bucket = normalizeSportBucket(sportId);

    // Lo que se prende en cualquier deporte. `classification` y las de prórroga
    // quedan apagadas: son opt-in del gestor, no default.
    const cols = ['posVariation', 'points', 'played', 'won', 'lost', 'pointsFor', 'pointsAgainst', 'pointsDiff'];

    if (hasDraws(sportId)) cols.push('drawn');

    // El básquet y el vóley se leen por porcentaje; el resto, por diferencia.
    if (bucket === 'basketball' || bucket === 'volleyball' || bucket === 'beach-volleyball') {
        cols.push('percentage');
    }

    return cols;
}

/**
 * Si un partido de este deporte puede terminar empatado.
 *
 * El formulario lo usa para no pedir "puntos por empate" donde el empate no
 * existe: en básquet ese campo siempre valía 0 y sólo servía para confundir.
 */
export function hasDraws(sportId?: string | null): boolean {
    return !NO_DRAW_SPORTS.has(String(sportId || '').trim().toLowerCase());
}

/** Las columnas base en la forma que guarda `settings.tableColumns`. */
export function getBaseTableColumnDefaults(sportId?: string | null): Record<string, boolean> {
    const active = new Set(defaultActiveColumns(sportId));
    const columns: Record<string, boolean> = {};
    for (const key of BASE_COLUMN_ORDER) columns[key] = active.has(key);
    return columns;
}

/**
 * Las columnas de estadística que este torneo puede ofrecer de verdad.
 *
 * Dos filtros, y los dos importan:
 *
 * 1. **La tabla tiene que saber pintarla** — de ahí `STAT_COLUMNS_BY_BUCKET`.
 * 2. **El torneo tiene que registrar ese evento.** Si un torneo redefinió sus
 *    eventos de partido y sacó el drop, la columna Drop Goal quedaría siempre
 *    en cero. Se cruza contra el catálogo del torneo, que ya resuelve el
 *    override por torneo y por fase.
 *
 * Un torneo de rugby que no lleva tackles no ofrece la columna Tackle.
 */
export function getStatColumnOptions(args: {
    sportId?: string | null;
    tournamentRuleset?: Record<string, unknown> | null;
    phaseSettings?: Record<string, unknown> | null;
}): PhaseStatColumn[] {
    const candidates = STAT_COLUMNS_BY_BUCKET[normalizeSportBucket(args.sportId)];
    if (!candidates) return [];

    const registered = new Set(
        resolveMatchEventDefinitions({
            sportId: args.sportId,
            phaseSettings: args.phaseSettings ?? null,
            tournamentRuleset: args.tournamentRuleset ?? null,
        })
            .filter((def: MatchEventDefinition) => def.team === 'required')
            .map((def: MatchEventDefinition) => def.type),
    );

    return candidates
        .filter((col) => col.eventType === null || registered.has(col.eventType))
        .map((col) => ({ ...col }));
}

/** Los desempates del deporte, en la forma que guarda `settings.tiebreakers`. */
export function getTiebreakerDefaults(sportId?: string | null): TiebreakerMetricItem[] {
    const bucket = normalizeSportBucket(sportId);
    const metrics = TIEBREAKERS_BY_BUCKET[bucket] || GENERIC_TIEBREAKERS;

    return metrics.map((metric, index) => ({
        metric,
        enabled: true,
        // Menos derrotas ordena ascendente; todo lo demás, de mayor a menor.
        order: metric === 'lost' || metric === 'pointsAgainst' ? 'asc' : 'desc',
        priority: index + 1,
    }));
}

/** Todo junto: lo que una fase nueva de este deporte trae puesto. */
export function getPhaseDefaults(args: {
    sportId?: string | null;
    tournamentRuleset?: Record<string, unknown> | null;
    phaseSettings?: Record<string, unknown> | null;
}): PhaseDefaults {
    return {
        points: getPhasePointsDefaults(args.sportId),
        bonus: getPhaseBonusDefaults(args.sportId),
        columns: getBaseTableColumnDefaults(args.sportId),
        statColumns: getStatColumnOptions(args),
        tiebreakers: getTiebreakerDefaults(args.sportId),
    };
}

/** El orden canónico de las columnas base, para que la UI no lo reinvente. */
export const BASE_TABLE_COLUMNS: readonly string[] = BASE_COLUMN_ORDER;
