// Persistencia de la partida. Lo que se protege acá no es el guardado en sí,
// sino la promesa de que una partida vieja NUNCA rompe el juego: si el motor ya
// no la sabe interpretar, se resuelve como 'outdated' y la UI ofrece empezar de
// nuevo. Cualquier fase que suba una versión tiene que dejar estos tests verdes.
//
// El módulo bajo prueba vive en app/ (careerStorage.ts). Es la única dirección
// permitida: un test puede mirar la app; el motor no.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, createInitialCareer } from '../../index.ts';
import { saveCareer, loadCareer, clearCareer } from '../../../../app/juegos/minijuegos/carrera-rugby/careerStorage.ts';

const KEY = 'g22-carrera-rugby';

/** localStorage mínimo, en memoria. Devuelve el store para poder falsearlo. */
function installLocalStorage(): Map<string, string> {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
        localStorage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        },
    };
    return store;
}

function uninstallLocalStorage(): void {
    delete (globalThis as unknown as { window?: unknown }).window;
}

/** localStorage que revienta al escribir: modo privado / cuota llena. */
function installBrokenStorage(): void {
    (globalThis as unknown as { window: unknown }).window = {
        localStorage: {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('QuotaExceededError'); },
            removeItem: () => { throw new Error('SecurityError'); },
        },
    };
}

const INPUT = { position: 'flyhalf', nationalityCountryCode: 'ar' } as const;

test('save → load devuelve ok con el estado idéntico', () => {
    installLocalStorage();
    try {
        const state = createInitialCareer(INPUT, 20260726);
        saveCareer(state);

        const result = loadCareer();
        assert.equal(result.kind, 'ok');
        assert.deepEqual(result.kind === 'ok' ? result.state : null, state, 'el estado cargado no es idéntico al guardado');
    } finally {
        uninstallLocalStorage();
    }
});

test('una carrera a mitad de camino sobrevive el round-trip completo', () => {
    installLocalStorage();
    try {
        // Estado con historia, decisiones y ofertas: no un save recién creado.
        const state = runCareer(INPUT, 424242, (event) => event.options[0].id, 6);
        saveCareer(state);

        const result = loadCareer();
        assert.equal(result.kind, 'ok');
        const loaded = result.kind === 'ok' ? result.state : null;
        assert.deepEqual(loaded, state);
        assert.equal(loaded?.rngState, state.rngState, 'el estado del RNG no sobrevivió: la carrera no retomaría igual');
        assert.equal(loaded?.pendingEventId, state.pendingEventId, 'se perdió la decisión pendiente');
    } finally {
        uninstallLocalStorage();
    }
});

test('ningún número del estado es -0: el guardado es byte-idéntico', () => {
    // Regresión concreta: `Math.round(-0.2)` devuelve -0, y aging.ts lo metía en
    // `attributeDeltas`. structuredClone (el reducer) lo conserva, JSON (el
    // guardado) lo colapsa a 0 — así que una partida recargada NO era idéntica a
    // la original. El síntoma es invisible en JSON.stringify, por eso se vigila
    // acá y no con un hash.
    installLocalStorage();
    try {
        // Varias semillas y puestos: el -0 aparecía en un solo atributo de una
        // sola temporada, así que una carrera sola no alcanza para cazarlo.
        const casos = [
            { input: { position: 'flyhalf', nationalityCountryCode: 'ar' } as const, seed: 20260726 },
            { input: { position: 'prop', nationalityCountryCode: 'nz' } as const, seed: 424242 },
            { input: { position: 'wing', nationalityCountryCode: 'fr' } as const, seed: 7919 },
        ];

        for (const { input, seed } of casos) {
            const state = runCareer(input, seed, (event) => event.options[0].id);
            const negativos: string[] = [];
            const ancestros = new Set<unknown>();
            const walk = (value: unknown, path: string): void => {
                if (typeof value === 'number') {
                    if (Object.is(value, -0)) negativos.push(path);
                    return;
                }
                if (value === null || typeof value !== 'object' || ancestros.has(value)) return;
                ancestros.add(value);
                for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
                ancestros.delete(value);
            };
            walk(state, 'state');
            assert.deepEqual(negativos, [], `semilla ${seed}: -0 en el estado (JSON lo colapsa a 0)`);

            // Y la prueba de fuego: guardar y cargar tiene que devolver lo mismo.
            saveCareer(state);
            const result = loadCareer();
            assert.equal(result.kind, 'ok');
            assert.deepEqual(result.kind === 'ok' ? result.state : null, state, `semilla ${seed}: el round-trip cambió el estado`);
        }
    } finally {
        uninstallLocalStorage();
    }
});

test('sin partida guardada devuelve none', () => {
    installLocalStorage();
    try {
        assert.equal(loadCareer().kind, 'none');
    } finally {
        uninstallLocalStorage();
    }
});

test('un schema viejo devuelve outdated sin tirar, y limpia la clave', () => {
    const store = installLocalStorage();
    try {
        const state = createInitialCareer(INPUT, 7919);
        saveCareer(state);

        // Se falsea el guardado como si viniera de una versión anterior.
        const payload = JSON.parse(store.get(KEY)!);
        payload.schema = payload.schema - 1;
        store.set(KEY, JSON.stringify(payload));

        assert.equal(loadCareer().kind, 'outdated');
        assert.equal(store.has(KEY), false, 'una partida incompatible tiene que limpiarse');
        assert.equal(loadCareer().kind, 'none', 'después de limpiar ya no hay partida');
    } finally {
        uninstallLocalStorage();
    }
});

test('cualquiera de los seis campos de versión invalida el guardado', () => {
    const store = installLocalStorage();
    try {
        const campos = [
            'schema', 'engineVersion', 'clubCatalogVersion',
            'nationsVersion', 'competitionLevelsVersion', 'environmentVersion',
        ];
        for (const campo of campos) {
            const state = createInitialCareer(INPUT, 1234);
            saveCareer(state);
            const payload = JSON.parse(store.get(KEY)!);
            payload[campo] = campo === 'schema' ? 999 : 'version-que-no-existe';
            store.set(KEY, JSON.stringify(payload));

            assert.equal(loadCareer().kind, 'outdated', `cambiar ${campo} tendría que invalidar la partida`);
        }
    } finally {
        uninstallLocalStorage();
    }
});

test('una partida del schema 5 (antes de la ruta inicial) se resuelve como outdated', () => {
    // Primer bump de schema del proyecto. Un guardado viejo NO tiene `startRoute`
    // ni el desglose del pie, y no hay forma honesta de inventárselos: se
    // descarta con el aviso no técnico en vez de intentar una migración que
    // mentiría sobre cómo empezó esa carrera.
    const store = installLocalStorage();
    try {
        const state = createInitialCareer(INPUT, 20260726);
        saveCareer(state);
        const payload = JSON.parse(store.get(KEY)!);

        // Se reconstruye un guardado tal como lo dejaba la versión anterior.
        payload.schema = 5;
        payload.engineVersion = '1.5.0';
        delete payload.state.startRoute;
        for (const season of payload.state.seasons) {
            for (const clave of ['points', 'conversionsMade', 'penaltiesMade', 'dropGoals', 'scrumsWon']) {
                delete season.stats[clave];
            }
        }
        store.set(KEY, JSON.stringify(payload));

        assert.doesNotThrow(() => loadCareer(), 'una partida vieja no puede tirar');
        assert.equal(loadCareer().kind, 'none', 'y después de limpiarla ya no queda nada');
    } finally {
        uninstallLocalStorage();
    }
});

test('un guardado corrupto devuelve outdated en vez de explotar', () => {
    const store = installLocalStorage();
    try {
        store.set(KEY, '{ esto no es json');
        assert.equal(loadCareer().kind, 'outdated');
        assert.equal(store.has(KEY), false);

        store.set(KEY, JSON.stringify({ schema: 5 })); // sin `state`
        assert.equal(loadCareer().kind, 'outdated');
    } finally {
        uninstallLocalStorage();
    }
});

test('sin localStorage la partida sigue en memoria: nada tira', () => {
    uninstallLocalStorage(); // server-side render: no hay window
    assert.doesNotThrow(() => saveCareer(createInitialCareer(INPUT, 99)));
    assert.equal(loadCareer().kind, 'none');
    assert.doesNotThrow(() => clearCareer());

    installBrokenStorage(); // modo privado / cuota llena
    try {
        assert.doesNotThrow(() => saveCareer(createInitialCareer(INPUT, 99)), 'un setItem que tira no puede romper la partida');
        assert.equal(loadCareer().kind, 'outdated', 'un getItem que tira se resuelve como outdated');
        assert.doesNotThrow(() => clearCareer());
    } finally {
        uninstallLocalStorage();
    }
});
