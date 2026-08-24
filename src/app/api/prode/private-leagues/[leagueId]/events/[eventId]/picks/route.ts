import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { readEventOfficialScore, resolveProdeScoringRules, scoreLivePrediction } from '@/lib/server/prodeScoring';

export const dynamic = 'force-dynamic';

type AnyRow = Record<string, unknown>;
type QueryError = { message?: string | null } | null;

interface LooseBuilder extends PromiseLike<{ data: AnyRow[] | null; error: QueryError }> {
    select(columns: string): LooseBuilder;
    eq(column: string, value: string): LooseBuilder;
    in(column: string, values: string[]): LooseBuilder;
    maybeSingle(): PromiseLike<{ data: AnyRow | null; error: QueryError }>;
}

interface LooseClient {
    from(table: string): { select(columns: string): LooseBuilder };
}

function str(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function record(value: unknown): AnyRow {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRow : {};
}

function userInfo(row: AnyRow) {
    // Supabase devuelve el join users(...) como objeto o (según relación) array.
    const raw = Array.isArray(row.users) ? row.users[0] : row.users;
    const userRecord = record(raw);
    return {
        name: str(userRecord.name) || 'Jugador',
        avatarUrl: typeof userRecord.avatar_url === 'string' ? userRecord.avatar_url : null,
    };
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ leagueId: string; eventId: string }> },
) {
    try {
        const { leagueId, eventId } = await params;
        const supabase = await createServerClient();
        const {
            data: { user: authUser },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = authUser.id;
        const admin = createAdminClient() as unknown as LooseClient;

        const leagueResult = await admin
            .from('prode_private_leagues')
            .select('id, competition_id, metadata')
            .eq('id', leagueId)
            .maybeSingle();

        if (leagueResult.error) {
            throw new Error(leagueResult.error.message || 'No se pudo cargar la liga.');
        }
        if (!leagueResult.data) {
            return NextResponse.json({ error: 'La liga no existe.' }, { status: 404 });
        }

        const competitionId = str(leagueResult.data.competition_id);

        // Solo los miembros de la liga pueden ver los pronósticos del grupo.
        const membershipResult = await admin
            .from('prode_private_league_members')
            .select('user_id')
            .eq('private_league_id', leagueId)
            .eq('user_id', userId)
            .maybeSingle();

        if (membershipResult.error) {
            throw new Error(membershipResult.error.message || 'No se pudo validar tu membresía.');
        }
        if (!membershipResult.data) {
            return NextResponse.json({ error: 'No formás parte de esta liga.' }, { status: 403 });
        }

        const eventResult = await admin
            .from('prode_events')
            .select('id, competition_id, home_label, away_label, starts_at, locks_at, status, official_result, match_snapshot')
            .eq('id', eventId)
            .maybeSingle();

        if (eventResult.error) {
            throw new Error(eventResult.error.message || 'No se pudo cargar el partido.');
        }
        if (!eventResult.data || str(eventResult.data.competition_id) !== competitionId) {
            return NextResponse.json({ error: 'El partido no pertenece a esta liga.' }, { status: 404 });
        }

        const eventRow = eventResult.data;
        const startsAt = str(eventRow.starts_at);
        const locksAt = str(eventRow.locks_at);
        const status = str(eventRow.status);
        const homeLabel = str(eventRow.home_label);
        const awayLabel = str(eventRow.away_label);

        // Mismo criterio que la grilla de juego: el partido está "abierto" (picks
        // editables) hasta locks_at y mientras siga 'scheduled'. Antes de eso NO se
        // revelan los pronósticos ajenos.
        const eventTime = new Date(locksAt || startsAt).getTime();
        const isOpen = Number.isFinite(eventTime) ? eventTime > Date.now() && status === 'scheduled' : false;

        const ownResult = await admin
            .from('prode_predictions')
            .select('predicted_home_score, predicted_away_score, predicted_outcome')
            .eq('competition_id', competitionId)
            .eq('event_id', eventId)
            .eq('user_id', userId)
            .maybeSingle();

        const ownRow = ownResult.data;
        const ownPick = ownRow
            ? {
                predictedHomeScore: num(ownRow.predicted_home_score),
                predictedAwayScore: num(ownRow.predicted_away_score),
                outcome: str(ownRow.predicted_outcome) || null,
            }
            : null;

        if (isOpen) {
            // Partido sin arrancar: solo el pick propio, el resto oculto.
            return NextResponse.json({
                revealed: false,
                status,
                startsAt,
                locksAt,
                homeLabel,
                awayLabel,
                ownPick,
                message: 'Los pronósticos del resto se revelan cuando arranca el partido.',
            });
        }

        // Partido en juego/cerrado: revelamos los pronósticos de los miembros.
        const membersResult = await admin
            .from('prode_private_league_members')
            .select('user_id, users(name, avatar_url)')
            .eq('private_league_id', leagueId);

        if (membersResult.error) {
            throw new Error(membersResult.error.message || 'No se pudieron cargar los miembros.');
        }

        const members = membersResult.data || [];
        const memberIds = members.map((row) => str(row.user_id)).filter(Boolean);

        const predictionsResult = memberIds.length
            ? await admin
                .from('prode_predictions')
                .select('user_id, predicted_home_score, predicted_away_score, predicted_outcome')
                .eq('competition_id', competitionId)
                .eq('event_id', eventId)
                .in('user_id', memberIds)
            : { data: [] as AnyRow[], error: null };

        if (predictionsResult.error) {
            throw new Error(predictionsResult.error.message || 'No se pudieron cargar los pronósticos.');
        }

        const predictionByUser = new Map(
            (predictionsResult.data || []).map((row) => [str(row.user_id), row]),
        );

        // Reglas vigentes de la liga (las últimas, que son las que aplican a un
        // partido que recién cierra/está en vivo).
        const competitionResult = await admin
            .from('prode_competitions')
            .select('id, metadata, prediction_lead_minutes, active_ruleset_id')
            .eq('id', competitionId)
            .maybeSingle();

        const competitionRow = competitionResult.data || { id: competitionId };
        let rulesetRow: AnyRow | null = null;
        const activeRulesetId = str(competitionRow.active_ruleset_id);
        if (activeRulesetId) {
            const rulesetResult = await admin
                .from('prode_rulesets')
                .select('scoring_model')
                .eq('id', activeRulesetId)
                .maybeSingle();
            rulesetRow = rulesetResult.data;
        }

        const rules = resolveProdeScoringRules(competitionRow, rulesetRow, leagueResult.data);
        const official = readEventOfficialScore(eventRow);

        const picks = members
            .map((member) => {
                const memberId = str(member.user_id);
                const prediction = predictionByUser.get(memberId) || null;
                const info = userInfo(member);
                const live = prediction ? scoreLivePrediction(eventRow, prediction, rules) : null;

                return {
                    userId: memberId,
                    userName: info.name,
                    avatarUrl: info.avatarUrl,
                    isCurrentUser: memberId === userId,
                    hasPrediction: Boolean(prediction),
                    predictedHomeScore: prediction ? num(prediction.predicted_home_score) : null,
                    predictedAwayScore: prediction ? num(prediction.predicted_away_score) : null,
                    outcome: prediction ? (str(prediction.predicted_outcome) || null) : null,
                    points: live?.points ?? 0,
                    breakdown: live?.breakdown ?? null,
                };
            })
            .sort((left, right) => {
                if (right.points !== left.points) return right.points - left.points;
                if (left.hasPrediction !== right.hasPrediction) return left.hasPrediction ? -1 : 1;
                return left.userName.localeCompare(right.userName, 'es');
            });

        return NextResponse.json({
            revealed: true,
            status,
            startsAt,
            locksAt,
            homeLabel,
            awayLabel,
            isFinal: status === 'final' || status === 'scored',
            official: official
                ? { homeScore: official.homeScore, awayScore: official.awayScore, outcome: official.outcome }
                : null,
            ownPick,
            picks,
        });
    } catch (error) {
        console.error('[prode/private-leagues/picks] error:', error);
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los pronósticos.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
