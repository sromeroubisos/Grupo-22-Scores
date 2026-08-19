import test from 'node:test';
import assert from 'node:assert/strict';
import { isDerivedRecalcSkipped, __resetLabFlagWarningForTest } from './labFlags.ts';

const LAB_ENV = [
  'PERF_TEST_SKIP_MATCH_DERIVED_RECALCULATIONS',
  'PERF_TEST_SKIP_RANKING',
  'PERF_TEST_SKIP_STANDINGS',
  'PERF_TEST_SKIP_ADVANCEMENT',
  'PERF_TEST_SKIP_RESEED',
  'PERF_TEST_SKIP_CACHE',
];

function clearLabEnv() {
  for (const k of LAB_ENV) delete process.env[k];
  __resetLabFlagWarningForTest();
}

test('off by default => not skipped (normal behavior preserved)', () => {
  clearLabEnv();
  process.env.NODE_ENV = 'development';
  for (const p of ['ranking', 'standings', 'advancement', 'reseed', 'cache'] as const) {
    assert.equal(isDerivedRecalcSkipped(p), false);
  }
});

test('master flag skips all derived processes (non-production)', () => {
  clearLabEnv();
  process.env.NODE_ENV = 'development';
  process.env.PERF_TEST_SKIP_MATCH_DERIVED_RECALCULATIONS = 'true';
  for (const p of ['ranking', 'standings', 'advancement', 'reseed', 'cache'] as const) {
    assert.equal(isDerivedRecalcSkipped(p), true);
  }
  clearLabEnv();
});

test('individual flag only affects its own process', () => {
  clearLabEnv();
  process.env.NODE_ENV = 'test';
  process.env.PERF_TEST_SKIP_RANKING = 'true';
  assert.equal(isDerivedRecalcSkipped('ranking'), true);
  assert.equal(isDerivedRecalcSkipped('standings'), false);
  assert.equal(isDerivedRecalcSkipped('advancement'), false);
  clearLabEnv();
});

test('IGNORED in production even if the flag is set, and warns once', () => {
  clearLabEnv();
  process.env.NODE_ENV = 'production';
  process.env.PERF_TEST_SKIP_MATCH_DERIVED_RECALCULATIONS = 'true';

  const origWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    assert.equal(isDerivedRecalcSkipped('ranking'), false);
    assert.equal(isDerivedRecalcSkipped('standings'), false);
    // Warned exactly once (latched), and the warning has no env values.
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('IGNORADO'));
    assert.ok(!warnings[0].includes('true'));
  } finally {
    console.warn = origWarn;
    process.env.NODE_ENV = 'test';
    clearLabEnv();
  }
});
