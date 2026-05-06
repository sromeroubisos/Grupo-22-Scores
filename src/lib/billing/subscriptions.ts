import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import {
    PLANS,
    getPlan,
    isSubscriptionActive,
    planTierFromString,
    type PlanDefinition,
    type PlanLimits,
    type PlanTier,
    type SubscriptionStatus,
} from './plans';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface UserPlanContext {
    userId: string;
    plan: PlanDefinition;
    tier: PlanTier;
    status: SubscriptionStatus;
    isFounderPrice: boolean;
    currentPeriodEnd: string | null;
    subscriptionId: string | null;
    isUnlimited: boolean;
}

const FREE_CONTEXT_TEMPLATE: Omit<UserPlanContext, 'userId'> = {
    plan: PLANS.free,
    tier: 'free',
    status: 'inactive',
    isFounderPrice: false,
    currentPeriodEnd: null,
    subscriptionId: null,
    isUnlimited: false,
};

function asSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
    const allowed: SubscriptionStatus[] = [
        'inactive', 'pending', 'active', 'past_due', 'cancelled', 'expired',
    ];
    if (value && (allowed as string[]).includes(value)) {
        return value as SubscriptionStatus;
    }
    return 'inactive';
}

export async function getUserPlanContext(
    supabase: SupabaseServerClient,
    userId: string,
    userRole?: string | null
): Promise<UserPlanContext> {
    // Admins globales = sin límites efectivos (acceso total).
    if (isGlobalAdminRole(userRole)) {
        return {
            ...FREE_CONTEXT_TEMPLATE,
            userId,
            plan: PLANS.organizacion,
            tier: 'organizacion',
            status: 'active',
            isUnlimited: true,
        };
    }

    const { data, error } = await supabase
        .from('user_active_plan')
        .select('plan, status, current_period_end, is_founder_price, subscription_id')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) {
        return { ...FREE_CONTEXT_TEMPLATE, userId };
    }

    const tier = planTierFromString(data.plan);
    const status = asSubscriptionStatus(data.status);

    return {
        userId,
        plan: getPlan(tier),
        tier,
        status,
        isFounderPrice: Boolean(data.is_founder_price),
        currentPeriodEnd: data.current_period_end ?? null,
        subscriptionId: data.subscription_id ?? null,
        isUnlimited: false,
    };
}

export function planLimits(ctx: UserPlanContext): PlanLimits {
    return ctx.plan.limits;
}

// Permission helpers. Cada uno devuelve { allowed, reason? }.
export interface PlanCheck {
    allowed: boolean;
    reason?: string;
    requiredPlan?: PlanTier;
}

function denied(reason: string, requiredPlan: PlanTier): PlanCheck {
    return { allowed: false, reason, requiredPlan };
}

const ALLOW: PlanCheck = { allowed: true };

function planActive(ctx: UserPlanContext): boolean {
    return ctx.isUnlimited || isSubscriptionActive(ctx.status) || ctx.tier === 'free';
}

export function canCreateTournament(
    ctx: UserPlanContext,
    currentActiveTournaments: number
): PlanCheck {
    if (!planActive(ctx) && ctx.tier !== 'free') {
        return denied('Tu suscripción no está activa.', ctx.tier);
    }

    const limit = ctx.plan.limits.maxActiveTournaments;
    if (currentActiveTournaments >= limit) {
        const next: PlanTier = ctx.tier === 'free' ? 'inicial'
            : ctx.tier === 'inicial' ? 'pro'
            : 'organizacion';
        return denied(
            `Tu plan ${ctx.plan.name} permite hasta ${limit} torneos activos. Pasate a ${PLANS[next].name} para crear más.`,
            next
        );
    }

    return ALLOW;
}

export function canAddTeamToTournament(
    ctx: UserPlanContext,
    teamsAlreadyInTournament: number
): PlanCheck {
    const limit = ctx.plan.limits.maxTeamsPerTournament;
    if (teamsAlreadyInTournament >= limit) {
        const next: PlanTier = ctx.tier === 'free' ? 'inicial'
            : ctx.tier === 'inicial' ? 'pro'
            : 'organizacion';
        return denied(
            `Tu plan ${ctx.plan.name} permite hasta ${limit} equipos por torneo.`,
            next
        );
    }
    return ALLOW;
}

export function canAddCategory(
    ctx: UserPlanContext,
    currentCategories: number
): PlanCheck {
    const limit = ctx.plan.limits.maxCategories;
    if (currentCategories >= limit) {
        const next: PlanTier = ctx.tier === 'free' || ctx.tier === 'inicial' ? 'pro' : 'organizacion';
        return denied(
            `Tu plan ${ctx.plan.name} permite hasta ${limit} ${limit === 1 ? 'categoría' : 'categorías'}.`,
            next
        );
    }
    return ALLOW;
}

export function canEnableBranding(ctx: UserPlanContext): PlanCheck {
    if (!ctx.plan.limits.brandingEnabled) {
        return denied('El branding personalizado requiere Plan Pro o superior.', 'pro');
    }
    return ALLOW;
}

export function canExportData(ctx: UserPlanContext): PlanCheck {
    if (!ctx.plan.limits.exportEnabled) {
        return denied('La exportación a Excel/PDF requiere Plan Pro o superior.', 'pro');
    }
    return ALLOW;
}

export function canHaveMultipleAdmins(ctx: UserPlanContext): PlanCheck {
    if (!ctx.plan.limits.multipleAdmins) {
        return denied('Múltiples administradores requiere plan Organización.', 'organizacion');
    }
    return ALLOW;
}

export function canEnableWhiteLabel(ctx: UserPlanContext): PlanCheck {
    if (!ctx.plan.limits.whiteLabel) {
        return denied('White-label requiere plan Organización.', 'organizacion');
    }
    return ALLOW;
}
