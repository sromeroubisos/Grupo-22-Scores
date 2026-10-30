// partidos.json (parse.mjs) -> tarjetas.txt en el formato que lee build_trpc.py (el de nea-noa-tarjetas).
// Cada lado va con el id de club de G22 en lugar del nombre de la tarjeta.
import fs from 'node:fs';
import { CLUB_POR_NOMBRE, TORNEO_CORREGIDO } from './datos.mjs';

const [src, dst] = process.argv.slice(2);
const KEYS = {
  'TRPC 2026': 'trpc', 'URTF ZONA COMPETENCIA - APERTURA 2026': 'apertura', 'URTF ZONA COMPETENCIA - CLAUSURA 2026': 'clausura',
  'Torneo Austral 2026 (Primera División)': 'austral', 'CORDILLERANO 2026': 'cordillerano', 'OFICIAL MAYORES 2026': 'mayores',
  'PRIMERA B 2026': 'primerab', 'Torneo Norpatagónico 2026 - Primera': 'norpat',
};
const claves = Object.keys(CLUB_POR_NOMBRE).sort((a, b) => b.length - a.length);
const idDe = (n) => {
  const k = claves.find((c) => n.trim() === c || n.trim().startsWith(`${c} - `));
  if (!k) throw new Error(`club sin mapear ${n}`);
  return CLUB_POR_NOMBRE[k];
};

const todas = JSON.parse(fs.readFileSync(src, 'utf8'));
const porNumero = new Map();
for (const c of todas) {
  const p = porNumero.get(c.numero);
  if (!p || JSON.stringify(c).length > JSON.stringify(p).length) porNumero.set(c.numero, c);
}
const out = [];
for (const c of [...porNumero.values()]) {
  const key = KEYS[TORNEO_CORREGIDO[c.numero] || c.torneo];
  if (!key) throw new Error(`torneo sin clave ${c.torneo}`);
  const [l, v] = c.lados;
  const pts = (x) => (x.pts === null ? '-' : `${x.pts} [${x.bonus}]`);
  out.push([
    `Torneo : ${key}`, `Partido número: ${c.numero}`, `Fecha de juego: ${c.jugado}`, `Referee: ${c.referee}`, c.estado || 'Cerrado',
    pts(l), idDe(l.nombre), 'CONFIRMADO', '-', pts(v), idDe(v.nombre), 'CONFIRMADO',
    c.inc.L, c.inc.V ? `Incidencias VISITANTE${c.inc.V.replace(/^Incidencias VISITANTE/, '')}` : '',
    c.ros.L, c.ros.V, '',
  ].join('\n'));
}
fs.writeFileSync(dst, out.join('\n'), 'utf8');
console.log(out.length, 'tarjetas');
