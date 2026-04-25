/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from '@/lib/supabase/admin';
import type { ClubGymPlan, ClubGymPlanInput } from './gymPlans';
import type { PlanBlock, PlanBlockType } from './trainings';

type ClubGymPlanRow = {
    id: string;
    club_id: string;
    division_id: string | null;
    title: string | null;
    objective: string | null;
    notes: string | null;
    duration_minutes: number | null;
    plan_blocks: unknown;
    created_at: string | null;
    updated_at: string | null;
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);
const PLAN_BLOCK_TYPES = new Set<PlanBlockType>(['warmup', 'tecnico', 'tactico', 'fisico', 'cierre']);
const SELECT_COLUMNS = [
    'id',
    'club_id',
    'division_id',
    'title',
    'objective',
    'notes',
    'duration_minutes',
    'plan_blocks',
    'created_at',
    'updated_at',
].join(', ');

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

export function isMissingClubGymPlansTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function normalizeText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNullableText(value: unknown) {
    const normalized = normalizeText(value);
    return normalized.length > 0 ? normalized : null;
}

function normalizeInteger(
    value: unknown,
    fallback: number,
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizePlanBlocks(value: unknown): PlanBlock[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return [];
        }

        const row = entry as Record<string, unknown>;
        const type = normalizeText(row.type);
        if (!PLAN_BLOCK_TYPES.has(type as PlanBlockType)) {
            return [];
        }

        return [{
            id: normalizeText(row.id, `block-${index + 1}`),
            type: type as PlanBlockType,
            title: normalizeText(row.title, 'Bloque'),
            duration: normalizeInteger(row.duration, 15, 1, 240),
            notes: normalizeText(row.notes),
            intensity: normalizeNullableText(row.intensity) ?? undefined,
        }];
    });
}

function mapRowToGymPlan(row: ClubGymPlanRow): ClubGymPlan {
    const blocks = normalizePlanBlocks(row.plan_blocks);
    const fallbackDuration = blocks.reduce((sum, block) => sum + block.duration, 0);

    return {
        id: row.id,
        clubId: row.club_id,
        divisionId: normalizeNullableText(row.division_id),
        title: normalizeText(row.title, 'Plan de gimnasio'),
        objective: normalizeNullableText(row.objective),
        notes: normalizeNullableText(row.notes),
        durationMinutes: normalizeInteger(row.duration_minutes, fallbackDuration, 0, 600),
        blocks,
        createdAt: normalizeText(row.created_at),
        updatedAt: normalizeText(row.updated_at),
    };
}

function mapGymPlanToRow(clubId: string, plan: ClubGymPlanInput) {
    const blocks = normalizePlanBlocks(plan.blocks);
    const durationMinutes = normalizeInteger(
        plan.durationMinutes,
        blocks.reduce((sum, block) => sum + block.duration, 0),
        0,
        600,
    );

    return {
        club_id: clubId,
        division_id: normalizeNullableText(plan.divisionId),
        title: normalizeText(plan.title, 'Plan de gimnasio'),
        objective: normalizeNullableText(plan.objective),
        notes: normalizeNullableText(plan.notes),
        duration_minutes: durationMinutes,
        plan_blocks: blocks,
    };
}

export async function getClubGymPlans(clubId: string): Promise<ClubGymPlan[]> {
    if (!clubId) {
        return [];
    }

    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('club_gym_plans')
        .select(SELECT_COLUMNS)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return ((data ?? []) as ClubGymPlanRow[]).map(mapRowToGymPlan);
}

export async function saveClubGymPlan(clubId: string, plan: ClubGymPlanInput): Promise<ClubGymPlan> {
    if (!clubId) {
        throw new Error('clubId required');
    }

    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('club_gym_plans')
        .insert(mapGymPlanToRow(clubId, plan))
        .select(SELECT_COLUMNS)
        .single();

    if (error) {
        throw error;
    }

    return mapRowToGymPlan(data as ClubGymPlanRow);
}
