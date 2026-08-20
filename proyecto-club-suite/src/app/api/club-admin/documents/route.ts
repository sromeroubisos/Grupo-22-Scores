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

        const admin = createAdminClient() as any;
        const { data, error } = await admin
            .from('club_documents')
            .select('id, club_id, title, description, folder, visibility, file_url, file_path, mime_type, size_bytes, uploaded_by_user_id, created_at, updated_at')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ ok: true, data: data ?? [] });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los documentos';
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
        const fileUrl = normalizeText(body.fileUrl);

        if (!title) return err('El titulo es obligatorio', 400);
        if (!fileUrl) return err('fileUrl required', 400);

        const admin = createAdminClient() as any;
        const payload = {
            club_id: clubId,
            title,
            description: normalizeNullableText(body.description),
            folder: normalizeText(body.folder, 'General') || 'General',
            visibility: normalizeText(body.visibility, 'club') || 'club',
            file_url: fileUrl,
            file_path: normalizeNullableText(body.filePath),
            mime_type: normalizeNullableText(body.mimeType),
            size_bytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : null,
            uploaded_by_user_id: access.context.userId,
        };

        const { data, error } = await admin
            .from('club_documents')
            .insert(payload)
            .select('id, club_id, title, description, folder, visibility, file_url, file_path, mime_type, size_bytes, uploaded_by_user_id, created_at, updated_at')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar el documento';
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

        const admin = createAdminClient() as any;
        const updatePayload = {
            title: normalizeText(body.title),
            description: normalizeNullableText(body.description),
            folder: normalizeText(body.folder, 'General') || 'General',
            visibility: normalizeText(body.visibility, 'club') || 'club',
            file_url: normalizeText(body.fileUrl) || undefined,
            file_path: normalizeNullableText(body.filePath),
            mime_type: normalizeNullableText(body.mimeType),
            size_bytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : undefined,
        };

        const { data, error } = await admin
            .from('club_documents')
            .update(updatePayload)
            .eq('id', id)
            .eq('club_id', clubId)
            .select('id, club_id, title, description, folder, visibility, file_url, file_path, mime_type, size_bytes, uploaded_by_user_id, created_at, updated_at')
            .single();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar el documento';
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
        const { data: existing, error: readError } = await admin
            .from('club_documents')
            .select('file_path')
            .eq('id', id)
            .eq('club_id', clubId)
            .maybeSingle();

        if (readError) throw readError;

        const { error } = await admin
            .from('club_documents')
            .delete()
            .eq('id', id)
            .eq('club_id', clubId);

        if (error) throw error;

        if (existing?.file_path) {
            await admin.storage.from('club-assets').remove([existing.file_path]).catch(() => null);
        }

        return NextResponse.json({ ok: true, success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar el documento';
        return err(message, 500);
    }
}
