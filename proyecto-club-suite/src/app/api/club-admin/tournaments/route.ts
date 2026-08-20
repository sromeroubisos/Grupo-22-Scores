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
