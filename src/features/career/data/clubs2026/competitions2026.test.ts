import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ALL_COMPETITIONS,
    CUPS,
    LEAGUES_COMP,
    MOVEMENTS,
    PARALLEL_COMPETITIONS,
    PENDING_QUALIFICATIONS,
    getCompetition,
    participatingCompetitions,
    qualifiesFor,
    transferDestinations,
    type LeagueStanding,
} from './competitions2026.ts';
import { CLUBS } from '../clubs.ts';

const club = (name: string) => CLUBS.find((c) => c.name === name)!;
const cup = (id: string) => CUPS.find((c) => c.id === id)!;

function standing(competitionId: string, position: number, teams: number): LeagueStanding {
    return { competitionId, position, teams };
}

test('las copas NUNCA son destino de fichaje', () => {
    for (const c of CUPS) assert.equal(c.isTransferDestination, false, `${c.label} no debe ser destino`);
    const dests = transferDestinations();
    assert.ok(dests.every((d) => d.kind === 'league'), 'los destinos son solo ligas');
    const cupIds = new Set(CUPS.map((c) => c.id));
    assert.ok(!dests.some((d) => cupIds.has(d.id)), 'ninguna copa aparece como destino');
});

test('EPCR clasifica por POSICIÓN FINAL y PLAZAS, nunca por rating', () => {
    for (const id of ['champions-cup', 'challenge-cup']) {
        for (const rule of cup(id).qualification) {
            assert.ok(
                rule.criterion === 'league-position' || rule.criterion === 'invitation',
                `${id}: regla ${rule.criterion} no es posicional`,
            );
        }
    }

    // Plazas 2026/27: Champions 8+8+8 = 24; Challenge 8+6+2 + 2 invitados = 18.
    const slots = (id: string) => cup(id).qualification.reduce((sum, r) => sum + r.slots, 0);
    assert.equal(slots('champions-cup'), 24, 'Champions Cup = 24 plazas');
    assert.equal(cup('champions-cup').totalTeams, 24);
    assert.equal(slots('challenge-cup'), 18, 'Challenge Cup = 18 plazas');
    assert.equal(cup('challenge-cup').totalTeams, 18);
});

test('el rating NO decide la clasificación: misma posición ⇒ mismo resultado', () => {
    const strong = club('Leinster'); // rating 94
    const weak = club('Zebre Parma'); // rating 64
    const champions = cup('champions-cup');

    // Ambos 5º de URC → ambos clasifican, sin importar su fuerza.
    assert.ok(qualifiesFor(champions, strong, standing('urc', 5, 16)), 'Leinster 5º → Champions');
    assert.ok(qualifiesFor(champions, weak, standing('urc', 5, 16)), 'Zebre 5º → Champions (posición manda)');

    // Ambos 12º → ninguno clasifica, por muy fuerte que sea.
    assert.ok(!qualifiesFor(champions, strong, standing('urc', 12, 16)), 'Leinster 12º NO va a Champions');
    assert.ok(!qualifiesFor(champions, weak, standing('urc', 12, 16)), 'Zebre 12º NO va a Champions');

    // Y la Challenge recoge justo a los que quedaron fuera.
    assert.ok(qualifiesFor(cup('challenge-cup'), strong, standing('urc', 12, 16)), 'Leinster 12º → Challenge');
});

test('Champions y Challenge no se solapan (cero doble clasificación)', () => {
    const ranges = (id: string) =>
        cup(id).qualification
            .filter((r) => r.criterion === 'league-position')
            .map((r) => ({ src: r.sourceCompetitionId, from: r.fromPosition ?? 1, to: r.toPosition ?? 99 }));

    for (const a of ranges('champions-cup')) {
        for (const b of ranges('challenge-cup')) {
            if (a.src !== b.src) continue;
            assert.ok(a.to < b.from || b.to < a.from, `${a.src}: rangos solapados ${a.from}-${a.to} vs ${b.from}-${b.to}`);
        }
    }

    // Comprobación directa sobre clubes reales, posición por posición.
    for (const source of ['top14', 'urc', 'prem'] as const) {
        const teams = CLUBS.filter((c) => c.competitionId === source).length;
        const sample = CLUBS.find((c) => c.competitionId === source)!;
        for (let position = 1; position <= teams; position++) {
            const s = standing(source, position, teams);
            const inChampions = qualifiesFor(cup('champions-cup'), sample, s);
            const inChallenge = qualifiesFor(cup('challenge-cup'), sample, s);
            assert.ok(!(inChampions && inChallenge), `${source} pos ${position}: doble clasificación`);
        }
    }
});

test('las plazas de invitación quedan DOCUMENTADAS y sin asignar (no se inventan)', () => {
    const pending = PENDING_QUALIFICATIONS.find((p) => p.competitionId === 'challenge-cup');
    assert.ok(pending, 'los invitados de la Challenge deben figurar como pendientes');
    assert.equal(pending!.slots, 2, '2 plazas de invitación');
    // Nadie clasifica por invitación mientras no exista el dato real.
    const byInvitation = CLUBS.filter((c) => qualifiesFor(cup('challenge-cup'), c, standing('ninguna', 1, 1)));
    assert.equal(byInvitation.length, 0, 'ningún club entra por una plaza sin asignar');
});

test('participar en una copa es distinto de pertenecer a una liga', () => {
    const leinster = club('Leinster');
    const played = participatingCompetitions(leinster, standing('urc', 3, 16)).map((c) => c.id);
    assert.ok(played.includes('urc'), 'siempre disputa su liga');
    assert.ok(played.includes('champions-cup'), '3º de URC disputa la Champions');
    assert.ok(!played.includes('challenge-cup'), 'no disputa las dos copas europeas');

    const spanish = club('El Salvador');
    const spanishPlayed = participatingCompetitions(spanish, standing('esp-dh', 4, 10)).map((c) => c.id);
    assert.ok(spanishPlayed.includes('copa-del-rey'), 'club de DH → Copa del Rey (pertenencia)');
    assert.ok(!spanishPlayed.includes('supercopa-esp'), '4º de DH no juega la Supercopa');
    assert.ok(
        participatingCompetitions(spanish, standing('esp-dh', 1, 10)).some((c) => c.id === 'supercopa-esp'),
        'campeón de DH sí juega la Supercopa',
    );
});

test('cero ascensos/descensos entre competiciones PARALELAS', () => {
    for (const m of MOVEMENTS) {
        assert.ok(!PARALLEL_COMPETITIONS.has(m.from), `${m.from} es paralela: no asciende/desciende`);
        assert.ok(!PARALLEL_COMPETITIONS.has(m.to), `${m.to} es paralela: no asciende/desciende`);
    }
    assert.ok(PARALLEL_COMPETITIONS.has('sra'), 'Super Rugby Americas es paralela a las ligas domésticas');
});

test('los movimientos referencian ligas válidas del catálogo', () => {
    const leagueIds = new Set(LEAGUES_COMP.map((l) => l.id));
    for (const m of MOVEMENTS) {
        assert.ok(leagueIds.has(m.from), `liga inexistente en movimiento: ${m.from}`);
        assert.ok(leagueIds.has(m.to), `liga inexistente en movimiento: ${m.to}`);
    }
});

test('ids simbólicos AR/UY/CL presentes como ligas (resolubles con Supabase)', () => {
    const ids = new Set(LEAGUES_COMP.map((l) => l.id));
    for (const id of ['sa-ar', 'sa-uy', 'sa-cl']) {
        assert.ok(ids.has(id), `falta liga simbólica ${id}`);
    }
});

test('NO existe una "Copa Sudamericana" ficticia: la competición regional real es Super Rugby Americas', () => {
    assert.equal(getCompetition('sa-cup'), undefined, 'la copa inventada debe estar eliminada');
    for (const comp of ALL_COMPETITIONS) {
        assert.ok(!/sudamericana/i.test(comp.label), `competición ficticia presente: ${comp.label}`);
    }

    const sra = getCompetition('sra');
    assert.ok(sra, 'Super Rugby Americas debe existir');
    assert.equal(sra!.kind, 'league', 'es una liga regional, no una copa eliminatoria');
    assert.equal(sra!.scope, 'regional');
    assert.equal(sra!.isTransferDestination, true, 'sus franquicias sí son destino de carrera');
    assert.ok(transferDestinations().some((d) => d.id === 'sra'), 'aparece entre los destinos de fichaje');
});
