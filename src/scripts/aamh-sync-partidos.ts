/**
 * Carga de los partidos de la AAMH:
 *
 *   npx tsx src/scripts/aamh-sync-partidos.ts --plan
 *   npx tsx src/scripts/aamh-sync-partidos.ts --execute
 *   npx tsx src/scripts/aamh-sync-partidos.ts --anio 2025 --execute
 *
 * Por qué existe además del cron: la temporada 2026 tiene ~2842 partidos en 38
 * torneos. Eso no entra en los 60 segundos de una función de Vercel. El cron
 * `/api/cron/aamh-sync` es para el MANTENIMIENTO —los resultados del fin de
 * semana, una reprogramación— y este script para la CARGA, igual que en URBA.
 *
 * Los dos usan el mismo `planAamhMatches`, así que no pueden divergir: lo que
 * decide uno lo decide el otro. Lo único que cambia es el transporte (acá
 * PostgREST con la service role, allá el cliente de Supabase) y el presupuesto
 * de tiempo.
 *
 * No pide las fichas de partido: la hora exacta y la cancha las va completando
 * el cron sobre la ventana cercana. Acá los partidos entran con la hora de
 * relleno, que es lo único que publica el fixture.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchTorneo, pausa, PAUSA_MS, HTTP_FORMA_INESPERADA } from '../lib/integrations/aamh/client.ts';
import { parseTorneo } from '../lib/integrations/aamh/parser.ts';
import { planAamhMatches, type ExistenteAamh } from '../lib/integrations/aamh/planMatches.ts';
import { AAMH_PROVIDER, parseTournamentExternalId } from '../lib/integrations/aamh/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const EJECUTAR = process.argv.includes('--execute');
const ANIO = Number(process.argv[process.argv.indexOf('--anio') + 1]) || new Date().getUTCFullYear();

/** El género con el que se busca el alias del club, igual que en el cron. */
const ramaDe = (gender: string | null): string => (gender === 'masculino' ? 'caballeros' : 'damas');

interface TorneoDb {
  id: string;
  name: string;
  external_id: string;
  is_visible: boolean | null;
  current_season_id: string | null;
  gender: string | null;
}

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function escribir(recurso: string, metodo: 'PATCH' | 'POST', cuerpo: unknown): Promise<void> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`AAMH ${ANIO} — partidos — ${EJECUTAR ? 'EJECUTANDO' : 'plan'}\n`);

  const todos = await leer<TorneoDb[]>(
    'tournaments?external_id=like.aamh:*&select=id,name,external_id,is_visible,current_season_id,gender',
  );
  const objetivos = todos
    .map((row) => ({ row, clave: parseTournamentExternalId(row.external_id) }))
    .filter((x) => x.clave !== null && x.clave.anio === ANIO);
  if (!objetivos.length) {
    console.error(`Ningún torneo de la AAMH dado de alta para ${ANIO}. Correr aamh-crear-torneos.ts primero.`);
    process.exit(1);
  }
  console.log(`Torneos a sincronizar: ${objetivos.length}`);

  const alias = new Map(
    (await leer<{ external_id: string; club_id: string }[]>(
      `club_external_ids?provider=eq.${AAMH_PROVIDER}&select=external_id,club_id&limit=2000`,
    )).map((a) => [a.external_id, a.club_id]),
  );

  const errors: string[] = [];
  let totalCrear = 0;
  let totalActualizar = 0;
  let totalOmitidos = 0;
  let totalSinProgramar = 0;
  const fasesTocadas = new Set<string>();

  for (const { row: t, clave } of objetivos) {
    const r = await fetchTorneo(clave!.tid, clave!.cid);
    await pausa(PAUSA_MS);
    if (!r.ok || !r.data) {
      const detalle = r.status === HTTP_FORMA_INESPERADA ? 'forma inesperada' : `HTTP ${r.status}`;
      errors.push(`${t.external_id}: ${detalle}`);
      continue;
    }

    const pagina = parseTorneo(r.data);
    const ya = await leer<(ExistenteAamh & { is_visible: boolean | null; season_id: string | null })[]>(
      `matches?tournament_id=eq.${t.id}&select=id,external_id,home_club_id,away_club_id,date_time,status,score,phase_id,is_visible,season_id,round_label&limit=3000`,
    );

    const rama = ramaDe(t.gender);
    const plan = planAamhMatches({
      anio: clave!.anio,
      ruedas: pagina.ruedas,
      resolverClub: (c) => alias.get(`${rama}|${c}`) ?? null,
      existentes: ya,
    });

    totalCrear += plan.crear.length;
    totalActualizar += plan.actualizar.length;
    // `sin_programar` es lo NORMAL en un fixture a medio publicar: se cuenta
    // aparte para que no tape a una omision que si hay que mirar.
    const sinProgramar = plan.omitidos.filter((o) => o.motivo === 'sin_programar');
    const problemas = plan.omitidos.filter((o) => o.motivo !== 'sin_programar');
    totalSinProgramar += sinProgramar.length;
    totalOmitidos += problemas.length;

    const unicos = [...new Map(problemas.map((o) => [`${o.motivo}|${o.detalle}`, o])).values()];
    console.log(
      `  ${t.name}: crear ${plan.crear.length}, actualizar ${plan.actualizar.length}, ` +
      `sin cambios ${plan.sinCambios}` +
      `${sinProgramar.length ? `, sin fecha aun ${sinProgramar.length}` : ''}` +
      `${unicos.length ? `, OMITIDOS ${unicos.length}` : ''}`,
    );
    for (const o of unicos.slice(0, 5)) console.log(`      ! ${o.motivo}: ${o.detalle}`);

    if (!EJECUTAR) continue;

    // La fase y la temporada del torneo, para colgar de ahí lo que se cree.
    let fase = ya.find((m) => m.phase_id)?.phase_id ?? null;
    if (!fase) {
      const fases = await leer<{ id: string }[]>(
        `tournament_phases?tournament_id=eq.${t.id}&select=id&order=order_index.asc&limit=1`,
      );
      fase = fases[0]?.id ?? null;
    }
    const season = ya.find((m) => m.season_id)?.season_id ?? t.current_season_id ?? null;
    const visible = ya.length ? ya.some((m) => m.is_visible === true) : t.is_visible === true;

    // Participantes: sin las TRES filas el club no aparece en la tabla.
    const partsYa = new Set(
      (await leer<{ club_id: string }[]>(`tournament_participants?tournament_id=eq.${t.id}&select=club_id&limit=2000`))
        .map((p) => p.club_id),
    );
    const faltan = [...plan.clubesInvolucrados].filter((c) => !partsYa.has(c));
    if (faltan.length) {
      const nombres = new Map(
        (await leer<{ id: string; name: string }[]>(`clubs?id=in.(${faltan.join(',')})&select=id,name`))
          .map((c) => [c.id, c.name]),
      );
      for (const clubId of faltan) {
        const participantId = crypto.randomUUID();
        try {
          await escribir('tournament_participants', 'POST', [{
            id: participantId, tournament_id: t.id, season_id: season,
            club_id: clubId, name: nombres.get(clubId) ?? clubId, type: 'club', status: 'active',
          }]);
          if (season) {
            const entryId = crypto.randomUUID();
            await escribir('team_season_entries', 'POST', [{
              id: entryId, season_id: season, tournament_id: t.id, club_id: clubId, team_id: null,
              source_participant_id: participantId, status: 'active', settings: { source: 'aamh-sync-partidos' },
            }]);
            await escribir(`tournament_participants?id=eq.${participantId}`, 'PATCH', { season_entry_id: entryId });
          }
          if (fase) {
            await escribir('tournament_phase_participants', 'POST', [{
              id: crypto.randomUUID(), tournament_id: t.id, season_id: season,
              phase_id: fase, participant_id: participantId, group_id: null, status: 'active',
            }]);
          }
        } catch (e) {
          errors.push(`${t.external_id}: no se pudo inscribir a ${clubId} (${e instanceof Error ? e.message : e})`);
        }
      }
      console.log(`      + ${faltan.length} participantes`);
    }

    // Altas en tandas: 2842 filas de a una son 2842 viajes.
    const altas = plan.crear.map((a) => ({
      ...a, tournament_id: t.id, sport_id: 'field-hockey',
      is_visible: visible, phase_id: fase, season_id: season,
    }));
    for (let i = 0; i < altas.length; i += 200) {
      try {
        await escribir('matches', 'POST', altas.slice(i, i + 200));
      } catch (e) {
        errors.push(`${t.external_id}: alta de partidos falló (${e instanceof Error ? e.message : e})`);
      }
    }

    for (const cambio of plan.actualizar) {
      try {
        await escribir(`matches?id=eq.${cambio.id}`, 'PATCH', cambio.patch);
      } catch (e) {
        errors.push(`${t.external_id} ${cambio.id}: update falló (${e instanceof Error ? e.message : e})`);
      }
    }

    if (fase && (plan.crear.length || plan.actualizar.length)) fasesTocadas.add(fase);
  }

  console.log(`\nTOTAL — crear ${totalCrear}, actualizar ${totalActualizar}, omitidos ${totalOmitidos}`);
  if (errors.length) {
    console.log(`\nErrores (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  ! ${e}`);
  }

  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  console.log(`\nFases con partidos nuevos: ${fasesTocadas.size}.`);
  console.log('La tabla de posiciones es PERSISTIDA: recalculala desde el gestor de cada');
  console.log('torneo, o dejá que el cron lo haga en su próxima corrida.');
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
