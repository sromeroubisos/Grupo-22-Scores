/**
 * Relee la base y la compara contra el canon del M16 Desarrollo. Sólo lectura.
 *
 *   node scripts/m16-desarrollo/verificar.mjs
 *
 * Lo que mira, en este orden: que estén los nueve clubes con su escudo, que
 * estén los cuatro torneos con todas sus temporadas y su campeón, que los seis
 * partidos de 2026 tengan el resultado del parte, y —lo que más falla en
 * silencio— que la TABLA persistida diga lo que publicó la unión.
 *
 * La tabla es el chequeo que importa: un participante sin fila en
 * `tournament_phase_participants` deja el torneo entero visible y la tabla
 * vacía, y `recalculatePhaseStandingsScopes` devuelve `ok: true` con
 * `rows_calculated: 0` sin quejarse.
 */
import fs from 'node:fs';
import path from 'node:path';

import { CAMPEON_2026, CLUBES, PARTIDOS, TABLA_2026, TORNEOS } from './datos.mjs';

const REPO = process.cwd();

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function leer(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

let fallas = 0;
const ok = (texto) => console.log(`  ✓ ${texto}`);
const mal = (texto) => { fallas += 1; console.log(`  ✗ ${texto}`); };

async function main() {
  // ── Clubes ───────────────────────────────────────────────────────────────
  console.log('clubes');
  const ids = CLUBES.map((c) => c.id);
  const enBase = await leer(`clubs?select=id,name,union_id,logo_url,sport_id,is_visible&id=in.(${ids.join(',')})`);
  const porId = new Map(enBase.map((c) => [c.id, c]));
  for (const c of CLUBES) {
    const fila = porId.get(c.id);
    if (!fila) { mal(`${c.id}: no está en la base`); continue; }
    const archivo = path.join(REPO, 'public', 'clubs', `${c.id}.png`);
    if (fila.name !== c.name) mal(`${c.id}: se llama "${fila.name}" y el canon dice "${c.name}"`);
    else if ((fila.union_id ?? null) !== c.union_id) mal(`${c.id}: unión "${fila.union_id}" ≠ "${c.union_id}"`);
    else if (fila.sport_id !== 'rugby') mal(`${c.id}: deporte "${fila.sport_id}"`);
    else if (!fila.is_visible) mal(`${c.id}: invisible`);
    else if (!fs.existsSync(archivo)) mal(`${c.id}: falta el archivo public/clubs/${c.id}.png`);
    else ok(`${c.name.padEnd(22)} ${c.union_id ?? '— sin unión —'}`);
  }

  // ── Torneos y palmarés ───────────────────────────────────────────────────
  const slugs = TORNEOS.map((t) => t.slug);
  const torneos = await leer(`tournaments?select=id,name,slug,age_grade,sport_id,status,is_active,current_season_id&slug=in.(${slugs.join(',')})`);
  const torneoPorSlug = new Map(torneos.map((t) => [t.slug, t]));

  let idSur = null;
  for (const t of TORNEOS) {
    console.log(`\n${t.nombre}`);
    const fila = torneoPorSlug.get(t.slug);
    if (!fila) { mal('no está en la base'); continue; }
    if (t.conFixture) idSur = fila.id;
    if (fila.age_grade !== 'M16') mal(`age_grade "${fila.age_grade}"`);
    if (fila.sport_id !== 'rugby') mal(`deporte "${fila.sport_id}"`);
    if (fila.status !== 'published' || !fila.is_active) mal(`invisible para el anónimo (status ${fila.status}, is_active ${fila.is_active})`);
    if (!fila.current_season_id) mal('sin temporada actual');

    const temporadas = await leer(`tournament_seasons?select=season_code,champion_club_id,is_active&tournament_id=eq.${fila.id}&order=season_code`);
    const esperadas = t.palmares.map((p) => ({ anio: p.anio, campeon: p.campeon }));
    if (t.conFixture) esperadas.push({ anio: t.seasonActual, campeon: CAMPEON_2026 });
    if (temporadas.length !== esperadas.length) mal(`${temporadas.length} temporadas y el canon tiene ${esperadas.length}`);
    for (const e of esperadas) {
      const s = temporadas.find((x) => x.season_code === e.anio);
      if (!s) mal(`falta la temporada ${e.anio}`);
      else if (s.champion_club_id !== e.campeon) mal(`${e.anio}: campeón "${s.champion_club_id}" ≠ "${e.campeon}"`);
      else ok(`${e.anio} · ${e.campeon}`);
    }
  }

  // ── Fixture y tabla de 2026 ──────────────────────────────────────────────
  if (idSur) {
    console.log('\nfixture 2026');
    const partidos = await leer(`matches?select=home_club_id,away_club_id,score,status,round_label,venue,home_base_points,away_base_points,home_bonus_points,away_bonus_points&tournament_id=eq.${idSur}&order=date_time`);
    if (partidos.length !== PARTIDOS.length) mal(`${partidos.length} partidos y el canon tiene ${PARTIDOS.length}`);
    for (const p of PARTIDOS) {
      const m = partidos.find((x) => x.home_club_id === p.local && x.away_club_id === p.visitante);
      if (!m) { mal(`falta ${p.local} vs ${p.visitante}`); continue; }
      if (m.status !== 'final') mal(`${p.local} vs ${p.visitante}: estado "${m.status}"`);
      else if (m.score?.home !== p.ptsLocal || m.score?.away !== p.ptsVisitante) mal(`${p.local} vs ${p.visitante}: ${m.score?.home}-${m.score?.away} ≠ ${p.ptsLocal}-${p.ptsVisitante}`);
      else if (m.home_bonus_points !== p.bonusLocal || m.away_bonus_points !== p.bonusVisitante) mal(`${p.local} vs ${p.visitante}: bonus ${m.home_bonus_points}/${m.away_bonus_points} ≠ ${p.bonusLocal}/${p.bonusVisitante}`);
      else if (!m.venue) mal(`${p.local} vs ${p.visitante}: sin sede`);
      else ok(`${m.round_label} · ${p.local} ${p.ptsLocal}-${p.ptsVisitante} ${p.visitante}`);
    }

    console.log('\ntabla 2026');
    const tabla = await leer(`tournament_standings?select=club_id,position,played,won,lost,points&tournament_id=eq.${idSur}&order=position`);
    if (!tabla.length) mal('la tabla está VACÍA — falta correr `npx tsx src/scripts/arusa-recalcular.ts --torneo=m16-desarrollo-sur`');
    TABLA_2026.forEach((e, i) => {
      const fila = tabla.find((x) => x.club_id === e.club);
      if (!fila) { mal(`${e.club}: no está en la tabla`); return; }
      if (fila.position !== i + 1) mal(`${e.club}: ${fila.position}º y le toca ${i + 1}º`);
      else if (fila.played !== e.pj || fila.won !== e.pg || fila.lost !== e.pp) mal(`${e.club}: ${fila.played}/${fila.won}/${fila.lost} ≠ ${e.pj}/${e.pg}/${e.pp}`);
      else if (fila.points !== e.pts) mal(`${e.club}: ${fila.points} puntos ≠ ${e.pts}`);
      else ok(`${String(i + 1)}º ${e.club.padEnd(20)} ${e.pj} PJ · ${e.pg} PG · ${e.pts} pts`);
    });
  }

  console.log(fallas ? `\n${fallas} diferencia(s) contra el canon.` : '\nTodo coincide con el canon.');
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
