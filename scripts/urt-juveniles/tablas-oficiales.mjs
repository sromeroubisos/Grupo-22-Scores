/**
 * Publica como tabla de cada fase la ÚLTIMA tabla oficial de la URT (la del
 * boletín), y deja la fase en modo `fully_manual` para que la página muestre
 * esa tabla y no la que recalcula con los partidos.
 *
 *   node scripts/urt-juveniles/tablas-oficiales.mjs --plan
 *   node scripts/urt-juveniles/tablas-oficiales.mjs --execute
 *
 * Por qué no alcanza con el motor: los boletines no publican resultados y cada
 * marcador sale de la diferencia entre dos tablas. Cuando en esa ventana un
 * equipo jugó DOS partidos (la primera tabla del Anual ya trae dos fechas; los
 * reprogramados caen junto con la fecha siguiente), los dos marcadores no se
 * pueden separar: hay muchas combinaciones que dan los mismos totales. Esos
 * partidos quedan "jugados sin marcador" y el motor no les puede dar puntos.
 * La tabla oficial, en cambio, está completa y es la fuente — a diferencia de
 * la del Dos Orillas, no tiene erratas que la contradigan.
 *
 * OJO: un recálculo del motor sobre estas fases (editar un partido desde el
 * gestor) pisa `tournament_standings`. Si pasa, se vuelve a correr esto.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fichaDe, torneoDe } from './datos.mjs';

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

const extract = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'urt-juveniles', 'extract', '2026.json'), 'utf8'));
const ahora = new Date().toISOString();

async function main() {
  let fases = 0; let filas = 0;
  for (const t of extract.standings) {
    // La "Copa de Plata" de Reserva M15 sale UNA vez (boletín 28), con 3 equipos
    // y Jockey B también en la de Oro: es una tabla mal rotulada de la fuente.
    if (t.division === 'M15R' && t.phase === 'Anual · Copa de Plata') continue;
    const { slug } = torneoDe(t.division);
    const [torneo] = await req('GET', `tournaments?select=id,current_season_id&slug=eq.${slug}`);
    if (!torneo) { console.log(`  falta el torneo ${slug}`); continue; }
    const [fase] = await req('GET', `tournament_phases?select=id,settings&season_id=eq.${torneo.current_season_id}&name=eq.${t.phase}`);
    if (!fase) { console.log(`  falta la fase ${slug} · ${t.phase}`); continue; }
    const entradas = new Map((await req('GET', `team_season_entries?select=id,club_id&season_id=eq.${torneo.current_season_id}`)).map((e) => [e.club_id, e.id]));
    const nombres = new Map((await req('GET', `clubs?select=id,name,logo_url&id=in.(${t.rows.map((r) => fichaDe(r.club, t.division).id).join(',')})`)).map((c) => [c.id, c]));

    const rows = t.rows.map((r, i) => {
      const id = fichaDe(r.club, t.division).id;
      const bonus = (r.bTry || 0) + (r.bTantos || 0) + (r.bDestrezas || 0);
      return {
        tournament_id: torneo.id, season_id: torneo.current_season_id, phase_id: fase.id, group_id: null,
        club_id: id, season_entry_id: entradas.get(id) ?? null, table_type: 'general',
        position: i + 1, played: r.pj, won: r.pg, drawn: r.pe, lost: r.pp, points: r.pts,
        scored: r.tf, conceded: r.tc, bonus_points: bonus, form: null, streak: null, last_updated: ahora,
        stats: {
          status: null, team_name: nombres.get(id)?.name ?? r.club, team_logo: nombres.get(id)?.logo_url ?? null,
          difference: r.tf - r.tc, table_type: 'general', adjustments: 0, tries_for: r.tryF, tries_against: r.tryC,
          bonus_offensive: r.bTry || 0, bonus_defensive: r.bTantos || 0, bonus_destrezas: r.bDestrezas || 0,
          fuente: `Tabla oficial URT, boletín Nº ${t.boletin} (${t.fecha})`, calculated_at: ahora,
        },
      };
    });
    fases++; filas += rows.length;
    console.log(`${slug.padEnd(26)} ${t.phase.padEnd(24)} boletín ${String(t.boletin).padStart(2)} · ${rows.length} filas · 1.° ${t.rows[0].club} ${t.rows[0].pts}`);
    if (modo === 'plan') continue;

    await req('DELETE', `tournament_standings?phase_id=eq.${fase.id}`);
    await req('POST', 'tournament_standings', rows);
    // El PATCH de la fase pisa settings entero: se parte del actual.
    const settings = { ...(fase.settings || {}) };
    settings.standings = { ...(settings.standings || {}), mode: 'fully_manual', editable: true,
      source: 'Tabla oficial de la URT (boletín semanal)' };
    await req('PATCH', `tournament_phases?id=eq.${fase.id}`, { settings });
  }
  console.log(`\n${fases} fases · ${filas} filas${modo === 'plan' ? ' (plan: no se escribió nada)' : ''}`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
