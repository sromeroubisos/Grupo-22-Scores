// El estado de una carrera de entrenador. Serializable a JSON puro: nada de
// Date, Map, Set ni funciones. Los clubes se guardan por `id` y se resuelven
// contra el catálogo — nunca se guarda el objeto club entero.

import type { UpgradeId } from '../data/upgrades.ts';
import type { WorldState } from '../engine/world.ts';

/**
 * Versión del MOTOR. Subila cuando cambie una regla que altere resultados.
 *
 * 2.1.0 (etapa 2): la fase regular se juega en tres tramos, partido a partido,
 * con la alineación real (lesionados afuera, cansancio y ánimo en el nivel del
 * día), la semana de entrenamiento, el partido clave en dos tiempos y las
 * tarjetas repartidas por tramo. Con la misma semilla la carrera es otra.
 *
 * 2.2.0 (etapa 3): el mercado de jugadores. Los vínculos vencen (`deal.years`
 * baja al cierre), el plantel se completa a 26 con el M19 al cerrar el año, los
 * cedidos vuelven con crecimiento extra y entre el tramo 1 y el 2 hay una
 * ventana corta. El mercado usa RNG DERIVADOS (no corre el de la carrera), pero
 * los vencimientos y las salidas ya cambian el plantel que juega.
 */
/*
 * 2.3.0 (etapa 4): los juveniles. Hay un M19 de verdad (`CoachState.academy`):
 * el que se retira ya no deja su dorsal a un pibe inventado en el momento
 * (`ageSquad` con `replaceRetired: false` no consume el RNG de la carrera para
 * reemplazarlo), los lugares se cubren al cierre con el M19 (los que el
 * entrenador reservó, los que cumplen 20 y, si falta, los mejores) y solo
 * después con libres generados. El formativo puede pedir promover del M19.
 * Con la misma semilla la carrera es otra.
 */
export const ENGINE_VERSION = '2.3.0';

export type MatchOutcome = 'win' | 'draw' | 'loss';

export type PositionGroup =
    | 'primera-linea'
    | 'segunda-linea'
    | 'tercera-linea'
    | 'medios'
    | 'centros'
    | 'fondo';

export interface SquadPlayer {
    id: string;
    name: string;
    group: PositionGroup;
    /** Dorsal habitual. El 10 patea; el 1, el 2 y el 3 son primera línea. */
    number: number;
    age: number;
    /** Nivel actual, escala de jugador (~20 el más flojo, ~75 el mejor del país). */
    level: number;
    /** Techo. Un pibe del M19 llega con `level` bajo y `potential` alto. */
    potential: number;
    /**
     * Certificación de primera línea. Sin un reemplazo certificado en el banco,
     * una lesión de pilar o hooker manda a scrums simulados: el partido se sigue
     * jugando pero el pack pierde su arma. Es reglamento, no una estadística.
     */
    frontRowCertified: boolean;
    /** Temporadas consecutivas en el club. Alimenta la cohesión. */
    seasonsAtClub: number;

    /**
     * Ánimo, 0..100. Sube jugando y ganando; baja sin minutos, con conflictos y
     * con los atrasos y recortes de viáticos.
     */
    morale: number;
    /** Cansancio acumulado, 0..100. Sube por partido y por carga de entrenamiento; baja descansando. */
    fatigue: number;
    /** Fechas que le quedan afuera. 0 = sano. */
    injury: number;
    personality: Personality;
    /** Formado en el club. Cuenta para el objetivo formativo. */
    homegrown: boolean;
    /** Arraigo, 0..100: cuánto le cuesta irse. */
    commitment: number;
    /** Lo que cobra. Sale del estatus de la división (`data/professionalism.ts`). */
    deal: PlayerDeal;
    /** La temporada en curso. */
    stats: PlayerStats;
    /** Los totales de la carrera en el club. */
    career: PlayerStats;
}

export type Personality = 'lider' | 'profesional' | 'ambicioso' | 'leal' | 'conflictivo' | 'tranquilo';

export type DealKind = 'amateur' | 'beca' | 'viatico' | 'contrato';

/**
 * Lo que el club le paga a un jugador. `monthly` en pesos del juego (ver la
 * escala en `data/professionalism.ts`); `years` es lo que le queda de vínculo
 * (cero en el amateur, que no tiene vínculo).
 */
export interface PlayerDeal {
    kind: DealKind;
    monthly: number;
    years: number;
}

export interface PlayerStats {
    /** Partidos jugados: titular o desde el banco (los 23 del día). */
    apps: number;
    starts: number;
    tries: number;
    /** Tries por cinco más lo que pateó a los palos (solo el apertura del día). */
    points: number;
    /** Esquema 7. Un guardado anterior lo trae en cero. */
    tackles: number;
    /** Nota media, 0..10. Cero sin partidos. */
    rating: number;
}

/** Los cinco ejes del entrenador, en escala 1..10. */
export interface CoachAttributes {
    /** Manejo del partido: los cambios, la salida, el momento de ir a los palos. */
    conduccion: number;
    /** Lo que le sacás al plantel cuando el partido se pone cuesta arriba. */
    arenga: number;
    /** Lo que hacés crecer del M19 y de los que recién suben. */
    formacion: number;
    /** El trato con la subcomisión, el sponsor y la unión. */
    gestion: number;
    /** El orden: las tarjetas que no te sacan y los penales que no regalás. */
    disciplina: number;
}

export interface Coach {
    name: string;
    age: number;
    attrs: CoachAttributes;
    /** Reputación en el ambiente, 0..100. Abre y cierra puertas entre clubes. */
    reputation: number;
}

/** La caja del club. En rugby amateur no hay mercado: hay tesorería. */
export interface ClubFinances {
    /** Lo que hay hoy, en pesos. Puede quedar en rojo: eso es deuda. */
    caja: number;
    /** Socios activos. De acá sale la cuota, que es el ingreso grande. */
    socios: number;
    /**
     * Estructura: canchas, gimnasio, sede, tercer tiempo. 0..100.
     * Sube el techo de desarrollo del plantel y frena la fuga de jugadores.
     */
    estructura: number;
    /** Cuánto acompaña la gente, 0..100. Mueve buffet, rifa y sponsors. */
    hinchada: number;
}

export interface ClubRuntime {
    /** Cohesión del grupo, 0..100. Es la química del vestuario. */
    cohesion: number;
    finances: ClubFinances;
    /**
     * Las mejoras compradas, por nivel (0..3). Son del CLUB: al cambiar de club
     * se empieza de cero. Ver `data/upgrades.ts`.
     */
    upgrades: Partial<Record<UpgradeId, number>>;
}

/**
 * Cómo te evaluó la subcomisión, en los tres ejes de El Interino traducidos:
 * lo deportivo, la caja y la cantera. Cada uno de 0 a 100; la nota es el
 * promedio pesado (`BOARD_WEIGHTS` en `engine/board.ts`).
 */
export interface BoardReview {
    deportivo: number;
    caja: number;
    cantera: number;
    nota: number;
}

export type ObjectiveKind = 'campeon' | 'playoff' | 'mitad' | 'permanencia';

export interface Objective {
    kind: ObjectiveKind;
    /** Posición que hay que alcanzar (o no empeorar) para cumplirlo. */
    position: number;
    text: string;
}

export interface TableRow {
    clubId: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    pf: number;
    pc: number;
    tries: number;
    bonusOf: number;
    bonusDef: number;
    points: number;
}

export interface MatchResult {
    round: number;
    homeId: string;
    awayId: string;
    homePf: number;
    awayPf: number;
    homeTries: number;
    awayTries: number;
    /** Nota del partido: tarjeta, lesión, scrums simulados. Casi siempre null. */
    note: string | null;
}

export type KnockoutStage = 'octavos' | 'cuartos' | 'semis' | 'final';

export interface KnockoutTie {
    /** A qué torneo pertenece el cruce: el playoff del torneo, el TDI o el Nacional. */
    competitionId: string;
    /**
     * De qué llave de la división es: el playoff por el título o el reducido por
     * el ascenso. Falta en el Interior, en el Nacional y en los cruces guardados
     * antes del esquema 5.
     */
    bracket?: 'titulo' | 'ascenso';
    stage: KnockoutStage;
    homeId: string;
    awayId: string;
    homePf: number;
    awayPf: number;
}

/** Hasta dónde llegó un club en una llave. */
export type KnockoutRun = KnockoutStage | 'campeon' | null;

/** Lo que le pasó al club en una temporada, congelado. */
export interface SeasonEntry {
    season: number;
    year: number;
    clubId: string;
    competitionId: string;
    /** Nombre de la competición COMO SE LLAMABA esa temporada. */
    competitionName: string;
    position: number;
    teams: number;
    points: number;
    won: number;
    drawn: number;
    lost: number;
    pf: number;
    pc: number;
    /** Campeón de su torneo (ganó el playoff, o la liga si no tiene playoff). */
    champion: boolean;
    /** Ascendió o descendió al cerrar la temporada. */
    movement: 'ascenso' | 'descenso' | null;
    /**
     * Cómo ascendió, si ascendió: campeón, por posición o por el reducido.
     * Opcional: las temporadas jugadas antes del esquema 5 no lo tienen.
     */
    promotedVia?: 'campeon' | 'directo' | 'reducido';
    /** Hasta dónde llegó en el Torneo del Interior, si clasificó. */
    tdi: KnockoutRun;
    /** Campeón del Nacional de Clubes. */
    nacional: boolean;
    /** Si cumplió el objetivo que le puso la subcomisión. */
    objectiveMet: boolean;
    objectiveText: string;
    /**
     * Lo que le dijeron al cerrar el año, en una línea. Va CONGELADO en la
     * temporada y no se recalcula al renderizar: se escribió con la caja, la
     * deuda y la tabla de ese momento, y todas esas cosas cambian después. Un
     * veredicto derivado diría, tres temporadas más tarde, algo que nadie dijo.
     */
    verdict: string;
    /** Presión al cerrar la temporada. */
    pressure: number;
    caja: number;
    /** Los desenlaces de las decisiones de esa temporada, en orden. */
    decisions: string[];
    /**
     * La caja de ese cierre, CONGELADA: ingresos, egresos, meses de deuda y el
     * estado en que quedó. De acá se deriva la deuda "crónica" (grave en dos
     * cierres seguidos) sin guardar un contador. Opcional: las temporadas jugadas
     * antes del esquema 6 no la tienen.
     */
    finance?: SeasonFinance;
    /** Los objetivos de esa temporada y si se cumplieron. Opcional (esquema 6). */
    objectives?: ObjectiveResult[];
    /** Cómo quedó el proyecto de tres temporadas en ese cierre. Opcional (esquema 6). */
    project?: ProjectSnapshot;
    /**
     * La evaluación en tres ejes. Opcional: las temporadas jugadas antes del
     * esquema 2 no la tienen, y no se inventa después.
     */
    board?: BoardReview;
    /** Los nombres del año: goleador, tackleador, el que más jugó y el mejor. Opcional (esquema 7). */
    stars?: SeasonStars;
}

/** Un jugador destacado de la temporada, congelado con su número. */
export interface SeasonStar {
    playerId: string;
    name: string;
    value: number;
}

export interface SeasonStars {
    tries: SeasonStar | null;
    tackles: SeasonStar | null;
    apps: SeasonStar | null;
    /** El mejor del año: la nota media más alta entre los que jugaron la mitad de las fechas. */
    best: SeasonStar | null;
}

/** El estado de la deuda. `cronica` es grave en dos cierres seguidos. */
export type DebtStatus = 'sana' | 'ajustada' | 'complicada' | 'grave' | 'cronica';

export interface SeasonFinance {
    ingresos: number;
    egresos: number;
    resultado: number;
    debtMonths: number;
    debt: DebtStatus;
    /** Lo que la subcomisión impuso al cerrar (plan de ajuste, intervención), en frases. */
    measures: string[];
}

export type ObjectiveAxis = 'deportivo' | 'secundario' | 'formativo' | 'economico';

/** Cómo se mide un objetivo al cerrar. Datos, no funciones: va en el guardado. */
export type ObjectiveMeasure =
    | { kind: 'deportivo' }
    | { kind: 'superar-puntos'; points: number }
    | { kind: 'ganar-local'; wins: number }
    | { kind: 'ganarle-a'; clubId: string }
    | { kind: 'diferencia-positiva' }
    /** Esquema 6: N propios en el XV del cierre. Se sigue midiendo en las partidas que lo traen. */
    | { kind: 'titulares-propios'; count: number }
    /**
     * Esquema 7: titularidades de los propios en la fase regular. `youthOnly`:
     * en una división amateur casi todos son formados en el club, así que ahí
     * cuentan solo los de 21 o menos.
     */
    | { kind: 'titularidades-propias'; starts: number; youthOnly: boolean }
    | { kind: 'sin-deficit' }
    | { kind: 'bajar-deuda'; pct: number; from: number }
    /**
     * Esquema 9: subir del M19 a primera al menos `count` pibes en la temporada.
     * `from` son los que ya habían subido ESA temporada cuando se fijó el
     * objetivo (los que cubrieron lugares al cierre): esos no cuentan.
     */
    | { kind: 'promover-m19'; count: number; from: number };

export interface SeasonObjective {
    id: string;
    axis: ObjectiveAxis;
    text: string;
    /** Peso en la nota de la subcomisión. Los de una temporada suman 100. */
    weight: number;
    measure: ObjectiveMeasure;
}

export interface ObjectiveResult {
    id: string;
    axis: ObjectiveAxis;
    text: string;
    weight: number;
    met: boolean;
    /** Lo que pasó, medido: "8 de local, pedían 6". */
    detail: string;
    /** La consecuencia, en una línea. */
    consequence: string;
}

export type ProjectKind = 'ascenso' | 'estructura' | 'sanear';

/** El proyecto de tres temporadas. Es del CLUB: al cambiar de club se pierde. */
export interface ClubProject {
    kind: ProjectKind;
    clubId: string;
    text: string;
    fromSeason: number;
    /** La última temporada que cuenta. */
    deadlineSeason: number;
    /** De dónde se arrancó: estructura, niveles de mejoras o deuda neta. */
    start: number;
    startUpgrades: number;
    /** 0..1. */
    progress: number;
    status: 'activo' | 'cumplido' | 'vencido';
}

export interface ProjectSnapshot {
    text: string;
    progress: number;
    status: ClubProject['status'];
    consequence: string | null;
}

/** El préstamo de la unión: cuota fija anual, tres temporadas. */
export interface UnionLoan {
    principal: number;
    /** Interés anual, 0..1. */
    rate: number;
    /** Lo que queda por devolver de capital. */
    balance: number;
    /** Cuota anual fija (capital + interés). */
    payment: number;
    seasonsLeft: number;
    takenSeason: number;
}

export type CostCutId = 'viajes' | 'viaticos' | 'mantenimiento';

export interface FinanceState {
    loan: UnionLoan | null;
    /** Adelantos de cuotas: lo cobrado en una temporada se descuenta de las cuotas de la siguiente. */
    duesAdvances: { season: number; amount: number }[];
    /** Última temporada con evento a beneficio, y lo que rindió. */
    benefit: { season: number; amount: number } | null;
    /** Los recortes elegidos para la temporada `season`. */
    cuts: { season: number; kinds: CostCutId[] };
    /**
     * Lo que la subcomisión le suma o le recorta al presupuesto de la temporada,
     * como fracción de los ingresos propios (−0,1..+0,1). Sale de los objetivos
     * del cierre anterior.
     */
    boardBudget: number;
}

export interface DecisionLogEntry {
    season: number;
    eventId: string;
    optionId: string;
    outcomeIndex: number;
    text: string;
}

export type Phase =
    | 'preseason' // el objetivo y el estado del club
    | 'decision' // hay una tarjeta esperando respuesta
    | 'reveal' // se resolvió la tarjeta, falta que el jugador la lea
    | 'training' // la semana de entrenamiento antes de las fechas del tramo
    | 'keymatch' // el partido clave del tramo: plan, primer tiempo, entretiempo
    | 'tramo' // se jugó el tramo: resultados, tabla parcial y lesionados
    | 'market' // la ventana corta de pases, entre el tramo 1 y el 2
    | 'playoff' // terminó la fase regular y el club juega la definición
    | 'season' // la temporada ya se jugó: tabla y resultado
    | 'fired' // te echaron
    | 'retired'; // te retiraste

/** Cómo encara el entrenador un partido de playoff. Ver `engine/playoff.ts`. */
export type PlayoffApproachId = 'plan' | 'arenga' | 'orden';

/**
 * La llave que el jugador está jugando, partido a partido: el playoff por el
 * título o el reducido por el ascenso (`data/formats.ts` dice cuál tiene cada
 * división). La tabla ya está en `lastTable`; acá va lo que hace falta para
 * seguir la llave sin volver a sortear nada de lo que ya pasó.
 */
export interface PendingPlayoff {
    /** `titulo`: el playoff por el campeonato. `ascenso`: el reducido por la plaza. */
    kind: 'titulo' | 'ascenso';
    competitionId: string;
    /** Los que entraron, en orden de tabla (2, 4, 6 u 8). */
    seeds: string[];
    /** El rating con el que cada club del torneo jugó el año, con el jitter de temporada. */
    ratings: Record<string, number>;
    /** Los cruces ya jugados de ESTA llave, en orden. */
    played: KnockoutTie[];
    /** Los que siguen vivos al llegar a `stage`, en orden de siembra. */
    alive: string[];
    /** La instancia del próximo partido del club. */
    stage: KnockoutStage;
    homeId: string;
    awayId: string;
    neutral: boolean;
    /** El campeón, si ya se definió (el reducido se juega después del título). */
    championId: string | null;
}

/* ------------------------------------------------------------------ */
/* La temporada en tramos (etapa 2)                                    */
/* ------------------------------------------------------------------ */

export type TrainingLoad = 'alta' | 'media' | 'baja';
export type TrainingFocus = 'scrum-line' | 'defensa' | 'ataque' | 'fisico' | 'recuperacion';
/** Cómo se arma el XV de cada fecha del tramo. */
export type LineupPolicy = 'mejores' | 'rotacion' | 'cantera';

export interface TrainingDay {
    load: TrainingLoad;
    focus: TrainingFocus;
}

/** La semana: cinco días y la política del XV para las fechas del tramo. */
export interface TrainingPlan {
    days: TrainingDay[];
    lineup: LineupPolicy;
}

/** Lo que dejó la semana, ya calculado. Vale para las fechas de UN tramo. */
export interface TrainingWeek {
    plan: TrainingPlan;
    /** Puntos de rating en todas las fechas del tramo. */
    bonus: number;
    /** Puntos de rating extra en el partido clave: los días que atacaron su debilidad. */
    keyBonus: number;
    /** Riesgo de lesión extra por partido, + o −. */
    injuryRisk: number;
    /** Cuánto menos se cansa el XV por partido (días de físico). */
    fatigueRelief: number;
}

/** Cómo se encara el partido clave antes de salir a la cancha. */
export type KeyPlanId = 'cerrado' | 'equilibrado' | 'abierto';
/** El ajuste del entretiempo. `mantener` es seguir con el plan. */
export type HalfAdjustId = 'mantener' | 'cerrar' | 'arriesgar' | 'rotar';

/** El primer tiempo ya jugado del partido clave, con lo que hace falta para el segundo. */
export interface KeyFirstHalf {
    homePf: number;
    awayPf: number;
    /** Lo que las incidencias del partido le cuestan a cada lado en el segundo tiempo. */
    homeCost: number;
    awayCost: number;
    note: string | null;
    /** El jugador del club que se lesionó en el primer tiempo, si hubo. */
    hurtId: string | null;
}

export interface KeyMatch {
    round: number;
    rivalId: string;
    home: boolean;
    /** Lluvia, sorteada al cerrar la semana: el juego cerrado rinde más. */
    rain: boolean;
    /** La debilidad del rival (dato del club, sin azar). */
    weakness: TrainingFocus;
    plan: KeyPlanId | null;
    firstHalf: KeyFirstHalf | null;
    /** El ajuste del entretiempo, una vez jugado el segundo tiempo. */
    adjust: HalfAdjustId | null;
}

/** Un jugador que se fue a mitad de año: lo que sumó queda en la planilla del club. */
export interface GonePlayer {
    id: string;
    name: string;
    /** Para el objetivo formativo: sus titularidades cuentan si era propio. */
    age: number;
    homegrown: boolean;
    stats: PlayerStats;
}

/** Una lesión del año, para el relato del tramo. */
export interface InjuryNote {
    playerId: string;
    name: string;
    round: number;
    /** Fechas afuera. */
    out: number;
}

/**
 * La temporada mientras se juega. Vive desde que arranca la fase regular hasta
 * el cierre del año (`closeSeason`). Todo lo que hace falta para seguir está
 * acá: recargar a mitad de un tramo, en cualquier fase, retoma idéntico.
 */
export interface InSeason {
    /** Tramo en curso, 0..2. Con la fase regular terminada queda en `TRAMOS`. */
    tramo: number;
    /** Tarjetas de cada tramo de ESTE año (una partida migrada a mitad de las cinco no repite). */
    cards: number[];
    /** La última fecha jugada. 0 antes de la primera. */
    round: number;
    /** Rating con el que cada club juega el año (con el jitter de temporada). */
    effective: Record<string, number>;
    /** La tabla hasta `round`, ordenada. */
    table: TableRow[];
    /** Los partidos de la fase regular hasta `round`, de todos los clubes. */
    matches: MatchResult[];
    /** La semana del tramo en curso. null hasta que se entrena. */
    week: TrainingWeek | null;
    /** El partido clave del tramo en curso. null si no hay o ya se jugó. */
    key: KeyMatch | null;
    /** Las lesiones del año, en orden. */
    injuries: InjuryNote[];
    /** Los que se fueron a mitad de año, con lo que sumaron. */
    gone: GonePlayer[];
}

/** Lo que una decisión le deja a la temporada. Se apaga al cerrarla. */
export interface SeasonMods {
    /** Puntos de rating de equipo, + o −. */
    rating: number;
    /** Riesgo extra de lesión por partido, sumado a la base. */
    injuryRisk: number;
    /**
     * El plantel viaja corto. No es un número: es la decisión de llevar 22 en vez
     * de 26, y lo que hace es dejar el banco sin primera línea de recambio.
     */
    bancoCorto: boolean;
}

/** Un eje de impacto tal como lo lee el jugador. */
export interface ImpactChip {
    key: 'plantel' | 'grupo' | 'caja' | 'hinchada' | 'presion' | 'estructura';
    label: string;
    /** Delta REAL, medido restando estados. Nunca el efecto declarado. */
    delta: number;
    /** Cómo se escribe: puntos, porcentaje o pesos. */
    unit: 'pts' | 'pct' | 'money';
    /** Si el delta es bueno o malo PARA EL JUGADOR (la presión sube = malo). */
    tone: 'good' | 'bad' | 'neutral';
}

export interface PendingReveal {
    eventId: string;
    optionId: string;
    outcomeIndex: number;
    title: string;
    text: string;
    /** Los chips que se le muestran al jugador, ya calculados por diferencia. */
    chips: ImpactChip[];
}

/** Un entrenador de otro club. No es una persona real: es un nombre del padrón. */
export interface BenchCoach {
    name: string;
    /** Reputación en el ambiente, 0..100, en la misma escala que la del jugador. */
    rep: number;
    /** Año en que asumió. De acá sale si el ciclo ya está cumplido. */
    since: number;
}

/** Por qué un club se quedó sin entrenador. */
export type VacancyReason = 'despido' | 'renuncia' | 'ciclo' | 'salida';

/** Una propuesta de trabajo para el jugador. Sale de una vacante REAL del mundo. */
export interface JobOffer {
    clubId: string;
    competitionId: string;
    reason: VacancyReason;
    /** El que se fue, para el relato. */
    outgoing: string;
    /** Lo que le pasó al club en la temporada que cerró. */
    moved: 'ascenso' | 'descenso' | null;
    /** Posición por fuerza dentro de su torneo, 1-based. */
    rank: number;
    teams: number;
    /** Lo que te van a pedir si firmás. */
    objective: Objective;
    /** Cuánto te quieren, 0..100. */
    interest: number;
    /** Por qué te llaman, en frases cortas. */
    reasons: string[];
}

/** Un movimiento de bancos en el mundo, para el relato. */
export interface MarketNews {
    clubId: string;
    competitionId: string;
    reason: VacancyReason;
    outgoing: string;
    incoming: string;
}

/** El mercado de entrenadores al cierre de una temporada. */
export interface MarketState {
    /** La temporada para la que valen las ofertas. */
    season: number;
    /** Lo que tenés sobre la mesa. Se cae al arrancar la temporada. */
    offers: JobOffer[];
    /** Quién se fue y quién llegó en los otros clubes. */
    news: MarketNews[];
}

export interface CoachState {
    seed: number;
    rngState: number;
    season: number;
    year: number;
    phase: Phase;

    coach: Coach;
    clubId: string;
    competitionId: string;
    club: ClubRuntime;
    squad: SquadPlayer[];

    /**
     * La pirámide entera: el rating de los 554 clubes y en qué torneo juega cada
     * uno. Va en el guardado porque DERIVA temporada a temporada —los clubes
     * suben, bajan y cambian de nivel— y sin eso una partida recargada arrancaría
     * de nuevo con el reparto inicial y la carrera se contradiría a sí misma.
     * Son unos veinte kilobytes de JSON: cabe de sobra en localStorage.
     */
    world: WorldState;

    /** 0..100. A 100 la subcomisión te agradece los servicios. */
    pressure: number;
    objective: Objective;

    /** Tarjetas que quedan en el tramo en curso (o, en una partida migrada, antes de la temporada). */
    decisionsLeft: number;
    /** Eventos ya vistos, con la última temporada en que salieron (cooldown). */
    seenEvents: Record<string, number>;
    pendingEventId: string | null;
    /** El desenlace que salió, esperando que el jugador lo lea. */
    pendingReveal: PendingReveal | null;

    seasonMods: SeasonMods;

    /** El playoff en curso, si el club entró a la definición. null el resto del año. */
    playoff: PendingPlayoff | null;

    /** Tabla y partidos de la última temporada jugada. Vacíos antes de la primera. */
    lastTable: TableRow[];
    lastMatches: MatchResult[];
    lastKnockout: KnockoutTie[];

    /**
     * Quién subió y quién bajó en el torneo del jugador, que es el único que se
     * juega de verdad. El tick del mundo lo RESPETA en vez de sortearlo: sin
     * esto, el club podría salir campeón y que la pirámide ascendiera a otro.
     * null antes de la primera temporada.
     */
    lastLeagueMovement: { promoted: string[]; relegated: string[] } | null;

    seasons: SeasonEntry[];
    decisionLog: DecisionLogEntry[];
    flags: Record<string, number>;

    /**
     * El mercado de entrenadores: las propuestas que tenés y lo que se movió en
     * los bancos de los otros clubes. Se recalcula al cerrar cada temporada.
     */
    market: MarketState;

    /** Préstamo, adelantos, evento a beneficio, recortes y el ajuste de la subcomisión. */
    finance: FinanceState;
    /**
     * Lo que la subcomisión pide ESTA temporada, en cuatro ejes. Vacío en una
     * partida migrada a mitad de temporada: se genera en la próxima pretemporada.
     */
    objectives: SeasonObjective[];
    /** El proyecto de tres temporadas del club. null hasta la próxima pretemporada. */
    project: ClubProject | null;

    /** Clubes dirigidos, en orden. El primero es donde empezó. */
    history: { clubId: string; fromSeason: number; toSeason: number | null }[];

    /** La temporada en tramos mientras se juega (esquema 7). null en la pretemporada. */
    inSeason: InSeason | null;
    /**
     * La semana de entrenamiento que el entrenador dejó fija. Se usa en "Simular
     * el tramo" y como punto de partida de cada semana. null: la del motor.
     */
    trainingDefault: TrainingPlan | null;

    /**
     * El mercado de jugadores (esquema 8): la ventana abierta con sus ofertas,
     * candidatos y pedidos, los cedidos, la plata de la temporada y la
     * negociación en curso. Ver `engine/transfers.ts`.
     */
    transfers: TransferState;

    /**
     * El M19 (esquema 9): los pibes, la jornada de captación del año y lo que
     * pasó con ellos. No forman parte de `squad` ni cuentan para el tope de 26.
     * Ver `engine/academy.ts`.
     */
    academy: AcademyState;
}

/* ------------------------------------------------------------------ */
/* Los juveniles (etapa 4)                                             */
/* ------------------------------------------------------------------ */

/** El plan de desarrollo de un pibe del M19. */
export type DevPlan = 'equilibrado' | 'fisico' | 'tecnico' | 'minutos';

/**
 * Un pibe del M19. `ceiling` es el techo REAL y está OCULTO: no se muestra ni se
 * escribe en ningún texto. Lo que el club sabe es el rango estimado
 * (`estMin`..`estMax`), que siempre lo contiene y se angosta observando y con
 * los años.
 */
export interface AcademyPlayer {
    id: string;
    name: string;
    group: PositionGroup;
    age: number;
    level: number;
    /** OCULTO. */
    ceiling: number;
    estMin: number;
    estMax: number;
    personality: Personality;
    plan: DevPlan;
    /** La temporada en que se sumó al M19. */
    joined: number;
    /** Cedido por la temporada a ese club. null: entrena en el club. */
    loanClubId: string | null;
    /** El entrenador lo quiere en primera: cubre el primer lugar que se libere al cierre. */
    reserve: boolean;
    /** OCULTO: llegó como joya de la captación. Solo para medir. */
    gem: boolean;
}

/** Un candidato de la jornada de captación. Mismos ocultos que un pibe del M19. */
export interface ScoutCandidate {
    id: string;
    name: string;
    group: PositionGroup;
    age: number;
    level: number;
    /** OCULTO. */
    ceiling: number;
    estMin: number;
    estMax: number;
    personality: Personality;
    /** Lo que se ve de él en la cancha, en palabras. Sin números. */
    hint: string;
    /** Cuántas veces se lo observó. */
    observed: number;
    /** OCULTO. */
    gem: boolean;
}

/** La jornada de captación de una temporada (minijuego 4). */
export interface ScoutingDay {
    season: number;
    candidates: ScoutCandidate[];
    /** Puntos de observación que quedan. */
    points: number;
    pointsMax: number;
    /** Cuántos se pueden sumar como mucho. */
    picksMax: number;
    /** Los ids de los que se sumaron. */
    signed: string[];
    done: boolean;
}

export interface AcademyLogEntry {
    season: number;
    /**
     * `promocion`: lo subió el entrenador. `auto`: subió solo para cubrir un
     * lugar. `se-va`: cumplió 20 sin lugar en primera, o lo liberaron.
     * `espera`: estaba reservado y al cierre no se liberó ningún lugar.
     */
    kind: 'promocion' | 'auto' | 'se-va' | 'cesion' | 'sumado' | 'vuelve' | 'espera';
    playerId: string;
    text: string;
}

export interface AcademyState {
    players: AcademyPlayer[];
    scouting: ScoutingDay | null;
    /** Lo de esta temporada y la anterior. */
    log: AcademyLogEntry[];
}

/* ------------------------------------------------------------------ */
/* El mercado de jugadores (etapa 3)                                   */
/* ------------------------------------------------------------------ */

/** Las dos ventanas: la pretemporada y la corta entre el tramo 1 y el 2. */
export type WindowKind = 'pretemporada' | 'corta';

/**
 * Por dónde llega una oferta. `nacional`: un club de arriba de la misma rama.
 * `abierto`: el mercado del exterior, solo para el que tiene contrato. El resto
 * son las VÍAS DECLARADAS (`data/transfer-pathways.ts`): la única puerta al
 * exterior para un amateur, un becado o uno con viático.
 */
export type OfferRoute = 'nacional' | 'abierto' | 'franquicia' | 'academia' | 'convenio';

/** Lo que le ofrecen allá. `profesional` y `academia` solo existen en el exterior. */
export type OfferedDeal = DealKind | 'profesional' | 'academia';

/** Un club que quiere a un jugador del plantel. */
export interface PlayerOffer {
    /** Único y estable: de él sale el RNG derivado de la respuesta del jugador. */
    id: string;
    playerId: string;
    /** Del canon si es del país; del catálogo de Carrera de Rugby si es del exterior. */
    clubId: string;
    abroad: boolean;
    route: OfferRoute;
    /** La vía declarada por la que llega, si llega por una. */
    pathwayId: string | null;
    deal: OfferedDeal;
    /**
     * Compensación para el club, en pesos. Cero donde no hay pase. En el amateur
     * y los viáticos, a lo sumo una ayuda simbólica que no se muestra como cifra.
     */
    fee: number;
    /** La chance (0..100) de que el jugador se quiera ir si el club acepta. Se muestra. */
    inclination: number;
    /** Por qué se quiere ir o quedar, en frases cortas. */
    reasons: string[];
    /** Ya se intentó retenerlo y no alcanzó. */
    retainTried: boolean;
}

/** Un jugador que podría sumarse al club. */
export interface ArrivalCandidate {
    id: string;
    origin: 'libre' | 'vuelve' | 'sube' | 'region';
    /** El club de donde viene (canon o catálogo de Carrera), si viene de uno. */
    fromClubId: string | null;
    fromAbroad: boolean;
    player: SquadPlayer;
    /** La chance (0..100) de que firme si se lo llama, con la competencia adentro. Se muestra. */
    chance: number;
    /** Otro club que también lo quiere. */
    rivalClubId: string | null;
    reasons: string[];
}

/** Un jugador que pide salir: ánimo bajo y pocas titularidades. */
export interface ExitRequest {
    playerId: string;
    reason: string;
}

/** Un jugador cedido a un club de abajo por la temporada. No juega para el club. */
export interface LoanedPlayer {
    player: SquadPlayer;
    clubId: string;
    season: number;
}

export type NegotiationReply = 'lejos' | 'se-acerca' | 'casi' | 'acepta' | 'rompe';

export interface NegotiationRound {
    offer: number;
    reply: NegotiationReply;
    /** La contraoferta del rival, si siguió la charla. */
    counter: number | null;
}

/** Una negociación (minijuego 3). Ver `engine/negotiation.ts`. */
export interface Negotiation {
    subject: string;
    /** `venta`: el club cobra. `compra`: el club paga. */
    side: 'compra' | 'venta';
    /** `porcentaje`: del viático de referencia de la división (en los viáticos no se habla en pesos). */
    unit: 'pesos' | 'porcentaje';
    anchor: number;
    /** La reserva del rival. OCULTA: no se muestra ni se escribe en ningún texto. */
    reserve: number;
    patience: number;
    maxPatience: number;
    /** La última cifra del rival. */
    counter: number;
    rounds: NegotiationRound[];
    status: 'abierta' | 'cerrada' | 'rota';
    agreed: number | null;
    step: number;
}

export type NegotiationTarget =
    | { kind: 'venta'; offerId: string }
    | { kind: 'renovacion'; playerId: string }
    | { kind: 'incorporacion'; candidateId: string };

export interface ActiveNegotiation {
    target: NegotiationTarget;
    neg: Negotiation;
}

export interface TransferLogEntry {
    season: number;
    window: WindowKind;
    kind: 'salida' | 'llegada' | 'cesion' | 'renovacion' | 'libre' | 'retenido' | 'se-queda';
    text: string;
}

export interface TransferState {
    /** La ventana abierta. null: cerrada. */
    window: { season: number; kind: WindowKind } | null;
    offers: PlayerOffer[];
    arrivals: ArrivalCandidate[];
    requests: ExitRequest[];
    /** Los cedidos. Cuentan para el tope de 26; no juegan. */
    loaned: LoanedPlayer[];
    /** La plata del mercado en la temporada `season`: entra al presupuesto del cierre. */
    ledger: { season: number; compensaciones: number; indemnizaciones: number };
    /** Los movimientos de esta temporada y la anterior, para el relato. */
    log: TransferLogEntry[];
    negotiation: ActiveNegotiation | null;
}
