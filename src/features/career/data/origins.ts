import type { AttributeKey } from '../types/player.ts';

// El origen define de dónde sale el jugador: cambia edad de debut, nivel del
// primer club, sesgos de atributos y fama/moral iniciales. Además habilita
// ciertos eventos vía flags.
export interface OriginDef {
    id: string;
    labelEs: string;
    description: string;
    /**
     * YA NO FIJA LA EDAD DE DEBUT (1.26.0): todos debutan a los 18
     * (`START_AGE` en engine/create-player.ts). Se conserva porque la guía de
     * orígenes lo muestra como rasgo del camino —el universitario llega tarde al
     * rugby organizado, y eso sigue siendo cierto— pero el motor no lo lee.
     *
     * Si alguien viene a usarlo para calcular una edad, ésa es la razón por la
     * que no debe: dos partidas con distinta edad de arranque no se pueden
     * comparar, y la diferencia no era la decisión de nadie.
     */
    startAge: number;
    startTier: number; // nivel del primer club (1 elite … 4 ascenso)
    fameStart: number;
    moraleStart: number;
    attributeMods: Partial<Record<AttributeKey, number>>;
    flags?: Record<string, number>; // banderas iniciales
    defaultNationality: string;
}

export const ORIGINS: Record<string, OriginDef> = {
    'academia-club': {
        id: 'academia-club',
        labelEs: 'Inferiores de un club tradicional',
        description: 'Te formaste en las inferiores de un club grande. Base sólida, camino marcado.',
        startAge: 18,
        startTier: 2,
        fameStart: 18,
        moraleStart: 62,
        attributeMods: { technique: 3, mental: 2 },
        flags: { cantera: 1 },
        defaultNationality: 'Argentina',
    },
    'seleccionado-juvenil': {
        id: 'seleccionado-juvenil',
        labelEs: 'Seleccionado juvenil',
        description: 'Fuiste figura en el M18/M20. Llegás con vidriera y presión.',
        startAge: 18,
        startTier: 2,
        fameStart: 34,
        moraleStart: 66,
        attributeMods: { mental: 4, vision: 3, technique: 2 },
        flags: { promesa: 1 },
        defaultNationality: 'Argentina',
    },
    'universitario-tardio': {
        id: 'universitario-tardio',
        labelEs: 'Rugby universitario (llegada tardía)',
        description: 'Explotaste tarde, en el rugby universitario. Menos pulido, más cabeza.',
        startAge: 21,
        startTier: 3,
        fameStart: 10,
        moraleStart: 58,
        attributeMods: { mental: 5, stamina: 3, technique: -3 },
        flags: { tardio: 1 },
        defaultNationality: 'Argentina',
    },
    'exterior-academia': {
        id: 'exterior-academia',
        labelEs: 'Academia en el exterior',
        description: 'Te fuiste pibe a una academia afuera. Más técnica, lejos de casa.',
        startAge: 19,
        startTier: 3,
        fameStart: 22,
        moraleStart: 55,
        attributeMods: { technique: 4, kick: 2, mental: 1 },
        flags: { legionario: 1 },
        defaultNationality: 'Argentina',
    },
    'ascenso-pueblo': {
        id: 'ascenso-pueblo',
        labelEs: 'Club chico del interior',
        description: 'Saliste de un club del interior peleando el ascenso. Todo a pulmón.',
        startAge: 19,
        startTier: 4,
        fameStart: 6,
        moraleStart: 70,
        attributeMods: { power: 3, stamina: 3, technique: -2 },
        flags: { corazon: 1 },
        defaultNationality: 'Argentina',
    },
};

export const ALL_ORIGINS: string[] = Object.keys(ORIGINS);

export function getOrigin(id: string): OriginDef {
    return ORIGINS[id] ?? ORIGINS['academia-club'];
}
