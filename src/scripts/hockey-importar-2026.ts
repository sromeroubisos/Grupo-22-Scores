/**
 * Importa a la base los torneos de hockey 2026 cosechados por los scrapers de
 * `scripts/cahockey/` (Confederación Argentina) y `scripts/atahockey/`
 * (Asociación Tucumana):
 *
 *   npx tsx src/scripts/hockey-importar-2026.ts --plan
 *   npx tsx src/scripts/hockey-importar-2026.ts --execute
 *   npx tsx src/scripts/hockey-importar-2026.ts --plan --fuente=ata
 *
 * Cada torneo nace calcado de la plantilla de Damas A de Córdoba (mismo ruleset
 * de hockey 3/1/0 sin bonus, misma fase "Fase Regular" con su settings entero)
 * y VISIBLE: `status: 'published'` + `is_visible: true`, que es lo que el
 * anónimo filtra. Sin eso el torneo entra a la base y no se ve en la web.
 *
 * El orden respeta las DOS FKs circulares:
 *   torneo (sin current_season_id) → temporada → PATCH del torneo
 *   participante → entrada de temporada → PATCH del participante
 *
 * Y las tres tablas de participantes, que no son opcionales: sin
 * `tournament_participants` el motor de posiciones descarta el partido en
 * silencio; sin `team_season_entries` la página del torneo no lista al club;
 * sin `tournament_phase_participants` el club no entra a la tabla.
 *
 * Idempotente por `external_id`: un torneo ya cargado se saltea.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

import {
  AMBITO_CAH,
  claveDeNombre,
  esClubReal,
  idDeClub,
  nombreLimpio,
} from '../lib/integrations/cahockey/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const EJECUTAR = process.argv.includes('--execute');
const FUENTE = (process.argv.find((a) => a.startsWith('--fuente='))?.split('=')[1] ?? 'todas') as
  'todas' | 'ata' | 'cah';
/** `--limite=1` escribe un solo torneo: sirve para ver el resultado en el sitio antes de soltar el lote. */
const LIMITE = Number(process.argv.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? '0') || 0;

/** Plantillas ya probadas en producción (Damas A de Córdoba). */
const TORNEO_PLANTILLA = '6d74c8b8-ca1c-4997-80b2-07fd456aa968';
const FASE_PLANTILLA = 'fe78180e-e54c-4ab1-a0d7-4d11f16d6440';

const TEMPORADA = '2026';
const SPORT = 'field-hockey';
/** Tucumán y el resto del país: -03:00 todo el año, sin horario de verano. */
const OFFSET_AR = '-03:00';
/** Los resultados de ATA vienen sin hora; SICAH sí la trae. */
const HORA_POR_DEFECTO = '15:00';

const PROVIDER_CAH = 'cahockey';
const PROVIDER_ATA = 'atahockey';

// ---------------------------------------------------------------- utilidades

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Una corrida completa son varios miles de escrituras seguidas contra
 * producción, y en una tirada así el ECONNRESET suelto deja de ser hipotético
 * (ya cortó una vez armando esto). Sin reintento, un corte de red a mitad de
 * camino abandona un torneo con la temporada creada y los partidos no: peor que
 * no haber empezado. Sólo se reintenta lo que puede ser transitorio —red o 5xx—;
 * un 4xx es un error nuestro y tiene que explotar en la cara.
 */
async function conReintento<T>(que: string, intento: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      return await intento();
    } catch (e) {
      ultimo = e;
      if (e instanceof Error && e.message.startsWith('HTTP4')) throw e;
      await espera(500 * 2 ** i);
    }
  }
  throw new Error(`${que} falló tras 4 intentos: ${String(ultimo)}`);
}

async function leer<T>(recurso: string): Promise<T> {
  return conReintento(`GET ${recurso}`, async () => {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
    if (!res.ok) throw new Error(`HTTP${String(res.status)[0]}xx GET ${recurso}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  });
}

async function escribir(recurso: string, metodo: 'PATCH' | 'POST', cuerpo: unknown): Promise<void> {
  await conReintento(`${metodo} ${recurso}`, async () => {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
      method: metodo,
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) throw new Error(`HTTP${String(res.status)[0]}xx ${metodo} ${recurso}: ${res.status} ${await res.text()}`);
  });
}

function leerJson<T>(...tramos: string[]): T | null {
  const ruta = path.join(REPO, ...tramos);
  if (!fs.existsSync(ruta)) return null;
  return JSON.parse(fs.readFileSync(ruta, 'utf8')) as T;
}

/**
 * "CAMPEONATO ARGENTINO DE CLUBES SUB 16" → "Campeonato Argentino de Clubes Sub 16".
 *
 * `a` NO entra en la lista aunque sea preposición: en estos títulos siempre es
 * la división ("Pista A Damas", "Ascenso «A» Damas"), y bajarla a minúscula
 * convierte el nombre de un torneo en otra cosa.
 */
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en']);
function titulo(texto: string): string {
  return texto
    // El HTML de la CAH trae las comillas tipográficas rotas: la división
    // «A» llega escrita ?A? y sin esto el torneo se publica como "Sub 16 ?a?".
    .replace(/\?([A-Za-z0-9]{1,3})\?/g, '$1')
    .replace(/[«»""'']/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

function generoDe(texto: string): 'femenino' | 'masculino' | null {
  const t = texto.toUpperCase();
  if (/\bDAMAS?\b|\bFEMENINO\b|\bMUJERES\b|\bMAMIS\b/.test(t)) return 'femenino';
  if (/\bCABALLEROS?\b|\bMASCULINO\b|\bVARONES\b/.test(t)) return 'masculino';
  return null;
}

function categoriaDe(texto: string): string {
  const t = texto.toUpperCase();
  const m = t.match(/\bSUB\s*-?\s*(\d{2})\b/);
  if (m) return `Sub ${m[1]}`;
  if (/\bMAMIS\b/.test(t)) return 'Mamis';
  if (/\bINTERMEDIA\b/.test(t)) return 'Intermedia';
  return 'Mayores';
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

/**
 * SICAH agrupa los partidos por día de la semana ("Jueves") sin decir la fecha.
 * La fecha real sale del rango del torneo: como duran tres o cuatro días, cada
 * nombre de día cae una sola vez. Si no cae en el rango se devuelve null y el
 * partido se omite — una fecha inventada ensucia el fixture peor que la ausencia.
 */
function fechaDelDia(dia: string | null, desde: string | null, hasta: string | null): string | null {
  if (!dia || !desde) return null;
  const objetivo = DIAS_SEMANA[claveDeNombre(dia)];
  if (objetivo === undefined) return null;
  const inicio = new Date(`${desde}T12:00:00Z`);
  const fin = hasta ? new Date(`${hasta}T12:00:00Z`) : new Date(inicio.getTime() + 6 * 864e5);
  for (let d = new Date(inicio); d <= fin; d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() === objetivo) return d.toISOString().slice(0, 10);
  }
  return null;
}

// La identidad de clubes (`idDeClub`, `esClubReal`, `nombreLimpio`, `AMBITO_CAH`)
// vive en `lib/integrations/cahockey/nombres.ts`, compartida con el cron que
// actualiza los resultados: los dos tienen que derivar EXACTAMENTE el mismo id.
const AMBITO_ATA = 'tucuman';

// ---------------------------------------------------------------- modelo común

type PartidoPlan = {
  externalId: string;
  local: string;      // nombre crudo, como lo escribe la fuente
  visitante: string;
  fecha: string;      // ISO YYYY-MM-DD
  hora: string;       // HH:MM
  golesLocal: number | null;
  golesVisitante: number | null;
  rondaLabel: string | null;
  venue: string | null;
};

type TorneoPlan = {
  externalId: string;
  nombre: string;
  gender: 'femenino' | 'masculino' | null;
  ageGrade: string;
  region: string | null;
  /** federación de la que sale el torneo: entra en el id de sus clubes */
  ambito: string;
  partidos: PartidoPlan[];
  clubes: Set<string>;
  omitidos: { motivo: string; detalle: string }[];
};

// ---------------------------------------------------------------- ATA (Tucumán)

type AtaTorneo = {
  titulo: string | null;
  query: string;
  fechas: { nro: number; rueda: string | null; partidos: {
    fecha: string | null; local: string; goles_local: number | null;
    goles_visitante: number | null; visitante: string;
  }[] }[];
};

function planificarAta(sexo: 'M' | 'F'): TorneoPlan[] {
  const datos = leerJson<{ torneos: AtaTorneo[] }>(
    'scripts', 'atahockey', 'out', sexo === 'M' ? 'masculino.json' : 'femenino.json',
  );
  if (!datos) return [];

  const planes: TorneoPlan[] = [];
  for (const t of datos.torneos) {
    if (!t.titulo || !t.titulo.includes(TEMPORADA)) continue;
    // "CLAUSURA CABALLEROS 2026 | PRIMERA M" → certamen + división
    const [certamen, division] = t.titulo.split('|').map((s) => s.trim());
    const nombre = `${titulo(certamen)} - ${titulo((division ?? '').replace(/\s+[MF]$/, ''))} - Tucumán`;
    // FixId y EquipoId identifican torneo y división: son la identidad estable
    const fixId = t.query.match(/FixId=(\d+)/)?.[1] ?? '0';
    const equipoId = t.query.match(/EquipoId=(\d+)/)?.[1] ?? '0';

    const plan: TorneoPlan = {
      externalId: `${PROVIDER_ATA}:${fixId}-${equipoId}-${sexo}`,
      nombre,
      gender: sexo === 'M' ? 'masculino' : generoDe(t.titulo) ?? 'femenino',
      ageGrade: categoriaDe(division ?? certamen),
      region: 'Tucumán',
      ambito: AMBITO_ATA,
      partidos: [],
      clubes: new Set(),
      omitidos: [],
    };

    for (const fecha of t.fechas) {
      for (const p of fecha.partidos) {
        if (!esClubReal(p.local) || !esClubReal(p.visitante)) {
          plan.omitidos.push({ motivo: 'lugar vacante en la zona', detalle: `${p.local} vs ${p.visitante}` });
          continue;
        }
        if (!p.fecha) { plan.omitidos.push({ motivo: 'sin fecha', detalle: `${p.local} vs ${p.visitante}` }); continue; }
        plan.clubes.add(p.local);
        plan.clubes.add(p.visitante);
        plan.partidos.push({
          externalId: `${plan.externalId}:${fecha.nro}:${idDeClub(p.local, AMBITO_ATA)}~${idDeClub(p.visitante, AMBITO_ATA)}`,
          local: p.local,
          visitante: p.visitante,
          fecha: p.fecha,
          hora: HORA_POR_DEFECTO,
          golesLocal: p.goles_local,
          golesVisitante: p.goles_visitante,
          rondaLabel: `Fecha ${fecha.nro}`,
          venue: null,
        });
      }
    }
    if (plan.partidos.length) planes.push(plan);
  }
  return planes;
}

// ---------------------------------------------------------------- CAH (nacional)

type CahTorneo = {
  id: string; anio: number | null; titulo: string;
  desde: string | null; hasta: string | null;
  sicah_archivo?: string;
};
type CahDetalle = {
  partidos: {
    nro: string | null; zona: string | null; dia: string | null; hora: string | null;
    cancha: string | null;
    local: { equipo: string; goles: number | null } | null;
    visitante: { equipo: string; goles: number | null } | null;
  }[];
};

function planificarCah(archivo: string): TorneoPlan[] {
  const datos = leerJson<{ torneos: CahTorneo[] }>('scripts', 'cahockey', 'out', archivo);
  if (!datos) return [];

  const planes: TorneoPlan[] = [];
  for (const t of datos.torneos) {
    if (t.anio !== Number(TEMPORADA)) continue;
    if (!t.sicah_archivo) continue;
    const detalle = leerJson<CahDetalle>('scripts', 'cahockey', 'out', ...t.sicah_archivo.split('/'));
    if (!detalle?.partidos?.length) continue;

    const plan: TorneoPlan = {
      externalId: `${PROVIDER_CAH}:${t.id}`,
      nombre: titulo(t.titulo),
      gender: generoDe(t.titulo),
      ageGrade: categoriaDe(t.titulo),
      region: null,
      ambito: AMBITO_CAH,
      partidos: [],
      clubes: new Set(),
      omitidos: [],
    };

    for (const p of detalle.partidos) {
      const local = nombreLimpio(p.local?.equipo ?? '');
      const visitante = nombreLimpio(p.visitante?.equipo ?? '');
      if (!esClubReal(local) || !esClubReal(visitante)) {
        plan.omitidos.push({ motivo: 'cruce por definir', detalle: `${local || '?'} vs ${visitante || '?'}` });
        continue;
      }
      const fecha = fechaDelDia(p.dia, t.desde, t.hasta);
      if (!fecha) {
        plan.omitidos.push({ motivo: 'día fuera del rango del torneo', detalle: `${p.dia} · ${local} vs ${visitante}` });
        continue;
      }
      plan.clubes.add(local);
      plan.clubes.add(visitante);
      plan.partidos.push({
        externalId: `${plan.externalId}:${p.nro ?? plan.partidos.length}`,
        local,
        visitante,
        fecha,
        hora: p.hora ?? HORA_POR_DEFECTO,
        golesLocal: p.local?.goles ?? null,
        golesVisitante: p.visitante?.goles ?? null,
        rondaLabel: p.zona,
        venue: p.cancha,
      });
    }
    if (plan.partidos.length) planes.push(plan);
  }
  return planes;
}

// ---------------------------------------------------------------- main

async function main() {
  const planes: TorneoPlan[] = [];
  if (FUENTE === 'todas' || FUENTE === 'ata') {
    planes.push(...planificarAta('M'), ...planificarAta('F'));
  }
  if (FUENTE === 'todas' || FUENTE === 'cah') {
    planes.push(...planificarCah('argentino-clubes.json'));
    planes.push(...planificarCah('argentino-selecciones.json'));
    planes.push(...planificarCah('lnh.json'));
  }
  if (!planes.length) { console.error('No hay nada para importar. ¿Corriste los scrapers?'); process.exit(1); }

  // --- lo que la base ya tiene
  const yaTorneos = await leer<{ external_id: string }[]>(
    `tournaments?select=external_id&or=(external_id.like.${PROVIDER_CAH}:*,external_id.like.${PROVIDER_ATA}:*)`,
  );
  const torneosCargados = new Set(yaTorneos.map((t) => t.external_id));

  // El cotejo es por ID —que ya lleva el ámbito—, nunca por nombre: ver idDeClub.
  const clubesBase = await leer<{ id: string }[]>(
    `clubs?select=id&sport_id=eq.${SPORT}&limit=5000`,
  );
  const idsEnBase = new Set(clubesBase.map((c) => c.id));

  const todosPendientes = planes.filter((p) => !torneosCargados.has(p.externalId));
  const pendientes = LIMITE ? todosPendientes.slice(0, LIMITE) : todosPendientes;

  // --- clubes: los que ya existen con este id y los que habría que crear
  const todosLosClubes = new Map<string, string>(); // id → nombre crudo
  for (const p of pendientes) for (const n of p.clubes) todosLosClubes.set(idDeClub(n, p.ambito), n);
  const conocidos = [...todosLosClubes.keys()].filter((id) => idsEnBase.has(id));
  const nuevos = [...todosLosClubes.entries()].filter(([id]) => !idsEnBase.has(id));

  const totalPartidos = pendientes.reduce((a, p) => a + p.partidos.length, 0);
  const totalOmitidos = pendientes.reduce((a, p) => a + p.omitidos.length, 0);
  const conResultado = pendientes.reduce(
    (a, p) => a + p.partidos.filter((m) => m.golesLocal !== null && m.golesVisitante !== null).length, 0,
  );

  console.log(`\n=== Importación de hockey ${TEMPORADA} (fuente: ${FUENTE}) ===`);
  console.log(`Torneos cosechados con partidos : ${planes.length}`);
  console.log(`  ya cargados en la base        : ${planes.length - todosPendientes.length}`);
  console.log(`  a crear                       : ${pendientes.length}${LIMITE ? ` (limitado de ${todosPendientes.length})` : ''}`);
  console.log(`Partidos a crear                : ${totalPartidos} (${conResultado} con resultado)`);
  console.log(`Partidos omitidos               : ${totalOmitidos}`);
  const porMotivo = new Map<string, number>();
  for (const p of pendientes) for (const o of p.omitidos) porMotivo.set(o.motivo, (porMotivo.get(o.motivo) ?? 0) + 1);
  for (const [motivo, n] of porMotivo) console.log(`  ${motivo.padEnd(29)} : ${n}`);
  console.log(`Clubes distintos                : ${todosLosClubes.size}`);
  console.log(`  ya existen en la base         : ${conocidos.length}`);
  console.log(`  se crearían                   : ${nuevos.length}`);

  if (!EJECUTAR) {
    console.log('\n--- Torneos ---');
    for (const p of pendientes) {
      console.log(`  + ${p.nombre}`);
      console.log(`      ${p.externalId} · ${p.gender ?? 'SIN GÉNERO'} · ${p.ageGrade} · ${p.partidos.length} partidos, ${p.clubes.size} clubes`);
      if (p.omitidos.length) console.log(`      omitidos: ${p.omitidos.length} (${p.omitidos[0].motivo})`);
    }
    console.log('\n--- Clubes que se crearían ---');
    for (const [id, nombre] of nuevos.slice(0, 60)) console.log(`  + ${nombre} → ${id}`);
    if (nuevos.length > 60) console.log(`  … y ${nuevos.length - 60} más`);
    console.log('\nModo plan. Correr con --execute para aplicar.');
    process.exit(0);
  }

  // --- plantillas
  const [plantilla] = await leer<Record<string, unknown>[]>(`tournaments?id=eq.${TORNEO_PLANTILLA}`);
  const [fasePlantilla] = await leer<{ settings: unknown }[]>(`tournament_phases?id=eq.${FASE_PLANTILLA}&select=settings`);
  if (!plantilla || !fasePlantilla) throw new Error('No se pudo leer la plantilla de Damas A');

  const ahora = new Date().toISOString();

  // --- clubes nuevos, antes de todo: son independientes del torneo
  for (const [id, nombre] of nuevos) {
    await escribir('clubs', 'POST', [{
      id,
      slug: id,
      name: titulo(nombre),
      short_name: titulo(nombre).slice(0, 30),
      country: 'Argentina',
      sport: SPORT,
      sport_id: SPORT,
      entity_type: 'club',
      status: 'active',
      visibility: 'visible',
      is_visible: true,
      categories: [],
    }]);
    idsEnBase.add(id);
  }
  console.log(`Clubes creados: ${nuevos.length}`);

  const fasesParaRecalcular: { torneo: string; fase: string }[] = [];
  const fallados: { torneo: string; error: string }[] = [];

  for (const p of pendientes) {
    try {
      await importarTorneo(p, plantilla, fasePlantilla, ahora, idsEnBase, fasesParaRecalcular);
    } catch (e) {
      // Un torneo que falla no puede llevarse puestos a los 67 restantes: se
      // anota con su external_id y la corrida sigue. Como el alta es idempotente
      // por external_id, volver a correr el script retoma sólo lo que quedó.
      fallados.push({ torneo: p.externalId, error: String(e) });
      console.error(`  ✗ ${p.nombre}: ${String(e).slice(0, 200)}`);
    }
  }

  // 12. posiciones: nunca a mano, siempre por el helper
  const { recalculatePhaseStandingsScopes } = await import('../lib/server/recalculateStandings.ts');
  let tablas = 0;
  for (const { torneo, fase } of fasesParaRecalcular) {
    const r = await recalculatePhaseStandingsScopes(torneo, fase, 'general');
    if (r.ok) tablas++;
    else console.warn(`  ! no se pudo recalcular la tabla de ${torneo}`);
  }

  // El feed de la home no lee `matches`: lee un snapshot cacheado por dia,
  // deporte y timezone. Sin invalidarlo, los partidos entran a la base y la
  // portada sigue mostrando la foto anterior — que es exactamente como un
  // torneo que se juega hoy queda invisible aunque este publicado y visible.
  if (fasesParaRecalcular.length) {
    try {
      const { invalidateMatchesFeedCaches } = await import('../lib/server/matchesFeedInvalidation.ts');
      await invalidateMatchesFeedCaches();
      console.log('Caches del feed invalidados');
    } catch (e) {
      console.warn(`! no se pudieron invalidar los caches del feed: ${String(e).slice(0, 120)}`);
    }
  }

  console.log(`\n=== Resultado ===`);
  console.log(`Torneos importados : ${fasesParaRecalcular.length} de ${pendientes.length}`);
  console.log(`Tablas recalculadas: ${tablas}`);
  if (fallados.length) {
    console.log(`\nFallaron ${fallados.length} (volvé a correr el script para retomarlos):`);
    for (const f of fallados) console.log(`  ${f.torneo}: ${f.error.slice(0, 160)}`);
  }
  process.exit(fallados.length ? 1 : 0);
}

async function importarTorneo(
  p: TorneoPlan,
  plantilla: Record<string, unknown>,
  fasePlantilla: { settings: unknown },
  ahora: string,
  idsEnBase: Set<string>,
  fasesParaRecalcular: { torneo: string; fase: string }[],
): Promise<void> {
  {
    const tournamentId = crypto.randomUUID();
    const seasonId = crypto.randomUUID();
    const slugPropio = `${claveDeNombre(p.nombre).replace(/ /g, '-')}-${TEMPORADA}`;
    const proveedor = p.externalId.startsWith(PROVIDER_ATA) ? PROVIDER_ATA : PROVIDER_CAH;

    // 1. torneo, sin cerrar todavía el ciclo con la temporada
    await escribir('tournaments', 'POST', [{
      id: tournamentId,
      union_id: plantilla.union_id,
      season_id: TEMPORADA,
      name: p.nombre,
      slug: slugPropio,
      status: 'published',
      age_grade: p.ageGrade,
      region: p.region ?? plantilla.region,
      country: plantilla.country,
      country_id: plantilla.country_id,
      format: 'league',
      is_visible: true,
      ruleset: plantilla.ruleset,
      ruleset_version: plantilla.ruleset_version,
      sport_id: SPORT,
      sport: SPORT,
      external_id: p.externalId,
      priority: 0,
      sponsors: [],
      social_links: {},
      original_name: p.nombre,
      display_order: 0,
      is_popular: false,
      is_api_managed: false,
      review_status: 'approved',
      gender: p.gender,
      created_at: ahora,
      updated_at: ahora,
    }]);

    // 2. temporada y 3. PATCH que cierra la primera circular
    await escribir('tournament_seasons', 'POST', [{
      id: seasonId,
      tournament_id: tournamentId,
      legacy_tournament_id: tournamentId,
      season_code: TEMPORADA,
      name: p.nombre,
      display_name: p.nombre,
      slug: slugPropio,
      status: 'active',
      is_active: true,
      format: 'league',
      ruleset: plantilla.ruleset,
      created_at: ahora,
      updated_at: ahora,
    }]);
    await escribir(`tournaments?id=eq.${tournamentId}`, 'PATCH', { current_season_id: seasonId });

    // 4. fase
    const phaseId = crypto.randomUUID();
    await escribir('tournament_phases', 'POST', [{
      id: phaseId,
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

    // 5-10. participantes en las tres tablas, cerrando la segunda circular
    for (const nombreClub of p.clubes) {
      const clubId = idDeClub(nombreClub, p.ambito);
      if (!idsEnBase.has(clubId)) continue;
      const participantId = crypto.randomUUID();
      const entryId = crypto.randomUUID();

      await escribir('tournament_participants', 'POST', [{
        id: participantId, tournament_id: tournamentId, season_id: seasonId,
        club_id: clubId, name: titulo(nombreClub), type: 'club', status: 'active',
      }]);
      await escribir('team_season_entries', 'POST', [{
        id: entryId, season_id: seasonId, tournament_id: tournamentId,
        club_id: clubId, team_id: null, source_participant_id: participantId,
        status: 'active', settings: { source: `${proveedor}-import` },
      }]);
      await escribir(`tournament_participants?id=eq.${participantId}`, 'PATCH', { season_entry_id: entryId });
      await escribir('tournament_phase_participants', 'POST', [{
        id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
        phase_id: phaseId, participant_id: participantId, group_id: null, status: 'active',
      }]);

      // el alias deja atado el nombre de la fuente al club, por torneo
      await escribir('club_external_ids', 'POST', [{
        provider: proveedor,
        external_id: `${p.externalId}|${claveDeNombre(nombreClub)}`,
        club_id: clubId,
        confidence: 'exacto',
      }]);
    }

    // 11. partidos
    const filas = p.partidos.map((m) => {
      const local = idDeClub(m.local, p.ambito);
      const visitante = idDeClub(m.visitante, p.ambito);
      if (!idsEnBase.has(local) || !idsEnBase.has(visitante)) return null;
      const jugado = m.golesLocal !== null && m.golesVisitante !== null;
      // Con `points_autocalculated: false` el motor de posiciones toma los
      // puntos de estas columnas tal cual: mandarlas en cero deja la tabla con
      // todo el mundo en 0 aunque los resultados estén bien. Hockey: 3/1/0.
      const [ptsLocal, ptsVisitante] = !jugado
        ? [0, 0]
        : m.golesLocal! > m.golesVisitante! ? [3, 0]
        : m.golesLocal! < m.golesVisitante! ? [0, 3]
        : [1, 1];
      return {
        external_id: m.externalId,
        home_club_id: local,
        away_club_id: visitante,
        date_time: `${m.fecha}T${m.hora}:00${OFFSET_AR}`,
        status: jugado ? 'final' : 'scheduled',
        score: jugado ? { home: m.golesLocal, away: m.golesVisitante } : null,
        venue: m.venue,
        round_label: m.rondaLabel,
        points_autocalculated: false,
        home_base_points: ptsLocal, away_base_points: ptsVisitante,
        home_bonus_points: 0, away_bonus_points: 0,
        tournament_id: tournamentId,
        sport_id: SPORT,
        sport: SPORT,
        is_visible: true,
        phase_id: phaseId,
        season_id: seasonId,
      };
    }).filter(Boolean);

    // de a tandas: un torneo de ATA trae 90 partidos y conviene no mandarlos juntos
    for (let i = 0; i < filas.length; i += 50) {
      await escribir('matches', 'POST', filas.slice(i, i + 50));
    }

    fasesParaRecalcular.push({ torneo: tournamentId, fase: phaseId });
    console.log(`  ✓ ${p.nombre} — ${filas.length} partidos, ${p.clubes.size} clubes`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
