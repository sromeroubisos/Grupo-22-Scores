import type { CareerState } from '../../../../features/career/index.ts';
import {
    CAREER_ENVIRONMENT_VERSION, CLUB_CATALOG_VERSION, COMPETITION_LEVELS_VERSION, ENGINE_VERSION,
    INTERNATIONAL_CALENDAR_VERSION, NATIONS_VERSION,
} from '../../../../features/career/index.ts';

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
// Schema 7: identidad del jugador (`surname`) y `developmentProfile` en Player.
// Los dos son campos nuevos del estado, así que un guardado 6 no se puede
// interpretar — no hay forma honesta de inventarle un perfil de desarrollo a una
// carrera que ya se jugó con una curva distinta. Se resuelve como 'outdated'.
// Schema 8: `paceMode` en CareerState (modos de duración). Acá SÍ habría un
// default honesto —una partida vieja se jugó de a una temporada, o sea
// 'intense'— pero el guardado igual queda invalidado por `engineVersion`, así
// que migrarlo no cambiaría nada y agregaría un camino de código que nadie
// recorre. Se descarta con el aviso no técnico de siempre.
// Schema 9: `player.nationalStats` — la planilla con cada selección, por unión.
// Una partida vieja no la tiene y no hay forma honesta de reconstruirla: el
// motor no guarda en qué temporada se ganó cada cap ni contra quién. Se descarta
// con el aviso no técnico de siempre.
// Schema 10: `player.nationalStatus` (uncapped/squad/starter/dropped),
// `seasons[].nationalStatus` + `seasons[].lostShirt`, y `pendingTestShare` en
// lugar de `pendingCapBoost`. Una partida vieja no tiene ninguno de los cuatro y
// el estado de selección no es reconstruible —el umbral con el que se midió cada
// temporada dependía del club, la forma y la edad de ese momento—, así que se
// descarta con el aviso no técnico de siempre.
// Schema 11: el estado `trial` en `NationalStatus` y `squadCaps` en
// `NationalTeamStats`. Una partida vieja no distingue los caps de gira de los de
// plantel, y ese numero es el que decide si el jugador ya se gano el descuento:
// reconstruirlo seria inventarlo. Se descarta con el aviso no tecnico de siempre.
// Schema 12: `squadRole` en `SeasonResult` y en la trayectoria — el lugar en el
// plantel de esa temporada, en cinco bandas, CONGELADO. Es un campo que se AGREGA
// y no uno que cambia de forma, así que es el caso benigno: nada viejo se
// reinterpreta mal. Se congela en vez de derivarse al renderizar porque sale de
// `valor − rating del club` y el rating del club va a derivar entre temporadas —
// recalcularlo mostraría "titular" en una temporada que se jugó de suplente.
// Schema 13: `startRoute` cambia de CONJUNTO DE VALORES, no de forma. Eran tres
// ('amateur' | 'development' | 'professional') y son dos, porque la ruta amateur
// dejó de ser una ruta: es el arranque de todas las carreras. Un guardado con
// `startRoute: 'amateur'` no se puede reinterpretar —no hay forma honesta de
// decidir si esa carrera "era" la rama larga o la rápida, y de eso depende el
// techo, los arquetipos y la banda de OVR con la que se creó—, así que se descarta
// con el aviso no técnico de siempre. Es el caso que el schema existe para
// atrapar: un valor viejo que sigue pareciendo válido.
// Schema 14: los ejes de decisión y el ascenso. `player.sanctions` (historial
// disciplinario), `pendingPlayingTime`, `pendingStatBoost` y `divisions`
// (ascensos/descensos de la carrera) en `CareerState`, y `outcomeIndex` en cada
// entrada de `decisionLog`. Los cuatro primeros tendrían un default honesto —una
// partida vieja no tiene sanciones, modificadores pendientes ni clubes movidos de
// división— pero `outcomeIndex` no: nadie puede decir cuál de los desenlaces salió
// en una decisión que ya se resolvió, y de eso depende el revelado. Se descarta con
// el aviso no técnico de siempre.
// Schema 15: los TÍTULOS DE SELECCIÓN. `TitleWon` deja de asumir que todo campeón
// es un club: `club` pasa a ser `string | null` y entra `union: string | null`, y
// los dos son excluyentes. Es un cambio de FORMA y no un campo que se agrega, así
// que un guardado 14 no se puede reinterpretar: sus títulos traen `club` poblado y
// `union` ausente, y aunque completarlo con `null` parece inofensivo, el estado
// viejo ADEMÁS no tiene ningún título de selección que sí debería tener —esas
// temporadas ya se jugaron sin que el motor coronara a nadie— así que la vitrina
// de una carrera migrada mentiría por omisión. Se descarta con el aviso de siempre.
// Schema 16: los PREMIOS INDIVIDUALES quedan en la temporada. `awardsWon` en cada
// `CareerSeasonEntry`. Acá sí hay default honesto —una partida vieja no tiene la
// lista, y `[]` no miente: dice "esta temporada no registró premios", que es
// exactamente lo que pasó, porque hasta ahora no se registraban en ningún lado.
// Pero el contador de carrera (`player.flags`) SÍ los tiene acumulados, así que
// una partida migrada mostraría los premios en el retiro y ninguno en la
// trayectoria: la vitrina y la espina dorsal dirían cosas distintas sobre la misma
// carrera. Se descarta con el aviso de siempre.
const SCHEMA = 16;

interface SavedCareer {
    schema: number;
    engineVersion: string;
    clubCatalogVersion: string;
    nationsVersion: string;
    competitionLevelsVersion: string;
    environmentVersion: string;
    /**
     * Calendario internacional. VA APARTE de `engineVersion` por el mismo motivo
     * que `competitionLevelsVersion`: es un catálogo, no lógica. Agregar un
     * torneo, corregir una lista de participantes o mover una edición no cambia
     * una línea del motor, pero sí cambia cuántos caps suma una unión por
     * temporada — o sea, invalida una partida en curso exactamente igual que un
     * cambio de reglas. Meterlo adentro de `engineVersion` obligaría a subir la
     * versión del motor cada vez que se toca un dato, y a los tres meses nadie
     * sabría qué cambió.
     */
    internationalCalendarVersion: string;
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
            internationalCalendarVersion: INTERNATIONAL_CALENDAR_VERSION,
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
            && parsed.environmentVersion === CAREER_ENVIRONMENT_VERSION
            && parsed.internationalCalendarVersion === INTERNATIONAL_CALENDAR_VERSION;

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
