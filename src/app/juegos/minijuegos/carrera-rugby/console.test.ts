import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CLUB_CATALOG_VERSION,
    ENGINE_VERSION,
    NATIONS_VERSION,
    createInitialCareer,
    getClub,
    getPendingEvent,
    marketRung,
    CUPS,
} from '../../../../features/career/index.ts';
import { advanceCareerToNextDecision } from './advanceCareer.ts';
import { economicModelOf } from '../../../../features/career/index.ts';

// localStorage mínimo para poder ejercitar careerStorage fuera del navegador.
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


/** Avanza una temporada resolviendo lo que el motor pida (evento o "jugar"). */
function playOneSeason(state: Parameters<typeof advanceCareerToNextDecision>[0]) {
    const event = getPendingEvent(state);
    const action = event
        ? ({ type: 'CHOOSE', optionId: event.options[event.options.length - 1].id } as const)
        : ({ type: 'ADVANCE' } as const);
    return advanceCareerToNextDecision(state, action).state;
}

const SEEDS = [7919, 15838, 23757, 31676, 39595, 47514];

test('el motor asigna el club inicial: la UI nunca lo elige', () => {
    for (const seed of SEEDS) {
        const state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar', origin: 'academia-club' }, seed);
        assert.ok(state.player.club.length > 0, 'siempre hay club inicial');
        assert.equal(getClub(state.player.club).countryCode, 'ar', 'y sale de la ruta, no de la UI');
        assert.ok(marketRung(getClub(state.player.club)) <= 4, 'debuta como proyecto, no en la élite');
    }
});

test('un país sin unión de rugby también arranca una carrera', () => {
    const state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'gl' }, 4242);
    assert.equal(state.player.nationality, 'Groenlandia');
    assert.deepEqual(state.player.eligibility.claims, [], 'sin selección inventada');
    assert.ok(state.player.club.length > 0, 'igual tiene club');
});

test('una decisión agrega exactamente UNA temporada', () => {
    for (const seed of SEEDS) {
        let state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'fr', origin: 'academia-club' }, seed);
        for (let i = 0; i < 4 && state.phase !== 'retired'; i++) {
            const before = state.seasons.length;
            const event = getPendingEvent(state);
            const action = event
                ? ({ type: 'CHOOSE', optionId: event.options[0].id } as const)
                : ({ type: 'ADVANCE' } as const);
            const { state: next } = advanceCareerToNextDecision(state, action);
            assert.equal(next.seasons.length, before + 1, `seed ${seed}: la transición agregó ${next.seasons.length - before} temporadas`);
            state = next;
        }
    }
});

test('el avance deja siempre algo que mostrar: decisión o retiro', () => {
    let state = createInitialCareer({ position: 'lock', nationalityCountryCode: 'nz' }, 555);
    for (let i = 0; i < 25 && state.phase !== 'retired'; i++) {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[0].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
        const hasSomething = state.phase === 'retired' || state.phase === 'season' || getPendingEvent(state) !== null;
        assert.ok(hasSomething, 'la consola no puede quedarse sin nada para mostrar');
    }
    assert.equal(state.phase, 'retired', 'la carrera termina');
});

test('recargar NO consume RNG: la decisión pendiente vuelve idéntica', async () => {
    installLocalStorage();
    const { saveCareer, loadCareer } = await import('./careerStorage.ts');

    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar' }, 8675309);
    state = advanceCareerToNextDecision(state, { type: 'ADVANCE' }).state;
    saveCareer(state);

    const loaded = loadCareer();
    assert.equal(loaded.kind, 'ok');
    const restored = loaded.kind === 'ok' ? loaded.state : null;
    assert.ok(restored);
    assert.equal(restored!.rngState, state.rngState, 'el estado del RNG no se movió');
    assert.deepEqual(restored, state, 'el estado restaurado es idéntico');

    // Y decidir después de restaurar da lo mismo que decidir sin recargar.
    const event = getPendingEvent(restored!);
    const optionId = event ? event.options[0].id : null;
    const fromRestored = optionId
        ? advanceCareerToNextDecision(restored!, { type: 'CHOOSE', optionId })
        : advanceCareerToNextDecision(restored!, { type: 'ADVANCE' });
    const fromLive = optionId
        ? advanceCareerToNextDecision(state, { type: 'CHOOSE', optionId })
        : advanceCareerToNextDecision(state, { type: 'ADVANCE' });
    assert.deepEqual(fromRestored.state, fromLive.state, 'reanudación determinística');
});

test('los guardados de versiones viejas se invalidan sin romper', async () => {
    const store = installLocalStorage();
    const { loadCareer } = await import('./careerStorage.ts');
    const KEY = 'g22-carrera-rugby';

    const stale = {
        schema: 2,
        engineVersion: '1.1.0', // anterior a 1.2.0
        clubCatalogVersion: CLUB_CATALOG_VERSION,
        nationsVersion: NATIONS_VERSION,
        savedAt: 0,
        state: { fake: true },
    };
    store.set(KEY, JSON.stringify(stale));
    assert.equal(loadCareer().kind, 'outdated', 'un save 1.1.0 no se carga');
    assert.equal(store.has(KEY), false, 'y se limpia la clave');

    store.set(KEY, '{ esto no es json');
    assert.equal(loadCareer().kind, 'outdated', 'un save corrupto tampoco rompe');

    store.set(KEY, JSON.stringify({ ...stale, engineVersion: ENGINE_VERSION, schema: 1 }));
    assert.equal(loadCareer().kind, 'outdated', 'un schema viejo tampoco');

    assert.equal(loadCareer().kind, 'none', 'sin partida guardada no hay aviso');
});

test('"Volver a jugar" borra SOLO la clave de la carrera', async () => {
    const store = installLocalStorage();
    const { clearCareer, saveCareer } = await import('./careerStorage.ts');
    store.set('otra-clave-de-la-app', 'no tocar');
    saveCareer(createInitialCareer({ position: 'prop', nationalityCountryCode: 'ar' }, 1));
    clearCareer();
    assert.equal(store.get('otra-clave-de-la-app'), 'no tocar');
    assert.equal(store.has('g22-carrera-rugby'), false);
});

test('el mercado nunca ofrece más de tres opciones ni una copa', () => {
    const cupIds = new Set(CUPS.map((c) => c.id));
    let sawMarket = false;

    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
        let state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'ar' }, seed);
        for (let i = 0; i < 18 && state.phase !== 'retired'; i++) {
            const event = getPendingEvent(state);
            if (event && state.offers.length > 0) {
                sawMarket = true;
                assert.ok(event.options.length <= 3, `mercado con ${event.options.length} opciones`);
                for (const offer of state.offers) {
                    assert.ok(!cupIds.has(offer.league), `oferta de una copa: ${offer.league}`);
                    assert.ok(getClub(offer.club).id === offer.club, 'club inexistente');
                }
            }
            const action = event
                ? ({ type: 'CHOOSE', optionId: event.options[event.options.length - 1].id } as const)
                : ({ type: 'ADVANCE' } as const);
            state = advanceCareerToNextDecision(state, action).state;
        }
    }
    assert.ok(sawMarket, 'debería haberse abierto el mercado alguna vez');
});

test('los títulos de la trayectoria salen de titlesWon, no de un contador de React', () => {
    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'fr' }, 314159);
    while (state.phase !== 'retired') {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[0].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
    }
    const fromSeasons = state.seasons.reduce((sum, s) => sum + s.titlesWon.length, 0);
    assert.equal(fromSeasons, state.player.titles, 'titlesWon debe cuadrar con el total del motor');
    for (const season of state.seasons) {
        assert.equal(season.titles.length, season.titlesWon.length);
    }
});

test('el retiro cierra la carrera con un resumen consistente', () => {
    let state = createInitialCareer({ position: 'prop', nationalityCountryCode: 'ar' }, 99);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[0].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
        guard++;
    }
    assert.equal(state.phase, 'retired');
    assert.equal(state.player.retired, true);
    assert.ok(state.player.retirementReason, 'hay un motivo de retiro para narrar');
    assert.ok(state.seasons.length >= 6, 'la carrera tuvo duración razonable');
});

// ── Trayectoria histórica (bugs de §9) ───────────────────────────────────────

test('el historial NO queda vacío después de avanzar temporadas', () => {
    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar', origin: 'academia-club' }, 7919);
    assert.equal(state.history.length, 0, 'antes de jugar está vacío, y eso es lo único válido');

    state = playOneSeason(state);
    assert.equal(state.history.length, 1, 'una temporada ⇒ una entrada');
    assert.equal(state.history.length, state.seasons.length, 'historial y temporadas van a la par');
});

test('una carrera en temporada 12 muestra 12 entradas de trayectoria', () => {
    let state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'ar', origin: 'academia-club' }, 7919);
    let guard = 0;
    while (state.history.length < 12 && state.phase !== 'retired' && guard < 40) {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[event.options.length - 1].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
        guard++;
    }
    assert.equal(state.history.length, 12, `esperaba 12 entradas, hay ${state.history.length}`);
    assert.equal(state.history.length, state.seasons.length);
    for (const entry of state.history) {
        assert.ok(entry.clubName.length > 0, 'toda entrada tiene club');
        assert.ok(entry.competitionName.length > 0, 'toda entrada tiene competición');
        assert.ok(entry.employment.length > 0, 'toda entrada tiene contrato');
    }
});

test('OVR y delta SIEMPRE están definidos (nunca "=" vacío ni NaN)', () => {
    let state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'fr', origin: 'academia-club' }, 4242);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 40) {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[0].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
        guard++;
    }
    for (const season of state.seasons) {
        assert.ok(Number.isFinite(season.ovrEnd) && season.ovrEnd > 0, `ovrEnd inválido: ${season.ovrEnd}`);
        assert.ok(Number.isFinite(season.ovrStart) && season.ovrStart > 0, `ovrStart inválido: ${season.ovrStart}`);
        const delta = season.ovrEnd - season.ovrStart;
        assert.ok(Number.isFinite(delta), `delta inválido: ${delta}`);
    }
    for (const entry of state.history) {
        assert.ok(Number.isFinite(entry.ovr) && entry.ovr > 0, `ovr inválido: ${entry.ovr}`);
        assert.ok(Number.isFinite(entry.ovrDelta), `ovrDelta inválido: ${entry.ovrDelta}`);
    }
});

test('la historia queda CONGELADA: no se recalcula desde el catálogo', () => {
    let state = createInitialCareer({ position: 'lock', nationalityCountryCode: 'ar', origin: 'academia-club' }, 555);
    state = playOneSeason(state);
    const snapshot = structuredClone(state.history[0]);

    // Avanzar más temporadas no puede alterar la entrada vieja.
    for (let i = 0; i < 3 && state.phase !== 'retired'; i++) {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[event.options.length - 1].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
    }
    assert.deepEqual(state.history[0], snapshot, 'la primera temporada cambió después de jugarse');
});

test('el historial y el contrato sobreviven a persistir y recargar', async () => {
    installLocalStorage();
    const { saveCareer, loadCareer } = await import('./careerStorage.ts');

    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar', origin: 'academia-club' }, 31337);
    for (let i = 0; i < 4 && state.phase !== 'retired'; i++) {
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[event.options.length - 1].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
    }
    saveCareer(state);
    const loaded = loadCareer();
    assert.equal(loaded.kind, 'ok');
    const restored = loaded.kind === 'ok' ? loaded.state : null;
    assert.deepEqual(restored!.history, state.history, 'historial intacto');
    assert.equal(restored!.player.employment, state.player.employment, 'contrato intacto');
    assert.equal(restored!.rngState, state.rngState, 'RNG intacto');
});

test('toda oferta declara el contrato que ofrece, y un club amateur nunca full-time', () => {
    let state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'ar', origin: 'academia-club' }, 22);
    let guard = 0;
    let sawOffer = false;
    while (state.phase !== 'retired' && guard < 30) {
        for (const offer of state.offers) {
            sawOffer = true;
            assert.ok(offer.offeredEmployment, 'la oferta debe declarar el vínculo');
            const club = getClub(offer.club);
            if (economicModelOf(club) === 'amateur') {
                assert.notEqual(offer.offeredEmployment, 'full-time-professional', `${club.name} ofreció full-time`);
            }
        }
        const event = getPendingEvent(state);
        const action = event
            ? ({ type: 'CHOOSE', optionId: event.options[event.options.length - 1].id } as const)
            : ({ type: 'ADVANCE' } as const);
        state = advanceCareerToNextDecision(state, action).state;
        guard++;
    }
    assert.ok(sawOffer, 'debería haberse abierto el mercado');
});
