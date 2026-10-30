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

const DOCUMENTS_BUCKET = 'club-assets';

class DocumentValidationError extends Error {}

/**
 * Donde viven los documentos de ESTE club (lo arma documents/upload). El
 * `file_path` llegaba del body sin mirar y el DELETE hacía storage.remove con
 * service_role: un editor podía apuntar a un escudo, al documento de otro club
 * o a cualquier objeto del bucket y borrarlo.
 */
function clubDocumentsPrefix(clubId: string) {
    return `clubs/${clubId}/documents/`;
}

function isClubDocumentPath(clubId: string, filePath: string) {
    return (
        filePath.startsWith(clubDocumentsPrefix(clubId)) &&
        !filePath.includes('..') &&
        !filePath.includes('\\') &&
        !filePath.includes('//') &&
        /^[A-Za-z0-9._\/-]+$/.test(filePath)
    );
}

/**
 * Valida el par (path, url). Con path, la URL se recalcula desde Storage: así
 * no se puede guardar un path del club con una URL que apunte a otro lado.
 * Sin path (un link externo cargado a mano), la URL tiene que ser http(s).
 */
function resolveDocumentLocation(admin: any, clubId: string, rawPath: unknown, rawUrl: unknown) {
    const filePath = normalizeNullableText(rawPath);
    if (filePath) {
        if (!isClubDocumentPath(clubId, filePath)) {
            throw new DocumentValidationError('El archivo no pertenece a los documentos de este club.');
        }
        const { data } = admin.storage.from(DOCUMENTS_BUCKET).getPublicUrl(filePath);
        return { filePath, fileUrl: String(data?.publicUrl ?? '') };
    }

    const fileUrl = normalizeText(rawUrl);
    if (fileUrl && (fileUrl.length > 2048 || !/^https?:\/\//i.test(fileUrl))) {
        throw new DocumentValidationError('El link del documento tiene que empezar con https://.');
    }
    return { filePath: null, fileUrl };
}

/** El detalle de Supabase va al log; a la pantalla, un mensaje fijo. */
function failure(scope: string, error: unknown, fallback: string) {
    if (error instanceof DocumentValidationError) return err(error.message, 400);
    console.error(`[api/club-admin/documents][${scope}]`, error);
    return err(fallback, 500);
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
        return failure('GET', error, 'No se pudieron cargar los documentos');
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

        const admin = createAdminClient() as any;
        const { filePath, fileUrl } = resolveDocumentLocation(admin, clubId, body.filePath, body.fileUrl);
        if (!fileUrl) return err('fileUrl required', 400);
        const payload = {
            club_id: clubId,
            title,
            description: normalizeNullableText(body.description),
            folder: normalizeText(body.folder, 'General') || 'General',
            visibility: normalizeText(body.visibility, 'club') || 'club',
            file_url: fileUrl,
            file_path: filePath,
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
        return failure('POST', error, 'No se pudo guardar el documento');
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
        const location = resolveDocumentLocation(admin, clubId, body.filePath, body.fileUrl);
        const updatePayload = {
            title: normalizeText(body.title),
            description: normalizeNullableText(body.description),
            folder: normalizeText(body.folder, 'General') || 'General',
            visibility: normalizeText(body.visibility, 'club') || 'club',
            file_url: location.fileUrl || undefined,
            file_path: location.filePath,
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
        return failure('PUT', error, 'No se pudo actualizar el documento');
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

        // Solo se borra el objeto si es de los documentos de ESTE club: filas
        // viejas pueden traer cualquier path (antes no se validaba al crear).
        const storedPath = typeof existing?.file_path === 'string' ? existing.file_path : '';
        if (storedPath && isClubDocumentPath(clubId, storedPath)) {
            await admin.storage.from(DOCUMENTS_BUCKET).remove([storedPath]).catch(() => null);
        } else if (storedPath) {
            console.warn('[api/club-admin/documents][DELETE] path fuera del club, no se borra del bucket:', { clubId, id });
        }

        return NextResponse.json({ ok: true, success: true });
    } catch (error) {
        return failure('DELETE', error, 'No se pudo eliminar el documento');
    }
}
