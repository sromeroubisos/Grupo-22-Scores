/**
 * Planes de los overlays. Qué puede tocar cada uno:
 *
 *   básico   La estética de G22: colores, tipografías y logos de G22, algunos
 *            estilos, y la marca "G22 Scores" siempre a la vista.
 *   colores  Todos los estilos, colores de cada club, nombres y tipografías.
 *            La marca de G22 sigue a la vista.
 *   premium  Además, el logo del torneo en los marcadores, el overlay de
 *            sponsors, y la marca de G22 se puede sacar.
 *
 * El plan se aplica AL AIRE, con el plan del dueño del enlace: lo que diga la
 * URL que el plan no permite se ignora. Así una URL editada a mano no
 * destraba nada. Puro (sin Supabase ni Next).
 */

export const OVERLAY_PLANS = ['basico', 'colores', 'premium'] as const;
export type OverlayPlan = (typeof OVERLAY_PLANS)[number];

export const PLAN_LABELS: Record<OverlayPlan, string> = {
  basico: 'Básico',
  colores: 'Colores',
  premium: 'Premium',
};

export function readPlan(raw: unknown): OverlayPlan {
  return OVERLAY_PLANS.includes(raw as OverlayPlan) ? (raw as OverlayPlan) : 'basico';
}

/** El super admin tiene todo; el resto, lo que diga su fila (o básico si no tiene). */
export function planFor(role: string | null | undefined, stored: unknown): OverlayPlan {
  if (role === 'super_admin') return 'premium';
  return readPlan(stored);
}

export const planAtLeast = (plan: OverlayPlan, min: OverlayPlan) =>
  OVERLAY_PLANS.indexOf(plan) >= OVERLAY_PLANS.indexOf(min);

/** Los marcadores del plan básico: los de la casa. El resto pide el plan Colores. */
export const BASIC_STYLES: readonly string[] = [
  'tarjeta', 'marcador', 'barra', 'franja', 'compacto', 'bloques', 'escudos', 'tira',
];

export const canUseStyle = (plan: OverlayPlan, style: string) =>
  plan !== 'basico' || BASIC_STYLES.includes(style);

/** Dónde va la marca de G22: arriba o abajo a la derecha, o (solo premium) sin marca. */
export const BRAND_POSITIONS = ['arriba-der', 'abajo-der', 'no'] as const;
export type BrandPosition = (typeof BRAND_POSITIONS)[number];

export function readBrand(raw: unknown): BrandPosition {
  return BRAND_POSITIONS.includes(raw as BrandPosition) ? (raw as BrandPosition) : 'arriba-der';
}

/** Lo que el plan deja usar de la configuración de un overlay. */
export interface PlanRules {
  plan: OverlayPlan;
  /** Colores y nombres propios de cada club (si no, los de G22). */
  colors: boolean;
  /** Tipografías propias. */
  fonts: boolean;
  /** Logo del torneo en el marcador (si no, el de G22). */
  tournamentLogo: boolean;
  /** Overlay de sponsors. */
  sponsors: boolean;
  /** Sacar la marca de G22. */
  hideBrand: boolean;
}

export function planRules(plan: OverlayPlan): PlanRules {
  return {
    plan,
    colors: planAtLeast(plan, 'colores'),
    fonts: planAtLeast(plan, 'colores'),
    tournamentLogo: plan === 'premium',
    sponsors: plan === 'premium',
    hideBrand: plan === 'premium',
  };
}

/** La marca que sale al aire: la pedida, salvo "sin marca" sin el plan que lo permite. */
export function effectiveBrand(plan: OverlayPlan, asked: BrandPosition): BrandPosition {
  return asked === 'no' && !planRules(plan).hideBrand ? 'arriba-der' : asked;
}
