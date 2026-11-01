import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDakarBrackets,
    dakarPeriodScores,
    parseDakarGroupSummary,
    parseDakarPlayByPlay,
    parseDakarResultList,
    parseDakarSchedule,
    parseDakarStartList,
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

// La lista de salida marca con `*` a los siete que arrancan, con `(C)` al capitán
// y con F / B el puesto. Los dorsales NO dicen quién arranca.
function startRow(cls: string, bib: string, id: string, name: string, extras: { captain?: boolean; starter?: boolean; position: 'Forward' | 'Back' }): string {
    const captain = extras.captain ? '&nbsp;<abbr title="Captain"> (C) </abbr>' : '';
    const starting = extras.starter ? '<span class="starting">*</span>' : '';
    return `<tr class="${cls}" rowKey="k"> <td class="bibColored"><span><div class="bibColoredJersey"><div class="jersey X"><svg><polygon></polygon></svg><div class="number X"> ${bib} </div></div></div></span></td><td class="noc-column"></td><td class="athleteName athl"><span class="starting-wrapper"><span class="athleteLink-wrapper"><span class="athleteLink"><a class="athleteLink" href="/hide/en/Participant/ParticipantInfo/${id}"><span class="sortValue">${name}</span></a></span></span>${captain}${starting}</span></td><td class="c-hide-compact"><span class="sport-code"><abbr title="${extras.position}"> ${extras.position[0]} </abbr></span></td> </tr>`;
}

const teamStartRow = (code: string) => `<tr class="False isTeam c-bold" rowKey="RU7MTEAM7---${code}01"> <td class="bibColored"><div class="number"> <span></span> </div></td><td class="noc-column"><a class="noc-element"><span>${code}</span></a></td><td class="athleteName athl"><span class="sortValue">${code}</span></td><td></td> </tr>`;

const START_LIST_HTML = `<table><thead><tr><th>No.</th></tr></thead><tbody>
${teamStartRow('ARG')}
${startRow('False detail', '1', ID_A, 'MARTOS RODRIGUEZ Santiago', { captain: true, starter: true, position: 'Forward' })}
${startRow('False detail', '9', ID_B, 'BENEDIT Ramon', { starter: true, position: 'Back' })}
${startRow('False detail', '2', ID_C, 'ABBONDATI Santiago', { position: 'Forward' })}
${teamStartRow('UGA')}
${startRow('True detail', '1', ID_D, 'MULIIRA Deogracious', { starter: true, position: 'Back' })}
</tbody></table>`;

test('parseDakarStartList: titulares por la marca, no por el dorsal; capitán y puesto', () => {
    const entries = parseDakarStartList(START_LIST_HTML);
    assert.equal(entries.length, 4);

    const [captain, back, substitute, other] = entries;
    assert.deepEqual(captain, {
        code: 'ARG', number: 1, id: ID_A, name: 'Santiago Martos Rodriguez',
        captain: true, starter: true, position: 'Forward',
    });
    // El 9 arranca y el 2 no: el dorsal no decide.
    assert.equal(back.number, 9);
    assert.equal(back.starter, true);
    assert.equal(back.position, 'Back');
    assert.equal(substitute.number, 2);
    assert.equal(substitute.starter, false);
    assert.equal(substitute.captain, false);
    assert.equal(other.code, 'UGA');
});

test('parseDakarStartList: antes de la lista solo vienen las filas de selección', () => {
    assert.deepEqual(parseDakarStartList(`<table><tbody>${teamStartRow('ARG')}${teamStartRow('UGA')}</tbody></table>`), []);
    assert.deepEqual(parseDakarStartList(''), []);
});

// El contenedor de cada partido no es siempre `scheduleItem`: el que se está
// jugando lleva `c-live` y los de medalla `medal-match gold|bronze`. Un lector
// que solo reconoce la clase exacta pierde justo esos partidos.
function teamBlock(kind: 'Left' | 'Right', code: string, english: string, score: string): string {
    return `<div class="scoredev${kind}"> <div class="team"> <div class="team-flag"><img src="/skins/flags/svg_flags/${code}.svg" alt="" /></div><div class="team-name"> <span class="sortValue lastName">${english}</span> </div><div class="result-information"><div class="result-value"><div class="score"> <div> ${score} </div> </div></div></div></div></div>`;
}

function scheduleItem(cls: string, rsc: string, ticks: number, status: string, name: string, left: string, right: string): string {
    return `<div class="${cls}"> <div class="link-wrapper"> <div class="header-content"> <div class="date-time"> <div class="time"> <span class="time-value" data-time-ticks="${ticks}">x</span> </div> <div class="status-remarks"><div class="status"> <span class="textStatus">${status}</span> </div></div> </div><div class="unit-content"> <div class="unit-name"> <div class="competition-name"> ${name} </div> </div><div class="scoredevInner"> ${left} ${right} </div> </div> </div> </div><div class="additional-information"><div class="venue-location"><div class="venue"> Complexe Iba Mar Diop </div></div><div class="reportInfo" rscCode="${rsc}"> </div></div></div>`;
}

const emptyTeam = (kind: 'Left' | 'Right', ...labels: string[]) =>
    `<div class="scoredev${kind}"> <div class="team-name emptyTeam"> ${labels.map((label) => `<span class="sport-code">${label}</span>`).join('')} </div></div>`;

const MIXED_SCHEDULE = `<div class="event-name"> Men </div><div class="SubTitle phase"> Pool A </div>
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------GPA-000500--', 1793545000000, 'Finished', 'Pool A Match #9', teamBlock('Left', 'CAN', 'Canada', '17'), teamBlock('Right', 'SEN', 'Senegal', '12'))}
${scheduleItem('scheduleItem c-live', 'RU7MTEAM7-------------GPA-000600--', 1793550000000, 'Running', 'Pool A Match #10', teamBlock('Left', 'RSA', 'South Africa', '34'), teamBlock('Right', 'GER', 'Germany', '7'))}
<div class="SubTitle phase"> Finals </div>
${scheduleItem('scheduleItem medal-match bronze', 'RU7MTEAM7-------------FNL-000200--', 1793723760000, 'Scheduled', 'Finals Bronze Medal Match #19', emptyTeam('Left', '', 'Loser #15'), emptyTeam('Right', '', 'Loser #16'))}
${scheduleItem('scheduleItem medal-match gold', 'RU7MTEAM7-------------FNL-000100--', 1793725380000, 'Scheduled', 'Finals Gold Medal Match #20', emptyTeam('Left', '', 'Winner #15'), emptyTeam('Right', '', 'Winner #16'))}`;

test('parseDakarSchedule: lee el partido en juego y los de medalla, no solo el contenedor exacto', () => {
    const units = parseDakarSchedule(MIXED_SCHEDULE);
    assert.equal(units.length, 4);

    const live = units.find((unit) => unit.homeCode === 'RSA');
    assert.ok(live);
    assert.equal(live.state, 'live');
    assert.equal(live.homeScore, 34);
    assert.equal(live.awayScore, 7);
    assert.equal(live.homeName, 'Sudáfrica');

    const bronze = units.find((unit) => unit.stageName === 'Tercer puesto');
    const gold = units.find((unit) => unit.stageName === 'Final');
    assert.ok(bronze && gold);
    // La primera etiqueta viene vacía: el rótulo es la segunda.
    assert.equal(bronze.homeName, 'Perdedor partido 15');
    assert.equal(bronze.awayName, 'Perdedor partido 16');
    assert.equal(gold.homeName, 'Ganador partido 15');
    assert.equal(gold.awayName, 'Ganador partido 16');
    assert.equal(gold.placeholder, true);
    assert.equal(gold.pool, null);
});

// Un torneo en fase final: una semifinal ya con un equipo, otra sin definir, el
// cruce por el 5.º y las dos finales, que el visor nombra por número de partido.
const KNOCKOUT_SCHEDULE = `<div class="event-name"> Men </div><div class="SubTitle phase"> Pool A </div>
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------GPA-000100--', 1793525000000, 'Finished', 'Pool A Match #1', teamBlock('Left', 'RSA', 'South Africa', '40'), teamBlock('Right', 'SEN', 'Senegal', '5'))}
<div class="SubTitle phase"> Placing 5-8 </div>
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------SF5-000100--', 1793711280000, 'Scheduled', 'Placing 5-8 Match #13', teamBlock('Left', 'GER', 'Germany', ''), emptyTeam('Right', '4th in Pool B'))}
<div class="SubTitle phase"> Semi-finals </div>
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------SFNL000100--', 1793713320000, 'Scheduled', 'Semi-finals Match #15', teamBlock('Left', 'RSA', 'South Africa', ''), emptyTeam('Right', '2nd in Pool B'))}
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------SFNL000200--', 1793714040000, 'Finished', 'Semi-finals Match #16', teamBlock('Left', 'FRA', 'France', '21'), teamBlock('Right', 'CAN', 'Canada', '12'))}
<div class="SubTitle phase"> Finals </div>
${scheduleItem('scheduleItem medal-match bronze', 'RU7MTEAM7-------------FNL-000200--', 1793723760000, 'Scheduled', 'Finals Bronze Medal Match #19', emptyTeam('Left', '', 'Loser #15'), emptyTeam('Right', '', 'Loser #16'))}
${scheduleItem('scheduleItem medal-match gold', 'RU7MTEAM7-------------FNL-000100--', 1793725380000, 'Scheduled', 'Finals Gold Medal Match #20', emptyTeam('Left', '', 'Winner #15'), emptyTeam('Right', '', 'Winner #16'))}
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------FNL-000300--', 1793722000000, 'Scheduled', 'Finals Placing 5-6', emptyTeam('Left', '', 'Winner #13'), emptyTeam('Right', '', 'Winner #14'))}`;

test('parseDakarSchedule: "Ganador partido 15" se lee como la semifinal que es', () => {
    const units = parseDakarSchedule(KNOCKOUT_SCHEDULE);
    const gold = units.find((unit) => unit.stageName === 'Final');
    const bronze = units.find((unit) => unit.stageName === 'Tercer puesto');
    const fifth = units.find((unit) => unit.stageName === '5° puesto');
    assert.ok(gold && bronze && fifth);
    // El 15 es la primera semifinal y el 16 la segunda; el 13 es el único cruce por puestos.
    assert.deepEqual([gold.homeName, gold.awayName], ['Ganador semifinal 1', 'Ganador semifinal 2']);
    assert.deepEqual([bronze.homeName, bronze.awayName], ['Perdedor semifinal 1', 'Perdedor semifinal 2']);
    // El 14 no existe en este fixture: un número sin cruce queda como vino.
    assert.deepEqual([fifth.homeName, fifth.awayName], ['Ganador cruce 1', 'Ganador partido 14']);
});

test('buildDakarBrackets: Medallas y Puestos 5.º a 8.º, desde el fixture', () => {
    const units = parseDakarSchedule(KNOCKOUT_SCHEDULE);
    const brackets = buildDakarBrackets(units, 'm', (code) => (code ? `logo-${code}` : ''));

    assert.deepEqual(brackets.map((bracket) => [bracket.name, bracket.active]), [
        ['Medallas', true],
        ['Puestos 5.º a 8.º', false],
    ]);
    assert.deepEqual(brackets[0].rounds.map((round) => [round.name, round.matches.length]), [
        ['Semifinales', 2],
        ['Final', 1],
        ['Tercer puesto', 1],
    ]);
    assert.deepEqual(brackets[1].rounds.map((round) => round.name), [
        'Cruces 5.º a 8.º',
        'Final por el 5.º puesto',
    ]);

    const [semiOne, semiTwo] = brackets[0].rounds[0].matches;
    // Un lado ya está definido (con bandera) y el otro todavía es "2.º Grupo B".
    assert.equal(semiOne.home_team.name, 'Sudáfrica');
    assert.equal(semiOne.home_team.logo, 'logo-RSA');
    assert.equal(semiOne.away_team.name, '2.º Grupo B');
    assert.equal(semiOne.away_team.logo, '');
    assert.equal(semiOne.status, 'scheduled');
    assert.equal(semiOne.score_home, null);
    assert.equal(semiOne.winner_id, null);

    // Una semifinal jugada trae marcador y ganador.
    assert.equal(semiTwo.status, 'finished');
    assert.deepEqual([semiTwo.score_home, semiTwo.score_away], [21, 12]);
    assert.equal(semiTwo.winner_id, semiTwo.home_team.id);

    // Cada partido conserva el id con el que se abre su ficha.
    assert.deepEqual(brackets[0].rounds[1].matches.map((match) => match.match_id), ['dakar-match-m-FNL_-000100']);
});

test('buildDakarBrackets: sin fase final no hay cuadros, y no mezcla las ramas', () => {
    const poolsOnly = parseDakarSchedule(`<div class="event-name"> Men </div><div class="SubTitle phase"> Pool A </div>
${scheduleItem('scheduleItem', 'RU7MTEAM7-------------GPA-000100--', 1793525000000, 'Scheduled', 'Pool A Match #1', teamBlock('Left', 'RSA', 'South Africa', ''), teamBlock('Right', 'SEN', 'Senegal', ''))}`);
    assert.deepEqual(buildDakarBrackets(poolsOnly, 'm', () => ''), []);

    // El fixture masculino no arma cuadros de la rama femenina.
    assert.deepEqual(buildDakarBrackets(parseDakarSchedule(KNOCKOUT_SCHEDULE), 'w', () => ''), []);
});
