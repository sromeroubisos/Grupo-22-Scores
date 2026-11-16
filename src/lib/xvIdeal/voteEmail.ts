// El mail con el que se despide la votación: la boleta de la persona, puesto por
// puesto. Módulo puro (arma el texto); el envío vive en src/lib/server/xvIdealMail.ts.

import type { XvPicks, XvSlot } from '@/lib/xvIdeal/xvIdeal';

export interface VoteEmailRow {
    jersey: number;
    label: string;
    name: string;
    team: string;
    /** Ruta del escudo (`/clubs/…png`) para la placa; null = sin escudo. */
    logo: string | null;
}

export interface VoteEmailInput {
    /** "Zona Campeonato". */
    zoneName: string;
    /** "XV Ideal del Argentino Juvenil M17 2026". */
    pollTitle: string;
    rows: VoteEmailRow[];
    /** Dirección de la votación, para volver a cambiar el voto. */
    url: string;
    /** Si la votación sigue abierta se invita a cambiarlo; si cerró, no. */
    isOpen: boolean;
    /** Si el mail lleva las placas adjuntas (posteo e historia). */
    withPlates: boolean;
}

/** La boleta como filas legibles, en orden de camiseta; lo que no existe en la votación se descarta. */
export function ballotRows(slots: readonly XvSlot[], picks: XvPicks): VoteEmailRow[] {
    const rows: VoteEmailRow[] = [];
    for (const slot of [...slots].sort((a, b) => a.jersey - b.jersey)) {
        const candidate = slot.candidates.find((entry) => entry.id === picks[String(slot.jersey)]);
        if (candidate) {
            rows.push({ jersey: slot.jersey, label: slot.label, name: candidate.name, team: candidate.team, logo: candidate.logo });
        }
    }
    return rows;
}

/** "juan.perez@gmail.com" → "j***@gmail.com": para mostrar a dónde fue el mail sin repetir la dirección entera. */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at < 1) return '';
    return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function buildVoteEmail(input: VoteEmailInput): { subject: string; html: string; text: string } {
    const subject = `Tu XV ideal de la ${input.zoneName} · G22 Scores`;
    const closing = input.isOpen
        ? 'Podés cambiar tu voto mientras la votación siga abierta.'
        : 'La votación ya cerró.';
    const plates = input.withPlates
        ? 'Te adjuntamos tu XV en dos placas, una para el feed y otra para historias, por si querés compartirlo.'
        : '';

    const text = [
        'Gracias por votar.',
        '',
        `${input.pollTitle} · ${input.zoneName}`,
        '',
        ...input.rows.map((row) => `${String(row.jersey).padStart(2, ' ')} · ${row.label}: ${row.name} (${row.team})`),
        '',
        ...(plates ? [plates, ''] : []),
        closing,
        input.url,
    ].join('\n');

    const rowsHtml = input.rows
        .map(
            (row) => `<tr>
<td style="padding:8px 10px;border-bottom:1px solid #1d3a57;color:#35cbef;font-weight:800;width:34px">${row.jersey}</td>
<td style="padding:8px 10px;border-bottom:1px solid #1d3a57;color:#a9c4d3;font-size:13px">${escapeHtml(row.label)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #1d3a57;color:#ffffff;font-weight:700">${escapeHtml(row.name)}<br><span style="color:#a9c4d3;font-weight:400;font-size:12px">${escapeHtml(row.team)}</span></td>
</tr>`,
        )
        .join('');

    const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px 12px;background:#07172b;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#0a2a4a;border:1px solid #2b7fa8;border-radius:16px">
<tr><td style="padding:24px 22px 8px">
<p style="margin:0 0 6px;color:#7dd3fc;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">Gracias por votar</p>
<h1 style="margin:0 0 6px;color:#ffffff;font-size:24px;line-height:1.15">Tu XV ideal de la ${escapeHtml(input.zoneName)}</h1>
<p style="margin:0 0 14px;color:#a9c4d3;font-size:14px">${escapeHtml(input.pollTitle)}</p>
</td></tr>
<tr><td style="padding:0 12px"><table role="presentation" width="100%" cellspacing="0">${rowsHtml}</table></td></tr>
<tr><td style="padding:18px 22px 24px">
${plates ? `<p style="margin:0 0 12px;color:#ffffff;font-size:14px">${escapeHtml(plates)}</p>` : ''}
<p style="margin:0 0 14px;color:#a9c4d3;font-size:14px">${escapeHtml(closing)}</p>
<a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 20px;background:#38bdf8;color:#06202e;text-decoration:none;border-radius:10px;font-weight:700">Ver la votación</a>
</td></tr>
</table>
<p style="text-align:center;color:#6f8da3;font-size:12px;margin:14px 0 0">G22 Scores · Salida de 22</p>
</body></html>`;

    return { subject, html, text };
}
