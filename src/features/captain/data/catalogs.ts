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

// ── Competiciones de club: el grafo, las copas y quién clasifica ────────────
//
// Es CATÁLOGO DE COMPETICIONES y no lógica: dice quién sube adónde y con cuántas
// plazas, y qué copa juega cada club según dónde terminó. Igual que la lista de
// clubes dice quién juega dónde. Por eso entra por esta puerta y no se copia —
// con dos copias, el día que Francia cambie las plazas del Top 14 solo se
// enteraría uno de los dos juegos.
//
// `PARALLEL_COMPETITIONS` viaja al lado porque sin él el grafo se lee mal: son
// los torneos que NO son primera y segunda de nada (Super Rugby, URC, NPC, SRA,
// el TDI) y en los que salir último no significa descender.
//
// `CUPS` y `participatingCompetitions` son las ONCE COPAS con sus reglas de
// clasificación ya escritas —Champions Cup, Challenge Cup, Copa del Rey, Coppa
// Italia, Torneo del Interior A y B, Nacional de Clubes…—. El Capitán las
// ignoraba y por eso un club disputaba UN torneo por temporada, que es la mitad
// de la explicación de por qué la vitrina salía tacaña.
export type { CompetitionDef, MovementRule } from '../../career/data/clubs2026/competitions2026.ts';
export {
    ALL_COMPETITIONS,
    CUPS,
    MOVEMENTS,
    PARALLEL_COMPETITIONS,
    getCompetition,
    participatingCompetitions,
    qualifiesFor,
} from '../../career/data/clubs2026/competitions2026.ts';

// ── EL CALENDARIO DE SELECCIONES ────────────────────────────────────────────
//
// Veinte competiciones, ciento treinta y una uniones, diecinueve trofeos —
// Seis Naciones, Rugby Championship, Nations Championship, Mundial, los tres
// escalones de Rugby Europe, Pacific Nations, Sudamérica A y B, África, Asia,
// Oceanía, RAN, y las ventanas de julio y noviembre.
//
// ── Esto ESTUVO duplicado, y duró un commit ────────────────────────────────
// El Capitán tuvo brevemente su propio `data/international.ts`: seis torneos
// escritos a mano, con sus participantes copiados y su propia versión. Estaba
// mal por donde se lo mire y conviene dejarlo anotado porque es la trampa más
// fácil de este proyecto:
//
//   · el CLAUDE.md raíz dice, con todas las letras, que el tope de caps por
//     temporada sale de este archivo Y DE NINGÚN OTRO. Una segunda lista de
//     torneos es una segunda respuesta a esa pregunta.
//   · la versión duplicada tenía SEIS torneos contra veinte, ningún trofeo, y
//     un Mundial con fase inventada en vez del año real.
//   · a los tres meses las dos listas dicen cosas distintas y nadie sabe cuál
//     es la buena.
//
// La regla es la misma que con los clubes: el rugby es catálogo, y el catálogo
// tiene un dueño.
export type {
    InternationalCompetition,
    InternationalCompetitionKind,
    InternationalSeason,
    Trophy,
    TrophyTier,
} from '../../career/data/international-calendar.ts';
export {
    INTERNATIONAL_CALENDAR_VERSION,
    INTERNATIONAL_COMPETITIONS,
    NATIONS_CHAMPIONSHIP_ID,
    WORLD_CUP_ID,
    competitionsFor,
    getInternationalCompetition,
    internationalMatches,
    internationalSeason,
    isEditionSeason,
    // El año PREVIO al Mundial, que es cuando la vara de la convocatoria afloja:
    // las listas son de 33 y entra gente que otro año no entraría. Sale de acá y
    // no de una cuenta en el motor por la razón de siempre — el calendario es el
    // único que sabe de fechas.
    isPreWorldCupSeason,
    isWorldCupYear,
    playsEndOfYearTour,
    seasonYear,
    UNIONS_WITH_FIXTURE,
} from '../../career/data/international-calendar.ts';

// ── LAS VÍAS DE CIRCULACIÓN DE JUGADORES ────────────────────────────────────
//
// De acá salen dos preguntas que este juego no sabía contestar, y las dos son
// sobre lo mismo: DE QUÉ PAÍS ES UNA FRANQUICIA REGIONAL.
//
// El catálogo marca a los Dogos, a Peñarol y a Selknam con `countryCode:
// 'multi'` —juegan Super Rugby Américas, que no es de un país— y con eso un
// argentino de la URBA no tenía NINGÚN club profesional "de su país": su
// profesionalismo doméstico vive en una liga internacional. Lo mismo le pasa al
// italiano con Benetton, al galés con los Ospreys y al neozelandés con los
// Crusaders.
//
// `affinityCountryOf` ya lo contesta en career, declarado club por club
// (`SRA_BY_COUNTRY`, las franquicias neozelandesas y australianas, las provincias
// irlandesas, las regiones galesas, Benetton y Zebre) y con la razón escrita al
// lado: para un italiano firmar en Benetton es el paso profesional más doméstico
// que tiene, no emigrar.
//
// `entryFloorOf` es la otra mitad: cuánto hay que valer para que una franquicia
// te saque de tu liga doméstica. Sale del `minOvr` declarado de cada vía y no de
// un número nuestro — si mañana la SRA sube su piso, El Capitán se entera solo.
//
// ── Por qué un archivo de `engine/` entra por la puerta de los catálogos ──
// Porque `TRANSFER_PATHWAYS` es un grafo DECLARATIVO —quién ficha a quién, con
// qué piso— tan catálogo como la lista de clubes; que viva en `engine/` es dónde
// lo puso career, no lo que es. Lo que no entra por acá es el resto de ese motor.
export {
    TRANSFER_RULES_VERSION,
    affinityCountryOf,
    entryFloorOf,
} from '../../career/engine/market-routes.ts';

// ── Países ──────────────────────────────────────────────────────────────────
export type { SelectableCountry } from '../../career/data/countries.generated.ts';
export {
    SELECTABLE_COUNTRIES,
    FREQUENT_COUNTRY_CODES,
} from '../../career/data/countries.generated.ts';

// La REGIÓN de un país, declarada país por país en el catálogo de naciones. De
// acá sale «tu país o tu región» del mercado del pibe (`engine/clubs.ts`): para
// un argentino son Uruguay, Chile, Brasil y Paraguay; para un irlandés, las
// islas británicas; para un francés, la Europa continental.
//
// Se pide al catálogo de PAÍSES y no al campo `region` del club, aunque el club
// tenga uno: ese campo agrupa por COMPETICIÓN —los dieciséis del URC comparten
// `europe-sa`, sudafricanos e irlandeses juntos— y preguntándole a él, Leinster
// sería extranjero para un irlandés. La geografía la sabe el país.
export { regionOfCountry } from '../../career/data/nations.ts';

// ── Uniones ─────────────────────────────────────────────────────────────────
//
// `SELECTABLE_NATIONALITIES` y no `SELECTABLE_COUNTRIES` es lo que se le ofrece
// al jugador: el catálogo entero menos las uniones suspendidas. Y `searchCountries`
// busca sobre esa misma lista — un selector cuya grilla y cuyo buscador no
// coinciden es un selector roto.
export {
    NATIONS_VERSION,
    RUGBY_UNIONS,
    SELECTABLE_NATIONALITIES,
    findCountry,
    flagPathOf,
    hasUnion,
    isSelectableCountry,
    normalizeSearch,
    searchCountries,
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
    // Fechas de fase regular DE LA COMPETICIÓN. Existe para que nadie vuelva a
    // escribir "una temporada son 22 fechas": el Top 14 son 26 y una liga chica
    // catorce, y de ese número salen los partidos, el desgaste y las lesiones.
    regularSeasonMatchesOf,
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
