import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOURNAMENT_THEMES as T, resolveTournamentExportTheme as resolve } from './tournamentThemes';

const ids = (names: string[]) => names.map((name) => resolve(name)?.id ?? null);

test('regionales: rojo', () => {
    assert.deepEqual(
        ids([
            'Top 14 de la URBA',
            'Torneo Regional del NOA "A"',
            'Top 10 del Centro',
            'Copa Oro del Oeste',
            'Torneo Regional del NEA',
            'Torneo Norpatagónico',
            'Torneo Regional Pampeano',
            'Torneo Regional del Litoral "A"',
        ]),
        Array(8).fill(T.regional.id),
    );
});

test('ascenso y desarrollo: dorado', () => {
    assert.deepEqual(
        ids([
            'Primera "A" de la URBA',
            'Primera "C" de la URBA',
            'Súper 9 "B"',
            'Regional Centro "B"',
            'Torneo Cordobés - Preintermedia "A"',
            'URBA: Desarrollo - Superior',
            'Torneo Regional del NEA Ascenso',
            'Torneo Regional Pampeano B',
            'Torneo Regional del Litoral "B"',
            'Copa Plata del Oeste',
        ]),
        Array(10).fill(T.ascenso.id),
    );
});

test('juveniles: negro con verde', () => {
    assert.deepEqual(
        ids(['Campeonato Argentino Juvenil M18', 'Torneo Cordobés M19 "A"', 'URBA: Juveniles - Primera rueda - M 15 - Grupo I - Zona A']),
        Array(3).fill(T.juvenil.id),
    );
});

test('otros paises', () => {
    assert.equal(resolve('Campeonato Uruguayo de Rugby')?.id, T.uruguay.id);
    assert.equal(resolve('Super 12 – Primeira Divisão')?.id, T.brasil.id);
    assert.equal(resolve('Copa do Brasil de Rugby')?.id, T.brasil.id);
    assert.equal(resolve('División de Honor')?.id, T.espana.id);
    assert.equal(resolve('Top 10 de ARUSA')?.id, T.chileTop.id);
    assert.equal(resolve('Segunda División de ARUSA')?.id, T.chileAscenso.id);
    assert.equal(resolve('Intermedia de Primera de ARUSA')?.id, T.chileAscenso.id);
});

test('Europa y superligas', () => {
    assert.equal(resolve('Top 14')?.id, T.top14Francia.id);
    assert.equal(resolve('Premiership Rugby')?.id, T.premiership.id);
    assert.equal(resolve('United Rugby Championship')?.id, T.urc.id);
    assert.equal(resolve('Super Rugby')?.id, T.urc.id);
    assert.equal(resolve('Super Rugby Americas')?.id, T.superRugbyAmericas.id);
    assert.equal(resolve('Champions Cup')?.id, T.europa.id);
    assert.equal(resolve('Six Nations')?.id, T.seisNaciones.id);
});

test('Nations y Rugby Championship', () => {
    assert.equal(resolve('Nations Championship')?.id, T.nationsChampionship.id);
    assert.equal(resolve('Nations Cup')?.id, T.celeste.id);
    assert.equal(resolve('Rugby Championship')?.id, T.celeste.id);
});

test('lo que no esta en las reglas queda sin tema', () => {
    assert.equal(resolve('Currie Cup'), null);
    assert.equal(resolve(''), null);
    assert.equal(resolve(undefined), null);
});
