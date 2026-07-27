import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EMPLOYMENT_ORDER,
    contractLabel,
    employmentCeiling,
    employmentRank,
    resolveContract,
    renewContract,
} from './contracts.ts';
import { economicModelOf } from '../data/competition-levels2026.ts';
import { getClub } from '../data/clubs.ts';
import { createInitialCareer, careerReducer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';

const contract = (clubId: string, over: Partial<Parameters<typeof resolveContract>[0]> = {}) =>
    resolveContract({ club: getClub(clubId), age: 18, value: 42, potential: 80, ovr: 40, role: 'fringe', ...over });

test('empleo y track son ejes SEPARADOS', () => {
    assert.deepEqual([...EMPLOYMENT_ORDER], [
        'amateur', 'amateur-compensated', 'semi-professional', 'full-time-professional',
    ]);
    // "development" NO es un valor de empleo: es un track.
    assert.equal(contractLabel('semi-professional', 'development'), 'Desarrollo');
    assert.equal(contractLabel('semi-professional', 'senior'), 'Semipro');
    assert.equal(contractLabel('full-time-professional', 'senior'), 'Profesional');
});

test('un club AMATEUR nunca ofrece full-time ni development', () => {
    const amateur = ['sb-cuba', 'sb-hindu-club'].map(getClub).filter((c) => economicModelOf(c) === 'amateur');
    for (const club of amateur) {
        for (const value of [30, 50, 70, 95]) {
            for (const role of ['starter', 'rotation', 'fringe'] as const) {
                const r = resolveContract({ club, age: 22, value, potential: 90, ovr: 70, role });
                assert.notEqual(r.employment, 'full-time-professional', `${club.name} ofreció full-time`);
                assert.equal(r.track, 'senior', `${club.name} no tiene academia de desarrollo`);
            }
        }
    }
    assert.equal(employmentCeiling('amateur'), 'amateur-compensated');
});

test('un juvenil en club PROFESIONAL entra por DESARROLLO (track), no full-time senior', () => {
    for (const clubId of ['canterbury', 'saitama-wild-knights', 'stade-toulousain']) {
        const r = contract(clubId);
        assert.equal(economicModelOf(getClub(clubId)), 'professional');
        assert.equal(r.track, 'development', `${clubId}: un pibe de 18 OVR 40`);
        assert.notEqual(r.employment, 'amateur', 'una promesa profesional no es amateur');
    }
});

test('development NO es un escalón económico entre compensado y semipro', () => {
    // Un development de club profesional puede tener empleo por encima de un
    // semipro de una liga mixta: son ejes independientes.
    const devPro = resolveContract({ club: getClub('stade-toulousain'), age: 19, value: 44, potential: 92, ovr: 42, role: 'fringe' });
    assert.equal(devPro.track, 'development');
    assert.ok(employmentRank(devPro.employment) >= employmentRank('semi-professional'), 'promesa contratada');
});

test('el empleo sube UN escalón por vez y el track gradúa a senior', () => {
    const club = getClub('canterbury');
    const start = { employment: 'amateur-compensated' as const, track: 'development' as const };
    const next = renewContract(start, { club, age: 24, value: club.rating + 5, potential: 88, ovr: 76, role: 'starter' });
    assert.equal(next.track, 'senior', 'ya rinde: gradúa a senior');
    assert.ok(employmentRank(next.employment) - employmentRank(start.employment) <= 1, 'no salta dos escalones');
});

test('el empleo puede BAJAR: un veterano en caída pierde categoría', () => {
    const club = getClub('stade-toulousain');
    const dropped = renewContract(
        { employment: 'full-time-professional', track: 'senior' },
        { club, age: 36, value: 38, potential: 70, ovr: 60, role: 'fringe' },
    );
    assert.ok(employmentRank(dropped.employment) < employmentRank('full-time-professional'), 'baja de vínculo');
    assert.equal(dropped.track, 'senior', 'no vuelve a desarrollo');
});

test('llegar a SRA puede producir contrato profesional', () => {
    const r = resolveContract({ club: getClub('dogos-xv'), age: 25, value: getClub('dogos-xv').rating, potential: 80, ovr: 68, role: 'starter' });
    assert.equal(r.employment, 'full-time-professional');
    assert.equal(r.track, 'senior');
});

test('la secuencia de empleo+track es determinística con la misma seed', () => {
    const run = () => {
        let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar', origin: 'academia-club' }, 8675309);
        const seq: string[] = [`${state.player.employment}/${state.player.squadTrack}`];
        let guard = 0;
        while (state.phase !== 'retired' && guard < 40) {
            const event = getPendingEvent(state);
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                : careerReducer(state, { type: 'ADVANCE' });
            seq.push(`${state.player.employment}/${state.player.squadTrack}`);
            guard++;
        }
        return seq;
    };
    assert.deepEqual(run(), run());
});

test('existen carreras amateur, semipro y profesionales', () => {
    const reached = new Set<string>();
    for (const [nationality, base] of [['ar', 1], ['fr', 2], ['nz', 3], ['es', 4]] as const) {
        for (let i = 0; i < 12; i++) {
            let state = createInitialCareer({ position: 'centre', nationalityCountryCode: nationality, origin: 'academia-club' }, (base * 100 + i) * 7919);
            let guard = 0;
            let best = state.player.employment;
            while (state.phase !== 'retired' && guard < 40) {
                const event = getPendingEvent(state);
                state = event
                    ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                    : careerReducer(state, { type: 'ADVANCE' });
                if (employmentRank(state.player.employment) > employmentRank(best)) best = state.player.employment;
                guard++;
            }
            reached.add(best);
        }
    }
    assert.ok(reached.size >= 3, `poca variedad: ${[...reached].join(', ')}`);
    assert.ok(reached.has('amateur') || reached.has('amateur-compensated'), 'debe haber carreras no profesionales');
});
