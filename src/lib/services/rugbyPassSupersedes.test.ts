import test from 'node:test';
import assert from 'node:assert/strict';

import {
    RUGBYPASS_NUNCA_REEMPLAZA,
    competitionsWithoutSupersede,
    estaProtegido,
    isSupersededByRugbyPass,
    matchesSupersededTournament,
    normalizeTournamentKey,
    rugbyPassCompetitionIdOf,
    supersedingEntry,
} from './rugbyPassSupersedes.ts';

test('el torneo que trae RugbyPass se apaga por id del catalogo', () => {
    assert.equal(matchesSupersededTournament({ tournamentId: 'rugby-france-top-14' }), true);
    assert.equal(matchesSupersededTournament({ tournamentId: 'rugby-nz-bunnings-npc' }), true);
    assert.equal(matchesSupersededTournament({ tournamentId: 'rugby-united-rugby-championship' }), true);
});

test('EL TOP 14 ARGENTINO NO SE APAGA', () => {
    // Mismo nombre que el frances y otra competicion. Es la razon por la que el
    // filtro no puede decidir por nombre solo.
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'Top 14', countryName: 'Argentina' }),
        false
    );
    assert.equal(matchesSupersededTournament({ tournamentId: 'rugby-argentina-top-14' }), false);
    // Y el frances si.
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'Top 14', countryName: 'France' }),
        true
    );
});

test('un nombre sin pais nunca alcanza para apagar un torneo', () => {
    assert.equal(matchesSupersededTournament({ tournamentName: 'Top 14' }), false);
    assert.equal(matchesSupersededTournament({ tournamentName: 'Pro D2' }), false);
});

test('la URC llega con el pais rotulado distinto segun el proveedor', () => {
    for (const country of ['International', 'Europe', 'World', 'Internacional']) {
        assert.equal(
            matchesSupersededTournament({ tournamentName: 'United Rugby Championship', countryName: country }),
            true,
            `deberia apagarse con pais=${country}`
        );
    }
});

test('la URL tambien alcanza, porque lleva el pais adentro', () => {
    assert.equal(
        matchesSupersededTournament({ tournamentUrl: '/rugby-union/france/pro-d2/' }),
        true
    );
    assert.equal(
        matchesSupersededTournament({ tournamentUrl: '/rugby-union/argentina/top-14/' }),
        false
    );
});

test('el enriquecido guarda el torneo anidado y tambien se reconoce', () => {
    // Es la forma que arma `mapCachedToEnrichedMatch` y la que llega al dedupe.
    assert.equal(
        matchesSupersededTournament({ tournament: { name: 'Premiership Rugby', country: 'England' } }),
        true
    );
    assert.equal(
        matchesSupersededTournament({ tournament: { id: 'rugby-france-top-14' } }),
        true
    );
});

test('la Premiership Cup y la Premiership Women NO las cubre RugbyPass', () => {
    // Se apaga 'Premiership Rugby', no cualquier cosa que empiece igual.
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'Premiership Rugby Cup', countryName: 'England' }),
        false
    );
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'Premiership Women', countryName: 'England' }),
        false
    );
});

test('una fila de RugbyPass nunca se reemplaza a si misma', () => {
    const fila = { id: 'rp-946625', tournamentName: 'Hilux NPC', countryName: 'Nueva Zelanda' };
    assert.equal(isSupersededByRugbyPass(fila), false);
    // La misma fila sin el prefijo si se apagaria: la que manda es la fuente.
    assert.equal(isSupersededByRugbyPass({ ...fila, id: 'trgyZr5s' }), true);
});

test('un torneo que nadie reemplaza pasa de largo', () => {
    assert.equal(
        isSupersededByRugbyPass({ id: 'trgyZr5s', tournamentName: 'Currie Cup', countryName: 'South Africa' }),
        false
    );
    assert.equal(isSupersededByRugbyPass({ id: 'ra-761228' }), false);
});

test('Internationals es la unica competicion habilitada sin reemplazo', () => {
    // Si esto crece, alguien sumo una competicion y se olvido de apagar la de
    // FlashScore — que es justo lo que produce el partido duplicado.
    assert.deepEqual(competitionsWithoutSupersede(), [3]);
});

test('los nombres se comparan sin acentos ni puntuacion', () => {
    assert.equal(normalizeTournamentKey('  Pro  D2. '), 'pro d2');
    assert.equal(normalizeTournamentKey('Nueva Zelanda'), 'nueva zelanda');
});

test('FlashScore mete el pais DENTRO del nombre y el pais real llega vacio', () => {
    // La fila que seguia saliendo: "Internacional: New Zealand: Bunnings NPC".
    // En rugby FlashScore no manda country_name, asi que el mapper cae a
    // 'International' y el pais queda pegado al nombre.
    assert.equal(
        matchesSupersededTournament({
            tournamentName: 'New Zealand: Bunnings NPC',
            countryName: 'International',
        }),
        true
    );
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'France: Top 14', countryName: 'International' }),
        true
    );
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'France: Pro D2', countryName: 'International' }),
        true
    );
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'England: Premiership Rugby', countryName: 'International' }),
        true
    );
});

test('con el pais adentro del nombre, el Top 14 argentino SIGUE vivo', () => {
    assert.equal(
        matchesSupersededTournament({ tournamentName: 'Argentina: Top 14', countryName: 'International' }),
        false
    );
    // Y la Premiership Cup tampoco se lleva puesta.
    assert.equal(
        matchesSupersededTournament({
            tournamentName: 'England: Premiership Rugby Cup',
            countryName: 'International',
        }),
        false
    );
});

test('los ids opacos de FlashScore alcanzan solos', () => {
    // El Top 14 frances es 6LLKpkiU y el argentino ILOhakKD.
    assert.equal(matchesSupersededTournament({ leagueId: '6LLKpkiU' }), true);
    assert.equal(matchesSupersededTournament({ leagueId: 'ILOhakKD' }), false);
    assert.equal(matchesSupersededTournament({ leagueId: 'jZAJkgK7' }), true);
    assert.equal(matchesSupersededTournament({ leagueId: 'EyHYm58U' }), true);
});

test('el Match de FlashScore nombra los campos league*, no tournament*', () => {
    // Con los nombres equivocados el filtro recibia undefined y no apagaba nada.
    assert.equal(
        isSupersededByRugbyPass({
            id: 'trgyZr5s',
            leagueName: 'New Zealand: Bunnings NPC',
            leagueUrl: '/rugby-union/new-zealand/bunnings-npc/',
            countryName: 'International',
        }),
        true
    );
});

test('SIN datos de RugbyPass no se apaga nada: apagar seria destruir', () => {
    // El bug: el cron todavia no habia corrido, no habia una sola fila `rp-`, y
    // el filtro apago igual los seis torneos. La pantalla quedo vacia.
    const npcDeFlashScore = {
        id: 'trgyZr5s',
        tournamentName: 'New Zealand: Bunnings NPC',
        countryName: 'International',
    };
    const sinCobertura = new Set<number>();
    assert.equal(isSupersededByRugbyPass(npcDeFlashScore, sinCobertura), false);

    // Con la competicion cubierta (208 = Hilux NPC) si se apaga.
    assert.equal(isSupersededByRugbyPass(npcDeFlashScore, new Set([208])), true);

    // Y la cobertura de OTRA competicion no lo salva ni lo condena.
    assert.equal(isSupersededByRugbyPass(npcDeFlashScore, new Set([203])), false);
});

test('la competicion de una fila de RugbyPass se lee de su tournamentId', () => {
    assert.equal(rugbyPassCompetitionIdOf({ id: 'rp-950809', tournamentId: 'rp-comp-208' }), 208);
    assert.equal(rugbyPassCompetitionIdOf({ id: 'rp-1', tournament: { id: 'rp-comp-203' } }), 203);
    // Una fila que no es de RugbyPass no cubre nada, aunque el id del torneo lo parezca.
    assert.equal(rugbyPassCompetitionIdOf({ id: 'trgyZr5s', tournamentId: 'rp-comp-208' }), null);
    assert.equal(rugbyPassCompetitionIdOf({ id: 'rp-1', tournamentId: 'otra-cosa' }), null);
});

test('supersedingEntry dice CUAL competicion reemplaza, no solo que si', () => {
    assert.equal(supersedingEntry({ tournamentName: 'France: Pro D2' })?.rugbyPassCompetitionId, 211);
    assert.equal(supersedingEntry({ leagueId: '6LLKpkiU' })?.rugbyPassCompetitionId, 203);
    assert.equal(supersedingEntry({ tournamentName: 'Argentina: Top 14' }), null);
});

// ── Lo que RugbyPass no apaga nunca ────────────────────────────────────────

test('Super Rugby Americas no se apaga: RugbyPass ni siquiera la publica', () => {
    // Medido: no esta entre las 36 competiciones del feed ni entre las 32 del
    // catalogo, y ninguno de sus clubes (Dogos, Pampas, Penarol, Selknam,
    // Yacare, Tarucas) aparece en los 299 equipos de /teams/.
    assert.equal(estaProtegido({ tournamentName: 'Super Rugby Americas' }), true);
    // FlashScore mete el pais ADENTRO del nombre en rugby.
    assert.equal(estaProtegido({ leagueName: 'South America: Super Rugby Americas' }), true);
    assert.equal(supersedingEntry({ tournamentName: 'Super Rugby Americas' }), null);
});

test('el Americas Rugby Championship tampoco: su dato esta abandonado', () => {
    assert.equal(estaProtegido({ tournamentName: 'Americas Rugby Championship' }), true);
    assert.equal(supersedingEntry({ leagueName: 'Americas Rugby Championship' }), null);
});

test('la proteccion gana incluso con el id exacto de un torneo reemplazado', () => {
    // Si una fila llegara rotulada como protegida pero con el id del Top 14
    // frances, manda la proteccion: apagarla seria justo lo que no se quiere.
    assert.equal(
        supersedingEntry({ tournamentId: 'rugby-france-top-14', tournamentName: 'Super Rugby Americas' }),
        null
    );
});

test('proteger no apaga lo que si tiene que reemplazarse', () => {
    // La guarda no puede volverse un colador: el Top 14 frances sigue cayendo.
    const entrada = supersedingEntry({ tournamentId: 'rugby-france-top-14' });
    assert.notEqual(entrada, null);
    assert.equal(entrada?.rugbyPassCompetitionId, 203);
});

test('cada competicion protegida dice POR QUE lo esta', () => {
    // El motivo es el dato que evita que alguien la saque sin medir de nuevo.
    assert.equal(RUGBYPASS_NUNCA_REEMPLAZA.length, 2);
    for (const c of RUGBYPASS_NUNCA_REEMPLAZA) {
        assert.ok(c.reason.length > 20, `${c.name} tiene que explicar el motivo`);
    }
});
