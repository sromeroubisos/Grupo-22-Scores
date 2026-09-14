/**
 * Carga la visita de la Academia Nacional Italiana M19: los dos seleccionados,
 * la convocatoria del Bloque 1 argentino y los dos amistosos.
 *
 *   node scripts/m19-italia/seed.mjs --plan
 *   node scripts/m19-italia/seed.mjs --execute
 *
 * Los escudos tienen que estar ANTES en `public/clubs/` (los deja
 * `node scripts/escudos/variantes.mjs`): la base guarda la RUTA, y una ruta a un
 * archivo que no está no falla, deja el escudo roto.
 *
 * Un amistoso es una fila de `matches` con `tournament_id` en null y el deporte
 * cargado a mano. El `round_label` es lo que la ficha del club muestra como
 * torneo, así que no va vacío.
 *
 * LAS FICHAS: `people` tiene una fila por (jugador, club), y la del jugador vive
 * en su CLUB DE ORIGEN; la convocatoria es una membresía de `argentina-m19` en
 * `team_memberships`, con el plazo en `joined_at`/`left_at`. Antes de crear una
 * ficha se busca la que ya existe con el nombre completo plegado (sin tildes):
 * crear una segunda parte la historia del jugador en dos.
 *
 * Idempotente: los clubes y partidos que ya están se reusan (partidos por
 * `external_id`), las fichas se buscan antes de crearse y las membresías del
 * plazo se reemplazan, no se suman.
 */
import fs from 'node:fs';
import path from 'node:path';

import { ARGENTINA, BLOQUE_1, ITALIA, PARTIDOS, PLAZO_BLOQUE_1 } from './datos.mjs';

const REPO = process.cwd();

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

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

async function escribir(metodo, recurso, cuerpo, devolver = false) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: devolver ? 'return=representation' : 'return=minimal' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  return devolver ? res.json() : null;
}

const plegar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nombreCompleto = (j) => `${j.nombre} ${j.apellido}`;
/**
 * Patrón de ILIKE del NOMBRE COMPLETO que no depende de las tildes: cada vocal es
 * un comodín de un carácter, y sin `*` a los costados. Con el apellido solo y
 * abierto ("*_g__*" para Egea) el patrón pegaba en cientos de fichas, el tope de
 * filas dejaba afuera la buena y la segunda corrida creó un Lorenzo Egea
 * duplicado.
 */
const patronNombre = (completo) => plegar(completo).replace(/[aeiou]/g, '_').replace(/ /g, '_');

const ahora = new Date().toISOString();

function filaDeClub(c) {
  const escudo = path.join(REPO, 'public', 'clubs', `${c.id}.png`);
  if (!fs.existsSync(escudo)) throw new Error(`falta el escudo public/clubs/${c.id}.png — corré scripts/escudos/variantes.mjs primero`);
  return {
    id: c.id,
    union_id: c.union_id,
    name: c.name,
    short_name: c.name,
    city: null,
    region: null,
    country: c.country,
    logo_url: `/clubs/${c.id}.png`,
    primary_color: c.primary_color ?? null,
    slug: c.id,
    is_visible: true,
    entity_type: 'club',
    sport: 'rugby',
    sport_id: 'rugby',
    category: null,
    categories: [],
    status: 'active',
    visibility: 'visible',
    external_id: null,
    created_at: ahora,
    updated_at: ahora,
  };
}

/**
 * La ficha de cada convocado. Se reusa la que tenga el nombre completo IDÉNTICO
 * (plegado) y cuelgue del club de origen o de una división de ese club; una
 * homónima en un club que no tiene nada que ver se informa y NO se toma: dos
 * carreras distintas se fundirían en una.
 */
async function resolverFichas() {
  const salida = [];
  for (const j of BLOQUE_1) {
    const completo = nombreCompleto(j);
    const clave = plegar(completo);
    const patron = patronNombre(completo);
    const filas = await leer(`people?select=id,full_name,name,club_id,created_at&or=(full_name.ilike.${patron},name.ilike.${patron})&order=created_at&limit=1000`);
    const mismas = filas.filter((p) => plegar(p.full_name || p.name || '') === clave);
    const clubOrigen = j.club ?? ARGENTINA.id;
    const propia = mismas.find((p) => p.club_id === clubOrigen)
      ?? mismas.find((p) => j.club && p.club_id?.startsWith(`${j.club}-`))
      ?? mismas.find((p) => p.club_id === ARGENTINA.id);
    const ajenas = mismas.filter((p) => p !== propia);
    salida.push({ jugador: j, completo, clubOrigen, existente: propia ?? null, ajenas });
  }
  return salida;
}

async function main() {
  console.log(`modo: ${modo}\n`);

  // ── Clubes ─────────────────────────────────────────────────────────────────
  const colores = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'm19-italia', 'colores.json'), 'utf8'));
  const selecciones = [ARGENTINA, ITALIA].map((c) => ({ ...c, primary_color: c.primary_color ?? colores[c.id] ?? null }));
  const existentes = new Set((await leer(`clubs?select=id&id=in.(${selecciones.map((c) => c.id).join(',')})`)).map((c) => c.id));
  const clubesNuevos = selecciones.filter((c) => !existentes.has(c.id));
  console.log('seleccionados:');
  for (const c of selecciones) console.log(`  ${existentes.has(c.id) ? '=' : '+'} ${c.name.padEnd(14)} ${c.id.padEnd(14)} ${c.union_id} · ${c.primary_color}`);

  const origenes = [...new Set(BLOQUE_1.map((j) => j.club).filter(Boolean))];
  const origenesDb = new Set((await leer(`clubs?select=id&id=in.(${origenes.join(',')})`)).map((c) => c.id));
  const faltan = origenes.filter((id) => !origenesDb.has(id));
  if (faltan.length) throw new Error(`clubes de origen inexistentes: ${faltan.join(', ')}`);

  // ── Fichas ─────────────────────────────────────────────────────────────────
  const fichas = await resolverFichas();
  console.log(`\nconvocatoria Bloque 1 (${fichas.length}) · ${PLAZO_BLOQUE_1.desde} → ${PLAZO_BLOQUE_1.hasta}:`);
  for (const f of fichas) {
    const estado = f.existente ? `reusa ${f.existente.id.slice(0, 8)} (${f.existente.club_id})` : `+ ficha nueva en ${f.clubOrigen}`;
    console.log(`  ${f.completo.padEnd(30)} ${estado}`);
    for (const a of f.ajenas) console.log(`      homónimo NO tomado: ${a.id.slice(0, 8)} en ${a.club_id}`);
  }

  // ── Partidos ───────────────────────────────────────────────────────────────
  const ids = PARTIDOS.map((p) => p.externalId);
  const partidosDb = new Map((await leer(`matches?select=id,external_id&external_id=in.(${ids.map((i) => `"${i}"`).join(',')})`)).map((m) => [m.external_id, m.id]));
  console.log('\namistosos:');
  for (const p of PARTIDOS) {
    const hora = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'full', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(p.dateTime));
    const marcador = p.score ? `${p.score.home}-${p.score.away}` : 'vs';
    console.log(`  ${partidosDb.has(p.externalId) ? '=' : '+'} ${p.local} ${marcador} ${p.visitante} · ${hora} · ${p.venue ?? 'cancha a confirmar'} · ${p.status}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  if (clubesNuevos.length) await escribir('POST', 'clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes nuevos`);

  const nuevas = fichas.filter((f) => !f.existente);
  if (nuevas.length) {
    const creadas = await escribir('POST', 'people?select=id,full_name,club_id', nuevas.map((f) => ({
      club_id: f.clubOrigen,
      first_name: f.jugador.nombre,
      last_name: f.jugador.apellido,
      full_name: f.completo,
      name: f.completo,
      position: null,
      role: 'player',
      status: 'active',
      source: 'quick-squad',
    })), true);
    for (const c of creadas) {
      const f = nuevas.find((n) => n.completo === c.full_name && n.clubOrigen === c.club_id);
      if (f) f.existente = c;
    }
  }
  console.log(`✓ ${nuevas.length} fichas nuevas, ${fichas.length - nuevas.length} reusadas`);

  // La convocatoria DE ESTE PLAZO se reemplaza; las de otros plazos no se tocan.
  const { desde, hasta } = PLAZO_BLOQUE_1;
  await escribir('DELETE', `team_memberships?club_id=eq.${ARGENTINA.id}&joined_at=eq.${desde}&left_at=eq.${hasta}`);
  await escribir('POST', 'team_memberships', fichas.map((f) => ({
    club_id: ARGENTINA.id,
    person_id: f.existente.id,
    role: 'player',
    status: 'active',
    position: null,
    jersey_number: null,
    joined_at: desde,
    left_at: hasta,
    notes: `Bloque 1 · ${f.jugador.clubTexto} (${f.jugador.union})`,
  })));
  console.log(`✓ convocatoria: ${fichas.length} membresías`);

  for (const p of PARTIDOS) {
    const fila = {
      tournament_id: null,
      home_club_id: p.local,
      away_club_id: p.visitante,
      date_time: new Date(p.dateTime).toISOString(),
      venue: p.venue,
      status: p.status,
      score: p.score,
      sport_id: 'rugby',
      sport: 'rugby',
      round_label: p.roundLabel,
      notes: p.notes,
      is_visible: true,
      review_status: 'approved',
      external_id: p.externalId,
      updated_at: ahora,
    };
    const id = partidosDb.get(p.externalId);
    if (id) {
      await escribir('PATCH', `matches?id=eq.${id}`, fila);
      console.log(`✓ partido actualizado ${p.externalId} (${id})`);
    } else {
      const [creado] = await escribir('POST', 'matches?select=id', fila, true);
      console.log(`✓ partido creado ${p.externalId} (${creado.id})`);
    }
  }
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
