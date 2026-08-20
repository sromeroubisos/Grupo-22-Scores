import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import type { TrainingEntry } from '@/lib/club-admin/trainings';
import {
    deleteClubTraining,
    getClubTrainings,
    isMissingClubTrainingsTableError,
    saveClubTraining,
} from '@/lib/club-admin/trainingStore';
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

function normalizeTraining(value: unknown): TrainingEntry | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || typeof candidate.date !== 'string') {
        return null;
    }

    return candidate as unknown as TrainingEntry;
}

function missingTableMessage() {
    return 'Falta la tabla club_trainings. Ejecuta la migracion 20260423113000_club_trainings.sql para habilitar la persistencia de entrenamientos.';
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const data = await getClubTrainings(clubId);
        return NextResponse.json({ ok: true, data: data ?? [] });
    } catch (error) {
        if (isMissingClubTrainingsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron cargar los entrenamientos';
        return err(message, 500);
    }
}

async function handleWrite(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        if (!clubId) return err('clubId required', 400);

        const access = await resolveClubAccess(clubId, MANAGEMENT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const training = normalizeTraining(body.training);
        if (!training) return err('training payload required', 400);

        const data = await saveClubTraining(clubId, training);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubTrainingsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudo guardar el entrenamiento';
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    return handleWrite(request);
}

export async function PUT(request: NextRequest) {
    return handleWrite(request);
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        if (!clubId) return err('clubId required', 400);

        const access = await resolveClubAccess(clubId, MANAGEMENT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const training = normalizeTraining(body.training);
        if (!training) return err('training payload required', 400);

        await deleteClubTraining(clubId, training);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (isMissingClubTrainingsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudo borrar el entrenamiento';
        return err(message, 500);
    }
}
