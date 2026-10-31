import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countMatches, daySlotTimes, placeInSlots, planRounds, validateSlotConfig, type FixtureTeam, type SlotConfig } from './autoFixture.ts';

const teams = (n: number, groupOf?: (i: number) => string): FixtureTeam[] =>
    Array.from({ length: n }, (_, i) => ({ id: `t${String(i + 1).padStart(2, '0')}`, groupId: groupOf ? groupOf(i) : null }));

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

test('todos contra todos: cada par se cruza una sola vez y nadie juega dos veces por fecha', () => {
    for (const n of [4, 5, 6, 7, 8]) {
        const rounds = planRounds({ teams: teams(n), scope: 'all', legs: 1 });
        const seen = new Set<string>();
        for (const round of rounds) {
            const inRound = new Set<string>();
            for (const m of round.matches) {
                assert.ok(!inRound.has(m.homeId) && !inRound.has(m.awayId), `n=${n}: repite equipo en la fecha ${round.number}`);
                inRound.add(m.homeId);
                inRound.add(m.awayId);
                const key = pairKey(m.homeId, m.awayId);
                assert.ok(!seen.has(key), `n=${n}: ${key} se repite`);
                seen.add(key);
            }
        }
        assert.equal(seen.size, (n * (n - 1)) / 2);
        assert.equal(rounds.length, n % 2 === 0 ? n - 1 : n);
    }
});

test('cantidad impar: en cada fecha descansa un equipo', () => {
    const rounds = planRounds({ teams: teams(5), scope: 'all', legs: 1 });
    assert.ok(rounds.every((r) => r.byes.length === 1));
});

test('ida y vuelta: la vuelta invierte la localía y los partidos se duplican', () => {
    const one = planRounds({ teams: teams(6), scope: 'all', legs: 1 });
    const two = planRounds({ teams: teams(6), scope: 'all', legs: 2 });
    assert.equal(two.length, one.length * 2);
    const first = one.flatMap((r) => r.matches);
    const second = two.slice(one.length).flatMap((r) => r.matches);
    first.forEach((m, i) => {
        assert.equal(second[i].homeId, m.awayId);
        assert.equal(second[i].awayId, m.homeId);
    });
});

test('tres y cuatro veces: cada par se enfrenta esa cantidad de veces', () => {
    for (const legs of [3, 4]) {
        const matches = planRounds({ teams: teams(4), scope: 'all', legs }).flatMap((r) => r.matches);
        const counts = new Map<string, number>();
        for (const m of matches) counts.set(pairKey(m.homeId, m.awayId), (counts.get(pairKey(m.homeId, m.awayId)) ?? 0) + 1);
        assert.ok([...counts.values()].every((c) => c === legs));
    }
});

test('dentro de la zona: dos zonas de 4 juegan en paralelo y no se cruzan', () => {
    const input = teams(8, (i) => (i < 4 ? 'zA' : 'zB'));
    const rounds = planRounds({ teams: input, scope: 'within_groups', legs: 1 });
    assert.equal(rounds.length, 3);
    for (const round of rounds) {
        assert.equal(round.matches.length, 4);
        for (const m of round.matches) {
            const g = (id: string) => input.find((t) => t.id === id)?.groupId;
            assert.equal(g(m.homeId), g(m.awayId));
            assert.equal(m.groupId, g(m.homeId));
        }
    }
});

test('dentro de la zona: zonas de distinto tamaño no rompen nada', () => {
    const input = teams(7, (i) => (i < 4 ? 'zA' : 'zB'));
    const rounds = planRounds({ teams: input, scope: 'within_groups', legs: 1 });
    assert.equal(rounds.reduce((s, r) => s + r.matches.length, 0), 6 + 3);
});

test('entre zonas: todos los de A contra todos los de B, y nadie con los de su zona', () => {
    const input = teams(8, (i) => (i < 4 ? 'zA' : 'zB'));
    const rounds = planRounds({ teams: input, scope: 'between_groups', legs: 1 });
    const matches = rounds.flatMap((r) => r.matches);
    assert.equal(matches.length, 16);
    const g = (id: string) => input.find((t) => t.id === id)?.groupId;
    assert.ok(matches.every((m) => g(m.homeId) !== g(m.awayId) && m.groupId === null));
    for (const round of rounds) {
        const ids = round.matches.flatMap((m) => [m.homeId, m.awayId]);
        assert.equal(new Set(ids).size, ids.length);
    }
    assert.equal(rounds.length, 4);
});

test('entre zonas con una sola zona no genera nada', () => {
    assert.deepEqual(planRounds({ teams: teams(6, () => 'zA'), scope: 'between_groups', legs: 1 }), []);
});

test('es determinista: el orden de entrada no cambia el fixture', () => {
    const a = teams(6);
    const b = [...a].reverse();
    assert.deepEqual(planRounds({ teams: a, scope: 'all', legs: 2 }), planRounds({ teams: b, scope: 'all', legs: 2 }));
});

test('countMatches coincide con el fixture armado', () => {
    assert.equal(countMatches({ teams: teams(6), scope: 'all', legs: 2 }), 30);
});

const baseSlots: SlotConfig = {
    startDate: '2026-11-07', // sábado
    weekdays: [6],
    windowStart: '10:00',
    windowEnd: '18:00',
    durationMin: 80,
    gapMin: 10,
    venues: [],
};

test('franja horaria: el último partido termina antes del cierre', () => {
    // 10:00, 11:30, 13:00, 14:30, 16:00 (termina 17:20). 17:30 ya no entra.
    assert.deepEqual(daySlotTimes(baseSlots), [600, 690, 780, 870, 960]);
});

test('calendario: una fecha por sábado y los horarios se reparten por cancha', () => {
    const rounds = planRounds({ teams: teams(4), scope: 'all', legs: 1 });
    const out = placeInSlots(rounds, { ...baseSlots, venues: ['Cancha 1', 'Cancha 2'] });
    assert.deepEqual(out.spilledRounds, []);
    assert.deepEqual([...new Set(out.placed.map((p) => p.date))], ['2026-11-07', '2026-11-14', '2026-11-21']);
    const first = out.placed.filter((p) => p.roundNumber === 1);
    assert.deepEqual(first.map((p) => [p.time, p.venue]), [['10:00', 'Cancha 1'], ['10:00', 'Cancha 2']]);
    assert.equal(out.firstDate, '2026-11-07');
    assert.equal(out.lastDate, '2026-11-21');
});

test('calendario: si la fecha no entra en un día sigue en el siguiente y lo avisa', () => {
    const rounds = planRounds({ teams: teams(14), scope: 'all', legs: 1 });
    // 7 partidos por fecha, 5 horarios en una cancha: se parte.
    const out = placeInSlots(rounds, baseSlots);
    assert.equal(out.spilledRounds.length, rounds.length);
    const day = (n: number) => new Set(out.placed.filter((p) => p.roundNumber === n).map((p) => p.date));
    assert.equal(day(1).size, 2);
});

test('calendario: respeta los días sin juego', () => {
    const rounds = planRounds({ teams: teams(4), scope: 'all', legs: 1 });
    const out = placeInSlots(rounds, { ...baseSlots, skipDates: ['2026-11-14'] });
    assert.deepEqual([...new Set(out.placed.map((p) => p.date))], ['2026-11-07', '2026-11-21', '2026-11-28']);
});

test('calendario: varios días por semana', () => {
    const rounds = planRounds({ teams: teams(4), scope: 'all', legs: 1 });
    const out = placeInSlots(rounds, { ...baseSlots, weekdays: [3, 6], startDate: '2026-11-04' });
    assert.deepEqual([...new Set(out.placed.map((p) => p.date))], ['2026-11-04', '2026-11-07', '2026-11-11']);
});

test('configuración inválida: explica qué falta y no devuelve partidos', () => {
    const bad = { ...baseSlots, weekdays: [], windowEnd: '10:30' };
    assert.ok(validateSlotConfig(bad).length >= 2);
    assert.equal(placeInSlots(planRounds({ teams: teams(4), scope: 'all', legs: 1 }), bad).placed.length, 0);
});

test('sorteo: la misma semilla repite el fixture y otra semilla lo cambia', () => {
    const t = teams(8);
    const a = planRounds({ teams: t, scope: 'all', legs: 1, seed: 11 });
    assert.deepEqual(a, planRounds({ teams: t, scope: 'all', legs: 1, seed: 11 }));
    assert.notDeepEqual(a, planRounds({ teams: t, scope: 'all', legs: 1, seed: 12 }));
    const seen = new Set(a.flatMap((r) => r.matches).map((m) => pairKey(m.homeId, m.awayId)));
    assert.equal(seen.size, 28);
});

test('rango de fechas: avisa cuántos partidos quedan después del último día', () => {
    const rounds = planRounds({ teams: teams(4), scope: 'all', legs: 1 });
    const out = placeInSlots(rounds, { ...baseSlots, endDate: '2026-11-14' });
    assert.equal(out.pastEndDate, 2);
});

test('simultáneo: la última fecha se juega toda a la misma hora y las demás no', () => {
    const rounds = planRounds({ teams: teams(6), scope: 'all', legs: 1 });
    const out = placeInSlots(rounds, { ...baseSlots, simultaneous: 'last_round' });
    const last = out.placed.filter((p) => p.roundNumber === rounds.length);
    assert.equal(new Set(last.map((p) => `${p.date} ${p.time}`)).size, 1);
    const first = out.placed.filter((p) => p.roundNumber === 1);
    assert.ok(new Set(first.map((p) => p.time)).size > 1);
});

test('simultáneo en todas las fechas, y sin la opción no cambia nada', () => {
    const rounds = planRounds({ teams: teams(6), scope: 'all', legs: 1 });
    const all = placeInSlots(rounds, { ...baseSlots, simultaneous: 'all_rounds' });
    for (const r of rounds) assert.equal(new Set(all.placed.filter((p) => p.roundNumber === r.number).map((p) => p.time)).size, 1);
    assert.deepEqual(placeInSlots(rounds, { ...baseSlots, simultaneous: 'none' }), placeInSlots(rounds, baseSlots));
});
