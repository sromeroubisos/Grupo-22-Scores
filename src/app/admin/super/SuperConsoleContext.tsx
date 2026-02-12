'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

export type SuperConsoleFilters = {
    sport: string;
    search: string;
    country: string;
    status: string;
    source: string;
};

const defaultFilters: SuperConsoleFilters = {
    sport: 'all',
    search: '',
    country: 'all',
    status: 'all',
    source: 'all'
};

type SuperConsoleContextValue = {
    filters: SuperConsoleFilters;
    setFilters: React.Dispatch<React.SetStateAction<SuperConsoleFilters>>;
};

const SuperConsoleContext = createContext<SuperConsoleContextValue | undefined>(undefined);

export function SuperConsoleProvider({ children }: { children: React.ReactNode }) {
    const [filters, setFilters] = useState<SuperConsoleFilters>(defaultFilters);
    const value = useMemo(() => ({ filters, setFilters }), [filters]);

    return <SuperConsoleContext.Provider value={value}>{children}</SuperConsoleContext.Provider>;
}

export function useSuperConsole() {
    const context = useContext(SuperConsoleContext);
    if (!context) {
        throw new Error('useSuperConsole must be used within SuperConsoleProvider');
    }
    return context;
}
