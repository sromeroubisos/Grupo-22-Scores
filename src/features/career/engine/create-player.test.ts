import test from 'node:test';
import assert from 'node:assert/strict';
import type { Position } from '../types/player.ts';
import { ALL_POSITIONS } from '../data/positions.ts';
import { createPlayer, POTENTIAL_MAX, POTENTIAL_MIN, YOUTH_OVR_MAX, YOUTH_OVR_MIN } from './create-player.ts';
import { computeOvr } from './scoring.ts';
import { createRng } from './random.ts';
import { runCareer, acceptBestEligibleOfferChooser } from './run-career.ts';
import { buildCareerSummary } from './statistics.ts';
import { CLUBS, getClub } from '../data/clubs.ts';
import { marketRung } from './market-routes.ts';
import { marketValue } from './club-offers.ts';
import { computeEffectiveOvr } from './scoring.ts';

// Distribución, no una sola carrera: 200 semillas por posición.
const SEEDS = Array.from({ length: 200 }, (_, i) => (i + 1) * 7919);

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function sample(position: Position): { ovr: number[]; potential: number[] } {
    const ovr: number[] = [];
    const potential: number[] = [];
    for (const seed of SEEDS) {
        const player = createPlayer({ position }, createRng(seed));
        ovr.push(computeOvr(player.attributes, player.position));
        potential.push(player.potential);
    }
    return { ovr, potential };
}

const samples = new Map<Position, { ovr: number[]; potential: number[] }>(
    ALL_POSITIONS.map((position) => [position, sample(position)]),
);

test('el OVR inicial NUNCA cae fuera de 34-46', () => {
    for (const [position, { ovr }] of samples) {
        const min = Math.min(...ovr);
        const max = Math.max(...ovr);
        assert.ok(min >= YOUTH_OVR_MIN, `${position}: OVR mínimo ${min} < ${YOUTH_OVR_MIN}`);
        assert.ok(max <= YOUTH_OVR_MAX, `${position}: OVR máximo ${max} > ${YOUTH_OVR_MAX}`);
    }
});

test('la banda juvenil se usa entera (no todos idénticos)', () => {
    const all = [...samples.values()].flatMap((s) => s.ovr);
    assert.ok(Math.min(...all) <= 35, 'debería existir algún prospecto muy verde');
    assert.ok(Math.max(...all) >= 45, 'debería existir algún prospecto muy adelantado');
    assert.ok(new Set(all).size >= 8, 'la banda debe estar poblada, no concentrada en un valor');
});

test('se mantienen diferencias CLARAS por posición', () => {
    const medians = new Map([...samples].map(([position, s]) => [position, median(s.ovr)]));
    const wing = medians.get('wing')!;
    const prop = medians.get('prop')!;
    const scrumhalf = medians.get('scrumhalf')!;
    const lock = medians.get('lock')!;

    assert.ok(wing - prop >= 4, `wing ${wing} debería arrancar bastante por encima del pilar ${prop}`);
    assert.ok(scrumhalf > lock, `medio scrum ${scrumhalf} arranca por encima de la segunda línea ${lock}`);
    assert.ok(new Set(medians.values()).size >= 4, 'las posiciones no pueden colapsar en la misma mediana');
});

test('el potencial es OCULTO, existe y deja margen real de crecimiento', () => {
    for (const [position, { ovr, potential }] of samples) {
        assert.ok(Math.min(...potential) >= POTENTIAL_MIN, `${position}: potencial por debajo del piso`);
        assert.ok(Math.max(...potential) <= POTENTIAL_MAX, `${position}: potencial por encima del techo`);
        assert.ok(
            median(potential) - median(ovr) >= 30,
            `${position}: sin margen de crecimiento (${median(ovr)} → ${median(potential)})`,
        );
    }
    // El potencial no se deriva del OVR inicial: dos prospectos iguales pueden
    // tener techos muy distintos.
    const spread = [...samples.values()].flatMap((s) => s.potential);
    assert.ok(Math.max(...spread) - Math.min(...spread) >= 25, 'los techos deben variar entre jugadores');
});

test('la NACIONALIDAD no da bonus ni castigo de atributos', () => {
    const NATIONALITIES = ['Argentina', 'Francia', 'Nueva Zelanda', 'Fiyi', 'Japón', 'Wakanda'];
    const byNationality = NATIONALITIES.map((nationality) => {
        const ovr = SEEDS.map((seed) => {
            const p = createPlayer({ position: 'centre', nationality, origin: 'academia-club' }, createRng(seed));
            return computeOvr(p.attributes, p.position);
        });
        return { nationality, median: median(ovr), min: Math.min(...ovr), max: Math.max(...ovr) };
    });

    const medians = byNationality.map((b) => b.median);
    assert.equal(new Set(medians).size, 1, `la mediana de OVR cambia por nacionalidad: ${JSON.stringify(byNationality)}`);
    for (const entry of byNationality) {
        assert.equal(entry.min, byNationality[0].min, `${entry.nationality}: mínimo distinto`);
        assert.equal(entry.max, byNationality[0].max, `${entry.nationality}: máximo distinto`);
    }
});

test('el OVR inicial lo define la POSICIÓN, no un premio global', () => {
    // Con los mismos atributos, cambiar de posición cambia el reparto pero
    // ninguna posición obtiene un OVR desmedido respecto de las demás.
    const medians = ALL_POSITIONS.map((p) => median(samples.get(p)!.ovr));
    assert.ok(Math.max(...medians) - Math.min(...medians) <= 8, 'ninguna posición puede sacar una ventaja global grande');
    assert.ok(Math.max(...medians) <= YOUTH_OVR_MAX && Math.min(...medians) >= YOUTH_OVR_MIN);
});

test('las escalas de jugador y de club son la MISMA (sin constantes opacas)', () => {
    const rookie = createPlayer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, createRng(1234));
    const rookieValue = marketValue(rookie, computeEffectiveOvr(rookie));
    const elite = getClub('leinster');
    const amateur = CLUBS.filter((c) => c.level === 'amateur').sort((a, b) => a.rating - b.rating)[0];

    assert.ok(rookieValue < elite.rating - 20, `un juvenil (${rookieValue.toFixed(1)}) está lejísimos de Leinster (${elite.rating})`);
    assert.ok(rookieValue > amateur.rating, 'pero por encima del club amateur más flojo');

    // El techo del jugador vive en la misma escala que el rating de club.
    assert.ok(Math.max(...[...samples.values()].flatMap((s) => s.potential)) <= 96, 'el potencial no supera el rating de club máximo');
});

test('la progresión reparte bandas profesionales: casi nadie llega a la élite', () => {
    let reachedRegional = 0;
    let reachedElite = 0;
    let stayedBelow = 0;
    const runs = SEEDS.slice(0, 40);
    for (const seed of runs) {
        const state = runCareer({ position: 'centre', nationality: 'Argentina', origin: 'academia-club' }, seed, acceptBestEligibleOfferChooser);
        const peak = Math.max(...state.seasons.map((s) => marketRung(getClub(s.club))));
        if (peak >= 8) reachedElite++;
        else if (peak >= 5) reachedRegional++;
        else stayedBelow++;
    }
    assert.ok(stayedBelow > 0, 'tiene que haber carreras que nunca se profesionalizan');
    assert.ok(reachedRegional > 0, 'y carreras que sí llegan al profesionalismo regional');
    assert.ok(reachedElite < runs.length * 0.2, `llegar a la élite no puede ser lo normal (${reachedElite}/${runs.length})`);
});

test('un juvenil NUNCA arranca en nivel de estrella y el profesional consolidado queda por encima', () => {
    const best = Math.max(...[...samples.values()].flatMap((s) => s.ovr));
    const peaks: number[] = [];
    for (const seed of SEEDS.slice(0, 25)) {
        for (const position of ['prop', 'flyhalf', 'wing'] as const) {
            peaks.push(buildCareerSummary(runCareer({ position, origin: 'seleccionado-juvenil' }, seed)).peakOvr);
        }
    }
    assert.ok(best <= YOUTH_OVR_MAX, `el mejor debut (${best}) sigue siendo juvenil`);
    assert.ok(median(peaks) > best + 15, `el pico de carrera (${median(peaks)}) debe superar ampliamente el debut (${best})`);
    assert.ok(Math.max(...peaks) >= 70, 'alguna carrera debe llegar a nivel profesional alto');
});
