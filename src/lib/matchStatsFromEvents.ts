import {
    normalizeSportBucket,
    outcomeScores,
    readOutcomeId,
    resolveOutcomeId,
    type MatchEventDefinition,
} from './matchEventCatalog.ts';
import {
    isGoalKickAttemptEvent,
    isGoalKickMade,
    goalKickEffectivenessPercent,
    parseKickMetersFromDetail,
    parseYardsFromDetail,
    isContestWonDetail,
    isContestLostDetail,
} from './matchEventStats.ts';

/** Mínimo necesario para agregar estadísticas desde cualquier fuente (Match Center, API pública, etc.). */
export type AggregatableMatchEvent = {
    type: string;
    team: 'home' | 'away' | null;
    detail: string;
};

export type TeamMetricPair = {
    home: number;
    away: number;
};

export type CompleteMatchStats = {
    totalEvents: number;
    clockEvents: number;
    assignedEvents: TeamMetricPair;
    points: TeamMetricPair;
    scoringEvents: TeamMetricPair;
    /** Futbol / hockey: goles de penal convertidos, del equipo que anota. */
    penaltyGoals: TeamMetricPair;
    /** Futbol: goles en contra COMETIDOS por el equipo (el tanto es del rival). */
    ownGoals: TeamMetricPair;
    /* ── Basquet ── */
    freeThrows: TeamMetricPair;
    twoPointers: TeamMetricPair;
    threePointers: TeamMetricPair;
    fouls: TeamMetricPair;
    /* ── Basquet / futbol americano ── */
    timeouts: TeamMetricPair;
    /* ── Hockey ── */
    greenCards: TeamMetricPair;
    /** Corners cortos EJECUTADOS. Los no convertidos son la resta con los goles. */
    penaltyCorners: TeamMetricPair;
    penaltyCornerGoals: TeamMetricPair;
    /** Penales stroke EJECUTADOS. */
    penaltyStrokes: TeamMetricPair;
    penaltyStrokeGoals: TeamMetricPair;
    /** Strokes que ataja el arquero rival; el resto de los errados salen desviados. */
    penaltyStrokesSaved: TeamMetricPair;
    freeHits: TeamMetricPair;
    assists: TeamMetricPair;
    shotsOnGoal: TeamMetricPair;
    shotsOffTarget: TeamMetricPair;
    circleEntries: TeamMetricPair;
    interceptions: TeamMetricPair;
    blocks: TeamMetricPair;
    saves: TeamMetricPair;
    clearances: TeamMetricPair;
    /** Definicion por shoot-out. NO entra en el marcador ni en `points`. */
    shootoutScored: TeamMetricPair;
    shootoutMissed: TeamMetricPair;
    /* ── Handball ──
     * El gol es uno solo (`points`); estos son su reparto por origen, que
     * sale del desenlace del evento. Los 7 metros se cuentan EJECUTADOS y el
     * desenlace dice si convirtieron: la efectividad es la resta. */
    goalsFastBreak: TeamMetricPair;
    goalsWing: TeamMetricPair;
    goalsPivot: TeamMetricPair;
    goalsBackcourt: TeamMetricPair;
    goalsEmptyNet: TeamMetricPair;
    sevenMeters: TeamMetricPair;
    sevenMeterGoals: TeamMetricPair;
    sevenMetersSaved: TeamMetricPair;
    /** Lanzamientos que NO fueron gol, del equipo que lanza, por desenlace. */
    shotsSaved: TeamMetricPair;
    shotsMissed: TeamMetricPair;
    shotsBlocked: TeamMetricPair;
    /** De las atajadas (`saves`), las que fueron a un 7 metros. */
    savesSevenMeter: TeamMetricPair;
    steals: TeamMetricPair;
    /** Reparto de `turnoversLost` por motivo. */
    turnoversBadPass: TeamMetricPair;
    turnoversOffensiveFoul: TeamMetricPair;
    turnoversTechnicalFault: TeamMetricPair;
    turnoversPassivePlay: TeamMetricPair;
    twoMinSuspensions: TeamMetricPair;
    blueCards: TeamMetricPair;
    /* ── Futbol americano ──
     * `touchdowns`, `fieldGoals`, `extraPoints` y `twoPointConversions` son los
     * CONVERTIDOS; los intentos van aparte y los fallados son la resta, igual
     * que el corner corto de hockey. */
    touchdowns: TeamMetricPair;
    touchdownsRushing: TeamMetricPair;
    touchdownsPassing: TeamMetricPair;
    /** Devoluciones de intercepcion y de fumble. */
    touchdownsDefensive: TeamMetricPair;
    /** Devoluciones de kickoff y de punt. */
    touchdownsReturn: TeamMetricPair;
    fieldGoals: TeamMetricPair;
    fieldGoalAttempts: TeamMetricPair;
    fieldGoalsBlocked: TeamMetricPair;
    extraPoints: TeamMetricPair;
    extraPointAttempts: TeamMetricPair;
    twoPointConversions: TeamMetricPair;
    twoPointAttempts: TeamMetricPair;
    safeties: TeamMetricPair;
    rushes: TeamMetricPair;
    rushYards: TeamMetricPair;
    passAttempts: TeamMetricPair;
    passCompletions: TeamMetricPair;
    passYards: TeamMetricPair;
    firstDowns: TeamMetricPair;
    /** Sacks HECHOS por la defensa del equipo. Los recibidos son los del rival. */
    sacks: TeamMetricPair;
    forcedFumbles: TeamMetricPair;
    /** Fumbles SOLTADOS por el equipo, los recupere quien los recupere. */
    fumbles: TeamMetricPair;
    /** De esos, los que recupero el rival. */
    fumblesLost: TeamMetricPair;
    /** Fumbles del RIVAL que el equipo recupero. */
    fumbleRecoveries: TeamMetricPair;
    turnoversOnDowns: TeamMetricPair;
    /**
     * Posesiones PERDIDAS: intercepciones sufridas + fumbles perdidos +
     * perdidas en downs. Derivado; nadie lo carga.
     */
    turnovers: TeamMetricPair;
    punts: TeamMetricPair;
    kickoffs: TeamMetricPair;
    touchbacks: TeamMetricPair;
    penaltyYards: TeamMetricPair;
    /* ── Flag ── */
    flagPulls: TeamMetricPair;
    flagPullsForLoss: TeamMetricPair;
    blitzes: TeamMetricPair;
    passesDefended: TeamMetricPair;
    goalKickAttempts: TeamMetricPair;
    goalKicksMade: TeamMetricPair;
    goalKicksMissed: TeamMetricPair;
    tries: TeamMetricPair;
    penaltyTries: TeamMetricPair;
    conversionAttempts: TeamMetricPair;
    conversionsMade: TeamMetricPair;
    conversionsMissed: TeamMetricPair;
    penaltyGoalAttempts: TeamMetricPair;
    penaltyGoalsMade: TeamMetricPair;
    penaltyGoalsMissed: TeamMetricPair;
    dropGoalAttempts: TeamMetricPair;
    dropGoalsMade: TeamMetricPair;
    dropGoalsMissed: TeamMetricPair;
    yellowCards: TeamMetricPair;
    redCards: TeamMetricPair;
    substitutions: TeamMetricPair;
    injuries: TeamMetricPair;
    scrumsTotal: TeamMetricPair;
    scrumsWon: TeamMetricPair;
    scrumsLost: TeamMetricPair;
    linesTotal: TeamMetricPair;
    linesWon: TeamMetricPair;
    linesLost: TeamMetricPair;
    rucksTotal: TeamMetricPair;
    rucksWon: TeamMetricPair;
    rucksLost: TeamMetricPair;
    maulsTotal: TeamMetricPair;
    maulsWon: TeamMetricPair;
    maulsLost: TeamMetricPair;
    tackles: TeamMetricPair;
    kicks: TeamMetricPair;
    passes: TeamMetricPair;
    recoveries: TeamMetricPair;
    turnoversWon: TeamMetricPair;
    turnoversLost: TeamMetricPair;
    penaltiesWon: TeamMetricPair;
    penaltiesConceded: TeamMetricPair;
    penaltiesCommitted: TeamMetricPair;
    freeKicks: TeamMetricPair;
    knockOns: TeamMetricPair;
    forwardPasses: TeamMetricPair;
    handlingErrors: TeamMetricPair;
    entradas22: TeamMetricPair;
    /** Metros de patadas in-game (evento `kick`) con Dist: / m en detalle */
    kickMeters: TeamMetricPair;
};

export type CompleteStatRow = {
    key: string;
    label: string;
    home: number;
    away: number;
    accent?: boolean;
    /** Porcentaje 0–100; -1 = sin dato / sin intentos */
    valueKind?: 'count' | 'percent';
    /** Tooltip en la etiqueta central (p. ej. aciertos/intentos por equipo) */
    tooltip?: string;
};

export type CompleteStatSection = {
    title: string;
    rows: CompleteStatRow[];
};

export type CompleteStatTab = {
    id: string;
    label: string;
    sections: CompleteStatSection[];
};

export type CompleteStatTabsOptions = {
    includeEmptyRows?: boolean;
    /**
     * Deporte del partido. Sin esto se devuelven las pestanas de rugby, que era
     * lo unico que existia: un partido de futbol mostraba "Formaciones",
     * "Tiros a palos" y "Entradas en 22" vacias.
     */
    sportId?: string | null;
    /**
     * Futbol americano: `flag` cambia las pestanas (flag pulls en vez de
     * patadas y fumbles). Sin esto, tackle.
     */
    discipline?: 'tackle' | 'flag' | null;
};

export function getConfiguredEventPoints(
    event: string | Pick<AggregatableMatchEvent, 'type' | 'detail'>,
    definitionMap: Record<string, MatchEventDefinition>,
): number {
    const eventType = typeof event === 'string' ? event : event.type;
    const definition = definitionMap[eventType];
    if (!definition || definition.category !== 'score') {
        return 0;
    }
    // Solo los tiros a los palos pueden errarse y por lo tanto no sumar. El
    // flag lo trae la definicion del deporte: decidirlo por nombre de tipo
    // anulaba goles de penal de futbol, porque `penalty_goal` es a la vez el
    // penal a palos del rugby y el gol de penal del futbol.
    if (typeof event !== 'string' && definition.kickAtGoal) {
        if (!isGoalKickAttemptEvent(event) || !isGoalKickMade(event.type, event.detail)) {
            return 0;
        }
    }
    // Eventos con desenlace declarado (corner corto, penal stroke): suman solo
    // si el resultado elegido convierte. Sin resultado cargado no suman: un
    // corner del que no se sabe como termino no es un gol.
    if (definition.outcomes?.length) {
        const detail = typeof event === 'string' ? null : event.detail;
        if (!outcomeScores(definition, detail)) {
            return 0;
        }
    }
    return Number(definition.points) || 0;
}

/**
 * A que equipo se le acreditan los PUNTOS de un evento.
 *
 * Casi siempre es el equipo al que se cargo el evento. La excepcion es el gol
 * en contra (`creditsOpponent`): se carga al equipo del jugador que lo hizo
 * —para que la planilla y el jugador queden bien— pero el tanto es del rival.
 *
 * Es la UNICA traduccion entre "de quien es el evento" y "de quien es el
 * punto". Todo lo que sume marcador tiene que pasar por aca.
 */
export function resolveScoringTeam(
    eventType: string,
    eventTeam: 'home' | 'away',
    definitionMap: Record<string, MatchEventDefinition>,
): 'home' | 'away' {
    if (!definitionMap[eventType]?.creditsOpponent) {
        return eventTeam;
    }
    return eventTeam === 'home' ? 'away' : 'home';
}

function createTeamMetricPair(): TeamMetricPair {
    return { home: 0, away: 0 };
}

function createEmptyCompleteMatchStats(): CompleteMatchStats {
    return {
        totalEvents: 0,
        clockEvents: 0,
        assignedEvents: createTeamMetricPair(),
        points: createTeamMetricPair(),
        scoringEvents: createTeamMetricPair(),
        penaltyGoals: createTeamMetricPair(),
        ownGoals: createTeamMetricPair(),
        freeThrows: createTeamMetricPair(),
        twoPointers: createTeamMetricPair(),
        threePointers: createTeamMetricPair(),
        fouls: createTeamMetricPair(),
        timeouts: createTeamMetricPair(),
        greenCards: createTeamMetricPair(),
        penaltyCorners: createTeamMetricPair(),
        penaltyCornerGoals: createTeamMetricPair(),
        penaltyStrokes: createTeamMetricPair(),
        penaltyStrokeGoals: createTeamMetricPair(),
        penaltyStrokesSaved: createTeamMetricPair(),
        freeHits: createTeamMetricPair(),
        assists: createTeamMetricPair(),
        shotsOnGoal: createTeamMetricPair(),
        shotsOffTarget: createTeamMetricPair(),
        circleEntries: createTeamMetricPair(),
        interceptions: createTeamMetricPair(),
        blocks: createTeamMetricPair(),
        saves: createTeamMetricPair(),
        clearances: createTeamMetricPair(),
        shootoutScored: createTeamMetricPair(),
        shootoutMissed: createTeamMetricPair(),
        goalsFastBreak: createTeamMetricPair(),
        goalsWing: createTeamMetricPair(),
        goalsPivot: createTeamMetricPair(),
        goalsBackcourt: createTeamMetricPair(),
        goalsEmptyNet: createTeamMetricPair(),
        sevenMeters: createTeamMetricPair(),
        sevenMeterGoals: createTeamMetricPair(),
        sevenMetersSaved: createTeamMetricPair(),
        shotsSaved: createTeamMetricPair(),
        shotsMissed: createTeamMetricPair(),
        shotsBlocked: createTeamMetricPair(),
        savesSevenMeter: createTeamMetricPair(),
        steals: createTeamMetricPair(),
        turnoversBadPass: createTeamMetricPair(),
        turnoversOffensiveFoul: createTeamMetricPair(),
        turnoversTechnicalFault: createTeamMetricPair(),
        turnoversPassivePlay: createTeamMetricPair(),
        twoMinSuspensions: createTeamMetricPair(),
        blueCards: createTeamMetricPair(),
        touchdowns: createTeamMetricPair(),
        touchdownsRushing: createTeamMetricPair(),
        touchdownsPassing: createTeamMetricPair(),
        touchdownsDefensive: createTeamMetricPair(),
        touchdownsReturn: createTeamMetricPair(),
        fieldGoals: createTeamMetricPair(),
        fieldGoalAttempts: createTeamMetricPair(),
        fieldGoalsBlocked: createTeamMetricPair(),
        extraPoints: createTeamMetricPair(),
        extraPointAttempts: createTeamMetricPair(),
        twoPointConversions: createTeamMetricPair(),
        twoPointAttempts: createTeamMetricPair(),
        safeties: createTeamMetricPair(),
        rushes: createTeamMetricPair(),
        rushYards: createTeamMetricPair(),
        passAttempts: createTeamMetricPair(),
        passCompletions: createTeamMetricPair(),
        passYards: createTeamMetricPair(),
        firstDowns: createTeamMetricPair(),
        sacks: createTeamMetricPair(),
        forcedFumbles: createTeamMetricPair(),
        fumbles: createTeamMetricPair(),
        fumblesLost: createTeamMetricPair(),
        fumbleRecoveries: createTeamMetricPair(),
        turnoversOnDowns: createTeamMetricPair(),
        turnovers: createTeamMetricPair(),
        punts: createTeamMetricPair(),
        kickoffs: createTeamMetricPair(),
        touchbacks: createTeamMetricPair(),
        penaltyYards: createTeamMetricPair(),
        flagPulls: createTeamMetricPair(),
        flagPullsForLoss: createTeamMetricPair(),
        blitzes: createTeamMetricPair(),
        passesDefended: createTeamMetricPair(),
        goalKickAttempts: createTeamMetricPair(),
        goalKicksMade: createTeamMetricPair(),
        goalKicksMissed: createTeamMetricPair(),
        tries: createTeamMetricPair(),
        penaltyTries: createTeamMetricPair(),
        conversionAttempts: createTeamMetricPair(),
        conversionsMade: createTeamMetricPair(),
        conversionsMissed: createTeamMetricPair(),
        penaltyGoalAttempts: createTeamMetricPair(),
        penaltyGoalsMade: createTeamMetricPair(),
        penaltyGoalsMissed: createTeamMetricPair(),
        dropGoalAttempts: createTeamMetricPair(),
        dropGoalsMade: createTeamMetricPair(),
        dropGoalsMissed: createTeamMetricPair(),
        yellowCards: createTeamMetricPair(),
        redCards: createTeamMetricPair(),
        substitutions: createTeamMetricPair(),
        injuries: createTeamMetricPair(),
        scrumsTotal: createTeamMetricPair(),
        scrumsWon: createTeamMetricPair(),
        scrumsLost: createTeamMetricPair(),
        linesTotal: createTeamMetricPair(),
        linesWon: createTeamMetricPair(),
        linesLost: createTeamMetricPair(),
        rucksTotal: createTeamMetricPair(),
        rucksWon: createTeamMetricPair(),
        rucksLost: createTeamMetricPair(),
        maulsTotal: createTeamMetricPair(),
        maulsWon: createTeamMetricPair(),
        maulsLost: createTeamMetricPair(),
        tackles: createTeamMetricPair(),
        kicks: createTeamMetricPair(),
        passes: createTeamMetricPair(),
        recoveries: createTeamMetricPair(),
        turnoversWon: createTeamMetricPair(),
        turnoversLost: createTeamMetricPair(),
        penaltiesWon: createTeamMetricPair(),
        penaltiesConceded: createTeamMetricPair(),
        penaltiesCommitted: createTeamMetricPair(),
        freeKicks: createTeamMetricPair(),
        knockOns: createTeamMetricPair(),
        forwardPasses: createTeamMetricPair(),
        handlingErrors: createTeamMetricPair(),
        entradas22: createTeamMetricPair(),
        kickMeters: createTeamMetricPair(),
    };
}

function bumpTeamMetric(pair: TeamMetricPair, team: 'home' | 'away', amount = 1) {
    pair[team] += amount;
}

function opponentOf(team: 'home' | 'away'): 'home' | 'away' {
    return team === 'home' ? 'away' : 'home';
}

function countContestMetric(
    event: AggregatableMatchEvent,
    team: 'home' | 'away',
    total: TeamMetricPair,
    won: TeamMetricPair,
    lost: TeamMetricPair,
) {
    bumpTeamMetric(total, team);

    if (isContestLostDetail(event.detail)) {
        bumpTeamMetric(lost, team);
        return;
    }

    if (isContestWonDetail(event.detail)) {
        bumpTeamMetric(won, team);
    }
}

export function buildCompleteMatchStats(
    matchEvents: AggregatableMatchEvent[],
    definitionMap: Record<string, MatchEventDefinition>,
): CompleteMatchStats {
    const stats = createEmptyCompleteMatchStats();
    stats.totalEvents = matchEvents.length;

    matchEvents.forEach((event) => {
        const definition = definitionMap[event.type];

        if (definition?.category === 'clock' || event.team === null) {
            stats.clockEvents += 1;
            return;
        }

        if (event.team !== 'home' && event.team !== 'away') return;

        const team = event.team;
        const points = getConfiguredEventPoints(event, definitionMap);
        // Los puntos van al equipo que ANOTA, que no siempre es el equipo al
        // que se cargo el evento (gol en contra). El resto de las metricas
        // —tarjetas, cambios, formaciones— siguen siendo del equipo del evento.
        const scoringTeam = resolveScoringTeam(event.type, team, definitionMap);
        bumpTeamMetric(stats.assignedEvents, team);
        bumpTeamMetric(stats.points, scoringTeam, points);
        if (points > 0) bumpTeamMetric(stats.scoringEvents, scoringTeam);

        // Solo cuenta como tiro a palos si el deporte lo declara asi. Sin esta
        // guarda, un gol de penal de futbol entraba a las metricas de palos
        // del rugby.
        const isGoalAttempt = Boolean(definition?.kickAtGoal) && isGoalKickAttemptEvent(event);
        if (isGoalAttempt) {
            const made = isGoalKickMade(event.type, event.detail);
            bumpTeamMetric(stats.goalKickAttempts, team);
            bumpTeamMetric(made ? stats.goalKicksMade : stats.goalKicksMissed, team);
        }

        switch (event.type) {
            case 'try':
                bumpTeamMetric(stats.tries, team);
                break;
            case 'penalty_try':
                bumpTeamMetric(stats.penaltyTries, team);
                break;
            case 'conversion':
                bumpTeamMetric(stats.conversionAttempts, team);
                bumpTeamMetric(isGoalKickMade(event.type, event.detail) ? stats.conversionsMade : stats.conversionsMissed, team);
                break;
            case 'penalty':
            case 'penalty_goal':
                if (isGoalAttempt) {
                    bumpTeamMetric(stats.penaltyGoalAttempts, team);
                    bumpTeamMetric(isGoalKickMade(event.type, event.detail) ? stats.penaltyGoalsMade : stats.penaltyGoalsMissed, team);
                } else if (points > 0) {
                    // Futbol / hockey: el gol de penal ya ES el gol convertido.
                    bumpTeamMetric(stats.penaltyGoals, scoringTeam);
                } else if (definition?.category === 'discipline') {
                    // Futbol americano: 'penalty' es una penalidad, no un tanto.
                    // Las yardas del castigo van en el detalle.
                    bumpTeamMetric(stats.penaltiesCommitted, team);
                    bumpTeamMetric(stats.penaltyYards, team, Math.abs(parseYardsFromDetail(event.detail)));
                }
                break;
            case 'own_goal':
                // Se cuenta al equipo que lo cometio; el tanto ya se le sumo al rival.
                bumpTeamMetric(stats.ownGoals, team);
                break;
            /* ── Basquet ── */
            case 'free_throw':
                bumpTeamMetric(stats.freeThrows, team);
                break;
            case 'two_pointer':
                bumpTeamMetric(stats.twoPointers, team);
                break;
            case 'three_pointer':
                bumpTeamMetric(stats.threePointers, team);
                break;
            case 'foul':
                bumpTeamMetric(stats.fouls, team);
                break;
            case 'timeout':
                bumpTeamMetric(stats.timeouts, team);
                break;
            /* ── Hockey ── */
            case 'green_card':
                bumpTeamMetric(stats.greenCards, team);
                break;
            // El corner y el stroke se cuentan SIEMPRE como ejecutados, y su
            // desenlace decide si ademas fueron gol. De esa resta sale la
            // efectividad, sin que nadie tenga que cargar un evento "fallado"
            // que pueda quedar desincronizado del otro.
            case 'penalty_corner':
                bumpTeamMetric(stats.penaltyCorners, team);
                if (outcomeScores(definition, event.detail)) {
                    bumpTeamMetric(stats.penaltyCornerGoals, scoringTeam);
                }
                break;
            case 'penalty_stroke':
                bumpTeamMetric(stats.penaltyStrokes, team);
                if (outcomeScores(definition, event.detail)) {
                    bumpTeamMetric(stats.penaltyStrokeGoals, scoringTeam);
                } else if (readOutcomeId(event.detail) === 'saved') {
                    bumpTeamMetric(stats.penaltyStrokesSaved, team);
                }
                break;
            case 'free_hit':
                bumpTeamMetric(stats.freeHits, team);
                break;
            /* ── Definicion por shoot-out: fuera del marcador ── */
            case 'shootout_scored':
                bumpTeamMetric(stats.shootoutScored, team);
                break;
            case 'shootout_missed':
                bumpTeamMetric(stats.shootoutMissed, team);
                break;
            case 'assist':
                bumpTeamMetric(stats.assists, team);
                break;
            case 'shot_on_goal':
                bumpTeamMetric(stats.shotsOnGoal, team);
                break;
            case 'shot_off_target':
                bumpTeamMetric(stats.shotsOffTarget, team);
                break;
            case 'circle_entry':
                bumpTeamMetric(stats.circleEntries, team);
                break;
            case 'interception':
                // Se carga al equipo que la captura. La posesion la perdio el otro.
                bumpTeamMetric(stats.interceptions, team);
                bumpTeamMetric(stats.turnovers, opponentOf(team));
                break;
            case 'block':
                bumpTeamMetric(stats.blocks, team);
                break;
            case 'save':
                bumpTeamMetric(stats.saves, team);
                // Handball: el desenlace es el origen del lanzamiento atajado.
                if (readOutcomeId(event.detail) === 'seven_meter') bumpTeamMetric(stats.savesSevenMeter, team);
                break;
            case 'clearance':
                bumpTeamMetric(stats.clearances, team);
                break;
            /* ── Handball ──
             * El gol ya sumo arriba; aca solo se reparte por origen. Los 7 metros
             * se cuentan SIEMPRE como ejecutados y el desenlace dice si ademas
             * convirtieron, igual que el corner corto. Los dos tipos viejos
             * (`seven_meter_goal`, `seven_meter_miss`) entran en la misma cuenta
             * para que un partido cargado antes no pierda sus 7 metros. */
            case 'goal': {
                const origin = resolveOutcomeId(definition, event.detail);
                if (origin === 'fast_break') bumpTeamMetric(stats.goalsFastBreak, scoringTeam);
                else if (origin === 'wing') bumpTeamMetric(stats.goalsWing, scoringTeam);
                else if (origin === 'pivot') bumpTeamMetric(stats.goalsPivot, scoringTeam);
                else if (origin === 'backcourt') bumpTeamMetric(stats.goalsBackcourt, scoringTeam);
                else if (origin === 'empty_net') bumpTeamMetric(stats.goalsEmptyNet, scoringTeam);
                break;
            }
            case 'seven_meter':
                bumpTeamMetric(stats.sevenMeters, team);
                if (outcomeScores(definition, event.detail)) {
                    bumpTeamMetric(stats.sevenMeterGoals, scoringTeam);
                } else if (readOutcomeId(event.detail) === 'saved') {
                    bumpTeamMetric(stats.sevenMetersSaved, team);
                }
                break;
            case 'seven_meter_goal':
                bumpTeamMetric(stats.sevenMeters, team);
                bumpTeamMetric(stats.sevenMeterGoals, scoringTeam);
                break;
            case 'seven_meter_miss':
                bumpTeamMetric(stats.sevenMeters, team);
                break;
            case 'shot': {
                const result = readOutcomeId(event.detail);
                if (result === 'saved') bumpTeamMetric(stats.shotsSaved, team);
                else if (result === 'blocked') bumpTeamMetric(stats.shotsBlocked, team);
                else bumpTeamMetric(stats.shotsMissed, team);
                break;
            }
            case 'steal':
                // Se carga al que la recupera; la perdida ya la carga el rival
                // por su lado, asi que aca NO se suma un turnover.
                bumpTeamMetric(stats.steals, team);
                break;
            case 'two_min_suspension':
                bumpTeamMetric(stats.twoMinSuspensions, team);
                break;
            case 'blue_card':
                bumpTeamMetric(stats.blueCards, team);
                break;
            /* ── Futbol americano ──
             * Lo pateado se cuenta SIEMPRE como intento y el desenlace dice si
             * ademas convirtio: de la resta sale la efectividad. El touchdown
             * siempre suma; su desenlace es el tipo. */
            case 'touchdown': {
                bumpTeamMetric(stats.touchdowns, scoringTeam);
                const kind = resolveOutcomeId(definition, event.detail);
                if (kind === 'rushing') bumpTeamMetric(stats.touchdownsRushing, scoringTeam);
                else if (kind === 'passing') bumpTeamMetric(stats.touchdownsPassing, scoringTeam);
                else if (kind === 'interception_return' || kind === 'fumble_return') bumpTeamMetric(stats.touchdownsDefensive, scoringTeam);
                else if (kind === 'kickoff_return' || kind === 'punt_return') bumpTeamMetric(stats.touchdownsReturn, scoringTeam);
                break;
            }
            case 'field_goal':
                bumpTeamMetric(stats.fieldGoalAttempts, team);
                if (outcomeScores(definition, event.detail)) {
                    bumpTeamMetric(stats.fieldGoals, scoringTeam);
                } else if (readOutcomeId(event.detail) === 'blocked') {
                    bumpTeamMetric(stats.fieldGoalsBlocked, team);
                }
                break;
            case 'extra_point':
                bumpTeamMetric(stats.extraPointAttempts, team);
                if (outcomeScores(definition, event.detail)) bumpTeamMetric(stats.extraPoints, scoringTeam);
                break;
            case 'two_point_conversion':
                bumpTeamMetric(stats.twoPointAttempts, team);
                if (outcomeScores(definition, event.detail)) bumpTeamMetric(stats.twoPointConversions, scoringTeam);
                break;
            case 'safety':
                bumpTeamMetric(stats.safeties, team);
                break;
            case 'rush':
                bumpTeamMetric(stats.rushes, team);
                bumpTeamMetric(stats.rushYards, team, parseYardsFromDetail(event.detail));
                break;
            case 'pass_complete':
                bumpTeamMetric(stats.passAttempts, team);
                bumpTeamMetric(stats.passCompletions, team);
                bumpTeamMetric(stats.passYards, team, parseYardsFromDetail(event.detail));
                break;
            case 'pass_incomplete':
                bumpTeamMetric(stats.passAttempts, team);
                break;
            case 'first_down':
                bumpTeamMetric(stats.firstDowns, team);
                break;
            case 'sack':
                bumpTeamMetric(stats.sacks, team);
                break;
            case 'forced_fumble':
                bumpTeamMetric(stats.forcedFumbles, team);
                break;
            // Se carga al equipo que lo suelta. Solo es turnover si lo recupera el
            // rival; un fumble sin desenlace es un fumble, no una perdida.
            case 'fumble':
                bumpTeamMetric(stats.fumbles, team);
                if (readOutcomeId(event.detail) === 'lost') {
                    bumpTeamMetric(stats.fumblesLost, team);
                    bumpTeamMetric(stats.turnovers, team);
                    bumpTeamMetric(stats.fumbleRecoveries, opponentOf(team));
                }
                break;
            case 'turnover_on_downs':
                bumpTeamMetric(stats.turnoversOnDowns, team);
                bumpTeamMetric(stats.turnovers, team);
                break;
            case 'punt':
                bumpTeamMetric(stats.punts, team);
                break;
            case 'kickoff':
                bumpTeamMetric(stats.kickoffs, team);
                // Un kickoff que termina en touchback ES el touchback: no hace
                // falta cargarlo dos veces.
                if (readOutcomeId(event.detail) === 'touchback') bumpTeamMetric(stats.touchbacks, team);
                break;
            case 'touchback':
                bumpTeamMetric(stats.touchbacks, team);
                break;
            /* ── Flag ── */
            case 'flag_pull':
                bumpTeamMetric(stats.flagPulls, team);
                break;
            case 'flag_pull_for_loss':
                bumpTeamMetric(stats.flagPulls, team);
                bumpTeamMetric(stats.flagPullsForLoss, team);
                break;
            case 'blitz':
                bumpTeamMetric(stats.blitzes, team);
                break;
            case 'pass_defended':
                bumpTeamMetric(stats.passesDefended, team);
                break;
            case 'drop_goal':
                bumpTeamMetric(stats.dropGoalAttempts, team);
                bumpTeamMetric(isGoalKickMade(event.type, event.detail) ? stats.dropGoalsMade : stats.dropGoalsMissed, team);
                break;
            case 'yellow_card':
            case 'card_yellow':
                bumpTeamMetric(stats.yellowCards, team);
                break;
            case 'red_card':
            case 'card_red':
                bumpTeamMetric(stats.redCards, team);
                break;
            case 'substitution':
                bumpTeamMetric(stats.substitutions, team);
                break;
            case 'injury':
                bumpTeamMetric(stats.injuries, team);
                break;
            case 'scrum':
                countContestMetric(event, team, stats.scrumsTotal, stats.scrumsWon, stats.scrumsLost);
                break;
            case 'line':
                countContestMetric(event, team, stats.linesTotal, stats.linesWon, stats.linesLost);
                break;
            case 'ruck':
                countContestMetric(event, team, stats.rucksTotal, stats.rucksWon, stats.rucksLost);
                break;
            case 'maul':
                countContestMetric(event, team, stats.maulsTotal, stats.maulsWon, stats.maulsLost);
                break;
            case 'tackle':
                bumpTeamMetric(stats.tackles, team);
                break;
            case 'kick': {
                bumpTeamMetric(stats.kicks, team);
                const m = parseKickMetersFromDetail(event.detail);
                if (m > 0) bumpTeamMetric(stats.kickMeters, team, m);
                break;
            }
            case 'pass':
                bumpTeamMetric(stats.passes, team);
                break;
            case 'recovery':
                bumpTeamMetric(stats.recoveries, team);
                break;
            case 'turnover_won':
                bumpTeamMetric(stats.turnoversWon, team);
                bumpTeamMetric(stats.recoveries, team);
                break;
            case 'turnover_lost': {
                bumpTeamMetric(stats.turnoversLost, team);
                // Handball: la perdida lleva el motivo como desenlace. En rugby
                // y hockey no hay marca y el reparto queda en cero.
                const reason = readOutcomeId(event.detail);
                if (reason === 'bad_pass') bumpTeamMetric(stats.turnoversBadPass, team);
                else if (reason === 'offensive_foul') bumpTeamMetric(stats.turnoversOffensiveFoul, team);
                else if (reason === 'technical_fault') bumpTeamMetric(stats.turnoversTechnicalFault, team);
                else if (reason === 'passive_play') bumpTeamMetric(stats.turnoversPassivePlay, team);
                break;
            }
            case 'penalty_won':
                bumpTeamMetric(stats.penaltiesWon, team);
                break;
            case 'penalty_conceded':
                bumpTeamMetric(stats.penaltiesConceded, team);
                bumpTeamMetric(stats.penaltiesCommitted, team);
                break;
            case 'penalty_committed':
                bumpTeamMetric(stats.penaltiesCommitted, team);
                bumpTeamMetric(stats.penaltiesConceded, team);
                break;
            case 'free_kick':
                bumpTeamMetric(stats.freeKicks, team);
                break;
            case 'knock_on':
                bumpTeamMetric(stats.knockOns, team);
                break;
            case 'forward_pass':
                bumpTeamMetric(stats.forwardPasses, team);
                break;
            case 'handling_error':
                bumpTeamMetric(stats.handlingErrors, team);
                break;
            case 'entradas_22':
                bumpTeamMetric(stats.entradas22, team);
                break;
            default:
                break;
        }
    });

    return stats;
}

function redZone22ConversionPercent(stats: CompleteMatchStats, team: 'home' | 'away'): number {
    const entries = team === 'home' ? stats.entradas22.home : stats.entradas22.away;
    if (entries === 0) return -1;
    const scored =
        (team === 'home' ? stats.tries.home : stats.tries.away)
        + (team === 'home' ? stats.penaltyTries.home : stats.penaltyTries.away)
        + (team === 'home' ? stats.penaltyGoalsMade.home : stats.penaltyGoalsMade.away)
        + (team === 'home' ? stats.dropGoalsMade.home : stats.dropGoalsMade.away);
    return (scored / entries) * 100;
}

function redZone22Scored(stats: CompleteMatchStats, team: 'home' | 'away'): number {
    return (team === 'home' ? stats.tries.home : stats.tries.away)
        + (team === 'home' ? stats.penaltyTries.home : stats.penaltyTries.away)
        + (team === 'home' ? stats.penaltyGoalsMade.home : stats.penaltyGoalsMade.away)
        + (team === 'home' ? stats.dropGoalsMade.home : stats.dropGoalsMade.away);
}

/** % ganados sobre (ganados + perdidos); -1 si no hubo disputas declaradas */
function contestWinPercent(won: number, lost: number): number {
    const n = won + lost;
    if (n <= 0) return -1;
    return (won / n) * 100;
}

function filterStatSectionRows(rows: CompleteStatRow[], options: CompleteStatTabsOptions = {}): CompleteStatRow[] {
    if (options.includeEmptyRows) return rows;

    return rows.filter((row) => {
        if (row.valueKind === 'percent') return true;
        return row.home > 0 || row.away > 0 || row.accent;
    });
}

function filterStatSections(sections: CompleteStatSection[], options: CompleteStatTabsOptions = {}): CompleteStatSection[] {
    return sections
        .map((section) => ({ ...section, rows: filterStatSectionRows(section.rows, options) }))
        .filter((section) => section.rows.length > 0);
}

/**
 * Pestanas de futbol. Salen SOLO de los eventos del catalogo: goles, tarjetas
 * y cambios. No hay posesion, remates, corners, offsides ni asistencias porque
 * no son eventos cargables — y una estadistica que nadie carga es una fila en
 * cero, no un dato.
 */
function buildFootballStatTabs(
    stats: CompleteMatchStats,
    homeName: string,
    awayName: string,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador',
            sections: filterStatSections([
                {
                    title: 'Goles',
                    rows: [
                        { key: 'points', label: 'Goles', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'penaltyGoals', label: 'De penal', home: stats.penaltyGoals.home, away: stats.penaltyGoals.away },
                        {
                            key: 'ownGoals',
                            label: 'En contra (propia valla)',
                            home: stats.ownGoals.home,
                            away: stats.ownGoals.away,
                            tooltip: `Goles en contra cometidos por cada equipo. El tanto ya esta sumado al rival: ${homeName} / ${awayName}.`,
                        },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Tarjetas',
                    rows: [
                        { key: 'yellowCards', label: 'Amarillas', home: stats.yellowCards.home, away: stats.yellowCards.away },
                        { key: 'redCards', label: 'Rojas', home: stats.redCards.home, away: stats.redCards.away },
                    ],
                },
            ], options),
        },
        {
            id: 'plantel',
            label: 'Plantel',
            sections: filterStatSections([
                {
                    title: 'Plantel',
                    rows: [
                        { key: 'substitutions', label: 'Cambios', home: stats.substitutions.home, away: stats.substitutions.away },
                    ],
                },
            ], options),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}

/**
 * Basquet. El puntaje NO es el conteo de eventos (un triple vale 3), asi que
 * el marcador y el desglose de tiros son filas distintas.
 */
function buildBasketballStatTabs(
    stats: CompleteMatchStats,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador',
            sections: filterStatSections([
                {
                    title: 'Anotacion',
                    rows: [
                        { key: 'points', label: 'Puntos', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'threePointers', label: 'Triples', home: stats.threePointers.home, away: stats.threePointers.away },
                        { key: 'twoPointers', label: 'Dobles', home: stats.twoPointers.home, away: stats.twoPointers.away },
                        { key: 'freeThrows', label: 'Tiros libres', home: stats.freeThrows.home, away: stats.freeThrows.away },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Faltas',
                    rows: [
                        { key: 'fouls', label: 'Faltas', home: stats.fouls.home, away: stats.fouls.away },
                    ],
                },
            ], options),
        },
        {
            id: 'plantel',
            label: 'Banco',
            sections: filterStatSections([
                {
                    title: 'Banco',
                    rows: [
                        { key: 'timeouts', label: 'Tiempos muertos', home: stats.timeouts.home, away: stats.timeouts.away },
                        { key: 'substitutions', label: 'Cambios', home: stats.substitutions.home, away: stats.substitutions.away },
                    ],
                },
            ], options),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}

/**
 * Hockey sobre cesped. Unico deporte con tarjeta verde y con corner corto.
 *
 * Las efectividades son DERIVADAS, no cargadas: el corner corto se carga
 * cuando se otorga y el gol cuando entra, asi que "fallados" es la resta y el
 * porcentaje sale solo. Por eso no hay —ni tiene que haber— un evento
 * "corner fallado" que se pueda desincronizar del otro.
 */
function buildHockeyStatTabs(
    stats: CompleteMatchStats,
    homeName: string,
    awayName: string,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    const tipRatio = (hMade: number, hTotal: number, aMade: number, aTotal: number, note: string) => (
        `${homeName}: ${hMade}/${hTotal} · ${awayName}: ${aMade}/${aTotal} — ${note}`
    );

    const shotsHome = stats.shotsOnGoal.home + stats.shotsOffTarget.home;
    const shotsAway = stats.shotsOnGoal.away + stats.shotsOffTarget.away;
    const openPlayGoals = (side: 'home' | 'away') => Math.max(
        0,
        stats.points[side] - stats.penaltyCornerGoals[side] - stats.penaltyStrokeGoals[side],
    );

    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador',
            sections: filterStatSections([
                {
                    // Un gol es un gol: el desglose por origen es estadistica,
                    // no marcador. Los tres de abajo suman el total de arriba.
                    title: 'Goles',
                    rows: [
                        { key: 'points', label: 'Goles', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'openPlayGoals', label: 'De jugada', home: openPlayGoals('home'), away: openPlayGoals('away') },
                        { key: 'penaltyCornerGoals', label: 'De corner corto', home: stats.penaltyCornerGoals.home, away: stats.penaltyCornerGoals.away },
                        { key: 'penaltyStrokeGoalsScore', label: 'De penal', home: stats.penaltyStrokeGoals.home, away: stats.penaltyStrokeGoals.away },
                        { key: 'assists', label: 'Asistencias', home: stats.assists.home, away: stats.assists.away },
                    ],
                },
            ], options),
        },
        {
            id: 'jugadas-fijas',
            label: 'Jugadas fijas',
            sections: filterStatSections([
                {
                    title: 'Corner corto',
                    rows: [
                        { key: 'penaltyCorners', label: 'Ejecutados', home: stats.penaltyCorners.home, away: stats.penaltyCorners.away },
                        { key: 'penaltyCornerGoalsFixed', label: 'Convertidos', home: stats.penaltyCornerGoals.home, away: stats.penaltyCornerGoals.away },
                        {
                            key: 'penaltyCornerEffectiveness',
                            label: 'Efectividad (%)',
                            home: goalKickEffectivenessPercent(stats.penaltyCornerGoals.home, stats.penaltyCorners.home),
                            away: goalKickEffectivenessPercent(stats.penaltyCornerGoals.away, stats.penaltyCorners.away),
                            valueKind: 'percent',
                            tooltip: tipRatio(
                                stats.penaltyCornerGoals.home,
                                stats.penaltyCorners.home,
                                stats.penaltyCornerGoals.away,
                                stats.penaltyCorners.away,
                                'convertidos / ejecutados',
                            ),
                        },
                    ],
                },
                {
                    title: 'Penal',
                    rows: [
                        { key: 'penaltyStrokes', label: 'Ejecutados', home: stats.penaltyStrokes.home, away: stats.penaltyStrokes.away },
                        { key: 'penaltyStrokeGoals', label: 'Convertidos', home: stats.penaltyStrokeGoals.home, away: stats.penaltyStrokeGoals.away },
                        { key: 'penaltyStrokesSaved', label: 'Atajados', home: stats.penaltyStrokesSaved.home, away: stats.penaltyStrokesSaved.away },
                        {
                            key: 'penaltyStrokeEffectiveness',
                            label: 'Efectividad (%)',
                            home: goalKickEffectivenessPercent(stats.penaltyStrokeGoals.home, stats.penaltyStrokes.home),
                            away: goalKickEffectivenessPercent(stats.penaltyStrokeGoals.away, stats.penaltyStrokes.away),
                            valueKind: 'percent',
                            tooltip: tipRatio(
                                stats.penaltyStrokeGoals.home,
                                stats.penaltyStrokes.home,
                                stats.penaltyStrokeGoals.away,
                                stats.penaltyStrokes.away,
                                'convertidos / ejecutados',
                            ),
                        },
                    ],
                },
                {
                    title: 'Infracciones',
                    rows: [
                        { key: 'fouls', label: 'Faltas', home: stats.fouls.home, away: stats.fouls.away },
                        { key: 'freeHits', label: 'Free hits', home: stats.freeHits.home, away: stats.freeHits.away },
                    ],
                },
            ], options),
        },
        {
            id: 'ataque',
            label: 'Ataque',
            sections: filterStatSections([
                {
                    title: 'Tiros',
                    rows: [
                        { key: 'shotsTotal', label: 'Tiros', home: shotsHome, away: shotsAway },
                        { key: 'shotsOnGoal', label: 'Al arco', home: stats.shotsOnGoal.home, away: stats.shotsOnGoal.away },
                        { key: 'shotsOffTarget', label: 'Desviados', home: stats.shotsOffTarget.home, away: stats.shotsOffTarget.away },
                        {
                            key: 'shotAccuracy',
                            label: 'Puntería (%)',
                            home: goalKickEffectivenessPercent(stats.shotsOnGoal.home, shotsHome),
                            away: goalKickEffectivenessPercent(stats.shotsOnGoal.away, shotsAway),
                            valueKind: 'percent',
                            tooltip: tipRatio(stats.shotsOnGoal.home, shotsHome, stats.shotsOnGoal.away, shotsAway, 'al arco / totales'),
                        },
                    ],
                },
                {
                    title: 'Aproximación',
                    rows: [
                        { key: 'circleEntries', label: 'Ingresos al círculo', home: stats.circleEntries.home, away: stats.circleEntries.away },
                    ],
                },
            ], options),
        },
        {
            id: 'defensa',
            label: 'Defensa',
            sections: filterStatSections([
                {
                    title: 'Recuperación',
                    rows: [
                        { key: 'interceptions', label: 'Intercepciones', home: stats.interceptions.home, away: stats.interceptions.away },
                        { key: 'tackles', label: 'Quites', home: stats.tackles.home, away: stats.tackles.away },
                        { key: 'recoveries', label: 'Recuperaciones', home: stats.recoveries.home, away: stats.recoveries.away },
                    ],
                },
                {
                    title: 'Contención',
                    rows: [
                        { key: 'blocks', label: 'Bloqueos', home: stats.blocks.home, away: stats.blocks.away },
                        { key: 'saves', label: 'Atajadas', home: stats.saves.home, away: stats.saves.away },
                        { key: 'clearances', label: 'Despejes', home: stats.clearances.home, away: stats.clearances.away },
                    ],
                },
            ], options),
        },
        {
            // Fuera del partido: el marcador reglamentario queda como quedó y
            // el shoot-out solo decide quién avanza. Por eso va en su propia
            // pestaña y no dentro de "Marcador".
            id: 'definicion',
            label: 'Definición',
            sections: filterStatSections([
                {
                    title: 'Shoot-outs',
                    rows: [
                        { key: 'shootoutScored', label: 'Convertidos', home: stats.shootoutScored.home, away: stats.shootoutScored.away, accent: true },
                        { key: 'shootoutMissed', label: 'Fallados', home: stats.shootoutMissed.home, away: stats.shootoutMissed.away },
                        {
                            key: 'shootoutEffectiveness',
                            label: 'Efectividad (%)',
                            home: goalKickEffectivenessPercent(
                                stats.shootoutScored.home,
                                stats.shootoutScored.home + stats.shootoutMissed.home,
                            ),
                            away: goalKickEffectivenessPercent(
                                stats.shootoutScored.away,
                                stats.shootoutScored.away + stats.shootoutMissed.away,
                            ),
                            valueKind: 'percent',
                            tooltip: tipRatio(
                                stats.shootoutScored.home,
                                stats.shootoutScored.home + stats.shootoutMissed.home,
                                stats.shootoutScored.away,
                                stats.shootoutScored.away + stats.shootoutMissed.away,
                                'convertidos / ejecutados',
                            ),
                        },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Tarjetas',
                    rows: [
                        { key: 'greenCards', label: 'Verdes', home: stats.greenCards.home, away: stats.greenCards.away },
                        { key: 'yellowCards', label: 'Amarillas', home: stats.yellowCards.home, away: stats.yellowCards.away },
                        { key: 'redCards', label: 'Rojas', home: stats.redCards.home, away: stats.redCards.away },
                    ],
                },
            ], options),
        },
        {
            id: 'plantel',
            label: 'Plantel',
            sections: filterStatSections([
                {
                    title: 'Plantel',
                    rows: [
                        { key: 'substitutions', label: 'Cambios', home: stats.substitutions.home, away: stats.substitutions.away },
                    ],
                },
            ], options),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}

/** Futbol americano. Cinco formas de anotar, cada una con su valor. */
/**
 * Futbol americano: marcador, ofensiva, turnovers y disciplina. Lo que se
 * patea muestra convertidos sobre intentos; las yardas salen del detalle de
 * cada jugada. "Sacks recibidos" son los sacks que hizo el rival: la fila se
 * lee desde la ofensiva porque es ahi donde duelen.
 */
function buildAmericanFootballStatTabs(
    stats: CompleteMatchStats,
    homeName: string,
    awayName: string,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    const ratio = (hMade: number, hAtt: number, aMade: number, aAtt: number) => (
        `${homeName}: ${hMade}/${hAtt} · ${awayName}: ${aMade}/${aAtt}`
    );
    const percent = (made: number, attempts: number) => goalKickEffectivenessPercent(made, attempts);

    // Flag: no se patea, el try se juega desde la 5 o la 10, y la defensa se
    // mide en flag pulls. El resto de las filas es el mismo deporte.
    if (options.discipline === 'flag') {
        return buildFlagFootballStatTabs(stats, homeName, awayName, options);
    }

    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador',
            sections: filterStatSections([
                {
                    title: 'Anotacion',
                    rows: [
                        { key: 'points', label: 'Puntos', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'touchdowns', label: 'Touchdowns', home: stats.touchdowns.home, away: stats.touchdowns.away },
                        { key: 'touchdownsRushing', label: 'TD de carrera', home: stats.touchdownsRushing.home, away: stats.touchdownsRushing.away },
                        { key: 'touchdownsPassing', label: 'TD de pase', home: stats.touchdownsPassing.home, away: stats.touchdownsPassing.away },
                        { key: 'touchdownsDefensive', label: 'TD defensivos', home: stats.touchdownsDefensive.home, away: stats.touchdownsDefensive.away },
                        { key: 'touchdownsReturn', label: 'TD de devolucion', home: stats.touchdownsReturn.home, away: stats.touchdownsReturn.away },
                        { key: 'safeties', label: 'Safeties', home: stats.safeties.home, away: stats.safeties.away },
                    ],
                },
                {
                    title: 'Patadas',
                    rows: [
                        {
                            key: 'fieldGoalsPct',
                            label: 'Field goals (%)',
                            home: percent(stats.fieldGoals.home, stats.fieldGoalAttempts.home),
                            away: percent(stats.fieldGoals.away, stats.fieldGoalAttempts.away),
                            valueKind: 'percent',
                            tooltip: ratio(stats.fieldGoals.home, stats.fieldGoalAttempts.home, stats.fieldGoals.away, stats.fieldGoalAttempts.away),
                        },
                        { key: 'fieldGoals', label: 'Field goals convertidos', home: stats.fieldGoals.home, away: stats.fieldGoals.away },
                        { key: 'fieldGoalsBlocked', label: 'Field goals bloqueados', home: stats.fieldGoalsBlocked.home, away: stats.fieldGoalsBlocked.away },
                        {
                            key: 'extraPointsPct',
                            label: 'Puntos extra (%)',
                            home: percent(stats.extraPoints.home, stats.extraPointAttempts.home),
                            away: percent(stats.extraPoints.away, stats.extraPointAttempts.away),
                            valueKind: 'percent',
                            tooltip: ratio(stats.extraPoints.home, stats.extraPointAttempts.home, stats.extraPoints.away, stats.extraPointAttempts.away),
                        },
                        { key: 'extraPoints', label: 'Puntos extra convertidos', home: stats.extraPoints.home, away: stats.extraPoints.away },
                        { key: 'twoPointConversions', label: 'Conversiones de 2', home: stats.twoPointConversions.home, away: stats.twoPointConversions.away },
                        { key: 'twoPointAttempts', label: 'Intentos de 2', home: stats.twoPointAttempts.home, away: stats.twoPointAttempts.away },
                    ],
                },
            ], options),
        },
        {
            id: 'ofensiva',
            label: 'Ofensiva',
            sections: filterStatSections([
                {
                    title: 'Avance',
                    rows: [
                        { key: 'firstDowns', label: 'Primeros downs', home: stats.firstDowns.home, away: stats.firstDowns.away, accent: true },
                        { key: 'totalYards', label: 'Yardas totales', home: stats.rushYards.home + stats.passYards.home, away: stats.rushYards.away + stats.passYards.away },
                        { key: 'passYards', label: 'Yardas de pase', home: stats.passYards.home, away: stats.passYards.away },
                        { key: 'rushYards', label: 'Yardas de carrera', home: stats.rushYards.home, away: stats.rushYards.away },
                    ],
                },
                {
                    title: 'Jugadas',
                    rows: [
                        {
                            key: 'passPct',
                            label: 'Pases completos (%)',
                            home: percent(stats.passCompletions.home, stats.passAttempts.home),
                            away: percent(stats.passCompletions.away, stats.passAttempts.away),
                            valueKind: 'percent',
                            tooltip: ratio(stats.passCompletions.home, stats.passAttempts.home, stats.passCompletions.away, stats.passAttempts.away),
                        },
                        { key: 'passCompletions', label: 'Pases completos', home: stats.passCompletions.home, away: stats.passCompletions.away },
                        { key: 'passAttempts', label: 'Pases intentados', home: stats.passAttempts.home, away: stats.passAttempts.away },
                        { key: 'rushes', label: 'Carreras', home: stats.rushes.home, away: stats.rushes.away },
                        { key: 'sacksTaken', label: 'Sacks recibidos', home: stats.sacks.away, away: stats.sacks.home },
                        { key: 'punts', label: 'Punts', home: stats.punts.home, away: stats.punts.away },
                    ],
                },
            ], options),
        },
        {
            id: 'turnovers',
            label: 'Turnovers',
            sections: filterStatSections([
                {
                    title: 'Posesiones perdidas',
                    rows: [
                        { key: 'turnovers', label: 'Turnovers', home: stats.turnovers.home, away: stats.turnovers.away, accent: true },
                        { key: 'interceptionsThrown', label: 'Intercepciones sufridas', home: stats.interceptions.away, away: stats.interceptions.home },
                        { key: 'fumbles', label: 'Fumbles', home: stats.fumbles.home, away: stats.fumbles.away },
                        { key: 'fumblesLost', label: 'Fumbles perdidos', home: stats.fumblesLost.home, away: stats.fumblesLost.away },
                        { key: 'turnoversOnDowns', label: 'Perdidas en downs', home: stats.turnoversOnDowns.home, away: stats.turnoversOnDowns.away },
                    ],
                },
                {
                    title: 'Defensa',
                    rows: [
                        { key: 'sacks', label: 'Sacks', home: stats.sacks.home, away: stats.sacks.away },
                        { key: 'interceptions', label: 'Intercepciones', home: stats.interceptions.home, away: stats.interceptions.away },
                        { key: 'forcedFumbles', label: 'Fumbles forzados', home: stats.forcedFumbles.home, away: stats.forcedFumbles.away },
                        { key: 'fumbleRecoveries', label: 'Fumbles recuperados', home: stats.fumbleRecoveries.home, away: stats.fumbleRecoveries.away },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Penalidades',
                    rows: [
                        { key: 'penaltiesCommitted', label: 'Penalidades', home: stats.penaltiesCommitted.home, away: stats.penaltiesCommitted.away },
                        { key: 'penaltyYards', label: 'Yardas penalizadas', home: stats.penaltyYards.home, away: stats.penaltyYards.away },
                    ],
                },
                {
                    title: 'Partido',
                    rows: [
                        { key: 'timeouts', label: 'Tiempos muertos', home: stats.timeouts.home, away: stats.timeouts.away },
                        { key: 'kickoffs', label: 'Kickoffs', home: stats.kickoffs.home, away: stats.kickoffs.away },
                        { key: 'touchbacks', label: 'Touchbacks', home: stats.touchbacks.home, away: stats.touchbacks.away },
                    ],
                },
            ], options),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}

function buildFlagFootballStatTabs(
    stats: CompleteMatchStats,
    homeName: string,
    awayName: string,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    const ratio = (hMade: number, hAtt: number, aMade: number, aAtt: number) => (
        `${homeName}: ${hMade}/${hAtt} · ${awayName}: ${aMade}/${aAtt}`
    );
    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador',
            sections: filterStatSections([
                {
                    title: 'Anotacion',
                    rows: [
                        { key: 'points', label: 'Puntos', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'touchdowns', label: 'Touchdowns', home: stats.touchdowns.home, away: stats.touchdowns.away },
                        { key: 'touchdownsRushing', label: 'TD de carrera', home: stats.touchdownsRushing.home, away: stats.touchdownsRushing.away },
                        { key: 'touchdownsPassing', label: 'TD de pase', home: stats.touchdownsPassing.home, away: stats.touchdownsPassing.away },
                        { key: 'touchdownsDefensive', label: 'TD defensivos', home: stats.touchdownsDefensive.home, away: stats.touchdownsDefensive.away },
                        { key: 'safeties', label: 'Safeties', home: stats.safeties.home, away: stats.safeties.away },
                    ],
                },
                {
                    title: 'Tries',
                    rows: [
                        { key: 'extraPoints', label: 'Tries de 1 convertidos', home: stats.extraPoints.home, away: stats.extraPoints.away },
                        { key: 'extraPointAttempts', label: 'Tries de 1 intentados', home: stats.extraPointAttempts.home, away: stats.extraPointAttempts.away },
                        { key: 'twoPointConversions', label: 'Tries de 2 convertidos', home: stats.twoPointConversions.home, away: stats.twoPointConversions.away },
                        { key: 'twoPointAttempts', label: 'Tries de 2 intentados', home: stats.twoPointAttempts.home, away: stats.twoPointAttempts.away },
                    ],
                },
            ], options),
        },
        {
            id: 'ofensiva',
            label: 'Ofensiva',
            sections: filterStatSections([
                {
                    title: 'Avance',
                    rows: [
                        { key: 'firstDowns', label: 'Primeros downs', home: stats.firstDowns.home, away: stats.firstDowns.away, accent: true },
                        { key: 'totalYards', label: 'Yardas totales', home: stats.rushYards.home + stats.passYards.home, away: stats.rushYards.away + stats.passYards.away },
                        { key: 'passYards', label: 'Yardas de pase', home: stats.passYards.home, away: stats.passYards.away },
                        { key: 'rushYards', label: 'Yardas de carrera', home: stats.rushYards.home, away: stats.rushYards.away },
                    ],
                },
                {
                    title: 'Jugadas',
                    rows: [
                        {
                            key: 'passPct',
                            label: 'Pases completos (%)',
                            home: goalKickEffectivenessPercent(stats.passCompletions.home, stats.passAttempts.home),
                            away: goalKickEffectivenessPercent(stats.passCompletions.away, stats.passAttempts.away),
                            valueKind: 'percent',
                            tooltip: ratio(stats.passCompletions.home, stats.passAttempts.home, stats.passCompletions.away, stats.passAttempts.away),
                        },
                        { key: 'passCompletions', label: 'Pases completos', home: stats.passCompletions.home, away: stats.passCompletions.away },
                        { key: 'passAttempts', label: 'Pases intentados', home: stats.passAttempts.home, away: stats.passAttempts.away },
                        { key: 'rushes', label: 'Carreras', home: stats.rushes.home, away: stats.rushes.away },
                        { key: 'sacksTaken', label: 'Sacks recibidos', home: stats.sacks.away, away: stats.sacks.home },
                    ],
                },
            ], options),
        },
        {
            id: 'turnovers',
            label: 'Defensa',
            sections: filterStatSections([
                {
                    title: 'Defensa',
                    rows: [
                        { key: 'flagPulls', label: 'Flag pulls', home: stats.flagPulls.home, away: stats.flagPulls.away, accent: true },
                        { key: 'flagPullsForLoss', label: 'Flag pulls con pérdida', home: stats.flagPullsForLoss.home, away: stats.flagPullsForLoss.away },
                        { key: 'sacks', label: 'Sacks', home: stats.sacks.home, away: stats.sacks.away },
                        { key: 'interceptions', label: 'Intercepciones', home: stats.interceptions.home, away: stats.interceptions.away },
                        { key: 'passesDefended', label: 'Pases defendidos', home: stats.passesDefended.home, away: stats.passesDefended.away },
                        { key: 'blitzes', label: 'Blitzes', home: stats.blitzes.home, away: stats.blitzes.away },
                    ],
                },
                {
                    title: 'Posesiones perdidas',
                    rows: [
                        { key: 'turnovers', label: 'Turnovers', home: stats.turnovers.home, away: stats.turnovers.away },
                        { key: 'interceptionsThrown', label: 'Intercepciones sufridas', home: stats.interceptions.away, away: stats.interceptions.home },
                        { key: 'turnoversOnDowns', label: 'Perdidas en downs', home: stats.turnoversOnDowns.home, away: stats.turnoversOnDowns.away },
                        { key: 'fumblesLost', label: 'Fumbles perdidos', home: stats.fumblesLost.home, away: stats.fumblesLost.away },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Penalidades',
                    rows: [
                        { key: 'penaltiesCommitted', label: 'Penalidades', home: stats.penaltiesCommitted.home, away: stats.penaltiesCommitted.away },
                        { key: 'penaltyYards', label: 'Yardas penalizadas', home: stats.penaltyYards.home, away: stats.penaltyYards.away },
                        { key: 'timeouts', label: 'Tiempos muertos', home: stats.timeouts.home, away: stats.timeouts.away },
                    ],
                },
            ], options),
        },
    ];
    return tabs.filter((tab) => tab.sections.length > 0);
}

/**
 * Handball. Sin proveedor externo, asi que todo lo que hay aca lo cargo alguien
 * a mano: las pestanas tienen que devolverle al operador lo que cargo, en el
 * idioma del deporte (lanzamientos, 7 metros, exclusiones), y no las de rugby
 * en cero, que era lo que veia hasta ahora.
 *
 * Las efectividades son DERIVADAS: el lanzamiento sin gol y el gol se cargan
 * cada uno por su lado, y el porcentaje sale de la suma. Los 7 metros se
 * cargan cuando se ejecutan y su desenlace dice si convirtieron.
 */
function buildHandballStatTabs(
    stats: CompleteMatchStats,
    homeName: string,
    awayName: string,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    const tipRatio = (hMade: number, hTotal: number, aMade: number, aTotal: number, note: string) => (
        `${homeName}: ${hMade}/${hTotal} · ${awayName}: ${aMade}/${aTotal} — ${note}`
    );

    // Lanzamientos totales: los que entraron (goles, 7m incluidos) mas los que no.
    const shotsNoGoal = (side: 'home' | 'away') => stats.shotsSaved[side] + stats.shotsMissed[side] + stats.shotsBlocked[side];
    const sevenMetersNoGoal = (side: 'home' | 'away') => stats.sevenMeters[side] - stats.sevenMeterGoals[side];
    const sevenMetersMissed = (side: 'home' | 'away') => sevenMetersNoGoal(side) - stats.sevenMetersSaved[side];
    const shotsTotal = (side: 'home' | 'away') => stats.points[side] + shotsNoGoal(side) + sevenMetersNoGoal(side);
    const openPlayGoals = (side: 'home' | 'away') => Math.max(
        0,
        stats.points[side]
            - stats.sevenMeterGoals[side]
            - stats.goalsFastBreak[side]
            - stats.goalsWing[side]
            - stats.goalsPivot[side]
            - stats.goalsBackcourt[side]
            - stats.goalsEmptyNet[side],
    );

    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador',
            sections: filterStatSections([
                {
                    // Un gol es un gol: el reparto por origen es estadistica, no
                    // marcador. Las filas de abajo suman el total de arriba.
                    title: 'Goles',
                    rows: [
                        { key: 'points', label: 'Goles', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'openPlayGoals', label: 'De jugada', home: openPlayGoals('home'), away: openPlayGoals('away') },
                        { key: 'goalsBackcourt', label: 'Lanzamiento exterior', home: stats.goalsBackcourt.home, away: stats.goalsBackcourt.away },
                        { key: 'goalsWing', label: 'Desde el extremo', home: stats.goalsWing.home, away: stats.goalsWing.away },
                        { key: 'goalsPivot', label: 'De pivote', home: stats.goalsPivot.home, away: stats.goalsPivot.away },
                        { key: 'goalsFastBreak', label: 'De contraataque', home: stats.goalsFastBreak.home, away: stats.goalsFastBreak.away },
                        { key: 'sevenMeterGoalsScore', label: 'De 7 metros', home: stats.sevenMeterGoals.home, away: stats.sevenMeterGoals.away },
                        { key: 'goalsEmptyNet', label: 'Arco vacío', home: stats.goalsEmptyNet.home, away: stats.goalsEmptyNet.away },
                        { key: 'assists', label: 'Asistencias', home: stats.assists.home, away: stats.assists.away },
                    ],
                },
            ], options),
        },
        {
            id: 'lanzamientos',
            label: 'Lanzamientos',
            sections: filterStatSections([
                {
                    title: 'Lanzamientos',
                    rows: [
                        { key: 'shotsTotal', label: 'Lanzamientos', home: shotsTotal('home'), away: shotsTotal('away') },
                        { key: 'shotsGoals', label: 'Convertidos', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'shotsSaved', label: 'Atajados', home: stats.shotsSaved.home + stats.sevenMetersSaved.home, away: stats.shotsSaved.away + stats.sevenMetersSaved.away },
                        { key: 'shotsBlocked', label: 'Bloqueados', home: stats.shotsBlocked.home, away: stats.shotsBlocked.away },
                        { key: 'shotsMissed', label: 'Desviados', home: stats.shotsMissed.home + sevenMetersMissed('home'), away: stats.shotsMissed.away + sevenMetersMissed('away') },
                        {
                            key: 'shotEffectiveness',
                            label: 'Efectividad (%)',
                            home: goalKickEffectivenessPercent(stats.points.home, shotsTotal('home')),
                            away: goalKickEffectivenessPercent(stats.points.away, shotsTotal('away')),
                            valueKind: 'percent',
                            tooltip: tipRatio(stats.points.home, shotsTotal('home'), stats.points.away, shotsTotal('away'), 'goles / lanzamientos'),
                        },
                    ],
                },
                {
                    title: '7 metros',
                    rows: [
                        { key: 'sevenMeters', label: 'Ejecutados', home: stats.sevenMeters.home, away: stats.sevenMeters.away },
                        { key: 'sevenMeterGoals', label: 'Convertidos', home: stats.sevenMeterGoals.home, away: stats.sevenMeterGoals.away },
                        { key: 'sevenMetersSaved', label: 'Atajados', home: stats.sevenMetersSaved.home, away: stats.sevenMetersSaved.away },
                        {
                            key: 'sevenMeterEffectiveness',
                            label: 'Efectividad (%)',
                            home: goalKickEffectivenessPercent(stats.sevenMeterGoals.home, stats.sevenMeters.home),
                            away: goalKickEffectivenessPercent(stats.sevenMeterGoals.away, stats.sevenMeters.away),
                            valueKind: 'percent',
                            tooltip: tipRatio(
                                stats.sevenMeterGoals.home,
                                stats.sevenMeters.home,
                                stats.sevenMeterGoals.away,
                                stats.sevenMeters.away,
                                'convertidos / ejecutados',
                            ),
                        },
                    ],
                },
            ], options),
        },
        {
            id: 'defensa',
            label: 'Defensa',
            sections: filterStatSections([
                {
                    // Las atajadas son del arquero del equipo, contra lanzamientos
                    // del rival. Van aparte de "Atajados" de la pestana de
                    // lanzamientos porque se cargan por separado: uno al que lanza
                    // y otro al arquero, y no hay por que asumir que coinciden.
                    title: 'Arquero',
                    rows: [
                        { key: 'saves', label: 'Atajadas', home: stats.saves.home, away: stats.saves.away, accent: true },
                        { key: 'savesSevenMeter', label: 'De 7 metros', home: stats.savesSevenMeter.home, away: stats.savesSevenMeter.away },
                    ],
                },
                {
                    title: 'Recuperación',
                    rows: [
                        { key: 'steals', label: 'Robos', home: stats.steals.home, away: stats.steals.away },
                        { key: 'blocks', label: 'Bloqueos', home: stats.blocks.home, away: stats.blocks.away },
                        { key: 'fouls', label: 'Faltas', home: stats.fouls.home, away: stats.fouls.away },
                    ],
                },
            ], options),
        },
        {
            id: 'perdidas',
            label: 'Pérdidas',
            sections: filterStatSections([
                {
                    title: 'Pérdidas de balón',
                    rows: [
                        { key: 'turnoversLost', label: 'Pérdidas', home: stats.turnoversLost.home, away: stats.turnoversLost.away, accent: true },
                        { key: 'turnoversBadPass', label: 'Mal pase', home: stats.turnoversBadPass.home, away: stats.turnoversBadPass.away },
                        { key: 'turnoversOffensiveFoul', label: 'Falta en ataque', home: stats.turnoversOffensiveFoul.home, away: stats.turnoversOffensiveFoul.away },
                        { key: 'turnoversTechnicalFault', label: 'Falta técnica', home: stats.turnoversTechnicalFault.home, away: stats.turnoversTechnicalFault.away },
                        { key: 'turnoversPassivePlay', label: 'Juego pasivo', home: stats.turnoversPassivePlay.home, away: stats.turnoversPassivePlay.away },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Sanciones',
                    rows: [
                        { key: 'yellowCards', label: 'Amarillas', home: stats.yellowCards.home, away: stats.yellowCards.away },
                        { key: 'twoMinSuspensions', label: 'Exclusiones de 2 min', home: stats.twoMinSuspensions.home, away: stats.twoMinSuspensions.away, accent: true },
                        { key: 'redCards', label: 'Rojas', home: stats.redCards.home, away: stats.redCards.away },
                        { key: 'blueCards', label: 'Azules', home: stats.blueCards.home, away: stats.blueCards.away },
                    ],
                },
            ], options),
        },
        {
            id: 'plantel',
            label: 'Plantel',
            sections: filterStatSections([
                {
                    title: 'Banco',
                    rows: [
                        { key: 'substitutions', label: 'Cambios', home: stats.substitutions.home, away: stats.substitutions.away },
                        { key: 'timeouts', label: 'Tiempos muertos', home: stats.timeouts.home, away: stats.timeouts.away },
                    ],
                },
            ], options),
        },
        {
            // Fuera del partido: el marcador reglamentario queda como quedo y la
            // tanda solo decide quien avanza. Por eso va en su propia pestana.
            id: 'definicion',
            label: 'Definición',
            sections: filterStatSections([
                {
                    title: 'Tanda de 7 metros',
                    rows: [
                        { key: 'shootoutScored', label: 'Convertidos', home: stats.shootoutScored.home, away: stats.shootoutScored.away, accent: true },
                        { key: 'shootoutMissed', label: 'Fallados', home: stats.shootoutMissed.home, away: stats.shootoutMissed.away },
                    ],
                },
            ], options),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}

export function buildCompleteStatTabs(
    stats: CompleteMatchStats,
    homeName: string,
    awayName: string,
    options: CompleteStatTabsOptions = {},
): CompleteStatTab[] {
    // Cada deporte muestra SU reparto. El default es rugby porque es el unico
    // que existia y el que tiene el catalogo de eventos mas grande; los demas
    // mostraban sus filas en cero dentro de pestanas de rugby ("Formaciones",
    // "Tiros a palos", "Entradas en 22").
    switch (normalizeSportBucket(options.sportId)) {
        case 'football':
            return buildFootballStatTabs(stats, homeName, awayName, options);
        case 'basketball':
            return buildBasketballStatTabs(stats, options);
        case 'hockey':
            return buildHockeyStatTabs(stats, homeName, awayName, options);
        case 'handball':
            return buildHandballStatTabs(stats, homeName, awayName, options);
        case 'american-football':
            return buildAmericanFootballStatTabs(stats, homeName, awayName, options);
        default:
            break;
    }

    const tipPalos = (hMade: number, hAtt: number, aMade: number, aAtt: number, note?: string) => (
        `${homeName}: ${hMade}/${hAtt} · ${awayName}: ${aMade}/${aAtt}${note ? ` — ${note}` : ''}`
    );

    const tipContest = (hW: number, hL: number, aW: number, aL: number) => (
        `${homeName}: ${hW}/${hW + hL} · ${awayName}: ${aW}/${aW + aL} (ganados/total)`
    );

    const h22 = stats.entradas22.home;
    const a22 = stats.entradas22.away;
    const h22s = redZone22Scored(stats, 'home');
    const a22s = redZone22Scored(stats, 'away');
    const tip22 = `${homeName}: ${h22s}/${h22} · ${awayName}: ${a22s}/${a22} (anotaciones en 22 / entradas)`;

    const tabs: CompleteStatTab[] = [
        {
            id: 'marcador',
            label: 'Marcador y palos',
            sections: filterStatSections([
                {
                    title: 'Marcador',
                    rows: [
                        { key: 'points', label: 'Puntos', home: stats.points.home, away: stats.points.away, accent: true },
                        { key: 'tries', label: 'Tries', home: stats.tries.home, away: stats.tries.away },
                        { key: 'penaltyTries', label: 'Try penal', home: stats.penaltyTries.home, away: stats.penaltyTries.away },
                        { key: 'conversionsMade', label: 'Conversiones OK', home: stats.conversionsMade.home, away: stats.conversionsMade.away },
                        { key: 'conversionsMissed', label: 'Conversiones falladas', home: stats.conversionsMissed.home, away: stats.conversionsMissed.away },
                        { key: 'penaltyGoalsMade', label: 'Penales a palos OK', home: stats.penaltyGoalsMade.home, away: stats.penaltyGoalsMade.away },
                        { key: 'penaltyGoalsMissed', label: 'Penales a palos fallados', home: stats.penaltyGoalsMissed.home, away: stats.penaltyGoalsMissed.away },
                        { key: 'dropGoalsMade', label: 'Drops OK', home: stats.dropGoalsMade.home, away: stats.dropGoalsMade.away },
                        { key: 'dropGoalsMissed', label: 'Drops fallados', home: stats.dropGoalsMissed.home, away: stats.dropGoalsMissed.away },
                    ],
                },
                {
                    title: 'Tiros a los palos',
                    rows: [
                        {
                            key: 'conversionEfectividad',
                            label: 'Conversiones a palos (%)',
                            home: goalKickEffectivenessPercent(stats.conversionsMade.home, stats.conversionAttempts.home),
                            away: goalKickEffectivenessPercent(stats.conversionsMade.away, stats.conversionAttempts.away),
                            valueKind: 'percent',
                            tooltip: tipPalos(
                                stats.conversionsMade.home,
                                stats.conversionAttempts.home,
                                stats.conversionsMade.away,
                                stats.conversionAttempts.away,
                            ),
                        },
                        {
                            key: 'penalPalosEfectividad',
                            label: 'Penales a palos (%)',
                            home: goalKickEffectivenessPercent(stats.penaltyGoalsMade.home, stats.penaltyGoalAttempts.home),
                            away: goalKickEffectivenessPercent(stats.penaltyGoalsMade.away, stats.penaltyGoalAttempts.away),
                            valueKind: 'percent',
                            tooltip: tipPalos(
                                stats.penaltyGoalsMade.home,
                                stats.penaltyGoalAttempts.home,
                                stats.penaltyGoalsMade.away,
                                stats.penaltyGoalAttempts.away,
                            ),
                        },
                        {
                            key: 'totalPalosEfectividad',
                            label: 'Efectividad total al palo (%)',
                            home: goalKickEffectivenessPercent(stats.goalKicksMade.home, stats.goalKickAttempts.home),
                            away: goalKickEffectivenessPercent(stats.goalKicksMade.away, stats.goalKickAttempts.away),
                            valueKind: 'percent',
                            tooltip: tipPalos(
                                stats.goalKicksMade.home,
                                stats.goalKickAttempts.home,
                                stats.goalKicksMade.away,
                                stats.goalKickAttempts.away,
                                'conv., penales a palos y drops',
                            ),
                        },
                        {
                            key: 'tasaConv22',
                            label: 'Tasa de conversión 22 (%)',
                            home: redZone22ConversionPercent(stats, 'home'),
                            away: redZone22ConversionPercent(stats, 'away'),
                            valueKind: 'percent',
                            tooltip: tip22,
                        },
                    ],
                },
            ], options),
        },
        {
            id: 'formaciones',
            label: 'Formaciones',
            sections: filterStatSections([
                {
                    title: 'Scrums',
                    rows: [
                        { key: 'scrumsWon', label: 'Ganados', home: stats.scrumsWon.home, away: stats.scrumsWon.away },
                        { key: 'scrumsLost', label: 'Perdidos', home: stats.scrumsLost.home, away: stats.scrumsLost.away },
                        {
                            key: 'scrumEfectividad',
                            label: 'Efectividad scrum (%)',
                            home: contestWinPercent(stats.scrumsWon.home, stats.scrumsLost.home),
                            away: contestWinPercent(stats.scrumsWon.away, stats.scrumsLost.away),
                            valueKind: 'percent',
                            tooltip: tipContest(
                                stats.scrumsWon.home,
                                stats.scrumsLost.home,
                                stats.scrumsWon.away,
                                stats.scrumsLost.away,
                            ),
                        },
                    ],
                },
                {
                    title: 'Lineouts',
                    rows: [
                        { key: 'linesWon', label: 'Ganados', home: stats.linesWon.home, away: stats.linesWon.away },
                        { key: 'linesLost', label: 'Perdidos', home: stats.linesLost.home, away: stats.linesLost.away },
                        {
                            key: 'lineEfectividad',
                            label: 'Efectividad line (%)',
                            home: contestWinPercent(stats.linesWon.home, stats.linesLost.home),
                            away: contestWinPercent(stats.linesWon.away, stats.linesLost.away),
                            valueKind: 'percent',
                            tooltip: tipContest(
                                stats.linesWon.home,
                                stats.linesLost.home,
                                stats.linesWon.away,
                                stats.linesLost.away,
                            ),
                        },
                    ],
                },
                {
                    title: 'Rucks',
                    rows: [
                        { key: 'rucksWon', label: 'Ganados', home: stats.rucksWon.home, away: stats.rucksWon.away },
                        { key: 'rucksLost', label: 'Perdidos', home: stats.rucksLost.home, away: stats.rucksLost.away },
                        {
                            key: 'ruckEfectividad',
                            label: 'Efectividad ruck (%)',
                            home: contestWinPercent(stats.rucksWon.home, stats.rucksLost.home),
                            away: contestWinPercent(stats.rucksWon.away, stats.rucksLost.away),
                            valueKind: 'percent',
                            tooltip: tipContest(
                                stats.rucksWon.home,
                                stats.rucksLost.home,
                                stats.rucksWon.away,
                                stats.rucksLost.away,
                            ),
                        },
                    ],
                },
                {
                    title: 'Mauls',
                    rows: [
                        { key: 'maulsWon', label: 'Ganados', home: stats.maulsWon.home, away: stats.maulsWon.away },
                        { key: 'maulsLost', label: 'Perdidos', home: stats.maulsLost.home, away: stats.maulsLost.away },
                        {
                            key: 'maulEfectividad',
                            label: 'Efectividad maul (%)',
                            home: contestWinPercent(stats.maulsWon.home, stats.maulsLost.home),
                            away: contestWinPercent(stats.maulsWon.away, stats.maulsLost.away),
                            valueKind: 'percent',
                            tooltip: tipContest(
                                stats.maulsWon.home,
                                stats.maulsLost.home,
                                stats.maulsWon.away,
                                stats.maulsLost.away,
                            ),
                        },
                    ],
                },
                {
                    title: 'Otros fijos',
                    rows: [
                        { key: 'freeKicks', label: 'Free kicks', home: stats.freeKicks.home, away: stats.freeKicks.away },
                    ],
                },
            ], options),
        },
        {
            id: 'disciplina',
            label: 'Disciplina',
            sections: filterStatSections([
                {
                    title: 'Disciplina y errores',
                    rows: [
                        { key: 'yellowCards', label: 'Amarillas', home: stats.yellowCards.home, away: stats.yellowCards.away },
                        { key: 'redCards', label: 'Rojas', home: stats.redCards.home, away: stats.redCards.away },
                        { key: 'penaltiesCommitted', label: 'Penales cometidos', home: stats.penaltiesCommitted.home, away: stats.penaltiesCommitted.away },
                        { key: 'knockOns', label: 'Knock-on', home: stats.knockOns.home, away: stats.knockOns.away },
                        { key: 'forwardPasses', label: 'Pase forward', home: stats.forwardPasses.home, away: stats.forwardPasses.away },
                        { key: 'handlingErrors', label: 'Error de manejo', home: stats.handlingErrors.home, away: stats.handlingErrors.away },
                    ],
                },
            ], options),
        },
        {
            id: 'juego',
            label: 'Juego abierto',
            sections: filterStatSections([
                {
                    title: 'Posesión y territorio',
                    rows: [
                        { key: 'entradas22', label: 'Entradas en 22', home: stats.entradas22.home, away: stats.entradas22.away },
                        { key: 'tackles', label: 'Tackles', home: stats.tackles.home, away: stats.tackles.away },
                        { key: 'kicks', label: 'Patadas (evento)', home: stats.kicks.home, away: stats.kicks.away },
                        { key: 'kickMeters', label: 'Metros de patada (juego)', home: stats.kickMeters.home, away: stats.kickMeters.away },
                        { key: 'passes', label: 'Pases', home: stats.passes.home, away: stats.passes.away },
                        { key: 'recoveries', label: 'Recuperaciones', home: stats.recoveries.home, away: stats.recoveries.away },
                        { key: 'turnoversWon', label: 'Turnovers ganados', home: stats.turnoversWon.home, away: stats.turnoversWon.away },
                        { key: 'turnoversLost', label: 'Turnovers perdidos', home: stats.turnoversLost.home, away: stats.turnoversLost.away },
                    ],
                },
            ], options),
        },
        {
            id: 'plantel',
            label: 'Plantel',
            sections: filterStatSections([
                {
                    title: 'Plantel',
                    rows: [
                        { key: 'substitutions', label: 'Cambios', home: stats.substitutions.home, away: stats.substitutions.away },
                        { key: 'injuries', label: 'Lesiones', home: stats.injuries.home, away: stats.injuries.away },
                    ],
                },
            ], options),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}
