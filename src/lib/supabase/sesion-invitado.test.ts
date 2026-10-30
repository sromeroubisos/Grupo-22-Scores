import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El gate que decide "esta persona es un invitado" en una pagina publica.
 *
 * Es la regresion que rompio el login en el telefono: `AuthContext` daba por
 * invitado a cualquiera cuyo access token no estuviera fresco, y eso da falso
 * con una sesion perfectamente valida en los dos casos que solo pasan en
 * mobile —el movil congela la pestaña y el token vence, o la cookie de Google
 * viene partida en trozos y el parser casero la lee mal—. Se verifica sobre el
 * fuente porque ejercitarlo pediria montar el provider con DOM y cookies.
 */

function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

test('el gate de invitado no decide por la frescura del token', () => {
    const fuente = leer('src/context/AuthContext.tsx');
    const gate = fuente.slice(
        fuente.indexOf('const skipPublicAnonymousAuth ='),
        fuente.indexOf('if (skipPublicAnonymousAuth)'),
    );

    assert.ok(gate.length > 0, 'no se encontro el gate skipPublicAnonymousAuth');
    assert.ok(
        !gate.includes('isAccessTokenFresh'),
        'el gate volvio a usar isAccessTokenFresh: un token vencido con refresh token vivo ' +
        'no es un invitado, y en mobile el token SIEMPRE vence con la pestaña congelada',
    );
    assert.ok(
        gate.includes('hasSupabaseBrowserSessionMaterial()'),
        'el gate tiene que decidir por la presencia de la cookie, no por su contenido',
    );
});

test('la presencia de sesion se detecta por nombre, sin parsear la cookie', () => {
    const fuente = leer('src/lib/supabase/client.ts');
    const cuerpo = fuente.slice(
        fuente.indexOf('export function hasSupabaseBrowserSessionMaterial'),
        fuente.indexOf('export function getSupabaseBrowserSessionHint'),
    );

    assert.ok(cuerpo.length > 0, 'no existe hasSupabaseBrowserSessionMaterial()');

    // Parsear es justo lo que falla con las sesiones de Google partidas en
    // trozos. Si esta funcion empieza a parsear, hereda el mismo punto ciego
    // que vino a tapar.
    for (const parser of ['parseSupabaseAuthCookiePayload', 'readAccessTokenExpirySeconds', 'JSON.parse']) {
        assert.ok(
            !cuerpo.includes(parser),
            `hasSupabaseBrowserSessionMaterial() empezo a usar ${parser}: tiene que mirar solo el nombre`,
        );
    }

    // Los trozos `.0`, `.1`, ... son el caso de Google: si no se los mira, una
    // sesion chunked se lee como "no hay nadie".
    assert.match(
        cuerpo,
        /startsWith\(`\$\{storageKey\}\.`\)/,
        'dejo de reconocer los trozos de una cookie de sesion partida',
    );
});
