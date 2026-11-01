import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyDakarStatus,
    computeDakarPools,
    dakarAgeAt,
    dakarAthleteName,
    dakarMatchIdOf,
    dakarPlaceholderLabel,
    dakarRefreshTtlSeconds,
    dakarStageName,
    dakarStandingsTeamLabels,
    parseDakarAthletes,
    parseDakarGroupSummary,
    parseDakarMatchId,
    parseDakarRsc,
    parseDakarSchedule,
    parseDakarTournamentId,
    toDakarMatchId,
    type DakarUnit,
} from './dakarRugbySevensParser.ts';

// Estructura copiada del fragmento real `ScheduleEventPartial?sportCode=RU7`
// (recortada): género -> fase -> partidos. El primero está sin jugar, el
// segundo terminado y el tercero es un cruce sin equipos.
function side(kind: 'Left' | 'Right', code: string, english: string, score: string): string {
    return `<div class="scoredev${kind}"> <div class="team"> <div class="team-flag"> <div title="${english}" class="noc-element"> <img src="/skins/flags/svg_flags/${code}.svg" alt="Flag of ${english}" /> </div> </div><div class="team-name"> <span class="sortValue lastName">${english}</span><span class="sortValue"></span> </div> </div><div class="result-information"> <div class="result-value">${score ? `<div class="score"> <div> ${score} </div> </div>` : ''} </div> </div> </div>`;
}

function item(rsc: string, ticks: number, status: string, name: string, left: string, right: string): string {
    return `<div class="scheduleItem"> <div class="link-wrapper"> <a href="/hide/en/Info/StartList/${rsc}"><div class="header-content"> <div class="date-time"> <div class="time"> <span class="time-value" data-time-ticks="${ticks}" data-time="x">x</span> </div> <div class="status-remarks"> <div class="status"> <span class="textStatus">${status}</span> </div> </div> </div><div class="unit-content"> <div class="unit-name"> <div class="competition-name"> ${name} </div> </div><div class="unit-details h2h"> <div class="scoredev"> <div class="scoredevInner"> ${left} <div class="separator-score-card"> vs </div> ${right} </div> </div> </div> </div> </a> </div><div class="additional-information"> <div class="venue-location"> <div class="venue"> Complexe Iba Mar Diop </div><div class="location"> CID Stadium </div> </div><div class="navigation-related"> <div class="reportInfo" rscCode="${rsc}"> </div> </div> </div> </div>`;
}

const PLACEHOLDER_ITEM = `<div class="scheduleItem"> <div class="link-wrapper"> <div class="header-content"> <div class="date-time"> <div class="time"> <span class="time-value" data-time-ticks="1793711280000" data-time="13:08">13:08</span> </div> <div class="status-remarks"> <div class="status"> <span class="textStatus">Scheduled</span> </div> </div> </div><div class="unit-content"> <div class="unit-name"> <div class="competition-name"> Placing 5-8 Match #13 </div> </div><div class="unit-details h2h"> <div class="scoredev"> <div class="scoredevInner"> <div class="scoredevLeft"> <div class="team-name emptyTeam"> <span class="sport-code">3rd in Pool A</span> </div> </div><div class="separator-score-card"> vs </div> <div class="scoredevRight"> <div class="team-name emptyTeam"> <span class="sport-code">4th in Pool B</span> </div> </div> </div> </div> </div> </div> </div> </div><div class="additional-information"> <div class="venue-location"> <div class="venue"> Complexe Iba Mar Diop </div><div class="location"> CID Stadium </div> </div><div class="navigation-related"> <div class="reportInfo" rscCode="RU7MTEAM7-------------SF5-000100--"> </div> </div> </div> </div>`;

const SCHEDULE_HTML = `
<span class="schedule-container byDate"><div class="groupPanel">
<div key="RU7MTEAM7" class="group"><div class="header"><div class="text"><div class="group-header"><div class="event-name">
    Men
</div></div></div></div><div class="content">
  <div key="GPB-" class="group"><div class="header"><div class="text"><div class="SubTitle phase">
    Pool B
  </div></div></div><div class="content">
    ${item('RU7MTEAM7-------------GPB-000200--', 1793532960000, 'Scheduled', 'Pool B Match #4', side('Left', 'ARG', 'Argentina', ''), side('Right', 'UGA', 'Uganda', ''))}
    ${item('RU7MTEAM7-------------GPB-000100--', 1793531640000, 'Finished', 'Pool B Match #3', side('Left', 'FRA', 'France', '21'), side('Right', 'JPN', 'Japan', '12'))}
  </div></div>
  <div key="SF5-" class="group"><div class="header"><div class="text"><div class="SubTitle phase">
    Placing 5-8
  </div></div></div><div class="content">
    ${PLACEHOLDER_ITEM}
  </div></div>
</div></div></div></span>`;

test('parseDakarSchedule: lee equipos, hora, estado, marcador y sede', () => {
    const units = parseDakarSchedule(SCHEDULE_HTML);
    assert.equal(units.length, 3);

    const argentina = units.find((unit) => unit.homeCode === 'ARG');
    assert.ok(argentina);
    assert.equal(argentina.key, 'm');
    assert.equal(argentina.homeName, 'Argentina');
    assert.equal(argentina.awayName, 'Uganda');
    assert.equal(argentina.state, 'scheduled');
    assert.equal(argentina.homeScore, null);
    assert.equal(argentina.stageName, 'Grupo B');
    assert.equal(argentina.pool, 'B');
    assert.equal(argentina.startsAtIso, new Date(1793532960000).toISOString());
    assert.equal(argentina.venue, 'Complexe Iba Mar Diop');
    assert.equal(argentina.location, 'CID Stadium');
    assert.equal(argentina.placeholder, false);

    const france = units.find((unit) => unit.homeCode === 'FRA');
    assert.ok(france);
    assert.equal(france.state, 'final');
    assert.equal(france.homeName, 'Francia');
    assert.equal(france.homeScore, 21);
    assert.equal(france.awayScore, 12);
});

test('parseDakarSchedule: un cruce sin equipos queda marcado y se lee en castellano', () => {
    const cruce = parseDakarSchedule(SCHEDULE_HTML).find((unit) => unit.placeholder);
    assert.ok(cruce);
    assert.equal(cruce.homeName, '3.º Grupo A');
    assert.equal(cruce.awayName, '4.º Grupo B');
    assert.equal(cruce.homeCode, null);
    assert.equal(cruce.stageName, 'Puestos 5-8');
    assert.equal(cruce.pool, null);
    assert.equal(cruce.unitCode, '000100');
});

test('parseDakarSchedule: ordena por hora y descarta unidades sin rscCode', () => {
    const units = parseDakarSchedule(`${SCHEDULE_HTML}<div class="scheduleItem"><div class="header-content"></div></div>`);
    assert.equal(units.length, 3);
    const times = units.map((unit) => unit.startsAtIso || '');
    assert.deepEqual(times, [...times].sort());
});

test('rsc e ids: ida y vuelta, y no confunde ids de otros proveedores', () => {
    assert.deepEqual(parseDakarRsc('RU7WTEAM7-------------GPA-000100--'), { key: 'w', phaseCode: 'GPA-', unitCode: '000100' });
    assert.equal(parseDakarRsc('BS5XTEAM5-------------GPA-00010000'), null);

    const id = toDakarMatchId('m', 'GPB-', '000200');
    assert.equal(id, 'dakar-match-m-GPB_-000200');
    assert.deepEqual(parseDakarMatchId(id), { key: 'm', phaseCode: 'GPB-', unitCode: '000200' });
    assert.deepEqual(parseDakarMatchId('dakar-match-w-SFNL-000100'), { key: 'w', phaseCode: 'SFNL', unitCode: '000100' });

    assert.equal(parseDakarMatchId('fisu-match-m-PO03-000100'), null);
    assert.equal(parseDakarMatchId('odesur-match-hoc-w-GP01-000100'), null);
    assert.equal(parseDakarMatchId(undefined), null);

    assert.equal(parseDakarTournamentId('dakar-ru7-2026-m'), 'm');
    assert.equal(parseDakarTournamentId('DAKAR-RU7-2026-W'), 'w');
    assert.equal(parseDakarTournamentId('fisu-ru7-2026-m'), null);
});

test('dakarMatchIdOf coincide con el id que lee parseDakarMatchId', () => {
    const [unit] = parseDakarSchedule(SCHEDULE_HTML);
    assert.deepEqual(parseDakarMatchId(dakarMatchIdOf(unit)), {
        key: unit.key,
        phaseCode: unit.phaseCode,
        unitCode: unit.unitCode,
    });
});

test('classifyDakarStatus', () => {
    assert.equal(classifyDakarStatus('Scheduled', false), 'scheduled');
    assert.equal(classifyDakarStatus('', false), 'scheduled');
    assert.equal(classifyDakarStatus('Finished', true), 'final');
    assert.equal(classifyDakarStatus('Unofficial', true), 'final');
    assert.equal(classifyDakarStatus('Live', true), 'live');
    assert.equal(classifyDakarStatus('Half time', true), 'live');
    assert.equal(classifyDakarStatus('Postponed', false), 'postponed');
    assert.equal(classifyDakarStatus('Cancelled', false), 'cancelled');
    // Texto desconocido: con marcador se está jugando, sin marcador no.
    assert.equal(classifyDakarStatus('Algo nuevo', true), 'live');
    assert.equal(classifyDakarStatus('Algo nuevo', false), 'scheduled');
});

test('dakarStageName y dakarPlaceholderLabel', () => {
    assert.deepEqual(dakarStageName('Pool A', 'Pool A Match #1'), { pool: 'A', stageName: 'Grupo A' });
    assert.equal(dakarStageName('Semi-finals', 'Semi-finals Match #15').stageName, 'Semifinal');
    assert.equal(dakarStageName('Placing 5-8', '').stageName, 'Puestos 5-8');
    assert.equal(dakarStageName('Finals', 'Finals Placing 5-6').stageName, '5° puesto');
    assert.equal(dakarStageName('Finals', 'Finals Placing 7-8').stageName, '7° puesto');
    assert.equal(dakarStageName('Finals', 'Finals Bronze Medal Match').stageName, 'Tercer puesto');
    assert.equal(dakarStageName('Finals', 'Finals Gold Medal Match').stageName, 'Final');

    assert.equal(dakarPlaceholderLabel('1st in Pool B'), '1.º Grupo B');
    assert.equal(dakarPlaceholderLabel('Winner Match #15'), 'Ganador partido 15');
    assert.equal(dakarPlaceholderLabel('Loser Match #16'), 'Perdedor partido 16');
    assert.equal(dakarPlaceholderLabel(''), 'Por definir');
});

test('dakarAthleteName: nombre de pila primero, apellidos con capital', () => {
    assert.equal(dakarAthleteName('ALVAREZ CUERVO Henar'), 'Henar Alvarez Cuervo');
    assert.equal(dakarAthleteName('ABBONDATI Santiago'), 'Santiago Abbondati');
    assert.equal(dakarAthleteName('GALETTI ARECHAGA Tomas'), 'Tomas Galetti Arechaga');
    assert.equal(dakarAthleteName('MARIS Juan Bautista'), 'Juan Bautista Maris');
    assert.equal(dakarAthleteName(''), '');
});

const ATHLETES_HTML = `<table class="default-table sortable"><thead><tr><th>NOC</th></tr></thead><tbody>
<tr class="False"> <td class="noc-column"><a title="Argentina" href="/x" class="noc-element"><img src="/skins/flags/svg_flags/ARG.svg" alt="" /><span>ARG</span></a></td><td class="athleteName"><span class="athleteLink"><a class="athleteLink" href="/hide/en/Participant/ParticipantInfo/01ba5bec-d62e-42de-9358-017b6f10ad92"><span class="sortValue">ABBONDATI Santiago</span></a></span></td><td class="gender">Male</td><td class="birth c-a-l"><span data-format="d MMM yyyy" class="time-value" data-time-ticks="1234310400000" data-time="11 Feb 2009">11 Feb 2009</span>&nbsp;(17)</td> </tr>
<tr class="True"> <td class="noc-column"><a title="Kenya" href="/x" class="noc-element"><span>KEN</span></a></td><td class="athleteName"><span class="athleteLink"><a class="athleteLink" href="/hide/en/Participant/ParticipantInfo/f174547f-4c79-4f18-9925-f1cd2b682e59"><span class="sortValue">AFANDE Evalyne</span></a></span></td><td class="gender">Female</td><td class="birth c-a-l"><span class="time-value" data-time-ticks="1241654400000">7 May 2009</span></td> </tr>
<tr class="False"> <td>fila sin atleta</td> </tr>
</tbody></table>`;

test('parseDakarAthletes: país, nombre, género y nacimiento', () => {
    const athletes = parseDakarAthletes(ATHLETES_HTML);
    assert.equal(athletes.length, 2);
    assert.deepEqual(athletes[0], {
        id: '01ba5bec-d62e-42de-9358-017b6f10ad92',
        code: 'ARG',
        name: 'Santiago Abbondati',
        gender: 'Male',
        birthDate: '2009-02-11',
    });
    assert.equal(athletes[1].code, 'KEN');
    assert.equal(athletes[1].gender, 'Female');
    assert.equal(athletes[1].birthDate, '2009-05-07');
});

test('dakarAgeAt: cumple años el día exacto', () => {
    assert.equal(dakarAgeAt('2009-02-11', new Date('2026-11-01T00:00:00Z')), 17);
    assert.equal(dakarAgeAt('2009-11-02', new Date('2026-11-01T00:00:00Z')), 16);
    assert.equal(dakarAgeAt('2009-11-01', new Date('2026-11-01T12:00:00Z')), 17);
    assert.equal(dakarAgeAt(null, new Date()), null);
});

const GROUP_HTML = `<span class="GroupSummary RU7"><div class="table-wrapper"><table class="default-table sortable"><thead><tr>
<th class="rankColumn"><div><span>Rank</span></div></th><th class="noc-column"><div><span><abbr title="National Olympic Committee"> NOC </abbr></span></div></th><th class="athleteName"><div><span>Name</span></div></th>
<th><div><span><abbr title="Games played"> GP </abbr></span></div></th><th><div><span>Won</span></div></th><th><div><span>Drawn</span></div></th><th><div><span>Lost</span></div></th>
<th><div><span><abbr title="Points for"> PF </abbr></span></div></th><th><div><span><abbr title="Points against"> PA </abbr></span></div></th><th><div><span><abbr title="Points"> Pts </abbr></span></div></th>
</tr></thead><tfoot></tfoot><tbody>
<tr class="False" rowKey="RU7MTEAM7---FRA01"> <td class="rankColumn">=1<span class="sortValue c-hide">1</span></td><td class="noc-column"><a class="noc-element"><span>FRA</span></a></td><td class="athleteName"><span class="athleteLink"><a class="athleteLink" href="/p"><span class="sortValue">France</span></a></span></td><td>1</td><td>1</td><td>0</td><td>0</td><td>21</td><td>12</td><td>3</td></tr>
<tr class="False" rowKey="RU7MTEAM7---JPN01"> <td class="rankColumn">2<span class="sortValue c-hide">2</span></td><td class="noc-column"><a class="noc-element"><span>JPN</span></a></td><td class="athleteName"><span class="athleteLink"><a class="athleteLink" href="/p"><span class="sortValue">Japan</span></a></span></td><td>1</td><td>0</td><td>0</td><td>1</td><td>12</td><td>21</td><td>1</td></tr>
</tbody></table></div><div class="table-wrapper"> </div></span>`;

test('parseDakarGroupSummary: reconoce las columnas por su encabezado', () => {
    const [table] = parseDakarGroupSummary(GROUP_HTML);
    assert.equal(table.length, 2);
    assert.deepEqual(table[0], {
        position: 1,
        code: 'FRA',
        name: 'France',
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        pointsFor: 21,
        pointsAgainst: 12,
        diff: null,
        points: 3,
    });
    assert.equal(table[1].position, 2);
    assert.equal(table[1].points, 1);
});

test('parseDakarGroupSummary: una tabla vacía no inventa filas', () => {
    assert.deepEqual(parseDakarGroupSummary('<span class="GroupSummary RU7"><div class="table-wrapper"> </div></span>'), []);
});

test('computeDakarPools: 3/2/1, diferencia y orden; no cuenta partidos sin terminar', () => {
    const units = parseDakarSchedule(SCHEDULE_HTML).filter((unit) => unit.pool);
    const [pool] = computeDakarPools(units);
    assert.equal(pool.name, 'Grupo B');
    assert.equal(pool.rows.length, 4);

    const byCode = new Map(pool.rows.map((row) => [row.code, row]));
    // Francia ganó 21-12: 3 puntos, +9. Japón perdió: 1 punto, -9.
    assert.equal(byCode.get('FRA')?.points, 3);
    assert.equal(byCode.get('FRA')?.diff, 9);
    assert.equal(byCode.get('JPN')?.points, 1);
    assert.equal(byCode.get('JPN')?.lost, 1);
    // Argentina y Uganda todavía no jugaron: aparecen en cero.
    assert.equal(byCode.get('ARG')?.played, 0);
    assert.equal(byCode.get('UGA')?.points, 0);
    assert.equal(pool.rows[0].code, 'FRA');
    assert.deepEqual(pool.rows.map((row) => row.position), [1, 2, 3, 4]);
});

test('dakarStandingsTeamLabels: 1.º y 2.º a semifinales, 3.º y 4.º por el 5.º al 8.º', () => {
    const labels = dakarStandingsTeamLabels('w');
    assert.deepEqual(labels.map((label) => label.position), [1, 2, 3, 4]);
    assert.deepEqual(labels.map((label) => label.label.name), [
        'A semifinales',
        'A semifinales',
        'Por el 5.º al 8.º puesto',
        'Por el 5.º al 8.º puesto',
    ]);
    // Por posición, sin club, fase ni grupo: la banda cae igual en los dos grupos.
    for (const label of labels) {
        assert.equal(label.club_id, null);
        assert.equal(label.phase_id, null);
        assert.equal(label.group_id, null);
        assert.equal(label.tournament_id, 'dakar-ru7-2026-w');
        assert.equal(label.label_id, label.label.id);
    }
    // Las dos posiciones del mismo destino comparten color; los destinos se distinguen.
    assert.equal(labels[0].label.color, labels[1].label.color);
    assert.notEqual(labels[1].label.color, labels[2].label.color);
});

test('dakarRefreshTtlSeconds: 20 s con un partido por empezar o en juego, 120 s sin nada', () => {
    const base = parseDakarSchedule(SCHEDULE_HTML);
    const kickoff = 1793532960000;

    // 10 minutos antes del Argentina–Uganda.
    assert.equal(dakarRefreshTtlSeconds(base, kickoff - 10 * 60 * 1000), 20);
    // Con el torneo lejos: nada caliente.
    assert.equal(dakarRefreshTtlSeconds(base, new Date('2026-10-20T00:00:00Z').getTime()), 120);
    // Un partido en juego calienta aunque su hora haya pasado hace rato.
    const live: DakarUnit[] = base.map((unit) => ({ ...unit, state: 'live' as const }));
    assert.equal(dakarRefreshTtlSeconds(live, new Date('2026-11-05T00:00:00Z').getTime()), 20);
});
