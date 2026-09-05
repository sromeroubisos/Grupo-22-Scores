/**
 * Carga los RESULTADOS de una fecha entera —marcador y puntos de tabla, sin
 * formación ni minuto a minuto— desde un JSON.
 *
 *   npx tsx src/scripts/carga-resultados.ts src/scripts/resultados/<archivo>.json
 *   npx tsx src/scripts/carga-resultados.ts src/scripts/resultados/<archivo>.json --apply
 *
 * Va aparte de `carga-partido-local.ts` porque la fuente es otra y eso cambia
 * la cuenta. Aquel carga UN partido del que tenemos el minuto a minuto, así que
 * el bonus ofensivo sale de contar los tries. Acá la fuente es una placa de
 * resultados: da el marcador y nada más. Contar tries sobre cero eventos daría
 * cero bonus ofensivo y una tabla mal, así que el ofensivo se DECLARA y queda
 * escrito de dónde salió.
 *
 * El resto no se declara: el puntaje base y el bonus defensivo los calcula
 * `deriveClubAdminPointsPatch` con el ruleset del torneo, que es donde viven de
 * verdad el margen del defensivo y cuánto vale cada bonus. Hardcodear "pierde
 * por 7 o menos" acá sería inventar la regla de un torneo que puede tener otra.
 *
 * LOS PARTIDOS NO SE ADIVINAN. Sin el uuid de cada uno el script no escribe:
 * lista los partidos de la fecha con sus clubes para que los uuids los complete
 * una persona en el campo `partido` del JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const REPO = process.cwd();

type PartidoJson = {
  partido: string | null;
  local: string;
  visitante: string;
  marcador: { local: number; visitante: number };
  /** Los lados que se llevan el punto bonus ofensivo, declarado por la fuente. */
  bonusOfensivo?: Array<'local' | 'visitante'>;
};

type Datos = {
  fecha: string;
  descripcion?: string;
  fuente?: string;
  motivo?: string;
  puntosBonusOfensivo?: number;
  partidos: PartidoJson[];
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
  score: Record<string, number> | null;
  home_base_points: number | null;
  away_base_points: number | null;
  home_bonus_points: number | null;
  away_bonus_points: number | null;
  points_autocalculated: boolean | null;
  points_override_reason: string | null;
};

const SELECT_PARTIDO =
  'id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, status, score,'
  + ' home_base_points, away_base_points, home_bonus_points, away_bonus_points,'
  + ' points_autocalculated, points_override_reason';

/** Para comparar un nombre de la placa con el slug del club sin pelearse con
 * tildes ni mayúsculas. No decide nada: sólo sirve para avisar. */
function tokens(valor: string) {
  return valor
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

async function main() {
  const argumentos = process.argv.slice(2);
  const archivo = argumentos.find((a) => !a.startsWith('--'));
  const apply = argumentos.includes('--apply');

  if (!archivo) {
    console.error('uso: carga-resultados.ts <datos.json> [--apply]');
    process.exit(2);
  }

  const datos = JSON.parse(fs.readFileSync(path.resolve(REPO, archivo), 'utf8')) as Datos;
  const puntosOfensivo = datos.puntosBonusOfensivo ?? 1;

  console.log(`${datos.descripcion ?? archivo}${datos.fuente ? `\nfuente: ${datos.fuente}` : ''}\n`);
  for (const p of datos.partidos) {
    const ganador = p.marcador.local > p.marcador.visitante ? p.local
      : p.marcador.visitante > p.marcador.local ? p.visitante : 'empate';
    console.log(
      `  ${p.local} ${p.marcador.local}-${p.marcador.visitante} ${p.visitante}`
      + ` · ${ganador === 'empate' ? 'empate' : `gana ${ganador}`}`
      + ` · ofensivo declarado: ${(p.bonusOfensivo ?? []).join(', ') || '—'}`,
    );
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();

  const sinUuid = datos.partidos.filter((p) => !p.partido);
  if (sinUuid.length > 0) {
    const { data: candidatos, error } = await supabase
      .from('matches')
      .select(SELECT_PARTIDO)
      .gte('date_time', `${datos.fecha}T00:00:00`)
      .lte('date_time', `${datos.fecha}T23:59:59`)
      .order('date_time');

    if (error) {
      console.error('No pude leer los partidos de la fecha.', error);
      process.exit(1);
    }

    const filas = (candidatos ?? []) as unknown as FilaPartido[];
    console.log(`\nFaltan ${sinUuid.length} uuid. Partidos del ${datos.fecha} (${filas.length}):`);
    for (const fila of filas) {
      const sc = fila.score ?? {};
      console.log(
        `  ${fila.id} · ${fila.home_club_id ?? '—'} vs ${fila.away_club_id ?? '—'}`
        + ` · ${String(fila.date_time).slice(11, 16)} · ${fila.status ?? '—'} · ${sc.home ?? '-'}-${sc.away ?? '-'}`,
      );
    }
    console.log('\nCompletá el campo "partido" de cada uno en el JSON. Nada se escribió.');
    return;
  }

  const { deriveClubAdminPointsPatch } = await import('@/lib/services/matchPointsSync');

  type Plan = {
    json: PartidoJson;
    fila: FilaPartido;
    score: { home: number; away: number };
    homeBase: number; awayBase: number;
    homeBonus: number; awayBonus: number;
    autocalculado: boolean;
  };
  const plan: Plan[] = [];

  for (const p of datos.partidos) {
    const { data: filaRaw, error } = await supabase
      .from('matches').select(SELECT_PARTIDO).eq('id', p.partido!).single();

    if (error || !filaRaw) {
      console.error(`\nNo existe el partido ${p.partido} (${p.local} vs ${p.visitante}).`, error);
      process.exit(1);
    }

    const fila = filaRaw as unknown as FilaPartido;

    if (!String(fila.date_time).startsWith(datos.fecha)) {
      console.error(
        `\n${p.local} vs ${p.visitante}: el partido ${fila.id} es del ${String(fila.date_time).slice(0, 10)}, no del ${datos.fecha}.`,
      );
      process.exit(1);
    }

    const score = { home: p.marcador.local, away: p.marcador.visitante };

    // Base y bonus DEFENSIVO con el ruleset del torneo. Sin eventos: el
    // ofensivo que salga de acá es cero por definición, y se suma aparte.
    const patch = await deriveClubAdminPointsPatch(supabase, fila.id, { status: 'final', score, events: [] });

    if (!patch) {
      console.error(
        `\n${p.local} vs ${p.visitante}: el partido tiene los puntos puestos a mano`
        + ' (points_autocalculated = false). No los piso: resolvelo en el Match Center.',
      );
      process.exit(1);
    }

    const ofensivo = new Set(p.bonusOfensivo ?? []);
    plan.push({
      json: p, fila, score,
      homeBase: patch.homeBasePoints, awayBase: patch.awayBasePoints,
      homeBonus: patch.homeBonusPoints + (ofensivo.has('local') ? puntosOfensivo : 0),
      awayBonus: patch.awayBonusPoints + (ofensivo.has('visitante') ? puntosOfensivo : 0),
      autocalculado: ofensivo.size === 0,
    });
  }

  console.log('\nPartidos resueltos:');
  for (const x of plan) {
    const declaradoL = tokens(x.json.local);
    const declaradoV = tokens(x.json.visitante);
    const slugL = tokens(x.fila.home_club_id ?? '');
    const slugV = tokens(x.fila.away_club_id ?? '');
    const pega = declaradoL.some((t) => slugL.includes(t)) && declaradoV.some((t) => slugV.includes(t));

    const sc = x.fila.score ?? {};
    console.log(
      `\n  ${x.json.local} vs ${x.json.visitante}  →  ${x.fila.home_club_id} vs ${x.fila.away_club_id}`
      + `${pega ? '' : '   ← OJO: los nombres no se parecen a los clubes del partido'}`,
    );
    console.log(
      `    ${sc.home ?? '-'}-${sc.away ?? '-'} (${x.fila.status ?? '—'})`
      + `  →  ${x.score.home}-${x.score.away} (final)`
      + ` · puntos ${x.homeBase}+${x.homeBonus} / ${x.awayBase}+${x.awayBonus}`
      + ` · ${x.autocalculado ? 'autocalculado' : 'ofensivo declarado'}`,
    );
  }

  if (!apply) {
    console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.');
    return;
  }

  // El estado anterior de los cuatro, antes de tocar nada. Acumulativo: repetir
  // --apply no puede pisar el original con lo ya escrito.
  const fsp = await import('node:fs/promises');
  const rollback = `ROLLBACK_${path.basename(archivo).replace(/\.json$/, '')}.json`;
  let previo: Array<{ id: string; antes: unknown }> = [];
  try { previo = JSON.parse(await fsp.readFile(rollback, 'utf8')); } catch { previo = []; }
  const yaGuardados = new Set(previo.map((x) => x.id));
  for (const x of plan) {
    if (yaGuardados.has(x.fila.id)) continue;
    previo.push({ id: x.fila.id, antes: {
      status: x.fila.status, score: x.fila.score,
      home_base_points: x.fila.home_base_points, away_base_points: x.fila.away_base_points,
      home_bonus_points: x.fila.home_bonus_points, away_bonus_points: x.fila.away_bonus_points,
      points_autocalculated: x.fila.points_autocalculated,
      points_override_reason: x.fila.points_override_reason,
    } });
  }
  await fsp.writeFile(rollback, JSON.stringify(previo, null, 2), 'utf8');
  console.log(`\n· estado anterior guardado en ${rollback}`);

  for (const x of plan) {
    const { error } = await supabase.from('matches').update({
      status: 'final',
      score: x.score,
      home_base_points: x.homeBase,
      away_base_points: x.awayBase,
      home_bonus_points: x.homeBonus,
      away_bonus_points: x.awayBonus,
      // Con un ofensivo declarado la cuenta ya no es la que el motor rehace
      // solo: si quedara en `true`, el primer recálculo con cero eventos le
      // borraría el bonus.
      points_autocalculated: x.autocalculado,
      points_override_reason: x.autocalculado ? null : (datos.motivo ?? datos.fuente ?? 'Carga por script'),
    }).eq('id', x.fila.id);

    if (error) {
      console.error(`Falló el update de ${x.fila.id} (${x.json.local} vs ${x.json.visitante}).`, error);
      process.exit(1);
    }
  }
  console.log(`· ${plan.length} partidos cargados`);

  // Un resultado final cambia la tabla. Una fase, una sola pasada.
  const fases = new Map<string, { torneo: string; fase: string; temporada: string | null }>();
  for (const x of plan) {
    if (x.fila.tournament_id && x.fila.phase_id) {
      fases.set(`${x.fila.tournament_id}|${x.fila.phase_id}`, {
        torneo: x.fila.tournament_id, fase: x.fila.phase_id, temporada: x.fila.season_id,
      });
    }
  }

  if (fases.size === 0) {
    console.log('· ningún partido tiene torneo/fase: no hay tabla que rehacer');
    return;
  }

  const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
  for (const f of fases.values()) {
    const r = await recalculatePhaseStandingsScopes(f.torneo, f.fase, 'general', f.temporada ?? undefined);
    console.log(`· tabla rehecha (${f.fase}): ${r.ok ? 'ok' : 'FALLÓ'} (${r.rows_calculated} filas)`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
