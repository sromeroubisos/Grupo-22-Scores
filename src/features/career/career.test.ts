import test from 'node:test';
import assert from 'node:assert/strict';
import type { Position } from './types/player.ts';
import type { CareerSummary } from './types/career.ts';
import { runCareer } from './engine/run-career.ts';
import { buildCareerSummary } from './engine/statistics.ts';
import { ALL_COMPETITIONS } from './data/clubs2026/competitions2026.ts';
import { CLUB_CATALOG_VERSION } from './data/clubs.ts';
import { ENGINE_VERSION } from './types/career.ts';

const SEEDS = Array.from({ length: 25 }, (_, i) => (i + 1) * 7919);

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function careersFor(position: Position): CareerSummary[] {
    return SEEDS.map((seed) => buildCareerSummary(runCareer({ nickname: 'P', position, origin: 'seleccionado-juvenil' }, seed)));
}

const prop = careersFor('prop');
const flyhalf = careersFor('flyhalf');
const wing = careersFor('wing');

test('todas las carreras terminan retiradas y con duración razonable', () => {
    for (const set of [prop, flyhalf, wing]) {
        for (const c of set) {
            assert.ok(c.seasons >= 6 && c.seasons <= 25, `duración fuera de rango: ${c.seasons}`);
        }
    }
});

test('los tries divergen por posición: wing >> apertura >> pilar', () => {
    const wingTries = median(wing.map((c) => c.totals.tries));
    const flyTries = median(flyhalf.map((c) => c.totals.tries));
    const propTries = median(prop.map((c) => c.totals.tries));

    assert.ok(wingTries > flyTries * 1.3, `wing ${wingTries} debería superar ampliamente a apertura ${flyTries}`);
    assert.ok(flyTries > propTries * 1.5, `apertura ${flyTries} debería superar ampliamente a pilar ${propTries}`);
});

test('solo los pateadores patean a los palos (apertura sí, pilar y wing no)', () => {
    assert.ok(median(flyhalf.map((c) => c.totals.kicksAtGoal)) > 150, 'la apertura debería patear muchos palos');
    assert.equal(median(wing.map((c) => c.totals.kicksAtGoal)), 0, 'el wing no patea a los palos');
    assert.equal(median(prop.map((c) => c.totals.kicksAtGoal)), 0, 'el pilar no patea a los palos');
});

test('los forwards tacklean más: pilar > wing', () => {
    assert.ok(
        median(prop.map((c) => c.totals.tackles)) > median(wing.map((c) => c.totals.tackles)),
        'el pilar debería tacklear más que el wing',
    );
});

test('los pilares sostienen carreras más largas que los wings', () => {
    assert.ok(
        median(prop.map((c) => c.retirementAge)) >= median(wing.map((c) => c.retirementAge)),
        'el pilar debería retirarse a una edad igual o mayor que el wing',
    );
});

test('el motor es determinístico: misma semilla ⇒ misma carrera', () => {
    const a = runCareer({ nickname: 'Det', position: 'centre', origin: 'academia-club' }, 314159);
    const b = runCareer({ nickname: 'Det', position: 'centre', origin: 'academia-club' }, 314159);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(buildCareerSummary(a).careerScore, buildCareerSummary(b).careerScore);
});

test('distinta semilla ⇒ carreras distintas (el azar importa)', () => {
    const a = runCareer({ nickname: 'X', position: 'wing', origin: 'seleccionado-juvenil' }, 1);
    const b = runCareer({ nickname: 'X', position: 'wing', origin: 'seleccionado-juvenil' }, 2);
    assert.notEqual(JSON.stringify(a.seasons), JSON.stringify(b.seasons));
});

test('la carrera SELLA la versión del catálogo, la seed y las decisiones', () => {
    const state = runCareer({ nickname: 'S', position: 'lock', origin: 'academia-club' }, 8675309);
    assert.equal(state.clubCatalogVersion, CLUB_CATALOG_VERSION, 'versión de catálogo sellada');
    assert.equal(state.version, ENGINE_VERSION, 'versión de motor sellada');
    assert.equal(state.seed, 8675309, 'seed sellada');
    assert.equal(typeof state.rngState, 'number', 'estado de RNG serializado');
    assert.ok(state.decisionLog.length > 0, 'las decisiones quedan registradas');
    for (const entry of state.decisionLog) {
        assert.equal(typeof entry.eventId, 'string');
        assert.equal(typeof entry.optionId, 'string');
    }
});

test('participar en una competición NO otorga el título', () => {
    let participations = 0;
    let titles = 0;
    for (const seed of SEEDS) {
        const state = runCareer({ nickname: 'P', position: 'backrow', origin: 'academia-club' }, seed);
        for (const season of state.seasons) {
            assert.ok(season.competitionsPlayed.length > 0, 'siempre se disputa al menos la liga');
            assert.ok(
                season.titles.length <= season.competitionsPlayed.length,
                'no se puede ganar más de lo que se disputa',
            );
            for (const won of season.titlesWon) {
                assert.ok(
                    season.competitionsPlayed.includes(won.competitionId),
                    `título en una competición no disputada: ${won.competitionId}`,
                );
            }
            participations += season.competitionsPlayed.length;
            titles += season.titles.length;
        }
    }
    assert.ok(participations > 0, 'debe haber participaciones');
    assert.ok(titles > 0, 'ganar tiene que ser posible');
    assert.ok(titles < participations * 0.35, `los títulos no pueden ser casi automáticos (${titles}/${participations})`);
});

test('el título de liga exige terminar 1º (una división sin resolver no corona)', () => {
    for (const seed of [101, 202, 303, 404]) {
        const state = runCareer({ nickname: 'L', position: 'centre', origin: 'academia-club' }, seed);
        for (const season of state.seasons) {
            assert.ok(season.leaguePosition >= 1 && season.leaguePosition <= season.leagueTeams, 'posición válida');
            // Ganar la liga IMPLICA salir 1º. (La recíproca ya no vale: un club de
            // división no identificada puede salir 1º de un campo trivial y NO
            // acreditar título — es el fix del "campeón de Liga Argentina".)
            const clubWonLeague = season.clubTitlesWon.some((t) => t.category === 'league');
            if (clubWonLeague) assert.equal(season.leaguePosition, 1, 'un campeón de liga terminó 1º');
            // El club campeón de liga tiene un campo real (no un club solo).
            if (clubWonLeague) assert.ok(season.leagueTeams >= 2, 'una liga con campeón tiene ≥2 equipos');
        }
    }
});

test('titlesWon estructurado coincide con titles y usa competiciones válidas', () => {
    const compIds = new Set(ALL_COMPETITIONS.map((c) => c.id));
    for (const seed of [11, 22, 33, 44, 55]) {
        const state = runCareer({ nickname: 'T', position: 'centre', origin: 'seleccionado-juvenil' }, seed);
        for (const s of state.seasons) {
            assert.equal(s.titles.length, s.titlesWon.length, 'titles y titlesWon deben coincidir');
            for (const t of s.titlesWon) {
                // El id de liga doméstica AR/UY/CL es de forma `${umbrella}#${división}`
                // (la división real). El resto es una competición registrada.
                const base = t.competitionId.split('#')[0];
                assert.ok(compIds.has(base), `competición inválida: ${t.competitionId}`);
                assert.equal(t.club, s.club, 'el título es del club de esa temporada');
                assert.equal(t.season, '2026-27');
            }
        }
    }
});
