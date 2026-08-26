import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
    deleteVideoPoll,
    getVideoPoll,
    summarizeVideoPoll,
    updateVideoPoll,
    validatePollOptions,
} from '@/lib/server/videoPolls';
import {
    json,
    jsonError,
    pollErrorResponse,
    requireEditor,
    PollClosesAtSchema,
    PollNameSchema,
    PollOptionsSchema,
    PollStatusSchema,
    PollTitleSchema,
    UUID,
} from '@/lib/server/videoPollsHttp';
import { isPollExpired, normalizePollOptions, type VideoPollOption } from '@/lib/videoHub/polls';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
    name: PollNameSchema.optional(),
    title: PollTitleSchema.optional(),
    status: PollStatusSchema.optional(),
    options: PollOptionsSchema.optional(),
    closesAt: PollClosesAtSchema.optional(),
});

async function resolvePollId(params: Promise<{ id: string }>) {
    const raw = (await params).id?.trim() ?? '';
    return UUID.test(raw) ? raw : null;
}

/**
 * PATCH /api/video-polls/:id { name?, title?, status?, options?, closesAt? } → { poll }
 * Solo quien administra noticias. Reabrir una votación vencida le borra la
 * fecha (si no viene una nueva): si no, seguiría cerrada por el reloj.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const editor = await requireEditor();
    if (editor.ok === false) return editor.response;

    const id = await resolvePollId(params);
    if (!id) return jsonError('Invalid poll id', 400);

    const body = await request.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
        return jsonError('Los cambios no tienen la forma esperada.', 400, parsed.error.issues);
    }

    try {
        const poll = await getVideoPoll(id);
        if (!poll) return jsonError('Esa votación no existe.', 404);

        let options: VideoPollOption[] | undefined;
        if (parsed.data.options) {
            options = normalizePollOptions(parsed.data.options);
            const check = await validatePollOptions(poll.tournamentId, options);
            if (check.ok === false) return jsonError(check.error, check.status);
        }

        let closesAt = parsed.data.closesAt;
        if (parsed.data.status === 'open' && closesAt === undefined && isPollExpired(poll, Date.now())) {
            closesAt = null;
        }

        const updated = await updateVideoPoll(id, {
            name: parsed.data.name,
            title: parsed.data.title,
            status: parsed.data.status,
            options,
            closesAt,
        });
        if (!updated) return jsonError('Esa votación no existe.', 404);

        return json({ poll: await summarizeVideoPoll(updated, editor.userId) });
    } catch (error) {
        return pollErrorResponse(error, 'No se pudo guardar la votación.');
    }
}

/** DELETE /api/video-polls/:id → { ok } — solo quien administra noticias. Se lleva los votos. */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const editor = await requireEditor();
    if (editor.ok === false) return editor.response;

    const id = await resolvePollId(params);
    if (!id) return jsonError('Invalid poll id', 400);

    try {
        await deleteVideoPoll(id);
        return json({ ok: true });
    } catch (error) {
        return pollErrorResponse(error, 'No se pudo eliminar la votación.');
    }
}
