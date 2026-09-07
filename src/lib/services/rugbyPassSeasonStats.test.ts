import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRugbyPassTeamTable,
    mapRugbyPassPlayerLeaders,
    mapRugbyPassStatsTeams,
    mapRugbyPassTeamH2h,
    mapRugbyPassTeamLeaders,
    normalizeRugbyPassSeasonLabel,
    parseRugbyPassDefaultSeasonLabel,
    parseRugbyPassEmbeddedLeaders,
    parseRugbyPassStatsSeasons,
} from './rugbyPassSeasonStats.ts';

// Los trozos son los de `https://www.rugbypass.com/top-14/stats/` recortados a
// lo que el parser mira. Las URL van con la barra escapada porque asi las emite
// el `json_encode` de PHP, que es justo lo que hace seguro cortar en `</div>`.
const PAGINA = `
<div id="key-stats-app">
  <div id="team-stats-data">[{"title":"Tries","stat":"tries","rows":[
    {"pos":1,"team":{"name":"Bordeaux","logo":"https:\\/\\/cdn\\/202.png","link":"https:\\/\\/rp\\/bordeaux"},"value":10},
    {"pos":2,"team":{"name":"Clermont","logo":"https:\\/\\/cdn\\/205.png","link":"https:\\/\\/rp\\/clermont"},"value":5}]}]</div>
  <div id="player-stats-data">[{"title":"Kicks","player":{"name":"James Hall","value":13,"team":"Bayonne","logo":"https:\\/\\/cdn\\/217.png","photo":"https:\\/\\/cdn\\/hall.png"},
    "rows":[{"pos":2,"name":"Maxime Lucu","value":11,"team":"Bordeaux","logo":"https:\\/\\/cdn\\/202.png","photo":"https:\\/\\/cdn\\/lucu.png"}]}]</div>
</div>
<script> createApp({ data() { return {
  season:"2026/2027", selectedSeason:"2026/2027",
  seasons:[{"season":2027,"label":"2026\\/2027"},{"season":2026,"label":"2025\\/2026"}], selSeason:0
} } }) </script>
`;

test('el rotulo de temporada se traduce al del proyecto', () => {
    assert.equal(normalizeRugbyPassSeasonLabel('2026/2027'), '2026-27');
    assert.equal(normalizeRugbyPassSeasonLabel(' 2025 / 2026 '), '2025-26');
    // El NPC nombra su temporada con un ano solo y queda como esta.
    assert.equal(normalizeRugbyPassSeasonLabel('2026'), '2026');
    assert.equal(normalizeRugbyPassSeasonLabel(''), '');
});

test('las temporadas salen de la lista que publica la pagina, no del rotulo', () => {
    const seasons = parseRugbyPassStatsSeasons(PAGINA);
    assert.deepEqual(seasons, [
        { id: 2027, label: '2026-27' },
        { id: 2026, label: '2025-26' },
    ]);
    // EL NUMERO NO SE DERIVA DEL ROTULO: el NPC llama 2027 a su temporada 2026,
    // asi que emparejar por el ano del rotulo traeria la temporada equivocada.
    assert.notEqual(seasons[0].id, 2026);
});

test('la temporada dibujada se lee para no volver a pedirla', () => {
    assert.equal(parseRugbyPassDefaultSeasonLabel(PAGINA), '2026-27');
    assert.equal(parseRugbyPassDefaultSeasonLabel('<html></html>'), '');
});

test('los podios embebidos se leen sin pedir nada', () => {
    const { teamLeaders, playerLeaders } = parseRugbyPassEmbeddedLeaders(PAGINA);

    assert.equal(teamLeaders.length, 1);
    assert.equal(teamLeaders[0].title, 'Tries');
    assert.deepEqual(
        teamLeaders[0].rows.map((r) => [r.position, r.name, r.value]),
        [[1, 'Bordeaux', 10], [2, 'Clermont', 5]]
    );

    // El puntero viene aparte de `rows` y numerado desde el 2: aca se juntan.
    assert.equal(playerLeaders.length, 1);
    assert.equal(playerLeaders[0].title, 'Patadas');
    assert.deepEqual(
        playerLeaders[0].rows.map((r) => [r.position, r.name, r.team, r.value]),
        [[1, 'James Hall', 'Bayonne', 13], [2, 'Maxime Lucu', 'Bordeaux', 11]]
    );
});

test('una pagina sin bloques de datos no rompe: devuelve listas vacias', () => {
    assert.deepEqual(parseRugbyPassEmbeddedLeaders(''), { teamLeaders: [], playerLeaders: [] });
    assert.deepEqual(parseRugbyPassStatsSeasons(''), []);
    assert.deepEqual(mapRugbyPassTeamLeaders(null), []);
    assert.deepEqual(mapRugbyPassPlayerLeaders('no soy una lista'), []);
});

const H2H = {
    teamStats: [
        {
            title: 'Key Stats',
            items: [
                { key: 'total_tries', name: 'Tries', team0: 147, team1: 94 },
                { key: 'tackles_success', name: 'Tackles Completed', team0: '88%', team1: '84%' },
            ],
        },
        {
            title: 'Attack',
            // `Tries` se repite entre grupos: la columna se queda con la
            // primera aparicion y no se duplica.
            items: [
                { key: 'total_tries', name: 'Tries', team0: 147, team1: 94 },
                { key: 'offloads', name: 'Oflloads', team0: 371, team1: 185 },
            ],
        },
    ],
};

test('el comparador se lee como dos planillas, y el porcentaje NO se pasa a numero', () => {
    const { columns, left, right } = mapRugbyPassTeamH2h(H2H);
    assert.deepEqual(columns.map((c) => c.key), ['total_tries', 'tackles_success', 'offloads']);
    // Los rubros se muestran en castellano y por CLAVE: el proveedor escribe
    // "Oflloads" con la errata, y un mapa por rotulo se caeria si la corrige.
    assert.deepEqual(columns.map((c) => c.label), ['Tries', 'Tackles completados %', 'Descargas']);
    // Veinte columnas no entran con el nombre entero: la cabecera va abreviada.
    assert.deepEqual(columns.map((c) => c.short), ['TRIES', 'TCK%', 'DESC']);
    assert.deepEqual(columns.map((c) => c.group), ['Claves', 'Claves', 'Ataque']);

    assert.equal(left.total_tries, 147);
    assert.equal(right.total_tries, 94);
    // Pasarlo a numero le comeria el signo y "88%" se leeria como 88 tackles.
    assert.equal(left.tackles_success, '88%');
});

test('los clubes del comparador se leen por su oid de Opta', () => {
    const equipos = mapRugbyPassStatsTeams({
        teams: [
            { oid: '2350', rpid: '214', name: 'Toulouse', logo: 'https://cdn/214.png', color: '#eee' },
            { oid: 4850, rpid: '217', name: 'Bayonne', logo: 'https://cdn/217.png', color: '#81bce8' },
            // Sin oid no se puede pedir su planilla: se descarta antes que
            // inventarle uno con el rpid, que devuelve una tabla en blanco.
            { rpid: '999', name: 'Sin oid' },
        ],
    });
    assert.deepEqual(equipos.map((e) => [e.oid, e.name]), [['2350', 'Toulouse'], ['4850', 'Bayonne']]);
});

test('la tabla se arma con las respuestas de a pares', () => {
    const toulouse = { oid: '2350', name: 'Toulouse', logo: '', color: '' };
    const bayonne = { oid: '4850', name: 'Bayonne', logo: '', color: '' };

    const { columns, rows } = buildRugbyPassTeamTable([
        { left: toulouse, right: bayonne, payload: H2H },
    ]);

    assert.equal(columns.length, 3);
    assert.deepEqual(rows.map((r) => r.name), ['Toulouse', 'Bayonne']);
    assert.equal(rows[0].stats.total_tries, 147);
    assert.equal(rows[1].stats.total_tries, 94);
});

test('un plantel impar deja al ultimo comparado consigo mismo y no se duplica', () => {
    const solo = { oid: '2350', name: 'Toulouse', logo: '', color: '' };
    const { rows } = buildRugbyPassTeamTable([{ left: solo, right: solo, payload: H2H }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].stats.total_tries, 147);
});

test('un par que fallo no se lleva la tabla: los demas clubes siguen', () => {
    const toulouse = { oid: '2350', name: 'Toulouse', logo: '', color: '' };
    const bayonne = { oid: '4850', name: 'Bayonne', logo: '', color: '' };
    const pau = { oid: '3450', name: 'Pau', logo: '', color: '' };
    const lyon = { oid: '45', name: 'Lyon', logo: '', color: '' };

    const { rows } = buildRugbyPassTeamTable([
        { left: toulouse, right: bayonne, payload: H2H },
        // El comparador contesta 200 con la lista vacia cuando se le manda el
        // rpid en vez del oid: esos dos clubes quedan afuera, no con ceros.
        { left: pau, right: lyon, payload: { teamStats: [] } },
    ]);
    assert.deepEqual(rows.map((r) => r.name), ['Toulouse', 'Bayonne']);
});
