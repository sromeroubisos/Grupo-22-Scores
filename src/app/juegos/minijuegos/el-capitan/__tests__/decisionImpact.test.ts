// EL DESENLACE NO PUEDE MENTIR.
//
// La tarjeta de después de la decisión cuenta lo que se movió restando dos
// estados, y este archivo verifica lo único que hace falta verificar de esa
// resta: que lo que la pantalla dice haya pasado, haya pasado.
//
// Es un módulo de PRESENTACIÓN, así que no hay bandas ni calibración acá — la
// disciplina del §1 del CLAUDE de captain es para el motor. Lo que se prueba es
// la traducción, y en particular los dos casos donde una traducción ingenua
// miente: la Pertenencia cuando cambiaste de club (se lleva POR CLUB, así que
// hay que mirar la cuenta del club que dejaste, que es donde el efecto aterrizó,
// y no restar dos cuentas distintas) y el desenlace que no movió nada (que tiene
// que quedarse callado en vez de fabricar un veredicto).

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../../../../features/captain/types/captain.ts';
import { createInitialCaptain } from '../../../../../features/captain/state/captain-reducer.ts';
import { decisionImpact } from '../decisionImpact.ts';

const INPUT: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

/** El nombre del club lo trae la pantalla; acá alcanza con que se note. */
const NOMBRE = (clubId: string) => `Club ${clubId}`;

function estado(): CaptainState {
    const base = createInitialCaptain(INPUT, 20260810);
    // Un club de origen resuelto, que es de donde cuelga la Pertenencia.
    base.player.clubId = base.player.clubId ?? 'ar-club';
    base.belonging.byClub[base.player.clubId] = 40;
    return base;
}

function chip(impacto: ReturnType<typeof decisionImpact>, key: string) {
    return impacto.chips.find((c) => c.key === key) ?? null;
}

test('un desenlace que no movió nada no inventa un veredicto', () => {
    const antes = estado();
    const despues = structuredClone(antes);

    const impacto = decisionImpact(antes, despues, NOMBRE);

    assert.equal(impacto.chips.length, 0);
    assert.equal(impacto.movedToClubId, null);
    assert.equal(impacto.headline, 'Lo que dejó la decisión');
});

test('la suspensión se cuenta en fechas y manda sobre el titular', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.pendingSanction += 3;
    // Una tarjeta roja también deja una temporada peor: el titular tiene que
    // elegir la sanción igual, que es lo que te saca de la cancha.
    despues.fame -= 1;

    const impacto = decisionImpact(antes, despues, NOMBRE);

    assert.equal(impacto.headline, 'Te comés 3 fechas');
    assert.deepEqual(
        chip(impacto, 'sancion'),
        { key: 'sancion', icon: '🚫', label: 'Suspensión', value: '3 fechas', tone: 'down' },
    );
    assert.equal(chip(impacto, 'cartel')?.value, '-1');
});

test('una fecha sola no se cuenta en plural', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.pendingSanction += 1;

    assert.equal(decisionImpact(antes, despues, NOMBRE).headline, 'Te comés 1 fecha');
});

test('la media y el tiempo de juego viajan con signo', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.player.ovr += 2;
    despues.pendingPlayingTime -= 1;

    const impacto = decisionImpact(antes, despues, NOMBRE);

    assert.equal(impacto.headline, 'Pegaste un salto');
    assert.equal(chip(impacto, 'media')?.value, '+2');
    assert.equal(chip(impacto, 'media')?.tone, 'up');
    assert.equal(chip(impacto, 'tiempo')?.value, '-1 escalón');
    assert.equal(chip(impacto, 'tiempo')?.tone, 'down');
});

test('el pase cuenta la Pertenencia del club que dejás, no una resta entre dos clubes', () => {
    const antes = estado();
    const viejo = antes.player.clubId!;
    const despues = structuredClone(antes);
    // Irse cuesta en el club propio, y el club nuevo arranca de cero: si la
    // ficha midiera el club de destino, un pase mostraría siempre la caída
    // entera de una cuenta que quedó intacta esperándote.
    despues.belonging.byClub[viejo] -= 6;
    despues.player.clubId = 'fr-club-nuevo';

    const impacto = decisionImpact(antes, despues, NOMBRE);

    assert.equal(impacto.headline, 'Te vas a Club fr-club-nuevo');
    assert.equal(impacto.movedToClubId, 'fr-club-nuevo');
    assert.equal(chip(impacto, 'pertenencia')?.value, '-6');
    assert.equal(chip(impacto, 'pertenencia')?.tone, 'down');
});

test('el pase a un club donde nunca jugaste no inventa una caída', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.player.clubId = 'fr-club-nuevo';

    assert.equal(chip(decisionImpact(antes, despues, NOMBRE), 'pertenencia'), null);
});

test('firmar profesional manda sobre el pase, y la plata se lee con miles', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.player.clubId = 'fr-club-nuevo';
    despues.stage = 'professional';
    despues.money += 75000;

    const impacto = decisionImpact(antes, despues, NOMBRE);

    assert.equal(impacto.headline, 'Firmaste tu primer contrato');
    // El escudo del club nuevo se dibuja igual: el titular cambia, el pase no.
    assert.equal(impacto.movedToClubId, 'fr-club-nuevo');
    assert.equal(chip(impacto, 'plata')?.value, '+US$ 75.000');
});

test('el retiro por decisión se lleva el titular por encima de todo', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.player.retired = true;
    despues.player.clubId = 'fr-club-nuevo';
    despues.pendingSanction += 4;

    assert.equal(decisionImpact(antes, despues, NOMBRE).headline, 'Se terminó acá');
});

test('el HIA se cuenta como HIA y no como puntaje de cabeza', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.damage.hia += 1;
    despues.damage.cabeza += 12;

    const impacto = decisionImpact(antes, despues, NOMBRE);

    assert.equal(impacto.headline, 'Otro golpe en la cabeza');
    assert.equal(chip(impacto, 'hia')?.value, '+1');
    assert.equal(chip(impacto, 'cabeza'), null);
});
