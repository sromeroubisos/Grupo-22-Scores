import type { CaptainState } from '../../../../features/captain/index.ts';
import {
    CAPTAIN_ENGINE_VERSION, CAPTAIN_POSITIONS_VERSION, COMPETITION_LEVELS_VERSION,
    NATIONS_VERSION, NORMALIZED_CATALOG_VERSION,
} from '../../../../features/captain/index.ts';

// Guardado local versionado de El Capitán. Si cambia el schema del guardado, la
// versión del motor, la de los puestos o la de cualquier catálogo, el guardado
// viejo se DESCARTA entero: no se intenta migrar parcialmente un estado que el
// motor ya no sabe interpretar.
//
// Clave propia. No toca `g22-carrera-rugby`: son dos juegos distintos y una
// partida de uno no puede invalidar la del otro.
const KEY = 'g22-el-capitan';

// Schema 1: el primero. No hay guardados anteriores que descartar.
//
// Schema 2: los Momentos. `pendingMoment` y `moments` en CaptainState, y la
// fase 'moment'. Los guardados 1 SE DESCARTAN aunque el default honesto exista
// —`pendingMoment: null` y `moments: []` dejarían la partida andando— porque el
// estado quedaría mintiendo: una carrera de doce temporadas sin una sola jugada
// registrada diría que el jugador nunca tuvo un momento decisivo, y no es que
// no los tuvo: es que no existían. Preferimos que empiece de nuevo antes que
// mostrarle una trayectoria falsa.
//
// A medida que el estado crezca, cada schema nuevo se documenta ACÁ y se dice
// por qué se descartó en vez de migrarse. Es la convención de
// `carrera-rugby/careerStorage.ts` y vale la pena copiarla entera: cuando hay
// un default honesto para un campo nuevo se dice, y aun así se descarta si el
// resto del estado quedaría mintiendo.
// 3 · Se fue `time: TimeBudget` del estado y `time` de cada fila del historial,
//     y entró `training: string | null` en los dos. Una partida de schema 2 no se
//     puede migrar sin inventarle un entrenamiento a cada temporada ya jugada,
//     así que se resuelve como `'outdated'` y la UI ofrece empezar de nuevo.
// 4 · Se partió `player.potential` en `potentialBase` + `built`. Una partida de
//     schema 3 tiene el campo viejo y ninguno de los dos nuevos, así que su
//     techo se leería como `NaN` y la carrera se rompería en silencio en la
//     primera temporada. Migrarla sería posible —`potentialBase = potential`,
//     `built = 0`— pero mentiría: esa partida se jugó con cartas que no
//     construían nada, y arrancaría con la banda entera todavía disponible a
//     mitad de carrera. Se resuelve como `'outdated'`.
const SCHEMA = 4;

/**
 * Las versiones que se sellan, y las dos decisiones que no son obvias.
 *
 * 1 · Se sella `NORMALIZED_CATALOG_VERSION` y no `CLUB_CATALOG_VERSION`.
 *     La compuesta ya trae adentro el snapshot sudamericano y el canon
 *     argentino (`AR_SYSTEM_VERSION`), y El Capitán se apoya en el sistema
 *     argentino mucho más que Carrera de Rugby: el Nacional de Clubes, los
 *     cupos del TDI y las divisiones de URBA e interior son la escalera del
 *     club, que es media mitad del juego. Con la compuesta, tocar
 *     `arSystem2026.ts` invalida las partidas de El Capitán solo. Carrera usa
 *     la simple por historia; acá se arranca bien de entrada.
 *
 * 2 · NO se sellan `CAREER_ENVIRONMENT_VERSION` ni
 *     `INTERNATIONAL_CALENDAR_VERSION`. Captain no importa esos módulos: el
 *     escalafón de empleo y el fixture de selecciones son de Carrera de Rugby.
 *     El día que importe alguno, se agrega el campo Y SE SUBE EL SCHEMA —
 *     agregar un campo de versión cambia la forma del payload.
 */
interface SavedCaptain {
    schema: number;
    engineVersion: string;
    positionsVersion: string;
    clubCatalogVersion: string;
    nationsVersion: string;
    competitionLevelsVersion: string;
    savedAt: number;
    state: CaptainState;
}

export type LoadResult =
    | { kind: 'none' }
    | { kind: 'ok'; state: CaptainState }
    | { kind: 'outdated' }; // había una partida pero es de una versión incompatible

export function saveCaptain(state: CaptainState): void {
    if (typeof window === 'undefined') return;
    try {
        const payload: SavedCaptain = {
            schema: SCHEMA,
            engineVersion: CAPTAIN_ENGINE_VERSION,
            positionsVersion: CAPTAIN_POSITIONS_VERSION,
            clubCatalogVersion: NORMALIZED_CATALOG_VERSION,
            nationsVersion: NATIONS_VERSION,
            competitionLevelsVersion: COMPETITION_LEVELS_VERSION,
            savedAt: Date.now(),
            state,
        };
        window.localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): la partida sigue en memoria.
    }
}

/**
 * Carga la partida. Devuelve `outdated` (y limpia la clave) cuando el guardado
 * existe pero pertenece a otra versión: así la UI puede avisar sin romper.
 *
 * Una partida vieja NUNCA explota. Si no se puede migrar, se ofrece empezar de
 * nuevo con un mensaje claro (CLAUDE.md §2).
 */
export function loadCaptain(): LoadResult {
    if (typeof window === 'undefined') return { kind: 'none' };
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return { kind: 'none' };

        const parsed = JSON.parse(raw) as Partial<SavedCaptain>;
        const compatible =
            parsed.schema === SCHEMA
            && parsed.engineVersion === CAPTAIN_ENGINE_VERSION
            && parsed.positionsVersion === CAPTAIN_POSITIONS_VERSION
            && parsed.clubCatalogVersion === NORMALIZED_CATALOG_VERSION
            && parsed.nationsVersion === NATIONS_VERSION
            && parsed.competitionLevelsVersion === COMPETITION_LEVELS_VERSION;

        if (!compatible || !parsed.state) {
            clearCaptain();
            return { kind: 'outdated' };
        }
        return { kind: 'ok', state: parsed.state };
    } catch {
        clearCaptain();
        return { kind: 'outdated' };
    }
}

/** Borra SOLO la partida de El Capitán. No toca ninguna otra clave. */
export function clearCaptain(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // no-op
    }
}
