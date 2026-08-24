// LA PLACA DEL JUGADOR COMO ARCHIVO. `?formato=feed` (1080×1350) o
// `?formato=story` (1080×1920).
//
// Se dibuja con Satori en el SERVIDOR y no con canvas en el telefono, por la
// misma razon que la tarjeta de Carrera de Rugby: una imagen armada en el
// navegador depende de que tipografias tenga instaladas ese aparato y de como
// redondee su motor, asi que el mismo jugador salia distinto en cada celular.
//
// La URL es el archivo: con el id del jugador alcanza para volver a generarla,
// no se guarda nada.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getLocalPlayerProfile } from '@/lib/services/localPlayerProfile';
import { cardFonts } from '@/lib/carrera/cardFonts';
import PlayerCard, { PLAYER_CARD_SIZES, isPlayerCardFormat, type PlayerCardFormat } from '../PlayerCard';
import { playerCardData } from '../playerCardData';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Solo letras, numeros y guiones: el nombre viaja en una cabecera HTTP. */
function nombreArchivo(nombre: string, formato: PlayerCardFormat): string {
    const limpio = nombre
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    return `g22-${limpio || 'jugador'}-${formato}.png`;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const { id } = await params;
    const playerId = id.trim();

    if (!UUID_RE.test(playerId)) {
        return new Response('La placa solo existe para jugadores de la base.', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
    }

    const url = new URL(request.url);
    const pedido = url.searchParams.get('formato');
    const formato: PlayerCardFormat = isPlayerCardFormat(pedido) ? pedido : 'feed';

    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();
    const profile = await getLocalPlayerProfile(supabase, playerId);

    // Un jugador que no existe no se baja como imagen: lo que se baja es una
    // placa para publicar, y publicar el error de otro no le sirve a nadie.
    if (!profile) {
        return new Response('No encontramos a ese jugador.', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
    }

    const imagen = new ImageResponse(
        <PlayerCard data={playerCardData(profile, url.origin)} format={formato} />,
        { ...PLAYER_CARD_SIZES[formato], fonts: await cardFonts() },
    );

    // `attachment` para que baje aunque el navegador ignore el `download` del
    // enlace (pasa en varios navegadores de celular). El cache es corto y no
    // inmutable: a diferencia de la carrera —donde el token congela el
    // contenido— acá el jugador juega otro partido y la placa cambia.
    //
    // `?preview=1` la sirve SIN `attachment`: es la misma imagen, pero pedida
    // para mirarla dentro de la pagina. Con la cabecera puesta, algunos
    // navegadores se bajan el archivo al pintar la vista previa, y el usuario
    // termina con una descarga que no pidio.
    const headers = new Headers(imagen.headers);
    if (url.searchParams.get('preview') !== '1') {
        headers.set('content-disposition', `attachment; filename="${nombreArchivo(profile.name, formato)}"`);
    }
    headers.set('cache-control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');

    return new Response(imagen.body, { status: imagen.status, headers });
}
