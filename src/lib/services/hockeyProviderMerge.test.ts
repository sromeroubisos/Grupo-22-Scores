import test from 'node:test';
import assert from 'node:assert/strict';

import type { Match } from '../../types/match.ts';
import { FIH_COMPETITIONS } from './fihHockeyParser.ts';
import { hockeyMatchIdentity, mergeHockeyProviders } from './hockeyProviderMerge.ts';

/**
 * La regla que se prueba acá es la que ya falló dos veces:
 *
 *  1. dejando pasar el Mundial duplicado (FlashScore lo publica en inglés y con
 *     la rama femenina marcada con sufijo);
 *  2. y después, al arreglar lo anterior de más: sacando el hockey de FlashScore
 *     ENTERO, con lo cual el feed se quedaba sin nada que no fuera el Mundial.
 *
 * El caso que cierra la segunda es "una liga de clubes sobrevive".
 */

let sequence = 0;

function match(overrides: Partial<Match> & { home: string; away: string; day: string }): Match {
    sequence += 1;
    const { home, away, day, ...rest } = overrides;
    return {
        id: `m-${sequence}`,
        tournamentId: 'fs-generico',
        leagueName: 'Torneo',
        phaseId: 'group',
        round: 1,
        homeTeamId: `t-${home}`,
        homeTeamName: home,
        awayTeamId: `t-${away}`,
        awayTeamName: away,
        scheduledAt: new Date(`${day}T15:00:00.000Z`),
        status: 'scheduled',
        score: { home: null, away: null },
        result: { isComplete: false, updatedAt: null, updatedBy: null, version: 1 },
        createdFrom: 'generator',
        createdAt: new Date('2026-08-14T00:00:00.000Z'),
        updatedAt: new Date('2026-08-14T00:00:00.000Z'),
        ...rest,
    } as Match;
}

const fihMasculino = (home: string, away: string, day: string) =>
    match({ home, away, day, id: `fih-match-m-${(sequence += 1)}`, tournamentId: FIH_COMPETITIONS.m.tournamentId, leagueName: FIH_COMPETITIONS.m.name });

const fihFemenino = (home: string, away: string, day: string) =>
    match({ home, away, day, id: `fih-match-w-${(sequence += 1)}`, tournamentId: FIH_COMPETITIONS.w.tournamentId, leagueName: FIH_COMPETITIONS.w.name });

test('la copia del Mundial que publica FlashScore no entra dos veces', () => {
    const fih = [fihMasculino('India', 'Gales', '2026-08-15')];
    const flashscore = [match({ home: 'India', away: 'Wales', day: '2026-08-15', leagueName: 'WORLD: World Cup' })];

    const merged = mergeHockeyProviders(fih, flashscore);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, fih[0].id, 'gana la fuente oficial');
});

test('el sufijo femenino de FlashScore no engaña: "Australia W" es Australia', () => {
    const fih = [fihFemenino('Australia', 'Japón', '2026-08-15')];
    const flashscore = [match({ home: 'Australia W', away: 'Japan W', day: '2026-08-15', leagueName: 'WORLD: World Cup Women' })];

    assert.equal(mergeHockeyProviders(fih, flashscore).length, 1);
});

test('FlashScore publica el código y no el nombre largo: "USA W" es Estados Unidos', () => {
    const fih = [fihFemenino('Argentina', 'Estados Unidos', '2026-08-15')];
    const flashscore = [match({ home: 'Argentina W', away: 'USA W', day: '2026-08-15', leagueName: 'WORLD: World Cup Women' })];

    assert.equal(mergeHockeyProviders(fih, flashscore).length, 1);
});

test('el mismo par el mismo día en las dos ramas son DOS partidos', () => {
    const fih = [fihMasculino('Argentina', 'Países Bajos', '2026-08-20')];
    const flashscore = [match({ home: 'Argentina W', away: 'Netherlands W', day: '2026-08-20', leagueName: 'WORLD: World Cup Women' })];

    assert.equal(mergeHockeyProviders(fih, flashscore).length, 2);
});

test('LA REGRESIÓN: una liga de clubes de FlashScore sobrevive al Mundial', () => {
    const fih = [fihMasculino('India', 'Gales', '2026-08-15')];
    const flashscore = [
        match({ home: 'India', away: 'Wales', day: '2026-08-15', leagueName: 'WORLD: World Cup' }),
        match({ home: 'Rot-Weiss Köln', away: 'Bloemendaal', day: '2026-08-15', leagueName: 'EUROPE: Euro Hockey League' }),
        match({ home: 'Banco Provincia', away: 'Ciudad de Buenos Aires', day: '2026-08-15', leagueName: 'ARGENTINA: Metropolitano' }),
    ];

    const merged = mergeHockeyProviders(fih, flashscore);

    assert.equal(merged.length, 3);
    assert.deepEqual(
        merged.map((m) => m.homeTeamName).sort(),
        ['Banco Provincia', 'India', 'Rot-Weiss Köln'].sort(),
    );
});

test('un partido del Mundial que la FIH todavía no publicó no se pierde', () => {
    const fih = [fihMasculino('India', 'Gales', '2026-08-15')];
    const flashscore = [match({ home: 'Belgium', away: 'France', day: '2026-08-15', leagueName: 'WORLD: World Cup' })];

    assert.equal(mergeHockeyProviders(fih, flashscore).length, 2);
});

test('la identidad no depende del proveedor ni del orden de los equipos', () => {
    const local = fihMasculino('India', 'Gales', '2026-08-15');
    const visitante = match({ home: 'Wales', away: 'India', day: '2026-08-15', leagueName: 'WORLD: World Cup' });

    assert.equal(hockeyMatchIdentity(local), hockeyMatchIdentity(visitante));
});

test('sin partidos de la FIH, lo de FlashScore pasa entero', () => {
    const flashscore = [
        match({ home: 'Rot-Weiss Köln', away: 'Bloemendaal', day: '2026-05-10', leagueName: 'EUROPE: Euro Hockey League' }),
        match({ home: 'Amsterdam', away: 'Den Bosch', day: '2026-05-10', leagueName: 'NETHERLANDS: Hoofdklasse' }),
    ];

    assert.equal(mergeHockeyProviders([], flashscore).length, 2);
});
