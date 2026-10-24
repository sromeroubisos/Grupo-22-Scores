/**
 * El fondo de un preset de exportación va a Storage como foto + miniatura, y el
 * preset guarda dos URL cortas. Antes iba como data URI dentro del payload: 23 MB
 * para un usuario con 11 presets, bajados y clonados cada vez que abría Exportar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import { persistExportBackground } from './persistExportBackground';

type Upload = { path: string; bytes: Buffer; contentType: string };

function fakeStorage(options: { fail?: boolean } = {}) {
    const uploads: Upload[] = [];
    const client = {
        storage: {
            from: () => ({
                upload: async (path: string, bytes: Buffer, opts: { contentType: string }) => {
                    if (options.fail) return { error: { message: 'boom' } };
                    uploads.push({ path, bytes, contentType: opts.contentType });
                    return { error: null };
                },
                getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/club-assets/${path}` } }),
            }),
        },
    };
    return { uploads, client: client as never };
}

async function gradientDataUrl() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
        <defs><linearGradient id="g"><stop offset="0" stop-color="#df255c"/><stop offset="1" stop-color="#00a365"/></linearGradient></defs>
        <rect width="1080" height="1350" fill="url(#g)"/>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { png, dataUrl: `data:image/png;base64,${png.toString('base64')}` };
}

test('el fondo sube entero y con una miniatura de 240 px', async () => {
    const { png, dataUrl } = await gradientDataUrl();
    const { uploads, client } = fakeStorage();

    const result = await persistExportBackground('user-1', dataUrl, { supabaseClient: client });

    assert.ok(result.ok);
    assert.match(result.src, /^https:\/\/storage\.test\/club-assets\/export-backgrounds\/user-1\/[0-9a-f]{16}\.png$/);
    assert.match(result.thumb, /-thumb\.webp$/);

    const full = uploads.find((u) => u.path.endsWith('.png'));
    const thumb = uploads.find((u) => u.path.endsWith('-thumb.webp'));
    assert.ok(full && thumb);
    assert.ok(full.bytes.equals(png), 'la foto del lienzo no se recomprime');
    const meta = await sharp(thumb.bytes).metadata();
    assert.equal(meta.width, 240);
    assert.ok(thumb.bytes.length < png.length / 5, `${thumb.bytes.length} contra ${png.length}`);
});

test('la misma foto da la misma URL: diez presets con un fondo son un archivo', async () => {
    const { dataUrl } = await gradientDataUrl();
    const a = await persistExportBackground('user-1', dataUrl, { supabaseClient: fakeStorage().client });
    const b = await persistExportBackground('user-1', dataUrl, { supabaseClient: fakeStorage().client });
    assert.ok(a.ok && b.ok);
    assert.equal(a.src, b.src);
});

test('lo que no es una imagen raster no sube', async () => {
    const svg = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
    const { uploads, client } = fakeStorage();
    const result = await persistExportBackground('user-1', svg, { supabaseClient: client });
    assert.equal(result.ok, false);
    assert.equal(uploads.length, 0);
});

test('si Storage rechaza, se informa y el preset se queda con su data URI', async () => {
    const { dataUrl } = await gradientDataUrl();
    const result = await persistExportBackground('user-1', dataUrl, { supabaseClient: fakeStorage({ fail: true }).client });
    assert.equal(result.ok, false);
});
