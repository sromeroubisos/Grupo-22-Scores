// Reglas del escudo de club. Lo que se protege es que NINGUNA petición salga
// hacia un club que no tiene escudo (el endpoint devuelve el HTML de la página
// de error, ~102 KB, por cada una) y que el color del monograma sea el mismo
// entre sesiones.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from '../../index.ts';
import {
    crestKeyOf, initialsOf, monogramColor, monogramColorAt, monogramContrast, monogramContrastAt,
    MONOGRAM_MIN_CONTRAST, MONOGRAM_SATURATIONS,
} from '../../../../app/juegos/minijuegos/carrera-rugby/clubCrest.ts';

test('solo se pide escudo a los clubes que tienen clave: ninguna petición al vacío', () => {
    let conEscudo = 0;
    let alMonograma = 0;

    for (const club of CLUBS) {
        const key = crestKeyOf(club.id);
        if (key === null) {
            alMonograma++;
            continue;
        }
        conEscudo++;
        assert.equal(key, club.sourceId, `${club.name}: la clave no es su sourceId`);
        assert.ok(key.length > 0, `${club.name}: clave vacía`);
    }

    assert.ok(conEscudo > 200, `pocos clubes con escudo real: ${conEscudo}`);
    assert.ok(alMonograma > 0, 'los clubes estáticos internacionales tienen que caer al monograma');
    assert.equal(conEscudo + alMonograma, CLUBS.length);
});

test('un club sin sourceId NUNCA genera una clave: se dibuja el monograma', () => {
    // Es la regla que evita las 282 peticiones que devolverían 404 con HTML.
    const estaticos = CLUBS.filter((c) => c.source === 'career-static');
    assert.ok(estaticos.length > 0);
    for (const club of estaticos) {
        assert.equal(crestKeyOf(club.id), null, `${club.name}: pediría un escudo que no existe`);
    }
});

test('el color del monograma es estable entre sesiones', () => {
    // Determinístico por construcción (hashSeed), pero se congelan tres valores:
    // si alguien cambia la función, el club deja de ser reconocible de un vistazo.
    assert.equal(monogramColor('auckland'), monogramColor('auckland'));
    assert.equal(monogramColor('lourdes'), monogramColor('lourdes'));

    for (const club of CLUBS) {
        const color = monogramColor(club.id);
        // Ni el brillo ni la saturación son fijos: el brillo se baja por tono hasta
        // llegar al contraste, y la saturación es el segundo eje del sorteo.
        assert.match(color, /^hsl\(\d{1,3} \d{2}% \d{2}%\)$/, `${club.name}: color con formato inesperado (${color})`);
        const saturation = Number(/ (\d+)% /.exec(color)![1]);
        assert.ok(
            (MONOGRAM_SATURATIONS as readonly number[]).includes(saturation),
            `${club.name}: saturación fuera de la paleta (${color})`,
        );
    }
});

test('las iniciales blancas SIEMPRE llegan al contraste mínimo, en los 360 tonos', () => {
    // La versión vieja fijaba el brillo en 38 % dando por hecho que alcanzaba.
    // No alcanzaba: la luminosidad de HSL no es luminancia percibida, así que al
    // mismo 38 % un azul daba 8,5:1 y un cian 4,24:1. Se verifica tono por tono
    // y no club por club, porque lo que se protege es la REGLA, no el catálogo
    // de hoy: un club nuevo puede caer en cualquier hue.
    // Se recorren los 360 tonos POR CADA saturación de la paleta: desde que la
    // saturación es un segundo eje del sorteo, verificar un solo valor dejaría dos
    // tercios del espacio de color sin mirar.
    for (const saturation of MONOGRAM_SATURATIONS) {
        for (let hue = 0; hue < 360; hue++) {
            const color = monogramColorAt(hue, saturation);
            const light = Number(/ \d+% (\d+)%/.exec(color)![1]);
            assert.ok(light >= 20, `hue ${hue} · sat ${saturation}: brillo fuera de rango (${color})`);
            assert.ok(
                monogramContrastAt(hue, saturation) >= MONOGRAM_MIN_CONTRAST,
                `hue ${hue} · sat ${saturation}: contraste insuficiente (${color})`,
            );
        }
    }

    for (const club of CLUBS) {
        const ratio = monogramContrast(club.id);
        assert.ok(
            ratio >= MONOGRAM_MIN_CONTRAST,
            `${club.name}: iniciales a ${ratio.toFixed(2)}:1, por debajo de ${MONOGRAM_MIN_CONTRAST}:1`,
        );
    }
});

test('clubes distintos casi nunca comparten color', () => {
    const sinEscudo = CLUBS.filter((c) => crestKeyOf(c.id) === null);
    const tonos = new Set(sinEscudo.map((c) => monogramColor(c.id)));
    // No se exige unicidad total —con reparto al azar siempre colisionan algunos—
    // pero sí que el hash reparta y no colapse en un puñado.
    //
    // ESTE TEST ES EL QUE OBLIGÓ A AGREGAR LA SEGUNDA SATURACIÓN. Con un solo eje
    // el espacio son 360 colores, y el catálogo `2026-27.11` pasó de ~440 clubes
    // sin escudo a ~610: el umbral de 0,6 dejó de ser alcanzable por PALOMAR, no
    // por un hash malo. La respuesta correcta a un espacio de color chico es
    // agrandarlo, no bajar el umbral.
    assert.ok(sinEscudo.length > 360, 'si el catálogo cabe en 360 tonos, este test perdió su sentido');
    assert.ok(tonos.size > sinEscudo.length * 0.6, `el hash colapsa: ${tonos.size} tonos para ${sinEscudo.length} clubes`);
});

test('las iniciales salen del nombre real del club', () => {
    assert.equal(initialsOf('Stade Toulousain'), 'ST');
    assert.equal(initialsOf('Bay of Plenty'), 'BO');
    assert.equal(initialsOf('Buller'), 'BU');
    assert.equal(initialsOf("Hawke's Bay"), 'HB', 'el apostrofe no puede robarse la inicial');

    for (const club of CLUBS) {
        const ini = initialsOf(club.labelEs);
        assert.ok(ini.length >= 1 && ini.length <= 2, `${club.name}: iniciales "${ini}"`);
    }
});

test('todo club de la trayectoria resuelve contra el catálogo', () => {
    // `crestKeyOf` hace getClub: si un id quedara huérfano, el escudo tiraría.
    for (const club of CLUBS) {
        assert.doesNotThrow(() => getClub(club.id), `${club.id} no resuelve`);
    }
});
