import test from 'node:test';
import assert from 'node:assert/strict';

import {
    US7_MATCH_PERIOD,
    classifyUs7TimelineLabel,
    parseUs7MatchCentreHtml,
    toUs7StatRows,
    toUs7Timeline,
    us7EventDescription,
    us7EventTotals,
} from './ultimateSevensMatchCentre.ts';

// Recortes con la forma real de la página de un partido del match centre
// (Cardiff, 12/09): los mismos nombres de clase, los mismos rótulos en inglés
// y las mismas entidades HTML que manda el WordPress.

function hecho(side: 'home' | 'away', minute: string, label: string, player = '', { scoring = false, hidden = false } = {}) {
    const classes = `stats-block-timeline__event stats-block-timeline__event--${side}${scoring ? ' stats-block-timeline__event--scoring' : ''}`;
    return `
        <li class="${classes}"${hidden ? ' hidden' : ''}>
            <span class="stats-block-timeline__minute">${minute}</span>
            <span class="stats-block-avatar stats-block-timeline__crest">
                <img decoding="async" src="https://x/logo.png" alt="" loading="lazy" onerror="this.hidden=true;" />
                <span class="stats-block-avatar__initials" aria-hidden="true" hidden>FB</span>
            </span>
            <span class="stats-block-timeline__body">
                <span class="stats-block-timeline__label">${label}</span>
                ${player ? `<span class="stats-block-timeline__player">${player}</span>` : ''}
            </span>
        </li>`;
}

function fila(home: string, label: string, away: string) {
    return `
        <li class="stats-block-match-stats__row">
            <span class="stats-block-match-stats__value stats-block-match-stats__value--home">
                ${home}                </span>
            <span class="stats-block-match-stats__mid">
                <span class="stats-block-match-stats__label">${label}</span>
                <span class="stats-block-match-stats__bar">
                    <span class="stats-block-match-stats__bar-fill stats-block-match-stats__bar-fill--home" style="width:100%"></span>
                </span>
            </span>
            <span class="stats-block-match-stats__value stats-block-match-stats__value--away">
                ${away}                </span>
        </li>`;
}

function pagina(hechos: string[], filas: string[]) {
    return `<html><body>
        <section id="block_a" class="afz-stats" data-stats-block="match-stats">
            <div class="stats-block-match-stats"><ul class="stats-block-match-stats__rows">${filas.join('')}</ul></div>
        </section>
        <section id="block_b" class="afz-stats" data-stats-block="match-timeline">
            <div class="stats-block-timeline"><ol class="stats-block-timeline__events">${hechos.join('')}</ol>
            <div class="stats-block-timeline__pagination">
                <button type="button" class="stats-block-timeline__load-more" data-per-page="8">Load More</button>
            </div></div>
        </section>
        <section id="block_c" class="afz-stats" data-stats-block="match-lineup"><ol class="lineup__list"><li class="lineup__row">x</li></ol></section>
    </body></html>`;
}

// Semi 1 masculina de Cardiff (31715): Pacific Current 13-20 Foudre Bleue, con
// golden point. Recortada: sin los pases ni los tackles de la planilla.
const SEMI = pagina([
    hecho('home', '1&#039;', 'Kickoffs &#8211; Lost'),
    hecho('away', '3&#039;', 'Try &#8211; Standard (5 Points)', 'Jayden Keelan', { scoring: true }),
    hecho('away', '4&#039;', 'Conversion &#8211; Scored (2 Points)', 'Paulin Riva', { scoring: true }),
    hecho('away', '5&#039;', 'Try &#8211; Standard (5 Points)', 'Nathaniel Barry', { scoring: true }),
    hecho('away', '5&#039;', 'Conversion &#8211; Scored (1 Point)', 'Paulin Riva', { scoring: true }),
    hecho('home', '6&#039;', 'In Play &#8211; Offloads', 'Henry Hutchison'),
    hecho('home', '8&#039;', 'Try &#8211; Standard (5 Points)', 'Marcus Kershaw', { scoring: true }),
    hecho('home', '8&#039;', 'Conversion &#8211; Scored (2 Points)', 'Kaleem Barreto', { scoring: true, hidden: true }),
    hecho('home', '9&#039;', 'In Play &#8211; Tackle &#8211; Made', '', { hidden: true }),
    hecho('home', '10&#039;', 'Try &#8211; Standard (5 Points)', 'Finley Lloyd-Gilmour', { scoring: true, hidden: true }),
    hecho('home', '10&#039;', 'Conversion &#8211; Scored (1 Point)', 'George Bose', { scoring: true, hidden: true }),
    hecho('away', '10&#039;', 'Try &#8211; Standard (5 Points)', 'Josua Cevaceva', { scoring: true, hidden: true }),
    hecho('away', '10&#039;', 'Conversion &#8211; Scored (2 Points)', '', { scoring: true, hidden: true }),
], [
    fila('1/0', 'Scrums', '2/0'),
    fila('2/0', 'Lineouts', '1/0'),
    fila('14/4', 'Tackles', '8/1'),
    fila('2', 'Offloads', '0'),
    fila('2', 'Tries', '3'),
    fila('6', 'Penalties Conceded', '1'),
]);

test('la cronología trae los tantos, con su valor, y deja afuera la planilla', () => {
    const { events } = parseUs7MatchCentreHtml(SEMI);
    assert.equal(events.length, 10, 'sin la salida perdida, el offload ni el tackle');
    assert.deepEqual(events[0], { type: 'try', side: 'away', minute: 3, player: 'Jayden Keelan', points: 5, made: null });
    assert.deepEqual(events[1], { type: 'conversion', side: 'away', minute: 4, player: 'Paulin Riva', points: 2, made: true });
    assert.equal(events[3].points, 1, 'la conversión de la zona de 1 punto');
    assert.equal(events[9].player, null, 'una conversión sin pateador publicado');
});

test('los hechos escondidos detrás del "Load More" también entran', () => {
    const { events } = parseUs7MatchCentreHtml(SEMI);
    assert.equal(events.filter((event) => event.minute === 10).length, 4);
});

test('la suma de la cronología da el marcador, golden point incluido', () => {
    assert.deepEqual(us7EventTotals(parseUs7MatchCentreHtml(SEMI).events), { home: 13, away: 20 });
});

test('los rótulos de la mesa: tries de 5 y de 7, conversiones de 1, 2 y 4, errada, tarjetas y tiempo muerto', () => {
    assert.deepEqual(classifyUs7TimelineLabel('Try - Standard (5 Points)'), { type: 'try', points: 5, made: null });
    assert.deepEqual(classifyUs7TimelineLabel('Try - Try (7 Points)'), { type: 'try', points: 7, made: null });
    assert.deepEqual(classifyUs7TimelineLabel('Try - Penalty Try (7 Points)'), { type: 'penalty_try', points: 7, made: null });
    assert.deepEqual(classifyUs7TimelineLabel('Conversion - Scored (4 Points)'), { type: 'conversion', points: 4, made: true });
    assert.deepEqual(classifyUs7TimelineLabel('Conversion - Missed'), { type: 'conversion', points: 0, made: false });
    assert.deepEqual(classifyUs7TimelineLabel('Card - Yellow'), { type: 'card_yellow', points: 0, made: null });
    assert.deepEqual(classifyUs7TimelineLabel('Card - Red'), { type: 'card_red', points: 0, made: null });
    assert.deepEqual(classifyUs7TimelineLabel('Timeout (90s)'), { type: 'timeout', points: 0, made: null });
    for (const planilla of ['In Play - Passes', 'Penalty Conceded', 'Kickoffs - Regained', 'Line breaks', 'In Play - Scrum - Won']) {
        assert.equal(classifyUs7TimelineLabel(planilla), null, planilla);
    }
});

test('el hecho sin minuto toma el del anterior y no se va al principio', () => {
    const html = pagina([
        hecho('home', '2&#039;', 'Try &#8211; Standard (5 Points)', 'Nathaniel Barry'),
        hecho('home', '8&#039;', 'Card &#8211; Yellow', 'Lockie Kratz'),
        hecho('home', '&#8212;', 'Timeout (90s)'),
    ], []);
    const timeline = toUs7Timeline(parseUs7MatchCentreHtml(html).events);
    // Minuto numérico: la cronología le agrega el apóstrofe, y con "8'" dibujaba "8''".
    assert.deepEqual(timeline.map((event) => [event.minute, event.minuteNumber, event.order]), [[2, 2, 0], [8, 8, 1], [8, 8, 2]]);
    assert.equal(timeline[1].description, 'Tarjeta amarilla de Lockie Kratz');
    assert.equal(timeline[2].player, '', 'el tiempo muerto es del equipo, no de un jugador');
    assert.ok(timeline.every((event) => event.period === US7_MATCH_PERIOD), 'sin entretiempo: un solo período');
});

test('cada hecho se lee en castellano y lleva lo que valió', () => {
    const timeline = toUs7Timeline(parseUs7MatchCentreHtml(SEMI).events);
    assert.equal(timeline[0].description, 'Try de Jayden Keelan');
    assert.equal(timeline[1].description, 'Conversión de 2 puntos de Paulin Riva');
    assert.equal(timeline[3].description, 'Conversión de 1 punto de Paulin Riva');
    assert.equal(timeline[1].points, 2);
    assert.equal(us7EventDescription({ type: 'try', points: 7, made: null, player: 'Nia Toliver' }), 'Try bajo los palos de Nia Toliver (7)');
    // la errada lleva el marcador del Match Center: la cronología lo cambia por " · fallada"
    assert.equal(us7EventDescription({ type: 'conversion', points: 0, made: false, player: 'Tom Emery' }), '[palos:miss] Conversión de Tom Emery');
});

test('las estadísticas: las de dos números se parten en ganados y perdidos', () => {
    const { stats } = parseUs7MatchCentreHtml(SEMI);
    assert.deepEqual(toUs7StatRows(stats), [
        { label: 'Tries', home: 2, away: 3 },
        { label: 'Tackles', home: 14, away: 8 },
        { label: 'Tackles errados', home: 4, away: 1 },
        { label: 'Offloads', home: 2, away: 0 },
        { label: 'Penales cometidos', home: 6, away: 1 },
        { label: 'Scrums ganados', home: 1, away: 2 },
        { label: 'Scrums perdidos', home: 0, away: 0 },
        { label: 'Lines ganados', home: 2, away: 1 },
        { label: 'Lines perdidos', home: 0, away: 0 },
    ]);
});

test('una fila que no conocemos entra con su nombre, y una página sin bloques no rompe', () => {
    const { stats } = parseUs7MatchCentreHtml(pagina([], [fila('3', 'Turnovers Won', '1')]));
    assert.deepEqual(stats, [{ key: 'turnovers_won', label: 'Turnovers Won', home: 3, away: 1 }]);
    assert.deepEqual(parseUs7MatchCentreHtml('<html><body>No match</body></html>'), { events: [], stats: [] });
    assert.deepEqual(parseUs7MatchCentreHtml(''), { events: [], stats: [] });
});
