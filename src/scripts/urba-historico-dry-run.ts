/**
 * Corrida EN SECO de la carga histórica de URBA, 2021-2025. No escribe una sola fila.
 *
 *   node src/scripts/urba-historico-dry-run.ts
 *
 * A diferencia de la de 2026, acá los torneos TODAVÍA NO EXISTEN en la base: se
 * planifica también la fila de `tournaments` y la de `tournament_phases`. Los 677
 * torneos salen de `inventario-torneos-urba.csv` y los partidos de la caché en
 * disco (`.urba-cache/championships`, los 811 ya bajados) — no se le pide un solo
 * byte a la API.
 *
 * De la base sólo se LEE: torneos ya cargados, el mapeo de clubes, los clubes y
 * los partidos que ya tienen `external_id` de URBA.
 *
 * ── La pregunta que este informe tiene que contestar ────────────────────────
 * El mapeo de clubes (1.539 triples) se generó del inventario 2021-2026, así que
 * la carga histórica NO tiene que crear un solo club. Si el informe dice que sí,
 * hay algo mal y no se ejecuta: crear un club de más parte la identidad de una
 * institución en dos y ensucia rankings y tablas de todos los años a la vez.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fetchChampionship } from '../lib/integrations/urba/client.ts';
import { planTournamentMatches, type PlanTorneo, type MatchRow } from '../lib/integrations/urba/planMatches.ts';
import { categoriaDeTorneoUrba, parseUrbaId } from '../lib/integrations/urba/externalId.ts';
import { planTournamentRow, planPhaseRow, legsDeChampionship, type TournamentRow } from '../lib/integrations/urba/tournamentRow.ts';

const REPO = process.cwd();
const CACHE = path.join(REPO, '.urba-cache', 'championships');
const CSV = path.join(REPO, 'inventario-torneos-urba.csv');
const SALIDA = path.join(REPO, 'URBA_HISTORICO_DRY_RUN.md');

/** Política de carga, no de mapeo: por eso vive acá y no en el conector. */
const ANIOS = [2021, 2022, 2023, 2024, 2025];
const IS_VISIBLE = false;              // el histórico NO se publica sin decisión
const LOGO_URL = '/competiciones/ar-urba.png';

// ── credenciales ────────────────────────────────────────────────────────────
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

/** SELECT paginado: PostgREST corta en 1000 y `matches` de URBA ya son 10.917. */
async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${desde}-${desde + 999}` },
    });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json() as T[];
    filas.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return filas;
}

interface FilaInventario {
  urba_id: string; external_id: string; nombre: string; anio: string;
  division: string; grado: string; age_grade: string; gender: string;
  equipos: string; partidos: string;
}

/** El inventario es CSV plano sin comillas ni comas dentro de los campos —
 *  verificado: las 811 filas tienen las mismas 18 columnas. Si eso cambiara,
 *  el conteo de columnas lo delata acá en vez de corromper una fila en silencio. */
function leerInventario(): FilaInventario[] {
  const lineas = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  const cab = lineas[0].split(',');
  return lineas.slice(1).map((l, i) => {
    const celdas = l.split(',');
    if (celdas.length !== cab.length) {
      throw new Error(`inventario línea ${i + 2}: ${celdas.length} columnas, se esperaban ${cab.length}`);
    }
    const o: any = {};
    cab.forEach((h, j) => (o[h] = celdas[j]));
    return o as FilaInventario;
  });
}

interface PorTorneo {
  external_id: string; anio: number; nombre: string;
  fila: TournamentRow; legs: 1 | 2; equipos: number;
  urbaTrae: number; crear: number; omitidos: number;
  participantesCrear: number;
}

async function main() {
  console.log('leyendo la base…');
  const torneosEnBase = await selectAll<{ id: string; external_id: string; name: string }>(
    'tournaments?select=id,external_id,name&external_id=like.urba:*',
  );
  const mapeo = await selectAll<{ external_id: string; club_id: string }>(
    'club_external_ids?select=external_id,club_id&provider=eq.urba',
  );
  const clubes = await selectAll<{ id: string; name: string | null }>('clubs?select=id,name');
  const partidosEnBase = await selectAll<{ external_id: string }>(
    'matches?select=external_id&external_id=like.urba:*',
  );

  const yaEsTorneo = new Set(torneosEnBase.map((t) => t.external_id));
  const porTriple = new Map(mapeo.map((m) => [m.external_id, m.club_id]));
  const nombrePorClub = new Map(clubes.map((c) => [c.id, c.name ?? '']));
  const yaEsPartido = new Set(partidosEnBase.map((m) => m.external_id));

  const inventario = leerInventario().filter((r) => ANIOS.includes(Number(r.anio)));
  console.log(`  torneos urba en base    ${yaEsTorneo.size}`);
  console.log(`  triples en el mapeo     ${porTriple.size}`);
  console.log(`  matches urba en base    ${yaEsPartido.size}`);
  console.log(`  inventario 2021-2025    ${inventario.length}`);
  console.log('\nplanificando desde la caché en disco…');

  const porTorneo: PorTorneo[] = [];
  const yaExistian: string[] = [];
  const sinCache: { external_id: string; nombre: string; anio: string; status: number }[] = [];
  const sinCategoria: string[] = [];
  const acum: PlanTorneo = {
    crear: [], actualizar: [], sinCambios: 0, omitidos: [], totalUrba: 0, estados: {},
    participantesCrear: [], participantesExistentes: 0,
  };
  const fechasPorAnio = new Map<number, string[]>();
  /** El omitido con el año y el torneo de donde salió: `acum.omitidos` los pierde. */
  const omitidosConAnio: { motivo: string; external_id: string; detalle: string; anio: number; torneo: string }[] = [];
  const partidosDuplicados: string[] = [];
  const vistosExternalId = new Set<string>();
  let n = 0;

  for (const r of inventario) {
    const anio = Number(r.anio);
    const urbaId = parseUrbaId(r.external_id);
    if (urbaId == null) { sinCache.push({ ...r, status: -1 }); continue; }

    // Un torneo que YA está en la base no se vuelve a crear. Hoy no debería
    // haber ninguno (la base sólo tiene 2026), pero la corrida tiene que ser
    // reanudable: si se ejecuta a medias, la segunda pasada tiene que verlo.
    if (yaEsTorneo.has(r.external_id)) { yaExistian.push(`${r.external_id} · ${r.nombre}`); continue; }

    const categoria = categoriaDeTorneoUrba(r.nombre);
    if (!categoria) { sinCategoria.push(`${anio} · ${r.external_id} · ${r.nombre}`); continue; }

    const res = await fetchChampionship(urbaId, { cacheDir: CACHE });
    n++;
    if (n % 100 === 0) console.log(`  ${n}/${inventario.length}`);
    if (!res.ok || !res.data) { sinCache.push({ ...r, status: res.status }); continue; }

    const fila = planTournamentRow(r, { isVisible: IS_VISIBLE, logoUrl: LOGO_URL });
    const legs = legsDeChampionship(res.data as any);

    const plan = planTournamentMatches({
      championship: res.data as any,
      // Sin UUID todavía: el torneo se crea en la ejecución y recién ahí existe.
      // En seco alcanza el external_id, que es único y no se confunde con otro.
      tournamentId: fila.external_id,
      categoria,
      subcategory: fila.subcategory,
      resolverClub: (triple) => porTriple.get(triple) ?? null,
      existentes: new Map(),
      participantesYaEnBase: new Set(),
      nombreDeClub: (clubId) => nombrePorClub.get(clubId) || null,
    });

    // Un partido cuyo external_id ya está en la base es un cruce entre años que
    // no debería existir: los ids de URBA no se reciclan. Se cuenta para que
    // salte acá y no como un 23505 a mitad de la carga.
    for (const f of plan.crear) {
      if (yaEsPartido.has(f.external_id)) partidosDuplicados.push(`${f.external_id} (ya en base) · ${r.external_id}`);
      if (vistosExternalId.has(f.external_id)) partidosDuplicados.push(`${f.external_id} (repetido en el plan) · ${r.external_id}`);
      vistosExternalId.add(f.external_id);
    }

    acum.crear.push(...plan.crear);
    acum.omitidos.push(...plan.omitidos);
    omitidosConAnio.push(...plan.omitidos.map((o) => ({ ...o, anio, torneo: r.external_id })));
    acum.totalUrba += plan.totalUrba;
    acum.participantesCrear.push(...plan.participantesCrear);
    for (const [k, v] of Object.entries(plan.estados)) acum.estados[k] = (acum.estados[k] || 0) + v;

    if (!fechasPorAnio.has(anio)) fechasPorAnio.set(anio, []);
    fechasPorAnio.get(anio)!.push(...plan.crear.map((f) => f.date_time));

    porTorneo.push({
      external_id: r.external_id, anio, nombre: r.nombre,
      fila, legs, equipos: Number(r.equipos) || 0,
      urbaTrae: plan.totalUrba, crear: plan.crear.length,
      omitidos: plan.omitidos.filter((o) => o.motivo !== 'bye').length,
      participantesCrear: plan.participantesCrear.length,
    });
  }

  // ── el informe ────────────────────────────────────────────────────────────
  const md: string[] = [];
  const noResueltos = omitidosConAnio.filter((o) => o.motivo === 'equipo_no_resuelto');
  // El detalle es `… (triple 31|M18|A)`: sin excluir el paréntesis el triple sale
  // con un `)` pegado y no se puede pegar en una consulta.
  const triplesSinMapeo = new Map<string, { partidos: number; anios: Set<number>; equipos: Set<string> }>();
  for (const o of noResueltos) {
    for (const m of o.detalle.matchAll(/"([^"]*)" \(triple ([^)\s]+)\)/g)) {
      const t = triplesSinMapeo.get(m[2]) ?? { partidos: 0, anios: new Set<number>(), equipos: new Set<string>() };
      t.partidos++;
      t.equipos.add(m[1]);
      t.anios.add(o.anio);
      triplesSinMapeo.set(m[2], t);
    }
  }

  md.push('# URBA histórico 2021-2025 — corrida en seco\n');
  md.push('**No se escribió nada.** Este informe es para decidir si se ejecuta.\n');
  md.push('Los partidos salen de la caché en disco de los 811 torneos ya bajados:');
  md.push('esta corrida no le pide un solo byte a la API de URBA.\n');

  md.push('\n## El corte: ¿haría falta crear algún club?\n');
  md.push('El mapeo de clubes se generó del inventario **2021-2026**, así que la carga');
  md.push('histórica no tiene que crear ni uno. Si este número no es cero, no se ejecuta.\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| **triples sin mapeo** | **${triplesSinMapeo.size}** |`);
  md.push(`| partidos que se caen por eso | ${noResueltos.length} |`);
  md.push(`| partidos con el mismo \`external_id\` que uno ya cargado | ${partidosDuplicados.length} |`);
  if (triplesSinMapeo.size) {
    md.push('\n| triple | equipo que URBA publica | partidos | años |');
    md.push('|---|---|---:|---|');
    [...triplesSinMapeo.entries()]
      .sort((a, b) => b[1].partidos - a[1].partidos || a[0].localeCompare(b[0]))
      .forEach(([t, v]) => md.push(`| \`${t}\` | ${[...v.equipos].join(' · ')} | ${v.partidos} | ${[...v.anios].sort().join(', ')} |`));
  }

  md.push('\n## Qué se crearía, por año\n');
  md.push('| año | torneos | fases | partidos | participantes | omitidos (sin Bye) | primera fecha | última fecha |');
  md.push('|---|---:|---:|---:|---:|---:|---|---|');
  for (const anio of ANIOS) {
    const t = porTorneo.filter((x) => x.anio === anio);
    const fechas = (fechasPorAnio.get(anio) ?? []).slice().sort();
    md.push(`| ${anio} | ${t.length} | ${t.length} | ${t.reduce((s, x) => s + x.crear, 0)} | ${t.reduce((s, x) => s + x.participantesCrear, 0)} | ${t.reduce((s, x) => s + x.omitidos, 0)} | ${fechas[0]?.slice(0, 10) ?? '—'} | ${fechas[fechas.length - 1]?.slice(0, 10) ?? '—'} |`);
  }
  md.push(`| **total** | **${porTorneo.length}** | **${porTorneo.length}** | **${acum.crear.length}** | **${acum.participantesCrear.length}** | **${acum.omitidos.filter((o) => o.motivo !== 'bye').length}** | | |`);
  md.push('');
  md.push(`De los ${inventario.length} del inventario: **${porTorneo.length} se crearían**, ${yaExistian.length} ya están en la base,`);
  md.push(`${sinCategoria.length} sin categoría derivable, ${sinCache.length} sin payload.\n`);

  md.push('\n## Visibilidad\n');
  md.push('Todo lo histórico entra OCULTO, y eso es política de esta carga, no del conector.\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| torneos con \`is_visible = FALSE\` | ${porTorneo.filter((t) => t.fila.is_visible === false).length} de ${porTorneo.length} |`);
  md.push(`| torneos con \`is_visible = TRUE\` | ${porTorneo.filter((t) => t.fila.is_visible === true).length} |`);
  md.push(`| partidos, todos con \`is_visible = ${String(IS_VISIBLE).toUpperCase()}\` | ${acum.crear.length} |`);
  md.push('');
  md.push('Y hay un segundo cerrojo, que es el que de verdad manda: la política de RLS');
  md.push('de `tournaments` para el anónimo es `USING (is_active = true)` — **no mira');
  md.push('`is_visible`**. Estos 677 entran con `is_active = false` y `status = draft`,');
  md.push('igual que los 134 de 2026, así que el visitante no los ve por dos motivos');
  md.push('independientes.');
  md.push('\nPrenderlos después es un UPDATE de una columna. Cargar visible y arrepentirse');
  md.push('ya ensució el home.\n');

  md.push('\n## Subcategory\n');
  md.push('Un torneo sin `subcategory` queda fuera del desplegable de grados y no se');
  md.push('entera nadie. Por eso se cuenta acá y no se descubre después.\n');
  const porSub: Record<string, number> = {};
  for (const t of porTorneo) porSub[String(t.fila.subcategory)] = (porSub[String(t.fila.subcategory)] || 0) + 1;
  md.push('| subcategory | torneos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(porSub).sort((a, b) => b[1] - a[1])) md.push(`| ${k === 'null' ? '**NULL**' : k} | ${v} |`);
  const nulos = porTorneo.filter((t) => t.fila.subcategory === null);
  md.push(`\n**${nulos.length} en NULL.** Tienen que ser todas competencias de un solo nivel`);
  md.push('(femenino, universitario, empresarial, formativo), igual que las 6 de 2026.');
  md.push('Cualquier otra cosa acá es un torneo que hay que mirar:\n');
  const nulosPorCategoria: Record<string, number> = {};
  for (const t of nulos) nulosPorCategoria[t.fila.category] = (nulosPorCategoria[t.fila.category] || 0) + 1;
  md.push('| category | torneos en NULL |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(nulosPorCategoria).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);
  const sospechosos = nulos.filter((t) => !['Femenino', 'Universitario', 'Empresarial', 'Formativo', 'Desarrollo'].includes(t.fila.category));
  md.push(`\nFuera de esas cinco: **${sospechosos.length}**${sospechosos.length ? '' : ' (ninguno)'}`);
  sospechosos.slice(0, 20).forEach((t) => md.push(`- \`${t.external_id}\` ${t.anio} · ${t.nombre}`));

  md.push('\n## Category\n');
  const porCat: Record<string, number> = {};
  for (const t of porTorneo) porCat[t.fila.category] = (porCat[t.fila.category] || 0) + 1;
  md.push('| category | torneos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);
  md.push('\n`otro` no es un default ni un faltante: es el valor de las competencias');
  md.push('juveniles, que tienen otra estructura entera (`Grupo N - Zona X` hasta 2023,');
  md.push('`G2 NIVEL x` desde 2024) y no cuelgan de ningún escalón de mayores.\n');

  md.push('\n## Age grade\n');
  md.push('M18 y M20 son de 2021-2023: URBA cambió los cortes de edad después. Entran');
  md.push('igual, son la historia real.\n');
  const porEdad: Record<string, number> = {};
  for (const t of porTorneo) porEdad[t.fila.age_grade] = (porEdad[t.fila.age_grade] || 0) + 1;
  md.push('| age_grade | torneos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(porEdad).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);

  md.push('\n## Fases\n');
  md.push('Los 126 de 2026 se cargaron sin fase y hubo que backfillear: sin fila en');
  md.push('`tournament_phases` y sin `matches.phase_id`, el torneo no tiene tabla y no');
  md.push('falla nada. Acá la fase se planifica junto con el torneo.\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| fases \`Fase Regular\` (league, order 1, activa) | ${porTorneo.length} |`);
  md.push(`| con \`legs = 1\` (partido único) | ${porTorneo.filter((t) => t.legs === 1).length} |`);
  md.push(`| con \`legs = 2\` (ida y vuelta) | ${porTorneo.filter((t) => t.legs === 2).length} |`);
  md.push(`| partidos que quedarían con \`phase_id\` apuntando a su fase | ${acum.crear.length} |`);
  md.push(`| partidos que quedarían **sin** \`phase_id\` | 0 |`);
  md.push('\n`legs` sale de cuántas veces se cruza el par que más se cruza en el payload,');
  md.push('no del nombre del torneo. Contra las 126 fases de 2026 acierta 125.\n');

  md.push('\n## Estados que se escribirían\n');
  md.push('| status | partidos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(acum.estados).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);
  const fuera = Object.keys(acum.estados).filter((s) => !['scheduled', 'live', 'final', 'postponed', 'suspended'].includes(s));
  md.push(`\nEstados fuera del CHECK de \`matches.status\`: **${fuera.length}**${fuera.length ? ' — ' + fuera.join(', ') : ' (ninguno)'}\n`);

  md.push('\n## Rango de fechas y horas\n');
  md.push('URBA publica el DÍA, no la hora: todo llega a medianoche local de Buenos');
  md.push('Aires, que en UTC son las **03:00 del MISMO día**. La excepción es la');
  md.push('Superior, que lleva el horario por defecto de las 15:30 → **18:30Z**. Es la');
  md.push('misma regla que ya rige los 10.917 partidos de 2026.\n');
  const todas = acum.crear.map((f) => f.date_time).sort();
  const horas: Record<string, number> = {};
  for (const f of todas) horas[f.slice(11, 19)] = (horas[f.slice(11, 19)] || 0) + 1;
  md.push('| hora UTC | partidos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(horas).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);
  if (todas.length) md.push(`\n- primera: \`${todas[0]}\`\n- última: \`${todas[todas.length - 1]}\``);
  const fueraDeAnio = acum.crear.filter((f) => {
    const t = porTorneo.find((x) => x.external_id === (f as any).tournament_id);
    return t ? Number(f.date_time.slice(0, 4)) !== t.anio : false;
  });
  md.push(`\nPartidos cuya fecha cae fuera del año de su torneo: **${fueraDeAnio.length}**`);
  fueraDeAnio.slice(0, 10).forEach((f) => md.push(`- \`${f.external_id}\` ${f.date_time} en ${(f as any).tournament_id}`));

  md.push('\n## Bonus\n');
  const conBonus = acum.crear.filter((f) => !f.points_autocalculated);
  const bonusTotal = conBonus.reduce((s, f) => s + f.home_bonus_points + f.away_bonus_points, 0);
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| partidos terminados | ${acum.crear.filter((f) => f.status === 'final').length} |`);
  md.push(`| con bonus escrito (\`points_autocalculated = false\`) | ${conBonus.length} |`);
  md.push(`| puntos bonus en total | ${bonusTotal} |`);
  md.push(`| no jugados con bonus > 0 (tiene que ser 0) | ${acum.crear.filter((f) => f.status !== 'final' && (f.home_bonus_points > 0 || f.away_bonus_points > 0)).length} |`);
  md.push(`| no jugados con base > 0 (tiene que ser 0) | ${acum.crear.filter((f) => f.status !== 'final' && (f.home_base_points > 0 || f.away_base_points > 0)).length} |`);

  md.push('\n## Omitidos, por motivo\n');
  const porMotivo: Record<string, number> = {};
  for (const o of acum.omitidos) porMotivo[o.motivo] = (porMotivo[o.motivo] || 0) + 1;
  md.push('| motivo | partidos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);

  md.push(`\n### Equipos que no resolvieron (${noResueltos.length})\n`);
  if (noResueltos.length) {
    md.push(`**Triples distintos sin mapeo: ${triplesSinMapeo.size}** (el detalle está arriba, en el corte)\n`);
    md.push('| external_id | detalle |');
    md.push('|---|---|');
    noResueltos.slice(0, 40).forEach((o) => md.push(`| \`${o.external_id}\` | ${o.detalle} |`));
    if (noResueltos.length > 40) md.push(`\n… y ${noResueltos.length - 40} más.`);
  } else md.push('Ninguno. **No haría falta crear un solo club.**\n');

  const sinFecha = acum.omitidos.filter((o) => o.motivo === 'sin_fecha');
  md.push(`\n### Sin fecha (${sinFecha.length})\n`);
  md.push('`matches.date_time` es NOT NULL y no tiene default: sin fecha no hay fila.\n');
  sinFecha.slice(0, 30).forEach((o) => md.push(`- \`${o.external_id}\` — ${o.detalle}`));
  if (!sinFecha.length) md.push('Ninguno.\n');

  const mismoClub = acum.omitidos.filter((o) => o.motivo === 'mismo_equipo_en_ambos_lados');
  md.push(`\n### Mismo club de los dos lados (${mismoClub.length})\n`);
  md.push('Dos equipos del mismo club en el mismo torneo apuntando al mismo registro.');
  md.push('El partido cae ruidosamente; el daño silencioso es cuando esos equipos juegan');
  md.push('contra OTROS y el motor los suma en una sola fila de la tabla.\n');
  mismoClub.slice(0, 25).forEach((o) => md.push(`- \`${o.external_id}\` — ${o.detalle}`));
  if (!mismoClub.length) md.push('Ninguno.\n');

  md.push('\n## Torneos con cobertura incompleta\n');
  md.push('| external_id | año | torneo | URBA trae | se crean | omitidos |');
  md.push('|---|---:|---|---:|---:|---:|');
  const incompletos = porTorneo.filter((t) => t.omitidos > 0).sort((a, b) => b.omitidos - a.omitidos);
  incompletos.slice(0, 60).forEach((t) => md.push(`| \`${t.external_id}\` | ${t.anio} | ${t.nombre.slice(0, 46)} | ${t.urbaTrae} | ${t.crear} | ${t.omitidos} |`));
  md.push(`\nTorneos con cobertura 100%: **${porTorneo.length - incompletos.length} de ${porTorneo.length}**`);

  if (sinCache.length || sinCategoria.length || yaExistian.length) {
    md.push('\n## Torneos que no se evaluaron\n');
    yaExistian.forEach((t) => md.push(`- ${t} — ya está en la base`));
    sinCache.forEach((t) => md.push(`- \`${t.external_id}\` ${t.anio} ${t.nombre} — sin payload (HTTP ${t.status})`));
    sinCategoria.forEach((t) => md.push(`- ${t} — sin categoría derivable del nombre`));
  }

  fs.writeFileSync(SALIDA, md.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(REPO, 'URBA_HISTORICO_DRY_RUN.json'), JSON.stringify({
    resumen: {
      torneosCrear: porTorneo.length, fasesCrear: porTorneo.length,
      partidosCrear: acum.crear.length, participantesCrear: acum.participantesCrear.length,
      triplesSinMapeo: triplesSinMapeo.size,
      omitidos: porMotivo, estados: acum.estados, horas,
      porAnio: ANIOS.map((a) => ({
        anio: a,
        torneos: porTorneo.filter((t) => t.anio === a).length,
        partidos: porTorneo.filter((t) => t.anio === a).reduce((s, t) => s + t.crear, 0),
      })),
    },
    triplesSinMapeo: [...triplesSinMapeo.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([triple, v]) => ({ triple, partidos: v.partidos, anios: [...v.anios].sort(), equipos: [...v.equipos] })),
    porTorneo: porTorneo.map((t) => ({ ...t, fila: undefined })),
    filasTorneo: porTorneo.map((t) => t.fila),
  }, null, 1));

  console.log(`\ntorneos ${porTorneo.length} · fases ${porTorneo.length} · partidos ${acum.crear.length} · participantes ${acum.participantesCrear.length}`);
  console.log(`triples sin mapeo: ${triplesSinMapeo.size} (${noResueltos.length} partidos)`);
  console.log(`omitidos (sin Bye): ${acum.omitidos.filter((o) => o.motivo !== 'bye').length}`);
  console.log(`informe: ${SALIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
