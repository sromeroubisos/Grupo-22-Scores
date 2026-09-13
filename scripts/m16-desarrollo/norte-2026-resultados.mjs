/**
 * Carga los resultados de la jornada 2 del M16 Desarrollo Norte 2026 que están
 * en `RESULTADOS_J2` (`norte-2026-datos.mjs`) y hace avanzar el cuadro.
 *
 *   npx tsx scripts/m16-desarrollo/norte-2026-resultados.mjs --plan
 *   npx tsx scripts/m16-desarrollo/norte-2026-resultados.mjs --execute
 *
 * Corre con tsx y no con node: usa el MISMO avance que el gestor
 * (`syncBracketAdvancement`, el botón "Sincronizar llaves") y el mismo
 * recálculo de tabla, que son TypeScript con alias `@/`. Un resultado escrito
 * por PostgREST no dispara el avance solo: sin este paso las finales se
 * quedarían con "TBD".
 *
 * Va en dos pasadas porque el avance RESETEA una definición que ya tenía
 * resultado si le cambia un equipo: primero las semis y el avance, después
 * las definiciones. Y se frena si el avance no da los cruces que escribió la
 * pizarra (`DEFINICIONES_PUBLICADAS`).
 *
 * Idempotente: un partido que ya está final con ese marcador no se toca. Para
 * sumar resultados se agregan a `RESULTADOS_J2` y se vuelve a correr.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import {
  COPAS, DEFINICIONES_PUBLICADAS, RESULTADOS_J2, SEMIS_PUBLICADAS, TEMPORADA, TORNEO_SLUG,
} from './norte-2026-datos.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const partidosCanon = COPAS.flatMap((c) => c.partidos);
const semis = partidosCanon.filter((p) => p.local.zona).map((p) => p.n);
const definiciones = partidosCanon.filter((p) => p.local.de).map((p) => p.n);
const numero = (codigo) => Number(String(codigo).replace(/^P/, ''));

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { syncBracketAdvancement } = await import('@/lib/server/playoffBracket');
  const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
  const supabase = createAdminClient();

  const falla = (e, que) => { if (e) throw new Error(`${que}: ${e.message}`); };

  const { data: torneo, error: e1 } = await supabase.from('tournaments').select('id, name').eq('slug', TORNEO_SLUG).single();
  falla(e1, 'torneo');
  const { data: temporada, error: e2 } = await supabase.from('tournament_seasons')
    .select('id').eq('tournament_id', torneo.id).eq('season_code', TEMPORADA).single();
  falla(e2, `temporada ${TEMPORADA}`);
  const { data: fases, error: e3 } = await supabase.from('tournament_phases')
    .select('id, name, phase_type').eq('season_id', temporada.id).order('order_index');
  falla(e3, 'fases');
  const copas = fases.filter((f) => f.phase_type === 'playoff');

  const { data: clubes } = await supabase.from('clubs').select('id, name')
    .in('id', [...new Set(Object.values(DEFINICIONES_PUBLICADAS).flat())]);
  const nombre = new Map((clubes ?? []).map((c) => [c.id, c.name]));
  const nom = (id) => nombre.get(id) ?? id ?? 'TBD';

  async function partidos() {
    const { data, error } = await supabase.from('matches')
      .select('id, bracket_match_code, status, score, home_club_id, away_club_id, round_uuid, phase_id')
      .eq('season_id', temporada.id).not('bracket_match_code', 'is', null);
    falla(error, 'partidos');
    return new Map(data.map((m) => [numero(m.bracket_match_code), m]));
  }

  async function sincronizar() {
    for (const fase of copas) {
      const r = await syncBracketAdvancement(supabase, { phaseId: fase.id });
      if (!r.ok) throw new Error(`avance de ${fase.name}: ${r.error}`);
      console.log(`  ↳ avance ${fase.name}: ${r.synced} lugar(es) completado(s)${r.warnings?.length ? ` · ${r.warnings.join(' / ')}` : ''}`);
    }
  }

  /** Carga los resultados de una pasada. Devuelve cuántos escribió. */
  async function pasada(titulo, numeros, esperados) {
    const porNumero = await partidos();
    const conResultado = numeros.filter((n) => RESULTADOS_J2[n]);
    console.log(`\n${titulo}: ${conResultado.length} de ${numeros.length} con resultado`);
    let escritos = 0;
    for (const n of conResultado) {
      const m = porNumero.get(n);
      const [local, visitante] = RESULTADOS_J2[n];
      const [eLocal, eVisitante] = esperados[n];

      if (!m.home_club_id && !m.away_club_id && modo === 'plan') {
        console.log(`  P${n}: ${nom(eLocal)} ${local} - ${visitante} ${nom(eVisitante)}  (los equipos los pone el avance al ejecutar)`);
        continue;
      }
      if (m.home_club_id !== eLocal || m.away_club_id !== eVisitante) {
        throw new Error(`P${n}: en la base es ${nom(m.home_club_id)} v ${nom(m.away_club_id)} y la pizarra dice ${nom(eLocal)} v ${nom(eVisitante)}`);
      }
      const igual = m.status === 'final' && m.score?.home === local && m.score?.away === visitante;
      console.log(`  P${n}: ${nom(eLocal)} ${local} - ${visitante} ${nom(eVisitante)}${igual ? '  (ya estaba)' : ''}`);
      if (igual || modo === 'plan') continue;

      const { error } = await supabase.from('matches')
        .update({ status: 'final', score: { home: local, away: visitante }, updated_at: new Date().toISOString() })
        .eq('id', m.id);
      falla(error, `P${n}`);
      escritos += 1;
    }
    if (modo === 'execute') await sincronizar();
    return escritos;
  }

  console.log(`modo: ${modo} · ${torneo.name} ${TEMPORADA}`);
  const n1 = await pasada('Semifinales', semis, SEMIS_PUBLICADAS);
  const n2 = await pasada('Definiciones', definiciones, DEFINICIONES_PUBLICADAS);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  // ── Los cruces que dio el avance, contra la pizarra ──────────────────────
  const porNumero = await partidos();
  console.log('\nDefiniciones según el avance:');
  const distintas = [];
  for (const n of definiciones) {
    const m = porNumero.get(n);
    const [eLocal, eVisitante] = DEFINICIONES_PUBLICADAS[n];
    const ok = m.home_club_id === eLocal && m.away_club_id === eVisitante;
    if (!ok && (m.home_club_id || m.away_club_id)) distintas.push(n);
    console.log(`  ${ok ? '✓' : '·'} P${n}: ${nom(m.home_club_id)} v ${nom(m.away_club_id)}`);
  }
  if (distintas.length) throw new Error(`el avance no da la pizarra en ${distintas.map((n) => `P${n}`).join(', ')}`);

  // ── Rondas completas y campeón ───────────────────────────────────────────
  const porRonda = new Map();
  for (const m of porNumero.values()) {
    porRonda.set(m.round_uuid, [...(porRonda.get(m.round_uuid) ?? []), m]);
  }
  for (const [ronda, lista] of porRonda) {
    if (lista.every((m) => m.status === 'final')) {
      await supabase.from('tournament_rounds').update({ is_completed: true }).eq('id', ronda);
    }
  }

  const final = porNumero.get(24);
  if (final.status === 'final' && final.score?.home !== final.score?.away) {
    const campeon = final.score.home > final.score.away ? final.home_club_id : final.away_club_id;
    const { error } = await supabase.from('tournament_seasons').update({ champion_club_id: campeon }).eq('id', temporada.id);
    falla(error, 'campeón');
    console.log(`\n🏆 campeón ${TEMPORADA}: ${nom(campeon)}`);
  } else {
    console.log('\ncampeón: pendiente (falta la final de la Copa de Oro, P24)');
  }

  // ── Tabla persistida ─────────────────────────────────────────────────────
  for (const fase of fases) {
    const r = await recalculatePhaseStandingsScopes(torneo.id, fase.id, 'general', temporada.id);
    if (!r.ok) console.log(`  la tabla de ${fase.name} no se pudo recalcular`);
  }
  console.log(`\n✓ ${n1 + n2} resultado(s) nuevo(s) · avance sincronizado · tablas recalculadas`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nFALLÓ:', e instanceof Error ? e.message : e); process.exit(1); });
