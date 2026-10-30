// Las filas que alimentan los sitemaps de torneos, clubes y partidos.
//
// Cliente anónimo pelado, como el sitemap de noticias: un sitemap no tiene
// request del que leer sesión y el RLS ya deja al anónimo ver lo público. Si
// la base no contesta se devuelve lo que llegó: un sitemap corto le sirve al
// buscador; uno caído, no.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isTournamentVisibleToPublic } from '@/lib/tournamentReview';

// PostgREST corta en 1000 filas por pedido: se pagina por lo que llegó.
const PAGE = 1000;
// Un sitemap admite 50.000 URLs; el margen es para no rozar el tope.
export const SITEMAP_URL_CAP = 45000;

function anonClient(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Trae todas las filas de una consulta de a 1000. `build` arma la consulta
 * para cada página; tiene que ordenar con un desempate por id, o el corte
 * entre páginas repite y pierde filas.
 */
async function paginate<T>(
    build: (client: SupabaseClient, from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    cap = SITEMAP_URL_CAP,
): Promise<T[]> {
    const client = anonClient();
    if (!client) return [];
    const rows: T[] = [];
    try {
        while (rows.length < cap) {
            const { data, error } = await build(client, rows.length, rows.length + PAGE - 1);
            if (error || !data) break;
            rows.push(...data);
            if (data.length < PAGE) break;
        }
    } catch {
        // Lo que llegó hasta acá sigue sirviendo.
    }
    return rows.slice(0, cap);
}

export type TournamentSitemapRow = {
    id: string;
    slug: string | null;
    updated_at: string | null;
};

export async function publicTournaments(): Promise<TournamentSitemapRow[]> {
    type Row = TournamentSitemapRow & { status: string | null; is_visible: boolean | null; review_status: string | null };
    const rows = await paginate<Row>((client, from, to) =>
        client
            .from('tournaments')
            .select('id, slug, updated_at, status, is_visible, review_status')
            .order('id', { ascending: true })
            .range(from, to),
    );
    // La misma regla que decide si la ficha se muestra: lo que da 404 no va.
    return rows.filter((row) => isTournamentVisibleToPublic(row));
}

export type ClubSitemapRow = {
    id: string;
    updated_at: string | null;
};

export async function publicClubs(): Promise<ClubSitemapRow[]> {
    type Row = ClubSitemapRow & { is_visible: boolean | null; visibility: string | null };
    const rows = await paginate<Row>((client, from, to) =>
        client
            .from('clubs')
            .select('id, updated_at, is_visible, visibility')
            .order('id', { ascending: true })
            .range(from, to),
    );
    // Los ocultos (categorías de un club, entre otros) se sirven con noindex:
    // declararlos en el sitemap sería contradecirse.
    return rows.filter((row) => row.is_visible !== false && row.visibility !== 'hidden');
}

export type MatchSitemapRow = {
    id: string;
    updated_at: string | null;
};

/**
 * Los partidos de una ventana: 18 meses para atrás y 60 días para adelante,
 * del más nuevo al más viejo, así lo que el tope deja afuera es lo menos
 * buscado. Toda la historia no entra en un sitemap y tampoco hace falta: los
 * viejos se siguen descubriendo por los enlaces de torneos y clubes.
 */
export async function recentMatches(now = new Date()): Promise<MatchSitemapRow[]> {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 18);
    const to = new Date(now);
    to.setDate(to.getDate() + 60);

    return paginate<MatchSitemapRow>((client, start, end) =>
        client
            .from('matches')
            .select('id, updated_at')
            // `neq false` dejaría afuera los NULL: en SQL, NULL <> false no es verdad.
            .or('is_visible.is.null,is_visible.eq.true')
            .gte('date_time', from.toISOString())
            .lte('date_time', to.toISOString())
            .order('date_time', { ascending: false })
            .order('id', { ascending: true })
            .range(start, end),
    );
}
