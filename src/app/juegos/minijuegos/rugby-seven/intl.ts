/*
 * Carrera internacional: una selección de XV (varones o mujeres), año tras
 * año, con el calendario internacional real y el ranking de World Rugby en
 * vivo. El usuario dirige la unión: juega sus torneos, sube de división,
 * busca el Mundial y, en paralelo, desarrolla el rugby de su país.
 *
 * Calendario de cada año (varones):
 *   feb-mar   Six Nations · Rugby Europe Championship, Trophy y Conference
 *   abr-may   Sudamérica Rugby Championship y su B
 *   may       Asia Rugby Championship
 *   jun-jul   Rugby Africa Cup
 *   jul y nov Nations Championship (las 12 de arriba) y Nations Cup (las 12
 *             que siguen en el ranking), los años pares; el resto, ventanas de test
 *   ago-sep   Rugby Championship · Pacific Nations Cup
 *   sep-oct   Rugby World Cup (2027, 2031…)
 *   nov       repechajes del Mundial (el año anterior) · ventana de noviembre
 *
 * Mujeres: Women's Six Nations, Pacific Four y los regionales en el primer
 * semestre; WXV 1, 2 y 3 en septiembre-octubre (no en los años de Mundial);
 * el Mundial en 2029, 2033… Las 16 que lo juegan salen del ranking.
 *
 * Ascensos: en Europa, el último del Championship baja y sube el campeón del
 * Trophy (y lo mismo Trophy-Conference); en Sudamérica, el SRC con su B; en
 * el WXV, el último de cada escalón baja y sube el campeón del de abajo. Desde
 * 2030, el último del Nations Championship baja y sube el campeón de la
 * Nations Cup.
 *
 * Clasificación al Mundial de varones (el año anterior): las 12 mejores del
 * Mundial pasado van directo; el resto sale de los regionales, como en el
 * Road to RWC (Europa 4 + clasificatorio final, África y Asia 1 + repechaje,
 * Pacífico 3 + repechaje, Sudamérica 1 + repechaje + clasificatorio final).
 *
 * Ranking: la fórmula de intercambio de puntos de World Rugby (diferencia
 * tope de 10, 1,5 si se gana por más de 15, el doble en el Mundial). Las
 * ventanas de test de los otros no se simulan: sus puntos se mueven con los
 * torneos.
 *
 * Desarrollo: la unión invierte fondos en la liga local, la academia, el
 * staff y la red de elegibles. Los plazos son los del rugby: una liga tarda
 * dos años en subir de escalón; un juvenil entra a los 17 y llega a la
 * selección a los 20; un jugador por residencia es elegible recién a los 5
 * años (60 meses, la regla vigente de World Rugby). Las otras selecciones
 * también crecen o se estancan según el nivel en el que compiten.
 */

import { nameFromSeed } from './names';
import { FEM_NATIONS, NATIONS, NATION_BY_CODE } from './nations';
import type { Difficulty, Duration } from './teams';
import { createTour, finalRanking, playOut, setRatingBoost, teamIdOf, TOURS, type Stage, type TourDef, type TourState } from './tours';

export type Gender = 'm' | 'f';
export type Area = 'liga' | 'academia' | 'staff' | 'red';

export interface IntlPlayer {
    id: number;
    first: string;
    last: string;
    pos: 'fw' | 'bk';
    age: number;
    ovr: number;
    pot: number;
    caps: number;
    origin: 'local' | 'herencia' | 'residencia';
    /** Temporada desde la que puede jugar (los de residencia esperan 5 años). */
    from?: number;
    note?: string;
}

export interface Offer {
    id: number;
    kind: 'herencia' | 'residencia';
    first: string;
    last: string;
    pos: 'fw' | 'bk';
    age: number;
    ovr: number;
    pot: number;
    cost: number;
    note: string;
}

export interface SimComp {
    key: string;
    name: string;
    window: number;
    ranking: string[];
    results: [string, string, number, number][];
    mine?: boolean;
}

interface Quali {
    year: number;
    slots: { team: string; via: string }[];
    repAA: string[];
    repPS: string[];
    fqt: string[];
    done: { repAA: boolean; repPS: boolean; fqt: boolean };
}

export interface IntlState {
    v: 1;
    me: string;
    gender: Gender;
    season: number;
    /** Quién juega cada torneo regional (y, en mujeres, cada escalón del WXV). */
    comps: Record<string, string[]>;
    /** Las dos conferencias del Nations Championship (varones). */
    nc: [string[], string[]];
    /** Las 12 de la Nations Cup de este año. */
    ncup: string[];
    /** Nivel de juego de cada selección (lo que usa la simulación). */
    rating: Record<string, number>;
    /** Puntos del ranking al empezar el año. */
    points: Record<string, number>;
    /** Puesto en el ranking al empezar el año anterior (para las flechas). */
    prevPos: Record<string, number>;
    plan: string[];
    step: number;
    sims: SimComp[];
    wcField: Record<string, string[]>;
    wcTop12: string[];
    quali: Quali | null;
    union: { liga: number; academia: number; staff: number; red: number; fondos: number; talento: number; pend: { area: Area; ready: number }[] };
    squad: IntlPlayer[];
    youth: IntlPlayer[];
    offers: Offer[];
    nextId: number;
    history: { season: number; rank: number; text: string }[];
    titles: { season: number; label: string }[];
    log: string[];
    /** Lo que dejó el cierre del último año (para el cartel). */
    lastNotes?: string[];
}

/* ───────────────────────── catálogo ───────────────────────── */

interface CompInfo {
    name: string;
    window: number;
    month: string;
    tier: number; // 1 = élite … 4 = abajo (para los fondos y el crecimiento)
}

const COMPS: Record<string, CompInfo> = {
    // Varones
    six: { name: 'Six Nations', window: 2, month: 'Febrero-marzo', tier: 1 },
    rec: { name: 'Rugby Europe Championship', window: 2, month: 'Febrero-marzo', tier: 2 },
    trophy: { name: 'Rugby Europe Trophy', window: 2, month: 'Febrero-marzo', tier: 3 },
    conf: { name: 'Rugby Europe Conference', window: 2, month: 'Febrero-marzo', tier: 4 },
    src: { name: 'Sudamérica Rugby Championship', window: 4, month: 'Abril-mayo', tier: 3 },
    srb: { name: 'Sudamérica Rugby B', window: 4, month: 'Abril-mayo', tier: 4 },
    arc: { name: 'Asia Rugby Championship', window: 5, month: 'Mayo', tier: 3 },
    rac: { name: 'Rugby Africa Cup', window: 6, month: 'Junio-julio', tier: 3 },
    nc: { name: 'Nations Championship', window: 7, month: 'Julio y noviembre', tier: 1 },
    ncup: { name: 'Nations Cup', window: 7, month: 'Julio y noviembre', tier: 2 },
    julio: { name: 'Ventana de julio', window: 7, month: 'Julio', tier: 4 },
    rc: { name: 'Rugby Championship', window: 8, month: 'Agosto-septiembre', tier: 1 },
    pnc: { name: 'Pacific Nations Cup', window: 8, month: 'Agosto-septiembre', tier: 2 },
    wc: { name: 'Rugby World Cup', window: 9, month: 'Septiembre-octubre', tier: 1 },
    repAA: { name: 'Repechaje Asia-África', window: 10, month: 'Noviembre', tier: 3 },
    repPS: { name: 'Repechaje Pacífico-Sudamérica', window: 10, month: 'Noviembre', tier: 3 },
    fqt: { name: 'Clasificatorio final al Mundial', window: 11, month: 'Noviembre', tier: 3 },
    nov: { name: 'Ventana de noviembre', window: 11, month: 'Noviembre', tier: 4 },
    // Mujeres
    wrec: { name: 'Rugby Europe Women’s Championship', window: 2, month: 'Febrero-marzo', tier: 2 },
    wtrophy: { name: 'Rugby Europe Women’s Trophy', window: 2, month: 'Febrero-marzo', tier: 3 },
    wconf: { name: 'Rugby Europe Women’s Conference', window: 2, month: 'Febrero-marzo', tier: 4 },
    w6n: { name: 'Women’s Six Nations', window: 3, month: 'Marzo-mayo', tier: 1 },
    p4: { name: 'Pacific Four Series', window: 5, month: 'Mayo', tier: 1 },
    wasia: { name: 'Asia Rugby Women’s Championship', window: 5, month: 'Mayo', tier: 3 },
    wafrica: { name: 'Rugby Africa Women’s Cup', window: 5, month: 'Mayo', tier: 3 },
    woce: { name: 'Oceania Rugby Women’s Championship', window: 5, month: 'Mayo', tier: 3 },
    wam: { name: 'Americas Rugby Women’s Championship', window: 5, month: 'Mayo', tier: 4 },
    wwc: { name: 'Women’s Rugby World Cup', window: 8, month: 'Agosto-septiembre', tier: 1 },
    wxv1: { name: 'WXV 1', window: 9, month: 'Septiembre-octubre', tier: 1 },
    wxv2: { name: 'WXV 2', window: 9, month: 'Septiembre-octubre', tier: 2 },
    wxv3: { name: 'WXV 3', window: 9, month: 'Septiembre-octubre', tier: 3 },
};
export const compName = (key: string) => COMPS[key]?.name ?? key;
export const compMonth = (key: string) => COMPS[key]?.month ?? '';

const MEN_REGIONAL = ['six', 'rc', 'rec', 'trophy', 'conf', 'pnc', 'src', 'srb', 'arc', 'rac'];
const WOMEN_REGIONAL = ['w6n', 'p4', 'wrec', 'wtrophy', 'wconf', 'wasia', 'wafrica', 'woce', 'wam'];
const WXV = ['wxv1', 'wxv2', 'wxv3'];

const START: Record<Gender, Record<string, string[]>> = {
    m: {
        six: ['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL'],
        rc: ['ARG', 'AUS', 'NZL', 'RSA'],
        rec: ['GEO', 'ESP', 'POR', 'ROU', 'BEL', 'NED', 'GER', 'SUI'],
        trophy: ['CZE', 'SWE', 'LTU', 'UKR', 'DEN', 'CRO'],
        conf: ['AND', 'AUT', 'BUL', 'CYP', 'SLO', 'EST', 'FIN', 'GIB', 'GRE', 'ISR', 'KOS', 'LUX', 'MDA', 'MNE', 'NOR', 'SRB', 'TUR', 'MLT'],
        pnc: ['FIJ', 'JPN', 'SAM', 'TGA', 'CAN', 'USA'],
        src: ['URU', 'CHI', 'PAR', 'BRA'],
        srb: ['COL', 'PER', 'ECU', 'VEN', 'GUA', 'HON', 'DOM'],
        arc: ['HKG', 'KOR', 'UAE', 'MAS'],
        rac: ['ZIM', 'NAM', 'KEN', 'ALG', 'UGA', 'CIV', 'SEN', 'ZAM'],
    },
    f: {
        w6n: ['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL'],
        p4: ['NZL', 'AUS', 'CAN', 'USA'],
        wrec: ['ESP', 'NED', 'POR', 'BEL', 'SWE', 'GER'],
        wtrophy: ['CZE', 'POL', 'FIN', 'SUI', 'DEN', 'NOR'],
        wconf: ['AND', 'AUT', 'BUL', 'CYP', 'CRO', 'SLO', 'EST', 'GIB', 'GRE', 'ISR', 'KOS', 'LUX', 'MDA', 'MNE', 'SRB', 'TUR', 'UKR', 'LTU', 'MLT', 'GEO', 'ROU'],
        wasia: ['JPN', 'CHN', 'KAZ', 'HKG', 'KOR', 'MAS', 'UAE'],
        wafrica: ['RSA', 'KEN', 'UGA', 'ZIM', 'NAM', 'ALG', 'CIV', 'SEN', 'ZAM'],
        woce: ['FIJ', 'SAM', 'TGA'],
        wam: ['BRA', 'ARG', 'COL', 'CHI', 'URU', 'PAR', 'PER', 'VEN', 'ECU', 'GUA', 'HON', 'DOM', 'MEX'],
        wxv1: ['ENG', 'NZL', 'CAN', 'FRA', 'USA', 'IRL'],
        wxv2: ['AUS', 'ITA', 'SCO', 'WAL', 'JPN', 'RSA'],
        wxv3: ['FIJ', 'ESP', 'SAM', 'NED', 'KAZ', 'HKG'],
    },
};

const NC_START: [string[], string[]] = [['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL'], ['ARG', 'AUS', 'NZL', 'RSA', 'FIJ', 'JPN']];
/** Las 12 del Mundial 2023 que fueron directo al de 2027. */
const WC2027_AUTO = ['RSA', 'ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL', 'AUS', 'FIJ', 'JPN', 'NZL', 'ARG'];
const FEM_HOSTS: Record<number, string> = { 2029: 'AUS', 2033: 'USA' };

export const isWcYear = (g: Gender, y: number) => (g === 'm' ? (y - 2027) % 4 === 0 : (y - 2025) % 4 === 0);
const isNcYear = (y: number) => y % 2 === 0;

/* ───────────────────────── identidades ───────────────────────── */

const baseCode = (id: string) => id.replace(/^natf?-/, '').toUpperCase();
const codeOf = (id: string) => (id.startsWith('natf-') ? `${baseCode(id)}-F` : baseCode(id));
const idOf = (code: string, g: Gender) => teamIdOf(g === 'f' ? `${code}-F` : code);
const genderOf = (id: string): Gender => (id.startsWith('natf-') ? 'f' : 'm');
export const teamOf = (id: string) => NATION_BY_CODE[codeOf(id)];
const nameOf = (id: string) => teamOf(id)?.name ?? id;
const baseRating = (id: string) => teamOf(id)?.rating ?? 40;
const allOf = (g: Gender) => (g === 'f' ? FEM_NATIONS : NATIONS).map((t) => t.id);

/* ───────────────────────── azar y escalas ───────────────────────── */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Nivel de equipo (30-96) ↔ promedio de los 15 titulares (1-10). */
const ovrFor = (rating: number) => clamp(1 + (rating - 30) / 7, 1, 10);
const ratingFor = (avg: number) => clamp(30 + (avg - 1) * 7, 30, 96);

/* ───────────────────────── ranking de World Rugby ───────────────────────── */

/** Intercambio de puntos de World Rugby para un partido (sin localía: el juego no la registra). */
function exchange(pts: Record<string, number>, a: string, b: string, sa: number, sb: number, mult: number) {
    const pa = pts[a] ?? 40;
    const pb = pts[b] ?? 40;
    const d = clamp(pa - pb, -10, 10);
    let x = sa > sb ? 1 - d / 10 : sa < sb ? -(1 + d / 10) : -d / 10;
    if (Math.abs(sa - sb) > 15) x *= 1.5;
    x *= mult;
    pts[a] = pa + x;
    pts[b] = pb - x;
}

function resultsOf(t: TourState): [string, string, number, number][] {
    return [...t.groupHistory, ...t.koHistory].flatMap((h) => h.results.map((x) => [x.a, x.b, x.sa, x.sb] as [string, string, number, number]));
}

const multOf = (key: string) => (key === 'wc' || key === 'wwc' ? 2 : 1);

/** Los puntos con los torneos ya jugados hasta la ventana `upTo`. */
function pointsUpTo(r: IntlState, upTo: number): Record<string, number> {
    const pts = { ...r.points };
    for (const c of [...r.sims].filter((x) => x.window <= upTo).sort((a, b) => a.window - b.window)) {
        for (const [a, b, sa, sb] of c.results) exchange(pts, a, b, sa, sb, multOf(c.key));
    }
    return pts;
}

/** El ranking en vivo: lo jugado hasta la etapa en curso del usuario. */
export function liveRanking(r: IntlState): { id: string; pts: number; pos: number; prev: number | null }[] {
    const cur = COMPS[r.plan[r.step]]?.window ?? 12;
    const pts = pointsUpTo(r, cur - 0.5);
    // Lo que el usuario ya terminó en esta misma ventana también cuenta.
    for (const c of r.sims.filter((x) => x.mine && x.window >= cur - 0.5 && x.window <= cur)) for (const [a, b, sa, sb] of c.results) exchange(pts, a, b, sa, sb, multOf(c.key));
    return Object.entries(pts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, p], i) => ({ id, pts: Math.round(p * 100) / 100, pos: i + 1, prev: r.prevPos[id] ?? null }));
}

const rankedIds = (pts: Record<string, number>) => Object.keys(pts).sort((a, b) => pts[b] - pts[a]);

/* ───────────────────────── niveles para la simulación ───────────────────────── */

export function intlBoosts(r: IntlState): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(r.rating)) out[id] = v - baseRating(id);
    return out;
}

/* ───────────────────────── formatos ───────────────────────── */

function stageFor(n: number): Stage {
    if (n <= 2) return { kind: 'ko' };
    if (n <= 6) return { kind: 'liga', legs: 1 };
    if (n <= 8) return { kind: 'grupos', groups: 2, advance: 2 };
    if (n <= 12) return { kind: 'grupos', groups: 3, advance: 2, bestThirds: 2 };
    if (n <= 16) return { kind: 'grupos', groups: 4, advance: 2 };
    return { kind: 'grupos', groups: 4, advance: 1 };
}

const fmtLabel = (st: Stage) =>
    st.kind === 'ko'
        ? 'Eliminación directa'
        : st.kind === 'liga'
          ? st.legs === 2
              ? 'Todos contra todos, ida y vuelta'
              : 'Todos contra todos'
          : st.cross
            ? 'Dos conferencias: cada uno juega con los de la otra · final entre los primeros'
            : `${typeof st.groups === 'number' ? st.groups : st.groups.length} grupos · ${st.advance === 1 ? 'los primeros' : 'pasan dos'}${st.bestThirds ? ` y los ${st.bestThirds} mejores terceros` : ''} al cuadro`;

/** Las selecciones de un torneo este año. */
function teamsOf(r: IntlState, key: string): string[] {
    if (r.comps[key]) return r.comps[key];
    if (key === 'nc') return [...r.nc[0], ...r.nc[1]];
    if (key === 'ncup') return r.ncup;
    if (key === 'wc' || key === 'wwc') return r.wcField[r.season] ?? [];
    if (key === 'repAA') return r.quali?.repAA ?? [];
    if (key === 'repPS') return r.quali?.repPS ?? [];
    if (key === 'fqt') return (r.quali?.fqt ?? []).slice(0, 4);
    if (key === 'julio' || key === 'nov') return testTeams(r, key);
    return [];
}

/** En una ventana de test: el usuario y dos selecciones cercanas en el ranking. */
function testTeams(r: IntlState, key: string): string[] {
    const mine = r.points[r.me] ?? 40;
    const busy = new Set<string>([r.me]);
    // En julio no se cruza con las que juegan el Nations Championship o la Nations Cup.
    if (key === 'julio' && isNcYear(r.season) && r.gender === 'm') [...r.nc[0], ...r.nc[1], ...r.ncup].forEach((x) => busy.add(x));
    const near = Object.keys(r.points)
        .filter((id) => !busy.has(id))
        .sort((a, b) => Math.abs((r.points[a] ?? 0) - mine) - Math.abs((r.points[b] ?? 0) - mine) || a.localeCompare(b))
        .slice(key === 'nov' ? 2 : 0, key === 'nov' ? 4 : 2);
    return [r.me, ...near];
}

function defFor(r: IntlState, key: string): TourDef {
    const teams = teamsOf(r, key);
    const fem = r.gender === 'f';
    let stage: Stage;
    if (key === 'nc') stage = { kind: 'grupos', groups: [r.nc[0].map(codeOf), r.nc[1].map(codeOf)], advance: 1, cross: true };
    else if (key === 'rc') stage = { kind: 'liga', legs: 2 };
    else if (key === 'wc') stage = { kind: 'grupos', groups: 6, advance: 2, bestThirds: 4 };
    else if (key === 'wwc') stage = { kind: 'grupos', groups: 4, advance: 2 };
    else if (key === 'repPS') stage = { kind: 'liga', legs: 2 };
    else if (key === 'fqt' || key === 'julio' || key === 'nov') stage = { kind: 'liga', legs: 1 };
    else stage = stageFor(teams.length);
    const label = COMPS[key]?.name ?? key;
    const suffix = fem && !label.includes('Women') && !key.startsWith('wxv') ? ' femenino' : '';
    return { id: `intl-${key}-${r.season}`, name: `${label}${suffix} ${r.season}`, sub: COMPS[key]?.month ?? '', formatLabel: fmtLabel(stage), source: 'real', teams: teams.map(codeOf), stage };
}

function simulateComp(r: IntlState, key: string): SimComp {
    const t = playOut(defFor(r, key));
    return { key, name: compName(key), window: COMPS[key]?.window ?? 6, ranking: finalRanking(t), results: resultsOf(t) };
}

const simOf = (r: IntlState, key: string) => r.sims.find((c) => c.key === key) ?? null;

/* ───────────────────────── el año del usuario ───────────────────────── */

const regionalKeys = (g: Gender) => (g === 'm' ? MEN_REGIONAL : WOMEN_REGIONAL);
export const regionalOf = (r: IntlState, id: string) => regionalKeys(r.gender).find((k) => r.comps[k]?.includes(id)) ?? null;
const wxvOf = (r: IntlState, id: string) => WXV.find((k) => r.comps[k]?.includes(id)) ?? null;
const inNc = (r: IntlState, id: string) => [...r.nc[0], ...r.nc[1]].includes(id);

function computePlan(r: IntlState): string[] {
    const me = r.me;
    const keys: string[] = [];
    const reg = regionalOf(r, me);
    if (reg) keys.push(reg);
    const wcYear = isWcYear(r.gender, r.season);
    const inWc = wcYear && (r.wcField[r.season] ?? []).includes(me);
    if (r.gender === 'm') {
        const busyNc = isNcYear(r.season) && (inNc(r, me) || r.ncup.includes(me));
        if (isNcYear(r.season) && inNc(r, me)) keys.push('nc');
        else if (isNcYear(r.season) && r.ncup.includes(me)) keys.push('ncup');
        else keys.push('julio');
        if (inWc) keys.push('wc');
        if (!busyNc && !inWc) keys.push('nov');
    } else {
        if (inWc) keys.push('wwc');
        else if (!wcYear && wxvOf(r, me)) keys.push(wxvOf(r, me)!);
        else keys.push('nov');
    }
    return keys.sort((a, b) => (COMPS[a]?.window ?? 0) - (COMPS[b]?.window ?? 0));
}

/** Todo lo que el usuario no juega este año, simulado de entrada (así el año queda escrito). */
function simulateOthers(r: IntlState) {
    const mine = new Set(r.plan);
    const keys = [...regionalKeys(r.gender)];
    if (r.gender === 'm' && isNcYear(r.season)) keys.push('nc', 'ncup');
    if (r.gender === 'f' && !isWcYear('f', r.season)) keys.push(...WXV);
    if (isWcYear(r.gender, r.season)) keys.push(r.gender === 'm' ? 'wc' : 'wwc');
    for (const key of keys) {
        if (mine.has(key) || simOf(r, key)) continue;
        if (teamsOf(r, key).length < 2) continue;
        r.sims.push(simulateComp(r, key));
    }
}

/* ───────────────────────── clasificación al Mundial (varones) ───────────────────────── */

const PLACES: Record<string, ('wc' | 'repAA' | 'repPS' | 'fqt' | null)[]> = {
    rec: ['wc', 'wc', 'wc', 'wc', 'fqt'],
    rac: ['wc', 'repAA'],
    arc: ['wc', 'repAA'],
    pnc: ['wc', 'wc', 'wc', 'repPS'],
    src: ['wc', 'repPS', 'fqt'],
};

/** Cuando están los cinco regionales del año anterior al Mundial, arma los lugares. */
function qualiIfReady(r: IntlState) {
    // El Mundial 2027 ya tiene sus 24: la clasificación arranca con el ciclo 2031.
    if (r.gender !== 'm' || !isWcYear('m', r.season + 1) || r.quali || r.wcField[r.season + 1]) return;
    if (!Object.keys(PLACES).every((k) => simOf(r, k))) return;
    const auto = new Set(r.wcTop12);
    const q: Quali = { year: r.season + 1, slots: r.wcTop12.map((team) => ({ team, via: 'Mundial anterior' })), repAA: [], repPS: [], fqt: [], done: { repAA: false, repPS: false, fqt: false } };
    for (const [key, places] of Object.entries(PLACES)) {
        const order = simOf(r, key)!.ranking.filter((id) => !auto.has(id));
        places.forEach((dest, i) => {
            const team = order[i];
            if (!team || !dest) return;
            if (dest === 'wc') q.slots.push({ team, via: compName(key) });
            else q[dest].push(team);
        });
    }
    r.quali = q;
    progressQuali(r);
}

/** Juega los repechajes que no son del usuario y deja anotados los suyos. */
function progressQuali(r: IntlState) {
    const q = r.quali;
    if (!q || q.year !== r.season + 1) return;
    const need = (key: string) => {
        if (r.plan.includes(key)) return;
        const done = r.plan.slice(0, r.step + 1);
        const rest = [...r.plan.slice(r.step + 1), key].sort((a, b) => (COMPS[a]?.window ?? 0) - (COMPS[b]?.window ?? 0));
        r.plan = [...done, ...rest];
    };
    if (q.repAA.length < 2) q.done.repAA = true;
    if (q.repPS.length < 2) q.done.repPS = true;
    if (!q.done.repAA) {
        if (q.repAA.includes(r.me)) need('repAA');
        else settleRep(r, 'repAA', simulateComp(r, 'repAA'));
    }
    if (!q.done.repPS) {
        if (q.repPS.includes(r.me)) need('repPS');
        else settleRep(r, 'repPS', simulateComp(r, 'repPS'));
    }
    if (q.done.repAA && q.done.repPS && !q.done.fqt) {
        if (q.fqt.length < 2) q.done.fqt = true;
        else if (q.fqt.slice(0, 4).includes(r.me)) need('fqt');
        else settleRep(r, 'fqt', simulateComp(r, 'fqt'));
    }
    if (q.done.repAA && q.done.repPS && q.done.fqt && !r.wcField[q.year]) {
        const field = q.slots.map((x) => x.team);
        // Si faltara alguno (un regional corto), completa el ranking.
        for (const id of rankedIds(pointsUpTo(r, 12))) {
            if (field.length >= 24) break;
            if (!field.includes(id)) field.push(id);
        }
        r.wcField[q.year] = field.slice(0, 24);
    }
}

function settleRep(r: IntlState, key: 'repAA' | 'repPS' | 'fqt', c: SimComp) {
    const q = r.quali!;
    if (!simOf(r, key)) r.sims.push(c);
    const [win, lose] = c.ranking;
    q.done[key] = true;
    if (key === 'repAA') {
        if (win) q.fqt.push(win);
        r.log.push(`${r.season}: ${nameOf(win)} ganó el repechaje Asia-África y va al clasificatorio final.`);
    } else if (key === 'repPS') {
        if (win) q.slots.push({ team: win, via: 'Repechaje' });
        if (lose) q.fqt.push(lose);
        r.log.push(`${r.season}: ${nameOf(win)} ganó el repechaje Pacífico-Sudamérica y va al Mundial.`);
    } else {
        if (win) q.slots.push({ team: win, via: 'Clasificatorio final' });
        r.log.push(`${r.season}: ${nameOf(win)} se quedó con el último lugar del Mundial.`);
    }
}

/* ───────────────────────── la unión y el plantel ───────────────────────── */

const LEVELS: Record<Area, string[]> = {
    liga: ['Amateur', 'Liga nacional organizada', 'Semiprofesional', 'Liga profesional', 'Franquicia en una liga internacional', 'Liga de élite'],
    academia: ['Sin academia', 'Programa de desarrollo', 'Academia nacional', 'Centro de alto rendimiento', 'Red de academias regionales', 'Sistema de élite'],
    staff: ['Entrenador local', 'Staff semiprofesional', 'Staff profesional', 'Entrenador internacional', 'Staff de élite', 'Staff campeón del mundo'],
    red: ['Sin red', 'Contactos en el exterior', 'Red de scouting', 'Red mundial de elegibles'],
};
export const AREAS: Area[] = ['liga', 'academia', 'staff', 'red'];
export const AREA_LABEL: Record<Area, string> = { liga: 'Competencia local', academia: 'Academia y juveniles', staff: 'Staff técnico', red: 'Red de elegibles' };
export const AREA_HINT: Record<Area, string> = {
    liga: 'Hace crecer a todos y sube el techo de los juveniles. Tarda dos temporadas en subir un escalón.',
    academia: 'Más juveniles por año y con más techo. Rinde a los 3-4 años: entran a los 17 y llegan a la selección a los 20.',
    staff: 'Mejora a los jugadores de 18 a 28 años. Rige desde la temporada que viene.',
    red: 'Ofertas de jugadores elegibles por herencia (juegan ya) o por residencia (esperan 5 años).',
};
export const levelName = (a: Area, n: number) => LEVELS[a][n] ?? LEVELS[a][LEVELS[a].length - 1];
export const maxLevel = (a: Area) => LEVELS[a].length - 1;
export const upgradeCost = (a: Area, lvl: number) => ({ liga: 8, academia: 6, staff: 4, red: 3 })[a] * (lvl + 1);
export const upgradeYears = (a: Area) => (a === 'liga' ? 2 : a === 'red' ? 0 : 1);
const upkeep = (u: IntlState['union']) => u.liga * 1.5 + u.academia * 1 + u.staff * 0.8 + u.red * 0.5;
export const upkeepOf = (r: IntlState) => r1(upkeep(r.union));

function newPlayer(r: IntlState, team: string, age: number, ovr: number, pot: number, origin: IntlPlayer['origin']): IntlPlayer {
    const t = teamOf(team) ?? teamOf(r.me)!;
    const id = r.nextId++;
    const n = nameFromSeed(t, `${r.me}:intl:${id}:${Math.random()}`);
    return { id, first: n.first, last: n.last, pos: id % 2 ? 'fw' : 'bk', age, ovr: r1(clamp(ovr, 1, 10)), pot: r1(clamp(Math.max(pot, ovr), 1, 10)), caps: 0, origin };
}

const available = (r: IntlState) => r.squad.filter((p) => !p.from || p.from <= r.season);
/** Los 15 que juegan: los mejores disponibles. */
export const xv = (r: IntlState) => [...available(r)].sort((a, b) => b.ovr - a.ovr).slice(0, 15);
export const myLevel = (r: IntlState) => {
    const top = xv(r);
    return top.length ? Math.round(ratingFor(top.reduce((s, p) => s + p.ovr, 0) / top.length)) : 40;
};

function initialSquad(r: IntlState) {
    const target = ovrFor(baseRating(r.me));
    const ages = [20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 25, 26, 26, 26, 27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 31, 31, 32, 32, 33, 34];
    for (const age of ages) {
        const ovr = target + gauss() * 0.9 - (age < 23 ? 0.6 : age > 31 ? 0.3 : 0);
        r.squad.push(newPlayer(r, r.me, age, ovr, ovr + (age < 25 ? rnd(0.4, 1.6) : rnd(0, 0.3)), 'local'));
    }
    // Que los 15 titulares den el nivel de la selección.
    const top = xv(r);
    const shift = target - top.reduce((s, p) => s + p.ovr, 0) / top.length;
    for (const p of r.squad) {
        p.ovr = r1(clamp(p.ovr + shift, 1, 10));
        p.pot = r1(clamp(Math.max(p.pot + shift, p.ovr), 1, 10));
    }
    for (let i = 0; i < 4; i++) intake(r, 17 + (i % 3));
}

/** Un juvenil nuevo de la academia (entra a los 17; llega a la selección a los 20). */
function intake(r: IntlState, age = 17) {
    const u = r.union;
    const pot = clamp(u.talento + 0.42 * u.academia + 0.38 * u.liga + gauss() * 0.9, 1, 10);
    r.youth.push(newPlayer(r, r.me, age, pot - rnd(2.2, 3.2) + (age - 17) * 0.5, pot, 'local'));
}

/** Un año más para el plantel: crecen, se retiran, suben los juveniles. */
function developSquad(r: IntlState): string[] {
    const u = r.union;
    const notes: string[] = [];
    for (const p of r.squad) {
        let g: number;
        if (p.age <= 23) g = 0.15 + 0.07 * u.liga + 0.05 * u.academia + 0.04 * u.staff + rnd(-0.15, 0.2);
        else if (p.age <= 28) g = 0.04 + 0.03 * u.liga + 0.03 * u.staff + rnd(-0.1, 0.1);
        else if (p.age <= 30) g = rnd(-0.12, 0.04);
        else g = -0.2 - (p.age - 31) * 0.08 + rnd(-0.1, 0.05);
        p.ovr = r1(clamp(g > 0 ? Math.min(p.pot, p.ovr + g) : p.ovr + g, 1, 10));
        p.age += 1;
    }
    for (const p of r.youth) {
        p.ovr = r1(clamp(Math.min(p.pot, p.ovr + 0.35 + 0.1 * u.academia + 0.05 * u.liga + rnd(-0.1, 0.2)), 1, 10));
        p.age += 1;
    }
    // Retiros.
    const gone = r.squad.filter((p) => p.age >= 37 || (p.age >= 33 && Math.random() < 0.22 + (p.age - 33) * 0.2));
    r.squad = r.squad.filter((p) => !gone.includes(p));
    const stars = gone.filter((p) => p.caps >= 20).map((p) => `${p.first} ${p.last} (${p.caps} caps)`);
    if (stars.length) notes.push(`Se retiraron ${stars.join(', ')}.`);
    // Los de 20 suben a la selección.
    const up = r.youth.filter((p) => p.age >= 20);
    r.youth = r.youth.filter((p) => p.age < 20);
    r.squad.push(...up);
    if (up.length) notes.push(`${up.length === 1 ? 'Llega' : 'Llegan'} de la academia: ${up.map((p) => `${p.first} ${p.last}`).join(', ')}.`);
    // Los de residencia que cumplieron los 5 años.
    const ready = r.squad.filter((p) => p.origin === 'residencia' && p.from === r.season + 1);
    if (ready.length) notes.push(`Ya son elegibles por residencia: ${ready.map((p) => `${p.first} ${p.last}`).join(', ')}.`);
    // Plantel de 40 como mucho: se van los de menos nivel (nunca los de residencia que esperan).
    while (r.squad.length > 40) {
        const worst = [...r.squad].filter((p) => !(p.from && p.from > r.season + 1)).sort((a, b) => a.ovr - b.ovr || b.age - a.age)[0];
        if (!worst) break;
        r.squad = r.squad.filter((p) => p !== worst);
    }
    // Camada nueva.
    const n = Math.min(9, 2 + u.academia + Math.floor(u.liga / 2));
    for (let i = 0; i < n; i++) intake(r);
    return notes;
}

const ORIGIN_COUNTRIES = ['NZL', 'AUS', 'RSA', 'ENG', 'FRA', 'ARG', 'IRL', 'USA', 'CAN'];

function makeOffers(r: IntlState) {
    r.offers = [];
    const lvl = r.union.red;
    const avg = ovrFor(myLevel(r));
    const n = lvl + (lvl > 0 ? 1 : 0);
    for (let i = 0; i < n; i++) {
        const from = ORIGIN_COUNTRIES[Math.floor(Math.random() * ORIGIN_COUNTRIES.length)];
        const fromId = idOf(from, r.gender);
        if (fromId === r.me) continue;
        const id = r.nextId++;
        const nm = nameFromSeed(teamOf(fromId) ?? teamOf(r.me)!, `${r.me}:oferta:${id}:${Math.random()}`);
        const pos: 'fw' | 'bk' = Math.random() < 0.5 ? 'fw' : 'bk';
        if (i % 2 === 0) {
            const ovr = clamp(avg + 0.4 + Math.random() * 1.6 + lvl * 0.3, 1, 9.6);
            r.offers.push({ id, kind: 'herencia', first: nm.first, last: nm.last, pos, age: Math.round(rnd(22, 29)), ovr: r1(ovr), pot: r1(clamp(ovr + 0.3, 1, 10)), cost: Math.round(2 + ovr / 2), note: `Juega en ${nameOf(fromId)}; ${Math.random() < 0.5 ? 'su madre' : 'un abuelo'} es de ${nameOf(r.me)}. Elegible ya.` });
        } else {
            const pot = clamp(avg + 1 + Math.random() * 2 + lvl * 0.3, 1, 9.8);
            r.offers.push({ id, kind: 'residencia', first: nm.first, last: nm.last, pos, age: Math.round(rnd(19, 21)), ovr: r1(pot - 1.6), pot: r1(pot), cost: 3, note: `Nacido en ${nameOf(fromId)}. Si se instala ahora, es elegible por residencia en ${r.season + 1 + 5} (60 meses).` });
        }
    }
}

/* ───────────────────────── acciones ───────────────────────── */

export function intlInvest(s: TourState, area: Area): TourState {
    if (!s.intl) return s;
    const r: IntlState = JSON.parse(JSON.stringify(s.intl));
    const u = r.union;
    const lvl = u[area] + u.pend.filter((p) => p.area === area).length;
    if (lvl >= maxLevel(area)) return s;
    const cost = upgradeCost(area, lvl);
    if (u.fondos < cost) return s;
    u.fondos = r1(u.fondos - cost);
    const years = upgradeYears(area);
    if (years === 0) u[area] += 1;
    else u.pend.push({ area, ready: r.season + years });
    if (area === 'red') makeOffers(r);
    return { ...s, intl: r };
}

export function intlSign(s: TourState, offerId: number): TourState {
    if (!s.intl) return s;
    const r: IntlState = JSON.parse(JSON.stringify(s.intl));
    const o = r.offers.find((x) => x.id === offerId);
    if (!o || r.union.fondos < o.cost) return s;
    r.union.fondos = r1(r.union.fondos - o.cost);
    r.offers = r.offers.filter((x) => x.id !== offerId);
    r.squad.push({ id: o.id, first: o.first, last: o.last, pos: o.pos, age: o.age, ovr: o.ovr, pot: o.pot, caps: 0, origin: o.kind, from: o.kind === 'residencia' ? r.season + 1 + 5 : undefined, note: o.note });
    r.rating[r.me] = myLevel(r);
    return { ...s, intl: r };
}

/* ───────────────────────── temporadas ───────────────────────── */

/** Los fondos que recibe la unión: por el escalón en el que compite, el ranking y el Mundial. */
export function income(r: IntlState): number {
    const keys = [regionalOf(r, r.me), ...r.plan].filter((k): k is string => !!k);
    const tier = Math.min(4, ...keys.map((k) => COMPS[k]?.tier ?? 4));
    const base = [0, 30, 20, 13, 9][tier];
    const pos = liveRanking(r).find((x) => x.id === r.me)?.pos ?? 99;
    const rank = pos <= 10 ? 10 : pos <= 20 ? 6 : pos <= 30 ? 3 : pos <= 40 ? 1 : 0;
    const wc = (r.wcField[r.season] ?? []).includes(r.me) ? 5 : 0;
    return base + rank + wc;
}

function stageTour(r: IntlState, difficulty: Difficulty, duration: Duration): TourState {
    setRatingBoost(intlBoosts(r));
    const d = defFor(r, r.plan[r.step]);
    return { ...createTour(d, r.me, difficulty, duration), def: d, intl: r };
}

function startSeason(r: IntlState) {
    setRatingBoost(intlBoosts(r));
    r.sims = [];
    r.step = 0;
    if (r.gender === 'm' && isNcYear(r.season)) {
        r.ncup = rankedIds(r.points)
            .filter((id) => !inNc(r, id))
            .slice(0, 12);
    } else r.ncup = [];
    r.plan = computePlan(r);
    simulateOthers(r);
    qualiIfReady(r);
}

export function createIntl(meId: string, difficulty: Difficulty, duration: Duration): TourState {
    const g = genderOf(meId);
    const ids = allOf(g);
    const comps: Record<string, string[]> = {};
    for (const [k, codes] of Object.entries(START[g])) comps[k] = codes.map((c) => idOf(c, g)).filter((id) => ids.includes(id));
    // Si alguna selección quedara sin torneo, va al de abajo de Europa.
    const listed = new Set(Object.entries(comps).filter(([k]) => !WXV.includes(k)).flatMap(([, v]) => v));
    for (const id of ids) if (!listed.has(id)) comps[g === 'm' ? 'conf' : 'wconf'].push(id);
    const rating: Record<string, number> = {};
    const points: Record<string, number> = {};
    for (const id of ids) {
        rating[id] = baseRating(id);
        points[id] = baseRating(id);
    }
    const base = baseRating(meId);
    const lvl = base >= 85 ? 4 : base >= 75 ? 3 : base >= 60 ? 2 : base >= 45 ? 1 : 0;
    const r: IntlState = {
        v: 1, me: meId, gender: g, season: 2026, comps,
        nc: [NC_START[0].map((c) => idOf(c, g)), NC_START[1].map((c) => idOf(c, g))], ncup: [],
        rating, points, prevPos: {}, plan: [], step: 0, sims: [],
        wcField: g === 'm' ? { 2027: (TOURS[0]?.teams ?? []).map((c) => idOf(c, 'm')) } : {},
        wcTop12: WC2027_AUTO.map((c) => idOf(c, 'm')),
        quali: null,
        union: { liga: lvl, academia: lvl, staff: lvl, red: 0, fondos: 10, talento: r1(ovrFor(base) - 0.8), pend: [] },
        squad: [], youth: [], offers: [], nextId: 1, history: [], titles: [], log: [],
    };
    initialSquad(r);
    r.rating[meId] = myLevel(r);
    makeOffers(r);
    startSeason(r);
    return stageTour(r, difficulty, duration);
}

/** Promociones: el último de `up` cambia de lugar con el campeón de `down`. */
function swap(r: IntlState, up: string, down: string): string | null {
    const su = simOf(r, up);
    const sd = simOf(r, down);
    if (!su || !sd || !r.comps[up] || !r.comps[down]) return null;
    const last = su.ranking[su.ranking.length - 1];
    const champ = sd.ranking[0];
    if (!last || !champ || last === champ) return null;
    r.comps[up] = r.comps[up].map((x) => (x === last ? champ : x));
    r.comps[down] = r.comps[down].map((x) => (x === champ ? last : x));
    r.log.push(`${r.season}: ${nameOf(champ)} sube al ${compName(up)}; ${nameOf(last)} baja al ${compName(down)}.`);
    if (champ === r.me) return `Ascenso: el año que viene jugás el ${compName(up)}.`;
    if (last === r.me) return `Descenso: el año que viene jugás el ${compName(down)}.`;
    return null;
}

const NO_TITLE = new Set(['julio', 'nov', 'repAA', 'repPS', 'fqt']);

function closeSeason(r: IntlState): string[] {
    setRatingBoost(intlBoosts(r));
    const notes: string[] = [];
    progressQuali(r);
    // El ranking con todo el año.
    r.prevPos = Object.fromEntries(rankedIds(r.points).map((id, i) => [id, i + 1]));
    r.points = pointsUpTo(r, 12);
    const pos = rankedIds(r.points).indexOf(r.me) + 1;

    // Títulos y campeones.
    for (const c of r.sims) {
        if (NO_TITLE.has(c.key) || !c.ranking[0]) continue;
        if (c.ranking[0] === r.me) r.titles.push({ season: r.season, label: c.key === 'wc' || c.key === 'wwc' ? `Campeón del mundo (${compName(c.key)})` : `Campeón del ${compName(c.key)}` });
        r.log.push(`${r.season}: ${nameOf(c.ranking[0])} campeón del ${compName(c.key)}.`);
    }
    // Mundial de varones: las 12 primeras van directo al que viene.
    const wc = simOf(r, 'wc');
    if (wc && r.gender === 'm') r.wcTop12 = wc.ranking.slice(0, 12);

    // Ascensos y descensos.
    const moves = r.gender === 'm' ? [['rec', 'trophy'], ['trophy', 'conf'], ['src', 'srb']] : [['wrec', 'wtrophy'], ['wtrophy', 'wconf']];
    for (const [up, down] of moves) {
        const n = swap(r, up, down);
        if (n) notes.push(n);
    }
    if (r.gender === 'f' && !isWcYear('f', r.season)) {
        for (const [up, down] of [['wxv1', 'wxv2'], ['wxv2', 'wxv3']]) {
            const n = swap(r, up, down);
            if (n) notes.push(n);
        }
        // Al WXV 3 entra la mejor campeona regional que no está en el WXV.
        const w3 = simOf(r, 'wxv3');
        const inWxv = new Set(WXV.flatMap((k) => r.comps[k] ?? []));
        const champs = WOMEN_REGIONAL.map((k) => simOf(r, k)?.ranking[0]).filter((x): x is string => !!x && !inWxv.has(x));
        const best = champs.sort((a, b) => (r.points[b] ?? 0) - (r.points[a] ?? 0))[0];
        const last = w3?.ranking[w3.ranking.length - 1];
        if (best && last && r.comps.wxv3) {
            r.comps.wxv3 = r.comps.wxv3.map((x) => (x === last ? best : x));
            r.log.push(`${r.season}: ${nameOf(best)} entra al WXV 3; ${nameOf(last)} sale.`);
            if (best === r.me) notes.push('Entrás al WXV 3 el año que viene.');
            if (last === r.me) notes.push('Salís del WXV: el año que viene, solo el regional y los test.');
        }
    }
    if (r.gender === 'm' && isNcYear(r.season) && r.season >= 2030) {
        const nc = simOf(r, 'nc');
        const cup = simOf(r, 'ncup');
        const last = nc?.ranking[nc.ranking.length - 1];
        const champ = cup?.ranking[0];
        if (last && champ && !inNc(r, champ)) {
            r.nc = [r.nc[0].map((x) => (x === last ? champ : x)), r.nc[1].map((x) => (x === last ? champ : x))];
            r.log.push(`${r.season}: ${nameOf(champ)} sube al Nations Championship; ${nameOf(last)} baja.`);
            if (champ === r.me) notes.push('Ascenso al Nations Championship: entrás a la élite.');
            if (last === r.me) notes.push('Bajás del Nations Championship a la Nations Cup.');
        }
    }
    // Mundial de mujeres: las 16 del ranking (con la anfitriona adentro).
    if (r.gender === 'f' && isWcYear('f', r.season + 1)) {
        const host = FEM_HOSTS[r.season + 1] ? idOf(FEM_HOSTS[r.season + 1], 'f') : null;
        const field = [...(host ? [host] : []), ...rankedIds(r.points).filter((x) => x !== host)].slice(0, 16);
        r.wcField[r.season + 1] = field;
        notes.push(field.includes(r.me) ? `Clasificaste al Mundial ${r.season + 1}.` : `Sin Mundial ${r.season + 1}: entran las 16 mejores del ranking.`);
    }
    if (r.gender === 'm' && r.quali?.year === r.season + 1 && r.wcField[r.quali.year]) notes.push(r.wcField[r.quali.year].includes(r.me) ? `Clasificaste al Mundial ${r.quali.year}.` : `Sin Mundial ${r.quali.year}.`);

    // Las otras selecciones crecen o se estancan según dónde compiten.
    const tierOf = (id: string) =>
        Math.min(
            4,
            ...Object.entries(r.comps)
                .filter(([, v]) => v.includes(id))
                .map(([k]) => COMPS[k]?.tier ?? 4),
            r.gender === 'm' && inNc(r, id) ? 1 : 4,
        );
    for (const id of Object.keys(r.rating)) {
        if (id === r.me) continue;
        const push = [0, 0.35, 0.25, 0.12, 0.05][tierOf(id)];
        r.rating[id] = r1(clamp(r.rating[id] + push - (r.rating[id] - baseRating(id)) * 0.06 + gauss() * 1.1, 30, 96));
    }

    // La unión: fondos, obras que se terminan, cultura de rugby que crece.
    const u = r.union;
    const inc = income(r);
    const cost = upkeep(u);
    u.fondos = r1(u.fondos + inc - cost);
    notes.push(`Fondos: +${inc} (World Rugby, ranking y Mundial), −${r1(cost)} de mantenimiento.`);
    for (const p of u.pend.filter((x) => x.ready <= r.season + 1)) {
        u[p.area] = Math.min(maxLevel(p.area), u[p.area] + 1);
        notes.push(`${AREA_LABEL[p.area]}: ${levelName(p.area, u[p.area]).toLowerCase()}.`);
    }
    u.pend = u.pend.filter((x) => x.ready > r.season + 1);
    if (u.fondos < 0) {
        const area = (['red', 'staff', 'academia', 'liga'] as Area[]).find((a) => u[a] > 0);
        if (area) {
            u[area] -= 1;
            notes.push(`Sin fondos para sostenerlo todo: ${AREA_LABEL[area].toLowerCase()} baja a ${levelName(area, u[area]).toLowerCase()}.`);
        }
        u.fondos = 0;
    }
    u.talento = r1(clamp(u.talento + 0.08 * u.liga + 0.05 * u.academia, 1, 8.5));
    notes.push(...developSquad(r));

    // El año, en una línea.
    const mine = r.sims.filter((c) => c.mine && !NO_TITLE.has(c.key)).map((c) => `${c.ranking.indexOf(r.me) + 1}.º en el ${c.name}`);
    r.history.push({ season: r.season, rank: pos, text: [`${pos}.º del ranking`, ...mine].join(' · ') });
    r.season += 1;
    if (r.quali && r.quali.year < r.season) r.quali = null;
    r.rating[r.me] = myLevel(r);
    makeOffers(r);
    startSeason(r);
    return notes;
}

/* ───────────────────────── etapas ───────────────────────── */

function settle(s: TourState): IntlState {
    const r: IntlState = JSON.parse(JSON.stringify(s.intl));
    setRatingBoost(intlBoosts(r));
    const key = r.plan[r.step];
    if (!r.sims.some((c) => c.key === key && c.mine)) {
        const c: SimComp = { key, name: compName(key), window: COMPS[key]?.window ?? 6, ranking: finalRanking(s), results: resultsOf(s), mine: true };
        if (key === 'repAA' || key === 'repPS' || key === 'fqt') settleRep(r, key, c);
        else r.sims.push(c);
        // Caps: los 15 que juegan suman los partidos del torneo.
        const games = c.results.filter(([a, b]) => a === r.me || b === r.me).length;
        for (const p of xv(r)) {
            const q = r.squad.find((x) => x.id === p.id);
            if (q) q.caps += games;
        }
    }
    qualiIfReady(r);
    progressQuali(r);
    return r;
}

/** El cartel al terminar una etapa. */
export function intlVerdict(s: TourState): { title: string; text: string; next: string } {
    const r = settle(s);
    const key = r.plan[r.step];
    const c = r.sims.find((x) => x.key === key);
    const place = c ? c.ranking.indexOf(r.me) + 1 : 0;
    let title = place === 1 ? `Campeón del ${compName(key)}` : `${place}.º en el ${compName(key)}`;
    if (key === 'julio' || key === 'nov') title = `${compName(key)}: ${place}.º`;
    if (key === 'wc' || key === 'wwc') title = place === 1 ? 'Campeón del mundo' : `${place}.º en el Mundial`;
    const live = liveRanking(r).find((x) => x.id === r.me);
    const parts = [`Ranking World Rugby: ${live?.pos ?? '—'}.º (${live ? live.pts.toFixed(2) : '—'} puntos).`];
    const q = r.quali;
    if (q && q.year === r.season + 1) {
        if (q.slots.some((x) => x.team === r.me)) parts.push(`Clasificado al Mundial ${q.year}.`);
        else if ([...q.repAA, ...q.repPS, ...q.fqt].includes(r.me) && r.plan.slice(r.step + 1).some((k) => k === 'repAA' || k === 'repPS' || k === 'fqt')) parts.push('Vas al repechaje del Mundial.');
    }
    const next = r.step + 1 < r.plan.length ? `Jugar: ${compName(r.plan[r.step + 1])}` : `Cerrar el ${r.season} y pasar al ${r.season + 1}`;
    return { title, text: parts.join(' '), next };
}

/** Pasa a la etapa siguiente o, terminado el año, al que viene. */
export function advanceIntl(s: TourState): TourState {
    if (!s.intl || !s.done) return s;
    const r = settle(s);
    if (r.step + 1 < r.plan.length) {
        r.step += 1;
        r.lastNotes = undefined;
        return stageTour(r, s.difficulty, s.duration);
    }
    const notes = closeSeason(r);
    r.lastNotes = notes;
    return stageTour(r, s.difficulty, s.duration);
}

/** Los siete que salen a la cancha (los nombres del plantel propio). */
export function intlNames(r: IntlState): { first: string; last: string; short: string }[] {
    return xv(r)
        .slice(0, 7)
        .map((p) => ({ first: p.first, last: p.last, short: `${p.first[0]}. ${p.last}` }));
}

/** El calendario del año del usuario, con lo jugado. */
export function intlCalendar(r: IntlState, done: boolean): { key: string; name: string; month: string; state: 'done' | 'live' | 'next'; place?: number }[] {
    return r.plan.map((key, i) => {
        const c = r.sims.find((x) => x.key === key && x.mine);
        const state: 'done' | 'live' | 'next' = i < r.step || (i === r.step && done) ? 'done' : i === r.step ? 'live' : 'next';
        return { key, name: compName(key), month: compMonth(key), state, place: c ? c.ranking.indexOf(r.me) + 1 : undefined };
    });
}

/** Los campeones de los otros torneos del año que ya se jugaron (hasta la ventana del usuario). */
export function intlOthers(r: IntlState, done = false): { name: string; month: string; champion: string }[] {
    // Lo de la misma ventana se ve recién cuando el usuario terminó lo suyo: se juega en simultáneo.
    const cur = COMPS[r.plan[r.step]]?.window ?? 12;
    return r.sims
        .filter((c) => !c.mine && (done ? c.window <= cur : c.window < cur) && c.ranking[0] && !NO_TITLE.has(c.key))
        .sort((a, b) => a.window - b.window)
        .map((c) => ({ name: c.name, month: compMonth(c.key), champion: c.ranking[0] }));
}

/** Dónde arranca una selección (para la pantalla de inicio). */
export function intlStartComp(id: string): string {
    const g = genderOf(id);
    const code = baseCode(id);
    const key = Object.entries(START[g]).find(([k, v]) => !WXV.includes(k) && v.includes(code))?.[0];
    return compName(key ?? (g === 'm' ? 'conf' : 'wconf'));
}

/** Las divisiones de la zona del usuario, de arriba hacia abajo (para mostrar el camino). */
export function intlLadder(r: IntlState): { key: string; name: string; teams: string[] }[] {
    const keys = r.gender === 'm' ? ['six', 'rec', 'trophy', 'conf', 'rc', 'pnc', 'src', 'srb', 'arc', 'rac'] : ['wxv1', 'wxv2', 'wxv3', 'w6n', 'p4', 'wrec', 'wtrophy', 'wconf', 'wasia', 'wafrica', 'woce', 'wam'];
    const out = keys.filter((k) => r.comps[k]?.length).map((k) => ({ key: k, name: compName(k), teams: r.comps[k] }));
    if (r.gender === 'm') out.unshift({ key: 'nc', name: 'Nations Championship', teams: [...r.nc[0], ...r.nc[1]] });
    return out;
}
