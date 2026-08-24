import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveBestUserRole } from './roles.ts';

/**
 * Regresión de la escalada a super_admin.
 *
 * Había dos caminos, independientes entre sí, para que un usuario recién
 * registrado se hiciera super_admin:
 *
 *  1. `user_metadata`. El propio usuario lo escribe con
 *     `auth.updateUser({ data: { role: 'super_admin' } })`, y
 *     `resolveBestUserRole` lo leía como fuente de rol. Peor: `syncUserProfile`
 *     —que corre con la SERVICE KEY— lo persistía en `users.role`.
 *  2. La policy `users_update_access`, que habilita UPDATE de la fila propia sin
 *     restringir columnas. Eso se cierra en la base
 *     (20260819210000_blindar_users_role.sql), no acá.
 *
 * Estos tests cubren el camino 1 y la puerta de invitado. Son en parte sobre el
 * FUENTE porque lo que hay que impedir es que alguien vuelva a enchufar el
 * canal: una vez que el parámetro no existe, no queda nada que ejercitar en
 * runtime.
 */

function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

const ARCHIVOS_QUE_RESUELVEN_ROL = [
    'src/lib/auth/roles.ts',
    'src/lib/auth/permissions.ts',
    'src/lib/auth/server.ts',
    'src/lib/auth/newsAccess.ts',
    'src/lib/auth/syncUserProfile.ts',
    'src/context/AuthContext.tsx',
    'src/app/login/auth-client.ts',
    'src/app/auth/callback/finalize/page.tsx',
];

test('resolveBestUserRole no expone un canal user_metadata', () => {
    const fuente = leer('src/lib/auth/roles.ts');
    const firma = fuente.match(/export function resolveBestUserRole\(\{[\s\S]*?\}\): AppUserRole \{/);

    assert.ok(firma, 'no se encontró la firma de resolveBestUserRole — ¿la renombraron?');
    assert.ok(
        !/userMetadata/.test(firma[0]),
        'resolveBestUserRole volvió a aceptar userMetadata: el propio usuario escribe ese objeto y se hace super_admin solo',
    );
});

test('ningún llamador le pasa user_metadata al resolutor de rol', () => {
    const culpables = ARCHIVOS_QUE_RESUELVEN_ROL.filter((archivo) => /userMetadata\s*:/.test(leer(archivo)));

    assert.deepEqual(
        culpables,
        [],
        `estos archivos volvieron a pasar userMetadata como fuente de rol: ${culpables.join(', ')}`,
    );
});

test('el rol sale del perfil, no de la metadata del propio usuario', () => {
    // Un fan cuyo perfil dice 'fan' se queda en fan aunque la metadata mienta:
    // el objeto que él controla ya no tiene por dónde entrar.
    assert.equal(
        resolveBestUserRole({ profileRole: 'fan', appMetadata: {} }),
        'fan',
    );

    // El perfil de la base manda.
    assert.equal(
        resolveBestUserRole({ profileRole: 'super_admin', appMetadata: {} }),
        'super_admin',
    );

    // app_metadata sigue siendo un canal válido: solo lo escribe la Admin API.
    assert.equal(
        resolveBestUserRole({ profileRole: 'fan', appMetadata: { role: 'admin_general' } }),
        'admin_general',
    );

    // El allowlist de emails reservados gana sobre todo lo demás.
    assert.equal(
        resolveBestUserRole({ reservedRole: 'super_admin', profileRole: 'fan', appMetadata: {} }),
        'super_admin',
    );
});

test('la puerta de invitado está cerrada en los tres puntos que la consumen', () => {
    // La cookie `g22_guest_club_access` la reparte un GET sin credenciales y da
    // panel de club. Cada uno de estos tres puntos alcanza por sí solo para
    // entrar, así que los tres tienen que mirar el flag.
    const puntos = [
        ['src/app/api/auth/guest-club-family/route.ts', 'la ruta que emite la cookie'],
        ['src/lib/auth/permissions.ts', 'getGuestAccessContext, que la vuelve una membresía'],
        ['src/proxy.ts', 'el bypass del proxy, que saltea el redirect a /login'],
    ];

    for (const [archivo, queEs] of puntos) {
        assert.ok(
            /isGuestClubAccessEnabled\(\)/.test(leer(archivo)),
            `${archivo} (${queEs}) dejó de chequear isGuestClubAccessEnabled()`,
        );
    }
});

test('el flag de invitado viene apagado si nadie lo prende', () => {
    const fuente = leer('src/lib/auth/guestClubAccess.ts');

    assert.match(
        fuente,
        /process\.env\.GUEST_CLUB_ACCESS_ENABLED === 'true'/,
        'el flag tiene que exigir el opt-in explícito, nunca prenderse por defecto',
    );
});

test('los guards de admin server-side validan la firma del token', () => {
    // getSession() decodifica la cookie sin verificarla contra Supabase, y la
    // cookie se emite sin httpOnly. Donde cuelga un chequeo de rol, va getUser().
    const guards = [
        ['src/lib/auth/server.ts', 'getCurrentUser → isSuperAdmin / requireSuperAdmin'],
        ['src/app/api/auth/sync-user/route.ts', 'escribe en users con la service key'],
        ['src/lib/auth/permissions.ts', 'getUserAccessContext → todo el resto'],
    ];

    for (const [archivo, queEs] of guards) {
        assert.ok(
            /auth\.getUser\(\)/.test(leer(archivo)),
            `${archivo} (${queEs}) tiene que verificar con getUser()`,
        );
    }
});

test('los endpoints admin que estaban abiertos tienen guard', () => {
    const rutas = [
        'src/app/api/admin/system/import-tournaments/route.ts',
        'src/app/api/admin/clubs/[clubId]/squads/route.ts',
        'src/app/api/admin/tournaments/[id]/phases/route.ts',
        'src/app/api/admin/union/[id]/discipline/route.ts',
    ];

    for (const ruta of rutas) {
        const fuente = leer(ruta);
        const handlers = [...fuente.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)];

        assert.ok(handlers.length > 0, `${ruta}: no se encontró ningún handler`);
        assert.ok(
            /require(Global)?AdminApiUser\(\)/.test(fuente),
            `${ruta} quedó sin guard de admin`,
        );
    }
});

/**
 * Invariante de todo el servidor, no una lista de archivos: `getSession()`
 * decodifica la cookie de sesión sin verificar la firma contra Supabase, y esa
 * cookie se emite sin httpOnly. Un Server Component o route handler que decida
 * algo con ella —quién sos, qué podés escribir— acepta un token fabricado.
 *
 * Barre todo `src/app/api/**` y cada page/layout que no sea 'use client'. En el
 * cliente `getSession()` es inofensivo: el navegador ya tiene la sesión y no
 * puede otorgarse nada; quien valida es PostgREST del otro lado.
 */
const GETSESSION_PERMITIDO = new Set([
    // Diagnóstico: compara a propósito getSession contra getUser. Detrás de requireAdminApiUser.
    'src/app/api/admin/debug-rpc/route.ts',
    // Instrumentación: mide cuánto tarda getSession, no autoriza con el resultado.
    'src/app/api/debug/supabase-latency/route.ts',
]);

function archivosDeServidor() {
    const encontrados = [];

    const recorrer = (dir) => {
        for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
            const completo = path.join(dir, entrada.name);
            if (entrada.isDirectory()) {
                recorrer(completo);
                continue;
            }
            if (!/\.tsx?$/.test(entrada.name)) continue;

            const relativo = path.relative(process.cwd(), completo).split(path.sep).join('/');
            const esApi = relativo.startsWith('src/app/api/');
            const esPagina = /\/(page|layout)\.tsx?$/.test(relativo);
            if (!esApi && !esPagina) continue;

            // 'use client' => corre en el navegador, no es frontera de confianza.
            if (/^\s*['"]use client['"]/.test(fs.readFileSync(completo, 'utf8'))) continue;

            encontrados.push(relativo);
        }
    };

    recorrer(path.join(process.cwd(), 'src', 'app'));
    return encontrados;
}

test('ninguna decisión de autorización del servidor usa getSession()', () => {
    const culpables = archivosDeServidor()
        .filter((archivo) => !GETSESSION_PERMITIDO.has(archivo))
        .filter((archivo) => /auth\.getSession\(\)/.test(leer(archivo)));

    assert.deepEqual(
        culpables,
        [],
        'estos archivos de servidor volvieron a autorizar con getSession(), que no verifica la firma del token:\n  '
            + culpables.join('\n  '),
    );
});

test('el barrido de getSession() mira una cantidad de archivos creíble', () => {
    // Si un cambio de estructura hace que archivosDeServidor() devuelva vacío,
    // el test de arriba pasaría sin haber mirado nada.
    assert.ok(
        archivosDeServidor().length > 50,
        'el barrido encontró casi nada: se rompió el recorrido, no es que no haya archivos',
    );
});

test('/admin chequea el rol en el servidor, no solo en el cliente', () => {
    const layout = leer('src/app/admin/layout.tsx');

    assert.match(layout, /requireRequestUserAccessContext/, '/admin/layout.tsx dejó de exigir sesión en el servidor');
    assert.match(layout, /hasFederationAdminAccess/, '/admin/layout.tsx dejó de chequear el rol en el servidor');

    // El bypass viejo dejaba entrar a /admin/matches/* sin sesión ni rol.
    const enCodigo = leer('src/app/admin/AdminWrapper.tsx')
        .split('\n')
        .filter((l) => l.includes('isMatchConsole') && !l.trim().startsWith('//'));

    assert.deepEqual(enCodigo, [], 'volvió el bypass isMatchConsole en AdminWrapper');
});
