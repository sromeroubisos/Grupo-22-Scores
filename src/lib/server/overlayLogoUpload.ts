import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPONSORS_BUCKET } from '@/lib/sponsors/server';

/**
 * Subida de un logo para los overlays (sponsors y logo del torneo).
 *
 * El servidor no confía en el archivo: lo lee con sharp, RECORTA los márgenes
 * transparentes (si no, un PNG con aire alrededor sale más chico que otro),
 * lo achica y lo re-codifica a WebP con transparencia. El nombre sale del hash
 * del contenido: subir dos veces el mismo logo reescribe el mismo objeto.
 *
 * Tope de 4 MB: por debajo de los 4,5 MB con los que Vercel corta el pedido.
 */

export const MAX_LOGO_BYTES = 4 * 1024 * 1024;
// SVG no: puede traer scripts. Un PNG con transparencia es lo que se pide.
const ACCEPTED = new Set(['image/png', 'image/webp', 'image/jpeg']);
const MAX_SIDE = 1200;

export type LogoUpload =
  | { ok: true; url: string; width: number; height: number; ratio: number; bytes: number }
  | { ok: false; error: string; status: number };

/** Lee el archivo del form, lo procesa y lo sube a `<prefix>/<hash>.webp`. */
export async function uploadOverlayLogo(form: FormData, prefix: string, tag: string): Promise<LogoUpload> {
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Elegí un archivo PNG.', status: 400 };
  if (!ACCEPTED.has(file.type.toLowerCase())) return { ok: false, error: 'Formato no soportado: usá PNG (mejor con fondo transparente), WebP o JPG.', status: 415 };
  if (file.size === 0) return { ok: false, error: 'El archivo llegó vacío.', status: 400 };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: 'El logo pesa demasiado (más de 4 MB). Exportalo más chico.', status: 413 };

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  let width = 0;
  let height = 0;
  try {
    // trim(): saca el borde del color de la esquina —en un PNG transparente,
    // el aire transparente—. Si el logo es todo de un color, sharp falla y se
    // usa sin recortar.
    const trimmed = await sharp(input, { limitInputPixels: 50_000_000 }).rotate().trim({ threshold: 4 }).toBuffer()
      .catch(() => sharp(input, { limitInputPixels: 50_000_000 }).rotate().toBuffer());
    const result = await sharp(trimmed)
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    output = result.data;
    width = result.info.width;
    height = result.info.height;
  } catch {
    return { ok: false, error: 'No pudimos leer la imagen. Probá exportarla de nuevo como PNG.', status: 422 };
  }
  if (!width || !height) return { ok: false, error: 'La imagen no tiene contenido visible.', status: 422 };

  const admin = createAdminClient();
  const digest = createHash('sha256').update(output).digest('hex').slice(0, 20);
  const path = `${prefix}/${digest}.webp`;
  const { error: uploadError } = await admin.storage
    .from(SPONSORS_BUCKET)
    .upload(path, output, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
  if (uploadError) {
    console.error(`[${tag}] upload failed:`, uploadError);
    return { ok: false, error: 'Storage rechazó el logo. Probá de nuevo en un rato.', status: 502 };
  }
  const { data } = admin.storage.from(SPONSORS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return { ok: false, error: 'El logo se subió pero no se pudo resolver su URL.', status: 502 };
  return { ok: true, url: data.publicUrl, width, height, ratio: Math.round((width / height) * 1000) / 1000, bytes: output.byteLength };
}
