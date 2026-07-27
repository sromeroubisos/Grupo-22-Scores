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
const ROUTES: StartRouteId[] = ['amateur', 'development', 'professional'];
const COUNTRIES = ['ar', 'fr', 'nz', 'gb-eng', 'za', 'jp'];

interface Sample { pos: Position; gap: number; flat: number; flatAt: number; potential: number; peak: number; seasons: number; }

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
        for (let i = 0; i < 12; i++) {
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
                flat: flat.len, flatAt: flat.at, potential: st.player.potential,
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
    assert.ok(
        median(SAMPLES.map((s) => s.flat)) <= 3,
        `racha plana mediana global de ${median(SAMPLES.map((s) => s.flat))} temporadas`,
    );
    // Por puesto se admite una temporada más: los FORWARDS sostienen el pico más
    // tiempo porque sus atributos pican más tarde (potencia 30, tackle 30,
    // resistencia 31 contra la velocidad 25 de un back). Medido sobre 120
    // carreras por puesto, prop/hooker/lock dan 4 y los backs 3. Es la biología
    // del modelo, no una meseta rota: un pilar tiene una plenitud más larga.
    for (const pos of POSITIONS) {
        const flats = SAMPLES.filter((s) => s.pos === pos).map((s) => s.flat);
        assert.ok(
            median(flats) <= 4,
            `${pos}: racha plana mediana de ${median(flats)} temporadas`,
        );
    }
});

test('las mesetas largas son la excepción, no la regla', () => {
    const largas = SAMPLES.filter((s) => s.flat >= 5).length / SAMPLES.length;
    assert.ok(largas <= 0.3, `el ${Math.round(largas * 100)}% de las carreras tiene 5+ temporadas planas`);
});

test('cuando hay meseta larga, es el PICO de la carrera y no un desarrollo trabado', () => {
    // Es la distinción que importa y la que estaba rota. Quedarse quieto ARRIBA
    // es correcto: son los años de plenitud, y la UI los cuenta como tales
    // ("en tu techo" + el récord personal de esa temporada). Quedarse quieto a
    // mitad de camino, con puntos de techo sin usar, era el bug.
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
