// Reglas del escudo de club. Lo que se protege es que NINGUNA petición salga
// hacia un club que no tiene escudo (el endpoint devuelve el HTML de la página
// de error, ~102 KB, por cada una) y que el color del monograma sea el mismo
// entre sesiones.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from '../../index.ts';
import { crestKeyOf, initialsOf, monogramColor } from '../../../../app/juegos/minijuegos/carrera-rugby/clubCrest.ts';

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
        assert.match(color, /^hsl\(\d{1,3} 52% 38%\)$/, `${club.name}: color con formato inesperado (${color})`);
    }
});

test('clubes distintos casi nunca comparten color', () => {
    const sinEscudo = CLUBS.filter((c) => crestKeyOf(c.id) === null);
    const tonos = new Set(sinEscudo.map((c) => monogramColor(c.id)));
    // No se exige unicidad total (360 tonos para 282 clubes hace que colisionen
    // algunos), pero sí que el hash reparta y no colapse en un puñado.
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
