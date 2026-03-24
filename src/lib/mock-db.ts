import { isProd, USE_MOCK_DATA } from './mock-config';

export type UserRole = 'admin' | 'operator' | 'viewer';
export type ScopeType = 'union' | 'sport' | 'tournament' | 'match' | 'club';

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
    unionId: string | null;
    seasonId: string;
    name: string;
    slug: string;
    status: 'draft' | 'published';
    sport: string;
    category: string;
    format: string;
    country: string | null; // Added
    createdAt: string;
    isVisible?: boolean;
    folderId?: string;
}

export interface Folder {
    id: string;
    name: string;
    description?: string;
    color?: string;
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
    unionId: string | null;
    name: string;
    shortName: string;
    city: string;
    country: string | null; // Added
    logoUrl: string;
    primaryColor?: string;
    folderId?: string;
    isVisible?: boolean;
}

export interface ExternalTournament {
    id: string;
    name: string;
    sport: string;
    country?: string;
    seasonId?: string;
    source: 'API' | 'Manual';
    provider?: string;
    updatedAt: string;
    logoUrl?: string;
}

export interface ExternalClub {
    id: string;
    name: string;
    country?: string;
    logoUrl?: string;
    sports: string[];
    source: 'API' | 'Manual';
    provider?: string;
    updatedAt: string;
}

export interface ExternalPlayer {
    id: string;
    name: string;
    country?: string;
    teamId?: string;
    teamName?: string;
    sport?: string;
    isIndividual?: boolean;
    source: 'API' | 'Manual';
    provider?: string;
    updatedAt: string;
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

export interface TabSnapshot {
    entityType: 'tournament' | 'match';
    entityId: string;
    tab: string;
    payload: any;
    contentHash: string;
    sourceVersion?: string;
    lastFetchedAt: string;
    lastChangedAt: string;
    fetchStatus: 'ok' | 'error';
}

export interface NewsItem {
    id: string;
    title: string;
    summary?: string;
    content: string;
    imageUrl?: string;
    scope: 'global' | 'tournament' | 'club';
    scopeId?: string; // ID of the related entity
    authorId: string;
    status: 'draft' | 'published' | 'scheduled';
    publishedAt?: string;
    sport?: string;
    folderId?: string;
}

// Global Mock State Container
class MockDB {
    private static instance: MockDB;
    public users: User[] = [];
    public memberships: Membership[] = [];
    public unions: Union[] = [];
    public tournaments: Tournament[] = [];
    public clubs: Club[] = [];
    public externalTournaments: ExternalTournament[] = [];
    public externalClubs: ExternalClub[] = [];
    public externalPlayers: ExternalPlayer[] = [];
    private _extraMatches: Match[] = []; // manually added matches via POST
    public auditLogs: AuditLog[] = [];
    public folders: Folder[] = [];
    public phaseConfigurations: Record<string, PhaseConfiguration[]> = {};
    public disciplineIncidents: DisciplineIncident[] = [];
    public disciplineSanctions: DisciplineSanction[] = [];
    public regulations: Regulation[] = [];
    public tabSnapshots: TabSnapshot[] = [];
    public news: NewsItem[] = [];

    /** Matches are computed dynamically so timestamps stay fresh relative to Date.now() */
    public get matches(): Match[] {
        return [
            {
                id: 'm1',
                tournamentId: 'uar-top-12',
                roundId: 'F1',
                dateTime: new Date(Date.now() + 3600000).toISOString(),
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
                dateTime: new Date(Date.now() - 7200000).toISOString(),
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
                dateTime: new Date(Date.now() - 86400000).toISOString(),
                venue: 'Benavidez',
                homeClubId: 'newman',
                awayClubId: 'alumni',
                status: 'final',
                score: { home: 15, away: 22 },
                clock: { running: false, seconds: 4800, period: 'Final' },
                liveEnabled: true
            },
            {
                id: 'm4',
                tournamentId: 'uar-top-12',
                roundId: 'F1',
                dateTime: new Date(Date.now() + 7200000).toISOString(),
                venue: 'Villa de Mayo',
                homeClubId: 'cuba',
                awayClubId: 'newman',
                status: 'scheduled',
                score: { home: 0, away: 0 },
                clock: { running: false, seconds: 0, period: '1T' },
                liveEnabled: true
            },
            {
                id: 'm5',
                tournamentId: 'uar-top-12',
                roundId: 'F1',
                dateTime: new Date(Date.now() + 10800000).toISOString(),
                venue: 'Bella Vista',
                homeClubId: 'regatas',
                awayClubId: 'pucara',
                status: 'scheduled',
                score: { home: 0, away: 0 },
                clock: { running: false, seconds: 0, period: '1T' },
                liveEnabled: true
            },
            ...this._extraMatches
        ];
    }

    public set matches(value: Match[]) {
        // When external code sets matches, store only the non-seed entries.
        this._extraMatches = value.filter(m => !['m1', 'm2', 'm3'].includes(m.id));
    }

    /** Add a match to the extra (non-seed) list */
    public addMatch(match: Match) {
        this._extraMatches.push(match);
    }

    public upsertExternalTournament(payload: ExternalTournament) {
        const index = this.externalTournaments.findIndex(t => t.id === payload.id);
        if (index >= 0) {
            this.externalTournaments[index] = { ...this.externalTournaments[index], ...payload };
            return;
        }
        this.externalTournaments.push(payload);
    }

    public upsertExternalClub(payload: ExternalClub) {
        const index = this.externalClubs.findIndex(c => c.id === payload.id);
        if (index >= 0) {
            const existing = this.externalClubs[index];
            this.externalClubs[index] = {
                ...existing,
                ...payload,
                ...{ sports: Array.from(new Set([...(existing.sports || []), ...(payload.sports || [])])) }
            };
            return;
        }
        this.externalClubs.push(payload);
    }

    public upsertExternalPlayer(payload: ExternalPlayer) {
        const index = this.externalPlayers.findIndex(p => p.id === payload.id);
        if (index >= 0) {
            this.externalPlayers[index] = { ...this.externalPlayers[index], ...payload };
            return;
        }
        this.externalPlayers.push(payload);
    }

    private constructor() {
        if (USE_MOCK_DATA) {
            this.seed();
        } else if (!isProd) {
            console.warn('MockDB is disabled in this environment (NEXT_PUBLIC_USE_MOCK_DATA=false). Devuelve estructuras vacías.');
        }
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
            { userId: 'u1', scopeType: 'sport', scopeId: 'rugby', role: 'admin' },
            { userId: 'u1', scopeType: 'tournament', scopeId: 'uar-top-12', role: 'admin' },
            { userId: 'u2', scopeType: 'match', scopeId: 'm2', role: 'operator' },
            { userId: 'u2', scopeType: 'tournament', scopeId: 'uar-top-12', role: 'operator' },
            { userId: 'u3', scopeType: 'club', scopeId: 'sic', role: 'admin' }
        ];

        // Clubs
        this.clubs = [
            { id: 'sic', unionId: 'uar', name: 'San Isidro Club', shortName: 'SIC', city: 'San Isidro', country: 'Argentina', logoUrl: '🔵⚪', primaryColor: '#00ccff', isVisible: true, folderId: 'urba' },
            { id: 'casi', unionId: 'uar', name: 'Club Atlético San Isidro', shortName: 'CASI', city: 'San Isidro', country: 'Argentina', logoUrl: '⚪⚫', primaryColor: '#000000', isVisible: true, folderId: 'urba' },
            { id: 'hindu', unionId: 'uar', name: 'Hindu Club', shortName: 'HIN', city: 'Don Torcuato', country: 'Argentina', logoUrl: '🐘', primaryColor: '#fbbf24', isVisible: true, folderId: 'urba' },
            { id: 'belgrano', unionId: 'uar', name: 'Belgrano Athletic', shortName: 'BAC', city: 'CABA', country: 'Argentina', logoUrl: '🤎', primaryColor: '#78350f', isVisible: true, folderId: 'urba' },
            { id: 'alumni', unionId: 'uar', name: 'Alumni', shortName: 'ALU', city: 'Tortuguitas', country: 'Argentina', logoUrl: '🔴⚪', primaryColor: '#dc2626', isVisible: true, folderId: 'urba' },
            { id: 'newman', unionId: 'uar', name: 'Newman', shortName: 'NEW', city: 'Benavidez', country: 'Argentina', logoUrl: '🛑', primaryColor: '#b91c1c', isVisible: true, folderId: 'urba' },
            { id: 'cuba', unionId: 'uar', name: 'Club Universitario de Buenos Aires', shortName: 'CUBA', city: 'Villa de Mayo', country: 'Argentina', logoUrl: '🔵⚫', primaryColor: '#1e3a8a', isVisible: true, folderId: 'urba' },
            { id: 'regatas', unionId: 'uar', name: 'Regatas Bella Vista', shortName: 'REG', city: 'Bella Vista', country: 'Argentina', logoUrl: '🟡🔵', primaryColor: '#fbbf24', isVisible: true, folderId: 'urba' },
            { id: 'pucara', unionId: null, name: 'Club Pucara', shortName: 'PUC', city: 'Burzaco', country: 'Argentina', logoUrl: '🔴', primaryColor: '#b91c1c', isVisible: true, folderId: 'desarrollo' } // Intentionally unlinked for conflict demo
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
                country: 'Argentina',
                createdAt: new Date().toISOString(),
                isVisible: true,
                folderId: 'sudamerica'
            },
            {
                id: '1',
                unionId: 'uar',
                seasonId: '2026',
                name: 'Torneo Nacional de Clubes',
                slug: 'nacional-clubes',
                status: 'draft',
                sport: 'rugby',
                category: 'Primera',
                format: 'Knockout',
                country: 'Argentina',
                createdAt: new Date().toISOString(),
                isVisible: true,
                folderId: 'desarrollo'
            }
        ];

        // Unlinked external data for conflicts
        this.externalClubs = [
            { id: 'ext-pucara', name: 'Club Pucara', country: 'Argentina', sports: ['rugby'], source: 'API', provider: 'FlashScore', updatedAt: new Date().toISOString() },
            { id: 'ext-sic', name: 'San Isidro Club', country: 'Argentina', sports: ['rugby'], source: 'API', provider: 'FlashScore', updatedAt: new Date().toISOString() }
        ];

        // Matches are now computed dynamically via the getter above.
        // No static assignment needed — they refresh with Date.now() on each access.

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

        // Folders
        this.folders = [
            { id: 'urba', name: 'URBA', color: '#00ccff' },
            { id: 'sudamerica', name: 'Sudamérica', color: '#f59e0b' },
            { id: 'desarrollo', name: 'Desarrollo', color: '#10b981' }
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

        // News
        this.news = [
            {
                id: 'n1',
                title: 'Comunicado Oficial de Torneo',
                summary: 'Resolución sobre la fecha suspendida por clima.',
                content: 'Debido a las condiciones climáticas...',
                scope: 'global',
                imageUrl: 'https://placehold.co/600x400/10b981/ffffff?text=UAR',
                authorId: 'u1',
                status: 'published',
                publishedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
                sport: 'rugby'
            },
            {
                id: 'n2',
                title: 'Fixture Confirmado URBA Top 12',
                summary: 'Se definieron los cruces de la primera fase.',
                content: 'El fixture oficial ya está disponible...',
                scope: 'tournament',
                scopeId: 'uar-top-12',
                imageUrl: 'https://placehold.co/600x400/00ccff/ffffff?text=URBA',
                authorId: 'u2',
                status: 'published',
                publishedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
                sport: 'rugby',
                folderId: 'urba'
            },
            {
                id: 'n3',
                title: 'Anuncio de Club SIC',
                summary: 'Renovación de autoridades.',
                content: 'La comisión directiva informa...',
                scope: 'club',
                scopeId: 'sic',
                imageUrl: 'https://placehold.co/600x400/000000/ffffff?text=SIC',
                authorId: 'u3',
                status: 'draft',
                sport: 'rugby',
                folderId: 'urba'
            },
            {
                id: 'n4',
                title: 'Actualización Hockey',
                summary: 'Cambio de reglamento para 2026.',
                content: 'Nuevas reglas de corner corto...',
                scope: 'global',
                imageUrl: 'https://placehold.co/600x400/f59e0b/ffffff?text=HOCKEY',
                authorId: 'u1',
                status: 'published',
                publishedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
                sport: 'hockey'
            }
        ];
    }
}

export const db = MockDB.getInstance();
