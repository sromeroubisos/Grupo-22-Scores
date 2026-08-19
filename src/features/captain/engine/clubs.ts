// EL CAPITÁN — la escalera del club.
//
// La primera de las dos escaleras, y la que define el final del juego: la
// cancha 1 con tu nombre se hace en un club, no en una selección.
//
// ── La ventana del amateur no cruza la frontera ──
// Es la regla §5 del CLAUDE.md y hay que respetarla acá: a un pibe de 18 en un
// club amateur no lo ficha por mercado abierto un club de otro continente.
// Mientras seas amateur, las ofertas salen de tu país y nada más. Se abre sola
// al profesionalizarte.
//
// ── Y LA VENTANA SE ABRE EN TRES TIEMPOS, NO EN UNO ──
// Porque la frontera no es lo único que un pibe no cruza de golpe:
//
//   · hasta los 18 (`HOMETOWN_MARKET_AGE`) el mercado son los clubes NO
//     PROFESIONALES DE SU PAÍS. Nada más. Ni el M20 ni la selección A ni
//     haberse quedado grande para su sistema abren esa puerta, porque las tres
//     son puertas de NIVEL y el nivel de un pibe de dieciséis no tiene nada que
//     ver con si su próximo club queda en su barrio o en Durban;
//   · hasta los 21 (`REGIONAL_MARKET_AGE`) el mundo se abre, pero tres de cada
//     cuatro ofertas son DE SU PAÍS O SU REGIÓN (`HOME_MARKET_SHARE`). Que se
//     pueda ir a Europa a los diecinueve no quiere decir que sea lo normal;
//   · de ahí en adelante, el mercado es el del rugby profesional y punto.
//
// Las tres son puertas y ninguna es un peso, por lo mismo de siempre: un
// multiplicador de cercanía lo gana el catálogo más grande, y el catálogo más
// grande casi nunca es el tuyo.
//
// Y ojo con el porqué, porque el síntoma engaña: el problema no es el peso de
// la cercanía sino el VOLUMEN del catálogo. Hay cientos de clubes argentinos en
// los escalones bajos y doce sudafricanos; cualquier ponderación que no sea una
// puerta termina mandando al pibe de Durban a la Tercera de la URBA. Cuando un
// mercado se desbalancea por volumen, la respuesta es una puerta y no un
// multiplicador más grande — el multiplicador se queda corto con el próximo
// catálogo nacional que entre.

import type { ClubDef, CompetitionDef } from '../data/catalogs.ts';
import type { CaptainPlayer, CaptainStage } from '../types/player.ts';
import type { LeagueStanding } from '../types/season.ts';
import type { ClubOffer, Contract } from '../types/captain.ts';
import type { Rng } from './random.ts';
import {
    CLUBS,
    affinityCountryOf,
    entryFloorOf,
    getClub,
    clubLeague,
    participatingCompetitions,
    qualifiesFor,
    regionOfCountry,
} from '../data/catalogs.ts';
import { createRng, hashSeed } from './random.ts';
// Solo la aritmética del plazo. `contracts.ts` no importa NADA de este archivo,
// así que la flecha va en una sola dirección y no hay ciclo que resolver.
import { seasonsLeftAfter } from './contracts.ts';

/**
 * Los niveles que cuentan como profesionales de verdad.
 *
 * ── `pro-regional` ESTÁ ADENTRO, Y SU AUSENCIA ERA EL AGUJERO MÁS GRANDE ─────
 * Super Rugby Américas, la MLR, la Nationale francesa, la Currie Cup Premier y
 * la liga rusa son el escalón más bajo del profesionalismo mundial, y entraban a
 * la mesa como PASES AMATEURS de sueldo cero: firmar con los Dogos no te volvía
 * profesional, no te pagaba un peso y no congelaba la Pertenencia. Con la SRA
 * fuera del profesionalismo, el primer contrato de un argentino terminaba siendo
 * la Championship inglesa o el Pro D2 — medido: 23% y 22% de las primeras
 * ofertas profesionales, y la SRA no aparecía nunca.
 *
 * Y estaba escrito al revés en este mismo archivo. `SALARY_BAND` declaraba el
 * tramo de `pro-regional` con el comentario que explica que Super Rugby Américas
 * es el escalón más bajo del profesionalismo mundial: un tramo que ningún
 * llamador podía alcanzar, porque el `salary` se cobra solo si
 * `isProfessionalClub`. Dos respuestas a la misma pregunta y la que corría era la
 * que no estaba escrita (§1.9).
 */
const PRO_LEVELS = new Set(['elite-world', 'elite-pro', 'pro-second', 'pro-regional']);

/**
 * DÓNDE PUEDE ESTAR UN PIBE: en un club que no sea profesional.
 *
 * Era una segunda lista —`START_LEVELS = {amateur, development, semipro}`— y
 * era el complemento EXACTO de `PRO_LEVELS`, o sea el mismo hecho escrito dos
 * veces (§1.9). El día que entre un nivel nuevo al catálogo, las dos listas
 * dicen cosas distintas y la que manda es la que nadie miró.
 *
 * Y «no profesional» es además la única traducción honesta de «club amateur»
 * que este catálogo soporta, porque el escalón de abajo se llama distinto en
 * cada país: 264 clubes argentinos son `amateur`, los diez irlandeses y los doce
 * galeses son `development`, los diez georgianos son `semipro`. Un filtro por
 * `level === 'amateur'` no sería más estricto: sería una regla que en Argentina
 * deja 264 clubes y en Irlanda, Gales, Escocia, Australia, España, Georgia,
 * Portugal, Rumania y Fiyi deja CERO.
 */
function isYouthClub(club: ClubDef): boolean {
    return !isProfessionalClub(club);
}

/**
 * Todos los clubes de un país, ORDENADOS DE FORMA ESTABLE.
 *
 * El `sort` no es decorativo: `CLUBS` es un array construido al cargar el
 * módulo, y elegir sobre él sin ordenar ata la carrera al orden de inserción
 * del catálogo, que es no-determinismo encubierto (CLAUDE.md §1).
 */
function clubsOfCountry(countryCode: string): ClubDef[] {
    return CLUBS
        .filter((c) => c.countryCode === countryCode)
        .sort((a, b) => a.id.localeCompare(b.id));
}

export function isProfessionalClub(club: ClubDef): boolean {
    return PRO_LEVELS.has(club.level);
}

/**
 * ¿ES UN CLUB DE TU SISTEMA? La pregunta se le hace a la AFINIDAD, no al
 * `countryCode` del catálogo.
 *
 * Los tres clubes profesionales de un argentino —Dogos, Pampas, Tarucas— están
 * cargados como `countryCode: 'multi'`, porque Super Rugby Américas no es de un
 * país. Preguntando por el código del catálogo, Argentina no tiene un solo club
 * profesional y el que quiere firmar su primer contrato tiene que emigrar; es lo
 * contrario de lo que pasa en el rugby, donde el pibe de la URBA firma en los
 * Dogos y recién después se va a Francia.
 *
 * `affinityCountryOf` es el dato que contesta esto, declarado club por club en
 * career y con el mismo razonamiento escrito para el italiano de Benetton, el
 * galés de los Ospreys y el neozelandés de los Crusaders.
 *
 * Ojo con dónde NO se usa: la ventana del amateur (`clubsOfCountry`) se sigue
 * midiendo con el `countryCode` del catálogo a propósito. Si una franquicia
 * contara como doméstica ahí, un pibe de 18 la alcanzaría por la ventana normal y
 * se saltearía el piso declarado de la vía, que es justamente la puerta.
 */
export function isHomeSystemClub(club: ClubDef, countryCode: string): boolean {
    return affinityCountryOf(club) === countryCode;
}

/**
 * ¿HAY PROFESIONALISMO EN TU PAÍS? DERIVADO del catálogo y memoizado, nunca
 * escrito (§1.9).
 *
 * Es la condición de la puerta de abajo: al que nació donde SÍ hay contrato
 * profesional —Argentina, Uruguay, Estados Unidos, Francia, Nueva Zelanda— el
 * primero se lo tiene que dar su país. Al que nació donde no lo hay —España,
 * Portugal, Georgia, Canadá— la puerta se abre sola, que es lo único honesto:
 * encerrarlo en un profesionalismo que su catálogo no tiene sería condenarlo a
 * no firmar nunca.
 */
const HOME_PROFESSIONALISM = new Map<string, boolean>();

export function hasHomeProfessionalRugby(countryCode: string): boolean {
    const cached = HOME_PROFESSIONALISM.get(countryCode);
    if (cached !== undefined) return cached;
    const hay = CLUBS.some((c) => isProfessionalClub(c) && isHomeSystemClub(c, countryCode));
    HOME_PROFESSIONALISM.set(countryCode, hay);
    return hay;
}

/**
 * Los clubes que juegan para tu sistema: los de tu país MÁS las franquicias que
 * representan a tu unión. Ordenados de forma estable, por lo de siempre (§1).
 *
 * Es el universo de la ventana cerrada. `clubsOfCountry` no alcanza: dejaba
 * afuera a los tres clubes profesionales que un argentino puede alcanzar sin
 * emigrar, así que la mesa de casa era amateur por construcción.
 */
const HOME_SYSTEM = new Map<string, ClubDef[]>();

function clubsOfHomeSystem(countryCode: string): ClubDef[] {
    const cached = HOME_SYSTEM.get(countryCode);
    if (cached) return cached;
    const propios = CLUBS
        .filter((c) => isHomeSystemClub(c, countryCode))
        .sort((a, b) => a.id.localeCompare(b.id));
    HOME_SYSTEM.set(countryCode, propios);
    return propios;
}

/**
 * EL PISO DE INGRESO DE UNA COMPETICIÓN, memoizado.
 *
 * El cálculo es de career y es caro de verdad: recorre las veintiséis vías y por
 * cada una filtra el catálogo entero de clubes. Allá se llama un puñado de veces
 * por temporada; acá se le pregunta por CADA club candidato de CADA mesa, o sea
 * cientos de miles de veces en una carrera. Sin esta caché la sonda de mercado no
 * terminaba: no es micro-optimización, es la diferencia entre correr y colgarse.
 *
 * El valor es DERIVADO y no se escribe (§1.9): la caché guarda lo que el dato
 * dice, así que una vía que cambie su `minOvr` sigue mandando.
 */
const ENTRY_FLOOR = new Map<string, number | null>();

function entryFloor(competitionId: string): number | null {
    const cached = ENTRY_FLOOR.get(competitionId);
    if (cached !== undefined) return cached;
    const piso = entryFloorOf(competitionId);
    ENTRY_FLOOR.set(competitionId, piso);
    return piso;
}

/**
 * EL TECHO DE TU PROPIO SISTEMA: el rating del club más fuerte de tu país.
 *
 * DERIVADO del catálogo y memoizado, nunca escrito (CLAUDE de captain §1.9).
 * Para Argentina son los ~52 del mejor club del Top 14 de la URBA; para Francia,
 * los 95 de Toulouse. Que el número salga del catálogo es lo que hace que la
 * regla de abajo signifique lo mismo en los treinta países.
 */
const DOMESTIC_CEILING = new Map<string, number>();

function domesticCeilingOf(countryCode: string): number {
    const cached = DOMESTIC_CEILING.get(countryCode);
    if (cached !== undefined) return cached;
    const propios = clubsOfCountry(countryCode);
    // Sin clubes propios no hay sistema que superar: la puerta se abre sola, que
    // es lo correcto para el que nació donde no hay liga.
    const techo = propios.length === 0 ? 0 : Math.max(...propios.map((c) => c.rating));
    DOMESTIC_CEILING.set(countryCode, techo);
    return techo;
}

/**
 * Cuánto hay que pasarle al techo doméstico para que te miren de afuera. Con 4
 * sobre los 52 argentinos, la puerta se abre en 56 — que es, sin que nadie lo
 * haya escrito, el rating del club profesional más chico del catálogo (una
 * franquicia de Super Rugby Américas). El primer paso al exterior es el que
 * corresponde y no Toulouse: de eso ya se encarga `c.rating <= player.ovr + 6`.
 */
export const OUTGROWN_MARGIN = 4;

/**
 * TE QUEDASTE GRANDE PARA TU PROPIO SISTEMA — la tercera puerta del mercado.
 *
 * ── El candado que esto abre ──
 * Había dos puertas para que el mercado dejara de ser doméstico: ser profesional,
 * o estar `scouted`. Y `scouted` se calculaba en `simulate-season.ts` como
 * «estoy en M20, seleccionado A o la mayor», o sea que la ÚNICA forma de que un
 * club de afuera te viera era la escalera de la selección.
 *
 * Se cerraba sobre sí mismo. Un apertura argentino de 77 de media jugando el
 * Torneo Austral —mejor, según el propio catálogo, que cualquier titular de la
 * Championship— tenía el M20 cerrado por edad y el seleccionado A pidiéndole 83.
 * Resultado medido en partida: siete temporadas, cero ofertas de afuera y cero
 * ofertas profesionales, porque los 264 clubes argentinos del catálogo son todos
 * amateurs y el filtro de club profesional colgaba de la misma bandera.
 *
 * Es la lección que Carrera de Rugby ya había aprendido y escrito: EL NIVEL ABRE
 * LAS PUERTAS QUE EL ESCALÓN CIERRA. Un seleccionador y un reclutador de club no
 * miran lo mismo, y atar los dos a una sola bandera hacía que no llegar a la
 * selección te condenara además a no salir nunca del país.
 *
 * Lo que NO hace: regalar. Después de esta puerta siguen corriendo los filtros
 * de siempre —el club tiene que ser mejor que el tuyo y tiene que estar a tu
 * alcance (`rating <= ovr + 6`)—, así que el de 56 recibe ofertas de Super Rugby
 * Américas y el de 77, del Top 14. Que es exactamente el orden del rugby.
 */
export function outgrewDomesticSystem(player: CaptainPlayer): boolean {
    return player.ovr >= domesticCeilingOf(player.countryCode) + OUTGROWN_MARGIN;
}

/** La fuerza del club, que es contra lo que peleás el puesto. */
export function clubRatingOf(clubId: string | null): number {
    if (!clubId) return 45;
    return getClub(clubId).rating;
}

export function clubLabel(clubId: string | null): string {
    if (!clubId) return 'Sin club';
    return getClub(clubId).name;
}

export function competitionLabel(clubId: string | null): string {
    if (!clubId) return '';
    return clubLeague(clubId)?.labelEs ?? '';
}

/**
 * TODOS LOS CLUBES DONDE PUEDE EMPEZAR UN PIBE DE 18, en el orden estable del
 * catálogo. Vacío si su país no tiene ninguno.
 *
 * Es el MISMO conjunto del que sortea `startingClub`, y por eso vive acá y no en
 * la pantalla del registro. El registro ofrece elegir el club: si armara su
 * propia lista habría dos respuestas a la pregunta «dónde se puede empezar», y
 * el día que el sorteo cambie de criterio la pantalla seguiría ofreciendo la
 * lista vieja sin que nada falle (§1.9).
 *
 * El fallback a `propios` no es cosmético: hay países cuyo catálogo entero está
 * por encima de los escalones de abajo —Rusia son ocho clubes profesionales— y
 * ahí la única opción honesta es empezar en los que hay.
 */
export function startingClubPool(countryCode: string): ClubDef[] {
    const propios = clubsOfCountry(countryCode);
    if (propios.length === 0) return [];

    const abajo = youthMarketPool(countryCode);
    return abajo.length > 0 ? abajo : propios;
}

/**
 * EL MERCADO DEL MENOR DE 18: los clubes NO PROFESIONALES DE SU PAÍS, y nada
 * más. Memoizado, que `CLUBS` no cambia.
 *
 * Es el mismo conjunto del que sale el club de arranque —`startingClubPool` lo
 * usa— y por eso vive acá al lado: la respuesta a «dónde puede estar un pibe» no
 * puede depender de si la pregunta la hace el registro o el mercado de junio.
 * Lo que `startingClubPool` agrega es su fallback, y ahí está la única
 * diferencia buscada: al pibe ruso —ocho clubes en el catálogo y los ocho
 * profesionales— hay que darle un club para empezar, pero no ofertas de un
 * profesionalismo que a los diecisiete no le corresponde. Cero ofertas es la
 * respuesta honesta; su club lo sigue teniendo.
 *
 * Se mide con el `countryCode` DEL CATÁLOGO y no con la afinidad, igual que la
 * ventana del amateur y por el mismo motivo (ver `isHomeSystemClub`): si una
 * franquicia contara como doméstica acá, un pibe de diecisiete alcanzaría por
 * esta ventana lo que la vía le declara recién a los 58 de media.
 */
const YOUTH_MARKET = new Map<string, ClubDef[]>();

export function youthMarketPool(countryCode: string): ClubDef[] {
    const cached = YOUTH_MARKET.get(countryCode);
    if (cached) return cached;
    const pool = clubsOfCountry(countryCode).filter(isYouthClub);
    YOUTH_MARKET.set(countryCode, pool);
    return pool;
}

/**
 * Dónde empieza un pibe de 18.
 *
 * En un club de su país y de los escalones de abajo. Nadie debuta en el Top 14:
 * se llega. Si el país no tiene clubes en el catálogo —pasa con las uniones
 * chicas— se devuelve `null` y la carrera arranca sin club, que es honesto.
 */
export function startingClub(countryCode: string, rng: Rng): string | null {
    const pool = startingClubPool(countryCode);
    if (pool.length === 0) return null;

    // Los más chicos son más probables: hay muchos más clubes de barrio que
    // clubes grandes, y ahí es donde empieza casi todo el mundo.
    const mayor = pool.reduce((max, c) => Math.max(max, c.rating), 0);
    return rng.weighted(pool, (c) => mayor - c.rating + 4).id;
}

/**
 * Cuánto tenés que haber jugado para que el título sea TUYO y no solo del club.
 *
 * Antes esto era un factor de probabilidad —`0,45 + share × 0,55`— y ahora es un
 * corte, porque el campeón dejó de ser un dado. Un suplente que entró tres
 * partidos tiene la medalla; el que no se puso la camiseta en todo el año, no.
 */
export const TITLE_MIN_SHARE = 0.25;

/**
 * EL CAMPEÓN DE UNA COMPETENCIA EN UNA TEMPORADA. UNO SOLO.
 *
 * ── Por qué esto no puede ser una probabilidad por club ──
 * Lo era, y por eso el 96,9% de las carreras terminaba con vitrina: cada club
 * tiraba su propio dado, así que VARIOS clubes "ganaban" la misma liga el mismo
 * año y sobre catorce temporadas era casi imposible quedarse sin nada. Es el
 * mismo bicho que tenían los carriles representativos —umbral en vez de cupo— y
 * lleva la misma medicina: hay UNA copa, y si te la llevás vos no se la lleva
 * nadie más.
 *
 * ── La semilla, y por qué es del torneo y no del jugador ──
 * Se deriva de `(competitionId, temporada)` y NO toca el stream del jugador. Dos
 * consecuencias, las dos buscadas: la liga tiene el mismo campeón juegue quien
 * juegue —que es lo que la hace un mundo y no un espejo de tu carrera— y elegir
 * una carta distinta no mueve quién salió campeón en Nueva Zelanda.
 *
 * ── La ponderación respeta el catálogo ──
 * Uniforme sería más simple y estaría mal: Champagnat saldría campeón tan seguido
 * como Newman y el `rating` que el canon cuida dejaría de significar algo. Se
 * conserva la forma de la fórmula vieja —el mejor con peso 0,34, cayendo 0,03 por
 * punto de diferencia, con piso en 0,02— para que la vitrina no cambie de escala
 * al mismo tiempo que cambia de mecanismo.
 */
export function championOf(
    competitionId: string,
    season: number,
    moved: DivisionMap = EMPTY_DIVISIONS,
): string | null {
    return leagueTableOf(competitionId, season, moved)[0] ?? null;
}

/**
 * Los clubes que ESTA CARRERA movió de división: `clubId → competitionId`.
 *
 * Vive en el estado y no en el catálogo, y no es una comodidad: el catálogo es
 * un dato congelado y versionado que comparten todas las partidas abiertas en la
 * misma pestaña. Un club que ascendió en tu carrera no ascendió en la mía.
 */
export type DivisionMap = Readonly<Record<string, string>>;

const EMPTY_DIVISIONS: DivisionMap = {};

/** Cantidad mínima de clubes para que una competición sea un torneo de verdad. */
export const MIN_LEAGUE_FIELD = 2;

/**
 * LA TABLA FINAL DE UNA COMPETICIÓN EN UNA TEMPORADA, de arriba hacia abajo.
 *
 * ── Por qué existe, si el campeón ya se resolvía solo ──
 * Porque hicieron falta DOS cosas más que salen del mismo hecho: quién ascendió
 * o descendió, y en qué puesto terminó tu club —que es la puerta del premio a la
 * mejor temporada local—. Resolverlas con su propio sorteo habría sido una
 * segunda fuente de verdad sobre la misma pregunta, y el día que las dos no
 * coincidieran tendríamos un campeón que descendió (CLAUDE de captain §1.9).
 *
 * ── El campeón NO SE MOVIÓ, y eso es verificable ──
 * La tabla se arma con la MISMA semilla y el MISMO peso que usaba `championOf`,
 * sacando clubes de a uno sin reposición. El primer tiro es idéntico al que se
 * hacía antes, así que el campeón de cada liga y cada año es exactamente el
 * mismo de la 0.10.0. Lo que se agrega es lo que viene después del primero.
 *
 * ── La semilla es DEL TORNEO y no del jugador ──
 * Se deriva de `(competitionId, temporada)` y no toca el stream de la carrera.
 * Dos consecuencias, las dos buscadas: la liga termina igual juegue quien juegue
 * —que es lo que la hace un mundo y no un espejo de tu carrera— y elegir otra
 * carta no mueve quién descendió en Japón.
 */
const TABLE_CACHE = new Map<string, string[]>();

/**
 * La firma de los movimientos que TOCAN esta competición, para la clave de
 * caché.
 *
 * Se recorre `Object.keys()` ORDENADO. Un `Record` de claves dinámicas iterado
 * en orden de inserción es no-determinismo encubierto, y acá se notaría feo: la
 * misma partida daría dos claves distintas según en qué orden ascendieron los
 * clubes, y la tabla saldría de dos cachés distintas.
 *
 * Cuando nadie se movió —que es el caso de todas las ligas en las que no juegue
 * tu club— la firma es vacía y la clave queda en `comp:temporada`, exactamente
 * la de antes.
 */
function movementSignature(competitionId: string, moved: DivisionMap): string {
    const relevantes = Object.keys(moved)
        .sort()
        .filter((clubId) => moved[clubId] === competitionId || CLUB_COMPETITION.get(clubId) === competitionId)
        .map((clubId) => `${clubId}>${moved[clubId]}`);
    return relevantes.length === 0 ? '' : `:${relevantes.join(',')}`;
}

/** Competición de catálogo de cada club. Se arma una vez: `CLUBS` no cambia. */
const CLUB_COMPETITION = new Map(CLUBS.map((c) => [c.id, c.competitionId]));

export function leagueTableOf(
    competitionId: string,
    season: number,
    moved: DivisionMap = EMPTY_DIVISIONS,
): string[] {
    const key = `${competitionId}:${season}${movementSignature(competitionId, moved)}`;
    const cached = TABLE_CACHE.get(key);
    if (cached) return cached;

    // El campo de juego es el del catálogo CON los movimientos de esta carrera
    // aplicados: el que ascendió entra y deja de contar en la división que dejó.
    // Las dos direcciones salen de la misma expresión, así que no puede pasar
    // que un club aparezca en dos tablas del mismo año.
    const rivales = CLUBS
        .filter((c) => (moved[c.id] ?? c.competitionId) === competitionId)
        .sort((a, b) => a.id.localeCompare(b.id));

    if (rivales.length < MIN_LEAGUE_FIELD) {
        TABLE_CACHE.set(key, []);
        return [];
    }

    // La ponderación respeta el catálogo. Uniforme sería más simple y estaría
    // mal: Champagnat saldría campeón tan seguido como Newman y el `rating` que
    // el canon cuida dejaría de significar algo. El mejor pesa 0,34 y cae 0,03
    // por punto de diferencia, con piso en 0,02.
    const mejor = rivales.reduce((max, c) => Math.max(max, c.rating), 0);
    const peso = (c: ClubDef): number => Math.max(0.02, 0.34 - (mejor - c.rating) * 0.03);

    const rng = createRng(hashSeed(`campeon:${competitionId}:${season}`));
    const restantes = [...rivales];
    const tabla: string[] = [];
    while (restantes.length > 0) {
        const elegido = rng.weighted(restantes, peso);
        tabla.push(elegido.id);
        restantes.splice(restantes.indexOf(elegido), 1);
    }

    TABLE_CACHE.set(key, tabla);
    return tabla;
}

// El TIPO vive en `types/season.ts` porque el estado lo guarda. Acá vive quien
// lo CALCULA. Se re-exporta para que el llamador tenga un solo import.
export type { LeagueStanding };

/** Dónde terminó un club, y cuántos eran. */
export function leagueStandingOf(
    clubId: string | null,
    competitionId: string,
    season: number,
    moved: DivisionMap = EMPTY_DIVISIONS,
): LeagueStanding {
    if (!clubId) return { competitionId, position: 0, teams: 0 };
    const tabla = leagueTableOf(competitionId, season, moved);
    const idx = tabla.indexOf(clubId);
    return { competitionId, position: idx >= 0 ? idx + 1 : 0, teams: tabla.length };
}

// ═══════════════════════════════════════════════════════════════════════════
//  LAS COPAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Un club de rugby no juega UN torneo por temporada: juega su liga y las copas a
// las que clasificó por dónde terminó el año anterior. El Capitán lo trataba
// como si jugara uno solo, y esa es media explicación de por qué la vitrina
// salía tacaña —la otra media es que una liga tiene un solo campeón—.
//
// LAS REGLAS NO SE ESCRIBEN ACÁ. Las once copas ya están declaradas en
// `competitions2026.ts` con su clasificación: la Champions Cup se entra por
// posición en las ligas de élite, la Copa del Rey la juegan los de la División
// de Honor, el Torneo del Interior reparte cupos POR UNIÓN, el Nacional de
// Clubes tiene los suyos. `qualifiesFor` sabe todo eso. Acá solo se pregunta.

/** Las copas que tu club disputa esta temporada, además de su liga. */
export function cupsFor(club: ClubDef, lastStanding: LeagueStanding | null): CompetitionDef[] {
    return participatingCompetitions(club, lastStanding).filter((c) => c.kind !== 'league');
}

/**
 * ¿Ganaste esta copa?
 *
 * Misma forma que el título de liga y por el mismo motivo: hay UNA copa y si te
 * la llevás vos no se la lleva nadie más. Lo que cambia es el CAMPO —los
 * clasificados, no los miembros de una división— y la VOLATILIDAD, que sale del
 * dato: una final única es mucho más azarosa que una liga de veintidós fechas, y
 * `competitions2026.ts` ya lo declara copa por copa.
 *
 * El campo se arma con los clubes que clasificaron por su propia posición de
 * referencia. Es una aproximación y conviene decirlo: el motor no simula la
 * temporada de los otros clubes, así que usa la posición que el catálogo hace
 * esperable de cada uno. Lo que NO es aproximado es quién puede entrar, que sale
 * de las reglas reales.
 */
export function cupChampionOf(
    cup: CompetitionDef,
    season: number,
    moved: DivisionMap = EMPTY_DIVISIONS,
): string | null {
    const key = `${cup.id}:${season}${movementSignature(cup.id, moved)}`;
    const cached = CUP_CACHE.get(key);
    if (cached !== undefined) return cached;

    // EL CAMPO SALE DE LAS TABLAS DE ESE AÑO, no de una estimación por rating.
    //
    // La primera versión de esto le asignaba a cada rival la posición que su
    // rating hacía esperable, y estaba mal por la razón de siempre: era una
    // SEGUNDA fuente de verdad sobre una pregunta que `leagueTableOf` ya
    // contesta. El síntoma concreto lo encontró la sonda del Nacional de Clubes,
    // que pide `campeón del URBA Top 14`: con la estimación, la plaza se la
    // llevaba todos los años el club de mayor rating, aunque la tabla de ese año
    // dijera que el campeón fue otro. Un torneo donde entra "el campeón" y el
    // campeón no está.
    //
    // Con la tabla real las dos preguntas se contestan igual, y de yapa la copa
    // se vuelve un torneo de verdad: quién entra cambia año a año, porque quién
    // sale campeón cambia año a año.
    const campo = CLUBS
        .filter((c) => qualifiesFor(cup, movedClub(c, moved), standingInSeason(c, season, moved)))
        .sort((a, b) => a.id.localeCompare(b.id));

    if (campo.length < MIN_LEAGUE_FIELD) {
        CUP_CACHE.set(key, null);
        return null;
    }

    // La volatilidad del dato decide cuánto pesa el rating. Una copa de alta
    // volatilidad aplana la ponderación: por eso la Champions la puede ganar el
    // cuarto y el Top 14 casi siempre lo gana uno de los tres de arriba.
    const mejor = campo.reduce((max, c) => Math.max(max, c.rating), 0);
    const rng = createRng(hashSeed(`copa:${cup.id}:${season}`));
    const ganador = rng.weighted(
        campo,
        (c) => Math.max(0.02, 0.34 - ((mejor - c.rating) * 0.03) / Math.max(1, cup.volatility)),
    ).id;

    CUP_CACHE.set(key, ganador);
    return ganador;
}

const CUP_CACHE = new Map<string, string | null>();

/** El club con la división que le dejó esta carrera, para preguntarle a la copa. */
function movedClub(club: ClubDef, moved: DivisionMap): ClubDef {
    const destino = moved[club.id];
    if (destino === undefined || destino === club.competitionId) return club;
    return { ...club, competitionId: destino };
}

/**
 * Dónde terminó un club cualquiera esa temporada, en la división que juega.
 *
 * Es `leagueStandingOf` con la competición resuelta: se usa para armar el campo
 * de las copas, donde hay que preguntarle la posición a los ochocientos clubes y
 * no solo al tuyo. La tabla está cacheada por (competición, temporada), así que
 * recorrer el catálogo entero cuesta una tabla por división y no una por club.
 */
function standingInSeason(club: ClubDef, season: number, moved: DivisionMap): LeagueStanding {
    return leagueStandingOf(club.id, moved[club.id] ?? club.competitionId, season, moved);
}

/**
 * ¿Salió campeón TU club, y jugaste lo suficiente como para contarlo tuyo?
 *
 * `competitionId` se pide y no se lee del catálogo: si tu club ascendió, la
 * competición que disputó esta temporada es la nueva y no la que dice el
 * catálogo. Leerlo acá adentro dejaría al ascendido peleando el título de la
 * división que dejó.
 */
export function wonCompetition(
    clubId: string | null,
    competitionId: string,
    share: number,
    season: number,
    moved: DivisionMap = EMPTY_DIVISIONS,
): boolean {
    if (!clubId) return false;
    return championOf(competitionId, season, moved) === clubId && share >= TITLE_MIN_SHARE;
}

/**
 * CUÁNTAS OFERTAS PUEDE HABER SOBRE LA MESA. PARÁMETRO LIBRE.
 *
 * Eran DOS, y la razón escrita era «para que la decisión sea una decisión y no un
 * listado». Es un buen principio mal aplicado: lo que convierte un mercado en un
 * listado no es la cantidad de opciones sino que no se distingan entre sí, y acá
 * cada oferta trae club, escudo, división y sueldo — o sea, cuatro ejes por los
 * que compararlas. Con dos, el mercado del jugador que ya la rompió se sentía
 * más chico que el de cualquiera que lea un diario en junio.
 *
 * Cuatro es el tope y casi nunca se llega: hacen falta cuatro clubes que pasen
 * las tres puertas del filtro, y el sorteo de abajo hace que la cuarta sea la
 * menos probable de todas.
 */
export const MAX_OFFERS = 4;

/** Y una más con el representante, que es exactamente lo que se le paga. */
export const AGENT_EXTRA_OFFERS = 1;

/**
 * A QUÉ EDAD EL MERCADO DEJA DE SER UNA NOTICIA Y PASA A SER UN TRÁMITE ANUAL.
 * PARÁMETRO LIBRE.
 *
 * Hasta los veinte el pase es un acontecimiento: al pibe lo tiene el club que lo
 * formó y solo se lo llevan si rompió algo. De los veinte en adelante el rugby
 * de clubes tiene una ventana todos los años y el jugador la atraviesa quiera o
 * no — aunque la atraviese quedándose, que es lo que hace la enorme mayoría.
 *
 * Es la edad y no el escalón a propósito: el que se queda en la Tercera de su
 * club también recibe llamados, y de clubes de su tamaño. Atarlo al nivel
 * dejaría el mercado abierto solo para el que ya la rompió, que es exactamente
 * el candado que `outgrewDomesticSystem` vino a sacar.
 */
export const MARKET_OPEN_AGE = 20;

/**
 * HASTA QUÉ EDAD EL MERCADO ES EL DE TU CIUDAD. PARÁMETRO LIBRE.
 *
 * Mientras seas menor de dieciocho, las únicas ofertas que existen son las de
 * los clubes NO PROFESIONALES DE TU PAÍS. No es un peso ni una preferencia: es
 * una puerta, y se cierra por encima de todo lo demás — el M20 no la abre, la
 * selección A tampoco, y haberte quedado grande para tu propio sistema tampoco.
 *
 * ── Qué se estaba colando ──
 * Estaba medido y era la mitad del mercado: a los dieciséis, el 23,6% de las
 * ofertas venían de otro país y el 19,1% de otro continente. Con el pibe en el
 * M20 —o sea `scouted`, que abre el catálogo entero— la cuenta se iba a 89,2% de
 * afuera. Un chico de dieciséis recibiendo un llamado de un club sudafricano es
 * exactamente lo que el CLAUDE.md raíz §5 prohíbe con todas las letras, y no
 * pasaba por el peso de cercanía sino porque no había ninguna puerta: las tres
 * que había —ser profesional, estar en un carril representativo, superar tu
 * techo doméstico— son puertas de NIVEL, y el nivel de un pibe de dieciséis no
 * tiene nada que ver con si su club está en su barrio o en Durban.
 */
export const HOMETOWN_MARKET_AGE = 18;

/**
 * HASTA QUÉ EDAD LA MESA SIGUE ANCLADA A TU REGIÓN. PARÁMETRO LIBRE.
 *
 * De los dieciocho a los veintiuno el mundo se abre, pero de a poco: el pase de
 * un juvenil es a la liga profesional de su país o de su región —un argentino a
 * la SRA, un uruguayo a Peñarol, un estadounidense a la MLR—, y recién después
 * viene Europa. Que se pueda ir a los diecinueve no quiere decir que sea lo
 * normal, y el mercado tiene que decir cuál de las dos cosas es.
 *
 * La edad es inclusive: la temporada que jugás con veintiuno todavía cuenta.
 */
export const REGIONAL_MARKET_AGE = 21;

/**
 * CUÁNTO DE ESA MESA ES DE CASA. PARÁMETRO LIBRE.
 *
 * Tres de cada cuatro. Y se aplica como CUPO sobre la mesa —cuántas ofertas de
 * afuera entran— y no como peso, por lo de siempre (CLAUDE.md raíz §5): un
 * multiplicador de cercanía lo gana el catálogo más grande, y el catálogo más
 * grande casi nunca es el tuyo.
 */
export const HOME_MARKET_SHARE = 0.75;

/**
 * LA REGIÓN DE UN CLUB: la de su país de afinidad. Memoizada por id.
 *
 * Por afinidad y no por `countryCode` por lo mismo que `isHomeSystemClub`: las
 * franquicias de Super Rugby Américas están cargadas como `multi` y preguntando
 * por el código del catálogo los Dogos no serían de Sudamérica.
 *
 * `null` para los ocho clubes multinacionales que no representan a un país —
 * Moana Pasifika, los Iberians, Lusitanos XV, los Brussels Devils, Delta, los
 * Bohemia Warriors, los Romanian Wolves—: no son de casa para nadie y entran por
 * el cupo del exterior. Inventarles un país para que la cuenta cierre sería
 * escribir un dato que el catálogo no tiene (§1.9), y son ocho sobre ochocientos
 * veintidós.
 */
const CLUB_REGION = new Map<string, string | null>();

function regionOfClub(club: ClubDef): string | null {
    const cached = CLUB_REGION.get(club.id);
    if (cached !== undefined) return cached;
    const region = regionOfCountry(affinityCountryOf(club));
    CLUB_REGION.set(club.id, region);
    return region;
}

/**
 * CUÁNTOS CLUBES HAY SOBRE LA MESA CON EL MERCADO ABIERTO. PARÁMETRO LIBRE.
 *
 * Cinco, y no la escalera de `EXTRA_OFFER_CHANCE`: con el mercado abierto la
 * mesa no se sortea. La pregunta de todos los junios tiene que llegar con las
 * mismas opciones —cinco clubes y el tuyo— para que comparar sea comparar, y no
 * un año leer cuatro sueldos y al siguiente uno solo.
 *
 * Con menos de cinco candidatos alcanzables se ofrece lo que hay: prometer cinco
 * inventando clubes que no existen en el catálogo sería mentir sobre el mundo.
 */
export const OPEN_MARKET_OFFERS = 5;

/**
 * CUÁNTOS CANDIDATOS ENTRAN AL REPECHAJE. PARÁMETRO LIBRE.
 *
 * Tres mesas: suficiente para que el sorteo tenga de dónde elegir y la mesa no
 * sea la misma foto todos los junios, y chico como para que la cercanía siga
 * mandando. En `OPEN_MARKET_OFFERS` exactos el repechaje dejaría de sortear —la
 * mesa sería siempre los mismos cinco— y en el catálogo entero volvería a
 * decidir el volumen, que es de lo que el repechaje se defiende.
 */
export const REPECHAJE_POOL = OPEN_MARKET_OFFERS * 3;

/**
 * CUÁNTO POR ENCIMA TUYO PUEDE ESTAR EL CLUB QUE TE FICHA.
 *
 * Nadie salta de la Tercera de la URBA al Top 14 en una temporada. El
 * representante de primer nivel corre este número —no la cantidad de ofertas
 * solamente— y ahí está su gracia: no te consigue más clubes iguales, te
 * consigue clubes que sin él no te miraban.
 */
export const OFFER_REACH = 6;
export const AGENT_OFFER_REACH = 9;

/**
 * La chance de que aparezca la oferta número 2, 3, 4 y 5. PARÁMETROS LIBRES.
 *
 * Escalera y no un número solo: cuatro clubes peleándote a la vez tiene que ser
 * la temporada que se cuenta, no el default. Con estos valores la mesa media es
 * de dos ofertas, la de tres pasa una de cada cinco veces que se abre el mercado
 * y la de cuatro una de cada veinte.
 */
export const EXTRA_OFFER_CHANCE: readonly number[] = [0.55, 0.35, 0.22, 0.22];

export interface OfferContext {
    player: CaptainPlayer;
    stage: CaptainStage;
    /**
     * EL CONTRATO VIGENTE, ya validado por `currentContract`. `null` si no hay.
     *
     * Llega masticado y no se vuelve a chequear acá: si el club del contrato es
     * el club donde estás y si el papel todavía no venció son preguntas del
     * ESTADO, y `engine/contracts.ts` es donde viven. Este archivo solo pregunta
     * lo suyo —¿te quedan temporadas?— porque de eso depende que haya mesa.
     */
    contract: Contract | null;
    /** Escalón representativo, para saber si te miran de afuera. */
    scouted: boolean;
    /**
     * ¿FIRMASTE UN CONTRATO PROFESIONAL ALGUNA VEZ? Es lo que abre el mercado
     * profesional del resto del mundo (ver la puerta de casa, más abajo).
     *
     * No es `stage === 'professional'`: el que volvió a su club rescindió y hoy
     * es amateur otra vez, pero ya dio el salto y el mundo no se le vuelve a
     * cerrar. Se DERIVA del historial en el llamador y no se guarda: un contador
     * propio sería una segunda fuente de verdad que un `returnHome` puede
     * desincronizar (§1.9).
     */
    everProfessional: boolean;
    season: number;
    /** Tenés representante de primer nivel: una oferta más y clubes más grandes. */
    agent?: boolean;
    /**
     * VOLVISTE A TU CLUB A TERMINAR. Se DERIVA de la marca que dejó la tarjeta
     * (`inFarewell`) y llega masticado, igual que el contrato: acá adentro se
     * pregunta si hay mesa, no se lee el estado.
     */
    farewell?: boolean;
}

/**
 * EL ORDEN DE LA MESA: LA PLATA PRIMERO.
 *
 * Un mercado se lee por la columna de los números antes que por la de los
 * nombres, y con cinco ofertas apiladas el orden ES la información: la primera
 * fila dice cuánto vale hoy tu firma, y de ahí para abajo se lee qué resignás
 * por cada renglón.
 *
 * Los desempates no son decoración. Entre dos ofertas sin sueldo —todo el
 * mercado amateur, que es la mayoría de este juego— la que va arriba es la del
 * club más grande, porque ahí el pago no es plata sino nivel. Y el último
 * desempate es el id: sin él, dos clubes con el mismo rating quedarían en el
 * orden en que los devolvió el sorteo, que es orden de inserción disfrazado.
 */
function byMoneyThenSize(a: ClubOffer, b: ClubOffer): number {
    if (a.salary !== b.salary) return b.salary - a.salary;
    const ratingA = getClub(a.clubId).rating;
    const ratingB = getClub(b.clubId).rating;
    if (ratingA !== ratingB) return ratingB - ratingA;
    return a.clubId.localeCompare(b.clubId);
}

/**
 * Qué clubes te quieren esta temporada.
 *
 * Devuelve como mucho `MAX_OFFERS` (o una más con representante) hasta los
 * veinte, y `OPEN_MARKET_OFFERS` de ahí en adelante. Las reglas duras están
 * arriba: mientras seas amateur la ventana se queda en tu país, hasta los
 * dieciocho se queda además en los clubes no profesionales, y hasta los
 * veintiuno tres de cada cuatro ofertas son de tu país o de tu región.
 *
 * SIEMPRE ORDENADAS POR SUELDO, y el orden viaja en el estado y no en la
 * pantalla: `apply-decision.ts` resuelve el pase por el ÍNDICE de la opción
 * (`firmar-3` es `offers[3]`), así que si la tarjeta ordenara por su cuenta, el
 * jugador firmaría con el club que estaba en ese lugar antes de ordenar. Una
 * sola lista, ordenada una sola vez, en el único lugar que la produce.
 */
export function generateOffers(ctx: OfferContext, rng: Rng): ClubOffer[] {
    const { player, stage } = ctx;
    const actual = player.clubId ? getClub(player.clubId) : null;
    const ratingActual = actual?.rating ?? 40;

    // ── EL CONTRATO VIGENTE CIERRA LA VENTANA, Y VA ANTES QUE TODO ──────────
    //
    // Es la puerta más alta del archivo porque no habla de vos ni de los clubes:
    // habla de un papel firmado. Mientras al contrato le quede una temporada por
    // delante no hay mesa, y no porque nadie te quiera —te quieren igual— sino
    // porque no estás disponible. Es la mitad que le faltaba a un mercado que se
    // abre todos los junios: sin plazos, el jugador renegociaba su vida entera
    // cada temporada y firmar no comprometía a nada.
    //
    // El año en que vence NO cierra nada: ahí la mesa se pone entera y la
    // renovación de tu club entra como una oferta más (`buildMarketEvent`).
    //
    // Y sale por `return []` y no por un filtro: sin ofertas, `marketDue` deja la
    // tarjeta sin armar y la temporada sigue de largo. Un solo camino.
    if (ctx.contract && seasonsLeftAfter(ctx.contract, ctx.season) > 0) return [];

    // ── Y EL QUE VOLVIÓ A TERMINAR NO ESTÁ EN LA MESA DE NADIE ──────────────
    //
    // Va acá arriba por el mismo motivo que el contrato: no habla de nivel ni de
    // clubes, habla de una decisión ya tomada. La tarjeta de la vuelta a casa
    // pregunta si querés terminar donde empezaste, y mientras el mercado siguiera
    // abriéndose todos los junios esa pregunta no significaba nada — volvías, y
    // al año siguiente la pantalla te ofrecía cinco clubes como si no hubiera
    // pasado.
    //
    // También sale por `return []` y no por un filtro: sin ofertas, `marketDue`
    // no arma la tarjeta y la temporada sigue de largo. Un solo camino.
    if (ctx.farewell) return [];

    // ── LA EDAD ABRE LA VENTANA, Y ESO CAMBIA QUIÉN PREGUNTA POR VOS ────────
    // Con el mercado cerrado —los años de formación— nadie te busca si no
    // superaste a tu club: el pase de un pibe es una noticia y pasa cuando se le
    // queda chico el lugar donde está.
    //
    // Abierto, la puerta se corre entera. Ya no se pregunta si CRECISTE respecto
    // de tu club sino si hay clubes A TU ALTURA, que es lo que un dirigente mira
    // en junio. Por eso este `return` vive del lado de adentro del `if` y no
    // arriba de todo: dejarlo afuera mantendría al suplente de un club grande
    // sin una sola oferta justo el año en que más las necesita.
    const abierto = player.age >= MARKET_OPEN_AGE;
    if (!abierto && player.ovr < ratingActual + 3) return [];

    // ── LA PUERTA DE LOS DIECISIETE, Y ESTÁ POR ENCIMA DE TODAS ─────────────
    // Hasta los dieciocho el mercado es el de tu ciudad: los clubes no
    // profesionales de tu país y nada más. Se evalúa ANTES que las tres puertas
    // de nivel porque no es una puerta de nivel — ver `HOMETOWN_MARKET_AGE`—, y
    // por eso las apaga a las tres en vez de sumarse a ellas.
    const pibe = player.age < HOMETOWN_MARKET_AGE;

    // TRES PUERTAS, y la tercera es la que faltaba: el nivel. Ver
    // `outgrewDomesticSystem` — atar el mercado entero a la escalera de la
    // selección dejaba encerrado de por vida al que no llegaba a ella.
    const superaSuSistema = !pibe && outgrewDomesticSystem(player);
    const puedeSalirDelPais = !pibe && (stage === 'professional' || ctx.scouted || superaSuSistema);
    const universo = pibe
        ? youthMarketPool(player.countryCode)
        : puedeSalirDelPais
            ? [...CLUBS].sort((a, b) => a.id.localeCompare(b.id))
            : clubsOfHomeSystem(player.countryCode);

    // POR LA PUERTA DEL NIVEL SE SALE HACIA ARRIBA Y NADA MÁS.
    //
    // Sin esto, quedarte grande para tu sistema te abría el catálogo ENTERO y el
    // reparto lo decidía el volumen: medido, un argentino de 56 pasaba de 0% a
    // 84% de ofertas del exterior de un año al otro, y casi todas de clubes
    // AMATEURS de afuera —la Community Cup sudafricana, la División de Honor B,
    // la liga chilena—. Es el mismo síntoma que el CLAUDE.md raíz §5 documenta al
    // revés (el sudafricano recibiendo ofertas de la Tercera de la URBA) y tiene
    // la misma causa: un catálogo grande le gana a cualquier peso.
    //
    // La respuesta es una puerta y no un multiplicador. Si saliste porque te
    // quedaste grande para tu país, el club de afuera tiene que ofrecerte algo
    // que tu país NO PODÍA: un escalón por encima de tu propio techo doméstico.
    // Un club amateur chileno no es eso. Super Rugby Américas sí.
    const soloPorNivel = superaSuSistema && stage !== 'professional' && !ctx.scouted;
    const pisoDelExterior = domesticCeilingOf(player.countryCode) + OUTGROWN_MARGIN;
    const alcance = ctx.agent ? AGENT_OFFER_REACH : OFFER_REACH;

    // ── EL PRIMER CONTRATO ES DE TU CASA ────────────────────────────────────
    //
    // Un argentino no debuta como profesional en la Championship inglesa: firma
    // en los Dogos, en Pampas o en Tarucas, y de ahí —si la rompe— se va. Un
    // uruguayo firma en Peñarol, un chileno en Selknam, un brasileño en Cobras,
    // un paraguayo en Yacaré: todos en Super Rugby Américas, que es el
    // profesionalismo de Sudamérica. Un estadounidense firma en la MLR. Un
    // neozelandés en el NPC o en una franquicia de Super Rugby.
    //
    // Esta condición vale mientras NUNCA hayas firmado, y se apaga sola con el
    // primer contrato: el que ya es profesional —o el que volvió a su club
    // habiéndolo sido— tiene el mundo abierto, que es exactamente lo que le pasa
    // a un jugador de verdad después del primer salto.
    //
    // Y es una puerta, no un peso (CLAUDE.md raíz §5): con un multiplicador de
    // cercanía la SRA seguiría perdiendo por volumen contra las cuatro ligas
    // profesionales grandes del catálogo, que entre las cuatro tienen cincuenta
    // clubes contra ocho.
    const primerContrato = !ctx.everProfessional && hasHomeProfessionalRugby(player.countryCode);

    /** Los filtros que valen SIEMPRE, tenga la ventana abierta o cerrada. */
    const alcanzable = (c: ClubDef): boolean => {
        if (c.id === player.clubId) return false;
        if (soloPorNivel && c.countryCode !== player.countryCode && c.rating < pisoDelExterior) return false;
        // Alcanzable: nadie salta de la Tercera de la URBA al Top 14 en una
        // temporada.
        if (c.rating > player.ovr + alcance) return false;

        // EL PISO DE INGRESO DE LA COMPETICIÓN, y sale del DATO. Las vías
        // declaran cuánto hay que valer para que una franquicia te saque de tu
        // liga doméstica —58 la SRA, 57 la MLR, 64 la URC, 74 el Super Rugby— y
        // ese requisito es de la puerta, no del camino: alcanzarla por la ventana
        // de mercado sin pagarlo era saltearse el único filtro que la vía tiene.
        const piso = entryFloor(c.competitionId);
        if (piso !== null && player.ovr < piso) return false;

        if (isProfessionalClub(c)) {
            // Tu propio profesionalismo no te pide credenciales: es tu liga.
            if (isHomeSystemClub(c, player.countryCode)) return true;
            // El de afuera, sí — y antes del primero, ni con ellas.
            if (primerContrato) return false;
            // La puerta de siempre para el exterior: ya sos profesional, te
            // vieron, o te quedaste grande para tu sistema. La tercera es la que
            // hace que un país sin clubes profesionales no sea una condena.
            if (stage !== 'professional' && !ctx.scouted && !superaSuSistema) return false;
        }
        return true;
    };

    // ── QUÉ ES «DE CASA»: TU SISTEMA MÁS TU REGIÓN ──────────────────────────
    //
    // Para un argentino, los clubes argentinos, las tres franquicias de la SRA y
    // los uruguayos, chilenos, brasileños y paraguayos. Para un irlandés, las
    // islas británicas. Para un japonés, Asia.
    //
    // La región sale del catálogo de PAÍSES y se le pregunta a los dos lados con
    // la misma función, que es lo que hace que la regla signifique lo mismo en
    // los treinta países (ver `regionOfClub`).
    const mercadoRegional = player.age <= REGIONAL_MARKET_AGE;
    const regionPropia = regionOfCountry(player.countryCode);
    const esDeCasa = (c: ClubDef): boolean => (
        isHomeSystemClub(c, player.countryCode)
        || (regionPropia !== null && regionOfClub(c) === regionPropia)
    );

    // ── QUIÉNES ENTRAN A LA MESA ────────────────────────────────────────────
    // Cerrada, el candidato tiene que ser UN PASO ADELANTE respecto de tu club:
    // es la regla de siempre y la que hace que el pase del pibe signifique algo.
    //
    // Abierta, el eje deja de ser tu club y pasa a ser TU MEDIA. Un suplente de
    // un club rateado muy por encima suyo no tiene ningún "paso adelante"
    // disponible —por definición, su club ya es más grande que todo lo que él
    // alcanza— y es justo el que más necesita que lo llamen. La banda simétrica
    // (`±alcance` alrededor de la media) contesta la pregunta correcta: qué
    // clubes están A TU ALTURA, hacia arriba y hacia abajo.
    //
    // Y ES UNA PUERTA, NO UN PESO (CLAUDE.md raíz §5). Sin el borde de abajo, el
    // catálogo entero entraría al sorteo y el reparto lo decidiría el volumen:
    // hay cientos de clubes argentinos rateados muy por debajo de cualquier
    // jugador formado, y aunque cada uno pese 1 contra 12, cientos de unos le
    // ganan a un puñado de doces. El mismo bicho que ya se pagó dos veces.
    /**
     * LOS CLUBES DE CASA MÁS CERCANOS A TU MEDIA, estén o no dentro de la banda.
     *
     * Existe porque hay regiones que se terminan: los doce clubes uruguayos y los
     * catorce del Pacífico se acaban mucho antes que los ochocientos veintidós
     * del catálogo, y a cierta media no queda uno solo adentro de la banda. Sin
     * esto, el cupo del exterior se queda sin candidatos de casa con qué
     * llenarse, se abre la escotilla de abajo y la mesa se completa afuera:
     * medido, un uruguayo de veinte cerraba en 59,8% de ofertas de casa contra el
     * 75% que la regla promete, y con él Chile, Brasil, Paraguay, Irlanda y Fiyi.
     *
     * Es el MISMO mecanismo del repechaje —aflojar el piso, nunca el techo,
     * ordenando por cercanía a tu media y cortando— aplicado a la otra pregunta.
     * Y el corte es el que hace falta para llenar la parte de casa de la mesa y
     * ni un club más: pasarse sería volver a meter el catálogo entero al sorteo,
     * que es de lo que este archivo se defiende dos veces.
     */
    const repechajeDeCasa = (faltan: number): ClubDef[] => (
        faltan <= 0 ? [] : [...universo.filter((c) => alcanzable(c) && esDeCasa(c))]
            .sort((a, b) => (
                Math.abs(a.rating - player.ovr) - Math.abs(b.rating - player.ovr)
                || a.id.localeCompare(b.id)
            ))
            .slice(0, faltan)
    );

    /** La mesa abierta: los que están a tu altura, y el repechaje si son pocos. */
    const mesaAbierta = (): ClubDef[] => {
        const enBanda = universo.filter((c) => alcanzable(c) && c.rating >= player.ovr - alcance);

        // Hasta los veintiuno la mesa tiene que PODER llenarse de casa. Los que
        // entran por acá no salen sorteados más seguido —el peso los sigue
        // midiendo por cercanía y están lejos—: entran para que el cupo tenga de
        // dónde elegir cuando le toque, que es la temporada en que el pibe se
        // queda en su región en vez de cruzar el océano a los veinte.
        const deCasaEnBanda = mercadoRegional ? enBanda.filter(esDeCasa).length : 0;
        const refuerzo = mercadoRegional
            ? repechajeDeCasa(Math.ceil(OPEN_MARKET_OFFERS * HOME_MARKET_SHARE) - deCasaEnBanda)
                .filter((c) => !enBanda.some((e) => e.id === c.id))
            : [];

        if (enBanda.length >= OPEN_MARKET_OFFERS) return [...enBanda, ...refuerzo];

        // ── EL REPECHAJE, Y POR QUÉ NO PUEDE SER «TODOS LOS DEMÁS» ──────────
        // Existe para el borde de arriba del juego: al que quedó por encima de
        // casi todo el catálogo, la banda le deja tres clubes y no cinco. Ahí se
        // afloja EL PISO —nunca el techo— antes que ofrecerle una mesa coja.
        //
        // Aflojarlo del todo era volver a pisar el mismo rastrillo que este
        // archivo denuncia dos párrafos más arriba. Medido: un argentino de 87
        // que nunca firmó tiene el mercado profesional del exterior cerrado, así
        // que su banda queda vacía y al pozo entran los ~270 clubes de su
        // sistema; el peso `12 − |rating − ovr|` está saturado en 1 para todo lo
        // que está a más de once puntos, o sea que las tres franquicias de la
        // SRA pesaban lo mismo que la Tercera de la URBA y salían sorteadas 3
        // veces cada 270. Resultado: el 72% de las carreras no firmaba un
        // contrato en toda la vida.
        //
        // El piso se afloja HASTA JUNTAR UNA MESA y ni un club más: se ordena por
        // cercanía a tu media y se corta. Es la misma promesa de la banda —los
        // clubes que están a tu altura— dicha con un cupo en vez de con un
        // umbral, que es lo que hay que hacer cuando el umbral se queda sin
        // candidatos (§1.6: el mecanismo tiene que seguir siendo el mismo cuando
        // las constantes se mueven).
        const pozo = [...universo.filter(alcanzable)]
            .sort((a, b) => (
                Math.abs(a.rating - player.ovr) - Math.abs(b.rating - player.ovr)
                // Desempate por id: sin él, dos clubes a la misma distancia
                // quedan en el orden del catálogo, que es orden de inserción
                // disfrazado (CLAUDE.md §1).
                || a.id.localeCompare(b.id)
            ))
            .slice(0, REPECHAJE_POOL);

        // El refuerzo de casa también acá: el pozo se corta en quince por
        // cercanía y una región chica puede quedar entera del otro lado del
        // corte, que es justo el caso para el que se escribió el refuerzo.
        return [...pozo, ...refuerzo.filter((c) => !pozo.some((e) => e.id === c.id))];
    };

    const candidatos = abierto
        ? mesaAbierta()
        : universo.filter((c) => alcanzable(c) && c.rating > ratingActual);

    if (candidatos.length === 0) return [];

    // ── CUÁNTAS ─────────────────────────────────────────────────────────────
    // Cerrada, EN ESCALERA. La primera no se sortea: si alguien te quiere, te
    // quiere. Cada una de más se tira aparte y con menos chance que la anterior,
    // y se corta en la primera que falla — así la mesa de cuatro clubes existe
    // pero es la temporada que se cuenta, no la de todos los años.
    //
    // Abierta, NO SE SORTEA NINGUNA: son cinco (seis con representante, que es
    // exactamente lo que se le paga) o todas las que haya. La escalera y la mesa
    // fija afirman dos mundos distintos y por eso conviven en vez de mezclarse:
    // antes de los veinte una oferta es una noticia, después es el calendario.
    const tope = Math.min(
        candidatos.length,
        abierto
            ? OPEN_MARKET_OFFERS + (ctx.agent ? AGENT_EXTRA_OFFERS : 0)
            : MAX_OFFERS + (ctx.agent ? AGENT_EXTRA_OFFERS : 0),
    );
    let cuantas = tope;
    if (!abierto) {
        cuantas = 1;
        for (let i = 1; i < tope; i += 1) {
            if (!rng.chance(EXTRA_OFFER_CHANCE[Math.min(i - 1, EXTRA_OFFER_CHANCE.length - 1)])) break;
            cuantas += 1;
        }
    }

    // ── EL CUPO DEL EXTERIOR: HASTA LOS 21, TRES DE CADA CUATRO SON DE CASA ──
    //
    // Que se pueda ir a Europa a los diecinueve no quiere decir que sea lo
    // normal, y la mesa tiene que decir cuál de las dos cosas es. Medido antes
    // de esto: a los diecinueve y con el M20 encima, el 71% de las ofertas
    // venían de otra región.
    //
    // ES UN CUPO Y NO UN PESO, por lo de siempre (CLAUDE.md raíz §5): el que
    // pondera cercanía lo gana el catálogo más grande, y el catálogo más grande
    // casi nunca es el tuyo.
    const cupoExterior = mercadoRegional
        ? Math.floor(cuantas * (1 - HOME_MARKET_SHARE))
        : cuantas;

    const elegidos: ClubDef[] = [];
    let deAfuera = 0;
    for (let i = 0; i < cuantas; i += 1) {
        const libres = candidatos.filter((c) => !elegidos.some((e) => e.id === c.id));
        if (libres.length === 0) break;

        // EL CUPO ES UN PISO DE CASA, NO UNA PROHIBICIÓN DE AFUERA. Con el cupo
        // lleno la mesa se completa con clubes de tu región, y si no queda
        // ninguno se completa con lo que haya: al que a los veinte ya está
        // treinta puntos por encima del techo de su país no se le puede ofrecer
        // un club regional que no existe, y devolverle una mesa de una sola
        // oferta rompería la promesa de la pantalla para castigarlo por ser
        // bueno. La mentira sería peor que la excepción.
        const deCasa = libres.filter(esDeCasa);
        const restantes = deAfuera >= cupoExterior && deCasa.length > 0 ? deCasa : libres;

        // Los clubes que mejor te calzan son los más probables: los que están
        // apenas por encima tuyo.
        const elegido = rng.weighted(restantes, (c) => Math.max(1, 12 - Math.abs(c.rating - player.ovr)));
        elegidos.push(elegido);
        if (!esDeCasa(elegido)) deAfuera += 1;
    }

    return elegidos
        .map((club): ClubOffer => ({
            clubId: club.id,
            kind: isProfessionalClub(club) ? 'professional' : 'amateur',
            salary: isProfessionalClub(club) ? salaryFor(club, player.ovr) : 0,
            years: contractYearsFor(club, player),
            season: ctx.season,
        }))
        .sort(byMoneyThenSize);
}

/**
 * LA BANDA DE CADA NIVEL: DE LO QUE COBRA EL ÚLTIMO DEL PLANTEL A LO QUE COBRA
 * LA FIGURA.
 *
 * Hasta la 0.24.0 la banda decía otra cosa —«lo que paga este nivel»— y ese
 * cambio de sentido es la mitad del arreglo del sueldo. Con el piso de la élite
 * en 420 mil, CUALQUIERA que recibiera una oferta de un club de élite cobraba
 * como mínimo 420 mil, jugara de titular o mirara desde el banco: el eje del
 * jugador no tenía dónde moverse porque la banda no le dejaba lugar.
 *
 * Los extremos son los reales y el ancho también: Super Rugby Américas paga
 * entre 14 y 18 mil al año —el escalón más bajo del profesionalismo mundial— y
 * el Top 14 promedia 223 mil para un wing y 343 mil para un apertura, con el
 * último del plantel en sesenta mil y la figura en ochocientos. Entre el 15º y
 * el 1º de un mismo club hay un factor diez, que es MÁS de lo que hay entre dos
 * clubes de la misma liga: por eso el eje que manda tiene que ser el jugador.
 */
const SALARY_BAND: Record<string, [number, number]> = {
    'elite-world': [60_000, 900_000],
    'elite-pro': [40_000, 380_000],
    'pro-second': [18_000, 130_000],
    'pro-regional': [8_000, 34_000],
    semipro: [2_000, 12_000],
    development: [0, 0],
    amateur: [0, 0],
};

/**
 * Los dos extremos de la escala. ESPEJO de la escala de `playingTimeOf`: ahí el
 * tiempo de juego sale de `ovr − clubRating`, o sea que la media de un jugador y
 * el rating de un club YA se miden con la misma vara. Este par la nombra para
 * poder pesar los dos ejes en la misma cuenta.
 *
 * Si la escala de ratings del catálogo se corre, esto se corre con ella.
 */
const SCALE_FLOOR = 55;
const SCALE_TOP = 90;

/**
 * CUÁNTO DE TU SUELDO LO DECIDE TU MEDIA Y CUÁNTO EL CLUB. PARÁMETRO LIBRE.
 *
 * El resto —0,30— es del club, y no es decoración: es lo que sostiene el canje
 * del mercado. Las ofertas que te llegan están todas a ±9 de tu media (lo fija
 * `alcanzable` por arriba y la banda de `mesaAbierta` por abajo), así que el
 * término del club se mueve como mucho ±0,26 de tramo y el sueldo sigue
 * ordenando la mesa por tamaño de club, igual que siempre. Lo que cambia es
 * DÓNDE está la mesa entera: la de un jugador de 74 y la de uno de 92 dejan de
 * ser la misma.
 */
const PLAYER_SHARE = 0.7;

/**
 * LA CONVEXIDAD. PARÁMETRO LIBRE, y es el que hace el trabajo.
 *
 * Sin ella la cuenta es una recta y el mejor jugador del mundo cobra un 18% más
 * que uno de media 74 —medido: 763 mil contra 900 mil—, que es exactamente lo
 * que este arreglo vino a corregir. La plata del deporte no es lineal en la
 * calidad: el escalón de abajo cobra una fracción, y el salto de los últimos
 * puntos de media es el más caro de todos.
 */
const SALARY_CURVE = 2.2;

/** Dónde cae un valor en la escala común, de 0 a 1. */
function tramo(valor: number): number {
    return Math.min(1, Math.max(0, (valor - SCALE_FLOOR) / (SCALE_TOP - SCALE_FLOOR)));
}

/**
 * El sueldo anual, en dólares, que ESE club le paga a ESE jugador.
 *
 * ── EL SUELDO ES DEL JUGADOR, NO DEL CLUB ───────────────────────────────────
 * Recibía solo el club, y por eso el mismo contrato de Exeter valía 804 mil para
 * un jugador de 74 y 804 mil para uno de 92. Medido sobre la mesa abierta, el
 * techo de lo que te ofrecían se movía de 763 mil a 900 mil entre esas dos
 * medias, que es media carrera de diferencia. La pantalla decía «tu lugar ahí:
 * Rotación» arriba de un sueldo de figura, y las dos cosas eran ciertas al mismo
 * tiempo porque no salían del mismo lado.
 *
 * Los dos ejes viven en la misma escala (`tramo`) y se pesan una sola vez:
 *
 *   · TU MEDIA decide en qué renglón del plantel entrás. Es el que manda.
 *   · EL RATING DEL CLUB corre la banda entera hacia arriba o hacia abajo, que
 *     es lo que hace que la figura de Toulouse cobre más que la de Bayona.
 *
 * Y el eje del club se mide contra la escala GLOBAL y no contra tu media a
 * propósito: si midiera la distancia entre vos y el club, el club donde serías
 * titular pagaría más que el que te sienta, y el canje del mercado —plata contra
 * camiseta— se daría vuelta. Acá se conserva: dentro de una mesa el que mejor
 * paga sigue siendo el más grande.
 */
export function salaryFor(club: ClubDef, ovr: number): number {
    const [lo, hi] = SALARY_BAND[club.level] ?? [0, 0];
    if (hi === 0) return 0;
    const t = PLAYER_SHARE * tramo(ovr) + (1 - PLAYER_SHARE) * tramo(club.rating);
    return Math.round((lo + (hi - lo) * t ** SALARY_CURVE) / 500) * 500;
}

/**
 * LO QUE TU PROPIO CLUB TE PONE SOBRE LA MESA CUANDO SE TE VENCE EL PAPEL.
 *
 * Es una `ClubOffer` como cualquier otra y ESO ES EL PUNTO: la renovación se
 * calcula con las mismas dos funciones que las ofertas de afuera, así que
 * comparar «lo que me dan acá» con «lo que me dan allá» es comparar dos números
 * producidos por la misma cuenta. Escrita aparte, la renovación sería una tercera
 * escala de sueldos que nadie mantendría al día.
 *
 * No entra en `state.offers` —el pase se resuelve por índice y tu club no es un
 * pase— sino que la tarjeta la dibuja como la última opción, que es donde el
 * jugador ya la busca (`buildMarketEvent`). Y por eso es una función pura del
 * estado: se llama al dibujar la tarjeta y de nuevo al aplicar la decisión, y las
 * dos veces tiene que dar lo mismo.
 *
 * `null` cuando tu club no es profesional: ahí no hay contrato que renovar.
 */
export function renewalFor(
    player: { age: number; ovr: number },
    clubId: string,
    season: number,
): ClubOffer | null {
    const club = getClub(clubId);
    if (!isProfessionalClub(club)) return null;
    return {
        clubId,
        kind: 'professional',
        salary: salaryFor(club, player.ovr),
        years: contractYearsFor(club, player),
        season,
    };
}

/**
 * HASTA QUÉ EDAD TE ATAN LARGO, Y DESDE CUÁL TE RENUEVAN AÑO A AÑO.
 * PARÁMETROS LIBRES, y son las dos puntas de la misma curva real.
 *
 * El rugby profesional firma corto comparado con el fútbol: dos y tres años es lo
 * normal, y los dos extremos tienen explicación de oficio. Al pibe lo atan porque
 * el club le pagó la formación y no quiere que se lo lleven gratis el año que
 * explota; al veterano lo renuevan de a un año porque nadie firma tres años de un
 * cuerpo de treinta y cinco.
 */
export const YOUNG_CONTRACT_AGE = 23;
export const VETERAN_CONTRACT_AGE = 31;

/**
 * CUÁNTO POR ENCIMA DEL CLUB HAY QUE ESTAR PARA QUE TE ATEN UN AÑO MÁS.
 * PARÁMETRO LIBRE.
 *
 * Es el mismo eje con el que `playingTimeOf` reparte los minutos —`ovr` contra
 * `rating`— y por eso se lee solo: al que va a ser titular lo aseguran, al que va
 * al banco lo firman por lo que dure la prueba.
 */
export const STAR_CONTRACT_MARGIN = 4;

/** Los dos bordes del plazo. Nadie firma por cero años ni por cuatro. */
export const CONTRACT_YEARS_MIN = 1;
export const CONTRACT_YEARS_MAX = 3;

/**
 * POR CUÁNTOS AÑOS TE FIRMA ESE CLUB.
 *
 * ── ES UNA TABLA Y NO UN DADO, Y ESO ES UNA DECISIÓN ────────────────────────
 * La renovación se dibuja en la tarjeta de mercado, y esa tarjeta se reconstruye
 * en CADA render (`buildMarketEvent`): no puede consumir azar sin que el plazo
 * cambie entre dos pinceladas de la misma pantalla. O el plazo es una función
 * pura del estado, o hay que guardarlo en el estado; una función pura es más
 * barata y no agrega un campo que se pueda desincronizar (§1.9).
 *
 * Que sea predecible además está bien acá: un dirigente no sortea el plazo, lo
 * decide con dos datos que el jugador también ve —la edad y qué lugar ocupa en
 * ese plantel—. El azar del mercado ya vive donde tiene que vivir, que es en QUÉ
 * clubes te llaman.
 *
 * ── EL ÁLGEBRA, ANTES DE ESCRIBIRLO (§1.6) ─────────────────────────────────
 * ¿Se reduce a una constante? No: las dos entradas se mueven solas a lo largo de
 * la carrera y en direcciones distintas. La edad sube siempre, así que el plazo
 * base BAJA de 3 a 2 y a 1; el margen contra el club sube cuando crecés y baja
 * cuando el club asciende o cuando te vas a uno más grande. El mismo jugador
 * firma tres años a los 22 en su club y uno solo a los 33 en el mismo club.
 *
 * Cero en las amateurs: ahí no hay papel que firmar, y ese cero es lo que hace
 * que la ventana se les siga abriendo todos los junios.
 */
export function contractYearsFor(club: ClubDef, player: { age: number; ovr: number }): number {
    if (!isProfessionalClub(club)) return 0;

    const base = player.age <= YOUNG_CONTRACT_AGE
        ? 3
        : player.age <= VETERAN_CONTRACT_AGE ? 2 : CONTRACT_YEARS_MIN;

    // Al veterano no se le suma: pasada esa edad el club firma por lo que ve, y
    // lo que ve es un año. Sin este `&&`, una figura de 36 se llevaría dos años
    // justo cuando el rugby de verdad deja de darlos.
    const figura = player.ovr >= club.rating + STAR_CONTRACT_MARGIN
        && player.age <= VETERAN_CONTRACT_AGE;

    return Math.min(CONTRACT_YEARS_MAX, base + (figura ? 1 : 0));
}
