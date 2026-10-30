import type { ManagerGame } from '../../../../features/manager/game/game.ts';
import {
    readEnvelope, readSummary, toEnvelope, toSummary, type LoadResult, type SummaryResult,
} from '../../../../features/manager/game/save.ts';

// Guardado local de Rugby Manager en IndexedDB.
//
// El mundo serializado pesa ~25 MB (17.000 jugadores): no entra en los 5 MB de
// localStorage. IndexedDB guarda el objeto por clonado estructurado, sin pasar
// por JSON.stringify. Una sola partida, dos claves:
//   · `main`    el sobre completo (el mundo entero);
//   · `summary` unos pocos bytes (club, temporada, fecha) para que el menú aparezca
//               al instante sin leer ni validar los 25 MB.
// Se escriben en UNA transacción: nunca queda un resumen que no corresponda al sobre.
//
// Todo va envuelto: modo privado, cuota llena o un navegador sin IndexedDB son
// escenarios reales, y la partida tiene que poder seguir en memoria.
const DB_NAME = 'g22-rugby-manager';
const STORE = 'saves';
const KEY = 'main';
const SUMMARY_KEY = 'summary';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB no está disponible.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Corre una operación en una transacción y resuelve cuando ésta se confirma. */
async function inTransaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = work(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

/**
 * Lo que dice el menú, al instante. Si hay una partida de antes de que existiera el resumen,
 * se lee completa UNA vez para armarlo (y desde el próximo guardado ya lo tiene).
 */
export async function loadSummary(): Promise<SummaryResult> {
    try {
        const raw = await inTransaction<unknown>('readonly', (store) => store.get(SUMMARY_KEY));
        if (raw !== undefined) return readSummary(raw);
        const legacy = await loadManager();
        if (legacy.kind !== 'ok') return legacy.kind === 'outdated' ? legacy : { kind: 'none' };
        const summary = toSummary(legacy.game, legacy.savedAt);
        return summary ? readSummary(summary) : { kind: 'none' };
    } catch {
        // Sin acceso a IndexedDB (modo privado, bloqueo): se empieza de cero.
        return { kind: 'none' };
    }
}

/** Lee la partida completa. Si no hay acceso al almacén, es como si no hubiera partida. */
export async function loadManager(): Promise<LoadResult> {
    try {
        const raw = await inTransaction<unknown>('readonly', (store) => store.get(KEY));
        return readEnvelope(raw);
    } catch {
        // Sin acceso a IndexedDB (modo privado, bloqueo): se empieza de cero.
        return { kind: 'none' };
    }
}

/** Guarda la partida. Devuelve false si no se pudo; la partida sigue en memoria. */
export async function saveManager(game: ManagerGame): Promise<boolean> {
    try {
        const savedAt = new Date().toISOString();
        const summary = toSummary(game, savedAt);
        const db = await openDb();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                const store = tx.objectStore(STORE);
                store.put(toEnvelope(game, savedAt), KEY);
                if (summary) store.put(summary, SUMMARY_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
        return true;
    } catch {
        // Sin acceso a IndexedDB (modo privado, cuota): la partida sigue en memoria.
        return false;
    }
}

export async function clearManager(): Promise<void> {
    try {
        const db = await openDb();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(KEY);
                tx.objectStore(STORE).delete(SUMMARY_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
    } catch {
        // Nada que borrar si el almacén no está disponible.
    }
}
