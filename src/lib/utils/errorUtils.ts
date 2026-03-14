/**
 * Normalizes various error types into a consistent shape for logs and UI.
 */
export interface NormalizedError {
  message: string;
  details: string | null;
  code: string | null;
  hint: string | null;
  stack?: string;
  raw: any;
}

export function normalizeError(err: any): NormalizedError {
  // Ensure we have something
  if (!err) {
    return {
      message: 'Error nulo o indefinido',
      details: 'No se recibió ninguna información de error.',
      code: 'NULL_ERROR',
      hint: null,
      raw: err
    };
  }

  // 0. Already a NormalizedError — pass through to avoid double-wrapping and losing raw
  if (typeof err === 'object' && 'raw' in err && 'message' in err && 'code' in err && 'hint' in err) {
    return err as NormalizedError;
  }

  // 1. Supabase / PostgREST Error (often has message/code/details)
  const isSupabaseError = typeof err === 'object' && (err.message || err.code || err.details || err.hint);
  if (isSupabaseError) {
    const stdKeys = ['message', 'code', 'details', 'hint', 'stack'];
    const extraProps = Object.getOwnPropertyNames(err)
      .filter(k => !stdKeys.includes(k))
      .reduce((acc: Record<string, any>, k) => { acc[k] = (err as any)[k]; return acc; }, {});
    const extraSummary = Object.keys(extraProps).length > 0
      ? JSON.stringify(extraProps)
      : null;

    return {
      message: String(err.message || 'Error de base de datos'),
      details: err.details
        ? String(err.details)
        : (extraSummary || (err.message ? null : 'Código de error: ' + err.code)),
      code: err.code ? String(err.code) : null,
      hint: err.hint ? String(err.hint) : null,
      stack: err.stack ? String(err.stack) : undefined,
      raw: err,
    };
  }

  // 2. Standard Error Instance
  if (err instanceof Error) {
    return {
      message: err.message || 'Error de ejecución',
      details: null,
      code: (err as any).code || (err as any).status || null,
      hint: null,
      stack: err.stack,
      raw: err,
    };
  }

  // 3. Response-like Error (Fetch/Network)
  if (err && typeof err.status === 'number') {
    return {
      message: `Error de red (${err.status}): ${err.statusText || 'Sin descripción'}`,
      details: err.url ? `URL: ${err.url}` : null,
      code: `HTTP_${err.status}`,
      hint: 'Verifica la consola de red para más detalles',
      raw: err,
    };
  }

  // 4. String error
  if (typeof err === 'string') {
    return {
      message: err,
      details: null,
      code: null,
      hint: null,
      raw: err,
    };
  }

  // 5. Fallback for unknown shapes
  const serialized = serializeUnknownError(err);
  return {
    message: 'Error desconocido o mal formado',
    details: (serialized && serialized !== '{}') ? serialized : 'El error no contiene propiedades legibles.',
    code: 'MALFORMED_ERROR',
    hint: 'Consulta la consola para ver el objeto original (raw).',
    raw: err,
  };
}

/**
 * Serializes an unknown error object including non-enumerable properties like message and stack.
 */
export function serializeUnknownError(err: any): string {
  if (!err) return 'null';
  if (typeof err !== 'object') return String(err);
  
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch {
    return String(err);
  }
}
