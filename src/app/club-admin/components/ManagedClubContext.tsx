'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const STORAGE_KEY = 'g22.clubAdmin.activeClubId';

export interface ManagedClubOption {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    familyRootId: string;
    familyRootName: string | null;
    accessRole: string;
    managementType: 'club' | 'club_family';
    accessSource: 'direct' | 'family';
    isDirect: boolean;
}

interface ManagedClubContextValue {
    clubs: ManagedClubOption[];
    activeClubId: string | null;
    activeClub: ManagedClubOption | null;
    loading: boolean;
    error: string | null;
    setActiveClubId: (clubId: string) => void;
    reload: () => Promise<void>;
}

interface RouteResponse {
    ok?: boolean;
    data?: {
        clubs: ManagedClubOption[];
        defaultClubId: string | null;
    };
    error?: string;
}

const ManagedClubContext = createContext<ManagedClubContextValue | undefined>(undefined);

function getStoredClubId() {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
}

function persistClubId(clubId: string | null) {
    if (typeof window === 'undefined') return;
    if (clubId) {
        window.localStorage.setItem(STORAGE_KEY, clubId);
        return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
}

export function ManagedClubProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [clubs, setClubs] = useState<ManagedClubOption[]>([]);
    const [defaultClubId, setDefaultClubId] = useState<string | null>(null);
    const [activeClubIdState, setActiveClubIdState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const syncUrl = useCallback((clubId: string | null) => {
        if (!pathname) return;

        const params = new URLSearchParams(searchParams.toString());
        if (clubId) {
            params.set('club', clubId);
        } else {
            params.delete('club');
        }

        const query = params.toString();
        const target = query ? `${pathname}?${query}` : pathname;
        router.replace(target);
    }, [pathname, router, searchParams]);

    const applyActiveClubId = useCallback((clubId: string | null, options?: { updateUrl?: boolean }) => {
        setActiveClubIdState(clubId);
        persistClubId(clubId);
        if (options?.updateUrl !== false) {
            syncUrl(clubId);
        }
    }, [syncUrl]);

    const reload = useCallback(async () => {
        if (!isAuthenticated || !user) {
            setClubs([]);
            setDefaultClubId(null);
            setActiveClubIdState(null);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/club-admin/context', {
                cache: 'no-store',
                credentials: 'same-origin',
            });
            const payload = await response.json() as RouteResponse;

            if (!response.ok || !payload.ok || !payload.data) {
                throw new Error(payload.error || 'No se pudo resolver la familia de clubes');
            }

            setClubs(payload.data.clubs || []);
            setDefaultClubId(payload.data.defaultClubId || null);
        } catch (nextError) {
            const message = nextError instanceof Error ? nextError.message : 'No se pudo resolver la familia de clubes';
            setError(message);
            setClubs([]);
            setDefaultClubId(null);
            setActiveClubIdState(null);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, user]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (loading) return;

        const validClubIds = new Set(clubs.map((club) => club.id));
        const requestedClubId = searchParams.get('club');
        const storedClubId = getStoredClubId();

        const nextClubId =
            (requestedClubId && validClubIds.has(requestedClubId) ? requestedClubId : null) ||
            (activeClubIdState && validClubIds.has(activeClubIdState) ? activeClubIdState : null) ||
            (storedClubId && validClubIds.has(storedClubId) ? storedClubId : null) ||
            (defaultClubId && validClubIds.has(defaultClubId) ? defaultClubId : null) ||
            clubs[0]?.id ||
            null;

        if (nextClubId !== activeClubIdState) {
            applyActiveClubId(nextClubId, { updateUrl: requestedClubId !== nextClubId });
            return;
        }

        if (requestedClubId !== nextClubId) {
            syncUrl(nextClubId);
        }
    }, [
        activeClubIdState,
        applyActiveClubId,
        clubs,
        defaultClubId,
        loading,
        searchParams,
        syncUrl,
    ]);

    const setActiveClubId = useCallback((clubId: string) => {
        if (!clubs.some((club) => club.id === clubId)) return;
        applyActiveClubId(clubId);
    }, [applyActiveClubId, clubs]);

    const activeClub = useMemo(
        () => clubs.find((club) => club.id === activeClubIdState) || null,
        [activeClubIdState, clubs]
    );

    const value = useMemo<ManagedClubContextValue>(() => ({
        clubs,
        activeClubId: activeClubIdState,
        activeClub,
        loading,
        error,
        setActiveClubId,
        reload,
    }), [activeClub, activeClubIdState, clubs, error, loading, reload, setActiveClubId]);

    return (
        <ManagedClubContext.Provider value={value}>
            {children}
        </ManagedClubContext.Provider>
    );
}

export function useManagedClubContext() {
    const context = useContext(ManagedClubContext);
    if (!context) {
        throw new Error('useManagedClubContext must be used within ManagedClubProvider');
    }

    return context;
}
