'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getActiveSports } from '@/lib/data/sports';

interface DisciplinasContextType {
    clubSports: string[];
    addClubSport: (sportId: string) => void;
    removeClubSport: (sportId: string) => void;
    isSportActive: (sportId: string) => boolean;
}

const DisciplinasContext = createContext<DisciplinasContextType | undefined>(undefined);

export function DisciplinasProvider({ children }: { children: React.ReactNode }) {
    // Initial state with Rugby as it's the core of the current demo
    const [clubSports, setClubSports] = useState<string[]>(['rugby']);

    const addClubSport = (sportId: string) => {
        setClubSports((prev) => {
            if (prev.includes(sportId)) return prev;
            return [...prev, sportId];
        });
    };

    const removeClubSport = (sportId: string) => {
        setClubSports((prev) => prev.filter((id) => id !== sportId));
    };

    const isSportActive = (sportId: string) => {
        return clubSports.includes(sportId);
    };

    return (
        <DisciplinasContext.Provider value={{ clubSports, addClubSport, removeClubSport, isSportActive }}>
            {children}
        </DisciplinasContext.Provider>
    );
}

export function useDisciplinas() {
    const context = useContext(DisciplinasContext);
    if (context === undefined) {
        throw new Error('useDisciplinas must be used within a DisciplinasProvider');
    }
    return context;
}
