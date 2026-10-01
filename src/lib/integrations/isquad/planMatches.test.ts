import test from 'node:test';
import assert from 'node:assert/strict';

import { parseActa, parseClasificacion, parseResultados, resumirActa, type PartidoIsquad, type ResumenActa } from './parse.ts';
import {
  bonusDe, contrastarConTabla, partidosQueNecesitanActa, planIsquadMatches, NOTA_SIN_HORARIO, type ExistenteIsquad,
} from './planMatches.ts';
import { madridAIso } from './nombres.ts';

const AHORA = new Date('2026-10-01T12:00:00Z');

// ── HTML con la forma real de iSquad, recortado ──────────────────────────────

const filaPartido = (o: { id: string; local: string; visitante: string; marcador?: [string, string]; hora?: string; fecha: string; estado: string; acta?: boolean }) => `
<tr><td><div class="equipos-col"><div class="escudos-partido"><a href='equipo.php?id_equipo=${o.local}'></a></div>
<div class="nombres-equipos">
<a class='' href='equipo.php?seleccion=0&id=1297&id_equipo=${o.local}'>LOCAL</a> -
<a class='negrita' href='equipo.php?seleccion=0&id=1297&id_equipo=${o.visitante}'>VISITANTE</a>
</div></div></td>
<td><div class="custom-col"><span class=''>${o.marcador?.[0] ?? ' '}</span>-<span class='negrita'>${o.marcador?.[1] ?? ' '}</span></div></td>
<td><div >${o.hora ?? '0:00'}</div><div class='negrita'>${o.fecha} </div></td>
<td class="col-lugar"><a href='#'>CAMPO 1 </a></td>
<td><span class='custom-col'><svg><circle cx="6" cy="6" r="6" fill="#3DF59E" /></svg> ${o.estado} </span></td>
<td><a onclick='mostrarPrevio(${o.id})'></a></td>
<td><span onclick='mostrar_modal_streaming("https://youtube.com/live/x")' class='custom-col'>STREAMING</span></td>
<td>${o.acta ? `<a class="custom-col-circle" href='#' onclick='mostrarActa(${o.id});'>` : '<a class="custom-col-circle disabled" href=\'#\'>'}</a></td>
</tr>`;

const RESULTADOS = `<table>
<tr><td><div>Jornada 1</div></td></tr>
${filaPartido({ id: '100', local: '1', visitante: '2', marcador: ['40', '24'], hora: '13:00', fecha: '27/09/2026', estado: 'Finalizado', acta: true })}
${filaPartido({ id: '101', local: '3', visitante: '0', fecha: '27/09/2026', estado: 'Pendiente' })}
<tr><td><div>Jornada 2</div></td></tr>
${filaPartido({ id: '102', local: '2', visitante: '3', fecha: '13/12/2026', estado: 'Pendiente' })}
</table>`;

const evento = (min: string, tipo: string, equipo: string) => `<tr>
<td><div class="custom-col">${min}</div></td><td><div class="custom-col">${tipo}</div></td>
<td><div class="custom-col"><span>0</span> - <span>0</span></div></td>
<td><div><img alt='${equipo}' title='${equipo}' />${equipo}</div></td><td><div>JUGADOR</div></td></tr>`;

// iSquad publica los eventos del último al primero.
const ACTA = `<img alt='LOCAL RC' /><img alt='VISITA RC' /><table>
${evento('70:00', 'Expulsion Temporal por Juego Sucio', 'VISITA RC')}
${evento('60:00', 'Puntapie de Castigo a palos', 'LOCAL RC')}
${evento('50:00', 'Ensayo de Castigo', 'VISITA RC')}
${evento('30:00', 'Conversion de ensayo', 'LOCAL RC')}
${evento('29:00', 'Ensayo', 'LOCAL RC')}
${evento('10:00', 'Drop', 'VISITA RC')}
</table>`;

test('parseResultados: jornadas, marcador, hora sin confirmar y el que descansa', () => {
  const ps = parseResultados(RESULTADOS);
  assert.equal(ps.length, 2, 'el partido contra id_equipo=0 es un descanso, no un partido');
  assert.deepEqual(
    { id: ps[0].id, jornada: ps[0].jornada, l: ps[0].localId, v: ps[0].visitanteId, pl: ps[0].puntosLocal, pv: ps[0].puntosVisitante, hora: ps[0].hora, estado: ps[0].estado, acta: ps[0].conActa },
    { id: '100', jornada: 1, l: '1', v: '2', pl: 40, pv: 24, hora: '13:00', estado: 'Finalizado', acta: true },
  );
  assert.equal(ps[1].jornada, 2);
  assert.equal(ps[1].puntosLocal, null);
  assert.equal(ps[1].hora, null, '"0:00" es sin horario');
  assert.equal(ps[1].conActa, false);
  assert.equal(ps[0].streaming, 'https://youtube.com/live/x');
  assert.equal(ps[0].cancha, 'CAMPO 1');
});

test('parseActa + resumirActa: orden cronológico, tries y puntos por tipo', () => {
  const acta = parseActa(ACTA);
  assert.equal(acta.eventos[0].minuto, '10:00');
  assert.equal(acta.eventos[0].tipo, 'drop_goal');
  assert.equal(acta.eventos.at(-1)?.tipo, 'yellow_card');
  assert.deepEqual(resumirActa(acta), { puntosLocal: 5 + 2 + 3, puntosVisitante: 3 + 7, triesLocal: 1, triesVisitante: 1 });
});

test('parseClasificacion: las 13 columnas, sin los porcentajes', () => {
  const html = `<tr><td class='celda_peque'>1</td><td><a href='equipo.php?id_equipo=251'>X</a></td><td></td>
  <td class='negrita centrado'><div class="custom-col">5</div></td>
  <td class='centrado'><a>1</a></td><td class='centrado'><a>1</a><div style='x'>100%</div></td>
  <td class='centrado'><a>0</a><div style='x'>0%</div></td><td class='centrado'><a>0</a><div style='x'>0%</div></td>
  <td>40</td><td>24</td><td>16</td><td>6</td><td>3</td><td>3</td><td>1</td><td>0</td></tr>`;
  assert.deepEqual(parseClasificacion(html)[0], {
    equipoId: '251', posicion: 1, pts: 5, pj: 1, pg: 1, pe: 0, pp: 0, tf: 40, tc: 24, ef: 6, ec: 3, bo: 1, bd: 0,
  });
});

test('madridAIso: el offset sigue el horario de verano de Madrid', () => {
  assert.equal(madridAIso('27/09/2026', '13:00'), '2026-09-27T13:00:00+02:00');
  assert.equal(madridAIso('13/12/2026', '12:30'), '2026-12-13T12:30:00+01:00');
  assert.equal(madridAIso('31/02/2026', '99:00'), null);
});

test('bonusDe: ofensivo por 3 tries de DIFERENCIA, defensivo por perder por 7 o menos', () => {
  assert.equal(bonusDe(40, 24, { propios: 6, rival: 3 }), 1, '6 contra 3 es bonus');
  assert.equal(bonusDe(39, 20, { propios: 5, rival: 3 }), 0, '5 contra 3 no, aunque sean 4+ tries');
  assert.equal(bonusDe(22, 29, { propios: 2, rival: 4 }), 1, 'perder por 7 es defensivo');
  assert.equal(bonusDe(22, 30, { propios: 2, rival: 4 }), 0, 'por 8 no');
  assert.equal(bonusDe(27, 33, { propios: 5, rival: 2 }), 2, 'perder por 6 con 3 tries más: los dos');
  assert.equal(bonusDe(22, 29, null), 1, 'sin tries solo puede haber defensivo');
});

const resolver = (clave: string) => ({ 'equipo:1': 'club-uno', 'equipo:2': 'club-dos', 'equipo:3': 'club-tres' } as Record<string, string>)[clave] ?? null;

const plan = (partidos: PartidoIsquad[], existentes: ExistenteIsquad[] = [], actas = new Map<string, ResumenActa>()) =>
  planIsquadMatches({
    partidos, resolverEquipo: resolver, existentes, actas,
    faseId: 'fase-1', grupoId: null, rondaDe: (j) => (j ? `ronda-${j}` : null), ahora: AHORA,
  });

const partido = (o: Partial<PartidoIsquad> = {}): PartidoIsquad => ({
  id: '100', jornada: 1, localId: '1', visitanteId: '2', puntosLocal: 40, puntosVisitante: 24,
  fecha: '27/09/2026', hora: '13:00', cancha: 'CAMPO 1', estado: 'Finalizado', conActa: true, streaming: null, ...o,
});

test('alta de un final con acta: tries en el marcador y bonus calculado', () => {
  const actas = new Map([['100', { puntosLocal: 40, puntosVisitante: 24, triesLocal: 6, triesVisitante: 3 }]]);
  const p = plan([partido()], [], actas);
  assert.equal(p.crear.length, 1);
  const f = p.crear[0];
  assert.equal(f.external_id, 'isquad:p100');
  assert.equal(f.status, 'final');
  assert.deepEqual(f.score, { home: 40, away: 24, homeTries: 6, awayTries: 3 });
  assert.equal(f.home_base_points + f.home_bonus_points, 5);
  assert.equal(f.away_base_points + f.away_bonus_points, 0);
  assert.equal(f.date_time, '2026-09-27T13:00:00+02:00');
  assert.equal(f.round_uuid, 'ronda-1');
  assert.equal(p.sinTries.length, 0);
});

test('un acta que no suma el marcador no se cree: final sin tries y en sinTries', () => {
  const actas = new Map([['100', { puntosLocal: 35, puntosVisitante: 24, triesLocal: 5, triesVisitante: 3 }]]);
  const p = plan([partido()], [], actas);
  assert.deepEqual(p.crear[0].score, { home: 40, away: 24 });
  assert.equal(p.sinTries.length, 1);
});

test('partidosQueNecesitanActa: solo finales sin tries guardados o con marcador cambiado', () => {
  const ya = (score: ExistenteIsquad['score']): ExistenteIsquad => ({
    id: 'm1', external_id: 'isquad:p100', home_club_id: 'club-uno', away_club_id: 'club-dos', date_time: null,
    status: 'final', score, phase_id: 'fase-1', group_id: null, round_uuid: null, round_label: null, venue: null,
    stream_url: null, notes: null, home_base_points: 4, away_base_points: 0, home_bonus_points: 1, away_bonus_points: 0,
  });
  assert.deepEqual(partidosQueNecesitanActa([partido()], []), ['100']);
  assert.deepEqual(partidosQueNecesitanActa([partido()], [ya({ home: 40, away: 24 })]), ['100']);
  assert.deepEqual(partidosQueNecesitanActa([partido()], [ya({ home: 40, away: 24, homeTries: 6, awayTries: 3 })]), []);
  assert.deepEqual(partidosQueNecesitanActa([partido()], [ya({ home: 33, away: 24, homeTries: 5, awayTries: 3 })]), ['100']);
  assert.deepEqual(partidosQueNecesitanActa([partido({ estado: 'Pendiente' })], []), []);
});

test('corrida sin novedades: los tries guardados siguen valiendo y no hay cambios', () => {
  const existente: ExistenteIsquad = {
    id: 'm1', external_id: 'isquad:p100', home_club_id: 'club-uno', away_club_id: 'club-dos',
    date_time: '2026-09-27T11:00:00.000Z', status: 'final', score: { home: 40, away: 24, homeTries: 6, awayTries: 3 },
    phase_id: 'fase-1', group_id: null, round_uuid: 'ronda-1', round_label: 'Jornada 1', venue: 'CAMPO 1',
    stream_url: null, notes: null, home_base_points: 4, away_base_points: 0, home_bonus_points: 1, away_bonus_points: 0,
  };
  const p = plan([partido()], [existente]);
  assert.equal(p.sinCambios, 1);
  assert.equal(p.actualizar.length, 0);
  assert.equal(p.sinTries.length, 0);
});

test('pendiente sin horario: mediodía de Madrid y nota; pasado el plazo, postergado', () => {
  const futuro = plan([partido({ id: '102', estado: 'Pendiente', puntosLocal: null, puntosVisitante: null, hora: null, fecha: '13/12/2026', conActa: false })]);
  assert.equal(futuro.crear[0].status, 'scheduled');
  assert.equal(futuro.crear[0].date_time, '2026-12-13T12:00:00+01:00');
  assert.equal(futuro.crear[0].notes, NOTA_SIN_HORARIO);
  assert.equal(futuro.crear[0].score, null);

  const viejo = plan([partido({ id: '103', estado: 'Pendiente', puntosLocal: null, puntosVisitante: null, fecha: '20/09/2026' })]);
  assert.equal(viejo.crear[0].status, 'postponed');

  const aplazado = plan([partido({ id: '104', estado: 'Aplazado', puntosLocal: null, puntosVisitante: null, fecha: '13/12/2026' })]);
  assert.equal(aplazado.crear[0].status, 'postponed');
});

test('equipo sin alias y estado desconocido salen en el reporte, no se adivinan', () => {
  const p = plan([partido({ visitanteId: '99' }), partido({ id: '105', estado: 'En juego', puntosLocal: 7, puntosVisitante: 0 })]);
  assert.equal(p.omitidos[0].motivo, 'equipo_no_resuelto');
  assert.equal(p.estadosDesconocidos.length, 1);
  assert.equal(p.crear.find((c) => c.external_id === 'isquad:p105')?.status, 'scheduled');
});

test('una nota escrita por una persona no se pisa', () => {
  const existente: ExistenteIsquad = {
    id: 'm1', external_id: 'isquad:p102', home_club_id: 'club-dos', away_club_id: 'club-tres',
    date_time: '2026-12-13T11:00:00.000Z', status: 'scheduled', score: null,
    phase_id: 'fase-1', group_id: null, round_uuid: 'ronda-2', round_label: 'Jornada 2', venue: 'CAMPO 1',
    stream_url: null, notes: 'Se juega en cancha alternativa', home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
  };
  const p = plan([partido({ id: '102', jornada: 2, localId: '2', visitanteId: '3', estado: 'Pendiente', puntosLocal: null, puntosVisitante: null, hora: null, fecha: '13/12/2026' })], [existente]);
  assert.equal(p.sinCambios, 1);
});

test('contrastarConTabla: vacío cuando la cuenta da igual, y señala la diferencia', () => {
  const actas = new Map([['100', { puntosLocal: 40, puntosVisitante: 24, triesLocal: 6, triesVisitante: 3 }]]);
  const p = plan([partido()], [], actas);
  const tabla = [
    { equipoId: '1', pts: 5, pj: 1, ef: 6 },
    { equipoId: '2', pts: 0, pj: 1, ef: 3 },
  ];
  assert.deepEqual(contrastarConTabla(p.finales, tabla), []);
  assert.deepEqual(contrastarConTabla(p.finales, [{ equipoId: '1', pts: 4, pj: 1, ef: 6 }]), [
    { equipoId: '1', campo: 'pts', nuestro: 5, oficial: 4 },
  ]);
});
