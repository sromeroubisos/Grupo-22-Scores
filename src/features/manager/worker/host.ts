// El motor de Rugby Manager detrás del protocolo: recibe comandos, tiene la partida, la
// simula y la guarda.
//
// No sabe si está en un Web Worker o en el hilo principal: recibe cómo guardar (`EngineStorage`)
// y cómo contestar (`emit`). En el navegador lo envuelve `engine.worker.ts`; si el navegador no
// puede crear un worker, `client.ts` lo usa directo en el hilo principal; los tests lo usan con un
// almacén en memoria.
//
// Los comandos se atienden UNO POR VEZ, en el orden en que llegan: el motor tiene una sola
// partida y un solo flujo de azar.
import {
    clubOf, closeSeasonAsync, createGame, finishLiveMatch, playNextMatchAsync, prepareLiveMatchAsync, seasonView,
    setPhilosophy, startCareerAsync, type LiveMatchSetup, type ManagerGame,
} from '../game/game.ts';
import { buildChooseView, buildPlayView } from '../game/slim.ts';
import type { LoadResult, SummaryResult } from '../game/save.ts';
import type { CommandName, Commands, Request, Response } from './protocol.ts';

/** Dónde se guarda la partida. En el navegador es IndexedDB. */
export interface EngineStorage {
    loadSummary(): Promise<SummaryResult>;
    loadManager(): Promise<LoadResult>;
    saveManager(game: ManagerGame): Promise<boolean>;
    clearManager(): Promise<void>;
}

/** Espera antes de guardar tras un cambio, para juntar varios en un solo guardado. */
const DEFAULT_SAVE_DELAY_MS = 400;

export class EngineHost {
    private game: ManagerGame | null = null;
    /** La partida completa, trayéndose en segundo plano desde que el menú pidió el resumen. */
    private prefetch: Promise<LoadResult> | null = null;
    private pendingLive: LiveMatchSetup | null = null;
    private queue: Promise<void> = Promise.resolve();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private saving = false;
    private dirty = false;

    private readonly storage: EngineStorage;
    private readonly emit: (response: Response) => void;
    private readonly saveDelayMs: number;

    constructor(storage: EngineStorage, emit: (response: Response) => void, saveDelayMs: number = DEFAULT_SAVE_DELAY_MS) {
        this.storage = storage;
        this.emit = emit;
        this.saveDelayMs = saveDelayMs;
    }

    /** Encola un pedido; se atiende cuando terminan los anteriores. */
    post(request: Request): Promise<void> {
        this.queue = this.queue.then(() => this.handle(request));
        return this.queue;
    }

    /** La partida que tiene el motor (para los tests). */
    current(): ManagerGame | null {
        return this.game;
    }

    private async handle(request: Request): Promise<void> {
        try {
            const result = await this.run(request);
            this.emit({ id: request.id, kind: 'result', result });
        } catch (error) {
            console.error(error);
            this.emit({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    }

    private requireGame(): ManagerGame {
        if (!this.game) throw new Error('No hay una partida abierta.');
        return this.game;
    }

    private async run<N extends CommandName>(request: Extract<Request, { type: N }>): Promise<Commands[N]['output']>;
    private async run(request: Request): Promise<unknown> {
        const progress = (value: number) => this.emit({ id: request.id, kind: 'progress', value });

        switch (request.type) {
            case 'summary': {
                const summary = await this.storage.loadSummary();
                // El menú ya tiene lo que necesita: el guardado completo se trae mientras lo mira.
                if (summary.kind === 'ok' && !this.prefetch) this.prefetch = this.storage.loadManager();
                return summary;
            }
            case 'continue': {
                const loaded = await (this.prefetch ?? this.storage.loadManager());
                this.prefetch = null;
                if (loaded.kind === 'ok' && loaded.game.managerClubId) {
                    this.game = loaded.game;
                    return { kind: 'ok', play: buildPlayView(loaded.game) };
                }
                return {
                    kind: 'failed',
                    reason: loaded.kind === 'outdated' ? loaded.reason : 'No se pudo leer la partida guardada.',
                };
            }
            case 'newWorld': {
                this.game = createGame(request.input.seed);
                this.pendingLive = null;
                return buildChooseView(this.game);
            }
            case 'start': {
                const { clubId, name } = request.input;
                this.game = await startCareerAsync(this.requireGame(), clubId, { name, age: 40, nationality: 'ARG' }, progress);
                this.markDirty();
                return buildPlayView(this.game);
            }
            case 'play': {
                this.game = await playNextMatchAsync(this.requireGame(), progress);
                this.markDirty();
                return buildPlayView(this.game);
            }
            case 'prepareLive': {
                const prepared = await prepareLiveMatchAsync(this.requireGame(), progress);
                if (!prepared) return null;
                this.game = prepared.game;
                this.pendingLive = prepared.setup;
                this.markDirty();
                const match = this.game.world.matches.find((m) => m.id === prepared.setup.matchId);
                return {
                    play: buildPlayView(this.game),
                    setup: prepared.setup,
                    homeClub: match ? clubOf(this.game.world, match.homeClubId) : undefined,
                    awayClub: match ? clubOf(this.game.world, match.awayClubId) : undefined,
                };
            }
            case 'finishLive': {
                const setup = this.pendingLive;
                if (!setup) throw new Error('No hay un partido en vivo para confirmar.');
                const { result, mySubs, eventActors } = request.input;
                this.game = finishLiveMatch(this.requireGame(), setup, result, mySubs, eventActors);
                this.pendingLive = null;
                this.markDirty();
                return buildPlayView(this.game);
            }
            case 'closeSeason': {
                const before = this.requireGame();
                const view = seasonView(before);
                const closed = await closeSeasonAsync(before, progress);
                this.game = closed.game;
                this.pendingLive = null;
                this.markDirty();
                return {
                    play: buildPlayView(closed.game),
                    closed: {
                        report: closed.report,
                        leagueName: view.league?.name ?? '',
                        position: view.position,
                        previousYear: before.world.seasonYear,
                    },
                };
            }
            case 'philosophy': {
                this.game = setPhilosophy(this.requireGame(), request.input.axis, request.input.value);
                this.markDirty();
                return buildPlayView(this.game);
            }
            case 'reset': {
                this.cancelSave();
                this.game = null;
                this.prefetch = null;
                this.pendingLive = null;
                this.dirty = false;
                await this.storage.clearManager();
                return null;
            }
            case 'flush': {
                await this.saveNow();
                return null;
            }
        }
    }

    // ── Guardado ──
    // Corre en el mismo hilo que el motor, pero fuera del de la pantalla: clonar 25 MB no la toca.

    private markDirty(): void {
        this.dirty = true;
        if (this.saveTimer === null) {
            this.saveTimer = setTimeout(() => {
                this.saveTimer = null;
                void this.saveNow();
            }, this.saveDelayMs);
        }
    }

    private cancelSave(): void {
        if (this.saveTimer !== null) clearTimeout(this.saveTimer);
        this.saveTimer = null;
    }

    private async saveNow(): Promise<void> {
        this.cancelSave();
        if (this.saving) return;
        const game = this.game;
        if (!game?.managerClubId || !this.dirty) return;
        this.saving = true;
        this.dirty = false;
        try {
            const ok = await this.storage.saveManager(game);
            this.emit({ id: 0, kind: 'saved', ok });
        } finally {
            this.saving = false;
        }
        // Si cambió algo mientras se guardaba, va otra vez.
        if (this.dirty) this.markDirty();
    }
}
