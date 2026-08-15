// DÓNDE EMPIEZA UN PIBE DE 18 — y la promesa de que hay UNA sola respuesta.
//
// Desde que el registro deja elegir el club, la pregunta «¿dónde se puede
// empezar?» la hacen dos lugares: el sorteo (`startingClub`) y la pantalla, que
// dibuja `startingClubPool`. Este archivo existe para que sigan siendo la misma
// respuesta.
//
// No es una precaución teórica: es exactamente la forma de §1.9 del CLAUDE.md de
// captain —una lista derivada, congelada en otro lado—. Si mañana el sorteo suma
// un nivel, o excluye a los clubes de una división, la pantalla no se enteraría y
// seguiría ofreciendo la lista vieja. Nada fallaría; el jugador simplemente
// podría elegir un club donde el juego dice que no se empieza.

import test from 'node:test';
import assert from 'node:assert/strict';

import { startingClub, startingClubPool, isProfessionalClub } from '../clubs.ts';
import { createRng } from '../random.ts';
import { CLUBS, getClub } from '../../data/catalogs.ts';

/** Los países que TIENEN clubes en el catálogo, en orden estable. */
const CON_CLUBES = [...new Set(CLUBS.map((c) => c.countryCode))].sort();

/**
 * Una unión sin un solo club cargado. Son la mayoría de las nacionalidades que
 * se ofrecen —el catálogo cubre treinta países— y por eso el caso no es un
 * borde: es el más común.
 */
const SIN_CLUBES = 'na';

test('EL SORTEO NUNCA SE VA DE LA LISTA QUE VE EL JUGADOR', () => {
    for (const cc of CON_CLUBES) {
        const pool = new Set(startingClubPool(cc).map((c) => c.id));
        assert.ok(pool.size > 0, `${cc} tiene clubes en el catálogo pero el pool salió vacío`);

        for (let seed = 1; seed <= 60; seed++) {
            const salio = startingClub(cc, createRng(seed * 7919 + cc.length));
            assert.ok(
                salio !== null && pool.has(salio),
                `en ${cc} el sorteo dio ${salio}, que no está en la lista que ofrece el registro`,
            );
        }
    }
});

test('SIN CLUBES EN EL CATÁLOGO, LA CARRERA ARRANCA SIN CLUB Y EL REGISTRO NO PREGUNTA', () => {
    // Las dos mitades de la misma decisión: el motor devuelve `null` y la
    // pantalla se queda sin paso que mostrar. Una sin la otra sería una pantalla
    // con una lista vacía o un paso que no se puede contestar.
    assert.equal(startingClubPool(SIN_CLUBES).length, 0);
    assert.equal(startingClub(SIN_CLUBES, createRng(1)), null);
});

test('NADIE DEBUTA EN EL TOP 14: LA LISTA ES LA DE ABAJO', () => {
    // La excepción declarada es el país cuyo catálogo entero está por encima de
    // los escalones de abajo —Rusia son ocho clubes profesionales—: ahí empezar
    // en los que hay es la única salida honesta, y el pool cae al país completo.
    for (const cc of CON_CLUBES) {
        const pool = startingClubPool(cc);
        const profesionales = pool.filter(isProfessionalClub);
        if (profesionales.length === 0) continue;

        const todosDelPais = CLUBS.filter((c) => c.countryCode === cc);
        assert.equal(
            pool.length,
            todosDelPais.length,
            `${cc} ofrece clubes profesionales (${profesionales.map((c) => c.name).join(', ')}) sin ser el caso del país que no tiene otra cosa`,
        );
        assert.ok(
            todosDelPais.every(isProfessionalClub),
            `${cc} tiene clubes de los escalones de abajo y aun así ofrece profesionales`,
        );
    }
});

test('LA LISTA NO DEPENDE DEL ORDEN DE INSERCIÓN DEL CATÁLOGO', () => {
    // El pool sale de un `filter` sobre un array construido al cargar el módulo:
    // sin el orden estable, la misma semilla daría clubes distintos según cómo
    // se hubiera armado el catálogo ese día (CLAUDE.md §1 de la raíz).
    const ids = startingClubPool('ar').map((c) => c.id);
    assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
    // Y son clubes de verdad, no ids sueltos.
    for (const id of ids.slice(0, 20)) assert.equal(getClub(id).id, id);
});
