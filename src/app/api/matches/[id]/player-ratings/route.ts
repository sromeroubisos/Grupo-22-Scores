import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
    createEmptyPlayerRatingsSummary,
    toPeopleScore,
    type MatchPlayerRatingsSummary,
    type PlayerRatingSummary,
    type PlayerRatingValue,
} from '@/lib/types/matchPlayerRatings';

export const dynamic = 'force-dynamic';

type LooseRow = Record<string, unknown>;
type QueryError = { message?: string | null; code?: string | null } | null;

interface LooseQuery extends PromiseLike<{ data: LooseRow[] | null; error: QueryError }> {
    select(columns: string): LooseQuery;
    eq(column: string, value: string): LooseQuery;
}

interface LooseMutation extends PromiseLike<{ data: LooseRow | null; error: QueryError }> {
    select(columns: string): LooseMutation;
    single(): PromiseLike<{ data: LooseRow | null; error: QueryError }>;
    eq(column: string, value: string): LooseMutation;
}

interface LooseAdmin {
    from(table: string): {
        select(columns: string): LooseQuery;
        upsert(payload: LooseRow, options?: { onConflict?: string }): LooseMutation;
        delete(): LooseMutation;
        update(payload: LooseRow): LooseMutation;
    };
}

const TABLE = 'match_player_ratings';

// La tabla puede no estar aplicada todavia en un entorno dado. Cuando pasa,
// PostgREST responde PGRST205 (`Could not find the table`) o 42P01. Eso no es
// un error del usuario: la seccion se resuelve vacia y la pagina sigue viva.
function isMissingTable(error: QueryError) {
    const code = String(error?.code ?? '');
    const message = String(error?.message ?? '').toLowerCase();
    return code === 'PGRST205' || code === '42P01' || message.includes('could not find the table');
}

function str(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toRating(value: unknown): PlayerRatingValue | null {
    return value === 1 || value === 2 || value === 3 ? value : null;
}

function toTeam(value: unknown): 'home' | 'away' | null {
    return value === 'home' || value === 'away' ? value : null;
}

function buildSummary(rows: LooseRow[], userId: string | null): MatchPlayerRatingsSummary {
    const byPlayer = new Map<string, PlayerRatingSummary>();
    const voters = new Set<string>();

    for (const row of rows) {
        const key = str(row.player_key);
        if (!key) continue;

        const team = toTeam(row.team) ?? 'home';
        const entry = byPlayer.get(key) ?? {
            playerKey: key,
            playerName: str(row.player_name) || 'Jugador',
            team,
            counts: { 1: 0, 2: 0, 3: 0 },
            votes: 0,
            score: null,
            mvpVotes: 0,
        };

        const rating = toRating(row.rating);
        if (rating) {
            entry.counts[rating] += 1;
            entry.votes += 1;
        }
        if (row.is_mvp === true) entry.mvpVotes += 1;

        byPlayer.set(key, entry);
        const voter = str(row.user_id);
        if (voter) voters.add(voter);
    }

    const players = Array.from(byPlayer.values()).map((p) => ({ ...p, score: toPeopleScore(p.counts) }));

    // La figura es la mas votada; a igualdad de votos gana la mejor nota, y si
    // tambien empatan queda la primera por nombre para que el orden no baile
    // entre recargas.
    const withMvp = players.filter((p) => p.mvpVotes > 0);
    withMvp.sort((a, b) =>
        b.mvpVotes - a.mvpVotes ||
        (b.score ?? 0) - (a.score ?? 0) ||
        a.playerName.localeCompare(b.playerName, 'es'));

    players.sort((a, b) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        b.votes - a.votes ||
        a.playerName.localeCompare(b.playerName, 'es'));

    const mine = userId
        ? rows
            .filter((row) => str(row.user_id) === userId)
            .map((row) => ({
                playerKey: str(row.player_key),
                rating: toRating(row.rating),
                isMvp: row.is_mvp === true,
            }))
        : [];

    return { players, voters: voters.size, mvp: withMvp[0] ?? null, mine };
}

async function resolveUserId() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
}

async function fetchSummary(admin: LooseAdmin, matchId: string, userId: string | null) {
    const { data, error } = await admin
        .from(TABLE)
        .select('player_key, player_name, team, rating, is_mvp, user_id')
        .eq('match_id', matchId);

    if (error) {
        if (isMissingTable(error)) return createEmptyPlayerRatingsSummary();
        throw new Error(error.message || 'No se pudo leer el puntaje de la gente.');
    }

    return buildSummary(data || [], userId);
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const matchId = (await params).id;
        const userId = await resolveUserId();
        const admin = createAdminClient() as unknown as LooseAdmin;
        return NextResponse.json(await fetchSummary(admin, matchId, userId));
    } catch (error) {
        console.error('[GET /api/matches/[id]/player-ratings]', error);
        return NextResponse.json(createEmptyPlayerRatingsSummary());
    }
}

type RatingPayload = {
    playerKey?: string;
    playerName?: string;
    team?: 'home' | 'away';
    rating?: number | null;
    isMvp?: boolean;
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const matchId = (await params).id;
        const userId = await resolveUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Entra con tu cuenta para puntuar.' }, { status: 401 });
        }

        const payload = await request.json() as RatingPayload;
        const playerKey = str(payload.playerKey).trim();
        const playerName = str(payload.playerName).trim();
        const team = toTeam(payload.team);
        const rating = payload.rating === null ? null : toRating(payload.rating);
        const isMvp = payload.isMvp === true;

        if (!playerKey || !team) {
            return NextResponse.json({ error: 'Falta el jugador.' }, { status: 400 });
        }
        if (payload.rating != null && rating == null) {
            return NextResponse.json({ error: 'El puntaje va de 1 a 3.' }, { status: 400 });
        }

        const admin = createAdminClient() as unknown as LooseAdmin;

        // La figura es una sola por usuario: antes de marcar la nueva se baja la
        // anterior, si no el indice unico parcial rechaza el upsert.
        if (isMvp) {
            const cleared = await admin
                .from(TABLE)
                .update({ is_mvp: false, updated_at: new Date().toISOString() })
                .eq('match_id', matchId)
                .eq('user_id', userId);
            if (cleared.error && !isMissingTable(cleared.error)) {
                return NextResponse.json({ error: cleared.error.message }, { status: 500 });
            }
        }

        // Sin puntaje y sin figura no queda nada que guardar: se borra la fila
        // en vez de dejar un voto vacio (lo mismo que pide el CHECK de la tabla).
        if (rating == null && !isMvp) {
            const removed = await admin
                .from(TABLE)
                .delete()
                .eq('match_id', matchId)
                .eq('user_id', userId)
                .eq('player_key', playerKey);
            if (removed.error && !isMissingTable(removed.error)) {
                return NextResponse.json({ error: removed.error.message }, { status: 500 });
            }
            return NextResponse.json(await fetchSummary(admin, matchId, userId));
        }

        const saved = await admin
            .from(TABLE)
            .upsert(
                {
                    match_id: matchId,
                    user_id: userId,
                    player_key: playerKey,
                    player_name: playerName || 'Jugador',
                    team,
                    rating,
                    is_mvp: isMvp,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'match_id,user_id,player_key' },
            );

        if (saved.error) {
            if (isMissingTable(saved.error)) {
                return NextResponse.json(
                    { error: 'El puntaje de la gente todavia no esta habilitado.' },
                    { status: 503 },
                );
            }
            return NextResponse.json({ error: saved.error.message || 'No se pudo guardar tu voto.' }, { status: 500 });
        }

        return NextResponse.json(await fetchSummary(admin, matchId, userId));
    } catch (error) {
        console.error('[POST /api/matches/[id]/player-ratings]', error);
        return NextResponse.json({ error: 'No se pudo guardar tu voto.' }, { status: 500 });
    }
}
