import test from 'node:test';
import assert from 'node:assert/strict';

import { puntajeMasCercano, sinRepetidos } from './rugbyPassProfiles.ts';
import type { RugbyPassPlayerMatch } from './rugbyPassCatalog.ts';

/**
 * EL CRUCE ENTRE LA FICHA DEL JUGADOR Y EL PUNTAJE GUARDADO.
 *
 * La ficha publica sus partidos sin id, asi que la llave es la fecha — y las dos
 * fuentes del mismo proveedor no coinciden: el calendario dice una hora y la
 * ficha dice otra tres horas mas tarde. Medido sobre un partido de cada una de
 * las seis competiciones: +3,0 h en las seis.
 *
 * Estos casos son los que rompian las dos alternativas obvias: cruzar por
 * instante (no coincide nunca) y cruzar por dia UTC (el partido de 21:00 se
 * corre al dia siguiente).
 */

const ms = (iso: string) => new Date(iso).getTime();

test('el desfase de tres horas del proveedor cruza igual', () => {
    // Lo que dice la cache del calendario.
    const guardado = [{ ms: ms('2026-08-30T05:05:00Z'), rating: 7.5 }];
    // Lo que dice la ficha del jugador para EL MISMO partido.
    const enLaFicha = ms('2026-08-30T08:05:00Z');

    assert.equal(puntajeMasCercano(enLaFicha, guardado)?.rating, 7.5);
});

test('un partido de la noche europea no se pierde por caer al dia siguiente', () => {
    // Internationals, medido: la cache dice 21:00 y la ficha dice medianoche del
    // dia siguiente. Cruzar por dia UTC dejaba este partido sin puntaje.
    const guardado = [{ ms: ms('2026-09-05T21:00:00Z'), rating: 6.8 }];
    const enLaFicha = ms('2026-09-06T00:00:00Z');

    assert.equal(puntajeMasCercano(enLaFicha, guardado)?.rating, 6.8);
    assert.notEqual(
        new Date(guardado[0].ms).toISOString().slice(0, 10),
        new Date(enLaFicha).toISOString().slice(0, 10),
        'el caso pierde sentido si los dos instantes caen el mismo dia'
    );
});

test('gana el partido mas cercano, no el primero de la lista', () => {
    const guardado = [
        { ms: ms('2026-09-12T14:00:00Z'), rating: 4.2 },
        { ms: ms('2026-09-05T21:00:00Z'), rating: 6.8 },
    ];

    assert.equal(puntajeMasCercano(ms('2026-09-06T00:00:00Z'), guardado)?.rating, 6.8);
    assert.equal(puntajeMasCercano(ms('2026-09-12T17:00:00Z'), guardado)?.rating, 4.2);
});

test('fuera de la ventana de doce horas no hay puntaje', () => {
    const guardado = [{ ms: ms('2026-09-05T21:00:00Z'), rating: 6.8 }];

    // Un partido del dia siguiente por la tarde: diecinueve horas. No es el
    // mismo partido, y adjudicarle ese puntaje seria peor que dejarlo vacio.
    assert.equal(puntajeMasCercano(ms('2026-09-06T16:00:00Z'), guardado), null);
});

test('sin puntajes guardados la columna queda vacia', () => {
    assert.equal(puntajeMasCercano(ms('2026-09-05T21:00:00Z'), []), null);
});


/**
 * EL MISMO PARTIDO, LISTADO DOS VECES.
 *
 * La ficha agrupa por club, asi que al que se fue a mitad de temporada le
 * aparece el cruce entre sus dos clubes repetido, con el rival invertido. Caso
 * real: Cameron Woki, de Bordeaux a Racing 92, tenia `Bordeaux vs Racing 92` dos
 * veces y nueve partidos de mas en el total de su carrera.
 */
function partido(campos: Partial<RugbyPassPlayerMatch>): RugbyPassPlayerMatch {
    return {
        title: 'Bordeaux vs Racing 92',
        kickoff: 1_788_000_000,
        competitionName: 'TOP 14',
        competitionLogo: '',
        opponentName: 'Racing 92',
        opponentLogo: '',
        result: 'win',
        minutes: 80,
        points: null,
        tries: null,
        conversions: null,
        yellowCards: null,
        redCards: null,
        ...campos,
    };
}

test('el partido entre los dos clubes del que se fue cuenta una sola vez', () => {
    const plegado = sinRepetidos([
        partido({ opponentName: 'Racing 92' }),
        partido({ opponentName: 'Bordeaux' }),
    ]);

    assert.equal(plegado.length, 1);
    // Gana el primero, que es el que la ficha lista antes.
    assert.equal(plegado[0].opponentName, 'Racing 92');
});

test('dos partidos distintos del mismo dia no se pliegan', () => {
    // Una fecha del Top 14 tiene varios partidos a la misma hora. El titulo ya
    // nombra a los dos equipos, asi que alcanza para distinguirlos.
    const plegado = sinRepetidos([
        partido({ title: 'Bordeaux vs Racing 92' }),
        partido({ title: 'Toulouse vs Bayonne' }),
    ]);

    assert.equal(plegado.length, 2);
});

test('el mismo cruce en dos temporadas distintas no se pliega', () => {
    const plegado = sinRepetidos([
        partido({ kickoff: 1_788_000_000 }),
        partido({ kickoff: 1_788_000_000 - 365 * 24 * 3600 }),
    ]);

    assert.equal(plegado.length, 2);
});
