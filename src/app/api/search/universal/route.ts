import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '12', 10);

    if (!search || search.length < 2) {
        return NextResponse.json({ data: [] });
    }

    // Direct client to match debug script
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const lSearch = search.toLowerCase();

    // DEBUG: return what the API thinks it's doing
    let debugInfo: any = {
        query: search,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };

    try {
        // En paralelo para mejor performance
        // Buscamos en torneos y clubes (eliminamos jugadores por pedido del usuario)
        const [tournamentsRes, clubsRes] = await Promise.all([
            supabase.from('tournaments')
                .select('id, name, display_name, original_name, slug, logo_url, sport, country, is_visible')
                .or(`name.ilike.%${search}%,display_name.ilike.%${search}%,slug.ilike.%${search}%`)
                .eq('is_visible', true)
                .limit(limit),
            supabase.from('clubs')
                .select('id, name, short_name, slug, city, country, logo_url, is_visible')
                .or(`name.ilike.%${search}%,short_name.ilike.%${search}%,slug.ilike.%${search}%,city.ilike.%${search}%,country.ilike.%${search}%`)
                .eq('is_visible', true)
                .limit(limit)
        ]);

        debugInfo = {
            ...debugInfo,
            tError: tournamentsRes.error,
            cError: clubsRes.error,
            tCount: tournamentsRes.data?.length || 0,
            cCount: clubsRes.data?.length || 0
        };

        if (tournamentsRes.error) {
            console.error('[Universal Search] Tournament Query Error:', tournamentsRes.error);
        }
        if (clubsRes.error) {
            console.error('[Universal Search] Club Query Error:', clubsRes.error);
        }

        const rawResults: any[] = [];

        // Mapear torneos
        if (tournamentsRes.data) {
            rawResults.push(...tournamentsRes.data.map((t: any) => {
                const title = t.display_name || t.name;
                return {
                    id: t.id,
                    type: 'tournament',
                    title: title,
                    subtitle: `${t.sport || 'Torneo'} · ${t.country || 'Internacional'}`,
                    url: `/tournaments/${t.slug || t.id}`,
                    logo_url: t.logo_url,
                    searchWeight: calculateWeight(title, t.name, t.slug, lSearch, 0)
                };
            }));
        }

        // Mapear clubes
        if (clubsRes.data) {
            rawResults.push(...clubsRes.data.map((c: any) => {
                return {
                    id: c.id,
                    type: 'club',
                    title: c.name,
                    subtitle: `Club · ${c.city || c.country || ''}`,
                    url: `/clubs/${c.slug || c.id}`,
                    logo_url: c.logo_url,
                    searchWeight: calculateWeight(c.name, c.short_name, c.slug, lSearch, 1)
                };
            }));
        }

        // Ordenar por peso (más bajo es mejor matching) y luego por tipo y alfabético
        const finalResults = rawResults
            .sort((a, b) => {
                if (a.searchWeight !== b.searchWeight) return a.searchWeight - b.searchWeight;
                if (a.type !== b.type) return a.type === 'tournament' ? -1 : 1;
                return a.title.localeCompare(b.title);
            })
            .slice(0, limit);

        return NextResponse.json({ 
            data: finalResults
        });
    } catch (error: any) {
        console.error('[Universal Search Error]:', error);
        return NextResponse.json({ 
            error: error.message
        }, { status: 500 });
    }
}

/**
 * Calcula un peso de relevancia para el resultado.
 * Menor valor = Mayor relevancia.
 */
function calculateWeight(title: string, secondary: string | null, slug: string | null, search: string, entityPriority: number): number {
    const t = title.toLowerCase();
    const s = secondary?.toLowerCase() || '';
    const sl = slug?.toLowerCase() || '';

    // Prioridad 1: Match exacto
    if (t === search || s === search) return 0 + entityPriority * 0.1;
    
    // Prioridad 2: Empieza con el término
    if (t.startsWith(search) || s.startsWith(search) || sl.startsWith(search)) return 1 + entityPriority * 0.1;
    
    // Prioridad 3: Contiene el término
    if (t.includes(search) || s.includes(search)) return 2 + entityPriority * 0.1;

    return 3 + entityPriority * 0.1;
}
