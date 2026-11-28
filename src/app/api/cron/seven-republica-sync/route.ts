/**
 * Seven de la República 2026 (Paraná, 28-29/11) desde la planilla pública de
 * la organización. Toda la lógica vive en `lib/integrations/sevenrepublica/sync.ts`.
 *
 *   GET /api/cron/seven-republica-sync           corrida normal
 *   GET /api/cron/seven-republica-sync?dry=1     plan sin escribir
 *   GET /api/cron/seven-republica-sync?forzar=1  corre fuera de la ventana del torneo
 *
 * `vercel.json` la llama cada 3 minutos; fuera del fin de semana del torneo
 * contesta sin bajar nada. La misma sincronización se puede correr a mano con
 * `npx tsx scripts/seven-republica/vivo.mjs --execute`.
 */
import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { SR_DESDE, SR_HASTA, sincronizarSevenRepublica } from '@/lib/integrations/sevenrepublica/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'seven-republica-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const forzar = url.searchParams.get('forzar') === '1';

  const ahora = Date.now();
  if (!forzar && (ahora < Date.parse(SR_DESDE) || ahora > Date.parse(SR_HASTA))) {
    return NextResponse.json({ ok: true, salteado: 'fuera de la ventana del torneo', desde: SR_DESDE, hasta: SR_HASTA });
  }

  const log: string[] = [];
  try {
    const resumen = await sincronizarSevenRepublica({ escribir: !enSeco, log: (l) => log.push(l) });
    return NextResponse.json({ ok: true, enSeco, ...resumen, log });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error('[seven-republica-sync]', mensaje);
    return NextResponse.json({ ok: false, error: mensaje, log }, { status: 500 });
  }
}
