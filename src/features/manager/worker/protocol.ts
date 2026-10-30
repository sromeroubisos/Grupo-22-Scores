// Los mensajes entre la pantalla y el motor de Rugby Manager.
//
// El motor corre en un Web Worker: ahí vive la partida (el mundo entero, ~25 MB), ahí se simula
// y ahí se guarda. La pantalla NUNCA tiene el mundo: recibe VISTAS (lo que hace falta para
// dibujar lo que se ve) y manda COMANDOS. Todo lo que cruza es JSON puro, y se copia al pasar.
import type { Club, ID, TacticsPhilosophy } from '../types/index.ts';
import type { MatchResult } from '../engine/types.ts';
import type { EventActors, SubLog } from '../engine/playerMatchStats.ts';
import type { RolloverReport } from '../engine/seasonRollover.ts';
import type { LeagueChoice, LiveMatchSetup, ManagerGame, SeasonView } from '../game/game.ts';
import type { SummaryResult } from '../game/save.ts';

/**
 * Lo que la pantalla de juego necesita. `game` tiene la FORMA de una partida pero con un mundo
 * recortado (tu club, sus partidos, la liga y los clubes y jugadores que se nombran), así los
 * tableros que ya existían siguen funcionando sin saber que el mundo real está en otro hilo.
 */
export interface PlayView {
    game: ManagerGame;
    view: SeasonView;
    /** Promedio de valoración del XV titular. */
    strength: number;
}

/** Lo que necesita la pantalla de elegir club. */
export interface ChooseView {
    choices: LeagueChoice[];
    /** Promedio del XV de cada club, por id. */
    strengths: Record<ID, number>;
}

export interface ClosedSeasonView {
    report: RolloverReport;
    leagueName: string;
    position: number;
    previousYear: number;
}

export interface LivePrepared {
    play: PlayView;
    setup: LiveMatchSetup;
    homeClub?: Club;
    awayClub?: Club;
}

export type ContinueResult = { kind: 'ok'; play: PlayView } | { kind: 'failed'; reason: string };

/** Cada comando y lo que devuelve. */
export interface Commands {
    /** El resumen del guardado, para el menú. Después el motor va trayendo la partida completa. */
    summary: { input: Record<string, never>; output: SummaryResult };
    continue: { input: Record<string, never>; output: ContinueResult };
    newWorld: { input: { seed: number }; output: ChooseView };
    start: { input: { clubId: ID; name: string }; output: PlayView };
    play: { input: Record<string, never>; output: PlayView };
    prepareLive: { input: Record<string, never>; output: LivePrepared | null };
    finishLive: {
        input: { result: MatchResult; mySubs: SubLog; eventActors: Array<EventActors | undefined> };
        output: PlayView;
    };
    closeSeason: { input: Record<string, never>; output: { play: PlayView; closed: ClosedSeasonView } };
    philosophy: { input: { axis: keyof TacticsPhilosophy; value: number }; output: PlayView };
    reset: { input: Record<string, never>; output: null };
    /** Guardar ya (la pestaña se está yendo). */
    flush: { input: Record<string, never>; output: null };
}

export type CommandName = keyof Commands;

export type Request = {
    [K in CommandName]: { id: number; type: K; input: Commands[K]['input'] };
}[CommandName];

export type Response =
    | { id: number; kind: 'progress'; value: number }
    | { id: number; kind: 'result'; result: unknown }
    | { id: number; kind: 'error'; message: string }
    /** Aviso sin pedido: el motor guardó (o no pudo). */
    | { id: 0; kind: 'saved'; ok: boolean };
