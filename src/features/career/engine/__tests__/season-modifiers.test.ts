// LO QUE UNA DECISIÓN LE DEJA A LA TEMPORADA — y lo que NO le deja después.
//
// Los dos invariantes que importan acá son de la familia "el caso de reset", que
// es donde estas cosas se rompen: el modificador tiene que APAGARSE al cerrar la
// temporada (si se acumulara, dos charlas con el técnico en diez años te dejarían
// titular para siempre) y con cero escalones la cuenta tiene que quedar
// EXACTAMENTE como estaba (si no, agregar el eje habría cambiado todas las
// carreras existentes sin que nadie lo pidiera).

import test from 'node:test';
import assert from 'node:assert/strict';
import { careerReducer, getPendingEvent } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import { adjustShare, applyStatBoost, banFraction, bannedMatches, playingTimeFactor } from '../season-modifiers.ts';
import { emptyStats } from '../../types/season.ts';
import type { Player } from '../../types/player.ts';

// ── 1. Cero no toca nada ─────────────────────────────────────────────────────

test('sin escalones el factor es 1 EXACTO y la banda es la misma', () => {
    assert.equal(playingTimeFactor(0), 1);
    const banda = [0.4, 0.6] as const;
    assert.equal(adjustShare(banda, playingTimeFactor(0)), banda, 'la banda tendría que volver tal cual');
});

test('sin sanciones no se pierde nada de la temporada', () => {
    const p = { sanctions: [], seasonsPlayed: 4 } as unknown as Player;
    assert.equal(bannedMatches(p, 4), 0);
    assert.equal(banFraction(0, 22), 0);
});

test('sin premio la planilla no se toca', () => {
    const stats = emptyStats();
    stats.tries = 3;
    stats.points = 15;
    applyStatBoost(stats, { tries: 0, tackles: 0 });
    assert.equal(stats.tries, 3);
    assert.equal(stats.points, 15);
});

// ── 2. Los escalones mueven, con topes ───────────────────────────────────────

test('los escalones mueven en el sentido que dicen', () => {
    assert.ok(playingTimeFactor(2) > 1);
    assert.ok(playingTimeFactor(-2) < 1);
    assert.ok(playingTimeFactor(3) > playingTimeFactor(1));
});

test('el factor tiene tope: ningún empujón te hace jugar el doble', () => {
    assert.ok(playingTimeFactor(50) <= 1.45, 'sin tope, una decisión reemplazaría al escalafón de plantel');
    assert.ok(playingTimeFactor(-50) >= 0.55, 'el piso no es cero: el que cae en desgracia juega menos, no desaparece');
});

test('la fracción de fechas nunca llega al calendario completo', () => {
    const [lo, hi] = adjustShare([0.8, 0.9], playingTimeFactor(3));
    assert.ok(hi <= 0.95, `nadie juega el ${Math.round(hi * 100)}% de un calendario`);
    assert.ok(lo <= hi, 'la banda quedó al revés');
});

test('la banda no se da vuelta ni se sale de rango con escalones negativos', () => {
    const [lo, hi] = adjustShare([0.05, 0.15], playingTimeFactor(-3));
    assert.ok(lo >= 0.03 && lo <= hi && hi <= 0.95);
});

// ── 3. La suspensión ─────────────────────────────────────────────────────────

test('la suspensión cuenta SOLO en su temporada', () => {
    // Es el caso de reset: la fecha que te comés es la de este año. Si contara
    // siempre, una roja a los 22 te seguiría descontando partidos a los 34.
    const p = {
        seasonsPlayed: 5,
        sanctions: [
            { season: 5, age: 23, card: 'roja' as const, matches: 2, reason: 'x' },
            { season: 5, age: 23, card: null, matches: 1, reason: 'y' },
            { season: 4, age: 22, card: 'amarilla' as const, matches: 3, reason: 'vieja' },
        ],
    } as unknown as Player;
    assert.equal(bannedMatches(p, 5), 3, 'las dos de esta temporada se suman');
    assert.equal(bannedMatches(p, 6), 0, 'la próxima temporada arranca limpia');
});

test('una amarilla no cuesta partidos', () => {
    const p = { sanctions: [{ season: 2, age: 20, card: 'amarilla' as const, matches: 0, reason: 'x' }] } as unknown as Player;
    assert.equal(bannedMatches(p, 2), 0, 'diez minutos afuera no son una fecha');
});

test('la suspensión no puede llevarse media temporada de más', () => {
    assert.ok(banFraction(30, 22) <= 0.5, 'sin tope, una citación absurda borraría el año');
    assert.ok(banFraction(2, 22) > 0 && banFraction(2, 22) < 0.15);
    // Más fechas suspendidas, más temporada perdida.
    assert.ok(banFraction(4, 22) > banFraction(2, 22));
});

// ── 4. La planilla ───────────────────────────────────────────────────────────

test('el try del premio suma puntos por la tabla del deporte', () => {
    const stats = emptyStats();
    const puntosAntes = stats.points;
    applyStatBoost(stats, { tries: 2, tackles: 3 });
    assert.equal(stats.tries, 2);
    assert.equal(stats.tackles, 3);
    assert.equal(stats.points - puntosAntes, 10, 'dos tries son diez puntos y nadie los suma a mano');
});

// ── 5. De punta a punta, con el motor ────────────────────────────────────────

/** Lleva una carrera nueva hasta la primera temporada jugable, sin decidir nada. */
function hastaJugarTemporada(seed: number): CareerState {
    let state = careerReducer({} as CareerState, {
        type: 'START',
        input: { position: 'lock', nationalityCountryCode: 'ar' },
        seed,
    });
    let guard = 0;
    while (state.phase !== 'season' && guard++ < 12) {
        const event = getPendingEvent(state);
        if (!event) break;
        // Se elige siempre la primera opción: lo que se mide es la temporada, no
        // la decisión.
        state = careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id });
    }
    return state;
}

test('una suspensión cuesta partidos DE VERDAD, con todo lo demás igual', () => {
    const base = hastaJugarTemporada(31415);
    if (base.phase !== 'season') return; // la semilla trajo mercado: no hay nada que medir

    const limpio = careerReducer(base, { type: 'ADVANCE' });

    const suspendido: CareerState = structuredClone(base);
    suspendido.player.sanctions.push({
        season: suspendido.player.seasonsPlayed,
        age: suspendido.player.age,
        card: 'roja',
        matches: 4,
        reason: 'Tackle alto',
    });
    const conSancion = careerReducer(suspendido, { type: 'ADVANCE' });

    const antes = limpio.seasons[limpio.seasons.length - 1];
    const despues = conSancion.seasons[conSancion.seasons.length - 1];
    assert.ok(
        despues.matches < antes.matches,
        `con cuatro fechas de suspensión jugó ${despues.matches} y sin sanción ${antes.matches}`,
    );
    // Y la planilla acompaña: no se pierden partidos con los mismos tackles.
    assert.ok(despues.stats.tackles <= antes.stats.tackles, 'jugó menos y hizo los mismos tackles');
});

test('el empujón de minutos se APAGA al cerrar la temporada', () => {
    const base = hastaJugarTemporada(27182);
    if (base.phase !== 'season') return;

    const empujado: CareerState = structuredClone(base);
    empujado.pendingPlayingTime = 3;
    const despues = careerReducer(empujado, { type: 'ADVANCE' });

    assert.equal(despues.pendingPlayingTime, 0, 'el escalón se acumularía de por vida');
    assert.deepEqual(despues.pendingStatBoost, { tries: 0, tackles: 0 }, 'el premio de planilla también se apaga');
});

test('más escalones, más partidos: el eje hace lo que dice', () => {
    const base = hastaJugarTemporada(16180);
    if (base.phase !== 'season') return;

    const arriba: CareerState = structuredClone(base);
    arriba.pendingPlayingTime = 3;
    const abajo: CareerState = structuredClone(base);
    abajo.pendingPlayingTime = -3;

    const conMas = careerReducer(arriba, { type: 'ADVANCE' });
    const conMenos = careerReducer(abajo, { type: 'ADVANCE' });

    assert.ok(
        conMas.seasons[conMas.seasons.length - 1].matches > conMenos.seasons[conMenos.seasons.length - 1].matches,
        'tres escalones arriba tendrían que dar más partidos que tres abajo',
    );
});
