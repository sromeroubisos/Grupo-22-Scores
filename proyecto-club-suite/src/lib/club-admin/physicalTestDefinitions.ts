export type ClubPhysicalTestBetterValueDirection = 'higher' | 'lower';

export interface ClubPhysicalTestDefinition {
    id: string;
    clubId: string;
    divisionId: string | null;
    metricKey: string;
    label: string;
    unit: string | null;
    betterValueDirection: ClubPhysicalTestBetterValueDirection;
    notes: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ClubPhysicalTestDefinitionInput {
    divisionId?: string | null;
    metricKey: string;
    label: string;
    unit?: string | null;
    betterValueDirection?: ClubPhysicalTestBetterValueDirection;
    notes?: string | null;
    isActive?: boolean;
}

export const TEST_DIRECTION_OPTIONS: Array<{
    value: ClubPhysicalTestBetterValueDirection;
    label: string;
}> = [
    { value: 'higher', label: 'Mas alto es mejor' },
    { value: 'lower', label: 'Mas bajo es mejor' },
];
