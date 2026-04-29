import type { MatchStats } from '@/app/club-admin/matches/[id]/ClubMatchWorkspace.types';
import type { CompleteMatchStats } from '@/lib/matchStatsFromEvents';

export interface StatPair {
    home: number;
    away: number;
}

export interface StatCatalogEntry<TData> {
    key: string;
    label: string;
    category: string;
    suggestedMax?: number;
    getValue: (data: TData) => StatPair;
}

export type PostmatchStatCatalog = StatCatalogEntry<MatchStats>;
export type SeasonStatCatalog = StatCatalogEntry<CompleteMatchStats>;

const pair = (home: number, away: number): StatPair => ({ home, away });

export const STAT_CATALOG_POSTMATCH: PostmatchStatCatalog[] = [
    // Anotación
    { key: 'tries', label: 'Tries', category: 'Anotación', suggestedMax: 8, getValue: (s) => pair(s.tries.home, s.tries.away) },
    { key: 'penaltyTries', label: 'Penal tries', category: 'Anotación', suggestedMax: 4, getValue: (s) => pair(s.penaltyTries.home, s.penaltyTries.away) },
    { key: 'conversions', label: 'Conversiones', category: 'Anotación', suggestedMax: 8, getValue: (s) => pair(s.conversions.home, s.conversions.away) },
    { key: 'penaltyGoals', label: 'Penales al palo', category: 'Anotación', suggestedMax: 6, getValue: (s) => pair(s.penaltyGoals.home, s.penaltyGoals.away) },
    { key: 'dropGoals', label: 'Drops', category: 'Anotación', suggestedMax: 4, getValue: (s) => pair(s.dropGoals.home, s.dropGoals.away) },
    { key: 'freeKicks', label: 'Free kicks', category: 'Anotación', suggestedMax: 6, getValue: (s) => pair(s.freeKicks.home, s.freeKicks.away) },

    // Juego
    { key: 'entradas22', label: 'Entradas a 22', category: 'Juego', suggestedMax: 12, getValue: (s) => pair(s.entradas22.home, s.entradas22.away) },
    { key: 'recoveries', label: 'Recuperaciones', category: 'Juego', suggestedMax: 10, getValue: (s) => pair(s.recoveries.home, s.recoveries.away) },
    { key: 'turnoversWon', label: 'Turnovers ganados', category: 'Juego', suggestedMax: 10, getValue: (s) => pair(s.turnoversWon.home, s.turnoversWon.away) },

    // Continuidad
    { key: 'kicks', label: 'Kicks', category: 'Continuidad', suggestedMax: 30, getValue: (s) => pair(s.kicks.home, s.kicks.away) },
    { key: 'kickMeters', label: 'Metros de patada', category: 'Continuidad', suggestedMax: 600, getValue: (s) => pair(s.kickMeters.home, s.kickMeters.away) },
    { key: 'passes', label: 'Pases', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.passes.home, s.passes.away) },
    { key: 'rucks', label: 'Rucks', category: 'Continuidad', suggestedMax: 80, getValue: (s) => pair(s.rucks.home, s.rucks.away) },
    { key: 'knockOns', label: 'Knock ons', category: 'Continuidad', suggestedMax: 12, getValue: (s) => pair(s.knockOns.home, s.knockOns.away) },
    { key: 'forwardPasses', label: 'Forward passes', category: 'Continuidad', suggestedMax: 10, getValue: (s) => pair(s.forwardPasses.home, s.forwardPasses.away) },
    { key: 'handlingErrors', label: 'Errores de manejo', category: 'Continuidad', suggestedMax: 12, getValue: (s) => pair(s.handlingErrors.home, s.handlingErrors.away) },
    { key: 'turnoversLost', label: 'Turnovers perdidos', category: 'Continuidad', suggestedMax: 10, getValue: (s) => pair(s.turnoversLost.home, s.turnoversLost.away) },

    // Set piece
    { key: 'scrumsWon', label: 'Scrums ganados', category: 'Set piece', suggestedMax: 15, getValue: (s) => pair(s.scrums.home.won, s.scrums.away.won) },
    { key: 'scrumsLost', label: 'Scrums perdidos', category: 'Set piece', suggestedMax: 6, getValue: (s) => pair(s.scrums.home.lost, s.scrums.away.lost) },
    { key: 'linesWon', label: 'Lines ganados', category: 'Set piece', suggestedMax: 15, getValue: (s) => pair(s.lines.home.won, s.lines.away.won) },
    { key: 'linesLost', label: 'Lines perdidos', category: 'Set piece', suggestedMax: 6, getValue: (s) => pair(s.lines.home.lost, s.lines.away.lost) },
    { key: 'maulsWon', label: 'Mauls ganados', category: 'Set piece', suggestedMax: 8, getValue: (s) => pair(s.mauls.home.won, s.mauls.away.won) },
    { key: 'maulsLost', label: 'Mauls perdidos', category: 'Set piece', suggestedMax: 4, getValue: (s) => pair(s.mauls.home.lost, s.mauls.away.lost) },

    // Disciplina
    { key: 'tackles', label: 'Tackles', category: 'Disciplina', suggestedMax: 200, getValue: (s) => pair(s.tackles.home, s.tackles.away) },
    { key: 'yellowCards', label: 'Tarjetas amarillas', category: 'Disciplina', suggestedMax: 4, getValue: (s) => pair(s.cards.home.yellow, s.cards.away.yellow) },
    { key: 'redCards', label: 'Tarjetas rojas', category: 'Disciplina', suggestedMax: 2, getValue: (s) => pair(s.cards.home.red, s.cards.away.red) },
    { key: 'substitutions', label: 'Sustituciones', category: 'Disciplina', suggestedMax: 12, getValue: (s) => pair(s.substitutions.home, s.substitutions.away) },
    { key: 'penaltiesCommitted', label: 'Penales cometidos', category: 'Disciplina', suggestedMax: 15, getValue: (s) => pair(s.penaltiesCommitted.home, s.penaltiesCommitted.away) },
    { key: 'penalties', label: 'Penales concedidos', category: 'Disciplina', suggestedMax: 15, getValue: (s) => pair(s.penalties.home, s.penalties.away) },
    { key: 'injuries', label: 'Lesiones', category: 'Disciplina', suggestedMax: 5, getValue: (s) => pair(s.injuries.home, s.injuries.away) },
];

export const STAT_CATALOG_SEASON: SeasonStatCatalog[] = [
    // Marcador
    { key: 'points', label: 'Puntos', category: 'Marcador', suggestedMax: 600, getValue: (s) => pair(s.points.home, s.points.away) },
    { key: 'tries', label: 'Tries', category: 'Marcador', suggestedMax: 80, getValue: (s) => pair(s.tries.home, s.tries.away) },
    { key: 'penaltyTries', label: 'Penal tries', category: 'Marcador', suggestedMax: 20, getValue: (s) => pair(s.penaltyTries.home, s.penaltyTries.away) },
    { key: 'conversionsMade', label: 'Conversiones', category: 'Marcador', suggestedMax: 80, getValue: (s) => pair(s.conversionsMade.home, s.conversionsMade.away) },
    { key: 'conversionAttempts', label: 'Intentos de conversión', category: 'Marcador', suggestedMax: 80, getValue: (s) => pair(s.conversionAttempts.home, s.conversionAttempts.away) },
    { key: 'conversionsMissed', label: 'Conversiones erradas', category: 'Marcador', suggestedMax: 40, getValue: (s) => pair(s.conversionsMissed.home, s.conversionsMissed.away) },
    { key: 'penaltyGoalsMade', label: 'Penales convertidos', category: 'Marcador', suggestedMax: 40, getValue: (s) => pair(s.penaltyGoalsMade.home, s.penaltyGoalsMade.away) },
    { key: 'penaltyGoalAttempts', label: 'Intentos de penal', category: 'Marcador', suggestedMax: 60, getValue: (s) => pair(s.penaltyGoalAttempts.home, s.penaltyGoalAttempts.away) },
    { key: 'dropGoalsMade', label: 'Drops convertidos', category: 'Marcador', suggestedMax: 20, getValue: (s) => pair(s.dropGoalsMade.home, s.dropGoalsMade.away) },

    // Set piece
    { key: 'scrumsTotal', label: 'Scrums totales', category: 'Set piece', suggestedMax: 200, getValue: (s) => pair(s.scrumsTotal.home, s.scrumsTotal.away) },
    { key: 'scrumsWon', label: 'Scrums ganados', category: 'Set piece', suggestedMax: 200, getValue: (s) => pair(s.scrumsWon.home, s.scrumsWon.away) },
    { key: 'scrumsLost', label: 'Scrums perdidos', category: 'Set piece', suggestedMax: 60, getValue: (s) => pair(s.scrumsLost.home, s.scrumsLost.away) },
    { key: 'linesTotal', label: 'Lines totales', category: 'Set piece', suggestedMax: 250, getValue: (s) => pair(s.linesTotal.home, s.linesTotal.away) },
    { key: 'linesWon', label: 'Lines ganados', category: 'Set piece', suggestedMax: 250, getValue: (s) => pair(s.linesWon.home, s.linesWon.away) },
    { key: 'linesLost', label: 'Lines perdidos', category: 'Set piece', suggestedMax: 80, getValue: (s) => pair(s.linesLost.home, s.linesLost.away) },
    { key: 'maulsTotal', label: 'Mauls', category: 'Set piece', suggestedMax: 100, getValue: (s) => pair(s.maulsTotal.home, s.maulsTotal.away) },
    { key: 'maulsWon', label: 'Mauls ganados', category: 'Set piece', suggestedMax: 100, getValue: (s) => pair(s.maulsWon.home, s.maulsWon.away) },

    // Continuidad
    { key: 'rucksTotal', label: 'Rucks', category: 'Continuidad', suggestedMax: 1500, getValue: (s) => pair(s.rucksTotal.home, s.rucksTotal.away) },
    { key: 'rucksWon', label: 'Rucks ganados', category: 'Continuidad', suggestedMax: 1500, getValue: (s) => pair(s.rucksWon.home, s.rucksWon.away) },
    { key: 'kicks', label: 'Kicks', category: 'Continuidad', suggestedMax: 600, getValue: (s) => pair(s.kicks.home, s.kicks.away) },
    { key: 'kickMeters', label: 'Metros de patada', category: 'Continuidad', suggestedMax: 12000, getValue: (s) => pair(s.kickMeters.home, s.kickMeters.away) },
    { key: 'passes', label: 'Pases', category: 'Continuidad', suggestedMax: 4000, getValue: (s) => pair(s.passes.home, s.passes.away) },
    { key: 'recoveries', label: 'Recuperaciones', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.recoveries.home, s.recoveries.away) },
    { key: 'turnoversWon', label: 'Turnovers ganados', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.turnoversWon.home, s.turnoversWon.away) },
    { key: 'turnoversLost', label: 'Turnovers perdidos', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.turnoversLost.home, s.turnoversLost.away) },
    { key: 'knockOns', label: 'Knock ons', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.knockOns.home, s.knockOns.away) },
    { key: 'forwardPasses', label: 'Forward passes', category: 'Continuidad', suggestedMax: 150, getValue: (s) => pair(s.forwardPasses.home, s.forwardPasses.away) },
    { key: 'handlingErrors', label: 'Errores de manejo', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.handlingErrors.home, s.handlingErrors.away) },
    { key: 'entradas22', label: 'Entradas a 22', category: 'Continuidad', suggestedMax: 200, getValue: (s) => pair(s.entradas22.home, s.entradas22.away) },

    // Disciplina
    { key: 'tackles', label: 'Tackles', category: 'Disciplina', suggestedMax: 4000, getValue: (s) => pair(s.tackles.home, s.tackles.away) },
    { key: 'yellowCards', label: 'Amarillas', category: 'Disciplina', suggestedMax: 60, getValue: (s) => pair(s.yellowCards.home, s.yellowCards.away) },
    { key: 'redCards', label: 'Rojas', category: 'Disciplina', suggestedMax: 20, getValue: (s) => pair(s.redCards.home, s.redCards.away) },
    { key: 'penaltiesWon', label: 'Penales ganados', category: 'Disciplina', suggestedMax: 250, getValue: (s) => pair(s.penaltiesWon.home, s.penaltiesWon.away) },
    { key: 'penaltiesConceded', label: 'Penales concedidos', category: 'Disciplina', suggestedMax: 250, getValue: (s) => pair(s.penaltiesConceded.home, s.penaltiesConceded.away) },
    { key: 'penaltiesCommitted', label: 'Penales cometidos', category: 'Disciplina', suggestedMax: 250, getValue: (s) => pair(s.penaltiesCommitted.home, s.penaltiesCommitted.away) },
    { key: 'freeKicks', label: 'Free kicks', category: 'Disciplina', suggestedMax: 60, getValue: (s) => pair(s.freeKicks.home, s.freeKicks.away) },
    { key: 'substitutions', label: 'Sustituciones', category: 'Disciplina', suggestedMax: 200, getValue: (s) => pair(s.substitutions.home, s.substitutions.away) },
    { key: 'injuries', label: 'Lesiones', category: 'Disciplina', suggestedMax: 60, getValue: (s) => pair(s.injuries.home, s.injuries.away) },
];

export function statEntryByKey<TData>(catalog: StatCatalogEntry<TData>[], key: string): StatCatalogEntry<TData> | null {
    return catalog.find((e) => e.key === key) ?? null;
}

export function groupCatalogByCategory<TData>(catalog: StatCatalogEntry<TData>[]): Array<{ category: string; entries: StatCatalogEntry<TData>[] }> {
    const map = new Map<string, StatCatalogEntry<TData>[]>();
    for (const entry of catalog) {
        const list = map.get(entry.category) ?? [];
        list.push(entry);
        map.set(entry.category, list);
    }
    return Array.from(map.entries()).map(([category, entries]) => ({ category, entries }));
}
