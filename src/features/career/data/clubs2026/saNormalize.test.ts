import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AMATEUR_RATING_MAX,
    DIVISION_TIERS,
    NON_DIVISION_TOURNAMENTS,
    normalizeSaClubs,
    type RawClubRow,
    type RawStandingRow,
    type RawUnionRow,
} from './saNormalize.ts';
import { SA_CLUBS, SA_SNAPSHOT_VERSION } from './saClubs.generated.ts';

const UNIONS: RawUnionRow[] = [
    { id: 'urba', name: 'URBA' },
    { id: 'arusa', name: 'ARUSA' },
    { id: 'uru-rugby', name: 'Uru Rugby' },
    { id: 'hockey-ba', name: 'Asociación Amateur de Hóckey sobre césped Buenos Aires' },
];

function row(over: Partial<RawClubRow> & { id: string; name: string }): RawClubRow {
    return {
        short_name: null, country: 'Argentina', region: null, city: null, slug: null,
        sport: 'rugby', union_id: 'urba', is_visible: true, ...over,
    };
}

function standing(over: Partial<RawStandingRow> & { club_id: string; tournament_name: string }): RawStandingRow {
    return { played: 10, won: 5, scored: 200, conceded: 200, ...over };
}

test('descarta HOCKEY mal etiquetado como sport=rugby', () => {
    const { clubs, discarded } = normalizeSaClubs(
        [row({ id: 'a', name: 'Club Rugby' }), row({ id: 'b', name: 'Club Hockey', union_id: 'hockey-ba' })],
        UNIONS,
        [],
    );
    assert.equal(clubs.length, 1, 'solo entra el club de rugby');
    assert.equal(clubs[0].name, 'Club Rugby');
    assert.equal(discarded['unión de hockey'], 1);
});

test('descarta equipos que no son plantel superior (juveniles, femenino, A/B/C)', () => {
    const names = ['San Luis M17 "A"', 'GEBA M17 "B"', 'CUQ Femenino', 'Palermo Bajo - Damas "A"', 'Santa Rosa R.C. (C)', 'Club Intermedia'];
    const { clubs } = normalizeSaClubs(
        [row({ id: 'ok', name: 'Hindú Club' }), ...names.map((name, i) => row({ id: `x${i}`, name }))],
        UNIONS,
        [],
    );
    assert.deepEqual(clubs.map((c) => c.name), ['Hindú Club'], `se coló: ${clubs.map((c) => c.name).join(', ')}`);
});

test('descarta seleccionados y representativos', () => {
    const names = ['Argentina XV', 'Chile XV', 'Uruguay U20', 'Los Pumas 7´s', 'Chile FISU', 'Santa Fe XV'];
    const { clubs } = normalizeSaClubs(names.map((name, i) => row({ id: `s${i}`, name })), UNIONS, []);
    assert.equal(clubs.length, 0, `se colaron seleccionados: ${clubs.map((c) => c.name).join(', ')}`);
});

test('acepta los dos formatos de país y descarta el resto', () => {
    const { clubs } = normalizeSaClubs(
        [
            row({ id: 'a', name: 'Uno', country: 'Argentina' }),
            row({ id: 'b', name: 'Dos', country: 'ARG' }),
            row({ id: 'c', name: 'Tres', country: 'URY', union_id: 'uru-rugby' }),
            row({ id: 'd', name: 'Cuatro', country: 'CHL', union_id: 'arusa' }),
            row({ id: 'e', name: 'Cinco', country: 'España' }),
        ],
        UNIONS,
        [],
    );
    assert.deepEqual(clubs.map((c) => c.countryCode).sort(), ['ar', 'ar', 'cl', 'uy']);
    assert.deepEqual([...new Set(clubs.map((c) => c.competitionId))].sort(), ['sa-ar', 'sa-cl', 'sa-uy']);
});

test('el rating sale del RENDIMIENTO real, no de un hash del nombre', () => {
    const rows = [row({ id: 'fuerte', name: 'Fuerte' }), row({ id: 'flojo', name: 'Flojo' })];
    const { clubs } = normalizeSaClubs(rows, UNIONS, [
        standing({ club_id: 'fuerte', tournament_name: 'Top 14 de la URBA', won: 10, played: 10, scored: 400, conceded: 100 }),
        standing({ club_id: 'flojo', tournament_name: 'Top 14 de la URBA', won: 0, played: 10, scored: 100, conceded: 400 }),
    ]);
    const rating = (name: string) => clubs.find((c) => c.name === name)!.rating;
    assert.ok(rating('Fuerte') > rating('Flojo') + 4, `el que gana todo debe valer más: ${rating('Fuerte')} vs ${rating('Flojo')}`);

    // Mismo nombre, distinto rendimiento ⇒ distinto rating (un hash daría igual).
    const other = normalizeSaClubs([row({ id: 'fuerte', name: 'Fuerte' })], UNIONS, [
        standing({ club_id: 'fuerte', tournament_name: 'Top 14 de la URBA', won: 0, played: 10, scored: 100, conceded: 400 }),
    ]);
    assert.notEqual(other.clubs[0].rating, rating('Fuerte'), 'el rating no puede depender solo del nombre');
});

test('la división más alta manda sobre la de más partidos', () => {
    const { clubs } = normalizeSaClubs([row({ id: 'c1', name: 'Club' })], UNIONS, [
        standing({ club_id: 'c1', tournament_name: 'Primera "C" de la URBA', played: 30 }),
        standing({ club_id: 'c1', tournament_name: 'Top 14 de la URBA', played: 10 }),
    ]);
    assert.equal(clubs[0].divisionName, 'Top 14 de la URBA');
    assert.equal(clubs[0].divisionTier, DIVISION_TIERS['Top 14 de la URBA']);
});

test('los torneos que no son divisiones domésticas no fijan nivel', () => {
    assert.ok(NON_DIVISION_TOURNAMENTS.has('Super Rugby Americas'), 'SRA la cubre el catálogo estático');
    assert.ok(NON_DIVISION_TOURNAMENTS.has('Test Torneo Auto-QA 2026'), 'los datos de prueba no cuentan');
    const { clubs } = normalizeSaClubs([row({ id: 'c1', name: 'Club' })], UNIONS, [
        standing({ club_id: 'c1', tournament_name: 'Super Rugby Americas', won: 10, played: 10 }),
    ]);
    assert.equal(clubs[0].divisionName, null, 'no toma el nivel de una competición regional profesional');
});

test('las franquicias de Super Rugby Americas no se duplican: gana el catálogo estático', () => {
    const { clubs, discarded } = normalizeSaClubs(
        [
            row({ id: 'dogos-xv', name: 'Dogos XV' }),
            row({ id: 'selknam', name: 'Selknam', country: 'CHL', union_id: 'arusa' }),
            row({ id: 'pampas-de-rufino', name: 'Pampas de Rufino' }),
        ],
        UNIONS,
        [],
    );
    assert.equal(discarded['duplica franquicia SRA estática'], 2);
    assert.deepEqual(clubs.map((c) => c.name), ['Pampas de Rufino'], 'un club homónimo distinto NO se descarta');
});

test('es determinístico y estable ante el orden de entrada', () => {
    const rows = [row({ id: 'b', name: 'Bravo' }), row({ id: 'a', name: 'Alfa' }), row({ id: 'c', name: 'Charlie' })];
    const first = normalizeSaClubs(rows, UNIONS, []).clubs.map((c) => c.id);
    const second = normalizeSaClubs([...rows].reverse(), UNIONS, []).clubs.map((c) => c.id);
    assert.deepEqual(first, second, 'mismo resultado sin importar el orden de las filas');
    assert.deepEqual(first, ['sb-a', 'sb-b', 'sb-c'], 'ordenado por id');
});

// ── Snapshot generado desde el proyecto real ─────────────────────────────────
test('el snapshot generado tiene clubes reales de los tres países', () => {
    const count = (cc: string) => SA_CLUBS.filter((c) => c.countryCode === cc).length;
    assert.ok(count('ar') > 100, `pocos clubes AR: ${count('ar')}`);
    assert.ok(count('uy') > 5, `pocos clubes UY: ${count('uy')}`);
    assert.ok(count('cl') > 5, `pocos clubes CL: ${count('cl')}`);
    assert.equal(SA_CLUBS.length, count('ar') + count('uy') + count('cl'), 'solo AR/UY/CL');
    assert.ok(/^[0-9a-f]{12}$/.test(SA_SNAPSHOT_VERSION), 'versión de snapshot con forma de hash');
});

test('el snapshot respeta el contrato canónico y el techo amateur', () => {
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    for (const club of SA_CLUBS) {
        assert.equal(club.source, 'supabase');
        assert.equal(club.level, 'amateur');
        assert.equal(club.professionalStatus, 'amateur');
        assert.equal(club.seasonVersion, '2026-27');
        assert.equal(club.region, 'south-america');
        assert.ok(club.rating <= AMATEUR_RATING_MAX, `${club.name}: rating ${club.rating} > ${AMATEUR_RATING_MAX}`);
        assert.ok(club.sourceId, `${club.name}: sin sourceId`);
        assert.ok(club.shortName.length > 0, `${club.name}: sin shortName`);
        assert.ok(club.id.startsWith('sb-'), `${club.name}: id sin prefijo de origen`);
        assert.ok(!ids.has(club.id), `id duplicado: ${club.id}`);
        assert.ok(!sourceIds.has(club.sourceId!), `sourceId duplicado: ${club.sourceId}`);
        ids.add(club.id);
        sourceIds.add(club.sourceId!);
    }
});

test('los ratings del snapshot NO son uniformes', () => {
    const ratings = SA_CLUBS.map((c) => c.rating);
    assert.ok(new Set(ratings).size >= 10, `ratings casi uniformes: ${new Set(ratings).size} valores distintos`);
    assert.ok(Math.max(...ratings) - Math.min(...ratings) >= 12, 'sin dispersión real de fuerza');
});
