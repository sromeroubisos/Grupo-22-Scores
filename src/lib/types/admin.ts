// ===== UNION & FEDERATION TYPES =====
export

    type UnionLevel = 'national' | 'regional' | 'sub_union';
export type UnionStatus = 'active' | 'archived';

export interface Union {
    id: string;
    name: string;
    nameEs?: string;
    countryId: string;
    sportId: string; // Imported from Sport types
    level?: UnionLevel;
    parentUnionId?: string | null; // For sub-unions
    status: UnionStatus;
    logoUrl?: string | null;
    primaryColor?: string;
    foundedYear?: number;
    website?: string;
    createdAt: string;
    updatedAt: string;
}

// ===== CLUB-UNION RELATIONSHIPS =====
export interface ClubUnionMembership {
    id: string;
    clubId: string;
    unionId: string;
    isPrimary: boolean; // Primary union for this club
    fromDate?: string;
    toDate?: string | null; // null = currently active
    status: 'active' | 'inactive';
    createdAt: string;
}

// ===== PROVIDER/API CATALOG TYPES =====
export type ProviderEntityType = 'club' | 'tournament' | 'player' | 'match';
export type ProviderEntityStatus = 'unlinked' | 'linked' | 'conflict' | 'ignored';
export type DataSource = 'api' | 'manual' | 'mixed';

export interface ProviderEntity {
    id: string;
    provider: string; // e.g., 'flashscore', 'sofascore'
    entityType: ProviderEntityType;
    externalId: string; // ID from the external provider
    internalId?: string | null; // Linked to our internal entity
    sportId: string;
    countryId?: string;
    rawPayload: Record<string, any>; // Original JSON from API
    lastSeenAt: string;
    status: ProviderEntityStatus;
    confidence?: number; // 0-1 confidence score for auto-linking
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

// ===== EXTENDED TOURNAMENT TYPE =====
// Extends the existing Tournament interface with nullable unionId
export interface TournamentExtended {
    id: string;
    name: string;
    nameEs?: string;
    url: string;
    type: string;
    format?: string;
    sportId: string;
    countryId: string;
    priority: number;
    logoUrl?: string | null;

    // NEW: nullable union reference
    unionId?: string | null;

    // Data source tracking
    source: DataSource;
    providerId?: string | null; // Reference to ProviderEntity if from API

    // Status
    status: 'active' | 'draft' | 'archived';

    categories: string[];
    seasons?: any[];
    isWomen?: boolean;
    isYouth?: boolean;
    ageGroup?: string;

    createdAt: string;
    updatedAt: string;
}

// ===== EXTENDED CLUB TYPE =====
export interface ClubExtended {
    id: string;
    name: string;
    shortName?: string;
    logoUrl?: string | null;
    countryId: string;
    sportId: string;

    // Multiple union memberships via ClubUnionMembership
    // Primary union can be determined by isPrimary flag

    // Data source tracking
    source: DataSource;
    providerId?: string | null;

    foundedYear?: number;
    stadium?: string;
    city?: string;
    colors?: string[];
    status: 'active' | 'archived';

    createdAt: string;
    updatedAt: string;
}

// ===== EXTENDED PLAYER TYPE =====
export interface PlayerExtended {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    nationality: string;
    dateOfBirth?: string;
    position?: string;
    teamId?: string;
    number?: number;
    photoUrl?: string | null;

    // Data source tracking
    source: DataSource;
    providerId?: string | null;

    status: 'active' | 'retired' | 'archived';

    createdAt: string;
    updatedAt: string;
}
