// EL CANON DEL RUGBY ARGENTINO, protegido.
//
// Lo que estos tests cuidan no es "los datos están cargados", sino las cuatro
// reglas que el sistema declara y que son fáciles de romper sin darse cuenta:
//
//   1. son DOS RAMAS CERRADAS — un club de la URBA no asciende al interior;
//   2. la FRONTERA de fuerza (vive en competition-levels2026.test.ts, que mide
//      sobre el catálogo construido);
//   3. los HOMÓNIMOS no se fusionan — hay siete Jockey Club y tres Tiro Federal;
//   4. ningún club real se queda sin división ni pierde el escudo.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AR_DIVISIONS,
    AR_RATING_BANDS,
    AR_RATING_MAX,
    AR_SNAPSHOT_ALIAS,
    AR_SPORTING_BAND,
    AR_SYSTEM_VERSION,
    TDI_A_SLOTS,
    TDI_B_SLOTS,
    TDI_CUPOS_2026,
    arDivisionOf,
    arRatingAt,
} from './arSystem2026.ts';
import { AR_CATALOG, normalizeArName } from './arCatalog.ts';
import { SA_CLUBS } from './saClubs.generated.ts';
import { CLUBS } from '../clubs.ts';

test('la versión del sistema está sellada', () => {
    assert.equal(AR_SYSTEM_VERSION, '2026.2');
});

// ── Estructura ───────────────────────────────────────────────────────────────

test('la URBA tiene SIETE divisiones y los planteles que declara el canon', () => {
    const urba = AR_DIVISIONS.filter((d) => d.branch === 'urba');
    assert.equal(urba.length, 7, 'no existe una "Cuarta": el séptimo nivel es Desarrollo');
    assert.deepEqual(
        urba.map((d) => d.clubs.length),
        [14, 14, 14, 14, 14, 11, 10],
        'Top 14 · A · B · C · Segunda · Tercera (11) · Desarrollo (10)',
    );
    assert.equal(urba.reduce((sum, d) => sum + d.clubs.length, 0), 91, 'la URBA son 91 clubes');
    // Un nivel del canon por división, del 1 al 7 sin huecos ni repetidos.
    assert.deepEqual(urba.map((d) => d.canonLevel), [1, 2, 3, 4, 5, 6, 7]);
});

test('LAS DOS RAMAS SON CERRADAS: ningún ascenso cruza de rama', () => {
    for (const division of AR_DIVISIONS) {
        for (const target of [division.promotesTo, division.relegatesTo]) {
            if (!target) continue;
            const other = arDivisionOf(target);
            assert.ok(other, `${division.competitionId} apunta a una división inexistente: ${target}`);
            assert.equal(
                other!.branch, division.branch,
                `${division.label} → ${other!.label}: un club de la URBA no puede ascender al interior ni al revés`,
            );
            assert.equal(
                other!.region, division.region,
                `${division.label} → ${other!.label}: el ascenso tampoco cruza de región`,
            );
        }
    }
});

test('cada región del interior tiene su escalera conectada', () => {
    const interior = AR_DIVISIONS.filter((d) => d.branch === 'interior');
    const regions = [...new Set(interior.map((d) => d.region))].sort();
    assert.deepEqual(regions, ['centro', 'litoral', 'nea', 'noa', 'oeste', 'pampeana', 'patagonia'], 'las 7 regiones');
    for (const region of regions) {
        const divisions = interior.filter((d) => d.region === region);
        assert.ok(divisions.length >= 2, `${region}: una región necesita al menos primera y segunda`);
        // La primera división de la región no desciende a otra rama ni queda
        // colgada: alguien de su región asciende hacia ella.
        const top = divisions.reduce((best, d) => (d.canonLevel < best.canonLevel ? d : best), divisions[0]);
        assert.ok(
            divisions.some((d) => d.promotesTo === top.competitionId),
            `${region}: nadie asciende a ${top.label}`,
        );
    }
});

test('toda división tiene campo suficiente para repartir un título', () => {
    // Con un solo club no hay torneo: `resolveLeagueFinish` no acredita campeón.
    for (const division of AR_DIVISIONS) {
        assert.ok(division.clubs.length >= 2, `${division.label}: ${division.clubs.length} club(es)`);
    }
});

// ── Fuerza ───────────────────────────────────────────────────────────────────

test('las bandas de fuerza no se invierten y respetan la frontera del canon', () => {
    const order = ['n1', 'n2Urba', 'n2Interior', 'n3', 'n4', 'n5', 'n6', 'n7'] as const;
    for (const key of order) {
        const [lo, hi] = AR_RATING_BANDS[key];
        assert.ok(lo < hi, `${key}: banda vacía o invertida`);
    }
    // El techo del Nivel 4 queda DEBAJO del piso del Nivel 3 (URBA Primera B).
    // Es la única frontera que el canon declara inviolable.
    assert.ok(
        AR_RATING_BANDS.n4[1] < AR_RATING_BANDS.n3[0],
        `frontera rota: N4 techo ${AR_RATING_BANDS.n4[1]} vs N3 piso ${AR_RATING_BANDS.n3[0]}`,
    );
    // La URBA Primera A va apenas arriba de las tres excepciones del interior.
    const ventaja = AR_RATING_BANDS.n2Urba[0] - AR_RATING_BANDS.n2Interior[0];
    assert.ok(ventaja >= 2 && ventaja <= 3, `la ventaja leve del canon es +2 a +3, es ${ventaja}`);
    // Y los solapamientos entre niveles adyacentes NO se cierran: son los que
    // producen los upsets creíbles.
    assert.ok(AR_RATING_BANDS.n5[1] > AR_RATING_BANDS.n4[0], 'N4 y N5 tienen que solaparse');
    assert.ok(AR_RATING_BANDS.n7[1] > AR_RATING_BANDS.n6[0], 'N6 y N7 tienen que solaparse');
});

test('el rating se reparte dentro de la banda, de la punta al fondo', () => {
    for (const division of AR_DIVISIONS) {
        const [lo, hi] = AR_RATING_BANDS[division.band];
        const ratings = division.clubs.map((_, i) => arRatingAt(division, i));
        assert.equal(ratings[0], hi, `${division.label}: el primero declarado toma el techo`);
        assert.equal(ratings[ratings.length - 1], lo, `${division.label}: el último toma el piso`);
        for (let i = 1; i < ratings.length; i++) {
            assert.ok(ratings[i] <= ratings[i - 1], `${division.label}: el orden declarado es de fuerza`);
        }
    }
});

test('el techo argentino queda debajo del piso profesional de la región', () => {
    const sraFloor = Math.min(...CLUBS.filter((c) => c.competitionId === 'sra').map((c) => c.rating));
    assert.ok(AR_RATING_MAX < sraFloor, `techo AR ${AR_RATING_MAX} vs piso SRA ${sraFloor}`);
});

test('la banda deportiva global cubre los siete niveles sin invertirse', () => {
    for (let level = 2; level <= 7; level++) {
        const arriba = AR_SPORTING_BAND[(level - 1) as 1];
        const abajo = AR_SPORTING_BAND[level as 1];
        assert.ok(abajo <= arriba, `nivel ${level} no puede tener banda mayor que ${level - 1}`);
    }
    // El techo en 3 es lo que mantiene a la SRA (banda 5) a más de un escalón.
    assert.equal(AR_SPORTING_BAND[1], 3, 'el techo amateur del escalafón es 3');
});

// ── Torneo del Interior ──────────────────────────────────────────────────────

test('los cupos del TDI 2026 suman 16 y 16, y son de la REGIÓN', () => {
    assert.equal(TDI_CUPOS_2026.reduce((sum, c) => sum + c.tdiA, 0), TDI_A_SLOTS);
    assert.equal(TDI_CUPOS_2026.reduce((sum, c) => sum + c.tdiB, 0), TDI_B_SLOTS);
    // Córdoba y el Litoral aportan la mayoría del A: es lo que hace que dominen
    // históricamente el Torneo del Interior.
    const dominantes = TDI_CUPOS_2026.filter((c) => c.region === 'centro' || c.region === 'litoral');
    assert.equal(dominantes.reduce((sum, c) => sum + c.tdiA, 0), 12, 'Córdoba + Litoral = 12 de los 16 del A');
    // La Patagonia no tiene cupo, y es correcto.
    assert.equal(TDI_CUPOS_2026.find((c) => c.region === 'patagonia')!.tdiA, 0);
    // Cada cupo sale de una primera división que existe y que tiene lugar para
    // repartirlo: no se puede clasificar al 7° de una liga de 6.
    for (const cupo of TDI_CUPOS_2026) {
        const division = arDivisionOf(cupo.sourceCompetitionId);
        assert.ok(division, `cupo desde una división inexistente: ${cupo.sourceCompetitionId}`);
        assert.ok(
            cupo.tdiA + cupo.tdiB <= division!.clubs.length,
            `${cupo.region}: ${cupo.tdiA + cupo.tdiB} cupos en una liga de ${division!.clubs.length}`,
        );
    }
});

// ── Homónimos y catálogo real ────────────────────────────────────────────────

test('LOS HOMÓNIMOS NO SE FUSIONAN', () => {
    const byName = new Map<string, string[]>();
    for (const club of CLUBS.filter((c) => c.source === 'canon-ar')) {
        const list = byName.get(club.name) ?? [];
        list.push(club.competitionId);
        byName.set(club.name, list);
    }
    // Ningún nombre repetido dentro del sistema (cada homónimo lleva su
    // desambiguación: "San Patricio" vs "San Patricio de Corrientes").
    for (const [name, comps] of byName) {
        assert.equal(comps.length, 1, `${name} aparece en ${comps.join(', ')}`);
    }

    // Y los homónimos que el canon exige conservar están TODOS.
    const count = (re: RegExp) => CLUBS.filter((c) => c.source === 'canon-ar' && re.test(c.name)).length;
    assert.ok(count(/^Jockey Club/) >= 7, `siete Jockey Club, hay ${count(/^Jockey Club/)}`);
    assert.ok(count(/^Tiro Federal/) >= 3, `tres Tiro Federal, hay ${count(/^Tiro Federal/)}`);
    assert.ok(count(/^Universitario/) >= 8, `los Universitario, hay ${count(/^Universitario/)}`);
    assert.ok(count(/^San Patricio/) === 2, 'dos San Patricio: URBA y Corrientes');
    assert.ok(count(/^Pueyrredón/) === 2, 'dos Pueyrredón: URBA y Mar del Plata');
    assert.ok(count(/^Argentino/) === 2, 'dos Argentino: URBA y Bahía Blanca');
    assert.ok(count(/^La Salle/) === 2, 'dos La Salle: URBA y Jobson');
    assert.ok(count(/^Santa Rosa/) === 2, 'dos Santa Rosa: Córdoba y Bahía Blanca');
    assert.ok(count(/^San Jorge/) === 2, 'dos San Jorge: Mendoza y la Austral');
});

test('NINGÚN club del catálogo real se queda sin división', () => {
    assert.deepEqual(AR_CATALOG.unclaimed, [], 'clubes reales que ninguna división reclamó');
});

test('NINGÚN club existente pierde el escudo: el sourceId se hereda', () => {
    assert.deepEqual(AR_CATALOG.brokenAliases, [], 'alias que apuntan a un nombre que ya no existe');
    assert.deepEqual(AR_CATALOG.ambiguous, [], 'nombres que resuelven a dos filas distintas');
    // 179 = las 181 filas argentinas menos las dos declaradas en
    // AR_SNAPSHOT_UNPLACED (Policía CABA y el "Caballeros", que es un torneo de
    // veteranos y no un club).
    assert.ok(AR_CATALOG.matched >= 179, `esperaba heredar ~179 escudos, heredó ${AR_CATALOG.matched}`);
    // Todo club que matcheó conserva su sourceId (la clave del escudo) y su id
    // original (con el que quedó escrito en partidas y comparativas).
    const conEscudo = AR_CATALOG.clubs.filter((c) => c.sourceId !== null);
    assert.equal(conEscudo.length, AR_CATALOG.matched);
    for (const club of conEscudo) {
        assert.equal(club.id, `sb-${club.sourceId}`, `${club.name}: el id no puede cambiar`);
    }
});

test('los clubes nuevos están declarados y son los que el canon agrega', () => {
    // 44 clubes que el canon nombra y el catálogo real no tenía: las tres
    // divisiones bajas de la URBA, los dos de Villa María, los dos paraguayos del
    // NEA y algunos del Pampeano B. Van sin escudo real, y está dicho.
    assert.ok(AR_CATALOG.created.length <= 50, `demasiados clubes sin respaldo real: ${AR_CATALOG.created.length}`);
    const sinEscudo = AR_CATALOG.clubs.filter((c) => c.sourceId === null).map((c) => c.name);
    assert.deepEqual([...sinEscudo].sort(), AR_CATALOG.created, 'los clubes sin escudo son exactamente los nuevos');
    // Los dos clubes paraguayos del Regional NEA A no se sacan.
    const nea = arDivisionOf('ar-nea-a')!;
    assert.ok(nea.clubs.includes('San José de Paraguay') && nea.clubs.includes('CURDA'), 'el NEA incluye Paraguay');
});

test('la normalización de nombres saca el relleno y no el club', () => {
    assert.equal(normalizeArName('Argentino R.C.'), 'argentino');
    assert.equal(normalizeArName('Club San Patricio'), 'sanpatricio');
    assert.equal(normalizeArName('C.A. Provincial'), 'provincial');
    assert.equal(normalizeArName('Teqüe R.C.'), normalizeArName('Teqüé'));
    assert.equal(normalizeArName('Lujan R.C.'), normalizeArName('Luján'));
    // Y NO fusiona dos clubes distintos.
    assert.notEqual(normalizeArName('La Salle'), normalizeArName('La Salle Jobson'));
    assert.notEqual(normalizeArName('Tiro Federal de Salta'), normalizeArName('Tiro Federal de Baradero'));
    assert.notEqual(normalizeArName('Universitario de Salta'), normalizeArName('Universitario de Santa Fe'));
});

test('todo alias está justificado: o el nombre no matchea, o hay homónimo', () => {
    // Un alias se justifica por UNO de dos motivos, y hay que aceptar los dos:
    //   · la normalización no llega ("SIC" ≠ "San Isidro Club");
    //   · o llega a DOS filas distintas, y hay que decir cuál es cuál — el San
    //     Patricio de la URBA y el de Corrientes normalizan igual, así que sin
    //     alias los dos quedarían ambiguos y perderían el escudo.
    //
    // Sin la segunda mitad, este test pedía borrar justo los alias que impiden
    // fusionar homónimos, que es lo que el canon prohíbe.
    const arRows = SA_CLUBS.filter((c) => c.countryCode === 'ar');
    for (const [canon, real] of Object.entries(AR_SNAPSHOT_ALIAS)) {
        const hits = arRows.filter((c) => normalizeArName(c.name) === normalizeArName(canon)).length;
        const noMatchea = normalizeArName(canon) !== normalizeArName(real);
        assert.ok(
            noMatchea || hits > 1,
            `${canon} → ${real}: el alias es innecesario, la normalización ya lo resuelve sin ambigüedad`,
        );
    }
});
