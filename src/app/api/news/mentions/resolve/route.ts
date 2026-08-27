// GET /api/news/mentions/resolve?key=club:<id>&key=match:<id>&key=video:<idPartido>/<idVideo>
//
// Lo etiquetado en una nota, con su dato actual (nombre, escudo, partido con
// marcador, video con portada), para que la vista previa del editor dibuje
// lo mismo que el lector. Son entidades públicas: sin gate. La página de la
// nota no pasa por acá, resuelve en el servidor con la misma función.

import { NextResponse } from 'next/server';

import { parseMentionKey } from '@/lib/news/mentions';
import { MAX_RESOLVE_KEYS, resolveNewsMentions, type MentionKeyRef } from '@/lib/server/newsMentions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const refs: MentionKeyRef[] = [];
    for (const key of searchParams.getAll('key').slice(0, MAX_RESOLVE_KEYS)) {
        const parsed = parseMentionKey(key);
        if (parsed) refs.push(parsed);
    }

    if (refs.length === 0) {
        return NextResponse.json({ data: {} });
    }

    try {
        const data = await resolveNewsMentions(refs);
        const response = NextResponse.json({ data });
        response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return response;
    } catch (error) {
        console.error('[api/news/mentions/resolve] failed:', error);
        return NextResponse.json({ error: 'No se pudieron resolver las menciones.' }, { status: 500 });
    }
}
