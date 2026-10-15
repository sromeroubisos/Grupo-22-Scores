// Subida genérica de imágenes de noticias (la usa newsService) al bucket
// público `news`.
//
// Antes confiaba en `file.type` y en la extensión del nombre, sin tope: un
// HTML con nombre "foto.html" quedaba servido como text/html desde nuestro
// Storage. Ahora el tipo sale de los bytes (fileSniff), la extensión sale del
// tipo real, solo pasan imágenes raster (nada de SVG ni HTML) y el tope es de
// 5 MB. Como /api/news/image, el nombre sale del hash del contenido.

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import sharp from 'sharp';

import { requireNewsSuperAdminServer } from '@/lib/auth/newsAccess';
import { IMAGE_MAX_BYTES, RASTER_IMAGE_KINDS, sniffFile } from '@/lib/server/fileSniff';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
    try {
        await requireNewsSuperAdminServer();
    } catch {
        return fail('No tenés permiso para subir imágenes.', 403);
    }

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return fail('El pedido no trae un archivo.', 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) return fail('No file provided', 400);
    if (file.size === 0) return fail('El archivo llegó vacío.', 400);
    if (file.size > IMAGE_MAX_BYTES) return fail('La imagen pesa más de 5 MB. Achicala antes de subirla.', 413);

    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffFile(bytes);
    if (!sniffed || !RASTER_IMAGE_KINDS.has(sniffed.kind)) {
        return fail('Formato no soportado: usá JPG, PNG, WebP, GIF o AVIF.', 415);
    }

    // Que la firma coincida no alcanza: tiene que decodificar como imagen.
    try {
        await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata();
    } catch {
        return fail('No pudimos leer la imagen. Probá exportarla de nuevo como PNG o JPG.', 422);
    }

    try {
        const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
        const filePath = `news/${digest}.${sniffed.ext}`;

        const supabaseAdmin = createAdminClient();
        const { error } = await supabaseAdmin.storage
            .from('news')
            .upload(filePath, bytes, {
                contentType: sniffed.mime,
                upsert: true,
                cacheControl: '31536000',
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('news')
            .getPublicUrl(filePath);

        return NextResponse.json({ url: publicUrl });
    } catch (err: unknown) {
        // El detalle de Storage al log; a la pantalla, un mensaje fijo.
        console.error('[UploadAPI] Error:', err);
        return fail('No se pudo subir la imagen. Probá de nuevo en unos segundos.', 500);
    }
}
