// deduced.json → extract/2026.json en el formato que lee seed.mjs.
// Corre desde la raíz del repo, con parsed.json y deduced.json en la carpeta que
// se le pasa:
//   node scripts/urt-adultos/fuente/build.mjs <carpeta con parsed.json y deduced.json>
import fs from 'node:fs';
import path from 'node:path';

import { claveEquipo } from './equipos.mjs';
import { faseDeCompetencia, torneoDeCompetencia } from '../datos.mjs';

const dir = process.argv[2] || '.';
const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'parsed.json'), 'utf8'));
const { competencias } = JSON.parse(fs.readFileSync(path.join(dir, 'deduced.json'), 'utf8'));
const fechaBoletin = new Map(parsed.bulletins.map((b) => [b.n, b.date]));

const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const alias = (equipo) => { const k = claveEquipo(equipo); return `${k.club}|${k.label}`; };

const phases = []; const matches = []; const standings = []; const avisos = [];
for (const c of competencias) {
  const division = torneoDeCompetencia(c);
  if (!division) continue;
  const fase = faseDeCompetencia(c);
  const ultima = c.snapshots.at(-1);
  phases.push({ division, phase: fase, group: null, teams: ultima.filas.map((f) => alias(f.equipo)) });
  standings.push({
    division, phase: fase, boletin: ultima.boletin, fecha: ultima.fecha,
    rows: ultima.filas.map((f) => ({ club: alias(f.equipo), ...f })),
  });
  for (const p of c.partidos) {
    const base = { division, phase: fase, group: null, home: alias(p.local), away: alias(p.visitante) };
    if (Number.isInteger(p.fecha)) base.round = p.fecha;
    const cierre = p.dia || (p.ventana?.fecha ? sumarDias(p.ventana.fecha, -3) : sumarDias(fechaBoletin.get(p.primerBoletin) ?? ultima.fecha, 4));
    const m = { ...base, date: cierre, time: p.hora || null };
    if (p.estado === 'jugado' && !p.sinMarcador) {
      if (p.wo) matches.push({ ...m, status: 'walkover', note: `Ganó ${p.wo}`, hp: p.hp, ap: p.ap });
      else matches.push({ ...m, status: 'final', hs: p.hs, as: p.as, hp: p.hp, ap: p.ap });
    } else if (p.estado === 'jugado') {
      matches.push({ ...m, status: 'scheduled', note: 'Se jugó (suma partido en la tabla del boletín) pero el marcador no se pudo separar de otro partido de la misma ventana' });
      avisos.push(`${division} ${fase} ${p.etapa}: ${p.local} vs ${p.visitante}`);
    } else {
      matches.push({ ...m, status: p.postergado ? 'postponed' : 'scheduled', note: p.cancha || null });
    }
  }
}
const salida = { year: 2026, format: 'Boletines semanales de la URT', phases, matches, champions: [], standings };
fs.mkdirSync(path.join('scripts', 'urt-adultos', 'extract'), { recursive: true });
fs.writeFileSync(path.join('scripts', 'urt-adultos', 'extract', '2026.json'), JSON.stringify(salida, null, 1));
const porDiv = {};
for (const m of matches) {
  const k = m.division; porDiv[k] ||= { final: 0, wo: 0, programado: 0, sinMarc: 0 };
  porDiv[k][m.status === 'final' ? 'final' : m.status === 'walkover' ? 'wo' : /Se jugó/.test(m.note || '') ? 'sinMarc' : 'programado']++;
}
console.table(porDiv);
console.log({ torneos: new Set(phases.map((p) => p.division)).size, fases: phases.length, partidos: matches.length, sinMarcador: avisos.length });
