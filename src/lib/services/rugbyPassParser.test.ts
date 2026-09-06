import test from 'node:test';
import assert from 'node:assert/strict';

import {
    RUGBYPASS_COMPETITIONS,
    RUGBYPASS_EXCLUDED,
    classifyRugbyPassStatus,
    decodeRugbyPassEntities,
    isKickoffUnknown,
    isRugbyPassCompetitionEnabled,
    isRugbyPassMatchId,
    mapRugbyPassEventType,
    parseRugbyPassEvents,
    parseRugbyPassFeed,
    parseRugbyPassGame,
    parseRugbyPassLineup,
    parseRugbyPassPlayerStatRanking,
    RUGBYPASS_PLAYER_STAT_KINDS,
    parseRugbyPassAllStats,
    parseRugbyPassStatsSummary,
    parseRugbyPassPoll,
    rugbyPassMatchId,
    rugbyPassTeamId,
    rugbyPassDefaultSeason,
    rugbyPassSeasonOf,
    rugbyPassSeasonsIn,
    unwrapRugbyPassBody,
} from './rugbyPassParser.ts';

// Recortes con la forma real del feed (2026-09-06), acortados.

/** Hilux NPC, hora real conocida. `s: 2` y `sts: 'Result'` = terminado. */
const NPC_TERMINADO = {
    id: 946625,
    gmt: '2025-07-31T07:10:00+0000',
    k: '20250731',
    st: 'FT',
    t: '4:10am',
    v: 'Eden Park',
    h: { n: 'Auckland', s: 35, u: 'auckland', l: 'webp-images/images/team-images/logos/png/501.png.webp?v=1&amp;maxw=70' },
    a: { n: 'Waikato', s: 36, u: 'waikato', l: 'webp-images/images/team-images/logos/png/513.png.webp?v=1&amp;maxw=70' },
    c: 208,
    r: 'Round 1',
    s: 2,
    sts: 'Result',
    l: 'https://www.rugbypass.com/live/auckland-vs-waikato/?g=946625',
};

/** Top 14 futuro SIN hora confirmada: medianoche UTC exacta. */
const TOP14_SIN_HORA = {
    id: 952476,
    gmt: '2027-01-09T00:00:00+0000',
    v: 'Stade Marcel-Deflandre',
    h: { n: 'Stade Rochelais', s: 0, u: 'stade-rochelais', l: 'webp-images/x.png' },
    a: { n: 'Toulouse', s: 0, u: 'toulouse', l: 'webp-images/y.png' },
    c: 203,
    r: 'Round 15',
    s: 0,
    sts: 'Fixture',
    l: 'https://www.rugbypass.com/live/stade-rochelais-vs-toulouse/?g=952476',
};

/**
 * Americas Rugby Championship: la forma exacta del dato abandonado. Ya se jugo
 * (Argentina XV gano 58-11) pero llega 0-0, rotulado FT y con `sts: 'Fixture'`.
 */
const ARC_ABANDONADO = {
    id: 951836,
    gmt: '2026-08-29T00:00:00+0000',
    st: 'FT',
    v: 'Estadio CAP',
    h: { n: 'Argentina XV', s: 0, u: 'argentina-xv', l: 'webp-images/z.png' },
    a: { n: 'Paraguay', s: 0, u: 'paraguay', l: 'webp-images/w.png' },
    c: 266,
    r: 'Round 1',
    s: 0,
    sts: 'Fixture',
    l: 'https://www.rugbypass.com/live/argentina-xv-vs-paraguay/?g=951836',
};

test('el cuerpo viene envuelto en HTML aunque sea JSON', () => {
    assert.equal(unwrapRugbyPassBody('<html><body><p>{"a":1}</p></body></html>'), '{"a":1}');
    assert.equal(unwrapRugbyPassBody('  {"a":1}  '), '{"a":1}');
});

test('los & de las URLs vienen escapados dentro del JSON', () => {
    assert.equal(decodeRugbyPassEntities('x.png?v=1&amp;maxw=70'), 'x.png?v=1&maxw=70');
});

test('medianoche UTC exacta es hora desconocida, no las 00:00', () => {
    assert.equal(isKickoffUnknown('2026-09-06T00:00:00+0000'), true);
    assert.equal(isKickoffUnknown('2025-07-31T07:10:00+0000'), false);
    // 00:00 en otro offset SI es un horario real.
    assert.equal(isKickoffUnknown('2026-09-06T00:00:00+0200'), false);
});

test('un partido en vivo se reconoce por s === 1', () => {
    assert.equal(classifyRugbyPassStatus({ s: 1, sts: 'Fixture' }), 'live');
    assert.equal(classifyRugbyPassStatus({ s: 2, sts: 'Result' }), 'final');
    assert.equal(classifyRugbyPassStatus({ s: 0, sts: 'Fixture' }), 'scheduled');
});

test('un "FT" sin Result NO es un final: es el dato abandonado del ARC', () => {
    // Si esto devolviera 'final', el 0-0 se publicaria como empate.
    assert.equal(classifyRugbyPassStatus(ARC_ABANDONADO), 'scheduled');
});

test('un partido con hora conocida conserva el instante en UTC', () => {
    const m = parseRugbyPassGame(NPC_TERMINADO);
    assert.ok(m);
    assert.equal(m.id, 'rp-946625');
    assert.equal(m.kickoff, '2025-07-31T07:10:00.000Z');
    assert.equal(m.kickoffKnown, true);
    assert.equal(m.dayUtc, '2025-07-31');
    assert.equal(m.status, 'final');
    assert.equal(m.competitionName, 'Hilux NPC');
    assert.equal(m.tournamentId, 'rp-comp-208');
    assert.equal(m.venue, 'Eden Park');
    assert.equal(m.roundLabel, 'Round 1');
    assert.equal(m.home.id, 'rp-team-auckland');
    assert.equal(m.home.score, 35);
    assert.equal(m.away.score, 36);
    // El escudo se arma sobre el CDN y con el & ya desescapado.
    assert.equal(m.home.logo, 'https://eu-cdn.rugbypass.com/webp-images/images/team-images/logos/png/501.png.webp?v=1&maxw=70');
});

test('sin hora confirmada se guarda el dia pero no el instante', () => {
    const m = parseRugbyPassGame(TOP14_SIN_HORA);
    assert.ok(m);
    assert.equal(m.kickoffKnown, false);
    assert.equal(m.kickoff, null);
    // El dia si se conoce, y es el dia UTC — no el del visitante.
    assert.equal(m.dayUtc, '2027-01-09');
});

test('una competicion que no esta habilitada no entra', () => {
    assert.equal(parseRugbyPassGame(ARC_ABANDONADO), null);
    assert.equal(isRugbyPassCompetitionEnabled(266), false);
    assert.equal(isRugbyPassCompetitionEnabled(208), true);
});

test('el ARC esta excluido con su motivo escrito', () => {
    const arc = RUGBYPASS_EXCLUDED.find((c) => c.id === 266);
    assert.ok(arc, 'el ARC tiene que quedar documentado, no solo ausente');
    assert.match(arc.reason, /abandonado/);
    // Y no puede estar en las dos listas a la vez.
    assert.equal(RUGBYPASS_COMPETITIONS.some((c) => c.id === arc.id), false);
});

test('una fila sin equipos o sin fecha no pasa a medias', () => {
    assert.equal(parseRugbyPassGame({ ...NPC_TERMINADO, h: undefined }), null);
    assert.equal(parseRugbyPassGame({ ...NPC_TERMINADO, gmt: '' }), null);
    assert.equal(parseRugbyPassGame({ ...NPC_TERMINADO, gmt: 'no-es-fecha' }), null);
});

test('el feed se recorre por semana, dia y competicion', () => {
    const feed = {
        weeks: [
            {
                d: [
                    { g: 0 }, // un dia sin partidos llega como 0, no como objeto
                    { g: { c: [{ id: 208, g: [NPC_TERMINADO] }, { id: 266, g: [ARC_ABANDONADO] }] } },
                ],
            },
            { d: [{ g: { c: [{ id: 203, g: [TOP14_SIN_HORA, NPC_TERMINADO] }] } }] },
        ],
    };
    const partidos = parseRugbyPassFeed(feed);
    // El del ARC se descarta; el repetido se pliega por id.
    assert.deepEqual(partidos.map((m) => m.id), ['rp-946625', 'rp-952476']);
});

test('un feed vacio o roto devuelve lista vacia y no explota', () => {
    assert.deepEqual(parseRugbyPassFeed({}), []);
    assert.deepEqual(parseRugbyPassFeed({ weeks: 'no' } as never), []);
});

test('el poll trae estado y marcador de varios partidos de una', () => {
    const r = parseRugbyPassPoll({
        content: {
            games: {
                '950809': { id: 950809, status: 1, homeScore: 28, awayScore: 14 },
                '952476': { id: 952476, status: 0, homeScore: 0, awayScore: 0 },
            },
        },
    });
    assert.equal(r.length, 2);
    assert.deepEqual(r[0], { id: 'rp-950809', gameId: 950809, status: 'live', home: 28, away: 14 });
    assert.equal(r[1].status, 'scheduled');
});

test('los iconos de RugbyPass mapean al catalogo de rugby del proyecto', () => {
    assert.equal(mapRugbyPassEventType('try'), 'try');
    assert.equal(mapRugbyPassEventType('con'), 'conversion');
    assert.equal(mapRugbyPassEventType('pg'), 'penalty_goal');
    assert.equal(mapRugbyPassEventType('dg'), 'drop_goal');
    // En rugby es card_yellow; yellow_card es el nombre del FUTBOL y deja los
    // contadores por jugador en cero.
    assert.equal(mapRugbyPassEventType('yc'), 'card_yellow');
    assert.equal(mapRugbyPassEventType('rc'), 'card_red');
    assert.equal(mapRugbyPassEventType('lo-que-sea'), null);
});

// Recorte real de `.key-events-container`: una conversion de la visita (minuto
// antes del marcador) y un penal del local (marcador antes del minuto).
const FICHA = `
<div class="key-events-container">
  <div class="key-event"> <div class="interval"> Full Time </div> </div>
  <div class="key-event">
    <div class="side home"> </div>
    <div class="icon"> <div class="icon-image con"></div> </div>
    <div class="side away">
      <div class="name"> <a href="https://www.rugbypass.com/players/aaron-cruden/">Cruden</a> </div>
      <div class="score"> <div class="time">79'</div> <div class="label">35 - 36</div> </div>
    </div>
  </div>
  <div class="key-event">
    <div class="side home">
      <div class="name"> <a href="https://www.rugbypass.com/players/rico-simpson/">Simpson</a> </div>
      <div class="score"> <div class="label">35 - 24</div> <div class="time">73'</div> </div>
    </div>
    <div class="icon"> <div class="icon-image pg"></div> </div>
    <div class="side away"> </div>
  </div>
  <div class="key-event"> <div class="interval"> Start </div> </div>
</div>`;

test('los eventos de la ficha salen con tipo, lado, jugador y minuto', () => {
    const evs = parseRugbyPassEvents(FICHA);
    // La ficha los lista del final para atras: se devuelven cronologicos.
    assert.deepEqual(evs.map((e) => e.type), ['match_start', 'penalty_goal', 'conversion', 'match_end']);

    const penal = evs[1];
    assert.equal(penal.side, 'home');
    assert.equal(penal.playerName, 'Simpson');
    assert.equal(penal.playerSlug, 'rico-simpson');
    assert.equal(penal.minute, 73);
    assert.equal(penal.homeScore, 35);
    assert.equal(penal.awayScore, 24);

    // El bloque `away` invierte el orden de minuto y marcador: el lado no puede
    // salir por posicion, sale por cual de los dos trae el nombre.
    const conversion = evs[2];
    assert.equal(conversion.side, 'away');
    assert.equal(conversion.playerName, 'Cruden');
    assert.equal(conversion.minute, 79);
    assert.equal(conversion.homeScore, 35);
    assert.equal(conversion.awayScore, 36);
});

test('una ficha sin eventos no inventa ninguno', () => {
    // Farah Palmer Cup y Super Rugby Aupiki traen marcador pero cero eventos.
    assert.deepEqual(parseRugbyPassEvents('<div class="key-events-container"></div>'), []);
    assert.deepEqual(parseRugbyPassEvents(''), []);
});

test('los ids llevan prefijo propio para no chocar con los de FlashScore', () => {
    assert.equal(rugbyPassMatchId(946625), 'rp-946625');
    assert.equal(rugbyPassTeamId('auckland'), 'rp-team-auckland');
    assert.equal(isRugbyPassMatchId('rp-946625'), true);
    assert.equal(isRugbyPassMatchId('trgyZr5s'), false);
    assert.equal(isRugbyPassMatchId('ra-761228'), false);
});

// ── Estadisticas: los siete grupos ──────────────────────────────────────────

/** El markup real de una fila, tal como lo emite `live-poll-data`. */
function filaStat(local: string, rotulo: string, visitante: string) {
    return `<div class="stat">
                <div class="line lh"></div>
                <div>${local}</div>
                <div class="mid smaller">${rotulo}</div>
                <div>${visitante}</div>
                <div class="line "></div>
            </div>`;
}

test('un rotulo con % se lee entero: era lo que se perdia', () => {
    // El regex viejo buscaba .home/.label/.away, que RugbyPass no emite nunca,
    // asi que todo salia por el respaldo de texto plano — y ese no admite `%`
    // en el rotulo. "Scrum Win %" y "Tackle Completion %" se caian enteras.
    const stats = parseRugbyPassStatsSummary(
        filaStat('12', 'Scrums', '7') + filaStat('100%', 'Scrum Win %', '86%')
    );
    assert.equal(stats.length, 2);
    assert.deepEqual(stats[1], { label: 'Scrums ganados %', home: '100%', away: '86%' });
});

test('las estadisticas salen de los SIETE bloques, no solo del resumen', () => {
    const stats = parseRugbyPassAllStats({
        statsSummary: filaStat('4', 'Tries', '4'),
        setPlays: filaStat('12', 'Scrums', '7'),
        defence: filaStat('119', 'Tackles Made', '220'),
        kicks: filaStat('21', 'Total Kicks', '16'),
    });
    assert.deepEqual(stats.map((s) => s.label), ['Tries', 'Scrums', 'Tackles', 'Patadas']);
});

test('un rotulo repetido entre bloques no duplica la fila', () => {
    // "Turnovers Won" sale en statsSummary y otra vez en el bloque turnovers.
    const stats = parseRugbyPassAllStats({
        statsSummary: filaStat('6', 'Turnovers Won', '5'),
        turnovers: filaStat('6', 'Turnovers Won', '5'),
    });
    assert.equal(stats.length, 1);
});

// ── Alineaciones ────────────────────────────────────────────────────────────

function jugadorHtml(num: number, slug: string, nombre: string, sub = '') {
    return `<div class="player odd  ">
            <div class="num">${num}</div>
            <div class="name">
                <a href="https://www.rugbypass.com/players/${slug}/">
                    ${nombre}                </a>
            </div>
            <div class="sub">${sub}</div>
        </div>`;
}

test('la alineacion separa titulares del banco por el titulo, no por contar quince', () => {
    const html = jugadorHtml(1, 'boris-wenger', 'Boris Wenger', `<div class="off"> 52' </div>`)
        + '<h3>Substitutes</h3>'
        + jugadorHtml(16, 'leonel-oviedo', 'Leonel Oviedo', `<div class="on"> 70' </div>`);

    const alineacion = parseRugbyPassLineup(html);
    assert.equal(alineacion.length, 2);
    assert.deepEqual(alineacion[0], {
        number: 1, name: 'Boris Wenger', slug: 'boris-wenger',
        role: 'starter', onMinute: null, offMinute: 52,
    });
    assert.deepEqual(alineacion[1], {
        number: 16, name: 'Leonel Oviedo', slug: 'leonel-oviedo',
        role: 'substitute', onMinute: 70, offMinute: null,
    });
});

test('sin el titulo de suplentes no se inventa un corte en el quince', () => {
    const alineacion = parseRugbyPassLineup(jugadorHtml(1, 'x-y', 'X Y'));
    assert.equal(alineacion[0].role, 'starter');
});

test('una competicion que no publica formaciones devuelve lista vacia', () => {
    assert.deepEqual(parseRugbyPassLineup(''), []);
    assert.deepEqual(parseRugbyPassLineup('<div class="player"></div>'), []);
});

// ── El try penal ────────────────────────────────────────────────────────────

test('el try penal se distingue del try comun: vale 7 y no tiene jugador', () => {
    // Caso real: Argentina-Australia del 5/9/2026, 69'. RugbyPass NO le da
    // icono propio —usa el mismo `try`— y en vez de un jugador con ficha pone
    // el texto "Penalty Try" suelto. Leerlo como try comun dejaba al visitante
    // en 26 con el partido terminado 28-28.
    const html = `<div class="key-event">
        <div class="side home"></div>
        <div class="icon"><div class="icon-image try"></div></div>
        <div class="side away">
            <div class="name"> Penalty Try </div>
            <div class="score"><div class="time">69'</div><div class="label">21 - 28</div></div>
        </div>
    </div>`;

    const [evento] = parseRugbyPassEvents(html);
    assert.equal(evento.type, 'penalty_try');
    assert.equal(evento.side, 'away');
    assert.equal(evento.minute, 69);
    assert.equal(evento.playerName, null, 'no hay jugador al que atribuirselo');
    assert.equal(evento.playerSlug, null);
});

test('un try con jugador sigue siendo un try comun', () => {
    const html = `<div class="key-event">
        <div class="side home"></div>
        <div class="icon"><div class="icon-image try"></div></div>
        <div class="side away">
            <div class="name"><a href="https://www.rugbypass.com/players/max-jorgensen/">Jorgensen</a></div>
            <div class="score"><div class="time">27'</div><div class="label">0 - 12</div></div>
        </div>
    </div>`;

    const [evento] = parseRugbyPassEvents(html);
    assert.equal(evento.type, 'try');
    assert.equal(evento.playerName, 'Jorgensen');
});

/**
 * LA PLANILLA POR JUGADOR.
 *
 * `live-poll-data` publica seis rubros y solo el podio de cada uno. La accion
 * `filter-players-stats` de la pestana `/stats/` devuelve el ranking entero y
 * veintidos rubros: es la diferencia entre tres jugadores con datos y los 46.
 */
test('el ranking de un rubro sale entero, no solo el podio', () => {
    const html = `<div class="player odd">
            <div class="num">1</div>
            <img alt="Argentina">
            <div class="name">Ignacio Ruiz</div>
            <div class="total">18</div>
        </div>
        <div class="player">
            <div class="num">2</div>
            <img alt="Argentina">
            <div class="name">Pablo Matera</div>
            <div class="total">17</div>
        </div>
        <div class="player odd">
            <div class="num">3</div>
            <img alt="Australia">
            <div class="name">Angus Bell</div>
            <div class="total">10</div>
        </div>
        <div class="player">
            <div class="num">4</div>
            <img alt="Australia">
            <div class="name">Rob Valetini</div>
            <div class="total">9</div>
        </div>`;

    const filas = parseRugbyPassPlayerStatRanking('carries', html);
    assert.equal(filas.length, 4, 'el cuarto es justamente el que el podio perdia');
    assert.deepEqual(filas[0], {
        category: 'carries',
        rank: 1,
        playerName: 'Ignacio Ruiz',
        teamName: 'Argentina',
        total: 18,
    });
    assert.equal(filas[3].playerName, 'Rob Valetini');
    assert.equal(filas[3].teamName, 'Australia', 'el club sale del alt del escudo');
});

/** Un rubro sin registros no es un error: si no hubo rojas, nadie tiene rojas. */
test('un rubro sin registros devuelve lista vacia', () => {
    assert.deepEqual(parseRugbyPassPlayerStatRanking('red_cards', ''), []);
    assert.deepEqual(parseRugbyPassPlayerStatRanking('red_cards', '<div class="empty"></div>'), []);
});

/**
 * Dos rubros con el mismo `metricId` se pisarian en la tabla y el jugador
 * mostraria el ultimo que llego, no el que dice la etiqueta.
 */
test('cada rubro pide su propio stat y ocupa su propia columna', () => {
    const ids = RUGBYPASS_PLAYER_STAT_KINDS.map((k) => k.id);
    const metricas = RUGBYPASS_PLAYER_STAT_KINDS.map((k) => k.metricId);
    assert.equal(new Set(ids).size, ids.length, 'hay un stat repetido');
    assert.equal(new Set(metricas).size, metricas.length, 'hay dos rubros peleando la misma columna');

    // Los tackles medidos ocupan la columna que ya existe en vez de estrenar
    // una segunda "Tackles" al lado de la que sale de la cronologia.
    const completados = RUGBYPASS_PLAYER_STAT_KINDS.find((k) => k.id === 'completed_tackles');
    assert.equal(completados?.metricId, 'tackles');
});

// ── Temporadas ──────────────────────────────────────────────────────────────
//
// Los meses de corte no son una convencion: salen de contar el feed entero
// (1498 partidos habilitados, 2026-09-06). Los casos de abajo son los bordes
// de esa medicion, que es donde un corte mal puesto se nota.

/**
 * El sintoma que esto cierra: el Top 14 tenia 369 partidos de dos temporadas
 * bajo el mismo torneo y la pantalla abria con los resultados de la pasada.
 */
test('una liga del norte corta en julio y el ano cruzado se rotula con dos', () => {
    // Arranque de la 2025-26.
    assert.equal(rugbyPassSeasonOf(203, '2025-09-06T18:00:00Z'), '2025-26');
    // Diciembre sigue siendo la misma temporada aunque cambie el ano.
    assert.equal(rugbyPassSeasonOf(203, '2025-12-27T18:00:00Z'), '2025-26');
    assert.equal(rugbyPassSeasonOf(203, '2026-01-03T18:00:00Z'), '2025-26');
    // Junio son las FINALES: caen del lado de la temporada que termina, no del
    // arranque de la siguiente. Es el borde que un corte en enero rompe.
    assert.equal(rugbyPassSeasonOf(203, '2026-06-26T18:00:00Z'), '2025-26');
    // Y septiembre ya es la que viene.
    assert.equal(rugbyPassSeasonOf(203, '2026-09-05T18:00:00Z'), '2026-27');
});

/**
 * La Pro D2 juega en AGOSTO. Con el corte en agosto o septiembre —que es lo que
 * sugeria el ojo— esos ocho partidos se irian a la temporada anterior.
 */
test('agosto de la Pro D2 entra en la temporada que arranca, no en la que termino', () => {
    assert.equal(rugbyPassSeasonOf(211, '2025-08-29T18:00:00Z'), '2025-26');
    assert.equal(rugbyPassSeasonOf(211, '2026-08-28T18:00:00Z'), '2026-27');
});

/** El NPC entra y sale dentro del mismo ano: un rotulo de un ano solo. */
test('el NPC va por ano calendario y se rotula con un ano solo', () => {
    assert.equal(rugbyPassSeasonOf(208, '2025-07-31T07:10:00Z'), '2025');
    assert.equal(rugbyPassSeasonOf(208, '2025-10-25T07:10:00Z'), '2025');
    assert.equal(rugbyPassSeasonOf(208, '2026-07-30T07:10:00Z'), '2026');
});

/**
 * Internationals es el cajon de sastre: gira de julio, ventana de noviembre y
 * el Rugby Championship, todo bajo el mismo id. No tiene temporadas y no hay
 * que inventarle una, porque el selector se dibuja con lo que devuelva esto.
 */
test('Internationals no tiene temporadas', () => {
    assert.equal(rugbyPassSeasonOf(3, '2026-08-15T18:00:00Z'), null);
    assert.deepEqual(rugbyPassSeasonsIn(3, ['2026-08-15T18:00:00Z']), []);
});

test('las temporadas presentes salen ordenadas de la mas nueva a la mas vieja', () => {
    const fechas = [
        '2025-09-06T18:00:00Z',
        '2026-06-26T18:00:00Z',
        '2026-09-05T18:00:00Z',
        '2027-05-01T18:00:00Z',
    ];
    assert.deepEqual(rugbyPassSeasonsIn(203, fechas), ['2026-27', '2025-26']);
});

/**
 * En julio una liga del norte no tiene un solo partido: la temporada de "hoy"
 * no existe en el calendario. Ahi lo que se quiere ver es la que viene.
 */
test('entre temporadas se cae a la mas reciente publicada', () => {
    const temporadas = ['2026-27', '2025-26'];
    // Con partidos de la temporada de hoy, gana la de hoy.
    assert.equal(rugbyPassDefaultSeason(203, temporadas, '2026-10-01T12:00:00Z'), '2026-27');
    // En pleno julio de 2026 la de hoy es la 2026-27, que ya esta publicada.
    assert.equal(rugbyPassDefaultSeason(203, temporadas, '2026-07-15T12:00:00Z'), '2026-27');
    // Y si la de hoy no esta en la lista, la mas nueva.
    assert.equal(rugbyPassDefaultSeason(203, ['2025-26'], '2026-10-01T12:00:00Z'), '2025-26');
    assert.equal(rugbyPassDefaultSeason(203, [], '2026-10-01T12:00:00Z'), null);
});

/**
 * El campo es obligatorio en el tipo, pero `null` es un valor legitimo: el test
 * es que nadie lo deje sin declarar por olvido al sumar una competicion.
 */
test('toda competicion declara su mes de inicio de temporada', () => {
    for (const c of RUGBYPASS_COMPETITIONS) {
        assert.ok(
            c.seasonStartMonth === null ||
            (Number.isInteger(c.seasonStartMonth) && c.seasonStartMonth >= 1 && c.seasonStartMonth <= 12),
            `${c.name} no declara un mes de inicio valido`
        );
    }
});
