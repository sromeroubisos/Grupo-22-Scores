import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeJsonLd } from './jsonLd.ts';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

test('serializeJsonLd: un </script> en un string no cierra el script', () => {
    const out = serializeJsonLd({ headline: '</script><img src=x onerror=alert(1)>' });
    assert.ok(!out.includes('</script'));
    assert.ok(!out.includes('<'));
    assert.ok(!out.includes('>'));
});

test('serializeJsonLd: el resultado sigue siendo JSON con el mismo valor', () => {
    const value = { name: `A & B <c> ${LS} ${PS}`, n: 3, list: ['<!--', '-->'] };
    assert.deepEqual(JSON.parse(serializeJsonLd(value)), value);
});

test('serializeJsonLd: escapa los separadores de línea', () => {
    const out = serializeJsonLd({ text: `a${LS}b${PS}c` });
    assert.ok(!out.includes(LS));
    assert.ok(!out.includes(PS));
    assert.ok(out.includes('\\u2028'));
    assert.ok(out.includes('\\u2029'));
});
