// LA FORMA DEL CATÁLOGO DE MINIJUEGOS.
//
// Acá no se prueba ningún minijuego: se prueba que el ROSTER esté completo y que
// los sesenta y cinco tengan la forma que la fábrica da por cierta. Es el
// equivalente de `events-shape.test.ts` para el otro catálogo del juego, y
// existe por lo mismo: un catálogo grande se rompe de a un objeto por vez y en
// silencio.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { LecturaParams, MemoriaParams, PuntoParams, SecuenciaParams } from '../../types/minigame.ts';
import { ALL_GRADES, ALL_MECHANICS, isLegacySlot } from '../../types/minigame.ts';
import { ATTRIBUTE_KEYS, familyOfNumber } from '../positions.ts';
import { ALL_MOMENT_KINDS } from '../../types/moment-kinds.ts';
import { ALL_MINIGAMES, ALL_SHIRTS, MINIGAME_SPECS, PER_SHIRT, minigamesOfShirt, universalMinigames } from './index.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  EL ROSTER
// ═══════════════════════════════════════════════════════════════════════════

test('EL ROSTER ESTÁ COMPLETO: cuatro por dorsal y cinco para cualquiera', () => {
    // Es la afirmación central del catálogo y la que más barato se rompe: un
    // dorsal con tres jugadas repite una de cada cuatro temporadas, y eso se
    // nota en la segunda carrera aunque no falle nada.
    for (const shirt of ALL_SHIRTS) {
        assert.equal(
            minigamesOfShirt(shirt).length,
            PER_SHIRT,
            `al dorsal ${shirt} le faltan o le sobran minijuegos`,
        );
    }

    assert.equal(universalMinigames().length, 5, 'los universales dejaron de ser cinco');
    assert.equal(ALL_MINIGAMES.length, ALL_SHIRTS.length * PER_SHIRT + 5, 'el roster no da sesenta y cinco');
});

test('cada casilla tiene id propio y con el prefijo de su dorsal', () => {
    const vistos = new Set<string>();

    for (const slot of ALL_MINIGAMES) {
        assert.ok(!vistos.has(slot.kind), `id repetido: ${slot.kind}`);
        vistos.add(slot.kind);

        // El prefijo no es estética: es lo que hace que un id suelto en un
        // guardado o en una crónica se pueda ubicar sin abrir el catálogo.
        const esperado = slot.shirt === null ? 'uni-' : `d${slot.shirt}-`;
        assert.ok(
            slot.kind.startsWith(esperado),
            `${slot.kind} tendría que empezar con "${esperado}"`,
        );

        assert.ok(/^[a-z0-9-]+$/.test(slot.kind), `${slot.kind} no es kebab-case`);
    }
});

test('los dorsales van del 1 al 15 y cada uno cae en una familia', () => {
    for (const slot of ALL_MINIGAMES) {
        if (slot.shirt === null) continue;
        assert.ok(slot.shirt >= 1 && slot.shirt <= 15, `dorsal fuera de rango: ${slot.shirt}`);
        // `familyOfNumber` tira si el dorsal no cae en ninguna familia. Que no
        // tire es la mitad de este assert.
        assert.ok(familyOfNumber(slot.shirt), `el dorsal ${slot.shirt} no tiene familia`);
    }
});

test('las casillas ya escritas apuntan a un Momento que existe', () => {
    // Seis de las sesenta y cinco las ocupa un Momento escrito a mano. Si el id
    // al que apuntan se renombra, el sorteo devolvería un kind sin def ni
    // pantalla y la carrera quedaría trabada en la fase de Momento.
    for (const slot of ALL_MINIGAMES) {
        if (!isLegacySlot(slot)) continue;
        assert.ok(
            (ALL_MOMENT_KINDS as readonly string[]).includes(slot.legacyOf),
            `${slot.kind} apunta a '${slot.legacyOf}', que no es un Momento escrito a mano`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LA FORMA DE UN SPEC
// ═══════════════════════════════════════════════════════════════════════════

test('cada spec declara un verbo que existe y un atributo que existe', () => {
    for (const spec of MINIGAME_SPECS) {
        assert.ok(ALL_MECHANICS.includes(spec.mechanic), `${spec.kind}: verbo desconocido '${spec.mechanic}'`);
        assert.ok(ATTRIBUTE_KEYS.includes(spec.attr), `${spec.kind}: atributo desconocido '${spec.attr}'`);
        assert.ok(spec.weight > 0, `${spec.kind}: peso cero o negativo, nunca se sortearía`);
    }
});

test('cada spec tiene una línea por nota, y ninguna vacía', () => {
    // `copy.outcome` y `copy.result` terminan en `MomentRecord` y por lo tanto en
    // el digest congelado. Una nota sin texto sería una temporada con la línea
    // en blanco, que es de las cosas que nadie mira hasta que le pasa.
    for (const spec of MINIGAME_SPECS) {
        for (const grade of ALL_GRADES) {
            assert.ok(spec.copy.outcome[grade]?.trim(), `${spec.kind}: falta el desenlace de '${grade}'`);
            assert.ok(spec.copy.result[grade]?.trim(), `${spec.kind}: falta el resultado de '${grade}'`);
        }
        assert.ok(spec.copy.title.trim(), `${spec.kind}: sin título`);
        assert.ok(spec.copy.brief.trim(), `${spec.kind}: sin brief`);
        assert.ok(spec.copy.cta.trim(), `${spec.kind}: sin texto de botón`);
    }
});

test('LA VOZ: crónica deportiva, sin signos de exclamación', () => {
    // CLAUDE.md §4. Es la regla de voz más fácil de romper en un catálogo grande
    // —un "¡Try!" se escribe solo— y la única que se puede verificar a máquina.
    for (const spec of MINIGAME_SPECS) {
        const textos = [
            spec.copy.title,
            spec.copy.brief,
            spec.copy.cta,
            ...ALL_GRADES.map((g) => spec.copy.outcome[g]),
            ...ALL_GRADES.map((g) => spec.copy.result[g]),
        ];
        for (const t of textos) {
            assert.ok(!t.includes('!') && !t.includes('¡'), `${spec.kind}: signo de exclamación en "${t}"`);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LOS PARÁMETROS DE CADA VERBO
// ═══════════════════════════════════════════════════════════════════════════

test('LECTURA: cada seña apunta a opciones que existen, y la mejor no es la segunda', () => {
    // Si `mejor` apuntara fuera del array, la jugada no tendría respuesta
    // correcta y el jugador no podría clavarla nunca — un minijuego imposible
    // que no falla, solo paga mal para siempre.
    for (const spec of MINIGAME_SPECS) {
        if (spec.mechanic !== 'lectura') continue;
        const params = spec.params as LecturaParams;

        assert.ok(params.opciones.length >= 2, `${spec.kind}: una lectura con menos de dos opciones no es una decisión`);
        assert.ok(params.senas.length >= 2, `${spec.kind}: con una sola seña la respuesta se aprende de memoria`);

        for (const sena of params.senas) {
            assert.ok(
                sena.mejor >= 0 && sena.mejor < params.opciones.length,
                `${spec.kind}: la seña "${sena.label}" apunta a una opción que no existe`,
            );
            if (sena.segunda !== null) {
                assert.ok(
                    sena.segunda >= 0 && sena.segunda < params.opciones.length,
                    `${spec.kind}: la segunda de "${sena.label}" apunta a una opción que no existe`,
                );
                assert.notEqual(
                    sena.segunda,
                    sena.mejor,
                    `${spec.kind}: la segunda de "${sena.label}" es la misma que la mejor`,
                );
            }
        }

        // Con todas las señas apuntando a la misma opción, la seña es decorado:
        // se puede apretar siempre el mismo botón y ganar. Es el modo de fallar
        // más caro de este verbo porque no rompe nada, solo lo vuelve un trámite.
        const mejores = new Set(params.senas.map((s) => s.mejor));
        assert.ok(mejores.size > 1, `${spec.kind}: todas las señas llevan a la misma opción`);
    }
});

test('PUNTO: entre tres y seis lugares', () => {
    for (const spec of MINIGAME_SPECS) {
        if (spec.mechanic !== 'punto') continue;
        const params = spec.params as PuntoParams;
        assert.ok(
            params.lugares.length >= 3 && params.lugares.length <= 6,
            `${spec.kind}: ${params.lugares.length} lugares — con menos de tres es una moneda y con más de seis no se lee`,
        );
        assert.ok(params.segundos >= 0, `${spec.kind}: segundos negativos`);
    }
});

test('SECUENCIA: entre tres y cinco pasos', () => {
    for (const spec of MINIGAME_SPECS) {
        if (spec.mechanic !== 'secuencia') continue;
        const params = spec.params as SecuenciaParams;
        assert.ok(
            params.pasos.length >= 3 && params.pasos.length <= 5,
            `${spec.kind}: ${params.pasos.length} pasos`,
        );
        assert.ok(params.ventanaBase < params.pasoMs, `${spec.kind}: la ventana es más ancha que el paso entero`);
    }
});

test('MEMORIA: el patrón tiene más combinaciones que partidas va a jugar nadie', () => {
    for (const spec of MINIGAME_SPECS) {
        if (spec.mechanic !== 'memoria') continue;
        const params = spec.params as MemoriaParams;
        assert.ok(params.largo >= 3, `${spec.kind}: un patrón de menos de tres no es memoria`);
        assert.ok(params.simbolos.length >= 3, `${spec.kind}: menos de tres símbolos`);
        assert.ok(
            params.simbolos.length ** params.largo >= 64,
            `${spec.kind}: solo ${params.simbolos.length ** params.largo} señas posibles, se aprenden todas`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  EL DISEÑO
// ═══════════════════════════════════════════════════════════════════════════

test('NINGÚN DORSAL JUEGA CUATRO VECES AL MISMO VERBO', () => {
    // Es la afirmación de diseño del catálogo: cuatro minijuegos por número
    // valen la pena si son cuatro cosas distintas. Cuatro ventanas seguidas es
    // la misma barra pintada de cuatro colores, y el jugador lo nota antes que
    // ningún test.
    //
    // Se pide TRES verbos distintos y no cuatro: dos jugadas del mismo verbo con
    // parámetros bien distintos —el empuje y la columna del 3— siguen siendo dos
    // jugadas. Cuatro iguales, no.
    for (const shirt of ALL_SHIRTS) {
        const verbos = new Set(
            minigamesOfShirt(shirt)
                .filter((slot) => !isLegacySlot(slot))
                .map((slot) => (slot as { mechanic: string }).mechanic),
        );
        const escritos = minigamesOfShirt(shirt).filter(isLegacySlot).length;

        assert.ok(
            verbos.size + escritos >= 3,
            `el dorsal ${shirt} juega a ${verbos.size} verbos distintos: se repite demasiado`,
        );
    }
});

test('LOS SIETE VERBOS SE USAN: ninguno quedó escrito para nada', () => {
    // Un verbo sin minijuegos es doscientas líneas de motor y una pantalla que
    // nadie va a ver nunca, y encima con un test verde al lado. Si algún día
    // sobra uno, la respuesta es borrarlo, no dejarlo esperando.
    const usados = new Set(MINIGAME_SPECS.map((s) => s.mechanic));
    for (const verbo of ALL_MECHANICS) {
        assert.ok(usados.has(verbo), `el verbo '${verbo}' no lo usa ningún minijuego`);
    }
});

// ── ¿Y QUÉ VERIFICA QUE LOS SIETE VERBOS TENGAN PANTALLA? ──────────────────
//
// No un test de acá, y a propósito. Un verbo sin pantalla es la única forma que
// queda de dejar un minijuego mudo —y uno mudo traba la carrera en la fase de
// Momento, sin botón para salir— así que la garantía tiene que existir; lo que
// no puede es vivir en esta suite.
//
// El motor tiene que poder correr en un test de Node sin DOM (CLAUDE.md §7), así
// que importar `MomentScreens.tsx` desde acá arrastra React adentro de la suite
// del motor y la rompe entera. Se probó, y falla en el `import`.
//
// La garantía vive donde no cuesta nada: `MomentScreens.tsx` declara un
// `Record<MechanicId, true>` con los siete casos que cubre su `switch`. Agregar
// un verbo sin darle pantalla NO COMPILA, que es más fuerte que un test rojo y
// llega antes.

test('el riesgo de cabeza es raro, y solo donde el rugby lo pone', () => {
    // `headDamage` sube y no baja nunca (12 puntos de 100 por HIA). Un catálogo
    // donde media docena de jugadas lo reparten convierte el protocolo de
    // conmoción en un impuesto, que es exactamente lo que CLAUDE.md §5 prohíbe.
    const conCabeza = MINIGAME_SPECS.filter((s) => s.risk === 'cabeza');
    assert.ok(conCabeza.length > 0, 'ningún minijuego lleva el carril de cabeza: el tackle no puede ser el único');
    assert.ok(
        conCabeza.length <= 4,
        `${conCabeza.length} minijuegos con riesgo de cabeza: se banalizó (${conCabeza.map((s) => s.kind).join(', ')})`,
    );
});
