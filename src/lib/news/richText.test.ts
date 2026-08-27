import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectMentions, imageCountOf, mentionCountOf, parseInline, parseRichText, plainTextOf, wordCountOf } from './richText';

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

test('una mención es un link a la ficha con la etiqueta que se lee; una mal formada queda como texto', () => {
    const nodes = parseInline('Ganó @[Los Tilos](club:3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b) por @[Juan Pérez](player:abc-123).');
    assert.deepEqual(nodes, [
        { type: 'text', text: 'Ganó ' },
        { type: 'mention', kind: 'club', ref: '3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b', label: 'Los Tilos' },
        { type: 'text', text: ' por ' },
        { type: 'mention', kind: 'player', ref: 'abc-123', label: 'Juan Pérez' },
        { type: 'text', text: '.' },
    ]);
    // Un tipo desconocido, un id con caracteres raros o un video con javascript: no son menciones.
    assert.deepEqual(parseInline('@[x](arbitro:1)'), [{ type: 'text', text: '@[x](arbitro:1)' }]);
    assert.deepEqual(parseInline('@[x](club:../../etc)'), [{ type: 'text', text: '@[x](club:../../etc)' }]);
    assert.deepEqual(parseInline('@[x](video:javascript:alert(1))'), [{ type: 'text', text: '@[x](video:javascript:alert(1))' }]);
    // Un @ suelto (un usuario de X, un mail) sigue siendo texto.
    assert.deepEqual(parseInline('seguí a @g22scores'), [{ type: 'text', text: 'seguí a @g22scores' }]);
});

test('un partido o un video solos en su renglón son un bloque embebido; en medio de una frase, un link', () => {
    const blocks = parseRichText([
        'Antes del partido.',
        '',
        '@[Los Tilos 33–15 CASI](match:3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b)',
        '',
        'Lo dijo en @[la ficha](match:3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b) después.',
        '',
        '@[Highlights](video:3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b/v-1a2b3c4d)',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        '',
        'Un club solo en su renglón sigue siendo un párrafo:',
        '@[Los Tilos](club:3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b)',
    ].join('\n'));
    assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'embed', 'paragraph', 'embed', 'embed', 'paragraph']);
    assert.deepEqual(blocks[1], { type: 'embed', kind: 'match', ref: '3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b', label: 'Los Tilos 33–15 CASI' });
    assert.deepEqual(blocks[3], { type: 'embed', kind: 'video', ref: '3f0c1e0a-0b2d-4c8e-9a1b-2c3d4e5f6a7b/v-1a2b3c4d', label: 'Highlights' });
    assert.deepEqual(blocks[4], { type: 'embed', kind: 'video', ref: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: null });
    // La URL suelta corta el párrafo aunque venga pegada al renglón anterior.
    assert.equal((blocks[5] as { children: unknown[] }).children.length, 3, 'texto + <br> + mención');
});

test('collectMentions junta las del texto y las embebidas, en orden y sin repetir', () => {
    const content = [
        '@[CASI](club:c1) le ganó a @[Los Tilos](club:t1) con un try de @[Pérez](player:p1).',
        '',
        '@[CASI 20–15 Los Tilos](match:m1)',
        '',
        'Otra vez @[CASI](club:c1), y el video:',
        '',
        'https://x.com/SC_ESPN/status/2093064541085077822',
    ].join('\n');
    assert.deepEqual(collectMentions(content), [
        { kind: 'club', ref: 'c1', label: 'CASI' },
        { kind: 'club', ref: 't1', label: 'Los Tilos' },
        { kind: 'player', ref: 'p1', label: 'Pérez' },
        { kind: 'match', ref: 'm1', label: 'CASI 20–15 Los Tilos' },
        { kind: 'video', ref: 'https://x.com/SC_ESPN/status/2093064541085077822', label: '' },
    ]);
    assert.equal(mentionCountOf(content), 5);
    assert.equal(plainTextOf(content), 'CASI le ganó a Los Tilos con un try de Pérez.\n\nCASI 20–15 Los Tilos\n\nOtra vez CASI, y el video:');
});
