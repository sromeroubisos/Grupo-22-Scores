/*
 * Road to Rugby World Cup: el camino de clasificación al Mundial 2027, con el
 * formato real (World Rugby):
 *
 *   - 12 clasificados por el Mundial 2023 (los tres primeros de cada grupo).
 *   - 10 lugares regionales:
 *       Europa      Rugby Europe Championship   4 directos · el 5.º al clasificatorio final
 *       África      Rugby Africa Cup            1 directo  · el 2.º al repechaje Asia-África
 *       Asia        Asia Rugby Championship     1 directo  · el 2.º al repechaje Asia-África
 *       Pacífico    Pacific Nations Cup         3 directos (sin contar Fiyi y Japón, ya adentro)
 *                                               · el 4.º al repechaje Pacífico-Sudamérica
 *       Sudamérica  Sudamérica Rugby Champ.     1 directo  · el 2.º al repechaje Pacífico-Sudamérica
 *                                               · el 3.º al clasificatorio final
 *   - Repechaje Asia-África (partido único): el ganador va al clasificatorio final.
 *   - Repechaje Pacífico-Sudamérica (ida y vuelta): el ganador va al Mundial; el
 *     que pierde, al clasificatorio final.
 *   - Clasificatorio final (cuadrangular, todos contra todos): el primero, al Mundial.
 *
 * Simplificaciones del juego: cada clasificatorio regional es una sola
 * competencia (en la realidad, África, Asia y Sudamérica llegan por rondas
 * previas), y el 3.º de Sudamérica va directo al clasificatorio final (en 2025
 * jugó antes un repechaje con Brasil).
 */

import { NATION_BY_CODE, REGION_BY_CODE } from './nations';
import type { Difficulty, Duration } from './teams';
import { createTour, finalRanking, playOut, ratingOf, teamIdOf, type TourDef, type TourState } from './tours';

export type RegionId = 'europa' | 'africa' | 'asia' | 'pacifico' | 'sudamerica';
type Dest = 'wc' | 'repAA' | 'repPS' | 'fqt' | null;

interface RegionDef {
    id: RegionId;
    name: string;
    tag: string; // "Europa 1", "Europa 2"...
    def: TourDef;
    /** Destino por puesto final (sin contar los de `skip`). */
    places: Dest[];
    /** Los que juegan pero ya están clasificados (Fiyi y Japón en el Pacífico). */
    skip?: string[];
}

/** Los 12 del Mundial 2023: los tres primeros de cada grupo (Australia, además, es la anfitriona). */
export const AUTO_QUALIFIED = ['RSA', 'ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL', 'AUS', 'FIJ', 'JPN', 'NZL', 'ARG'];

export const REGIONS: RegionDef[] = [
    {
        id: 'europa', name: 'Europa', tag: 'Europa',
        def: {
            id: 'road-europa', name: 'Rugby Europe Championship', sub: 'Clasificatorio europeo al Mundial.', source: 'real',
            formatLabel: '2 grupos de 4 · los dos primeros de cada grupo van al Mundial · el mejor tercero, al clasificatorio final',
            teams: ['GEO', 'ESP', 'POR', 'ROU', 'BEL', 'NED', 'GER', 'SUI'],
            stage: { kind: 'grupos', groups: 2, advance: 2, noKo: true },
        },
        places: ['wc', 'wc', 'wc', 'wc', 'fqt'],
    },
    {
        id: 'africa', name: 'África', tag: 'África',
        def: {
            id: 'road-africa', name: 'Rugby Africa Cup', sub: 'Clasificatorio africano al Mundial.', source: 'real',
            formatLabel: '2 grupos de 4 · semifinales y final · el campeón va al Mundial · el finalista, al repechaje Asia-África',
            teams: ['ZIM', 'NAM', 'KEN', 'ALG', 'UGA', 'CIV', 'SEN', 'ZAM'],
            stage: { kind: 'grupos', groups: 2, advance: 2 },
        },
        places: ['wc', 'repAA'],
    },
    {
        id: 'asia', name: 'Asia', tag: 'Asia',
        def: {
            id: 'road-asia', name: 'Asia Rugby Championship', sub: 'Clasificatorio asiático al Mundial.', source: 'real',
            formatLabel: 'Liga a una vuelta · el primero va al Mundial · el segundo, al repechaje Asia-África',
            teams: ['HKG', 'KOR', 'UAE', 'MAS'],
            stage: { kind: 'liga', legs: 1 },
        },
        places: ['wc', 'repAA'],
    },
    {
        id: 'pacifico', name: 'Pacífico y Norteamérica', tag: 'Pacífico',
        def: {
            id: 'road-pacifico', name: 'Pacific Nations Cup', sub: 'Clasificatorio del Pacífico y Norteamérica.', source: 'real',
            formatLabel: 'Liga a una vuelta · sin contar Fiyi y Japón, los tres primeros van al Mundial · el cuarto, al repechaje con Sudamérica',
            teams: ['FIJ', 'JPN', 'SAM', 'TGA', 'CAN', 'USA'],
            stage: { kind: 'liga', legs: 1 },
        },
        skip: ['FIJ', 'JPN'],
        places: ['wc', 'wc', 'wc', 'repPS'],
    },
    {
        id: 'sudamerica', name: 'Sudamérica', tag: 'Sudamérica',
        def: {
            id: 'road-sudamerica', name: 'Sudamérica Rugby Championship', sub: 'Clasificatorio sudamericano al Mundial.', source: 'real',
            formatLabel: 'Liga a una vuelta · el primero va al Mundial · el segundo, al repechaje con el Pacífico · el tercero, al clasificatorio final',
            teams: ['URU', 'CHI', 'PAR', 'BRA'],
            stage: { kind: 'liga', legs: 1 },
        },
        places: ['wc', 'repPS', 'fqt'],
    },
];

/** Región geográfica de nations.ts → clasificatorio al Mundial. */
const ROAD_OF_REGION: Record<string, RegionId> = {
    sudamerica: 'sudamerica',
    norteamerica: 'pacifico',
    pacifico: 'pacifico',
    oceania: 'pacifico',
    asia: 'asia',
    africa: 'africa',
    'africa-sur': 'africa',
    'europa-norte': 'europa',
    'europa-sur': 'europa',
    'europa-este': 'europa',
    'medio-oriente': 'europa',
};

export interface RoadSlot {
    team: string; // id de equipo
    via: string; // "Mundial 2023", "Europa 1", "Repechaje"...
}

export type RoadPhase = 'regional' | 'repAA' | 'repPS' | 'fqt' | 'wc';

export interface RoadState {
    v: 1;
    me: string; // id de la selección del usuario
    region: RegionId;
    phase: RoadPhase;
    slots: RoadSlot[]; // clasificados al Mundial hasta ahora
    repAA: string[]; // [Asia 2, África 2]
    repPS: string[]; // [Pacífico 4, Sudamérica 2]
    fqt: string[]; // al clasificatorio final
    done: { repAA: boolean; repPS: boolean; fqt: boolean };
    out: boolean; // el usuario quedó sin Mundial
    log: string[]; // lo que fue pasando, en orden
}

const codeOf = (id: string) => id.replace(/^nat-/, '').toUpperCase();
const nameOf = (id: string | undefined) => (id ? NATION_BY_CODE[codeOf(id)]?.name ?? id : '—');

/** Qué clasificatorio juega la selección: el suyo si está en uno de fábrica; si no, el de su zona. */
export function regionFor(code: string): RegionId {
    const listed = REGIONS.find((g) => g.def.teams.includes(code) && !(g.skip ?? []).includes(code));
    if (listed) return listed.id;
    return ROAD_OF_REGION[REGION_BY_CODE[code] ?? 'europa-norte'] ?? 'europa';
}

export function regionName(id: RegionId): string {
    return REGIONS.find((r) => r.id === id)?.name ?? id;
}

/** El clasificatorio de esa región, con la selección del usuario adentro (reemplaza a la más floja si hace falta). */
export function regionalDef(region: RegionId, meCode: string | null): TourDef {
    const rd = REGIONS.find((r) => r.id === region) ?? REGIONS[0];
    if (!meCode || rd.def.teams.includes(meCode)) return rd.def;
    const weakest = rd.def.teams
        .filter((c) => !(rd.skip ?? []).includes(c))
        .sort((a, b) => ratingOf(teamIdOf(a)) - ratingOf(teamIdOf(b)))[0];
    return { ...rd.def, teams: rd.def.teams.map((c) => (c === weakest ? meCode : c)) };
}

/** Reparte los puestos de un clasificatorio regional terminado. */
function applyRegion(r: RoadState, region: RegionId, ranking: string[]) {
    const rd = REGIONS.find((g) => g.id === region);
    if (!rd) return;
    const skip = (rd.skip ?? []).map(teamIdOf);
    const order = ranking.filter((id) => !skip.includes(id));
    let n = 0;
    rd.places.forEach((dest, i) => {
        const team = order[i];
        if (!team || !dest) return;
        if (dest === 'wc') {
            n += 1;
            r.slots.push({ team, via: `${rd.tag} ${n}` });
        } else if (dest === 'repAA') r.repAA.push(team);
        else if (dest === 'repPS') r.repPS.push(team);
        else r.fqt.push(team);
    });
    r.log.push(`${rd.def.name}: ganó ${nameOf(order[0])}.`);
}

const PLAYOFF_AA: TourDef = {
    id: 'road-rep-aa', name: 'Repechaje Asia-África', sub: 'Partido único.', source: 'real',
    formatLabel: 'Partido único · el ganador va al clasificatorio final', teams: [], stage: { kind: 'ko' },
};
const PLAYOFF_PS: TourDef = {
    id: 'road-rep-ps', name: 'Repechaje Pacífico-Sudamérica', sub: 'Ida y vuelta.', source: 'real',
    formatLabel: 'Ida y vuelta, por puntos y diferencia · el ganador va al Mundial · el que pierde, al clasificatorio final',
    teams: [], stage: { kind: 'liga', legs: 2 },
};
const FQT: TourDef = {
    id: 'road-fqt', name: 'Clasificatorio final', sub: 'Cuadrangular por el último lugar.', source: 'real',
    formatLabel: 'Todos contra todos · solo el primero va al Mundial', teams: [], stage: { kind: 'liga', legs: 1 },
};
const WC: TourDef = {
    id: 'road-wc', name: 'Rugby World Cup 2027', sub: 'Los 24 que clasificaron.', source: 'real',
    formatLabel: '6 grupos de 4 · pasan los dos primeros y los 4 mejores terceros · octavos', teams: [],
    stage: { kind: 'grupos', groups: 6, advance: 2, bestThirds: 4 },
};

const withTeams = (def: TourDef, ids: string[]): TourDef => ({ ...def, teams: ids.map(codeOf) });

function resolvePlayoff(r: RoadState, which: 'repAA' | 'repPS', s: TourState) {
    const [win, lose] = finalRanking(s);
    r.done[which] = true;
    if (which === 'repAA') {
        if (win) r.fqt.push(win);
        r.log.push(`Repechaje Asia-África: ${nameOf(win)} le ganó a ${nameOf(lose)} y va al clasificatorio final.`);
    } else {
        if (win) r.slots.push({ team: win, via: 'Repechaje' });
        if (lose) r.fqt.push(lose);
        r.log.push(`Repechaje Pacífico-Sudamérica: ${nameOf(win)} va al Mundial; ${nameOf(lose)}, al clasificatorio final.`);
    }
}

function resolveFqt(r: RoadState, s: TourState) {
    const [win] = finalRanking(s);
    r.done.fqt = true;
    if (win) r.slots.push({ team: win, via: 'Clasificatorio final' });
    r.log.push(`Clasificatorio final: ${nameOf(win)} se queda con el último lugar.`);
}

function stageTour(r: RoadState, def: TourDef, difficulty: Difficulty, duration: Duration): TourState {
    const s = createTour(def, r.me, difficulty, duration);
    return { ...s, def, road: r };
}

/** Arranca el camino: simula las otras regiones y devuelve el clasificatorio del usuario. */
export function createRoad(meId: string, difficulty: Difficulty, duration: Duration): TourState {
    const meCode = codeOf(meId);
    const region = regionFor(meCode);
    const r: RoadState = {
        v: 1, me: meId, region, phase: 'regional',
        slots: AUTO_QUALIFIED.map((c) => ({ team: teamIdOf(c), via: 'Mundial 2023' })),
        repAA: [], repPS: [], fqt: [], done: { repAA: false, repPS: false, fqt: false }, out: false,
        log: [],
    };
    for (const rd of REGIONS) {
        if (rd.id === region) continue;
        applyRegion(r, rd.id, finalRanking(playOut(rd.def)));
    }
    return stageTour(r, regionalDef(region, meCode), difficulty, duration);
}

/** Aplica el resultado de la etapa terminada (sin crear la siguiente). */
function settle(s: TourState): RoadState {
    const r: RoadState = JSON.parse(JSON.stringify(s.road));
    if (r.phase === 'regional') applyRegion(r, r.region, finalRanking(s));
    else if (r.phase === 'repAA' || r.phase === 'repPS') resolvePlayoff(r, r.phase, s);
    else if (r.phase === 'fqt') resolveFqt(r, s);
    return r;
}

/** Cuál es la próxima etapa del usuario con el camino así. */
function nextPhase(r: RoadState): RoadPhase | null {
    if (r.slots.some((x) => x.team === r.me)) return 'wc';
    if (!r.done.repAA && r.repAA.includes(r.me)) return 'repAA';
    if (!r.done.repPS && r.repPS.includes(r.me)) return 'repPS';
    if (!r.done.fqt && r.fqt.includes(r.me)) return 'fqt';
    return null;
}

/** El cartel al terminar la etapa, antes de seguir. */
export function roadVerdict(s: TourState): { title: string; text: string; next: string | null } {
    const r = s.road;
    if (!r) return { title: '', text: '', next: null };
    if (r.phase === 'wc') {
        if (s.champion === r.me) return { title: 'Campeón del mundo', text: 'Del clasificatorio a la copa.', next: null };
        return { title: 'Terminó el Mundial', text: s.eliminated ? 'Llegaste al Mundial y quedaste afuera en el camino.' : 'Jugaste el Mundial hasta el final.', next: null };
    }
    if (r.out) return { title: 'Sin Mundial', text: 'Esta vez no alcanzó. El camino terminó acá.', next: null };
    switch (nextPhase(settle(s))) {
        case 'wc':
            return { title: 'Clasificaste al Mundial', text: 'Australia 2027 te espera.', next: 'Ir al Mundial' };
        case 'repAA':
            return { title: 'Al repechaje', text: 'Partido único contra el segundo de la otra región. El que gana va al clasificatorio final.', next: 'Jugar el repechaje' };
        case 'repPS':
            return { title: 'Al repechaje', text: 'Ida y vuelta con el de la otra región. El que gana va al Mundial; el que pierde, al clasificatorio final.', next: 'Jugar el repechaje' };
        case 'fqt':
            return { title: 'Al clasificatorio final', text: 'Cuadrangular por el último lugar. Solo el primero va al Mundial.', next: 'Jugar el clasificatorio final' };
        default:
            return { title: 'Sin Mundial', text: 'Esta vez no alcanzó. El camino terminó acá.', next: 'Ver los 24 clasificados' };
    }
}

/** Simula lo que falte sin el usuario para poder armar la etapa siguiente. */
function simulatePending(r: RoadState, upTo: RoadPhase) {
    if (!r.done.repAA && !r.repAA.includes(r.me) && r.repAA.length === 2) resolvePlayoff(r, 'repAA', playOut(withTeams(PLAYOFF_AA, r.repAA)));
    if (!r.done.repPS && !r.repPS.includes(r.me) && r.repPS.length === 2) resolvePlayoff(r, 'repPS', playOut(withTeams(PLAYOFF_PS, r.repPS)));
    if (upTo === 'wc' && !r.done.fqt && !r.fqt.includes(r.me) && r.fqt.length >= 2) resolveFqt(r, playOut(withTeams(FQT, r.fqt.slice(0, 4))));
}

/**
 * Pasa a la etapa siguiente. Devuelve la nueva etapa jugable o, si el
 * usuario quedó afuera, la misma con el camino cerrado (y los 24 completos).
 */
export function advanceRoad(s: TourState): TourState {
    if (!s.road || !s.done || s.road.out || s.road.phase === 'wc') return s;
    const r = settle(s);
    const make = (phase: RoadPhase, def: TourDef) => stageTour({ ...r, phase }, def, s.difficulty, s.duration);
    const next = nextPhase(r);
    if (next) simulatePending(r, next);
    // El repechaje Pacífico-Sudamérica pudo mandar al usuario al clasificatorio final recién ahora.
    const after = nextPhase(r);
    if (after === 'wc') {
        simulatePending(r, 'wc');
        return make('wc', withTeams(WC, [...r.slots.map((x) => x.team)].sort((a, b) => ratingOf(b) - ratingOf(a))));
    }
    if (after === 'repAA') return make('repAA', withTeams(PLAYOFF_AA, r.repAA));
    if (after === 'repPS') return make('repPS', withTeams(PLAYOFF_PS, r.repPS));
    if (after === 'fqt') return make('fqt', withTeams(FQT, r.fqt.slice(0, 4)));
    simulatePending(r, 'wc');
    return { ...s, road: { ...r, out: true } };
}

/** Las selecciones que pueden hacer el camino: todas menos las ya clasificadas. */
export function roadEligible(code: string): boolean {
    return !AUTO_QUALIFIED.includes(code) && !!NATION_BY_CODE[code];
}

export function isRoadState(v: unknown): v is RoadState {
    const r = v as RoadState;
    return !!r && r.v === 1 && typeof r.me === 'string' && Array.isArray(r.slots);
}

export const PHASE_LABEL: Record<RoadPhase, string> = {
    regional: 'Clasificatorio regional',
    repAA: 'Repechaje',
    repPS: 'Repechaje',
    fqt: 'Clasificatorio final',
    wc: 'Mundial',
};
