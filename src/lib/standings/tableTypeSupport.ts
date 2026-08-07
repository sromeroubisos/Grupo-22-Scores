import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { DEFAULT_TABLE_TYPE, type TableType } from './tableType';

/**
 * ¿`tournament_standings` ya tiene la columna `table_type`?
 *
 * Existe para que el código pueda salir a producción ANTES de que se corra la
 * migración, sin que nada se rompa en el medio y sin necesitar un redeploy
 * después. Es la forma de `checkMatchColumnSupport` (fixtureService.ts) pero con
 * la asimetría del caché INVERTIDA a propósito:
 *
 *   · `true` se cachea para siempre — una columna no desaparece.
 *   · `false` caduca a los 30 segundos — así la app se entera sola de que
 *     corriste el SQL. El original cachea el `false` como definitivo y sin TTL,
 *     que es exactamente lo contrario de lo que se necesita acá: correrías la
 *     migración y la app seguiría creyendo que la columna no existe hasta el
 *     próximo deploy.
 *   · Un error que NO es de columna faltante (red, permisos, timeout) no cambia
 *     el estado. Un timeout no es evidencia sobre el esquema.
 *
 * La regla de degradación es siempre hacia el comportamiento de hoy, nunca hacia
 * un error: sin columna, los lectores no filtran — que es lo que hacen ahora—, y
 * el endpoint de recálculo devuelve 409 para todo lo que no sea `general`. O
 * sea: sin columna es IMPOSIBLE que existan filas `home`/`away`, así que "no
 * filtrar" no es una aproximación, es correcto por construcción.
 */

const TABLE = 'tournament_standings';
const COLUMN = 'table_type';

/** Cuánto vale un "todavía no está" antes de volver a preguntar. */
const ABSENT_TTL_MS = 30_000;

type SupportCache = { value: boolean; at: number };

let cache: SupportCache | null = null;
let inFlight: Promise<boolean> | null = null;

/** Para los tests y para el arranque en caliente del dev server. */
export function resetStandingsTableTypeSupportCache() {
    cache = null;
    inFlight = null;
}

export async function supportsStandingsTableTypeColumn(): Promise<boolean> {
    if (cache) {
        if (cache.value) return true;
        if (Date.now() - cache.at < ABSENT_TTL_MS) return false;
    }

    // Sondeo compartido: el resultado es de esquema, invariante al scope del
    // cliente, así que varias llamadas concurrentes pueden usar el mismo.
    if (inFlight) return inFlight;

    const probe = (async (): Promise<boolean> => {
        try {
            /**
             * SIEMPRE con el cliente admin, nunca con el del que llama.
             *
             * La pregunta es de ESQUEMA —¿existe la columna?—, no de permisos, y
             * el cliente admin es el único que la contesta sin ruido. Cuando el
             * sondeo usaba el cliente de cada llamador, un error que no fuera de
             * columna faltante (RLS, timeout de red) devolvía `false`, y con la
             * migración ya aplicada eso significa que los lectores dejan de
             * filtrar: cada club aparecería tres veces en la página pública.
             *
             * Es decir: la degradación dejó de apuntar al comportamiento de hoy
             * en el momento en que existen filas de local y visitante.
             */
            const supabase = createAdminClient() as unknown as LooseSupabaseClient;
            const { error } = await supabase.from(TABLE).select(COLUMN).limit(0);

            if (!error) {
                cache = { value: true, at: Date.now() };
                return true;
            }

            if (isMissingColumnError(error, COLUMN)) {
                cache = { value: false, at: Date.now() };
                return false;
            }

            console.error(
                `[standings] Error inesperado sondeando ${TABLE}.${COLUMN} (no cambia el estado)`,
                error,
            );
            return cache?.value ?? false;
        } catch (e) {
            console.error(`[standings] Excepción sondeando ${TABLE}.${COLUMN}`, e);
            return cache?.value ?? false;
        } finally {
            inFlight = null;
        }
    })();

    inFlight = probe;
    return probe;
}

/**
 * Acota una consulta a `tournament_standings` a una sola perspectiva.
 *
 * Es el único lugar donde se decide si filtrar o no, y por eso lo usan los once
 * lectores en vez de escribir el `.eq('table_type', …)` a mano: sin la columna,
 * devuelve la consulta intacta —el comportamiento de hoy— y con la columna la
 * acota. Sin este filtro, publicar local y visitante triplicaría las filas por
 * equipo en la página pública, en el sembrado de playoff y en el arrastre de
 * puntos entre fases.
 *
 * Recibe el booleano en vez de resolverlo adentro, y es SÍNCRONA a propósito:
 * los query builders de PostgREST son thenables, así que una versión `async`
 * devolvía `Promise<Builder>` y el `await` del que llama lo desenvolvía DOS
 * veces —una el promise, otra el builder— y le entregaba la respuesta ya
 * ejecutada donde esperaba una consulta a la que seguir encadenando filtros.
 * Funcionaba de casualidad en la mitad de los casos.
 */
export function applyStandingsTableType<Q>(
    query: Q,
    supported: boolean,
    tableType: TableType | string = DEFAULT_TABLE_TYPE,
): Q {
    if (!supported) return query;
    return (query as { eq: (column: string, value: string) => Q }).eq('table_type', tableType);
}
