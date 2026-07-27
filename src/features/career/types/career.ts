import type { Player, Position } from './player.ts';
import type { LeagueStanding, SeasonCompetitionParticipation, SeasonResult, SeasonStats } from './season.ts';
import type { TitleWon } from '../data/clubs2026/competitions2026.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import type { EmploymentStatus, SquadTrack } from '../engine/contracts.ts';

/**
 * DESDE DÓNDE arranca la carrera. Es la primera decisión del juego, antes de que
 * la carrera empiece — no un evento que el motor sortea a los 25 años.
 *
 * Fija los dos ejes que ya modelaba el motor y que son INDEPENDIENTES entre sí
 * (ver engine/contracts.ts): el vínculo económico (`EmploymentStatus`, ordinal) y
 * dónde está en el plantel (`SquadTrack`, que no es un escalón económico).
 *
 *   amateur      → amateur / senior      / club de modelo `amateur`
 *   development  → compensado / desarrollo / club `mixed` o `professional`
 *   professional → semipro / senior      / club `professional`
 */
export type StartRouteId = 'amateur' | 'development' | 'professional';

export const START_ROUTES: readonly StartRouteId[] = ['amateur', 'development', 'professional'];

/** Cómo entró el jugador al rugby profesional/senior. Se sella en la historia. */
export type EntryMode =
    | 'domestic-senior' // debuta en el plantel senior de su liga doméstica
    | 'foreign-amateur' // emigra a una liga amateur/mixta de otro país
    | 'external-development'; // entra a la academia/desarrollo de un club de afuera

/**
 * Naturaleza del movimiento de mercado, en terminología de rugby (UAR). NO es
 * "firmar contrato" salvo en clubes profesionales. La UI y el relato consumen
 * `movementKind` para elegir el texto correcto (pase, invitación, contrato…).
 */
export type MovementKind =
    | 'stay' // seguir en el club
    | 'amateur-pass' // pase amateur dentro de la misma unión/sistema
    | 'inter-union-pass' // pase entre uniones (mudanza / oportunidad deportiva)
    | 'international-pass' // pase a otro país
    | 'development-invite' // lugar de desarrollo / academia
    | 'semi-pro-agreement' // acuerdo semiprofesional
    | 'professional-contract'; // contrato profesional (solo clubes pro)

// 1.5.0: identidad REAL de competición (fin del "campeón de Liga Argentina"),
// ledger de participación club↔jugador, títulos del club vs del jugador,
// terminología amateur por movementKind, mercado como fase explícita y curva de
// OVR recalibrada. Cambia historial/títulos/mercado ⇒ los guardados < 1.5.0 se
// descartan con el aviso no técnico existente.
//
// 1.6.0: planilla completa (puntos guardados + desglose del pie + scrums) y
// ELECCIÓN DE RUTA INICIAL (amateur / desarrollo / profesional), que fija empleo,
// track, modelo económico del club de arranque, edad de debut y OVR inicial.
//
// Las estadísticas por sí solas NO habrían cambiado los resultados: su desglose
// sale de un rng re-sembrado aparte, y se verificó que las carreras de la línea
// de base quedan byte-idénticas. Lo que sí cambia todo es la ruta: el club de
// arranque ahora depende de ella, y con él la carrera entera.
export const ENGINE_VERSION = '1.6.0';

export type CareerPhase = 'setup' | 'season' | 'event' | 'retired';

export interface ClubOffer {
    club: string;
    league: string;
    tier: number;
    role: 'starter' | 'rotation' | 'fringe';
    prestige: number; // 0..100
    wageIndex: number; // 0..100 (fama/plata)
    /** Puerta por la que entró la oferta (ventana / vía profesional / regreso). */
    via: 'window' | 'pathway' | 'homecoming';
    /** Id de la vía cuando `via === 'pathway'`. */
    pathwayId: string | null;
    /** Vínculo económico que ofrece el club. Nunca se muestran cifras. */
    offeredEmployment: EmploymentStatus;
    /** Track ofrecido: desarrollo o senior. */
    offeredTrack: SquadTrack;
    /** Naturaleza del movimiento (pase amateur, contrato pro, invitación…). */
    movementKind: MovementKind;
}

/**
 * Snapshot HISTÓRICO de una temporada. Se congela al jugarla: la trayectoria no
 * puede cambiar porque después cambie un club, una competición o la versión del
 * catálogo. La UI lee esto, no resuelve datos actuales al renderizar.
 */
export interface CareerSeasonEntry {
    season: number;
    age: number;
    clubId: string;
    clubName: string;
    competitionId: string;
    competitionName: string;
    /** Banda del CLUB al que perteneció esa temporada. */
    sportingBand: number;
    /** Banda que DISPUTÓ (con aparición senior). Puede ser menor que la del club. */
    competitiveBand: number;
    economicModel: EconomicModel;
    employment: EmploymentStatus;
    squadTrack: SquadTrack;
    ovr: number;
    ovrDelta: number;
    appearances: number;
    /** Planilla fija de la temporada: se muestra para todos los puestos. */
    points: number;
    tries: number;
    tackles: number;
    /**
     * La CUARTA ranura de la planilla, ya resuelta y congelada. Se guarda el
     * texto y no la clave porque el apertura no tiene un contador sino un
     * porcentaje: si se guardara solo la clave habría que recalcularlo al
     * renderizar, y una temporada vieja podría mostrar otra cosa.
     */
    secondaryStatLabel: string;
    secondaryStat: string;
    caps: number;
    /** Títulos DEL JUGADOR (club campeón + apariciones senior). */
    titlesWon: TitleWon[];
    /** Títulos DEL CLUB (institucionales) — puede incluir alguno que el jugador no sumó. */
    clubTitlesWon: TitleWon[];
    /** Ledger real de competiciones disputadas esta temporada. */
    participations: SeasonCompetitionParticipation[];
    /** Hubo una lesión grave esta temporada (marcador de trayectoria). */
    severeInjury: boolean;
    milestones: CareerMilestone[];
    /**
     * Resumen de carga NORMALIZADO de la temporada. Se congela para que
     * `previousSeasonLoad` de la próxima no dependa del catálogo mutable.
     */
    normalizedLoad: number;
}

/** Hitos de trayectoria. Se detectan al cerrar la temporada. */
export type CareerMilestone =
    | 'senior-debut'
    | 'first-compensated'
    | 'first-semi-professional'
    | 'first-professional'
    | 'first-elite-competition'
    | 'first-call-up'
    | 'first-title'
    | 'international-transfer'
    | 'return-home';

export const MILESTONE_LABELS: Readonly<Record<CareerMilestone, string>> = {
    'senior-debut': 'Debut senior',
    'first-compensated': 'Primer acuerdo compensado',
    'first-semi-professional': 'Primer contrato semiprofesional',
    'first-professional': 'Primer contrato profesional',
    'first-elite-competition': 'Primera competición de élite',
    'first-call-up': 'Primera convocatoria',
    'first-title': 'Primer título',
    'international-transfer': 'Transferencia internacional',
    'return-home': 'Regreso a casa',
};

// Snapshot serializable de una partida. `rngState` permite reproducir la carrera
// exactamente (clave para el leaderboard con validación server-side).
export interface CareerState {
    version: string;
    clubCatalogVersion: string; // catálogo congelado al empezar (determinismo)
    seed: number;
    rngState: number;

    /** Ruta elegida al crear el jugador. Se sella: define cómo se juega la carrera. */
    startRoute: StartRouteId;

    player: Player;
    seasons: SeasonResult[];
    phase: CareerPhase;

    pendingEventId: string | null; // evento a decidir antes de simular la temporada
    recentEventIds: string[]; // para penalizar repeticiones cercanas
    offers: ClubOffer[]; // ofertas de club vigentes (oportunidades de mercado)

    // Mercado como FASE EXPLÍCITA: se evalúa cada temporada aunque no siempre
    // surja una decisión. `marketEvaluatedSeason` deja rastro para auditar que el
    // mercado se miró de verdad (no depende de un evento aleatorio).
    marketEvaluatedSeason: number;
    /**
     * Última temporada en la que el jugador SE MOVIÓ de club. El cooldown del
     * mercado se ancla acá (no en "vi una oferta"): rechazar una oferta NO
     * silencia el mercado — solo un pase reciente lo hace.
     */
    lastMoveSeason: number;

    // Última posición final del club en su liga: es lo que habilita (o no) las
    // copas de la temporada siguiente. null = usar la tabla de referencia.
    lastStanding: LeagueStanding | null;

    /** Versión de la tabla de niveles/economía sellada al empezar. */
    competitionLevelsVersion: string;

    /** Carga de la temporada anterior. El SALTO es lo que dispara lesiones. */
    previousSeasonLoad: number;

    /**
     * Trayectoria HISTÓRICA congelada, una entrada por temporada jugada.
     * Es lo que renderiza la consola: no se recalcula desde el catálogo.
     */
    history: CareerSeasonEntry[];

    // Modificadores que una decisión deja para la temporada que se está por jugar.
    pendingTitleBoost: number;
    pendingCapBoost: number;

    decisionLog: { seasonIndex: number; eventId: string; optionId: string; text: string }[];
}

// Resumen final agrupado, para la pantalla de resultado compartible.
export interface ClubSpell {
    club: string;
    league: string;
    seasons: number;
    matches: number;
    titles: number;
    tries: number;
}

export interface CareerSummary {
    nickname: string;
    position: Position;
    nationality: string;
    debutAge: number;
    retirementAge: number;
    seasons: number;

    totalMatches: number;
    totalMinutes: number;
    caps: number;
    titles: number;
    peakOvr: number;
    avgRating: number;

    totals: SeasonStats;
    byClub: ClubSpell[];
    honours: string[]; // lista de títulos ganados (con repeticiones colapsadas)
    retirementReason: string | null;

    careerScore: number; // puntaje para leaderboard
    finalXI: boolean; // si terminó siendo titular indiscutido de la selección
}
