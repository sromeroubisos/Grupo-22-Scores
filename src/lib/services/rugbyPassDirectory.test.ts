import test from 'node:test';
import assert from 'node:assert/strict';

import {
    countryOfTeam,
    rugbyPassPlayerRows,
    rugbyPassTeamRows,
} from './rugbyPassDirectory.ts';
import type { RugbyPassPlayer, RugbyPassTeamEntry } from './rugbyPassCatalog.ts';

const AHORA = '2026-09-07T00:00:00.000Z';

const TOULOUSE: RugbyPassTeamEntry = {
    id: 'rp-team-toulouse',
    slug: 'toulouse',
    name: 'Toulouse',
    logo: 'https://cdn.rugbypass.com/webp-images/images/team-images/logos/png/501.png.webp',
    // Top 14 (Francia) y Champions Cup (Europa).
    competitionIds: [203, 242],
};

const LEINSTER: RugbyPassTeamEntry = {
    id: 'rp-team-leinster',
    slug: 'leinster',
    name: 'Leinster',
    logo: 'https://cdn.rugbypass.com/webp-images/images/team-images/logos/png/502.png.webp',
    // URC y Champions Cup: las dos se declaran sin pais propio.
    competitionIds: [204, 242],
};

test('el pais de un equipo lo pone la competicion con pais REAL, no la internacional', () => {
    // Toulouse juega el Top 14 (Francia) y la Champions Cup (Europa). Es frances.
    assert.equal(countryOfTeam(TOULOUSE.competitionIds), 'Francia');
});

test('sin ninguna competicion con pais propio queda el que declara el proveedor', () => {
    // No se inventa "Irlanda" a partir del nombre: el dato no lo dice.
    assert.equal(countryOfTeam(LEINSTER.competitionIds), 'Internacional');
});

test('un equipo sin competiciones reconocidas no inventa pais', () => {
    assert.equal(countryOfTeam([]), null);
    assert.equal(countryOfTeam([999999]), null);
});

test('la fila del equipo conserva el id con el que abre su ficha', () => {
    const [fila] = rugbyPassTeamRows([TOULOUSE], AHORA);

    // Es el mismo id con el que el conector guarda los partidos y con el que
    // /clubs/<id> resuelve: si cambia, el buscador ofrece un enlace muerto.
    assert.equal(fila.id, 'rp-team-toulouse');
    assert.equal(fila.source, 'rugbypass');
    assert.equal(fila.sport, 'rugby');
    assert.equal(fila.team_url, 'https://www.rugbypass.com/teams/toulouse/');
    assert.equal(fila.logo_url, TOULOUSE.logo);
    assert.equal(fila.last_fetched_at, AHORA);
});

function jugador(over: Partial<RugbyPassPlayer> = {}): RugbyPassPlayer {
    return {
        id: 'rp-player-antoine-dupont',
        slug: 'antoine-dupont',
        name: 'Antoine Dupont',
        position: 'Scrum Half',
        jerseyNumber: 9,
        teams: [{ name: 'Toulouse', providerId: '4350' }],
        currentSquad: true,
        photo: 'https://cdn.rugbypass.com/webp-images/images/players/1234.png.webp',
        competitionIds: [203, 242],
        ...over,
    };
}

test('la fila del jugador guarda el club vigente, que es el primero de la lista', () => {
    const [fila] = rugbyPassPlayerRows([jugador()], [TOULOUSE, LEINSTER], AHORA);

    assert.equal(fila.id, 'rp-player-antoine-dupont');
    assert.equal(fila.source, 'rugbypass');
    assert.equal(fila.team_name, 'Toulouse');
    assert.equal(fila.team_slug, 'toulouse');
    assert.equal(fila.position, 'Scrum Half');
    assert.equal(fila.current_squad, true);
    assert.deepEqual(fila.competition_ids, [203, 242]);
});

test('un club historico entra por nombre aunque no tenga ficha', () => {
    // "Mie Honda Heat" no esta entre los equipos vigentes del proveedor.
    // Descartarlo borraria de donde viene el jugador; se guarda sin slug.
    const [fila] = rugbyPassPlayerRows(
        [jugador({ teams: [{ name: 'Mie Honda Heat', providerId: null }] })],
        [TOULOUSE],
        AHORA
    );

    assert.equal(fila.team_name, 'Mie Honda Heat');
    assert.equal(fila.team_slug, null);
});

test('el jugador sin foto manda null y no un hueco', () => {
    // El parser ya vacia el comodin del proveedor. La lista dibuja iniciales
    // cuando no hay imagen, asi que un string vacio pintaria un roto.
    const [fila] = rugbyPassPlayerRows([jugador({ photo: '' })], [TOULOUSE], AHORA);
    assert.equal(fila.photo_url, null);
});

test('el que ya no integra un plantel igual entra al indice', () => {
    // No se filtra por `currentSquad`: quien escribe su apellido lo esta
    // buscando a el, y su ficha existe.
    const filas = rugbyPassPlayerRows([jugador({ currentSquad: false })], [TOULOUSE], AHORA);
    assert.equal(filas.length, 1);
    assert.equal(filas[0].current_squad, false);
});
