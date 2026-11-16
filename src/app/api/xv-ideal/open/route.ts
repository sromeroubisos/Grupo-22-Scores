import { listOpenXvIdealGroups } from '@/lib/server/xvIdeal';
import { json } from '@/lib/server/videoPollsHttp';

export const dynamic = 'force-dynamic';

/** GET /api/xv-ideal/open → { groups: [{ groupKey, title, voters }] } — público; vacío si no hay votación abierta. */
export async function GET() {
    return json({ groups: await listOpenXvIdealGroups() });
}
