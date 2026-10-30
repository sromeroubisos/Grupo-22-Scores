// El Web Worker de Rugby Manager: acá viven la partida, la simulación y el guardado.
//
// El hilo de la pantalla no ve nunca el mundo (~25 MB): manda comandos y recibe vistas. Por eso
// en un celular, donde simular es varias veces más lento, la pantalla sigue respondiendo igual
// que en una computadora: lo único que cambia es cuánto tarda la barra de progreso.
import { EngineHost } from '../../../../features/manager/worker/host.ts';
import type { Request, Response } from '../../../../features/manager/worker/protocol.ts';
import * as storage from './managerStorage.ts';

interface WorkerScope {
    postMessage(message: unknown): void;
    onmessage: ((event: MessageEvent<Request>) => void) | null;
}

const scope = self as unknown as WorkerScope;

const host = new EngineHost(storage, (response: Response) => scope.postMessage(response));

scope.onmessage = (event) => {
    void host.post(event.data);
};
