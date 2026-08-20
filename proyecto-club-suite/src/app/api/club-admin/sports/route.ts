import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

async function resolveClubAccess(clubId: string, allowedRoles: ReadonlySet<string>) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return { error: err('No autenticado', 401) };

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) return { error: err('Club no encontrado', 404) };

    if (!canManageClubContext(context, target, allowedRoles)) {
        return { error: err('Sin permisos para este club', 403) };
    }

    return { context, target };
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, VIEW_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const admin = createAdminClient() as any;
        const [{ data: rows, error }, { data: clubRow, error: clubError }] = await Promise.all([
            admin
                .from('club_enabled_sports')
                .select('sport_id, created_at')
                .eq('club_id', clubId)
                .order('created_at', { ascending: true }),
            admin
                .from('clubs')
                .select('sport, sport_id')
                .eq('id', clubId)
                .maybeSingle(),
        ]);

        if (error) throw error;
        if (clubError) throw clubError;

        const sportIds = Array.from(new Set([
            ...((rows ?? []).map((row: any) => row.sport_id)),
            clubRow?.sport_id,
            clubRow?.sport,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0)));

        return NextResponse.json({ ok: true, data: sportIds });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los deportes del club';
        return err(message, 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json() as { clubId?: string; sportIds?: string[] };
        const clubId = body.clubId;
        if (!clubId) return err('clubId required', 400);

        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const sportIds = Array.from(new Set((body.sportIds ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
        const admin = createAdminClient() as any;

        const { error: deleteError } = await admin
            .from('club_enabled_sports')
            .delete()
            .eq('club_id', clubId);

        if (deleteError) throw deleteError;

        if (sportIds.length > 0) {
            const { error: insertError } = await admin
                .from('club_enabled_sports')
                .insert(sportIds.map((sportId) => ({ club_id: clubId, sport_id: sportId })));

            if (insertError) throw insertError;
        }

        if (sportIds[0]) {
            const { error: clubUpdateError } = await admin
                .from('clubs')
                .update({ sport_id: sportIds[0], sport: sportIds[0] })
                .eq('id', clubId);

            if (clubUpdateError) {
                const message = `${clubUpdateError.message || ''}`.toLowerCase();
                if (!message.includes('sport') && !message.includes('schema cache')) {
                    throw clubUpdateError;
                }
            }
        }

        return NextResponse.json({ ok: true, data: sportIds });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron guardar los deportes del club';
        return err(message, 500);
    }
}
