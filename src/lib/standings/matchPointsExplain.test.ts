import test from 'node:test';
import assert from 'node:assert/strict';
import { explainMatchPoints } from './matchPointsExplain.ts';
import type { MatchPointsRules } from './matchPointsCore.ts';

/**
 * El reglamento real de Super Rugby Americas 2026 (fase regular), tal como sale
 * de `settings.pointsSystem` + `settings.bonus`: 4/2/0, bonus por 4+ tries y
 * bonus por perder por 7 o menos. Los casos de abajo son partidos que están
 * cargados en el torneo, con los puntos que el motor ya guardó.
 */
const SRA: MatchPointsRules = {
  win: 4,
  draw: 2,
  loss: 0,
  shootoutWin: 0,
  shootoutLoss: 0,
  offensive: { threshold: 4, points: 1, metric: 'event_count', eventType: 'try', label: '4+ Tries' },
  defensive: { margin: 7, points: 1 },
};

const labels = (terms: { label: string }[]) => terms.map((t) => t.label);

test('goleada con bonus ofensivo: Capibaras XV 53-21 Yacaré XV (7 tries a 3)', () => {
  const out = explainMatchPoints('final', { home: 53, away: 21, homeTries: 7, awayTries: 3 }, SRA);

  assert.equal(out.home.base, 4);
  assert.equal(out.home.bonus, 1, 'siete tries pasan el umbral de cuatro');
  assert.equal(out.home.total, 5);
  assert.deepEqual(labels(out.home.terms), ['ganó · 4', '7 tries · +1']);

  assert.equal(out.away.total, 0);
  assert.deepEqual(labels(out.away.terms), [
    'perdió · 0',
    '3 tries · sin bonus',
    'perdió por 32 · sin bonus',
  ]);
});

test('la unidad es el sustantivo, no el nombre de la regla', () => {
  // La regla se llama "4+ Tries" en el catálogo. Si el label se usara como
  // unidad, acá se leería "7 4+ Tries · +1".
  const out = explainMatchPoints('final', { home: 53, away: 21, homeTries: 7, awayTries: 3 }, SRA);
  const offensive = out.home.terms.find((t) => t.id === 'offensive');
  assert.equal(offensive?.label, '7 tries · +1');
});

test('bonus defensivo: Dogos XV 21-19 Cobras Brasil XV (perdió por 2)', () => {
  const out = explainMatchPoints('final', { home: 21, away: 19, homeTries: 3, awayTries: 1 }, SRA);

  assert.equal(out.home.total, 4, 'el ganador no toma bonus defensivo');
  assert.equal(out.away.base, 0);
  assert.equal(out.away.bonus, 1);
  assert.equal(out.away.total, 1);
  assert.deepEqual(labels(out.away.terms), [
    'perdió · 0',
    '1 tries · sin bonus',
    'perdió por 2 · +1',
  ]);
  // El que gana no puede tener término defensivo: no perdió por nada.
  assert.equal(out.home.terms.some((t) => t.id === 'defensive'), false);
});

test('empate con bonus de un solo lado: Yacaré XV 25-25 Cobras Brasil XV (3 tries a 4)', () => {
  const out = explainMatchPoints('final', { home: 25, away: 25, homeTries: 3, awayTries: 4 }, SRA);

  assert.equal(out.home.total, 2);
  assert.equal(out.away.total, 3, 'Cobras se lleva el bonus por sus cuatro tries');
  assert.deepEqual(labels(out.home.terms), ['empató · 2', '3 tries · sin bonus']);
  assert.deepEqual(labels(out.away.terms), ['empató · 2', '4 tries · +1']);
  // Nadie perdió: no corresponde término defensivo para ninguno.
  assert.equal(out.home.terms.some((t) => t.id === 'defensive'), false);
  assert.equal(out.away.terms.some((t) => t.id === 'defensive'), false);
});

test('sin tries cargados el bonus ofensivo no se inventa', () => {
  // 34 de los 59 partidos del torneo se cargaron sin tries. El bonus no puede
  // salir de la nada: se cuenta cero y el término lo dice.
  const out = explainMatchPoints('final', { home: 59, away: 0 }, SRA);
  assert.equal(out.home.bonus, 0, 'una goleada sin tries cargados no da bonus');
  assert.equal(out.home.total, 4);
  assert.deepEqual(labels(out.home.terms), ['ganó · 4', '0 tries · sin bonus']);
});

test('un partido que no está finalizado no reparte puntos ni términos', () => {
  const out = explainMatchPoints('scheduled', { home: 53, away: 21, homeTries: 7, awayTries: 3 }, SRA);
  assert.equal(out.home.total, 0);
  assert.equal(out.away.total, 0);
  assert.deepEqual(out.home.terms, []);
  assert.deepEqual(out.away.terms, []);
});

test('empate definido por penales, cuando el reglamento los puntúa', () => {
  const conShootout: MatchPointsRules = { ...SRA, shootoutWin: 3, shootoutLoss: 1 };
  const out = explainMatchPoints(
    'final',
    { home: 25, away: 25, homeTries: 3, awayTries: 2, penalties: { home: 5, away: 4 } },
    conShootout,
  );

  assert.equal(out.resolvedByShootout, true);
  assert.equal(out.home.base, 3);
  assert.equal(out.away.base, 1);
  assert.deepEqual(labels(out.home.terms), ['ganó en penales · 3', '3 tries · sin bonus']);
  assert.deepEqual(labels(out.away.terms), ['perdió en penales · 1', '2 tries · sin bonus']);
});

test('cargar penales sin que el reglamento los puntúe deja el empate en pie', () => {
  // Super Rugby Americas tiene shootout 0/0. El partido se resuelve por
  // penales, pero el ganador no suma más que el perdedor: no hay que fingir
  // una victoria que la tabla no va a ver.
  const out = explainMatchPoints(
    'final',
    { home: 25, away: 25, homeTries: 3, awayTries: 2, penalties: { home: 5, away: 4 } },
    SRA,
  );
  assert.equal(out.resolvedByShootout, true);
  assert.equal(out.home.base, 0);
  assert.equal(out.away.base, 0);
});

test('un torneo sin bonus configurado no muestra términos de bonus', () => {
  const simple: MatchPointsRules = {
    win: 3, draw: 1, loss: 0, shootoutWin: null, shootoutLoss: null,
    offensive: null, defensive: null,
  };
  const out = explainMatchPoints('final', { home: 40, away: 5, homeTries: 6, awayTries: 0 }, simple);
  assert.equal(out.home.total, 3);
  assert.deepEqual(labels(out.home.terms), ['ganó · 3']);
  assert.deepEqual(labels(out.away.terms), ['perdió · 0']);
});

test('los términos y el total salen del mismo cálculo', () => {
  // El invariante que hace que la tarjeta no pueda mentir: lo que suman los
  // términos activos tiene que ser exactamente el total que se guarda.
  const casos: Array<[number, number, number, number]> = [
    [53, 21, 7, 3],
    [21, 19, 3, 1],
    [25, 25, 3, 4],
    [59, 0, 9, 0],
    [34, 32, 5, 5],
  ];

  for (const [home, away, homeTries, awayTries] of casos) {
    const out = explainMatchPoints('final', { home, away, homeTries, awayTries }, SRA);
    for (const side of [out.home, out.away]) {
      const sumado = side.terms
        .filter((t) => t.active)
        .reduce((acc, t) => {
          const n = Number(t.label.split('·').pop()?.trim().replace('+', ''));
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);
      assert.equal(sumado, side.total, `${home}-${away}: los términos dicen ${sumado} y el total es ${side.total}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Bonus ofensivo por DIFERENCIA de tries (World Rugby 2016: 3-0, 4-1, 5-2).
// Es un modo de la misma regla; cambia la cuenta y cambia la frase, que ahora
// tiene que nombrar al rival porque el rival ES la cuenta.
// ---------------------------------------------------------------------------

const WORLD_RUGBY: MatchPointsRules = {
  ...SRA,
  offensive: { threshold: 3, points: 1, metric: 'event_count', eventType: 'try', label: 'tries', mode: 'difference' },
};

test('por diferencia: 4 tries a 1 cobra y la frase nombra al rival', () => {
  const out = explainMatchPoints('final', { home: 30, away: 10, homeTries: 4, awayTries: 1 }, WORLD_RUGBY);

  assert.equal(out.home.bonus, 1);
  assert.deepEqual(labels(out.home.terms), ['ganó · 4', '4 tries a 1 · +1']);
  assert.equal(out.away.bonus, 0);
  assert.deepEqual(labels(out.away.terms), ['perdió · 0', '1 tries a 4 · sin bonus', 'perdió por 20 · sin bonus']);
});

test('por diferencia: 4 tries a 2 no cobra aunque el clásico sí lo daría', () => {
  const s = { home: 28, away: 14, homeTries: 4, awayTries: 2 };
  const clasico = explainMatchPoints('final', s, SRA);
  const diferencia = explainMatchPoints('final', s, WORLD_RUGBY);

  assert.equal(clasico.home.bonus, 1);
  assert.equal(diferencia.home.bonus, 0);
  assert.deepEqual(labels(diferencia.home.terms), ['ganó · 4', '4 tries a 2 · sin bonus']);
});

test('por diferencia: 3 tries a 0 cobra, y el clásico no', () => {
  const s = { home: 21, away: 0, homeTries: 3, awayTries: 0 };
  assert.equal(explainMatchPoints('final', s, SRA).home.bonus, 0);
  const out = explainMatchPoints('final', s, WORLD_RUGBY);
  assert.equal(out.home.bonus, 1);
  assert.deepEqual(labels(out.home.terms), ['ganó · 4', '3 tries a 0 · +1']);
});

test('por diferencia: un 4-4 no le da bonus a nadie', () => {
  const out = explainMatchPoints('final', { home: 28, away: 28, homeTries: 4, awayTries: 4 }, WORLD_RUGBY);
  assert.equal(out.home.bonus, 0);
  assert.equal(out.away.bonus, 0);
  assert.deepEqual(labels(out.home.terms), ['empató · 2', '4 tries a 4 · sin bonus']);
});
