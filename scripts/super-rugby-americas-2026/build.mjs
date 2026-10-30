/**
 * Super Rugby Americas 2026: arma el JSON de fichas para `src/scripts/ficha-partido-local.ts`
 * a partir de `fuente/sra-datos.json` (salida de `scrape.mjs`, RegiSLAR).
 *
 *   node scripts/super-rugby-americas-2026/build.mjs
 *
 * Solo LEE la base (partidos y plantel de los 8 clubes). Escribe
 * `src/scripts/formaciones/2026-10-23-super-rugby-americas.json`.
 *
 * - Cada partido de la fuente se empareja con su fila de `matches` por
 *   local + visitante + marcador (y, si repite, por fecha mas cercana).
 * - Cada nombre se cruza contra `people` del club (llave con tokens ordenados y
 *   plegada; despues subconjunto si califica UNA sola) y se fija el `id` de la ficha
 *   con mas formaciones: ver [[fichas-duplicadas-por-tilde]].
 * - Eventos: solo los que tienen tipo en el catalogo (try, penalty_try, conversion,
 *   penalty_goal, drop_goal, card_yellow, card_red, substitution, injury).
 *   Quedan afuera HIA, sangre, reingresos, conversiones/penales fallidos y citaciones.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const TORNEO = 'f76e47e2-5f9c-4f39-8f06-f6137f5a2846';

const CLUB = {
  'Dogos XV': 'dogos-xv', 'Cobras Brasil Rugby': 'cobras-brasil-xv', Tarucas: 'tarucas', Selknam: 'selknam',
  'Yacare XV': 'yacare-xv', Pampas: 'pampas', 'Capibaras XV': 'capibaras-xv', 'Peñarol Rugby': 'penarol',
};

async function rest(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) throw new Error(`${q} -> ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => fold(s).split(' ').filter(Boolean);
const key = (s) => toks(s).sort().join(' ');

const datos = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/super-rugby-americas-2026/fuente/sra-datos.json'), 'utf8'));

// ---- base ----
const dbMatches = await rest(`matches?select=id,home_club_id,away_club_id,score,date_time,referee&tournament_id=eq.${TORNEO}&date_time=gte.2026-01-01&order=date_time`);
const clubIds = Object.values(CLUB);
const inList = `(${clubIds.join(',')})`;
const people = await rest(`people?select=id,name,club_id,role&club_id=in.${inList}`);
const conLineup = await rest(`matches?select=lineups&or=(home_club_id.in.${inList},away_club_id.in.${inList})&or=(lineup_home_count.gt.0,lineup_away_count.gt.0)`);
const uso = new Map();
for (const m of conLineup) for (const lado of ['home', 'away']) for (const j of m.lineups?.[lado] ?? []) if (j?.id) uso.set(j.id, (uso.get(j.id) || 0) + 1);
console.error(`db: ${dbMatches.length} partidos 2026 · ${people.length} personas · ${conLineup.length} partidos con formacion`);

const porClub = new Map();
for (const p of people) {
  if (p.role && p.role !== 'player') continue;
  if (!porClub.has(p.club_id)) porClub.set(p.club_id, []);
  porClub.get(p.club_id).push({ ...p, k: key(p.name), t: new Set(toks(p.name)) });
}
const stats = { exacta: 0, subconjunto: 0, nueva: 0, ambigua: 0 };
const nuevas = [];
const resolverFicha = (clubId, nombre) => {
  const lista = porClub.get(clubId) ?? [];
  const mejor = (c) => [...c].sort((a, b) => (uso.get(b.id) || 0) - (uso.get(a.id) || 0) || a.id.localeCompare(b.id))[0];
  const k = key(nombre);
  const ex = lista.filter((p) => p.k === k);
  if (ex.length) { stats.exacta++; return mejor(ex).id; }
  const t = new Set(toks(nombre));
  const sub = lista.filter((p) => p.t.size >= 2 && ([...p.t].every((x) => t.has(x)) || [...t].every((x) => p.t.has(x))));
  const distintos = new Set(sub.map((p) => p.k));
  if (distintos.size === 1) { stats.subconjunto++; return mejor(sub).id; }
  if (distintos.size > 1) stats.ambigua++;
  stats.nueva++; nuevas.push(`${clubId}: ${nombre}${distintos.size > 1 ? ' (ambiguo)' : ''}`);
  return undefined;
};

// ---- partidos ----
const dmy = (s) => { const [d, m, y] = s.split('/').map(Number); return Date.UTC(y, m - 1, d); };
const usados = new Set();
const partidos = [];
const sinPareja = [];
const tiposSaltados = {};
const advertencias = [];

for (const m of datos.matches) {
  const h = CLUB[m.local], a = CLUB[m.visitante];
  const cand = dbMatches.filter((x) => x.home_club_id === h && x.away_club_id === a && Number(x.score?.home) === m.ptsLocal && Number(x.score?.away) === m.ptsVisit && !usados.has(x.id));
  let fila = cand[0];
  if (cand.length > 1) fila = cand.sort((x, y) => Math.abs(Date.parse(x.date_time) - dmy(m.fecha)) - Math.abs(Date.parse(y.date_time) - dmy(m.fecha)))[0];
  if (!fila) { sinPareja.push(`${m.id} ${m.local} ${m.ptsLocal}-${m.ptsVisit} ${m.visitante} (${m.fecha})`); continue; }
  usados.add(fila.id);

  const forms = datos.formaciones.filter((f) => f.partido === m.id);
  const lado = (side, clubId, nombreClub) => {
    const js = forms.filter((f) => f.lado === side).sort((x, y) => x.numero - y.numero);
    const uno = (f) => {
      const id = resolverFicha(clubId, f.jugador);
      return { numero: f.numero, nombre: f.jugador, ...(f.capitan ? { capitan: true } : {}), ...(id ? { id } : {}) };
    };
    return { nombre: nombreClub, titulares: js.filter((f) => f.titular).map(uno), suplentes: js.filter((f) => !f.titular).map(uno) };
  };
  const roster = { LOCAL: new Map(), VISITANTE: new Map() };
  for (const f of forms) roster[f.lado].set(f.numero, f.jugador);

  const evs = datos.eventos.filter((e) => e.partido === m.id);
  const minuto = (e) => {
    const [x, y = 0] = String(e.minuto).split('+').map(Number);
    const v = x + y;
    return e.tiempo === '2T' && x > 40 ? v - 40 : v; // algunos partidos cargan el 2T corrido (41..80)
  };
  const periodo = (e) => (e.tiempo === '1T' ? '1T' : '2T');
  const nombreDe = (e) => roster[e.lado].get(e.numero) ?? e.jugador;
  const eq = (e) => (e.lado === 'LOCAL' ? 'local' : 'visitante');

  const OUT = new Set(['Egresa', 'Reemplazo Lesion', 'Reemplazo Tarjeta Roja 20-min', 'Reemplazo de tarjeta roja', 'Se retira']);
  // La fuente anota las salidas y las entradas por separado y no siempre en el mismo
  // minuto (sale el 8 a los 10', entra el 20 a los 8'). Se emparejan POR ORDEN dentro
  // de cada lado. Si no cierran (reemplazos temporales por HIA o sangre), se descartan las
  // salidas de quien despues reingresa y se vuelve a probar; si tampoco cierra no se
  // inventan pares y esos cambios no se cargan.
  const pareja = new Map(); // evento de salida -> evento de entrada
  for (const side of ['LOCAL', 'VISITANTE']) {
    const delLado = evs.filter((e) => e.lado === side);
    const reingresan = new Set(delLado.filter((e) => /^Reingres/.test(e.tipo)).map((e) => e.numero));
    const ins = delLado.filter((e) => e.tipo === 'Ingresa');
    let outs = delLado.filter((e) => OUT.has(e.tipo));
    if (outs.length !== ins.length) outs = outs.filter((e) => !reingresan.has(e.numero));
    if (outs.length === ins.length) outs.forEach((o, i) => pareja.set(o, ins[i]));
    else advertencias.push(`${m.id} ${side}: ${outs.length} salidas / ${ins.length} entradas, sin cambios cargados`);
  }

  const eventos = [];
  const push = (e, tipo, extra = {}) => eventos.push({ minuto: minuto(e), periodo: periodo(e), tipo, equipo: eq(e), ...(e.numero !== '' && e.numero != null ? { jugador: nombreDe(e) } : {}), ...extra });
  for (const e of evs) {
    switch (e.tipo) {
      case 'Try': push(e, 'try'); break;
      case 'Try penal': push(e, 'penalty_try'); break;
      case 'Conversión': push(e, 'conversion'); break;
      case 'Penal': push(e, 'penalty_goal'); break;
      case 'Drop': push(e, 'drop_goal'); break;
      case 'Amarilla': push(e, 'card_yellow'); break;
      case 'Segunda amarilla': push(e, 'card_red', { detalle: 'Segunda amarilla' }); break;
      case 'Roja': push(e, 'card_red'); break;
      case 'Tarjeta Roja 20-min': push(e, 'card_red', { detalle: 'Tarjeta roja de 20 minutos' }); break;
      default: {
        if (OUT.has(e.tipo)) {
          if (e.tipo === 'Reemplazo Lesion') push(e, 'injury', { detalle: 'Lesionado' });
          const inn = pareja.get(e);
          if (inn) push(e, 'substitution', { detalle: `Entra: ${nombreDe(inn)}` });
          else tiposSaltados['cambio sin pareja'] = (tiposSaltados['cambio sin pareja'] || 0) + 1;
          break;
        }
        if (e.tipo === 'Ingresa') break;
        tiposSaltados[e.tipo] = (tiposSaltados[e.tipo] || 0) + 1;
      }
    }
  }
  // el marcador que suman los eventos tiene que ser el de la fila
  const pts = { LOCAL: 0, VISITANTE: 0 };
  for (const e of evs) if (e.puntos) pts[e.lado] += Number(e.puntos);
  if (pts.LOCAL !== m.ptsLocal || pts.VISITANTE !== m.ptsVisit) advertencias.push(`${m.id}: eventos ${pts.LOCAL}-${pts.VISITANTE} vs ${m.ptsLocal}-${m.ptsVisit}`);

  partidos.push({
    id: fila.id,
    rotulo: `${m.local} vs ${m.visitante} · ${m.fecha} · ${m.ronda}`,
    ...(m.arbitro ? { arbitro: m.arbitro } : {}),
    local: lado('LOCAL', h, m.local),
    visitante: lado('VISITANTE', a, m.visitante),
    eventos,
  });
}

const salida = {
  descripcion: 'Super Rugby Americas 2026 · formaciones, eventos y arbitro desde RegiSLAR (regisar.sudamerica.rugby/embed/partidos). Fichas reusadas por nombre plegado y tokens ordenados.',
  torneo: 'Super Rugby Americas',
  partidos,
};
const destino = path.join(REPO, 'src/scripts/formaciones/2026-10-23-super-rugby-americas.json');
fs.writeFileSync(destino, JSON.stringify(salida, null, 2));
console.error(`partidos emparejados: ${partidos.length}/${datos.matches.length} · sin pareja: ${sinPareja.length}`);
if (sinPareja.length) console.error(sinPareja.join('\n'));
console.error('fichas:', stats);
console.error('eventos saltados (sin tipo en el catalogo):', tiposSaltados);
console.error(`advertencias (${advertencias.length}):`, advertencias.slice(0, 25));
console.error(`jugadores sin ficha (se crean): ${nuevas.length}`);
fs.writeFileSync(path.join(REPO, 'scripts/super-rugby-americas-2026/fuente/jugadores-nuevos.txt'), nuevas.join('\n'));
console.error('->', destino);
