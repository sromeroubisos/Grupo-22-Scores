import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import type { ClubGymPlanInput } from '@/lib/club-admin/gymPlans';
import {
    getClubGymPlans,
    isMissingClubGymPlansTableError,
    saveClubGymPlan,
} from '@/lib/club-admin/gymPlanStore';
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

function normalizePlan(value: unknown): ClubGymPlanInput | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const title = normalizeText(candidate.title);
    const blocks = Array.isArray(candidate.blocks) ? candidate.blocks : [];

    if (!title || blocks.length === 0) {
        return null;
    }

    return {
        divisionId: normalizeText(candidate.divisionId) || null,
        title,
        objective: normalizeText(candidate.objective) || null,
        notes: normalizeText(candidate.notes) || null,
        durationMinutes: typeof candidate.durationMinutes === 'number'
            ? candidate.durationMinutes
            : Number(candidate.durationMinutes),
        blocks: blocks as ClubGymPlanInput['blocks'],
    };
}

function missingTableMessage() {
    return 'Falta la tabla club_gym_plans. Ejecuta la migracion 20260423170000_club_gym_plans.sql para habilitar la biblioteca de planes de gimnasio.';
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const data = await getClubGymPlans(clubId);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubGymPlansTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron cargar los planes de gimnasio';
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

        const plan = normalizePlan(body.plan);
        if (!plan) return err('plan payload required', 400);

        const data = await saveClubGymPlan(clubId, plan);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubGymPlansTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudo guardar el plan de gimnasio';
        return err(message, 500);
    }
}
