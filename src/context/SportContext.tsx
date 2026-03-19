'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import type { Sport, SportId } from '@/lib/types';
import { SPORTS, getSportById } from '@/lib/data/sports';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { getFavoriteSports } from '@/lib/services/preferencesService';

interface SportContextType {
    selectedSport: Sport;
    activeSports: Sport[]; // List of currently visible and ordered sports
    setSelectedSport: (sport: Sport) => void;
    selectSportById: (id: SportId) => void;
    isLoading: boolean;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export function SportProvider({ children }: { children: ReactNode }) {
    const supabase = createClient();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [allSports, setAllSports] = useState<Sport[]>([]);
    const [selectedSport, setSelectedSport] = useState<Sport>(
        Object.values(SPORTS)[0] as Sport
    );
    const hasAutoSelectedRef = useRef<string | null>(null);

    // Filter visible sports and sort by display order.
    // Sports with a groupKey (e.g. rugby-union, rugby-league) are managed
    // under their parent (e.g. rugby) and must not appear as separate entries.
    const activeSports = allSports.filter(s => s.isVisible !== false && !s.groupKey);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const { data: configs } = await supabase
                    .from('sports')
                    .select('*')
                    .order('display_order', { ascending: true }) as any;

                const staticList = Object.values(SPORTS) as Sport[];
                const merged = staticList.map(sport => {
                    const config = configs?.find((c: any) => c.id === sport.id);
                    return {
                        ...sport,
                        isVisible: config ? config.is_visible : sport.isActive,
                        displayOrder: config ? config.display_order : sport.priority
                    };
                }).sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

                setAllSports(merged);
                
                // If current selected sport is now hidden, select first visible
                const currentIsHidden = merged.find(s => s.id === selectedSport.id)?.isVisible === false;
                if (currentIsHidden) {
                    const firstVisible = merged.find(s => s.isVisible !== false);
                    if (firstVisible) setSelectedSport(firstVisible);
                }
            } catch (err) {
                console.error('Error loading sports config:', err);
                setAllSports(Object.values(SPORTS) as Sport[]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchConfig();
    }, []);

    useEffect(() => {
        if (!user || allSports.length === 0) return;
        if (hasAutoSelectedRef.current === user.id) return;
        hasAutoSelectedRef.current = user.id;

        getFavoriteSports(supabase, user.id).then(favoriteIds => {
            if (favoriteIds.length === 0) return;
            const favSport = favoriteIds
                .map(id => allSports.find(s => s.id === id))
                .find(s => s && s.isVisible !== false && !s.groupKey);
            if (favSport) setSelectedSport(favSport);
        }).catch(() => {});
    }, [user?.id, allSports.length]);

    const selectSportById = (id: SportId) => {
        const sport = getSportById(id);
        if (sport) {
            setSelectedSport(sport);
        }
    };

    return (
        <SportContext.Provider value={{ 
            selectedSport, 
            activeSports, 
            setSelectedSport, 
            selectSportById,
            isLoading 
        }}>
            {children}
        </SportContext.Provider>
    );
}

export function useSport() {
    const context = useContext(SportContext);
    if (context === undefined) {
        throw new Error('useSport must be used within a SportProvider');
    }
    return context;
}
