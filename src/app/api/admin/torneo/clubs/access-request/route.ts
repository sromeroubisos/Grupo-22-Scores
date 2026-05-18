import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';

const REQUEST_RECIPIENT = process.env.CLUB_ACCESS_REQUEST_RECIPIENT || 'deportesgrupo@gmail.com';

type AccessRequestBody = {
    clubIds?: unknown;
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

function readClubIds(value: unknown): string[] {
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
 * El admin de torneos solicita al Super Admin acceso a un grupo de clubes
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

    const clubIds = readClubIds(body.clubIds);
    const note = readNote(body.note);

    if (clubIds.length === 0) {
        return err('Seleccioná al menos un club para solicitar acceso.', 400);
    }

    // Service-role: validate even hidden/draft clubs the RLS SELECT policy
    // would hide (otherwise the request 404s spuriously).
    const reader = getServiceWriter(supabase, 'admin/torneo/clubs/access-request');
    const { data: clubs, error: clubsError } = await reader
        .from('clubs')
        .select('id, name, slug, city, country')
        .in('id', clubIds);

    if (clubsError) {
        return err('No se pudieron validar los clubes seleccionados.', 500);
    }

    const foundClubs = clubs ?? [];
    if (foundClubs.length === 0) {
        return err('Los clubes seleccionados ya no están disponibles.', 404);
    }

    const { data: authData } = await supabase.auth.getUser();
    const requesterEmail = authData?.user?.email ?? null;

    const clubLines = foundClubs.map((club) => {
        const place = [club.city, club.country].filter(Boolean).join(', ');
        return `- ${club.name}${place ? ` (${place})` : ''} [id: ${club.id}]`;
    });

    const draft: EmailDraft & { requestKind: string; userId: string | null; submittedAt: string } = {
        to: REQUEST_RECIPIENT,
        replyTo: requesterEmail,
        subject: `[Torneos] Solicitud de acceso a ${foundClubs.length} club(es)`,
        text: [
            'Solicitud: Acceso a clubes para un Administrador de Torneos',
            `Solicitante (user ID): ${context.userId}`,
            `Email del solicitante: ${requesterEmail ?? 'sin email'}`,
            '',
            `Clubes solicitados (${foundClubs.length}):`,
            ...clubLines,
            '',
            'Nota del solicitante:',
            note || 'Sin nota adicional.',
            '',
            'Para conceder el acceso: asigná al usuario una membership de admin/editor con scope_type=club sobre cada club listado.',
        ].join('\n'),
        requestKind: 'club_access',
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
                requested: foundClubs.length,
                message: `Solicitud enviada al Super Admin para ${foundClubs.length} club(es).`,
            });
        }

        return NextResponse.json({
            ok: true,
            delivery: 'mailto',
            recipient: REQUEST_RECIPIENT,
            requested: foundClubs.length,
            message: `Preparamos el correo para ${REQUEST_RECIPIENT}. Solo falta enviarlo desde tu app de correo.`,
            mailtoUrl: buildMailtoUrl(draft),
        });
    } catch (error) {
        console.error('[api/admin/torneo/clubs/access-request] POST error:', error);
        return err(error instanceof Error ? error.message : 'No se pudo procesar la solicitud.', 500);
    }
}
