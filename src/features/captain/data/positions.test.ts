// Invariantes del catálogo de puestos.
//
// Lo que se verifica acá no es la calibración —los pesos y las plantillas van a
// cambiar cuando haya simulación que los mueva— sino la FORMA, que es lo que se
// persiste y lo que el motor da por cierto sin volver a chequear:
//
//   · cuatro atributos distintos por familia, con `liderazgo` en las ocho y
//     `aguante` en ninguna (la media queda bien armada por construcción);
//   · pesos que suman 100, así `ovrFromAttributes` puede promediar sin
//     normalizar;
//   · los quince dorsales cubiertos exactamente una vez, así `familyOfNumber`
//     es total y unívoca y no necesita un caso por defecto que mienta;
//   · una curva de edad coherente, así el chequeo de retiro no se puede quedar
//     colgado ni terminar antes de empezar.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgeCurve } from './positions.ts';
import {
    ALL_FAMILIES,
    ATTRIBUTE_FLOOR,
    ATTRIBUTE_KEYS,
    POSITION_FAMILIES,
    baseAttributes,
    familyOfNumber,
    getFamily,
} from './positions.ts';
// El catálogo se testea contra el motor que lo lee, y no al revés: la tabla de
// acá no significa nada sin las dos tiradas que le corren encima.
import {
    CAREER_HARD_CAP,
    DECLINE_FLOOR,
    DEVELOPMENT_PROFILES,
    LONGEVITY_MAX,
    LONGEVITY_MIN,
    resolveAgeCurve,
} from '../engine/development-profile.ts';

test('son ocho familias y el índice coincide con el orden canónico', () => {
    assert.equal(ALL_FAMILIES.length, 8);
    assert.equal(new Set(ALL_FAMILIES).size, 8, 'hay una familia repetida en ALL_FAMILIES');
    assert.deepEqual([...ALL_FAMILIES].sort(), Object.keys(POSITION_FAMILIES).sort());

    for (const id of ALL_FAMILIES) {
        assert.equal(getFamily(id).id, id, `${id} tiene un id que no coincide con su clave`);
    }
});

test('cada familia tiene cuatro atributos distintos, con liderazgo y sin aguante', () => {
    for (const id of ALL_FAMILIES) {
        const family = getFamily(id);
        assert.equal(family.attributes.length, 4, `${id} no tiene exactamente cuatro atributos`);
        assert.equal(new Set(family.attributes).size, 4, `${id} repite un atributo`);
        assert.ok(family.attributes.includes('liderazgo'), `${id} no cuenta el liderazgo`);
        assert.ok(!family.attributes.includes('aguante'), `${id} mete el aguante en la media`);

        for (const key of family.attributes) {
            assert.ok(ATTRIBUTE_KEYS.includes(key), `${id} declara '${key}', que no es un atributo`);
        }
    }
});

test('los pesos suman 100 y ninguno es cero', () => {
    for (const id of ALL_FAMILIES) {
        const family = getFamily(id);
        assert.equal(family.weights.length, family.attributes.length, `${id} tiene pesos y atributos desparejos`);
        const total = family.weights.reduce((acc, w) => acc + w, 0);
        assert.equal(total, 100, `los pesos de ${id} suman ${total} y tienen que sumar 100`);
        for (const w of family.weights) {
            assert.ok(w > 0, `${id} tiene un peso en ${w}: un atributo que no pesa no es un atributo de la familia`);
        }
    }
});

test('la plantilla base solo declara atributos de la familia o el aguante', () => {
    for (const id of ALL_FAMILIES) {
        const family = getFamily(id);
        const permitidos = new Set<string>([...family.attributes, 'aguante']);
        for (const key of Object.keys(family.base)) {
            assert.ok(permitidos.has(key), `la base de ${id} declara '${key}', que no es suyo`);
            assert.ok(family.base[key]! > 0, `la base de ${id} pone '${key}' en cero o menos`);
        }
        // El aguante no cuenta para la media pero lo tienen todos: es el que
        // decide cuánto aguanta el cuerpo.
        assert.ok(family.base.aguante !== undefined, `${id} no declara aguante`);
    }
});

test('los quince dorsales están cubiertos exactamente una vez', () => {
    const vistos: number[] = [];
    for (const id of ALL_FAMILIES) {
        for (const shirt of getFamily(id).numbers) vistos.push(shirt);
    }

    assert.deepEqual(
        [...vistos].sort((a, b) => a - b),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        'entre las ocho familias tienen que estar los quince dorsales, y cada uno una sola vez',
    );
});

test('familyOfNumber es total sobre 1..15 y falla fuera de rango', () => {
    for (let shirt = 1; shirt <= 15; shirt += 1) {
        const id = familyOfNumber(shirt);
        assert.ok(
            getFamily(id).numbers.includes(shirt),
            `familyOfNumber(${shirt}) devolvió ${id}, que no lleva ese dorsal`,
        );
    }
    assert.throws(() => familyOfNumber(0));
    assert.throws(() => familyOfNumber(16));
});

/**
 * La invariante, en una función, porque la afirman DOS tests: el de la tabla y
 * el de la curva resuelta. Escrita dos veces, la segunda copia se queda vieja el
 * día que se agregue un renglón a la curva (CLAUDE de captain §1.9).
 */
function curvaCoherente(quien: string, curve: AgeCurve): void {
    const { debut, peak, decline, soft, hard } = curve;
    assert.ok(debut < peak[0], `${quien}: el pico no puede empezar antes del debut`);
    assert.ok(peak[0] <= peak[1], `${quien}: el pico está al revés`);
    assert.ok(peak[1] < decline, `${quien}: el declive no puede empezar dentro del pico`);
    assert.ok(decline <= soft, `${quien}: se evalúa el retiro antes de empezar a aflojar`);
    assert.ok(soft < hard, `${quien}: el tope duro no puede estar antes del blando`);
}

test('la curva de edad de cada familia es coherente', () => {
    for (const id of ALL_FAMILIES) curvaCoherente(id, getFamily(id).age);
});

test('LA CARRERA LLEGA A LOS 40 Y NUNCA SE PASA', () => {
    // Las dos mitades de la promesa, y las dos importan. Que se llegue: si
    // ningún puesto tocara el tope, el número sería decorativo. Que no se pase:
    // es lo único que impide que sumar años en la tabla o ensanchar la tirada de
    // longevidad produzca un jugador de 45 sin que nada falle.
    const topes = ALL_FAMILIES.map((id) => getFamily(id).age.hard);
    assert.equal(
        Math.max(...topes),
        CAREER_HARD_CAP,
        'ningún puesto llega al tope del juego: la carrera dejó de durar hasta los 40',
    );

    for (const id of ALL_FAMILIES) {
        for (const developmentProfile of DEVELOPMENT_PROFILES) {
            for (let longevity = LONGEVITY_MIN; longevity <= LONGEVITY_MAX; longevity += 1) {
                const curve = resolveAgeCurve({ family: id, developmentProfile, longevity });
                const quien = `${id}/${developmentProfile}/${longevity >= 0 ? '+' : ''}${longevity}`;

                // La invariante tiene que sobrevivir a CUALQUIER cruce de las dos
                // tiradas, no solo al del medio: es la que garantiza que el
                // chequeo de retiro no se cuelgue ni termine antes de empezar.
                curvaCoherente(quien, curve);
                assert.ok(curve.hard <= CAREER_HARD_CAP, `${quien}: se retira a los ${curve.hard}, pasado el tope del juego`);
            }
        }
    }
});

test('la longevidad ensancha la meseta y estira la carrera, y nadie afloja antes del piso', () => {
    // ── POR QUÉ CAMBIÓ LA PREMISA ───────────────────────────────────────────
    // Este test afirmaba dos cosas: que la longevidad ensancha la meseta —sigue
    // siendo cierto y sigue siendo el diseño— y que NO agrega años de arrastre,
    // porque el bloque del final se corría entero y el veterano longevo pasaba
    // exactamente los mismos años cayéndose, solo que más tarde.
    //
    // La segunda dejó de ser cierta el día que entró `DECLINE_FLOOR`. Con un piso
    // fijo para todos, la longevidad ya no puede correr el principio de la caída
    // —de eso se trata el piso— así que lo que compra son temporadas al final. Es
    // el precio declarado del piso y se afirma como tal en vez de dejarse medir
    // por un assert que ya no describe el motor.
    //
    // Se mide en un wing, que es el puesto donde más se nota porque su declive es
    // el más abrupto de los ocho.
    const corto = resolveAgeCurve({ family: 'wing-fullback', developmentProfile: 'normal', longevity: LONGEVITY_MIN });
    const largo = resolveAgeCurve({ family: 'wing-fullback', developmentProfile: 'normal', longevity: LONGEVITY_MAX });

    const meseta = (c: AgeCurve): number => c.peak[1] - c.peak[0];
    assert.ok(
        meseta(largo) > meseta(corto),
        `la meseta no se ensanchó: corto ${meseta(corto)} años contra largo ${meseta(largo)}`,
    );

    // Y lo que la longevidad sigue decidiendo es CUÁNTO TE DURA: el afortunado
    // juega más temporadas. Sin esto, el piso podría haber igualado las dos
    // carreras y la tirada dejaría de significar algo.
    assert.ok(
        largo.hard > corto.hard,
        `la longevidad dejó de estirar la carrera: corto llega a ${corto.hard} y largo a ${largo.hard}`,
    );
});

test('NADIE PIERDE NIVEL ANTES DEL PISO, le toque la curva que le toque', () => {
    // La promesa del piso, barrida entera: los ocho puestos por los tres perfiles
    // por las siete longevidades. Es la única forma de auditarla — el centro con
    // la peor tirada es el que la rompía, y es justo el que un test de un caso
    // típico no mira.
    for (const id of ALL_FAMILIES) {
        for (const developmentProfile of DEVELOPMENT_PROFILES) {
            for (let longevity = LONGEVITY_MIN; longevity <= LONGEVITY_MAX; longevity += 1) {
                const curve = resolveAgeCurve({ family: id, developmentProfile, longevity });
                assert.ok(
                    curve.decline >= DECLINE_FLOOR,
                    `${id}/${developmentProfile}/${longevity}: empieza a caerse a los ${curve.decline}`,
                );
            }
        }
    }
});

test('cada familia declara su métrica-gloria', () => {
    // Es la respuesta al problema del pilar: si la gloria se midiera en tries,
    // la mitad del equipo sería injugable. Cada familia tiene su propio gol.
    const primarias = new Set<string>();
    for (const id of ALL_FAMILIES) {
        const { primary, secondary } = getFamily(id).glory;
        assert.ok(primary.id.length > 0, `${id} no tiene id de métrica-gloria`);
        assert.ok(primary.labelEs.length > 0, `${id} no tiene etiqueta de métrica-gloria`);
        primarias.add(primary.id);
        if (secondary) assert.ok(secondary.labelEs.length > 0, `${id} tiene una secundaria sin etiqueta`);
    }
    assert.equal(primarias.size, 8, 'dos familias comparten la métrica-gloria primaria: entonces no es su gol');
});

test('baseAttributes devuelve las diecinueve claves, con el piso donde no hay plantilla', () => {
    for (const id of ALL_FAMILIES) {
        const attrs = baseAttributes(id);
        assert.deepEqual(Object.keys(attrs).sort(), [...ATTRIBUTE_KEYS].sort());

        const declarados = new Set<string>(Object.keys(getFamily(id).base));
        for (const key of ATTRIBUTE_KEYS) {
            if (declarados.has(key)) continue;
            assert.equal(attrs[key], ATTRIBUTE_FLOOR, `${id}: '${key}' tendría que quedar en el piso`);
        }
    }
});
