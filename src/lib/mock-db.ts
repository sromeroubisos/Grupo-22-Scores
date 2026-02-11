export type UserRole = 'admin' | 'operator' | 'viewer';
export type ScopeType = 'union' | 'tournament' | 'club';

export interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
}

export interface Membership {
    userId: string;
    scopeType: ScopeType;
    scopeId: string;
    role: UserRole;
}

export interface Union {
    id: string;
    name: string;
    seasonIds: string[];
    branding: {
        primaryColor: string;
        logoUrl: string;
    };
    createdAt: string;
}

export interface Tournament {
    id: string;
    unionId: string;
    seasonId: string;
    name: string;
    slug: string; // Added slug
    status: 'draft' | 'published';
    sport: 'rugby' | 'football' | 'hockey';
    category: string;
    format: string;
    createdAt: string;
}

export interface Match {
    id: string;
    tournamentId: string;
    roundId: string;
    dateTime: string;
    venue: string;
    homeClubId: string;
    awayClubId: string;
    status: 'scheduled' | 'live' | 'final';
    score: {
        home: number;
        away: number;
    };
    clock: {
        running: boolean;
        seconds: number; // Seconds elapsed in current period
        period: string; // "1T", "2T", "PT"
    };
    liveEnabled: boolean;
}

export interface Club {
    id: string;
    unionId: string;
    name: string;
    shortName: string;
    city: string;
    logoUrl: string;
    primaryColor?: string;
}

export interface AuditLog {
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
}

export interface PhaseConfiguration {
    id: string;
    tournamentId: string;
    name: string;
    phaseType: string;
    config: any;
    selectedTeamIds: string[];
    fixtureData: any[];
    isFixtureGenerated: boolean;
    activeCriteria: any[];
    tags: any[];
    groupAssignments: Record<string, number>;
    status: 'draft' | 'published';
}

export interface DisciplineIncident {
    id: string;
    unionId: string;
    tournamentId: string;
    matchId: string;
    playerId: string;
    playerName: string;
    clubId: string;
    clubName: string;
    incidentType: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    status: 'pending' | 'review' | 'resolved';
    date: string;
}

export interface DisciplineSanction {
    id: string;
    incidentId: string;
    playerId: string;
    playerName: string;
    clubId: string;
    clubName: string;
    summary: string;
    weeks: number;
    startDate: string;
    endDate: string;
    status: 'active' | 'served' | 'appealed';
}

export interface Regulation {
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    content: string; // HTML content from mammoth
    updatedAt: string;
}

// Global Mock State Container
class MockDB {
    private static instance: MockDB;
    public users: User[] = [];
    public memberships: Membership[] = [];
    public unions: Union[] = [];
    public tournaments: Tournament[] = [];
    public clubs: Club[] = [];
    public matches: Match[] = [];
    public auditLogs: AuditLog[] = [];
    public phaseConfigurations: Record<string, PhaseConfiguration[]> = {};
    public disciplineIncidents: DisciplineIncident[] = [];
    public disciplineSanctions: DisciplineSanction[] = [];
    public regulations: Regulation[] = [];

    private constructor() {
        this.seed();
    }

    public static getInstance(): MockDB {
        if (!MockDB.instance) {
            MockDB.instance = new MockDB();
        }
        return MockDB.instance;
    }

    private seed() {
        // Users
        this.users = [
            { id: 'u1', name: 'Super Admin', email: 'admin@g22.com', avatarUrl: 'https://ui-avatars.com/api/?name=SA' },
            { id: 'u2', name: 'Operador Torneo', email: 'op@g22.com', avatarUrl: 'https://ui-avatars.com/api/?name=OP' },
            { id: 'u3', name: 'Delegado Club', email: 'club@sic.com.ar', avatarUrl: 'https://ui-avatars.com/api/?name=SIC' }
        ];

        // Unions
        this.unions = [
            {
                id: 'uar',
                name: 'Unión Argentina de Rugby',
                seasonIds: ['2026', '2025'],
                branding: { primaryColor: '#00a365', logoUrl: '/logos/uar.png' },
                createdAt: new Date().toISOString()
            }
        ];

        // Memberships
        this.memberships = [
            { userId: 'u1', scopeType: 'union', scopeId: 'uar', role: 'admin' },
            { userId: 'u1', scopeType: 'tournament', scopeId: 'uar-top-12', role: 'admin' },
            { userId: 'u2', scopeType: 'tournament', scopeId: 'uar-top-12', role: 'operator' },
            { userId: 'u3', scopeType: 'club', scopeId: 'sic', role: 'admin' }
        ];

        // Clubs
        this.clubs = [
            { id: 'sic', unionId: 'uar', name: 'San Isidro Club', shortName: 'SIC', city: 'San Isidro', logoUrl: '🔵⚪', primaryColor: '#00ccff' },
            { id: 'casi', unionId: 'uar', name: 'Club Atlético San Isidro', shortName: 'CASI', city: 'San Isidro', logoUrl: '⚪⚫', primaryColor: '#000000' },
            { id: 'hindu', unionId: 'uar', name: 'Hindu Club', shortName: 'HIN', city: 'Don Torcuato', logoUrl: '🐘', primaryColor: '#fbbf24' },
            { id: 'belgrano', unionId: 'uar', name: 'Belgrano Athletic', shortName: 'BAC', city: 'CABA', logoUrl: '🤎', primaryColor: '#78350f' },
            { id: 'alumni', unionId: 'uar', name: 'Alumni', shortName: 'ALU', city: 'Tortuguitas', logoUrl: '🔴⚪', primaryColor: '#dc2626' },
            { id: 'newman', unionId: 'uar', name: 'Newman', shortName: 'NEW', city: 'Benavidez', logoUrl: '🛑', primaryColor: '#b91c1c' },
        ];

        // Tournaments
        this.tournaments = [
            {
                id: 'uar-top-12',
                unionId: 'uar',
                seasonId: '2026',
                name: 'URBA Top 12 Copa Star+',
                slug: 'uar-top-12',
                status: 'published',
                sport: 'rugby',
                category: 'Primera',
                format: 'League + Playoffs',
                createdAt: new Date().toISOString()
            },
            {
                id: '1',
                unionId: 'uar',
                seasonId: '2026',
                name: 'Torneo Demo',
                slug: 'torneo-demo',
                status: 'draft',
                sport: 'rugby',
                category: 'Primera',
                format: 'League + Playoffs',
                createdAt: new Date().toISOString()
            }
        ];

        // Matches
        this.matches = [
            {
                id: 'm1',
                tournamentId: 'uar-top-12',
                roundId: 'F1',
                dateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
                venue: 'Catedral del Rugby',
                homeClubId: 'casi',
                awayClubId: 'sic',
                status: 'scheduled',
                score: { home: 0, away: 0 },
                clock: { running: false, seconds: 0, period: '1T' },
                liveEnabled: true
            },
            {
                id: 'm2',
                tournamentId: 'uar-top-12',
                roundId: 'F1',
                dateTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
                venue: 'Don Torcuato',
                homeClubId: 'hindu',
                awayClubId: 'belgrano',
                status: 'live',
                score: { home: 24, away: 17 },
                clock: { running: true, seconds: 2400, period: '2T' },
                liveEnabled: true
            },
            {
                id: 'm3',
                tournamentId: 'uar-top-12',
                roundId: 'F1',
                dateTime: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                venue: 'Benavidez',
                homeClubId: 'newman',
                awayClubId: 'alumni',
                status: 'final',
                score: { home: 15, away: 22 },
                clock: { running: false, seconds: 4800, period: 'Final' },
                liveEnabled: true
            }
        ];

        // Discipline Incidents
        this.disciplineIncidents = [
            {
                id: 'DIS-9021',
                unionId: 'uar',
                tournamentId: 'uar-top-12',
                matchId: 'm2',
                playerId: 'p1',
                playerName: 'R. Dupont',
                clubId: 'dogos',
                clubName: 'Dogos XV',
                incidentType: 'Tarjeta Roja Directa',
                description: 'Tackle alto (Regla 9.13)',
                severity: 'high',
                status: 'review',
                date: '2023-10-24'
            },
            {
                id: 'DIS-8992',
                unionId: 'uar',
                tournamentId: 'uar-top-12',
                matchId: 'm1',
                playerId: 'p2',
                playerName: 'J. Montoya',
                clubId: 'pampas',
                clubName: 'Pampas',
                incidentType: 'Doble Amarilla',
                description: 'Infracciones técnicas',
                severity: 'medium',
                status: 'resolved',
                date: '2023-10-22'
            },
            {
                id: 'ADM-441',
                unionId: 'uar',
                tournamentId: 'uar-tdi-a',
                matchId: 'm3',
                playerId: 'p3',
                playerName: "C. O'Connor",
                clubId: 'selknam',
                clubName: 'Selknam',
                incidentType: 'Conducta Abusiva',
                description: 'Reporte de Comisario',
                severity: 'medium',
                status: 'pending',
                date: '2023-10-21'
            }
        ];

        // Discipline Sanctions
        this.disciplineSanctions = [
            {
                id: 'SANC-001',
                incidentId: 'DIS-8992',
                playerId: 'p2',
                playerName: 'J. Montoya',
                clubId: 'pampas',
                clubName: 'Pampas',
                summary: '1 semana de suspensión',
                weeks: 1,
                startDate: '2023-10-23',
                endDate: '2023-10-30',
                status: 'active'
            }
        ];
    }
}

export const db = MockDB.getInstance();
