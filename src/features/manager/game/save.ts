// El sobre del guardado de Rugby Manager: forma, versiones y lectura segura.
//
// Esto es la parte PURA del guardado (sin IndexedDB, sin reloj): se prueba en
// Node. El acceso al navegador vive en
// src/app/juegos/minijuegos/rugby-manager/managerStorage.ts.
//
// Misma política que Carrera de Rugby: una partida que no se puede leer con
// seguridad NUNCA explota, vuelve como 'outdated' con el motivo, y la UI ofrece
// empezar de nuevo. Hasta que haya jugadores no hay migradores (Fase 5).
import { ARGENTINA_CATALOG_VERSION } from '../data/argentina.ts';
import { ENGINE_SCHEMA_VERSION } from '../types/index.ts';
import type { ManagerGame } from './game.ts';

/** Forma del sobre y de `ManagerGame`. Subir si cambia alguna de las dos. */
export const MANAGER_SCHEMA = 1;
/** Lógica de simulación que cambia resultados con la misma semilla. */
export const MANAGER_ENGINE_VERSION = '0.2.0';
/** Mundo de partida: ligas, clubes y plantillas de `createDemoWorld`. */
export const MANAGER_CATALOG_VERSION = `2.0.0+${ARGENTINA_CATALOG_VERSION}`;

export interface SaveEnvelope {
    schema: number;
    engineVersion: string;
    /** `World.engineSchemaVersion` con el que se guardó. */
    worldSchema: number;
    catalogVersion: string;
    savedAt: string;
    game: ManagerGame;
}

export type LoadResult =
    | { kind: 'none' }
    | { kind: 'ok'; game: ManagerGame; savedAt: string }
    | { kind: 'outdated'; reason: string };

/** `savedAt` lo pone quien llama (ISO): el motor no lee el reloj. */
export function toEnvelope(game: ManagerGame, savedAt: string): SaveEnvelope {
    return {
        schema: MANAGER_SCHEMA,
        engineVersion: MANAGER_ENGINE_VERSION,
        worldSchema: ENGINE_SCHEMA_VERSION,
        catalogVersion: MANAGER_CATALOG_VERSION,
        savedAt,
        game,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lee lo que haya en el almacén. Jamás tira: lo ilegible es 'outdated'. */
export function readEnvelope(raw: unknown): LoadResult {
    if (raw === undefined || raw === null) return { kind: 'none' };
    if (!isRecord(raw)) return { kind: 'outdated', reason: 'El guardado no tiene el formato esperado.' };

    if (raw.schema !== MANAGER_SCHEMA) {
        return { kind: 'outdated', reason: 'La partida es de una versión anterior del juego.' };
    }
    if (raw.engineVersion !== MANAGER_ENGINE_VERSION || raw.worldSchema !== ENGINE_SCHEMA_VERSION) {
        return { kind: 'outdated', reason: 'El motor cambió desde que se guardó la partida.' };
    }
    if (raw.catalogVersion !== MANAGER_CATALOG_VERSION) {
        return { kind: 'outdated', reason: 'Los clubes y las ligas cambiaron desde que se guardó la partida.' };
    }

    const game = raw.game;
    if (!isRecord(game) || !isRecord(game.world)) {
        return { kind: 'outdated', reason: 'La partida guardada está incompleta.' };
    }
    const world = game.world;
    const hasLists = ['clubs', 'players', 'matches', 'competitions', 'contracts'].every((k) => Array.isArray(world[k]));
    if (!hasLists || !isRecord(world.tactics) || typeof world.currentDate !== 'string') {
        return { kind: 'outdated', reason: 'La partida guardada está incompleta.' };
    }
    if (typeof game.entropy !== 'number' || !Number.isFinite(game.entropy) || typeof game.seed !== 'number') {
        return { kind: 'outdated', reason: 'La partida guardada no tiene su semilla.' };
    }
    const clubId = game.managerClubId;
    if (clubId !== null && !(world.clubs as { id?: unknown }[]).some((c) => c.id === clubId)) {
        return { kind: 'outdated', reason: 'El club que dirigías ya no existe en el mundo guardado.' };
    }
    if (clubId !== null && !isRecord(game.manager)) {
        return { kind: 'outdated', reason: 'La partida guardada no tiene a su entrenador.' };
    }

    return {
        kind: 'ok',
        game: game as unknown as ManagerGame,
        savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    };
}

// ─── Resumen liviano ────────────────────────────────────────────────────────
//
// El guardado completo pesa ~25 MB: leerlo y validarlo cuesta casi medio segundo, y el menú no
// lo necesita para nada más que decir "Newman · temporada 2026/27 · 7 mar 2027". Junto con el
// sobre se guarda este resumen de unos pocos bytes; el menú lo lee al instante y el guardado
// completo se trae recién cuando se aprieta "Continuar" (o en segundo plano, mientras se mira
// el menú).

export interface GameSummary {
    schema: number;
    engineVersion: string;
    worldSchema: number;
    catalogVersion: string;
    savedAt: string;
    clubName: string;
    seasonYear: number;
    currentDate: string;
}

export type SummaryResult =
    | { kind: 'none' }
    | { kind: 'ok'; summary: GameSummary }
    | { kind: 'outdated'; reason: string };

/** El resumen de un juego con club elegido; null si todavía se está eligiendo club. */
export function toSummary(game: ManagerGame, savedAt: string): GameSummary | null {
    const club = game.world.clubs.find((c) => c.id === game.managerClubId);
    if (!club) return null;
    return {
        schema: MANAGER_SCHEMA,
        engineVersion: MANAGER_ENGINE_VERSION,
        worldSchema: ENGINE_SCHEMA_VERSION,
        catalogVersion: MANAGER_CATALOG_VERSION,
        savedAt,
        clubName: club.name,
        seasonYear: game.world.seasonYear,
        currentDate: game.world.currentDate,
    };
}

/** Lee el resumen. Las versiones se comparan igual que con el guardado completo. */
export function readSummary(raw: unknown): SummaryResult {
    if (raw === undefined || raw === null) return { kind: 'none' };
    if (!isRecord(raw)) return { kind: 'outdated', reason: 'El guardado no tiene el formato esperado.' };
    if (raw.schema !== MANAGER_SCHEMA) {
        return { kind: 'outdated', reason: 'La partida es de una versión anterior del juego.' };
    }
    if (raw.engineVersion !== MANAGER_ENGINE_VERSION || raw.worldSchema !== ENGINE_SCHEMA_VERSION) {
        return { kind: 'outdated', reason: 'El motor cambió desde que se guardó la partida.' };
    }
    if (raw.catalogVersion !== MANAGER_CATALOG_VERSION) {
        return { kind: 'outdated', reason: 'Los clubes y las ligas cambiaron desde que se guardó la partida.' };
    }
    if (typeof raw.clubName !== 'string' || typeof raw.seasonYear !== 'number' || typeof raw.currentDate !== 'string') {
        return { kind: 'outdated', reason: 'La partida guardada está incompleta.' };
    }
    return {
        kind: 'ok',
        summary: {
            schema: MANAGER_SCHEMA,
            engineVersion: MANAGER_ENGINE_VERSION,
            worldSchema: ENGINE_SCHEMA_VERSION,
            catalogVersion: MANAGER_CATALOG_VERSION,
            savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
            clubName: raw.clubName,
            seasonYear: raw.seasonYear,
            currentDate: raw.currentDate,
        },
    };
}
