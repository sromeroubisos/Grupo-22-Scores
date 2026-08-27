import { test } from 'node:test';
import assert from 'node:assert/strict';

import { imageCountOf, parseInline, parseRichText, plainTextOf, wordCountOf } from './richText';

test('una nota vieja (párrafos con línea en blanco, sin marcas) sale como párrafos, igual que antes', () => {
    const blocks = parseRichText('Primer párrafo de la nota.\n\nSegundo párrafo.\n\n\n\nTercero.');
    assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'paragraph', 'paragraph']);
    assert.deepEqual(blocks[0], { type: 'paragraph', children: [{ type: 'text', text: 'Primer párrafo de la nota.' }] });
});

test('negrita, cursiva y link se anidan y el resto queda como texto', () => {
    const nodes = parseInline('Alumni **ganó _el clásico_** y [la crónica](https://g22.ar/n/1) lo cuenta.');
    assert.deepEqual(nodes, [
        { type: 'text', text: 'Alumni ' },
        { type: 'strong', children: [{ type: 'text', text: 'ganó ' }, { type: 'em', children: [{ type: 'text', text: 'el clásico' }] }] },
        { type: 'text', text: ' y ' },
        { type: 'link', href: 'https://g22.ar/n/1', children: [{ type: 'text', text: 'la crónica' }] },
        { type: 'text', text: ' lo cuenta.' },
    ]);
});

test('un guion bajo adentro de una palabra o un asterisco suelto no abren cursiva', () => {
    assert.deepEqual(parseInline('URBA_top_12 y 3 * 4'), [{ type: 'text', text: 'URBA_top_12 y 3 * 4' }]);
    assert.deepEqual(parseInline('**sin cierre'), [{ type: 'text', text: '**sin cierre' }]);
});

test('un link con javascript: no es un link', () => {
    assert.deepEqual(parseInline('[click](javascript:alert(1))'), [{ type: 'text', text: '[click](javascript:alert(1))' }]);
});

test('subtítulos, cita, listas, separador e imagen con epígrafe', () => {
    const blocks = parseRichText([
        '## El partido',
        '### Primer tiempo',
        '> Fue un partido durísimo.',
        '> Nadie regaló nada.',
        '- Tries: 3',
        '- Palos: 4',
        '1. Uno',
        '2. Dos',
        '---',
        '![Los jugadores festejan](https://cdn.example.com/foto.jpg "Festejo en el vestuario")',
        '![Local](file:///C:/foto.jpg)',
    ].join('\n'));
    assert.deepEqual(blocks.map((block) => block.type), ['heading', 'heading', 'quote', 'list', 'list', 'rule', 'image']);
    assert.equal((blocks[0] as { level: number }).level, 2);
    assert.equal((blocks[1] as { level: number }).level, 3);
    assert.deepEqual(blocks[2], { type: 'quote', paragraphs: [[{ type: 'text', text: 'Fue un partido durísimo.' }, { type: 'break' }, { type: 'text', text: 'Nadie regaló nada.' }]] });
    assert.equal((blocks[3] as { ordered: boolean }).ordered, false);
    assert.equal((blocks[4] as { ordered: boolean }).ordered, true);
    assert.deepEqual(blocks[6], { type: 'image', src: 'https://cdn.example.com/foto.jpg', alt: 'Los jugadores festejan', caption: 'Festejo en el vestuario' });
});

test('un "1. Título" suelto es un párrafo (así titulan las notas viejas), no una lista', () => {
    const blocks = parseRichText('Intro.\n\n1. La defensa todavía está en construcción\n\nSigue el texto.');
    assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'paragraph', 'paragraph']);
    assert.equal(plainTextOf('1. Solo').startsWith('1. Solo'), true);
});

test('un salto de línea simple dentro del párrafo es un <br>, y un subtítulo corta el párrafo', () => {
    const blocks = parseRichText('Línea uno\nlínea dos\n## Título\nSigue');
    assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'heading', 'paragraph']);
    assert.deepEqual(blocks[0], { type: 'paragraph', children: [{ type: 'text', text: 'Línea uno' }, { type: 'break' }, { type: 'text', text: 'línea dos' }] });
});

test('el texto plano no lleva marcas ni imágenes; las palabras se cuentan sobre eso', () => {
    const content = '## Título\n\nUn **gran** _partido_.\n\n![f](https://x/y.jpg)\n\n- a\n- b';
    assert.equal(plainTextOf(content), 'Título\n\nUn gran partido.\n\na b');
    assert.equal(wordCountOf(content), 6);
    assert.equal(imageCountOf(content), 1);
    assert.equal(plainTextOf(null), '');
});
