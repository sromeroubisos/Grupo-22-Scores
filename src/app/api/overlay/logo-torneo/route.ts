// El logo del torneo para los marcadores: POST multipart { file }.
//
// Solo para quien tiene acceso a overlays y el plan premium. Devuelve la URL
// pública del logo ya recortado y en WebP; el generador la pone en la URL del
// overlay (`logo=`), y al aire se usa solo si el dueño del enlace es premium.

import { NextRequest, NextResponse } from 'next/server';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';
import { planRules } from '@/lib/overlay/overlayPlan';
import { uploadOverlayLogo } from '@/lib/server/overlayLogoUpload';
import { getOverlayPlan } from '@/lib/server/overlayPlanStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const access = await getOverlayAccess();
  if (access.status === 'signed-out') return fail('Iniciá sesión para subir el logo.', 401);
  if (access.status === 'denied') return fail('Tu cuenta no tiene acceso a overlays.', 403);

  const plan = await getOverlayPlan(access.userId, access.role).catch(() => null);
  if (!plan) return fail('No se pudo leer tu plan. Probá de nuevo.', 502);
  if (!planRules(plan).tournamentLogo) return fail('El logo del torneo es del plan Premium.', 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('El pedido no trae un archivo.', 400);
  }

  try {
    const result = await uploadOverlayLogo(form, `overlay-torneo/${access.userId}`, 'api/overlay/logo-torneo');
    if ('error' in result) return fail(result.error, result.status);
    const { url, width, height, ratio, bytes } = result;
    return NextResponse.json({ url, width, height, ratio, bytes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('[api/overlay/logo-torneo]', cause);
    return fail('No se pudo subir el logo.', 500);
  }
}
