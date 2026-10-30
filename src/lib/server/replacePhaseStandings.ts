import type { createAdminClient } from '@/lib/supabase/admin';

/**
 * Reemplaza las filas de `tournament_standings` de UNA fase por las de una tabla
 * oficial (CRAA, SporTI) sin dejarla vacía si algo falla a mitad de camino.
 *
 * Antes era delete + insert sueltos: PostgREST no tiene transacciones entre dos
 * pedidos, así que un insert que fallaba (una columna nueva, un check, un corte
 * de red) dejaba la fase SIN tabla hasta la corrida siguiente — y la pantalla
 * pública mostraba "sin posiciones" en vez de la tabla de ayer.
 *
 * Sin crear una RPC (hay migraciones sin correr en la base viva), lo que se
 * puede hacer desde acá es:
 *   1. Validar TODAS las filas nuevas antes de tocar nada.
 *   2. Leer las filas actuales completas (backup en memoria).
 *   3. Borrar e insertar.
 *   4. Si el insert falla, reinsertar el backup tal cual estaba.
 *
 * Queda una ventana de milisegundos con la fase vacía entre 3 y 4; la RPC
 * transaccional (`replace_phase_standings(p_phase_id, p_rows jsonb)`: DELETE +
 * INSERT ... SELECT FROM jsonb_populate_recordset dentro de una sola función)
 * la cerraría del todo. Está anotada en el informe de seguridad.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type FilaDeTabla = {
    club_id: string;
    group_id: string | null;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    scored: number;
    conceded: number;
    [columna: string]: unknown;
};

const CAMPOS_NUMERICOS = ['position', 'played', 'won', 'drawn', 'lost', 'points', 'scored', 'conceded'] as const;

/** Devuelve el motivo por el que las filas no se pueden escribir, o null. */
export function validarFilasDeTabla(filas: FilaDeTabla[]): string | null {
    if (filas.length === 0) return 'la tabla oficial llegó vacía';
    const vistos = new Set<string>();
    for (const fila of filas) {
        if (!fila.club_id) return 'una fila sin club';
        for (const campo of CAMPOS_NUMERICOS) {
            const valor = fila[campo];
            if (typeof valor !== 'number' || !Number.isFinite(valor)) {
                return `${campo} inválido para ${fila.club_id}`;
            }
        }
        // Un club dos veces en el mismo grupo es una tabla mal leída.
        const clave = `${fila.group_id ?? ''}:${fila.club_id}`;
        if (vistos.has(clave)) return `club repetido en la tabla (${fila.club_id})`;
        vistos.add(clave);
    }
    return null;
}

export async function reemplazarTablaDeFase(
    supabase: Admin,
    faseId: string,
    filas: FilaDeTabla[],
): Promise<{ filas: number; error?: string }> {
    const invalida = validarFilasDeTabla(filas);
    if (invalida) return { filas: 0, error: `tabla oficial sin escribir: ${invalida}` };

    // El backup va con TODAS las columnas: si hay que restaurarlo, tiene que
    // volver idéntico (id, ajustes manuales en `stats`, lo que sea).
    const { data: previas, error: errLeer } = await supabase
        .from('tournament_standings')
        .select('*')
        .eq('phase_id', faseId);
    if (errLeer) return { filas: 0, error: `no se pudo leer la tabla actual (${errLeer.message})` };

    const { error: errBorrar } = await supabase.from('tournament_standings').delete().eq('phase_id', faseId);
    if (errBorrar) return { filas: 0, error: `no se pudo vaciar la tabla (${errBorrar.message})` };

    const { error: errAlta } = await supabase.from('tournament_standings').insert(filas);
    if (!errAlta) return { filas: filas.length };

    const respaldo = (previas ?? []) as Record<string, unknown>[];
    if (respaldo.length === 0) {
        return { filas: 0, error: `no se pudo escribir la tabla (${errAlta.message}); no había tabla previa` };
    }
    const { error: errRestaurar } = await supabase.from('tournament_standings').insert(respaldo);
    if (errRestaurar) {
        console.error('[standings] la fase quedó SIN tabla: falló el alta y la restauración', {
            faseId, alta: errAlta.message, restauracion: errRestaurar.message,
        });
        return {
            filas: 0,
            error: `no se pudo escribir la tabla (${errAlta.message}) NI restaurar la anterior (${errRestaurar.message}): la fase quedó vacía`,
        };
    }
    return { filas: 0, error: `no se pudo escribir la tabla (${errAlta.message}); se restauró la anterior` };
}
