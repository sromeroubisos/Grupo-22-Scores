/**
 * La sigla de 3 letras de un club para los marcadores ("MAR", "NEU", "CAS").
 *
 * Si el club ya trae una sigla corta (hasta 4 letras: "SIC", "CASI") se usa
 * esa. Si no, sale del nombre: se sacan las palabras que no identifican al
 * club (Club, Rugby, R.C., Social, la categoría, lo que va entre comillas) y
 * se toman las 3 primeras letras de la primera palabra que queda, sin tildes.
 * El usuario la puede cambiar desde el generador o el panel.
 *
 * Puro (sin React ni Supabase).
 */

const NOISE = new Set([
  'club', 'clubes', 'rugby', 'rc', 'rfc', 'hc', 'fc', 'cr', 'social', 'sociedad', 'asociacion', 'deportivo',
  'deportiva', 'atletico', 'athletic', 'sporting', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'and', 'the',
  'intermedia', 'preintermedia', 'pre', 'primera', 'superior', 'femenino', 'masculino', 'juveniles',
]);

/** Categorías y divisiones: M15, M17, "A", B, Intermedia… */
const CATEGORY = /^(m\d{1,2}|u\d{1,2}|[a-d])$/i;

const strip = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Cómo se escribe un club en el marcador, según elija el usuario:
 *   `auto`      siglas en los estilos chicos y nombre completo en los anchos
 *               (si el usuario escribió una sigla, esa también en los anchos);
 *   `siglas`    la sigla en todos;
 *   `completo`  el nombre completo en todos.
 * `short` es lo que usan los estilos chicos y `wide` lo que usan los anchos.
 */
export type NameMode = 'auto' | 'siglas' | 'completo';

export function teamLabels(
  mode: NameMode,
  customShort: string | null | undefined,
  fullName: string,
  givenShort?: string | null,
): { short: string; wide: string } {
  const sigla = (customShort || teamAcronym(fullName, givenShort)).toUpperCase();
  const full = fullName.toUpperCase();
  if (mode === 'siglas') return { short: sigla, wide: sigla };
  if (mode === 'completo') return { short: full, wide: full };
  return { short: sigla, wide: customShort ? sigla : full };
}

export function teamAcronym(name: string | null | undefined, short?: string | null): string {
  const given = strip(short ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (given.length >= 2 && given.length <= 4) return given.toUpperCase();

  const source = strip(name || short || '')
    .replace(/["“”'‘’][^"“”'‘’]*["“”'‘’]/g, ' ') // lo que va entre comillas ("B")
    .replace(/\(.*?\)/g, ' ');
  // "R.C." → "RC", "C.A.S.I." → "CASI" antes de partir en palabras.
  const words = source
    .split(/[\s\-–—/]+/)
    .map((word) => word.replace(/\./g, '').replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  const meaningful = words.filter((word) => !NOISE.has(word.toLowerCase()) && !CATEGORY.test(word));
  const pick = meaningful[0] ?? words[0] ?? '';
  if (!pick) return '';
  // Una palabra corta ("Pay Ubre" → "PAY") alcanza; si es de 1 o 2 letras, se suman iniciales.
  if (pick.length >= 3) return pick.slice(0, 3).toUpperCase();
  const initials = meaningful.map((word) => word[0]).join('');
  return (initials.length >= 3 ? initials : (pick + (meaningful[1] ?? '')).slice(0, 3)).toUpperCase();
}
