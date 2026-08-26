import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    describeVideo,
    needsThumbnailLookup,
    normalizeMatchVideoLinks,
    parseVideoUrl,
    parseYouTubeStart,
    stableVideoId,
    videoPosterUrl,
    wantsGeneratedPoster,
    withAutoplay,
    MAX_MATCH_VIDEOS,
} from './videoLinks';

// ── Lo que se rechaza ───────────────────────────────────────────────────────

test('solo http(s) con host: lo demas no es un link', () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com/a', 'youtube.com/watch?v=abc', 'http://localhost/x', null, 42]) {
        assert.equal(parseVideoUrl(bad), null, String(bad));
    }
});

// ── YouTube: todas las formas en que la gente pega el link ──────────────────

test('YouTube: watch, corto, live, embed y mobile dan el mismo embed', () => {
    const forms = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz&index=2',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ?si=abc',
        'https://www.youtube.com/live/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ];
    for (const url of forms) {
        const parsed = parseVideoUrl(url);
        assert.equal(parsed?.provider, 'youtube', url);
        assert.equal(parsed?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0', url);
        assert.equal(parsed?.thumbnailUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', url);
        assert.equal(parsed?.aspect, 'video', url);
    }

    const shorts = parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    assert.equal(shorts?.aspect, 'portrait', 'un short se dibuja alto');
    assert.equal(shorts?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
});

test('YouTube: el minuto de arranque viaja al embed', () => {
    assert.equal(parseYouTubeStart('90'), 90);
    assert.equal(parseYouTubeStart('90s'), 90);
    assert.equal(parseYouTubeStart('1h2m3s'), 3723);
    assert.equal(parseYouTubeStart('2m'), 120);
    assert.equal(parseYouTubeStart('abc'), 0);
    assert.equal(parseYouTubeStart(null), 0);

    const parsed = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s');
    assert.equal(parsed?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90');
});

test('YouTube sin id de video (canal, busqueda) se reconoce pero se abre afuera', () => {
    for (const url of ['https://www.youtube.com/@losPumas', 'https://www.youtube.com/results?search_query=urba', 'https://www.youtube.com/watch?v=corto']) {
        const parsed = parseVideoUrl(url);
        assert.equal(parsed?.provider, 'youtube', url);
        assert.equal(parsed?.embedUrl, null, url);
    }
});

test('YouTube: una lista de reproduccion se embebe como serie', () => {
    const parsed = parseVideoUrl('https://www.youtube.com/playlist?list=PLabc_123-XYZ');
    assert.equal(parsed?.embedUrl, 'https://www.youtube-nocookie.com/embed/videoseries?list=PLabc_123-XYZ');
});

// ── Las otras plataformas ───────────────────────────────────────────────────

test('Vimeo: publico, privado con hash y canal', () => {
    assert.equal(parseVideoUrl('https://vimeo.com/123456789')?.embedUrl, 'https://player.vimeo.com/video/123456789?dnt=1');
    assert.equal(parseVideoUrl('https://vimeo.com/123456789/abcdef1234')?.embedUrl, 'https://player.vimeo.com/video/123456789?dnt=1&h=abcdef1234');
    assert.equal(parseVideoUrl('https://vimeo.com/channels/staffpicks/123456789')?.embedUrl, 'https://player.vimeo.com/video/123456789?dnt=1');
    assert.equal(parseVideoUrl('https://player.vimeo.com/video/123456789')?.provider, 'vimeo');
    assert.equal(parseVideoUrl('https://vimeo.com/about')?.embedUrl, null);
});

test('Dailymotion: largo y corto', () => {
    assert.equal(parseVideoUrl('https://www.dailymotion.com/video/x7tgad0')?.embedUrl, 'https://www.dailymotion.com/embed/video/x7tgad0');
    assert.equal(parseVideoUrl('https://www.dailymotion.com/video/x7tgad0_un-titulo')?.embedUrl, 'https://www.dailymotion.com/embed/video/x7tgad0');
    assert.equal(parseVideoUrl('https://dai.ly/x7tgad0')?.embedUrl, 'https://www.dailymotion.com/embed/video/x7tgad0');
});

test('Facebook: un video o un reel se embeben por el plugin; fb.watch y un perfil no', () => {
    const video = parseVideoUrl('https://www.facebook.com/urba/videos/123456789/');
    assert.equal(video?.provider, 'facebook');
    assert.ok(video?.embedUrl?.startsWith('https://www.facebook.com/plugins/video.php?href='), String(video?.embedUrl));
    assert.ok(video?.embedUrl?.includes(encodeURIComponent('https://www.facebook.com/urba/videos/123456789/')));

    assert.equal(parseVideoUrl('https://www.facebook.com/reel/987654321')?.aspect, 'portrait');
    assert.equal(parseVideoUrl('https://fb.watch/abc123/')?.embedUrl, null);
    assert.equal(parseVideoUrl('https://www.facebook.com/urba')?.embedUrl, null);
});

test('Twitch: sin el dominio padre no hay reproductor; con el, si', () => {
    assert.equal(parseVideoUrl('https://www.twitch.tv/videos/123456')?.embedUrl, null);
    const withParent = parseVideoUrl('https://www.twitch.tv/videos/123456', { embedParent: 'g22scores.com' });
    assert.equal(withParent?.embedUrl, 'https://player.twitch.tv/?video=v123456&parent=g22scores.com&autoplay=false');
    const clip = parseVideoUrl('https://clips.twitch.tv/FunnyClipSlug', { embedParent: 'localhost' });
    assert.equal(clip?.embedUrl, 'https://clips.twitch.tv/embed?clip=FunnyClipSlug&parent=localhost&autoplay=false');
});

test('ESPN: el clip se embebe con el reproductor sindicado de la misma edicion', () => {
    const forms = [
        'https://www.espn.com.ar/video/clip/_/id/17152408',
        'https://espn.com.ar/video/clip/_/id/17152408',
        'https://m.espn.com.ar/video/clip/_/id/17152408',
        'https://www.espn.com.ar/video/clip/_/id/17152408/los-tilos-campeon',
        'https://www.espn.com.ar/video/clip?id=17152408',
        'https://www.espn.com.ar/core/video/iframe?id=17152408&endcard=false',
        'https://www.espn.com.ar/core/video/iframe/_/id/17152408/endcard/false',
        'https://www.espn.com.ar/watch/syndicatedplayer/_/id/17152408',
    ];
    for (const url of forms) {
        const parsed = parseVideoUrl(url);
        assert.equal(parsed?.provider, 'espn', url);
        assert.equal(parsed?.embedUrl, 'https://www.espn.com.ar/watch/syndicatedplayer/_/id/17152408', url);
        assert.equal(parsed?.aspect, 'video', url);
    }

    // Cada edicion se queda en su dominio; un subdominio propio se respeta.
    assert.equal(parseVideoUrl('https://www.espn.com/video/clip/_/id/47144063')?.embedUrl, 'https://www.espn.com/watch/syndicatedplayer/_/id/47144063');
    assert.equal(parseVideoUrl('https://www.espn.co.uk/video/clip/_/id/47144063')?.embedUrl, 'https://www.espn.co.uk/watch/syndicatedplayer/_/id/47144063');
    assert.equal(parseVideoUrl('https://www.espn.cl/video/clip/_/id/47144063')?.embedUrl, 'https://www.espn.cl/watch/syndicatedplayer/_/id/47144063');
    assert.equal(parseVideoUrl('https://espndeportes.espn.com/video/clip/_/id/47144063')?.embedUrl, 'https://espndeportes.espn.com/watch/syndicatedplayer/_/id/47144063');
});

test('ESPN sin clip (una nota, ESPN+, un id raro) se reconoce y se abre afuera; un dominio parecido es otro sitio', () => {
    for (const url of [
        'https://www.espn.com.ar/rugby/nota/_/id/17152408/los-tilos-campeon',
        'https://www.espn.com.ar/watch/player/_/id/17152408',
        'https://www.espn.com.ar/video/clip/_/id/abc',
        'https://www.espn.com.ar/video/clip?id=12',
        'https://www.espn.com.ar/',
    ]) {
        const parsed = parseVideoUrl(url);
        assert.equal(parsed?.provider, 'espn', url);
        assert.equal(parsed?.embedUrl, null, url);
    }
    assert.equal(parseVideoUrl('https://www.espnfake.com/video/clip/_/id/17152408')?.provider, 'other');
    assert.equal(parseVideoUrl('https://www.notespn.com/video/clip/_/id/17152408')?.provider, 'other');
});

test('Instagram, TikTok y X se reconocen y se abren afuera; el resto es otro sitio', () => {
    assert.deepEqual(
        [parseVideoUrl('https://www.instagram.com/reel/abc/')?.provider, parseVideoUrl('https://www.tiktok.com/@x/video/1')?.provider, parseVideoUrl('https://x.com/a/status/1')?.provider],
        ['instagram', 'tiktok', 'x'],
    );
    for (const url of ['https://www.instagram.com/reel/abc/', 'https://www.tiktok.com/@x/video/1', 'https://x.com/a/status/1']) {
        assert.equal(parseVideoUrl(url)?.embedUrl, null, url);
    }

    const other = parseVideoUrl('https://www.rugbypass.com/videos/final-2026');
    assert.equal(other?.provider, 'other');
    assert.equal(other?.embedUrl, null);
    assert.equal(other?.host, 'rugbypass.com', 'el host va sin www para el rotulo');
});

test('el autoplay habla el idioma de cada plataforma', () => {
    assert.equal(withAutoplay('youtube', 'https://www.youtube-nocookie.com/embed/x?rel=0'), 'https://www.youtube-nocookie.com/embed/x?rel=0&autoplay=1');
    assert.equal(withAutoplay('facebook', 'https://www.facebook.com/plugins/video.php?href=h'), 'https://www.facebook.com/plugins/video.php?href=h&autoplay=true');
    assert.equal(withAutoplay('twitch', 'https://player.twitch.tv/?video=v1&parent=p&autoplay=false'), 'https://player.twitch.tv/?video=v1&parent=p&autoplay=true');
    assert.equal(withAutoplay('espn', 'https://www.espn.com.ar/watch/syndicatedplayer/_/id/17152408'), 'https://www.espn.com.ar/watch/syndicatedplayer/_/id/17152408?autoplay=true');
});

// ── Normalizacion de lo guardado ────────────────────────────────────────────

test('normalizar: descarta lo que no tiene url valida, deduplica y completa lo que falta', () => {
    const rows = normalizeMatchVideoLinks([
        { id: 'a', url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'full', title: '  Primer tiempo ', provider: 'youtube', addedAt: '2026-08-25T00:00:00.000Z' },
        { url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'clip' },              // repetida: se queda la primera
        { url: 'javascript:alert(1)', kind: 'highlights' },                 // no es un link
        { url: 'https://vimeo.com/123456789', kind: 'cualquiera', provider: 'inventado' }, // se completa
        null,
        'texto suelto',
    ]);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
        id: 'a', url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'full', title: 'Primer tiempo', provider: 'youtube', addedAt: '2026-08-25T00:00:00.000Z',
    });
    assert.equal(rows[1].kind, 'highlights', 'un kind desconocido cae en highlights');
    assert.equal(rows[1].provider, 'vimeo', 'un provider desconocido se deriva de la url');
    assert.equal(rows[1].id, stableVideoId('https://vimeo.com/123456789'), 'sin id se deriva uno estable');
    assert.equal(rows[1].title, null);
    assert.equal(rows[1].addedAt, '');
});

test('normalizar: no es una lista → vacio, y respeta el tope', () => {
    assert.deepEqual(normalizeMatchVideoLinks(null), []);
    assert.deepEqual(normalizeMatchVideoLinks({ url: 'https://youtu.be/dQw4w9WgXcQ' }), []);

    const many = Array.from({ length: MAX_MATCH_VIDEOS + 5 }, (_, i) => ({ url: `https://example.com/v/${i}`, kind: 'clip' }));
    assert.equal(normalizeMatchVideoLinks(many).length, MAX_MATCH_VIDEOS);
});

test('normalizar: la portada guardada viaja si es un link sano; null se respeta; lo raro se descarta', () => {
    const rows = normalizeMatchVideoLinks([
        { url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'clip', thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
        { url: 'https://vimeo.com/123456789', kind: 'clip', thumbnailUrl: null },
        { url: 'https://vimeo.com/987654321', kind: 'clip', thumbnailUrl: 'javascript:alert(1)' },
        { url: 'https://vimeo.com/555555555', kind: 'clip' },
    ]);
    assert.equal(rows[0].thumbnailUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    assert.equal(rows[1].thumbnailUrl, null, 'null = se busco y no hay: no se vuelve a buscar');
    assert.equal('thumbnailUrl' in rows[2], false, 'una portada invalida se descarta y se vuelve a buscar');
    assert.equal(needsThumbnailLookup(rows[3]), true);
    assert.equal(needsThumbnailLookup(rows[2]), true);
    assert.equal(needsThumbnailLookup(rows[1]), false);
    assert.equal(needsThumbnailLookup(rows[0]), false);
});

test('la portada que se muestra: la guardada primero, despues la que se deduce de la URL', () => {
    const youtube = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ');
    assert.equal(videoPosterUrl({ thumbnailUrl: 'https://cdn.example.com/a.jpg' }, youtube), 'https://cdn.example.com/a.jpg');
    assert.equal(videoPosterUrl({}, youtube), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    assert.equal(videoPosterUrl({ thumbnailUrl: null }, parseVideoUrl('https://vimeo.com/123456789')), null);
    assert.equal(videoPosterUrl({ thumbnailUrl: null }, null), null);
});

test('normalizar: la portada elegida solo viaja si es la placa; lo demas es original', () => {
    const rows = normalizeMatchVideoLinks([
        { url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'clip', poster: 'generated' },
        { url: 'https://vimeo.com/123456789', kind: 'clip', poster: 'original' },
        { url: 'https://vimeo.com/987654321', kind: 'clip', poster: 'inventada' },
        { url: 'https://vimeo.com/555555555', kind: 'clip' },
    ]);
    assert.equal(rows[0].poster, 'generated');
    assert.equal(wantsGeneratedPoster(rows[0]), true);
    for (const row of rows.slice(1)) {
        assert.equal('poster' in row, false, row.url);
        assert.equal(wantsGeneratedPoster(row), false, row.url);
    }
});

test('el id estable es determinista y distinto entre urls', () => {
    assert.equal(stableVideoId('https://a.com/1'), stableVideoId('https://a.com/1'));
    assert.notEqual(stableVideoId('https://a.com/1'), stableVideoId('https://a.com/2'));
    assert.match(stableVideoId('https://a.com/1'), /^v-[0-9a-f]{8}$/);
});

test('sin titulo, el video se presenta por tipo y plataforma', () => {
    assert.equal(describeVideo({ title: null, kind: 'full', provider: 'youtube' }), 'Partido completo · YouTube');
    assert.equal(describeVideo({ title: 'Try de Boffelli', kind: 'clip', provider: 'x' }), 'Try de Boffelli');
});
