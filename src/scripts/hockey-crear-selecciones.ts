/**
 * Arma la ficha de las selecciones de hockey del Mundial que todavía no tenían una.
 *
 *   npx tsx src/scripts/hockey-crear-selecciones.ts            (plan)
 *   npx tsx src/scripts/hockey-crear-selecciones.ts --execute
 *
 * Doce países jugaban el Mundial 2026 y existían solo en el feed de la FIH: sin
 * fila en `clubs` no hay plantel que cargar, ni historial, ni escudo propio. Con
 * ficha entran al mismo lugar que Las Leonas.
 *
 * Después de correr esto va `hockey-vincular-selecciones.ts`, que es donde se
 * declara qué ficha es cada (género, país). Están separados a propósito: crear
 * una ficha es un alta y vincularla es una afirmación sobre identidad, y la
 * segunda tiene que poder rehacerse sin volver a tocar el alta.
 *
 * ── EL ESCUDO NO VA EN LA BASE ──────────────────────────────────────────────
 * Las 21 fichas que ya existían tienen la bandera como base64 en
 * `clubs.logo_url` —de 2 KB a 95 KB de texto por fila—, que es exactamente de
 * donde salen el 57014 de `/api/teams` y los 47 MB de escudos del feed de
 * partidos. Estas van por `persistClubLogo`: el PNG se sube al bucket
 * `club-assets` y en la columna queda una URL corta.
 *
 * La bandera es la que ya usa el sitio (`public/logos/selecciones/<pais>.png`,
 * 256×256 con transparencia) y no la del CDN de la FIH: es la misma imagen que
 * ve el resto de la plataforma y no depende de que Altius siga sirviéndola.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const EJECUTAR = process.argv.includes('--execute');
const SPORT = 'field-hockey';
const BANDERAS = path.join(REPO, 'public', 'logos', 'selecciones');

type Ficha = {
  /** Género y código de la FIH: la llave con la que después se vincula. */
  key: 'm' | 'w';
  code: string;
  id: string;
  name: string;
  shortName: string;
  country: string;
  /** El archivo dentro de `public/logos/selecciones`, sin extensión. */
  bandera: string;
};

/**
 * Las doce que faltaban. El nombre sigue la forma que ya tenían las otras
 * ("India Hockey Masculino") y el id es predecible —`seleccion-{pais}-hockey-{genero}`—
 * porque el id es la URL para siempre y las viejas quedaron cada una a su manera
 * (`paises-bajos-hockey-masculino`, `seleccion-de-china-femenina-de-hockey`, y
 * hasta `seleccion-australiana-de-hockey-femenno`, con el error de tipeo adentro).
 */
const FICHAS: Ficha[] = [
  { key: 'm', code: 'FRA', id: 'seleccion-francia-hockey-masculino', name: 'Francia Hockey Masculino', shortName: 'Francia m', country: 'Francia', bandera: 'france' },
  { key: 'm', code: 'JPN', id: 'seleccion-japon-hockey-masculino', name: 'Japón Hockey Masculino', shortName: 'Japón m', country: 'Japón', bandera: 'japan' },
  { key: 'm', code: 'MAS', id: 'seleccion-malasia-hockey-masculino', name: 'Malasia Hockey Masculino', shortName: 'Malasia m', country: 'Malasia', bandera: 'malaysia' },
  { key: 'm', code: 'NZL', id: 'seleccion-nueva-zelanda-hockey-masculino', name: 'Nueva Zelanda Hockey Masculino', shortName: 'N. Zelanda m', country: 'Nueva Zelanda', bandera: 'new-zealand' },
  { key: 'm', code: 'RSA', id: 'seleccion-sudafrica-hockey-masculino', name: 'Sudáfrica Hockey Masculino', shortName: 'Sudáfrica m', country: 'Sudáfrica', bandera: 'south-africa' },
  { key: 'm', code: 'WAL', id: 'seleccion-gales-hockey-masculino', name: 'Gales Hockey Masculino', shortName: 'Gales m', country: 'Gales', bandera: 'wales' },
  { key: 'w', code: 'CHI', id: 'seleccion-chile-hockey-femenino', name: 'Chile Hockey Femenino', shortName: 'Chile f', country: 'Chile', bandera: 'chile' },
  { key: 'w', code: 'IND', id: 'seleccion-india-hockey-femenino', name: 'India Hockey Femenino', shortName: 'India f', country: 'India', bandera: 'india' },
  { key: 'w', code: 'JPN', id: 'seleccion-japon-hockey-femenino', name: 'Japón Hockey Femenino', shortName: 'Japón f', country: 'Japón', bandera: 'japan' },
  { key: 'w', code: 'RSA', id: 'seleccion-sudafrica-hockey-femenino', name: 'Sudáfrica Hockey Femenino', shortName: 'Sudáfrica f', country: 'Sudáfrica', bandera: 'south-africa' },
  { key: 'w', code: 'SCO', id: 'seleccion-escocia-hockey-femenino', name: 'Escocia Hockey Femenino', shortName: 'Escocia f', country: 'Escocia', bandera: 'scotland' },
  { key: 'w', code: 'USA', id: 'seleccion-estados-unidos-hockey-femenino', name: 'Estados Unidos Hockey Femenino', shortName: 'EE.UU. f', country: 'Estados Unidos', bandera: 'united-states' },
];

/** El mismo acento con el que se crearon las otras selecciones. */
const COLOR = '#e2ff43';

async function main(): Promise<void> {
  const { createAdminClient } = await import('../lib/supabase/admin.ts');
  const supabase = createAdminClient();

  const { data: existentes, error: errorLectura } = await supabase
    .from('clubs')
    .select('id, name, logo_url')
    .in('id', FICHAS.map((f) => f.id));
  if (errorLectura) throw new Error(`No se pudo leer clubs: ${errorLectura.message}`);

  const enBase = new Map((existentes ?? []).map((c) => [c.id as string, c]));

  const faltanBandera: string[] = [];
  for (const f of FICHAS) {
    if (!fs.existsSync(path.join(BANDERAS, `${f.bandera}.png`))) faltanBandera.push(`${f.id} (${f.bandera}.png)`);
  }

  const nuevas = FICHAS.filter((f) => !enBase.has(f.id));

  console.log(`\n=== Fichas a crear: ${nuevas.length} de ${FICHAS.length} ===`);
  for (const f of nuevas) {
    console.log(`  + ${f.key}|${f.code}  ${f.id.padEnd(42)} ${f.name}`);
  }
  if (enBase.size) console.log(`\n  ya existian: ${enBase.size} (${[...enBase.keys()].join(', ')})`);
  if (faltanBandera.length) {
    console.log('\n  SIN BANDERA (se crean igual, sin escudo):');
    for (const b of faltanBandera) console.log(`    ! ${b}`);
  }

  if (!EJECUTAR) {
    console.log('\nModo plan. Correr con --execute para crearlas.');
    console.log('Despues: npx tsx src/scripts/hockey-vincular-selecciones.ts --execute');
    return;
  }

  const ahora = new Date().toISOString();
  const creadas: Ficha[] = [];

  for (const f of nuevas) {
    const { error } = await supabase.from('clubs').insert([{
      id: f.id,
      slug: f.id,
      name: f.name,
      short_name: f.shortName.slice(0, 30),
      country: f.country,
      sport: SPORT,
      sport_id: SPORT,
      entity_type: 'club',
      status: 'active',
      visibility: 'visible',
      is_visible: true,
      primary_color: COLOR,
      categories: [`sport:${SPORT}`, `gender:${f.key === 'w' ? 'femenino' : 'masculino'}`],
      created_at: ahora,
      updated_at: ahora,
    }]);
    if (error) {
      console.error(`  x no se pudo crear ${f.id}: ${error.message}`);
      continue;
    }
    creadas.push(f);
    console.log(`  + ficha creada: ${f.id}`);
  }

  // --- las banderas, al bucket
  const { persistClubLogo } = await import('../lib/server/persistClubLogo.ts');
  let escudos = 0;
  for (const f of creadas) {
    const archivo = path.join(BANDERAS, `${f.bandera}.png`);
    if (!fs.existsSync(archivo)) continue;
    const dataUri = `data:image/png;base64,${fs.readFileSync(archivo).toString('base64')}`;
    const r = await persistClubLogo(f.id, dataUri, { supabaseClient: supabase });
    if (r.origin !== 'storage' || !r.url) {
      // Sin bucket la ficha se queda sin escudo antes que con 4 KB de base64
      // en la columna: es justo lo que este script viene a no hacer.
      console.error(`  x ${f.id}: ${r.warning ?? 'no se pudo subir la bandera'}`);
      continue;
    }
    const { error } = await supabase.from('clubs').update({ logo_url: r.url, updated_at: ahora }).eq('id', f.id);
    if (error) { console.error(`  x ${f.id}: ${error.message}`); continue; }
    escudos++;
    console.log(`  + bandera de ${f.id}`);
  }

  console.log(`\n=== Resultado ===`);
  console.log(`Fichas creadas  : ${creadas.length}`);
  console.log(`Banderas subidas: ${escudos}`);
  console.log('\nAhora vinculalas: npx tsx src/scripts/hockey-vincular-selecciones.ts --execute');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
