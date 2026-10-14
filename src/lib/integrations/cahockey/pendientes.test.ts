import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolverClubCah } from './nombres.ts';
import {
  candidatosDelListado,
  parsearListadoCah,
  parsearPendiente,
  planAdopcion,
  type FilaPendiente,
} from './pendientes.ts';
import type { PartidoSicah, TorneoSicah } from './sicah.ts';

// Líneas reales del acordeón de /argentino-de-selecciones (2026-10-13), más
// el torneo que la CAH todavía no publicó, con un id inventado.
const LISTADO = `
<ul class="circular2" id="2026">
<li><a href="#" class="ampliar_torneo" id="9001">CAMPEONATO ARGENTINO DE SELECCIONADOS MAYORES DAMAS</a><br>
Desde el 14/10/2026 al 18/10/2026<br></li>
<li><a href="#" class="ampliar_torneo" id="1612">CAMPEONATO ARGENTINO DE SELECCIONADOS  PISTA MAYORES DAMAS</a><br>
Desde el 01/10/2026 al 04/10/2026<br></li>
<li><a href="#" class="ampliar_torneo" id="1613">CAMPEONATO ARGENTINO DE SELECCIONADOS  PISTA MAYORES CABALLEROS</a><br>
Desde el 01/10/2026 al 04/10/2026<br></li>
<li><a href="#" class="ampliar_torneo" id="1589">CAMPEONATO ARGENTINO DE SELECCIONADOS SUB 19 CABALLEROS</a><br>
Desde el 17/09/2026 al 20/09/2026<br></li>
</ul>
<ul class="circular2" id="2025">
<li><a href="#" class="ampliar_torneo" id="1375">CAMPEONATO ARGENTINO DE SELECCIONES ASCENSO MAYORES DAMAS B</a><br>
Desde el 03/07/2025 al 06/07/2025<br></li>
</ul>`;

const RANGO = { desde: '2026-10-14', hasta: '2026-10-18' };

test('el external_id pendiente dice qué buscar', () => {
  assert.deepEqual(parsearPendiente('cahockey-pendiente:mayores:damas'), { categoria: 'mayores', rama: 'damas' });
  assert.deepEqual(parsearPendiente('cahockey-pendiente:mayores:caballeros:12'), { categoria: 'mayores', rama: 'caballeros' });
  assert.equal(parsearPendiente('cahockey:1589'), null);
  assert.equal(parsearPendiente('cahockey-pendiente:mayores:mixto'), null);
});

test('el listado sale con id, nombre y fechas ISO', () => {
  const l = parsearListadoCah(LISTADO);
  assert.equal(l.length, 5);
  assert.deepEqual(l[0], { id: '9001', nombre: 'CAMPEONATO ARGENTINO DE SELECCIONADOS MAYORES DAMAS', desde: '2026-10-14', hasta: '2026-10-18' });
  assert.equal(l[1].nombre, 'CAMPEONATO ARGENTINO DE SELECCIONADOS PISTA MAYORES DAMAS');
});

test('candidato: categoría y rama en las fechas del PDF, nunca pista ni la otra rama', () => {
  const l = parsearListadoCah(LISTADO);
  assert.deepEqual(candidatosDelListado(l, { categoria: 'mayores', rama: 'damas' }, RANGO).map((t) => t.id), ['9001']);
  // Caballeros todavía no está publicado: Pista Mayores Caballeros es dos semanas antes y de pista
  assert.deepEqual(candidatosDelListado(l, { categoria: 'mayores', rama: 'caballeros' }, RANGO), []);
});

test('candidato: el nombre no tiene que decir la categoría (Córdoba 2026 salió sin "mayor")', () => {
  const l = parsearListadoCah(`<li><a href="#" class="ampliar_torneo" id="1624">CAMPEONATOS ARGENTINOS DE SELECCIONADOS CAMPEONATOS CABALLEROS</a><br>
Desde el 14/10/2026 al 18/10/2026<br></li>
<li><a href="#" class="ampliar_torneo" id="1628">CAMPEONATOS ARGENTINOS DE SELECCIONADOS MAYOR ASCENSO B CABALLEROS</a><br>
Desde el 15/10/2026 al 18/10/2026<br></li>`);
  // los dos pasan el filtro grueso; el cron elige por el contenido de SICAH
  assert.deepEqual(candidatosDelListado(l, { categoria: 'mayores', rama: 'caballeros' }, RANGO).map((t) => t.id), ['1624', '1628']);
});

test('candidato: si la CAH parte Campeonato y Ascenso aparecen los dos', () => {
  const l = parsearListadoCah(`${LISTADO}
<li><a href="#" class="ampliar_torneo" id="9002">CAMPEONATO ARGENTINO DE SELECCIONADOS MAYORES ASCENSO DAMAS</a><br>
Desde el 14/10/2026 al 18/10/2026<br></li>`);
  assert.deepEqual(candidatosDelListado(l, { categoria: 'mayores', rama: 'damas' }, RANGO).map((t) => t.id), ['9001', '9002']);
});

test('las grafías curadas resuelven a la federación que ya existe', () => {
  const sinAlias = new Map<string, string>();
  assert.equal(resolverClubCah(sinAlias, 'cahockey:9001', 'Asociación de Buenos Aires'), 'asociacion-amateur-de-hockey-sobre-cesped-de-buenos-aires-cah-hockey');
  assert.equal(resolverClubCah(sinAlias, 'cahockey:9001', 'Asociación del Centro Pcia. Buenos Aires'), 'asociacion-hockey-del-centro-pcia-buenos-aires-cah-hockey');
  assert.equal(resolverClubCah(sinAlias, 'cahockey:9001', 'Federación Cordobesa'), 'federacion-cordobesa-cah-hockey');
});

// ---------------------------------------------------------------- adopción

const AAHSBA = 'asociacion-amateur-de-hockey-sobre-cesped-de-buenos-aires-cah-hockey';
const LITORAL = 'asociacion-litoral-cah-hockey';
const CORDOBA = 'federacion-cordobesa-cah-hockey';
const SALTA = 'asociacion-saltena-cah-hockey';

const lado = (equipo: string) => ({ equipo, goles: null, penales: null });
const partido = (nro: string, dia: string, local: string, visitante: string, etapa = 'Zona A'): PartidoSicah => ({
  nro, etapa, dia, hora: '15:10', cancha: '#1 ESTADIO', local: lado(local), visitante: lado(visitante),
});
const sicah = (partidos: PartidoSicah[]): TorneoSicah => ({
  nombre: '2026 - Selecciones Damas Mayores', desde: '2026-10-14', hasta: '2026-10-18', partidos,
});
const fila = (nro: string, home: string, away: string, dateTime: string): FilaPendiente => ({
  id: `fila-${nro}`, external_id: `cahockey-pendiente:mayores:damas:${nro}`, home_club_id: home, away_club_id: away, date_time: dateTime,
});
const resolver = (n: string) => resolverClubCah(new Map(), 'cahockey:9001', n);

test('adopción por par y día: el número de SICAH manda aunque el del PDF sea otro y la localía esté dada vuelta', () => {
  const a = planAdopcion({
    filas: [fila('8', AAHSBA, LITORAL, '2026-10-14T15:10:00-03:00')],
    sicah: sicah([partido('3', 'Miércoles', 'Asociación Litoral', 'Asociación de Buenos Aires')]),
    nuevoTorneoExternalId: 'cahockey:9001',
    resolverClub: resolver,
  });
  assert.deepEqual(a.adoptados, [{ id: 'fila-8', de: 'cahockey-pendiente:mayores:damas:8', a: 'cahockey:9001:3' }]);
  assert.deepEqual(a.sinPareja, []);
});

test('adopción: un par repetido se desempata por el día, y sin desempate no se adivina', () => {
  const s = sicah([
    partido('21', 'Viernes', 'Federación Cordobesa', 'Asociación Salteña'),
    partido('33', 'Domingo', 'Asociación Salteña', 'Federación Cordobesa', 'Finales'),
  ]);
  const ok = planAdopcion({ filas: [fila('21', CORDOBA, SALTA, '2026-10-16T15:10:00-03:00')], sicah: s, nuevoTorneoExternalId: 'cahockey:9001', resolverClub: resolver });
  assert.deepEqual(ok.adoptados.map((x) => x.a), ['cahockey:9001:21']);

  const ambiguo = planAdopcion({ filas: [fila('21', CORDOBA, SALTA, '2026-10-15T15:10:00-03:00')], sicah: s, nuevoTorneoExternalId: 'cahockey:9001', resolverClub: resolver });
  assert.deepEqual(ambiguo.adoptados, []);
  assert.equal(ambiguo.sinPareja.length, 1);
  assert.match(ambiguo.sinPareja[0], /2 candidatos/);
});

test('adopción: los cruces por definir de SICAH no se emparejan con nada', () => {
  const a = planAdopcion({
    filas: [fila('8', AAHSBA, LITORAL, '2026-10-14T15:10:00-03:00')],
    sicah: sicah([partido('31', 'Sábado', '1° Zona A', '2° Zona B', 'Semifinales')]),
    nuevoTorneoExternalId: 'cahockey:9001',
    resolverClub: resolver,
  });
  assert.deepEqual(a.adoptados, []);
  assert.deepEqual(a.sinPareja, [`cahockey-pendiente:mayores:damas:8: ${AAHSBA} vs ${LITORAL} (2026-10-14)`]);
});
