/**
 * Carga formación y eventos de un partido NUESTRO —el que vive en `matches`—
 * desde un JSON.
 *
 *   npx tsx src/scripts/carga-partido-local.ts src/scripts/formaciones/<archivo>.json
 *   npx tsx src/scripts/carga-partido-local.ts src/scripts/formaciones/<archivo>.json --partido=<uuid> --apply
 *
 * Va aparte del script de partido externo porque el destino es otro y no hay
 * forma de equivocarse a medias: aquel escribe el override de
 * `external_match_lineup_overrides` porque el partido lo sirve el proveedor y no
 * tenemos fila propia; este escribe `matches`, que es de donde la vista pública
 * lee un partido cargado por nosotros. Correr el externo acá deja los datos
 * colgados de una tabla que esa vista no mira.
 *
 * Los dos lados, los eventos y el marcador van en UNA corrida, no en tres:
 * media carga —los quince sin el minuto a minuto, o los 16 eventos en un
 * partido que sigue mostrando "- - -"— es justo el estado que hay que poder
 * evitar. El marcador NO se deriva de los eventos: `persistMatchCenterSupple-
 * mentalData` guarda el minuto a minuto y no toca `matches.score`, así que
 * cargar sólo eventos deja el partido sin resultado.
 *
 * Los puntos de tabla no se declaran a mano: los calcula
 * `deriveClubAdminPointsPatch` con el ruleset del torneo y los eventos que se
 * acaban de escribir, que es la misma cuenta que hace la Results API. Y como
 * un resultado final cambia la tabla, se rehace la de la fase; el estado
 * anterior del partido queda en un archivo de rollback antes de tocar nada.
 *
 * El PUESTO no se declara: en rugby lo dice el número, y la traducción es la de
 * `lib/server/lineupPayload.ts` —la misma que usa `POST /api/results/lineups`—
 * para que cargar por script y cargar por API no puedan diferir.
 *
 * EL PARTIDO NO SE ADIVINA. Sin `--partido=<uuid>` el script no escribe: lista
 * los partidos de la fecha con su id y sus clubes para que el uuid lo elija una
 * persona. Resolver el cruce por nombre es justo lo que deja datos colgados del
 * partido equivocado —hay clubes homónimos y filiales que se llaman casi
 * igual—, y despegarlos después es peor que no haberlos cargado.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const REPO = process.cwd();

/**
 * Los puntos de cada tipo, como los declara el preset de rugby de
 * `lib/matchEventCatalog.ts`. Se repiten acá para poder VERIFICAR el marcador
 * antes de escribir: el catálogo pinta la botonera del Match Center, no valida
 * una carga por script.
 */
const PUNTOS: Record<string, number> = {
  try: 5, penalty_try: 7, conversion: 2,
  penalty: 3, penalty_goal: 3, drop_goal: 3,
  card_yellow: 0, card_red: 0, yellow_card: 0, red_card: 0,
  substitution: 0, injury: 0, penalty_committed: 0, free_kick: 0,
};

/** Los tiros a palos que cargamos son los que ENTRARON: los errados no figuran
 * en el minuto a minuto. Se marca explícito con la misma etiqueta que escribe
 * el asistente de partido, en vez de confiar en el default de
 * `isGoalKickMade`, que para `penalty` asume errado. */
const A_PALOS = new Set(['conversion', 'penalty', 'penalty_goal', 'drop_goal']);

type LadoJson = { nombre?: string };
type EventoJson = {
  minuto: number;
  tipo: string;
  equipo: 'local' | 'visitante';
  jugador?: string;
  detalle?: string;
};
type Datos = {
  fecha?: string;
  sede?: string;
  descripcion?: string;
  marcador?: { local: number; visitante: number };
  local: LadoJson;
  visitante: LadoJson;
  eventos?: EventoJson[];
};

type FilaPartido = {
  id: string;
  tournament_id: string | null;
  phase_id: string | null;
  season_id: string | null;
  date_time: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  status: string | null;
  venue: string | null;
  score: Record<string, number> | null;
  home_base_points: number | null;
  away_base_points: number | null;
  home_bonus_points: number | null;
  away_bonus_points: number | null;
  points_autocalculated: boolean | null;
  points_override_reason: string | null;
  lineups: { home?: unknown[]; away?: unknown[] } | null;
};

const SELECT_PARTIDO =
  'id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, status, venue, score,'
  + ' home_base_points, away_base_points, home_bonus_points, away_bonus_points,'
  + ' points_autocalculated, points_override_reason, lineups';

async function main() {
  const argumentos = process.argv.slice(2);
  const archivo = argumentos.find((a) => !a.startsWith('--'));
  const apply = argumentos.includes('--apply');
  const partidoId = (argumentos.find((a) => a.startsWith('--partido='))?.split('=')[1] ?? '').trim();
  const sinMarcador = argumentos.includes('--sin-marcador');

  if (!archivo) {
    console.error('uso: carga-partido-local.ts <datos.json> [--partido=<uuid>] [--apply] [--sin-marcador]');
    process.exit(2);
  }

  const datos = JSON.parse(fs.readFileSync(path.resolve(REPO, archivo), 'utf8')) as Datos;

  const { parseLineupPayload } = await import('@/lib/server/lineupPayload');
  const { home, away, issues } = parseLineupPayload(datos as unknown as Record<string, unknown>);

  if (issues.length > 0) {
    console.error('La formación tiene datos que no cierran:');
    for (const issue of issues) console.error(`  · ${issue}`);
    process.exit(1);
  }

  if (!home && !away) {
    console.error('El JSON no trae ninguna formación (`local` y/o `visitante`).');
    process.exit(1);
  }

  console.log(datos.descripcion ?? archivo);
  for (const [lado, nombre, jugadores] of [
    ['local', datos.local?.nombre, home],
    ['visitante', datos.visitante?.nombre, away],
  ] as const) {
    if (!jugadores) {
      console.log(`\n  ${lado} · ${nombre ?? '—'} · no viene en el JSON: ese lado NO se toca`);
      continue;
    }
    const titulares = jugadores.filter((j) => j.role === 'starter');
    const banco = jugadores.filter((j) => j.role === 'substitute');
    console.log(`\n  ${lado} · ${nombre ?? '—'} · ${titulares.length} titulares + ${banco.length} suplentes`);
    for (const j of jugadores) {
      console.log(`    ${String(j.number ?? '—').padStart(2)} ${j.name}${j.isCaptain ? ' (c)' : ''}${j.position ? ` — ${j.position}` : ''}`);
    }
  }

  // ── Eventos ────────────────────────────────────────────────────────────────
  const eventosJson = datos.eventos ?? [];
  const problemas: string[] = [];
  const puntos = { local: 0, visitante: 0 };

  /** El autor de un evento tiene que estar en la formación de SU lado. Es el
   * chequeo que caza el error más probable de una transcripción: el evento
   * bien copiado pero puesto en el equipo equivocado. */
  const plantel = {
    local: new Map((home ?? []).map((j) => [j.name, j.number])),
    visitante: new Map((away ?? []).map((j) => [j.name, j.number])),
  };

  for (const [i, ev] of eventosJson.entries()) {
    const donde = `evento ${i + 1} (${ev.minuto}')`;

    if (!(ev.tipo in PUNTOS)) problemas.push(`${donde}: tipo desconocido "${ev.tipo}"`);
    if (ev.equipo !== 'local' && ev.equipo !== 'visitante') {
      problemas.push(`${donde}: equipo tiene que ser "local" o "visitante", vino "${ev.equipo}"`);
      continue;
    }
    if (!Number.isInteger(ev.minuto) || ev.minuto < 0) {
      problemas.push(`${donde}: el minuto no es un entero`);
    }
    if (ev.jugador && !plantel[ev.equipo].has(ev.jugador)) {
      const otroLado = ev.equipo === 'local' ? 'visitante' : 'local';
      problemas.push(
        `${donde}: "${ev.jugador}" no está en la formación ${ev.equipo}` +
        (plantel[otroLado].has(ev.jugador) ? ` — SÍ está en la ${otroLado}` : ''),
      );
    }

    puntos[ev.equipo] += PUNTOS[ev.tipo] ?? 0;
  }

  if (problemas.length > 0) {
    console.error('\nLos eventos tienen datos que no cierran:');
    for (const p of problemas) console.error(`  · ${p}`);
    process.exit(1);
  }

  if (eventosJson.length > 0) {
    console.log(`\n  eventos · ${eventosJson.length} · suman ${puntos.local}-${puntos.visitante}`);
    for (const ev of eventosJson) {
      const numero = plantel[ev.equipo].get(ev.jugador ?? '');
      console.log(
        `    ${String(ev.minuto).padStart(2)}' ${ev.equipo === 'local' ? 'L' : 'V'} ${ev.tipo.padEnd(13)}` +
        `${numero ? `#${numero} ` : ''}${ev.jugador ?? ''}`,
      );
    }

    // El marcador declarado es el control de que no falta ni sobra un evento.
    if (datos.marcador) {
      const { local, visitante } = datos.marcador;
      if (local !== puntos.local || visitante !== puntos.visitante) {
        console.error(
          `\nLos eventos suman ${puntos.local}-${puntos.visitante} pero el marcador declarado es ${local}-${visitante}.`,
        );
        process.exit(1);
      }
      console.log(`  el marcador declarado ${local}-${visitante} coincide con los eventos`);
    }
  }

  const eventos = eventosJson.map((ev) => ({
    minute: ev.minuto,
    type: ev.tipo,
    team: (ev.equipo === 'local' ? 'home' : 'away') as 'home' | 'away',
    playerName: ev.jugador ?? '',
    detail: ev.detalle ?? (A_PALOS.has(ev.tipo) ? '[palos:ok]' : ''),
  }));

  // ── El partido ─────────────────────────────────────────────────────────────
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();

  if (!partidoId) {
    if (!datos.fecha) {
      console.error('\nFalta --partido=<uuid>, y el JSON no trae `fecha` para listar los candidatos.');
      process.exit(2);
    }

    // Los partidos del día, para que el uuid lo elija una persona y no un
    // match de nombres.
    const { data: candidatos, error: errorFecha } = await supabase
      .from('matches')
      .select(SELECT_PARTIDO)
      .gte('date_time', `${datos.fecha}T00:00:00`)
      .lte('date_time', `${datos.fecha}T23:59:59`)
      .order('date_time');

    if (errorFecha) {
      console.error('No pude leer los partidos de la fecha.', errorFecha);
      process.exit(1);
    }

    const filas = (candidatos ?? []) as unknown as FilaPartido[];
    console.log(`\nPartidos del ${datos.fecha} (${filas.length}):`);
    for (const fila of filas) {
      const cargados = (fila.lineups?.home?.length ?? 0) + (fila.lineups?.away?.length ?? 0);
      const sc = fila.score ?? {};
      console.log(
        `  ${fila.id} · ${fila.home_club_id ?? '—'} vs ${fila.away_club_id ?? '—'}` +
        ` · ${String(fila.date_time).slice(11, 16)} · ${fila.status ?? '—'} · ${sc.home ?? '-'}-${sc.away ?? '-'}` +
        (cargados ? ` · YA TIENE ${cargados} jugadores cargados` : ''),
      );
    }
    console.log('\nNada se escribió. Repetí con --partido=<uuid> --apply.');
    return;
  }

  const { data: filaRaw, error } = await supabase
    .from('matches')
    .select(SELECT_PARTIDO)
    .eq('id', partidoId)
    .single();

  if (error || !filaRaw) {
    console.error(`\nNo existe el partido ${partidoId}.`, error);
    process.exit(1);
  }

  const fila = filaRaw as unknown as FilaPartido;
  const yaCargados = (fila.lineups?.home?.length ?? 0) + (fila.lineups?.away?.length ?? 0);
  const sc = fila.score ?? {};

  console.log(`\npartido ${fila.id} · ${fila.home_club_id ?? '—'} vs ${fila.away_club_id ?? '—'} · ${String(fila.date_time).slice(0, 16)} · ${fila.status ?? '—'} · ${sc.home ?? '-'}-${sc.away ?? '-'}`);

  if (datos.fecha && !String(fila.date_time).startsWith(datos.fecha)) {
    console.error(`El partido no es del ${datos.fecha} sino del ${String(fila.date_time).slice(0, 10)}.`);
    process.exit(1);
  }

  // Un marcador ya cargado que NO da los eventos es una contradicción: o falta
  // un evento o el partido es otro. Escribir encima de eso empeora las cosas.
  if (eventos.length > 0 && typeof sc.home === 'number' && typeof sc.away === 'number' && (sc.home || sc.away)) {
    if (sc.home !== puntos.local || sc.away !== puntos.visitante) {
      console.error(
        `Los eventos suman ${puntos.local}-${puntos.visitante} pero el partido tiene ${sc.home}-${sc.away}.`,
      );
      process.exit(1);
    }
    console.log(`  el marcador del partido ${sc.home}-${sc.away} coincide con los eventos`);
  }

  // La sede sólo se escribe si el partido no tiene una. Pisar una sede cargada
  // a mano por una transcripción es exactamente al revés de lo que conviene.
  const escribeSede = Boolean(datos.sede) && !fila.venue?.trim();
  if (datos.sede) {
    if (escribeSede) {
      console.log(`  sede a escribir: ${datos.sede} (el partido no tiene ninguna)`);
    } else if (fila.venue?.trim() !== datos.sede) {
      console.log(`  sede: el partido ya dice "${fila.venue}" y el JSON "${datos.sede}" — NO se toca`);
    }
  }

  const escribeMarcador = Boolean(datos.marcador) && !sinMarcador;
  if (escribeMarcador) {
    console.log(`  marcador a escribir: ${datos.marcador!.local}-${datos.marcador!.visitante} · status final`);
  } else if (datos.marcador) {
    console.log('  --sin-marcador: el resultado y la tabla quedan como están');
  }

  if (yaCargados) {
    console.log(`  OJO: ya tiene ${yaCargados} jugadores cargados. El lado que mandes se reemplaza entero.`);
  }
  if (eventos.length > 0) {
    console.log('  OJO: los eventos se reemplazan TODOS por los del JSON.');
  }

  if (!apply) {
    console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.');
    return;
  }

  const { persistMatchCenterSupplementalData } = await import('@/lib/services/matchCenterService');

  // El lado que no vino NO se manda: mandarlo vacío lo borraría. Con los
  // eventos no hay medias tintas —van todos o no va ninguno—, así que la clave
  // se omite entera cuando el JSON no los trae.
  const guardado = await persistMatchCenterSupplementalData(supabase, fila.id, {
    lineups: { ...(home ? { home } : {}), ...(away ? { away } : {}) },
    ...(eventos.length > 0 ? { events: eventos } : {}),
  });

  if (!guardado.persistedLineups) {
    console.error('\nEl partido existe pero la formación no se pudo guardar.');
    process.exit(1);
  }

  console.log(`\nguardado · ${home ? `${home.length} local` : 'local intacto'} · ${away ? `${away.length} visitante` : 'visitante intacto'} · ${eventos.length} eventos`);

  if (!escribeMarcador && !escribeSede) return;

  // El estado anterior del partido, antes de tocarlo. Acumulativo: repetir
  // --apply no puede pisar el original con lo que ya se escribió.
  const fsp = await import('node:fs/promises');
  const rollback = `ROLLBACK_${fila.id}.json`;
  let previo: Array<{ id: string; antes: unknown }> = [];
  try { previo = JSON.parse(await fsp.readFile(rollback, 'utf8')); } catch { previo = []; }
  if (!previo.some((x) => x.id === fila.id)) {
    previo.push({ id: fila.id, antes: {
      status: fila.status, venue: fila.venue, score: fila.score,
      home_base_points: fila.home_base_points, away_base_points: fila.away_base_points,
      home_bonus_points: fila.home_bonus_points, away_bonus_points: fila.away_bonus_points,
      points_autocalculated: fila.points_autocalculated,
      points_override_reason: fila.points_override_reason,
      lineups: fila.lineups,
    } });
    await fsp.writeFile(rollback, JSON.stringify(previo, null, 2), 'utf8');
    console.log(`· estado anterior guardado en ${rollback}`);
  }

  const score = escribeMarcador
    ? { home: datos.marcador!.local, away: datos.marcador!.visitante }
    : null;

  // Los puntos de tabla salen de la misma cuenta que la Results API, con el
  // ruleset del torneo y los eventos recién escritos. `null` = el partido tiene
  // los puntos puestos a mano y no hay que pisarlos.
  const { deriveClubAdminPointsPatch } = await import('@/lib/services/matchPointsSync');
  const patch = score
    ? await deriveClubAdminPointsPatch(supabase, fila.id, { status: 'final', score, events: eventos })
    : null;

  const { error: errorUpdate } = await supabase.from('matches').update({
    ...(escribeSede ? { venue: datos.sede } : {}),
    ...(score ? { status: 'final', score } : {}),
    ...(patch ? {
      home_base_points: patch.homeBasePoints,
      away_base_points: patch.awayBasePoints,
      home_bonus_points: patch.homeBonusPoints,
      away_bonus_points: patch.awayBonusPoints,
      points_autocalculated: true,
      points_override_reason: null,
    } : {}),
  }).eq('id', fila.id);

  if (errorUpdate) {
    console.error('No pude escribir el marcador.', errorUpdate);
    process.exit(1);
  }

  if (escribeSede) console.log(`· sede ${datos.sede}`);
  if (!score) {
    console.log('· sin marcador que escribir: la tabla queda como está');
    return;
  }

  console.log(
    `· marcador ${score.home}-${score.away} · final`
    + (patch
      ? ` · puntos ${patch.homeBasePoints}+${patch.homeBonusPoints} / ${patch.awayBasePoints}+${patch.awayBonusPoints}`
      : ' · puntos a mano: NO se tocaron'),
  );

  // Un resultado final cambia la tabla. No rehacerla la deja vieja sin avisar.
  if (fila.tournament_id && fila.phase_id) {
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(
      fila.tournament_id, fila.phase_id, 'general', fila.season_id ?? undefined,
    );
    console.log(`· tabla rehecha: ${r.ok ? 'ok' : 'FALLÓ'} (${r.rows_calculated} filas)`);
  } else {
    console.log('· el partido no tiene torneo/fase: no hay tabla que rehacer');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
