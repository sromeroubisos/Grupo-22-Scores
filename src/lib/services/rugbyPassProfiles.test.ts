import test from 'node:test';
import assert from 'node:assert/strict';

import { puntajeMasCercano, sinRepetidos } from './rugbyPassProfiles.ts';
import type { RugbyPassPlayerMatch } from './rugbyPassCatalog.ts';

/**
 * EL CRUCE ENTRE LA FICHA DEL JUGADOR Y EL PUNTAJE GUARDADO.
 *
 * La ficha publica sus partidos sin id, asi que la llave es la fecha — y la hora
 * que publica viene EN LA ZONA DEL QUE MIRA. Medido sobre el mismo partido
 * (`rp-952476`, que el calendario pone 19:05 UTC del 6 de septiembre): desde
 * Argentina la ficha dice 22:05 del 6, y desde el server de Vercel 00:05 del 7.
 *
 * Estos casos son los que rompian las dos alternativas obvias: cruzar por
 * instante (no coincide nunca) y cruzar por dia UTC (el corrimiento empuja el
 * partido al dia siguiente, que es lo que pasaba en produccion).
 */

const ms = (iso: string) => new Date(iso).getTime();

test('el corrimiento por huso cruza igual, lo mire quien lo mire', () => {
    // Lo que dice la cache del calendario: la hora de verdad.
    const guardado = [{ ms: ms('2026-08-30T05:05:00Z'), rating: 7.5 }];

    // La misma ficha leida desde husos distintos. Ninguno puede fallar.
    for (const desde of ['2026-08-30T08:05:00Z', '2026-08-30T10:05:00Z', '2026-08-29T17:05:00Z']) {
        assert.equal(puntajeMasCercano(ms(desde), guardado)?.rating, 7.5, `falló leyendo ${desde}`);
    }
});

test('la ventana cubre el huso mas extremo que existe', () => {
    // UTC+14 (Kiribati) es el corrimiento maximo posible. Trece horas tienen que
    // cruzar; veinte, que ya no es un huso sino otro partido, no.
    const guardado = [{ ms: ms('2026-08-30T05:05:00Z'), rating: 7.5 }];

    assert.equal(puntajeMasCercano(ms('2026-08-30T18:05:00Z'), guardado)?.rating, 7.5);
    assert.equal(puntajeMasCercano(ms('2026-08-31T01:05:00Z'), guardado), null);
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

test('fuera de la ventana de catorce horas no hay puntaje', () => {
    const guardado = [{ ms: ms('2026-09-05T21:00:00Z'), rating: 6.8 }];

    // Un partido del dia siguiente por la noche: veinticuatro horas. Ya no es un
    // huso, es otro partido, y adjudicarle ese puntaje seria peor que dejarlo
    // vacio.
    assert.equal(puntajeMasCercano(ms('2026-09-06T21:00:00Z'), guardado), null);
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
