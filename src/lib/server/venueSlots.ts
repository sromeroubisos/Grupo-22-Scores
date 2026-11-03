/**
 * Cancha de un partido en una sede compartida.
 *
 * Si el torneo juega en una sede con canchas ("Olivos", 2 canchas):
 *  - un partido sin cancha (vacía, "A DEFINIR" o solo el nombre de la sede)
 *    va a la primera cancha libre a esa hora — la Cancha 1 si está libre;
 *  - dos partidos no pueden estar en la misma cancha a la misma hora, aunque
 *    sean de torneos distintos (Mayores, M19 y Gordos comparten Olivos).
 *
 * Sin sede asignada no hace nada: el partido se guarda como venía.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_TIMEZONE, toInputTimeInTimeZone } from '@/lib/timezone';
import { escapePostgrestLike } from '@/lib/utils/postgrest';
import { isSevensTournament } from '@/lib/utils/rugbyModality';

type Supa = SupabaseClient<any, any, any>;

const PLACEHOLDER_VENUES = new Set(['', 'a definir', 'a confirmar', 'por definir', 'tbd', 'tba']);

/** Las canchas de una sede, como se escriben en `matches.venue`. */
export function venueLanes(name: string, fields: number): string[] {
  return fields <= 1 ? [name] : Array.from({ length: fields }, (_, i) => `${name} · Cancha ${i + 1}`);
}

/** `ok: false` trae `error` para mostrar; `ok: true` puede traer la cancha asignada. */
export type VenueSlotResult = { ok: boolean; venue?: string; error?: string };

export async function assignVenueSlot(
  db: Supa,
  params: { tournamentId: string; dateTime: string | null | undefined; venue: string | null | undefined; matchId?: string | null },
): Promise<VenueSlotResult> {
  const { tournamentId, matchId } = params;
  const start = params.dateTime ? new Date(params.dateTime).getTime() : NaN;
  if (!Number.isFinite(start)) return { ok: true };

  const { data: links } = await db
    .from('tournament_venues')
    .select('venues(id, name, fields_count)')
    .eq('tournament_id', tournamentId);
  const sedes = ((links ?? []) as unknown as Array<{ venues: { id: string; name: string; fields_count: number } | null }>)
    .map((l) => l.venues)
    .filter((v): v is { id: string; name: string; fields_count: number } => Boolean(v));
  if (sedes.length === 0) return { ok: true };

  const given = (params.venue ?? '').trim();
  const givenLower = given.toLowerCase();
  // ¿En qué sede y en qué cancha? Sin dato y con una sola sede, es esa.
  let sede = sedes.find((s) => venueLanes(s.name, s.fields_count).some((l) => l.toLowerCase() === givenLower))
    ?? sedes.find((s) => s.name.toLowerCase() === givenLower)
    ?? null;
  if (!sede && PLACEHOLDER_VENUES.has(givenLower) && sedes.length === 1) sede = sedes[0];
  if (!sede) return { ok: true };

  const lanes = venueLanes(sede.name, sede.fields_count);
  const wanted = lanes.find((l) => l.toLowerCase() === givenLower) ?? null;

  // Cuánto ocupa un partido: un seven es corto; el resto, un partido de 15.
  const { data: tournament } = await db.from('tournaments').select('ruleset').eq('id', tournamentId).maybeSingle();
  const durationMs = (isSevensTournament(tournament as { ruleset?: Record<string, unknown> | null } | null) ? 20 : 90) * 60_000;

  let query = db
    .from('matches')
    .select('id, date_time, venue, status')
    .ilike('venue', `${escapePostgrestLike(sede.name)}%`)
    .gt('date_time', new Date(start - durationMs).toISOString())
    .lt('date_time', new Date(start + durationMs).toISOString())
    .limit(200);
  if (matchId) query = query.neq('id', matchId);
  const { data: near } = await query;
  const taken = new Map<string, string>();
  for (const m of (near ?? []) as Array<{ venue: string | null; status: string | null; date_time: string }>) {
    if (m.status === 'cancelled' || !m.venue) continue;
    const lane = lanes.find((l) => l.toLowerCase() === m.venue!.trim().toLowerCase());
    if (lane && !taken.has(lane)) taken.set(lane, m.date_time);
  }

  if (wanted) {
    const clashAt = taken.get(wanted);
    if (!clashAt) return { ok: true, venue: wanted };
    const free = lanes.find((l) => !taken.has(l));
    return {
      ok: false,
      error: `${wanted} ya tiene un partido a las ${toInputTimeInTimeZone(clashAt, APP_TIMEZONE)}.${free ? ` Está libre ${free}.` : ' No queda ninguna cancha libre a esa hora.'}`,
    };
  }

  const free = lanes.find((l) => !taken.has(l));
  if (!free) {
    return { ok: false, error: `Las ${lanes.length} cancha${lanes.length === 1 ? '' : 's'} de ${sede.name} están ocupadas a esa hora. Cambiá el horario.` };
  }
  return { ok: true, venue: free };
}
