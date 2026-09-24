// El orden de la vitrina: POST { ownerType, ownerId, ids } con TODOS los ids del
// dueño en el orden nuevo. Si falta uno o sobra uno de otro dueño, se rechaza
// entero: un orden a medias deja dos sponsors con el mismo lugar.

import { NextResponse, type NextRequest } from 'next/server';

import { isSponsorOwnerType } from '@/lib/sponsors/formats';
import {
    SPONSORS_TABLE,
    listOwnerSponsors,
    requireSponsorOwnerAccess,
    resolveSponsorOwner,
    sponsorErrorResponseBody,
} from '@/lib/sponsors/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return fail('El pedido no trae datos válidos.', 400);
    }

    if (!isSponsorOwnerType(body.ownerType)) return fail('ownerType tiene que ser club o tournament.', 400);
    const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === 'string') : [];
    if (ids.length === 0) return fail('Falta el orden nuevo.', 400);

    try {
        const owner = await resolveSponsorOwner(body.ownerType, String(body.ownerId ?? ''));
        if (!owner) return fail('No encontramos a quién pertenecen estos sponsors.', 404);
        await requireSponsorOwnerAccess(owner);

        const current = await listOwnerSponsors(owner);
        const currentIds = new Set(current.map((sponsor) => sponsor.id));
        const sameSet = ids.length === currentIds.size
            && new Set(ids).size === ids.length
            && ids.every((id) => currentIds.has(id));
        if (!sameSet) return fail('La lista cambió mientras la ordenabas. Recargá y probá de nuevo.', 409);

        const admin = createAdminClient();
        const changed = ids
            .map((id, index) => ({ id, index }))
            .filter(({ id, index }) => current.find((sponsor) => sponsor.id === id)?.sortOrder !== index);

        const results = await Promise.all(
            changed.map(({ id, index }) => admin.from(SPONSORS_TABLE).update({ sort_order: index }).eq('id', id)),
        );
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;

        return NextResponse.json({ data: await listOwnerSponsors(owner) });
    } catch (error) {
        const { status, body: payload } = sponsorErrorResponseBody(error, 'No se pudo guardar el orden.');
        return NextResponse.json(payload, { status });
    }
}
