import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOAD_WEIGHTS,
    computeSeasonLoad,
    deriveEnvironment,
    loadComponents,
    matchEquivalents,
    seasonInjuryRisk,
    type SeasonEnvironment,
} from './environment.ts';
import { getClub } from '../data/clubs.ts';
import { createPlayer } from './create-player.ts';
import { createRng } from './random.ts';

function env(over: Partial<Parameters<typeof deriveEnvironment>[0]> = {}) {
    return deriveEnvironment({
        club: getClub('stade-toulousain'),
        employment: 'full-time-professional',
        squadTrack: 'senior',
        age: 26,
        role: 'starter',
        severeInjuries: 0,
        cupCount: 0,
        international: false,
        ...over,
    });
}

const basePlayer = () => createPlayer({ position: 'centre', nationalityCountryCode: 'fr' }, createRng(7));

test('los pesos de carga suman 1 y ningún componente es decorativo', () => {
    const sum = LOAD_WEIGHTS.training + LOAD_WEIGHTS.matches + LOAD_WEIGHTS.life + LOAD_WEIGHTS.travel;
    assert.ok(Math.abs(sum - 1) < 1e-9, `los pesos deben sumar 1, suman ${sum}`);
    // Cada componente contribuye de forma medible en un caso realista.
    const comps = loadComponents(env(), 18, 'starter');
    for (const [name, value] of Object.entries(comps)) {
        assert.ok(value > 0.001, `el componente ${name} quedó decorativo (${value})`);
    }
    // El entrenamiento no queda insignificante frente al número bruto de partidos.
    assert.ok(comps.training >= comps.matches * 0.6, 'el entrenamiento pesa comparable a los partidos');
});

test('los equivalentes de partido dependen del rol, no solo de las apariciones', () => {
    assert.equal(matchEquivalents(20, 'starter'), 20);
    assert.ok(matchEquivalents(20, 'rotation') < 20);
    assert.ok(matchEquivalents(20, 'fringe') < matchEquivalents(20, 'rotation'));
});

// ── Sensibilidad "one factor at a time" ──────────────────────────────────────
function loadWith(e: SeasonEnvironment, appearances = 18) {
    return computeSeasonLoad(e, appearances, 'starter', 0, basePlayer()).currentSeasonLoad;
}

test('subir SOLO lifeLoad aumenta la carga', () => {
    const low = env();
    const high = { ...env(), lifeLoad: Math.min(1, env().lifeLoad + 0.4) };
    assert.ok(loadWith(high) > loadWith(low), 'más vida = más carga');
});

test('subir SOLO viajes aumenta la carga', () => {
    const low = env();
    const high = { ...env(), travelLoad: Math.min(1, env().travelLoad + 0.5) };
    assert.ok(loadWith(high) > loadWith(low), 'más viajes = más carga');
});

test('subir SOLO partidos aumenta la carga', () => {
    const e = env();
    assert.ok(loadWith(e, 26) > loadWith(e, 8), 'más partidos = más carga');
});

test('mejorar SOLO la recuperación reduce el riesgo', () => {
    const player = basePlayer();
    const poor = { ...env(), recoverySupport: 0.1 };
    const good = { ...env(), recoverySupport: 0.95 };
    const risk = (e: SeasonEnvironment) => seasonInjuryRisk(computeSeasonLoad(e, 18, 'starter', 0.3, player), e, player);
    assert.ok(risk(good) < risk(poor), 'mejor recuperación = menos riesgo');
});

test('mejorar el soporte médico reduce el riesgo pero no lo elimina', () => {
    const player = basePlayer();
    const low = { ...env(), medicalSupport: 0.1 };
    const high = { ...env(), medicalSupport: 0.95 };
    const risk = (e: SeasonEnvironment) => seasonInjuryRisk(computeSeasonLoad(e, 18, 'starter', 0.3, player), e, player);
    assert.ok(risk(high) < risk(low), 'mejor medicina = menos riesgo');
    assert.ok(risk(high) > 0.02, 'la medicina no impide TODA lesión');
});

test('un SALTO amateur → SRA pesa más que dos años estables en SRA', () => {
    const player = basePlayer();
    const amateurEnv = env({ club: getClub('sb-cuba'), employment: 'amateur', squadTrack: 'senior', role: 'starter' });
    const sraEnv = env({ club: getClub('dogos-xv'), employment: 'full-time-professional', role: 'starter' });

    const amateurLoad = computeSeasonLoad(amateurEnv, 14, 'starter', 0, player).currentSeasonLoad;
    // Salto: venía de la carga amateur y ahora está en SRA.
    const jump = computeSeasonLoad(sraEnv, 14, 'starter', amateurLoad, player);
    // Estable: dos años seguidos en SRA.
    const stable = computeSeasonLoad(sraEnv, 14, 'starter', sraEnv ? computeSeasonLoad(sraEnv, 14, 'starter', 0, player).currentSeasonLoad : 0, player);
    assert.ok(jump.loadChange > stable.loadChange, 'el salto de entorno debe pesar más que la permanencia');
    assert.ok(jump.loadChange > 0, 'subir de golpe es un salto positivo de carga');
});

test('el cambio de carga es RELATIVO y no explota con pocas apariciones', () => {
    const player = basePlayer();
    // Temporada previa muy baja (pocas apariciones) no debe dar un salto infinito.
    const tiny = computeSeasonLoad(env(), 1, 'fringe', 0, player).currentSeasonLoad;
    const next = computeSeasonLoad(env(), 24, 'starter', tiny, player);
    assert.ok(Number.isFinite(next.loadChange), 'el cambio relativo no explota');
    assert.ok(next.loadChange < 4, `salto acotado, dio ${next.loadChange}`);
});

test('un juvenil de desarrollo en club de élite entrena mucho pero con menor intensidad de partido', () => {
    const senior = env({ role: 'starter', squadTrack: 'senior' });
    const dev = env({ role: 'fringe', squadTrack: 'development' });
    assert.ok(dev.trainingQuality >= 0.8, 'la academia entrena bien');
    assert.ok(dev.matchIntensity < senior.matchIntensity, 'compite en un escalón más blando');
});
