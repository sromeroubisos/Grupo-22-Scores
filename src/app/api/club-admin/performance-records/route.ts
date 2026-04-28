import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import {
    CLUB_PRIVATE_MODULE_KEYS,
    MATCH_GLOBAL_MODULE_KEYS,
    getPerformanceModule,
    type RugbyPerformanceRecord,
    type RugbyPerformanceScope,
} from '@/lib/performance/rugbyStaff';
import {
    deleteClubRugbyPerformanceRecord,
    getClubRugbyPerformanceRecords,
    isMissingRugbyPerformanceTableError,
    saveClubRugbyPerformanceRecords,
} from '@/lib/performance/rugbyStaffStore';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function missingTableMessage() {
    return 'Falta la tabla club_rugby_performance_records. Ejecuta la migracion 20260428090000_staff_performance_rugby.sql para habilitar rendimiento avanzado.';
}

function hasDirectClubMembership(
    memberships: Array<{ scopeType: string; scopeId?: string; role: string }>,
    familyClubIds: string[],
    allowedRoles: ReadonlySet<string>,
) {
    const allowedClubIds = new Set(familyClubIds);

    return memberships.some((membership) => (
        (membership.scopeType === 'club' || membership.scopeType === 'club_family')
        && Boolean(membership.scopeId && allowedClubIds.has(membership.scopeId))
        && allowedRoles.has(membership.role)
    ));
}

async function resolveAccess(clubId: string, allowedRoles: ReadonlySet<string>) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return { error: err('No autenticado', 401) };

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) return { error: err('Club no encontrado', 404) };

    const isGlobal = isGlobalAdminRole(context.role);
    const directClubAccess = hasDirectClubMembership(context.memberships, target.familyClubIds, allowedRoles);
    const broaderClubAccess = !isGlobal && canManageClubContext(context, target, allowedRoles);

    if (!isGlobal && !directClubAccess && !broaderClubAccess) {
        return { error: err('Sin permisos para este club', 403) };
    }

    return {
        context,
        target,
        matchAllowed: isGlobal || directClubAccess || broaderClubAccess,
        privateAllowed: directClubAccess,
    };
}

function normalizeRecord(value: unknown, clubId: string): RugbyPerformanceRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const id = normalizeText(candidate.id);
    const moduleKey = normalizeText(candidate.moduleKey);
    const performanceModule = getPerformanceModule(moduleKey);
    const eventDate = normalizeText(candidate.eventDate) || normalizeText((candidate.payload as Record<string, unknown> | undefined)?.date) || new Date().toISOString().slice(0, 10);
    const rawPayload = candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)
        ? candidate.payload as Record<string, string | number | boolean | null>
        : {};

    if (!id || !moduleKey) {
        return null;
    }

    return {
        id,
        clubId,
        moduleKey: performanceModule.key,
        scope: performanceModule.scope,
        context: candidate.context === 'match' || candidate.context === 'training' || candidate.context === 'gym' || candidate.context === 'review'
            ? candidate.context
            : performanceModule.contextOptions[0],
        matchId: normalizeText(candidate.matchId) || null,
        trainingId: normalizeText(candidate.trainingId) || null,
        playerId: normalizeText(candidate.playerId) || null,
        playerName: normalizeText(candidate.playerName),
        eventDate,
        payload: rawPayload,
    };
}

function filterReadableRecords(records: RugbyPerformanceRecord[], privateAllowed: boolean) {
    if (privateAllowed) {
        return records;
    }

    return records.filter((record) => record.scope === 'match_global');
}

function normalizeScopes(value: string | null, privateAllowed: boolean): RugbyPerformanceScope[] | undefined {
    const normalized = normalizeText(value);
    if (!normalized || normalized === 'all') {
        return privateAllowed ? undefined : ['match_global'];
    }

    if (normalized === 'match_global') return ['match_global'];
    if (normalized === 'club_private' && privateAllowed) return ['club_private'];
    return privateAllowed ? undefined : ['match_global'];
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        if (!clubId) return err('club param required', 400);

        const access = await resolveAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const scopes = normalizeScopes(request.nextUrl.searchParams.get('scope'), access.privateAllowed);
        const data = await getClubRugbyPerformanceRecords(clubId, { scopes });
        return NextResponse.json({
            ok: true,
            data: filterReadableRecords(data, access.privateAllowed),
            permissions: {
                matchAllowed: access.matchAllowed,
                privateAllowed: access.privateAllowed,
                matchModules: MATCH_GLOBAL_MODULE_KEYS,
                privateModules: access.privateAllowed ? CLUB_PRIVATE_MODULE_KEYS : [],
            },
        });
    } catch (error) {
        if (isMissingRugbyPerformanceTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron cargar los registros de rendimiento';
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        if (!clubId) return err('clubId required', 400);

        const access = await resolveAccess(clubId, MANAGEMENT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const records = Array.isArray(body.records)
            ? body.records.map((entry) => normalizeRecord(entry, clubId)).filter((entry): entry is RugbyPerformanceRecord => Boolean(entry))
            : [];

        if (records.length === 0) {
            return err('records payload required', 400);
        }

        if (!access.privateAllowed && records.some((record) => record.scope === 'club_private')) {
            return err('Superadmin solo puede operar eventos globales de partido, no datos privados de club', 403);
        }

        const data = await saveClubRugbyPerformanceRecords(clubId, records, access.context.userId);
        return NextResponse.json({ ok: true, data: filterReadableRecords(data, access.privateAllowed) });
    } catch (error) {
        if (isMissingRugbyPerformanceTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron guardar los registros de rendimiento';
        return err(message, 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        const recordId = normalizeText(body.recordId);
        if (!clubId || !recordId) return err('clubId and recordId required', 400);

        const access = await resolveAccess(clubId, MANAGEMENT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;
        if (!access.privateAllowed) return err('Sin permisos para borrar registros privados del club', 403);

        await deleteClubRugbyPerformanceRecord(clubId, recordId);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (isMissingRugbyPerformanceTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudo borrar el registro';
        return err(message, 500);
    }
}
