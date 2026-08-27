import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newsIdFromSegment, newsPath, newsSegment, newsSlug } from './newsUrl';

const ID = '81a1647c-c6d4-4f2d-ad1e-1e0e96ff9b7f';

test('el titular entra en la URL sin acentos ni signos', () => {
    assert.equal(
        newsSlug('Las Leonas están en la final: enfrentarán a Países Bajos'),
        'las-leonas-estan-en-la-final-enfrentaran-a-paises-bajos',
    );
    assert.equal(newsSlug('Richie Mo’unga volvió con los All Blacks'), 'richie-mo-unga-volvio-con-los-all-blacks');
    assert.equal(newsSlug('DOBLE GRITO ALMA ARGENTINA'), 'doble-grito-alma-argentina');
});

test('la ñ no se pierde ni deja un hueco', () => {
    assert.equal(newsSlug('Un año de Los Pumas en España'), 'un-ano-de-los-pumas-en-espana');
});

test('un titular largo se corta en la última palabra entera', () => {
    const slug = newsSlug('La legión argentina vuelve a ser protagonista en Francia: 47 jugadores en el Top 14');
    assert.ok(slug.length <= 60, `midió ${slug.length}`);
    assert.equal(slug, 'la-legion-argentina-vuelve-a-ser-protagonista-en-francia-47');
    // Cortar no puede dejar un guión colgando ni una palabra partida al medio.
    assert.ok(!slug.endsWith('-'));
});

test('un titular sin letras deja la URL con el id pelado', () => {
    assert.equal(newsSlug('¡!¿?  ***'), '');
    assert.equal(newsSegment({ id: ID, title: '¡!¿?' }), ID);
    assert.equal(newsPath({ id: ID, title: null }), `/noticias/${ID}`);
});

test('la URL canónica lleva el titular adelante y el id atrás', () => {
    assert.equal(
        newsPath({ id: ID, title: 'Los Pumas repiten el XV ante Australia' }),
        `/noticias/los-pumas-repiten-el-xv-ante-australia-${ID}`,
    );
});

test('el id se recupera de las dos formas de URL', () => {
    assert.equal(newsIdFromSegment(`los-pumas-repiten-el-xv-ante-australia-${ID}`), ID);
    assert.equal(newsIdFromSegment(ID), ID);
    assert.equal(newsIdFromSegment(ID.toUpperCase()), ID);
});

test('una nota con id propio (no UUID) sigue resolviendo por su tramo', () => {
    assert.equal(newsIdFromSegment('nota-de-la-casa'), 'nota-de-la-casa');
    // Y su URL canónica es ese id pelado, así que no entra en un bucle de redirecciones.
    assert.equal(newsIdFromSegment(newsSegment({ id: 'nota-de-la-casa', title: null })), 'nota-de-la-casa');
});

test('ir y volver: de la nota a la URL y de la URL a la nota', () => {
    for (const title of ['Las Leonas están en la final', '¡!¿?', 'Un año en España', null]) {
        assert.equal(newsIdFromSegment(newsSegment({ id: ID, title })), ID);
    }
});
