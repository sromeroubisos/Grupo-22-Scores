import { NextRequest, NextResponse } from 'next/server';
import {
    canManageSportContext,
    hasScopedMembershipAccess,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalizeSportId } from '@/lib/clubDerivatives';

// ─── helpers ────────────────────────────────────────────────────────────────

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

type PublicClubRow = {
    id: string;
    name: string;
    slug: string | null;
    logo_url: string | null;
    city: string | null;
    country: string | null;
    is_visible: boolean | null;
    status: string | null;
    sport: string | null;
    sport_id: string | null;
    sport_ref: { name: string } | null;
};

const PUBLIC_CLUB_SELECT = 'id, name, slug, logo_url, city, country, is_visible, status, sport, sport_id';
const ADMIN_CLUB_SELECT = 'id, name, slug, logo_url, city, country, is_visible, status, sport, sport_id';

function resolveSportFilter(rawSport: string | null) {
    const normalizedSport = canonicalizeSportId(rawSport);

    if (!normalizedSport || normalizedSport === 'rugby') {
        return ['rugby', 'rugby-union', 'rugby-league'];
    }

    if (normalizedSport === 'hockey') {
        return ['hockey', 'field-hockey'];
    }

    return [normalizedSport];
}

function requestHasSupabaseSession(request: NextRequest) {
    return request.cookies.getAll().some((cookie) => {
        const name = cookie.name.toLowerCase();
        return name.startsWith('sb-') && name.includes('auth-token') && Boolean(cookie.value);
    });
}

async function getAuthenticatedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
}

async function canCreateClub(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    unionId: string,
    sportId: string | null
): Promise<boolean> {
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context || context.userId !== userId) return false;

    return (
        hasScopedMembershipAccess(context, 'union', unionId, EDIT_MEMBERSHIP_ROLES) ||
        canManageSportContext(context, sportId, EDIT_MEMBERSHIP_ROLES)
    );
}

// ─── POST /api/clubs ─────────────────────────────────────────────────────────
// Crea club mínimo (status=draft, is_visible=false).
// Retorna { id, slug } en ~150ms.

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    const authUser = await getAuthenticatedUser(supabase);
    if (!authUser) return err('No autenticado', 401);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const { name, sport, union_id, slug: rawSlug } = body as Record<string, string>;

    // Validaciones
    if (!name || name.trim().length < 2) {
        return err('El nombre del club debe tener al menos 2 caracteres', 400);
    }
    if (!union_id) {
        return err('union_id es requerido', 400);
    }

    // Autorización
    const normalizedSport = canonicalizeSportId(sport || 'rugby');
    const allowed = await canCreateClub(supabase, authUser.id, union_id, normalizedSport);
    if (!allowed) return err('Sin permisos para crear clubes en esta unión', 403);

    const slug = rawSlug ? slugify(rawSlug) : slugify(name);
    if (!slug) return err('El slug generado es inválido', 400);

    // Verificar unicidad del slug
    const { data: existing } = await supabase
        .from('clubs')
        .select('id')
        .eq('id', slug)
        .maybeSingle();

    if (existing) {
        return NextResponse.json(
            { error: 'El slug ya está en uso. Elegí un nombre diferente.', details: { slug } },
            { status: 409 }
        );
    }

    const payload = {
        id: slug,          // TEXT PK = slug
        slug,
        name: name.trim(),
        sport_id: normalizedSport,
        sport: normalizedSport,
        union_id,
        status: 'draft',
        is_visible: false,
    };

    const { data, error } = await supabase
        .from('clubs')
        .insert([payload])
        .select('id, slug, name, status')
        .single();

    if (error) {
        // Conflict por constraint (race condition en slug)
        if (error.code === '23505') {
            return NextResponse.json(
                { error: 'El slug ya está en uso', details: { slug } },
                { status: 409 }
            );
        }
        return err('Error al crear club', 500, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
}

// ─── GET /api/clubs ──────────────────────────────────────────────────────────
// Lista pública (solo clubes visibles). Super admin ve todos.

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const unionId = searchParams.get('union_id');
    const sport = searchParams.get('sport');
    const sportFilter = resolveSportFilter(sport);
    const wantsAdminScope = searchParams.get('include_hidden') === 'true' || searchParams.get('admin') === 'true';
    const shouldCheckAdmin = wantsAdminScope && requestHasSupabaseSession(request);
    const supabase = shouldCheckAdmin ? await createClient() : null;

    let isSuperAdmin = false;

    if (supabase) {
        const authUser = await getAuthenticatedUser(supabase);

        if (authUser) {
            const { data: profile } = await supabase
                .from('users')
                .select('role')
                .eq('id', authUser.id)
                .single();
            isSuperAdmin = isGlobalAdminRole(profile?.role);
        }
    }

    const readClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : (supabase ?? await createClient());

    let query = readClient
        .from('clubs')
        .select(isSuperAdmin ? ADMIN_CLUB_SELECT : PUBLIC_CLUB_SELECT)
        .order('name');

    if (!isSuperAdmin) {
        query = query.neq('is_visible', false);
    }
    if (unionId) query = query.eq('union_id', unionId);
    if (sport) {
        query = query.or(
            sportFilter
                .map((value) => `sport.eq.${value},sport_id.eq.${value}`)
                .join(',')
        );
    }

    const { data, error } = await query;
    if (error) return err('Error al obtener clubes', 500, error.message);

    const clubs = ((data || []) as PublicClubRow[]).filter((club) => {
        if (!sport) return true;
        const normalizedSport = club.sport || club.sport_id || 'rugby';
        return sportFilter.includes(normalizedSport);
    });

    const response = NextResponse.json({
        data: clubs.map((club) => ({
            id: club.id,
            name: club.name,
            slug: club.slug,
            logo_url: club.logo_url,
            city: club.city,
            country: club.country,
            is_visible: club.is_visible !== false,
            sport: club.sport || club.sport_id || 'rugby',
            status: club.status ?? 'published',
        }))
    });

    if (!wantsAdminScope) {
        response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
    }

    return response;
}
