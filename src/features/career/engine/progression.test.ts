import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialCareer, careerReducer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';
import { computeOvr, computeEffectiveOvr } from './scoring.ts';
import { deriveEnvironment } from './environment.ts';
import { applyAging, growthScaleFor } from './aging.ts';
import { createRng, type Rng } from './random.ts';
import { createPlayer } from './create-player.ts';
import { getClub } from '../data/clubs.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';

// ── Contrafactual: MISMO jugador, MISMO seed, solo cambia el entorno ─────────
// Reproduce el crecimiento de una temporada joven bajo distintos entornos,
// manteniendo idénticos edad, potencial, posición, atributos y azar.
function grownOvr(clubId: string, employment: EmploymentStatus, squadTrack: SquadTrack, seed: number): number {
    const player = createPlayer({ position: 'centre', nationalityCountryCode: 'fr', origin: 'seleccionado-juvenil' }, createRng(seed));
    player.age = 20;
    const club = getClub(clubId);
    const environment = deriveEnvironment({
        club, employment, squadTrack, age: player.age, role: 'rotation',
        severeInjuries: 0, cupCount: 0, international: false,
    });
    const environmentSupport = 0.70 + environment.trainingQuality * 0.50 + environment.trainingLoad * 0.16;
    const loadPenaltyFactor = 1 - environment.lifeLoad * 0.14;
    const before = computeOvr(player.attributes, player.position);
    const rng: Rng = createRng(seed + 1);
    applyAging(player.attributes, player.age, 'back', rng, growthScaleFor(before, player.potential) * environmentSupport * loadPenaltyFactor);
    return computeOvr(player.attributes, player.position) - before;
}

function medianGrowth(clubId: string, employment: EmploymentStatus, track: SquadTrack): number {
    const gains = Array.from({ length: 60 }, (_, i) => grownOvr(clubId, employment, track, (i + 1) * 7919));
    return gains.sort((a, b) => a - b)[Math.floor(gains.length / 2)];
}

test('en comparación CONTROLADA, el entorno profesional desarrolla más que el amateur', () => {
    const pro = medianGrowth('stade-toulousain', 'full-time-professional', 'senior');
    const semi = medianGrowth('vrac-valladolid', 'semi-professional', 'senior');
    const amateur = medianGrowth('sb-cuba', 'amateur', 'senior');
    assert.ok(pro >= semi, `profesional (${pro}) ≥ semipro (${semi})`);
    assert.ok(semi >= amateur, `semipro (${semi}) ≥ amateur (${amateur})`);
    assert.ok(pro > amateur, `el gradiente existe: pro ${pro} > amateur ${amateur}`);
});

test('el desarrollo (academia) aporta mucho entrenamiento aunque juegue poco', () => {
    // Mismo club de élite, un jugador en desarrollo crece por entrenamiento.
    const dev = medianGrowth('stade-toulousain', 'semi-professional', 'development');
    const amateur = medianGrowth('sb-cuba', 'amateur', 'senior');
    assert.ok(dev > amateur, `la academia (${dev}) desarrolla más que el amateur (${amateur})`);
});

test('el entorno NO modifica el potencial oculto', () => {
    // El mismo jugador conserva su potencial pase lo que pase con el entorno.
    const player = createPlayer({ position: 'centre', nationalityCountryCode: 'fr' }, createRng(4242));
    const before = player.potential;
    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'fr', origin: 'academia-club' }, 4242);
    const startPotential = state.player.potential;
    let guard = 0;
    while (state.phase !== 'retired' && guard < 20) {
        const event = getPendingEvent(state);
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
            : careerReducer(state, { type: 'ADVANCE' });
        assert.equal(state.player.potential, startPotential, 'el potencial no cambia con el entorno');
        guard++;
    }
    void before;
});

test('un jugador de bajo potencial no llega a élite solo por entrenar en un gran club', () => {
    // Potencial bajo forzado: aunque el entorno sea de élite, el techo manda.
    const player = createPlayer({ position: 'centre', nationalityCountryCode: 'fr' }, createRng(999));
    player.potential = 55; // techo bajo
    const club = getClub('stade-toulousain');
    const environment = deriveEnvironment({
        club, employment: 'full-time-professional', squadTrack: 'development', age: 20, role: 'rotation',
        severeInjuries: 0, cupCount: 0, international: false,
    });
    const environmentSupport = 0.70 + environment.trainingQuality * 0.50 + environment.trainingLoad * 0.16;
    let ovr = computeOvr(player.attributes, player.position);
    const rng = createRng(1000);
    for (let age = 20; age < 30; age++) {
        applyAging(player.attributes, age, 'back', rng, growthScaleFor(ovr, player.potential) * environmentSupport);
        ovr = computeOvr(player.attributes, player.position);
    }
    assert.ok(ovr <= player.potential + 2, `un potencial 55 no llega a élite entrenando (llegó a ${ovr})`);
    assert.ok(ovr < 74, 'no alcanza nivel de élite mundial');
});

test('una lesión grave puede frenar o revertir la evolución de la temporada', () => {
    // Con una lesión grave activa, el OVR efectivo cae respecto de sin lesión.
    const healthy = createPlayer({ position: 'centre', nationalityCountryCode: 'fr' }, createRng(321));
    const injured = createPlayer({ position: 'centre', nationalityCountryCode: 'fr' }, createRng(321));
    injured.injuries.push({ season: injured.seasonsPlayed, age: injured.age, name: 'Rodilla', severity: 'grave', seasonsOut: 0.75, ovrImpact: 6 });
    assert.ok(computeEffectiveOvr(injured) < computeEffectiveOvr(healthy), 'la lesión grave penaliza');
});

test('el tope de progresión impide saltos absurdos de OVR en una temporada', () => {
    for (const seed of [11, 22, 33, 44, 55, 66]) {
        let state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'nz', origin: 'seleccionado-juvenil' }, seed);
        let guard = 0;
        while (state.phase !== 'retired' && guard < 30) {
            const event = getPendingEvent(state);
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                : careerReducer(state, { type: 'ADVANCE' });
            for (const season of state.seasons) {
                assert.ok(season.ovrEnd - season.ovrStart <= 9, `salto de OVR absurdo: ${season.ovrEnd - season.ovrStart}`);
            }
            guard++;
        }
    }
});
