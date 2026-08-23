/**
 * Verifica que los avisos del sistema (Web Push) esten habilitados de punta a punta.
 *
 *   node scripts/verificar-web-push.mjs
 *
 * Revisa las dos mitades que el control de /notifications no puede distinguir
 * por si solo cuando falla:
 *
 *   1. Las claves VAPID del servidor: que esten, que el par sea coherente y que
 *      el `sub` del JWT tenga un esquema que los push services acepten.
 *   2. La migracion 20260512160000: la tabla de suscripciones y las dos columnas
 *      que el cron necesita en user_notifications.
 *
 * Sale con codigo 1 si falta algo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');

function readEnvFile(file) {
    if (!fs.existsSync(file)) return {};

    return Object.fromEntries(
        fs.readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
            .map((line) => {
                const index = line.indexOf('=');
                return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
            }),
    );
}

const env = { ...readEnvFile(path.join(ROOT, '.env.local')), ...process.env };

const problemas = [];
const ok = (mensaje) => console.log(`  OK    ${mensaje}`);
const falta = (mensaje, comoSeArregla) => {
    console.log(`  FALTA ${mensaje}`);
    problemas.push({ mensaje, comoSeArregla });
};

function base64UrlDecode(input) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
}

function base64UrlEncode(input) {
    return Buffer.from(input).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

console.log('\n1. Claves VAPID del servidor\n');

const publicKey = env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || env.WEB_PUSH_PUBLIC_KEY;
const privateKey = env.WEB_PUSH_PRIVATE_KEY;

if (!publicKey || !privateKey) {
    falta(
        'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY y/o WEB_PUSH_PRIVATE_KEY',
        'Generar un par P-256 y cargarlo en .env.local y en Vercel.',
    );
} else {
    // El par tiene que reconstruirse igual que en src/lib/notifications/systemPush.ts:
    // la privada es solo el campo `d` del JWK, y las coordenadas salen de la publica.
    try {
        const bytes = base64UrlDecode(publicKey);
        if (bytes.length !== 65 || bytes[0] !== 0x04) {
            throw new Error('la clave publica no es un punto P-256 sin comprimir (65 bytes, prefijo 0x04)');
        }

        const jwk = {
            kty: 'EC',
            crv: 'P-256',
            x: base64UrlEncode(bytes.subarray(1, 33)),
            y: base64UrlEncode(bytes.subarray(33, 65)),
        };

        const muestra = Buffer.from('g22-web-push-check');
        const firma = sign('sha256', muestra, createPrivateKey({ key: { ...jwk, d: privateKey }, format: 'jwk' }));

        if (!verify('sha256', muestra, createPublicKey({ key: jwk, format: 'jwk' }), firma)) {
            throw new Error('la privada no corresponde a la publica');
        }

        ok('el par VAPID esta y firma contra su propia publica');
    } catch (error) {
        falta(
            `el par VAPID no sirve: ${error instanceof Error ? error.message : error}`,
            'Regenerar el par. Ojo: regenerarlo invalida todas las suscripciones guardadas.',
        );
    }
}

const subject = env.WEB_PUSH_SUBJECT || env.NEXT_PUBLIC_SITE_URL || '';
const subjectValido = /^mailto:/i.test(subject) || /^https:\/\//i.test(subject);

if (subjectValido) {
    ok(`el subject del JWT es aceptable (${subject})`);
} else {
    falta(
        `el subject del JWT no sirve (${subject || 'vacio'})`,
        'WEB_PUSH_SUBJECT tiene que empezar con mailto: o https://. En dev, NEXT_PUBLIC_SITE_URL apunta a http://localhost y no alcanza.',
    );
}

console.log('\n2. Migracion 20260512160000 en la base viva\n');

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    falta(
        'NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY para poder consultar',
        'Sin esas dos no se puede revisar el esquema desde aca.',
    );
} else {
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const consultar = (query, extra = {}) => fetch(`${supabaseUrl}/rest/v1/${query}`, {
        headers: { ...headers, ...extra },
    });

    const tabla = await consultar('user_push_subscriptions?select=id&limit=1');
    if (tabla.ok) {
        ok('existe public.user_push_subscriptions');
    } else {
        falta(
            `no existe public.user_push_subscriptions (HTTP ${tabla.status})`,
            'Pegar supabase/migrations/20260512160000_system_push_notifications.sql en el SQL Editor de Supabase.',
        );
    }

    const columnas = await consultar('user_notifications?select=id,system_notified_at,system_push_error&limit=1');
    if (columnas.ok) {
        ok('user_notifications tiene system_notified_at y system_push_error');

        // Despues del backfill de la migracion esto tiene que dar 0 o un numero
        // chico. Miles serian el historial viejo esperando para salir por push.
        const pendientes = await consultar(
            'user_notifications?select=id&read_at=is.null&system_notified_at=is.null',
            { Prefer: 'count=exact', Range: '0-0' },
        );
        const total = Number(pendientes.headers.get('content-range')?.split('/')?.[1] ?? -1);

        if (total < 0) {
            console.log('  ?     no se pudo contar la cola pendiente');
        } else if (total > 500) {
            falta(
                `la cola de push pendientes tiene ${total} notificaciones`,
                'El backfill de la migracion no corrio: el historial viejo va a salir por push a 50 por minuto. Marcarlo a mano con UPDATE public.user_notifications SET system_notified_at = now() WHERE system_notified_at IS NULL AND created_at < now() - interval \'1 day\';',
            );
        } else {
            ok(`la cola de push pendientes esta sana (${total})`);
        }
    } else {
        falta(
            `user_notifications no tiene system_notified_at (HTTP ${columnas.status})`,
            'Pegar supabase/migrations/20260512160000_system_push_notifications.sql en el SQL Editor de Supabase.',
        );
    }
}

console.log('');

if (problemas.length === 0) {
    console.log('Los avisos del sistema estan habilitados de punta a punta.\n');
    process.exit(0);
}

console.log(`Falta ${problemas.length === 1 ? 'una cosa' : `${problemas.length} cosas`}:\n`);
problemas.forEach((problema, index) => {
    console.log(`  ${index + 1}. ${problema.mensaje}`);
    console.log(`     ${problema.comoSeArregla}\n`);
});

process.exit(1);
