/**
 * Pasa las finales de los playoffs de la URBA 2026 a la semana del 7 de noviembre
 * y empuja a los ganadores de las semis ya jugadas a la llave de la final.
 *
 *   node src/scripts/urba-finales-7-nov.ts            informa, no escribe
 *   node src/scripts/urba-finales-7-nov.ts --execute  escribe
 *
 * Sólo toca finales SIN external_id (el lugar que dejó el cuadro): una final que
 * URBA ya publicó trae su fecha y manda ella. Conserva la hora de Buenos Aires y
 * cambia el día.
 */
import fs from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { resolveMatchAdvancement } from '../lib/server/resolveMatchAdvancement.ts';

/** Lo mismo que `syncBracketAdvancement`, que no se puede importar acá (usa el alias `@/`). */
async function avanzarFase(phaseId: string): Promise<{ synced: number; warnings: string[] }> {
  const { data: bm } = await supabase.from('matches').select('id, status, round_uuid')
    .eq('phase_id', phaseId).not('bracket_match_code', 'is', null);
  const { data: rs } = await supabase.from('tournament_rounds').select('id, order_index').eq('phase_id', phaseId);
  const orden = new Map<string, number>((rs ?? []).map((r: any) => [r.id, Number(r.order_index ?? 0)]));
  const finales = (bm ?? []).filter((m: any) => m.status === 'final')
    .sort((a: any, b: any) => (orden.get(a.round_uuid) ?? 0) - (orden.get(b.round_uuid) ?? 0));
  let synced = 0;
  const warnings: string[] = [];
  for (const m of finales) {
    const r = await resolveMatchAdvancement(supabase, m.id, { warnings });
    if (!r.ok) throw new Error(r.error ?? 'no se pudo avanzar');
    synced += r.changed;
  }
  return { synced, warnings };
}

const DIA = '2026-11-07';
const ejecutar = process.argv.includes('--execute');

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) as any;

const horaBA = (iso: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));

const { data: torneos } = await supabase.from('tournaments').select('id, name')
  .like('external_id', 'urba:%').eq('season_id', '2026');
const nombre = new Map<string, string>((torneos ?? []).map((t: any) => [t.id, t.name]));
const { data: fases } = await supabase.from('tournament_phases').select('id, tournament_id')
  .eq('phase_type', 'playoff').in('tournament_id', [...nombre.keys()]);

let movidas = 0;
let avanzadas = 0;
for (const f of fases ?? []) {
  const { data: ms } = await supabase.from('matches')
    .select('id, status, date_time, external_id, bracket_match_code, round_label')
    .eq('phase_id', f.id).is('external_id', null).eq('status', 'scheduled')
    .or('bracket_match_code.eq.M-F,round_label.ilike.final');
  for (const m of ms ?? []) {
    const hora = horaBA(m.date_time);
    const nuevo = new Date(`${DIA}T${hora}:00-03:00`).toISOString();
    if (nuevo === new Date(m.date_time).toISOString()) continue;
    console.log(`${nombre.get(f.tournament_id)}: final ${m.date_time.slice(0, 16)} -> ${nuevo.slice(0, 16)} (${hora} BA)`);
    movidas++;
    if (!ejecutar) continue;
    let { error } = await supabase.from('matches').update({ date_time: nuevo, scheduling_status: 'manual' }).eq('id', m.id);
    if (error) ({ error } = await supabase.from('matches').update({ date_time: nuevo }).eq('id', m.id));
    if (error) console.error('  falló:', error.message);
  }
  if (ejecutar) {
    try {
      const res = await avanzarFase(f.id);
      if (res.synced) { avanzadas += res.synced; console.log(`${nombre.get(f.tournament_id)}: ${res.synced} casilleros del cuadro`, res.warnings.length ? res.warnings : ''); }
    } catch (e) { console.error(`${nombre.get(f.tournament_id)}: avance falló: ${e instanceof Error ? e.message : e}`); }
  }
}
console.log(`\n${ejecutar ? 'Escrito' : 'En seco'}: ${movidas} finales a ${DIA}${ejecutar ? `, ${avanzadas} casilleros avanzados` : ''}.`);
