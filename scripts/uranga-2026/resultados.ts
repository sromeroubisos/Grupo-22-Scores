/**
 * Resultados de las copas del Uranga 2026 (domingo 25/10), leídos a mano de la lona del
 * cuadro de la fase final que filmó @rugbyclick (se ven los cuartos y las semis escritos).
 *
 *   npx tsx scripts/uranga-2026/resultados.ts --plan
 *   npx tsx scripts/uranga-2026/resultados.ts --execute
 *
 * El avance de la llave lo escribe `resolveMatchAdvancement`, el mismo que usa el gestor:
 * se corre etapa por etapa (resultados de cuartos → avance → resultados de semis → avance),
 * porque resolver un cuarto con una semi ya jugada la reiniciaría.
 *
 * Dos marcadores NO se leen en la lona y NO se inventaron: Uni Salta vs Aranduroga Negro
 * (cuartos de Plata) y Rowing vs Charoga (semi de Cristal). Se ve quién ganó (por la ronda
 * siguiente), así que el ganador se pone a mano en el cruce que sigue y el partido queda sin
 * resultado hasta que haya marcador. Los dos 7-7 (semi de Bronce y cuartos de Cristal) se
 * definieron por drops: `score.winner` es el fallo explícito que lee el motor.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SLUG = 'torneo-juvenil-m15-eduardo-uranga';
const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

type R = { codigo: string; home: number; away: number; winner?: 'home' | 'away' };

/** Marcadores por etapa. `home`/`away` siguen el orden del cruce cargado (ver datos.mjs). */
const CUARTOS: R[] = [
  { codigo: 'ORO-C1', home: 0, away: 7 }, { codigo: 'ORO-C2', home: 12, away: 0 },
  { codigo: 'ORO-C3', home: 10, away: 0 }, { codigo: 'ORO-C4', home: 17, away: 0 },
  { codigo: 'PLATA-C1', home: 21, away: 0 }, { codigo: 'PLATA-C2', home: 22, away: 0 }, { codigo: 'PLATA-C3', home: 10, away: 7 },
  { codigo: 'BRONCE-C1', home: 17, away: 5 }, { codigo: 'BRONCE-C2', home: 7, away: 17 },
  { codigo: 'BRONCE-C3', home: 7, away: 0 }, { codigo: 'BRONCE-C4', home: 0, away: 10 },
  { codigo: 'CRISTAL-C1', home: 0, away: 14 }, { codigo: 'CRISTAL-C2', home: 7, away: 7, winner: 'away' },
  { codigo: 'CRISTAL-C3', home: 19, away: 0 }, { codigo: 'CRISTAL-C4', home: 5, away: 18 },
];
const SEMIS: R[] = [
  { codigo: 'ORO-S1', home: 3, away: 17 }, { codigo: 'ORO-S2', home: 7, away: 0 },
  { codigo: 'PLATA-S1', home: 0, away: 17 },
  { codigo: 'BRONCE-S1', home: 7, away: 7, winner: 'home' }, { codigo: 'BRONCE-S2', home: 7, away: 19 },
  { codigo: 'CRISTAL-S1', home: 7, away: 0 },
];
/** Finales jugadas. Oro: Jockey Salta Rojo 19 – Taraguy 3 (el campeón es el de la final de Oro). */
const FINALES: R[] = [{ codigo: 'ORO-F', home: 19, away: 3 }];
/** Ganadores sin marcador legible: [partido que se completa a mano, lado, equipo (ficha)]. */
const A_MANO: Array<[string, 'home' | 'away', string]> = [
  ['PLATA-S2', 'away', 'universitario-de-salta-m15'],   // ganó los cuartos 4 de Plata, marcador ilegible
  ['CRISTAL-F', 'away', 'parana-rowing-m15'],            // ganó la semi 2 de Cristal, marcador ilegible
  // Se ve a Teque contra "SLT" en la transmisión de la final de Plata: ganó la semi 2 (marcador desconocido).
  ['PLATA-F', 'away', 'santiago-lawn-tennis-m15-rojo'],
];
/** Horarios que el cuadro impreso cambió respecto de la placa (hora local de Paraná). */
const HORARIOS: Record<string, string> = { 'ORO-F': '17:30', 'PLATA-S2': '15:30', 'PLATA-F': '17:00', 'BRONCE-F': '16:00' };

const instante = (hora: string) => new Date(`2026-10-25T${hora}:00-03:00`).toISOString();

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { resolveMatchAdvancement } = await import('@/lib/server/resolveMatchAdvancement');
  const sb = createAdminClient();

  const { data: t } = await sb.from('tournaments').select('id').eq('slug', SLUG).maybeSingle();
  if (!t) throw new Error('el torneo no existe');
  // Una fase de playoff por copa (Oro, Plata, Bronce, Cristal).
  const { data: fases } = await sb.from('tournament_phases').select('id').eq('tournament_id', t.id).eq('phase_type', 'playoff');
  if (!fases?.length) throw new Error('faltan las fases de copas');
  const { data: ms } = await sb.from('matches').select('id, bracket_match_code, home_club_id, away_club_id').in('phase_id', fases.map((f: any) => f.id));
  const porCodigo = new Map((ms ?? []).map((m: any) => [m.bracket_match_code as string, m]));
  for (const r of [...CUARTOS, ...SEMIS]) if (!porCodigo.has(r.codigo)) throw new Error(`no existe el partido ${r.codigo}`);
  console.log(`modo: ${modo} · ${CUARTOS.length} cuartos + ${SEMIS.length} semis con resultado · ${A_MANO.length} ganadores a mano · ${Object.keys(HORARIOS).length} horarios`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  const cargar = async (etapa: R[]) => {
    for (const r of etapa) {
      const m = porCodigo.get(r.codigo);
      const score: Record<string, unknown> = { home: r.home, away: r.away };
      if (r.winner) { score.winner = r.winner; score.tiebreak = 'drops'; }
      const { error } = await sb.from('matches').update({ status: 'final', score, updated_at: new Date().toISOString() }).eq('id', m.id);
      if (error) throw new Error(`${r.codigo}: ${error.message}`);
    }
  };
  const avanzar = async (etapa: R[]) => {
    for (const r of etapa) {
      const res = await resolveMatchAdvancement(sb as any, porCodigo.get(r.codigo).id);
      if (!res.ok || res.warnings.length) console.log(`  ${r.codigo}: ok=${res.ok} ${res.warnings.join(' | ')} ${res.error ?? ''}`);
    }
  };

  await cargar(CUARTOS); await avanzar(CUARTOS);
  console.log('✓ cuartos cargados y avance a semis');
  for (const [codigo, lado, ficha] of A_MANO.filter(([c]) => c.endsWith('-S2'))) await ponerAMano(sb, porCodigo.get(codigo).id, lado, ficha);
  await cargar(SEMIS); await avanzar(SEMIS);
  console.log('✓ semis cargadas y avance a finales');
  for (const [codigo, lado, ficha] of A_MANO.filter(([c]) => c.endsWith('-F'))) await ponerAMano(sb, porCodigo.get(codigo).id, lado, ficha);
  await cargar(FINALES);
  // El campeón del torneo es el de la final de Copa Oro.
  const final = FINALES.find((f) => f.codigo === 'ORO-F');
  if (final) {
    const m = porCodigo.get('ORO-F');
    const { data: fila } = await sb.from('matches').select('home_club_id, away_club_id').eq('id', m.id).single();
    const campeon = final.home > final.away ? fila.home_club_id : fila.away_club_id;
    const { error } = await sb.from('tournament_seasons').update({ champion_club_id: campeon, status: 'active' }).eq('tournament_id', t.id);
    if (error) throw new Error(`campeón: ${error.message}`);
    console.log(`✓ campeón del torneo: ${campeon}`);
  }
  for (const [codigo, hora] of Object.entries(HORARIOS)) {
    const { error } = await sb.from('matches').update({ date_time: instante(hora) }).eq('id', porCodigo.get(codigo).id);
    if (error) throw new Error(`${codigo}: ${error.message}`);
  }
  console.log('✓ ganadores a mano y horarios corregidos');
}

/** Pone un equipo en un lado de un cruce y lo hace visible si ya están los dos. */
async function ponerAMano(sb: any, matchId: string, lado: 'home' | 'away', ficha: string) {
  const col = lado === 'home' ? 'home_club_id' : 'away_club_id';
  const { error } = await sb.from('matches').update({ [col]: ficha }).eq('id', matchId);
  if (error) throw new Error(`${matchId}: ${error.message}`);
  const { data: m } = await sb.from('matches').select('home_club_id, away_club_id').eq('id', matchId).single();
  if (m.home_club_id && m.away_club_id) await sb.from('matches').update({ is_visible: true }).eq('id', matchId);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
