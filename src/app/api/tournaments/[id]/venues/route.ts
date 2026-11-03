import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { escapePostgrestLike } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

/**
 * Sedes del torneo ("Olivos", 3 canchas). Una sede la comparten varios
 * torneos: el generador intercala sus partidos sin pisarlos.
 *
 *   GET    → las sedes del torneo, todas las conocidas y qué otros torneos usan las suyas.
 *   POST   → crea (o reusa por nombre) una sede y se la asigna a este torneo y a `tournamentIds`.
 *   PATCH  → cambia cuántas canchas tiene una sede de este torneo.
 */

type VenueRow = { id: string; name: string; fields_count: number; city: string | null };

const clampFields = (value: unknown) => Math.max(1, Math.min(50, Math.floor(Number(value)) || 1));

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);

    const { data: links, error: linksError } = await db
      .from('tournament_venues')
      .select('venue_id')
      .eq('tournament_id', tournamentId);
    if (linksError) throw linksError;
    const linkedIds = (links ?? []).map((l: { venue_id: string }) => l.venue_id);

    const { data: all, error: allError } = await db
      .from('venues')
      .select('id, name, fields_count, city')
      .order('name', { ascending: true })
      .limit(500);
    if (allError) throw allError;
    const venues = (all ?? []) as VenueRow[];

    // Los otros torneos que juegan en estas sedes: son los candidatos a intercalar.
    let sharing: Array<{ tournamentId: string; name: string; venueId: string }> = [];
    if (linkedIds.length > 0) {
      const { data: others } = await db
        .from('tournament_venues')
        .select('tournament_id, venue_id, tournaments(name)')
        .in('venue_id', linkedIds)
        .neq('tournament_id', tournamentId);
      sharing = ((others ?? []) as Array<{ tournament_id: string; venue_id: string; tournaments: { name: string } | null }>)
        .map((o) => ({ tournamentId: o.tournament_id, venueId: o.venue_id, name: o.tournaments?.name ?? 'Torneo' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const { data: self } = await db.from('tournaments').select('name, display_name').eq('id', tournamentId).maybeSingle();

    return NextResponse.json({
      ok: true,
      tournamentName: (self as { name?: string; display_name?: string | null } | null)?.display_name || (self as { name?: string } | null)?.name || null,
      linked: venues.filter((v) => linkedIds.includes(v.id)),
      all: venues,
      sharing,
    });
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json().catch(() => ({}));

    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) return NextResponse.json({ error: 'Ponele un nombre a la sede.' }, { status: 400 });
    const fieldsCount = body?.fieldsCount === undefined ? null : clampFields(body.fieldsCount);

    // Los otros torneos tienen que ser del mismo admin: cada uno se valida.
    const others: string[] = Array.from(new Set(
      (Array.isArray(body?.tournamentIds) ? body.tournamentIds : [])
        .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0 && t !== tournamentId),
    ));
    for (const other of others) await requireTournamentMutationContext(other);

    // Una sede por nombre: "Olivos" y "olivos " son la misma.
    const { data: existing } = await db
      .from('venues')
      .select('id, name, fields_count, city')
      .ilike('name', escapePostgrestLike(name))
      .limit(1);
    let venue = ((existing ?? []) as VenueRow[])[0] ?? null;
    if (!venue) {
      const { data: created, error } = await db
        .from('venues')
        .insert({ name, fields_count: fieldsCount ?? 1 })
        .select('id, name, fields_count, city')
        .single();
      if (error) throw error;
      venue = created as VenueRow;
    } else if (fieldsCount !== null && fieldsCount !== venue.fields_count) {
      const { data: updated, error } = await db
        .from('venues')
        .update({ fields_count: fieldsCount, updated_at: new Date().toISOString() })
        .eq('id', venue.id)
        .select('id, name, fields_count, city')
        .single();
      if (error) throw error;
      venue = updated as VenueRow;
    }

    const venueId = venue.id;
    const links = [tournamentId, ...others].map((t) => ({ tournament_id: t, venue_id: venueId }));
    const { error: linkError } = await db.from('tournament_venues').upsert(links, { onConflict: 'tournament_id,venue_id', ignoreDuplicates: true });
    if (linkError) throw linkError;

    return NextResponse.json({ ok: true, venue, linkedTournaments: links.length });
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tournamentId = (await params).id;
    const { writer: db } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json().catch(() => ({}));
    const venueId = typeof body?.venueId === 'string' ? body.venueId : '';
    if (!venueId) return NextResponse.json({ error: 'Falta la sede.' }, { status: 400 });

    // Solo se edita una sede que este torneo usa.
    const { data: link } = await db
      .from('tournament_venues')
      .select('venue_id')
      .eq('tournament_id', tournamentId)
      .eq('venue_id', venueId)
      .maybeSingle();
    if (!link) return NextResponse.json({ error: 'Esa sede no es de este torneo.' }, { status: 404 });

    const { data: venue, error } = await db
      .from('venues')
      .update({ fields_count: clampFields(body?.fieldsCount), updated_at: new Date().toISOString() })
      .eq('id', venueId)
      .select('id, name, fields_count, city')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, venue });
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}
