// EL CAPITÁN — las acciones del reducer.
//
// Siete, y tres de ellas son del reparto de Tiempo: es la decisión que se toma
// todas las temporadas, así que se merece verbos propios.

import type { CreateCaptainInput } from '../types/captain.ts';
import type { TimeSlot } from '../types/currencies.ts';
import type { MomentOutcome } from '../types/moment.ts';

export type CaptainAction =
    | { type: 'START'; input: CreateCaptainInput; seed: number }
    | { type: 'SPEND_TIME'; slot: TimeSlot }
    | { type: 'UNSPEND_TIME'; slot: TimeSlot }
    | { type: 'CONFIRM_TIME' }
    /** Lo que hiciste en la jugada. Es tu mano, no un dado. */
    | { type: 'RESOLVE_MOMENT'; outcome: MomentOutcome }
    | { type: 'CHOOSE'; optionId: string }
    | { type: 'ADVANCE' }
    | { type: 'RETIRE' };

export const startCaptain = (input: CreateCaptainInput, seed: number): CaptainAction => ({ type: 'START', input, seed });
export const spendTime = (slot: TimeSlot): CaptainAction => ({ type: 'SPEND_TIME', slot });
export const unspendTime = (slot: TimeSlot): CaptainAction => ({ type: 'UNSPEND_TIME', slot });
export const confirmTime = (): CaptainAction => ({ type: 'CONFIRM_TIME' });
export const resolveMomentAction = (outcome: MomentOutcome): CaptainAction => ({ type: 'RESOLVE_MOMENT', outcome });
export const chooseOption = (optionId: string): CaptainAction => ({ type: 'CHOOSE', optionId });
export const advanceSeason = (): CaptainAction => ({ type: 'ADVANCE' });
export const retire = (): CaptainAction => ({ type: 'RETIRE' });
