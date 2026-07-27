import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COMPETITION_LEVELS,
    COMPETITION_LEVELS_VERSION,
    economicModelOf,
    levelProfileOf,
    sportingBandOf,
} from './competition-levels2026.ts';
import { CLUBS, getClub } from './clubs.ts';
import { transferDestinations, CUPS } from './clubs2026/competitions2026.ts';
import { marketRung } from '../engine/market-routes.ts';

const bandOf = (clubName: string) => sportingBandOf(CLUBS.find((c) => c.name === clubName)!);

test('la versión de la tabla de niveles está sellada', () => {
    assert.equal(COMPETITION_LEVELS_VERSION, '2026-27.2');
    assert.ok(COMPETITION_LEVELS.length >= 20);
});

test('TODA liga destino de transferencia tiene perfil de nivel', () => {
    const missing = transferDestinations().filter((d) => levelProfileOf(d.id) === null);
    assert.deepEqual(missing.map((d) => d.id), [], 'ligas sin perfil de nivel');
});

test('TODO club resuelve sportingBand y economicModel sin fallback silencioso', () => {
    for (const club of CLUBS) {
        assert.ok(levelProfileOf(club.competitionId) !== null, `${club.name}: competición sin perfil (${club.competitionId})`);
        const band = sportingBandOf(club);
        assert.ok(Number.isInteger(band) && band >= 0 && band <= 8, `${club.name}: banda inválida ${band}`);
        assert.ok(['amateur', 'mixed', 'professional'].includes(economicModelOf(club)), `${club.name}: modelo inválido`);
    }
});

test('los clubes AR/UY/CL resuelven su banda por división real', () => {
    for (const code of ['ar', 'uy', 'cl']) {
        const clubs = CLUBS.filter((c) => c.competitionId === `sa-${code}`);
        assert.ok(clubs.length > 0, `sin clubes en sa-${code}`);
        for (const club of clubs) {
            assert.ok(club.divisionTier !== null && club.divisionTier !== undefined, `${club.name}: sin divisionTier`);
            const expected = { 1: 3, 2: 2, 3: 1, 4: 0 }[club.divisionTier as 1 | 2 | 3 | 4];
            assert.equal(sportingBandOf(club), expected, `${club.name} (tier ${club.divisionTier})`);
            assert.equal(economicModelOf(club), 'amateur', `${club.name}: el rugby doméstico es amateur`);
        }
    }
});

test('la jerarquía deportiva aprobada se cumple', () => {
    assert.ok(bandOf('Stade Toulousain') > bandOf('Provence Rugby'), 'Top 14 > Pro D2');
    assert.ok(bandOf('Provence Rugby') > bandOf('Albi'), 'Pro D2 > Nationale');
    assert.ok(bandOf('Saracens') > bandOf('Ealing Trailfinders'), 'PREM > Championship');
    assert.ok(bandOf('Crusaders') > bandOf('Canterbury'), 'Super Rugby > NPC');
    assert.ok(bandOf('Leinster') > bandOf('Blue Bulls'), 'URC > Currie Premier');
    assert.ok(bandOf('Blue Bulls') > bandOf('SWD Eagles'), 'Currie Premier > Currie First');
    assert.ok(bandOf('Saitama Wild Knights') > bandOf('Kyuden Voltex'), 'Japan D1 > D2');
    assert.ok(bandOf('Kyuden Voltex') > bandOf('LeRIRO Fukuoka'), 'Japan D2 > D3');
    assert.ok(bandOf('VRAC Valladolid') > bandOf('Barça Rugby'), 'España DH > DH Élite');
    assert.ok(bandOf('Barça Rugby') > bandOf('Aranda'), 'DH Élite > DHB');

    // SRA por encima de cualquier liga doméstica AR/UY/CL.
    const sraBand = bandOf('Dogos XV');
    for (const code of ['ar', 'uy', 'cl']) {
        const best = Math.max(...CLUBS.filter((c) => c.competitionId === `sa-${code}`).map(sportingBandOf));
        assert.ok(sraBand > best, `SRA (${sraBand}) debe superar a sa-${code} (${best})`);
    }
});

test('las franquicias SRA son profesionales y NO heredan el amateurismo doméstico', () => {
    for (const club of CLUBS.filter((c) => c.competitionId === 'sra')) {
        assert.equal(economicModelOf(club), 'professional', `${club.name}`);
    }
    assert.equal(economicModelOf(getClub('penarol-rugby')), 'professional', 'Peñarol Rugby es SRA, no liga uruguaya');
    assert.equal(economicModelOf(getClub('selknam')), 'professional', 'Selknam es SRA, no liga chilena');
});

test('el modelo económico aprobado se respeta', () => {
    const model = (id: string) => levelProfileOf(id)!.economicModel;
    for (const id of ['top14', 'prod2', 'prem', 'championship', 'urc', 'super-rugby', 'npc', 'sra', 'jpn-d1']) {
        assert.equal(model(id), 'professional', `${id} debería ser profesional`);
    }
    for (const id of ['nationale', 'currie-premier', 'currie-first', 'super-cup', 'jpn-d2', 'jpn-d3', 'esp-dh', 'esp-dhelite']) {
        assert.equal(model(id), 'mixed', `${id} debería ser mixta`);
    }
    for (const id of ['esp-dhb', 'sa-ar', 'sa-uy', 'sa-cl']) {
        assert.equal(model(id), 'amateur', `${id} debería ser amateur`);
    }
});

test('el escalafón de mercado se DERIVA de la banda: una sola tabla', () => {
    for (const club of CLUBS) {
        assert.equal(marketRung(club), sportingBandOf(club), `${club.name}: dos tablas en desacuerdo`);
    }
});

test('ninguna copa tiene perfil de liga ni aparece como destino', () => {
    const destinationIds = new Set(transferDestinations().map((d) => d.id));
    for (const cup of CUPS) {
        assert.equal(levelProfileOf(cup.id), null, `${cup.label} no debe tener perfil de liga`);
        assert.ok(!destinationIds.has(cup.id), `${cup.label} no puede ser destino`);
    }
});

test('cada perfil declara fuente y tipo de evidencia', () => {
    for (const profile of COMPETITION_LEVELS) {
        assert.ok(profile.sourceUrls.length > 0, `${profile.competitionId}: sin fuente`);
        assert.ok(
            ['official', 'official-structure-inferred-status', 'game-calibration'].includes(profile.evidence),
            `${profile.competitionId}: evidencia inválida`,
        );
        assert.ok(profile.label.length > 0);
    }
    // Uruguay y Chile quedan marcados como INFERENCIA, no como hecho jurídico.
    for (const id of ['sa-uy', 'sa-cl']) {
        assert.equal(levelProfileOf(id)!.evidence, 'official-structure-inferred-status', `${id}`);
    }
});

test('el NOMBRE del club no determina nivel ni contrato', () => {
    // Dos clubes con "Universitario" en el nombre, en competiciones distintas,
    // deben resolver por su competición y división, no por el texto.
    const universitarios = CLUBS.filter((c) => /universitario/i.test(c.name));
    assert.ok(universitarios.length >= 2, 'hace falta más de un club homónimo para la prueba');
    const bands = new Set(universitarios.map(sportingBandOf));
    assert.ok(bands.size >= 1, 'la banda sale de la competición');
    for (const club of universitarios) {
        assert.equal(sportingBandOf(club), sportingBandOf({ ...club, name: 'XXXX', labelEs: 'XXXX' }), `${club.name}`);
    }
});
