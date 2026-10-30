// La partida de Rugby Manager de punta a punta, sin navegador:
// elegir club, jugar una temporada, cerrarla, y guardar/cargar a mitad de camino.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { createStreamingRunner } from '../../engine/runner.ts';
import { addDays } from '../../utils/date.ts';
import {
    canCloseSeason, chooseClub, clubOf, closeSeason, closeSeasonAsync, createGame, finishLiveMatch, fixturesOf,
    leagueChoices, playNextMatch, playNextMatchAsync, prepareLiveMatch, seasonView, setPhilosophy, squadOf,
    startCareerAsync, type ManagerGame,
} from '../game.ts';
import {
    MANAGER_SCHEMA, readEnvelope, readSummary, toEnvelope, toSummary,
} from '../save.ts';

const SEED = 7;
const digest = (g: ManagerGame): string =>
    createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 16);

function startedGame(): ManagerGame {
    const game = createGame(SEED);
    const top14 = leagueChoices(game.world).find((l) => l.competition.shortName === 'T14');
    assert.ok(top14, 'el mundo tiene que traer el Top 14');
    return chooseClub(game, top14.clubs[5].id, { name: 'Prueba', age: 40, nationality: 'ARG' });
}

function playSeason(game: ManagerGame): ManagerGame {
    let g = game;
    let guard = 0;
    while (!canCloseSeason(g)) {
        g = playNextMatch(g);
        if (++guard > 80) assert.fail('la temporada del club no termina');
    }
    return g;
}

describe('rugby-manager · la partida', () => {
    it('el mundo ofrece ligas masculinas de mayores, de mayor a menor reputación', () => {
        const choices = leagueChoices(createGame(SEED).world);
        assert.ok(choices.length >= 5);
        for (const { competition, clubs } of choices) {
            assert.equal((competition.gender ?? 'men'), 'men');
            assert.ok(clubs.length > 0);
            for (let i = 1; i < clubs.length; i++) assert.ok(clubs[i - 1].reputation >= clubs[i].reputation);
        }
    });

    it('misma semilla y mismo club ⇒ misma partida', () => {
        assert.equal(digest(startedGame()), digest(startedGame()));
    });

    it('jugar una temporada y cerrarla pasa al año siguiente con el mismo club', () => {
        const game = playSeason(startedGame());
        const view = seasonView(game);
        assert.equal(view.clubDone, true);
        assert.equal(view.standings.length, 14);
        assert.ok(view.position >= 1 && view.position <= 14);
        const clubId = game.managerClubId!;
        // Si el club llegó a playoffs juega más de 26; la fase regular son 26 fechas exactas.
        const regulares = fixturesOf(game.world, clubId)
            .filter((m) => m.played && m.competitionId === view.league!.id && m.round <= 26).length;
        assert.equal(regulares, 26, '14 clubes, ida y vuelta');

        const { game: next, report } = closeSeason(game);
        assert.equal(next.world.seasonYear, game.world.seasonYear + 1);
        assert.equal(report.newSeasonYear, next.world.seasonYear);
        assert.ok(next.world.clubs.some((c) => c.id === clubId));
        assert.ok(squadOf(next.world, clubId).length >= 23, 'el plantel sigue siendo un plantel');
        assert.ok(seasonView(next).nextMatch, 'hay un primer partido en la temporada nueva');
        assert.equal(seasonView(next).clubDone, false);
    });

    it('guardar y cargar a mitad de temporada no cambia el futuro', () => {
        let a = startedGame();
        for (let i = 0; i < 6; i++) a = playNextMatch(a);

        const leido = readEnvelope(JSON.parse(JSON.stringify(toEnvelope(a, '2026-01-01T00:00:00.000Z'))));
        assert.equal(leido.kind, 'ok');
        if (leido.kind !== 'ok') return;
        assert.equal(digest(leido.game), digest(a));

        let continuo = a;
        let recargado = leido.game;
        for (let i = 0; i < 6; i++) {
            continuo = playNextMatch(continuo);
            recargado = playNextMatch(recargado);
        }
        assert.equal(digest(recargado), digest(continuo));
    });

    it('la filosofía táctica se acota a ±3 y no toca el azar', () => {
        const game = startedGame();
        const arriba = setPhilosophy(game, 'tempo', 99);
        const abajo = setPhilosophy(game, 'tempo', -99);
        assert.equal(arriba.world.tactics[game.managerClubId!].philosophy.tempo, 3);
        assert.equal(abajo.world.tactics[game.managerClubId!].philosophy.tempo, -3);
        assert.equal(arriba.entropy, game.entropy);
    });
});

describe('rugby-manager · partido en vivo', () => {
    it('el partido vivido da el mismo marcador que el simulado de una', () => {
        const base = startedGame();

        const prepared = prepareLiveMatch(base);
        assert.ok(prepared, 'hay un próximo partido');
        const { game: enLaVispera, setup } = prepared;
        const runner = createStreamingRunner(setup.homeTeam, setup.awayTeam, setup.simOptions);
        assert.ok(runner.result.events.length > 20, 'el partido trae eventos para narrar');
        const vivido = finishLiveMatch(enLaVispera, setup, runner.result, []);

        const simulado = playNextMatch(base);
        const a = vivido.world.matches.find((m) => m.id === setup.matchId)!;
        const b = simulado.world.matches.find((m) => m.id === setup.matchId)!;
        assert.equal(a.played, true);
        assert.equal(b.played, true);
        assert.equal(a.result!.homeScore, b.result!.homeScore);
        assert.equal(a.result!.awayScore, b.result!.awayScore);
        assert.ok((a.result!.playerStats ?? []).length > 0, 'quedan estadísticas por jugador');
    });

    it('al confirmar el partido se juega el resto de su fecha', () => {
        const prepared = prepareLiveMatch(startedGame())!;
        const { game, setup } = prepared;
        const runner = createStreamingRunner(setup.homeTeam, setup.awayTeam, setup.simOptions);
        const done = finishLiveMatch(game, setup, runner.result, []);
        const fecha = done.world.matches.find((m) => m.id === setup.matchId)!.date;
        const pendientesEseDia = done.world.matches.filter((m) => m.date === fecha && !m.played);
        assert.equal(pendientesEseDia.length, 0);
    });

    it('sin partido por jugar no hay partido en vivo', () => {
        const game = playSeason(startedGame());
        assert.equal(prepareLiveMatch(game), null);
    });
});

describe('rugby-manager · avance por tramos', () => {
    it('la versión asíncrona da exactamente el mismo mundo que la síncrona, con progreso creciente', async () => {
        const base = startedGame();
        const progreso: number[] = [];
        const asincrono = await playNextMatchAsync(base, (p) => progreso.push(p));
        const sincrono = playNextMatch(base);
        assert.equal(digest(asincrono), digest(sincrono));
        assert.ok(progreso.length >= 2, 'informa el avance más de una vez');
        for (let i = 1; i < progreso.length; i++) assert.ok(progreso[i] >= progreso[i - 1], 'el progreso no retrocede');
        assert.ok(progreso.every((p) => p >= 0 && p <= 1));
    });

    it('arrancar la carrera deja el mundo en la víspera del primer partido', async () => {
        const game = createGame(SEED);
        const liga = leagueChoices(game.world).find((l) => l.competition.shortName === 'Primera B de la URBA')!;
        const club = liga.clubs[6];
        const listo = await startCareerAsync(game, club.id, { name: 'Prueba', age: 40, nationality: 'ARG' });
        const proximo = seasonView(listo).nextMatch!;
        assert.equal(listo.managerClubId, club.id);
        assert.equal(proximo.played, false);
        assert.equal(listo.world.currentDate, addDays(proximo.date, -1));
        // Y desde ahí, jugar el primer partido es cuestión de una semana de mundo, no de ocho meses.
        const jugado = playNextMatch(listo);
        assert.equal(jugado.world.matches.find((m) => m.id === proximo.id)!.played, true);
    });

    it('cerrar la temporada por tramos termina igual que de corrido', async () => {
        const jugada = playSeason(startedGame());
        const a = await closeSeasonAsync(jugada);
        const b = closeSeason(jugada);
        assert.equal(digest(a.game), digest(b.game));
    });
});

describe('rugby-manager · resumen del guardado', () => {
    it('el resumen dice club, temporada y fecha, y vuelve igual al leerlo', () => {
        const game = startedGame();
        const resumen = toSummary(game, '2026-01-01T00:00:00.000Z')!;
        assert.equal(resumen.clubName, clubOf(game.world, game.managerClubId!)!.name);
        assert.equal(resumen.seasonYear, game.world.seasonYear);
        const leido = readSummary(JSON.parse(JSON.stringify(resumen)));
        assert.equal(leido.kind, 'ok');
        if (leido.kind === 'ok') assert.deepEqual(leido.summary, resumen);
    });

    it('sin club elegido no hay resumen', () => {
        assert.equal(toSummary(createGame(SEED), '2026-01-01T00:00:00.000Z'), null);
    });

    it('un resumen de otra versión es "outdated" y nunca tira', () => {
        const resumen = JSON.parse(JSON.stringify(toSummary(startedGame(), '2026-01-01T00:00:00.000Z')));
        for (const campo of ['schema', 'engineVersion', 'worldSchema', 'catalogVersion'] as const) {
            const roto = { ...resumen, [campo]: campo === 'engineVersion' || campo === 'catalogVersion' ? '0.0.0-viejo' : -1 };
            assert.equal(readSummary(roto).kind, 'outdated', campo);
        }
        for (const basura of ['hola', 42, [], {}, { ...resumen, clubName: 3 }]) {
            assert.equal(readSummary(basura).kind, 'outdated');
        }
        assert.deepEqual(readSummary(undefined), { kind: 'none' });
    });
});

describe('rugby-manager · lectura segura del guardado', () => {
    const sobre = () => JSON.parse(JSON.stringify(toEnvelope(startedGame(), '2026-01-01T00:00:00.000Z')));

    it('sin nada guardado es "none"', () => {
        assert.deepEqual(readEnvelope(undefined), { kind: 'none' });
        assert.deepEqual(readEnvelope(null), { kind: 'none' });
    });

    it('lo ilegible es "outdated" y nunca tira', () => {
        for (const basura of ['hola', 42, [], {}, { schema: MANAGER_SCHEMA }, { schema: MANAGER_SCHEMA, game: 3 }]) {
            const r = readEnvelope(basura);
            assert.equal(r.kind, 'outdated', JSON.stringify(basura));
        }
    });

    it('un esquema, motor o catálogo distinto es "outdated" con motivo', () => {
        for (const campo of ['schema', 'engineVersion', 'worldSchema', 'catalogVersion'] as const) {
            const s = sobre();
            s[campo] = campo === 'engineVersion' || campo === 'catalogVersion' ? '0.0.0-viejo' : -1;
            const r = readEnvelope(s);
            assert.equal(r.kind, 'outdated', campo);
            if (r.kind === 'outdated') assert.ok(r.reason.length > 10);
        }
    });

    it('un club que ya no existe es "outdated"', () => {
        const s = sobre();
        s.game.managerClubId = 'club_que_no_esta';
        assert.equal(readEnvelope(s).kind, 'outdated');
    });

    it('un sobre sano es "ok"', () => {
        assert.equal(readEnvelope(sobre()).kind, 'ok');
    });
});
