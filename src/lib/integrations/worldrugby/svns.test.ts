import test from 'node:test';
import assert from 'node:assert/strict';

import { parseWrSchedule } from '../../services/worldRugbyEventParser.ts';
import {
    CIRCUITOS_SVNS,
    candidatosClub,
    circuitoPorClave,
    etapasActivas,
    externalIdDe,
    nombreClub,
    planSvns,
    type ExistenteSvns,
} from './svns.ts';

const NAIROBI = circuitoPorClave('svns2-2026-m')?.etapas[0].def;
const DAY = 86_400_000;
const KICKOFF = Date.parse('2026-02-14T12:05:00Z');

function partido(id: string, home: string, away: string, status: string, scores: [number, number], millis = KICKOFF) {
    return {
        matchId: id,
        description: 'Match 1',
        eventPhase: 'Pool Pool',
        venue: { name: 'Nyayo', city: 'Nairobi' },
        time: { millis, gmtOffset: 3 },
        teams: [{ id: home, name: `${home} 7s` }, { id: away, name: `${away} 7s` }],
        scores,
        status,
        clock: { secs: 0 },
    };
}

const A = 'a1111111-1111-1111-1111-111111111111';
const B = 'b2222222-2222-2222-2222-222222222222';

const clubes: Record<string, string> = { USA: 'usa-7s', Belgium: 'belgica-7s', Kenya: 'kenya-7s', Canada: 'canada-7s' };
const resolver = (side: { country: string }) => clubes[side.country] ?? null;

test('catálogo: seis circuitos, etapas ordenadas y el SVNS 2 viejo se reusa', () => {
    assert.equal(CIRCUITOS_SVNS.length, 6);
    const claves = CIRCUITOS_SVNS.map((c) => c.clave);
    assert.deepEqual(claves, ['svns2-2026-m', 'svns2-2026-w', 'svns2-2027-m', 'svns2-2027-w', 'svns3-2027-m', 'svns3-2027-w']);
    const viejo = circuitoPorClave('svns2-2026-m');
    assert.equal(viejo?.slugExistente, 'svns-2-masculino');
    assert.equal(viejo?.nombre, 'SVNS 2 - Masculino');
    assert.deepEqual(viejo?.etapas.map((e) => e.nombre), ['Etapa Nairobi', 'Etapa Montevideo', 'Etapa São Paulo']);
    const nuevo = circuitoPorClave('svns2-2027-w');
    assert.equal(nuevo?.slugExistente, null);
    assert.equal(nuevo?.slug, 'svns-2-femenino-2026-27');
    assert.equal(nuevo?.nombre, 'SVNS 2 - Femenino 2026-27');
    assert.equal(nuevo?.externalId, 'worldrugby:svns2-2027-w');
    assert.equal(circuitoPorClave('svns3-2027-m')?.etapas.length, 1);
});

test('clubes: se prueba inglés y castellano, y las mujeres llevan su sufijo', () => {
    assert.deepEqual(candidatosClub('Kenya', 'm'), ['kenya-7s', 'kenia-7s']);
    assert.deepEqual(candidatosClub('Germany', 'm'), ['germany-7s', 'alemania-7s']);
    assert.deepEqual(candidatosClub('Spain', 'w'), ['spain-7s-w', 'espana-7s-w']);
    assert.deepEqual(candidatosClub('South Africa', 'w'), ['south-africa-7s-w', 'sudafrica-7s-w']);
    assert.equal(nombreClub('Spain', 'w'), 'España 7s W');
    assert.equal(nombreClub('Chile', 'm'), 'Chile 7s');
});

test('etapas activas: un día antes, durante y dos después', () => {
    const c = circuitoPorClave('svns2-2026-m')!;
    assert.equal(etapasActivas(c, new Date('2026-02-12T12:00:00Z')).length, 0);
    assert.equal(etapasActivas(c, new Date('2026-02-13T12:00:00Z')).length, 1);
    assert.equal(etapasActivas(c, new Date('2026-02-15T20:00:00Z')).length, 1);
    assert.equal(etapasActivas(c, new Date('2026-02-16T12:00:00Z')).length, 1);
    assert.equal(etapasActivas(c, new Date('2026-02-17T12:00:00Z')).length, 0);
});

test('plan: un partido nuevo se crea con marcador solo si ya se juega', () => {
    assert.ok(NAIROBI);
    const fixtures = parseWrSchedule({
        matches: [
            partido(A, 'USA', 'Belgium', 'C', [40, 0]),
            partido(B, 'Kenya', 'Canada', 'U', [0, 0], KICKOFF + 1000),
        ],
    }, NAIROBI, KICKOFF + 5 * 3_600_000);
    const plan = planSvns({ fixtures, existentes: [], resolverClub: resolver });
    assert.equal(plan.crear.length, 2);
    const [final, programado] = plan.crear;
    assert.equal(final.external_id, externalIdDe(A));
    assert.equal(final.status, 'final');
    assert.deepEqual(final.score, { home: 40, away: 0 });
    assert.equal(final.points_autocalculated, true);
    assert.equal(programado.status, 'scheduled');
    assert.equal(programado.score, null);
});

test('plan: una fila cargada a mano se revincula sin tocar su marcador ni su horario', () => {
    assert.ok(NAIROBI);
    const manual: ExistenteSvns = {
        id: 'fila-1', external_id: null, home_club_id: 'usa-7s', away_club_id: 'belgica-7s',
        date_time: '2026-02-14 12:05:00+00', status: 'final', score: { home: 40, away: 0 }, venue: 'Cancha 1.',
    };
    const fixtures = parseWrSchedule({ matches: [partido(A, 'USA', 'Belgium', 'C', [40, 0])] }, NAIROBI, KICKOFF + 5 * 3_600_000);
    const plan = planSvns({ fixtures, existentes: [manual], resolverClub: resolver });
    assert.equal(plan.crear.length, 0);
    assert.equal(plan.actualizar.length, 1);
    assert.deepEqual(plan.actualizar[0].patch, { external_id: externalIdDe(A) });
    assert.deepEqual(plan.huerfanos, []);
});

test('plan: fila invertida se reordena y un "sin empezar" no pisa un resultado cargado', () => {
    assert.ok(NAIROBI);
    const invertida: ExistenteSvns = {
        id: 'fila-2', external_id: null, home_club_id: 'belgica-7s', away_club_id: 'usa-7s',
        date_time: '2026-02-14 12:05:00+00', status: 'final', score: { home: 0, away: 40 }, venue: null,
    };
    const cargado: ExistenteSvns = {
        id: 'fila-3', external_id: null, home_club_id: 'kenya-7s', away_club_id: 'canada-7s',
        date_time: '2026-02-14 12:50:00+00', status: 'final', score: { home: 29, away: 12 }, venue: null,
    };
    const fixtures = parseWrSchedule({
        matches: [
            partido(A, 'USA', 'Belgium', 'C', [40, 0]),
            partido(B, 'Kenya', 'Canada', 'U', [0, 0], KICKOFF + 2_700_000),
        ],
    }, NAIROBI, KICKOFF + 5 * 3_600_000);
    const plan = planSvns({ fixtures, existentes: [invertida, cargado], resolverClub: resolver });
    const porId = new Map(plan.actualizar.map((a) => [a.id, a]));
    assert.deepEqual(porId.get('fila-2')?.patch, {
        external_id: externalIdDe(A), home_club_id: 'usa-7s', away_club_id: 'belgica-7s', score: { home: 40, away: 0 },
    });
    // World Rugby todavía lo tiene sin empezar: solo se vincula, el resultado queda.
    assert.deepEqual(porId.get('fila-3')?.patch, { external_id: externalIdDe(B) });
});

test('plan: por external_id actualiza el marcador en vivo; un equipo sin club se avisa', () => {
    assert.ok(NAIROBI);
    const existente: ExistenteSvns = {
        id: 'fila-4', external_id: externalIdDe(A), home_club_id: 'usa-7s', away_club_id: 'belgica-7s',
        date_time: '2026-02-14 12:05:00+00', status: 'scheduled', score: null, venue: null,
    };
    const fixtures = parseWrSchedule({
        matches: [
            partido(A, 'USA', 'Belgium', 'L1', [7, 5]),
            partido(B, 'Kenya', 'Zimbabwe', 'U', [0, 0], KICKOFF + 4 * DAY),
        ],
    }, NAIROBI, KICKOFF + 600_000);
    const plan = planSvns({ fixtures, existentes: [existente], resolverClub: resolver });
    assert.deepEqual(plan.actualizar[0].patch, { status: 'live', score: { home: 7, away: 5 } });
    assert.deepEqual(plan.equiposSinClub, ['Zimbabue']);
    assert.equal(plan.crear.length, 0);
});
