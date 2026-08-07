/**
 * Une las fases de definición que URBA publica como torneos aparte.
 *
 *   node src/scripts/urba-fases-unir.ts --plan      informa, no escribe
 *   node src/scripts/urba-fases-unir.ts --sql       emite el SQL para aplicar a mano
 *   node src/scripts/urba-fases-unir.ts --execute   escribe por la API REST
 *
 * Los tres salen del MISMO plan. El SQL no está escrito a mano en ninguna parte:
 * se genera de las mismas filas que leyó el plan, así que no puede divergir de lo
 * que hace `--execute`.
 *
 * Entre los dos, el SQL es mejor: va en UNA transacción. `--execute` son ~60
 * llamadas REST sueltas, y si la número 40 falla quedan 39 aplicadas. El SQL o
 * entra entero o no entra nada.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 * URBA no publica "la temporada 2022 del Top 13 Superior": publica tres
 * campeonatos con ids distintos —Clasificación, Semifinal, Final—, y la carga
 * los espejó 1:1 en `tournaments`. Consecuencia visible: el menú de temporadas
 * ofrece "2022" tres veces y obliga a elegir sin datos a cuál entrar.
 *
 * Son la misma temporada. Van como UN torneo con TRES fases.
 *
 * ── La fase se MUDA, no se crea ─────────────────────────────────────────────
 * Cada torneo absorbido ya tiene su fila en `tournament_phases` (la "Fase
 * Regular" que dejó la carga), y sus partidos ya le apuntan. Así que la fase se
 * muda al torneo superviviente y se la renombra; los partidos sólo cambian de
 * `tournament_id` y **conservan su `phase_id`**.
 *
 * No es una comodidad: `phase_id` está en `CAMPOS_INTOCABLES` de `syncPlan.ts`
 * porque reasignarlo mueve un partido de tabla de posiciones. Mudando la fase
 * entera, ningún partido cambia de tabla — cambia de torneo la tabla completa,
 * que es justamente lo que se quiere.
 *
 * ── Qué se une y qué no: lo decide el plantel, no una lista ─────────────────
 * La condición es que los clubes de la fase sean un SUBCONJUNTO de los del
 * torneo base, leído de `tournament_participants`. Se verifica fila por fila y
 * no hay lista de excepciones escrita a mano.
 *
 * Es la condición que importa, y se ve en el caso que la falla: el
 * `TOP 12 - Play Off` de 2025 son San Luis, San Cirano, Champagnat y
 * Pueyrredón, y de esos sólo San Luis jugó el Top 12 Superior. Es el play off de
 * ascenso entre divisiones, no la definición del Top 12: unirlo metería tres
 * clubes en un torneo que no jugaron. La misma afirmación falsa que dejó a las
 * ruedas como torneos separados en `docs/urba-ruedas-decision.md`.
 *
 * Con la regla escrita así, ese caso se excluye solo. Una lista de ids habría
 * que mantenerla, y el año que viene estaría desactualizada en silencio.
 *
 * ── Las ruedas no se tocan ──────────────────────────────────────────────────
 * Sólo se absorbe una fila que sea una INSTANCIA (`instanciaDeTorneoUrba`). Un
 * `Zona A - Segunda Rueda` no lo es, y queda como torneo separado: eso ya se
 * decidió el 2026-08-05 y este script no lo reabre.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  instanciaDeTorneoUrba,
  ORDEN_INSTANCIA,
  subcategoriaDeTorneoUrba,
} from '../lib/integrations/urba/externalId.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_FASES_UNIR_ROLLBACK.sql');
const APLICAR = path.join(REPO, 'URBA_FASES_UNIR.sql');

/**
 * Cuántas competencias-temporada se esperan unir. Si el recálculo da otra cosa,
 * el script frena sin escribir: o entró un torneo nuevo, o algo cambió de forma.
 *
 * Son 9 y no 10: el `Top 12 - Intermedia` de 2021 parece un grupo de fases, pero
 * su única instancia es la Clasificación —que es la base— y lo que la rodea son
 * dos ruedas, que no se tocan. Un grupo sin nada que absorber no se cuenta.
 */
const ESPERADAS = 9;

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--sql') ? 'sql'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan, --sql o --execute'); process.exit(2); }

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
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const filas = await r.json() as any[];
    out.push(...filas);
    if (filas.length < paso) return out;
  }
}

async function escribir(metodo: 'PATCH' | 'DELETE' | 'POST', recurso: string, cuerpo?: unknown) {
  const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  if (!r.ok) throw new Error(`${metodo} ${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

const sql = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/* ────────────────────────────────────────────────────────────────────────────
 * LA AGRUPACIÓN
 *
 * La clave es la competencia-temporada: año + división + grado + edad + género.
 * El grado se pregunta IGNORANDO la instancia, para que `Top 13 - Superior -
 * Final` caiga en el mismo grupo que `Top 13 - Superior - Clasificación`.
 * ──────────────────────────────────────────────────────────────────────────── */

/** El sufijo de fase, tal como URBA lo escribe al final del nombre. */
const SUFIJO_INSTANCIA =
  /[-–]\s*(play\s?-?\s?offs?|semi\s?-?\s?finals?|finals?|(?:re)?clasificaci[oó]n|ascensos?|permanencia)\s*$/i;

/** El nombre sin el sufijo de fase. `Top 13 - Superior - Final` -> `Top 13 - Superior`. */
const sinSufijoDeInstancia = (nombre: string) => nombre.replace(SUFIJO_INSTANCIA, '').trim();

/**
 * El grado del torneo ignorando la fase.
 *
 * `subcategoriaDeTorneoUrba` devuelve la instancia cuando el nombre no trae
 * grado propio (los Play Off). En ese caso se le saca el sufijo al nombre y se
 * vuelve a preguntar, que es lo que hace que la fase agrupe con su torneo.
 */
function gradoSinInstancia(nombre: string): string | null {
  const g = subcategoriaDeTorneoUrba(nombre);
  const inst = instanciaDeTorneoUrba(nombre);
  if (g && inst && g === inst) return subcategoriaDeTorneoUrba(sinSufijoDeInstancia(nombre));
  return g;
}

interface Torneo {
  id: string; external_id: string; name: string; original_name: string | null;
  season_id: string | null; category: string | null; subcategory: string | null;
  age_grade: string | null; gender: string | null;
}

interface Fase { id: string; tournament_id: string; name: string; phase_type: string; order_index: number; is_active: boolean }

/* ────────────────────────────────────────────────────────────────────────────
 * UNA SOLA FASE ACTIVA POR TORNEO
 *
 * `tournament_phases_one_active_idx` (migración 20260720120000) es un índice
 * único parcial sobre (tournament_id, COALESCE(season_id, …)) WHERE is_active.
 * O sea: un torneo no puede tener dos fases activas. Mudar tres fases activas al
 * mismo torneo lo viola en la primera, y la transacción entera se cae.
 *
 * La fase que se muda entra INACTIVA, y la del torneo base se queda activa. No
 * es una salida de compromiso, son las dos reglas del sistema coincidiendo:
 *
 *  · la reconciliación de esa misma migración deja activa la de menor
 *    `order_index`, que es exactamente la Clasificación;
 *  · `/api/db/standings` usa `phases.find(is_active)` como fase por defecto, así
 *    que la tabla que se muestra al entrar es la de la fase regular y no la de
 *    una final de dos equipos.
 *
 * Inactiva no es escondida: las lecturas por torneo —`fixtureService`,
 * `tournamentRelatedService`, el endpoint de fixture— traen TODAS las fases
 * ordenadas por `order_index` y no filtran por `is_active`. La Semifinal y la
 * Final se siguen viendo y se pueden elegir.
 * ──────────────────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`modo: ${modo}\n`);

  const T = await todas('tournaments?select=id,external_id,name,original_name,season_id,category,subcategory,age_grade,gender&union_id=eq.urba') as Torneo[];
  console.log(`torneos de URBA: ${T.length}`);

  const fases = await todas('tournament_phases?select=id,tournament_id,name,phase_type,order_index,is_active') as Fase[];
  const fasePorTorneo = new Map<string, Fase[]>();
  for (const f of fases) fasePorTorneo.set(f.tournament_id, [...(fasePorTorneo.get(f.tournament_id) ?? []), f]);

  // Las filas COMPLETAS, no sólo (torneo, club).
  //
  // El rollback las tiene que poder reinsertar tal cual eran, y la carga escribe
  // más que el par: `name` ("Hindú Club"), `type` ('club'), `notes`
  // ('urba-import') y `joined_at`. Reinsertar sólo el par deja la fila viva pero
  // hueca, y eso no es un rollback: es una fila nueva parecida.
  const parts = await todas('tournament_participants?select=*') as Array<Record<string, any>>;
  const clubesPorTorneo = new Map<string, Set<string>>();
  const filasPorTorneo = new Map<string, Array<Record<string, any>>>();
  for (const p of parts) {
    const s = clubesPorTorneo.get(p.tournament_id) ?? new Set<string>();
    s.add(p.club_id);
    clubesPorTorneo.set(p.tournament_id, s);
    filasPorTorneo.set(p.tournament_id, [...(filasPorTorneo.get(p.tournament_id) ?? []), p]);
  }

  const partidos = await todas('matches?select=tournament_id,phase_id&external_id=like.urba:*') as Array<{ tournament_id: string; phase_id: string | null }>;
  const partidosPorTorneo = new Map<string, number>();
  for (const m of partidos) partidosPorTorneo.set(m.tournament_id, (partidosPorTorneo.get(m.tournament_id) ?? 0) + 1);
  const partidosPorTorneoYFase = new Map<string, Set<string | null>>();
  for (const m of partidos) {
    const s = partidosPorTorneoYFase.get(m.tournament_id) ?? new Set<string | null>();
    s.add(m.phase_id);
    partidosPorTorneoYFase.set(m.tournament_id, s);
  }

  // ── los grupos ────────────────────────────────────────────────────────────
  const grupos = new Map<string, Torneo[]>();
  for (const t of T) {
    const k = [t.season_id, t.category, gradoSinInstancia(t.name) ?? '∅', t.age_grade, t.gender].join('|');
    grupos.set(k, [...(grupos.get(k) ?? []), t]);
  }

  const planes: Array<{
    clave: string; base: Torneo; nombreNuevo: string | null;
    absorbidos: Array<{ t: Torneo; fase: Fase; nombreFase: string; orden: number; partidos: number }>;
  }> = [];
  const descartados: string[] = [];

  for (const [clave, ts] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const conInstancia = ts.filter((t) => instanciaDeTorneoUrba(t.name) !== null);
    if (ts.length < 2 || conInstancia.length === 0) continue;

    // La base es la fila con MÁS clubes; a igualdad, la de más partidos. En el
    // Top 13 la base es la Clasificación: URBA no publicó una regular, y la fase
    // de grupos es la que tiene el plantel completo.
    const base = ts.slice().sort((a, b) =>
      (clubesPorTorneo.get(b.id)?.size ?? 0) - (clubesPorTorneo.get(a.id)?.size ?? 0)
      || (partidosPorTorneo.get(b.id) ?? 0) - (partidosPorTorneo.get(a.id) ?? 0))[0];
    const clubesBase = clubesPorTorneo.get(base.id) ?? new Set<string>();

    const candidatos = conInstancia.filter((t) => t.id !== base.id);
    if (candidatos.length === 0) continue;

    // El subconjunto. Si UNA sola fase mete un club que la base no tiene, el
    // grupo entero se descarta: unir la mitad dejaría el torneo contando una
    // historia a medias, y la que falta sin explicación.
    const intrusos = candidatos
      .map((t) => ({ t, fuera: [...(clubesPorTorneo.get(t.id) ?? [])].filter((c) => !clubesBase.has(c)) }))
      .filter((x) => x.fuera.length > 0);
    if (intrusos.length > 0) {
      descartados.push(`${clave}\n      base: ${base.name.replace(/^URBA: /, '')} (${clubesBase.size} clubes)`
        + intrusos.map((x) => `\n      ✗ ${x.t.name.replace(/^URBA: /, '')}: ${x.fuera.length} club(es) que la base no tiene`).join(''));
      continue;
    }

    // Sin fase no hay dónde mudar los partidos. Es el error de la carga de 2026
    // —torneos sin fila en `tournament_phases`—, así que se reporta y se frena.
    const sinFase = [base, ...candidatos].filter((t) => (fasePorTorneo.get(t.id) ?? []).length !== 1);
    if (sinFase.length > 0) {
      descartados.push(`${clave}\n      ✗ no tiene exactamente una fase: ${sinFase.map((t) => t.name).join(', ')}`);
      continue;
    }

    // Y TODOS sus partidos tienen que colgar de esa fase.
    //
    // El movimiento se hace `WHERE phase_id = …`, no `WHERE tournament_id = …`,
    // porque para cuando los partidos se mueven la fase ya cambió de torneo. Un
    // partido con `phase_id` nulo, o apuntando a otra fase, se quedaría atrás:
    // no se movería, y después haría fallar el DELETE del torneo por FK. Hoy son
    // 0 sobre los 70, pero es una condición del método y no un dato del día.
    const colgadosDeOtraFase = candidatos.filter((t) => {
      const suya = fasePorTorneo.get(t.id)![0].id;
      const fases = partidosPorTorneoYFase.get(t.id) ?? new Set();
      return [...fases].some((f) => f !== suya);
    });
    if (colgadosDeOtraFase.length > 0) {
      descartados.push(`${clave}\n      ✗ tiene partidos sin phase_id o de otra fase: ${colgadosDeOtraFase.map((t) => t.name).join(', ')}`);
      continue;
    }

    const absorbidos = candidatos
      .map((t) => {
        const inst = instanciaDeTorneoUrba(t.name)!;
        // El nombre de la fase es lo que el nombre del torneo agrega sobre el de
        // la base: `Desarrollo - Superior - Torneo final A` -> `Torneo final A`.
        // Así dos finales del mismo grupo no colapsan en una fase llamada igual,
        // y la fase conserva la palabra que usó URBA.
        const baseSinSufijo = sinSufijoDeInstancia(base.name);
        const propio = t.name.startsWith(baseSinSufijo)
          ? t.name.slice(baseSinSufijo.length).replace(/^\s*[-–]\s*/, '').trim()
          : '';
        return {
          t,
          fase: fasePorTorneo.get(t.id)![0],
          nombreFase: propio || inst,
          orden: ORDEN_INSTANCIA.indexOf(inst),
          partidos: partidosPorTorneo.get(t.id) ?? 0,
        };
      })
      .sort((a, b) => (a.orden === -1 ? 99 : a.orden) - (b.orden === -1 ? 99 : b.orden)
        || a.nombreFase.localeCompare(b.nombreFase, 'es'));

    const instBase = instanciaDeTorneoUrba(base.name);
    planes.push({
      clave, base, absorbidos,
      // El torneo se queda con el nombre sin la fase. `original_name` NO se
      // toca: es el único lugar donde sobrevive lo que dijo URBA.
      nombreNuevo: instBase ? sinSufijoDeInstancia(base.name) : null,
    });
  }

  /* ── el informe ─────────────────────────────────────────────────────────── */

  console.log(`competencias-temporada que se unen: ${planes.length}\n`);
  for (const p of planes) {
    const instBase = instanciaDeTorneoUrba(p.base.name);
    console.log(`── ${p.clave}`);
    console.log(`   torneo:  ${p.base.name.replace(/^URBA: /, '')}${p.nombreNuevo ? `  ->  ${p.nombreNuevo.replace(/^URBA: /, '')}` : ''}`);
    console.log(`     fase 1  ${(instBase ?? 'Fase Regular').padEnd(18)} ${String(partidosPorTorneo.get(p.base.id) ?? 0).padStart(4)} part.  (se queda)`);
    p.absorbidos.forEach((a, i) => {
      console.log(`     fase ${i + 2}  ${a.nombreFase.padEnd(18)} ${String(a.partidos).padStart(4)} part.  <- ${a.t.external_id}`);
    });
  }

  if (descartados.length) {
    console.log(`\n── NO se unen (${descartados.length}) ───────────────────────────────`);
    for (const d of descartados) console.log(`   ${d}`);
  }

  const filas = planes.reduce((n, p) => n + p.absorbidos.length, 0);
  const partidosMovidos = planes.reduce((n, p) => n + p.absorbidos.reduce((m, a) => m + a.partidos, 0), 0);
  console.log(`\nfilas de tournaments que se borran: ${filas}`);
  console.log(`partidos que cambian de tournament_id: ${partidosMovidos}  (su phase_id no cambia)`);

  if (planes.length !== ESPERADAS) {
    console.error(`\nSe esperaban ${ESPERADAS} competencias y son ${planes.length}. No se escribe nada.`);
    console.error('Si el número nuevo es correcto, actualizá ESPERADAS y volvé a correrlo.');
    process.exit(1);
  }


  /* ── el rollback, ANTES de tocar nada ───────────────────────────────────── */

  // Se escribe con las filas COMPLETAS de los torneos que se van a borrar: sin
  // eso el rollback podría devolver los partidos a un torneo que ya no existe.
  const completos = await todas(
    `tournaments?select=*&id=in.(${planes.flatMap((p) => p.absorbidos.map((a) => a.t.id)).join(',')})`,
  ) as Array<Record<string, unknown>>;

  const lineas: string[] = [
    '-- Rollback de la unión de fases de URBA.',
    '-- Devuelve cada torneo absorbido a su fila, su fase y sus partidos.',
    '-- El orden importa: primero el torneo, después la fase, después los partidos.',
    'BEGIN;',
  ];
  for (const p of planes) {
    if (p.nombreNuevo) {
      lineas.push(`UPDATE public.tournaments SET name = ${sql(p.base.name)} WHERE id = ${sql(p.base.id)};`);
    }
    const faseBase = fasePorTorneo.get(p.base.id)![0];
    lineas.push(`UPDATE public.tournament_phases SET name = ${sql(faseBase.name)}, phase_type = ${sql(faseBase.phase_type)}, order_index = ${faseBase.order_index}, is_active = ${sql(faseBase.is_active)} WHERE id = ${sql(faseBase.id)};`);
    for (const a of p.absorbidos) {
      const fila = completos.find((c) => c.id === a.t.id)!;
      const cols = Object.keys(fila);
      lineas.push(
        `INSERT INTO public.tournaments (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => sql(fila[c])).join(', ')}) ON CONFLICT (id) DO NOTHING;`,
      );
      // La fase vuelve a su torneo Y a su `is_active` original. Si volviera
      // activa a un torneo que ya tiene la suya, el índice único la rechaza; si
      // volviera inactiva a un torneo que se queda sin ninguna activa, la tabla
      // de posiciones de ese torneo cambiaría de fase por defecto.
      lineas.push(`UPDATE public.tournament_phases SET tournament_id = ${sql(a.t.id)}, name = ${sql(a.fase.name)}, phase_type = ${sql(a.fase.phase_type)}, order_index = ${a.fase.order_index}, is_active = ${sql(a.fase.is_active)} WHERE id = ${sql(a.fase.id)};`);
      lineas.push(`UPDATE public.matches SET tournament_id = ${sql(a.t.id)} WHERE phase_id = ${sql(a.fase.id)};`);
      // La fila entera, CON su `id`, `ON CONFLICT (id)`, una por club y con los
      // campos sanos. Las tres cosas salieron del mismo incidente:
      //
      //  · SIN EL ID el `ON CONFLICT DO NOTHING` a secas no tiene sobre qué
      //    disparar —`tournament_participants` no tiene índice único en
      //    (torneo, club)—, así que correr el rollback dos veces inserta una
      //    segunda copia de cada participante en silencio. Pasó: 62 filas
      //    duplicadas. El INSERT de `tournaments` de arriba nunca duplicó un
      //    torneo justamente porque llevaba el id.
      //
      //  · UNA POR CLUB, porque si la base ya viene con duplicados (es el caso
      //    hoy), reinsertarlos tal cual los perpetúa. El rollback tiene que
      //    devolver el estado CORRECTO, no el estado literal del momento.
      //
      //  · CON LOS CAMPOS SANOS: aquel INSERT sólo llevaba (torneo, club), así
      //    que dejó 124 filas sin `name` ni `notes`. Lo que falte se completa
      //    desde la fila del torneo base para el mismo club, que es la original
      //    de la carga y que el SQL de ida no toca. El club siempre está: ser un
      //    subconjunto del base es la condición para unir.
      const filasBase = new Map(
        (filasPorTorneo.get(p.base.id) ?? []).map((f) => [f.club_id, f]),
      );
      const yaEmitido = new Set<string>();
      for (const fila of filasPorTorneo.get(a.t.id) ?? []) {
        if (yaEmitido.has(fila.club_id)) continue;
        yaEmitido.add(fila.club_id);
        const base = filasBase.get(fila.club_id);
        const sana = { ...fila };
        for (const campo of ['name', 'type', 'status', 'notes', 'joined_at']) {
          if ((sana[campo] === null || sana[campo] === undefined) && base?.[campo] != null) {
            sana[campo] = base[campo];
          }
        }
        const cols = Object.keys(sana);
        lineas.push(
          `INSERT INTO public.tournament_participants (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => sql(sana[c])).join(', ')}) ON CONFLICT (id) DO NOTHING;`,
        );
      }
    }
  }
  lineas.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, lineas.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}  (${lineas.length} líneas)`);

  /* ── el SQL de ida ──────────────────────────────────────────────────────── */

  const ida: string[] = [
    '-- ═══════════════════════════════════════════════════════════════════════',
    '-- URBA — unir las fases de definición al torneo del que son fase.',
    '--',
    `-- ${planes.length} competencias-temporada · ${filas} filas de tournaments que se borran`,
    `-- · ${partidosMovidos} partidos que cambian de tournament_id.`,
    '--',
    '-- Generado por src/scripts/urba-fases-unir.ts --sql. No editar a mano: si hay',
    '-- que cambiar algo, se cambia el script y se vuelve a generar.',
    '--',
    '-- Los partidos NO cambian de phase_id. Lo que se muda es la fase entera, así',
    '-- que ningún partido cambia de tabla de posiciones: cambia de torneo la tabla.',
    '--',
    '-- Va en UNA transacción a propósito. Si una FK que no está contemplada frena',
    '-- un DELETE, no queda nada a medio aplicar.',
    '--',
    `-- Rollback: URBA_FASES_UNIR_ROLLBACK.sql`,
    '-- ═══════════════════════════════════════════════════════════════════════',
    '',
    'BEGIN;',
    '',
  ];

  for (const p of planes) {
    const faseBase = fasePorTorneo.get(p.base.id)![0];
    const instBase = instanciaDeTorneoUrba(p.base.name);
    ida.push(`-- ── ${p.clave}`);
    ida.push(`--    ${p.base.name.replace(/^URBA: /, '')}${p.nombreNuevo ? `  ->  ${p.nombreNuevo.replace(/^URBA: /, '')}` : ''}`);

    // La fase del torneo base queda de 1ª y ACTIVA. El `is_active = true` va
    // siempre, aunque hoy ya lo esté: es lo que garantiza que el torneo unido
    // termine con exactamente una activa, que es lo que espera el índice y lo
    // que `/api/db/standings` busca para elegir qué tabla mostrar.
    ida.push(instBase
      ? `--    la fase del torneo base toma el nombre de su instancia`
      : `--    la fase del torneo base se queda como está, activa y primera`);
    ida.push(`UPDATE public.tournament_phases SET ${instBase ? `name = ${sql(instBase)}, ` : ''}order_index = 1, is_active = true WHERE id = ${sql(faseBase.id)};`);

    p.absorbidos.forEach((a, i) => {
      ida.push(`--    ${a.nombreFase} (${a.t.external_id}, ${a.partidos} partidos)`);
      // `is_active = false` en el mismo UPDATE que la mudanza: así la fase nunca
      // existe como segunda activa del torneo base, ni por un instante.
      ida.push(`UPDATE public.tournament_phases SET tournament_id = ${sql(p.base.id)}, name = ${sql(a.nombreFase)}, phase_type = 'playoff', order_index = ${i + 2}, is_active = false WHERE id = ${sql(a.fase.id)};`);
      // Por `phase_id` y no por `tournament_id`: la fase ya se mudó en la línea
      // de arriba, así que filtrar por el torneo viejo ya no los encuentra.
      ida.push(`UPDATE public.matches SET tournament_id = ${sql(p.base.id)} WHERE phase_id = ${sql(a.fase.id)};`);
      ida.push(`DELETE FROM public.tournament_participants WHERE tournament_id = ${sql(a.t.id)};`);
    });

    if (p.nombreNuevo) {
      ida.push(`UPDATE public.tournaments SET name = ${sql(p.nombreNuevo)} WHERE id = ${sql(p.base.id)};`);
    }
    ida.push(`DELETE FROM public.tournaments WHERE id IN (${p.absorbidos.map((a) => sql(a.t.id)).join(', ')});`);
    ida.push('');
  }

  ida.push('COMMIT;');
  ida.push('');
  ida.push('-- ── Verificación, para correr DESPUÉS del COMMIT ───────────────────────');
  ida.push('-- Tiene que devolver 0 filas: ninguna competencia unida ofrece su año dos veces.');
  ida.push('-- SELECT season_id, category, subcategory, count(*)');
  ida.push("--   FROM public.tournaments WHERE union_id = 'urba'");
  ida.push('--  GROUP BY 1, 2, 3 HAVING count(*) > 1');
  ida.push(`--     AND (season_id, category) IN (${[...new Set(planes.map((p) => `(${sql(p.base.season_id)}, ${sql(p.base.category)})`))].join(', ')});`);
  ida.push('');
  ida.push('-- Y los partidos tienen que seguir teniendo fase:');
  ida.push('-- SELECT count(*) FROM public.matches m');
  ida.push(`--  WHERE m.tournament_id IN (${planes.map((p) => sql(p.base.id)).join(', ')}) AND m.phase_id IS NULL;`);

  fs.writeFileSync(APLICAR, ida.join('\n') + '\n', 'utf8');
  console.log(`SQL de ida escrito: ${APLICAR}  (${ida.length} líneas)`);

  if (modo !== 'execute') {
    console.log(`\nmodo --${modo}: no se escribió una sola fila en la base.`);
    return;
  }

  /* ── la escritura ───────────────────────────────────────────────────────── */

  for (const p of planes) {
    const faseBase = fasePorTorneo.get(p.base.id)![0];
    const instBase = instanciaDeTorneoUrba(p.base.name);

    // 1. la fase del torneo base toma el nombre de su instancia y se queda de
    //    1ª y activa (la única activa del torneo unido)
    await escribir('PATCH', `tournament_phases?id=eq.${faseBase.id}`, {
      ...(instBase ? { name: instBase } : {}), order_index: 1, is_active: true,
    });

    // 2. cada fase absorbida se muda, con su nombre y su orden
    for (const [i, a] of p.absorbidos.entries()) {
      await escribir('PATCH', `tournament_phases?id=eq.${a.fase.id}`, {
        tournament_id: p.base.id,
        name: a.nombreFase,
        phase_type: 'playoff',
        order_index: i + 2,
        // En el mismo PATCH que la mudanza: dos activas en el mismo torneo las
        // rechaza `tournament_phases_one_active_idx`.
        is_active: false,
      });
      // 3. y los partidos de ese torneo detrás de ella. Se mueven por
      //    `phase_id` y no por `tournament_id`: la fase ya se mudó, así que
      //    filtrar por el torneo viejo ya no los encuentra a todos.
      await escribir('PATCH', `matches?phase_id=eq.${a.fase.id}`, { tournament_id: p.base.id });
      // 4. los participantes de la fase ya están en la base (es un subconjunto
      //    verificado), así que sólo se borran los del torneo que se va.
      await escribir('DELETE', `tournament_participants?tournament_id=eq.${a.t.id}`);
    }

    // 5. el torneo se queda con el nombre sin la fase
    if (p.nombreNuevo) {
      await escribir('PATCH', `tournaments?id=eq.${p.base.id}`, { name: p.nombreNuevo });
    }

    // 6. y las filas vacías se van. Si una FK lo impide, se reporta y sigue: el
    //    torneo queda sin partidos pero sin romper nada, y se decide a mano.
    for (const a of p.absorbidos) {
      try {
        await escribir('DELETE', `tournaments?id=eq.${a.t.id}`);
      } catch (e) {
        console.error(`  no se pudo borrar ${a.t.external_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`  unido: ${p.nombreNuevo ?? p.base.name}`);
  }

  /* ── verificación ───────────────────────────────────────────────────────── */

  const despues = await todas('tournaments?select=id,name,season_id,category,subcategory,age_grade,gender&union_id=eq.urba') as Torneo[];
  const repetidos = new Map<string, number>();
  for (const t of despues) {
    if (!instanciaDeTorneoUrba(t.name)) continue;
    const k = [t.season_id, t.category, gradoSinInstancia(t.name) ?? '∅', t.age_grade, t.gender].join('|');
    repetidos.set(k, (repetidos.get(k) ?? 0) + 1);
  }
  const huerfanos = [...repetidos.entries()].filter(([k]) => planes.some((p) => p.clave === k));
  console.log(`\ntorneos de URBA después: ${despues.length}`);
  console.log(`grupos unidos que todavía tienen una fila con instancia: ${huerfanos.length}`);
  if (huerfanos.length) { console.error('quedó algo sin unir:', huerfanos); process.exit(1); }
  console.log('verificado: ninguna de las competencias unidas ofrece su año dos veces.');
}

main().catch((e) => { console.error(e); process.exit(1); });
