export type ClubPhysicalRecordCategory = 'weight' | 'test';

export interface ClubPhysicalRecord {
    id: string;
    clubId: string;
    personId: string;
    divisionId: string | null;
    category: ClubPhysicalRecordCategory;
    metricKey: string;
    metricLabel: string;
    valueNumeric: number;
    unit: string | null;
    recordedAt: string;
    source: string | null;
    notes: string | null;
    payload: Record<string, unknown>;
}

export interface ClubPhysicalRecordInput {
    personId: string;
    divisionId?: string | null;
    category: ClubPhysicalRecordCategory;
    metricKey: string;
    metricLabel: string;
    valueNumeric: number;
    unit?: string | null;
    recordedAt: string;
    source?: string | null;
    notes?: string | null;
    payload?: Record<string, unknown>;
}

export interface TestMetricOption {
    key: string;
    label: string;
    unit: string;
}

export const TEST_METRIC_OPTIONS: TestMetricOption[] = [
    { key: 'cmj', label: 'CMJ', unit: 'cm' },
    { key: 'sj', label: 'SJ', unit: 'cm' },
    { key: 'sprint_10m', label: 'Sprint 10 m', unit: 's' },
    { key: 'sprint_20m', label: 'Sprint 20 m', unit: 's' },
    { key: 'bronco', label: 'Bronco', unit: 's' },
    { key: 'yo_yo', label: 'Yo-Yo', unit: 'm' },
    { key: 'squat_estimated_1rm', label: 'Sentadilla estimada 1RM', unit: 'kg' },
    { key: 'bench_estimated_1rm', label: 'Press banca estimado 1RM', unit: 'kg' },
];

export const BODY_WEIGHT_METRIC_KEY = 'body_weight';
export const BODY_WEIGHT_METRIC_LABEL = 'Peso corporal';
export const BODY_WEIGHT_UNIT = 'kg';
