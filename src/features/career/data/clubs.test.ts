import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, LEAGUES, clubLeague, CLUB_CATALOG_VERSION } from './clubs.ts';
import type { ClubLevel } from './clubs2026/rosters2026.ts';
import { ROSTERS_2026_27, EXPECTED_COUNTS, PENDING_COMPETITIONS, CATALOG_SEASON, ESP_DHB_TARGET, LEVEL_RATING } from './clubs2026/rosters2026.ts';
import { CLUB_STRENGTH } from './clubs2026/clubStrength.ts';

// Orden de la pirámide, de más fuerte a más flojo.
const LEVEL_ORDER: ClubLevel[] = [
    'elite-world', 'elite-pro', 'pro-second', 'pro-regional', 'semipro', 'development', 'amateur',
];

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

test('cero clubes duplicados (ids únicos)', () => {
    const ids = CLUBS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'hay ids de club duplicados');
});

test('todos los rosters estáticos están presentes (mismo total)', () => {
    const total = ROSTERS_2026_27.reduce((sum, g) => sum + g.clubs.length, 0);
    const staticClubs = CLUBS.filter((c) => c.source === 'career-static');
    assert.equal(staticClubs.length, total, `esperaba ${total} clubes estáticos, hay ${staticClubs.length}`);
});

test('cero clubes en divisiones incorrectas', () => {
    for (const group of ROSTERS_2026_27) {
        for (const name of group.clubs) {
            const club = CLUBS.find((c) => c.name === name);
            assert.ok(club, `club faltante: ${name}`);
            assert.equal(club.competitionId, group.competitionId, `${name} en competición incorrecta`);
            assert.equal(club.level, group.level, `${name} con nivel incorrecto`);
        }
    }
});

test('el nivel del club es consistente con su liga', () => {
    for (const club of CLUBS) {
        const league = clubLeague(club.id);
        assert.ok(league, `liga faltante para ${club.name}`);
        assert.equal(league.level, club.level, `${club.name}: nivel de club vs liga`);
        assert.ok(LEAGUES[club.competitionId], `competición no registrada: ${club.competitionId}`);
    }
});

test('todo club ESTÁTICO tiene fuerza EXPLÍCITA (no hash ni solo-nivel)', () => {
    // Los clubes AR/UY/CL no usan CLUB_STRENGTH: su rating sale de resultados
    // reales (división disputada + rendimiento), no de una tabla escrita a mano.
    const missing = CLUBS.filter((c) => c.source === 'career-static' && !CLUB_STRENGTH[c.name]);
    assert.equal(missing.length, 0, `sin strength explícito: ${missing.map((c) => c.name).join(', ')}`);
});

test('los ratings varían dentro de cada competición', () => {
    const byComp = new Map<string, number[]>();
    for (const c of CLUBS) {
        const arr = byComp.get(c.competitionId) ?? [];
        arr.push(c.rating);
        byComp.set(c.competitionId, arr);
    }
    for (const [comp, ratings] of byComp) {
        if (ratings.length >= 4) {
            assert.ok(new Set(ratings).size >= 3, `${comp}: ratings casi uniformes`);
        }
    }
});

test('los clubes fuertes superan ampliamente a los flojos de su competición', () => {
    const r = (name: string) => CLUBS.find((c) => c.name === name)?.rating ?? 0;
    assert.ok(r('Stade Toulousain') > r('RC Vannes') + 15, 'Toulouse >> Vannes');
    assert.ok(r('Leinster') > r('Zebre Parma') + 15, 'Leinster >> Zebre');
    assert.ok(r('Crusaders') > r('Moana Pasifika') + 15, 'Crusaders >> Moana');
    assert.ok(r('Saitama Wild Knights') > r('BlackRams Tokyo') + 5, 'Saitama > BlackRams');
});

test('todo club tiene shortName y país', () => {
    for (const club of CLUBS) {
        assert.ok(club.shortName && club.shortName.length > 0, `sin shortName: ${club.name}`);
        assert.ok(club.countryCode && club.countryCode.length > 0, `sin país: ${club.name}`);
    }
});

test('la versión de catálogo está sellada', () => {
    assert.ok(CLUB_CATALOG_VERSION && CLUB_CATALOG_VERSION.length > 0);
});

test('cada competición tiene el conteo EXACTO exigido (sin mezclar temporadas)', () => {
    for (const g of ROSTERS_2026_27) {
        const expected = EXPECTED_COUNTS[g.competitionId];
        assert.ok(expected !== undefined, `sin conteo esperado: ${g.competitionId}`);
        assert.equal(g.clubs.length, expected, `${g.competitionId}: ${g.clubs.length} != ${expected}`);
    }
});

test('Japón 2026/27 exige 12/8/7 (total 27) y España DH/Élite exige 10/10', () => {
    const count = (id: string) => ROSTERS_2026_27.find((g) => g.competitionId === id)?.clubs.length ?? 0;
    assert.equal(count('jpn-d1'), 12, 'Japan D1 = 12');
    assert.equal(count('jpn-d2'), 8, 'Japan D2 = 8');
    assert.equal(count('jpn-d3'), 7, 'Japan D3 = 7 (2026/27, no el de 6 de 2025/26)');
    assert.equal(count('jpn-d1') + count('jpn-d2') + count('jpn-d3'), 27, 'Japón total = 27');
    assert.ok(count('jpn-d3') > 0 && ROSTERS_2026_27.find((g) => g.competitionId === 'jpn-d3')?.clubs.includes("AZ-COM MARUWA Momotaro's"), 'D3 incluye al nuevo Momotaro\'s');
    assert.equal(count('esp-dh'), 10, 'DH = 10');
    assert.equal(count('esp-dhelite'), 10, 'DH Élite = 10');
});

test('DHB: 24 cargados (A/B/C de iSquad) + Grupo D pendiente, objetivo 32', () => {
    const dhb = ROSTERS_2026_27.find((g) => g.competitionId === 'esp-dhb');
    assert.ok(dhb, 'DHB debe estar cargada');
    assert.equal(dhb!.clubs.length, 24, 'DHB A/B/C = 24 clubes');
    assert.equal(new Set(dhb!.clubs).size, 24, 'sin duplicados en DHB');
    assert.equal(ESP_DHB_TARGET, 32, 'objetivo DHB = 32');
    const grupoD = PENDING_COMPETITIONS.find((c) => c.competitionId === 'esp-dhb-grupo-d');
    assert.ok(grupoD && grupoD.expectedCount === 8, 'Grupo D (8) documentado como pendiente');
});

test('todo el catálogo es de la misma temporada (2026-27)', () => {
    for (const c of CLUBS) assert.equal(c.seasonVersion, CATALOG_SEASON, `${c.name} de otra temporada`);
});

test('jerarquías deportivas concretas (no solo bandas)', () => {
    const r = (name: string) => CLUBS.find((c) => c.name === name)?.rating ?? 0;
    assert.ok(r('Stade Toulousain') > r('USA Perpignan'), 'Top14: Toulouse > Perpignan');
    assert.ok(r('Leinster') > r('Dragons') && r('Dragons') > r('Zebre Parma'), 'URC: Leinster > Dragons > Zebre');
    assert.ok(r('Crusaders') > r('Chiefs') && r('Chiefs') > r('Moana Pasifika'), 'Super: Crusaders > Chiefs > Moana');
    assert.ok(r('Saracens') > r('Newcastle Red Bulls'), 'PREM: Saracens > Newcastle');
    assert.ok(r('Stade Toulousain') > r('Provence Rugby'), 'Top14 líder > ProD2 líder');
    assert.ok(r('Provence Rugby') > r('Albi'), 'ProD2 líder > Nationale líder');
});

test('cada NIVEL vive dentro de su banda de rating y la pirámide no se invierte', () => {
    const medians = LEVEL_ORDER.map((level) => {
        const ratings = CLUBS.filter((c) => c.level === level).map((c) => c.rating);
        return { level, count: ratings.length, median: ratings.length > 0 ? median(ratings) : null };
    });

    for (const entry of medians) {
        if (entry.median === null) continue; // 'amateur' llega con Supabase
        const [lo, hi] = LEVEL_RATING[entry.level];
        assert.ok(
            entry.median >= lo && entry.median <= hi,
            `${entry.level}: mediana ${entry.median} fuera de la banda [${lo}, ${hi}]`,
        );
    }

    const present = medians.filter((e) => e.median !== null);
    for (let i = 1; i < present.length; i++) {
        assert.ok(
            present[i].median! <= present[i - 1].median!,
            `pirámide invertida: ${present[i].level} (${present[i].median}) > ${present[i - 1].level} (${present[i - 1].median})`,
        );
    }
});

test('el amateurismo topea debajo del piso profesional de la región', () => {
    // La regla vieja era "ningún club amateur supera 46", y se escribió cuando
    // Argentina eran cuatro escalones planos. Con los SIETE niveles del canon,
    // 46 no puede sostener a la vez la cima y la base de la pirámide: el URBA
    // Top 14 y el Torneo Local de Córdoba quedarían casi empatados.
    //
    // El invariante que importa —y que es más fuerte— es que dar el salto al
    // profesionalismo siga siendo un salto: el techo amateur tiene que quedar
    // DEBAJO de la franquicia más floja de Super Rugby Americas.
    const [, amateurCap] = LEVEL_RATING.amateur;
    assert.equal(amateurCap, 52, 'la banda amateur debe topear en 52');

    const amateurs = CLUBS.filter((c) => c.level === 'amateur');
    for (const club of amateurs) {
        assert.ok(club.rating <= amateurCap, `${club.name}: amateur con rating ${club.rating}`);
    }

    const sraFloor = Math.min(...CLUBS.filter((c) => c.competitionId === 'sra').map((c) => c.rating));
    const amateurCeiling = Math.max(...amateurs.map((c) => c.rating));
    assert.ok(
        amateurCeiling < sraFloor,
        `el techo amateur (${amateurCeiling}) debe quedar debajo del piso SRA (${sraFloor})`,
    );

    // Uruguay y Chile siguen saliendo del loader de Supabase, con su tope en 46.
    for (const club of CLUBS.filter((c) => c.competitionId === 'sa-uy' || c.competitionId === 'sa-cl')) {
        assert.ok(club.rating <= 46, `${club.name}: UY/CL topea en 46, tiene ${club.rating}`);
    }
});

test('cero sourceId duplicados dentro del mismo source', () => {
    const bySource = new Map<string, string[]>();
    for (const club of CLUBS) {
        if (club.sourceId === null) continue;
        const list = bySource.get(club.source) ?? [];
        list.push(club.sourceId);
        bySource.set(club.source, list);
    }
    for (const [source, ids] of bySource) {
        assert.equal(new Set(ids).size, ids.length, `${source}: sourceId duplicados`);
    }
});

test('Super Rugby Americas: 8 franquicias REALES, profesionales y regionales', () => {
    const sra = ROSTERS_2026_27.find((g) => g.competitionId === 'sra');
    assert.ok(sra, 'Super Rugby Americas debe estar en el catálogo');
    assert.equal(sra!.clubs.length, 8, '8 franquicias en 2026');
    assert.deepEqual(
        [...sra!.clubs].sort(),
        ['Capibaras XV', 'Cobras Brasil Rugby', 'Dogos XV', 'Pampas', 'Peñarol Rugby', 'Selknam', 'Tarucas', 'Yacaré XV'],
    );
    assert.equal(sra!.kind, 'regional-franchise', 'es una liga regional, no una copa');
    assert.equal(sra!.region, 'south-america');

    for (const club of CLUBS.filter((c) => c.competitionId === 'sra')) {
        assert.equal(club.level, 'pro-regional', `${club.name}: nivel incorrecto`);
        assert.equal(club.professionalStatus, 'professional', `${club.name}: debe ser profesional`);
        assert.equal(club.source, 'career-static', 'las franquicias SRA no son clubes de Supabase');
    }
});

test('MLR 2026: SEIS equipos, no los once de 2025', () => {
    // El conteo es el gate que impide mezclar temporadas, y acá es lo único que
    // atrapa el error más probable de esta liga: la MLR se derrumbó de once equipos
    // a seis en un año —se retiraron NOLA Gold, Miami Sharks, Houston SaberCats
    // (finalista 2025) y Utah Warriors, y San Diego + Los Angeles se fusionaron en
    // California Legion— así que cualquier roster de 2025 que se cuele tiene el
    // tamaño mal.
    const mlr = ROSTERS_2026_27.find((g) => g.competitionId === 'us-mlr');
    assert.ok(mlr, 'la MLR debe estar en el catálogo');
    assert.equal(mlr!.clubs.length, 6, 'seis equipos en 2026');
    assert.deepEqual(
        [...mlr!.clubs].sort(),
        ['Anthem RC', 'California Legion', 'Chicago Hounds', 'New England Free Jacks', 'Old Glory DC', 'Seattle Seawolves'],
    );
    // Los cuatro que se retiraron y los dos que se fusionaron NO pueden estar.
    for (const ido of ['NOLA Gold', 'Miami Sharks', 'Houston SaberCats', 'Utah Warriors', 'San Diego Legion', 'Rugby FC Los Angeles']) {
        assert.ok(!CLUBS.some((c) => c.name === ido), `${ido} ya no juega la MLR 2026`);
    }
    // Profesional de verdad: convenio colectivo firmado con la USRPA en 2026.
    for (const club of CLUBS.filter((c) => c.competitionId === 'us-mlr')) {
        assert.equal(club.professionalStatus, 'professional', `${club.name}: la MLR es profesional`);
    }
});

test('el universitario de EE.UU. son DOS pirámides paralelas, no una', () => {
    // El rugby masculino no es deporte NCAA y desde 2021 hay dos campeonatos
    // nacionales separados: CRAA (final en primavera) y NCR (quince en diciembre).
    // Este test cuida que sigan siendo dos competiciones distintas: si alguien las
    // fusiona "para simplificar", se pierde el hecho estructural del país.
    const d1a = CLUBS.filter((c) => c.competitionId === 'us-d1a');
    const ncr = CLUBS.filter((c) => c.competitionId === 'us-ncr-d1');
    assert.equal(d1a.length, 12, 'los doce mejores programas D1A');
    assert.equal(ncr.length, 8, 'la Ivy League entera en NCR DI');
    assert.equal(new Set([...d1a, ...ncr].map((c) => c.id)).size, 20, 'ningún programa en las dos');
    // Cal es la cima y no por poco: campeón 2025 y 2026, invicto, 30 títulos.
    const cal = CLUBS.find((c) => c.name === 'California')!;
    assert.equal(cal.rating, Math.max(...d1a.map((c) => c.rating)), 'California es la cima de la D1A');
    // La Ivy juega en NCR desde 2022: si aparece en la CRAA, alguien la movió mal.
    for (const ivy of ['Brown', 'Harvard', 'Yale', 'Princeton', 'Dartmouth', 'Cornell', 'Penn', 'Columbia']) {
        assert.equal(CLUBS.find((c) => c.name === ivy)!.competitionId, 'us-ncr-d1', `${ivy} compite en NCR`);
    }
});

test('Portugal, Italia y Brasil entran con su plantel real', () => {
    const count = (id: string) => CLUBS.filter((c) => c.competitionId === id).length;
    assert.equal(count('pt-honra'), 12, 'la FPR lo llama TOP 12 Divisão de Honra');
    assert.equal(count('ita-serie-a-elite'), 10, 'la reforma 2026-27 deja la Élite congelada en 10');
    assert.equal(count('br-super12'), 12, 'Super 12');

    // Siete de los doce portugueses son de Lisboa, y nadie fuera del eje
    // Lisboa-Cascais pelea el título. Es la forma de esa liga, no una casualidad.
    const lisboa = ['Agronomia', 'Belenenses', 'Benfica', 'São Miguel', 'Técnico', 'CDUL', 'Direito'];
    for (const name of lisboa) {
        assert.equal(CLUBS.find((c) => c.name === name)!.competitionId, 'pt-honra', name);
    }
    // Benfica campeón 2025-26 (su 10º título, el primero desde 2001) tiene que
    // estar arriba, y CDUL —20 títulos y hoy sin pelear— arriba en PRESTIGIO.
    const pt = (name: string) => CLUBS.find((c) => c.name === name)!;
    assert.equal(pt('Benfica').rating, Math.max(...CLUBS.filter((c) => c.competitionId === 'pt-honra').map((c) => c.rating)));
    assert.equal(pt('CDUL').prestige, Math.max(...CLUBS.filter((c) => c.competitionId === 'pt-honra').map((c) => c.prestige)));

    // BENETTON Y ZEBRE NO ESTÁN EN LA PIRÁMIDE ITALIANA: juegan la URC. Es la clave
    // del rugby italiano y lo que hace que el Scudetto no lo peleen los dos mejores
    // clubes del país.
    for (const name of ['Benetton Treviso', 'Zebre Parma']) {
        assert.equal(CLUBS.find((c) => c.name === name)!.competitionId, 'urc', `${name} está fuera de la Serie A Élite`);
    }
    // Valorugby, primer Scudetto de su historia y doblete, es la cima de la Élite.
    const elite = CLUBS.filter((c) => c.competitionId === 'ita-serie-a-elite');
    assert.equal(CLUBS.find((c) => c.name === 'Valorugby Emilia')!.rating, Math.max(...elite.map((c) => c.rating)));
    // Colorno fue excluido el 2 de marzo de 2026: no puede estar en el catálogo.
    assert.ok(!CLUBS.some((c) => /colorno/i.test(c.name)), 'HBS Colorno retiró su primer equipo');

    // Brasil: Cobras NO es un club del Super 12, es la franquicia de la
    // confederación. Si apareciera en la liga doméstica, el sistema estaría mal.
    assert.equal(CLUBS.find((c) => c.name === 'Cobras Brasil Rugby')!.competitionId, 'sra');
    // Nova Lima, primer club de Minas Gerais en la historia de la primera división.
    assert.equal(CLUBS.find((c) => c.name === 'Nova Lima')!.competitionId, 'br-super12');
});

test('marketBand refleja economía, no solo fuerza (Japón D1 rico)', () => {
    const mb = (name: string) => CLUBS.find((c) => c.name === name)?.marketBand ?? 0;
    const rt = (name: string) => CLUBS.find((c) => c.name === name)?.rating ?? 0;
    assert.ok(mb('Saitama Wild Knights') >= 6, 'Saitama mercado tope');
    assert.ok(mb('Moana Pasifika') < mb('Saitama Wild Knights'), 'Moana mercado < Saitama');
    assert.ok(rt('Saitama Wild Knights') < rt('Stade Toulousain'), 'Saitama fuerza < Toulouse');
    assert.ok(mb('Saitama Wild Knights') >= mb('Stade Toulousain'), 'pero mercado Saitama >= Toulouse');
});
