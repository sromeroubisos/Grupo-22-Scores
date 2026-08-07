/**
 * Corrida EN SECO del conector de URBA. No escribe una sola fila.
 *
 *   node src/scripts/urba-dry-run.ts
 *
 * Lee de la base (sólo SELECT): tournaments con external_id 'urba:%',
 * club_external_ids de provider='urba', stg_urba_torneos y los matches ya
 * cargados con external_id de URBA. Pide a la API cada torneo (caché en disco,
 * 250 ms entre pedidos) y produce el informe para decidir si se ejecuta.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fetchChampionship } from '../lib/integrations/urba/client.ts';
import { planTournamentMatches, type PlanTorneo } from '../lib/integrations/urba/planMatches.ts';
import { categoriaDeTorneoUrba, parseUrbaId } from '../lib/integrations/urba/externalId.ts';

const REPO = process.cwd();
const CACHE = path.join(REPO, '.urba-cache', 'championships');
const SALIDA = path.join(REPO, 'URBA_DRY_RUN.md');

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

/** SELECT paginado: PostgREST corta en 1000 y club_external_ids tiene 1532. */
async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const filas: T[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${desde}-${desde + paso - 1}` },
    });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json() as T[];
    filas.push(...chunk);
    if (chunk.length < paso) break;
  }
  return filas;
}

async function main() {
  console.log('leyendo la base…');
  const torneos = await selectAll<{ id: string; name: string; external_id: string; season_id: string | null }>(
    'tournaments?select=id,name,external_id,season_id&external_id=like.urba:*&order=external_id',
  );
  const mapeo = await selectAll<{ external_id: string; club_id: string }>(
    'club_external_ids?select=external_id,club_id&provider=eq.urba',
  );
  const stg = await selectAll<{ urba_id: number; age_grade: string | null; nombre: string; partidos: number | null }>(
    'stg_urba_torneos?select=urba_id,age_grade,nombre,partidos',
  );
  const yaCargados = await selectAll<any>(
    'matches?select=external_id,date_time,venue,status,score,round_label,home_base_points,away_base_points,home_bonus_points,away_bonus_points,points_autocalculated&external_id=like.urba:*',
  );
  const clubes = await selectAll<{ id: string; name: string | null }>('clubs?select=id,name');
  const participantes = await selectAll<{ tournament_id: string; club_id: string }>(
    'tournament_participants?select=tournament_id,club_id',
  );

  const porTriple = new Map(mapeo.map((m) => [m.external_id, m.club_id]));
  const nombrePorClub = new Map(clubes.map((c) => [c.id, c.name ?? '']));
  const participantesPorTorneo = new Map<string, Set<string>>();
  for (const p of participantes) {
    if (!participantesPorTorneo.has(p.tournament_id)) participantesPorTorneo.set(p.tournament_id, new Set());
    participantesPorTorneo.get(p.tournament_id)!.add(p.club_id);
  }
  // La categoría se DERIVA DEL NOMBRE, no de age_grade: esa columna es el corte
  // de edad ('mayores' para todo lo adulto) y no distingue preintermedia de
  // intermedia. Es la misma derivación con la que se generó club_external_ids.
  const categoriaPorUrbaId = new Map(stg.map((s) => [Number(s.urba_id), categoriaDeTorneoUrba(s.nombre)]));
  const stgPorId = new Map(stg.map((s) => [Number(s.urba_id), s]));
  const existentes = new Map(yaCargados.map((m) => [m.external_id, m]));

  console.log(`  torneos urba:%          ${torneos.length}`);
  console.log(`  triples en el mapeo     ${porTriple.size}`);
  console.log(`  stg_urba_torneos        ${stg.length}`);
  console.log(`  matches urba ya en base ${existentes.size}`);
  console.log(`  clubes                  ${clubes.length}`);
  console.log(`  participantes (todos)   ${participantes.length}`);
  console.log('\nbajando torneos (caché en disco, 250 ms entre pedidos)…');

  const porTorneo: any[] = [];
  const acum: PlanTorneo = {
    crear: [], actualizar: [], sinCambios: 0, omitidos: [], totalUrba: 0, estados: {},
    participantesCrear: [], participantesExistentes: 0,
  };
  const sinBajar: { id: string; nombre: string; status: number }[] = [];
  const sinCategoria: string[] = [];
  let n = 0;

  for (const t of torneos) {
    const urbaId = parseUrbaId(t.external_id);
    if (urbaId == null) { sinBajar.push({ id: t.external_id, nombre: t.name, status: -1 }); continue; }
    const categoria = categoriaPorUrbaId.get(urbaId);
    if (!categoria) { sinCategoria.push(`${t.external_id} · ${t.name}`); continue; }

    const r = await fetchChampionship(urbaId, { cacheDir: CACHE });
    n++;
    if (n % 20 === 0) console.log(`  ${n}/${torneos.length}`);
    if (!r.ok || !r.data) { sinBajar.push({ id: t.external_id, nombre: t.name, status: r.status }); continue; }

    const plan = planTournamentMatches({
      championship: r.data as any,
      tournamentId: t.id,
      categoria,
      resolverClub: (triple) => porTriple.get(triple) ?? null,
      existentes,
      participantesYaEnBase: participantesPorTorneo.get(t.id),
      nombreDeClub: (clubId) => nombrePorClub.get(clubId) || null,
    });

    acum.crear.push(...plan.crear);
    acum.actualizar.push(...plan.actualizar);
    acum.sinCambios += plan.sinCambios;
    acum.omitidos.push(...plan.omitidos);
    acum.totalUrba += plan.totalUrba;
    acum.participantesCrear.push(...plan.participantesCrear);
    acum.participantesExistentes += plan.participantesExistentes;
    for (const [k, v] of Object.entries(plan.estados)) acum.estados[k] = (acum.estados[k] || 0) + v;

    const resueltos = plan.crear.length + plan.actualizar.length + plan.sinCambios;
    porTorneo.push({
      external_id: t.external_id, nombre: t.name,
      urbaTrae: plan.totalUrba, resueltos,
      crear: plan.crear.length, actualizar: plan.actualizar.length, sinCambios: plan.sinCambios,
      omitidos: plan.omitidos.filter((o) => o.motivo !== 'bye').length,
      stgPartidos: stgPorId.get(urbaId)?.partidos ?? null,
      participantesCrear: plan.participantesCrear.length,
      participantesYaEstaban: plan.participantesExistentes,
    });
  }

  // ── informe ───────────────────────────────────────────────────────────────
  const fechas = acum.crear.concat(acum.actualizar.map((a) => a.fila)).map((f) => f.date_time).sort();
  const porMotivo: Record<string, number> = {};
  for (const o of acum.omitidos) porMotivo[o.motivo] = (porMotivo[o.motivo] || 0) + 1;

  const md: string[] = [];
  md.push('# URBA — corrida en seco\n');
  md.push('**No se escribió nada.** Este informe es para decidir si se ejecuta.\n');
  md.push(`Torneos evaluados: **${porTorneo.length}** de ${torneos.length}\n`);

  md.push('\n## Qué pasaría\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| partidos que URBA trae (sin Bye) | ${acum.totalUrba} |`);
  md.push(`| **se crearían** | **${acum.crear.length}** |`);
  md.push(`| se actualizarían | ${acum.actualizar.length} |`);
  md.push(`| sin cambios | ${acum.sinCambios} |`);
  md.push(`| **omitidos (sin Bye)** | **${acum.omitidos.filter((o) => o.motivo !== 'bye').length}** |`);

  const conBonus = acum.crear.filter((f) => f.home_bonus_points !== null || f.away_bonus_points !== null);
  const bonusTotal = conBonus.reduce((s, f) => s + (f.home_bonus_points ?? 0) + (f.away_bonus_points ?? 0), 0);
  const finales = acum.crear.filter((f) => f.status === 'final');
  md.push('\n## Participantes\n');
  md.push('Sin fila en `tournament_participants` el torneo **no tiene tabla**, por');
  md.push('muchos partidos que se carguen: el motor arma el mapa desde ahí y descarta');
  md.push('el partido si alguno de los dos clubes falta, sin error y sin aviso.\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| **se crearían** | **${acum.participantesCrear.length}** |`);
  md.push(`| ya estaban | ${acum.participantesExistentes} |`);
  md.push(`| torneos que quedarían sin ninguno | ${porTorneo.filter((t) => t.participantesCrear + t.participantesYaEstaban === 0).length} |`);
  const dupPlan = acum.participantesCrear.length
    - new Set(acum.participantesCrear.map((p) => `${p.tournament_id}|${p.club_id}`)).size;
  md.push(`\nPares \`(tournament_id, club_id)\` repetidos dentro del plan: **${dupPlan}**`);
  md.push('(`tournament_participants` no tiene UNIQUE: la protección es el `NOT EXISTS`');
  md.push('del INSERT más este chequeo, nunca un `ON CONFLICT` sin índice donde apoyarse.)\n');

  md.push('\n## Bonus\n');
  md.push('URBA publica los cuatro bonus por partido. El ofensivo **no se puede derivar**');
  md.push('—es "4+ tries" y URBA no publica tries— así que o viene del campo o no existe.\n');
  md.push('| | |');
  md.push('|---|---:|');
  md.push(`| partidos terminados | ${finales.length} |`);
  md.push(`| con bonus escrito (\`points_autocalculated = false\`) | ${conBonus.length} |`);
  md.push(`| puntos bonus en total | ${bonusTotal} |`);
  md.push(`| partidos no jugados con bonus > 0 (tiene que ser 0) | ${acum.crear.filter((f) => f.status !== 'final' && (f.home_bonus_points > 0 || f.away_bonus_points > 0)).length} |`);
  md.push(`| partidos no jugados con base > 0 (tiene que ser 0) | ${acum.crear.filter((f) => f.status !== 'final' && (f.home_base_points > 0 || f.away_base_points > 0)).length} |`);

  md.push('\n## Estados que se escribirían\n');
  md.push('| status | partidos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(acum.estados).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);
  const fuera = Object.keys(acum.estados).filter((s) => !['scheduled', 'live', 'final', 'postponed', 'suspended'].includes(s));
  md.push(`\nEstados fuera del CHECK de \`matches.status\`: **${fuera.length}**${fuera.length ? ' — ' + fuera.join(', ') : ' (ninguno)'}\n`);

  md.push('\n## Rango de fechas resultante\n');
  md.push('Para confirmar que no hay corrimiento de día: `playdate` viene a medianoche');
  md.push('local de Buenos Aires, así que en UTC tiene que dar **03:00 del MISMO día**.\n');
  if (fechas.length) {
    md.push(`- primera: \`${fechas[0]}\``);
    md.push(`- última: \`${fechas[fechas.length - 1]}\``);
    const horas = new Set(fechas.map((f) => f.slice(11, 19)));
    md.push(`- horas distintas presentes: ${[...horas].join(', ')}`);
    md.push(`  (URBA no publica hora de partido: se espera una sola, \`03:00:00\`)`);
  } else md.push('_sin fechas_');

  md.push('\n## Omitidos, por motivo\n');
  md.push('| motivo | partidos |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);

  const noResueltos = acum.omitidos.filter((o) => o.motivo === 'equipo_no_resuelto');
  md.push(`\n### Equipos que no resolvieron (${noResueltos.length})\n`);
  md.push('Cada uno con el triple que se intentó. **No se creó ningún club.**\n');
  if (noResueltos.length) {
    md.push('| external_id | detalle |');
    md.push('|---|---|');
    noResueltos.slice(0, 60).forEach((o) => md.push(`| \`${o.external_id}\` | ${o.detalle} |`));
    if (noResueltos.length > 60) md.push(`\n… y ${noResueltos.length - 60} más.`);
    const triples = new Set<string>();
    for (const o of noResueltos) for (const m of o.detalle.matchAll(/triple (\S+)/g)) triples.add(m[1]);
    md.push(`\n**Triples distintos sin mapeo: ${triples.size}**\n`);
    [...triples].sort().slice(0, 40).forEach((t) => md.push(`- \`${t}\``));
  } else md.push('Ninguno.\n');

  const sinFecha = acum.omitidos.filter((o) => o.motivo === 'sin_fecha');
  md.push(`\n### Sin fecha (${sinFecha.length})\n`);
  md.push('`matches.date_time` es NOT NULL y no tiene default: sin fecha no hay fila.\n');
  sinFecha.slice(0, 30).forEach((o) => md.push(`- \`${o.external_id}\` — ${o.detalle}`));
  if (!sinFecha.length) md.push('Ninguno.\n');

  md.push('\n## Por torneo\n');
  md.push('| external_id | torneo | URBA trae | resueltos | crear | actualizar | omitidos | particip. |');
  md.push('|---|---|---:|---:|---:|---:|---:|---:|');
  porTorneo.sort((a, b) => b.omitidos - a.omitidos || a.external_id.localeCompare(b.external_id));
  porTorneo.forEach((t) => md.push(`| \`${t.external_id}\` | ${t.nombre.slice(0, 46)} | ${t.urbaTrae} | ${t.resueltos} | ${t.crear} | ${t.actualizar} | ${t.omitidos} | +${t.participantesCrear} |`));

  if (sinBajar.length || sinCategoria.length) {
    md.push('\n## Torneos que no se pudieron evaluar\n');
    sinBajar.forEach((t) => md.push(`- \`${t.id}\` ${t.nombre} — HTTP ${t.status}`));
    sinCategoria.forEach((t) => md.push(`- ${t} — sin \`age_grade\` en stg_urba_torneos`));
  }

  fs.writeFileSync(SALIDA, md.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(REPO, 'URBA_DRY_RUN.json'),
    JSON.stringify({
      resumen: {
        totalUrba: acum.totalUrba, crear: acum.crear.length, actualizar: acum.actualizar.length,
        sinCambios: acum.sinCambios, omitidos: porMotivo, estados: acum.estados,
        participantesCrear: acum.participantesCrear.length,
        participantesYaEstaban: acum.participantesExistentes,
        partidosConBonus: conBonus.length, puntosBonus: bonusTotal,
      },
      porTorneo, omitidos: acum.omitidos, participantesCrear: acum.participantesCrear,
    }, null, 1));

  console.log(`\ncrear ${acum.crear.length} · actualizar ${acum.actualizar.length} · sin cambios ${acum.sinCambios} · omitidos ${acum.omitidos.filter((o) => o.motivo !== 'bye').length}`);
  console.log(`participantes a crear ${acum.participantesCrear.length} · ya estaban ${acum.participantesExistentes}`);
  console.log(`partidos con bonus ${conBonus.length} · puntos bonus ${bonusTotal}`);
  console.log(`informe: ${SALIDA}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
