import { NextRequest } from 'next/server';
import { z } from 'zod';

import { castVideoPollVote, getVideoPoll } from '@/lib/server/videoPolls';
import { json, jsonError, pollErrorResponse, verifiedUserId, UUID } from '@/lib/server/videoPollsHttp';
import { isPollOpen } from '@/lib/videoHub/polls';

export const dynamic = 'force-dynamic';

const VoteSchema = z.object({
    optionId: z.string().trim().min(1).max(256),
});

/**
 * POST /api/video-polls/:id/vote { optionId } → { poll }
 * Con sesión. Un voto por persona: volver a votar lo cambia. Cierra con la votación.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const id = (await params).id?.trim() ?? '';
    if (!UUID.test(id)) return jsonError('Invalid poll id', 400);

    const userId = await verifiedUserId();
    if (!userId) return jsonError('Unauthorized', 401);

    const body = await request.json().catch(() => null);
    const parsed = VoteSchema.safeParse(body);
    if (!parsed.success) return jsonError('Tenés que elegir un video.', 400);

    try {
        const poll = await getVideoPoll(id);
        if (!poll) return jsonError('Esa votación no existe.', 404);
        if (!isPollOpen(poll, Date.now())) return jsonError('La votación ya cerró.', 409);
        if (!poll.options.some((option) => option.id === parsed.data.optionId)) {
            return jsonError('Ese video no está en la votación.', 400);
        }

        return json({ poll: await castVideoPollVote(poll, userId, parsed.data.optionId) });
    } catch (error) {
        return pollErrorResponse(error, 'No se pudo guardar tu voto.');
    }
}
