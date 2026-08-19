/**
 * Filiales y alias para los torneos AHL vinculados:
 *
 *   npx tsx src/scripts/ahl-crear-filiales.ts --plan
 *   npx tsx src/scripts/ahl-crear-filiales.ts --execute
 *
 * Igual que fedhockeycba-crear-filiales pero leyendo los Boletines
 * Competencia de la AHL. Reglas idénticas: ALIAS solo con certeza (exacto,
 * variante trivial o curado a mano), FILIAL nueva para lo demás, escudo del
 * club madre solo cuando es inequívoco. La primera división ('1') es lo
 * único que alimenta a los torneos.
 *
 * Curadurías que importan acá:
 * - El boletín abrevia: "JOCKEY A" es Jockey Club de Rosario "A",
 *   "PROVINCIAL A" es C.A. Provincial — mapeado a mano contra los 17 clubes
 *   que la unión ya tiene en la base.
 * - "ROWING" (Litoral B) es ROSARIO Rowing, NO el Paraná Rowing que ya
 *   existe: madre forzada a null para no regalarle un escudo ajeno. Ídem
 *   "REGATAS A": no es seguro que sea el Regatas de San Nicolás.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchPaginaBoletinCompetencia, fetchPdf, pausa, PAUSA_MS } from '../lib/integrations/ahl/client.ts';
import { lineasDelPdf } from '../lib/integrations/fedhockeycba/pdf-text.ts';
import { parseBoletinCompetencia } from '../lib/integrations/ahl/boletin-parser.ts';
import { buildTeamAlias, claveDeNombre, AHL_ID_PREFIX, AHL_PROVIDER } from '../lib/integrations/ahl/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');
const UNION = 'asociacion-de-hockey-del-litoral';
const BOLETINES = 2;

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

function claveCanonica(clave: string): string {
  return clave.replace(/\b(roja|blanca|negra|amarilla)\b/g, (c) => c.slice(0, -1) + 'o');
}

const TOKENS_DE_PLANTEL = new Set(['a', 'b', 'c', 'd', 'rojo', 'azul', 'blanco', 'verde', 'negro']);

function baseDePlantel(clave: string): string {
  const palabras = clave.split(' ');
  while (palabras.length > 1 && TOKENS_DE_PLANTEL.has(palabras[palabras.length - 1])) palabras.pop();
  return palabras.join(' ');
}

const MINUSCULAS = new Set(['y', 'de', 'del', 'la', 'las', 'el', 'los']);

function nombreProlijo(crudo: string): string {
  return crudo
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && MINUSCULAS.has(w.toLowerCase())) return w.toLowerCase();
      // Una sigla corta (GEP, CGR, ADEO, MJ) se queda en mayúsculas.
      if (w.length <= 4 && w === w.toUpperCase()) return w;
      return w.replace(/[A-ZÁÉÍÓÚÑÜa-záéíóúñü]+/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
    })
    .join(' ');
}

const compacta = (s: string) => s.replace(/ /g, '');

interface ClubDeUnion { id: string; name: string; logo_url: string | null; primary_color: string | null }

/** El boletín abrevia: mapeo a mano contra los clubes que la unión ya tiene. */
const ALIAS_CURADOS: Record<string, Record<string, string>> = {
  'clausura-litoral-a': {
    'old resian a': 'old-resian-club-hockey',
    'atl del rosario a': 'atletico-del-rosario-a',
    'jockey a': 'jockey-club-de-rosario-a',
    'jockey b': 'jockey-rosario-b',
    'duendes a': 'duendes-damas-a',
    'provincial a': 'c-a-provincial-a',
    'universitario a': 'universitario-de-rosario-hockey',
  },
  'clausura-litoral-b': {
    'logaritmo': 'logaritmo-rugby-club-hockey',
    'caranchos': 'los-caranchos-hockey',
  },
};

/** Madres forzadas: null = sin escudo, mejor que un escudo ajeno. */
const MADRES_CURADAS: Record<string, string | null> = {
  'rowing': null,
  'regatas a': null,
  'regatas b': null,
};

async function main() {
  const torneos = await leer<{ id: string; external_id: string }[]>(
    `tournaments?select=id,external_id&external_id=like.${AHL_ID_PREFIX}*`,
  );
  const slugs = new Set(torneos.map((t) => t.external_id.slice(AHL_ID_PREFIX.length)));
  const alias = new Set(
    (await leer<{ external_id: string }[]>(`club_external_ids?select=external_id&provider=eq.${AHL_PROVIDER}&limit=2000`))
      .map((a) => a.external_id),
  );
  const clubesDeUnion = await leer<ClubDeUnion[]>(
    `clubs?select=id,name,logo_url,primary_color&union_id=eq.${UNION}`,
  );
  const porClaveDeClub = new Map(clubesDeUnion.map((c) => [claveCanonica(claveDeNombre(c.name)), c] as const));

  // ── los equipos que el boletín nombra y la base no conoce ────────────────
  const rPagina = await fetchPaginaBoletinCompetencia();
  if (!rPagina.ok || !rPagina.data) throw new Error(`ahl.com.ar: HTTP ${rPagina.status}`);

  const sinResolver = new Map<string, Map<string, string>>();
  for (const url of rPagina.data.pdfs.slice(0, BOLETINES)) {
    const pdf = await fetchPdf(url);
    await pausa(PAUSA_MS);
    if (!pdf.ok || !pdf.data) { console.warn(`! PDF ${url}: HTTP ${pdf.status}`); continue; }
    for (const seccion of parseBoletinCompetencia(await lineasDelPdf(pdf.data)).secciones) {
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

  const buscarMadre = (canonica: string): ClubDeUnion | null => {
    if (canonica in MADRES_CURADAS) {
      const id = MADRES_CURADAS[canonica];
      return id === null ? null : clubesDeUnion.find((c) => c.id === id) ?? null;
    }
    const base = baseDePlantel(canonica);
    if (!base) return null;
    const candidatas = clubesDeUnion.filter((c) => {
      const cc = claveCanonica(claveDeNombre(c.name));
      return cc !== canonica && compacta(cc).includes(compacta(base));
    });
    return candidatas.sort((a, b) => a.name.length - b.name.length)[0] ?? null;
  };

  const crear = new Map<string, { id: string; nombre: string; madre: ClubDeUnion | null }>();
  const altasDeAlias: { external_id: string; filial?: { id: string }; club_id?: string; detalle: () => string }[] = [];

  for (const [slug, equipos] of sinResolver) {
    for (const [clave, nombreCrudo] of equipos) {
      const canonica = claveCanonica(clave);

      const curado = ALIAS_CURADOS[slug]?.[canonica];
      if (curado) {
        altasDeAlias.push({ external_id: buildTeamAlias(slug, clave), club_id: curado, detalle: () => `${slug} ← "${nombreCrudo}" ALIAS CURADO a ${curado}` });
        continue;
      }
      const existente = porClaveDeClub.get(canonica);
      if (existente) {
        altasDeAlias.push({ external_id: buildTeamAlias(slug, clave), club_id: existente.id, detalle: () => `${slug} ← "${nombreCrudo}" ALIAS a ${existente.id}` });
        continue;
      }
      let filial = crear.get(canonica);
      if (!filial) {
        filial = { id: canonica.replace(/ /g, '-'), nombre: nombreProlijo(nombreCrudo), madre: buscarMadre(canonica) };
        crear.set(canonica, filial);
      }
      const f = filial;
      altasDeAlias.push({ external_id: buildTeamAlias(slug, clave), filial: f, detalle: () => `${slug} ← "${nombreCrudo}" → ${f.id}` });
    }
  }

  // Colisión de ids consultando solo los candidatos (PostgREST corta en 1000).
  const filiales = [...crear.values()];
  if (filiales.length) {
    const consultar = async (ids: string[]) =>
      new Set((await leer<{ id: string }[]>(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
    let ocupados = await consultar(filiales.map((f) => f.id));
    for (const f of filiales) if (ocupados.has(f.id)) f.id = `${f.id}-hockey`;
    ocupados = await consultar(filiales.map((f) => f.id));
    for (const f of filiales) if (ocupados.has(f.id)) f.id = `${f.id}-ahl`;
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
    city: 'Rosario',
    region: 'Santa Fe',
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
    provider: AHL_PROVIDER, external_id: a.external_id, club_id: a.club_id ?? a.filial!.id,
  })));
  console.log(`Aplicado: ${crear.size} filiales, ${altasDeAlias.length} alias.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
