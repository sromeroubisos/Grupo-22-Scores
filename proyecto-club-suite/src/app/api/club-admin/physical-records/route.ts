import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import type { ClubPhysicalRecordCategory, ClubPhysicalRecordInput } from '@/lib/club-admin/physicalRecords';
import {
    getClubPhysicalRecords,
    isMissingClubPhysicalRecordsTableError,
    saveClubPhysicalRecords,
} from '@/lib/club-admin/physicalRecordStore';
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

function normalizeCategory(value: unknown): ClubPhysicalRecordCategory | undefined {
    const normalized = normalizeText(value);
    if (normalized === 'weight' || normalized === 'test') {
        return normalized;
    }

    return undefined;
}

function normalizeRecord(value: unknown): ClubPhysicalRecordInput | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const personId = normalizeText(candidate.personId);
    const metricKey = normalizeText(candidate.metricKey);
    const metricLabel = normalizeText(candidate.metricLabel);
    const category = normalizeCategory(candidate.category);
    const recordedAt = normalizeText(candidate.recordedAt);
    const numericValue = typeof candidate.valueNumeric === 'number'
        ? candidate.valueNumeric
        : Number(candidate.valueNumeric);

    if (!personId || !metricKey || !metricLabel || !category || !recordedAt || !Number.isFinite(numericValue)) {
        return null;
    }

    return {
        personId,
        divisionId: normalizeText(candidate.divisionId) || null,
        category,
        metricKey,
        metricLabel,
        valueNumeric: numericValue,
        unit: normalizeText(candidate.unit) || null,
        recordedAt,
        source: normalizeText(candidate.source) || null,
        notes: normalizeText(candidate.notes) || null,
        payload: candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)
            ? candidate.payload as Record<string, unknown>
            : {},
    };
}

function missingTableMessage() {
    return 'Falta la tabla club_physical_records. Ejecuta la migracion 20260423153000_club_physical_records.sql para habilitar pesos y testeos fisicos.';
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const category = normalizeCategory(request.nextUrl.searchParams.get('category'));
        const metricKey = normalizeText(request.nextUrl.searchParams.get('metricKey')) || undefined;
        const personId = normalizeText(request.nextUrl.searchParams.get('personId')) || undefined;

        const data = await getClubPhysicalRecords(clubId, { category, metricKey, personId });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubPhysicalRecordsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron cargar los registros fisicos';
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

        const records = Array.isArray(body.records)
            ? body.records.map(normalizeRecord).filter((record): record is ClubPhysicalRecordInput => Boolean(record))
            : [];

        if (records.length === 0) {
            return err('records payload required', 400);
        }

        const data = await saveClubPhysicalRecords(clubId, records);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingClubPhysicalRecordsTableError(error)) {
            return err(missingTableMessage(), 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudieron guardar los registros fisicos';
        return err(message, 500);
    }
}
