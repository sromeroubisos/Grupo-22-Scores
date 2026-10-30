// El sistema argentino, Uruguay y Chile dentro del mundo de Rugby Manager:
// que estén completos, que sus escudos existan y que los ascensos y descensos
// muevan clubes sin perder ni duplicar ninguno.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { AR_DIVISIONS } from '../../../career/data/clubs2026/arSystem2026.ts';
import {
    canCloseSeason, chooseClub, closeSeason, countriesOf, createGame, leagueChoices, playNextMatch,
    type ManagerGame,
} from '../../game/game.ts';
import { ARGENTINA_PYRAMIDS, AR_LEAGUES, SOUTH_AMERICA_LEAGUES } from '../argentina.ts';
import { crestPathForName } from '../crests.ts';
import { ALL_LEAGUES } from '../leagues.ts';

const SEED = 11;

describe('rugby-manager · catálogo argentino', () => {
    it('trae las 28 divisiones del canon con todos sus clubes', () => {
        assert.equal(AR_LEAGUES.length, AR_DIVISIONS.length);
        assert.equal(AR_LEAGUES.length, 28);
        const esperados = AR_DIVISIONS.reduce((n, d) => n + d.clubs.length, 0);
        assert.equal(AR_LEAGUES.reduce((n, l) => n + l.clubs.length, 0), esperados);
        for (const d of AR_DIVISIONS) {
            const liga = AR_LEAGUES.find((l) => l.shortName === d.label);
            assert.ok(liga, `falta la liga ${d.label}`);
            assert.deepEqual(liga.clubs.map((c) => c.name), [...d.clubs], d.label);
        }
    });

    it('ninguna liga repite shortName: el rollover regenera los fixtures por ese nombre', () => {
        const nombres = ALL_LEAGUES.map((l) => l.shortName);
        assert.equal(new Set(nombres).size, nombres.length);
    });

    it('ningún club argentino está en dos divisiones', () => {
        const ids = AR_LEAGUES.flatMap((l) => l.clubs.map((c) => c.catalogId));
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0));
    });

    it('la mayoría de los clubes argentinos tiene escudo real, y el archivo existe', () => {
        const clubes = AR_LEAGUES.flatMap((l) => l.clubs);
        const conEscudo = clubes.filter((c) => c.crest);
        assert.ok(conEscudo.length >= 200, `solo ${conEscudo.length} de ${clubes.length} con escudo`);
        for (const c of conEscudo) {
            assert.ok(existsSync(`public${c.crest}`), `${c.name}: no existe public${c.crest}`);
        }
    });

    it('Uruguay y Chile entran con sus clubes', () => {
        assert.equal(SOUTH_AMERICA_LEAGUES.length, 3);
        for (const liga of SOUTH_AMERICA_LEAGUES) assert.ok(liga.clubs.length >= 8, liga.name);
    });

    it('los escudos de clubes extranjeros se buscan por nombre y por alias', () => {
        assert.equal(crestPathForName('Castres Olympique'), '/clubs/castres-olympique.png');
        assert.equal(crestPathForName('La Rochelle'), '/clubs/stade-rochelais.png');
        assert.equal(crestPathForName('Club que no existe'), null);
    });

    it('cada ascenso/descenso del canon mueve al menos un club', () => {
        assert.ok(ARGENTINA_PYRAMIDS.length >= 15);
        for (const p of ARGENTINA_PYRAMIDS) {
            const [arriba, abajo] = p.levels;
            const cupos = Math.min(arriba.relegationSlots, abajo.promotionSlots);
            assert.ok(cupos > 0, `${p.name}: el par no mueve a nadie`);
        }
    });
});

describe('rugby-manager · el mundo con todas las ligas', () => {
    const game: ManagerGame = createGame(SEED);

    it('Argentina es UN solo país, con el nombre y el tier de World Rugby', () => {
        const argentinas = game.world.countries.filter((c) => c.code === 'ARG');
        assert.equal(argentinas.length, 1);
        assert.equal(argentinas[0].name, 'Argentina');
        const ids = new Set(game.world.competitions.filter((c) => AR_LEAGUES.some((l) => l.shortName === c.shortName)).map((c) => c.countryId));
        assert.deepEqual([...ids], [argentinas[0].id]);
    });

    it('el selector ofrece Argentina primero, con sus 28 divisiones', () => {
        const opciones = leagueChoices(game.world);
        const paises = countriesOf(opciones);
        assert.equal(paises[0], 'Argentina');
        assert.ok(paises.includes('Uruguay') && paises.includes('Chile') && paises.includes('Francia'));
        assert.equal(opciones.filter((o) => o.countryName === 'Argentina').length, 28);
        assert.equal(paises[paises.length - 1], 'Internacional');
    });

    it('los clubes traen escudo, colores y id de catálogo', () => {
        const newman = game.world.clubs.find((c) => c.name === 'Newman');
        assert.ok(newman, 'Newman está en el Top 14 de la URBA');
        assert.ok(newman.crest?.startsWith('/clubs/'));
        assert.ok(newman.catalogId);
        assert.notEqual(newman.primaryColor, '#1F4E79');
        const colores = new Set(game.world.clubs.map((c) => c.primaryColor));
        assert.ok(colores.size > 100, 'los clubes ya no comparten un solo azul');
    });

    it('ascensos y descensos: se conservan los clubes y ninguno queda en dos divisiones', () => {
        const urba = leagueChoices(game.world).find((l) => l.competition.shortName === 'Primera B de la URBA')!;
        let g = chooseClub(game, urba.clubs[6].id, { name: 'Prueba', age: 40, nationality: 'ARG' });
        let guard = 0;
        while (!canCloseSeason(g)) {
            g = playNextMatch(g);
            if (++guard > 100) assert.fail('la temporada no termina');
        }
        const antes = new Map(g.world.competitions.map((c) => [c.shortName, new Set(c.clubIds)]));
        const { game: despues } = closeSeason(g);

        const nombres = ['Top 14 de la URBA', 'Primera A de la URBA', 'Primera B de la URBA', 'Primera C de la URBA'];
        for (const nombre of nombres) {
            const a = antes.get(nombre)!;
            const d = new Set(despues.world.competitions.find((c) => c.shortName === nombre)!.clubIds);
            assert.equal(d.size, a.size, `${nombre} conserva su cantidad de clubes`);
        }
        // Top 14 ↔ Primera A: bajan 2 y suben 2.
        const top = new Set(despues.world.competitions.find((c) => c.shortName === nombres[0])!.clubIds);
        const bajan = [...antes.get(nombres[0])!].filter((id) => !top.has(id));
        assert.equal(bajan.length, 2);
        const primeraA = new Set(despues.world.competitions.find((c) => c.shortName === nombres[1])!.clubIds);
        for (const id of bajan) assert.ok(primeraA.has(id), 'el que baja del Top 14 aparece en Primera A');

        // Ningún club de la URBA figura en dos ligas, y `club.competitionIds` coincide con las listas.
        const ligas = despues.world.competitions.filter((c) => nombres.includes(c.shortName));
        const vistos = new Map<string, string>();
        for (const liga of ligas) {
            for (const id of liga.clubIds) {
                assert.equal(vistos.has(id), false, `${id} figura en dos divisiones`);
                vistos.set(id, liga.id);
            }
        }
        for (const club of despues.world.clubs) {
            const liga = vistos.get(club.id);
            if (liga) assert.ok(club.competitionIds.includes(liga), `${club.name}: competitionIds desactualizado`);
        }
        // El descenso en cadena no se repite: de Primera A salen 4 (2 suben al Top 14, 2 bajan a
        // Primera B) y los que bajaron del Top 14 no vuelven a bajar.
        const salenDeA = [...antes.get(nombres[1])!].filter((id) => !primeraA.has(id));
        const primeraB = new Set(despues.world.competitions.find((c) => c.shortName === nombres[2])!.clubIds);
        assert.equal(salenDeA.length, 4);
        assert.equal(salenDeA.filter((id) => top.has(id)).length, 2, 'dos suben al Top 14');
        assert.equal(salenDeA.filter((id) => primeraB.has(id)).length, 2, 'dos bajan a Primera B');
        for (const id of bajan) assert.equal(primeraB.has(id), false, 'el que bajó del Top 14 no baja otra vez');
    });
});
