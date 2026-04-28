import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';
import type { ClubDashboardOverview } from './dashboard-types';

export type TrainingStatus = 'planificado' | 'en_curso' | 'finalizado' | 'sin_evaluar';
export type TrainingType = 'campo' | 'gimnasio' | 'video' | 'recuperacion';
export type AttendanceState = 'confirmado' | 'ausente' | 'dudoso';
export type PlanBlockType = 'warmup' | 'tecnico' | 'tactico' | 'fisico' | 'cierre';

export interface PlanBlock {
    id: string;
    type: PlanBlockType;
    title: string;
    duration: number;
    notes: string;
    intensity?: string;
}

export interface TrainingPlan {
    blocks: PlanBlock[];
}

export interface TrainingEvaluation {
    rpe: number;
    durationReal: number;
    loadTotal: number;
    notes: string;
    energy: number;
    fatigue: number;
    injuries: string;
}

export interface TrainingPlayer {
    id: string;
    name: string;
    pos: string;
    divisionId: string | null;
    divisionName: string | null;
}

export interface TrainingEntry {
    id: string;
    persistedId?: string | null;
    sourceKey?: string | null;
    sourceKind?: string | null;
    divisionId?: string | null;
    title: string;
    date: string;
    duration: number;
    type: TrainingType;
    location: string;
    status: TrainingStatus;
    objective: string;
    staff: string[];
    convocados: number;
    players?: TrainingPlayer[];
    sourceLabel?: string | null;
    sourceMatchId?: string | null;
    plan?: TrainingPlan;
    evaluation?: TrainingEvaluation;
    attendance?: Record<string, AttendanceState>;
}

interface BuildClubTrainingEntriesArgs {
    dashboard: ClubDashboardOverview;
    divisions: Division[];
    players: PersonWithRole[];
    staff: PersonWithRole[];
}

// Compatibility shim for stale dev bundles: trainings must come only from
// persisted sources, never synthesized from dashboard data.
export function buildClubTrainingEntries(args: BuildClubTrainingEntriesArgs): TrainingEntry[] {
    void args;
    return [];
}
