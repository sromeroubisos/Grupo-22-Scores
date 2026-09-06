import test from 'node:test';
import assert from 'node:assert/strict';

import { BANDAS, TINTA, ratingBand, ratingScaleColor, ratingScaleVars } from './ratingScale.ts';

const ROJO = '#ea5a5f';
const NARANJA = '#ef7d1a';
const AMARILLO = '#f2c31d';
const VERDE = '#2fae52';
const TURQUESA = '#12b0b8';

test('cada entero cae en la banda que le corresponde', () => {
    for (const puntaje of [1, 2, 3]) assert.equal(ratingScaleColor(puntaje), ROJO, `${puntaje}`);
    for (const puntaje of [4, 5]) assert.equal(ratingScaleColor(puntaje), NARANJA, `${puntaje}`);
    assert.equal(ratingScaleColor(6), AMARILLO);
    for (const puntaje of [7, 8, 9]) assert.equal(ratingScaleColor(puntaje), VERDE, `${puntaje}`);
    assert.equal(ratingScaleColor(10), TURQUESA);
});

/**
 * El decimal NO cambia de banda: manda el entero. Es la diferencia entre cinco
 * colores que se leen de un vistazo y noventa y un tonos que no dicen nada.
 */
test('el decimal no cruza de banda', () => {
    assert.equal(ratingScaleColor(6.9), AMARILLO, '6,9 sigue siendo un seis');
    assert.equal(ratingScaleColor(7.0), VERDE);
    assert.equal(ratingScaleColor(3.9), ROJO);
    assert.equal(ratingScaleColor(4.0), NARANJA);
    assert.equal(ratingScaleColor(9.9), VERDE, 'el turquesa es del diez, no del casi diez');
});

test('un puntaje fuera de escala se acota en vez de romper', () => {
    assert.equal(ratingScaleColor(0), ROJO);
    assert.equal(ratingScaleColor(-5), ROJO);
    assert.equal(ratingScaleColor(11), TURQUESA);
    assert.equal(ratingScaleColor(Number.NaN), ROJO);
});

function luminancia(hex: string) {
    const canales = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
    const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string) {
    const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (alto + 0.05) / (bajo + 0.05);
}

/**
 * El invariante que protege la escala de un color mas lindo pero ilegible: el
 * numero se lee sobre CUALQUIER banda. 4,5:1 es AA para texto normal, y el pill
 * son once pixeles en negrita, que no califica como texto grande.
 */
test('el numero se lee sobre las cinco bandas', () => {
    for (const banda of BANDAS) {
        const ratio = contraste(TINTA, banda.color);
        assert.ok(ratio >= 4.5, `${banda.nombre} (${banda.color}) da ${ratio.toFixed(2)}:1`);
    }
});

/** Colores plenos, no lavados: un tinte palido fue justamente lo que se descarto. */
test('las bandas son colores saturados, no pasteles', () => {
    for (const banda of BANDAS) {
        const canales = [0, 2, 4].map((i) => parseInt(banda.color.slice(1 + i, 3 + i), 16));
        const rango = Math.max(...canales) - Math.min(...canales);
        assert.ok(rango >= 80, `${banda.nombre} (${banda.color}) esta lavado: rango ${rango}`);
    }
});

test('las bandas cubren la escala entera sin huecos', () => {
    for (let entero = 1; entero <= 10; entero += 1) {
        assert.ok(ratingBand(entero), `el ${entero} se quedo sin banda`);
    }
    const desdes = BANDAS.map((b) => b.desde);
    assert.deepEqual([...desdes].sort((a, b) => b - a), desdes, 'las bandas tienen que ir de mayor a menor');
});

test('el pill recibe fondo, tinta y borde', () => {
    const vars = ratingScaleVars(8.4);
    assert.equal(vars['--rating-bg'], VERDE);
    assert.equal(vars['--rating-fg'], TINTA);
    assert.ok(vars['--rating-border'].includes(VERDE), 'el borde sale del color de la banda');
});
