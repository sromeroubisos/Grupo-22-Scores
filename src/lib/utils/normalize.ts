// ============================================================
// NORMALIZATION UTILITIES
// ============================================================
// Funciones para normalizar datos antes de comparar y guardar.
// Previene inconsistencias como:
//   - Espacios extra
//   - "" vs null
//   - URLs sin protocolo
//   - Slugs con mayúsculas o caracteres inválidos
// ============================================================

/**
 * Normaliza un string: trim() y convierte "" a null
 */
export function normalizeText(value: any): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Normaliza un número: convierte strings a número, "" a null
 */
export function normalizeNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * Normaliza una URL:
 * - trim()
 * - "" → null
 * - Si no empieza con http:// o https://, prefija https://
 * - Si empieza con www., prefija https://
 */
export function normalizeUrl(value: any): string | null {
  const s = normalizeText(value);
  if (!s) return null;

  // Ya tiene protocolo
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
    return s;
  }

  // Empieza con www.
  if (s.startsWith('www.')) {
    return `https://${s}`;
  }

  // Por defecto, asumimos que es un dominio y agregamos https://
  // (opción agresiva, ajustar según necesidad)
  return `https://${s}`;
}

/**
 * Normaliza un slug a kebab-case:
 * - Minúsculas
 * - Remueve acentos (NFD)
 * - Reemplaza espacios y caracteres no-alfanuméricos con -
 * - Remueve - al inicio/final
 *
 * Ejemplo: "Jockey Club Rosario" → "jockey-club-rosario"
 */
export function normalizeSlug(value: any): string {
  const s = String(value ?? '').trim().toLowerCase();

  return s
    // Normalizar caracteres Unicode (remover acentos)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Reemplazar cualquier secuencia de caracteres no-alfanuméricos con -
    .replace(/[^a-z0-9]+/g, '-')
    // Remover - al inicio/final
    .replace(/^-+|-+$/g, '');
}

/**
 * Normaliza un email (lowercase, trim)
 */
export function normalizeEmail(value: any): string | null {
  const s = normalizeText(value);
  return s ? s.toLowerCase() : null;
}

/**
 * Normaliza un handle de Instagram:
 * - Remueve @ si existe
 * - Remueve https://instagram.com/ si existe
 * - Devuelve solo el handle limpio (o null)
 *
 * Opciones:
 * - returnUrl=true → devuelve https://instagram.com/{handle}
 * - returnUrl=false (default) → devuelve solo {handle}
 */
export function normalizeInstagram(
  value: any,
  options: { returnUrl?: boolean } = {}
): string | null {
  const s = normalizeText(value);
  if (!s) return null;

  let handle = s;

  // Remover URL completa
  handle = handle.replace(/^https?:\/\/(www\.)?instagram\.com\//, '');
  // Remover @
  handle = handle.replace(/^@/, '');
  // Remover trailing slash
  handle = handle.replace(/\/$/, '');

  if (!handle) return null;

  return options.returnUrl ? `https://instagram.com/${handle}` : handle;
}

/**
 * Normaliza un handle de X (Twitter):
 * Similar a Instagram
 */
export function normalizeX(
  value: any,
  options: { returnUrl?: boolean } = {}
): string | null {
  const s = normalizeText(value);
  if (!s) return null;

  let handle = s;

  // Remover URL completa
  handle = handle.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, '');
  // Remover @
  handle = handle.replace(/^@/, '');
  // Remover trailing slash
  handle = handle.replace(/\/$/, '');

  if (!handle) return null;

  return options.returnUrl ? `https://x.com/${handle}` : handle;
}

/**
 * Normaliza un canal de YouTube:
 * Acepta URL completa o ID de canal/usuario
 */
export function normalizeYouTube(
  value: any,
  options: { returnUrl?: boolean } = {}
): string | null {
  const s = normalizeText(value);
  if (!s) return null;

  let identifier = s;

  // Extraer ID de URL si es completa
  const channelMatch = s.match(/youtube\.com\/(channel|c|user|@)\/([^/?]+)/);
  if (channelMatch) {
    identifier = channelMatch[2];
  } else {
    // Remover protocolo si existe
    identifier = identifier.replace(/^https?:\/\/(www\.)?youtube\.com\//, '');
    // Remover @
    identifier = identifier.replace(/^@/, '');
  }

  if (!identifier) return null;

  return options.returnUrl ? `https://youtube.com/@${identifier}` : identifier;
}

/**
 * Normaliza un handle de TikTok
 */
export function normalizeTikTok(
  value: any,
  options: { returnUrl?: boolean } = {}
): string | null {
  const s = normalizeText(value);
  if (!s) return null;

  let handle = s;

  // Remover URL completa
  handle = handle.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '');
  // Remover @
  handle = handle.replace(/^@/, '');
  // Remover trailing slash
  handle = handle.replace(/\/$/, '');

  if (!handle) return null;

  return options.returnUrl ? `https://tiktok.com/@${handle}` : handle;
}

// ============================================================
// COMPARISON HELPERS
// ============================================================

/**
 * Compara dos valores normalizados
 * Útil para dirty tracking
 */
export function isEqual(a: any, b: any): boolean {
  // Null/undefined son iguales entre sí
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true;
  }

  // Si uno es null y el otro no, son diferentes
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }

  // Comparación estricta
  return a === b;
}

/**
 * Compara dos arrays (orden no importa)
 */
export function arraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((val, idx) => val === sortedB[idx]);
}
