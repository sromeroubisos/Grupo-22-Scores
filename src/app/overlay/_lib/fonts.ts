/**
 * Tipografías de los overlays: un catálogo de familias con sus pesos reales y
 * cuatro ROLES que se configuran por separado desde la URL:
 *
 *   resultado=dharma-e:900   el marcador de un partido solo
 *   numeros=articulat:900    estadísticas, horas, reloj, marcadores de listas
 *   titulos=dharma-c:800     nombre del torneo, equipos de la tarjeta, placas
 *   texto=outfit             nombres de equipo en listas, rótulos, pies
 *
 * Más UNA fuente propia, que cualquier rol puede usar con la familia `propia`:
 *
 *   fuente=google:Oswald                  de Google Fonts, por nombre
 *   fuente=url:https://…/mi-fuente.woff2  un archivo (woff2, woff, otf, ttf) con CORS abierto
 *   fuente=local:Mi Fuente Bold           instalada en la PC donde corre OBS/vMix
 *
 * Dharma Gothic C/E/M salen del kit de Typekit que ya carga el layout (todos los
 * pesos de 100 a 900). Articulat CF no está en el kit: sale de
 * public/fonts/articulat (solo oblicuas 500/600/900).
 */

export interface FontFamilyDef {
  id: string;
  label: string;
  /** Lista CSS de familias, con respaldo. */
  css: string;
  weights: number[];
  defaultWeight: number;
  /**
   * Cuánto se escala el cuerpo para que una familia ancha entre donde entra
   * una condensada. Dharma = 1.
   */
  size: number;
}

export const FONT_FAMILIES: FontFamilyDef[] = [
  { id: 'dharma-c', label: 'Dharma Gothic C (condensada)', css: "'dharma-gothic-c', 'Bebas Neue', sans-serif", weights: [100, 200, 300, 400, 700, 800, 900], defaultWeight: 800, size: 1 },
  { id: 'dharma-e', label: 'Dharma Gothic E (extendida)', css: "'dharma-gothic-e', 'Bebas Neue', sans-serif", weights: [100, 200, 300, 400, 700, 800, 900], defaultWeight: 900, size: 1 },
  { id: 'dharma-m', label: 'Dharma Gothic M (media)', css: "'dharma-gothic-m', 'Bebas Neue', sans-serif", weights: [100, 200, 300, 400, 700, 800, 900], defaultWeight: 800, size: 0.9 },
  { id: 'articulat', label: 'Articulat CF (oblicua)', css: "'G22 Articulat', 'Outfit', sans-serif", weights: [500, 600, 900], defaultWeight: 900, size: 0.74 },
  { id: 'bebas', label: 'Bebas Neue', css: "'Bebas Neue', 'Anton', sans-serif", weights: [400], defaultWeight: 400, size: 0.92 },
  { id: 'anton', label: 'Anton', css: "'Anton', 'Bebas Neue', sans-serif", weights: [400], defaultWeight: 400, size: 0.8 },
  { id: 'outfit', label: 'Outfit', css: "'Outfit', 'Inter', sans-serif", weights: [300, 400, 500, 600, 700, 800, 900], defaultWeight: 800, size: 0.7 },
  { id: 'inter', label: 'Inter', css: "'Inter', system-ui, sans-serif", weights: [300, 400, 500, 600, 700, 800, 900], defaultWeight: 800, size: 0.68 },
  { id: 'playfair', label: 'Playfair Display', css: "'Playfair Display', Georgia, serif", weights: [400, 500, 600, 700, 900], defaultWeight: 900, size: 0.72 },
  { id: 'propia', label: 'Fuente propia', css: "'G22 Propia', 'Outfit', sans-serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], defaultWeight: 700, size: 0.8 },
];

const BY_ID = new Map(FONT_FAMILIES.map((family) => [family.id, family]));

export function fontFamilyDef(id: string): FontFamilyDef | undefined {
  return BY_ID.get(id);
}

export type FontRole = 'score' | 'num' | 'head' | 'text';

export interface RoleFont {
  family: string;
  weight: number;
}

export type CustomFont =
  | { kind: 'google'; name: string }
  | { kind: 'url'; url: string }
  | { kind: 'local'; name: string };

export interface OverlayFonts {
  score: RoleFont;
  num: RoleFont;
  head: RoleFont;
  text: RoleFont;
  /** Factor extra para la fuente propia (`fuente_escala`): no sabemos qué ancho tiene. */
  customScale: number;
  custom: CustomFont | null;
}

export const ROLE_DEFAULTS: Record<FontRole, RoleFont> = {
  score: { family: 'dharma-e', weight: 900 },
  num: { family: 'articulat', weight: 900 },
  head: { family: 'dharma-c', weight: 800 },
  text: { family: 'outfit', weight: 700 },
};

/** `dharma-e:900`, `articulat`, `propia:700` → familia + el peso existente más cercano. */
export function parseRoleFont(raw: string, fallback: RoleFont): RoleFont {
  const [familyId, weightRaw] = raw.trim().toLowerCase().split(':');
  const family = BY_ID.get(familyId ?? '');
  if (!family) return fallback;
  const wanted = Number(weightRaw);
  if (!weightRaw || !Number.isFinite(wanted)) return { family: family.id, weight: family.defaultWeight };
  const weight = family.weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), family.weights[0]);
  return { family: family.id, weight };
}

export function roleFontParam(font: RoleFont): string {
  const family = BY_ID.get(font.family);
  return family && font.weight === family.defaultWeight ? font.family : `${font.family}:${font.weight}`;
}

/** Nombres de fuente: letras, números, espacios, guiones, puntos. Nada que pueda romper el CSS. */
function safeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{N} \-_.]{1,60}$/u.test(name) ? name : null;
}

export function parseCustomFont(raw: string): CustomFont | null {
  const value = raw.trim();
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator < 0) return null;
  const kind = value.slice(0, separator);
  const body = value.slice(separator + 1).trim();
  if (kind === 'google' || kind === 'local') {
    const name = safeName(body);
    return name ? { kind, name } : null;
  }
  if (kind === 'url') {
    try {
      const url = new URL(body);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      if (!/\.(woff2?|otf|ttf)$/i.test(url.pathname)) return null;
      // Va dentro de url('…'): ni comillas, ni paréntesis, ni espacios.
      if (/["'()\\\s]/.test(url.href)) return null;
      return { kind: 'url', url: url.href };
    } catch {
      return null;
    }
  }
  return null;
}

export function customFontParam(custom: CustomFont | null): string {
  if (!custom) return '';
  return custom.kind === 'url' ? `url:${custom.url}` : `${custom.kind}:${custom.name}`;
}

/** La lista CSS de familias de un rol, resolviendo la fuente propia. */
export function familyCss(font: RoleFont, custom: CustomFont | null): string {
  if (font.family === 'propia') {
    if (custom?.kind === 'google' || custom?.kind === 'local') return `'${custom.name}', 'G22 Propia', 'Outfit', sans-serif`;
    return "'G22 Propia', 'Outfit', sans-serif";
  }
  return BY_ID.get(font.family)?.css ?? "'Outfit', 'Inter', sans-serif";
}

function sizeOf(font: RoleFont, customScale: number): number {
  const base = BY_ID.get(font.family)?.size ?? 1;
  return font.family === 'propia' ? base * customScale : base;
}

/** Variables CSS que consumen las hojas de los overlays. */
export function fontVars(fonts: OverlayFonts): Record<string, string | number> {
  const { custom, customScale } = fonts;
  return {
    '--ov-score': familyCss(fonts.score, custom),
    '--ov-score-weight': fonts.score.weight,
    '--ov-score-size': sizeOf(fonts.score, customScale),
    '--ov-num': familyCss(fonts.num, custom),
    '--ov-num-weight': fonts.num.weight,
    '--ov-num-size': sizeOf(fonts.num, customScale),
    '--ov-head': familyCss(fonts.head, custom),
    '--ov-head-weight': fonts.head.weight,
    '--ov-head-size': sizeOf(fonts.head, customScale),
    '--ov-text': familyCss(fonts.text, custom),
    '--ov-text-weight': fonts.text.weight,
  };
}

/** Hojas de Google Fonts a pedir: una por peso usado, así un peso inexistente no tumba al resto. */
export function googleFontUrls(fonts: OverlayFonts): string[] {
  if (fonts.custom?.kind !== 'google') return [];
  const name = encodeURIComponent(fonts.custom.name).replace(/%20/g, '+');
  const weights = new Set(
    (['score', 'num', 'head', 'text'] as const)
      .map((role) => fonts[role])
      .filter((font) => font.family === 'propia')
      .map((font) => font.weight),
  );
  return [...weights].sort((a, b) => a - b).map((weight) =>
    `https://fonts.googleapis.com/css2?family=${name}:wght@${weight}&display=block`);
}

/** @font-face para una fuente propia por URL (o instalada en la PC, con su nombre). */
export function customFontFaceCss(fonts: OverlayFonts): string {
  const custom = fonts.custom;
  if (!custom) return '';
  if (custom.kind === 'url') {
    const format = /\.woff2$/i.test(custom.url) ? 'woff2' : /\.woff$/i.test(custom.url) ? 'woff' : /\.otf$/i.test(custom.url) ? 'opentype' : 'truetype';
    return `@font-face { font-family: 'G22 Propia'; src: url('${custom.url}') format('${format}'); font-weight: 100 900; font-display: block; }`;
  }
  if (custom.kind === 'local') {
    return `@font-face { font-family: 'G22 Propia'; src: local('${custom.name}'); font-weight: 100 900; }`;
  }
  return '';
}
