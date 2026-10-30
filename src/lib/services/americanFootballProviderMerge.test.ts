import test from 'node:test';
import assert from 'node:assert/strict';

import type { Match } from '../../types/match.ts';
import { mergeAmericanFootballProviders } from './americanFootballProviderMerge.ts';

/**
 * La regla: ESPN entero, más lo de FlashScore que ESPN no cubre. Los dos
 * errores posibles son dejar pasar la NFL duplicada y, al arreglarlo de más,
 * tirar la CFL o la ELF, que solo existen en FlashScore.
 */

let sequence = 0;

function match(overrides: Partial<Match> & { home: string; away: string }): Match {
    sequence += 1;
    const { home, away, ...rest } = overrides;
    return {
        id: `m-${sequence}`,
        tournamentId: 'fs-generico',
        leagueName: 'Torneo',
        phaseId: 'group',
        round: 1,
        homeTeamId: `t-${home}`,
        homeTeamName: home,
        awayTeamId: `t-${away}`,
        awayTeamName: away,
        scheduledAt: new Date('2026-09-13T17:00:00Z'),
        status: 'scheduled',
        score: { home: null, away: null },
        result: { isComplete: false, updatedAt: null, updatedBy: null, version: 1 },
        createdFrom: 'generator',
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...rest,
    };
}

test('la NFL de FlashScore se descarta porque ya la trae ESPN', () => {
    const espn = [match({ home: 'Bills', away: 'Jets', tournamentId: 'espn-league-nfl', leagueName: 'NFL', leagueUrl: '/american-football/usa/nfl/' })];
    const flashScore = [
        match({ home: 'Buffalo Bills', away: 'New York Jets', leagueName: 'NFL', leagueUrl: '/american-football/usa/nfl/' }),
        match({ home: 'Alabama', away: 'Georgia', leagueName: 'NCAA', leagueUrl: '/american-football/usa/ncaa/' }),
    ];
    const merged = mergeAmericanFootballProviders(espn, flashScore);
    assert.deepEqual(merged.map((m) => m.homeTeamName), ['Bills']);
});

test('la CFL y las ligas europeas de FlashScore sobreviven: ESPN no las cubre', () => {
    const espn = [match({ home: 'Bills', away: 'Jets', tournamentId: 'espn-league-nfl', leagueUrl: '/american-football/usa/nfl/' })];
    const flashScore = [
        match({ home: 'Argonauts', away: 'Alouettes', leagueName: 'CFL', leagueUrl: '/american-football/canada/cfl/' }),
        match({ home: 'Rhein Fire', away: 'Vienna Vikings', leagueName: 'ELF', leagueUrl: '/american-football/europe/elf/' }),
        match({ home: 'Raptors', away: 'Dinos', leagueName: 'LFA', leagueUrl: '/american-football/mexico/lfa/' }),
    ];
    const merged = mergeAmericanFootballProviders(espn, flashScore);
    assert.deepEqual(merged.map((m) => m.homeTeamName), ['Bills', 'Argonauts', 'Rhein Fire', 'Raptors']);
});

test('sin URL decide el nombre; con URL el nombre no manda', () => {
    const flashScore = [
        match({ home: 'A', away: 'B', leagueName: 'NFL' }),
        match({ home: 'C', away: 'D', leagueName: 'NFL Europe', leagueUrl: '/american-football/europe/elf/' }),
    ];
    const merged = mergeAmericanFootballProviders([], flashScore);
    assert.deepEqual(merged.map((m) => m.homeTeamName), ['C']);
});

test('si ESPN se cae, FlashScore sigue solo; si FlashScore se cae, ESPN sigue solo', () => {
    const espn = [match({ home: 'Bills', away: 'Jets', leagueUrl: '/american-football/usa/nfl/' })];
    const cfl = [match({ home: 'Argonauts', away: 'Alouettes', leagueUrl: '/american-football/canada/cfl/' })];
    assert.equal(mergeAmericanFootballProviders([], cfl).length, 1);
    assert.equal(mergeAmericanFootballProviders(espn, []).length, 1);
});
