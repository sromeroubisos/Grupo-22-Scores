// LA ELECCIÓN INICIAL: amateur, desarrollo o profesional.
//
// Una elección que solo mueve números iniciales no es una elección. Lo que se
// protege acá es que las tres rutas produzcan carreras que se juegan distinto:
// otro club, otro vínculo, otro lugar en el plantel, y otros eventos.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createInitialCareer, runCareer, economicModelOf, getClub, computeOvr, hashSeed,
    START_ROUTES, type Chooser, type StartRouteId,
} from '../../index.ts';

const rotatingChooser: Chooser = (event, state) =>
    event.options[hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length].id;

const SEMILLAS = Array.from({ length: 40 }, (_, i) => (i + 1) * 7919);

function arrancar(startRoute: StartRouteId, seed: number, countryCode = 'ar') {
    return createInitialCareer({ position: 'flyhalf', nationalityCountryCode: countryCode, startRoute }, seed);
}

test('la ruta queda sellada en el estado', () => {
    for (const startRoute of START_ROUTES) {
        const state = arrancar(startRoute, 20260726);
        assert.equal(state.startRoute, startRoute, 'la ruta elegida tiene que viajar en el estado');
    }
});

test('sin ruta declarada se asume la más dura, no una al azar', () => {
    const state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'ar' }, 20260726);
    assert.equal(state.startRoute, 'amateur');
});

test('las tres rutas arrancan en contextos claramente distintos', () => {
    // Misma nacionalidad, mismo puesto, misma semilla: lo único que cambia es la
    // ruta. Si dos rutas dieran el mismo (vínculo, plantel), la elección sería
    // decorativa.
    const contextos = START_ROUTES.map((startRoute) => {
        const state = arrancar(startRoute, 20260726);
        return {
            startRoute,
            model: economicModelOf(getClub(state.player.club)),
            employment: state.player.employment,
            squadTrack: state.player.squadTrack,
        };
    });

    const firmas = new Set(contextos.map((c) => `${c.employment}/${c.squadTrack}`));
    assert.equal(firmas.size, 3, `las tres rutas colapsaron en ${firmas.size} contextos: ${[...firmas].join(', ')}`);

    const amateur = contextos.find((c) => c.startRoute === 'amateur')!;
    const desarrollo = contextos.find((c) => c.startRoute === 'development')!;
    const profesional = contextos.find((c) => c.startRoute === 'professional')!;

    assert.equal(amateur.model, 'amateur', 'la ruta amateur arranca en un club amateur');
    assert.equal(amateur.employment, 'amateur');
    assert.equal(amateur.squadTrack, 'senior');

    assert.equal(desarrollo.squadTrack, 'development', 'la ruta de desarrollo entra por la academia');
    assert.notEqual(desarrollo.model, 'amateur', 'la academia necesita una estructura detrás');

    assert.equal(profesional.squadTrack, 'senior', 'el profesional entra al plantel principal');
    assert.notEqual(profesional.model, 'amateur', 'la ruta profesional no arranca en un club amateur');
});

test('el OVR de arranque escala con la ruta', () => {
    const medianas = START_ROUTES.map((startRoute) => {
        const ovrs = SEMILLAS.map((seed) => {
            const state = arrancar(startRoute, seed);
            return computeOvr(state.player.attributes, state.player.position);
        }).sort((a, b) => a - b);
        return { startRoute, mediana: ovrs[Math.floor(ovrs.length / 2)] };
    });

    const [amateur, desarrollo, profesional] = medianas;
    assert.ok(amateur.mediana < desarrollo.mediana, `amateur (${amateur.mediana}) tiene que arrancar por debajo de desarrollo (${desarrollo.mediana})`);
    assert.ok(desarrollo.mediana < profesional.mediana, `desarrollo (${desarrollo.mediana}) por debajo de profesional (${profesional.mediana})`);
});

test('el amateur debuta más tarde', () => {
    const edad = (startRoute: StartRouteId) => arrancar(startRoute, 20260726).player.age;
    assert.ok(edad('amateur') > edad('professional'), 'el que trabaja o estudia llega más tarde al senior');
});

test('al que arrancó profesional NUNCA le ofrecen dar el salto al profesionalismo', () => {
    // Se verifica corriendo carreras COMPLETAS, no leyendo la precondición: lo
    // que importa es que el evento no aparezca de verdad.
    const ascensos = ['env-semi-pro-offer', 'env-compensated-semi-offer'];

    let vistosEnAmateur = 0;
    for (const seed of SEMILLAS) {
        for (const d of runCareer({ position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'amateur' }, seed, rotatingChooser).decisionLog) {
            if (ascensos.includes(d.eventId)) vistosEnAmateur++;
        }
    }
    assert.ok(vistosEnAmateur > 0, 'el ascenso tiene que seguir existiendo dentro de la ruta amateur');

    for (const seed of SEMILLAS) {
        const state = runCareer({ position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'professional' }, seed, rotatingChooser);
        for (const d of state.decisionLog) {
            assert.ok(
                !ascensos.includes(d.eventId),
                `semilla ${seed}: al que arrancó profesional le apareció ${d.eventId}, que ya no es una oportunidad para él`,
            );
        }
    }
});

test('una ruta sin clubes del modelo pedido degrada, no rompe', () => {
    // Chile no tiene clubes de modelo profesional en su pirámide doméstica más
    // allá de su franquicia. Sea cual sea el resultado, la carrera tiene que
    // existir y dejar registrado que hubo degradación.
    for (const countryCode of ['cl', 'uy', 'ar', 'nz', 'fr', 'jp', 'es', 'za', 'gb-eng']) {
        for (const startRoute of START_ROUTES) {
            const state = arrancar(startRoute, 12345, countryCode);
            assert.ok(state.player.club.length > 0, `${countryCode}/${startRoute}: se quedó sin club`);
            assert.equal(
                state.player.startRouteModel,
                economicModelOf(getClub(state.player.club)),
                `${countryCode}/${startRoute}: el modelo registrado no es el del club real`,
            );
            assert.equal(typeof state.player.routeDowngraded, 'boolean');
        }
    }
});

test('la ruta acota el universo pero NO elige el club', () => {
    // Si la ruta eligiera el club, todas las carreras de la misma ruta y país
    // arrancarían en el mismo lado y no habría nada que descubrir.
    const clubes = new Set(SEMILLAS.map((seed) => arrancar('amateur', seed).player.club));
    assert.ok(clubes.size > 3, `la ruta amateur colapsó en ${clubes.size} clubes distintos`);
});
