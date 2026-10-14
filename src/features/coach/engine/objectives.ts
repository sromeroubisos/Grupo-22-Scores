// Los objetivos de la subcomisión, en cuatro ejes, y el proyecto de tres años.
//
// Hasta la 1.4.0 había un solo eje deportivo (una posición por fuerza) más
// "cerrar sin perder plata" y "un pibe en el XV", todos fijos. Ahora cada
// temporada la subcomisión pide:
//
//   · deportivo   el de siempre (`objectiveFor`), por fuerza dentro del torneo;
//   · secundario  uno o dos con contexto: superar los puntos del año pasado,
//                 ganar de local, ganarle al rival directo, cerrar con
//                 diferencia de tantos positiva;
//   · formativo   uno de dos, según el contexto (etapa 4, `formativeKind`):
//                 SUBIR N DEL M19 a primera, cuando el M19 tiene pibes listos
//                 y el plantel pide recambio (envejece o casi no tiene propios
//                 en el XV); si no, TITULARIDADES de los propios a lo largo de
//                 la fase regular (21 o menos, o formados en el club; en una
//                 división amateur, solo los de 21 o menos), con la palanca de
//                 la política del XV de cada tramo (`cantera`);
//   · económico   cerrar sin déficit, o bajar la deuda un X %.
//
// Más un PROYECTO de tres temporadas: ascender (si hay arriba y el club está en
// la mitad alta por fuerza), mejorar la estructura, o sanear la deuda.
//
// Los secundarios se eligen con un RNG DERIVADO de la semilla, la temporada y el
// club (`hashSeed`), nunca con el de la carrera: mirar los objetivos no puede
// mover un solo partido. Y se miden con funciones puras sobre la temporada
// jugada, que se pueden testear sin jugar nada.
//
// La presión sigue saliendo casi toda de lo deportivo (`pressure.ts`): lo que
// suman los objetivos de acá está acotado a unos pocos puntos por año. Lo que
// sí mueven en serio es el PRESUPUESTO del año siguiente (`finance.boardBudget`),
// la gente y la reputación.

import { getCompetition, tierAbove } from '../data/competitions.ts';
import { formatFor, promotionSlotsOf } from '../data/formats.ts';
import { getClub } from '../data/clubs.ts';
import type {
    ClubProject,
    CoachState,
    MatchResult,
    ObjectiveResult,
    ProjectSnapshot,
    SeasonObjective,
    SquadPlayer,
    TableRow,
} from '../types/coach.ts';
import { promotionsIn, readyKids } from './academy.ts';
import { CANTERA_MAX_AGE } from './board.ts';
import { netDebt } from './finance.ts';
import { createRng, hashSeed } from './random.ts';
import { formativeYouthOnly, isFormativeOwn } from './lineup.ts';
import { startingXV, teamRating } from './squad.ts';
import { clubsIn } from './world.ts';
import { upgradeLevels } from './upgrades.ts';

/** Los pesos por eje. Suman 100 con uno o dos secundarios: hay un test. */
export const OBJECTIVE_WEIGHTS = { deportivo: 50, secundario: 15, formativo: 15, economico: 20 } as const;

/** Cuántas temporadas dura un proyecto. */
export const PROJECT_SEASONS = 3;

/** Lo que tiene que subir la estructura para cumplir el proyecto de estructura. */
export const PROJECT_ESTRUCTURA = 8;
/** O cuántos niveles de mejoras nuevas. */
export const PROJECT_UPGRADES = 2;

/** Lo que hace falta saber de la temporada jugada para medir un objetivo. */
export interface SeasonFacts {
    clubId: string;
    /** El objetivo deportivo, ya resuelto por `reviewSeason`. */
    deportivoMet: boolean;
    table: readonly TableRow[];
    /** Los partidos de la fase regular. */
    matches: readonly MatchResult[];
    /** El plantel que jugó el año. */
    squad: readonly SquadPlayer[];
    /** Ingresos menos egresos del año. */
    resultado: number;
    /** Deuda neta (descubierto + préstamo) al cerrar. */
    netDebt: number;
    promoted: boolean;
    position: number;
    teams: number;
    estructura: number;
    upgradeLevels: number;
    season: number;
    /** Titularidades de los propios en la fase regular (etapa 2). Sin el dato, cero. */
    ownStarts?: number;
    /** Los que subieron del M19 en la temporada (etapa 4). Sin el dato, cero. */
    promotions?: number;
}

/**
 * La meta del formativo: los propios que hoy entran al XV, por todas las fechas
 * del año (`FORMATIVE_EXTRA` titulares propios más por fecha: cero), y nunca
 * menos de la mitad de las fechas (`FORMATIVE_MIN_SHARE`): un club sin propios
 * en el XV tiene que poner a uno la mitad del año.
 *
 * Por qué así, medido el 2026-10-14 con 200 carreras × 12 temporadas y el plan
 * por defecto (rotar): las titularidades propias por fecha, menos los propios
 * del XV de pretemporada, dan p10 −0,42 · p25 −0,11 · p50 0,00 · p75 +0,29 en
 * las divisiones con viáticos o contratos, y p25 0,00 · p50 +0,09 en las
 * amateurs. Las lesiones, el cansancio y los que se van mueven la cuenta para
 * los dos lados: con la meta en cero extra, rotando se cumple más o menos la
 * mitad de las veces y dándole pista a los pibes casi siempre. Con +0,6 (el
 * primer intento) se cumplía el 25 %: no había forma de llegar sin desarmar el XV.
 */
export const FORMATIVE_EXTRA = 0;
export const FORMATIVE_MIN_SHARE = 0.5;

/**
 * Cuándo el formativo pide SUBIR DEL M19 en vez de titularidades: hay al menos
 * un pibe listo (18 o más, en el club) y el plantel pide recambio —tiene
 * `PROMOTE_VETERANS` o más de 30 años, o `PROMOTE_FEW_OWN` o menos propios en
 * el XV—. Pide uno; dos si hay tres listos o más. Alcanzable siempre: con la
 * ventana abierta se puede liberar a alguien para hacer lugar.
 */
export const PROMOTE_VETERANS = 8;
export const PROMOTE_FEW_OWN = 1;

export type FormativeKind = 'promover-m19' | 'titularidades-propias';

/** Qué formativo corresponde al plantel y al M19 de hoy. Puro. */
export function formativeKind(state: Pick<CoachState, 'squad' | 'academy' | 'competitionId'>): FormativeKind {
    if (readyKids(state).length === 0) return 'titularidades-propias';
    const youthOnly = formativeYouthOnly(state.competitionId);
    const veterans = state.squad.filter((p) => p.age >= 30).length;
    const ownInXv = startingXV(state.squad).filter((p) => isFormativeOwn(p, youthOnly)).length;
    return veterans >= PROMOTE_VETERANS || ownInXv <= PROMOTE_FEW_OWN ? 'promover-m19' : 'titularidades-propias';
}

/* ------------------------------------------------------------------ */
/* Generación                                                          */
/* ------------------------------------------------------------------ */

/** Los que cuentan para el formativo: 21 o menos, o formados en el club. */
export function isOwnProduct(p: Pick<SquadPlayer, 'age' | 'homegrown'>): boolean {
    return p.age <= CANTERA_MAX_AGE || p.homegrown === true;
}

function shortName(clubId: string): string {
    return getClub(clubId)?.short ?? clubId;
}

/** El rival directo: el del torneo más cercano por fuerza. Desempata por id. */
export function directRival(state: Pick<CoachState, 'world' | 'competitionId' | 'clubId' | 'squad'>): string | null {
    const mine = teamRating(state.squad);
    const others = clubsIn(state.world, state.competitionId).filter((id) => id !== state.clubId);
    let best: string | null = null;
    let gap = Infinity;
    for (const id of [...others].sort()) {
        const d = Math.abs((state.world.ratings[id] ?? 0) - mine);
        if (d < gap) {
            gap = d;
            best = id;
        }
    }
    return best;
}

/**
 * Lo que la subcomisión pide esta temporada. Puro y determinista: mismo estado,
 * mismos objetivos, y no toca el RNG de la carrera.
 */
export function seasonObjectives(state: CoachState): SeasonObjective[] {
    const rng = createRng(hashSeed(`objetivos:${state.seed}:${state.season}:${state.clubId}`));
    const comp = getCompetition(state.competitionId);
    const teams = comp?.teams ?? 10;
    const fechas = (teams - 1) * formatFor(state.competitionId, state.year).rounds;
    const local = Math.floor(fechas / 2);
    const ranked = clubsIn(state.world, state.competitionId);
    const seedRank = Math.max(1, ranked.indexOf(state.clubId) + 1);
    const strength = teams > 1 ? 1 - (seedRank - 1) / (teams - 1) : 0.5; // 1 el más fuerte, 0 el más flojo

    const out: SeasonObjective[] = [
        {
            id: 'deportivo',
            axis: 'deportivo',
            text: state.objective.text,
            weight: OBJECTIVE_WEIGHTS.deportivo,
            measure: { kind: 'deportivo' },
        },
    ];

    // Los secundarios posibles, según el contexto. Orden fijo antes de sortear.
    const candidates: Omit<SeasonObjective, 'weight'>[] = [];
    const last = state.seasons[state.seasons.length - 1];
    if (last && last.clubId === state.clubId && last.competitionId === state.competitionId && last.points > 0) {
        candidates.push({
            id: 'superar-puntos',
            axis: 'secundario',
            text: `Superar los ${last.points} puntos del año pasado.`,
            measure: { kind: 'superar-puntos', points: last.points },
        });
    }
    if (local > 0) {
        // Realista: de los más flojos se espera poco de local; del más fuerte, casi todo.
        const wins = Math.max(1, Math.round(local * (0.15 + 0.55 * strength)));
        candidates.push({
            id: 'ganar-local',
            axis: 'secundario',
            text: `Hacerse fuerte de local: ganar al menos ${wins} de los ${local} partidos en casa.`,
            measure: { kind: 'ganar-local', wins },
        });
    }
    const rival = directRival(state);
    if (rival) {
        const h2h = state.lastMatches.filter(
            (m) =>
                (m.homeId === state.clubId && m.awayId === rival) || (m.awayId === state.clubId && m.homeId === rival),
        );
        const won = h2h.filter((m) => wonBy(m, state.clubId)).length;
        const past = h2h.length > 0 ? ` El año pasado: ${won} de ${h2h.length}.` : '';
        candidates.push({
            id: 'ganarle-a',
            axis: 'secundario',
            text: `Ganarle a ${shortName(rival)}, el rival directo, por lo menos una vez.${past}`,
            measure: { kind: 'ganarle-a', clubId: rival },
        });
    }
    // Diferencia positiva: tiene sentido para el que pelea de la mitad para arriba.
    if (strength >= 0.4) {
        candidates.push({
            id: 'diferencia-positiva',
            axis: 'secundario',
            text: 'Cerrar el año con más tantos a favor que en contra.',
            measure: { kind: 'diferencia-positiva' },
        });
    }

    const pool = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
    const howMany = pool.length >= 3 && rng.chance(0.5) ? 2 : Math.min(1, pool.length);
    const picked: Omit<SeasonObjective, 'weight'>[] = [];
    for (let i = 0; i < howMany; i++) {
        const left = pool.filter((c) => !picked.includes(c));
        picked.push(left[rng.int(0, left.length - 1)]);
    }
    const secWeights = picked.length === 2 ? [8, 7] : [OBJECTIVE_WEIGHTS.secundario];
    picked
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((c, i) => out.push({ ...c, weight: secWeights[i] }));

    // Formativo: subir del M19, o titularidades de los propios (`formativeKind`).
    const youthOnly = formativeYouthOnly(state.competitionId);
    if (formativeKind(state) === 'promover-m19') {
        const count = readyKids(state).length >= 3 ? 2 : 1;
        out.push({
            id: 'formativo',
            axis: 'formativo',
            text: `Recambio desde abajo: subir del M19 a primera ${count === 1 ? 'a un pibe' : `a ${count} pibes`} esta temporada.`,
            weight: OBJECTIVE_WEIGHTS.formativo,
            measure: { kind: 'promover-m19', count, from: promotionsIn(state, state.season) },
        });
    } else {
        // Titularidades de los propios en la fase regular. La meta sale de
        // cuántos propios entran hoy al XV, más un poco: hay que rotar para darla.
        const isOwn = (p: SquadPlayer) => isFormativeOwn(p, youthOnly);
        const inXv = startingXV(state.squad).filter(isOwn).length;
        const eligible = state.squad.filter(isOwn).length;
        const starts = Math.max(
            1,
            Math.min(
                fechas * Math.min(15, eligible),
                Math.max(Math.round(fechas * FORMATIVE_MIN_SHARE), Math.round(fechas * (inXv + FORMATIVE_EXTRA))),
            ),
        );
        const who = youthOnly ? `pibes de ${CANTERA_MAX_AGE} o menos` : `formados en el club o pibes de ${CANTERA_MAX_AGE} o menos`;
        out.push({
            id: 'formativo',
            axis: 'formativo',
            text: `Darle pista a los propios: ${starts} titularidades de ${who} en la fase regular.`,
            weight: OBJECTIVE_WEIGHTS.formativo,
            measure: { kind: 'titularidades-propias', starts, youthOnly },
        });
    }

    // Económico: sin déficit, o bajar la deuda.
    const debt = netDebt(state);
    if (debt > 0) {
        const pct = state.club.finances.caja < 0 ? 25 : 15;
        out.push({
            id: 'economico',
            axis: 'economico',
            text: `Bajar la deuda un ${pct} % (descubierto y préstamo, hoy ${formatM(debt)}).`,
            weight: OBJECTIVE_WEIGHTS.economico,
            measure: { kind: 'bajar-deuda', pct, from: debt },
        });
    } else {
        out.push({
            id: 'economico',
            axis: 'economico',
            text: 'Cerrar el año sin déficit: que no salga más de lo que entra.',
            weight: OBJECTIVE_WEIGHTS.economico,
            measure: { kind: 'sin-deficit' },
        });
    }

    // Si hubo un solo secundario o ninguno, el resto del peso va al deportivo:
    // los pesos de una temporada siempre suman 100.
    const total = out.reduce((s, o) => s + o.weight, 0);
    if (total !== 100) out[0] = { ...out[0], weight: out[0].weight + (100 - total) };
    return out;
}

function formatM(pesos: number): string {
    return `$ ${(pesos / 1_000_000).toFixed(1).replace('.', ',')} M`;
}

/**
 * El proyecto de tres temporadas. Se conserva mientras esté activo y sea de este
 * club; si terminó (cumplido o vencido) o es de otro club, se arma uno nuevo.
 */
export function nextProject(state: CoachState): ClubProject {
    const p = state.project;
    if (p && p.clubId === state.clubId && p.status === 'activo') return p;

    const comp = getCompetition(state.competitionId);
    const teams = comp?.teams ?? 10;
    const ranked = clubsIn(state.world, state.competitionId);
    const seedRank = Math.max(1, ranked.indexOf(state.clubId) + 1);
    const debt = netDebt(state);
    const deadlineSeason = state.season + PROJECT_SEASONS - 1;
    const deadlineYear = state.year + PROJECT_SEASONS - 1;
    const base = {
        clubId: state.clubId,
        fromSeason: state.season,
        deadlineSeason,
        startUpgrades: upgradeLevels(state.club),
        progress: 0,
        status: 'activo' as const,
    };

    if (debt > 0 && state.club.finances.caja < 0) {
        return {
            ...base,
            kind: 'sanear',
            text: `Sanear la caja: cerrar sin deuda (${formatM(debt)} hoy, contando el préstamo) antes del cierre de ${deadlineYear}.`,
            start: debt,
        };
    }
    const canGoUp =
        tierAbove(state.competitionId) !== null && promotionSlotsOf(formatFor(state.competitionId, state.year)) > 0;
    if (canGoUp && seedRank <= Math.ceil(teams / 2)) {
        return {
            ...base,
            kind: 'ascenso',
            text: `Ascender antes del cierre de ${deadlineYear}. El club está en la mitad de arriba: es el momento.`,
            start: 0,
        };
    }
    return {
        ...base,
        kind: 'estructura',
        text: `Hacer crecer el club antes del cierre de ${deadlineYear}: la estructura +${PROJECT_ESTRUCTURA} o ${PROJECT_UPGRADES} niveles de mejoras nuevos.`,
        start: state.club.finances.estructura,
    };
}

/* ------------------------------------------------------------------ */
/* Medición                                                            */
/* ------------------------------------------------------------------ */

function wonBy(m: MatchResult, clubId: string): boolean {
    if (m.homeId === clubId) return m.homePf > m.awayPf;
    if (m.awayId === clubId) return m.awayPf > m.homePf;
    return false;
}

/** Mide un objetivo contra la temporada jugada. Puro. */
export function measureObjective(o: SeasonObjective, f: SeasonFacts): { met: boolean; detail: string } {
    const m = o.measure;
    const row = f.table.find((r) => r.clubId === f.clubId);
    switch (m.kind) {
        case 'deportivo':
            return { met: f.deportivoMet, detail: f.position > 0 ? `Terminó ${f.position}° de ${f.teams}.` : 'Sin tabla.' };
        case 'superar-puntos': {
            const pts = row?.points ?? 0;
            return { met: pts > m.points, detail: `${pts} puntos, pedían más de ${m.points}.` };
        }
        case 'ganar-local': {
            const wins = f.matches.filter((x) => x.homeId === f.clubId && x.homePf > x.awayPf).length;
            return { met: wins >= m.wins, detail: `${wins} de local, pedían ${m.wins}.` };
        }
        case 'ganarle-a': {
            const h2h = f.matches.filter(
                (x) =>
                    (x.homeId === f.clubId && x.awayId === m.clubId) || (x.awayId === f.clubId && x.homeId === m.clubId),
            );
            const won = h2h.filter((x) => wonBy(x, f.clubId)).length;
            return {
                met: won > 0,
                detail: h2h.length === 0 ? `No se cruzaron con ${shortName(m.clubId)}.` : `${won} de ${h2h.length} contra ${shortName(m.clubId)}.`,
            };
        }
        case 'diferencia-positiva': {
            const diff = row ? row.pf - row.pc : 0;
            return { met: diff > 0, detail: `Diferencia de ${diff > 0 ? '+' : ''}${diff}.` };
        }
        case 'titulares-propios': {
            const own = startingXV(f.squad).filter(isOwnProduct).length;
            return { met: own >= m.count, detail: `${own} en el XV, pedían ${m.count}.` };
        }
        case 'titularidades-propias': {
            const got = f.ownStarts ?? 0;
            return { met: got >= m.starts, detail: `${got} titularidades de los propios, pedían ${m.starts}.` };
        }
        case 'promover-m19': {
            const got = Math.max(0, (f.promotions ?? 0) - m.from);
            return { met: got >= m.count, detail: `${got} subieron del M19 a primera, pedían ${m.count}.` };
        }
        case 'sin-deficit':
            return {
                met: f.resultado >= 0,
                detail: f.resultado >= 0 ? `Superávit de ${formatM(f.resultado)}.` : `Déficit de ${formatM(-f.resultado)}.`,
            };
        case 'bajar-deuda': {
            const target = m.from * (1 - m.pct / 100);
            const dropped = m.from > 0 ? Math.round(((m.from - f.netDebt) / m.from) * 100) : 100;
            return {
                met: f.netDebt <= target,
                detail: dropped >= 0 ? `La deuda bajó un ${dropped} %, pedían ${m.pct} %.` : `La deuda subió un ${-dropped} %.`,
            };
        }
    }
}

/** Lo que mueve el cierre de los objetivos, sumado. */
export interface ObjectiveEffects {
    /** Presión: acotada. La deportiva ya la puso `reviewSeason`. */
    pressure: number;
    reputation: number;
    hinchada: number;
    /** El ajuste del presupuesto del año siguiente, como fracción. */
    boardBudget: number;
}

/** Cada objetivo cumplido o no, con su consecuencia escrita. */
export function evaluateObjectives(
    objectives: readonly SeasonObjective[],
    facts: SeasonFacts,
): { results: ObjectiveResult[]; effects: ObjectiveEffects } {
    const effects: ObjectiveEffects = { pressure: 0, reputation: 0, hinchada: 0, boardBudget: 0 };
    let budgetScore = 0;
    const results = objectives.map((o): ObjectiveResult => {
        const { met, detail } = measureObjective(o, facts);
        budgetScore += met ? o.weight : -o.weight;
        let consequence: string;
        switch (o.axis) {
            case 'deportivo':
                // La presión deportiva la pone `reviewSeason`; acá solo la gente.
                effects.hinchada += met ? 2 : -2;
                consequence = met ? 'La gente acompaña más.' : 'La gente se enfría.';
                break;
            case 'secundario':
                effects.pressure += met ? -1 : 1;
                effects.hinchada += met ? 1 : 0;
                consequence = met ? 'Suma con la subcomisión y con la gente.' : 'Lo anotan.';
                break;
            case 'formativo':
                effects.pressure += met ? -1 : 2;
                effects.reputation += met ? 1 : 0;
                consequence = met ? 'Se nota la mano del club en el XV.' : 'La subcomisión pide más pibes del club.';
                break;
            case 'economico':
                effects.pressure += met ? -2 : 2;
                consequence = met ? 'La tesorería respira.' : 'La tesorería te lo reclama.';
                break;
        }
        return { id: o.id, axis: o.axis, text: o.text, weight: o.weight, met, detail, consequence };
    });
    // Todo cumplido: +6 % de presupuesto el año que viene. Nada cumplido: −6 %.
    effects.boardBudget = clamp((budgetScore / 100) * 0.06, -0.06, 0.06);
    return { results, effects };
}

/** Lo que mueve el cierre del proyecto. */
export interface ProjectOutcome {
    project: ClubProject;
    snapshot: ProjectSnapshot;
    pressure: number;
    reputation: number;
    hinchada: number;
    boardBudget: number;
}

/**
 * Avanza el proyecto con la temporada que se jugó. Cumplido: bonus grande.
 * Vencido sin cumplir: presión.
 */
export function advanceProject(project: ClubProject, f: SeasonFacts): ProjectOutcome {
    let progress = project.progress;
    let done = false;
    if (project.kind === 'ascenso') {
        done = f.promoted;
        // Mientras no asciende, el progreso es lo cerca que quedó de arriba.
        const near = f.teams > 1 && f.position > 0 ? 1 - (f.position - 1) / (f.teams - 1) : 0;
        progress = done ? 1 : Math.max(progress, Math.round(near * 0.8 * 100) / 100);
    } else if (project.kind === 'estructura') {
        const byStructure = (f.estructura - project.start) / PROJECT_ESTRUCTURA;
        const byUpgrades = (f.upgradeLevels - project.startUpgrades) / PROJECT_UPGRADES;
        progress = clamp(Math.round(Math.max(byStructure, byUpgrades) * 100) / 100, 0, 1);
        done = progress >= 1;
    } else {
        progress = project.start > 0 ? clamp(Math.round((1 - f.netDebt / project.start) * 100) / 100, 0, 1) : 1;
        done = f.netDebt <= 0;
    }

    const expired = !done && f.season >= project.deadlineSeason;
    const status: ClubProject['status'] = done ? 'cumplido' : expired ? 'vencido' : 'activo';
    const next = { ...project, progress: done ? 1 : progress, status };
    if (status === 'cumplido') {
        return {
            project: next,
            snapshot: { text: project.text, progress: 1, status, consequence: 'Proyecto cumplido: la subcomisión suma presupuesto, la gente se entusiasma y tu nombre crece.' },
            pressure: -8,
            reputation: 4,
            hinchada: 3,
            boardBudget: 0.04,
        };
    }
    if (status === 'vencido') {
        return {
            project: next,
            snapshot: { text: project.text, progress: next.progress, status, consequence: 'El proyecto venció sin cumplirse: la subcomisión te lo factura.' },
            pressure: 8,
            reputation: -2,
            hinchada: 0,
            boardBudget: 0,
        };
    }
    return {
        project: next,
        snapshot: { text: project.text, progress: next.progress, status, consequence: null },
        pressure: 0,
        reputation: 0,
        hinchada: 0,
        boardBudget: 0,
    };
}

/** Facts de la temporada a partir de lo que el cierre ya tiene a mano. */
export function factsFrom(args: {
    state: CoachState;
    deportivoMet: boolean;
    table: readonly TableRow[];
    matches: readonly MatchResult[];
    resultado: number;
    netDebt: number;
    promoted: boolean;
    position: number;
    estructura: number;
}): SeasonFacts {
    return {
        clubId: args.state.clubId,
        deportivoMet: args.deportivoMet,
        table: args.table,
        matches: args.matches,
        squad: args.state.squad,
        resultado: args.resultado,
        netDebt: args.netDebt,
        promoted: args.promoted,
        position: args.position,
        teams: args.table.length,
        estructura: args.estructura,
        upgradeLevels: upgradeLevels(args.state.club),
        season: args.state.season,
    };
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
