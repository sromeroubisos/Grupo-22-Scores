// EL CAPITÁN — las acciones del reducer.
//
// Seis. Eran ocho hasta 0.7.0, y las tres que se fueron —poner ficha, sacar
// ficha, cerrar el reparto— eran las del presupuesto de ⏳ Tiempo. Las reemplaza
// una sola: `CHOOSE_TRAINING`, que elige y cierra en el mismo gesto.
//
// Que un verbo haga las dos cosas no es un atajo: es lo que distingue una carta
// de un formulario. Poner y sacar fichas existía porque el reparto se podía
// deshacer antes de confirmar; una carta se elige y se acabó, igual que una
// opción de evento.

import type { CreateCaptainInput } from '../types/captain.ts';
import type { MomentOutcome } from '../types/moment.ts';
import type { CaptainAttributeKey } from '../types/player.ts';
import type { ComodinId } from '../types/tournament.ts';

export type CaptainAction =
    | { type: 'START'; input: CreateCaptainInput; seed: number }
    /** El entrenamiento de la pretemporada. Elegir es también cerrar. */
    | { type: 'CHOOSE_TRAINING'; trainingId: string }
    /** Lo que hiciste en la jugada. Es tu mano, no un dado. */
    | { type: 'RESOLVE_MOMENT'; outcome: MomentOutcome }
    | { type: 'CHOOSE'; optionId: string }
    /**
     * DESTAPAR UNA CELDA. `index` es la posición en `matches`.
     *
     * ── LLEVA ÍNDICE, Y ANTES NO ──────────────────────────────────────────
     * La primera versión destapaba SIEMPRE la primera sin destapar y tenía un
     * botón que decía «Jugar contra Rosario». Mecánicamente daba igual —los tres
     * partidos del grupo están sorteados por separado, así que el orden no cambia
     * nada— y aun así estaba mal, porque convertía una GRILLA QUE SE TOCA en un
     * botón que avanza. El jugador miraba tres celdas tapadas y el juego le decía
     * cuál iba a abrir.
     *
     * Que el orden no cambie el resultado no es un argumento para sacarle la
     * elección: es exactamente lo mismo que pasa en el juego de las casillas —
     * nueve celdas indistinguibles— y ahí nadie discute que el jugador elija. El
     * gesto de elegir la celda ES el juego.
     */
    | { type: 'REVEAL_MATCH'; index: number }
    /**
     * QUÉ COMODÍN TE TRAÉS AL TORNEO. Se elige una vez, antes del primer partido.
     *
     * Es la primera mitad de la decisión doble del torneo; la segunda es cuándo
     * quemarlo (`USE_COMODIN`). Va como acción propia y no como un campo de
     * `openTournament` porque es una ELECCIÓN del jugador: resuelta al abrir,
     * sería el motor eligiendo por él.
     */
    | { type: 'CHOOSE_COMODIN'; comodin: ComodinId }
    /**
     * QUEMAR EL COMODÍN. Uno por torneo, y qué hace depende de cuál trajiste.
     *
     * Se llamaba `ARENGAR` cuando la arenga era el único. El nombre viejo
     * describía UN comodín y la acción ejecuta el que haya (§1.5 del CLAUDE de
     * captain: el nombre y la cosa dicen lo mismo o no dicen nada).
     */
    | { type: 'USE_COMODIN' }
    /**
     * ELEGIR UNA CASILLA en la final que se juega. `index` va de 0 a 8.
     *
     * Lleva índice, al revés que `REVEAL_MATCH`, y la diferencia es real: acá el
     * jugador SÍ elige cuál. Que las nueve casillas sean indistinguibles —y que
     * por lo tanto cualquier orden tenga la misma probabilidad— no quita que la
     * elección sea suya, y es lo único que el juego de las casillas pide.
     */
    | { type: 'PICK_CELL'; index: number }
    /**
     * ELEGIR UNA CELDA DE LA GRILLA DE TREINTA. Una por partido, y se acabó.
     *
     * Atras de cada celda hay un resultado, y la proporcion de victorias entre
     * las treinta ES la probabilidad de ese cruce. El jugador no ve los numeros,
     * pero la mano viene con el peso puesto desde antes de tocar.
     */
    | { type: 'PICK_GRID'; index: number }
    /**
     * CERRAR EL TORNEO Y COBRAR, después de haberlo leído.
     *
     * Va aparte de `REVEAL_MATCH` a propósito, y es un bug que se pagó: al
     * destapar el partido que elimina, el reducer cerraba el torneo, aplicaba el
     * saldo y saltaba de fase en el mismo gesto — así que el marcador que te
     * dejaba afuera no se veía nunca. Se pasaba de «Jugar contra Córdoba» a la
     * decisión siguiente sin que el jugador supiera por cuánto perdió.
     *
     * El destape deja el torneo CERRADO PERO EN PANTALLA (`outcome` ya escrito) y
     * esta acción es el «Continuar» del jugador. La regla general es la del
     * CLAUDE.md: un resultado se lee antes de seguir, y el botón que lo cierra es
     * distinto de los que deciden algo.
     */
    | { type: 'FINISH_TOURNAMENT' }
    /**
     * COMPRAR EN LA TIENDA. `attr` solo lo llevan los ítems que piden elegir.
     *
     * Es la única acción del juego que NO CONSUME AZAR, y es a propósito: si
     * comprar tirara un dado, dos partidas con la misma semilla que compran
     * distinto recibirían Momentos distintos, y la diferencia entre ellas dejaría
     * de ser lo que la tienda hizo para pasar a ser el stream corrido.
     *
     * Tampoco cambia de fase. Se compra desde la pretemporada, sin salir de
     * ella: la tienda es un lugar donde entrás y del que volvés, no un paso del
     * ciclo — y por eso una recarga a mitad de compra devuelve la pretemporada
     * con la plata ya descontada, que es lo correcto.
     */
    | { type: 'BUY'; itemId: string; attr?: CaptainAttributeKey }
    | { type: 'ADVANCE' }
    | { type: 'RETIRE' };

export const startCaptain = (input: CreateCaptainInput, seed: number): CaptainAction => ({ type: 'START', input, seed });
export const chooseTraining = (trainingId: string): CaptainAction => ({ type: 'CHOOSE_TRAINING', trainingId });
export const resolveMomentAction = (outcome: MomentOutcome): CaptainAction => ({ type: 'RESOLVE_MOMENT', outcome });
export const chooseOption = (optionId: string): CaptainAction => ({ type: 'CHOOSE', optionId });
export const revealMatch = (index: number): CaptainAction => ({ type: 'REVEAL_MATCH', index });
export const chooseComodin = (comodin: ComodinId): CaptainAction => ({ type: 'CHOOSE_COMODIN', comodin });
export const useComodin = (): CaptainAction => ({ type: 'USE_COMODIN' });
export const pickGrid = (index: number): CaptainAction => ({ type: 'PICK_GRID', index });
export const pickCell = (index: number): CaptainAction => ({ type: 'PICK_CELL', index });
export const finishTournament = (): CaptainAction => ({ type: 'FINISH_TOURNAMENT' });
export const buy = (itemId: string, attr?: CaptainAttributeKey): CaptainAction => ({ type: 'BUY', itemId, attr });
export const advanceSeason = (): CaptainAction => ({ type: 'ADVANCE' });
export const retire = (): CaptainAction => ({ type: 'RETIRE' });
