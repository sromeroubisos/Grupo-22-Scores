// Descarga de un video de partido, solo para quien administra noticias (el
// super admin) y solo cuando el video es un ARCHIVO directo (un .mp4 en un
// storage): el servidor lo trae y lo devuelve como adjunto, así el navegador
// lo guarda en la compu en vez de abrirlo.
//
// Un video de plataforma (YouTube, ESPN, Vimeo…) no se puede: la ficha guarda
// el link, el archivo vive en la plataforma y sus términos no permiten
// bajarlo. Para esos, la respuesta lo dice con un 409.

import { NextResponse } from 'next/server';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { getMatchVideos } from '@/lib/server/matchVideos';
import { safeFetch, SafeFetchError } from '@/lib/server/safeFetch';
import { describeVideo, directMediaExtension } from '@/lib/matches/videoLinks';

export const dynamic = 'force-dynamic';

// Local (uuid) o del proveedor: la misma llave que viaja en la URL de la ficha.
const MATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
// Un video de highlights pesa decenas o cientos de MB; más de esto ya no es eso.
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;

type Params = { params: Promise<{ id: string; videoId: string }> };

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

/** "highlights-espn.mp4": el título del video, sin tildes ni símbolos. */
function fileNameOf(label: string, ext: string): string {
    const base = label
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 80);
    return `${base || 'video'}.${ext}`;
}

export async function GET(_request: Request, { params }: Params) {
    const { role, session } = await getServerAuthRole();
    if (!session?.user?.id) return fail('No se pudo verificar tu sesión. Probá de nuevo en unos segundos.', 401);
    if (!hasNewsManagementAccess(role)) return fail('No tenés permiso para descargar videos.', 403);

    const { id: matchId, videoId } = await params;
    if (!MATCH_ID_PATTERN.test(matchId) || !VIDEO_ID_PATTERN.test(videoId)) return fail('Video inválido.', 400);

    const videos = await getMatchVideos(matchId, { thumbnailBudgetMs: 0 });
    const video = videos.find((entry) => entry.id === videoId);
    if (!video) return fail('Ese video no está en la ficha.', 404);

    const ext = directMediaExtension(video.url);
    if (!ext) return fail('Este video es de una plataforma: solo se puede abrir allá, no descargar.', 409);

    // El link lo cargó un admin, pero el pedido sale de nuestro servidor: el destino se
    // valida al conectar y en cada redirect (un mp4 "público" que redirige a la red
    // interna no pasa). El tope de tiempo cubre hasta los encabezados; el cuerpo es
    // un video y puede tardar lo que tarde, pero no más de 1 GB.
    let upstream: Response;
    try {
        ({ response: upstream } = await safeFetch(video.url, {
            headers: { Accept: 'video/*,*/*;q=0.8' },
            maxRedirects: 3,
            timeoutMs: 10_000,
            timeoutCoversBody: false,
            maxBytes: MAX_DOWNLOAD_BYTES,
        }));
    } catch (error) {
        if (error instanceof SafeFetchError && (error.code === 'blocked_destination' || error.code === 'invalid_url')) {
            return fail('Origen no permitido.', 400);
        }
        console.error('[video download] fetch failed:', error);
        return fail('No se pudo traer el archivo.', 502);
    }
    if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => undefined);
        return fail(`El origen contestó ${upstream.status}.`, 502);
    }

    const headers = new Headers();
    // El tipo del origen no se reenvía: un `text/html` servido desde g22 se renderiza
    // con nuestras cookies. Va como binario y adjunto, que el navegador solo guarda.
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('X-Content-Type-Options', 'nosniff');
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    headers.set('Content-Disposition', `attachment; filename="${fileNameOf(describeVideo(video), ext)}"`);
    headers.set('Cache-Control', 'private, no-store');

    return new Response(upstream.body, { status: 200, headers });
}
