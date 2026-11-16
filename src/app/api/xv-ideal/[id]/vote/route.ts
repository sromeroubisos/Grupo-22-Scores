import { NextRequest } from 'next/server';
import { z } from 'zod';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import {
    castXvIdealVote,
    getXvIdealPoll,
    XvIdealUnavailableError,
    XV_IDEAL_MIGRATION,
} from '@/lib/server/xvIdeal';
import { sendXvBallotEmail } from '@/lib/server/xvIdealMail';
import { json, jsonError, UUID } from '@/lib/server/videoPollsHttp';
import { maskEmail } from '@/lib/xvIdeal/voteEmail';
import { isCompleteBallot, isXvPollOpen, sanitizePicks } from '@/lib/xvIdeal/xvIdeal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VoteSchema = z.object({
    picks: z.record(z.string().max(4), z.string().trim().min(1).max(128)),
});

/**
 * POST /api/xv-ideal/:id/vote { picks: { "10": "10-ticinese", ... } } → { poll, emailed, emailTo }
 * Con sesión. Una boleta por persona y por zona: volver a votar la reemplaza entera.
 * La boleta tiene que traer las 15 camisetas de la zona; no hace falta votar las dos zonas.
 * Cierra con la votación. Guardado el voto, le manda a SU mail la boleta con las placas;
 * si el mail no sale, el voto igual quedó (`emailed: false`).
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const id = (await params).id?.trim() ?? '';
    if (!UUID.test(id)) return jsonError('Invalid poll id', 400);

    const { session } = await getServerAuthRole();
    const userId = session?.user?.id ?? null;
    const email = session?.user?.email ?? null;
    if (!userId) return jsonError('Unauthorized', 401);

    const body = await request.json().catch(() => null);
    const parsed = VoteSchema.safeParse(body);
    if (!parsed.success) return jsonError('Elegí un jugador en cada puesto para votar.', 400);

    try {
        const poll = await getXvIdealPoll(id);
        if (!poll) return jsonError('Esa votación no existe.', 404);
        if (!isXvPollOpen(poll, Date.now())) return jsonError('La votación ya cerró.', 409);
        const picks = sanitizePicks(poll.slots, parsed.data.picks);
        if (!isCompleteBallot(poll.slots, picks)) {
            const missing = poll.slots.length - Object.keys(picks).length;
            return jsonError(
                `Para votar tenés que completar el XV de la ${poll.name}: te faltan ${missing} ${missing === 1 ? 'puesto' : 'puestos'}.`,
                400,
            );
        }

        const summary = await castXvIdealVote(poll, userId, picks);

        // El voto ya está guardado: el mail es un extra y nunca lo hace fallar.
        let emailed = false;
        if (email) {
            const result = await sendXvBallotEmail({ to: email, poll, picks, origin: request.nextUrl.origin }).catch(() => null);
            emailed = Boolean(result?.sent);
        }
        return json({ poll: summary, emailed, emailTo: email ? maskEmail(email) : '' });
    } catch (error) {
        if (error instanceof XvIdealUnavailableError) {
            return jsonError(error.message, 503, { migration: XV_IDEAL_MIGRATION });
        }
        console.error('[xv-ideal] vote failed:', error);
        return jsonError('No se pudo guardar tu voto.', 500);
    }
}
