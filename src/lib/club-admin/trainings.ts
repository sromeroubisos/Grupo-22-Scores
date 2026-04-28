import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';
import type { ClubDashboardOverview } from './dashboard-types';

export type TrainingStatus = 'planificado' | 'en_curso' | 'finalizado' | 'sin_evaluar';
export type TrainingType = 'campo' | 'gimnasio' | 'video' | 'recuperacion';
export type AttendanceState = 'presente' | 'ausente' | 'tarde' | 'lesionado' | 'justificado' | 'confirmado' | 'dudoso';
export type PlanBlockType = 'warmup' | 'tecnico' | 'tactico' | 'fisico' | 'cierre';
export type TrainingExerciseResult = 'correcto' | 'parcial' | 'no_logrado';
export type TrainingTechnicalEventType = 'patadas' | 'jugadas' | 'scrums' | 'lines' | 'secuencias';

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

export interface TrainingExerciseEvaluation {
    blockId: string;
    result: TrainingExerciseResult;
    score: number;
    comments: string;
}

export interface TrainingTechnicalEvent {
    id: string;
    type: TrainingTechnicalEventType;
    name: string;
    total: number;
    successful: number;
    failed: number;
    lostBalls: number;
    errors: number;
    zone: string;
    target: string;
    failureReason: string;
    notes: string;
}

export interface TrainingEvaluation {
    rpe: number;
    durationReal: number;
    loadTotal: number;
    notes: string;
    energy: number;
    fatigue: number;
    injuries: string;
    exerciseScores?: TrainingExerciseEvaluation[];
    technicalEvents?: TrainingTechnicalEvent[];
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
