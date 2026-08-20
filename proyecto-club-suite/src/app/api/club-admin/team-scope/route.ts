import { NextRequest, NextResponse } from 'next/server';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { getClubAdminTeamScope } from '@/lib/club-admin/teamScope';
import { createClient } from '@/lib/supabase/server';

function jsonError(message: string, status: number, details?: unknown) {
    return NextResponse.json({ ok: false, error: message, details: details ?? null }, { status });
}

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

function isMissingTableError(error: unknown) {
    const code = getErrorCode(error);
    return code === 'PGRST204' || code === 'PGRST205' || code === '42P01';
}

function isMissingColumnError(error: unknown) {
    return getErrorCode(error) === '42703';
}

function normalizeGroupPayload(input: unknown) {
    if (!Array.isArray(input)) return [];

    return input
        .map((group) => {
            if (!group || typeof group !== 'object') return null;

            const candidate = group as {
                name?: unknown;
                rosterOwnerClubId?: unknown;
                clubIds?: unknown;
            };
            const rosterOwnerClubId = typeof candidate.rosterOwnerClubId === 'string'
                ? candidate.rosterOwnerClubId
                : '';
            const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
            const clubIds = Array.isArray(candidate.clubIds)
                ? candidate.clubIds.filter((clubId): clubId is string => typeof clubId === 'string' && clubId.length > 0)
                : [];

            if (!rosterOwnerClubId) return null;

            return {
                name,
                rosterOwnerClubId,
                clubIds: Array.from(new Set([rosterOwnerClubId, ...clubIds])),
            };
        })
        .filter((group): group is { name: string; rosterOwnerClubId: string; clubIds: string[] } => (
            Boolean(group && group.clubIds.length >= 2)
        ));
}

export async function GET(request: NextRequest) {
    const clubId = request.nextUrl.searchParams.get('clubId');
    if (!clubId) {
        return jsonError('clubId es requerido', 400);
    }

    try {
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase);
        const managed = await getManagedClubSummaries(supabase, context.memberships);

        if (!managed.clubs.some((club) => club.id === clubId)) {
            return jsonError('Sin permisos sobre este equipo', 403);
        }

        const data = await getClubAdminTeamScope(
            supabase,
            clubId,
            context.memberships,
            context.rawRole,
        );

        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo resolver el alcance de equipos';
        const status = message === 'Unauthorized' ? 401 : 500;
        return jsonError(message, status);
    }
}

export async function PUT(request: NextRequest) {
    const supabase = await createClient();

    try {
        const context = await requireUserAccessContext(supabase);
        const body = await request.json().catch(() => null) as {
            clubId?: unknown;
            groups?: unknown;
        } | null;
        const clubId = typeof body?.clubId === 'string' ? body.clubId : '';

        if (!clubId) {
            return jsonError('clubId es requerido', 400);
        }

        const managed = await getManagedClubSummaries(supabase, context.memberships);
        if (!managed.clubs.some((club) => club.id === clubId)) {
            return jsonError('Sin permisos sobre este equipo', 403);
        }

        const scope = await getClubAdminTeamScope(
            supabase,
            clubId,
            context.memberships,
            context.rawRole,
        );

        if (!scope.canManageFamily) {
            return jsonError('Solo quienes gestionan la familia completa pueden editar planteles compartidos', 403);
        }

        const validClubIds = new Set(scope.teams.map((team) => team.id));
        const groups = normalizeGroupPayload(body?.groups).filter((group) => (
            validClubIds.has(group.rosterOwnerClubId) &&
            group.clubIds.every((clubMemberId) => validClubIds.has(clubMemberId))
        ));

        const { error: deleteError } = await supabase
            .from('club_family_divisions')
            .delete()
            .eq('family_base_club_id', scope.rootClubId);

        if (deleteError) {
            if (isMissingTableError(deleteError)) {
                return jsonError(
                    'La tabla club_family_divisions no existe. Ejecuta la migracion correspondiente antes de configurar planteles compartidos.',
                    409,
                    deleteError,
                );
            }

            return jsonError('No se pudieron limpiar los vinculos actuales', 500, deleteError);
        }

        const payload = groups.flatMap((group) => (
            group.clubIds
                .filter((clubMemberId) => clubMemberId !== group.rosterOwnerClubId)
                .map((clubMemberId) => ({
                    family_base_club_id: scope.rootClubId,
                    roster_owner_club_id: group.rosterOwnerClubId,
                    division_club_id: clubMemberId,
                    group_name: group.name || null,
                }))
        ));

        if (payload.length > 0) {
            const { error: upsertError } = await supabase
                .from('club_family_divisions')
                .upsert(payload, { onConflict: 'family_base_club_id,division_club_id' });

            if (upsertError) {
                if (isMissingTableError(upsertError)) {
                    return jsonError(
                        'La tabla club_family_divisions no existe. Ejecuta la migracion correspondiente antes de configurar planteles compartidos.',
                        409,
                        upsertError,
                    );
                }

                if (isMissingColumnError(upsertError)) {
                    return jsonError(
                        'Falta la columna group_name en club_family_divisions. Ejecuta la migracion que agrega nombres de grupo.',
                        409,
                        upsertError,
                    );
                }

                return jsonError('No se pudieron guardar los vinculos de plantel compartido', 500, upsertError);
            }
        }

        const data = await getClubAdminTeamScope(
            supabase,
            clubId,
            context.memberships,
            context.rawRole,
        );

        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron guardar los vinculos';
        const status = message === 'Unauthorized' ? 401 : 500;
        return jsonError(message, status);
    }
}
