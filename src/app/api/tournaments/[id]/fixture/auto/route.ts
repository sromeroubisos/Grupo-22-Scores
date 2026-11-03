import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso, toInputDateInTimeZone, toInputTimeInTimeZone } from '@/lib/timezone';
import { escapePostgrestLike } from '@/lib/utils/postgrest';
import {
  placeInSlots,
  planRounds,
  validateSlotConfig,
  type BusySlot,
  type PairingScope,
  type SlotConfig,
} from '@/lib/fixture/autoFixture';

type BusyRow = { phase_id: string | null; group_id: string | null; status: string | null; date_time: string | null; venue: string | null };

/**
 * Los partidos del torneo con fecha desde `fromDate` (local): ocupan horario y
 * cancha. Los cancelados no ocupan nada. PostgREST corta en 1000 filas: se pagina.
 */
async function loadTournamentBusy(db: any, tournamentId: string, fromDate: string | null): Promise<BusyRow[]> {
  const from = fromDate ? combineLocalDateTimeToUtcIso(fromDate, '00:00', APP_TIMEZONE) : null;
  const rows: BusyRow[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    let query = db
      .from('matches')
      .select('phase_id, group_id, status, date_time, venue')
      .eq('tournament_id', tournamentId)
      .not('date_time', 'is', null)
      .order('date_time', { ascending: true })
      .range(offset, offset + 999);
    if (from) query = query.gte('date_time', from);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as BusyRow[]));
    if ((data ?? []).length < 1000) break;
  }
  // Las sedes del torneo las comparten otros torneos: sus partidos ahí también ocupan cancha.
  const { data: links } = await db
    .from('tournament_venues')
    .select('venues(name)')
    .eq('tournament_id', tournamentId);
  for (const name of ((links ?? []) as Array<{ venues: { name: string } | null }>).map((l) => l.venues?.name).filter(Boolean) as string[]) {
    let query = db
      .from('matches')
      .select('phase_id, group_id, status, date_time, venue')
      .neq('tournament_id', tournamentId)
      .ilike('venue', `${escapePostgrestLike(name)}%`)
      .not('date_time', 'is', null)
      .limit(1000);
    if (from) query = query.gte('date_time', from);
    const { data } = await query;
    rows.push(...((data ?? []) as BusyRow[]));
  }
  return rows.filter((r) => r.status !== 'cancelled');
}

function toBusySlot(row: BusyRow): BusySlot {
  return {
    date: toInputDateInTimeZone(row.date_time, APP_TIMEZONE),
    time: toInputTimeInTimeZone(row.date_time, APP_TIMEZONE),
    venue: row.venue ?? null,
  };
}

export const dynamic = 'force-dynamic';

type AutoFixtureBody = {
  phaseId?: string;
  /** `preview` no escribe nada; `commit` guarda. */
  mode?: 'preview' | 'commit';
  teams?: Array<{ id: string; groupId?: string | null }>;
  scope?: PairingScope;
  legs?: number;
  seed?: number;
  slots?: Partial<SlotConfig>;
  /** Borra antes los partidos sin jugar de la fase (o solo los de `groupIds`). */
  replace?: boolean;
  /**
   * Generar solo para estas zonas (con `within_groups`). Las demás no se tocan:
   * no se borran sus partidos y las fechas existentes se reusan por número, así
   * una zona que se suma después juega su Fecha 1 en la Fecha 1 del torneo.
   */
  groupIds?: string[];
};

const SCOPES: PairingScope[] = ['within_groups', 'between_groups', 'all'];

/** Cuántos partidos tiene ya cada zona de la fase: el generador lo usa para proponer las zonas vacías. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);
    const phaseId = request.nextUrl.searchParams.get('phaseId');
    if (!phaseId) return NextResponse.json({ error: 'Falta la fase.' }, { status: 400 });

    const { data, error } = await db
      .from('matches')
      .select('group_id, status')
      .eq('tournament_id', tournamentId)
      .eq('phase_id', phaseId);
    if (error) throw error;

    const byGroup = new Map<string | null, { groupId: string | null; scheduled: number; played: number }>();
    for (const m of (data ?? []) as Array<{ group_id: string | null; status: string | null }>) {
      const key = m.group_id ?? null;
      const entry = byGroup.get(key) ?? { groupId: key, scheduled: 0, played: 0 };
      if (m.status === 'scheduled') entry.scheduled += 1; else entry.played += 1;
      byGroup.set(key, entry);
    }
    // Lo que ya ocupa el calendario del torneo, para que la vista previa no pise
    // nada. Lleva fase, zona y estado: el asistente descarta lo que va a reemplazar.
    const busy = (await loadTournamentBusy(db, tournamentId, request.nextUrl.searchParams.get('from')))
      .map((row) => ({ ...toBusySlot(row), phaseId: row.phase_id, groupId: row.group_id, status: row.status }));
    return NextResponse.json({ ok: true, groups: Array.from(byGroup.values()), busy });
  } catch (error: unknown) {
    console.error('Error in GET /api/tournaments/[id]/fixture/auto:', error);
    return tournamentApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);
    const body = (await request.json()) as AutoFixtureBody;

    const scope = SCOPES.includes(body.scope as PairingScope) ? (body.scope as PairingScope) : 'all';
    const onlyGroups = scope === 'within_groups' && Array.isArray(body.groupIds)
      ? Array.from(new Set(body.groupIds.filter((g): g is string => typeof g === 'string' && g.length > 0)))
      : [];
    const teams = (body.teams ?? [])
      .filter((t) => t && typeof t.id === 'string' && t.id)
      .filter((t) => onlyGroups.length === 0 || (t.groupId != null && onlyGroups.includes(t.groupId)));
    if (!body.phaseId) return NextResponse.json({ error: 'Falta la fase.' }, { status: 400 });
    if (teams.length < 2) return NextResponse.json({ error: 'Se necesitan al menos 2 equipos.' }, { status: 400 });

    const slots: SlotConfig = {
      startDate: String(body.slots?.startDate ?? ''),
      weekdays: Array.isArray(body.slots?.weekdays) ? body.slots!.weekdays!.map(Number) : [],
      windowStart: String(body.slots?.windowStart ?? ''),
      windowEnd: String(body.slots?.windowEnd ?? ''),
      durationMin: Number(body.slots?.durationMin ?? 0),
      gapMin: Number(body.slots?.gapMin ?? 0),
      venues: Array.isArray(body.slots?.venues) ? body.slots!.venues!.map(String) : [],
      skipDates: Array.isArray(body.slots?.skipDates) ? body.slots!.skipDates!.map(String) : [],
      endDate: body.slots?.endDate ? String(body.slots.endDate) : null,
      seed: typeof body.seed === 'number' ? body.seed : undefined,
      simultaneous: body.slots?.simultaneous === 'last_round' || body.slots?.simultaneous === 'all_rounds' ? body.slots.simultaneous : 'none',
      fieldsPerVenue: Math.max(1, Math.min(50, Math.floor(Number(body.slots?.fieldsPerVenue ?? 1)) || 1)),
    };
    const problems = validateSlotConfig(slots);
    if (problems.length > 0) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

    const rounds = planRounds({ teams, scope, legs: Number(body.legs ?? 1), seed: slots.seed });
    if (rounds.length === 0) {
      return NextResponse.json(
        { error: scope === 'between_groups' ? 'Para cruzar zonas hacen falta al menos dos zonas con equipos.' : 'No hay cruces para generar.' },
        { status: 400 },
      );
    }
    if (body.mode !== 'commit') {
      // La vista previa la arma el asistente con el `busy` del GET.
      return NextResponse.json({ ok: true, rounds, placement: placeInSlots(rounds, slots) });
    }

    const { data: phase } = await db
      .from('tournament_phases')
      .select('id, season_id')
      .eq('id', body.phaseId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (!phase) return NextResponse.json({ error: 'La fase no pertenece al torneo.' }, { status: 400 });
    const seasonId = phase.season_id ?? null;

    // Lo que queda en el calendario no se pisa. Se calcula ANTES de borrar,
    // descartando lo que se va a reemplazar: si no hay lugar, no se pierde nada.
    const replaced = (row: BusyRow) => Boolean(body.replace)
      && row.phase_id === body.phaseId
      && row.status === 'scheduled'
      && (onlyGroups.length === 0 || (row.group_id !== null && onlyGroups.includes(row.group_id)));
    const busy = (await loadTournamentBusy(db, tournamentId, slots.startDate)).filter((row) => !replaced(row)).map(toBusySlot);
    const placement = placeInSlots(rounds, { ...slots, busy });
    if (placement.placed.length !== rounds.reduce((s, r) => s + r.matches.length, 0)) {
      return NextResponse.json({ error: 'No hay horarios libres para todos los partidos: sumá canchas o días.' }, { status: 400 });
    }

    if (body.replace && onlyGroups.length > 0) {
      // Solo las zonas elegidas. Las fechas quedan: se reusan abajo por número.
      const { error: delMatches } = await db
        .from('matches')
        .delete()
        .eq('phase_id', body.phaseId)
        .eq('status', 'scheduled')
        .in('group_id', onlyGroups);
      if (delMatches) throw delMatches;
    } else if (body.replace) {
      const { error: delMatches } = await db
        .from('matches')
        .delete()
        .eq('phase_id', body.phaseId)
        .eq('status', 'scheduled');
      if (delMatches) throw delMatches;
      const { data: leftover } = await db.from('matches').select('round_uuid').eq('phase_id', body.phaseId);
      const used = new Set((leftover ?? []).map((m: { round_uuid: string | null }) => m.round_uuid).filter(Boolean));
      const { data: oldRounds } = await db.from('tournament_rounds').select('id').eq('phase_id', body.phaseId);
      const empty = (oldRounds ?? []).map((r: { id: string }) => r.id).filter((id: string) => !used.has(id));
      if (empty.length > 0) await db.from('tournament_rounds').delete().in('id', empty);
    }

    const { data: phaseRounds } = await db
      .from('tournament_rounds')
      .select('id, order_index')
      .eq('phase_id', body.phaseId);
    // Generando para todas, las fechas nuevas van después de las que haya. Para
    // algunas zonas, la Fecha N de la zona cae en la Fecha N que ya existe.
    const offset = onlyGroups.length > 0 ? 0 : (phaseRounds ?? []).length;
    const existingByOrder = new Map<number, string>();
    if (onlyGroups.length > 0) {
      for (const r of (phaseRounds ?? []) as Array<{ id: string; order_index: number | null }>) {
        if (typeof r.order_index === 'number' && !existingByOrder.has(r.order_index)) existingByOrder.set(r.order_index, r.id);
      }
    }

    const roundIds = new Map<number, string>();
    for (const round of rounds) {
      const reused = existingByOrder.get(round.number);
      if (reused) {
        roundIds.set(round.number, reused);
        continue;
      }
      const { data, error } = await db
        .from('tournament_rounds')
        .insert({
          phase_id: body.phaseId,
          season_id: seasonId,
          name: `Fecha ${offset + round.number}`,
          order_index: offset + round.number,
        })
        .select('id')
        .single();
      if (error) throw error;
      roundIds.set(round.number, data.id);
    }

    const rows = placement.placed.map((p) => {
      const dateTime = combineLocalDateTimeToUtcIso(p.date, p.time, APP_TIMEZONE);
      if (!dateTime) throw new Error('No se pudo construir la fecha de uno de los partidos.');
      return {
        tournament_id: tournamentId,
        season_id: seasonId,
        phase_id: body.phaseId,
        round_uuid: roundIds.get(p.roundNumber),
        group_id: p.groupId,
        home_club_id: p.homeId,
        away_club_id: p.awayId,
        date_time: dateTime,
        venue: p.venue ?? '',
        status: 'scheduled',
        score: { home: 0, away: 0 },
      };
    });
    const { data: inserted, error: insertError } = await db.from('matches').insert(rows).select('id');
    if (insertError) throw insertError;
    if ((inserted ?? []).length !== rows.length) throw new Error('No se pudieron guardar todos los partidos.');

    try {
      await invalidateMatchesFeedCaches(db);
    } catch (error) {
      console.error('[fixture/auto] no se pudo invalidar el feed:', error);
    }

    return NextResponse.json({ ok: true, rounds: rounds.length, matches: rows.length, placement });
  } catch (error: unknown) {
    console.error('Error in POST /api/tournaments/[id]/fixture/auto:', error);
    return tournamentApiErrorResponse(error);
  }
}
