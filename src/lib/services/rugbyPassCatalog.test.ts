import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mergeRugbyPassPlayers,
    mergeRugbyPassTournaments,
    pageIdToCompetitionId,
    parseRugbyPassPlayers,
    parseRugbyPassStandings,
    parseRugbyPassTeams,
    parseRugbyPassTournamentCards,
    parseRugbyPassTournamentIds,
    resolvePlayerTeamSlugs,
    rugbyPassPlayerId,
} from './rugbyPassCatalog.ts';

// ── Torneos: los dos ids ────────────────────────────────────────────────────

const CATALOGO = `var app = { tournaments: [
    {"title":"International","uri":"internationals","id":"107","oid":"3","fixtures":true,"hasData":1},
    {"title":"Hilux NPC","uri":"bunnings-npc","id":"105","oid":"208","fixtures":true,"hasData":1},
    {"title":"WXV Global Series","uri":"wxv","id":"144","oid":"144","fixtures":true,"hasData":1}
], other: [1,2] };`;

const GRILLA = `<div class="tournaments-list">
    <a href="https://www.rugbypass.com/internationals/" style="background-color: #ffffff;color:#e61e00">
        <span> <img src="webp-images/images/competitions/logos/app/internationals.png.webp?maxw=100"> </span>
        <span> International </span> </a>
    <a href="https://www.rugbypass.com/the-rugby-championship/" style="background-color: #0d0d0d;color:#edff00">
        <span> <img src="webp-images/images/competitions/logos/app/trc.png.webp?maxw=100"> </span>
        <span> The Rugby Championship </span> </a>
</div>`;

test('el catalogo de ids se lee balanceando corchetes, no con un regex', () => {
    // El array vive adentro de un bundle de JavaScript: cualquier expresion se
    // corta en el primer `]` anidado y devuelve basura o nada.
    const ids = parseRugbyPassTournamentIds(CATALOGO);
    assert.equal(ids.length, 3);
    assert.equal(ids[0].uri, 'internationals');
});

test('id y oid NO son lo mismo y se guardan por separado', () => {
    // "International" es id=107 / oid=3. Confundirlos no falla enseguida: falla
    // solo en los torneos donde difieren, que son 18 de los 32.
    const torneos = mergeRugbyPassTournaments(parseRugbyPassTournamentIds(CATALOGO), []);
    const t = torneos.find((x) => x.slug === 'internationals')!;
    assert.equal(t.pageId, 107, 'el id de la pagina');
    assert.equal(t.competitionId, 3, 'el oid de la competicion');
    assert.equal(t.id, 'rp-comp-3', 'el id del proyecto se arma con el OID');
});

test('un torneo con pagina pero sin competicion queda con competitionId null', () => {
    // The Rugby Championship tiene pagina y NO esta en el catalogo de ids: sus
    // partidos llegan por "Internationals". Asumir que siempre hay oid rompe
    // justo el torneo mas importante del hemisferio sur.
    const torneos = mergeRugbyPassTournaments(
        parseRugbyPassTournamentIds(CATALOGO),
        parseRugbyPassTournamentCards(GRILLA)
    );
    const trc = torneos.find((t) => t.slug === 'the-rugby-championship')!;
    assert.equal(trc.competitionId, null);
    assert.equal(trc.id, null);
    assert.equal(trc.name, 'The Rugby Championship');
});

test('la grilla aporta logo y colores sin pisar los ids', () => {
    const torneos = mergeRugbyPassTournaments(
        parseRugbyPassTournamentIds(CATALOGO),
        parseRugbyPassTournamentCards(GRILLA)
    );
    const inter = torneos.find((t) => t.slug === 'internationals')!;
    assert.equal(inter.competitionId, 3, 'el oid sobrevive al merge');
    assert.equal(inter.colors?.background, '#ffffff');
    assert.ok(inter.logo.startsWith('https://eu-cdn.rugbypass.com/'));
});

test('la union no pierde lo que sale en una sola de las dos fuentes', () => {
    const torneos = mergeRugbyPassTournaments(
        parseRugbyPassTournamentIds(CATALOGO),
        parseRugbyPassTournamentCards(GRILLA)
    );
    // 3 del catalogo de ids + 1 que solo esta en la grilla.
    assert.equal(torneos.length, 4);
});

// ── Equipos: el duplicado y el data-comps ───────────────────────────────────

function filaEquipo(slug: string, nombre: string, comps: string, escudo: string) {
    return `<a href="https://www.rugbypass.com/teams/${slug}/" class="roster-row brd team-row" data-name="${nombre}" data-comps="${comps}">
        <span class="image"><img src="https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/${escudo}.png.webp?maxw=42" alt="${nombre}"></span>
        <span class="name"><span class="no-wrap">${nombre}</span></span>
    </a>`;
}

test('la pagina publica la lista dos veces y no entra repetida', () => {
    // Son dos bloques `list-players`, una copia por breakpoint: sin plegar, las
    // 598 filas de /teams/ se leen como 598 equipos cuando son 299.
    const html = filaEquipo('auckland', 'Auckland', '', '501')
        + filaEquipo('waikato', 'Waikato', '', '513')
        + filaEquipo('auckland', 'Auckland', '', '501')
        + filaEquipo('waikato', 'Waikato', '', '513');

    const equipos = parseRugbyPassTeams(html);
    assert.equal(equipos.length, 2);
    assert.deepEqual(equipos.map((e) => e.slug), ['auckland', 'waikato']);
});

test('el data-comps viene en ids de PAGINA y se traduce a oid', () => {
    const mapa = pageIdToCompetitionId(mergeRugbyPassTournaments(parseRugbyPassTournamentIds(CATALOGO), []));
    // 107 es la PAGINA de Internationals; su competicion es la 3.
    const [equipo] = parseRugbyPassTeams(filaEquipo('argentina', 'Argentina', '107,105', '801'), mapa);
    assert.deepEqual(equipo.competitionIds, [3, 208]);
});

test('un id de pagina desconocido se descarta en vez de pasar como oid', () => {
    // Un numero del espacio equivocado ensucia mas que un dato faltante: dejaria
    // al equipo listado en una competicion que no jugo.
    const mapa = pageIdToCompetitionId(mergeRugbyPassTournaments(parseRugbyPassTournamentIds(CATALOGO), []));
    const [equipo] = parseRugbyPassTeams(filaEquipo('argentina', 'Argentina', '109,107', '801'), mapa);
    assert.deepEqual(equipo.competitionIds, [3], '109 no esta en el catalogo');
});

test('el id del equipo es el MISMO con el que se guardan los partidos', () => {
    const [equipo] = parseRugbyPassTeams(filaEquipo('auckland', 'Auckland', '', '501'));
    assert.equal(equipo.id, 'rp-team-auckland');
});

// ── Jugadores: pid no es el id ──────────────────────────────────────────────

const TANDA_A = {
    players: [
        {
            n: 'Pablo Matera', l: 'players/pablo-matera/', p: 'Back Row', pid: '6',
            t: 'Argentina, Jaguares', ti: ['800', '19650'], sqd: true, i: 'images/players/head/541.png',
        },
        {
            n: 'Ignacio Ruiz', l: 'players/ignacio-ruiz/', p: 'Hooker', pid: '2',
            t: 'Argentina', ti: ['800'], sqd: true, i: 'images/common/player.png',
        },
    ],
};

test('pid es el numero de camiseta, NO el id del jugador', () => {
    // Medido: 2453 jugadores comparten 16 valores de pid (0 a 15). Plegar por
    // pid dejaria 16 filas en vez de 2453.
    const [matera, ruiz] = parseRugbyPassPlayers(TANDA_A, 3);
    assert.equal(matera.jerseyNumber, 6);
    assert.equal(ruiz.jerseyNumber, 2);
    assert.equal(matera.id, 'rp-player-pablo-matera', 'la identidad es el slug');
    assert.notEqual(matera.id, ruiz.id);
});

test('la foto generica no se guarda como si fuera una foto', () => {
    const [matera, ruiz] = parseRugbyPassPlayers(TANDA_A, 3);
    assert.ok(matera.photo.includes('head/541.png'));
    assert.equal(ruiz.photo, '', 'images/common/player.png es el comodin');
});

test('el mismo jugador en dos torneos entra UNA vez, con sus dos competiciones', () => {
    // Sin plegar, Matera entraria dos veces: sale en Internationals y en el
    // Top 14. Y ninguna tanda sola sabe que jugo las dos.
    const tandaTop14 = parseRugbyPassPlayers(
        {
            players: [{
                n: 'Pablo Matera', l: 'players/pablo-matera/', p: 'Back Row', pid: '6',
                t: 'Argentina', ti: ['800'], sqd: true, i: '',
            }],
        },
        203
    );
    const unidos = mergeRugbyPassPlayers([parseRugbyPassPlayers(TANDA_A, 3), tandaTop14]);
    const matera = unidos.find((p) => p.slug === 'pablo-matera')!;
    assert.equal(unidos.filter((p) => p.slug === 'pablo-matera').length, 1);
    assert.deepEqual(matera.competitionIds, [3, 203]);
});

test('al plegar se completa lo que una tanda trae vacio', () => {
    // Una tanda filtrada por torneo a veces publica menos campos que la general:
    // perder la foto por el orden de las llamadas seria depender de nada.
    const sinDatos = parseRugbyPassPlayers(
        { players: [{ n: 'X', l: 'players/x/', p: '', pid: '0', t: '', ti: [], sqd: false, i: '' }] },
        1
    );
    const conDatos = parseRugbyPassPlayers(
        {
            players: [{
                n: 'X', l: 'players/x/', p: 'Lock', pid: '4',
                t: 'Y', ti: ['9'], sqd: true, i: 'images/players/head/1.png',
            }],
        },
        2
    );
    const [x] = mergeRugbyPassPlayers([sinDatos, conDatos]);
    assert.ok(x.photo.includes('head/1.png'));
    assert.equal(x.position, 'Lock');
    assert.equal(x.jerseyNumber, 4);
    assert.equal(x.currentSquad, true);
    assert.deepEqual(x.competitionIds, [1, 2]);
});

test('ti con mas ids que nombres no corre el pareo', () => {
    // Tres jugadores traen dos ids y un solo nombre: el segundo es un registro
    // interno sin nombre publicado. El sobrante se ignora.
    const [j] = parseRugbyPassPlayers({
        players: [{
            n: 'Cody Nhanala', l: 'players/cody-nhanala/', p: 'Lock', pid: '4',
            t: 'Canada', ti: ['953', '10105295'], sqd: true, i: '',
        }],
    });
    assert.equal(j.teams.length, 1);
    assert.deepEqual(j.teams[0], { name: 'Canada', providerId: '953' });
});

test('un club historico no se descarta por no estar en el catalogo vigente', () => {
    const jugadores = parseRugbyPassPlayers(TANDA_A, 3);
    const equipos = parseRugbyPassTeams(filaEquipo('argentina', 'Argentina', '', '801'));
    const [matera] = resolvePlayerTeamSlugs(jugadores, equipos);
    assert.deepEqual(matera.teams, [
        { name: 'Argentina', slug: 'argentina' },
        { name: 'Jaguares', slug: null },
    ]);
});

test('rugbyPassPlayerId lleva su propio prefijo', () => {
    assert.equal(rugbyPassPlayerId('pablo-matera'), 'rp-player-pablo-matera');
});

// ── Tabla de posiciones ─────────────────────────────────────────────────────

const TABLA = `<div class="standard">
    <div class="standings-titles">
        <div></div><div class="mb">P</div><div class="mb">W</div><div class="mb">L</div><div class="mb">D</div>
        <div class="dt">PF</div><div class="dt">PA</div><div class="dt">PD</div>
        <div class="dt">BP T</div><div class="dt">BP-7</div><div class="dt">BP</div><div>Total</div>
    </div>
    <div class="team-standing">
        <div> 1 </div>
        <div class="logo"><img src="webp-images/images/team-images/logos/png/503.png.webp" alt="Canterbury"></div>
        <div class="name"><div> Canterbury </div></div>
        <div class="mb"> 10 </div><div class="mb"> 8 </div><div class="mb"> 1 </div><div class="mb"> 1 </div>
        <div class="dt"> 326 </div><div class="dt"> 168 </div><div class="dt"> 158 </div>
        <div class="dt"> 7 </div><div class="dt"> 1 </div><div class="dt"> 8 </div><div> 42 </div>
    </div>
</div>`;

test('la tabla trae las once columnas del rugby, con los dos bonus separados', () => {
    const [fila] = parseRugbyPassStandings(TABLA);
    assert.equal(fila.teamName, 'Canterbury');
    assert.equal(fila.position, 1);
    assert.equal(fila.played, 10);
    assert.equal(fila.won, 8);
    assert.equal(fila.drawn, 1);
    assert.equal(fila.lost, 1);
    assert.equal(fila.pointsFor, 326);
    assert.equal(fila.pointsAgainst, 168);
    assert.equal(fila.pointsDiff, 158);
    assert.equal(fila.tryBonus, 7, 'bonus ofensivo, por tries');
    assert.equal(fila.losingBonus, 1, 'bonus defensivo, por perder por 7 o menos');
    assert.equal(fila.bonusPoints, 8);
    assert.equal(fila.points, 42);
});

test('los puntos de la tabla cierran con la formula del rugby', () => {
    // La verificacion que confirma que las columnas no estan corridas: cuatro
    // igualdades que solo dan si cada valor cayo en su lugar.
    const [fila] = parseRugbyPassStandings(TABLA);
    assert.equal(fila.won * 4 + fila.drawn * 2 + fila.bonusPoints, fila.points);
    assert.equal(fila.tryBonus + fila.losingBonus, fila.bonusPoints);
    assert.equal(fila.pointsFor - fila.pointsAgainst, fila.pointsDiff);
    assert.equal(fila.won + fila.drawn + fila.lost, fila.played);
});

test('si RugbyPass corre una columna, el valor queda en cero y no miente', () => {
    // Leer por indice fijo haria que los puntos de un equipo pasaran a leerse
    // como su diferencia, sin ningun error. Emparejar por rotulo falla ruidoso.
    const sinBonus = TABLA
        .replace('<div class="dt">BP T</div>', '')
        .replace('<div class="dt"> 7 </div>', '');
    const [fila] = parseRugbyPassStandings(sinBonus);
    assert.equal(fila.points, 42, 'el total sigue siendo el total');
    assert.equal(fila.tryBonus, 0, 'la columna que ya no esta queda en cero');
});

test('un torneo sin tabla devuelve vacio y eso NO es un error', () => {
    // "Internationals" es un cajon de test matches, no una liga: contesta
    // "No live data for Internationals".
    const vacia = '<div class="standard"><div class="no-standings">No live data for Internationals</div></div>';
    assert.deepEqual(parseRugbyPassStandings(vacia), []);
    assert.deepEqual(parseRugbyPassStandings(''), []);
});
