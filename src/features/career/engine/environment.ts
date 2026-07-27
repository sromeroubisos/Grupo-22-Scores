// ENTORNO DE TEMPORADA: el contexto real en el que el jugador entrena, juega y
// se recupera. Es lo que traduce "nivel + contrato" en efectos concretos.
//
// La regla que esto corrige: NO existe un multiplicador único. Sería falso hacer
// `fatigue *= sportingBand` o `progression *= contractStatus`, porque los ejes
// tiran en direcciones opuestas:
//   · un profesional entrena más fuerte PERO tiene mejor preparación, medicina
//     y recuperación;
//   · un amateur juega menos PERO suma trabajo, estudio, viajes pagados de su
//     bolsillo y peor acondicionamiento.
// Por eso cada dimensión se calcula por separado y se combina donde corresponde.
//
// Nada de esto se persiste: se deriva determinísticamente del snapshot de la
// temporada (club, contrato, edad, rol, lesiones), así que no hay duplicación.

import type { ClubDef } from '../data/clubs.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import { economicModelOf, regularSeasonMatchesOf, sportingBandOf } from '../data/competition-levels2026.ts';
import type { Player, PlayerRole } from '../types/player.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';

export const CAREER_ENVIRONMENT_VERSION = '2026-27.2';

export interface SeasonEnvironment {
    /** Qué tan bueno es lo que entrena (0..1). */
    trainingQuality: number;
    /** Cuánto entrena (0..1). Un juvenil de academia entrena MUCHO y juega poco. */
    trainingLoad: number;
    /** Exigencia física de cada partido (0..1). */
    matchIntensity: number;
    /** Recuperación entre partidos: descanso, kinesiología, nutrición (0..1). */
    recoverySupport: number;
    /** Medicina deportiva: prevención y calidad de la rehabilitación (0..1). */
    medicalSupport: number;
    /** Carga NO deportiva: trabajo, estudio, vida (0..1). */
    lifeLoad: number;
    /** Viajes de la competición y del club (0..1). */
    travelLoad: number;
    /** Presión por el puesto dentro del plantel (0..1). */
    selectionPressure: number;
    /** Visibilidad ante seleccionadores y otros clubes (0..1). */
    exposure: number;
    /** Fechas disponibles del EQUIPO en la competición base. */
    teamMatchesAvailable: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Perfil base por EMPLEO. Es el eje que más manda sobre el día a día.
const BY_EMPLOYMENT: Record<EmploymentStatus, Partial<SeasonEnvironment>> = {
    // Entrena poco y mal, trabaja o estudia, casi sin soporte.
    amateur: { trainingQuality: 0.32, trainingLoad: 0.34, recoverySupport: 0.22, medicalSupport: 0.20, lifeLoad: 0.82 },
    // Algo más de disponibilidad y algo de estructura, pero sigue trabajando.
    'amateur-compensated': { trainingQuality: 0.46, trainingLoad: 0.48, recoverySupport: 0.38, medicalSupport: 0.36, lifeLoad: 0.62 },
    // Jornada partida: entrena bien, pero la vida sigue pesando.
    'semi-professional': { trainingQuality: 0.66, trainingLoad: 0.68, recoverySupport: 0.58, medicalSupport: 0.56, lifeLoad: 0.44 },
    // Dedicación completa, con toda la estructura detrás.
    'full-time-professional': { trainingQuality: 0.90, trainingLoad: 0.82, recoverySupport: 0.86, medicalSupport: 0.88, lifeLoad: 0.10 },
};

// El TRACK de desarrollo sube el entrenamiento (academia) sin cambiar el empleo:
// entrena como un profesional aunque su vínculo sea semipro.
const DEVELOPMENT_TRACK: Partial<SeasonEnvironment> = {
    trainingQuality: 0.84, trainingLoad: 0.90,
};

// El modelo económico ajusta la estructura del club por encima del contrato:
// un semipro en una liga profesional tiene mejor kinesiólogo que uno en una
// liga mixta, aunque su vínculo sea el mismo.
const STRUCTURE_BONUS: Record<EconomicModel, number> = { amateur: -0.06, mixed: 0.03, professional: 0.10 };

export interface EnvironmentInput {
    club: ClubDef;
    employment: EmploymentStatus;
    squadTrack: SquadTrack;
    age: number;
    role: PlayerRole;
    /** Lesiones graves acumuladas. Pesa sobre la capacidad de recuperación. */
    severeInjuries: number;
    /** Copas que disputa el club esta temporada. */
    cupCount: number;
    /** ¿Es internacional habitual? Suma viajes y presión. */
    international: boolean;
}

/**
 * Deriva el entorno de la temporada. Puro y determinístico: sin RNG.
 */
export function deriveEnvironment(input: EnvironmentInput): SeasonEnvironment {
    const { club, employment, squadTrack, age, role, severeInjuries, cupCount, international } = input;
    const band = sportingBandOf(club);
    const model = economicModelOf(club);
    const isDevelopment = squadTrack === 'development';
    const base = { ...BY_EMPLOYMENT[employment], ...(isDevelopment ? DEVELOPMENT_TRACK : {}) };
    const structure = STRUCTURE_BONUS[model];

    // La banda deportiva sube la intensidad y la exposición, no el "todo".
    const bandFactor = band / 8;

    // Un club rico invierte en estructura por encima de su liga.
    const wealth = (club.marketBand - 3) * 0.02;

    const trainingQuality = clamp01((base.trainingQuality ?? 0.5) + structure + wealth + bandFactor * 0.08);
    const trainingLoad = clamp01((base.trainingLoad ?? 0.5) + bandFactor * 0.06);
    const recoverySupport = clamp01((base.recoverySupport ?? 0.5) + structure + wealth + bandFactor * 0.05);
    const medicalSupport = clamp01((base.medicalSupport ?? 0.5) + structure + wealth + bandFactor * 0.06);

    // Intensidad: sube con la banda y con jugar de titular; el desarrollo
    // compite en un escalón más blando aunque el club sea de élite.
    const roleIntensity = role === 'starter' ? 0.12 : role === 'rotation' ? 0.05 : 0;
    const developmentRelief = isDevelopment ? -0.18 : 0;
    const matchIntensity = clamp01(0.30 + bandFactor * 0.55 + roleIntensity + developmentRelief);

    // Vida fuera del rugby: el contrato manda, la edad matiza (un veterano
    // amateur suele tener más obligaciones que un pibe de 19).
    const lifeLoad = clamp01((base.lifeLoad ?? 0.4) + Math.max(0, age - 27) * 0.012);

    // Viajes: competiciones multinacionales y copas.
    const multiCountry = club.countryCode === 'multi' ? 0.22 : 0;
    const travelLoad = clamp01(0.12 + bandFactor * 0.30 + multiCountry + cupCount * 0.08 + (international ? 0.18 : 0));

    // Presión por el puesto: cuanto mejor el club, más competencia interna.
    const selectionPressure = clamp01(0.15 + (club.rating / 100) * 0.6 + (role === 'fringe' ? 0.15 : 0));

    // Exposición: lo que ven seleccionadores y otros clubes.
    const exposure = clamp01(
        bandFactor * 0.62
        + (role === 'starter' ? 0.22 : role === 'rotation' ? 0.10 : 0)
        + cupCount * 0.06
        + (club.prestige / 100) * 0.12
        - (isDevelopment ? 0.12 : 0),
    );

    void severeInjuries; // pesa en `recoveryCapacity`, no en el entorno base.

    return {
        trainingQuality,
        trainingLoad,
        matchIntensity,
        recoverySupport,
        medicalSupport,
        lifeLoad,
        travelLoad,
        selectionPressure,
        exposure,
        teamMatchesAvailable: regularSeasonMatchesOf(club.competitionId),
    };
}

// ── Carga de temporada y riesgo ──────────────────────────────────────────────

export interface SeasonLoad {
    /** Carga total normalizada de ESTA temporada (0..~1.4). */
    currentSeasonLoad: number;
    /** Salto respecto de la anterior. Lo que más importa para la lesión. */
    loadChange: number;
    /** Capacidad de absorber carga (0..1): soporte médico, edad, fragilidad. */
    recoveryCapacity: number;
    /** Peso del historial de lesiones (0..1). */
    injuryHistoryBurden: number;
}

// ── Pesos de cada componente de carga (documentados y comparables) ───────────
// Todos los componentes entran NORMALIZADOS en [0,1] y se combinan con estos
// pesos, que suman 1. Así ninguno domina por escala. `training` pesa más que
// `matches` a propósito: World Rugby señala que el entrenamiento es el grueso
// de la carga física (84-95%); acá no se copia el porcentaje literal, pero el
// entrenamiento NO queda decorativo frente al número bruto de partidos.
// Fuente: https://www.world.rugby/the-game/player-welfare/medical/player-load/coaches-guidance
export const LOAD_WEIGHTS = { training: 0.42, matches: 0.30, life: 0.16, travel: 0.12 } as const;

/** Partidos-equivalentes de referencia para normalizar la carga de partidos. */
export const REFERENCE_MATCH_LOAD = 22;
export const MAX_MATCH_LOAD = 1.4;
/** Piso para el cambio relativo, para que pocas apariciones no exploten. */
export const LOAD_FLOOR = 0.35;

/** Equivalentes de partido según el rol: no todo el que está convocado juega igual. */
export function matchEquivalents(appearances: number, role: PlayerRole): number {
    // Titular ≈ 1 por aparición; rotación ≈ 0.7; suplente/marginal ≈ 0.45.
    const perMatch = role === 'starter' ? 1 : role === 'rotation' ? 0.7 : 0.45;
    return appearances * perMatch;
}

/**
 * Carga de temporada, con TODOS los componentes normalizados a [0,1] antes de
 * combinarse. Se compara contra la temporada anterior en términos RELATIVOS:
 * el SALTO de carga pesa más que el nivel aislado, y el riesgo se concentra en
 * jóvenes, veteranos, quienes vuelven de lesión y quienes suben de nivel.
 */
export function computeSeasonLoad(
    environment: SeasonEnvironment,
    appearances: number,
    role: PlayerRole,
    previousSeasonLoad: number,
    player: Player,
): SeasonLoad {
    // Cada componente en [0,1].
    const matchComponent = clamp01(
        Math.min(MAX_MATCH_LOAD, matchEquivalents(appearances, role) / REFERENCE_MATCH_LOAD) * environment.matchIntensity,
    );
    const trainingComponent = clamp01(environment.trainingLoad * environment.trainingQuality);
    const lifeComponent = environment.lifeLoad;
    const travelComponent = environment.travelLoad;

    const currentSeasonLoad = clamp01(
        LOAD_WEIGHTS.training * trainingComponent
        + LOAD_WEIGHTS.matches * matchComponent
        + LOAD_WEIGHTS.life * lifeComponent
        + LOAD_WEIGHTS.travel * travelComponent,
    );

    const severe = player.injuries.filter((i) => i.severity === 'grave').length;
    const injuryHistoryBurden = clamp01(severe * 0.22 + player.injuries.length * 0.03);

    // Jóvenes y veteranos absorben peor. El soporte médico y la recuperación
    // compensan, pero no borran la fragilidad acumulada.
    const ageFragility = player.age <= 20 ? 0.14 : player.age >= 32 ? (player.age - 31) * 0.06 : 0;
    const recoveryCapacity = clamp01(
        0.35 + environment.recoverySupport * 0.35 + environment.medicalSupport * 0.30 - ageFragility - injuryHistoryBurden * 0.35,
    );

    // Cambio RELATIVO respecto de la anterior, con piso para no dividir por casi
    // cero. Primera temporada: no hay salto que medir.
    const loadChange = previousSeasonLoad > 0
        ? (currentSeasonLoad - previousSeasonLoad) / Math.max(previousSeasonLoad, LOAD_FLOOR)
        : 0;

    return { currentSeasonLoad, loadChange, recoveryCapacity, injuryHistoryBurden };
}

/** Contribución de cada componente (para auditar que ninguno sea decorativo). */
export function loadComponents(environment: SeasonEnvironment, appearances: number, role: PlayerRole) {
    const matchComponent = Math.min(MAX_MATCH_LOAD, matchEquivalents(appearances, role) / REFERENCE_MATCH_LOAD) * environment.matchIntensity;
    return {
        training: LOAD_WEIGHTS.training * clamp01(environment.trainingLoad * environment.trainingQuality),
        matches: LOAD_WEIGHTS.matches * clamp01(matchComponent),
        life: LOAD_WEIGHTS.life * environment.lifeLoad,
        travel: LOAD_WEIGHTS.travel * environment.travelLoad,
    };
}

/**
 * Riesgo de lesión de la temporada. Se construye por partes y se acota:
 * el enum `full-time-professional` por sí solo NO sube el riesgo — lo suben
 * los minutos, el salto de carga y la fragilidad, y lo bajan la medicina y la
 * recuperación.
 */
export function seasonInjuryRisk(load: SeasonLoad, environment: SeasonEnvironment, player: Player): number {
    const base = 0.09;
    const fromLoad = Math.max(0, load.currentSeasonLoad - 0.45) * 0.30;
    // El SALTO (relativo) pesa más que el nivel: subir de golpe es lo peligroso.
    const fromJump = Math.max(0, load.loadChange) * 0.34;
    const fromHistory = load.injuryHistoryBurden * 0.22;
    const fromAge = Math.max(0, player.age - 30) * 0.011;
    const protection = load.recoveryCapacity * 0.16 + environment.medicalSupport * 0.06;

    return Math.max(0.03, Math.min(0.68, base + fromLoad + fromJump + fromHistory + fromAge - protection));
}
