import { createHash } from 'crypto';
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

    const [, mimeType, base64] = match;
    let bytes: Buffer;
    try {
        bytes = Buffer.from(base64, 'base64');
    } catch {
        return { url: value, origin: 'inline-fallback', warning: 'El archivo del escudo no se pudo leer; quedó embebido.' };
    }

    if (bytes.byteLength === 0) {
        return { url: value, origin: 'inline-fallback', warning: 'El archivo del escudo llegó vacío; quedó embebido.' };
    }

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
