import type { PlayerName } from './names';
import { randomLook, type Kit, type Look } from './sprites';
import { isTourState, type TourState } from './tours';

export interface SevenTeam {
    id: string;
    name: string;
    short: string; // tres letras para el marcador
    kit: Kit;
    players: Look[]; // siempre 7
    custom?: boolean;
    rating?: number; // 40-95; si falta, 70
    flag?: string; // código ISO para la bandera (selecciones; en los clubes, la de su país)
    namePool?: string; // de qué lista salen los nombres ficticios (clubes: la de su país)
    /** Equipo femenino: jugadoras (peinados largos) y nombres de mujer. */
    fem?: boolean;
    league?: string; // clubes: la liga donde juega
    /** Plantel con nombres propios (el modo carrera: renovaciones y nombres editados). Sin esto, los de fábrica. */
    names?: PlayerName[];
}

export type Difficulty = 'muy-facil' | 'facil' | 'normal' | 'dificil' | 'leyenda';

export const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
    { id: 'muy-facil', label: 'Muy fácil', hint: 'Solo para empezar: aprender los controles.' },
    { id: 'facil', label: 'Fácil', hint: 'Para amigarse con los controles.' },
    { id: 'normal', label: 'Normal', hint: 'Para jugar en serio: tacklean y leen el pase.' },
    { id: 'dificil', label: 'Difícil', hint: 'Muy exigente: cada metro cuesta.' },
    { id: 'leyenda', label: 'Leyenda', hint: 'Para cracks: no perdona nada.' },
];

export const DURATIONS = [3, 5, 7] as const;
export type Duration = (typeof DURATIONS)[number];

/** Perillas de la dificultad. Todo lo que cambia entre niveles vive acá. */
export interface DiffParams {
    cpuRun: number; // m/s del portador rival
    cpuDefRun: number; // m/s de los defensores rivales
    cpuTackle: number; // prob. de que un tackle rival agarre a un portador que no hizo nada
    breakHit: number; // prob. de que tu "chocar" rompa el tackle
    dodge: number; // prob. de que tu "esquivar" lo evite
    userTackle: number; // prob. de que tu tackle (D) agarre
    cpuBreak: number; // prob. de que el portador rival rompa tu tackle
    intercept: number; // prob. de intercepción por defensor cerca de la línea del pase
    scrumCpu: number; // empuje rival por segundo (tus toques suman 7 cada uno)
    ruckKeep: number; // base de retener la pelota en tu ruck (con apoyo parejo y toques parejos)
    cpuRuckKeep: number; // base de que el rival retenga la suya
    ruckRate: number; // toques por segundo que "hace" el rival en el ruck: para ganarle hay que tocar más rápido
    kickWindow: number; // ancho del centro en la conversión (0..1)
    cpuKick: number; // prob. de que el rival convierta
    cpuPassIQ: number; // ganas del rival de pasar cuando lo apuran (por segundo)
}

export const DIFF: Record<Difficulty, DiffParams> = {
    'muy-facil': {
        cpuRun: 5.6, cpuDefRun: 5.6, cpuTackle: 0.35, breakHit: 0.8, dodge: 0.8, userTackle: 0.97,
        cpuBreak: 0.12, intercept: 0.02, scrumCpu: 14, ruckKeep: 0.97, cpuRuckKeep: 0.66, ruckRate: 2.5,
        kickWindow: 0.34, cpuKick: 0.45, cpuPassIQ: 0.6,
    },
    facil: {
        cpuRun: 6.6, cpuDefRun: 6.6, cpuTackle: 0.66, breakHit: 0.54, dodge: 0.56, userTackle: 0.89,
        cpuBreak: 0.4, intercept: 0.08, scrumCpu: 22, ruckKeep: 0.94, cpuRuckKeep: 0.78, ruckRate: 4,
        kickWindow: 0.22, cpuKick: 0.6, cpuPassIQ: 1.25,
    },
    // El normal de ahora es el difícil de antes: el de antes se sentía fácil.
    normal: {
        cpuRun: 7.5, cpuDefRun: 7.3, cpuTackle: 0.84, breakHit: 0.33, dodge: 0.36, userTackle: 0.76,
        cpuBreak: 0.62, intercept: 0.17, scrumCpu: 31, ruckKeep: 0.89, cpuRuckKeep: 0.88, ruckRate: 5.5,
        kickWindow: 0.13, cpuKick: 0.78, cpuPassIQ: 2.2,
    },
    dificil: {
        cpuRun: 7.9, cpuDefRun: 7.8, cpuTackle: 0.9, breakHit: 0.24, dodge: 0.27, userTackle: 0.68,
        cpuBreak: 0.72, intercept: 0.22, scrumCpu: 36, ruckKeep: 0.84, cpuRuckKeep: 0.92, ruckRate: 7,
        kickWindow: 0.1, cpuKick: 0.85, cpuPassIQ: 2.8,
    },
    leyenda: {
        cpuRun: 8.3, cpuDefRun: 8.3, cpuTackle: 0.94, breakHit: 0.16, dodge: 0.19, userTackle: 0.6,
        cpuBreak: 0.8, intercept: 0.28, scrumCpu: 41, ruckKeep: 0.78, cpuRuckKeep: 0.95, ruckRate: 8.5,
        kickWindow: 0.08, cpuKick: 0.9, cpuPassIQ: 3.4,
    },
};

/* PRNG chico para que los planteles de los equipos de fábrica salgan siempre iguales. */
function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function squad(seed: number): Look[] {
    const r = seeded(seed);
    return Array.from({ length: 7 }, () => randomLook(r));
}

export const PRESET_TEAMS: SevenTeam[] = [
    { id: 'albos', name: 'Albos', short: 'ALB', kit: { shirt: '#f4f4f4', shirt2: '#1f2a44', shorts: '#1f2a44', socks: '#f4f4f4', pattern: 'liso' }, players: squad(11) },
    { id: 'marinos', name: 'Marinos', short: 'MAR', kit: { shirt: '#1f3b73', shirt2: '#f4f4f4', shorts: '#1f2a44', socks: '#1f3b73', pattern: 'liso' }, players: squad(22) },
    { id: 'bordo', name: 'Bordó Seven', short: 'BOR', kit: { shirt: '#7a1f2e', shirt2: '#f0c419', shorts: '#f4f4f4', socks: '#7a1f2e', pattern: 'banda' }, players: squad(33) },
    { id: 'celestes', name: 'Celestes', short: 'CEL', kit: { shirt: '#7cc4ef', shirt2: '#f4f4f4', shorts: '#f4f4f4', socks: '#7cc4ef', pattern: 'aros' }, players: squad(44) },
    { id: 'verdes', name: 'Verdes del Sur', short: 'VDS', kit: { shirt: '#1f7a3e', shirt2: '#f4f4f4', shorts: '#141218', socks: '#1f7a3e', pattern: 'aros' }, players: squad(55) },
    { id: 'rojinegros', name: 'Rojinegros', short: 'RYN', kit: { shirt: '#c62828', shirt2: '#141218', shorts: '#141218', socks: '#c62828', pattern: 'aros' }, players: squad(66) },
    { id: 'naranjas', name: 'Naranjas', short: 'NAR', kit: { shirt: '#ef7d1a', shirt2: '#141218', shorts: '#141218', socks: '#ef7d1a', pattern: 'liso' }, players: squad(77) },
    { id: 'amarillos', name: 'Amarillos', short: 'AMA', kit: { shirt: '#f0c419', shirt2: '#1f3b73', shorts: '#1f3b73', socks: '#f0c419', pattern: 'banda' }, players: squad(88) },
];

export const SHIRT_COLORS = ['#f4f4f4', '#141218', '#1f3b73', '#7cc4ef', '#c62828', '#7a1f2e', '#1f7a3e', '#ef7d1a', '#f0c419', '#6b3fa0', '#e85d9b', '#8a8f98'];
export const SHORT_COLORS = ['#f4f4f4', '#141218', '#1f2a44', '#1f3b73', '#7a1f2e', '#1f7a3e', '#c62828', '#8a8f98'];

/* ---- guardado ---- */

const STORAGE_KEY = 'g22-rugby-seven';
const SCHEMA = 1;

export interface CupProgress {
    teamId: string;
    opponents: string[]; // cuartos, semi, final
    round: number; // 0..2 = próximo partido; 3 = campeón
    eliminated: boolean;
    results: { opp: string; us: number; them: number }[];
    difficulty: Difficulty;
    duration: Duration;
}

/** Partidas de torneo guardadas a la vez (torneos y caminos al Mundial). */
export const TOUR_SLOTS = 3;

interface Saved {
    schema: number;
    customTeams: SevenTeam[];
    cup: CupProgress | null;
    /** Las partidas de torneo: siempre TOUR_SLOTS lugares, null = vacío. */
    tours: (TourState | null)[];
}

function isLook(v: unknown): v is Look {
    const l = v as Look;
    return !!l && typeof l.skin === 'number' && typeof l.hair === 'number' && typeof l.style === 'number';
}

export function isTeam(v: unknown): v is SevenTeam {
    const t = v as SevenTeam;
    return (
        !!t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.short === 'string' &&
        !!t.kit && typeof t.kit.shirt === 'string' && Array.isArray(t.players) && t.players.length === 7 &&
        t.players.every(isLook)
    );
}

export function loadSaved(): Saved {
    const empty: Saved = { schema: SCHEMA, customTeams: [], cup: null, tours: Array(TOUR_SLOTS).fill(null) };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return empty;
        const parsed = JSON.parse(raw) as Partial<Saved> & { tour?: unknown };
        if (parsed.schema !== SCHEMA) return empty;
        // Las partidas: un guardado viejo traía un solo `tour`; pasa a ser la partida 1.
        const list: unknown[] = Array.isArray(parsed.tours) ? parsed.tours : [parsed.tour ?? null];
        const tours = Array.from({ length: TOUR_SLOTS }, (_, i) => (isTourState(list[i]) ? (list[i] as TourState) : null));
        return {
            schema: SCHEMA,
            customTeams: Array.isArray(parsed.customTeams) ? parsed.customTeams.filter(isTeam) : [],
            cup: parsed.cup ?? null,
            tours,
        };
    } catch {
        return empty;
    }
}

export function saveSaved(data: Omit<Saved, 'schema'>) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: SCHEMA, ...data }));
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): se juega igual, sin guardar.
    }
}
