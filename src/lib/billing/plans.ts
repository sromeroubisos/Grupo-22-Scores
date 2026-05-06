export type PlanTier = 'free' | 'inicial' | 'pro' | 'organizacion';

export type SubscriptionStatus =
    | 'inactive'
    | 'pending'
    | 'active'
    | 'past_due'
    | 'cancelled'
    | 'expired';

export interface PlanLimits {
    maxActiveTournaments: number;
    maxTeamsPerTournament: number;
    maxCategories: number;
    brandingEnabled: boolean;
    publicPageEnabled: boolean;
    advancedFixture: boolean;
    statsDetailed: boolean;
    exportEnabled: boolean;
    multipleAdmins: boolean;
    whiteLabel: boolean;
    customDomain: boolean;
    supportLevel: 'none' | 'email' | 'priority' | 'dedicated';
}

export interface PlanDefinition {
    tier: PlanTier;
    name: string;
    tagline: string;
    listPriceUsd: number;
    founderPriceUsd: number | null;
    isContactSales: boolean;
    isRecommended: boolean;
    features: string[];
    limits: PlanLimits;
}

export const FOUNDER_PROMO_ENABLED = true;
export const FOUNDER_PROMO_MONTHS = 6;

export const PLANS: Record<PlanTier, PlanDefinition> = {
    free: {
        tier: 'free',
        name: 'Gratis',
        tagline: 'Probá la plataforma.',
        listPriceUsd: 0,
        founderPriceUsd: null,
        isContactSales: false,
        isRecommended: false,
        features: [
            '1 torneo activo',
            'Hasta 8 equipos',
            'Fixture base',
            'Tabla pública con marca de agua',
            'Sin soporte personalizado',
        ],
        limits: {
            maxActiveTournaments: 1,
            maxTeamsPerTournament: 8,
            maxCategories: 1,
            brandingEnabled: false,
            publicPageEnabled: true,
            advancedFixture: false,
            statsDetailed: false,
            exportEnabled: false,
            multipleAdmins: false,
            whiteLabel: false,
            customDomain: false,
            supportLevel: 'none',
        },
    },
    inicial: {
        tier: 'inicial',
        name: 'Plan Inicial',
        tagline: 'Para torneos pequeños.',
        listPriceUsd: 15,
        founderPriceUsd: 9,
        isContactSales: false,
        isRecommended: false,
        features: [
            '1 torneo activo',
            'Hasta 16 equipos',
            '1 categoría',
            'Sin marca de agua',
            'Tabla, fixture y resultados',
            'Soporte por email',
        ],
        limits: {
            maxActiveTournaments: 1,
            maxTeamsPerTournament: 16,
            maxCategories: 1,
            brandingEnabled: false,
            publicPageEnabled: true,
            advancedFixture: false,
            statsDetailed: false,
            exportEnabled: false,
            multipleAdmins: false,
            whiteLabel: false,
            customDomain: false,
            supportLevel: 'email',
        },
    },
    pro: {
        tier: 'pro',
        name: 'Plan Pro',
        tagline: 'Para ligas con varias categorías.',
        listPriceUsd: 39,
        founderPriceUsd: 29,
        isContactSales: false,
        isRecommended: true,
        features: [
            'Hasta 5 torneos activos',
            'Hasta 8 categorías',
            'Hasta 80 equipos',
            'Fixture avanzado',
            'Estadísticas detalladas',
            'Exportación Excel/PDF',
            'Branding básico',
            'Soporte prioritario',
        ],
        limits: {
            maxActiveTournaments: 5,
            maxTeamsPerTournament: 80,
            maxCategories: 8,
            brandingEnabled: true,
            publicPageEnabled: true,
            advancedFixture: true,
            statsDetailed: true,
            exportEnabled: true,
            multipleAdmins: false,
            whiteLabel: false,
            customDomain: false,
            supportLevel: 'priority',
        },
    },
    organizacion: {
        tier: 'organizacion',
        name: 'Organización',
        tagline: 'Para clubes y ligas grandes.',
        listPriceUsd: 149,
        founderPriceUsd: null,
        isContactSales: true,
        isRecommended: false,
        features: [
            'Múltiples torneos y categorías',
            'Varios administradores',
            'Onboarding asistido',
            'Soporte prioritario dedicado',
            'White-label opcional',
            'Dominio propio opcional',
            'Reportes de impacto',
        ],
        limits: {
            maxActiveTournaments: Number.MAX_SAFE_INTEGER,
            maxTeamsPerTournament: Number.MAX_SAFE_INTEGER,
            maxCategories: Number.MAX_SAFE_INTEGER,
            brandingEnabled: true,
            publicPageEnabled: true,
            advancedFixture: true,
            statsDetailed: true,
            exportEnabled: true,
            multipleAdmins: true,
            whiteLabel: true,
            customDomain: true,
            supportLevel: 'dedicated',
        },
    },
};

export const ALL_PLAN_TIERS: PlanTier[] = ['free', 'inicial', 'pro', 'organizacion'];
export const PURCHASABLE_PLAN_TIERS: PlanTier[] = ['inicial', 'pro'];

export function getPlan(tier: PlanTier): PlanDefinition {
    return PLANS[tier];
}

export function isPaidPlan(tier: PlanTier): boolean {
    return tier !== 'free';
}

export function isPurchasablePlan(tier: PlanTier): tier is 'inicial' | 'pro' {
    return PURCHASABLE_PLAN_TIERS.includes(tier);
}

export function getEffectivePriceUsd(tier: PlanTier): number {
    const plan = PLANS[tier];
    if (FOUNDER_PROMO_ENABLED && plan.founderPriceUsd != null) {
        return plan.founderPriceUsd;
    }
    return plan.listPriceUsd;
}

const ACTIVE_STATUSES = new Set<SubscriptionStatus>(['active']);

export function isSubscriptionActive(status: SubscriptionStatus | null | undefined): boolean {
    return Boolean(status && ACTIVE_STATUSES.has(status));
}

export function planTierFromString(value: string | null | undefined): PlanTier {
    if (value && (ALL_PLAN_TIERS as string[]).includes(value)) {
        return value as PlanTier;
    }
    return 'free';
}
