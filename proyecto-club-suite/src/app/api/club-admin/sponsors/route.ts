/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { getClubSponsors } from '@/lib/club-admin/sponsors';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
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

function normalizeText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNullableText(value: unknown) {
    const normalized = normalizeText(value);
    return normalized.length > 0 ? normalized : null;
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        if (!clubId) return err('club param required', 400);

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const data = await getClubSponsors(clubId);
        return NextResponse.json({ ok: true, data: data ?? [] });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los sponsors';
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        if (!clubId) return err('clubId required', 400);

        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const name = normalizeText(body.name);
        if (!name) return err('El nombre es obligatorio', 400);

        const payload = {
            club_id: clubId,
            name,
            tier: normalizeText(body.tier, 'colaborador') || 'colaborador',
            status: normalizeText(body.status, 'active') || 'active',
            placement: normalizeNullableText(body.placement),
            logo_url: normalizeNullableText(body.logoUrl),
            website: normalizeNullableText(body.website),
            notes: normalizeNullableText(body.notes),
            contract_start: normalizeNullableText(body.contractStart),
            contract_end: normalizeNullableText(body.contractEnd),
        };

        const admin = createAdminClient() as any;
        const { data, error } = await admin
            .from('club_sponsors')
            .insert(payload)
            .select('id, club_id, name, tier, status, placement, logo_url, website, notes, contract_start, contract_end, created_at, updated_at')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar el sponsor';
        return err(message, 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        const id = normalizeText(body.id);
        if (!clubId) return err('clubId required', 400);
        if (!id) return err('id required', 400);

        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const payload = {
            name: normalizeText(body.name),
            tier: normalizeText(body.tier, 'colaborador') || 'colaborador',
            status: normalizeText(body.status, 'active') || 'active',
            placement: normalizeNullableText(body.placement),
            logo_url: normalizeNullableText(body.logoUrl),
            website: normalizeNullableText(body.website),
            notes: normalizeNullableText(body.notes),
            contract_start: normalizeNullableText(body.contractStart),
            contract_end: normalizeNullableText(body.contractEnd),
        };

        const admin = createAdminClient() as any;
        const { data, error } = await admin
            .from('club_sponsors')
            .update(payload)
            .eq('id', id)
            .eq('club_id', clubId)
            .select('id, club_id, name, tier, status, placement, logo_url, website, notes, contract_start, contract_end, created_at, updated_at')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar el sponsor';
        return err(message, 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        const id = request.nextUrl.searchParams.get('id');
        if (!clubId) return err('club param required', 400);
        if (!id) return err('id param required', 400);

        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const admin = createAdminClient() as any;
        const { error } = await admin
            .from('club_sponsors')
            .delete()
            .eq('id', id)
            .eq('club_id', clubId);

        if (error) throw error;
        return NextResponse.json({ ok: true, success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar el sponsor';
        return err(message, 500);
    }
}
