// La deuda con consecuencias y los objetivos de la subcomisión, medidos en
// carreras enteras.
//
// Lo que la etapa 1 tiene que garantizar, dicho como lo diría un tesorero:
//   · un club pobre no queda condenado desde el año 1;
//   · una mala temporada no colapsa al club;
//   · tres malas seguidas sí lo ponen en crisis, y la crisis escala
//     (grave → crónica → despido), nunca salta.
//
// Medido el 2026-10-14 con 400 carreras × 12 temporadas (semillas 50.000+):
// al cierre del año 1, 398 sanas y 2 ajustadas; el déficit de UN año, en meses
// de ingresos, da p50 0,79 · p90 2,41 · p99 4,71 · máx 6,95; el primer cierre en
// grave llega en el año 4 o después; 32 despidos por deuda. El harness de acá
// corre menos carreras para tardar poco, con las mismas semillas.

import assert from 'node:assert/strict';
import test from 'node:test';
import { getEvent } from '../data/events/index.ts';
import { COACH_PROFILES } from '../data/profiles.ts';
import type { CoachState, DebtStatus } from '../types/coach.ts';
import { debtLevel } from './economy.ts';
import { debtRank } from './finance.ts';
import { seasonObjectives } from './objectives.ts';
import { autoResolveAcademy } from './market-policy.ts';
import { createRng } from './random.ts';
import {
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeSeason,
    createCareer,
    nextTramo,
    closeMarketWindow,
    playPlayoffMatch,
    simulateTramo,
} from './run-season.ts';
import { selectableClubs, seedWorld } from './world.ts';

const CAREERS = 200;
const SEASONS = 12;

interface Measured {
    /** Estado de la deuda al cerrar el año 1, una entrada por carrera. */
    firstYear: DebtStatus[];
    /** Déficit de cada temporada en rojo, en meses de ingresos. */
    deficitMonths: number[];
    /** Año (1-based) del primer cierre en grave o peor, por carrera que llegó. */
    firstGrave: number[];
    /** Por cada despido por deuda, cuántos cierres seguidos en grave o peor lo precedieron (incluido el último). */
    debtFirings: number[];
    /** Cierres que pasaron de sana a grave de un saque. */
    sanaToGrave: number;
    /** Objetivos cumplidos por eje: [cumplidos, total]. */
    met: Record<string, [number, number]>;
}

let cached: Measured | null = null;

function measure(): Measured {
    if (cached) return cached;
    const clubs = selectableClubs(seedWorld());
    const m: Measured = { firstYear: [], deficitMonths: [], firstGrave: [], debtFirings: [], sanaToGrave: 0, met: {} };

    for (let c = 0; c < CAREERS; c++) {
        // Las decisiones salen de un RNG aparte del motor, como en `invariants.test.ts`.
        const player = createRng(1000 + c);
        // El M19 (etapa 4) con su PROPIO RNG, como el mercado en `invariants.test.ts`.
        const kids = createRng(30_000 + c);
        let state: CoachState = createCareer(50_000 + c, clubs[c % clubs.length], COACH_PROFILES[c % COACH_PROFILES.length].id);
        let prev: DebtStatus = 'sana';
        let graveRun = 0;
        let reachedGrave = false;

        for (let y = 0; y < SEASONS; y++) {
            state = beginDecisions(autoResolveAcademy(state, 'azar', kids));
            for (let guard = 0; guard < 80 && state.phase !== 'season'; guard++) {
                if (state.phase === 'decision') {
                    const event = getEvent(state.pendingEventId as string);
                    assert.ok(event, `tarjeta desconocida: ${state.pendingEventId}`);
                    state = chooseOption(state, event.options[player.int(0, event.options.length - 1)].id);
                } else if (state.phase === 'reveal') {
                    state = acknowledgeReveal(state);
                } else if (state.phase === 'playoff') {
                    state = playPlayoffMatch(state, 'plan');
                } else if (state.phase === 'training' || state.phase === 'keymatch') {
                    state = simulateTramo(state);
                } else if (state.phase === 'tramo') {
                    state = nextTramo(state);
                } else if (state.phase === 'market') {
                    state = closeMarketWindow(state);
                }
            }
            state = closeSeason(state);
            const entry = state.seasons[state.seasons.length - 1];
            const fin = entry.finance;
            assert.ok(fin, `la temporada ${entry.season} cerró sin la foto de la caja`);

            if (y === 0) m.firstYear.push(fin.debt);
            if (fin.resultado < 0 && fin.ingresos > 0) m.deficitMonths.push((-fin.resultado / fin.ingresos) * 12);
            if (prev === 'sana' && debtRank(fin.debt) >= 3) m.sanaToGrave++;
            if (debtRank(fin.debt) >= 3) {
                graveRun++;
                if (!reachedGrave) m.firstGrave.push(y + 1);
                reachedGrave = true;
            } else {
                graveRun = 0;
            }
            for (const o of entry.objectives ?? []) {
                const r = (m.met[o.axis] ??= [0, 0]);
                r[1]++;
                if (o.met) r[0]++;
            }
            prev = fin.debt;

            if (state.phase === 'fired') {
                if (fin.measures.some((t) => t.includes('te despide'))) m.debtFirings.push(graveRun);
                break;
            }
        }
    }
    cached = m;
    return m;
}

function quantile(values: readonly number[], q: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

test('ningún club arranca condenado: al cerrar el año 1 casi todos están sanos y nadie pasa de ajustada', () => {
    const { firstYear } = measure();
    const worse = firstYear.filter((d) => debtRank(d) >= 2);
    assert.equal(worse.length, 0, `${worse.length} clubes cerraron el año 1 en complicada o peor`);
    const sanas = firstYear.filter((d) => d === 'sana').length;
    assert.ok(sanas / firstYear.length >= 0.95, `solo ${sanas} de ${firstYear.length} cerraron el año 1 sanos`);
});

test('una mala temporada no colapsa al club: el déficit de un año casi nunca llega a seis meses', () => {
    const { deficitMonths, sanaToGrave } = measure();
    assert.ok(deficitMonths.length > 50, `solo ${deficitMonths.length} temporadas en rojo: el harness no ejercita la deuda`);
    const p99 = quantile(deficitMonths, 0.99);
    assert.ok(p99 < 6, `el p99 del déficit de un año es ${p99.toFixed(2)} meses: una sola mala temporada ya es grave`);
    // De sana a grave en un solo cierre: un outlier tolerado, no una regla.
    assert.ok(sanaToGrave <= 1, `${sanaToGrave} clubes pasaron de sana a grave en un solo cierre`);
});

test('tres malas seguidas sí ponen al club en crisis: tres déficits del p90 cruzan el umbral de grave', () => {
    const { deficitMonths } = measure();
    const p90 = quantile(deficitMonths, 0.9);
    assert.notEqual(debtLevel(Math.round(p90)), 'grave', `un solo año del p90 (${p90.toFixed(2)} meses) ya es grave`);
    assert.equal(debtLevel(Math.round(3 * p90)), 'grave', `tres años del p90 suman ${(3 * p90).toFixed(2)} meses y no llegan a grave`);
});

test('la crisis escala y no salta: grave llega tarde, y el despido por deuda viene después de tres cierres en grave', () => {
    const { firstGrave, debtFirings } = measure();
    assert.ok(firstGrave.length > 0, 'ninguna carrera llegó a grave: la deuda no tiene dientes');
    assert.ok(Math.min(...firstGrave) >= 3, `una carrera llegó a grave en el año ${Math.min(...firstGrave)}`);
    assert.ok(debtFirings.length > 0, 'nadie fue despedido por la deuda: la crónica no tiene consecuencia');
    for (const run of debtFirings) assert.ok(run >= 3, `despido por deuda tras solo ${run} cierres en grave`);
});

test('los objetivos son realistas: ningún eje se cumple siempre ni nunca', () => {
    const { met } = measure();
    for (const axis of ['deportivo', 'secundario', 'economico'] as const) assertRealistic(met, axis);
});

// Hasta la etapa 1 el formativo se cumplía el 100 % de las veces: pedía "N
// propios en el XV" con N menor o igual a los que ya había. Desde la etapa 2
// mide TITULARIDADES de los propios a lo largo de la fase regular, con la
// alineación real de cada fecha (lesiones, cansancio, rotación). Medido el
// 2026-10-14 con este harness (plan por defecto, que rota): se cumple ~70 %.
// La palanca existe: con "Pista a los pibes" fijo se cumple casi siempre (lo
// mide `tramos.test.ts`).
//
// ETAPA 4 (motor 2.3.0): el formativo elige entre SUBIR DEL M19 y las
// titularidades (`formativeKind`), y el harness maneja el M19 al azar
// (`autoResolveAcademy`, semilla 30.000 + carrera): observa y suma en la
// captación, promueve cuatro de cada diez listos, reserva, cede y libera. Sin
// tocar el M19 la subcomisión pide subir pibes casi siempre y nadie los sube:
// medido con 200 carreras, 23 % (75 % las titularidades, 0 % subir del M19).
// Con la política al azar: 76 % (83 % titularidades, 67 % subir del M19).
test('el formativo se puede no cumplir', () => {
    assertRealistic(measure().met, 'formativo');
});

function assertRealistic(met: Measured['met'], axis: string): void {
    const [ok, total] = met[axis] ?? [0, 0];
    assert.ok(total > 0, `el eje ${axis} no apareció nunca`);
    const rate = ok / total;
    assert.ok(rate > 0.35 && rate < 0.95, `el eje ${axis} se cumple el ${Math.round(rate * 100)} % de las veces`);
}

test('los objetivos de una temporada pesan 100 y leerlos dos veces da lo mismo', () => {
    const clubs = selectableClubs(seedWorld());
    for (let c = 0; c < 20; c++) {
        const state = createCareer(9_000 + c, clubs[(c * 7) % clubs.length], 'estratega');
        const a = seasonObjectives(state);
        assert.deepEqual(seasonObjectives(state), a, 'dos lecturas del mismo estado dieron objetivos distintos');
        assert.equal(a.reduce((s, o) => s + o.weight, 0), 100, `los pesos suman otra cosa en ${state.clubId}`);
    }
});
