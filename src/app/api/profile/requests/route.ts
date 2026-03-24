import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const REQUEST_RECIPIENT = 'deportesgrupo@gmail.com';

type CollaboratorBody = {
    kind?: unknown;
    fullName?: unknown;
    email?: unknown;
    city?: unknown;
    sport?: unknown;
    experience?: unknown;
    availability?: unknown;
};

type TournamentBody = {
    kind?: unknown;
    fullName?: unknown;
    email?: unknown;
    tournamentName?: unknown;
    sport?: unknown;
    location?: unknown;
    season?: unknown;
    website?: unknown;
    notes?: unknown;
};

type EmailDraft = {
    to: string;
    replyTo: string;
    subject: string;
    text: string;
    requestKind: 'collaborator' | 'tournament';
    userId: string | null;
    submittedAt: string;
};

class RequestValidationError extends Error {}

function readLine(value: unknown, maxLength = 160) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function readParagraph(value: unknown, maxLength = 1800) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .slice(0, maxLength);
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function maybeForwardByWebhook(payload: EmailDraft) {
    const webhookUrl = process.env.PROFILE_REQUEST_WEBHOOK_URL;

    if (!webhookUrl) {
        return false;
    }

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error('El webhook de solicitudes no respondio correctamente.');
    }

    return true;
}

function buildMailtoUrl(payload: EmailDraft) {
    const params = new URLSearchParams({
        subject: payload.subject,
        body: payload.text,
    });

    return `mailto:${payload.to}?${params.toString().replace(/\+/g, '%20')}`;
}

function buildCollaboratorDraft(
    body: CollaboratorBody,
    fallbackEmail: string | null,
    userId: string | null
) {
    const fullName = readLine(body.fullName);
    const email = readLine(body.email) || fallbackEmail || '';
    const city = readLine(body.city);
    const sport = readLine(body.sport);
    const experience = readParagraph(body.experience);
    const availability = readParagraph(body.availability);

    if (!fullName || !email || !city || !sport || experience.length < 20 || availability.length < 10) {
        throw new RequestValidationError('Completa todos los campos obligatorios para aplicar como colaborador.');
    }

    if (!isValidEmail(email)) {
        throw new RequestValidationError('El email de contacto no es valido.');
    }

    return {
        to: REQUEST_RECIPIENT,
        replyTo: email,
        subject: `[Perfil] Aplicacion a colaboradores de resultados - ${fullName}`,
        text: [
            'Solicitud: Aplicacion a colaboradores de resultados',
            `Nombre: ${fullName}`,
            `Email: ${email}`,
            `Ciudad o pais: ${city}`,
            `Deporte principal: ${sport}`,
            `Usuario ID: ${userId ?? 'sin sesion'}`,
            '',
            'Experiencia:',
            experience,
            '',
            'Disponibilidad:',
            availability,
        ].join('\n'),
        requestKind: 'collaborator' as const,
        userId,
        submittedAt: new Date().toISOString(),
    };
}

function buildTournamentDraft(
    body: TournamentBody,
    fallbackEmail: string | null,
    userId: string | null
) {
    const fullName = readLine(body.fullName);
    const email = readLine(body.email) || fallbackEmail || '';
    const tournamentName = readLine(body.tournamentName);
    const sport = readLine(body.sport);
    const location = readLine(body.location);
    const season = readLine(body.season);
    const website = readLine(body.website, 300);
    const notes = readParagraph(body.notes);

    if (!fullName || !email || !tournamentName || !sport || !location || !season || notes.length < 20) {
        throw new RequestValidationError('Completa todos los campos obligatorios para sumar un torneo.');
    }

    if (!isValidEmail(email)) {
        throw new RequestValidationError('El email de contacto no es valido.');
    }

    return {
        to: REQUEST_RECIPIENT,
        replyTo: email,
        subject: `[Perfil] Propuesta de torneo - ${tournamentName}`,
        text: [
            'Solicitud: Sumar un torneo especifico',
            `Nombre: ${fullName}`,
            `Email: ${email}`,
            `Torneo: ${tournamentName}`,
            `Deporte: ${sport}`,
            `Pais o region: ${location}`,
            `Temporada o edicion: ${season}`,
            `Link de referencia: ${website || 'No informado'}`,
            `Usuario ID: ${userId ?? 'sin sesion'}`,
            '',
            'Motivo de la propuesta:',
            notes,
        ].join('\n'),
        requestKind: 'tournament' as const,
        userId,
        submittedAt: new Date().toISOString(),
    };
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Necesitas iniciar sesion para enviar una solicitud.' },
                { status: 401 }
            );
        }

        const body = await request.json() as CollaboratorBody | TournamentBody;
        const kind = body.kind;
        const fallbackEmail = session.user.email ?? null;
        const userId = session.user.id;

        const draft = kind === 'collaborator'
            ? buildCollaboratorDraft(body, fallbackEmail, userId)
            : kind === 'tournament'
                ? buildTournamentDraft(body, fallbackEmail, userId)
                : null;

        if (!draft) {
            return NextResponse.json(
                { error: 'El tipo de solicitud no es valido.' },
                { status: 400 }
            );
        }

        const deliveredByWebhook = await maybeForwardByWebhook(draft);

        if (deliveredByWebhook) {
            return NextResponse.json({
                ok: true,
                delivery: 'webhook',
                recipient: REQUEST_RECIPIENT,
                message: 'Tu solicitud fue enviada correctamente.',
            });
        }

        return NextResponse.json({
            ok: true,
            delivery: 'mailto',
            recipient: REQUEST_RECIPIENT,
            message: `Preparamos el correo para ${REQUEST_RECIPIENT}. Solo falta enviarlo desde tu app de correo.`,
            mailtoUrl: buildMailtoUrl(draft),
        });
    } catch (error) {
        console.error('[api/profile/requests] POST error:', error);

        return NextResponse.json(
            {
                error: error instanceof Error
                    ? error.message
                    : 'No se pudo procesar la solicitud.',
            },
            { status: error instanceof RequestValidationError ? 400 : 500 }
        );
    }
}
