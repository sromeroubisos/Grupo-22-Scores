import { NextRequest, NextResponse } from 'next/server';
import { tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { requireTournamentSponsorsAccess } from '@/lib/auth/tournamentSponsorsAccess';
import {
    TournamentSponsorsSchemaError,
    listTournamentSponsorsForAdmin,
    normalizeSponsorRow,
    persistSponsorLogo,
} from '@/lib/server/tournamentSponsors';
import { isDataImageUrl, summarizeSponsors, validateSponsorInput } from '@/lib/tournament/sponsors';

export const dynamic = 'force-dynamic';

/**
 * Sponsors de un torneo — vista de ADMINISTRACIÓN (incluye el monto).
 *
 * Permisos: los mismos que el resto del gestor del torneo. Un admin global
 * entra siempre; un gestor de torneos entra por su membresía sobre el torneo,
 * el deporte o la unión, o por ser el creador del torneo
 * (requireTournamentSponsorsAccess).
 */

function schemaOrGenericError(error: unknown) {
    if (error instanceof TournamentSponsorsSchemaError) {
        return NextResponse.json({ error: error.message, code: 'sponsors_schema_missing' }, { status: 503 });
    }
    return tournamentApiErrorResponse(error, 'No se pudieron cargar los sponsors.');
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        await requireTournamentSponsorsAccess(id, 'read');
        const sponsors = await listTournamentSponsorsForAdmin(id);
        return NextResponse.json({ data: sponsors, summary: summarizeSponsors(sponsors) });
    } catch (error) {
        return schemaOrGenericError(error);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    let context;
    try {
        context = await requireTournamentSponsorsAccess(id, 'write');
    } catch (error) {
        return tournamentApiErrorResponse(error);
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Payload JSON inválido' }, { status: 400 });
    }

    const validation = validateSponsorInput(body);
    if (validation.ok === false) {
        return NextResponse.json({ error: 'Revisá los datos del sponsor.', fieldErrors: validation.errors }, { status: 400 });
    }

    const input = validation.value;
    const pendingLogo = input.logo_url && isDataImageUrl(input.logo_url) ? input.logo_url : null;

    try {
        // Primero la fila (para tener el id que nombra el archivo), después el
        // logo. Si el logo falla el sponsor queda creado sin logo y se avisa.
        const { data, error } = await context.writer
            .from('tournament_sponsors')
            .insert({
                tournament_id: id,
                name: input.name,
                amount: input.amount,
                status: input.status,
                website_url: input.website_url,
                logo_url: pendingLogo ? null : input.logo_url,
                created_by: context.actorUserId,
            })
            .select('*')
            .single();

        if (error) {
            if (/tournament_sponsors/i.test(error.message || '') && /does not exist|schema cache/i.test(error.message || '')) {
                throw new TournamentSponsorsSchemaError();
            }
            return NextResponse.json({ error: error.message || 'No se pudo crear el sponsor.' }, { status: 500 });
        }

        let sponsor = normalizeSponsorRow(data as Record<string, unknown>);
        let warning: string | null = null;

        if (pendingLogo) {
            const uploaded = await persistSponsorLogo({ tournamentId: id, sponsorId: sponsor.id, dataUrl: pendingLogo });
            if ('url' in uploaded) {
                const { data: updated } = await context.writer
                    .from('tournament_sponsors')
                    .update({ logo_url: uploaded.url })
                    .eq('id', sponsor.id)
                    .eq('tournament_id', id)
                    .select('*')
                    .single();
                if (updated) sponsor = normalizeSponsorRow(updated as Record<string, unknown>);
            } else {
                warning = uploaded.error;
            }
        }

        return NextResponse.json({ data: sponsor, warning }, { status: 201 });
    } catch (error) {
        return schemaOrGenericError(error);
    }
}
