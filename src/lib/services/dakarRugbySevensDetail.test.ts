import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dakarPeriodScores,
    parseDakarGroupSummary,
    parseDakarPlayByPlay,
    parseDakarResultList,
    parseDakarTeamStatistics,
} from './dakarRugbySevensParser.ts';

// Estructura copiada de los fragmentos reales de un partido ya jugado
// (`TeamStatistics`, `PlayByPlay`, `ResultList`, `GroupSummary`), recortada.

function statItem(first: string, description: string, second: string): string {
    return `<div class="item"> <div class="competitor first"> ${first} </div><div class="description"> ${description} </div><div class="competitor second"> ${second} </div> </div>`;
}

const STATS_HTML = `<span class="TeamStatistics RU7"><div class="h2h-comparison"><div class="h2h-content">
${statItem('49', 'Points', '-')}${statItem('9', 'Tries', '-')}${statItem('-', 'Penalty Tries', '-')}
${statItem('2&nbsp;/&nbsp;9', 'Conversions (Made / Attempts)', '')}${statItem('', 'Penalty Goals (Made / Attempts)', '')}
${statItem('', 'Drop Goals (Made / Attempts)', '')}${statItem('1', 'Yellow Cards', '1')}${statItem('-', 'Red Cards', '-')}
</div></div></span>`;

test('parseDakarTeamStatistics: castellano, ceros y filas vacías fuera', () => {
    assert.deepEqual(parseDakarTeamStatistics(STATS_HTML), [
        { label: 'Puntos', home: '49', away: '0' },
        { label: 'Tries', home: '9', away: '0' },
        { label: 'Conversiones (hechas / intentos)', home: '2/9', away: '0' },
        { label: 'Tarjetas amarillas', home: '1', away: '1' },
        { label: 'Tarjetas rojas', home: '0', away: '0' },
    ]);
});

test('parseDakarTeamStatistics: un partido que no empezó no muestra estadísticas', () => {
    const notPlayed = `<div class="h2h-content">${statItem('', 'Points', '')}${statItem('', 'Tries', '')}${statItem('', 'Yellow Cards', '')}</div>`;
    assert.deepEqual(parseDakarTeamStatistics(notPlayed), []);
});

function jersey(...numbers: number[]): string {
    return numbers.map((n) => `<div class="bibColoredJersey"> <div class="jersey X"> <svg><polygon points="1,2"></polygon></svg><div class="number"> <span>${n}</span> </div> </div> </div>`).join('');
}

function person(id: string, name: string, role = ''): string {
    return `<span class="athleteLink${role ? ` ${role}` : ''}"><a class="athleteLink" href="/hide/en/Participant/ParticipantInfo/${id}"><span class="sortValue">${name}</span></a></span>`;
}

const ID_A = '01ba5bec-d62e-42de-9358-017b6f10ad92';
const ID_B = '2ff1ab8e-71cd-4e50-9bec-2dcd6c19ec56';
const ID_C = '5a6e78b6-2584-4ae3-8778-ffe352f8fc01';
const ID_D = '20c98a17-350b-4b90-85b3-4c53b3fbfbc5';

const EMPTY_SIDE = '<td class="pbpJersey"></td><td class="pbpName"><div class="assistsPlayer c-h-6"> </div></td>';

function pbpRow(left: string, time: string, action: string, right: string): string {
    return `<tr> ${left || EMPTY_SIDE}<td class="time-result-action"><div class="time"> ${time} </div><div class="result"> </div><div class="action"> ${action} </div></td>${right || EMPTY_SIDE} </tr>`;
}

const side = (numbers: number[], names: string) => `<td class="pbpJersey">${jersey(...numbers)}</td><td class="pbpName">${names}<div class="assistsPlayer c-h-6"> </div></td>`;

// La API sirve lo último arriba y separa los tiempos en H2 / H1.
const PBP_HTML = `<div key="H2" class="group" name="group0"><table><tbody>
${pbpRow(side([7], person(ID_B, 'ZAPIOLA Joaquin')), '0:30', 'Try Scored', '')}
${pbpRow('', '0:00', 'Start of 2nd Half', '')}
</tbody></table></div>
<div key="H1" class="group" name="group1"><table><tbody>
${pbpRow(side([12, 10], person(ID_C, 'CAIRO Gonzalo', 'IN') + person(ID_B, 'ANDERSON Federico', 'OUT')), '6:46', 'Replacement', '')}
${pbpRow('', '6:14', 'Yellow Card', side([1], person(ID_D, 'MULIIRA Deogracious')))}
${pbpRow(side([6], person(ID_A, 'KANTZ Federico')), '2:31', 'Conversion Miss', '')}
${pbpRow(side([6], person(ID_A, 'KANTZ Federico')), '2:31', 'Try Scored', '')}
${pbpRow('', '0:00', 'Start of 1st Half', '')}
</tbody></table></div>`;

test('parseDakarPlayByPlay: orden cronológico, minuto corrido, dorsal y lado', () => {
    const events = parseDakarPlayByPlay(PBP_HTML);
    assert.deepEqual(events.map((event) => [event.period, event.minute, event.team, event.type]), [
        ['1T', 3, 'home', 'try'],
        ['1T', 3, 'home', 'conversion'],
        ['1T', 7, 'away', 'card_yellow'],
        ['1T', 7, 'home', 'substitution'],
        ['2T', 8, 'home', 'try'],
    ]);
    assert.deepEqual(events.map((event) => event.order), [0, 1, 2, 3, 4]);

    const [firstTry, conversionMiss, yellow] = events;
    assert.equal(firstTry.player, 'Federico Kantz');
    assert.equal(firstTry.number, 6);
    assert.equal(firstTry.points, 5);
    // Una conversión errada no suma y se marca como falla.
    assert.equal(conversionMiss.points, 0);
    assert.match(conversionMiss.description, /^\[palos:miss\] Conversión/);
    // La tarjeta es del visitante: la fila trae el jugador del lado derecho.
    assert.equal(yellow.team, 'away');
    assert.equal(yellow.player, 'Deogracious Muliira');
});

test('parseDakarPlayByPlay: en un cambio, IN entra y OUT sale, cada uno con su dorsal', () => {
    const sub = parseDakarPlayByPlay(PBP_HTML).find((event) => event.type === 'substitution');
    assert.ok(sub);
    assert.equal(sub.player, 'Federico Anderson');
    assert.equal(sub.number, 10);
    assert.equal(sub.subPlayer, 'Gonzalo Cairo');
    assert.equal(sub.subNumber, 12);
    assert.equal(sub.description, 'Cambio · Entra: Gonzalo Cairo');
});

test('dakarPeriodScores: suma cada tiempo y omite el segundo si no se jugó', () => {
    const events = parseDakarPlayByPlay(PBP_HTML);
    assert.deepEqual(dakarPeriodScores(events), [
        { period: '1', label: 'Primer tiempo', home: 5, away: 0 },
        { period: '2', label: 'Segundo tiempo', home: 5, away: 0 },
    ]);
    assert.equal(dakarPeriodScores(events.filter((event) => event.period === '1T')).length, 1);
    assert.deepEqual(parseDakarPlayByPlay('<div>sin cronología</div>'), []);
});

function sheetRow(cls: string, bib: string, noc: string, id: string, name: string, cells: string[]): string {
    const bibCell = `<td class="bibColored"><span><div class="bibColoredJersey"><div class="jersey X"><svg><polygon></polygon></svg><div class="number"> ${bib} </div></div></div></span></td>`;
    const nocCell = noc ? `<td class="noc-column"><a class="noc-element"><span>${noc}</span></a></td>` : '<td class="noc-column"></td>';
    return `<tr class="${cls}" rowKey="k"> ${bibCell}${nocCell}<td class="athleteName">${person(id, name)}</td>${cells.map((c) => `<td>${c}</td>`).join('')} </tr>`;
}

const SHEET_HTML = `<table><thead><tr><th>No.</th></tr></thead><tbody>
${sheetRow('False isTeam c-bold', '', 'ARG', '24104cdf-8e53-4c23-9089-33a3f46510cd', 'Argentina', ['49', '9', '2&nbsp;/&nbsp;9', '', '', '1', ''])}
${sheetRow('False detail', '1', '', ID_A, 'MARTOS RODRIGUEZ Santiago', ['10', '2', '', '', '', '', ''])}
${sheetRow('False detail', '6', '', ID_B, 'KANTZ Federico', ['7', '1', '1&nbsp;/&nbsp;3', '', '', '1', ''])}
${sheetRow('False isTeam c-bold', '', 'UGA', '31cee4c9-ac9d-4aae-850d-d3e2b1a63229', 'Uganda', ['0', '', '', '', '', '1', ''])}
${sheetRow('False detail', '2', '', ID_D, 'SSEBUUFU James', ['', '', '', '', '', '1', ''])}
</tbody></table>`;

test('parseDakarResultList: jugadores con dorsal, agrupados por la fila de su selección', () => {
    const lines = parseDakarResultList(SHEET_HTML);
    assert.equal(lines.length, 3);
    assert.deepEqual(lines[0], {
        code: 'ARG', number: 1, id: ID_A, name: 'Santiago Martos Rodriguez',
        points: 10, tries: 2, conversions: '0', yellowCards: 0, redCards: 0,
    });
    assert.equal(lines[1].conversions, '1/3');
    assert.equal(lines[1].yellowCards, 1);
    assert.equal(lines[2].code, 'UGA');
    assert.equal(lines[2].yellowCards, 1);
    assert.deepEqual(parseDakarResultList('<table><tbody></tbody></table>'), []);
});

// La tabla oficial: encabezado de dos filas con colspan/rowspan, como lo publica el visor.
const OFFICIAL_HTML = `<table class="default-table"><thead>
<tr><th rowspan="2" class="rankColumn"><span>Rank</span></th><th rowspan="2" class="noc-column"><abbr title="National Olympic Committee"> NOC </abbr></th><th rowspan="2" class="athleteName"><span>Name</span></th><th rowspan="2" class="points"><span><span class="c-h-7">Points</span><span class="c-s-7"><abbr title="Points"> PTS </abbr></span></span></th><th colspan="4" class="topHeader">Matches</th><th colspan="4" class="topHeader c-h-6">Points</th><th rowspan="2" class="c-s-6"><span><span class="c-h-6"><abbr title="Difference"> D </abbr></span><span class="c-s-6"><abbr title="Points Difference"> PD </abbr></span></span></th><th colspan="3" class="topHeader c-h-9">Tries</th></tr>
<tr><th><span><span>Played</span><span><abbr title="Played"> MP </abbr></span></span></th><th><span><span>Won</span><span><abbr title="Won"> W </abbr></span></span></th><th><span><span>Draw</span><span><abbr title="Difference"> D </abbr></span></span></th><th><span><span>Lost</span><span><abbr title="Lost"> L </abbr></span></span></th><th><abbr title="For"> F </abbr></th><th><abbr title="Against"> A </abbr></th><th><span><span>D</span><span><abbr title="Points Difference"> PD </abbr></span></span></th><th><abbr title="Bonus"> B </abbr></th><th><abbr title="For"> F </abbr></th><th><abbr title="Against"> A </abbr></th><th><abbr title="Difference"> D </abbr></th></tr>
</thead><tbody>
<tr class="False" rowKey="a"><td>1<span class="sortValue c-hide">1</span></td><td><span>CAN</span></td><td><span class="sortValue">Canada</span></td><td>4</td><td>2</td><td>1</td><td>0</td><td>1</td><td>34</td><td>34</td><td>0</td><td>1</td><td>0</td><td>6</td><td>6</td><td>0</td></tr>
<tr class="False" rowKey="b"><td>2<span class="sortValue c-hide">2</span></td><td><span>GER</span></td><td><span class="sortValue">Germany</span></td><td>4</td><td>2</td><td>1</td><td>0</td><td>1</td><td>41</td><td>29</td><td>12</td><td>1</td><td>12</td><td>7</td><td>5</td><td>2</td></tr>
</tbody></table>`;

test('parseDakarGroupSummary: encabezado de dos filas, el orden oficial manda', () => {
    const [table] = parseDakarGroupSummary(OFFICIAL_HTML);
    assert.equal(table.length, 2);
    // Canadá y Alemania empatan en 4 puntos; el visor pone primero a Canadá
    // (ganó el cruce directo), algo que una tabla calculada no sabe.
    assert.deepEqual(table.map((row) => [row.position, row.code, row.points]), [[1, 'CAN', 4], [2, 'GER', 4]]);
    assert.deepEqual(
        [table[1].played, table[1].won, table[1].drawn, table[1].lost, table[1].pointsFor, table[1].pointsAgainst, table[1].diff],
        [2, 1, 0, 1, 41, 29, 12],
    );
});
