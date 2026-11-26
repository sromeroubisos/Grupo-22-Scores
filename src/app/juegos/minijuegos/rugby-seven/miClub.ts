/**
 * Mi Club: fundás un club, arranca en la base de una pirámide con todos los clubes de varones de
 * Argentina y sube división por división. Cada división es un torneo común del juego (tours.ts):
 * abajo, zonas regionales y cuadro; arriba, liga. El estado viaja en `TourState.miclub`, igual que
 * la carrera (career.ts) y la carrera internacional (intl.ts), así que se guarda en los casilleros
 * de siempre y en la cuenta.
 *
 * La temporada tiene tres torneos propios que se juegan intercalados, cada uno en su tramo del año:
 * la liga de la división (todo el año), la copa de la división (todo el año, Primera no tiene) y la
 * Copa Nacional de 64 (la segunda mitad; se arma a mitad de año con la tabla de ese momento). Cada
 * fecha se juega la del torneo que va primero en el calendario; los otros esperan en `parked`.
 */
import { AR_CLUBS, AR_SEVEN_DIVISIONS } from './arClubs';
import { CLUB_LEAGUES } from './clubs';
import { makePlayer, regionLabel, type Player } from './career';
import { defaultNames, nameFromSeed, nameFromText, type PlayerName } from './names';
import { closeRound, createTour, finalRanking, groupStandings, ratingOf, triesOfScore, type TourDef, type TourState } from './tours';
import type { Difficulty, Duration, SevenTeam } from './teams';

/* ───────────────────────── la pirámide ───────────────────────── */

export type McLevel = 'primera' | 'segunda' | 'tercera' | 'cuarta' | 'quinta' | 'base' | 'sa1' | 'sa2' | 'sa3' | 'sa4' | 'eu1' | 'eu2' | 'eu3' | 'eu4';

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
    /** Cuántos entran a la Copa Nacional y cómo (por zona o por la tabla), a mitad de temporada. */
    nac: { perZone?: number; top?: number; all?: boolean; how: string };
    /**
     * Reducido por el ascenso: el primero sube directo y del 2.º al (1 + red).º juegan un mata-mata
     * (2.º contra el último del reducido, 3.º contra 4.º): el ganador es el otro que sube.
     */
    red?: number;
    /** Zonas armadas por país (una por país; los chicos se juntan con el vecino y los grandes se parten). */
    byRegion?: boolean;
}

/** De arriba hacia abajo. Lo que sube de una división es lo que baja de la de arriba. */
export const MC_LEVELS: McLevelDef[] = [
    { id: 'primera', label: 'Primera', size: 12, zones: 0, advance: 4, up: 0, down: 2, upHow: 'Campeón por semis y final entre los 4 primeros. Bajan los 2 últimos.', nac: { all: true, how: 'los 12' } },
    { id: 'segunda', label: 'Segunda', size: 12, zones: 0, advance: 0, up: 2, down: 2, red: 4, upHow: 'Sube el primero. Del 2.º al 5.º juegan un reducido: el ganador también sube. Bajan los 2 últimos.', nac: { all: true, how: 'los 12' } },
    { id: 'tercera', label: 'Tercera', size: 12, zones: 0, advance: 0, up: 2, down: 2, red: 4, upHow: 'Sube el primero. Del 2.º al 5.º juegan un reducido: el ganador también sube. Bajan los 2 últimos.', nac: { top: 8, how: 'los 8 primeros' } },
    { id: 'cuarta', label: 'Cuarta', size: 40, zones: 4, advance: 2, up: 2, down: 4, upHow: 'Pasan los 2 primeros de cada zona a cuartos: suben los 2 finalistas. Baja el último de cada zona.', nac: { perZone: 2, how: 'los 2 primeros de cada zona' } },
    { id: 'quinta', label: 'Quinta', size: 80, zones: 8, advance: 2, up: 4, down: 8, upHow: 'Pasan los 2 primeros de cada zona a octavos: suben los 4 semifinalistas. Baja el último de cada zona.', nac: { perZone: 1, how: 'el puntero de cada zona' } },
    { id: 'base', label: 'Regional', size: 0, zones: 16, advance: 1, up: 8, down: 0, upHow: 'Pasa el primero de cada zona a octavos: suben los 8 que ganan su octavo.', nac: { perZone: 1, how: 'el puntero de cada zona' } },
];

/**
 * Sudamérica: Chile, Brasil, Uruguay, Perú, México y Colombia en una sola pirámide de cuatro escalones.
 * La Regional va en seis zonas armadas por país; Tercera, en dos zonas.
 */
export const SA_LEVELS: McLevelDef[] = [
    { id: 'sa1', label: 'Primera', size: 12, zones: 0, advance: 4, up: 0, down: 2, upHow: 'Campeón por semis y final entre los 4 primeros. Bajan los 2 últimos.', nac: { all: true, how: 'los 12' } },
    { id: 'sa2', label: 'Segunda', size: 12, zones: 0, advance: 0, up: 2, down: 2, red: 4, upHow: 'Sube el primero. Del 2.º al 5.º juegan un reducido: el ganador también sube. Bajan los 2 últimos.', nac: { all: true, how: 'los 12' } },
    { id: 'sa3', label: 'Tercera', size: 24, zones: 2, advance: 2, up: 2, down: 2, upHow: 'Pasan los 2 primeros de cada zona a semifinales: suben los 2 finalistas. Baja el último de cada zona.', nac: { perZone: 1, how: 'el puntero de cada zona' } },
    { id: 'sa4', label: 'Regional', size: 0, zones: 6, advance: 1, up: 2, down: 0, upHow: 'Seis zonas armadas por país: pasa el primero de cada una al cuadro y suben los 2 finalistas.', nac: { perZone: 1, how: 'el puntero de cada zona' } },
];

/**
 * Europa no profesional: España, Portugal, Italia, Rumania, Georgia, Irlanda, Gales, Escocia, Bélgica y
 * Luxemburgo, Países Bajos, Alemania, Polonia y Chequia (sin Inglaterra, Francia ni las franquicias del URC).
 * El sistema de Sudamérica: Primera y Segunda de 12, Tercera en dos zonas y la Regional por país.
 */
export const EU_LEVELS: McLevelDef[] = [
    { id: 'eu1', label: 'Primera', size: 12, zones: 0, advance: 4, up: 0, down: 2, upHow: 'Campeón por semis y final entre los 4 primeros. Bajan los 2 últimos.', nac: { all: true, how: 'los 12' } },
    { id: 'eu2', label: 'Segunda', size: 12, zones: 0, advance: 0, up: 2, down: 2, red: 4, upHow: 'Sube el primero. Del 2.º al 5.º juegan un reducido: el ganador también sube. Bajan los 2 últimos.', nac: { all: true, how: 'los 12' } },
    { id: 'eu3', label: 'Tercera', size: 24, zones: 2, advance: 2, up: 2, down: 4, upHow: 'Pasan los 2 primeros de cada zona a semifinales: suben los 2 finalistas. Bajan los 2 últimos de cada zona.', nac: { perZone: 2, how: 'los 2 primeros de cada zona' } },
    // Son muchas zonas (una o dos por país): suben los 4 semifinalistas, si no salir de la Regional era casi imposible.
    { id: 'eu4', label: 'Regional', size: 0, zones: 12, advance: 1, up: 4, down: 0, byRegion: true, upHow: 'Una zona por país: pasa el primero de cada una al cuadro y suben los 4 semifinalistas.', nac: { perZone: 1, how: 'el puntero de cada zona' } },
];

const ALL_LEVELS = [...MC_LEVELS, ...SA_LEVELS, ...EU_LEVELS];
export const levelDef = (id: McLevel) => ALL_LEVELS.find((l) => l.id === id)!;

/** Los dos mundos de Mi Club: la pirámide argentina y la sudamericana. */
export type McWorld = 'ar' | 'sa' | 'eu';

/** Las regiones, en el orden en que se arman las zonas (vecinas al lado). */
export const MC_REGIONS = ['urba', 'litoral', 'centro', 'oeste', 'noa', 'nea', 'pampeana', 'patagonia'] as const;
export const SA_REGIONS = ['chile', 'brasil', 'uruguay', 'peru', 'mexico', 'colombia'] as const;
/** Europa, de oeste a este (vecinos al lado: los países chicos se juntan con el de al lado). */
export const EU_REGIONS = ['irlanda', 'gales', 'escocia', 'espana', 'portugal', 'italia', 'belgica', 'holanda', 'alemania', 'chequia', 'polonia', 'rumania', 'georgia'] as const;
export type McRegion = (typeof MC_REGIONS)[number] | (typeof SA_REGIONS)[number] | (typeof EU_REGIONS)[number];
const COUNTRY_LABEL: Record<string, string> = { chile: 'Chile', brasil: 'Brasil', uruguay: 'Uruguay', peru: 'Perú', mexico: 'México', colombia: 'Colombia', irlanda: 'Irlanda', gales: 'Gales', escocia: 'Escocia', espana: 'España', portugal: 'Portugal', italia: 'Italia', belgica: 'Bélgica y Luxemburgo', holanda: 'Países Bajos', alemania: 'Alemania', chequia: 'Chequia', polonia: 'Polonia', rumania: 'Rumania', georgia: 'Georgia' };
export const mcRegionLabel = (r: string) => (r === 'urba' ? 'Buenos Aires (URBA)' : COUNTRY_LABEL[r] ?? regionLabel(r));

/** La región de cada club de varones del catálogo. */
const REGION_OF: Record<string, string> = (() => {
    const out: Record<string, string> = {};
    for (const d of AR_SEVEN_DIVISIONS) if (d.clubs[0]?.startsWith('ar-')) for (const c of d.clubs) out[c] ??= d.region;
    // Sudamérica: la región de cada club es su país.
    for (const d of AR_SEVEN_DIVISIONS) if ((SA_REGIONS as readonly string[]).includes(d.branch)) for (const c of d.clubs) out[c] ??= d.branch;
    // Europa: también por país (la rama de la división; las femeninas tienen otra rama y quedan afuera).
    for (const d of AR_SEVEN_DIVISIONS) if ((EU_REGIONS as readonly string[]).includes(d.branch)) for (const c of d.clubs) out[c] ??= d.branch;
    return out;
})();

const CLUB_NAME = new Map(AR_CLUBS.map((c) => [c.id, c.name]));

/** Los clubes de varones de Argentina que entran en la pirámide. */
export const MC_POOL: string[] = AR_CLUBS.filter((c) => !c.fem && c.id.startsWith('ar-') && REGION_OF[c.id]).map((c) => c.id);
/** Los clubes de varones de Chile, Brasil, Uruguay, Perú, México y Colombia. */
export const SA_POOL: string[] = AR_CLUBS.filter((c) => !c.fem && !c.id.startsWith('ar-') && (SA_REGIONS as readonly string[]).includes(REGION_OF[c.id] ?? '')).map((c) => c.id);
/** Los clubes de varones de la Europa no profesional. */
export const EU_POOL: string[] = AR_CLUBS.filter((c) => !c.fem && !c.id.startsWith('ar-') && (EU_REGIONS as readonly string[]).includes(REGION_OF[c.id] ?? '')).map((c) => c.id);

/** Lo de cada mundo: sus divisiones, sus regiones, sus clubes y el nombre de su copa grande. */
export const WORLDS: Record<McWorld, { label: string; levels: McLevelDef[]; regions: readonly McRegion[]; pool: string[]; nacName: string; regionWord: string }> = {
    ar: { label: 'Argentina', levels: MC_LEVELS, regions: MC_REGIONS, pool: MC_POOL, nacName: 'Copa Nacional', regionWord: 'región' },
    sa: { label: 'Sudamérica', levels: SA_LEVELS, regions: SA_REGIONS, pool: SA_POOL, nacName: 'Copa Continental', regionWord: 'país' },
    eu: { label: 'Europa', levels: EU_LEVELS, regions: EU_REGIONS, pool: EU_POOL, nacName: 'Copa de Europa', regionWord: 'país' },
};
export const worldOf = (r: { world?: McWorld }) => WORLDS[r.world ?? 'ar'];
export const levelsOf = (r: { world?: McWorld }) => worldOf(r).levels;
export const nacNameOf = (r: { world?: McWorld }) => worldOf(r).nacName;
export const nacHowOf = (r: { world?: McWorld }) => levelsOf(r).map((l) => `${l.label}: ${l.nac.how}`).join(' · ');
export const otherWorld = (w: McWorld): McWorld => (w === 'ar' ? 'sa' : 'ar');
/** La copa entre los mejores de la Primera propia y los de la del otro mundo. */
export const libNameOf = (r: { world?: McWorld }) => (r.world === 'eu' ? 'Copa Intercontinental de Clubes' : LIB_NAME);
export const topOf = (w: McWorld): McLevel => WORLDS[w].levels[0].id;
const baseOf = (w: McWorld): McLevel => WORLDS[w].levels[WORLDS[w].levels.length - 1].id;

/* ───────────────────────── el estado ───────────────────────── */

export const MC_ME = 'mc-propio';

/** Los torneos de una temporada: la liga de la división, su copa y la Copa Nacional. */
export type McKind = 'liga' | 'cup' | 'nac' | 'lib' | 'wcc' | 'red';
/** El reducido por el segundo ascenso (Segunda y Tercera), al terminar la liga. */
export const redName = (level: McLevel) => `Reducido de ${levelDef(level).label}`;
export const NAC_NAME = 'Copa Nacional';
/** La copa de los mejores de Primera de los dos mundos: 8 de Argentina contra 8 de Sudamérica, mata-mata. */
export const LIB_NAME = 'Copa de América de Clubes';
export const LIB_PER_WORLD = 8;
/** La Copa del Mundo de Clubes: los 4 mejores de la Primera propia contra 28 profesionales del mundo. */
export const WCC_NAME = 'Copa del Mundo de Clubes';
export const WCC_FROM_PRIMERA = 4;
/** Cuántos profesionales pone cada liga (suman 28): las grandes más, y alguna de cada rincón. */
const WCC_QUOTA: Record<string, number> = {
    'Top 14': 4, Premiership: 4, URC: 4, 'Super Rugby Pacific': 4, 'Japan League One D1': 3,
    'Currie Cup': 2, 'Pro D2': 2, 'Super Rugby Americas': 2, 'Major League Rugby': 2, 'Japan League One D2': 1,
};
export const NAC_SIZE = 64;
export const cupName = (level: McLevel) => `Copa de ${levelDef(level).label}`;

export interface MiClubState {
    v: 1;
    me: typeof MC_ME;
    /** En qué pirámide juega el club (las partidas de antes: Argentina). */
    world?: McWorld;
    /** La Primera del otro mundo (para la Copa de América): se juega a la par cada temporada. */
    ext?: string[];
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
    /** Los torneos propios que no están en pantalla (esperan su fecha): `liga`, `cup`, `nac`. */
    parked: Partial<Record<McKind, TourState>>;
    /** Ya se armó la Copa Nacional de esta temporada (se arma a mitad de año). */
    nacMade?: boolean;
    /** Ya se armó la Copa de América de esta temporada. */
    libMade?: boolean;
    /** Ya se armó la Copa del Mundo de Clubes de esta temporada. */
    wccMade?: boolean;
    /** Lo que se juega sin el club, a la par: `lvl:<división>`, `cup:<división>` y, si no entró, `nac`. */
    others: Record<string, TourState>;
    history: { season: number; level: McLevel; place: string }[];
    titles: { season: number; label: string }[];
    log: string[];
    /** Lo que pasó en la temporada con los torneos propios (eliminaciones, clasificaciones). */
    news?: string[];
    /** Los jugadores que se pueden fichar ahora (se renuevan al empezar y a mitad de año). */
    offers?: McOffer[];
    /** Los sponsors de la temporada: cada uno paga un poco por partido. */
    sponsors?: McSponsor[];
    /** Partidos propios ya cobrados (`torneo:fecha`), para no cobrar dos veces. */
    paid?: string[];
    /** Jugadores que ya se mejoraron esta temporada (una vez por año cada uno). */
    trained?: number[];
    /** Tu jugador: el que creaste al fundar el club (no se libera) y el puesto que ocupa en la cancha (0 a 6). */
    marquee?: { id: number; pos: number };
    /** Lo que mejoró cada jugador en esta temporada (entrenamiento y rendimiento): nunca más de 1,5. */
    gains?: Record<number, number>;
    /** Cuántas veces se entrenó a cada jugador esta temporada (cada vez cuesta más). */
    trainings?: Record<number, number>;
    /** Los partidos propios de la temporada: ganados, empatados y perdidos (el rendimiento del equipo). */
    record?: [number, number, number];
    /** Lo que dejó el último partido, en palabras ("+18: 12 por jugar, 6 por ganar"). */
    lastGain?: string;
    /** Ascensos y descensos de la última temporada cerrada: `up|club|de|a` o `down|club|de|a`. */
    moves?: { season: number; lines: string[] };
    /** Lo que dejó el cierre del último año en el plantel (retiros, juveniles). */
    lastNotes?: string[];
}

/** Un jugador en el mercado: su ficha, su nombre, de dónde viene y cuánto cuesta. */
export interface McOffer {
    id: number;
    player: Player;
    name: PlayerName;
    /** Club real de donde viene (los inventados no traen). */
    from?: string;
    price: number;
}

export interface McSponsor {
    name: string;
    /** Créditos por partido. */
    pay: number;
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
    const xi = [...chosen, ...rest].slice(0, 7);
    // Tu jugador siempre es titular: si quedó afuera, entra en lugar del peor de los siete.
    const mq = r.marquee ? byId.get(r.marquee.id) : undefined;
    if (mq && !xi.includes(mq)) xi[xi.length - 1] = mq;
    // Tu jugador juega en su puesto (y con su cara: la del mismo lugar en la camiseta del club).
    const m = r.marquee;
    const at = m ? xi.findIndex((p) => p.id === m.id) : -1;
    if (m && at >= 0 && at !== m.pos) {
        const [mp] = xi.splice(at, 1);
        xi.splice(Math.min(m.pos, xi.length), 0, mp);
    }
    return xi;
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

/* ───────────────────────── armado de divisiones y copas ───────────────────────── */

const byStrength = (a: string, b: string) => ratingOf(b) - ratingOf(a) || a.localeCompare(b);

/** Arma la pirámide de arriba hacia abajo por nivel de catálogo; el club propio, en la base. */
function initialDivisions(world: McWorld): Record<McLevel, string[]> {
    const ranked = [...WORLDS[world].pool].sort(byStrength);
    const out = {} as Record<McLevel, string[]>;
    let i = 0;
    for (const l of WORLDS[world].levels) {
        const n = l.size || ranked.length - i;
        out[l.id] = ranked.slice(i, i + n);
        i += n;
    }
    out[baseOf(world)].push(MC_ME);
    return out;
}

/** Reparte una división en zonas de vecinos: ordena por región y corta en partes parejas. */
export function zonesOf(r: MiClubState, level: McLevel): string[][] {
    const l = levelDef(level);
    const clubs = [...r.divisions[level]];
    if (!l.zones) return [clubs.sort(byStrength)];
    const regions = worldOf(r).regions;
    const ri = (id: string) => regions.indexOf((r.regions[id] ?? regions[0]) as McRegion);
    clubs.sort((a, b) => ri(a) - ri(b) || byStrength(a, b));
    if (l.byRegion) return zonesByRegion(clubs, (id) => r.regions[id] ?? regions[0], regions);
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

/**
 * Una zona por país: los que tienen pocos clubes (menos de 6) se juntan con el vecino de la lista y los
 * grandes (más de 16) se parten en zonas parejas, así ninguna zona queda de dos ni de treinta.
 */
function zonesByRegion(clubs: string[], regionOf: (id: string) => string, order: readonly string[]): string[][] {
    const groups: string[][] = [];
    let carry: string[] = [];
    for (const reg of order) {
        const here = [...carry, ...clubs.filter((id) => regionOf(id) === reg).sort(byStrength)];
        if (here.length < 6) {
            carry = here;
            continue;
        }
        carry = [];
        const parts = Math.ceil(here.length / 16);
        for (let p = 0; p < parts; p++) groups.push(here.filter((_, i) => i % parts === p));
    }
    const stray = clubs.filter((id) => !order.includes(regionOf(id)));
    const rest = [...carry, ...stray];
    if (rest.length) {
        if (groups.length) groups[groups.length - 1].push(...rest);
        else groups.push(rest);
    }
    return groups;
}

/** El nombre de una zona: la región que más clubes pone en ella. */
export function zoneName(r: MiClubState, zone: string[], index: number): string {
    const count: Record<string, number> = {};
    for (const id of zone) count[r.regions[id] ?? ''] = (count[r.regions[id] ?? ''] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
    return `Zona ${index + 1} · ${top === 'urba' ? 'URBA' : mcRegionLabel(top)}`;
}

export function levelOf(r: MiClubState, club: string): McLevel | null {
    return levelsOf(r).find((l) => r.divisions[l.id]?.includes(club))?.id ?? null;
}

/** El torneo de liga de una división esta temporada. */
export function levelTourDef(r: MiClubState, level: McLevel): TourDef {
    const l = levelDef(level);
    const zones = zonesOf(r, level);
    const teams = zones.flat();
    return {
        id: `mc-liga-${level}-${r.season}`,
        name: `${l.label} ${r.season}`,
        sub: l.upHow,
        formatLabel: l.zones ? `${zones.length} zonas regionales y cuadro` : l.advance ? `Liga de ${teams.length} y playoff de ${l.advance}` : `Liga de ${teams.length}`,
        teams,
        source: 'custom',
        clubs: true,
        cat: 'Mi Club',
        stage: l.zones ? { kind: 'grupos', groups: zones, advance: l.advance } : l.advance ? { kind: 'grupos', groups: [teams], advance: l.advance } : { kind: 'liga', legs: 1 },
    };
}

/** La copa de una división: todos sus clubes, mata-mata. Los más fuertes quedan libres en la primera ronda. */
function cupDef(r: MiClubState, level: McLevel): TourDef {
    const teams = [...r.divisions[level]].sort(byStrength);
    return {
        id: `mc-copa-${level}-${r.season}`, name: `${cupName(level)} ${r.season}`, sub: 'Todos los clubes de la división, a eliminación directa.',
        formatLabel: `Eliminación directa · ${teams.length} clubes`, teams, source: 'custom', clubs: true, cat: 'Mi Club', stage: { kind: 'ko' },
    };
}

/** De qué torneo de la temporada es un estado: la liga, la copa de la división o la Nacional. */
export const kindOf = (t: TourState): McKind =>
    t.tourId.startsWith('mc-red') ? 'red' : t.tourId.startsWith('mc-wcc') ? 'wcc' : t.tourId.startsWith('mc-lib') ? 'lib' : t.tourId.startsWith('mc-nac') ? 'nac' : t.tourId.startsWith('mc-copa') ? 'cup' : 'liga';

/** El reducido de una división: del 2.º al (1 + red).º de la tabla final, 2.º contra el último y así. */
function redDef(r: MiClubState, level: McLevel, liga: TourState): TourDef | null {
    const l = levelDef(level);
    if (!l.red) return null;
    const table = groupStandings(liga, 0).map((row) => row.team);
    const seeds = table.slice(1, 1 + l.red);
    // Orden fijo para el cuadro: 2.º-5.º y 3.º-4.º (la semi de arriba la juega el mejor ubicado).
    const teams: string[] = [];
    for (let i = 0; i < seeds.length / 2; i++) teams.push(seeds[i], seeds[seeds.length - 1 - i]);
    return {
        id: `mc-red-${level}-${r.season}`, name: `${redName(level)} ${r.season}`, sub: `Del 2.º al ${1 + l.red}.º de la tabla: el ganador sube con el primero.`,
        formatLabel: `Reducido · ${teams.length} clubes`, teams, source: 'custom', clubs: true, cat: 'Mi Club', stage: { kind: 'ko', fixed: true },
    };
}

/** Una división, sin el club adentro (avanza fecha a fecha a la par). */
function background(def: TourDef): TourState {
    const t: TourState = { ...createTour(def, '__nadie', 'normal', 3), def };
    delete t.stats;
    return t;
}

function mineTour(def: TourDef, difficulty: Difficulty, duration: Duration): TourState {
    return { ...createTour(def, MC_ME, difficulty, duration), def };
}

/* ───────────────────────── créditos ───────────────────────── */

/**
 * La economía: se gana jugando, nunca se compra. Perder también suma (la base por partido), ganar
 * suma más, y los títulos y el ascenso dejan un premio al cierre. Los precios están pensados para
 * que una temporada alcance para 2 o 3 refuerzos del nivel de la división, no para comprarse Primera.
 */
export const PAY_BY_LEVEL: Record<McLevel, number> = { base: 10, quinta: 12, cuarta: 15, tercera: 18, segunda: 22, primera: 26, sa4: 11, sa3: 16, sa2: 22, sa1: 26, eu4: 11, eu3: 16, eu2: 22, eu1: 26 };
export const PAY = { win: 10, draw: 4, try: 1, cupRound: 5, nacRound: 10, libRound: 15, wccRound: 25 };
export const PRIZE = { ascenso: 80, liga: 100, copa: 60, nac: 150, lib: 220, wcc: 400 };
export const SQUAD_MAX = 14;

/* ───────────────────────── instalaciones ───────────────────────── */

export type McFacility = 'cancha' | 'entreno' | 'inferiores';
export const FAC_MAX = 5;
/** Créditos extra por partido de local, por cada nivel de cancha arriba del 1. */
export const CANCHA_PER_LEVEL = 3;

export const FACILITIES: { id: McFacility; label: string; effect: (lvl: number) => string; costs: number[] }[] = [
    {
        id: 'cancha', label: 'Cancha',
        effect: (lvl) => (lvl <= 1 ? 'Una cancha de barrio: no suma nada de local.' : `De local en la liga, ${(lvl - 1) * CANCHA_PER_LEVEL} créditos más por partido.`),
        // Lo que cuesta pasar al nivel 2, 3, 4 y 5.
        costs: [40, 90, 180, 300],
    },
    {
        id: 'entreno', label: 'Entrenamiento',
        effect: (lvl) =>
            lvl <= 1
                ? `Entrenamiento básico: "Mejorar" sube ${trainStepAt(lvl).toFixed(2).replace('.', ',')}.`
                : `Los jugadores crecen ${(0.04 * (lvl - 1)).toFixed(2).replace('.', ',')} más por año, y "Mejorar" sube ${trainStepAt(lvl).toFixed(2).replace('.', ',')}.`,
        costs: [50, 120, 220, 360],
    },
    {
        id: 'inferiores', label: 'Inferiores',
        effect: (lvl) => `Cada temporada sube un juvenil de 18 años, de valoración ${(-0.7 + 0.25 * (lvl - 1)).toFixed(2).replace('.', ',')} respecto del plantel.`,
        costs: [40, 100, 190, 320],
    },
];

/** Lo que sube "Mejorar" según el nivel de entrenamiento. */
export const trainStepAt = (entreno: number) => 0.2 + 0.05 * (entreno - 1);

/** El costo de pasar una instalación al nivel siguiente (null: ya está al máximo). */
export function facCost(r: MiClubState, f: McFacility): number | null {
    const lvl = r.facilities?.[f] ?? 1;
    return lvl >= FAC_MAX ? null : FACILITIES.find((x) => x.id === f)!.costs[lvl - 1];
}

/** Por qué no se puede mejorar una instalación (null: se puede). */
export function upgradeBlock(r: MiClubState, f: McFacility): string | null {
    const cost = facCost(r, f);
    if (cost === null) return 'Ya está al máximo.';
    if (r.credits < cost) return `Te faltan ${cost - r.credits} créditos.`;
    return null;
}

export function mcUpgrade(s: TourState, f: McFacility): TourState {
    return withClub(s, (r) => {
        const cost = facCost(r, f);
        if (cost === null || upgradeBlock(r, f)) return;
        r.credits -= cost;
        r.facilities = { ...(r.facilities ?? { cancha: 1, entreno: 1, inferiores: 1 }), [f]: (r.facilities?.[f] ?? 1) + 1 };
        r.news = [...(r.news ?? []), `${FACILITIES.find((x) => x.id === f)!.label} a nivel ${r.facilities[f]} por ${cost} créditos.`];
    });
}

/**
 * La licencia: el nivel de cancha que pide cada división para jugarla. Las tres de arriba de cada
 * mundo piden 4, 3 y 2 (Primera, Segunda, Tercera); el resto, ninguno.
 */
export function licenseFor(r: { world?: McWorld }, level: McLevel): number {
    const i = levelsOf(r).findIndex((l) => l.id === level);
    return i === 0 ? 4 : i === 1 ? 3 : i === 2 ? 2 : 1;
}

/** La división de arriba de la del club y la cancha que pide (null en Primera). */
export function nextLicense(r: MiClubState): { level: McLevel; need: number; ok: boolean } | null {
    const levels = levelsOf(r);
    const i = levels.findIndex((l) => l.id === (levelOf(r, MC_ME) ?? levels.at(-1)!.id));
    if (i <= 0) return null;
    const level = levels[i - 1].id;
    const need = licenseFor(r, level);
    return { level, need, ok: (r.facilities?.cancha ?? 1) >= need };
}
const SQUAD_MIN = 9;

/** Lo que vale un jugador: crece con el nivel (al cuadrado) y baja con la edad. */
export function priceOf(p: Player, real = false): number {
    const o = p.ovr ?? 1;
    const age = p.age <= 23 ? 1.15 : p.age <= 28 ? 1 : p.age <= 31 ? 0.8 : 0.6;
    return Math.max(5, Math.round(o * o * 6 * age * (real ? 1.3 : 1)));
}

/**
 * El techo de un jugador en este mundo (escala 1-10): un poco arriba del club más fuerte. Sin techo, en
 * Sudamérica (clubes más flojos que los argentinos) el plantel crecía sin freno y ganaba todo.
 */
export function worldCeiling(r: { world?: McWorld }): number {
    const strongest = Math.max(...worldOf(r).pool.map((c) => ratingOf(c)));
    return 1 + (strongest - 40) / 6 + 0.8;
}

/* ───────── progresión: topes por división y por temporada ───────── */

/** Lo más que puede mejorar un jugador en una temporada, entre entrenamiento y rendimiento. */
export const SEASON_GROWTH_MAX = 1.5;

/** El nivel medio (escala 1-10) de los clubes de una división. */
export function levelCenter(r: MiClubState, level: McLevel): number {
    const clubs = (r.divisions[level] ?? []).filter((c) => c !== MC_ME);
    const avg = clubs.reduce((a, c) => a + ratingOf(c), 0) / Math.max(1, clubs.length);
    return 1 + (avg - 40) / 6;
}

/**
 * El techo de crecimiento en la división del club: 1,6 arriba de su nivel medio (Regional ≈ 3,4,
 * Primera ≈ 9,6). Un jugador por encima no baja, pero no crece hasta que el club suba. Uno mejor solo
 * llega fichándolo.
 */
export function divisionCap(r: MiClubState): number {
    const levels = levelsOf(r);
    const level = levelOf(r, MC_ME) ?? levels.at(-1)!.id;
    // Abajo se puede sacar más ventaja (1,6 sobre el nivel medio); arriba menos (1,0 en Primera):
    // así en Primera hay cracks de 8 y pico, pero no un equipo entero de 9.
    const i = levels.findIndex((l) => l.id === level);
    const room = 1.0 + 0.6 * (i / Math.max(1, levels.length - 1));
    return Math.min(worldCeiling(r), Math.round((levelCenter(r, level) + room) * 10) / 10);
}

/** Cómo le va al equipo en la temporada (0 a 1): pesa en lo que rinde el entrenamiento. */
export function winRate(r: MiClubState): number {
    const [w, d, l] = r.record ?? [0, 0, 0];
    const n = w + d + l;
    return n ? (w + 0.5 * d) / n : 0.5;
}

export const seasonGain = (r: MiClubState, id: number) => r.gains?.[id] ?? 0;

/** Lo que sube un entrenamiento: más con mejor entrenamiento y cuanto mejor va el equipo. */
export function trainStepFor(r: MiClubState): number {
    return Math.round(trainStepAt(r.facilities?.entreno ?? 1) * (0.7 + 0.6 * winRate(r)) * 100) / 100;
}

/** Lo que cuesta entrenar a un jugador: según lo que vale, y cada vez más en la misma temporada. */
export const trainCostFor = (r: MiClubState, p: Player) => Math.max(6, Math.round(priceOf(p) * 0.12)) * (1 + (r.trainings?.[p.id!] ?? 0));

const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

/** Lo que cuesta mejorar a un jugador (+0,3 de valoración), una vez por temporada. */
export const trainCost = (p: Player) => Math.max(6, Math.round(priceOf(p) * 0.2));

const BIZ = ['Corralón', 'Panadería', 'Ferretería', 'Carnicería', 'Autoservicio', 'Farmacia', 'Inmobiliaria', 'Estudio contable', 'Gomería', 'Heladería', 'Distribuidora', 'Óptica', 'Vivero', 'Transporte'];
const BIZ_NAME = ['El Tero', 'La Espiga', 'Don Pepe', 'San Jorge', 'Los Andes', 'La Esquina', 'El Molino', 'Del Centro', 'La Paz', 'El Ombú', 'Las Acacias', 'Norte', 'El Faro', 'Los Pinos'];

/** Los sponsors de la temporada: más y mejores cuanto más arriba juega el club y mejor le fue. */
function sponsorsFor(r: MiClubState, rand: () => number): McSponsor[] {
    const level = levelOf(r, MC_ME) ?? 'base';
    const base = PAY_BY_LEVEL[level];
    const last = r.history.at(-1);
    const good = !!last && /Campeón|Final|Semifinal|1\.º|2\.º/.test(last.place);
    const n = 1 + (levelsOf(r).length - 1 - levelsOf(r).findIndex((l) => l.id === level) >= 3 ? 1 : 0) + (good ? 1 : 0);
    const out: McSponsor[] = [];
    for (let i = 0; i < n; i++) {
        const name = `${BIZ[Math.floor(rand() * BIZ.length)]} ${BIZ_NAME[Math.floor(rand() * BIZ_NAME.length)]}`;
        if (out.some((x) => x.name === name)) continue;
        out.push({ name, pay: Math.max(1, Math.round(base * (0.04 + rand() * 0.04))) });
    }
    return out;
}

/** Cobra los partidos propios todavía no cobrados de un torneo. */
function payMatches(r: MiClubState, t: TourState) {
    const level = levelOf(r, MC_ME) ?? 'base';
    const kind = kindOf(t);
    const paid = new Set(r.paid ?? []);
    const sponsor = (r.sponsors ?? []).reduce((a, x) => a + x.pay, 0);
    const rounds = [...t.groupHistory.map((h, i) => ({ h, key: `${t.tourId}:g${i}`, ko: false })), ...t.koHistory.map((h, i) => ({ h, key: `${t.tourId}:k${i}`, ko: true }))];
    for (const { h, key, ko } of rounds) {
        if (paid.has(key)) continue;
        const m = h.results.find((x) => x.a === MC_ME || x.b === MC_ME);
        paid.add(key);
        if (!m) continue;
        const [us, them] = m.a === MC_ME ? [m.sa, m.sb] : [m.sb, m.sa];
        // El rendimiento de la temporada (lo que pesa en el entrenamiento y en el crecimiento).
        const rec = [...(r.record ?? [0, 0, 0])] as [number, number, number];
        rec[us > them ? 0 : us === them ? 1 : 2] += 1;
        r.record = rec;
        const tries = (m.a === MC_ME ? m.ta : m.tb) ?? triesOfScore(us);
        const parts: [number, string][] = [[PAY_BY_LEVEL[level], 'por jugar']];
        if (us > them) parts.push([PAY.win, 'por ganar']);
        else if (us === them) parts.push([PAY.draw, 'por el empate']);
        if (tries) parts.push([tries * PAY.try, `por ${tries} ${tries === 1 ? 'try' : 'tries'}`]);
        if (ko && us > them && kind !== 'liga') parts.push([kind === 'wcc' ? PAY.wccRound : kind === 'lib' ? PAY.libRound : kind === 'nac' ? PAY.nacRound : PAY.cupRound, 'por pasar de ronda']);
        if (sponsor) parts.push([sponsor, 'de los sponsors']);
        // De local en la liga (el primero del cruce es el dueño de casa), la cancha deja lo suyo.
        const cancha = r.facilities?.cancha ?? 1;
        if (!ko && kind === 'liga' && m.a === MC_ME && cancha > 1) parts.push([(cancha - 1) * CANCHA_PER_LEVEL, 'de la cancha']);
        const total = parts.reduce((a, [v]) => a + v, 0);
        r.credits += total;
        r.lastGain = `+${total} créditos: ${parts.map(([v, why]) => `${v} ${why}`).join(', ')}.`;
    }
    r.paid = [...paid];
}

/* ───────────────────────── el mercado ───────────────────────── */

/** Seis jugadores para fichar: inventados alrededor del nivel del club y, desde Tercera, de clubes reales de arriba. */
function makeOffers(r: MiClubState, rand: () => number): McOffer[] {
    const level = levelOf(r, MC_ME) ?? 'base';
    const xi = starters(r);
    const avg = xi.reduce((a, p) => a + (p.ovr ?? 1), 0) / Math.max(1, xi.length);
    const team = { ...r.team, namePool: r.team.namePool ?? 'rio' };
    const out: McOffer[] = [];
    // Desde Tercera (los tres escalones de arriba de cada mundo) aparecen jugadores de clubes reales.
    const reals = levelsOf(r).findIndex((l) => l.id === level) < 3 ? 2 : 0;
    // El nivel medio (escala 1-10) de la división de arriba: la vara para subir.
    const aboveLevel = levelsOf(r)[Math.max(0, levelsOf(r).findIndex((l) => l.id === level) - 1)].id;
    const aboveClubs = r.divisions[aboveLevel].filter((c) => c !== MC_ME);
    const aboveCenter = 1 + (aboveClubs.reduce((a, c) => a + ratingOf(c), 0) / Math.max(1, aboveClubs.length) - 40) / 6;
    // El techo del mercado: como mucho 0,6 arriba del techo de la división (y del mundo). Un jugador
    // mejor que la división se consigue fichándolo, pero no es lo normal; sin este tope, cada ventana
    // traía jugadores arriba del propio plantel y el equipo subía sin freno.
    const ceiling = Math.min(worldCeiling(r) - 0.4, divisionCap(r) + 0.6);
    for (let i = 0; i < 6; i++) {
        const id = r.nextId++;
        const age = 19 + Math.floor(rand() * 13);
        if (i < reals) {
            // De un club real de la división de arriba (en Primera, de la misma).
            const above = levelsOf(r)[Math.max(0, levelsOf(r).findIndex((l) => l.id === level) - 1)].id;
            const clubs = [...r.divisions[above]].filter((c) => c !== MC_ME).sort();
            const club = clubs[Math.floor(rand() * clubs.length)];
            const center = 1 + (ratingOf(club) - 40) / 6;
            const player = makePlayer(id, Math.min(ceiling, center + 0.2) + gauss(rand) * 0.5, age, rand);
            const src = AR_CLUBS.find((c) => c.id === club);
            const name = src ? defaultNames(src)[Math.floor(rand() * 7)] : nameFromSeed(team, `${club}:${id}`);
            out.push({ id, player, name, from: club, price: priceOf(player, true) });
        } else {
            // Alrededor del nivel del equipo y, siempre, un par al nivel de la división de arriba (más caros):
            // con esos se sube. Si el club ya está por encima de esa vara, la vara es el propio nivel.
            const target = Math.max(avg, aboveCenter);
            // El techo: nadie en el mercado es mucho mejor que el club más fuerte del mundo. Sin esto, en
            // Sudamérica (clubes más flojos) el plantel crecía sin freno y se llevaba todo.
            const center = Math.min(ceiling, i === reals ? target + 0.4 : i === reals + 1 ? avg + 0.6 : avg + 0.1);
            const player = makePlayer(id, center + gauss(rand) * 0.5, age, rand);
            out.push({ id, player, name: nameFromSeed(team, `${r.team.name}:mercado:${id}`), price: priceOf(player) });
        }
    }
    return out.sort((a, b) => (b.player.ovr ?? 0) - (a.player.ovr ?? 0));
}

/** Por qué no se puede fichar a un jugador (null: se puede). */
export function signBlock(r: MiClubState, o: McOffer): string | null {
    if (r.squad.length >= SQUAD_MAX) return `El plantel está lleno (${SQUAD_MAX}): liberá a un jugador para hacer lugar.`;
    if (r.credits < o.price) return `Te faltan ${o.price - r.credits} créditos.`;
    return null;
}

/** El club propio de un estado, clonado para cambiarlo sin tocar el original. */
function withClub(s: TourState, fn: (r: MiClubState) => void): TourState {
    if (!s.miclub) return s;
    const r: MiClubState = JSON.parse(JSON.stringify(s.miclub));
    fn(r);
    return { ...s, miclub: r };
}

export function mcSign(s: TourState, offerId: number): TourState {
    return withClub(s, (r) => {
        const o = r.offers?.find((x) => x.id === offerId);
        if (!o || signBlock(r, o)) return;
        r.credits -= o.price;
        r.squad.push({ ...o.player, id: o.id });
        r.names[o.id] = o.name;
        r.offers = r.offers!.filter((x) => x.id !== offerId);
        r.news = [...(r.news ?? []), `Fichaste a ${o.name.first} ${o.name.last}${o.from ? ` (de ${CLUB_NAME.get(o.from) ?? o.from})` : ''} por ${o.price} créditos.`];
    });
}

/** Por qué no se puede liberar a un jugador (null: se puede). */
export const releaseBlock = (r: MiClubState, playerId?: number) =>
    playerId !== undefined && r.marquee?.id === playerId ? 'Es tu jugador: no se libera.' : r.squad.length <= SQUAD_MIN ? `Hacen falta al menos ${SQUAD_MIN} jugadores en el plantel.` : null;

export function mcRelease(s: TourState, playerId: number): TourState {
    return withClub(s, (r) => {
        if (releaseBlock(r, playerId)) return;
        const n = r.names[playerId];
        r.squad = r.squad.filter((p) => p.id !== playerId);
        r.lineup = r.lineup?.filter((id) => id !== playerId);
        r.news = [...(r.news ?? []), `Liberaste a ${n ? `${n.first} ${n.last}`.trim() : 'un jugador'}.`];
    });
}

/** Por qué no se puede mejorar a un jugador (null: se puede). */
export function trainBlock(r: MiClubState, p: Player): string | null {
    const cap = divisionCap(r);
    if ((p.ovr ?? 1) >= cap) return `Llegó al techo de la división (${fmt1(cap)}): crece cuando el club sube.`;
    if (seasonGain(r, p.id!) >= SEASON_GROWTH_MAX - 0.05) return `Ya mejoró lo máximo de esta temporada (+${fmt1(SEASON_GROWTH_MAX)}).`;
    const cost = trainCostFor(r, p);
    if (r.credits < cost) return `Te faltan ${cost - r.credits} créditos.`;
    return null;
}

/** Entrenar con créditos: se puede varias veces por temporada, cada vez más caro, sin pasar los topes. */
export function mcTrain(s: TourState, playerId: number): TourState {
    return withClub(s, (r) => {
        const p = r.squad.find((x) => x.id === playerId);
        if (!p || trainBlock(r, p)) return;
        r.credits -= trainCostFor(r, p);
        const before = p.ovr ?? 1;
        const step = Math.max(0, Math.min(trainStepFor(r), divisionCap(r) - before, SEASON_GROWTH_MAX - seasonGain(r, playerId)));
        p.ovr = Math.round(Math.min(10, before + step) * 10) / 10;
        // Al cruzar un número entero, las habilidades acompañan.
        if (Math.floor(p.ovr) > Math.floor(before)) p.s = (p.s ?? [1, 1, 1, 1]).map((v) => Math.min(10, v + 1)) as [number, number, number, number];
        r.gains = { ...(r.gains ?? {}), [playerId]: Math.round((seasonGain(r, playerId) + (p.ovr - before)) * 100) / 100 };
        r.trainings = { ...(r.trainings ?? {}), [playerId]: (r.trainings?.[playerId] ?? 0) + 1 };
        r.trained = [...(r.trained ?? []), playerId];
    });
}

/* ───────────────────────── el calendario ───────────────────────── */

/** El tramo del año de cada torneo (0 a 1): la Nacional, la segunda mitad. */
const WINDOW: Record<McKind, [number, number]> = { liga: [0, 1], cup: [0.03, 0.97], nac: [0.5, 1], lib: [0.58, 1], wcc: [0.66, 1], red: [1, 1.04] };

/** Cuántas fechas tiene un torneo en total: la fase de grupos más las rondas del cuadro. */
function totalDates(t: TourState): number {
    const def = t.def;
    if (def?.stage.kind === 'ko') return Math.max(1, Math.ceil(Math.log2(Math.max(2, def.teams.length))));
    let ko = 0;
    if (t.hasKo && def?.stage.kind === 'grupos') ko = Math.ceil(Math.log2(Math.max(2, def.stage.advance * t.groups.length)));
    return Math.max(1, t.rounds.length + ko);
}

const played = (t: TourState) => t.groupHistory.length + t.koHistory.length;

/** En qué punto del año cae la próxima fecha de un torneo. */
function nextDate(t: TourState): number {
    const [a, b] = WINDOW[kindOf(t)];
    return a + ((b - a) * (played(t) + 0.5)) / totalDates(t);
}

/** Hasta dónde del año llegó un torneo con lo jugado. */
function progress(t: TourState): number {
    const [a, b] = WINDOW[kindOf(t)];
    return t.done ? b : a + ((b - a) * played(t)) / totalDates(t);
}

const KIND_ORDER: McKind[] = ['liga', 'cup', 'nac', 'lib', 'wcc', 'red'];

/** Los torneos propios de la temporada, el de pantalla primero. */
function myTours(s: TourState): TourState[] {
    const r = s.miclub!;
    return [s, ...KIND_ORDER.map((k) => r.parked?.[k]).filter((t): t is TourState => !!t)];
}

/** Los torneos propios que siguen en juego (sin terminar). */
export function liveMine(s: TourState): TourState[] {
    return s.miclub ? myTours(s).filter((t) => !t.done) : [];
}

/** La tabla de una división ahora mismo (para armar la Nacional a mitad de año). */
function ligaNow(s: TourState, level: McLevel): TourState | null {
    const r = s.miclub!;
    if (levelOf(r, MC_ME) === level) return myTours(s).find((t) => kindOf(t) === 'liga') ?? null;
    return r.others[`lvl:${level}`] ?? null;
}

/** Los 64 de la Copa Nacional, con las tablas de mitad de año. */
function nacTeams(s: TourState): string[] {
    const r = s.miclub!;
    const out: string[] = [];
    for (const l of levelsOf(r)) {
        const t = ligaNow(s, l.id);
        if (l.nac.all || !t) {
            out.push(...r.divisions[l.id]);
            continue;
        }
        const tables = t.groups.map((_, gi) => groupStandings(t, gi).map((row) => row.team));
        if (l.nac.top) out.push(...tables[0].slice(0, l.nac.top));
        else out.push(...tables.flatMap((rows) => rows.slice(0, l.nac.perZone ?? 1)));
    }
    return out;
}

/** La Primera del otro mundo esta temporada (la vara de la Copa de América). */
function extDef(r: MiClubState): TourDef {
    const w = otherWorld(r.world ?? 'ar');
    const teams = [...(r.ext ?? [])].sort(byStrength);
    return {
        id: `mc-ext-${r.season}`, name: `Primera de ${WORLDS[w].label} ${r.season}`, sub: 'La Primera del otro lado: sus 8 mejores juegan la Copa de América.',
        formatLabel: `Liga de ${teams.length} y playoff de 4`, teams, source: 'custom', clubs: true, cat: 'Mi Club', stage: { kind: 'grupos', groups: [teams], advance: 4 },
    };
}

/** Los 16 de la Copa de América: los 8 mejores de cada Primera, con la tabla de ese momento. */
function libDef(s: TourState): TourDef {
    const r = s.miclub!;
    const top = topOf(r.world ?? 'ar');
    const mine = ligaNow(s, top);
    const ext = r.others.ext;
    const best = (t: TourState | null | undefined, fallback: string[]) => (t ? groupStandings(t, 0).map((row) => row.team) : fallback).slice(0, LIB_PER_WORLD);
    const teams = [...best(mine, r.divisions[top]), ...best(ext, r.ext ?? [])].sort(byStrength);
    return {
        id: `mc-lib-${r.season}`, name: `${libNameOf(r)} ${r.season}`, sub: `Los ${LIB_PER_WORLD} mejores de la Primera de ${worldOf(r).label} contra los ${LIB_PER_WORLD} mejores de la de ${WORLDS[otherWorld(r.world ?? 'ar')].label}.`,
        formatLabel: `Eliminación directa · ${teams.length} clubes`, teams, source: 'custom', clubs: true, cat: 'Mi Club', stage: { kind: 'ko' },
    };
}

/** Los profesionales de la Copa del Mundo: los más fuertes de cada liga, según su cupo. */
const WCC_PROS: string[] = CLUB_LEAGUES.flatMap((l) => [...l.teams].sort((a, b) => ratingOf(b.id) - ratingOf(a.id) || a.id.localeCompare(b.id)).slice(0, WCC_QUOTA[l.name] ?? 0).map((t) => t.id));

/** Los 32 de la Copa del Mundo: los 4 mejores de la Primera propia (con la tabla de ese momento) y 28 profesionales. */
function wccDef(s: TourState): TourDef {
    const r = s.miclub!;
    const top = topOf(r.world ?? 'ar');
    const mine = ligaNow(s, top);
    const best = (mine ? groupStandings(mine, 0).map((row) => row.team) : r.divisions[top]).slice(0, WCC_FROM_PRIMERA);
    // Los profesionales: los mejores de la tabla de cada liga del mundo en ese momento (si no se juega, por catálogo).
    const pros = CLUB_LEAGUES.flatMap((l) => {
        const t = r.others[`wl:${l.id}`];
        const n = WCC_QUOTA[l.name] ?? 0;
        if (!n) return [];
        return t ? groupStandings(t, 0).slice(0, n).map((row) => row.team) : WCC_PROS.filter((id) => l.teams.some((x) => x.id === id));
    });
    const teams = [...best, ...(pros.length === WCC_PROS.length ? pros : WCC_PROS)];
    return {
        id: `mc-wcc-${r.season}`, name: `${WCC_NAME} ${r.season}`, sub: `Los ${WCC_FROM_PRIMERA} mejores de la Primera de ${worldOf(r).label} contra los profesionales del mundo.`,
        formatLabel: '8 grupos de 4 · pasan los 2 primeros a octavos', teams, source: 'custom', clubs: true, cat: 'Mi Club',
        stage: { kind: 'grupos', groups: 8, advance: 2 },
    };
}

function nacDef(s: TourState): TourDef {
    const r = s.miclub!;
    const teams = nacTeams(s).sort(byStrength);
    return {
        id: `mc-nac-${r.season}`, name: `${nacNameOf(r)} ${r.season}`, sub: 'Primera y Segunda completas, y los mejores de las demás divisiones a mitad de año.',
        formatLabel: `Eliminación directa · ${teams.length} clubes`, teams, source: 'custom', clubs: true, cat: 'Mi Club', stage: { kind: 'ko' },
    };
}

/** Qué se juega primero: el torneo propio con la fecha más temprana (a igual fecha, la liga). */
function onScreen(s: TourState): TourState {
    const r = s.miclub!;
    const live = myTours(s).filter((t) => !t.done);
    if (!live.length) return s;
    const pick = [...live].sort((x, y) => nextDate(x) - nextDate(y) || KIND_ORDER.indexOf(kindOf(x)) - KIND_ORDER.indexOf(kindOf(y)))[0];
    if (pick === s) return s;
    const parked: Partial<Record<McKind, TourState>> = {};
    for (const t of myTours(s)) {
        if (t === pick) continue;
        const x: TourState = { ...t };
        delete x.miclub;
        parked[kindOf(t)] = x;
    }
    return { ...pick, difficulty: s.difficulty, duration: s.duration, miclub: { ...r, parked } };
}

/**
 * Después de cada fecha propia: si ya es mitad de año se arma la Copa Nacional, las divisiones y
 * copas sin el club avanzan hasta la misma altura y pasa a pantalla el torneo que juega primero.
 */
export function mcAfterRound(s0: TourState): TourState {
    if (!s0.miclub) return s0;
    let s: TourState = { ...s0, miclub: { ...s0.miclub, parked: { ...(s0.miclub.parked ?? {}) }, others: { ...s0.miclub.others }, news: [...(s0.miclub.news ?? [])] } };
    const r = s.miclub!;
    // La altura del año: lo más avanzado de los torneos propios que siguen (si no queda ninguno, el final).
    const live = myTours(s).filter((t) => !t.done);
    // Sin torneos propios en juego, el año terminó: lo demás (reducidos incluidos) se juega hasta el final.
    const clock = live.length ? Math.max(...live.map(progress)) : 2;

    // Los partidos propios de esta fecha se cobran (una sola vez cada uno).
    payMatches(r, s);

    // Un torneo propio que se terminó en esta fecha: la noticia.
    if (s0.done && !s0.miclub.news?.includes(s0.tourId)) {
        const name = (defName(s0) ?? '').replace(/ \d{4}$/, '');
        r.news!.push(s0.tourId);
        r.news!.push(s0.champion === MC_ME ? `Campeón de ${kindOf(s0) === 'liga' ? '' : 'la '}${name}.` : kindOf(s0) === 'liga' ? `Terminó ${name}.` : `${name}: afuera en ${placeOf(s0, levelOf(r, MC_ME) ?? 'base').toLowerCase()}.`);
    }

    // A mitad de año se arma la Nacional, con las tablas de ese momento.
    if (!r.nacMade && clock >= WINDOW.nac[0]) {
        r.nacMade = true;
        // El mercado de mitad de año: jugadores nuevos.
        r.offers = makeOffers(r, seeded(`${r.team.name}:${r.season}:mercado-2`));
        r.news!.push('Se abrió el mercado de mitad de año: hay jugadores nuevos para fichar.');
        const def = nacDef(s);
        if (def.teams.includes(MC_ME)) {
            r.parked.nac = mineTour(def, s.difficulty, s.duration);
            r.news!.push(`Clasificaste a la ${nacNameOf(r)}: ${def.teams.length} clubes, con Primera y Segunda.`);
        } else r.others.nac = background(def);
    }

    // Pasada la mitad de año, la Copa de América con los 8 mejores de cada Primera.
    if (!r.libMade && clock >= WINDOW.lib[0]) {
        r.libMade = true;
        const def = libDef(s);
        if (def.teams.includes(MC_ME)) {
            r.parked.lib = mineTour(def, s.difficulty, s.duration);
            r.news!.push(`Clasificaste a la ${libNameOf(r)}: los 8 mejores de cada Primera, mata-mata.`);
        } else r.others.lib = background(def);
    }

    // En el último tercio del año, la Copa del Mundo con los 4 mejores de la Primera.
    if (!r.wccMade && clock >= WINDOW.wcc[0]) {
        r.wccMade = true;
        const def = wccDef(s);
        if (def.teams.includes(MC_ME)) {
            r.parked.wcc = mineTour(def, s.difficulty, s.duration);
            r.news!.push(`Clasificaste a la ${WCC_NAME}: 8 grupos de 4 con los profesionales del mundo, y octavos.`);
        } else r.others.wcc = background(def);
    }

    // Terminó la liga propia y la división tiene reducido: se arma con la tabla final.
    const myLevel = levelOf(r, MC_ME) ?? baseOf(r.world ?? 'ar');
    const myLiga = myTours(s).find((t) => kindOf(t) === 'liga');
    if (myLiga?.done && levelDef(myLevel).red && !myTours(s).some((t) => kindOf(t) === 'red') && !r.others[`red:${myLevel}`]) {
        const def = redDef(r, myLevel, myLiga)!;
        if (def.teams.includes(MC_ME)) {
            const pos = groupStandings(myLiga, 0).findIndex((row) => row.team === MC_ME) + 1;
            r.parked.red = mineTour(def, s.difficulty, s.duration);
            r.news!.push(`Terminaste ${pos}.º: jugás el ${redName(myLevel)} por el segundo ascenso.`);
        } else r.others[`red:${myLevel}`] = background(def);
    }

    for (const [k, t0] of Object.entries(r.others)) {
        let t = t0;
        for (let guard = 0; guard < 80 && !t.done && nextDate(t) <= clock; guard++) t = closeRound(t, null);
        r.others[k] = t;
        // Una liga sin el club que terminó y tiene reducido: se arma el suyo.
        const lvl = k.startsWith('lvl:') ? k.slice(4) : k.startsWith('ow:') ? k.slice(3) : null;
        const redKey = k.startsWith('lvl:') ? `red:${lvl}` : `owred:${lvl}`;
        if (lvl && t.done && levelDef(lvl as McLevel).red && !r.others[redKey]) {
            let red = background(redDef(r, lvl as McLevel, t)!);
            for (let guard = 0; guard < 8 && !red.done && nextDate(red) <= clock; guard++) red = closeRound(red, null);
            r.others[redKey] = red;
        }
    }
    s = onScreen(s);
    return s;
}

/** El reducido de una división, terminado (si todavía no se había armado, se arma con la liga). */
function redFinished(r: MiClubState, level: McLevel, liga: TourState, mine?: TourState): TourState | null {
    if (!levelDef(level).red) return null;
    const def = redDef(r, level, liga);
    if (!def) return null;
    return finishTour(mine ?? r.others[`red:${level}`] ?? background(def));
}

const defName = (t: TourState) => t.def?.name;

/* ───────────────────────── la temporada nueva ───────────────────────── */

/** Arma la temporada: la liga y la copa propias, y todo lo demás sin el club. */
export function startSeason(r: MiClubState, difficulty: Difficulty, duration: Duration): TourState {
    const mine = levelOf(r, MC_ME) ?? 'base';
    r.others = {};
    r.parked = {};
    r.nacMade = false;
    r.libMade = false;
    r.wccMade = false;
    r.news = [];
    r.paid = [];
    r.trained = [];
    r.gains = {};
    r.trainings = {};
    r.record = [0, 0, 0];
    r.lastGain = undefined;
    const rand = seeded(`${r.team.name}:${r.season}:mercado`);
    r.sponsors = sponsorsFor(r, rand);
    r.offers = makeOffers(r, rand);
    for (const l of levelsOf(r)) {
        if (l.id !== mine) r.others[`lvl:${l.id}`] = background(levelTourDef(r, l.id));
        if (l.id !== topOf(r.world ?? 'ar') && l.id !== mine) r.others[`cup:${l.id}`] = background(cupDef(r, l.id));
    }
    if (mine !== topOf(r.world ?? 'ar')) r.parked.cup = mineTour(cupDef(r, mine), difficulty, duration);
    if (r.ext?.length) r.others.ext = background(extDef(r));
    // El resto del mundo, a la par desde el primer año: las otras divisiones del otro lado y las ligas profesionales.
    const ow = otherWorldDivisions(r);
    for (const l of WORLDS[otherWorld(r.world ?? 'ar')].levels) {
        const clubs = ow[l.id];
        if (clubs && l.id !== topOf(otherWorld(r.world ?? 'ar'))) r.others[`ow:${l.id}`] = background(otherLevelDef(r, l.id, clubs));
    }
    for (const wl of WORLD_LEAGUES) {
        const def = worldLeagueDef(r, wl.id);
        if (def) r.others[`wl:${wl.id}`] = background(def);
    }
    const liga: TourState = { ...mineTour(levelTourDef(r, mine), difficulty, duration), miclub: r };
    return onScreen(liga);
}

/** Lo que eligió el usuario al fundar el club. */
export interface McFounding {
    team: SevenTeam;
    region: McRegion;
    world?: McWorld;
    /** Tu jugador: su nombre, su puesto (0 a 6) y cuál de las siete caras del club es la suya. */
    player?: { name: string; pos: number; look: number };
}

/** El nivel con el que arranca tu jugador: un poco arriba del de su división (y debajo del techo). */
export const marqueeStartOvr = (r: MiClubState) => {
    const level = levelOf(r, MC_ME) ?? levelsOf(r).at(-1)!.id;
    return Math.round(Math.min(divisionCap(r) - 0.1, levelCenter(r, level) + 1.5) * 10) / 10;
};

export function createMiClub(f: McFounding, difficulty: Difficulty, duration: Duration, seed = `${Date.now()}`): TourState {
    const rand = seeded(`${seed}:${f.team.name}`);
    const name = f.team.name.trim();
    const r: MiClubState = {
        v: 1,
        me: MC_ME,
        team: { ...f.team, id: MC_ME, custom: true, name, short: f.team.short.trim().toUpperCase() },
        region: f.region,
        world: f.world ?? 'ar',
        // La Primera del otro mundo: sus 12 más fuertes (para la Copa de América).
        ext: [...WORLDS[otherWorld(f.world ?? 'ar')].pool].sort(byStrength).slice(0, 12),
        season: 2026,
        divisions: initialDivisions(f.world ?? 'ar'),
        regions: { ...REGION_OF, [MC_ME]: f.region },
        squad: [],
        names: {},
        nextId: 1,
        credits: 0,
        facilities: { cancha: 1, entreno: 1, inferiores: 1 },
        parked: {},
        others: {},
        history: [],
        titles: [],
        log: [`2026: se funda ${name}, en la Regional de ${mcRegionLabel(f.region)}${f.world && f.world !== 'ar' ? ` (${WORLDS[f.world].label})` : ''}.`],
    };
    initialSquad(r, rand);
    if (f.player?.name.trim()) {
        // Tu jugador: arriba del nivel de la Regional, en su puesto y con la cara que elegiste.
        const id = r.nextId++;
        const p = makePlayer(id, marqueeStartOvr(r), 19, rand);
        p.ovr = marqueeStartOvr(r);
        r.squad.push(p);
        r.names[id] = nameFromText(f.player.name.trim());
        const pos = Math.max(0, Math.min(6, f.player.pos));
        const look = Math.max(0, Math.min(6, f.player.look));
        if (look !== pos) {
            const players = [...r.team.players];
            [players[pos], players[look]] = [players[look], players[pos]];
            r.team = { ...r.team, players };
        }
        r.marquee = { id, pos };
        r.log.push(`2026: ${r.names[id].first} ${r.names[id].last} arranca su carrera en ${name}.`.replace('  ', ' '));
    }
    return startSeason(r, difficulty, duration);
}

/* ───────────────────────── cierre de la temporada ───────────────────────── */

function finishTour(t: TourState): TourState {
    let x = t;
    for (let guard = 0; guard < 200 && !x.done; guard++) x = closeRound(x, null);
    return x;
}

/** Los clubes que llegaron a la ronda del cuadro que juegan `n` (16: octavos, 8: cuartos, 4: semis, 2: final). */
function reachedRound(t: TourState, n: number): string[] {
    const h = t.koHistory.find((x) => x.results.length * 2 === n);
    return h ? h.results.flatMap((r) => [r.a, r.b]) : [];
}

/** Quiénes suben y quiénes bajan de una división terminada. */
function movesOf(t: TourState, level: McLevel, red?: TourState | null): { up: string[]; down: string[] } {
    const l = levelDef(level);
    const tables = t.groups.map((_, gi) => groupStandings(t, gi).map((row) => row.team));
    let up: string[] = [];
    if (l.red) {
        // El primero, directo; el otro, el que gana el reducido.
        const won = red ? red.champion ?? finalRanking(red)[0] : tables[0][1];
        up = [tables[0][0], ...(won ? [won] : [])];
    } else if (l.up) up = l.zones ? reachedRound(t, l.up) : tables[0].slice(0, l.up);
    // Si un cuadro quedó incompleto (no debería), se completa con el orden final.
    if (up.length < l.up) for (const id of finalRanking(t)) if (up.length < l.up && !up.includes(id)) up.push(id);
    const perZone = l.zones ? Math.ceil(l.down / l.zones) : l.down;
    const down = l.down ? tables.flatMap((rows) => rows.slice(rows.length - perZone)).filter((id) => !up.includes(id)) : [];
    return { up: up.slice(0, l.up), down: down.slice(0, l.down) };
}

/** Hasta dónde llegó el club en un torneo (para la historia y el cartel). */
function placeOf(t: TourState, level: McLevel): string {
    if (t.champion === MC_ME) return 'Campeón';
    const ko = [...t.koHistory].reverse().find((h) => h.results.some((r) => r.a === MC_ME || r.b === MC_ME));
    if (ko) return ko.label;
    const gi = t.groups.findIndex((g) => g.includes(MC_ME));
    const pos = gi >= 0 ? groupStandings(t, gi).findIndex((row) => row.team === MC_ME) + 1 : 0;
    return levelDef(level).zones ? `${pos}.º de su zona` : `${pos}.º`;
}

/** Un año más: los pibes crecen, los grandes bajan, los de 34 se retiran y suben juveniles. */
function developSquad(r: MiClubState, rand: () => number): string[] {
    const notes: string[] = [];
    const team = { ...r.team, namePool: r.team.namePool ?? 'rio' };
    const avg = r.squad.reduce((a, p) => a + (p.ovr ?? 1), 0) / Math.max(1, r.squad.length);
    const out: Player[] = [];
    // Lo que rindió el año: los titulares crecen más, y más cuanto mejor le fue al equipo.
    const xi = new Set(starters(r).map((p) => p.id));
    const form = winRate(r);
    const cap = divisionCap(r);
    for (const p of r.squad) {
        const age = p.age + 1;
        const isMarquee = r.marquee?.id === p.id;
        // Tu jugador se retira más tarde (a los 37); el resto, a los 34.
        if (age >= (isMarquee ? 37 : 34)) {
            const n = r.names[p.id!];
            notes.push(`Se retira ${isMarquee ? 'tu jugador, ' : ''}${n ? `${n.first} ${n.last}`.trim() : 'un jugador'} (${p.age} años).`);
            if (isMarquee) r.marquee = undefined;
            continue;
        }
        // Por la edad, poco: los pibes suben de a poco y los grandes bajan.
        const base = age <= 21 ? 0.25 : age <= 24 ? 0.15 : age <= 28 ? 0.05 : age <= 31 ? -0.1 : -0.3;
        const play = xi.has(p.id) ? 0.1 + 0.35 * form : 0.03;
        // El entrenamiento (la instalación) suma a todos un poco por año.
        const gym = 0.04 * ((r.facilities?.entreno ?? 1) - 1);
        const now = p.ovr ?? 1;
        let grow = base + play + gym + gauss(rand) * 0.08;
        // Los topes: nunca más de 1,5 en el año (contando lo entrenado) ni arriba del techo de la división.
        if (grow > 0) grow = Math.max(0, Math.min(grow, SEASON_GROWTH_MAX - seasonGain(r, p.id!), cap - now));
        const ovr = Math.round(Math.max(1, Math.min(10, now + grow)) * 10) / 10;
        const step = Math.round(ovr - (p.ovr ?? 1));
        const s = (p.s ?? [1, 1, 1, 1]).map((v) => Math.max(1, Math.min(10, v + step))) as [number, number, number, number];
        out.push({ ...p, age, ovr, s });
    }
    // Las vacantes, de las inferiores: pibes de 18, un poco por debajo del plantel.
    while (out.length < 12) {
        const id = r.nextId++;
        const p = makePlayer(id, avg - 0.4 + gauss(rand) * 0.5, 18, rand);
        r.names[id] = nameFromSeed(team, `${r.team.name}:${id}`);
        notes.push(`Sube de las inferiores ${r.names[id].first} ${r.names[id].last}.`);
        out.push(p);
    }
    // El juvenil del año, de regalo: mejor cuanto más alto el nivel de las inferiores (si hay lugar).
    if (out.length < SQUAD_MAX) {
        const id = r.nextId++;
        const p = makePlayer(id, avg - 0.7 + 0.25 * ((r.facilities?.inferiores ?? 1) - 1) + gauss(rand) * 0.4, 18, rand);
        r.names[id] = nameFromSeed(team, `${r.team.name}:${id}`);
        notes.push(`Llega de las inferiores ${r.names[id].first} ${r.names[id].last} (valoración ${(p.ovr ?? 1).toFixed(1).replace('.', ',')}).`);
        out.push(p);
    } else notes.push('El juvenil del año no tuvo lugar: el plantel está lleno.');
    r.squad = out;
    r.lineup = r.lineup?.filter((id) => out.some((p) => p.id === id));
    return notes;
}

/** Los torneos propios de la temporada por tipo (los de pantalla y los que esperan). */
function mineByKind(s: TourState): Partial<Record<McKind, TourState>> {
    const out: Partial<Record<McKind, TourState>> = {};
    for (const t of myTours(s)) out[kindOf(t)] = t;
    return out;
}

/** El cartel del final de la temporada: qué pasó en la liga, en las copas y qué viene. */
export function mcVerdict(s: TourState): { title: string; text: string; next: string } | null {
    const r = s.miclub;
    if (!r || liveMine(s).length) return null;
    const level = levelOf(r, MC_ME) ?? 'base';
    const l = levelDef(level);
    const mine = mineByKind(s);
    const liga = mine.liga ? finishTour(mine.liga) : null;
    if (!liga) return null;
    const red = redFinished(r, level, liga, mine.red);
    const { up, down } = movesOf(liga, level, red);
    const above = levelsOf(r)[levelsOf(r).indexOf(l) - 1];
    const below = levelsOf(r)[levelsOf(r).indexOf(l) + 1];
    const title = liga.champion === MC_ME ? `Campeón de ${l.label}` : up.includes(MC_ME) ? `Ascenso a ${above?.label}` : down.includes(MC_ME) ? `Descenso a ${below?.label}` : `${l.label} ${r.season}: ${placeOf(liga, level).toLowerCase()}`;
    const lic = nextLicense(r);
    const blocked = up.includes(MC_ME) && !!lic && !lic.ok;
    const parts = [
        blocked
            ? `Ganaste el ascenso, pero ${above?.label} pide la cancha en nivel ${lic!.need} y la tuya está en ${r.facilities?.cancha ?? 1}. Mejorala en Club antes de pasar de temporada o sube otro en tu lugar.`
            : up.includes(MC_ME)
              ? `${r.team.name} juega en ${above?.label} la temporada que viene.`
              : down.includes(MC_ME)
                ? `${r.team.name} vuelve a ${below?.label}.`
                : `${r.team.name} sigue en ${l.label}.`,
    ];
    if (mine.red) parts.push(`${redName(level)}: ${mine.red.champion === MC_ME ? 'lo ganaste' : placeOf(mine.red, level).toLowerCase()}.`);
    else if (red && !up.includes(MC_ME) && l.red) parts.push(`${redName(level)}: lo ganó ${CLUB_NAME.get(red.champion ?? '') ?? red.champion}.`);
    if (mine.cup) parts.push(`${cupName(level)}: ${placeOf(mine.cup, level).toLowerCase()}.`);
    if (mine.nac) parts.push(`${nacNameOf(r)}: ${placeOf(mine.nac, level).toLowerCase()}.`);
    if (mine.lib) parts.push(`${libNameOf(r)}: ${placeOf(mine.lib, level).toLowerCase()}.`);
    if (mine.wcc) parts.push(`${WCC_NAME}: ${placeOf(mine.wcc, level).toLowerCase()}.`);
    return { title: blocked ? `${title} · falta la cancha` : title, text: parts.join(' '), next: `Temporada ${r.season + 1}` };
}

/** Cierra el año: asienta la pirámide con las ligas, anota los títulos, desarrolla el plantel y arranca el siguiente. */
export function advanceMiClub(s0: TourState): TourState {
    if (!s0.miclub || liveMine(s0).length) return s0;
    const r: MiClubState = JSON.parse(JSON.stringify(s0.miclub));
    const mineLevel = levelOf(r, MC_ME) ?? 'base';
    const mine = mineByKind(s0);
    const ligaOf = (level: McLevel) => (level === mineLevel ? mine.liga : r.others[`lvl:${level}`]);
    const ligas: Partial<Record<McLevel, TourState>> = {};
    for (const l of levelsOf(r)) {
        const t = ligaOf(l.id);
        if (t) ligas[l.id] = finishTour(t);
    }
    const nac = mine.nac ?? (r.others.nac ? finishTour(r.others.nac) : null);

    // Historia y títulos del club propio: la liga, la copa y la Nacional.
    const liga = ligas[mineLevel];
    const parts = [liga ? placeOf(liga, mineLevel) : '—'];
    if (mine.red) parts.push(`reducido: ${placeOf(mine.red, mineLevel).toLowerCase()}`);
    if (mine.cup) parts.push(`copa: ${placeOf(mine.cup, mineLevel).toLowerCase()}`);
    if (mine.nac) parts.push(`${nacNameOf(r)}: ${placeOf(mine.nac, mineLevel).toLowerCase()}`);
    if (mine.lib) parts.push(`América: ${placeOf(mine.lib, mineLevel).toLowerCase()}`);
    if (mine.wcc) parts.push(`Mundo: ${placeOf(mine.wcc, mineLevel).toLowerCase()}`);
    r.history.push({ season: r.season, level: mineLevel, place: parts.join(' · ') });
    if (liga?.champion === MC_ME) r.titles.push({ season: r.season, label: levelDef(mineLevel).label });
    if (mine.cup?.champion === MC_ME) r.titles.push({ season: r.season, label: cupName(mineLevel) });
    if (mine.nac?.champion === MC_ME) r.titles.push({ season: r.season, label: nacNameOf(r) });
    if (mine.lib?.champion === MC_ME) r.titles.push({ season: r.season, label: libNameOf(r) });
    if (mine.wcc?.champion === MC_ME) r.titles.push({ season: r.season, label: WCC_NAME });
    const champ = (t: TourState | null | undefined) => (t?.champion ? (t.champion === MC_ME ? r.team.name : CLUB_NAME.get(t.champion) ?? t.champion) : null);
    for (const l of levelsOf(r)) {
        const c = champ(ligas[l.id]);
        if (c) r.log.push(`${r.season}: ${l.label}, campeón ${c}.`);
    }
    if (champ(nac)) r.log.push(`${r.season}: ${nacNameOf(r)}, campeón ${champ(nac)}.`);
    const lib = mine.lib ?? (r.others.lib ? finishTour(r.others.lib) : null);
    if (champ(lib)) r.log.push(`${r.season}: ${libNameOf(r)}, campeón ${champ(lib)}.`);
    const wcc = mine.wcc ?? (r.others.wcc ? finishTour(r.others.wcc) : null);
    if (champ(wcc)) r.log.push(`${r.season}: ${WCC_NAME}, campeón ${champ(wcc)}.`);

    // Los movimientos, de una vez (así nadie sube dos escalones).
    const moves: Record<string, { up: string[]; down: string[] }> = {};
    for (const l of levelsOf(r)) {
        const lg = ligas[l.id];
        moves[l.id] = lg ? movesOf(lg, l.id, redFinished(r, l.id, lg, l.id === mineLevel ? mine.red : undefined)) : { up: [], down: [] };
    }
    // La licencia: sin la cancha que pide la división de arriba, el club no sube y sube el siguiente.
    const licNotes: string[] = [];
    const lic = nextLicense(r);
    const myMoves = moves[mineLevel];
    if (lic && !lic.ok && myMoves.up.includes(MC_ME) && liga) {
        const instead = finalRanking(liga).find((id) => id !== MC_ME && !myMoves.up.includes(id) && !myMoves.down.includes(id));
        myMoves.up = myMoves.up.filter((id) => id !== MC_ME);
        if (instead) myMoves.up.push(instead);
        licNotes.push(`Ganaste el ascenso, pero ${levelDef(lic.level).label} pide la cancha en nivel ${lic.need} y la tuya está en ${r.facilities?.cancha ?? 1}: ${instead ? `sube ${CLUB_NAME.get(instead) ?? instead} en tu lugar` : 'no subís'}.`);
    }
    const next = {} as Record<McLevel, string[]>;
    const lines: string[] = [];
    levelsOf(r).forEach((l, i) => {
        const stay = r.divisions[l.id].filter((id) => !moves[l.id].up.includes(id) && !moves[l.id].down.includes(id));
        const fromBelow = levelsOf(r)[i + 1] ? moves[levelsOf(r)[i + 1].id].up : [];
        const fromAbove = levelsOf(r)[i - 1] ? moves[levelsOf(r)[i - 1].id].down : [];
        next[l.id] = [...stay, ...fromBelow, ...fromAbove];
        for (const id of fromBelow) lines.push(`up|${id}|${levelsOf(r)[i + 1].id}|${l.id}`);
        for (const id of fromAbove) lines.push(`down|${id}|${levelsOf(r)[i - 1].id}|${l.id}`);
    });
    r.divisions = next;
    r.moves = { season: r.season, lines };

    // Los premios del año.
    const prizes: [number, string][] = [];
    if (moves[mineLevel].up.includes(MC_ME)) prizes.push([PRIZE.ascenso, 'el ascenso']);
    if (liga?.champion === MC_ME) prizes.push([PRIZE.liga, `el título de ${levelDef(mineLevel).label}`]);
    if (mine.cup?.champion === MC_ME) prizes.push([PRIZE.copa, `la ${cupName(mineLevel)}`]);
    if (mine.nac?.champion === MC_ME) prizes.push([PRIZE.nac, `la ${nacNameOf(r)}`]);
    if (mine.lib?.champion === MC_ME) prizes.push([PRIZE.lib, `la ${libNameOf(r)}`]);
    if (mine.wcc?.champion === MC_ME) prizes.push([PRIZE.wcc, `la ${WCC_NAME}`]);
    for (const [v] of prizes) r.credits += v;

    const rand = seeded(`${r.team.name}:${r.season}:cierre`);
    r.lastNotes = [...licNotes, ...prizes.map(([v, why]) => `Premio por ${why}: ${v} créditos.`), ...developSquad(r, rand)];
    r.season += 1;
    return startSeason(r, s0.difficulty, s0.duration);
}

/** Ascensos y descensos de la última temporada cerrada, por división de origen. */
export function movesByLevel(r: MiClubState): { level: McLevelDef; up: string[]; down: string[] }[] {
    const lines = (r.moves?.lines ?? []).map((line) => line.split('|'));
    return levelsOf(r).map((level) => ({
        level,
        up: lines.filter(([k, , from]) => k === 'up' && from === level.id).map(([, id]) => id),
        down: lines.filter(([k, , from]) => k === 'down' && from === level.id).map(([, id]) => id),
    })).filter((x) => x.up.length || x.down.length);
}

/** Qué le pasó al club propio en el último cierre. */
export function myMove(r: MiClubState): { up: boolean; to: McLevel } | null {
    const line = (r.moves?.lines ?? []).map((l) => l.split('|')).find(([, id]) => id === MC_ME);
    return line ? { up: line[0] === 'up', to: line[3] as McLevel } : null;
}

/* ───────────────────────── para mirar ───────────────────────── */

export interface McView {
    level: McLevelDef;
    /** La liga de la división, en vivo. */
    liga: TourState | null;
    /** Su copa (Primera no tiene), en vivo. */
    cup: TourState | null;
    mine: boolean;
}

/** Todas las divisiones de la pirámide, de arriba hacia abajo, con su liga y su copa. */
export function pyramidTours(s: TourState): McView[] {
    const r = s.miclub;
    if (!r) return [];
    const mineLevel = levelOf(r, MC_ME);
    const mine = mineByKind(s);
    return levelsOf(r).map((l) => {
        const isMine = l.id === mineLevel;
        return {
            level: l,
            liga: (isMine ? mine.liga : r.others[`lvl:${l.id}`]) ?? null,
            cup: (isMine ? mine.cup : r.others[`cup:${l.id}`]) ?? null,
            mine: isMine,
        };
    });
}

/** La Copa Nacional de la temporada (la del club o la que se juega sin él); null antes de mitad de año. */
/** La Copa del Mundo de Clubes de la temporada (null antes de que se arme). */
export function mundialView(s: TourState): TourState | null {
    const r = s.miclub;
    if (!r) return null;
    return mineByKind(s).wcc ?? r.others.wcc ?? null;
}

/** La Copa de América de la temporada y la Primera del otro mundo (null antes de que se armen). */
export function americaView(s: TourState): { lib: TourState | null; ext: TourState | null } {
    const r = s.miclub;
    if (!r) return { lib: null, ext: null };
    return { lib: mineByKind(s).lib ?? r.others.lib ?? null, ext: r.others.ext ?? null };
}

export function nacionalView(s: TourState): TourState | null {
    const r = s.miclub;
    if (!r) return null;
    return mineByKind(s).nac ?? r.others.nac ?? null;
}

/** Cómo se entra a la Copa Nacional (Argentina), en palabras. */
export const NAC_HOW = MC_LEVELS.map((l) => `${l.label}: ${l.nac.how}`).join(' · ');

/** El nombre del torneo en pantalla (para el chip del hub). */
export function phaseName(s: TourState): string {
    const r = s.miclub;
    if (!r) return '';
    const level = levelOf(r, MC_ME) ?? 'base';
    const k = kindOf(s);
    return k === 'red' ? redName(level) : k === 'cup' ? cupName(level) : k === 'nac' ? nacNameOf(r) : k === 'lib' ? libNameOf(r) : k === 'wcc' ? WCC_NAME : levelDef(level).label;
}

/** Las noticias de la temporada (sin las marcas internas). */
export const seasonNews = (r: MiClubState) => (r.news ?? []).filter((n) => !n.startsWith('mc-'));

/** Qué significa cada puesto de una tabla de la pirámide. */
export type McTag = 'playoff' | 'ascenso' | 'reducido' | 'descenso' | null;

export function tagFor(level: McLevel, place: number, zoneSize: number): McTag {
    const l = levelDef(level);
    if (l.red) {
        if (place === 0) return 'ascenso';
        if (place <= l.red) return 'reducido';
    }
    if (l.advance && place < l.advance) return 'playoff';
    if (!l.advance && l.up && place < l.up) return 'ascenso';
    const downHere = l.zones ? Math.ceil(l.down / l.zones) : l.down;
    if (downHere && place >= zoneSize - downHere) return 'descenso';
    return null;
}

export const TAG_LABEL: Record<Exclude<McTag, null>, string> = {
    playoff: 'Pasa al cuadro',
    ascenso: 'Ascenso',
    reducido: 'Reducido por el ascenso',
    descenso: 'Descenso',
};

/**
 * A qué copa da el puesto de una tabla (la marca amarilla): en Primera, el Mundial de Clubes y la
 * Copa de América; en el resto, la Copa Nacional (o Continental) que se arma a mitad de año.
 * Donde entran todos, no se marca nada: no hay nada que pelear.
 */
export function cupSpot(r: { world?: McWorld }, level: McLevel, place: number, ext = false): string | null {
    const l = levelDef(level);
    if (level === topOf(ext ? otherWorld(r.world ?? 'ar') : r.world ?? 'ar')) {
        if (!ext && place < WCC_FROM_PRIMERA) return `${WCC_NAME} y Copa de América`;
        return place < LIB_PER_WORLD ? 'Copa de América' : null;
    }
    if (ext || l.nac.all) return null;
    const n = l.nac.top ?? l.nac.perZone ?? 1;
    return place < n ? nacNameOf(r) : null;
}

/** Las ligas del mundo que se juegan a la par (las de los profesionales del Mundial de Clubes). */
export const WORLD_LEAGUES = CLUB_LEAGUES.filter((l) => l.teams.length >= 4).map((l) => ({ id: l.id, name: l.name }));

/** Una liga profesional del mundo esta temporada: todos contra todos y playoff de 4 si son 8 o más. */
function worldLeagueDef(r: MiClubState, id: string): TourDef | null {
    const lg = CLUB_LEAGUES.find((l) => l.id === id);
    if (!lg) return null;
    const teams = lg.teams.map((t) => t.id);
    const big = teams.length >= 8;
    return {
        id: `mc-wl-${id}-${r.season}`, name: `${lg.name} ${r.season}`, sub: big ? 'Todos contra todos y semifinales entre los 4 primeros.' : 'Todos contra todos.',
        formatLabel: big ? `Liga de ${teams.length} y playoff de 4` : `Liga de ${teams.length}`, teams, source: 'custom', clubs: true, cat: 'Mi Club',
        stage: big ? { kind: 'grupos', groups: [teams], advance: 4 } : { kind: 'liga', legs: 1 },
    };
}

/** Las divisiones del otro mundo (por nivel de catálogo, sin la Regional): se juegan a la par para mirarlas. */
function otherWorldDivisions(r: MiClubState): Partial<Record<McLevel, string[]>> {
    const w = otherWorld(r.world ?? 'ar');
    const ranked = [...WORLDS[w].pool].sort(byStrength);
    const out: Partial<Record<McLevel, string[]>> = {};
    let i = 0;
    for (const l of WORLDS[w].levels) {
        if (!l.size) break;
        out[l.id] = ranked.slice(i, i + l.size);
        i += l.size;
    }
    return out;
}

/** Una división del otro mundo esta temporada. */
function otherLevelDef(r: MiClubState, level: McLevel, clubs: string[]): TourDef {
    const w = otherWorld(r.world ?? 'ar');
    const fake: MiClubState = { ...r, world: w, divisions: { ...r.divisions, [level]: clubs } };
    return { ...levelTourDef(fake, level), id: `mc-ow-${level}-${r.season}`, name: `${levelDef(level).label} de ${WORLDS[w].label} ${r.season}` };
}

/** Un torneo para mirar en el explorador. */
export interface McBrowseItem {
    key: string;
    label: string;
    t: TourState | null;
    /** Nivel con el que se leen las etiquetas de la tabla (las ligas de la pirámide). */
    level?: McLevel;
    /** Es del otro mundo (para las marcas de copa). */
    ext?: boolean;
    /** Cómo se juega, en palabras. */
    how: string;
    /** Cuándo se arma, si todavía no empezó. */
    when?: string;
    mine?: boolean;
}

export interface McBrowseScope {
    id: 'mine' | 'other' | 'world';
    label: string;
    ligas: McBrowseItem[];
    copas: McBrowseItem[];
}

/** Todo lo que se juega esta temporada, por ámbito (tu país, el otro mundo, el mundo) y por liga o copa. */
export function browseScopes(s: TourState): McBrowseScope[] {
    const r = s.miclub;
    if (!r) return [];
    const world = r.world ?? 'ar';
    const other = otherWorld(world);
    const mineLevel = levelOf(r, MC_ME);
    const mine = mineByKind(s);
    const ligas: McBrowseItem[] = [];
    const copas: McBrowseItem[] = [];
    for (const l of levelsOf(r)) {
        const isMine = l.id === mineLevel;
        ligas.push({ key: `lvl:${l.id}`, label: `${l.label}${isMine ? ' · tu división' : ''}`, t: (isMine ? mine.liga : r.others[`lvl:${l.id}`]) ?? null, level: l.id, how: l.upHow, mine: isMine });
        if (l.red) {
            const red = (isMine ? mine.red : undefined) ?? r.others[`red:${l.id}`] ?? null;
            copas.push({ key: `red:${l.id}`, label: redName(l.id), t: red, how: `Del 2.º al ${1 + l.red}.º de ${l.label}: el ganador sube con el primero.`, when: 'al terminar la liga', mine: isMine && !!mine.red });
        }
    }
    for (const l of levelsOf(r)) {
        if (l.id === topOf(world)) continue;
        const isMine = l.id === mineLevel;
        copas.push({ key: `cup:${l.id}`, label: cupName(l.id), t: (isMine ? mine.cup : r.others[`cup:${l.id}`]) ?? null, how: 'Todos los clubes de la división, a eliminación directa. Los más fuertes arrancan una ronda más adelante.', mine: isMine });
    }
    copas.push({ key: 'nac', label: nacNameOf(r), t: mine.nac ?? r.others.nac ?? null, how: `Armada a mitad de año con la tabla de ese momento: ${nacHowOf(r)}.`, when: 'desde mitad de año', mine: !!mine.nac });
    const libItem: McBrowseItem = { key: 'lib', label: libNameOf(r), t: mine.lib ?? r.others.lib ?? null, how: `Los ${LIB_PER_WORLD} mejores de la Primera de ${WORLDS[world].label} contra los ${LIB_PER_WORLD} mejores de la de ${WORLDS[other].label}, mata-mata.`, when: 'pasada la mitad de año', mine: !!mine.lib };
    const wccItem: McBrowseItem = { key: 'wcc', label: WCC_NAME, t: mine.wcc ?? r.others.wcc ?? null, how: `Los ${WCC_FROM_PRIMERA} mejores de la Primera de ${WORLDS[world].label} contra los profesionales del mundo: 8 grupos de 4 y octavos.`, when: 'en el último tercio del año', mine: !!mine.wcc };
    copas.push(libItem, wccItem);

    // El otro mundo: su Primera (la de la Copa de América) y el resto de sus divisiones.
    const oLigas: McBrowseItem[] = [];
    for (const l of WORLDS[other].levels) {
        if (!l.size) continue;
        const t = l.id === topOf(other) ? r.others.ext ?? null : r.others[`ow:${l.id}`] ?? null;
        oLigas.push({ key: `ow:${l.id}`, label: l.label, t, level: l.id, ext: true, how: l.id === topOf(other) ? `Sus ${LIB_PER_WORLD} mejores van a la ${libNameOf(r)}.` : 'Se juega a la par, para mirar.' });
    }
    const oCopas: McBrowseItem[] = [libItem];
    for (const l of WORLDS[other].levels) {
        const red = r.others[`owred:${l.id}`];
        if (l.red) oCopas.push({ key: `owred:${l.id}`, label: `${redName(l.id)} (${WORLDS[other].label})`, t: red ?? null, how: `Del 2.º al ${1 + l.red}.º de la tabla: el ganador sube con el primero.`, when: 'al terminar la liga' });
    }

    const wLigas: McBrowseItem[] = WORLD_LEAGUES.map((l) => ({ key: `wl:${l.id}`, label: l.name, t: r.others[`wl:${l.id}`] ?? null, how: 'Los profesionales: de acá salen los rivales de la Copa del Mundo de Clubes.' }));

    return [
        { id: 'mine', label: WORLDS[world].label, ligas, copas },
        { id: 'other', label: WORLDS[other].label, ligas: oLigas, copas: oCopas },
        { id: 'world', label: 'Mundo', ligas: wLigas, copas: [wccItem] },
    ];
}
