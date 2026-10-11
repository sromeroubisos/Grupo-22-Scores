import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlacementBoard, buildPlacementTabs, parsePlacementStake, type RawPlacementMatch } from './placementBoard.ts';

/**
 * La fase final del Sudamericano de Seven se dibujaba como una llave: columnas
 * inventadas, la mitad de las definiciones recortadas y "TBD" en cada lado. Lo
 * que se prueba: los rótulos se leen, la fase se arma por lo que se juega, la
 * zona cuenta el cruce del sábado y una llave común sigue siendo llave.
 */

let seq = 0;
function m(label: string, hora: string, extra: Partial<RawPlacementMatch> = {}): RawPlacementMatch {
    seq += 1;
    return {
        id: `m${seq}`,
        date_time: `2026-10-11T${hora}:00Z`,
        status: 'scheduled',
        round_label: label,
        ...extra,
    };
}

const club = (id: string) => ({ id, name: id.toUpperCase(), logo_url: `/logos/${id}.png` });

test('los rótulos de definición se leen; los de llave no', () => {
    assert.deepEqual(parsePlacementStake('Final'), { kind: 'final' });
    assert.deepEqual(parsePlacementStake('3° puesto'), { kind: 'place', place: 3 });
    assert.deepEqual(parsePlacementStake('11º puesto'), { kind: 'place', place: 11 });
    assert.deepEqual(parsePlacementStake('Semifinal 9° puesto'), { kind: 'semi', place: 9 });
    assert.deepEqual(parsePlacementStake('Zona Oro'), { kind: 'pool', name: 'Zona Oro' });
    assert.equal(parsePlacementStake('Semifinal'), null);
    assert.equal(parsePlacementStake('Cuartos de final'), null);
    assert.equal(parsePlacementStake(''), null);
});

test('una llave común (semis, 3° y final) no se toca', () => {
    const board = buildPlacementBoard([
        m('Final', '20:00'), m('3° puesto', '19:00'), m('Semifinal', '15:00'), m('Semifinal', '16:00'),
    ]);
    assert.equal(board, null);
    // Final y 3° solos también son llave: falta algo propio de las definiciones.
    assert.equal(buildPlacementBoard([m('Final', '20:00'), m('3° puesto', '19:00')]), null);
});

test('el femenino: final, 3°, y el 5° y el 7° sueltos', () => {
    const board = buildPlacementBoard([
        m('7° puesto', '18:35', { home_source_label: '4º Grupo A', away_source_label: '4º Grupo B' }),
        m('5° puesto', '19:00'),
        m('3° puesto', '19:50'),
        m('Final', '20:15', { home_source_label: '1º Grupo A', away_source_label: '1º Grupo B' }),
    ]);
    assert.ok(board);
    assert.equal(board.final?.home.source, '1º Grupo A');
    assert.equal(board.third?.stake, '3° puesto');
    assert.deepEqual(board.singles.map((s) => s.place), [5, 7]);
    assert.equal(board.ladders.length, 0);
    assert.equal(board.pool, null);
});

test('el masculino: zona, escaleras del 5° y del 9°, y "Ganador P13" legible', () => {
    const board = buildPlacementBoard([
        m('Semifinal 9° puesto', '12:44', { bracket_match_code: 'P13' }),
        m('Semifinal 9° puesto', '13:09', { bracket_match_code: 'P14' }),
        m('Semifinal 5° puesto', '13:34', { bracket_match_code: 'P15' }),
        m('Semifinal 5° puesto', '13:59', { bracket_match_code: 'P16' }),
        m('Zona Oro', '14:24', { home_source_label: '1º Grupo B', away_source_label: '2º Grupo A' }),
        m('11° puesto', '16:36', { home_source_label: 'Perdedor P13', away_source_label: 'Perdedor P14' }),
        m('9° puesto', '17:01', { home_source_label: 'Ganador P13', away_source_label: 'Ganador P14' }),
        m('7° puesto', '18:10'),
        m('5° puesto', '19:25', { home_source_label: 'Ganador P15', away_source_label: 'Ganador P16' }),
        m('3° puesto', '20:40', { home_source_label: '3º Zona Oro', away_source_label: '4º Zona Oro' }),
        m('Final', '21:05', { home_source_label: '1º Zona Oro', away_source_label: '2º Zona Oro' }),
    ]);
    assert.ok(board);
    assert.equal(board.pool?.name, 'Zona Oro');
    assert.deepEqual(board.ladders.map((l) => [l.from, l.to, l.semis.length, l.finals.map((f) => f.place)]), [
        [5, 8, 2, [5, 7]],
        [9, 12, 2, [9, 11]],
    ]);
    assert.equal(board.singles.length, 0);
    const ninth = board.ladders[1].finals[0].match;
    assert.equal(ninth.home.source, 'Ganador semi 1');
    assert.equal(ninth.away.source, 'Ganador semi 2');
    assert.equal(board.ladders[1].finals[1].match.home.source, 'Perdedor semi 1');
    assert.equal(board.ladders[0].finals[0].match.home.source, 'Ganador semi 1');
});

test('la zona suma el cruce arrastrado del sábado y marca a dónde va cada uno', () => {
    const [arg, col, chi, uru] = ['arg', 'col', 'chi', 'uru'];
    const zona = [
        m('Zona Oro', '14:24', { status: 'final', score: { home: 19, away: 12 }, home_club_id: chi, away_club_id: col, home: club(chi), away: club(col) }),
        m('Zona Oro', '14:46', { status: 'final', score: { home: 40, away: 0 }, home_club_id: arg, away_club_id: uru, home: club(arg), away: club(uru) }),
        m('Zona Oro', '17:26', { home_club_id: uru, away_club_id: col, home: club(uru), away: club(col) }),
        m('Zona Oro', '17:48', { home_club_id: arg, away_club_id: chi, home: club(arg), away: club(chi) }),
        m('3° puesto', '20:40', { home_source_label: '3º Zona Oro', away_source_label: '4º Zona Oro' }),
        m('Final', '21:05', { home_source_label: '1º Zona Oro', away_source_label: '2º Zona Oro' }),
    ];
    const sabado = [
        // Arrastrados: mismo grupo, no se repiten el domingo.
        { id: 's1', date_time: '2026-10-10T20:26:00Z', status: 'final', score: { home: 33, away: 0 }, home_club_id: arg, away_club_id: col, home: club(arg), away: club(col) },
        { id: 's2', date_time: '2026-10-10T20:04:00Z', status: 'final', score: { home: 14, away: 21 }, home_club_id: chi, away_club_id: uru, home: club(chi), away: club(uru) },
        // De otro equipo: no entra.
        { id: 's3', date_time: '2026-10-10T17:00:00Z', status: 'final', score: { home: 50, away: 0 }, home_club_id: arg, away_club_id: 'par', home: club(arg), away: club('par') },
    ];
    const board = buildPlacementBoard(zona, sabado);
    assert.ok(board?.pool);
    assert.deepEqual(board.pool.carried.map((c) => c.id), ['s2', 's1']);
    const rows = board.pool.rows.map((r) => [r.teamId, r.played, r.won, r.pointsFor - r.pointsAgainst, r.destination]);
    assert.deepEqual(rows, [
        ['arg', 2, 2, 73, 'final'],
        ['chi', 2, 1, 0, 'final'],
        ['uru', 2, 1, -33, 'third'],
        ['col', 2, 0, -40, 'third'],
    ]);
});

test('antes de jugar, la zona muestra los orígenes y no promete destinos', () => {
    const board = buildPlacementBoard([
        m('Zona Oro', '14:24', { home_source_label: '1º Grupo B', away_source_label: '2º Grupo A' }),
        m('Zona Oro', '14:46', { home_source_label: '1º Grupo A', away_source_label: '2º Grupo B' }),
        m('Final', '21:05', { home_source_label: '1º Zona Oro', away_source_label: '2º Zona Oro' }),
    ]);
    assert.deepEqual(board?.pool?.rows.map((r) => [r.source, r.destination]), [
        ['1º Grupo A', null], ['1º Grupo B', null], ['2º Grupo A', null], ['2º Grupo B', null],
    ]);
});

test('ganador y perdedor sólo con el partido terminado; en vivo hay marcador sin veredicto', () => {
    const board = buildPlacementBoard([
        m('5° puesto', '19:25', { status: 'live', score: { home: 7, away: 0 }, home_club_id: 'a', away_club_id: 'b', home: club('a'), away: club('b') }),
        m('7° puesto', '18:10', { status: 'final', score: { home: 12, away: 17 }, home_club_id: 'c', away_club_id: 'd', home: club('c'), away: club('d') }),
        m('Final', '21:05'),
    ]);
    const fifth = board?.singles.find((s) => s.place === 5)?.match;
    const seventh = board?.singles.find((s) => s.place === 7)?.match;
    assert.equal(fifth?.status, 'live');
    assert.equal(fifth?.home.score, 7);
    assert.equal(fifth?.home.isWinner, false);
    assert.equal(seventh?.away.isWinner, true);
    assert.equal(seventh?.home.isLoser, true);
});

test('pestañas: la zona sola con su tabla y un cuadro por cada definición', () => {
    const board = buildPlacementBoard([
        m('Semifinal 9° puesto', '12:44', { bracket_match_code: 'P13' }),
        m('Semifinal 9° puesto', '13:09', { bracket_match_code: 'P14' }),
        m('Semifinal 5° puesto', '13:34', { bracket_match_code: 'P15' }),
        m('Semifinal 5° puesto', '13:59', { bracket_match_code: 'P16' }),
        m('Zona Oro', '14:24', { home_source_label: '1º Grupo B', away_source_label: '2º Grupo A' }),
        m('11° puesto', '16:36', { home_source_label: 'Perdedor P13', away_source_label: 'Perdedor P14' }),
        m('9° puesto', '17:01', { home_source_label: 'Ganador P13', away_source_label: 'Ganador P14' }),
        m('7° puesto', '18:10'),
        m('5° puesto', '19:25', { home_source_label: 'Ganador P15', away_source_label: 'Ganador P16' }),
        m('3° puesto', '20:40'),
        m('Final', '21:05'),
    ]);
    assert.ok(board);
    const tabs = buildPlacementTabs(board);
    assert.deepEqual(tabs.map((t) => [t.kind, t.label]), [
        ['pool', 'Zona Oro'],
        ['bracket', 'Por el título'],
        ['bracket', 'Por el 5° puesto'],
        ['bracket', 'Por el 9° puesto'],
    ]);
    const title = tabs[1];
    assert.equal(title.kind === 'bracket' && title.rounds.map((r) => r.name).join('|'), 'Final|3° puesto');
    const fifth = tabs[2];
    assert.equal(fifth.kind === 'bracket' && fifth.rounds.map((r) => r.name).join('|'), 'Semifinales|5° puesto|7° puesto');
    // Sin equipo, el cuadro dice de dónde sale; nunca queda vacío.
    const fifthMatch = fifth.kind === 'bracket' ? fifth.rounds[1].matches[0] : null;
    assert.equal(fifthMatch?.home_participant.participant_name, 'Ganador semi 1');
});

test('pestañas: el femenino arma el título y una pestaña con el 5° y el 7°, sin zona', () => {
    const board = buildPlacementBoard([
        m('7° puesto', '18:35'), m('5° puesto', '19:00'), m('3° puesto', '19:50'), m('Final', '20:15'),
    ]);
    assert.ok(board);
    const tabs = buildPlacementTabs(board);
    assert.deepEqual(tabs.map((t) => t.label), ['Por el título', 'Por el 5° y 7° puesto']);
});

test('pestañas: ganador y marcador pasan al cuadro sólo con el partido terminado', () => {
    const board = buildPlacementBoard([
        m('5° puesto', '19:25', { status: 'live', score: { home: 7, away: 0 }, home_club_id: 'a', away_club_id: 'b', home: club('a'), away: club('b') }),
        m('7° puesto', '18:10', { status: 'final', score: { home: 12, away: 17 }, home_club_id: 'c', away_club_id: 'd', home: club('c'), away: club('d') }),
        m('Final', '21:05'),
    ]);
    assert.ok(board);
    const tab = buildPlacementTabs(board).find((t) => t.id === 'puestos');
    assert.ok(tab && tab.kind === 'bracket');
    const [fifth, seventh] = tab.rounds.map((r) => r.matches[0]);
    assert.equal(fifth.winner_id, undefined);
    assert.equal(fifth.score_home, 7);
    assert.equal(seventh.winner_id, 'club:d');
    assert.equal(seventh.home_participant.image_path, '/logos/c.png');
});
