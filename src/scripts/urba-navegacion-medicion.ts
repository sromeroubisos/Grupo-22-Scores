/**
 * ¿Se sostienen las claves de los dos desplegables de navegación?
 *
 *   node src/scripts/urba-navegacion-medicion.ts
 *
 * No escribe nada y no toca la API: mide sobre los 811 torneos de URBA — los 134
 * de 2026 tal como están HOY en la base, y los 677 de 2021-2025 con los valores
 * que les daría la carga histórica.
 *
 * Las dos claves son la misma tupla mirada por ejes distintos:
 *
 *   desplegable de GRADO      hermanos = mismo (season_id, category, age_grade, gender)
 *                             y distinta subcategory
 *   desplegable de TEMPORADA  hermanos = misma (category, subcategory, age_grade, gender)
 *                             y distinto season_id
 *
 * La pregunta que decide si el segundo se puede construir es si esa clave es
 * ESTABLE entre años. En mayores probablemente sí. En juveniles hay motivos para
 * dudar: las competencias se llamaban `Grupo N - Zona X` hasta 2023 y `G2 NIVEL x`
 * desde 2024, y la mitad cae en `category = 'otro'`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { planTournamentRow } from '../lib/integrations/urba/tournamentRow.ts';
import { competitionKey, divisionKey, normalizeAgeGrade } from '../lib/competitionKey.ts';

const REPO = process.cwd();
const CSV = path.join(REPO, 'inventario-torneos-urba.csv');
const SALIDA = path.join(REPO, 'URBA_NAVEGACION_MEDICION.md');

const env: Record<string, string> = { ...process.env as Record<string, string> };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${desde}-${desde + 999}` },
    });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status}`);
    const chunk = await res.json() as T[];
    filas.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return filas;
}

interface Torneo {
  external_id: string; name: string; anio: number;
  category: string; subcategory: string | null; age_grade: string; gender: string | null;
  origen: 'base' | 'derivado';
}

/**
 * Las dos claves salen de `src/lib/competitionKey.ts`, que es la misma
 * derivación que va a usar la UI. Medir con una copia local sería medir otra
 * cosa: el día que la de la UI cambie, este informe seguiría diciendo lo de antes.
 */
const claveTemporada = (t: Torneo) => competitionKey(t);
const claveGrado = (t: Torneo) => divisionKey({ ...t, season_id: t.anio });

async function main() {
  const enBase = await selectAll<any>(
    'tournaments?select=external_id,name,season_id,category,subcategory,age_grade,gender&external_id=like.urba:*',
  );
  const porExt = new Map(enBase.map((t) => [t.external_id, t]));

  const lineas = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  const cab = lineas[0].split(',');
  const inventario = lineas.slice(1).map((l) => {
    const c = l.split(',');
    const o: any = {};
    cab.forEach((h, i) => (o[h] = c[i]));
    return o;
  });

  // Los 134 de 2026 se leen de la BASE, no se derivan: es el estado real contra
  // el que va a correr la navegación, con sus 8 torneos preexistentes incluidos.
  // Los 677 históricos todavía no existen: se usan los valores que les daría la carga.
  const torneos: Torneo[] = inventario.map((r) => {
    const yaEsta = porExt.get(r.external_id);
    if (yaEsta) {
      return {
        external_id: r.external_id, name: yaEsta.name, anio: Number(yaEsta.season_id),
        category: yaEsta.category, subcategory: yaEsta.subcategory,
        age_grade: yaEsta.age_grade, gender: yaEsta.gender, origen: 'base',
      };
    }
    const fila = planTournamentRow(r, { isVisible: false });
    return {
      external_id: r.external_id, name: fila.name, anio: Number(fila.season_id),
      category: fila.category, subcategory: fila.subcategory,
      age_grade: fila.age_grade, gender: fila.gender, origen: 'derivado',
    };
  });

  const md: string[] = [];
  md.push('# Los dos desplegables — medición sobre los 811 torneos\n');
  md.push('No se escribió nada. Los 134 de 2026 salen de la base tal como están hoy;');
  md.push('los 677 de 2021-2025, con los valores que les daría la carga histórica.\n');
  md.push(`Total: **${torneos.length}** · de la base ${torneos.filter((t) => t.origen === 'base').length} · derivados ${torneos.filter((t) => t.origen === 'derivado').length}\n`);

  /* ── (b) TEMPORADAS ─────────────────────────────────────────────────────── */
  const porClave = new Map<string, Torneo[]>();
  for (const t of torneos) {
    if (!porClave.has(claveTemporada(t))) porClave.set(claveTemporada(t), []);
    porClave.get(claveTemporada(t))!.push(t);
  }
  const aniosDe = (c: string) => new Set(porClave.get(c)!.map((t) => t.anio));

  md.push('\n## b) Temporadas — ¿la clave se sostiene entre años?\n');
  md.push('Clave: `(category, subcategory, age_grade, gender)`.\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| **claves distintas** | **${porClave.size}** |`);
  md.push(`| torneos | ${torneos.length} |`);
  md.push(`| torneos por clave (promedio) | ${(torneos.length / porClave.size).toFixed(1)} |`);

  md.push('\n### En cuántos años existe cada clave\n');
  md.push('| años en los que aparece | claves | torneos que caen ahí |');
  md.push('|---:|---:|---:|');
  const porCantidadDeAnios = new Map<number, { claves: number; torneos: number }>();
  for (const c of porClave.keys()) {
    const n = aniosDe(c).size;
    const e = porCantidadDeAnios.get(n) ?? { claves: 0, torneos: 0 };
    e.claves++;
    e.torneos += porClave.get(c)!.length;
    porCantidadDeAnios.set(n, e);
  }
  for (let n = 6; n >= 1; n--) {
    const e = porCantidadDeAnios.get(n);
    md.push(`| ${n} | ${e?.claves ?? 0} | ${e?.torneos ?? 0} |`);
  }

  const unSoloAnio = [...porClave.keys()].filter((c) => aniosDe(c).size === 1);
  const torneosSinTemporadas = unSoloAnio.reduce((s, c) => s + porClave.get(c)!.length, 0);
  md.push(`\n**${torneosSinTemporadas} torneos (${(torneosSinTemporadas / torneos.length * 100).toFixed(0)}%) caen en una clave que existe en un solo año.**`);
  md.push('Para esos, el desplegable de temporadas tendría un solo item: el año en el');
  md.push('que ya estás.\n');

  /* ── mayores vs juveniles ───────────────────────────────────────────────── */
  const esMayores = (t: Torneo) => normalizeAgeGrade(t.age_grade) === 'mayores';
  const grupos: Array<[string, (t: Torneo) => boolean]> = [
    ['mayores', esMayores],
    ['juveniles (M15-M22)', (t) => /^M\d/.test(normalizeAgeGrade(t.age_grade))],
  ];
  md.push('\n### Mayores contra juveniles\n');
  md.push('| grupo | torneos | claves | claves en 1 solo año | torneos sin temporadas para elegir |');
  md.push('|---|---:|---:|---:|---:|');
  for (const [nombre, filtro] of grupos) {
    const sub = torneos.filter(filtro);
    const claves = new Set(sub.map(claveTemporada));
    const solas = [...claves].filter((c) => new Set(sub.filter((t) => claveTemporada(t) === c).map((t) => t.anio)).size === 1);
    const nSolas = sub.filter((t) => solas.includes(claveTemporada(t))).length;
    md.push(`| ${nombre} | ${sub.length} | ${claves.size} | ${solas.length} | **${nSolas}** (${(nSolas / sub.length * 100).toFixed(0)}%) |`);
  }

  md.push('\n### Las claves que más años cubren\n');
  md.push('| clave `category ǀ subcategory ǀ age_grade ǀ gender` | años | torneos |');
  md.push('|---|---|---:|');
  [...porClave.entries()]
    .sort((a, b) => aniosDe(b[0]).size - aniosDe(a[0]).size || b[1].length - a[1].length)
    .slice(0, 25)
    .forEach(([c, ts]) => md.push(`| \`${c}\` | ${[...aniosDe(c)].sort().join(' ')} | ${ts.length} |`));

  md.push('\n### La máxima categoría, y por qué hizo falta `competitionKey`\n');
  md.push('Medido con las columnas CRUDAS —sin normalizar nada— mayores salía **menos**');
  md.push('estable que juveniles: 57 claves, 25 en un solo año, 40 torneos (16%) sin');
  md.push('temporadas. La causa no era el histórico sucio:');
  md.push('**la máxima categoría de URBA cambia de nombre con su tamaño.**\n');
  md.push('| año | cómo se llama la máxima |');
  md.push('|---|---|');
  for (const anio of [2021, 2022, 2023, 2024, 2025, 2026]) {
    const tops = [...new Set(torneos.filter((t) => t.anio === anio && /^Top/.test(t.category)).map((t) => t.category))];
    md.push(`| ${anio} | ${tops.join(', ') || '—'} |`);
  }
  md.push('\nEs UNA sola competencia —la Superior de la máxima— y la clave cruda la partía');
  md.push('en tres: parado en el Top 14 de 2026 el desplegable no ofrecía ningún año,');
  md.push('aunque hubiera cinco de la misma competencia debajo.\n');
  md.push('`competitionKey` colapsa `Top 12` / `Top 13` / `Top 14` a `Top` —y sólo esas,');
  md.push('las que llevan el tamaño en el nombre; `Primera A` y `Primera B` siguen');
  md.push('separadas porque son divisiones distintas de verdad—, además de normalizar');
  md.push('la grafía de `age_grade` y el `gender` en NULL. El efecto, medido:\n');
  md.push('| | con las columnas crudas | con `competitionKey` |');
  md.push('|---|---:|---:|');
  md.push(`| claves distintas | 79 | ${porClave.size} |`);
  md.push(`| torneos sin temporadas para elegir | 92 (11%) | ${torneosSinTemporadas} (${(torneosSinTemporadas / torneos.length * 100).toFixed(0)}%) |`);
  md.push('| de mayores | 40 (16%) | ver la tabla de arriba |');
  md.push('');
  const mayoresClaves = new Map<string, Set<number>>();
  for (const t of torneos.filter(esMayores)) {
    if (!mayoresClaves.has(claveTemporada(t))) mayoresClaves.set(claveTemporada(t), new Set());
    mayoresClaves.get(claveTemporada(t))!.add(t.anio);
  }
  const mayoresSolas = [...mayoresClaves.entries()].filter(([, a]) => a.size === 1);
  const porTop = mayoresSolas.filter(([c]) => /^Top \d/.test(c));
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| claves de mayores en un solo año | ${mayoresSolas.length} de ${mayoresClaves.size} |`);
  md.push(`| **de ésas, las que son Top 12 / 13 / 14** | **${porTop.length}** |`);
  md.push(`| el resto | ${mayoresSolas.length - porTop.length} |`);
  md.push('\nJuveniles da más "estable" por el motivo contrario, y tampoco es bueno: sus');
  md.push('claves son TAN gruesas que una sola (`otro ǀ juvenil ǀ M15 ǀ masculino`) se');
  md.push('come 84 torneos de los 6 años. Elegir "2024" ahí no te lleva a un torneo:');
  md.push('te lleva a dieciséis.\n');

  md.push('\n### Claves de un solo año, por age_grade\n');
  md.push('| age_grade | claves de 1 año | torneos |');
  md.push('|---|---:|---:|');
  const solasPorEdad: Record<string, { claves: number; torneos: number }> = {};
  for (const c of unSoloAnio) {
    const ts = porClave.get(c)!;
    const k = ts[0].age_grade;
    solasPorEdad[k] = solasPorEdad[k] ?? { claves: 0, torneos: 0 };
    solasPorEdad[k].claves++;
    solasPorEdad[k].torneos += ts.length;
  }
  for (const [k, v] of Object.entries(solasPorEdad).sort((a, b) => b[1].torneos - a[1].torneos)) {
    md.push(`| ${k} | ${v.claves} | ${v.torneos} |`);
  }

  /* ── los 8 preexistentes ────────────────────────────────────────────────── */
  const raros = torneos.filter((t) => t.origen === 'base'
    && (t.gender === null || !['mayores', 'M15', 'M16', 'M17', 'M18', 'M19', 'M20', 'M22'].includes(t.age_grade)));
  md.push('\n### Los torneos que rompen la clave por su propia forma\n');
  md.push('No es un problema del histórico: son torneos que ya existían en G22 antes de');
  md.push('URBA y que la carga vinculó en vez de crear. Traen `age_grade` con otra');
  md.push('grafía y `gender` en NULL, así que caen en una clave propia y quedan solos.\n');
  md.push('| external_id | nombre | category | subcategory | age_grade | gender |');
  md.push('|---|---|---|---|---|---|');
  raros.forEach((t) => md.push(`| \`${t.external_id}\` | ${t.name.slice(0, 40)} | ${t.category} | ${t.subcategory ?? '—'} | ${t.age_grade} | ${t.gender ?? '**NULL**'} |`));
  md.push(`\n**${raros.length} torneos.** Normalizarlos es un UPDATE de dos columnas y los`);
  md.push('devuelve a la clave de sus hermanos.\n');

  /* ── (a) GRADO ──────────────────────────────────────────────────────────── */
  const porDivision = new Map<string, Torneo[]>();
  for (const t of torneos) {
    if (!porDivision.has(claveGrado(t))) porDivision.set(claveGrado(t), []);
    porDivision.get(claveGrado(t))!.push(t);
  }
  md.push('\n## a) Tipo de torneo — el desplegable de grados\n');
  md.push('Clave: `(season_id, category, age_grade, gender)`; los hermanos se');
  md.push('distinguen por `subcategory`.\n');
  md.push('El menú sólo sirve si los hermanos tienen grados **DISTINTOS**. Contar');
  md.push('hermanos infla el número: una división juvenil tiene 28 torneos y los 28');
  md.push('dicen `juvenil`, así que el desplegable listaría 28 veces la misma palabra.\n');
  /** Grados distintos dentro de la división, sin contar los NULL. */
  const gradosDe = (g: Torneo[]) => new Set(g.map((t) => t.subcategory).filter((s): s is string => s !== null));
  const utiles = [...porDivision.values()].filter((g) => gradosDe(g).size > 1);
  const torneosUtiles = utiles.reduce((s, g) => s + g.filter((t) => t.subcategory !== null).length, 0);
  const sinSub = torneos.filter((t) => t.subcategory === null);
  const colapsados = [...porDivision.values()]
    .filter((g) => gradosDe(g).size === 1 && g.filter((t) => t.subcategory !== null).length > 1);
  const torneosColapsados = colapsados.reduce((s, g) => s + g.filter((t) => t.subcategory !== null).length, 0);

  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| divisiones (grupos) | ${porDivision.size} |`);
  md.push(`| divisiones con **más de un grado distinto** | ${utiles.length} |`);
  md.push(`| **torneos con desplegable ÚTIL** | **${torneosUtiles}** |`);
  md.push(`| torneos con hermanos pero TODOS del mismo grado | ${torneosColapsados} |`);
  md.push(`| torneos con \`subcategory\` NULL (sin desplegable, a propósito) | ${sinSub.length} |`);
  md.push(`| torneos sin hermanos | ${torneos.length - torneosUtiles - torneosColapsados - sinSub.length} |`);

  md.push('\n### Dónde sirve y dónde no\n');
  md.push('| grupo | torneos | con desplegable útil | colapsados en un solo grado | NULL |');
  md.push('|---|---:|---:|---:|---:|');
  for (const [nombre, filtro] of grupos) {
    const sub = torneos.filter(filtro);
    const divs = new Map<string, Torneo[]>();
    for (const t of sub) {
      if (!divs.has(claveGrado(t))) divs.set(claveGrado(t), []);
      divs.get(claveGrado(t))!.push(t);
    }
    let u = 0, c = 0;
    for (const g of divs.values()) {
      const n = g.filter((t) => t.subcategory !== null).length;
      if (gradosDe(g).size > 1) u += n;
      else if (n > 1) c += n;
    }
    md.push(`| ${nombre} | ${sub.length} | **${u}** | ${c} | ${sub.filter((t) => t.subcategory === null).length} |`);
  }

  md.push('\n### Las divisiones con más grados distintos\n');
  md.push('| año · category · age_grade · gender | grados distintos |');
  md.push('|---|---|');
  [...porDivision.entries()]
    .filter(([, g]) => gradosDe(g).size > 1)
    .sort((a, b) => gradosDe(b[1]).size - gradosDe(a[1]).size)
    .slice(0, 12)
    .forEach(([k, g]) => md.push(`| \`${k}\` | ${[...gradosDe(g)].sort().join(' · ')} |`));

  md.push('\n### Las divisiones que colapsan en un solo grado\n');
  md.push('Acá el desplegable no distingue nada: el eje que separa a estos torneos es');
  md.push('Grupo / Zona / Nivel, que no tiene columna. La identidad sigue siendo el');
  md.push('nombre completo.\n');
  md.push('| año · category · age_grade · gender | torneos | único grado | ejemplo de nombres |');
  md.push('|---|---:|---|---|');
  colapsados
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .forEach((g) => {
      md.push(`| \`${claveGrado(g[0])}\` | ${g.length} | ${[...gradosDe(g)][0]} | ${g.slice(0, 3).map((t) => t.name.replace(/^URBA: /, '').slice(0, 40)).join(' · ')} … |`);
    });

  md.push('\n### Todos los valores de subcategory que existirían\n');
  const todosLosGrados: Record<string, number> = {};
  for (const t of torneos) todosLosGrados[String(t.subcategory)] = (todosLosGrados[String(t.subcategory)] || 0) + 1;
  md.push('| subcategory | torneos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(todosLosGrados).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${k === 'null' ? '**NULL**' : k} | ${v} |`);
  }

  fs.writeFileSync(SALIDA, md.join('\n') + '\n', 'utf8');
  console.log(`claves distintas (temporadas): ${porClave.size}`);
  console.log(`torneos en una clave de un solo año: ${torneosSinTemporadas} de ${torneos.length}`);
  console.log(`torneos con desplegable de grado ÚTIL: ${torneosUtiles} · colapsados: ${torneosColapsados}`);
  console.log(`informe: ${SALIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
