import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
    createVideoPoll,
    listVideoPolls,
    summarizeVideoPoll,
    validatePollOptions,
    VIDEO_POLLS_MIGRATION,
} from '@/lib/server/videoPolls';
import {
    json,
    jsonError,
    pollErrorResponse,
    requireEditor,
    verifiedUserId,
    PollClosesAtSchema,
    PollNameSchema,
    PollOptionsSchema,
    PollStatusSchema,
    PollTitleSchema,
    UUID,
} from '@/lib/server/videoPollsHttp';
import { normalizePollOptions } from '@/lib/videoHub/polls';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
    tournamentId: z.string().trim().regex(UUID),
    name: PollNameSchema,
    title: PollTitleSchema,
    status: PollStatusSchema.optional(),
    options: PollOptionsSchema,
    closesAt: PollClosesAtSchema.optional(),
});

/** GET /api/video-polls?tournament=:id → { available, polls } — público; trae el voto propio si hay sesión. */
export async function GET(request: NextRequest) {
    const tournamentId = request.nextUrl.searchParams.get('tournament')?.trim() ?? '';
    if (!UUID.test(tournamentId)) return jsonError('Falta el torneo.', 400);

    try {
        const userId = await verifiedUserId();
        const listing = await listVideoPolls(tournamentId, userId);
        return json({
            ...listing,
            ...(listing.available ? {} : { migration: VIDEO_POLLS_MIGRATION }),
        });
    } catch (error) {
        return pollErrorResponse(error, 'No se pudo cargar la votación.');
    }
}

/**
 * POST /api/video-polls { tournamentId, name, title, options: [{ matchId, videoId, label }], status?, closesAt? } → { poll }
 * Solo quien administra noticias. Cada opción tiene que ser un video real del torneo.
 */
export async function POST(request: NextRequest) {
    const editor = await requireEditor();
    if (editor.ok === false) return editor.response;

    const body = await request.json().catch(() => null);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
        return jsonError('La votación no tiene la forma esperada.', 400, parsed.error.issues);
    }

    try {
        const options = normalizePollOptions(parsed.data.options);
        const check = await validatePollOptions(parsed.data.tournamentId, options);
        if (check.ok === false) return jsonError(check.error, check.status);

        const poll = await createVideoPoll({
            tournamentId: parsed.data.tournamentId,
            name: parsed.data.name,
            title: parsed.data.title,
            status: parsed.data.status ?? 'open',
            options,
            closesAt: parsed.data.closesAt ?? null,
            createdBy: editor.userId,
        });
        return json({ poll: await summarizeVideoPoll(poll, editor.userId) }, { status: 201 });
    } catch (error) {
        return pollErrorResponse(error, 'No se pudo crear la votación.');
    }
}
