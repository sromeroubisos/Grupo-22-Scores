'use client';
import { createContext, useContext } from 'react';

export interface TournamentDirtyCtxType {
    isDirty: boolean;
    setDirty: (v: boolean) => void;
}

export const TournamentDirtyCtx = createContext<TournamentDirtyCtxType>({
    isDirty: false,
    setDirty: () => {},
});

export function useTournamentDirty() {
    return useContext(TournamentDirtyCtx);
}
