import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

type ClubDerivativeRelationRow = {
    base_club_id: string;
    derived_club_id: string;
    derivative_type: string | null;
};

type ClubFamilyDivisionLinkRow = {
    family_base_club_id: string;
    roster_owner_club_id: string;
    division_club_id: string;
    group_name: string | null;
};

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

const CLUB_FAMILY_RELATION_TYPE = 'family';
function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getMissingFamiliesTableResponse(details?: unknown) {
    return jsonError(
        'La tabla club_derivatives no existe. Ejecuta la migracion 20260407120000_add_divisions_club_derivative_type.sql y vuelve a intentar.',
        409,
        details ?? null,
    );
}

export async function GET() {
    try {
        const authClient = await createClient();
        await requireGlobalAdminContext(authClient);
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const readClient = await getReadClient();
        const [{ data, error }, divisionLinksResult] = await Promise.all([
            readClient
            .from('club_derivatives')
            .select('base_club_id, derived_club_id, derivative_type')
            .order('base_club_id', { ascending: true }) as PromiseLike<{
                data: ClubDerivativeRelationRow[] | null;
                error: QueryError;
            }>,
            readClient
                .from('club_family_divisions')
                .select('family_base_club_id, roster_owner_club_id, division_club_id, group_name') as PromiseLike<{
                    data: ClubFamilyDivisionLinkRow[] | null;
                    error: QueryError;
                }>,
        ]);

        if (error) {
            if (isMissingTableError(error, 'club_derivatives')) {
                return NextResponse.json({ data: [], divisionLinks: [] });
            }

            return jsonError('Failed to load club families', 500, error.message || error.details || null);
        }

        const divisionLinksError = divisionLinksResult.error;
        let divisionLinks = divisionLinksError && isMissingTableError(divisionLinksError, 'club_family_divisions')
            ? []
            : Array.isArray(divisionLinksResult.data) ? divisionLinksResult.data : [];

        if (divisionLinksError && isMissingColumnError(divisionLinksError, 'group_name')) {
            const fallbackResult = await readClient
                .from('club_family_divisions')
                .select('family_base_club_id, roster_owner_club_id, division_club_id') as {
                    data: Omit<ClubFamilyDivisionLinkRow, 'group_name'>[] | null;
                    error: QueryError;
                };

            if (fallbackResult.error && !isMissingTableError(fallbackResult.error, 'club_family_divisions')) {
                return jsonError('Failed to load club family divisions', 500, fallbackResult.error.message || fallbackResult.error.details || null);
            }

            divisionLinks = Array.isArray(fallbackResult.data)
                ? fallbackResult.data.map((link) => ({ ...link, group_name: null }))
                : [];
        } else if (divisionLinksError && !isMissingTableError(divisionLinksError, 'club_family_divisions')) {
            return jsonError('Failed to load club family divisions', 500, divisionLinksError.message || divisionLinksError.details || null);
        }

        return NextResponse.json({
            data: Array.isArray(data) ? data : [],
            divisionLinks,
        });
    } catch (error) {
        return jsonError('Failed to load club families', 500, error instanceof Error ? error.message : String(error));
    }
}

export async function POST(request: NextRequest) {
    let authClient: Awaited<ReturnType<typeof createClient>>;

    try {
        authClient = await createClient();
        await requireGlobalAdminContext(authClient);
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const body = await request.json().catch(() => null) as {
            baseClubId?: unknown;
            derivedClubIds?: unknown;
            divisionGroups?: unknown;
            previousBaseClubId?: unknown;
        } | null;

        const baseClubId = typeof body?.baseClubId === 'string' ? body.baseClubId : '';
        const previousBaseClubId = typeof body?.previousBaseClubId === 'string' ? body.previousBaseClubId : '';
        const derivedClubIds = Array.isArray(body?.derivedClubIds)
            ? body.derivedClubIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [];
        const uniqueDerivedClubIds = Array.from(new Set(derivedClubIds)).filter((id) => id !== baseClubId);
        const divisionGroups = Array.isArray(body?.divisionGroups)
            ? body.divisionGroups
                .map((group) => {
                    if (!group || typeof group !== 'object') return null;
                    const candidate = group as { name?: unknown; rosterOwnerClubId?: unknown; divisionClubIds?: unknown };
                    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
                    const rosterOwnerClubId = typeof candidate.rosterOwnerClubId === 'string' ? candidate.rosterOwnerClubId : '';
                    const divisionClubIds = Array.isArray(candidate.divisionClubIds)
                        ? candidate.divisionClubIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
                        : [];

                    return rosterOwnerClubId
                        ? { name, rosterOwnerClubId, divisionClubIds: Array.from(new Set(divisionClubIds)).filter((id) => id !== rosterOwnerClubId) }
                        : null;
                })
                .filter((group): group is { name: string; rosterOwnerClubId: string; divisionClubIds: string[] } => Boolean(group && group.divisionClubIds.length > 0))
            : [];

        if (!baseClubId || uniqueDerivedClubIds.length === 0) {
            return jsonError('Select a base club and at least one related club', 400);
        }

        const { data: existingRelations, error: existingRelationsError } = await authClient
            .from('club_derivatives')
            .select('base_club_id, derived_club_id') as {
                data: Array<{ base_club_id: string; derived_club_id: string }> | null;
                error: QueryError;
            };

        if (existingRelationsError) {
            if (isMissingTableError(existingRelationsError, 'club_derivatives')) {
                return getMissingFamiliesTableResponse(existingRelationsError.message || existingRelationsError.details || null);
            }

            return jsonError('Failed to validate club family', 500, existingRelationsError.message || existingRelationsError.details || null);
        }

        const requestedClubIds = new Set([baseClubId, ...uniqueDerivedClubIds]);
        const editableFamilyClubIds = new Set<string>();

        if (previousBaseClubId) {
            editableFamilyClubIds.add(previousBaseClubId);
            for (const relation of existingRelations ?? []) {
                if (relation.base_club_id === previousBaseClubId) {
                    editableFamilyClubIds.add(relation.derived_club_id);
                }
            }
        }

        const conflictingRelation = (existingRelations ?? []).find((relation) => {
            const isExistingEditableFamily = previousBaseClubId
                && editableFamilyClubIds.has(relation.base_club_id)
                && editableFamilyClubIds.has(relation.derived_club_id);

            if (isExistingEditableFamily) return false;

            return requestedClubIds.has(relation.base_club_id) || requestedClubIds.has(relation.derived_club_id);
        });

        if (conflictingRelation) {
            return jsonError('Uno de los clubes seleccionados ya pertenece a otra familia.', 409, conflictingRelation);
        }

        if (previousBaseClubId) {
            const { error: deleteError } = await authClient
                .from('club_derivatives')
                .delete()
                .eq('base_club_id', previousBaseClubId);

            if (deleteError) {
                if (isMissingTableError(deleteError, 'club_derivatives')) {
                    return getMissingFamiliesTableResponse(deleteError.message || deleteError.details || null);
                }

                return jsonError('Failed to update club family', 500, deleteError.message || deleteError.details || null);
            }
        }

        const { error } = await authClient
            .from('club_derivatives')
            .upsert(
                uniqueDerivedClubIds.map((derivedClubId) => ({
                    base_club_id: baseClubId,
                    derived_club_id: derivedClubId,
                    derivative_type: CLUB_FAMILY_RELATION_TYPE,
                })),
                { onConflict: 'base_club_id,derived_club_id' },
            );

        if (error) {
            if (isMissingTableError(error, 'club_derivatives')) {
                return getMissingFamiliesTableResponse(error.message || error.details || null);
            }

            return jsonError('Failed to create club family', 500, error.message || error.details || null);
        }

        const familyClubIds = new Set([baseClubId, ...uniqueDerivedClubIds]);
        const divisionLinks = divisionGroups.flatMap((group) => {
            if (!familyClubIds.has(group.rosterOwnerClubId)) return [];

            return group.divisionClubIds
                .filter((divisionClubId) => familyClubIds.has(divisionClubId))
                .map((divisionClubId) => ({
                    family_base_club_id: baseClubId,
                    roster_owner_club_id: group.rosterOwnerClubId,
                    division_club_id: divisionClubId,
                    group_name: group.name || null,
                }));
        });

        if (divisionLinks.length > 0 || previousBaseClubId || baseClubId) {
            const deleteDivisionLinksQuery = authClient
                .from('club_family_divisions')
                .delete()
                .eq('family_base_club_id', previousBaseClubId || baseClubId);

            const { error: deleteDivisionLinksError } = await deleteDivisionLinksQuery;

            if (deleteDivisionLinksError) {
                if (isMissingTableError(deleteDivisionLinksError, 'club_family_divisions')) {
                    return jsonError(
                        'La tabla club_family_divisions no existe. Ejecuta la migracion 20260407143000_club_family_divisions.sql y vuelve a intentar.',
                        409,
                        deleteDivisionLinksError.message || deleteDivisionLinksError.details || null,
                    );
                }

                return jsonError('Failed to update club family divisions', 500, deleteDivisionLinksError.message || deleteDivisionLinksError.details || null);
            }
        }

        if (divisionLinks.length > 0) {
            const { error: divisionLinksError } = await authClient
                .from('club_family_divisions')
                .upsert(divisionLinks, { onConflict: 'family_base_club_id,division_club_id' });

            if (divisionLinksError) {
                if (isMissingTableError(divisionLinksError, 'club_family_divisions')) {
                    return jsonError(
                        'La tabla club_family_divisions no existe. Ejecuta la migracion 20260407143000_club_family_divisions.sql y vuelve a intentar.',
                        409,
                        divisionLinksError.message || divisionLinksError.details || null,
                    );
                }

                if (isMissingColumnError(divisionLinksError, 'group_name')) {
                    return jsonError(
                        'La columna group_name no existe en club_family_divisions. Ejecuta la migracion 20260407150000_add_group_name_to_club_family_divisions.sql para habilitar nombres de grupo.',
                        409,
                        divisionLinksError.message || divisionLinksError.details || null,
                    );
                }

                return jsonError('Failed to save club family divisions', 500, divisionLinksError.message || divisionLinksError.details || null);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return jsonError('Failed to create club family', 500, error instanceof Error ? error.message : String(error));
    }
}

export async function DELETE(request: NextRequest) {
    let authClient: Awaited<ReturnType<typeof createClient>>;

    try {
        authClient = await createClient();
        await requireGlobalAdminContext(authClient);
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const body = await request.json().catch(() => null) as {
            baseClubId?: unknown;
            derivedClubId?: unknown;
        } | null;

        const baseClubId = typeof body?.baseClubId === 'string' ? body.baseClubId : '';
        const derivedClubId = typeof body?.derivedClubId === 'string' ? body.derivedClubId : '';

        if (!baseClubId) {
            return jsonError('Select a family base club', 400);
        }

        let deleteQuery = authClient
            .from('club_derivatives')
            .delete()
            .eq('base_club_id', baseClubId);

        if (derivedClubId) {
            deleteQuery = deleteQuery.eq('derived_club_id', derivedClubId);
        }

        const { error } = await deleteQuery;

        if (error) {
            if (isMissingTableError(error, 'club_derivatives')) {
                return getMissingFamiliesTableResponse(error.message || error.details || null);
            }

            return jsonError('Failed to delete club family', 500, error.message || error.details || null);
        }

        let deleteDivisionLinksQuery = authClient
            .from('club_family_divisions')
            .delete()
            .eq('family_base_club_id', baseClubId);

        if (derivedClubId) {
            deleteDivisionLinksQuery = deleteDivisionLinksQuery.or(`division_club_id.eq.${derivedClubId},roster_owner_club_id.eq.${derivedClubId}`);
        }

        const { error: divisionLinksError } = await deleteDivisionLinksQuery;

        if (divisionLinksError && !isMissingTableError(divisionLinksError, 'club_family_divisions')) {
            return jsonError('Failed to delete club family divisions', 500, divisionLinksError.message || divisionLinksError.details || null);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return jsonError('Failed to delete club family', 500, error instanceof Error ? error.message : String(error));
    }
}
