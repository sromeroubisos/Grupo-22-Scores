import type { Player, PlayerRole } from '../types/player.ts';
import type { ClubOffer } from '../types/career.ts';
import type { ClubDef } from '../data/clubs.ts';
import { CLUBS, getClub, clubLeague } from '../data/clubs.ts';
import { computeOvr } from './scoring.ts';
import { resolveContract } from './contracts.ts';
import {
    MIGRATION_ROUTES, affinityCountryOf, classifyMovement, entryFloorOf, homeCountryOf, marketRung, migrationRegionOf, movementBetween,
    pathwayTargets, pathwaysFrom, scorePathwayCandidate,
} from './market-routes.ts';
import type { Rng } from './random.ts';
import { playerRoleAt } from './squad-role.ts';
import { maxSigningAgeOf } from '../data/competition-levels2026.ts';

// Acá vivía `roleAtClub(effectiveOvr, clubPrestige)`, con dos umbrales sobre el
// PRESTIGIO. Era la tercera forma distinta de contestar la misma pregunta —el
// creador de jugador, la oferta y la temporada usaban cada uno su versión— y
// además medía el eje equivocado: el prestigio es lo que hace que un club te
// llame, no lo que hay que superar para jugar.
//
// Ahora hay una sola: `engine/squad-role.ts`, sobre `valor − rating del club`.

/** Edad a partir de la cual el mercado empieza a mirar para atrás. */
export const VETERAN_AGE = 33;

/**
 * Cuánto puede sumar la PROMESA por encima del rendimiento actual. Acotado a
 * propósito: sin tope, un juvenil con techo alto valía tanto como un
 * profesional hecho y entraba directo a una franquicia. La proyección abre
 * puertas, no las reemplaza.
 */
export const MAX_UPSIDE_BONUS = 7;

/**
 * Valor de mercado del jugador, en la MISMA escala que `club.rating` (0..100).
 * Mezcla lo que rinde HOY con lo que promete: un pibe con techo alto vale algo
 * más que su OVR actual, y un veterano algo menos que el suyo.
 */
export function marketValue(player: Player, effectiveOvr: number): number {
    const ovr = computeOvr(player.attributes, player.position);
    const upside = Math.min(MAX_UPSIDE_BONUS, Math.max(0, player.potential - ovr) * 0.35);
    const youth = player.age <= 23 ? 1 : player.age <= 27 ? 0.5 : 0.15;
    const recentInjuries = player.injuries.filter((i) => i.season >= player.seasonsPlayed - 2);
    const injuryDrag = recentInjuries.reduce((sum, i) => sum + (i.severity === 'grave' ? 3 : i.severity === 'moderada' ? 1.2 : 0.4), 0);
    // El descuento por edad tiene TOPE. Sin tope, a los 38 el veterano perdía
    // 11 puntos de valor y no calificaba ni para el club más chico: el mercado
    // se apagaba justo en los años en que la decisión de seguir o retirarse
    // tiene que tener enfrente clubes concretos. Con tope en 6, el veterano no
    // compite arriba (para eso está la ventana de escalones) pero sigue siendo
    // fichable abajo, que es la historia real del final de carrera.
    const agingDrag = Math.min(6, Math.max(0, player.age - 31) * 1.6);
    const starterBonus = player.role === 'starter' ? 2 : player.role === 'rotation' ? 0.5 : -2;

    return effectiveOvr + upside * youth + player.dynamics.fame * 0.1 + starterBonus - injuryDrag - agingDrag;
}

/**
 * Salto EXCEPCIONAL (±2 escalones). Regla marcada y acotada: hay que venir de
 * una temporada sobresaliente, estar en edad de progresar y tener techo. Es la
 * única puerta para saltar más de un escalón.
 */
export function qualifiesForExceptionalJump(player: Player, effectiveOvr: number): boolean {
    const ovr = computeOvr(player.attributes, player.position);
    return (
        player.dynamics.form >= 78 &&
        player.role === 'starter' &&
        player.age <= 27 &&
        player.potential - ovr >= 8 &&
        effectiveOvr >= getClub(player.club).rating
    );
}

/**
 * REGLA MARCADA — regreso del veterano. A partir de los 33 el jugador puede
 * volver a un club de su país sin importar cuántos escalones baje: es el final
 * de carrera típico (de una liga europea al club de toda la vida). Solo hacia
 * abajo, y solo al país de su nacionalidad.
 */
export function isVeteranHomecoming(player: Player, club: ClubDef): boolean {
    if (player.age < VETERAN_AGE) return false;
    const home = homeCountryOf(player.nationality);
    if (home === null || club.countryCode !== home) return false;
    return marketRung(club) <= marketRung(getClub(player.club));
}

/**
 * EL ESCALÓN SIGUIENTE DE TU PROPIA ESCALERA SIEMPRE ES ALCANZABLE.
 *
 * Encontrado jugando: un japonés con 70 de media pasó SEIS temporadas en Fukuoka
 * Sanix Blues sin recibir una sola oferta para salir de las ligas regionales.
 * No era mala suerte, era imposible por construcción.
 *
 * La escalera japonesa tiene un POZO: el regional está en el escalón 1 y la D3 en
 * el 4. La ventana de mercado se mueve ±1, así que entre los dos no hay puente ni
 * con 70 de media ni con 90. Y no es cosa de Japón — medido, siete países tienen el
 * mismo agujero entre la base de su pirámide y el escalón de arriba:
 *
 *   nz      1 → 6   (Heartland → NPC, salto de cinco)
 *   gb-eng  2 → 6   (National 1 → Championship, salto de cuatro)
 *   fr      2 → 5   ·  za 1 → 4  ·  jp 1 → 4  ·  it 1 → 4  ·  us 2 → 5
 *
 * O sea que el que arrancaba en el sótano de cualquiera de esas pirámides quedaba
 * atrapado de por vida, y su OVR se quedaba quieto una década en un entorno que no
 * lo hacía crecer. (Es, muy probablemente, de dónde salía buena parte de las
 * carreras planas que vigila `progression-ceiling.test.ts`.)
 *
 * La regla no toca las bandas del catálogo —no es trabajo del mercado recalibrarlas—
 * sino que garantiza la CONEXIÓN: el peldaño inmediatamente superior de tu propio
 * sistema entra en la ventana, esté a uno o a cinco de distancia. Y no regala nada:
 * `clubIsInterested` sigue decidiendo, así que el de 40 no recibe la oferta de la
 * D3 y el de 70 sí — que es exactamente lo que pasa en el deporte.
 */
/** Los países que cuentan como propios: el del club actual y el de origen. */
function anchorCountries(currentClubId: string, nationality: string): Set<string> {
    const anchors = new Set<string>();
    const current = affinityCountryOf(getClub(currentClubId));
    if (current !== null) anchors.add(current);
    const home = homeCountryOf(nationality);
    if (home) anchors.add(home);
    return anchors;
}

/**
 * EL PELDAÑO DEL PUENTE: el escalón inmediatamente superior de la escalera propia,
 * esté a uno o a cinco de distancia.
 *
 * Va EXPORTADO a propósito. El puente es la CUARTA razón legítima por la que un
 * jugador salta más de un escalón —las otras tres son la vía profesional, la
 * excepción de rendimiento y el regreso del veterano— y los tests que auditan los
 * saltos tienen que poder preguntarla en vez de reimplementarla. Un test que
 * recalcula la regla por su cuenta deja de vigilarla y pasa a duplicarla.
 */
export function ladderBridgeRung(currentClubId: string, nationality: string): number | null {
    const current = marketRung(getClub(currentClubId));
    const anchors = anchorCountries(currentClubId, nationality);
    if (anchors.size === 0) return null;

    let next: number | null = null;
    for (const club of CLUBS) {
        const country = affinityCountryOf(club);
        if (country === null || !anchors.has(country)) continue;
        const rung = marketRung(club);
        if (rung <= current) continue;
        if (next === null || rung < next) next = rung;
    }
    return next;
}

/** ¿Ese pase cruzó el pozo de la escalera propia por el puente? */
export function isLadderBridge(currentClubId: string, targetClubId: string, nationality: string): boolean {
    const bridge = ladderBridgeRung(currentClubId, nationality);
    return bridge !== null && marketRung(getClub(targetClubId)) === bridge;
}

function nextRungUpAtHome(player: Player): number | null {
    return ladderBridgeRung(player.club, player.nationality);
}

/**
 * La ventana de escalones, y CUÁL de ellos es el puente sobre el pozo.
 *
 * Se devuelven juntos porque el puente se cobra distinto: cruzar tres escalones no
 * puede perdonar lo mismo que subir uno (ver `generateOffers`).
 */
function windowRungs(player: Player, effectiveOvr: number): { rungs: Set<number>; bridge: number | null } {
    const current = marketRung(getClub(player.club));
    const veteran = player.age >= VETERAN_AGE;
    // El veterano ya no sube, pero su ventana hacia abajo se ensancha: a esa
    // edad se aceptan ligas bastante menores con tal de seguir jugando.
    const up = veteran ? 0 : qualifiesForExceptionalJump(player, effectiveOvr) ? 2 : 1;
    const down = veteran ? 3 : up;

    const rungs = new Set<number>();
    for (let delta = -down; delta <= up; delta++) {
        if (current + delta >= 0) rungs.add(current + delta);
    }

    // El puente sobre el pozo de la escalera propia. Sólo hacia arriba y sólo el
    // peldaño INMEDIATO: sigue sin haber saltos de dos divisiones por la ventana.
    let bridge: number | null = null;
    if (!veteran) {
        const next = nextRungUpAtHome(player);
        if (next !== null && !rungs.has(next)) {
            rungs.add(next);
            bridge = next;
        }
    }

    return { rungs, bridge };
}

/** Escalones a los que el jugador puede acceder esta ventana de mercado. */
export function allowedRungs(player: Player, effectiveOvr: number): number[] {
    return [...windowRungs(player, effectiveOvr).rungs];
}

/**
 * A CADA PAÍS LE CORRESPONDEN, PRIMARIAMENTE, LAS OFERTAS DE SU PAÍS.
 *
 * Esto pesa PAÍSES, no clubes, y ahí está toda la diferencia. Pesar clubes NO
 * controla el reparto: la probabilidad de que salga un país es su peso por la
 * CANTIDAD de clubes que tiene en el escalón, así que lo termina decidiendo el
 * tamaño de cada catálogo. Con 200 clubes argentinos en los escalones bajos, un
 * japonés de 70 en las ligas regionales recibía el 14% de ofertas japonesas y el
 * resto de España, Chile, Brasil, Inglaterra y las divisiones argentinas — sin que
 * ninguna constante estuviera mal calibrada.
 *
 * El sorteo es en DOS ETAPAS (ver `generateOffers`): primero el país con esta
 * afinidad, después el club dentro de ese país por su mérito. Con el país adelante
 * el reparto es cierto por construcción y no por calibración: el catálogo puede
 * triplicarse y no se mueve.
 *
 * Los dos ANCLAS pesan alto: el país donde el jugador juega hoy y el suyo de
 * origen. Un argentino en Toulouse es conocido en los dos lados, y las dos cosas
 * que le pueden pasar son seguir en Francia o volver a casa; que lo llame Japón es
 * posible, no habitual.
 *
 * DOS COSAS QUE HAY QUE SABER ANTES DE TOCAR ESTOS NÚMEROS:
 *
 *   · El valor NO mueve la meseta. Medido a 4, 5, 6, 8, 12 y 14 de afinidad, la
 *     proporción de carreras con seis temporadas o más de OVR quieto se queda en
 *     37% — y con el peso por club de antes daba 42%. O sea que la meseta no la
 *     causa la preferencia local: la causaba el POZO de las escaleras, que se tapó
 *     aparte (ver `nextRungUpAtHome`).
 *   · Arriba de 8 el reparto casi no se mueve, porque manda la composición del
 *     pool. Si un día hace falta más, el lugar donde mirar es el pool, no este
 *     número.
 */
// 14, y la escala cambió de sentido respecto del 2,2 anterior porque ahora pesa
// PAÍSES y no clubes. Medido con todo junto (puente de escalera incluido), ofertas
// del país propio para un PROFESIONAL: za 64%, ar 64%, fr 75%, nz 70%, jp 74%,
// fj 64%, gl 64%. Para el amateur, 72-100% — lo que falta son las VÍAS declaradas,
// o sea los convenios.
const AFFINITY_HOME = 14;
const AFFINITY_HOME_VETERAN = 24;
const AFFINITY_ROUTE_BASE = 1.1;
const AFFINITY_ROUTE_STEP = 0.14;
const AFFINITY_SAME_REGION = 0.8;
const AFFINITY_ELSEWHERE = 0.3;

/**
 * Afinidad del jugador con un PAÍS. `region` es la del catálogo, para el caso del
 * vecino: un destino de la misma región que su club pesa más que uno del otro lado
 * del mundo, aunque no esté en su ruta migratoria.
 */
function countryAffinity(player: Player, countryCode: string, region: string): number {
    const anchors = anchorCountries(player.club, player.nationality);
    if (anchors.has(countryCode)) return player.age >= VETERAN_AGE ? AFFINITY_HOME_VETERAN : AFFINITY_HOME;

    const route = MIGRATION_ROUTES[migrationRegionOf(player.nationality)];
    const match = route.find((r) => r.countryCode === countryCode);
    if (match) return AFFINITY_ROUTE_BASE + match.weight * AFFINITY_ROUTE_STEP;

    if (region === getClub(player.club).region) return AFFINITY_SAME_REGION;
    return AFFINITY_ELSEWHERE;
}

/**
 * ¿El club se interesa por el jugador? Compara su valor con lo que el club
 * exige. `tolerance` la relaja: una vía profesional reconocida abre un poco la
 * puerta, pero NO la regala — sin nivel no hay oferta aunque exista la ruta.
 */
/**
 * CUÁNTO PERDONA UN CLUB, según el club. Es lo que hace que el destino de una
 * carrera siga al nivel del jugador.
 *
 * La tolerancia era 8 PUNTOS FIJOS para todos, y ahí se escapaba el juego:
 * medido sobre 900 carreras, el que picaba por debajo de 70 llegaba a un club de
 * élite el 23,1% de las veces y el que picaba en 90+ sólo el 66,7%. O sea que el
 * escalón al que llegabas casi no dependía de lo que valías. Con ±1 escalón por
 * ventana y ocho puntos perdonados en cada salto, un jugador mediocre subía toda
 * la escalera de a un peldaño sin que nadie le dijera que no.
 *
 * El `demand` de abajo ya modela que el club rico es más exigente. La tolerancia
 * plana lo desarmaba: sumaba una manga ancha idéntica arriba y abajo.
 *
 * Ahora la manga se cierra con el nivel. Un club de élite puede elegir entre
 * todos los que quieran ir, así que no tiene ningún motivo para arriesgar; un
 * club de segunda apuesta al que todavía no llegó, porque es lo único que puede
 * fichar. Eso también es lo que abre la banda de abajo: el que no da el nivel
 * deja de subir y se queda haciendo carrera ahí, que es un final legítimo.
 */
const TOLERANCE_SCALE_ELITE = 0.25;
const TOLERANCE_SCALE_REGIONAL = 0.55;
const ELITE_RUNG = 8;
const REGIONAL_RUNG = 5;

function toleranceScaleFor(club: ClubDef): number {
    const rung = marketRung(club);
    if (rung >= ELITE_RUNG) return TOLERANCE_SCALE_ELITE;
    if (rung >= REGIONAL_RUNG) return TOLERANCE_SCALE_REGIONAL;
    return 1;
}

/**
 * ¿Ese club puede FICHAR a alguien de esa edad?
 *
 * Hoy sólo lo limitan las competiciones universitarias (`maxSigningAgeOf`). Va
 * como puerta aparte de `clubIsInterested` a propósito: eso contesta "¿doy el
 * nivel?" y esto contesta "¿me pueden fichar?". Son dos preguntas y mezclarlas en
 * una tolerancia haría que un jugador de 26 con nivel de sobra entrara igual.
 */
export function clubCanSign(club: ClubDef, age: number): boolean {
    const max = maxSigningAgeOf(club.competitionId);
    return max === null || age <= max;
}

export function clubIsInterested(club: ClubDef, value: number, tolerance = 8): boolean {
    // Cuanto más rico el club, más exigente: puede elegir.
    const demand = club.rating + (club.marketBand - 3) * 1.5;
    return value >= demand - tolerance * toleranceScaleFor(club);
}

/**
 * LA VENTANA DEL QUE TODAVÍA NO SE PROFESIONALIZÓ NO CRUZA LA FRONTERA.
 *
 * A un sudafricano de 18 en un club amateur le llegaban ofertas de Paraná Rowing
 * Club, Tucumán Lawn Tennis y Berazategui. Medido sobre 60 carreras `za`, sus
 * primeras ofertas venían 46 de Argentina, 28 de Francia, 12 de Inglaterra y 11
 * de Sudáfrica: el mercado de un pibe sudafricano era, sobre todo, argentino.
 *
 * NO era un peso mal calibrado, era VOLUMEN. `proximityWeight` multiplica ×2,2 el
 * país propio y ×0,5 el resto, pero el catálogo argentino tiene ~200 clubes en los
 * escalones bajos: doscientos candidatos a 0,5 le ganan a doce a 2,2 sin que
 * ninguna constante esté mal. Subir el multiplicador sería tapar eso con un número
 * más grande, y el día que entre otro catálogo nacional vuelve a pasar.
 *
 * Lo que no existe en el rugby es la puerta, no el peso: a un amateur de 18 no lo
 * ficha por mercado abierto un club de otro continente. Llega allá por una VÍA
 * DECLARADA —un convenio, una academia, una franquicia que lo scoutea— y esas vías
 * ya son un concepto del motor (`TRANSFER_PATHWAYS`), con su nivel mínimo y su
 * tolerancia. Así que la ventana se queda en su sistema y el extranjero se alcanza
 * por donde se alcanza en la realidad.
 *
 * Se abre sola cuando el jugador se profesionaliza: de semiprofesional para
 * arriba, o cuando gradúa de la academia al plantel senior, la ventana vuelve a ser
 * mundial. Un semipro sudafricano SÍ puede firmar en Japón.
 */
function windowStaysHome(player: Player): boolean {
    if (player.squadTrack === 'development') return true;
    return player.employment === 'amateur' || player.employment === 'amateur-compensated';
}

/**
 * Los países de los que la ventana puede traer ofertas: el sistema en el que el
 * jugador está HOY, y el suyo de origen.
 *
 * Se ancla en el país del CLUB ACTUAL y no en la nacionalidad porque el que ya
 * emigró vive en otro sistema: un argentino en la academia de Toulouse tiene que
 * recibir ofertas francesas, no argentinas. Y se agrega el de origen porque volver
 * a casa nunca deja de ser una opción legítima.
 *
 * `multi` no es un país: las franquicias regionales (SRA, Super Rugby) no anclan
 * ningún sistema doméstico, así que no entran como ancla — se alcanzan por vía.
 */
function homeSystems(player: Player, current: ClubDef): Set<string> {
    const anchors = new Set<string>();
    if (current.countryCode !== 'multi') anchors.add(current.countryCode);
    const home = homeCountryOf(player.nationality);
    if (home) anchors.add(home);
    return anchors;
}

/** Por qué un club entró al pool. Sirve para auditar los saltos grandes. */
export type OfferOrigin = 'window' | 'pathway' | 'homecoming';

interface Candidate {
    club: ClubDef;
    via: OfferOrigin;
    pathwayId: string | null;
    weight: number;
}

/**
 * Genera hasta DOS ofertas de club (la UI muestra "quedarte" + estas dos).
 * El pool tiene tres puertas, y cada oferta declara por cuál entró:
 *   · `window`     — ventana habitual de ±1 escalón (±2 con excepción marcada);
 *   · `pathway`    — vía profesional normal entre sistemas (NPC → Super Rugby);
 *   · `homecoming` — regreso del veterano a su país.
 * Nunca incluye el club actual ni una copa: el pool son clubes de liga.
 * Determinístico: mismo (jugador, catálogo, estado de RNG) ⇒ mismas ofertas.
 */
export function generateOffers(player: Player, effectiveOvr: number, rng: Rng): ClubOffer[] {
    const current = getClub(player.club);
    const value = marketValue(player, effectiveOvr);
    const { rungs, bridge } = windowRungs(player, effectiveOvr);
    const veteran = player.age >= VETERAN_AGE;

    const baseWeight = (club: ClubDef): number => {
        const direction = movementBetween(current, club);
        // Bajar de categoría solo es atractivo si el jugador ya no rinde arriba.
        const directionWeight = direction === 'up' ? 1.4 : direction === 'lateral' ? 1 : veteran ? 1.6 : 0.45;
        const ambition = 1 + Math.max(0, club.prestige - current.prestige) * 0.01;
        // Sin cercanía: eso se resuelve un nivel más arriba, al elegir el país.
        return Math.max(0.01, directionWeight * ambition * (1 + club.marketBand * 0.08));
    };

    const candidates = new Map<string, Candidate>();
    const add = (club: ClubDef, via: OfferOrigin, pathwayId: string | null, boost: number) => {
        if (club.id === current.id) return;
        if (candidates.has(club.id)) return;
        candidates.set(club.id, { club, via, pathwayId, weight: baseWeight(club) * boost });
    };

    // 1) Vías profesionales normales. Van primero: si un club es alcanzable por
    //    pathway, ese es el motivo real del pase, no la ventana.
    //    El interés se evalúa de forma RELATIVA a la liga de origen: una
    //    franquicia SRA detecta al destacado de su sistema doméstico sin exigir
    //    el valor absoluto de un titular de Dogos.
    const candidacy = pathwayCandidacy(player, current, effectiveOvr);
    // La MEDIA del jugador, cruda. Es el número que ve en la cabecera, y es el que
    // decide si la vía se abre: `effectiveOvr` traería adentro la forma y la
    // fatiga, y una franquicia no deja de ir a buscar a un 59 porque venga de una
    // temporada con el tobillo tocado. `marketValue` tampoco sirve para esta
    // puerta — a un pibe de 18 le suma hasta 12 puntos de proyección.
    const rawOvr = computeOvr(player.attributes, player.position);
    for (const pathway of pathwaysFrom(current)) {
        // El nivel abre la vía. Reemplazó al guardarraíl de banda del club de
        // origen, que era un proxy de lo mismo y se equivocaba en los dos extremos.
        // Ver `minOvr` en market-routes.ts.
        if (pathway.minOvr !== undefined && rawOvr < pathway.minOvr) continue;
        for (const club of pathwayTargets(pathway)) {
            if (!clubCanSign(club, player.age)) continue;
            if (!pathwayAccepts(club, value, candidacy, pathway.demandTolerance)) continue;
            add(club, 'pathway', pathway.id, 1 + pathway.weight * 0.25);
        }
    }

    // 2) Ventana habitual de escalón. Mientras el jugador no se profesionalizó, la
    //    ventana se queda en su sistema (ver `windowStaysHome`): el extranjero se
    //    alcanza por vía declarada, que es la puerta que existe en la realidad.
    //
    //    Si no hubiera ancla resoluble no se filtra nada: un mercado ancho es un
    //    problema de balance y uno vacío es una carrera trabada.
    const anchors = homeSystems(player, current);
    const domesticOnly = anchors.size > 0 && windowStaysHome(player);
    // El techo de la ventana normal. La apertura por nivel sólo mira POR ENCIMA
    // de esto: hacia abajo ya llega la ventana de siempre, y abrir para abajo por
    // nivel metía en el pool a los 600 clubes del catálogo que un 90 se puede
    // pagar —incluida la academia chilena— para después descartarlos por peso.
    const techoVentana = Math.max(...rungs);
    for (const club of CLUBS) {
        const clubRung = marketRung(club);
        // EL NIVEL ABRE LAS PUERTAS QUE EL ESCALÓN CIERRA.
        //
        // Encontrado jugando: un brasileño de 24 con 90 de media, titular de su
        // selección, recibía dos ofertas — Pro D2 y otra franquicia sudamericana.
        // Ni un club del Top 14, la Premiership o el URC. Y no era mala suerte:
        // era imposible por construcción.
        //
        // La ventana se mueve ±1 escalón y la única puerta para saltar más
        // (`qualifiesForExceptionalJump`) exige `potential - ovr >= 8`. O sea que
        // pedía TENER MARGEN PARA CRECER — y el que ya llegó a su techo no lo
        // tiene. La regla estaba al revés: cuanto mejor sos, más encerrado estás.
        //
        // Así que la ventana de escalones deja de ser una pared y pasa a ser lo
        // que siempre debió ser: el camino por defecto. Si tu valor deportivo le
        // alcanza a un club SIN TOLERANCIA —no "casi", le alcanza— ese club te
        // mira, esté a uno o a cinco escalones. No regala nada: el de 60 sigue sin
        // recibir ofertas del Top 14 porque no le alcanza, y el de 90 las recibe
        // porque le sobra.
        //
        // SÓLO HACIA ARRIBA, y no es una optimización disfrazada de regla: hacia
        // abajo la ventana normal ya llega, así que abrir por nivel para abajo no
        // agregaba ningún destino nuevo — sólo metía en el pool cada club del
        // mundo que el jugador se puede pagar, para descartarlo después por peso.
        // Ese pool inflado es lo que hacía lento el mercado, y era además el que
        // le ofrecía una academia chilena a un titular de Toulon.
        if (!rungs.has(clubRung) && !(clubRung > techoVentana && clubIsInterested(club, value, 0))) continue;
        if (domesticOnly && !anchors.has(club.countryCode)) continue;
        // CRUZAR EL POZO NO SE PERDONA. La manga ancha de ocho puntos existe para
        // el salto de UN escalón —un club de segunda apuesta al que todavía no
        // llegó— y aplicada al puente dejaba pasar al de 42 igual que al de 70:
        // medido, los dos recibían la misma cantidad de ofertas de la D3 japonesa.
        // En el puente el club no arriesga: o das el nivel, o no.
        if (!clubCanSign(club, player.age)) continue;
        if (!clubIsInterested(club, value, clubRung === bridge ? 0 : undefined)) continue;
        // Y el PISO DE INGRESO de la competición destino, si lo tiene declarado: el
        // `minOvr` de una vía no es un peaje de esa puerta, es cuánto hay que valer
        // para entrar ahí. La ventana lo esquivaba cuando el destino le quedaba a un
        // escalón (ver `entryFloorOf`).
        if (club.competitionId !== current.competitionId) {
            const floor = entryFloorOf(club.competitionId);
            if (floor !== null && rawOvr < floor) continue;
        }
        add(club, 'window', null, 1);
    }

    // 3) Regreso del veterano.
    for (const club of CLUBS) {
        if (!isVeteranHomecoming(player, club)) continue;
        if (!clubCanSign(club, player.age)) continue;
        if (!clubIsInterested(club, value)) continue;
        add(club, 'homecoming', null, 1.5);
    }

    const pool = [...candidates.values()].sort((a, b) => a.club.id.localeCompare(b.club.id));
    if (pool.length === 0) return [];

    const chosen: Candidate[] = [];
    const remaining = [...pool];

    // UNA RANURA RESERVADA PARA LA VÍA, cuando hay vía.
    //
    // El código ya decía —arriba, en el paso 1— que si un club es alcanzable por
    // pathway "ese es el motivo real del pase, no la ventana". El PESO no lo
    // reflejaba: la vía llevaba un boost de 1,75× y competía en el mismo sorteo
    // contra la ventana entera, que para un argentino son ~100 clubes de peso ~1.
    // Medido: a un sudamericano de OVR 59 le llegaba una oferta de la SRA en el
    // 2,6% de los casos. No estaba cerrada la puerta, estaba diluida.
    //
    // Con la ranura reservada, la vía compite contra las otras vías y no contra el
    // mercado entero, y la segunda ranura sigue siendo del pool completo: nunca se
    // pierde la oferta de la ventana, que es la que sostiene el mercado normal.
    const byPathway = remaining.filter((c) => c.via === 'pathway');
    if (byPathway.length > 0) {
        const first = rng.weighted(byPathway, (c) => c.weight);
        chosen.push(first);
        remaining.splice(remaining.indexOf(first), 1);
    }

    // EL SORTEO ES EN DOS ETAPAS: primero el país, después el club.
    //
    // Es lo que hace que "a cada país le correspondan primariamente las ofertas de
    // su país" sea cierto POR CONSTRUCCIÓN. Sorteando clubes sueltos, la
    // probabilidad de un país es su peso por su CANTIDAD de clubes, así que el
    // reparto lo decide el tamaño de cada catálogo: un japonés de 70 en las ligas
    // regionales recibía el 14% de ofertas japonesas y el resto de España, Chile,
    // Brasil, Inglaterra y las doscientas divisiones argentinas. Con el país
    // adelante, el catálogo puede triplicarse y el reparto no se mueve.
    //
    // Adentro del país compite el mérito del club (dirección, ambición, mercado),
    // que es la comparación que de verdad significa algo: club contra club.
    while (chosen.length < 2 && remaining.length > 0) {
        // Se agrupa por el país de AFINIDAD: si no, los Stormers y los Crusaders
        // caerían en la misma bolsa `multi` y para un sudafricano su propia
        // franquicia valdría lo mismo que una neozelandesa.
        const porPais = new Map<string, Candidate[]>();
        for (const candidate of remaining) {
            const clave = affinityCountryOf(candidate.club) ?? 'multi';
            const lista = porPais.get(clave) ?? [];
            lista.push(candidate);
            porPais.set(clave, lista);
        }

        // Orden estable antes de sortear: el orden de inserción de un Map es una
        // fuente de no-determinismo encubierta (CLAUDE.md §1).
        const paises = [...porPais.keys()].sort();
        const pais = rng.weighted(paises, (code) => countryAffinity(player, code, porPais.get(code)![0].club.region));
        const candidate = rng.weighted(porPais.get(pais)!, (c) => c.weight);
        chosen.push(candidate);
        remaining.splice(remaining.indexOf(candidate), 1);
    }

    return chosen
        .map(({ club, via, pathwayId }) => {
            // La MISMA resta que va a decidir los partidos cuando el jugador
            // llegue: valor DEPORTIVO contra el rating del club. Si la oferta
            // anunciara un rol calculado de otra forma, la tarjeta mentiría justo
            // en el dato que hace que la decisión exista.
            //
            // `value` (de mercado) es lo que decide QUÉ clubes aparecen en esta
            // lista; `effectiveOvr` es lo que decide si vas a jugar cuando llegues.
            // Son dos preguntas y acá se contesta la segunda.
            const role = playerRoleAt(effectiveOvr, club.rating);
            const contract = resolveContract({
                club, age: player.age, value, potential: player.potential,
                ovr: computeOvr(player.attributes, player.position), role,
            });
            return {
                club: club.id,
                league: club.league,
                tier: clubLeague(club.id).tier,
                role,
                prestige: club.prestige,
                wageIndex: Math.round(Math.min(100, club.prestige * rng.float(0.75, 1.1))),
                via,
                pathwayId,
                // El vínculo que ofrece ESE club, según su economía y lo que el
                // jugador vale. Un club amateur nunca ofrece full-time.
                offeredEmployment: contract.employment,
                offeredTrack: contract.track,
                // Naturaleza del movimiento (pase amateur, contrato pro, etc.):
                // decide el TEXTO. Un club amateur no "firma", hace un pase.
                movementKind: classifyMovement(current, club, contract.employment, contract.track),
            };
        })
        .sort((a, b) => b.prestige - a.prestige);
}

/** Puntaje de candidatura del jugador a una vía, RELATIVO a su liga de origen. */
function pathwayCandidacy(player: Player, current: ClubDef, effectiveOvr: number): number {
    const recentInjuries = player.injuries.filter((i) => i.season >= player.seasonsPlayed - 1);
    return scorePathwayCandidate({
        // Rinde por encima de su propio club (no del destino).
        relativeClubPerformance: effectiveOvr - current.rating,
        relativeCompetitionPerformance: marketRung(current),
        starterStatus: player.role === 'starter',
        form: player.dynamics.form,
        age: player.age,
        potential: player.potential,
        injuryAvailability: Math.max(0.2, 1 - recentInjuries.length * 0.25),
    });
}

/**
 * ¿La vía acepta al jugador? Combina el criterio absoluto (holgado por la
 * tolerancia) con la candidatura RELATIVA: un destacado de su sistema entra
 * aunque su valor absoluto no llegue al del destino. No garantiza la oferta:
 * sin rendimiento, forma o disponibilidad, no alcanza.
 */
function pathwayAccepts(club: ClubDef, value: number, candidacy: number, tolerance: number): boolean {
    if (clubIsInterested(club, value, tolerance)) return true;
    // Puerta relativa: un buen candidato de su liga entra aunque el valor
    // absoluto quede corto, pero solo hasta cierto punto por debajo del destino.
    return candidacy >= 1.2 && value >= club.rating - (tolerance + 14);
}

/**
 * Aplica una oferta al jugador: club, liga, rol Y VÍNCULO.
 *
 * EL VÍNCULO FALTABA, y era el agujero detrás de "un amateur no puede pasar a
 * profesional aunque lo fiche una franquicia". `moveToClub` cambiaba de club y
 * dejaba `employment` como estaba; lo recalculaba `renewContract` al cierre de la
 * temporada siguiente, y ése sube DE A UN ESCALÓN POR VEZ. Un amateur que firmaba
 * con Dogos XV —franquicia plenamente profesional— pasaba a compensado, después a
 * semipro y recién a la tercera temporada a profesional, mientras la tarjeta que
 * había aceptado decía "contrato profesional".
 *
 * El escalón de a uno es correcto para QUEDARSE (es lo que `renewContract`
 * documenta: la evolución dentro del mismo club). Un PASE es otra cosa: el club
 * nuevo ofrece lo que ofrece, y `offeredEmployment` ya lo tiene calculado con
 * `resolveContract` contra ese club. Aplicarlo es lo mismo que ya se hacía con
 * `role`: la oferta anuncia con la misma cuenta que después se cumple.
 *
 * Vale en las dos direcciones, y es deliberado: bajar de una franquicia a un club
 * amateur también resuelve el vínculo de cero, porque un club amateur no puede
 * sostener un contrato profesional por más que el jugador viniera con uno.
 *
 * No hace falta una excepción sudamericana: la regla general cubre Dogos, Pampas,
 * Peñarol y Selknam, y de paso la MLR y las franquicias del Pacífico.
 */
export function moveToClub(player: Player, offer: ClubOffer): void {
    const club = getClub(offer.club);
    player.club = club.id;
    player.league = club.league;
    player.role = offer.role;
    player.employment = offer.offeredEmployment;
    player.squadTrack = offer.offeredTrack;
}
