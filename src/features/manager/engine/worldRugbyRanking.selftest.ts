// Self-tests del algoritmo World Rugby Ranking.
//
// Sin framework de tests externo: exportamos `runSelfTests()` que devuelve
// un reporte estructurado. Se invoca manualmente desde la consola del
// navegador o desde el Editor durante validación.
//
// Casos cubiertos (referencia: documento de diseño 2026-05):
//   1. Gales 76.92 (local) vs Escocia 76.36 — Gales gana ≤15 → 77.56 / 75.72
//   2. Mismo enfrentamiento, empate 20-20 → Gales 76.56 / Escocia 76.72
//   3. Mismo enfrentamiento, Escocia gana ≤15 → Escocia 77.72 / Gales 75.56
//   4. RWC neutral con upset por ≥16: 84 vs 82, underdog gana → 80.40 / 85.60
//   5. Outsider rule: favorito >10pts gana como predicho → flow 0
//   6. Outsider rule NO aplica en upset (incluso si gap > 10)
//   7. Margen boundary: exactamente 15 (close) vs 16 (big)
//   8. Suma cero invariant: |homeDelta + awayDelta| < 0.01
//   9. Empate con gap=0 → sin redistribución
//  10. RWC double impact: deltas regulares × 2 (mismo escenario)

import { applyTestResult } from './worldRugbyRanking.ts'

interface TestCase {
  name: string
  passed: boolean
  detail: string
}

function approx(a: number, b: number, tol = 0.005): boolean {
  return Math.abs(a - b) < tol
}

function check(
  name: string,
  predicate: () => { ok: boolean; detail: string }
): TestCase {
  try {
    const { ok, detail } = predicate()
    return { name, passed: ok, detail }
  } catch (e) {
    return { name, passed: false, detail: `excepción: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export interface SelfTestReport {
  passed: number
  failed: number
  total: number
  cases: TestCase[]
}

export function runSelfTests(): SelfTestReport {
  const cases: TestCase[] = []

  // Caso 1: Gales (76.92, local) vs Escocia (76.36). Gales gana 23-17.
  cases.push(check('Gales gana en casa por 6 (≤15) → +0.64 / -0.64', () => {
    const out = applyTestResult({
      homeCountryId: 'WAL', awayCountryId: 'SCO',
      homeScore: 23, awayScore: 17,
      homeBefore: 76.92, awayBefore: 76.36,
      isRWC: false
    })
    const okPoints = approx(out.homeAfter, 77.56) && approx(out.awayAfter, 75.72)
    const okDeltas = approx(out.homeDelta, 0.64) && approx(out.awayDelta, -0.64)
    const okFlavor = out.flavor === 'routine'
    return {
      ok: okPoints && okDeltas && okFlavor,
      detail: `home ${out.homeAfter} (Δ${out.homeDelta}), away ${out.awayAfter} (Δ${out.awayDelta}), flavor=${out.flavor}`
    }
  }))

  // Caso 2: Empate 20-20.
  cases.push(check('Empate Gales-Escocia → favorito cede 0.36 al underdog', () => {
    const out = applyTestResult({
      homeCountryId: 'WAL', awayCountryId: 'SCO',
      homeScore: 20, awayScore: 20,
      homeBefore: 76.92, awayBefore: 76.36,
      isRWC: false
    })
    const okPoints = approx(out.homeAfter, 76.56) && approx(out.awayAfter, 76.72)
    const okDeltas = approx(out.homeDelta, -0.36) && approx(out.awayDelta, 0.36)
    const okFlavor = out.flavor === 'draw'
    return {
      ok: okPoints && okDeltas && okFlavor,
      detail: `home ${out.homeAfter} (Δ${out.homeDelta}), away ${out.awayAfter} (Δ${out.awayDelta}), flavor=${out.flavor}`
    }
  }))

  // Caso 3: Escocia gana 17-16 en Cardiff (upset cerrado).
  cases.push(check('Escocia gana en Cardiff por 1 → upset, +1.36 al visitante', () => {
    const out = applyTestResult({
      homeCountryId: 'WAL', awayCountryId: 'SCO',
      homeScore: 16, awayScore: 17,
      homeBefore: 76.92, awayBefore: 76.36,
      isRWC: false
    })
    const okPoints = approx(out.homeAfter, 75.56) && approx(out.awayAfter, 77.72)
    const okDeltas = approx(out.homeDelta, -1.36) && approx(out.awayDelta, 1.36)
    const okFlavor = out.flavor === 'upset'
    return {
      ok: okPoints && okDeltas && okFlavor,
      detail: `home ${out.homeAfter} (Δ${out.homeDelta}), away ${out.awayAfter} (Δ${out.awayDelta}), flavor=${out.flavor}`
    }
  }))

  // Caso 4: RWC en sede neutral. Underdog 82 derrota a favorito 84 por ≥16.
  cases.push(check('RWC neutral upset por ≥16: 84 vs 82, underdog gana → 80.40 / 85.60', () => {
    const out = applyTestResult({
      homeCountryId: 'FAV', awayCountryId: 'UND',
      homeScore: 10, awayScore: 30,        // underdog (away) gana por 20 (≥16)
      homeBefore: 84.00, awayBefore: 82.00,
      isRWC: true, isNeutral: true
    })
    const okPoints = approx(out.homeAfter, 80.40) && approx(out.awayAfter, 85.60)
    const okDeltas = approx(out.homeDelta, -3.6) && approx(out.awayDelta, 3.6)
    const okFlavor = out.flavor === 'rwc_upset'
    return {
      ok: okPoints && okDeltas && okFlavor,
      detail: `home ${out.homeAfter} (Δ${out.homeDelta}), away ${out.awayAfter} (Δ${out.awayDelta}), flavor=${out.flavor}`
    }
  }))

  // Caso 5: Outsider rule. Favorito 90 (neutral) vs underdog 75, gap=15. Fav gana 30-20.
  cases.push(check('Outsider rule: favorito |gap|=15 gana como predicho → flow 0', () => {
    const out = applyTestResult({
      homeCountryId: 'BIG', awayCountryId: 'SMALL',
      homeScore: 30, awayScore: 20,
      homeBefore: 90, awayBefore: 75,
      isRWC: false, isNeutral: true       // sin +3, gap = 15
    })
    const okFlow = approx(out.homeDelta, 0) && approx(out.awayDelta, 0)
    const okFlavor = out.flavor === 'outsider_zero'
    return {
      ok: okFlow && okFlavor,
      detail: `home Δ${out.homeDelta}, away Δ${out.awayDelta}, flavor=${out.flavor}`
    }
  }))

  // Caso 6: Outsider rule NO aplica en upset. Misma diferencia, pero underdog gana.
  cases.push(check('Upset con |gap|=15 NO bloqueado por outsider rule', () => {
    const out = applyTestResult({
      homeCountryId: 'BIG', awayCountryId: 'SMALL',
      homeScore: 18, awayScore: 25,        // underdog gana por 7 (close)
      homeBefore: 90, awayBefore: 75,
      isRWC: false, isNeutral: true
    })
    // raw = (10+15)*0.1 = 2.5, capped a 2.0
    const okFlow = approx(out.awayDelta, 2.0) && approx(out.homeDelta, -2.0)
    const okFlavor = out.flavor === 'upset'
    return {
      ok: okFlow && okFlavor,
      detail: `home Δ${out.homeDelta}, away Δ${out.awayDelta}, flavor=${out.flavor}`
    }
  }))

  // Caso 7: Margen exactamente 15 → bucket close; margen 16 → big.
  cases.push(check('Margen 15 usa bucket close', () => {
    const out = applyTestResult({
      homeCountryId: 'A', awayCountryId: 'B',
      homeScore: 30, awayScore: 15,        // diff = 15
      homeBefore: 80, awayBefore: 80,
      isRWC: false, isNeutral: true
    })
    // gap = 0, favorito = home (gapSigned=0 → home not strict fav, pero algorithm trata
    // gapSigned >0 como home fav; gapSigned===0 lo trata como home NO fav).
    // homeWon=true, homeWasFav=false (gapSigned=0) → ¡upset!? No: con gap 0
    // ambos son iguales; usaremos coef close: raw=(10+0)*0.1=1, cap 2 → 1.
    // O bien con homeWasFav=false y homeWon=true → upset close: raw=(10+0)*0.1=1.
    // En la práctica: con gap 0 + close, flow = 1.
    const okFlow = approx(Math.abs(out.homeDelta), 1.0)
    return {
      ok: okFlow,
      detail: `home Δ${out.homeDelta}, away Δ${out.awayDelta} (esperado |Δ|=1.0)`
    }
  }))

  cases.push(check('Margen 16 usa bucket big (coef 0.15)', () => {
    const out = applyTestResult({
      homeCountryId: 'A', awayCountryId: 'B',
      homeScore: 30, awayScore: 14,        // diff = 16
      homeBefore: 80, awayBefore: 80,
      isRWC: false, isNeutral: true
    })
    // gap 0, big: raw = (10-0)*0.15 = 1.5 (favorite win) o (10+0)*0.15 = 1.5 (upset),
    // ambos coinciden en valor con gap=0. Esperado |Δ|=1.5.
    const okFlow = approx(Math.abs(out.homeDelta), 1.5)
    return {
      ok: okFlow,
      detail: `home Δ${out.homeDelta}, away Δ${out.awayDelta} (esperado |Δ|=1.5)`
    }
  }))

  // Caso 8: Suma cero invariant en varios escenarios aleatorios.
  cases.push(check('Suma cero: |homeDelta + awayDelta| < 0.01 en todos los escenarios', () => {
    const scenarios = [
      { home: 85, away: 78, hs: 28, as: 15, rwc: false, neut: false },
      { home: 70, away: 82, hs: 30, as: 24, rwc: false, neut: false },
      { home: 88, away: 88, hs: 20, as: 20, rwc: true, neut: true },
      { home: 92, away: 60, hs: 50, as: 0, rwc: true, neut: false },
      { home: 75, away: 75, hs: 12, as: 12, rwc: false, neut: true }
    ]
    const failures: string[] = []
    for (const s of scenarios) {
      const out = applyTestResult({
        homeCountryId: 'H', awayCountryId: 'A',
        homeScore: s.hs, awayScore: s.as,
        homeBefore: s.home, awayBefore: s.away,
        isRWC: s.rwc, isNeutral: s.neut
      })
      const sum = out.homeDelta + out.awayDelta
      if (Math.abs(sum) > 0.01) {
        failures.push(`escenario ${JSON.stringify(s)} → sum=${sum}`)
      }
    }
    return {
      ok: failures.length === 0,
      detail: failures.length === 0 ? 'todos los escenarios mantienen suma cero' : failures.join('; ')
    }
  }))

  // Caso 9: Empate con gap=0 → flow 0.
  cases.push(check('Empate con gap=0 (mismo rating + neutral) → flow 0', () => {
    const out = applyTestResult({
      homeCountryId: 'A', awayCountryId: 'B',
      homeScore: 20, awayScore: 20,
      homeBefore: 80, awayBefore: 80,
      isRWC: false, isNeutral: true
    })
    const okFlow = approx(out.homeDelta, 0) && approx(out.awayDelta, 0)
    const okFlavor = out.flavor === 'draw'
    return {
      ok: okFlow && okFlavor,
      detail: `home Δ${out.homeDelta}, away Δ${out.awayDelta}, flavor=${out.flavor}`
    }
  }))

  // Caso 10: RWC duplica respecto del test regular (mismo escenario que caso 1).
  cases.push(check('RWC duplica intercambio respecto del test regular', () => {
    const regular = applyTestResult({
      homeCountryId: 'WAL', awayCountryId: 'SCO',
      homeScore: 23, awayScore: 17,
      homeBefore: 76.92, awayBefore: 76.36,
      isRWC: false
    })
    const rwc = applyTestResult({
      homeCountryId: 'WAL', awayCountryId: 'SCO',
      homeScore: 23, awayScore: 17,
      homeBefore: 76.92, awayBefore: 76.36,
      isRWC: true
    })
    // Regular ~0.64, RWC ~1.29 (= 0.644 * 2 = 1.288, rounded a 1.29).
    const okRatio = approx(rwc.homeDelta / regular.homeDelta, 2.0, 0.05)
    const okFlavor = rwc.flavor === 'rwc_double'
    return {
      ok: okRatio && okFlavor,
      detail: `regular Δ=${regular.homeDelta}, RWC Δ=${rwc.homeDelta}, ratio=${(rwc.homeDelta / regular.homeDelta).toFixed(3)}, flavor=${rwc.flavor}`
    }
  }))

  const passed = cases.filter((c) => c.passed).length
  const failed = cases.length - passed
  return { passed, failed, total: cases.length, cases }
}

/** Helper para volcar el reporte por consola en formato legible.
 *  Devuelve el mismo reporte para encadenar. */
export function logSelfTests(): SelfTestReport {
  const report = runSelfTests()
  // eslint-disable-next-line no-console
  console.group(`World Rugby Ranking self-tests: ${report.passed}/${report.total} pass`)
  for (const c of report.cases) {
    const tag = c.passed ? '✓' : '✗'
    if (c.passed) {
      // eslint-disable-next-line no-console
      console.log(`${tag} ${c.name}\n   ${c.detail}`)
    } else {
      // eslint-disable-next-line no-console
      console.error(`${tag} ${c.name}\n   ${c.detail}`)
    }
  }
  // eslint-disable-next-line no-console
  console.groupEnd()
  return report
}
