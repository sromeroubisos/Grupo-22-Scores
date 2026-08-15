// Las invariantes de las cinco monedas.
//
// Estas no son pruebas de calibración: son las reglas que SON el diseño. Si
// alguna se rompe, el juego deja de ser el que se diseñó aunque todo compile —
// una cabeza que baja convierte la conmoción en un raspón, y una plata que se
// mueve en amateur convierte el rugby de club en fútbol.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BELONGING_ABROAD_FACTOR,
    BELONGING_CAP_NO_TITLES,
    BELONGING_CAP_RIVAL_JUMP,
    BELONGING_DAMPEN_FACTOR,
    BELONGING_DAMPEN_FROM,
    BELONGING_FORM_MAX,
    BELONGING_FORM_MIN,
    BELONGING_MAX,
    BELONGING_MIN,
    BELONGING_TIERS,
    HEAD_MAX,
    HEAD_PER_HIA,
} from '../../types/currencies.ts';
import {
    applyBelonging,
    belongingCap,
    belongingFormFactor,
    belongingOf,
    belongingTier,
    emptyBelonging,
    setFrozen,
} from '../belonging.ts';
import { RATING_MAX, RATING_MIN, RATING_PIVOT } from '../season-rating.ts';
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

/**
 * El contexto del club DONDE ESTÁS JUGANDO, que es el caso normal. El otro
 * —`playingHere: false`— es el club que dejaste, y solo lo mira el
 * congelamiento.
 */
function ctx(over: Partial<{
    abroad: boolean;
    hasTitleWithClub: boolean;
    jumpedToRival: boolean;
    playingHere: boolean;
}> = {}) {
    return {
        clubId: CLUB,
        abroad: false,
        hasTitleWithClub: true,
        jumpedToRival: false,
        playingHere: true,
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

test('EN EL EXTERIOR SE CONSTRUYE MENOS, PERO SE CONSTRUYE', () => {
    const afuera = belongingOf(applyBelonging(emptyBelonging(), 10, ctx({ abroad: true })), CLUB);
    const enCasa = belongingOf(applyBelonging(emptyBelonging(), 10, ctx()), CLUB);

    // LAS DOS MITADES DE LA PREMISA. Emigrar es el camino que menos construye
    // —si no, la cancha con tu nombre dejaría de hacerse en tu club— y aun así
    // construye, porque es el club donde estás jugando.
    assert.ok(afuera < enCasa, 'afuera tiene que construir menos que en tu club');
    assert.ok(afuera > 0, 'el club donde jugás construye aunque quede lejos de tu casa');

    // El valor sale de la constante y no escrito a mano: lo que este test afirma
    // es la FORMA, y uno que repite el número se pone rojo en cada recalibración
    // sin haber detectado nada (CLAUDE de captain §1.3).
    assert.equal(afuera, 10 * BELONGING_ABROAD_FACTOR);
});

// El nombre decía «arriba de 85» y el amortiguador arranca donde diga
// `BELONGING_DAMPEN_FROM`, que se movió en la 0.28.0 con los escalones. El test
// pasaba igual —90 está arriba de los dos números— y ese es justo el problema:
// un nombre que transcribe una constante sobrevive a la constante (§1.4).
test('los últimos tramos cuestan el doble, y las dos amortiguaciones se acumulan', () => {
    // Bien adentro de la zona amortiguada, sea cual sea el piso de hoy.
    const alto = BELONGING_DAMPEN_FROM + 5;

    // Solo amortiguación por altura.
    assert.equal(
        belongingOf(applyBelonging(ledgerAt(alto), 10, ctx()), CLUB),
        alto + 10 * BELONGING_DAMPEN_FACTOR,
    );
    // Altura y exterior a la vez, en ese orden.
    assert.equal(
        belongingOf(applyBelonging(ledgerAt(alto), 10, ctx({ abroad: true })), CLUB),
        alto + 10 * BELONGING_ABROAD_FACTOR * BELONGING_DAMPEN_FACTOR,
    );

    // Y JUSTO DEBAJO DEL PISO NO AMORTIGUA. Sin este lado, un amortiguador que
    // se prendiera siempre pasaría el test de arriba sin que nada avise.
    const justoAbajo = BELONGING_DAMPEN_FROM - 1;
    assert.equal(belongingOf(applyBelonging(ledgerAt(justoAbajo), 1, ctx()), CLUB), justoAbajo + 1);
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

test('EL CLUB QUE DEJASTE TE ESPERA DONDE LO DEJASTE', () => {
    // Es el estado del que firmó profesional: el reglamento lo sacó del
    // plantel, así que la cuenta de ESE club no se mueve mientras dure el
    // contrato. Ni para arriba ni para abajo.
    const frozen = setFrozen(ledgerAt(62), true);
    const dejado = ctx({ playingHere: false });
    assert.equal(applyBelonging(frozen, 20, dejado), frozen, 'congelada no puede subir');
    assert.equal(applyBelonging(frozen, -20, dejado), frozen, 'congelada tampoco puede bajar');
    assert.equal(belongingOf(frozen, CLUB), 62);
});

test('EL CLUB DONDE ESTÁS CONSTRUYE AUNQUE TENGAS CONTRATO', () => {
    // El congelamiento es una regla sobre el club que dejaste, no un apagón.
    // Antes era global, y el efecto medido era que la barra quedaba en cero
    // durante TODA la etapa profesional: 81% de las carreras del barrido se
    // retiraban en «Uno del plantel» con la Pertenencia muerta desde el día que
    // firmaron. Los hinchas del club donde jugás te ven todos los domingos.
    const frozen = setFrozen(ledgerAt(10), true);
    const after = applyBelonging(frozen, 20, ctx());
    assert.equal(belongingOf(after, CLUB), 30, 'el club donde jugás no construyó');
    assert.ok(after.frozen, 'aplicar un delta no puede descongelar el ledger');
});

test('CÓMO JUGASTE CAMBIA LO QUE CONSTRUÍS, Y NUNCA LO DESTRUYE', () => {
    // La temporada correcta vale exactamente una temporada: si el pivote no
    // valiera 1, el puntaje dejaría de ser un modulador y pasaría a ser un
    // segundo término escondido adentro del primero.
    assert.equal(belongingFormFactor(RATING_PIVOT), 1);

    // Monótona: un año mejor no puede construir menos.
    assert.ok(belongingFormFactor(8) > belongingFormFactor(7));
    assert.ok(belongingFormFactor(7) > belongingFormFactor(6));

    // Y ACOTADA POR LAS DOS PUNTAS. La de abajo es la que importa: jugar mal
    // construye menos, nunca resta. Que la hinchada te baje de escalón es
    // consecuencia de irte, no de una mala temporada.
    assert.ok(belongingFormFactor(RATING_MIN) >= BELONGING_FORM_MIN);
    assert.ok(belongingFormFactor(RATING_MIN) > 0, 'una mala temporada no puede restar Pertenencia');
    assert.ok(belongingFormFactor(RATING_MAX) <= BELONGING_FORM_MAX);
});

test('la Pertenencia es por club: mover una no toca la otra', () => {
    const dos = { byClub: { [CLUB]: 40, otro: 70 }, frozen: false };
    const after = applyBelonging(dos, 10, ctx());
    assert.equal(belongingOf(after, CLUB), 50);
    assert.equal(belongingOf(after, 'otro'), 70, 'el club viejo tiene que quedar donde estaba');
    assert.equal(belongingOf(after, 'jamas-jugue-aca'), 0);
});

/**
 * EL BORDE DE CADA ESCALÓN ES INCLUSIVO Y NO SE SALTEA NINGUNO.
 *
 * ── ESTABA ESCRITO CON LOS NÚMEROS A MANO, Y ESO ES EL §1.9 ────────────────
 * Decía `belongingTier(25) === 'titular'` diez veces, o sea que transcribía
 * `BELONGING_TIERS` en vez de leerlo. Correcto el día que se escribió y
 * silenciosamente acoplado a una calibración: cuando los escalones se
 * reanclaron a la carrera real (0.28.0), este test se puso rojo sin que
 * `belongingTier` tuviera un solo bug — estaba midiendo la tabla contra una
 * copia vieja de sí misma.
 *
 * Ahora afirma la INTENCIÓN (§1.4), que es lo que no cambia cuando la tabla se
 * recalibra: se entra con `>= min`, un pelo por debajo caés al de abajo, y los
 * escalones están ordenados y cubren la escala entera.
 */
test('los escalones caen donde tienen que caer', () => {
    // Ordenados y sin empates: dos escalones con el mismo piso harían que uno
    // fuera inalcanzable, y el bucle de `belongingTier` lo taparía en silencio.
    for (let i = 1; i < BELONGING_TIERS.length; i += 1) {
        assert.ok(
            BELONGING_TIERS[i].min > BELONGING_TIERS[i - 1].min,
            `«${BELONGING_TIERS[i].labelEs}» no está por encima de «${BELONGING_TIERS[i - 1].labelEs}»`,
        );
    }

    // El primero arranca en el piso de la moneda: no puede haber un valor
    // válido que no caiga en ningún escalón.
    assert.equal(BELONGING_TIERS[0].min, BELONGING_MIN);

    for (let i = 0; i < BELONGING_TIERS.length; i += 1) {
        const tier = BELONGING_TIERS[i];
        assert.equal(belongingTier(tier.min), tier.id, `${tier.labelEs} no empieza en su propio piso`);

        // Un pelo por debajo del piso se cae al escalón anterior. Es el borde
        // que un `>` en lugar de un `>=` rompería, y el único que hace falta
        // probar: lo de adentro del tramo ya lo cubre la monotonía.
        if (i > 0) {
            assert.equal(
                belongingTier(tier.min - 0.001),
                BELONGING_TIERS[i - 1].id,
                `justo debajo de ${tier.labelEs} tendría que estar ${BELONGING_TIERS[i - 1].labelEs}`,
            );
        }
    }

    // Las dos puntas de la escala, que son las que la pantalla dibuja.
    assert.equal(belongingTier(BELONGING_MIN), BELONGING_TIERS[0].id);
    assert.equal(belongingTier(BELONGING_MAX), BELONGING_TIERS[BELONGING_TIERS.length - 1].id);
});

/**
 * LOS TRES TOPES SON ESPEJO DE LOS ESCALONES, Y TIENEN QUE SEGUIR SIÉNDOLO.
 *
 * Cada uno existe para negar un escalón concreto, y esa relación es la que se
 * rompe sola cuando alguien mueve una tabla y no la otra. Pasó en la 0.28.0: al
 * bajar «Vitalicio» de 95 a 70, el tope de 80 del que nunca ganó nada quedó
 * ARRIBA del escalón que existe para negarle, y un jugador sin un solo título
 * podía terminar con su nombre en la cancha. No lo cazó ningún test porque
 * ninguno miraba las dos constantes juntas.
 */
test('los topes siguen negando el escalón que vienen a negar', () => {
    const pisoDe = (id: string) => BELONGING_TIERS.find((t) => t.id === id)!.min;

    // Sin un título no hay cancha con tu nombre: el tope tiene que dejarte por
    // debajo de «Vitalicio».
    assert.ok(
        BELONGING_CAP_NO_TITLES < pisoDe('vitalicio'),
        `sin títulos se llega a ${belongingTier(BELONGING_CAP_NO_TITLES)}: el tope no niega el vitalicio`,
    );

    // El que se fue al clásico rival no pasa de «Titular».
    assert.ok(
        BELONGING_CAP_RIVAL_JUMP < pisoDe('referente'),
        `yéndose al rival se llega a ${belongingTier(BELONGING_CAP_RIVAL_JUMP)}: el tope quedó flojo`,
    );

    // Y el amortiguador tiene que morder ANTES del último escalón: si arrancara
    // por encima, «los últimos cuestan el doble» no sería cierto de ninguno.
    assert.ok(
        BELONGING_DAMPEN_FROM < pisoDe('vitalicio'),
        'el amortiguador arranca después del último escalón: no amortigua nada',
    );
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
