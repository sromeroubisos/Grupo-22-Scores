// Las invariantes de las cinco monedas.
//
// Estas no son pruebas de calibración: son las reglas que SON el diseño. Si
// alguna se rompe, el juego deja de ser el que se diseñó aunque todo compile —
// una cabeza que baja convierte la conmoción en un raspón, y una plata que se
// mueve en amateur convierte el rugby de club en fútbol.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BELONGING_CAP_NO_TITLES,
    BELONGING_CAP_RIVAL_JUMP,
    HEAD_MAX,
    HEAD_PER_HIA,
} from '../../types/currencies.ts';
import {
    applyBelonging,
    belongingCap,
    belongingOf,
    belongingTier,
    emptyBelonging,
    setFrozen,
} from '../belonging.ts';
import { addBodyDamage, addHeadDamage, emptyDamage } from '../damage.ts';
import { applyMoney, canEarnMoney } from '../money.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  🧠 CABEZA — la regla que no se negocia
// ═══════════════════════════════════════════════════════════════════════════

test('la cabeza sube y no baja NUNCA', () => {
    let damage = emptyDamage();
    damage = addHeadDamage(damage, 2);
    const golpeada = damage.cabeza;

    // Ni con un delta negativo, ni con cero, ni con un bug de signo.
    assert.equal(addHeadDamage(damage, -5).cabeza, golpeada);
    assert.equal(addHeadDamage(damage, 0).cabeza, golpeada);
    assert.equal(addHeadDamage(damage, -100).hia, damage.hia, 'un delta negativo tampoco puede descontar HIA');

    // Y sigue subiendo con los que sí valen.
    assert.ok(addHeadDamage(damage, 1).cabeza > golpeada);
});

test('cada HIA positivo suma lo suyo y queda contado', () => {
    let damage = emptyDamage();
    assert.equal(damage.cabeza, 0);
    assert.equal(damage.hia, 0);

    damage = addHeadDamage(damage);
    assert.equal(damage.cabeza, HEAD_PER_HIA);
    assert.equal(damage.hia, 1);

    damage = addHeadDamage(damage, 3);
    assert.equal(damage.cabeza, HEAD_PER_HIA * 4);
    assert.equal(damage.hia, 4);
});

test('la cabeza tiene techo y no lo pasa', () => {
    let damage = emptyDamage();
    damage = addHeadDamage(damage, 50);
    assert.equal(damage.cabeza, HEAD_MAX);
    assert.equal(damage.hia, 50, 'el techo es del daño, no de la cuenta de HIA');
});

// ═══════════════════════════════════════════════════════════════════════════
//  🦴 CUERPO — este sí se administra
// ═══════════════════════════════════════════════════════════════════════════

test('el cuerpo sube con la carga y baja con el descanso, acotado', () => {
    let damage = emptyDamage();
    damage = addBodyDamage(damage, 40);
    assert.equal(damage.cuerpo, 40);

    damage = addBodyDamage(damage, -15);
    assert.equal(damage.cuerpo, 25, 'la kinesiología tiene que poder aflojar el cuerpo');

    assert.equal(addBodyDamage(damage, -999).cuerpo, 0, 'no hay cuerpo mejor que entero');
    assert.equal(addBodyDamage(damage, 999).cuerpo, 100, 'el desgaste topea en 100');
});

// ═══════════════════════════════════════════════════════════════════════════
//  💙 PERTENENCIA — los cuatro techos y las dos amortiguaciones
// ═══════════════════════════════════════════════════════════════════════════

const CLUB = 'un-club';

function ctx(over: Partial<{ abroad: boolean; hasTitleWithClub: boolean; jumpedToRival: boolean }> = {}) {
    return {
        clubId: CLUB,
        abroad: false,
        hasTitleWithClub: true,
        jumpedToRival: false,
        ...over,
    };
}

function ledgerAt(value: number) {
    return { byClub: { [CLUB]: value }, frozen: false };
}

test('sin un título con el club, la Pertenencia topea en 80', () => {
    const sinTitulo = ctx({ hasTitleWithClub: false });
    assert.equal(belongingCap(sinTitulo), BELONGING_CAP_NO_TITLES);

    const after = applyBelonging(ledgerAt(79), 10, sinTitulo);
    assert.equal(belongingOf(after, CLUB), BELONGING_CAP_NO_TITLES);
});

test('si te fuiste al clásico rival, el techo es 49 y no se levanta ganando', () => {
    const traidor = ctx({ jumpedToRival: true });
    assert.equal(belongingCap(traidor), BELONGING_CAP_RIVAL_JUMP);

    // Ni siquiera con títulos: el techo del traidor gana sobre el de los títulos.
    const after = applyBelonging(ledgerAt(60), 30, traidor);
    assert.equal(belongingOf(after, CLUB), BELONGING_CAP_RIVAL_JUMP);
});

test('en el exterior la ganancia rinde la mitad', () => {
    const after = applyBelonging(emptyBelonging(), 10, ctx({ abroad: true }));
    assert.equal(belongingOf(after, CLUB), 5);
});

test('arriba de 85 la ganancia rinde la mitad, y las dos mitades se acumulan', () => {
    // Solo amortiguación por altura: 90 + 10/2.
    assert.equal(belongingOf(applyBelonging(ledgerAt(90), 10, ctx()), CLUB), 95);
    // Altura y exterior a la vez: 90 + 10/2/2.
    assert.equal(belongingOf(applyBelonging(ledgerAt(90), 10, ctx({ abroad: true })), CLUB), 92.5);
});

test('las pérdidas no se amortiguan ni se dividen: irse es irse', () => {
    // Ni el exterior ni la altura protegen de perder. Si protegieran, estarían
    // premiando justo lo que gasta Pertenencia.
    assert.equal(belongingOf(applyBelonging(ledgerAt(90), -10, ctx({ abroad: true })), CLUB), 80);
    assert.equal(belongingOf(applyBelonging(ledgerAt(90), -10, ctx()), CLUB), 80);
});

test('la Pertenencia no baja de cero', () => {
    assert.equal(belongingOf(applyBelonging(ledgerAt(5), -20, ctx()), CLUB), 0);
});

test('congelada no se mueve, ni para arriba ni para abajo', () => {
    // Es el estado del que firmó profesional: el reglamento lo sacó del
    // plantel, así que la cuenta del club lo espera donde la dejó.
    const frozen = setFrozen(ledgerAt(62), true);
    assert.equal(applyBelonging(frozen, 20, ctx()), frozen, 'congelada no puede subir');
    assert.equal(applyBelonging(frozen, -20, ctx()), frozen, 'congelada tampoco puede bajar');
    assert.equal(belongingOf(frozen, CLUB), 62);
});

test('la Pertenencia es por club: mover una no toca la otra', () => {
    const dos = { byClub: { [CLUB]: 40, otro: 70 }, frozen: false };
    const after = applyBelonging(dos, 10, ctx());
    assert.equal(belongingOf(after, CLUB), 50);
    assert.equal(belongingOf(after, 'otro'), 70, 'el club viejo tiene que quedar donde estaba');
    assert.equal(belongingOf(after, 'jamas-jugue-aca'), 0);
});

test('los escalones caen donde tienen que caer', () => {
    assert.equal(belongingTier(0), 'plantel');
    assert.equal(belongingTier(24), 'plantel');
    assert.equal(belongingTier(25), 'titular');
    assert.equal(belongingTier(49), 'titular');
    assert.equal(belongingTier(50), 'referente');
    assert.equal(belongingTier(74), 'referente');
    assert.equal(belongingTier(75), 'capitan');
    assert.equal(belongingTier(94), 'capitan');
    assert.equal(belongingTier(95), 'vitalicio');
    assert.equal(belongingTier(100), 'vitalicio');
});

// ═══════════════════════════════════════════════════════════════════════════
//  💵 PLATA — la puerta del amateurismo
// ═══════════════════════════════════════════════════════════════════════════

test('en amateur la plata no se mueve', () => {
    assert.equal(canEarnMoney('amateur'), false);
    assert.equal(applyMoney(0, 5000, 'amateur'), 0);
    // Y no la pone en cero: el que acaba de rescindir no pierde lo cobrado.
    assert.equal(applyMoney(1200, -300, 'amateur'), 1200);
});

test('en profesional la plata se mueve y no baja de cero', () => {
    assert.equal(canEarnMoney('professional'), true);
    assert.equal(applyMoney(1200, -300, 'professional'), 900);
    assert.equal(applyMoney(0, 18000, 'professional'), 18000);
    assert.equal(applyMoney(100, -500, 'professional'), 0, 'acá no se debe plata');
});
