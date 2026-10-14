import type { CaptainState } from '@/features/captain';
import type { MinigameGrade, MinigameSlot } from '../../../../features/captain/types/minigame.ts';
// Rutas relativas y con `.ts`, como `legacy.ts`: el test de este módulo corre en
// Node sin el alias `@/`.
import { ALL_MINIGAMES } from '../../../../features/captain/data/minigames/index.ts';
import { familyOfNumber, getFamily } from '../../../../features/captain/data/positions.ts';
import { hashSeed } from '../../../../features/captain/engine/random.ts';
import { practiceMoment } from '../../../../features/captain/engine/moments.ts';
import { captainReducer, createInitialCaptain } from '../../../../features/captain/state/captain-reducer.ts';
import type { MomentOutcome } from '../../../../features/captain/types/moment.ts';

/**
 * LA ZONA DE ENTRENAMIENTO: LOS 65 MINIJUEGOS DE LA CARRERA, SUELTOS.
 *
 * En la carrera, un minijuego aparece si la temporada lo sortea: con suerte,
 * dos o tres por puesto en toda una vida. La mayoría de los sesenta y cinco no
 * se ve nunca, y ninguno se puede repetir para aprenderlo. La zona los pone
 * todos a mano, con dificultad, récord y un desafío por día.
 *
 * ── LO QUE SE PRACTICA ES LO MISMO QUE SE JUEGA ─────────────────────────────
 * No hay copias: cada intento arma un estado de práctica, le planta la jugada
 * con `practiceMoment` —la misma construcción que usa la temporada— y la
 * resuelve con el reducer real (`RESOLVE_MOMENT`). Mismo setup, misma regla,
 * misma pantalla. Lo que aprendés acá te sirve el día que te toque de verdad.
 *
 * ── Y NO TOCA LA CARRERA ────────────────────────────────────────────────────
 * Practicar no sube atributos. Si subiera, repetir el minijuego más fácil
 * cincuenta veces compraría una carrera, y la calibración del motor se mide sin
 * ese atajo. Lo que la zona construye es tu mano, que es lo que el minijuego de
 * la carrera mide; los récords y la racha se guardan aparte.
 */

// ── El catálogo, agrupado como se lee un plantel ────────────────────────────

export type TrainingGroupId = 'primera' | 'pack' | 'medios' | 'tres-cuartos' | 'todos';

export const TRAINING_GROUPS: readonly { id: TrainingGroupId; label: string; shirts: readonly number[] | null }[] = [
    { id: 'primera', label: 'Primera línea', shirts: [1, 2, 3] },
    { id: 'pack', label: 'Segunda y tercera', shirts: [4, 5, 6, 7, 8] },
    { id: 'medios', label: 'Medios', shirts: [9, 10] },
    { id: 'tres-cuartos', label: 'Tres cuartos', shirts: [11, 12, 13, 14, 15] },
    { id: 'todos', label: 'Para todos', shirts: null },
];

/** El dorsal con el que se practica un universal. Cualquiera sirve: es de todos. */
const UNIVERSAL_SHIRT = 7;

/**
 * Lo que dice cada uno de los escritos a mano: su casilla no trae `brief`
 * porque nacieron antes de la fábrica. Escrito fresco, en la voz del juego.
 */
const LEGACY_BRIEF: Record<string, string> = {
    tackle: 'Viene lanzado y te eligió a vos. Elegí la altura: abajo es seguro, arriba es tarjeta.',
    ancla: 'El scrum se viene encima. Aguantá sin saber en qué segundo se rompe.',
    codigo: 'El line-out se canta en código. Memorizá la seña y repetila sin errar.',
    jackal: 'La pelota toca el piso. Tenés una fracción para meter las manos antes del que limpia.',
    palos: 'Penal a los palos. Leé el viento y compensá antes de patear.',
    banda: 'La pelota llega a la punta. Corré pegado a la raya y elegí cuándo acelerar.',
};

export interface TrainingGame {
    /** El id del casillero (`d10-drop`, `uni-pase`…). */
    slot: string;
    /** El `MomentKind` que se juega. En los escritos a mano es el viejo. */
    kind: string;
    shirt: number | null;
    title: string;
    brief: string;
    group: TrainingGroupId;
}

function groupOf(shirt: number | null): TrainingGroupId {
    if (shirt === null) return 'todos';
    return TRAINING_GROUPS.find((g) => g.shirts?.includes(shirt))?.id ?? 'todos';
}

function toGame(slot: MinigameSlot): TrainingGame {
    const legacy = 'legacyOf' in slot ? slot.legacyOf : null;
    return {
        slot: slot.kind,
        kind: legacy ?? slot.kind,
        shirt: slot.shirt,
        title: slot.copy.title,
        brief: legacy ? LEGACY_BRIEF[legacy] ?? '' : (slot.copy as { brief: string }).brief,
        group: groupOf(slot.shirt),
    };
}

/** Los sesenta y cinco, en el orden del catálogo (dorsal 1 al 15, después los de todos). */
export const TRAINING_GAMES: readonly TrainingGame[] = ALL_MINIGAMES.map(toGame);

export function trainingGame(slot: string): TrainingGame | null {
    return TRAINING_GAMES.find((g) => g.slot === slot) ?? null;
}

// ── La dificultad ───────────────────────────────────────────────────────────

export type TrainingLevel = 'facil' | 'normal' | 'dificil';

/**
 * LA DIFICULTAD ES EL JUGADOR, NO UNA PERILLA APARTE. PARÁMETRO LIBRE.
 *
 * Los minijuegos ya escalan con lo que el motor sabe del que juega: los
 * atributos del puesto y la presión del minuto. Fácil es un jugador hecho con
 * poca presión; difícil, un pibe en el último minuto de una final. La ventana
 * se achica sola porque el setup ya la achica — no hay una segunda regla acá.
 */
export const TRAINING_LEVELS: readonly { id: TrainingLevel; label: string; hint: string; attr: number; pressure: number }[] = [
    { id: 'facil', label: 'Fácil', hint: 'Jugador hecho, partido tranquilo', attr: 86, pressure: 0.25 },
    { id: 'normal', label: 'Normal', hint: 'Titular de primera, partido parejo', attr: 70, pressure: 0.55 },
    { id: 'dificil', label: 'Difícil', hint: 'Pibe de juveniles, último minuto', attr: 54, pressure: 0.92 },
];

// ── Un intento ──────────────────────────────────────────────────────────────

/**
 * Arma el estado de práctica con la jugada plantada. El jugador es de la
 * familia del dorsal, con los atributos del puesto en el nivel elegido. La
 * semilla sale del intento: sin azar del entorno (CLAUDE.md de captain), y
 * cada «otra vez» trae una jugada distinta.
 */
export function practiceState(game: TrainingGame, level: TrainingLevel, attempt: number): CaptainState {
    const nivel = TRAINING_LEVELS.find((l) => l.id === level)!;
    const shirt = game.shirt ?? UNIVERSAL_SHIRT;
    const family = familyOfNumber(shirt);
    const seed = hashSeed(`entrenamiento:${game.slot}:${level}:${attempt}`);

    const state = createInitialCaptain({ name: 'Práctica', surname: '', family, countryCode: 'ar', number: shirt }, seed);
    for (const k of [...getFamily(family).attributes, 'aguante' as const]) state.player.attrs[k] = nivel.attr;
    state.phase = 'moment';
    state.pendingMoment = practiceMoment(state, game.kind as never, nivel.pressure, attempt);
    return state;
}

/** Resuelve una mano con el reducer real. Si encadena (el tackle alto → el bunker), sigue en fase `moment`. */
export function practiceResolve(state: CaptainState, outcome: MomentOutcome): CaptainState {
    return captainReducer(state, { type: 'RESOLVE_MOMENT', outcome });
}

// ── La nota ─────────────────────────────────────────────────────────────────

export const GRADE_SCORE: Record<MinigameGrade, number> = { errado: 0, tibio: 1, logrado: 2, clavado: 3 };

export const GRADE_LABEL: Record<MinigameGrade, { title: string; line: string }> = {
    clavado: { title: 'Clavado', line: 'Salió perfecta. Así se juega una final.' },
    logrado: { title: 'Bien jugada', line: 'Cumpliste. Hay un escalón más arriba.' },
    tibio: { title: 'Tan cerca', line: 'Casi. Un detalle te separó de la buena.' },
    errado: { title: 'No salió', line: 'Hoy no. Para eso se entrena.' },
};

/**
 * LA NOTA DE UN INTENTO.
 *
 * En los de la fábrica es EXACTA: el rótulo del resultado es el del grado, así
 * que se lee de vuelta contra `copy.result`. En los seis escritos a mano no hay
 * grado expuesto y se lee por lo que la jugada te dejó —cartel y estadística a
 * favor, tarjeta o golpe en contra—, que son los mismos números que la
 * temporada se lleva.
 */
export function gradeAttempt(game: TrainingGame, before: CaptainState, after: CaptainState): MinigameGrade {
    const nuevos = after.moments.slice(before.moments.length);
    const slot = ALL_MINIGAMES.find((s) => s.kind === game.slot);
    if (slot && !('legacyOf' in slot) && nuevos.length > 0) {
        const copy = (slot.copy as { result: Record<MinigameGrade, string> }).result;
        const grado = (Object.keys(copy) as MinigameGrade[]).find((g) => copy[g] === nuevos[0].result);
        if (grado) return grado;
    }

    const aFavor = (after.fame - before.fame) + (after.pendingStatBoost - before.pendingStatBoost);
    const enContra = (after.pendingSanction - before.pendingSanction) + (after.damage.cabeza - before.damage.cabeza);
    if (enContra > 0) return 'errado';
    if (aFavor >= 3) return 'clavado';
    if (aFavor > 0) return 'logrado';
    return 'tibio';
}

// ── Lo que queda guardado ───────────────────────────────────────────────────

export interface TrainingRecord {
    plays: number;
    /** La mejor nota, en `GRADE_SCORE`. */
    best: number;
}

export interface TrainingBook {
    records: Record<string, TrainingRecord>;
    /** Los desafíos del día jugados: fecha local (AAAA-MM-DD) → mejor nota. */
    daily: Record<string, number>;
}

export function emptyBook(): TrainingBook {
    return { records: {}, daily: {} };
}

/** Suma un intento. Puro: devuelve un libro nuevo y si fue récord. */
export function recordAttempt(
    book: TrainingBook,
    slot: string,
    grade: MinigameGrade,
    dailyKey: string | null,
): { book: TrainingBook; newBest: boolean } {
    const score = GRADE_SCORE[grade];
    const prev = book.records[slot] ?? { plays: 0, best: -1 };
    // Un «no salió» no es récord aunque sea el primero: no hay nada que celebrar.
    const newBest = score > prev.best && score > GRADE_SCORE.errado;
    const records = { ...book.records, [slot]: { plays: prev.plays + 1, best: Math.max(prev.best, score) } };
    const daily = dailyKey ? { ...book.daily, [dailyKey]: Math.max(book.daily[dailyKey] ?? -1, score) } : book.daily;
    return { book: { records, daily }, newBest };
}

/** Cuántos tenés clavados, y cuántos jugaste alguna vez. */
export function bookSummary(book: TrainingBook): { clavados: number; jugados: number; total: number } {
    const rs = Object.values(book.records);
    return {
        clavados: rs.filter((r) => r.best >= GRADE_SCORE.clavado).length,
        jugados: rs.length,
        total: TRAINING_GAMES.length,
    };
}

// ── El desafío del día ──────────────────────────────────────────────────────

/** La fecha local, como clave. Vive del lado de la pantalla: el motor no sabe qué día es. */
export function dayKey(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * EL DEL DÍA: el mismo minijuego para todos ese día, en Difícil. Sale de la
 * fecha por hash —estable y sin azar— sobre el catálogo ordenado por id, para
 * que el orden de declaración no decida (§1 del CLAUDE de captain).
 */
export function dailyGame(key: string): TrainingGame {
    const ordenados = [...TRAINING_GAMES].sort((a, b) => a.slot.localeCompare(b.slot));
    return ordenados[hashSeed(`desafio:${key}`) % ordenados.length];
}

/**
 * LA RACHA: días seguidos, hasta hoy (o ayer, si hoy todavía no jugaste), con
 * el del día por lo menos bien jugado. Se cuenta del libro, no se guarda: un
 * contador guardado es una segunda fuente de verdad (§1.9).
 */
export function dailyStreak(book: TrainingBook, today: Date): number {
    const ok = (d: Date) => (book.daily[dayKey(d)] ?? -1) >= GRADE_SCORE.logrado;
    const d = new Date(today);
    if (!ok(d)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (ok(d)) {
        n += 1;
        d.setDate(d.getDate() - 1);
    }
    return n;
}
