import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PASSWORD_MIN_LENGTH } from './passwordPolicy.ts';

/**
 * Invariantes del endurecimiento de auth que no se pueden ejercitar en runtime
 * desde un test de Node: viven en constantes, en la forma de un módulo o en
 * validaciones de formularios que necesitarían DOM. Se leen sobre el fuente.
 */

function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

test('no quedó ninguna validación de contraseña escrita a mano', () => {
    // El `length < 6` estaba duplicado en el registro y en el cambio de
    // contraseña. Duplicado significa que uno de los dos se olvida al cambiar
    // el criterio, y el que se olvida es el que deja pasar `123456`.
    const formularios = [
        'src/app/register/components/RegisterForm.tsx',
        'src/app/auth/update-password/page.tsx',
    ];

    for (const formulario of formularios) {
        const fuente = leer(formulario);

        assert.ok(
            !/password\.length\s*<\s*\d+/.test(fuente),
            `${formulario} volvió a validar el largo a mano en vez de usar checkPassword()`,
        );
        assert.match(
            fuente,
            /checkPassword\(/,
            `${formulario} dejó de usar la política compartida`,
        );
    }
});

test('la política de contraseñas pide un largo defendible', () => {
    // NIST 800-63B pone el piso en 8. Por debajo de eso el resto de las reglas
    // no compensa.
    assert.ok(
        PASSWORD_MIN_LENGTH >= 10,
        `PASSWORD_MIN_LENGTH bajó a ${PASSWORD_MIN_LENGTH}; el dashboard de Supabase tiene que acompañar (ver SEGURIDAD_SUPABASE_DASHBOARD.md)`,
    );
});

test('la capa débil del rate limiter no es importable', () => {
    // rateLimitByIp cuenta por instancia: en Vercel, un límite de 10/min es
    // 10/min POR LAMBDA. Si se puede importar, un endpoint nuevo la usa por
    // error y queda sin contador compartido sin que nadie lo note.
    const fuente = leer('src/lib/rateLimit.ts');

    assert.ok(
        !/export\s+(async\s+)?function\s+rateLimitByIp/.test(fuente),
        'rateLimitByIp volvió a exportarse: la puerta pública es consumeRateLimit()',
    );
    assert.match(fuente, /export async function consumeRateLimit/);
});

test('los endpoints con rate limit usan el contador compartido', () => {
    const endpoints = [
        'src/app/api/auth/commit-session/route.ts',
        'src/app/api/auth/sync-user/route.ts',
        'src/lib/auth/callbackHandler.ts',
    ];

    for (const endpoint of endpoints) {
        assert.match(
            leer(endpoint),
            /await consumeRateLimit\(/,
            `${endpoint} dejó de usar el contador compartido`,
        );
    }
});

test('la cookie de sesión no vive un año', () => {
    // Se emite sin httpOnly a propósito, así que un XSS se la lleva. El maxAge
    // es lo único que acota cuánto sirve una sesión robada.
    const fuente = leer('src/lib/supabase/auth-cookie.ts');
    const dias = fuente.match(/const AUTH_COOKIE_MAX_AGE_DAYS = (\d+);/);

    assert.ok(dias, 'no se encontró AUTH_COOKIE_MAX_AGE_DAYS — ¿lo renombraron?');
    assert.ok(
        Number(dias[1]) <= 60,
        `la cookie de sesión vuelve a durar ${dias[1]} días: eso es cuánto sirve un token robado`,
    );
});
