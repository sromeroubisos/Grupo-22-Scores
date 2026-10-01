// Reconstruye partidos y marcadores de los juveniles de la URT a partir de las
// tablas sucesivas de los boletines (parsed.json) y de su programación.
// Salida: deduced.json { competencias: [{ clave, snapshots, partidos }], sinUbicar }
import fs from 'node:fs';

const { bulletins } = JSON.parse(fs.readFileSync('parsed.json', 'utf8'));

// ── Nombres ──────────────────────────────────────────────────────────────────
const sinTilde = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export function claveEquipo(nombre) {
  const s = sinTilde(nombre).toLowerCase().replace(/\((gp|pp)\)/g, '').replace(/[|]/g, ' ').trim();
  const b = /"\s*b\s*"|\bb"|\s"b"$|"(azul|verde|negro) b"|"verde" b$|negro\s*"b"|"negro "b"/.test(s);
  const color = (s.match(/\b(verde|negro|azul|blanco|gris)\b/) || [])[1] || '';
  let club = null;
  if (/aguara/.test(s)) club = 'AGUARA';
  else if (/cardenales/.test(s)) club = 'CARDENALES';
  else if (/coipu/.test(s)) club = 'COIPU';
  else if (/huirapuca/.test(s)) club = 'HUIRAPUCA';
  else if (/jockey/.test(s)) club = 'JOCKEY';
  else if (/querencia/.test(s)) club = 'QUERENCIA';
  else if (/lince/.test(s)) club = 'LINCE';
  else if (/liceo/.test(s)) club = 'LICEO';
  else if (/tarcos/.test(s)) club = 'TARCOS';
  else if (/nat(acion|\.)/.test(s)) club = 'NATACION';
  else if (/san martin/.test(s)) club = 'SANMARTIN';
  else if (/l\.\s*t\.|l\.\s*tennis|lawn|l\.tennis/.test(s)) club = 'LAWN';
  else if (/t\.\s*rug|tuc[,.]?\s*r(ugby|\.)|tucuman rugby/.test(s)) club = 'TRUGBY';
  else if (/^uni|universitario/.test(s)) club = 'UNI';
  else if (/^libre/.test(s)) club = 'LIBRE';
  return { club, color, b, gp: /\(gp\)/i.test(nombre), pp: /\(pp\)/i.test(nombre) };
}

// ── Competencias ─────────────────────────────────────────────────────────────
const claveComp = (t) => [t.div, t.torneo, t.zona, t.copa || '-', t.grupo || '-'].join('|');

function compDePrograma(p) {
  const s = sinTilde(p.torneo).toUpperCase();
  const torneo = /INICIACION/.test(s) ? 'INICIACION' : /ANUAL/.test(s) ? 'ANUAL' : null;
  if (!torneo) return null;
  const zona = /RESERVA/.test(s) ? 'RESERVA' : 'CAMPEONATO';
  const copa = /SEGUNDA RONDA/.test(s) ? ((s.match(/\b(ORO|PLATA)\b/) || [])[1] || null) : null;
  const grupo = (s.match(/ZONA "([AB])"/) || [])[1] || null;
  return { div: p.div, torneo, zona, copa, grupo };
}

const comps = new Map();
const comp = (c) => {
  const k = claveComp(c);
  if (!comps.has(k)) comps.set(k, { clave: k, div: c.div, torneo: c.torneo, zona: c.zona, copa: c.copa, grupo: c.grupo, snapshots: [], fixtures: [] });
  return comps.get(k);
};

for (const b of bulletins) {
  for (const t of b.tables) {
    if (!t.filas?.length) continue;
    comp(t).snapshots.push({ boletin: b.n, fecha: b.date, filas: t.filas });
  }
}

// Equipo de una competencia que corresponde a un nombre de la programación.
function equipoEn(c, nombre) {
  const k = claveEquipo(nombre);
  if (k.club === 'LIBRE' || !k.club) return null;
  const nombres = [...new Set(c.snapshots.flatMap((s) => s.filas.map((f) => f.equipo)))];
  const cand = nombres.filter((n) => { const kk = claveEquipo(n); return kk.club === k.club && (c.zona === 'RESERVA' || !kk.b); });
  if (!cand.length) return undefined;
  const conColor = cand.filter((n) => claveEquipo(n).color === k.color);
  if (conColor.length === 1) return conColor[0];
  if (cand.length === 1) return cand[0];
  if (!k.color) { const sin = cand.filter((n) => !claveEquipo(n).color); if (sin.length === 1) return sin[0]; }
  return undefined;
}

// Programación → partido de la competencia. Si el programa no dice zona (A/B),
// va a la que tenga a los dos equipos.
const sinUbicar = [];
for (const b of bulletins) {
  for (const p of b.programs) {
    const base = compDePrograma(p);
    if (!base) continue;
    for (const m of p.partidos) {
      const kl = claveEquipo(m.local); const kv = claveEquipo(m.visitante);
      if (kl.club === 'LIBRE' || kv.club === 'LIBRE') continue;
      const candidatos = [...comps.values()].filter((c) => c.div === base.div && c.torneo === base.torneo && c.zona === base.zona
        && (base.copa ? c.copa === base.copa : !c.copa) && (!base.grupo || c.grupo === base.grupo));
      let ubicada = null;
      for (const c of candidatos) {
        const l = equipoEn(c, m.local); const v = equipoEn(c, m.visitante);
        if (l && v && l !== v) { ubicada = { c, l, v }; break; }
      }
      if (!ubicada) { sinUbicar.push({ boletin: b.n, ...base, local: m.local, visitante: m.visitante }); continue; }
      const etapa = p.fecha ? `Fecha ${p.fecha}` : (/SEMI/i.test(p.etiqueta) ? 'Semifinal' : /FINAL/i.test(p.etiqueta) ? 'Final' : p.etiqueta);
      const wo = kl.gp || kv.pp ? 'local' : kv.gp || kl.pp ? 'visitante' : null;
      ubicada.c.fixtures.push({
        boletin: b.n, etapa, fecha: p.fecha, local: ubicada.l, visitante: ubicada.v,
        dia: m.dia, hora: m.hora, cancha: m.cancha, wo, postergado: /POSTERG|SUSPEND/i.test(m.resto), resto: m.resto,
      });
    }
  }
}

// ── Deducción ────────────────────────────────────────────────────────────────
// Un partido = el par (local, visitante, etapa). La programación repite los
// postergados en boletines siguientes: queda la ÚLTIMA versión (día y cancha
// reales). Se da por jugado en la primera ventana entre dos tablas en que los
// dos equipos suman PJ.
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
    // Candidatos: todavía no jugados y programados en un boletín anterior a esta tabla.
    const cand = partidos.filter((p) => p.estado === 'programado' && p.primerBoletin < cur.boletin
      && d.has(p.local) && d.has(p.visitante));
    const resta = new Map(equipos.map((e) => [e, d.get(e).pj]));
    const elegidos = [];
    const pend = new Set(cand);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const p of [...pend]) {
        if (resta.get(p.local) <= 0 || resta.get(p.visitante) <= 0) { pend.delete(p); cambio = true; continue; }
        const ocl = [...pend].filter((q) => q.local === p.local || q.visitante === p.local).length;
        const ocv = [...pend].filter((q) => q.local === p.visitante || q.visitante === p.visitante).length;
        // Si un equipo tiene tantos candidatos como PJ nuevos, todos se jugaron.
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

    // Marcadores por propagación.
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
          // Puntos de tabla del partido: los del equipo que jugó sólo éste.
          if (lado === 'local') p.hp = r.pts; else p.ap = r.pts;
          if (delOtro.length === 1) { const ro = resto.get(otro); if (lado === 'local') p.ap = ro.pts; else p.hp = ro.pts; }
          // W.O.: sumó PJ y resultado sin tantos.
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

const out = [...comps.values()];
fs.writeFileSync('deduced.json', JSON.stringify({ competencias: out, sinUbicar }, null, 1));
let tot = 0, jug = 0, conM = 0, sinM = 0, inc = 0, prog = 0;
for (const c of out) for (const p of c.partidos) {
  tot++; if (p.estado === 'jugado') { jug++; if (p.sinMarcador) sinM++; else conM++; if (p.inconsistente) inc++; } else prog++;
}
console.log({ competencias: out.length, partidos: tot, jugados: jug, conMarcador: conM, sinMarcador: sinM, inconsistentes: inc, programados: prog, sinUbicar: sinUbicar.length });

// ── Limpieza final ───────────────────────────────────────────────────────────
// W.O.: la URT lo computa 21-0 y sin tries. Inconsistente: el marcador no se
// sostiene (en la ventana hubo otro partido que no está en la programación).
// Tries que no cierran con los puntos: se descartan los tries, no el marcador.
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
let fin = { conMarcador: 0, sinMarcador: 0, wo: 0, conTries: 0 };
for (const c of out) for (const p of c.partidos) if (p.estado === 'jugado') {
  if (p.sinMarcador) fin.sinMarcador++; else { fin.conMarcador++; if (p.wo) fin.wo++; if (p.htries != null) fin.conTries++; }
}
console.log('final', fin);
