import type { MatchEventDefinition } from '@/lib/matchEventCatalog';
import {
    isGoalKickAttemptEvent,
    isGoalKickEventType,
    isGoalKickMade,
    goalKickEffectivenessPercent,
    parseKickMetersFromDetail,
    isContestWonDetail,
    isContestLostDetail,
} from '@/lib/matchEventStats';

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

export function getConfiguredEventPoints(
    event: string | Pick<AggregatableMatchEvent, 'type' | 'detail'>,
    definitionMap: Record<string, MatchEventDefinition>,
): number {
    const eventType = typeof event === 'string' ? event : event.type;
    const definition = definitionMap[eventType];
    if (!definition || definition.category !== 'score') {
        return 0;
    }
    if (typeof event !== 'string' && isGoalKickEventType(event.type) && !isGoalKickAttemptEvent(event)) {
        return 0;
    }
    if (typeof event !== 'string' && !isGoalKickMade(event.type, event.detail)) {
        return 0;
    }
    return Number(definition.points) || 0;
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
        bumpTeamMetric(stats.assignedEvents, team);
        bumpTeamMetric(stats.points, team, points);
        if (points > 0) bumpTeamMetric(stats.scoringEvents, team);

        const isGoalAttempt = isGoalKickAttemptEvent(event);
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
                }
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

function filterStatSectionRows(rows: CompleteStatRow[]): CompleteStatRow[] {
    return rows.filter((row) => {
        if (row.valueKind === 'percent') return true;
        return row.home > 0 || row.away > 0 || row.accent;
    });
}

function filterStatSections(sections: CompleteStatSection[]): CompleteStatSection[] {
    return sections
        .map((section) => ({ ...section, rows: filterStatSectionRows(section.rows) }))
        .filter((section) => section.rows.length > 0);
}

export function buildCompleteStatTabs(stats: CompleteMatchStats, homeName: string, awayName: string): CompleteStatTab[] {
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
            ]),
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
            ]),
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
            ]),
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
            ]),
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
            ]),
        },
    ];

    return tabs.filter((tab) => tab.sections.length > 0);
}
