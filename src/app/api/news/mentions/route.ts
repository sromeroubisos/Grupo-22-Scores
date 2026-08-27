// GET /api/news/mentions?q=tilos&kind=club&limit=12
//
// Qué se puede etiquetar en una noticia con ese texto: clubes, jugadores,
// torneos, partidos y videos de la web. Lo usa el editor al escribir `@`.
// Solo para quien puede administrar noticias: el buscador público del sitio
// es /api/search/universal; éste enumera partidos y videos por nombre y no
// hace falta abrirlo a todos.

import { NextResponse } from 'next/server';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { isMentionKind } from '@/lib/news/mentions';
import { searchNewsMentions } from '@/lib/server/newsMentions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { role } = await getServerAuthRole();
    if (!hasNewsManagementAccess(role)) {
        return NextResponse.json({ error: 'No tenés permiso para buscar menciones.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim();
    const rawKind = searchParams.get('kind');
    const kind = isMentionKind(rawKind) ? rawKind : null;
    const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '12', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 30) : 12;

    if (q.length < 2) {
        return NextResponse.json({ data: [] });
    }

    try {
        const data = await searchNewsMentions(q, kind, limit);
        return NextResponse.json({ data });
    } catch (error) {
        console.error('[api/news/mentions] search failed:', error);
        return NextResponse.json({ error: 'No se pudo buscar. Probá de nuevo.' }, { status: 500 });
    }
}
