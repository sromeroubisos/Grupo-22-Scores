import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ELIGIBILITY_RULES_VERSION,
    PRESENCE_MONTHS_REQUIRED,
    REGISTRATION_MONTHS_REQUIRED,
    advanceRegistration,
    availableUnions,
    canRepresent,
    captureFor,
    createEligibility,
    grantAncestryClaim,
    targetUnion,
} from './eligibility.ts';
import { RUGBY_UNIONS, SELECTABLE_COUNTRIES, countryCodeOfNationality, findCountry, hasUnion } from '../data/nations.ts';
import { createPlayer } from './create-player.ts';
import { createRng } from './random.ts';
import { runCareer, acceptBestEligibleOfferChooser } from './run-career.ts';
import { getClub } from '../data/clubs.ts';

function playerOf(nationality: string, seed = 1234) {
    return createPlayer({ position: 'flyhalf', nationality }, createRng(seed));
}

test('la versión de las reglas está sellada', () => {
    assert.ok(ELIGIBILITY_RULES_VERSION.length > 0);
    assert.equal(REGISTRATION_MONTHS_REQUIRED, 60, 'Reg. 8.1(c) vigente: 60 meses (no 36)');
    assert.equal(PRESENCE_MONTHS_REQUIRED, 120, 'Reg. 8.1(d): 10 años acumulados');
});

test('nacionalidad y elegibilidad son campos DISTINTOS', () => {
    const p = playerOf('Argentina');
    assert.equal(p.nationality, 'Argentina', 'la nacionalidad es identidad, un nombre');
    assert.equal(p.eligibility.nationalityCountryCode, 'ar');
    assert.equal(p.eligibility.birthCountryCode, 'ar', 'nacimiento por defecto = nacionalidad');
    assert.equal(p.eligibility.capturedBy, null, 'todavía no lo capturó nadie');
    assert.equal(p.nationalTeam, null);
    assert.deepEqual(p.eligibility.claims, [{ union: 'ar', route: 'birth' }], 'solo 8.1(a); no se inventa ascendencia');
});

test('una nacionalidad sin unión modelada es válida pero NO genera selección ficticia', () => {
    const state = createEligibility('xx');
    assert.equal(hasUnion('xx'), false);
    assert.deepEqual(state.claims, [], 'sin unión no hay ruta');
    assert.equal(targetUnion(state), null, 'no hay selección a la que aspirar');
    assert.equal(canRepresent(state, 'xx'), false);

    const unknown = createEligibility(null);
    assert.equal(targetUnion(unknown), null);
});

test('todo país con unión existe en el catálogo seleccionable', () => {
    for (const code of Object.keys(RUGBY_UNIONS)) {
        const country = findCountry(code);
        assert.ok(country, `la unión ${code} no tiene país seleccionable`);
        assert.equal(countryCodeOfNationality(country!.nameEs), code, `${country!.nameEs} no resuelve`);
    }
});

test('una unión sale de una lista de miembros, no de llenar el catálogo', () => {
    // El test decía "la mayoría de los países NO tiene unión" y comparaba las dos
    // mitades. Con el catálogo completo —las seis asociaciones regionales, 128
    // uniones— esa comparación se volvió una carrera entre 128 y 127 que se gana
    // o se pierde por una fila, y dejó de medir lo que le importaba.
    //
    // Lo que importa es que un país sin unión NO reciba una selección inventada,
    // y que sigan siendo muchos: el catálogo ISO tiene 255 entradas y el rugby
    // organizado no llega ni a la mitad.
    const withUnion = SELECTABLE_COUNTRIES.filter((c) => hasUnion(c.code));
    const without = SELECTABLE_COUNTRIES.filter((c) => !hasUnion(c.code));
    assert.equal(withUnion.length, Object.keys(RUGBY_UNIONS).length);
    assert.ok(without.length > 100, `sólo ${without.length} países sin unión: se están inventando selecciones`);
    for (const country of without) {
        assert.equal(createEligibility(country.code).claims.length, 0, `${country.nameEs}: selección inventada`);
    }
});

test('fichar en el exterior NO cambia la nacionalidad ni concede elegibilidad', () => {
    const p = playerOf('Argentina');
    advanceRegistration(p.eligibility, 'fr'); // una temporada en Francia
    assert.equal(p.nationality, 'Argentina', 'la nacionalidad no se toca');
    assert.equal(p.eligibility.nationalityCountryCode, 'ar');
    assert.equal(canRepresent(p.eligibility, 'fr'), false, 'un año afuera no habilita nada');
    assert.equal(p.eligibility.registrationMonths['fr'], 12);
});

test('cinco temporadas consecutivas SÍ conceden elegibilidad (8.1(c))', () => {
    const p = playerOf('Argentina');
    for (let season = 1; season <= 4; season++) advanceRegistration(p.eligibility, 'fr');
    assert.equal(canRepresent(p.eligibility, 'fr'), false, '48 meses no alcanzan');

    advanceRegistration(p.eligibility, 'fr');
    assert.equal(p.eligibility.registrationMonths['fr'], REGISTRATION_MONTHS_REQUIRED);
    assert.equal(canRepresent(p.eligibility, 'fr'), true, '60 meses habilitan la ruta');
    assert.equal(p.eligibility.claims.find((c) => c.union === 'fr')?.route, 'registration-60m');
});

test('cambiar de unión antes de completar el período REINICIA la continuidad', () => {
    const p = playerOf('Argentina');
    for (let season = 1; season <= 4; season++) advanceRegistration(p.eligibility, 'fr'); // 48 meses
    advanceRegistration(p.eligibility, 'jp'); // se va a Japón antes de los 60
    assert.equal(p.eligibility.registrationMonths['fr'], 0, 'la continuidad francesa se corta');
    assert.equal(p.eligibility.registrationMonths['jp'], 12);
    assert.equal(canRepresent(p.eligibility, 'fr'), false);

    // Pero la presencia acumulada NO se pierde.
    assert.equal(p.eligibility.presenceMonths['fr'], 48);
});

test('cambiar de club DENTRO de la misma unión no reinicia nada', () => {
    const p = playerOf('Argentina');
    for (let season = 1; season <= 5; season++) advanceRegistration(p.eligibility, 'fr');
    assert.equal(p.eligibility.registrationMonths['fr'], 60, 'cinco temporadas seguidas en Francia');
    advanceRegistration(p.eligibility, 'fr'); // otro club francés
    assert.equal(p.eligibility.registrationMonths['fr'], 72, 'sigue sumando');
    assert.equal(canRepresent(p.eligibility, 'fr'), true);
});

test('los diez años acumulados funcionan aunque la continuidad se haya cortado (8.1(d))', () => {
    const p = playerOf('Argentina');
    // Va y viene entre Francia y Japón: nunca junta 60 seguidos en Francia,
    // pero sí acumula presencia.
    for (let i = 0; i < 10; i++) {
        advanceRegistration(p.eligibility, 'fr');
        advanceRegistration(p.eligibility, 'jp');
    }
    assert.ok(p.eligibility.registrationMonths['fr'] <= 12, 'la continuidad se cortó una y otra vez');
    assert.equal(p.eligibility.presenceMonths['fr'], PRESENCE_MONTHS_REQUIRED);
    assert.equal(canRepresent(p.eligibility, 'fr'), true, '10 años acumulados alcanzan');
    assert.equal(p.eligibility.claims.find((c) => c.union === 'fr')?.route, 'presence-10y');
});

test('una franquicia multinacional no atribuye registro a ninguna unión', () => {
    const p = playerOf('Argentina');
    advanceRegistration(p.eligibility, 'fr');
    advanceRegistration(p.eligibility, null); // URC / Super Rugby / SRA
    assert.equal(p.eligibility.registeredUnion, null);
    assert.equal(p.eligibility.registrationMonths['fr'], 12, 'no suma ni resta');
});

test('la convocatoria solo mira uniones elegibles', () => {
    const p = playerOf('Argentina');
    assert.equal(targetUnion(p.eligibility), 'ar');
    assert.deepEqual(availableUnions(p.eligibility), ['ar']);
    for (let season = 1; season <= 5; season++) advanceRegistration(p.eligibility, 'fr');
    assert.deepEqual(availableUnions(p.eligibility).sort(), ['ar', 'fr'], 'ahora hay dos caminos');
});

test('la captura impide representar a otra unión (8.2)', () => {
    const p = playerOf('Argentina');
    for (let season = 1; season <= 5; season++) advanceRegistration(p.eligibility, 'fr');
    assert.equal(canRepresent(p.eligibility, 'fr'), true, 'antes de la captura podía elegir');

    captureFor(p.eligibility, 'ar');
    assert.equal(p.eligibility.capturedBy, 'ar');
    assert.equal(canRepresent(p.eligibility, 'ar'), true);
    assert.equal(canRepresent(p.eligibility, 'fr'), false, 'capturado: no puede cambiar de unión');
    assert.deepEqual(availableUnions(p.eligibility), ['ar']);
    assert.equal(targetUnion(p.eligibility), 'ar', 'la captura manda sobre la nacionalidad');
});

test('la ascendencia se puede sembrar pero el motor no la inventa', () => {
    const p = playerOf('Argentina');
    assert.ok(!p.eligibility.claims.some((c) => c.route === 'parent' || c.route === 'grandparent'));
    grantAncestryClaim(p.eligibility, 'it', 'grandparent');
    assert.equal(canRepresent(p.eligibility, 'it'), true);
    grantAncestryClaim(p.eligibility, 'xx', 'parent');
    assert.equal(canRepresent(p.eligibility, 'xx'), false, 'una unión inexistente no se habilita');
});

test('la elegibilidad sobrevive a serializar y restaurar el CareerState', () => {
    const state = runCareer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, 8675309, acceptBestEligibleOfferChooser);
    const restored = JSON.parse(JSON.stringify(state)) as typeof state;
    assert.deepEqual(restored.player.eligibility, state.player.eligibility);
    assert.equal(typeof restored.player.eligibility.registeredUnion, typeof state.player.eligibility.registeredUnion);

    // Y evoluciona de forma determinística: dos corridas iguales dan lo mismo.
    const again = runCareer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, 8675309, acceptBestEligibleOfferChooser);
    assert.deepEqual(again.player.eligibility, state.player.eligibility);
});

test('en una carrera real el registro sigue al país del club', () => {
    const state = runCareer({ position: 'wing', nationality: 'Argentina', origin: 'academia-club' }, 4242, acceptBestEligibleOfferChooser);
    const last = state.seasons[state.seasons.length - 1];
    const lastCountry = getClub(last.club).countryCode;
    const expected = lastCountry === 'multi' ? null : lastCountry;
    assert.equal(state.player.eligibility.registeredUnion, expected, 'la unión de registro es la del último club');
    for (const [union, months] of Object.entries(state.player.eligibility.presenceMonths)) {
        assert.ok(months > 0 && months % 12 === 0, `${union}: presencia mal contada (${months})`);
    }
});
