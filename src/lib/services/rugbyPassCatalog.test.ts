import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mergeRugbyPassPlayers,
    mergeRugbyPassTournaments,
    pageIdToCompetitionId,
    parseRugbyPassPlayerProfile,
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

// ── La ficha individual del jugador ─────────────────────────────────────────

// Recortes de `/players/pablo-matera/` (2026-09-06), acortados. La pagina real
// pesa 366 KB; lo que sigue conserva la forma de cada pieza que se lee.

const FICHA = `<div id="fixed-top-nav" class="top-nav team"> <div class="mid-section"> <div class="title">
    <a href="https://www.rugbypass.com/teams/argentina/" class="team">Argentina</a>
    <span class="player">Pablo Matera</span> </div> </div> </div>
<div class="player-header "> <div class="hero-content parallax2"> <div class="mid-section desktop"> <div class="title">
    <div class="title-inner" id="19761"> <h1> Pablo Matera </h1>
    <span class="player-number"> <img class="top-team-logo lazy" data-src="https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/801.png.webp?maxw=100" alt="Argentina"> </span> </div>
    <div class="head-shot-mobile"> <img width="100" height="100" class="lazy" data-src="https://eu-cdn.rugbypass.com/webp-images/images/players/head/541.png.webp?maxw=300" alt="Pablo Matera"> </div>
</div> </div> </div> </div>
<div class="main-body"> <div class="player-details">
    <div class="detail"> <h3>Nationality</h3> <div> <img class="flag" src="https://eu-cdn.rugbypass.com/images/flags/Argentina.png" alt="Argentina"> </div> </div>
    <div class="detail"> <h3>Age</h3> <div>33</div> </div>
    <div class="detail"> <h3>Position</h3> <div>Back Row</div> </div>
    <div class="detail"> <h3>Height</h3> <div>192cm</div> </div>
    <div class="detail"> <h3>Weight</h3> <div>109kg</div> </div>
</div>
<div class="main-news"> <img class="lazy" data-src="https://eu-cdn.rugbypass.com/webp-images/images/players/head/452.png.webp?maxw=196" alt="Antoine Dupont"> </div>
<div id="app-comp-stats" style="display: none;">[{"competition":{"rid":"109","oid":"214","name":"The Rugby Championship","logo":"https://eu-cdn.rugbypass.com/images/competitions/logos/png/trc.png","logoCircle":"https://eu-cdn.rugbypass.com/images/competitions/logos/circle/trc.png","season":{"label":"2025","games":12},"stats":{"success":1,"stats":{"points":16,"tries":0,"penalty_goals":2}}},"main":{"totalMinsPlayed":354,"main":[{"value":10,"title":"Lineout Takes"},{"value":44,"title":"Carries"},{"value":0.77,"title":"Tackles Completed"}],"profile":[{"value":"67%","title":"Lineout Takes","key":"lineout_takes","raw":10},{"value":"76%","title":"Carries","key":"carries","raw":44},{"value":"77%","title":"Tackles Completed","key":"tackles_success","raw":0.77}]}},{"competition":{"oid":"421","name":"Japan Rugby League One","logoCircle":"https://eu-cdn.rugbypass.com/images/competitions/logos/circle/jrlo.png","season":{"label":"2025/2026"}},"main":{"totalMinsPlayed":80,"main":[{"value":2,"title":"Tries"}],"profile":[{"value":"9%","title":"Tries","key":"tries","raw":2}]}}]</div>
<div id="app-competitions" style="display: none;">[{"title":"Rugby Championship","id":"214","games":[{"title":"Argentina vs South Africa","date":"4 Oct 2025","time":1759593600,"compTitle":"The Rugby Championship","compLogo":"https://eu-cdn.rugbypass.com/images/competitions/logos/circle/trc.png","draw":false,"opposition":{"name":"South Africa","logo":"https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/815.png.webp"},"win":false,"stats":{"mins":57,"tries":0,"yellow_cards":1,"red_cards":0,"conversions":0}},{"title":"Argentina vs Australia","date":"6 Sep 2026","time":1788652800,"compTitle":"International","compLogo":"https://eu-cdn.rugbypass.com/images/competitions/logos/circle/internationals.png","draw":true,"opposition":{"name":"Australia","logo":"https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/802.png.webp"},"win":false,"stats":{"mins":80,"tries":2,"yellow_cards":0,"red_cards":0,"conversions":0}}]},{"title":"Japan Rugby League One","id":"421","games":[{"title":"Mie Honda Heat vs Toshiba","date":"21 Apr 2024","time":1713679800,"compTitle":"Japan Rugby League One","compLogo":"https://eu-cdn.rugbypass.com/images/competitions/logos/circle/jrlo.png","draw":false,"opposition":{"name":"Toshiba Brave Lupus Tokyo","logo":"https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/19702.png.webp"},"win":true,"stats":{"mins":41,"tries":0,"yellow_cards":0,"red_cards":0,"conversions":1}}]}]</div>
<div class="player-teams"> <h2>Pablo Matera Teams</h2> <div class="teams-list"> <div class="mid-section"> <div class="teams">
    <a href="https://www.rugbypass.com/teams/argentina/" role="button" class="width-desc" aria-label="Argentina">
        <img class="logo lazy" data-src="https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/801.png.webp?maxw=72" alt="Argentina">
        <span class="name"> Argentina </span> <span class="view-team"> View Team </span> </a>
    <a href="https://www.rugbypass.com/teams/stade-francais/" role="button" class="width-desc" aria-label="Stade Francais">
        <img class="logo lazy" data-src="https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/212.png.webp?maxw=72" alt="Stade Francais">
        <span class="name"> Stade&nbsp;Français </span> <span class="view-team"> View Team </span> </a>
</div> </div> </div> </div>`;

/** Will Reilly: la pagina dibuja SOLO dos detalles, y no los dos primeros. */
const FICHA_INCOMPLETA = `<div id="fixed-top-nav" class="top-nav team"> <div class="mid-section"> <div class="title">
    <a href="https://www.rugbypass.com/teams/connacht/" class="team">Connacht</a> </div> </div> </div>
<div class="player-header "> <div class="title"> <div class="title-inner" id="1000237245"> <h1> Will Reilly </h1> </div> </div> </div>
<div class="main-body"> <div class="player-details">
    <div class="detail"> <h3>Position</h3> <div>Scrum Half</div> </div>
    <div class="detail"> <h3>Weight</h3> <div>89kg</div> </div>
</div>
<div class="player-teams"> <div class="teams">
    <a href="https://www.rugbypass.com/teams/connacht/" role="button" class="width-desc" aria-label="Connacht">
        <img class="logo lazy" data-src="https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/304.png.webp?maxw=72" alt="Connacht">
        <span class="name"> Connacht </span> </a>
</div> </div>`;

test('la ficha individual trae lo que la lista de jugadores no tiene', () => {
    // `filter-players` da nombre, puesto, foto y clubes. Todo esto —edad,
    // altura, peso, nacionalidad, club actual, estadisticas— solo esta aca, y
    // por eso la ficha se pide a la pagina del jugador y no al catalogo.
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.ok(p);
    assert.equal(p.name, 'Pablo Matera');
    assert.equal(p.pageId, 19761);
    assert.equal(p.nationality, 'Argentina');
    assert.equal(p.nationalityFlag, 'https://eu-cdn.rugbypass.com/images/flags/Argentina.png');
    assert.equal(p.age, 33);
    assert.equal(p.position, 'Back Row');
    assert.equal(p.height, '192cm');
    assert.equal(p.weight, '109kg');
});

test('el club actual sale del encabezado, con su slug y su escudo', () => {
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.deepEqual(p?.currentTeam, {
        name: 'Argentina',
        slug: 'argentina',
        logo: 'https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/801.png.webp',
    });
});

test('la foto es la del jugador y no la del primero que aparezca en la pagina', () => {
    // El carrusel de noticias lleva las caras de OTROS jugadores. Buscando
    // `players/head/<n>.png` suelto, las tres primeras fichas que se probaron
    // devolvian la misma —la 452, la de Dupont— y hasta un jugador sin foto
    // "tenia" la de el. Se busca dentro del encabezado.
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.equal(
        p?.photo,
        'https://eu-cdn.rugbypass.com/webp-images/images/players/head/541.png.webp?maxw=300'
    );
});

test('la trayectoria trae el slug escrito en el link, sin cruzar por nombre', () => {
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.deepEqual(
        p?.teams.map((t) => [t.name, t.slug]),
        [
            ['Argentina', 'argentina'],
            // Los acentos llegan en UTF-8 crudo, y el espacio duro traducido:
            // el proveedor escribe `Stade&nbsp;Français`.
            ['Stade Français', 'stade-francais'],
        ]
    );
});

test('las estadisticas salen del JSON embebido, por competicion y temporada', () => {
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.equal(p?.seasons.length, 2);

    const trc = p!.seasons[0];
    assert.equal(trc.competitionId, 214);
    assert.equal(trc.competitionName, 'The Rugby Championship');
    assert.equal(trc.seasonLabel, '2025');
    assert.equal(trc.minutes, 354);

    // El VALOR sale de `main.main` y la CLAVE de `main.profile`, pareados por
    // titulo: `profile` publica el percentil ("67%"), no el numero.
    assert.deepEqual(trc.stats, [
        { key: 'lineout_takes', title: 'Lineout Takes', value: 10 },
        { key: 'carries', title: 'Carries', value: 44 },
        { key: 'tackles_success', title: 'Tackles Completed', value: 0.77 },
    ]);

    assert.equal(p!.seasons[1].seasonLabel, '2025/2026');
});

test('una ficha que solo publica dos detalles no corre los otros de lugar', () => {
    // Se leen como pares etiqueta -> valor. Por indice, a este jugador el peso
    // le quedaria de altura y nadie lo notaria hasta verlo en pantalla.
    const p = parseRugbyPassPlayerProfile(FICHA_INCOMPLETA, 'will-reilly');
    assert.ok(p);
    assert.equal(p.position, 'Scrum Half');
    assert.equal(p.weight, '89kg');
    assert.equal(p.height, null);
    assert.equal(p.age, null);
    assert.equal(p.nationality, null);
    assert.equal(p.photo, '');
    assert.deepEqual(p.seasons, []);
});

test('sin escudo en el encabezado, el del club actual sale de la trayectoria', () => {
    const p = parseRugbyPassPlayerProfile(FICHA_INCOMPLETA, 'will-reilly');
    assert.equal(
        p?.currentTeam?.logo,
        'https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/304.png.webp'
    );
});

test('un 200 vacio no es un jugador', () => {
    // `danny-grewcock` —retirado— contesta 200 con la pagina ARMADA y sin un
    // solo dato. Sin este corte la ficha se dibujaria con el slug de titulo.
    assert.equal(parseRugbyPassPlayerProfile('<html><body></body></html>', 'danny-grewcock'), null);
    assert.equal(parseRugbyPassPlayerProfile('', 'lo-que-sea'), null);
});

test('un `]` adentro de un nombre no corta el JSON embebido', () => {
    // Balanceando corchetes sin mirar las comillas, el array se cierra en el
    // primer `]` de adentro de una cadena y el JSON queda truncado: no tira
    // error, devuelve cero temporadas y nadie sabe por que.
    const conCorchete = FICHA.replace(
        '"name":"The Rugby Championship"',
        '"name":"The [Rugby] Championship"'
    );
    const p = parseRugbyPassPlayerProfile(conCorchete, 'pablo-matera');
    assert.equal(p?.seasons.length, 2);
    assert.equal(p?.seasons[0].competitionName, 'The [Rugby] Championship');
});

test('los puntos se leen de la temporada, que es donde estan completos', () => {
    // Por partido el proveedor da tries y conversiones y nada mas: sin penales
    // ni drops los puntos no cierran. Medido: Boffelli hizo 67 en el Mundial
    // 2023 y `tries*5 + conversiones*2` da 28. Por eso `points` sale de aca.
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.equal(p?.seasons[0].points, 16);
    // Y una temporada sin la planilla cruda no inventa un cero.
    assert.equal(p?.seasons[1].points, null);
});

test('los partidos salen de todas las competiciones, en una sola linea de tiempo', () => {
    // El proveedor los agrupa por competicion; la pantalla los lee seguidos, del
    // mas nuevo al mas viejo.
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.equal(p?.matches.length, 3);
    assert.deepEqual(
        p?.matches.map((m) => m.opponentName),
        ['Australia', 'South Africa', 'Toshiba Brave Lupus Tokyo']
    );
    assert.equal(p?.matches[0].competitionName, 'International');
});

test('un empate no es una derrota: son DOS banderas, no un marcador', () => {
    // `win: false` con `draw: true` es empate. Mirando solo `win`, los empates
    // se cuentan como derrotas y no lo nota nadie hasta que un hincha suma.
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.deepEqual(p?.matches.map((m) => m.result), ['draw', 'loss', 'win']);
});

test('de cada partido salen los minutos, los tries, las conversiones y las tarjetas', () => {
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    const conAmarilla = p!.matches.find((m) => m.opponentName === 'South Africa');
    assert.equal(conAmarilla?.minutes, 57);
    assert.equal(conAmarilla?.tries, 0);
    assert.equal(conAmarilla?.yellowCards, 1);
    assert.equal(conAmarilla?.redCards, 0);
    assert.equal(p!.matches[0].tries, 2);
    assert.equal(p!.matches[2].conversions, 1);
});

test('una ficha sin bloque de partidos devuelve lista vacia, no revienta', () => {
    const p = parseRugbyPassPlayerProfile(FICHA_INCOMPLETA, 'will-reilly');
    assert.deepEqual(p?.matches, []);
});

test('los puntos de un partido son try por 5 y conversion por 2', () => {
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    // 2 tries, 0 conversiones -> 10
    assert.equal(p?.matches[0].points, 10);
    // 0 tries, 0 conversiones -> 0, y eso es un cero DE VERDAD: el proveedor
    // publico las dos claves y las dos en cero.
    assert.equal(p?.matches[1].points, 0);
    // 0 tries, 1 conversion -> 2
    assert.equal(p?.matches[2].points, 2);
});

test('un jugador que patea a los palos queda marcado', () => {
    // Con `penalty_goals` en alguna temporada, los puntos por partido son SOLO
    // los de try y conversion: Boffelli hizo 67 en el Mundial 2023 y esa cuenta
    // da 28. La pantalla necesita saberlo para no afirmar un total corto.
    const p = parseRugbyPassPlayerProfile(FICHA, 'pablo-matera');
    assert.equal(p?.goalKicker, true);
});

test('sin penales ni drops publicados, el jugador no es pateador', () => {
    const sinPenales = FICHA.replace(',"penalty_goals":2', '');
    assert.equal(parseRugbyPassPlayerProfile(sinPenales, 'x')?.goalKicker, false);
    assert.equal(parseRugbyPassPlayerProfile(FICHA_INCOMPLETA, 'will-reilly')?.goalKicker, false);
});

test('al apertura no se le afirma que la cuenta es su total, aunque no haya dato', () => {
    // Medido sobre los ocho puestos: patean 3 de 3 aperturas y 0 de los otros
    // 21. Un apertura sin penales en las temporadas publicadas todavia no es
    // prueba de que no patee — es prueba de que no hay dato.
    const apertura = FICHA
        .replace(',"penalty_goals":2', '')
        .replace('<h3>Position</h3> <div>Back Row</div>', '<h3>Position</h3> <div>Fly Half</div>');
    const p = parseRugbyPassPlayerProfile(apertura, 'x');
    assert.equal(p?.position, 'Fly Half');
    assert.equal(p?.goalKicker, true);
});

test('el puesto es un piso, no un reemplazo: el wing que patea igual se marca', () => {
    // Boffelli es Outside Back y lleva 29 penales. Una regla que mirara SOLO el
    // puesto lo daria por no pateador y le mostraria un total corto como si
    // fuera el bueno.
    const wing = FICHA.replace('<h3>Position</h3> <div>Back Row</div>', '<h3>Position</h3> <div>Outside Back</div>');
    const p = parseRugbyPassPlayerProfile(wing, 'x');
    assert.equal(p?.position, 'Outside Back');
    assert.equal(p?.goalKicker, true);
});
