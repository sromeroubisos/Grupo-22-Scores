/**
 * Puestos de JUGADOR por deporte, para la ficha de club.
 *
 * No es lo mismo que `lineupPositions.ts`: aquel es el catálogo de LUGARES en
 * la formación, uno por camiseta (en hockey hay tres casilleros de defensora,
 * uno por lado). El puesto de una jugadora es "defensora", sin lado, y ese es
 * el dato que se guarda en la ficha. Acá la lista está deduplicada por rol.
 *
 * Se guarda la ETIQUETA, no el código. `people.position`,
 * `club_person_roles.position` y `team_memberships.position` ya tienen fichas
 * con la etiqueta en texto, y todo lo que las muestra (planilla oficial,
 * formaciones, ficha pública) imprime la columna tal cual. Pasar a códigos
 * pide una migración de datos y tocar cada consumidor; hasta entonces el código
 * sirve para identificar el puesto en la UI y para tolerar variantes de
 * escritura al leer (`findPlayerPosition`).
 *
 * Las etiquetas de rugby son EXACTAMENTE las de `RUGBY_POSITIONS`
 * (`src/lib/types/squad.ts`): `SquadRosterColumn` compara por nombre, y el
 * modal viejo guardaba "Medio Scrum" y "Segunda Linea" que no matcheaban.
 */

export type PlayerPosition = {
    /** Identificador estable, para el estado de la pantalla. */
    code: string;
    /** Lo que se guarda y se muestra. */
    label: string;
    short: string;
    group: string;
};

export type PositionGroup = { id: string; label: string };

export type SportPositionCatalog = {
    /** Todas las claves con las que puede llegar el deporte desde la base. */
    sportIds: string[];
    groups: PositionGroup[];
    positions: PlayerPosition[];
    /** El curso de primeras líneas (la marca ① de la planilla) existe solo en rugby. */
    hasFrontRow: boolean;
};

const pos = (code: string, label: string, short: string, group: string): PlayerPosition =>
    ({ code, label, short, group });

const FORWARDS_BACKS: PositionGroup[] = [
    { id: 'forwards', label: 'Forwards' },
    { id: 'backs', label: 'Backs' },
];

const STARTERS: PositionGroup[] = [{ id: 'starters', label: 'Puestos' }];

const RUGBY_UNION: SportPositionCatalog = {
    sportIds: ['rugby', 'rugby-union', 'rugby union', '8', '19'],
    groups: FORWARDS_BACKS,
    hasFrontRow: true,
    positions: [
        pos('loosehead', 'Pilar Izquierdo', 'PI', 'forwards'),
        pos('hooker', 'Hooker', 'H', 'forwards'),
        pos('tighthead', 'Pilar Derecho', 'PD', 'forwards'),
        pos('lock', 'Segunda Línea', 'SL', 'forwards'),
        pos('flanker', 'Ala', 'A', 'forwards'),
        pos('number-8', 'Octavo', '8', 'forwards'),
        pos('scrum-half', 'Medioscrum', 'MS', 'backs'),
        pos('fly-half', 'Apertura', 'AP', 'backs'),
        pos('centre', 'Centro', 'C', 'backs'),
        pos('wing', 'Wing', 'W', 'backs'),
        pos('fullback', 'Fullback', 'FB', 'backs'),
    ],
};

const RUGBY_SEVENS: SportPositionCatalog = {
    sportIds: ['rugby-7s', 'rugby-sevens', 'seven', 'sevens'],
    groups: FORWARDS_BACKS,
    hasFrontRow: true,
    positions: [
        pos('prop', 'Pilar', 'P', 'forwards'),
        pos('hooker', 'Hooker', 'H', 'forwards'),
        pos('scrum-half', 'Medioscrum', 'MS', 'backs'),
        pos('fly-half', 'Apertura', 'AP', 'backs'),
        pos('centre', 'Centro', 'C', 'backs'),
        pos('wing', 'Wing', 'W', 'backs'),
    ],
};

const RUGBY_LEAGUE: SportPositionCatalog = {
    sportIds: ['rugby-league', 'rugby league'],
    groups: FORWARDS_BACKS,
    hasFrontRow: false,
    positions: [
        pos('prop', 'Pilar', 'P', 'forwards'),
        pos('hooker', 'Hooker', 'H', 'forwards'),
        pos('second-row', 'Segunda Línea', 'SL', 'forwards'),
        pos('loose-forward', 'Loose forward', 'LF', 'forwards'),
        pos('scrum-half', 'Medioscrum', 'MS', 'backs'),
        pos('stand-off', 'Apertura', 'AP', 'backs'),
        pos('centre', 'Centro', 'C', 'backs'),
        pos('wing', 'Wing', 'W', 'backs'),
        pos('fullback', 'Fullback', 'FB', 'backs'),
    ],
};

const FIELD_HOCKEY: SportPositionCatalog = {
    sportIds: ['hockey', 'field-hockey', 'field hockey', '24'],
    groups: STARTERS,
    hasFrontRow: false,
    positions: [
        pos('goalkeeper', 'Arquera/o', 'ARQ', 'starters'),
        pos('defender', 'Defensora/or', 'DEF', 'starters'),
        pos('sweeper', 'Líbero', 'LIB', 'starters'),
        pos('midfielder', 'Volante', 'VOL', 'starters'),
        pos('forward', 'Delantera/o', 'DEL', 'starters'),
    ],
};

const FOOTBALL: SportPositionCatalog = {
    sportIds: ['football', 'soccer', 'futbol', 'fútbol', 'futsal', '1'],
    groups: STARTERS,
    hasFrontRow: false,
    positions: [
        pos('goalkeeper', 'Arquero', 'ARQ', 'starters'),
        pos('full-back', 'Lateral', 'LAT', 'starters'),
        pos('centre-back', 'Central', 'DFC', 'starters'),
        pos('defensive-mid', 'Volante central', 'MC', 'starters'),
        pos('midfielder', 'Mediocampista', 'MED', 'starters'),
        pos('attacking-mid', 'Enganche', 'MP', 'starters'),
        pos('winger', 'Extremo', 'EXT', 'starters'),
        pos('striker', 'Delantero', 'DEL', 'starters'),
    ],
};

const HANDBALL: SportPositionCatalog = {
    sportIds: ['handball', 'balonmano', '7'],
    groups: STARTERS,
    hasFrontRow: false,
    positions: [
        pos('goalkeeper', 'Arquero', 'ARQ', 'starters'),
        pos('wing', 'Extremo', 'EXT', 'starters'),
        pos('back', 'Lateral', 'LAT', 'starters'),
        pos('centre-back', 'Central', 'CE', 'starters'),
        pos('pivot', 'Pivot', 'PI', 'starters'),
    ],
};

const BASKETBALL: SportPositionCatalog = {
    sportIds: ['basketball', 'basquet', 'básquet', '3'],
    groups: STARTERS,
    hasFrontRow: false,
    positions: [
        pos('point-guard', 'Base', 'B', 'starters'),
        pos('shooting-guard', 'Escolta', 'E', 'starters'),
        pos('small-forward', 'Alero', 'AL', 'starters'),
        pos('power-forward', 'Ala-pivot', 'AP', 'starters'),
        pos('centre', 'Pivot', 'PI', 'starters'),
    ],
};

const VOLLEYBALL: SportPositionCatalog = {
    sportIds: ['volleyball', 'voley', 'vóley', 'voleibol'],
    groups: STARTERS,
    hasFrontRow: false,
    positions: [
        pos('setter', 'Armador', 'AR', 'starters'),
        pos('opposite', 'Opuesto', 'OP', 'starters'),
        pos('outside-hitter', 'Punta receptor', 'PR', 'starters'),
        pos('middle-blocker', 'Central', 'CE', 'starters'),
        pos('libero', 'Líbero', 'LI', 'starters'),
    ],
};

const AMERICAN_FOOTBALL: SportPositionCatalog = {
    sportIds: ['american-football', 'american football', 'futbol americano', 'fútbol americano', '5'],
    groups: [
        { id: 'offense', label: 'Ataque' },
        { id: 'defense', label: 'Defensa' },
        { id: 'special', label: 'Equipos especiales' },
    ],
    hasFrontRow: false,
    positions: [
        pos('quarterback', 'Quarterback', 'QB', 'offense'),
        pos('running-back', 'Running back', 'RB', 'offense'),
        pos('wide-receiver', 'Wide receiver', 'WR', 'offense'),
        pos('tight-end', 'Tight end', 'TE', 'offense'),
        pos('offensive-line', 'Línea ofensiva', 'OL', 'offense'),
        pos('defensive-line', 'Línea defensiva', 'DL', 'defense'),
        pos('linebacker', 'Linebacker', 'LB', 'defense'),
        pos('cornerback', 'Cornerback', 'CB', 'defense'),
        pos('safety', 'Safety', 'S', 'defense'),
        pos('kicker', 'Kicker', 'K', 'special'),
        pos('punter', 'Punter', 'P', 'special'),
    ],
};

const CATALOGS: SportPositionCatalog[] = [
    RUGBY_UNION,
    RUGBY_SEVENS,
    RUGBY_LEAGUE,
    FIELD_HOCKEY,
    FOOTBALL,
    HANDBALL,
    BASKETBALL,
    VOLLEYBALL,
    AMERICAN_FOOTBALL,
];

const BY_SPORT = new Map<string, SportPositionCatalog>();
for (const catalog of CATALOGS) {
    for (const id of catalog.sportIds) BY_SPORT.set(id.toLowerCase(), catalog);
}

function normalizeSportKey(sportId: unknown): string | null {
    if (sportId === null || sportId === undefined) return null;
    const key = String(sportId).trim().toLowerCase();
    return key || null;
}

/**
 * El catálogo del deporte, o `null` si no lo conocemos: en ese caso la UI
 * cae a texto libre. `null` no es "rugby": un club de un deporte sin catálogo
 * no tiene por qué ver forwards y backs.
 */
export function getPlayerPositionsForSport(sportId: unknown): SportPositionCatalog | null {
    const key = normalizeSportKey(sportId);
    return key ? BY_SPORT.get(key) ?? null : null;
}

/**
 * El deporte con el que se elige el puesto: el de la categoría manda, porque
 * un club polideportivo tiene categorías de rugby y de hockey; si el jugador
 * va al plantel base, el del club.
 */
export function resolveRosterSport(divisionSport: unknown, clubSport: unknown): string | null {
    return normalizeSportKey(divisionSport) ?? normalizeSportKey(clubSport);
}

export function sportHasFrontRow(sportId: unknown): boolean {
    return getPlayerPositionsForSport(sportId)?.hasFrontRow ?? false;
}

function fold(value: string) {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[\s_-]+/g, '')
        .toLowerCase();
}

/**
 * Encuentra el puesto a partir de lo que haya guardado: el código, la etiqueta
 * exacta, o una variante sin tildes ni espacios ("Medio Scrum", "segunda linea").
 */
export function findPlayerPosition(sportId: unknown, value: unknown): PlayerPosition | null {
    const catalog = getPlayerPositionsForSport(sportId);
    if (!catalog || typeof value !== 'string') return null;
    const wanted = fold(value);
    if (!wanted) return null;
    return catalog.positions.find((position) =>
        fold(position.code) === wanted || fold(position.label) === wanted || fold(position.short) === wanted,
    ) ?? null;
}

export { CATALOGS as ALL_PLAYER_POSITION_CATALOGS };
