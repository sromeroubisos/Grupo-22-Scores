/**
 * Guardado y lectura del ranking de World Rugby.
 *
 * La tabla `world_rugby_ranking_snapshots` es una foto por categoria y por
 * semana: lo que el cron de los lunes escribe y lo que la pantalla lee. No es un
 * cache opcional, es lo que hace que el ranking siga en pantalla cuando la API
 * de Pulselive no contesta, y lo que va a permitir mas adelante mirar como se
 * movio una union semana a semana.
 *
 * DB-first con caida a vivo, igual que `external_match_cache`: si la tabla
 * todavia no existe en la base (las migraciones de este proyecto se corren a
 * mano), la pantalla sigue andando contra la API y el unico costo es que cada
 * instancia paga un pedido cada media hora. Lo que NUNCA hacemos es tapar una
 * falla con una tabla vacia — si no hay ni base ni API, esto tira y el que
 * llama decide.
 */
import {
    fetchWorldRugbyRanking,
    WORLD_RUGBY_CATEGORIES,
    type WorldRugbyCategory,
    type WorldRugbyEntry,
    type WorldRugbySnapshot,
} from '@/lib/integrations/worldrugby/rankings';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

const TABLE = 'world_rugby_ranking_snapshots';

/**
 * Media hora. El ranking se mueve una vez por semana, asi que el TTL no existe
 * para tener el dato fresco sino para no pegarle a una API con tope de 50
 * pedidos por minuto desde cada instancia serverless que se despierte.
 */
const CACHE_TTL_MS = 30 * 60_000;

type CacheHit = { snapshot: WorldRugbySnapshot; expiresAt: number };

// Cache por instancia, sin `setInterval`: un temporizador de modulo deja el
// proceso vivo y cuelga `node --test` (ya nos paso con `cache.ts`).
//
// La clave lleva la fecha porque la pantalla puede pedir cualquier semana desde
// 2003: sin eso, mirar una foto vieja envenenaba la vigente para todos.
const memoryCache = new Map<string, CacheHit>();

function cacheKey(category: WorldRugbyCategory, date?: string | null): string {
    return `${category}|${date || 'vigente'}`;
}

export type SnapshotSource = 'memoria' | 'base' | 'vivo';

export type SnapshotRead = {
    snapshot: WorldRugbySnapshot;
    source: SnapshotSource;
};

type SnapshotRow = {
    category: string;
    effective_date: string;
    label: string | null;
    fetched_at: string | null;
    entries: unknown;
};

function isMissingSnapshotTable(error: unknown) {
    return isMissingTableError(
        error as { code?: string | null; message?: string | null; details?: string | null },
        TABLE,
    );
}

function rowToSnapshot(row: SnapshotRow): WorldRugbySnapshot | null {
    if (!Array.isArray(row.entries) || !row.entries.length) return null;

    return {
        category: row.category as WorldRugbyCategory,
        label: row.label || '',
        effectiveDate: row.effective_date,
        fetchedAt: row.fetched_at || row.effective_date,
        entries: row.entries as WorldRugbyEntry[],
    };
}

/**
 * Escribe la foto. Devuelve `false` cuando la tabla todavia no existe, que no es
 * un error: es el estado de una base a la que no le corrieron la migracion.
 */
export async function saveWorldRugbySnapshot(snapshot: WorldRugbySnapshot): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
        .from(TABLE)
        .upsert(
            {
                category: snapshot.category,
                effective_date: snapshot.effectiveDate,
                label: snapshot.label,
                fetched_at: snapshot.fetchedAt,
                entries: snapshot.entries,
            },
            { onConflict: 'category,effective_date' },
        );

    if (error) {
        if (isMissingSnapshotTable(error)) {
            console.warn(`[world-rugby] la tabla ${TABLE} no existe todavia: la foto no se guarda.`);
            return false;
        }
        throw new Error(`No se pudo guardar la foto del ranking de World Rugby: ${error.message}`);
    }

    memoryCache.set(cacheKey(snapshot.category, snapshot.effectiveDate), { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
    return true;
}

/**
 * La foto guardada de una categoria: la de `date` si se pide una, la ultima si
 * no. Devuelve null cuando no hay tabla ni fila — no es un error.
 */
export async function readStoredSnapshot(
    category: WorldRugbyCategory,
    date?: string | null,
): Promise<WorldRugbySnapshot | null> {
    const supabase = createAdminClient();
    // Con fecha se busca la foto vigente ESE dia, no la de ese dia exacto: World
    // Rugby publica los lunes, asi que un miercoles no tiene foto propia y lo
    // que corresponde mostrar es la del lunes anterior.
    const query = supabase
        .from(TABLE)
        .select('category, effective_date, label, fetched_at, entries')
        .eq('category', category);

    const { data, error } = await (date ? query.lte('effective_date', date) : query)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        if (isMissingSnapshotTable(error)) return null;
        throw new Error(`No se pudo leer la foto del ranking de World Rugby: ${error.message}`);
    }

    return data ? rowToSnapshot(data as SnapshotRow) : null;
}

/**
 * Una foto: memoria, base, y recien ahi la API. Cuando sale de la API se escribe
 * de vuelta (write-through), asi la proxima visita ya la encuentra.
 *
 * Sin `date` devuelve la vigente. Con `date` devuelve la de esa semana, que es
 * como se miran las tablas del pasado — la API responde desde el 2003-10-13.
 */
export async function getWorldRugbySnapshot(
    category: WorldRugbyCategory,
    date?: string | null,
): Promise<SnapshotRead> {
    const key = cacheKey(category, date);
    const cached = memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return { snapshot: cached.snapshot, source: 'memoria' };
    }

    const stored = await readStoredSnapshot(category, date);
    // Una foto historica guardada sirve tal cual. La vigente tambien, porque la
    // reescribe el cron de los lunes.
    if (stored) {
        memoryCache.set(key, { snapshot: stored, expiresAt: Date.now() + CACHE_TTL_MS });
        return { snapshot: stored, source: 'base' };
    }

    const live = await fetchWorldRugbyRanking(category, { date });
    memoryCache.set(key, { snapshot: live, expiresAt: Date.now() + CACHE_TTL_MS });

    // Si la escritura falla no se cae la lectura: ya tenemos el dato en la mano.
    try {
        await saveWorldRugbySnapshot(live);
    } catch (error) {
        console.error('[world-rugby] no se pudo guardar la foto recien traida:', error);
    }

    return { snapshot: live, source: 'vivo' };
}

export type RefreshResult = {
    category: WorldRugbyCategory;
    ok: boolean;
    effectiveDate?: string;
    entries?: number;
    leader?: string;
    stored?: boolean;
    error?: string;
};

/**
 * Trae y guarda la foto de todas las categorias. Es lo que corre el cron de los
 * lunes. Una categoria que falla no se lleva puesta a la otra: el resultado dice
 * que paso con cada una.
 */
export async function refreshWorldRugbySnapshots(options: { dryRun?: boolean } = {}): Promise<RefreshResult[]> {
    const results: RefreshResult[] = [];

    for (const category of WORLD_RUGBY_CATEGORIES) {
        try {
            const snapshot = await fetchWorldRugbyRanking(category);
            const stored = options.dryRun ? false : await saveWorldRugbySnapshot(snapshot);

            if (!options.dryRun) {
                memoryCache.set(cacheKey(category, snapshot.effectiveDate), { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
                memoryCache.set(cacheKey(category), { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
            }

            results.push({
                category,
                ok: true,
                effectiveDate: snapshot.effectiveDate,
                entries: snapshot.entries.length,
                leader: snapshot.entries[0]?.nameEs,
                stored,
            });
        } catch (error) {
            results.push({
                category,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return results;
}

/** Solo para los tests: la cache de modulo sobrevive entre casos. */
export function clearWorldRugbySnapshotCache() {
    memoryCache.clear();
}
