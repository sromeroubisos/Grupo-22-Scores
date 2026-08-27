import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRichText } from './richText';
import { isUrlAlone, liftVideoToOwnLine, strandedVideoIn } from './videoInBody';

const TWEET = 'https://x.com/SC_ESPN/status/2093064541085077822?s=20';

test('una dirección de video sola en su renglón no está atrapada', () => {
    assert.equal(strandedVideoIn(`La jugada del partido.\n\n${TWEET}\n\nY siguió el trámite.`), null);
    assert.equal(isUrlAlone(`  ${TWEET}  `), true);
});

test('pegada al final de una frase, la dirección está atrapada', () => {
    assert.equal(strandedVideoIn(`Mirá el try: ${TWEET} qué golazo.`), TWEET);
});

test('un link escrito a propósito no se toca', () => {
    assert.equal(strandedVideoIn(`Está en [el video del try](${TWEET}) de la cuenta.`), null);
    assert.equal(strandedVideoIn('![Foto](https://g22.ar/foto.jpg "El try")'), null);
});

test('un link que no es de video no molesta', () => {
    assert.equal(strandedVideoIn('La tabla está en https://g22.ar/torneos/urba y se actualiza sola.'), null);
});

test('moverla la deja sola en su renglón y el párrafo queda limpio', () => {
    const before = `La primera.\n\nMirá el try: ${TWEET} qué golazo.\n\nY el cierre.`;
    const lifted = liftVideoToOwnLine(before, TWEET);
    assert.ok(lifted);
    assert.equal(lifted.content, `La primera.\n\nMirá el try: qué golazo.\n\n${TWEET}\n\nY el cierre.`);
    assert.equal(lifted.content.slice(0, lifted.caret), `La primera.\n\nMirá el try: qué golazo.\n\n${TWEET}`);
    // Y ahora sí el lector la embebe.
    assert.deepEqual(
        parseRichText(lifted.content).map((block) => block.type),
        ['paragraph', 'paragraph', 'embed', 'paragraph'],
    );
    assert.equal(strandedVideoIn(lifted.content), null);
});

test('atrapada en el primer párrafo de la nota, sale igual', () => {
    const lifted = liftVideoToOwnLine(`Mirá esto ${TWEET}\n\nEl cierre.`, TWEET);
    assert.ok(lifted);
    assert.equal(lifted.content, `Mirá esto\n\n${TWEET}\n\nEl cierre.`);
});

test('sin esa dirección en el texto, no hay nada que mover', () => {
    assert.equal(liftVideoToOwnLine('Una nota sin videos.', TWEET), null);
});
