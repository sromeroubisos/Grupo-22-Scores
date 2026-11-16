import { NextRequest } from 'next/server';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { getXvIdealPoll, getXvIdealUserPicks } from '@/lib/server/xvIdeal';
import { isXvPlateFormat, xvPlateImage } from '@/lib/server/xvIdealPlate';
import { jsonError, UUID } from '@/lib/server/videoPollsHttp';
import { ballotRows } from '@/lib/xvIdeal/voteEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/xv-ideal/:id/placa?format=post|story[&download=1] → PNG
 * Con sesión. La placa del XV que ESA persona votó: nunca la de otra. Si todavía no votó, 409.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = (await params).id?.trim() ?? '';
    if (!UUID.test(id)) return jsonError('Invalid poll id', 400);

    const format = request.nextUrl.searchParams.get('format') ?? 'post';
    if (!isXvPlateFormat(format)) return jsonError('El formato tiene que ser post o story.', 400);

    const { session } = await getServerAuthRole();
    const userId = session?.user?.id ?? null;
    if (!userId) return jsonError('Unauthorized', 401);

    try {
        const poll = await getXvIdealPoll(id);
        if (!poll) return jsonError('Esa votación no existe.', 404);
        const picks = await getXvIdealUserPicks(poll, userId);
        if (!picks) return jsonError('Todavía no votaste en esta zona.', 409);

        const image = await xvPlateImage({ rows: ballotRows(poll.slots, picks), zoneName: poll.name, format });
        const headers = new Headers(image.headers);
        headers.set('Cache-Control', 'private, no-store');
        if (request.nextUrl.searchParams.get('download') === '1') {
            headers.set('Content-Disposition', `attachment; filename="mi-xv-ideal-${format === 'story' ? 'historia' : 'posteo'}.png"`);
        }
        return new Response(image.body, { status: 200, headers });
    } catch (error) {
        console.error('[xv-ideal] placa failed:', error);
        return jsonError('No se pudo armar la placa.', 500);
    }
}
