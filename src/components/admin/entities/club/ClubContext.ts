'use client';

import { createContext, useContext } from 'react';

interface ClubContextType {
    isDirty: boolean;
    setDirty: (dirty: boolean) => void;
}

export const ClubContext = createContext<ClubContextType>({
    isDirty: false,
    setDirty: () => { },
});

export const useClubContext = () => useContext(ClubContext);
