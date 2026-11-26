/**
 * Overlay de sponsors (manual): los logos en cuatro niveles —Title, Main,
 * Sponsor y Acompañante— que el productor sube como PNG desde su panel.
 *
 * Lo que decide el TAMAÑO de cada logo vive acá, puro y probado:
 *
 *  - Cada nivel tiene un alto de referencia: el Title es el más grande, el
 *    Acompañante el más chico.
 *  - Los logos se igualan por ÁREA, no por alto: un logotipo apaisado y un
 *    escudo cuadrado del mismo nivel pesan lo mismo a la vista (si se igualara
 *    el alto, el apaisado se comería la fila).
 *  - Si un nivel tiene muchos logos y no entran en las filas que le tocan, se
 *    achican todos parejo hasta entrar (con un piso, para que sigan leyéndose).
 *
 * Las medidas son px del lienzo de 1920×1080 que ve OBS; el overlay las dibuja
 * tal cual y la escala general (`escala=`) las agranda o achica después.
 */

export type SponsorTier = 'title' | 'main' | 'sponsor' | 'acompanante';
export type SponsorLayout = 'grilla' | 'banda' | 'esquina';

export const SPONSOR_TIERS: Array<{ id: SponsorTier; label: string; plural: string }> = [
  { id: 'title', label: 'Title sponsor', plural: 'Title sponsor' },
  { id: 'main', label: 'Main sponsor', plural: 'Main sponsors' },
  { id: 'sponsor', label: 'Sponsor', plural: 'Sponsors' },
  { id: 'acompanante', label: 'Acompañante', plural: 'Acompañan' },
];

export interface SponsorLogo {
  id: string;
  url: string;
  name: string;
  /** Ancho / alto del logo ya recortado (sin márgenes transparentes). */
  ratio: number;
}

export interface ManualSponsorsState {
  visible: boolean;
  /**
   * `grilla`: todos los niveles juntos, en una tarjeta (entretiempo, previa).
   * `banda`: una franja abajo que pasa de a un nivel por vez.
   * `esquina`: un logo por vez en una esquina, rotando.
   */
  layout: SponsorLayout;
  /** El rótulo de cada nivel ("Main sponsors", "Acompañan") sobre sus logos. */
  showLabels: boolean;
  /** Título de la grilla (vacío = sin título). */
  heading: string;
  /** Segundos por página (banda) o por logo (esquina). */
  rotate: number;
  /** Fondo de la placa: oscuro (G22) o claro (logos que no se leen sobre negro). */
  surface: 'oscuro' | 'claro';
  tiers: Record<SponsorTier, SponsorLogo[]>;
}

/** Tope de logos en total: el estado se guarda en una fila de hasta 16 KB. */
export const MAX_SPONSOR_LOGOS = 48;

export function emptyTiers(): Record<SponsorTier, SponsorLogo[]> {
  return { title: [], main: [], sponsor: [], acompanante: [] };
}

export function defaultSponsorsState(): ManualSponsorsState {
  return {
    visible: true,
    layout: 'grilla',
    showLabels: true,
    heading: '',
    rotate: 8,
    surface: 'oscuro',
    tiers: emptyTiers(),
  };
}

/* ─── saneo de lo que manda el panel ─── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
}

/** Solo logos por https (Storage) o rutas del propio sitio. */
function logoUrl(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function readLogos(raw: unknown): SponsorLogo[] {
  if (!Array.isArray(raw)) return [];
  const out: SponsorLogo[] = [];
  for (const [index, item] of raw.entries()) {
    const source = rec(item);
    const url = logoUrl(source.url);
    if (!url) continue;
    const ratio = Number(source.ratio);
    out.push({
      id: text(source.id, 40) || `l${index + 1}`,
      url,
      name: text(source.name, 60),
      // Un logo sin medida se trata como apaisado típico.
      ratio: Number.isFinite(ratio) && ratio > 0 ? Math.min(12, Math.max(0.15, ratio)) : 2,
    });
  }
  return out;
}

function readTiers(raw: unknown, fallback: Record<SponsorTier, SponsorLogo[]>): Record<SponsorTier, SponsorLogo[]> {
  if (raw === undefined) return fallback;
  const source = rec(raw);
  const tiers = emptyTiers();
  let total = 0;
  for (const tier of SPONSOR_TIERS) {
    const logos = source[tier.id] === undefined ? fallback[tier.id] : readLogos(source[tier.id]);
    for (const logo of logos) {
      if (total >= MAX_SPONSOR_LOGOS) break;
      tiers[tier.id].push(logo);
      total += 1;
    }
  }
  return tiers;
}

export function mergeSponsorsState(current: unknown, patch: unknown): ManualSponsorsState {
  const saved = rec(current);
  const incoming = rec(patch);
  const defaults = defaultSponsorsState();
  const layout = incoming.layout ?? saved.layout;
  const surface = incoming.surface ?? saved.surface;
  const rotate = Number(incoming.rotate ?? saved.rotate);
  function pick<T>(key: string, read: (value: unknown) => T, fallback: T): T {
    if (incoming[key] !== undefined) return read(incoming[key]);
    if (saved[key] !== undefined) return read(saved[key]);
    return fallback;
  }
  return {
    visible: pick('visible', Boolean, defaults.visible),
    layout: layout === 'banda' || layout === 'esquina' ? layout : 'grilla',
    showLabels: pick('showLabels', Boolean, defaults.showLabels),
    heading: pick('heading', (value) => text(value, 60), defaults.heading),
    rotate: Number.isFinite(rotate) ? Math.min(120, Math.max(2, Math.trunc(rotate))) : defaults.rotate,
    surface: surface === 'claro' ? 'claro' : 'oscuro',
    tiers: readTiers(incoming.tiers, readTiers(saved.tiers, emptyTiers())),
  };
}

/* ─── tamaños ─── */

export interface LogoBox {
  width: number;
  height: number;
}

/**
 * Alto de referencia de cada nivel (px del lienzo de 1920) y cuántas filas
 * puede ocupar en la grilla antes de achicarse.
 */
export const TIER_SIZE: Record<SponsorLayout, Record<SponsorTier, { height: number; rows: number }>> = {
  grilla: {
    title: { height: 170, rows: 1 },
    main: { height: 112, rows: 2 },
    sponsor: { height: 78, rows: 2 },
    acompanante: { height: 54, rows: 3 },
  },
  banda: {
    title: { height: 118, rows: 1 },
    main: { height: 96, rows: 1 },
    sponsor: { height: 78, rows: 1 },
    acompanante: { height: 62, rows: 1 },
  },
  esquina: {
    title: { height: 150, rows: 1 },
    main: { height: 124, rows: 1 },
    sponsor: { height: 104, rows: 1 },
    acompanante: { height: 88, rows: 1 },
  },
};

/** Ancho útil para los logos en cada forma (px del lienzo). */
export const LAYOUT_WIDTH: Record<SponsorLayout, number> = { grilla: 1480, banda: 1480, esquina: 360 };

/** Separación entre logos, proporcional al alto del nivel. */
export const gapFor = (height: number) => Math.round(height * 0.42);

/**
 * La caja de un logo de proporción `ratio` (ancho/alto) en un nivel de alto
 * `height`: misma ÁREA que un logo de referencia (1,8:1), con topes para que un
 * logo muy alto no se pase del renglón ni uno muy largo se coma la fila.
 */
export function logoBox(ratio: number, height: number): LogoBox {
  const area = height * height * 1.8;
  let h = Math.sqrt(area / ratio);
  let w = h * ratio;
  // 1,45: un escudo cuadrado llega a la misma área (√1,8 ≈ 1,34); solo los
  // logos verticales de verdad se topan.
  if (h > height * 1.45) {
    h = height * 1.45;
    w = h * ratio;
  }
  if (w > height * 3.6) {
    w = height * 3.6;
    h = w / ratio;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

/** Piso del achique: más chico que esto, el logo deja de leerse al aire. */
const MIN_FIT = 0.45;

/**
 * Las cajas de todos los logos de un nivel. Si a su alto de referencia no
 * entran en las filas que el nivel tiene, se achican PAREJO (todos por el mismo
 * factor) hasta entrar.
 */
export function tierBoxes(logos: SponsorLogo[], tier: SponsorTier, layout: SponsorLayout, width = LAYOUT_WIDTH[layout]): {
  boxes: LogoBox[];
  scale: number;
  gap: number;
} {
  const { height, rows } = TIER_SIZE[layout][tier];
  const base = logos.map((logo) => logoBox(logo.ratio, height));
  const gap = gapFor(height);
  const needed = base.reduce((sum, box) => sum + box.width, 0) + gap * Math.max(0, logos.length - 1);
  // Margen por los cortes de renglón: una fila nunca se llena al 100 %.
  const room = width * rows * (rows > 1 ? 0.9 : 1);
  const scale = needed > room ? Math.max(MIN_FIT, room / needed) : 1;
  return {
    boxes: base.map((box) => ({ width: Math.round(box.width * scale), height: Math.round(box.height * scale) })),
    scale,
    gap: Math.round(gap * scale),
  };
}

/* ─── qué se ve en cada momento ─── */

export interface SponsorPage {
  tier: SponsorTier;
  logos: SponsorLogo[];
}

/**
 * La banda pasa de a un nivel por vez. Un nivel con más logos de los que
 * entran en un renglón (sin bajar del piso de achique) se parte en varias
 * páginas seguidas.
 */
export function bandPages(state: ManualSponsorsState): SponsorPage[] {
  const pages: SponsorPage[] = [];
  for (const tier of SPONSOR_TIERS) {
    const logos = state.tiers[tier.id];
    if (!logos.length) continue;
    const { height } = TIER_SIZE.banda[tier.id];
    const gap = gapFor(height);
    let chunk: SponsorLogo[] = [];
    let used = 0;
    for (const logo of logos) {
      const width = logoBox(logo.ratio, height).width * 0.8;
      const extra = chunk.length ? gap + width : width;
      if (chunk.length && used + extra > LAYOUT_WIDTH.banda) {
        pages.push({ tier: tier.id, logos: chunk });
        chunk = [];
        used = 0;
      }
      used += chunk.length ? gap + width : width;
      chunk.push(logo);
    }
    if (chunk.length) pages.push({ tier: tier.id, logos: chunk });
  }
  return pages;
}

/**
 * La esquina pasa de a un logo. Los de más jerarquía se quedan más tiempo:
 * el Title tres turnos, el Main dos, el resto uno.
 */
export function cornerSequence(state: ManualSponsorsState): Array<{ tier: SponsorTier; logo: SponsorLogo }> {
  const weight: Record<SponsorTier, number> = { title: 3, main: 2, sponsor: 1, acompanante: 1 };
  const out: Array<{ tier: SponsorTier; logo: SponsorLogo }> = [];
  for (const tier of SPONSOR_TIERS) {
    for (const logo of state.tiers[tier.id]) {
      for (let turn = 0; turn < weight[tier.id]; turn += 1) out.push({ tier: tier.id, logo });
    }
  }
  return out;
}

/** Qué página (o logo) toca ahora: con la hora del servidor, dos OBS muestran lo mismo. */
export function rotationIndex(length: number, rotateSeconds: number, nowMs: number): number {
  if (length <= 1) return 0;
  return Math.floor(nowMs / 1000 / Math.max(1, rotateSeconds)) % length;
}

export function totalLogos(state: ManualSponsorsState): number {
  return SPONSOR_TIERS.reduce((sum, tier) => sum + state.tiers[tier.id].length, 0);
}
