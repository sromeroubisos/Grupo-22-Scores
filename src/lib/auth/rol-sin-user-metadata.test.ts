import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBestUserRole } from './roles.ts';

/**
 * Regresion de la escalada a super_admin por user_metadata.
 *
 * user_metadata lo escribe el propio usuario con
 * `auth.updateUser({ data: { role: 'super_admin' } })`. Con un perfil `fan`
 * (el valor por defecto, que no gana), resolveBestUserRole caia en ese objeto
 * y devolvia el rol que el usuario se hubiera puesto: cualquier cuenta nueva
 * pasaba los guards de admin del servidor.
 */

test('un rol escrito por el usuario en user_metadata no cuenta', () => {
    for (const role of ['super_admin', 'admin_general', 'admin_torneo']) {
        assert.equal(
            resolveBestUserRole({ profileRole: 'fan', userMetadata: { role } }),
            'fan',
            `user_metadata.role=${role} no puede subir de rol`,
        );
        assert.equal(
            resolveBestUserRole({ profileRole: null, userMetadata: { roles: [role] } }),
            'fan',
            `user_metadata.roles=[${role}] no puede subir de rol`,
        );
    }
});

test('app_metadata (solo service key) y el perfil siguen mandando', () => {
    assert.equal(
        resolveBestUserRole({ profileRole: 'fan', appMetadata: { role: 'admin_torneo' }, userMetadata: { role: 'super_admin' } }),
        'admin_torneo',
    );
    assert.equal(
        resolveBestUserRole({ profileRole: 'admin_torneo', userMetadata: { role: 'super_admin' } }),
        'admin_torneo',
    );
    assert.equal(
        resolveBestUserRole({ reservedRole: 'super_admin', profileRole: 'fan' }),
        'super_admin',
    );
});
