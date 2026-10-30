import type { CommandName, Commands, Request, Response } from '../../../../features/manager/worker/protocol.ts';
import * as storage from './managerStorage.ts';

// El cliente del motor: la pantalla le manda comandos y recibe vistas.
//
// Lo normal es un Web Worker (`engine.worker.ts`): el mundo vive y se simula ahí, y el hilo de la
// pantalla no se entera. Si el navegador no puede crear el worker (una política de seguridad, un
// navegador viejo, un fallo al cargarlo), el MISMO motor corre en el hilo principal: es más
// lento para la pantalla, pero el juego anda, y por tramos y con barra de progreso igual.

export interface EngineClient {
    /** Manda un comando. `onProgress` recibe el avance (0 a 1) de los que simulan. */
    call<N extends CommandName>(
        type: N,
        input?: Commands[N]['input'],
        onProgress?: (progress: number) => void,
    ): Promise<Commands[N]['output']>;
    /** Avisa cuando el motor guardó (o no pudo). */
    onSaved(listener: (ok: boolean) => void): void;
    /** 'worker' o 'main' (el respaldo). */
    mode(): 'worker' | 'main';
    dispose(): void;
}

interface Pending {
    request: Request;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    onProgress?: (progress: number) => void;
}

export function createEngineClient(): EngineClient {
    let nextId = 0;
    const pending = new Map<number, Pending>();
    let savedListener: ((ok: boolean) => void) | null = null;
    let worker: Worker | null = null;
    let healthy = false;
    let currentMode: 'worker' | 'main' = 'worker';
    let fallback: Promise<{ post(request: Request): Promise<void> }> | null = null;

    const handleResponse = (response: Response) => {
        if (response.kind === 'saved') {
            savedListener?.(response.ok);
            return;
        }
        const entry = pending.get(response.id);
        if (!entry) return;
        if (response.kind === 'progress') {
            entry.onProgress?.(response.value);
            return;
        }
        pending.delete(response.id);
        if (response.kind === 'result') entry.resolve(response.result);
        else entry.reject(new Error(response.message));
    };

    /** El motor en el hilo principal. Se importa recién acá: en el camino normal no se descarga. */
    const startFallback = () => {
        currentMode = 'main';
        fallback ??= import('../../../../features/manager/worker/host.ts').then(({ EngineHost }) => {
            const host = new EngineHost(storage, handleResponse);
            return { post: (request: Request) => host.post(request) };
        });
        return fallback;
    };

    const send = (request: Request) => {
        if (currentMode === 'worker' && worker) worker.postMessage(request);
        else void startFallback().then((host) => host.post(request));
    };

    try {
        worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<Response>) => {
            healthy = true;
            handleResponse(event.data);
        };
        worker.onerror = () => {
            // Un error después de arrancar lo atiende el motor (devuelve 'error' al comando).
            // Si nunca contestó, el worker no pudo cargar: se sigue en el hilo principal.
            if (healthy) return;
            worker?.terminate();
            worker = null;
            currentMode = 'main';
            for (const entry of pending.values()) send(entry.request);
        };
    } catch {
        worker = null;
        currentMode = 'main';
    }

    return {
        call(type, input, onProgress) {
            const id = ++nextId;
            const request = { id, type, input: input ?? {} } as Request;
            return new Promise((resolve, reject) => {
                pending.set(id, { request, resolve: resolve as (value: unknown) => void, reject, onProgress });
                send(request);
            });
        },
        onSaved(listener) {
            savedListener = listener;
        },
        mode: () => currentMode,
        dispose() {
            worker?.terminate();
            worker = null;
            pending.clear();
        },
    };
}
