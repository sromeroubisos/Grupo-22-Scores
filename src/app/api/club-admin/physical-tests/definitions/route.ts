import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import type { ClubPhysicalTestDefinitionInput } from '@/lib/club-admin/physicalTestDefinitions';
import {
    getClubPhysicalTestDefinitions,
    isMissingClubPhysicalTestDefinitionsTableError,
    saveClubPhysicalTestDefinition,
} from '@/lib/club-admin/physicalTestDefinitionStore';
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

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeDirection(value: unknown) {
    const normalized = normalizeText(value);
    return normalized === 'lower' ? 'lower' : 'higher';
}

function normalizeDefinition(value: unknown): ClubPhysicalTestDefinitionInput | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const label = normalizeText(candidate.label);
    const metricKey = normalizeText(candidate.metricKey);

    if (!label || !metricKey) {
        return null;
    }

    return {
        divisionId: normalizeText(candidate.divisionId) || null,
        metricKey,
        label,
        unit: normalizeText(candidate.unit) || null,
        betterValueDirection: normalizeDirection(candidate.betterValueDirection),
        notes: normalizeText(candidate.notes) || null,
        isActive: candidate.isActive !== false,
    };
}

function missingTableMessage() {
    return 'Falta la tabla club_physical_test_definitions. Ejecuta la migracion 20260423162000_club_physical_test_definitions.sql para habilitar los testeos definidos por el PF.';
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const data = await getClubPhysicalTestDefinitions(clubId);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubPhysicalTestDefinitionsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron cargar los testeos';
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        if (!clubId) return err('clubId required', 400);

        const access = await resolveClubAccess(clubId, MANAGEMENT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const definition = normalizeDefinition(body.definition);
        if (!definition) {
            return err('definition payload required', 400);
        }

        const data = await saveClubPhysicalTestDefinition(clubId, definition);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubPhysicalTestDefinitionsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudo guardar el test';
        return err(message, 500);
    }
}
