import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLobbyCompetitions, isCompetitionActive, isCompetitionUpcoming } from './lobbyOrder.ts';
import type { PublicProdeCompetition } from './types.ts';

type Overrides = {
    slug: string;
    open?: number;
    live?: number;
    total?: number;
    nextLockAt?: string | null;
    startAt?: string | null;
    status?: PublicProdeCompetition['status'];
    featured?: boolean;
};

function competition({
    slug,
    open = 0,
    live = 0,
    total = 0,
    nextLockAt = null,
    startAt = null,
    status = 'active',
    featured = false,
}: Overrides): PublicProdeCompetition {
    return {
        id: slug,
        name: slug,
        slug,
        description: null,
        sportId: 'rugby',
        status,
        visibility: 'unlisted',
        sourceBinding: {
            sourceType: 'local',
            localTournamentId: null,
            localMatchId: null,
            externalProvider: null,
            externalTournamentId: null,
            externalMatchId: null,
        },
        sourceSummary: 'Torneo local',
        predictionLeadMinutes: 0,
        startAt,
        endAt: null,
        metadata: featured ? { featured: true } : {},
        stats: { total, open, live, finished: total - open - live, nextLockAt },
        members: { totalMembers: 0 },
    };
}

// El caso real que se rompió: 38 competencias, todas con status 'active', y solo 5
// con partidos abiertos. El orden viejo mandaba esas 5 a las posiciones 34 a 38
// porque la cadena vacía le ganaba el localeCompare a cualquier fecha ISO.
test('las competencias jugables van primero, no ultimas', () => {
    const sinFixture = Array.from({ length: 33 }, (_, index) =>
        competition({ slug: `vacia-${String(index).padStart(2, '0')}` }),
    );
    const jugables = [
        competition({ slug: 'top-14', open: 42, total: 119, nextLockAt: '2026-08-15T18:00:00.000Z' }),
        competition({ slug: 'liga-profesional', open: 133, total: 343, nextLockAt: '2026-08-11T22:00:00.000Z' }),
        competition({ slug: 'world-cup', open: 34, total: 75, nextLockAt: '2026-08-12T15:00:00.000Z' }),
    ];

    const ordenadas = [...sinFixture, ...jugables].sort(compareLobbyCompetitions);

    assert.deepEqual(
        ordenadas.slice(0, 3).map((row) => row.slug),
        ['liga-profesional', 'world-cup', 'top-14'],
        'las jugables tienen que encabezar, y entre ellas ordenar por proximo cierre',
    );
});

test('entre dos sin fixture no se invierte el orden de entrada', () => {
    const primera = competition({ slug: 'a' });
    const segunda = competition({ slug: 'b' });

    assert.equal(compareLobbyCompetitions(primera, segunda), 0);
});

test('una destacada gana aunque no tenga partidos abiertos', () => {
    const destacada = competition({ slug: 'destacada', featured: true });
    const jugable = competition({ slug: 'jugable', open: 10, nextLockAt: '2026-08-11T22:00:00.000Z' });

    assert.ok(compareLobbyCompetitions(destacada, jugable) < 0);
});

// status='active' es el valor por defecto de las 38 filas de la base, así que no
// puede ser lo que define si una competencia esta activa.
test('status active sin partidos no alcanza para estar activa', () => {
    assert.equal(isCompetitionActive(competition({ slug: 'vacia', status: 'active' })), false);
    assert.equal(isCompetitionActive(competition({ slug: 'abierta', open: 1 })), true);
    assert.equal(isCompetitionActive(competition({ slug: 'en-vivo', live: 1 })), true);
});

test('proximas deja de ser una rama inalcanzable', () => {
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    const pasado = new Date(Date.now() - 86_400_000).toISOString();

    assert.equal(isCompetitionUpcoming(competition({ slug: 'proxima', nextLockAt: futuro })), true);
    assert.equal(isCompetitionUpcoming(competition({ slug: 'ya-paso', nextLockAt: pasado })), false);
    assert.equal(isCompetitionUpcoming(competition({ slug: 'sin-fecha' })), false);
    assert.equal(
        isCompetitionUpcoming(competition({ slug: 'jugando', open: 5, nextLockAt: futuro })),
        false,
        'si ya se puede jugar no es proxima',
    );
});
