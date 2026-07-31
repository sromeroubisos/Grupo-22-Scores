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

import type { CaptainState } from '../types/captain.ts';
import { BELONGING_PRO_PENALTY } from '../types/currencies.ts';
import { applyBelonging, setFrozen } from './belonging.ts';
import { getClub } from '../data/catalogs.ts';

/** Lo que se le suma a la Pertenencia del club de origen cuando volvés. */
export const BELONGING_RETURN_BONUS = 10;

export interface BelongingSituation {
    clubId: string;
    abroad: boolean;
    hasTitleWithClub: boolean;
    jumpedToRival: boolean;
}

/**
 * El contexto de Pertenencia para el club donde estás parado.
 *
 * `abroad` sale de comparar el país del club con el del jugador, no de una
 * bandera guardada: si el dato ya está en el estado, guardarlo otra vez es
 * crear una segunda fuente de verdad que se puede desincronizar.
 */
export function belongingSituation(state: CaptainState, clubId: string): BelongingSituation {
    const club = getClub(clubId);
    return {
        clubId,
        abroad: club.countryCode !== state.player.countryCode,
        hasTitleWithClub: state.titles.some((t) => t.clubId === clubId),
        // El salto al clásico todavía no está modelado como decisión; cuando
        // exista, sale de una bandera del jugador y no de una adivinanza.
        jumpedToRival: (state.player.flags['salto-al-clasico'] ?? 0) > 0,
    };
}

/**
 * Firmar profesional. Muta el estado —el reducer trabaja sobre un clon— y
 * devuelve la línea de crónica.
 */
export function signProfessional(state: CaptainState, clubId: string, salary: number): string {
    const club = getClub(clubId);
    const anterior = state.player.clubId;

    // El golpe se cobra en el club que dejás, y antes de congelar: si no, el
    // congelamiento se comería la penalidad y firmar saldría gratis.
    if (anterior) {
        state.belonging = applyBelonging(state.belonging, BELONGING_PRO_PENALTY, belongingSituation(state, anterior));
    }

    state.belonging = setFrozen(state.belonging, true);
    state.stage = 'professional';
    state.signedProSeason = state.season;
    state.player.clubId = clubId;
    state.money = 0;

    return `Firmaste con ${club.name}. Dejás de ser jugador de tu club: el reglamento no te deja volver mientras dure el contrato.`;
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
    state.belonging = setFrozen(state.belonging, false);
    state.belonging = applyBelonging(state.belonging, BELONGING_RETURN_BONUS, belongingSituation(state, home));

    return `Volviste a ${getClub(home).name}. La Pertenencia te esperaba donde la dejaste.`;
}
