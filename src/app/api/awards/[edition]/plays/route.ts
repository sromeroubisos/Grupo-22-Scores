import { NextRequest } from 'next/server';
import { z } from 'zod';

import { addPlay, findClub, getEditionState } from '@/lib/server/awards';
import {
    awardsErrorResponse,
    cleanHttpUrl,
    json,
    jsonError,
    requireVerifiedParticipant,
    resolveEdition,
} from '@/lib/server/awardsHttp';

export const dynamic = 'force-dynamic';

const PlaySchema = z.object({
    url: z.string().trim().min(8).max(600),
    title: z.string().trim().max(100).default(''),
    clubId: z.string().trim().min(1).max(128).optional(),
    ageGroup: z.string().trim().max(20).default(''),
    description: z.string().trim().max(400).default(''),
    consent: z.literal(true),
});

/**
 * POST /api/awards/:edition/plays { url, title?, clubId?, ageGroup?, description?, consent: true } → { ok }
 * La jugada de los pibes: un link a un video. Queda pendiente hasta que un
 * editor la apruebe. El permiso (video y menores) es obligatorio y queda guardado.
 * Las que llegan por mail las carga un editor desde el panel.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
    const config = await resolveEdition(params);
    if (!config) return jsonError('Esa edición no existe.', 404);

    const participant = await requireVerifiedParticipant();
    if (participant.ok === false) return participant.response;

    const parsed = PlaySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError('Pegá el link del video y confirmá el permiso para compartirlo.', 400);
    const body = parsed.data;

    const url = cleanHttpUrl(body.url);
    if (!url) return jsonError('El link del video no es válido.', 400);

    try {
        const state = await getEditionState(config);
        if (state.stage !== 'postulaciones') return jsonError('Ya no se reciben jugadas.', 409);

        const club = body.clubId ? await findClub(config, body.clubId) : null;
        await addPlay({
            edition: config.slug,
            userId: participant.userId,
            url,
            title: body.title,
            clubId: club?.id ?? null,
            clubName: club?.name ?? null,
            ageGroup: body.ageGroup,
            description: body.description,
            consent: true,
            via: 'link',
        });
        return json({ ok: true });
    } catch (error) {
        return awardsErrorResponse(error, 'No se pudo guardar la jugada.');
    }
}
