/**
 * Copia en sessionStorage del catálogo de ligas de un deporte (scope=catalog de
 * /api/public/tournaments), para que ir de la home a /torneos y volver no lo
 * baje dos veces. Vive lo mismo que el snapshot fresco del servidor (10 min).
 *
 * Modo privado y cuota llena son escenarios reales: cada acceso va en try/catch
 * y, si falla, simplemente no hay copia.
 *
 * Callers: src/app/page.tsx y src/app/tournaments/page.tsx.
 */

const STORAGE_PREFIX = 'g22-league-catalog:v1';
const MAX_AGE_MS = 10 * 60 * 1000;

type StoredCatalog<T> = {
    savedAt: number;
    data: T[];
};

function buildKey(sport: string, audience: string) {
    return `${STORAGE_PREFIX}:${sport}:${audience}`;
}

export function readCachedLeagueCatalog<T>(sport: string, audience: string): T[] | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.sessionStorage.getItem(buildKey(sport, audience));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<StoredCatalog<T>>;
        if (!parsed || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.data)) return null;
        if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;

        return parsed.data;
    } catch {
        return null;
    }
}

export function writeCachedLeagueCatalog<T>(sport: string, audience: string, data: T[]) {
    if (typeof window === 'undefined') return;

    try {
        const payload: StoredCatalog<T> = { savedAt: Date.now(), data };
        window.sessionStorage.setItem(buildKey(sport, audience), JSON.stringify(payload));
    } catch {
        // Sin espacio o sin acceso: la próxima entrada vuelve a pedirlo al servidor.
    }
}
