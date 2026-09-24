// Un sponsor puntual: editar (PATCH) y borrar (DELETE).
//
// El dueño se lee de la FILA y no del pedido: nadie puede editar un sponsor
// de otro club diciendo que es del suyo.

import { NextResponse, type NextRequest } from 'next/server';

import { SPONSOR_NAME_MAX, checkSponsorImage, isSponsorFormat } from '@/lib/sponsors/formats';
import {
    SPONSORS_BUCKET,
    SPONSORS_TABLE,
    SPONSOR_COLUMNS,
    isOwnSponsorImageUrl,
    loadSponsorById,
    mapSponsorRow,
    normalizeLinkUrl,
    requireSponsorOwnerAccess,
    sponsorErrorResponseBody,
} from '@/lib/sponsors/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const { id } = await params;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return fail('El pedido no trae datos válidos.', 400);
    }

    try {
        const current = await loadSponsorById(id);
        if (!current) return fail('Ese sponsor ya no existe.', 404);
        await requireSponsorOwnerAccess({ type: current.ownerType, id: current.ownerId });

        const updates: Record<string, unknown> = {};

        if (body.name !== undefined) {
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (!name) return fail('Escribí el nombre de la marca.', 400);
            if (name.length > SPONSOR_NAME_MAX) return fail(`El nombre no puede pasar de ${SPONSOR_NAME_MAX} caracteres.`, 400);
            updates.name = name;
        }

        if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

        if (body.linkUrl !== undefined) {
            const linkUrl = normalizeLinkUrl(body.linkUrl);
            if (linkUrl === 'invalid') return fail('El link del sponsor no es una dirección web válida.', 400);
            updates.link_url = linkUrl;
        }

        // Formato e imagen van juntos: cambiar a logo con el banner viejo
        // dejaría un 16:9 metido en una celda cuadrada.
        const touchesImage = body.imageUrl !== undefined || body.format !== undefined;
        if (touchesImage) {
            const format = body.format === undefined ? current.format : body.format;
            if (!isSponsorFormat(format)) return fail('Elegí si es un banner o un logo.', 400);

            const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : current.imageUrl;
            if (!isOwnSponsorImageUrl(imageUrl)) return fail('Subí la imagen del sponsor antes de guardar.', 400);

            const width = body.imageWidth === undefined ? current.imageWidth : Number(body.imageWidth);
            const height = body.imageHeight === undefined ? current.imageHeight : Number(body.imageHeight);
            if (!Number.isInteger(width) || !Number.isInteger(height)) {
                return fail('Faltan las medidas de la imagen. Volvé a subirla.', 400);
            }
            const check = checkSponsorImage(format, width as number, height as number);
            if (!check.ok) {
                return fail(
                    body.imageUrl === undefined
                        ? `La imagen actual no sirve como ${format === 'logo' ? 'logo' : 'banner'}: subí una nueva. ${check.message}`
                        : check.message,
                    422,
                );
            }

            updates.format = format;
            updates.image_url = imageUrl;
            updates.image_width = width;
            updates.image_height = height;
        }

        if (Object.keys(updates).length === 0) return fail('No hay cambios para guardar.', 400);

        const admin = createAdminClient();
        const { data, error } = await admin
            .from(SPONSORS_TABLE)
            .update(updates)
            .eq('id', current.id)
            .select(SPONSOR_COLUMNS)
            .single();
        if (error) throw error;

        if (updates.image_url && updates.image_url !== current.imageUrl) {
            await removeImageIfUnused(current.imageUrl);
        }

        return NextResponse.json({ data: mapSponsorRow(data as never) });
    } catch (error) {
        const { status, body: payload } = sponsorErrorResponseBody(error, 'No se pudo actualizar el sponsor.');
        return NextResponse.json(payload, { status });
    }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const current = await loadSponsorById(id);
        if (!current) return fail('Ese sponsor ya no existe.', 404);
        await requireSponsorOwnerAccess({ type: current.ownerType, id: current.ownerId });

        const admin = createAdminClient();
        const { error } = await admin.from(SPONSORS_TABLE).delete().eq('id', current.id);
        if (error) throw error;

        await removeImageIfUnused(current.imageUrl);
        return NextResponse.json({ ok: true });
    } catch (error) {
        const { status, body: payload } = sponsorErrorResponseBody(error, 'No se pudo borrar el sponsor.');
        return NextResponse.json(payload, { status });
    }
}

/**
 * El nombre del archivo sale del contenido, así que dos sponsors del mismo
 * dueño con la misma imagen comparten objeto. Sólo se borra si nadie más lo usa.
 * Nunca hace fallar el pedido: un huérfano en Storage es un problema menor.
 */
async function removeImageIfUnused(imageUrl: string) {
    try {
        if (!isOwnSponsorImageUrl(imageUrl)) return;
        const admin = createAdminClient();
        const { count } = await admin
            .from(SPONSORS_TABLE)
            .select('id', { count: 'exact', head: true })
            .eq('image_url', imageUrl);
        if ((count ?? 0) > 0) return;

        const marker = `/storage/v1/object/public/${SPONSORS_BUCKET}/`;
        const path = decodeURIComponent(imageUrl.slice(imageUrl.indexOf(marker) + marker.length));
        await admin.storage.from(SPONSORS_BUCKET).remove([path]);
    } catch (error) {
        console.warn('[sponsors] no se pudo limpiar la imagen vieja:', error);
    }
}
