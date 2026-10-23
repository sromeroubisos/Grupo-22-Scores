// Las noticias de un club: las que lo tienen como alcance (scope='club'), las
// que lo mencionan en el cuerpo (`@[Los Tilos](club:<id>)`) y las que llevan su
// nombre como etiqueta. Solo lo publicado, sin importar quién mire.
//
// Cada vía va en su propia consulta y una que falla no tumba a las otras: la
// pestaña prefiere mostrar dos de tres fuentes antes que quedar vacía.

import { NextResponse } from 'next/server';

import { getReadClient } from '@/lib/supabase/read';
import { escapePostgrestLike } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

const LIMIT = 12;
const COLUMNS = 'id,title,summary,image_url,published_at,tags,sport,scope';

const TAG_SCAN_LIMIT = 300;
// Las palabras que un club suma o no según quién lo escriba.
const NAME_NOISE = new Set(['rugby', 'club', 'hockey', 'futbol', 'football', 'de', 'del', 'la', 'el', 'rc', 'cr', 'ca', 'fc']);

function normalizeClubName(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((word) => word && !NAME_NOISE.has(word))
        .join(' ');
}

interface ClubNewsRow {
    id: string;
    title: string;
    summary: string | null;
    image_url: string | null;
    published_at: string | null;
    tags: string[] | null;
    sport: string | null;
    scope: string | null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = await params;
    const url = new URL(request.url);
    const clubIds = new Set<string>();
    for (const value of [rawId, url.searchParams.get('alias')]) {
        const clean = decodeURIComponent(value ?? '').trim();
        if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(clean)) clubIds.add(clean);
    }
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, 80);
    if (clubIds.size === 0) return NextResponse.json({ news: [] });

    const supabase = await getReadClient();
    const base = () => supabase.from('news').select(COLUMNS).eq('status', 'published').order('published_at', { ascending: false }).limit(LIMIT);

    const lookups: Array<PromiseLike<{ data: unknown; error: unknown }>> = [];
    for (const clubId of clubIds) {
        lookups.push(base().eq('scope', 'club').eq('scope_id', clubId));
        lookups.push(base().ilike('content', `%(club:${escapePostgrestLike(clubId)})%`));
    }
    // Las etiquetas casi nunca traen el nombre exacto del club ("Los Tordos Rugby
    // Club" para el club "Los Tordos"), así que se comparan normalizadas, en
    // memoria, sobre las notas más recientes. Sin el cuerpo la fila es chica.
    const wanted = name.length >= 4 ? normalizeClubName(name) : '';
    if (wanted.length >= 4) {
        lookups.push(
            supabase
                .from('news')
                .select(COLUMNS)
                .eq('status', 'published')
                .order('published_at', { ascending: false })
                .limit(TAG_SCAN_LIMIT)
                .then((result) => ({
                    error: result.error,
                    data: ((result.data as ClubNewsRow[] | null) ?? []).filter((row) =>
                        (row.tags ?? []).some((tag) => normalizeClubName(tag) === wanted),
                    ),
                })),
        );
    }

    const settled = await Promise.allSettled(lookups);
    const byId = new Map<string, ClubNewsRow>();
    for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        const { data, error } = result.value;
        if (error) {
            console.error('[clubs/news] consulta fallida:', error);
            continue;
        }
        for (const row of (data as ClubNewsRow[] | null) ?? []) byId.set(row.id, row);
    }

    const news = [...byId.values()]
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .slice(0, LIMIT);

    return NextResponse.json({ news }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
}
