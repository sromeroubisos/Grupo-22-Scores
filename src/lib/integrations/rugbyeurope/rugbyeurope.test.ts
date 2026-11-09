import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  bonosDeTabla, bonusDefensivo, claveDeRonda, estadoDe, lunesDe, necesitaFicha, normalizarNombre, parseEquipos, parseFicha, parsePagina, parsePools,
  parseTablaOficial,
  planRe, PREFIJO_NOTA, puntosDeBase, RONDAS, rondaPorSemana, semanasNuevas,
  type ExistenteRe, type PartidoRe,
} from './rugbyeurope.ts';
import { clubDe, claveAlias, edicionesActivas, edicionPorClave, EDICIONES } from './ediciones.ts';
import { tagBracketRound } from '../../playoff/bracketSplit.ts';

const U20 = edicionPorClave('u20-championship-2026')!;
const TROPHY = edicionPorClave('mens-trophy-2627')!;
const planU20 = (o: Omit<Parameters<typeof planRe>[0], 'edicion'>) => planRe({ edicion: U20, ...o });

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

test('las rondas del 5.º puesto en adelante caen en "Definición de puestos"; las del título, no', () => {
  const tags = Object.fromEntries(RONDAS.map((r) => [r.clave, tagBracketRound(r.nombre, null)]));
  for (const clave of ['ranking-semis', 'ranking-final'] as const) {
    assert.ok(tags[clave].bracketKey.endsWith('#puestos'), `${clave}: ${tags[clave].bracketKey}`);
    assert.equal(tags[clave].bracketLabel, 'Definición de puestos');
  }
  for (const clave of ['cuartos', 'semis', 'final'] as const) {
    assert.equal(tags[clave].bracketKey.endsWith('#puestos'), false, clave);
  }
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
  const plan = planU20({ partidos: [partidoBel, partidoPor], resolverEquipo, rondaDe, existentes: [], ahora: AHORA });
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
  const primero = planU20({ partidos: [partidoPor], resolverEquipo, rondaDe, existentes: [], ahora: AHORA });
  const existente: ExistenteRe = { id: 'm1', ...primero.crear[0] };
  const segundo = planU20({ partidos: [partidoPor], resolverEquipo, rondaDe, existentes: [existente], ahora: AHORA });
  assert.equal(segundo.crear.length + segundo.actualizar.length, 0);
  assert.equal(segundo.sinCambios, 1);
});

test('planRe pasa un programado a final y marca la corrección de un marcador distinto', () => {
  const existente: ExistenteRe = {
    id: 'm2', external_id: 'rugbyeurope:u20-championship-2026:belgica-u20~polonia-u20:1', home_club_id: 'belgica-u20', away_club_id: 'polonia-u20',
    date_time: '2026-11-08T15:00:00.000Z', status: 'scheduled', score: null, round_uuid: 'r1', round_label: 'Cuartos de final',
    venue: null, notes: null,
  };
  const plan = planU20({ partidos: [partidoBel], resolverEquipo, rondaDe, existentes: [existente], ahora: AHORA });
  assert.equal(plan.actualizar.length, 1);
  assert.deepEqual(plan.actualizar[0].patch.score, { home: 52, away: 26 });
  assert.equal(plan.actualizar[0].patch.status, 'final');

  const final: ExistenteRe = { ...existente, status: 'final', score: { home: 50, away: 26 } };
  const corr = planU20({ partidos: [partidoBel], resolverEquipo, rondaDe, existentes: [final], ahora: AHORA });
  assert.equal(corr.correcciones.length, 1);
});

test('planRe avisa de un equipo sin alias y no escribe ese partido', () => {
  const raro: PartidoRe = { ...partidoBel, local: 'ATLANTIS' };
  const plan = planU20({ partidos: [raro], resolverEquipo, rondaDe, existentes: [], ahora: AHORA });
  assert.deepEqual(plan.equiposSinAlias, ['ATLANTIS']);
  assert.equal(plan.crear.length, 0);
});

// ── Otras ediciones: ligas, zonas, entidades y filas sin fecha ───────────────

const equipoLogo = (nombre: string, abr: string, puntos?: number) => `
<div class="c-image-text"><img src="https://www.rugbyeurope.eu/media/abc/${abr}.png?width=40&amp;format=webp" alt="${nombre}" class="c-image-text__image c-fixtures-table__image" loading="lazy" />
<div class="c-image-text__text"><p class="c-fixtures-table__title"><span class="c-fixtures-table__title__team" data-abbr="${abr}"><span class="c-fixtures-table__title__team__inner">${nombre}</span></span>
${puntos === undefined ? '' : `<span class="c-fixtures-table__title__score">${puntos}</span>`}</p></div></div>`;

const filaLiga = (o: { utc?: string; local: [string, string]; visitante: [string, string]; marcador?: [number, number]; slug?: string }) => `
<tr data-competition-table-row="1,2" class="c-fixtures-table__row">
<td><div>${o.utc ? `<p data-raw-date-utc="${o.utc}"><strong>x</strong></p>` : '<p><strong>TBC</strong></p>'}</div></td>
<td>${equipoLogo(o.local[0], o.local[1], o.marcador?.[0])}<abbr>V</abbr>${equipoLogo(o.visitante[0], o.visitante[1], o.marcador?.[1])}</td>
<td>${o.slug ? `<a href="/competitions/season-2627/xv-competitions/mens-xv-competitions/mens-trophy-2627/${o.slug}/" class="c-button">Watch replay</a>` : ''}</td>
</tr>`;

const PAGINA_LIGA = `
<table class="c-fixtures-table" data-competition-table="fixtures"><tbody>
${filaLiga({ utc: '2026-11-14T12:30:00.0000000Z', local: ['GERMANY', 'GER'], visitante: ['DENMARK', 'DEN'], slug: 'germany-v-denmark' })}
${filaLiga({ local: ['T&#xDC;RKIYE', 'TUR'], visitante: ['MOLDOVA', 'MDA'] })}
</tbody></table>
<table class="c-fixtures-table" data-competition-table="results"><tbody>
${filaLiga({ utc: '2026-11-07T13:00:00.0000000Z', local: ['MALTA', 'MLT'], visitante: ['GERMANY', 'GER'], marcador: [37, 31], slug: 'malta-v-germany' })}
${filaLiga({ utc: '2026-10-31T12:00:00.0000000Z', local: ['DENMARK', 'DEN'], visitante: ['MALTA', 'MLT'], marcador: [17, 36] })}
</tbody></table>
<table class="c-league-table"><tbody><tr><td>1</td><td>CZECHIA</td></tr></tbody></table>
<a href="/competitions/season-2627/xv-competitions/otro/foo-v-bar/">Related</a>
<table class="c-pools__table c-pools__table--no-qualifiers"><thead><tr><th>Pool A</th><th>Pld</th></tr></thead><tbody>
<tr><td>LUX</td><td>2</td></tr><tr><td>FIN</td><td>1</td></tr><tr><td>EST</td><td>2</td></tr></tbody></table>
<table class="c-pools__table"><thead><tr><th>Pool B</th><th>Pld</th></tr></thead><tbody>
<tr><td>CRO</td><td>3</td></tr><tr><td>AUT</td><td>2</td></tr></tbody></table>`;

test('parsePagina sirve para cualquier edición: saltea los partidos sin fecha y no toma un enlace ajeno', () => {
  const filas = parsePagina(PAGINA_LIGA);
  assert.deepEqual(filas.map((f) => `${f.tabla}:${f.local}-${f.visitante}`), [
    'fixtures:GERMANY-DENMARK', 'results:MALTA-GERMANY', 'results:DENMARK-MALTA',
  ]);
  assert.match(filas[0].ficha ?? '', /mens-trophy-2627\/germany-v-denmark\/$/);
  // la última fila no tiene enlace: el "Related" que viene después NO es su ficha
  assert.equal(filas[2].ficha, null);
});

test('parseEquipos incluye los partidos sin fecha, decodifica las entidades y deja el escudo sin parámetros', () => {
  const equipos = parseEquipos(PAGINA_LIGA);
  const turquia = equipos.find((e) => e.abr === 'TUR');
  assert.equal(turquia?.nombre, 'TÜRKIYE');
  assert.equal(normalizarNombre(turquia!.nombre), 'turkiye');
  assert.equal(equipos.find((e) => e.abr === 'MLT')?.logo, 'https://www.rugbyeurope.eu/media/abc/MLT.png');
  assert.equal(new Set(equipos.map((e) => e.nombre)).size, equipos.length);
});

test('parsePools lee las zonas con la sigla de cada equipo', () => {
  assert.deepEqual(parsePools(PAGINA_LIGA), [
    { nombre: 'Pool A', abrs: ['LUX', 'FIN', 'EST'] },
    { nombre: 'Pool B', abrs: ['CRO', 'AUT'] },
  ]);
});

test('una fecha de liga es una semana: lunesDe y semanasNuevas', () => {
  assert.equal(lunesDe('2026-11-07T17:30:00Z'), '2026-11-02');
  assert.equal(lunesDe('2026-11-08T12:00:00Z'), '2026-11-02');
  assert.equal(lunesDe('2026-11-09T00:00:00Z'), '2026-11-09');
  const rondas = [{ id: 'r1', name: 'Fecha 1', order_index: 1, start_date: '2026-11-02' }];
  const ps = [{ inicio: '2026-11-07T13:00:00Z' }, { inicio: '2026-11-14T12:30:00Z' }, { inicio: '2026-11-15T12:00:00Z' }];
  assert.deepEqual(semanasNuevas(ps, rondas), ['2026-11-09']);
  assert.deepEqual(rondaPorSemana(rondas)(null, ps[0]), { id: 'r1', nombre: 'Fecha 1' });
});

test('los puntos de tabla: 4/2/0 y el bonus defensivo por perder por 7 o menos', () => {
  assert.deepEqual([puntosDeBase(37, 31), puntosDeBase(31, 37), puntosDeBase(20, 20)], [4, 0, 2]);
  assert.deepEqual([bonusDefensivo(31, 37), bonusDefensivo(30, 37), bonusDefensivo(10, 37), bonusDefensivo(37, 31)], [1, 1, 0, 0]);
});

const CLUB_M: Record<string, string> = { malta: 'malta', germany: 'alemania', denmark: 'dinamarca' };
const resolverM = (n: string) => CLUB_M[normalizarNombre(n)] ?? null;
const rondasLiga = [{ id: 'r1', name: 'Fecha 1', order_index: 1, start_date: '2026-11-02' }];
const maltaAlemania = parsePagina(PAGINA_LIGA).find((f) => f.local === 'MALTA')!;
const AHORA_LIGA = new Date('2026-11-10T09:00:00Z');

test('planRe en una liga: ronda por semana, puntos de tabla y nota, sin necesitar la ficha', () => {
  const plan = planRe({
    edicion: TROPHY, partidos: [{ ...maltaAlemania, ficha_datos: null }], resolverEquipo: resolverM,
    rondaDe: rondaPorSemana(rondasLiga), existentes: [], ahora: AHORA_LIGA,
  });
  assert.equal(plan.crear.length, 1);
  const m = plan.crear[0];
  assert.equal(m.external_id, 'rugbyeurope:mens-trophy-2627:malta~alemania:1');
  assert.equal(m.status, 'final');
  assert.deepEqual(m.score, { home: 37, away: 31 });
  assert.deepEqual([m.round_uuid, m.round_label], ['r1', 'Fecha 1']);
  assert.equal(m.notes, `${PREFIJO_NOTA}Fecha 1`);
  assert.deepEqual([m.home_base_points, m.away_base_points, m.home_bonus_points, m.away_bonus_points], [4, 0, 0, 1]);
  // idempotente
  const existente: ExistenteRe = { id: 'x', ...m };
  const otra = planRe({
    edicion: TROPHY, partidos: [{ ...maltaAlemania, ficha_datos: null }], resolverEquipo: resolverM,
    rondaDe: rondaPorSemana(rondasLiga), existentes: [existente], ahora: AHORA_LIGA,
  });
  assert.equal(otra.actualizar.length + otra.crear.length, 0);
  // y si los puntos guardados están en cero, los corrige
  const sinPuntos: ExistenteRe = { ...existente, home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0 };
  const corr = planRe({
    edicion: TROPHY, partidos: [{ ...maltaAlemania, ficha_datos: null }], resolverEquipo: resolverM,
    rondaDe: rondaPorSemana(rondasLiga), existentes: [sinPuntos], ahora: AHORA_LIGA,
  });
  assert.deepEqual(corr.actualizar[0].cambios, ['puntos de tabla']);
});

test('planRe en un cuadro: sin la ficha no se pisa la ronda guardada', () => {
  const existente: ExistenteRe = {
    id: 'm3', external_id: 'rugbyeurope:u20-championship-2026:belgica-u20~polonia-u20:1', home_club_id: 'belgica-u20', away_club_id: 'polonia-u20',
    date_time: '2026-11-08T15:00:00.000Z', status: 'scheduled', score: null, round_uuid: 'r1', round_label: 'Cuartos de final',
    venue: 'Prague Marketa Stadium', notes: `${PREFIJO_NOTA}Cuartos de final · M3`,
  };
  const plan = planU20({ partidos: [{ ...base, ficha_datos: null }], resolverEquipo, rondaDe: () => ({ id: null, nombre: 'Cuadro' }), existentes: [existente], ahora: AHORA });
  assert.equal(plan.actualizar.length + plan.crear.length, 0);
});

// ── Ficha: qué vale la pena bajar ────────────────────────────────────────────

test('necesitaFicha: el cuadro siempre, la liga solo lo que puede traer algo nuevo', () => {
  const futuro = { ...maltaAlemania, tabla: 'fixtures' as const, inicio: '2026-11-14T12:30:00.000Z', puntosLocal: null, puntosVisitante: null };
  const cerrado: ExistenteRe = {
    id: 'x', external_id: 'a', home_club_id: 'malta', away_club_id: 'alemania', date_time: maltaAlemania.inicio, status: 'final',
    score: { home: 37, away: 31 }, round_uuid: 'r1', round_label: 'Fecha 1', venue: null, notes: null,
  };
  // liga: resultado cerrado → no; programado sin estadio dentro de 7 días → sí; con estadio → no
  assert.equal(necesitaFicha(maltaAlemania, TROPHY, cerrado, AHORA_LIGA), false);
  assert.equal(necesitaFicha(futuro, TROPHY, { ...cerrado, status: 'scheduled', score: null }, AHORA_LIGA), true);
  assert.equal(necesitaFicha(futuro, TROPHY, { ...cerrado, status: 'scheduled', score: null, venue: 'Estadio' }, AHORA_LIGA), false);
  // liga: partido dado de alta por primera vez, cercano → una vez
  assert.equal(necesitaFicha(futuro, TROPHY, undefined, AHORA_LIGA), true);
  // en juego → siempre
  const enJuego = { ...futuro, inicio: '2026-11-10T08:00:00.000Z' };
  assert.equal(necesitaFicha(enJuego, TROPHY, { ...cerrado, status: 'live', score: null, venue: 'Estadio' }, AHORA_LIGA), true);
  // cuadro: sin ronda o estadio guardados se pide aunque el resultado esté cerrado
  assert.equal(necesitaFicha(maltaAlemania, U20, cerrado, AHORA_LIGA), true);
  assert.equal(necesitaFicha(maltaAlemania, U20, { ...cerrado, venue: 'Estadio' }, AHORA_LIGA), false);
});

// ── Catálogo ─────────────────────────────────────────────────────────────────

test('clubDe: el nombre del sitio se resuelve por categoría', () => {
  assert.equal(clubDe('m', 'CZECHIA')?.id, 'republica-checa');
  assert.equal(clubDe('u20', 'NETHERLANDS')?.id, 'paises-bajos-u20');
  assert.equal(clubDe('w', 'ANDORRA')?.id, 'andorra-w');
  assert.equal(clubDe('u18', 'SPAIN')?.name, 'España U18');
  assert.equal(clubDe('m', 'TÜRKIYE')?.id, 'turquia');
  assert.equal(clubDe('sc', 'Delta')?.id, 'delta-rugby-nl');
  assert.equal(clubDe('sc', 'Lusitanos')?.id, 'lusitanos-xv');
  assert.equal(clubDe('m', 'ATLANTIS'), null);
  // el mismo nombre del sitio es otro club según la competición
  assert.equal(claveAlias('w', 'ANDORRA'), 'w:andorra');
  assert.notEqual(claveAlias('m', 'ANDORRA'), claveAlias('w', 'ANDORRA'));
});

test('cada selección del catálogo tiene su bandera propia (el molde de dos esquinas curvas) en disco', () => {
  const sitio = ['ANDORRA', 'AUSTRIA', 'BELGIUM', 'BULGARIA', 'CROATIA', 'CYPRUS', 'CZECHIA', 'DENMARK', 'ESTONIA', 'FINLAND', 'GEORGIA', 'GERMANY',
    'GIBRALTAR', 'GREECE', 'ISRAEL', 'KOSOVO', 'LITHUANIA', 'LUXEMBOURG', 'MALTA', 'MOLDOVA', 'MONTENEGRO', 'NETHERLANDS', 'NORWAY', 'POLAND',
    'PORTUGAL', 'ROMANIA', 'SERBIA', 'SLOVENIA', 'SPAIN', 'SWEDEN', 'SWITZERLAND', 'TÜRKIYE', 'UKRAINE'];
  const faltan: string[] = [];
  for (const nombre of sitio) {
    for (const grupo of ['m', 'w', 'u18', 'u20'] as const) {
      const club = clubDe(grupo, nombre);
      assert.ok(club?.bandera, `${grupo}:${nombre} sin bandera declarada`);
      if (!fs.existsSync(path.join(process.cwd(), 'public', 'logos', 'selecciones', `${club.bandera}.png`))) faltan.push(club.bandera as string);
    }
  }
  assert.deepEqual([...new Set(faltan)], []);
  // Los clubes de la Super Cup no son selecciones: llevan su escudo
  assert.equal(clubDe('sc', 'Lusitanos')?.bandera, undefined);
  assert.equal(clubDe('m', 'TÜRKIYE')?.bandera, 'turkey');
});

test('el catálogo no repite claves ni slugs, y edicionesActivas respeta la ventana', () => {
  assert.equal(new Set(EDICIONES.map((e) => e.clave)).size, EDICIONES.length);
  assert.equal(new Set(EDICIONES.map((e) => e.slug)).size, EDICIONES.length);
  assert.equal(edicionesActivas(new Date('2026-11-08T12:00:00Z')).length, EDICIONES.length);
  assert.deepEqual(edicionesActivas(new Date('2027-04-01T12:00:00Z')).map((e) => e.clave).sort(),
    ['mens-conference-202627', 'womens-conference-2026-27', 'womens-trophy-202627']);
  assert.equal(edicionesActivas(new Date('2026-08-01T12:00:00Z')).length, 0);
});

const TABLA_OFICIAL = `
<table class="c-league-table"><thead><tr><th>Pos</th><th>Team</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>F</th><th>A</th><th>B</th><th>Pts</th></tr></thead><tbody>
<tr><td>1</td><td>MALTA</td><td>2</td><td>2</td><td>0</td><td>0</td><td>73</td><td>48</td><td>1</td><td>9</td></tr>
<tr><td>2</td><td>GERMANY</td><td>1</td><td>0</td><td>0</td><td>1</td><td>31</td><td>37</td><td>2</td><td>2</td></tr>
<tr><td>3</td><td>DENMARK</td><td>1</td><td>0</td><td>0</td><td>1</td><td>17</td><td>36</td><td>0</td><td>0</td></tr>
</tbody></table>`;

test('parseTablaOficial y bonosDeTabla: el bonus total por equipo, también con sigla en las zonas', () => {
  assert.deepEqual(parseTablaOficial(TABLA_OFICIAL).map((f) => [f.clave, f.bonus, f.puntos]), [['MALTA', 1, 9], ['GERMANY', 2, 2], ['DENMARK', 0, 0]]);
  const bonos = bonosDeTabla(TABLA_OFICIAL, resolverM);
  assert.deepEqual([...bonos], [['malta', 1], ['alemania', 2], ['dinamarca', 0]]);
  // zonas: la sigla se traduce al nombre con las filas de partidos
  const zonas = `${PAGINA_LIGA.replace(/<table class="c-pools__table[\s\S]*$/, '')}
<table class="c-pools__table"><thead><tr><th>Pool A</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>F</th><th>A</th><th>B</th><th>Pts</th></tr></thead><tbody>
<tr><td>MLT</td><td>2</td><td>2</td><td>0</td><td>0</td><td>73</td><td>48</td><td>1</td><td>9</td></tr></tbody></table>`;
  assert.deepEqual([...bonosDeTabla(zonas, resolverM)], [['malta', 1]]);
});

test('el bonus ofensivo sale de la tabla oficial: lo que falta sobre el defensivo, en los partidos de más tantos', () => {
  const resultados = parsePagina(PAGINA_LIGA).filter((f) => f.tabla === 'results').map((f) => ({ ...f, ficha_datos: null }));
  const conBonos = (bonos?: Map<string, number>) => planRe({
    edicion: TROPHY, partidos: resultados, resolverEquipo: resolverM, rondaDe: rondaPorSemana(rondasLiga),
    bonosOficiales: bonos, existentes: [], ahora: AHORA_LIGA,
  }).crear;
  const por = (filas: ReturnType<typeof conBonos>, h: string) => filas.find((f) => f.home_club_id === h)!;

  // sin tabla oficial: solo el defensivo (Alemania perdió por 6)
  const sola = conBonos();
  assert.deepEqual([por(sola, 'malta').home_bonus_points, por(sola, 'malta').away_bonus_points], [0, 1]);
  assert.deepEqual([por(sola, 'dinamarca').home_bonus_points, por(sola, 'dinamarca').away_bonus_points], [0, 0]);

  // con ella: Malta 1 de bonus → un ofensivo, en su partido de más tantos (37); Alemania 2 = 1 defensivo + 1 ofensivo (31)
  const con = conBonos(new Map([['malta', 1], ['alemania', 2], ['dinamarca', 0]]));
  assert.deepEqual([por(con, 'malta').home_bonus_points, por(con, 'malta').away_bonus_points], [1, 2]);
  assert.deepEqual([por(con, 'dinamarca').home_bonus_points, por(con, 'dinamarca').away_bonus_points], [0, 0]);
  // un bonus oficial menor al defensivo no inventa nada ni resta
  const menor = conBonos(new Map([['alemania', 0]]));
  assert.equal(por(menor, 'malta').away_bonus_points, 1);
});

test('parseFicha: las semifinales vienen sin número, y un estadio no se confunde con una ronda', () => {
  const semi = parseFicha(ficha({ rotulo: 'Semi Finals ', cuenta: true }));
  assert.equal(semi.rotulo, 'Semi Finals');
  assert.equal(semi.numero, null);
  assert.equal(claveDeRonda(semi.rotulo), 'semis');
  assert.equal(claveDeRonda(parseFicha(ficha({ rotulo: 'Ranking Semi Finals' })).rotulo), 'ranking-semis');
  assert.equal(parseFicha(ficha({ rotulo: 'Final & 3rd Place' })).rotulo, 'Final & 3rd Place');
  // una línea de detalle que no es una ronda (el estadio) no cuenta
  assert.equal(parseFicha(ficha({ rotulo: 'Prague Marketa Stadium' })).rotulo, null);
});
