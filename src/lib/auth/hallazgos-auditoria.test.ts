import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regresiones de la auditoria de seguridad del 2026-10-15 (hallazgos medios y
 * bajos). Son sobre el FUENTE, como escalada-privilegios.test.ts: lo que se
 * impide es que alguien vuelva a abrir el camino.
 */

function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

function sinComentariosSql(sql: string): string {
    return sql
        .split('\n')
        .filter((linea) => !linea.trim().startsWith('--'))
        .join('\n');
}

test('migracion de alineacion: club_invite_links queda sin policies', () => {
    const sql = sinComentariosSql(leer('supabase/migrations/20261015130000_alinear_endurecimiento_de_prod.sql'));
    assert.match(sql, /alter table public\.club_invite_links enable row level security;/);
    for (const policy of [
        'club_invite_links_select_any',
        'club_invite_links_insert_admin',
        'club_invite_links_delete_admin',
        'club_invite_links_update_admin',
    ]) {
        assert.match(sql, new RegExp(`drop policy if exists "${policy}" on public\\.club_invite_links;`));
    }
    assert.doesNotMatch(sql, /create policy[^;]*club_invite_links/i);
});

test('migracion de alineacion: las RPC de tabla y ronda no las ejecuta anon ni authenticated', () => {
    const sql = sinComentariosSql(leer('supabase/migrations/20261015130000_alinear_endurecimiento_de_prod.sql'));
    for (const firma of ['recalculate_tournament_standings\\(uuid\\)', 'complete_round\\(uuid\\)']) {
        assert.match(sql, new RegExp(`revoke execute on function public\\.${firma} from public, anon, authenticated;`));
        assert.match(sql, new RegExp(`alter function public\\.${firma} set search_path = public, pg_temp;`));
    }
    assert.match(sql, /revoke execute on function public\.generate_rounds_for_phase\(uuid, integer, text\) from public, anon;/);
    // generate_rounds_for_phase queda abierta a authenticated SOLO porque valida adentro.
    assert.match(sql, /can_manage_tournament\(v_tournament_id/);
    assert.match(sql, /RAISE EXCEPTION 'Sin permiso sobre la fase'/);
});

test('team-squads: el equipo de la URL nunca entra en un filtro armado como texto', () => {
    const fuente = leer('src/lib/services/teamSquad.ts');
    assert.doesNotMatch(fuente, /\.or\(`/, 'un .or() con template string vuelve a abrir la inyeccion de filtros');
    assert.match(fuente, /for \(const column of \['id', 'slug'\] as const\)[\s\S]{0,200}\.eq\(column, key\)/);
});

test('player-ratings: el POST valida la clave y topa jugadores por cuenta', () => {
    const fuente = leer('src/app/api/matches/[id]/player-ratings/route.ts');
    assert.match(fuente, /cleanPlayerName\(str\(payload\.playerName\)\)/);
    assert.match(fuente, /isValidPlayerKey\(playerKey\)/);
    assert.match(fuente, /ownKeys\.size >= MAX_RATED_PLAYERS_PER_MATCH/);
    assert.ok(
        fuente.indexOf('MAX_RATED_PLAYERS_PER_MATCH)') < fuente.indexOf('.upsert('),
        'el tope tiene que correr antes de guardar',
    );

    const panel = leer('src/components/match/PeopleRatingsPanel.tsx');
    assert.match(panel, /pickMvpAmong\(summary\.players, new Set\(players\.map\(\(p\) => p\.key\)\)\)/);
});
