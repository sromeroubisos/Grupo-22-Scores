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

export type CaptainAction =
    | { type: 'START'; input: CreateCaptainInput; seed: number }
    /** El entrenamiento de la pretemporada. Elegir es también cerrar. */
    | { type: 'CHOOSE_TRAINING'; trainingId: string }
    /** Lo que hiciste en la jugada. Es tu mano, no un dado. */
    | { type: 'RESOLVE_MOMENT'; outcome: MomentOutcome }
    | { type: 'CHOOSE'; optionId: string }
    | { type: 'ADVANCE' }
    | { type: 'RETIRE' };

export const startCaptain = (input: CreateCaptainInput, seed: number): CaptainAction => ({ type: 'START', input, seed });
export const chooseTraining = (trainingId: string): CaptainAction => ({ type: 'CHOOSE_TRAINING', trainingId });
export const resolveMomentAction = (outcome: MomentOutcome): CaptainAction => ({ type: 'RESOLVE_MOMENT', outcome });
export const chooseOption = (optionId: string): CaptainAction => ({ type: 'CHOOSE', optionId });
export const advanceSeason = (): CaptainAction => ({ type: 'ADVANCE' });
export const retire = (): CaptainAction => ({ type: 'RETIRE' });
