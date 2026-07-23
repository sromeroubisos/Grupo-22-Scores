import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getApiErrorStatus, requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { MATCH_REVIEW_STATUS } from '@/lib/matchReview';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { isUuid } from '@/lib/utils/postgrest';

type ReviewAction = 'approve' | 'reject';

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function normalizeReviewAction(value: unknown): ReviewAction | null {
  if (value === 'approve' || value === 'reject') return value;
  return null;
}

async function supportsMatchColumn(admin: ReturnType<typeof createAdminClient>, column: string) {
  const { error } = await admin
    .from('matches')
    .select(column)
    .limit(0);

  if (!error) return true;
  if (isMissingColumnError(error, column)) return false;
  return false;
}

async function writeReviewAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  matchId: string,
  action: ReviewAction,
  changes: Record<string, unknown>
) {
  try {
    await admin.from('admin_audit_log').insert({
      actor_user_id: actorUserId,
      entity_type: 'match',
      entity_id: matchId,
      action: `match_review_${action}`,
      changes,
      source: 'super-admin-matches',
    });
  } catch (error) {
    console.error('[super/matches/approval] audit log failed:', error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actorUserId: string;
  try {
    actorUserId = await requireGlobalAdminApiUser();
  } catch (error) {
    return jsonError('Unauthorized', getApiErrorStatus(error, 401));
  }

  try {
    const matchId = (await params).id;
    if (!isUuid(matchId)) {
      return jsonError('Identificador de partido invalido.', 400);
    }
    const body = await request.json().catch(() => ({}));
    const action = normalizeReviewAction((body as { action?: unknown }).action);

    if (!action) {
      return jsonError('Accion de revision invalida.', 400);
    }

    const admin = createAdminClient();
    const [supportsVisibility, supportsReviewStatus] = await Promise.all([
      supportsMatchColumn(admin, 'is_visible'),
      supportsMatchColumn(admin, 'review_status'),
    ]);

    if (!supportsVisibility || !supportsReviewStatus) {
      return jsonError('La base de datos aun no tiene las columnas de revision de partidos.', 409);
    }

    const reviewNotes = typeof (body as { reviewNotes?: unknown }).reviewNotes === 'string'
      ? (body as { reviewNotes: string }).reviewNotes.trim()
      : '';
    const approved = action === 'approve';
    const updates: Record<string, unknown> = {
      is_visible: approved,
      review_status: approved ? MATCH_REVIEW_STATUS.approved : MATCH_REVIEW_STATUS.rejected,
      reviewed_by_user_id: actorUserId,
      reviewed_at: new Date().toISOString(),
    };

    if (await supportsMatchColumn(admin, 'review_notes')) {
      updates.review_notes = reviewNotes || (approved
        ? 'Aprobado por Super Admin.'
        : 'Rechazado por Super Admin.');
    }

    const { data, error } = await admin
      .from('matches')
      .update(updates)
      .eq('id', matchId)
      .select('id, is_visible, review_status, reviewed_by_user_id, reviewed_at, review_notes')
      .maybeSingle();

    if (error) {
      return jsonError('No se pudo actualizar la revision del partido.', 500, error.message);
    }

    if (!data) {
      return jsonError('Partido no encontrado.', 404);
    }

    await writeReviewAuditLog(admin, actorUserId, matchId, action, updates);
    await invalidateMatchesFeedCaches(admin);
    revalidatePath('/admin/super/partidos');
    revalidatePath('/api/matches');

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError('No se pudo procesar la revision del partido.', 500, error instanceof Error ? error.message : String(error));
  }
}
