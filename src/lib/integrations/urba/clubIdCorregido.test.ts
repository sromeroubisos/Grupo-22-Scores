import test from 'node:test';
import assert from 'node:assert/strict';

import { corregirUrbaClubId, buildUrbaExternalId } from './externalId.ts';

/**
 * La corrección existe por un caso medido, no por precaución: en 2021-2023 URBA
 * publicó 53 equipos de San Andrés con el `club_id` de San Albano (el 14). Sin
 * esto, 553 partidos históricos entran bajo el club equivocado en silencio.
 *
 * Lo que estos tests protegen es que la corrección sea ANGOSTA. Una que se pase
 * de lista reasigna equipos legítimos, y ese daño es peor y más difícil de ver
 * que el que vino a arreglar.
 */

test('San Andrés publicado con el club_id de San Albano vuelve al suyo', () => {
  assert.equal(corregirUrbaClubId(14, 'San Andres'), 31);
  assert.equal(corregirUrbaClubId(14, 'San Andres A'), 31);
  assert.equal(corregirUrbaClubId(14, 'San Andres B'), 31);
  assert.equal(corregirUrbaClubId(14, 'San Andres C'), 31);
});

test('San Albano con su propio club_id no se toca', () => {
  assert.equal(corregirUrbaClubId(14, 'San Albano'), 14);
  assert.equal(corregirUrbaClubId(14, 'San Albano A'), 14);
  assert.equal(corregirUrbaClubId(14, 'San Albano B'), 14);
});

test('San Andrés con su club_id correcto sigue igual', () => {
  assert.equal(corregirUrbaClubId(31, 'San Andres'), 31);
  assert.equal(corregirUrbaClubId(31, 'San Andres A'), 31);
});

test('el acento y las mayúsculas no cambian el resultado', () => {
  // URBA escribe "San Andres" sin acento, pero el dato no está bajo contrato.
  assert.equal(corregirUrbaClubId(14, 'SAN ANDRÉS'), 31);
  assert.equal(corregirUrbaClubId(14, '  san andrés b  '), 31);
});

test('no toca a ningún otro club', () => {
  // Los otros 152 club_id del catálogo pasan derecho. Es lo que hace que la
  // corrección sea reversible de cabeza: si no está en la tabla, no se mueve.
  assert.equal(corregirUrbaClubId(30, 'Gimnasia y Esgrima'), 30);
  assert.equal(corregirUrbaClubId(7, 'Belgrano Athletic'), 7);
  assert.equal(corregirUrbaClubId(75, 'Atletico San Andres'), 75);
  assert.equal(corregirUrbaClubId(1, 'SIC A'), 1);
});

test('Atlético San Andrés NO se confunde con San Andrés', () => {
  // Son dos instituciones distintas, con club_id distinto (75 y 31). Si la
  // corrección comparara por "contiene", ésta se la llevaría puesta.
  assert.equal(corregirUrbaClubId(14, 'Atletico San Andres'), 14);
  assert.equal(corregirUrbaClubId(75, 'Atletico San Andres B'), 75);
});

test('la corrección entra en el triple, que es donde importa', () => {
  const mal = buildUrbaExternalId({ urbaClubId: 14, categoria: 'M15', sufijo: 'B' });
  const bien = buildUrbaExternalId({
    urbaClubId: corregirUrbaClubId(14, 'San Andres B'),
    categoria: 'M15',
    sufijo: 'B',
  });
  assert.equal(mal, '14|M15|B');    // -> san-albano-m15-b
  assert.equal(bien, '31|M15|B');   // -> san-andres-m15-b
});

test('un club_id inválido sigue fallando ruidosamente', () => {
  assert.throws(() => corregirUrbaClubId(0, 'San Andres'));
  assert.throws(() => corregirUrbaClubId('no-es-un-numero', 'San Andres'));
});
