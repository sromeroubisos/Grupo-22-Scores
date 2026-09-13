/**
 * Relee la base y compara el M16 Desarrollo Norte 2026 contra el canon: la
 * tabla PERSISTIDA de cada zona contra la publicada tras la jornada 1, los
 * cruces de las semis, las reglas de avance, y el cuadro de honor completo de
 * la competencia (Nacional 2016-2022, Sur y Norte desde 2023).
 *
 *   node scripts/m16-desarrollo/norte-2026-verificar.mjs
 *
 * Sólo lee. Sale con código 1 si algo no coincide.
 */
import fs from 'node:fs';
import path from 'node:path';

import { TORNEOS } from './datos.mjs';
import {
  COPAS, DEFINICIONES_PUBLICADAS, JORNADA_1, RESULTADOS_J2, SEMIS_PUBLICADAS, TABLA_J1, TEMPORADA, TORNEO_SLUG, ZONAS,
} from './norte-2026-datos.mjs';

const REPO = process.cwd();
const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
async function leer(recurso) {
  const res = await fetch(encodeURI(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const fallas = [];
const chequear = (ok, texto) => { console.log(`${ok ? '✓' : '✗'} ${texto}`); if (!ok) fallas.push(texto); };

async function main() {
  const [torneo] = await leer(`tournaments?select=id,current_season_id,format&slug=eq.${TORNEO_SLUG}`);
  const [temporada] = await leer(`tournament_seasons?select=id,status,is_active&tournament_id=eq.${torneo.id}&season_code=eq.${TEMPORADA}`);
  chequear(Boolean(temporada), `existe la temporada ${TEMPORADA}`);
  if (!temporada) return;
  chequear(torneo.current_season_id === temporada.id && temporada.is_active, `${TEMPORADA} es la temporada actual y activa`);

  const fases = await leer(`tournament_phases?select=id,name,phase_type,order_index,is_active&season_id=eq.${temporada.id}&order=order_index`);
  chequear(fases.map((f) => f.name).join() === 'Fase de Zonas,Copa de Bronce,Copa de Plata,Copa de Oro', `fases: ${fases.map((f) => f.name).join(' · ')}`);
  const faseZonas = fases.find((f) => f.phase_type === 'group_stage');

  // ── Tabla persistida vs publicada ─────────────────────────────────────────
  const grupos = await leer(`tournament_groups?select=id,name&phase_id=eq.${faseZonas.id}`);
  const filas = await leer(`tournament_standings?select=club_id,group_id,position,points,played&phase_id=eq.${faseZonas.id}&order=position`);
  for (const zona of ZONAS) {
    const grupo = grupos.find((g) => g.name === zona.nombre);
    const tabla = filas.filter((f) => f.group_id === grupo?.id).sort((a, b) => a.position - b.position);
    const publicada = TABLA_J1[zona.clave].map((f) => `${f.club} ${f.pts}`).join(' | ');
    const persistida = tabla.map((f) => `${f.club_id} ${f.points}`).join(' | ');
    chequear(publicada === persistida, `${zona.nombre}: ${persistida}`);
  }

  // ── Partidos ──────────────────────────────────────────────────────────────
  const partidos = await leer(`matches?select=id,phase_id,status,score,home_club_id,away_club_id,bracket_match_code,is_visible&season_id=eq.${temporada.id}`);
  const finales = partidos.filter((p) => p.phase_id === faseZonas.id && p.status === 'final');
  chequear(finales.length === JORNADA_1.length, `jornada 1: ${finales.length} de ${JORNADA_1.length} partidos con resultado`);
  const porCodigo = new Map(partidos.filter((p) => p.bracket_match_code).map((p) => [p.bracket_match_code, p]));
  for (const [n, [local, visitante]] of Object.entries(SEMIS_PUBLICADAS)) {
    const p = porCodigo.get(`P${n}`);
    chequear(p?.home_club_id === local && p?.away_club_id === visitante && p?.is_visible, `P${n}: ${p?.home_club_id} v ${p?.away_club_id}`);
  }
  // Una definición está vacía hasta que se juegan sus semis; con equipos, son
  // los de la pizarra.
  const definiciones = COPAS.flatMap((c) => c.partidos.filter((p) => p.local.de));
  for (const d of definiciones) {
    const p = porCodigo.get(`P${d.n}`);
    const vacia = !p?.home_club_id && !p?.away_club_id;
    const [local, visitante] = DEFINICIONES_PUBLICADAS[d.n];
    chequear(vacia || (p.home_club_id === local && p.away_club_id === visitante && p.is_visible),
      `P${d.n}: ${vacia ? 'espera a sus semis' : `${p.home_club_id} v ${p.away_club_id}`}`);
  }
  for (const [n, [local, visitante]] of Object.entries(RESULTADOS_J2)) {
    const p = porCodigo.get(`P${n}`);
    chequear(p?.status === 'final' && p.score?.home === local && p.score?.away === visitante, `P${n}: ${p?.score?.home}-${p?.score?.away}`);
  }

  const reglas = await leer(`tournament_match_advancement_rules?select=id&phase_id=in.(${fases.map((f) => f.id).join(',')})`);
  chequear(reglas.length === definiciones.length * 2, `${reglas.length} reglas de avance`);

  // ── Cuadro de honor ───────────────────────────────────────────────────────
  const esperado = new Map(TORNEOS.map((t) => [t.slug, [...t.palmares, ...(t.conFixture ? [{ anio: t.seasonActual, campeon: 'chubut-m16' }] : [])]]));
  for (const [slug, palmares] of esperado) {
    const [t] = await leer(`tournaments?select=id&slug=eq.${slug}`);
    const temporadas = await leer(`tournament_seasons?select=season_code,champion_club_id&tournament_id=eq.${t.id}&champion_club_id=not.is.null&order=season_code`);
    const base = temporadas.map((s) => `${s.season_code} ${s.champion_club_id}`).join(' · ');
    const canon = palmares.map((p) => `${p.anio} ${p.campeon}`).join(' · ');
    chequear(base === canon, `${slug}: ${base}`);
  }

  console.log(fallas.length ? `\n${fallas.length} diferencia(s).` : '\nTodo coincide con el canon.');
  if (fallas.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
