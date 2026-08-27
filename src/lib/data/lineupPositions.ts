/**
 * LAS POSICIONES DE UNA FORMACIÓN, POR DEPORTE.
 *
 * De acá sale la grilla que el hincha completa en la previa del partido. El número
 * NO es decorativo: en rugby la camiseta ES el puesto —el 9 es el medio scrum en
 * todos los clubes del mundo— y por eso el orden y la numeración van fijos acá y no
 * los elige la pantalla.
 *
 * No se confunde con `lib/career/positions.ts` ni con los `positions.ts` de los
 * minijuegos: aquéllos son pesos de atributos para simular a UN jugador. Esto es la
 * plantilla de camisetas de un equipo real.
 *
 * Un deporte que no esté en esta tabla no rompe nada: `getLineupForSport` devuelve
 * null y la pantalla no ofrece armar formación. Es preferible a inventarle puestos a
 * un deporte que no los tiene así.
 */

export type LineupSlot = {
    /** El número de camiseta que corresponde al puesto. */
    number: number;
    /** Identificador estable, para el estado de la pantalla y el export. */
    code: string;
    label: string;
    /** Abreviatura para cuando no entra el nombre completo. */
    short: string;
    group: string;
};

export type LineupGroup = {
    id: string;
    label: string;
};

export type SportLineup = {
    /** Todas las claves con las que puede llegar el deporte desde la base o el proveedor. */
    sportIds: string[];
    /** Cómo se llama una formación en ese deporte: "el XV", "el XI". */
    name: string;
    groups: LineupGroup[];
    slots: LineupSlot[];
};

const slot = (number: number, code: string, label: string, short: string, group: string): LineupSlot =>
    ({ number, code, label, short, group });

/** Los suplentes se numeran corridos desde el último titular. */
function bench(desde: number, cantidad: number): LineupSlot[] {
    return Array.from({ length: cantidad }, (_, i) =>
        slot(desde + i, `bench-${desde + i}`, `Suplente ${desde + i}`, String(desde + i), 'bench'));
}

const RUGBY_UNION: SportLineup = {
    sportIds: ['rugby', 'rugby-union', '8', '19'],
    name: 'el XV',
    groups: [
        { id: 'forwards', label: 'Forwards' },
        { id: 'backs', label: 'Backs' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'loosehead', 'Pilar izquierdo', 'PI', 'forwards'),
        slot(2, 'hooker', 'Hooker', 'H', 'forwards'),
        slot(3, 'tighthead', 'Pilar derecho', 'PD', 'forwards'),
        slot(4, 'lock-4', 'Segunda línea', 'SL', 'forwards'),
        slot(5, 'lock-5', 'Segunda línea', 'SL', 'forwards'),
        slot(6, 'blindside', 'Ala ciego', 'A', 'forwards'),
        slot(7, 'openside', 'Ala abierto', 'A', 'forwards'),
        slot(8, 'number-8', 'Octavo', '8', 'forwards'),
        slot(9, 'scrum-half', 'Medio scrum', 'MS', 'backs'),
        slot(10, 'fly-half', 'Apertura', 'AP', 'backs'),
        slot(11, 'left-wing', 'Wing izquierdo', 'W', 'backs'),
        slot(12, 'inside-centre', 'Primer centro', 'C', 'backs'),
        slot(13, 'outside-centre', 'Segundo centro', 'C', 'backs'),
        slot(14, 'right-wing', 'Wing derecho', 'W', 'backs'),
        slot(15, 'fullback', 'Fullback', 'FB', 'backs'),
        // El banco de rugby son 8, y de ahí sale el 23 del que habla todo el mundo.
        ...bench(16, 8),
    ],
};

const RUGBY_SEVENS: SportLineup = {
    sportIds: ['rugby-7s', 'rugby-sevens'],
    name: 'el VII',
    groups: [
        { id: 'forwards', label: 'Forwards' },
        { id: 'backs', label: 'Backs' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'prop-1', 'Pilar', 'P', 'forwards'),
        slot(2, 'hooker', 'Hooker', 'H', 'forwards'),
        slot(3, 'prop-3', 'Pilar', 'P', 'forwards'),
        slot(4, 'scrum-half', 'Medio scrum', 'MS', 'backs'),
        slot(5, 'fly-half', 'Apertura', 'AP', 'backs'),
        slot(6, 'centre', 'Centro', 'C', 'backs'),
        slot(7, 'wing', 'Wing', 'W', 'backs'),
        ...bench(8, 5),
    ],
};

const RUGBY_LEAGUE: SportLineup = {
    sportIds: ['rugby-league'],
    name: 'el XIII',
    groups: [
        { id: 'forwards', label: 'Forwards' },
        { id: 'backs', label: 'Backs' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'fullback', 'Fullback', 'FB', 'backs'),
        slot(2, 'right-wing', 'Wing derecho', 'W', 'backs'),
        slot(3, 'right-centre', 'Centro derecho', 'C', 'backs'),
        slot(4, 'left-centre', 'Centro izquierdo', 'C', 'backs'),
        slot(5, 'left-wing', 'Wing izquierdo', 'W', 'backs'),
        slot(6, 'stand-off', 'Apertura', 'AP', 'backs'),
        slot(7, 'scrum-half', 'Medio scrum', 'MS', 'backs'),
        slot(8, 'prop-8', 'Pilar', 'P', 'forwards'),
        slot(9, 'hooker', 'Hooker', 'H', 'forwards'),
        slot(10, 'prop-10', 'Pilar', 'P', 'forwards'),
        slot(11, 'second-row-11', 'Segunda línea', 'SL', 'forwards'),
        slot(12, 'second-row-12', 'Segunda línea', 'SL', 'forwards'),
        slot(13, 'loose-forward', 'Loose forward', 'LF', 'forwards'),
        ...bench(14, 4),
    ],
};

const FIELD_HOCKEY: SportLineup = {
    sportIds: ['field-hockey', '24'],
    name: 'el XI',
    groups: [
        { id: 'starters', label: 'Titulares' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'goalkeeper', 'Arquera/o', 'ARQ', 'starters'),
        slot(2, 'right-back', 'Defensora/or derecha', 'DEF', 'starters'),
        slot(3, 'centre-back', 'Última línea', 'DEF', 'starters'),
        slot(4, 'sweeper', 'Líbero', 'LIB', 'starters'),
        slot(5, 'left-back', 'Defensora/or izquierda', 'DEF', 'starters'),
        slot(6, 'right-mid', 'Volante derecha', 'VOL', 'starters'),
        slot(7, 'centre-mid', 'Volante central', 'VOL', 'starters'),
        slot(8, 'left-mid', 'Volante izquierda', 'VOL', 'starters'),
        slot(9, 'right-forward', 'Delantera/o derecha', 'DEL', 'starters'),
        slot(10, 'centre-forward', 'Delantera/o centro', 'DEL', 'starters'),
        slot(11, 'left-forward', 'Delantera/o izquierda', 'DEL', 'starters'),
        ...bench(12, 5),
    ],
};

const FOOTBALL: SportLineup = {
    sportIds: ['football', 'soccer', 'futbol', 'fútbol', '1'],
    name: 'el XI',
    groups: [
        { id: 'starters', label: 'Titulares' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'goalkeeper', 'Arquero', 'ARQ', 'starters'),
        slot(2, 'right-back', 'Lateral derecho', 'LD', 'starters'),
        slot(3, 'left-back', 'Lateral izquierdo', 'LI', 'starters'),
        slot(4, 'centre-back-4', 'Central', 'DFC', 'starters'),
        slot(5, 'centre-back-5', 'Central', 'DFC', 'starters'),
        slot(6, 'defensive-mid', 'Volante central', 'MC', 'starters'),
        slot(7, 'right-mid', 'Volante derecho', 'MD', 'starters'),
        slot(8, 'centre-mid', 'Mediocampista', 'MC', 'starters'),
        slot(9, 'striker', 'Delantero centro', 'DC', 'starters'),
        slot(10, 'attacking-mid', 'Enganche', 'MP', 'starters'),
        slot(11, 'left-mid', 'Volante izquierdo', 'MI', 'starters'),
        ...bench(12, 7),
    ],
};

const HANDBALL: SportLineup = {
    sportIds: ['handball'],
    name: 'el VII',
    groups: [
        { id: 'starters', label: 'Titulares' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'goalkeeper', 'Arquero', 'ARQ', 'starters'),
        slot(2, 'left-wing', 'Extremo izquierdo', 'EI', 'starters'),
        slot(3, 'left-back', 'Lateral izquierdo', 'LI', 'starters'),
        slot(4, 'centre-back', 'Central', 'CE', 'starters'),
        slot(5, 'right-back', 'Lateral derecho', 'LD', 'starters'),
        slot(6, 'right-wing', 'Extremo derecho', 'ED', 'starters'),
        slot(7, 'pivot', 'Pivot', 'PI', 'starters'),
        ...bench(8, 7),
    ],
};

const BASKETBALL: SportLineup = {
    sportIds: ['basketball'],
    name: 'el quinteto',
    groups: [
        { id: 'starters', label: 'Titulares' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'point-guard', 'Base', 'B', 'starters'),
        slot(2, 'shooting-guard', 'Escolta', 'E', 'starters'),
        slot(3, 'small-forward', 'Alero', 'AL', 'starters'),
        slot(4, 'power-forward', 'Ala-pivot', 'AP', 'starters'),
        slot(5, 'centre', 'Pivot', 'PI', 'starters'),
        ...bench(6, 7),
    ],
};

const VOLLEYBALL: SportLineup = {
    sportIds: ['volleyball'],
    name: 'el seis',
    groups: [
        { id: 'starters', label: 'Titulares' },
        { id: 'bench', label: 'Banco' },
    ],
    slots: [
        slot(1, 'setter', 'Armador', 'AR', 'starters'),
        slot(2, 'opposite', 'Opuesto', 'OP', 'starters'),
        slot(3, 'outside-1', 'Punta receptor', 'PR', 'starters'),
        slot(4, 'outside-2', 'Punta receptor', 'PR', 'starters'),
        slot(5, 'middle-1', 'Central', 'CE', 'starters'),
        slot(6, 'middle-2', 'Central', 'CE', 'starters'),
        slot(7, 'libero', 'Líbero', 'LI', 'starters'),
        ...bench(8, 6),
    ],
};

const LINEUPS: SportLineup[] = [
    RUGBY_UNION,
    RUGBY_SEVENS,
    RUGBY_LEAGUE,
    FIELD_HOCKEY,
    FOOTBALL,
    HANDBALL,
    BASKETBALL,
    VOLLEYBALL,
];

const POR_DEPORTE = new Map<string, SportLineup>();
for (const lineup of LINEUPS) {
    for (const id of lineup.sportIds) POR_DEPORTE.set(id.toLowerCase(), lineup);
}

/**
 * La formación del deporte, o null si ese deporte no tiene una. Null es una
 * respuesta válida y la pantalla tiene que saber no ofrecer el armado.
 */
export function getLineupForSport(sportId: unknown): SportLineup | null {
    if (sportId === null || sportId === undefined) return null;
    const key = String(sportId).trim().toLowerCase();
    if (!key) return null;
    return POR_DEPORTE.get(key) ?? null;
}

export function getStartingSlots(lineup: SportLineup): LineupSlot[] {
    return lineup.slots.filter((s) => s.group !== 'bench');
}

export function getBenchSlots(lineup: SportLineup): LineupSlot[] {
    return lineup.slots.filter((s) => s.group === 'bench');
}

export { LINEUPS as ALL_SPORT_LINEUPS };
