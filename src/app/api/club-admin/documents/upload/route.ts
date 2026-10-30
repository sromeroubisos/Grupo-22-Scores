import { NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { DOCUMENT_KINDS, DOCUMENT_MAX_BYTES, sniffFile } from '@/lib/server/fileSniff';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function sanitizeFileName(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const clubId = typeof formData.get('clubId') === 'string' ? String(formData.get('clubId')).trim() : '';
        const file = formData.get('file');

        if (!clubId) {
            return NextResponse.json({ ok: false, error: 'clubId required' }, { status: 400 });
        }

        if (!(file instanceof File)) {
            return NextResponse.json({ ok: false, error: 'file required' }, { status: 400 });
        }

        // Antes del permiso no se lee el contenido, pero el tope sí: un archivo
        // de 2 GB no tiene que llegar a arrayBuffer().
        if (file.size === 0) {
            return NextResponse.json({ ok: false, error: 'El archivo llegó vacío.' }, { status: 400 });
        }
        if (file.size > DOCUMENT_MAX_BYTES) {
            return NextResponse.json({ ok: false, error: 'El documento pesa más de 10 MB.' }, { status: 413 });
        }

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) {
            return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target || !canManageClubContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
            return NextResponse.json({ ok: false, error: 'Sin permisos para este club' }, { status: 403 });
        }

        // El tipo sale de los bytes, no de `file.type` ni del nombre: un HTML
        // con nombre "acta.pdf" quedaba servido como text/html desde el bucket
        // público. Solo PDF, Word, Excel y fotos (PNG/JPG).
        const bytes = Buffer.from(await file.arrayBuffer());
        const sniffed = sniffFile(bytes);
        if (!sniffed || !DOCUMENT_KINDS.has(sniffed.kind)) {
            return NextResponse.json({
                ok: false,
                error: 'Formato no soportado: subí un PDF, Word (.docx), Excel (.xlsx), PNG o JPG.',
            }, { status: 415 });
        }

        // La extensión la pone el tipo real; el path sale del id del club ya
        // resuelto, nunca del texto que mandó el cliente.
        const safeName = (sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'archivo').slice(0, 80);
        const filePath = `clubs/${target.clubId}/documents/${Date.now()}-${safeName}.${sniffed.ext}`;

        const admin = createAdminClient();
        const { error } = await admin.storage
            .from('club-assets')
            .upload(filePath, bytes, {
                contentType: sniffed.mime,
                upsert: false,
            });

        if (error) throw error;

        const { data } = admin.storage.from('club-assets').getPublicUrl(filePath);

        return NextResponse.json({
            ok: true,
            data: {
                filePath,
                fileUrl: data.publicUrl,
                mimeType: sniffed.mime,
                sizeBytes: bytes.byteLength,
                fileName: file.name,
            },
        });
    } catch (error) {
        console.error('[api/club-admin/documents/upload]', error);
        return NextResponse.json({ ok: false, error: 'No se pudo subir el archivo. Probá de nuevo en unos segundos.' }, { status: 500 });
    }
}
