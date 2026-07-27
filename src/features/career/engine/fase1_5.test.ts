// Regresión de la Fase 1.5: títulos (identidad real + club vs jugador +
// apariciones), terminología de movimiento, mercado como fase, y curva de OVR.
// Todo determinístico y sin red.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getClub } from '../data/clubs.ts';
import { runCareer, acceptBestEligibleOfferChooser } from './run-career.ts';
import { createInitialCareer, careerReducer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';
import { TRANSFER_EVENT_ID } from '../data/events/index.ts';
import { clubLeagueIdentity } from './competition-identity.ts';
import { classifyMovement } from './market-routes.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';
import type { CareerState } from '../types/career.ts';
import type { CreatePlayerInput } from './create-player.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => (i + 1) * 4099);
const NATIONS = ['ar', 'uy', 'cl', 'nz', 'za', 'es', 'fj'];

/** Corre una carrera aceptando ofertas (para ejercitar mercado y títulos). */
function fullCareer(input: CreatePlayerInput, seed: number): CareerState {
    return runCareer(input, seed, acceptBestEligibleOfferChooser);
}

function allHistory(): { state: CareerState; nat: string }[] {
    const out: { state: CareerState; nat: string }[] = [];
    const positions = ['prop', 'wing', 'flyhalf', 'lock', 'centre'] as const;
    for (const nat of NATIONS) {
        for (let i = 0; i < 12; i++) {
            out.push({ state: fullCareer({ position: positions[i % positions.length], nationalityCountryCode: nat }, (i + 1) * 2311), nat });
        }
    }
    return out;
}

// ── TÍTULOS ──────────────────────────────────────────────────────────────────

test('el título del jugador exige apariciones senior (development sin debut = 0)', () => {
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            for (const t of h.titlesWon) {
                void t;
                const disputedSenior = h.squadTrack === 'senior' || h.appearances >= 3;
                assert.ok(disputedSenior, `título acreditado sin disputa senior (track=${h.squadTrack}, apps=${h.appearances})`);
                assert.ok(h.appearances >= 1, 'título acreditado con 0 apariciones');
            }
        }
    }
});

test('el título del CLUB puede existir sin acreditar al jugador (honores separados)', () => {
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            // Los honores del jugador son un SUBCONJUNTO de los del club.
            assert.ok(h.clubTitlesWon.length >= h.titlesWon.length, 'clubTitlesWon debe contener a titlesWon');
        }
    }
});

test('un club solo NO se corona (no hay campeón de un campo de <2 equipos)', () => {
    for (const { state } of allHistory()) {
        for (const s of state.seasons) {
            if (s.titlesWon.some((t) => t.category === 'league')) {
                assert.ok(s.leagueTeams >= 2, `campeón de una liga de ${s.leagueTeams} equipos`);
            }
        }
    }
});

test('el título de liga AR/UY/CL es de la DIVISIÓN real, no del sistema paraguas', () => {
    let checked = 0;
    for (const { state } of allHistory()) {
        for (const h of state.history) {
            const club = getClub(h.clubId);
            const identity = clubLeagueIdentity(club);
            for (const t of h.titlesWon.filter((x) => x.category === 'league')) {
                // El id del título de liga = la identidad real del club esa temporada.
                assert.equal(t.competitionId, identity.id, 'el título de liga no coincide con la división del club');
                // Para AR/UY/CL identificadas, el id lleva la división, no es el paraguas suelto.
                if (identity.umbrellaId && identity.identified) {
                    assert.ok(t.competitionId.includes('#'), `título de liga sin división real: ${t.competitionId}`);
                    assert.notEqual(t.competitionId, identity.umbrellaId, 'el título quedó en el paraguas');
                    checked++;
                }
            }
        }
    }
    assert.ok(checked > 0, 'debe haberse validado al menos un título de división AR/UY/CL');
});

test('no hay títulos duplicados de la misma competición en una temporada', () => {
    for (const { state } of allHistory()) {
        for (const s of state.seasons) {
            const ids = s.titlesWon.map((t) => t.competitionId);
            assert.equal(new Set(ids).size, ids.length, `título duplicado en una temporada: ${ids.join(', ')}`);
        }
    }
});

test('el contador de títulos de cabecera = suma de honores del jugador', () => {
    for (const { state } of allHistory()) {
        const sumTitles = state.history.reduce((acc, h) => acc + h.titlesWon.length, 0);
        assert.equal(state.player.titles, sumTitles, 'player.titles debe igualar la suma de titlesWon');
    }
});

// ── TERMINOLOGÍA DE MOVIMIENTO ───────────────────────────────────────────────

test('un club amateur NUNCA firma contrato profesional (terminología)', () => {
    const amateurClubs = CLUBS.filter((c) => economicModelOf(c) === 'amateur');
    const from = CLUBS.find((c) => c.competitionId === 'sa-ar')!;
    for (const target of amateurClubs.slice(0, 60)) {
        for (const emp of ['amateur', 'amateur-compensated'] as const) {
            const kind = classifyMovement(from, target, emp, 'senior');
            assert.notEqual(kind, 'professional-contract', `${target.name} (amateur) no puede ofrecer contrato profesional`);
            assert.notEqual(kind, 'semi-pro-agreement', `${target.name} (amateur) no es acuerdo semipro`);
        }
    }
});

test('pase dentro de la misma unión vs entre uniones', () => {
    const urba = CLUBS.filter((c) => c.competitionId === 'sa-ar' && (c.divisionName ?? '').includes('URBA'));
    const cordoba = CLUBS.filter((c) => c.competitionId === 'sa-ar' && (c.divisionName ?? '').includes('Centro'));
    assert.ok(urba.length >= 2 && cordoba.length >= 1, 'necesito clubes de URBA y Córdoba');
    // Dentro de la URBA → pase amateur.
    assert.equal(classifyMovement(urba[0], urba[1], 'amateur', 'senior'), 'amateur-pass');
    // URBA → Córdoba → pase interuniones (sistemas paralelos).
    assert.equal(classifyMovement(urba[0], cordoba[0], 'amateur', 'senior'), 'inter-union-pass');
});

test('un club profesional de otro país sí firma contrato / academia es invitación', () => {
    const from = CLUBS.find((c) => c.competitionId === 'sa-ar')!;
    const pro = CLUBS.find((c) => economicModelOf(c) === 'professional')!;
    assert.equal(classifyMovement(from, pro, 'full-time-professional', 'senior'), 'professional-contract');
    assert.equal(classifyMovement(from, pro, 'semi-professional', 'development'), 'development-invite');
});

test('un 4ª/3ª división amateur NO recibe oferta directa de la SRA', () => {
    // Recorremos carreras AR que se quedan abajo: ningún salto a SRA desde banda <2.
    for (const seed of SEEDS.slice(0, 20)) {
        let state = createInitialCareer({ position: 'prop', nationalityCountryCode: 'ar' }, seed);
        let guard = 0;
        while (state.phase !== 'retired' && guard < 60) {
            guard++;
            const event = getPendingEvent(state);
            if (event && event.id === TRANSFER_EVENT_ID) {
                const before = getClub(state.player.club);
                for (const offer of state.offers) {
                    const target = getClub(offer.club);
                    if (target.competitionId === 'sra') {
                        assert.ok(sportingBandOf(before) >= 2, `SRA ofrecida desde banda ${sportingBandOf(before)} (${before.name})`);
                    }
                }
            }
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[event.options.length - 1].id })
                : careerReducer(state, { type: 'ADVANCE' });
        }
    }
});

// ── MERCADO COMO FASE ────────────────────────────────────────────────────────

test('el mercado se EVALÚA explícitamente cada temporada', () => {
    let state = createInitialCareer({ position: 'centre', nationalityCountryCode: 'ar' }, 8123);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        guard++;
        const event = getPendingEvent(state);
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id })
            : careerReducer(state, { type: 'ADVANCE' });
        if (state.phase !== 'retired') {
            assert.equal(state.marketEvaluatedSeason, state.player.seasonsPlayed, 'el mercado debe evaluarse en la temporada en curso');
        }
    }
});

test('rechazar ofertas NO silencia el mercado (aparece varias veces)', () => {
    let seen = 0;
    let state = createInitialCareer({ position: 'flyhalf', nationalityCountryCode: 'ar' }, 5501);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        guard++;
        const event = getPendingEvent(state);
        if (event && event.id === TRANSFER_EVENT_ID) seen++;
        // SIEMPRE se queda (opción 0).
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id })
            : careerReducer(state, { type: 'ADVANCE' });
    }
    assert.ok(seen >= 2, `un jugador que rechaza igual ve el mercado (${seen} veces)`);
});

test('el mercado es determinístico: misma seed ⇒ mismas decisiones', () => {
    const a = fullCareer({ position: 'wing', nationalityCountryCode: 'nz' }, 6789);
    const b = fullCareer({ position: 'wing', nationalityCountryCode: 'nz' }, 6789);
    assert.deepEqual(a.history.map((h) => h.clubId), b.history.map((h) => h.clubId));
    assert.deepEqual(a.history.map((h) => h.ovr), b.history.map((h) => h.ovr));
});

// ── OVR ──────────────────────────────────────────────────────────────────────

test('el crecimiento juvenil es VISIBLE (mayoría de U23 sanos suben ≥2)', () => {
    let good = 0;
    let total = 0;
    for (const nat of ['nz', 'fr', 'za', 'ar']) {
        for (const seed of SEEDS) {
            const state = fullCareer({ position: 'centre', nationalityCountryCode: nat }, seed);
            for (const h of state.history) {
                // Temporada juvenil con rodaje real (no un debut de 1 partido).
                if (h.age <= 22 && h.appearances >= 5) {
                    total++;
                    if (h.ovrDelta >= 2) good++;
                }
            }
        }
    }
    assert.ok(total > 50, 'debe haber suficientes temporadas juveniles');
    assert.ok(good / total >= 0.5, `pocos juveniles con crecimiento visible: ${Math.round(good / total * 100)}%`);
});

test('OVR nunca supera al potencial (techo respetado) y no hay NaN', () => {
    for (const { state } of allHistory()) {
        assert.ok(!Number.isNaN(state.player.potential));
        for (const h of state.history) {
            assert.ok(!Number.isNaN(h.ovr), 'OVR NaN');
            assert.ok(h.ovr <= state.player.potential + 1, `OVR ${h.ovr} supera potencial ${state.player.potential}`);
        }
    }
});

test('el delta mostrado coincide con el cambio real de OVR de la temporada', () => {
    for (const { state } of allHistory()) {
        for (const s of state.seasons) {
            const entry = state.history[s.seasonIndex];
            if (entry) assert.equal(entry.ovrDelta, s.ovrEnd - s.ovrStart, 'ovrDelta del historial ≠ cambio real');
        }
    }
});

test('un potencial bajo NO llega a élite', () => {
    // Forzamos posiciones/naciones y verificamos que los de techo bajo se quedan abajo.
    for (const seed of SEEDS) {
        const state = fullCareer({ position: 'prop', nationalityCountryCode: 'ar' }, seed);
        const peak = Math.max(...state.history.map((h) => h.ovr), 0);
        if (state.player.potential <= 60) {
            assert.ok(peak <= 66, `techo ${state.player.potential} llegó a ${peak}`);
        }
    }
});
