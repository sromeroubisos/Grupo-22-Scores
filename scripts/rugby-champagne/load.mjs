// Top 14 de la URBA 2026: arma las filas de match_events desde la cronología de
// Rugby Champagne. SOLO SIMULA: escribe extract/load-plan.json y no tiene modo
// de escritura. La carga real se agrega aparte, después de revisar el plan.
//
//   node scripts/rugby-champagne/extract.mjs 27
//   node scripts/rugby-champagne/match.mjs
//   node scripts/rugby-champagne/load.mjs
//
// OJO antes de escribir de verdad: `match_events` tiene el trigger
// trg_g22_notify_team_event, que por CADA fila nueva inserta una notificación
// "Nuevo evento de <club>" a todos los que siguen al club. Una carga histórica
// sin apagarlo notifica jugadas de partidos viejos.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const CAMPEONATO = '27'; // Top 14 de la URBA

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
const TIPOS = {
  Try: 'try',
  'Conversión': 'conversion',
  Penal: 'penalty_goal',
  'Try Penal': 'penalty_try',
  Drop: 'drop_goal',
  Amarilla: 'card_yellow',
  Roja: 'card_red',
};
const IGNORADOS = new Set(['Fin Amarilla']); // no es una jugada: el fin de la sanción
const PUNTOS = { try: 5, conversion: 2, penalty_goal: 3, penalty_try: 7, drop_goal: 3 };

const clave = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

async function main() {
  const ext = JSON.parse(readFileSync(join(AQUI, 'extract', '2026.json'), 'utf8'))[CAMPEONATO];
  const pares = JSON.parse(readFileSync(join(AQUI, 'extract', 'match-report.json'), 'utf8'))[CAMPEONATO].pares;
  const porSitio = new Map(ext.partidos.map((p) => [p.id, p]));

  // Jugadores: personas del club, por nombre sin tildes ni orden.
  const gente = await rest('people?select=id,club_id,full_name,first_name,last_name');
  const roles = await rest('club_person_roles?select=club_id,person_id');
  const personas = new Map(gente.map((p) => [p.id, p]));
  const porClub = new Map(); // club_id -> Map(clave -> Set(person_id))
  const sumar = (club, p) => {
    if (!club || !p) return;
    const k = clave(p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`);
    if (!k) return;
    const m = porClub.get(club) ?? new Map();
    m.set(k, (m.get(k) ?? new Set()).add(p.id));
    porClub.set(club, m);
  };
  for (const p of gente) sumar(p.club_id, p);
  for (const r of roles) sumar(r.club_id, personas.get(r.person_id));

  const plan = { generado: new Date().toISOString(), partidos: [], omitidos: [], filas: [] };
  const cuenta = { porTipo: {}, ignorados: 0, jugadorResuelto: 0, jugadorSinResolver: 0, jugadorAmbiguo: 0, sinJugador: 0 };

  for (const par of pares) {
    const p = porSitio.get(par.sitioId);
    const omitir = (motivo, extra = {}) => plan.omitidos.push({ sitioId: par.sitioId, matchId: par.matchId, local: p?.local, visitante: p?.visitante, motivo, ...extra });
    if (par.yaConEventos) { omitir('ya tiene eventos en la base'); continue; }
    if (!p?.cronologia?.some((e) => e.tipo)) { omitir('sin cronología en el sitio'); continue; }

    // La web lista del más nuevo al más viejo: se da vuelta.
    const lista = [...p.cronologia].reverse();
    let periodo = '1T';
    let orden = 0;
    const filas = [];
    const acum = { local: 0, visitante: 0 };
    let incoherente = null;
    for (const e of lista) {
      if (e.hito) {
        if (/fin primer tiempo/i.test(e.hito)) periodo = '2T';
        continue;
      }
      if (IGNORADOS.has(e.tipo)) { cuenta.ignorados++; continue; }
      const tipo = TIPOS[e.tipo];
      if (!tipo) { incoherente = `tipo desconocido: ${e.tipo}`; break; }
      if (!e.lado) { incoherente = `evento sin lado: ${e.tipo} ${e.minuto}'`; break; }
      if (PUNTOS[tipo]) {
        acum[e.lado] += PUNTOS[tipo];
        if (e.marcador && (e.marcador[0] !== acum.local || e.marcador[1] !== acum.visitante)) {
          incoherente = `marcador acumulado no cierra en ${e.tipo} ${e.minuto}' (web ${e.marcador.join('-')}, calculado ${acum.local}-${acum.visitante})`;
          break;
        }
      }
      const lado = e.lado === 'local' ? 'home' : 'away';
      const club = lado === 'home' ? par.homeClubId : par.awayClubId;
      let playerId = null;
      if (e.jugador) {
        const hallados = porClub.get(club)?.get(clave(e.jugador));
        if (hallados?.size === 1) { playerId = [...hallados][0]; cuenta.jugadorResuelto++; }
        else if (hallados?.size > 1) cuenta.jugadorAmbiguo++;
        else cuenta.jugadorSinResolver++;
      } else cuenta.sinJugador++;
      filas.push({
        match_id: par.matchId,
        club_id: club,
        player_id: playerId,
        player_name: e.jugador ?? null,
        event_type: tipo,
        minute: e.minuto,
        details: {
          team: lado,
          order: orden++,
          period: periodo,
          detail: null,
          playerId,
          playerName: e.jugador ?? null,
          source: 'rugbychampagne',
          sourceMatchId: p.id,
        },
      });
    }

    // El total de las jugadas tiene que dar el marcador final del sitio.
    if (!incoherente && (acum.local !== p.marcador[0] || acum.visitante !== p.marcador[1])) {
      incoherente = `los puntos suman ${acum.local}-${acum.visitante} y el marcador es ${p.marcador.join('-')}`;
    }
    if (incoherente) { omitir('cronología incoherente', { detalle: incoherente }); continue; }

    for (const f of filas) cuenta.porTipo[f.event_type] = (cuenta.porTipo[f.event_type] ?? 0) + 1;
    plan.partidos.push({ sitioId: p.id, matchId: par.matchId, ronda: p.ronda, local: p.local, visitante: p.visitante, marcador: p.marcador, eventos: filas.length });
    plan.filas.push(...filas);
  }

  plan.resumen = {
    partidosACargar: plan.partidos.length,
    eventosACargar: plan.filas.length,
    omitidos: plan.omitidos.length,
    omitidosPorMotivo: plan.omitidos.reduce((a, o) => ({ ...a, [o.motivo]: (a[o.motivo] ?? 0) + 1 }), {}),
    ...cuenta,
  };
  writeFileSync(join(AQUI, 'extract', 'load-plan.json'), JSON.stringify(plan, null, 1));
  console.log(JSON.stringify(plan.resumen, null, 2));
}

await main();
