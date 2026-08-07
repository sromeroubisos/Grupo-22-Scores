/**
 * ¿Qué haría falta para que los playoffs dejen de ser torneos sueltos?
 *
 *   node src/scripts/urba-fases-medicion.ts
 *
 * Sólo mide. No escribe una fila.
 *
 * URBA publica la semifinal y la final de una división como TORNEOS con id
 * propio. En G22 tendrían que ser fases (`tournament_phases`) del torneo de la
 * temporada, para que aparezcan en el cuadro de playoff y no como ediciones
 * sueltas. Esto cuenta qué arrastra esa mudanza antes de escribir el script.
 */
import fs from 'node:fs';
import path from 'node:path';

import { instanciaDeTorneoUrba } from '../lib/integrations/urba/externalId.ts';
import { competitionKey } from '../lib/competitionKey.ts';

const REPO = process.cwd();
const env: Record<string, string> = { ...process.env as Record<string, string> };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de servicio');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function todas(recurso: string): Promise<any[]> {
  const out: any[] = [];
  for (let d = 0; ; d += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...H, range: `${d}-${d + 999}` } });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
    const f = await r.json() as any[];
    out.push(...f);
    if (f.length < 1000) return out;
  }
}
const contar = async (recurso: string) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${recurso}&limit=1`, { headers: { ...H, prefer: 'count=exact' } });
  return Number((r.headers.get('content-range') ?? '/0').split('/')[1]);
};
const enLotes = <T,>(xs: T[], n: number) => {
  const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out;
};

async function main() {
  const T = await todas('tournaments?select=id,external_id,name,season_id,category,subcategory,age_grade,gender,is_visible,status&union_id=eq.urba');
  console.log(`torneos de URBA: ${T.length}\n`);

  // Un torneo es una FASE cuando su nombre nombra una instancia de definición.
  const fases = T.filter((t) => instanciaDeTorneoUrba(t.name) !== null);
  console.log(`torneos que son una FASE: ${fases.length}`);

  // ── a qué torneo de temporada va cada uno ────────────────────────────────
  //
  // EL DESTINO SALE DEL NOMBRE, no de `competitionKey`. Fue el primer intento y
  // estaba mal: esa clave es (category, subcategory, age_grade, gender), que es
  // el grano correcto para "la misma división a través de los años" pero
  // demasiado grueso para "de qué torneo es fase esto". Mandaba
  // `Femenino - Seven - Clasificación` a `Femenino - Ten` y
  // `Universitario - Desarrollo - Clasificación` a `Universitario - Campeonato
  // - Revancha`, que son competencias DISTINTAS que comparten clave porque su
  // subcategory es null.
  //
  // Sacarle el sufijo de fase al nombre y buscar ese nombre exacto es literal y
  // no adivina: `Top 13 - Preintermedia B - Final` es fase de
  // `Top 13 - Preintermedia B` si y sólo si ese torneo existe.
  const normalizar = (s: string) => String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/^urba:\s*/, '')
    .replace(/["'`´’]/g, '')
    .replace(/\s+/g, ' ').trim();

  /** El nombre sin el sufijo de fase: `X - Semifinal` -> `X`. */
  const baseDelNombre = (nombre: string): string | null => {
    const n = normalizar(nombre);
    const m = n.match(/^(.*?)\s*[-–]\s*(play\s?-?\s?offs?|semi\s?-?\s?finals?|torneo\s+finals?\s*[a-z]?|finals?|(?:re)?clasificacion|ascensos?|permanencia)\s*$/);
    return m && m[1] ? m[1] : null;
  };

  const porNombre = new Map<string, any[]>();
  for (const t of T) {
    const k = `${t.season_id}|${normalizar(t.name)}`;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k)!.push(t);
  }

  // Todas las fases que comparten base y año son hermanas: la Clasificación de
  // ese grupo hace de temporada cuando no hay un torneo regular.
  const porBase = new Map<string, any[]>();
  for (const f of fases) {
    const base = baseDelNombre(f.name);
    if (!base) continue;
    const k = `${f.season_id}|${base}`;
    if (!porBase.has(k)) porBase.set(k, []);
    porBase.get(k)!.push(f);
  }

  const conDestino: Array<{ fase: any; destino: any; instancia: string; via: string }> = [];
  const sinDestino: Array<{ fase: any; clave: string }> = [];
  for (const f of fases) {
    const base = baseDelNombre(f.name);
    const clave = `${f.season_id}|${base ?? '(sin base)'}`;

    // 1. El torneo regular con ese nombre exacto.
    const regular = (base ? porNombre.get(clave) ?? [] : [])
      .find((h) => instanciaDeTorneoUrba(h.name) === null);
    if (regular) { conDestino.push({ fase: f, destino: regular, instancia: instanciaDeTorneoUrba(f.name)!, via: 'regular' }); continue; }

    // 2. Si no hay regular, la CLASIFICACIÓN de su mismo grupo: es la fase de
    //    grupos, o sea la temporada regular con otro nombre. Es la misma regla
    //    con la que los dos menús eligen a quién representa el año.
    const clasi = (porBase.get(clave) ?? []).find((h) => instanciaDeTorneoUrba(h.name) === 'Clasificación');
    if (clasi && clasi.id !== f.id) { conDestino.push({ fase: f, destino: clasi, instancia: instanciaDeTorneoUrba(f.name)!, via: 'clasificación' }); continue; }

    // La propia Clasificación que hace de temporada no se muda a ningún lado:
    // ya ES el torneo de la temporada.
    sinDestino.push({ fase: f, clave });
  }
  console.log(`  con torneo de temporada al que mudarse : ${conDestino.length}`);
  console.log(`  SIN torneo de temporada (todo son fases): ${sinDestino.length}`);

  console.log('\n── los que tienen destino ──');
  for (const c of conDestino) {
    console.log(`  ${c.fase.season_id} ${String(c.fase.name).replace(/^URBA: /, '').slice(0, 42).padEnd(44)} [${c.instancia}] via ${c.via}`);
    console.log(`      -> ${String(c.destino.name).replace(/^URBA: /, '').slice(0, 60)}`);
  }

  console.log('\n── los que se quedan como estan ──');
  const clavesSinDestino = new Map<string, any[]>();
  for (const s of sinDestino) {
    if (!clavesSinDestino.has(s.clave)) clavesSinDestino.set(s.clave, []);
    clavesSinDestino.get(s.clave)!.push(s.fase);
  }
  for (const [k, v] of clavesSinDestino) {
    console.log(`  ${k}`);
    for (const f of v) console.log(`      ${String(f.name).replace(/^URBA: /, '')}  [${instanciaDeTorneoUrba(f.name)}]`);
  }

  // ── qué arrastra cada fase ───────────────────────────────────────────────
  const ids = fases.map((f) => f.id);
  let partidos = 0, participantes = 0, tablas = 0, fasesPropias = 0;
  for (const lote of enLotes(ids, 40)) {
    const inLote = `(${lote.join(',')})`;
    partidos += await contar(`matches?select=id&tournament_id=in.${inLote}`);
    participantes += await contar(`tournament_participants?select=id&tournament_id=in.${inLote}`);
    tablas += await contar(`tournament_standings?select=id&tournament_id=in.${inLote}`);
    fasesPropias += await contar(`tournament_phases?select=id&tournament_id=in.${inLote}`);
  }
  console.log('\n── lo que arrastran las fases ──');
  console.log(`  partidos           : ${partidos}`);
  console.log(`  participantes      : ${participantes}`);
  console.log(`  filas de posiciones: ${tablas}`);
  console.log(`  fases propias      : ${fasesPropias}  (hay que reasignar sus partidos)`);

  // ── los torneos destino, y si ya tienen fases ────────────────────────────
  const destinos = [...new Set(conDestino.map((c) => c.destino.id))];
  console.log(`\n── los ${destinos.length} torneos destino ──`);
  const fasesDestino = await todas(`tournament_phases?select=id,tournament_id,name,phase_type,order_index&tournament_id=in.(${destinos.join(',')})`);
  const porTorneo = new Map<string, any[]>();
  for (const f of fasesDestino) {
    if (!porTorneo.has(f.tournament_id)) porTorneo.set(f.tournament_id, []);
    porTorneo.get(f.tournament_id)!.push(f);
  }
  let sinFase = 0;
  for (const d of destinos) {
    const f = porTorneo.get(d) ?? [];
    if (!f.length) sinFase++;
  }
  console.log(`  ya tienen al menos una fase: ${destinos.length - sinFase}`);
  console.log(`  sin ninguna fase           : ${sinFase}`);
  const tipos = new Map<string, number>();
  for (const f of fasesDestino) tipos.set(`${f.name} (${f.phase_type})`, (tipos.get(`${f.name} (${f.phase_type})`) ?? 0) + 1);
  console.log(`  fases que ya tienen: ${[...tipos.entries()].map(([k, v]) => `${k}×${v}`).join(', ')}`);

  // ── el choque con el cron ────────────────────────────────────────────────
  console.log('\n── el cron ──');
  const anios = new Map<string, number>();
  for (const f of fases) anios.set(String(f.season_id), (anios.get(String(f.season_id)) ?? 0) + 1);
  console.log(`  las fases por temporada: ${[...anios.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
  console.log('  el alcance automático del cron es SÓLO la temporada en curso, así que');
  console.log('  ninguna de estas entra por rotación. Sólo las alcanza un ?anio= a mano.');
}

main().catch((e) => { console.error(e); process.exit(1); });
