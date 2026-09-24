// Sponsors de un club o de un torneo.
//
//   GET  ?ownerType=club|tournament&ownerId=…            vitrina pública (activos y vigentes)
//   GET  ?ownerType=…&ownerId=…&scope=manage             todo, para el gestor (pide permiso)
//   POST { ownerType, ownerId, name, format, imageUrl, imageWidth, imageHeight, isActive? }
//
// La imagen se sube antes por /api/sponsors/upload, que la valida y la achica;
// acá sólo se acepta una URL de nuestro propio bucket.

import { NextResponse, type NextRequest } from 'next/server';

import {
    SPONSOR_NAME_MAX,
    checkSponsorImage,
    isSponsorFormat,
    isSponsorOwnerType,
} from '@/lib/sponsors/formats';
import {
    MISSING_TABLE_MESSAGE,
    SPONSORS_TABLE,
    SPONSOR_COLUMNS,
    SponsorApiError,
    isMissingSponsorsTable,
    isOwnSponsorImageUrl,
    listOwnerSponsors,
    listPublicSponsors,
    mapSponsorRow,
    normalizeLinkUrl,
    ownerColumn,
    requireSponsorOwnerAccess,
    resolveSponsorOwner,
    sponsorErrorResponseBody,
} from '@/lib/sponsors/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const ownerType = params.get('ownerType');
    const ownerId = params.get('ownerId') ?? '';
    const manage = params.get('scope') === 'manage';

    if (!isSponsorOwnerType(ownerType)) return fail('ownerType tiene que ser club o tournament.', 400);
    if (!ownerId.trim()) return fail('Falta ownerId.', 400);

    try {
        const owner = await resolveSponsorOwner(ownerType, ownerId);

        if (!manage) {
            const data = owner ? await listPublicSponsors(owner) : [];
            return NextResponse.json(
                { data },
                { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
            );
        }

        if (!owner) return fail('No encontramos ese torneo.', 404);
        await requireSponsorOwnerAccess(owner);
        const data = await listOwnerSponsors(owner);
        return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const { status, body } = sponsorErrorResponseBody(error, 'No se pudieron cargar los sponsors.');
        return NextResponse.json(body, { status });
    }
}

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return fail('El pedido no trae datos válidos.', 400);
    }

    const { ownerType, format } = body;
    if (!isSponsorOwnerType(ownerType)) return fail('ownerType tiene que ser club o tournament.', 400);
    if (!isSponsorFormat(format)) return fail('Elegí si es un banner o un logo.', 400);

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return fail('Escribí el nombre de la marca.', 400);
    if (name.length > SPONSOR_NAME_MAX) return fail(`El nombre no puede pasar de ${SPONSOR_NAME_MAX} caracteres.`, 400);

    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
    if (!imageUrl || !isOwnSponsorImageUrl(imageUrl)) return fail('Subí la imagen del sponsor antes de guardar.', 400);

    const imageWidth = Number(body.imageWidth);
    const imageHeight = Number(body.imageHeight);
    if (!Number.isInteger(imageWidth) || !Number.isInteger(imageHeight)) {
        return fail('Faltan las medidas de la imagen. Volvé a subirla.', 400);
    }
    const check = checkSponsorImage(format, imageWidth, imageHeight);
    if (!check.ok) return fail(check.message, 422);

    const linkUrl = normalizeLinkUrl(body.linkUrl);
    if (linkUrl === 'invalid') return fail('El link del sponsor no es una dirección web válida.', 400);

    try {
        const owner = await resolveSponsorOwner(ownerType, String(body.ownerId ?? ''));
        if (!owner) return fail('No encontramos a quién pertenece este sponsor.', 404);
        const { userId } = await requireSponsorOwnerAccess(owner);

        const admin = createAdminClient();
        const column = ownerColumn(owner.type);

        // Entra último en la vitrina.
        const { data: last, error: lastError } = await admin
            .from(SPONSORS_TABLE)
            .select('sort_order')
            .eq(column, owner.id)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (lastError) {
            if (isMissingSponsorsTable(lastError)) throw new SponsorApiError(MISSING_TABLE_MESSAGE, 503);
            throw lastError;
        }
        const nextOrder = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

        const { data, error } = await admin
            .from(SPONSORS_TABLE)
            .insert({
                owner_type: owner.type,
                [column]: owner.id,
                name,
                format,
                image_url: imageUrl,
                image_width: imageWidth,
                image_height: imageHeight,
                sort_order: nextOrder,
                is_active: body.isActive === undefined ? true : Boolean(body.isActive),
                link_url: linkUrl,
                created_by: userId,
            })
            .select(SPONSOR_COLUMNS)
            .single();

        if (error) throw error;
        return NextResponse.json({ data: mapSponsorRow(data as never) }, { status: 201 });
    } catch (error) {
        const { status, body: payload } = sponsorErrorResponseBody(error, 'No se pudo guardar el sponsor.');
        return NextResponse.json(payload, { status });
    }
}
