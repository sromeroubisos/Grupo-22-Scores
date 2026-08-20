/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
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

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
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

        const admin = createAdminClient() as any;
        const { data, error } = await admin
            .from('news')
            .select('*')
            .eq('scope', 'club')
            .eq('scope_id', clubId)
            .order('published_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ ok: true, data: data ?? [] });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar las noticias del club';
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

        const title = normalizeText(body.title);
        if (!title) return err('El titulo es obligatorio', 400);

        const status = normalizeText(body.status) === 'published' ? 'published' : 'draft';
        const admin = createAdminClient() as any;
        const payload = {
            title,
            summary: normalizeNullableText(body.summary),
            content: normalizeNullableText(body.content),
            image_url: normalizeNullableText(body.imageUrl),
            status,
            scope: 'club',
            scope_id: clubId,
            published_at: status === 'published' ? new Date().toISOString() : null,
        };

        const { data, error } = await admin
            .from('news')
            .insert(payload)
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar la noticia';
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

        const status = normalizeText(body.status) === 'published' ? 'published' : 'draft';
        const admin = createAdminClient() as any;
        const payload = {
            title: normalizeText(body.title),
            summary: normalizeNullableText(body.summary),
            content: normalizeNullableText(body.content),
            image_url: normalizeNullableText(body.imageUrl),
            status,
            scope: 'club',
            scope_id: clubId,
            published_at: status === 'published' ? new Date().toISOString() : null,
        };

        const { data, error } = await admin
            .from('news')
            .update(payload)
            .eq('id', id)
            .eq('scope', 'club')
            .eq('scope_id', clubId)
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar la noticia';
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
            .from('news')
            .delete()
            .eq('id', id)
            .eq('scope', 'club')
            .eq('scope_id', clubId);

        if (error) throw error;
        return NextResponse.json({ ok: true, success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar la noticia';
        return err(message, 500);
    }
}
