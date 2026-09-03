/**
 * Carga los escudos de las uniones (asociaciones y federaciones provinciales)
 * que juegan el Argentino de Selecciones de hockey, y las placas de los Sub 19.
 *
 *   npx tsx src/scripts/hockey-escudos-uniones.ts --plan
 *   npx tsx src/scripts/hockey-escudos-uniones.ts --execute
 *   npx tsx src/scripts/hockey-escudos-uniones.ts --execute --carpeta="D:\otra\carpeta"
 *
 * Los PNG están en la carpeta de recursos (fuera del repo) y se cotejan por
 * NOMBRE DE ARCHIVO contra un mapa escrito a mano: la homonimia entre
 * federaciones es la regla y un cotejo automático por nombre ya costó caro
 * (San Andrés bajo el id de San Albano). Un archivo que no está en el mapa se
 * lista y no se toca.
 *
 * Los escudos se suben al bucket `club-assets` por `persistClubLogo` —nunca a
 * `clubs.logo_url` como base64, que es la causa del 57014 de `/api/teams`— y
 * antes pasan por `sharp`: se achican a 600 px (el proxy los vuelve a escalar,
 * pero no hay motivo para guardar 1080×1080 de 500 KB) y el banner de Entre
 * Ríos, que trae el escudo centrado sobre una franja ancha, se recorta al
 * cuadrado del medio.
 *
 * Las dos placas "ARGENTINO DE SELECCIONES SUB 19" son la tipografía del torneo
 * (11.582 px de ancho, letras blancas): van como `logo_url` de los torneos Sub
 * 19 achicadas a 1600 px, al bucket `tournaments`.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import sharp from 'sharp';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const EJECUTAR = process.argv.includes('--execute');
const CARPETA = process.argv.find((a) => a.startsWith('--carpeta='))?.split('=').slice(1).join('=')
  ?? 'C:\\Users\\srome\\OneDrive\\Documentos\\________S22\\__GRUPO 22\\RECURSOS\\HOCKEY\\UNIONES';

const SPORT = 'field-hockey';
const LADO_ESCUDO = 600;
const ANCHO_PLACA = 1600;

type Recorte = { left: number; top: number; width: number; height: number };

/** archivo (sin extensión) → clubes que lo llevan. Ver el porqué del mapa a mano arriba. */
const ESCUDOS: Record<string, { clubes: string[]; recorte?: Recorte; nota?: string }> = {
  'BAHIA': { clubes: ['asociacion-bahiense-cah-hockey'] },
  'BONAERENSE': { clubes: ['federacion-bonaerense-cah-hockey'], nota: 'FBH: no jugó el 2026 todavía, se crea el club para que el próximo import lo encuentre' },
  'BUENOS AIRES': { clubes: ['asociacion-amateur-de-hockey-sobre-cesped-de-buenos-aires-cah-hockey'] },
  'CHACO': { clubes: ['federacion-chaquena-cah-hockey'] },
  // Chile es invitada al Argentino de Selecciones y presenta A y B: mismo escudo
  'Chilena': { clubes: ['federacion-chilena-de-hockey-cah-hockey', 'federacion-chilena-de-hockey-a-cah-hockey', 'federacion-chilena-de-hockey-b-cah-hockey'] },
  'CORDOBESA': { clubes: ['federacion-cordobesa-cah-hockey'], nota: 'FCH actual; CÓRDOBA.png es el escudo viejo (FACHSC) y se deja afuera' },
  // 684×270 con el escudo en el medio: se recorta el cuadrado central
  'ENTRE RIOS': { clubes: ['federacion-entrerriana-cah-hockey'], recorte: { left: 207, top: 0, width: 270, height: 270 } },
  'LITORAL': { clubes: ['asociacion-litoral-cah-hockey'] },
  'MAR DEL PLATA': { clubes: ['asociacion-marplatense-cah-hockey'] },
  'MENDOZA': { clubes: ['asociacion-mendocina-cah-hockey'] },
  'MISIONES': { clubes: ['federacion-misionera-cah-hockey'] },
  'RÍO NEGRO': { clubes: ['federacion-rio-negro-cah-hockey'], nota: 'la versión cuadrada; RIO NEGRO.png (sin tilde) es el banner' },
  'RIOJANA': { clubes: ['asociacion-riojana-cah-hockey'] },
  'SALTA': { clubes: ['asociacion-saltena-cah-hockey'] },
  // San Juan presenta A y B en los promocionales: mismo escudo
  'SAN JUAN': { clubes: ['asociacion-sanjuanina-cah-hockey', 'asociacion-sanjuanina-a-cah-hockey', 'asociacion-sanjuanina-b-cah-hockey'] },
  'SANTAFESINA': { clubes: ['asociacion-santafesina-cah-hockey'] },
  'Santiago Del Estero': { clubes: ['federacion-de-santiago-del-estero-cah-hockey'] },
  'SUDOESTE BUENOS AIRES': { clubes: ['asociacion-sudoeste-de-buenos-aires-cah-hockey'] },
  'TANDILENSE': { clubes: ['federacion-tandilense-cah-hockey'] },
  'TUCUMAN': { clubes: ['asociacion-tucumana-cah-hockey'] },
  // Segunda tanda (Downloads/logos-hockey-1080, ya a 1080×1080 con fondo transparente)
  'UNION DEL CENTRO': { clubes: ['federacion-amateur-de-hockey-sobre-cesped-union-del-centro-cah-hockey'] },
  'VALLE DEL CHUBUT': { clubes: ['asociacion-del-valle-de-chubut-cah-hockey'] },
  'SANRAFAELINA': { clubes: ['asociacion-sanrafaelina-cah-hockey'] },
  // "Asociación Noroeste" jugó los regionales bonaerenses (2013, 2023): es la FNHBA, no la del NOA
  'NOROESTE': { clubes: ['asociacion-noroeste-cah-hockey'] },
  'NEUQUINA': { clubes: ['federacion-neuquina-cah-hockey'], nota: 'original de ~330 px: queda blando' },
  'SANLUISEÑA': { clubes: ['federacion-sanluisena-cah-hockey'], nota: 'original de ~340 px: queda blando' },
};

/** archivo (sin extensión) → torneos (external_id) que llevan la placa. */
const PLACAS: Record<string, string[]> = {
  'ARGENTINO DE SELECCIONES SUB 19 DAMAS': ['cahockey:1588', 'cahockey:1590', 'cahockey:1591'],
  'ARGENTINO DE SELECCIONES SUB 19 CABS': ['cahockey:1589'],
};

/** Clubes que el mapa nombra y la base todavía no tiene: se crean con la forma del importador. */
const CLUBES_A_CREAR: Record<string, string> = {
  'federacion-bonaerense-cah-hockey': 'Federación Bonaerense',
};

const NORMALIZAR = (s: string) => s.normalize('NFC');

async function main() {
  if (!fs.existsSync(CARPETA)) {
    console.error(`No existe la carpeta ${CARPETA}`);
    process.exit(1);
  }
  const archivos = fs.readdirSync(CARPETA).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  const porNombre = new Map(archivos.map((f) => [NORMALIZAR(f.replace(/\.[^.]+$/, '')), f]));
  const sinMapa = archivos.filter((f) => {
    const clave = NORMALIZAR(f.replace(/\.[^.]+$/, ''));
    return !Object.keys(ESCUDOS).some((k) => NORMALIZAR(k) === clave) && !Object.keys(PLACAS).some((k) => NORMALIZAR(k) === clave);
  });

  const buscar = (nombre: string) => porNombre.get(NORMALIZAR(nombre)) ?? null;

  // --- preparar las imágenes (en memoria; nada se escribe hasta --execute)
  const escudos: { archivo: string; clubes: string[]; png: Buffer; ancho: number; alto: number; nota?: string }[] = [];
  const faltantes: string[] = [];
  for (const [nombre, def] of Object.entries(ESCUDOS)) {
    const archivo = buscar(nombre);
    if (!archivo) { faltantes.push(nombre); continue; }
    let img = sharp(path.join(CARPETA, archivo));
    if (def.recorte) img = img.extract(def.recorte);
    const png = await img
      .resize({ width: LADO_ESCUDO, height: LADO_ESCUDO, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const meta = await sharp(png).metadata();
    escudos.push({ archivo, clubes: def.clubes, png, ancho: meta.width ?? 0, alto: meta.height ?? 0, nota: def.nota });
  }

  const placas: { archivo: string; torneos: string[]; png: Buffer; ancho: number; alto: number }[] = [];
  for (const [nombre, torneos] of Object.entries(PLACAS)) {
    const archivo = buscar(nombre);
    if (!archivo) { faltantes.push(nombre); continue; }
    const png = await sharp(path.join(CARPETA, archivo))
      .resize({ width: ANCHO_PLACA, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const meta = await sharp(png).metadata();
    placas.push({ archivo, torneos, png, ancho: meta.width ?? 0, alto: meta.height ?? 0 });
  }

  // --- qué hay en la base
  const { createAdminClient } = await import('../lib/supabase/admin.ts');
  const supabase = createAdminClient();

  const idsClubes = [...new Set(escudos.flatMap((e) => e.clubes))];
  const { data: clubesRaw, error: errClubes } = await supabase
    .from('clubs').select('id, name, logo_url').in('id', idsClubes);
  if (errClubes) throw new Error(`No se pudieron leer los clubes: ${errClubes.message}`);
  type ClubFila = { id: string; name: string; logo_url: string | null };
  const clubesEnBase = new Map<string, ClubFila>(((clubesRaw ?? []) as ClubFila[]).map((c) => [c.id, c]));
  const clubesQueFaltan = idsClubes.filter((id) => !clubesEnBase.has(id));
  const clubesSinReceta = clubesQueFaltan.filter((id) => !CLUBES_A_CREAR[id]);

  const idsTorneos = [...new Set(placas.flatMap((p) => p.torneos))];
  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments').select('id, name, external_id, logo_url').in('external_id', idsTorneos);
  if (errTorneos) throw new Error(`No se pudieron leer los torneos: ${errTorneos.message}`);
  type TorneoFila = { id: string; name: string; external_id: string; logo_url: string | null };
  const torneosEnBase = new Map<string, TorneoFila>(((torneosRaw ?? []) as TorneoFila[]).map((t) => [t.external_id, t]));

  // --- plan
  console.log(`\n=== Escudos de uniones de hockey (${EJECUTAR ? 'EJECUTAR' : 'plan'}) ===`);
  console.log(`Carpeta: ${CARPETA}`);
  console.log(`Archivos: ${archivos.length} · en el mapa: ${escudos.length + placas.length} · sin mapa: ${sinMapa.length}`);
  for (const f of sinMapa) console.log(`  (se ignora) ${f}`);
  if (faltantes.length) console.log(`Nombrados en el mapa y ausentes en la carpeta: ${faltantes.join(', ')}`);

  console.log('\n--- Escudos → clubes ---');
  for (const e of escudos) {
    console.log(`  ${e.archivo}  →  ${e.ancho}×${e.alto}, ${(e.png.length / 1024).toFixed(0)} KB${e.nota ? `  · ${e.nota}` : ''}`);
    for (const id of e.clubes) {
      const club = clubesEnBase.get(id);
      const estado = !club ? (CLUBES_A_CREAR[id] ? 'SE CREA' : 'NO EXISTE, SIN RECETA') : club.logo_url ? 'reemplaza escudo' : 'sin escudo';
      console.log(`      ${id}  [${estado}]`);
    }
  }
  console.log('\n--- Placas → torneos ---');
  for (const p of placas) {
    console.log(`  ${p.archivo}  →  ${p.ancho}×${p.alto}, ${(p.png.length / 1024).toFixed(0)} KB`);
    for (const ext of p.torneos) {
      const t = torneosEnBase.get(ext);
      console.log(`      ${ext}  [${t ? (t.logo_url ? 'reemplaza logo' : 'sin logo') + ' · ' + t.name : 'NO EXISTE'}]`);
    }
  }
  if (clubesSinReceta.length) {
    console.log(`\nClubes del mapa que no están en la base ni tienen receta de alta: ${clubesSinReceta.join(', ')}`);
  }

  if (!EJECUTAR) {
    console.log('\nModo plan. Correr con --execute para aplicar.');
    return;
  }

  // --- clubes que faltan, con la misma forma que el importador
  const ahora = new Date().toISOString();
  for (const id of clubesQueFaltan) {
    const nombre = CLUBES_A_CREAR[id];
    if (!nombre) continue;
    const { error } = await supabase.from('clubs').insert([{
      id, slug: id, name: nombre, short_name: nombre.slice(0, 30), country: 'Argentina',
      sport: SPORT, sport_id: SPORT, entity_type: 'club', status: 'active',
      visibility: 'visible', is_visible: true, categories: [],
      created_at: ahora, updated_at: ahora,
    }]);
    if (error) { console.error(`  ✗ no se pudo crear ${id}: ${error.message}`); continue; }
    clubesEnBase.set(id, { id, name: nombre, logo_url: null });
    console.log(`  + club creado: ${id}`);
  }

  // --- escudos
  const { persistClubLogo } = await import('../lib/server/persistClubLogo.ts');
  let escudosOk = 0;
  for (const e of escudos) {
    const dataUri = `data:image/png;base64,${e.png.toString('base64')}`;
    for (const id of e.clubes) {
      if (!clubesEnBase.has(id)) continue;
      const r = await persistClubLogo(id, dataUri, { supabaseClient: supabase });
      if (r.origin !== 'storage' || !r.url) {
        console.error(`  ✗ ${id}: ${r.warning ?? 'no se pudo subir'}`);
        continue;
      }
      const { error } = await supabase.from('clubs').update({ logo_url: r.url, updated_at: ahora }).eq('id', id);
      if (error) { console.error(`  ✗ ${id}: ${error.message}`); continue; }
      escudosOk++;
      console.log(`  ✓ ${id} ← ${e.archivo}`);
    }
  }

  // --- placas: mismo camino que `persistTournamentLogo`, pero con service_role
  let placasOk = 0;
  for (const p of placas) {
    const digest = createHash('sha256').update(p.png).digest('hex').slice(0, 16);
    for (const ext of p.torneos) {
      const t = torneosEnBase.get(ext);
      if (!t) continue;
      const filePath = `logos/${t.id}-${digest}.png`;
      const { error: errUp } = await supabase.storage.from('tournaments')
        .upload(filePath, p.png, { contentType: 'image/png', upsert: true });
      if (errUp) { console.error(`  ✗ ${ext}: Storage rechazó la placa (${errUp.message})`); continue; }
      const { data } = supabase.storage.from('tournaments').getPublicUrl(filePath);
      const { error } = await supabase.from('tournaments').update({ logo_url: data.publicUrl, updated_at: ahora }).eq('id', t.id);
      if (error) { console.error(`  ✗ ${ext}: ${error.message}`); continue; }
      placasOk++;
      console.log(`  ✓ ${ext} (${t.name}) ← ${p.archivo}`);
    }
  }

  console.log(`\n=== Resultado ===\nEscudos cargados: ${escudosOk}\nPlacas cargadas: ${placasOk}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
