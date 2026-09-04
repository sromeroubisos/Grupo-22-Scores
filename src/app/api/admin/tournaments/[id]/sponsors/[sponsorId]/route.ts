import { NextRequest, NextResponse } from 'next/server';
import { tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { requireTournamentSponsorsAccess } from '@/lib/auth/tournamentSponsorsAccess';
import {
    TournamentSponsorsSchemaError,
    getTournamentSponsorForAdmin,
    normalizeSponsorRow,
    persistSponsorLogo,
    removeSponsorLogoObject,
} from '@/lib/server/tournamentSponsors';
import {
    isDataImageUrl,
    isTournamentSponsorStatus,
    validateSponsorInput,
} from '@/lib/tournament/sponsors';
import { isUuid } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

function schemaOrGenericError(error: unknown) {
    if (error instanceof TournamentSponsorsSchemaError) {
        return NextResponse.json({ error: error.message, code: 'sponsors_schema_missing' }, { status: 503 });
    }
    return tournamentApiErrorResponse(error, 'No se pudo actualizar el sponsor.');
}

/**
 * PATCH acepta dos formas:
 *  - Cambio puntual de estado: { status: 'active' | 'inactive' } (activar/desactivar).
 *  - Edición completa: { name, amount, status, website_url, logo_url }.
 *    `logo_url` puede ser una URL ya guardada (se conserva), un data: URL
 *    (se sube y reemplaza) o null/'' (se quita el logo).
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; sponsorId: string }> },
) {
    const { id, sponsorId } = await params;
    if (!isUuid(sponsorId)) {
        return NextResponse.json({ error: 'Sponsor inválido' }, { status: 400 });
    }

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

    try {
        const current = await getTournamentSponsorForAdmin(id, sponsorId);
        if (!current) {
            return NextResponse.json({ error: 'Sponsor no encontrado en este torneo' }, { status: 404 });
        }

        const keys = Object.keys(body);
        const isStatusOnly = keys.length === 1 && keys[0] === 'status';

        let updates: Record<string, unknown>;
        let pendingLogo: string | null = null;
        let removePreviousLogo = false;

        if (isStatusOnly) {
            if (!isTournamentSponsorStatus(body.status)) {
                return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
            }
            updates = { status: body.status };
        } else {
            const validation = validateSponsorInput({
                name: body.name ?? current.name,
                amount: body.amount === undefined ? current.amount : body.amount,
                status: body.status ?? current.status,
                website_url: body.website_url === undefined ? current.website_url : body.website_url,
                logo_url: body.logo_url === undefined ? current.logo_url : body.logo_url,
            });
            if (validation.ok === false) {
                return NextResponse.json({ error: 'Revisá los datos del sponsor.', fieldErrors: validation.errors }, { status: 400 });
            }
            const input = validation.value;
            updates = {
                name: input.name,
                amount: input.amount,
                status: input.status,
                website_url: input.website_url,
            };
            if (body.logo_url !== undefined) {
                if (input.logo_url && isDataImageUrl(input.logo_url)) {
                    pendingLogo = input.logo_url;
                    removePreviousLogo = true;
                } else {
                    updates.logo_url = input.logo_url;
                    removePreviousLogo = Boolean(current.logo_url) && input.logo_url !== current.logo_url;
                }
            }
        }

        let warning: string | null = null;
        if (pendingLogo) {
            const uploaded = await persistSponsorLogo({ tournamentId: id, sponsorId, dataUrl: pendingLogo });
            if ('url' in uploaded) {
                updates.logo_url = uploaded.url;
            } else {
                warning = uploaded.error;
                removePreviousLogo = false;
            }
        }

        const { data, error } = await context.writer
            .from('tournament_sponsors')
            .update(updates)
            .eq('id', sponsorId)
            .eq('tournament_id', id)
            .select('*')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message || 'No se pudo actualizar el sponsor.' }, { status: 500 });
        }

        if (removePreviousLogo && current.logo_url && current.logo_url !== updates.logo_url) {
            await removeSponsorLogoObject(current.logo_url);
        }

        return NextResponse.json({ data: normalizeSponsorRow(data as Record<string, unknown>), warning });
    } catch (error) {
        return schemaOrGenericError(error);
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; sponsorId: string }> },
) {
    const { id, sponsorId } = await params;
    if (!isUuid(sponsorId)) {
        return NextResponse.json({ error: 'Sponsor inválido' }, { status: 400 });
    }

    let context;
    try {
        context = await requireTournamentSponsorsAccess(id, 'write');
    } catch (error) {
        return tournamentApiErrorResponse(error);
    }

    try {
        const current = await getTournamentSponsorForAdmin(id, sponsorId);
        if (!current) {
            return NextResponse.json({ error: 'Sponsor no encontrado en este torneo' }, { status: 404 });
        }

        const { error } = await context.writer
            .from('tournament_sponsors')
            .delete()
            .eq('id', sponsorId)
            .eq('tournament_id', id);

        if (error) {
            return NextResponse.json({ error: error.message || 'No se pudo eliminar el sponsor.' }, { status: 500 });
        }

        await removeSponsorLogoObject(current.logo_url);

        return NextResponse.json({ data: { id: sponsorId } });
    } catch (error) {
        return schemaOrGenericError(error);
    }
}
