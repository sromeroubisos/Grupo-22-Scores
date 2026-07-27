import type { CareerState } from '../../../../features/career/index.ts';
import { CAREER_ENVIRONMENT_VERSION, CLUB_CATALOG_VERSION, COMPETITION_LEVELS_VERSION, ENGINE_VERSION, NATIONS_VERSION } from '../../../../features/career/index.ts';

// Guardado local versionado. Si cambia el schema del guardado, la versión del
// motor o la del catálogo, el guardado viejo se DESCARTA entero: no se intenta
// migrar parcialmente un estado que el motor ya no sabe interpretar.
const KEY = 'g22-carrera-rugby';
// Schema 5: identidad real de competición, ledger de participación, honores
// club/jugador, movementKind y curva de OVR (Fase 1.5).
// Schema 6: `startRoute` en CareerState; `points`, desglose del pie y `scrumsWon`
// en SeasonStats; `secondaryStat` reemplaza a `primaryStat` en la trayectoria;
// `startRouteModel` y `routeDowngraded` en Player. Los guardados < 6 se descartan
// con el aviso no técnico existente: no hay forma honesta de inventarle una ruta
// a una partida que se creó sin elegir ninguna.
const SCHEMA = 6;

interface SavedCareer {
    schema: number;
    engineVersion: string;
    clubCatalogVersion: string;
    nationsVersion: string;
    competitionLevelsVersion: string;
    environmentVersion: string;
    savedAt: number;
    state: CareerState;
}

export type LoadResult =
    | { kind: 'none' }
    | { kind: 'ok'; state: CareerState }
    | { kind: 'outdated' }; // había una partida pero es de una versión incompatible

export function saveCareer(state: CareerState): void {
    if (typeof window === 'undefined') return;
    try {
        const payload: SavedCareer = {
            schema: SCHEMA,
            engineVersion: ENGINE_VERSION,
            clubCatalogVersion: CLUB_CATALOG_VERSION,
            nationsVersion: NATIONS_VERSION,
            competitionLevelsVersion: COMPETITION_LEVELS_VERSION,
            environmentVersion: CAREER_ENVIRONMENT_VERSION,
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
 */
export function loadCareer(): LoadResult {
    if (typeof window === 'undefined') return { kind: 'none' };
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return { kind: 'none' };

        const parsed = JSON.parse(raw) as Partial<SavedCareer>;
        const compatible =
            parsed.schema === SCHEMA
            && parsed.engineVersion === ENGINE_VERSION
            && parsed.clubCatalogVersion === CLUB_CATALOG_VERSION
            && parsed.nationsVersion === NATIONS_VERSION
            && parsed.competitionLevelsVersion === COMPETITION_LEVELS_VERSION
            && parsed.environmentVersion === CAREER_ENVIRONMENT_VERSION;

        if (!compatible || !parsed.state) {
            clearCareer();
            return { kind: 'outdated' };
        }
        return { kind: 'ok', state: parsed.state };
    } catch {
        clearCareer();
        return { kind: 'outdated' };
    }
}

/** Borra SOLO la partida de carrera. No toca ninguna otra clave. */
export function clearCareer(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // no-op
    }
}
