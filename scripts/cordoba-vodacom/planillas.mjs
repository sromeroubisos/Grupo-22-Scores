// cards.raw.json (convertir.py) -> scripts/cordoba-torneos/fuente/vodacom.{partidos,posiciones}.xlsx
// Las tarjetas son la unica fuente: la tabla se calcula con el reglamento de la Union (4/2/0, +1 por 4 tries, +1 por perder por <=7).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const X = createRequire(import.meta.url)('xlsx');
const cards = JSON.parse(fs.readFileSync('scripts/cordoba-vodacom/cards.raw.json', 'utf8'));
const triesDe = (t, lado) => t.inc[lado].filter((i) => i.tipo === 'try' || i.tipo === 'penalty_try').length;
const ddmmyyyy = (f) => f.split('-').reverse().join('/');
const instanciaDe = (c) => (/semifinal/i.test(c.archivo_cabecera.Fecha) ? ['Semifinales', 'Semifinal'] : /^final$/i.test(c.archivo_cabecera.Fecha) ? ['Final', 'Final'] : ['CAMPEONATO', c.archivo_cabecera.Fecha.replace(/(\d)$/, (d) => String(Number(d)))]);
const filas = [['_', '_', 'Instancia', 'Ronda', 'Fecha', 'Id', 'Local', '', '', 'Resultado', 'Visitante', '', '', 'Arbitro', '', 'Estado']];
const tabla = new Map();
const fila = (n) => { if (!tabla.has(n)) tabla.set(n, { n, pts: 0, bd: 0, pj: 0, pg: 0, pe: 0, pp: 0, tf: 0, tc: 0, trF: 0, trC: 0 }); return tabla.get(n); };
for (const c of cards.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))) {
  const [inst, ronda] = instanciaDe(c);
  filas.push(['x', null, inst, inst === 'CAMPEONATO' ? c.archivo_cabecera.Fecha.replace(/\b0(\d)/, '$1') : ronda, `${ddmmyyyy(c.fecha)} ${c.hora}`, c.numero, c.local.nombre, null, null, `${c.local.score}-${c.visitante.score}`, c.visitante.nombre, null, null, c.arbitro || null, null, 'Final']);
  if (inst !== 'CAMPEONATO') continue;
  const L = fila(c.local.nombre), V = fila(c.visitante.nombre);
  const tl = triesDe(c, 'local'), tv = triesDe(c, 'visitante');
  for (const [a, b, ta, sa, sb] of [[L, V, tl, c.local.score, c.visitante.score], [V, L, tv, c.visitante.score, c.local.score]]) {
    a.pj++; a.tf += sa; a.tc += sb; a.trF += ta; a.trC += (a === L ? tv : tl);
    if (sa > sb) { a.pg++; a.pts += 4; } else if (sa === sb) { a.pe++; a.pts += 2; } else { a.pp++; if (sb - sa <= 7) { a.pts++; a.bd++; } }
    if (ta >= 4) a.pts++;
  }
}
const orden = [...tabla.values()].sort((a, b) => b.pts - a.pts || (b.tf - b.tc) - (a.tf - a.tc) || b.trF - a.trF);
const pos = [['TABLA'], ['Equipo', 'Pts', 'BTry', 'BTantos', 'BDest', 'PJ', 'PG', 'PE', 'PP', 'TF', 'TC', 'Dif', 'TrF', 'TrC'],
  ...orden.map((r) => [r.n, r.pts, 0, r.bd, 0, r.pj, r.pg, r.pe, r.pp, r.tf, r.tc, r.tf - r.tc, r.trF, r.trC])];
const guardar = (nombre, datos) => { const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(datos), 'Hoja1'); X.writeFile(wb, `scripts/cordoba-torneos/fuente/${nombre}`); };
guardar('vodacom.partidos.xlsx', filas); guardar('vodacom.posiciones.xlsx', pos);
console.table(orden);
