// Reconstruye partidos y marcadores de los torneos de MAYORES de la URT a partir
// de las tablas sucesivas de los boletines (parsed.json) y de su programación.
// Adaptación de scripts/urt-juveniles/fuente/deduce.mjs (que solo conoce M15-M19).
// Salida: deduced.json { competencias: [{ clave, snapshots, partidos }], sinUbicar }
import fs from 'node:fs';

const { bulletins } = JSON.parse(fs.readFileSync('parsed.json', 'utf8'));

const sinTilde = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpio = (s) => sinTilde(s).replace(/["']/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

import { claveEquipo } from './equipos.mjs';

// ── Competencias ─────────────────────────────────────────────────────────────
const DIV = (s) => (/PREINTERMEDIA/.test(s) ? 'PREINTERMEDIA' : /INTERMEDIA/.test(s) ? 'INTERMEDIA' : /PRIMERA/.test(s) ? 'PRIMERA' : /M-?23/.test(s) ? 'M23' : null);

function compDeTitulo(titulo) {
  const t = limpio(titulo);
  let m;
  if ((m = t.match(/ANUAL TUCUMANO B - (.+?) - ZONA (\S+)$/))) return { torneo: 'TUCUMANO B', div: DIV(m[1]), zona: { 1: 'A', 2: 'B' }[m[2]] || m[2] };
  if ((m = t.match(/ANUAL TUCUMANO - (.+)$/))) return { torneo: 'TUCUMANO A', div: DIV(m[1]), zona: null };
  if ((m = t.match(/REGIONAL ([ABC]) - (.+?)(?: - ZONA (\S+))?$/))) return { torneo: `REGIONAL ${m[1]}`, div: DIV(m[2]), zona: m[3] || null };
  if ((m = t.match(/ANUAL DESARROLLO - (.+?) - ZONA (\S+)$/))) return { torneo: 'DESARROLLO', div: DIV(m[1]), zona: m[2] };
  if ((m = t.match(/CLAUSURA DESARROLLO - (.+?) - ZONA (\S+)$/))) return { torneo: 'CLAUSURA DESARROLLO', div: DIV(m[1]), zona: m[2] };
  if (/^TORNEO ANUAL - PREINTERMEDIA/.test(t)) return { torneo: 'ANUAL PREINTERMEDIA', div: 'PREINTERMEDIA', zona: null };
  if (/INICIACION - PREINTERMEDIA/.test(t)) return { torneo: 'INICIACION PREINTERMEDIA', div: 'PREINTERMEDIA', zona: null };
  if (/BI UNIONES/.test(t)) return { torneo: 'BI UNIONES', div: 'PREINTERMEDIA', zona: null };
  if (/M-?23/.test(t)) return { torneo: 'M23', div: 'M23', zona: null };
  return null;
}
function compDePrograma(p) {
  const t = limpio(p.torneo); const div = DIV(limpio(p.division));
  if (!div) return null;
  let m;
  if ((m = t.match(/TUCUMANO B - ZONA (\S+)/))) return { torneo: 'TUCUMANO B', div, zona: m[1] };
  if (/TUCUMANO A/.test(t)) return { torneo: 'TUCUMANO A', div, zona: null };
  if ((m = t.match(/REGIONAL ([ABC])(?: - ZONA (\S+))?/))) return { torneo: `REGIONAL ${m[1]}`, div, zona: m[2] || null };
  if ((m = t.match(/ANUAL DESARROLLO ([AB])/))) return { torneo: 'DESARROLLO', div, zona: m[1] };
  if ((m = t.match(/CLAUSURA DESARROLLO - ZONA (\S+)/))) return { torneo: 'CLAUSURA DESARROLLO', div, zona: m[1] };
  if (/ANUAL PREINTERMEDIA/.test(t)) return { torneo: 'ANUAL PREINTERMEDIA', div, zona: null };
  if (/^TORNEO INICIACION$/.test(t) && div === 'PREINTERMEDIA') return { torneo: 'INICIACION PREINTERMEDIA', div, zona: null };
  if (/BI UNIONES/.test(t)) return { torneo: 'BI UNIONES', div, zona: null };
  if (/TORNEO M-?23/.test(t)) return { torneo: 'M23', div: 'M23', zona: null };
  return null;
}
const claveComp = (c) => [c.torneo, c.div, c.zona || '-'].join('|');

const comps = new Map();
const comp = (c) => {
  const k = claveComp(c);
  if (!comps.has(k)) comps.set(k, { clave: k, torneo: c.torneo, div: c.div, zona: c.zona, snapshots: [], fixtures: [] });
  return comps.get(k);
};
for (const b of bulletins) {
  for (const t of b.tables) {
    if (!t.filas?.length) continue;
    const c = compDeTitulo(t.titulo);
    if (!c) { console.log('tabla sin comp:', t.titulo); continue; }
    comp(c).snapshots.push({ boletin: b.n, fecha: b.date, filas: t.filas.filter((f) => !f._invalida) });
  }
}

/** Equipo de la competencia que corresponde a un nombre de la programación. */
function equipoEn(c, nombre) {
  const k = claveEquipo(nombre);
  if (!k.club || k.club === 'LIBRE') return null;
  const nombres = [...new Set(c.snapshots.flatMap((s) => s.filas.map((f) => f.equipo)))];
  const cand = nombres.filter((n) => claveEquipo(n).club === k.club);
  if (!cand.length) return undefined;
  if (cand.length === 1) return cand[0];
  const lab = (n) => claveEquipo(n).label;
  if (k.label) {
    const igual = cand.filter((n) => lab(n) === k.label);
    if (igual.length === 1) return igual[0];
    if (k.label === 'A') { const sin = cand.filter((n) => !lab(n)); if (sin.length === 1) return sin[0]; }
    return undefined;
  }
  // Sin letra en la programación: en Intermedia es el "B"; en el resto, el sin letra.
  if (c.div === 'INTERMEDIA') { const b = cand.filter((n) => lab(n) === 'B'); if (b.length === 1) return b[0]; }
  const sin = cand.filter((n) => !lab(n)); if (sin.length === 1) return sin[0];
  const a = cand.filter((n) => lab(n) === 'A'); if (a.length === 1) return a[0];
  return undefined;
}

const sinUbicar = [];
for (const b of bulletins) {
  for (const p of b.programs) {
    const base = compDePrograma(p);
    if (!base) continue;
    const c = comps.get(claveComp(base));
    for (const m of p.partidos) {
      const kl = claveEquipo(m.local); const kv = claveEquipo(m.visitante);
      if (kl.club === 'LIBRE' || kv.club === 'LIBRE') continue;
      if (!kl.club || !kv.club) continue;
      if (!c) { sinUbicar.push({ boletin: b.n, ...base, local: m.local, visitante: m.visitante, motivo: 'sin tablas' }); continue; }
      const l = equipoEn(c, m.local); const v = equipoEn(c, m.visitante);
      if (!l || !v || l === v) { sinUbicar.push({ boletin: b.n, ...base, local: m.local, visitante: m.visitante }); continue; }
      const etapa = p.fecha ? `Fecha ${p.fecha}` : (/SEMI/i.test(p.etiqueta) ? 'Semifinal' : /FINAL/i.test(p.etiqueta) ? 'Final' : p.etiqueta || 'Fecha ?');
      const wo = kl.gp || kv.pp ? 'local' : kv.gp || kl.pp ? 'visitante' : null;
      c.fixtures.push({
        boletin: b.n, etapa, fecha: p.fecha, local: l, visitante: v,
        dia: m.dia, hora: m.hora, cancha: m.cancha, wo, postergado: /POSTERG|SUSPEND/i.test(m.resto), resto: m.resto,
      });
    }
  }
}

// ── Deducción (idéntica a la de juveniles) ───────────────────────────────────
const DELTA = ['pj', 'pg', 'pe', 'pp', 'tf', 'tc', 'tryF', 'tryC', 'pts'];
for (const c of comps.values()) {
  c.snapshots.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porClave = new Map();
  for (const f of c.fixtures.sort((a, b) => a.boletin - b.boletin)) {
    const k = [f.local, f.visitante, f.etapa].join('|');
    const k2 = [f.visitante, f.local, f.etapa].join('|');
    const prev = porClave.get(k) || porClave.get(k2);
    if (prev) Object.assign(prev, { ...f, local: prev.local, visitante: prev.visitante, veces: prev.veces + 1, primerBoletin: prev.primerBoletin });
    else porClave.set(k, { ...f, veces: 1, primerBoletin: f.boletin });
  }
  const partidos = [...porClave.values()];
  for (const p of partidos) p.estado = 'programado';
  const cero = Object.fromEntries(DELTA.map((k) => [k, 0]));
  const val = (snap, eq) => snap?.filas.find((f) => f.equipo === eq) || cero;

  for (let i = 0; i < c.snapshots.length; i++) {
    const prev = i ? c.snapshots[i - 1] : null; const cur = c.snapshots[i];
    const equipos = cur.filas.map((f) => f.equipo);
    const d = new Map(equipos.map((e) => {
      const a = val(prev, e); const b = val(cur, e);
      return [e, Object.fromEntries(DELTA.map((k) => [k, (b[k] || 0) - (a[k] || 0)]))];
    }));
    const cand = partidos.filter((p) => p.estado === 'programado' && p.primerBoletin < cur.boletin && d.has(p.local) && d.has(p.visitante));
    const resta = new Map(equipos.map((e) => [e, d.get(e).pj]));
    const elegidos = []; const pend = new Set(cand);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const p of [...pend]) {
        if (resta.get(p.local) <= 0 || resta.get(p.visitante) <= 0) { pend.delete(p); cambio = true; continue; }
        const ocl = [...pend].filter((q) => q.local === p.local || q.visitante === p.local).length;
        const ocv = [...pend].filter((q) => q.local === p.visitante || q.visitante === p.visitante).length;
        if (ocl <= resta.get(p.local) || ocv <= resta.get(p.visitante)) {
          elegidos.push(p); pend.delete(p);
          resta.set(p.local, resta.get(p.local) - 1); resta.set(p.visitante, resta.get(p.visitante) - 1);
          cambio = true;
        }
      }
    }
    for (const p of elegidos) { p.estado = 'jugado'; p.ventana = { desde: prev?.boletin ?? null, hasta: cur.boletin, fecha: cur.fecha }; }
    const sobra = [...resta].filter(([, x]) => x !== 0);
    if (sobra.length) (c.avisos ||= []).push({ boletin: cur.boletin, pjSinPartido: sobra.map(([e, x]) => `${e}: ${x}`) });

    const resto = new Map(equipos.map((e) => [e, { ...d.get(e) }]));
    const abiertos = new Set(elegidos);
    let avanzo = true;
    while (avanzo && abiertos.size) {
      avanzo = false;
      for (const p of [...abiertos]) {
        let hecho = false;
        for (const [yo, otro, lado] of [[p.local, p.visitante, 'local'], [p.visitante, p.local, 'visitante']]) {
          const mios = [...abiertos].filter((q) => q.local === yo || q.visitante === yo);
          if (mios.length !== 1) continue;
          const r = resto.get(yo);
          const hs = lado === 'local' ? r.tf : r.tc; const as = lado === 'local' ? r.tc : r.tf;
          const ht = lado === 'local' ? r.tryF : r.tryC; const at = lado === 'local' ? r.tryC : r.tryF;
          const delOtro = [...abiertos].filter((q) => q.local === otro || q.visitante === otro);
          if (delOtro.length === 1) {
            const ro = resto.get(otro);
            if (ro.tf !== r.tc || ro.tc !== r.tf) p.inconsistente = `${yo} ${r.tf}-${r.tc} / ${otro} ${ro.tf}-${ro.tc}`;
          }
          Object.assign(p, { hs, as, htries: ht, atries: at });
          if (lado === 'local') p.hp = r.pts; else p.ap = r.pts;
          if (delOtro.length === 1) { const ro = resto.get(otro); if (lado === 'local') p.ap = ro.pts; else p.hp = ro.pts; }
          if (hs === 0 && as === 0 && (r.pg || r.pp)) p.wo = p.wo || ((lado === 'local') === Boolean(r.pg) ? 'local' : 'visitante');
          for (const [e, esLocal] of [[p.local, true], [p.visitante, false]]) {
            const x = resto.get(e);
            x.tf -= esLocal ? hs : as; x.tc -= esLocal ? as : hs;
            x.tryF -= esLocal ? ht : at; x.tryC -= esLocal ? at : ht;
            const pm = esLocal ? p.hp : p.ap; if (Number.isInteger(pm)) x.pts -= pm; else x.ptsDudoso = true;
          }
          abiertos.delete(p); avanzo = true; hecho = true; break;
        }
        if (hecho) continue;
      }
    }
    for (const p of abiertos) p.sinMarcador = true;
  }
  c.partidos = partidos;
  delete c.fixtures;
}

// ── Limpieza final ───────────────────────────────────────────────────────────
const out = [...comps.values()];
for (const c of out) for (const p of c.partidos) {
  if (p.estado !== 'jugado' || p.sinMarcador) continue;
  const wo = (p.hs === 21 && p.as === 0) || (p.hs === 0 && p.as === 21);
  if (wo && (p.htries <= 0 || p.atries < 0 || p.atries <= 0 && p.htries < 0)) {
    p.wo = p.hs > p.as ? 'local' : 'visitante'; p.htries = null; p.atries = null; continue;
  }
  if (p.inconsistente) { p.sinMarcador = true; p.motivo = `inconsistente: ${p.inconsistente}`; continue; }
  if (p.hs < 0 || p.as < 0) { p.sinMarcador = true; p.motivo = 'negativo'; continue; }
  if (p.htries < 0 || p.atries < 0 || p.hs < 5 * p.htries || p.as < 5 * p.atries) { p.htries = null; p.atries = null; }
}
fs.writeFileSync('deduced.json', JSON.stringify({ competencias: out, sinUbicar }, null, 1));
const resumen = out.map((c) => {
  const j = c.partidos.filter((p) => p.estado === 'jugado');
  return {
    comp: c.clave, snaps: c.snapshots.length, equipos: c.snapshots.at(-1)?.filas.length ?? 0, partidos: c.partidos.length,
    jugados: j.length, conMarc: j.filter((p) => !p.sinMarcador).length, sinMarc: j.filter((p) => p.sinMarcador).length,
    prog: c.partidos.filter((p) => p.estado === 'programado').length, avisos: c.avisos?.length ?? 0,
  };
});
console.table(resumen);
console.log('sinUbicar', sinUbicar.length);
