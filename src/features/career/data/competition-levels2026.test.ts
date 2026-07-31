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
import { AR_DIVISIONS, AR_SPORTING_BAND, arDivisionOf, isArDivision } from './clubs2026/arSystem2026.ts';
import { marketRung } from '../engine/market-routes.ts';

const bandOf = (clubName: string) => sportingBandOf(CLUBS.find((c) => c.name === clubName)!);

test('la versión de la tabla de niveles está sellada', () => {
    // 2026-27.5: `maxSigningAgeOf` — las competiciones universitarias dejan de
    // fichar adultos. Es un dato de la competición, así que sube esta versión.
    assert.equal(COMPETITION_LEVELS_VERSION, '2026-27.5');
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

test('los clubes UY/CL resuelven su banda por división real', () => {
    for (const code of ['uy', 'cl']) {
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

test('los clubes argentinos resuelven su banda por el NIVEL DEL CANON de su división', () => {
    const clubs = CLUBS.filter((c) => isArDivision(c.competitionId));
    assert.ok(clubs.length >= 200, `esperaba el sistema completo, hay ${clubs.length} clubes`);
    for (const club of clubs) {
        const division = arDivisionOf(club.competitionId)!;
        assert.equal(club.divisionTier, division.canonLevel, `${club.name}: nivel del canon`);
        assert.equal(sportingBandOf(club), AR_SPORTING_BAND[division.canonLevel], `${club.name} (${division.label})`);
        assert.equal(economicModelOf(club), 'amateur', `${club.name}: el rugby de clubes argentino es amateur`);
    }
});

test('LA FRONTERA INVIOLABLE: URBA Primera B por encima de todo el interior salvo las tres excepciones', () => {
    const ratingsOf = (competitionId: string) =>
        CLUBS.filter((c) => c.competitionId === competitionId).map((c) => c.rating);

    const primeraB = ratingsOf('ar-urba-primera-b');
    assert.ok(primeraB.length > 0, 'falta URBA Primera B');
    const pisoPrimeraB = Math.min(...primeraB);

    // Las tres excepciones: sus PRIMERAS divisiones compiten de igual a igual.
    const excepciones = new Set(['ar-centro-top10', 'ar-litoral-top10', 'ar-oeste-oro']);
    const interior = AR_DIVISIONS.filter((d) => d.branch === 'interior' && !excepciones.has(d.competitionId));

    for (const division of interior) {
        const techo = Math.max(...ratingsOf(division.competitionId));
        assert.ok(
            techo < pisoPrimeraB,
            `${division.label}: techo ${techo} debe quedar por debajo del piso de Primera B (${pisoPrimeraB})`,
        );
    }

    // Y las tres excepciones SÍ lo superan: para eso son excepciones.
    for (const id of excepciones) {
        const techo = Math.max(...ratingsOf(id));
        assert.ok(techo > pisoPrimeraB, `${id}: una excepción debe superar el piso de Primera B`);
    }
});

test('la jerarquía argentina no se invierte y el Top 14 es la cima', () => {
    const techo = (id: string) => Math.max(...CLUBS.filter((c) => c.competitionId === id).map((c) => c.rating));
    // Escalera de la URBA, de la cima a la base.
    const urba = [
        'ar-urba-top14', 'ar-urba-primera-a', 'ar-urba-primera-b', 'ar-urba-primera-c',
        'ar-urba-segunda', 'ar-urba-tercera', 'ar-urba-desarrollo',
    ];
    for (let i = 1; i < urba.length; i++) {
        assert.ok(techo(urba[i]) < techo(urba[i - 1]), `${urba[i]} no puede superar a ${urba[i - 1]}`);
    }
    // El Top 14 es lo más alto de TODO el rugby de clubes argentino.
    const maxAr = Math.max(...CLUBS.filter((c) => isArDivision(c.competitionId)).map((c) => c.rating));
    assert.equal(techo('ar-urba-top14'), maxAr, 'la cima del sistema es el URBA Top 14');
    // A igual nivel, la URBA queda apenas arriba del interior (ventaja leve).
    assert.ok(techo('ar-urba-primera-a') > techo('ar-centro-top10'), 'Primera A apenas arriba de Córdoba');
    assert.ok(techo('ar-urba-primera-a') > techo('ar-litoral-top10'), 'Primera A apenas arriba del Litoral');
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

    // Las cinco ligas nuevas, y cada línea protege una decisión que se puede
    // discutir. Si alguien la cambia, tiene que romper un test y no un silencio.
    assert.ok(bandOf('Chicago Hounds') > bandOf('California'), 'MLR > universitario D1A');
    assert.ok(bandOf('California') > bandOf('Brown'), 'D1A (máxima de facto) > NCR DI');
    assert.ok(bandOf('Valorugby Emilia') > bandOf('Rugby Calvisano'), 'Serie A Élite > Serie A');
    assert.ok(bandOf('Benfica') > bandOf('Jacareí'), 'Divisão de Honra > Super 12');
    // LA CLAVE ITALIANA: el campeón nacional NO es el mejor club de Italia. Benetton
    // y Zebre están fuera de la pirámide doméstica, financiadas por la FIR, y viven
    // dos bandas y media por encima del que pelea el Scudetto.
    assert.ok(
        bandOf('Benetton Treviso') - bandOf('Valorugby Emilia') >= 2,
        'las franquicias URC tienen que quedar lejos del campeón doméstico italiano',
    );
    // El Super 12 no puede empatar con la cima argentina: si empatara, Cobras
    // quedaría a ±1 escalón del brasileño y la vía declarada dejaría de hacer falta,
    // que es el error que se corrigió en Argentina.
    const cobrasBand = bandOf('Cobras Brasil Rugby');
    const bestBr = Math.max(...CLUBS.filter((c) => c.competitionId === 'br-super12').map(sportingBandOf));
    assert.ok(cobrasBand - bestBr >= 2, `Cobras (${cobrasBand}) debe quedar a más de un escalón del Super 12 (${bestBr})`);

    // SRA por encima de cualquier liga doméstica AR/UY/CL: el salto al
    // profesionalismo tiene que seguir siendo un salto.
    const sraBand = bandOf('Dogos XV');
    for (const code of ['uy', 'cl']) {
        const best = Math.max(...CLUBS.filter((c) => c.competitionId === `sa-${code}`).map(sportingBandOf));
        assert.ok(sraBand > best, `SRA (${sraBand}) debe superar a sa-${code} (${best})`);
    }
    const bestAr = Math.max(...CLUBS.filter((c) => isArDivision(c.competitionId)).map(sportingBandOf));
    assert.ok(sraBand > bestAr, `SRA (${sraBand}) debe superar al URBA Top 14 (${bestAr})`);
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
    // La MLR entra acá y no en las mixtas: tiene convenio colectivo firmado con la
    // USRPA (febrero de 2026) y jugadores a tiempo completo. Que el tope salarial
    // ronde los 500.000 USD por club es un dato de NIVEL —y por eso comparte banda
    // con Super Rugby Americas— no de vínculo laboral. Son dos ejes distintos y este
    // test cuida el económico.
    for (const id of ['top14', 'prod2', 'prem', 'championship', 'urc', 'super-rugby', 'npc', 'sra', 'jpn-d1', 'us-mlr']) {
        assert.equal(model(id), 'professional', `${id} debería ser profesional`);
    }
    for (const id of ['nationale', 'currie-premier', 'currie-first', 'super-cup', 'jpn-d2', 'jpn-d3', 'esp-dh', 'esp-dhelite', 'pt-honra', 'ita-serie-a-elite']) {
        assert.equal(model(id), 'mixed', `${id} debería ser mixta`);
    }
    // El universitario estadounidense es amateur porque el rugby masculino NO es
    // deporte NCAA: no hay beca de equivalencia ni salario, las becas se articulan
    // caso por caso. Y el Super 12 brasileño lo declara la propia CBRu.
    for (const id of ['esp-dhb', 'sa-uy', 'sa-cl', 'us-d1a', 'us-ncr-d1', 'ita-serie-a', 'br-super12']) {
        assert.equal(model(id), 'amateur', `${id} debería ser amateur`);
    }
    // Todo el rugby de clubes argentino es amateur por regulación de la UAR.
    for (const division of AR_DIVISIONS) {
        assert.equal(model(division.competitionId), 'amateur', `${division.label} debería ser amateur`);
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
