// La bandera de una selección, y sobre todo: DE QUIÉN NO ES.
//
// La bandera es del seleccionado MAYOR. "Argentina" la lleva; "Argentina XV",
// "Argentina 7s" y "Argentina M20" no, porque son equipos distintos —otra
// categoría, otra rama, otro plantel— y cada uno tiene su propia identidad.
// La primera versión de esto plegaba los sufijos y le ponía la misma bandera a
// las once fichas que empiezan con "Argentina": se veía prolijo y era falso.
//
// Por eso la mitad de este archivo son casos NEGATIVOS. La coincidencia exacta
// es la regla, y esto es lo que la mantiene exacta.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getNationalTeamFlag, resolveTeamLogo } from './teamLogoOverrides.ts';

test('un país lleva su bandera, lo escriba quien lo escriba', () => {
    assert.equal(getNationalTeamFlag('Argentina'), '/logos/selecciones/argentina.png');
    assert.equal(getNationalTeamFlag('New Zealand'), '/logos/selecciones/new-zealand.png');
    assert.equal(getNationalTeamFlag('United States'), '/logos/selecciones/united-states.png');
    // El proveedor escribe en inglés; la plataforma, en español. Las dos entran.
    assert.equal(getNationalTeamFlag('Sudáfrica'), '/logos/selecciones/south-africa.png');
    assert.equal(getNationalTeamFlag('Japón'), '/logos/selecciones/japan.png');
    assert.equal(getNationalTeamFlag('Gales'), getNationalTeamFlag('Wales'));
    // Taiwán compite con otro nombre y es el mismo país.
    assert.equal(getNationalTeamFlag('Chinese Taipei'), '/logos/selecciones/taiwan.png');
    // El nombre viene con mayúsculas y espacios de más según la fuente.
    assert.equal(getNationalTeamFlag('  ARGENTINA '), '/logos/selecciones/argentina.png');
});

test('las ramas de una selección NO se quedan con la bandera del mayor', () => {
    for (const rama of [
        'Argentina XV', 'Argentina 7s', 'Argentina 7s W', 'Argentina W', 'Argentina A',
        'Argentina M20', 'Argentina U21', 'Argentina M18 (1)', 'Argentina FISU',
        'England XV', 'Wales W', 'Scotland W', 'South Africa 7s', 'New Zealand XV',
    ]) {
        assert.equal(getNationalTeamFlag(rama), null, `${rama} no debería llevar bandera`);
    }
});

test('un club que empieza con el nombre de un país tampoco', () => {
    assert.equal(getNationalTeamFlag('New Zealand Warriors'), null);
    assert.equal(getNationalTeamFlag('Croatia Dakovo'), null);
    assert.equal(getNationalTeamFlag('South Africa Gazelles'), null);
});

test('un club común no toca nada', () => {
    assert.equal(getNationalTeamFlag('Belgrano Athletic'), null);
    assert.equal(getNationalTeamFlag('Newman'), null);
    assert.equal(getNationalTeamFlag(''), null);
    assert.equal(getNationalTeamFlag(null), null);
    assert.equal(getNationalTeamFlag(undefined), null);
});

test('la bandera le gana al escudo que manda el proveedor', () => {
    // El caso que originó todo esto: el proveedor mandaba dos letras sobre un
    // círculo gris, o una bandera distinta según el id que hubiera tocado.
    const conEscudoFeo = resolveTeamLogo({
        team_id: 'AckdjmQu',
        name: 'Argentina',
        logo_url: 'https://static.flashscore.com/res/image/data/loquesea.png',
    });
    assert.equal(conEscudoFeo, '/logos/selecciones/argentina.png');
});

test('cada bandera del mapa existe en disco', () => {
    // Un slug mal escrito no rompe nada: deja un hueco gris en producción. Acá sí
    // rompe.
    const paises = [
        'Argentina', 'Australia', 'Belgium', 'Brazil', 'Canada', 'Chile', 'China',
        'Croatia', 'Czechia', 'Denmark', 'England', 'Fiji', 'France', 'Georgia',
        'Germany', 'Guam', 'Hong Kong', 'India', 'Ireland', 'Italy', 'Japan', 'Laos',
        'Lithuania', 'Malaysia', 'Netherlands', 'New Zealand', 'Peru', 'Philippines',
        'Poland', 'Portugal', 'Romania', 'Samoa', 'Scotland', 'Singapore',
        'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland',
        'Taiwan', 'Thailand', 'Tonga', 'Turkey', 'Ukraine', 'United States', 'Uruguay',
        'Vietnam', 'Wales', 'Zimbabwe',
    ];

    for (const pais of paises) {
        const ruta = getNationalTeamFlag(pais);
        assert.ok(ruta, `${pais} no tiene bandera en el mapa`);
        const enDisco = path.join(process.cwd(), 'public', ruta!.replace(/^\//, ''));
        assert.ok(fs.existsSync(enDisco), `falta el archivo ${ruta} (${pais})`);
    }
});
