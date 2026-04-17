import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { invalidateProdeRefresh } from '@/lib/server/prodeScoring';
import type { ProdePredictionOutcome } from '@/lib/prode/types';

export const dynamic = 'force-dynamic';

type QueryError = { message?: string | null } | null;
type LooseRow = Record<string, unknown>;

interface LooseQueryBuilder<T = LooseRow> extends PromiseLike<{ data: T[] | null; error: QueryError }> {
    select(columns: string): LooseQueryBuilder<T>;
    eq(column: string, value: string): LooseQueryBuilder<T>;
    maybeSingle(): PromiseLike<{ data: T | null; error: QueryError }>;
    single(): PromiseLike<{ data: T | null; error: QueryError }>;
}

interface LooseMutationBuilder<T = LooseRow> extends PromiseLike<{ data: T | null; error: QueryError }> {
    select(columns: string): LooseMutationBuilder<T>;
    single(): PromiseLike<{ data: T | null; error: QueryError }>;
}

interface LooseAdminClient {
    from(table: string): {
        select(columns: string): LooseQueryBuilder<LooseRow>;
        insert(payload: LooseRow): LooseMutationBuilder<LooseRow>;
        upsert(payload: LooseRow, options?: { onConflict?: string }): LooseMutationBuilder<LooseRow>;
    };
}

type PredictionPayload = {
    eventId?: string;
    predictedHomeScore?: number;
    predictedAwayScore?: number;
};

function toSafeString(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
}

function toFiniteNumber(value: unknown, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toNullableInteger(value: unknown) {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) ? numericValue : null;
}

function resolveOutcome(homeScore: number, awayScore: number): ProdePredictionOutcome {
    if (homeScore === awayScore) return 'draw';
    return homeScore > awayScore ? 'home' : 'away';
}

async function ensureUserProfile(admin: LooseAdminClient, authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
    const { data: existingUser, error: existingUserError } = await admin
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

    if (existingUserError) {
        throw new Error(existingUserError.message || 'No se pudo validar el perfil del usuario.');
    }

    if (existingUser) {
        return;
    }

    const { error: insertUserError } = await admin
        .from('users')
        .insert({
            id: authUser.id,
            email: authUser.email || '',
            name: toSafeString(authUser.user_metadata?.full_name) || toSafeString(authUser.user_metadata?.name) || authUser.email?.split('@')[0] || 'Usuario',
            avatar_url: toNullableString(authUser.user_metadata?.avatar_url) || toNullableString(authUser.user_metadata?.picture),
            role: 'fan',
            last_login_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (insertUserError) {
        throw new Error(insertUserError.message || 'No se pudo crear el perfil del usuario.');
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createServerClient();
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await request.json() as PredictionPayload;
        const predictedHomeScore = toNullableInteger(payload.predictedHomeScore);
        const predictedAwayScore = toNullableInteger(payload.predictedAwayScore);

        if (!payload.eventId || predictedHomeScore === null || predictedAwayScore === null) {
            return NextResponse.json({ error: 'Faltan datos para guardar el pronostico.' }, { status: 400 });
        }

        if (predictedHomeScore < 0 || predictedAwayScore < 0) {
            return NextResponse.json({ error: 'El marcador pronosticado no puede ser negativo.' }, { status: 400 });
        }

        const admin = createAdminClient() as unknown as LooseAdminClient;
        await ensureUserProfile(admin, session.user);

        const { data: eventRow, error: eventError } = await admin
            .from('prode_events')
            .select('id, competition_id, locks_at, status')
            .eq('id', payload.eventId)
            .maybeSingle();

        if (eventError || !eventRow) {
            return NextResponse.json({ error: eventError?.message || 'No se encontro el evento.' }, { status: 404 });
        }

        const locksAt = toSafeString(eventRow.locks_at);
        if (locksAt && new Date(locksAt).getTime() <= Date.now()) {
            return NextResponse.json({ error: 'El pronostico ya cerro para este partido.' }, { status: 409 });
        }

        const status = toSafeString(eventRow.status);
        if (status === 'final' || status === 'scored' || status === 'cancelled') {
            return NextResponse.json({ error: 'Este partido ya no admite edicion.' }, { status: 409 });
        }

        const competitionId = toSafeString(eventRow.competition_id);
        const predictedOutcome = resolveOutcome(predictedHomeScore, predictedAwayScore);

        const [{ error: membershipError }, predictionResult] = await Promise.all([
            admin
                .from('prode_competition_members')
                .upsert({
                    competition_id: competitionId,
                    user_id: session.user.id,
                    status: 'active',
                }, { onConflict: 'competition_id,user_id' }),
            admin
                .from('prode_predictions')
                .upsert({
                    competition_id: competitionId,
                    event_id: payload.eventId,
                    user_id: session.user.id,
                    predicted_outcome: predictedOutcome,
                    predicted_home_score: predictedHomeScore,
                    predicted_away_score: predictedAwayScore,
                    scoring_breakdown: {},
                    points_awarded: 0,
                    status: 'open',
                    submitted_at: new Date().toISOString(),
                }, { onConflict: 'event_id,user_id' })
                .select('id, predicted_outcome, predicted_home_score, predicted_away_score, scoring_breakdown, points_awarded, status, submitted_at, scored_at')
                .single(),
        ]);

        if (membershipError) {
            return NextResponse.json({ error: membershipError.message || 'No se pudo registrar tu inscripcion al prode.' }, { status: 500 });
        }

        if (predictionResult.error || !predictionResult.data) {
            return NextResponse.json({ error: predictionResult.error?.message || 'No se pudo guardar el pronostico.' }, { status: 500 });
        }

        invalidateProdeRefresh(competitionId);

        return NextResponse.json({
            prediction: {
                id: toSafeString(predictionResult.data.id),
                outcome: toNullableString(predictionResult.data.predicted_outcome),
                predictedHomeScore: toNullableInteger(predictionResult.data.predicted_home_score),
                predictedAwayScore: toNullableInteger(predictionResult.data.predicted_away_score),
                pointsAwarded: toFiniteNumber(predictionResult.data.points_awarded),
                status: toSafeString(predictionResult.data.status) || 'open',
                scoringBreakdown: typeof predictionResult.data.scoring_breakdown === 'object' && predictionResult.data.scoring_breakdown
                    ? predictionResult.data.scoring_breakdown as Record<string, unknown>
                    : {},
                submittedAt: toNullableString(predictionResult.data.submitted_at),
                scoredAt: toNullableString(predictionResult.data.scored_at),
            },
        });
    } catch (error) {
        console.error('[prode/predictions] save error:', error);
        const message = error instanceof Error ? error.message : 'No se pudo guardar el pronostico.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
