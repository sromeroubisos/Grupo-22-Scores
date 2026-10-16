import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

/**
 * Las uniones que tienen región, para armar el selector de ligas por región y
 * unión. Son pocas (decenas) y casi no cambian, así que se cachea fuerte en el
 * borde.
 *
 * Sólo viajan `id`, `name` y `region_code`. `unions.branding` trae reglamentos,
 * colores y datos de contacto que esta pantalla no necesita: se pide la columna
 * justa y no `*`.
 */
export async function GET() {
    try {
        const supabase = await getReadClient();
        const { data, error } = await supabase
            .from('unions')
            .select('id, name, region_code')
            .not('region_code', 'is', null)
            .order('name', { ascending: true });

        if (error) {
            console.error('[GET /api/public/unions] query failed:', error);
            return NextResponse.json({ error: 'No se pudieron cargar las uniones.' }, { status: 500 });
        }

        return NextResponse.json({ data: data ?? [] }, {
            headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
        });
    } catch (error) {
        console.error('[GET /api/public/unions] unexpected error:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las uniones.' }, { status: 500 });
    }
}
