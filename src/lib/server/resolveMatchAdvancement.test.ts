import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMatchAdvancement } from './resolveMatchAdvancement.ts';

/**
 * Cuadro de 8 equipos en memoria: 4 cuartos -> 2 semis -> final. Lo que se
 * prueba es el comportamiento que pide el gestor al elegir llaves automáticas:
 * el ganador llega solo al cupo siguiente, un empate sin desempate no avanza a
 * nadie, y corregir un resultado ya cargado rehace la rama.
 */

type Row = Record<string, any>;

function fakeSupabase(matches: Map<string, Row>, rules: Row[]) {
  const query = (table: string) => {
    let filter: [string, unknown] | null = null;
    let patch: Row | null = null;
    const run = () => {
      const rows = table === 'matches' ? [...matches.values()] : rules;
      const hit = filter ? rows.filter((r) => r[filter![0]] === filter![1]) : rows;
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      return hit;
    };
    const api: any = {
      select: () => api,
      update: (p: Row) => {
        patch = p;
        return api;
      },
      eq: (col: string, val: unknown) => {
        filter = [col, val];
        return api;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
    };
    return api;
  };
  return { from: query } as any;
}

function bracket() {
  const m = (id: string, home: string | null, away: string | null): [string, Row] => [
    id,
    { id, status: 'scheduled', score: { home: 0, away: 0 }, home_club_id: home, away_club_id: away, is_visible: Boolean(home && away) },
  ];
  const matches = new Map<string, Row>([
    m('qf1', 'A', 'B'), m('qf2', 'C', 'D'), m('qf3', 'E', 'F'), m('qf4', 'G', 'H'),
    m('sf1', null, null), m('sf2', null, null), m('fin', null, null),
  ]);
  const rule = (s: string, t: string, slot: 'home' | 'away') => ({
    source_match_id: s, outcome: 'winner', target_match_id: t, target_slot: slot,
  });
  const rules = [
    rule('qf1', 'sf1', 'home'), rule('qf2', 'sf1', 'away'),
    rule('qf3', 'sf2', 'home'), rule('qf4', 'sf2', 'away'),
    rule('sf1', 'fin', 'home'), rule('sf2', 'fin', 'away'),
  ];
  return { matches, supabase: fakeSupabase(matches, rules) };
}

const play = (matches: Map<string, Row>, id: string, home: number, away: number, extra: Row = {}) =>
  Object.assign(matches.get(id)!, { status: 'final', score: { home, away, ...extra } });

test('el ganador de cada partido llega solo al cupo siguiente hasta la final', async () => {
  const { matches, supabase } = bracket();
  play(matches, 'qf1', 20, 10);
  await resolveMatchAdvancement(supabase, 'qf1');
  play(matches, 'qf2', 5, 15);
  await resolveMatchAdvancement(supabase, 'qf2');

  assert.equal(matches.get('sf1')!.home_club_id, 'A');
  assert.equal(matches.get('sf1')!.away_club_id, 'D');
  assert.equal(matches.get('sf1')!.is_visible, true);
  assert.equal(matches.get('sf2')!.is_visible, false, 'la otra semi sigue pendiente');

  play(matches, 'sf1', 30, 12);
  await resolveMatchAdvancement(supabase, 'sf1');
  assert.equal(matches.get('fin')!.home_club_id, 'A');
  assert.equal(matches.get('fin')!.away_club_id, null);
  assert.equal(matches.get('fin')!.is_visible, false);
});

test('un partido sin terminar no avanza a nadie', async () => {
  const { matches, supabase } = bracket();
  Object.assign(matches.get('qf1')!, { status: 'live', score: { home: 14, away: 7 } });
  await resolveMatchAdvancement(supabase, 'qf1');
  assert.equal(matches.get('sf1')!.home_club_id, null);
});

test('un empate sin desempate no elige ganador; con penales sí', async () => {
  const { matches, supabase } = bracket();
  play(matches, 'qf1', 10, 10);
  const res = await resolveMatchAdvancement(supabase, 'qf1');
  assert.equal(matches.get('sf1')!.home_club_id, null);
  assert.equal(res.warnings.length, 1);

  play(matches, 'qf1', 10, 10, { penalties: { home: 3, away: 5 } });
  await resolveMatchAdvancement(supabase, 'qf1');
  assert.equal(matches.get('sf1')!.home_club_id, 'B');
});

test('corregir un resultado ya cargado rehace la rama que dependía de él', async () => {
  const { matches, supabase } = bracket();
  play(matches, 'qf1', 20, 10);
  await resolveMatchAdvancement(supabase, 'qf1');
  play(matches, 'qf2', 15, 5);
  await resolveMatchAdvancement(supabase, 'qf2');
  play(matches, 'sf1', 30, 12);
  await resolveMatchAdvancement(supabase, 'sf1');
  assert.equal(matches.get('fin')!.home_club_id, 'A');

  // Se corrige el cuarto: ahora pasa B. La semi ya jugada pierde su resultado.
  play(matches, 'qf1', 10, 20);
  await resolveMatchAdvancement(supabase, 'qf1');

  const sf1 = matches.get('sf1')!;
  assert.equal(sf1.home_club_id, 'B');
  assert.equal(sf1.status, 'scheduled');
  assert.deepEqual(sf1.score, { home: 0, away: 0 });
  assert.equal(matches.get('fin')!.home_club_id, null, 'la final se vacía');
});
