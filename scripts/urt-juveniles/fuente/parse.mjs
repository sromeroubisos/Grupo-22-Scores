// Parser de los boletines de la URT (pdftotext -table): tablas juveniles y programación.
// Salida: parsed.json { bulletins: [{ file, n, date, tables: [...], programs: [...] }] }
import fs from 'node:fs';

const DIR = 'tbl';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort();

// Cada archivo es un boletín; el número sale del texto en modo layout (en
// -table viene partido). Duplicados conocidos: el Nº 06 subido dos veces y una
// fe de erratas del Nº 08 de una sola página.
const DESCARTAR = new Set(['308_20260311215450.txt', '308_20260327223402.txt']);
const porNumero = new Map();
for (const f of files) {
  if (DESCARTAR.has(f)) continue;
  const t = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  const lay = fs.readFileSync(`txt/${f}`, 'utf8');
  const n = Number((lay.match(/BOLETIN N\S*\s*(\d+)/) || [])[1]);
  const fd = f.match(/_(\d{4})(\d{2})(\d{2})/);
  porNumero.set(f, { f, t, n, date: `${fd[1]}-${fd[2]}-${fd[3]}` });
}

const norm = (s) => s.replace(/­/g, '-').replace(/\s+/g, ' ').trim();

/** Clave canónica de una competencia juvenil. */
function claveTabla(h) {
  const s = norm(h).toUpperCase().replace(/TORNEOINICIACION/, 'TORNEO INICIACION').replace(/M-(\d+)AÑOS/, 'M-$1 AÑOS')
    .replace(/CAMPEONATOZONA/, 'CAMPEONATO ZONA').replace(/RESREVA/, 'RESERVA').replace(/-RESERVA/, '- RESERVA');
  const div = (s.match(/M-(\d+)/) || [])[1];
  const torneo = /INICIACION/.test(s) ? 'INICIACION' : 'ANUAL';
  const zona = /RESERVA/.test(s) ? 'RESERVA' : 'CAMPEONATO';
  const copa = (s.match(/COPA (ORO|PLATA)/) || [])[1] || null;
  const grupo = (s.match(/ZONA "([AB])"/) || [])[1] || null;
  return { div: `M${div}`, torneo, zona, copa, grupo };
}

const COLS = [
  ['pts', 'Ptos'], ['bTry', 'B.dif. Try'], ['bTantos', 'B.dif. Tantos'], ['bDestrezas', 'B.Destrezas'],
  ['pj', 'P.J.'], ['pg', 'P.G.'], ['pe', 'P.E.'], ['pp', 'P.P'], ['tf', 'T.Favo'], ['tc', 'T. en C.'],
  ['dif', 'Dif. T.'], ['tryF', 'Try F.'], ['tryC', 'Try C.'], ['pen', 'Penales'], ['conv', 'Conv.'],
];

function columnas(header) {
  const out = []; let desde = 0;
  for (const [k, lbl] of COLS) {
    const i = header.indexOf(lbl, desde);
    if (i < 0) return null;
    out.push({ k, ini: i, fin: i + lbl.length, centro: i + lbl.length / 2 });
    desde = i + lbl.length;
  }
  return out;
}

function asignar(tokens, cols, shift) {
  const fila = {}; let costo = 0; let choque = false;
  for (const k of COLS.map((c) => c[0])) fila[k] = null;
  for (const t of tokens) {
    let mejor = null; let dist = Infinity;
    for (const c of cols) {
      const d = Math.min(Math.abs(t.centro - shift - c.centro), Math.abs(t.fin - shift - c.fin), Math.abs(t.ini - shift - c.ini));
      if (d < dist) { dist = d; mejor = c; }
    }
    if (fila[mejor.k] != null) choque = true;
    fila[mejor.k] = t.v; costo += dist;
  }
  // Un blanco es un cero: la URT no escribe la diferencia 0, los tantos en contra
  // de un 96-0 ni nada de un equipo que todavía no jugó.
  for (const k of COLS.map((c) => c[0])) if (k !== 'pts' && fila[k] == null) fila[k] = 0;
  const valida = !choque && fila.pts != null
    && fila.pj === fila.pg + fila.pe + fila.pp && fila.dif === fila.tf - fila.tc;
  return { fila, costo, valida };
}

function parseFila(line, cols) {
  const m = line.match(/^(.*?\S)\s{2,}(-?\d.*)$/);
  if (!m) return null;
  const equipo = norm(m[1]);
  if (!/[A-Za-z]/.test(equipo) || /RUGBY INFANTIL|\d{2}\/\d{2}\/\d{4}/.test(line)) return null;
  const off = line.length - m[2].length;
  const tokens = []; const re = /-?\d+/g; let t;
  while ((t = re.exec(m[2]))) {
    const ini = off + t.index; const fin = ini + t[0].length;
    tokens.push({ v: Number(t[0]), ini, fin, centro: (ini + fin) / 2 });
  }
  // Los valores aparecen en el ORDEN de las columnas, con blancos (= cero) en
  // cualquiera menos Ptos. Se prueban todas las asignaciones que respetan ese
  // orden; quedan las que cumplen PJ=PG+PE+PP y Dif=TF-TC, y entre ellas gana
  // la más pegada al encabezado (con el mejor corrimiento de la fila).
  const K = COLS.map((c) => c[0]); const n = tokens.length; const cands = [];
  const elegido = new Array(n);
  const evaluar = () => {
    const f = Object.fromEntries(K.map((k) => [k, 0]));
    elegido.forEach((ci, i) => { f[K[ci]] = tokens[i].v; });
    if (elegido[0] !== 0 && !sinPuntos) return;   // Ptos está, salvo el 0 en blanco
    if (f.pj !== f.pg + f.pe + f.pp || f.dif !== f.tf - f.tc) return;
    if ([f.pj, f.pg, f.pe, f.pp, f.tf, f.tc, f.tryF, f.tryC, f.pen, f.conv].some((x) => x < 0)) return;
    if (f.tryF * 5 > f.tf + 0 || f.tryC * 5 > f.tc) return; // 5 por try como mínimo
    // TF = 5 tries + 2 conversiones + 3 penales (+ drops, de a 3). Ata las
    // columnas de tries, penales y conversiones, que ninguna otra cuenta ata.
    const resto = f.tf - 5 * f.tryF - 2 * f.conv - 3 * f.pen;
    if (resto < 0 || resto % 3 !== 0 || f.conv > f.tryF) return;
    const penalDrop = resto / 3; // drops: casi siempre 0
    // Puntos: 4 por ganado, 2 por empate, y a lo sumo 3 de bonus por partido
    // (ofensivo, defensivo y el de destrezas).
    const base = 4 * f.pg + 2 * f.pe;
    if (f.pts < base || f.pts > base + 3 * f.pj) return;
    if (f.pj > 0 && f.pg === f.pj && f.dif <= 0) return;
    if (f.pj > 0 && f.pp === f.pj && f.dif >= 0) return;
    if (f.pj > 0 && f.pe === f.pj && f.dif !== 0) return;
    let costo = Infinity;
    for (let s = -20; s <= 20; s++) {
      let c = 0; elegido.forEach((ci, i) => { c += Math.abs(tokens[i].fin - s - cols[ci].fin); });
      if (c < costo) costo = c;
    }
    cands.push({ costo: costo + 6 * penalDrop, f });
  };
  const rec = (i, desde) => {
    if (i === n) { evaluar(); return; }
    for (let c = desde; c <= K.length - (n - i); c++) { elegido[i] = c; rec(i + 1, c + 1); }
  };
  let sinPuntos = false;
  if (n <= K.length) rec(0, 0);
  if (!cands.length && n < K.length) { sinPuntos = true; rec(0, 1); }
  if (!cands.length) return { equipo, _invalida: true, _crudo: line.trim() };
  cands.sort((a, b) => a.costo - b.costo);
  // Lecturas distintas (por PJ/PG/PE/PP/tantos), las 6 más pegadas al encabezado.
  const vistas = new Set(); const opciones = [];
  for (const c of cands) { const k = [c.f.pj, c.f.pg, c.f.pe, c.f.pp, c.f.tf, c.f.tc].join(','); if (!vistas.has(k)) { vistas.add(k); opciones.push(c); } if (opciones.length === 6) break; }
  return { equipo, ...opciones[0].f, _opciones: opciones };
}

/**
 * Elige UNA lectura por fila de modo que la tabla cierre como liga:
 * suma de ganados = suma de perdidos y empates pares. Entre las que cierran,
 * la de menor costo geométrico total.
 */
function resolverTabla(filas) {
  const conOp = filas.filter((f) => f._opciones);
  let mejor = null; const pick = new Array(conOp.length);
  const rec = (i, pg, pp, pe, costo) => {
    if (mejor && costo >= mejor.costo) return;
    if (i === conOp.length) { if (pg === pp && pe % 2 === 0) mejor = { costo, pick: [...pick] }; return; }
    conOp[i]._opciones.forEach((o, k) => { pick[i] = k; rec(i + 1, pg + o.f.pg, pp + o.f.pp, pe + o.f.pe, costo + o.costo); });
  };
  rec(0, 0, 0, 0, 0);
  conOp.forEach((f, i) => {
    const o = f._opciones[mejor ? mejor.pick[i] : 0];
    Object.assign(f, o.f);
    if (!mejor) f._noCierra = true;
    delete f._opciones;
  });
  return filas;
}

function parseTablas(texto) {
  const L = texto.split(/\r?\n/); const out = [];
  for (let i = 0; i < L.length; i++) {
    if (!/TABLAS POSICIONES/.test(L[i]) || !/M-?\s?1[5-9]/.test(L[i])) continue;
    const clave = claveTabla(L[i]);
    let j = i + 1; while (j < L.length && !/^Equipo/.test(L[j].trim())) j++;
    const cols = columnas(L[j] || '');
    if (!cols) { out.push({ ...clave, error: 'sin encabezado' }); continue; }
    const filas = [];
    for (let k = j + 1; k < L.length; k++) {
      const s = L[k];
      if (/TABLAS POSICIONES|^\s*Equipo|PROGRAMACION/.test(s)) break;
      if (!s.trim()) continue;
      const f = parseFila(s, cols);
      if (f) filas.push(f); else if (filas.length) break;
    }
    out.push({ ...clave, filas: resolverTabla(filas) });
  }
  return out;
}

/** Programación: TORNEO… / DIVISION: M-xx AÑOS  FECHA Nº k / partidos numerados. */
function parseProgramas(texto) {
  const L = texto.split(/\r?\n/).map((l) => l.replace(/­/g, '-')); const out = [];
  let torneo = null;
  for (let i = 0; i < L.length; i++) {
    const s = L[i];
    if (/^\s*TORNEO\b/.test(s) && !/TABLAS/.test(s)) torneo = norm(s);
    const d = s.match(/DIVISION:\s*M-(1[5-9])\s*AÑOS\s+(.*)$/);
    if (!d || !torneo) continue;
    const etiqueta = norm(d[2]);
    const fecha = (etiqueta.match(/FECHA\s*N\S*\s*(\d+)/) || [])[1];
    const partidos = [];
    for (let k = i + 1; k < L.length; k++) {
      const t = L[k];
      if (/DIVISION:|^\s*TORNEO\b|TABLAS/.test(t)) break;
      // Entre el número de partido y el local hay de 1 a 8 espacios según el boletín.
      const m = t.match(/^\s*(\d{1,2})\s{1,8}(\S.*)$/);
      if (!m) continue;
      const campos = m[2].split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
      if (campos.length < 2) continue;
      const [local, visitante, ...resto] = campos;
      const hora = resto.find((x) => /^\d{1,2}:\d{2}/.test(x)) || null;
      const dia = (resto.join(' ').match(/(\d{2})\/(\d{2})\/(\d{2})/) || []);
      partidos.push({
        n: Number(m[1]), local, visitante,
        cancha: resto.find((x) => /N[º°]/.test(x)) || null,
        hora: hora ? hora.slice(0, 5) : null,
        dia: dia[1] ? `20${dia[3]}-${dia[2]}-${dia[1]}` : null,
        resto: resto.join(' | '),
      });
    }
    out.push({ torneo, div: `M${d[1]}`, etiqueta, fecha: fecha ? Number(fecha) : null, partidos });
  }
  return out;
}

const bulletins = [...porNumero.values()].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({
  file: b.f, n: b.n, date: b.date, tables: parseTablas(b.t), programs: parseProgramas(b.t),
}));
fs.writeFileSync('parsed.json', JSON.stringify({ bulletins }, null, 1));

let tablas = 0, filas = 0, malas = 0, choques = 0, progs = 0, partidos = 0;
for (const b of bulletins) {
  for (const t of b.tables) { tablas++; for (const f of t.filas || []) { filas++; if (f._invalida) malas++; if (f._choque) choques++; } }
  for (const p of b.programs) { progs++; partidos += p.partidos.length; }
}
console.log({ boletines: bulletins.length, tablas, filas, filasInvalidas: malas, choques, programaciones: progs, partidos });
