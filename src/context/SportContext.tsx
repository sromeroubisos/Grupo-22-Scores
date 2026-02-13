'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import type { Sport, SportId } from '@/lib/types';
import { getActiveSports, getSportById } from '@/lib/data/sports';

interface SportContextType {
    selectedSport: Sport;
    setSelectedSport: (sport: Sport) => void;
    selectSportById: (id: SportId) => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export function SportProvider({ children }: { children: ReactNode }) {
    const activeSports = getActiveSports();
    const [selectedSport, setSelectedSport] = useState<Sport>(
        activeSports.find(s => s.id === 'rugby') || activeSports[0]
    );

    const selectSportById = (id: SportId) => {
        const sport = getSportById(id);
        if (sport) {
            setSelectedSport(sport);
        }
    };

    return (
        <SportContext.Provider value={{ selectedSport, setSelectedSport, selectSportById }}>
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
