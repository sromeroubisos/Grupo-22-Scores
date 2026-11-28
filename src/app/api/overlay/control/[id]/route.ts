import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { latestLinkForManual } from '@/lib/server/overlayLinksStore';
import { canWriteManual } from '@/lib/server/overlayManualAuth';
import {
  applyClockAction,
  applyScoreAction,
  applyGameAction,
  applyShotAction,
  mergeManualState,
  parseClockAction,
  parseG22Score,
  parseGameAction,
  rebaseOnG22,
  parseScoreAction,
  parseShotAction,
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
 *            score?: {event:{team,type,player}} | {undo:true|<id del evento>},
 *            shot?: {start:{label,seconds,team}} | 'pause'|'resume'|'stop',
 *            game?: {add:{home,away,title,sport}} | {switch:<id>} | {remove:<id>} | {update:{id,…}} }
 *          con el header `x-overlay-key: <clave del panel>`
 *
 * Leer es público (es lo que ya se ve al aire); escribir pide la clave, o la
 * sesión de quien lo creó o lo gestiona por un link compartido (el panel abierto
 * desde Mis overlays manda `x-overlay-session: 1` para preguntarlo).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function load(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('overlay_controls')
    .select('id, kind, edit_key_hash, created_by, state, updated_at')
    .eq('id', id)
    .maybeSingle();
  return { admin, row: data as { id: string; kind: ManualKind; edit_key_hash: string; created_by: string | null; state: unknown; updated_at: string } | null, error };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return noStore({ error: 'Overlay inexistente.' }, 404);
  const { row, error } = await load(id);
  if (error) return noStore({ error: 'No se pudo leer el overlay.' }, 502);
  if (!row) return noStore({ error: 'Overlay inexistente.' }, 404);
  // El panel (con la clave, o con sesión si lo pregunta): también el enlace
  // guardado para OBS y su vencimiento, y si puede manejarlo.
  const key = request.headers.get('x-overlay-key') ?? '';
  const asks = Boolean(key) || request.headers.get('x-overlay-session') === '1';
  const canEdit = asks ? await canWriteManual(key, row) : undefined;
  const link = canEdit ? await latestLinkForManual(id).catch(() => null) : undefined;
  return noStore({
    ...(canEdit !== undefined ? { canEdit } : {}),
    ...(link !== undefined ? { link: link ? { path: link.path, token: link.token, expiresAt: link.expiresAt } : null } : {}),
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
  if (!(await canWriteManual(key, row))) {
    return noStore({ error: key ? 'La clave del panel no es válida.' : 'Entrá con tu cuenta de G22 (la que tiene este overlay) o abrí el link del panel con su clave.' }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as { state?: unknown; clock?: unknown; score?: unknown; shot?: unknown; game?: unknown; g22?: unknown };

  // Cada guardado lee la fila, aplica el cambio y escribe el estado ENTERO. Dos
  // pedidos a la vez (dos toques rápidos, o dos personas con el panel) se
  // pisaban: el segundo escribía sobre lo que leyó antes del primero. Ahora la
  // escritura solo pasa si `updated_at` sigue siendo el que se leyó; si otro
  // guardó en el medio, se relee y se vuelve a aplicar sobre lo nuevo.
  let current = row;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = Date.now();
    let base: unknown = current.state;
    // Corrección sobre un marcador vinculado a G22: primero, lo que se ve pasa a
    // ser lo cargado a mano (con cómo estaba G22), y recién ahí se aplica el cambio.
    const g22 = current.kind === 'marcador' ? parseG22Score(body.g22) : null;
    if (g22) base = rebaseOnG22(readManualState('marcador', current.state), g22);
    let state = mergeManualState(current.kind, base, body.state ?? {});
    if (current.kind === 'marcador') {
      // Pasar a otro partido va PRIMERO: lo demás del pedido cae sobre el que entra.
      const gameAction = parseGameAction(body.game);
      if (gameAction) state = applyGameAction(state as ManualScoreState, gameAction, now);
      const clockAction = parseClockAction(body.clock);
      if (clockAction) state = applyClockAction(state as ManualScoreState, clockAction, now);
      // El tanto se registra DESPUÉS de mover el reloj: queda en el segundo correcto.
      const scoreAction = parseScoreAction(body.score);
      if (scoreAction) state = applyScoreAction(state as ManualScoreState, scoreAction, now);
      const shotAction = parseShotAction(body.shot);
      if (shotAction) state = applyShotAction(state as ManualScoreState, shotAction, now);
    }
    // La marca nueva siempre posterior a la leída, aunque caigan en el mismo milisegundo.
    const stamp = new Date(Math.max(now, Date.parse(current.updated_at) + 1)).toISOString();
    const { data: written, error: updateError } = await admin
      .from('overlay_controls')
      .update({ state, updated_at: stamp })
      .eq('id', id)
      .eq('updated_at', current.updated_at)
      .select('id');
    if (updateError) return noStore({ error: 'No se pudo guardar.' }, 502);
    if (written && written.length) {
      return noStore({ id, kind: current.kind, state, serverNow: new Date(now).toISOString() });
    }
    const reread = await load(id);
    if (reread.error || !reread.row) return noStore({ error: 'No se pudo guardar.' }, 502);
    current = reread.row;
  }
  return noStore({ error: 'Hubo demasiados cambios a la vez. Probá de nuevo.' }, 409);
}
