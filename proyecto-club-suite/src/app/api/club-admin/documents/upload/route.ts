import { NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
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

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) {
            return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target || !canManageClubContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
            return NextResponse.json({ ok: false, error: 'Sin permisos para este club' }, { status: 403 });
        }

        const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
        const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'archivo';
        const filePath = `clubs/${clubId}/documents/${Date.now()}-${safeName}${extension ? `.${extension}` : ''}`;
        const buffer = await file.arrayBuffer();

        const admin = createAdminClient();
        const { error } = await admin.storage
            .from('club-assets')
            .upload(filePath, buffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
            });

        if (error) throw error;

        const { data } = admin.storage.from('club-assets').getPublicUrl(filePath);

        return NextResponse.json({
            ok: true,
            data: {
                filePath,
                fileUrl: data.publicUrl,
                mimeType: file.type || null,
                sizeBytes: file.size,
                fileName: file.name,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo subir el archivo';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
