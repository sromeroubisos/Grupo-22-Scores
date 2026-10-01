import { NextRequest, NextResponse } from 'next/server';
import { ensureMatchManagementAccess, resolveMatchEditorHref } from '@/lib/server/matchCenterAdmin';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/matches/:id/can-edit -> { canEdit: boolean, editHref?: string }
 *
 * Authoritative visibility check for the public match page's
 * "Editar partido" button. Reuses the same gate the editor page itself
 * enforces (`ensureMatchManagementAccess`):
 *   - super / global / federation admin  -> true
 *   - admin of THIS match's tournament   -> true (scoped membership)
 *   - admin of another tournament        -> false
 *   - non-admin / anonymous              -> false
 *
 * Always responds 200 so the client can read the flag without console noise;
 * any failure (unauthorized, forbidden, not found) means canEdit:false.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const context = await ensureMatchManagementAccess(id, MANAGEMENT_MEMBERSHIP_ROLES);
    // El destino lo decide el servidor, que conoce el rol: el cliente solo sabe
    // si es super admin, y un admin de club mandado a /admin/torneo rebotaba.
    return NextResponse.json({ canEdit: true, editHref: resolveMatchEditorHref(context, id) });
  } catch {
    return NextResponse.json({ canEdit: false });
  }
}
