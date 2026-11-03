import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso, toInputDateInTimeZone, toInputTimeInTimeZone } from '@/lib/timezone';
import { escapePostgrestLike } from '@/lib/utils/postgrest';
import {
  interleaveRounds,
  placeInSlots,
  planRounds,
  validateSlotConfig,
  type BusySlot,
  type FixtureTeam,
  type PlannedRound,
  type SlotConfig,
} from '@/lib/fixture/autoFixture';

export const dynamic = 'force-dynamic';

/**
 * Jornada compartida: varios torneos en la misma sede, el mismo día (el Seven
 * de Olivos: Mayores, M19 y Gordos). Arma el fixture de todos juntos,
 * intercalando de a un partido por torneo en el orden dado, sin pisar ningún
 * partido que ya esté en esa sede, con descanso para cada equipo.
 *
 * `mode: 'preview'` no escribe nada. `commit` guarda los partidos de cada
 * torneo en su fase, y deja la sede asignada a todos.
 */

type Entry = { tournamentId: string; phaseId: string };
type Body = {
  mode?: 'preview' | 'commit';
  venue?: { name?: string; fieldsCount?: number };
  entries?: Entry[];
  legs?: number;
  replace?: boolean;
  slots?: Partial<SlotConfig>;
};
type MatchRow = { id: string; phase_id: string | null; status: string | null; date_time: string | null; venue: string | null };

const clampFields = (value: unknown) => Math.max(1, Math.min(50, Math.floor(Number(value)) || 1));

async function loadPhaseTeams(db: any, entry: Entry) {
  const { data: phase } = await db
    .from('tournament_phases')
    .select('id, name, season_id, tournament_id, tournaments(name)')
    .eq('id', entry.phaseId)
    .eq('tournament_id', entry.tournamentId)
    .maybeSingle();
  if (!phase) return null;

  const { data: participants } = await db
    .from('tournament_participants')
    .select('id, club_id, name')
    .eq('tournament_id', entry.tournamentId);
  const byParticipant = new Map<string, { club_id: string | null; name: string }>(
    ((participants ?? []) as Array<{ id: string; club_id: string | null; name: string }>).map((p) => [p.id, p]),
  );

  // Quién está en la fase y en qué zona. Sin asignaciones, entran todos (como el generador de una fase).
  const { data: assignments } = await db
    .from('tournament_phase_participants')
    .select('participant_id, group_id')
    .eq('phase_id', entry.phaseId);
  const rows = (assignments ?? []) as Array<{ participant_id: string; group_id: string | null }>;
  const source = rows.length > 0
    ? rows.map((r) => ({ p: byParticipant.get(r.participant_id), groupId: r.group_id }))
    : [...byParticipant.values()].map((p) => ({ p, groupId: null as string | null }));
  const teams: Array<FixtureTeam & { name: string }> = [];
  const seen = new Set<string>();
  for (const { p, groupId } of source) {
    if (!p?.club_id || seen.has(p.club_id)) continue;
    seen.add(p.club_id);
    teams.push({ id: p.club_id, groupId, name: p.name });
  }
  teams.sort((a, b) => a.id.localeCompare(b.id));

  return {
    phase: phase as { id: string; name: string; season_id: string | null; tournament_id: string; tournaments: { name: string } | null },
    teams,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);
    const body = (await request.json().catch(() => ({}))) as Body;

    const venueName = typeof body.venue?.name === 'string' ? body.venue.name.trim().replace(/\s+/g, ' ') : '';
    if (!venueName) return NextResponse.json({ error: 'Elegí o creá la sede.' }, { status: 400 });
    const fields = clampFields(body.venue?.fieldsCount ?? 1);

    const entries = (Array.isArray(body.entries) ? body.entries : [])
      .filter((e): e is Entry => Boolean(e && typeof e.tournamentId === 'string' && typeof e.phaseId === 'string'));
    if (entries.length < 1) return NextResponse.json({ error: 'Elegí al menos un torneo.' }, { status: 400 });
    if (new Set(entries.map((e) => e.phaseId)).size !== entries.length) {
      return NextResponse.json({ error: 'Una misma fase está dos veces.' }, { status: 400 });
    }
    // Cada torneo tiene que poder editarlo quien genera.
    for (const e of entries) if (e.tournamentId !== tournamentId) await requireTournamentMutationContext(e.tournamentId);

    const loaded: Array<NonNullable<Awaited<ReturnType<typeof loadPhaseTeams>>>> = [];
    for (const e of entries) {
      const l = await loadPhaseTeams(db, e);
      if (!l) return NextResponse.json({ error: 'Una de las fases no pertenece a su torneo.' }, { status: 400 });
      loaded.push(l);
    }

    const legs = Number(body.legs ?? 1);
    const lists: Array<{ tag: string; rounds: PlannedRound[] }> = loaded.map((l, i) => {
      const zones = new Set(l.teams.map((t) => t.groupId).filter(Boolean)).size;
      return { tag: String(i), rounds: planRounds({ teams: l.teams, scope: zones >= 2 ? 'within_groups' : 'all', legs }) };
    });
    const merged = interleaveRounds(lists);
    const total = merged.reduce((s, r) => s + r.matches.length, 0);
    if (total === 0) return NextResponse.json({ error: 'Ningún torneo tiene al menos dos equipos para cruzar.' }, { status: 400 });

    const slots: SlotConfig = {
      startDate: String(body.slots?.startDate ?? ''),
      // Un seven se juega en el día elegido; si no entra, sigue al día siguiente.
      weekdays: Array.isArray(body.slots?.weekdays) && body.slots!.weekdays!.length > 0 ? body.slots!.weekdays!.map(Number) : [0, 1, 2, 3, 4, 5, 6],
      windowStart: String(body.slots?.windowStart ?? ''),
      windowEnd: String(body.slots?.windowEnd ?? ''),
      durationMin: Number(body.slots?.durationMin ?? 0),
      gapMin: Number(body.slots?.gapMin ?? 0),
      restMin: Math.max(0, Number(body.slots?.restMin ?? 0) || 0),
      venues: [venueName],
      fieldsPerVenue: fields,
      sameDay: true,
    };
    const problems = validateSlotConfig(slots);
    if (problems.length > 0) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

    // Lo ocupado: lo que ya hay en esta sede (de cualquier torneo) y lo de los
    // torneos de la jornada (aunque no tenga cancha cargada), menos lo que se reemplaza.
    const from = combineLocalDateTimeToUtcIso(slots.startDate, '00:00', APP_TIMEZONE);
    const entryTournamentIds = Array.from(new Set(entries.map((e) => e.tournamentId)));
    const entryPhaseIds = new Set(entries.map((e) => e.phaseId));
    let venueQuery = db.from('matches').select('id, phase_id, status, date_time, venue')
      .ilike('venue', `${escapePostgrestLike(venueName)}%`).limit(1000);
    let entriesQuery = db.from('matches').select('id, phase_id, status, date_time, venue')
      .in('tournament_id', entryTournamentIds).not('date_time', 'is', null).limit(1000);
    if (from) {
      venueQuery = venueQuery.gte('date_time', from);
      entriesQuery = entriesQuery.gte('date_time', from);
    }
    const [{ data: atVenue }, { data: ofEntries }] = await Promise.all([venueQuery, entriesQuery]);
    const byId = new Map<string, MatchRow>();
    for (const m of [...(atVenue ?? []), ...(ofEntries ?? [])] as MatchRow[]) byId.set(m.id, m);
    const replaced = (m: MatchRow) => Boolean(body.replace) && m.phase_id !== null && entryPhaseIds.has(m.phase_id) && m.status === 'scheduled';
    const busy: BusySlot[] = [...byId.values()]
      .filter((m) => m.date_time && m.status !== 'cancelled' && !replaced(m))
      .map((m) => ({ date: toInputDateInTimeZone(m.date_time, APP_TIMEZONE), time: toInputTimeInTimeZone(m.date_time, APP_TIMEZONE), venue: m.venue }));

    const placement = placeInSlots(merged, { ...slots, busy });
    const summary = loaded.map((l, i) => ({
      tag: String(i),
      tournamentId: l.phase.tournament_id,
      tournamentName: l.phase.tournaments?.name ?? 'Torneo',
      phaseId: l.phase.id,
      phaseName: l.phase.name,
      teams: l.teams.map((t) => ({ id: t.id, name: t.name })),
      matches: merged.reduce((s, r) => s + r.matches.filter((m) => m.tag === String(i)).length, 0),
    }));

    if (body.mode !== 'commit') {
      return NextResponse.json({ ok: true, placement, entries: summary, busy: busy.length });
    }
    if (placement.placed.length !== total) {
      return NextResponse.json({ error: 'No hay horarios libres para todos los partidos: sumá canchas o ampliá el horario.' }, { status: 400 });
    }

    // La sede queda guardada y asignada a todos los torneos de la jornada.
    const { data: existingVenue } = await db.from('venues').select('id, fields_count').ilike('name', escapePostgrestLike(venueName)).limit(1);
    let venueId = (existingVenue ?? [])[0]?.id as string | undefined;
    if (!venueId) {
      const { data: created, error } = await db.from('venues').insert({ name: venueName, fields_count: fields }).select('id').single();
      if (error) throw error;
      venueId = created.id as string;
    } else if ((existingVenue ?? [])[0]?.fields_count !== fields) {
      await db.from('venues').update({ fields_count: fields, updated_at: new Date().toISOString() }).eq('id', venueId);
    }
    await db.from('tournament_venues').upsert(
      entryTournamentIds.map((t) => ({ tournament_id: t, venue_id: venueId })),
      { onConflict: 'tournament_id,venue_id', ignoreDuplicates: true },
    );

    let inserted = 0;
    for (const [i, l] of loaded.entries()) {
      const tag = String(i);
      const mine = placement.placed.filter((p) => p.tag === tag);
      if (body.replace) {
        const { error } = await db.from('matches').delete().eq('phase_id', l.phase.id).eq('status', 'scheduled');
        if (error) throw error;
        const { data: leftover } = await db.from('matches').select('round_uuid').eq('phase_id', l.phase.id);
        const used = new Set((leftover ?? []).map((m: { round_uuid: string | null }) => m.round_uuid).filter(Boolean));
        const { data: oldRounds } = await db.from('tournament_rounds').select('id').eq('phase_id', l.phase.id);
        const empty = (oldRounds ?? []).map((r: { id: string }) => r.id).filter((id: string) => !used.has(id));
        if (empty.length > 0) await db.from('tournament_rounds').delete().in('id', empty);
      }
      if (mine.length === 0) continue;

      const { count } = await db.from('tournament_rounds').select('id', { count: 'exact', head: true }).eq('phase_id', l.phase.id);
      const offset = count ?? 0;
      const roundIds = new Map<number, string>();
      for (const n of Array.from(new Set(mine.map((p) => p.roundNumber))).sort((a, b) => a - b)) {
        const { data, error } = await db
          .from('tournament_rounds')
          .insert({ phase_id: l.phase.id, season_id: l.phase.season_id, name: `Fecha ${offset + n}`, order_index: offset + n })
          .select('id')
          .single();
        if (error) throw error;
        roundIds.set(n, data.id);
      }

      const rows = mine.map((p) => {
        const dateTime = combineLocalDateTimeToUtcIso(p.date, p.time, APP_TIMEZONE);
        if (!dateTime) throw new Error('No se pudo construir la fecha de uno de los partidos.');
        return {
          tournament_id: l.phase.tournament_id,
          season_id: l.phase.season_id,
          phase_id: l.phase.id,
          round_uuid: roundIds.get(p.roundNumber),
          group_id: p.groupId,
          home_club_id: p.homeId,
          away_club_id: p.awayId,
          date_time: dateTime,
          venue: p.venue ?? venueName,
          status: 'scheduled',
          score: { home: 0, away: 0 },
        };
      });
      const { data: saved, error } = await db.from('matches').insert(rows).select('id');
      if (error) throw error;
      inserted += (saved ?? []).length;
    }

    try {
      await invalidateMatchesFeedCaches(db);
    } catch (error) {
      console.error('[fixture/shared] no se pudo invalidar el feed:', error);
    }
    return NextResponse.json({ ok: true, matches: inserted, entries: summary, lastDate: placement.lastDate });
  } catch (error: unknown) {
    console.error('Error in POST /api/tournaments/[id]/fixture/shared:', error);
    return tournamentApiErrorResponse(error);
  }
}
