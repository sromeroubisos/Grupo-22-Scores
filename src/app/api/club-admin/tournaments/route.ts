import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TOURNAMENT_REVIEW_STATUS } from '@/lib/tournamentReview';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

type TournamentOptionRow = {
    id: string;
    name: string;
    display_name?: string | null;
    season_id?: string | null;
    sport_id?: string | null;
    status?: string | null;
    is_visible?: boolean | null;
    review_status?: string | null;
    created_by_user_id?: string | null;
    created_by_club_id?: string | null;
};

function toOption(row: TournamentOptionRow) {
    return {
        id: row.id,
        name: row.display_name || row.name,
        originalName: row.name,
        seasonId: row.season_id ?? null,
        sportId: row.sport_id ?? null,
        status: row.status ?? null,
        reviewStatus: row.review_status ?? TOURNAMENT_REVIEW_STATUS.approved,
        isPending: row.review_status === TOURNAMENT_REVIEW_STATUS.pendingLink,
    };
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);

        if (!context) {
            return err('No autenticado', 401);
        }

        if (!clubId) {
            return err('club param required', 400);
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) {
            return err('Club no encontrado', 404);
        }

        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();
        const [officialRes, pendingRes] = await Promise.all([
            admin
                .from('tournaments')
                .select('id, name, display_name, season_id, sport_id, status, is_visible, review_status, created_by_user_id, created_by_club_id')
                .eq('is_visible', true)
                .in('status', ['active', 'published'])
                .order('name', { ascending: true })
                .limit(250),
            admin
                .from('tournaments')
                .select('id, name, display_name, season_id, sport_id, status, is_visible, review_status, created_by_user_id, created_by_club_id')
                .eq('review_status', TOURNAMENT_REVIEW_STATUS.pendingLink)
                .eq('created_by_user_id', context.userId)
                .eq('created_by_club_id', target.clubId)
                .order('created_at', { ascending: false })
                .limit(50),
        ]);

        if (officialRes.error) {
            return err(officialRes.error.message || 'No se pudieron cargar los torneos oficiales', 500);
        }

        if (pendingRes.error) {
            return err(pendingRes.error.message || 'No se pudieron cargar los torneos pendientes', 500);
        }

        const official = ((officialRes.data || []) as TournamentOptionRow[]).map(toOption);
        const pending = ((pendingRes.data || []) as TournamentOptionRow[]).map(toOption);

        return NextResponse.json({
            ok: true,
            data: {
                pending,
                official,
                tournaments: [...pending, ...official],
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los torneos';
        console.error('[api/club-admin/tournaments]', error);
        return err(message, 500);
    }
}

function slugifyCompetitionName(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function currentSeasonId() {
    // El año en hora argentina. `new Date().getFullYear()` usa la del servidor,
    // que en Vercel es UTC: el 31 de diciembre a las 22:00 de Buenos Aires ya
    // sería el año siguiente y la competencia nacería en la temporada errada.
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric' })
        .format(new Date());
}

/**
 * POST /api/club-admin/tournaments — la competencia propia del club.
 *
 * Nace OCULTA (`is_visible: false`, `status: 'draft'`) y en `pending_link`: es
 * una carpeta para agrupar los partidos del club dentro de su panel, no una
 * competencia de la plataforma. Mientras siga invisible, el feed general la
 * filtra sola —`/api/matches` descarta el partido cuyo torneo no es público— y
 * no compite con los torneos oficiales.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const clubId = normalizeText(body?.clubId ?? body?.club);
        const name = normalizeText(body?.name);

        if (!clubId) return err('club requerido', 400);
        if (!name) return err('Poné un nombre para la competencia', 400);
        if (name.length > 120) return err('El nombre no puede pasar de 120 caracteres', 400);

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) return err('Club no encontrado', 404);
        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();

        // Dos veces el mismo nombre en el mismo club es la misma carpeta: se
        // devuelve la que ya existe en vez de crear una gemela.
        const { data: existing } = await admin
            .from('tournaments')
            .select('id, name, display_name, season_id, sport_id, status, is_visible, review_status')
            .eq('created_by_club_id', target.clubId)
            .eq('review_status', TOURNAMENT_REVIEW_STATUS.pendingLink)
            .ilike('name', name)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ ok: true, data: toOption(existing as TournamentOptionRow), reused: true });
        }

        const { data, error } = await admin
            .from('tournaments')
            .insert({
                name,
                display_name: name,
                slug: `${slugifyCompetitionName(name) || 'competencia-club'}-${Date.now().toString(36)}`,
                season_id: currentSeasonId(),
                sport_id: target.sportId,
                union_id: target.unionId,
                status: 'draft',
                is_visible: false,
                review_status: TOURNAMENT_REVIEW_STATUS.pendingLink,
                created_by_user_id: context.userId,
                created_by_club_id: target.clubId,
                review_notes: 'Competencia propia del club, creada desde el Panel del Día.',
            })
            .select('id, name, display_name, season_id, sport_id, status, is_visible, review_status')
            .single();

        if (error) {
            console.error('[api/club-admin/tournaments] alta fallida', error);
            return err(error.message || 'No se pudo crear la competencia', 500);
        }

        return NextResponse.json({ ok: true, data: toOption(data as TournamentOptionRow) }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear la competencia';
        console.error('[api/club-admin/tournaments] POST', error);
        return err(message, 500);
    }
}
