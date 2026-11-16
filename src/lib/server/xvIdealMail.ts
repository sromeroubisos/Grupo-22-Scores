// El envío del mail de la votación. Usa la API HTTP de Resend con `fetch` pelado
// (igual que src/lib/leads/notifier.ts: sin SDK ni dependencia nueva).
//
// Es "lo mejor posible": el voto ya está guardado cuando se llama acá, así que
// un mail que no sale NUNCA hace fallar la votación. Devuelve qué pasó y la
// pantalla le dice la verdad a la persona.
//
// Ojo con el remitente: `onboarding@resend.dev` (el de prueba) solo entrega al
// mail dueño de la cuenta de Resend. Para mandarle a cualquier votante hay que
// verificar el dominio en Resend y poner XV_FROM_EMAIL, por ejemplo
// 'G22 Scores <votaciones@g22scores.com>'.

import { xvPlateBuffer } from '@/lib/server/xvIdealPlate';
import { ballotRows, buildVoteEmail } from '@/lib/xvIdeal/voteEmail';
import { isXvPollOpen, type XvPicks, type XvPoll } from '@/lib/xvIdeal/xvIdeal';

const FROM = process.env.XV_FROM_EMAIL || process.env.LEADS_FROM_EMAIL || 'G22 Scores <onboarding@resend.dev>';
const TIMEOUT_MS = 8000;

export type XvMailResult =
    | { sent: true }
    | { sent: false; reason: 'no-api-key' | 'rejected' | 'error' };

interface Attachment {
    filename: string;
    content: string;
}

async function post(to: string, subject: string, html: string, text: string, attachments: Attachment[]): Promise<XvMailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('[xv-ideal] sin RESEND_API_KEY: no se mandó el mail de la votación.');
        return { sent: false, reason: 'no-api-key' };
    }
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: [to], subject, html, text, ...(attachments.length ? { attachments } : {}) }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
            // El cuerpo trae el motivo (dominio sin verificar, cuota); va al log, no a la pantalla.
            console.warn(`[xv-ideal] Resend rechazó el mail (${response.status}): ${(await response.text()).slice(0, 300)}`);
            return { sent: false, reason: 'rejected' };
        }
        return { sent: true };
    } catch (error) {
        console.warn('[xv-ideal] no se pudo mandar el mail:', error);
        return { sent: false, reason: 'error' };
    }
}

/**
 * Manda a `to` la boleta guardada, con las dos placas adjuntas (posteo e
 * historia). Si las placas no se pueden dibujar, el mail sale igual sin ellas.
 */
export async function sendXvBallotEmail(params: { to: string; poll: XvPoll; picks: XvPicks; origin: string }): Promise<XvMailResult> {
    const rows = ballotRows(params.poll.slots, params.picks);
    const attachments: Attachment[] = [];
    try {
        const [post_, story] = await Promise.all([
            xvPlateBuffer({ rows, zoneName: params.poll.name, format: 'post' }),
            xvPlateBuffer({ rows, zoneName: params.poll.name, format: 'story' }),
        ]);
        attachments.push(
            { filename: 'mi-xv-ideal-posteo.png', content: post_.toString('base64') },
            { filename: 'mi-xv-ideal-historia.png', content: story.toString('base64') },
        );
    } catch (error) {
        console.warn('[xv-ideal] no se pudo dibujar la placa para el mail:', error);
    }

    const { subject, html, text } = buildVoteEmail({
        zoneName: params.poll.name,
        pollTitle: params.poll.title,
        rows,
        url: `${params.origin}/xv-ideal/${params.poll.groupKey}`,
        isOpen: isXvPollOpen(params.poll, Date.now()),
        withPlates: attachments.length > 0,
    });
    return post(params.to, subject, html, text, attachments);
}
