import {
    normalizeSportBucket,
    outcomeScores,
    readOutcomeId,
    type MatchEventDefinition,
} from './matchEventCatalog.ts';
import {
    isGoalKickAttemptEvent,
    isGoalKickMade,
    goalKickEffectivenessPercent,
    parseKickMetersFromDetail,
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
    /* ── Futbol americano ── */
    touchdowns: TeamMetricPair;
    fieldGoals: TeamMetricPair;
    extraPoints: TeamMetricPair;
    twoPointConversions: TeamMetricPair;
    safeties: TeamMetricPair;
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
        touchdowns: createTeamMetricPair(),
        fieldGoals: createTeamMetricPair(),
        extraPoints: createTeamMetricPair(),
        twoPointConversions: createTeamMetricPair(),
        safeties: createTeamMetricPair(),
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
                    bumpTeamMetric(stats.penaltiesCommitted, team);
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
                bumpTeamMetric(stats.interceptions, team);
                break;
            case 'block':
                bumpTeamMetric(stats.blocks, team);
                break;
            case 'save':
                bumpTeamMetric(stats.saves, team);
                break;
            case 'clearance':
                bumpTeamMetric(stats.clearances, team);
                break;
            /* ── Futbol americano ── */
            case 'touchdown':
                bumpTeamMetric(stats.touchdowns, team);
                break;
            case 'field_goal':
                bumpTeamMetric(stats.fieldGoals, team);
                break;
            case 'extra_point':
                bumpTeamMetric(stats.extraPoints, team);
                break;
            case 'two_point_conversion':
                bumpTeamMetric(stats.twoPointConversions, team);
                break;
            case 'safety':
                bumpTeamMetric(stats.safeties, team);
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
            case 'turnover_lost':
                bumpTeamMetric(stats.turnoversLost, team);
                break;
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
                        { key: 'penaltyStrokeGoalsScore', label: 'De penal stroke', home: stats.penaltyStrokeGoals.home, away: stats.penaltyStrokeGoals.away },
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
                    title: 'Penal stroke',
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
function buildAmericanFootballStatTabs(
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
                        { key: 'touchdowns', label: 'Touchdowns', home: stats.touchdowns.home, away: stats.touchdowns.away },
                        { key: 'fieldGoals', label: 'Field goals', home: stats.fieldGoals.home, away: stats.fieldGoals.away },
                        { key: 'extraPoints', label: 'Puntos extra', home: stats.extraPoints.home, away: stats.extraPoints.away },
                        { key: 'twoPointConversions', label: 'Conversiones de 2', home: stats.twoPointConversions.home, away: stats.twoPointConversions.away },
                        { key: 'safeties', label: 'Safeties', home: stats.safeties.home, away: stats.safeties.away },
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
        case 'american-football':
            return buildAmericanFootballStatTabs(stats, options);
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
                    title: 'Tiros a palos (mismos criterios que el resto del producto)',
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
