// Runner de consola: juega una carrera completa y la imprime temporada a
// temporada + resumen final. NO es parte del bundle de la app (nadie lo importa).
//
//   node src/features/career/run-console.ts <posicion> <seed> [origen]
//   node src/features/career/run-console.ts flyhalf 12345
//   node src/features/career/run-console.ts prop 7 ascenso-pueblo

import type { CareerState } from './types/career.ts';
import type { GameEvent } from './types/event.ts';
import { ALL_POSITIONS, getPosition } from './data/positions.ts';
import { ALL_ORIGINS } from './data/origins.ts';
import { getClub } from './data/clubs.ts';
import { runCareer } from './engine/run-career.ts';
import { buildCareerSummary } from './engine/statistics.ts';
import type { Position } from './types/player.ts';

// Chooser demo (determinístico, sin RNG): si estás de suplente, aceptás la mejor
// oferta del mercado; si no, te quedás. En el resto, primera opción.
function demoChooser(event: GameEvent, state: CareerState): string {
    if (event.id === 'club-transfer') {
        if (state.player.role === 'fringe' && event.options.length > 1) return event.options[1].id;
        return event.options[0].id;
    }
    return event.options[0].id;
}

function pad(value: string | number, width: number): string {
    const str = String(value);
    return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

function keyStat(state: CareerState, index: number): string {
    const s = state.seasons[index];
    const pos = getPosition(s.position).group;
    if (getPosition(s.position).stats.goalKicker) return `${s.stats.kicksMade}/${s.stats.kicksAtGoal} palos`;
    if (pos === 'forward') return `${s.stats.tackles} tackles`;
    return `${s.stats.tries} tries`;
}

function main(): void {
    const args = process.argv.slice(2);
    const position = (ALL_POSITIONS.includes(args[0] as Position) ? args[0] : 'wing') as Position;
    const seed = Number.isFinite(Number(args[1])) && args[1] ? Number(args[1]) : 12345;
    const origin = ALL_ORIGINS.includes(args[2]) ? args[2] : 'seleccionado-juvenil';

    const nickname = 'Prospecto';
    const state = runCareer({ nickname, position, origin }, seed, demoChooser);

    const posLabel = getPosition(position).labelEs;
    console.log('');
    console.log(`===== CARRERA DE RUGBY — ${posLabel} (seed ${seed}, origen ${origin}) =====`);
    console.log('');
    console.log(`${pad('Temp', 5)}${pad('Edad', 5)}${pad('Club', 18)}${pad('Rol', 11)}${pad('OVR', 5)}${pad('PJ', 4)}${pad('Rat', 5)}${pad('Destacado', 16)}Titular`);
    console.log('-'.repeat(96));

    state.seasons.forEach((s, i) => {
        console.log(
            pad(s.seasonIndex + 1, 5) +
                pad(s.age, 5) +
                pad(getClub(s.club).labelEs.slice(0, 17), 18) +
                pad(s.role, 11) +
                pad(s.ovrEnd, 5) +
                pad(s.matches, 4) +
                pad(s.rating.toFixed(1), 5) +
                pad(keyStat(state, i), 16) +
                s.headline,
        );
        if (s.decisionText) console.log(`      ↳ ${s.decisionText}`);
    });

    const sum = buildCareerSummary(state);
    console.log('');
    console.log('===== RESUMEN =====');
    console.log(`Temporadas: ${sum.seasons}  ·  Debut ${sum.debutAge}  ·  Retiro ${sum.retirementAge}  (${sum.retirementReason})`);
    console.log(`Partidos: ${sum.totalMatches}  ·  Caps: ${sum.caps}  ·  Títulos: ${sum.titles}  ·  Pico OVR: ${sum.peakOvr}  ·  Rating medio: ${sum.avgRating}`);
    console.log(`Tries: ${sum.totals.tries}  ·  Tackles: ${sum.totals.tackles}  ·  Asist.: ${sum.totals.assists}  ·  Palos: ${sum.totals.kicksMade}/${sum.totals.kicksAtGoal}`);
    console.log(`Clubes: ${sum.byClub.map((c) => `${getClub(c.club).labelEs} (${c.seasons})`).join(', ')}`);
    console.log(`Palmarés: ${sum.honours.length ? sum.honours.join(', ') : 'sin títulos'}`);
    console.log(`PUNTAJE DE CARRERA: ${sum.careerScore}`);
    console.log('');
}

main();
