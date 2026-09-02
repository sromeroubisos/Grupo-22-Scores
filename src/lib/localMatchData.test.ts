import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalPlayerStatsRows, normalizeLocalLineups, type LocalPublicEvent } from './localMatchData.ts';

/**
 * La fila del jugador en la pagina del partido cuenta los puntos igual que el
 * marcador: un tiro a los palos errado no suma. Antes la tabla fija por tipo
 * le daba 2 puntos a una conversion fallada y 3 a un penal desviado.
 */

function event(partial: Partial<LocalPublicEvent> & { type: string }): LocalPublicEvent {
  return {
    id: partial.id ?? `${partial.type}-${partial.description ?? ''}`,
    time: 10,
    minute: 10,
    team: 'home',
    player: 'Pateador',
    playerId: 'p1',
    subPlayer: null,
    subPlayerId: null,
    description: '',
    period: 'first_half',
    order: 1,
    ...partial,
  };
}

function pointsFor(events: LocalPublicEvent[]) {
  const rows = buildLocalPlayerStatsRows({
    lineups: normalizeLocalLineups(null),
    events,
    homeName: 'Local',
    awayName: 'Visita',
    sportId: 'rugby',
  });
  return rows.find((row) => row.playerId === 'p1')?.points ?? 0;
}

test('una conversion errada no le suma puntos al pateador', () => {
  assert.equal(pointsFor([event({ type: 'conversion', description: '[palos:miss]' })]), 0);
  assert.equal(pointsFor([event({ type: 'conversion', description: 'fallada' })]), 0);
  assert.equal(pointsFor([event({ type: 'conversion', description: '[palos:ok]' })]), 2);
});

test('un penal errado o a touch no suma; el convertido suma 3', () => {
  assert.equal(pointsFor([event({ type: 'penalty_goal', description: '[palos:miss]' })]), 0);
  assert.equal(pointsFor([event({ type: 'penalty', description: 'desviado' })]), 0);
  assert.equal(pointsFor([event({ type: 'penalty', description: 'a touch' })]), 0);
  assert.equal(pointsFor([event({ type: 'penalty_goal', description: '[palos:ok]' })]), 3);
  assert.equal(pointsFor([event({ type: 'drop_goal', description: 'al palo' })]), 0);
});

test('el try sigue sumando 5 y el total del jugador combina solo lo que entro', () => {
  const total = pointsFor([
    event({ id: 'a', type: 'try' }),
    event({ id: 'b', type: 'conversion', description: '[palos:miss]' }),
    event({ id: 'c', type: 'penalty_goal', description: '[palos:ok]' }),
  ]);
  assert.equal(total, 8);
});
