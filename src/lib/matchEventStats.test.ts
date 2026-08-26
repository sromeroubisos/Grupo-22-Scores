import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMatchTimelineEventDescription, isGoalKickMade, isGoalKickAttemptEvent } from './matchEventStats.ts';

/**
 * Un tiro a los palos errado NO puede sumar puntos.
 *
 * El detalle es texto libre, asi que la unica defensa es el vocabulario. El
 * original entendia seis formas de decir "fallo" y nada mas: "desviada",
 * "afuera", "al palo" o "erro" sin tilde pasaban como convertidas y sumaban
 * 2 o 3 puntos al marcador.
 */

const MISSED = [
  '[palos:miss]',
  'fallada',
  'fallado',
  'fallo',
  'falló',
  'errada',
  'erro',
  'erró',
  'no convertida',
  'sin convertir',
  'no entro',
  'missed',
  'wide',
  'no good',
  'desviada',
  'desviado',
  'afuera',
  'fuera',
  'al palo',
  'poste',
  'travesaño',
  'travesano',
  'corta',
];

for (const detail of MISSED) {
  test(`conversion "${detail}" no suma`, () => {
    assert.equal(isGoalKickMade('conversion', detail), false);
  });
}

const MADE = ['[palos:ok]', 'convertida', 'acertada', 'made', 'ok', 'buena', 'adentro'];

for (const detail of MADE) {
  test(`conversion "${detail}" suma`, () => {
    assert.equal(isGoalKickMade('conversion', detail), true);
  });
}

test('el prefijo del asistente le gana al texto libre', () => {
  // La consola estampa el prefijo; si ademas quedo una nota contradictoria,
  // manda el prefijo.
  assert.equal(isGoalKickMade('conversion', '[palos:miss] | convertida'), false);
  assert.equal(isGoalKickMade('conversion', '[palos:ok] | desviada'), true);
});

test('los acentos no cambian el resultado', () => {
  // Quien carga desde el celular en la cancha no pone tildes.
  assert.equal(isGoalKickMade('penalty_goal', 'erró'), isGoalKickMade('penalty_goal', 'erro'));
  assert.equal(isGoalKickMade('drop_goal', 'desvió'), isGoalKickMade('drop_goal', 'desvio'));
});

test('el nombre del pateador no cuenta como fallo', () => {
  // Es el caso que impide endurecer el default: un detalle con solo el nombre
  // del kicker tiene que seguir sumando.
  assert.equal(isGoalKickMade('conversion', 'Nicolas Sanchez'), true);
  assert.equal(isGoalKickMade('drop_goal', 'Sanchez'), true);
});

test('"a los palos" es el nombre de la jugada, no un fallo', () => {
  // El limite de palabra de `\bal palo\b` existe por esto.
  assert.equal(isGoalKickMade('penalty_goal', 'patea a los palos'), true);
});

test('sin detalle se asume convertida, y es una decision, no un olvido', () => {
  // Endurecer esto le bajaria el marcador a todo partido historico cargado
  // antes de que existiera el prefijo. Se cambia junto con una migracion de
  // los eventos, no antes.
  assert.equal(isGoalKickMade('conversion', ''), true);
  assert.equal(isGoalKickMade('penalty_goal', ''), true);
  assert.equal(isGoalKickMade('drop_goal', ''), true);
});

test('`penalty` asume errado ante cualquier texto que no reconoce', () => {
  // Es el unico tipo con esta regla y se conserva: no hay un evento aparte
  // para el penal fallado, asi que equivocarse hacia no-sumar es mas barato
  // que inventar tres puntos.
  assert.equal(isGoalKickMade('penalty', 'cualquier cosa'), false);
  assert.equal(isGoalKickMade('penalty', ''), true);
});

test('un evento que no es tiro a los palos siempre cuenta', () => {
  // El try no se "falla": si esta cargado, paso.
  assert.equal(isGoalKickMade('try', 'lo que sea'), true);
  assert.equal(isGoalKickMade('goal', 'desviada'), true);
});

test('el penal jugado al touch no es un tiro a los palos', () => {
  assert.equal(isGoalKickAttemptEvent({ type: 'penalty', detail: 'al touch' }), false);
  assert.equal(isGoalKickAttemptEvent({ type: 'penalty', detail: 'tap' }), false);
  assert.equal(isGoalKickAttemptEvent({ type: 'penalty', detail: 'a los palos' }), true);
});

/*
 * La marca del desenlace ([res:goal]) es para el motor. En la cronologia, el
 * PDF y la ficha publica se lee el rotulo que viene escrito al lado.
 */
test('la descripcion de la cronologia no muestra la marca del desenlace', () => {
  const event = { type: 'penalty_corner', playerName: 'Perez', secondaryPlayerName: '', detail: '[res:goal] Gol | tiro a la base', minute: 12 };
  assert.equal(formatMatchTimelineEventDescription(event, [event], 0, ''), 'Perez · Gol | tiro a la base');
});
