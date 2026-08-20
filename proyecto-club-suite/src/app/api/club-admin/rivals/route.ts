import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeName(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

type ClubRivalRow = {
    id: string;
    club_id: string;
    name: string;
    normalized_name: string;
    official_club_id?: string | null;
    created_by_user_id?: string | null;
    review_status: string;
    created_at: string;
};

function toOption(row: ClubRivalRow) {
    return {
        id: row.id,
        name: row.name,
        normalizedName: row.normalized_name,
        officialClubId: row.official_club_id ?? null,
        reviewStatus: row.review_status,
        createdAt: row.created_at,
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
        const { data, error } = await admin
            .from('club_rivals')
            .select('id, club_id, name, normalized_name, official_club_id, created_by_user_id, review_status, created_at')
            .eq('club_id', target.clubId)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            return err(error.message || 'No se pudieron cargar los rivales', 500);
        }

        const rows = (data || []) as ClubRivalRow[];
        return NextResponse.json({
            ok: true,
            data: {
                rivals: rows.map(toOption),
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los rivales';
        console.error('[api/club-admin/rivals]', error);
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const admin = createAdminClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);

        if (!context) {
            return err('No autenticado', 401);
        }

        const body = await request.json();
        const { clubId, name } = body;

        const target = await getClubManagementTarget(supabase, normalizeText(clubId));
        if (!target || !canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const normalizedName = normalizeName(normalizeText(name));
        if (!normalizedName) {
            return err('El nombre del rival es requerido', 400);
        }

        const { data: existing } = await admin
            .from('club_rivals')
            .select('id, name, normalized_name, review_status')
            .eq('club_id', target.clubId)
            .eq('normalized_name', normalizedName)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({
                ok: true,
                data: { rival: toOption(existing as ClubRivalRow), created: false },
            });
        }

        const { data, error } = await admin
            .from('club_rivals')
            .insert({
                club_id: target.clubId,
                name: normalizeText(name),
                normalized_name: normalizedName,
                created_by_user_id: context.userId,
                review_status: 'pending',
            })
            .select('id, club_id, name, normalized_name, official_club_id, created_by_user_id, review_status, created_at')
            .single();

        if (error) {
            return err(error.message || 'No se pudo guardar el rival', 500);
        }

        return NextResponse.json({
            ok: true,
            data: { rival: toOption(data as ClubRivalRow), created: true },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar el rival';
        console.error('[api/club-admin/rivals POST]', error);
        return err(message, 500);
    }
}
