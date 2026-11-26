/**
 * Mi Club: fundás un club, arranca en la base de una pirámide con todos los clubes de varones de
 * Argentina y sube división por división. Cada división es un torneo común del juego (tours.ts):
 * abajo, zonas regionales y cuadro; arriba, liga. El estado viaja en `TourState.miclub`, igual que
 * la carrera (career.ts) y la carrera internacional (intl.ts), así que se guarda en los casilleros
 * de siempre y en la cuenta.
 */
import { AR_CLUBS, AR_SEVEN_DIVISIONS } from './arClubs';
import { makePlayer, regionLabel, type Player } from './career';
import { nameFromSeed, type PlayerName } from './names';
import { closeRound, createTour, ratingOf, type TourDef, type TourState } from './tours';
import type { Difficulty, Duration, SevenTeam } from './teams';

/* ───────────────────────── la pirámide ───────────────────────── */

export type McLevel = 'primera' | 'segunda' | 'tercera' | 'cuarta' | 'quinta' | 'base';

export interface McLevelDef {
    id: McLevel;
    label: string;
    /** Cuántos clubes tiene la división (la base: el resto). */
    size: number;
    /** Zonas regionales (0: liga única). */
    zones: number;
    /** Cuántos de cada zona pasan al cuadro (en la liga: cuántos van al playoff; 0, sin playoff). */
    advance: number;
    /** Cuántos suben a la de arriba y cuántos bajan a la de abajo. */
    up: number;
    down: number;
    /** Cómo se sube, en palabras (para la pantalla). */
    upHow: string;
}

/** De arriba hacia abajo. Lo que sube de una división es lo que baja de la de arriba. */
export const MC_LEVELS: McLevelDef[] = [
    { id: 'primera', label: 'Primera', size: 12, zones: 0, advance: 4, up: 0, down: 2, upHow: 'Campeón por semis y final entre los 4 primeros. Bajan los 2 últimos.' },
    { id: 'segunda', label: 'Segunda', size: 12, zones: 0, advance: 0, up: 2, down: 2, upHow: 'Suben los 2 primeros de la tabla. Bajan los 2 últimos.' },
    { id: 'tercera', label: 'Tercera', size: 12, zones: 0, advance: 0, up: 2, down: 2, upHow: 'Suben los 2 primeros de la tabla. Bajan los 2 últimos.' },
    { id: 'cuarta', label: 'Cuarta', size: 40, zones: 4, advance: 2, up: 2, down: 4, upHow: 'Pasan los 2 primeros de cada zona a cuartos: suben los 2 finalistas. Baja el último de cada zona.' },
    { id: 'quinta', label: 'Quinta', size: 80, zones: 8, advance: 2, up: 4, down: 8, upHow: 'Pasan los 2 primeros de cada zona a octavos: suben los 4 semifinalistas. Baja el último de cada zona.' },
    { id: 'base', label: 'Regional', size: 0, zones: 16, advance: 1, up: 8, down: 0, upHow: 'Pasa el primero de cada zona a octavos: suben los 8 que ganan su octavo.' },
];

export const levelDef = (id: McLevel) => MC_LEVELS.find((l) => l.id === id)!;

/** Las regiones, en el orden en que se arman las zonas (vecinas al lado). */
export const MC_REGIONS = ['urba', 'litoral', 'centro', 'oeste', 'noa', 'nea', 'pampeana', 'patagonia'] as const;
export type McRegion = (typeof MC_REGIONS)[number];
export const mcRegionLabel = (r: string) => (r === 'urba' ? 'Buenos Aires (URBA)' : regionLabel(r));

/** La región de cada club de varones del catálogo. */
const REGION_OF: Record<string, string> = (() => {
    const out: Record<string, string> = {};
    for (const d of AR_SEVEN_DIVISIONS) if (d.clubs[0]?.startsWith('ar-')) for (const c of d.clubs) out[c] ??= d.region;
    return out;
})();

/** Los clubes de varones de Argentina que entran en la pirámide. */
export const MC_POOL: string[] = AR_CLUBS.filter((c) => !c.fem && c.id.startsWith('ar-') && REGION_OF[c.id]).map((c) => c.id);

/* ───────────────────────── el estado ───────────────────────── */

export const MC_ME = 'mc-propio';

export interface MiClubState {
    v: 1;
    me: typeof MC_ME;
    /** El club tal como lo diseñó el usuario (nombre, sigla, camiseta, caras). Su nivel sale del plantel. */
    team: SevenTeam;
    region: McRegion;
    season: number;
    /** Qué clubes juegan cada división esta temporada. */
    divisions: Record<McLevel, string[]>;
    /** Región de cada club (los del catálogo y el propio). */
    regions: Record<string, string>;
    /** El plantel: 12 jugadores; los 7 de `lineup` (o los mejores) salen a la cancha. */
    squad: Player[];
    names: Record<number, PlayerName>;
    lineup?: number[];
    nextId: number;
    /** Créditos: se ganan jugando, nunca se compran. */
    credits: number;
    facilities: { cancha: number; entreno: number; inferiores: number };
    /** Las otras divisiones, que avanzan a la par: `lvl:<división>`. */
    others: Record<string, TourState>;
    history: { season: number; level: McLevel; place: string }[];
    titles: { season: number; label: string }[];
    log: string[];
}

/* ───────────────────────── azar con semilla ───────────────────────── */

function seeded(seed: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    let a = h >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gauss = (r: () => number) => (r() + r() + r() - 1.5) * 1.15;

/* ───────────────────────── nivel del club propio ───────────────────────── */

/** Nivel de juego (escala 30-95) que da un promedio de valoración (1 a 10): la misma cuenta que la carrera. */
export const ratingFromOvr = (avg: number) => Math.round(40 + (avg - 1) * 6);

/** Los siete que salen a la cancha: los elegidos, y si falta alguno, los mejores que quedan. */
export function starters(r: MiClubState): Player[] {
    const byId = new Map(r.squad.map((p) => [p.id!, p]));
    const chosen = (r.lineup ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p);
    const rest = r.squad.filter((p) => !chosen.includes(p)).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    return [...chosen, ...rest].slice(0, 7);
}

export function myRating(r: MiClubState): number {
    const xi = starters(r);
    return ratingFromOvr(xi.reduce((a, p) => a + (p.ovr ?? 1), 0) / Math.max(1, xi.length));
}

/** El equipo propio para el partido: su nivel de hoy y los nombres de los siete titulares. */
export function myTeam(r: MiClubState): SevenTeam {
    const names = starters(r).map((p) => r.names[p.id!] ?? { first: '', last: '—', short: '—' });
    // Banderita con los colores de la camiseta, como los clubes del catálogo.
    const k = r.team.kit;
    return { ...r.team, id: MC_ME, custom: true, rating: myRating(r), names, flag: `kit:${k.shirt}:${k.shirt2}:${k.pattern}`, namePool: r.team.namePool ?? 'rio' };
}

/** Plantel inicial: flojo, para pelear la zona regional y nada más. Valoración media ≈ 1,9 (nivel 45). */
function initialSquad(r: MiClubState, rand: () => number) {
    const team = { ...r.team, namePool: r.team.namePool ?? 'rio' };
    for (let i = 0; i < 12; i++) {
        const id = r.nextId++;
        const p = makePlayer(id, 1.9 + gauss(rand) * 0.6 - (i >= 7 ? 0.4 : 0), 18 + Math.floor(rand() * 14), rand);
        r.squad.push(p);
        r.names[id] = nameFromSeed(team, `${r.team.name}:${id}`);
    }
}

/* ───────────────────────── armado de divisiones ───────────────────────── */

const byStrength = (a: string, b: string) => ratingOf(b) - ratingOf(a) || a.localeCompare(b);

/** Arma la pirámide de arriba hacia abajo por nivel de catálogo; el club propio, en la base. */
function initialDivisions(): Record<McLevel, string[]> {
    const ranked = [...MC_POOL].sort(byStrength);
    const out = {} as Record<McLevel, string[]>;
    let i = 0;
    for (const l of MC_LEVELS) {
        const n = l.size || ranked.length - i;
        out[l.id] = ranked.slice(i, i + n);
        i += n;
    }
    out.base.push(MC_ME);
    return out;
}

/** Reparte una división en zonas de vecinos: ordena por región y corta en partes parejas. */
export function zonesOf(r: MiClubState, level: McLevel): string[][] {
    const l = levelDef(level);
    const clubs = [...r.divisions[level]];
    if (!l.zones) return [clubs.sort(byStrength)];
    const ri = (id: string) => MC_REGIONS.indexOf((r.regions[id] ?? 'urba') as McRegion);
    clubs.sort((a, b) => ri(a) - ri(b) || byStrength(a, b));
    const n = l.zones;
    const zones: string[][] = [];
    let at = 0;
    for (let z = 0; z < n; z++) {
        const take = Math.floor((clubs.length - at) / (n - z));
        zones.push(clubs.slice(at, at + take));
        at += take;
    }
    return zones;
}

/** El nombre de una zona: la región que más clubes pone en ella. */
export function zoneName(r: MiClubState, zone: string[], index: number): string {
    const count: Record<string, number> = {};
    for (const id of zone) count[r.regions[id] ?? ''] = (count[r.regions[id] ?? ''] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
    return `Zona ${index + 1} · ${top === 'urba' ? 'URBA' : regionLabel(top)}`;
}

export function levelOf(r: MiClubState, club: string): McLevel | null {
    return MC_LEVELS.find((l) => r.divisions[l.id].includes(club))?.id ?? null;
}

/** El torneo de una división esta temporada. */
export function levelTourDef(r: MiClubState, level: McLevel): TourDef {
    const l = levelDef(level);
    const zones = zonesOf(r, level);
    const teams = zones.flat();
    return {
        id: `mc-${level}-${r.season}`,
        name: `${l.label} ${r.season}`,
        sub: l.upHow,
        formatLabel: l.zones ? `${l.zones} zonas regionales y cuadro` : l.advance ? `Liga de ${teams.length} y playoff de ${l.advance}` : `Liga de ${teams.length}`,
        teams,
        source: 'custom',
        clubs: true,
        cat: 'Mi Club',
        stage: l.zones ? { kind: 'grupos', groups: zones, advance: l.advance } : l.advance ? { kind: 'grupos', groups: [teams], advance: l.advance } : { kind: 'liga', legs: 1 },
    };
}

/** Las otras divisiones de la temporada, armadas para que avancen a la par. */
function buildOthers(r: MiClubState): Record<string, TourState> {
    const mine = levelOf(r, MC_ME);
    const out: Record<string, TourState> = {};
    for (const l of MC_LEVELS) {
        if (l.id === mine) continue;
        const def = levelTourDef(r, l.id);
        const t: TourState = { ...createTour(def, '__nadie', 'normal', 3), def };
        delete t.stats;
        out[`lvl:${l.id}`] = t;
    }
    return out;
}

function stageTour(r: MiClubState, difficulty: Difficulty, duration: Duration): TourState {
    const level = levelOf(r, MC_ME) ?? 'base';
    const def = levelTourDef(r, level);
    return { ...createTour(def, MC_ME, difficulty, duration), def, miclub: r };
}

/** Lo que eligió el usuario al fundar el club. */
export interface McFounding {
    team: SevenTeam;
    region: McRegion;
}

export function createMiClub(f: McFounding, difficulty: Difficulty, duration: Duration, seed = `${Date.now()}`): TourState {
    const rand = seeded(`${seed}:${f.team.name}`);
    const name = f.team.name.trim();
    const r: MiClubState = {
        v: 1,
        me: MC_ME,
        team: { ...f.team, id: MC_ME, custom: true, name, short: f.team.short.trim().toUpperCase() },
        region: f.region,
        season: 2026,
        divisions: initialDivisions(),
        regions: { ...REGION_OF, [MC_ME]: f.region },
        squad: [],
        names: {},
        nextId: 1,
        credits: 0,
        facilities: { cancha: 1, entreno: 1, inferiores: 1 },
        others: {},
        history: [],
        titles: [],
        log: [`2026: se funda ${name}, en la Regional de ${mcRegionLabel(f.region)}.`],
    };
    initialSquad(r, rand);
    r.others = buildOthers(r);
    return stageTour(r, difficulty, duration);
}

/* ───────────────────────── la temporada a la par ───────────────────────── */

/** Cuántas fechas tiene un torneo en total: la fase de grupos más las rondas del cuadro. */
function totalDates(t: TourState): number {
    const def = t.def;
    let ko = 0;
    if (t.hasKo && def?.stage.kind === 'grupos') ko = Math.ceil(Math.log2(Math.max(2, def.stage.advance * t.groups.length)));
    return Math.max(1, t.rounds.length + ko);
}

const played = (t: TourState) => t.groupHistory.length + t.koHistory.length;

/**
 * Después de cada fecha propia, las otras divisiones avanzan hasta la misma altura de la temporada:
 * la Regional va por la fecha 4 de 11 y Primera, por la 4 de 13. Si el club ya terminó (o quedó
 * afuera), las demás se terminan.
 */
export function mcAfterRound(s: TourState): TourState {
    const r = s.miclub;
    if (!r) return s;
    const clock = s.done || s.eliminated ? 1 : played(s) / totalDates(s);
    let changed = false;
    const others: Record<string, TourState> = {};
    for (const [k, t0] of Object.entries(r.others)) {
        let t = t0;
        for (let guard = 0; guard < 80 && !t.done && (played(t) + 0.5) / totalDates(t) <= clock; guard++) t = closeRound(t, null);
        if (t !== t0) changed = true;
        others[k] = t;
    }
    return changed ? { ...s, miclub: { ...r, others } } : s;
}

/* ───────────────────────── para mirar ───────────────────────── */

/** Todas las divisiones de la pirámide, de arriba hacia abajo: la propia (la que se juega) y las demás. */
export function pyramidTours(s: TourState): { level: McLevelDef; state: TourState; mine: boolean }[] {
    const r = s.miclub;
    if (!r) return [];
    const mine = levelOf(r, MC_ME);
    return MC_LEVELS.map((l) => ({ level: l, state: l.id === mine ? s : r.others[`lvl:${l.id}`], mine: l.id === mine })).filter((x) => !!x.state);
}

/** Qué significa cada puesto de una tabla de la pirámide. */
export type McTag = 'playoff' | 'ascenso' | 'descenso' | null;

export function tagFor(level: McLevel, place: number, zoneSize: number): McTag {
    const l = levelDef(level);
    if (l.advance && place < l.advance) return 'playoff';
    if (!l.advance && l.up && place < l.up) return 'ascenso';
    const downHere = l.zones ? Math.ceil(l.down / l.zones) : l.down;
    if (downHere && place >= zoneSize - downHere) return 'descenso';
    return null;
}

export const TAG_LABEL: Record<Exclude<McTag, null>, string> = {
    playoff: 'Pasa al cuadro',
    ascenso: 'Ascenso',
    descenso: 'Descenso',
};
