// Un logo para el overlay de sponsors: POST multipart { file } con el header
// `x-overlay-key: <clave del panel>`.
//
// El procesamiento (recorte, WebP, hash) es el mismo que el del logo del
// torneo: ver `lib/server/overlayLogoUpload.ts`. Devuelve la URL pública y la
// proporción del logo ya recortado, que es con lo que el overlay calcula su
// tamaño. El panel después lo suma al nivel con un PATCH.

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadOverlayLogo } from '@/lib/server/overlayLogoUpload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  try {
    const result = await uploadOverlayLogo(form, `overlay/${id}`, 'api/overlay/control/logo');
    if ('error' in result) return fail(result.error, result.status);
    const { url, width, height, ratio, bytes } = result;
    return NextResponse.json({ url, width, height, ratio, bytes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('[api/overlay/control/logo]', cause);
    return fail('No se pudo subir el logo.', 500);
  }
}
