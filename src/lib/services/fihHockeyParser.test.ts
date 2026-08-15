import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FIH_COMPETITIONS,
    FIH_TTL_HOT_SECONDS,
    FIH_TTL_IDLE_SECONDS,
    fihLiveLabel,
    fihRefreshTtlSeconds,
    fihTeamKey,
    parseFihCellDateTime,
    parseFihMatchesHtml,
    parseFihMatchId,
    parseFihPoolsHtml,
    parseFihTournamentId,
    toFihMatchId,
} from './fihHockeyParser.ts';

/**
 * El HTML de acá está calcado del que sirve Altius RT hoy
 * (fih.altiusrt.com/competitions/1866/matches y /pools), con dos diferencias a
 * propósito: hay filas ya jugadas —el Mundial arranca el 15/08 y el sitio todavía
 * no tiene ninguna— y se conservan las trampas del original:
 *
 *  · la tabla de partidos usa <tbody>, la de grupos NO (parsear "tbody tr" ahí
 *    devuelve cero filas);
 *  · el cuadro final trae rivales sin definir ("1st Pool F", "Winner 47");
 *  · el orden de las columnas manda por su ENCABEZADO, no por su posición;
 *  · la página anida tablas (la caja de ayuda), así que cortar con un
 *    <table>...</table> no codicioso agarra fruta.
 */

const MATCHES_HTML = `
<div class="page">
  <table class="table">
    <tr><td><a href="#">How do I enter my Team Match Lineup?</a></td></tr>
  </table>
  <table class="table table-condensed table-hover">
    <thead>
      <tr>
        <th>Match #</th>
        <th>Date/Time</th>
        <th>Details</th>
        <th>Scoreline</th>
        <th>Status</th>
        <th>Venue</th>
        <th colspan="1">Reports</th>
        <th colspan="1">Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="text-center">1</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-15 13:00:00" data-timezone="Europe/Amsterdam">
            15 Aug 2026  13:00
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22334">IND v WAL (D)</a></td>
        <td style="white-space:nowrap;">3 - 1</td>
        <td>Official</td>
        <td>WHSA - Pitch 1 - Wagener Hockey Stadium</td>
        <td></td>
        <td><a href="https://fih.altiusrt.com/matches/22334/lineups/8575">Lineup IND</a></td>
      </tr>
      <tr>
        <td class="text-center">2</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-15 21:00:00" data-timezone="Europe/Amsterdam">
            15 Aug 2026  21:00
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22337">BEL v FRA (B)</a></td>
        <td style="white-space:nowrap;">2 - 2 (4-3 SO)</td>
        <td>Official</td>
        <td>Befius_BEL - Pitch 1 - Belfius Hockey Arena</td>
        <td></td>
        <td></td>
      </tr>
      <tr>
        <td class="text-center">3</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-16 19:00:00" data-timezone="Europe/Amsterdam">
            16 Aug 2026  19:00
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22336">ARG v NED (A)</a></td>
        <td style="white-space:nowrap;">1 - 0</td>
        <td>In Progress</td>
        <td>WHSA - Pitch 1 - Wagener Hockey Stadium</td>
        <td></td>
        <td></td>
      </tr>
      <tr>
        <td class="text-center">4</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-17 14:30:00" data-timezone="Europe/Amsterdam">
            17 Aug 2026  14:30
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22340">GER v MAS (B)</a></td>
        <td style="white-space:nowrap;">-</td>
        <td>Upcoming</td>
        <td>Befius_BEL - Pitch 1 - Belfius Hockey Arena</td>
        <td></td>
        <td></td>
      </tr>
      <tr>
        <td class="text-center">48</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-28 20:30:00" data-timezone="Europe/Amsterdam">
            28 Aug 2026  20:30
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22380">1st Pool F v 2nd Pool E (SF)</a></td>
        <td style="white-space:nowrap;">-</td>
        <td>Upcoming</td>
        <td>Befius_BEL - Pitch 1 - Belfius Hockey Arena</td>
        <td></td>
        <td></td>
      </tr>
      <tr>
        <td class="text-center">49</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-30 14:00:00" data-timezone="Europe/Amsterdam">
            30 Aug 2026  14:00
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22381">Loser 47 v Loser 48 (3/4)</a></td>
        <td style="white-space:nowrap;">-</td>
        <td>Upcoming</td>
        <td>Befius_BEL - Pitch 1 - Belfius Hockey Arena</td>
        <td></td>
        <td></td>
      </tr>
      <tr>
        <td class="text-center">50</td>
        <td>
          <span data-datetimelocal__notimechange="2026-08-30 16:30:00" data-timezone="Europe/Amsterdam">
            30 Aug 2026  16:30
          </span>
        </td>
        <td><a href="https://fih.altiusrt.com/matches/22382">Winner 47 v Winner 48 (1/2)</a></td>
        <td style="white-space:nowrap;">-</td>
        <td>Upcoming</td>
        <td>Befius_BEL - Pitch 1 - Belfius Hockey Arena</td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>
`;

// Ojo: sin <tbody>, igual que el original.
const POOLS_HTML = `
<div class="portlet-body">
  <h4>A</h4>
  <div class="table-responsive">
    <table class="table table-striped">
      <caption>Points awarded for Wins: 3, Draws: 1, Losses: 0</caption>
      <thead>
        <tr>
          <th>Rank</th><th>Team</th><th>Played</th><th>Wins</th><th>Draws</th>
          <th>Losses</th><th>Goals For</th><th>Goals Against</th>
          <th>Goal Difference</th><th>Points</th>
        </tr>
      </thead>
      <tr>
        <td>1</td>
        <td><a href="https://fih.altiusrt.com/teams/8577">Argentina</a></td>
        <td class="text-right">2</td><td class="text-right">2</td><td class="text-right">0</td>
        <td class="text-right">0</td><td class="text-right">7</td><td class="text-right">2</td>
        <td class="text-right">5</td><td class="text-right">6</td>
      </tr>
      <tr>
        <td>2</td>
        <td><a href="https://fih.altiusrt.com/teams/8590">Netherlands</a></td>
        <td class="text-right">2</td><td class="text-right">1</td><td class="text-right">0</td>
        <td class="text-right">1</td><td class="text-right">4</td><td class="text-right">3</td>
        <td class="text-right">1</td><td class="text-right">3</td>
      </tr>
    </table>
  </div>
  <h4>B</h4>
  <div class="table-responsive">
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Rank</th><th>Team</th><th>Played</th><th>Wins</th><th>Draws</th>
          <th>Losses</th><th>Goals For</th><th>Goals Against</th>
          <th>Goal Difference</th><th>Points</th>
        </tr>
      </thead>
      <tr>
        <td>1</td>
        <td><a href="https://fih.altiusrt.com/teams/8571">Belgium</a></td>
        <td class="text-right">1</td><td class="text-right">0</td><td class="text-right">1</td>
        <td class="text-right">0</td><td class="text-right">2</td><td class="text-right">2</td>
        <td class="text-right">0</td><td class="text-right">1</td>
      </tr>
    </table>
  </div>
</div>
`;

const matches = parseFihMatchesHtml(MATCHES_HTML);
const byNumber = (n: number) => {
    const row = matches.find((match) => match.number === n);
    assert.ok(row, `no se parseó el partido #${n}`);
    return row;
};

test('lee todas las filas de la tabla de partidos y saltea la tabla de ayuda', () => {
    assert.equal(matches.length, 7);
});

test('traduce el código de selección al castellano y le pone la bandera de la FIH', () => {
    const row = byNumber(1);
    assert.equal(row.homeCode, 'IND');
    assert.equal(row.homeName, 'India');
    assert.equal(row.awayName, 'Gales');
    assert.equal(row.altiusId, '22334');
    assert.equal(row.venue, 'WHSA - Pitch 1 - Wagener Hockey Stadium');
});

test('la hora de la sede se guarda en UTC (CEST = +02:00)', () => {
    // 15/08/2026 13:00 en Ámsterdam es 11:00 UTC.
    assert.equal(byNumber(1).startsAtIso, '2026-08-15T11:00:00.000Z');
});

test('el fallback de texto da la misma hora que el atributo', () => {
    const fromText = parseFihCellDateTime('<td>15 Aug 2026 13:00</td>');
    assert.equal(fromText, byNumber(1).startsAtIso);
});

test('separa el marcador del shoot-out', () => {
    const row = byNumber(2);
    assert.equal(row.homeGoals, 2);
    assert.equal(row.awayGoals, 2);
    assert.deepEqual(row.shootout, { home: 4, away: 3 });
    assert.equal(row.state, 'final');
});

test('clasifica los estados que publica Altius', () => {
    assert.equal(byNumber(1).state, 'final');       // Official
    assert.equal(byNumber(3).state, 'live');        // In Progress
    assert.equal(byNumber(4).state, 'scheduled');   // Upcoming
    assert.equal(byNumber(4).homeGoals, null);      // "-" no es un marcador
});

test('nombra la instancia: grupo, semifinal, tercer puesto y final', () => {
    assert.equal(byNumber(1).pool, 'D');
    assert.equal(byNumber(1).stageName, 'Pool D');
    assert.equal(byNumber(48).stageName, 'Semifinal');
    assert.equal(byNumber(49).stageName, '3° puesto');
    assert.equal(byNumber(50).stageName, 'Final');
    assert.equal(byNumber(50).pool, null);
});

test('los cruces sin rival definido no se descartan: se muestran como marcador de posición', () => {
    const semi = byNumber(48);
    assert.equal(semi.homeCode, null);
    assert.equal(semi.homeName, '1° Pool F');
    assert.equal(semi.awayName, '2° Pool E');

    const final = byNumber(50);
    assert.equal(final.homeName, 'Ganador 47');
    assert.equal(byNumber(49).homeName, 'Perdedor 47');
});

const pools = parseFihPoolsHtml(POOLS_HTML);

test('lee las tablas de grupos aunque no tengan tbody', () => {
    assert.equal(pools.length, 2);
    assert.equal(pools[0].name, 'Pool A');
    assert.equal(pools[1].name, 'Pool B');
    assert.equal(pools[0].rows.length, 2);
});

test('la fila de posiciones trae los números y el nombre en castellano', () => {
    const [argentina, netherlands] = pools[0].rows;
    assert.equal(argentina.rank, 1);
    assert.equal(argentina.team, 'Argentina');
    assert.equal(argentina.code, 'ARG');
    assert.equal(argentina.played, 2);
    assert.equal(argentina.goalsFor, 7);
    assert.equal(argentina.goalDifference, 5);
    assert.equal(argentina.points, 6);

    assert.equal(netherlands.teamEn, 'Netherlands');
    assert.equal(netherlands.team, 'Países Bajos');
    assert.equal(netherlands.teamUrl, 'https://fih.altiusrt.com/teams/8590');
});

test('la nota del grupo sale del caption cuando está', () => {
    assert.match(pools[0].note, /Points awarded for Wins: 3/);
    assert.equal(pools[1].note, '');
});

test('el mismo equipo se reconoce en las dos páginas y en los dos idiomas', () => {
    // La tabla de posiciones dice "Netherlands" y la fila del partido dice
    // "NED": tienen que resolver a la misma selección o el escudo y el id de
    // equipo salen distintos según la pantalla.
    assert.equal(fihTeamKey('Netherlands'), fihTeamKey('Países Bajos'));
    assert.equal(fihTeamKey('Netherlands'), 'NED');
    assert.equal(fihTeamKey('USA'), fihTeamKey('Estados Unidos'));
    assert.equal(fihTeamKey('GER'), fihTeamKey('Alemania'));
    // Un nombre desconocido no colapsa contra otro: cae a su propio slug.
    assert.equal(fihTeamKey('Ganador 47'), 'ganador-47');
    assert.notEqual(fihTeamKey('Ganador 47'), fihTeamKey('Ganador 48'));
});

const hotRow = (startsAtIso: string, state: 'scheduled' | 'live' | 'final') => ({
    ...matches[0],
    startsAtIso,
    state,
});

test('el fixture se relee cada 20 s mientras hay algo en juego', () => {
    const now = Date.parse('2026-08-15T12:00:00.000Z');
    assert.equal(fihRefreshTtlSeconds([hotRow('2026-08-15T11:00:00.000Z', 'live')], now), FIH_TTL_HOT_SECONDS);
});

test('la ventana caliente abre ANTES del inicio, no cuando la mesa marca el estado', () => {
    // 19:00 en la sede. A las 18:50 el estado todavía dice "Upcoming": si el TTL
    // fuera largo, el arranque se vería hasta dos minutos tarde.
    const kickoff = '2026-08-15T17:00:00.000Z';
    const tenMinutesBefore = Date.parse('2026-08-15T16:50:00.000Z');
    assert.equal(fihRefreshTtlSeconds([hotRow(kickoff, 'scheduled')], tenMinutesBefore), FIH_TTL_HOT_SECONDS);

    const twoHoursBefore = Date.parse('2026-08-15T15:00:00.000Z');
    assert.equal(fihRefreshTtlSeconds([hotRow(kickoff, 'scheduled')], twoHoursBefore), FIH_TTL_IDLE_SECONDS);
});

test('la ventana caliente cierra cuando el partido ya no puede seguir en juego', () => {
    const kickoff = '2026-08-15T17:00:00.000Z';
    const duringMatch = Date.parse('2026-08-15T18:00:00.000Z');
    assert.equal(fihRefreshTtlSeconds([hotRow(kickoff, 'scheduled')], duringMatch), FIH_TTL_HOT_SECONDS);

    const fourHoursLater = Date.parse('2026-08-15T21:00:00.000Z');
    assert.equal(fihRefreshTtlSeconds([hotRow(kickoff, 'scheduled')], fourHoursLater), FIH_TTL_IDLE_SECONDS);
});

test('un día sin partidos no castiga a Altius con un pedido cada 20 s', () => {
    const now = Date.parse('2026-08-12T12:00:00.000Z');
    assert.equal(fihRefreshTtlSeconds([], now), FIH_TTL_IDLE_SECONDS);
    // Un partido ya terminado tampoco mantiene la ventana abierta.
    assert.equal(
        fihRefreshTtlSeconds([hotRow('2026-08-12T11:30:00.000Z', 'final')], now),
        FIH_TTL_IDLE_SECONDS,
    );
});

test('sobre las filas parseadas de verdad, no sobre un objeto armado a mano', () => {
    const tresDiasAntes = Date.parse('2026-08-12T12:00:00.000Z');
    // Diez minutos antes del #4 (17/08 14:30 en la sede), que es el primero de
    // la tanda que todavía no se jugó: los dos primeros ya están "Official".
    const minutosAntesDelProximo = Date.parse('2026-08-17T12:20:00.000Z');

    // El fixture de arriba tiene el #3 "In Progress": un partido en juego manda
    // sobre el horario, aunque el reloj diga que falta una semana.
    assert.equal(fihRefreshTtlSeconds(matches, tresDiasAntes), FIH_TTL_HOT_SECONDS);

    // Sin ese partido: tres días antes no hay nada que refrescar rápido...
    const sinEnJuego = matches.filter((row) => row.state !== 'live');
    assert.equal(fihRefreshTtlSeconds(sinEnJuego, tresDiasAntes), FIH_TTL_IDLE_SECONDS);
    // ...y minutos antes del que viene, sí.
    assert.equal(fihRefreshTtlSeconds(sinEnJuego, minutosAntesDelProximo), FIH_TTL_HOT_SECONDS);
});

test('el reloj del partido en juego habla castellano', () => {
    assert.equal(fihLiveLabel('In Progress'), 'En juego');
    assert.equal(fihLiveLabel('Half Time'), 'Entretiempo');
    assert.equal(fihLiveLabel('Shoot-out'), 'Shoot-out');
    // Un estado que no conocemos se muestra tal cual: mejor el dato del origen
    // que una traducción inventada.
    assert.equal(fihLiveLabel('Q3'), 'Q3');
    assert.equal(fihLiveLabel(''), '');
});

test('los identificadores van y vuelven', () => {
    const id = toFihMatchId('m', '22334');
    assert.equal(id, 'fih-match-m-22334');
    assert.deepEqual(parseFihMatchId(id), { key: 'm', altiusId: '22334' });
    assert.equal(parseFihMatchId('fs-22334'), null);
    // Un id de FlashScore son 8 alfanuméricos sin guiones: nunca colisiona.
    assert.equal(parseFihMatchId('A1b2C3d4'), null);

    assert.equal(parseFihTournamentId(FIH_COMPETITIONS.m.tournamentId), 'm');
    assert.equal(parseFihTournamentId(FIH_COMPETITIONS.w.tournamentId), 'w');
    assert.equal(parseFihTournamentId('fih-wc-9999'), null);
    assert.equal(parseFihTournamentId('espn-soccer-league-fifa.world'), null);
});
