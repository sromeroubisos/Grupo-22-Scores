import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * La foto de un jugador, sola.
 *
 * Existe aparte de `/api/players?player_id=` porque la ficha del partido pide
 * UNA cosa —la cara— y aquel arma la carrera entera: para un jugador de
 * RugbyPass sale a buscarla al proveedor y tarda casi dos segundos.
 *
 * Tampoco viaja dentro del partido: `people.photo_url` guarda imagenes en
 * base64, y 46 caras que nadie va a mirar son megabytes por visita. Se pide de
 * a una, cuando alguien abre una ficha.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const playerId = readText((await params).id);

    // Un id de proveedor (`rp-player-…`, `fs-…`) no tiene fila en `people`: se
    // contesta que no hay foto sin tocar la base ni salir a la red.
    if (!UUID_PATTERN.test(playerId)) {
        return Response.json({ ok: true, photo: null });
    }

    try {
        const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient()
            : await createClient();

        const { data, error } = await supabase
            .from('people')
            .select('photo_url, avatar_url')
            .eq('id', playerId)
            .maybeSingle();

        if (error || !data) return Response.json({ ok: true, photo: null });

        return Response.json(
            { ok: true, photo: readText(data.photo_url) || readText(data.avatar_url) || null },
            // La cara de un jugador no cambia entre dos visitas al partido.
            { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } },
        );
    } catch {
        // Sin foto la ficha se dibuja igual, con la inicial. Que la base no
        // conteste no puede ser un error en pantalla.
        return Response.json({ ok: true, photo: null });
    }
}
