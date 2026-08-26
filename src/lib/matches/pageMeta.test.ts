import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectMetaContents, extractMetaImage, toAbsoluteHttpUrl } from './pageMeta';

const PAGE = 'https://www.espn.com.ar/video/clip/_/id/17152408';

test('og:image se lee sin importar el orden de los atributos ni las comillas', () => {
    const html = `
        <html><head>
        <meta data-rh="true" property="og:image" content="https://cdn.example.com/portada.jpg"/>
        <meta name='twitter:image' content='https://cdn.example.com/twitter.jpg'>
        </head></html>`;
    assert.equal(extractMetaImage(html, PAGE), 'https://cdn.example.com/portada.jpg');
});

test('la prioridad es por clave, no por aparicion: secure_url le gana aunque venga despues', () => {
    const html = `
        <meta name="twitter:image" content="https://cdn.example.com/twitter.jpg">
        <meta property="og:image" content="http://cdn.example.com/og.jpg">
        <meta property="og:image:secure_url" content="https://cdn.example.com/og-secure.jpg">`;
    assert.equal(extractMetaImage(html, PAGE), 'https://cdn.example.com/og-secure.jpg');
});

test('una portada relativa se resuelve contra la pagina; una que no es http se descarta', () => {
    assert.equal(extractMetaImage('<meta property="og:image" content="/img/portada.jpg">', PAGE), 'https://www.espn.com.ar/img/portada.jpg');
    assert.equal(extractMetaImage('<meta property="og:image" content="data:image/png;base64,AAAA">', PAGE), null);
    assert.equal(extractMetaImage('<meta property="og:image" content="javascript:alert(1)">', PAGE), null);
});

test('sin meta de imagen no hay portada; el contenido vacio no cuenta', () => {
    assert.equal(extractMetaImage('<html><head><title>x</title></head></html>', PAGE), null);
    assert.equal(extractMetaImage('<meta property="og:image" content="">', PAGE), null);
});

test('las entidades HTML se decodifican una sola vez', () => {
    const html = '<meta property="og:image" content="https://cdn.example.com/a.jpg?x=1&amp;y=2">';
    assert.equal(extractMetaImage(html, PAGE), 'https://cdn.example.com/a.jpg?x=1&y=2');

    const found = collectMetaContents('<meta property="og:title" content="Los Tilos &amp;lt; CASI &#39;final&#39;">', ['og:title']);
    assert.equal(found.get('og:title'), "Los Tilos &lt; CASI 'final'");
});

test('toAbsoluteHttpUrl: relativa, absoluta y basura', () => {
    assert.equal(toAbsoluteHttpUrl('a.jpg', 'https://x.com/dir/page'), 'https://x.com/dir/a.jpg');
    assert.equal(toAbsoluteHttpUrl('//cdn.x.com/a.jpg', 'https://x.com/'), 'https://cdn.x.com/a.jpg');
    assert.equal(toAbsoluteHttpUrl('ftp://x.com/a', 'https://x.com/'), null);
    assert.equal(toAbsoluteHttpUrl('', 'not a url'), null);
});
