// LA TARJETA COMO ARCHIVO. Es la misma imagen de la og:image, con el tamaño
// pedido por query: `?formato=feed` (1080×1350) o `?formato=story` (1080×1920).
//
// Se dibuja con Satori —el mismo renderer que la og:image— y no con canvas en el
// teléfono: una tarjeta armada en el navegador depende de qué tipografías tenga
// instaladas ese aparato y de cómo redondee su motor, así que la misma carrera
// salía distinta en cada celular. Acá sale igual siempre, porque la dibuja el
// servidor.
//
// El token es la carrera entera (semilla + decisiones), así que la imagen se
// puede volver a generar sin guardar nada: la URL ES el archivo.

import { ImageResponse } from 'next/og';
import CareerCard, { CARD_SIZES, isCardFormat, type CardFormat } from '../../../CareerCard';
import { cardFonts } from '@/lib/carrera/cardFonts';
import { localeFromQuery, resolveSharedCareer } from '../shared';

/** Sólo letras, números y guiones: el nombre viaja en una cabecera HTTP. */
function nombreArchivo(apellido: string, formato: CardFormat): string {
    const limpio = apellido
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // los acentos que NFD dejó sueltos
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    return `carrera-rugby-${limpio || 'jugador'}-${formato}.png`;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
    const { token } = await params;
    const query = new URL(request.url).searchParams;
    const pedido = query.get('formato');
    const formato: CardFormat = isCardFormat(pedido) ? pedido : 'feed';
    // El idioma viaja en la URL: acá no hay preferencia del navegador que leer, y
    // la imagen tiene que salir igual para todos los que abran ese link.
    const locale = localeFromQuery({ lang: query.get('lang') ?? undefined });

    const shared = await resolveSharedCareer(token, locale);

    // Un link roto no se baja como imagen: la que se baja es una tarjeta para
    // publicar, y publicar el error de otro no le sirve a nadie. La vista previa
    // del chat sí lo dibuja (ahí no hay dónde poner el aviso), pero esto es un
    // archivo que alguien pidió a propósito.
    if (shared.kind === 'broken') {
        return new Response(`${shared.title}. ${shared.detail}`, {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
    }

    const imagen = new ImageResponse(<CareerCard data={shared.card} format={formato} />, {
        ...CARD_SIZES[formato],
        fonts: await cardFonts(),
    });

    // `attachment` para que baje aunque el navegador ignore el `download` del
    // enlace (pasa en varios navegadores de celular), e `immutable` porque el
    // token determina la imagen entera: la misma URL no puede dar otra cosa.
    const headers = new Headers(imagen.headers);
    headers.set('content-disposition', `attachment; filename="${nombreArchivo(shared.card.surname, formato)}"`);
    headers.set('cache-control', 'public, max-age=31536000, immutable');

    return new Response(imagen.body, { status: imagen.status, headers });
}

