/**
 * Pone al San José de la URBA en el Desarrollo 2026, en lugar del de Paraguay.
 *
 *   node src/scripts/urba-san-jose-fix.ts --plan       no escribe; emite el rollback
 *   node src/scripts/urba-san-jose-fix.ts --execute    escribe
 *
 * ── El síntoma y la causa ──────────────────────────────────────────────────
 *
 * En `URBA: DESARROLLO - Superior` (2026) el participante "San José" apuntaba a
 * `clubs.san-jose`, que es el San José de **Paraguay** (`union-de-rugby-de-paraguay`,
 * Asunción). La causa está una capa más abajo: el mapeo `club_external_ids`
 * `urba|83|mayores|` —el triple del San José de la URBA— resolvía a ese registro,
 * así que el conector escribía los 18 partidos y el participante bajo el club
 * equivocado sin que fallara nada.
 *
 * Que el triple 83 es el San José de la URBA está comprobado: `83|M17|` ya apunta
 * a `san-jose-m17`, cuyo escudo es `.../img/clubs/sanjose.png` —el mismo blasón de
 * rombos, cruz y cabeza de gamo que el archivo que se carga acá, en resolución
 * alta.
 *
 * ── Por qué se reusa `san-jose-buenos-aires` y no se crea un club nuevo ─────
 *
 * El San José argentino YA existe en la base: `san-jose-buenos-aires`
 * (`union_id: urba`), creado por la importación histórica de rugbyarchive, con 14
 * partidos de 2002 contra Liceo Militar, Las Cañas, CASA de Padua, DAOM, La Salle,
 * Deportiva Francesa… todos clubes de la URBA. Es el mismo club de siempre, y un
 * tercer registro sólo fragmentaría más su historia.
 *
 * Se le corrige el nombre —el sufijo "(Buenos Aires)" era desambiguación del
 * importador, y en una tabla de la URBA es ruido— y se le pone el escudo. El `id`
 * y el `slug` no se tocan: son la URL pública de la ficha.
 *
 * ── Por qué el mapeo entra al alcance ──────────────────────────────────────
 *
 * Cambiar sólo el torneo no alcanza. `home_club_id` y `away_club_id` están en
 * `CAMPOS_INTOCABLES` (`syncPlan.ts`), así que los partidos NO se revierten — pero
 * `planTournamentMatches` deriva los participantes del triple, y en la siguiente
 * pasada del cron vería que `san-jose` no está inscripto y lo volvería a insertar:
 * el paraguayo reaparece en la pestaña Equipos, ahora como undécimo. El mapeo es
 * la única forma de que el arreglo se sostenga.
 *
 * El mapeo es del San José de la URBA en mayores, no de este torneo: repuntarlo es
 * corregir el dato en su origen. Al cron no le cambia el alcance —filtra por
 * `season_id = temporadaEnCurso()`, o sea 2026, y ahí San José mayores juega un
 * solo torneo: éste—. Las temporadas 2021-2025 quedan como están: reimportarlas a
 * mano pediría repuntar también sus participantes.
 *
 * ── El escudo va a Storage, no a la columna ────────────────────────────────
 *
 * `clubs.logo_url` tiene hoy ~905 escudos guardados como base64 —el propio
 * `san-jose` de Paraguay son 272 KB de texto— y de ahí sale el 57014 de
 * `/api/teams`. El archivo se sube al bucket `club-assets` con el mismo camino que
 * `persistClubLogo` (`logos/{clubId}/{sha256}.png`, nombre por contenido, así que
 * repetir la corrida reescribe el mismo archivo) y en la columna queda la URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_SAN_JOSE_ROLLBACK.sql');

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

/** El torneo, y sólo ese: el pedido es puntual. */
const TORNEO = 'e0e20e06-8c98-4804-9edc-2cc978b7da56';
const AJENO = 'san-jose';                  // el de Paraguay: no se borra ni se toca
const PROPIO = 'san-jose-buenos-aires';    // el de la URBA
const TRIPLE = '83|mayores|';              // club 83 de URBA, categoría mayores
const NOMBRE = 'San José';
const BUCKET = 'club-assets';
const ESCUDO = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA/URBA/San Jose.png';

const q = (s: string) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const nul = (s: unknown) => (s === null || s === undefined ? 'NULL' : q(String(s)));

async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: H });
  if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return await res.json() as T[];
}

async function escribir(metodo: 'POST' | 'PATCH' | 'DELETE', recurso: string, cuerpo?: unknown) {
  const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
}

interface Club {
  id: string; name: string; short_name: string | null; slug: string | null;
  logo_url: string | null; city: string | null; region: string | null;
  country: string | null; union_id: string | null; sport: string | null; sport_id: string | null;
}

async function main() {
  console.log(`modo: ${modo}\nverificando el estado…\n`);

  // ── lectura del estado ────────────────────────────────────────────────────
  const clubes = await selectAll<Club>(
    `clubs?select=id,name,short_name,slug,logo_url,city,region,country,union_id,sport,sport_id&id=in.(${AJENO},${PROPIO})`);
  const ajeno = clubes.find((c) => c.id === AJENO);
  const propio = clubes.find((c) => c.id === PROPIO);

  const participantes = await selectAll<{ id: string; club_id: string; name: string }>(
    `tournament_participants?select=id,club_id,name&tournament_id=eq.${TORNEO}&club_id=eq.${AJENO}`);
  const partidos = await selectAll<{ id: string; external_id: string; home_club_id: string; away_club_id: string }>(
    `matches?select=id,external_id,home_club_id,away_club_id&tournament_id=eq.${TORNEO}&or=(home_club_id.eq.${AJENO},away_club_id.eq.${AJENO})`);
  const tablas = await selectAll<{ id: string; club_id: string; position: number; points: number }>(
    `tournament_standings?select=id,club_id,position,points&tournament_id=eq.${TORNEO}&club_id=eq.${AJENO}`);
  const mapeo = await selectAll<{ external_id: string; club_id: string }>(
    `club_external_ids?select=external_id,club_id&provider=eq.urba&external_id=eq.${encodeURIComponent(TRIPLE)}`);
  const otrosDelAjeno = await selectAll<{ id: string }>(
    `matches?select=id&or=(home_club_id.eq.${AJENO},away_club_id.eq.${AJENO})&tournament_id=neq.${TORNEO}`);

  // ── chequeos previos: si algo no está como se espera, no se toca nada ─────
  const problemas: string[] = [];
  if (!ajeno) problemas.push(`${AJENO} no existe`);
  if (!propio) problemas.push(`${PROPIO} no existe: sin él no hay a dónde mover`);
  if (propio && propio.union_id !== 'urba') problemas.push(`${PROPIO} no es de la URBA (union_id=${propio.union_id})`);
  if (participantes.length !== 1) problemas.push(`se esperaba 1 participante ${AJENO} en el torneo, hay ${participantes.length}`);
  if (!partidos.length) problemas.push('no hay partidos de ese club en el torneo (¿ya se corrió?)');
  if (mapeo.length !== 1) problemas.push(`el triple ${TRIPLE} no está mapeado una sola vez (${mapeo.length})`);
  if (mapeo[0] && mapeo[0].club_id !== AJENO) problemas.push(`${TRIPLE} ya no apunta a ${AJENO} sino a ${mapeo[0].club_id}`);
  // Los dos clubes en el mismo torneo serían dos filas para el mismo equipo.
  const yaInscripto = await selectAll<{ id: string }>(
    `tournament_participants?select=id&tournament_id=eq.${TORNEO}&club_id=eq.${PROPIO}`);
  if (yaInscripto.length) problemas.push(`${PROPIO} YA es participante del torneo: quedarían dos`);
  if (!fs.existsSync(ESCUDO)) problemas.push(`no está el escudo: ${ESCUDO}`);

  console.log(`  club ajeno   ${AJENO.padEnd(24)} ${ajeno?.name} · ${ajeno?.country} · ${ajeno?.union_id}`);
  console.log(`  club propio  ${PROPIO.padEnd(24)} ${propio?.name} · ${propio?.country} · ${propio?.union_id}`);
  console.log(`  participante en el torneo:  ${participantes.length}`);
  console.log(`  partidos en el torneo:      ${partidos.length}`);
  console.log(`  filas de posiciones:        ${tablas.length}`);
  console.log(`  triple ${TRIPLE} -> ${mapeo[0]?.club_id ?? '(sin mapeo)'}`);
  console.log(`  partidos del ajeno en OTROS torneos (no se tocan): ${otrosDelAjeno.length}`);

  if (problemas.length) {
    console.error('\nEl estado no es el esperado. No se escribió nada:');
    problemas.forEach((p) => console.error('  · ' + p));
    process.exit(1);
  }
  console.log('\n  estado verificado: todo como se espera');

  // ── el escudo ─────────────────────────────────────────────────────────────
  const bytes = fs.readFileSync(ESCUDO);
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const filePath = `logos/${PROPIO}/${digest}.png`;
  const logoUrl = `${URL_BASE}/storage/v1/object/public/${BUCKET}/${filePath}`;
  console.log(`  escudo: ${(bytes.byteLength / 1024).toFixed(0)} KB -> ${BUCKET}/${filePath}`);

  // ── el rollback, ANTES de escribir ────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback de la corrección de San José en URBA: DESARROLLO - Superior 2026.');
  sql.push('-- Generado ANTES de ejecutar. Devuelve todo al estado previo.');
  sql.push('--');
  sql.push(`-- Torneo: ${TORNEO}`);
  sql.push(`-- Devuelve ${partidos.length} partidos, 1 participante, ${tablas.length} fila(s) de posiciones`);
  sql.push(`-- y el triple urba '${TRIPLE}' a '${AJENO}', y restituye la ficha de '${PROPIO}'.`);
  sql.push('');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- 1. El mapeo del conector');
  sql.push(`UPDATE public.club_external_ids SET club_id = ${q(AJENO)}`);
  sql.push(`  WHERE provider = 'urba' AND external_id = ${q(TRIPLE)};`);
  sql.push('');
  sql.push('-- 2. La ficha del club (el archivo queda en Storage; la columna vuelve a su valor)');
  sql.push(`UPDATE public.clubs SET name = ${q(propio!.name)}, short_name = ${nul(propio!.short_name)},`);
  sql.push(`       logo_url = ${nul(propio!.logo_url)}, city = ${nul(propio!.city)}, region = ${nul(propio!.region)}`);
  sql.push(`  WHERE id = ${q(PROPIO)};`);
  sql.push('');
  sql.push('-- 3. El participante del torneo');
  for (const p of participantes) {
    sql.push(`UPDATE public.tournament_participants SET club_id = ${q(AJENO)}, name = ${q(p.name)}`);
    sql.push(`  WHERE id = ${q(p.id)};`);
  }
  sql.push('');
  sql.push('-- 4. Los partidos, uno por uno y por lado: sólo el lado que era suyo');
  for (const m of partidos) {
    const lado = m.home_club_id === AJENO ? 'home_club_id' : 'away_club_id';
    sql.push(`UPDATE public.matches SET ${lado} = ${q(AJENO)} WHERE id = ${q(m.id)};`);
  }
  sql.push('');
  sql.push('-- 5. La tabla de posiciones');
  for (const t of tablas) {
    sql.push(`UPDATE public.tournament_standings SET club_id = ${q(AJENO)} WHERE id = ${q(t.id)};`);
  }
  sql.push('');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  console.log('\nplan:');
  console.log(`  subir      escudo -> ${BUCKET}/${filePath}`);
  console.log(`  editar     clubs.${PROPIO}: name ${q(propio!.name)} -> ${q(NOMBRE)} · short_name ${nul(propio!.short_name)} -> ${q(NOMBRE)} · logo_url`);
  console.log(`  repuntar   participante ${participantes[0].id}: ${AJENO} -> ${PROPIO}`);
  console.log(`  repuntar   ${partidos.length} partidos del torneo: ${AJENO} -> ${PROPIO}`);
  console.log(`  repuntar   ${tablas.length} fila(s) de posiciones: ${AJENO} -> ${PROPIO}`);
  console.log(`  repuntar   club_external_ids urba ${TRIPLE}: ${AJENO} -> ${PROPIO}`);
  console.log(`  intacto    clubs.${AJENO} (Paraguay), su ficha y sus ${otrosDelAjeno.length} partidos de otros torneos`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── la escritura ──────────────────────────────────────────────────────────
  console.log('\nescribiendo…');

  const subida = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${filePath}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'image/png', 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  });
  if (!subida.ok) throw new Error(`subida del escudo: HTTP ${subida.status} ${(await subida.text()).slice(0, 300)}`);
  console.log(`  ✓ escudo en ${BUCKET}/${filePath}`);

  await escribir('PATCH', `clubs?id=eq.${PROPIO}`, {
    name: NOMBRE, short_name: NOMBRE, logo_url: logoUrl,
    city: 'Buenos Aires', region: 'Buenos Aires',
  });
  console.log(`  ✓ ficha de ${PROPIO}`);

  // El participante se EDITA, no se borra y recrea: `tournament_phase_participants`
  // lo referencia por `participant_id`, y una fila nueva dejaría la fase colgando.
  await escribir('PATCH', `tournament_participants?id=eq.${participantes[0].id}`, {
    club_id: PROPIO, name: NOMBRE,
  });
  console.log(`  ✓ participante ${participantes[0].id}`);

  const locales = partidos.filter((m) => m.home_club_id === AJENO).map((m) => m.id);
  const visitas = partidos.filter((m) => m.away_club_id === AJENO).map((m) => m.id);
  if (locales.length) await escribir('PATCH', `matches?id=in.(${locales.join(',')})`, { home_club_id: PROPIO });
  if (visitas.length) await escribir('PATCH', `matches?id=in.(${visitas.join(',')})`, { away_club_id: PROPIO });
  console.log(`  ✓ ${locales.length} partidos de local y ${visitas.length} de visitante`);

  if (tablas.length) {
    await escribir('PATCH', `tournament_standings?id=in.(${tablas.map((t) => t.id).join(',')})`, { club_id: PROPIO });
    console.log(`  ✓ ${tablas.length} fila(s) de posiciones`);
  }

  await escribir('PATCH',
    `club_external_ids?provider=eq.urba&external_id=eq.${encodeURIComponent(TRIPLE)}`,
    { club_id: PROPIO });
  console.log(`  ✓ triple ${TRIPLE} -> ${PROPIO}`);

  // ── verificación ──────────────────────────────────────────────────────────
  console.log('\nverificando…');
  const quedan = await selectAll<{ id: string }>(
    `matches?select=id&tournament_id=eq.${TORNEO}&or=(home_club_id.eq.${AJENO},away_club_id.eq.${AJENO})`);
  const quedanParts = await selectAll<{ id: string }>(
    `tournament_participants?select=id&tournament_id=eq.${TORNEO}&club_id=eq.${AJENO}`);
  const nuevos = await selectAll<{ id: string }>(
    `matches?select=id&tournament_id=eq.${TORNEO}&or=(home_club_id.eq.${PROPIO},away_club_id.eq.${PROPIO})`);
  const ficha = (await selectAll<Club>(`clubs?select=id,name,short_name,logo_url&id=eq.${PROPIO}`))[0];
  const sigue = (await selectAll<Club>(`clubs?select=id,name,country,union_id&id=eq.${AJENO}`))[0];
  const intactos = await selectAll<{ id: string }>(
    `matches?select=id&or=(home_club_id.eq.${AJENO},away_club_id.eq.${AJENO})&tournament_id=neq.${TORNEO}`);
  const logoOk = await fetch(logoUrl, { method: 'HEAD' });

  console.log(`  partidos del torneo bajo ${AJENO}:  ${quedan.length}  (esperado 0)`);
  console.log(`  participantes bajo ${AJENO}:        ${quedanParts.length}  (esperado 0)`);
  console.log(`  partidos del torneo bajo ${PROPIO}: ${nuevos.length}  (esperado ${partidos.length})`);
  console.log(`  partidos del ajeno en otros torneos: ${intactos.length}  (esperado ${otrosDelAjeno.length})`);
  console.log(`  ficha: ${ficha?.name} / ${ficha?.short_name}`);
  console.log(`  escudo público: HTTP ${logoOk.status}`);
  console.log(`  ${AJENO} sigue vivo: ${sigue?.name} · ${sigue?.country} · ${sigue?.union_id}`);

  const ok = quedan.length === 0 && quedanParts.length === 0
    && nuevos.length === partidos.length && intactos.length === otrosDelAjeno.length
    && logoOk.ok && Boolean(sigue);
  console.log(ok ? '\nlisto.' : '\nALGO NO CIERRA: revisá antes de seguir.');
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
