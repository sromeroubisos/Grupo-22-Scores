/**
 * INVENTARIO DE TORNEOS DE URBA, CRUZADO CONTRA G22.
 *
 * Mismo método que el inventario de clubes y por la misma razón: si el conector
 * crea torneos sin cruzar antes, duplica el Top 14 y todo lo que ya está cargado
 * a mano.
 *
 * Esto NO escribe nada. Ni en la base, ni en URBA. Sale un CSV y un resumen.
 *
 *   node --experimental-strip-types scripts/urba/inventario-torneos.ts
 *
 * ── Reglas de la bajada ──
 * · 250 ms entre pedidos, sin paralelizar. La URBA es una federación, no un CDN.
 * · Cada `/championship/{id}` se cachea en disco (gzip) para poder reanudar.
 * · La LISTA de cada año NO se cachea nunca: el catálogo se mueve durante el día
 *   —2026 pasó de 93 a 99 torneos en cuatro horas, y hoy tiene 134—.
 * · Un id inexistente devuelve 500, no 404. Es respuesta final: no se reintenta.
 */

import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildUrbaSeriesKey, buildUrbaTournamentExternalId } from '../../src/lib/integrations/urba/externalId.ts';

const API = 'https://api.urba.org.ar/api';
const ANIOS = [2021, 2022, 2023, 2024, 2025, 2026];
const CACHE = '.urba-cache';
const PAUSA_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════
//  Bajada
// ═══════════════════════════════════════════════════════════════════════════

interface UrbaTeam { id: number; name: string; club_id: number; club?: { id: number; name: string } | null }
interface UrbaMatch { id: number; fulfilled?: boolean; suspended?: boolean; playdate?: string | null }
interface UrbaRound { id: number; name: string; playoffs?: boolean | number; matches?: UrbaMatch[] | null }
interface UrbaChampionship {
  id: number; name: string; season_id: number; has_playoffs?: boolean; closed?: boolean;
  teams?: UrbaTeam[] | null; rounds?: UrbaRound[] | null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** La lista del año. Nunca se cachea: el catálogo se mueve. */
async function listarAnio(anio: number): Promise<{ id: number; name: string }[]> {
  const j = (await getJson(`${API}/championships/${anio}`)) as { championships?: { id: number; name: string }[] };
  return j.championships ?? [];
}

/**
 * El torneo completo, cacheado en disco.
 *
 * El 500 se guarda como fallo EN EL CACHÉ igual que un éxito: es respuesta final
 * de la API, así que reintentarlo en la próxima corrida sería gastar el mismo
 * pedido para recibir el mismo error.
 */
async function traerTorneo(id: number): Promise<{ ok: true; data: UrbaChampionship } | { ok: false; error: string }> {
  const f = join(CACHE, `championship-${id}.json.gz`);
  if (existsSync(f)) {
    const cached = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
    return cached.error ? { ok: false, error: cached.error } : { ok: true, data: cached };
  }
  await sleep(PAUSA_MS);
  try {
    const j = (await getJson(`${API}/championship/${id}`)) as { championship?: UrbaChampionship[] };
    const c = (j.championship ?? [])[0];
    if (!c) throw new Error('championship[0] vacío');
    writeFileSync(f, gzipSync(JSON.stringify(c)));
    return { ok: true, data: c };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    writeFileSync(f, gzipSync(JSON.stringify({ error })));
    return { ok: false, error };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Clasificación — sale del NOMBRE, que es lo único que URBA da
// ═══════════════════════════════════════════════════════════════════════════

const norm = (s: string) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\./g, '')          // 'R.C.' -> 'RC', sin insertar espacio (bug cazado en clubes)
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * La división. Se busca el nivel MÁS ALTO nombrado: en "TOP 14 - Intermedia" la
 * competencia es el Top 14 y la intermedia es la categoría, no otra división.
 *
 * OJO: la lista del pedido tenía sólo "Top 14", pero la primera división cambió
 * de nombre en estos seis años —Top 12 en 2021-22, Top 13, Top 14 hoy—. Se
 * devuelve el nombre REAL de cada año en vez de colapsarlos: colapsar escondería
 * que son ediciones distintas y es justo lo que un inventario no debe hacer.
 */
function division(nombre: string): string {
  const n = norm(nombre);
  if (/\btop\s*14\b/.test(n)) return 'Top 14';
  if (/\btop\s*13\b/.test(n)) return 'Top 13';
  if (/\btop\s*12\b/.test(n)) return 'Top 12';
  if (/\btop\s*9\b/.test(n)) return 'Top 9';
  if (/\bprimera\s*a\b/.test(n)) return 'Primera A';
  if (/\bprimera\s*b\b/.test(n)) return 'Primera B';
  if (/\bprimera\s*c\b/.test(n)) return 'Primera C';
  if (/\bsegunda\b/.test(n) && !/segunda rueda/.test(n) && !/segunda division/.test(n)) return 'Segunda';
  if (/\btercera\b/.test(n) && !/tercera rueda/.test(n)) return 'Tercera';
  if (/\bdesarrollo\b/.test(n)) return 'Desarrollo';
  if (/\buniversitario\b/.test(n)) return 'Universitario';
  if (/\bformativ/.test(n)) return 'Formativo';
  if (/\bempresarial\b/.test(n)) return 'Empresarial';
  if (/\bpreintermedia\b/.test(n)) return 'Preintermedia';
  if (/\bintermedia\b/.test(n)) return 'Intermedia';
  if (/\bprimera division\b/.test(n)) return 'Primera División';
  if (/\bsegunda division\b/.test(n)) return 'Segunda División';
  return 'otro';
}

/**
 * La franja de edad. Conviven TRES convenciones en el histórico:
 *   'Menores de 17 - …'            (la más común)
 *   'Juveniles - … - M19 - …'      (2021-2022)
 *   '… M17 …'                      (pegado)
 * Más 'Menores de 22', que en 2026 aparece como "TOP 14 - Menores de 22".
 */
function ageGrade(nombre: string): string {
  const n = norm(nombre);
  const m1 = n.match(/menores de (\d{2})/);
  if (m1) return `M${m1[1]}`;
  const m2 = n.match(/\bm\s?(15|16|17|18|19|20|22)\b/);
  if (m2) return `M${m2[1]}`;
  return 'mayores';
}

/** Género. Lo que no está marcado como femenino se informa masculino. */
function gender(nombre: string): string {
  return /\bfemenin|damas|women/.test(norm(nombre)) ? 'femenino' : 'masculino';
}

/**
 * La rueda. Es la columna que alimenta la decisión que el usuario tiene que
 * tomar: URBA parte muchas competencias en dos torneos con ids distintos.
 */
function rueda(nombre: string): string {
  const n = norm(nombre);
  if (/\bprimera rueda\b/.test(n)) return 'primera';
  if (/\bsegunda rueda\b/.test(n)) return 'segunda';
  if (/\btercera rueda\b/.test(n)) return 'otro';
  if (/\brueda\b/.test(n)) return 'otro';
  return 'unica';
}

/** El nombre sin el marcador de rueda: es la llave para aparear las dos mitades. */
function sinRueda(nombre: string): string {
  return norm(nombre).replace(/\b(primera|segunda|tercera) rueda\b/g, '').replace(/\s+/g, ' ').trim();
}

const esBye = (t: UrbaTeam) => /^bye$/i.test(String(t?.name ?? '').trim());

/**
 * La forma REDUCIDA de un nombre, para la segunda pasada del cruce.
 *
 * Existe por un hallazgo del sondeo: G22 no escribe los torneos de URBA con el
 * nombre de URBA. Escribe `Top 14 de la URBA` donde URBA dice `TOP 14 - Superior`,
 * y `URBA: Menores de 17 - G2 NIVEL 1 "A"` donde URBA dice
 * `Menores de 17 - Primera Rueda - G2 NIVEL 1 A`.
 *
 * Con el cruce exacto por (nombre, año) los ocho o nueve torneos de URBA que YA
 * ESTÁN cargados a mano darían "falta" — que es justo el falso negativo que este
 * inventario existe para evitar, porque un "falta" es lo que después autoriza al
 * conector a crear un duplicado.
 *
 * Lo que se saca es SÓLO chatarra de encuadre: la marca de la unión, el marcador
 * de rueda y el sufijo "Superior" de la categoría mayor. Nada que distinga a un
 * torneo de otro.
 */
function reducido(nombre: string): string {
  return norm(nombre)
    .replace(/\burba\b/g, '')
    .replace(/\bde la\b/g, '')
    .replace(/\b(primera|segunda|tercera) rueda\b/g, '')
    .replace(/\bsuperior\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens con carga: los de una o dos letras no distinguen nada. */
const tokens = (s: string) => new Set(reducido(s).split(' ').filter((t) => t.length > 2));

// ═══════════════════════════════════════════════════════════════════════════
//  G22
// ═══════════════════════════════════════════════════════════════════════════

function env(): { url: string; key: string } {
  const raw = readFileSync('.env.local', 'utf8');
  const get = (k: string) => raw.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  return { url, key };
}

async function g22<T>(path: string): Promise<T[]> {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`G22 ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

interface G22Tournament {
  id: string; name: string; season_id: string | null; category: string | null;
  age_grade: string | null; gender: string | null; union_id: string | null;
  status: string | null; is_visible: boolean | null; external_id: string | null;
}
interface G22Season {
  id: string; tournament_id: string; season_code: string | null; name: string | null; display_name: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CSV
// ═══════════════════════════════════════════════════════════════════════════

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',');

// ═══════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════

interface Fila {
  urba_id: number; external_id: string; nombre: string; anio: number;
  division: string; age_grade: string; gender: string; rueda: string;
  /** Lo que la pantalla muestra. Sintetiza el marcador que URBA no escribió. */
  rueda_mostrada: string;
  /** El vínculo entre ruedas, o vacío si no aparea. Nunca se adivina. */
  series_key: string;
  equipos: number; partidos: number; partidos_jugados: number;
  g22_tournament_id: string; g22_nombre: string;
  g22_external_id_ajeno: string;
  g22_modelo: string;
  estado: string; confianza: string;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });

  // ── 1 · El universo de URBA ──────────────────────────────────────────────
  const universo: { id: number; name: string; anio: number }[] = [];
  for (const anio of ANIOS) {
    const lista = await listarAnio(anio);
    for (const c of lista) universo.push({ id: c.id, name: c.name, anio });
    console.error(`  ${anio}: ${lista.length} torneos`);
    await sleep(PAUSA_MS);
  }
  console.error(`  TOTAL: ${universo.length}`);

  // ── 2 · El detalle de cada uno ───────────────────────────────────────────
  const detalle = new Map<number, UrbaChampionship>();
  const fallos: { id: number; name: string; anio: number; error: string }[] = [];
  let i = 0;
  for (const c of universo) {
    i += 1;
    if (i % 50 === 0) console.error(`  detalle ${i}/${universo.length}`);
    const r = await traerTorneo(c.id);
    if (r.ok === true) {
      detalle.set(c.id, r.data);
    } else {
      fallos.push({ id: c.id, name: c.name, anio: c.anio, error: r.error });
    }
  }
  console.error(`  bajados: ${detalle.size}  fallos: ${fallos.length}`);

  // ── 3 · G22 ──────────────────────────────────────────────────────────────
  const torneosG22 = await g22<G22Tournament>(
    'tournaments?select=id,name,season_id,category,age_grade,gender,union_id,status,is_visible,external_id',
  );
  const seasonsG22 = await g22<G22Season>(
    'tournament_seasons?select=id,tournament_id,season_code,name,display_name',
  );
  console.error(`  G22: ${torneosG22.length} torneos, ${seasonsG22.length} temporadas`);

  // Índice de cruce: (nombre normalizado, año) -> candidatos.
  // Entran las DOS formas de modelar el año, porque G22 usa las dos:
  //   · tournaments.season_id           (un torneo por año)
  //   · tournament_seasons.season_code  (un torneo con varias temporadas)
  const indice = new Map<string, { t: G22Tournament; modelo: string }[]>();
  const push = (nombre: string, anio: string, t: G22Tournament, modelo: string) => {
    const k = `${norm(nombre)}::${anio}`;
    if (!indice.has(k)) indice.set(k, []);
    const ya = indice.get(k)!;
    if (!ya.some((x) => x.t.id === t.id)) ya.push({ t, modelo });
  };
  // Los candidatos de un año, para la segunda pasada. Se arma con las dos formas
  // de modelar el año, igual que el índice exacto.
  const porAnio = new Map<string, { t: G22Tournament; modelo: string }[]>();
  const addAnio = (anio: string, t: G22Tournament, modelo: string) => {
    if (!porAnio.has(anio)) porAnio.set(anio, []);
    const ya = porAnio.get(anio)!;
    if (!ya.some((x) => x.t.id === t.id)) ya.push({ t, modelo });
  };
  const candidatosDelAnio = (anio: string) => porAnio.get(anio) ?? [];

  const porId = new Map(torneosG22.map((t) => [t.id, t]));
  for (const t of torneosG22) {
    if (!t.season_id) continue;
    push(t.name, String(t.season_id), t, 'tournaments.season_id');
    addAnio(String(t.season_id), t, 'tournaments.season_id');
  }
  for (const s of seasonsG22) {
    const t = porId.get(s.tournament_id);
    if (!t || !s.season_code) continue;
    for (const nombre of [s.name, s.display_name, t.name]) {
      if (nombre) push(nombre, String(s.season_code), t, 'tournament_seasons.season_code');
    }
    addAnio(String(s.season_code), t, 'tournament_seasons.season_code');
  }

  // ── 4 · Las filas ────────────────────────────────────────────────────────
  const filas: Fila[] = [];
  for (const c of universo) {
    const d = detalle.get(c.id);
    const teams = (d?.teams ?? []).filter((t) => !esBye(t));
    const matches = (d?.rounds ?? []).flatMap((r) => r.matches ?? []);

    const clave = `${norm(c.name)}::${c.anio}`;
    const cands = indice.get(clave) ?? [];

    let estado = 'falta';
    let confianza: string = 'ninguna';
    let g22Id = '';
    let g22Nombre = '';
    let ajeno = '';
    let modelo = '';

    if (cands.length === 1) {
      estado = 'existe'; confianza = 'exacto';
      g22Id = cands[0].t.id; g22Nombre = cands[0].t.name; modelo = cands[0].modelo;
      // REGLA 3: si ya tiene external_id de otro proveedor, NO se pisa. Se reporta.
      if (cands[0].t.external_id && cands[0].t.external_id !== buildUrbaTournamentExternalId(c.id)) {
        ajeno = cands[0].t.external_id;
      }
    } else if (cands.length > 1) {
      // REGLA 1: si dos candidatos compiten, es del usuario la decisión.
      estado = 'ambiguo'; confianza = 'parcial';
      g22Id = cands.map((x) => x.t.id).join(' | ');
      g22Nombre = cands.map((x) => x.t.name).join(' | ');
      modelo = [...new Set(cands.map((x) => x.modelo))].join(' | ');
    } else {
      // SEGUNDA PASADA. Sin esto, los torneos de URBA que ya están cargados a
      // mano con OTRO nombre salen como 'falta' y el conector los duplica: es
      // exactamente el accidente que este inventario tiene que impedir.
      //
      // Nunca asciende a 'existe'. Es la lección del matcher de clubes:
      // `Atlético San Andrés` compartía dos palabras con `San Andrés` y son
      // clubes distintos. Todo parcial es del usuario.
      const mios = tokens(c.name);
      const miEdad = ageGrade(c.name);
      const parciales = candidatosDelAnio(String(c.anio)).filter(({ t }) => {
        // La franja de edad no se negocia: un M19 no es candidato de un M17 por
        // más tokens que compartan. Sin esto, cada juvenil proponía los cuatro
        // juveniles de G22 y la columna dejaba de servir para decidir.
        if (ageGrade(t.name) !== miEdad) return false;
        if (reducido(t.name) === reducido(c.name)) return true;
        const suyos = tokens(t.name);
        if (mios.size === 0 || suyos.size === 0) return false;
        let comunes = 0;
        for (const t2 of mios) if (suyos.has(t2)) comunes += 1;
        // Contención en cualquier dirección, con al menos dos tokens con carga.
        return comunes >= 2 && (comunes === mios.size || comunes === suyos.size);
      });
      if (parciales.length > 0) {
        estado = 'ambiguo'; confianza = 'parcial';
        g22Id = parciales.map((x) => x.t.id).join(' | ');
        g22Nombre = parciales.map((x) => x.t.name).join(' | ');
        modelo = [...new Set(parciales.map((x) => x.modelo))].join(' | ');
        const conAjeno = parciales.find((x) => x.t.external_id);
        if (conAjeno) ajeno = conAjeno.t.external_id!;
      }
    }

    filas.push({
      urba_id: c.id,
      external_id: buildUrbaTournamentExternalId(c.id),
      nombre: c.name,
      anio: c.anio,
      division: division(c.name),
      age_grade: ageGrade(c.name),
      gender: gender(c.name),
      rueda: rueda(c.name),
      rueda_mostrada: rueda(c.name), // se corrige abajo, con la serie ya armada
      series_key: '',
      equipos: teams.length,
      partidos: matches.length,
      partidos_jugados: matches.filter((m) => m.fulfilled === true).length,
      g22_tournament_id: g22Id,
      g22_nombre: g22Nombre,
      g22_external_id_ajeno: ajeno,
      g22_modelo: modelo,
      estado,
      confianza,
    });
  }

  // ── 4b · Las series ──────────────────────────────────────────────────────
  //
  // Se cargan como TORNEOS SEPARADOS. Lo único que se guarda es el vínculo, y
  // sólo donde aparea: el campo de equipos cambia entre ruedas —de 2 sobre 9 a 9
  // sobre 12 en los pares medidos— así que fusionarlas ordenaría clubes que
  // nunca se enfrentaron.
  //
  // Un torneo SIN marcador que tiene hermano con "Segunda Rueda" es la primera
  // rueda publicada sin la etiqueta: URBA escribe 307 "segunda" contra 201
  // "primera", y ese hueco es justamente el de las primeras sin marcar. La
  // síntesis va en `rueda_mostrada` y NO pisa `nombre` ni `rueda`, que son lo que
  // dijo la fuente.
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = `${sinRueda(f.nombre)}::${f.anio}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(f);
  }

  let seriesArmadas = 0;
  let enSerie = 0;
  let sintetizadas = 0;
  for (const miembros of grupos.values()) {
    const haySegunda = miembros.some((f) => f.rueda === 'segunda');
    // Una serie necesita DOS mitades y que una sea la segunda. Un grupo de dos
    // "única" con el mismo nombre base no es una serie: son dos torneos que
    // normalizan igual, y adivinar ahí es exactamente lo que no hay que hacer.
    if (miembros.length < 2 || !haySegunda) continue;

    const key = buildUrbaSeriesKey(miembros.map((f) => f.urba_id));
    seriesArmadas += 1;
    for (const f of miembros) {
      f.series_key = key;
      enSerie += 1;
      if (f.rueda === 'unica') { f.rueda_mostrada = 'primera'; sintetizadas += 1; }
    }
  }

  const sueltos = filas.filter((f) => !f.series_key && (f.rueda === 'primera' || f.rueda === 'segunda'));

  // ── 5 · CSV ──────────────────────────────────────────────────────────────
  const cols = [
    'urba_id', 'external_id', 'nombre', 'anio', 'division', 'age_grade', 'gender',
    'rueda', 'rueda_mostrada', 'series_key',
    'equipos', 'partidos', 'partidos_jugados',
    'g22_tournament_id', 'g22_nombre', 'g22_external_id_ajeno', 'g22_modelo', 'estado', 'confianza',
  ] as const;
  const csv = [csvRow(cols as unknown as string[]), ...filas.map((f) => csvRow(cols.map((k) => (f as never)[k])))].join('\n');
  writeFileSync('inventario-torneos-urba-g22.csv', `${csv}\n`, 'utf8');

  // ── 6 · Resumen ──────────────────────────────────────────────────────────
  const cuenta = <K extends keyof Fila>(k: K) => {
    const m: Record<string, number> = {};
    for (const f of filas) m[String(f[k])] = (m[String(f[k])] ?? 0) + 1;
    return m;
  };
  const tabla = (t: Record<string, number>) => Object.entries(t)
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${String(v).padStart(5)}  ${k}`).join('\n');

  const ruedasPorAnio: Record<number, { primera: number; segunda: number; otro: number; unica: number }> = {};
  for (const f of filas) {
    const r = (ruedasPorAnio[f.anio] ??= { primera: 0, segunda: 0, otro: 0, unica: 0 });
    (r as Record<string, number>)[f.rueda] += 1;
  }

  // Pares de rueda: el mismo nombre sin el marcador, en el mismo año.
  const pares = new Map<string, { primera?: Fila; segunda?: Fila }>();
  for (const f of filas) {
    if (f.rueda !== 'primera' && f.rueda !== 'segunda') continue;
    const k = `${sinRueda(f.nombre)}::${f.anio}`;
    const p = pares.get(k) ?? {};
    (p as Record<string, Fila>)[f.rueda] = f;
    pares.set(k, p);
  }
  const completos = [...pares.values()].filter((p) => p.primera && p.segunda);
  const huerfanos = [...pares.entries()].filter(([, p]) => !p.primera || !p.segunda);

  const out: string[] = [];
  out.push('# INVENTARIO DE TORNEOS URBA × G22');
  out.push('');
  out.push(`Torneos de URBA (2021-2026): **${filas.length}**  ·  detalle bajado: ${detalle.size}  ·  fallos: ${fallos.length}`);
  out.push(`Torneos en G22: ${torneosG22.length}  ·  filas en tournament_seasons: ${seasonsG22.length}`);
  out.push('');
  out.push('## Por año'); out.push('```'); out.push(tabla(cuenta('anio'))); out.push('```');
  out.push('## Por división'); out.push('```'); out.push(tabla(cuenta('division'))); out.push('```');
  out.push('## Por estado'); out.push('```'); out.push(tabla(cuenta('estado'))); out.push('```');
  out.push('## Por confianza'); out.push('```'); out.push(tabla(cuenta('confianza'))); out.push('```');
  out.push('## Por franja de edad'); out.push('```'); out.push(tabla(cuenta('age_grade'))); out.push('```');
  out.push('## Por género'); out.push('```'); out.push(tabla(cuenta('gender'))); out.push('```');
  out.push('');
  out.push('## Ruedas — el dato para la decisión');
  out.push('```');
  out.push('año     primera  segunda    otro   única');
  for (const a of ANIOS) {
    const r = ruedasPorAnio[a] ?? { primera: 0, segunda: 0, otro: 0, unica: 0 };
    out.push(`${a}   ${String(r.primera).padStart(7)} ${String(r.segunda).padStart(8)} ${String(r.otro).padStart(7)} ${String(r.unica).padStart(7)}`);
  }
  out.push('```');
  out.push('');
  out.push('## Series — el vínculo que sí se guarda');
  out.push('');
  out.push('Los torneos van SEPARADOS. La serie es sólo el vínculo, y sólo donde aparea.');
  out.push('');
  out.push(`- Series armadas: **${seriesArmadas}**`);
  out.push(`- Torneos con \`series_key\`: **${enSerie}** de ${filas.length}`);
  out.push(`- Marcadores "Primera Rueda" **sintetizados** (URBA no los escribió): **${sintetizadas}**`);
  out.push(`- Mitades marcadas que quedaron **sin vínculo**: **${sueltos.length}**`);
  out.push('');
  out.push('El marcador sintetizado vive en `rueda_mostrada`. `nombre` y `rueda` quedan');
  out.push('tal como los publica URBA: la síntesis es de presentación, no de origen.');
  if (sueltos.length) {
    out.push('');
    out.push('Ejemplos de mitades sin vínculo (las 10 primeras):');
    out.push('```');
    for (const f of sueltos.slice(0, 10)) out.push(`  sólo ${f.rueda.padEnd(7)}  ${f.anio}  ${f.nombre}`);
    out.push('```');
  }
  if (fallos.length) {
    out.push('');
    out.push('## Fallos de bajada');
    out.push('```');
    for (const f of fallos.slice(0, 30)) out.push(`  ${f.anio}  ${f.id}  ${f.error}  ${f.name}`);
    out.push('```');
  }

  writeFileSync('inventario-torneos-urba-g22.md', `${out.join('\n')}\n`, 'utf8');

  // Los pares completos, para el sondeo de posiciones del informe de ruedas.
  writeFileSync(
    '.urba-cache/pares-rueda.json',
    JSON.stringify(completos.map((p) => ({
      nombre: sinRueda(p.primera!.nombre), anio: p.primera!.anio,
      primera: p.primera!.urba_id, segunda: p.segunda!.urba_id,
      equipos: p.primera!.equipos,
    })), null, 1),
    'utf8',
  );

  console.error('\nListo: inventario-torneos-urba-g22.csv + .md');
  console.error(out.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
