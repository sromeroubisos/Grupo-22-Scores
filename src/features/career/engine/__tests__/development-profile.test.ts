// PERFILES DE DESARROLLO — que las carreras dejen de tener todas la misma forma.
//
// Lo que estos tests protegen no es "el early es mejor" ni al revés, sino que
// los tres perfiles sean CAMINOS DISTINTOS al mismo tipo de destino: el early
// llega antes, el late llega más tarde, y ninguno llega sistemáticamente más
// arriba. Si un perfil domina, deja de ser una forma de carrera y pasa a ser una
// tirada afortunada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, hashSeed, createRng, type Chooser } from '../../index.ts';
import {
    DEVELOPMENT_PROFILES, peakShiftOf, profileDistribution, profileGrowthFactor,
    profileRevealText, rollDevelopmentProfile, type DevelopmentProfile,
} from '../development-profile.ts';
import { getPosition } from '../../data/positions.ts';
import type { Position } from '../../types/player.ts';
import type { StartRouteId } from '../../types/career.ts';

const chooser: Chooser = (e, s) => e.options[hashSeed(`${e.id}:${s.player.seasonsPlayed}`) % e.options.length].id;

const FORWARDS: Position[] = ['prop', 'hooker', 'lock', 'backrow'];
const BACKS: Position[] = ['scrumhalf', 'flyhalf', 'centre', 'wing', 'fullback'];
// LAS DOS RAMAS QUE EL MOTOR SORTEA, no las dos etiquetas viejas. Acá decía
// `['development', 'professional']`, y desde 1.28.0 las DOS significan lo mismo
// —arrancar en la academia de un club pago—, así que la muestra se quedaba sin
// ninguna carrera de club amateur y medía la curva de desarrollo sobre la mitad
// privilegiada de la población.
const ROUTES: StartRouteId[] = ['amateur', 'development'];
const COUNTRIES = ['ar', 'fr', 'nz', 'gb-eng', 'za', 'jp'];

interface Row { profile: DevelopmentProfile; group: 'forward' | 'back'; peak: number; peakAge: number; ovrAt: (age: number) => number; }

const ROWS: Row[] = [];
for (const [group, positions] of [['forward', FORWARDS], ['back', BACKS]] as const) {
    for (const pos of positions) {
        for (const route of ROUTES) {
            // 50 y no 14 desde 1.13.0. El reparto de techos se ensanchó, y con
            // él la varianza del PICO dentro de cada perfil: con 14 por celda la
            // mediana de ~70 muestras saltaba lo suficiente como para que el
            // test de "ningún perfil llega más arriba" fallara por ruido y no
            // por comportamiento. Se verificó que es ruido: con muestra grande
            // el invariante se cumple, y la diferencia observada no era
            // monótona con el ensanche (8 puntos con lift 0,25 y 6 con 0,43).
            // Lo que se agranda es la muestra, NO la tolerancia: el invariante
            // sigue siendo el mismo.
            //
            // 120 y no 50 desde el sistema argentino de dos ramas. El catálogo
            // doméstico argentino domina el pool de clubes del motor, así que
            // reescribirlo movió las medianas ~2 puntos y `late30 >= early30`
            // pasaba a fallar por un punto. Medido: con 50 por celda cruza, con
            // 80 cruza, y con 100, 120 y 150 el invariante se cumple — o sea era
            // el borde de la muestra, no la curva. Se verificó además que el
            // cruce aparecía igual sacando Argentina de la lista de países: no lo
            // causó el cambio, lo destapó.
            for (let i = 0; i < 120; i++) {
                const st = runCareer(
                    { position: pos, nationalityCountryCode: COUNTRIES[i % COUNTRIES.length], startRoute: route },
                    77000 + i * 89 + pos.length * 31,
                    chooser,
                );
                const h = st.history;
                if (h.length === 0) continue;
                const ovrs = h.map((x) => x.ovr);
                const peak = Math.max(...ovrs);
                ROWS.push({
                    profile: st.player.developmentProfile,
                    group,
                    peak,
                    peakAge: h[ovrs.indexOf(peak)].age,
                    ovrAt: (age) => h.find((x) => x.age === age)?.ovr ?? 0,
                });
            }
        }
    }
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const medianOf = (rows: Row[], pick: (r: Row) => number) => median(rows.map(pick).filter((v) => v > 0));

test('la muestra cubre los tres perfiles', () => {
    for (const p of DEVELOPMENT_PROFILES) {
        assert.ok(ROWS.filter((r) => r.profile === p).length >= 20, `muestra chica para ${p}`);
    }
});

// ── Reparto por puesto ───────────────────────────────────────────────────────

test('el reparto NO es plano: los backs tiran a early y los forwards a late', () => {
    const back = profileDistribution('back');
    const forward = profileDistribution('forward');
    assert.ok(back.early > back.late, 'un back debería tender a madurar temprano');
    assert.ok(forward.late > forward.early, 'un forward debería tender a madurar tarde');
    // `normal` sigue siendo el caso mayoritario en los dos.
    assert.ok(back.normal >= back.early && forward.normal >= forward.late);
});

test('el sorteo respeta el reparto declarado del puesto', () => {
    for (const [pos, group] of [['wing', 'back'], ['prop', 'forward']] as const) {
        const counts: Record<string, number> = { early: 0, normal: 0, late: 0 };
        for (let i = 0; i < 600; i++) counts[rollDevelopmentProfile(pos, createRng(9000 + i))]++;
        const dist = profileDistribution(group);
        const total = dist.early + dist.normal + dist.late;
        for (const p of DEVELOPMENT_PROFILES) {
            const esperado = (dist[p] / total) * 600;
            assert.ok(
                Math.abs(counts[p] - esperado) < esperado * 0.35 + 20,
                `${pos}/${p}: salieron ${counts[p]}, se esperaban ~${Math.round(esperado)}`,
            );
        }
    }
});

test('el sorteo es determinístico', () => {
    for (const pos of [...FORWARDS, ...BACKS]) {
        assert.equal(rollDevelopmentProfile(pos, createRng(4242)), rollDevelopmentProfile(pos, createRng(4242)));
    }
});

// ── La forma de cada curva ───────────────────────────────────────────────────

test('el early va adelante de joven y el late lo pasa de grande', () => {
    const early22 = medianOf(ROWS.filter((r) => r.profile === 'early'), (r) => r.ovrAt(22));
    const late22 = medianOf(ROWS.filter((r) => r.profile === 'late'), (r) => r.ovrAt(22));
    assert.ok(early22 > late22 + 2, `a los 22 el early (${early22}) tiene que estar claramente sobre el late (${late22})`);

    const early30 = medianOf(ROWS.filter((r) => r.profile === 'early'), (r) => r.ovrAt(30));
    const late30 = medianOf(ROWS.filter((r) => r.profile === 'late'), (r) => r.ovrAt(30));
    assert.ok(late30 >= early30, `a los 30 el late (${late30}) no debería estar por debajo del early (${early30})`);
});

test('el late pica más tarde que el early', () => {
    const earlyAge = median(ROWS.filter((r) => r.profile === 'early').map((r) => r.peakAge));
    const lateAge = median(ROWS.filter((r) => r.profile === 'late').map((r) => r.peakAge));
    assert.ok(lateAge > earlyAge, `edad de pico: early ${earlyAge}, late ${lateAge}`);
});

test('NINGÚN perfil llega sistemáticamente más arriba', () => {
    // Se compara DENTRO del grupo: los forwards tienen más recorrido de OVR y
    // además tiran a `late`, así que mezclarlos hace parecer que el late es
    // mejor cuando lo que pasa es que hay más pilares entre los late.
    for (const group of ['forward', 'back'] as const) {
        const peaks = DEVELOPMENT_PROFILES.map((p) => median(ROWS.filter((r) => r.group === group && r.profile === p).map((r) => r.peak)));
        const spread = Math.max(...peaks) - Math.min(...peaks);
        assert.ok(spread <= 4, `${group}: los picos por perfil difieren en ${spread} (${peaks.join('/')})`);
    }
});

// ── Forma de las funciones ───────────────────────────────────────────────────

test('al early NO se le adelanta el pico', () => {
    // Se probó con −1 y se quedaba lejos de su techo: con la ventana recortada no
    // le alcanzaba para cerrar la brecha. `early` significa llegar antes, no
    // romperse antes.
    assert.equal(peakShiftOf('early'), 0);
    assert.equal(peakShiftOf('normal'), 0);
    assert.ok(peakShiftOf('late') > 0, 'el late tiene que extender la ventana');
});

test('los factores de crecimiento se cruzan a lo largo de la carrera', () => {
    assert.ok(profileGrowthFactor('early', 20) > profileGrowthFactor('late', 20), 'de joven manda el early');
    assert.ok(profileGrowthFactor('late', 29) > profileGrowthFactor('early', 29), 'de grande manda el late');
    for (const age of [18, 22, 26, 30, 34]) {
        assert.equal(profileGrowthFactor('normal', age), 1, 'el normal es la referencia y vale 1 a toda edad');
        for (const p of DEVELOPMENT_PROFILES) {
            const f = profileGrowthFactor(p, age);
            assert.ok(f > 0 && f < 2, `factor fuera de rango: ${p}@${age} = ${f}`);
        }
    }
});

// ── Revelado ─────────────────────────────────────────────────────────────────

test('cada perfil tiene su frase de revelado, en la voz del juego', () => {
    const seen = new Set<string>();
    for (const p of DEVELOPMENT_PROFILES) {
        const text = profileRevealText(p);
        assert.ok(text.length > 0, `${p}: sin frase`);
        assert.ok(!text.includes('!'), `${p}: signos de exclamación`);
        assert.ok(!seen.has(text), `${p}: frase repetida`);
        seen.add(text);
    }
});

test('el perfil queda sellado en el jugador y sobrevive al JSON', () => {
    const st = runCareer({ position: 'lock', nationalityCountryCode: 'ar', startRoute: 'development' }, 31337, chooser);
    assert.ok(DEVELOPMENT_PROFILES.includes(st.player.developmentProfile));
    const roundTripped = JSON.parse(JSON.stringify(st)) as typeof st;
    assert.equal(roundTripped.player.developmentProfile, st.player.developmentProfile);
});

test('el perfil no depende del puesto elegido más allá del reparto', () => {
    // Todo puesto tiene que poder sacar los tres perfiles: el reparto inclina,
    // no prohíbe. Un pilar que madura temprano existe.
    for (const pos of [...FORWARDS, ...BACKS]) {
        const seen = new Set<DevelopmentProfile>();
        for (let i = 0; i < 200; i++) seen.add(rollDevelopmentProfile(pos, createRng(5000 + i)));
        assert.equal(seen.size, 3, `${pos}: no salieron los tres perfiles (${[...seen].join(', ')})`);
        void getPosition(pos);
    }
});
