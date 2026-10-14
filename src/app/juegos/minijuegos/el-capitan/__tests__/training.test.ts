// LA ZONA DE ENTRENAMIENTO JUEGA LOS 65, Y LA DIFICULTAD SE NOTA.
//
// Lo que se afirma:
//   · LOS 65 SE ARMAN Y SE RESUELVEN con el reducer real, en los tres niveles,
//     sin trabarse — un minijuego que no cierra deja al jugador mirando una
//     pantalla sin salida, que es exactamente lo que la carrera ya cuida.
//   · JUGAR BIEN SACA MEJOR NOTA QUE JUGAR MAL. Si la nota no siguiera a la mano,
//     el récord no mediría nada.
//   · EL LIBRO, EL DESAFÍO Y LA RACHA son puros y estables.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState } from '../../../../../features/captain/types/captain.ts';
import type { MomentOutcome } from '../../../../../features/captain/types/moment.ts';
import type { PlayLevel } from '../../../../../features/captain/types/moment-def.ts';
import { getMomentDef, isContractKind } from '../../../../../features/captain/engine/moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../../../../../features/captain/engine/moments.ts';
import {
    GRADE_SCORE,
    TRAINING_GAMES,
    TRAINING_LEVELS,
    bookSummary,
    dailyGame,
    dailyStreak,
    dayKey,
    emptyBook,
    gradeAttempt,
    practiceResolve,
    practiceState,
    recordAttempt,
    type TrainingGame,
    type TrainingLevel,
} from '../training.ts';

function mano(state: CaptainState, nivel: PlayLevel): MomentOutcome {
    const p = state.pendingMoment!;
    if (isContractKind(p.kind)) return getMomentDef(p.kind)!.playAt(p.setup!, nivel, 0.5);
    if (p.kind === 'bunker') return { kind: 'bunker' };
    const zones = tackleZones(state.player, state.damage.cuerpo, p.pressure);
    const { at, zone } = tacklePlayAt(zones, nivel, 0.5);
    return { kind: 'tackle', zone, at };
}

function jugar(game: TrainingGame, level: TrainingLevel, nivel: PlayLevel, attempt = 0) {
    const antes = practiceState(game, level, attempt);
    let s = antes;
    for (let i = 0; i < 4 && s.phase === 'moment'; i += 1) s = practiceResolve(s, mano(s, nivel));
    assert.notEqual(s.phase, 'moment', `${game.slot} (${level}) quedó trabado`);
    return gradeAttempt(game, antes, s);
}

test('LOS 65 SE ARMAN Y SE RESUELVEN, en los tres niveles', () => {
    assert.equal(TRAINING_GAMES.length, 65);
    for (const game of TRAINING_GAMES) {
        assert.ok(game.title && game.brief, `${game.slot} sin título o sin consigna`);
        for (const l of TRAINING_LEVELS) jugar(game, l.id, 'regular');
    }
});

test('JUGAR BIEN SACA MEJOR NOTA QUE JUGAR MAL', () => {
    let bien = 0;
    let mal = 0;
    for (const game of TRAINING_GAMES) {
        bien += GRADE_SCORE[jugar(game, 'normal', 'bien')];
        mal += GRADE_SCORE[jugar(game, 'normal', 'mal')];
    }
    assert.ok(bien > mal, `bien ${bien} vs mal ${mal}`);
});

test('otra vez trae otra jugada: la semilla sale del intento', () => {
    const game = TRAINING_GAMES.find((g) => g.slot === 'd10-drop')!;
    const a = practiceState(game, 'normal', 0).pendingMoment;
    const b = practiceState(game, 'normal', 1).pendingMoment;
    assert.notDeepEqual(a, b);
    assert.deepEqual(practiceState(game, 'normal', 1).pendingMoment, b);
});

test('el libro guarda la mejor nota y el desafío del día', () => {
    let { book, newBest } = recordAttempt(emptyBook(), 'd10-drop', 'tibio', null);
    assert.equal(newBest, true);
    ({ book, newBest } = recordAttempt(book, 'd10-drop', 'errado', '2026-10-14'));
    assert.equal(newBest, false);
    assert.deepEqual(book.records['d10-drop'], { plays: 2, best: GRADE_SCORE.tibio });
    assert.equal(book.daily['2026-10-14'], GRADE_SCORE.errado);
    assert.equal(bookSummary(book).jugados, 1);
});

test('el del día es estable, y la racha cuenta días seguidos bien jugados', () => {
    assert.equal(dailyGame('2026-10-14').slot, dailyGame('2026-10-14').slot);
    const hoy = new Date(2026, 9, 14);
    const book = emptyBook();
    book.daily[dayKey(new Date(2026, 9, 13))] = GRADE_SCORE.clavado;
    book.daily[dayKey(new Date(2026, 9, 12))] = GRADE_SCORE.logrado;
    book.daily[dayKey(new Date(2026, 9, 10))] = GRADE_SCORE.clavado;
    // Hoy todavía no jugó: la racha viene de ayer y se corta en el hueco del 11.
    assert.equal(dailyStreak(book, hoy), 2);
});
