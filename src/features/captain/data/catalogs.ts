// EL CAPITÁN — la ÚNICA puerta hacia los catálogos de Carrera de Rugby.
//
// Los clubes, las uniones, los países, los niveles de competición y el canon
// del rugby argentino son CATÁLOGO DE RUGBY, no motor de nadie. Ya están
// escritos, mantenidos y probados en `career/data/`, y duplicarlos acá sería
// duplicar quinientos clubes argentinos y veinticinco uniones para que a los
// dos meses los dos catálogos digan cosas distintas.
//
// ── Por qué ruta profunda y no `@/features/career` ──
// Ese barrel re-exporta el MOTOR ENTERO de Carrera de Rugby: los eventos, la
// i18n, el share-token, run-career, el simulador de temporada. Importarlo para
// leer una lista de clubes arrastraría todo eso al bundle de este juego.
//
// ── Por qué un solo archivo ──
// Para que la dependencia sea visible y contable. NINGÚN otro archivo de
// captain/ importa de career/, salvo `engine/random.ts` —que reusa el PRNG— y
// eso lo verifica `engine/__tests__/dependencies.test.ts`. Si mañana estos
// catálogos se mudan a un lugar neutro, hay dos archivos que tocar y no veinte.

// ── Clubes ──────────────────────────────────────────────────────────────────
export type { ClubDef, LeagueDef } from '../../career/data/clubs.ts';
export {
    CLUBS,
    LEAGUES,
    getClub,
    clubLeague,
    clubLevel,
    clubRegion,
    CLUB_CATALOG_VERSION,
    NORMALIZED_CATALOG_VERSION,
} from '../../career/data/clubs.ts';

// ── Países ──────────────────────────────────────────────────────────────────
export type { SelectableCountry } from '../../career/data/countries.generated.ts';
export {
    SELECTABLE_COUNTRIES,
    FREQUENT_COUNTRY_CODES,
} from '../../career/data/countries.generated.ts';

// ── Uniones ─────────────────────────────────────────────────────────────────
export {
    NATIONS_VERSION,
    RUGBY_UNIONS,
    findCountry,
    flagPathOf,
    hasUnion,
    isSelectableCountry,
    unionName,
    unionReputation,
    worldRanking,
} from '../../career/data/nations.ts';

// ── Niveles de competición ──────────────────────────────────────────────────
export type {
    CompetitionLevelProfile,
    EconomicModel,
    SportingBand,
} from '../../career/data/competition-levels2026.ts';
export {
    COMPETITION_LEVELS_VERSION,
    competitionLabelOf,
    economicModelOf,
    levelProfileOf,
    sportingBandOf,
} from '../../career/data/competition-levels2026.ts';

// ── El canon del rugby argentino ────────────────────────────────────────────
// El Capitán se apoya en esto mucho más que Carrera de Rugby: el Nacional de
// Clubes, los cupos del TDI y las veinticuatro divisiones de URBA e interior
// son la escalera del club, que es media mitad del juego.
export {
    AR_SYSTEM_VERSION,
    AR_DIVISIONS,
    TDI_CUPOS_2026,
    NACIONAL_DE_CLUBES_ID,
    arDivisionOf,
    arRegionOf,
    arBranchOf,
    arRatingAt,
    arPrestigeOf,
} from '../../career/data/clubs2026/arSystem2026.ts';

import { CLUBS } from '../../career/data/clubs.ts';

/**
 * ¿Existe este club en el catálogo?
 *
 * Hace falta porque `getClub()` NO avisa cuando no encuentra: devuelve un club
 * por defecto para que el motor de Carrera de Rugby nunca se quede sin uno. Es
 * la decisión correcta allá y la equivocada acá, donde un id que no existe es
 * un dato mal cargado y queremos enterarnos.
 */
export function clubExists(id: string): boolean {
    return CLUBS.some((club) => club.id === id);
}
