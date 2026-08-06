/**
 * Publica una temporada entera de URBA: los torneos y sus partidos.
 *
 *   node src/scripts/urba-publicar-temporada.ts --anio=2025 --plan
 *   node src/scripts/urba-publicar-temporada.ts --anio=2025 --execute
 *
 * Es `urba-activar-2026.ts` parametrizado por año, y con dos diferencias que no
 * son cosméticas:
 *
 * ── 1. Los partidos también ────────────────────────────────────────────────
 * El histórico entró con `is_visible = false` en las DOS tablas. Activar sólo
 * los torneos dejaría 141 competencias publicadas y vacías, que es peor que
 * tenerlas ocultas: el hincha entra y no hay nada.
 *
 * Y los partidos se alcanzan por `tournament_id`, NUNCA por un LIKE sobre el
 * external_id. El de un partido es `urba:<id de partido>`, un número global que
 * NO empieza por el año: `external_id=like.urba:2025*` devuelve ONCE partidos
 * —los que por casualidad tienen un id que arranca con 2025— y se pierde los
 * 10.709 de la temporada. Medido antes de escribir el PATCH.
 *
 * ── 2. Se publica TODO el año, reserva incluida ────────────────────────────
 * En 2026 hicieron falta dos pasos porque los 22 grados de reserva ya estaban
 * ocultos aparte. En el histórico está todo oculto por igual, así que un solo
 * paso los cubre. Que la Intermedia no aparezca en la portada NO se resuelve
 * dejándola sin publicar: lo hace `ocultarGradosSubordinados` en el listado, y
 * `resolveTournamentAudience` mandándola a juveniles/reserva. Sin publicar, el
 * desplegable de grado de su Superior tendría links muertos, que es exactamente
 * el problema que se resolvió en 2026.
 *
 * ── Las tres puertas ───────────────────────────────────────────────────────
 *   is_visible  la mira `isTournamentVisibleToPublic`
 *   is_active   la mira la política de RLS del anónimo — `USING (is_active = true)`
 *   status      lo mira el feed del home (`=== 'published'`, ESTRICTO)
 *
 * ── Los triggers de `matches` no se despiertan ─────────────────────────────
 * Verificado antes de correrlo, porque son 10.709 UPDATE: `trg_auto_complete_
 * round` pide `NEW.status = 'final' AND OLD.status != 'final'` y
 * `trg_g22_notify_match_finished` es `AFTER UPDATE OF status`. Acá sólo se
 * escribe `is_visible`, así que ninguno de los dos entra.
 */
import fs from 'node:fs';
import path from 'node:path';

import { esGradoSubordinado, ocultarGradosSubordinados } from '../lib/tournamentNavigation.ts';
import { PRIMER_ANIO_URBA, temporadaEnCurso } from '../lib/integrations/urba/temporada.ts';

const REPO = process.cwd();

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const argAnio = process.argv.find((a) => a.startsWith('--anio='))?.slice('--anio='.length);
if (!argAnio || !/^\d{4}$/.test(argAnio)) {
  console.error('falta --anio=YYYY. No hay valor por defecto a propósito: publicar el año equivocado se deshace, pero se nota.');
  process.exit(2);
}
const ANIO = argAnio;
if (Number(ANIO) < PRIMER_ANIO_URBA || Number(ANIO) > Number(temporadaEnCurso())) {
  console.error(`--anio=${ANIO} está fuera del rango cargado (${PRIMER_ANIO_URBA}-${temporadaEnCurso()}).`);
  process.exit(2);
}
const ROLLBACK = path.join(REPO, `URBA_PUBLICAR_${ANIO}_ROLLBACK.sql`);

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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de servicio');
if (!ANON) throw new Error('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY: sin ella no se puede verificar');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const HA = { apikey: ANON, authorization: `Bearer ${ANON}` };

async function todas(h: Record<string, string>, recurso: string): Promise<any[]> {
  const out: any[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...h, range: `${desde}-${desde + paso - 1}` } });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const filas = await r.json() as any[];
    out.push(...filas);
    if (filas.length < paso) return out;
  }
}

const contar = async (h: Record<string, string>, recurso: string) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${recurso}&limit=1`, { headers: { ...h, prefer: 'count=exact' } });
  if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status}`);
  return Number((r.headers.get('content-range') ?? '/0').split('/')[1]);
};

/** Los lotes existen porque un `in.(...)` con 141 uuids no entra en una URL. */
const enLotes = <T,>(xs: T[], n: number) => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

async function main() {
  console.log(`modo: ${modo} · año: ${ANIO}\n`);

  const T = await todas(H, `tournaments?select=id,external_id,name,season_id,category,subcategory,age_grade,gender,is_visible,is_active,status,review_status&union_id=eq.urba&season_id=eq.${ANIO}`);
  if (!T.length) { console.error(`no hay torneos de URBA en ${ANIO}.`); process.exit(1); }

  const aPublicar = T.filter((t) => !(t.is_visible === true && t.is_active === true && t.status === 'published'));
  const yaOk = T.filter((t) => t.is_visible === true && t.is_active === true && t.status === 'published');
  const reserva = T.filter((t) => esGradoSubordinado(t.subcategory));
  const noAprobados = T.filter((t) => t.review_status === 'pending_link' || t.review_status === 'rejected');

  console.log(`torneos de URBA ${ANIO}: ${T.length}`);
  console.log(`  a publicar              : ${aPublicar.length}`);
  console.log(`  ya publicados           : ${yaOk.length}`);
  console.log(`  de reserva (Intermedia/Preintermedia): ${reserva.length}`);
  console.log(`  con review_status que los corta      : ${noAprobados.length}${noAprobados.length ? ' <- no pasarían la puerta 2' : ''}`);

  // Cuántos van a la portada y cuántos quedan detrás del desplegable de su
  // división. Se calcula con la MISMA función que usa el listado público.
  const enListado = ocultarGradosSubordinados(T);
  console.log(`  irían al listado general: ${enListado.length}`);
  console.log(`  se llegan por el menú de grado: ${T.length - enListado.length}`);

  const ids = T.map((t) => t.id);
  let partidos: any[] = [];
  for (const lote of enLotes(ids, 40)) {
    partidos = partidos.concat(await todas(H, `matches?select=id,is_visible,tournament_id&tournament_id=in.(${lote.join(',')})`));
  }
  const partidosOcultos = partidos.filter((m) => m.is_visible === false);
  const partidosYaVisibles = partidos.filter((m) => m.is_visible !== false);
  console.log(`\npartidos de esos torneos: ${partidos.length}`);
  console.log(`  a hacer visibles        : ${partidosOcultos.length}`);
  console.log(`  ya visibles             : ${partidosYaVisibles.length}`);

  // ── El rollback se escribe SIEMPRE, y antes de tocar nada ─────────────────
  // Los partidos que ya estaban visibles quedan FUERA: revertirlos sería
  // apagar algo que este script no encendió.
  const sql = [
    `-- Rollback de la publicación de la temporada ${ANIO} de URBA.`,
    `-- Devuelve los ${aPublicar.length} torneos a draft/oculto y esconde de nuevo`,
    `-- los ${partidosOcultos.length} partidos que este script hizo visibles.`,
    '--',
    '-- Los partidos van por tournament_id: el external_id de un partido de URBA',
    '-- no lleva el año, así que un LIKE acá borraría el año equivocado.',
    'BEGIN;',
    `UPDATE public.tournaments SET is_visible = FALSE, is_active = FALSE, status = 'draft'`,
    `  WHERE external_id IN (${aPublicar.map((t) => `'${t.external_id}'`).join(', ') || "''"});`,
    'UPDATE public.matches SET is_visible = FALSE',
    `  WHERE tournament_id IN (${ids.map((i) => `'${i}'`).join(', ')})`,
    partidosYaVisibles.length
      ? `    AND id NOT IN (${partidosYaVisibles.map((m) => `'${m.id}'`).join(', ')});`
      : '  ;',
    'COMMIT;',
  ];
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  console.log('\nANTES — lo que ve el anónimo:');
  const antesT = await contar(HA, `tournaments?select=id&union_id=eq.urba&season_id=eq.${ANIO}`);
  console.log(`  torneos de URBA ${ANIO}: ${antesT}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  console.log('\npublicando torneos…');
  const rt = await fetch(`${URL_BASE}/rest/v1/tournaments?union_id=eq.urba&season_id=eq.${ANIO}`, {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ is_visible: true, is_active: true, status: 'published' }),
  });
  if (!rt.ok) throw new Error(`PATCH tournaments: HTTP ${rt.status} ${(await rt.text()).slice(0, 300)}`);

  console.log('haciendo visibles los partidos…');
  let hechos = 0;
  for (const lote of enLotes(ids, 40)) {
    const rm = await fetch(`${URL_BASE}/rest/v1/matches?tournament_id=in.(${lote.join(',')})&is_visible=is.false`, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ is_visible: true }),
    });
    if (!rm.ok) throw new Error(`PATCH matches: HTTP ${rm.status} ${(await rm.text()).slice(0, 300)}`);
    hechos += lote.length;
    process.stdout.write(`\r  torneos procesados: ${hechos}/${ids.length}`);
  }
  console.log('');

  // ── La verificación que importa: con la clave del visitante ───────────────
  console.log('\nDESPUÉS — lo que ve el anónimo:');
  const despuesT = await todas(HA, `tournaments?select=id,subcategory&union_id=eq.urba&season_id=eq.${ANIO}`);
  const despuesReserva = despuesT.filter((t) => esGradoSubordinado(t.subcategory));
  let despuesM = 0;
  for (const lote of enLotes(ids, 40)) {
    despuesM += await contar(HA, `matches?select=id&tournament_id=in.(${lote.join(',')})`);
  }
  console.log(`  torneos de ${ANIO}: ${despuesT.length}  (esperado ${T.length})`);
  console.log(`    de reserva     : ${despuesReserva.length}  (esperado ${reserva.length})`);
  console.log(`  partidos de ${ANIO}: ${despuesM}  (esperado ${partidos.length})`);

  const otrosAnios = await contar(HA, 'tournaments?select=id&union_id=eq.urba&season_id=neq.' + ANIO);
  console.log(`  torneos de URBA de OTROS años que ve: ${otrosAnios}`);

  if (despuesT.length !== T.length || despuesM !== partidos.length) {
    console.error('\nLa verificación con la anon key NO da lo esperado.');
    process.exit(1);
  }
  console.log('\nverificado con la anon key.');
}

main().catch((e) => { console.error(e); process.exit(1); });
