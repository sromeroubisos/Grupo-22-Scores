// Un logo para el overlay de sponsors: POST multipart { file } con el header
// `x-overlay-key: <clave del panel>`.
//
// El servidor no confía en el archivo: lo lee con sharp, RECORTA los márgenes
// transparentes (si no, un PNG con aire alrededor sale más chico que otro del
// mismo nivel), lo achica y lo re-codifica a WebP con transparencia. Devuelve
// la URL pública y la proporción del logo ya recortado, que es con lo que el
// overlay calcula su tamaño. El panel después lo suma al nivel con un PATCH.
//
// Tope de 4 MB: por debajo de los 4,5 MB con los que Vercel corta el pedido.
// El nombre sale del hash del contenido: subir dos veces el mismo logo
// reescribe el mismo objeto.

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPONSORS_BUCKET } from '@/lib/sponsors/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECEIVED_BYTES = 4 * 1024 * 1024;
// SVG no: puede traer scripts. Un PNG con transparencia es lo que se pide.
const ACCEPTED = new Set(['image/png', 'image/webp', 'image/jpeg']);
const MAX_SIDE = 1200;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function keyMatches(key: string, hash: string) {
  const given = Buffer.from(createHash('sha256').update(key).digest('hex'));
  const stored = Buffer.from(hash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail('Overlay inexistente.', 404);
  const key = request.headers.get('x-overlay-key') ?? '';

  const admin = createAdminClient();
  const { data: row, error } = await admin.from('overlay_controls').select('id, kind, edit_key_hash').eq('id', id).maybeSingle();
  if (error) return fail('No se pudo leer el overlay.', 502);
  if (!row) return fail('Overlay inexistente.', 404);
  if (!key || !keyMatches(key, String(row.edit_key_hash))) return fail('La clave del panel no es válida.', 403);
  if (row.kind !== 'sponsors') return fail('Este overlay no lleva logos.', 400);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('El pedido no trae un archivo.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Elegí un archivo PNG.', 400);
  if (!ACCEPTED.has(file.type.toLowerCase())) return fail('Formato no soportado: usá PNG (mejor con fondo transparente), WebP o JPG.', 415);
  if (file.size === 0) return fail('El archivo llegó vacío.', 400);
  if (file.size > MAX_RECEIVED_BYTES) return fail('El logo pesa demasiado (más de 4 MB). Exportalo más chico.', 413);

  try {
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
      return fail('No pudimos leer la imagen. Probá exportarla de nuevo como PNG.', 422);
    }
    if (!width || !height) return fail('La imagen no tiene contenido visible.', 422);

    const digest = createHash('sha256').update(output).digest('hex').slice(0, 20);
    const path = `overlay/${id}/${digest}.webp`;
    const { error: uploadError } = await admin.storage
      .from(SPONSORS_BUCKET)
      .upload(path, output, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
    if (uploadError) {
      console.error('[api/overlay/control/logo] upload failed:', uploadError);
      return fail('Storage rechazó el logo. Probá de nuevo en un rato.', 502);
    }
    const { data } = admin.storage.from(SPONSORS_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return fail('El logo se subió pero no se pudo resolver su URL.', 502);

    return NextResponse.json(
      { url: data.publicUrl, width, height, ratio: Math.round((width / height) * 1000) / 1000, bytes: output.byteLength },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (cause) {
    console.error('[api/overlay/control/logo]', cause);
    return fail('No se pudo subir el logo.', 500);
  }
}
