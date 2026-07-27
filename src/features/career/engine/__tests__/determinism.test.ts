// RED DE SEGURIDAD DEL MOTOR (Fase 0).
//
// Estos tests son lo que permite tocar el motor sin miedo en las fases
// siguientes. Hay tres garantías distintas y conviene no mezclarlas:
//
//   1. REPRODUCIBILIDAD — misma semilla + mismas decisiones ⇒ mismo estado.
//      NO se rompe cuando el motor cambia a propósito. Si este falla, se coló
//      una fuente de entropía.
//   2. ROUND-TRIP — serializar a JSON a mitad de carrera y seguir desde ahí da
//      exactamente lo mismo que no haber recargado nunca. Es la garantía real
//      detrás del "F5 y retoma idéntico".
//   3. DIGEST CONGELADO — una foto del comportamiento actual. SÍ se rompe
//      cuando el motor cambia. Cuando el cambio es intencional se actualiza la
//      tabla EXPECTED y se sube ENGINE_VERSION; cuando no lo es, acabás de
//      encontrar una regresión.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, hashSeed, careerReducer, getPendingEvent, type Chooser } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import type { CreatePlayerInput } from '../create-player.ts';

/**
 * Estrategia de decisión determinística que NO siempre elige la primera opción.
 * `firstOptionChooser` produce carreras sin ninguna transferencia (la opción 0
 * del mercado es "quedarte"), así que no sirve para auditar el motor completo.
 * Esta rota entre opciones de forma estable: mismo evento + misma temporada ⇒
 * misma elección, hoy y dentro de seis meses.
 */
const rotatingChooser: Chooser = (event, state) => {
    const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length;
    return event.options[idx].id;
};

interface Case {
    name: string;
    input: CreatePlayerInput;
    seed: number;
}

// Tres países distintos a propósito: uno del circuito rioplatense (escalera
// derivada del snapshot), uno con liga doméstica propia y piso profesional, y
// uno europeo. Y una RUTA distinta en cada uno, para que el digest congelado
// cubra las tres puertas de entrada y no solo la amateur.
const CASES: Case[] = [
    { name: 'apertura argentino', input: { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'amateur' }, seed: 20260726 },
    { name: 'pilar neozelandés', input: { position: 'prop', nationalityCountryCode: 'nz', startRoute: 'professional' }, seed: 424242 },
    { name: 'wing francés', input: { position: 'wing', nationalityCountryCode: 'fr', startRoute: 'development' }, seed: 7919 },
];

interface Digest {
    seasons: number;
    retirementAge: number;
    peakOvr: number;
    caps: number;
    titles: number;
    clubs: number;
    firstClub: string | null;
    lastClub: string | null;
    employment: string;
    decisions: number;
    stateHash: number;
}

function digest(state: CareerState): Digest {
    const clubs = [...new Set(state.history.map((h) => h.clubId))];
    return {
        seasons: state.history.length,
        retirementAge: state.player.age,
        peakOvr: state.history.reduce((max, h) => Math.max(max, h.ovr), 0),
        caps: state.player.caps,
        titles: state.player.titles,
        clubs: clubs.length,
        firstClub: state.history[0]?.clubId ?? null,
        lastClub: clubs[clubs.length - 1] ?? null,
        employment: state.player.employment,
        decisions: state.decisionLog.length,
        // Cubre TODO el estado, no solo los campos que se nos ocurrió listar.
        stateHash: hashSeed(JSON.stringify(state)),
    };
}

// Línea de base del motor 1.7.0 — ver docs/career-engine.md §9.
const EXPECTED: Record<string, Digest> = {
    "apertura argentino": {
        seasons: 15,
        retirementAge: 35,
        peakOvr: 58,
        caps: 0,
        titles: 0,
        clubs: 4,
        firstClub: 'sb-st-brendan-s',
        lastClub: 'sb-cardenales-r-c',
        employment: 'amateur-compensated',
        decisions: 13,
        stateHash: 1699284462,
    },
    "pilar neozelandés": {
        seasons: 19,
        retirementAge: 37,
        peakOvr: 80,
        caps: 59,
        titles: 7,
        clubs: 1,
        firstClub: 'chiefs',
        lastClub: 'chiefs',
        employment: 'full-time-professional',
        decisions: 13,
        stateHash: 3391389064,
    },
    "wing francés": {
        seasons: 13,
        retirementAge: 32,
        peakOvr: 65,
        caps: 6,
        titles: 1,
        clubs: 4,
        firstClub: 'ealing-trailfinders',
        lastClub: 'us-bressane',
        employment: 'semi-professional',
        decisions: 11,
        stateHash: 3262642186,
    },
};

// ── 1. AUTOCONSISTENCIA — estos tests NO se actualizan NUNCA ─────────────────
//
// No dependen de ningún valor esperado, así que sobreviven a cualquier cambio
// intencional del motor. Lo que atrapan es no-determinismo REAL: un Math.random
// que se escapó, una iteración sobre un Set sin ordenar, un Date. Si alguno de
// estos falla, no hay que actualizar nada: hay que arreglar el motor.

test('misma semilla + mismas decisiones ⇒ mismo digest', () => {
    for (const { name, input, seed } of CASES) {
        const a = digest(runCareer(input, seed, rotatingChooser));
        const b = digest(runCareer(input, seed, rotatingChooser));
        assert.deepEqual(b, a, `${name}: el digest cambió entre dos corridas de la misma semilla`);
    }
});

test('misma semilla + mismas decisiones ⇒ carrera idéntica', () => {
    for (const { name, input, seed } of CASES) {
        const a = runCareer(input, seed, rotatingChooser);
        const b = runCareer(input, seed, rotatingChooser);
        assert.deepEqual(b, a, `${name}: dos corridas de la misma semilla difieren`);
    }
});

test('la semilla importa: semillas distintas dan carreras distintas', () => {
    const { input, seed } = CASES[0];
    const a = runCareer(input, seed, rotatingChooser);
    const b = runCareer(input, seed + 1, rotatingChooser);
    assert.notEqual(
        hashSeed(JSON.stringify(b)),
        hashSeed(JSON.stringify(a)),
        'dos semillas distintas produjeron exactamente la misma carrera',
    );
});

test('el estado del RNG queda sellado al terminar', () => {
    for (const { name, input, seed } of CASES) {
        const state = runCareer(input, seed, rotatingChooser);
        assert.equal(state.seed, seed >>> 0, `${name}: la semilla original no se conserva`);
        assert.equal(typeof state.rngState, 'number');
        assert.ok(Number.isInteger(state.rngState) && state.rngState >= 0, `${name}: rngState no es un uint32`);
    }
});

// ── 2. Round-trip por JSON (la garantía real detrás del F5) ──────────────────

/** Corre una carrera paso a paso, opcionalmente pasando por JSON en cada paso. */
function playThrough(input: CreatePlayerInput, seed: number, throughJson: boolean): CareerState {
    let state = runCareerFirstStep(input, seed);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        guard++;
        if (throughJson) state = JSON.parse(JSON.stringify(state)) as CareerState;
        const event = getPendingEvent(state);
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: rotatingChooser(event, state) })
            : careerReducer(state, { type: 'ADVANCE' });
    }
    return state;
}

function runCareerFirstStep(input: CreatePlayerInput, seed: number): CareerState {
    // `runCareer` con maxSeasons 0 no expone el estado inicial, así que se
    // reconstruye con el reducer, que es el mismo camino que usa la UI.
    return careerReducer({} as CareerState, { type: 'START', input, seed });
}

test('serializar a JSON a mitad de carrera no cambia el resultado', () => {
    for (const { name, input, seed } of CASES) {
        const direct = playThrough(input, seed, false);
        const roundTripped = playThrough(input, seed, true);
        assert.deepEqual(roundTripped, direct, `${name}: la carrera cambió al pasar por JSON`);
    }
});

test('CareerState es JSON puro (sin Date, Map, Set ni funciones)', () => {
    for (const { name, input, seed } of CASES) {
        const state = runCareer(input, seed, rotatingChooser);
        // `ancestros` es una PILA, no un registro de todo lo visto: el motor
        // comparte referencias a propósito (una lesión vive a la vez en
        // `player.injuries` y en `seasons[i].injuries`). Eso es aliasing, no un
        // ciclo, y JSON lo maneja sin problema.
        const ancestros = new Set<unknown>();
        const walk = (value: unknown, path: string): void => {
            if (value === null || typeof value !== 'object') {
                assert.notEqual(typeof value, 'function', `${name}: función en ${path}`);
                assert.notEqual(typeof value, 'symbol', `${name}: symbol en ${path}`);
                assert.notEqual(typeof value, 'bigint', `${name}: bigint en ${path}`);
                assert.ok(!Object.is(value, -0), `${name}: -0 en ${path} (JSON lo colapsa a 0)`);
                return;
            }
            assert.ok(!ancestros.has(value), `${name}: referencia circular en ${path}`);
            ancestros.add(value);
            assert.ok(!(value instanceof Date), `${name}: Date en ${path}`);
            assert.ok(!(value instanceof Map), `${name}: Map en ${path}`);
            assert.ok(!(value instanceof Set), `${name}: Set en ${path}`);
            for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
            ancestros.delete(value);
        };
        walk(state, 'state');
    }
});

// ── 3. Digest congelado — este SÍ se actualiza en cada cambio intencional ────

test('digest congelado: el comportamiento del motor no cambió sin querer', () => {
    for (const { name, input, seed } of CASES) {
        const actual = digest(runCareer(input, seed, rotatingChooser));
        assert.deepEqual(
            actual,
            EXPECTED[name],
            `${name}: cambió el comportamiento del motor.\n`
            + 'Si el cambio es INTENCIONAL: actualizá EXPECTED con estos valores, '
            + 'subí ENGINE_VERSION y refrescá la tabla de docs/career-engine.md §9.\n'
            + `Obtenido: ${JSON.stringify(actual, null, 2)}`,
        );
    }
});

test('una carrera completa termina retirada y con historia coherente', () => {
    for (const { name, input, seed } of CASES) {
        const state = runCareer(input, seed, rotatingChooser);
        assert.equal(state.phase, 'retired', `${name}: no llegó al retiro`);
        assert.ok(state.player.retired, `${name}: el jugador no quedó marcado como retirado`);
        assert.ok(state.player.retirementReason, `${name}: el retiro no tiene causa`);
        assert.equal(state.history.length, state.seasons.length, `${name}: history y seasons desalineados`);
        assert.ok(state.history.length > 0, `${name}: carrera sin temporadas`);
        // La trayectoria avanza de a una temporada y un año, sin huecos.
        state.history.forEach((entry, i) => {
            assert.equal(entry.season, i + 1, `${name}: hueco en la trayectoria en la posición ${i}`);
            if (i > 0) {
                assert.equal(entry.age, state.history[i - 1].age + 1, `${name}: salto de edad en la posición ${i}`);
            }
        });
    }
});
