// EL CONTRATO DE LOS SIETE VERBOS.
//
// Acá no se prueba ningún minijuego del catálogo: se prueba que las siete
// MECÁNICAS cumplan lo que los cincuenta y nueve dan por cierto. Es a
// `engine/mechanics/` lo que `moment-contract.test.ts` es al carril de Momentos,
// y existe por lo mismo: lo que se cumple una vez para sesenta y cinco tiene que
// estar verificado una vez, no sesenta y cinco.
//
// Cuatro garantías, y la tercera es la que se ganó a los golpes.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { MechanicCtx, MinigameGrade } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { ALL_GRADES, ALL_MECHANICS } from '../../types/minigame.ts';
import { PLAY_LEVELS } from '../../types/moment-def.ts';
import { MECHANICS, getMechanic } from '../mechanics/index.ts';
import { MINIGAME_SPECS } from '../../data/minigames/index.ts';
import { hashSeed } from '../random.ts';

/** Un parámetro real del catálogo para cada verbo: nada de fixtures inventados. */
function paramsDe(mechanic: string): unknown {
    const spec = MINIGAME_SPECS.find((s) => s.mechanic === mechanic);
    assert.ok(spec, `ningún minijuego usa el verbo '${mechanic}': el test no está midiendo nada`);
    return spec!.params;
}

function ctx(margin: number, seed: number): MechanicCtx {
    return { margin, pressure: 0.5, seed: hashSeed(`mech:${seed}`) };
}

/** Cuánto vale una nota, para poder promediar. De peor a mejor. */
const VALOR: Record<MinigameGrade, number> = { errado: 0, tibio: 1, logrado: 2, clavado: 3 };

/** El promedio de nota de un nivel de juego, sobre muchas semillas. */
function notaMedia(mechanic: string, margin: number, level: PlayLevel, n = 160): number {
    const mech = getMechanic(mechanic as never);
    const params = paramsDe(mechanic);
    let total = 0;

    for (let s = 0; s < n; s += 1) {
        const setup = mech.setup(params as never, ctx(margin, s));
        const input = mech.playAt(setup, level, (s % 40) / 40);
        total += VALOR[mech.grade(setup, input as never)];
    }

    return total / n;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · EL REGISTRY ES CONSISTENTE
// ═══════════════════════════════════════════════════════════════════════════

test('cada verbo está indexado con el id que declara', () => {
    // Es lo que hace honesto el borrado de genéricos del registry: `getMechanic`
    // devuelve por id, y si el objeto declarara otro, la fábrica llamaría a un
    // `setup` con los parámetros de otro verbo.
    for (const mech of MECHANICS) {
        assert.equal(getMechanic(mech.id).id, mech.id, `el verbo '${mech.id}' está indexado en otro lado`);
    }
    assert.equal(MECHANICS.length, ALL_MECHANICS.length, 'la lista de verbos y el registry no coinciden');
});

test('pedir un verbo que no existe TIRA, no devuelve nada', () => {
    // Devolver `null` dejaría llegar el minijuego mudo hasta la pantalla, y ahí
    // traba la carrera en la fase de Momento sin botón para salir.
    assert.throws(() => getMechanic('gambeta' as never), /no existe/);
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · EL SETUP VIAJA AL GUARDADO
// ═══════════════════════════════════════════════════════════════════════════

test('EL SETUP ES JSON PURO: sobrevive al F5', () => {
    // `MinigameSetup.play` viaja adentro de `PendingMoment` hasta el
    // localStorage. Un `Map`, un `Set` o una función se serializan a algo que no
    // vuelve, y la jugada retomada después de recargar se resolvería con otros
    // márgenes — o directamente explotaría adentro del minijuego, a tres
    // archivos de la causa.
    for (const mech of MECHANICS) {
        const setup = mech.setup(paramsDe(mech.id) as never, ctx(0.5, 1));
        const ida = JSON.stringify(setup);
        assert.deepEqual(JSON.parse(ida), setup, `el setup de '${mech.id}' no sobrevive al guardado`);
    }
});

test('la misma semilla da el mismo setup', () => {
    for (const mech of MECHANICS) {
        const a = mech.setup(paramsDe(mech.id) as never, ctx(0.5, 7));
        const b = mech.setup(paramsDe(mech.id) as never, ctx(0.5, 7));
        assert.deepEqual(a, b, `'${mech.id}' sortea distinto con la misma semilla`);
    }
});

test('la misma mano da la misma nota', () => {
    // `grade` es pura y sin contexto: es lo que hace que una jugada resuelta
    // antes y después de recargar dé lo mismo.
    for (const mech of MECHANICS) {
        const setup = mech.setup(paramsDe(mech.id) as never, ctx(0.6, 3));
        const mano = mech.playAt(setup, 'regular', 0.33);
        assert.equal(
            mech.grade(setup, mano as never),
            mech.grade(setup, mano as never),
            `'${mech.id}' clasifica distinto la misma mano`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL MARGEN TRANSPORTA — la que se ganó a los golpes
// ═══════════════════════════════════════════════════════════════════════════

test('EL ATRIBUTO SIRVE: más margen es mejor nota, en los siete verbos', () => {
    // ── POR QUÉ ESTE TEST EXISTE ────────────────────────────────────────────
    // Porque `sosten` pasó la revisión entera SIN TRANSPORTAR NADA. Sorteaba el
    // empujón del rival como `deriva * banda`, que se lee perfectamente
    // razonable —"el rival empuja en proporción a lo cómodo que estás"— y hace
    // que el minijuego sea invariante de escala: dividí todo por `banda` y queda
    // el mismo proceso para cualquier valor. O sea, el margen no hacía nada y el
    // atributo del puesto tampoco. Un pilar de 20 de empuje y uno de 90 jugaban
    // exactamente el mismo scrum.
    //
    // No lo agarró ninguna lectura del código —hacía lo que decía— y lo agarró
    // el contrato de refilón, por un empate entre dos niveles de juego. Este
    // test lo pregunta de frente, que es lo que había que hacer desde el
    // principio: es el §2 del CLAUDE de captain hecho assert —«antes de proponer
    // una palanca, verificar que el motor tenga un canal»— aplicado a los siete.
    //
    // Se mide PROMEDIANDO LOS TRES NIVELES y no con uno solo, y no es por
    // cubrir más: es que cada verbo tiene su propio nivel donde el margen se
    // nota. En los de barra el margen mueve al jugador del medio; en `lectura`
    // mueve al que ya elige bien —de `logrado` a `clavado`, que es la
    // diferencia entre decidir bien y decidir antes—. Fijando un nivel, el test
    // contestaría "¿el margen transporta PARA ESTE JUGADOR?" y no la que
    // interesa, que es si transporta.
    //
    // Y se ACUMULAN los siete en vez de cortar en el primero. Un `assert` adentro
    // del bucle contesta "el primer verbo roto es X" cuando la pregunta es
    // "cuáles están rotos": la primera vez que este test se puso en rojo tapó
    // tres verbos más con el mismo bicho, y esa media respuesta cuesta un ciclo
    // de arreglar-correr-descubrir-otro.
    const rotos: string[] = [];

    for (const mech of MECHANICS) {
        const flojo = PLAY_LEVELS.reduce((a, n) => a + notaMedia(mech.id, 0.15, n), 0) / PLAY_LEVELS.length;
        const bueno = PLAY_LEVELS.reduce((a, n) => a + notaMedia(mech.id, 0.9, n), 0) / PLAY_LEVELS.length;

        if (bueno <= flojo + 0.1) {
            rotos.push(`${mech.id} (flojo=${flojo.toFixed(2)} bueno=${bueno.toFixed(2)})`);
        }
    }

    assert.deepEqual(
        rotos,
        [],
        `el margen no transporta en: ${rotos.join(', ')}. `
        + 'El atributo del puesto no está haciendo nada en esos verbos.',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · EL NIVEL ORDENA
// ═══════════════════════════════════════════════════════════════════════════

test('JUGAR BIEN PAGA MÁS QUE JUGAR REGULAR, Y REGULAR MÁS QUE MAL', () => {
    // El contrato de Momentos ya lo verifica sobre las defs armadas; acá se
    // verifica sobre el verbo desnudo. No es duplicado: allá puede taparlo la
    // tabla de pagos —dos notas distintas que cobran parecido— y acá se mide la
    // nota, que es donde el orden tiene que existir de verdad.
    for (const mech of MECHANICS) {
        const notas = PLAY_LEVELS.map((nivel) => notaMedia(mech.id, 0.5, nivel));
        const [bien, regular, mal] = notas;

        assert.ok(bien > regular, `'${mech.id}': jugar bien no paga más que regular (${bien.toFixed(2)} vs ${regular.toFixed(2)})`);
        assert.ok(regular > mal, `'${mech.id}': jugar regular no paga más que mal (${regular.toFixed(2)} vs ${mal.toFixed(2)})`);
    }
});

test('las cuatro notas son ALCANZABLES en los siete verbos', () => {
    // Una nota que no sale nunca es una rama de la tabla de pagos que nadie
    // cobra y una línea de crónica que nadie lee — escrita, revisada y muerta.
    // Y al revés: si un verbo solo puede dar `clavado` o `errado`, la escala de
    // cuatro está mintiendo sobre él.
    for (const mech of MECHANICS) {
        const vistas = new Set<MinigameGrade>();

        for (const margin of [0.1, 0.35, 0.6, 0.9]) {
            for (const nivel of PLAY_LEVELS) {
                for (let s = 0; s < 60; s += 1) {
                    const setup = mech.setup(paramsDe(mech.id) as never, ctx(margin, s));
                    const input = mech.playAt(setup, nivel, (s % 20) / 20);
                    vistas.add(mech.grade(setup, input as never));
                }
            }
        }

        for (const grade of ALL_GRADES) {
            assert.ok(vistas.has(grade), `'${mech.id}': la nota '${grade}' no sale nunca`);
        }
    }
});
