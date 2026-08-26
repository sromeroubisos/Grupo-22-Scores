// La imagen de una noticia, subida desde el editor al bucket público `news`
// (el mismo del que ya salen las notas con imagen). Solo el super admin de
// noticias. Devuelve la URL pública, que el editor guarda en `image_url`.
//
// El nombre del archivo sale del CONTENIDO (hash), como en persistClubLogo:
// subir dos veces la misma foto escribe el mismo archivo en vez de acumular
// huérfanos, y el upsert lo vuelve idempotente.

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireNewsSuperAdminServer } from '@/lib/auth/newsAccess';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'news';
const MAX_NEWS_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
};

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
    try {
        await requireNewsSuperAdminServer();
    } catch {
        return fail('No tenés permiso para subir imágenes de noticias.', 403);
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return fail('El pedido no trae un archivo.', 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) return fail('Elegí un archivo de imagen.', 400);

    const mime = file.type.toLowerCase();
    const ext = EXTENSION_BY_MIME[mime];
    if (!ext) return fail('Formato no soportado: usá JPG, PNG, WebP, GIF o AVIF.', 415);
    if (file.size === 0) return fail('El archivo llegó vacío.', 400);
    if (file.size > MAX_NEWS_IMAGE_BYTES) return fail('La imagen pesa más de 5 MB. Achicala antes de subirla.', 413);

    const bytes = Buffer.from(await file.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
    const path = `${digest}.${ext}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '31536000' });
    if (error) {
        console.error('[api/news/image] upload failed:', error);
        const missing = /bucket not found/i.test(error.message);
        return fail(
            missing
                ? `El bucket "${BUCKET}" no existe en Storage: hay que crearlo (público) antes de subir imágenes.`
                : 'Storage rechazó la imagen. Probá de nuevo o pegá una URL.',
            502,
        );
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return fail('La imagen se subió pero no se pudo resolver su URL pública.', 502);

    return NextResponse.json({ url: data.publicUrl, bytes: bytes.byteLength, type: mime });
}
