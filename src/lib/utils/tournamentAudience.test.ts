import test from 'node:test';
import assert from 'node:assert/strict';

import { AUDIENCE_LABELS, resolveTournamentAudience } from './tournamentAudience.ts';

/**
 * La regla del segmento, escrita como se lee en pantalla.
 *
 * La pestaña no es "Juveniles" a secas: es "Juveniles/Reserva", y adentro entran
 * dos cosas distintas —los menores y los segundos equipos— por dos caminos
 * distintos. Lo que estos casos fijan es el ORDEN en que se miran las pistas,
 * que es donde estaba el agujero: la portada resuelve un partido sólo por el
 * nombre del torneo, sin grado ni categoría a mano.
 */

test('un torneo de menores cae solo en juveniles/reserva, sin cargarlo a mano', () => {
    // El caso de la captura: así llega el nombre desde el feed de partidos.
    assert.equal(
        resolveTournamentAudience({ name: 'URBA: Menores de 15 - Segunda Rueda - Fase Regular' }),
        'juveniles',
    );
    assert.equal(resolveTournamentAudience({ name: 'Menores de 19' }), 'juveniles');
    assert.equal(resolveTournamentAudience({ ageGrade: 'M15' }), 'juveniles');
    assert.equal(resolveTournamentAudience({ ageGrade: 'U20' }), 'juveniles');
});

test('la reserva entra por las tres grafías, venga de donde venga', () => {
    for (const grado of ['Intermedia', 'Preintermedia', 'Pre Intermedia', 'Pre-Intermedia', 'Reserva']) {
        assert.equal(
            resolveTournamentAudience({ subcategory: grado }),
            'juveniles',
            `subcategory ${grado}`,
        );
        assert.equal(
            resolveTournamentAudience({ name: `Top 14 - ${grado}` }),
            'juveniles',
            `nombre ${grado}`,
        );
    }

    // El super admin también puede decirlo como grado de edad.
    assert.equal(resolveTournamentAudience({ ageGrade: 'Reserva' }), 'juveniles');
});

test('la reserva le gana al age_grade, que dice mayores con razón', () => {
    // Son adultos: `age_grade` no miente. Pero el equipo que juega la Intermedia
    // del Top 14 no es el primero del club, y la portada es del primero.
    assert.equal(
        resolveTournamentAudience({ ageGrade: 'mayores', subcategory: 'Intermedia' }),
        'juveniles',
    );
    assert.equal(
        resolveTournamentAudience({ ageGrade: 'Mayores (Adults)', name: 'PRIMERA A - Intermedia' }),
        'juveniles',
    );
});

test('el grado que carga el super admin le gana al nombre', () => {
    // Éste es el "a menos que lo especifique el super admin": el nombre dice
    // menores, el grado dice mayores, y manda el grado.
    assert.equal(
        resolveTournamentAudience({ ageGrade: 'Mayores (Adults)', name: 'Copa Menores de Veteranos' }),
        'mayores',
    );

    // Y al revés: un nombre de mayores marcado como juvenil se va igual.
    assert.equal(
        resolveTournamentAudience({ ageGrade: 'Juveniles', name: 'Primera División' }),
        'juveniles',
    );
    assert.equal(resolveTournamentAudience({ isYouth: true, name: 'Top 14' }), 'juveniles');
});

test('la portada de mayores no se lleva puesto lo que no reconoce', () => {
    // Sin ninguna pista, un torneo sigue entrando en la portada: es lo que
    // permite que el filtro de la home no borre partidos de la API que llegan
    // sin catálogo.
    assert.equal(resolveTournamentAudience({ name: 'Champions Cup' }), 'mayores');
    assert.equal(resolveTournamentAudience({}), 'mayores');

    assert.equal(resolveTournamentAudience({ name: 'Top 14' }), 'mayores');
    assert.equal(resolveTournamentAudience({ name: 'URBA Top 12 - Superior' }), 'mayores');
    assert.equal(resolveTournamentAudience({ ageGrade: 'mayores' }), 'mayores');
});

test('el rótulo de la pestaña nombra las dos cosas que hay adentro', () => {
    assert.equal(AUDIENCE_LABELS.mayores, 'Mayores');
    assert.equal(AUDIENCE_LABELS.juveniles, 'Juveniles/Reserva');
});
