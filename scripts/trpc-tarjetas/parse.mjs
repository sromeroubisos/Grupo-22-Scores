// Torneo TRPC 2026.json (captura de tarjetas UAR) -> partidos.json estructurado.
import fs from 'node:fs';
const src = process.argv[2], dst = process.argv[3];
const j = JSON.parse(fs.readFileSync(src, 'utf8'));
const c = j.paginas[0].contenido;
const out = []; let torneo = null, cur = null;
for (let i = 0; i < c.length; i++) {
  const x = c[i];
  if (x.tipo === 'campos') {
    const k = x.campos;
    const tk = Object.keys(k).find(z => /Torneo$/.test(z));
    if (tk) torneo = k[tk];
    if (k['Partido número']) {
      cur = { torneo, ronda: k.Ronda, fecha: k.Fecha || k.Ronda, numero: k['Partido número'], jugado: k['Fecha de juego'], referee: k.Referee || '', lugar: k.Lugar || '',
        estado: '', lados: [], inc: {L: '', V: '', P: ''}, ros: {L: '', V: ''}, dt: {} };
      out.push(cur);
    } else if (cur && k['Entrenador LOCAL'] !== undefined) cur.dt.L = k['Entrenador LOCAL'];
    else if (cur && k['Entrenador VISITANTE'] !== undefined) cur.dt.V = k['Entrenador VISITANTE'];
    continue;
  }
  if (!cur) continue;
  const t = x.texto;
  if (/^(Cerrado|Iniciado|Abierto|Pendiente|Suspendido)$/.test(t.trim())) { cur.estado = t.trim(); continue; }
  const m = t.match(/(?:^|\n)(-|\d+)(?: \[(\d+)\])?\n([^\n]+)\n(CONFIRMADO|A DEFINIR|SIN CONFIRMAR)/);
  if (m && cur.lados.length < 2) { cur.lados.push({ pts: m[1] === '-' ? null : +m[1], bonus: m[2] ? +m[2] : 0, nombre: m[3].trim(), conf: m[4] }); continue; }
  if (t.startsWith('Incidencias LOCAL')) {
    const [a, b] = t.split('Incidencias VISITANTE'); cur.inc.L = a; cur.inc.V = b || '';
    const p = (cur.inc.V || '').split('Incidencias PARTIDO'); cur.inc.V = p[0]; cur.inc.P = p[1] || ''; continue; }
  if (t.startsWith('Incidencias VISITANTE')) { cur.inc.V = t; continue; }
  if (t.startsWith('Miembros del equipo LOCAL')) { cur.ros.L = t; continue; }
  if (t.startsWith('Miembros del equipo VISITANTE')) { cur.ros.V = t; continue; }
}
fs.writeFileSync(dst, JSON.stringify(out, null, 1));
const por = {};
out.forEach(m => { const k = m.torneo; por[k] = por[k] || { n: 0, sinLados: 0, cerrado: 0, conInc: 0, conRos: 0 }; por[k].n++; if (m.lados.length < 2) por[k].sinLados++; if (m.estado === 'Cerrado') por[k].cerrado++; if (/Try|Penal|Conv/.test(m.inc.L + m.inc.V)) por[k].conInc++; if (/\t/.test(m.ros.L)) por[k].conRos++; });
console.table(por);
