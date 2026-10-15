import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regresion de las escrituras RLS abiertas a cualquier sesion.
 *
 * En produccion, external_tournaments, external_tournament_standings_overrides,
 * team_labels y ui_labels dejaban escribir a cualquier `authenticated` con la
 * anon key. Se cierra en 20261015120000_cerrar_escrituras_rls_abiertas.sql.
 *
 * Son tests sobre el FUENTE, como escalada-privilegios.test.ts: lo que hay que
 * impedir es que alguien vuelva a abrir la policy o que una ruta vuelva a
 * depender de ella escribiendo con la sesion del usuario.
 */

function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

const MIGRACION = 'supabase/migrations/20261015120000_cerrar_escrituras_rls_abiertas.sql';
const TABLAS = [
    'external_tournament_standings_overrides',
    'external_tournaments',
    'team_labels',
    'ui_labels',
];

/** Las sentencias `create policy` de la migracion, sin comentarios. */
function policies(sql: string): string[] {
    const sinComentarios = sql
        .split('\n')
        .filter((linea) => !linea.trim().startsWith('--'))
        .join('\n');
    return sinComentarios
        .split(';')
        .map((s) => s.trim())
        .filter((s) => /^create policy/i.test(s));
}

test('la migracion reescribe cada policy de escritura de las cuatro tablas', () => {
    const sql = leer(MIGRACION);
    for (const tabla of TABLAS) {
        assert.match(sql, new RegExp(`drop policy if exists ${tabla}_insert on public\\.${tabla};`));
        assert.match(sql, new RegExp(`drop policy if exists ${tabla}_update on public\\.${tabla};`));
    }
    assert.match(sql, /drop policy if exists team_labels_delete on public\.team_labels;/);
    assert.match(sql, /drop policy if exists ui_labels_delete on public\.ui_labels;/);
});

test('ninguna policy nueva se conforma con estar logueado', () => {
    const creadas = policies(leer(MIGRACION));
    assert.equal(creadas.length, 10);
    for (const policy of creadas) {
        assert.doesNotMatch(policy, /auth\.role\(\)/, policy);
        assert.doesNotMatch(policy, /auth\.uid\(\)\s+is\s+not\s+null/i, policy);
        assert.doesNotMatch(policy, /(using|check)\s*\(\s*true\s*\)/i, policy);
        assert.match(policy, /public\.is_global_admin\(\)/, policy);
    }
});

test('las rutas de etiquetas escriben ui_labels con service role, no con la sesion', () => {
    const coleccion = leer('src/app/api/admin/labels/route.ts');
    assert.match(coleccion, /await createAdminClient\(\)\s*\n\s*\.from\('ui_labels'\)\s*\n\s*\.insert\(/);

    const item = leer('src/app/api/admin/labels/[id]/route.ts');
    const guard = item.slice(item.indexOf('async function requireLabelAdmin'));
    const cuerpo = guard.slice(0, guard.indexOf('\n}\n'));
    assert.match(cuerpo, /await requireTournamentAdminContext\(supabase\)/, 'el chequeo de rol tiene que seguir');
    assert.match(cuerpo, /return createAdminClient\(\);/);
});
