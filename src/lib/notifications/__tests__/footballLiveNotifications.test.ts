import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Match } from '../../../types/match.ts';

import {
    describeChange,
    detectFootballChanges,
    minuteNumber,
    type PreviousLiveState,
} from '../footballLiveNotifications.ts';

/**
 * La detección de hechos se prueba con partidos armados a mano: lo que el cron
 * anterior dejó en la caché contra lo que ESPN trae ahora. Sin red ni base.
 */

function partido(overrides: Partial<Match> = {}): Match {
    return {
        id: 'espn-soccer-game-arg.1-1',
        tournamentId: 'espn-soccer-league-arg.1',
        leagueName: 'Liga Profesional',
        phaseId: 'group',
        round: 1,
        homeTeamId: 'espn-soccer-team-arg.1-10',
        homeTeamName: 'River',
        awayTeamId: 'espn-soccer-team-arg.1-20',
        awayTeamName: 'Boca',
        scheduledAt: new Date('2026-09-08T20:00:00Z'),
        status: 'live',
        score: { home: 0, away: 0 },
        currentMinute: "5'",
        result: { isComplete: false, updatedAt: new Date(), updatedBy: 'espn', version: 1 },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as Match;
}

function previo(rows: PreviousLiveState[]): Map<string, PreviousLiveState> {
    return new Map(rows.map((r) => [r.id, r]));
}

describe('minuteNumber', () => {
    it('lee el minuto con o sin descuento y el entretiempo', () => {
        assert.equal(minuteNumber("23'"), 23);
        assert.equal(minuteNumber("45'+2"), 47);
        assert.equal(minuteNumber('90+3'), 93);
        assert.equal(minuteNumber('HT'), 45);
        assert.equal(minuteNumber(''), null);
        assert.equal(minuteNumber(undefined), null);
    });
});

describe('detectFootballChanges', () => {
    it('avisa el comienzo cuando la fila estaba programada', () => {
        const cambios = detectFootballChanges(
            previo([{ id: 'espn-soccer-game-arg.1-1', status: 'scheduled', score: { home: null, away: null } }]),
            [partido({ currentMinute: "3'" })],
            [],
        );
        assert.deepEqual(cambios.map((c) => c.kind), ['kickoff']);
        assert.equal(cambios[0].triggerKey, 'football:kickoff:espn-soccer-game-arg.1-1');
    });

    it('no avisa "empezó" si descubre el partido avanzado', () => {
        const cambios = detectFootballChanges(previo([]), [partido({ currentMinute: "61'", score: { home: 2, away: 1 } })], []);
        assert.deepEqual(cambios, []);
    });

    it('un marcador que sube es un gol, con su autor', () => {
        const ahora = partido({
            currentMinute: "24'",
            score: { home: 1, away: 0 },
            liveEvents: [
                { kind: 'goal', minute: "23'", minuteNumber: 23, teamId: 'espn-soccer-team-arg.1-10', playerName: 'Borja' },
            ],
        });
        const cambios = detectFootballChanges(
            previo([{ id: ahora.id, status: 'live', score: { home: 0, away: 0 } }]),
            [ahora],
            [],
        );
        assert.equal(cambios.length, 1);
        const gol = cambios[0];
        assert.equal(gol.kind, 'goal');
        assert.equal(gol.teamName, 'River');
        assert.equal(gol.playerName, 'Borja');
        assert.equal(gol.triggerKey, 'football:goal:espn-soccer-game-arg.1-1:1-0');
        assert.deepEqual(describeChange(gol), { title: 'Gol de River', body: 'Min 23: Borja. River 1-0 Boca.' });
    });

    it('dos goles de golpe son dos avisos con dos claves', () => {
        const ahora = partido({ currentMinute: "70'", score: { home: 1, away: 2 } });
        const cambios = detectFootballChanges(
            previo([{ id: ahora.id, status: 'live', score: { home: 1, away: 0 } }]),
            [ahora],
            [],
        );
        assert.deepEqual(cambios.map((c) => c.triggerKey), [
            'football:goal:espn-soccer-game-arg.1-1:1-1',
            'football:goal:espn-soccer-game-arg.1-1:1-2',
        ]);
        assert.equal(describeChange(cambios[1]).body, 'Min 70: River 1-2 Boca.');
    });

    it('sin fila anterior el marcador no es un gol', () => {
        const cambios = detectFootballChanges(previo([]), [partido({ currentMinute: "70'", score: { home: 2, away: 1 } })], []);
        assert.deepEqual(cambios, []);
    });

    it('una roja reciente se avisa; una vieja, no', () => {
        const ahora = partido({
            currentMinute: "72'",
            score: { home: 0, away: 0 },
            liveEvents: [
                { kind: 'red-card', minute: "70'", minuteNumber: 70, teamId: 'espn-soccer-team-arg.1-20', playerName: 'Rojo' },
                { kind: 'red-card', minute: "30'", minuteNumber: 30, teamId: 'espn-soccer-team-arg.1-10', playerName: 'Viejo' },
                { kind: 'yellow-card', minute: "71'", minuteNumber: 71, teamId: 'espn-soccer-team-arg.1-10', playerName: 'Amarilla' },
            ],
        });
        const cambios = detectFootballChanges(previo([{ id: ahora.id, status: 'live', score: { home: 0, away: 0 } }]), [ahora], []);
        assert.equal(cambios.length, 1);
        assert.equal(cambios[0].kind, 'red-card');
        assert.equal(cambios[0].teamName, 'Boca');
        assert.deepEqual(describeChange(cambios[0]), { title: 'Expulsado en Boca', body: 'Min 70: roja para Rojo. River 0-0 Boca.' });
    });

    it('el final sale del listado del día, con el marcador final', () => {
        const terminado = partido({ status: 'final', score: { home: 2, away: 1 }, currentMinute: undefined });
        const cambios = detectFootballChanges(
            previo([{ id: terminado.id, status: 'live', score: { home: 2, away: 0 } }]),
            [],
            [terminado],
        );
        assert.equal(cambios.length, 1);
        assert.equal(cambios[0].kind, 'final');
        assert.deepEqual(describeChange(cambios[0]), {
            title: 'Partido finalizado',
            body: 'Final: River 2-1 Boca en Liga Profesional.',
        });
    });

    it('un partido que sigue en vivo no se da por terminado aunque el día lo liste', () => {
        const vivo = partido({ score: { home: 1, away: 0 }, currentMinute: "80'" });
        const cambios = detectFootballChanges(
            previo([{ id: vivo.id, status: 'live', score: { home: 1, away: 0 } }]),
            [vivo],
            [partido({ status: 'final', score: { home: 1, away: 0 } })],
        );
        assert.deepEqual(cambios, []);
    });
});
