import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * `fetchPersonRowsByIds` lee con service_role columnas restringidas de `people`
 * — DNI y fecha de nacimiento de un padrón que incluye menores. Su garantía es
 * que los ids ya pasaron por RLS en una consulta hecha con el cliente del usuario.
 *
 * El tipo marcado `RlsScopedPersonIds` hace que eso no compile de otra forma. Estos
 * tests son la segunda barrera: revientan si aparece un llamador que no está en la
 * lista, o si alguien esquiva el constructor. Se leen sobre el FUENTE a propósito
 * — el archivo es 'use server' y no se puede importar desde un test de Node.
 */
const SRC = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/services/personService.ts'),
    'utf8',
);

/** Los miembros de la unión `ScopedPersonIdsOrigin`: la lista declarada. */
function origenesDeclarados(): string[] {
    const bloque = SRC.match(/type ScopedPersonIdsOrigin =([\s\S]*?);/);
    assert.ok(bloque, 'no se encontró el type ScopedPersonIdsOrigin — ¿lo renombraron?');
    return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

/** Los orígenes realmente usados al construir el token. */
function origenesUsados(): string[] {
    return [...SRC.matchAll(/rlsScopedPersonIds\([^,]+,\s*'([^']+)'\)/g)]
        .map((m) => m[1])
        .sort();
}

test('la lista de llamadores autorizados no está vacía', () => {
    assert.ok(origenesDeclarados().length > 0);
});

test('todo origen usado está declarado en la unión', () => {
    const declarados = new Set(origenesDeclarados());
    for (const usado of origenesUsados()) {
        assert.ok(
            declarados.has(usado),
            `'${usado}' construye ids con alcance pero no está en ScopedPersonIdsOrigin. ` +
            'Agregalo a la unión sólo si sus ids salen de una consulta con el cliente del usuario.',
        );
    }
});

test('no hay entradas de más en la unión (llamador que se fue y quedó el permiso)', () => {
    const usados = new Set(origenesUsados());
    for (const declarado of origenesDeclarados()) {
        assert.ok(
            usados.has(declarado),
            `'${declarado}' está autorizado en ScopedPersonIdsOrigin pero ya no llama. ` +
            'Sacalo: un permiso que sobra es un permiso que alguien va a reusar sin pensarlo.',
        );
    }
});

test('TODA llamada a fetchPersonRowsByIds pasa por el constructor', () => {
    // Se excluye la definición de la función.
    const llamadas = [...SRC.matchAll(/fetchPersonRowsByIds\(([^)]*\)?[^)]*)\)/g)]
        .map((m) => m[1].trim())
        .filter((arg) => !arg.startsWith('scoped: '));

    assert.ok(llamadas.length >= 3, `se esperaban al menos 3 llamadas, hay ${llamadas.length}`);
    for (const arg of llamadas) {
        assert.ok(
            arg.startsWith('rlsScopedPersonIds('),
            `fetchPersonRowsByIds recibió "${arg}" en vez de un RlsScopedPersonIds. ` +
            'Los ids tienen que venir de una consulta con el cliente del usuario.',
        );
    }
});

test('la lectura sensible NO usa el cliente del usuario', () => {
    const cuerpo = SRC.slice(SRC.indexOf('async function fetchPersonRowsByIds'));
    const hasta = cuerpo.slice(0, cuerpo.indexOf('\n}\n'));
    assert.ok(
        /createAdminClient\(\)/.test(hasta),
        'fetchPersonRowsByIds tiene que leer con service_role: con el cliente del usuario ' +
        'los selects piden id_number, fallan por privilegio de columna y la pantalla se vacía en silencio.',
    );
});
