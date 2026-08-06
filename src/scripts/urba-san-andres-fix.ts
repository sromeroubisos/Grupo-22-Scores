/**
 * Repara los registros de San Andrés que quedaron bajo San Albano.
 *
 *   node src/scripts/urba-san-andres-fix.ts --plan       no escribe; emite el rollback
 *   node src/scripts/urba-san-andres-fix.ts --execute    escribe
 *
 * El porqué está en `docs/urba-club-id-14.md`, con las cinco pruebas. Resumido:
 * URBA publicó los equipos de San Andrés con el `club_id` de San Albano (el 14)
 * entre 2021 y 2023, y el mapeo `club_external_ids` se generó de ese dato. Con la
 * corrección de `corregirUrbaClubId` puesta, los triples pasan a pedir el 31 —
 * y seis de ellos no existen.
 *
 * ── Tres operaciones, y no son intercambiables ─────────────────────────────
 *
 * RENOMBRAR (3). El triple `14|…` lo usó SÓLO San Andrés: el registro es suyo y
 * está mal nombrado. No hay un `san-andres-*` equivalente, así que se le corrige
 * el id, el nombre y el escudo, y su mapeo pasa de `14|…` a `31|…`.
 *
 * RETIRAR (1). `14|M15|C` también lo usó sólo San Andrés, pero acá el registro
 * correcto —`san-andres-m15-c`— YA EXISTE y tiene 17 partidos de 2026 colgando.
 * Renombrar chocaría con él. `san-albano-m15-c` es un duplicado nacido del dato
 * malo, con cero referencias: se retira junto con su mapeo.
 *
 * CREAR (3). `14|M15|`, `14|M18|A` y `14|M18|B` los usaron LOS DOS clubes: San
 * Albano puso un equipo ahí de verdad. Su registro se queda como está y San
 * Andrés necesita uno propio.
 *
 * ── El orden importa ───────────────────────────────────────────────────────
 * `club_external_ids.club_id` referencia `clubs.id`. Al renombrar se borra el
 * mapeo viejo ANTES de mover el id y se inserta el nuevo DESPUÉS, así no queda
 * un instante con la referencia colgando. PostgREST no da transacción entre
 * llamadas: el orden es la única garantía.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_SAN_ANDRES_ROLLBACK.sql');

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

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
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const ESCUDO_SAN_ANDRES = 'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanandres.png';

/** Los tres cuyo registro es de San Andrés y hay que corregirle el nombre. */
const RENOMBRAR = [
  { de: 'san-albano-m19', a: 'san-andres-m19', nombre: 'San Andrés M19', categoria: 'M19', tripleViejo: '14|M19|', tripleNuevo: '31|M19|' },
  { de: 'san-albano-m20-a', a: 'san-andres-m20-a', nombre: 'San Andrés M20 "A"', categoria: 'M20', tripleViejo: '14|M20|A', tripleNuevo: '31|M20|A' },
  { de: 'san-albano-m20-b', a: 'san-andres-m20-b', nombre: 'San Andrés M20 "B"', categoria: 'M20', tripleViejo: '14|M20|B', tripleNuevo: '31|M20|B' },
] as const;

/** El duplicado: el registro correcto ya existe y está en uso. */
const RETIRAR = [
  { club: 'san-albano-m15-c', triple: '14|M15|C', porque: 'san-andres-m15-c ya existe y tiene 17 partidos de 2026' },
] as const;

/** Los que compartieron triple: San Andrés necesita registro propio. */
const CREAR = [
  { id: 'san-andres-m15', nombre: 'San Andrés M15', categoria: 'M15', triple: '31|M15|' },
  { id: 'san-andres-m18-a', nombre: 'San Andrés M18 "A"', categoria: 'M18', triple: '31|M18|A' },
  { id: 'san-andres-m18-b', nombre: 'San Andrés M18 "B"', categoria: 'M18', triple: '31|M18|B' },
] as const;

async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: H });
  if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json() as T[];
}

async function escribir(metodo: 'POST' | 'PATCH' | 'DELETE', recurso: string, cuerpo?: unknown) {
  const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function main() {
  console.log(`modo: ${modo}\nverificando el estado…`);

  const todosLosIds = [...RENOMBRAR.map((r) => r.de), ...RENOMBRAR.map((r) => r.a),
  ...RETIRAR.map((r) => r.club), ...CREAR.map((c) => c.id)];
  const clubes = await selectAll<{ id: string; name: string }>(
    `clubs?select=id,name&id=in.(${todosLosIds.join(',')})`);
  const existe = new Set(clubes.map((c) => c.id));

  const mapeo = await selectAll<{ external_id: string; club_id: string }>(
    'club_external_ids?select=external_id,club_id&provider=eq.urba');
  const porTriple = new Map(mapeo.map((m) => [m.external_id, m.club_id]));

  // ── chequeos previos: si algo no está como se espera, no se toca nada ─────
  const problemas: string[] = [];
  for (const r of RENOMBRAR) {
    if (!existe.has(r.de)) problemas.push(`${r.de} no existe (¿ya se corrió?)`);
    if (existe.has(r.a)) problemas.push(`${r.a} YA existe: renombrar chocaría`);
    if (porTriple.get(r.tripleViejo) !== r.de) problemas.push(`${r.tripleViejo} no apunta a ${r.de}`);
    if (porTriple.has(r.tripleNuevo)) problemas.push(`${r.tripleNuevo} ya está mapeado`);
  }
  for (const r of RETIRAR) {
    if (!existe.has(r.club)) problemas.push(`${r.club} no existe (¿ya se corrió?)`);
  }
  for (const c of CREAR) {
    if (existe.has(c.id)) problemas.push(`${c.id} YA existe`);
    if (porTriple.has(c.triple)) problemas.push(`${c.triple} ya está mapeado`);
  }

  // Un registro con partidos colgando NO se renombra ni se retira: la referencia
  // quedaría rota o el partido cambiaría de club sin que nadie lo pida.
  const aTocar = [...RENOMBRAR.map((r) => r.de), ...RETIRAR.map((r) => r.club)];
  const conPartidos = await selectAll<{ external_id: string }>(
    `matches?select=external_id&or=(home_club_id.in.(${aTocar.join(',')}),away_club_id.in.(${aTocar.join(',')}))`);
  const conParticipantes = await selectAll<{ club_id: string }>(
    `tournament_participants?select=club_id&club_id=in.(${aTocar.join(',')})`);
  if (conPartidos.length) problemas.push(`${conPartidos.length} partidos referencian registros a tocar`);
  if (conParticipantes.length) problemas.push(`${conParticipantes.length} participantes referencian registros a tocar`);

  console.log(`  partidos que referencian lo que se toca:      ${conPartidos.length}`);
  console.log(`  participantes que referencian lo que se toca: ${conParticipantes.length}`);

  if (problemas.length) {
    console.error('\nEl estado no es el esperado. No se escribió nada:');
    problemas.forEach((p) => console.error('  · ' + p));
    process.exit(1);
  }
  console.log('  estado verificado: todo como se espera\n');

  // ── el rollback, ANTES de escribir ────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback de la reparación de San Andrés. Generado ANTES de ejecutar.');
  sql.push('-- Devuelve los registros exactamente al estado previo.');
  sql.push('--');
  sql.push('-- El porqué de la reparación está en docs/urba-club-id-14.md.');
  sql.push('');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- 1. Deshacer los renombres (mapeo primero, para no dejar la FK colgando)');
  for (const r of RENOMBRAR) {
    sql.push(`DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '${r.tripleNuevo}';`);
    sql.push(`UPDATE public.clubs SET id = '${r.de}', name = '${r.de.replace(/-/g, ' ')}', short_name = '${r.de.replace(/-/g, ' ')}', slug = '${r.de}',`);
    sql.push(`       logo_url = 'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanalbano.png'`);
    sql.push(`  WHERE id = '${r.a}';`);
    sql.push(`INSERT INTO public.club_external_ids (provider, external_id, club_id) VALUES ('urba', '${r.tripleViejo}', '${r.de}');`);
  }
  sql.push('');
  sql.push('-- OJO: el UPDATE de arriba restituye el `name` con guiones. Los nombres exactos eran:');
  RENOMBRAR.forEach((r) => {
    const orig = clubes.find((c) => c.id === r.de);
    sql.push(`--   ${r.de} -> '${orig?.name ?? '?'}'`);
  });
  sql.push('');
  sql.push('-- 2. Reponer el duplicado retirado');
  for (const r of RETIRAR) {
    const orig = clubes.find((c) => c.id === r.club);
    sql.push(`INSERT INTO public.clubs (id, union_id, name, short_name, slug, logo_url, is_visible, entity_type, sport, category, status, visibility)`);
    sql.push(`  VALUES ('${r.club}', 'urba', '${(orig?.name ?? '').replace(/'/g, "''")}', '${(orig?.name ?? '').replace(/'/g, "''")}', '${r.club}',`);
    sql.push(`          'https://urbaimagenes-cddyfadwc8dqcchn.z03.azurefd.net/img/clubs/sanalbano.png', FALSE, 'club', 'rugby', 'M15', 'active', 'hidden');`);
    sql.push(`INSERT INTO public.club_external_ids (provider, external_id, club_id) VALUES ('urba', '${r.triple}', '${r.club}');`);
  }
  sql.push('');
  sql.push('-- 3. Borrar los creados');
  for (const c of CREAR) {
    sql.push(`DELETE FROM public.club_external_ids WHERE provider = 'urba' AND external_id = '${c.triple}';`);
    sql.push(`DELETE FROM public.clubs WHERE id = '${c.id}';`);
  }
  sql.push('');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`rollback escrito: ${ROLLBACK}`);

  console.log('\nplan:');
  RENOMBRAR.forEach((r) => console.log(`  renombrar  ${r.de.padEnd(18)} -> ${r.a.padEnd(18)} · triple ${r.tripleViejo} -> ${r.tripleNuevo}`));
  RETIRAR.forEach((r) => console.log(`  retirar    ${r.club.padEnd(18)} · triple ${r.triple.padEnd(10)} · ${r.porque}`));
  CREAR.forEach((c) => console.log(`  crear      ${c.id.padEnd(18)} · triple ${c.triple}`));

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── la escritura ──────────────────────────────────────────────────────────
  console.log('\nescribiendo…');
  for (const r of RENOMBRAR) {
    await escribir('DELETE', `club_external_ids?provider=eq.urba&external_id=eq.${encodeURIComponent(r.tripleViejo)}`);
    await escribir('PATCH', `clubs?id=eq.${r.de}`, {
      id: r.a, name: r.nombre, short_name: r.nombre, slug: r.a,
      logo_url: ESCUDO_SAN_ANDRES, category: r.categoria,
    });
    await escribir('POST', 'club_external_ids', { provider: 'urba', external_id: r.tripleNuevo, club_id: r.a });
    console.log(`  ✓ ${r.de} -> ${r.a}`);
  }

  for (const r of RETIRAR) {
    await escribir('DELETE', `club_external_ids?provider=eq.urba&external_id=eq.${encodeURIComponent(r.triple)}`);
    await escribir('DELETE', `clubs?id=eq.${r.club}`);
    console.log(`  ✓ retirado ${r.club}`);
  }

  for (const c of CREAR) {
    await escribir('POST', 'clubs', {
      id: c.id, union_id: 'urba', name: c.nombre, short_name: c.nombre, slug: c.id,
      logo_url: ESCUDO_SAN_ANDRES, is_visible: false, entity_type: 'club',
      sport: 'rugby', category: c.categoria, status: 'active', visibility: 'hidden',
    });
    await escribir('POST', 'club_external_ids', { provider: 'urba', external_id: c.triple, club_id: c.id });
    console.log(`  ✓ creado ${c.id}`);
  }

  // ── verificación ──────────────────────────────────────────────────────────
  const despues = await selectAll<{ external_id: string; club_id: string }>(
    'club_external_ids?select=external_id,club_id&provider=eq.urba&external_id=like.31|*');
  const esperados = [...RENOMBRAR.map((r) => r.tripleNuevo), ...CREAR.map((c) => c.triple)];
  const faltan = esperados.filter((t) => !despues.some((d) => d.external_id === t));
  console.log(`\ntriples 31|… en la base: ${despues.length}`);
  if (faltan.length) { console.error('FALTAN: ' + faltan.join(', ')); process.exit(1); }
  console.log('los 6 triples nuevos están. Volvé a correr la corrida en seco del histórico.');
}

main().catch((e) => { console.error(e); process.exit(1); });
