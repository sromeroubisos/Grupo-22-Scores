/**
 * Filiales y alias que faltan para la Copa Córdoba y el Damas B:
 *
 *   npx tsx src/scripts/fedhockeycba-crear-filiales.ts --plan
 *   npx tsx src/scripts/fedhockeycba-crear-filiales.ts --execute
 *
 * Lee los fixtures REALES de la web (los mismos PDFs que usa el cron), junta
 * los equipos que hoy no resuelven a ningún club, y decide por reglas
 * conservadoras:
 *
 * - ALIAS sólo ante variante trivial del nombre de un club existente de la
 *   unión (género del color: "La Tablada Rojo" ↔ "La Tablada - Roja").
 * - CREAR filial para todo lo demás — regla confirmada del proyecto: los
 *   planteles ("La Salle «Blanco»" juega el Damas B mientras La Salle H.C.
 *   juega el A) son filas SEPARADAS, nunca se fusionan. La filial hereda
 *   escudo y color del club madre cuando se lo identifica; ciudad, unión y
 *   deporte salen de la fila modelo de la federación.
 *
 * Idempotente: lo ya sembrado o creado se saltea. El plan imprime cada
 * decisión para revisarla antes del --execute.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchPdf, fetchPostsRecientes, pausa, pdfsDeFixture, PAUSA_MS } from '../lib/integrations/fedhockeycba/client.ts';
import { lineasDelPdf } from '../lib/integrations/fedhockeycba/pdf-text.ts';
import { parseFixture } from '../lib/integrations/fedhockeycba/fixture-parser.ts';
import { buildTeamAlias, claveDeNombre, FEDHOCKEYCBA_ID_PREFIX, FEDHOCKEYCBA_PROVIDER } from '../lib/integrations/fedhockeycba/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');
const UNION = 'federacion-cordobesa-de-hockey';
const DIAS = 30;

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function insertar(tabla: string, filas: unknown[]): Promise<void> {
  if (!filas.length) return;
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${await res.text()}`);
}

/** "la tablada rojo" y "la tablada roja" son el mismo equipo: el color en masculino canónico. */
function claveCanonica(clave: string): string {
  return clave.replace(/\b(roja|blanca|negra|amarilla)\b/g, (c) => c.slice(0, -1) + 'o');
}

const TOKENS_DE_PLANTEL = new Set([
  'rojo', 'roja', 'azul', 'blanco', 'blanca', 'verde', 'negro', 'negra', 'amarillo', 'amarilla',
  'celeste', 'azulgrana', 'gris', 'bordo', 'naranja', 'y', 'b', 'c', 'd',
]);

/** El nombre sin el color/letra del plantel: la base con la que se busca el club madre. */
function baseDePlantel(clave: string): string {
  const palabras = clave.split(' ');
  while (palabras.length > 1 && TOKENS_DE_PLANTEL.has(palabras[palabras.length - 1])) palabras.pop();
  return palabras.join(' ');
}

const ACRONIMOS = new Set(['HC', 'RC', 'MC', 'CP', 'UNRC']);
const MINUSCULAS = new Set(['y', 'de', 'del', 'la', 'las', 'el', 'los']);

/** 'LA SALLE HC "BLANCO"' → 'La Salle HC "Blanco"'. */
function nombreProlijo(crudo: string): string {
  return crudo
    .split(/\s+/)
    .map((w, i) => {
      const limpia = w.replace(/[«»"']/g, '');
      if (ACRONIMOS.has(limpia.toUpperCase())) return w.toUpperCase();
      if (i > 0 && MINUSCULAS.has(limpia.toLowerCase())) return w.toLowerCase();
      return w.replace(/[A-ZÁÉÍÓÚÑÜa-záéíóúñü]+/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
    })
    .join(' ');
}

const compacta = (s: string) => s.replace(/ /g, '');
const sinAcronimos = (s: string) => s.split(' ').filter((w) => !['rc', 'hc', 'mc', 'cp'].includes(w)).join(' ');

interface ClubDeUnion { id: string; name: string; short_name: string | null; logo_url: string | null; primary_color: string | null }

async function main() {
  // ── lo que ya hay ────────────────────────────────────────────────────────
  const torneos = await leer<{ id: string; external_id: string }[]>(
    `tournaments?select=id,external_id&external_id=like.${FEDHOCKEYCBA_ID_PREFIX}*`,
  );
  const slugs = new Set(torneos.map((t) => t.external_id.slice(FEDHOCKEYCBA_ID_PREFIX.length)));
  const alias = new Set(
    (await leer<{ external_id: string }[]>(`club_external_ids?select=external_id&provider=eq.${FEDHOCKEYCBA_PROVIDER}&limit=2000`))
      .map((a) => a.external_id),
  );
  const clubesDeUnion = await leer<ClubDeUnion[]>(
    `clubs?select=id,name,short_name,logo_url,primary_color&union_id=eq.${UNION}`,
  );

  // ── los equipos que la web nombra y la base no conoce ────────────────────
  const rPosts = await fetchPostsRecientes();
  if (!rPosts.ok || !rPosts.data) throw new Error(`fedhockeycba: HTTP ${rPosts.status}`);
  const corte = Date.now() - DIAS * 86_400_000;
  const pdfs = new Set<string>();
  for (const post of rPosts.data.filter((p) => Date.parse(p.modified) >= corte)) {
    for (const u of pdfsDeFixture(post.contenidoHtml)) pdfs.add(u);
  }

  // slug → clave → nombre original (el primero que se vio)
  const sinResolver = new Map<string, Map<string, string>>();
  for (const url of pdfs) {
    const rPdf = await fetchPdf(url);
    await pausa(PAUSA_MS);
    if (!rPdf.ok || !rPdf.data) { console.warn(`! PDF ${url}: HTTP ${rPdf.status}`); continue; }
    for (const seccion of parseFixture(await lineasDelPdf(rPdf.data)).secciones) {
      if (!slugs.has(seccion.slug)) continue;
      for (const p of seccion.partidos.filter((x) => x.division === '1')) {
        for (const nombre of [p.local, p.visitante]) {
          const clave = claveDeNombre(nombre);
          if (alias.has(buildTeamAlias(seccion.slug, clave))) continue;
          if (!sinResolver.has(seccion.slug)) sinResolver.set(seccion.slug, new Map());
          if (!sinResolver.get(seccion.slug)!.has(clave)) sinResolver.get(seccion.slug)!.set(clave, nombre);
        }
      }
    }
  }

  // ── decisión por equipo. La filial es GLOBAL (un club puede jugar dos
  // torneos); el alias es POR TORNEO. ──────────────────────────────────────
  const porClaveDeClub = new Map(clubesDeUnion.map((c) => [claveCanonica(claveDeNombre(c.name)), c] as const));

  /**
   * Correcciones a mano de la búsqueda de club madre, revisadas contra el
   * plan: la heurística de contención le daba a Alta Gracia RC el escudo de
   * Sporting Alta Gracia (clubes DISTINTOS que comparten localidad — un
   * escudo ajeno es peor que ninguno), y no encontraba la rama caballeros de
   * Jockey Villa María por el "Club de" del medio. `null` fuerza sin madre.
   */
  const MADRES_CURADAS: Record<string, string | null> = {
    'alta gracia rc': null,
    'jockey villa maria': 'jockey-club-de-villa-maria-hockey-cabanlleros',
  };

  /**
   * Typos de la propia federación: dos grafías del MISMO equipo. La clave
   * curada define la identidad (un solo club); el alias se siembra igual con
   * la grafía original, porque el PDF va a seguir escribiéndola mal.
   */
  const CLAVES_CURADAS: Record<string, string> = {
    'alianza jesua maria': 'alianza jesus maria',
    'jockey villar maria b': 'jockey villa maria b',
  };
  const NOMBRE_POR_CLAVE: Record<string, string> = {
    'jockey villa maria b': 'Jockey Villa María "B"',
  };

  /**
   * Alias curados por torneo: en los torneos MASCULINOS el mismo nombre pela
   * ("CÓRDOBA ATHLETIC", "BARRIO PARQUE") nombra a la rama caballeros, que ya
   * existe como fila propia — sin esto el matcher automático aliasaría al
   * club de damas o crearía un duplicado.
   */
  const ALIAS_CURADOS: Record<string, Record<string, string>> = {
    'torneo-interprovincial-caballeros-2026': {
      'cordoba athletic': 'cordoba-athletic-club-caballeros',
      'la salle hc': 'la-salle-h-c-caballeros',
      'universitario cordoba': 'club-universitario-de-cordoba-hockey-caballeros',
      'jockey club cordoba': 'jockey-club-cordoba-caballeros',
      'palermo bajo': 'club-palermo-bajo-caballeros',
    },
    'torneo-oficial-caballeros-b-2026': {
      'jockey villa maria': 'jockey-club-de-villa-maria-hockey-cabanlleros',
      'barrio parque': 'barrio-parque-caballeros',
      'sporting alta gracia': 'sporting-alta-gracia-hockey-caballeros',
      'palermo bajo': 'club-palermo-bajo-caballeros',
      'la salle hc': 'la-salle-h-c-caballeros',
      'cordoba athletic': 'cordoba-athletic-club-caballeros',
      'universitario cordoba': 'club-universitario-de-cordoba-hockey-caballeros',
      'jockey club cordoba': 'jockey-club-cordoba-caballeros',
    },
  };

  /** El club madre para heredar escudo y color: la clave compacta de la base
   * contenida en la de algún club de la unión ("lasallehc" ⊂ "lasallehc" de
   * "La Salle H.C."), probando también sin el RC/HC ("tala" ⊂ "tala damas a"). */
  const buscarMadre = (canonica: string): ClubDeUnion | null => {
    if (canonica in MADRES_CURADAS) {
      const id = MADRES_CURADAS[canonica];
      return id === null ? null : clubesDeUnion.find((c) => c.id === id) ?? null;
    }
    for (const base of [baseDePlantel(canonica), sinAcronimos(baseDePlantel(canonica))]) {
      if (!base) continue;
      const candidatas = clubesDeUnion.filter((c) => {
        const cc = claveCanonica(claveDeNombre(c.name));
        return cc !== canonica && compacta(cc).includes(compacta(base));
      });
      if (candidatas.length) return candidatas.sort((a, b) => a.name.length - b.name.length)[0];
    }
    return null;
  };

  const crear = new Map<string, { id: string; nombre: string; madre: ClubDeUnion | null }>();
  const altasDeAlias: { external_id: string; filial?: { id: string }; club_id?: string; detalle: () => string }[] = [];

  for (const [slug, equipos] of sinResolver) {
    for (const [clave, nombreCrudo] of equipos) {
      const canonica = CLAVES_CURADAS[claveCanonica(clave)] ?? claveCanonica(clave);

      // alias curado por torneo → manda sobre cualquier heurística
      const curado = ALIAS_CURADOS[slug]?.[canonica];
      if (curado) {
        altasDeAlias.push({ external_id: buildTeamAlias(slug, clave), club_id: curado, detalle: () => `${slug} ← "${nombreCrudo}" ALIAS CURADO a ${curado}` });
        continue;
      }

      // variante trivial de un club existente → alias y nada más
      const existente = porClaveDeClub.get(canonica);
      if (existente) {
        altasDeAlias.push({ external_id: buildTeamAlias(slug, clave), club_id: existente.id, detalle: () => `${slug} ← "${nombreCrudo}" ALIAS a ${existente.id}` });
        continue;
      }

      // filial nueva (una sola aunque juegue dos torneos)
      let filial = crear.get(canonica);
      if (!filial) {
        filial = { id: canonica.replace(/ /g, '-'), nombre: NOMBRE_POR_CLAVE[canonica] ?? nombreProlijo(nombreCrudo), madre: buscarMadre(canonica) };
        crear.set(canonica, filial);
      }
      const f = filial;
      altasDeAlias.push({ external_id: buildTeamAlias(slug, clave), filial: f, detalle: () => `${slug} ← "${nombreCrudo}" → ${f.id}` });
    }
  }

  // Colisión de ids contra la base ENTERA, consultando sólo los candidatos:
  // un select global se corta en las 1000 filas de PostgREST y miente.
  const filiales = [...crear.values()];
  if (filiales.length) {
    const consultar = async (ids: string[]) =>
      new Set((await leer<{ id: string }[]>(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
    let ocupados = await consultar(filiales.map((f) => f.id));
    for (const f of filiales) if (ocupados.has(f.id)) f.id = `${f.id}-hockey`;
    ocupados = await consultar(filiales.map((f) => f.id));
    for (const f of filiales) if (ocupados.has(f.id)) f.id = `${f.id}-fchc`;
  }

  console.log(`Filiales a crear (${crear.size}):`);
  for (const f of crear.values()) {
    console.log(`  + ${f.id} "${f.nombre}"${f.madre ? ` (escudo de ${f.madre.id})` : ' (sin club madre: sin escudo)'}`);
  }
  console.log(`Alias a sembrar (${altasDeAlias.length}):`);
  for (const a of altasDeAlias) console.log(`  - ${a.detalle()}`);

  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  await insertar('clubs', [...crear.values()].map((f) => ({
    id: f.id,
    slug: f.id,
    name: f.nombre,
    short_name: f.nombre,
    union_id: UNION,
    city: 'Córdoba',
    region: 'Córdoba',
    country: 'Argentina',
    sport: 'field-hockey',
    sport_id: 'field-hockey',
    entity_type: 'club',
    status: 'active',
    visibility: 'visible',
    is_visible: true,
    logo_url: f.madre?.logo_url ?? null,
    primary_color: f.madre?.primary_color ?? null,
    categories: [],
  })));
  await insertar('club_external_ids', altasDeAlias.map((a) => ({
    provider: FEDHOCKEYCBA_PROVIDER, external_id: a.external_id, club_id: a.club_id ?? a.filial!.id,
  })));
  console.log(`Aplicado: ${crear.size} filiales, ${altasDeAlias.length} alias.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
