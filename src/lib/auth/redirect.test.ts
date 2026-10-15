import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeNext, toSafeRelativePath } from './redirect.ts';

test('sanitizeNext: deja pasar paths propios con query y hash', () => {
    assert.equal(sanitizeNext('/tournaments/123?tab=tabla#zona-a'), '/tournaments/123?tab=tabla#zona-a');
    assert.equal(sanitizeNext('/club-admin'), '/club-admin');
});

test('sanitizeNext: corta el open redirect con tab, salto de línea o espacio', () => {
    for (const raw of ['/\t/evil.example', '/%09/evil.example', '/\n/evil.example', '/ /evil.example', '/\x00/evil.example', '/\x7F/evil.example']) {
        const out = sanitizeNext(raw);
        assert.ok(!out.includes('evil.example') || out.startsWith('/%09'), `${JSON.stringify(raw)} -> ${out}`);
        assert.ok(!out.startsWith('//'), `${JSON.stringify(raw)} -> ${out}`);
    }
    assert.equal(sanitizeNext('/\t/evil.example'), '/');
});

test('sanitizeNext: rechaza absolutas y protocol-relative', () => {
    for (const raw of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'evil.example', '/@evil.example']) {
        assert.equal(sanitizeNext(raw), '/', raw);
    }
});

test('sanitizeNext: evita el bucle hacia login aunque venga disfrazado', () => {
    assert.equal(sanitizeNext('/login'), '/');
    assert.equal(sanitizeNext('/LOGIN?x=1'), '/');
    assert.equal(sanitizeNext('/./login'), '/');
    assert.equal(sanitizeNext('/auth/callback'), '/');
});

test('toSafeRelativePath: normaliza lo que entiende el parser', () => {
    assert.equal(toSafeRelativePath('/a/../b'), '/b');
    assert.equal(toSafeRelativePath(null), null);
});
