// MODOS DE DURACIÓN (1.11.0).
//
// Lo que se protege acá es que el ritmo sea ritmo y NO balance. Un modo largo
// tiene que hacer pasar más temporadas por decisión sin cambiar quién asciende:
// el mercado se sigue mirando todas las temporadas y sigue siendo el único
// evento capaz de cortar un tramo por la mitad.
//
// Y la garantía que sostiene todo lo anterior: en `intense` el motor no hace
// NADA distinto de lo que hacía en 1.10.0. Eso se verifica acá comparando estado
// por estado contra una carrera sin `paceMode`, y en determinism.test.ts contra
// el digest congelado, que no se tocó.

import test from 'node:test';
import assert from 'node:assert/strict';
import { careerReducer, getPendingEvent, hashSeed, runCareer, SEASONS_PER_DECISION, type Chooser } from '../../index.ts';
import type { CareerState, PaceModeId } from '../../types/career.ts';
import type { CreatePlayerInput } from '../create-player.ts';
import { TRANSFER_EVENT_ID } from '../../data/events/index.ts';

/** Misma estrategia que la red de seguridad: estable y no siempre la opción 0. */
const rotatingChooser: Chooser = (event, state) => {
    const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length;
    return event.options[idx].id;
};

const CASES: { name: string; input: CreatePlayerInput; seed: number }[] = [
    { name: 'apertura argentino', input: { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'development' }, seed: 20260726 },
    { name: 'pilar neozelandés', input: { position: 'prop', nationalityCountryCode: 'nz', startRoute: 'professional' }, seed: 424242 },
    { name: 'wing francés', input: { position: 'wing', nationalityCountryCode: 'fr', startRoute: 'development' }, seed: 7919 },
];

const LARGOS: PaceModeId[] = ['normal', 'express'];

/**
 * Corre una carrera paso a paso registrando el TAMAÑO de cada tramo: cuántas
 * temporadas se agregaron por cada acción del jugador, y con qué quedó frenada.
 */
function playBlocks(input: CreatePlayerInput, seed: number, chooser: Chooser) {
    let state = careerReducer({} as CareerState, { type: 'START', input, seed });
    const blocks: { seasons: number; stoppedBy: 'market' | 'event' | 'retired' | 'full' }[] = [];
    let guard = 0;

    while (state.phase !== 'retired' && guard < 80) {
        guard++;
        const before = state.seasons.length;
        const event = getPendingEvent(state);
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: chooser(event, state) })
            : careerReducer(state, { type: 'ADVANCE' });

        const seasons = state.seasons.length - before;
        if (seasons === 0) continue; // paso de destrabe, no un tramo
        blocks.push({
            seasons,
            stoppedBy: state.phase === 'retired'
                ? 'retired'
                : seasons === SEASONS_PER_DECISION[state.paceMode]
                    ? 'full'
                    // La NO RENOVACIÓN también es mercado: es el club el que
                    // abre la ventana en vez del jugador, pero corta el tramo
                    // por el mismo motivo y con la misma tarjeta.
                    : (state.pendingEventId === TRANSFER_EVENT_ID || state.pendingEventId === 'club-no-renewal') ? 'market' : 'event',
        });
    }
    return { state, blocks };
}

// ── 1. `intense` no cambió nada ──────────────────────────────────────────────

test('el ritmo por defecto es intense y no altera la carrera', () => {
    for (const { name, input, seed } of CASES) {
        const sinRitmo = runCareer(input, seed, rotatingChooser);
        const conIntense = runCareer({ ...input, paceMode: 'intense' }, seed, rotatingChooser);

        assert.equal(sinRitmo.paceMode, 'intense', `${name}: el default tiene que ser intense`);
        assert.deepEqual(conIntense, sinRitmo, `${name}: pedir intense explícitamente cambió la carrera`);
    }
});

test('en intense cada decisión sigue agregando exactamente una temporada', () => {
    for (const { name, input, seed } of CASES) {
        const { blocks } = playBlocks({ ...input, paceMode: 'intense' }, seed, rotatingChooser);
        assert.ok(blocks.length > 0, `${name}: no se jugó ninguna temporada`);
        for (const block of blocks) {
            assert.equal(block.seasons, 1, `${name}: un tramo de intense trajo ${block.seasons} temporadas`);
        }
    }
});

// ── 2. Autoconsistencia de los modos largos (NO se actualiza nunca) ──────────

test('misma semilla + mismas decisiones ⇒ misma carrera, en cualquier ritmo', () => {
    for (const paceMode of LARGOS) {
        for (const { name, input, seed } of CASES) {
            const a = runCareer({ ...input, paceMode }, seed, rotatingChooser);
            const b = runCareer({ ...input, paceMode }, seed, rotatingChooser);
            assert.deepEqual(b, a, `${name} en ${paceMode}: dos corridas de la misma semilla difieren`);
        }
    }
});

test('un tramo sobrevive al round-trip por JSON (la garantía del F5)', () => {
    for (const paceMode of LARGOS) {
        for (const { name, input, seed } of CASES) {
            const directo = playBlocks({ ...input, paceMode }, seed, rotatingChooser).state;

            let porDisco = careerReducer({} as CareerState, { type: 'START', input: { ...input, paceMode }, seed });
            let guard = 0;
            while (porDisco.phase !== 'retired' && guard < 80) {
                guard++;
                porDisco = JSON.parse(JSON.stringify(porDisco)) as CareerState;
                const event = getPendingEvent(porDisco);
                porDisco = event
                    ? careerReducer(porDisco, { type: 'CHOOSE', optionId: rotatingChooser(event, porDisco) })
                    : careerReducer(porDisco, { type: 'ADVANCE' });
            }
            assert.deepEqual(porDisco, directo, `${name} en ${paceMode}: la carrera cambió al pasar por JSON`);
        }
    }
});

// ── 3. El ritmo es ritmo: menos decisiones, misma carrera ────────────────────

test('un tramo nunca pasa del máximo del modo, y la trayectoria no tiene huecos', () => {
    for (const paceMode of LARGOS) {
        const tope = SEASONS_PER_DECISION[paceMode];
        for (const { name, input, seed } of CASES) {
            const { state, blocks } = playBlocks({ ...input, paceMode }, seed, rotatingChooser);
            for (const block of blocks) {
                assert.ok(block.seasons >= 1 && block.seasons <= tope, `${name} en ${paceMode}: tramo de ${block.seasons} temporadas (tope ${tope})`);
            }
            assert.equal(state.history.length, state.seasons.length, `${name} en ${paceMode}: history y seasons desalineados`);
            state.history.forEach((entry, i) => {
                assert.equal(entry.season, i + 1, `${name} en ${paceMode}: hueco en la trayectoria en ${i}`);
                if (i > 0) assert.equal(entry.age, state.history[i - 1].age + 1, `${name} en ${paceMode}: salto de edad en ${i}`);
            });
        }
    }
});

test('un tramo corto SIEMPRE se explica: mercado o retiro, nunca un evento estático', () => {
    for (const paceMode of LARGOS) {
        for (const { name, input, seed } of CASES) {
            const { blocks } = playBlocks({ ...input, paceMode }, seed, rotatingChooser);
            for (const block of blocks) {
                if (block.seasons === SEASONS_PER_DECISION[paceMode]) continue;
                assert.notEqual(
                    block.stoppedBy,
                    'event',
                    `${name} en ${paceMode}: un evento estático cortó el tramo. Los modos largos existen `
                    + 'justamente para saltear eventos estáticos; solo el mercado y el retiro pueden frenar.',
                );
            }
        }
    }
});

test('avanzar de a tres no silencia el mercado: se sigue mirando todas las temporadas', () => {
    for (const { name, input, seed } of CASES) {
        const { state } = playBlocks({ ...input, paceMode: 'express' }, seed, rotatingChooser);
        // `marketEvaluatedSeason` se sella en cada evaluación. Si el mercado se
        // mirara una vez por tramo quedaría varias temporadas atrasado.
        assert.ok(
            state.player.seasonsPlayed - state.marketEvaluatedSeason <= 1,
            `${name}: el mercado quedó ${state.player.seasonsPlayed - state.marketEvaluatedSeason} temporadas atrasado`,
        );
    }
});

test('los modos largos piden bastantes menos decisiones por la misma carrera', () => {
    const reducciones: { detalle: string; ratio: number }[] = [];
    for (const { name, input, seed } of CASES) {
        const intensa = playBlocks({ ...input, paceMode: 'intense' }, seed, rotatingChooser);
        const expres = playBlocks({ ...input, paceMode: 'express' }, seed, rotatingChooser);

        // POR TEMPORADA, no en total. Los dos ritmos NO producen la misma carrera
        // —cada uno lee otra parte del stream del rng, y desde 1.15.0 el retiro es
        // una decisión, así que uno puede cerrar a los 34 y el otro seguir hasta
        // los 39—. Comparar totales medía "cuál duró más" disfrazado de "cuál pide
        // menos decisiones": el apertura se retira a los 34 en intensa (16
        // decisiones en 16 temporadas) y sigue hasta los 39 en exprés (17 en 21),
        // así que en total pedía MÁS y el test cantaba una regresión donde el ritmo
        // estaba haciendo exactamente lo que promete.
        const porTemporada = (r: typeof intensa) => r.blocks.length / Math.max(1, r.state.history.length);
        const detalle = `${name}: exprés ${porTemporada(expres).toFixed(2)} decisiones por temporada `
            + `(${expres.blocks.length} en ${expres.state.history.length}) contra intensa `
            + `${porTemporada(intensa).toFixed(2)} (${intensa.blocks.length} en ${intensa.state.history.length})`;
        assert.ok(porTemporada(expres) < porTemporada(intensa), detalle);
        reducciones.push({ detalle, ratio: porTemporada(expres) / porTemporada(intensa) });
        assert.ok(expres.state.history.length >= 8, `${name}: la carrera exprés quedó en ${expres.state.history.length} temporadas`);
        assert.equal(expres.state.phase, 'retired', `${name}: la carrera exprés no llegó al retiro`);
    }

    // Y "BASTANTES menos" se mide en el conjunto, no caso por caso. El piso lo
    // pone el MERCADO, que exprés nunca silencia (es la regla de `PaceModeId`): si
    // el mercado aparece en tres de cada cuatro decisiones, ningún ritmo puede
    // bajar mucho más que esto.
    //
    // LA MUESTRA SON 40 CARRERAS Y NO LOS TRES CASOS DE ARRIBA, y el cambio vino de
    // una falla real: con los tres, la media daba 0,81 contra un umbral de 0,80 —o
    // sea que el test se ponía en rojo por UNA decisión de diferencia en UN caso—.
    // Lo que la movió fue una característica que no tiene nada que ver con el ritmo
    // (los títulos de selección, 1.34.0): suman moral y fama, con eso la carrera
    // lee otra parte del stream y uno de los tres casos pidió una decisión más.
    //
    // Un umbral que se rompe con cualquier cambio de stream no está midiendo el
    // ritmo, está midiendo tres semillas. Medido sobre 40 carreras (cinco puestos ×
    // seis países × las dos ramas), exprés pide menos decisiones por temporada en
    // 40 de 40 y la media es 0,754 — o sea que la propiedad es sólida y lo frágil
    // era la muestra. Se agranda la muestra y NO se afloja la condición, que es la
    // misma decisión que ya se tomó en el test de apariciones de desarrollo.
    const PUESTOS = ['flyhalf', 'prop', 'wing', 'centre', 'lock'] as const;
    const PAISES = ['ar', 'nz', 'fr', 'ie', 'za', 'jp'] as const;
    const anchas: number[] = [];
    for (let i = 0; i < 40; i++) {
        const input: CreatePlayerInput = {
            position: PUESTOS[i % PUESTOS.length],
            nationalityCountryCode: PAISES[i % PAISES.length],
            startRoute: i % 2 === 0 ? 'development' : 'amateur',
        };
        const seed = (i + 1) * 7919;
        const intensa = playBlocks({ ...input, paceMode: 'intense' }, seed, rotatingChooser);
        const expres = playBlocks({ ...input, paceMode: 'express' }, seed, rotatingChooser);
        const ratio = (expres.blocks.length / Math.max(1, expres.state.history.length))
            / Math.max(0.001, intensa.blocks.length / Math.max(1, intensa.state.history.length));
        anchas.push(ratio);
    }
    const media = anchas.reduce((sum, r) => sum + r, 0) / anchas.length;
    const peores = anchas.filter((r) => r >= 1).length;
    assert.equal(peores, 0, `${peores} de ${anchas.length} carreras piden MÁS decisiones por temporada en exprés`);
    assert.ok(
        media <= 0.8,
        `exprés sólo bajó al ${Math.round(media * 100)}% de las decisiones por temporada de intensa `
        + `sobre ${anchas.length} carreras.\n`
        + reducciones.map((r) => `  ${r.detalle}`).join('\n'),
    );
});
