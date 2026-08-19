/**
 * Orígenes rugbísticos: de dónde sale el jugador. Cada uno sesga los atributos
 * iniciales y el nivel del primer club, para que el arranque ya cuente una
 * historia (el crudo del potrero vs. el pulido de la academia).
 */

import type { Attributes, OriginId } from './types.ts';
import type { CompetitionTier } from './competitions.ts';

export interface Origin {
    id: OriginId;
    name: string;
    description: string;
    attributeMods: Partial<Attributes>;
    moraleMod: number;
    fameMod: number;
    startTier: CompetitionTier;
}

export const ORIGINS: Record<OriginId, Origin> = {
    potrero: {
        id: 'potrero',
        name: 'Del potrero',
        description: 'Talento crudo y físico, técnica por pulir.',
        attributeMods: { power: 6, speed: 6, stamina: 4, technique: -6, mental: -4, kick: -3 },
        moraleMod: 4,
        fameMod: 0,
        startTier: 'formativo',
    },
    clubBarrio: {
        id: 'clubBarrio',
        name: 'Club de barrio',
        description: 'Formación equilibrada y mucho partido en las piernas.',
        attributeMods: { stamina: 4, tackle: 3, technique: 1 },
        moraleMod: 2,
        fameMod: 0,
        startTier: 'ascenso',
    },
    academia: {
        id: 'academia',
        name: 'Academia',
        description: 'Producto de cantera: técnica y lectura por encima del promedio.',
        attributeMods: { technique: 6, vision: 4, mental: 3, power: -2 },
        moraleMod: 0,
        fameMod: 3,
        startTier: 'primera',
    },
    colegioTradicional: {
        id: 'colegioTradicional',
        name: 'Colegio tradicional',
        description: 'Disciplina y cabeza fría desde chico.',
        attributeMods: { mental: 6, vision: 4, kick: 3, speed: -2 },
        moraleMod: 1,
        fameMod: 2,
        startTier: 'primera',
    },
    universidad: {
        id: 'universidad',
        name: 'Universidad',
        description: 'Llega más tarde pero con una lectura de juego notable.',
        attributeMods: { vision: 6, mental: 4, technique: 2, power: -3 },
        moraleMod: 0,
        fameMod: 0,
        startTier: 'ascenso',
    },
    seleccionJuvenil: {
        id: 'seleccionJuvenil',
        name: 'Selección juvenil',
        description: 'Prospecto marcado: ya jugó torneos internacionales sub-20.',
        attributeMods: { power: 2, speed: 2, technique: 3, vision: 3, mental: 3, tackle: 2 },
        moraleMod: 3,
        fameMod: 10,
        startTier: 'primera',
    },
};

export const ORIGIN_LIST: Origin[] = Object.values(ORIGINS);

export function getOrigin(id: OriginId): Origin {
    return ORIGINS[id];
}
