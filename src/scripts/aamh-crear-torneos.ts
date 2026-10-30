/**
 * Alta del hockey marplatense (AAMH) en el catálogo:
 *
 *   npx tsx src/scripts/aamh-crear-torneos.ts --plan
 *   npx tsx src/scripts/aamh-crear-torneos.ts --execute
 *   npx tsx src/scripts/aamh-crear-torneos.ts --anio 2025 --plan
 *
 * Crea tres cosas, en este orden, porque las FKs lo exigen: los CLUBES que
 * faltan, sus ALIAS, y recién después los TORNEOS con su temporada y su fase.
 * El cron `/api/cron/aamh-sync` no crea nada de esto: se apoya en que ya está.
 *
 * ── Por qué los clubes nacen con ficha propia ────────────────────────────────
 *
 * Medido contra la base: de los 34 clubes que juegan la AAMH, solo 4 tienen un
 * homónimo en field-hockey y 3 más (MAR DEL PLATA CLUB, ONCE UNIDOS,
 * PUEYRREDON) chocan con una ficha de RUGBY. Ninguno de esos choques es una
 * coincidencia útil: el "Universitario" de la AAMH no es el de Córdoba, y el
 * club de rugby de Mar del Plata no es la misma entidad que su rama de hockey
 * —el proyecto ya las separa a propósito en otros casos—.
 *
 * Por eso el id de un club nuevo lleva el prefijo `aamh-`: no pisa
 * `mar-del-plata-club` (rugby) y deja el vínculo, si algún día se quiere, como
 * una decisión humana y no como el efecto secundario de un nombre parecido.
 * Los vínculos que SÍ son seguros van declarados en `VINCULOS`, a mano.
 *
 * La grafía de la AAMH es estable en los 38 torneos, así que el alias no lleva
 * alcance por torneo: una fila por club y listo.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchCatalogoAnio, fetchTorneo, pausa, PAUSA_MS } from '../lib/integrations/aamh/client.ts';
import { parseCatalogo, parseTorneo } from '../lib/integrations/aamh/parser.ts';
import {
  AAMH_PROVIDER,
  buildTournamentExternalId,
  buildTeamAlias,
  claveDeNombre,
} from '../lib/integrations/aamh/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const EJECUTAR = process.argv.includes('--execute');
const ANIO = Number(process.argv[process.argv.indexOf('--anio') + 1]) || new Date().getUTCFullYear();

/** El torneo del que se clona el ruleset de hockey (3/1/0) y los settings de fase. */
const PLANTILLA_EXTERNAL_ID = 'fedhockeycba:copa-cordoba-damas-2026';

/**
 * Vínculos a un club que YA existe, curados a mano y por rama.
 *
 * De dónde salen los de damas: `Torneo Preparación Damas "A" - Mar del Plata`
 * ya estaba cargado a mano en la base con sus 12 participantes, y es el mismo
 * certamen que la AAMH publica como 108/12. Sus participantes son la VERDAD
 * del mapeo — no una adivinanza por parecido de nombre, que acá falla feo:
 * la AAMH abrevia "C.U.D.S." donde la base dice "Club Unión del Sur - Damas",
 * y "DEL VALLE" donde dice "Hockey Club Del Valle Necochea - Damas".
 *
 * Todo lo que no esté acá nace como ficha nueva. Es preferible una ficha de
 * más —que después se fusiona— que 200 partidos atribuidos al club equivocado.
 */
const VINCULOS: Record<string, Record<string, string>> = {
  damas: {
    'banco provincia': 'club-banco-provincia-de-mar-del-plata-damas',
    'bigua': 'bigua-rugby-club',
    'c u d s': 'club-union-del-sur-damas',
    'del valle': 'hockey-club-del-valle-necochea-damas',
    'idra': 'idra-damas',
    'inst einstein': 'instituto-albert-einstein-club',
    'mar del plata club': 'mar-del-plata-club-damas',
    'mdq 06 hockey club': 'mdq-06-hockey-club',
    'nautico mdp': 'nautico-mar-del-plata',
    'once unidos': 'once-unidos',
    'sporting': 'sporting-hockey-damas',
    'trinity': 'trinity-club-hockey',
    'universitario': 'universitario-de-mar-del-plata-hockey',
  },
  // La rama de caballeros no tiene ningún torneo cargado del que sacar la
  // verdad, así que no se declara ninguno: nacen todos con ficha propia y el
  // vínculo, si corresponde, se hace a ojo desde el gestor.
  caballeros: {},
};

/** Los géneros que declara el menú de la AAMH, traducidos al del catálogo. */
const GENERO: Record<string, 'femenino' | 'masculino'> = {
  damas: 'femenino',
  caballeros: 'masculino',
};

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** PostgREST corta en 1000 filas aunque pidas más: se pagina por lo que llegó. */
async function leerTodo<T>(recurso: string, orden: string): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const tanda = await leer<T[]>(`${recurso}&order=${orden}&offset=${desde}&limit=1000`);
    salida.push(...tanda);
    if (tanda.length < 1000) break;
  }
  return salida;
}

async function escribir(recurso: string, metodo: 'PATCH' | 'POST', cuerpo: unknown): Promise<void> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${await res.text()}`);
}

/**
 * Torneos que YA están cargados a mano y hay que ADOPTAR en vez de duplicar:
 * se les escribe el `external_id` y desde ahí los maneja el cron. El nombre es
 * el exacto de la base.
 */
const ADOPTAR: Record<string, string> = {
  'aamh:2026:108-12': 'Torneo Preparación Damas "A" - Mar del Plata',
};

/** `MAR DEL PLATA CLUB B` en damas → `aamh-mar-del-plata-club-b-damas`. */
const idDeClub = (rama: string, nombre: string) =>
  `aamh-${claveDeNombre(nombre).replace(/ /g, '-')}-${rama}`;

/**
 * El nombre legible. La AAMH ya mete la división adentro del nombre de varios
 * certámenes ("Top Nivel 1 A Primera", jugado en Primera), así que repetirla
 * daría "Top Nivel 1 A Primera Primera Damas 2026". Si el nombre ya termina
 * con la división, no se agrega de nuevo.
 */
function nombreDeTorneo(division: string, genero: string, nombre: string, anio: number): string {
  const yaLaDice = claveDeNombre(nombre).endsWith(claveDeNombre(division));
  const partes = [nombre, yaLaDice ? '' : division, genero, String(anio)];
  return partes.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`AAMH ${ANIO} — ${EJECUTAR ? 'EJECUTANDO' : 'plan'}\n`);

  // ── el catálogo del año, desde el sitio ────────────────────────────────────
  const rCatalogo = await fetchCatalogoAnio(ANIO);
  if (!rCatalogo.ok || !rCatalogo.data) {
    throw new Error(`No se pudo leer el catálogo de ${ANIO} (status ${rCatalogo.status})`);
  }
  const catalogo = parseCatalogo(rCatalogo.data);
  if (!catalogo.length) throw new Error(`El menú de ${ANIO} vino sin torneos`);
  console.log(`Torneos en el sitio: ${catalogo.length}`);

  // ── los clubes que juegan, POR RAMA, sacados de la página de cada torneo ───
  const porRama = new Map<string, Set<string>>();
  for (const t of catalogo) {
    const rama = claveDeNombre(t.genero) || 'damas';
    const r = await fetchTorneo(t.tid, t.cid);
    await pausa(PAUSA_MS);
    if (!r.ok || !r.data) { console.warn(`  ! ${t.division}/${t.nombre}: no se pudo leer (status ${r.status})`); continue; }
    if (!porRama.has(rama)) porRama.set(rama, new Set());
    const nombres = porRama.get(rama)!;
    const pagina = parseTorneo(r.data);
    for (const fila of pagina.posiciones) if (fila.equipo) nombres.add(fila.equipo);
    for (const rueda of pagina.ruedas) {
      for (const p of rueda.partidos) { nombres.add(p.local); nombres.add(p.visitante); }
    }
  }
  for (const [rama, nombres] of porRama) console.log(`Clubes distintos en ${rama}: ${nombres.size}`);
  console.log('');

  // ── qué hay ya en la base ──────────────────────────────────────────────────
  const clubs = await leerTodo<{ id: string; name: string; sport_id: string | null }>(
    'clubs?select=id,name,sport_id', 'id.asc',
  );
  const porId = new Map(clubs.map((c) => [c.id, c]));
  const aliasYa = new Map(
    (await leer<{ external_id: string; club_id: string }[]>(
      `club_external_ids?provider=eq.${AAMH_PROVIDER}&select=external_id,club_id`,
    )).map((a) => [a.external_id, a.club_id]),
  );
  const torneosYa = new Set(
    (await leer<{ external_id: string }[]>('tournaments?external_id=like.aamh:*&select=external_id'))
      .map((t) => t.external_id),
  );

  // ── plan de clubes y alias ─────────────────────────────────────────────────
  const clubesNuevos: { id: string; nombre: string; rama: string }[] = [];
  const aliasNuevos: { clave: string; clubId: string; nombre: string; vinculado: boolean }[] = [];

  for (const [rama, nombres] of porRama) {
    for (const nombre of [...nombres].sort()) {
      const clave = buildTeamAlias(rama, nombre);
      if (aliasYa.has(clave)) continue;

      const vinculado = VINCULOS[rama]?.[claveDeNombre(nombre)];
      if (vinculado) {
        if (!porId.has(vinculado)) { console.warn(`  ! vínculo a un club inexistente: ${clave} → ${vinculado}`); continue; }
        aliasNuevos.push({ clave, clubId: vinculado, nombre, vinculado: true });
        continue;
      }

      const id = idDeClub(rama, nombre);
      if (!porId.has(id) && !clubesNuevos.some((c) => c.id === id)) clubesNuevos.push({ id, nombre, rama });
      aliasNuevos.push({ clave, clubId: id, nombre, vinculado: false });
    }
  }

  const todosLosTorneos = catalogo.map((t) => ({
    ...t,
    externalId: buildTournamentExternalId({ anio: ANIO, tid: t.tid, cid: t.cid }),
    nombreLargo: nombreDeTorneo(t.division, t.genero, t.nombre, ANIO),
  }));
  const pendientes = todosLosTorneos.filter((t) => !torneosYa.has(t.externalId));
  const torneosNuevos = pendientes.filter((t) => !ADOPTAR[t.externalId]);
  const torneosAdoptar = pendientes.filter((t) => ADOPTAR[t.externalId]);

  console.log(`Clubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + [${c.rama}] ${c.nombre} → ${c.id}`);
  console.log(`\nAlias a crear (${aliasNuevos.length}), ${aliasNuevos.filter((a) => a.vinculado).length} de ellos a un club que ya existe:`);
  for (const a of aliasNuevos) console.log(`  + "${a.clave}" → ${a.clubId}${a.vinculado ? '  (vínculo)' : ''}`);
  console.log(`\nTorneos a ADOPTAR (${torneosAdoptar.length}) — ya cargados a mano, se les escribe el external_id:`);
  for (const t of torneosAdoptar) console.log(`  ~ "${ADOPTAR[t.externalId]}" → ${t.externalId}`);
  console.log(`\nTorneos a crear (${torneosNuevos.length}):`);
  for (const t of torneosNuevos) console.log(`  + ${t.nombreLargo} → ${t.externalId}`);

  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  // ── ejecución ──────────────────────────────────────────────────────────────
  const [plantilla] = await leer<Record<string, unknown>[]>(
    `tournaments?external_id=eq.${PLANTILLA_EXTERNAL_ID}`,
  );
  if (!plantilla) throw new Error(`No se encontró la plantilla ${PLANTILLA_EXTERNAL_ID}`);
  const [fasePlantilla] = await leer<{ settings: unknown }[]>(
    `tournament_phases?tournament_id=eq.${plantilla.id}&select=settings&order=order_index.asc&limit=1`,
  );
  if (!fasePlantilla) throw new Error('La plantilla no tiene fase de la que clonar los settings');

  const ahora = new Date().toISOString();

  // 1. clubes — antes que los alias, que los referencian por FK
  for (const c of clubesNuevos) {
    await escribir('clubs', 'POST', [{
      id: c.id,
      name: c.nombre,
      sport_id: 'field-hockey',
      city: 'Mar del Plata',
      country: 'Argentina',
      created_at: ahora,
      updated_at: ahora,
    }]);
    console.log(`  ✓ club ${c.id}`);
  }

  // 2. alias
  if (aliasNuevos.length) {
    await escribir('club_external_ids', 'POST', aliasNuevos.map((a) => ({
      provider: AAMH_PROVIDER,
      external_id: a.clave,
      club_id: a.clubId,
    })));
    console.log(`  ✓ ${aliasNuevos.length} alias`);
  }

  // 3. adopciones: el torneo ya existe con sus partidos cargados a mano, así
  //    que solo se le escribe la identidad. El cron después empareja cada
  //    partido por par de clubes y día, y le pone su `aamh:m{mid}`.
  for (const t of torneosAdoptar) {
    const nombreEnLaBase = ADOPTAR[t.externalId];
    const encontrados = await leer<{ id: string; external_id: string | null }[]>(
      `tournaments?sport_id=eq.field-hockey&name=eq.${nombreEnLaBase}&select=id,external_id`,
    );
    if (encontrados.length !== 1) {
      console.warn(`  ! "${nombreEnLaBase}": ${encontrados.length} coincidencias, no se adopta`);
      continue;
    }
    if (encontrados[0].external_id) {
      console.warn(`  ! "${nombreEnLaBase}" ya tiene external_id (${encontrados[0].external_id}), no se toca`);
      continue;
    }
    await escribir(`tournaments?id=eq.${encontrados[0].id}`, 'PATCH', {
      external_id: t.externalId,
      updated_at: ahora,
    });
    console.log(`  ✓ adoptado "${nombreEnLaBase}" → ${t.externalId}`);
  }

  // 4. torneos nuevos: la cadena tournaments → tournament_seasons → phases va
  //    en dos pasos porque `current_season_id` apunta a una fila que todavía
  //    no existe.
  for (const t of torneosNuevos) {
    const tournamentId = crypto.randomUUID();
    const seasonId = crypto.randomUUID();
    const slugPropio = claveDeNombre(t.nombreLargo).replace(/ /g, '-');

    await escribir('tournaments', 'POST', [{
      id: tournamentId,
      union_id: plantilla.union_id,
      season_id: String(ANIO),
      name: t.nombreLargo,
      slug: slugPropio,
      status: 'published',
      age_grade: t.division.startsWith('Sub') ? t.division : 'Mayores',
      region: plantilla.region,
      country: plantilla.country,
      country_id: plantilla.country_id,
      country_name: plantilla.country_name,
      format: 'league',
      is_visible: true,
      is_active: true,
      ruleset: plantilla.ruleset,
      ruleset_version: plantilla.ruleset_version,
      sport_id: 'field-hockey',
      sport: 'field-hockey',
      sport_name: plantilla.sport_name,
      external_id: t.externalId,
      priority: 0,
      sponsors: [],
      social_links: {},
      original_name: t.nombreLargo,
      display_order: 0,
      is_popular: false,
      is_api_managed: false,
      review_status: 'approved',
      gender: GENERO[claveDeNombre(t.genero)] ?? null,
      created_at: ahora,
      updated_at: ahora,
    }]);

    await escribir('tournament_seasons', 'POST', [{
      id: seasonId,
      tournament_id: tournamentId,
      legacy_tournament_id: tournamentId,
      season_code: String(ANIO),
      name: t.nombreLargo,
      display_name: t.nombreLargo,
      slug: slugPropio,
      status: 'draft',
      is_active: false,
      format: 'league',
      ruleset: plantilla.ruleset,
      created_at: ahora,
      updated_at: ahora,
    }]);
    await escribir(`tournaments?id=eq.${tournamentId}`, 'PATCH', { current_season_id: seasonId });

    await escribir('tournament_phases', 'POST', [{
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      season_id: seasonId,
      name: 'Fase Regular',
      phase_type: 'league',
      order_index: 1,
      is_active: true,
      settings: fasePlantilla.settings,
      created_at: ahora,
      updated_at: ahora,
    }]);

    console.log(`  ✓ ${t.nombreLargo} (${tournamentId})`);
  }

  console.log('\nListo. Ahora corré /api/cron/aamh-sync?dry=1 para ver el plan de partidos.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
