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
    RETIRE_OPTION_ID,
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
        // 'multi' TAMBIÉN es de su ruta, y por eso el país esperado son dos.
        //
        // Desde 1.28.0 el argentino que saca la rama de academia puede arrancar en
        // una franquicia de la SRA —Dogos, Pampas, Peñarol, Selknam—, y ésas
        // llevan `countryCode: 'multi'` porque son de Sudamérica y no de un país.
        // Exigir 'ar' a secas leía ese arranque como si la UI hubiera elegido el
        // club, que es justo lo contrario de lo que pasó: lo eligió el motor,
        // desde las vías que salen de la escalera argentina.
        const club = getClub(state.player.club);
        assert.ok(
            club.countryCode === 'ar' || club.countryCode === 'multi',
            `y sale de la ruta, no de la UI (arrancó en ${club.name}, país ${club.countryCode})`,
        );
        // El techo del debut depende de por dónde entró: 4 para la escalera
        // doméstica, 6 para la academia de un club pago (MAX_PRO_ENTRY_RUNG).
        assert.ok(marketRung(club) <= 6, 'debuta como proyecto, no en la élite');
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

test('el mercado nunca ofrece más de tres opciones de club ni una copa', () => {
    const cupIds = new Set(CUPS.map((c) => c.id));
    let sawMarket = false;

    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
        let state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'ar' }, seed);
        for (let i = 0; i < 24 && state.phase !== 'retired'; i++) {
            const event = getPendingEvent(state);
            if (event && state.offers.length > 0) {
                sawMarket = true;
                // Las opciones de CLUB siguen siendo tres como mucho (quedarse +
                // dos ofertas). Desde 1.15.0 el veterano puede tener una cuarta,
                // la de retirarse, que no es una opción de mercado.
                const clubOptions = event.options.filter((o) => o.id !== RETIRE_OPTION_ID);
                assert.ok(clubOptions.length <= 3, `mercado con ${clubOptions.length} opciones de club`);
                for (const offer of state.offers) {
                    assert.ok(!cupIds.has(offer.league), `oferta de una copa: ${offer.league}`);
                    assert.ok(getClub(offer.club).id === offer.club, 'club inexistente');
                }
            }
            // Elige siempre la última opción que NO sea retirarse: si no, el
            // veterano colgaría los botines en la primera vuelta y el test
            // dejaría de mirar el mercado justo cuando más ofertas hay.
            const playable = event?.options.filter((o) => o.id !== RETIRE_OPTION_ID) ?? [];
            const action = event
                ? ({ type: 'CHOOSE', optionId: playable[playable.length - 1].id } as const)
                : ({ type: 'ADVANCE' } as const);
            state = advanceCareerToNextDecision(state, action).state;
        }
    }
    assert.ok(sawMarket, 'debería haberse abierto el mercado alguna vez');
});

test('el retiro es una decisión: se ofrece de 34 a 38 y se fuerza a los 39', () => {
    let vioOpcion = false;
    let carrerasLargas = 0;

    for (const seed of [11, 22, 33, 44, 55]) {
        let state = createInitialCareer({ position: 'lock', nationalityCountryCode: 'ar', startRoute: 'professional' }, seed);
        for (let i = 0; i < 40 && state.phase !== 'retired'; i++) {
            const event = getPendingEvent(state);
            const edad = state.player.age;
            if (event) {
                const tieneRetiro = event.options.some((o) => o.id === RETIRE_OPTION_ID);
                if (edad >= 34 && edad < 39) {
                    assert.ok(tieneRetiro, `a los ${edad} la decisión tiene que ofrecer el retiro`);
                    vioOpcion = true;
                } else {
                    assert.ok(!tieneRetiro, `a los ${edad} no se puede ofrecer el retiro`);
                }
                // Nunca una decisión de una sola opción, tampoco las del veterano.
                assert.ok(event.options.length >= 2, `decisión de una sola opción a los ${edad}`);
            }
            const playable = event?.options.filter((o) => o.id !== RETIRE_OPTION_ID) ?? [];
            const action = event
                ? ({ type: 'CHOOSE', optionId: playable[0].id } as const)
                : ({ type: 'ADVANCE' } as const);
            state = advanceCareerToNextDecision(state, action).state;
        }
        // Sin lesión grave que lo corte, el que nunca elige retirarse llega a 39.
        if (state.player.age >= 39) carrerasLargas++;
        assert.ok(state.player.age <= 39, `se pasó de los 39: ${state.player.age}`);
    }

    assert.ok(vioOpcion, 'nunca apareció la opción de retirarse');
    assert.ok(carrerasLargas >= 3, `sólo ${carrerasLargas}/5 llegaron a los 39 sin elegir retirarse`);
});

test('elegir retirarse cierra la carrera sin jugar la temporada', () => {
    let state = createInitialCareer({ position: 'prop', nationalityCountryCode: 'ar', startRoute: 'professional' }, 4242);
    while (state.phase !== 'retired' && state.player.age < 35) {
        const event = getPendingEvent(state);
        const playable = event?.options.filter((o) => o.id !== RETIRE_OPTION_ID) ?? [];
        state = advanceCareerToNextDecision(
            state,
            event ? { type: 'CHOOSE', optionId: playable[0].id } : { type: 'ADVANCE' },
        ).state;
    }

    const event = getPendingEvent(state);
    assert.ok(event?.options.some((o) => o.id === RETIRE_OPTION_ID), 'a los 34+ tiene que estar la opción');

    const temporadasAntes = state.history.length;
    const retirado = advanceCareerToNextDecision(state, { type: 'CHOOSE', optionId: RETIRE_OPTION_ID }).state;

    assert.equal(retirado.phase, 'retired');
    assert.ok(retirado.player.retired);
    assert.equal(retirado.history.length, temporadasAntes, 'retirarse NO juega una temporada más');
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
