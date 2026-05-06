import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { canCreateTournament, getUserPlanContext } from '@/lib/billing/subscriptions';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function countActiveOwnedTournaments(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
): Promise<number> {
    const { count } = await supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('created_by_user_id', userId)
        .neq('status', 'archived');
    return count ?? 0;
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);

    if (!scope.isUnlimited && scope.tournamentIds.size === 0) {
        return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || '').trim();
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '300', 10) || 300, 1000);

    let query = supabase
        .from('tournaments')
        .select('id, name, display_name, slug, sport_id, season_id, country, status, is_visible, is_popular, union_id, created_at, created_by_user_id')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (!scope.isUnlimited) {
        query = query.in('id', Array.from(scope.tournamentIds));
    }

    if (search) {
        const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${escaped}%,display_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
        return err('No se pudieron cargar los torneos', 500, error.message);
    }

    return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const name = String(body.name ?? '').trim();
    const sport = String(body.sport_id ?? body.sport ?? 'rugby').trim();
    const season = String(body.season_id ?? body.season ?? '2026').trim();
    const country = body.country ? String(body.country).trim() : null;
    const unionId = body.union_id ? String(body.union_id).trim() : null;
    const status = String(body.status ?? 'draft').trim();

    if (name.length < 3) {
        return err('El nombre del torneo debe tener al menos 3 caracteres', 400);
    }

    const planCtx = await getUserPlanContext(supabase, context.userId, context.rawRole);
    const activeCount = await countActiveOwnedTournaments(supabase, context.userId);
    const planCheck = canCreateTournament(planCtx, activeCount);
    if (!planCheck.allowed) {
        return err(planCheck.reason ?? 'Tu plan no permite crear más torneos.', 402, {
            requiredPlan: planCheck.requiredPlan ?? null,
            currentPlan: planCtx.tier,
            limit: planCtx.plan.limits.maxActiveTournaments,
            current: activeCount,
        });
    }

    const slug = slugify(`${name}-${season}`);

    const payload: Record<string, unknown> = {
        name,
        display_name: name,
        slug,
        sport_id: sport,
        season_id: season,
        status,
        is_visible: status === 'published',
        is_popular: false,
        created_by_user_id: context.userId,
    };

    if (country) payload.country = country;
    if (unionId) payload.union_id = unionId;

    const { data, error } = await supabase
        .from('tournaments')
        .insert([payload])
        .select('id, name, display_name, slug, sport_id, season_id, status, is_visible, country, union_id, created_at, created_by_user_id')
        .single();

    if (error) {
        if (error.code === '23505') {
            return err('Ya existe un torneo con ese nombre y temporada', 409, { slug });
        }
        return err('No se pudo crear el torneo', 500, error.message);
    }

    // Auto-grant admin membership so the creator can manage and is found by scope queries.
    const { error: membershipError } = await supabase
        .from('memberships')
        .insert([{
            user_id: context.userId,
            scope_type: 'tournament',
            scope_id: data.id,
            role: 'admin',
        }]);

    if (membershipError) {
        console.warn('[admin/torneo/tournaments] Could not grant membership for creator:', membershipError.message);
    }

    return NextResponse.json({ data }, { status: 201 });
}
