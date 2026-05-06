import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
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

    if (!scope.isUnlimited && scope.clubIds.size === 0) {
        return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '500', 10) || 500, 2000);

    let query = supabase
        .from('clubs')
        .select('id, name, slug, sport, sport_id, city, country, is_visible, union_id')
        .order('name', { ascending: true })
        .limit(limit);

    if (!scope.isUnlimited) {
        query = query.in('id', Array.from(scope.clubIds));
    }

    if (search) {
        const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) {
        return err('No se pudieron cargar los clubes', 500, error.message);
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
    const sport = String(body.sport ?? body.sport_id ?? 'rugby').trim();
    const city = body.city ? String(body.city).trim() : null;
    const country = body.country ? String(body.country).trim() : null;
    const unionId = body.union_id ? String(body.union_id).trim() : null;

    if (name.length < 2) {
        return err('El nombre del club debe tener al menos 2 caracteres', 400);
    }

    const slug = slugify(name);
    if (!slug) {
        return err('El nombre genera un slug inválido', 400);
    }

    const { data: existing } = await supabase
        .from('clubs')
        .select('id')
        .eq('id', slug)
        .maybeSingle();

    if (existing) {
        return err('Ya existe un club con ese nombre/slug', 409, { slug });
    }

    const payload: Record<string, unknown> = {
        id: slug,
        slug,
        name,
        sport,
        sport_id: sport,
        is_visible: false,
    };

    if (city) payload.city = city;
    if (country) payload.country = country;
    if (unionId) payload.union_id = unionId;

    const { data, error } = await supabase
        .from('clubs')
        .insert([payload])
        .select('id, name, slug, sport, is_visible')
        .single();

    if (error) {
        if (error.code === '23505') {
            return err('Ya existe un club con ese slug', 409, { slug });
        }
        return err('No se pudo crear el club', 500, error.message);
    }

    // Auto-grant admin membership so the creator can manage their own clubs.
    const { error: membershipError } = await supabase
        .from('memberships')
        .insert([{
            user_id: context.userId,
            scope_type: 'club',
            scope_id: data.id,
            role: 'admin',
        }]);

    if (membershipError) {
        console.warn('[admin/torneo/clubs] Could not grant membership for creator:', membershipError.message);
    }

    return NextResponse.json({ data }, { status: 201 });
}
