import { createHash } from 'crypto';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Manda el escudo de un club a Storage y devuelve una URL corta.
 *
 * El problema que resuelve: `LogoUploader` no sube nada — convierte el archivo a
 * un data URI y lo devuelve. Eso terminaba crudo en `clubs.logo_url`, así que
 * hoy hay ~905 clubes con escudos de hasta 870 KB guardados como texto en una
 * columna. De ahí salen el timeout de `/api/teams` (57014 al embeber `logo_url`
 * por fila) y el editor de identidad mostrando 867.634 caracteres de base64
 * dentro de un textarea.
 *
 * Los torneos ya lo hacían bien (`persistTournamentLogo`); los clubes no tenían
 * equivalente. Este es el equivalente, y va del lado del SERVIDOR a propósito:
 * corre con service_role, así que no depende de las políticas del bucket para el
 * cliente del navegador, y cubre a TODOS los que escriben un escudo
 * (`/api/clubs/[id]` y `/api/clubs/[id]/manage`) en un solo lugar en vez de
 * confiar en que cada formulario se acuerde.
 *
 * Nunca cancela un guardado. Si Storage rechaza la subida o el bucket no existe,
 * el escudo se queda como data URI —exactamente lo que pasaba antes— y el club
 * se guarda igual. La diferencia se informa en `warning` para que la UI lo diga
 * en vez de mentir un "guardado" limpio.
 */

const BUCKET = 'club-assets';

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
};

export type ClubLogoOrigin = 'empty' | 'url' | 'storage' | 'inline-fallback';

export interface ClubLogoPersistResult {
    url: string | null;
    origin: ClubLogoOrigin;
    warning?: string;
}

function extensionFor(mimeType: string) {
    return MIME_TO_EXTENSION[mimeType.toLowerCase()] || 'png';
}

function isBucketMissing(message: string | null | undefined) {
    return typeof message === 'string' && /bucket not found/i.test(message);
}

// Tope del escudo guardado: el proxy de escudos no sirve más de 512 px, y las
// placas de exportación lo dibujan más chico que eso.
const CREST_MAX_PX = 512;

/**
 * Achica el escudo antes de guardarlo.
 *
 * Los que llegaban por acá se subían tal cual: hay escudos de 263 KB en el bucket.
 * El 14/9 se migraron los 950 que seguían en base64 con esta misma receta y el
 * promedio bajó de 77 KB a 18 KB: paleta de 256 colores con alfa, que en un escudo
 * —arte plano— no se distingue del original. SVG (vectorial) y GIF (puede ser
 * animado) quedan como vienen. Si sharp no lo puede leer, o reencodar no achica,
 * va el original: esto nunca rompe una subida.
 */
export async function normalizeCrest(mimeType: string, bytes: Buffer): Promise<{ bytes: Buffer; mimeType: string }> {
    if (/svg|gif/i.test(mimeType)) {
        return { bytes, mimeType };
    }

    try {
        const normalized = await sharp(bytes)
            .rotate()
            .resize(CREST_MAX_PX, CREST_MAX_PX, { fit: 'inside', withoutEnlargement: true })
            .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
            .toBuffer();

        return normalized.length < bytes.length
            ? { bytes: normalized, mimeType: 'image/png' }
            : { bytes, mimeType };
    } catch {
        return { bytes, mimeType };
    }
}

export async function persistClubLogo(
    clubId: string,
    rawValue: unknown,
    options: { supabaseClient?: ReturnType<typeof createAdminClient> } = {},
): Promise<ClubLogoPersistResult> {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) {
        return { url: null, origin: 'empty' };
    }

    // Un SVG pegado a mano no es un archivo: se guarda como viene, igual que antes.
    // Es texto chico y el resto del sistema ya sabe leerlo.
    if (!value.startsWith('data:')) {
        return { url: value, origin: 'url' };
    }

    const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) {
        // data: URI sin base64 (por ejemplo `data:image/svg+xml,<svg…>`): es chico
        // y legible, no hay nada que subir.
        return { url: value, origin: 'url' };
    }

    const [, rawMimeType, base64] = match;
    let rawBytes: Buffer;
    try {
        rawBytes = Buffer.from(base64, 'base64');
    } catch {
        return { url: value, origin: 'inline-fallback', warning: 'El archivo del escudo no se pudo leer; quedó embebido.' };
    }

    if (rawBytes.byteLength === 0) {
        return { url: value, origin: 'inline-fallback', warning: 'El archivo del escudo llegó vacío; quedó embebido.' };
    }

    const { bytes, mimeType } = await normalizeCrest(rawMimeType, rawBytes);

    // El nombre sale del CONTENIDO, no de la hora: subir dos veces el mismo
    // escudo escribe el mismo archivo en vez de dejar huérfanos acumulándose en
    // el bucket, y el `upsert` lo vuelve idempotente.
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const filePath = `logos/${clubId}/${digest}.${extensionFor(mimeType)}`;
    const supabase = options.supabaseClient ?? createAdminClient();

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, bytes, { contentType: mimeType, upsert: true });

    if (error) {
        console.warn('[persistClubLogo] Storage rechazó la subida', {
            clubId,
            filePath,
            mimeType,
            bytes: bytes.byteLength,
            message: error.message,
        });

        return {
            url: value,
            origin: 'inline-fallback',
            warning: isBucketMissing(error.message)
                ? `El bucket "${BUCKET}" no existe: el escudo quedó embebido en la ficha del club.`
                : 'Storage rechazó el archivo: el escudo quedó embebido en la ficha del club.',
        };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
        return {
            url: value,
            origin: 'inline-fallback',
            warning: 'El escudo se subió pero no se pudo resolver su URL pública; quedó embebido.',
        };
    }

    return { url: publicUrl, origin: 'storage' };
}
