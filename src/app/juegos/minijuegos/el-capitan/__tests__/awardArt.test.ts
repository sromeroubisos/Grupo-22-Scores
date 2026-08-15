// UN PREMIO SIN MEDALLA NO ROMPE NADA: SÓLO NO SE VE.
//
// Y ese es exactamente el modo de fallo que hace falta cazar acá. El póster del
// retiro dibuja los logros personales con su imagen; si un premio nuevo entra al
// motor y nadie le pone el PNG, la banda lo dibuja con el disco vacío y el
// jugador nunca se entera de que le falta algo. No hay pantalla en rojo, no hay
// excepción, no hay nada.
//
// La tabla de `awardArt.ts` cierra la mitad del agujero en tiempo de compilación
// —es un `Record` completo, así que un id nuevo no compila—. Lo que no puede ver
// el compilador es si el ARCHIVO existe, que es la otra mitad y la que se rompe
// sola: alcanza con renombrar un PNG en `public/premios`.
//
// Es la misma prueba que `premios.test.ts` en Carrera de Rugby, por la misma
// razón y contra la misma carpeta.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { AWARD_LABELS } from '../../../../../features/captain/engine/awards.ts';
import { awardArtFiles, awardArtOf } from '../awardArt.ts';

/** `__tests__` → el-capitan → minijuegos → juegos → app → src → la raíz. */
const PREMIOS = path.resolve(import.meta.dirname, '../../../../../../public/premios');

test('CADA PREMIO TIENE SU MEDALLA, Y LA MEDALLA EXISTE', () => {
    for (const archivo of awardArtFiles()) {
        assert.ok(
            existsSync(path.join(PREMIOS, archivo)),
            `falta public/premios/${archivo}: el póster lo dibujaría con el disco vacío`,
        );
    }
});

test('NINGÚN PREMIO DEL MOTOR SE QUEDA SIN RUTA', () => {
    // `AWARD_LABELS` es la lista de premios que el motor puede otorgar. Se
    // recorre desde ahí y no desde la tabla de imágenes: la pregunta es si algo
    // que el juego entrega puede quedar sin dibujar, no al revés.
    for (const id of Object.keys(AWARD_LABELS) as (keyof typeof AWARD_LABELS)[]) {
        const src = awardArtOf(id);
        assert.match(src, /^\/premios\/[a-z0-9-]+\.png$/, `${id} no resuelve a un PNG de premios`);
        assert.ok(
            existsSync(path.join(PREMIOS, path.basename(src))),
            `${id} apunta a ${src}, que no está en public/premios`,
        );
    }
});
