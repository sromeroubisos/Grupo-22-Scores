import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseRugbyPassPlayerSlug,
    parseRugbyPassTeamSlug,
} from './rugbyPassProfiles.ts';

// El slug de estos ids baja derecho a un filtro de PostgREST
// (`home_team->>id.eq.<id>`). Ahi el recorte NO alcanza: hay que validar, y lo
// que no valida tiene que devolver `null` para que el endpoint siga de largo a
// sus otras ramas en vez de armar una consulta con lo que vino.

test('un id de RugbyPass devuelve su slug', () => {
    assert.equal(parseRugbyPassTeamSlug('rp-team-auckland'), 'auckland');
    assert.equal(parseRugbyPassTeamSlug('rp-team-north-harbour'), 'north-harbour');
    assert.equal(parseRugbyPassPlayerSlug('rp-player-pablo-matera'), 'pablo-matera');
});

test('el id se lee sin importar mayusculas ni espacios de los costados', () => {
    assert.equal(parseRugbyPassTeamSlug('  RP-Team-Auckland  '), 'auckland');
    assert.equal(parseRugbyPassPlayerSlug('RP-Player-Pablo-Matera'), 'pablo-matera');
});

test('un id de otro proveedor no es de RugbyPass', () => {
    assert.equal(parseRugbyPassTeamSlug('fs-team-lrM6RMBU'), null);
    assert.equal(parseRugbyPassTeamSlug('espn-team-25'), null);
    // Un partido y un torneo empiezan con `rp-` pero NO son un equipo.
    assert.equal(parseRugbyPassTeamSlug('rp-949624'), null);
    assert.equal(parseRugbyPassTeamSlug('rp-comp-203'), null);
    // Y el id de un equipo no es el de un jugador.
    assert.equal(parseRugbyPassPlayerSlug('rp-team-auckland'), null);
    assert.equal(parseRugbyPassTeamSlug('rp-player-pablo-matera'), null);
});

/**
 * El caso que justifica validar en vez de recortar: una coma cierra el primer
 * `eq` y agrega una condicion propia al `or(...)`, y un punto abre un operador.
 * Con recorte, eso viajaba entero a la consulta.
 */
test('un slug con caracteres que rompen el filtro se descarta entero', () => {
    assert.equal(parseRugbyPassTeamSlug('rp-team-auckland,status.eq.final'), null);
    assert.equal(parseRugbyPassTeamSlug('rp-team-auckland)'), null);
    assert.equal(parseRugbyPassTeamSlug('rp-team-auck land'), null);
    assert.equal(parseRugbyPassTeamSlug('rp-team-'), null);
    assert.equal(parseRugbyPassPlayerSlug('rp-player-'), null);
});

test('lo que no es un id no revienta', () => {
    assert.equal(parseRugbyPassTeamSlug(null), null);
    assert.equal(parseRugbyPassTeamSlug(undefined), null);
    assert.equal(parseRugbyPassTeamSlug(42), null);
    assert.equal(parseRugbyPassPlayerSlug(''), null);
});
