import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTABLE_COUNTRIES, hasUnion } from '../data/nations.ts';
import { hasDomesticCompetition } from './market-routes.ts';
import { sportingBandOf } from '../data/competition-levels2026.ts';
import { createInitialCareer, careerReducer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';
import { getClub } from '../data/clubs.ts';

// Países SIN liga doméstica modelada, muestreados a lo ancho del catálogo.
const NO_LEAGUE = SELECTABLE_COUNTRIES.filter((c) => !hasDomesticCompetition(c.code));
const SAMPLE = [NO_LEAGUE[0], NO_LEAGUE[10], NO_LEAGUE[40], NO_LEAGUE[80], NO_LEAGUE[120], NO_LEAGUE[NO_LEAGUE.length - 1]].filter(Boolean);

test('NINGÚN país sin liga empieza full-time profesional senior', () => {
    let fullTimeStarts = 0;
    let seniorHighBand = 0;
    for (const country of SAMPLE) {
        for (let seed = 1; seed <= 40; seed++) {
            const state = createInitialCareer({ position: 'centre', nationalityCountryCode: country.code, origin: 'academia-club' }, seed * 7919);
            const p = state.player;
            if (p.employment === 'full-time-professional' && p.squadTrack === 'senior') fullTimeStarts++;
            if (sportingBandOf(getClub(p.club)) >= 7 && p.squadTrack === 'senior') seniorHighBand++;
        }
    }
    assert.equal(fullTimeStarts, 0, 'un país sin liga no debe empezar full-time senior');
    assert.equal(seniorHighBand, 0, 'ni entrar como senior en banda 7-8');
});

test('si empieza en un club profesional, lo hace en DESARROLLO', () => {
    for (const country of SAMPLE) {
        for (let seed = 1; seed <= 30; seed++) {
            const state = createInitialCareer({ position: 'wing', nationalityCountryCode: country.code, origin: 'academia-club' }, seed * 7919);
            const club = getClub(state.player.club);
            if (sportingBandOf(club) >= 5) {
                assert.equal(state.player.squadTrack, 'development', `${country.nameEs} en ${club.name} (banda alta) debe ser desarrollo`);
            }
        }
    }
});

test('no existe selección nacional para países sin unión', () => {
    for (const country of SAMPLE) {
        if (hasUnion(country.code)) continue;
        for (let seed = 1; seed <= 20; seed++) {
            let state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: country.code, origin: 'academia-club' }, seed * 7919);
            let guard = 0;
            while (state.phase !== 'retired' && guard < 40) {
                const event = getPendingEvent(state);
                state = event
                    ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                    : careerReducer(state, { type: 'ADVANCE' });
                guard++;
            }
            assert.equal(state.player.caps, 0, `${country.nameEs} no debería tener caps (sin unión)`);
            assert.equal(state.player.nationalTeam, null);
        }
    }
});

test('no se registra banda DISPUTADA sin aparición senior real', () => {
    for (const country of SAMPLE) {
        for (let seed = 1; seed <= 15; seed++) {
            let state = createInitialCareer({ position: 'centre', nationalityCountryCode: country.code, origin: 'academia-club' }, seed * 7919);
            let guard = 0;
            while (state.phase !== 'retired' && guard < 40) {
                const event = getPendingEvent(state);
                state = event
                    ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                    : careerReducer(state, { type: 'ADVANCE' });
                guard++;
            }
            for (const entry of state.history) {
                // Un juvenil de desarrollo sin apariciones no "disputó" la banda del club.
                if (entry.squadTrack === 'development' && entry.appearances < 3) {
                    assert.equal(entry.competitiveBand, 0, `${country.nameEs}: banda disputada sin jugar`);
                }
                // La banda disputada nunca supera la del club.
                assert.ok(entry.competitiveBand <= entry.sportingBand, 'banda disputada ≤ banda del club');
            }
        }
    }
});

test('Groenlandia separa su geografía de su ruta rugbística: no arranca en la élite senior', () => {
    const gl = SELECTABLE_COUNTRIES.find((c) => c.code === 'gl')!;
    for (let seed = 1; seed <= 40; seed++) {
        const state = createInitialCareer({ position: 'centre', nationalityCountryCode: gl.code, origin: 'academia-club' }, seed * 7919);
        const p = state.player;
        assert.ok(
            p.squadTrack === 'development' || sportingBandOf(getClub(p.club)) <= 4,
            'un groenlandés no debuta como senior full-time en la élite',
        );
        assert.notEqual(p.employment, 'full-time-professional', 'ni con vínculo full-time senior inicial');
    }
});

test('el club de un país sin liga pertenece a una ruta migratoria documentada', () => {
    const routeCountries = new Set(['fr', 'gb-eng', 'jp', 'es', 'nz', 'za', 'ar', 'uy', 'cl']);
    for (const country of SAMPLE) {
        for (let seed = 1; seed <= 20; seed++) {
            const state = createInitialCareer({ position: 'lock', nationalityCountryCode: country.code, origin: 'academia-club' }, seed * 7919);
            const club = getClub(state.player.club);
            assert.ok(routeCountries.has(club.countryCode) || club.countryCode === 'multi', `${country.nameEs} → ${club.countryCode} fuera de ruta`);
        }
    }
});
