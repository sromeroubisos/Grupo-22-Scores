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
import {
    AR_DIVISIONS,
    NACIONAL_DE_CLUBES_ID,
    TDI_A_ID,
    TDI_A_SLOTS,
    TDI_B_ID,
    TDI_B_SLOTS,
    TDI_CUPOS_2026,
} from './arSystem2026.ts';
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

test('ids simbólicos UY/CL presentes como ligas (resolubles con Supabase)', () => {
    const ids = new Set(LEAGUES_COMP.map((l) => l.id));
    for (const id of ['sa-uy', 'sa-cl']) {
        assert.ok(ids.has(id), `falta liga simbólica ${id}`);
    }
    // Argentina ya no es una liga paraguas: cada división es su competición.
    assert.ok(!ids.has('sa-ar'), 'sa-ar dejó de existir como liga');
});

test('cada división argentina es una liga del grafo y destino de fichaje', () => {
    const byId = new Map(LEAGUES_COMP.map((l) => [l.id, l]));
    const destinations = new Set(transferDestinations().map((d) => d.id));
    for (const division of AR_DIVISIONS) {
        const league = byId.get(division.competitionId);
        assert.ok(league, `falta la liga ${division.competitionId}`);
        assert.equal(league!.label, division.label, `${division.competitionId}: etiqueta`);
        assert.equal(league!.totalTeams, division.clubs.length, `${division.competitionId}: plantel`);
        assert.ok(destinations.has(division.competitionId), `${division.label} debe ser destino de fichaje`);
    }
});

test('los ascensos argentinos NUNCA cruzan de rama (URBA ↔ interior)', () => {
    const branchOf = new Map(AR_DIVISIONS.map((d) => [d.competitionId, d.branch]));
    const arMovements = MOVEMENTS.filter((m) => branchOf.has(m.from) || branchOf.has(m.to));
    assert.ok(arMovements.length > 0, 'el sistema argentino debe declarar ascensos');
    for (const m of arMovements) {
        assert.equal(
            branchOf.get(m.from), branchOf.get(m.to),
            `${m.from} → ${m.to}: un club de la URBA no puede ascender al interior ni al revés`,
        );
    }
});

test('el TDI reparte 16 y 16 plazas, y no es una escalera', () => {
    const sum = (id: string) => getCompetition(id)!.qualification.reduce((acc, r) => acc + r.slots, 0);
    assert.equal(sum(TDI_A_ID), TDI_A_SLOTS, 'TDI A = 16 clasificados');
    assert.equal(sum(TDI_B_ID), TDI_B_SLOTS, 'TDI B = 16 clasificados');
    // Las plazas son de la REGIÓN: no hay ascenso ni descenso entre A y B.
    for (const m of MOVEMENTS) {
        assert.ok(m.from !== TDI_A_ID && m.to !== TDI_A_ID, 'el TDI A no participa de ascensos');
        assert.ok(m.from !== TDI_B_ID && m.to !== TDI_B_ID, 'el TDI B no participa de ascensos');
    }
});

test('el Nacional de Clubes es el único cruce entre las dos ramas', () => {
    const nacional = getCompetition(NACIONAL_DE_CLUBES_ID);
    assert.ok(nacional, 'el Nacional de Clubes debe existir');
    assert.equal(nacional!.kind, 'super-cup');
    assert.equal(nacional!.isTransferDestination, false, 'una copa nunca es destino');
    const sources = nacional!.qualification.map((r) => r.sourceCompetitionId);
    assert.ok(sources.includes('ar-urba-top14'), 'entra el campeón del Top 14');
    // Y del otro lado, solo primeras divisiones del interior con cupo al TDI A.
    const interiorSources = TDI_CUPOS_2026.filter((c) => c.tdiA > 0).map((c) => c.sourceCompetitionId);
    for (const id of interiorSources) {
        assert.ok(sources.includes(id), `falta el campeón de ${id}`);
    }
    for (const rule of nacional!.qualification) {
        assert.equal(rule.fromPosition, 1, 'solo entra el campeón');
        assert.equal(rule.toPosition, 1, 'solo entra el campeón');
    }
});

test('las copas nuevas se disputan por PERTENENCIA a su liga, y no son destino', () => {
    for (const [id, league, teams] of [
        ['taca-portugal', 'pt-honra', 12],
        ['coppa-italia', 'ita-serie-a-elite', 10],
    ] as const) {
        const c = getCompetition(id);
        assert.ok(c, `falta ${id}`);
        assert.equal(c!.kind, 'knockout-cup');
        assert.equal(c!.isTransferDestination, false, 'una copa nunca es destino de fichaje');
        // Un club de la liga la juega siempre; uno de afuera, nunca.
        const propio = CLUBS.find((x) => x.competitionId === league)!;
        const ajeno = CLUBS.find((x) => x.competitionId === 'top14')!;
        assert.ok(qualifiesFor(c!, propio, standing(league, 8, teams)), `${propio.name} debería jugar ${id}`);
        assert.ok(!qualifiesFor(c!, ajeno, standing('top14', 1, 14)), `${ajeno.name} no juega ${id}`);
    }

    // La Supertaça portuguesa es campeón de liga contra campeón de copa, aproximada
    // con los dos primeros: el 3º no entra.
    const supertaca = getCompetition('supertaca-pt')!;
    const pt = CLUBS.find((c) => c.competitionId === 'pt-honra')!;
    assert.equal(supertaca.kind, 'super-cup');
    assert.ok(qualifiesFor(supertaca, pt, standing('pt-honra', 1, 12)), 'el campeón juega la Supertaça');
    assert.ok(!qualifiesFor(supertaca, pt, standing('pt-honra', 3, 12)), 'el 3º no la juega');
});

test('Italia es la única de las cinco ligas nuevas con ascenso declarado', () => {
    // Y las tres ausencias son deliberadas, cada una por un motivo distinto: EE.UU.
    // no tiene ascensos (liga cerrada + dos pirámides paralelas), y Portugal y Brasil
    // sí los tienen en la realidad pero les falta cargado el escalón de abajo.
    const nuevas = ['us-mlr', 'us-d1a', 'us-ncr-d1', 'pt-honra', 'ita-serie-a-elite', 'ita-serie-a', 'br-super12'];
    const conMovimiento = new Set(MOVEMENTS.flatMap((m) => [m.from, m.to]));
    for (const id of nuevas) {
        const esperado = id === 'ita-serie-a-elite' || id === 'ita-serie-a';
        assert.equal(conMovimiento.has(id), esperado, `${id}: ascenso declarado inesperado`);
    }
    // El intercambio italiano es de uno por uno: la Élite queda congelada en 10.
    const sube = MOVEMENTS.find((m) => m.from === 'ita-serie-a' && m.direction === 'promotion')!;
    const baja = MOVEMENTS.find((m) => m.from === 'ita-serie-a-elite' && m.direction === 'relegation')!;
    assert.equal(sube.to, 'ita-serie-a-elite');
    assert.equal(baja.to, 'ita-serie-a');
    assert.equal(sube.slots, baja.slots, 'con la Élite congelada en 10, sube uno y baja uno');

    // Y las tres estadounidenses son PARALELAS: ni entre ellas ni con nadie.
    for (const id of ['us-mlr', 'us-d1a', 'us-ncr-d1']) {
        assert.ok(PARALLEL_COMPETITIONS.has(id), `${id} debería ser paralela`);
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
