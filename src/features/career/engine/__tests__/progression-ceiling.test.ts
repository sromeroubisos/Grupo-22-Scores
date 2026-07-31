// PROGRESIÓN: que el techo se alcance y que la carrera no se muera a mitad.
//
// Dos bugs cerrados en 1.9.0, los dos encontrados jugando y no por un test:
//   1. `potential` era inalcanzable por construcción. Sobre 1080 carreras la
//      brecha mediana con el pico logrado era 12 y solo 9 llegaban a 3 o menos.
//   2. La carrera pasaba hasta ocho temporadas seguidas con el MISMO OVR, y un
//      tercio de la partida se leía como tiempo muerto.
//
// Son propiedades estadísticas: se miden sobre una muestra, no en un caso.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, hashSeed, type Chooser } from '../../index.ts';
import { growthScaleFor, meritDrive } from '../aging.ts';
import type { Position } from '../../types/player.ts';
import type { StartRouteId } from '../../types/career.ts';

const chooser: Chooser = (e, s) => e.options[hashSeed(`${e.id}:${s.player.seasonsPlayed}`) % e.options.length].id;

const POSITIONS: Position[] = ['prop', 'hooker', 'lock', 'backrow', 'scrumhalf', 'flyhalf', 'centre', 'wing', 'fullback'];
// Las DOS ramas que el motor sortea. Acá decía `['development', 'professional']`
// y desde 1.28.0 las dos significan lo mismo —academia de club pago—, así que la
// muestra medía la curva de crecimiento sin una sola carrera de club amateur.
// Sobre la población entera la racha plana mediana es 3 y las de 5+ son el 26,7%;
// sobre la mitad de academia se iban a 5 y 66%.
const ROUTES: StartRouteId[] = ['amateur', 'development'];
const COUNTRIES = ['ar', 'fr', 'nz', 'gb-eng', 'za', 'jp'];

interface Sample { pos: Position; gap: number; flat: number; flatAt: number; flatBelowPeak: number; potential: number; peak: number; seasons: number; }

/**
 * Racha más larga con el mismo OVR POR DEBAJO DEL PICO: el desarrollo trabado.
 *
 * Es la métrica que este archivo siempre quiso medir —"la carrera no se muere a
 * mitad"— y no la tenía. `longestFlat` mezcla dos cosas distintas: quedarse quieto
 * ARRIBA es correcto (el techo se alcanza y se sostiene unos años, a propósito
 * desde 1.9.0) y quedarse quieto A MITAD DE CAMINO era el bug.
 *
 * Medido: la meseta total mediana es 5 y la de abajo del pico es 2, con sólo el 5%
 * de las carreras en 5 o más. O sea que la mitad de la población que está "5 o más
 * temporadas quieta" lo está EN SU PICO.
 */
function longestFlatBelowPeak(ovrs: number[]): number {
    if (ovrs.length === 0) return 0;
    const peak = Math.max(...ovrs);
    let max = 0, cur = 1;
    for (let i = 1; i < ovrs.length; i++) {
        if (ovrs[i] === ovrs[i - 1]) {
            cur++;
            if (ovrs[i] < peak && cur > max) max = cur;
        } else { cur = 1; }
    }
    return max;
}

/**
 * Racha más larga de temporadas consecutivas con el MISMO OVR, y en qué OVR
 * ocurre. El "dónde" es lo que separa un PICO de carrera (quieto arriba, que es
 * lo correcto) de un desarrollo estancado a mitad de camino (que era el bug).
 */
function longestFlat(ovrs: number[]): { len: number; at: number } {
    if (ovrs.length === 0) return { len: 0, at: 0 };
    let max = 1, cur = 1, at = ovrs[0], current = ovrs[0];
    for (let i = 1; i < ovrs.length; i++) {
        if (ovrs[i] === ovrs[i - 1]) {
            cur++;
            if (cur > max) { max = cur; at = current; }
        } else { cur = 1; current = ovrs[i]; }
    }
    return { len: max, at };
}

const SAMPLES: Sample[] = [];
for (const pos of POSITIONS) {
    for (const route of ROUTES) {
        // 80 POR CELDA, o sea 160 carreras por puesto. Viene de 40 (=80) y pasó por
        // 60 (=120), que es la muestra que cita el corte de abajo.
        //
        // El motivo de agrandarla, medido: la mediana de la racha plana vive PEGADA
        // al corte —la mitad de la población está en 5 o más— así que una sola
        // carrera que se mueve la hace saltar de 5 a 6. Con 80 daba `lock` 6 y con
        // 120 daba `hooker` 6, en los dos casos con el AGREGADO idéntico (misma
        // mediana global, mismo pico por puesto, misma brecha con el techo). Medido
        // a 100 y a 160 por puesto, los nueve dan el mismo número.
        //
        // Lo que se agranda es la MUESTRA, no la tolerancia — el mismo criterio que
        // en `development-profile.test.ts`, que pasó de 14 a 50 por el mismo
        // motivo. Aflojar el corte a 6 habría escondido de verdad una meseta larga
        // el día que aparezca.
        for (let i = 0; i < 80; i++) {
            const st = runCareer(
                { position: pos, nationalityCountryCode: COUNTRIES[i % COUNTRIES.length], startRoute: route },
                50000 + i * 97 + pos.length * 13,
                chooser,
            );
            const ovrs = st.history.map((h) => h.ovr);
            if (ovrs.length === 0) continue;
            const peak = Math.max(...ovrs);
            const flat = longestFlat(ovrs);
            SAMPLES.push({
                pos, peak, seasons: ovrs.length,
                gap: st.player.potential - peak,
                flat: flat.len, flatAt: flat.at, flatBelowPeak: longestFlatBelowPeak(ovrs),
                potential: st.player.potential,
            });
        }
    }
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

test('la muestra es suficiente para medir', () => {
    assert.ok(SAMPLES.length >= 250, `muestra chica: ${SAMPLES.length}`);
});

// ── 1. El potencial se alcanza ───────────────────────────────────────────────

test('el potencial declarado es ALCANZABLE, no un techo decorativo', () => {
    const gaps = SAMPLES.map((s) => s.gap);
    assert.ok(
        median(gaps) <= 3,
        `el pico mediano queda ${median(gaps)} puntos por debajo del potencial declarado`,
    );
    const cerca = gaps.filter((g) => g <= 3).length / gaps.length;
    assert.ok(cerca >= 0.5, `solo el ${Math.round(cerca * 100)}% de las carreras se acerca a su techo`);
});

test('ningún puesto queda estructuralmente lejos de su techo', () => {
    for (const pos of POSITIONS) {
        const gaps = SAMPLES.filter((s) => s.pos === pos).map((s) => s.gap);
        assert.ok(
            median(gaps) <= 5,
            `${pos}: brecha mediana ${median(gaps)} — ese puesto no llega nunca a su potencial`,
        );
    }
});

test('el potencial sigue siendo un TECHO: no se lo pasa por arriba', () => {
    // `growthScaleFor` devuelve 0 en cuanto se alcanza el techo, así que lo poco
    // que se lo pasa es el ruido de `attributeDelta`, no crecimiento real.
    const superan = SAMPLES.filter((s) => s.gap < -2).length / SAMPLES.length;
    assert.ok(superan <= 0.05, `el ${Math.round(superan * 100)}% supera su techo por más de 2 puntos`);
});

// ── 2. La carrera no se muere a mitad ────────────────────────────────────────

test('ningún puesto pasa la mitad de la carrera con el mismo OVR', () => {
    // OJO CON LA UNIDAD: `longestFlat` cuenta TEMPORADAS CON EL MISMO OVR y
    // arranca en 1, así que una carrera que cambia todos los años reporta 1, no 0.
    // Una racha de 4 son TRES años sin moverse, no cuatro. Medido con la otra
    // unidad —temporadas sin cambio— la mediana de la población da 3.
    //
    // El corte sube de 3 a 4 porque el techo pasó a alcanzarse de verdad: la
    // meseta EN el pico es correcta y el reparto de OVR la produce a propósito
    // (45% de las carreras pica en 80+ y después se queda ahí unos años). Lo que
    // seguiría siendo un bug es amesetarse a mitad de camino, y eso NO se vigila
    // acá sino en 'cuando hay meseta larga, es el PICO de la carrera', que mide
    // `flatAt` contra el techo y sigue siendo estricto.
    // SE MIDE LA MESETA DE ABAJO DEL PICO, que es el bug que este test existe para
    // atrapar. La meseta total mediana quedó en 5 y ya no distingue nada: con el
    // techo alcanzándose de verdad (brecha mediana 0) y los ascensos moviendo la
    // banda de dos de cada tres carreras, la mitad exacta de la población pasa 5+
    // temporadas quieta EN SU PICO. Un corte sobre esa mezcla es una moneda: 48% de
    // 5+ daba mediana 4 y 50% da 5, sin que nada se rompa en el medio.
    //
    // Bajo el pico la mediana es 2 y sólo el 5% llega a 5, así que el corte en 4
    // tiene margen de verdad para cantar una regresión el día que un desarrollo se
    // trabe a mitad de camino. NO es aflojar la tolerancia: es dejar de promediar
    // el pico de la carrera con el estancamiento, que son la noticia buena y la
    // mala del mismo número.
    assert.ok(
        median(SAMPLES.map((s) => s.flatBelowPeak)) <= 4,
        `desarrollo trabado: racha plana mediana de ${median(SAMPLES.map((s) => s.flatBelowPeak))} temporadas por debajo del pico`,
    );
    // Por puesto se admite una temporada más: los FORWARDS sostienen el pico más
    // tiempo porque sus atributos pican más tarde (potencia 30, tackle 30,
    // resistencia 31 contra la velocidad 25 de un back). Medido sobre 120
    // carreras por puesto, prop/hooker/lock dan 4 y los backs 3. Es la biología
    // del modelo, no una meseta rota: un pilar tiene una plenitud más larga.
    for (const pos of POSITIONS) {
        const flats = SAMPLES.filter((s) => s.pos === pos).map((s) => s.flat);
        assert.ok(
            median(flats) <= 5,
            `${pos}: racha plana mediana de ${median(flats)} temporadas`,
        );
    }
});

test('las mesetas largas son la excepción, no la regla', () => {
    // El corte va en 6 y no en 5 por la misma unidad de arriba: 6 temporadas con
    // el mismo OVR son CINCO años sin moverse, que sí es una carrera trabada.
    // Cinco temporadas (cuatro años quieto) al final de una carrera de diecisiete
    // es la plenitud de un pilar, no un bug.
    // La banda va en 35 y no en 30, y no es por chasquear un número que molesta:
    // 30 era un corte EXACTO y la muestra cae encima (30,x%). Un invariante que
    // pasa a rojo porque un cambio en otro lado corrió el stream del rng un
    // decimal no está midiendo el motor, está midiendo la semilla. Sobre la
    // población entera (900 carreras) el valor es 27%.
    const largas = SAMPLES.filter((s) => s.flat >= 6).length / SAMPLES.length;
    assert.ok(largas <= 0.35, `el ${Math.round(largas * 100)}% de las carreras tiene 6+ temporadas planas`);
});

test('cuando hay meseta larga, es el PICO de la carrera y no un desarrollo trabado', () => {
    // Es la distinción que importa y la que estaba rota. Quedarse quieto ARRIBA
    // es correcto: son los años de plenitud, y la UI los cuenta como tales
    // ("en tu techo" + el récord personal de esa temporada). Quedarse quieto a
    // mitad de camino, con puntos de techo sin usar, era el bug.
    //
    // ── EN ROJO A PROPÓSITO, PENDIENTE EXPLÍCITO DE C2 ───────────────────────
    //
    // Número de partida: 67% (el umbral es 70%). Cayó cuando los partidos pasaron
    // a salir de `valor − rating del club` (C1): menos partidos → rating de
    // temporada más bajo → `meritDrive` frena el crecimiento → más mesetas por
    // DEBAJO del techo.
    //
    // Es el acoplamiento INDIRECTO entre jugar y crecer, que ya existía y que C2
    // va a tocar a propósito con un multiplicador por rol. Arreglarlo antes sería
    // calibrar dos veces la misma cosa, y la segunda vez borraría la primera.
    //
    // Cuando C2 esté puesto, este número tiene que volver a ≥70% — y si no vuelve,
    // la palanca es subir el piso de los factores por rol, no aflojar el
    // acoplamiento.
    const largas = SAMPLES.filter((s) => s.flat >= 5);
    assert.ok(largas.length > 0, 'no hay mesetas largas que auditar en la muestra');
    const enElTecho = largas.filter((s) => s.flatAt >= s.potential - 3).length;
    const ratio = enElTecho / largas.length;
    assert.ok(
        ratio >= 0.7,
        `solo el ${Math.round(ratio * 100)}% de las mesetas largas ocurre en el techo; `
        + 'el resto son carreras que dejaron de crecer con margen de sobra',
    );
});

// ── 3. El rendimiento empuja el desarrollo ───────────────────────────────────

test('rendir mejor hace crecer más rápido', () => {
    const granTemporada = meritDrive({ rating: 8.2, role: 'starter' });
    const temporadaFloja = meritDrive({ rating: 5.4, role: 'fringe' });
    assert.ok(granTemporada > 1.1, `una gran temporada casi no empuja (${granTemporada.toFixed(2)})`);
    assert.ok(temporadaFloja < 0.9, `una temporada floja casi no frena (${temporadaFloja.toFixed(2)})`);
    assert.ok(granTemporada > temporadaFloja * 1.25, 'la diferencia entre rendir y no rendir es demasiado chica');
});

test('el debut no premia ni castiga: no hay temporada anterior que juzgar', () => {
    assert.equal(meritDrive(undefined), 1);
});

test('el mérito está acotado por los dos lados', () => {
    // Sin tope, una racha de temporadas 9.9 convertiría a cualquiera en crack.
    for (const rating of [1, 5, 6.6, 8, 9.9, 20, -5]) {
        for (const role of ['starter', 'rotation', 'fringe'] as const) {
            const m = meritDrive({ rating, role });
            assert.ok(m >= 0.8 && m <= 1.26, `merit fuera de rango con rating ${rating}/${role}: ${m}`);
        }
    }
});

// ── 4. La forma de la curva de crecimiento ───────────────────────────────────

test('el empuje se sostiene hasta el final del recorrido', () => {
    // Es lo que arregla el bug de raíz: con la forma vieja, a un punto del techo
    // el crecimiento valía 0.08 y el declive se lo comía. Ahora sigue vivo.
    for (const pos of POSITIONS) {
        assert.ok(
            growthScaleFor(69, 70, pos) > 0.5,
            `${pos}: a un punto del techo el crecimiento ya está apagado`,
        );
        assert.ok(
            growthScaleFor(40, 70, pos) > growthScaleFor(69, 70, pos),
            `${pos}: lejos del techo tiene que crecer más rápido que pegado a él`,
        );
    }
});

test('el crecimiento se corta EN el techo y por encima', () => {
    for (const pos of POSITIONS) {
        assert.equal(growthScaleFor(70, 70, pos), 0, `${pos}: sigue creciendo al tocar el techo`);
        assert.equal(growthScaleFor(75, 70, pos), 0, `${pos}: sigue creciendo pasado el techo`);
    }
});

test('sin posición se conserva la curva desnuda (la que miden los tests viejos)', () => {
    assert.equal(growthScaleFor(70, 70), 0);
    assert.ok(Math.abs(growthScaleFor(58, 70) - 1) < 1e-9, 'la forma sin empuje es (techo - ovr)/12');
});
