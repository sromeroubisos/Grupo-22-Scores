import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claveDeRonda, estadoDe, normalizarNombre, parseFicha, parsePagina, planRe, PREFIJO_NOTA,
  type ExistenteRe, type PartidoRe,
} from './rugbyeurope.ts';

// ── HTML con la forma real de rugbyeurope.eu (recortado) ─────────────────────

const equipo = (nombre: string, puntos?: number) => `
<div class="c-image-text"><img alt="${nombre}"/><div class="c-image-text__text"><p class="c-fixtures-table__title">
<span class="c-fixtures-table__title__team" data-abbr="X"><span class="c-fixtures-table__title__team__inner">${nombre}</span></span>
${puntos === undefined ? '' : `<span class="c-fixtures-table__title__score">${puntos}</span>`}
</p></div></div>`;

const fila = (o: { ids: string; utc: string; local: string; visitante: string; marcador?: [number, number]; slug: string }) => `
<tr data-competition-table-row="${o.ids}" class="c-fixtures-table__row">
<td><div><p data-raw-date-utc="${o.utc}"><strong>Today</strong></p></div></td>
<td class="c-fixtures-table__detail-cell">${equipo(o.local, o.marcador?.[0])}<abbr>V</abbr>${equipo(o.visitante, o.marcador?.[1])}</td>
<td><a href="/competitions/season-2627/xv-competitions/mens-xv-competitions/u20-championship-2026/${o.slug}/" class="c-button">Match details</a></td>
</tr>`;

const PAGINA = `
<table class="c-fixtures-table" data-competition-table="fixtures"><tbody>
${fila({ ids: '1459,1561', utc: '2026-11-08T15:00:00.0000000Z', local: 'BELGIUM ', visitante: 'POLAND', slug: 'belgium-v-poland' })}
</tbody></table>
<table class="c-fixtures-table" data-competition-table="results"><tbody>
${fila({ ids: '1470,1557', utc: '2026-11-08T10:00:00.0000000Z', local: 'PORTUGAL', visitante: 'MOLDOVA', marcador: [120, 0], slug: 'portugal-v-moldova' })}
</tbody></table>`;

const ficha = (o: { rotulo: string; titulo?: string; marcador?: [number, number]; cuenta?: boolean }) => `
<section class="c-match-banner">
${o.cuenta ? '<p class="c-match-banner__countdown__title">Kick off</p>' : ''}
${o.titulo ? `<p class="c-match-banner__fulltime-title">${o.titulo}</p>` : ''}
${o.marcador ? `<p class="c-match-banner__score"><span data-match-banner-score-home>${o.marcador[0]}</span> - <span data-match-banner-score-away>${o.marcador[1]}</span></p>` : ''}
<p class="c-match-banner__venue">Prague Marketa Stadium</p>
<p class="c-match-detail__details__line">${o.rotulo}</p>
</section>`;

// ── Lectura ──────────────────────────────────────────────────────────────────

test('parsePagina lee las dos tablas, la hora en UTC y el marcador solo de Results', () => {
  const filas = parsePagina(PAGINA);
  assert.equal(filas.length, 2);
  const [fx, rs] = filas;
  assert.equal(fx.tabla, 'fixtures');
  assert.equal(fx.inicio, '2026-11-08T15:00:00.000Z');
  assert.equal(fx.local, 'BELGIUM');
  assert.equal(fx.puntosLocal, null);
  assert.match(fx.ficha ?? '', /belgium-v-poland\/$/);
  assert.equal(rs.tabla, 'results');
  assert.deepEqual([rs.puntosLocal, rs.puntosVisitante], [120, 0]);
});

test('parsePagina no inventa filas si la página no trae las tablas', () => {
  assert.deepEqual(parsePagina('<html><body>mantenimiento</body></html>'), []);
});

test('parseFicha: ronda, número, estadio y estado', () => {
  const f = parseFicha(ficha({ rotulo: 'Quarter Finals, M3', titulo: 'Fulltime', marcador: [52, 26] }));
  assert.equal(f.rotulo, 'Quarter Finals, M3');
  assert.equal(f.numero, 3);
  assert.equal(f.estadio, 'Prague Marketa Stadium');
  assert.equal(f.estadoTexto, 'Fulltime');
  assert.deepEqual([f.puntosLocal, f.puntosVisitante], [52, 26]);
  const previa = parseFicha(ficha({ rotulo: 'Quarter Finals, M4', cuenta: true }));
  assert.equal(previa.cuentaRegresiva, true);
  assert.equal(previa.estadoTexto, null);
  assert.equal(previa.puntosLocal, null);
});

test('claveDeRonda reconoce los cinco rótulos del cuadro', () => {
  assert.equal(claveDeRonda('Quarter Finals, M1'), 'cuartos');
  assert.equal(claveDeRonda('Semi Finals, M7'), 'semis');
  assert.equal(claveDeRonda('Ranking Semi Finals, M5'), 'ranking-semis');
  assert.equal(claveDeRonda('Final, M9'), 'final');
  assert.equal(claveDeRonda('3rd Place, M10'), 'final');
  assert.equal(claveDeRonda('5th Place, M11'), 'ranking-final');
  assert.equal(claveDeRonda(null), null);
});

test('normalizarNombre', () => {
  assert.equal(normalizarNombre('BELGIUM '), 'belgium');
});

// ── Estado ───────────────────────────────────────────────────────────────────

const base: PartidoRe = {
  tabla: 'fixtures', inicio: '2026-11-08T15:00:00.000Z', local: 'BELGIUM', visitante: 'POLAND',
  puntosLocal: null, puntosVisitante: null, ficha: '/x/', ficha_datos: null,
};
const AHORA = new Date('2026-11-08T16:00:00Z');

test('estadoDe: Results es final; Fulltime en la ficha es final; otro título es en juego', () => {
  assert.equal(estadoDe({ ...base, tabla: 'results', puntosLocal: 120, puntosVisitante: 0 }, AHORA).status, 'final');
  const fin = parseFicha(ficha({ rotulo: 'Quarter Finals, M3', titulo: 'Fulltime', marcador: [52, 26] }));
  assert.deepEqual(estadoDe({ ...base, ficha_datos: fin }, AHORA), { status: 'final', puntos: { home: 52, away: 26 } });
  const vivo = parseFicha(ficha({ rotulo: 'Quarter Finals, M3', titulo: 'Live', marcador: [14, 7] }));
  assert.deepEqual(estadoDe({ ...base, ficha_datos: vivo }, AHORA), { status: 'live', puntos: { home: 14, away: 7 } });
});

test('estadoDe: sin novedad en la ficha queda programado, y un "en juego" viejo no se queda vivo', () => {
  const previa = parseFicha(ficha({ rotulo: 'Quarter Finals, M4', cuenta: true }));
  assert.equal(estadoDe({ ...base, ficha_datos: previa }, AHORA).status, 'scheduled');
  const vivo = parseFicha(ficha({ rotulo: 'Quarter Finals, M3', titulo: 'Live', marcador: [14, 7] }));
  assert.equal(estadoDe({ ...base, ficha_datos: vivo }, new Date('2026-11-08T20:00:00Z')).status, 'scheduled');
});

// ── Plan ─────────────────────────────────────────────────────────────────────

const ALIAS: Record<string, string> = { belgium: 'belgica-u20', poland: 'polonia-u20', portugal: 'portugal-u20', moldova: 'moldavia-u20' };
const resolverEquipo = (n: string) => ALIAS[normalizarNombre(n)] ?? null;
const rondaDe = (clave: string | null) => (clave === 'cuartos' ? { id: 'r1', nombre: 'Cuartos de final' } : { id: null, nombre: 'Sin ronda' });

const partidoBel: PartidoRe = { ...base, ficha_datos: parseFicha(ficha({ rotulo: 'Quarter Finals, M3', titulo: 'Fulltime', marcador: [52, 26] })) };
const partidoPor: PartidoRe = {
  ...base, tabla: 'results', inicio: '2026-11-08T10:00:00.000Z', local: 'PORTUGAL', visitante: 'MOLDOVA', puntosLocal: 120, puntosVisitante: 0,
  ficha_datos: parseFicha(ficha({ rotulo: 'Quarter Finals, M1', titulo: 'Fulltime', marcador: [120, 0] })),
};

test('planRe crea los partidos con ronda, estadio, estado final y nota', () => {
  const plan = planRe({ partidos: [partidoBel, partidoPor], resolverEquipo, rondaDe, existentes: [], ahora: AHORA });
  assert.equal(plan.crear.length, 2);
  const por = plan.crear.find((c) => c.home_club_id === 'portugal-u20');
  assert.ok(por);
  assert.equal(por.external_id, 'rugbyeurope:u20-championship-2026:portugal-u20~moldavia-u20:1');
  assert.equal(por.status, 'final');
  assert.deepEqual(por.score, { home: 120, away: 0 });
  assert.equal(por.round_uuid, 'r1');
  assert.equal(por.venue, 'Prague Marketa Stadium');
  assert.equal(por.notes, `${PREFIJO_NOTA}Cuartos de final · M1`);
});

test('planRe es idempotente: lo que ya está igual no se toca', () => {
  const primero = planRe({ partidos: [partidoPor], resolverEquipo, rondaDe, existentes: [], ahora: AHORA });
  const existente: ExistenteRe = { id: 'm1', ...primero.crear[0] };
  const segundo = planRe({ partidos: [partidoPor], resolverEquipo, rondaDe, existentes: [existente], ahora: AHORA });
  assert.equal(segundo.crear.length + segundo.actualizar.length, 0);
  assert.equal(segundo.sinCambios, 1);
});

test('planRe pasa un programado a final y marca la corrección de un marcador distinto', () => {
  const existente: ExistenteRe = {
    id: 'm2', external_id: 'rugbyeurope:u20-championship-2026:belgica-u20~polonia-u20:1', home_club_id: 'belgica-u20', away_club_id: 'polonia-u20',
    date_time: '2026-11-08T15:00:00.000Z', status: 'scheduled', score: null, round_uuid: 'r1', round_label: 'Cuartos de final',
    venue: null, notes: null,
  };
  const plan = planRe({ partidos: [partidoBel], resolverEquipo, rondaDe, existentes: [existente], ahora: AHORA });
  assert.equal(plan.actualizar.length, 1);
  assert.deepEqual(plan.actualizar[0].patch.score, { home: 52, away: 26 });
  assert.equal(plan.actualizar[0].patch.status, 'final');

  const final: ExistenteRe = { ...existente, status: 'final', score: { home: 50, away: 26 } };
  const corr = planRe({ partidos: [partidoBel], resolverEquipo, rondaDe, existentes: [final], ahora: AHORA });
  assert.equal(corr.correcciones.length, 1);
});

test('planRe avisa de un equipo sin alias y no escribe ese partido', () => {
  const raro: PartidoRe = { ...partidoBel, local: 'ATLANTIS' };
  const plan = planRe({ partidos: [raro], resolverEquipo, rondaDe, existentes: [], ahora: AHORA });
  assert.deepEqual(plan.equiposSinAlias, ['ATLANTIS']);
  assert.equal(plan.crear.length, 0);
});
