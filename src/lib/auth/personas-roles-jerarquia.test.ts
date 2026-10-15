import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regresion de personas-roles/create (auditoria del 2026-10-15): la jerarquia
 * miraba solo el rol NUEVO, asi que un admin_general podia pasarle el email de
 * un super_admin y degradarlo. Sobre el FUENTE, como escalada-privilegios.test.ts.
 */

const fuente = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/admin/super/personas-roles/create/route.ts'),
    'utf8',
);

test('a una cuenta existente no se le toca la contraseña', () => {
    assert.doesNotMatch(fuente, /updateUserById\(/, 'resetear la contraseña de una cuenta existente es tomarla');
});

test('un admin_general no toca a quien ya es admin global', () => {
    assert.match(fuente, /\.select\('name, role'\)/, 'hay que leer el rol actual de la cuenta existente');
    assert.match(
        fuente,
        /if \(isGlobalAdminRole\(profileRow\?\.role\) && actor\.role !== 'super_admin'\) \{\s*return jsonError\([^)]*403\);/,
    );
    assert.ok(
        fuente.indexOf('isGlobalAdminRole(profileRow?.role)') < fuente.indexOf('usersTable.upsert('),
        'el chequeo del destino tiene que ir antes de escribir el rol',
    );
});
