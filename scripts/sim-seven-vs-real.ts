// Real vs. simulado, torneo por torneo. La simulación se mide en ventanas del mismo largo que la historia real.
// Uso: npx tsx scripts/sim-seven-vs-real.ts [carreras] [temporadas]
import { advanceCareer, applyCareerContext, careerRound, createCareer, preseasonDone } from '../src/app/juegos/minijuegos/rugby-seven/career';
import { HOME_ADV, nextIsHome, nextOpponent, simulate } from '../src/app/juegos/minijuegos/rugby-seven/tours';
import { AR_CLUBS } from '../src/app/juegos/minijuegos/rugby-seven/arClubs';
import { realTitles } from '../src/app/juegos/minijuegos/rugby-seven/palmares';

const RUNS = Number(process.argv[2] ?? 6);
const SEASONS = Number(process.argv[3] ?? 40);
const KEYS = ['ar-urba-top14', 'ar-centro-top10', 'ar-noa-a', 'ar-litoral-top10', 'ar-pampeana-a', 'ar-patagonia-regional', 'nacional', 'tdiA', 'tdiB'];

type M = { distinct: number; repeat: number; top1: number; top2: number; avgReign: number; dyn: number };
function measure(seq: string[]): M {
  const reigns: number[] = []; let len = 0; let p = '';
  for (const c of seq) { if (c === p) len++; else { if (p) reigns.push(len); len = 1; p = c; } }
  if (p) reigns.push(len);
  const counts = new Map<string, number>(); for (const c of seq) counts.set(c, (counts.get(c) ?? 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  return { distinct: counts.size, repeat: seq.filter((c, i) => i > 0 && c === seq[i - 1]).length / Math.max(1, seq.length - 1),
    top1: sorted[0] / seq.length, top2: ((sorted[0] ?? 0) + (sorted[1] ?? 0)) / seq.length,
    avgReign: reigns.reduce((a, b) => a + b, 0) / reigns.length, dyn: reigns.filter((r) => r >= 3).reduce((a, b) => a + b, 0) / seq.length };
}
const mean = (ms: M[]): M => { const o: any = {}; for (const k of Object.keys(ms[0]) as (keyof M)[]) o[k] = ms.reduce((a, m) => a + m[k], 0) / ms.length; return o; };

const small = (AR_CLUBS as { id: string }[]).map((c) => c.id).filter((id) => id.startsWith('ar-')).slice(-1)[0];
const runs: Record<string, [number, string][]>[] = [];
for (let run = 0; run < RUNS; run++) {
  let s = createCareer(small, 'normal', 3);
  const start = s.career!.season;
  for (let g = 0; g < SEASONS * 40 && s.career!.season < start + SEASONS; g++) {
    if (s.career?.pre && (s.career.pre as { step?: string }).step !== 'listo') s = preseasonDone(s);
    for (let k = 0; k < 400 && !s.done && !s.eliminated; k++) { const o = nextOpponent(s); if (s.career) applyCareerContext(s.career); const ko = s.stage === 'ko'; const adv = ko ? 0 : nextIsHome(s) ? HOME_ADV : -HOME_ADV; s = careerRound(s, o ? simulate(s.me, o, ko, adv) : null); }
    s = advanceCareer(s);
  }
  runs.push(s.career!.champions ?? {});
}

const f = (v: number, pct = true) => (pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(1)).padStart(4);
let err = 0;
console.log('torneo                   años | distintos  real/sim | repite real/sim | top1 real/sim | top2 real/sim | en rachas 3+ real/sim');
for (const k of KEYS) {
  const real = realTitles(k).sort((a, b) => a.season - b.season).slice(-40).map((r) => r.club ?? r.name);
  const n = real.length;
  const sims: M[] = [];
  for (const c of runs) {
    const seq = (c[k] ?? []).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
    for (let i = 0; i + n <= seq.length; i += Math.max(1, Math.floor(n / 2))) sims.push(measure(seq.slice(i, i + n)));
  }
  if (!sims.length) continue;
  const r = measure(real); const s = mean(sims);
  err += Math.abs(r.repeat - s.repeat) + Math.abs(r.top1 - s.top1) + Math.abs(r.top2 - s.top2) * 0.5 + Math.abs(r.distinct - s.distinct) / n;
  console.log(`${k.padEnd(24)} ${String(n).padStart(3)} | ${f(r.distinct, false)} / ${f(s.distinct, false)}  | ${f(r.repeat)} / ${f(s.repeat)}     | ${f(r.top1)} / ${f(s.top1)}   | ${f(r.top2)} / ${f(s.top2)}   | ${f(r.dyn)} / ${f(s.dyn)}`);
}
console.log(`\nerror total (más bajo = más parecido a la historia): ${err.toFixed(2)}`);
