/**
 * Lo que ve el visitante, medido con la ANON KEY. Se corre ANTES y DESPUÉS de
 * publicar una temporada, y las dos salidas se comparan.
 *
 *   node src/scripts/urba-home-snapshot.ts > antes.txt
 *   node src/scripts/urba-home-snapshot.ts > despues.txt
 *
 * ── Por qué no alcanza con contar torneos ──────────────────────────────────
 * Publicar una temporada mueve DOS cosas distintas y hay que mirarlas separadas:
 *
 *   1. EL FEED DE PARTIDOS del home. Está acotado por día en la consulta
 *      (`gte(date_time, inicio) . lt(date_time, díaSiguiente)` en
 *      src/app/api/matches/route.ts), así que un partido de marzo de 2025 no
 *      puede aparecer hoy. Se mide igual: una cosa es leer el código y otra
 *      contar las filas.
 *   2. EL LISTADO DE COMPETENCIAS. Ese NO filtra por temporada: publicar 2025
 *      suma sus torneos al lado de los de 2026. Es el efecto que hay que mirar.
 *
 * Las tres puertas se aplican acá igual que en la app, y con las MISMAS
 * funciones: la RLS ya la aplicó la anon key al responder, `isTournamentVisible
 * ToPublic` y `ocultarGradosSubordinados` se importan del repo. Reimplementarlas
 * a mano mediría otra cosa.
 */
import fs from 'node:fs';
import path from 'node:path';

import { isTournamentVisibleToPublic } from '../lib/tournamentReview.ts';
import { ocultarGradosSubordinados } from '../lib/tournamentNavigation.ts';
import { resolveTournamentAudience } from '../lib/utils/tournamentAudience.ts';
import { filtrarPorTemporada, temporadasDisponibles } from '../lib/tournamentSeasonFilter.ts';

const REPO = process.cwd();
const TZ = 'America/Argentina/Buenos_Aires';

const env: Record<string, string> = { ...process.env as Record<string, string> };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY');
const HA = { apikey: ANON, authorization: `Bearer ${ANON}` };

/** Trae TODAS las filas: PostgREST corta en 1000 y un corte silencioso mentiría. */
async function todas(recurso: string): Promise<any[]> {
  const out: any[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
      headers: { ...HA, range: `${desde}-${desde + paso - 1}` },
    });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const filas = await r.json() as any[];
    out.push(...filas);
    if (filas.length < paso) return out;
  }
}

/** El rango UTC del día local de Buenos Aires. El mismo que arma el feed. */
function rangoDelDia(fecha: Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const hoy = f.format(fecha);
  // El offset de ART es fijo (-03:00): no hay horario de verano desde 2009.
  return { dia: hoy, desde: `${hoy}T03:00:00.000Z`, hasta: `${hoy}T03:00:00.000Z`.replace(hoy, siguiente(hoy)) };
}
function siguiente(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** El sábado siguiente: el día en el que URBA juega y en el que se vería la inundación. */
function proximoSabado(desde: Date) {
  const d = new Date(desde.getTime());
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 6);
  return d;
}

const porAnio = (filas: Array<{ date_time?: string | null }>) => {
  const m = new Map<string, number>();
  for (const f of filas) {
    const a = String(f.date_time ?? '').slice(0, 4) || 'sin fecha';
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
};

const porTemporada = (filas: Array<{ season_id?: string | null }>) => {
  const m = new Map<string, number>();
  for (const f of filas) m.set(String(f.season_id ?? 'sin temporada'), (m.get(String(f.season_id ?? 'sin temporada')) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
};
const linea = (m: Array<[string, number]>) => m.map(([k, v]) => `${k}: ${v}`).join(' · ') || '(nada)';

async function main() {
  const ahora = new Date();
  console.log(`════ lo que ve el anónimo — ${rangoDelDia(ahora).dia} (${TZ}) ════\n`);

  // ── 1. El feed del home, acotado al día como lo acota la ruta ──────────────
  //
  // Se miden DOS días: hoy y el sábado siguiente. Hoy solo no prueba nada —el
  // rugby de URBA se juega el fin de semana, así que un jueves vacío seguiría
  // vacío aunque la publicación hubiera inundado el feed—.
  console.log('1. FEED DEL HOME (la consulta está acotada al día)');
  const sabado = proximoSabado(ahora);
  const domingo = new Date(sabado.getTime() + 24 * 3600 * 1000);
  for (const cuando of [ahora, sabado, domingo]) {
    const { dia, desde, hasta } = rangoDelDia(cuando);
    const filas = await todas(
      `matches?select=id,date_time,is_visible,review_status,external_id` +
      `&date_time=gte.${desde}&date_time=lt.${hasta}&order=date_time.asc`,
    );
    const visibles = filas.filter((m) => m.is_visible !== false && m.review_status !== 'pending' && m.review_status !== 'rejected');
    const urbaDia = visibles.filter((m) => String(m.external_id ?? '').startsWith('urba:'));
    console.log(`   ${dia}: ${filas.length} en el rango, ${visibles.length} visibles (URBA ${urbaDia.length})`);
    console.log(`     por año del partido: ${linea(porAnio(visibles))}`);
  }

  // ── 2. El listado de competencias ─────────────────────────────────────────
  const torneos = await todas(
    // `priority` no es decorativo acá: el filtro de temporada lo usa para no
    // bajar un torneo que alguien fijó a mano. Sin la columna, la medición dice
    // que la Unions Cup desaparece y el código no tiene la culpa.
    'tournaments?select=id,name,display_name,sport_id,sport,status,is_visible,review_status,category,age_grade,subcategory,season_id,gender,external_id,union_id,priority',
  );
  const publicos = torneos.filter((t) => isTournamentVisibleToPublic(t));
  const rugbySinFiltrar = publicos.filter((t) => ['rugby', 'rugby-union', 'rugby-league'].includes(String(t.sport_id ?? t.sport ?? 'rugby')));
  // El mismo orden que la ruta: temporada primero, grados subordinados después.
  const rugby = filtrarPorTemporada(rugbySinFiltrar);
  const general = ocultarGradosSubordinados(rugby);
  const audiencia = (t: any) => resolveTournamentAudience({
    ageGrade: t.age_grade, category: t.category, subcategory: t.subcategory,
    name: t.name, displayName: t.display_name,
  });
  const mayores = ocultarGradosSubordinados(rugby).filter((t) => audiencia(t) === 'mayores');
  const juveniles = rugby.filter((t) => audiencia(t) === 'juveniles');

  console.log('\n2. LISTADO DE COMPETENCIAS');
  console.log(`   el anónimo lee         : ${torneos.length} torneos (RLS is_active = true)`);
  console.log(`   pasan las tres puertas : ${publicos.length}`);
  console.log(`   de rugby               : ${rugbySinFiltrar.length}`);
  console.log(`   tras el filtro de temporada: ${rugby.length}   (temporadas en juego: ${temporadasDisponibles(rugbySinFiltrar).join(', ')})`);
  const sacados = rugbySinFiltrar.length - rugby.length;
  console.log(`     el filtro sacó       : ${sacados}`);
  console.log(`   listado general        : ${general.length}`);
  console.log(`     por temporada        : ${linea(porTemporada(general))}`);
  console.log(`   vista mayores          : ${mayores.length}`);
  console.log(`   vista juveniles/reserva: ${juveniles.length}`);

  // ── 3. URBA, la unión que se está publicando ──────────────────────────────
  const urba = torneos.filter((t) => String(t.external_id ?? '').startsWith('urba:') || t.union_id === 'urba');
  // Por AÑO DEL PARTIDO y no por season_id: en `matches` esa columna es un uuid
  // que apunta a `seasons` y en los de URBA viene casi siempre en NULL, así que
  // agrupar por ahí no dice nada. La fecha sí.
  const partidosUrba = await todas('matches?select=id,date_time,is_visible&external_id=like.urba:*');
  const partidosUrbaVisibles = partidosUrba.filter((m) => m.is_visible !== false);
  console.log('\n3. URBA');
  console.log(`   torneos que ve         : ${urba.length}`);
  console.log(`     por temporada        : ${linea(porTemporada(urba))}`);
  console.log(`   partidos que ve        : ${partidosUrbaVisibles.length} de ${partidosUrba.length} legibles`);
  console.log(`     por año del partido  : ${linea(porAnio(partidosUrbaVisibles))}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
