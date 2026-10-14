import type { CoachState } from '../../../../features/coach/index.ts';
import {
    CLUB_CATALOG_VERSION,
    COMPETITION_CATALOG_VERSION,
    ENGINE_VERSION,
    EVENTS_VERSION,
    GEO_VERSION,
    EMPTY_FINANCE,
    EMPTY_TRANSFERS,
    LEGACY_CLUB_IDS,
    completePlayer,
    sanitizeCoach,
} from '../../../../features/coach/index.ts';

// Guardado local versionado.
//
// LA POLÍTICA ES NO BORRAR. Carrera de Rugby descarta la partida entera cuando
// cambia cualquier versión, y el costo es conocido: cada release les borra la
// carrera a todos. Acá una partida vieja se MIGRA (por esquema) y se SANEA (por
// catálogo y contenido), y solo se da por perdida cuando de verdad no hay
// partida que salvar. El momento de poner esto es ahora, con cero jugadores:
// con gente de quince temporadas, cuesta diez veces más y ya perdiste a los
// primeros.
//
// Las versiones se siguen escribiendo en el guardado. No deciden si se carga:
// dicen QUÉ cambió desde que se guardó, y con eso el saneado sabe si tiene algo
// que reparar y la UI si tiene algo que avisar.
const KEY = 'g22-el-entrenador';

// Schema 1: la forma inicial de `CoachState`.
// Schema 2: `club.upgrades` (las mejoras del club) y `seasons[].board` (la
//           evaluación de la subcomisión en tres ejes, opcional).
// Schema 3: los clubes y las divisiones salen del CANON (arSystem2026). Los ids
//           de club cambiaron a los de Carrera de Rugby; el migrador los traduce.
// Schema 4: `playoff` (la definición que el jugador juega partido a partido).
// Schema 5: `market` (las propuestas de trabajo y los movimientos de bancos),
//           `world.benches` / `world.freeAgents` (quién dirige cada club), y la
//           llave pendiente generalizada (`playoff.kind`, `alive`, `championId`):
//           ahora puede ser el reducido por el ascenso y tener cuartos.
//           `seasons[].promotedVia` es opcional y no se inventa para atrás.
// Schema 6: El Entrenador v2, etapa 1. El jugador tiene ánimo, cansancio,
//           lesión, personalidad, formado en el club, arraigo, vínculo
//           (`deal`) y estadísticas; el estado suma `finance` (préstamo,
//           adelantos, evento, recortes, ajuste de la subcomisión),
//           `objectives` y `project`. `seasons[].finance/objectives/project`
//           son opcionales y no se inventan para atrás. La versión del estatus
//           económico de cada división viaja dentro de `competitionCatalogVersion`.
// Schema 7: El Entrenador v2, etapa 2: la temporada en tramos. `inSeason` (el
//           tramo en curso, la tabla y los partidos parciales, los ratings del
//           año, la semana, el partido clave, las lesiones y los que se fueron),
//           `trainingDefault` (la semana fija), `stats.tackles` y
//           `career.tackles`, las fases `training` / `keymatch` / `tramo`, y
//           `seasons[].stars` (opcional, no se inventa para atrás). El formativo
//           nuevo es `titularidades-propias`; el viejo se sigue midiendo.
// Schema 8: El Entrenador v2, etapa 3: el mercado de jugadores. `transfers`
//           (la ventana abierta con sus ofertas, candidatos y pedidos, los
//           cedidos, la plata del mercado de la temporada, el registro de
//           movimientos y la negociación en curso) y la fase `market` (la
//           ventana corta entre el tramo 1 y el 2). El plantel deja de ser de 26
//           fijos: entre 23 y 26 contando a los cedidos.
// Schema 9: El Entrenador v2, etapa 4: los juveniles. `academy` (el M19 con el
//           techo oculto y el rango estimado de cada pibe, la jornada de
//           captación del año y lo que pasó con ellos) y el objetivo formativo
//           `promover-m19`. El migrador deja `academy` en null y el saneado arma
//           el M19 con un RNG DERIVADO de la semilla, la temporada y el club
//           (no corre la carrera); si la partida está en la pretemporada, abre
//           también la jornada de captación del año.
//
// EL TAMAÑO. Medido el 2026-10-14 con el harness de mil carreras × 12
// temporadas y decisiones al azar: al cierre de cada año el estado más grande
// pesa 134 KB de JSON y, al terminar la carrera, 135 KB (eran 128 KB con el
// esquema 6). El pico está a mitad de año, en el resumen del tercer tramo de una
// división grande: 157 KB (300 carreras), porque conviven los partidos del año
// en curso (`inSeason.matches`) con los del anterior (`lastMatches`). Al
// terminar la fase regular la tabla y los partidos de `inSeason` se vacían
// (pasan a `lastTable` / `lastMatches`) y la temporada entera se descarta al
// cerrar el año. Lejos del tope de 5 MB de localStorage.
//
// Con el esquema 8 (el mercado), medido el 2026-10-14 con 300 carreras × 12
// temporadas y el mercado resuelto al azar: 136 KB al cierre de cada año como
// mucho (eran 134), 137 KB al terminar la carrera (123 de media) y un pico de
// 160 KB en el resumen del tercer tramo (eran 157). El mercado entero (`transfers`,
// con la ventana abierta, los cedidos y el registro de dos temporadas) no pasa
// de 7 KB: el registro se recorta a la temporada en curso y la anterior.
//
// Con el esquema 9 (el M19), medido el 2026-10-14 con 1000 carreras × 12
// temporadas (una de cada cinco pesada) y el M19 y el mercado al azar: 144 KB al
// cierre de cada año como mucho (eran 136) y al terminar la carrera, y un pico
// de 166 KB en el resumen del tercer tramo (eran 160). El M19 entero (`academy`:
// hasta 12 pibes, la jornada con sus candidatos y el registro de dos
// temporadas) no pasa de 7 KB.
export const SCHEMA = 9;

/** Un id de club viejo, traducido al del canon. Si no tiene traducción, queda igual. */
function canonId(id: unknown): unknown {
    return typeof id === 'string' ? (LEGACY_CLUB_IDS[id] ?? id) : id;
}

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migradores de esquema, encadenados. La clave es el esquema DESDE el que se
 * migra, y cada uno deja el estado en el esquema siguiente. Cuando subas
 * `SCHEMA` a N, agregá acá el migrador N-1 — y nada más: `readSavedCareer` los
 * aplica en orden hasta llegar al actual.
 *
 * Ejemplo, si el esquema 2 le agregara `staff` a `CoachState`:
 *
 *     1: (s) => ({ ...s, staff: [] }),
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
    // El club arranca sin mejoras. Las temporadas ya jugadas quedan sin `board`:
    // no se inventa una evaluación que nadie hizo.
    1: (s) => {
        const club = typeof s.club === 'object' && s.club !== null ? (s.club as Record<string, unknown>) : {};
        return { ...s, club: { ...club, upgrades: {} } };
    },
    // El catálogo pasó al canon. El club del jugador y su historia se traducen al
    // id nuevo; la pirámide se vacía y el saneado la vuelve a repartir con el
    // canon (cada club en su división real), así que el torneo puede cambiar y el
    // objetivo se vuelve a pedir. La tabla y los partidos del año pasado tenían
    // ids viejos y torneos que ya no existen: se descartan. Las temporadas
    // jugadas se quedan, con el nombre de torneo que tenían cuando se jugaron.
    2: (s) => {
        const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
        return {
            ...s,
            clubId: canonId(s.clubId),
            world: { ratings: {}, divisions: {} },
            lastTable: [],
            lastMatches: [],
            lastKnockout: [],
            lastLeagueMovement: null,
            seasons: list(s.seasons).map((e) => ({ ...e, clubId: canonId(e.clubId) })),
            history: list(s.history).map((h) => ({ ...h, clubId: canonId(h.clubId) })),
        };
    },
    // Antes el playoff se jugaba solo; ningún guardado viejo está a mitad de uno.
    3: (s) => ({ ...s, playoff: null }),
    // El mercado arranca vacío: las propuestas salen del próximo cierre de
    // temporada. Los bancos de los otros clubes los reparte el saneado
    // (`repairWorld`), igual que al empezar. Una llave a medio jugar era siempre
    // por el título y de 2 o 4: se completa con lo que ya tenía. Si el formato de
    // hoy no tiene esa llave, el saneado resuelve la postemporada con las reglas
    // nuevas.
    4: (s) => {
        const p = typeof s.playoff === 'object' && s.playoff !== null ? (s.playoff as Record<string, unknown>) : null;
        const playoff = p
            ? {
                  ...p,
                  kind: 'titulo',
                  alive: p.stage === 'final' ? [p.homeId, p.awayId] : p.seeds,
                  championId: null,
              }
            : null;
        return { ...s, playoff, market: { season: s.season, offers: [], news: [] } };
    },
    // Los campos nuevos del jugador, con valores NEUTROS Y DETERMINISTAS: sin
    // RNG (la personalidad sale de un hash del id, el ánimo es 60, el cansancio
    // cero, el vínculo es el de referencia de su dorsal en el estatus de la
    // división). La caja arranca sin préstamo ni recortes; los objetivos y el
    // proyecto quedan vacíos y se piden en la próxima pretemporada (si la
    // partida está en la pretemporada, el saneado los pide al cargarla).
    5: (s) => {
        const competitionId = typeof s.competitionId === 'string' ? s.competitionId : '';
        const squad = Array.isArray(s.squad)
            ? (s.squad as unknown[]).map((p) =>
                  typeof p === 'object' && p !== null && typeof (p as { id?: unknown }).id === 'string'
                      ? completePlayer(p as Parameters<typeof completePlayer>[0], competitionId)
                      : p,
              )
            : s.squad;
        return { ...s, squad, finance: { ...EMPTY_FINANCE }, objectives: [], project: null };
    },
    // La temporada en tramos. Los tackles arrancan en cero (no se inventan). Una
    // partida guardada a mitad de las cinco tarjetas de la pretemporada sigue
    // con las que le quedan: al terminarlas arranca la fase regular SIN tarjetas
    // por tramo (las cinco del año ya salieron) y se juega en tramos desde ahí
    // (`toTraining` en el motor). Una en el playoff o en el cierre no necesita
    // temporada en curso: la tabla ya está en `lastTable`.
    6: (s) => {
        const withTackles = (st: unknown) =>
            typeof st === 'object' && st !== null ? { tackles: 0, ...(st as Record<string, unknown>) } : st;
        const squad = Array.isArray(s.squad)
            ? (s.squad as unknown[]).map((p) =>
                  typeof p === 'object' && p !== null
                      ? {
                            ...(p as Record<string, unknown>),
                            stats: withTackles((p as Record<string, unknown>).stats),
                            career: withTackles((p as Record<string, unknown>).career),
                        }
                      : p,
              )
            : s.squad;
        return { ...s, squad, inSeason: null, trainingDefault: null };
    },
    // El mercado arranca vacío y sin cedidos: la ventana de la pretemporada se
    // abre en el próximo cierre de año (una partida migrada en la pretemporada
    // juega esta temporada sin mercado; no se inventan ofertas que nadie hizo).
    // La plata del mercado de la temporada en curso, en cero.
    7: (s) => ({
        ...s,
        transfers: {
            ...EMPTY_TRANSFERS,
            ledger: { season: typeof s.season === 'number' ? s.season : 1, compensaciones: 0, indemnizaciones: 0 },
        },
    }),
    // El M19 no se inventa acá (el migrador no sabe nada del motor): queda en
    // null y `sanitizeCoach` lo arma con el RNG derivado de la semilla y el club.
    8: (s) => ({ ...s, academy: null }),
};

interface SavedCareer {
    schema: number;
    engineVersion: string;
    clubCatalogVersion: string;
    competitionCatalogVersion: string;
    geoVersion: string;
    /**
     * Versión del CONTENIDO. Los eventos entran en el guardado por dos vías: el
     * `decisionLog` guarda el texto del desenlace que el jugador ya leyó, y
     * `seenEvents` guarda los ids para el cooldown. El saneado descarta los ids
     * que ya no existen; el texto leído se queda, porque ya pasó.
     */
    eventsVersion: string;
    savedAt: number;
    state: CoachState;
}

export type LoadResult =
    | { kind: 'none' }
    /** `repaired` avisa que la partida cambió al cargarla: el juego se actualizó. */
    | { kind: 'ok'; state: CoachState; repaired: boolean }
    /** Había una partida pero no se pudo salvar. */
    | { kind: 'outdated' };

export function saveCareer(state: CoachState): void {
    if (typeof window === 'undefined') return;
    try {
        const payload: SavedCareer = {
            schema: SCHEMA,
            engineVersion: ENGINE_VERSION,
            clubCatalogVersion: CLUB_CATALOG_VERSION,
            competitionCatalogVersion: COMPETITION_CATALOG_VERSION,
            geoVersion: GEO_VERSION,
            eventsVersion: EVENTS_VERSION,
            savedAt: Date.now(),
            state,
        };
        window.localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): la partida sigue en memoria.
    }
}

/**
 * Lleva un estado del esquema `from` al `to` aplicando los migradores en
 * cadena. `null` si falta alguno: un guardado del futuro (esquema mayor al
 * actual) o un salto sin migrador no se inventan.
 */
export function migrateSchema(
    state: Record<string, unknown>,
    from: number,
    to: number,
    migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> | null {
    if (!Number.isInteger(from) || from > to) return null;
    let cur = state;
    for (let v = from; v < to; v++) {
        const step = migrations[v];
        if (!step) return null;
        cur = step(cur);
    }
    return cur;
}

/**
 * Interpreta un guardado crudo. Es puro —sin `window`— para poder testearlo:
 * la carga real es esto más `localStorage`.
 */
export function readSavedCareer(raw: string): LoadResult {
    let parsed: Partial<SavedCareer>;
    try {
        parsed = JSON.parse(raw) as Partial<SavedCareer>;
    } catch {
        return { kind: 'outdated' };
    }
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.schema !== 'number') {
        return { kind: 'outdated' };
    }
    if (typeof parsed.state !== 'object' || parsed.state === null) return { kind: 'outdated' };

    const migrated = migrateSchema(parsed.state as unknown as Record<string, unknown>, parsed.schema, SCHEMA);
    if (!migrated) return { kind: 'outdated' };

    const state = sanitizeCoach(migrated);
    if (!state) return { kind: 'outdated' };

    const versionsMatch =
        parsed.schema === SCHEMA
        && parsed.engineVersion === ENGINE_VERSION
        && parsed.clubCatalogVersion === CLUB_CATALOG_VERSION
        && parsed.competitionCatalogVersion === COMPETITION_CATALOG_VERSION
        && parsed.geoVersion === GEO_VERSION
        && parsed.eventsVersion === EVENTS_VERSION;
    const repaired = !versionsMatch || stableJson(state) !== stableJson(parsed.state);

    return { kind: 'ok', state, repaired };
}

/**
 * JSON con las claves ordenadas, para comparar dos estados por VALOR. El saneado
 * reconstruye la pirámide en otro orden de claves, y `JSON.stringify` a secas
 * diría que una partida idéntica cambió.
 */
function stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
        const rec = v as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(rec).sort()) sorted[k] = rec[k];
        return sorted;
    });
}

/**
 * Carga la partida. Devuelve `outdated` (y limpia la clave) solo cuando el
 * guardado existe y no hay forma de salvarlo. Una partida vieja NUNCA explota.
 */
export function loadCareer(): LoadResult {
    if (typeof window === 'undefined') return { kind: 'none' };
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return { kind: 'none' };
        const result = readSavedCareer(raw);
        if (result.kind === 'outdated') clearCareer();
        return result;
    } catch {
        clearCareer();
        return { kind: 'outdated' };
    }
}

/** Borra SOLO la partida de El Entrenador. No toca ninguna otra clave. */
export function clearCareer(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // no-op
    }
}
