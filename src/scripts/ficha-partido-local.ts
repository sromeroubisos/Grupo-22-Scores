/**
 * Carga la FICHA COMPLETA de un partido LOCAL (formaciones + eventos + arbitro)
 * desde un JSON, para partidos que ya tienen fila en `matches`.
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/ficha-partido-local.ts src/scripts/formaciones/<archivo>.json --plan
 *
 * Es el hermano de `formaciones-urba-fecha20.ts` (que carga SOLO formaciones):
 * pasa por `persistMatchCenterSupplementalData`, la misma funcion que usa
 * `PATCH /api/admin/matches/[id]`, con `lineups` y `events` EN LA MISMA llamada.
 * El orden importa: los eventos resuelven el nombre del jugador contra la
 * formacion que viaja en el mismo payload, asi que separarlos en dos llamadas
 * dejaria los eventos sin `playerId` y sin ficha en `people`.
 *
 * Tres cosas que el servicio NO escribe y van a mano en el mismo paso:
 *
 * - `lineup_home_count` / `lineup_away_count` / `events_count`: no hay trigger.
 *   Sin ellos la pestana de alineaciones y el tablero del club quedan apagados
 *   aunque el jsonb tenga los 23. Ver [[cargar-formaciones-por-script]].
 * - `score.homeTries` / `score.awayTries`: `countTeamEventMetric` le da
 *   PRIORIDAD al contador del `score` sobre los eventos, asi que un 0 guardado
 *   tapa los tries recien cargados y el bonus ofensivo nunca aparece.
 * - `referee`: es columna propia de `matches`, no un evento.
 *
 * El minuto se escribe como viene en la cronica (el 2T arranca de cero) y el
 * script lo lleva a ABSOLUTO sumando 40, que es la convencion de lo ya cargado
 * (hay eventos en minuto 79). El periodo viaja aparte, en `details.period`.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

// Cargar el entorno ANTES de importar nada que arme el cliente de Supabase.
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const linea of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// `server-only` / `client-only` son centinelas del bundler de Next: fuera de
// `next build` no existen en node_modules y cortan la cadena de imports.
{
  const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const cargar = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'server-only' || request === 'client-only') return {};
    return cargar.call(this, request, ...rest);
  };
}

/** El numero de camiseta es el puesto. 16 en adelante entra desde el banco. */
const PUESTO_POR_NUMERO: Record<number, string> = {
  1: 'Pilar', 2: 'Hooker', 3: 'Pilar',
  4: 'Segunda línea', 5: 'Segunda línea',
  6: 'Tercera línea', 7: 'Tercera línea', 8: 'Tercera línea',
  9: 'Medio scrum', 10: 'Apertura',
  11: 'Wing', 12: 'Centro', 13: 'Centro', 14: 'Wing', 15: 'Fullback',
};

/** Puntos por tipo, copiados de `SPORT_EVENT_DEFINITIONS.rugby` del catalogo. */
const PUNTOS_POR_TIPO: Record<string, number> = {
  try: 5, penalty_try: 7, conversion: 2, penalty: 3, penalty_goal: 3, drop_goal: 3,
};
const TIPOS_TRY = new Set(['try', 'penalty_try']);

/** Duracion del primer tiempo: lo que se le suma a un minuto del 2T. */
const MINUTOS_PRIMER_TIEMPO = 40;

/**
 * `id` es la ficha de `people` que se quiere REUSAR. Sin el, el servicio
 * resuelve por nombre y su clave no pliega tildes: "Nicolas Olguin" y
 * "Nicolás Olguín" son dos jugadores distintos y terminan en dos fichas.
 * Ver [[fichas-duplicadas-por-tilde]].
 */
type JugadorJson = { numero?: number; nombre: string; capitan?: boolean; puesto?: string; id?: string };
type LadoJson = { nombre?: string; sinDatos?: boolean; titulares: JugadorJson[]; suplentes?: JugadorJson[] };
type EventoJson = {
  minuto: number;
  periodo?: '1T' | '2T';
  tipo: string;
  equipo: 'local' | 'visitante';
  jugador?: string;
  detalle?: string;
};
type PartidoJson = {
  id: string;
  rotulo: string;
  arbitro?: string;
  /** Carga los eventos aunque no sumen el marcador guardado (la fuente y la base se contradicen). */
  permitirDiferencia?: boolean;
  local: LadoJson;
  visitante: LadoJson;
  eventos?: EventoJson[];
};
type Datos = { descripcion?: string; torneo?: string; partidos: PartidoJson[] };

function armarLado(lado: LadoJson) {
  const uno = (j: JugadorJson, role: 'starter' | 'substitute') => ({
    id: j.id ?? null,
    number: j.numero ?? null,
    name: j.nombre,
    position: j.puesto ?? (j.numero ? PUESTO_POR_NUMERO[j.numero] : undefined) ?? null,
    role,
    rating: null,
    isCaptain: Boolean(j.capitan),
  });
  return [
    ...lado.titulares.map((j) => uno(j, 'starter')),
    ...(lado.suplentes ?? []).map((j) => uno(j, 'substitute')),
  ];
}

function armarEventos(eventos: EventoJson[]) {
  return eventos.map((e, indice) => {
    const periodo = e.periodo ?? '1T';
    return {
      minuto: e.minuto,
      periodo,
      tipo: e.tipo,
      equipo: e.equipo,
      jugador: e.jugador ?? '',
      evento: {
        minute: periodo === '2T' ? e.minuto + MINUTOS_PRIMER_TIEMPO : e.minuto,
        period: periodo,
        type: e.tipo,
        team: (e.equipo === 'local' ? 'home' : 'away') as 'home' | 'away',
        playerName: e.jugador ?? '',
        detail: e.detalle ?? '',
        order: indice,
      },
    };
  });
}

/** Marcador y tries que salen de los eventos, para contrastar con lo guardado. */
function marcadorDeEventos(eventos: ReturnType<typeof armarEventos>) {
  const total = { home: 0, away: 0, homeTries: 0, awayTries: 0 };
  for (const { evento } of eventos) {
    const lado = evento.team;
    total[lado] += PUNTOS_POR_TIPO[evento.type] ?? 0;
    if (TIPOS_TRY.has(evento.type)) total[lado === 'home' ? 'homeTries' : 'awayTries'] += 1;
  }
  return total;
}

async function main() {
  const argumentos = process.argv.slice(2);
  const archivo = argumentos.find((a) => !a.startsWith('--'));
  const modo = argumentos.includes('--execute') ? 'execute' : argumentos.includes('--plan') ? 'plan' : null;

  if (!archivo || !modo) {
    console.error('uso: ficha-partido-local.ts <datos.json> --plan|--execute');
    process.exit(2);
  }

  const datos = JSON.parse(fs.readFileSync(path.resolve(REPO, archivo), 'utf8')) as Datos;
  console.log(datos.descripcion ?? '');

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const db = createAdminClient();

  for (const partido of datos.partidos) {
    const lineups = { home: armarLado(partido.local), away: armarLado(partido.visitante) };
    const eventos = armarEventos(partido.eventos ?? []);
    const calculado = marcadorDeEventos(eventos);

    const { data: fila, error } = await db
      .from('matches')
      .select('id, score, referee, lineup_home_count, lineup_away_count, events_count')
      .eq('id', partido.id)
      .single();
    if (error || !fila) throw new Error(`no se pudo leer ${partido.rotulo}: ${error?.message ?? 'sin fila'}`);

    const guardado = (fila.score ?? {}) as Record<string, unknown>;
    const puntosGuardados = { home: Number(guardado.home) || 0, away: Number(guardado.away) || 0 };

    console.log(`\n${partido.rotulo}  ·  ${partido.id}`);
    const fijadas = (lado: typeof lineups.home) => lado.filter((j) => j.id).length;
    console.log(`  local     · ${partido.local.nombre ?? '—'} · ${lineups.home.length} jugadores · ${fijadas(lineups.home)} con ficha fijada`);
    console.log(`  visitante · ${partido.visitante.nombre ?? '—'} · ${lineups.away.length} jugadores · ${fijadas(lineups.away)} con ficha fijada`);
    console.log(`  eventos   · ${eventos.length}`);
    for (const e of eventos) {
      const rotulo = `${e.periodo} ${e.minuto}`;
      console.log(`    min ${String(e.evento.minute).padStart(2)} (${rotulo}) ${e.equipo.padEnd(9)} ${e.tipo.padEnd(12)} ${e.jugador}`);
    }
    console.log(`  marcador  · eventos ${calculado.home}-${calculado.away} · guardado ${puntosGuardados.home}-${puntosGuardados.away}`);
    console.log(`  tries     · ${calculado.homeTries}-${calculado.awayTries} (guardado ${guardado.homeTries ?? '—'}-${guardado.awayTries ?? '—'})`);
    if (partido.arbitro) console.log(`  arbitro   · ${partido.arbitro} (guardado: ${fila.referee ?? '—'})`);

    // El marcador de la fila es la fuente: si los eventos no lo reconstruyen,
    // algo falta o sobra en la cronica y cargarlo dejaria la ficha mintiendo.
    const difiere = calculado.home !== puntosGuardados.home || calculado.away !== puntosGuardados.away;
    if (eventos.length > 0 && difiere && partido.permitirDiferencia) {
      console.log('  aviso     · los eventos no suman el marcador guardado; se cargan igual (permitirDiferencia)');
    } else if (eventos.length > 0 && difiere) {
      throw new Error(
        `${partido.rotulo}: los eventos suman ${calculado.home}-${calculado.away} pero el partido dice `
        + `${puntosGuardados.home}-${puntosGuardados.away}. Revisa la cronica antes de escribir.`,
      );
    }

    if (modo === 'plan') continue;

    const { persistMatchCenterSupplementalData } = await import('@/lib/services/matchCenterService');
    // Una sola llamada: los eventos resuelven sus jugadores contra esta formacion.
    const resultado = await persistMatchCenterSupplementalData(db as never, partido.id, {
      lineups,
      ...(eventos.length > 0 ? { events: eventos.map((e) => e.evento) } : {}),
    }) as { lineups?: { home?: unknown[]; away?: unknown[] } };

    const columnas: Record<string, unknown> = {};
    if (!partido.local.sinDatos) columnas.lineup_home_count = lineups.home.length;
    if (!partido.visitante.sinDatos) columnas.lineup_away_count = lineups.away.length;
    if (eventos.length > 0) {
      columnas.events_count = eventos.length;
      columnas.score = { ...guardado, homeTries: calculado.homeTries, awayTries: calculado.awayTries };
    }
    if (partido.arbitro) columnas.referee = partido.arbitro;

    if (Object.keys(columnas).length > 0) {
      const { error: errorColumnas } = await db.from('matches').update(columnas).eq('id', partido.id);
      if (errorColumnas) throw new Error(`columnas de ${partido.rotulo}: ${errorColumnas.message}`);
    }

    console.log(
      `  guardado  · ${resultado.lineups?.home?.length ?? 0} local · ${resultado.lineups?.away?.length ?? 0} visitante · ${eventos.length} eventos`,
    );
  }

  console.log(modo === 'plan' ? '\n(plan: no se escribió nada)' : `\nlisto · ${datos.partidos.length} partidos`);
}

main().catch((err) => { console.error(err); process.exit(1); });
