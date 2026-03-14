'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
    fetchTournaments,
    fetchClubs,
    fetchUnions,
    fetchMatches,
    fetchNews,
    fetchDisciplineIncidents,
    fetchDisciplineSanctions,
    fetchRegulations,
    TournamentRow,
    ClubRow,
    UnionRow,
    MatchRow,
    NewsRow,
    IncidentRow,
    SanctionRow,
    RegulationRow
} from '@/lib/cache/superAdminCache';
import { normalizeError } from '@/lib/utils/errorUtils';

interface AdminContextType {
    tournaments: TournamentRow[];
    clubs: ClubRow[];
    unions: UnionRow[];
    matches: MatchRow[];
    news: NewsRow[];
    disciplineIncidents: IncidentRow[];
    disciplineSanctions: SanctionRow[];
    regulations: RegulationRow[];
    loading: {
        all: boolean;
        tournaments: boolean;
        clubs: boolean;
        unions: boolean;
        matches: boolean;
        news: boolean;
        discipline: boolean;
        regulations: boolean;
    };
    errors: {
        tournaments: string | null;
        clubs: string | null;
        unions: string | null;
        matches: string | null;
        news: string | null;
        disciplineIncidents: string | null;
        disciplineSanctions: string | null;
        regulations: string | null;
    };
    refresh: () => void;
    refreshEntity: (entity: keyof AdminContextType['errors']) => Promise<void>;
}

const AdminConsoleContext = createContext<AdminContextType | undefined>(undefined);

export function AdminConsoleProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
    const [clubs, setClubs] = useState<ClubRow[]>([]);
    const [unions, setUnions] = useState<UnionRow[]>([]);
    const [matches, setMatches] = useState<MatchRow[]>([]);
    const [news, setNews] = useState<NewsRow[]>([]);
    const [disciplineIncidents, setDisciplineIncidents] = useState<IncidentRow[]>([]);
    const [disciplineSanctions, setDisciplineSanctions] = useState<SanctionRow[]>([]);
    const [regulations, setRegulations] = useState<RegulationRow[]>([]);

    const [loading, setLoading] = useState({
        all: false,
        tournaments: false,
        clubs: false,
        unions: false,
        matches: false,
        news: false,
        discipline: false,
        regulations: false,
    });

    const [errors, setErrors] = useState<AdminContextType['errors']>({
        tournaments: null,
        clubs: null,
        unions: null,
        matches: null,
        news: null,
        disciplineIncidents: null,
        disciplineSanctions: null,
        regulations: null,
    });

    const prefetched = useRef(false);

    const loadEntity = useCallback(async <T,>(
        key: keyof AdminContextType['errors'],
        fetcher: (force: boolean) => Promise<T>,
        setter: (data: T) => void,
        force = false,
        loadingKey?: keyof AdminContextType['loading']
    ) => {
        const lKey = loadingKey || (key as keyof AdminContextType['loading']);
        setLoading(prev => ({ ...prev, [lKey]: true }));
        setErrors(prev => ({ ...prev, [key]: null }));

        try {
            const data = await fetcher(force);
            setter(data);
            setLoading(prev => ({ ...prev, [lKey]: false }));
            setErrors(prev => ({ ...prev, [key]: null }));
        } catch (err: any) {
            const normalized = normalizeError(err);
            console.error(`[AdminContext] Failed to load ${key}:`, {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: normalized.raw
            });

            setErrors(prev => ({ ...prev, [key]: normalized.message }));
            setLoading(prev => ({ ...prev, [lKey]: false }));
        }
    }, []);

    const loadAll = useCallback((force = false) => {
        // Wait for both auth status to be settled AND user to be available
        if (!isAuthenticated || !user) return;

        // Entidades cargan de forma independiente para no bloquear el panel global
        // We no longer wrap this in an awaited Promise.allSettled
        loadEntity('tournaments', fetchTournaments, setTournaments, force);
        loadEntity('clubs', fetchClubs, setClubs, force);
        loadEntity('unions', fetchUnions, setUnions, force);
        loadEntity('matches', fetchMatches, setMatches, force);
        loadEntity('news', fetchNews, setNews, force);
        loadEntity('disciplineIncidents', fetchDisciplineIncidents, setDisciplineIncidents, force, 'discipline');
        loadEntity('disciplineSanctions', fetchDisciplineSanctions, setDisciplineSanctions, force, 'discipline');
        loadEntity('regulations', fetchRegulations, setRegulations, force, 'regulations');

        // Disable global loading state immediately to avoid blocking UI entirely
        setLoading(prev => ({ ...prev, all: false }));
    }, [isAuthenticated, user, loadEntity]);

    const refresh = useCallback(() => {
        loadAll(true);
    }, [loadAll]);

    const refreshEntity = useCallback(async (entity: keyof AdminContextType['errors']) => {
        switch (entity) {
            case 'tournaments': await loadEntity('tournaments', fetchTournaments, setTournaments, true); break;
            case 'clubs': await loadEntity('clubs', fetchClubs, setClubs, true); break;
            case 'unions': await loadEntity('unions', fetchUnions, setUnions, true); break;
            case 'matches': await loadEntity('matches', fetchMatches, setMatches, true); break;
            case 'news': await loadEntity('news', fetchNews, setNews, true); break;
            case 'disciplineIncidents': await loadEntity('disciplineIncidents', fetchDisciplineIncidents, setDisciplineIncidents, true, 'discipline'); break;
            case 'disciplineSanctions': await loadEntity('disciplineSanctions', fetchDisciplineSanctions, setDisciplineSanctions, true, 'discipline'); break;
            case 'regulations': await loadEntity('regulations', fetchRegulations, setRegulations, true, 'regulations'); break;
        }
    }, [loadEntity]);

    useEffect(() => {
        if (isAuthenticated && !authLoading && user && !prefetched.current) {
            prefetched.current = true;
            loadAll();
        }
    }, [isAuthenticated, authLoading, user, loadAll]);

    return (
        <AdminConsoleContext.Provider value={{
            tournaments,
            clubs,
            unions,
            matches,
            news,
            disciplineIncidents,
            disciplineSanctions,
            regulations,
            loading,
            errors,
            refresh,
            refreshEntity
        }}>
            {children}
        </AdminConsoleContext.Provider>
    );
}

export function useAdminConsole() {
    const context = useContext(AdminConsoleContext);
    if (context === undefined) {
        throw new Error('useAdminConsole must be used within an AdminConsoleProvider');
    }
    return context;
}
