/**
 * Corrige dos torneos que YA estaban en la base con lo que dice la planilla
 * oficial de la Unión Cordobesa: Regional Centro "A" y Súper 9 "B" (Primera).
 *
 *   node scripts/cordoba-torneos/corregir.mjs --plan
 *   node scripts/cordoba-torneos/corregir.mjs --execute
 *
 * - Cada partido se empareja por (local, visitante) y la fecha más cercana. Se
 *   corrige el marcador que no coincide o que faltaba.
 * - Regional "A": los marcadores de prensa y los 3 que nadie había publicado se
 *   reemplazan por los oficiales. La tabla NO se toca acá: el motor la rehace
 *   (npx tsx src/scripts/arusa-recalcular.ts --torneo=regional-centro-a), porque
 *   la tabla oficial cuenta la final dentro de la fase regular y la base la
 *   tiene en otra fase.
 * - Súper 9 "B": se corrigen los marcadores y se publica la tabla oficial de la
 *   Unión (`fully_manual`); las bandas por puesto no se tocan.
 */
import fs from 'node:fs';
import path from 'node:path';

import { EXISTENTES, leerPartidos, leerTabla } from './datos.mjs';

const REPO = process.cwd();
const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const req = async (metodo, recurso, cuerpo) => {
  const res = await fetch(encodeURI(`${U}/rest/v1/${recurso}`), {
    method: metodo, headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? [] : res.json();
};

const puntosBase = (a, b) => (a > b ? 4 : a === b ? 2 : 0);
const bonusDef = (a, b) => (a < b && b - a <= 7 ? 1 : 0);
const ahora = new Date().toISOString();
const NOTA = 'Marcador de la planilla oficial de la Unión Cordobesa.';

async function corregirPartidos(e, torneo) {
  const hojas = leerPartidos(e);
  const base = await req('GET', `matches?select=id,home_club_id,away_club_id,date_time,status,score,notes&tournament_id=eq.${torneo.id}&limit=1000`);
  const usados = new Set();
  const cambios = [];
  for (const p of hojas) {
    const jugado = p.estado === 'final' || p.estado === 'walkover';
    const cand = base.filter((b) => !usados.has(b.id) && ((b.home_club_id === p.local.madre && b.away_club_id === p.visitante.madre) || (b.home_club_id === p.visitante.madre && b.away_club_id === p.local.madre)));
    if (!cand.length) throw new Error(`${e.clave}: el partido ${p.local.madre} v ${p.visitante.madre} (${p.fecha}) no está en la base`);
    const b = cand.sort((x, y) => Math.abs(new Date(x.date_time) - new Date(p.fecha)) - Math.abs(new Date(y.date_time) - new Date(p.fecha)))[0];
    usados.add(b.id);
    const invertido = b.home_club_id !== p.local.madre;
    const nuevo = jugado ? (invertido ? { home: p.as, away: p.hs } : { home: p.hs, away: p.as }) : null;
    const igual = jugado ? (b.score && b.score.home === nuevo.home && b.score.away === nuevo.away && b.status === 'final') : b.status === 'scheduled';
    if (!igual && jugado) cambios.push({ id: b.id, p, nuevo, antes: b.score ? `${b.score.home}-${b.score.away}` : 'sin marcador' });
  }
  return cambios;
}

async function main() {
  console.log(`modo: ${modo}\n`);
  for (const e of EXISTENTES) {
    const [torneo] = await req('GET', `tournaments?select=id,name,current_season_id&slug=eq.${e.slug}`);
    if (!torneo) throw new Error(`falta el torneo ${e.slug}`);
    const cambios = await corregirPartidos(e, torneo);
    console.log(`${torneo.name}: ${cambios.length} marcadores a corregir`);
    for (const c of cambios) console.log(`  ${c.p.ronda.padEnd(9)} ${c.p.local.madre} ${c.p.hs}-${c.p.as} ${c.p.visitante.madre}   (base: ${c.antes})`);
    if (modo === 'plan') continue;

    for (const c of cambios) {
      const l = c.nuevo.home; const v = c.nuevo.away;
      const patch = { status: 'final', score: c.nuevo, notes: NOTA, updated_at: ahora };
      if (e.slug === 'regional-centro-a') {
        Object.assign(patch, {
          home_base_points: puntosBase(l, v), away_base_points: puntosBase(v, l),
          home_bonus_points: bonusDef(l, v), away_bonus_points: bonusDef(v, l),
          points_autocalculated: false,
          points_override_reason: 'La planilla oficial no trae tries por partido: el bonus ofensivo no se reconstruye. El defensivo sale del marcador.',
        });
      }
      await req('PATCH', `matches?id=eq.${c.id}`, patch);
    }
    console.log(`  ✓ ${cambios.length} partidos corregidos`);

    if (e.slug === 'super-9-b') {
      const tabla = leerTabla(e);
      const [fase] = await req('GET', `tournament_phases?select=id,settings&season_id=eq.${torneo.current_season_id}&phase_type=eq.league&limit=1`);
      const entradas = new Map((await req('GET', `team_season_entries?select=id,club_id&season_id=eq.${torneo.current_season_id}`)).map((x) => [x.club_id, x.id]));
      const clubes = new Map((await req('GET', `clubs?select=id,name,logo_url&id=in.(${tabla.map((r) => r.club.madre).join(',')})`)).map((c) => [c.id, c]));
      const filas = tabla.map((r, i) => {
        const id = r.club.madre; const ofensivo = r.pts - 4 * r.pg - 2 * r.pe - r.bTantos;
        return {
          tournament_id: torneo.id, season_id: torneo.current_season_id, phase_id: fase.id, group_id: null, club_id: id, season_entry_id: entradas.get(id) ?? null,
          table_type: 'general', position: i + 1, played: r.pj, won: r.pg, drawn: r.pe, lost: r.pp, points: r.pts, scored: r.tf, conceded: r.tc,
          bonus_points: ofensivo + r.bTantos, form: null, streak: null, last_updated: ahora,
          stats: { status: null, team_name: clubes.get(id)?.name ?? id, team_logo: clubes.get(id)?.logo_url ?? null, difference: r.tf - r.tc, table_type: 'general', adjustments: 0,
            tries_for: r.tryF, tries_against: r.tryC, bonus_offensive: ofensivo, bonus_defensive: r.bTantos, bonus_destrezas: 0,
            fuente: 'Tabla oficial de la Unión Cordobesa de Rugby (bonus ofensivo despejado de los puntos)', calculated_at: ahora },
        };
      });
      await req('DELETE', `tournament_standings?phase_id=eq.${fase.id}`);
      await req('POST', 'tournament_standings', filas);
      const settings = { ...(fase.settings || {}), standings: { ...((fase.settings || {}).standings || {}), mode: 'fully_manual', editable: true, source: 'Tabla oficial de la Unión Cordobesa de Rugby' } };
      await req('PATCH', `tournament_phases?id=eq.${fase.id}`, { settings });
      console.log(`  ✓ tabla oficial: ${filas.length} filas (fully_manual)`);
    }
  }
  if (modo === 'plan') console.log('\nmodo --plan: no se escribió nada.');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
