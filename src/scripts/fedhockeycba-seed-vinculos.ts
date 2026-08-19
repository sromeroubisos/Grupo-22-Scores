/**
 * Siembra de los vínculos web ↔ base para el sync de fedhockeycba:
 *
 *   npx tsx src/scripts/fedhockeycba-seed-vinculos.ts --plan
 *   npx tsx src/scripts/fedhockeycba-seed-vinculos.ts --execute
 *
 * Hace dos cosas, ambas idempotentes:
 *
 * 1. Escribe `tournaments.external_id = 'fedhockeycba:{slug}'` en los torneos
 *    de Córdoba ya cargados. El slug es la clave del ENCABEZADO con el que la
 *    federación escribe el torneo en su fixture — así el route matchea una
 *    sección del PDF con su torneo sin tabla de traducción.
 *
 * 2. Siembra `club_external_ids` (provider 'fedhockeycba') con los alias de
 *    equipo por torneo: `{slug}|{claveDeNombre}`. Salen de los participantes
 *    reales del torneo — el nombre del participante, el del club, y la
 *    variante sin sufijo de rama ("Jockey Club Córdoba - Damas «A»" también
 *    responde a "jockey club cordoba"). Una variante que colisiona entre dos
 *    clubes del mismo torneo NO se siembra: se reporta, porque elegir a
 *    ciegas escribiría partidos en el club equivocado.
 *
 * Los nombres que la web usa y acá no queden cubiertos van a aparecer en el
 * `equipo_no_resuelto` del cron: agregar ese alias es UNA fila en
 * `club_external_ids`, con este mismo formato.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { buildTeamAlias, claveDeNombre, FEDHOCKEYCBA_ID_PREFIX, FEDHOCKEYCBA_PROVIDER } from '../lib/integrations/fedhockeycba/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');

/**
 * Torneo de la base (por nombre EXACTO, ya verificado) → encabezado del
 * fixture de la federación del que sale el slug.
 */
const VINCULOS: { nombre: string; encabezado: string }[] = [
  { nombre: 'Torneo Apertura Damas "A" - Córdoba', encabezado: "TORNEO OFICIAL DAMAS 'A' 2026" },
  { nombre: 'Torneo Apertura - Damas "B" Córdoba', encabezado: "TORNEO OFICIAL DAMAS 'B' 2026" },
  { nombre: 'COPA CÓRDOBA 2026', encabezado: 'COPA CÓRDOBA Damas 2026' },
  { nombre: 'TORNEO CABALLEROS CÓRDOBA', encabezado: 'TORNEO OFICIAL CABALLEROS 2026' },
];

/**
 * Alias curados a mano: los nombres CORTOS con los que el fixture semanal
 * escribe a los equipos (salieron del `equipo_no_resuelto` de un dry-run
 * real del cron). Dentro del torneo son inequívocos: en el PDF "JOCKEY CLUB"
 * a secas es el equipo A y "JOCKEY CLUB «B»" es el B. La clave va ya
 * normalizada con `claveDeNombre`.
 */
const EXTRAS: Record<string, Record<string, string>> = {
  'torneo-oficial-damas-a-2026': {
    'tala rc': 'tala-rugby-club-hockey',
    'la salle hc': 'la-salle-h-c',
    'uru cure rc': 'uru-cure-rugby-club-hockey-3',
    'jockey club': 'jockey-club-cordoba-hockey',
    'jockey club b': 'jockey-club-cordoba-b',
    'cordoba athletic': 'cordoba-athletic-club-hockey',
    'universitario': 'club-universitario-de-cordoba',
    'universitario rojo': 'club-universitario-de-cordoba-rojo',
  },
};

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function escribir(recurso: string, metodo: 'PATCH' | 'POST', cuerpo: unknown): Promise<unknown[]> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

/** La variante "de crónica" de un nombre: sin la rama ni la letra del equipo. */
function sinSufijoDeRama(nombre: string): string {
  return nombre
    .replace(/\s*-\s*(damas|caballeros|roja?|azul|blanco|verde|negro|rojo)\b.*$/i, '')
    .replace(/\s+(damas|caballeros)\b.*$/i, '')
    .replace(/\s+hockey(\s+caballeros)?\s*$/i, '')
    .replace(/\s*[«"']?[A-H][»"']?\s*$/, '')
    .trim();
}

async function main() {
  const torneos = await leer<{ id: string; name: string; external_id: string | null }[]>(
    `tournaments?select=id,name,external_id&union_id=eq.federacion-cordobesa-de-hockey&sport_id=eq.field-hockey`,
  );

  const aliasExistentes = await leer<{ external_id: string }[]>(
    `club_external_ids?select=external_id&provider=eq.${FEDHOCKEYCBA_PROVIDER}&limit=2000`,
  );
  const yaSembrados = new Set(aliasExistentes.map((a) => a.external_id));

  const patchesDeTorneo: { id: string; nombre: string; externalId: string }[] = [];
  const altasDeAlias: { external_id: string; club_id: string; detalle: string }[] = [];
  const avisos: string[] = [];

  for (const v of VINCULOS) {
    const t = torneos.find((x) => x.name.trim() === v.nombre);
    if (!t) { avisos.push(`No existe en la base: "${v.nombre}"`); continue; }

    const slug = claveDeNombre(v.encabezado).replace(/ /g, '-');
    const externalId = `${FEDHOCKEYCBA_ID_PREFIX}${slug}`;
    if (t.external_id !== externalId) patchesDeTorneo.push({ id: t.id, nombre: t.name, externalId });

    const participantes = await leer<{ club_id: string; name: string; clubs: { name: string } | null }[]>(
      `tournament_participants?select=club_id,name,clubs(name)&tournament_id=eq.${t.id}`,
    );

    // clave → club(es) que la reclaman; una clave con dos dueños no se siembra
    const reclamos = new Map<string, Set<string>>();
    const anotar = (nombre: string | null | undefined, clubId: string) => {
      const clave = claveDeNombre(String(nombre ?? ''));
      if (!clave) return;
      if (!reclamos.has(clave)) reclamos.set(clave, new Set());
      reclamos.get(clave)!.add(clubId);
    };
    for (const p of participantes) {
      anotar(p.name, p.club_id);
      anotar(p.clubs?.name, p.club_id);
      anotar(sinSufijoDeRama(p.name), p.club_id);
      if (p.clubs?.name) anotar(sinSufijoDeRama(p.clubs.name), p.club_id);
    }

    for (const [clave, duenios] of reclamos) {
      if (duenios.size > 1) {
        avisos.push(`${slug}: "${clave}" la reclaman ${[...duenios].join(' y ')} — no se siembra, resolver a mano`);
        continue;
      }
      const externalIdAlias = buildTeamAlias(slug, clave);
      if (yaSembrados.has(externalIdAlias)) continue;
      altasDeAlias.push({ external_id: externalIdAlias, club_id: [...duenios][0], detalle: `${slug} ← ${clave}` });
    }

    // Los alias curados pisan la duda, no lo sembrado: si la clave ya existe
    // se respeta lo que está y se avisa, que borrar es decisión de persona.
    for (const [clave, clubId] of Object.entries(EXTRAS[slug] ?? {})) {
      const externalIdAlias = buildTeamAlias(slug, clave);
      if (yaSembrados.has(externalIdAlias) || altasDeAlias.some((a) => a.external_id === externalIdAlias)) continue;
      altasDeAlias.push({ external_id: externalIdAlias, club_id: clubId, detalle: `${slug} ← ${clave} (curado)` });
    }
  }

  console.log(`Torneos a vincular (${patchesDeTorneo.length}):`);
  for (const p of patchesDeTorneo) console.log(`  - ${p.nombre} → ${p.externalId}`);
  console.log(`Alias a sembrar (${altasDeAlias.length}):`);
  for (const a of altasDeAlias) console.log(`  - ${a.detalle} → ${a.club_id}`);
  if (avisos.length) {
    console.log('Avisos:');
    for (const a of avisos) console.log(`  ! ${a}`);
  }

  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); return; }

  for (const p of patchesDeTorneo) {
    await escribir(`tournaments?id=eq.${p.id}`, 'PATCH', { external_id: p.externalId });
  }
  if (altasDeAlias.length) {
    await escribir('club_external_ids', 'POST', altasDeAlias.map((a) => ({
      provider: FEDHOCKEYCBA_PROVIDER, external_id: a.external_id, club_id: a.club_id,
    })));
  }
  console.log(`Aplicado: ${patchesDeTorneo.length} torneos, ${altasDeAlias.length} alias.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
