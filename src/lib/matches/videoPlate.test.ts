import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    contrastInk,
    mixHexColors,
    normalizeHexColor,
    plateCaption,
    plateHeadline,
    plateMarkSource,
    plateScoreText,
    plateTone,
} from './videoPlate';

test('colores: normaliza cortos y mayusculas, y descarta lo que no es hex', () => {
    assert.equal(normalizeHexColor('#AABBCC'), '#aabbcc');
    assert.equal(normalizeHexColor('abc'), '#aabbcc');
    assert.equal(normalizeHexColor(' #123456 '), '#123456');
    assert.equal(normalizeHexColor('rojo'), null);
    assert.equal(normalizeHexColor(null), null);
});

test('mezcla y tinta: calcan el export', () => {
    assert.equal(mixHexColors('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(mixHexColors('#000000', '#ffffff', 2), '#ffffff', 'el peso se acota a 1');
    assert.equal(mixHexColors('x', '#ffffff', 0.5), 'x', 'sin hex valido devuelve el primero');
    assert.equal(contrastInk('#050b1f'), '#ffffff');
    assert.equal(contrastInk('#f8fafc'), '#0f172a');
});

test('tono: sin colores de torneo sale el navy de la casa; con ellos, el color pleno', () => {
    const casa = plateTone({});
    assert.equal(casa.field, mixHexColors('#050b1f', '#1f4dff', 0.58));
    assert.equal(casa.isDark, true);
    assert.equal(casa.ink, '#ffffff');
    assert.equal(casa.accent, '#1f4dff');
    assert.notEqual(casa.fieldEnd, casa.field, 'la otra punta del degradado es el campo hundido');

    const torneo = plateTone({ fieldColor: '#1d6d92', accentColor: '#ffd200' });
    assert.equal(torneo.field, '#1d6d92');
    assert.equal(torneo.accent, '#ffd200');

    const claro = plateTone({ fieldColor: '#f1f5f9' });
    assert.equal(claro.isDark, false);
    assert.equal(claro.ink, '#0f172a');
});

test('la marca del medio va por deporte', () => {
    assert.equal(plateMarkSource('rugby'), '/marcas/salida-de-22.png');
    assert.equal(plateMarkSource('rugby-union'), '/marcas/salida-de-22.png');
    assert.equal(plateMarkSource('field-hockey'), '/marcas/corner-corto.png');
    assert.equal(plateMarkSource('football'), '/marcas/grupo-22-tv.png');
    assert.equal(plateMarkSource(null), '/marcas/grupo-22-tv.png');
});

test('titular: ETAPA - TORNEO en mayusculas; si el torneo ya trae la etapa, manda', () => {
    assert.equal(plateHeadline({ roundLabel: 'Fecha 19', tournamentName: 'Top 14 de la URBA' }).text, 'FECHA 19 - TOP 14 DE LA URBA');
    assert.equal(plateHeadline({ roundLabel: 'Fecha 19', tournamentName: 'Final - TRL M19' }).text, 'FINAL - TRL M19');
    assert.equal(plateHeadline({ roundLabel: null, tournamentName: '  Top   14 ' }).text, 'TOP 14');
    assert.equal(plateHeadline({ roundLabel: null, tournamentName: null }).text, '');
});

test('marcador y titulo de la placa', () => {
    assert.equal(plateScoreText({ home: 33, away: 15 }), '33-15');
    assert.equal(plateScoreText(null), 'VS');
    assert.deepEqual(plateCaption({ title: 'Try de Boffelli', kindLabel: 'Clip' }), { title: 'Try de Boffelli', kind: 'Clip' });
    assert.deepEqual(plateCaption({ title: '  ', kindLabel: 'Highlights' }), { title: 'Highlights', kind: null });
    assert.deepEqual(plateCaption({ title: 'highlights', kindLabel: 'Highlights' }), { title: 'highlights', kind: null }, 'el titulo que repite el tipo no lleva etiqueta');
});
