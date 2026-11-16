import { NextRequest } from 'next/server';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { getXvIdealPoll, getXvIdealUserPicks, XvIdealUnavailableError, XV_IDEAL_MIGRATION } from '@/lib/server/xvIdeal';
import { sendXvBallotEmail } from '@/lib/server/xvIdealMail';
import { json, jsonError, UUID } from '@/lib/server/videoPollsHttp';
import { maskEmail } from '@/lib/xvIdeal/voteEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Un reenvío por persona y votación cada 60 s (en memoria: alcanza para frenar el botón apretado diez veces). */
const COOLDOWN_MS = 60_000;
const lastSent = new Map<string, number>();

/**
 * POST /api/xv-ideal/:id/email → { emailed, emailTo }
 * Con sesión. Reenvía a SU mail la boleta que ya guardó (con las placas); nunca a otra dirección.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const id = (await params).id?.trim() ?? '';
    if (!UUID.test(id)) return jsonError('Invalid poll id', 400);

    const { session } = await getServerAuthRole();
    const userId = session?.user?.id ?? null;
    const email = session?.user?.email ?? null;
    if (!userId) return jsonError('Unauthorized', 401);
    if (!email) return jsonError('Tu cuenta no tiene un mail asociado.', 400);

    const key = `${id}:${userId}`;
    if (Date.now() - (lastSent.get(key) ?? 0) < COOLDOWN_MS) {
        return jsonError('Ya te lo mandamos hace un momento. Probá de nuevo en un minuto.', 429);
    }

    try {
        const poll = await getXvIdealPoll(id);
        if (!poll) return jsonError('Esa votación no existe.', 404);
        const picks = await getXvIdealUserPicks(poll, userId);
        if (!picks) return jsonError('Todavía no votaste en esta zona.', 409);

        lastSent.set(key, Date.now());
        const result = await sendXvBallotEmail({ to: email, poll, picks, origin: request.nextUrl.origin });
        if (!result.sent) lastSent.delete(key);
        return json({ emailed: result.sent, emailTo: maskEmail(email) });
    } catch (error) {
        if (error instanceof XvIdealUnavailableError) {
            return jsonError(error.message, 503, { migration: XV_IDEAL_MIGRATION });
        }
        console.error('[xv-ideal] email failed:', error);
        return jsonError('No se pudo mandar el mail.', 500);
    }
}
