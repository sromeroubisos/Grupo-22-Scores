// Top 14 de la URBA 2026: compara lo que publica DataFactory (el proveedor de los
// widgets de ESPN) con lo que ya hay en la base. SOLO LEE: baja los JSON, consulta
// por REST con la service key de .env.local y escribe extract/*.json. No inserta,
// actualiza ni borra nada, y no tiene modo de escritura: la carga real se agrega
// aparte, después de revisar extract/simulacion.json.
//
//   node scripts/datafactory-urba/simular.mjs            (usa el caché si existe)
//   node scripts/datafactory-urba/simular.mjs --bajar    (vuelve a bajar de DataFactory)
//
// DataFactory trae por partido: `incidences.points` (tries, patadas, con plyrId
// estable y nombre completo) y `players` (el plantel completo solo en algunos
// partidos; en el resto, apenas quienes anotaron). No trae tarjetas ni cambios.
//
// OJO antes de escribir de verdad: `match_events` tiene el trigger
// trg_g22_notify_team_event (una notificación por fila nueva a los seguidores del
// club). Ver scripts/rugby-champagne/load.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const SALIDA = join(AQUI, 'extract');
const TORNEO = 'd29703d0-125c-44a1-ab38-137450935a6e'; // "Top 14 de la URBA"
const DF = 'https://espn.datafactory.la/html/v3/htmlCenter/data/deportes/rugby/urba/';

function leerEnv() {
  const env = { ...process.env };
  for (const l of readFileSync(join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = leerEnv();

// PostgREST corta en 1000 filas: se pagina por lo que llegó.
async function rest(ruta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${ruta}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${desde}-${desde + 999}`,
        'Range-Unit': 'items',
      },
    });
    if (!r.ok) throw new Error(`${ruta} -> ${r.status} ${await r.text()}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

// Vocabulario de match_events (el mismo que escribe el Match Center).
const TIPO = { 120: 'try', 125: 'conversion', 121: 'penalty_goal', 146: 'penalty_try', 122: 'drop_goal' };
const PUNTOS = { try: 5, conversion: 2, penalty_goal: 3, penalty_try: 7, drop_goal: 3 };

const sinTilde = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => sinTilde(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const RUIDO = new Set(['club', 'asoc', 'asociacion', 'de', 'del', 'la', 'el', 'los', 'las', 'rugby', 'rc', 'ac', 'cr', 'c', 'y', 'atl', 'athletic']);
const fichas = (s) => new Set(sinTilde(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !RUIDO.has(t)));
function parecido(a, b) {
  const A = fichas(a);
  const B = fichas(b);
  if (!A.size || !B.size) return 0;
  let comun = 0;
  for (const t of A) if (B.has(t)) comun++;
  return comun / Math.min(A.size, B.size);
}
const aFecha = (n) => `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}`;
const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const contar = (arr, f) => arr.reduce((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});

async function bajar() {
  const agenda = await fetch(`${DF}agendaMaM/es/agenda.json`).then((r) => r.json());
  const ids = Object.keys(agenda.events).map((k) => k.split('.').pop());
  const partidos = {};
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < ids.length) {
        const id = ids[i++];
        const r = await fetch(`${DF}events/${id}.mam.json`);
        if (!r.ok) throw new Error(`events/${id} -> ${r.status}`);
        partidos[id] = await r.json();
      }
    }),
  );
  mkdirSync(SALIDA, { recursive: true });
  const todo = { bajado: new Date().toISOString(), agenda: agenda.events, partidos };
  writeFileSync(join(SALIDA, 'events.json'), JSON.stringify(todo));
  return todo;
}

async function main() {
  const ruta = join(SALIDA, 'events.json');
  const df = process.argv.includes('--bajar') || !existsSync(ruta) ? await bajar() : JSON.parse(readFileSync(ruta, 'utf8'));

  // ---- Lado DataFactory: jugadas y plantel por partido ----
  const dfPartidos = [];
  for (const [id, m] of Object.entries(df.partidos)) {
    if (m.status?.statusId !== 2) continue;
    const home = m.match.homeTeamId;
    const away = m.match.awayTeamId;
    const score = { home: m.scoreStatus?.[home]?.score ?? null, away: m.scoreStatus?.[away]?.score ?? null };
    const acum = { home: 0, away: 0 };
    const jugadas = Object.values(m.incidences?.points ?? {})
      .map((e) => ({ tipo: TIPO[e.type], lado: e.team === home ? 'home' : 'away', t: e.t, plyrId: e.plyrId ?? null, nombre: e.plyrName ?? null }))
      .sort((a, b) => a.t.half - b.t.half || a.t.m - b.t.m || (a.t.s ?? 0) - (b.t.s ?? 0));
    let desconocido = false;
    for (const j of jugadas) {
      if (!j.tipo) desconocido = true;
      else acum[j.lado] += PUNTOS[j.tipo];
    }
    const plantel = Object.entries(m.players ?? {}).map(([pid, p]) => ({
      playerKey: pid,
      lado: p.teamId === home ? 'home' : 'away',
      nombre: [p.name?.first, p.name?.last].filter(Boolean).join(' '),
      camiseta: p.squadNo ?? null,
      puesto: p.posnId ?? null,
      suplente: !!p.substitute,
    }));
    dfPartidos.push({
      id,
      fecha: aFecha(m.match.date),
      local: m.match.homeTeamName,
      visitante: m.match.awayTeamName,
      ronda: m.match.week,
      score,
      cierra: !desconocido && acum.home === score.home && acum.away === score.away,
      jugadas,
      plantel,
      plantelCompleto: plantel.length >= 30,
    });
  }

  // ---- Lado base: partidos, eventos y gente del Top 14 ----
  const partidosBase = await rest(`matches?select=id,date_time,score,home_club_id,away_club_id,status&tournament_id=eq.${TORNEO}&date_time=gte.2026-01-01`);
  const clubes = new Map((await rest('clubs?select=id,name')).map((c) => [String(c.id), c.name]));
  const eventos = new Map(); // match_id -> filas
  for (let i = 0; i < partidosBase.length; i += 100) {
    const ids = partidosBase.slice(i, i + 100).map((p) => p.id).join(',');
    for (const e of await rest(`match_events?select=id,match_id,club_id,player_id,player_name,event_type,minute,details&match_id=in.(${ids})`)) {
      (eventos.get(e.match_id) ?? eventos.set(e.match_id, []).get(e.match_id)).push(e);
    }
  }
  const gente = await rest('people?select=id,club_id,full_name,first_name,last_name');
  const porClub = new Map(); // club_id -> Map(clave -> Set(person_id))
  for (const p of gente) {
    const k = clave(p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`);
    if (!k || !p.club_id) continue;
    const m = porClub.get(p.club_id) ?? new Map();
    m.set(k, (m.get(k) ?? new Set()).add(p.id));
    porClub.set(p.club_id, m);
  }
  const resolver = (club, nombre) => {
    const h = porClub.get(club)?.get(clave(nombre));
    return h?.size === 1 ? 'unico' : h?.size > 1 ? 'ambiguo' : 'ninguno';
  };

  // ---- Emparejar: fecha ±2 días, mismo marcador, un club parecido ----
  const usados = new Set();
  const informe = { pares: [], sinPareja: [], ambiguos: [], marcadorDistinto: [] };
  for (const p of dfPartidos) {
    const mismaFecha = partidosBase.filter((n) => !usados.has(n.id) && dias(n.date_time, p.fecha) <= 2);
    const cand = mismaFecha
      .filter((n) => n.score && n.score.home === p.score.home && n.score.away === p.score.away)
      .map((n) => ({ n, sim: parecido(p.local, clubes.get(String(n.home_club_id))) + parecido(p.visitante, clubes.get(String(n.away_club_id))) }))
      .filter((x) => x.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim);
    const ficha = { dfId: p.id, ronda: p.ronda, fecha: p.fecha, local: p.local, visitante: p.visitante, score: p.score };
    if (cand.length === 0) {
      // ¿Hay un partido de la misma fecha con clubes parecidos pero otro marcador?
      const raro = mismaFecha.find((n) => parecido(p.local, clubes.get(String(n.home_club_id))) + parecido(p.visitante, clubes.get(String(n.away_club_id))) >= 1);
      if (raro) informe.marcadorDistinto.push({ ...ficha, baseId: raro.id, scoreBase: raro.score });
      else informe.sinPareja.push(ficha);
    } else if (cand.length > 1 && cand[0].sim === cand[1].sim) informe.ambiguos.push({ ...ficha, candidatos: cand.map((x) => x.n.id) });
    else {
      usados.add(cand[0].n.id);
      informe.pares.push({ p, n: cand[0].n });
    }
  }

  // ---- Qué aporta cada par ----
  const r = {
    sinEventosEnBase: [], // DataFactory cubre un hueco
    yaCoincide: 0,
    minutosCorridos: 0,
    difiereSoloElNombre: 0,
    yaDifiere: [],
    dfNoCierraElMarcador: [],
    jugadoresNullQueSeResolverian: 0,
    jugadoresNullTotal: 0,
    dfJugadoresPorResolver: { unico: 0, ambiguo: 0, ninguno: 0 },
    eventosNuevos: 0,
    plantelesCompletos: [],
  };
  const plyr = new Map(); // plyrId -> Set(nombres)
  const nombrePlyr = new Map(); // clave(nombre) -> Set(plyrId)
  for (const { p, n } of informe.pares) {
    if (!p.cierra) r.dfNoCierraElMarcador.push({ dfId: p.id, local: p.local, visitante: p.visitante });
    for (const j of p.jugadas) {
      if (!j.plyrId) continue;
      (plyr.get(j.plyrId) ?? plyr.set(j.plyrId, new Set()).get(j.plyrId)).add(j.nombre);
      const k = clave(j.nombre);
      (nombrePlyr.get(k) ?? nombrePlyr.set(k, new Set()).get(k)).add(j.plyrId);
    }
    if (p.plantelCompleto) r.plantelesCompletos.push({ dfId: p.id, matchId: n.id, local: p.local, visitante: p.visitante, jugadores: p.plantel.length, conCamiseta: p.plantel.filter((x) => x.camiseta != null).length });

    const enBase = eventos.get(n.id) ?? [];
    if (!enBase.length) {
      r.sinEventosEnBase.push({ dfId: p.id, matchId: n.id, ronda: p.ronda, local: p.local, visitante: p.visitante, score: p.score, jugadas: p.jugadas.length, cierra: p.cierra });
      r.eventosNuevos += p.jugadas.length;
      for (const j of p.jugadas) {
        if (!j.nombre) continue;
        const club = j.lado === 'home' ? n.home_club_id : n.away_club_id;
        r.dfJugadoresPorResolver[resolver(club, j.nombre)]++;
      }
      continue;
    }
    // Ya tiene eventos: ¿coincide por tipo y minuto?
    const puntos = enBase.filter((e) => PUNTOS[e.event_type]);
    // Champagne guarda el minuto DENTRO del tiempo (2T 2') y DataFactory el
    // ABSOLUTO (42): se normaliza el de DataFactory restando 40 en el 2T.
    const enTiempo = (j) => (j.t.half >= 2 ? j.t.m - 40 : j.t.m);
    // Los minutos se corren hasta ±1 entre fuentes (2T 20' contra 59): se compara
    // por tipo + tiempo + jugador, y el minuto solo se mide aparte.
    const firma = (arr) => arr.map((x) => `${x.tipo}@${x.per}@${clave(x.quien)}`).sort().join('|');
    const a = firma(p.jugadas.map((j) => ({ tipo: j.tipo, per: j.t.half >= 2 ? '2T' : '1T', quien: j.nombre })));
    const b = firma(puntos.map((e) => ({ tipo: e.event_type, per: e.details?.period ?? '?', quien: e.player_name })));
    if (a === b) {
      r.yaCoincide++;
      const mins = (arr) => arr.map((x) => `${x.tipo}@${x.per}@${x.min}`).sort().join('|');
      const am = mins(p.jugadas.map((j) => ({ tipo: j.tipo, per: j.t.half >= 2 ? '2T' : '1T', min: enTiempo(j) })));
      const bm = mins(puntos.map((e) => ({ tipo: e.event_type, per: e.details?.period ?? '?', min: e.minute })));
      if (am !== bm) r.minutosCorridos++;
    }
    else {
      // ¿Difiere solo el nombre (misma jugada, otra grafía) o la jugada misma?
      const sinNombre = (arr) => arr.map((x) => `${x.tipo}@${x.per}`).sort().join('|');
      const soloNombre = sinNombre(p.jugadas.map((j) => ({ tipo: j.tipo, per: j.t.half >= 2 ? '2T' : '1T' }))) === sinNombre(puntos.map((e) => ({ tipo: e.event_type, per: e.details?.period ?? '?' })));
      if (soloNombre) r.difiereSoloElNombre++;
      r.yaDifiere.push({ dfId: p.id, matchId: n.id, local: p.local, visitante: p.visitante, df: p.jugadas.length, base: puntos.length, soloNombre, fuenteBase: enBase[0]?.details?.source ?? null });
    }

    // Jugadores sin id en la base que el nombre de DataFactory sí resolvería:
    // se alinean por (tipo, minuto) solo cuando es unívoco.
    for (const e of puntos) {
      if (e.player_id) continue;
      r.jugadoresNullTotal++;
      const igual = p.jugadas.filter((j) => j.tipo === e.event_type && (j.t.half >= 2 ? '2T' : '1T') === e.details?.period && enTiempo(j) === e.minute && j.nombre);
      if (igual.length !== 1) continue;
      const club = igual[0].lado === 'home' ? n.home_club_id : n.away_club_id;
      if (resolver(club, igual[0].nombre) === 'unico') r.jugadoresNullQueSeResolverian++;
    }
  }

  const conflictos = {
    plyrIdConVariosNombres: [...plyr].filter(([, s]) => s.size > 1).map(([id, s]) => ({ id, nombres: [...s] })).slice(0, 20),
    nombreConVariosPlyrId: [...nombrePlyr].filter(([, s]) => s.size > 1).map(([k, s]) => ({ nombre: k, ids: [...s] })).slice(0, 20),
  };

  const resumen = {
    datafactoryTerminados: dfPartidos.length,
    emparejados: informe.pares.length,
    sinPareja: informe.sinPareja.length,
    ambiguos: informe.ambiguos.length,
    marcadorDistinto: informe.marcadorDistinto.length,
    dfCierraElMarcador: dfPartidos.filter((x) => x.cierra).length,
    partidosSinEventosEnBase: r.sinEventosEnBase.length,
    eventosNuevosPosibles: r.eventosNuevos,
    yaCoincide: r.yaCoincide,
    ...{ deEsosConMinutosCorridos: r.minutosCorridos },
    yaDifiere: r.yaDifiere.length,
    ...{ deEsosDifiereSoloElNombre: r.difiereSoloElNombre },
    jugadorSinIdEnBase: r.jugadoresNullTotal,
    jugadorSinIdQueSeResolveria: r.jugadoresNullQueSeResolverian,
    nombresDeLosPartidosNuevos: r.dfJugadoresPorResolver,
    plyrIdDistintos: plyr.size,
    conflictosPlyrId: conflictos.plyrIdConVariosNombres.length,
    conflictosNombre: conflictos.nombreConVariosPlyrId.length,
    plantelesCompletos: r.plantelesCompletos.length,
    plantelesPorTamano: contar(dfPartidos.filter((x) => x.plantelCompleto), (x) => x.plantel.length),
  };
  const sal = { generado: new Date().toISOString(), resumen, ...r, conflictos, informe: { sinPareja: informe.sinPareja, ambiguos: informe.ambiguos, marcadorDistinto: informe.marcadorDistinto } };
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, 'simulacion.json'), JSON.stringify(sal, null, 1));
  console.log(JSON.stringify(resumen, null, 2));
}

await main();
