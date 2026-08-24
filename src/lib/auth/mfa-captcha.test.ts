import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { captchaOptions, getCaptchaSiteKey, isCaptchaEnabled } from './captcha.ts';

/**
 * Segundo factor y CAPTCHA.
 *
 * `mfa.ts` no se puede importar acá: arrastra `@/lib/supabase/server`, que es
 * `server-only`. Sus invariantes se leen sobre el fuente. Lo de CAPTCHA sí se
 * ejercita de verdad, porque es código puro.
 */

function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

// ---------------------------------------------------------------- MFA

test('el AAL se lee con getClaims(), que verifica la firma', () => {
    const fuente = leer('src/lib/auth/mfa.ts');

    assert.match(fuente, /auth\.getClaims\(\)/);
    assert.ok(
        !/auth\.getSession\(\)/.test(fuente),
        'getSession() decodifica la cookie sin verificarla: un token fabricado con aal2 pasaría',
    );
});

test('los factores se preguntan al servidor, no se leen de la cookie', () => {
    const fuente = leer('src/lib/auth/mfa.ts');

    assert.match(fuente, /mfa\.listFactors\(\)/);
    assert.ok(
        !/user\.factors/.test(fuente.replace(/^\s*(\*|\/\/).*$/gm, '')),
        'session.user.factors es una copia cacheada en la cookie: con XSS se le borran los factores al blob',
    );
});

test('el desafío se exige siempre; el alta forzada es opt-in', () => {
    const fuente = leer('src/lib/auth/mfa.ts');

    // Si el alta no estuviera detrás del flag, mergear esto dejaría a todos los
    // admins afuera del panel de golpe.
    assert.match(fuente, /process\.env\.MFA_REQUIRED_FOR_ADMINS === 'true'/);

    const gate = fuente.match(/export async function resolveMfaGate[\s\S]*?\n}/);
    assert.ok(gate, 'no se encontró resolveMfaGate');

    // El camino "tiene factor" resuelve antes de mirar el flag: quien enroló
    // quiere que se le pida, con el flag prendido o apagado.
    const posFactor = gate[0].indexOf('if (hasFactor)');
    const posFlag = gate[0].indexOf('isMfaEnrollmentEnforced()');
    assert.ok(posFactor >= 0 && posFlag >= 0, 'cambió la forma de resolveMfaGate');
    assert.ok(
        posFactor < posFlag,
        'el desafío quedó detrás del flag: un segundo factor que se puede saltear no es un segundo factor',
    );
});

test('las rutas de API también exigen el segundo factor', () => {
    // Sin esto el gate sería decorativo: el guard de página se saltea llamando
    // a la ruta de API directo con la cookie de sesión.
    const fuente = leer('src/lib/auth/apiAdmin.ts');
    const guards = fuente.match(/export async function require\w*ApiContext[\s\S]*?\n}/g) ?? [];

    assert.equal(guards.length, 2, 'cambió la cantidad de guards de API; revisá que todos exijan MFA');

    for (const guard of guards) {
        assert.match(guard, /assertMfaSatisfied\(/, `un guard de API quedó sin MFA:\n${guard}`);
    }
});

test('el layout de admin pide el segundo factor después de aprobar el rol', () => {
    const fuente = leer('src/app/admin/layout.tsx');

    const posRol = fuente.indexOf("throw new Error('Forbidden')");
    const posMfa = fuente.indexOf('assertMfaSatisfied(');

    assert.ok(posRol >= 0 && posMfa >= 0, 'cambió la forma del guard de /admin');
    assert.ok(
        posRol < posMfa,
        'a quien no tiene permiso hay que rebotarlo, no pedirle un segundo factor',
    );
});

// ------------------------------------------------------------- CAPTCHA

test('sin site key, el CAPTCHA es inerte', () => {
    const previa = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    try {
        assert.equal(getCaptchaSiteKey(), null);
        assert.equal(isCaptchaEnabled(), false);

        // Clave: `{}` y no `{ captchaToken: null }`. Mandar el campo en null
        // hace que supabase-js lo incluya en el body y el servidor lo rechace
        // por inválido — o sea, apagado rompería el login.
        assert.deepEqual(captchaOptions(null), {});
        assert.deepEqual(captchaOptions('token-viejo'), {});
    } finally {
        if (previa === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = previa;
    }
});

test('una site key en blanco cuenta como apagado', () => {
    const previa = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '   ';

    try {
        assert.equal(isCaptchaEnabled(), false, 'una variable seteada vacía en Vercel no puede prender el CAPTCHA');
    } finally {
        if (previa === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = previa;
    }
});

test('con site key, el token viaja a Supabase', () => {
    const previa = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAA';

    try {
        assert.equal(isCaptchaEnabled(), true);
        assert.deepEqual(captchaOptions('abc123'), { captchaToken: 'abc123' });
        assert.deepEqual(captchaOptions(null), {}, 'sin token resuelto no se manda el campo');
    } finally {
        if (previa === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = previa;
    }
});

test('las tres pantallas de auth montan el CAPTCHA y lo exigen', () => {
    const pantallas = [
        'src/app/login/components/EmailLoginForm.tsx',
        'src/app/register/components/RegisterForm.tsx',
        'src/app/auth/forgot-password/page.tsx',
    ];

    for (const pantalla of pantallas) {
        const fuente = leer(pantalla);

        assert.match(fuente, /<CaptchaField/, `${pantalla} no monta el widget`);
        assert.match(
            fuente,
            /isCaptchaEnabled\(\) && !captchaToken/,
            `${pantalla} no frena el envío cuando falta el token`,
        );
        // Turnstile entrega tokens de un solo uso: sin reset, el segundo
        // intento reenvía el mismo y falla siempre.
        assert.match(fuente, /setCaptchaReset/, `${pantalla} no renueva el token tras un fallo`);
    }
});
