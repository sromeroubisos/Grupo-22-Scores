import { normalizeHex } from '@/lib/overlay/matchOverlayModel';
import { safeImageUrl } from '@/lib/overlay/manualOverlay';
import type { NameMode } from '@/lib/overlay/teamAcronym';
import {
  canUseStyle,
  effectiveBrand,
  planRules,
  readBrand,
  type BrandPosition,
  type OverlayPlan,
} from '@/lib/overlay/overlayPlan';
import { ROLE_DEFAULTS, customFontFaceCss, parseCustomFont, parseRoleFont, type OverlayFonts } from './fonts';

/**
 * Configuración de un overlay, toda por la URL: una productora lo ajusta sin
 * pedirnos nada y la URL que pega en OBS/vMix ES la configuración.
 */
export interface OverlayConfig {
  /**
   * Solo partido: `tarjeta` (G22), `marcador` (esquina), `barra` (zócalo),
   * `franja` (bloques de color de cada club), `compacto` (píldora chica) o
   * `bloques` (dos cuadrados grandes), `cuadro` (reloj a la izquierda y dos
   * filas de color), `paneles` (dos paneles de color con sigla y resultado) o
   * `presentacion` (zócalo de presentación a lo ancho, para la previa).
   */
  style: OverlayStyle;
  /** `normal` (34:12), `minutos` (34', 40+2') u `oculto`. */
  clockMode: 'normal' | 'minutos' | 'oculto';
  /** Amarillas, rojas y sin-bin en el marcador. */
  showCards: boolean;
  position: 'arriba-izq' | 'arriba-der' | 'abajo-izq' | 'abajo-der' | 'arriba' | 'abajo' | 'centro' | 'izq' | 'der';
  /** true si la URL trae `pos`: un default de otra pieza no la pisa. */
  positionSet: boolean;
  scale: number;
  margin: number;
  showClock: boolean;
  showPlates: boolean;
  showTournament: boolean;
  substitutions: boolean;
  homeColor: string | null;
  awayColor: string | null;
  /** La sigla que eligió el usuario (`local_nombre`, `visita_nombre`). */
  homeName: string | null;
  awayName: string | null;
  /** El nombre completo que eligió el usuario (`local_largo`, `visita_largo`). */
  homeFull: string | null;
  awayFull: string | null;
  /** `nombres=`: `siglas`, `completo` o automático (siglas en los chicos, nombre en los anchos). */
  nameMode: NameMode;
  background: string | null;
  demo: boolean;
  /** Ciclo aparecer/desaparecer: segundos visible y oculto. null = siempre visible. */
  showFor: number | null;
  hideFor: number | null;
  /** Listas: filas por página y segundos por página. */
  rows: number;
  rotate: number;
  /** Playoff: qué copa mostrar (índice desde 1); null = rotan todas. */
  cup: number | null;
  title: string | null;
  /** Playoff: `llave` (con líneas, si el cuadro es de eliminación) o `columnas`. */
  bracketView: 'llave' | 'columnas';
  /** Tipografía por rol (resultado, números, títulos, texto) y fuente propia. Ver `fonts.ts`. */
  fonts: OverlayFonts;
  /** Sponsors: `forma=` pisa la forma elegida en el panel (grilla, banda o esquina). */
  sponsorLayout: 'grilla' | 'banda' | 'esquina' | null;
  /** Segundos de la cuenta de la conversión que arranca sola con cada try (0 = apagada). */
  conversion: number;
  /**
   * Cómo se festeja un tanto: `marcador` (la franja barre el marcador) o
   * `cinta` (una banda a lo ancho de la pantalla, abajo, con TRY · TRY · TRY).
   */
  celebration: 'marcador' | 'cinta';
  /** `tries=1`: un contador de tries al lado de cada equipo, en todos los estilos. */
  showTries: boolean;
  /** `periodo=1`: el período (1T, 2T) junto al reloj. Por defecto no: solo el tiempo. */
  showPeriod: boolean;
  /** `marca=`: dónde va "G22 Scores" (arriba o abajo a la derecha) o `no` (solo premium). */
  brand: BrandPosition;
  /** `logo=`: el logo del torneo para el marcador (solo premium). */
  logo: string | null;
  /** El plan con el que sale al aire (lo pone `applyPlan`; sin aplicar, premium). */
  plan: OverlayPlan;
  /** Sin el plan de colores, los clubes salen con los colores de G22 aunque el partido tenga los suyos. */
  lockColors: boolean;
}


export const OVERLAY_STYLES = ['tarjeta', 'marcador', 'barra', 'franja', 'compacto', 'bloques', 'escudos', 'tira', 'cuadro', 'paneles', 'presentacion', 'pestana', 'medallon', 'capsula', 'flotante', 'linea', 'pisos', 'caja', 'sesgado', 'degrade',
  'central', 'rotulo', 'tablero', 'agua', 'claro', 'tablilla'] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];

export type SearchParams = Record<string, string | string[] | undefined>;

export function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function flag(value: string | string[] | undefined, fallback: boolean): boolean {
  const raw = first(value).toLowerCase();
  if (!raw) return fallback;
  return !['0', 'no', 'false', 'off'].includes(raw);
}

/** `Number('')` es 0: sin el parámetro tiene que valer el default, no cero. */
function numberParam(value: string | string[] | undefined): number | null {
  const raw = first(value).replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number | null, min: number, max: number, fallback: number): number {
  if (value === null) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Los nombres cortos de la primera versión (`dharma`) apuntan a la familia de hoy. */
function legacyFont(raw: string): string {
  return raw === 'dharma' ? 'dharma-c' : raw;
}

const POSITIONS: OverlayConfig['position'][] = [
  'arriba-izq', 'arriba-der', 'abajo-izq', 'abajo-der', 'arriba', 'abajo', 'centro', 'izq', 'der',
];

const BACKGROUNDS: Record<string, string> = { verde: '#00b140', negro: '#000000', magenta: '#ff00ff', azul: '#0047bb' };

export function parseOverlayConfig(
  params: SearchParams,
  defaults: { style?: OverlayStyle; rows?: number } = {},
): OverlayConfig {
  const rawStyle = first(params.estilo) as OverlayStyle;
  const style: OverlayStyle = OVERLAY_STYLES.includes(rawStyle) ? rawStyle : defaults.style ?? 'tarjeta';
  const rawClock = first(params.reloj).toLowerCase();
  const clockMode: OverlayConfig['clockMode'] = ['0', 'no', 'false', 'off', 'oculto'].includes(rawClock)
    ? 'oculto'
    : rawClock === 'minutos' ? 'minutos' : 'normal';
  const rawPos = first(params.pos) as OverlayConfig['position'];
  // Todo sale CENTRADO por defecto: el productor lo escala y lo ubica después
  // en su programa (OBS, vMix). `pos=` lo fija en un lugar si lo prefiere.
  const fallbackPos: OverlayConfig['position'] = 'centro';
  const showFor = numberParam(params.mostrar);
  const hideFor = numberParam(params.ocultar);
  const cup = numberParam(params.copa);

  return {
    style,
    position: POSITIONS.includes(rawPos) ? rawPos : fallbackPos,
    positionSet: POSITIONS.includes(rawPos),
    scale: clamp(numberParam(params.escala), 0.3, 3, 1),
    margin: Math.trunc(clamp(numberParam(params.margen), 0, 400, 48)),
    showClock: clockMode !== 'oculto',
    clockMode,
    showCards: flag(params.tarjetas, true),
    showPlates: flag(params.placas, true),
    showTournament: flag(params.encabezado, true),
    substitutions: flag(params.cambios, false),
    homeColor: normalizeHex(first(params.local)),
    awayColor: normalizeHex(first(params.visita)),
    homeName: first(params.local_nombre).slice(0, 24) || null,
    awayName: first(params.visita_nombre).slice(0, 24) || null,
    homeFull: first(params.local_largo).slice(0, 40) || null,
    awayFull: first(params.visita_largo).slice(0, 40) || null,
    nameMode: first(params.nombres) === 'siglas' ? 'siglas' : first(params.nombres) === 'completo' ? 'completo' : 'auto',
    background: BACKGROUNDS[first(params.fondo)] ?? null,
    demo: flag(params.prueba, false),
    // El ciclo solo arranca si están los dos: "mostrar 15, ocultar 45".
    showFor: showFor !== null && hideFor !== null && showFor > 0 ? clamp(showFor, 3, 3600, 15) : null,
    hideFor: showFor !== null && hideFor !== null && showFor > 0 ? clamp(hideFor, 1, 3600, 30) : null,
    rows: Math.trunc(clamp(numberParam(params.filas), 1, 12, defaults.rows ?? 6)),
    rotate: clamp(numberParam(params.rotar), 3, 120, 10),
    cup: cup !== null && cup >= 1 ? Math.trunc(cup) : null,
    title: first(params.titulo).slice(0, 80) || null,
    bracketView: first(params.vista) === 'columnas' ? 'columnas' : 'llave',
    conversion: Math.trunc(clamp(numberParam(params.conversion), 0, 600, 0)),
    celebration: first(params.festejo) === 'cinta' ? 'cinta' : 'marcador',
    showTries: flag(params.tries, false),
    showPeriod: flag(params.periodo, false),
    brand: readBrand(first(params.marca)),
    logo: safeImageUrl(first(params.logo)),
    plan: 'premium',
    lockColors: false,
    sponsorLayout: (['grilla', 'banda', 'esquina'] as const).find((value) => value === first(params.forma)) ?? null,
    fonts: {
      score: parseRoleFont(first(params.resultado), ROLE_DEFAULTS.score),
      // `numeros=articulat` (sin peso) sigue valiendo: toma el peso por defecto.
      num: parseRoleFont(legacyFont(first(params.numeros)), ROLE_DEFAULTS.num),
      head: parseRoleFont(legacyFont(first(params.titulos)), ROLE_DEFAULTS.head),
      text: parseRoleFont(first(params.texto), ROLE_DEFAULTS.text),
      custom: parseCustomFont(first(params.fuente)),
      customScale: clamp(numberParam(params.fuente_escala), 0.3, 2, 1),
    },
  };
}

/**
 * Lo que la URL pide, recortado a lo que permite el plan del dueño del enlace.
 * Lo que no permite se ignora en silencio (sale la versión de G22), así una
 * URL editada a mano no destraba nada.
 */
export function applyPlan(config: OverlayConfig, plan: OverlayPlan): OverlayConfig {
  const rules = planRules(plan);
  return {
    ...config,
    plan,
    style: canUseStyle(plan, config.style) ? config.style : 'marcador',
    homeColor: rules.colors ? config.homeColor : null,
    awayColor: rules.colors ? config.awayColor : null,
    // Las siglas se editan con cualquier plan: son datos, no personalización.
    homeName: config.homeName,
    awayName: config.awayName,
    lockColors: !rules.colors,
    fonts: rules.fonts ? config.fonts : { ...ROLE_DEFAULTS, custom: null, customScale: 1 },
    logo: rules.tournamentLogo ? config.logo : null,
    brand: effectiveBrand(plan, config.brand),
  };
}

/** El sitio pinta un degradé en html: alrededor de la tarjeta tiene que quedar transparente (o el chroma). */
export function overlayPageCss(background: string | null, fonts?: OverlayFonts): string {
  return `${fonts ? customFontFaceCss(fonts) : ''}
    html, html[data-theme], html.dark, html[data-theme="light"], body {
      background: ${background ?? 'transparent'} !important;
      background-image: none !important;
      overflow: hidden !important;
      min-height: 0 !important;
    }
    /* Producción todavía tiene html { zoom: 0.7 } desde 1024 px: en un navegador
       de 1920 de OBS/vMix el overlay saldría al 70% y corrido. Acá manda 1. */
    html, html[data-theme], html.dark, html[data-theme="light"] {
      zoom: 1 !important;
    }
  `;
}
