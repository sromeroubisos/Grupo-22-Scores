import type { CreatePlayerInput } from '../engine/create-player.ts';

// Acciones del reducer de carrera.
export type CareerAction =
    | { type: 'START'; input: CreatePlayerInput; seed: number }
    | { type: 'CHOOSE'; optionId: string } // resolver el evento pendiente y jugar la temporada
    | { type: 'ADVANCE' } // jugar la temporada cuando no hay evento pendiente
    | { type: 'RETIRE' }; // retiro voluntario

export const startCareer = (input: CreatePlayerInput, seed: number): CareerAction => ({ type: 'START', input, seed });
export const chooseOption = (optionId: string): CareerAction => ({ type: 'CHOOSE', optionId });
export const advanceSeason = (): CareerAction => ({ type: 'ADVANCE' });
export const retire = (): CareerAction => ({ type: 'RETIRE' });
