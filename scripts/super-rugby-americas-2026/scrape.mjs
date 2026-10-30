// Super Rugby Americas 2026: partidos + formaciones + eventos + stats por jugador
// desde regisar.sudamerica.rugby/embed
import { writeFileSync } from 'node:fs';
const BASE = 'https://regisar.sudamerica.rugby';
const OUT = process.argv[2];

const get = async (p) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + p, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (r.ok) return r.text();
    await new Promise((s) => setTimeout(s, 800));
  }
  throw new Error('fetch ' + p);
};
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const toLines = (h) =>
  dec(h.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '\n'))
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// 1) ids de partidos
const ids = [];
for (let page = 1; page < 30; page++) {
  const h = await get('/embed/partidos?page=' + page);
  const found = [...h.matchAll(/embed\/partidos\/(\d+)"/g)].map((m) => +m[1]);
  const nuevos = found.filter((x) => !ids.includes(x));
  if (!nuevos.length) break;
  ids.push(...new Set(nuevos));
}
ids.sort((a, b) => a - b);
console.error('partidos:', ids.length);

const tipos = new Map();
const matches = [];
const formaciones = [];
const eventos = [];
const staffs = [];
const players = new Map();

for (const id of ids) {
  const h = await get('/embed/partidos/' + id);
  const L = toLines(h);
  const at = (label) => { const i = L.indexOf(label); return i < 0 ? '' : L[i + 1]; };
  const iHead = L.findIndex((x) => /^PARTIDO #/.test(x));
  const iLoc = L.findIndex((x) => x === 'LOCAL');
  const iVis = L.findIndex((x) => x === 'VISITANTE');
  const m = {
    id,
    ronda: L[iHead + 1], estado: L[iHead + 2],
    fecha: at('Fecha:'), hora: at('Hora:'), lugar: at('Lugar:'), arbitro: at('Árbitro:'),
    ayudante1: at('Ayudante 1:'), ayudante2: at('Ayudante 2:'), tmo: at('TMO:'),
    oficialJudicial: at('Oficial Judicial:'), comisionado: at('Match Commissioner:'),
    local: L[iLoc - 1], visitante: L[iVis - 1],
  };
  const sc = L.find((x) => /^\d+\s*-\s*\d+/.test(x));
  const mm = sc?.match(/^(\d+)\s*-\s*(\d+)/);
  m.ptsLocal = mm ? +mm[1] : null; m.ptsVisit = mm ? +mm[2] : null; m.marcadorTxt = sc;

  const teams = { LOCAL: m.local, VISITANTE: m.visitante };
  const roster = { LOCAL: new Map(), VISITANTE: new Map() };
  const tit = { LOCAL: new Set(), VISITANTE: new Set() };
  let side = null, grupo = null;
  const iForm = L.indexOf('Formaciones');
  const iInc = L.lastIndexOf('Incidencias');
  const iEv = L.findIndex((x, k) => k > iInc && /^(1T|2T|ET|1ET|2ET)/.test(x));
  const formEnd = iEv < 0 ? L.length : iEv;
  for (let k = iForm; k < formEnd; k++) {
    const x = L[k];
    if (x === 'LOCAL' || x === 'VISITANTE') { side = x; grupo = null; continue; }
    if (x === 'Jugadores Titulares') { grupo = 'T'; continue; }
    if (x === 'Jugadores Suplentes') { grupo = 'S'; continue; }
    if (x === 'Staff') { grupo = 'F'; continue; }
    if (side && grupo === 'F') {
      // staff: "Nombre" luego "Rol" (Head coach / Médico principal / Team Manager)
      if (/^(Head coach|Médico principal|Team Manager)/i.test(L[k + 1] || '') && !/^(Head coach|Médico principal|Team Manager)/i.test(x))
        staffs.push({ partido: id, equipo: teams[side], rol: L[k + 1], nombre: x });
      continue;
    }
    if (side && grupo && /^\d{1,2}$/.test(x) && L[k + 1] && !/^\d+$/.test(L[k + 1])) {
      const n = +x; const name = L[k + 1];
      const r = { n, name, titular: grupo === 'T', capitan: L[k + 2] === 'CAPITÁN' };
      roster[side].set(n, r);
      if (grupo === 'T') tit[side].add(n);
      formaciones.push({ partido: id, equipo: teams[side], lado: side, numero: n, jugador: name, titular: r.titular ? 1 : 0, capitan: r.capitan ? 1 : 0 });
    }
  }

  const evs = [];
  let half = null;
  for (let k = iInc + 1; k < L.length; k++) {
    const x = L[k];
    if (/^(1T|2T|ET|1ET|2ET)$/.test(x)) { half = x; continue; }
    if ((x === 'LOCAL' || x === 'VISITANTE') && half && /^\d+(\+\d+)?'$/.test(L[k + 1] || '')) {
      const e = { side: x, half, min: L[k + 1].replace("'", ''), tipo: L[k + 2] };
      let j = k + 3;
      if (/^\+\d+$/.test(L[j] || '')) { e.pts = +L[j].slice(1); j++; }
      const pm = (L[j] || '').match(/^#(\d+)(?:\s+(.*))?$/);
      if (pm) {
        e.n = +pm[1]; j++;
        if (pm[2]) e.name = pm[2];
        else if (L[j] && !/^(LOCAL|VISITANTE|1T|2T|ET|1ET|2ET)$/.test(L[j])) { e.name = L[j]; j++; }
      }
      // texto libre extra (motivo/observación) hasta el próximo evento
      const extra = [];
      while (j < L.length && !/^(LOCAL|VISITANTE|1T|2T|ET|1ET|2ET)$/.test(L[j]) && extra.length < 3) { extra.push(L[j]); j++; }
      e.extra = extra.join(' | ');
      evs.push(e);
    }
  }
  const abs = (e) => {
    const [a, b = 0] = e.min.split('+').map(Number);
    // el 2T normalmente viene 1..40; algunos partidos lo cargan corrido (41..80)
    const base = e.half === '1T' ? 0 : e.half === '2T' ? (a > 40 ? 0 : 40) : 80;
    return base + a + b;
  };
  const fin = Math.max(80, ...evs.map(abs));
  for (const e of evs)
    eventos.push({ partido: id, equipo: teams[e.side], lado: e.side, tiempo: e.half, minuto: e.min, tipo: e.tipo, puntos: e.pts ?? '', numero: e.n ?? '', jugador: e.name ?? '', extra: e.extra });

  const P = (side, n, name) => {
    const nm = roster[side].get(n)?.name ?? name;
    const key = teams[side] + '|' + nm;
    if (!players.has(key)) players.set(key, { equipo: teams[side], jugador: nm, pj: 0, titular: 0, min: 0, tries: 0, conv: 0, convFallidas: 0, penales: 0, penFallidos: 0, drops: 0, puntos: 0, amarillas: 0, rojas: 0 });
    return players.get(key);
  };
  const on = { LOCAL: new Map(), VISITANTE: new Map() };
  const acc = { LOCAL: new Map(), VISITANTE: new Map() };
  const played = { LOCAL: new Set(), VISITANTE: new Set() };
  for (const s of ['LOCAL', 'VISITANTE']) for (const n of tit[s]) { on[s].set(n, 0); played[s].add(n); }

  const sumPts = { LOCAL: 0, VISITANTE: 0 };
  for (const e of evs) {
    tipos.set(e.tipo, (tipos.get(e.tipo) || 0) + 1);
    const t = (e.tipo || '').toLowerCase();
    const t0 = abs(e);
    if (e.pts) sumPts[e.side] += e.pts; // incluye try penal (sin jugador)
    const salida = t === 'egresa' || t === 'se retira' || t === 'amarilla' || t === 'segunda amarilla' || t === 'roja' || t.startsWith('tarjeta roja');
    if (salida && e.n != null) {
      if (on[e.side].has(e.n)) { acc[e.side].set(e.n, (acc[e.side].get(e.n) || 0) + t0 - on[e.side].get(e.n)); on[e.side].delete(e.n); }
    }
    if ((t === 'ingresa' || t.startsWith('reingres')) && e.n != null) {
      if (!on[e.side].has(e.n)) on[e.side].set(e.n, t0);
      played[e.side].add(e.n);
      continue;
    }
    if (e.n == null) continue;
    const p = P(e.side, e.n, e.name);
    if (t === 'try') p.tries++;
    else if (t === 'conversión') p.conv++;
    else if (t === 'conversión fallida') p.convFallidas++;
    else if (t === 'penal') p.penales++;
    else if (t === 'penal fallido') p.penFallidos++;
    else if (t === 'drop') p.drops++;
    else if (t === 'amarilla' || t === 'segunda amarilla') p.amarillas++;
    else if (t === 'roja' || t.startsWith('tarjeta roja')) p.rojas++;
    if (e.pts) p.puntos += e.pts;
  }
  for (const s of ['LOCAL', 'VISITANTE']) {
    for (const [n, t0] of on[s]) acc[s].set(n, (acc[s].get(n) || 0) + fin - t0);
    for (const n of played[s]) {
      const r = roster[s].get(n); if (!r) continue;
      const p = P(s, n, r.name);
      p.pj++; if (r.titular) p.titular++;
      p.min += acc[s].get(n) || 0;
    }
  }
  m.ptsEventosLocal = sumPts.LOCAL; m.ptsEventosVisit = sumPts.VISITANTE;
  m.cuadra = m.ptsLocal === sumPts.LOCAL && m.ptsVisit === sumPts.VISITANTE;
  m.nEventos = evs.length; m.nLocal = roster.LOCAL.size; m.nVisit = roster.VISITANTE.size; m.finMin = fin;
  matches.push(m);
}

const pl = [...players.values()].sort((a, b) => a.equipo.localeCompare(b.equipo) || b.puntos - a.puntos || a.jugador.localeCompare(b.jugador));
const csv = (rows) => { const k = Object.keys(rows[0]); return [k.join(','), ...rows.map((r) => k.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n'); };
const w = (n, rows) => writeFileSync(`${OUT}/sra-${n}.csv`, '﻿' + csv(rows));
w('partidos', matches); w('formaciones', formaciones); w('eventos', eventos); w('jugadores', pl); if (staffs.length) w('staff', staffs);
writeFileSync(`${OUT}/sra-datos.json`, JSON.stringify({ matches, formaciones, eventos, staff: staffs, jugadores: pl }));
console.error('tipos de evento:', Object.fromEntries(tipos));
console.error('no cuadran:', matches.filter((m) => !m.cuadra).map((m) => `${m.id}:${m.ptsLocal}-${m.ptsVisit} vs ${m.ptsEventosLocal}-${m.ptsEventosVisit}`));
console.error('sin 23 por lado:', matches.filter((m) => m.nLocal !== 23 || m.nVisit !== 23).map((m) => `${m.id}:${m.nLocal}/${m.nVisit}`));
console.error('partidos', matches.length, 'formaciones', formaciones.length, 'eventos', eventos.length, 'jugadores', pl.length, 'staff', staffs.length);
