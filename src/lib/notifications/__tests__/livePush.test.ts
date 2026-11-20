import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    TICK_EVERY_MS,
    buildLiveMessage,
    decideLive,
    describePlay,
    isIosUserAgent,
    liveTag,
    minuteOf,
    phaseOf,
    type LiveSentState,
    type LiveSnapshot,
} from '../livePush.ts';

const NOW = Date.parse('2026-11-20T18:00:00.000Z');

const snapshot = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
    matchId: '11111111-2222-3333-4444-555555555555',
    sportId: 'rugby',
    homeName: 'UNIV. SAN JUAN',
    awayName: 'CPBM',
    home: 7,
    away: 3,
    phase: 'second',
    minute: 55,
    redCards: 0,
    lastPlay: null,
    ...over,
});

const sent = (over: Partial<LiveSentState> = {}): LiveSentState => ({
    home: 7,
    away: 3,
    phase: 'second',
    redCards: 0,
    minute: 55,
    pushedAt: NOW - 60_000,
    ...over,
});

describe('phaseOf / minuteOf', () => {
    it('lee la fase del estado y del reloj', () => {
        assert.equal(phaseOf('final', null), 'final');
        assert.equal(phaseOf('halftime', null), 'halftime');
        assert.equal(phaseOf('live', { period: 'HT' }), 'halftime');
        assert.equal(phaseOf('live', { period: '2T' }), 'second');
        assert.equal(phaseOf('live', { period: '1T' }), 'first');
        assert.equal(phaseOf('scheduled', null), 'scheduled');
    });

    it('con el reloj corriendo calcula el minuto; detenido usa el guardado', () => {
        const startedAt = new Date(NOW - 5 * 60_000).toISOString();
        assert.equal(
            minuteOf({ running: true, accumulated_seconds: 3000, period_started_at: startedAt }, NOW),
            55,
        );
        assert.equal(minuteOf({ running: false, minute: 41 }, NOW), 41);
        assert.equal(minuteOf(null, NOW), null);
    });
});

describe('decideLive', () => {
    it('sin aviso previo, un partido en curso arranca con su foto', () => {
        assert.deepEqual(decideLive(null, snapshot(), NOW, true), { kind: 'start', loud: true });
    });

    it('sin cambios no manda nada', () => {
        assert.equal(decideLive(sent(), snapshot(), NOW, true), null);
    });

    it('un cambio de marcador es un hito que suena', () => {
        assert.deepEqual(decideLive(sent(), snapshot({ home: 12 }), NOW, true), { kind: 'score', loud: true });
        assert.deepEqual(decideLive(sent(), snapshot({ away: 6 }), NOW, false), { kind: 'score', loud: true });
    });

    it('una roja nueva, el entretiempo y el segundo tiempo son hitos', () => {
        assert.equal(decideLive(sent(), snapshot({ redCards: 1 }), NOW, true)?.kind, 'red');
        assert.equal(decideLive(sent({ phase: 'first' }), snapshot({ phase: 'halftime' }), NOW, true)?.kind, 'halftime');
        assert.equal(decideLive(sent({ phase: 'halftime' }), snapshot({ phase: 'second' }), NOW, true)?.kind, 'second-half');
    });

    it('el final cierra el aviso y despues no manda mas', () => {
        assert.deepEqual(decideLive(sent(), snapshot({ phase: 'final' }), NOW, true), { kind: 'final', loud: true });
        assert.equal(decideLive(sent({ phase: 'final' }), snapshot({ phase: 'final', home: 9 }), NOW, true), null);
    });

    it('el minuto solo se refresca en silencio y solo donde se puede (no iPhone)', () => {
        const later = NOW + TICK_EVERY_MS;
        const next = snapshot({ minute: 66 });
        assert.deepEqual(decideLive(sent({ pushedAt: NOW }), next, later, true), { kind: 'tick', loud: false });
        assert.equal(decideLive(sent({ pushedAt: NOW }), next, later, false), null);
        // Antes del intervalo no se refresca: evita un push por minuto.
        assert.equal(decideLive(sent({ pushedAt: NOW }), next, NOW + 60_000, true), null);
    });

    it('un partido que todavia no empezo no avisa', () => {
        assert.equal(decideLive(null, snapshot({ phase: 'scheduled' }), NOW, true), null);
    });
});

describe('buildLiveMessage', () => {
    it('arma el marcador en el titulo y la jugada en el cuerpo', () => {
        const message = buildLiveMessage(
            snapshot({ home: 12, lastPlay: 'Try de Juan Pérez (UNIV. SAN JUAN)' }),
            { kind: 'score', loud: true },
            true,
        );

        assert.equal(message.title, '🏉 UNIV. SAN JUAN 12 – 3 CPBM');
        assert.equal(message.body, "Try de Juan Pérez (UNIV. SAN JUAN)\n2.º tiempo · 55'");
        assert.equal(message.tag, liveTag(snapshot().matchId));
        assert.equal(message.silent, false);
        assert.equal(message.renotify, true);
        assert.equal(message.requireInteraction, true);
    });

    it('el refresco de minuto va en silencio y sin renotify', () => {
        const message = buildLiveMessage(snapshot({ minute: 66 }), { kind: 'tick', loud: false }, true);
        assert.equal(message.silent, true);
        assert.equal(message.renotify, false);
        assert.equal(message.body, "2.º tiempo · 66'");
    });

    it('el final se suelta y no queda fijo; en iPhone nunca queda fijo', () => {
        const final = buildLiveMessage(snapshot({ phase: 'final', minute: 80 }), { kind: 'final', loud: true }, true);
        assert.equal(final.requireInteraction, false);
        assert.equal(final.body, 'Terminó el partido\nFinal');

        const ios = buildLiveMessage(snapshot(), { kind: 'score', loud: true }, false);
        assert.equal(ios.requireInteraction, false);
    });
});

describe('describePlay / isIosUserAgent', () => {
    it('redacta en castellano y descarta lo que no es una jugada que importa', () => {
        assert.equal(describePlay('try', 'Ana Gómez', 'CPBM'), 'Try de Ana Gómez (CPBM)');
        assert.equal(describePlay('card_red', null, 'CPBM'), 'Tarjeta roja (CPBM)');
        assert.equal(describePlay('substitution', 'Ana Gómez', 'CPBM'), null);
    });

    it('detecta iPhone y iPad', () => {
        assert.equal(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
        assert.equal(isIosUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), false);
        assert.equal(isIosUserAgent(null), false);
    });
});
