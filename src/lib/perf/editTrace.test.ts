import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  runWithEditTrace,
  isEditTraceEnabled,
  getEditStore,
  recordEditQuery,
  markEditTrace,
  appendEditTraceFact,
  traceStageStart,
  traceStageEnd,
  setEditTraceHttp,
} from './editTrace.ts';

// --- helpers -----------------------------------------------------------------

function installLogCapture() {
  const orig = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.log = orig;
    },
  };
}

function parseTrace(lines: string[], requestId?: string) {
  const matches = lines
    .filter((l) => l.startsWith('[EDIT_TRACE] '))
    .map((l) => JSON.parse(l.slice('[EDIT_TRACE] '.length)));
  if (requestId) return matches.find((m) => m.requestId === requestId) ?? null;
  return matches[0] ?? null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enable() {
  process.env.PERF_EDIT_TRACE = 'true';
}
function disable() {
  delete process.env.PERF_EDIT_TRACE;
}

// --- 1. Disabled => no-op passthrough, no log --------------------------------

test('1. disabled: no-op passthrough and emits nothing', async () => {
  disable();
  const cap = installLogCapture();
  try {
    assert.equal(isEditTraceEnabled(), false);
    const result = await runWithEditTrace({ label: 'x' }, async () => {
      // These must all be safe no-ops when disabled.
      recordEditQuery({ action: 'select', table: 't', durationMs: 10, rows: 1, ok: true });
      markEditTrace({ foo: 'bar' });
      traceStageStart('s');
      traceStageEnd('s');
      assert.equal(getEditStore(), undefined);
      return 99;
    });
    assert.equal(result, 99);
    assert.equal(parseTrace(cap.lines), null);
  } finally {
    cap.restore();
  }
});

// --- 2. Enabled: counts queries and stages -----------------------------------

test('2. enabled: counts queries, reads/writes/rpc and stages', async () => {
  enable();
  const cap = installLogCapture();
  try {
    await runWithEditTrace({ label: 'edit', requestId: 'r2' }, async () => {
      traceStageStart('ranking_sync');
      recordEditQuery({ action: 'select', table: 'matches', durationMs: 12, rows: 5, ok: true });
      recordEditQuery({ action: 'update', table: 'matches', durationMs: 8, rows: 1, ok: true });
      recordEditQuery({ action: 'insert', table: 'standings', durationMs: 3, rows: 4, ok: true });
      recordEditQuery({ action: 'rpc', table: 'delete_expired', durationMs: 2, rows: 0, ok: true });
      await delay(1);
      traceStageEnd('ranking_sync');
      markEditTrace({ rankingFullRebuild: true });
      setEditTraceHttp(200);
    });
    const t = parseTrace(cap.lines, 'r2');
    assert.ok(t);
    assert.equal(t.queries, 4);
    assert.equal(t.reads, 1);
    assert.equal(t.writes, 2); // update + insert
    assert.equal(t.rpc, 1);
    assert.equal(t.rowsRead, 5);
    assert.equal(t.rankingFullRebuild, true);
    assert.equal(t.httpStatus, 200);
    assert.equal(t.dbMs, 25);
    assert.ok(typeof t.stages.ranking_sync === 'number');
    assert.equal(t.avgObservedOpMs, Math.round(25 / 4));
  } finally {
    cap.restore();
    disable();
  }
});

// --- 3. No PII / secrets in the emitted line ---------------------------------

test('3. no tokens/PII survive in the emitted line', async () => {
  enable();
  const cap = installLogCapture();
  try {
    await assert.rejects(
      runWithEditTrace({ label: 'edit', requestId: 'r3' }, async () => {
        throw new Error(
          'db failed token=eyJsecretpayload99 Bearer supersecretvalue apikey=sb_secret_ABCDEF123456',
        );
      }),
    );
    const line = cap.lines.find((l) => l.startsWith('[EDIT_TRACE] ')) ?? '';
    assert.ok(line.length > 0);
    // Raw secret values must NOT appear.
    for (const secret of ['eyJsecretpayload99', 'supersecretvalue', 'sb_secret_ABCDEF123456']) {
      assert.ok(!line.includes(secret), `leaked secret: ${secret}`);
    }
    const t = parseTrace(cap.lines, 'r3');
    assert.equal(t.errored, true);
    assert.ok(t.errorClass); // classified
  } finally {
    cap.restore();
    disable();
  }
});

// --- 4. Concurrency isolation (AsyncLocalStorage) ----------------------------

test('4. two concurrent traces do not mix their metrics', async () => {
  enable();
  const cap = installLogCapture();
  try {
    const runA = runWithEditTrace({ label: 'A', requestId: 'rA' }, async () => {
      for (let i = 0; i < 3; i += 1) {
        recordEditQuery({ action: 'select', table: 'a', durationMs: 1, rows: 1, ok: true });
        await delay(1);
      }
    });
    const runB = runWithEditTrace({ label: 'B', requestId: 'rB' }, async () => {
      for (let i = 0; i < 7; i += 1) {
        recordEditQuery({ action: 'update', table: 'b', durationMs: 1, rows: 1, ok: true });
        await delay(1);
      }
    });
    await Promise.all([runA, runB]);
    const a = parseTrace(cap.lines, 'rA');
    const b = parseTrace(cap.lines, 'rB');
    assert.equal(a.queries, 3);
    assert.equal(a.reads, 3);
    assert.equal(a.writes, 0);
    assert.equal(b.queries, 7);
    assert.equal(b.writes, 7);
    assert.equal(b.reads, 0);
  } finally {
    cap.restore();
    disable();
  }
});

// --- 5. Exception closes the trace and marks errored -------------------------

test('5. an exception closes the trace with errored:true', async () => {
  enable();
  const cap = installLogCapture();
  try {
    await assert.rejects(
      runWithEditTrace({ label: 'e', requestId: 'r5' }, async () => {
        recordEditQuery({ action: 'select', table: 't', durationMs: 1, rows: 0, ok: true });
        throw new Error('Unauthorized');
      }),
    );
    const t = parseTrace(cap.lines, 'r5');
    assert.equal(t.errored, true);
    assert.equal(t.errorClass, 'unauthorized');
    assert.equal(t.queries, 1);
  } finally {
    cap.restore();
    disable();
  }
});

// --- 6. A failed stage does not leak into the next run -----------------------

test('6. failed stage: still emits, and a later run is clean', async () => {
  enable();
  const cap = installLogCapture();
  try {
    await assert.rejects(
      runWithEditTrace({ label: 'e', requestId: 'r6a' }, async () => {
        traceStageStart('ranking_sync'); // never ended (throws mid-stage)
        throw new Error('boom');
      }),
    );
    // traceStageEnd without a matching start is a safe no-op:
    traceStageEnd('never_started');
    await runWithEditTrace({ label: 'ok', requestId: 'r6b' }, async () => {
      traceStageStart('cache_invalidation');
      await delay(1);
      traceStageEnd('cache_invalidation');
    });
    const a = parseTrace(cap.lines, 'r6a');
    const b = parseTrace(cap.lines, 'r6b');
    assert.equal(a.errored, true);
    // Second run must NOT contain the first run's leaked stage.
    assert.equal(b.errored, false);
    assert.equal(b.stages.ranking_sync, undefined);
    assert.ok(typeof b.stages.cache_invalidation === 'number');
  } finally {
    cap.restore();
    disable();
  }
});

// --- 7. Transparency: exact return value / same error ------------------------

test('7a. returns the exact resolved value (no mutation)', async () => {
  enable();
  const cap = installLogCapture();
  try {
    const value = { x: 1, nested: { y: 2 } };
    const out = await runWithEditTrace({ label: 't' }, async () => value);
    assert.equal(out, value); // same reference
  } finally {
    cap.restore();
    disable();
  }
});

test('7b. rethrows the same error instance', async () => {
  enable();
  const cap = installLogCapture();
  try {
    const err = new Error('specific');
    await assert.rejects(
      runWithEditTrace({ label: 't' }, async () => {
        throw err;
      }),
      (thrown) => thrown === err,
    );
  } finally {
    cap.restore();
    disable();
  }
});

// --- 10. Large logs are bounded ----------------------------------------------

test('10. slowQueries and fact values are bounded', async () => {
  enable();
  process.env.PERF_EDIT_SLOW_QUERY_MS = '5';
  const cap = installLogCapture();
  try {
    await runWithEditTrace({ label: 'big', requestId: 'r10' }, async () => {
      for (let i = 0; i < 100; i += 1) {
        recordEditQuery({ action: 'select', table: 't', durationMs: 999, rows: 1, ok: true });
      }
      appendEditTraceFact('skippedDerived', 'ranking');
      markEditTrace({ huge: 'z'.repeat(1000) });
    });
    const t = parseTrace(cap.lines, 'r10');
    assert.equal(t.queries, 100);
    assert.ok(t.slowQueries <= 25, `slowQueries=${t.slowQueries}`);
    assert.ok(Array.isArray(t.slowTop) && t.slowTop.length <= 5);
    assert.ok(t.huge.length <= 201, `huge len=${t.huge.length}`);
    assert.deepEqual(t.skippedDerived, ['ranking']);
  } finally {
    cap.restore();
    delete process.env.PERF_EDIT_SLOW_QUERY_MS;
    disable();
  }
});

// --- 9. No static Node builtin import (client/Edge safety) --------------------

test('9. module does not statically import node:async_hooks', () => {
  const src = readFileSync(new URL('./editTrace.ts', import.meta.url), 'utf8');
  // Strip comments first: the doc comment intentionally mentions the builtin
  // as an example, which is not real code.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/import\s+[^;]*from\s+['"]node:async_hooks['"]/.test(code),
    'must not statically import node:async_hooks (would break client/Edge bundles)',
  );
  assert.ok(code.includes('getBuiltinModule'), 'should load the builtin lazily via getBuiltinModule');
});
