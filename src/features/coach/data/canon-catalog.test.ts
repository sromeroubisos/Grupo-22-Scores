// La auditoría del catálogo de El Entrenador contra el CANON del rugby argentino.
//
// Lo que se verifica acá es la regla de realismo: ningún club, torneo ni división
// que no esté en `arSystem2026.ts`, cada club en la división donde juega, los
// nombres como los declara el canon, y nada duplicado por escribirse distinto.

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeArName } from '../../career/data/clubs2026/arCatalog.ts';
import { AR_DIVISIONS } from '../../career/data/clubs2026/arSystem2026.ts';
import { jobOffers, startingOffers } from '../engine/offers.ts';
import { createCareer } from '../engine/run-season.ts';
import { clubsIn, seedWorld } from '../engine/world.ts';
import { CLUB_META } from './club-meta.generated.ts';
import { CLUBS, getClub } from './clubs.ts';
import { COMPETITIONS, UNPLAYABLE_COMPETITIONS, getCompetition } from './competitions.ts';

test('cada club del canon tiene metadatos y nada más los tiene', () => {
    const canon = new Set(AR_DIVISIONS.flatMap((d) => d.clubs));
    for (const name of canon) assert.ok(CLUB_META[name], `${name} está en el canon y no en club-meta`);
    for (const name of Object.keys(CLUB_META)) assert.ok(canon.has(name), `${name} tiene metadatos y no está en el canon`);
    assert.equal(CLUBS.length, canon.size);
});

test('sin duplicados: ni por id ni por nombre escrito distinto', () => {
    assert.equal(new Set(CLUBS.map((c) => c.id)).size, CLUBS.length, 'hay ids repetidos');
    const byNorm = new Map<string, string[]>();
    for (const c of CLUBS) byNorm.set(normalizeArName(c.name), [...(byNorm.get(normalizeArName(c.name)) ?? []), c.name]);
    const dup = [...byNorm.values()].filter((names) => names.length > 1);
    assert.deepEqual(dup, [], `nombres que normalizan igual: ${JSON.stringify(dup)}`);
});

test('cada club juega UNA división, y es la que declara el canon', () => {
    const world = seedWorld();
    for (const club of CLUBS) {
        const division = world.divisions[club.id];
        if (getCompetition(club.homeCompetitionId)) {
            assert.equal(division, club.homeCompetitionId, `${club.name} juega ${division} y el canon dice ${club.homeCompetitionId}`);
        } else {
            assert.equal(division, undefined, `${club.name} juega una división que el juego no puede jugar`);
        }
    }
});

test('los torneos son los del canon, con su nombre oficial', () => {
    for (const comp of COMPETITIONS) {
        const canon = AR_DIVISIONS.find((d) => d.competitionId === comp.id);
        assert.ok(canon, `${comp.id} no existe en el canon`);
        assert.equal(comp.name, canon.label);
        assert.equal(comp.teams, canon.clubs.length);
        assert.equal(clubsIn(seedWorld(), comp.id).length, comp.teams);
    }
    // Lo que no se juega queda declarado, no escondido.
    for (const d of AR_DIVISIONS) {
        assert.ok(
            getCompetition(d.competitionId) || UNPLAYABLE_COMPETITIONS.some((u) => u.id === d.competitionId),
            `${d.label} no se juega y no dice por qué`,
        );
    }
});

test('los ascensos y descensos no cruzan de rama ni de región', () => {
    for (const comp of COMPETITIONS) {
        for (const target of [comp.promotesTo, comp.relegatesTo, comp.feedsInto]) {
            if (!target) continue;
            assert.equal(getCompetition(target)?.ownerId, comp.ownerId, `${comp.name} → ${target} cruza de región`);
        }
    }
});

test('las ofertas de trabajo solo llevan a clubes y divisiones reales que se juegan', () => {
    const world = seedWorld();
    for (let seed = 1; seed <= 30; seed++) {
        for (const o of startingOffers(seed, world)) {
            assert.ok(getClub(o.clubId), `oferta a un club que no existe: ${o.clubId}`);
            assert.ok(getCompetition(o.competitionId), `oferta a una división que no se juega: ${o.competitionId}`);
            assert.equal(getClub(o.clubId)?.homeCompetitionId, o.competitionId);
        }
    }
    const state = createCareer(5, 'sb-los-tarcos', 'estratega');
    for (const o of jobOffers({ ...state, coach: { ...state.coach, reputation: 80 } })) {
        assert.ok(getCompetition(o.competitionId), `oferta a una división que no se juega: ${o.competitionId}`);
    }
});

test('los clubes sin ciudad verificada lo dicen en vez de inventarla', () => {
    for (const c of CLUBS) {
        assert.equal(c.pending, c.city === '', `${c.name}: pending=${c.pending} y ciudad "${c.city}"`);
    }
});
