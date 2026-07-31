// El catálogo de premios tiene que cubrir EXACTAMENTE lo que el motor emite.
//
// El motor arma los logros con texto suelto y la tabla de `premios.ts` los
// mapea a un archivo. Es un puente por nombre, así que se rompe en silencio: si
// alguien agrega un logro nuevo en `statistics.ts`, o le corrige un acento a uno
// existente, el premio sigue apareciendo en la pantalla pero sin ícono y sin un
// solo error en ningún lado. Esta prueba convierte ese silencio en un fallo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREMIOS } from './premios.ts';

/** Los logros tal como los declara el motor, leídos de su código. */
function logrosDelMotor(): string[] {
    const fuente = readFileSync(
        new URL('../../../../features/career/engine/statistics.ts', import.meta.url),
        'utf8',
    );
    const re = /distinctions\.add\('([^']+)'\)/g;
    return [...fuente.matchAll(re)].map(([, label]) => label);
}

test('el catálogo de premios cubre todos los logros del motor', () => {
    const delMotor = logrosDelMotor();
    assert.ok(
        delMotor.length > 0,
        'no encontré ningún `distinctions.add` en statistics.ts: cambió la forma y esta prueba quedó ciega',
    );

    const conocidos = new Set(PREMIOS.map((p) => p.label));
    const sinFicha = delMotor.filter((label) => !conocidos.has(label));
    assert.deepEqual(
        sinFicha,
        [],
        `estos logros no tienen entrada en premios.ts, así que se dibujan sin ícono: ${sinFicha.join(', ')}`,
    );
});

test('no hay premios de más ni ids repetidos', () => {
    const delMotor = new Set(logrosDelMotor());
    const sobrantes = PREMIOS.filter((p) => !delMotor.has(p.label)).map((p) => p.label);
    assert.deepEqual(sobrantes, [], `premios.ts declara logros que el motor ya no emite: ${sobrantes.join(', ')}`);

    const ids = PREMIOS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'hay dos premios con el mismo id de archivo');
    for (const id of ids) {
        assert.match(id, /^[a-z0-9-]+$/, `el id "${id}" no sirve como nombre de archivo`);
    }
});
