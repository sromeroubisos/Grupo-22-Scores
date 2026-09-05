/**
 * Carga la formación de un partido NUESTRO —el que vive en `matches`— desde un
 * JSON igual al de `formaciones-partido-externo.ts`.
 *
 *   npx tsx src/scripts/formaciones-partido-local.ts src/scripts/formaciones/<archivo>.json
 *   npx tsx src/scripts/formaciones-partido-local.ts src/scripts/formaciones/<archivo>.json --partido=<uuid> --apply
 *
 * Va aparte del script de partido externo porque el destino es otro y no hay
 * forma de equivocarse a medias: aquel escribe el override de
 * `external_match_lineup_overrides` porque el partido lo sirve el proveedor y no
 * tenemos fila propia; este escribe `matches.lineups`, que es de donde la vista
 * pública lee la formación de un partido cargado por nosotros. Correr el
 * externo sobre un partido nuestro deja la formación colgada de una tabla que
 * esa vista no mira.
 *
 * El PUESTO no se declara: en rugby lo dice el número, y la traducción es la de
 * `lib/server/lineupPayload.ts` —la misma que usa `POST /api/results/lineups`—
 * para que cargar por script y cargar por API no puedan diferir.
 *
 * EL PARTIDO NO SE ADIVINA. Sin `--partido=<uuid>` el script no escribe: lista
 * los partidos de la fecha con su id y sus clubes para que el uuid lo elija una
 * persona. Resolver el cruce por nombre es justo lo que deja formaciones
 * colgadas del partido equivocado —hay clubes homónimos y filiales que se
 * llaman casi igual—, y despegarlas después es peor que no haberlas cargado.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const REPO = process.cwd();

type LadoJson = { nombre?: string };
type Datos = { fecha?: string; descripcion?: string; local: LadoJson; visitante: LadoJson };

type FilaPartido = {
  id: string;
  date_time: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  status: string | null;
  lineups: { home?: unknown[]; away?: unknown[] } | null;
};

async function main() {
  const argumentos = process.argv.slice(2);
  const archivo = argumentos.find((a) => !a.startsWith('--'));
  const apply = argumentos.includes('--apply');
  const partidoId = (argumentos.find((a) => a.startsWith('--partido='))?.split('=')[1] ?? '').trim();

  if (!archivo) {
    console.error('uso: formaciones-partido-local.ts <datos.json> [--partido=<uuid>] [--apply]');
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
      .select('id, date_time, home_club_id, away_club_id, status, lineups')
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
      console.log(
        `  ${fila.id} · ${fila.home_club_id ?? '—'} vs ${fila.away_club_id ?? '—'}` +
        ` · ${String(fila.date_time).slice(11, 16)} · ${fila.status ?? '—'}` +
        (cargados ? ` · YA TIENE ${cargados} jugadores cargados` : ''),
      );
    }
    console.log('\nNada se escribió. Repetí con --partido=<uuid> --apply.');
    return;
  }

  const { data: filaRaw, error } = await supabase
    .from('matches')
    .select('id, date_time, home_club_id, away_club_id, status, lineups')
    .eq('id', partidoId)
    .single();

  if (error || !filaRaw) {
    console.error(`\nNo existe el partido ${partidoId}.`, error);
    process.exit(1);
  }

  const fila = filaRaw as unknown as FilaPartido;
  const yaCargados = (fila.lineups?.home?.length ?? 0) + (fila.lineups?.away?.length ?? 0);

  console.log(`\npartido ${fila.id} · ${fila.home_club_id ?? '—'} vs ${fila.away_club_id ?? '—'} · ${String(fila.date_time).slice(0, 16)} · ${fila.status ?? '—'}`);
  if (datos.fecha && !String(fila.date_time).startsWith(datos.fecha)) {
    console.error(`El partido no es del ${datos.fecha} sino del ${String(fila.date_time).slice(0, 10)}.`);
    process.exit(1);
  }
  if (yaCargados) {
    console.log(`  OJO: ya tiene ${yaCargados} jugadores cargados. El lado que mandes se reemplaza entero.`);
  }

  if (!apply) {
    console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.');
    return;
  }

  const { persistMatchCenterSupplementalData } = await import('@/lib/services/matchCenterService');

  // El lado que no vino NO se manda: mandarlo vacío lo borraría.
  const guardado = await persistMatchCenterSupplementalData(supabase, fila.id, {
    lineups: { ...(home ? { home } : {}), ...(away ? { away } : {}) },
  });

  if (!guardado.persistedLineups) {
    console.error('\nEl partido existe pero la formación no se pudo guardar.');
    process.exit(1);
  }

  console.log(`\nguardado · ${home ? `${home.length} local` : 'local intacto'} · ${away ? `${away.length} visitante` : 'visitante intacto'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
