/**
 * Vincula cada selección de hockey del feed de la FIH con su ficha de la base.
 *
 *   npx tsx src/scripts/hockey-vincular-selecciones.ts            (plan)
 *   npx tsx src/scripts/hockey-vincular-selecciones.ts --execute
 *
 * El porqué y la forma de la llave están en `lib/services/nationalTeamLinks.ts`:
 * se guarda `{genero}|{PAIS}` (`w|ARG`) y no el ref de la edición
 * (`fih-wc-1867-ARG`), que se vence con el próximo Mundial.
 *
 * ── EL MAPA VA A MANO, CON EVIDENCIA ────────────────────────────────────────
 * Cotejar por nombre acá es una trampa: la base tiene "Alemania hockey
 * femenino", "Selección Alemana de Hockey Masculino" y
 * "seleccion-australiana-de-hockey-femenno" (con el error de tipeo adentro del
 * id, que es la URL y por eso no se toca). Un cotejo automático que empareje
 * "femenino" con "femenno" empareja cualquier cosa. Cada línea de abajo se
 * verificó contra los partidos que tiene la ficha.
 *
 * El caso que no era obvio: "Selección de Nueva Zelanda de Hockey" no dice el
 * género ni en el nombre ni en el id. Sus tres partidos son contra Argentina
 * FEMENINA, así que es la femenina.
 *
 * El script no crea fichas: si un país del Mundial no tiene la suya, se queda
 * sin vincular y su lugar sigue siendo la ficha que arma el feed. Se listan al
 * final para que se vea qué falta.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const EJECUTAR = process.argv.includes('--execute');
const PROVEEDOR = 'fih';
const SPORT = 'field-hockey';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');

/** `{genero}|{código FIH}` → id del club en la base. Ver la cabecera. */
const VINCULOS: Record<string, string> = {
  'w|ARG': 'seleccion-argentina-femenina-de-hockey',
  'm|ARG': 'seleccion-argentina-masculina-de-hockey',
  'w|NED': 'seleccion-femenina-de-paises-bajos-de-hockey',
  'm|NED': 'paises-bajos-hockey-masculino',
  'w|GER': 'seleccion-alemana-de-hockey-femenino',
  'm|GER': 'seleccion-alemana-de-hockey-masculino',
  'w|AUS': 'seleccion-australiana-de-hockey-femenno',
  'm|AUS': 'seleccion-australiana-de-hockey-masculino',
  'w|BEL': 'seleccion-femenina-belga-de-hockey',
  'm|BEL': 'seleccion-belga-de-hockey-masculino',
  'w|CHN': 'seleccion-de-china-femenina-de-hockey',
  'm|CHN': 'seleccion-china-de-hockey-masculino',
  'w|ESP': 'seleccion-femenina-espanola-de-hockey',
  'm|ESP': 'seleccion-espanola-de-hockey-masculino',
  'w|ENG': 'seleccion-femenina-inglesa-de-hockey',
  'm|ENG': 'seleccion-inglesa-de-hockey-masculino',
  'w|IRL': 'seleccion-femenina-irlandesa-de-hockey',
  'm|IRL': 'seleccion-irlandesa-de-hockey-masculino',
  'm|IND': 'seleccion-india-de-hockey-masculino',
  'm|PAK': 'seleccion-pakistani-de-hockey-masculino',
  // Sin género en el nombre: se resolvió por sus partidos (ver la cabecera).
  'w|NZL': 'seleccion-de-nueva-zelanda-de-hockey',

  // Las doce que no tenían ficha y se crearon con
  // `hockey-crear-selecciones.ts`: el id lo puso ese script, así que acá no hay
  // nada que adivinar.
  'm|FRA': 'seleccion-francia-hockey-masculino',
  'm|JPN': 'seleccion-japon-hockey-masculino',
  'm|MAS': 'seleccion-malasia-hockey-masculino',
  'm|NZL': 'seleccion-nueva-zelanda-hockey-masculino',
  'm|RSA': 'seleccion-sudafrica-hockey-masculino',
  'm|WAL': 'seleccion-gales-hockey-masculino',
  'w|CHI': 'seleccion-chile-hockey-femenino',
  'w|IND': 'seleccion-india-hockey-femenino',
  'w|JPN': 'seleccion-japon-hockey-femenino',
  'w|RSA': 'seleccion-sudafrica-hockey-femenino',
  'w|SCO': 'seleccion-escocia-hockey-femenino',
  'w|USA': 'seleccion-estados-unidos-hockey-femenino',
};

/** Los países que juegan el Mundial 2026, para reportar los que quedan sin ficha. */
const EN_EL_MUNDIAL: Record<'m' | 'w', string[]> = {
  m: ['ARG', 'AUS', 'BEL', 'ENG', 'ESP', 'FRA', 'GER', 'IND', 'IRL', 'JPN', 'MAS', 'NED', 'NZL', 'PAK', 'RSA', 'WAL'],
  w: ['ARG', 'AUS', 'BEL', 'CHI', 'CHN', 'ENG', 'ESP', 'GER', 'IND', 'IRL', 'JPN', 'NED', 'NZL', 'RSA', 'SCO', 'USA'],
};

async function leer<T>(ruta: string): Promise<T> {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`GET ${ruta}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function escribir(filas: unknown[]): Promise<void> {
  const r = await fetch(`${URL_BASE}/rest/v1/club_external_ids`, {
    method: 'POST',
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      // El vínculo es idempotente: volver a correr el script no duplica ni falla.
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(filas),
  });
  if (!r.ok) throw new Error(`POST club_external_ids: ${r.status} ${await r.text()}`);
}

async function main(): Promise<void> {
  const llaves = Object.keys(VINCULOS).sort();
  const clubes = [...new Set(Object.values(VINCULOS))];

  const enBase = await leer<Array<{ id: string; name: string; sport_id: string | null }>>(
    `clubs?select=id,name,sport_id&id=in.(${clubes.join(',')})`,
  );
  const porId = new Map(enBase.map((c) => [c.id, c]));

  const yaVinculados = await leer<Array<{ external_id: string; club_id: string }>>(
    `club_external_ids?select=external_id,club_id&provider=eq.${PROVEEDOR}`,
  );
  const vigente = new Map(yaVinculados.map((v) => [v.external_id, v.club_id]));

  const problemas: string[] = [];
  const nuevos: Array<{ llave: string; clubId: string; nombre: string }> = [];
  const sinCambio: string[] = [];
  const cambian: string[] = [];

  for (const llave of llaves) {
    const clubId = VINCULOS[llave];
    const club = porId.get(clubId);
    if (!club) {
      problemas.push(`${llave} -> ${clubId}: no existe esa ficha en la base`);
      continue;
    }
    if (club.sport_id !== SPORT) {
      problemas.push(`${llave} -> ${clubId}: es de ${club.sport_id}, no de ${SPORT}`);
      continue;
    }
    const actual = vigente.get(llave);
    if (actual === clubId) { sinCambio.push(`${llave} -> ${clubId}`); continue; }
    if (actual) cambian.push(`${llave}: ${actual} -> ${clubId}`);
    nuevos.push({ llave, clubId, nombre: club.name });
  }

  console.log(`\n=== Vinculos declarados: ${llaves.length} ===`);
  for (const n of nuevos) console.log(`  + ${n.llave.padEnd(6)} -> ${n.clubId.padEnd(46)} ${n.nombre}`);
  if (sinCambio.length) console.log(`\n  ya estaban: ${sinCambio.length}`);
  if (cambian.length) { console.log('\n  CAMBIAN de club:'); for (const c of cambian) console.log(`    ! ${c}`); }
  if (problemas.length) { console.log('\n  NO se pueden vincular:'); for (const p of problemas) console.log(`    x ${p}`); }

  const faltan: string[] = [];
  for (const genero of ['m', 'w'] as const) {
    for (const code of EN_EL_MUNDIAL[genero]) {
      if (!VINCULOS[`${genero}|${code}`]) faltan.push(`${genero}|${code}`);
    }
  }
  if (faltan.length) {
    console.log(`\n  Sin ficha en la base (siguen viviendo en el feed): ${faltan.length}`);
    console.log(`    ${faltan.join(', ')}`);
  }

  if (!EJECUTAR) {
    console.log('\nModo plan. Correr con --execute para escribirlos.');
    return;
  }
  if (nuevos.length === 0) {
    console.log('\nNada que escribir.');
    return;
  }

  await escribir(nuevos.map((n) => ({
    provider: PROVEEDOR,
    external_id: n.llave,
    club_id: n.clubId,
    // Escrito a mano y verificado contra los partidos de cada ficha.
    confidence: 'manual',
  })));
  console.log(`\nVinculos escritos: ${nuevos.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
