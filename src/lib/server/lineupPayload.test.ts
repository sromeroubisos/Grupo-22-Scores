/**
 * La formacion que llega por la API.
 *
 * Lo que se prueba es lo que no puede llegar a `matches.lineups`: dos
 * capitanes, un numero repetido, un jugador sin nombre. Y sobre todo el caso
 * del lado ausente, que es el que puede borrar una formacion cargada a mano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLineupPayload } from './lineupPayload';

test('el lado que no vino queda en null, no en lista vacia', () => {
  const { home, away, issues } = parseLineupPayload({
    home: [{ numero: 1, nombre: 'Perez' }],
  });

  assert.deepEqual(issues, []);
  assert.equal(home?.length, 1);
  // Si esto fuese [] en vez de null, cargar la formacion local borraria la
  // visitante que ya estaba guardada.
  assert.equal(away, null);
});

test('el puesto sale del numero de camiseta cuando no viene', () => {
  const { home } = parseLineupPayload({
    home: [
      { numero: 2, nombre: 'Gomez' },
      { numero: 10, nombre: 'Diaz' },
      { numero: 15, nombre: 'Ruiz' },
      { numero: 23, nombre: 'Lopez' },
    ],
  });

  assert.deepEqual(
    home?.map((player) => player.position),
    ['Hooker', 'Apertura', 'Fullback', null],
  );
});

test('el puesto explicito le gana al del numero', () => {
  const { home } = parseLineupPayload({
    home: [{ numero: 10, nombre: 'Diaz', puesto: 'Medio scrum' }],
  });

  assert.equal(home?.[0].position, 'Medio scrum');
});

test('titulares y suplentes se marcan solos, y el role explicito manda', () => {
  const { home, away } = parseLineupPayload({
    home: {
      titulares: [{ numero: 1, nombre: 'Perez' }],
      suplentes: [{ numero: 16, nombre: 'Lopez' }],
    },
    away: [
      { number: 1, name: 'Diaz', role: 'starter' },
      { number: 16, name: 'Ruiz', role: 'substitute' },
    ],
  });

  assert.deepEqual(
    home?.map((player) => player.role),
    ['starter', 'substitute'],
  );
  assert.deepEqual(
    away?.map((player) => player.role),
    ['starter', 'substitute'],
  );
});

test('las claves valen en castellano y en ingles', () => {
  const { home } = parseLineupPayload({
    home: [
      { numero: '7', nombre: 'Perez', capitan: true },
      { number: 8, name: 'Gomez', isCaptain: false },
    ],
  });

  assert.deepEqual(
    home?.map((player) => [player.number, player.name, player.isCaptain]),
    [
      [7, 'Perez', true],
      [8, 'Gomez', false],
    ],
  );
});

test('dos capitanes del mismo lado se rechazan', () => {
  const { issues } = parseLineupPayload({
    home: [
      { numero: 1, nombre: 'Perez', capitan: true },
      { numero: 2, nombre: 'Gomez', capitan: true },
    ],
  });

  assert.equal(issues.length, 1);
  assert.match(issues[0], /local: hay 2 capitanes \(Perez, Gomez\)/);
});

test('un capitan por lado no es problema', () => {
  const { issues } = parseLineupPayload({
    home: [{ numero: 1, nombre: 'Perez', capitan: true }],
    away: [{ numero: 1, nombre: 'Diaz', capitan: true }],
  });

  assert.deepEqual(issues, []);
});

test('un numero repetido se rechaza, y dice quienes chocan', () => {
  const { issues } = parseLineupPayload({
    away: [
      { numero: 5, nombre: 'Perez' },
      { numero: 5, nombre: 'Gomez' },
    ],
  });

  assert.equal(issues.length, 1);
  assert.match(issues[0], /visitante: el numero 5 esta repetido \(Perez y Gomez\)/);
});

test('el mismo numero en los dos lados es normal', () => {
  const { issues } = parseLineupPayload({
    home: [{ numero: 9, nombre: 'Perez' }],
    away: [{ numero: 9, nombre: 'Diaz' }],
  });

  assert.deepEqual(issues, []);
});

test('varios jugadores sin numero no cuentan como repetidos', () => {
  const { home, issues } = parseLineupPayload({
    home: [{ nombre: 'Perez' }, { nombre: 'Gomez' }],
  });

  assert.deepEqual(issues, []);
  assert.deepEqual(
    home?.map((player) => player.number),
    [null, null],
  );
});

test('un jugador sin nombre se rechaza', () => {
  const { issues } = parseLineupPayload({ home: [{ numero: 1 }] });

  assert.equal(issues.length, 1);
  assert.match(issues[0], /local: hay un jugador sin nombre/);
});

test('un id que no es uuid se rechaza', () => {
  const { issues } = parseLineupPayload({
    home: [{ numero: 1, nombre: 'Perez', id: '123' }],
  });

  assert.equal(issues.length, 1);
  assert.match(issues[0], /el id de "Perez" no es un uuid/);
});

test('un id uuid valido se conserva', () => {
  const ID = '81a1647c-c6d4-4f2d-ad1e-1e0e96ff9b7f';
  const { home, issues } = parseLineupPayload({
    home: [{ numero: 1, nombre: 'Perez', id: ID }],
  });

  assert.deepEqual(issues, []);
  assert.equal(home?.[0].id, ID);
});

test('la formacion tambien se acepta anidada en lineups', () => {
  const { home } = parseLineupPayload({
    lineups: { home: [{ numero: 1, nombre: 'Perez' }] },
  });

  assert.equal(home?.length, 1);
});

test('local y visitante valen como nombres de lado', () => {
  const { home, away } = parseLineupPayload({
    local: [{ numero: 1, nombre: 'Perez' }],
    visitante: [{ numero: 1, nombre: 'Diaz' }],
  });

  assert.equal(home?.[0].name, 'Perez');
  assert.equal(away?.[0].name, 'Diaz');
});

test('un lado que no es lista ni titulares/suplentes se rechaza', () => {
  const { issues } = parseLineupPayload({ home: 'Perez, Gomez' });

  assert.equal(issues.length, 1);
  assert.match(issues[0], /local: se esperaba una lista de jugadores/);
});

test('sin formaciones no hay lados ni problemas: es el caso de "no mandaste nada"', () => {
  const { home, away, issues } = parseLineupPayload({ match_id: 'lo-que-sea' });

  assert.equal(home, null);
  assert.equal(away, null);
  assert.deepEqual(issues, []);
});
