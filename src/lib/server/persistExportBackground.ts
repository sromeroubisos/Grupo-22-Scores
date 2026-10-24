import { createHash } from 'crypto';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { IMAGE_MAX_BYTES, RASTER_IMAGE_KINDS, sniffFile } from '@/lib/server/fileSniff';

/**
 * Manda el fondo PNG de un preset de exportación a Storage.
 *
 * Los presets editoriales y de gradiente guardaban la foto como data URI dentro
 * del `payload` de `user_export_presets`: ~1 MB de base64 por preset, 23 MB para
 * un usuario con 11. Abrir Exportar bajaba todo eso, lo parseaba y lo clonaba a
 * IndexedDB en el hilo principal, y la grilla "Tus fondos" decodificaba cada foto
 * a tamaño completo para pintar un cuadradito. Con esto el preset guarda dos URL
 * cortas: la foto (para el lienzo) y una miniatura (para la grilla).
 *
 * Misma receta que `persistClubLogo`: del lado del servidor con service_role, el
 * nombre sale del hash del contenido (la misma foto en diez presets es un solo
 * archivo) y el tipo de los bytes, nunca del data URI.
 */

const BUCKET = 'club-assets';
// Lado de la miniatura: la grilla la pinta a ~72 px, 240 cubre una pantalla 3x.
const THUMB_PX = 240;

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
};

export type ExportBackgroundResult =
    | { ok: true; src: string; thumb: string }
    | { ok: false; status: number; error: string };

export async function persistExportBackground(
    userId: string,
    dataUrl: string,
    options: { supabaseClient?: ReturnType<typeof createAdminClient> } = {},
): Promise<ExportBackgroundResult> {
    const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
    if (!match) return { ok: false, status: 400, error: 'El fondo tiene que llegar como data URI en base64.' };

    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.byteLength === 0) return { ok: false, status: 400, error: 'El fondo llegó vacío.' };
    if (bytes.byteLength > IMAGE_MAX_BYTES) return { ok: false, status: 413, error: 'El fondo pesa más de 5 MB.' };

    const sniffed = sniffFile(bytes);
    if (!sniffed || !RASTER_IMAGE_KINDS.has(sniffed.kind)) {
        return { ok: false, status: 400, error: 'El fondo tiene que ser PNG, JPG, WebP, GIF o AVIF.' };
    }

    let thumbBytes: Buffer;
    try {
        thumbBytes = await sharp(bytes, { limitInputPixels: 25_000_000 })
            .rotate()
            .resize(THUMB_PX, THUMB_PX, { fit: 'cover', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
    } catch {
        return { ok: false, status: 400, error: 'El fondo no es una imagen legible.' };
    }

    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const extension = MIME_TO_EXTENSION[sniffed.mime] || 'png';
    const fullPath = `export-backgrounds/${userId}/${digest}.${extension}`;
    const thumbPath = `export-backgrounds/${userId}/${digest}-thumb.webp`;
    const supabase = options.supabaseClient ?? createAdminClient();
    const bucket = supabase.storage.from(BUCKET);

    // El nombre es el hash del contenido: un mismo nombre nunca cambia de foto,
    // asi que puede cachearse un año.
    const [full, thumb] = await Promise.all([
        bucket.upload(fullPath, bytes, { contentType: sniffed.mime, upsert: true, cacheControl: '31536000' }),
        bucket.upload(thumbPath, thumbBytes, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' }),
    ]);
    const uploadError = full.error || thumb.error;
    if (uploadError) {
        console.warn('[persistExportBackground] Storage rechazó la subida', { fullPath, message: uploadError.message });
        return { ok: false, status: 502, error: 'Storage rechazó el fondo.' };
    }

    const src = bucket.getPublicUrl(fullPath).data?.publicUrl;
    const thumbUrl = bucket.getPublicUrl(thumbPath).data?.publicUrl;
    if (!src || !thumbUrl) return { ok: false, status: 502, error: 'No se pudo resolver la URL pública del fondo.' };

    return { ok: true, src, thumb: thumbUrl };
}
