import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';

const REQUEST_RECIPIENT = process.env.CLUB_ACCESS_REQUEST_RECIPIENT || 'deportesgrupo@gmail.com';

type AccessRequestBody = {
    tournamentIds?: unknown;
    note?: unknown;
};

type EmailDraft = {
    to: string;
    replyTo: string | null;
    subject: string;
    text: string;
};

function err(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

function readNote(value: unknown, maxLength = 1200) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, maxLength);
}

function readIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean),
    )).slice(0, 50);
}

function buildMailtoUrl(payload: EmailDraft) {
    const params = new URLSearchParams({ subject: payload.subject, body: payload.text });
    return `mailto:${payload.to}?${params.toString().replace(/\+/g, '%20')}`;
}

async function maybeForwardByWebhook(payload: EmailDraft & { requestKind: string; userId: string | null; submittedAt: string }) {
    const webhookUrl = process.env.PROFILE_REQUEST_WEBHOOK_URL;
    if (!webhookUrl) return false;

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error('El webhook de solicitudes no respondió correctamente.');
    }

    return true;
}

/**
 * El admin de torneos solicita al Super Admin acceso a un grupo de torneos
 * que él mismo no creó. Se entrega por webhook (si está configurado) o
 * preparando un correo para el Super Admin.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    let body: AccessRequestBody;
    try {
        body = (await request.json()) as AccessRequestBody;
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const tournamentIds = readIds(body.tournamentIds);
    const note = readNote(body.note);

    if (tournamentIds.length === 0) {
        return err('Seleccioná al menos un torneo para solicitar acceso.', 400);
    }

    // Service-role: validate the selection even if some are drafts the RLS
    // SELECT policy would hide (otherwise the request 404s spuriously).
    const reader = getServiceWriter(supabase, 'admin/torneo/tournaments/access-request');
    const { data: tournaments, error: tournamentsError } = await reader
        .from('tournaments')
        .select('id, name, display_name, season_id, country')
        .in('id', tournamentIds);

    if (tournamentsError) {
        return err('No se pudieron validar los torneos seleccionados.', 500);
    }

    const found = tournaments ?? [];
    if (found.length === 0) {
        return err('Los torneos seleccionados ya no están disponibles.', 404);
    }

    const { data: authData } = await supabase.auth.getUser();
    const requesterEmail = authData?.user?.email ?? null;

    const lines = found.map((t) => {
        const label = t.display_name || t.name;
        const meta = [t.season_id, t.country].filter(Boolean).join(', ');
        return `- ${label}${meta ? ` (${meta})` : ''} [id: ${t.id}]`;
    });

    const draft: EmailDraft & { requestKind: string; userId: string | null; submittedAt: string } = {
        to: REQUEST_RECIPIENT,
        replyTo: requesterEmail,
        subject: `[Torneos] Solicitud de acceso a ${found.length} torneo(s)`,
        text: [
            'Solicitud: Acceso a torneos para un Administrador de Torneos',
            `Solicitante (user ID): ${context.userId}`,
            `Email del solicitante: ${requesterEmail ?? 'sin email'}`,
            '',
            `Torneos solicitados (${found.length}):`,
            ...lines,
            '',
            'Nota del solicitante:',
            note || 'Sin nota adicional.',
            '',
            'Para conceder el acceso: asigná al usuario una membership de admin/editor con scope_type=tournament sobre cada torneo listado.',
        ].join('\n'),
        requestKind: 'tournament_access',
        userId: context.userId,
        submittedAt: new Date().toISOString(),
    };

    try {
        const deliveredByWebhook = await maybeForwardByWebhook(draft);

        if (deliveredByWebhook) {
            return NextResponse.json({
                ok: true,
                delivery: 'webhook',
                recipient: REQUEST_RECIPIENT,
                requested: found.length,
                message: `Solicitud enviada al Super Admin para ${found.length} torneo(s).`,
            });
        }

        return NextResponse.json({
            ok: true,
            delivery: 'mailto',
            recipient: REQUEST_RECIPIENT,
            requested: found.length,
            message: `Preparamos el correo para ${REQUEST_RECIPIENT}. Solo falta enviarlo desde tu app de correo.`,
            mailtoUrl: buildMailtoUrl(draft),
        });
    } catch (error) {
        console.error('[api/admin/torneo/tournaments/access-request] POST error:', error);
        return err(error instanceof Error ? error.message : 'No se pudo procesar la solicitud.', 500);
    }
}
