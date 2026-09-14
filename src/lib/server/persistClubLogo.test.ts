/**
 * El escudo se achica antes de subirse. Hasta el 14/9 entraba tal cual: había
 * escudos de 263 KB en el bucket y 950 más en base64 dentro de `clubs.logo_url`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import { normalizeCrest } from './persistClubLogo';

async function crest(size: number) {
    // Un escudo "de verdad" en miniatura: dos franjas y un círculo con alfa.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <rect width="${size}" height="${size / 2}" fill="#4aa3df"/>
        <rect y="${size / 2}" width="${size}" height="${size / 2}" fill="#0b1f5c"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="#ffffff" fill-opacity="0.9"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png({ compressionLevel: 0 }).toBuffer();
}

test('un escudo de 1200 px sale a 512 px y más liviano', async () => {
    const original = await crest(1200);
    const { bytes, mimeType } = await normalizeCrest('image/png', original);
    const meta = await sharp(bytes).metadata();

    assert.equal(mimeType, 'image/png');
    assert.equal(meta.width, 512);
    assert.ok(bytes.length < original.length / 4, `${bytes.length} contra ${original.length}`);
});

test('un escudo chico no se agranda', async () => {
    const { bytes } = await normalizeCrest('image/png', await crest(200));
    assert.equal((await sharp(bytes).metadata()).width, 200);
});

test('un SVG queda como viene', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const result = await normalizeCrest('image/svg+xml', svg);
    assert.equal(result.bytes, svg);
    assert.equal(result.mimeType, 'image/svg+xml');
});

test('un archivo que sharp no puede leer pasa tal cual: la subida no se rompe', async () => {
    const garbage = Buffer.from('esto no es una imagen');
    const result = await normalizeCrest('image/png', garbage);
    assert.equal(result.bytes, garbage);
});
