import test from 'node:test';
import assert from 'node:assert/strict';

import { checkPassword, PASSWORD_MIN_LENGTH } from './passwordPolicy.ts';

/**
 * Antes de esto el único chequeo era `password.length < 6`, duplicado a mano en
 * el registro y en el cambio de contraseña. Estos tests fijan el criterio y,
 * sobre todo, cuidan los dos bordes que se rompen solos: que el detector de
 * secuencias no rechace contraseñas buenas, y que el de repeticiones no se
 * coma una doble letra normal del castellano.
 */

const motivos = (password: string, email?: string) =>
    checkPassword(password, { email }).problems.join(' | ');

test('rechaza lo que prueba primero cualquier diccionario', () => {
    for (const password of ['123456', 'password', 'qwerty', 'admin', 'boca']) {
        assert.equal(checkPassword(password).ok, false, `deberia rechazar ${password}`);
    }
});

test('una contraseña común no pasa aunque llegue al largo mínimo', () => {
    // 'contrasena' tiene exactamente 10: el largo solo no alcanza.
    assert.equal('contrasena'.length, PASSWORD_MIN_LENGTH);
    assert.match(motivos('contrasena'), /mas usadas/);
});

test('rechaza secuencias y repeticiones', () => {
    assert.match(motivos('abcdefghijkl'), /secuencia/);
    assert.match(motivos('zyxwvutsrqpo'), /secuencia/, 'la secuencia descendente cuenta igual');
    assert.match(motivos('malaaaaclave'), /cuatro veces/);
});

test('no confunde una doble letra normal con una repetición', () => {
    // 'carretera' y 'pollito' tienen dobles: si el detector se pasa de celoso,
    // rechaza media lengua castellana.
    const check = checkPassword('carreteraPollito');
    assert.equal(check.ok, true, motivos('carreteraPollito'));
});

test('no marca secuencia en una frase normal', () => {
    for (const password of ['trenAzulEnLaVia', 'mateAmargoDomingo', 'ventanaRotaMarzo']) {
        assert.equal(checkPassword(password).ok, true, `${password}: ${motivos(password)}`);
    }
});

test('la contraseña no puede contener el propio email', () => {
    assert.match(motivos('juanperez-2026-ok', 'juanperez@gmail.com'), /tu email/);

    // Sin acentos ni separadores: 'Juan.Perez' y 'juanperez' son lo mismo para
    // quien esté adivinando.
    assert.match(motivos('Juan.Perez.segura', 'juanperez@gmail.com'), /tu email/);
});

test('un email con parte local muy corta no bloquea nada', () => {
    // Con 'ab@x.com', exigir que la contraseña no contenga 'ab' rechazaría
    // cualquier cosa que tenga esas dos letras seguidas.
    assert.equal(checkPassword('trabajoDeNoche', { email: 'ab@x.com' }).ok, true);
});

test('rechaza espacios al principio o al final', () => {
    assert.match(motivos(' trenAzulEnLaVia'), /espacio/);
    assert.match(motivos('trenAzulEnLaVia '), /espacio/);
});

test('el largo mínimo es el borde exacto', () => {
    const justo = 'trenAzulXY';
    assert.equal(justo.length, PASSWORD_MIN_LENGTH);
    assert.equal(checkPassword(justo).ok, true, motivos(justo));

    const corta = justo.slice(0, -1);
    assert.match(motivos(corta), new RegExp(`${PASSWORD_MIN_LENGTH} caracteres`));
});

test('la barra sube con el largo y baja con las secuencias', () => {
    assert.equal(checkPassword('').strength, 0);
    assert.ok(
        checkPassword('trenAzulEnLaViaDelSur9').strength > checkPassword('trenAzulXY').strength,
        'una contraseña más larga tiene que puntuar más alto',
    );
    assert.ok(
        checkPassword('abcdefghijklmnop').strength < checkPassword('trenAzulEnLaVia').strength,
        'una secuencia obvia tiene que puntuar menos que una frase del mismo orden de largo',
    );
});

test('la barra es indicativa: no decide si se acepta', () => {
    // Una contraseña puede ser válida y todavía mejorable. Los dos campos son
    // independientes a propósito.
    const check = checkPassword('trenAzulXY');
    assert.equal(check.ok, true);
    assert.ok(check.strength < 4, 'no deberia dar el puntaje maximo por llegar al minimo');
});
