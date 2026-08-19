// La otra bandera: quién te llama, QUÉ PASA SI ACEPTÁS, y que la tarjeta lo diga.
//
// ── POR QUÉ ESTE ARCHIVO CRECIÓ (0.33.0), Y ES EL §1.7 EN ESTADO PURO ──────
// Tenía cinco tests y los cinco eran buenos: verificaban que nunca te llamara tu
// propia unión, que la recarga no cambiara la bandera, que el `resultText` no se
// moviera del digest. Ninguno preguntaba si CAMBIAR DE BANDERA CAMBIA DE BANDERA.
//
// No lo preguntaban porque el nombre del archivo ya lo daba por hecho. Y no lo
// hacía: la opción de aceptar pagaba fama, plata y un flag que no leía nadie, así
// que el jugador cantaba otro himno y la convocatoria lo seguía midiendo contra
// la vara de su unión de origen, para siempre. La suite estaba verde.
//
// El instrumento contestaba la pregunta que tenía escrita —«¿la tarjeta dice bien
// quién te llama?»— y no la que su nombre prometía. De acá para abajo están las
// dos preguntas, y la segunda primero.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import { createInitialCaptain } from '../../state/captain-reducer.ts';
import { applyDecision } from '../../engine/apply-decision.ts';
import { canRepresent, targetUnion } from '../../engine/eligibility.ts';
import { createRng } from '../../engine/random.ts';
import { getEvent } from './index.ts';
import { buildFlagSwitchEvent, callingUnionOf, FLAG_SWITCH_EVENT_ID } from './national.ts';
import { hasUnion, unionName } from '../catalogs.ts';

const ARGENTINO: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

function carrera(seed = 12345): CaptainState {
    return createInitialCaptain(ARGENTINO, seed);
}

// ═══════════════════════════════════════════════════════════════════════════
//  LA DECISIÓN HACE LO QUE DICE
// ═══════════════════════════════════════════════════════════════════════════

function elegir(state: CaptainState, optionId: string) {
    const card = buildFlagSwitchEvent(state);
    return applyDecision(state, card, optionId, createRng(1));
}

test('aceptar te ata a la unión nueva: a ELLA aspirás desde ahora, y no a la tuya', () => {
    const state = carrera();
    const llama = callingUnionOf(state)!;
    assert.equal(targetUnion(state.national.eligibility), 'ar', 'antes aspirabas a la tuya');

    elegir(state, 'aceptar');

    assert.equal(targetUnion(state.national.eligibility), llama);
    assert.ok(
        canRepresent(state.national.eligibility, llama),
        'sin claim la unión nueva te rechaza el mismo año que te nacionalizó',
    );
});

test('es para siempre, que es lo que la tarjeta promete: la tuya deja de estar disponible', () => {
    const state = carrera();
    elegir(state, 'aceptar');
    assert.equal(canRepresent(state.national.eligibility, 'ar'), false);
});

test('decir que no NO te mueve la bandera', () => {
    const state = carrera();
    elegir(state, 'decir-que-no');
    assert.equal(targetUnion(state.national.eligibility), 'ar');
    assert.equal(state.national.eligibility.capturedBy, null);
    assert.equal(state.national.eligibility.claims.length, 1, 'no se gana un claim por decir que no');
});

test('el escalón no se hereda: los carriles de la unión vieja no son tuyos desde hoy', () => {
    const state = carrera();
    state.national.track = 'a-xv';
    state.national.bestTrack = 'a-xv';
    elegir(state, 'aceptar');
    assert.equal(state.national.track, 'club');
    assert.equal(state.national.bestTrack, 'a-xv', 'lo que YA jugaste sigue siendo tuyo en la vitrina');
});

// ═══════════════════════════════════════════════════════════════════════════
//  LA TARJETA DICE CONTRA QUÉ ESTÁS CAMBIANDO
// ═══════════════════════════════════════════════════════════════════════════

test('la tarjeta trae el código de la unión que llama, para que se dibuje su bandera', () => {
    const card = buildFlagSwitchEvent(carrera());
    assert.ok(card.unionCode, 'sin código no hay bandera que dibujar');
    assert.ok(hasUnion(card.unionCode!), 'el código tiene que ser una unión del catálogo');
    assert.ok(
        card.text.startsWith(unionName(card.unionCode!)),
        `el texto tiene que nombrarla: «${card.text}»`,
    );
});

test('nunca te llama tu propia unión: eso no sería cambiar de bandera', () => {
    // Varias semillas, porque el último escalón sortea por hash de la semilla.
    for (const seed of [1, 2, 3, 7, 99, 12345, 987654]) {
        assert.notEqual(callingUnionOf(carrera(seed)), 'ar', `semilla ${seed}`);
    }
});

test('la misma carrera recibe SIEMPRE el mismo llamado: una recarga no cambia la bandera', () => {
    const state = carrera(4242);
    assert.equal(callingUnionOf(state), callingUnionOf(carrera(4242)));
});

test('si ya te ganaste el derecho con otra unión, la que llama es ÉSA y no una sorteada', () => {
    const state = carrera();
    // Cinco temporadas registrado en Francia: el 8.1(c) del reglamento.
    state.national.eligibility.claims.push({ union: 'fr', route: 'registration-60m' });
    assert.equal(callingUnionOf(state), 'fr');
});

test('armar la tarjeta NO toca los desenlaces, que son lo único que se persiste', () => {
    const catalogo = getEvent(FLAG_SWITCH_EVENT_ID);
    const card = buildFlagSwitchEvent(carrera());

    assert.ok(catalogo, 'la tarjeta tiene que seguir estando en el catálogo');
    assert.equal(card.id, catalogo!.id);
    assert.deepEqual(
        card.options.map((o) => o.outcomes.map((x) => x.resultText)),
        catalogo!.options.map((o) => o.outcomes.map((x) => x.resultText)),
        'cambiar un resultText mueve el digest congelado y obliga a subir el motor',
    );
    assert.deepEqual(card.options.map((o) => o.id), catalogo!.options.map((o) => o.id));
});
