import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS } from '../data/clubs.ts';
import { getCompetition, participatingCompetitions } from '../data/clubs2026/competitions2026.ts';
import { cupField, referenceStanding, resolveCupWinner, resolveLeagueFinish, standingFor } from './competition-results.ts';
import { createRng } from './random.ts';

const club = (name: string) => CLUBS.find((c) => c.name === name)!;

test('la tabla de referencia ordena por fuerza y es estable', () => {
    assert.equal(referenceStanding(club('Leinster')).position, 1, 'Leinster manda en URC');
    assert.equal(referenceStanding(club('Leinster')).teams, 16);
    assert.equal(referenceStanding(club('Stade Toulousain')).position, 1, 'Toulouse manda en Top 14');
    assert.ok(referenceStanding(club('Zebre Parma')).position > 12, 'Zebre pelea abajo');
    assert.deepEqual(referenceStanding(club('Bath')), referenceStanding(club('Bath')), 'es pura');
});

test('al cambiar de liga la posición vieja NO se arrastra', () => {
    const leinster = club('Leinster');
    const oldStanding = { competitionId: 'top14', position: 1, teams: 14 };
    assert.equal(standingFor(leinster, oldStanding).competitionId, 'urc', 'usa la liga actual del club');
    assert.equal(standingFor(leinster, { competitionId: 'urc', position: 7, teams: 16 }).position, 7);
});

test('el campo de la Champions son los 24 CLASIFICADOS reales', () => {
    const comp = getCompetition('champions-cup')!;
    const leinster = club('Leinster');
    const field = cupField(comp, leinster, referenceStanding(leinster));
    assert.equal(field.length, 24, `esperaba 24 clasificados, hay ${field.length}`);
    const sources = new Set(field.map((c) => c.competitionId));
    assert.deepEqual([...sources].sort(), ['prem', 'top14', 'urc']);
    for (const source of ['prem', 'top14', 'urc']) {
        assert.equal(field.filter((c) => c.competitionId === source).length, 8, `${source}: 8 plazas`);
    }
});

test('clasificar NO es ganar: participar muchas veces ≠ título automático', () => {
    const comp = getCompetition('champions-cup')!;
    const leinster = club('Leinster');
    const connacht = club('Connacht');
    const field = cupField(comp, leinster, referenceStanding(leinster));

    let leinsterWins = 0;
    let connachtWins = 0;
    const runs = 400;
    for (let i = 0; i < runs; i++) {
        const rng = createRng(1000 + i);
        if (resolveCupWinner(comp, field, rng, leinster.id, 0) === leinster.id) leinsterWins++;
        const rng2 = createRng(1000 + i);
        if (resolveCupWinner(comp, [...field, connacht], rng2, connacht.id, 0) === connacht.id) connachtWins++;
    }

    // El más fuerte del campo gana seguido, pero ni de cerca siempre.
    assert.ok(leinsterWins > 0, 'el mejor del campo debe poder ganar');
    assert.ok(leinsterWins < runs * 0.7, `ganar no puede ser automático (${leinsterWins}/${runs})`);
    // Un club de mitad de tabla gana MUY de vez en cuando, no nunca.
    assert.ok(connachtWins < leinsterWins, 'el más flojo gana menos que el más fuerte');
    assert.ok(connachtWins < runs * 0.1, `un club medio no puede ganar seguido (${connachtWins}/${runs})`);
});

test('la liga la gana el 1º, y el más fuerte la gana más seguido', () => {
    const toulouse = club('Stade Toulousain');
    const vannes = club('RC Vannes');
    let toulouseTitles = 0;
    let vannesTitles = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
        if (resolveLeagueFinish(toulouse, createRng(500 + i), 0).position === 1) toulouseTitles++;
        if (resolveLeagueFinish(vannes, createRng(500 + i), 0).position === 1) vannesTitles++;
    }
    assert.ok(toulouseTitles > vannesTitles * 3, `Toulouse ${toulouseTitles} vs Vannes ${vannesTitles}`);
    assert.ok(toulouseTitles < runs, 'ni el mejor gana todas');
});

test('la posición final siempre está dentro del tamaño de la liga', () => {
    for (const name of ['Leinster', 'RC Vannes', 'Majadahonda', 'Selknam']) {
        const target = club(name);
        for (let i = 0; i < 40; i++) {
            const finish = resolveLeagueFinish(target, createRng(90000 + i), 0);
            assert.equal(finish.competitionId, target.competitionId);
            assert.ok(finish.position >= 1 && finish.position <= finish.teams, `posición inválida: ${finish.position}`);
        }
    }
});

test('el resultado es determinístico: mismo estado de RNG ⇒ mismo resultado', () => {
    const target = club('Bath');
    const a = resolveLeagueFinish(target, createRng(777), 1.5);
    const b = resolveLeagueFinish(target, createRng(777), 1.5);
    assert.deepEqual(a, b);

    const comp = getCompetition('champions-cup')!;
    const field = cupField(comp, target, referenceStanding(target));
    assert.equal(
        resolveCupWinner(comp, field, createRng(31337), target.id, 0),
        resolveCupWinner(comp, field, createRng(31337), target.id, 0),
    );
});

test('un club que no clasificó no puede ganar esa copa', () => {
    const comp = getCompetition('champions-cup')!;
    const zebre = club('Zebre Parma');
    const standing = { competitionId: 'urc', position: 14, teams: 16 };
    assert.ok(
        !participatingCompetitions(zebre, standing).some((c) => c.id === 'champions-cup'),
        '14º de URC no juega la Champions',
    );
    const field = cupField(comp, zebre, standing);
    assert.ok(!field.some((c) => c.id === zebre.id), 'no puede estar en el campo');
    for (let i = 0; i < 50; i++) {
        assert.notEqual(resolveCupWinner(comp, field, createRng(i), zebre.id, 0), zebre.id);
    }
});
