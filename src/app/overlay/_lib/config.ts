import { normalizeHex } from '@/lib/overlay/matchOverlayModel';
import { ROLE_DEFAULTS, customFontFaceCss, parseCustomFont, parseRoleFont, type OverlayFonts } from './fonts';

/**
 * Configuración de un overlay, toda por la URL: una productora lo ajusta sin
 * pedirnos nada y la URL que pega en OBS/vMix ES la configuración.
 */
export interface OverlayConfig {
  /**
   * Solo partido: `tarjeta` (G22), `marcador` (esquina), `barra` (zócalo),
   * `franja` (bloques de color de cada club), `compacto` (píldora chica) o
   * `bloques` (dos cuadrados grandes).
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
  homeName: string | null;
  awayName: string | null;
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
}


export const OVERLAY_STYLES = ['tarjeta', 'marcador', 'barra', 'franja', 'compacto', 'bloques', 'escudos', 'tira'] as const;
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
