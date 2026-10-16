/**
 * Lee las dos planillas de la Unión Cordobesa (fuente/Partidos.xlsx y
 * fuente/Posiciones.xlsx) y escribe fuente/partidos.json y fuente/tabla.json.
 * Valida que los partidos jugados reproduzcan la tabla oficial (PJ, PG, PP, TF, TC).
 *
 *   node scripts/cordoba-m19/extraer.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const X = require('xlsx');
const DIR = path.join(process.cwd(), 'scripts', 'cordoba-m19', 'fuente');
const hoja = (f) => {
  const wb = X.readFile(path.join(DIR, f));
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false });
};

const ALIAS = {
  'JOCKEY CLUB CORDOBA "A"': 'jockey-club-cordoba', 'LA TABLADA "A"': 'club-la-tablada',
  'PALERMO BAJO "A"': 'club-palermo-bajo', 'URU-CURE R.C. "A"': 'uru-cure-rugby-club',
  'JOCKEY CLUB VILLA MARIA': 'jockey-club-de-villa-maria', 'TALA R.C. "A"': 'tala-rugby-club',
  'CORDOBA ATHLETIC "A"': 'cordoba-athletic-club', 'SAN MARTIN R.C. V.M.': 'san-martin-de-villa-maria',
  'UNIVERSITARIO "A"': 'club-universitario-de-cordoba', 'CARLOS PAZ R.C.': 'carlos-paz-rugby-club',
};
const limpio = (s) => String(s).replace(/\s+/g, ' ').trim();
const madre = (s) => { const id = ALIAS[limpio(s)]; if (!id) throw new Error(`alias sin madre: ${s}`); return id; };

const partidos = hoja('Partidos.xlsx').slice(1).filter((r) => r[0]).map((r) => {
  const [d, h] = limpio(r[4]).split(' ');
  const [dd, mm, aa] = d.split('/');
  const [a, b] = limpio(r[9]).split('-').map(Number);
  const estado = limpio(r[15]);
  return {
    id: limpio(r[5]), instancia: limpio(r[2]), ronda: limpio(r[3]), fecha: `${aa}-${mm}-${dd}`, hora: h ?? null,
    local: madre(r[6]), visitante: madre(r[10]), hs: a, as: b,
    estado: estado === 'Pendiente' ? 'scheduled' : /walkover/i.test(estado) ? 'walkover' : 'final',
    arbitro: r[13] ? limpio(r[13]) : null,
  };
});

const tabla = hoja('Posiciones.xlsx').slice(2).filter((r) => r[0]).map((r) => ({
  club: madre(r[0]), pts: Number(r[1] ?? 0), bTry: Number(r[2] ?? 0), bTantos: Number(r[3] ?? 0), bDestrezas: Number(r[4] ?? 0),
  pj: Number(r[5] ?? 0), pg: Number(r[6] ?? 0), pe: Number(r[7] ?? 0), pp: Number(r[8] ?? 0),
  tf: Number(r[9] ?? 0), tc: Number(r[10] ?? 0), tryF: Number(r[12] ?? 0), tryC: Number(r[13] ?? 0),
  penales: Number(r[14] ?? 0), conv: Number(r[15] ?? 0), amarillas: Number(r[16] ?? 0), rojas: Number(r[18] ?? 0),
}));

// ── Validación: los partidos de la fase regular contra la tabla ──────────────
const jugados = partidos.filter((p) => p.estado !== 'scheduled' && (p.instancia === 'CAMPEONATO'));
const calc = new Map(tabla.map((t) => [t.club, { pj: 0, pg: 0, pp: 0, pe: 0, tf: 0, tc: 0, dif: 0 }]));
for (const p of jugados) {
  for (const [c, f, k] of [[p.local, p.hs, p.as], [p.visitante, p.as, p.hs]]) {
    const t = calc.get(c); t.pj++; t.tf += f; t.tc += k;
    if (f > k) t.pg++; else if (f < k) { t.pp++; if (k - f <= 7) t.dif++; } else t.pe++;
  }
}
let ok = true;
for (const t of tabla) {
  const c = calc.get(t.club);
  const dif = ['pj', 'pg', 'pp', 'tf', 'tc'].filter((k) => c[k] !== t[k]);
  if (dif.length || c.dif !== t.bTantos) ok = false;
  console.log(`${t.club.padEnd(30)} ${dif.length || c.dif !== t.bTantos ? 'XX' : 'ok'}  tabla PJ${t.pj} PG${t.pg} PP${t.pp} ${t.tf}-${t.tc} bDef${t.bTantos} | calc PJ${c.pj} PG${c.pg} PP${c.pp} ${c.tf}-${c.tc} bDef${c.dif} | pts ${t.pts} (4*PG+bDef=${4 * t.pg + t.bTantos}, resto ofensivo=${t.pts - 4 * t.pg - t.bTantos})`);
}
console.log(ok ? '\n✓ los partidos reproducen la tabla' : '\n✗ HAY DIFERENCIAS');
fs.writeFileSync(path.join(DIR, 'partidos.json'), JSON.stringify(partidos, null, 1) + '\n');
fs.writeFileSync(path.join(DIR, 'tabla.json'), JSON.stringify(tabla, null, 1) + '\n');
console.log(`${partidos.length} partidos (${partidos.filter((p) => p.estado === 'scheduled').length} pendientes), ${tabla.length} filas de tabla`);
