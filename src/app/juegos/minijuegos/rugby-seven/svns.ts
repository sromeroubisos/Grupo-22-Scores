/*
 * Circuito SVNS: una selección de seven, temporada tras temporada, desde su
 * regional hasta la élite. Es el formato de tres divisiones que World Rugby
 * estrenó en 2026, igual para varones y mujeres:
 *
 *   - Regionales: Rugby Europe Sevens, Sudamericano de Seven, RAN Sevens
 *     (Norteamérica y el Caribe), Asia Rugby Sevens, Rugby Africa Sevens y
 *     Oceania Sevens. El campeón de cada uno va al SVNS 3.
 *   - SVNS 3: 8 selecciones (los 6 campeones regionales y las 2 que bajaron
 *     del SVNS 2), un solo torneo. Las dos primeras suben al SVNS 2.
 *   - SVNS 2: 6 selecciones, tres etapas que suman puntos. Las cuatro primeras
 *     juegan el SVNS World Championship; la 5.ª y la 6.ª bajan al SVNS 3.
 *   - SVNS 1: 8 selecciones, seis etapas que suman puntos. La que más suma es
 *     la campeona del circuito.
 *   - SVNS World Championship: las 8 del SVNS 1 y las 4 mejores del SVNS 2.
 *     Las 8 primeras juegan el SVNS 1 del año siguiente; las otras 4, el SVNS 2.
 *
 * Simplificación del juego: en un regional que no tiene a nadie (las fuertes
 * ya están en el circuito), su lugar en el SVNS 3 lo toma el mejor subcampeón.
 *
 * Los niveles: en seven no manda el pack. Fiyi, Nueva Zelanda o Kenia valen
 * más que en el XV; Italia o Gales, menos. SEVENS_RATING ajusta a los varones
 * (las mujeres ya tienen su nivel de seven en nations.ts).
 */

import { NATION_BY_CODE, REGION_BY_CODE } from './nations';
import type { Difficulty, Duration } from './teams';
import { createTour, finalRanking, playOut, ratingOf, setRatingBoost, teamIdOf, type TourDef, type TourState } from './tours';

export type Gender = 'm' | 'f';
export type SvnsTier = 'reg' | 's3' | 's2' | 's1';
export type SvnsPhase = 'regional' | 's3' | 's2' | 's1' | 'wc';
export type SevensRegion = 'europa' | 'sudamerica' | 'norte' | 'asia' | 'africa' | 'oceania';

export interface SvnsHistory {
    season: number;
    tier: SvnsTier;
    /** Cómo le fue: "3.º del SVNS 1", "1.º del Sudamericano de Seven"... */
    text: string;
}

export interface SvnsState {
    v: 1;
    me: string; // id de equipo (nat-arg / natf-arg)
    gender: Gender;
    season: number;
    s1: string[]; // las 8 del SVNS 1 de esta temporada
    s2: string[]; // las 6 del SVNS 2
    s3direct: string[]; // las 2 que bajaron del SVNS 2: van directo al SVNS 3
    tier: SvnsTier; // dónde arranca el usuario esta temporada
    phase: SvnsPhase;
    leg: number; // etapa del SVNS 1 o 2 que se está jugando (1…)
    pts: Record<string, number>; // puntos del circuito del usuario, esta temporada
    /** Lo que ya se definió esta temporada (rankings finales). */
    res: { regional?: Record<string, string[]>; s3?: string[]; s2?: string[]; s1?: string[]; wc?: string[] };
    history: SvnsHistory[];
    titles: { season: number; label: string }[];
    log: string[];
}

export const SVNS_LEGS: Record<'s1' | 's2', number> = { s1: 6, s2: 3 };
/** Puntos por puesto en cada etapa (del 1.º al 8.º). */
const LEG_POINTS = [20, 18, 16, 14, 12, 10, 8, 6];

export const TIER_LABEL: Record<SvnsTier, string> = { reg: 'Regional', s3: 'SVNS 3', s2: 'SVNS 2', s1: 'SVNS 1' };
export const SVNS_PHASE_LABEL: Record<SvnsPhase, string> = { regional: 'Regional', s3: 'SVNS 3', s2: 'SVNS 2', s1: 'SVNS 1', wc: 'SVNS World Championship' };

/* ───────────────────────── niveles de seven ───────────────────────── */

/** Nivel de seven de los varones (el XV no sirve: el seven premia la velocidad, no el scrum). */
const SEVENS_RATING: Record<string, number> = {
    FIJ: 92, NZL: 91, ARG: 90, RSA: 89, FRA: 88, AUS: 86, IRL: 84, ENG: 84, ESP: 82, USA: 80, KEN: 77, SAM: 76,
    URU: 74, CAN: 72, GER: 71, SCO: 70, CHI: 68, JPN: 68, TGA: 67, HKG: 66, POR: 66, UGA: 65, WAL: 64, BEL: 64,
    ITA: 62, GEO: 62, ZIM: 62, PAR: 60, BRA: 58, KOR: 58, NAM: 55, COL: 56, ROU: 56, UAE: 52, MAS: 54, ZAM: 50,
};

/** Lo que hay que sumarle o restarle a cada selección para que juegue con su nivel de seven. */
export function svnsBoosts(r: Pick<SvnsState, 'gender'>): Record<string, number> {
    if (r.gender === 'f') return {};
    const out: Record<string, number> = {};
    for (const [code, rating] of Object.entries(SEVENS_RATING)) {
        const t = NATION_BY_CODE[code];
        if (t) out[t.id] = rating - (t.rating ?? 60);
    }
    return out;
}

/* ───────────────────────── regiones y torneos ───────────────────────── */

const REGION_OF: Record<string, SevensRegion> = {
    'europa-norte': 'europa', 'europa-sur': 'europa', 'europa-este': 'europa', 'medio-oriente': 'europa',
    sudamerica: 'sudamerica', norteamerica: 'norte', asia: 'asia', africa: 'africa', 'africa-sur': 'africa',
    pacifico: 'oceania', oceania: 'oceania',
};
export const SEVENS_REGIONS: SevensRegion[] = ['europa', 'sudamerica', 'norte', 'asia', 'africa', 'oceania'];
const REGIONAL_NAME: Record<SevensRegion, string> = {
    europa: 'Rugby Europe Sevens Championship',
    sudamerica: 'Sudamericano de Seven',
    norte: 'RAN Sevens',
    asia: 'Asia Rugby Sevens Series',
    africa: 'Rugby Africa Sevens',
    oceania: 'Oceania Sevens',
};

const baseCode = (id: string) => id.replace(/^natf?-/, '').toUpperCase();
/** El código de torneo de una selección: ARG para los varones, ARG-F para las mujeres. */
const codeOf = (id: string) => (id.startsWith('natf-') ? `${baseCode(id)}-F` : baseCode(id));
const idOf = (code: string, g: Gender) => teamIdOf(g === 'f' ? `${code}-F` : code);
export const regionOfTeam = (id: string): SevensRegion => REGION_OF[REGION_BY_CODE[baseCode(id)] ?? 'europa-norte'] ?? 'europa';
const nameOf = (id: string | undefined) => (id ? NATION_BY_CODE[codeOf(id)]?.name ?? id : '—');
const genderOf = (id: string): Gender => (id.startsWith('natf-') ? 'f' : 'm');

/** Todas las selecciones del género, ordenadas por nivel. */
function allTeams(g: Gender): string[] {
    const ids = Object.keys(REGION_BY_CODE)
        .map((c) => idOf(c, g))
        .filter((id) => !!NATION_BY_CODE[codeOf(id)]);
    return [...new Set(ids)].sort((a, b) => ratingOf(b) - ratingOf(a) || a.localeCompare(b));
}

/** Formato según cuántas selecciones juegan. */
function stageFor(n: number): { stage: TourDef['stage']; label: string } {
    if (n <= 2) return { stage: { kind: 'ko' }, label: 'Final única' };
    if (n <= 5) return { stage: { kind: 'liga', legs: 1 }, label: 'Todos contra todos' };
    if (n <= 8) return { stage: { kind: 'grupos', groups: 2, advance: 2 }, label: '2 grupos · semifinales y final' };
    return { stage: { kind: 'grupos', groups: 3, advance: 2, bestThirds: 2 }, label: '3 grupos · pasan dos y las 2 mejores terceras · cuartos' };
}

const fem = (g: Gender) => (g === 'f' ? ' femenino' : '');

function def(id: string, name: string, sub: string, teams: string[]): TourDef {
    const { stage, label } = stageFor(teams.length);
    return { id, name, sub, formatLabel: label, source: 'real', teams: teams.map(codeOf), stage };
}

/** El regional de una zona: las que no están en el circuito, las 12 mejores como mucho. */
function regionalTeams(r: SvnsState, region: SevensRegion): string[] {
    const busy = new Set([...r.s1, ...r.s2, ...r.s3direct]);
    const list = allTeams(r.gender).filter((id) => !busy.has(id) && regionOfTeam(id) === region);
    const top = list.slice(0, 12);
    if (list.includes(r.me) && !top.includes(r.me)) top[top.length - 1] = r.me;
    return top;
}

const regionalDef = (r: SvnsState, region: SevensRegion) =>
    def(`svns-reg-${region}-${r.season}`, `${REGIONAL_NAME[region]}${fem(r.gender)} ${r.season}`, 'El campeón va al SVNS 3.', regionalTeams(r, region));
const s3Def = (r: SvnsState, teams: string[]) => def(`svns-s3-${r.season}`, `SVNS 3${fem(r.gender)} ${r.season}`, 'Las dos primeras suben al SVNS 2.', teams);
const legDef = (r: SvnsState, tier: 's1' | 's2', leg: number) =>
    def(`svns-${tier}-${leg}-${r.season}`, `${TIER_LABEL[tier]}${fem(r.gender)} ${r.season} · etapa ${leg} de ${SVNS_LEGS[tier]}`, 'Cada puesto suma puntos para la tabla del circuito.', tier === 's1' ? r.s1 : r.s2);
const wcDef = (r: SvnsState, teams: string[]) =>
    def(`svns-wc-${r.season}`, `SVNS World Championship${fem(r.gender)} ${r.season}`, 'Las 8 primeras juegan el SVNS 1 del año que viene.', teams);

/* ───────────────────────── composición inicial (2026) ───────────────────────── */

const START: Record<Gender, { s1: string[]; s2: string[] }> = {
    m: { s1: ['ARG', 'NZL', 'FRA', 'FIJ', 'RSA', 'ESP', 'AUS', 'ENG'], s2: ['IRL', 'USA', 'KEN', 'URU', 'CAN', 'GER'] },
    f: { s1: ['NZL', 'AUS', 'CAN', 'FRA', 'USA', 'FIJ', 'JPN', 'ENG'], s2: ['IRL', 'BRA', 'ESP', 'CHN', 'RSA', 'ARG'] },
};

/* ───────────────────────── simulación ───────────────────────── */

const addPoints = (pts: Record<string, number>, ranking: string[]) => ranking.forEach((id, i) => (pts[id] = (pts[id] ?? 0) + (LEG_POINTS[i] ?? 4)));
const byPoints = (pts: Record<string, number>, teams: string[]) => [...teams].sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0) || ratingOf(b) - ratingOf(a));

/** Simula una serie entera (todas sus etapas) y devuelve la tabla final. */
function simSeries(r: SvnsState, tier: 's1' | 's2'): string[] {
    const pts: Record<string, number> = {};
    for (let leg = 1; leg <= SVNS_LEGS[tier]; leg++) addPoints(pts, finalRanking(playOut(legDef(r, tier, leg))));
    return byPoints(pts, tier === 's1' ? r.s1 : r.s2);
}

/** Los regionales que falten y el SVNS 3 que sale de ellos. */
function s3Field(r: SvnsState): string[] {
    const regional = (r.res.regional ??= {});
    for (const region of SEVENS_REGIONS) {
        if (regional[region]) continue;
        const teams = regionalTeams(r, region);
        regional[region] = teams.length >= 2 ? finalRanking(playOut(regionalDef(r, region))) : teams;
    }
    const champs = SEVENS_REGIONS.map((g) => regional[g]?.[0]).filter((x): x is string => !!x);
    const field = [...r.s3direct, ...champs];
    // Regionales vacíos: el lugar va al mejor subcampeón.
    const seconds = SEVENS_REGIONS.map((g) => regional[g]?.[1])
        .filter((x): x is string => !!x && !field.includes(x))
        .sort((a, b) => ratingOf(b) - ratingOf(a));
    while (field.length < 8 && seconds.length) field.push(seconds.shift()!);
    return field.slice(0, 8);
}

/* ───────────────────────── etapas del usuario ───────────────────────── */

function stage(r: SvnsState, d: TourDef, difficulty: Difficulty, duration: Duration): TourState {
    setRatingBoost(svnsBoosts(r));
    return { ...createTour(d, r.me, difficulty, duration), def: d, svns: r };
}

/** La primera etapa de la temporada del usuario. */
function seasonStart(r: SvnsState, difficulty: Difficulty, duration: Duration): TourState {
    r.res = {};
    r.pts = {};
    r.leg = 1;
    // Los regionales de las otras zonas se juegan ya: así el SVNS 3 queda definido
    // por lo que haga el usuario, y el cartel de cada etapa no cambia al mirarlo otra vez.
    if (r.tier === 'reg' || r.tier === 's3') {
        setRatingBoost(svnsBoosts(r));
        const mine = r.tier === 'reg' ? regionOfTeam(r.me) : null;
        const regional = (r.res.regional = {} as Record<string, string[]>);
        for (const region of SEVENS_REGIONS) {
            if (region === mine) continue;
            const teams = regionalTeams(r, region);
            regional[region] = teams.length >= 2 ? finalRanking(playOut(regionalDef(r, region))) : teams;
        }
    }
    if (r.tier === 's1' || r.tier === 's2') {
        r.phase = r.tier;
        return stage(r, legDef(r, r.tier, 1), difficulty, duration);
    }
    if (r.tier === 's3') {
        r.phase = 's3';
        return stage(r, s3Def(r, s3Field(r)), difficulty, duration);
    }
    // Un regional sin rivales (las demás de la zona ya están en el circuito): directo al SVNS 3.
    const mine = regionOfTeam(r.me);
    if (regionalTeams(r, mine).length < 2) {
        (r.res.regional ??= {})[mine] = [r.me];
        r.phase = 's3';
        return stage(r, s3Def(r, s3Field(r)), difficulty, duration);
    }
    r.phase = 'regional';
    return stage(r, regionalDef(r, mine), difficulty, duration);
}

/** Arranca el circuito con la selección elegida (varones o mujeres según el equipo). */
export function createSvns(meId: string, difficulty: Difficulty, duration: Duration): TourState {
    const g = genderOf(meId);
    const s1 = START[g].s1.map((c) => idOf(c, g));
    const s2 = START[g].s2.map((c) => idOf(c, g));
    const r: SvnsState = {
        v: 1, me: meId, gender: g, season: 2026, s1, s2, s3direct: [],
        tier: s1.includes(meId) ? 's1' : s2.includes(meId) ? 's2' : 'reg',
        phase: 'regional', leg: 1, pts: {}, res: {}, history: [], titles: [], log: [],
    };
    setRatingBoost(svnsBoosts(r));
    return seasonStart(r, difficulty, duration);
}

/** Cierra la temporada: simula lo que no jugó el usuario y arma la siguiente. */
function closeSeason(r: SvnsState) {
    setRatingBoost(svnsBoosts(r));
    const s3 = r.res.s3 ?? finalRanking(playOut(s3Def(r, s3Field(r))));
    const s2 = r.res.s2 ?? simSeries(r, 's2');
    const s1 = r.res.s1 ?? simSeries(r, 's1');
    const wc = r.res.wc ?? finalRanking(playOut(wcDef(r, [...r.s1, ...s2.slice(0, 4)])));
    const me = r.me;
    const place = (list: string[]) => list.indexOf(me) + 1;
    const region = regionOfTeam(me);
    let text: string;
    if (r.s1.includes(me)) text = `${place(s1)}.º del SVNS 1 · ${place(wc)}.º del World Championship`;
    else if (r.s2.includes(me)) text = `${place(s2)}.º del SVNS 2${wc.includes(me) ? ` · ${place(wc)}.º del World Championship` : ''}`;
    else if (s3.includes(me)) text = `${place(s3)}.º del SVNS 3`;
    else {
        const reg = r.res.regional?.[region] ?? [];
        text = reg.includes(me) ? `${place(reg)}.º del ${REGIONAL_NAME[region]}` : 'Sin torneo';
    }
    r.history.push({ season: r.season, tier: r.tier, text });
    r.log.push(`${r.season}: SVNS 1 para ${nameOf(s1[0])}; World Championship para ${nameOf(wc[0])}; del SVNS 3 suben ${nameOf(s3[0])} y ${nameOf(s3[1])}.`);
    if (s1[0] === me) r.titles.push({ season: r.season, label: 'Campeón del SVNS 1' });
    if (wc[0] === me) r.titles.push({ season: r.season, label: 'Campeón del SVNS World Championship' });
    if (s3[0] === me) r.titles.push({ season: r.season, label: 'Campeón del SVNS 3' });
    if (s2[0] === me) r.titles.push({ season: r.season, label: 'Primero del SVNS 2' });
    if (r.tier === 'reg' && r.res.regional?.[region]?.[0] === me) r.titles.push({ season: r.season, label: `Campeón del ${REGIONAL_NAME[region]}` });

    // La temporada que viene.
    r.s1 = wc.slice(0, 8);
    r.s2 = [...wc.slice(8, 12), ...s3.slice(0, 2)];
    r.s3direct = s2.slice(4, 6);
    r.tier = r.s1.includes(me) ? 's1' : r.s2.includes(me) ? 's2' : r.s3direct.includes(me) ? 's3' : 'reg';
    r.season += 1;
}

/** Asienta la etapa que terminó (sin crear la siguiente). */
function settle(s: TourState): SvnsState {
    const r: SvnsState = JSON.parse(JSON.stringify(s.svns));
    setRatingBoost(svnsBoosts(r));
    const ranking = finalRanking(s);
    if (r.phase === 'regional') (r.res.regional ??= {})[regionOfTeam(r.me)] = ranking;
    else if (r.phase === 's3') r.res.s3 = ranking;
    else if (r.phase === 'wc') r.res.wc = ranking;
    else {
        addPoints(r.pts, ranking);
        if (r.leg >= SVNS_LEGS[r.phase]) r.res[r.phase] = byPoints(r.pts, r.phase === 's1' ? r.s1 : r.s2);
    }
    return r;
}

/** Qué sigue para el usuario (null: se cierra la temporada). */
function nextOf(r: SvnsState): { phase: SvnsPhase; def: () => TourDef } | null {
    if (r.phase === 'regional') {
        // El campeón, o el mejor subcampeón si un regional quedó vacío.
        const field = s3Field(r);
        if (!field.includes(r.me)) return null;
        return { phase: 's3', def: () => s3Def(r, field) };
    }
    if (r.phase === 's1' || r.phase === 's2') {
        const tier = r.phase;
        if (r.leg < SVNS_LEGS[tier]) return { phase: tier, def: () => legDef(r, tier, r.leg + 1) };
        if (tier === 's2' && !(r.res.s2 ?? []).slice(0, 4).includes(r.me)) return null;
        return {
            phase: 'wc',
            def: () => {
                const s2 = r.res.s2 ?? simSeries(r, 's2');
                r.res.s2 = s2;
                r.res.s1 ??= simSeries(r, 's1');
                return wcDef(r, [...r.s1, ...s2.slice(0, 4)]);
            },
        };
    }
    return null;
}

/** El cartel al terminar una etapa. */
export function svnsVerdict(s: TourState): { title: string; text: string; next: string } {
    const r = settle(s);
    const nx = nextOf(r);
    const place = finalRanking(s).indexOf(r.me) + 1;
    const won = s.champion === r.me;
    let title = won ? 'Campeón' : `Terminaste ${place}.º`;
    let text = '';
    if (r.phase === 'regional')
        text = won
            ? 'Vas al SVNS 3: las dos primeras suben al SVNS 2.'
            : nx
              ? 'Un regional quedó sin selecciones y su lugar es tuyo como mejor subcampeón: vas al SVNS 3.'
              : 'Solo el campeón va al SVNS 3. El año que viene, otra vez el regional.';
    else if (r.phase === 's3') text = place <= 2 ? 'Subís al SVNS 2 el año que viene.' : 'No alcanzó para subir. El año que viene, el regional.';
    else if (r.phase === 'wc') {
        title = won ? 'Campeón del mundo' : `${place}.º del World Championship`;
        text = place <= 8 ? 'El año que viene jugás el SVNS 1.' : 'El año que viene, el SVNS 2.';
    } else {
        const tier = r.phase;
        const table = byPoints(r.pts, tier === 's1' ? r.s1 : r.s2);
        const pos = table.indexOf(r.me) + 1;
        title = won ? `Ganaste la etapa ${r.leg}` : `Etapa ${r.leg}: ${place}.º`;
        text = `Vas ${pos}.º en la tabla del ${TIER_LABEL[tier]} con ${r.pts[r.me] ?? 0} puntos.`;
        if (r.leg >= SVNS_LEGS[tier]) {
            if (tier === 's1') text = `${pos === 1 ? 'Campeón del SVNS 1.' : `Terminaste ${pos}.º del SVNS 1.`} Falta el World Championship: las 8 primeras siguen en el SVNS 1.`;
            else text = pos <= 4 ? `Terminaste ${pos}.º del SVNS 2: jugás el World Championship por un lugar en el SVNS 1.` : `Terminaste ${pos}.º del SVNS 2: bajás al SVNS 3.`;
        }
    }
    const next = nx ? (nx.phase === 'wc' ? 'Jugar el World Championship' : nx.phase === 's3' ? 'Jugar el SVNS 3' : `Jugar la etapa ${r.leg + 1}`) : `Temporada ${r.season + 1}`;
    return { title, text, next };
}

/** Pasa a la etapa siguiente o, si se terminó la temporada, a la que viene. */
export function advanceSvns(s: TourState): TourState {
    if (!s.svns || !s.done) return s;
    const r = settle(s);
    const nx = nextOf(r);
    if (nx) {
        const d = nx.def();
        if (nx.phase === r.phase) r.leg += 1;
        r.phase = nx.phase;
        return stage(r, d, s.difficulty, s.duration);
    }
    closeSeason(r);
    return seasonStart(r, s.difficulty, s.duration);
}

/** La tabla de puntos del circuito que juega el usuario, para mostrar (con la etapa recién terminada ya sumada). */
export function svnsTable(s: TourState): { id: string; pts: number }[] | null {
    if (!s.svns) return null;
    const r = s.done ? settle(s) : s.svns;
    if (r.phase !== 's1' && r.phase !== 's2') return null;
    return byPoints(r.pts, r.phase === 's1' ? r.s1 : r.s2).map((id) => ({ id, pts: r.pts[id] ?? 0 }));
}

/** Dónde arranca una selección en 2026, y cómo se llama su regional. */
export function svnsStartTier(id: string): SvnsTier {
    const g = genderOf(id);
    const c = baseCode(id);
    return START[g].s1.includes(c) ? 's1' : START[g].s2.includes(c) ? 's2' : 'reg';
}
export const svnsRegionName = (id: string) => REGIONAL_NAME[regionOfTeam(id)];
