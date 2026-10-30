// COPIA de la app G22 Gestión (mobile/src/sync) generada por scripts/vendor-g22.mjs. NO EDITAR A MANO.
/**
 * Reglas de fusión entre lo que cargó el celular y lo que hay en la base central.
 *
 * Este archivo es PURO (sin React, sin Expo, sin Supabase) a propósito: lo usan
 * el transporte real (`G22DirectTransport`, antes de escribir en G22) y el
 * servidor de demostración, así los dos deciden igual.
 *
 * La idea central: cada modificación viaja con los valores que el operador VIO
 * antes de editar (`base`). Con eso el servidor hace una fusión a tres vías
 * campo por campo, sin depender de relojes ni de `updated_at`:
 *
 *   base == central             → nadie más tocó ese campo: se aplica lo local.
 *   local == central            → los dos llegaron al mismo valor: converge.
 *   base != central != local    → CONFLICTO real. Se decide por regla o se
 *                                 guarda para que una persona elija. Nunca se
 *                                 pisa en silencio.
 */

export type FieldValue = unknown;
export type Row = Record<string, FieldValue>;

export type ConflictRule =
  /** El estado del partido que está más avanzado gana (terminado > en juego > programado). */
  | 'status_mas_avanzado'
  /** Los dos lados escribieron lo mismo. */
  | 'mismo_valor'
  /** Requiere que una persona elija. */
  | 'manual';

export interface FieldConflict {
  field: string;
  base: FieldValue;
  local: FieldValue;
  central: FieldValue;
}

export interface MergeResult {
  /** Campos que hay que escribir en la base central. */
  apply: Row;
  /** Campos resueltos automáticamente por una regla (quedan en el historial). */
  autoResolved: Array<FieldConflict & { rule: ConflictRule; winner: 'local' | 'central' }>;
  /** Campos que necesitan decisión humana. Si hay alguno, NO se escribe nada. */
  conflicts: FieldConflict[];
}

export interface MergeOptions {
  /** Orden de avance de un estado. Devuelve null si el estado no es parte de la progresión normal. */
  statusRank?: (status: unknown) => number | null;
  /** Nombre de la columna de estado (en G22: `status`). */
  statusField?: string;
}

/** Igualdad de valores de columna: tolera number vs string numérico y null vs undefined. */
export function sameValue(a: FieldValue, b: FieldValue): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }
  if (typeof a === 'object' || typeof b === 'object') {
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    // Mismo criterio que en el primer nivel, campo por campo: una clave ausente
    // equivale a null (Postgres y el celular no siempre serializan igual los nulos).
    const keys = new Set([...Object.keys(a as Row), ...Object.keys(b as Row)]);
    for (const key of keys) {
      if (!sameValue((a as Row)[key], (b as Row)[key])) return false;
    }
    return true;
  }
  return String(a) === String(b);
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Row).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Row)[k])}`).join(',')}}`;
}

/**
 * Fusión a tres vías de una actualización.
 *
 * @param local   campos que el celular quiere escribir (solo los que cambió)
 * @param base    valor de esos mismos campos cuando el operador empezó a editar
 * @param central fila actual en la base central
 */
export function mergeUpdate(local: Row, base: Row, central: Row, options: MergeOptions = {}): MergeResult {
  const statusField = options.statusField ?? 'status';
  const result: MergeResult = { apply: {}, autoResolved: [], conflicts: [] };

  for (const field of Object.keys(local).sort()) {
    const localValue = local[field];
    const baseValue = Object.prototype.hasOwnProperty.call(base, field) ? base[field] : undefined;
    const centralValue = central[field];

    if (sameValue(localValue, centralValue)) {
      // Converge: no hace falta escribir, pero si alguien más lo había cambiado
      // al mismo valor lo dejamos registrado.
      if (!sameValue(baseValue, centralValue)) {
        result.autoResolved.push({ field, base: baseValue, local: localValue, central: centralValue, rule: 'mismo_valor', winner: 'central' });
      }
      continue;
    }

    if (sameValue(baseValue, centralValue)) {
      // Nadie más tocó este campo desde que el operador lo vio.
      result.apply[field] = localValue;
      continue;
    }

    // Conflicto real: el campo cambió en los dos lados a valores distintos.
    const conflict: FieldConflict = { field, base: baseValue, local: localValue, central: centralValue };

    if (field === statusField && options.statusRank) {
      const localRank = options.statusRank(localValue);
      const centralRank = options.statusRank(centralValue);
      if (localRank != null && centralRank != null && localRank !== centralRank) {
        const winner = localRank > centralRank ? 'local' : 'central';
        if (winner === 'local') result.apply[field] = localValue;
        result.autoResolved.push({ ...conflict, rule: 'status_mas_avanzado', winner });
        continue;
      }
    }

    result.conflicts.push(conflict);
  }

  if (result.conflicts.length > 0) {
    // Una modificación se aplica entera o no se aplica: si un campo quedó en
    // conflicto, escribir los otros dejaría el partido a medias (por ejemplo el
    // estado "terminado" con un marcador que nadie confirmó).
    result.apply = {};
  }

  return result;
}

export type DeleteDecision =
  | { kind: 'apply' }
  | { kind: 'already_gone' }
  | { kind: 'conflict'; changedFields: FieldConflict[] };

/**
 * Un borrado solo se aplica si la fila central sigue como la vio el operador.
 * Si alguien la modificó mientras tanto, se guarda como conflicto: borrar un
 * partido que otro acaba de cerrar con resultado sería perder información.
 */
export function decideDelete(base: Row, central: Row | null): DeleteDecision {
  if (!central) return { kind: 'already_gone' };
  const changedFields: FieldConflict[] = [];
  for (const field of Object.keys(base).sort()) {
    if (!sameValue(base[field], central[field])) {
      changedFields.push({ field, base: base[field], local: undefined, central: central[field] });
    }
  }
  return changedFields.length ? { kind: 'conflict', changedFields } : { kind: 'apply' };
}

export type InsertDecision =
  | { kind: 'apply' }
  /** La fila ya existe con los mismos datos: fue un reintento. No se duplica. */
  | { kind: 'duplicate' }
  | { kind: 'conflict'; conflicts: FieldConflict[] };

/**
 * Las altas usan un id generado en el celular (UUID v4). Si ese id ya existe en
 * la base central es porque el alta ya llegó en un envío anterior: se trata
 * como duplicado si coincide, o como conflicto si alguien la editó después.
 */
export function decideInsert(local: Row, central: Row | null): InsertDecision {
  if (!central) return { kind: 'apply' };
  const conflicts: FieldConflict[] = [];
  for (const field of Object.keys(local).sort()) {
    if (!sameValue(local[field], central[field])) {
      conflicts.push({ field, base: undefined, local: local[field], central: central[field] });
    }
  }
  return conflicts.length ? { kind: 'conflict', conflicts } : { kind: 'duplicate' };
}
