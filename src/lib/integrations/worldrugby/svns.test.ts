import test from 'node:test';
import assert from 'node:assert/strict';

import { parseWrSchedule } from '../../services/worldRugbyEventParser.ts';
import {
    CIRCUITOS_SVNS,
    clasificacionFinal,
    formatoDe,
    puestoDeFase,
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

test('catálogo: 16 circuitos, etapas ordenadas y el SVNS 2 viejo se reusa', () => {
    assert.equal(CIRCUITOS_SVNS.length, 16);
    const claves = CIRCUITOS_SVNS.map((c) => c.clave);
    assert.deepEqual(claves, [
        'svns-2026-m', 'svns-2026-w', 'svns-2027-m', 'svns-2027-w', 'svns2-2026-m', 'svns2-2026-w', 'svns2-2027-m', 'svns2-2027-w',
        'svns3-2026-m', 'svns3-2026-w', 'svns3-2027-m', 'svns3-2027-w', 'wc-2026-m', 'wc-2026-w', 'wc-2027-m', 'wc-2027-w',
    ]);
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

test('catálogo: formato y puntos por nivel, con nombres y slugs', () => {
    const uno = circuitoPorClave('svns-2026-m')!;
    assert.equal(uno.etapas.length, 6);
    assert.equal(uno.nombre, 'SVNS 1 - Masculino 2025-26');
    assert.equal(uno.slug, 'svns-1-masculino-2025-26');
    assert.ok(uno.etapas.every((e) => e.formato === 'grupos'));
    assert.deepEqual(uno.puntosPorPuesto, [20, 18, 16, 14, 12, 10, 8, 6]);
    assert.deepEqual(uno.etapas.map((e) => e.ciudad), ['Dubái', 'Ciudad del Cabo', 'Singapur', 'Perth', 'Vancouver', 'Nueva York']);
    const mundial = circuitoPorClave('wc-2027-w')!;
    assert.equal(mundial.slug, 'svns-world-championship-femenino-2026-27');
    assert.equal(mundial.etapas.length, 3);
    assert.equal(mundial.puntosPorPuesto.length, 12);
    assert.equal(formatoDe('svns3', '2026'), 'grupos');
    assert.equal(formatoDe('svns3', '2027'), 'liga');
    assert.equal(formatoDe('svns2', '2027'), 'liga');
});

test('puestos: la final da 1.º y 2.º y cada partido por un puesto, el suyo y el siguiente', () => {
    assert.equal(puestoDeFase('Cup Final'), 1);
    assert.equal(puestoDeFase('3rd Place Play-Off'), 3);
    assert.equal(puestoDeFase('11th Place Play-Off'), 11);
    assert.equal(puestoDeFase('Cup Semi Finals'), null);
    assert.equal(puestoDeFase('5th Place Semi Final'), null);
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
    const [final, programado] = plan.crear.map((c) => c.fila);
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

// --------------------------------------------------------------------------
// Etapas con grupos y cuadro
// --------------------------------------------------------------------------

const DUBAI_1 = circuitoPorClave('svns-2027-m')!.etapas[0];

function cruce(id: string, fase: string, home: string, away: string, scores: [number, number], millis: number) {
    return { ...partido(id, home, away, 'C', scores, millis), eventPhase: fase };
}

test('grupos: los partidos de grupo y de cuadro van a su fase, con su etiqueta', () => {
    const clubes2: Record<string, string> = { USA: 'usa-7s', Fiji: 'fiji-7s', Spain: 'espana-7s', France: 'francia-7s' };
    const json = {
        matches: [
            cruce('a1111111-1111-1111-1111-111111111111', 'Pool A', 'USA', 'Fiji', [21, 7], KICKOFF),
            cruce('a2222222-2222-2222-2222-222222222222', 'Cup Final', 'Spain', 'France', [14, 12], KICKOFF + DAY),
        ],
    };
    const fixtures = parseWrSchedule(json, DUBAI_1.def, KICKOFF + 3 * DAY);
    const plan = planSvns({ fixtures, existentes: [], resolverClub: (s) => clubes2[s.country] ?? null, formato: 'grupos' });
    assert.equal(plan.crear.length, 2);
    const [grupo, cuadro] = plan.crear;
    assert.equal(grupo.fase, 'grupos');
    assert.equal(grupo.grupo, 'A');
    assert.equal(grupo.fila.round_label, 'Grupo A · Fecha 1');
    assert.equal(cuadro.fase, 'final');
    assert.equal(cuadro.grupo, null);
    assert.equal(cuadro.fila.round_label, 'Final · Copa');
});

test('clasificación final: cada final reparte dos puestos y suma lo jugado', () => {
    const clubes3: Record<string, string> = { USA: 'usa-7s', Fiji: 'fiji-7s', Spain: 'espana-7s', France: 'francia-7s', Kenya: 'kenya-7s', Samoa: 'samoa-7s' };
    const json = {
        matches: [
            cruce('a1111111-1111-1111-1111-111111111111', 'Pool A', 'USA', 'Fiji', [21, 7], KICKOFF),
            cruce('a2222222-2222-2222-2222-222222222222', 'Cup Final', 'Spain', 'France', [14, 12], KICKOFF + DAY),
            cruce('a3333333-3333-3333-3333-333333333333', '3rd Place Play-Off', 'Fiji', 'USA', [7, 19], KICKOFF + DAY + 1000),
            cruce('a4444444-4444-4444-4444-444444444444', '5th Place Play-Off', 'Kenya', 'Samoa', [0, 5], KICKOFF + DAY + 2000),
        ],
    };
    const fixtures = parseWrSchedule(json, DUBAI_1.def, KICKOFF + 3 * DAY);
    const filas = clasificacionFinal(fixtures, (s) => clubes3[s.country] ?? null, [20, 18, 16, 14, 12, 10, 8, 6]);
    assert.deepEqual(filas.map((f) => [f.position, f.clubId, f.points]), [
        [1, 'espana-7s', 20], [2, 'francia-7s', 18], [3, 'usa-7s', 16], [4, 'fiji-7s', 14], [5, 'samoa-7s', 12], [6, 'kenya-7s', 10],
    ]);
    const usa = filas.find((f) => f.clubId === 'usa-7s')!;
    assert.deepEqual([usa.played, usa.won, usa.scored, usa.conceded], [2, 2, 40, 14]);
});
