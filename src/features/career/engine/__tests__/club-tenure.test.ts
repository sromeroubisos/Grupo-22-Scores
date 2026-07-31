// PERMANENCIA EN EL CLUB.
//
// Lo que vigila este archivo no es el contador en sí sino las dos decisiones de
// diseño que lo sostienen:
//
//   1. Es DERIVADO. No hay campo en `CareerState`, así que ninguna partida
//      guardada se invalida ni puede quedar desincronizada.
//   2. Mide TEMPORADAS, no decisiones. Un "Seguir en X" en ritmo Exprés vale
//      tres temporadas; si midiera decisiones, la misma carrera se vería tres
//      veces menos fiel solo por haberse jugado más rápido.

import test from 'node:test';
import assert from 'node:assert/strict';
import { clubTenure, createInitialCareer, stayHint, TENURE_TIERS } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import type { SeasonResult } from '../../types/season.ts';

/**
 * Estado mínimo para el contador: solo le importan `player.club` y el club de
 * cada temporada. Se arma sobre una carrera real para no inventarle una forma
 * al estado que después se separe de la verdadera.
 */
function withSeasons(clubIds: string[], currentClub?: string): CareerState {
    const base = createInitialCareer(
        { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'development' },
        20260726,
    );
    const seasons = clubIds.map((club, i) => ({ ...({} as SeasonResult), seasonIndex: i, club }));
    return {
        ...base,
        seasons,
        player: { ...base.player, club: currentClub ?? clubIds[clubIds.length - 1] ?? base.player.club },
    };
}

test('cuenta temporadas consecutivas en el club actual', () => {
    const t = clubTenure(withSeasons(['richmond', 'richmond', 'richmond']));
    assert.equal(t.clubId, 'richmond');
    assert.equal(t.played, 3, 'tres temporadas jugadas en el club');
    assert.equal(t.current, 4, 'está por jugar la cuarta');
});

test('un pase corta la cuenta: cuentan las consecutivas, no las totales', () => {
    // Cinco temporadas en Richmond, se fue, volvió: el ciclo empieza de nuevo.
    const t = clubTenure(withSeasons([
        'richmond', 'richmond', 'richmond', 'richmond', 'richmond',
        'bagneres', 'bagneres',
        'richmond',
    ]));
    assert.equal(t.played, 1, 'volver años después no reanuda el ciclo anterior');
    assert.equal(t.current, 2);
    assert.equal(t.tier, null, 'y por lo tanto no arrastra la distinción vieja');
});

test('recién llegado al club: primera temporada, sin distinción', () => {
    const t = clubTenure(withSeasons(['richmond', 'richmond'], 'bagneres'));
    assert.equal(t.played, 0);
    assert.equal(t.current, 1);
    assert.equal(t.tier, null);
    assert.equal(t.next?.tier.id, 'referente');
    assert.equal(t.next?.seasonsAway, 4);
});

test('carrera sin temporadas jugadas: va la primera', () => {
    const base = createInitialCareer(
        { position: 'prop', nationalityCountryCode: 'nz', startRoute: 'professional' },
        424242,
    );
    const t = clubTenure(base);
    assert.equal(t.played, 0);
    assert.equal(t.current, 1);
    assert.equal(t.clubId, base.player.club);
});

// ── Temporadas, NO decisiones ────────────────────────────────────────────────

test('Exprés y Intensa dan el MISMO contador con la misma cantidad de temporadas', () => {
    // La diferencia entre ritmos es cuántas decisiones se tomaron para llegar
    // acá (una en Exprés, tres en Intensa). El contador no puede notarla.
    const seasons = ['richmond', 'richmond', 'richmond'];
    const intense = clubTenure({ ...withSeasons(seasons), paceMode: 'intense' });
    const express = clubTenure({ ...withSeasons(seasons), paceMode: 'express' });
    assert.equal(express.current, intense.current);
    assert.equal(express.played, 3, 'un solo "Seguir" en Exprés son tres temporadas en el club');
});

// ── Escalera de distinciones ─────────────────────────────────────────────────

test('la distinción entra en la temporada que dice la escalera', () => {
    const [referente, idolo] = TENURE_TIERS;

    const antes = clubTenure(withSeasons(Array(referente.seasons - 2).fill('richmond')));
    assert.equal(antes.tier, null, `en la ${antes.current}ª todavía no`);
    assert.equal(antes.next?.tier.id, referente.id);
    assert.equal(antes.next?.seasonsAway, 1);

    const justo = clubTenure(withSeasons(Array(referente.seasons - 1).fill('richmond')));
    assert.equal(justo.current, referente.seasons);
    assert.equal(justo.tier?.id, referente.id, 'a partir de la quinta, referente');
    assert.equal(justo.next?.tier.id, idolo.id);

    const arriba = clubTenure(withSeasons(Array(idolo.seasons).fill('richmond')));
    assert.equal(arriba.tier?.id, idolo.id);
    assert.equal(arriba.next, null, 'arriba de todo no se promete un escalón que no existe');
});

test('el hint de quedarse dice el progreso, no una abstracción', () => {
    const lejos = stayHint(clubTenure(withSeasons(['richmond', 'richmond', 'richmond'])));
    assert.equal(lejos, 'Tu 4ª temporada en el club. Una más para ser referente.');

    const conChapa = stayHint(clubTenure(withSeasons(Array(6).fill('richmond'))));
    assert.match(conChapa, /^Tu 7ª temporada en el club\./);
    assert.match(conChapa, /para ser ídolo\.$/);

    const techo = stayHint(clubTenure(withSeasons(Array(11).fill('richmond'))));
    assert.equal(techo, 'Tu 12ª temporada en el club. Ya sos ídolo acá.');

    for (const hint of [lejos, conChapa, techo]) {
        assert.ok(!hint.includes('Fidelidad'), 'la virtud abstracta no vuelve');
        assert.ok(!hint.includes('!'), 'crónica deportiva, sin signos de exclamación');
    }
});
