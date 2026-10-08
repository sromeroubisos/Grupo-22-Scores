import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bonusDefensivo, leerDia, leerRango, normalizarNombre, parseJornada, planSxv, PREFIJO_NOTA, NOTA_SIN_FECHA,
  type ExistenteSxv, type JornadaSxv,
} from './superxv.ts';

// ── HTML con la forma real de superxv.pt (recortado) ─────────────────────────

const fila = (o: { hora: string; estado: string; local: string; visitante: string; centro?: string; cancha: string }) => `
<div class="sxv-transition fixtures:mb-[2px] mb-[10px] border-l-4">
<div class="fixtures:grid fixtures:grid-cols-[112px_1fr_168px_1fr_300px_152px] hidden items-center">
<div class="flex flex-col gap-1"><span class="font-display text-[25px]">${o.hora}</span><span class="font-condensed text-[10.5px]">${o.estado}</span></div>
<div class="flex min-w-0 items-center justify-end gap-[14px]"><span class="type-team text-right wrap-anywhere text-canvas-dark">${o.local}</span><span class="flex-none"><img alt="${o.local}"/></span></div>
<div class="font-display text-canvas-dark flex items-center justify-center gap-3 text-[34px] leading-none tabular-nums">${o.centro ?? '<span class="font-display text-disabled-strong">VS</span>'}</div>
<div class="flex min-w-0 items-center gap-[14px]"><span class="flex-none"><img alt="${o.visitante}"/></span><span class="type-team wrap-anywhere text-canvas-dark">${o.visitante}</span></div>
<div class="border-divider flex flex-col gap-[3px] border-l pl-5"><span class="text-ink-muted text-sm">${o.cancha}</span><span class="font-condensed"></span></div>
<div class="flex justify-end"></div>
</div>
<div class="fixtures:hidden flex min-h-[182px] flex-col"><span class="min-w-0 truncate">corto</span></div>
</div>`;

const pagina = (jornada: number, rango: string, dias: { titulo: string; filas: string[] }[]) => `
<html><body><a>Jornada 1</a>
<header><h2 class="font-display">Jornada ${jornada}</h2><span class="font-condensed">${rango}</span></header>
${dias.map((d) => `<section><div><h3 class="font-display">${d.titulo}</h3><span>${d.filas.length} jogos</span></div>${d.filas.join('')}</section>`).join('')}
</body></html>`;

const J2 = pagina(2, '17 – 18 outubro', [
  { titulo: 'Sábado 17 out', filas: [fila({ hora: '14:00', estado: 'Por jogar', local: 'RC Santarém', visitante: 'CF Belenenses', cancha: 'CNEMA' })] },
  { titulo: 'Domingo 18 out', filas: [fila({ hora: '12:00', estado: 'Por jogar', local: 'CR Técnico', visitante: 'GD Direito', cancha: 'Campo das Olaias' })] },
]);

test('parseJornada: días, horas, equipos, cancha y estado', () => {
  const j = parseJornada(J2, 2) as JornadaSxv;
  assert.equal(j.desde, '2026-10-17');
  assert.equal(j.hasta, '2026-10-18');
  assert.deepEqual(j.partidos[0], {
    jornada: 2, fecha: '2026-10-17', hora: '14:00', local: 'RC Santarém', visitante: 'CF Belenenses',
    puntosLocal: null, puntosVisitante: null, estado: 'Por jogar', cancha: 'CNEMA',
  });
  assert.equal(j.partidos[1].fecha, '2026-10-18');
});

test('parseJornada: una jornada que no existe devuelve la 1 y eso es null', () => {
  assert.equal(parseJornada(J2, 12), null);
  assert.equal(parseJornada('<html>otra cosa</html>', 1), null);
});

test('parseJornada: sin día ni hora ("Por confirmar", "—"), y un marcador en la celda central', () => {
  const html = pagina(11, '23 – 24 janeiro', [{ titulo: 'Por confirmar', filas: [
    fila({ hora: '—', estado: 'Por agendar', local: 'AAC', visitante: 'CDUL', cancha: 'Taveiro' }),
    fila({ hora: '15:00', estado: 'Final', local: 'SL Benfica', visitante: 'CDUP', cancha: 'EUL', centro: '<span>35</span><span>–</span><span>12</span>' }),
  ] }]);
  const j = parseJornada(html, 11) as JornadaSxv;
  assert.equal(j.desde, '2027-01-23');
  assert.equal(j.partidos[0].fecha, null);
  assert.equal(j.partidos[0].hora, null);
  assert.equal(j.partidos[1].puntosLocal, 35);
  assert.equal(j.partidos[1].puntosVisitante, 12);
});

test('fechas: la temporada cruza el año; rangos con y sin mes en las dos puntas', () => {
  assert.equal(leerDia('Sábado 17 out'), '2026-10-17');
  assert.equal(leerDia('Sábado 23 jan'), '2027-01-23');
  assert.equal(leerDia('Por confirmar'), null);
  assert.deepEqual(leerRango('10 setembro – 11 outubro'), { desde: '2026-09-10', hasta: '2026-10-11' });
  assert.deepEqual(leerRango('31 – 1 novembro'), { desde: '2026-10-31', hasta: '2026-11-01' });
  assert.deepEqual(leerRango('19 – 20 dezembro'), { desde: '2026-12-19', hasta: '2026-12-20' });
  assert.equal(normalizarNombre('CR São Miguel'), 'cr-sao-miguel');
});

// ── El plan ──────────────────────────────────────────────────────────────────

const CLUBES: Record<string, string> = { 'rc-santarem': 'santarem', 'cf-belenenses': 'belenenses', 'aac': 'aa-coimbra', 'cdul': 'cdul', 'sl-benfica': 'benfica', 'cdup': 'cdup' };
const planDe = (jornadas: JornadaSxv[], existentes: ExistenteSxv[] = [], ahora = new Date('2026-10-08T12:00:00Z')) => planSxv({
  jornadas, temporada: '2026-27', existentes, ahora,
  resolverEquipo: (n) => CLUBES[normalizarNombre(n)] ?? null,
  rondaDe: (j) => ({ id: `r${j}`, nombre: `Fecha ${j}` }),
});

const partido = (o: Partial<JornadaSxv['partidos'][number]>) => ({
  jornada: 2, fecha: '2026-10-17', hora: '14:00', local: 'RC Santarém', visitante: 'CF Belenenses',
  puntosLocal: null, puntosVisitante: null, estado: 'Por jogar', cancha: 'CNEMA', ...o,
});

test('plan: un partido programado, con la hora de Lisboa', () => {
  const plan = planDe([{ jornada: 2, desde: '2026-10-17', hasta: '2026-10-18', partidos: [partido({})] }]);
  assert.equal(plan.crear.length, 1);
  const c = plan.crear[0];
  assert.equal(c.external_id, 'superxv:2026-27:santarem~belenenses:1');
  assert.equal(c.date_time, '2026-10-17T14:00:00+01:00');
  assert.equal(c.status, 'scheduled');
  assert.equal(c.round_label, 'Fecha 2');
  assert.equal(c.notes, `${PREFIJO_NOTA}Jornada 2`);
});

test('plan: sin fecha va al primer día de la jornada y lo dice la nota', () => {
  const plan = planDe([{ jornada: 11, desde: '2027-01-23', hasta: '2027-01-24', partidos: [partido({ jornada: 11, fecha: null, hora: null, local: 'AAC', visitante: 'CDUL' })] }]);
  assert.equal(plan.crear[0].date_time, '2027-01-23T15:00:00+00:00');
  assert.equal(plan.crear[0].notes, `${PREFIJO_NOTA}Jornada 11 · ${NOTA_SIN_FECHA}`);
});

test('plan: un marcador cuenta como final con estado de final o pasadas 3 h; en juego, no se escribe', () => {
  const tarde = new Date('2026-10-17T20:00:00Z');
  const conMarcador = (estado: string) => planDe([{ jornada: 2, desde: null, hasta: null, partidos: [partido({ puntosLocal: 10, puntosVisitante: 15, estado })] }], [], tarde);
  const fin = conMarcador('Final').crear[0];
  assert.equal(fin.status, 'final');
  assert.deepEqual(fin.score, { home: 10, away: 15 });
  assert.equal(fin.home_base_points, 0);
  assert.equal(fin.home_bonus_points, 1); // perdió por 5
  assert.equal(conMarcador('').crear[0].status, 'final'); // sin estado, 6 h después
  const vivo = planDe([{ jornada: 2, desde: null, hasta: null, partidos: [partido({ puntosLocal: 10, puntosVisitante: 15, estado: '2ª parte' })] }], [], new Date('2026-10-17T13:30:00Z'));
  assert.equal(vivo.crear[0].status, 'scheduled');
  assert.equal(vivo.crear[0].score, null);
  assert.equal(vivo.enJuego.length, 1);
});

test('plan: sin cambios no escribe; los nombres sin alias se reportan', () => {
  const primero = planDe([{ jornada: 2, desde: null, hasta: null, partidos: [partido({})] }]).crear[0];
  const guardado: ExistenteSxv = { id: 'm1', ...primero, score: null };
  const plan = planDe([{ jornada: 2, desde: null, hasta: null, partidos: [partido({}), partido({ local: 'CR Setúbal', visitante: 'CDUL' })] }], [guardado]);
  assert.equal(plan.sinCambios, 1);
  assert.equal(plan.crear.length, 0);
  assert.deepEqual(plan.equiposSinAlias, ['CR Setúbal']);
  assert.equal(bonusDefensivo(10, 18), 0);
});
