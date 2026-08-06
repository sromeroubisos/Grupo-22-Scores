/**
 * ¿Cuántos torneos de URBA son una INSTANCIA de una competencia y no una
 * competencia aparte? Sólo mide: no escribe una fila.
 *
 *   node src/scripts/urba-instancias-medicion.ts
 *
 * ── De dónde sale la pregunta ──────────────────────────────────────────────
 * El menú de temporadas del Top 14 de 2026 ofrece `2026 | 2025 | 2025`, y los
 * dos 2025 son `TOP 12 - Superior` y `TOP 12 - Play Off`. El Play Off no es otra
 * temporada: es una instancia de la misma. Cae ahí por la última línea de
 * `subcategoriaDeTorneoUrba` —"una división de mayores sin grado en el nombre es
 * la Superior"—, que fue correcta para los otros seis casos y falla en éste.
 *
 * ── Cómo se mide, para no medir lo que uno espera ──────────────────────────
 * Dos pasadas. La primera cuenta los tokens que uno ya sospecha. La segunda
 * busca CUALQUIER nombre con pinta de instancia que la primera no haya
 * clasificado, para que un token que no se me ocurrió aparezca como sobrante y
 * no como cero.
 */
import fs from 'node:fs';
import path from 'node:path';

import { subcategoriaDeTorneoUrba } from '../lib/integrations/urba/externalId.ts';
import { competitionKey } from '../lib/competitionKey.ts';

const REPO = process.cwd();

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
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de servicio');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function todas(recurso: string): Promise<any[]> {
  const out: any[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...H, range: `${desde}-${desde + paso - 1}` } });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status}`);
    const filas = await r.json() as any[];
    out.push(...filas);
    if (filas.length < paso) return out;
  }
}

const limpio = (s: string) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/^urba:\s*/, '').trim();

/**
 * Los tokens de instancia. `\b` en los dos extremos a propósito:
 * "Semifinal" no debe contar como "final", y "Finalizado" tampoco.
 */
const TOKENS: Array<[string, RegExp]> = [
  ['Play Off', /\bplay\s?-?\s?offs?\b/],
  ['Semifinal', /\bsemi\s?-?\s?finals?\b/],
  ['Cuartos', /\bcuartos\b/],
  ['Octavos', /\boctavos\b/],
  ['Final', /\bfinals?\b/],
  ['Ascenso', /\bascensos?\b/],
  ['Permanencia', /\bpermanencia\b/],
  ['Clasificación', /\b(re)?clasificacion\b/],
  ['Repechaje', /\brepechajes?\b/],
  ['Promoción', /\bpromocion\b/],
  ['Desempate', /\bdesempate\b/],
];

/** La red de seguridad: pinta de instancia, por si un token se me escapó. */
const SOSPECHA = /\b(play|final|semi|cuartos|octavos|ascen|perman|clasific|repech|promoc|desempat|eliminator|definicion|reubicacion|copa\s+de)\b/;

async function main() {
  const T = await todas('tournaments?select=id,external_id,name,season_id,category,subcategory,age_grade,gender,is_visible&union_id=eq.urba');
  console.log(`torneos de URBA: ${T.length}\n`);

  const clasificado = new Map<string, any[]>();
  const instancias: any[] = [];
  for (const t of T) {
    const n = limpio(t.name);
    // El PRIMER token que matchea manda: "Play Off - Final" es un play off.
    const token = TOKENS.find(([, re]) => re.test(n));
    if (!token) continue;
    if (!clasificado.has(token[0])) clasificado.set(token[0], []);
    clasificado.get(token[0])!.push(t);
    instancias.push({ ...t, token: token[0] });
  }

  console.log('════ 1. POR TOKEN ════');
  for (const [nombre] of TOKENS) {
    const filas = clasificado.get(nombre) ?? [];
    if (!filas.length) { console.log(`  ${nombre.padEnd(14)} 0`); continue; }
    const subs = new Map<string, number>();
    for (const t of filas) subs.set(String(t.subcategory), (subs.get(String(t.subcategory)) ?? 0) + 1);
    console.log(`  ${nombre.padEnd(14)} ${String(filas.length).padStart(3)}   subcategory hoy: ${[...subs.entries()].map(([k, v]) => `${k}×${v}`).join(', ')}`);
  }
  console.log(`\n  TOTAL con token de instancia: ${instancias.length} de ${T.length}`);

  console.log('\n════ 2. LA RED DE SEGURIDAD (pinta de instancia, sin token) ════');
  const yaVistos = new Set(instancias.map((t) => t.id));
  const sobrantes = T.filter((t) => !yaVistos.has(t.id) && SOSPECHA.test(limpio(t.name)));
  console.log(`  ${sobrantes.length} nombres`);
  for (const t of sobrantes.slice(0, 25)) console.log(`    ${t.season_id} · ${limpio(t.name)}  [${t.subcategory}]`);
  if (sobrantes.length > 25) console.log(`    … y ${sobrantes.length - 25} más`);

  console.log('\n════ 3. DÓNDE DUELE: MAYORES vs JUVENILES ════');
  // En juveniles el grado es el eje de grupo/zona, así que una instancia
  // juvenil YA tiene un subcategory propio y no se cuelga de 'Superior'.
  const deMayores = instancias.filter((t) => t.subcategory === 'Superior' || t.subcategory === 'Intermedia' || /^Preintermedia/.test(String(t.subcategory)));
  const resto = instancias.filter((t) => !deMayores.includes(t));
  console.log(`  con grado de MAYORES (se cuelgan de un grado que no les toca): ${deMayores.length}`);
  for (const t of deMayores) console.log(`    ${t.season_id} · ${limpio(t.name).padEnd(52)} [${t.subcategory}] ${t.is_visible ? '' : '(oculto)'}`);
  console.log(`  el resto (juveniles y demás, con eje propio): ${resto.length}`);
  const resumenResto = new Map<string, number>();
  for (const t of resto) resumenResto.set(String(t.subcategory), (resumenResto.get(String(t.subcategory)) ?? 0) + 1);
  console.log(`    subcategory: ${[...resumenResto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}×${v}`).join(', ')}`);

  console.log('\n════ 4. EL SÍNTOMA: AÑOS DUPLICADOS EN EL MENÚ DE TEMPORADAS ════');
  // Un año sale dos veces cuando dos torneos comparten competitionKey y season.
  const porClave = new Map<string, any[]>();
  for (const t of T) {
    const k = `${competitionKey(t)}|${t.season_id}`;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k)!.push(t);
  }
  const duplicados = [...porClave.entries()].filter(([, v]) => v.length > 1);
  console.log(`  pares (competencia, año) con más de un torneo: ${duplicados.length}`);
  const porInstancia = duplicados.filter(([, v]) => v.some((t) => TOKENS.some(([, re]) => re.test(limpio(t.name)))));
  console.log(`  de ésos, los que se explican por una instancia: ${porInstancia.length}`);
  for (const [k, v] of porInstancia.slice(0, 20)) {
    console.log(`    ${k}`);
    for (const t of v) console.log(`       ${limpio(t.name).padEnd(50)} [${t.subcategory}]`);
  }
  const otros = duplicados.filter(([, v]) => !v.some((t) => TOKENS.some(([, re]) => re.test(limpio(t.name)))));
  console.log(`  los que NO se explican por una instancia: ${otros.length}`);
  for (const [k, v] of otros.slice(0, 12)) {
    console.log(`    ${k}: ${v.map((t) => limpio(t.name)).join('  ||  ')}`);
  }

  console.log('\n════ 5. SI LA SUBCATEGORY FUERA PROPIA ════');
  console.log('  (qué devuelve hoy subcategoriaDeTorneoUrba para cada instancia de mayores)');
  const recalc = new Map<string, number>();
  for (const t of deMayores) {
    const s = String(subcategoriaDeTorneoUrba(t.name));
    recalc.set(s, (recalc.get(s) ?? 0) + 1);
  }
  console.log(`    ${[...recalc.entries()].map(([k, v]) => `${k}×${v}`).join(', ')}`);

  console.log('\n════ 6. EL CORTE QUE IMPORTA: ¿EL NOMBRE DICE EL GRADO? ════');
  // No es lo mismo `top 13 - superior - final` que `top 12 - play off`.
  //
  // En el primero el grado ESTÁ en el nombre: la subcategory 'Superior' es
  // correcta y lo único que falta es que la instancia se vea. En el segundo el
  // nombre no dice ningún grado y el 'Superior' lo INVENTÓ la última línea de
  // subcategoriaDeTorneoUrba. Sólo el segundo es el bug que se marcó.
  const DICE_GRADO = /\b(superior|pre\s?-?\s?intermedia|intermedia)\b/;
  const conGrado = instancias.filter((t) => DICE_GRADO.test(limpio(t.name)));
  const inferido = instancias.filter((t) => !DICE_GRADO.test(limpio(t.name)) && t.subcategory !== null);
  const sinNada = instancias.filter((t) => !DICE_GRADO.test(limpio(t.name)) && t.subcategory === null);

  console.log(`  a) el nombre DICE el grado, la instancia es lo invisible : ${conGrado.length}`);
  console.log(`  b) el nombre NO dice grado y el grado fue INFERIDO       : ${inferido.length}   <- el bug`);
  for (const t of inferido) console.log(`       ${t.season_id} · ${limpio(t.name).padEnd(30)} [${t.subcategory}] ${t.is_visible ? 'PUBLICADO' : '(oculto)'}`);
  console.log(`  c) sin grado y sin subcategory (familias de un solo nivel): ${sinNada.length}`);

  // Y de los tres grupos, cuántos están hoy a la vista.
  const visibles = instancias.filter((t) => t.is_visible);
  console.log(`\n  de las ${instancias.length} instancias, publicadas hoy: ${visibles.length}`);
  const porAnio = new Map<string, number>();
  for (const t of instancias) porAnio.set(String(t.season_id), (porAnio.get(String(t.season_id)) ?? 0) + 1);
  console.log(`  por temporada: ${[...porAnio.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
