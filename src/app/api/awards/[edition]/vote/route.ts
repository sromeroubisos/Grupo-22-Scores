import { NextRequest } from 'next/server';
import { z } from 'zod';

import { getAwardCategory } from '@/lib/awards/config';
import { castVote } from '@/lib/server/awards';
import {
    awardsErrorResponse,
    json,
    jsonError,
    requireVerifiedParticipant,
    resolveEdition,
    UUID,
} from '@/lib/server/awardsHttp';

export const dynamic = 'force-dynamic';

const VoteSchema = z.object({
    category: z.string().trim().min(1).max(64),
    finalistId: z.string().trim().regex(UUID),
});

/**
 * POST /api/awards/:edition/vote { category, finalistId } → { ok }
 * Con mail verificado. Un voto por persona y categoría: volver a votar lo cambia.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
    const config = await resolveEdition(params);
    if (!config) return jsonError('Esa edición no existe.', 404);

    const participant = await requireVerifiedParticipant();
    if (participant.ok === false) return participant.response;

    const parsed = VoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError('Elegí un candidato para votar.', 400);

    const category = getAwardCategory(config, parsed.data.category);
    if (!category) return jsonError('Esa categoría no existe.', 400);

    try {
        await castVote(config, category, participant.userId, parsed.data.finalistId);
        return json({ ok: true });
    } catch (error) {
        return awardsErrorResponse(error, 'No se pudo guardar tu voto.');
    }
}
