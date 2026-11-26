import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  applyClockAction,
  applyScoreAction,
  mergeManualState,
  parseClockAction,
  parseScoreAction,
  readManualState,
  type ManualKind,
  type ManualScoreState,
} from '@/lib/overlay/manualOverlay';

/**
 * Un overlay manual.
 *
 *   GET    estado actual + la hora del servidor (el overlay corrige su reloj con ella)
 *   PATCH  { state?: {...parcial},
 *            clock?: 'start'|'pause'|'reset'|{set:segundos}|{adjust:±segundos},
 *            score?: {event:{team,type,player}} | {undo:true|<id del evento>} }
 *          con el header `x-overlay-key: <clave del panel>`
 *
 * Leer es público (es lo que ya se ve al aire); escribir pide la clave.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function keyMatches(key: string, hash: string) {
  const given = Buffer.from(createHash('sha256').update(key).digest('hex'));
  const stored = Buffer.from(hash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

async function load(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('overlay_controls')
    .select('id, kind, edit_key_hash, state, updated_at')
    .eq('id', id)
    .maybeSingle();
  return { admin, row: data as { id: string; kind: ManualKind; edit_key_hash: string; state: unknown; updated_at: string } | null, error };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return noStore({ error: 'Overlay inexistente.' }, 404);
  const { row, error } = await load(id);
  if (error) return noStore({ error: 'No se pudo leer el overlay.' }, 502);
  if (!row) return noStore({ error: 'Overlay inexistente.' }, 404);
  return noStore({
    id: row.id,
    kind: row.kind,
    state: readManualState(row.kind, row.state),
    updatedAt: row.updated_at,
    serverNow: new Date().toISOString(),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return noStore({ error: 'Overlay inexistente.' }, 404);
  const key = request.headers.get('x-overlay-key') ?? '';
  const { admin, row, error } = await load(id);
  if (error) return noStore({ error: 'No se pudo leer el overlay.' }, 502);
  if (!row) return noStore({ error: 'Overlay inexistente.' }, 404);
  if (!key || !keyMatches(key, row.edit_key_hash)) return noStore({ error: 'La clave del panel no es válida.' }, 403);

  const body = (await request.json().catch(() => ({}))) as { state?: unknown; clock?: unknown; score?: unknown };
  const now = Date.now();
  let state = mergeManualState(row.kind, row.state, body.state ?? {});
  if (row.kind === 'marcador') {
    const clockAction = parseClockAction(body.clock);
    if (clockAction) state = applyClockAction(state as ManualScoreState, clockAction, now);
    // El tanto se registra DESPUÉS de mover el reloj: queda en el segundo correcto.
    const scoreAction = parseScoreAction(body.score);
    if (scoreAction) state = applyScoreAction(state as ManualScoreState, scoreAction, now);
  }

  const { error: updateError } = await admin
    .from('overlay_controls')
    .update({ state, updated_at: new Date(now).toISOString() })
    .eq('id', id);
  if (updateError) return noStore({ error: 'No se pudo guardar.' }, 502);

  return noStore({ id, kind: row.kind, state, serverNow: new Date(now).toISOString() });
}
