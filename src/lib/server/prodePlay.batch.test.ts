/**
 * La escritura de `prode_events` en lote.
 *
 * Estos casos son las tres cosas que se rompieron en produccion el 28/8 a las
 * 12:20, y estan escritos contra un cliente falso porque lo que se prueba es la
 * FORMA de las escrituras, no lo que devuelve Postgres:
 *
 *   1. una corrida grande no puede salir como un request por fila
 *      (839 PATCH en 4,3 s, y siete minutos despues el origin en 521)
 *   2. un duplicado dentro del mismo lote no puede llegar a la sentencia
 *      (al lotear, lo que antes eran dos requests que se pisaban en silencio
 *       ahora seria un error de Postgres)
 *   3. un 23505 por carrera no puede cortar la sincronizacion
 *      (~22 por hora, cada uno dejando una competencia a medio sincronizar)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { keepChangedEvents, writeCompetitionEvents } from './prodePlay';

type AnyRow = Record<string, unknown>;
type Call = { op: 'insert' | 'upsert' | 'select'; size: number; onConflict?: string };
type Client = Parameters<typeof writeCompetitionEvents>[0];

// `db-max-rows` de la base: el cliente falso corta igual que PostgREST.
const DB_MAX_ROWS = 1000;

/**
 * Cliente falso con la superficie que usa el sync. `collideOnFirstInsert`
 * simula al otro sync que crea la fila entre nuestra lectura y nuestra
 * escritura: el primer INSERT explota con 23505 y la fila aparece en la tabla.
 * `preexisting` llena la tabla antes, para que la fila de la carrera caiga
 * más allá del corte de 1000.
 */
function makeClient(options: { collideOnFirstInsert?: string[]; preexisting?: number } = {}) {
    const calls: Call[] = [];
    const existing: AnyRow[] = Array.from({ length: options.preexisting ?? 0 }, (_, index) => ({
        id: `old-${index}`,
        local_match_id: `old-${index}`,
    }));
    let insertAttempts = 0;

    const client = {
        from() {
            return {
                select() {
                    const query = {
                        eq: () => query,
                        order: () => query,
                        range(from: number, to: number) {
                            calls.push({ op: 'select', size: existing.length });
                            const end = Math.min(to + 1, from + DB_MAX_ROWS);
                            return Promise.resolve({ data: existing.slice(from, end), error: null });
                        },
                    };
                    return query;
                },
                insert(payload: AnyRow[]) {
                    insertAttempts += 1;
                    calls.push({ op: 'insert', size: payload.length });

                    const collide = options.collideOnFirstInsert;
                    if (collide && insertAttempts === 1) {
                        for (const key of collide) {
                            existing.push({ id: `race-${key}`, local_match_id: key });
                        }
                        return Promise.resolve({
                            data: null,
                            error: {
                                code: '23505',
                                message: 'duplicate key value violates unique constraint "idx_prode_events_unique_local"',
                            },
                        });
                    }

                    for (const row of payload) {
                        existing.push({ id: `new-${String(row.local_match_id)}`, ...row });
                    }
                    return Promise.resolve({ data: payload, error: null });
                },
                upsert(payload: AnyRow[], opts?: { onConflict?: string }) {
                    calls.push({ op: 'upsert', size: payload.length, onConflict: opts?.onConflict });
                    return Promise.resolve({ data: payload, error: null });
                },
                update() {
                    throw new Error('el PATCH por fila es justamente lo que no debe volver');
                },
            };
        },
    };

    return { client: client as unknown as Client, calls };
}

function localPayloads(count: number): AnyRow[] {
    return Array.from({ length: count }, (_, index) => ({
        competition_id: 'c1',
        source_type: 'local',
        local_match_id: `m${index}`,
        status: 'scheduled',
    }));
}

test('450 actualizaciones entran en 3 requests, no en 450', async () => {
    const payloads = localPayloads(450);
    const existingIds = new Map(payloads.map((_, index) => [`m${index}`, `id-${index}`]));
    const { client, calls } = makeClient();

    const complete = await writeCompetitionEvents(client, 'c1', 'local', payloads, existingIds);

    assert.equal(complete, true);

    const upserts = calls.filter((call) => call.op === 'upsert');
    assert.deepEqual(upserts.map((call) => call.size), [200, 200, 50]);
    assert.ok(
        upserts.every((call) => call.onConflict === 'id'),
        'el update masivo arbitra por clave primaria, el unico indice TOTAL de la tabla',
    );
    assert.equal(calls.filter((call) => call.op === 'insert').length, 0);
});

test('una fila repetida se pliega antes de llegar a la sentencia', async () => {
    const payloads: AnyRow[] = [
        { competition_id: 'c1', local_match_id: 'dup', status: 'scheduled' },
        { competition_id: 'c1', local_match_id: 'dup', status: 'final' },
        { competition_id: 'c1', local_match_id: 'otro', status: 'scheduled' },
    ];
    const { client, calls } = makeClient();

    const complete = await writeCompetitionEvents(client, 'c1', 'local', payloads, new Map());

    assert.equal(complete, true);

    const inserts = calls.filter((call) => call.op === 'insert');
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].size, 2, 'dos filas, no tres: la repetida no viaja');
});

test('el 23505 de una carrera se recupera en vez de cortar el sync', async () => {
    const payloads: AnyRow[] = [{ competition_id: 'c1', local_match_id: 'carrera', status: 'final' }];
    const { client, calls } = makeClient({ collideOnFirstInsert: ['carrera'] });

    const complete = await writeCompetitionEvents(client, 'c1', 'local', payloads, new Map());

    assert.equal(complete, true, 'la competencia queda sincronizada, no a medias');
    assert.equal(calls.filter((call) => call.op === 'select').length, 1, 'relee los ids una sola vez');

    const recovery = calls.filter((call) => call.op === 'upsert' && call.onConflict === 'id');
    assert.equal(recovery.length, 1, 'la fila que choco se reescribe como update');
    assert.equal(recovery[0].size, 1);
});

test('la carrera se recupera aunque la fila caiga después de la 1000', async () => {
    // El Top 14 de la URBA tenía 1182 eventos: la relectura sin paginar traía los
    // primeros 1000, la fila que había chocado no estaba entre ellos, y el sync
    // devolvía `false` en cada corrida — 409 tras 409, cada cinco minutos.
    const payloads: AnyRow[] = [{ competition_id: 'c1', local_match_id: 'carrera', status: 'final' }];
    const { client, calls } = makeClient({ collideOnFirstInsert: ['carrera'], preexisting: 1100 });

    const complete = await writeCompetitionEvents(client, 'c1', 'local', payloads, new Map());

    assert.equal(complete, true, 'la fila 1101 aparece en la segunda página');
    assert.equal(calls.filter((call) => call.op === 'select').length, 2, 'dos páginas, no una');

    const recovery = calls.filter((call) => call.op === 'upsert' && call.onConflict === 'id');
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].size, 1);
});

/**
 * Lo que el sync decide NO escribir. Hasta el 14/9 cada corrida reescribía todos
 * los partidos y pisaba los puntuados con `final`, así que el scoring volvía a
 * puntuarlos: pronósticos de hace cinco meses con `scored_at` de hace un minuto.
 */
function syncedPayload(overrides: AnyRow = {}): AnyRow {
    return {
        competition_id: 'c1',
        source_type: 'local',
        local_match_id: 'm1',
        tournament_id: 't1',
        home_label: 'Hindú',
        away_label: 'SIC',
        starts_at: '2026-09-13T18:30:00.000Z',
        locks_at: '2026-09-13T18:30:00.000Z',
        status: 'final',
        scoring_status: 'ready',
        official_result: { home_score: 24, away_score: 17, outcome: 'home' },
        match_snapshot: { roundLabel: 'Fecha 12', score: { home: 24, away: 17 }, homeLogoUrl: '/api/assets/team-logo?key=hindu' },
        ...overrides,
    };
}

// Así vuelve la misma fila de Postgres: jsonb reordena las claves y el
// timestamptz sale con `+00:00`.
function storedRow(overrides: AnyRow = {}): AnyRow {
    return {
        id: 'e1',
        local_match_id: 'm1',
        tournament_id: 't1',
        home_label: 'Hindú',
        away_label: 'SIC',
        starts_at: '2026-09-13T18:30:00+00:00',
        locks_at: '2026-09-13T18:30:00+00:00',
        status: 'scored',
        scoring_status: 'scored',
        official_result: { outcome: 'home', away_score: 17, home_score: 24 },
        match_snapshot: { score: { away: 17, home: 24 }, roundLabel: 'Fecha 12', homeLogoUrl: '/api/assets/team-logo?key=hindu' },
        ...overrides,
    };
}

test('un partido ya puntuado y sin cambios no se vuelve a escribir', () => {
    const changed = keepChangedEvents('local', [syncedPayload()], new Map([['m1', storedRow()]]));
    assert.deepEqual(changed, [], 'mismo partido, mismo resultado: nada que escribir');
});

test('si cambia algo que no es el resultado, se escribe sin reabrir el puntaje', () => {
    const payload = syncedPayload({ home_label: 'Hindú Club' });
    const [written] = keepChangedEvents('local', [payload], new Map([['m1', storedRow()]]));

    assert.equal(written.home_label, 'Hindú Club');
    assert.equal(written.status, 'scored', 'no vuelve a `final`: el scoring no lo repuntúa');
    assert.equal(written.scoring_status, 'scored');
});

test('una corrección del resultado sí reabre el partido para repuntuar', () => {
    const payload = syncedPayload({ official_result: { home_score: 24, away_score: 24, outcome: 'draw' } });
    const [written] = keepChangedEvents('local', [payload], new Map([['m1', storedRow()]]));

    assert.equal(written.status, 'final');
    assert.equal(written.scoring_status, 'ready');
});

test('un partido nuevo se escribe tal cual', () => {
    const changed = keepChangedEvents('local', [syncedPayload({ local_match_id: 'm2' })], new Map([['m1', storedRow()]]));
    assert.equal(changed.length, 1);
    assert.equal(changed[0].local_match_id, 'm2');
});

test('un error que no es de unicidad sigue subiendo', async () => {
    const client = {
        from() {
            return {
                select() {
                    return { eq: () => Promise.resolve({ data: [], error: null }) };
                },
                insert() {
                    return Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } });
                },
                upsert: () => Promise.resolve({ data: null, error: null }),
                update() {
                    throw new Error('no');
                },
            };
        },
    } as unknown as Client;

    await assert.rejects(
        () => writeCompetitionEvents(client, 'c1', 'local', localPayloads(1), new Map()),
        /column does not exist/,
        'solo el 23505 es recuperable; el resto tiene que hacer ruido',
    );
});
