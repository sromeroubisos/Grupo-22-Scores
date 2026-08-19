// EL SALTO AL CLÁSICO — la regla, medida.
//
// Lo que este archivo afirma no es «el número da 0»: es que IRSE AL CLÁSICO
// CUESTA LO QUE EL JUEGO DICE QUE CUESTA. Son tres afirmaciones y conviene
// leerlas juntas, porque la gracia está en la tercera:
//
//   1. la cuenta del club que dejás se BORRA — no baja, no se congela;
//   2. su techo queda abajo para siempre, así que volver y ganar todo no
//      alcanza;
//   3. y NADA DE ESO le pasa al club que te ficha, ni a ningún otro de la
//      carrera. Es lo que separa esta regla de la bandera global que la
//      precedía, y es el único punto donde una implementación equivocada pasa
//      igual de verde en los otros dos.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState } from '../../types/captain.ts';
import { BELONGING_CAP_RIVAL_JUMP } from '../../types/currencies.ts';
import { belongingCap, belongingOf } from '../belonging.ts';
import { betrayedClubs, isBetrayedClub, isRivalJump, payRivalJump } from '../betrayal.ts';
import { belongingSituation } from '../contracts.ts';

// El clásico del rugby argentino, y un tercero que no tiene nada que ver con
// ninguno de los dos. Salen del catálogo real a propósito: un id inventado
// probaría la aritmética contra un mundo que no existe.
const CASI = 'sb-casi';
const SIC = 'sb-san-isidro-club';
const AJENO = 'sb-cuba';

/**
 * Un estado mínimo: la trayectoria, dónde estás parado y la cuenta.
 *
 * Es todo lo que estas reglas miran, y por eso el molde es chico. `titles` va
 * vacío porque el techo de los títulos es OTRA regla —se mide en
 * `currencies.test.ts`— y mezclarlas acá haría que un cambio allá pintara este
 * archivo de rojo sin que el salto al clásico hubiera cambiado.
 */
function estado(clubIds: (string | null)[], clubActual: string | null, byClub: Record<string, number> = {}): CaptainState {
    return {
        history: clubIds.map((clubId) => ({ clubId })),
        player: { clubId: clubActual, countryCode: 'ar', flags: {} },
        titles: [],
        belonging: { byClub: { ...byClub }, frozen: false },
    } as unknown as CaptainState;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LA CUENTA SE BORRA
// ═══════════════════════════════════════════════════════════════════════════

test('IRSE AL CLÁSICO BORRA LO CONSTRUIDO EN EL CLUB QUE DEJÁS', () => {
    const state = estado([CASI, CASI, CASI], SIC, { [CASI]: 41.5 });

    const linea = payRivalJump(state, CASI);

    assert.equal(belongingOf(state.belonging, CASI), 0, 'la Pertenencia del club que dejaste tenía que desaparecer');
    assert.ok(linea, 'un salto que borra cuarenta puntos tiene que dejar una línea de crónica');
});

test('el club que te ficha arranca donde arrancaría cualquier pase: en cero', () => {
    const state = estado([CASI, CASI], SIC, { [CASI]: 41.5 });
    payRivalJump(state, CASI);

    // No es que el clásico te dé nada: es que no te SACA nada de más. Un pase
    // normal también arranca de cero en el club nuevo.
    assert.equal(belongingOf(state.belonging, SIC), 0);
});

test('no explota cuando no había nada construido', () => {
    // El pibe que se va en su primera temporada. Sin línea de crónica: no hay
    // nada que contar, y el techo lo alcanza igual por otro camino.
    const state = estado([CASI], SIC);
    assert.equal(payRivalJump(state, CASI), null);
    assert.equal(belongingOf(state.belonging, CASI), 0);
});

test('borrar devuelve un ledger nuevo y no toca el viejo', () => {
    const state = estado([CASI], SIC, { [CASI]: 30 });
    const antes = state.belonging;

    payRivalJump(state, CASI);

    assert.equal(antes.byClub[CASI], 30, 'el ledger anterior se mutó: el reducer trabaja sobre clones y esto los rompe');
    assert.notEqual(state.belonging, antes);
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · EL TECHO NO VUELVE A SUBIR
// ═══════════════════════════════════════════════════════════════════════════

test('EL TECHO DEL CLUB TRAICIONADO QUEDA ABAJO, y volver no lo levanta', () => {
    // Se fue al clásico y años después volvió: la trayectoria guarda el salto.
    const state = estado([CASI, SIC, SIC], CASI);

    assert.ok(isBetrayedClub(state, CASI));
    assert.equal(
        belongingCap(belongingSituation(state, CASI)),
        BELONGING_CAP_RIVAL_JUMP,
        'el que volvió del clásico no puede tener el techo de cualquiera',
    );
});

test('AL CLUB QUE TE FICHÓ NO LE DEBÉS NADA', () => {
    // La prueba que separa esta regla de la bandera global que la precedía: con
    // un booleano por carrera, este techo también se caía.
    //
    // Se mide PAREADO —el mismo club, la misma carrera, con y sin el salto— y no
    // contra un absoluto. Un `=== 100` acá estaría midiendo de paso el techo de
    // los títulos, y se pintaría de rojo el día que ESA regla cambie sin que el
    // salto al clásico tenga nada que ver.
    const saltó = estado([CASI, SIC], SIC);
    const nuncaSaltó = estado([AJENO, SIC], SIC);

    assert.equal(isBetrayedClub(saltó, SIC), false);
    assert.equal(
        belongingCap(belongingSituation(saltó, SIC)),
        belongingCap(belongingSituation(nuncaSaltó, SIC)),
        'llegar del clásico le bajó el techo al club que te fichó',
    );
});

test('un club de la carrera que no tiene nada que ver queda intacto', () => {
    const conSalto = estado([AJENO, CASI, SIC], SIC);
    const sinSalto = estado([AJENO, CASI], CASI);

    assert.deepEqual([...betrayedClubs(conSalto)], [CASI]);
    assert.equal(
        belongingCap(belongingSituation(conSalto, AJENO)),
        belongingCap(belongingSituation(sinSalto, AJENO)),
        'el salto le movió el techo a un club que no participó',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · QUÉ ES Y QUÉ NO ES UN SALTO
// ═══════════════════════════════════════════════════════════════════════════

test('un pase a un club cualquiera NO es una traición', () => {
    const state = estado([CASI, AJENO], AJENO, { [CASI]: 40 });

    assert.equal(isRivalJump(CASI, AJENO), false);
    assert.deepEqual([...betrayedClubs(state)], []);
    assert.equal(belongingOf(state.belonging, CASI), 40, 'la cuenta del club viejo te espera donde la dejaste');
});

test('el salto se ve APENAS SE FIRMA, sin esperar a la temporada siguiente', () => {
    // La ventana: el mercado se resuelve con la temporada ya jugada, así que
    // entre el pase y la fila que lo registra hay un rato. Si la cuenta mirara
    // solo `history`, el techo del traidor tardaría un año en aparecer — y ese
    // año es justo cuando el jugador va a mirar la pantalla.
    const reciénFirmado = estado([CASI, CASI], SIC);

    assert.ok(isBetrayedClub(reciénFirmado, CASI), 'el club nuevo todavía no tiene fila y el salto ya pasó');
});

test('ir y volver cruzando el clásico traiciona a LOS DOS', () => {
    const state = estado([CASI, SIC, CASI], SIC);

    assert.deepEqual([...betrayedClubs(state)].sort(), [CASI, SIC].sort());
});

test('quedarse toda la carrera en el mismo club no traiciona a nadie', () => {
    const state = estado([CASI, CASI, CASI, CASI], CASI);
    assert.deepEqual([...betrayedClubs(state)], []);
});

test('una carrera sin club no rompe la cuenta', () => {
    // Pasa al arranque, antes de tener club, y en las temporadas sin ficha.
    const state = estado([null, null], null);
    assert.deepEqual([...betrayedClubs(state)], []);
});

test('la simetría también vale para el salto', () => {
    assert.ok(isRivalJump(CASI, SIC));
    assert.ok(isRivalJump(SIC, CASI));
    assert.equal(isRivalJump(null, SIC), false, 'sin club anterior no hay a quién traicionar');
    assert.equal(isRivalJump(CASI, CASI), false, 'quedarse no es irse');
});
