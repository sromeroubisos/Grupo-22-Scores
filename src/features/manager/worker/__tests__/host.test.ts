// El motor detrás del protocolo, sin navegador ni Worker: la misma clase que corre en el worker,
// con un almacén en memoria. Que sea idéntico al motor directo es lo que garantiza que mover
// todo a otro hilo no cambia ni un resultado.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { createStreamingRunner } from '../../engine/runner.ts';
import {
    createGame, leagueChoices, playNextMatchAsync, startCareerAsync, type ManagerGame,
} from '../../game/game.ts';
import { clubOf, fixturesOf, squadOf } from '../../game/queries.ts';
import type { LoadResult, SummaryResult } from '../../game/save.ts';
import { toEnvelope, toSummary } from '../../game/save.ts';
import { EngineHost, type EngineStorage } from '../host.ts';
import type { CommandName, Commands, Request, Response } from '../protocol.ts';

const SEED = 7;
const digest = (g: unknown): string => createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 16);

function memoryStorage(initial?: ManagerGame): EngineStorage & { saved: ManagerGame[]; cleared: number } {
    let stored: ManagerGame | undefined = initial;
    const saved: ManagerGame[] = [];
    return {
        saved,
        cleared: 0,
        async loadSummary(): Promise<SummaryResult> {
            const s = stored ? toSummary(stored, '2026-01-01T00:00:00.000Z') : null;
            return s ? { kind: 'ok', summary: s } : { kind: 'none' };
        },
        async loadManager(): Promise<LoadResult> {
            return stored ? { kind: 'ok', game: stored, savedAt: '2026-01-01T00:00:00.000Z' } : { kind: 'none' };
        },
        async saveManager(game) {
            stored = game;
            saved.push(game);
            return true;
        },
        async clearManager() {
            stored = undefined;
            this.cleared++;
        },
    };
}

function harness(storage: EngineStorage = memoryStorage()) {
    const responses: Response[] = [];
    const host = new EngineHost(storage, (r) => responses.push(r), 5);
    let nextId = 0;
    async function call<N extends CommandName>(type: N, input: Commands[N]['input'] = {} as Commands[N]['input']) {
        const id = ++nextId;
        await host.post({ id, type, input } as Request);
        const reply = responses.find((r) => r.id === id && (r.kind === 'result' || r.kind === 'error'));
        assert.ok(reply, `sin respuesta a ${type}`);
        if (reply.kind === 'error') throw new Error(reply.message);
        const progress = responses.filter((r) => r.id === id && r.kind === 'progress').length;
        return { result: (reply as { result: unknown }).result as Commands[N]['output'], progress };
    }
    return { host, call, responses, storage };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

function primeraB(): { seed: number; clubId: string } {
    const game = createGame(SEED);
    const liga = leagueChoices(game.world).find((l) => l.competition.shortName === 'Primera B de la URBA')!;
    return { seed: SEED, clubId: liga.clubs[6].id };
}

describe('rugby-manager · el motor detrás del protocolo', () => {
    it('sin partida guardada el resumen es "none"', async () => {
        const { call } = harness();
        assert.deepEqual((await call('summary')).result, { kind: 'none' });
    });

    it('un comando sin partida abierta contesta con error, no se cae', async () => {
        const { call } = harness();
        await assert.rejects(() => call('play'), /No hay una partida abierta/);
    });

    it('elegir club: la vista trae todas las ligas y la fuerza de cada club', async () => {
        const { call } = harness();
        const { result } = await call('newWorld', { seed: SEED });
        assert.ok(result.choices.length >= 40);
        for (const { clubs } of result.choices) for (const c of clubs) assert.equal(typeof result.strengths[c.id], 'number');
    });

    it('arrancar y jugar: la vista es chica, resuelve todos los nombres y es igual al motor directo', async () => {
        const { seed, clubId } = primeraB();
        const { host, call } = harness();
        await call('newWorld', { seed });
        const arranque = await call('start', { clubId, name: 'Prueba' });
        assert.ok(arranque.progress >= 2, 'informa el avance de los meses previos');
        const jugado = await call('play');
        const { game, view, strength } = jugado.result;

        // Chica: unos cientos de KB contra los ~25 MB del mundo.
        const bytes = JSON.stringify(jugado.result).length;
        assert.ok(bytes < 600_000, `la vista pesa ${bytes} bytes`);
        assert.ok(strength > 0);

        // Todo lo que la pantalla nombra se puede resolver.
        const mio = clubOf(game.world, game.managerClubId!);
        assert.ok(mio, 'el club propio');
        for (const m of fixturesOf(game.world, game.managerClubId!)) {
            assert.ok(clubOf(game.world, m.homeClubId) && clubOf(game.world, m.awayClubId), 'los rivales del calendario');
            assert.ok(game.world.competitions.some((c) => c.id === m.competitionId), 'la competición');
        }
        assert.ok(fixturesOf(game.world, game.managerClubId!).length >= 26, '14 clubes, ida y vuelta');
        assert.ok(squadOf(game.world, game.managerClubId!).length >= 23);
        assert.equal(view.lastMatch?.played, true);
        for (const row of view.standings) assert.ok(clubOf(game.world, row.clubId), 'los clubes de la tabla');
        // Los nombres del último partido (goleadores, mejores) también están.
        const nombrados = new Set(game.world.players.map((p) => p.id));
        for (const s of view.lastMatch?.result?.playerStats ?? []) assert.ok(nombrados.has(s.playerId));

        // Igual al motor directo: mover el motor de hilo no cambia el mundo.
        let directo = await startCareerAsync(createGame(seed), clubId, { name: 'Prueba', age: 40, nationality: 'ARG' });
        directo = await playNextMatchAsync(directo);
        assert.equal(digest(host.current()), digest(directo));
    });

    it('guarda solo, sin que la pantalla lo pida, y "continuar" retoma lo guardado', async () => {
        const { seed, clubId } = primeraB();
        const storage = memoryStorage();
        const primero = harness(storage);
        await primero.call('newWorld', { seed });
        await primero.call('start', { clubId, name: 'Prueba' });
        await primero.call('play');
        await settle();
        assert.ok(storage.saved.length >= 1, 'se guardó');
        assert.ok(primero.responses.some((r) => r.kind === 'saved' && r.ok));
        const ultimo = storage.saved[storage.saved.length - 1];
        assert.equal(ultimo.managerClubId, clubId);

        // Otra sesión del motor: el menú pide el resumen y después continúa.
        const segundo = harness(storage);
        const resumen = (await segundo.call('summary')).result;
        assert.equal(resumen.kind, 'ok');
        const seguir = (await segundo.call('continue')).result;
        assert.equal(seguir.kind, 'ok');
        if (seguir.kind === 'ok') {
            assert.equal(seguir.play.game.managerClubId, clubId);
            assert.equal(seguir.play.view.position, (await primero.call('philosophy', { axis: 'tempo', value: 0 })).result.view.position);
        }
    });

    it('partido en vivo por el protocolo: el marcador es el mismo que simulándolo', async () => {
        const { seed, clubId } = primeraB();
        const vivo = harness();
        await vivo.call('newWorld', { seed });
        await vivo.call('start', { clubId, name: 'Prueba' });
        const preparado = (await vivo.call('prepareLive')).result!;
        assert.ok(preparado.homeClub && preparado.awayClub, 'trae los dos clubes');
        const runner = createStreamingRunner(preparado.setup.homeTeam, preparado.setup.awayTeam, preparado.setup.simOptions);
        const tras = (await vivo.call('finishLive', { result: runner.result, mySubs: [], eventActors: [] })).result;

        const simulado = harness();
        await simulado.call('newWorld', { seed });
        await simulado.call('start', { clubId, name: 'Prueba' });
        const jugado = (await simulado.call('play')).result;

        const a = tras.view.lastMatch!.result!;
        const b = jugado.view.lastMatch!.result!;
        assert.equal(a.homeScore, b.homeScore);
        assert.equal(a.awayScore, b.awayScore);
    });

    it('confirmar un partido en vivo que nadie preparó contesta con error', async () => {
        const { seed, clubId } = primeraB();
        const { call } = harness();
        await call('newWorld', { seed });
        await call('start', { clubId, name: 'Prueba' });
        await assert.rejects(() => call('finishLive', { result: {} as never, mySubs: [], eventActors: [] }), /partido en vivo/);
    });

    it('la filosofía cambia la táctica y devuelve la vista', async () => {
        const { seed, clubId } = primeraB();
        const { call } = harness();
        await call('newWorld', { seed });
        await call('start', { clubId, name: 'Prueba' });
        const { result } = await call('philosophy', { axis: 'tempo', value: 2 });
        assert.equal(result.game.world.tactics[clubId].philosophy.tempo, 2);
    });

    it('cerrar la temporada devuelve el resumen del año y la vista de la siguiente', async () => {
        const { host, call } = harness();
        await call('newWorld', { seed: SEED });
        const top14 = (await call('newWorld', { seed: SEED })).result.choices.find((c) => c.competition.shortName === 'T14')!;
        await call('start', { clubId: top14.clubs[5].id, name: 'Prueba' });
        let guard = 0;
        for (;;) {
            const { result } = await call('play');
            if (result.view.clubDone) break;
            if (++guard > 80) assert.fail('la temporada no termina');
        }
        const { result } = await call('closeSeason');
        assert.equal(result.closed.report.newSeasonYear, result.closed.previousYear + 1);
        assert.equal(result.play.game.world.seasonYear, result.closed.previousYear + 1);
        assert.equal(result.play.view.clubDone, false);
        assert.ok(result.closed.leagueName.length > 0);
        assert.ok(host.current());
    });

    it('"empezar de nuevo" borra lo guardado y deja el motor sin partida', async () => {
        const { seed, clubId } = primeraB();
        const storage = memoryStorage();
        const { call, host } = harness(storage);
        await call('newWorld', { seed });
        await call('start', { clubId, name: 'Prueba' });
        await settle();
        await call('reset');
        assert.equal(host.current(), null);
        assert.equal(storage.cleared, 1);
        assert.deepEqual((await call('summary')).result, { kind: 'none' });
        void toEnvelope;
    });
});
