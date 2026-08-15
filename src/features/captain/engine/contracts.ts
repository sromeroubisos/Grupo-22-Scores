// EL CAPITÁN — el momento bisagra.
//
// Firmar el primer contrato profesional es la mejor decisión del juego, y no
// porque sea difícil elegir entre plata y gloria: es difícil porque la plata
// apenas alcanza. La mayoría de los jugadores de Super Rugby Américas gana el
// equivalente a catorce o dieciocho mil euros al año — el escalón más bajo del
// profesionalismo mundial. No estás eligiendo entre gloria y billetera: estás
// eligiendo entre dos formas de gloria por una plata que no cambia tu vida.
//
// ── Lo que cuesta de verdad ──
// El reglamento URBA establece que quien suscribe contrato profesional no puede
// jugar ninguna competencia organizada por la URBA hasta acreditar la
// rescisión. O sea que no es que te vas: te vas y NO PODÉS VOLVER mientras dure
// el contrato. Por eso el golpe de Pertenencia es el doble que el de un pase
// cualquiera en el fútbol, y por eso la cuenta del club se congela: los años de
// profesional no construyen la cancha con tu nombre.
//
// ── Y volver está premiado ──
// No es licencia poética. El régimen de pases de la URBA exceptúa del cupo a
// los jugadores que regresan a su club de origen: el sistema real premia el
// retorno, y el juego lo copia.

import type { CaptainState, Contract } from '../types/captain.ts';
import { BELONGING_PRO_PENALTY } from '../types/currencies.ts';
import { applyBelonging, setFrozen } from './belonging.ts';
import { isBetrayedClub } from './betrayal.ts';
import { getClub } from '../data/catalogs.ts';

/** Lo que se le suma a la Pertenencia del club de origen cuando volvés. */
export const BELONGING_RETURN_BONUS = 10;

// ═══════════════════════════════════════════════════════════════════════════
//  LA VIGENCIA
//
//  Cuatro preguntas sobre el mismo contrato, y ninguna se guarda: las cuatro se
//  calculan desde `since` y `years`. Una fecha de vencimiento escrita al lado de
//  los años que la producen es una derivada congelada, y esas mienten con fecha
//  (§1.9) — la primera vez que alguien extienda un contrato sin tocar el otro
//  campo, el juego tendría dos respuestas a «¿hasta cuándo?».
// ═══════════════════════════════════════════════════════════════════════════

/** La ÚLTIMA temporada que el contrato cubre. */
export function lastSeasonOf(contract: Contract): number {
    return contract.since + contract.years - 1;
}

/**
 * Cuántas temporadas te quedan DESPUÉS de la que se está jugando.
 *
 * Cero es «esta es la última», que es cuando se abre la renovación. Se cuenta
 * así y no incluyendo la actual porque la pregunta que el jugador se hace en
 * junio es cuántos años más tiene asegurados, no cuántos firmó.
 */
export function seasonsLeftAfter(contract: Contract, season: number): number {
    return Math.max(0, lastSeasonOf(contract) - season);
}

/**
 * El contrato que corre HOY, o `null`.
 *
 * Se verifica el club además de la vigencia, y no es paranoia: `player.clubId` es
 * lo que decide dónde jugás y el contrato es una promesa sobre ese club. Si
 * alguna vez se separaran —un pase que se olvide de firmar—, quedarse con el
 * contrato viejo haría que el jugador cobrara el sueldo de un club en el que ya
 * no está y que el mercado se le siguiera cerrando por un papel que no existe.
 * Devolver `null` lo deja libre, que es el error barato de los dos.
 */
export function currentContract(state: CaptainState): Contract | null {
    const c = state.contract;
    if (!c) return null;
    if (c.clubId !== state.player.clubId) return null;
    if (state.season > lastSeasonOf(c)) return null;
    return c;
}

/**
 * ¿Estás atado? O sea: ¿el contrato cubre también la temporada QUE VIENE?
 *
 * Es la pregunta del mercado y por eso mira una temporada hacia adelante: las
 * ofertas se generan al cerrar el año y son para el siguiente. El último año de
 * contrato NO ata — ahí la mesa se pone entera, con la renovación adentro.
 */
export function underContract(state: CaptainState): boolean {
    const c = currentContract(state);
    return c !== null && seasonsLeftAfter(c, state.season) > 0;
}

/** ¿Se termina este año? Es la contracara exacta de `underContract`. */
export function contractExpiring(state: CaptainState): boolean {
    const c = currentContract(state);
    return c !== null && seasonsLeftAfter(c, state.season) === 0;
}

export interface BelongingSituation {
    clubId: string;
    abroad: boolean;
    hasTitleWithClub: boolean;
    jumpedToRival: boolean;
    playingHere: boolean;
}

/**
 * El contexto de Pertenencia para el club donde estás parado.
 *
 * `abroad` sale de comparar el país del club con el del jugador, no de una
 * bandera guardada: si el dato ya está en el estado, guardarlo otra vez es
 * crear una segunda fuente de verdad que se puede desincronizar. `playingHere`
 * es lo mismo con `player.clubId`, y es lo que hace que el congelamiento del
 * profesional sea una regla sobre el club que dejaste y no un apagón general.
 */
export function belongingSituation(state: CaptainState, clubId: string): BelongingSituation {
    const club = getClub(clubId);
    return {
        clubId,
        abroad: club.countryCode !== state.player.countryCode,
        hasTitleWithClub: state.titles.some((t) => t.clubId === clubId),
        playingHere: state.player.clubId === clubId,
        // El salto al clásico se DERIVA de la trayectoria, club por club. Antes
        // salía de `flags['salto-al-clasico']`, que no escribía nadie —el techo
        // del traidor era inalcanzable— y que además era global: el primer salto
        // le habría bajado el techo hasta al club que te acababa de fichar.
        jumpedToRival: isBetrayedClub(state, clubId),
    };
}

/**
 * Firmar profesional. Muta el estado —el reducer trabaja sobre un clon— y
 * devuelve la línea de crónica.
 *
 * ── EL SUELDO VOLVIÓ A SER UN PARÁMETRO, Y LAS DOS VECES POR EL MISMO MOTIVO ─
 * Hasta la 0.25.0 esta función recibía `salary` y NO LO USABA: el sueldo lo
 * pagaba `simulate-season` con una cuenta propia (`rating × 900`) que no tenía
 * nada que ver con el número que la oferta prometía. Dos respuestas a «cuánto
 * ganás», y la que el jugador leía antes de firmar era la que no corría. El
 * parámetro se borró y el sueldo pasó a derivarse de `salaryFor(club, ovr)`.
 *
 * Vuelve en la 0.30.0 y no es una marcha atrás: lo que cambió es el mundo. Con el
 * contrato de un año, `salaryFor` con la media de hoy ERA el sueldo de hoy, así
 * que guardarlo duplicaba una derivada (§1.9). Con contrato de dos o tres años ya
 * no: el sueldo es lo que ese club aceptó pagar el junio que firmaste, y la media
 * con la que se calculó no existe más. La regla no cambió —una sola fuente por
 * pregunta—; cambió cuál es la fuente.
 *
 * Los dos parámetros vienen de la MESA (`ClubOffer`), que es donde el jugador los
 * leyó antes de elegir. Recalcularlos acá sería volver a tener dos respuestas.
 */
export function signProfessional(state: CaptainState, clubId: string, years: number, salary: number): string {
    const club = getClub(clubId);
    const anterior = state.player.clubId;
    // EL SALTO ES UNO SOLO, y la crónica tiene que saberlo. Al que ya venía con
    // contrato esta línea le contaba todos los años que dejaba de ser jugador de
    // su club, y hacía años que no lo era. Se lee ANTES de mutar `stage`.
    const eraAmateur = state.stage === 'amateur';

    // El golpe se cobra en el club que dejás, y antes de congelar: si no, el
    // congelamiento se comería la penalidad y firmar saldría gratis.
    if (anterior) {
        state.belonging = applyBelonging(state.belonging, BELONGING_PRO_PENALTY, belongingSituation(state, anterior));
    }

    state.belonging = setFrozen(state.belonging, true);
    state.stage = 'professional';
    state.signedProSeason = state.season;
    state.player.clubId = clubId;

    // EL CONTRATO ARRANCA EL AÑO QUE VIENE, y el `+ 1` no es un ajuste fino: la
    // mesa se pone cuando la temporada ya se jugó, así que lo que se firma en
    // este junio es dónde vas a jugar el año siguiente. Sin él, un contrato de
    // dos años se comería una temporada que ya pasó y vencería un junio antes de
    // lo que dice la tarjeta.
    state.contract = { clubId, since: state.season + 1, years, salary };

    // ── ACÁ IBA `state.money = 0`, Y HABÍA QUE SACARLO ──────────────────────
    // Era inofensivo mientras la plata no servía para nada: el amateur tiene
    // cero, así que borrar cero no borraba nada. Con la tienda adentro sí borra
    // —el que volvió a su club y firma de nuevo pierde los ahorros de toda su
    // primera etapa profesional— y no hay ninguna regla del rugby que lo pida:
    // rescindir un contrato no te vacía la cuenta del banco.
    //
    // Lo que la etapa amateur sigue haciendo es CONGELAR la plata: no entra ni
    // sale mientras no tengas contrato, y eso lo garantiza `engine/money.ts` en
    // un solo lugar.

    const plazo = `${years} ${years === 1 ? 'año' : 'años'}`;
    return eraAmateur
        ? `Firmaste con ${club.name} por ${plazo}. Dejás de ser jugador de tu club: el reglamento no te deja volver mientras dure el contrato.`
        : `Firmaste con ${club.name} por ${plazo}. Rescindiste donde estabas y arrancás de nuevo en otro vestuario.`;
}

/**
 * RENOVAR: el mismo club, un contrato nuevo.
 *
 * Es la otra mitad de un mercado con plazos y por eso es una función propia y no
 * `signProfessional` con el club repetido: renovar NO te cuesta Pertenencia
 * —seguís siendo el mismo jugador del mismo vestuario— y no rescindís nada. Lo
 * único que se mueve es el papel.
 *
 * El sueldo y el plazo se recalculan afuera, con la media de HOY, y llegan como
 * parámetros por el mismo motivo que en `signProfessional`: son lo que el jugador
 * leyó en la tarjeta antes de aceptar.
 */
export function renewContract(state: CaptainState, years: number, salary: number): string {
    const clubId = state.player.clubId;
    if (!clubId) return '';

    state.contract = { clubId, since: state.season + 1, years, salary };

    const plazo = `${years} ${years === 1 ? 'año' : 'años'}`;
    return `Renovaste con ${getClub(clubId).name} por ${plazo}.`;
}

/**
 * Volver al club de origen. Descongela la cuenta y devuelve el bonus.
 *
 * El jugador vuelve a ser amateur: rescindió. Es lo que hicieron Boffelli
 * —dejó Edinburgh y volvió a jugar en Duendes— y Creevy, que se retiró en San
 * Luis de La Plata.
 */
export function returnHome(state: CaptainState): string {
    const home = state.homeClubId;
    if (!home) return '';

    state.stage = 'amateur';
    state.signedProSeason = null;
    state.player.clubId = home;
    // VOLVER ES RESCINDIR, así que el contrato se va con la etapa. Es la puerta
    // de escape del plazo y tiene que existir: un contrato de tres años que no se
    // pudiera romper convertiría la decisión más linda del juego —volver a
    // terminar donde empezaste— en algo que solo pasa cada tres junios.
    state.contract = null;
    state.belonging = setFrozen(state.belonging, false);
    state.belonging = applyBelonging(state.belonging, BELONGING_RETURN_BONUS, belongingSituation(state, home));

    // VOLVER CIERRA TU MERCADO DEL AÑO, y esto hay que hacerlo acá adentro.
    // Desde que el mercado corre como paso propio después de la decisión
    // (`openMarketOrClose`), las ofertas que seguían sobre la mesa aparecían
    // inmediatamente después de haber vuelto: la pantalla te contaba que la
    // cancha estaba llena por vos y en el clic siguiente te ofrecía cinco
    // clubes. Y son ofertas de un mundo que ya no existe — se calcularon con el
    // club que acabás de dejar.
    state.offers = [];

    return `Volviste a ${getClub(home).name}. La Pertenencia te esperaba donde la dejaste.`;
}
