import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_EVENTS } from '../data/events/index.ts';
import { ENVIRONMENT_EVENTS } from '../data/events/environment-events.ts';
import { createInitialCareer, careerReducer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';

test('cada estado contractual tiene al menos un evento elegible', () => {
    const employments: EmploymentStatus[] = ['amateur', 'amateur-compensated', 'semi-professional', 'full-time-professional'];
    for (const employment of employments) {
        const matching = ENVIRONMENT_EVENTS.filter((e) => !e.requires?.employment || e.requires.employment.includes(employment));
        assert.ok(matching.length > 0, `sin eventos de entorno para empleo ${employment}`);
    }
    const tracks: SquadTrack[] = ['development', 'senior'];
    for (const track of tracks) {
        const matching = ENVIRONMENT_EVENTS.filter((e) => !e.requires?.squadTrack || e.requires.squadTrack.includes(track));
        assert.ok(matching.length > 0, `sin eventos para track ${track}`);
    }
    // Hay eventos específicos de desarrollo, semipro y élite.
    assert.ok(ENVIRONMENT_EVENTS.some((e) => e.requires?.squadTrack?.includes('development')), 'faltan eventos de desarrollo');
    assert.ok(ENVIRONMENT_EVENTS.some((e) => e.requires?.employment?.includes('semi-professional')), 'faltan eventos semipro');
    assert.ok(ENVIRONMENT_EVENTS.some((e) => (e.requires?.minSportingBand ?? 0) >= 7), 'faltan eventos de élite');
});

test('ningún pool queda muerto: en una carrera aparecen eventos de varias categorías', () => {
    const categoriesSeen = new Set<string>();
    for (const nationality of ['ar', 'fr', 'nz']) {
        for (let i = 0; i < 20; i++) {
            let state = createInitialCareer({ position: 'centre', nationalityCountryCode: nationality, origin: 'academia-club' }, (i + 1) * 7919);
            let guard = 0;
            while (state.phase !== 'retired' && guard < 40) {
                const event = getPendingEvent(state);
                if (event) categoriesSeen.add(event.category);
                state = event
                    ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                    : careerReducer(state, { type: 'ADVANCE' });
                guard++;
            }
        }
    }
    assert.ok(categoriesSeen.size >= 4, `pocas categorías de evento: ${[...categoriesSeen].join(', ')}`);
});

test('un evento amateur NO aparece en un full-time profesional', () => {
    // Un evento con requires.economicModels=['amateur'] no puede salir a alguien
    // en un club profesional.
    for (let i = 0; i < 40; i++) {
        let state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'nz', origin: 'seleccionado-juvenil' }, (i + 1) * 7919);
        let guard = 0;
        while (state.phase !== 'retired' && guard < 40) {
            const event = getPendingEvent(state);
            if (event && event.requires?.economicModels?.includes('amateur') && !event.requires.economicModels.includes('professional')) {
                // El jugador NO debe estar en un club profesional.
                assert.ok(state.player.employment !== 'full-time-professional', 'evento amateur en full-time');
            }
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                : careerReducer(state, { type: 'ADVANCE' });
            guard++;
        }
    }
});

test('los eventos de selección solo aparecen con unión elegible', () => {
    // Un país sin unión (Groenlandia) nunca ve un evento de selección.
    for (let i = 0; i < 30; i++) {
        let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'gl', origin: 'academia-club' }, (i + 1) * 7919);
        let guard = 0;
        while (state.phase !== 'retired' && guard < 40) {
            const event = getPendingEvent(state);
            assert.notEqual(event?.category, 'national-team', 'Groenlandia (sin unión) no debe ver eventos de selección');
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                : careerReducer(state, { type: 'ADVANCE' });
            guard++;
        }
    }
});

test('todo evento tiene opciones bien formadas (2-3, con outcomes)', () => {
    for (const event of ALL_EVENTS) {
        assert.ok(event.options.length >= 1 && event.options.length <= 4, `${event.id}: ${event.options.length} opciones`);
        for (const option of event.options) {
            assert.ok(option.outcomes.length >= 1, `${event.id}/${option.id}: sin outcomes`);
            assert.ok(option.label.length > 0, `${event.id}/${option.id}: sin label`);
        }
    }
});

test('el sistema de eventos sigue siendo determinístico con requisitos', () => {
    const run = () => {
        let state = createInitialCareer({ position: 'wing', nationalityCountryCode: 'fr', origin: 'academia-club' }, 8675309);
        const events: string[] = [];
        let guard = 0;
        while (state.phase !== 'retired' && guard < 40) {
            const event = getPendingEvent(state);
            if (event) events.push(event.id);
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id })
                : careerReducer(state, { type: 'ADVANCE' });
            guard++;
        }
        return events;
    };
    assert.deepEqual(run(), run());
});
