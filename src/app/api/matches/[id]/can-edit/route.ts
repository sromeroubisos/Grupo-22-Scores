import { NextRequest, NextResponse } from 'next/server';
import { ensureMatchManagementAccess } from '@/lib/server/matchCenterAdmin';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/matches/:id/can-edit -> { canEdit: boolean }
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
    await ensureMatchManagementAccess(id, MANAGEMENT_MEMBERSHIP_ROLES);
    return NextResponse.json({ canEdit: true });
  } catch {
    return NextResponse.json({ canEdit: false });
  }
}
