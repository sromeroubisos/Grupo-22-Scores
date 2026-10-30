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
  match_start: 0, match_half: 0, match_end: 0, start_period: 0, end_period: 0,
};

/**
 * Los eventos de RELOJ: no son de ningún equipo ni de ningún jugador, y por eso
 * en el JSON van sin `equipo`.
 *
 * Valen la pena aunque no sumen un punto: de `match_half` sale el PERÍODO de
 * todo lo que viene después. `normalizeEventInput` no lo deduce del minuto —le
 * pregunta al período activo, y ese avanza cuando pasa el entretiempo—, así que
 * un minuto a minuto cargado sin el corte deja los tries del segundo tiempo
 * rotulados "1T", y la cronología los agrupa y los titula como si fueran del
 * primero.
 */
const RELOJ = new Set(['match_start', 'match_half', 'match_end', 'start_period', 'end_period']);

/** Los tiros a palos que cargamos son los que ENTRARON: los errados no figuran
 * en el minuto a minuto. Se marca explícito con la misma etiqueta que escribe
 * el asistente de partido, en vez de confiar en el default de
 * `isGoalKickMade`, que para `penalty` asume errado. */
const A_PALOS = new Set(['conversion', 'penalty', 'penalty_goal', 'drop_goal']);

type LadoJson = { nombre?: string };
type EventoJson = {
  minuto: number;
  tipo: string;
  /** Ausente en los eventos de reloj (`RELOJ`), que no son de ningún lado. */
  equipo?: 'local' | 'visitante';
  jugador?: string;
  detalle?: string;
  /**
   * '1T' | '2T' (o 'Q1'..'Q4' donde corresponda). SE DECLARA, no se deduce.
   *
   * Uno esperaría que saliera del minuto, o del `match_half` que ya viene en la
   * lista, y en un camino del motor sale: el que lee los eventos viejos de la
   * columna JSON va llevando el período activo y lo hace avanzar en el
   * entretiempo. Pero el camino por el que escribe este script es el otro
   * —`resolveEventsForPersistence`, que normaliza con
   * `events.map((event) => normalizeEventInput(event))`, sin período activo—,
   * así que todo lo que no lo traiga declarado cae en el default '1T'.
   *
   * Y eso se ve: la cronología agrupa por período ANTES que por minuto y titula
   * cada grupo, así que un try del segundo tiempo sin `periodo` sale rotulado
   * como del primero.
   */
  periodo?: string;
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
  /**
   * El minuto a minuto SIN la formación.
   *
   * No es la media carga contra la que avisa la cabecera de este archivo: esa
   * es el partido que queda mostrando "- - -". Acá el marcador ya está cargado
   * y lo único que falta es la cronología. Hay fuentes que publican una y no la
   * otra —el Americas Rugby Championship publica el minuto a minuto de cada
   * fecha y no los quince—, y negarse a cargar la que sí está deja la ficha más
   * pobre, no más prolija.
   *
   * Lo que se resigna es el control que cruza cada autor contra su plantel, o
   * sea el que caza el evento bien copiado pero puesto en el equipo equivocado.
   * Por eso el `marcador` declarado pasa a ser el único control que queda, y
   * conviene que venga siempre.
   */
  const sinFormacion = argumentos.includes('--sin-formacion');

  if (!archivo) {
    console.error('uso: carga-partido-local.ts <datos.json> [--partido=<uuid>] [--apply] [--sin-marcador] [--sin-formacion]');
    process.exit(2);
  }

  const datos = JSON.parse(fs.readFileSync(path.resolve(REPO, archivo), 'utf8')) as Datos;

  const { parseLineupPayload } = await import('@/lib/server/lineupPayload');
  const { home, away, issues } = parseLineupPayload(datos as unknown as Record<string, unknown>);

  // Con --sin-formacion los lados pueden venir con el nombre solo, para que el
  // JSON deje escrito de quién es cada evento. Eso no es una formación a medio
  // hacer: es un rótulo, y no se escribe.
  if (issues.length > 0 && !sinFormacion) {
    console.error('La formación tiene datos que no cierran:');
    for (const issue of issues) console.error(`  · ${issue}`);
    process.exit(1);
  }

  if (!home && !away && !sinFormacion) {
    console.error('El JSON no trae ninguna formación (`local` y/o `visitante`).');
    console.error('Si la fuente no la publicó y sólo tenés el minuto a minuto, repetí con --sin-formacion.');
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

    if (RELOJ.has(ev.tipo)) {
      if (ev.equipo) problemas.push(`${donde}: "${ev.tipo}" es de reloj y no lleva equipo`);
      if (!Number.isInteger(ev.minuto) || ev.minuto < 0) problemas.push(`${donde}: el minuto no es un entero`);
      continue;
    }

    if (ev.equipo !== 'local' && ev.equipo !== 'visitante') {
      problemas.push(`${donde}: equipo tiene que ser "local" o "visitante", vino "${ev.equipo}"`);
      continue;
    }
    if (!Number.isInteger(ev.minuto) || ev.minuto < 0) {
      problemas.push(`${donde}: el minuto no es un entero`);
    }
    if (!sinFormacion && ev.jugador && !plantel[ev.equipo].has(ev.jugador)) {
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
      const numero = ev.equipo ? plantel[ev.equipo].get(ev.jugador ?? '') : undefined;
      const lado = ev.equipo === 'local' ? 'L' : ev.equipo === 'visitante' ? 'V' : '·';
      console.log(
        `    ${String(ev.minuto).padStart(2)}' ${lado} ${ev.tipo.padEnd(13)}` +
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
    team: (ev.equipo === 'local' ? 'home' : ev.equipo === 'visitante' ? 'away' : null) as 'home' | 'away' | null,
    ...(ev.periodo ? { period: ev.periodo } : {}),
    playerName: ev.jugador ?? '',
    detail: ev.detalle ?? (A_PALOS.has(ev.tipo) ? '[palos:ok]' : ''),
  }));

  // ── El partido ─────────────────────────────────────────────────────────────
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();

  /**
   * La `fecha` del JSON es el DÍA DE CANCHA, y `matches.date_time` está en UTC.
   * Para un partido nocturno esas dos cosas no son el mismo día: Universitario
   * vs Tala se jugó a las 21:45 del 4/9 y vive en la base como las 00:45 del
   * 5/9. Comparar el timestamp crudo con `startsWith` lo daba por otro día y
   * frenaba la carga; buscar los candidatos entre las 00:00 y las 23:59 UTC
   * ni siquiera lo mostraba en la lista. Todo lo que mire fechas acá —la
   * ventana, el guard y la hora que se imprime— pasa por `APP_TIMEZONE`.
   */
  const { APP_TIMEZONE, formatDateKey, combineLocalDateTimeToUtcIso, addDaysToIsoDate, toInputTimeInTimeZone } =
    await import('@/lib/timezone');

  /** El día de cancha de un partido guardado, no su día UTC. */
  const diaDeCancha = (valor: string | null) => {
    const d = valor ? new Date(valor) : null;
    return d && !Number.isNaN(d.getTime()) ? formatDateKey(d, APP_TIMEZONE) : '';
  };
  const horaDeCancha = (valor: string | null) => (valor ? toInputTimeInTimeZone(valor, APP_TIMEZONE) : '—');

  if (!partidoId) {
    if (!datos.fecha) {
      console.error('\nFalta --partido=<uuid>, y el JSON no trae `fecha` para listar los candidatos.');
      process.exit(2);
    }

    // La ventana es el día LOCAL completo, traducido a los dos instantes UTC
    // que lo encierran. Con `lt` en el borde de arriba, el partido de las 00:00
    // del día siguiente no se cuela.
    const desdeUtc = combineLocalDateTimeToUtcIso(datos.fecha, '00:00', APP_TIMEZONE);
    const hastaUtc = combineLocalDateTimeToUtcIso(addDaysToIsoDate(datos.fecha, 1), '00:00', APP_TIMEZONE);
    if (!desdeUtc || !hastaUtc) {
      console.error(`\n\`fecha\` no es una fecha válida: ${datos.fecha}`);
      process.exit(2);
    }

    // Los partidos del día, para que el uuid lo elija una persona y no un
    // match de nombres.
    const { data: candidatos, error: errorFecha } = await supabase
      .from('matches')
      .select(SELECT_PARTIDO)
      .gte('date_time', desdeUtc)
      .lt('date_time', hastaUtc)
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
        ` · ${horaDeCancha(fila.date_time)} · ${fila.status ?? '—'} · ${sc.home ?? '-'}-${sc.away ?? '-'}` +
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

  console.log(
    `\npartido ${fila.id} · ${fila.home_club_id ?? '—'} vs ${fila.away_club_id ?? '—'}`
    + ` · ${diaDeCancha(fila.date_time)} ${horaDeCancha(fila.date_time)}`
    + ` · ${fila.status ?? '—'} · ${sc.home ?? '-'}-${sc.away ?? '-'}`,
  );

  if (datos.fecha && diaDeCancha(fila.date_time) !== datos.fecha) {
    console.error(
      `El partido no es del ${datos.fecha} sino del ${diaDeCancha(fila.date_time)}`
      + ` (guardado ${String(fila.date_time).slice(0, 16)} UTC).`,
    );
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
  //
  // Omitir `lineups` entera es TAMBIÉN lo que deja intacta la formación ya
  // cargada. Y como `persistedLineups` sólo se enciende cuando esa clave
  // viaja, en el modo sin formación su `false` no es una falla que reportar.
  const mandaFormacion = !sinFormacion && Boolean(home || away);
  const guardado = await persistMatchCenterSupplementalData(supabase, fila.id, {
    ...(mandaFormacion ? { lineups: { ...(home ? { home } : {}), ...(away ? { away } : {}) } } : {}),
    ...(eventos.length > 0 ? { events: eventos } : {}),
  });

  if (mandaFormacion && !guardado.persistedLineups) {
    console.error('\nEl partido existe pero la formación no se pudo guardar.');
    process.exit(1);
  }

  console.log(
    mandaFormacion
      ? `\nguardado · ${home ? `${home.length} local` : 'local intacto'} · ${away ? `${away.length} visitante` : 'visitante intacto'} · ${eventos.length} eventos`
      : `\nguardado · formación intacta (--sin-formacion) · ${eventos.length} eventos`,
  );

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
