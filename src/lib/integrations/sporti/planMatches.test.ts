import test from 'node:test';
import assert from 'node:assert/strict';

import { letraDeGrupo, parsePartidos, parseSumula, parseTabla, resumirSumula, sumulaCierra, type ResumenSumula } from './parse.ts';
import {
  bonusDe, contrastarConTabla, planSportiMatches, sumulasQueFaltan, NOTA_SIN_HORARIO, NOTA_WO, type ExistenteSporti,
} from './planMatches.ts';
import { brasiliaAIso, claveDeEquipo, nombreDeRonda } from './nombres.ts';

const AHORA = new Date('2026-10-02T12:00:00Z');

// ── HTML con la forma real de SporTI, recortado ──────────────────────────────

const lado = (slug: string, sigla: string, nombre: string, puntos?: number) => `
<a href="/CBRU/equipe/${slug}" style="color:inherit" target="_blank">
<img src="https://painel.sporti.com.br//UserImages/equipes/${slug}/1.png" width="40" height="40" />
</a>
</div>
<div class="col-md-9 nomeItemPesquisa nomargin nopadding" style="text-align:center;">
<div class="nomeComplementoEquipe">${nombre}</div>
<h3 class="inline nomeEquipeSegundaFase" style="text-align:center; margin-top:5px">
${sigla}
${puntos === undefined ? '' : `<font size="5" color="#2e7d89" style="letter-spacing:1px;">
${puntos}                                </font>`}
</h3>`;

const tarjeta = (o: { sumula: string; info: string; local: [string, string, string, number?]; visitante: [string, string, string, number?] }) => `
<div class="box-pesquisa-matamata-in">
<div class="col-md-12 nopadding" style="padding-left:20px">
<h5 class="inline nomePartidaTabelaMatamata">
Partida Ida
<a href="/sumula/${o.sumula}" class="linkSumulaMataMataFase" target="_blank"><span class="fa fa-file-text-o red-color" title="Súmula"></span></a>
</h5>
</div>
<div class="col-md-12 nopadding"><p class="partida-info">
${o.info}
</p></div>
<div class="row" style="margin-top:-10px;"><div class="col-md-3 nopadding" style="margin-top:2%">
${lado(...o.local)}
</div></div>
<div class="col-md-9 col-md-push-2 nopadding divXMataMata">x</div>
<div class="row" style="clear:both;"><div id="divImgVisitanteAssinada" class="col-md-3 nopadding">
${lado(...o.visitante)}
<div id="divImgVisitanteAssinadaCel" class="col-md-3 nopadding" style="display:none;">
<img src="https://painel.sporti.com.br//UserImages/equipes/${o.visitante[0]}/1.png" width="40" height="40" />
</div>
</div></div>
<div class="col-md-12 nopadding" style="margin-top:8px; text-align:center;">
<a class="linkSumulaCard" href="/CBRU/campeonatos/super-12---primeira-divisao/sumula/${o.sumula}" target="_blank">Ver Súmula</a>
</div>
</div>`;

const columna = (titulo: string, tarjetas: string[]) => `
<div class="col-md-2 nopadding box-pesquisa-matamata-out">
<div class="box-pesquisa-matamata-header">
<h3>${titulo}</h3>
</div>
</div>
<div class="col-md-10 nopadding box-pesquisa-matamata-out"><div class="box-pesquisa-matamata idaVolta">
${tarjetas.join('<hr style="height:1px;" />')}
</div></div>`;

const VISTA_GRUPOS = `<div class="row">${columna('A', [
  tarjeta({ sumula: '106461', info: '20/06/2026 13:30 - INDEFINIDO', local: ['desterro-rugby-clube', 'DES', 'DESTERRO', 0], visitante: ['farrapos-rugby-clube', 'FAR', 'FARRAPOS', 43] }),
  tarjeta({ sumula: '106462', info: '01/08/2026 15:00 - Est&#225;dio da Montanha - Bento Gon&#231;alves, RS', local: ['farrapos-rugby-clube', 'FAR', 'FARRAPOS', 72], visitante: ['desterro-rugby-clube', 'DES', 'DESTERRO', 7] }),
])}${columna('B', [
  tarjeta({ sumula: '106480', info: '18/07/2026 15:00 - Indaiatuba, SP', local: ['rio-branco-rugby-clube', 'RBR', 'RIO BRANCO', 24], visitante: ['indaiatuba-rugby-clube', 'TOR', 'TORNADOS INDAIATUBA', 0] }),
  tarjeta({ sumula: '115170', info: '03/10/2026 - S&#227;o Paulo/Osasco, SP', local: ['associacao-esportiva-politecnica-de-rugby', 'POL', 'POLI'], visitante: ['charrua-rugby-clube', 'CHA', 'CHARRUA'] }),
])}</div>`;

const filaTabla = (pos: number, slug: string, nombre: string, v: number[]) => `
<tr>
<td class="ellipsis colunaTabClassificacaoEquipe">
<div class="NumRanking">${pos}</div>
<a href="/../../../CBRU/equipe/${slug}" style="color:inherit" target="_blank">
<img src="x.png" class="escudosTabela" />
<span class="NomeEquipeTabela nomeEquipeTabelaDesktop"> ${nombre} </span>
<span class="NomeEquipeTabela nomeEquipeTabelaMobile"> XXX </span>
</a>
</td>
${v.map((n) => `<td class="colunaTabClassificacao"><div class="centralizaVertical">${n}</div></td>`).join('\n')}
</tr>`;

const VISTA_TABLA = `<table class="table table-condensed" id="tabelaClassificacao">
<thead><tr>
${['Grupo A', 'P', 'J', 'V', 'E', 'D', 'PP', 'PC', 'SP', 'CA', 'CV', 'WO', 'PE', 'CP1', 'CP2', 'CP3', '%'].map((t) => `<th class="colunaTabClassificacao">${t}</th>`).join('')}
</tr></thead>
<tbody>
${filaTabla(1, 'farrapos-rugby-clube', 'FARRAPOS', [30, 6, 6, 0, 0, 396, 64, 332, 13, 2, 0, 0, 0, 0, 0, 166])}
${filaTabla(2, 'desterro-rugby-clube', 'DESTERRO', [5, 5, 1, 0, 4, 78, 217, -139, 4, 0, 0, 0, 0, 0, 0, 33])}
</tbody></table>`;

const evento = (n: number, tipo: string, equipo: string) => `
<tr id="${n}" class="trEventosPartida" onclick="selectColor(this) ">
<td class="infoItemPesquisa Esconder0 tdEventosPartida">${n}</td>
<td class="infoItemPesquisa tdEventosPartida">1&#186; Tempo</td>
<td class="infoItemPesquisa Esconder0 tdEventosPartida tempoJogo">10</td>
<td class="infoItemPesquisa tdEventosPartida tdEventoNome">${tipo}</td>
<td class="infoItemPesquisa tdEventosPartida">${equipo}</td>
<td class="infoItemPesquisa tdEventosPartida">22 - JUGADOR</td>
</tr>`;

const sumula = (o: { local: string; visitante: string; pl: number; pv: number; eventos: [string, string][]; wo?: boolean }) => `
<div id="nomeEquipeSumula"><a href="/x/equipe/a"><h2 class="inline Esconder0 nomesEquipes">${o.local}</h2></a></div>
<div id="divPlacar">
<h1 id="headerGolsCasa" style="display:inline-block">
${o.pl}
</h1>
<div><strong>X</strong></div>
<h1 id="headerGolsVisitante" style="display:inline-block">
${o.pv}
</h1>
</div>
<div id="nomeEquipeSumula"><a href="/x/equipe/b"><h2 class="inline Esconder0 nomesEquipes">${o.visitante}</h2></a></div>
${o.wo ? '<div class="col-md-6 escalacoes"><div class="col-md-10"><h1 style="font-size:1000%">W.O.</h1></div></div>' : ''}
<table id="tabelaEventos" class="table table-bordered"><thead><tr><th>Nº</th></tr></thead><tbody>
${o.eventos.map(([tipo, equipo], i) => evento(i + 1, tipo, equipo)).join('')}
</tbody></table>
<script>if (evento.Nome == "Gol W.O.") {}</script>`;

// ── parse ────────────────────────────────────────────────────────────────────

test('parsePartidos: columna, slugs, marcador, fecha, hora y cancha', () => {
  const ps = parsePartidos(VISTA_GRUPOS);
  assert.equal(ps.length, 4);
  assert.deepEqual(ps.map((p) => p.columna), ['A', 'A', 'B', 'B']);
  const [ida, vuelta, wo, pendiente] = ps;
  assert.deepEqual(
    { s: ida.sumulaId, l: ida.localSlug, v: ida.visitanteSlug, pl: ida.puntosLocal, pv: ida.puntosVisitante, f: ida.fecha, h: ida.hora, c: ida.cancha },
    { s: '106461', l: 'desterro-rugby-clube', v: 'farrapos-rugby-clube', pl: 0, pv: 43, f: '20/06/2026', h: '13:30', c: null },
  );
  assert.equal(vuelta.cancha, 'Estádio da Montanha - Bento Gonçalves, RS', 'decodifica las entidades y no corta en el guion de la cancha');
  assert.equal(vuelta.localSigla, 'FAR');
  assert.equal(vuelta.visitanteNombre, 'DESTERRO');
  assert.equal(wo.puntosLocal, 24);
  assert.equal(pendiente.puntosLocal, null);
  assert.equal(pendiente.hora, null, 'una tarjeta sin hora');
  assert.equal(pendiente.visitanteSlug, 'charrua-rugby-clube', 'la imagen del celular no es un tercer lado');
});

test('parseTabla: lee por el título de la columna y saca la letra del grupo', () => {
  const t = parseTabla(VISTA_TABLA);
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { grupo: 'A', posicion: 1, slug: 'farrapos-rugby-clube', nombre: 'FARRAPOS', pts: 30, pj: 6, pg: 6, pe: 0, pp: 0, pf: 396, pc: 64, wo: 0 });
  assert.equal(t[1].pc, 217);
  assert.equal(letraDeGrupo('Grupo B'), 'B');
  assert.equal(letraDeGrupo('HEXAGONAL'), 'HEXAGONAL');
});

test('resumirSumula: try 5, penal try 7, conversión 2, penal y drop 3', () => {
  const s = parseSumula(sumula({
    local: 'FARRAPOS', visitante: 'CHARRUA', pl: 22, pv: 3,
    eventos: [['Try', 'FARRAPOS'], ['Conversão', 'FARRAPOS'], ['Penal Try', 'FARRAPOS'], ['Penalidade', 'FARRAPOS'], ['Drop Goal', 'CHARRUA'], ['Cartão Amarelo', 'CHARRUA']],
  }));
  assert.equal(s.wo, false, 'el "Gol W.O." del script no es un W.O.');
  const r = resumirSumula(s)!;
  assert.deepEqual({ tl: r.triesLocal, tv: r.triesVisitante, sl: r.sumaLocal, sv: r.sumaVisitante }, { tl: 2, tv: 0, sl: 17, sv: 3 });
  assert.equal(sumulaCierra(r), false, '17 no es 22: no se le cree ni un try');
});

test('parseSumula: el W.O. se lee del cartel en la planilla', () => {
  const s = parseSumula(sumula({ local: 'RIO BRANCO', visitante: 'TORNADOS INDAIATUBA', pl: 24, pv: 0, eventos: [], wo: true }));
  assert.equal(s.wo, true);
  assert.equal(resumirSumula(s)?.wo, true);
});

// ── nombres ──────────────────────────────────────────────────────────────────

test('brasiliaAIso: offset de Brasilia, sin horario de verano', () => {
  assert.equal(brasiliaAIso('12/09/2026', '15:00'), '2026-09-12T15:00:00-03:00');
  assert.equal(brasiliaAIso('10/01/2027', '9:30'), '2027-01-10T09:30:00-03:00');
  assert.equal(brasiliaAIso('31/13/2026', '15:00'), null);
});

test('claveDeEquipo y nombreDeRonda', () => {
  assert.equal(claveDeEquipo('charrua-rugby-clube'), 'equipe:charrua-rugby-clube');
  assert.equal(claveDeEquipo('charrua-rugby-clube', 'feminino'), 'equipe:charrua-rugby-clube:feminino');
  assert.equal(nombreDeRonda('SEMI FINAL'), 'Semifinal');
  assert.equal(nombreDeRonda('FINAL'), 'Final');
  assert.equal(nombreDeRonda('Rodada  3'), 'Rodada 3');
});

// ── plan ─────────────────────────────────────────────────────────────────────

test('bonusDe: 4 tries o más, derrota por 7 o menos, W.O.', () => {
  assert.equal(bonusDe(29, 19, 4), 1, 'cuatro tries alcanzan aunque el rival haga tres');
  assert.equal(bonusDe(29, 19, 3), 0);
  assert.equal(bonusDe(13, 20, 1), 1, 'perder por 7');
  assert.equal(bonusDe(12, 20, 4), 1, 'perder por 8 con cuatro tries: solo el ofensivo');
  assert.equal(bonusDe(15, 20, 4), 2, 'perder por 5 con cuatro tries: los dos');
  assert.equal(bonusDe(20, 13, null), 0, 'sin tries no hay ofensivo');
  assert.equal(bonusDe(24, 0, null, true), 1, 'el ganador del W.O. suma el ofensivo');
  assert.equal(bonusDe(0, 24, null, true), 0);
});

const CLUBES: Record<string, string> = {
  'desterro-rugby-clube': 'desterro', 'farrapos-rugby-clube': 'farrapos', 'rio-branco-rugby-clube': 'rio-branco',
  'indaiatuba-rugby-clube': 'tornados', 'associacao-esportiva-politecnica-de-rugby': 'poli', 'charrua-rugby-clube': 'charrua',
};
const GRUPOS: Record<string, string> = { A: 'g-a', B: 'g-b' };

const planear = (o: { existentes?: ExistenteSporti[]; sumulas?: Map<string, ResumenSumula>; ahora?: Date } = {}) =>
  planSportiMatches({
    partidos: parsePartidos(VISTA_GRUPOS),
    resolverEquipo: (s) => CLUBES[s] ?? null,
    existentes: o.existentes ?? [],
    sumulas: o.sumulas ?? new Map(),
    faseId: 'fase',
    grupoDe: (c) => (c ? GRUPOS[c] ?? null : null),
    rondaDe: (_c, dt) => ({ id: `r-${dt.slice(0, 10)}`, nombre: 'Rodada' }),
    ahora: o.ahora ?? AHORA,
  });

const resumen = (pl: number, pv: number, tl: number, tv: number, wo = false): ResumenSumula => ({
  puntosLocal: pl, puntosVisitante: pv, triesLocal: tl, triesVisitante: tv,
  sumaLocal: wo ? 0 : pl, sumaVisitante: wo ? 0 : pv, wo,
});

test('plan: altas con grupo, ronda, estado y bonus', () => {
  const plan = planear({ sumulas: new Map([['106461', resumen(0, 43, 0, 7)], ['106462', resumen(72, 7, 12, 1)], ['106480', resumen(24, 0, 0, 0, true)]]) });
  assert.equal(plan.crear.length, 4);
  const [ida, , wo, pendiente] = plan.crear;
  assert.equal(ida.external_id, 'sporti:s106461');
  assert.equal(ida.group_id, 'g-a');
  assert.equal(ida.round_uuid, 'r-2026-06-20');
  assert.equal(ida.date_time, '2026-06-20T13:30:00-03:00');
  assert.deepEqual(ida.score, { home: 0, away: 43, homeTries: 0, awayTries: 7 });
  assert.deepEqual([ida.home_base_points, ida.home_bonus_points, ida.away_base_points, ida.away_bonus_points], [0, 0, 4, 1]);
  assert.deepEqual(wo.score, { home: 24, away: 0, walkover: true });
  assert.equal(wo.notes, NOTA_WO);
  assert.equal(wo.home_bonus_points, 1);
  assert.equal(pendiente.status, 'scheduled');
  assert.equal(pendiente.score, null);
  assert.equal(pendiente.notes, NOTA_SIN_HORARIO);
  assert.equal(pendiente.date_time, '2026-10-03T15:00:00-03:00', 'sin hora va a las 15');
  assert.equal(plan.sinTries.length, 0);
  assert.equal(plan.finales.length, 3);
});

test('plan: una súmula que no suma no da tries, y el partido sale en sinTries', () => {
  const malo = { ...resumen(72, 7, 12, 1), sumaLocal: 70 };
  const plan = planear({ sumulas: new Map([['106462', malo]]) });
  const vuelta = plan.crear.find((f) => f.external_id === 'sporti:s106462')!;
  assert.deepEqual(vuelta.score, { home: 72, away: 7 });
  assert.equal(vuelta.home_bonus_points, 0);
  assert.ok(plan.sinTries.some((s) => s.includes('s106462') && s.includes('no suma')));
});

test('plan: pasados tres días sin marcador, postponed', () => {
  const plan = planear({ ahora: new Date('2026-10-07T12:00:00Z') });
  assert.equal(plan.crear.find((f) => f.external_id === 'sporti:s115170')!.status, 'postponed');
});

test('plan: equipo sin alias se omite y lo dice', () => {
  const plan = planSportiMatches({
    partidos: parsePartidos(VISTA_GRUPOS), resolverEquipo: (s) => (s === 'charrua-rugby-clube' ? null : CLUBES[s]),
    existentes: [], sumulas: new Map(), faseId: 'fase', grupoDe: () => null, rondaDe: () => null, ahora: AHORA,
  });
  assert.equal(plan.omitidos.length, 1);
  assert.equal(plan.omitidos[0].motivo, 'equipo_no_resuelto');
});

const existente = (o: Partial<ExistenteSporti>): ExistenteSporti => ({
  id: 'm1', external_id: 'sporti:s106462', home_club_id: 'farrapos', away_club_id: 'desterro',
  date_time: '2026-08-01T18:00:00+00:00', status: 'final', score: { home: 72, away: 7, homeTries: 12, awayTries: 1 },
  phase_id: 'fase', group_id: 'g-a', round_uuid: 'r-2026-08-01', round_label: 'Rodada', venue: 'Estádio da Montanha - Bento Gonçalves, RS',
  notes: null, home_base_points: 4, away_base_points: 0, home_bonus_points: 1, away_bonus_points: 0, ...o,
});

test('plan: un partido igual no se toca, y sus tries guardados siguen valiendo sin súmula nueva', () => {
  const plan = planear({ existentes: [existente({})] });
  assert.equal(plan.sinCambios, 1);
  assert.ok(!plan.actualizar.some((a) => a.id === 'm1'));
});

test('sumulasQueFaltan: las jugadas sin tries; los W.O. no se vuelven a pedir', () => {
  const ps = parsePartidos(VISTA_GRUPOS);
  const faltan = sumulasQueFaltan(ps, [
    existente({}),
    existente({ id: 'm2', external_id: 'sporti:s106480', score: { home: 24, away: 0, walkover: true } }),
  ]);
  assert.deepEqual(faltan, ['106461']);
});

test('plan: SporTI corrige un marcador → corrección, y la nota de una persona no se pisa', () => {
  const plan = planear({ existentes: [existente({ score: { home: 70, away: 7, homeTries: 12, awayTries: 1 }, notes: 'Partido reanudado al día siguiente' })] });
  const cambio = plan.actualizar.find((a) => a.id === 'm1')!;
  assert.ok(plan.correcciones[0].includes('70-7'));
  assert.deepEqual(cambio.patch.score, { home: 72, away: 7 }, 'la súmula vieja ya no vale: sin tries hasta que se vuelva a pedir');
  assert.ok(!('notes' in cambio.patch));
});

test('contrastarConTabla: vacío si la cuenta da la oficial', () => {
  const plan = planear({ sumulas: new Map([['106461', resumen(0, 43, 0, 7)], ['106462', resumen(72, 7, 12, 1)]]) });
  const tabla = [
    { slug: 'farrapos-rugby-clube', pts: 10, pj: 2, pf: 115, pc: 7 },
    { slug: 'desterro-rugby-clube', pts: 0, pj: 2, pf: 7, pc: 115 },
  ];
  assert.deepEqual(contrastarConTabla(plan.finales.filter((f) => f.localSlug !== 'rio-branco-rugby-clube'), tabla), []);
  assert.deepEqual(contrastarConTabla([], tabla.slice(0, 1)).map((d) => d.campo), ['pts', 'pj', 'pf', 'pc']);
});
