/**
 * /api/tournaments/{id}/navegacion
 *
 * Los dos desplegables de un torneo: el de GRADO (sus hermanos de división) y el
 * de TEMPORADA (las otras ediciones de la misma competencia).
 *
 * ── Por qué una ruta de servidor y no una consulta del cliente ─────────────
 * La política de RLS de `tournaments` para el anónimo es `USING (is_active =
 * true)`. El menú necesita mirar a los hermanos, que es una pregunta distinta de
 * "¿qué torneos ve un visitante?", así que la lectura va con service-role acá
 * adentro y la ruta devuelve SÓLO lo que el menú necesita:
 *
 *     id · name · subcategory · season_id
 *
 * Nunca partidos, nunca tabla, nunca el resto de la fila. Aflojar la política
 * para esto habría abierto la tabla entera a cualquier consulta del cliente, no
 * sólo a este menú.
 *
 * ── Y aun así, sólo lo que se puede abrir ──────────────────────────────────
 * Los hermanos se filtran por `is_active`: un ítem que lleva a una pantalla
 * vacía es peor que un ítem ausente. Hoy eso deja afuera los 22 torneos ocultos
 * de 2026 y los 677 del histórico; entran solos a medida que se publiquen.
 */
import { NextRequest, NextResponse } from 'next/server';

import { menuDeGrados, menuDeTemporadas, type TorneoHermano } from '@/lib/tournamentNavigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

/** Lo mínimo con lo que se arma un menú. Agregar una columna acá la publica. */
const COLUMNAS = 'id, name, season_id, category, subcategory, age_grade, gender';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = createAdminClient() as any;

    try {
        // La URL pública de un torneo lleva SLUG o uuid, y el segmento llega acá
        // tal cual. Contra `tournaments.id`, que es uuid, un slug no era una
        // búsqueda sin resultado: Postgres abortaba la sentencia con 22P02, la
        // ruta devolvía 500 y los dos desplegables desaparecían de la pantalla.
        // Se busca por la columna que corresponde — el mismo criterio que ya usa
        // /api/db/tournaments/[id].
        const columnaDeBusqueda = isUuid(id) ? 'id' : 'slug';
        const { data: actualRaw, error: errActual } = await supabase
            .from('tournaments')
            .select(`${COLUMNAS}, union_id, is_active`)
            .eq(columnaDeBusqueda, id)
            .maybeSingle();
        if (errActual) throw new Error(errActual.message);

        const actual = actualRaw as (TorneoHermano & { union_id: string | null; is_active: boolean | null }) | null;
        if (!actual) {
            return NextResponse.json({ grados: [], temporadas: [] }, { status: 404 });
        }

        // Sin unión no hay hermandad posible: dos torneos con la misma
        // `category` de uniones distintas no son grados el uno del otro.
        if (!actual.union_id) {
            return NextResponse.json({ grados: [], temporadas: [] });
        }

        const { data: hermanosRaw, error: errHermanos } = await supabase
            .from('tournaments')
            .select(COLUMNAS)
            .eq('union_id', actual.union_id)
            .eq('is_active', true);
        if (errHermanos) throw new Error(errHermanos.message);

        // El torneo actual entra al conjunto aunque esté inactivo: si no, un
        // torneo sin publicar no vería a sus propios hermanos.
        const hermanos: TorneoHermano[] = [
            ...((hermanosRaw ?? []) as TorneoHermano[]).filter((t) => t.id !== actual.id),
            actual,
        ];

        return NextResponse.json({
            grados: menuDeGrados(actual, hermanos),
            temporadas: menuDeTemporadas(actual, hermanos),
        }, {
            // El menú cambia cuando se publica una temporada, no en cada visita.
            headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' },
        });
    } catch (error) {
        console.error('[tournaments/navegacion] falló:', error);
        // Un menú que no se pudo armar se devuelve VACÍO y con 500: la pantalla
        // se dibuja sin desplegables en vez de romperse, y el error queda visible.
        return NextResponse.json({
            grados: [], temporadas: [],
            error: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
