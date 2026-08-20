import type { PlanBlock } from './trainings';

export interface ClubGymPlan {
    id: string;
    clubId: string;
    divisionId: string | null;
    title: string;
    objective: string | null;
    notes: string | null;
    durationMinutes: number;
    blocks: PlanBlock[];
    createdAt: string;
    updatedAt: string;
}

export interface ClubGymPlanInput {
    divisionId?: string | null;
    title: string;
    objective?: string | null;
    notes?: string | null;
    durationMinutes?: number;
    blocks: PlanBlock[];
}
